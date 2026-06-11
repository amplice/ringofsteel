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

// Menu navigation repeat for held directions, in 60Hz updates.
const MENU_REPEAT_DELAY = 24; // ~400ms before repeating
const MENU_REPEAT_INTERVAL = 9; // ~150ms between repeats

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
    this._menuPrev = [{}, {}];
    this._anyButtonDown = false;
    this._startEdge = false;
    // gamepad.index pinned per player slot, so one pad disconnecting
    // mid-match never shifts the other player's pad onto a different fighter.
    this._slotPadIndex = [null, null];
  }

  static available() {
    return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
  }

  update() {
    if (!GamepadManager.available()) return;

    const padsByIndex = new Map();
    for (const pad of navigator.getGamepads()) {
      if (pad && pad.connected) padsByIndex.set(pad.index, pad);
    }

    // Release slots whose pad vanished; assign new pads to empty slots only.
    for (let slot = 0; slot < 2; slot++) {
      const pinned = this._slotPadIndex[slot];
      if (pinned !== null && !padsByIndex.has(pinned)) this._slotPadIndex[slot] = null;
    }
    for (const index of [...padsByIndex.keys()].sort((a, b) => a - b)) {
      if (this._slotPadIndex.includes(index)) continue;
      const empty = this._slotPadIndex.indexOf(null);
      if (empty === -1) break;
      this._slotPadIndex[empty] = index;
    }

    this._anyButtonDown = false;
    this._startEdge = false;

    for (let slot = 0; slot < 2; slot++) {
      const player = this.players[slot];
      const pad = this._slotPadIndex[slot] !== null ? padsByIndex.get(this._slotPadIndex[slot]) : undefined;
      player.pressed.length = 0;

      if (!pad) {
        player.held = {};
        player.prev = {};
        this._menuPrev[slot] = {};
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
    const x = pad.axes[0] ?? 0;
    const y = pad.axes[1] ?? 0;

    // Start is the pause toggle (read via startPressed), not a menu confirm.
    const startNow = buttonDown(pad, BTN.start);
    if (startNow && !prev._start) this._startEdge = true;
    prev._start = startNow;

    // Raw (screen-space) directions — menu navigation is never side-inverted.
    const state = {
      Enter: buttonDown(pad, BTN.a),
      Escape: buttonDown(pad, BTN.b),
      ArrowLeft: buttonDown(pad, BTN.dpadLeft) || x < -STICK_DEADZONE,
      ArrowRight: buttonDown(pad, BTN.dpadRight) || x > STICK_DEADZONE,
      ArrowUp: buttonDown(pad, BTN.dpadUp) || y < -STICK_DEADZONE,
      ArrowDown: buttonDown(pad, BTN.dpadDown) || y > STICK_DEADZONE,
    };

    for (const code of Object.keys(state)) {
      const count = state[code] ? (prev[code] ?? 0) + 1 : 0;
      prev[code] = count;
      if (!count) continue;
      // Held directions repeat like OS key-repeat; Enter/Escape fire once.
      const repeat =
        code.startsWith('Arrow') &&
        count > MENU_REPEAT_DELAY &&
        (count - MENU_REPEAT_DELAY) % MENU_REPEAT_INTERVAL === 1;
      if (count === 1 || repeat) this._dispatchMenuKey(code);
    }
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

  // True for the single update in which any pad's Start button was pressed.
  startPressed() {
    return this._startEdge;
  }
}
