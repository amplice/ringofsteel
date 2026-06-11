// Gauntlet clear smoke: plays a full 4-match gauntlet to completion in a
// real browser (AI neutralized so every duel is deterministically winnable)
// and verifies the interstitials, the GAUNTLET COMPLETE screen with its
// clear time, and the persisted best showing up on the select screen.
import puppeteer from 'puppeteer';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json',
};
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (req.method === 'POST') { req.resume(); res.writeHead(200); res.end('{}'); return; }
  if (path === '/') path = '/index.html';
  try {
    const data = await readFile(join('dist', path));
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));

await page.goto(`http://localhost:${server.address().port}/`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.evaluate(() => localStorage.setItem('ring-of-steel-controls-seen', 'true'));
await new Promise((r) => setTimeout(r, 6000));
await page.keyboard.press('Enter'); // title -> select
await new Promise((r) => setTimeout(r, 800));
await page.click('#mode-options [data-mode="gauntlet"]');
await page.click('#start-fight-btn');

const interstitials = [];
async function winCurrentMatch(matchIndex) {
  await page.waitForFunction(
    () => getComputedStyle(document.getElementById('hud')).display !== 'none',
    { timeout: 45000 }
  );
  await page.waitForFunction(
    () => window.__ringOfSteelGame.gameState === 'fighting',
    { timeout: 20000 }
  );
  await page.evaluate(() => {
    const game = window.__ringOfSteelGame;
    game.aiController2 = null;
    game.aiController = null;
  });
  await page.keyboard.down('KeyD');
  const deadline = Date.now() + 60000;
  let won = false;
  while (!won && Date.now() < deadline) {
    await page.keyboard.press('KeyJ');
    await new Promise((r) => setTimeout(r, 130));
    won = await page.evaluate(
      () => getComputedStyle(document.getElementById('victory-screen')).display !== 'none'
    );
  }
  await page.keyboard.up('KeyD');
  if (!won) throw new Error(`Match ${matchIndex + 1} was not won within the deadline.`);
  return page.evaluate(() => ({
    title: document.getElementById('winner-text').textContent,
    subtitle: document.getElementById('final-score').textContent,
    nextLabel: document.getElementById('victory-rematch-btn').textContent,
    nextVisible: document.getElementById('victory-rematch-btn').offsetParent !== null,
  }));
}

try {
  for (let match = 0; match < 4; match++) {
    const screen = await winCurrentMatch(match);
    interstitials.push(screen);
    if (match < 3) {
      if (!/^FOE \d\/4 DEFEATED$/.test(screen.title) || !/^NEXT: /.test(screen.nextLabel)) {
        errors.push(`Interstitial ${match + 1} wrong: ${JSON.stringify(screen)}`);
      }
      await new Promise((r) => setTimeout(r, 700)); // victory grace
      await page.click('#victory-rematch-btn');
    }
  }

  const finale = interstitials[3];
  if (finale.title !== 'GAUNTLET COMPLETE') {
    errors.push(`Finale title was ${JSON.stringify(finale.title)}.`);
  }
  if (!/^CLEARED IN \d+:\d{2} · NEW BEST$/.test(finale.subtitle)) {
    errors.push(`Finale subtitle was ${JSON.stringify(finale.subtitle)}.`);
  }
  if (finale.nextVisible) {
    errors.push('Rematch button should be hidden on GAUNTLET COMPLETE.');
  }

  await new Promise((r) => setTimeout(r, 700));
  await page.click('#victory-select-btn');
  await page.waitForFunction(
    () => getComputedStyle(document.getElementById('select-screen')).display !== 'none',
    { timeout: 10000 }
  );
  const selectAfter = await page.evaluate(() => ({
    versusRecord: document.getElementById('p2-versus-weapon')?.textContent ?? null,
    cardRecord: document.querySelector('#p1-char-options [data-char-record="spearman"]')?.textContent ?? null,
  }));
  if (!/^BEST CLEAR \d+:\d{2}$/.test(selectAfter.versusRecord ?? '')) {
    errors.push(`Versus record after clear was ${JSON.stringify(selectAfter.versusRecord)}.`);
  }
  if (!/CLEAR \d+:\d{2}/.test(selectAfter.cardRecord ?? '')) {
    errors.push(`Card record after clear was ${JSON.stringify(selectAfter.cardRecord)}.`);
  }

  console.log(JSON.stringify({ interstitials, selectAfter, errors }, null, 2));
} catch (err) {
  console.error(err);
  errors.push(String(err?.message ?? err));
} finally {
  await browser.close();
  server.close();
  if (errors.length) process.exitCode = 1;
}
