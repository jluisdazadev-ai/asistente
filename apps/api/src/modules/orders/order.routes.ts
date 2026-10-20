import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma, OrderStatus } from '@crm/database';
import { confirmOrderPayment, dispatchOrderShipping, rejectOrderPayment } from './order-dispatch.service';

export const orderRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Asegurar que todas las rutas requieran autenticación
  fastify.addHook('preHandler', fastify.authenticate);

  // 1. Listar pedidos del negocio con filtros opcionales
  fastify.get('/orders', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    if (!tenantId) return reply.status(403).send({ error: 'Tenant requerido' });

    const query = request.query as any;
    const { status, limit } = query;

    const where: any = { tenantId };
    if (status) {
      where.status = status as OrderStatus;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        contact: true,
        orderItems: {
          include: { product: true },
        },
        deliveryZone: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit ? parseInt(limit, 10) : 50,
    });

    return reply.send({ orders });
  });

  // 2. Obtener una orden específica
  fastify.get('/orders/:id', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const { id } = request.params as { id: string };

    const order = await prisma.order.findFirst({
      where: { id, tenantId },
      include: {
        contact: true,
        orderItems: { include: { product: true } },
        deliveryZone: true,
        conversation: true,
      },
    });

    if (!order) return reply.status(404).send({ error: 'Orden no encontrada' });
    return reply.send({ order });
  });

  // 3. Aprobar pago de la orden y pasar a cocina
  fastify.post('/orders/:id/approve-payment', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const { id } = request.params as { id: string };

    try {
      const updated = await confirmOrderPayment(tenantId, id);
      return reply.send({ success: true, order: updated });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // 4. Marcar orden como despachada (en camino)
  fastify.post('/orders/:id/dispatch', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const { id } = request.params as { id: string };

    try {
      const updated = await dispatchOrderShipping(tenantId, id);
      return reply.send({ success: true, order: updated });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // 5. Rechazar comprobante de pago
  fastify.post('/orders/:id/reject-payment', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const { id } = request.params as { id: string };
    const { reason } = request.body as any || {};

    try {
      const updated = await rejectOrderPayment(tenantId, id, reason);
      return reply.send({ success: true, order: updated });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
};
