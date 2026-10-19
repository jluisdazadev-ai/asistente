import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma, UserRole, SubscriptionStatus } from '@crm/database';
import * as bcrypt from 'bcryptjs';

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
          tenantId: tenant.id,
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
};
