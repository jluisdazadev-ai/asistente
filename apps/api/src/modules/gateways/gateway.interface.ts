export interface SendMessageOptions {
  recipient: string; // Número de teléfono (E.164 o con código país)
  text: string;
}

export interface SendMediaOptions {
  recipient: string;
  mediaUrl: string;
  mimeType: string;
  caption?: string;
  fileName?: string;
}

export interface SendTemplateOptions {
  recipient: string;
  templateName: string;
  languageCode: string;
  components?: any[];
}

export interface IWhatsAppGateway {
  sendMessage(options: SendMessageOptions): Promise<{ messageId: string }>;
  sendMedia(options: SendMediaOptions): Promise<{ messageId: string }>;
  sendPresence(recipient: string, state: 'composing' | 'recording' | 'paused'): Promise<void>;
  sendTemplate?(options: SendTemplateOptions): Promise<{ messageId: string }>;
}
