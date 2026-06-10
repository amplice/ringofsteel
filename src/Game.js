import * as THREE from 'three';
import { Renderer } from './core/Renderer.js';
import { Clock } from './core/Clock.js';
import { InputManager } from './core/InputManager.js';
import { Arena } from './arena/Arena.js';
import { StageLoader } from './arena/StageLoader.js';
import { Environment } from './arena/Environment.js';
import { CameraController } from './camera/CameraController.js';
import { Fighter } from './entities/Fighter.js';
import { ModelLoader } from './entities/ModelLoader.js';
import { CHARACTER_DEFS, DEFAULT_CHAR } from './entities/CharacterDefs.js';
import { ParticleSystem } from './vfx/ParticleSystem.js';
import { ScreenEffects } from './vfx/ScreenEffects.js';
import { AIController } from './ai/AIController.js';
import { PlannerAIController } from './ai/PlannerAIController.js';
import { DEFAULT_HARD_AI_PROFILES, resolveHardAIProfile } from './ai/HardAIMatchupProfiles.js';
import { HumanAIMatchRecorder } from './ai/HumanAIMatchRecorder.js';
import { DebugOverlay } from './debug/DebugOverlay.js';
import { UIManager } from './ui/UIManager.js';
import { MatchSim } from './sim/MatchSim.js';
import { captureInputFrame } from './sim/InputFrame.js';
import { OnlineSession } from './net/OnlineSession.js';
import { SoundManager } from './audio/SoundManager.js';
import { listAudioAssets } from './audio/AudioCatalog.js';
import { GameAudio } from './audio/GameAudio.js';
import { DEFAULT_STAGE, STAGE_DEFS, normalizeStageId } from './arena/StageDefs.js';
import {
  GameState, HitResult,
  FIGHT_START_DISTANCE, ROUNDS_TO_WIN, ROUND_INTRO_DURATION,
  ROUND_END_DELAY,
} from './core/Constants.js';

const AI_DIFFICULTY_PROFILE_MAP = Object.freeze({
  spearman: Object.freeze({
    easy: 'spearman_heavy_bully',
    medium: 'spearman_evasive',
    hard: DEFAULT_HARD_AI_PROFILES.spearman,
  }),
  ronin: Object.freeze({
    easy: 'ronin_lancer',
    medium: 'ronin_duelist',
    hard: DEFAULT_HARD_AI_PROFILES.ronin,
  }),
  knight: Object.freeze({
    easy: 'knight_bulwark',
    medium: 'knight_duelist',
    hard: DEFAULT_HARD_AI_PROFILES.knight,
  }),
  huscarl: Object.freeze({
    easy: 'scrapper',
    medium: 'huscarl_raider',
    hard: DEFAULT_HARD_AI_PROFILES.huscarl,
  }),
});


export class Game {
  constructor() {
    this.renderer = new Renderer();
    this.clock = new Clock();
    this.input = new InputManager();
    this.ui = new UIManager();
    this.screenEffects = new ScreenEffects();
    this.sound = new SoundManager();
    this.gameAudio = new GameAudio(this.sound);

    this.scene = null;
    this.camera = null;
    this.arena = null;
    this.environment = null;
    this.particles = null;

    this.fighter1 = null;
    this.fighter2 = null;
    this.aiController = null;
    this.aiController1 = null;
    this.aiController2 = null;
    this.aiMatchRecorder = new HumanAIMatchRecorder();
    this.matchSim = null;
    this.onlineSession = null;
    this.onlineDiscoverySession = null;
    this.onlineLobbyRefreshTimer = null;
    this.onlineLocalSlot = null;
    this.onlineMatchPlayers = null;
    this._suppressOnlineClose = false;
    this.onlinePendingMatchResult = null;
    this.onlinePingMs = null;
    this._charCache = {};
    this._stageCache = {};

    this.gameState = GameState.TITLE;
    this.stateTimer = 0;

    // Match state
    this.mode = 'ai';
    this.difficulty = 'medium';
    this.currentStageId = DEFAULT_STAGE;
    this.p1Score = 0;
    this.p2Score = 0;
    this.currentRound = 1;
    this.killSlowMoTimer = 0;
    this.animationSandbox = null;
    this.debugOverlay = null;
    this._lastFrameStats = { steps: 0, rawDelta: 0 };
  }

  async init() {
    this.ui.showLoading(0.05, 'Booting renderer...');
    await this.renderer.init();
    this.ui.showLoading(0.15, 'Preparing arena...');

    this.scene = new THREE.Scene();
    this.cameraController = new CameraController();
    this.camera = this.cameraController.camera;

    this.arena = new Arena(this.scene, this.currentStageId);
    await this.arena.setStage(this.currentStageId);
    this.environment = new Environment(this.scene);
    this.particles = new ParticleSystem(this.scene);
    this.debugOverlay = new DebugOverlay(this.scene);

    // Preload all characters with explicit progress so startup doesn't look dead.
    const charEntries = Object.entries(CHARACTER_DEFS);
    for (let i = 0; i < charEntries.length; i++) {
      const [id, def] = charEntries[i];
      const progressBase = 0.2 + (i / Math.max(charEntries.length, 1)) * 0.52;
      this.ui.showLoading(progressBase, `Loading ${def.displayName}...`);
      try {
        this._charCache[id] = await ModelLoader.loadCharacter(def);
      } catch (err) {
        console.warn(`Failed to load character '${id}':`, err);
      }
      const progressDone = 0.2 + ((i + 1) / Math.max(charEntries.length, 1)) * 0.52;
      this.ui.showLoading(progressDone, `Loaded ${def.displayName}`);
    }
    this.ui.select.setCharacterPreviewCache(this._charCache);
    this.ui.victory.setCharacterPreviews(this.ui.select.getCharacterPreviewImages());

    const stageEntries = Object.entries(STAGE_DEFS);
    for (let i = 0; i < stageEntries.length; i++) {
      const [id, stage] = stageEntries[i];
      const progressBase = 0.74 + (i / Math.max(stageEntries.length, 1)) * 0.18;
      this.ui.showLoading(progressBase, `Loading ${stage.displayName}...`);
      try {
        this._stageCache[id] = await StageLoader.preloadStage(stage);
      } catch (err) {
        console.warn(`Failed to preload stage '${stage.id}':`, err);
        this._stageCache[id] = {
          stageId: id,
          paths: StageLoader.getAssetPaths(stage),
          assets: [],
          failed: true,
        };
      }
      const progressDone = 0.74 + ((i + 1) / Math.max(stageEntries.length, 1)) * 0.18;
      this.ui.showLoading(progressDone, `Loaded ${stage.displayName}`);
    }
    this.ui.showLoading(0.95, 'Finalizing interface...');
    HumanAIMatchRecorder.installWindowApi();
    this.gameAudio.preload(listAudioAssets()).catch((error) => {
      console.warn('[sound] preload failed', error);
    });

    // UI
    this.ui.showTitle();

    this.ui.title.onStart = () => {
      this.sound.unlock().catch(() => {});
      this._stopAttract();
      this._disconnectDiscoverySession();
      this._stopOnlineLobbyRefresh();
      this._disconnectOnlineSession();
      this.gameState = GameState.SELECT;
      this.ui.showSelect();
      this.ui.select.resetOnlineState();
      this.ui.select.setPublicLobbies([]);
      this.ui.select.setOnlineStatus('Browse a public room, host one, quick match, or enter a direct code manually.');
    };

    this.ui.title.onAnimPlayer = async () => {
      this.sound.unlock().catch(() => {});
      this._stopAttract();
      await this._startAnimationSandbox();
    };

    this.ui.select.onConfirm = async (config) => {
      this.sound.unlock().catch(() => {});
      this.mode = config.mode;
      this.difficulty = config.difficulty;
      this.currentStageId = normalizeStageId(config.stageId);
      if (config.mode === 'online') {
        await this._startOnlineSession(config);
        return;
      }
      if (config.mode === 'gauntlet') {
        await this._startGauntlet(config.p1Char);
        return;
      }
      await this._startMatch(config.p1Char, config.p2Char);
    };
    this.ui.select.onModeChange = async (mode) => {
      if (mode === 'online') {
        this._startOnlineLobbyRefresh();
        await this._refreshPublicLobbies();
      } else {
        this._stopOnlineLobbyRefresh();
        this._disconnectDiscoverySession();
      }
    };
    this.ui.select.onStagePreview = async (stageId) => {
      await this._previewSelectStage(stageId);
    };
    this.ui.select.onOnlineHostPublic = async (config) => {
      await this._hostPublicOnline(config);
    };
    this.ui.select.onOnlineQuickMatch = async (config) => {
      await this._startQuickMatch(config);
    };
    this.ui.select.onOnlineRefresh = async (config) => {
      await this._refreshPublicLobbies(config.serverUrl);
    };
    this.ui.select.onOnlineJoinPublic = async (config) => {
      await this._startOnlineSession(config);
    };
    this.ui.select.onLeaveOnline = () => {
      this._stopOnlineLobbyRefresh();
      this._disconnectDiscoverySession();
      this._disconnectOnlineSession();
      this._cleanupFighters();
      this.gameState = GameState.SELECT;
      this.ui.showSelect();
      this.ui.select.resetOnlineState();
      this.ui.select.setPublicLobbies([]);
      this.ui.select.setOnlineStatus('Disconnected. Browse a public room, host one, quick match, or enter a direct code manually.');
    };

    this.ui.select.onIdle = () => {
      if (this.gameState === GameState.SELECT) this._exitToTitle();
    };

    this.ui.victory.onContinue = () => this._exitToTitle();

    this.ui.victory.onRematch = async () => {
      this.sound.unlock().catch(() => {});
      if (this.mode === 'online') {
        // Online rematch is a fresh ready handshake in the same lobby; the
        // match starts when the opponent agrees (server sends match_start).
        if (!this.onlineSession?.connected) return;
        try {
          this.onlineSession.setReady(true);
          this.ui.victory.setRematchWaiting('WAITING FOR OPPONENT...');
        } catch (err) {
          console.error('Failed to request online rematch:', err);
        }
        return;
      }
      if (this.mode === 'gauntlet' && this._gauntlet) {
        await this._startGauntletMatch();
        return;
      }
      if (!this._lastMatchChars) return;
      await this._startMatch(this._lastMatchChars.p1Char, this._lastMatchChars.p2Char);
    };

    this.ui.victory.onCharacterSelect = () => this._exitToSelect();

    this.ui.pause.onResume = () => this._resumeFromPause();
    this.ui.pause.onCharacterSelect = () => this._exitToSelect();
    this.ui.pause.onMainMenu = () => this._exitToTitle();
    this.ui.pause.onDummyCycle = () => {
      const order = ['manual', 'block', 'attack'];
      this.trainingDummyMode = order[(order.indexOf(this.trainingDummyMode) + 1) % order.length];
      this.ui.pause.setDummyControl(true, this.trainingDummyMode);
    };

    window.addEventListener('keydown', (e) => {
      if (e._fromGamepad) return;
      if (e.code === 'Escape' && this.gameState === GameState.FIGHTING) {
        this._pauseMatch();
      } else if (e.code === 'KeyM' && !e.target?.closest?.('input, textarea, [contenteditable]')) {
        this._syncMuteIndicator(this.sound.toggleMuted());
      }
    });
    this._syncMuteIndicator(this.sound.muted);

    this._startAttract();

    this.clock.start();
    this._loop();
  }

