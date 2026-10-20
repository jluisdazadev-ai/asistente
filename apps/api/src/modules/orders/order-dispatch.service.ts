import { prisma, OrderStatus, ConversationStatus, MessageDirection, MessageSender, MessageFormat, MessageDeliveryStatus } from '@crm/database';
import { getGatewayForTenant } from '../gateways/gateway.factory';
import { emitNewMessage } from '../../lib/socket';

export async function confirmOrderPayment(tenantId: string, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      contact: true,
      conversation: true,
      orderItems: {
        include: { product: true },
      },
      deliveryZone: true,
    },
  });

  if (!order || order.tenantId !== tenantId) {
    throw new Error('Orden no encontrada');
  }

  const shortCode = order.shortCode || order.id.slice(-6).toUpperCase();

  // 1. Actualizar orden a PAID y PREPARING
  const updatedOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: OrderStatus.PREPARING,
      shortCode,
    },
    include: {
      contact: true,
      orderItems: { include: { product: true } },
      deliveryZone: true,
    },
  });

  // 2. Si la conversación existe, marcar etapa confirmada
  if (order.conversationId) {
    const confirmedStage = await prisma.crmStage.findFirst({
      where: { pipeline: { tenantId }, stageKey: 'CONFIRMED' },
    });

    await prisma.conversation.update({
      where: { id: order.conversationId },
      data: {
        isPaymentVerified: true,
        ...(confirmedStage ? { stageId: confirmedStage.id } : {}),
      },
    });

    // 3. Notificar al Cliente por WhatsApp
    const clientPhone = (order.contact.customFields as any)?.jid || order.contact.phoneNumber;
    const clientText = `🎉 *¡Tu pago ha sido confirmado con éxito!* 🎉\n\nTu pedido *#${shortCode}* ya entró a nuestra cocina y se encuentra en preparación. 👨‍🍳🔥\n\nTe avisaremos tan pronto salga en camino a tu dirección. ¡Muchas gracias por tu compra!`;

    try {
      const gateway = await getGatewayForTenant(tenantId);
      const sendRes = await gateway.sendMessage({
        recipient: clientPhone,
        text: clientText,
      });

      const savedMsg = await prisma.message.create({
        data: {
          tenantId,
          conversationId: order.conversationId,
          direction: MessageDirection.OUTBOUND,
          sender: MessageSender.BOT,
          format: MessageFormat.TEXT,
          body: clientText,
          deliveryStatus: MessageDeliveryStatus.SENT,
          whatsappMessageId: sendRes.messageId,
        },
      });

      await prisma.conversation.update({
        where: { id: order.conversationId },
        data: {
          lastMessageText: clientText,
          lastMessageAt: new Date(),
        },
      });

      emitNewMessage(tenantId, order.conversationId, savedMsg);
    } catch (err: any) {
      console.error(`⚠️ Error notificando confirmación de pago al cliente:`, err.message);
    }
  }

  // 4. Soporte Opcional de Grupo/Línea de Cocina
  try {
    const botConfig = await prisma.botConfiguration.findUnique({ where: { tenantId } });
    const kitchenTarget = botConfig?.kitchenGroupId || botConfig?.kitchenNotificationPhone;

    if (kitchenTarget && (botConfig?.notifyKitchenGroup || botConfig?.kitchenNotificationPhone)) {
      const itemsList = updatedOrder.orderItems
        .map((it) => `• ${it.quantity}x ${it.productName}${it.variantSelected && Object.keys(it.variantSelected as object).length > 0 ? ` (${JSON.stringify(it.variantSelected)})` : ''}`)
        .join('\n');

      const comandaText = `🍳 *NUEVA COMANDA PARA COCINA* 🍳\n━━━━━━━━━━━━━━━━━━━━\n📦 *Orden:* #${shortCode}\n👤 *Cliente:* ${order.contact.name || order.contact.phoneNumber}\n📍 *Dirección:* ${order.deliveryAddress || 'En local'}\n📝 *Notas:* ${order.notes || 'Ninguna'}\n\n📋 *PRODUCTOS:*\n${itemsList}\n\n💰 *Total Pagado:* $${Number(order.total).toLocaleString('es-CO')} COP\n━━━━━━━━━━━━━━━━━━━━`;

      const gateway = await getGatewayForTenant(tenantId);
      await gateway.sendMessage({
        recipient: kitchenTarget,
        text: comandaText,
      });
      console.log(`🍳 [Comanda Despachada] Enviada a destino de cocina: ${kitchenTarget}`);
    }
  } catch (err: any) {
    console.warn(`⚠️ No se pudo enviar comanda a grupo/línea de cocina:`, err.message);
  }

  return updatedOrder;
}

