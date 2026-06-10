export class PauseMenu {
  constructor() {
    this.el = document.getElementById('pause-screen');
    this.resumeBtn = document.getElementById('pause-resume-btn');
    this.dummyBtn = document.getElementById('pause-dummy-btn');
    this.selectBtn = document.getElementById('pause-select-btn');
    this.titleBtn = document.getElementById('pause-title-btn');
    this.onResume = null;
    this.onDummyCycle = null;
    this.onCharacterSelect = null;
    this.onMainMenu = null;
    this._focusEl = null;
    this._keyHandler = this._onKey.bind(this);

    this.resumeBtn?.addEventListener('click', () => {
      if (this.onResume) this.onResume();
    });
    this.dummyBtn?.addEventListener('click', () => {
      if (this.onDummyCycle) this.onDummyCycle();
    });
    this.selectBtn?.addEventListener('click', () => {
      if (this.onCharacterSelect) this.onCharacterSelect();
    });
    this.titleBtn?.addEventListener('click', () => {
      if (this.onMainMenu) this.onMainMenu();
    });
  }

  get visible() {
    return this.el ? this.el.style.display === 'flex' : false;
  }

  // Show the dummy-behavior control (training mode only) and sync its label.
  setDummyControl(visible, mode = 'manual') {
    if (!this.dummyBtn) return;
    this.dummyBtn.style.display = visible ? '' : 'none';
    this.dummyBtn.textContent = `DUMMY: ${mode.toUpperCase()}`;
  }

  show() {
    if (!this.el) return;
    this.el.style.display = 'flex';
    this._setFocus(this.resumeBtn ?? null);
    window.addEventListener('keydown', this._keyHandler);
  }

  hide() {
    if (!this.el) return;
    this.el.style.display = 'none';
    this._setFocus(null);
    window.removeEventListener('keydown', this._keyHandler);
  }

  _buttons() {
    return [this.resumeBtn, this.dummyBtn, this.selectBtn, this.titleBtn].filter(
      (btn) => btn && btn.offsetParent !== null && !btn.disabled
    );
  }

  _setFocus(el) {
    if (this._focusEl === el) return;
    this._focusEl?.classList.remove('gp-focus');
    this._focusEl = el ?? null;
    if (el) el.classList.add('gp-focus');
  }

  _moveFocus(dir) {
    const buttons = this._buttons();
    if (!buttons.length) return;
    const current = buttons.indexOf(this._focusEl);
    const next = current === -1 ? 0 : (current + dir + buttons.length) % buttons.length;
    this._setFocus(buttons[next]);
  }

  _onKey(e) {
    switch (e.code) {
      case 'ArrowLeft':
      case 'ArrowUp':
        this._moveFocus(-1);
        e.preventDefault();
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        this._moveFocus(1);
        e.preventDefault();
        break;
      case 'Enter':
      case 'NumpadEnter': {
        const target = this._buttons().includes(this._focusEl) ? this._focusEl : this.resumeBtn;
        target?.click();
        break;
      }
      case 'Escape':
        if (this.onResume) this.onResume();
        break;
    }
  }
}
