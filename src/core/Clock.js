import { FRAME_DURATION } from './Constants.js';

export class Clock {
  constructor() {
    this.timeScale = 1.0;
    this.accumulator = 0;
    this.lastTime = 0;
    this.frameCount = 0;
    this.fixedDt = FRAME_DURATION;
    this.started = false;
  }

  start() {
    this.lastTime = performance.now() / 1000;
    this.started = true;
  }

  /**
   * Returns number of fixed steps to run this frame
   */
  update() {
    const now = performance.now() / 1000;
    let rawDelta = now - this.lastTime;
    this.lastTime = now;

    // Clamp delta to avoid spiral of death
    if (rawDelta > 0.1) rawDelta = 0.1;

    const scaledDelta = rawDelta * this.timeScale;
    this.accumulator += scaledDelta;

    let steps = 0;
    while (this.accumulator >= this.fixedDt) {
      this.accumulator -= this.fixedDt;
      steps++;
      this.frameCount++;
    }

    return {
      steps,
      dt: this.fixedDt,
      alpha: this.accumulator / this.fixedDt,
      rawDelta,
      scaledDelta,
    };
  }

  setTimeScale(scale) {
    this.timeScale = scale;
  }

  reset() {
    this.accumulator = 0;
    this.frameCount = 0;
    this.timeScale = 1.0;
    this.lastTime = performance.now() / 1000;
  }
}
