# Character Pipeline

This repo treats a character as a single authored package:
- model
- weapon markers
- animation clips
- gameplay tuning

Do not add a new character by tweaking shared weapon-class data and hoping it only affects one fighter.

## Required asset contract

Every character must provide:
- a GLB at `glbPath`
- weapon markers in the rig:
  - `weaponBase`
  - `weaponTip`
- all required clips:
  - `idle`
  - `walk_forward`
  - `walk_backward`
  - `strafe_left`
  - `strafe_right`
  - `backstep`
  - `block_parry`
  - `block_knockback`
  - `clash_knockback`
  - `attack_quick`
  - `attack_heavy`
  - `attack_thrust`

## Code structure

Each character gets its own file in `src/characters/`.

That file owns:
- display metadata
- model offsets/scales
- clip speed tuning
- attack data
- weapon stats
- weapon collision tuning
- sim fallback data

Shared systems may still use coarse `weapon.type` for broad behavior like:
- `tip` vs `capsule` hit mode

But attack timings and character tuning belong to the character file, not a shared weapon bucket.

## Add-a-character process

1. Create/export the GLB.
2. Ensure the rig contains valid `weaponBase` and `weaponTip` markers.
3. Add a new file in `src/characters/<id>.js` using the existing characters as reference.
   - start from `src/characters/_template.js`
4. Register the character in `src/characters/index.js`.
5. Put the GLB in `public/`.
6. Regenerate authoritative tracks:
   - `npm run generate:authoritative-tracks`
7. Validate:
   - `npm run build`
   - `npm run multiplayer:check`

## Rules

- Changing one character must not require editing another character's tuning.
- Shared helpers may validate or normalize data, but must not hide character-specific tuning.
- Shared weapon types may exist for broad geometry behavior only.
- Attack windows, lunges, motion thresholds, hit radius, clash radius, and sim fallback data belong in the character file.
- If a new character needs a genuinely different collision model, add a new explicit weapon type instead of overloading an existing one.
