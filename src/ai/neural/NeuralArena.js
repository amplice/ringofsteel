import { AIController } from '../AIController.js';
import { CHARACTER_DEFS } from '../../entities/CharacterDefs.js';
import { FighterSim } from '../../sim/FighterSim.js';
import { MatchSim } from '../../sim/MatchSim.js';
import {
  FRAME_DURATION,
  FIGHT_START_DISTANCE,
  ROUNDS_TO_WIN,
  FighterState,
  AttackType,
  ARENA_RADIUS,
  HitResult,
} from '../../core/Constants.js';
import { NeuralPolicyController } from './NeuralPolicyController.js';

const ROUND_WIN_REWARD = 30;
const MATCH_WIN_REWARD = 100;
const ROUND_DRAW_PENALTY = 8;
const MATCH_DRAW_PENALTY = 24;
const PARRY_SUCCESS_REWARD = 2;
const GOT_PARRIED_PENALTY = 1;
const HEAVY_CLASH_WIN_REWARD = 2;
const HEAVY_CLASH_LOSS_PENALTY = 1;
const EVADE_NEAR_ATTACK_REWARD = 1;
const SPACING_EVADE_REWARD = 0.75;
const EDGE_PRESSURE_PER_FRAME = 0.005;
const EDGE_DANGER_PER_FRAME = 0.005;
const LOSS_SURVIVAL_MAX_REWARD = 0.1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampStartDistance(value) {
  return clamp(value, 1.4, FIGHT_START_DISTANCE + 1.5);
}

function isStronglyNegativeState(state) {
  return state === FighterState.HIT_STUN ||
    state === FighterState.PARRIED_STUN ||
    state === FighterState.DYING ||
    state === FighterState.DEAD;
}

export class NeuralArena {
  constructor() {
    this.characterDefs = CHARACTER_DEFS;
  }

  createFighter(playerIndex, charId) {
    const charDef = this.characterDefs[charId];
    if (!charDef) throw new Error(`Unknown character '${charId}'`);
    const fighter = new FighterSim(playerIndex, charId, charDef);
    fighter.neuralTemporal = this._createTemporalState();
    return fighter;
  }

  runMatch({
    policy,
    policyChar = 'ronin',
    opponentProfile = 'medium',
    opponentChar = 'spearman',
    policySide = 1,
    roundsToWin = ROUNDS_TO_WIN,
    maxRoundFrames = 60 * 25,
    maxMatchRounds = 9,
    temperature = 0.7,
    stochastic = true,
    roundSetup = null,
  }) {
    const policyOnP1 = policySide !== 2;
    const fighter1 = this.createFighter(0, policyOnP1 ? policyChar : opponentChar);
    const fighter2 = this.createFighter(1, policyOnP1 ? opponentChar : policyChar);
    const sim = new MatchSim({ fighter1, fighter2 });
    const policyController = new NeuralPolicyController(policy, { temperature, stochastic });
    const scriptedController = new AIController(opponentProfile);
    const perspectiveIndex = policyOnP1 ? 1 : 2;
    policyController.resetMatchStats();

    const match = {
      p1Score: 0,
      p2Score: 0,
      winner: null,
      policyWinner: null,
      rounds: [],
      reward: 0,
      policySide: perspectiveIndex,
    };

    for (let roundIndex = 0; roundIndex < maxMatchRounds; roundIndex++) {
      if (match.p1Score >= roundsToWin || match.p2Score >= roundsToWin) break;
      const resolvedRoundSetup = typeof roundSetup === 'function' ? roundSetup(roundIndex) : roundSetup;
      const round = this.runRound({
        sim,
        policyController,
        scriptedController,
        maxRoundFrames,
        policyOnP1,
        perspectiveIndex,
        roundSetup: resolvedRoundSetup,
      });
      if (resolvedRoundSetup) {
        round.startDistance = resolvedRoundSetup.startDistance;
        round.lateralOffset = resolvedRoundSetup.lateralOffset;
      }
      match.rounds.push(round);
      match.reward += round.reward;
      if (round.winner === 1) match.p1Score++;
      if (round.winner === 2) match.p2Score++;
    }

    match.winner = match.p1Score === match.p2Score
      ? null
      : (match.p1Score > match.p2Score ? 1 : 2);
    match.policyWinner = match.winner == null
      ? null
      : (match.winner === perspectiveIndex ? 1 : 2);

    if (match.policyWinner === 1) match.reward += MATCH_WIN_REWARD;
    else if (match.policyWinner === 2) match.reward -= MATCH_WIN_REWARD;
    else match.reward -= MATCH_DRAW_PENALTY;

    match.policyStats = policyController.getMatchStats();

    return match;
  }