  _getCharData(charId) {
    const id = CHARACTER_DEFS[charId] ? charId : DEFAULT_CHAR;
    const def = CHARACTER_DEFS[id];
    const animData = this._charCache[id];
    if (!animData) {
      throw new Error(`Character asset '${id}' failed to load.`);
    }
    return { animData, charDef: def, resolvedId: id };
  }

  async _previewSelectStage(stageId) {
    if (this.gameState !== GameState.SELECT) return;
    const normalized = normalizeStageId(stageId);
    this.currentStageId = normalized;
    this._cleanupFighters();
    if (this.arena?.stageId !== normalized) {
      await this.arena?.setStage(normalized);
    }
    this._setSelectStageCamera(normalized);
  }

  _setSelectStageCamera(stageId) {
    const stage = STAGE_DEFS[stageId] ?? STAGE_DEFS[DEFAULT_STAGE];
    const radius = stage.bounds?.type === 'rect'
      ? Math.max(stage.bounds.halfWidth ?? 4, stage.bounds.halfDepth ?? 4)
      : stage.bounds?.radius ?? 4;
    const presets = {
      wooden_pier: { position: [0, 5.1, 7.4], lookAt: [0, 0.45, 0], fov: 48 },
      mountaintop: { position: [0, 4.7, 8.2], lookAt: [0, 0.55, 0], fov: 48 },
      amphitheater: { position: [0, 5.2, 7.8], lookAt: [0, 0.45, 0], fov: 50 },
      bamboo_clearing: { position: [0, 4.6, 7.3], lookAt: [0, 0.55, 0], fov: 48 },
      test: { position: [0, 5.0, 7.8], lookAt: [0, 0.35, 0], fov: 50 },
    };
    const preset = presets[stageId] ?? {
      position: [0, Math.max(4.3, radius * 1.1), Math.max(7.0, radius * 1.8)],
      lookAt: [0, 0.45, 0],
      fov: 50,
    };
    this.camera.fov = preset.fov;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(...preset.position);
    this.camera.lookAt(new THREE.Vector3(...preset.lookAt));
    this.cameraController.currentLookAt.set(...preset.lookAt);
    this.cameraController.targetLookAt.set(...preset.lookAt);
    this.cameraController.targetPosition.copy(this.camera.position);
  }

  // Gauntlet: face every other character with ramping difficulty, then a
  // hard mirror match as the finale. Random opponent order, rotating stages.
  async _startGauntlet(p1Char) {
    const others = Object.keys(CHARACTER_DEFS).filter((id) => id !== p1Char);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    const stageIds = Object.keys(STAGE_DEFS).filter((id) => id !== 'test');
    this._gauntlet = {
      player: p1Char,
      opponents: [...others, p1Char],
      stageIds,
      stageOffset: Math.floor(Math.random() * stageIds.length),
      index: 0,
      elapsed: 0,
    };
    await this._startGauntletMatch();
  }

  async _startGauntletMatch() {
    const g = this._gauntlet;
    if (!g) return;
    const total = g.opponents.length;
    this.difficulty = g.index === 0 ? 'easy' : g.index === total - 1 ? 'hard' : 'medium';
    this.currentStageId = normalizeStageId(g.stageIds[(g.stageOffset + g.index) % g.stageIds.length]);
    await this._startMatch(g.player, g.opponents[g.index]);
  }

  _endGauntletMatch(playerWon) {
    this.gameState = GameState.VICTORY;
    const g = this._gauntlet;
    const total = g?.opponents.length ?? 0;
    const detail = {
      winnerCharId: this._resolveWinnerCharId(),
      allowRematch: true,
      stats: this._buildMatchStatsLine(),
    };

    if (!playerWon) {
      this.ui.showVictory('COMPUTER', this.p1Score, this.p2Score, {
        ...detail,
        title: 'GAUNTLET FAILED',
        primaryLabel: 'TRY AGAIN',
      });
      return;
    }

    g.index++;
    if (g.index >= total) {
      this.ui.showVictory('PLAYER 1', this.p1Score, this.p2Score, {
        ...detail,
        title: 'GAUNTLET COMPLETE',
        subtitle: this._recordGauntletClear(g),
        allowRematch: false,
      });
      this._gauntlet = null;
      return;
    }

    const next = CHARACTER_DEFS[g.opponents[g.index]]?.displayName?.toUpperCase() ?? 'NEXT FOE';
    this.ui.showVictory('PLAYER 1', this.p1Score, this.p2Score, {
      ...detail,
      title: `FOE ${g.index}/${total} DEFEATED`,
      primaryLabel: `NEXT: ${next}`,
    });
  }

  // Persist the fastest clear per fighter; returns the line shown under
  // GAUNTLET COMPLETE, e.g. "CLEARED IN 2:43 - NEW BEST".
  _recordGauntletClear(g) {
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const key = `ring-of-steel-gauntlet-best-${g.player}`;
    let best = null;
    try {
      const saved = Number(window.localStorage?.getItem(key));
      best = Number.isFinite(saved) && saved > 0 ? saved : null;
      if (best === null || g.elapsed < best) {
        window.localStorage?.setItem(key, String(g.elapsed));
      }
    } catch {
      // Storage unavailable — still show the clear time.
    }
    const isNewBest = best === null || g.elapsed < best;
    return `CLEARED IN ${fmt(g.elapsed)}${isNewBest ? ' · NEW BEST' : ` · BEST ${fmt(best)}`}`;
  }

