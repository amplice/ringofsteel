import {
  FighterState, AttackType,
  PARRY_WINDOW_FRAMES,
  PARRY_REENTRY_COOLDOWN_FRAMES,
  BLOCK_STUN_FRAMES, HIT_STUN_FRAMES, PARRIED_STUN_FRAMES, PARRY_SUCCESS_FRAMES_BY_ATTACK,
  CLASH_PUSHBACK_FRAMES,
  SIDESTEP_DASH_FRAMES, SIDESTEP_RECOVERY_FRAMES,
  BACKSTEP_FRAMES, BACKSTEP_INVULN_FRAMES,
} from '../core/Constants.js';
import { getAttackData } from './AttackData.js';

export class FighterStateMachine {
  constructor(fighter) {
    this.fighter = fighter;
    this.state = FighterState.IDLE;
    this.stateFrames = 0;
    this.stateDuration = 0;
    this.currentAttackData = null;
    this.currentAttackType = null;
    this.hitApplied = false;

    // Sidestep state
    this.sidestepDirection = 0;    // +1 or -1 (Z axis)
    this.sidestepPhase = null;     // 'dash' | 'recovery'
    this.parryCooldownFrames = 0;
  }

  get isActionable() {
    return this.state === FighterState.IDLE ||
           this.state === FighterState.WALK_FORWARD ||
           this.state === FighterState.WALK_BACK ||
           this.state === FighterState.PARRY_SUCCESS ||
           this.isSidestepRecovery;
  }

  get isSidestepRecovery() {
    return this.state === FighterState.SIDESTEP && this.sidestepPhase === 'recovery';
  }

  get isAttacking() {
    return this.state === FighterState.ATTACK_ACTIVE;
  }

  get isParryWindowActive() {
    return this.state === FighterState.PARRY && this.stateFrames <= PARRY_WINDOW_FRAMES;
  }

  get isParryFallbackBlock() {
    return this.state === FighterState.PARRY && this.stateFrames > PARRY_WINDOW_FRAMES;
  }

  get isGuarding() {
    return this.state === FighterState.BLOCK || this.state === FighterState.PARRY;
  }

  transition(newState, duration = 0) {
    if (newState !== FighterState.ATTACK_ACTIVE) {
      this.currentAttackData = null;
      this.currentAttackType = null;
      this.hitApplied = false;
    }
    if (newState !== FighterState.SIDESTEP) {
      this.sidestepDirection = 0;
      this.sidestepPhase = null;
    }
    this.state = newState;
    this.stateFrames = 0;
    this.stateDuration = duration;
  }

  startAttack(attackType, durationFrames) {
    if (!this.isActionable) return false;

    this.currentAttackData = { ...getAttackData(attackType, this.fighter.charDef) };
    this.currentAttackType = attackType;
    this.hitApplied = false;
    this.transition(FighterState.ATTACK_ACTIVE, durationFrames);
    return true;
  }

  startBlock() {
    if (!this.isActionable) return false;
    this.transition(FighterState.BLOCK);
    return true;
  }

  startParry() {
    if (!this.isActionable) return false;
    if (this.parryCooldownFrames > 0) return false;
    this.transition(FighterState.PARRY);
    this.parryCooldownFrames = PARRY_REENTRY_COOLDOWN_FRAMES;
    return true;
  }

  startSidestep(direction) {
    if (!this.isActionable || this.isSidestepRecovery) return false;
    const recoveryFrames = this.fighter.charDef?.sidestepRecoveryFrames ?? SIDESTEP_RECOVERY_FRAMES;
    this.sidestepDirection = direction;
    this.sidestepPhase = 'dash';
    this.transition(FighterState.SIDESTEP, SIDESTEP_DASH_FRAMES + recoveryFrames);
    return true;
  }

  startBackstep() {
    if (!this.isActionable) return false;
    this.transition(FighterState.DODGE, BACKSTEP_FRAMES);
    return true;
  }

