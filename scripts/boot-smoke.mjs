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
  if (req.method === 'POST' && path === '/__ai_match_logs') {
    // Stub of the dev-server match-log endpoint so AI matches can finish.
    req.resume();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
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

// First-ever visit: the controls modal auto-opens once; Enter dismisses it.
const firstVisitControls = await page.evaluate(
  () => document.getElementById('controls-modal')?.classList.contains('open') ?? false
);
if (!firstVisitControls) {
  errors.push('Controls modal did not auto-open on first visit to the select screen.');
} else {
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 300));
  const stillOpen = await page.evaluate(
    () => document.getElementById('controls-modal').classList.contains('open')
  );
  if (stillOpen) errors.push('Controls modal did not close on Enter.');
}

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
  versusName: document.getElementById('p2-versus-name')?.textContent ?? null,
  versusRecord: document.getElementById('p2-versus-weapon')?.textContent ?? null,
}));
if (gauntletUI.startLabel !== 'BEGIN' || !gauntletUI.p2Hidden) {
  errors.push(`Gauntlet select UI wrong: ${JSON.stringify(gauntletUI)}`);
}
if (gauntletUI.versusName !== 'THE GAUNTLET' || gauntletUI.versusRecord !== 'NO CLEAR YET') {
  errors.push(`Gauntlet versus panel wrong: ${JSON.stringify(gauntletUI)}`);
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

// Start a VS COMPUTER fight on the RANDOM stage card, wait for the HUD, then
// verify the stage resolved to a concrete arena and Escape pauses/resumes.
await page.click('[data-stage="random"]');
await page.click('#start-fight-btn');
await page.waitForFunction(
  () => getComputedStyle(document.getElementById('hud')).display !== 'none',
  { timeout: 30000 }
).catch(() => errors.push('HUD never became visible after starting a fight.'));
const randomStage = await page.evaluate(() => window.__ringOfSteelGame.currentStageId);
if (!randomStage || randomStage === 'random' || randomStage === 'test') {
  errors.push(`RANDOM stage card resolved to ${JSON.stringify(randomStage)}.`);
}

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

// Inject a finished match to validate victory-screen rendering (winner,
// stats line) and use its CHANGE FIGHTERS button to reach the select screen.
const victoryInfo = await page.evaluate(() => {
  const game = window.__ringOfSteelGame;
  game._matchStats = { parries: [2, 1], blocks: [3, 4], clashes: 5, roundTimes: [7.34, 12.1] };
  game.p1Score = 3;
  game.p2Score = 1;
  game._showVictory('PLAYER 1');
  return {
    title: document.getElementById('winner-text').textContent,
    stats: document.getElementById('victory-stats').textContent,
  };
});
if (victoryInfo.title !== 'PLAYER 1 WINS') {
  errors.push(`Victory title was ${JSON.stringify(victoryInfo.title)}.`);
}
if (victoryInfo.stats !== 'PARRIES 2-1 · BLOCKS 3-4 · CLASHES 5 · FASTEST KILL 7.3S') {
  errors.push(`Victory stats line was ${JSON.stringify(victoryInfo.stats)}.`);
}
// KO replay: button starts the replay (victory hides, badge shows) and
// Escape returns to the victory screen.
let replayState = null;
const replayBtnVisible = await page.evaluate(
  () => document.getElementById('victory-replay-btn').offsetParent !== null
);
if (!replayBtnVisible) {
  errors.push('REPLAY KO button was not visible on an offline victory.');
} else {
  await new Promise((r) => setTimeout(r, 700)); // victory input grace window
  await page.click('#victory-replay-btn');
  await new Promise((r) => setTimeout(r, 600));
  replayState = await page.evaluate(() => ({
    victoryHidden: getComputedStyle(document.getElementById('victory-screen')).display === 'none',
    badgeVisible: getComputedStyle(document.getElementById('replay-indicator')).display !== 'none',
    gameState: window.__ringOfSteelGame.gameState,
  }));
  if (!replayState.victoryHidden || !replayState.badgeVisible || replayState.gameState !== 'replay') {
    errors.push(`KO replay did not start cleanly: ${JSON.stringify(replayState)}`);
  }
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 400));
  const backAtVictory = await page.evaluate(
    () => getComputedStyle(document.getElementById('victory-screen')).display !== 'none'
  );
  if (!backAtVictory) errors.push('Escape did not return from the KO replay to the victory screen.');
}

await new Promise((r) => setTimeout(r, 700)); // victory input grace window
await page.click('#victory-select-btn');
await page.waitForFunction(
  () => getComputedStyle(document.getElementById('select-screen')).display !== 'none',
  { timeout: 10000 }
).catch(() => errors.push('Victory CHANGE FIGHTERS did not return to the select screen.'));

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

console.log(JSON.stringify({ titleVisible, attractAtBoot, attractAfterExit, ...state, firstVisitControls, focusedAfterArrows, gauntletUI, gauntletP2Name, randomStage, pauseVisible, pauseClosed, victoryInfo, replayState, trainingP2Name, dummyLabel, dummyLabelAfterCycle, touchSelectVisible, touchOverlayActive, touchPaused, errors: errors.slice(0, 10) }, null, 2));
if (!focusedAfterArrows) {
  console.error('Select-screen arrow navigation produced no focused control.');
  process.exitCode = 1;
}
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
