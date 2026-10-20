import { prisma, MessageDirection, MessageSender, MessageFormat, MessageDeliveryStatus } from '@crm/database';
import { addMessageToDebounceBuffer } from '../../queues/debounce.queue';
import { emitNewMessage, emitConnectionState } from '../../lib/socket';
import { analyzeReceiptImage } from '../../lib/gemini';
import { uploadMedia } from '../../lib/storage';

export interface InboundMessagePayload {
  tenantId: string;
  senderPhone: string;
  senderName?: string;
  format: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT';
  text?: string;
  mediaBuffer?: Buffer;
  mediaUrl?: string;
  mediaMimeType?: string;
  whatsappMessageId?: string;
  senderJid?: string;
}

export async function handleInboundMessage(payload: InboundMessagePayload) {
  const { tenantId, senderPhone, senderJid, senderName, format, text, mediaBuffer, mediaMimeType, whatsappMessageId } = payload;
  const cleanPhone = senderPhone.replace(/[^0-9]/g, '');

  // 1. Obtener o crear Contacto
  let contact = await prisma.contact.findUnique({
    where: {
      tenantId_phoneNumber: {
        tenantId,
        phoneNumber: cleanPhone,
      },
    },
  });

  const existingCustomFields = (contact?.customFields as Record<string, any>) || {};
  const updatedCustomFields = senderJid ? { ...existingCustomFields, jid: senderJid } : existingCustomFields;

  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        tenantId,
        phoneNumber: cleanPhone,
        name: senderName || `WhatsApp ${cleanPhone.slice(-4)}`,
        customFields: updatedCustomFields,
      },
    });
  } else {
    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: {
        ...(senderName && contact.name?.startsWith('WhatsApp ') ? { name: senderName } : {}),
        customFields: updatedCustomFields,
      },
    });
  }

  // 2. Obtener o crear Conversación
  let conversation = await prisma.conversation.findFirst({
    where: {
      tenantId,
      contactId: contact.id,
      status: { not: 'CLOSED' },
    },
    include: {
      tenant: {
        include: { botConfig: true },
      },
    },
  });

  if (!conversation) {
    // Asignar etapa inicial de ventas (NEW_LEAD)
    const initialStage = await prisma.crmStage.findFirst({
      where: { pipeline: { tenantId }, stageKey: 'NEW_LEAD' },
    });

    conversation = await prisma.conversation.create({
      data: {
        tenantId,
        contactId: contact.id,
        stageId: initialStage?.id,
        status: 'BOT_ACTIVE',
        lastMessageText: text || `[${format}]`,
        lastMessageAt: new Date(),
        unreadCount: 1,
      },
      include: {
        tenant: {
          include: { botConfig: true },
        },
      },
    });
  } else {
    // Incrementar contador de no leídos y actualizar último mensaje
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageText: text || `[${format}]`,
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
      },
      include: {
        tenant: {
          include: { botConfig: true },
        },
      },
    });
  }

  // 3. Procesar Contenido Multimedia (Audio o Imagen)
  let uploadedMediaUrl: string | undefined = payload.mediaUrl;
  let visionAnalysisData: any = null;
  let textSnippetForAI = text || '';

  if (mediaBuffer && mediaMimeType) {
    const ext = mediaMimeType.split('/')[1] || 'bin';
    uploadedMediaUrl = await uploadMedia(mediaBuffer, `wa_${Date.now()}.${ext}`, mediaMimeType);
  }

  if (format === 'IMAGE') {
    textSnippetForAI = `[COMPROBANTE DE PAGO ENVIADO POR EL CLIENTE]`;

    try {
      let activeOrder = await prisma.order.findFirst({
        where: {
          tenantId,
          conversationId: conversation.id,
          status: { in: ['DRAFT', 'AWAITING_PAYMENT'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!activeOrder) {
        const shortCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        activeOrder = await prisma.order.create({
          data: {
            tenantId,
            conversationId: conversation.id,
            contactId: contact.id,
            status: 'AWAITING_PAYMENT',
            shortCode,
            total: 0,
            subtotal: 0,
            paymentMethod: 'TRANSFERENCIA',
            paymentReceiptUrl: uploadedMediaUrl,
          },
        });
      } else {
        await prisma.order.update({
          where: { id: activeOrder.id },
          data: {
            status: 'AWAITING_PAYMENT',
            paymentReceiptUrl: uploadedMediaUrl || activeOrder.paymentReceiptUrl,
          },
        });
      }

      // Soporte Opcional de Grupo/Línea de Finanzas
      const botConfig = conversation.tenant?.botConfig;
      const financeTarget = botConfig?.financeGroupId || botConfig?.financeNotificationPhone;
      if (financeTarget && (botConfig?.notifyFinanceGroup || botConfig?.financeNotificationPhone)) {
        const { getGatewayForTenant } = await import('../gateways/gateway.factory');
        const gateway = await getGatewayForTenant(tenantId);
        const sCode = activeOrder.shortCode || activeOrder.id.slice(-6).toUpperCase();
        const financeMsg = `💰 *NUEVO COMPROBANTE RECIBIDO* 💰\n━━━━━━━━━━━━━━━━━━━━\n📦 *Orden:* #${sCode}\n👤 *Cliente:* ${contact.name || contact.phoneNumber}\n━━━━━━━━━━━━━━━━━━━━\n👉 Confirma desde la plataforma o responde *OK ${sCode}*`;

        if (uploadedMediaUrl) {
          await gateway.sendMedia({
            recipient: financeTarget,
            mediaUrl: uploadedMediaUrl,
            mimeType: mediaMimeType || 'image/jpeg',
            caption: financeMsg,
          });
        } else {
          await gateway.sendMessage({ recipient: financeTarget, text: financeMsg });
        }
      }
    } catch (err: any) {
      console.warn(`⚠️ Error asociando comprobante a orden:`, err.message);
    }
  } else if (format === 'AUDIO') {
    textSnippetForAI = `[NOTA DE VOZ ENVIADA: Cliente envía mensaje de audio solicitando información o atención.]`;
  }

  // 4. Guardar Mensaje Entrante en la Base de Datos
  const savedMessage = await prisma.message.create({
    data: {
      tenantId,
      conversationId: conversation.id,
      direction: MessageDirection.INBOUND,
      sender: MessageSender.CUSTOMER,
      format: format as MessageFormat,
      body: textSnippetForAI,
      mediaUrl: uploadedMediaUrl,
      mediaMimeType,
      visionAnalysis: null,
      deliveryStatus: MessageDeliveryStatus.DELIVERED,
      whatsappMessageId,
    },
  });

  // 5. Emitir a la bandeja de entrada web de los agentes en tiempo real
  emitNewMessage(tenantId, conversation.id, savedMessage);

  // 6. Si es imagen de comprobante, responder de inmediato sin gastar tokens de IA
  if (format === 'IMAGE') {
    const receiptAckText = `¡Hemos recibido tu comprobante de pago! 🧾\n\nNuestro equipo está verificando la transferencia en el sistema en este momento. Tan pronto sea confirmada, pasaremos tu pedido a preparación y te avisaremos. ⏳`;

    const { enqueueOutboundMessage } = await import('../../queues/outbound.queue');
    await enqueueOutboundMessage({
      tenantId,
      conversationId: conversation.id,
      recipientPhone: senderJid || cleanPhone,
      responseText: receiptAckText,
      typingSimulationEnabled: true,
      minTypingDelayMs: 600,
      maxTypingDelayMs: 1200,
    });

    return { success: true, messageId: savedMessage.id };
  }

  // 6. Enviar al Debounce Buffer para la IA (si la conversación está en BOT_ACTIVE)
  if (conversation.status === 'BOT_ACTIVE') {
    const debounceSeconds = conversation.tenant.botConfig?.debounceSeconds || 2;

    await addMessageToDebounceBuffer({
      tenantId,
      conversationId: conversation.id,
      contactId: contact.id,
      recipientPhone: senderJid || cleanPhone,
      messageId: savedMessage.id,
      snippet: textSnippetForAI,
      debounceSeconds,
    });
  } else {
    console.log(`ℹ️ [Atención Humana] Conversación ${conversation.id} tiene asignado un agente. Bot silenciado.`);
  }

  return { success: true, messageId: savedMessage.id };
}

/**
 * Procesa cambios de estado o QR del microservicio Baileys
 */
export async function handleBaileysSessionUpdate(payload: {
  tenantId: string;
  status: 'DISCONNECTED' | 'STARTING' | 'SCAN_QR' | 'CONNECTED';
  qrCodeBase64?: string;
  phoneNumber?: string;
}) {
  const { tenantId, status, qrCodeBase64, phoneNumber } = payload;

  await prisma.whatsAppConnection.upsert({
    where: {
      tenantId_gatewayType: {
        tenantId,
        gatewayType: 'QR_BAILEYS',
      },
    },
    update: {
      status,
      qrCodeBase64: qrCodeBase64 || null,
      phoneNumber: phoneNumber || undefined,
      lastPingAt: new Date(),
    },
    create: {
      tenantId,
      gatewayType: 'QR_BAILEYS',
      status,
      qrCodeBase64,
      phoneNumber,
      lastPingAt: new Date(),
    },
  });

  emitConnectionState(tenantId, { status, qrCodeBase64, phoneNumber });
}
