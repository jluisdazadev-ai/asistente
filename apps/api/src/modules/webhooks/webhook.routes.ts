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
          const connection = await prisma.whatsappConnection.findFirst({
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

        const senderPhone = msg.key.remoteJid?.split('@')[0] || '';
        const pushName = msg.pushName;

        let format: 'TEXT' | 'AUDIO' | 'IMAGE' | 'DOCUMENT' = 'TEXT';
        let text = '';
        let mediaBuffer: Buffer | undefined = undefined;
        let mediaMimeType: string | undefined = undefined;

        if (msg.message?.conversation) {
          text = msg.message.conversation;
        } else if (msg.message?.extendedTextMessage?.text) {
          text = msg.message.extendedTextMessage.text;
        } else if (msg.message?.imageMessage) {
          format = 'IMAGE';
          text = msg.message.imageMessage.caption || '';
          mediaMimeType = msg.message.imageMessage.mimetype || 'image/jpeg';
          if (data.mediaBase64) {
            mediaBuffer = Buffer.from(data.mediaBase64, 'base64');
          }
        } else if (msg.message?.audioMessage) {
          format = 'AUDIO';
          mediaMimeType = msg.message.audioMessage.mimetype || 'audio/ogg';
          if (data.mediaBase64) {
            mediaBuffer = Buffer.from(data.mediaBase64, 'base64');
          }
        }

        await handleInboundMessage({
          tenantId,
          senderPhone,
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
