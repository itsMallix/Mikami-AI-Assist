import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../../config/env.js';

let genAIInstance: GoogleGenerativeAI | null = null;

function getAiClient(): GoogleGenerativeAI {
  if (!genAIInstance) {
    if (!config.geminiApiKey || config.geminiApiKey === 'your_gemini_api_key_here') {
      throw new Error('GEMINI_API_KEY belum dikonfigurasi di file .env');
    }
    genAIInstance = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return genAIInstance;
}

/**
 * Generate embedding vector using Gemini Embedding API (Direct model call for speed)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const ai = getAiClient();
    const model = ai.getGenerativeModel({ model: 'gemini-embedding-001' });
    const response = await model.embedContent(text);
    if (response.embedding?.values) {
      return response.embedding.values;
    }
    throw new Error('No embedding values returned');
  } catch (error) {
    console.error('Error generating Gemini embedding:', (error as Error).message);
    throw error;
  }
}

/**
 * Generate chat completion using Gemini Flash (Direct model call for speed)
 */
export async function generateChatResponse(systemInstruction: string, userPrompt: string): Promise<string> {
  try {
    const ai = getAiClient();
    const model = ai.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction: systemInstruction,
    });

    const response = await model.generateContent(userPrompt);
    const responseText = response.response.text();
    return responseText || 'Maaf, saya tidak dapat memproses jawaban saat ini.';
  } catch (error) {
    console.error('Error generating Gemini chat completion:', (error as Error).message);
    return 'Bising bodo aku nak tido 😹🥱';
  }
}
