import { FastifyInstance } from 'fastify';
import { indexKnowledgeBase } from '../modules/knowledge/indexer.service.js';

export async function knowledgeRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    return { status: 'ok', service: 'Mikami AI WhatsApp Assistant MVP' };
  });

  fastify.post('/knowledge/index', async (request, reply) => {
    try {
      const result = await indexKnowledgeBase();
      return reply.send({
        success: true,
        message: 'Knowledge base successfully indexed into Qdrant vector database.',
        data: result,
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: (error as Error).message,
      });
    }
  });
}
