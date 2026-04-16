import fs from 'node:fs';
import path from 'node:path';

const LOG_DIR = path.join(process.cwd(), 'analysis', 'human-ai');
const LATEST_PATH = path.join(LOG_DIR, 'latest.json');

function sanitizeSegment(value, fallback = 'unknown') {
  const clean = String(value ?? fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return clean || fallback;
}

function buildFilename(match) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fighter1Char = sanitizeSegment(match?.fighter1Char ?? match?.playerChar, 'fighter1');
  const fighter2Char = sanitizeSegment(match?.fighter2Char ?? match?.aiChar, 'fighter2');
  const mode = sanitizeSegment(match?.mode, 'local');
  const difficulty = sanitizeSegment(match?.difficulty, 'unknown');
  return `${stamp}-${fighter1Char}-vs-${fighter2Char}-${mode}-${difficulty}.json`;
}

export function writeHumanAiMatchLog(match) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const filename = buildFilename(match);
  const filePath = path.join(LOG_DIR, filename);
  const payload = JSON.stringify(match, null, 2);
  fs.writeFileSync(filePath, payload);
  fs.writeFileSync(LATEST_PATH, payload);
  return {
    filePath,
    relativePath: path.relative(process.cwd(), filePath),
    latestPath: path.relative(process.cwd(), LATEST_PATH),
  };
}

export function humanAiLogDir() {
  return LOG_DIR;
}