  _exitToTitle() {
    this._stopOnlineLobbyRefresh();
    this._disconnectDiscoverySession();
    this._disconnectOnlineSession();
    this.gameState = GameState.TITLE;
    this._cleanupFighters();
    this.ui.showTitle();
    this._startAttract();
  }

  // Attract mode: an endless AI duel behind the title screen. Silent (no
  // audio/vfx events) and torn down the moment the player moves on.
  async _startAttract() {
    if (this._attractActive || this._attractStarting || this.gameState !== GameState.TITLE) return;
    this._attractStarting = true;
    try {
      const charIds = Object.keys(CHARACTER_DEFS).filter((id) => this._charCache[id]);
      if (!charIds.length) return;
      const pick = () => charIds[Math.floor(Math.random() * charIds.length)];
      const stageIds = Object.keys(STAGE_DEFS).filter((id) => id !== 'test');
      const stageId = normalizeStageId(stageIds[Math.floor(Math.random() * stageIds.length)] ?? this.currentStageId);

      await this.arena.setStage(stageId);
      if (this.gameState !== GameState.TITLE) return;

      const { p1, p2 } = this._spawnFighters(pick(), pick());
      this.aiController1 = this._createCpuController(p1.charDef.id, 'medium', p2.charDef.id);
      this.aiController2 = this._createCpuController(p2.charDef.id, 'medium', p1.charDef.id);
      this.matchSim = new MatchSim({
        fighter1: this.fighter1,
        fighter2: this.fighter2,
        stageId,
      });
      this.matchSim.startRound(FIGHT_START_DISTANCE);
      this._attractActive = true;
      this._attractRestartTimer = 0;
      this.ui.title.el?.classList.add('attract');
    } catch (err) {
      console.warn('Attract mode failed to start:', err);
    } finally {
      this._attractStarting = false;
    }
  }

  _stopAttract() {
    this.ui.title.el?.classList.remove('attract');
    if (!this._attractActive) return;
    this._attractActive = false;
    this._cleanupFighters();
  }

  _updateAttract(dt) {
    if (!this._attractActive || !this.matchSim) return;
    const controller1 = (fighter, opponent, sim, simDt) => {
      this.aiController1?.update(fighter, opponent, sim.frameCount, simDt);
    };
    const controller2 = (fighter, opponent, sim, simDt) => {
      this.aiController2?.update(fighter, opponent, sim.frameCount, simDt);
    };
    const step = this.matchSim.step(dt, { controller1, controller2 });
    if (step.roundOver) {
      this._attractRestartTimer += dt;
      if (this._attractRestartTimer > 2.0) {
        this._attractRestartTimer = 0;
        this.matchSim.startRound(FIGHT_START_DISTANCE);
        this.aiController1?.reset();
        this.aiController2?.reset();
      }
    }
  }

  _exitToSelect() {
    this._stopOnlineLobbyRefresh();
    this._disconnectDiscoverySession();
    this._disconnectOnlineSession();
    this._cleanupFighters();
    this.gameState = GameState.SELECT;
    this.ui.showSelect();
    this.ui.select.resetOnlineState();
    this.ui.select.setPublicLobbies([]);
    this.ui.select.setOnlineStatus('Browse a public room, host one, quick match, or enter a direct code manually.');
  }

  // One-line feedback in training: what the last exchange was and how it
  // resolved, from the player's perspective.
  _updateTrainingReadout(event) {
    const el = document.getElementById('training-readout');
    if (!el) return;
    const type = (event.attackerType ?? '').toUpperCase();
    const youAttacked = event.attackerIndex === 0;
    let text;
    switch (event.result) {
      case HitResult.CLASH:
        text = `CLASH — ${type}`;
        break;
      case HitResult.PARRIED:
        text = youAttacked ? `YOUR ${type} WAS PARRIED` : `YOU PARRIED THE ${type}`;
        break;
      case HitResult.BLOCKED:
        text = youAttacked ? `YOUR ${type} WAS BLOCKED` : `YOU BLOCKED THE ${type}`;
        break;
      case HitResult.LETHAL_HIT:
        text = youAttacked ? `${type} — CLEAN HIT` : `HIT BY ${type}`;
        break;
      default:
        return;
    }
    el.textContent = text;
    el.classList.add('visible');
    window.clearTimeout(this._trainingReadoutTimer);
    this._trainingReadoutTimer = window.setTimeout(() => el.classList.remove('visible'), 2500);
  }

  // Training kills skip the kill cam and round flow entirely — the round
  // restarts in place so practice keeps its rhythm.
  _resetTrainingRound() {
    this._resetCombatPresentation();
    this.matchSim?.startRound(FIGHT_START_DISTANCE);
    this.gameAudio.resetFighterState([this.fighter1, this.fighter2]);
    this.ui.hud.reset();
    this.input.clearBuffers();
    this._dummyNextAttackFrame = 0;
  }

  // Layer the selected dummy behavior on top of any real P2 input.
  _applyDummyBehavior(input) {
    if (this.trainingDummyMode === 'block') {
      input.held.block = true;
    } else if (this.trainingDummyMode === 'attack') {
      const frame = this.matchSim?.frameCount ?? 0;
      if (frame >= this._dummyNextAttackFrame) {
        const attacks = ['quick', 'heavy', 'thrust'];
        input.pressed[attacks[Math.floor(Math.random() * attacks.length)]] = true;
        this._dummyNextAttackFrame = frame + 45 + Math.floor(Math.random() * 75);
      }
    }
  }

  _syncMuteIndicator(muted) {
    const el = document.getElementById('mute-indicator');
    if (el) el.style.display = muted ? 'block' : 'none';
  }

  _pauseMatch() {
    if (this.gameState !== GameState.FIGHTING || this.mode === 'online') return;
    this.gameState = GameState.PAUSED;
    this.ui.pause.setDummyControl(this.mode === 'training', this.trainingDummyMode);
    this.ui.pause.show();
  }

  _resumeFromPause() {
    if (this.gameState !== GameState.PAUSED) return;
    this.gameState = GameState.FIGHTING;
    this.ui.pause.hide();
  }

  async _startMatch(p1Char, p2Char) {
    this._lastMatchChars = { p1Char, p2Char };
    this.trainingDummyMode = 'manual';
    this._dummyNextAttackFrame = 0;
    this._disconnectOnlineSession();
    this._resetMatchScoreState();
    await this.arena?.setStage(this.currentStageId);
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();

    const { p1, p2 } = this._spawnFighters(p1Char, p2Char);

    // AI
    if (this.mode === 'watch') {
      this.aiController1 = this._createCpuController(p1.charDef.id, this.difficulty, p2.charDef.id);
      this.aiController2 = this._createCpuController(p2.charDef.id, this.difficulty, p1.charDef.id);
      this.aiController = this.aiController2;
      this.aiMatchRecorder.discard();
    } else if (this.mode === 'ai' || this.mode === 'gauntlet') {
      this.aiController1 = null;
      this.aiController2 = this._createCpuController(p2.charDef.id, this.difficulty, p1.charDef.id);
      this.aiController = this.aiController2;
      if (this.mode === 'ai') {
        this.aiMatchRecorder.startMatch({
          mode: 'ai',
          fighter1Char: p1.charDef.id,
          fighter2Char: p2.charDef.id,
          playerChar: p1.charDef.id,
          aiChar: p2.charDef.id,
          difficulty: this.difficulty,
          aiMeta: this.aiController.getDebugSnapshot?.() ?? null,
        });
      } else {
        this.aiMatchRecorder.discard();
      }
    } else {
      this.aiController = null;
      this.aiController1 = null;
      this.aiController2 = null;
      this.aiMatchRecorder.discard();
    }
    this.matchSim = new MatchSim({
      fighter1: this.fighter1,
      fighter2: this.fighter2,
      stageId: this.currentStageId,
    });

    this.ui.showHUD();
    if (this.input.touch.available && this.mode !== 'watch') {
      this.input.touch.show();
    }
    this.ui.hud.setFighterNames(
      this.mode === 'watch' ? 'AI 1' : 'PLAYER 1',
      this.mode === 'ai'
        ? 'COMPUTER'
        : this.mode === 'watch'
          ? 'AI 2'
          : this.mode === 'training'
            ? 'DUMMY'
            : this.mode === 'gauntlet'
              ? `${(p2.charDef.displayName ?? 'FOE').toUpperCase()} ${this._gauntlet ? `${this._gauntlet.index + 1}/${this._gauntlet.opponents.length}` : ''}`.trim()
              : 'PLAYER 2',
    );
    this.ui.hud.setFighterLoadouts(p1.charDef, p2.charDef);
    this.ui.hud.updateRoundPips(0, 0);
    this.ui.hud.setOnlineMeta({ visible: false });
    this._startRound();
  }

