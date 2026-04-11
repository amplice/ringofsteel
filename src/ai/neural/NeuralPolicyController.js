import { FighterState } from '../../core/Constants.js';
import { encodeObservation } from './NeuralObservation.js';

export const NEURAL_ACTIONS = Object.freeze([
  'idle',
  'forward',
  'back',
  'sidestepUp',
  'sidestepDown',
  'backstep',
  'block',
  'quick',
  'heavy',
  'thrust',
]);

const SUSTAINED_ACTIONS = new Set(['idle', 'forward', 'back', 'block']);
const SINGLE_COMMIT_ACTIONS = new Set(['sidestepUp', 'sidestepDown', 'backstep', 'quick', 'heavy', 'thrust']);

function isSustainedAction(actionName) {
  return SUSTAINED_ACTIONS.has(actionName);
}

function isSingleCommitAction(actionName) {
  return SINGLE_COMMIT_ACTIONS.has(actionName);
}

function createLegalActionMask(fighter) {
  const mask = NEURAL_ACTIONS.map(() => false);
  const idleIndex = NEURAL_ACTIONS.indexOf('idle');
  mask[idleIndex] = true;

  if (!fighter?.fsm?.isActionable) {
    return mask;
  }

  for (const actionName of ['forward', 'back', 'backstep', 'block', 'quick', 'heavy', 'thrust']) {
    const index = NEURAL_ACTIONS.indexOf(actionName);
    if (index >= 0) mask[index] = true;
  }

  if (!fighter.fsm.isSidestepRecovery) {
    const upIndex = NEURAL_ACTIONS.indexOf('sidestepUp');
    const downIndex = NEURAL_ACTIONS.indexOf('sidestepDown');
    if (upIndex >= 0) mask[upIndex] = true;
    if (downIndex >= 0) mask[downIndex] = true;
  }

  return mask;
}

function createEmptyInput() {
  return {
    held: {
      left: false,
      right: false,
      block: false,
    },
    pressed: {
      sidestepUp: false,
      sidestepDown: false,
      backstep: false,
      quick: false,
      heavy: false,
      thrust: false,
      block: false,
    },
  };
}

function actionToInput(actionName) {
  const input = createEmptyInput();
  switch (actionName) {
    case 'forward':
      input.held.right = true;
      break;
    case 'back':
      input.held.left = true;
      break;
    case 'sidestepUp':
      input.pressed.sidestepUp = true;
      break;
    case 'sidestepDown':
      input.pressed.sidestepDown = true;
      break;
    case 'backstep':
      input.pressed.backstep = true;
      break;
    case 'block':
      input.held.block = true;
      input.pressed.block = true;
      break;
    case 'quick':
      input.pressed.quick = true;
      break;
    case 'heavy':
      input.pressed.heavy = true;
      break;
    case 'thrust':
      input.pressed.thrust = true;
      break;
  }
  return input;
}

export class NeuralPolicyController {
  constructor(policy, options = {}) {
    this.policy = policy;
    this.temperature = options.temperature ?? 0.7;
    this.stochastic = options.stochastic ?? true;
    this.decisionIntervalFrames = options.decisionIntervalFrames ?? 1;
    this.minActionHoldFrames = options.minActionHoldFrames ?? 7;
    this.currentActionIndex = 0;
    this.currentActionIssued = false;
    this.lastDecisionFrame = -9999;
    this.actionHoldUntilFrame = -9999;
    this.lastActionable = false;
    this.lastState = FighterState.IDLE;
    this.stats = this._createStats();
  }

  reset() {
    this.currentActionIndex = 0;
    this.currentActionIssued = false;
    this.lastDecisionFrame = -9999;
    this.actionHoldUntilFrame = -9999;
    this.lastActionable = false;
    this.lastState = FighterState.IDLE;
  }

  resetMatchStats() {
    this.stats = this._createStats();
  }

