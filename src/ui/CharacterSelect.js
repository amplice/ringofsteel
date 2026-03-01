export class CharacterSelect {
  constructor() {
    this.el = document.getElementById('select-screen');
    this.onConfirm = null;

    this.mode = 'ai';
    this.difficulty = 'medium';
    this.p1Weapon = 'jian';
    this.p2Weapon = 'dao';

    this._setupButtons();
  }

  _setupButtons() {
    // Mode buttons
    document.querySelectorAll('#mode-options .select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#mode-options .select-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.mode = btn.dataset.mode;
        // Show/hide difficulty for AI mode
        document.getElementById('difficulty-section').style.display =
          this.mode === 'ai' ? 'block' : 'none';
      });
    });

    // Difficulty buttons
    document.querySelectorAll('#difficulty-options .select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#difficulty-options .select-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.difficulty = btn.dataset.diff;
      });
    });

    // P1 weapon buttons
    document.querySelectorAll('#p1-weapon-options .select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#p1-weapon-options .select-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.p1Weapon = btn.dataset.weapon;
      });
    });

    // P2 weapon buttons
    document.querySelectorAll('#p2-weapon-options .select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#p2-weapon-options .select-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.p2Weapon = btn.dataset.weapon;
      });
    });

    // Start button
    document.getElementById('start-fight-btn').addEventListener('click', () => {
      if (this.onConfirm) {
        this.onConfirm({
          mode: this.mode,
          difficulty: this.difficulty,
          p1Weapon: this.p1Weapon,
          p2Weapon: this.p2Weapon,
        });
      }
    });
  }

  show() {
    this.el.style.display = 'flex';
  }

  hide() {
    this.el.style.display = 'none';
  }
}