  runSelfPlay({
    policyA,
    charA = 'ronin',
    policyB,
    charB = 'spearman',
    perspectiveSide = 1,
    roundsToWin = ROUNDS_TO_WIN,
    maxRoundFrames = 60 * 25,
    maxMatchRounds = 9,
    temperature = 0.7,
    stochastic = true,
    roundSetup = null,
  }) {
    const fighter1 = this.createFighter(0, charA);
    const fighter2 = this.createFighter(1, charB);
    const sim = new MatchSim({ fighter1, fighter2 });
    const controllerA = new NeuralPolicyController(policyA, { temperature, stochastic });
    const controllerB = new NeuralPolicyController(policyB, { temperature, stochastic });
    const perspectiveIndex = perspectiveSide === 2 ? 2 : 1;
    controllerA.resetMatchStats();
    controllerB.resetMatchStats();

    const match = { p1Score: 0, p2Score: 0, winner: null, policyWinner: null, rounds: [], reward: 0, policySide: perspectiveIndex };
    for (let roundIndex = 0; roundIndex < maxMatchRounds; roundIndex++) {
      if (match.p1Score >= roundsToWin || match.p2Score >= roundsToWin) break;
      const resolvedRoundSetup = typeof roundSetup === 'function' ? roundSetup(roundIndex) : roundSetup;
      const round = this.runSelfPlayRound({
        sim,
        controllerA,
        controllerB,
        maxRoundFrames,
        perspectiveIndex,
        roundSetup: resolvedRoundSetup,
      });
      if (resolvedRoundSetup) {
        round.startDistance = resolvedRoundSetup.startDistance;
        round.lateralOffset = resolvedRoundSetup.lateralOffset;
      }
      match.rounds.push(round);
      match.reward += round.reward;
      if (round.winner === 1) match.p1Score++;
      if (round.winner === 2) match.p2Score++;
    }

    match.winner = match.p1Score === match.p2Score ? null : (match.p1Score > match.p2Score ? 1 : 2);
    match.policyWinner = match.winner == null ? null : (match.winner === perspectiveIndex ? 1 : 2);
    if (match.policyWinner === 1) match.reward += MATCH_WIN_REWARD;
    else if (match.policyWinner === 2) match.reward -= MATCH_WIN_REWARD;
    else match.reward -= MATCH_DRAW_PENALTY;
    match.policyStats = perspectiveIndex === 1 ? controllerA.getMatchStats() : controllerB.getMatchStats();
    return match;
  }

  runRound({ sim, policyController, scriptedController, maxRoundFrames, policyOnP1 = true, perspectiveIndex = 1, roundSetup = null }) {
    this._startRound(sim, roundSetup);
    policyController.reset();
    scriptedController.reset();

    return this._playRound({
      sim,
      maxRoundFrames,
      perspectiveIndex,
      controller1: policyOnP1
        ? ((fighter, opponent, innerSim, dt) => policyController.step(fighter, opponent, innerSim, dt))
        : ((fighter, opponent, innerSim, dt) => scriptedController.update(fighter, opponent, innerSim.frameCount, dt)),
      controller2: policyOnP1
        ? ((fighter, opponent, innerSim, dt) => scriptedController.update(fighter, opponent, innerSim.frameCount, dt))
        : ((fighter, opponent, innerSim, dt) => policyController.step(fighter, opponent, innerSim, dt)),
    });
  }

  runSelfPlayRound({ sim, controllerA, controllerB, maxRoundFrames, perspectiveIndex = 1, roundSetup = null }) {
    this._startRound(sim, roundSetup);
    controllerA.reset();
    controllerB.reset();

    return this._playRound({
      sim,
      maxRoundFrames,
      perspectiveIndex,
      controller1: (fighter, opponent, innerSim, dt) => controllerA.step(fighter, opponent, innerSim, dt),
      controller2: (fighter, opponent, innerSim, dt) => controllerB.step(fighter, opponent, innerSim, dt),
    });
  }

