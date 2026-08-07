import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../../config/env.js';
import { generateEmbedding } from '../ai/gemini.service.js';

export const COLLECTION_NAME = 'mikami_knowledge';
export const EMBEDDING_VECTOR_SIZE = 3072; // Dimension for gemini-embedding-001

export interface VectorChunk {
  id: number;
  text: string;
  sourceFile: string;
  vector: number[];
}

// In-Memory Vector Store Fallback (Works when Qdrant is not running)
export const memoryVectorStore: VectorChunk[] = [];

let qdrantClient: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    qdrantClient = new QdrantClient({
      url: config.qdrantUrl,
      apiKey: config.qdrantApiKey || undefined,
    });
  }
  return qdrantClient;
}

/**
 * Ensure Qdrant collection exists and is configured for vector search
 */
export async function ensureCollectionExists() {
  try {
    const client = getQdrantClient();
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);

    if (!exists) {
      console.log(`📦 Creating Qdrant collection "${COLLECTION_NAME}"...`);
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: EMBEDDING_VECTOR_SIZE,
          distance: 'Cosine',
        },
      });
      console.log(`✅ Qdrant collection "${COLLECTION_NAME}" created successfully.`);
    }
  } catch (error) {
    console.warn(`⚠️ Qdrant unavailable. Operating with local in-memory vector store.`);
  }
}

/**
 * Simple markdown/text content chunker by sections/paragraphs
 */
function chunkText(content: string, maxChunkLength = 600): string[] {
  const rawSections = content.split(/(?=\n#{1,3}\s)/);
  const chunks: string[] = [];

  for (const section of rawSections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    if (trimmed.length <= maxChunkLength) {
      chunks.push(trimmed);
    } else {
      const paragraphs = trimmed.split(/\n\n+/);
      let currentChunk = '';

      for (const para of paragraphs) {
        if ((currentChunk + '\n\n' + para).length <= maxChunkLength) {
          currentChunk = currentChunk ? `${currentChunk}\n\n${para}` : para;
        } else {
          if (currentChunk) chunks.push(currentChunk);
          currentChunk = para;
        }
      }
      if (currentChunk) chunks.push(currentChunk);
    }
  }

  return chunks;
}

/**
 * Scan knowledge directory and index all .md and .txt files into Qdrant & In-Memory Store
 */
export async function indexKnowledgeBase() {
  console.log(`🔍 Scanning knowledge base directory: ${config.knowledgeDir}`);
  await ensureCollectionExists();

  const files = await glob('**/*.{md,txt}', { cwd: config.knowledgeDir, absolute: true });

  if (files.length === 0) {
    console.log('⚠️ No markdown or text files found in knowledge directory.');
    return { indexedFiles: 0, totalChunks: 0 };
  }

  memoryVectorStore.length = 0; // Clear memory store before re-indexing
  let totalChunks = 0;
  let pointIdCounter = 1;

  const pointsToUpsert = [];

  for (const filePath of files) {
    const relativePath = path.relative(config.knowledgeDir, filePath);
    console.log(`📄 Indexing document: ${relativePath}`);
    const content = fs.readFileSync(filePath, 'utf-8');
    const chunks = chunkText(content);

    for (let idx = 0; idx < chunks.length; idx++) {
      const chunkTextContent = chunks[idx];
      try {
        const vector = await generateEmbedding(chunkTextContent);
        
        const chunkObj: VectorChunk = {
          id: pointIdCounter++,
          text: chunkTextContent,
          sourceFile: relativePath,
          vector,
        };

        memoryVectorStore.push(chunkObj);

        pointsToUpsert.push({
          id: chunkObj.id,
          vector,
          payload: {
            text: chunkTextContent,
            sourceFile: relativePath,
            chunkIndex: idx,
          },
        });
        totalChunks++;
      } catch (err) {
        console.error(`Failed to generate embedding for chunk ${idx} in ${relativePath}:`, (err as Error).message);
      }
    }
  }

  // Try Qdrant upsert if Qdrant server is available
  try {
    if (pointsToUpsert.length > 0) {
      const client = getQdrantClient();
      await client.upsert(COLLECTION_NAME, { points: pointsToUpsert });
      console.log(`✅ Upserted ${pointsToUpsert.length} vectors to Qdrant.`);
    }
  } catch (err) {
    console.log(`ℹ️ Qdrant not available; stored ${memoryVectorStore.length} vectors in local memory fallback.`);
  }

  console.log(`🎉 Knowledge base indexing complete! Total ${totalChunks} chunks active.`);
  return { indexedFiles: files.length, totalChunks };
}
