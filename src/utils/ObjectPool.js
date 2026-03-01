export class ObjectPool {
  constructor(factory, reset, initialSize = 50) {
    this.factory = factory;
    this.reset = reset;
    this.pool = [];
    this.active = [];

    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.factory());
    }
  }

  acquire() {
    let obj = this.pool.pop();
    if (!obj) {
      obj = this.factory();
    }
    this.active.push(obj);
    return obj;
  }

  release(obj) {
    const idx = this.active.indexOf(obj);
    if (idx !== -1) {
      this.active.splice(idx, 1);
      this.reset(obj);
      this.pool.push(obj);
    }
  }

  releaseAll() {
    while (this.active.length > 0) {
      const obj = this.active.pop();
      this.reset(obj);
      this.pool.push(obj);
    }
  }

  getActive() {
    return this.active;
  }
}
