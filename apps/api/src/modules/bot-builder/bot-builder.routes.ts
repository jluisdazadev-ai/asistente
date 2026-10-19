import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '@crm/database';

export const botBuilderRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Asegurar que todas las rutas requieran autenticación
  fastify.addHook('preHandler', fastify.authenticate);

  // 1. Obtener configuración completa del Asistente IA
  fastify.get('/bot-config', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    if (!tenantId) return reply.status(403).send({ error: 'Tenant requerido' });

    let botConfig = await prisma.botConfiguration.findUnique({
      where: { tenantId },
    });

    if (!botConfig) {
      botConfig = await prisma.botConfiguration.create({
        data: {
          tenantId,
          botName: 'Mi Asistente IA',
          roleDescription: 'Asesor comercial y atención al cliente.',
          tone: 'FRIENDLY',
          temperature: 0.4,
          debounceSeconds: 6,
        },
      });
    }

    const businessHours = await prisma.businessHour.findMany({
      where: { tenantId },
      orderBy: { dayOfWeek: 'asc' },
    });

    const bankAccounts = await prisma.bankAccount.findMany({
      where: { tenantId },
    });

    const deliveryZones = await prisma.deliveryZone.findMany({
      where: { tenantId },
    });

    return reply.send({
      botConfig,
      businessHours,
      bankAccounts,
      deliveryZones,
    });
  });

  // 2. Actualizar configuración de Identidad y Personalidad
  fastify.put('/bot-config', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const body = request.body as any;

    const updated = await prisma.botConfiguration.upsert({
      where: { tenantId },
      update: {
        botName: body.botName,
        roleDescription: body.roleDescription,
        tone: body.tone,
        temperature: body.temperature,
        businessRules: body.businessRules,
        customSystemPrompt: body.customSystemPrompt,
        debounceSeconds: body.debounceSeconds,
        typingSimulationEnabled: body.typingSimulationEnabled,
        minTypingDelayMs: body.minTypingDelayMs,
        maxTypingDelayMs: body.maxTypingDelayMs,
        voiceInEnabled: body.voiceInEnabled,
        voiceOutEnabled: body.voiceOutEnabled,
        ttsVoiceId: body.ttsVoiceId,
        visionOcrEnabled: body.visionOcrEnabled,
        outOfHoursReplyEnabled: body.outOfHoursReplyEnabled,
        outOfHoursMessage: body.outOfHoursMessage,
        isActive: body.isActive,
      },
      create: {
        tenantId,
        botName: body.botName || 'Mi Asistente',
        roleDescription: body.roleDescription || 'Asesor comercial',
        tone: body.tone || 'FRIENDLY',
        temperature: body.temperature || 0.4,
        businessRules: body.businessRules,
        debounceSeconds: body.debounceSeconds || 6,
      },
    });

    return reply.send({ botConfig: updated });
  });

  // 3. Guardar Horarios de Atención
  fastify.put('/bot-config/hours', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const { hours } = request.body as { hours: Array<{ dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }> };

    for (const h of hours) {
      await prisma.businessHour.upsert({
        where: { tenantId_dayOfWeek: { tenantId, dayOfWeek: h.dayOfWeek } },
        update: {
          openTime: h.openTime,
          closeTime: h.closeTime,
          isClosed: h.isClosed,
        },
        create: {
          tenantId,
          dayOfWeek: h.dayOfWeek,
          openTime: h.openTime,
          closeTime: h.closeTime,
          isClosed: h.isClosed,
        },
      });
    }

    return reply.send({ success: true });
  });

  // 4. CRUD Cuentas Bancarias
  fastify.post('/bot-config/bank-accounts', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const body = request.body as any;

    const account = await prisma.bankAccount.create({
      data: {
        tenantId,
        bankName: body.bankName,
        accountType: body.accountType,
        accountNumber: body.accountNumber,
        holderName: body.holderName,
        holderId: body.holderId,
        qrImageUrl: body.qrImageUrl,
        isActive: body.isActive ?? true,
      },
    });

    return reply.send({ account });
  });

  fastify.delete('/bot-config/bank-accounts/:id', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const { id } = request.params as { id: string };

    await prisma.bankAccount.deleteMany({
      where: { id, tenantId },
    });

    return reply.send({ success: true });
  });

  // 5. CRUD Zonas de Domicilio
  fastify.post('/bot-config/delivery-zones', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const body = request.body as any;

    const zone = await prisma.deliveryZone.create({
      data: {
        tenantId,
        zoneName: body.zoneName,
        price: body.price,
        estimatedMinutes: body.estimatedMinutes || 40,
        isActive: body.isActive ?? true,
      },
    });

    return reply.send({ zone });
  });

  fastify.delete('/bot-config/delivery-zones/:id', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const { id } = request.params as { id: string };

    await prisma.deliveryZone.deleteMany({
      where: { id, tenantId },
    });

    return reply.send({ success: true });
  });
};
