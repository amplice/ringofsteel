import { DEBUG_OPTIONS } from '../core/Constants.js';

export class TitleScreen {
  constructor() {
    this.el = document.getElementById('title-screen');
    this.onStart = null;
    this.onAnimPlayer = null;
    this.animPlayerBtn = document.getElementById('anim-player-btn');
    this._keyHandler = this._onKey.bind(this);
    this._bindButtons();
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
