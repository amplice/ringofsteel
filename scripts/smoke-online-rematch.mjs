// Online rematch smoke: play a full match to completion (host walks in and
// spams quick attacks at an idle guest), then both players ready up again in
// the same lobby and a fresh match must start with reset scores.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';

const PORT = Number(process.env.MULTIPLAYER_PORT || 3132);
const SERVER_URL = `ws://127.0.0.1:${PORT}/ws`;
const HEALTH_URL = `http://127.0.0.1:${PORT}/health`;
const SERVER_PATH = fileURLToPath(new URL('../server/multiplayer-server.mjs', import.meta.url));
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));

function waitForMessage(ws, predicate, timeoutMs = 5000, label = 'message') {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for: ${label}`));
    }, timeoutMs);
    const onMessage = (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      ws.off('message', onMessage);
      ws.off('error', onError);
    };
    ws.on('message', onMessage);
    ws.on('error', onError);
  });
}

async function connectClient() {
  const ws = new WebSocket(SERVER_URL);
  await waitForMessage(ws, (message) => message.type === 'welcome');
  return ws;
}

async function waitForHealth(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // Booting.
    }
    await delay(150);
  }
  throw new Error('Health endpoint did not respond.');
}

function attackFrame(frame) {
  return {
    type: 'input_frame',
    frame,
    input: {
      frame,
      held: { left: false, right: true, block: false },
      pressed: {
        quick: true,
        heavy: false,
        thrust: false,
        sidestepUp: false,
        sidestepDown: false,
        backstep: false,
        block: false,
      },
    },
  };
}

async function run() {
  const server = spawn(process.execPath, [SERVER_PATH], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, MULTIPLAYER_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  server.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  try {
    await waitForHealth(HEALTH_URL);
    const host = await connectClient();
    const guest = await connectClient();
    const allEvents = [];
    host.on('message', (raw) => allEvents.push(JSON.parse(String(raw))));
    guest.on('message', (raw) => allEvents.push(JSON.parse(String(raw))));

    host.send(JSON.stringify({ type: 'create_lobby', visibility: 'private', stageId: 'amphitheater' }));
    const lobby = await waitForMessage(host, (m) => m.type === 'lobby_state' && m.code);
    guest.send(JSON.stringify({ type: 'join_lobby', code: lobby.code }));
    await waitForMessage(guest, (m) => m.type === 'lobby_state' && m.code === lobby.code);

    host.send(JSON.stringify({ type: 'select_character', characterId: 'spearman' }));
    guest.send(JSON.stringify({ type: 'select_character', characterId: 'ronin' }));
    host.send(JSON.stringify({ type: 'ready', ready: true }));
    guest.send(JSON.stringify({ type: 'ready', ready: true }));
    const firstStart = await waitForMessage(host, (m) => m.type === 'match_start');

    // Drive the match: host walks toward the idle guest spamming quick
    // attacks until the server reports match_complete.
    let frame = 0;
    const attackInterval = setInterval(() => {
      frame += 3;
      if (host.readyState === WebSocket.OPEN) {
        host.send(JSON.stringify(attackFrame(frame)));
      }
    }, 50);

    let matchComplete;
    try {
      matchComplete = await waitForMessage(
        host,
        (m) => m.type === 'match_state' && m.phase === 'match_complete',
        120000,
        'match_state phase=match_complete'
      );
    } catch (err) {
      const matchStates = allEvents.filter((m) => m.type === 'match_state');
      const errorsSeen = allEvents.filter((m) => m.type === 'error');
      console.error('Match never completed. match_state events:', JSON.stringify(matchStates.map((m) => ({ phase: m.phase, scores: m.scores, winner: m.winner }))));
      console.error('Errors seen:', JSON.stringify(errorsSeen));
      const lastSnap = [...allEvents].reverse().find((m) => m.type === 'state_snapshot');
      console.error('Last snapshot fighters:', JSON.stringify(lastSnap?.snapshot?.fighters?.map((f) => ({ x: f.position?.x?.toFixed?.(2), state: f.state }))));
      throw err;
    } finally {
      clearInterval(attackInterval);
    }

    // Rematch handshake: both players ready up again in the same lobby.
    await delay(250);
    host.send(JSON.stringify({ type: 'ready', ready: true }));
    await delay(250);
    const secondStartPromise = waitForMessage(guest, (m) => m.type === 'match_start', 10000, 'second match_start');
    guest.send(JSON.stringify({ type: 'ready', ready: true }));
    const secondStart = await secondStartPromise;

    // The attack spammer keeps sending during round-restart gaps, which the
    // server correctly rejects; the real client only sends while fighting.
    const errors = allEvents
      .filter((m) => m.type === 'error' && m.message !== 'Match has not started.')
      .map((m) => m.message);
    const summary = {
      code: lobby.code,
      firstMatchStage: firstStart.stageId,
      matchCompleteWinner: matchComplete.matchWinner ?? matchComplete.winner ?? null,
      rematchStarted: Boolean(secondStart),
      rematchScores: secondStart.scores,
      rematchRound: secondStart.roundNumber,
      sameLobby: secondStart.code === lobby.code,
      errors,
    };

    host.close();
    guest.close();

    const ok =
      summary.rematchStarted &&
      summary.sameLobby &&
      Array.isArray(summary.rematchScores) &&
      summary.rematchScores[0] === 0 &&
      summary.rematchScores[1] === 0 &&
      summary.errors.length === 0;

    console.log(JSON.stringify(summary, null, 2));
    if (!ok) process.exitCode = 1;
  } finally {
    server.kill();
    await delay(100);
    if (!server.killed) server.kill('SIGKILL');
    if (stderr.trim()) console.error(stderr.trim());
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
