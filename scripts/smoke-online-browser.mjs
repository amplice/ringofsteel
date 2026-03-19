import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer';

const APP_PORT = Number(process.env.APP_PORT || (4174 + (process.pid % 200)));
const WS_PORT = Number(process.env.MULTIPLAYER_PORT || (3132 + (process.pid % 200)));
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));

function spawnProcess(command, args, extraEnv = {}) {
  const resolvedCommand = process.platform === 'win32' && command === 'npm'
    ? 'npm.cmd'
    : command;
  const proc = spawn(resolvedCommand, args, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  let stderr = '';
  proc.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  return { proc, getStderr: () => stderr };
}

async function waitForHttp(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // Booting.
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForTitle(page) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => {
      const loading = document.getElementById('loading-screen');
      const title = document.getElementById('title-screen');
      if (!loading || !title) return false;
      return getComputedStyle(loading).display === 'none' && getComputedStyle(title).display === 'flex';
    });
    if (ready) return;
    await delay(200);
  }
  const debug = await page.evaluate(() => ({
    loadingDisplay: getComputedStyle(document.getElementById('loading-screen')).display,
    titleDisplay: getComputedStyle(document.getElementById('title-screen')).display,
    loadingStatus: document.getElementById('loading-status')?.textContent ?? null,
    loadingPercent: document.getElementById('loading-percent')?.textContent ?? null,
    bodyText: document.body.innerText.slice(0, 400),
  }));
  throw new Error(`Timed out waiting for title: ${JSON.stringify(debug)}`);
}

async function openSelect(page) {
  await waitForTitle(page);
  await page.keyboard.press('Enter');
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const open = await page.evaluate(() => {
      const select = document.getElementById('select-screen');
      return select && getComputedStyle(select).display === 'flex';
    });
    if (open) return;
    await delay(100);
  }
  throw new Error('Timed out waiting for select screen.');
}

async function configureOnlineHost(page, characterId) {
  await page.click('#mode-options [data-mode="online"]');
  await page.click(`#p1-char-options [data-char="${characterId}"]`);
  await page.$eval('#online-server-url', (el, value) => { el.value = value; }, `ws://127.0.0.1:${WS_PORT}/ws`);
  await page.click('#start-fight-btn');
  await page.waitForFunction(() => {
    const input = document.getElementById('online-lobby-code');
    return input && input.value.trim().length > 0;
  }, { timeout: 10000 });
  return page.$eval('#online-lobby-code', (el) => el.value.trim());
}

async function configureOnlineGuest(page, characterId, code) {
  await page.click('#mode-options [data-mode="online"]');
  await page.click(`#p1-char-options [data-char="${characterId}"]`);
  await page.$eval('#online-server-url', (el, value) => { el.value = value; }, `ws://127.0.0.1:${WS_PORT}/ws`);
  await page.$eval('#online-lobby-code', (el, value) => { el.value = value; }, code);
  await page.click('#start-fight-btn');
}

async function waitForHud(page) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const open = await page.evaluate(() => {
      const hud = document.getElementById('hud');
      return hud && getComputedStyle(hud).display === 'block';
    });
    if (open) return;
    await delay(100);
  }
  throw new Error('Timed out waiting for HUD.');
}

async function readGameState(page) {
  return page.evaluate(() => {
    const game = window.__ringOfSteelGame;
    return {
      mode: game?.mode,
      state: game?.gameState,
      hasFighter1: Boolean(game?.fighter1),
      hasFighter2: Boolean(game?.fighter2),
      onlineSlot: game?.onlineLocalSlot ?? null,
      onlineLobbyCode: game?.onlineSession?.lobbyCode ?? null,
    };
  });
}

async function run() {
  const app = spawnProcess('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(APP_PORT)]);
  const server = spawnProcess('node', ['server/multiplayer-server.mjs'], { MULTIPLAYER_PORT: String(WS_PORT) });

  let browser;
  try {
    console.log('[browser-smoke] waiting for servers');
    await Promise.all([
      waitForHttp(APP_URL),
      waitForHttp(`http://127.0.0.1:${WS_PORT}/health`),
    ]);

    console.log('[browser-smoke] launching browser');
    browser = await puppeteer.launch({ headless: true });
    const hostPage = await browser.newPage();
    const guestPage = await browser.newPage();
    for (const page of [hostPage, guestPage]) {
      page.on('console', (msg) => console.log(`[browser:${msg.type()}] ${msg.text()}`));
      page.on('pageerror', (err) => console.error('[browser:pageerror]', err));
    }

    console.log('[browser-smoke] opening app pages');
    await Promise.all([
      hostPage.goto(APP_URL, { waitUntil: 'domcontentloaded' }),
      guestPage.goto(APP_URL, { waitUntil: 'domcontentloaded' }),
    ]);

    console.log('[browser-smoke] opening select screens');
    await Promise.all([
      openSelect(hostPage),
      openSelect(guestPage),
    ]);

    console.log('[browser-smoke] creating host lobby');
    const code = await configureOnlineHost(hostPage, 'spearman');
    console.log(`[browser-smoke] host code ${code}`);
    console.log('[browser-smoke] joining guest');
    await configureOnlineGuest(guestPage, 'ronin', code);

    console.log('[browser-smoke] waiting for HUD');
    await Promise.all([
      waitForHud(hostPage),
      waitForHud(guestPage),
    ]);

    const [hostState, guestState] = await Promise.all([
      readGameState(hostPage),
      readGameState(guestPage),
    ]);

    const summary = {
      code,
      hostState,
      guestState,
    };

    if (!hostState.hasFighter1 || !hostState.hasFighter2 || !guestState.hasFighter1 || !guestState.hasFighter2) {
      console.error(JSON.stringify(summary, null, 2));
      process.exitCode = 1;
      return;
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser?.close();
    app.proc.kill();
    server.proc.kill();
    await delay(150);
    if (app.getStderr().trim()) {
      console.error(app.getStderr().trim());
    }
    if (server.getStderr().trim()) {
      console.error(server.getStderr().trim());
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
