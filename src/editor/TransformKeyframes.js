const DEFAULT_TRANSFORM = { rotY: 0, posX: 0, posY: 0, posZ: 0, scale: 1 };

export class TransformKeyframes {
  constructor() {
    this._data = {}; // { clipName: [{ frame, rotY, posX, posY, posZ, scale }] }
  }

  setKeyframe(clipName, frame, { rotY, posX, posY, posZ, scale }) {
    if (!this._data[clipName]) this._data[clipName] = [];
    const arr = this._data[clipName];
    const idx = arr.findIndex(k => k.frame === frame);
    const kf = { frame, rotY, posX, posY, posZ, scale };
    if (idx >= 0) {
      arr[idx] = kf;
    } else {
      arr.push(kf);
      arr.sort((a, b) => a.frame - b.frame);
    }
  }

  removeKeyframe(clipName, frame) {
    if (!this._data[clipName]) return;
    this._data[clipName] = this._data[clipName].filter(k => k.frame !== frame);
  }

  getKeyframes(clipName) {
    return this._data[clipName] || [];
  }

  getTransformAtFrame(clipName, frame) {
    const arr = this._data[clipName];
    if (!arr || arr.length === 0) return { ...DEFAULT_TRANSFORM };

    // Before all keyframes
    if (frame <= arr[0].frame) return { ...arr[0] };
    // After all keyframes
    if (frame >= arr[arr.length - 1].frame) return { ...arr[arr.length - 1] };

    // Find bracketing keyframes
    for (let i = 0; i < arr.length - 1; i++) {
      const prev = arr[i];
      const next = arr[i + 1];
      if (frame >= prev.frame && frame <= next.frame) {
        const t = (frame - prev.frame) / (next.frame - prev.frame);
        return {
          rotY: this._lerpAngle(prev.rotY, next.rotY, t),
          posX: prev.posX + (next.posX - prev.posX) * t,
          posY: prev.posY + (next.posY - prev.posY) * t,
          posZ: prev.posZ + (next.posZ - prev.posZ) * t,
          scale: prev.scale + (next.scale - prev.scale) * t,
        };
      }
    }

    return { ...DEFAULT_TRANSFORM };
  }

  _lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return a + diff * t;
  }

  clearClip(clipName) {
    delete this._data[clipName];
  }

  exportJSON() {
    return JSON.stringify(this._data, null, 2);
  }

  importJSON(str) {
    try {
      this._data = JSON.parse(str);
    } catch (e) {
      console.warn('Failed to import keyframe JSON:', e);
    }
  }
}
