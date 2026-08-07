import Fastify from 'fastify';
import { knowledgeRoutes } from './routes/knowledge.routes.js';

export function buildApp() {
  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Register routes
  app.register(knowledgeRoutes);

  return app;
}
