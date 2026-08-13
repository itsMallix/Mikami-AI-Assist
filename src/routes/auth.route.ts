import { FastifyInstance } from 'fastify';
import { getAuthUrl, exchangeCodeForToken, isAuthenticated } from '../modules/calendar/calendar.auth.js';

export async function authRoutes(app: FastifyInstance) {
  // Redirect to Google OAuth consent page
  app.get('/auth/google', async (_req, reply) => {
    const url = getAuthUrl();
    return reply.redirect(url);
  });

  // Handle OAuth2 callback and exchange code for token
  app.get<{ Querystring: { code?: string; error?: string } }>('/auth/google/callback', async (req, reply) => {
    const { code, error } = req.query;

    if (error) {
      return reply.status(400).send({ success: false, message: `OAuth error: ${error}` });
    }

    if (!code) {
      return reply.status(400).send({ success: false, message: 'Missing authorization code' });
    }

    try {
      await exchangeCodeForToken(code);
      return reply.type('text/html').send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <meta charset="UTF-8">
          <title>Google Calendar Terhubung</title>
          <style>
            body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0fdf4; }
            .card { background: white; border-radius: 16px; padding: 40px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,.08); max-width: 400px; }
            h1 { color: #16a34a; font-size: 1.5rem; }
            p { color: #555; }
            .check { font-size: 4rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="check">✅</div>
            <h1>Google Calendar Terhubung!</h1>
            <p>Kamu sekarang bisa menutup tab ini.</p>
            <p>Coba ketik <strong>/jadwal</strong> di WhatsApp.</p>
          </div>
        </body>
        </html>
      `);
    } catch (err) {
      return reply.status(500).send({ success: false, message: (err as Error).message });
    }
  });

  // Status endpoint
  app.get('/auth/google/status', async (_req, reply) => {
    return reply.send({ authenticated: isAuthenticated() });
  });
}
