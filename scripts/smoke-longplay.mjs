// Long-play smoke: real-browser playthroughs of the flows the fast boot
// smoke can't afford. Fails the first gauntlet match (idle vs live AI) to
// cover GAUNTLET FAILED -> TRY AGAIN retrying the same foe, then clears the
// full 4-match ladder (AI neutralized), verifies the completion screen and
// persisted best, loses a survival run to cover RUN OVER -> NEW RUN, and
// records a KO clip on the way, asserting the webm actually downloads.
import puppeteer from 'puppeteer';
import { createServer } from 'http';
import { readFile, readdir, stat, mkdir, rm } from 'fs/promises';
import { extname, join } from 'path';
import { tmpdir } from 'os';

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

const downloadDir = join(tmpdir(), `ros-longplay-${process.pid}`);
await rm(downloadDir, { recursive: true, force: true });
await mkdir(downloadDir, { recursive: true });

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
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
  // GAUNTLET FAILURE PATH: idle against the live easy AI in match one,
  // verify GAUNTLET FAILED, and confirm TRY AGAIN rematches the same foe.
  await page.waitForFunction(
    () => getComputedStyle(document.getElementById('hud')).display !== 'none',
    { timeout: 45000 }
  );
  const firstFoe = await page.$eval('.fighter-hud.p2 .fighter-name', (el) => el.textContent);
  let failed = false;
  const failDeadline = Date.now() + 90000;
  while (!failed && Date.now() < failDeadline) {
    await new Promise((r) => setTimeout(r, 500));
    failed = await page.evaluate(
      () => getComputedStyle(document.getElementById('victory-screen')).display !== 'none'
    );
  }
  const failScreen = failed ? await page.evaluate(() => ({
    title: document.getElementById('winner-text').textContent,
    retryLabel: document.getElementById('victory-rematch-btn').textContent,
  })) : null;
  if (!failed) {
    errors.push('The AI never beat an idle player in the gauntlet within 90s.');
  } else if (failScreen.title !== 'GAUNTLET FAILED' || failScreen.retryLabel !== 'TRY AGAIN') {
    errors.push(`Gauntlet failure screen wrong: ${JSON.stringify(failScreen)}`);
  }
  await new Promise((r) => setTimeout(r, 700)); // victory grace
  await page.click('#victory-rematch-btn');
  await page.waitForFunction(
    () => getComputedStyle(document.getElementById('hud')).display !== 'none',
    { timeout: 45000 }
  );
  const retryFoe = await page.$eval('.fighter-hud.p2 .fighter-name', (el) => el.textContent);
  if (retryFoe !== firstFoe) {
    errors.push(`TRY AGAIN changed the foe: ${JSON.stringify({ firstFoe, retryFoe })}`);
  }

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

  // SURVIVAL LOSS PATH: stand idle against a live easy AI until it kills us,
  // then verify RUN OVER, record a KO clip of the death, and start a NEW RUN.
  await page.click('#mode-options [data-mode="survival"]');
  await page.click('#start-fight-btn');
  await page.waitForFunction(
    () => getComputedStyle(document.getElementById('hud')).display !== 'none',
    { timeout: 45000 }
  );
  let runOver = false;
  const lossDeadline = Date.now() + 90000;
  while (!runOver && Date.now() < lossDeadline) {
    await new Promise((r) => setTimeout(r, 500));
    runOver = await page.evaluate(
      () => getComputedStyle(document.getElementById('victory-screen')).display !== 'none'
    );
  }
  const lossScreen = runOver ? await page.evaluate(() => ({
    title: document.getElementById('winner-text').textContent,
    subtitle: document.getElementById('final-score').textContent,
    nextLabel: document.getElementById('victory-rematch-btn').textContent,
  })) : null;
  if (!runOver) {
    errors.push('The AI never finished off an idle player within 90s.');
  } else if (lossScreen.title !== 'RUN OVER' || lossScreen.nextLabel !== 'NEW RUN') {
    errors.push(`Survival loss screen wrong: ${JSON.stringify(lossScreen)}`);
  }

  let clipFile = null;
  if (runOver) {
    await new Promise((r) => setTimeout(r, 700)); // victory grace
    await page.click('#victory-clip-btn');
    const clipDeadline = Date.now() + 45000;
    while (!clipFile && Date.now() < clipDeadline) {
      await new Promise((r) => setTimeout(r, 1000));
      const files = await readdir(downloadDir).catch(() => []);
      clipFile = files.find((f) => f.endsWith('.webm')) ?? null;
    }
    const clipSize = clipFile ? (await stat(join(downloadDir, clipFile))).size : 0;
    if (!clipFile || clipSize < 10000) {
      errors.push(`KO clip did not download (file=${clipFile}, size=${clipSize}).`);
    }
    // Replay has ended (download fires on stop); victory is back. New run:
    await page.waitForFunction(
      () => getComputedStyle(document.getElementById('victory-screen')).display !== 'none',
      { timeout: 15000 }
    ).catch(() => errors.push('Victory screen did not return after the clip replay.'));
    await new Promise((r) => setTimeout(r, 700));
    await page.click('#victory-rematch-btn');
    await page.waitForFunction(
      () => getComputedStyle(document.getElementById('hud')).display !== 'none' &&
        / · STREAK 0$/.test(document.querySelector('.fighter-hud.p2 .fighter-name')?.textContent ?? ''),
      { timeout: 45000 }
    ).catch(() => errors.push('NEW RUN did not start a fresh survival run.'));
  }

  console.log(JSON.stringify({ failScreen, firstFoe, retryFoe, interstitials, selectAfter, lossScreen, clipFile, errors }, null, 2));
} catch (err) {
  console.error(err);
  errors.push(String(err?.message ?? err));
} finally {
  await browser.close();
  server.close();
  await rm(downloadDir, { recursive: true, force: true });
  if (errors.length) process.exitCode = 1;
}
