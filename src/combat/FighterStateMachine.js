import {
  FighterState, AttackType,
  BLOCK_STUN_FRAMES, HIT_STUN_FRAMES, PARRIED_STUN_FRAMES,
  DODGE_INVULN_FRAMES, DODGE_TOTAL_FRAMES, CLASH_PUSHBACK_FRAMES,
} from '../core/Constants.js';
import { getAttackData, getTotalFrames } from './AttackData.js';

export class FighterStateMachine {
  constructor(fighter) {
    this.fighter = fighter;
    this.state = FighterState.IDLE;
    this.stateFrames = 0;
    this.stateDuration = 0;
    this.currentAttackData = null;
    this.currentAttackType = null;
    this.hitApplied = false;
  }

  get isActionable() {
    return this.state === FighterState.IDLE ||
           this.state === FighterState.WALK_FORWARD ||
           this.state === FighterState.WALK_BACK ||
           this.state === FighterState.SIDESTEP;
  }

  get isAttacking() {
    return this.state === FighterState.ATTACK_STARTUP ||
           this.state === FighterState.ATTACK_ACTIVE ||
           this.state === FighterState.ATTACK_RECOVERY;
  }

  transition(newState, duration = 0) {
    this.state = newState;
    this.stateFrames = 0;
    this.stateDuration = duration;
  }

  startAttack(attackType) {
    if (!this.isActionable) return false;

    const data = getAttackData(
      this.fighter.stanceSystem.stance,
      attackType,
      this.fighter.weaponType
    );

    this.currentAttackData = data;
    this.currentAttackType = attackType;
    this.hitApplied = false;
    this.transition(FighterState.ATTACK_STARTUP, data.startup);
    return true;
  }

  startBlock() {
    if (!this.isActionable) return false;
    this.transition(FighterState.BLOCK);
    return true;
  }

  startParry() {
    if (!this.isActionable) return false;
    this.transition(FighterState.PARRY);
    return true;
  }

  startDodge() {
    if (!this.isActionable) return false;
    this.transition(FighterState.DODGE, DODGE_TOTAL_FRAMES);
    return true;
  }

  applyBlockStun() {
    this.transition(FighterState.BLOCK_STUN, BLOCK_STUN_FRAMES);
  }

  applyHitStun() {
    this.transition(FighterState.HIT_STUN, HIT_STUN_FRAMES);
  }

  applyParriedStun() {
    this.transition(FighterState.PARRIED_STUN, PARRIED_STUN_FRAMES);
  }

  applyClash() {
    this.transition(FighterState.CLASH, CLASH_PUSHBACK_FRAMES);
  }

  startDying() {
    this.transition(FighterState.DYING, 60);
  }

  update() {
    this.stateFrames++;

    switch (this.state) {
      case FighterState.ATTACK_STARTUP:
        if (this.stateFrames >= this.currentAttackData.startup) {
          this.transition(FighterState.ATTACK_ACTIVE, this.currentAttackData.active);
        }
        break;

      case FighterState.ATTACK_ACTIVE:
        if (this.stateFrames >= this.currentAttackData.active) {
          this.transition(FighterState.ATTACK_RECOVERY, this.currentAttackData.recovery);
        }
        break;

      case FighterState.ATTACK_RECOVERY:
        if (this.stateFrames >= this.currentAttackData.recovery) {
          this.currentAttackData = null;
          this.currentAttackType = null;
          this.transition(FighterState.IDLE);
        }
        break;

      case FighterState.BLOCK:
        // Block persists while held — released externally
        break;

      case FighterState.PARRY:
        // Short window, then transition to block or idle
        if (this.stateFrames >= 10) {
          this.transition(FighterState.IDLE);
        }
        break;

      case FighterState.BLOCK_STUN:
      case FighterState.HIT_STUN:
      case FighterState.PARRIED_STUN:
      case FighterState.CLASH:
        if (this.stateFrames >= this.stateDuration) {
          this.transition(FighterState.IDLE);
        }
        break;

      case FighterState.DODGE:
        if (this.stateFrames >= DODGE_TOTAL_FRAMES) {
          this.transition(FighterState.IDLE);
        }
        break;

      case FighterState.DYING:
        if (this.stateFrames >= this.stateDuration) {
          this.transition(FighterState.DEAD);
        }
        break;

      case FighterState.STANCE_CHANGE:
        // Handled by StanceSystem
        if (!this.fighter.stanceSystem.isChanging) {
          this.transition(FighterState.IDLE);
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
  }
}