  _attachWeapon(fighter) {
    // Skip if weapon is baked into the model (e.g. spearman GLB includes the spear)
    if (fighter.charDef.bakeWeapon) return;

    let handBone = null;
    fighter.root.traverse((child) => {
      if (child.isBone) {
        const n = ModelLoader._normalizeBoneName(child.name);
        if (ModelLoader.RIGHT_HAND_BONE_NAMES.includes(n)) {
          handBone = child;
        }
      }
    });
    if (handBone) {
      const s = 1 / fighter.root.scale.x;
      fighter.weapon.mesh.scale.setScalar(s);
      handBone.add(fighter.weapon.mesh);
    } else {
      fighter.weapon.mesh.position.set(0.3, 1.2, 0);
      fighter.root.add(fighter.weapon.mesh);
    }
  }

  _startRound() {
    this.gameState = GameState.ROUND_INTRO;
    this.stateTimer = 0;
    this._resetCombatPresentation();

    this.matchSim?.startRound(FIGHT_START_DISTANCE);
    this.aiController1?.reset();
    this.aiController2?.reset();
    this.gameAudio.resetFighterState([this.fighter1, this.fighter2]);

    this.ui.hud.reset();
    this.ui.hud.updateRoundPips(this.p1Score, this.p2Score);
    this.ui.hud.showRoundAnnounce(this.currentRound);
    if (this.mode === 'ai' && this.fighter1 && this.fighter2) {
      this.aiMatchRecorder.startRound({
        roundNumber: this.currentRound,
        fighter1: this.fighter1,
        fighter2: this.fighter2,
        aiMeta: this.aiController?.getDebugSnapshot?.() ?? null,
        frameCount: this.matchSim?.frameCount ?? 0,
      });
    }

    this.input.clearBuffers();
  }

  _getAIDifficultyProfile(charId, difficulty, opponentCharId = null) {
    if (difficulty === 'hard') return resolveHardAIProfile(charId, opponentCharId);
    const charProfiles = AI_DIFFICULTY_PROFILE_MAP[charId];
    if (charProfiles && charProfiles[difficulty]) return charProfiles[difficulty];
    return difficulty;
  }

  _createCpuController(charId, difficulty, opponentCharId = null) {
    const aiProfile = this._getAIDifficultyProfile(charId, difficulty, opponentCharId);
    return difficulty === 'hard'
      ? new PlannerAIController(aiProfile)
      : new AIController(aiProfile);
  }

  _resetMatchScoreState() {
    this.p1Score = 0;
    this.p2Score = 0;
    this.currentRound = 1;
    this._matchStats = {
      parries: [0, 0],
      blocks: [0, 0],
      clashes: 0,
      roundTimes: [],
    };
  }

  _recordStatsEvent(event) {
    const s = this._matchStats;
    if (!s || event.type !== 'combat_result') return;
    if (event.result === HitResult.PARRIED && event.defenderIndex !== undefined) {
      s.parries[event.defenderIndex]++;
    } else if (event.result === HitResult.BLOCKED && event.defenderIndex !== undefined) {
      s.blocks[event.defenderIndex]++;
    } else if (event.result === HitResult.CLASH) {
      s.clashes++;
    }
  }

  _buildMatchStatsLine() {
    const s = this._matchStats;
    if (!s) return null;
    const parts = [
      `PARRIES ${s.parries[0]}-${s.parries[1]}`,
      `BLOCKS ${s.blocks[0]}-${s.blocks[1]}`,
      `CLASHES ${s.clashes}`,
    ];
    if (s.roundTimes.length) {
      parts.push(`FASTEST KILL ${Math.min(...s.roundTimes).toFixed(1)}S`);
    }
    return parts.join(' · ');
  }

  _resetCombatPresentation() {
    this.clock.setTimeScale(1.0);
    this.killSlowMoTimer = 0;
    this._killRealStart = null;
    this.cameraController.stopKillCam();
    this.cameraController.reset();
    this.particles.reset();
    this.screenEffects.reset();
  }

  _spawnFighters(p1Char, p2Char) {
    this._cleanupFighters();

    const p1 = this._getCharData(p1Char);
    const p2 = this._getCharData(p2Char);
    this.fighter1 = new Fighter(0, 0x991111, p1.charDef, p1.animData);
    this.fighter2 = new Fighter(1, 0x112266, p2.charDef, p2.animData);
    this.fighter1.addToScene(this.scene);
    this.fighter2.addToScene(this.scene);
    this._attachWeapon(this.fighter1);
    this._attachWeapon(this.fighter2);
    this.gameAudio.resetFighterState([this.fighter1, this.fighter2]);

    return { p1, p2 };
  }

  _cleanupFighters() {
    this.input.touch.hide();
    if (this.fighter1) {
      this.fighter1.removeFromScene(this.scene);
      this.fighter1 = null;
    }
    if (this.fighter2) {
      this.fighter2.removeFromScene(this.scene);
      this.fighter2 = null;
    }
    this.matchSim = null;
    this.aiController = null;
    this.aiController1 = null;
    this.aiController2 = null;
    this.gameAudio.resetFighterState([]);
  }

  async _startOnlineSession(config) {
    this.mode = 'online';
    this.difficulty = config.difficulty ?? this.difficulty;
    const requestedUrl = config.serverUrl || undefined;
    const requestedCode = config.lobbyCode || '';
    this._stopOnlineLobbyRefresh();
    this._disconnectDiscoverySession();

    if (
      this.onlineSession?.connected &&
      this.onlineSession?.lobbyCode &&
      this.onlineSession.url === requestedUrl &&
      (!requestedCode || requestedCode === this.onlineSession.lobbyCode)
    ) {
      this.onlineSession.setCharacter(config.p1Char);
      this.ui.select.setOnlineStatus(
        this.onlineSession.lobbyCode
          ? `LOBBY ${this.onlineSession.lobbyCode}. STILL CONNECTED.`
          : 'STILL CONNECTED.'
      );
      return;
    }

    this._disconnectOnlineSession();
    this.ui.select.setOnlineBusy(true);
    this.ui.select.setOnlineLocked(false);
    this._cleanupFighters();
    this.aiController = null;
    this.aiController1 = null;
    this.aiController2 = null;
    this.matchSim = null;
    this._resetMatchScoreState();
    this.onlinePendingMatchResult = null;
    this._resetCombatPresentation();

    const session = new OnlineSession({ url: requestedUrl });
    this.onlineSession = session;
    this.onlineLocalSlot = null;
    this.onlineMatchPlayers = null;
    this._bindOnlineSession(session);
    this.ui.select.setOnlineStatus('CONNECTING TO SERVER...');

    try {
      await session.connect();
      if (requestedCode) {
        await session.joinLobby(requestedCode, config.p1Char);
      } else {
        await session.createLobby(config.p1Char, 'private', this.currentStageId);
      }
      session.setReady(true);
      this.ui.select.setOnlineBusy(false);
      this.ui.select.setOnlineLocked(true);
      this.ui.select.setOnlineStatus(
        requestedCode ? 'JOINED LOBBY. WAITING FOR MATCH...' : 'LOBBY CREATED. SHARE THE CODE AND WAIT FOR OPPONENT...'
      );
    } catch (err) {
      console.error('Online session failed to start:', err);
      this.ui.select.setOnlineBusy(false);
      this.ui.select.setOnlineLocked(false);
      this.ui.select.setOnlineStatus(`CONNECTION FAILED: ${err?.message || 'UNKNOWN ERROR'}`);
      this._disconnectOnlineSession();
    }
  }

