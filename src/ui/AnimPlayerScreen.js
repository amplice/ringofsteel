import { TransformKeyframes } from '../editor/TransformKeyframes.js';
import savedKeyframes from '../data/animation-keyframes.json';

export class AnimPlayerScreen {
  constructor() {
    this.el = document.getElementById('anim-player-screen');
    this.onBack = null;
    this.onClipSwitch = null;
    this.onTransformUpdate = null;
    this.onTestModeToggle = null;

    this._clipListEl = document.getElementById('anim-clip-list');
    this._clipNameEl = document.getElementById('anim-current-name');
    this._timeEl = document.getElementById('anim-time');
    this._frameEl = document.getElementById('anim-frame');
    this._progressEl = document.getElementById('anim-progress');
    this._speedEl = document.getElementById('anim-speed-value');
    this._keyframeBarEl = document.getElementById('anim-keyframe-bar');

    this._btnPlay = document.getElementById('anim-btn-play');
    this._btnPause = document.getElementById('anim-btn-pause');
    this._btnRestart = document.getElementById('anim-btn-restart');
    this._btnBack = document.getElementById('anim-btn-back');
    this._btnSpeedDown = document.getElementById('anim-btn-speed-down');
    this._btnSpeedUp = document.getElementById('anim-btn-speed-up');
    this.actions = {};
    this.currentAction = null;
    this.currentClipName = '';
    this.speed = 1.0;

    // Keyframe system — auto-load saved data
    this.keyframes = new TransformKeyframes();
    this.keyframes.importJSON(JSON.stringify(savedKeyframes));

    // Transform slider/number references
    this._transformSliders = {};
    this._transformNums = {};

    // Test mode
    this.testMode = false;

    this._setupControls();
    this._setupTransformControls();
  }

  _setupControls() {
    this._btnPlay.addEventListener('click', () => this._play());
    this._btnPause.addEventListener('click', () => this._pause());
    this._btnRestart.addEventListener('click', () => this._restart());
    this._btnBack.addEventListener('click', () => {
      if (this.onBack) this.onBack();
    });
    this._btnSpeedDown.addEventListener('click', () => this._changeSpeed(-0.25));
    this._btnSpeedUp.addEventListener('click', () => this._changeSpeed(0.25));

    this._progressEl.addEventListener('input', () => {
      if (this.currentAction) {
        const clip = this.currentAction.getClip();
        const time = (this._progressEl.value / 100) * clip.duration;
        this.currentAction.time = time;
        if (this.currentAction._animEntry) {
          this.currentAction._animEntry.mixer.update(0);
        }
      }
    });
  }

  _setupTransformControls() {
    const props = ['rotY', 'posX', 'posY', 'posZ', 'scale'];
    for (const prop of props) {
      const slider = document.getElementById(`anim-${prop}`);
      const num = document.getElementById(`anim-${prop}-num`);
      this._transformSliders[prop] = slider;
      this._transformNums[prop] = num;

      slider.addEventListener('input', () => {
        num.value = slider.value;
        if (this.onTransformUpdate) this.onTransformUpdate(this._readTransformFromUI());
      });
      num.addEventListener('input', () => {
        slider.value = num.value;
        if (this.onTransformUpdate) this.onTransformUpdate(this._readTransformFromUI());
      });
    }

    document.getElementById('anim-btn-set-key').addEventListener('click', () => this._setKeyframe());
    document.getElementById('anim-btn-del-key').addEventListener('click', () => this._deleteKeyframe());
    document.getElementById('anim-btn-clear-keys').addEventListener('click', () => this._clearKeyframes());
    document.getElementById('anim-btn-export').addEventListener('click', () => this._exportKeyframes());
    document.getElementById('anim-btn-import').addEventListener('click', () => this._importKeyframes());
    document.getElementById('anim-btn-test-mode').addEventListener('click', () => this._toggleTestMode());
  }

  // --- Transform UI read/write ---

  _readTransformFromUI() {
    return {
      rotY: parseFloat(this._transformSliders.rotY.value),
      posX: parseFloat(this._transformSliders.posX.value),
      posY: parseFloat(this._transformSliders.posY.value),
      posZ: parseFloat(this._transformSliders.posZ.value),
      scale: parseFloat(this._transformSliders.scale.value),
    };
  }

  _writeTransformToUI(t) {
    for (const prop of ['rotY', 'posX', 'posY', 'posZ', 'scale']) {
      const val = typeof t[prop] === 'number' ? t[prop] : 0;
      const rounded = prop === 'rotY' ? Math.round(val) : parseFloat(val.toFixed(2));
      this._transformSliders[prop].value = rounded;
      this._transformNums[prop].value = rounded;
    }
  }

  _resetTransformUI() {
    this._writeTransformToUI({ rotY: 0, posX: 0, posY: 0, posZ: 0, scale: 1 });
  }

  // --- Keyframe management ---

  _setKeyframe() {
    if (!this.currentAction) return;
    const frame = Math.round(this.currentAction.time * 60);
    this.keyframes.setKeyframe(this.currentClipName, frame, this._readTransformFromUI());
    this._updateKeyframeBar();
  }

  _deleteKeyframe() {
    if (!this.currentAction) return;
    const frame = Math.round(this.currentAction.time * 60);
    this.keyframes.removeKeyframe(this.currentClipName, frame);
    this._updateKeyframeBar();
  }

  _clearKeyframes() {
    this.keyframes.clearClip(this.currentClipName);
    this._updateKeyframeBar();
    this._resetTransformUI();
  }