export async function dispatchOrderShipping(tenantId: string, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      contact: true,
      conversation: true,
      deliveryZone: true,
    },
  });

  if (!order || order.tenantId !== tenantId) {
    throw new Error('Orden no encontrada');
  }

  const shortCode = order.shortCode || order.id.slice(-6).toUpperCase();

  // 1. Actualizar orden a SHIPPED
  const updatedOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: OrderStatus.SHIPPED,
    },
    include: {
      contact: true,
      orderItems: { include: { product: true } },
      deliveryZone: true,
    },
  });

  // 2. Notificar al Cliente por WhatsApp
  if (order.conversationId) {
    const botConfig = await prisma.botConfiguration.findUnique({ where: { tenantId } });
    const estMinutes = order.deliveryZone?.estimatedMinutes || botConfig?.kitchenPrepMinutes || 35;
    const destAddress = order.deliveryAddress || 'tu dirección indicada';

    const clientPhone = (order.contact.customFields as any)?.jid || order.contact.phoneNumber;
    const clientText = `🛵 *¡TU PEDIDO VA EN CAMINO!* 🛵\n━━━━━━━━━━━━━━━━━━━━\n¡Buenas noticias! Tu orden *#${shortCode}* acaba de salir de nuestra cocina y el repartidor va hacia:\n📍 *${destAddress}*\n⏱️ *Tiempo estimado de entrega:* ~${estMinutes} minutos.\n\n¡Que lo disfrutes mucho! Quedamos atentos si necesitas algo más. 😋✨\n━━━━━━━━━━━━━━━━━━━━`;

    try {
      const gateway = await getGatewayForTenant(tenantId);
      const sendRes = await gateway.sendMessage({
        recipient: clientPhone,
        text: clientText,
      });

      const savedMsg = await prisma.message.create({
        data: {
          tenantId,
          conversationId: order.conversationId,
          direction: MessageDirection.OUTBOUND,
          sender: MessageSender.BOT,
          format: MessageFormat.TEXT,
          body: clientText,
          deliveryStatus: MessageDeliveryStatus.SENT,
          whatsappMessageId: sendRes.messageId,
        },
      });

      await prisma.conversation.update({
        where: { id: order.conversationId },
        data: {
          lastMessageText: clientText,
          lastMessageAt: new Date(),
        },
      });

      emitNewMessage(tenantId, order.conversationId, savedMsg);
    } catch (err: any) {
      console.error(`⚠️ Error notificando despacho de orden al cliente:`, err.message);
    }
  }

  return updatedOrder;
}

export async function rejectOrderPayment(tenantId: string, orderId: string, reason?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      contact: true,
      conversation: true,
    },
  });

  if (!order || order.tenantId !== tenantId) {
    throw new Error('Orden no encontrada');
  }

  const shortCode = order.shortCode || order.id.slice(-6).toUpperCase();

  // 1. Dejar orden en DRAFT o AWAITING_PAYMENT
  const updatedOrder = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: OrderStatus.AWAITING_PAYMENT,
      notes: reason ? `Rechazado: ${reason}` : order.notes,
    },
  });

  // 2. Si hay conversación, pasar a HUMAN_AGENT y avisar al cliente
  if (order.conversationId) {
    await prisma.conversation.update({
      where: { id: order.conversationId },
      data: {
        status: ConversationStatus.HUMAN_AGENT,
        needsHumanReason: `Comprobante rechazado: ${reason || 'Datos de transferencia no válidos'}`,
      },
    });

    const clientPhone = (order.contact.customFields as any)?.jid || order.contact.phoneNumber;
    const clientText = `⚠️ Hola ${order.contact.name || ''}, tuvimos un inconveniente al validar tu comprobante de pago para la orden *#${shortCode}*.\n\n${reason ? `Motivo: ${reason}\n\n` : ''}Un asesor humano te atenderá de inmediato por este mismo chat para asistirte con la verificación.`;

    try {
      const gateway = await getGatewayForTenant(tenantId);
      const sendRes = await gateway.sendMessage({
        recipient: clientPhone,
        text: clientText,
      });

      const savedMsg = await prisma.message.create({
        data: {
          tenantId,
          conversationId: order.conversationId,
          direction: MessageDirection.OUTBOUND,
          sender: MessageSender.HUMAN_AGENT,
          format: MessageFormat.TEXT,
          body: clientText,
          deliveryStatus: MessageDeliveryStatus.SENT,
          whatsappMessageId: sendRes.messageId,
        },
      });

      emitNewMessage(tenantId, order.conversationId, savedMsg);
    } catch (err: any) {
      console.error(`⚠️ Error enviando aviso de rechazo al cliente:`, err.message);
    }
  }

  return updatedOrder;
}
