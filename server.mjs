import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createServer } from 'node:http';

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

const server = createServer((req, res) => {
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
