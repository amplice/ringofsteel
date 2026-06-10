// Gamepad (controller) input using the standard-layout Gamepad API mapping.
//
// The first connected pad drives player 1, the second drives player 2.
// Action names match the keyboard maps in InputManager: directional actions
// for player 2 are pre-inverted exactly like P2's arrow keys, so
// Game._mapDefaultSideInput keeps working unchanged for both devices.
//
// Menus are DOM/keyboard driven, so confirm/back presses are re-dispatched as
// synthetic keydown events (Enter/Escape) tagged with `_fromGamepad` so
// InputManager can ignore them.

const STICK_DEADZONE = 0.35;

const BTN = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  start: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
};

const COMBAT_ACTIONS = [
  'left',
  'right',
  'sidestepUp',
  'sidestepDown',
  'quick',
  'heavy',
  'thrust',
  'block',
  'backstep',
];

function buttonDown(pad, index) {
  const btn = pad.buttons[index];
  return Boolean(btn && (btn.pressed || btn.value > 0.5));
}

function readActions(pad, invertDirections) {
  const x = pad.axes[0] ?? 0;
  const y = pad.axes[1] ?? 0;

  let moveLeft = buttonDown(pad, BTN.dpadLeft) || x < -STICK_DEADZONE;
  let moveRight = buttonDown(pad, BTN.dpadRight) || x > STICK_DEADZONE;
  let stepUp = buttonDown(pad, BTN.dpadUp) || y < -STICK_DEADZONE;
  let stepDown = buttonDown(pad, BTN.dpadDown) || y > STICK_DEADZONE;

  if (invertDirections) {
    [moveLeft, moveRight] = [moveRight, moveLeft];
    [stepUp, stepDown] = [stepDown, stepUp];
  }

  return {
    left: moveLeft,
    right: moveRight,
    sidestepUp: stepUp,
    sidestepDown: stepDown,
    quick: buttonDown(pad, BTN.x),
    heavy: buttonDown(pad, BTN.y),
    thrust: buttonDown(pad, BTN.b),
    block: buttonDown(pad, BTN.rb) || buttonDown(pad, BTN.lb),
    backstep: buttonDown(pad, BTN.a),
  };
}

export class GamepadManager {
  constructor() {
    // Per player slot: current action state, previous action state, pressed edges
    this.players = [
      { held: {}, prev: {}, pressed: [] },
      { held: {}, prev: {}, pressed: [] },
    ];
    this._menuPrev = [{ confirm: false, back: false }, { confirm: false, back: false }];
    this._anyButtonDown = false;
  }

  static available() {
    return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
  }

  update() {
    if (!GamepadManager.available()) return;

    const pads = [];
    for (const pad of navigator.getGamepads()) {
      if (pad && pad.connected) pads.push(pad);
      if (pads.length === 2) break;
    }

    this._anyButtonDown = false;

    for (let slot = 0; slot < 2; slot++) {
      const player = this.players[slot];
      const pad = pads[slot];
      player.pressed.length = 0;

      if (!pad) {
        player.held = {};
        player.prev = {};
        this._menuPrev[slot].confirm = false;
        this._menuPrev[slot].back = false;
        continue;
      }

      const held = readActions(pad, slot === 1);
      for (const action of COMBAT_ACTIONS) {
        if (held[action] && !player.prev[action]) {
          player.pressed.push(action);
        }
      }
      player.prev = player.held = held;

      if (pad.buttons.some((btn) => btn.pressed)) {
        this._anyButtonDown = true;
      }

      this._updateMenuKeys(slot, pad);
    }
  }

  _updateMenuKeys(slot, pad) {
    const prev = this._menuPrev[slot];
    const confirm = buttonDown(pad, BTN.a) || buttonDown(pad, BTN.start);
    const back = buttonDown(pad, BTN.b);

    if (confirm && !prev.confirm) this._dispatchMenuKey('Enter');
    if (back && !prev.back) this._dispatchMenuKey('Escape');

    prev.confirm = confirm;
    prev.back = back;
  }

  _dispatchMenuKey(code) {
    const event = new KeyboardEvent('keydown', { code, key: code, bubbles: true });
    event._fromGamepad = true;
    window.dispatchEvent(event);
  }

  isHeld(playerIndex, action) {
    return Boolean(this.players[playerIndex]?.held[action]);
  }

  getPressedActions(playerIndex) {
    return this.players[playerIndex]?.pressed ?? [];
  }

  anyButtonDown() {
    return this._anyButtonDown;
  }
}
