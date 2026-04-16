import { getAttackTimingRead, getFramesUntilActionable } from './TimingRead.js';

const STORAGE_KEY = 'wuxia-warrior-ai-match-logs';
const STORAGE_VERSION = 1;
const MAX_STORED_MATCHES = 100;
const MAX_STORAGE_BYTES = 4 * 1024 * 1024;
const SAMPLE_INTERVAL_FRAMES = 15;
const RECENT_LOOKBACK_FRAMES = 90;

function estimateBytes(value) {
  return new Blob([value]).size;
}

function safeNowIso() {
  return new Date().toISOString();
}

function cloneInputFrame(input) {
  if (!input) return null;
  return {
    frame: input.frame,
    held: { ...input.held },
    pressed: { ...input.pressed },
  };
}

function summarizePressedActions(input) {
  if (!input?.pressed) return [];
  return Object.entries(input.pressed)
    .filter(([, pressed]) => Boolean(pressed))
    .map(([action]) => action);
}

function heldSignature(input) {
  if (!input?.held) return 'none';
  return Object.entries(input.held)
    .filter(([, held]) => Boolean(held))
    .map(([action]) => action)
    .sort()
    .join('|') || 'none';
}

function buildAiSignature(aiMeta) {
  if (!aiMeta) return 'none';
  const planner = aiMeta.planner ?? null;
  const plannedAttackType = aiMeta.plannedAttack?.attackType ?? aiMeta.plannedAttack?.action ?? '-';
  return [
    aiMeta.profileName ?? '-',
    aiMeta.activeBrainKind ?? '-',
    aiMeta.currentAction ?? '-',
    aiMeta.pendingAction ?? '-',
    aiMeta.lastChosenAction ?? '-',
    aiMeta.intent ?? '-',
    plannedAttackType,
    planner?.decisionSeq ?? '-',
    planner?.lastChosenAction ?? '-',
  ].join('|');
}

function buildForwardDot(attacker, defender) {
  if (!attacker?.group || !attacker?.position || !defender?.position) return 1;
  const dx = defender.position.x - attacker.position.x;
  const dz = defender.position.z - attacker.position.z;
  const distSq = (dx * dx) + (dz * dz);
  if (distSq <= 1e-6) return 1;
  const invDist = 1 / Math.sqrt(distSq);
  const nx = dx * invDist;
  const nz = dz * invDist;
  const angle = attacker.group.rotation.y;
  const forwardX = Math.sin(angle);
  const forwardZ = Math.cos(angle);
  return (forwardX * nx) + (forwardZ * nz);
}

function roundNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function buildTimingSnapshot(fighter) {
  if (!fighter) return null;
  const attack = getAttackTimingRead(fighter);
  return {
    state: fighter.state ?? null,
    stateFrames: fighter.stateFrames ?? 0,
    stateDuration: fighter?.fsm?.stateDuration ?? 0,
    actionable: Boolean(fighter?.fsm?.isActionable),
    framesUntilActionable: getFramesUntilActionable(fighter),
    attackType: fighter.currentAttackType ?? null,
    attackPhase: attack.phase,
    attackProgress: roundNumber(attack.progress, 3),
    framesUntilContact: Number.isFinite(attack.framesUntilContact) ? attack.framesUntilContact : null,
    activeFramesRemaining: attack.activeFramesRemaining ?? 0,
    recoveryFramesRemaining: attack.recoveryFramesRemaining ?? 0,
    contactImminent: Boolean(attack.contactImminent),
    lateRecovery: Boolean(attack.lateRecovery),
  };
}

