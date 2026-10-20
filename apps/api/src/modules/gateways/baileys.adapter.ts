import axios from 'axios';
import { IWhatsAppGateway, SendMessageOptions, SendMediaOptions } from './gateway.interface';
import { config } from '../../config';

export class BaileysAdapter implements IWhatsAppGateway {
  private sessionId: string;
  private serviceUrl: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.serviceUrl = config.qrService.url;
  }

  async sendMessage(options: SendMessageOptions): Promise<{ messageId: string }> {
    const recipient = options.recipient.trim();

    const response = await axios.post(
      `${this.serviceUrl}/sessions/${this.sessionId}/messages/text`,
      {
        recipient,
        text: options.text,
      },
      {
        headers: {
          'x-service-secret': config.qrService.secret,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    return { messageId: response.data.messageId || 'baileys_' + Date.now() };
  }

  async sendMedia(options: SendMediaOptions): Promise<{ messageId: string }> {
    const recipient = options.recipient.trim();

    const response = await axios.post(
      `${this.serviceUrl}/sessions/${this.sessionId}/messages/media`,
      {
        recipient,
        mediaUrl: options.mediaUrl,
        mimeType: options.mimeType,
        caption: options.caption,
      },
      {
        headers: {
          'x-service-secret': config.qrService.secret,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    return { messageId: response.data.messageId || 'baileys_' + Date.now() };
  }

  async sendPresence(recipient: string, state: 'composing' | 'recording' | 'paused'): Promise<void> {
    try {
      await axios.post(
        `${this.serviceUrl}/sessions/${this.sessionId}/presence`,
        {
          recipient: recipient.trim(),
          state,
        },
        {
          headers: {
            'x-service-secret': config.qrService.secret,
            'Content-Type': 'application/json',
          },
          timeout: 4000,
        }
      );
    } catch (err: any) {
      // Ignorar errores de presencia para no bloquear el flujo de mensajes
    }
  }
}
