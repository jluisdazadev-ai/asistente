import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/redis';
import { processConversationWithAI } from '../ai/orchestrator';
import { enqueueOutboundMessage } from './outbound.queue';
import { prisma } from '@crm/database';

export const DEBOUNCE_QUEUE_NAME = 'whatsapp-debounce-buffer';

export interface InboundBufferData {
  tenantId: string;
  conversationId: string;
  contactId: string;
  recipientPhone: string;
}

export const debounceQueue = new Queue<InboundBufferData>(DEBOUNCE_QUEUE_NAME, {
  connection: redisConnection,
});

/**
 * Agrega un mensaje al buffer de Redis y programa o reprograma el temporizador de debounce
 */
export async function addMessageToDebounceBuffer(params: {
  tenantId: string;
  conversationId: string;
  contactId: string;
  recipientPhone: string;
  messageId: string;
  snippet: string;
  debounceSeconds?: number;
}) {
  const { tenantId, conversationId, contactId, recipientPhone, snippet } = params;
  const bufferKey = `crm:buffer:${conversationId}`;

  // 1. Añadir el fragmento de texto a la lista de Redis
  await redisConnection.rpush(bufferKey, snippet);
  await redisConnection.expire(bufferKey, 120); // TTL de seguridad

  const debounceDelayMs = (params.debounceSeconds || 6) * 1000;
  const jobId = `debounce:${conversationId}`;

  // 2. Si ya existía un trabajo pendiente para esta conversación, cancelarlo para resetear el reloj
  try {
    const existingJob = await debounceQueue.getJob(jobId);
    if (existingJob) {
      await existingJob.remove();
    }
  } catch (err) {
    // Si ya estaba en proceso o no existe, continuar
  }

  // 3. Crear el nuevo trabajo demorado
  await debounceQueue.add(
    'process-buffer',
    { tenantId, conversationId, contactId, recipientPhone },
    {
      jobId,
      delay: debounceDelayMs,
      removeOnComplete: true,
      removeOnFail: true,
    }
  );

  console.log(`⏳ [Debounce Buffer] Mensaje acumulado para conversación ${conversationId}. Temporizador reiniciado a ${debounceDelayMs}ms.`);
}

/**
 * Worker que procesa la ráfaga de mensajes acumulados tras vencer el tiempo de debounce
 */
export const debounceWorker = new Worker<InboundBufferData>(
  DEBOUNCE_QUEUE_NAME,
  async (job: Job<InboundBufferData>) => {
    const { tenantId, conversationId, contactId, recipientPhone } = job.data;
    const bufferKey = `crm:buffer:${conversationId}`;

    // 1. Extraer todos los fragmentos acumulados
    const rawMessages = await redisConnection.lrange(bufferKey, 0, -1);
    await redisConnection.del(bufferKey);

    if (!rawMessages || rawMessages.length === 0) {
      return;
    }

    // 2. Unificar los mensajes en un solo bloque coherente
    const unifiedPrompt = rawMessages.join('\n');
    console.log(`🚀 [Debounce Buffer Disparado] Unificando ${rawMessages.length} mensajes para conv ${conversationId}:\n"${unifiedPrompt}"`);

    // 3. Consultar la configuración del bot
    const botConfig = await prisma.botConfiguration.findUnique({
      where: { tenantId },
    });

    // 4. Llamar al orquestador de Inteligencia Artificial (Gemini + Tools)
    const aiResponseText = await processConversationWithAI({
      tenantId,
      conversationId,
      contactId,
      unifiedPromptText: unifiedPrompt,
    });

    if (aiResponseText && aiResponseText.trim().length > 0) {
      // 5. Encolar respuesta hacia el cliente con simulador de escritura
      await enqueueOutboundMessage({
        tenantId,
        conversationId,
        recipientPhone,
        responseText: aiResponseText,
        typingSimulationEnabled: botConfig?.typingSimulationEnabled ?? true,
        minTypingDelayMs: botConfig?.minTypingDelayMs ?? 1200,
        maxTypingDelayMs: botConfig?.maxTypingDelayMs ?? 4000,
      });
    }
  },
  {
    connection: redisConnection,
    concurrency: 10,
  }
);
