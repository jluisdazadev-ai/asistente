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
  Browsers,
} from '@whiskeysockets/baileys';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

const PORT = parseInt(process.env.QR_SERVICE_PORT || '4001', 10);
const API_URL = process.env.API_URL || 'http://localhost:4000';
const SERVICE_SECRET = process.env.QR_WEBHOOK_SECRET || 'baileys_internal_secret_key_888';

// Mapa de sockets activos por sessionId
const activeSessions = new Map<string, WASocket>();
// Mapa en memoria del último código QR base64 generado
const latestQrMap = new Map<string, string>();
const sessionStatusMap = new Map<string, string>();
const reconnectTimeouts = new Map<string, NodeJS.Timeout>();

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

// Inicializa o renueva una sesión de WhatsApp
async function startBaileysSession(tenantId: string, sessionId: string, forceReset = true): Promise<{ status: string; qrCodeBase64?: string }> {
  // Cancelar reconexiones pendientes para esta sesión
  if (reconnectTimeouts.has(sessionId)) {
    clearTimeout(reconnectTimeouts.get(sessionId)!);
    reconnectTimeouts.delete(sessionId);
  }

  // Si ya existía una sesión en memoria, cerrar listeners y socket
  if (activeSessions.has(sessionId)) {
    try {
      const oldSock = activeSessions.get(sessionId);
      oldSock?.ev.removeAllListeners('connection.update');
      oldSock?.ev.removeAllListeners('creds.update');
      oldSock?.ev.removeAllListeners('messages.upsert');
      oldSock?.end(undefined);
    } catch {}
    activeSessions.delete(sessionId);
  }

  const authDir = path.join(process.cwd(), 'baileys_auth_info', sessionId);
  if (forceReset && fs.existsSync(authDir)) {
    try {
      fs.rmSync(authDir, { recursive: true, force: true });
    } catch {}
  }
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  let version: any;
  try {
    const v = await fetchLatestBaileysVersion();
    version = v.version;
  } catch {
    version = [2, 3000, 1043857760];
  }
  console.log(`📦 [Baileys] Sesión ${sessionId} iniciando con WhatsApp Web v${version.join('.')}`);

  sessionStatusMap.set(sessionId, 'STARTING');

  return new Promise((resolve) => {
    let hasResolved = false;

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: true,
      auth: state,
      browser: typeof Browsers !== 'undefined' ? Browsers.macOS('Desktop') : ['Mac OS', 'Desktop', '14.4.1'],
      syncFullHistory: false,
      defaultQueryTimeoutMs: undefined,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      getMessage: async () => undefined,
    });

    activeSessions.set(sessionId, sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`📱 [QR Generado] Código QR emitido para sesión ${sessionId}`);
        const qrCodeBase64 = await qrcode.toDataURL(qr);
        latestQrMap.set(sessionId, qrCodeBase64);
        sessionStatusMap.set(sessionId, 'SCAN_QR');

        await dispatchWebhookToApi(tenantId, 'connection.update', {
          status: 'SCAN_QR',
          qrCodeBase64,
        });

        if (!hasResolved) {
          hasResolved = true;
          resolve({ status: 'SCAN_QR', qrCodeBase64 });
        }
      }

      if (connection === 'open') {
        const rawId = sock.user?.id || '';
        const phoneNumber = rawId.split(':')[0]?.split('@')[0] || '';
        console.log(`✅ [WhatsApp Conectado] Sesión ${sessionId} vinculada al número: +${phoneNumber}`);
        latestQrMap.delete(sessionId);
        sessionStatusMap.set(sessionId, 'CONNECTED');

        await dispatchWebhookToApi(tenantId, 'connection.update', {
          status: 'CONNECTED',
          phoneNumber,
        });

        if (!hasResolved) {
          hasResolved = true;
          resolve({ status: 'CONNECTED' });
        }
      } else if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode ?? (lastDisconnect?.error as any)?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`🔌 [WhatsApp Conexión Cerrada] Sesión ${sessionId}. Código: ${statusCode}. ¿Reconectar?: ${shouldReconnect}`);

        activeSessions.delete(sessionId);

        if (shouldReconnect) {
          console.log(`🔄 [Reconectando] Reanudando sesión ${sessionId} tras código ${statusCode} (manteniendo credenciales)...`);
          const timer = setTimeout(() => {
            reconnectTimeouts.delete(sessionId);
            startBaileysSession(tenantId, sessionId, false);
          }, 1500);
          reconnectTimeouts.set(sessionId, timer);
        } else {
          console.log(`❌ [Sesión Finalizada] Usuario desconectó sesión ${sessionId} (Logged Out).`);
          latestQrMap.delete(sessionId);
          sessionStatusMap.set(sessionId, 'DISCONNECTED');

          const authDir = path.join(process.cwd(), 'baileys_auth_info', sessionId);
          if (fs.existsSync(authDir)) {
            try {
              fs.rmSync(authDir, { recursive: true, force: true });
            } catch {}
          }

          await dispatchWebhookToApi(tenantId, 'connection.update', {
            status: 'DISCONNECTED',
          });
        }
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;
      for (const msg of m.messages) {
        if (msg.key.fromMe) continue;
        await dispatchWebhookToApi(tenantId, 'messages.upsert', {
          message: msg,
        });
      }
    });

    // Timeout de seguridad por si Baileys tarda en emitir el primer socket update
    setTimeout(() => {
      if (!hasResolved) {
        hasResolved = true;
        const existingQr = latestQrMap.get(sessionId);
        resolve({
          status: existingQr ? 'SCAN_QR' : 'STARTING',
          qrCodeBase64: existingQr,
        });
      }
    }, 7000);
  });
}

// ========================================================
// ENDPOINTS DEL MICROSERVICIO
// ========================================================

// 1. Iniciar sesión / Generar QR (espera y devuelve el QR si se genera rápido)
app.post('/sessions/init', async (request, reply) => {
  const secret = request.headers['x-service-secret'];
  if (secret !== SERVICE_SECRET) return reply.status(401).send({ error: 'Unauthorized' });

  const { tenantId, sessionId, forceReset } = request.body as any;
  if (!tenantId || !sessionId) return reply.status(400).send({ error: 'tenantId y sessionId requeridos' });

  console.log(`⚡ [Init Baileys] Solicitud de generación de QR para tenant ${tenantId}...`);
  const result = await startBaileysSession(tenantId, sessionId, forceReset ?? true);

  return reply.send({
    success: true,
    status: result.status,
    qrCodeBase64: result.qrCodeBase64 || latestQrMap.get(sessionId),
  });
});

// 2. Consultar QR y estado actual
app.get('/sessions/:sessionId/qr', async (request, reply) => {
  const secret = request.headers['x-service-secret'];
  if (secret !== SERVICE_SECRET) return reply.status(401).send({ error: 'Unauthorized' });

  const { sessionId } = request.params as any;
  const qrCodeBase64 = latestQrMap.get(sessionId);
  const status = sessionStatusMap.get(sessionId) || (activeSessions.has(sessionId) ? 'SCAN_QR' : 'DISCONNECTED');

  return reply.send({
    status,
    qrCodeBase64,
  });
});

// 3. Enviar mensaje de texto
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

// 4. Enviar presencia (composing / paused)
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

// 5. Enviar archivo multimedia
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

app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error('Error al arrancar microservicio Baileys:', err);
    process.exit(1);
  }
  console.log(`⚡ [Microservicio Baileys QR] Escuchando en ${address}`);
});