  _updateKeyframeBar() {
    this._keyframeBarEl.innerHTML = '';
    if (!this.currentAction) return;
    const clip = this.currentAction.getClip();
    const totalFrames = Math.round(clip.duration * 60);
    const kfs = this.keyframes.getKeyframes(this.currentClipName);

    for (const kf of kfs) {
      const marker = document.createElement('div');
      marker.className = 'anim-keyframe-marker';
      marker.style.left = `${(kf.frame / totalFrames) * 100}%`;
      marker.title = `Frame ${kf.frame}`;
      marker.addEventListener('click', () => {
        this.currentAction.time = kf.frame / 60;
        if (this.currentAction._animEntry) {
          this.currentAction._animEntry.mixer.update(0);
        }
      });
      this._keyframeBarEl.appendChild(marker);
    }
  }

  _exportKeyframes() {
    const json = this.keyframes.exportJSON();
    // Download as file
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'animation-keyframes.json';
    a.click();
    URL.revokeObjectURL(a.href);
    // Also copy to clipboard
    navigator.clipboard.writeText(json).catch(() => {});
    console.log('Keyframe data exported:', json);
  }

  _importKeyframes() {
    const json = prompt('Paste keyframe JSON:');
    if (json) {
      this.keyframes.importJSON(json);
      this._updateKeyframeBar();
    }
  }

  _toggleTestMode() {
    this.testMode = !this.testMode;
    document.getElementById('anim-btn-test-mode').textContent =
      this.testMode ? 'TEST MODE: ON' : 'TEST MODE: OFF';
    if (this.onTestModeToggle) this.onTestModeToggle(this.testMode);
  }

  // --- Existing methods (clip list, playback) ---

  setMixerAndActions(mixer, actions) {
    this.actions = actions;
    this._buildClipList();
  }

  _buildClipList() {
    this._clipListEl.innerHTML = '';
    const names = Object.keys(this.actions);

    if (names.length === 0) {
      this._clipListEl.innerHTML = '<div style="color:#666;font-style:italic;">No animations loaded</div>';
      return;
    }

    for (const name of names) {
      const btn = document.createElement('button');
      btn.className = 'anim-clip-btn';
      btn.textContent = name;
      btn.addEventListener('click', () => this._selectClip(name));
      this._clipListEl.appendChild(btn);
    }

    this._selectClip(names[0]);
  }

  _selectClip(name) {
    this._clipListEl.querySelectorAll('.anim-clip-btn').forEach(btn => {
      btn.classList.toggle('active', btn.textContent === name);
    });

    if (this.currentAction) {
      this.currentAction.stop();
    }

    this.currentClipName = name;
    this.currentAction = this.actions[name];
    this._clipNameEl.textContent = name;

    if (this.currentAction) {
      if (this.onClipSwitch) {
        this.onClipSwitch(this.currentAction);
      }

      this.currentAction.reset();
      this.currentAction.setLoop(2201, Infinity); // THREE.LoopRepeat
      this.currentAction.clampWhenFinished = true;
      this.currentAction.timeScale = this.speed;
      this.currentAction.play();

      if (this.currentAction._animEntry) {
        this.currentAction._animEntry.mixer.update(0);
      }
    }

    // Refresh keyframe bar and transform UI for the new clip
    this._updateKeyframeBar();
    this._resetTransformUI();
  }

  _play() {
    if (this.currentAction) {
      this.currentAction.paused = false;
      this.currentAction.timeScale = this.speed;
      if (!this.currentAction.isRunning()) {
        this.currentAction.reset();
        this.currentAction.play();
      }
    }
  }

  _pause() {
    if (this.currentAction) {
      this.currentAction.paused = true;
    }
  }

  _restart() {
    if (this.currentAction) {
      this.currentAction.reset();
      this.currentAction.timeScale = this.speed;
      this.currentAction.play();
    }
  }

  _changeSpeed(delta) {
    this.speed = Math.max(0.25, Math.min(3.0, this.speed + delta));
    this._speedEl.textContent = this.speed.toFixed(2) + 'x';
    if (this.currentAction) {
      this.currentAction.timeScale = this.speed;
    }
  }

  updateDisplay() {
    if (!this.currentAction) return;

    const clip = this.currentAction.getClip();
    const time = this.currentAction.time;
    const frame = Math.round(time * 60);
    const totalFrames = Math.round(clip.duration * 60);
    this._timeEl.textContent = `${time.toFixed(2)}s / ${clip.duration.toFixed(2)}s`;
    this._frameEl.textContent = `Frame ${frame} / ${totalFrames}`;
    this._progressEl.value = (time / clip.duration) * 100;

    // If keyframes exist for this clip, auto-update sliders from interpolation during playback
    // Otherwise, user's manual slider values always take priority
    const hasKeyframes = this.keyframes.getKeyframes(this.currentClipName).length > 0;
    if (!this.currentAction.paused && hasKeyframes) {
      const transform = this.keyframes.getTransformAtFrame(this.currentClipName, frame);
      this._writeTransformToUI(transform);
      if (this.onTransformUpdate) this.onTransformUpdate(transform);
    } else {
      if (this.onTransformUpdate) this.onTransformUpdate(this._readTransformFromUI());
    }
  }

  show() {
    this.el.style.display = 'flex';
  }

  hide() {
    this.el.style.display = 'none';
    if (this.currentAction) {
      this.currentAction.stop();
      this.currentAction = null;
    }
    if (this.testMode) this._toggleTestMode();
  }
}
