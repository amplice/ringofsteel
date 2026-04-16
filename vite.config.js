import { defineConfig } from 'vite';
import { writeHumanAiMatchLog } from './server/ai-log-store.mjs';

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : null);
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function createHumanAiLogMiddleware() {
  return async (req, res, next) => {
    if (req.method !== 'POST' || req.url !== '/__ai_match_logs') {
      next();
      return;
    }

    try {
      const payload = await readJsonBody(req);
      if (!payload || typeof payload !== 'object') {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: false, error: 'Invalid payload' }));
        return;
      }

      const stored = writeHumanAiMatchLog(payload);
      console.log('[ai-log] stored', stored.relativePath);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, ...stored }));
    } catch (error) {
      console.error('[ai-log] failed', error);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: error?.message || 'Failed to store match log' }));
    }
  };
}

export default defineConfig({
  plugins: [{
    name: 'human-ai-log-endpoint',
    configureServer(server) {
      server.middlewares.use(createHumanAiLogMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createHumanAiLogMiddleware());
    },
  }],
  build: {
    target: 'esnext',
  },
  esbuild: {
    target: 'esnext',
  },
});
