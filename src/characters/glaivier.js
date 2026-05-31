import { AttackType, WeaponType } from '../core/Constants.js';
import { defineCharacter } from './shared/characterContract.js';

export const glaivier = defineCharacter('glaivier', {
  displayName: 'Glaivier',
  glbPath: '/glaivier.glb',
  weapon: {
    type: WeaponType.SPEAR,
    stats: {
      name: 'Guandao',
      description: 'Sweeping crescent polearm',
      length: 2.15,
      width: 0.055,
      color: 0xb9c3c3,
      guardSize: 0,
    },
    tuning: {
      hitRadius: 0.055,
      hitMode: 'capsule',
      hitSegmentStart: 0.78,
      hitSegmentEnd: 1,
    },
  },
  attackData: {
    [AttackType.QUICK]: {
      aiRange: 1.72,
      lunge: 0.38,
      blockPush: 0.58,
      lungeStart: 0.42,
      lungeEnd: 0.9,
      contactStart: 9 / 36,
      contactEnd: 17.001 / 36,
      name: 'Hook Cut',
    },
    [AttackType.HEAVY]: {
      aiRange: 1.95,
      lunge: 0.64,
      blockPush: 1.2,
      lungeStart: 0.22,
      lungeEnd: 0.76,
      contactStart: 11 / 42,
      contactEnd: 22.001 / 42,
      clashAdvantage: {
        selfStunMult: 0.68,
        targetStunMult: 1.22,
      },
      name: 'Crescent Cleave',
    },
    [AttackType.THRUST]: {
      aiRange: 2.25,
      lunge: 0.32,
      blockPush: 0.85,
      lungeRatio: 0.52,
      contactStart: 12 / 33,
      contactEnd: 20.001 / 33,
      name: 'Driving Thrust',
    },
  },
  sim: {
    poseProfile: {
      idle: {
        [AttackType.QUICK]: { yawStart: 0, yawEnd: 0, reachStart: 0.86, reachEnd: 0.86, liftStart: 0.12, liftEnd: 0.12 },
        [AttackType.HEAVY]: { yawStart: 0, yawEnd: 0, reachStart: 0.86, reachEnd: 0.86, liftStart: 0.12, liftEnd: 0.12 },
        [AttackType.THRUST]: { yawStart: 0, yawEnd: 0, reachStart: 0.86, reachEnd: 0.86, liftStart: 0.12, liftEnd: 0.12 },
      },
      attack: {
        [AttackType.QUICK]: {
          yawStart: -0.55, yawEnd: 0.42, reachStart: 1.58, reachEnd: 2.0, liftStart: 0.12, liftEnd: 0.04,
          windupLead: 0.1, recoveryEnd: 0.5,
        },
        [AttackType.HEAVY]: {
          yawStart: -0.95, yawEnd: 0.95, reachStart: 1.7, reachEnd: 2.16, liftStart: 0.32, liftEnd: 0.1,
          windupLead: 0.12, recoveryEnd: 0.32,
        },
        [AttackType.THRUST]: {
          yawStart: -0.06, yawEnd: 0.06, reachStart: 1.9, reachEnd: 2.36, liftStart: 0.08, liftEnd: 0.02,
          windupLead: 0.18, recoveryEnd: 0.62,
        },
      },
      sideOffset: 0.1,
      baseForward: 0.2,
      idleTipLift: 0.06,
    },
  },
  motionThresholds: {
    towardTarget: 0.002,
    relativeSpeed: 0.0035,
  },
  modelYOffset: -0.055,
  modelRotationX: -0.02,
  idleDuringStepCooldown: true,
  walkSpeedMult: 0.55,
  clipSpeedups: {
    walk: ['walk_forward', 'walk_backward'],
    strafe: ['strafe_left', 'strafe_right'],
    attack: ['attack_quick', 'attack_heavy', 'attack_thrust'],
    backstep: ['backstep'],
    knockback: ['clash_knockback', 'block_knockback'],
  },
  clipSpeedFactor: { walk: 1, strafe: 2, attack: 2, backstep: 3, knockback: 2 },
  clipSpeedOverrides: {
    walk_forward: 1.85,
    walk_backward: 2.0,
    strafe_left: 1.42,
    strafe_right: 1.18,
    attack_quick: 1.0,
    attack_heavy: 0.92,
    attack_thrust: 1.02,
    block_parry: 1.25,
    clash_knockback: 2.45,
    block_knockback: 2.45,
  },
  bakeWeapon: true,
  aiRanges: { engage: 2.75, close: 1.85 },
  attackStrength: 0.92,
  defenseStoutness: 0.9,
  sidestepDistance: 1.28,
  sidestepRecoveryFrames: 8,
});
