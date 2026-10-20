import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno desde la raíz
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config(); // fallback local

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.API_PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'crm_whatsapp_secret_key_default',

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // Gemini AI
  gemini: {
    apiKey: (process.env.GEMINI_API_KEY || '').replace(/["']/g, '').trim(),
    model: (process.env.GEMINI_MODEL || 'gemini-3.8-flash').replace(/["']/g, '').trim(),
    embeddingModel: (process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2').replace(/["']/g, '').trim(),
  },

  // Meta Cloud API
  meta: {
    graphApiVersion: process.env.META_GRAPH_API_VERSION || 'v21.0',
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || 'crm_whatsapp_verify_token_secure_99',
    appSecret: process.env.META_APP_SECRET || '',
  },

  // QR / Baileys Microservice
  qrService: {
    url: process.env.QR_SERVICE_URL || 'http://localhost:4001',
    secret: process.env.QR_WEBHOOK_SECRET || 'baileys_internal_secret_key_888',
  },

  // S3 / Cloudflare R2 / MinIO
  storage: {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    region: process.env.S3_REGION || 'auto',
    accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.S3_SECRET_KEY || 'minioadmin123',
    bucket: process.env.S3_BUCKET_NAME || 'whatsapp-crm-media',
    publicUrl: process.env.S3_PUBLIC_URL || 'http://localhost:9000/whatsapp-crm-media',
  },
};