function buildPerceptionSnapshot(player, ai) {
  if (!player || !ai) return null;
  return {
    distance: roundNumber(player.distanceTo?.(ai) ?? null, 3),
    playerForwardDot: roundNumber(buildForwardDot(player, ai), 3),
    aiForwardDot: roundNumber(buildForwardDot(ai, player), 3),
    playerEdgeDistance: roundNumber(Math.hypot(player.position?.x ?? 0, player.position?.z ?? 0), 3),
    aiEdgeDistance: roundNumber(Math.hypot(ai.position?.x ?? 0, ai.position?.z ?? 0), 3),
    playerTiming: buildTimingSnapshot(player),
    aiTiming: buildTimingSnapshot(ai),
  };
}

function buildCollisionSnapshot(fighter) {
  const collision = fighter?._debugCollision;
  if (!collision) return null;
  return {
    distance: roundNumber(collision.distance, 4),
    defenderHurtRadius: roundNumber(collision.defenderHurtRadius ?? collision.hurtRadius, 3),
    defenderHurtHeight: roundNumber(collision.defenderHurtHeight ?? collision.hurtHeight, 3),
    segmentHit: Boolean(collision.segmentHit),
    weaponHitRadius: roundNumber(collision.weaponHitRadius, 3),
    weaponHitMode: collision.weaponHitMode ?? null,
    weaponClashRadius: roundNumber(collision.weaponClashRadius, 3),
    weaponClashDistance: roundNumber(collision.weaponClashDistance, 4),
    weaponClashOverlap: Boolean(collision.weaponClashOverlap),
    contactT: roundNumber(collision.contactT, 3),
    attackProgress: roundNumber(collision.attackProgress, 3),
    contactWindowStart: roundNumber(collision.contactWindowStart, 3),
    contactWindowEnd: roundNumber(collision.contactWindowEnd, 3),
    contactWindowPassed: Boolean(collision.contactWindowPassed),
    lastCheckResult: collision.lastCheckResult ?? null,
    defenderState: collision.defenderState ?? null,
  };
}

function buildFighterSnapshot(fighter, opponent = null) {
  if (!fighter) return null;
  const debug = fighter.getDebugSnapshot?.(opponent) ?? null;
  return {
    playerIndex: fighter.playerIndex ?? null,
    charId: fighter.charDef?.id ?? null,
    charName: fighter.charDef?.displayName ?? null,
    state: fighter.state ?? null,
    stateFrames: fighter.stateFrames ?? 0,
    stateDuration: fighter?.fsm?.stateDuration ?? 0,
    attackType: fighter.currentAttackType ?? null,
    actionable: Boolean(fighter?.fsm?.isActionable),
    attacking: Boolean(fighter?.fsm?.isAttacking),
    facingRight: Boolean(fighter?.facingRight),
    position: debug?.position ?? null,
    rotationY: roundNumber(debug?.rotationY, 3),
    weaponBase: debug?.weaponBase ?? null,
    weaponTip: debug?.weaponTip ?? null,
    hurtCenter: debug?.hurtCenter ?? null,
    bodyCollision: debug?.bodyCollision ?? null,
    weaponHitRadius: roundNumber(debug?.weaponHitRadius, 3),
    weaponClashRadius: roundNumber(debug?.weaponClashRadius, 3),
    weaponHitMode: debug?.weaponHitMode ?? null,
    hurtRadius: roundNumber(debug?.hurtRadius, 3),
    hurtHeight: roundNumber(debug?.hurtHeight, 3),
    bodyRadius: roundNumber(debug?.bodyRadius, 3),
    tipRelativeToward: roundNumber(debug?.tipRelativeToward, 4),
    tipRelativeSpeed: roundNumber(debug?.tipRelativeSpeed, 4),
    collision: buildCollisionSnapshot(fighter),
    timing: buildTimingSnapshot(fighter),
  };
}