  async _hostPublicOnline(config) {
    this.mode = 'online';
    const requestedUrl = config.serverUrl || undefined;
    this._stopOnlineLobbyRefresh();
    this._disconnectDiscoverySession();
    this._disconnectOnlineSession();
    this.ui.select.setOnlineBusy(true);
    this.ui.select.setOnlineLocked(false);
    this.ui.select.setOnlineStatus('CREATING PUBLIC MATCH...');

    try {
      const session = new OnlineSession({ url: requestedUrl });
      this.onlineSession = session;
      this.onlineLocalSlot = null;
      this.onlineMatchPlayers = null;
      this._bindOnlineSession(session);
      await session.connect();
      await session.createLobby(config.p1Char, 'public', this.currentStageId);
      session.setReady(true);
      this.ui.select.setOnlineBusy(false);
      this.ui.select.setOnlineLocked(true);
      this.ui.select.setOnlineStatus(`PUBLIC LOBBY ${session.lobbyCode}. WAITING FOR OPPONENT...`);
    } catch (err) {
      console.error('Public host failed:', err);
      this.ui.select.setOnlineBusy(false);
      this.ui.select.setOnlineLocked(false);
      this.ui.select.setOnlineStatus(`HOST FAILED: ${err?.message || 'UNKNOWN ERROR'}`);
      this._disconnectOnlineSession();
    }
  }

  async _startQuickMatch(config) {
    this.mode = 'online';
    const requestedUrl = config.serverUrl || undefined;
    this._stopOnlineLobbyRefresh();
    this._disconnectDiscoverySession();
    this._disconnectOnlineSession();
    this.ui.select.setOnlineBusy(true);
    this.ui.select.setOnlineLocked(false);
    this.ui.select.setOnlineStatus('FINDING PUBLIC MATCH...');

    try {
      const session = new OnlineSession({ url: requestedUrl });
      this.onlineSession = session;
      this.onlineLocalSlot = null;
      this.onlineMatchPlayers = null;
      this._bindOnlineSession(session);
      await session.connect();
      await session.quickMatch(config.p1Char, this.currentStageId);
      session.setReady(true);
      this.ui.select.setOnlineBusy(false);
      this.ui.select.setOnlineLocked(true);
      this.ui.select.setOnlineStatus(`LOBBY ${session.lobbyCode}. WAITING FOR OPPONENT...`);
    } catch (err) {
      console.error('Quick match failed:', err);
      this.ui.select.setOnlineBusy(false);
      this.ui.select.setOnlineLocked(false);
      this.ui.select.setOnlineStatus(`QUICK MATCH FAILED: ${err?.message || 'UNKNOWN ERROR'}`);
      this._disconnectOnlineSession();
    }
  }

  async _refreshPublicLobbies(serverUrl = null) {
    const requestedUrl = serverUrl || this.ui.select.onlineServerUrl?.value?.trim() || undefined;
    let session = this.onlineDiscoverySession;

    try {
      if (!session || !session.connected || (requestedUrl && session.url !== requestedUrl)) {
        if (session) {
          session.disconnect();
        }
        session = new OnlineSession({ url: requestedUrl });
        session.addEventListener('lobby_list', (event) => {
          this.ui.select.setPublicLobbies(event.detail?.lobbies ?? []);
        });
        this.onlineDiscoverySession = session;
        await session.connect();
      }

      const result = await session.listLobbies();
      this.ui.select.setPublicLobbies(result?.lobbies ?? []);
      if (!this.ui.select.onlineLobbyCode?.value) {
        this.ui.select.setOnlineStatus('Browse a public room, host one, quick match, or enter a direct code manually.');
      }
    } catch (err) {
      console.error('Public lobby refresh failed:', err);
      this.ui.select.setPublicLobbies([]);
      this.ui.select.setOnlineStatus(`LOBBY LIST FAILED: ${err?.message || 'UNKNOWN ERROR'}`);
    }
  }

  _disconnectDiscoverySession() {
    if (!this.onlineDiscoverySession) return;
    this.onlineDiscoverySession.disconnect();
    this.onlineDiscoverySession = null;
  }

  _bindOnlineSession(session) {
    session.addEventListener('error', (event) => {
      const detail = event.detail;
      const message = detail?.message || detail?.error?.message || 'NETWORK ERROR';
      console.error('Online session error:', detail);
      this.ui.select.setOnlineBusy(false);
      this.ui.select.setOnlineStatus(`ERROR: ${String(message).toUpperCase()}`);
    });

    session.addEventListener('close', (event) => {
      if (this._suppressOnlineClose) return;
      const code = event.detail?.code ?? null;
      const reason = event.detail?.reason ?? '';
      const message = code === 1012
        ? 'SERVER RESTARTED. REJOIN A MATCH.'
        : reason
          ? `DISCONNECTED: ${String(reason).toUpperCase()}`
          : 'DISCONNECTED FROM SERVER.';
      this._handleOnlineDisconnect(message);
    });

    session.addEventListener('lobby_list', (event) => {
      this.ui.select.setPublicLobbies(event.detail?.lobbies ?? []);
    });
    session.addEventListener('lobby_state', (event) => {
      this._handleOnlineLobbyState(event.detail);
    });
    session.addEventListener('match_start', (event) => {
      this._handleOnlineMatchStart(event.detail).catch((error) => {
        console.warn('[online] failed to start match', error);
      });
    });
    session.addEventListener('state_snapshot', (event) => {
      this._handleOnlineStateSnapshot(event.detail?.snapshot);
    });
    session.addEventListener('ping_update', (event) => {
      this.onlinePingMs = event.detail?.pingMs ?? null;
      this._updateHUD();
    });
    session.addEventListener('combat_event', (event) => {
      const combatEvent = event.detail?.event;
      if (combatEvent) {
        this._handleSimEvent(combatEvent);
      }
    });
    session.addEventListener('match_state', (event) => {
      this._handleOnlineMatchState(event.detail);
    });
  }

  _handleOnlineLobbyState(detail) {
    if (!detail) return;
    if (detail.stageId) {
      this.currentStageId = normalizeStageId(detail.stageId);
    }
    this.onlineMatchPlayers = detail.players ?? null;
    this.ui.select.setOnlineLobbyInfo(detail);
    const self = detail.players?.find((player) => player.self);
    if (self) {
      this.onlineLocalSlot = self.slot;
    }

    this.ui.select.setOnlineLobbyCode(detail.code || '');

    const connectedPlayers = detail.players?.filter((player) => player.connected).length ?? 0;
    if (
      this.mode === 'online' &&
      this.gameState !== GameState.SELECT &&
      detail.phase !== 'match_running' &&
      connectedPlayers < 2
    ) {
      this._handleOnlineDisconnect('OPPONENT DISCONNECTED.');
      return;
    }

    if (this.mode === 'online' && this.gameState === GameState.VICTORY) {
      const opponentReady = detail.players?.some(
        (player) => player.id !== this.onlineSession?.clientId && player.ready && player.connected
      );
      if (opponentReady) this.ui.victory.setOpponentWantsRematch();
      return;
    }

    this.ui.select.setOnlineBusy(false);
    this.ui.select.setOnlineLocked(Boolean(detail.code));
    if (detail.phase === 'match_running') {
      this.ui.select.setOnlineStatus('MATCH STARTING...');
    } else if (connectedPlayers < 2) {
      this.ui.select.setOnlineStatus(`LOBBY ${detail.code}. WAITING FOR OPPONENT...`);
    } else {
      this.ui.select.setOnlineStatus(`LOBBY ${detail.code}. OPPONENT CONNECTED. STARTING...`);
    }
  }

  async _handleOnlineMatchStart(detail) {
    if (!detail?.players) return;
    if (detail.stageId) {
      this.currentStageId = normalizeStageId(detail.stageId);
    }
    this.onlineMatchPlayers = detail.players;
    this.currentRound = detail.roundNumber ?? this.currentRound;
    if (Array.isArray(detail.scores)) {
      this.p1Score = detail.scores[0] ?? this.p1Score;
      this.p2Score = detail.scores[1] ?? this.p2Score;
    }
    this.onlinePendingMatchResult = null;
    const self = detail.players.find((player) => player.id === this.onlineSession?.clientId);
    if (self) {
      this.onlineLocalSlot = self.slot;
    }
    await this._startOnlineMatch(detail.players, detail.snapshot);
  }

