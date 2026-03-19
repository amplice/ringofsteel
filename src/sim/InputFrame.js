export const INPUT_HELD_ACTIONS = Object.freeze([
  'left',
  'right',
  'block',
]);

export const INPUT_PRESSED_ACTIONS = Object.freeze([
  'quick',
  'heavy',
  'thrust',
  'sidestepUp',
  'sidestepDown',
  'backstep',
  'block',
]);

export function createEmptyInputFrame(frame = 0) {
  const held = {};
  const pressed = {};

  for (const action of INPUT_HELD_ACTIONS) held[action] = false;
  for (const action of INPUT_PRESSED_ACTIONS) pressed[action] = false;

  return { frame, held, pressed };
}

export function captureInputFrame(inputManager, playerIndex, frame) {
  const input = createEmptyInputFrame(frame);

  for (const action of INPUT_HELD_ACTIONS) {
    input.held[action] = inputManager.isHeld(playerIndex, action);
  }

  for (const action of INPUT_PRESSED_ACTIONS) {
    input.pressed[action] = inputManager.consumeBuffer(playerIndex, action, frame);
  }

  return input;
}
