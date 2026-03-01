export class ScreenEffects {
  constructor() {
    this.flashEl = document.getElementById('screen-flash');
    this.shakeOffset = { x: 0, y: 0 };
    this.hitstopFrames = 0;
    this.onHitstop = false;
  }

  flash(color = 'white', duration = 0.1) {
    if (!this.flashEl) return;
    this.flashEl.style.background = color;
    this.flashEl.style.opacity = '0.6';
    this.flashEl.style.transition = 'none';

    requestAnimationFrame(() => {
      this.flashEl.style.transition = `opacity ${duration}s ease-out`;
      this.flashEl.style.opacity = '0';
    });
  }

  flashRed() {
    this.flash('rgba(180, 20, 20, 0.5)', 0.3);
  }

  flashWhite() {
    this.flash('rgba(255, 255, 255, 0.4)', 0.15);
  }

  startHitstop(frames) {
    this.hitstopFrames = frames;
    this.onHitstop = true;
  }

  update() {
    if (this.hitstopFrames > 0) {
      this.hitstopFrames--;
      this.onHitstop = true;
    } else {
      this.onHitstop = false;
    }
    return this.onHitstop;
  }

  reset() {
    this.hitstopFrames = 0;
    this.onHitstop = false;
    if (this.flashEl) this.flashEl.style.opacity = '0';
  }
}
