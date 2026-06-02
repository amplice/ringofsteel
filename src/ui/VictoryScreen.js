export class VictoryScreen {
  constructor() {
    this.el = document.getElementById('victory-screen');
    this.winnerText = document.getElementById('winner-text');
    this.scoreText = document.getElementById('final-score');
    this.portrait = document.getElementById('victory-portrait-img');
    this.onContinue = null;
    this._previewImages = new Map();
    this._keyHandler = this._onKey.bind(this);
  }

  setCharacterPreviews(previewImages) {
    this._previewImages = previewImages instanceof Map ? new Map(previewImages) : new Map();
  }

  show(winnerName, p1Score, p2Score, detail = {}) {
    this.winnerText.textContent = `${winnerName} WINS`;
    this.scoreText.textContent = `${p1Score} - ${p2Score}`;
    this._setPortrait(detail.winnerCharId);
    this.el.style.display = 'flex';
    window.addEventListener('keydown', this._keyHandler);
  }

  hide() {
    this.el.style.display = 'none';
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

  _onKey(e) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (this.onContinue) this.onContinue();
    }
  }
}
