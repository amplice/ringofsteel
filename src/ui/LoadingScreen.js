export class LoadingScreen {
  constructor() {
    this.el = document.getElementById('loading-screen');
    this.bar = document.getElementById('loading-bar-fill');
    this.status = document.getElementById('loading-status');
    this.percent = document.getElementById('loading-percent');
  }

  show() {
    if (!this.el) return;
    this.el.style.display = 'flex';
  }

  hide() {
    if (!this.el) return;
    this.el.style.display = 'none';
  }

  setProgress(value, label = '') {
    const clamped = Math.max(0, Math.min(1, value));
    const pct = Math.round(clamped * 100);
    if (this.bar) this.bar.style.width = `${pct}%`;
    if (this.percent) this.percent.textContent = `${pct}%`;
    if (this.status && label) this.status.textContent = label;
  }
}
