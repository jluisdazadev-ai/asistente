import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '@crm/database';
import * as bcrypt from 'bcryptjs';

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.post('/auth/login', async (request, reply) => {
    const { email, password } = request.body as any;

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email y contraseña requeridos' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: true },
    });

    if (!user || !user.isActive) {
      return reply.status(401).send({ error: 'Credenciales inválidas o usuario inactivo' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return reply.status(401).send({ error: 'Credenciales inválidas' });
    }

    const token = fastify.jwt.sign(
      {
        userId: user.id,
        role: user.role,
        tenantId: user.tenantId,
        tenantSlug: user.tenant?.slug,
        email: user.email,
        fullName: user.fullName,
      },
      { expiresIn: '7d' }
    );

    return reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
        tenant: user.tenant
          ? {
              id: user.tenant.id,
              name: user.tenant.businessName,
              slug: user.tenant.slug,
            }
          : null,
      },
    });
  });

  fastify.get('/auth/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    return reply.send({ user });
  });
};
