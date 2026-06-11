import { INPUT_BUFFER_SIZE, INPUT_BUFFER_WINDOW } from './Constants.js';
import { GamepadManager } from './GamepadManager.js';
import { TouchControls } from './TouchControls.js';

// Key bindings
const P1_KEYS = {
  right: 'KeyD',
  left: 'KeyA',
  sidestepUp: 'KeyW',
  sidestepDown: 'KeyS',
  quick: 'KeyJ',
  heavy: 'KeyK',
  thrust: 'KeyL',
  block: 'KeyI',
  backstep: 'Space',
};

const P2_KEYS = {
  right: 'ArrowLeft',
  left: 'ArrowRight',
  sidestepUp: 'ArrowDown',
  sidestepDown: 'ArrowUp',
  quick: 'BracketLeft',
  heavy: 'BracketRight',
  thrust: 'Backslash',
  block: 'Equal',
  backstep: 'ShiftRight',
};

export class InputManager {
  constructor() {
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.keysReleased = new Set();

    // Input buffers per player
    this.buffers = [[], []];

    this.gamepads = new GamepadManager();
    this.touch = new TouchControls();

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  _onKeyDown(e) {
    if (e._fromGamepad || e._synthetic) return;
    if (this._isEditableTarget(e.target)) return;
    if (!this.keysDown.has(e.code)) {
      this.keysPressed.add(e.code);
    }
    this.keysDown.add(e.code);
    e.preventDefault();
  }

  _onKeyUp(e) {
    if (e._fromGamepad || e._synthetic) return;
    if (this._isEditableTarget(e.target)) return;
    this.keysDown.delete(e.code);
    this.keysReleased.add(e.code);
    e.preventDefault();
  }

  _isEditableTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return Boolean(
      target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable]')
    );
  }

  update(frameCount) {
    for (const code of this.keysPressed) {
      const action1 = this._codeToAction(code, P1_KEYS);
      if (action1) {
        this.buffers[0].push({ action: action1, frame: frameCount });
        if (this.buffers[0].length > INPUT_BUFFER_SIZE) this.buffers[0].shift();
      }
      const action2 = this._codeToAction(code, P2_KEYS);
      if (action2) {
        this.buffers[1].push({ action: action2, frame: frameCount });
        if (this.buffers[1].length > INPUT_BUFFER_SIZE) this.buffers[1].shift();
      }
    }

    this.keysPressed.clear();
    this.keysReleased.clear();

    this.gamepads.update();
    for (let playerIndex = 0; playerIndex < 2; playerIndex++) {
      for (const action of this.gamepads.getPressedActions(playerIndex)) {
        this.buffers[playerIndex].push({ action, frame: frameCount });
        if (this.buffers[playerIndex].length > INPUT_BUFFER_SIZE) this.buffers[playerIndex].shift();
      }
    }

    // Touch overlay always drives player 1.
    for (const action of this.touch.consumePressed()) {
      this.buffers[0].push({ action, frame: frameCount });
      if (this.buffers[0].length > INPUT_BUFFER_SIZE) this.buffers[0].shift();
    }
  }

  _codeToAction(code, keyMap) {
    for (const [action, key] of Object.entries(keyMap)) {
      if (key === code) return action;
    }
    return null;
  }

  isHeld(playerIndex, action) {
    const keyMap = playerIndex === 0 ? P1_KEYS : P2_KEYS;
    const code = keyMap[action];
    if (code && this.keysDown.has(code)) return true;
    if (playerIndex === 0 && this.touch.isHeld(action)) return true;
    return this.gamepads.isHeld(playerIndex, action);
  }

  consumeBuffer(playerIndex, action, currentFrame) {
    const buffer = this.buffers[playerIndex];
    for (let i = buffer.length - 1; i >= 0; i--) {
      if (buffer[i].action === action && currentFrame - buffer[i].frame <= INPUT_BUFFER_WINDOW) {
        buffer.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  anyKeyPressed() {
    return this.keysDown.size > 0 || this.gamepads.anyButtonDown();
  }

  isKeyDown(code) {
    return this.keysDown.has(code);
  }

  clearBuffers() {
    this.buffers[0].length = 0;
    this.buffers[1].length = 0;
    this.keysPressed.clear();
    this.keysReleased.clear();
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}
