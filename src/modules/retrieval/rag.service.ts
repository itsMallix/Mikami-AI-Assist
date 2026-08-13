import fs from 'fs';
import path from 'path';
import { getQdrantClient, COLLECTION_NAME, memoryVectorStore } from '../knowledge/indexer.service.js';
import { generateEmbedding, generateChatResponse } from '../ai/gemini.service.js';
import { config } from '../../config/env.js';

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Load system instruction dynamically from knowledge/personalize/ folder if exists
 */
function getSystemInstructionBase(): string {
  const personalizeDir = path.join(config.knowledgeDir, 'personalize');
  const possibleFiles = ['personalize.md', 'prompt.md', 'system.md', 'persona.md'];

  for (const fileName of possibleFiles) {
    const filePath = path.join(personalizeDir, fileName);
    if (fs.existsSync(filePath)) {
      try {
        const customPrompt = fs.readFileSync(filePath, 'utf-8').trim();
        if (customPrompt) {
          return customPrompt;
        }
      } catch (err) {
        console.warn(`Failed to read personalize prompt file ${filePath}:`, (err as Error).message);
      }
    }
  }

  return `Kamu adalah "Mikami", Asisten Customer Support AI yang ramah, sopan, dan profesional.
Tugas utama kamu adalah menjawab pertanyaan pelanggan berdasarkan Konteks Pengetahuan (Knowledge Base) yang diberikan di bawah ini.`;
}

/**
 * Load sticker instructions dynamically from knowledge/sticker/ folder if exists
 */
function getStickerInstruction(): string {
  const stickerDir = path.join(config.knowledgeDir, 'sticker');
  if (fs.existsSync(stickerDir)) {
    try {
      const files = fs.readdirSync(stickerDir).filter((f) => f.endsWith('.md'));
      let combined = '';
      for (const f of files) {
        combined += fs.readFileSync(path.join(stickerDir, f), 'utf-8') + '\n\n';
      }
      return combined.trim();
    } catch (err) {
      console.warn('Failed to read sticker instruction files:', (err as Error).message);
    }
  }
  return '';
}

export async function processRAGQuery(userMessage: string, senderNumber?: string): Promise<string> {
  let contextChunks: string[] = [];

  try {
    // 1. Generate query embedding
    const queryVector = await generateEmbedding(userMessage);

    // 2. Try Qdrant vector search
    try {
      const client = getQdrantClient();
      const searchResponse = await (client as any).query(COLLECTION_NAME, {
        query: queryVector,
        limit: 5,
      });

      const points = searchResponse?.points || [];
      contextChunks = points
        .map((res: { payload?: { text?: string } }) => res.payload?.text || '')
        .filter((text: string) => text.trim().length > 0);
    } catch (err) {
      // Qdrant failed -> Use in-memory vector store fallback
    }

    // 3. Fallback to in-memory cosine similarity search if Qdrant was empty or offline
    if (contextChunks.length === 0 && memoryVectorStore.length > 0) {
      const scored = memoryVectorStore
        // Exclude personalize/ and sticker/ files from knowledge retrieval context chunks
        .filter((chunk) => !chunk.sourceFile.includes('personalize') && !chunk.sourceFile.includes('sticker'))
        .map((chunk) => ({
          text: chunk.text,
          score: cosineSimilarity(queryVector, chunk.vector),
        }));

      scored.sort((a, b) => b.score - a.score);
      contextChunks = scored.slice(0, 5).map((s) => s.text);
    }
  } catch (error) {
    console.warn('⚠️ Vector search encounter error. Proceeding with general prompt:', (error as Error).message);
  }

  // 4. Retrieve user memory if database is reachable and sender is specified
  let memoryInstruction = '';
  if (senderNumber) {
    try {
      const { getUserMemories } = await import('../../database/db.js');
      const memories = await getUserMemories(senderNumber);
      if (memories.length > 0) {
        memoryInstruction = `\n\n--- MEMORI TENTANG PENGGUNA INI (${senderNumber}) ---\nKamu mengingat informasi berikut tentang pengguna ini:\n${memories.map((m, i) => `- ${m}`).join('\n')}\nGunakan memori ini jika relevan untuk mempersonalisasi jawabanmu.`;
      }
    } catch (err) {
      // Ignore memory read errors
    }
  }

  // 5. Construct System Prompt from personalize file + sticker rules + Context Chunks + User Memories
  const baseInstruction = getSystemInstructionBase();
  const stickerInstruction = getStickerInstruction();

  const contextFormatted = contextChunks.length > 0
    ? contextChunks.map((chunk, i) => `[Konteks ${i + 1}]:\n${chunk}`).join('\n\n')
    : 'Tidak ada dokumen spesifik yang ditemukan di knowledge base.';

  let fullSystemInstruction = baseInstruction;
  if (stickerInstruction) {
    fullSystemInstruction += `\n\n--- INSTRUKSI STIKER ---\n${stickerInstruction}`;
  }

  if (memoryInstruction) {
    fullSystemInstruction += memoryInstruction;
  }

  fullSystemInstruction += `\n\n--- KONTEKS PENGETAHUAN ---\n${contextFormatted}\n---------------------------`;

  // 6. Generate final AI chat response
  const aiAnswer = await generateChatResponse(fullSystemInstruction, userMessage);
  return aiAnswer;
}
