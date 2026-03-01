import { Stance, STANCE_CYCLE, STANCE_CHANGE_FRAMES, ATTACK_ZONES } from '../core/Constants.js';

export class StanceSystem {
  constructor() {
    this.currentStance = Stance.MID;
    this.isChanging = false;
    this.changeFramesLeft = 0;
    this.targetStance = null;
  }

  cycleStance() {
    if (this.isChanging) return false;

    const idx = STANCE_CYCLE.indexOf(this.currentStance);
    this.targetStance = STANCE_CYCLE[(idx + 1) % STANCE_CYCLE.length];
    this.isChanging = true;
    this.changeFramesLeft = STANCE_CHANGE_FRAMES;
    return true;
  }

  update() {
    if (this.isChanging) {
      this.changeFramesLeft--;
      if (this.changeFramesLeft <= 0) {
        this.currentStance = this.targetStance;
        this.isChanging = false;
        this.targetStance = null;
      }
    }
  }

  getGuardZone() {
    return this.currentStance; // Stance = guard zone
  }

  getAttackTargetZone(attackType) {
    return ATTACK_ZONES[this.currentStance][attackType];
  }

  get stance() {
    return this.currentStance;
  }

  reset() {
    this.currentStance = Stance.MID;
    this.isChanging = false;
    this.changeFramesLeft = 0;
    this.targetStance = null;
  }
}
