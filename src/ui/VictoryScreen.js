export class VictoryScreen {
  constructor() {
    this.el = document.getElementById('victory-screen');
    this.winnerText = document.getElementById('winner-text');
    this.scoreText = document.getElementById('final-score');
    this.portrait = document.getElementById('victory-portrait-img');
    this.statsEl = document.getElementById('victory-stats');
    this.rematchBtn = document.getElementById('victory-rematch-btn');
    this.selectBtn = document.getElementById('victory-select-btn');
    this.titleBtn = document.getElementById('victory-title-btn');
    this.onContinue = null;
    this.onRematch = null;
    this.onCharacterSelect = null;
    this._previewImages = new Map();
    this._focusEl = null;
    this._keyHandler = this._onKey.bind(this);

    this.rematchBtn?.addEventListener('click', () => {
      if (this.onRematch) this.onRematch();
    });
    this.selectBtn?.addEventListener('click', () => {
      if (this.onCharacterSelect) this.onCharacterSelect();
    });
    this.titleBtn?.addEventListener('click', () => {
      if (this.onContinue) this.onContinue();
    });
  }

  // The opponent has already readied up — make accepting one press away.
  setOpponentWantsRematch() {
    if (!this.rematchBtn || this.rematchBtn.style.display === 'none') return;
    if (this.rematchBtn.disabled) return; // we already requested; match is starting
    this.rematchBtn.textContent = 'ACCEPT REMATCH';
    this._setFocus(this.rematchBtn);
  }

  // Online rematch requested: lock the button until the opponent responds.
  setRematchWaiting(label = 'WAITING...') {
    if (!this.rematchBtn) return;
    this.rematchBtn.textContent = label;
    this.rematchBtn.disabled = true;
    if (this._focusEl === this.rematchBtn) {
      this._setFocus(this._buttons()[0] ?? null);
    }
  }

  setCharacterPreviews(previewImages) {
    this._previewImages = previewImages instanceof Map ? new Map(previewImages) : new Map();
  }

  show(winnerName, p1Score, p2Score, detail = {}) {
    this.winnerText.textContent = detail.title ?? `${winnerName} WINS`;
    this.scoreText.textContent = detail.subtitle ?? `${p1Score} - ${p2Score}`;
    if (this.statsEl) this.statsEl.textContent = detail.stats ?? '';
    this._setPortrait(detail.winnerCharId);
    if (this.rematchBtn) {
      this.rematchBtn.style.display = detail.allowRematch === false ? 'none' : '';
      this.rematchBtn.textContent = detail.primaryLabel ?? 'REMATCH';
      this.rematchBtn.disabled = false;
    }
    this.el.style.display = 'flex';
    this._setFocus(this._buttons()[0] ?? null);
    window.addEventListener('keydown', this._keyHandler);
  }

  hide() {
    this.el.style.display = 'none';
    this._setFocus(null);
    window.removeEventListener('keydown', this._keyHandler);
  }

  _setPortrait(charId) {
    if (!this.portrait) return;
    const src = this._previewImages.get(charId);
    if (src) {
      this.portrait.src = src;
      this.portrait.classList.add('ready');
    } else {
      this.portrait.removeAttribute('src');
      this.portrait.classList.remove('ready');
    }
  }

  _buttons() {
    return [this.rematchBtn, this.selectBtn, this.titleBtn].filter(
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
        const target = this._buttons().includes(this._focusEl) ? this._focusEl : this._buttons()[0];
        target?.click();
        break;
      }
      case 'Escape':
        if (this.onContinue) this.onContinue();
        break;
    }
  }
}
