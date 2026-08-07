import { validateEnv } from '../config/env.js';
import { indexKnowledgeBase } from '../modules/knowledge/indexer.service.js';

async function main() {
  console.log('--- Starting Standalone Knowledge Base Indexer ---');
  validateEnv();
  try {
    const result = await indexKnowledgeBase();
    console.log(`\n🎉 Indexing finished successfully! Processed ${result.indexedFiles} files and ${result.totalChunks} chunks.`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Indexing failed:', error);
    process.exit(1);
  }
}

main();
