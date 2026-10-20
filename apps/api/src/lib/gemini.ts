import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { config } from '../config';

function getGenAI(): GoogleGenerativeAI {
  const rawKey = process.env.GEMINI_API_KEY || config.gemini.apiKey || '';
  const apiKey = rawKey.replace(/["']/g, '').trim();
  if (!apiKey || apiKey === 'AIzaSy_TU_LLAVE_DE_GEMINI_AQUI') {
    console.warn('⚠️ [Gemini] GEMINI_API_KEY no está configurada o contiene el placeholder de ejemplo en .env');
  }
  return new GoogleGenerativeAI(apiKey || 'MOCK_KEY_FOR_DEV');
}

export function getGeminiModel(options?: {
  systemInstruction?: string;
  temperature?: number;
  tools?: any[];
  modelOverride?: string;
}) {
  const genAI = getGenAI();
  let modelName = options?.modelOverride || (process.env.GEMINI_MODEL || config.gemini.model || 'gemini-3.8-flash').replace(/["']/g, '').trim();

  // Compatibilidad automática con cuentas recientes (Google deprecó 1.5 y 2.5 para nuevas cuentas)
  if (modelName === 'gemini-1.5-flash' || modelName === 'gemini-2.5-flash' || modelName === 'gemini-1.5-pro') {
    modelName = 'gemini-3.8-flash';
  }

  return genAI.getGenerativeModel(
    {
      model: modelName,
      systemInstruction: options?.systemInstruction,
      generationConfig: {
        temperature: options?.temperature ?? 0.4,
      },
      tools: options?.tools,
    },
    { apiVersion: 'v1beta' }
  );
}

/**
 * Genera el vector embedding para búsqueda semántica RAG
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    let embeddingModelName = (process.env.GEMINI_EMBEDDING_MODEL || config.gemini.embeddingModel || 'gemini-embedding-2').replace(/["']/g, '').trim();
    if (embeddingModelName === 'text-embedding-004') {
      embeddingModelName = 'gemini-embedding-2';
    }
    const embeddingModel = getGenAI().getGenerativeModel({ model: embeddingModelName }, { apiVersion: 'v1beta' });
    const result = await embeddingModel.embedContent(text);
    return result.embedding.values;
  } catch (error: any) {
    console.error('Error generando embedding en Gemini:', error.message);
    // Devuelve vector de 768 ceros en caso de fallback de desarrollo
    return new Array(768).fill(0);
  }
}

/**
 * Analiza un comprobante bancario o imagen con Gemini Vision
 */
export async function analyzeReceiptImage(imageBase64: string, mimeType: string = 'image/jpeg') {
  let modelName = (process.env.GEMINI_MODEL || config.gemini.model || 'gemini-3.8-flash').replace(/["']/g, '').trim();
  if (modelName === 'gemini-1.5-flash' || modelName === 'gemini-2.5-flash') {
    modelName = 'gemini-3.8-flash';
  }

  const model = getGenAI().getGenerativeModel(
    {
      model: modelName,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    },
    { apiVersion: 'v1beta' }
  );

  const prompt = `Analiza detenidamente esta imagen de comprobante de pago o transferencia bancaria (ej. Nequi, Bancolombia, Daviplata, etc.).
Extrae la información en el siguiente esquema JSON estricto:
{
  "is_valid_receipt": boolean,
  "bank_name": string | null,
  "amount": number | null,
  "reference_code": string | null,
  "date_time": string | null,
  "sender_name": string | null,
  "receiver_name": string | null,
  "confidence_score": number (0 a 1)
}`;

  const imagePart: Part = {
    inlineData: {
      data: imageBase64,
      mimeType,
    },
  };

  try {
    const response = await model.generateContent([prompt, imagePart]);
    const text = response.response.text();
    return JSON.parse(text);
  } catch (error: any) {
    console.error('Error en análisis de comprobante con Gemini Vision:', error.message);
    return {
      is_valid_receipt: false,
      bank_name: null,
      amount: null,
      reference_code: null,
      error: error.message,
    };
  }
}

export default getGenAI;