  async _startOnlineMatch(players, snapshot = null) {
    this._resetCombatPresentation();
    await this.arena?.setStage(this.currentStageId);

    const sortedPlayers = [...players].sort((a, b) => a.slot - b.slot);
    const p1 = sortedPlayers[0];
    const p2 = sortedPlayers[1];
    if (!p1 || !p2) return;

    const spawned = this._spawnFighters(p1.characterId, p2.characterId);

    this.gameState = GameState.ROUND_INTRO;
    this.stateTimer = 0;
    this.ui.showHUD();
    if (this.input.touch.available && this.onlineLocalSlot !== null) {
      this.input.touch.show();
    }
    this.ui.hud.setFighterNames(
      this.onlineLocalSlot === 0 ? 'YOU' : 'OPPONENT',
      this.onlineLocalSlot === 1 ? 'YOU' : 'OPPONENT',
    );
    this.ui.hud.setFighterLoadouts(spawned.p1.charDef, spawned.p2.charDef);
    this.ui.hud.reset();
    this.ui.hud.updateRoundPips(this.p1Score, this.p2Score);
      this.ui.hud.setOnlineMeta({
        visible: true,
        status: this.onlineLocalSlot === 0 ? 'ONLINE P1' : 'ONLINE P2',
        code: this.onlineSession?.lobbyCode ?? '------',
        pingMs: this.onlinePingMs,
      });
      this.ui.hud.showRoundAnnounce(this.currentRound);
      this.gameAudio.resetFighterState([this.fighter1, this.fighter2]);
      this.input.clearBuffers();

    if (snapshot) {
      this._handleOnlineStateSnapshot(snapshot);
    }
  }

  _handleOnlineStateSnapshot(snapshot) {
    if (!snapshot || !this.fighter1 || !this.fighter2) return;
    const [fighter1Snapshot, fighter2Snapshot] = snapshot.fighters ?? [];
    if (fighter1Snapshot) this.fighter1.applyAuthoritativeSnapshot(fighter1Snapshot);
    if (fighter2Snapshot) this.fighter2.applyAuthoritativeSnapshot(fighter2Snapshot);
  }

  _handleOnlineMatchState(detail) {
    if (!detail) return;

    if (Array.isArray(detail.scores)) {
      this.p1Score = detail.scores[0] ?? this.p1Score;
      this.p2Score = detail.scores[1] ?? this.p2Score;
    }
    this.currentRound = detail.roundNumber ?? this.currentRound;

    if (detail.snapshot) {
      this._handleOnlineStateSnapshot(detail.snapshot);
    }

    if (
      (detail.phase === 'round_complete' || detail.phase === 'match_complete') &&
      detail.winner &&
      this.gameState === GameState.FIGHTING
    ) {
      this.onlinePendingMatchResult = detail;
      const killer = detail.winner === 1 ? this.fighter1 : this.fighter2;
      const victim = detail.winner === 1 ? this.fighter2 : this.fighter1;
      this._startKillPresentation(killer, victim, detail.killReason);
    }
  }

  _disconnectOnlineSession() {
    if (!this.onlineSession) return;
    this._suppressOnlineClose = true;
    this.onlineSession.disconnect();
    queueMicrotask(() => {
      this._suppressOnlineClose = false;
    });
    this.onlineSession = null;
    this.onlineLocalSlot = null;
    this.onlineMatchPlayers = null;
    this.onlinePendingMatchResult = null;
    this.onlinePingMs = null;
    this.ui.select.setOnlineBusy(false);
    this.ui.select.setOnlineLocked(false);
    this.ui.select.clearOnlineLobbyInfo();
    this.ui.hud.setOnlineMeta({ visible: false });
  }

  _handleOnlineDisconnect(message) {
    if (this.mode !== 'online') return;
    if (this.onlineSession) {
      this._suppressOnlineClose = true;
      this.onlineSession.disconnect();
      queueMicrotask(() => {
        this._suppressOnlineClose = false;
      });
    }
    this._startOnlineLobbyRefresh();
    this._cleanupFighters();
    this.matchSim = null;
    this.aiController = null;
    this.aiController1 = null;
    this.aiController2 = null;
    this.gameState = GameState.SELECT;
    this.ui.showSelect();
    this.ui.select.resetOnlineState();
    this.ui.select.clearOnlineLobbyInfo();
    this.ui.select.setOnlineStatus(message);
    this.ui.hud.setOnlineMeta({ visible: false });
    this.onlineSession = null;
    this.onlineLocalSlot = null;
    this.onlineMatchPlayers = null;
    this.onlinePendingMatchResult = null;
    this.onlinePingMs = null;
  }

  _startOnlineLobbyRefresh() {
    this._stopOnlineLobbyRefresh();
    this.onlineLobbyRefreshTimer = setInterval(() => {
      if (this.mode !== 'online') return;
      if (this.gameState !== GameState.SELECT) return;
      if (this.onlineSession?.lobbyCode) return;
      this._refreshPublicLobbies().catch((err) => {
        console.error('Lobby refresh tick failed:', err);
      });
    }, 2000);
  }

  _stopOnlineLobbyRefresh() {
    if (!this.onlineLobbyRefreshTimer) return;
    clearInterval(this.onlineLobbyRefreshTimer);
    this.onlineLobbyRefreshTimer = null;
  }

  async _startAnimationSandbox() {
    this._cleanupFighters();
    this.gameState = GameState.ANIM_PLAYER;

    if (!this.animationSandbox) {
      const { AnimationSandbox } = await import('./tools/AnimationSandbox.js');
      this.animationSandbox = new AnimationSandbox({
        scene: this.scene,
        camera: this.camera,
        cameraController: this.cameraController,
        environment: this.environment,
        input: this.input,
        ui: this.ui,
      });
      this.animationSandbox.onExit = () => {
        this._stopAnimationSandbox();
        this.gameState = GameState.TITLE;
        this.ui.showTitle();
      };
    }

    await this.animationSandbox.start();
  }

  _stopAnimationSandbox() {
    if (!this.animationSandbox) return;
    this.animationSandbox.stop();
  }

  _loop() {
    requestAnimationFrame(() => this._loop());

    const { steps, dt, rawDelta } = this.clock.update();
    this._lastFrameStats.steps = steps;
    this._lastFrameStats.rawDelta = rawDelta;

    for (let i = 0; i < steps; i++) {
      const frozen = this.screenEffects.update();
      if (frozen) continue;

      this._fixedUpdate(dt);
    }

    this._renderUpdate(rawDelta);
    this._updateDebugOverlay();
    this.renderer.render(this.scene, this.camera);
  }

  _fixedUpdate(dt) {
    this.input.update(this.clock.frameCount);

    if (this.input.gamepads.startPressed()) {
      if (this.gameState === GameState.FIGHTING) this._pauseMatch();
      else if (this.gameState === GameState.PAUSED) this._resumeFromPause();
    }

    switch (this.gameState) {
      case GameState.TITLE:
        this._updateAttract(dt);
        break;
      case GameState.ROUND_INTRO:
        this._updateRoundIntro(dt);
        break;
      case GameState.FIGHTING:
        this._updateFighting(dt);
        break;
      case GameState.KILL_CAM:
        this._updateKillCam(dt);
        break;
      case GameState.ROUND_END:
        this._updateRoundEnd(dt);
        break;
    }
  }

