import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CHARACTER_DEFS, DEFAULT_CHAR } from '../entities/CharacterDefs.js';
import { getDefaultMultiplayerWsUrl } from '../net/NetConfig.js';
import { DEFAULT_SELECT_STAGE, STAGE_DEFS, normalizeStageId } from '../arena/StageDefs.js';
import { prettyKeyLabel } from '../core/InputManager.js';

const BINDABLE_ACTIONS = [
  ['right', 'Forward'],
  ['left', 'Back'],
  ['sidestepUp', 'Sidestep A'],
  ['sidestepDown', 'Sidestep B'],
  ['quick', 'Quick'],
  ['heavy', 'Heavy'],
  ['thrust', 'Thrust'],
  ['block', 'Block / Parry'],
  ['backstep', 'Backstep'],
];

const CONTROLS_SEEN_KEY = 'ring-of-steel-controls-seen';
const LOADOUT_KEY = 'ring-of-steel-loadout';
const KNOWN_MODES = ['ai', 'gauntlet', 'survival', 'pvp', 'online', 'training', 'watch'];
const KNOWN_DIFFICULTIES = ['easy', 'medium', 'hard'];

const PREVIEW_FRONT_YAW = {
  spearman: Math.PI / 2,
  ronin: Math.PI / 2,
  knight: Math.PI / 2,
  huscarl: Math.PI / 2,
};

const HERO_FRONT_YAW = {
  spearman: 0,
  ronin: 0,
  knight: 0,
  huscarl: 0,
};

export class CharacterSelect {
  constructor() {
    this.el = document.getElementById('select-screen');
    this.onConfirm = null;
    this.onStagePreview = null;

    this.mode = 'ai';
    this.difficulty = 'medium';
    this.rounds = 3;
    this.stageId = DEFAULT_SELECT_STAGE;
    this.p1Char = DEFAULT_CHAR;
    this.p2Char = DEFAULT_CHAR;
    this._restoreLoadout();
    this.difficultySection = document.getElementById('difficulty-section');
    this.roundsSection = document.getElementById('rounds-section');
    this.stageContainer = document.getElementById('stage-options');
    this.onlineSection = document.getElementById('online-section');
    this.onlineServerUrl = document.getElementById('online-server-url');
    this.onlineLobbyCode = document.getElementById('online-lobby-code');
    this.onlineLobbyList = document.getElementById('online-lobby-list');
    this.onlineLobbyPanel = document.getElementById('online-lobby-panel');
    this.onlineLobbySlot1 = document.getElementById('online-lobby-slot-1');
    this.onlineLobbySlot2 = document.getElementById('online-lobby-slot-2');
    this.onlineStatusNote = this.onlineSection?.querySelector('.status-note') ?? null;
    this.onlineLeaveBtn = document.getElementById('online-leave-btn');
    this.onlineHostPublicBtn = document.getElementById('online-host-public-btn');
    this.onlineQuickMatchBtn = document.getElementById('online-quick-match-btn');
    this.onlineRefreshBtn = document.getElementById('online-refresh-btn');
    this.p1Container = document.getElementById('p1-char-options');
    this.p2Container = document.getElementById('p2-char-options');
    this.p1Heading = document.getElementById('p1-char-heading');
    this.p2Heading = document.getElementById('p2-char-heading');
    this.p1VersusSide = document.getElementById('p1-versus-side');
    this.p2VersusSide = document.getElementById('p2-versus-side');
    this.p1VersusName = document.getElementById('p1-versus-name');
    this.p2VersusName = document.getElementById('p2-versus-name');
    this.p1VersusWeapon = document.getElementById('p1-versus-weapon');
    this.p2VersusWeapon = document.getElementById('p2-versus-weapon');
    this.p1VersusImg = document.getElementById('p1-versus-img');
    this.p2VersusImg = document.getElementById('p2-versus-img');
    this.p1HeroRole = document.getElementById('p1-hero-role');
    this.p2HeroRole = document.getElementById('p2-hero-role');
    this.p1HeroName = document.getElementById('p1-hero-name');
    this.p2HeroName = document.getElementById('p2-hero-name');
    this.p2Column = this.p2Heading?.closest('.char-select-column') ?? null;
    this.startBtn = document.getElementById('start-fight-btn');
    this.controlsBtn = document.getElementById('controls-btn');
    this.controlsModal = document.getElementById('controls-modal');
    this.controlsCloseBtn = document.getElementById('controls-close-btn');
    this._keyHandler = this._onKey.bind(this);
    this._focusEl = null;
    this.onIdle = null;
    this._idleTimer = null;
    this._idleReset = this._resetIdleTimer.bind(this);
    this._onlineBusy = false;
    this._onlineLocked = false;
    this._publicLobbies = [];
    this.onLeaveOnline = null;
    this.onModeChange = null;
    this.onOnlineHostPublic = null;
    this.onOnlineQuickMatch = null;
    this.onOnlineRefresh = null;
    this.onOnlineJoinPublic = null;
    this._previewCache = null;
    this._previewImages = new Map();
    this._previewRenderer = null;
    this._heroPreviews = {
      p1: this._createHeroPreview('p1-hero-canvas'),
      p2: this._createHeroPreview('p2-hero-canvas'),
    };
    this._heroPreviewFrame = 0;
    this._heroPreviewLastTime = 0;

    if (this.onlineServerUrl && !this.onlineServerUrl.value) {
      this.onlineServerUrl.value = getDefaultMultiplayerWsUrl();
    }

    this._setupButtons();
    this._buildStageButtons();
    this._buildCharButtons();
    this._syncStaticButtons();
    this._updateModeUI();
    this._updateVersusPreview();
    this.clearOnlineLobbyInfo();
  }

  setCharacterPreviewCache(cache) {
    this._previewCache = cache || null;
    this._renderCharacterPreviewImages();
    this._updateHeroPreviewCharacter('p1', this.p1Char, true);
    this._updateHeroPreviewCharacter('p2', this.p2Char, true);
  }

