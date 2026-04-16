import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createServer } from 'node:http';
import { writeHumanAiMatchLog } from './server/ai-log-store.mjs';

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const DIST_DIR = join(process.cwd(), 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function safeResolve(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = normalize(join(DIST_DIR, relative));
  if (!candidate.startsWith(DIST_DIR)) {
    return null;
  }
  return candidate;
}

function sendFile(res, filePath) {
  const ext = extname(filePath).toLowerCase();
  const type = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': statSync(filePath).size,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(filePath).pipe(res);
}

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

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/__ai_match_logs') {
    try {
      const payload = await readJsonBody(req);
      if (!payload || typeof payload !== 'object') {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid payload' }));
        return;
      }

      const stored = writeHumanAiMatchLog(payload);
      console.log('[ai-log] stored', stored.relativePath);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, ...stored }));
    } catch (error) {
      console.error('[ai-log] failed', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: error?.message || 'Failed to store match log' }));
    }
    return;
  }

  const requested = safeResolve(req.url);
  const indexPath = join(DIST_DIR, 'index.html');

  if (requested && existsSync(requested) && statSync(requested).isFile()) {
    sendFile(res, requested);
    return;
  }

  if (existsSync(indexPath)) {
    sendFile(res, indexPath);
    return;
  }

  res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('dist/index.html not found');
});

server.listen(PORT, HOST, () => {
  console.log(`Ring of Steel serving on http://${HOST}:${PORT}`);
});
