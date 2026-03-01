import { KILL_DAMAGE, Zone } from '../core/Constants.js';

export class DamageSystem {
  constructor() {
    this.zones = {
      [Zone.HIGH]: 0,
      [Zone.MID]: 0,
      [Zone.LOW]: 0,
    };
    this.totalDamage = 0;
  }

  applyDamage(zone, amount = 1) {
    this.zones[zone] += amount;
    this.totalDamage += amount;
    return this.totalDamage >= KILL_DAMAGE;
  }

  isDead() {
    return this.totalDamage >= KILL_DAMAGE;
  }

  isZoneDamaged(zone) {
    return this.zones[zone] > 0;
  }

  getDamageByZone(zone) {
    return this.zones[zone];
  }

  reset() {
    this.zones[Zone.HIGH] = 0;
    this.zones[Zone.MID] = 0;
    this.zones[Zone.LOW] = 0;
    this.totalDamage = 0;
  }
}
