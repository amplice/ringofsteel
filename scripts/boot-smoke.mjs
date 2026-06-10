import puppeteer from 'puppeteer';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';

const root = process.argv[2] || 'dist';
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') path = '/index.html';
  try {
    const data = await readFile(join(root, path));
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
const errors = [];
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  // Network failures are tracked precisely via response events below.
  if (msg.text().startsWith('Failed to load resource')) return;
  errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
page.on('response', (res) => {
  if (res.status() < 400) return;
  if (res.url().endsWith('/favicon.ico')) return;
  errors.push(`HTTP ${res.status()}: ${res.url()}`);
});

await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));

const titleVisible = await page.evaluate(() => {
  const el = document.getElementById('title-screen');
  return el ? getComputedStyle(el).display !== 'none' : false;
});

// Simulate pressing Enter to start, let the game run a bit
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 4000));

const state = await page.evaluate(() => ({
  selectVisible: (() => {
    const el = document.getElementById('select-screen') || document.getElementById('character-select');
    return el ? getComputedStyle(el).display !== 'none' : null;
  })(),
}));

// Arrow-key navigation on the select screen should focus a control,
// and Enter should activate it (mode row first -> stays on select screen).
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowRight');
const focusedAfterArrows = await page.evaluate(() => {
  const el = document.querySelector('.select-btn.gp-focus');
  return el ? (el.id || el.dataset.stage || el.dataset.char || el.dataset.mode || el.dataset.diff || el.textContent.trim().slice(0, 24)) : null;
});

// Start a VS COMPUTER fight, wait for the HUD, then verify Escape pauses
// and resumes the match.
await page.click('#start-fight-btn');
await page.waitForFunction(
  () => getComputedStyle(document.getElementById('hud')).display !== 'none',
  { timeout: 30000 }
).catch(() => errors.push('HUD never became visible after starting a fight.'));

let pauseVisible = false;
const pauseDeadline = Date.now() + 15000;
while (!pauseVisible && Date.now() < pauseDeadline) {
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 500));
  pauseVisible = await page.evaluate(
    () => getComputedStyle(document.getElementById('pause-screen')).display !== 'none'
  );
}
if (!pauseVisible) errors.push('Escape never opened the pause menu during the fight.');

await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 300));
const pauseClosed = await page.evaluate(
  () => getComputedStyle(document.getElementById('pause-screen')).display === 'none'
);
if (!pauseClosed) errors.push('Escape did not close the pause menu.');

console.log(JSON.stringify({ titleVisible, ...state, focusedAfterArrows, pauseVisible, pauseClosed, errors: errors.slice(0, 10) }, null, 2));
if (!focusedAfterArrows) {
  console.error('Select-screen arrow navigation produced no focused control.');
  process.exitCode = 1;
}
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
