import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import qrcode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
  proto,
} from '@whiskeysockets/baileys';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

const PORT = parseInt(process.env.QR_SERVICE_PORT || '4001', 10);
const API_URL = process.env.API_URL || 'http://localhost:4000';
const SERVICE_SECRET = process.env.QR_WEBHOOK_SECRET || 'baileys_internal_secret_key_888';

// Mapa de sockets activos por sessionId
const activeSessions = new Map<string, WASocket>();

const app = Fastify({
  logger: false,
});

app.register(cors, { origin: '*' });

// Helper para despachar webhooks hacia la API principal
async function dispatchWebhookToApi(tenantId: string, event: string, data: any) {
  try {
    await axios.post(
      `${API_URL}/api/webhooks/baileys`,
      { tenantId, event, data },
      {
        headers: {
          'x-service-secret': SERVICE_SECRET,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      }
    );
  } catch (err: any) {
    console.warn(`⚠️ Error notificando webhook a la API principal (${event}):`, err.message);
  }
}

// Inicializa o reanuda una sesión de WhatsApp
async function startBaileysSession(tenantId: string, sessionId: string) {
  if (activeSessions.has(sessionId)) {
    console.log(`Sesión ${sessionId} ya se encuentra activa.`);
    return activeSessions.get(sessionId)!;
  }

  const authDir = path.join(process.cwd(), 'baileys_auth_info', sessionId);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    syncFullHistory: false,
  });

  activeSessions.set(sessionId, sock);

  // Escuchar actualización de credenciales
  sock.ev.on('creds.update', saveCreds);

  // Escuchar estado de conexión y generación de QR
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(`📱 [QR Generado] Nuevo código QR para sesión ${sessionId}`);
      const qrCodeBase64 = await qrcode.toDataURL(qr);
      await dispatchWebhookToApi(tenantId, 'connection.update', {
        status: 'SCAN_QR',
        qrCodeBase64,
      });
    }

    if (connection === 'open') {
      const phoneNumber = sock.user?.id?.split(':')[0] || '';
      console.log(`✅ [WhatsApp Conectado] Sesión ${sessionId} vinculada al número: +${phoneNumber}`);
      await dispatchWebhookToApi(tenantId, 'connection.update', {
        status: 'CONNECTED',
        phoneNumber,
      });
    } else if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`🔌 [WhatsApp Desconectado] Sesión ${sessionId}. Código: ${statusCode}. Reconectar: ${shouldReconnect}`);

      activeSessions.delete(sessionId);

      await dispatchWebhookToApi(tenantId, 'connection.update', {
        status: 'DISCONNECTED',
      });

      if (shouldReconnect) {
        console.log(`Reintentando reconexión automática en 3s para ${sessionId}...`);
        setTimeout(() => startBaileysSession(tenantId, sessionId), 3000);
      }
    }
  });

  // Escuchar mensajes entrantes
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;

    for (const msg of m.messages) {
      if (msg.key.fromMe) continue;

      let mediaBase64: string | undefined = undefined;

      // Si es audio o imagen, intentar procesar
      await dispatchWebhookToApi(tenantId, 'messages.upsert', {
        message: msg,
        mediaBase64,
      });
    }
  });

  return sock;
}

// ========================================================
// ENDPOINTS DEL MICROSERVICIO
// ========================================================

// 1. Iniciar sesión / Generar QR
app.post('/sessions/init', async (request, reply) => {
  const secret = request.headers['x-service-secret'];
  if (secret !== SERVICE_SECRET) return reply.status(401).send({ error: 'Unauthorized' });

  const { tenantId, sessionId } = request.body as any;
  if (!tenantId || !sessionId) return reply.status(400).send({ error: 'tenantId y sessionId requeridos' });

  await startBaileysSession(tenantId, sessionId);
  return reply.send({ success: true, status: 'STARTING' });
});

// 2. Enviar mensaje de texto
app.post('/sessions/:sessionId/messages/text', async (request, reply) => {
  const secret = request.headers['x-service-secret'];
  if (secret !== SERVICE_SECRET) return reply.status(401).send({ error: 'Unauthorized' });

  const { sessionId } = request.params as any;
  const { recipient, text } = request.body as any;

  const sock = activeSessions.get(sessionId);
  if (!sock) {
    return reply.status(400).send({ error: `La sesión ${sessionId} no está conectada.` });
  }

  const jid = `${recipient}@s.whatsapp.net`;
  const sent = await sock.sendMessage(jid, { text });

  return reply.send({ success: true, messageId: sent?.key.id });
});

// 3. Enviar presencia (composing / paused)
app.post('/sessions/:sessionId/presence', async (request, reply) => {
  const secret = request.headers['x-service-secret'];
  if (secret !== SERVICE_SECRET) return reply.status(401).send({ error: 'Unauthorized' });

  const { sessionId } = request.params as any;
  const { recipient, state } = request.body as any;

  const sock = activeSessions.get(sessionId);
  if (sock) {
    const jid = `${recipient}@s.whatsapp.net`;
    await sock.sendPresenceUpdate(state, jid);
  }

  return reply.send({ success: true });
});

// 4. Enviar archivo multimedia
app.post('/sessions/:sessionId/messages/media', async (request, reply) => {
  const secret = request.headers['x-service-secret'];
  if (secret !== SERVICE_SECRET) return reply.status(401).send({ error: 'Unauthorized' });

  const { sessionId } = request.params as any;
  const { recipient, mediaUrl, mimeType, caption } = request.body as any;

  const sock = activeSessions.get(sessionId);
  if (!sock) return reply.status(400).send({ error: 'Sesión no conectada' });

  const jid = `${recipient}@s.whatsapp.net`;

  let sent;
  if (mimeType.startsWith('image/')) {
    sent = await sock.sendMessage(jid, { image: { url: mediaUrl }, caption });
  } else if (mimeType.startsWith('audio/')) {
    sent = await sock.sendMessage(jid, { audio: { url: mediaUrl }, ptt: true });
  } else {
    sent = await sock.sendMessage(jid, { document: { url: mediaUrl }, mimetype: mimeType, fileName: caption || 'archivo' });
  }

  return reply.send({ success: true, messageId: sent?.key.id });
});

// Iniciar servidor
app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error('Error al arrancar microservicio Baileys:', err);
    process.exit(1);
  }
  console.log(`⚡ [Microservicio Baileys QR] Escuchando en ${address}`);
});
