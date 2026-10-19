import axios from 'axios';
import { IWhatsAppGateway, SendMessageOptions, SendMediaOptions, SendTemplateOptions } from './gateway.interface';
import { config } from '../../config';

export class MetaCloudApiAdapter implements IWhatsAppGateway {
  private phoneNumberId: string;
  private accessToken: string;
  private baseUrl: string;

  constructor(phoneNumberId: string, accessToken: string) {
    this.phoneNumberId = phoneNumberId;
    this.accessToken = accessToken;
    this.baseUrl = `https://graph.facebook.com/${config.meta.graphApiVersion}/${this.phoneNumberId}`;
  }

  async sendMessage(options: SendMessageOptions): Promise<{ messageId: string }> {
    const formattedPhone = options.recipient.replace(/[^0-9]/g, '');

    const response = await axios.post(
      `${this.baseUrl}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: { preview_url: true, body: options.text },
      },
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return { messageId: response.data.messages?.[0]?.id || 'meta_' + Date.now() };
  }

  async sendMedia(options: SendMediaOptions): Promise<{ messageId: string }> {
    const formattedPhone = options.recipient.replace(/[^0-9]/g, '');
    const isImage = options.mimeType.startsWith('image/');
    const isAudio = options.mimeType.startsWith('audio/');
    const mediaType = isImage ? 'image' : isAudio ? 'audio' : 'document';

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: mediaType,
      [mediaType]: {
        link: options.mediaUrl,
        ...(options.caption && isImage ? { caption: options.caption } : {}),
      },
    };

    const response = await axios.post(`${this.baseUrl}/messages`, payload, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    return { messageId: response.data.messages?.[0]?.id || 'meta_' + Date.now() };
  }

  async sendPresence(recipient: string, state: 'composing' | 'recording' | 'paused'): Promise<void> {
    // Meta Cloud API no soporta presencia de typing directo en todos los tiers sin business verification previa,
    // pero se maneja silenciosamente.
    return Promise.resolve();
  }

  async sendTemplate(options: SendTemplateOptions): Promise<{ messageId: string }> {
    const formattedPhone = options.recipient.replace(/[^0-9]/g, '');

    const response = await axios.post(
      `${this.baseUrl}/messages`,
      {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'template',
        template: {
          name: options.templateName,
          language: { code: options.languageCode },
          components: options.components || [],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return { messageId: response.data.messages?.[0]?.id || 'meta_' + Date.now() };
  }
}
