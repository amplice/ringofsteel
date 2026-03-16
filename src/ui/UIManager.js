import { LoadingScreen } from './LoadingScreen.js';
import { TitleScreen } from './TitleScreen.js';
import { CharacterSelect } from './CharacterSelect.js';
import { HUD } from './HUD.js';
import { VictoryScreen } from './VictoryScreen.js';

export class UIManager {
  constructor() {
    this.loading = new LoadingScreen();
    this.title = new TitleScreen();
    this.select = new CharacterSelect();
    this.hud = new HUD();
    this.victory = new VictoryScreen();
    this.animPlayer = null;
    this._animPlayerPromise = null;
  }

  async ensureAnimPlayer() {
    if (this.animPlayer) return this.animPlayer;

    if (!this._animPlayerPromise) {
      this._animPlayerPromise = import('./AnimPlayerScreen.js').then(({ AnimPlayerScreen }) => {
        this.animPlayer = new AnimPlayerScreen();
        return this.animPlayer;
      });
    }

    return this._animPlayerPromise;
  }

  hideAll() {
    this.loading.hide();
    this.title.hide();
    this.select.hide();
    this.hud.hide();
    this.victory.hide();
    if (this.animPlayer) {
      this.animPlayer.hide();
    }
  }

  showLoading(progress = 0, label = 'Loading...') {
    this.hideAll();
    this.loading.show();
    this.loading.setProgress(progress, label);
  }

  showTitle() {
    this.hideAll();
    this.title.show();
  }

  showSelect() {
    this.hideAll();
    this.select.show();
  }

  showHUD() {
    this.hideAll();
    this.hud.show();
  }

  showVictory(winner, p1Score, p2Score) {
    this.hud.hide();
    this.victory.show(winner, p1Score, p2Score);
  }

  async showAnimPlayer() {
    this.hideAll();
    const animPlayer = await this.ensureAnimPlayer();
    animPlayer.show();
    return animPlayer;
  }
}
