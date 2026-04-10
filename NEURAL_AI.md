# Neural AI Plan

## Goal
Train a neural-network policy on the exact deterministic gameplay simulator instead of inventing a separate combat abstraction.

## Implemented now
- `src/ai/neural/NeuralObservation.js`
  - fixed observation encoder over `FighterSim` + `MatchSim`
- `src/ai/neural/NeuralPolicy.js`
  - lightweight feedforward neural net with mutation and crossover
- `src/ai/neural/NeuralPolicyController.js`
  - converts network actions into the same input frames the sim already uses
- `src/ai/neural/NeuralArena.js`
  - headless evaluation against scripted AI and policy-vs-policy self-play
- `scripts/train-neural-policy.mjs`
  - evolutionary trainer with scripted-opponent evaluation and hall-of-fame self-play
- `scripts/evaluate-neural-policy.mjs`
  - deterministic evaluator for a saved model

## Why this route
The repo has no ML stack today. The lowest-risk path is:
1. use the existing deterministic simulator
2. keep the action space identical to gameplay inputs
3. use a neural policy with evolutionary search first

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

## Basic workflow
Train:
```powershell
node scripts/train-neural-policy.mjs --char=ronin --generations=8 --population=16 --repeats=2 --output=.local/neural/ronin-policy.json
```

Evaluate:
```powershell
node scripts/evaluate-neural-policy.mjs --model=.local/neural/ronin-policy.json --char=ronin --repeats=5
```

Train all three classes:
```powershell
npm run ai:train:all -- --generations=8 --population=16 --repeats=2
```

If you want all three to run concurrently:
```powershell
npm run ai:train:all -- --generations=8 --population=16 --repeats=2 --parallel=true
```

## Recommended next step
Run longer training jobs per class and compare the saved policy against the current class-specific scripted hard profiles.
