const MUTE_STORAGE_KEY = 'ring-of-steel-muted';

export class SoundManager {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.buffers = new Map();
    this.pendingLoads = new Map();
    this._unlockHandler = () => {
      this.unlock().catch(() => {});
    };
    this._unlockArmed = false;
    this.enabled = typeof window !== 'undefined';
    this.muted = this.enabled && window.localStorage?.getItem(MUTE_STORAGE_KEY) === 'true';

    this._armUnlock();
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : 1;
    try {
      window.localStorage?.setItem(MUTE_STORAGE_KEY, String(this.muted));
    } catch {
      // Storage unavailable (private mode etc.) — mute still applies this session.
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  _ensureContext() {
    if (!this.enabled) return null;
    if (this.context) return this.context;

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      this.enabled = false;
      return null;
    }

    this.context = new AudioContextCtor();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 1;
    this.masterGain.connect(this.context.destination);
    return this.context;
  }

  _armUnlock() {
    if (!this.enabled || this._unlockArmed) return;
    this._unlockArmed = true;
    window.addEventListener('pointerdown', this._unlockHandler, true);
    window.addEventListener('keydown', this._unlockHandler, true);
    window.addEventListener('touchstart', this._unlockHandler, true);
  }

  _disarmUnlock() {
    if (!this._unlockArmed) return;
    this._unlockArmed = false;
    window.removeEventListener('pointerdown', this._unlockHandler, true);
    window.removeEventListener('keydown', this._unlockHandler, true);
    window.removeEventListener('touchstart', this._unlockHandler, true);
  }

  async unlock() {
    const context = this._ensureContext();
    if (!context) return false;
    if (context.state === 'suspended') {
      await context.resume();
    }
    if (context.state === 'running') {
      this._disarmUnlock();
      return true;
    }
    return false;
  }

  async preload(entries) {
    await Promise.all(entries.map(({ id, url }) => this.load(id, url)));
  }

  async load(id, url) {
    if (!id || !url) return null;
    if (this.buffers.has(id)) return this.buffers.get(id);
    if (this.pendingLoads.has(id)) return this.pendingLoads.get(id);

    const context = this._ensureContext();
    if (!context) return null;

    const pending = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load sound '${url}': ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((buffer) => context.decodeAudioData(buffer))
      .then((decoded) => {
        this.buffers.set(id, decoded);
        this.pendingLoads.delete(id);
        return decoded;
      })
      .catch((error) => {
        this.pendingLoads.delete(id);
        console.warn('[sound] load failed', id, error);
        return null;
      });

    this.pendingLoads.set(id, pending);
    return pending;
  }

  play(id, options = {}) {
    const context = this._ensureContext();
    const buffer = this.buffers.get(id);
    if (!context || !buffer || !this.masterGain || context.state !== 'running') {
      return false;
    }

    const { volume = 0.5, playbackRate = 1, startOffset = 0 } = options;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    const gainNode = context.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(this.masterGain);
    const offset = Math.max(0, Math.min(startOffset, Math.max(0, buffer.duration - 0.001)));
    source.start(0, offset);
    // Combat fires many sounds per second; explicitly tear the nodes out of
    // the audio graph when each one finishes so they can't accumulate over a
    // long session (fires after playback, so it never cuts a sound short).
    source.onended = () => {
      try {
        source.disconnect();
        gainNode.disconnect();
      } catch {
        // Already disconnected.
      }
    };
    return true;
  }
}
