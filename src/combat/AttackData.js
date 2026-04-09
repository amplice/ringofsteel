import { AttackType, WeaponType } from '../core/Constants.js';

const FALLBACK_ATTACK_DATA = {
  [WeaponType.KATANA]: {
    [AttackType.QUICK]: {
      aiRange: 1.5,
      lunge: 0.4,
      blockPush: 0.5,
      lungeStart: 1 / 3,
      lungeEnd: 2 / 3,
      contactStart: 30 / 90,
      contactEnd: 44 / 90,
      name: 'Slash',
    },
    [AttackType.HEAVY]: {
      aiRange: 1.8,
      lunge: 1.05,
      blockPush: 1.2,
      lungeStart: 1 / 5,
      lungeEnd: 4 / 5,
      contactStart: 30 / 115,
      contactEnd: 55 / 115,
      name: 'Heavy Slash',
    },
    [AttackType.THRUST]: {
      aiRange: 2.0,
      lunge: 0.82,
      blockPush: 0.8,
      lungeStart: 0.25,
      lungeEnd: 0.75,
      contactStart: 22 / 65,
      contactEnd: 41 / 65,
      name: 'Thrust',
    },
  },
  [WeaponType.SPEAR]: {
    [AttackType.QUICK]: {
      aiRange: 2.0,
      lunge: 0.2,
      blockPush: 0.5,
      lungeStart: 0.5,
      lungeEnd: 1.0,
      contactStart: 17 / 90,
      contactEnd: 42 / 90,
      name: 'Slash',
    },
    [AttackType.HEAVY]: {
      aiRange: 2.3,
      lunge: 0.6,
      blockPush: 1.2,
      lungeStart: 1 / 3,
      lungeEnd: 2 / 3,
      contactStart: 13 / 105,
      contactEnd: 38 / 105,
      name: 'Heavy Slash',
    },
    [AttackType.THRUST]: {
      aiRange: 2.5,
      lunge: 0.24,
      blockPush: 0.8,
      lungeRatio: 0.5,
      contactStart: 27 / 83,
      contactEnd: 44 / 83,
      name: 'Thrust',
    },
  },
  [WeaponType.SWORD]: {
    [AttackType.QUICK]: {
      aiRange: 1.55,
      lunge: 0.4,
      blockPush: 0.6,
      lungeStart: 1 / 3,
      lungeEnd: 2 / 3,
      contactStart: 0.28,
      contactEnd: 0.5,
      name: 'Cut',
    },
    [AttackType.HEAVY]: {
      aiRange: 1.85,
      lunge: 0.95,
      blockPush: 1.3,
      lungeStart: 0.2,
      lungeEnd: 0.8,
      contactStart: 0.24,
      contactEnd: 0.5,
      name: 'Heavy Cut',
    },
    [AttackType.THRUST]: {
      aiRange: 2.0,
      lunge: 0.75,
      blockPush: 0.9,
      lungeStart: 0.25,
      lungeEnd: 0.75,
      contactStart: 0.3,
      contactEnd: 0.62,
      name: 'Thrust',
    },
  },
};

export function getAttackData(attackType, charDefOrWeaponType = WeaponType.KATANA) {
  const charDef = charDefOrWeaponType && typeof charDefOrWeaponType === 'object'
    ? charDefOrWeaponType
    : null;
  const weaponType = charDef ? charDef.weaponType : charDefOrWeaponType;
  const weaponData = charDef?.attackData || FALLBACK_ATTACK_DATA[weaponType] || FALLBACK_ATTACK_DATA[WeaponType.KATANA];
  const attackData = weaponData[attackType] || weaponData[AttackType.QUICK];
  return { ...attackData, attackType };
}
