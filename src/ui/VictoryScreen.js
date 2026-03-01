export class VictoryScreen {
  constructor() {
    this.el = document.getElementById('victory-screen');
    this.winnerText = document.getElementById('winner-text');
    this.scoreText = document.getElementById('final-score');
    this.onContinue = null;
    this._keyHandler = this._onKey.bind(this);
  }

  show(winnerName, p1Score, p2Score) {
    this.winnerText.textContent = `${winnerName} WINS`;
    this.scoreText.textContent = `${p1Score} - ${p2Score}`;
    this.el.style.display = 'flex';
    window.addEventListener('keydown', this._keyHandler);
  }

  hide() {
    this.el.style.display = 'none';
    window.removeEventListener('keydown', this._keyHandler);
  }

  _onKey(e) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (this.onContinue) this.onContinue();
    }
  }
}
