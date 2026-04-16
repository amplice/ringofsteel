// Game states
export const GameState = {
  TITLE: 'title',
  SELECT: 'select',
  ROUND_INTRO: 'round_intro',
  FIGHTING: 'fighting',
  KILL_CAM: 'kill_cam',
  ROUND_END: 'round_end',
  VICTORY: 'victory',
  ANIM_PLAYER: 'anim_player',
  POSE_BROWSER: 'pose_browser',
};

// Fighter states
export const FighterState = {
  IDLE: 'idle',
  WALK_FORWARD: 'walk_forward',
  WALK_BACK: 'walk_back',
  SIDESTEP: 'sidestep',
  ATTACK_ACTIVE: 'attack_active',
  BLOCK: 'block',
  BLOCK_STUN: 'block_stun',
  PARRY: 'parry',
  PARRY_SUCCESS: 'parry_success',
  DODGE: 'dodge',
  HIT_STUN: 'hit_stun',
  PARRIED_STUN: 'parried_stun',
  DYING: 'dying',
  DEAD: 'dead',
  CLASH: 'clash',
};

// Attack types
export const AttackType = {
  QUICK: 'quick',
  HEAVY: 'heavy',
  THRUST: 'thrust',
};

// Hit results
export const HitResult = {
  CLASH: 'clash',
  WHIFF: 'whiff',
  PARRIED: 'parried',
  BLOCKED: 'blocked',
  LETHAL_HIT: 'lethal_hit',
};

// Weapon types
export const WeaponType = {
  KATANA: 'katana',
  SPEAR: 'spear',
  SWORD: 'sword',
};

// Timing constants (in frames at 60fps)
export const FRAME_DURATION = 1 / 60;

export const PARRY_WINDOW_FRAMES = 9;
export const PARRY_REENTRY_COOLDOWN_FRAMES = 24;
export const BLOCK_STUN_FRAMES = 16;
export const HIT_STUN_FRAMES = 16;
export const PARRIED_STUN_FRAMES = 14;
// Legacy explicit post-parry state duration. This no longer creates a unique
// human-facing mechanic beyond normal actionability; the attacker's
// PARRIED_STUN is the real punish window. The state is still kept because AI,
// telemetry, and presentation key off it directly.
export const PARRY_SUCCESS_FRAMES_BY_ATTACK = Object.freeze({
  quick: 20,
  heavy: 13,
  thrust: 16,
});
export const CLASH_PUSHBACK_FRAMES = 16;

// Knockback slide speed (units/sec) — fighters slide apart during stun
export const KNOCKBACK_SLIDE_SPEED = 1.88;
export const BLOCK_KNOCKBACK_SLIDE_SPEED = 3.6;

// Heavy attack advantage multipliers.
// Stun and displacement are separated so they can be tuned independently.
export const HEAVY_ADVANTAGE_STUN_MULT = 1.5;
export const HEAVY_ADVANTAGE_SLIDE_MULT = 1.5;
export const HEAVY_CLASH_STUN_MULT = 1.5;
export const HEAVY_CLASH_WINNER_STUN_MULT = 0.5;
export const CLASH_SLIDE_MULT = 0.35;


// Sidestep
export const SIDESTEP_DASH_FRAMES = 24;
export const SIDESTEP_DASH_DISTANCE = 1.4;
export const SIDESTEP_RECOVERY_FRAMES = 8;

// Backstep
export const BACKSTEP_FRAMES = 21;
export const BACKSTEP_DISTANCE = 1.5;
export const BACKSTEP_INVULN_FRAMES = 6;

// Block pushback
export const BLOCK_PUSHBACK_SPEED = 2.35;

// Movement
export const WALK_SPEED = 3.0;
export const STEP_DISTANCE = 1.0;
export const STEP_FRAMES = 34;
export const STEP_COOLDOWN_FRAMES = 8;
export const ARENA_RADIUS = 8.0;
export const FIGHT_START_DISTANCE = 5.0;

// Kill cam
export const KILL_SLOWMO_SCALE = 0.3;
export const KILL_SLOWMO_DURATION = 3.0;

// Match
export const ROUNDS_TO_WIN = 3;
export const ROUND_INTRO_DURATION = 2.0;
export const ROUND_END_DELAY = 1.5;

// Input buffer
export const INPUT_BUFFER_SIZE = 8;
export const INPUT_BUFFER_WINDOW = 6;

// Debug
export const DEBUG_OPTIONS = {
  overlayEnabled: false,
  persistToggle: true,
  toggleKey: 'F3',
  storageKey: 'ring-of-steel-debug-overlay',
};

