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
    this.decisionIntervalFrames = options.decisionIntervalFrames ?? 3;
    this.currentActionIndex = 0;
    this.lastDecisionFrame = -9999;
  }

  reset() {
    this.currentActionIndex = 0;
    this.lastDecisionFrame = -9999;
  }

  step(fighter, opponent, sim, dt) {
    if (!fighter || !opponent || !sim) return;

    const shouldDecide = (sim.frameCount - this.lastDecisionFrame) >= this.decisionIntervalFrames;
    if (shouldDecide) {
      const observation = encodeObservation(fighter, opponent, sim);
      const { actionIndex } = this.policy.act(observation, {
        temperature: this.temperature,
        stochastic: this.stochastic,
      });
      this.currentActionIndex = actionIndex;
      this.lastDecisionFrame = sim.frameCount;
    }

    const actionName = NEURAL_ACTIONS[this.currentActionIndex] ?? 'idle';
    const input = actionToInput(actionName);
    sim.applyInputFrame(fighter, opponent, input, dt);
  }
}
