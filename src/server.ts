import { config, validateEnv } from './config/env.js';
import { buildApp } from './app.js';
import { initDatabase } from './database/db.js';
import { indexKnowledgeBase } from './modules/knowledge/indexer.service.js';
import { connectWhatsApp } from './modules/whatsapp/baileys.service.js';

async function startServer() {
  console.log('\n🚀 Starting Mikami AI WhatsApp Assistant MVP Server...\n');

  validateEnv();

  // Initialize Database
  await initDatabase();

  // Auto Index Knowledge Base on startup if Qdrant & Gemini are ready
  try {
    console.log('🔄 Performing startup Knowledge Base indexing...');
    await indexKnowledgeBase();
  } catch (err) {
    console.warn('⚠️ Startup Knowledge Base indexing skipped or encountered an error:', (err as Error).message);
  }

  // Build Fastify Server
  const app = buildApp();

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`🌐 Server running at http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Connect to WhatsApp via Baileys
  try {
    await connectWhatsApp();
  } catch (err) {
    console.error('❌ Failed to start WhatsApp Baileys connection:', err);
  }
}

startServer();