  getMatchStats() {
    return {
      decisionCount: this.stats.decisionCount,
      committedActionCount: this.stats.committedActionCount,
      actionSelections: { ...this.stats.actionSelections },
      actionFrames: { ...this.stats.actionFrames },
      stateFrames: { ...this.stats.stateFrames },
    };
  }

  step(fighter, opponent, sim, dt) {
    if (!fighter || !opponent || !sim) return;

    const actionable = Boolean(fighter.fsm?.isActionable);
    const regainedActionable = actionable && (!this.lastActionable || fighter.state !== this.lastState);
    const holdExpired = sim.frameCount >= this.actionHoldUntilFrame;
    const shouldDecide = actionable && (regainedActionable || (
      holdExpired &&
      (sim.frameCount - this.lastDecisionFrame) >= this.decisionIntervalFrames
    ));

    if (shouldDecide) {
      const observation = encodeObservation(fighter, opponent, sim);
      const actionMask = createLegalActionMask(fighter);
      const { actionIndex } = this.policy.act(observation, {
        temperature: this.temperature,
        stochastic: this.stochastic,
        actionMask,
      });
      this.currentActionIndex = actionIndex;
      this.currentActionIssued = false;
      this.lastDecisionFrame = sim.frameCount;
      this.actionHoldUntilFrame = sim.frameCount + this._getHoldFrames(actionIndex);
      const actionName = NEURAL_ACTIONS[actionIndex] ?? 'idle';
      this.stats.decisionCount++;
      this.stats.actionSelections[actionName] = (this.stats.actionSelections[actionName] || 0) + 1;
      if (isSingleCommitAction(actionName)) {
        this.stats.committedActionCount++;
      }
    }

    const actionName = NEURAL_ACTIONS[this.currentActionIndex] ?? 'idle';
    const input = this._buildInputForFrame(actionName, fighter);
    this.stats.actionFrames[actionName] = (this.stats.actionFrames[actionName] || 0) + 1;
    this.stats.stateFrames[fighter.state] = (this.stats.stateFrames[fighter.state] || 0) + 1;
    sim.applyInputFrame(fighter, opponent, input, dt);

    this.lastActionable = actionable;
    this.lastState = fighter.state;
  }

  _getHoldFrames(actionIndex) {
    const actionName = NEURAL_ACTIONS[actionIndex] ?? 'idle';
    if (actionName === 'quick' || actionName === 'heavy' || actionName === 'thrust') return this.minActionHoldFrames + 1;
    if (actionName === 'sidestepUp' || actionName === 'sidestepDown' || actionName === 'backstep') return this.minActionHoldFrames;
    if (actionName === 'block') return this.minActionHoldFrames + 2;
    return this.minActionHoldFrames;
  }

  _buildInputForFrame(actionName, fighter) {
    if (actionName === 'block') {
      if (!fighter.fsm?.isActionable && fighter.state !== FighterState.BLOCK) {
        return createEmptyInput();
      }
      const input = createEmptyInput();
      input.held.block = true;
      if (!this.currentActionIssued && fighter.fsm?.isActionable) {
        input.pressed.block = true;
        this.currentActionIssued = true;
      }
      return input;
    }

    if (isSustainedAction(actionName)) {
      if (!fighter.fsm?.isActionable) {
        return createEmptyInput();
      }
      return actionToInput(actionName);
    }

    if (!fighter.fsm?.isActionable || this.currentActionIssued || !isSingleCommitAction(actionName)) {
      return createEmptyInput();
    }

    this.currentActionIssued = true;
    return actionToInput(actionName);
  }

  _createStats() {
    const actionSelections = Object.fromEntries(NEURAL_ACTIONS.map((action) => [action, 0]));
    const actionFrames = Object.fromEntries(NEURAL_ACTIONS.map((action) => [action, 0]));
    return {
      decisionCount: 0,
      committedActionCount: 0,
      actionSelections,
      actionFrames,
      stateFrames: {},
    };
  }
}
