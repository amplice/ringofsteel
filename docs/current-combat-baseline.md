# Current Combat Baseline

This file is the intentionally locked combat snapshot for the current stabilization pass.

If balance changes are intentional, update this file and re-run the regression suite.

## Core

- `PARRY_WINDOW_FRAMES = 9`
- `PARRY_REENTRY_COOLDOWN_FRAMES = 24`
- `PARRIED_STUN_FRAMES = 14`
- `PARRY_SUCCESS_FRAMES_BY_ATTACK = { quick: 20, heavy: 13, thrust: 16 }`
- `BLOCK_STUN_FRAMES = 16`
- `BLOCK_KNOCKBACK_SLIDE_SPEED = 3.6`

## Spearman

- `attackStrength = 1.0`
- `defenseStoutness = 0.9`
- `walkSpeedMult = 0.5`
- `sidestepDistance = 1.2`
- `stepDistance = 0.95`
- `attack_quick clip speed = 1.05`
- `attack_heavy clip speed = 0.97`
- `attack_thrust clip speed = 0.93`
- attacks:
  - `quick`: `43f`, `aiRange 2.0`, `lunge 0.5`, `blockPush 0.5`
  - `heavy`: `55f`, `aiRange 2.3`, `lunge 0.6`, `blockPush 1.2`
  - `thrust`: `45f`, `aiRange 2.5`, `lunge 0.3`, `blockPush 0.8`

## Ronin

- `attackStrength = 1.1`
- `defenseStoutness = 1.05`
- `walkSpeedMult = 0.5`
- `sidestepDistance = 1.2`
- `attack_quick clip speed = 1.12`
- `attack_heavy clip speed = 1.15`
- `attack_thrust clip speed = 0.8125`
- attacks:
  - `quick`: `41f`, `aiRange 1.5`, `lunge 0.46`, `blockPush 0.5`
  - `heavy`: `50f`, `aiRange 1.8`, `lunge 1.05`, `blockPush 1.2`
  - `thrust`: `41f`, `aiRange 2.0`, `lunge 0.58`, `blockPush 0.8`

## Knight

- `attackStrength = 1.25`
- `defenseStoutness = 1.1`
- `walkSpeedMult = 0.5`
- `sidestepDistance = 1.05`
- `stepDistance = 0.9`
- `attack_quick clip speed = 1.525`
- `attack_heavy clip speed = 1.725`
- `attack_thrust clip speed = 1.525`
- attacks:
  - `quick`: `48f`, `aiRange 1.55`, `lunge 0.45`, `blockPush 0.6`
  - `heavy`: `55f`, `aiRange 1.9`, `lunge 1.04`, `blockPush 1.35`
  - `thrust`: `50f`, `aiRange 2.0`, `lunge 0.84`, `blockPush 0.9`

## Workflow

- Baseline dump: `npm run combat:baseline`
- Regression suite: `npm run sim:regression`
- Standard stabilization pass: `npm run stability:check`
