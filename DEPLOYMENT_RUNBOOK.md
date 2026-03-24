# Deployment Runbook

This repo has two separate live services:

1. Frontend game client on Vercel
2. Multiplayer websocket server on Railway

Do not assume a single deploy updates both.

## Source Of Truth

Local deploy secrets and account-specific IDs belong in:

- `.local/DEPLOY_ACCESS.md`

That file is ignored by Git and must not be committed.

If it is missing, create it from:

- [DEPLOY_ACCESS_TEMPLATE.md](C:\Users\cobra\wuxia-warrior\DEPLOY_ACCESS_TEMPLATE.md)

## Current Live Services

- Frontend: `https://ringofsteel.alphaleak.xyz/`
- Multiplayer websocket: `wss://ringofsteel-production.up.railway.app/ws`
- Multiplayer health: `https://ringofsteel-production.up.railway.app/health`
- Multiplayer metrics: `https://ringofsteel-production.up.railway.app/metrics`

## What To Deploy

### Frontend-only changes

Deploy Vercel only.

Examples:
- UI text/layout
- frontend presentation
- local/offline-only browser behavior
- ping HUD

### Backend-only changes

Deploy Railway only.

Examples:
- lobby cleanup
- websocket lifecycle
- metrics/logging
- server room management

### Shared gameplay changes

Deploy both Vercel and Railway.

Examples:
- `src/combat/AttackData.js`
- `src/core/Constants.js`
- `src/entities/CharacterDefs.js`
- `src/sim/MatchSim.js`
- anything that changes authoritative combat behavior

If only one side is deployed after a shared gameplay change, online parity is broken.

## Vercel Frontend Deploy

### Requirements

Read `.local/DEPLOY_ACCESS.md` for:
- Vercel token
- required scope

The known non-interactive pattern is:

```powershell
npx vercel --prod --yes --scope <SCOPE> --token <TOKEN>
```

Run that from the repo root.

Important:
- this deploys the current local filesystem state
- it does not require a Git commit first
- use it carefully, because production can drift from Git

### Verify Frontend

Check:

```powershell
curl https://ringofsteel.alphaleak.xyz/
```

Also verify in browser:
- page loads
- online screen defaults to the intended websocket URL

## Railway Multiplayer Deploy

### Requirements

Read `.local/DEPLOY_ACCESS.md` for:
- Railway project ID
- service ID
- environment ID
- project-scoped token

Important:
- the Railway token in use is project-scoped
- it does not work for account-wide CLI queries like `railway whoami`
- the reliable path is project-scoped GraphQL against `https://backboard.railway.app/graphql/v2`

### Service Shape

The multiplayer service runs:

```powershell
node server/multiplayer-server.mjs
```

Expected endpoints:
- `/`
- `/health`
- `/metrics`
- `/ws`

### Railway Deploy Rule

If Railway is configured to auto-deploy from GitHub:
- commit the backend change
- push the correct branch
- ensure the Railway service is tracking that branch

If Railway settings need to be changed:
- use the project-scoped GraphQL path documented in `.local/DEPLOY_ACCESS.md`

### Verify Backend

Check:

```powershell
curl https://ringofsteel-production.up.railway.app/health
curl https://ringofsteel-production.up.railway.app/metrics
```

Websocket target should remain:

```text
wss://ringofsteel-production.up.railway.app/ws
```

## Safe Deployment Sequence

### For shared gameplay changes

1. Run local validation:

```powershell
npm run build
npm run multiplayer:check
```

2. Deploy Railway if authoritative gameplay changed
3. Deploy Vercel
4. Verify:
   - frontend loads
   - websocket health is good
   - one live online match starts and controls work

### For frontend-only changes

1. `npm run build`
2. Deploy Vercel
3. Refresh live site and verify

### For backend-only changes

1. restart/test locally if needed
2. deploy Railway
3. verify `/health`, `/metrics`, and one online match

## Common Failure Modes

### Vercel updated, Railway not updated

Symptom:
- offline feels different from online
- local browser and online server disagree on combat behavior

Cause:
- shared gameplay file was only deployed to frontend

Fix:
- deploy Railway too

### Railway updated, Vercel not updated

Symptom:
- online feels wrong or desynced
- UI may still point at old behavior/config

Fix:
- deploy Vercel too if shared gameplay or client protocol changed

### Vercel CLI fails with `missing_scope`

Cause:
- missing explicit scope

Fix:
- pass `--scope <SCOPE>` from `.local/DEPLOY_ACCESS.md`

### Railway CLI auth confusion

Cause:
- project-scoped token is not account-scoped

Fix:
- use the documented GraphQL path in `.local/DEPLOY_ACCESS.md`
- do not rely on `railway whoami`

## Rule For Future LLMs

Before any live deploy:

1. classify the change as `frontend-only`, `backend-only`, or `shared gameplay`
2. deploy the correct service(s)
3. say explicitly in the user-facing response whether live is:
   - local only
   - Vercel only
   - Railway only
   - both

Do not say a gameplay change is "live" unless both sides were updated when parity matters.