  applyBlockStun(frames) {
    this.transition(FighterState.BLOCK_STUN, frames || BLOCK_STUN_FRAMES);
  }

  applyHitStun(frames) {
    this.transition(FighterState.HIT_STUN, frames || HIT_STUN_FRAMES);
  }

  applyParriedStun(frames) {
    this.transition(FighterState.PARRIED_STUN, frames || PARRIED_STUN_FRAMES);
  }

  applyParrySuccess(frames, attackType = null) {
    // Legacy explicit state retained for AI/presentation hooks. In gameplay it
    // is not meaningfully stronger than returning to IDLE, because both states
    // are actionable; the attacker's PARRIED_STUN is what really creates the
    // punish opportunity.
    const defaultFrames = attackType
      ? (PARRY_SUCCESS_FRAMES_BY_ATTACK[attackType] ?? PARRIED_STUN_FRAMES)
      : PARRIED_STUN_FRAMES;
    this.transition(FighterState.PARRY_SUCCESS, frames || defaultFrames);
  }

  applyClash(frames) {
    this.transition(FighterState.CLASH, frames || CLASH_PUSHBACK_FRAMES);
  }

  startDying() {
    this.transition(FighterState.DYING, 360);
  }

  update() {
    if (this.parryCooldownFrames > 0) {
      this.parryCooldownFrames--;
    }
    this.stateFrames++;

    switch (this.state) {
      case FighterState.ATTACK_ACTIVE:
        if (this.stateFrames >= this.stateDuration) {
          this.transition(FighterState.IDLE);
        }
        break;

      case FighterState.BLOCK:
        // Block persists while held — released externally
        break;

      case FighterState.PARRY:
        // Keep the post-window guard fallback, but derive it from the parry window
        // so gameplay and presentation stay aligned.
        if (this.stateFrames >= PARRY_WINDOW_FRAMES + 5) {
          this.transition(FighterState.BLOCK);
        }
        break;

      case FighterState.PARRY_SUCCESS:
        // Legacy post-parry marker. Still actionable, but not a unique
        // human-facing mechanic on its own; the real advantage comes from the
        // opponent being in PARRIED_STUN.
        if (this.stateFrames >= this.stateDuration) {
          this.transition(FighterState.IDLE);
        }
        break;

      case FighterState.BLOCK_STUN:
      case FighterState.HIT_STUN:
      case FighterState.PARRIED_STUN:
      case FighterState.CLASH:
        if (this.stateFrames >= this.stateDuration) {
          this.fighter.slideMult = 1;
          this.fighter.blockPushRemaining = 0;
          this.transition(FighterState.IDLE);
        }
        break;

      case FighterState.SIDESTEP:
        {
        const recoveryFrames = this.fighter.charDef?.sidestepRecoveryFrames ?? SIDESTEP_RECOVERY_FRAMES;
        if (this.sidestepPhase === 'dash' && this.stateFrames >= SIDESTEP_DASH_FRAMES) {
          this.sidestepPhase = 'recovery';
          this.stateFrames = 0;
        } else if (this.sidestepPhase === 'recovery' && this.stateFrames >= recoveryFrames) {
          this.transition(FighterState.IDLE);
        }
        }
        break;

      case FighterState.DODGE:
        // Backstep
        if (this.stateFrames >= BACKSTEP_FRAMES) {
          this.transition(FighterState.IDLE);
        }
        break;

      case FighterState.DYING:
        if (this.stateFrames >= this.stateDuration) {
          this.transition(FighterState.DEAD);
        }
        break;
    }
  }

  reset() {
    this.state = FighterState.IDLE;
    this.stateFrames = 0;
    this.stateDuration = 0;
    this.currentAttackData = null;
    this.currentAttackType = null;
    this.hitApplied = false;
    this.sidestepDirection = 0;
    this.sidestepPhase = null;
    this.parryCooldownFrames = 0;
  }
}

