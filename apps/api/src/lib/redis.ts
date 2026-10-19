import Redis from 'ioredis';
import { config } from '../config';

export const redisConnection = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null, // Requerido por BullMQ
  enableReadyCheck: false,
});

redisConnection.on('connect', () => {
  console.log('✅ Conexión establecida con Redis (BullMQ)');
});

redisConnection.on('error', (err) => {
  console.warn('⚠️ Alerta de Redis:', err.message);
});

export default redisConnection;
