import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
  qdrantApiKey: process.env.QDRANT_API_KEY || '',
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/mikami_db',
  waSessionDir: path.resolve(process.env.WA_SESSION_DIR || './sessions'),
  knowledgeDir: path.resolve('./knowledge'),
};

export function validateEnv() {
  if (!config.geminiApiKey || config.geminiApiKey === 'your_gemini_api_key_here') {
    console.warn('⚠️ WARNING: GEMINI_API_KEY is not set properly in .env! AI features will require a valid key.');
  }
}
