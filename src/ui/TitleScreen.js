import { DEBUG_OPTIONS } from '../core/Constants.js';

export class TitleScreen {
  constructor() {
    this.el = document.getElementById('title-screen');
    this.onStart = null;
    this.onAnimPlayer = null;
    this.animPlayerBtn = document.getElementById('anim-player-btn');
    this.promptEl = this.el?.querySelector('.prompt') ?? null;
    this._keyHandler = this._onKey.bind(this);
    this._bindButtons();

    window.addEventListener('gamepadconnected', () => this._syncPrompt());
    window.addEventListener('gamepaddisconnected', () => this._syncPrompt());
    this._syncPrompt();
  }

  _syncPrompt() {
    if (!this.promptEl) return;
    const hasPad =
      typeof navigator !== 'undefined' &&
      typeof navigator.getGamepads === 'function' &&
      [...navigator.getGamepads()].some((pad) => pad && pad.connected);
    this.promptEl.textContent = hasPad ? 'PRESS ENTER OR Ⓐ TO BEGIN' : 'PRESS ENTER TO BEGIN';
  }

  _bindButtons() {
    if (!this.animPlayerBtn) return;
    this.animPlayerBtn.addEventListener('click', () => {
      if (this.onAnimPlayer) this.onAnimPlayer();
    });
  }

  show() {
    this.el.style.display = 'flex';
    this._syncAnimPlayerButton();
    window.addEventListener('keydown', this._keyHandler);
    if (!this._tapHandler) {
      // Tap/click anywhere starts the game — required on touch devices,
      // which have no Enter key.
      this._tapHandler = (e) => {
        if (e.target?.closest?.('#anim-player-btn')) return;
        if (this.onStart) this.onStart();
      };
      this.el.addEventListener('pointerdown', this._tapHandler);
    }
  }

  hide() {
    this.el.style.display = 'none';
    window.removeEventListener('keydown', this._keyHandler);
  }

  _onKey(e) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (this.onStart) this.onStart();
    }
    if (e.code === DEBUG_OPTIONS.toggleKey) {
      window.setTimeout(() => this._syncAnimPlayerButton(), 0);
    }
    if (e.code === 'KeyP') {
      if (this._isDebugEnabled() && this.onAnimPlayer) this.onAnimPlayer();
    }
  }

  _isDebugEnabled() {
    if (!DEBUG_OPTIONS.persistToggle) {
      return DEBUG_OPTIONS.overlayEnabled;
    }
    const saved = window.localStorage.getItem(DEBUG_OPTIONS.storageKey);
    if (saved == null) {
      return DEBUG_OPTIONS.overlayEnabled;
    }
    return saved === 'true';
  }

  _syncAnimPlayerButton() {
    if (!this.animPlayerBtn) return;
    this.animPlayerBtn.style.display = this._isDebugEnabled() ? 'inline-block' : 'none';
  }
}
