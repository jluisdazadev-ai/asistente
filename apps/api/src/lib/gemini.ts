import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { config } from '../config';

function getGenAI(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY || config.gemini.apiKey || 'MOCK_KEY_FOR_DEV';
  return new GoogleGenerativeAI(apiKey);
}

export function getGeminiModel(options?: {
  systemInstruction?: string;
  temperature?: number;
  tools?: any[];
}) {
  const genAI = getGenAI();
  return genAI.getGenerativeModel({
    model: config.gemini.model,
    systemInstruction: options?.systemInstruction,
    generationConfig: {
      temperature: options?.temperature ?? 0.4,
    },
    tools: options?.tools,
  });
}

/**
 * Genera el vector embedding para búsqueda semántica RAG
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const embeddingModel = getGenAI().getGenerativeModel({ model: config.gemini.embeddingModel });
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
  const model = getGenAI().getGenerativeModel({
    model: config.gemini.model,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

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
