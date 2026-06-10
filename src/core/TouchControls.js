// Touch overlay for combat: a virtual stick on the left half (walk via
// horizontal drag, flick up/down to sidestep) and an action cluster on the
// right. Feeds InputManager exactly like GamepadManager does — held state
// plus consumable pressed edges, always for player 1.

const WALK_THRESHOLD_PX = 22;
const STEP_FIRE_PX = 42;
const STEP_REARM_PX = 24;

export class TouchControls {
  constructor() {
    this.available =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator?.maxTouchPoints ?? 0) > 0);

    this.el = document.getElementById('touch-controls');
    this.stickZone = document.getElementById('touch-stick-zone');
    this.stickBase = document.getElementById('touch-stick-base');
    this.stickNub = document.getElementById('touch-stick-nub');

    this.held = {};
    this._pressed = [];
    this._stickPointer = null;
    this._stickOrigin = { x: 0, y: 0 };
    this._stepArmed = { up: true, down: true };

    if (!this.available || !this.el) return;
    this._bindStick();
    this._bindButtons();
  }

  show() {
    if (this.available && this.el) this.el.classList.add('active');
  }

  hide() {
    if (!this.el) return;
    this.el.classList.remove('active');
    this.held = {};
    this._pressed.length = 0;
    this._stickPointer = null;
    if (this.stickBase) this.stickBase.style.display = 'none';
  }

  isHeld(action) {
    return Boolean(this.held[action]);
  }

  consumePressed() {
    if (!this._pressed.length) return [];
    const drained = [...this._pressed];
    this._pressed.length = 0;
    return drained;
  }

  _bindStick() {
    const zone = this.stickZone;
    if (!zone) return;

    zone.addEventListener('pointerdown', (e) => {
      if (this._stickPointer !== null) return;
      this._stickPointer = e.pointerId;
      this._stickOrigin = { x: e.clientX, y: e.clientY };
      this._stepArmed = { up: true, down: true };
      if (this.stickBase) {
        this.stickBase.style.display = 'block';
        this.stickBase.style.left = `${e.clientX}px`;
        this.stickBase.style.top = `${e.clientY}px`;
      }
      this._moveNub(0, 0);
      zone.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._stickPointer) return;
      const dx = e.clientX - this._stickOrigin.x;
      const dy = e.clientY - this._stickOrigin.y;

      this.held.left = dx < -WALK_THRESHOLD_PX;
      this.held.right = dx > WALK_THRESHOLD_PX;

      if (dy < -STEP_FIRE_PX && this._stepArmed.up) {
        this._pressed.push('sidestepUp');
        this._stepArmed.up = false;
      } else if (dy > -STEP_REARM_PX) {
        this._stepArmed.up = true;
      }
      if (dy > STEP_FIRE_PX && this._stepArmed.down) {
        this._pressed.push('sidestepDown');
        this._stepArmed.down = false;
      } else if (dy < STEP_REARM_PX) {
        this._stepArmed.down = true;
      }

      this._moveNub(dx, dy);
      e.preventDefault();
    });

    const release = (e) => {
      if (e.pointerId !== this._stickPointer) return;
      this._stickPointer = null;
      this.held.left = false;
      this.held.right = false;
      if (this.stickBase) this.stickBase.style.display = 'none';
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
  }

  _moveNub(dx, dy) {
    if (!this.stickNub) return;
    const clamp = (v) => Math.max(-40, Math.min(40, v));
    this.stickNub.style.transform = `translate(calc(-50% + ${clamp(dx)}px), calc(-50% + ${clamp(dy)}px))`;
  }

  _bindButtons() {
    for (const btn of this.el.querySelectorAll('[data-taction]')) {
      const action = btn.dataset.taction;
      btn.addEventListener('pointerdown', (e) => {
        this._pressed.push(action);
        this.held[action] = true;
        btn.classList.add('pressed');
        btn.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      const release = () => {
        this.held[action] = false;
        btn.classList.remove('pressed');
      };
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
    }
  }
}