  _renderUpdate(dt) {
    if (this.gameState === GameState.ANIM_PLAYER) {
      if (this.animationSandbox) {
        this.animationSandbox.update(dt);
      }
      return;
    }

    if (
      this.mode === 'online' &&
      !this.matchSim &&
      this.fighter1 &&
      this.fighter2 &&
      this.gameState !== GameState.KILL_CAM
    ) {
      this.fighter1.updateRemoteView(dt);
      this.fighter2.updateRemoteView(dt);
    }

    if (this.fighter1 && this.fighter2) {
      if (!this._attractActive) {
        this.gameAudio.updateFighters([this.fighter1, this.fighter2]);
      }
      this.cameraController.update(dt, this.fighter1, this.fighter2);
    }

    if (this.gameState === GameState.KILL_CAM) {
      // Use real time for kill cam phases (not affected by time scale)
      const now = performance.now() / 1000;
      if (!this._killRealStart) this._killRealStart = now;
      const elapsed = now - this._killRealStart;

      // Phased slowmo: freeze → ultra slow → slow → end
      const FREEZE_END = 0.15;
      const ULTRA_SLOW_END = 1.0;
      const SLOW_END = 3.0;

      if (elapsed < FREEZE_END) {
        this.clock.setTimeScale(0.0);
      } else if (elapsed < ULTRA_SLOW_END) {
        // Ease from 0 to 0.1
        const t = (elapsed - FREEZE_END) / (ULTRA_SLOW_END - FREEZE_END);
        this.clock.setTimeScale(t * 0.1);
      } else if (elapsed < SLOW_END) {
        // Ease from 0.1 to 0.4
        const t = (elapsed - ULTRA_SLOW_END) / (SLOW_END - ULTRA_SLOW_END);
        this.clock.setTimeScale(0.1 + t * 0.3);
      } else {
        // Kill cam done
        this.clock.setTimeScale(1.0);
        this.cameraController.stopKillCam();
        this.screenEffects.stopKillEffects();
        this._killRealStart = null;

        if (this.mode !== 'online' || this.matchSim) {
          if (this.fighter2 && this.fighter2.damageSystem.isDead()) {
            this.p1Score++;
          }
          if (this.fighter1 && this.fighter1.damageSystem.isDead()) {
            this.p2Score++;
          }
          if (this.mode === 'ai') {
            const roundSummary = this.aiMatchRecorder.completeRound({
              frameCount: this.matchSim?.frameCount ?? 0,
              winner: this.fighter2?.damageSystem.isDead()
                ? 1
                : (this.fighter1?.damageSystem.isDead() ? 2 : null),
              killReason: this.matchSim?.killReason ?? null,
              p1Score: this.p1Score,
              p2Score: this.p2Score,
            });
            this.aiController?.observeRoundResult?.(roundSummary);
          }
          if (this.mode === 'watch') {
            const roundSummary = {
              frameCount: this.matchSim?.frameCount ?? 0,
              winner: this.fighter2?.damageSystem.isDead()
                ? 1
                : (this.fighter1?.damageSystem.isDead() ? 2 : null),
              killReason: this.matchSim?.killReason ?? null,
              p1Score: this.p1Score,
              p2Score: this.p2Score,
            };
            this.aiController1?.observeRoundResult?.(roundSummary);
            this.aiController2?.observeRoundResult?.(roundSummary);
          }
        }

        this.gameState = GameState.ROUND_END;
        this.stateTimer = 0;
      }
    }

    this.environment.update(dt);
    this.arena?.update(dt);
    this.particles.update(dt);
  }

  _updateRoundIntro(dt) {
    this.stateTimer += dt;

    if (this.stateTimer > ROUND_INTRO_DURATION * 0.6) {
      this.ui.hud.showFight();
    }

    if (this.stateTimer >= ROUND_INTRO_DURATION) {
      this.gameState = GameState.FIGHTING;
      this.ui.hud.hideRoundAnnounce();
    }
  }

  _updateFighting(dt) {
    if (this.mode === 'online' && !this.matchSim) {
      this._updateOnlineFighting(dt);
      return;
    }

    const frame = this.clock.frameCount;
    const input1 = this.aiController1 ? null : captureInputFrame(this.input, 0, frame);
    const input2 = this.aiController2 ? null : captureInputFrame(this.input, 1, frame);
    this._mapDefaultSideInput(input1, this.fighter1, this.fighter2, 'left');
    this._mapDefaultSideInput(input2, this.fighter2, this.fighter1, 'right');
    if (this.mode === 'training' && input2) this._applyDummyBehavior(input2);
    if (this.mode === 'gauntlet' && this._gauntlet) this._gauntlet.elapsed += dt;
    const controller1 = this.aiController1
      ? ((fighter, opponent, sim, simDt) => {
          this.aiController1.update(fighter, opponent, sim.frameCount, simDt);
        })
      : null;
    const controller2 = this.aiController2
      ? ((fighter, opponent, sim, simDt) => {
          this.aiController2.update(fighter, opponent, sim.frameCount, simDt);
        })
      : null;
    const step = this.matchSim.step(dt, {
      input1,
      input2,
      controller1,
      controller2,
    });
    if (this.mode === 'ai') {
      this.aiMatchRecorder.recordStep({
        frameCount: step.frameCount,
        input1,
        input2,
        fighter1: this.fighter1,
        fighter2: this.fighter2,
        aiMeta: this.aiController?.getDebugSnapshot?.() ?? null,
        events: step.events,
      });
    }
    this._handleSimStep(step);

    // Update HUD
    this._updateHUD();
  }

  _updateOnlineFighting(_dt) {
    if (!this.onlineSession?.connected) return;
    const baseFrame = this.onlineSession.lastSnapshot?.frameCount ?? 0;
    const localFrame = this.clock.frameCount;
    const input = captureInputFrame(this.input, 0, localFrame);
    this._applyOnlineLocalControlMapping(input);
    input.frame = baseFrame + 1;
    try {
      this.onlineSession.sendInputFrame(input.frame, input);
    } catch (err) {
      console.error('Failed to send online input frame:', err);
    }
    this._updateHUD();
  }

  _applyOnlineLocalControlMapping(input) {
    if (!input) return;
    const fighter = this.onlineLocalSlot === 1 ? this.fighter2 : this.fighter1;
    const opponent = this.onlineLocalSlot === 1 ? this.fighter1 : this.fighter2;
    this._mapDefaultSideInput(input, fighter, opponent, 'left');
  }

  _mapDefaultSideInput(input, fighter, opponent, defaultSide) {
    if (!input || !fighter || !opponent) return;
    const isOnLeft = (fighter.position?.x ?? 0) <= (opponent.position?.x ?? 0);
    const shouldFlip = defaultSide === 'left' ? !isOnLeft : isOnLeft;
    if (!shouldFlip) return;

    const heldLeft = input.held.left;
    input.held.left = input.held.right;
    input.held.right = heldLeft;

    const pressedUp = input.pressed.sidestepUp;
    input.pressed.sidestepUp = input.pressed.sidestepDown;
    input.pressed.sidestepDown = pressedUp;
  }

  _handleSimStep(step) {
    for (const event of step.events) {
      this._handleSimEvent(event);
    }

    if (step.roundOver && this.gameState === GameState.FIGHTING) {
      if (this.mode === 'training') {
        this._resetTrainingRound();
        return;
      }
      this._matchStats?.roundTimes.push(step.frameCount / 60);
      const killer = step.winner === 1 ? this.fighter1 : this.fighter2;
      const victim = step.winner === 1 ? this.fighter2 : this.fighter1;
      this._startKillPresentation(killer, victim, step.killReason);
    }
  }

  _handleSimEvent(event) {
    this.gameAudio.handleCombatEvent(event);
    this._recordStatsEvent(event);
    if (this.mode === 'training' && event.type === 'combat_result') {
      this._updateTrainingReadout(event);
    }
    if (event.type === 'wall_bounce') {
      const contactPoint = new THREE.Vector3(
        event.contactPoint?.x ?? 0,
        event.contactPoint?.y ?? 1,
        event.contactPoint?.z ?? 0,
      );
      const normal = new THREE.Vector3(
        event.normal?.x ?? 0,
        event.normal?.y ?? 0,
        event.normal?.z ?? -1,
      ).normalize();
      this.particles.emitWallBounce(contactPoint, normal, 1.15);
      this.particles.emitWhiteImpact(contactPoint, normal, 8);
      this.cameraController.shake(0.12);
      this.screenEffects.startHitstop(event.hitstopFrames ?? 4);
      return;
    }
    if (event.type === 'ring_out') return;
    if (event.type !== 'combat_result') return;

    const contactPoint = new THREE.Vector3(
      event.contactPoint.x,
      event.contactPoint.y,
      event.contactPoint.z,
    );
    const impactDirection = this._getCombatImpactDirection(event);

    switch (event.result) {
      case HitResult.CLASH:
        this._emitWeaponImpact(event, 'clash', impactDirection, contactPoint);
        this.cameraController.shake(0.2);
        this.screenEffects.startHitstop(event.hitstopFrames);
        break;
      case HitResult.PARRIED:
        this._emitWeaponImpact(event, 'parry', impactDirection, contactPoint);
        this.cameraController.shake(0.15);
        this.screenEffects.startHitstop(event.hitstopFrames);
        break;
      case HitResult.BLOCKED:
        this._emitWeaponImpact(event, 'block', impactDirection, contactPoint);
        this.cameraController.shake(0.1);
        this.screenEffects.startHitstop(event.hitstopFrames);
        break;
      case HitResult.LETHAL_HIT:
        this.particles.emitWhiteImpact(contactPoint, impactDirection, 10);
        this.particles.emitBlood(contactPoint, 32, impactDirection);
        this.cameraController.shake(0.25);
        this.screenEffects.flashRed();
        this.screenEffects.startHitstop(event.hitstopFrames);
        break;
    }
  }

