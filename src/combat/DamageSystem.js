export class DamageSystem {
  constructor() {
    this.alive = true;
  }

  applyDamage() {
    this.alive = false;
    return true; // always lethal
  }

  isDead() {
    return !this.alive;
  }

  reset() {
    this.alive = true;
  }
}
