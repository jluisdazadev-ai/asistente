import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma, GatewayProvider, ConnectionStatus } from '@crm/database';
import axios from 'axios';
import { config } from '../../config';

export const connectionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', fastify.authenticate);

  // 1. Obtener estado de conexiones del Tenant
  fastify.get('/connections', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;

    const connections = await prisma.whatsappConnection.findMany({
      where: { tenantId },
    });

    return reply.send({ connections });
  });

  // 2. Iniciar sesión QR con microservicio Baileys
  fastify.post('/connections/qr/init', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const sessionId = `session_${tenantId}`;

    try {
      const response = await axios.post(
        `${config.qrService.url}/sessions/init`,
        {
          tenantId,
          sessionId,
        },
        {
          headers: {
            'x-service-secret': config.qrService.secret,
          },
          timeout: 8000,
        }
      );

      return reply.send(response.data);
    } catch (err: any) {
      console.warn('Microservicio QR no accesible aún o iniciando:', err.message);
      // Actualizar estado en BD a STARTING
      await prisma.whatsappConnection.upsert({
        where: { tenantId_gatewayType: { tenantId, gatewayType: GatewayProvider.QR_BAILEYS } },
        update: { status: ConnectionStatus.STARTING, sessionId },
        create: {
          tenantId,
          gatewayType: GatewayProvider.QR_BAILEYS,
          status: ConnectionStatus.STARTING,
          sessionId,
        },
      });

      return reply.send({
        status: 'STARTING',
        message: 'Iniciando sesión en microservicio de WhatsApp...',
      });
    }
  });

  // 3. Guardar credenciales de Meta Cloud API Oficial
  fastify.post('/connections/meta', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const { wabaId, phoneNumberId, accessToken } = request.body as any;

    if (!phoneNumberId || !accessToken) {
      return reply.status(400).send({ error: 'Phone_Number_ID y Permanent_Access_Token requeridos.' });
    }

    const connection = await prisma.whatsappConnection.upsert({
      where: {
        tenantId_gatewayType: {
          tenantId,
          gatewayType: GatewayProvider.META_OFFICIAL,
        },
      },
      update: {
        wabaId,
        phoneNumberId,
        accessTokenEncrypted: accessToken,
        status: ConnectionStatus.CONNECTED,
        lastPingAt: new Date(),
      },
      create: {
        tenantId,
        gatewayType: GatewayProvider.META_OFFICIAL,
        wabaId,
        phoneNumberId,
        accessTokenEncrypted: accessToken,
        status: ConnectionStatus.CONNECTED,
        lastPingAt: new Date(),
      },
    });

    return reply.send({ success: true, connection });
  });
};
