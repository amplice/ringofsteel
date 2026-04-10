import { AttackType, FighterState, ARENA_RADIUS } from '../../core/Constants.js';

const STATE_ORDER = [
  FighterState.IDLE,
  FighterState.WALK_FORWARD,
  FighterState.WALK_BACK,
  FighterState.SIDESTEP,
  FighterState.ATTACK_ACTIVE,
  FighterState.BLOCK,
  FighterState.BLOCK_STUN,
  FighterState.PARRY,
  FighterState.PARRY_SUCCESS,
  FighterState.DODGE,
  FighterState.HIT_STUN,
  FighterState.PARRIED_STUN,
  FighterState.DYING,
  FighterState.DEAD,
  FighterState.CLASH,
];

const ATTACK_ORDER = [null, AttackType.QUICK, AttackType.HEAVY, AttackType.THRUST];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pushOneHot(target, value, order) {
  for (const item of order) {
    target.push(value === item ? 1 : 0);
  }
}

function pushFighterEncoding(target, self, other) {
  pushOneHot(target, self.state, STATE_ORDER);
  pushOneHot(target, self.currentAttackType ?? null, ATTACK_ORDER);

  const stateDuration = Math.max(self.fsm?.stateDuration || 0, 1);
  const dx = other.position.x - self.position.x;
  const dz = other.position.z - self.position.z;
  const dist = Math.sqrt((dx * dx) + (dz * dz)) || 0.0001;
  const forwardX = Math.sin(self.group.rotation.y);
  const forwardZ = Math.cos(self.group.rotation.y);
  const dot = ((dx / dist) * forwardX) + ((dz / dist) * forwardZ);
  const arenaDist = Math.sqrt((self.position.x * self.position.x) + (self.position.z * self.position.z));

  target.push(
    clamp(self.position.x / ARENA_RADIUS, -1, 1),
    clamp(self.position.z / ARENA_RADIUS, -1, 1),
    clamp(arenaDist / ARENA_RADIUS, 0, 1),
    clamp(self.stateFrames / stateDuration, 0, 1),
    clamp(dot, -1, 1),
    self.fsm?.isActionable ? 1 : 0,
    self.fsm?.isAttacking ? 1 : 0,
    self.hitApplied ? 1 : 0,
    self.facingRight ? 1 : -1,
    clamp(self.fsm?.sidestepDirection ?? 0, -1, 1),
    self.fsm?.sidestepPhase === 'dash' ? 1 : 0,
    self.fsm?.sidestepPhase === 'recovery' ? 1 : 0,
  );
}

export function encodeObservation(fighter, opponent, sim) {
  const values = [];
  const dx = opponent.position.x - fighter.position.x;
  const dz = opponent.position.z - fighter.position.z;
  const dist = Math.sqrt((dx * dx) + (dz * dz)) || 0.0001;
  const fighterForwardX = Math.sin(fighter.group.rotation.y);
  const fighterForwardZ = Math.cos(fighter.group.rotation.y);
  const opponentForwardX = Math.sin(opponent.group.rotation.y);
  const opponentForwardZ = Math.cos(opponent.group.rotation.y);
  const fighterDot = ((dx / dist) * fighterForwardX) + ((dz / dist) * fighterForwardZ);
  const opponentDot = (((-dx) / dist) * opponentForwardX) + (((-dz) / dist) * opponentForwardZ);

  values.push(
    clamp(dx / ARENA_RADIUS, -1, 1),
    clamp(dz / ARENA_RADIUS, -1, 1),
    clamp(dist / ARENA_RADIUS, 0, 1),
    clamp(fighterDot, -1, 1),
    clamp(opponentDot, -1, 1),
    clamp((sim?.frameCount ?? 0) / 3600, 0, 1),
  );

  pushFighterEncoding(values, fighter, opponent);
  pushFighterEncoding(values, opponent, fighter);

  return Float32Array.from(values);
}

export const NEURAL_OBSERVATION_SIZE = encodeObservation(
  {
    position: { x: 0, z: 0 },
    group: { rotation: { y: 0 } },
    state: FighterState.IDLE,
    currentAttackType: null,
    stateFrames: 0,
    facingRight: true,
    hitApplied: false,
    fsm: { stateDuration: 1, isActionable: true, isAttacking: false, sidestepDirection: 0, sidestepPhase: null },
  },
  {
    position: { x: 1, z: 0 },
    group: { rotation: { y: Math.PI } },
    state: FighterState.IDLE,
    currentAttackType: null,
    stateFrames: 0,
    facingRight: false,
    hitApplied: false,
    fsm: { stateDuration: 1, isActionable: true, isAttacking: false, sidestepDirection: 0, sidestepPhase: null },
  },
  { frameCount: 0 },
).length;