function sanitizeEvent(event) {
  if (!event) return null;
  switch (event.type) {
    case 'combat_result':
      return {
        type: event.type,
        result: event.result,
        attackerIndex: event.attackerIndex,
        defenderIndex: event.defenderIndex,
        attackerType: event.attackerType ?? null,
        defenderType: event.defenderType ?? null,
        hitstopFrames: event.hitstopFrames ?? 0,
        kill: Boolean(event.kill),
        contactPoint: event.contactPoint ? {
          x: roundNumber(event.contactPoint.x, 3),
          y: roundNumber(event.contactPoint.y, 3),
          z: roundNumber(event.contactPoint.z, 3),
        } : null,
      };
    case 'ring_out':
      return {
        type: event.type,
        winnerIndex: event.winnerIndex,
        loserIndex: event.loserIndex,
      };
    default:
      return { type: event.type };
  }
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function triggerDownload(filename, payload) {
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function postMatchToRepo(match) {
  try {
    if (typeof window !== 'undefined') {
      window.__wuxiaAiLogStatus = {
        ok: null,
        phase: 'posting',
        at: safeNowIso(),
        error: null,
        response: null,
      };
    }
    const response = await fetch('/__ai_match_logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(match),
    });
    if (!response.ok) {
      const result = { ok: false, error: `HTTP ${response.status}` };
      if (typeof window !== 'undefined') {
        window.__wuxiaAiLogStatus = {
          ok: false,
          phase: 'failed',
          at: safeNowIso(),
          error: result.error,
          response: result,
        };
      }
      console.warn('[HumanAIMatchRecorder] Failed to store match log:', result.error);
      return result;
    }
    const result = await response.json();
    if (typeof window !== 'undefined') {
      window.__wuxiaAiLogStatus = {
        ok: Boolean(result?.ok),
        phase: result?.ok ? 'stored' : 'failed',
        at: safeNowIso(),
        error: result?.error ?? null,
        response: result,
      };
    }
    console.info('[HumanAIMatchRecorder] Stored match log:', result);
    return result;
  } catch (error) {
    const result = { ok: false, error: error?.message || 'Network error' };
    if (typeof window !== 'undefined') {
      window.__wuxiaAiLogStatus = {
        ok: false,
        phase: 'failed',
        at: safeNowIso(),
        error: result.error,
        response: result,
      };
    }
    console.warn('[HumanAIMatchRecorder] Match log POST failed:', result.error);
    return result;
  }
}

export class HumanAIMatchRecorder {
  constructor() {
    this.currentMatch = null;
    this.currentRound = null;
    this.lastInputSignature = 'none';
    this.lastAiSignature = 'none';
    this.lastPlayerState = null;
    this.lastAiState = null;
    this.lastSampleFrame = -9999;
  }

  startMatch({
    mode = 'local',
    fighter1Char = null,
    fighter2Char = null,
    playerChar = null,
    aiChar = null,
    difficulty = null,
    aiMeta = null,
  } = {}) {
    const resolvedFighter1Char = fighter1Char ?? playerChar;
    const resolvedFighter2Char = fighter2Char ?? aiChar;
    this.currentMatch = {
      schemaVersion: STORAGE_VERSION,
      id: `ai-match-${Date.now()}`,
      recordedAt: safeNowIso(),
      mode,
      fighter1Char: resolvedFighter1Char,
      fighter2Char: resolvedFighter2Char,
      playerChar: playerChar ?? resolvedFighter1Char,
      aiChar: aiChar ?? resolvedFighter2Char,
      difficulty,
      aiMetaAtStart: aiMeta ? {
        controllerKind: aiMeta.controllerKind ?? null,
        profileName: aiMeta.profileName ?? null,
        baseProfileName: aiMeta.baseProfileName ?? null,
      } : null,
      rounds: [],
      summary: null,
    };
    this.currentRound = null;
    this.lastInputSignature = 'none';
    this.lastAiSignature = 'none';
    this.lastPlayerState = null;
    this.lastAiState = null;
    this.lastSampleFrame = -9999;
  }

  startRound({ roundNumber, fighter1, fighter2, aiMeta = null, frameCount = 0 } = {}) {
    if (!this.currentMatch) return;
    this.currentRound = {
      roundNumber,
      startedAtFrame: frameCount,
      events: [],
      summary: null,
    };
    this.currentMatch.rounds.push(this.currentRound);
    this.lastInputSignature = 'none';
    this.lastAiSignature = 'none';
    this.lastPlayerState = fighter1?.state ?? null;
    this.lastAiState = fighter2?.state ?? null;
    this.lastSampleFrame = -9999;
    this._pushRoundEvent({
      frame: frameCount,
      kind: 'round_start',
      playerState: fighter1?.state ?? null,
      aiState: fighter2?.state ?? null,
      aiMode: aiMeta?.profileName ?? null,
      aiBrain: aiMeta?.activeBrainKind ?? null,
      perception: buildPerceptionSnapshot(fighter1, fighter2),
      fighter1Snapshot: buildFighterSnapshot(fighter1, fighter2),
      fighter2Snapshot: buildFighterSnapshot(fighter2, fighter1),
    });
  }

  recordStep({
    frameCount,
    input1 = null,
    input2 = null,
    fighter1,
    fighter2,
    aiMeta = null,
    events = [],
  } = {}) {
    if (!this.currentRound || !fighter1 || !fighter2) return;

    const pressed = summarizePressedActions(input1);
    const inputSig = heldSignature(input1);
    if (pressed.length || inputSig !== this.lastInputSignature) {
      this._pushRoundEvent({
        frame: frameCount,
        kind: 'fighter1_input',
        held: inputSig,
        pressed,
      });
      this.lastInputSignature = inputSig;
    }

    const fighter2Pressed = summarizePressedActions(input2);
    const fighter2Sig = heldSignature(input2);
    if (fighter2Pressed.length || fighter2Sig !== this.lastAiSignature) {
      this._pushRoundEvent({
        frame: frameCount,
        kind: 'fighter2_input',
        held: fighter2Sig,
        pressed: fighter2Pressed,
      });
      if (!aiMeta) this.lastAiSignature = fighter2Sig;
    }

    const aiSignature = buildAiSignature(aiMeta);
    if (aiSignature !== this.lastAiSignature) {
      this._pushRoundEvent({
        frame: frameCount,
        kind: 'ai_decision',
        profileName: aiMeta?.profileName ?? null,
        activeBrainKind: aiMeta?.activeBrainKind ?? null,
        currentAction: aiMeta?.currentAction ?? null,
        pendingAction: aiMeta?.pendingAction ?? null,
        lastChosenAction: aiMeta?.lastChosenAction ?? null,
        intent: aiMeta?.intent ?? null,
        planner: aiMeta?.planner ?? null,
        memory: aiMeta?.memory ?? null,
        perception: buildPerceptionSnapshot(fighter1, fighter2),
        fighter1Snapshot: buildFighterSnapshot(fighter1, fighter2),
        fighter2Snapshot: buildFighterSnapshot(fighter2, fighter1),
      });
      this.lastAiSignature = aiSignature;
    }

    if (fighter1.state !== this.lastPlayerState || fighter2.state !== this.lastAiState) {
      this._pushRoundEvent({
        frame: frameCount,
        kind: 'state_change',
        playerState: fighter1.state,
        aiState: fighter2.state,
      });
      this.lastPlayerState = fighter1.state;
      this.lastAiState = fighter2.state;
    }

    if ((frameCount - this.lastSampleFrame) >= SAMPLE_INTERVAL_FRAMES) {
      const perception = buildPerceptionSnapshot(fighter1, fighter2);
      this._pushRoundEvent({
        frame: frameCount,
        kind: 'sample',
        distance: perception?.distance ?? null,
        playerForwardDot: perception?.playerForwardDot ?? null,
        aiForwardDot: perception?.aiForwardDot ?? null,
        playerEdgeDistance: perception?.playerEdgeDistance ?? null,
        aiEdgeDistance: perception?.aiEdgeDistance ?? null,
        playerState: fighter1.state,
        aiState: fighter2.state,
        aiMode: aiMeta?.profileName ?? null,
        aiBrain: aiMeta?.activeBrainKind ?? null,
        aiDecision: aiMeta ? {
          currentAction: aiMeta.currentAction ?? null,
          pendingAction: aiMeta.pendingAction ?? null,
          lastChosenAction: aiMeta.lastChosenAction ?? null,
          intent: aiMeta.intent ?? null,
          plannedAttack: aiMeta.plannedAttack ?? null,
          planner: aiMeta.planner ?? null,
        } : null,
        perception,
        fighter1Snapshot: buildFighterSnapshot(fighter1, fighter2),
        fighter2Snapshot: buildFighterSnapshot(fighter2, fighter1),
      });
      this.lastSampleFrame = frameCount;
    }

    for (const event of events) {
      const clean = sanitizeEvent(event);
      if (!clean) continue;
      this._pushRoundEvent({
        frame: frameCount,
        kind: 'sim_event',
        event: clean,
        fighter1Snapshot: buildFighterSnapshot(fighter1, fighter2),
        fighter2Snapshot: buildFighterSnapshot(fighter2, fighter1),
        perception: buildPerceptionSnapshot(fighter1, fighter2),
      });
    }
  }

  completeRound({ frameCount, winner, killReason, p1Score, p2Score } = {}) {
    if (!this.currentRound) return;
    const exploitTags = this._classifyRoundExploits(this.currentRound);
    this.currentRound.summary = {
      finishedAtFrame: frameCount,
      winner,
      killReason,
      p1Score,
      p2Score,
      exploitTags,
    };
    this._pushRoundEvent({
      frame: frameCount,
      kind: 'round_end',
      winner,
      killReason,
      p1Score,
      p2Score,
      exploitTags,
    });
    return this.currentRound.summary;
  }

  finishMatch({ winnerName, p1Score, p2Score } = {}) {
    if (!this.currentMatch) return null;
    const match = this.currentMatch;
    match.summary = {
      winnerName,
      p1Score,
      p2Score,
      totalRounds: match.rounds.length,
      exploitSummary: this._summarizeExploitTags(match.rounds),
    };
    HumanAIMatchRecorder.store(match);
    postMatchToRepo(match).then((result) => {
      if (result?.ok && typeof window !== 'undefined') {
        window.__wuxiaAiLastStoredMatch = result;
      }
    });
    this.currentMatch = null;
    this.currentRound = null;
    return match;
  }

  discard() {
    this.currentMatch = null;
    this.currentRound = null;
  }

  _pushRoundEvent(event) {
    if (!this.currentRound) return;
    this.currentRound.events.push(event);
  }

  _classifyRoundExploits(round) {
    const tags = new Set();
    const endEvent = round.events.findLast?.((entry) => entry.kind === 'round_end')
      ?? [...round.events].reverse().find((entry) => entry.kind === 'round_end');
    if (!endEvent || endEvent.winner !== 1) {
      return [];
    }

    const killFrame = endEvent.frame;
    const windowStart = killFrame - RECENT_LOOKBACK_FRAMES;
    const recentEvents = round.events.filter((entry) => entry.frame >= windowStart && entry.frame <= killFrame);
    const playerSidesteps = recentEvents.filter((entry) =>
      entry.kind === 'fighter1_input' &&
      (entry.pressed?.includes('sidestepUp') || entry.pressed?.includes('sidestepDown'))
    ).length;
    const recentSamples = recentEvents.filter((entry) => entry.kind === 'sample');
    const recentStateChanges = recentEvents.filter((entry) => entry.kind === 'state_change');
    const recentCombat = recentEvents.filter((entry) => entry.kind === 'sim_event' && entry.event?.type === 'combat_result');
    const aiWasFlanked = recentSamples.some((entry) => typeof entry.aiForwardDot === 'number' && entry.aiForwardDot < 0.35);
    const aiWasOffAngle = recentSamples.some((entry) => typeof entry.aiForwardDot === 'number' && entry.aiForwardDot < 0.82);
    const aiNearEdge = recentSamples.some((entry) => typeof entry.aiEdgeDistance === 'number' && entry.aiEdgeDistance > 5.8);
    const playerHeldBlock = recentEvents.filter((entry) => entry.kind === 'fighter1_input' && entry.held?.includes('block')).length;
    const ringOut = recentEvents.some((entry) => entry.kind === 'sim_event' && entry.event?.type === 'ring_out');
    const aiCommittedAttack = recentStateChanges.some((entry) => entry.aiState === 'attack_active');
    const playerKillAttack = recentCombat.findLast?.((entry) => entry.event?.kill && entry.event?.attackerIndex === 0)
      ?? [...recentCombat].reverse().find((entry) => entry.event?.kill && entry.event?.attackerIndex === 0);

    if (playerSidesteps >= 2 && aiWasFlanked) tags.add('sidestep_flank_kill');
    if (playerSidesteps >= 1 && aiCommittedAttack && aiWasOffAngle && playerKillAttack) {
      tags.add('sidestep_punish_kill');
    }
    if (aiNearEdge) tags.add('edge_pressure_kill');
    if (playerHeldBlock >= 3) tags.add('turtle_or_counter_kill');
    if (ringOut) tags.add('ring_out');

    return [...tags];
  }

  _summarizeExploitTags(rounds) {
    const counts = {};
    for (const round of rounds) {
      for (const tag of round.summary?.exploitTags ?? []) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return counts;
  }

  static loadAll() {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = safeJsonParse(raw, []);
    return Array.isArray(parsed) ? parsed : [];
  }

  static store(match) {
    const existing = HumanAIMatchRecorder.loadAll();
    existing.unshift(match);
    const trimmed = [];
    let totalBytes = 0;

    for (const entry of existing.slice(0, MAX_STORED_MATCHES)) {
      const serialized = JSON.stringify(entry);
      const entryBytes = estimateBytes(serialized);
      if (trimmed.length > 0 && (totalBytes + entryBytes) > MAX_STORAGE_BYTES) break;
      trimmed.push(entry);
      totalBytes += entryBytes;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  }

  static clearAll() {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  static exportAll() {
    const payload = JSON.stringify(HumanAIMatchRecorder.loadAll(), null, 2);
    triggerDownload(`wuxia-ai-match-logs-${Date.now()}.json`, payload);
  }

  static exportLatest() {
    const latest = HumanAIMatchRecorder.loadAll()[0] ?? null;
    if (!latest) return null;
    triggerDownload(`${latest.id}.json`, JSON.stringify(latest, null, 2));
    return latest;
  }

  static installWindowApi() {
    if (typeof window === 'undefined') return;
    window.__wuxiaAiLogStatus = window.__wuxiaAiLogStatus ?? {
      ok: null,
      phase: 'idle',
      at: null,
      error: null,
      response: null,
    };
    window.__wuxiaAiLogs = {
      list: () => HumanAIMatchRecorder.loadAll().map((match) => ({
        id: match.id,
        recordedAt: match.recordedAt,
        mode: match.mode,
        fighter1Char: match.fighter1Char ?? match.playerChar,
        fighter2Char: match.fighter2Char ?? match.aiChar,
        playerChar: match.playerChar,
        aiChar: match.aiChar,
        difficulty: match.difficulty,
        summary: match.summary,
      })),
      latest: () => HumanAIMatchRecorder.loadAll()[0] ?? null,
      status: () => window.__wuxiaAiLogStatus,
      exportLatest: () => HumanAIMatchRecorder.exportLatest(),
      exportAll: () => HumanAIMatchRecorder.exportAll(),
      clear: () => HumanAIMatchRecorder.clearAll(),
    };
  }
}