  _emitWeaponImpact(event, kind, impactDirection, fallbackPoint) {
    const attacker = event.attackerIndex === 0 ? this.fighter1 : this.fighter2;
    const defender = event.defenderIndex === 0 ? this.fighter1 : this.fighter2;
    const points = [
      this._getWeaponImpactPoint(attacker),
      this._getWeaponImpactPoint(defender),
    ].filter(Boolean);

    if (!points.length) points.push(fallbackPoint.clone());

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (kind === 'clash') {
        const direction = i === 0
          ? impactDirection
          : (impactDirection ? impactDirection.clone().multiplyScalar(-1) : null);
        this.particles.emitClashSparks(point, direction);
      } else if (kind === 'parry') {
        const direction = i === 0
          ? impactDirection
          : (impactDirection ? impactDirection.clone().multiplyScalar(-1) : null);
        this.particles.emitWhiteImpact(point, direction, 18);
      } else if (kind === 'block') {
        const direction = i === 0
          ? impactDirection
          : (impactDirection ? impactDirection.clone().multiplyScalar(-1) : null);
        this.particles.emitWhiteImpact(point, direction, 14);
      }
    }
  }

  _getWeaponImpactPoint(fighter) {
    if (!fighter) return null;
    const base = fighter.getWeaponBaseWorldPosition(new THREE.Vector3());
    const tip = fighter.getWeaponTipWorldPosition(new THREE.Vector3());
    return base.lerp(tip, 0.72);
  }

  _getCombatImpactDirection(event) {
    const attacker = event.attackerIndex === 0 ? this.fighter1 : this.fighter2;
    const defender = event.defenderIndex === 0 ? this.fighter1 : this.fighter2;
    if (!attacker || !defender) return null;

    const direction = new THREE.Vector3(
      defender.position.x - attacker.position.x,
      0.18,
      defender.position.z - attacker.position.z,
    );
    if (direction.lengthSq() < 0.0001) return null;
    return direction.normalize();
  }

  _startKillPresentation(killer, victim, reason = 'lethal_hit') {
    if (!killer || !victim) return;

    const dx = victim.position.x - killer.position.x;
    const dz = victim.position.z - killer.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 0.01;
    victim.startRagdoll(dx / dist, dz / dist);

    if (reason !== 'ring_out') {
      const pos = victim.position.clone();
      pos.y += 1.0;
      const sprayDirection = new THREE.Vector3(dx / dist, 0.22, dz / dist).normalize();
      this.particles.emitBloodGush(pos, 95, sprayDirection);
    }

    this.clock.setTimeScale(0.0);
    this.killSlowMoTimer = 0;
    this.killPhase = 'freeze';
    this.cameraController.startKillCam(victim, killer);
    this.cameraController.shake(0.6);
    this.screenEffects.startKillEffects();
    this.gameState = GameState.KILL_CAM;
  }

  _updateKillCam(dt) {
    if (this.mode === 'online' && !this.matchSim) {
      this.fighter1.updateRemoteView(dt);
      this.fighter2.updateRemoteView(dt);
      return;
    }

    this.fighter1.update(dt, this.fighter2);
    this.fighter2.update(dt, this.fighter1);
  }

  _updateRoundEnd(dt) {
    this.stateTimer += dt;

    if (this.stateTimer >= ROUND_END_DELAY) {
      if (this.mode === 'online' && !this.matchSim) {
        if (this.onlinePendingMatchResult?.phase === 'match_complete') {
          const winnerSlot = (this.onlinePendingMatchResult.matchWinner ?? this.onlinePendingMatchResult.winner ?? 1) - 1;
          const winnerName = this.onlineLocalSlot === null
            ? `PLAYER ${winnerSlot + 1}`
            : winnerSlot === this.onlineLocalSlot ? 'YOU' : 'OPPONENT';
          this._showVictory(winnerName);
        }
        return;
      }

      if (this.p1Score >= ROUNDS_TO_WIN) {
        if (this.mode === 'gauntlet') {
          this._endGauntletMatch(true);
        } else {
          this._showVictory(this.mode === 'watch' ? 'AI 1' : 'PLAYER 1');
        }
      } else if (this.p2Score >= ROUNDS_TO_WIN) {
        if (this.mode === 'gauntlet') {
          this._endGauntletMatch(false);
        } else {
          const name = this.mode === 'ai' ? 'COMPUTER' : (this.mode === 'watch' ? 'AI 2' : 'PLAYER 2');
          this._showVictory(name);
        }
      } else {
        this.currentRound++;
        this._startRound();
      }
    }
  }

  _showVictory(winnerName) {
    this.gameState = GameState.VICTORY;
    if (this.mode === 'ai') {
      this.aiMatchRecorder.finishMatch({
        winnerName,
        p1Score: this.p1Score,
        p2Score: this.p2Score,
      });
    }
    this.ui.showVictory(winnerName, this.p1Score, this.p2Score, {
      winnerCharId: this._resolveWinnerCharId(),
      allowRematch: this.mode !== 'online' || Boolean(this.onlineSession?.connected),
      stats: this.mode === 'online' ? null : this._buildMatchStatsLine(),
    });
  }

  _resolveWinnerCharId() {
    if (this.p1Score >= ROUNDS_TO_WIN) return this.fighter1?.charDef?.id ?? null;
    if (this.p2Score >= ROUNDS_TO_WIN) return this.fighter2?.charDef?.id ?? null;
    return null;
  }

  _updateDebugOverlay() {
    if (!this.debugOverlay) return;
    this.debugOverlay.update(this._buildDebugSnapshot());
  }

  _buildDebugSnapshot() {
    const fighter1 = this.fighter1?.getDebugSnapshot(this.fighter2) ?? null;
    const fighter2 = this.fighter2?.getDebugSnapshot(this.fighter1) ?? null;
    const distance = (this.fighter1 && this.fighter2)
      ? this.fighter1.distanceTo(this.fighter2)
      : 0;

    return {
      gameState: this.gameState,
      frameCount: this.clock.frameCount,
      timeScale: this.clock.timeScale,
      rawDelta: this._lastFrameStats.rawDelta,
      steps: this._lastFrameStats.steps,
      stateTimer: this.stateTimer,
      mode: this.mode,
      difficulty: this.difficulty,
      currentRound: this.currentRound,
      p1Score: this.p1Score,
      p2Score: this.p2Score,
      distance,
      animSandbox: Boolean(this.animationSandbox && this.gameState === GameState.ANIM_PLAYER),
      screen: {
        hitstopFrames: this.screenEffects.hitstopFrames,
        onHitstop: this.screenEffects.onHitstop,
      },
      camera: {
        killCamActive: this.cameraController.killCamActive,
        killCamPhase: this.cameraController.killCamPhase,
        orbitAngle: this.cameraController.orbitAngle,
        shakeIntensity: this.cameraController.shakeIntensity,
        killCamTime: this.cameraController.killCamTime,
        debugManual: this.cameraController.debugManualCameraActive,
      },
      ai: this.aiController?.getDebugSnapshot() ?? null,
      ai1: this.aiController1?.getDebugSnapshot() ?? null,
      ai2: this.aiController2?.getDebugSnapshot() ?? null,
      fighter1,
      fighter2,
    };
  }

  _updateHUD() {
    if (!this.fighter1 || !this.fighter2) return;
    this.ui.hud.updateRoundPips(this.p1Score, this.p2Score);
    if (this.mode === 'online' && !this.matchSim) {
      this.ui.hud.setOnlineMeta({
        visible: true,
        status: this.onlineLocalSlot === 0 ? 'ONLINE P1' : 'ONLINE P2',
        code: this.onlineSession?.lobbyCode ?? '------',
        pingMs: this.onlinePingMs,
      });
    }
  }

}
