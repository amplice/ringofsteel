# Combat Mechanics Map

This file exists to answer "what actually drives the mechanic?" from source instead of naming intuition.

## Attack Data

Source:
- [src/combat/AttackData.js](C:/Users/cobra/wuxia-warrior/src/combat/AttackData.js)

Fields and what they actually do:

- `lunge`
  - Runtime gameplay value.
  - Moves the fighter body forward during the attack in:
    - [src/combat/FighterCore.js](C:/Users/cobra/wuxia-warrior/src/combat/FighterCore.js)

- `lungeStart` / `lungeEnd`
  - Runtime gameplay values.
  - Define when the lunge movement is active in:
    - [src/combat/FighterCore.js](C:/Users/cobra/wuxia-warrior/src/combat/FighterCore.js)

- `contactStart` / `contactEnd`
  - Runtime gameplay values.
  - Define the active hit window checked in:
    - [src/combat/HitResolver.js](C:/Users/cobra/wuxia-warrior/src/combat/HitResolver.js)

- `blockPush`
  - Attack identity/tuning data.
  - Not currently a primary direct resolver knob in the final hit path.

- `aiRange`
  - AI-only value.
  - Used by:
    - [src/ai/AIController.js](C:/Users/cobra/wuxia-warrior/src/ai/AIController.js)
  - Does not directly extend final collision/hit range.

## Final Hit Resolution

Primary source:
- [src/combat/HitResolver.js](C:/Users/cobra/wuxia-warrior/src/combat/HitResolver.js)

What determines whether an attack actually connects:

- weapon base/tip world positions from the fighter
- contact window (`contactStart` / `contactEnd`)
- motion gating from:
  - [src/combat/CombatTuning.js](C:/Users/cobra/wuxia-warrior/src/combat/CombatTuning.js)
- `weaponHitRadius`
  - from character defs or default weapon tuning

This means final collision is driven by:
- sampled/model-based weapon path
- lunge/body movement
- contact timing
- hit radius

Not by `aiRange`.

## Block

Sources:
- [src/sim/MatchSim.js](C:/Users/cobra/wuxia-warrior/src/sim/MatchSim.js)
- [src/combat/HitResolver.js](C:/Users/cobra/wuxia-warrior/src/combat/HitResolver.js)

Current rule:
- Active `BLOCK` blocks if there is either:
  - guard contact (weapon-to-weapon), or
  - weapon-to-hurtbox overlap
- `BLOCK_STUN` is vulnerable recovery and does not count as active guarding

## Parry

Sources:
- [src/combat/HitResolver.js](C:/Users/cobra/wuxia-warrior/src/combat/HitResolver.js)
- [src/sim/MatchSim.js](C:/Users/cobra/wuxia-warrior/src/sim/MatchSim.js)
- [src/combat/FighterStateMachine.js](C:/Users/cobra/wuxia-warrior/src/combat/FighterStateMachine.js)

Current rule:
- `PARRY_WINDOW_FRAMES` controls the live parry window
- On success:
  - attacker enters `PARRIED_STUN`
  - defender enters `PARRY_SUCCESS`
- `PARRY_SUCCESS` currently uses the exact same computed duration as the parried attacker stun

Practical balance note:
- the real punish window is determined by the attacker's parried stun duration
- `PARRY_SUCCESS` mostly exists as the winner-side state/animation label

## Clash / Stun / Slide

Sources:
- [src/sim/MatchSim.js](C:/Users/cobra/wuxia-warrior/src/sim/MatchSim.js)
- [src/combat/CombatTuning.js](C:/Users/cobra/wuxia-warrior/src/combat/CombatTuning.js)
- [src/core/Constants.js](C:/Users/cobra/wuxia-warrior/src/core/Constants.js)

Current architecture:
- stun scale and slide scale are separate
- heavy-vs-non-heavy clash can tune:
  - loser stun bonus
  - loser slide bonus
  - heavy winner self-stun bonus

## Rule For Answering Mechanics Questions

If a question is about runtime mechanics, answer from the call path, not the field name.

The minimum check is:
1. where is the value defined
2. where is it read
3. does that read affect AI choice, presentation, or final gameplay resolution
