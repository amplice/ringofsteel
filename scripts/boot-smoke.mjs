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

// The attract duel should engage behind the title shortly after boot.
const attractAtBoot = await page.waitForFunction(
  () => document.getElementById('title-screen').classList.contains('attract'),
  { timeout: 20000 }
).then(() => true).catch(() => false);
if (!attractAtBoot) errors.push('Attract mode never engaged on the title screen.');

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

// GAUNTLET: mode hides the P2 column, button reads BEGIN, the HUD shows a
// foe counter, and pause -> MAIN MENU returns to the title.
await page.click('#mode-options [data-mode="gauntlet"]');
const gauntletUI = await page.evaluate(() => ({
  startLabel: document.getElementById('start-fight-btn').textContent,
  p2Hidden: getComputedStyle(
    document.getElementById('p2-char-heading').closest('.char-select-column')
  ).display === 'none',
}));
if (gauntletUI.startLabel !== 'BEGIN' || !gauntletUI.p2Hidden) {
  errors.push(`Gauntlet select UI wrong: ${JSON.stringify(gauntletUI)}`);
}
await page.click('#start-fight-btn');
await page.waitForFunction(
  () => getComputedStyle(document.getElementById('hud')).display !== 'none',
  { timeout: 45000 }
).catch(() => errors.push('HUD never became visible after starting the gauntlet.'));
const gauntletP2Name = await page.$eval('.fighter-hud.p2 .fighter-name', (el) => el.textContent).catch(() => null);
if (!/ 1\/\d+$/.test(gauntletP2Name ?? '')) {
  errors.push(`Gauntlet HUD foe label was ${JSON.stringify(gauntletP2Name)}, expected a "1/N" counter.`);
}
let gauntletPaused = false;
const gauntletPauseDeadline = Date.now() + 15000;
while (!gauntletPaused && Date.now() < gauntletPauseDeadline) {
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 500));
  gauntletPaused = await page.evaluate(
    () => getComputedStyle(document.getElementById('pause-screen')).display !== 'none'
  );
}
if (!gauntletPaused) errors.push('Could not pause the gauntlet match.');
await page.click('#pause-title-btn');
await page.waitForFunction(
  () => getComputedStyle(document.getElementById('title-screen')).display !== 'none',
  { timeout: 10000 }
).catch(() => errors.push('MAIN MENU did not return to the title screen.'));
const attractAfterExit = await page.waitForFunction(
  () => document.getElementById('title-screen').classList.contains('attract'),
  { timeout: 20000 }
).then(() => true).catch(() => false);
if (!attractAfterExit) errors.push('Attract mode did not restart after returning to the title.');
await page.keyboard.press('Enter');
await page.waitForFunction(
  () => getComputedStyle(document.getElementById('select-screen')).display !== 'none',
  { timeout: 10000 }
).catch(() => errors.push('Could not get back to the select screen after the gauntlet.'));
await page.click('#mode-options [data-mode="ai"]');

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

// Pause again, exit to the select screen, and start a TRAINING session.
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 400));
await page.click('#pause-select-btn');
await page.waitForFunction(
  () => getComputedStyle(document.getElementById('select-screen')).display !== 'none',
  { timeout: 10000 }
).catch(() => errors.push('CHANGE FIGHTERS did not return to the select screen.'));

await page.click('#mode-options [data-mode="training"]');
await page.click('#start-fight-btn');
await page.waitForFunction(
  () => getComputedStyle(document.getElementById('hud')).display !== 'none',
  { timeout: 30000 }
).catch(() => errors.push('HUD never became visible after starting training.'));
const trainingP2Name = await page.$eval('.fighter-hud.p2 .fighter-name', (el) => el.textContent).catch(() => null);
if (trainingP2Name !== 'DUMMY') {
  errors.push(`Training mode P2 label was ${JSON.stringify(trainingP2Name)}, expected "DUMMY".`);
}

// Pause inside training: the dummy-behavior control should be visible and cycle.
let dummyLabel = null;
const dummyDeadline = Date.now() + 15000;
while (!dummyLabel && Date.now() < dummyDeadline) {
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 500));
  dummyLabel = await page.evaluate(() => {
    const btn = document.getElementById('pause-dummy-btn');
    return btn && btn.offsetParent !== null ? btn.textContent : null;
  });
}
if (dummyLabel !== 'DUMMY: MANUAL') {
  errors.push(`Training pause dummy control was ${JSON.stringify(dummyLabel)}, expected "DUMMY: MANUAL".`);
}
await page.click('#pause-dummy-btn');
const dummyLabelAfterCycle = await page.evaluate(() => document.getElementById('pause-dummy-btn').textContent);
if (dummyLabelAfterCycle !== 'DUMMY: BLOCK') {
  errors.push(`Dummy control did not cycle, got ${JSON.stringify(dummyLabelAfterCycle)}.`);
}

// Touch device pass: tapping the title starts the game, and the combat
// overlay appears once a fight begins.
const touchPage = await browser.newPage();
await touchPage.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true });
touchPage.on('pageerror', (err) => errors.push(`TOUCH PAGEERROR: ${err.message}`));
await touchPage.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));
await touchPage.tap('#title-screen');
const touchSelectVisible = await touchPage.waitForFunction(
  () => getComputedStyle(document.getElementById('select-screen')).display !== 'none',
  { timeout: 10000 }
).then(() => true).catch(() => false);
if (!touchSelectVisible) errors.push('Tapping the title did not reach the select screen.');
await touchPage.tap('#start-fight-btn');
const touchOverlayActive = await touchPage.waitForFunction(
  () => document.getElementById('touch-controls').classList.contains('active'),
  { timeout: 30000 }
).then(() => true).catch(() => false);
if (!touchOverlayActive) errors.push('Touch combat overlay never appeared on a touch device.');
let touchPaused = false;
if (touchOverlayActive) {
  const touchPauseDeadline = Date.now() + 15000;
  while (!touchPaused && Date.now() < touchPauseDeadline) {
    await touchPage.tap('#touch-btn-pause');
    await new Promise((r) => setTimeout(r, 500));
    touchPaused = await touchPage.evaluate(
      () => getComputedStyle(document.getElementById('pause-screen')).display !== 'none'
    );
  }
  if (!touchPaused) errors.push('Touch pause button did not open the pause menu.');
}
await touchPage.close();

console.log(JSON.stringify({ titleVisible, attractAtBoot, attractAfterExit, ...state, focusedAfterArrows, gauntletUI, gauntletP2Name, pauseVisible, pauseClosed, trainingP2Name, dummyLabel, dummyLabelAfterCycle, touchSelectVisible, touchOverlayActive, touchPaused, errors: errors.slice(0, 10) }, null, 2));
if (!focusedAfterArrows) {
  console.error('Select-screen arrow navigation produced no focused control.');
  process.exitCode = 1;
}
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
