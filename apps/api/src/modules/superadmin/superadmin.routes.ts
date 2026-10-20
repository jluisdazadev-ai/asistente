import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma, UserRole, SubscriptionStatus, GatewayProvider, ConnectionStatus, MessageDirection, MessageSender, MessageFormat, MessageDeliveryStatus, ConversationStatus } from '@crm/database';
import * as bcrypt from 'bcryptjs';
import axios from 'axios';
import { config } from '../../config';
import { emitNewMessage } from '../../lib/socket';

export const superadminRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Middleware de autorización: Solo SUPERADMIN
  fastify.addHook('preHandler', async (request, reply) => {
    await fastify.authenticate(request, reply);
    const user = (request as any).user;
    if (user.role !== UserRole.SUPERADMIN) {
      return reply.status(403).send({ error: 'Acceso denegado: Requiere rol SUPERADMIN.' });
    }
  });

  // 1. Estadísticas Globales del SaaS
  fastify.get('/admin/stats', async (request, reply) => {
    const totalTenants = await prisma.tenant.count();
    const activeTenants = await prisma.tenant.count({ where: { isActive: true } });
    const totalConversations = await prisma.conversation.count();
    const totalMessages = await prisma.message.count();
    const totalOrders = await prisma.order.count();

    const revenueResult = await prisma.order.aggregate({
      where: { status: 'PAID' },
      _sum: { total: true },
    });

    return reply.send({
      totalTenants,
      activeTenants,
      totalConversations,
      totalMessages,
      totalOrders,
      totalRevenuePaid: revenueResult._sum.total || 0,
    });
  });

  // 2. Listar Todos los Negocios / Tenants
  fastify.get('/admin/tenants', async (request, reply) => {
    const tenants = await prisma.tenant.findMany({
      include: {
        plan: true,
        connections: true,
        _count: {
          select: {
            conversations: true,
            products: true,
            users: true,
            orders: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ tenants });
  });

  // 3. Crear Nuevo Tenant / Negocio Cliente
  fastify.post('/admin/tenants', async (request, reply) => {
    const { businessName, slug, planId, billingEmail, phone, ownerName, ownerPassword } = request.body as any;

    if (!businessName || !slug || !billingEmail || !ownerPassword) {
      return reply.status(400).send({ error: 'Campos obligatorios incompletos' });
    }

    const tenant = await prisma.tenant.create({
      data: {
        businessName,
        slug,
        planId,
        billingEmail,
        phone,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      },
    });

    // Crear usuario dueño
    const passwordHash = await bcrypt.hash(ownerPassword, 10);
    const ownerUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: billingEmail,
        passwordHash,
        fullName: ownerName || 'Administrador Negocio',
        role: UserRole.TENANT_OWNER,
      },
    });

    // Inicializar configuración del bot
    await prisma.botConfiguration.create({
      data: {
        tenantId: tenant.id,
        botName: `Asistente de ${businessName}`,
        roleDescription: `Asistente comercial y de soporte para ${businessName}.`,
        tone: 'FRIENDLY',
        temperature: 0.4,
      },
    });

    // Crear pipeline inicial de ventas
    const pipeline = await prisma.crmPipeline.create({
      data: {
        tenantId: tenant.id,
        name: 'Embudo Principal WhatsApp',
        isDefault: true,
      },
    });

    const defaultStages = [
      { name: 'Nuevo Lead', stageKey: 'NEW_LEAD', orderIndex: 0, color: '#64748B' },
      { name: 'En Consulta', stageKey: 'IN_QUERY', orderIndex: 1, color: '#3B82F6' },
      { name: 'Esperando Pago', stageKey: 'AWAITING_PAYMENT', orderIndex: 2, color: '#F59E0B' },
      { name: 'Confirmado', stageKey: 'CONFIRMED', orderIndex: 3, color: '#10B981' },
      { name: 'Finalizado', stageKey: 'COMPLETED', orderIndex: 4, color: '#8B5CF6' },
    ];

    for (const st of defaultStages) {
      await prisma.crmStage.create({
        data: {
          pipelineId: pipeline.id,
          name: st.name,
          stageKey: st.stageKey,
          orderIndex: st.orderIndex,
          color: st.color,
        },
      });
    }

    return reply.send({ tenant, ownerUser });
  });

  // 4. Cambiar Estado del Tenant (Activo / Suspendido)
  fastify.put('/admin/tenants/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { isActive, subscriptionStatus } = request.body as any;

    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        isActive,
        subscriptionStatus: subscriptionStatus as SubscriptionStatus,
      },
    });

    return reply.send({ tenant: updated });
  });

  // ========================================================
  // 5. CRUD DE PLANES DE SUSCRIPCIÓN SAAS
  // ========================================================

  // Listar planes con métricas de tenants asociados
  fastify.get('/admin/plans', async (request, reply) => {
    const plans = await prisma.plan.findMany({
      include: {
        _count: {
          select: { tenants: true },
        },
      },
      orderBy: { priceCents: 'asc' },
    });
    return reply.send({ plans });
  });

  // Crear nuevo plan de suscripción
  fastify.post('/admin/plans', async (request, reply) => {
    const {
      name,
      slug,
      priceCents,
      currency,
      maxConversationsPerMonth,
      maxTeamMembers,
      maxKnowledgeDocs,
      allowQrGateway,
      allowOfficialGateway,
      allowVoiceNotes,
      allowVisionOcr,
    } = request.body as any;

    if (!name || !slug || priceCents === undefined) {
      return reply.status(400).send({ error: 'Nombre, slug y precio son obligatorios.' });
    }

    const plan = await prisma.plan.create({
      data: {
        name,
        slug: slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-'),
        priceCents: parseInt(priceCents, 10),
        currency: currency || 'USD',
        maxConversationsPerMonth: maxConversationsPerMonth ? parseInt(maxConversationsPerMonth, 10) : 1000,
        maxTeamMembers: maxTeamMembers ? parseInt(maxTeamMembers, 10) : 2,
        maxKnowledgeDocs: maxKnowledgeDocs ? parseInt(maxKnowledgeDocs, 10) : 3,
        allowQrGateway: allowQrGateway ?? true,
        allowOfficialGateway: allowOfficialGateway ?? false,
        allowVoiceNotes: allowVoiceNotes ?? true,
        allowVisionOcr: allowVisionOcr ?? true,
      },
    });

    return reply.send({ plan });
  });

  // Actualizar un plan existente
  fastify.put('/admin/plans/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const {
      name,
      priceCents,
      currency,
      maxConversationsPerMonth,
      maxTeamMembers,
      maxKnowledgeDocs,
      allowQrGateway,
      allowOfficialGateway,
      allowVoiceNotes,
      allowVisionOcr,
      isActive,
    } = request.body as any;

    const plan = await prisma.plan.update({
      where: { id },
      data: {
        name,
        priceCents: priceCents !== undefined ? parseInt(priceCents, 10) : undefined,
        currency,
        maxConversationsPerMonth: maxConversationsPerMonth !== undefined ? parseInt(maxConversationsPerMonth, 10) : undefined,
        maxTeamMembers: maxTeamMembers !== undefined ? parseInt(maxTeamMembers, 10) : undefined,
        maxKnowledgeDocs: maxKnowledgeDocs !== undefined ? parseInt(maxKnowledgeDocs, 10) : undefined,
        allowQrGateway,
        allowOfficialGateway,
        allowVoiceNotes,
        allowVisionOcr,
        isActive,
      },
    });

    return reply.send({ plan });
  });

  // Eliminar un plan
  fastify.delete('/admin/plans/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantsCount = await prisma.tenant.count({ where: { planId: id } });
    if (tenantsCount > 0) {
      return reply.status(400).send({ error: `No se puede eliminar: hay ${tenantsCount} negocios asignados a este plan.` });
    }

    await prisma.plan.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // ========================================================
  // 6. BOT DE VENTAS DE FACEBOOK ADS (SUPERADMIN)
  // ========================================================

  async function getOrCreatePlatformTenant() {
    let platformTenant = await prisma.tenant.findUnique({
      where: { slug: 'plataforma-saas' },
      include: { botConfig: true },
    });

    if (!platformTenant) {
      const defaultPlan = await prisma.plan.findFirst();
      platformTenant = await prisma.tenant.create({
        data: {
          businessName: 'CRM WhatsApp SaaS Platform',
          slug: 'plataforma-saas',
          planId: defaultPlan?.id,
          billingEmail: 'admin@crmwhatsapp.com',
          phone: '+573000000000',
          isActive: true,
        },
        include: { botConfig: true },
      });

      await prisma.botConfiguration.create({
        data: {
          tenantId: platformTenant.id,
          botName: 'Sofía',
          roleDescription: 'Asesora comercial experta en la plataforma de CRM y Bots de WhatsApp.',
          tone: 'AGGRESSIVE_SALES',
          temperature: 0.35,
          debounceSeconds: 2,
        },
      });

      const pipeline = await prisma.crmPipeline.create({
        data: {
          tenantId: platformTenant.id,
          name: 'Embudo Ventas Facebook Ads',
          isDefault: true,
        },
      });

      await prisma.crmStage.createMany({
        data: [
          { pipelineId: pipeline.id, name: 'Lead de Anuncio', stageKey: 'NEW_LEAD', orderIndex: 0, color: '#64748B' },
          { pipelineId: pipeline.id, name: 'Interesado en Plan', stageKey: 'IN_QUERY', orderIndex: 1, color: '#3B82F6' },
          { pipelineId: pipeline.id, name: 'Cotizado / Por Pagar', stageKey: 'AWAITING_PAYMENT', orderIndex: 2, color: '#F59E0B' },
          { pipelineId: pipeline.id, name: 'Cliente Ganado', stageKey: 'CONFIRMED', orderIndex: 3, color: '#10B981' },
        ],
      });
    }

    return platformTenant;
  }

  // Estado del QR de la línea de ventas
  fastify.get('/admin/sales-bot/connection', async (request, reply) => {
    const platformTenant = await getOrCreatePlatformTenant();
    const sessionId = 'session_platform_saas';

    let conn = await prisma.whatsAppConnection.findFirst({
      where: { tenantId: platformTenant.id, gatewayType: GatewayProvider.QR_BAILEYS },
    });

    if (!conn) {
      conn = await prisma.whatsAppConnection.create({
        data: {
          tenantId: platformTenant.id,
          gatewayType: GatewayProvider.QR_BAILEYS,
          sessionId,
          status: ConnectionStatus.DISCONNECTED,
        },
      });
    }

    if (conn.status !== ConnectionStatus.CONNECTED) {
      try {
        const qrRes = await axios.get(`${config.qrService.url}/sessions/${sessionId}/qr`, {
          headers: { 'x-service-secret': config.qrService.secret },
          timeout: 2000,
        });

        if (qrRes.data?.qrCodeBase64 && qrRes.data.qrCodeBase64 !== conn.qrCodeBase64) {
          conn = await prisma.whatsAppConnection.update({
            where: { id: conn.id },
            data: {
              status: ConnectionStatus.SCAN_QR,
              qrCodeBase64: qrRes.data.qrCodeBase64,
            },
          });
        }
      } catch (e) {}
    }

    return reply.send({ connection: conn, tenantId: platformTenant.id });
  });

  // Generar / Reiniciar QR de la línea de ventas
  fastify.post('/admin/sales-bot/qr/init', async (request, reply) => {
    const platformTenant = await getOrCreatePlatformTenant();
    const sessionId = 'session_platform_saas';

    try {
      const response = await axios.post(
        `${config.qrService.url}/sessions/init`,
        {
          tenantId: platformTenant.id,
          sessionId,
          forceReset: true,
        },
        {
          headers: { 'x-service-secret': config.qrService.secret },
          timeout: 10000,
        }
      );

      const status = response.data.status || 'STARTING';
      const qrCodeBase64 = response.data.qrCodeBase64 || null;

      const savedConn = await prisma.whatsAppConnection.upsert({
        where: { tenantId_gatewayType: { tenantId: platformTenant.id, gatewayType: GatewayProvider.QR_BAILEYS } },
        update: {
          status: status as ConnectionStatus,
          qrCodeBase64,
          sessionId,
          lastPingAt: new Date(),
        },
        create: {
          tenantId: platformTenant.id,
          gatewayType: GatewayProvider.QR_BAILEYS,
          status: status as ConnectionStatus,
          qrCodeBase64,
          sessionId,
          lastPingAt: new Date(),
        },
      });

      return reply.send({ success: true, status, qrCodeBase64 });
    } catch (err: any) {
      return reply.status(500).send({ error: 'Error comunicando con microservicio Baileys: ' + err.message });
    }
  });

  // Bandeja de Leads de Anuncios de Facebook
  fastify.get('/admin/sales-bot/leads', async (request, reply) => {
    const platformTenant = await getOrCreatePlatformTenant();

    const conversations = await prisma.conversation.findMany({
      where: { tenantId: platformTenant.id },
      include: {
        contact: true,
        stage: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    return reply.send({ conversations });
  });

  // Enviar mensaje manual a un lead de Facebook Ads
  fastify.post('/admin/sales-bot/leads/:id/message', async (request, reply) => {
    const platformTenant = await getOrCreatePlatformTenant();
    const { id } = request.params as { id: string };
    const { text } = request.body as any;

    if (!text || !text.trim()) {
      return reply.status(400).send({ error: 'Texto requerido' });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id, tenantId: platformTenant.id },
      include: { contact: true },
    });

    if (!conversation) return reply.status(404).send({ error: 'Conversación no encontrada' });

    const clientPhone = (conversation.contact.customFields as any)?.jid || conversation.contact.phoneNumber;
    const { getGatewayForTenant } = await import('../gateways/gateway.factory');
    const gateway = await getGatewayForTenant(platformTenant.id);

    const sendRes = await gateway.sendMessage({
      recipient: clientPhone,
      text,
    });

    const savedMsg = await prisma.message.create({
      data: {
        tenantId: platformTenant.id,
        conversationId: conversation.id,
        direction: MessageDirection.OUTBOUND,
        sender: MessageSender.HUMAN_AGENT,
        format: MessageFormat.TEXT,
        body: text,
        deliveryStatus: MessageDeliveryStatus.SENT,
        whatsappMessageId: sendRes.messageId,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: ConversationStatus.HUMAN_AGENT,
        lastMessageText: text,
        lastMessageAt: new Date(),
      },
    });

    emitNewMessage(platformTenant.id, conversation.id, savedMsg);
    return reply.send({ message: savedMsg });
  });
};
