import { TitleScreen } from './TitleScreen.js';
import { CharacterSelect } from './CharacterSelect.js';
import { HUD } from './HUD.js';
import { VictoryScreen } from './VictoryScreen.js';
import { AnimPlayerScreen } from './AnimPlayerScreen.js';

export class UIManager {
  constructor() {
    this.title = new TitleScreen();
    this.select = new CharacterSelect();
    this.hud = new HUD();
    this.victory = new VictoryScreen();
    this.animPlayer = new AnimPlayerScreen();
  }

  hideAll() {
    this.title.hide();
    this.select.hide();
    this.hud.hide();
    this.victory.hide();
    this.animPlayer.hide();
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

  showAnimPlayer() {
    this.hideAll();
    this.animPlayer.show();
  }
}
