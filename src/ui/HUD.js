import { ROUNDS_TO_WIN } from '../core/Constants.js';

export class HUD {
  constructor() {
    this.el = document.getElementById('hud');
    this.roundAnnounce = document.getElementById('round-announce');
    this.roundText = this.roundAnnounce.querySelector('.round-text');
    this.fightText = this.roundAnnounce.querySelector('.fight-text');
  }

  show() {
    this.el.style.display = 'block';
  }

  hide() {
    this.el.style.display = 'none';
  }

  updateStance(playerIndex, stance) {
    const el = document.getElementById(playerIndex === 0 ? 'p1-stance' : 'p2-stance');
    if (el) el.textContent = stance.toUpperCase();
  }

  updateDamage(playerIndex, zones) {
    const containerId = playerIndex === 0 ? 'p1-body' : 'p2-body';
    const container = document.getElementById(containerId);
    if (!container) return;

    container.querySelectorAll('.body-zone').forEach(el => {
      const zone = el.dataset.zone;
      if (zones[zone] > 0) {
        el.classList.add('damaged');
      } else {
        el.classList.remove('damaged');
      }
    });
  }

  updateRoundPips(p1Wins, p2Wins) {
    this._renderPips('p1-pips', p1Wins);
    this._renderPips('p2-pips', p2Wins);
  }

  _renderPips(containerId, wins) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < ROUNDS_TO_WIN; i++) {
      const pip = document.createElement('div');
      pip.className = 'pip' + (i < wins ? ' won' : '');
      container.appendChild(pip);
    }
  }

  showRoundAnnounce(roundNum) {
    this.roundAnnounce.style.display = 'block';
    this.roundText.textContent = `ROUND ${roundNum}`;
    this.fightText.textContent = '';
  }

  showFight() {
    this.fightText.textContent = 'FIGHT!';
  }

  hideRoundAnnounce() {
    this.roundAnnounce.style.display = 'none';
  }

  reset() {
    this.hideRoundAnnounce();
    // Reset damage displays
    document.querySelectorAll('.body-zone').forEach(el => el.classList.remove('damaged'));
  }
}
