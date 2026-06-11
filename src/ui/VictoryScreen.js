export class VictoryScreen {
  constructor() {
    this.el = document.getElementById('victory-screen');
    this.winnerText = document.getElementById('winner-text');
    this.scoreText = document.getElementById('final-score');
    this.portrait = document.getElementById('victory-portrait-img');
    this.statsEl = document.getElementById('victory-stats');
    this.rematchBtn = document.getElementById('victory-rematch-btn');
    this.replayBtn = document.getElementById('victory-replay-btn');
    this.clipBtn = document.getElementById('victory-clip-btn');
    this.selectBtn = document.getElementById('victory-select-btn');
    this.titleBtn = document.getElementById('victory-title-btn');
    this.onContinue = null;
    this.onRematch = null;
    this.onReplay = null;
    this.onSaveClip = null;
    this.onCharacterSelect = null;
    this._previewImages = new Map();
    this._focusEl = null;
    this._keyHandler = this._onKey.bind(this);

    this.rematchBtn?.addEventListener('click', () => {
      if (!this._inGrace() && this.onRematch) this.onRematch();
    });
    this.replayBtn?.addEventListener('click', () => {
      if (!this._inGrace() && this.onReplay) this.onReplay();
    });
    this.clipBtn?.addEventListener('click', () => {
      if (!this._inGrace() && this.onSaveClip) this.onSaveClip();
    });
    this.selectBtn?.addEventListener('click', () => {
      if (!this._inGrace() && this.onCharacterSelect) this.onCharacterSelect();
    });
    this.titleBtn?.addEventListener('click', () => {
      if (!this._inGrace() && this.onContinue) this.onContinue();
    });
  }

  // Brief input grace after showing so KO-mashing or a replay skip tap can't
  // immediately trigger a victory action.
  _inGrace() {
    return performance.now() - (this._shownAt ?? 0) < 600;
  }

  // The opponent has already readied up — make accepting one press away.
  setOpponentWantsRematch() {
    if (!this.rematchBtn || this.rematchBtn.style.display === 'none') return;
    if (this.rematchBtn.disabled) return; // we already requested; match is starting
    this.rematchBtn.textContent = 'ACCEPT REMATCH';
    this._setFocus(this.rematchBtn);
  }

  // Online rematch requested: lock the button until the opponent responds.
  // Focus is cleared (not moved) so a key-repeat Enter can't fall onto
  // CHANGE FIGHTERS and abort the rematch.
  setRematchWaiting(label = 'WAITING...') {
    if (!this.rematchBtn) return;
    this.rematchBtn.textContent = label;
    this.rematchBtn.disabled = true;
    this._setFocus(null);
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
    if (this.replayBtn) {
      this.replayBtn.style.display = detail.allowReplay ? '' : 'none';
    }
    if (this.clipBtn) {
      const recordable =
        typeof MediaRecorder !== 'undefined' &&
        typeof HTMLCanvasElement !== 'undefined' &&
        Boolean(HTMLCanvasElement.prototype.captureStream);
      this.clipBtn.style.display = detail.allowReplay && recordable ? '' : 'none';
    }
    this.el.style.display = 'flex';
    this._shownAt = performance.now();
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
    return [this.rematchBtn, this.replayBtn, this.clipBtn, this.selectBtn, this.titleBtn].filter(
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
    // Grace window: ignore confirm/back right after showing so attack-button
    // mashing through the KO can't blow past the victory screen.
    const inGrace = this._inGrace();
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
        if (inGrace) break;
        const buttons = this._buttons();
        let target = buttons.includes(this._focusEl) ? this._focusEl : null;
        if (!target) {
          // No focus while waiting on an online rematch: do nothing rather
          // than falling through to another action.
          if (this.rematchBtn?.disabled) break;
          target = buttons[0];
        }
        target?.click();
        break;
      }
      case 'Escape':
        if (inGrace) break;
        if (this.onContinue) this.onContinue();
        break;
    }
  }
}
