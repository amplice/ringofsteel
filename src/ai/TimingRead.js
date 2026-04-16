import { FighterState } from '../core/Constants.js';

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function getStateDuration(fighter) {
  return Math.max(fighter?.fsm?.stateDuration || 0, 1);
}

function getStateProgress(fighter) {
  return clamp01((fighter?.stateFrames || 0) / getStateDuration(fighter));
}

export function getFramesUntilActionable(fighter) {
  if (!fighter) return 0;
  if (fighter?.fsm?.isActionable) return 0;
  return Math.max(0, getStateDuration(fighter) - (fighter.stateFrames || 0));
}

export function getAttackTimingRead(fighter) {
  if (!fighter?.fsm?.isAttacking || fighter.state !== FighterState.ATTACK_ACTIVE || !fighter.currentAttackData) {
    return {
      attacking: false,
      phase: 'none',
      progress: 0,
      framesUntilContact: Infinity,
      activeFramesRemaining: 0,
      recoveryFramesRemaining: 0,
      contactImminent: false,
      lateRecovery: false,
      justStarted: false,
      almostDone: false,
      attackType: fighter?.currentAttackType ?? null,
    };
  }

  const duration = getStateDuration(fighter);
  const stateFrames = fighter.stateFrames || 0;
  const progress = getStateProgress(fighter);
  const contactStart = clamp01(fighter.currentAttackData.contactStart ?? 0.3);
  const contactEnd = clamp01(fighter.currentAttackData.contactEnd ?? 0.55);
  const contactStartFrame = Math.max(0, Math.ceil(contactStart * duration));
  const contactEndFrame = Math.max(contactStartFrame, Math.ceil(contactEnd * duration));
  const framesUntilContact = Math.max(0, contactStartFrame - stateFrames);
  const activeFramesRemaining = Math.max(0, contactEndFrame - stateFrames);
  const recoveryFramesRemaining = progress > contactEnd ? Math.max(0, duration - stateFrames) : 0;

  let phase = 'startup';
  if (progress >= contactStart && progress <= contactEnd) phase = 'active';
  else if (progress > contactEnd) phase = 'recovery';

  return {
    attacking: true,
    phase,
    progress,
    framesUntilContact,
    activeFramesRemaining,
    recoveryFramesRemaining,
    contactImminent: phase === 'startup' && framesUntilContact <= 8,
    lateRecovery: phase === 'recovery' && recoveryFramesRemaining <= 10,
    justStarted: phase === 'startup' && stateFrames <= 6,
    almostDone: stateFrames >= (duration - 6),
    attackType: fighter.currentAttackType ?? null,
  };
}

export function getDefensiveTimingWindow(self, opponent) {
  const opponentAttack = getAttackTimingRead(opponent);
  const selfFramesUntilActionable = getFramesUntilActionable(self);

  return {
    opponentAttack,
    selfFramesUntilActionable,
    canImmediatePunish: selfFramesUntilActionable === 0 && opponentAttack.lateRecovery,
    shouldDefendNow:
      opponentAttack.phase === 'active' ||
      (opponentAttack.phase === 'startup' && opponentAttack.contactImminent),
    shouldPreemptMovement:
      opponentAttack.phase === 'startup' &&
      !opponentAttack.contactImminent &&
      opponentAttack.framesUntilContact <= 14,
  };
}
