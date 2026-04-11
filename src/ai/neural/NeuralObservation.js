import { AttackType, FighterState, ARENA_RADIUS } from '../../core/Constants.js';

const CHARACTER_ORDER = ['spearman', 'ronin', 'knight'];
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
const TEMPORAL_WINDOW_FRAMES = 45;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pushOneHot(target, value, order) {
  for (const item of order) {
    target.push(value === item ? 1 : 0);
  }
}

function normalizeRecentFrame(currentFrame, lastFrame) {
  if (lastFrame == null || !Number.isFinite(lastFrame)) return 0;
  const framesAgo = currentFrame - lastFrame;
  if (framesAgo < 0 || framesAgo > TEMPORAL_WINDOW_FRAMES) return 0;
  return 1 - (framesAgo / TEMPORAL_WINDOW_FRAMES);
}

function getLocalAxes(rotationY) {
  const forwardX = Math.sin(rotationY);
  const forwardZ = Math.cos(rotationY);
  const rightX = Math.cos(rotationY);
  const rightZ = -Math.sin(rotationY);
  return { forwardX, forwardZ, rightX, rightZ };
}

function projectToLocal(dx, dz, rotationY) {
  const { forwardX, forwardZ, rightX, rightZ } = getLocalAxes(rotationY);
  return {
    localRight: (dx * rightX) + (dz * rightZ),
    localForward: (dx * forwardX) + (dz * forwardZ),
  };
}

function pushFighterEncoding(target, self, other, simFrame) {
  pushOneHot(target, self.charId ?? null, CHARACTER_ORDER);
  pushOneHot(target, self.state, STATE_ORDER);
  pushOneHot(target, self.currentAttackType ?? null, ATTACK_ORDER);

  const stateDuration = Math.max(self.fsm?.stateDuration || 0, 1);
  const dx = other.position.x - self.position.x;
  const dz = other.position.z - self.position.z;
  const dist = Math.sqrt((dx * dx) + (dz * dz)) || 0.0001;
  const { forwardX, forwardZ } = getLocalAxes(self.group.rotation.y);
  const dot = ((dx / dist) * forwardX) + ((dz / dist) * forwardZ);
  const arenaDist = Math.sqrt((self.position.x * self.position.x) + (self.position.z * self.position.z));
  const toCenter = projectToLocal(-self.position.x, -self.position.z, self.group.rotation.y);
  const temporal = self.neuralTemporal || {};

  target.push(
    clamp(toCenter.localRight / ARENA_RADIUS, -1, 1),
    clamp(toCenter.localForward / ARENA_RADIUS, -1, 1),
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
    clamp((temporal.distDelta ?? 0) / 0.35, -1, 1),
    clamp((temporal.angleDelta ?? 0) / 0.35, -1, 1),
    normalizeRecentFrame(simFrame, temporal.lastAttackFrame),
    normalizeRecentFrame(simFrame, temporal.lastAttackEndFrame),
    normalizeRecentFrame(simFrame, temporal.lastSidestepFrame),
    normalizeRecentFrame(simFrame, temporal.lastBackstepFrame),
    normalizeRecentFrame(simFrame, temporal.lastClashFrame),
    normalizeRecentFrame(simFrame, temporal.lastParrySuccessFrame),
  );
}

export function encodeObservation(fighter, opponent, sim) {
  const values = [];
  const simFrame = sim?.frameCount ?? 0;
  const dx = opponent.position.x - fighter.position.x;
  const dz = opponent.position.z - fighter.position.z;
  const dist = Math.sqrt((dx * dx) + (dz * dz)) || 0.0001;
  const { forwardX: fighterForwardX, forwardZ: fighterForwardZ } = getLocalAxes(fighter.group.rotation.y);
  const { forwardX: opponentForwardX, forwardZ: opponentForwardZ } = getLocalAxes(opponent.group.rotation.y);
  const fighterDot = ((dx / dist) * fighterForwardX) + ((dz / dist) * fighterForwardZ);
  const opponentDot = (((-dx) / dist) * opponentForwardX) + (((-dz) / dist) * opponentForwardZ);
  const localOpponent = projectToLocal(dx, dz, fighter.group.rotation.y);
  const fighterTemporal = fighter.neuralTemporal || {};
  const opponentTemporal = opponent.neuralTemporal || {};

  values.push(
    clamp(localOpponent.localRight / ARENA_RADIUS, -1, 1),
    clamp(localOpponent.localForward / ARENA_RADIUS, -1, 1),
    clamp(dist / ARENA_RADIUS, 0, 1),
    clamp(fighterDot, -1, 1),
    clamp(opponentDot, -1, 1),
    clamp((sim?.frameCount ?? 0) / 3600, 0, 1),
    clamp((fighterTemporal.distDelta ?? 0) / 0.35, -1, 1),
    clamp((opponentTemporal.distDelta ?? 0) / 0.35, -1, 1),
    normalizeRecentFrame(simFrame, fighterTemporal.lastSuccessfulEvadeFrame),
    normalizeRecentFrame(simFrame, opponentTemporal.lastAttackFrame),
  );

  pushFighterEncoding(values, fighter, opponent, simFrame);
  pushFighterEncoding(values, opponent, fighter, simFrame);

  return Float32Array.from(values);
}

export const NEURAL_OBSERVATION_SIZE = encodeObservation(
  {
    charId: 'ronin',
    position: { x: 0, z: 0 },
    group: { rotation: { y: 0 } },
    state: FighterState.IDLE,
    currentAttackType: null,
    stateFrames: 0,
    facingRight: true,
    hitApplied: false,
    fsm: { stateDuration: 1, isActionable: true, isAttacking: false, sidestepDirection: 0, sidestepPhase: null },
    neuralTemporal: {},
  },
  {
    charId: 'spearman',
    position: { x: 1, z: 0 },
    group: { rotation: { y: Math.PI } },
    state: FighterState.IDLE,
    currentAttackType: null,
    stateFrames: 0,
    facingRight: false,
    hitApplied: false,
    fsm: { stateDuration: 1, isActionable: true, isAttacking: false, sidestepDirection: 0, sidestepPhase: null },
    neuralTemporal: {},
  },
  { frameCount: 0 },
).length;
