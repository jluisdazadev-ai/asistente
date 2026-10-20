import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/redis';
import { getGatewayForTenant } from '../modules/gateways/gateway.factory';
import { prisma, MessageDirection, MessageSender, MessageFormat, MessageDeliveryStatus } from '@crm/database';
import { emitNewMessage } from '../lib/socket';

export const OUTBOUND_QUEUE_NAME = 'whatsapp-outbound-sender';

export interface OutboundMessageData {
  tenantId: string;
  conversationId: string;
  recipientPhone: string;
  responseText: string;
  typingSimulationEnabled: boolean;
  minTypingDelayMs: number;
  maxTypingDelayMs: number;
}

export const outboundQueue = new Queue<OutboundMessageData>(OUTBOUND_QUEUE_NAME, {
  connection: redisConnection,
});

export async function enqueueOutboundMessage(data: OutboundMessageData) {
  await outboundQueue.add('send-message', data, {
    removeOnComplete: true,
    removeOnFail: true,
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const outboundWorker = new Worker<OutboundMessageData>(
  OUTBOUND_QUEUE_NAME,
  async (job: Job<OutboundMessageData>) => {
    const {
      tenantId,
      conversationId,
      recipientPhone,
      responseText,
      typingSimulationEnabled,
      minTypingDelayMs,
      maxTypingDelayMs,
    } = job.data;

    try {
      const gateway = await getGatewayForTenant(tenantId);

      // 1. Simulación humana de escritura (Presence "composing")
      if (typingSimulationEnabled) {
        await gateway.sendPresence(recipientPhone, 'composing');

        // Cálculo de retraso orgánico ágil (600ms - 1200ms)
        const effectiveMin = Math.min(minTypingDelayMs || 600, 800);
        const effectiveMax = Math.min(maxTypingDelayMs || 1200, 1500);
        const computedDelay = Math.min(
          effectiveMax,
          Math.max(effectiveMin, Math.floor(responseText.length * 15))
        );

        console.log(`✍️ [Simulador Escritura] "Escribiendo..." a ${recipientPhone} durante ${computedDelay}ms`);
        await sleep(computedDelay);
      }

      // 2. Despacho real del mensaje por el Gateway correspondiente (Meta o Baileys)
      const sendResult = await gateway.sendMessage({
        recipient: recipientPhone,
        text: responseText,
      });

      // 3. Pausar presencia
      if (typingSimulationEnabled) {
        await gateway.sendPresence(recipientPhone, 'paused');
      }

      // 4. Guardar mensaje saliente en la Base de Datos
      const savedMessage = await prisma.message.create({
        data: {
          tenantId,
          conversationId,
          direction: MessageDirection.OUTBOUND,
          sender: MessageSender.BOT,
          format: MessageFormat.TEXT,
          body: responseText,
          deliveryStatus: MessageDeliveryStatus.SENT,
          whatsappMessageId: sendResult.messageId,
        },
      });

      // 5. Actualizar último mensaje en la conversación
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageText: responseText,
          lastMessageAt: new Date(),
        },
      });

      // 6. Emitir evento a la UI en tiempo real
      emitNewMessage(tenantId, conversationId, savedMessage);

      console.log(`✅ [Mensaje Enviado] Chat ${conversationId} -> ${recipientPhone}: "${responseText.substring(0, 40)}..."`);
    } catch (err: any) {
      console.error(`❌ Error despachando mensaje a ${recipientPhone}:`, err.message);
      throw err;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);
