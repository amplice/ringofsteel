import { AttackType, FighterState } from '../core/Constants.js';

const DEG = Math.PI / 180;

// Default idle pose
const BASE_IDLE = {
  torso: { rx: 0, ry: 0, rz: 0 },
  head: { rx: 0, ry: 0, rz: 0 },
  upperArmR: { rx: 0, ry: 0, rz: -30 * DEG },
  lowerArmR: { rx: -20 * DEG, ry: 0, rz: 0 },
  upperArmL: { rx: 0, ry: 0, rz: 30 * DEG },
  lowerArmL: { rx: -20 * DEG, ry: 0, rz: 0 },
  upperLegR: { rx: -5 * DEG, ry: 0, rz: 0 },
  lowerLegR: { rx: 10 * DEG, ry: 0, rz: 0 },
  upperLegL: { rx: 5 * DEG, ry: 0, rz: 0 },
  lowerLegL: { rx: 5 * DEG, ry: 0, rz: 0 },
};

// Single idle pose (uses the old MID stance)
const IDLE_POSE = {
  torso: { rx: 0, ry: -15 * DEG, rz: 0 },
  head: { rx: 0, ry: 10 * DEG, rz: 0 },
  upperArmR: { rx: -70 * DEG, ry: 0, rz: -30 * DEG },
  lowerArmR: { rx: -30 * DEG, ry: 0, rz: 0 },
  upperArmL: { rx: -20 * DEG, ry: 0, rz: 25 * DEG },
  lowerArmL: { rx: -30 * DEG, ry: 0, rz: 0 },
  upperLegR: { rx: -10 * DEG, ry: 0, rz: 0 },
  lowerLegR: { rx: 15 * DEG, ry: 0, rz: 0 },
  upperLegL: { rx: 8 * DEG, ry: 0, rz: 0 },
  lowerLegL: { rx: 5 * DEG, ry: 0, rz: 0 },
};

// Attack poses
const QUICK_ATTACK = {
  startup: {
    upperArmR: { rx: -80 * DEG, ry: -10 * DEG, rz: -25 * DEG },
    lowerArmR: { rx: -40 * DEG, ry: 0, rz: 0 },
    torso: { rx: 0, ry: -25 * DEG, rz: 0 },
  },
  active: {
    upperArmR: { rx: -60 * DEG, ry: 20 * DEG, rz: -35 * DEG },
    lowerArmR: { rx: -10 * DEG, ry: 0, rz: 0 },
    torso: { rx: 5 * DEG, ry: 20 * DEG, rz: 0 },
  },
};

// Heavy reuses same poses — the slower timing comes from frame data
const ATTACKS = {
  [AttackType.QUICK]: QUICK_ATTACK,
  [AttackType.HEAVY]: QUICK_ATTACK,
};

const BLOCK_POSE = {
  upperArmR: { rx: -90 * DEG, ry: 30 * DEG, rz: -20 * DEG },
  lowerArmR: { rx: -60 * DEG, ry: 0, rz: 0 },
  upperArmL: { rx: -50 * DEG, ry: -10 * DEG, rz: 20 * DEG },
  lowerArmL: { rx: -50 * DEG, ry: 0, rz: 0 },
  torso: { rx: 5 * DEG, ry: 0, rz: 0 },
};

const HIT_STUN_POSE = {
  torso: { rx: -15 * DEG, ry: 20 * DEG, rz: 5 * DEG },
  head: { rx: 10 * DEG, ry: -15 * DEG, rz: 0 },
  upperArmR: { rx: -20 * DEG, ry: 0, rz: -50 * DEG },
  lowerArmR: { rx: -10 * DEG, ry: 0, rz: 0 },
  upperArmL: { rx: 10 * DEG, ry: 0, rz: 40 * DEG },
  lowerArmL: { rx: -10 * DEG, ry: 0, rz: 0 },
};

const DYING_POSE = {
  torso: { rx: -30 * DEG, ry: 30 * DEG, rz: 10 * DEG },
  head: { rx: 20 * DEG, ry: -20 * DEG, rz: 10 * DEG },
  upperArmR: { rx: 10 * DEG, ry: 0, rz: -70 * DEG },
  lowerArmR: { rx: -5 * DEG, ry: 0, rz: 0 },
  upperArmL: { rx: 20 * DEG, ry: 0, rz: 50 * DEG },
  lowerArmL: { rx: -10 * DEG, ry: 0, rz: 0 },
  upperLegR: { rx: -20 * DEG, ry: 0, rz: 0 },
  lowerLegR: { rx: 40 * DEG, ry: 0, rz: 0 },
  upperLegL: { rx: 10 * DEG, ry: 0, rz: 0 },
  lowerLegL: { rx: 5 * DEG, ry: 0, rz: 0 },
};

const DODGE_POSE = {
  torso: { rx: 15 * DEG, ry: 0, rz: 0 },
  head: { rx: -10 * DEG, ry: 0, rz: 0 },
  upperLegR: { rx: -25 * DEG, ry: 0, rz: 0 },
  lowerLegR: { rx: 30 * DEG, ry: 0, rz: 0 },
  upperLegL: { rx: 15 * DEG, ry: 0, rz: 0 },
  lowerLegL: { rx: 5 * DEG, ry: 0, rz: 0 },
};

const WALK_FORWARD_OFFSET = {
  upperLegR: { rx: -20 * DEG },
  lowerLegR: { rx: 10 * DEG },
  upperLegL: { rx: 15 * DEG },
  lowerLegL: { rx: 5 * DEG },
};

const WALK_BACK_OFFSET = {
  upperLegR: { rx: 15 * DEG },
  lowerLegR: { rx: 5 * DEG },
  upperLegL: { rx: -20 * DEG },
  lowerLegL: { rx: 10 * DEG },
};

export function getStancePose() {
  return IDLE_POSE;
}

export function getAttackPose(attackType, phase) {
  const attackData = ATTACKS[attackType];
  if (!attackData) return IDLE_POSE;
  return attackData[phase] || IDLE_POSE;
}

export function getBlockPose() {
  return BLOCK_POSE;
}

export function getHitStunPose() {
  return HIT_STUN_POSE;
}

export function getDyingPose() {
  return DYING_POSE;
}

export function getDodgePose() {
  return DODGE_POSE;
}

export function getWalkPose(forward) {
  return forward ? WALK_FORWARD_OFFSET : WALK_BACK_OFFSET;
}

export { BASE_IDLE };
