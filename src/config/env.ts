import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function parseGaProperties(str: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!str) return result;
  const pairs = str.split(',');
  for (const pair of pairs) {
    const [alias, id] = pair.split(':');
    if (alias && id) {
      result[alias.trim().toLowerCase()] = id.trim();
    }
  }
  return result;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
  qdrantApiKey: process.env.QDRANT_API_KEY || '',
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/mikami_db',
  waSessionDir: path.resolve(process.env.WA_SESSION_DIR || './sessions'),
  knowledgeDir: path.resolve('./knowledge'),
  // Google Calendar OAuth2
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',
  // Obsidian
  obsidianVaultPath: process.env.OBSIDIAN_VAULT_PATH || '/myObsidianVaultFolder',
  obsidianMeetingFolder: process.env.OBSIDIAN_MEETING_FOLDER || 'Meetings',
  // Google Analytics
  gaPropertyId: process.env.GA_PROPERTY_ID || '',
  gaProperties: parseGaProperties(process.env.GA_PROPERTIES || ''),
};

export function validateEnv() {
  if (!config.geminiApiKey || config.geminiApiKey === 'your_gemini_api_key_here') {
    console.warn('⚠️ WARNING: GEMINI_API_KEY is not set properly in .env! AI features will require a valid key.');
  }
}
