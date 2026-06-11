# Ring of Steel

A 3D weapon-dueling fighting game for the browser, built on THREE.js. One clean
hit ends the round: spacing, parries, sidesteps, and weapon clashes decide
everything.

## Quick start

```bash
npm install
npm run dev          # Vite dev server
npm run build        # production build to dist/
npm start            # serve dist/ (node server.mjs)
```

## Playing

**Modes** — VS COMPUTER (easy/medium/hard), GAUNTLET (arcade ladder: every
fighter in random order, rising difficulty, hard mirror-match finale, per-
fighter best clear times), VS PLAYER (local), VS ONLINE (lobbies, quick match,
rematch handshake), TRAINING (instant resets, dummy presets: manual / block /
attack, exchange feedback readout), AI VS AI.

**Input** — keyboard, gamepads (first pad = P1, second = P2), and touch
(virtual stick + button cluster) are all first-class, including menu
navigation. In-game controls are documented in the CONTROLS modal on the
character select screen (auto-opens on first visit).

**Fighters** — spearman, ronin, knight, huscarl. **Arenas** — amphitheater
(noon and ember dusk), bamboo clearing (dawn and moonlit), wooden pier
(sunset and midnight squall), mountaintop (plus a clean test arena and a
RANDOM card that re-rolls every match). Offline matches can be first to
1, 3, or 5 rounds.

Esc / Start pauses offline fights. After a match: instant rematch, KO replay,
SAVE CLIP (downloads the KO as a webm), match stats. M toggles sound. The
select screen remembers your last loadout, per-fighter records, and gauntlet
best clear times.

## Testing

```bash
npm run sim:regression     # deterministic combat regression suite
npm run smoke:boot         # headless browser E2E (boot, menus, fight, pause,
                           # training, gauntlet, survival, victory, replay,
                           # rebinding, records, touch pass)
npm run smoke:gauntlet     # plays a full gauntlet to completion in a browser
npm run multiplayer:check  # build + parity + ws/rematch/browser/disconnect smokes
npm run stability:check    # build + sim regression
```

`npm run sim:selfplay` runs AI self-play tournaments; see
`SELF_PLAY_TOURNAMENT.md`.

## Multiplayer

`npm run multiplayer:server` starts the authoritative WebSocket server
(`server/multiplayer-server.mjs`); the client URL is configured in
`src/net/NetConfig.js`. See `MULTIPLAYER_DEV.md` and `MULTIPLAYER_DEPLOY.md`.

## Code layout

- `src/Game.js` — orchestrator: game states, modes, screens, replay, attract
- `src/combat/` — fighter state machine, hit resolution, attack data, tuning
- `src/sim/MatchSim.js` — deterministic headless match simulation (shared by
  client, server, and tests)
- `src/characters/` — data-driven fighter definitions (`CHARACTER_PIPELINE.md`
  covers adding one)
- `src/stages/index.js` — data-driven arena definitions (lighting, atmosphere,
  decor, bounds)
- `src/core/` — input (keyboard/gamepad/touch), renderer, constants
- `src/ai/` — difficulty profiles, planner AI, per-matchup strategies
- `src/net/` + `server/` — online play
- `scripts/` — regression, smokes, tooling

`COMBAT_MECHANICS_MAP.md` documents the combat rules in detail.
