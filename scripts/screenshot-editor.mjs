import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'screenshots');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

async function startVite() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5199'], {
      cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'], shell: true,
    });
    let output = '';
    proc.stdout.on('data', (d) => {
      output += d.toString();
      const clean = stripAnsi(output);
      if (clean.includes('Local:')) {
        const m = clean.match(/http:\/\/[^\s]+/);
        if (m) resolve({ proc, url: m[0] });
      }
    });
    proc.stderr.on('data', (d) => { output += d.toString(); });
    setTimeout(() => reject(new Error('timeout\n' + stripAnsi(output))), 15000);
  });
}

async function shot(page, name) {
  const fp = path.join(DIR, `${name}.png`);
  await page.screenshot({ path: fp });
  console.log(`Saved: ${fp}`);
}

async function main() {
  const { proc, url } = await startVite();
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
    defaultViewport: { width: 1280, height: 720 },
  });
  try {
    const page = await browser.newPage();
    page.on('console', m => console.log(`[${m.type()}] ${m.text()}`));
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // Click "ANIMATION PLAYER" button
    await page.evaluate(() => {
      const btn = document.getElementById('anim-player-btn');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 3000));

    await shot(page, 'editor_01_animplayer');

    // Wait for animation to play a bit
    await new Promise(r => setTimeout(r, 2000));
    await shot(page, 'editor_02_playing');

    console.log('Done!');
  } finally {
    await browser.close();
    proc.kill();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
