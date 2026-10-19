import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';

export const s3Client = new S3Client({
  endpoint: config.storage.endpoint,
  region: config.storage.region,
  credentials: {
    accessKeyId: config.storage.accessKey,
    secretAccessKey: config.storage.secretKey,
  },
  forcePathStyle: true, // Necesario para MinIO local
});

export async function uploadMedia(fileBuffer: Buffer, fileName: string, mimeType: string): Promise<string> {
  const key = `media/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.storage.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
      })
    );

    // Devuelve la URL pública accesible
    return `${config.storage.publicUrl}/${key}`;
  } catch (error: any) {
    console.warn('⚠️ Alerta en uploadMedia S3/R2 (fallback local):', error.message);
    // En fallback local si MinIO no está levantado aún, devuelve URI data o placeholder
    return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
  }
}
