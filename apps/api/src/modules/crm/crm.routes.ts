import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma, ConversationStatus, MessageDirection, MessageSender, MessageFormat, MessageDeliveryStatus } from '@crm/database';
import { getGatewayForTenant } from '../gateways/gateway.factory';
import { emitNewMessage, emitKanbanStageChange } from '../../lib/socket';

export const crmRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', fastify.authenticate);

  // 1. Obtener Pipeline y Columnas Kanban con Conversaciones
  fastify.get('/crm/pipeline', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;

    const pipeline = await prisma.crmPipeline.findFirst({
      where: { tenantId, isDefault: true },
      include: {
        stages: {
          orderBy: { orderIndex: 'asc' },
          include: {
            conversations: {
              where: { status: { not: 'CLOSED' } },
              include: {
                contact: true,
                orders: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
              },
              orderBy: { lastMessageAt: 'desc' },
            },
          },
        },
      },
    });

    return reply.send({ pipeline });
  });

  // 2. Mover conversación de Etapa (Drag and Drop en Kanban)
  fastify.put('/crm/conversations/:id/stage', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const { id } = request.params as { id: string };
    const { stageId } = request.body as { stageId: string };

    const stage = await prisma.crmStage.findFirst({
      where: { id: stageId, pipeline: { tenantId } },
    });

    if (!stage) {
      return reply.status(404).send({ error: 'Etapa no encontrada' });
    }

    const updated = await prisma.conversation.update({
      where: { id, tenantId },
      data: { stageId: stage.id },
    });

    emitKanbanStageChange(tenantId, {
      conversationId: id,
      newStageId: stage.id,
      newStageKey: stage.stageKey,
    });

    return reply.send({ conversation: updated });
  });

  // 3. Conmutar Estado: "Bot Activo" vs "Atención Humana"
  fastify.put('/crm/conversations/:id/status', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: 'BOT_ACTIVE' | 'HUMAN_AGENT' | 'CLOSED' };

    const updated = await prisma.conversation.update({
      where: { id, tenantId },
      data: {
        status: status as ConversationStatus,
        unreadCount: 0,
      },
    });

    return reply.send({ conversation: updated });
  });

  // 4. Cargar Historial de Mensajes de un Chat
  fastify.get('/crm/conversations/:id/messages', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const { id } = request.params as { id: string };

    const messages = await prisma.message.findMany({
      where: { conversationId: id, tenantId },
      orderBy: { createdAt: 'asc' },
    });

    // Resetear contador de no leídos al abrir el chat
    await prisma.conversation.updateMany({
      where: { id, tenantId },
      data: { unreadCount: 0 },
    });

    return reply.send({ messages });
  });

  // 5. Enviar Mensaje desde el Panel por un Agente Humano
  fastify.post('/crm/conversations/:id/messages', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const user = (request as any).user;
    const { id } = request.params as { id: string };
    const { text } = request.body as { text: string };

    if (!text || text.trim().length === 0) {
      return reply.status(400).send({ error: 'El texto del mensaje no puede estar vacío' });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id, tenantId },
      include: { contact: true },
    });

    if (!conversation) {
      return reply.status(404).send({ error: 'Conversación no encontrada' });
    }

    const gateway = await getGatewayForTenant(tenantId);

    // Enviar a WhatsApp
    const sendRes = await gateway.sendMessage({
      recipient: conversation.contact.phoneNumber,
      text,
    });

    // Guardar en Base de Datos como mensaje enviado por AGENT
    const saved = await prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: MessageDirection.OUTBOUND,
        sender: MessageSender.HUMAN_AGENT,
        format: MessageFormat.TEXT,
        body: text,
        deliveryStatus: MessageDeliveryStatus.SENT,
        whatsappMessageId: sendRes.messageId,
      },
    });

    // Cambiar automáticamente la conversación a HUMAN_AGENT
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: ConversationStatus.HUMAN_AGENT,
        assignedAgentId: user.userId,
        lastMessageText: text,
        lastMessageAt: new Date(),
      },
    });

    emitNewMessage(tenantId, conversation.id, saved);

    return reply.send({ message: saved });
  });
};
