import { Stance, AttackType, WeaponType } from '../core/Constants.js';

// Frame data: [startup, active, recovery, reach]
const BASE_DATA = {
  [Stance.HIGH]: {
    [AttackType.QUICK]:  { startup: 6, active: 3, recovery: 9,  reach: 1.5, name: 'Crane Peck' },
    [AttackType.HEAVY]:  { startup: 18, active: 5, recovery: 20, reach: 2.2, name: 'Heaven Splitter' },
    [AttackType.THRUST]: { startup: 9, active: 4, recovery: 12, reach: 2.1, name: 'Piercing Star' },
  },
  [Stance.MID]: {
    [AttackType.QUICK]:  { startup: 5, active: 3, recovery: 8,  reach: 1.6, name: 'Flowing Water' },
    [AttackType.HEAVY]:  { startup: 16, active: 5, recovery: 18, reach: 2.0, name: 'Iron Gate' },
    [AttackType.THRUST]: { startup: 8, active: 4, recovery: 13, reach: 2.3, name: 'Dragon Fang' },
  },
  [Stance.LOW]: {
    [AttackType.QUICK]:  { startup: 7, active: 3, recovery: 10, reach: 1.4, name: 'Serpent Bite' },
    [AttackType.HEAVY]:  { startup: 20, active: 6, recovery: 22, reach: 2.0, name: 'Earth Shatter' },
    [AttackType.THRUST]: { startup: 9, active: 4, recovery: 13, reach: 2.3, name: 'Viper Lunge' },
  },
};

// Weapon modifiers
const WEAPON_MODS = {
  [WeaponType.JIAN]: { startupMod: 0, reachMod: 0, recoveryMod: 0 },     // Balanced
  [WeaponType.DAO]: { startupMod: 1, reachMod: 0.1, recoveryMod: -1 },   // Slightly slower, more reach, faster recovery
  [WeaponType.STAFF]: { startupMod: 2, reachMod: 0.4, recoveryMod: 2 },  // Slower, much more reach, longer recovery
};

export function getAttackData(stance, attackType, weaponType = WeaponType.JIAN) {
  const base = BASE_DATA[stance][attackType];
  const mod = WEAPON_MODS[weaponType];

  return {
    startup: base.startup + mod.startupMod,
    active: base.active,
    recovery: base.recovery + mod.recoveryMod,
    reach: base.reach + mod.reachMod,
    name: base.name,
    stance,
    attackType,
  };
}

export function getTotalFrames(attackData) {
  return attackData.startup + attackData.active + attackData.recovery;
}
