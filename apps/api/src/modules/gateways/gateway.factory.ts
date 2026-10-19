import { prisma, GatewayProvider } from '@crm/database';
import { IWhatsAppGateway } from './gateway.interface';
import { MetaCloudApiAdapter } from './meta.adapter';
import { BaileysAdapter } from './baileys.adapter';

export async function getGatewayForTenant(tenantId: string): Promise<IWhatsAppGateway> {
  const connection = await prisma.whatsappConnection.findFirst({
    where: {
      tenantId,
      status: 'CONNECTED',
    },
  });

  if (!connection) {
    // Si no hay ninguna conectada aún, intentar obtener la configurada por defecto
    const anyConn = await prisma.whatsappConnection.findFirst({
      where: { tenantId },
    });

    if (anyConn && anyConn.gatewayType === GatewayProvider.QR_BAILEYS) {
      return new BaileysAdapter(anyConn.sessionId || `session_${tenantId}`);
    }

    throw new Error(`El negocio (${tenantId}) no tiene una línea de WhatsApp conectada actualmente.`);
  }

  if (connection.gatewayType === GatewayProvider.META_OFFICIAL) {
    if (!connection.phoneNumberId || !connection.accessTokenEncrypted) {
      throw new Error('Configuración de Meta Cloud API incompleta (Faltan Phone_Number_ID o Access Token).');
    }
    return new MetaCloudApiAdapter(connection.phoneNumberId, connection.accessTokenEncrypted);
  }

  return new BaileysAdapter(connection.sessionId || `session_${tenantId}`);
}
