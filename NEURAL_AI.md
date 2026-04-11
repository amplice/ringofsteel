# Neural AI Plan

## Goal
Train a neural-network policy on the exact deterministic gameplay simulator instead of inventing a separate combat abstraction.

## Implemented now
- `src/ai/neural/NeuralObservation.js`
  - fixed observation encoder over `FighterSim` + `MatchSim`
- `src/ai/neural/NeuralPolicy.js`
  - lightweight feedforward neural net with mutation, crossover, and legal-action masking
- `src/ai/neural/NeuralPolicyController.js`
  - converts network actions into the same input frames the sim already uses
  - only decides at actionable decision points
  - holds macro-actions instead of re-deciding mid-commit
- `src/ai/neural/NeuralArena.js`
  - headless evaluation against scripted AI and policy-vs-policy self-play
  - temporal observation support and reward shaping
- `scripts/train-neural-policy.mjs`
  - evolutionary trainer with self-play-first curriculum, then scripted-opponent ramp-in
- `scripts/evaluate-neural-policy.mjs`
  - deterministic evaluator for a saved model

## Why this route
The repo has no ML stack today. The lowest-risk path is:
1. use the existing deterministic simulator
2. keep the action space close to gameplay inputs, but only expose legal macro-decisions
3. use self-play to learn baseline competence before mixing in scripted AIs
4. use a neural policy with evolutionary search first

That gives a trainable system now. If it proves useful, the next upgrade is a gradient-based trainer in Python or ONNX export.

## Action space
The policy currently chooses one of:
- `idle`
- `forward`
- `back`
- `sidestepUp`
- `sidestepDown`
- `backstep`
- `block`
- `quick`
- `heavy`
- `thrust`

## Observation space
The encoder includes:
- relative position and distance
- both fighters' front-dot alignment
- arena position
- state, attack type, state progress
- actionable/attacking/hit-applied flags
- sidestep direction and phase
- temporal deltas and recent-event timers

## Decision model
- the policy only chooses when the fighter is actionable
- illegal moves are masked out
- sustained actions (`idle`, walk, block) are held
- committed actions (attacks, sidesteps, backstep) fire once and then the controller waits for the next legal decision point

## Basic workflow
Default curriculum:
- 2 strong `spearman` profiles
- 2 strong `ronin` profiles
- 2 strong `knight` profiles
- includes mirror matchups for the class being trained
- starts with same-class hall-of-fame self-play only
- ramps scripted opponents in after the self-play warmup

Train:
```powershell
node scripts/train-neural-policy.mjs --char=ronin --generations=12 --population=20 --repeats=2 --selfPlayWarmup=4 --scriptedRamp=3 --output=.local/neural/ronin-policy.json
```

Evaluate:
```powershell
node scripts/evaluate-neural-policy.mjs --model=.local/neural/ronin-policy.json --char=ronin --repeats=5
```

Train all three classes:
```powershell
node scripts/train-neural-batch.mjs --generations=12 --population=20 --repeats=2 --selfPlayWarmup=4 --scriptedRamp=3
```

If you want all three to run concurrently:
```powershell
npm run ai:train:all -- --generations=8 --population=16 --repeats=2 --parallel=true
```

## Recommended next step
Use the current self-play-first trainer to get a baseline policy per class, then inspect action distributions and only after that decide whether a stronger optimizer or imitation pretraining is necessary.