  _playRound({ sim, maxRoundFrames, controller1, controller2, perspectiveIndex = 1 }) {
    let steps = 0;
    const tracker = this._createRewardTracker();

    while (!sim.roundOver && steps < maxRoundFrames) {
      this._updateTemporalState(sim);
      const stepResult = sim.step(FRAME_DURATION, { controller1, controller2 });
      steps++;
      this._trackFrameRewards(sim, tracker, perspectiveIndex);
      this._trackEventRewards(stepResult.events, tracker, perspectiveIndex);
    }

    const reward = this._computeRoundReward(sim, tracker, maxRoundFrames, perspectiveIndex);
    return {
      winner: sim.winner,
      perspectiveWinner: sim.winner == null ? null : (sim.winner === perspectiveIndex ? 1 : 2),
      killReason: sim.killReason,
      steps,
      frameCount: sim.frameCount,
      reward,
      rewardBreakdown: tracker,
    };
  }

  _startRound(sim, roundSetup = null) {
    const requestedDistance = roundSetup?.startDistance ?? FIGHT_START_DISTANCE;
    const startDistance = clampStartDistance(requestedDistance);
    const lateralOffset = clamp(roundSetup?.lateralOffset ?? 0, -1.2, 1.2);

    sim.startRound(startDistance);
    sim.fighter1.position.z = -lateralOffset * 0.5;
    sim.fighter2.position.z = lateralOffset * 0.5;
  }

  _createRewardTracker() {
    return {
      parrySuccesses: 0,
      gotParried: 0,
      heavyClashWins: 0,
      heavyClashLosses: 0,
      evadeNearAttack: 0,
      spacingEvade: 0,
      edgePressureFrames: 0,
      edgeDangerFrames: 0,
      _activeAttackWindow: false,
      _windowMobilityRewarded: false,
      _windowSpacingRewarded: false,
    };
  }

  _createTemporalState() {
    return {
      prevDist: null,
      prevAngleDot: null,
      distDelta: 0,
      angleDelta: 0,
      wasAttacking: false,
      lastAttackFrame: null,
      lastAttackEndFrame: null,
      lastSidestepFrame: null,
      lastBackstepFrame: null,
      lastClashFrame: null,
      lastParrySuccessFrame: null,
      lastSuccessfulEvadeFrame: null,
      lastState: null,
    };
  }

  _updateTemporalState(sim) {
    this._updateFighterTemporal(sim, sim.fighter1, sim.fighter2);
    this._updateFighterTemporal(sim, sim.fighter2, sim.fighter1);
  }

  _updateFighterTemporal(sim, fighter, opponent) {
    const temporal = fighter.neuralTemporal || (fighter.neuralTemporal = this._createTemporalState());
    const dist = fighter.distanceTo(opponent);
    temporal.distDelta = temporal.prevDist == null ? 0 : dist - temporal.prevDist;
    temporal.prevDist = dist;

    const dx = opponent.position.x - fighter.position.x;
    const dz = opponent.position.z - fighter.position.z;
    const norm = Math.sqrt((dx * dx) + (dz * dz)) || 0.0001;
    const forwardX = Math.sin(fighter.group.rotation.y);
    const forwardZ = Math.cos(fighter.group.rotation.y);
    const angleDot = ((dx / norm) * forwardX) + ((dz / norm) * forwardZ);
    temporal.angleDelta = temporal.prevAngleDot == null ? 0 : angleDot - temporal.prevAngleDot;
    temporal.prevAngleDot = angleDot;

    if (fighter.fsm.isAttacking && !temporal.wasAttacking) {
      temporal.lastAttackFrame = sim.frameCount;
    }
    if (!fighter.fsm.isAttacking && temporal.wasAttacking) {
      temporal.lastAttackEndFrame = sim.frameCount;
    }
    temporal.wasAttacking = fighter.fsm.isAttacking;

    if (fighter.state !== temporal.lastState) {
      if (fighter.state === FighterState.SIDESTEP) temporal.lastSidestepFrame = sim.frameCount;
      if (fighter.state === FighterState.DODGE) temporal.lastBackstepFrame = sim.frameCount;
      if (fighter.state === FighterState.CLASH) temporal.lastClashFrame = sim.frameCount;
      if (fighter.state === FighterState.PARRY_SUCCESS) temporal.lastParrySuccessFrame = sim.frameCount;
      temporal.lastState = fighter.state;
    }
  }

