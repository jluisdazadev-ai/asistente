import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { config } from './config';
import { initSocketIO } from './lib/socket';
import { authRoutes } from './modules/auth/auth.routes';
import { superadminRoutes } from './modules/superadmin/superadmin.routes';
import { botBuilderRoutes } from './modules/bot-builder/bot-builder.routes';
import { catalogRoutes } from './modules/catalog/catalog.routes';
import { crmRoutes } from './modules/crm/crm.routes';
import { connectionRoutes } from './modules/connections/connections.routes';
import { webhookRoutes } from './modules/webhooks/webhook.routes';
import './queues/debounce.queue';
import './queues/outbound.queue';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
  }
}

async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.env === 'development' ? 'info' : 'warn',
    },
  });

  // CORS
  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // JWT
  await app.register(jwt, {
    secret: config.jwtSecret,
  });

  // Decorador de autenticación
  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'Token no proporcionado o inválido' });
    }
  });

  // Inicializar Socket.io sobre el servidor HTTP nativo
  initSocketIO(app.server);

  // Registrar Rutas con prefijo /api
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(superadminRoutes, { prefix: '/api' });
  await app.register(botBuilderRoutes, { prefix: '/api' });
  await app.register(catalogRoutes, { prefix: '/api' });
  await app.register(crmRoutes, { prefix: '/api' });
  await app.register(connectionRoutes, { prefix: '/api' });
  await app.register(webhookRoutes, { prefix: '/api' });

  // Endpoint de salud
  app.get('/health', async () => ({
    status: 'ok',
    service: 'whatsapp-ai-crm-api',
    timestamp: new Date().toISOString(),
  }));

  return app;
}

async function start() {
  try {
    const app = await buildServer();
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`🚀 [API Fastify] Servidor ejecutándose en http://localhost:${config.port}`);
  } catch (err) {
    console.error('❌ Error al arrancar el servidor API:', err);
    process.exit(1);
  }
}

start();
