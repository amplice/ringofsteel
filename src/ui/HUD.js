import { ROUNDS_TO_WIN } from '../core/Constants.js';

export class HUD {
  constructor() {
    this.el = document.getElementById('hud');
    this.roundAnnounce = document.getElementById('round-announce');
    this.roundText = this.roundAnnounce.querySelector('.round-text');
    this.fightText = this.roundAnnounce.querySelector('.fight-text');
    this.onlineStrip = document.getElementById('online-hud-strip');
    this.onlineStatus = document.getElementById('online-hud-status');
    this.onlineCode = document.getElementById('online-hud-code');
    this.onlinePing = document.getElementById('online-hud-ping');
    this.p1Name = document.querySelector('.fighter-hud.p1 .fighter-name');
    this.p2Name = document.querySelector('.fighter-hud.p2 .fighter-name');
    this.p1Loadout = document.getElementById('p1-loadout');
    this.p2Loadout = document.getElementById('p2-loadout');
    this.roundsToWin = ROUNDS_TO_WIN;
  }

  setRoundsToWin(rounds) {
    this.roundsToWin = rounds || ROUNDS_TO_WIN;
  }

  show() {
    this.el.style.display = 'block';
  }

  hide() {
    this.el.style.display = 'none';
  }

  setOnlineMeta({ visible = false, status = 'Offline', code = '------', pingMs = null } = {}) {
    if (!this.onlineStrip || !this.onlineStatus || !this.onlineCode || !this.onlinePing) return;
    this.onlineStrip.style.display = visible ? 'flex' : 'none';
    this.onlineStatus.textContent = status;
    this.onlineCode.textContent = code || '------';
    this.onlinePing.textContent = Number.isFinite(pingMs) ? `${Math.round(pingMs)} ms` : '--';
  }

  setFighterNames(p1Name = 'PLAYER 1', p2Name = 'PLAYER 2') {
    if (this.p1Name) this.p1Name.textContent = p1Name;
    if (this.p2Name) this.p2Name.textContent = p2Name;
  }

  setFighterLoadouts(p1 = null, p2 = null) {
    this._setLoadout(this.p1Loadout, p1);
    this._setLoadout(this.p2Loadout, p2);
  }

  _setLoadout(el, detail) {
    if (!el) return;
    const name = detail?.displayName ?? 'Fighter';
    const weapon = detail?.weapon?.stats?.name ?? 'Weapon';
    el.textContent = `${name} / ${weapon}`.toUpperCase();
  }

  updateRoundPips(p1Wins, p2Wins) {
    this._renderPips('p1-pips', p1Wins);
    this._renderPips('p2-pips', p2Wins);
  }

  _renderPips(containerId, wins) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < this.roundsToWin; i++) {
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
    this.setOnlineMeta({ visible: false });
  }
}
