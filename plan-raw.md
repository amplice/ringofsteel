Now I have all the information needed to design a comprehensive architecture. Let me produce the full plan.

---

# Wuxia Warrior: Complete Architecture and Implementation Plan

## Technology Foundation

- **Three.js v0.183.x** with WebGPU renderer (import from `three/webgpu`, automatic WebGL2 fallback)
- **Vite** as build system with `target: 'esnext'` for top-level await support
- **Node.js v22.14.0** / npm 10.9.2 (confirmed available)
- No external model/asset dependencies -- everything procedurally generated from Three.js primitives

Sources referenced:
- [Three.js WebGPU Renderer docs](https://threejs.org/docs/pages/WebGPURenderer.html)
- [Three.js WebGPU manual](https://threejs.org/manual/en/webgpurenderer.html)
- [Three.js npm package](https://www.npmjs.com/package/three)
- [Vite top-level await solution](https://discourse.threejs.org/t/top-level-await-error-with-vite-and-three-js-top-level-await-is-not-available-in-the-configured-target-environment/68189)
- [WebGPU migration guide](https://www.utsubo.com/blog/webgpu-threejs-migration-guide)

---

## 1. Project Structure (Complete File Tree)

```
C:\Users\cobra\wuxia-warrior\
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.js                    # Entry point, bootstraps the game
│   ├── Game.js                    # Master game controller, scene lifecycle
│   │
│   ├── core/
│   │   ├── Renderer.js            # WebGPU renderer init + resize handling
│   │   ├── Clock.js               # Fixed-timestep game loop (60Hz)
│   │   ├── InputManager.js        # Keyboard input polling + buffering
│   │   ├── AudioManager.js        # Minimal procedural audio (optional)
│   │   └── Constants.js           # All game-wide constants & enums
│   │
│   ├── combat/
│   │   ├── FighterStateMachine.js # Per-fighter FSM (idle, attack, block, hitstun, etc.)
│   │   ├── StanceSystem.js        # Stance definitions, transitions, coverage zones
│   │   ├── AttackData.js          # Attack frame data tables (startup, active, recovery)
│   │   ├── HitResolver.js         # Collision detection + hit/block/parry/clash logic
│   │   ├── DamageSystem.js        # Body-zone damage tracking, kill resolution
│   │   └── ClashSystem.js         # Weapon-to-weapon clash detection
│   │
│   ├── entities/
│   │   ├── Fighter.js             # Fighter entity: mesh + state + weapon
│   │   ├── FighterBuilder.js      # Procedural geometry builder for fighters
│   │   ├── Weapon.js              # Weapon mesh + hitbox geometry
│   │   └── WeaponData.js          # Weapon stat definitions (reach, speed, weight)
│   │
│   ├── animation/
│   │   ├── ProceduralAnimator.js  # Tween-based animation driver
│   │   ├── AnimationLibrary.js    # Pose keyframes for all actions per stance
│   │   └── TrailEffect.js         # Sword trail ribbon geometry
│   │
│   ├── ai/
│   │   ├── AIController.js        # AI decision-making brain
│   │   ├── AIBehaviors.js         # Behavior trees / utility-based action scoring
│   │   └── AIPersonality.js       # Difficulty presets (reaction time, aggression, etc.)
│   │
│   ├── camera/
│   │   └── CameraController.js   # Tracking camera, zoom, dramatic angles
│   │
│   ├── arena/
│   │   ├── Arena.js               # Arena geometry, boundaries, ring-out detection
│   │   └── Environment.js         # Fog, skybox, ambient particles
│   │
│   ├── vfx/
│   │   ├── ParticleSystem.js      # GPU particle system for sparks, dust
│   │   ├── ScreenEffects.js       # Screen shake, flash, slow-mo controller
│   │   └── InkEffects.js          # Ink-wash splash effects for hits/kills
│   │
│   ├── ui/
│   │   ├── UIManager.js           # HTML/CSS overlay controller
│   │   ├── HUD.js                 # In-match HUD (stance indicators, round count, body damage)
│   │   ├── TitleScreen.js         # Title screen
│   │   ├── CharacterSelect.js     # Mode/character select
│   │   └── VictoryScreen.js       # Victory/result display
│   │
│   └── utils/
│       ├── MathUtils.js           # Lerp, clamp, angle utilities
│       └── ObjectPool.js          # Object pooling for particles/effects
│
└── public/
    └── (empty - no external assets needed)
```

**Total: 33 source files** -- each with a focused single responsibility.

---

## 2. Build System Configuration

### `package.json`
```json
{
  "name": "wuxia-warrior",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "three": "^0.183.0"
  },
  "devDependencies": {
    "vite": "^6.0.0"
  }
}
```

### `vite.config.js`
```js
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'esnext'   // Required for top-level await in Three.js WebGPU
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext'
    }
  }
});
```

No plugins needed -- the `esnext` target handles top-level await natively, which is the more reliable approach over `vite-plugin-top-level-await`.

### `index.html`
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Wuxia Warrior</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: #0a0a0a; font-family: serif; }
    canvas { display: block; }
    #ui-overlay {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 10;
    }
    #ui-overlay.interactive { pointer-events: auto; }
  </style>
</head>
<body>
  <div id="ui-overlay"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

---

## 3. Core Architecture: Constants and Enums

### `src/core/Constants.js` -- The Central Reference File

This file is the single source of truth for all game-wide values. Every other module imports from here. This prevents magic numbers scattered across files.

```js
// === GAME STATES ===
export const GameState = Object.freeze({
  TITLE: 'title',
  CHARACTER_SELECT: 'character_select',
  ROUND_INTRO: 'round_intro',
  FIGHTING: 'fighting',
  ROUND_END: 'round_end',
  MATCH_END: 'match_end',
  VICTORY: 'victory'
});

// === FIGHTER STATES (FSM states) ===
export const FighterState = Object.freeze({
  IDLE: 'idle',
  WALK_FORWARD: 'walk_forward',
  WALK_BACKWARD: 'walk_backward',
  SIDESTEP_LEFT: 'sidestep_left',
  SIDESTEP_RIGHT: 'sidestep_right',
  DASH_FORWARD: 'dash_forward',
  DASH_BACKWARD: 'dash_backward',
  ATTACK_STARTUP: 'attack_startup',
  ATTACK_ACTIVE: 'attack_active',
  ATTACK_RECOVERY: 'attack_recovery',
  BLOCKING: 'blocking',
  PARRY_ATTEMPT: 'parry_attempt',
  PARRY_SUCCESS: 'parry_success',
  HIT_STUN: 'hit_stun',
  BLOCK_STUN: 'block_stun',
  CLASH_RECOIL: 'clash_recoil',
  DYING: 'dying',
  DEAD: 'dead',
  DODGE: 'dodge'
});

// === STANCES ===
export const Stance = Object.freeze({
  HIGH: 'high',
  MID: 'mid',
  LOW: 'low'
});

// === ATTACK TYPES ===
export const AttackType = Object.freeze({
  QUICK: 'quick',
  HEAVY: 'heavy',
  THRUST: 'thrust'
});

// === ATTACK ZONES (what body zones attacks target) ===
export const HitZone = Object.freeze({
  HEAD: 'head',
  TORSO: 'torso',
  LEGS: 'legs'
});

// === HIT RESULTS ===
export const HitResult = Object.freeze({
  CLEAN_HIT: 'clean_hit',
  BLOCKED: 'blocked',
  PARRIED: 'parried',
  CLASHED: 'clashed',
  WHIFF: 'whiff'
});

// === TIMING (in frames at 60fps) ===
export const FRAME_DURATION = 1 / 60;
export const FIXED_TIMESTEP = FRAME_DURATION;

// === COMBAT TUNING ===
export const HITS_TO_KILL = 2;
export const PARRY_WINDOW_FRAMES = 5;       // ~83ms - tight but fair
export const BLOCK_STARTUP_FRAMES = 2;
export const CLASH_PUSHBACK_FORCE = 3.0;
export const HIT_STUN_FRAMES = 30;          // 0.5s
export const BLOCK_STUN_FRAMES = 15;
export const PARRY_STUN_FRAMES = 45;        // attacker stunned on parried
export const DODGE_INVULN_FRAMES = 8;
export const DODGE_TOTAL_FRAMES = 20;
export const DASH_DURATION_FRAMES = 12;
export const STANCE_CHANGE_FRAMES = 6;

// === MOVEMENT ===
export const WALK_SPEED = 3.0;
export const DASH_SPEED = 8.0;
export const SIDESTEP_SPEED = 4.0;
export const ARENA_HALF_SIZE = 8.0;         // Arena extends -8 to +8

// === SLOW-MO ===
export const KILL_SLOWMO_FACTOR = 0.15;
export const KILL_SLOWMO_DURATION = 1.5;    // seconds real-time

// === ROUNDS ===
export const ROUNDS_TO_WIN = 3;
export const ROUND_INTRO_DURATION = 2.0;    // seconds
export const ROUND_END_DURATION = 2.5;
```

---

## 4. Core Systems -- Detailed Design

### 4a. `src/core/Renderer.js` -- WebGPU Renderer Initialization

```js
import * as THREE from 'three/webgpu';

export class Renderer {
  constructor() {
    this.renderer = null;
    this.scene = new THREE.Scene();
  }

  async init(container) {
    this.renderer = new THREE.WebGPURenderer({ antialias: true });
    await this.renderer.init();  // Critical: async WebGPU init
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => this.onResize());
    return this;
  }

  onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render(scene, camera) {
    this.renderer.render(scene, camera);
  }
}
```

Key decision: `import * as THREE from 'three/webgpu'` gives us `WebGPURenderer` as the default renderer class with automatic WebGL2 fallback. The `await this.renderer.init()` is mandatory.

### 4b. `src/core/Clock.js` -- Fixed-Timestep Game Loop

This is critical for a fighting game. Variable timestep causes frame-dependent behavior which breaks frame data. We use a semi-fixed timestep: accumulate real delta, step simulation at exactly 1/60s increments.

```js
export class Clock {
  constructor(updateFn, renderFn) {
    this.updateFn = updateFn;       // Called at fixed 60Hz
    this.renderFn = renderFn;       // Called every frame with interpolation alpha
    this.accumulator = 0;
    this.fixedDt = 1 / 60;
    this.lastTime = 0;
    this.timeScale = 1.0;           // For slow-mo: set to 0.15 for kill cam
    this.running = false;
  }

  start() {
    this.running = true;
    this.lastTime = performance.now() / 1000;
    this._loop();
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());

    const now = performance.now() / 1000;
    let dt = Math.min(now - this.lastTime, 0.1); // Cap to prevent spiral of death
    this.lastTime = now;

    dt *= this.timeScale;
    this.accumulator += dt;

    while (this.accumulator >= this.fixedDt) {
      this.updateFn(this.fixedDt);
      this.accumulator -= this.fixedDt;
    }

    const alpha = this.accumulator / this.fixedDt;
    this.renderFn(alpha);
  }

  setTimeScale(scale) {
    this.timeScale = scale;
  }
}
```

The `timeScale` property directly feeds the slow-motion system. During a killing blow, `Game.js` sets `clock.setTimeScale(KILL_SLOWMO_FACTOR)` and restores it after `KILL_SLOWMO_DURATION`.

### 4c. `src/core/InputManager.js` -- Input Polling + Input Buffer

Fighting games need an input buffer so that inputs entered during one state are remembered and executed at the first valid frame. This uses polling (not events alone) so we can check "is key held" for movement, and events for detecting fresh presses for actions.

```js
export class InputManager {
  constructor() {
    this.keys = {};              // Currently held keys
    this.justPressed = {};       // Keys pressed this frame (consumed after read)
    this.buffer = [];            // Input buffer: [{action, frame, player}, ...]
    this.bufferWindow = 8;       // Frames to keep buffered inputs
    this.currentFrame = 0;

    window.addEventListener('keydown', (e) => {
      if (!this.keys[e.code]) {
        this.justPressed[e.code] = true;
      }
      this.keys[e.code] = true;
      e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      e.preventDefault();
    });
  }

  update(frame) {
    this.currentFrame = frame;
    // Expire old buffer entries
    this.buffer = this.buffer.filter(b => frame - b.frame <= this.bufferWindow);
  }

  isHeld(keyCode) { return !!this.keys[keyCode]; }

  wasPressed(keyCode) {
    if (this.justPressed[keyCode]) {
      this.justPressed[keyCode] = false;
      return true;
    }
    return false;
  }

  bufferAction(action, player) {
    this.buffer.push({ action, player, frame: this.currentFrame });
  }

  consumeBuffered(player, action) {
    const idx = this.buffer.findIndex(b => b.player === player && b.action === action);
    if (idx !== -1) {
      this.buffer.splice(idx, 1);
      return true;
    }
    return false;
  }

  clearFrame() {
    this.justPressed = {};
  }
}
```

**Player input mappings** (defined in Constants or in a config fed to each player's controller):

| Action | Player 1 | Player 2 |
|--------|----------|----------|
| Move Forward | KeyD | ArrowRight |
| Move Backward | KeyA | ArrowLeft |
| Sidestep Up (into screen) | KeyW | ArrowUp |
| Sidestep Down (out of screen) | KeyS | ArrowDown |
| Quick Attack | KeyJ | Numpad1 |
| Heavy Attack | KeyK | Numpad2 |
| Thrust Attack | KeyL | Numpad3 |
| Change Stance | KeyI | Numpad0 |
| Block/Parry | KeyU | NumpadEnter |
| Dodge | Space | ShiftRight |

Forward/backward are relative to facing direction. Each fighter always faces the opponent, so "forward" is always toward the enemy, "backward" is always away.

---

## 5. Combat System Architecture -- The Heart of the Game

### 5a. `src/combat/FighterStateMachine.js` -- Per-Fighter FSM

This is the most complex and important module. Each fighter has exactly one active state. State transitions are governed by strict rules.

**State Transition Diagram:**

```
                    ┌──────────────────────────────────────────────┐
                    │                                              │
                    ▼                                              │
    ┌─────────── IDLE ◄──────────────────────────────────┐        │
    │              │                                      │        │
    │   ┌──────────┼──────────────────┐                   │        │
    │   │          │                  │                    │        │
    │   ▼          ▼                  ▼                    │        │
    │ WALK_*    SIDESTEP_*       DASH_*                    │        │
    │   │          │                  │                    │        │
    │   └──────────┴────────┬─────────┘                    │        │
    │                       │                              │        │
    │                       ▼                              │        │
    │              ATTACK_STARTUP ──────► ATTACK_ACTIVE    │        │
    │                                         │            │        │
    │                                         ▼            │        │
    │                                  ATTACK_RECOVERY ────┘        │
    │                                                               │
    │         ┌─── BLOCKING ◄─── (from IDLE on block input)         │
    │         │                                                     │
    │         ├─── PARRY_ATTEMPT ──► PARRY_SUCCESS                  │
    │         │                          │                          │
    │         └──────────────────────────┴──────────────────────────┘
    │
    ├──► DODGE ────────────────────────────────► IDLE
    │
    ├──► HIT_STUN ─────────────────────────────► IDLE (or DYING if lethal)
    │
    ├──► BLOCK_STUN ───────────────────────────► IDLE
    │
    ├──► CLASH_RECOIL ─────────────────────────► IDLE
    │
    └──► DYING ────────────────────────────────► DEAD
```

**Key FSM implementation structure:**

```js
export class FighterStateMachine {
  constructor(fighter) {
    this.fighter = fighter;
    this.state = FighterState.IDLE;
    this.frameCounter = 0;        // Frames spent in current state
    this.stateData = {};          // State-specific data (which attack, etc.)
  }

  transition(newState, data = {}) {
    this.onExit(this.state);
    this.state = newState;
    this.frameCounter = 0;
    this.stateData = data;
    this.onEnter(newState, data);
  }

  update() {
    this.frameCounter++;
    // State-specific update logic via dispatch table
    const handler = this.stateHandlers[this.state];
    if (handler) handler.call(this);
  }

  // Dispatch table pattern -- avoids giant switch statement
  stateHandlers = {
    [FighterState.IDLE]: function() { /* check inputs, allow transitions */ },
    [FighterState.ATTACK_STARTUP]: function() {
      if (this.frameCounter >= this.stateData.startupFrames) {
        this.transition(FighterState.ATTACK_ACTIVE, this.stateData);
      }
    },
    [FighterState.ATTACK_ACTIVE]: function() {
      // Hitbox is live during this state
      if (this.frameCounter >= this.stateData.activeFrames) {
        this.transition(FighterState.ATTACK_RECOVERY, this.stateData);
      }
    },
    [FighterState.ATTACK_RECOVERY]: function() {
      if (this.frameCounter >= this.stateData.recoveryFrames) {
        this.transition(FighterState.IDLE);
      }
    },
    // ... other handlers
  };

  canAct() {
    return this.state === FighterState.IDLE ||
           this.state === FighterState.WALK_FORWARD ||
           this.state === FighterState.WALK_BACKWARD;
  }

  canBlock() {
    return this.canAct();
  }

  isVulnerable() {
    if (this.state === FighterState.DODGE &&
        this.frameCounter <= DODGE_INVULN_FRAMES) return false;
    return this.state !== FighterState.BLOCKING &&
           this.state !== FighterState.PARRY_ATTEMPT;
  }
}
```

### 5b. `src/combat/StanceSystem.js` -- Stance Definitions and Guard Coverage

```js
import { Stance, HitZone, AttackType } from '../core/Constants.js';

// What zones each stance blocks
export const STANCE_GUARD_COVERAGE = {
  [Stance.HIGH]: [HitZone.HEAD],
  [Stance.MID]:  [HitZone.TORSO],
  [Stance.LOW]:  [HitZone.LEGS]
};

// What zone each stance+attack combination targets
export const ATTACK_TARGET_ZONE = {
  [Stance.HIGH]: {
    [AttackType.QUICK]:  HitZone.HEAD,    // Horizontal head cut
    [AttackType.HEAVY]:  HitZone.TORSO,   // Overhead cleave falls to torso
    [AttackType.THRUST]: HitZone.HEAD     // Thrust to face
  },
  [Stance.MID]: {
    [AttackType.QUICK]:  HitZone.TORSO,
    [AttackType.HEAVY]:  HitZone.TORSO,
    [AttackType.THRUST]: HitZone.TORSO
  },
  [Stance.LOW]: {
    [AttackType.QUICK]:  HitZone.LEGS,
    [AttackType.HEAVY]:  HitZone.TORSO,   // Sweeping upward slash
    [AttackType.THRUST]: HitZone.LEGS
  }
};
```

This creates a core rock-paper-scissors dynamic: your stance determines both your guard zone AND your attack angles. A player in Mid Stance is protected from torso attacks but vulnerable to head and leg strikes. This forces stance-reading and counter-play.

**Stance change mechanic**: pressing the stance button cycles HIGH -> MID -> LOW -> HIGH. Costs `STANCE_CHANGE_FRAMES` (6 frames = 100ms) during which you cannot act. This prevents stance-spam and makes commitment meaningful.

### 5c. `src/combat/AttackData.js` -- Frame Data Tables

Every fighting game lives and dies by its frame data. Each attack has three phases:
1. **Startup**: Wind-up animation, no hitbox, committed but can be interrupted by getting hit
2. **Active**: Hitbox is live, will trigger hit resolution on contact
3. **Recovery**: Cooldown, no hitbox, vulnerable to punishment

```js
import { Stance, AttackType } from '../core/Constants.js';

// Frame data: [startup, active, recovery] in frames (60fps)
// Also: reach (world units), damage (1 = one clean hit toward the 2-hit kill)
export const ATTACK_DATA = {
  [Stance.HIGH]: {
    [AttackType.QUICK]:  { startup: 6,  active: 3, recovery: 10, reach: 1.8, damage: 1, name: 'Descending Swallow' },
    [AttackType.HEAVY]:  { startup: 18, active: 5, recovery: 20, reach: 2.2, damage: 1, name: 'Heaven Splitter' },
    [AttackType.THRUST]: { startup: 10, active: 4, recovery: 14, reach: 2.5, damage: 1, name: 'Piercing Crane' }
  },
  [Stance.MID]: {
    [AttackType.QUICK]:  { startup: 5,  active: 3, recovery: 8,  reach: 1.6, damage: 1, name: 'Flowing Water' },
    [AttackType.HEAVY]:  { startup: 16, active: 6, recovery: 18, reach: 2.0, damage: 1, name: 'Mountain Cleave' },
    [AttackType.THRUST]: { startup: 8,  active: 4, recovery: 12, reach: 2.4, damage: 1, name: 'Dragon Stab' }
  },
  [Stance.LOW]: {
    [AttackType.QUICK]:  { startup: 7,  active: 3, recovery: 10, reach: 1.5, damage: 1, name: 'Serpent Bite' },
    [AttackType.HEAVY]:  { startup: 20, active: 5, recovery: 22, reach: 2.0, damage: 1, name: 'Earth Riser' },
    [AttackType.THRUST]: { startup: 9,  active: 4, recovery: 13, reach: 2.3, damage: 1, name: 'Viper Lunge' }
  }
};
```

Design rationale:
- **Quick attacks** (5-7f startup): Fast, safe, short range. Primary tool for poking. The mid-stance quick (5f) is the fastest move in the game.
- **Heavy attacks** (16-20f): Slow, huge recovery, but longer reach and wider active windows. Punishable on block or whiff. Reward hard reads.
- **Thrusts** (8-10f): Medium speed, longest reach. The spacing tool. Excellent for keeping distance but narrow hitbox (easier to sidestep).
- **All attacks do 1 damage**: With `HITS_TO_KILL = 2`, any two clean hits kill. There is no "chip damage." Heavy attacks are not "more damaging" -- they are riskier but harder to avoid at range.

### 5d. `src/combat/HitResolver.js` -- The Collision and Resolution Engine

This is called every frame during the simulation step. It checks all active hitboxes against all hurtboxes.

```js
export class HitResolver {
  resolve(attacker, defender) {
    // 1. Is attacker in ATTACK_ACTIVE state?
    if (attacker.fsm.state !== FighterState.ATTACK_ACTIVE) return null;

    // 2. Distance check (reach)
    const dist = attacker.position.distanceTo(defender.position);
    const attackData = attacker.currentAttackData;
    if (dist > attackData.reach) return HitResult.WHIFF;

    // 3. Facing check (attacker must face defender, within ~60 degree cone)
    if (!this.isFacing(attacker, defender)) return HitResult.WHIFF;

    // 4. Check if BOTH are in ATTACK_ACTIVE simultaneously (clash)
    if (defender.fsm.state === FighterState.ATTACK_ACTIVE) {
      return HitResult.CLASHED;
    }

    // 5. Check dodge invulnerability
    if (defender.fsm.state === FighterState.DODGE &&
        defender.fsm.frameCounter <= DODGE_INVULN_FRAMES) {
      return HitResult.WHIFF;
    }

    // 6. Check parry (defender in PARRY_ATTEMPT within window)
    if (defender.fsm.state === FighterState.PARRY_ATTEMPT &&
        defender.fsm.frameCounter <= PARRY_WINDOW_FRAMES) {
      return HitResult.PARRIED;
    }

    // 7. Check block (stance guard covers the attack zone?)
    const attackZone = ATTACK_TARGET_ZONE[attacker.stance][attacker.currentAttackType];
    const guardZones = STANCE_GUARD_COVERAGE[defender.stance];
    if (defender.fsm.state === FighterState.BLOCKING &&
        guardZones.includes(attackZone)) {
      return HitResult.BLOCKED;
    }

    // 8. Clean hit
    return HitResult.CLEAN_HIT;
  }
}
```

**After resolution, effects are applied by DamageSystem:**

| Result | Effect on Attacker | Effect on Defender |
|--------|-------------------|-------------------|
| CLEAN_HIT | Attack continues normally | +1 damage to zone, HIT_STUN (30f). If damage >= 2, DYING state |
| BLOCKED | BLOCK_STUN (15f) | BLOCK_STUN (15f), pushed back |
| PARRIED | PARRY_STUN (45f) -- severe punishment | Recovers immediately, brief advantage |
| CLASHED | CLASH_RECOIL, pushed back | CLASH_RECOIL, pushed back |
| WHIFF | Nothing (attack continues and recovers normally) | Nothing |

### 5e. `src/combat/DamageSystem.js` -- Body Zone Damage

```js
export class DamageSystem {
  constructor() {
    // Each fighter tracks damage per zone
    // When total damage across all zones >= HITS_TO_KILL, fighter dies
    this.damages = new Map(); // fighterID -> { head: 0, torso: 0, legs: 0, total: 0 }
  }

  initFighter(id) {
    this.damages.set(id, { head: 0, torso: 0, legs: 0, total: 0 });
  }

  applyHit(fighterID, zone, amount) {
    const d = this.damages.get(fighterID);
    d[zone] += amount;
    d.total += amount;
    return d.total >= HITS_TO_KILL; // Returns true if lethal
  }

  reset(fighterID) {
    this.initFighter(fighterID);
  }
}
```

The body-zone tracking is displayed on the HUD as a simple body silhouette with colored zones (green = unhit, red = damaged). This replaces traditional health bars and supports the Bushido Blade aesthetic.

---

## 6. Entity System

### 6a. `src/entities/Fighter.js` -- Fighter Entity

```js
export class Fighter {
  constructor(id, playerIndex) {
    this.id = id;
    this.playerIndex = playerIndex;  // 0 or 1
    this.position = new THREE.Vector3();
    this.facing = 1;                 // 1 = facing right, -1 = facing left

    // Systems
    this.fsm = new FighterStateMachine(this);
    this.stance = Stance.MID;        // Start in mid guard
    this.currentAttackType = null;
    this.currentAttackData = null;

    // Mesh
    this.group = new THREE.Group();  // Root scene node
    this.bodyParts = {};             // { head, torso, hips, ... }
    this.weapon = null;

    // Animation
    this.animator = new ProceduralAnimator(this);
  }

  update(dt) {
    this.fsm.update();
    this.animator.update(dt);
    this.updateFacing();
    this.group.position.copy(this.position);
  }

  updateFacing() {
    // Always face opponent
    this.group.rotation.y = this.facing > 0 ? 0 : Math.PI;
  }
}
```

### 6b. `src/entities/FighterBuilder.js` -- Procedural Character Geometry

Characters are built from Three.js primitives. No models needed.

```
Fighter geometry breakdown:
  - Head: SphereGeometry(0.12) -- slightly flattened
  - Torso: BoxGeometry(0.3, 0.4, 0.2) -- main body
  - Hips: BoxGeometry(0.28, 0.15, 0.18)
  - Upper arms: CylinderGeometry(0.04, 0.04, 0.25) x2
  - Forearms: CylinderGeometry(0.035, 0.035, 0.25) x2
  - Upper legs: CylinderGeometry(0.05, 0.04, 0.3) x2
  - Lower legs: CylinderGeometry(0.04, 0.035, 0.3) x2
  - Weapon hand anchor: empty Object3D at end of right forearm

Total height: ~1.7 units (roughly proportional human)

Materials:
  - Player 1: deep red (#8B0000) with white trim
  - Player 2: dark blue (#00008B) with gold trim
  - MeshStandardMaterial with roughness: 0.7 (cloth-like)
```

Each body part is a separate mesh attached to the group hierarchy via `Object3D` joints. This allows procedural animation by rotating joint nodes.

**Joint hierarchy:**
```
group (root)
  └─ hips
       ├─ torso
       │    ├─ head
       │    ├─ leftShoulder
       │    │    └─ leftUpperArm
       │    │         └─ leftForearm
       │    └─ rightShoulder
       │         └─ rightUpperArm
       │              └─ rightForearm
       │                   └─ weaponMount (Object3D)
       │                        └─ weapon mesh
       ├─ leftHip
       │    └─ leftUpperLeg
       │         └─ leftLowerLeg
       └─ rightHip
            └─ rightUpperLeg
                 └─ rightLowerLeg
```

### 6c. `src/entities/Weapon.js` and `WeaponData.js`

```js
// WeaponData.js
export const WEAPONS = {
  jian: {   // Chinese straight sword
    name: 'Jian',
    bladeLength: 0.9,
    bladeWidth: 0.03,
    guardWidth: 0.15,
    handleLength: 0.2,
    speedMod: 1.0,      // Multiplier on attack frame data
    reachMod: 1.0,
    color: 0xC0C0C0      // Silver blade
  },
  dao: {    // Chinese saber (curved)
    name: 'Dao',
    bladeLength: 0.8,
    bladeWidth: 0.04,
    guardWidth: 0.12,
    handleLength: 0.2,
    speedMod: 0.9,       // Slightly slower
    reachMod: 0.95,
    color: 0xD4AF37      // Gold-tinted blade
  },
  staff: {  // Wooden staff
    name: 'Gun (Staff)',
    bladeLength: 1.5,    // Much longer
    bladeWidth: 0.03,
    guardWidth: 0,
    handleLength: 0.6,
    speedMod: 1.1,       // Faster (staff is lighter at tip)
    reachMod: 1.3,       // Much more reach
    color: 0x8B4513      // Brown wood
  }
};
```

Weapon geometry is built from `BoxGeometry` (blade), `CylinderGeometry` (handle), and a small `BoxGeometry` (guard). The staff is just a long cylinder.

---

## 7. Animation System

### `src/animation/ProceduralAnimator.js`

No skeletal animation or glTF files. All animation is done by tweening joint rotations between keyframe poses. This is simpler, fully procedural, and gives the exact control needed for frame-accurate fighting game animation.

```js
export class ProceduralAnimator {
  constructor(fighter) {
    this.fighter = fighter;
    this.currentPose = null;
    this.targetPose = null;
    this.blendProgress = 0;
    this.blendDuration = 0;
  }

  setPose(poseName, durationFrames) {
    this.currentPose = this.captureCurrentPose();
    this.targetPose = AnimationLibrary.getPose(poseName, this.fighter.stance);
    this.blendProgress = 0;
    this.blendDuration = durationFrames;
  }

  update(dt) {
    if (!this.targetPose) return;
    this.blendProgress++;
    const t = Math.min(this.blendProgress / this.blendDuration, 1);
    const eased = this.easeInOutQuad(t);
    this.applyBlendedPose(this.currentPose, this.targetPose, eased);
  }

  captureCurrentPose() {
    // Snapshot all joint rotations into an object
    const pose = {};
    for (const [name, joint] of Object.entries(this.fighter.bodyParts)) {
      pose[name] = joint.rotation.clone();
    }
    return pose;
  }

  applyBlendedPose(from, to, t) {
    for (const [name, joint] of Object.entries(this.fighter.bodyParts)) {
      if (from[name] && to[name]) {
        joint.rotation.x = THREE.MathUtils.lerp(from[name].x, to[name].x, t);
        joint.rotation.y = THREE.MathUtils.lerp(from[name].y, to[name].y, t);
        joint.rotation.z = THREE.MathUtils.lerp(from[name].z, to[name].z, t);
      }
    }
  }
}
```

### `src/animation/AnimationLibrary.js`

Contains named pose definitions for every stance and action:

```js
// Each pose is an object of joint name -> { x, y, z } euler rotations
export const POSES = {
  // IDLE poses per stance
  'idle_high': {
    rightUpperArm: { x: -2.8, y: 0, z: 0.3 },   // Sword raised above head
    rightForearm:  { x: -0.5, y: 0, z: 0 },
    leftUpperArm:  { x: -0.3, y: 0, z: -0.2 },
    torso:         { x: 0, y: 0.1, z: 0 },
    // ... all joints
  },
  'idle_mid': {
    rightUpperArm: { x: -1.2, y: 0, z: 0.4 },   // Sword at chest height, forward
    rightForearm:  { x: -0.8, y: 0, z: 0 },
    // ...
  },
  'idle_low': {
    rightUpperArm: { x: -0.3, y: 0, z: 0.3 },   // Sword low, blade angled down
    rightForearm:  { x: -0.2, y: 0, z: 0 },
    // ...
  },

  // ATTACK poses (each attack has startup_pose, peak_pose, recovery_pose)
  'attack_high_quick_startup': { /* wind up */ },
  'attack_high_quick_peak':    { /* full extension */ },
  'attack_high_quick_recovery': { /* return to guard */ },
  // ... for all 9 stance+attack combos

  // BLOCK poses
  'block_high': { /* sword raised defensively */ },
  'block_mid':  { /* sword across body */ },
  'block_low':  { /* sword low guard */ },

  // HIT REACTIONS
  'hitstun_head':  { /* head snapped back */ },
  'hitstun_torso': { /* doubled over */ },
  'hitstun_legs':  { /* staggered */ },

  // DEATH
  'death_collapse': { /* crumpling */ },
};
```

### `src/animation/TrailEffect.js`

Sword trail is a ribbon mesh that follows the weapon tip. Implemented as a `BufferGeometry` with a ring buffer of positions.

```
- Maintains array of last N (20) weapon-tip world positions
- Each frame, push new tip position, shift old ones
- Build a triangle strip from the position history
- Apply gradient opacity (newest = full, oldest = transparent)
- Material: MeshBasicMaterial with vertex colors, transparent, additive blending
- Color: white-to-red for P1, white-to-blue for P2
```

---

## 8. AI System

### `src/ai/AIController.js`

The AI uses a **utility-based decision system**. Every frame (throttled by reaction time), it scores all possible actions and picks the highest-scoring one. This produces natural-feeling behavior without complex behavior trees.

```js
export class AIController {
  constructor(fighter, opponent, personality) {
    this.fighter = fighter;
    this.opponent = opponent;
    this.personality = personality;   // Difficulty settings
    this.decisionCooldown = 0;
    this.lastDecision = null;
  }

  update() {
    this.decisionCooldown--;
    if (this.decisionCooldown > 0) return this.lastDecision;

    // Reaction time: harder AI reacts faster
    this.decisionCooldown = this.personality.reactionFrames +
      Math.floor(Math.random() * this.personality.reactionJitter);

    const distance = this.getDistance();
    const opponentState = this.opponent.fsm.state;
    const myState = this.fighter.fsm.state;

    if (!this.fighter.fsm.canAct()) return null; // Can't make new decisions while committed

    // Score all actions
    const scores = {};

    // === MOVEMENT ===
    scores.walkForward  = this.scoreApproach(distance);
    scores.walkBackward = this.scoreRetreat(distance);
    scores.sidestep     = this.scoreSidestep(opponentState);

    // === ATTACKS ===
    scores.quickAttack  = this.scoreQuickAttack(distance, opponentState);
    scores.heavyAttack  = this.scoreHeavyAttack(distance, opponentState);
    scores.thrustAttack = this.scoreThrustAttack(distance, opponentState);

    // === DEFENSE ===
    scores.block        = this.scoreBlock(distance, opponentState);
    scores.parry        = this.scoreParry(distance, opponentState);
    scores.dodge        = this.scoreDodge(distance, opponentState);

    // === STANCE ===
    scores.changeStance = this.scoreStanceChange();

    // === IDLE (do nothing) ===
    scores.idle         = 0.3; // Base "hold position" score

    // Add randomness based on difficulty
    for (const key in scores) {
      scores[key] += (Math.random() - 0.5) * this.personality.randomness;
    }

    // Pick highest
    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    this.lastDecision = best[0];
    return best[0];
  }

  scoreQuickAttack(distance, oppState) {
    let score = 0;
    const reach = this.fighter.currentAttackData?.reach || 1.6;
    if (distance < reach * 1.1) score += 0.6;    // In range
    if (oppState === FighterState.ATTACK_RECOVERY) score += 0.8; // Punish
    if (oppState === FighterState.ATTACK_STARTUP) score += 0.4;  // Interrupt
    return score * this.personality.aggression;
  }

  scoreBlock(distance, oppState) {
    let score = 0;
    if (oppState === FighterState.ATTACK_STARTUP) score += 0.7;
    if (oppState === FighterState.ATTACK_ACTIVE) score += 0.9;
    if (distance < 2.0) score += 0.3;
    return score * this.personality.defensiveness;
  }

  // ... similar scoring for each action
}
```

### `src/ai/AIPersonality.js`

```js
export const AI_DIFFICULTY = {
  easy: {
    reactionFrames: 30,      // 500ms reaction time
    reactionJitter: 20,      // +0-333ms random delay
    aggression: 0.6,
    defensiveness: 0.4,
    randomness: 0.5,         // High noise in decisions
    parryAttemptRate: 0.1,   // Rarely tries to parry (risky)
    stanceReadAccuracy: 0.3  // Often picks wrong counter-stance
  },
  medium: {
    reactionFrames: 15,
    reactionJitter: 10,
    aggression: 0.8,
    defensiveness: 0.7,
    randomness: 0.3,
    parryAttemptRate: 0.3,
    stanceReadAccuracy: 0.6
  },
  hard: {
    reactionFrames: 6,       // 100ms -- superhuman but not instant
    reactionJitter: 4,
    aggression: 1.0,
    defensiveness: 0.9,
    randomness: 0.15,
    parryAttemptRate: 0.5,
    stanceReadAccuracy: 0.85
  }
};
```

---

## 9. Camera System

### `src/camera/CameraController.js`

```js
export class CameraController {
  constructor(camera) {
    this.camera = camera;            // PerspectiveCamera
    this.target = new THREE.Vector3(); // Midpoint between fighters
    this.idealOffset = new THREE.Vector3(0, 2, 8); // Default: side-on, slightly elevated
    this.currentOffset = this.idealOffset.clone();
    this.smoothSpeed = 5.0;
    this.minZoom = 5;
    this.maxZoom = 12;
    this.dramaticMode = false;
    this.dramaticTimer = 0;
  }

  update(dt, fighter1, fighter2) {
    // Midpoint between fighters
    this.target.lerpVectors(fighter1.position, fighter2.position, 0.5);

    // Dynamic zoom based on distance
    const dist = fighter1.position.distanceTo(fighter2.position);
    const zoomFactor = THREE.MathUtils.clamp(dist * 1.2, this.minZoom, this.maxZoom);

    if (this.dramaticMode) {
      this.updateDramaticCamera(dt);
    } else {
      // Side-view with depth
      const desiredPos = new THREE.Vector3(
        this.target.x,
        this.target.y + 2.0,
        this.target.z + zoomFactor
      );

      this.camera.position.lerp(desiredPos, this.smoothSpeed * dt);
      this.camera.lookAt(this.target.x, this.target.y + 0.8, this.target.z);
    }
  }

  triggerKillCamera(killer, victim) {
    // Dramatic low angle looking up at the killer
    this.dramaticMode = true;
    this.dramaticTimer = 0;
    this.dramaticTarget = killer.position.clone();
    this.dramaticAngle = new THREE.Vector3(
      victim.position.x + (killer.facing * -2),
      0.5,  // Low angle
      victim.position.z + 2
    );
  }

  updateDramaticCamera(dt) {
    this.dramaticTimer += dt;
    this.camera.position.lerp(this.dramaticAngle, 3.0 * dt);
    this.camera.lookAt(this.dramaticTarget);
    if (this.dramaticTimer > 2.0) {
      this.dramaticMode = false;
    }
  }
}
```

The camera sits on the +Z side looking in, giving a traditional side-on fighting game view, but with the 3D depth visible for sidestep movement. When fighters are far apart, it zooms out. When close, it zooms in for tension.

---

## 10. Arena and Environment

### `src/arena/Arena.js`

```
Arena geometry:
  - Platform: CylinderGeometry(ARENA_HALF_SIZE, ARENA_HALF_SIZE, 0.3, 64)
    - Material: MeshStandardMaterial, color #4a4a52 (grey stone), roughness 0.9
    - Surface detail: additional ring geometry lines etched on top (torus segments)
  - Edge markers: ring of thin TorusGeometry at platform edge (boundary warning)
  - Boundary detection: fighters cannot move beyond ARENA_HALF_SIZE from center

  Ring-out: If a fighter is pushed beyond boundary (from block pushback or dash), 
  they stumble (treated as a hit) -- adds positional pressure.
```

### `src/arena/Environment.js`

```
  - Scene.fog = new THREE.FogExp2(0x0a0a0a, 0.04) -- dark atmospheric fog
  - Ambient light: HemisphereLight(0xffeedd, 0x223344, 0.4) -- warm sky, cool ground
  - Key light: DirectionalLight(0xffeedd, 0.8) at (5, 10, 5) -- main shadow caster
  - Rim light: DirectionalLight(0x4488ff, 0.3) at (-3, 5, -5) -- cool rim for drama
  - Ground plane: large dark PlaneGeometry below the platform for fog to settle on
  - Particles: slow-drifting mote particles (50 small spheres with random drift)
```

---

## 11. Visual Effects

### `src/vfx/ParticleSystem.js`

Object-pooled particle system. Uses `InstancedMesh` for GPU-efficient rendering.

```
Particle types:
  - SPARKS: On clash/block. 20 particles, yellow-orange, fast velocity, short life (0.3s)
  - BLOOD_MIST: On clean hit. 15 particles, red, medium velocity, medium life (0.5s)
  - DUST: On dodge/dash. 10 particles, grey, slow velocity, long life (1s)
  - INK_SPLASH: On kill. 30 particles, black, explode outward, long life (2s)

Implementation:
  - Pool of 200 InstancedMesh instances (small SphereGeometry)
  - Each particle: position, velocity, life, maxLife, color, size
  - Update loop: apply velocity + gravity, fade alpha with life, recycle dead particles
```

### `src/vfx/ScreenEffects.js`

```js
export class ScreenEffects {
  constructor(camera, renderer) {
    this.shakeIntensity = 0;
    this.shakeDecay = 0.9;
    this.slowMoTarget = 1.0;
    this.flashAlpha = 0;
  }

  shake(intensity) {
    this.shakeIntensity = intensity;
  }

  update(dt, camera) {
    // Screen shake
    if (this.shakeIntensity > 0.01) {
      camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= this.shakeDecay;
    }

    // White flash (via CSS overlay)
    if (this.flashAlpha > 0) {
      this.flashAlpha -= dt * 3;
    }
  }

  triggerHitFlash() {
    this.flashAlpha = 0.4;
  }

  triggerKillFlash() {
    this.flashAlpha = 0.8;
  }
}
```

Trigger intensities:
- **Block**: `shake(0.05)` -- subtle
- **Clean hit**: `shake(0.15)` + hit flash + 3-frame hitstop (freeze both fighters for 3 frames)
- **Kill**: `shake(0.3)` + kill flash + slow-mo for 1.5 seconds real-time

---

## 12. UI System

### `src/ui/UIManager.js`

All UI is HTML/CSS overlaid on the canvas. This avoids Three.js text rendering complexity and gives full CSS styling control.

```
UI structure:
  #ui-overlay (position: absolute, covers canvas)
    ├── #title-screen      (full-screen, wuxia calligraphy title)
    ├── #select-screen     (mode select: vs Player, vs AI + difficulty)
    ├── #hud               (in-match: stance indicators, body diagrams, round pips)
    │    ├── .player-info.left    (P1 side)
    │    │    ├── .stance-indicator
    │    │    ├── .body-diagram (SVG: head/torso/legs colored by damage)
    │    │    └── .round-pips (3 circles, filled = won)
    │    ├── .center-text   (ROUND 1, FIGHT!, KO, etc.)
    │    └── .player-info.right   (P2 side, mirrored)
    ├── #victory-screen    (winner announcement)
    └── #attack-name-flash (brief flash of attack name on hit, wuxia style)

Font: serif stack (Georgia, 'Times New Roman', serif) for wuxia calligraphy feel
Colors: Black backgrounds, gold (#D4AF37) text, red accents
```

### `src/ui/HUD.js`

```js
export class HUD {
  constructor(container) {
    // Build DOM elements
    this.p1StanceIndicator = this.createStanceIndicator('left');
    this.p2StanceIndicator = this.createStanceIndicator('right');
    this.p1BodyDiagram = this.createBodyDiagram('left');
    this.p2BodyDiagram = this.createBodyDiagram('right');
    this.roundPips = this.createRoundPips();
    this.centerText = this.createCenterText();
  }

  createBodyDiagram(side) {
    // Simple inline SVG of a human silhouette divided into 3 zones
    // Each zone (head, torso, legs) is a <path> with a fill color
    // Green (#4a4) = undamaged, Red (#a44) = damaged
    // Returns references to the three zone elements for dynamic updating
  }

  updateDamage(player, zone) {
    const diagram = player === 0 ? this.p1BodyDiagram : this.p2BodyDiagram;
    diagram[zone].style.fill = '#cc3333'; // Red for damaged
  }

  showAttackName(name) {
    // Flash the wuxia attack name (e.g., "Dragon Stab") center-screen
    // Fade in fast, hold 0.5s, fade out
    // CSS: font-size 2em, color gold, text-shadow black, opacity animation
  }
}
```

---

## 13. Game Flow Controller

### `src/Game.js` -- Master Orchestrator

```js
export class Game {
  constructor() {
    this.renderer = new Renderer();
    this.input = new InputManager();
    this.clock = new Clock(
      (dt) => this.fixedUpdate(dt),
      (alpha) => this.render(alpha)
    );
    this.state = GameState.TITLE;
    this.fighters = [null, null];
    this.camera = null;
    this.cameraController = null;
    this.scene = null;
    this.hitResolver = new HitResolver();
    this.damageSystem = new DamageSystem();
    this.particles = null;
    this.screenEffects = null;

    // Match state
    this.roundWins = [0, 0];
    this.currentRound = 0;
    this.frameCount = 0;
  }

  async init() {
    await this.renderer.init(document.body);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    this.cameraController = new CameraController(this.camera);
    this.arena = new Arena(this.scene);
    this.environment = new Environment(this.scene);
    this.particles = new ParticleSystem(this.scene);
    this.screenEffects = new ScreenEffects(this.camera, this.renderer);
    this.ui = new UIManager();

    this.ui.showTitleScreen(() => this.onTitleDone());
    this.clock.start();
  }

  fixedUpdate(dt) {
    this.frameCount++;
    this.input.update(this.frameCount);

    switch (this.state) {
      case GameState.FIGHTING:
        this.updateFighting(dt);
        break;
      case GameState.ROUND_INTRO:
        this.updateRoundIntro(dt);
        break;
      case GameState.ROUND_END:
        this.updateRoundEnd(dt);
        break;
    }

    this.input.clearFrame();
  }

  updateFighting(dt) {
    // 1. Process inputs for each fighter (or AI)
    for (const fighter of this.fighters) {
      fighter.controller.processInput(this.input, fighter);
    }

    // 2. Update fighter state machines
    for (const fighter of this.fighters) {
      fighter.update(dt);
    }

    // 3. Hit resolution (check both directions)
    this.resolveHits(this.fighters[0], this.fighters[1]);
    this.resolveHits(this.fighters[1], this.fighters[0]);

    // 4. Boundary enforcement
    this.arena.enforceBoundaries(this.fighters);

    // 5. Update camera
    this.cameraController.update(dt, this.fighters[0], this.fighters[1]);

    // 6. Update VFX
    this.particles.update(dt);
    this.screenEffects.update(dt, this.camera);
  }

  resolveHits(attacker, defender) {
    const result = this.hitResolver.resolve(attacker, defender);
    if (!result || result === HitResult.WHIFF) return;

    switch (result) {
      case HitResult.CLEAN_HIT:
        const zone = ATTACK_TARGET_ZONE[attacker.stance][attacker.currentAttackType];
        const isLethal = this.damageSystem.applyHit(defender.id, zone, 1);
        defender.fsm.transition(isLethal ? FighterState.DYING : FighterState.HIT_STUN);
        this.screenEffects.shake(isLethal ? 0.3 : 0.15);
        this.particles.spawn('hit', defender.position, zone);
        this.ui.hud.updateDamage(defender.playerIndex, zone);
        this.ui.hud.showAttackName(attacker.currentAttackData.name);

        if (isLethal) {
          this.onKill(attacker, defender);
        }

        // Hitstop: freeze both fighters for 3 frames
        this.applyHitstop(3);
        break;

      case HitResult.BLOCKED:
        attacker.fsm.transition(FighterState.BLOCK_STUN);
        defender.fsm.transition(FighterState.BLOCK_STUN);
        this.pushBack(attacker, defender, 1.5);
        this.screenEffects.shake(0.05);
        this.particles.spawn('sparks', defender.position);
        break;

      case HitResult.PARRIED:
        attacker.fsm.transition(FighterState.PARRY_STUN_FRAMES); // Long stun
        defender.fsm.transition(FighterState.PARRY_SUCCESS);
        this.screenEffects.shake(0.08);
        this.particles.spawn('sparks', defender.position);
        break;

      case HitResult.CLASHED:
        attacker.fsm.transition(FighterState.CLASH_RECOIL);
        defender.fsm.transition(FighterState.CLASH_RECOIL);
        this.pushBack(attacker, defender, CLASH_PUSHBACK_FORCE);
        this.screenEffects.shake(0.12);
        this.particles.spawn('sparks',
          attacker.position.clone().lerp(defender.position, 0.5));
        break;
    }

    // Mark that this attack has resolved (prevent multi-hit)
    attacker.attackResolved = true;
  }

  onKill(killer, victim) {
    this.state = GameState.ROUND_END;
    this.clock.setTimeScale(KILL_SLOWMO_FACTOR);
    this.screenEffects.triggerKillFlash();
    this.cameraController.triggerKillCamera(killer, victim);
    this.particles.spawn('ink_splash', victim.position);

    setTimeout(() => {
      this.clock.setTimeScale(1.0);
      this.roundWins[killer.playerIndex]++;
      this.currentRound++;

      if (this.roundWins[killer.playerIndex] >= ROUNDS_TO_WIN) {
        this.state = GameState.VICTORY;
        this.ui.showVictoryScreen(killer.playerIndex);
      } else {
        this.startRound();
      }
    }, KILL_SLOWMO_DURATION * 1000 / KILL_SLOWMO_FACTOR);
  }

  startRound() {
    this.state = GameState.ROUND_INTRO;
    // Reset fighter positions
    this.fighters[0].position.set(-3, 0, 0);
    this.fighters[1].position.set(3, 0, 0);
    this.fighters[0].facing = 1;
    this.fighters[1].facing = -1;
    // Reset damage
    this.damageSystem.reset(this.fighters[0].id);
    this.damageSystem.reset(this.fighters[1].id);
    // Reset FSMs
    this.fighters[0].fsm.transition(FighterState.IDLE);
    this.fighters[1].fsm.transition(FighterState.IDLE);
    this.fighters[0].stance = Stance.MID;
    this.fighters[1].stance = Stance.MID;

    this.ui.hud.showCenterText(`ROUND ${this.currentRound + 1}`, 1.5, () => {
      this.ui.hud.showCenterText('FIGHT!', 0.5, () => {
        this.state = GameState.FIGHTING;
      });
    });
  }
}
```

### `src/main.js` -- Entry Point

```js
import { Game } from './Game.js';

const game = new Game();
game.init().catch(err => {
  console.error('Failed to initialize game:', err);
  document.body.innerHTML = `<div style="color:white;padding:40px;font-family:serif;">
    <h1>Initialization Failed</h1>
    <p>${err.message}</p>
    <p>This game requires a modern browser with WebGPU or WebGL2 support.</p>
  </div>`;
});
```

---

## 14. Player Controller Abstraction

Each fighter has a controller (human or AI) that reads input and translates it to actions.

```js
// HumanController.js (embedded in Fighter.js or separate)
export class HumanController {
  constructor(playerIndex, keymap) {
    this.playerIndex = playerIndex;
    this.keymap = keymap;
  }

  processInput(inputManager, fighter) {
    if (!fighter.fsm.canAct()) return;

    // Movement (held keys)
    if (inputManager.isHeld(this.keymap.forward)) {
      fighter.fsm.transition(FighterState.WALK_FORWARD);
    } else if (inputManager.isHeld(this.keymap.backward)) {
      fighter.fsm.transition(FighterState.WALK_BACKWARD);
    } else if (inputManager.isHeld(this.keymap.up)) {
      fighter.fsm.transition(FighterState.SIDESTEP_LEFT);
    } else if (inputManager.isHeld(this.keymap.down)) {
      fighter.fsm.transition(FighterState.SIDESTEP_RIGHT);
    }

    // Actions (press keys -- buffered)
    if (inputManager.wasPressed(this.keymap.quickAttack)) {
      fighter.startAttack(AttackType.QUICK);
    }
    if (inputManager.wasPressed(this.keymap.heavyAttack)) {
      fighter.startAttack(AttackType.HEAVY);
    }
    if (inputManager.wasPressed(this.keymap.thrustAttack)) {
      fighter.startAttack(AttackType.THRUST);
    }
    if (inputManager.wasPressed(this.keymap.stanceChange)) {
      fighter.cycleStance();
    }
    if (inputManager.wasPressed(this.keymap.block)) {
      fighter.startBlock();
    }
    if (inputManager.wasPressed(this.keymap.dodge)) {
      fighter.startDodge();
    }
  }
}
```

**Key mappings object:**
```js
const P1_KEYS = {
  forward: 'KeyD', backward: 'KeyA', up: 'KeyW', down: 'KeyS',
  quickAttack: 'KeyJ', heavyAttack: 'KeyK', thrustAttack: 'KeyL',
  stanceChange: 'KeyI', block: 'KeyU', dodge: 'Space'
};
const P2_KEYS = {
  forward: 'ArrowRight', backward: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown',
  quickAttack: 'Numpad1', heavyAttack: 'Numpad2', thrustAttack: 'Numpad3',
  stanceChange: 'Numpad0', block: 'NumpadEnter', dodge: 'ShiftRight'
};
```

---

## 15. Implementation Sequence (Build Order)

The implementation should proceed in this order. Each phase produces a testable milestone.

### Phase 1: Bootstrap (Files: 4)
1. `package.json` -- dependencies
2. `vite.config.js` -- build config
3. `index.html` -- page shell
4. `src/main.js` -- entry point with basic WebGPU renderer test (render a colored cube)

**Milestone**: Browser shows a spinning cube. WebGPU/WebGL2 works.

### Phase 2: Core Infrastructure (Files: 5)
5. `src/core/Constants.js` -- all enums and constants
6. `src/core/Renderer.js` -- renderer wrapper
7. `src/core/Clock.js` -- fixed timestep loop
8. `src/core/InputManager.js` -- keyboard input
9. `src/Game.js` -- skeleton with init, update, render

**Milestone**: Game loop runs at 60Hz, input logged to console.

### Phase 3: Arena & Camera (Files: 3)
10. `src/arena/Arena.js` -- stone platform
11. `src/arena/Environment.js` -- fog, lights, particles
12. `src/camera/CameraController.js` -- tracking camera

**Milestone**: Camera orbits a lit stone platform with fog.

### Phase 4: Fighter Rendering (Files: 4)
13. `src/entities/FighterBuilder.js` -- procedural body geometry
14. `src/entities/Weapon.js` -- weapon geometry
15. `src/entities/WeaponData.js` -- weapon stats
16. `src/entities/Fighter.js` -- fighter entity

**Milestone**: Two capsule fighters standing on the platform in mid-stance.

### Phase 5: Animation (Files: 3)
17. `src/animation/AnimationLibrary.js` -- all pose data
18. `src/animation/ProceduralAnimator.js` -- tween driver
19. `src/animation/TrailEffect.js` -- sword trail

**Milestone**: Fighters animate between idle poses when stance changes.

### Phase 6: Combat Core (Files: 5)
20. `src/combat/StanceSystem.js` -- stance data
21. `src/combat/AttackData.js` -- frame data tables
22. `src/combat/FighterStateMachine.js` -- FSM
23. `src/combat/HitResolver.js` -- collision + resolution
24. `src/combat/DamageSystem.js` -- damage tracking

**Milestone**: Two human players can attack, block, parry, and kill each other.

### Phase 7: VFX (Files: 4)
25. `src/vfx/ParticleSystem.js` -- GPU particles
26. `src/vfx/ScreenEffects.js` -- shake, flash, slow-mo
27. `src/vfx/InkEffects.js` -- ink splashes
28. `src/utils/ObjectPool.js` -- object pooling

**Milestone**: Hits produce sparks, kills trigger slow-mo with ink splash.

### Phase 8: UI (Files: 5)
29. `src/ui/UIManager.js` -- overlay controller
30. `src/ui/TitleScreen.js` -- title
31. `src/ui/CharacterSelect.js` -- mode/weapon select
32. `src/ui/HUD.js` -- in-match display
33. `src/ui/VictoryScreen.js` -- results

**Milestone**: Full game flow from title through rounds to victory.

### Phase 9: AI (Files: 3)
34. `src/ai/AIController.js` -- decision engine
35. `src/ai/AIBehaviors.js` -- scoring functions (can be merged into AIController)
36. `src/ai/AIPersonality.js` -- difficulty presets

**Milestone**: Single player vs AI mode works at three difficulty levels.

### Phase 10: Polish (Files: 1)
37. `src/utils/MathUtils.js` -- utility functions
- Tune frame data through playtesting
- Adjust particle counts and colors
- Add hitstop (frame freeze) on hits
- Ring-out mechanic
- Sound effects (optional, via Web Audio API oscillators)

---

## 16. Key Architectural Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Renderer | `three/webgpu` import with auto-fallback | Future-proof, single import, no conditional code |
| Game loop | Fixed 60Hz sim + variable render | Frame data must be deterministic for fighting game fairness |
| Animation | Procedural tween between joint poses | No asset dependencies, precise frame control, smaller scope |
| Geometry | Three.js primitives + hierarchy | No GLTF loading, no external files, fully self-contained |
| State machine | Dispatch table pattern | Cleaner than switch/case, easy to add states, per-fighter instance |
| UI | HTML/CSS overlay | Simpler than Three.js text, full styling control, responsive |
| AI | Utility-based scoring | Produces varied natural behavior, easy to tune via personality presets |
| Input | Polling + event buffer | Polling for held-key movement, events for action buffering (fighting game standard) |
| Hit resolution | Zone-based guard coverage | Creates stance-reading metagame, the core of the Bushido Blade feel |
| Damage | Zone tracking, 2-hit kill | Replaces HP bars, supports lethal combat design pillar |
| Slow-mo | timeScale on game clock | Simple, affects entire simulation uniformly, dramatic effect |
| Particles | InstancedMesh pool | GPU-efficient, no per-particle draw calls, supports 200+ particles |

---

## 17. Data Flow Diagram (Per Frame)

```
Input (keyboard events)
    │
    ▼
InputManager.update()  ──►  buffer expired inputs, track held keys
    │
    ▼
Controller.processInput()  ──►  translate keys to fighter actions
    │                            (HumanController or AIController)
    ▼
FighterStateMachine.update()  ──►  advance state, check transitions
    │
    ▼
Fighter.update()  ──►  apply movement, update position, update animation
    │
    ▼
HitResolver.resolve()  ──►  check hitboxes vs hurtboxes, distance, zones
    │
    ├──► DamageSystem.applyHit()  ──►  track zone damage, check lethality
    ├──► ParticleSystem.spawn()   ──►  visual feedback
    ├──► ScreenEffects.shake()    ──►  screen impact
    └──► HUD.update()             ──►  body diagram, attack name flash
    │
    ▼
Arena.enforceBoundaries()  ──►  clamp positions, ring-out check
    │
    ▼
CameraController.update()  ──►  track midpoint, dynamic zoom
    │
    ▼
Renderer.render(scene, camera)  ──►  draw frame
```

---

## 18. Potential Challenges and Mitigations

1. **Top-level await in Vite**: Solved by `build.target: 'esnext'` in vite config. No plugin needed.

2. **Parry timing feel**: 5 frames (83ms) is tight. If it feels impossible, increase to 7 frames (117ms). The `PARRY_WINDOW_FRAMES` constant makes this a single-line tuning change.

3. **Hitstop implementation**: Freeze both fighters for N frames on hit. Implemented by checking a `hitstopRemaining` counter in `Game.updateFighting()` -- if > 0, skip fighter updates but keep rendering.

4. **Facing direction with 3D sidesteps**: Fighters always face each other (auto-rotate). "Forward" always means "toward opponent." The Z-axis (sidestep) adds depth without changing the fundamental 2D fighting game mental model.

5. **Clash detection timing**: Two attacks in ATTACK_ACTIVE on the same frame. Since we use fixed timestep, this is deterministic. Check both attacker-vs-defender orderings each frame.

6. **Input priority**: If multiple action keys are pressed on the same frame, priority order is: Dodge > Block > Attack > Stance Change > Movement. This prevents accidental inputs from overriding defensive actions.

7. **WebGPU browser support**: The `three/webgpu` import handles fallback to WebGL2 automatically. No additional code needed. The game uses standard materials (MeshStandardMaterial) which work identically under both backends.

---

### Critical Files for Implementation

- **C:\Users\cobra\wuxia-warrior\src\combat\FighterStateMachine.js** - The most complex and foundational file; every gameplay interaction flows through the FSM state transitions and frame counting
- **C:\Users\cobra\wuxia-warrior\src\combat\HitResolver.js** - Core combat resolution logic that determines hit/block/parry/clash outcomes based on stance zones and timing
- **C:\Users\cobra\wuxia-warrior\src\Game.js** - Master orchestrator that wires all systems together, manages game flow states, and coordinates the per-frame update pipeline
- **C:\Users\cobra\wuxia-warrior\src\core\Constants.js** - Single source of truth for all enums, frame data constants, and tuning values referenced by every other module
- **C:\Users\cobra\wuxia-warrior\src\entities\FighterBuilder.js** - Procedural geometry construction with joint hierarchy that the animation system depends on for pose blending