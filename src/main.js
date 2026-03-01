import { Game } from './Game.js';

const game = new Game();
game.init().catch(err => {
  console.error('Failed to initialize game:', err);
  document.body.innerHTML = `<div style="color:red;padding:20px;font-family:monospace">
    Failed to initialize: ${err.message}
  </div>`;
});
