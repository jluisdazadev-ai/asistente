import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma, GatewayProvider, ConnectionStatus } from '@crm/database';
import axios from 'axios';
import { config } from '../../config';
import { emitConnectionState } from '../../lib/socket';

export const connectionRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.addHook('preHandler', fastify.authenticate);

  // 1. Obtener estado de conexiones del Tenant
  fastify.get('/connections', async (request, reply) => {
    const tenantId = (request as any).user.tenantId;
    const sessionId = `session_${tenantId}`;

    const connections = await prisma.whatsAppConnection.findMany({
      where: { tenantId },
    });

    const qrConn = connections.find((c) => c.gatewayType === GatewayProvider.QR_BAILEYS);

    // Si está en proceso o sin QR en BD, sincronizar con el microservicio
    if (qrConn && qrConn.status !== ConnectionStatus.CONNECTED) {
      try {
        const qrRes = await axios.get(`${config.qrService.url}/sessions/${sessionId}/qr`, {
          headers: { 'x-service-secret': config.qrService.secret },
          timeout: 2000,
        });

        if (qrRes.data?.qrCodeBase64 && qrRes.data.qrCodeBase64 !== qrConn.qrCodeBase64) {
          qrConn.qrCodeBase64 = qrRes.data.qrCodeBase64;
          qrConn.status = ConnectionStatus.SCAN_QR;

          await prisma.whatsAppConnection.update({
            where: { id: qrConn.id },
            data: {
              status: ConnectionStatus.SCAN_QR,
              qrCodeBase64: qrRes.data.qrCodeBase64,
            },
          });
        }
      } catch (e) {
        // Microservicio aún inicializando
      }
    }

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
          forceReset: true,
        },
        {
          headers: {
            'x-service-secret': config.qrService.secret,
          },
          timeout: 10000,
        }
      );

      const status = response.data.status || 'STARTING';
      const qrCodeBase64 = response.data.qrCodeBase64 || null;

      // Guardar inmediatamente en Base de Datos
      const savedConn = await prisma.whatsAppConnection.upsert({
        where: { tenantId_gatewayType: { tenantId, gatewayType: GatewayProvider.QR_BAILEYS } },
        update: {
          status: status as ConnectionStatus,
          qrCodeBase64,
          sessionId,
          lastPingAt: new Date(),
        },
        create: {
          tenantId,
          gatewayType: GatewayProvider.QR_BAILEYS,
          status: status as ConnectionStatus,
          qrCodeBase64,
          sessionId,
          lastPingAt: new Date(),
        },
      });

      emitConnectionState(tenantId, {
        status,
        qrCodeBase64: qrCodeBase64 || undefined,
      });

      return reply.send({
        success: true,
        status,
        qrCodeBase64,
        connection: savedConn,
      });
    } catch (err: any) {
      console.warn('Microservicio QR iniciando en segundo plano:', err.message);

      await prisma.whatsAppConnection.upsert({
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

    const connection = await prisma.whatsAppConnection.upsert({
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