  getCharacterPreviewImages() {
    this._renderCharacterPreviewImages();
    return new Map(this._previewImages);
  }

  _setupButtons() {
    // Mode buttons
    document.querySelectorAll('#mode-options .select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#mode-options .select-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.mode = btn.dataset.mode;
        this._updateModeUI();
        if (this.onModeChange) this.onModeChange(this.mode);
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

    // Match length buttons
    document.querySelectorAll('#rounds-options .select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#rounds-options .select-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.rounds = Number(btn.dataset.rounds);
      });
    });

    // Start button
    document.getElementById('start-fight-btn').addEventListener('click', () => {
      if (this._onlineBusy) return;
      this._persistLoadout();
      if (this.onConfirm) {
        this.onConfirm({
          mode: this.mode,
          difficulty: this.difficulty,
          rounds: this.rounds,
          stageId: this.stageId,
          p1Char: this.p1Char,
          p2Char: this.p2Char,
          serverUrl: this.onlineServerUrl?.value?.trim() || '',
          lobbyCode: this.onlineLobbyCode?.value?.trim().toUpperCase() || '',
        });
      }
    });

    if (this.onlineLobbyCode) {
      this.onlineLobbyCode.addEventListener('input', () => this._updateStartButton());
    }
    if (this.onlineHostPublicBtn) {
      this.onlineHostPublicBtn.addEventListener('click', () => {
        if (!this._onlineBusy && !this._onlineLocked && this.onOnlineHostPublic) {
          this.onOnlineHostPublic(this._buildOnlineConfig());
        }
      });
    }
    if (this.onlineQuickMatchBtn) {
      this.onlineQuickMatchBtn.addEventListener('click', () => {
        if (!this._onlineBusy && !this._onlineLocked && this.onOnlineQuickMatch) {
          this.onOnlineQuickMatch(this._buildOnlineConfig());
        }
      });
    }
    if (this.onlineRefreshBtn) {
      this.onlineRefreshBtn.addEventListener('click', () => {
        if (!this._onlineBusy && !this._onlineLocked && this.onOnlineRefresh) {
          this.onOnlineRefresh(this._buildOnlineConfig());
        }
      });
    }
    if (this.onlineLeaveBtn) {
      this.onlineLeaveBtn.addEventListener('click', () => {
        if (this.onLeaveOnline) this.onLeaveOnline();
      });
    }

    if (this.controlsBtn) {
      this.controlsBtn.addEventListener('click', () => this._setControlsOpen(true));
    }
    if (this.controlsCloseBtn) {
      this.controlsCloseBtn.addEventListener('click', () => this._setControlsOpen(false));
    }
    if (this.controlsModal) {
      this.controlsModal.addEventListener('click', (e) => {
        if (e.target === this.controlsModal) this._setControlsOpen(false);
      });
    }
  }

  _buildCharButtons() {
    if (!this.p1Container || !this.p2Container) return;

    const charIds = Object.keys(CHARACTER_DEFS);

    // Hide character section if only one character
    const section = this.p1Container.closest('.select-section');
    if (charIds.length <= 1 && section) {
      section.style.display = 'none';
      return;
    }

    this.p1Container.innerHTML = '';
    this.p2Container.innerHTML = '';
    for (const id of charIds) {
      const def = CHARACTER_DEFS[id];
      this.p1Container.appendChild(this._createCharButton(id, def.displayName, 1));
      this.p2Container.appendChild(this._createCharButton(id, def.displayName, 2));
    }
  }

  _createCharButton(id, label, playerIndex) {
    const def = CHARACTER_DEFS[id];
    const weapon = def?.weapon?.stats;
    const btn = document.createElement('button');
    btn.className = 'select-btn char-card-btn';
    btn.dataset.char = id;
    btn.innerHTML = `
      <span class="char-card-copy">
        <span class="card-kicker">P${playerIndex} LOADOUT</span>
        <span class="char-card-name">${this._escapeHtml(label).toUpperCase()}</span>
        <span class="char-card-weapon">${this._escapeHtml(weapon?.name ?? 'Weapon').toUpperCase()}</span>
        <span class="char-card-note">${this._escapeHtml(weapon?.description ?? 'One clean hit ends the round.')}</span>
        ${playerIndex === 1 ? `<span class="char-card-record" data-char-record="${this._escapeHtml(id)}" style="display: none;"></span>` : ''}
      </span>
      <span class="char-card-portrait">
        <img alt="" data-char-preview="${this._escapeHtml(id)}" />
        <span class="char-card-silhouette">${this._escapeHtml(label.slice(0, 1)).toUpperCase()}</span>
      </span>
    `;

    const isActive = playerIndex === 1 ? id === this.p1Char : id === this.p2Char;
    if (isActive) btn.classList.add('active');

    btn.addEventListener('click', () => {
      const container = playerIndex === 1 ? this.p1Container : this.p2Container;
      container.querySelectorAll('.select-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (playerIndex === 1) {
        this.p1Char = id;
      } else {
        this.p2Char = id;
      }
      this._updateVersusPreview();
      this._updateHeroPreviewCharacter(playerIndex === 1 ? 'p1' : 'p2', id);
    });

    return btn;
  }

  _createHeroPreview(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffdfb0, 1.2));
    const key = new THREE.DirectionalLight(0xffe0a4, 2.4);
    key.position.set(2.5, 3.4, 4.2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x77aaff, 1.25);
    fill.position.set(-2.6, 2.4, 3.2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xff7058, 1.15);
    rim.position.set(0, 2.0, -3.5);
    scene.add(rim);

    return {
      canvas,
      renderer,
      scene,
      camera: new THREE.OrthographicCamera(-1.1, 1.1, 1.68, -1.36, 0.1, 20),
      root: null,
      mixer: null,
      actions: [],
      actionIndex: -1,
      actionTimer: 0,
      charId: null,
    };
  }

  _updateHeroPreviewCharacter(slot, charId, force = false) {
    const preview = this._heroPreviews?.[slot];
    if (!preview || !this._previewCache) return;
    const resolvedId = CHARACTER_DEFS[charId] ? charId : DEFAULT_CHAR;
    if (!force && preview.charId === resolvedId) return;
    const data = this._previewCache[resolvedId];
    if (!data?.model) return;

    if (preview.root) {
      preview.scene.remove(preview.root);
    }

    const root = SkeletonUtils.clone(data.model);
    root.rotation.y = HERO_FRONT_YAW[resolvedId] ?? PREVIEW_FRONT_YAW[resolvedId] ?? 0;
    root.traverse((child) => {
      if (!child.isMesh) return;
      child.frustumCulled = false;
      child.castShadow = false;
      child.receiveShadow = false;
      if (!child.material) return;
      const cloneMaterial = (mat) => {
        const cloned = mat.clone();
        cloned.metalness = Math.min(cloned.metalness ?? 0, 0.18);
        cloned.roughness = Math.max(cloned.roughness ?? 0.72, 0.78);
        return cloned;
      };
      child.material = Array.isArray(child.material)
        ? child.material.map(cloneMaterial)
        : cloneMaterial(child.material);
    });
    preview.scene.add(root);

    const mixer = new THREE.AnimationMixer(root);
    const idleClip = data.clips?.idle || Object.values(data.clips || {})[0];
    const actions = idleClip ? [mixer.clipAction(idleClip)] : [];

    this._fitHeroModel(preview, root);

    preview.root = root;
    preview.mixer = mixer;
    preview.actions = actions;
    preview.actionIndex = 0;
    preview.actionTimer = 0;
    preview.charId = resolvedId;
    const idle = preview.actions[0];
    if (idle) {
      idle.reset();
      idle.setLoop(THREE.LoopRepeat, Infinity);
      idle.clampWhenFinished = false;
      idle.enabled = true;
      idle.play();
    }
  }

  _fitHeroModel(preview, root) {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    if (size.y > 0) {
      root.scale.multiplyScalar(1.82 / size.y);
    }
    const scaledBox = new THREE.Box3().setFromObject(root);
    const center = scaledBox.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= scaledBox.min.y;

    preview.camera.position.set(0, 1.14, 7);
    preview.camera.lookAt(0, 1.14, 0);
    preview.camera.updateProjectionMatrix();
    this._resizeHeroPreview(preview);
    this._centerPreviewBodyInFrame(preview.renderer, preview.scene, preview.camera, root);
  }

  _startHeroPreviewLoop() {
    if (this._heroPreviewFrame) return;
    this._heroPreviewLastTime = performance.now();
    const tick = (now) => {
      this._heroPreviewFrame = requestAnimationFrame(tick);
      const dt = Math.min((now - this._heroPreviewLastTime) / 1000, 0.05);
      this._heroPreviewLastTime = now;
      this._updateHeroPreviews(dt);
    };
    this._heroPreviewFrame = requestAnimationFrame(tick);
  }

  _stopHeroPreviewLoop() {
    if (!this._heroPreviewFrame) return;
    cancelAnimationFrame(this._heroPreviewFrame);
    this._heroPreviewFrame = 0;
  }

  _updateHeroPreviews(dt) {
    for (const preview of Object.values(this._heroPreviews)) {
      if (!preview?.renderer || !preview.root) continue;
      this._resizeHeroPreview(preview);
      preview.mixer?.update(dt);
      preview.renderer.render(preview.scene, preview.camera);
    }
  }

  _resizeHeroPreview(preview) {
    const width = Math.max(1, Math.floor(preview.canvas.clientWidth));
    const height = Math.max(1, Math.floor(preview.canvas.clientHeight));
    const pixelRatio = preview.renderer.getPixelRatio();
    if (
      preview.canvas.width !== Math.floor(width * pixelRatio) ||
      preview.canvas.height !== Math.floor(height * pixelRatio)
    ) {
      preview.renderer.setSize(width, height, false);
    }
    const aspect = width / height;
    const viewHeight = 3.72;
    const viewWidth = viewHeight * aspect;
    preview.camera.left = -viewWidth / 2;
    preview.camera.right = viewWidth / 2;
    preview.camera.top = 1.92;
    preview.camera.bottom = -1.8;
    preview.camera.updateProjectionMatrix();
  }

  _renderCharacterPreviewImages() {
    if (!this._previewCache) return;

    for (const id of Object.keys(CHARACTER_DEFS)) {
      if (this._previewImages.has(id)) continue;
      const data = this._previewCache[id];
      if (!data?.model) continue;
      try {
        const image = this._renderPreviewImage(id, data);
        if (image) this._previewImages.set(id, image);
      } catch (err) {
        console.warn(`[ui] failed to render character preview '${id}'`, err);
      }
    }

    for (const img of this.el.querySelectorAll('img[data-char-preview]')) {
      const src = this._previewImages.get(img.dataset.charPreview);
      if (!src) continue;
      img.src = src;
      img.classList.add('ready');
    }
    this._updateVersusPreview();
  }

  _renderPreviewImage(id, data) {
    const renderer = this._getPreviewRenderer();
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);

    scene.add(new THREE.AmbientLight(0xffdfb0, 1.25));
    const key = new THREE.DirectionalLight(0xffe0a4, 2.2);
    key.position.set(2.4, 3.0, 3.1);
    scene.add(key);
    const rim = new THREE.DirectionalLight(id === 'ronin' ? 0x74b8ff : 0x8fc3ff, 1.65);
    rim.position.set(-2.4, 2.0, -2.4);
    scene.add(rim);

    const root = SkeletonUtils.clone(data.model);
    root.rotation.y = PREVIEW_FRONT_YAW[id] ?? 0;
    root.traverse((child) => {
      if (child.isMesh) {
        child.frustumCulled = false;
        child.castShadow = false;
        child.receiveShadow = false;
        if (child.material) {
          const applyMat = (mat) => {
            const cloned = mat.clone();
            cloned.metalness = Math.min(cloned.metalness ?? 0, 0.22);
            cloned.roughness = Math.max(cloned.roughness ?? 0.72, 0.78);
            return cloned;
          };
          child.material = Array.isArray(child.material)
            ? child.material.map(applyMat)
            : applyMat(child.material);
        }
      }
    });
    scene.add(root);

    const mixer = new THREE.AnimationMixer(root);
    const idle = data.clips?.idle || Object.values(data.clips || {})[0];
    if (idle) {
      const action = mixer.clipAction(idle);
      action.play();
      mixer.update(Math.min(0.3, idle.duration * 0.18));
    }

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    if (size.y > 0) {
      root.scale.multiplyScalar(1.72 / size.y);
    }
    const scaledBox = new THREE.Box3().setFromObject(root);
    const center = scaledBox.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= scaledBox.min.y - 0.04;

    const fittedBox = new THREE.Box3().setFromObject(root);
    const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
    const halfFrame = 1.16;
    camera.left = -halfFrame;
    camera.right = halfFrame;
    camera.top = halfFrame;
    camera.bottom = -halfFrame;
    camera.position.set(0, fittedCenter.y, 6);
    camera.lookAt(0, fittedCenter.y, 0);
    camera.updateProjectionMatrix();

    this._centerPreviewBodyInFrame(renderer, scene, camera, root);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  }

  _centerPreviewBodyInFrame(renderer, scene, camera, root) {
    const hidden = [];
    this._setPreviewWeaponVisibility(root, false, hidden);
    renderer.render(scene, camera);
    const bounds = this._getPreviewAlphaBounds(renderer.domElement);
    for (const entry of hidden) entry.object.visible = entry.visible;

    if (!bounds) return;
    const bodyCenterX = (bounds.minX + bounds.maxX) / 2;
    const targetCenterX = renderer.domElement.width / 2;
    const deltaPixels = targetCenterX - bodyCenterX;
    if (Math.abs(deltaPixels) < 1) return;
    const worldUnitsPerPixel = (camera.right - camera.left) / renderer.domElement.width;
    root.position.x += deltaPixels * worldUnitsPerPixel;
  }

  _getPreviewAlphaBounds(canvas) {
    const sample = document.createElement('canvas');
    sample.width = canvas.width;
    sample.height = canvas.height;
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, sample.width, sample.height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha < 12) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    return maxX >= minX && maxY >= minY ? { minX, minY, maxX, maxY } : null;
  }

  _setPreviewWeaponVisibility(root, visible, hidden) {
    const visit = (object, inheritedWeapon = false) => {
      const isWeapon = inheritedWeapon || this._isPreviewWeaponNode(object);
      if (isWeapon && object.visible !== visible) {
        hidden.push({ object, visible: object.visible });
        object.visible = visible;
      }
      for (const child of object.children) visit(child, isWeapon);
    };

    visit(root, false);
  }

  _isPreviewWeaponNode(object) {
    return /spear|katana|sword|longsword|axe|battleaxe|shield|blade|weapon/i.test(object.name || '');
  }

  _getPreviewRenderer() {
    if (!this._previewRenderer) {
      this._previewRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      this._previewRenderer.setPixelRatio(1);
      this._previewRenderer.setSize(384, 384, false);
      this._previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
      this._previewRenderer.setClearColor(0x000000, 0);
    }
    return this._previewRenderer;
  }

  _updateOpponentLabel() {
    if (this.p1Heading) {
      this.p1Heading.textContent = this.mode === 'watch' ? 'AI 1 Character' : 'Player 1 Character';
    }
    const p1Label = this.p1VersusSide?.querySelector('.versus-label');
    if (p1Label) p1Label.textContent = this.mode === 'watch' ? 'AI 1' : 'Player 1';
    if (this.p1HeroRole) this.p1HeroRole.textContent = this.mode === 'watch' ? 'AI 1' : 'Player 1';
    const p2Label = this.p2VersusSide?.querySelector('.versus-label');
    const p2Role = this.mode === 'ai'
      ? 'Computer'
      : this.mode === 'watch'
        ? 'AI 2'
        : this.mode === 'online'
          ? 'Opponent'
          : this.mode === 'training'
            ? 'Dummy'
            : this.mode === 'gauntlet'
              ? 'The Gauntlet'
              : this.mode === 'survival'
                ? 'Endless Foes'
                : 'Player 2';
    if (p2Label) {
      p2Label.textContent = p2Role;
    }
    if (this.p2HeroRole) this.p2HeroRole.textContent = p2Role;
    if (!this.p2Heading) return;
    this.p2Heading.textContent = this.mode === 'ai'
      ? 'Computer Character'
      : this.mode === 'watch'
        ? 'AI 2 Character'
      : this.mode === 'online'
        ? 'Opponent Character'
      : this.mode === 'training'
        ? 'Dummy Character'
        : 'Player 2 Character';
  }

  _updateVersusPreview() {
    this._setVersusSide({
      charId: this.p1Char,
      nameEl: this.p1VersusName,
      weaponEl: this.p1VersusWeapon,
      imageEl: this.p1VersusImg,
      sideEl: this.p1VersusSide,
    });
    const record = this._charRecordLabel(this.p1Char);
    if (record && this.p1VersusWeapon) {
      this.p1VersusWeapon.textContent += ` · ${record}`;
    }
    this._setVersusSide({
      charId: this.p2Char,
      nameEl: this.p2VersusName,
      weaponEl: this.p2VersusWeapon,
      imageEl: this.p2VersusImg,
      sideEl: this.p2VersusSide,
    });
    if (this.mode === 'gauntlet' || this.mode === 'survival') {
      // The mode picks the foes — show the challenge and your record instead.
      if (this.p2VersusName) {
        this.p2VersusName.textContent = this.mode === 'gauntlet' ? 'THE GAUNTLET' : 'ENDLESS FOES';
      }
      if (this.p2VersusWeapon) {
        this.p2VersusWeapon.textContent = this.mode === 'gauntlet'
          ? this._gauntletBestLabel()
          : this._survivalBestLabel();
      }
      if (this.p2VersusImg) {
        this.p2VersusImg.removeAttribute('src');
        this.p2VersusImg.classList.remove('ready');
      }
      this.p2VersusSide?.classList.remove('preview-ready');
    }
    this._syncHeroLabels();
    this._updateHeroPreviewCharacter('p1', this.p1Char);
    this._updateHeroPreviewCharacter('p2', this.p2Char);
  }

  // Lifetime vs-computer record for a fighter, e.g. "12W-3L"; null if unplayed.
  _charRecordLabel(charId) {
    try {
      const raw = window.localStorage?.getItem(`ring-of-steel-record-${charId}`);
      if (!raw) return null;
      const record = JSON.parse(raw);
      const wins = record.w ?? 0;
      const losses = record.l ?? 0;
      if (!wins && !losses) return null;
      return `${wins}W-${losses}L`;
    } catch {
      return null;
    }
  }

  _survivalBest(charId = this.p1Char) {
    try {
      const saved = Number(window.localStorage?.getItem(`ring-of-steel-survival-best-${charId}`));
      if (Number.isFinite(saved) && saved > 0) return saved;
    } catch {
      // Storage unavailable.
    }
    return 0;
  }

  _survivalBestLabel() {
    const best = this._survivalBest();
    return best > 0 ? `BEST STREAK ${best}` : 'NO RUNS YET';
  }

  _gauntletBestTime(charId = this.p1Char) {
    try {
      const saved = Number(window.localStorage?.getItem(`ring-of-steel-gauntlet-best-${charId}`));
      if (Number.isFinite(saved) && saved > 0) return saved;
    } catch {
      // Storage unavailable — treat as no record.
    }
    return 0;
  }

  _formatClearTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = String(Math.floor(seconds % 60)).padStart(2, '0');
    return `${minutes}:${secs}`;
  }

  _gauntletBestLabel() {
    const best = this._gauntletBestTime();
    return best > 0 ? `BEST CLEAR ${this._formatClearTime(best)}` : 'NO CLEAR YET';
  }

  // Compact one-line history shown on each P1 fighter card.
  _refreshCharRecords() {
    for (const span of document.querySelectorAll('[data-char-record]')) {
      const charId = span.dataset.charRecord;
      const parts = [];
      const record = this._charRecordLabel(charId);
      if (record) parts.push(record);
      const clear = this._gauntletBestTime(charId);
      if (clear > 0) parts.push(`CLEAR ${this._formatClearTime(clear)}`);
      const streak = this._survivalBest(charId);
      if (streak > 0) parts.push(`STREAK ${streak}`);
      span.textContent = parts.join(' · ');
      span.style.display = parts.length ? '' : 'none';
    }
  }

  _syncHeroLabels() {
    const p1Def = CHARACTER_DEFS[this.p1Char] ?? CHARACTER_DEFS[DEFAULT_CHAR];
    const p2Def = CHARACTER_DEFS[this.p2Char] ?? CHARACTER_DEFS[DEFAULT_CHAR];
    if (this.p1HeroName) this.p1HeroName.textContent = p1Def.displayName.toUpperCase();
    if (this.p2HeroName) this.p2HeroName.textContent = p2Def.displayName.toUpperCase();
  }

  _setVersusSide({ charId, nameEl, weaponEl, imageEl, sideEl }) {
    const def = CHARACTER_DEFS[charId] ?? CHARACTER_DEFS[DEFAULT_CHAR];
    if (nameEl) nameEl.textContent = def.displayName.toUpperCase();
    if (weaponEl) weaponEl.textContent = (def.weapon?.stats?.name ?? 'Weapon').toUpperCase();
    const src = this._previewImages.get(charId);
    if (imageEl && src) {
      imageEl.src = src;
      imageEl.classList.add('ready');
    } else if (imageEl) {
      imageEl.removeAttribute('src');
      imageEl.classList.remove('ready');
    }
    if (sideEl) sideEl.classList.toggle('preview-ready', Boolean(src));
  }

  _buildStageButtons() {
    if (!this.stageContainer) return;
    this.stageContainer.innerHTML = '';
    for (const [id, stage] of Object.entries(STAGE_DEFS)) {
      const btn = document.createElement('button');
      btn.className = 'select-btn stage-card-btn';
      btn.dataset.stage = id;
      const boundary = stage.bounds?.boundary === 'wall' ? 'Wall bounce' : 'Ring-out death';
      btn.innerHTML = `
        <span class="stage-card-copy">
          <span class="stage-card-name">${this._escapeHtml(stage.displayName).toUpperCase()}</span>
          <span class="stage-card-boundary">${boundary.toUpperCase()}</span>
          <span class="stage-card-note">${this._escapeHtml(stage.description ?? stage.displayName)}</span>
        </span>
      `;
      btn.title = stage.description ?? stage.displayName;
      if (id === this.stageId) btn.classList.add('active');
      btn.addEventListener('click', () => {
        this.stageContainer.querySelectorAll('.select-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.stageId = normalizeStageId(id);
        if (this.onStagePreview) this.onStagePreview(this.stageId);
      });
      this.stageContainer.appendChild(btn);
    }

    const randomBtn = document.createElement('button');
    randomBtn.className = 'select-btn stage-card-btn';
    randomBtn.dataset.stage = 'random';
    randomBtn.innerHTML = `
      <span class="stage-card-copy">
        <span class="stage-card-name">RANDOM</span>
        <span class="stage-card-boundary">FATE DECIDES</span>
        <span class="stage-card-note">A different arena every match.</span>
      </span>
    `;
    randomBtn.title = 'A different arena every match.';
    if (this.stageId === 'random') randomBtn.classList.add('active');
    randomBtn.addEventListener('click', () => {
      this.stageContainer.querySelectorAll('.select-btn').forEach(b => b.classList.remove('active'));
      randomBtn.classList.add('active');
      this.stageId = 'random';
    });
    this.stageContainer.appendChild(randomBtn);
  }

  _escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  _updateModeUI() {
    if (this.difficultySection) {
      this.difficultySection.style.display = (this.mode === 'ai' || this.mode === 'watch') ? 'block' : 'none';
    }
    if (this.onlineSection) {
      this.onlineSection.style.display = this.mode === 'online' ? 'block' : 'none';
    }
    if (this.roundsSection) {
      // Online uses the server's fixed length, training has no rounds,
      // gauntlet stays canonical for comparable bests, and survival duels
      // are always a single round.
      this.roundsSection.style.display =
        (this.mode === 'online' || this.mode === 'training' || this.mode === 'gauntlet' || this.mode === 'survival')
          ? 'none'
          : 'block';
    }
    if (this.p2Column) {
      this.p2Column.style.display =
        (this.mode === 'online' || this.mode === 'gauntlet' || this.mode === 'survival') ? 'none' : '';
    }
    if (this.startBtn) {
      this._updateStartButton();
    }
    this._updateOnlineButtons();
    this._updateOpponentLabel();
    this._updateVersusPreview();
  }

  _updateStartButton() {
    if (!this.startBtn) return;
    if (this.mode !== 'online') {
      this.startBtn.textContent = this.mode === 'watch'
        ? 'WATCH'
        : this.mode === 'training'
          ? 'TRAIN'
          : this.mode === 'gauntlet'
            ? 'BEGIN'
            : this.mode === 'survival'
              ? 'SURVIVE'
              : 'FIGHT';
      this.startBtn.disabled = false;
      if (this.onlineLeaveBtn) this.onlineLeaveBtn.style.display = 'none';
      return;
    }

    if (this._onlineBusy) {
      this.startBtn.textContent = 'CONNECTING...';
      this.startBtn.disabled = true;
      if (this.onlineLeaveBtn) {
        this.onlineLeaveBtn.style.display = this._onlineLocked ? '' : 'none';
        this.onlineLeaveBtn.disabled = true;
      }
      return;
    }

    const lobbyCode = this.onlineLobbyCode?.value?.trim() ?? '';
    if (this._onlineLocked) {
      this.startBtn.textContent = 'IN LOBBY';
      this.startBtn.disabled = true;
    } else if (lobbyCode) {
      this.startBtn.textContent = 'JOIN';
      this.startBtn.disabled = false;
    } else {
      this.startBtn.textContent = 'HOST PRIVATE';
      this.startBtn.disabled = false;
    }
    if (this.onlineLeaveBtn) {
      this.onlineLeaveBtn.style.display = this._onlineLocked ? '' : 'none';
      this.onlineLeaveBtn.disabled = false;
    }
  }

  _updateOnlineButtons() {
    const disabled = this.mode !== 'online' || this._onlineBusy || this._onlineLocked;
    if (this.onlineHostPublicBtn) this.onlineHostPublicBtn.disabled = disabled;
    if (this.onlineQuickMatchBtn) this.onlineQuickMatchBtn.disabled = disabled;
    if (this.onlineRefreshBtn) this.onlineRefreshBtn.disabled = disabled;
  }

  _buildOnlineConfig() {
    return {
      mode: this.mode,
      difficulty: this.difficulty,
      stageId: this.stageId,
      p1Char: this.p1Char,
      p2Char: this.p2Char,
      serverUrl: this.onlineServerUrl?.value?.trim() || '',
      lobbyCode: this.onlineLobbyCode?.value?.trim().toUpperCase() || '',
    };
  }

  setPublicLobbies(lobbies = []) {
    this._publicLobbies = Array.isArray(lobbies) ? lobbies : [];
    this._renderPublicLobbies();
  }

  _renderPublicLobbies() {
    if (!this.onlineLobbyList) return;
    this.onlineLobbyList.innerHTML = '';

    if (!this._publicLobbies.length) {
      const empty = document.createElement('div');
      empty.className = 'online-lobby-empty';
      empty.textContent = 'No public matches waiting.';
      this.onlineLobbyList.appendChild(empty);
      return;
    }

    for (const lobby of this._publicLobbies) {
      const row = document.createElement('div');
      row.className = 'online-lobby-row';

      const main = document.createElement('div');
      main.className = 'online-lobby-main';
      main.innerHTML = `
        <span class="emphasis">${lobby.code}</span>
        <span>${lobby.playerCount}/${lobby.maxPlayers} Players</span>
        <span>${String(lobby.hostCharacterId || 'unknown').replace('_', ' ')}</span>
      `;

      const joinBtn = document.createElement('button');
      joinBtn.className = 'select-btn';
      joinBtn.textContent = 'JOIN';
      joinBtn.disabled = this.mode !== 'online' || this._onlineBusy || this._onlineLocked;
      joinBtn.addEventListener('click', () => {
        if (this.onOnlineJoinPublic) {
          this.onOnlineJoinPublic({
            ...this._buildOnlineConfig(),
            lobbyCode: lobby.code,
          });
        }
      });

      row.appendChild(main);
      row.appendChild(joinBtn);
      this.onlineLobbyList.appendChild(row);
    }
  }

  setOnlineLobbyCode(code = '') {
    if (this.onlineLobbyCode) {
      this.onlineLobbyCode.value = code;
    }
    this._updateStartButton();
  }

  setOnlineStatus(message) {
    if (this.onlineStatusNote) {
      this.onlineStatusNote.textContent = message;
    }
  }

  setOnlineLobbyInfo(detail = null) {
    if (!this.onlineLobbyPanel || !this.onlineLobbySlot1 || !this.onlineLobbySlot2) return;
    const players = Array.isArray(detail?.players) ? detail.players : [];
    this._setOnlineSlotState(this.onlineLobbySlot1, players.find((player) => player.slot === 0) ?? null, 0);
    this._setOnlineSlotState(this.onlineLobbySlot2, players.find((player) => player.slot === 1) ?? null, 1);
  }

  clearOnlineLobbyInfo() {
    if (!this.onlineLobbySlot1 || !this.onlineLobbySlot2) return;
    this._setOnlineSlotState(this.onlineLobbySlot1, null, 0);
    this._setOnlineSlotState(this.onlineLobbySlot2, null, 1);
  }

  _setOnlineSlotState(slotEl, player, slotIndex) {
    if (!slotEl) return;
    const valueEl = slotEl.querySelector('.value');
    slotEl.classList.toggle('empty', !player?.connected);
    if (!valueEl) return;
    if (!player?.connected) {
      valueEl.textContent = 'Open';
      return;
    }
    const role = slotIndex === 0 ? 'Host' : 'Guest';
    const you = player.self ? ' (You)' : '';
    valueEl.textContent = `${role}${you} Connected`;
  }

  setOnlineBusy(busy) {
    this._onlineBusy = Boolean(busy);
    this._updateStartButton();
    this._updateOnlineButtons();
    this._renderPublicLobbies();
  }

  setOnlineLocked(locked) {
    this._onlineLocked = Boolean(locked);
    if (this.onlineServerUrl) this.onlineServerUrl.readOnly = this._onlineLocked;
    if (this.onlineLobbyCode) this.onlineLobbyCode.readOnly = this._onlineLocked;
    this._updateStartButton();
    this._updateOnlineButtons();
    this._renderPublicLobbies();
  }

  resetOnlineState() {
    this._onlineBusy = false;
    this._onlineLocked = false;
    if (this.onlineServerUrl) this.onlineServerUrl.readOnly = false;
    if (this.onlineLobbyCode) this.onlineLobbyCode.readOnly = false;
    this.clearOnlineLobbyInfo();
    this._updateStartButton();
    this._updateOnlineButtons();
    this._renderPublicLobbies();
  }

  show() {
    this.el.style.display = 'flex';
    this._updateModeUI();
    this._refreshCharRecords();
    this._setControlsOpen(false);
    this._maybeShowFirstVisitControls();
    this._renderCharacterPreviewImages();
    this._syncHeroLabels();
    this._updateHeroPreviewCharacter('p1', this.p1Char, true);
    this._updateHeroPreviewCharacter('p2', this.p2Char, true);
    this._startHeroPreviewLoop();
    if (this.onStagePreview && this.stageId !== 'random') this.onStagePreview(this.stageId);
    window.addEventListener('keydown', this._keyHandler);
    window.addEventListener('keydown', this._idleReset);
    window.addEventListener('pointerdown', this._idleReset);
    window.addEventListener('pointermove', this._idleReset);
    this._resetIdleTimer();
  }

  hide() {
    this.el.style.display = 'none';
    this._setControlsOpen(false);
    this._stopHeroPreviewLoop();
    this._setFocus(null);
    window.removeEventListener('keydown', this._keyHandler);
    window.removeEventListener('keydown', this._idleReset);
    window.removeEventListener('pointerdown', this._idleReset);
    window.removeEventListener('pointermove', this._idleReset);
    window.clearTimeout(this._idleTimer);
    this._idleTimer = null;
  }

  // After a minute of inactivity (and no online session in progress), hand
  // back to the title screen so the attract loop takes over.
  _resetIdleTimer() {
    window.clearTimeout(this._idleTimer);
    this._idleTimer = window.setTimeout(() => {
      if (this.mode === 'online' || this._onlineBusy || this._onlineLocked) {
        this._resetIdleTimer();
        return;
      }
      this.onIdle?.();
    }, 60000);
  }

  _setControlsOpen(open) {
    if (!this.controlsModal) return;
    this.controlsModal.classList.toggle('open', open);
    if (!open) this._cancelRebind();
  }

  // Key rebinding lives in the controls modal; needs the InputManager.
  setInputManager(input) {
    this._input = input;
    document.getElementById('controls-reset-btn')?.addEventListener('click', () => {
      this._cancelRebind();
      this._input.resetBindings();
      this._buildBindingRows();
    });
    this._buildBindingRows();
  }

  _buildBindingRows() {
    if (!this._input) return;
    for (let player = 0; player < 2; player++) {
      const container = document.getElementById(player === 0 ? 'p1-bindings' : 'p2-bindings');
      if (!container) continue;
      container.innerHTML = '';

      // A key bound to two actions of the same player only ever fires the
      // first — flag both so the conflict is visible.
      const codeCounts = {};
      for (const [action] of BINDABLE_ACTIONS) {
        const code = this._input.getBinding(player, action);
        if (code) codeCounts[code] = (codeCounts[code] ?? 0) + 1;
      }

      for (const [action, label] of BINDABLE_ACTIONS) {
        const row = document.createElement('div');
        row.className = 'help-row';
        const labelEl = document.createElement('span');
        labelEl.className = 'help-label';
        labelEl.textContent = label;
        const btn = document.createElement('button');
        btn.className = 'keycap-btn';
        const code = this._input.getBinding(player, action);
        if (code && codeCounts[code] > 1) btn.classList.add('conflict');
        btn.dataset.bindPlayer = String(player);
        btn.dataset.bindAction = action;
        btn.textContent = prettyKeyLabel(code);
        btn.addEventListener('click', () => this._startRebind(btn, player, action));
        row.append(labelEl, btn);
        container.appendChild(row);
      }
    }
  }

  _startRebind(btn, player, action) {
    this._cancelRebind(); // may rebuild rows, detaching `btn` — re-query it
    const liveBtn = document.querySelector(
      `[data-bind-player="${player}"][data-bind-action="${action}"]`
    ) ?? btn;
    liveBtn.classList.add('listening');
    liveBtn.textContent = 'PRESS KEY';
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._cancelRebind();
      // Escape cancels; Enter is the menu confirm; M and F3 are global toggles.
      const reserved = ['Escape', 'Enter', 'NumpadEnter', 'KeyM', 'F3'];
      if (!reserved.includes(e.code)) {
        this._input.setBinding(player, action, e.code);
      }
      this._buildBindingRows();
    };
    this._rebindListener = onKey;
    window.addEventListener('keydown', onKey, true);
  }

  _cancelRebind() {
    if (!this._rebindListener) return;
    window.removeEventListener('keydown', this._rebindListener, true);
    this._rebindListener = null;
    this._buildBindingRows();
  }

  // Last confirmed loadout survives across sessions.
  _persistLoadout() {
    try {
      window.localStorage?.setItem(LOADOUT_KEY, JSON.stringify({
        mode: this.mode,
        difficulty: this.difficulty,
        rounds: this.rounds,
        stageId: this.stageId,
        p1Char: this.p1Char,
        p2Char: this.p2Char,
      }));
    } catch {
      // Storage unavailable — selection just won't stick.
    }
  }

  _restoreLoadout() {
    try {
      const raw = window.localStorage?.getItem(LOADOUT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (KNOWN_MODES.includes(saved.mode)) this.mode = saved.mode;
      if (KNOWN_DIFFICULTIES.includes(saved.difficulty)) this.difficulty = saved.difficulty;
      if ([1, 3, 5].includes(saved.rounds)) this.rounds = saved.rounds;
      if (saved.stageId === 'random' || STAGE_DEFS[saved.stageId]) this.stageId = saved.stageId;
      if (CHARACTER_DEFS[saved.p1Char]) this.p1Char = saved.p1Char;
      if (CHARACTER_DEFS[saved.p2Char]) this.p2Char = saved.p2Char;
    } catch {
      // Corrupt or unavailable — defaults stand.
    }
  }

  _syncStaticButtons() {
    document.querySelectorAll('#mode-options .select-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === this.mode);
    });
    document.querySelectorAll('#difficulty-options .select-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.diff === this.difficulty);
    });
    document.querySelectorAll('#rounds-options .select-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.rounds) === this.rounds);
    });
  }

  // First ever visit to the select screen: show the controls once.
  _maybeShowFirstVisitControls() {
    try {
      if (window.localStorage?.getItem(CONTROLS_SEEN_KEY)) return;
      window.localStorage?.setItem(CONTROLS_SEEN_KEY, 'true');
    } catch {
      return; // No storage — don't risk nagging on every visit.
    }
    this._setControlsOpen(true);
  }

  _onKey(e) {
    if (e.code === 'Escape') {
      if (this.controlsModal?.classList.contains('open')) this._setControlsOpen(false);
      return;
    }
    if (this._isEditableTarget(e.target)) return;
    if (this.controlsModal?.classList.contains('open')) {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') this._setControlsOpen(false);
      return;
    }

    switch (e.code) {
      case 'ArrowLeft':
        this._moveFocus(-1, 0);
        e.preventDefault();
        break;
      case 'ArrowRight':
        this._moveFocus(1, 0);
        e.preventDefault();
        break;
      case 'ArrowUp':
        this._moveFocus(0, -1);
        e.preventDefault();
        break;
      case 'ArrowDown':
        this._moveFocus(0, 1);
        e.preventDefault();
        break;
      case 'Enter':
      case 'NumpadEnter':
        this._activateFocus();
        break;
    }
  }

  _isEditableTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable]'));
  }

  // Rows of currently visible, enabled controls for arrow/gamepad navigation.
  _focusGroups() {
    const groups = [];
    const usable = (el) => Boolean(el) && !el.disabled && el.offsetParent !== null;
    const add = (els) => {
      const list = els.filter(usable);
      if (list.length) groups.push(list);
    };

    add([...document.querySelectorAll('#mode-options .select-btn')]);
    add([...document.querySelectorAll('#difficulty-options .select-btn')]);
    add([...document.querySelectorAll('#rounds-options .select-btn')]);
    add([this.onlineQuickMatchBtn, this.onlineHostPublicBtn, this.onlineRefreshBtn, this.onlineLeaveBtn]);
    add([...(this.stageContainer?.querySelectorAll('.select-btn') ?? [])]);
    add([...(this.p1Container?.querySelectorAll('.select-btn') ?? [])]);
    add([...(this.p2Container?.querySelectorAll('.select-btn') ?? [])]);
    add([this.startBtn, this.controlsBtn]);
    return groups;
  }

  _moveFocus(dx, dy) {
    const groups = this._focusGroups();
    if (!groups.length) return;

    let g = -1;
    let i = -1;
    if (this._focusEl) {
      for (let gi = 0; gi < groups.length; gi++) {
        const ii = groups[gi].indexOf(this._focusEl);
        if (ii !== -1) {
          g = gi;
          i = ii;
          break;
        }
      }
    }

    if (g === -1) {
      g = 0;
      i = Math.max(0, groups[0].indexOf(document.querySelector('#mode-options .select-btn.active')));
    } else if (dy) {
      g = (g + dy + groups.length) % groups.length;
      i = Math.min(i, groups[g].length - 1);
    } else if (dx) {
      i = (i + dx + groups[g].length) % groups[g].length;
    }

    this._setFocus(groups[g][i]);
  }

  _setFocus(el) {
    if (this._focusEl === el) return;
    const prev = this._focusEl;
    prev?.classList.remove('gp-focus');
    this._focusEl = el ?? null;
    if (el) {
      el.classList.add('gp-focus');
      el.scrollIntoView?.({ block: 'nearest' });
    }
    // Live-preview the focused stage; restore the selected one on leaving the
    // row. The RANDOM card has no stage of its own to preview.
    if (el?.dataset?.stage && el.dataset.stage !== 'random') {
      this.onStagePreview?.(normalizeStageId(el.dataset.stage));
    } else if (prev?.dataset?.stage && this.stageId !== 'random') {
      this.onStagePreview?.(this.stageId);
    }
  }

  _activateFocus() {
    if (this._focusEl && this._focusGroups().some((group) => group.includes(this._focusEl))) {
      this._focusEl.click();
      return;
    }
    // Nothing focused: Enter/A is a shortcut for the main action button.
    if (this.startBtn && !this.startBtn.disabled && this.startBtn.offsetParent !== null && !this._onlineBusy) {
      this.startBtn.click();
    }
  }
}
