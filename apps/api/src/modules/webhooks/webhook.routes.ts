import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { config } from '../../config';
import { handleInboundMessage, handleBaileysSessionUpdate } from './webhook.service';
import { prisma } from '@crm/database';

export const webhookRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // ========================================================
  // 1. META CLOUD API OFICIAL WEBHOOKS
  // ========================================================

  // Verificación de Webhook de Meta
  fastify.get('/webhooks/meta', async (request, reply) => {
    const query = request.query as any;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === config.meta.webhookVerifyToken) {
      console.log('✅ Webhook de Meta Cloud API verificado exitosamente');
      return reply.status(200).send(challenge);
    }

    return reply.status(403).send('Forbidden');
  });

  // Recepción de eventos y mensajes de Meta Cloud API
  fastify.post('/webhooks/meta', async (request, reply) => {
    const body = request.body as any;

    // Responder 200 inmediatamente a Meta para evitar reintentos
    reply.status(200).send({ status: 'EVENT_RECEIVED' });

    try {
      if (body.object !== 'whatsapp_business_account') return;

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value;
          if (!value || !value.messages) continue;

          const metadata = value.metadata;
          const phoneNumberId = metadata?.phone_number_id;

          // Buscar el tenant asociado a este Phone Number ID
          const connection = await prisma.whatsAppConnection.findFirst({
            where: { phoneNumberId },
          });

          if (!connection) {
            console.warn(`Mensaje de Meta para Phone Number ID no registrado: ${phoneNumberId}`);
            continue;
          }

          for (const msg of value.messages) {
            const senderPhone = msg.from;
            const senderName = value.contacts?.[0]?.profile?.name;
            const messageType = msg.type;

            let format: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' = 'TEXT';
            let text = '';

            if (messageType === 'text') {
              text = msg.text?.body || '';
              format = 'TEXT';
            } else if (messageType === 'audio') {
              format = 'AUDIO';
              text = '[Nota de voz de WhatsApp]';
            } else if (messageType === 'image') {
              format = 'IMAGE';
              text = msg.image?.caption || '[Imagen de WhatsApp]';
            }

            await handleInboundMessage({
              tenantId: connection.tenantId,
              senderPhone,
              senderName,
              format,
              text,
              whatsappMessageId: msg.id,
            });
          }
        }
      }
    } catch (err: any) {
      console.error('Error procesando webhook de Meta:', err);
    }
  });

  // ========================================================
  // 2. MICROSERVICIO BAILEYS / QR WEBHOOKS
  // ========================================================

  fastify.post('/webhooks/baileys', async (request, reply) => {
    const secret = request.headers['x-service-secret'];
    if (secret !== config.qrService.secret) {
      return reply.status(401).send({ error: 'Unauthorized secret' });
    }

    const payload = request.body as any;
    const { event, tenantId, data } = payload;

    reply.status(200).send({ received: true });

    try {
      if (event === 'connection.update') {
        await handleBaileysSessionUpdate({
          tenantId,
          status: data.status,
          qrCodeBase64: data.qrCodeBase64,
          phoneNumber: data.phoneNumber,
        });
      } else if (event === 'messages.upsert') {
        const msg = data.message;
        if (!msg || msg.key.fromMe) return; // ignorar mensajes enviados por el propio bot

        const remoteJid = msg.key.remoteJid || data.remoteJid || '';
        // Ignorar estados de WhatsApp y grupos para no saturar al bot
        if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') return;

        let senderPhone = data.resolvedPhone || remoteJid.split('@')[0].split(':')[0];
        const altJid = (msg.key as any)?.remoteJidAlt || (msg.key as any)?.senderPn;
        if (!data.resolvedPhone && remoteJid.endsWith('@lid') && altJid && typeof altJid === 'string' && altJid.includes('@s.whatsapp.net')) {
          senderPhone = altJid.split('@')[0].split(':')[0];
        }
        const pushName = msg.pushName;

        let m = msg.message;
        if (m?.ephemeralMessage?.message) m = m.ephemeralMessage.message;
        if (m?.viewOnceMessage?.message) m = m.viewOnceMessage.message;
        if (m?.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
        if (m?.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;

        let format: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' = 'TEXT';
        let text = '';
        let mediaBuffer: Buffer | undefined = undefined;
        let mediaMimeType: string | undefined = undefined;

        if (m?.conversation) {
          text = m.conversation;
        } else if (m?.extendedTextMessage?.text) {
          text = m.extendedTextMessage.text;
        } else if (m?.imageMessage) {
          format = 'IMAGE';
          text = m.imageMessage.caption || '';
          mediaMimeType = m.imageMessage.mimetype || 'image/jpeg';
          if (data.mediaBase64) {
            mediaBuffer = Buffer.from(data.mediaBase64, 'base64');
          }
        } else if (m?.audioMessage) {
          format = 'AUDIO';
          mediaMimeType = m.audioMessage.mimetype || 'audio/ogg';
          if (data.mediaBase64) {
            mediaBuffer = Buffer.from(data.mediaBase64, 'base64');
          }
        }

        console.log(`📩 [WhatsApp Inbound] Mensaje recibido de ${remoteJid} (tel: +${senderPhone}) [${format}]: "${text || '[multimedia]'}"`);

        // Interceptor de Comandos Operativos de WhatsApp (OK, LISTO, RECHAZAR)
        const cleanText = (text || '').trim().toUpperCase();
        const okMatch = cleanText.match(/^(?:OK|APROBADO)\s+([A-Z0-9]{4,8})/);
        const listoMatch = cleanText.match(/^(?:LISTO|DESPACHADO)\s+([A-Z0-9]{4,8})/);
        const rechazarMatch = cleanText.match(/^RECHAZAR\s+([A-Z0-9]{4,8})/);

        if (okMatch || listoMatch || rechazarMatch) {
          const targetCode = (okMatch || listoMatch || rechazarMatch)![1];
          const matchedOrder = await prisma.order.findFirst({
            where: {
              tenantId,
              OR: [
                { shortCode: { equals: targetCode, mode: 'insensitive' } },
                { id: { endsWith: targetCode.toLowerCase() } },
              ],
            },
          });

          if (matchedOrder) {
            const { confirmOrderPayment, dispatchOrderShipping, rejectOrderPayment } = await import('../orders/order-dispatch.service');
            const { getGatewayForTenant } = await import('../gateways/gateway.factory');
            const gateway = await getGatewayForTenant(tenantId);

            if (okMatch) {
              await confirmOrderPayment(tenantId, matchedOrder.id);
              await gateway.sendMessage({
                recipient: remoteJid,
                text: `✅ ¡Orden #${targetCode} aprobada exitosamente! Se notificó al cliente y se pasó a cocina.`,
              });
              return;
            } else if (listoMatch) {
              await dispatchOrderShipping(tenantId, matchedOrder.id);
              await gateway.sendMessage({
                recipient: remoteJid,
                text: `🛵 ¡Orden #${targetCode} despachada! Se notificó al cliente que va en camino.`,
              });
              return;
            } else if (rechazarMatch) {
              await rejectOrderPayment(tenantId, matchedOrder.id, 'Rechazado por comando administrativo');
              await gateway.sendMessage({
                recipient: remoteJid,
                text: `❌ Comprobante de orden #${targetCode} rechazado. Chat pasado a asesor humano.`,
              });
              return;
            }
          }
        }

        await handleInboundMessage({
          tenantId,
          senderPhone,
          senderJid: remoteJid,
          senderName: pushName,
          format,
          text,
          mediaBuffer,
          mediaMimeType,
          whatsappMessageId: msg.key.id,
        });
      }
    } catch (err: any) {
      console.error('Error procesando webhook de Baileys:', err);
    }
  });
};