  _trackFrameRewards(sim, tracker, perspectiveIndex) {
    const fighter = perspectiveIndex === 1 ? sim.fighter1 : sim.fighter2;
    const opponent = perspectiveIndex === 1 ? sim.fighter2 : sim.fighter1;
    const dist = fighter.distanceTo(opponent);
    const engageRange = (opponent.charDef?.aiRanges?.engage ?? 2.5) + 0.35;

    if (opponent.fsm.isAttacking) {
      if (!tracker._activeAttackWindow) {
        tracker._activeAttackWindow = true;
        tracker._windowMobilityRewarded = false;
        tracker._windowSpacingRewarded = false;
      }

      if (!tracker._windowMobilityRewarded && dist <= engageRange) {
        if (fighter.state === FighterState.SIDESTEP || fighter.state === FighterState.DODGE) {
          tracker.evadeNearAttack++;
          if (fighter.neuralTemporal) fighter.neuralTemporal.lastSuccessfulEvadeFrame = sim.frameCount;
          tracker._windowMobilityRewarded = true;
          tracker._windowSpacingRewarded = true;
        }
      }

      if (!tracker._windowSpacingRewarded && dist > (opponent.charDef?.aiRanges?.engage ?? 2.5) && dist <= engageRange) {
        if (!isStronglyNegativeState(fighter.state)) {
          tracker.spacingEvade++;
          if (fighter.neuralTemporal) fighter.neuralTemporal.lastSuccessfulEvadeFrame = sim.frameCount;
          tracker._windowSpacingRewarded = true;
        }
      }
    } else {
      tracker._activeAttackWindow = false;
      tracker._windowMobilityRewarded = false;
      tracker._windowSpacingRewarded = false;
    }

    const selfEdgeDist = Math.sqrt((fighter.position.x ** 2) + (fighter.position.z ** 2));
    const oppEdgeDist = Math.sqrt((opponent.position.x ** 2) + (opponent.position.z ** 2));
    if (oppEdgeDist > ARENA_RADIUS * 0.82 && selfEdgeDist < oppEdgeDist - 0.4) {
      tracker.edgePressureFrames++;
    }
    if (selfEdgeDist > ARENA_RADIUS * 0.82 && selfEdgeDist > oppEdgeDist + 0.2) {
      tracker.edgeDangerFrames++;
    }
  }

  _trackEventRewards(events, tracker, perspectiveIndex) {
    const fighterIndex = perspectiveIndex - 1;
    const opponentIndex = fighterIndex === 0 ? 1 : 0;
    for (const event of events) {
      if (event?.type !== 'combat_result') continue;

      if (event.result === HitResult.PARRIED) {
        if (event.defenderIndex === fighterIndex) tracker.parrySuccesses++;
        if (event.attackerIndex === fighterIndex) tracker.gotParried++;
      }

      if (event.result === HitResult.CLASH) {
        const selfHeavy = (event.attackerIndex === fighterIndex && event.attackerType === AttackType.HEAVY) ||
          (event.defenderIndex === fighterIndex && event.defenderType === AttackType.HEAVY);
        const oppHeavy = (event.attackerIndex === opponentIndex && event.attackerType === AttackType.HEAVY) ||
          (event.defenderIndex === opponentIndex && event.defenderType === AttackType.HEAVY);
        if (selfHeavy && !oppHeavy) tracker.heavyClashWins++;
        if (oppHeavy && !selfHeavy) tracker.heavyClashLosses++;
      }
    }
  }

  _computeRoundReward(sim, tracker, maxRoundFrames, perspectiveIndex) {
    let reward = 0;

    const perspectiveWinner = sim.winner == null ? null : (sim.winner === perspectiveIndex ? 1 : 2);
    if (perspectiveWinner === 1) reward += ROUND_WIN_REWARD;
    else if (perspectiveWinner === 2) reward -= ROUND_WIN_REWARD;
    else reward -= ROUND_DRAW_PENALTY;

    reward += tracker.parrySuccesses * PARRY_SUCCESS_REWARD;
    reward -= tracker.gotParried * GOT_PARRIED_PENALTY;
    reward += tracker.heavyClashWins * HEAVY_CLASH_WIN_REWARD;
    reward -= tracker.heavyClashLosses * HEAVY_CLASH_LOSS_PENALTY;
    reward += tracker.evadeNearAttack * EVADE_NEAR_ATTACK_REWARD;
    reward += tracker.spacingEvade * SPACING_EVADE_REWARD;
    reward += clamp(tracker.edgePressureFrames * EDGE_PRESSURE_PER_FRAME, 0, 2);
    reward -= clamp(tracker.edgeDangerFrames * EDGE_DANGER_PER_FRAME, 0, 2);

    if (perspectiveWinner === 2) {
      reward += clamp(sim.frameCount / maxRoundFrames, 0, 1) * LOSS_SURVIVAL_MAX_REWARD;
    }

    return reward;
  }
}
