import Fastify from 'fastify';
import { knowledgeRoutes } from './routes/knowledge.routes.js';
import { authRoutes } from './routes/auth.route.js';

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
  app.register(authRoutes);

  return app;
}
