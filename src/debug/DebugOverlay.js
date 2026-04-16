import * as THREE from 'three';
import { DEBUG_OPTIONS } from '../core/Constants.js';
import {
  BODY_COLLISION,
  getDefaultWeaponHitRadius,
} from '../combat/CombatTuning.js';

const _segMid = new THREE.Vector3();
const _segDir = new THREE.Vector3();
const _segQuat = new THREE.Quaternion();
const _worldUp = new THREE.Vector3(0, 1, 0);

export class DebugOverlay {
  constructor(scene = null) {
    this.enabled = this._loadInitialState();
    this.scene = scene;
    this.el = document.createElement('div');
    this.el.id = 'debug-overlay';
    this.el.style.cssText = [
      'position:fixed',
      'bottom:8px',
      'left:8px',
      'z-index:1000',
      'width:min(320px, 32vw)',
      'max-height:min(42vh, 360px)',
      'overflow:auto',
      'padding:8px 10px',
      'background:rgba(0,0,0,0.72)',
      'border:1px solid rgba(120,220,160,0.35)',
      'color:#b8ffd3',
      'font:11px/1.25 Consolas, Monaco, monospace',
      'white-space:pre-wrap',
      'pointer-events:none',
      'display:none',
    ].join(';');
    document.body.appendChild(this.el);

    this._onKeyDown = (event) => {
      if (event.code === DEBUG_OPTIONS.toggleKey) {
        this.setEnabled(!this.enabled);
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
    this._createSceneHelpers();
    this._syncVisibility();
  }

  _loadInitialState() {
    if (!DEBUG_OPTIONS.persistToggle) {
      return DEBUG_OPTIONS.overlayEnabled;
    }

    const saved = window.localStorage.getItem(DEBUG_OPTIONS.storageKey);
    if (saved == null) {
      return DEBUG_OPTIONS.overlayEnabled;
    }
    return saved === 'true';
  }

  _syncVisibility() {
    this.el.style.display = this.enabled ? 'block' : 'none';
    if (this.helperRoot) {
      this.helperRoot.visible = this.enabled;
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (DEBUG_OPTIONS.persistToggle) {
      window.localStorage.setItem(DEBUG_OPTIONS.storageKey, String(enabled));
    }
    this._syncVisibility();
  }

  update(data) {
    if (!this.enabled) return;
    try {
      this.el.textContent = this._formatData(data);
      this._updateSceneHelpers(data);
    } catch (error) {
      this.el.textContent = [
        `Debug Overlay  [${DEBUG_OPTIONS.toggleKey}]`,
        '',
        `overlay error: ${error?.message || error}`,
      ].join('\n');
      console.error('[DebugOverlay] update failed', error, data);
    }
  }

  _formatData(data) {
    if (!data) {
      return `Debug Overlay (${DEBUG_OPTIONS.toggleKey})`;
    }

    const lines = [];
    lines.push(`Debug Overlay  [${DEBUG_OPTIONS.toggleKey}]`);
    lines.push(`state=${data.gameState} frame=${data.frameCount} timeScale=${this._fmt(data.timeScale, 2)} rawDt=${this._fmt(data.rawDelta, 4)} steps=${data.steps} timer=${this._fmt(data.stateTimer, 3)}`);
    lines.push(`mode=${data.mode} difficulty=${data.difficulty} round=${data.currentRound} score=${data.p1Score}-${data.p2Score} hitstop=${data.screen.hitstopFrames} freeze=${data.screen.onHitstop}`);
    lines.push(`camera killCam=${data.camera.killCamActive} phase=${data.camera.killCamPhase} orbit=${this._fmt(data.camera.orbitAngle, 2)} shake=${this._fmt(data.camera.shakeIntensity, 3)} killTime=${this._fmt(data.camera.killCamTime, 2)}`);
    lines.push(`distance=${this._fmt(data.distance, 3)} animSandbox=${data.animSandbox}`);

    if (data.ai) {
      lines.push(`ai current=${data.ai.currentAction ?? '-'} pending=${data.ai.pendingAction ?? '-'} react=${data.ai.reactionFrames} noise=${this._fmt(data.ai.decisionNoise, 2)} aggro=${this._fmt(data.ai.aggression, 2)} parry=${this._fmt(data.ai.parryRate, 2)}`);
      lines.push(`ai sideDir=${data.ai.sideDir} blockHeld=${data.ai.blockHeldFrames}`);
    } else {
      lines.push('ai current=- pending=-');
    }

    lines.push('');
    lines.push(this._formatFighter('P1', data.fighter1));
    lines.push('');
    lines.push(this._formatFighter('P2', data.fighter2));
    return lines.join('\n');
  }

  _formatFighter(label, fighter) {
    if (!fighter) {
      return `${label}: missing`;
    }

    const lines = [];
    lines.push(`${label} ${fighter.charName} weapon=${fighter.weaponType} state=${fighter.state} frames=${fighter.stateFrames} attack=${fighter.attackType ?? '-'} clip=${fighter.activeClip ?? '-'} hitApplied=${fighter.hitApplied}`);
    lines.push(`  pos=(${this._fmt(fighter.position?.x, 2)}, ${this._fmt(fighter.position?.z, 2)}) rotY=${this._fmt(fighter.rotationY, 2)} facingRight=${fighter.facingRight} step=${fighter.stepping ? fighter.stepDirection : 0} stepFrames=${fighter.stepFrames} cooldown=${fighter.stepCooldown}`);
    lines.push(`  actionable=${fighter.actionable} attacking=${fighter.attacking} sidestepPhase=${fighter.sidestepPhase ?? '-'} dead=${fighter.dead}`);
    lines.push(`  tipSpeed=${this._fmt(fighter.tipSpeed, 4)} baseSpeed=${this._fmt(fighter.baseSpeed, 4)} relTarget=${this._fmt(fighter.tipRelativeToward, 4)} relForward=${this._fmt(fighter.tipRelativeForward, 4)}`);
    if (fighter.collision) {
      lines.push(`  collision dist=${this._fmt(fighter.collision.distance, 4)} hurtRadius=${this._fmt(fighter.collision.hurtRadius, 3)} hurtHeight=${this._fmt(fighter.collision.hurtHeight, 3)} defender=${fighter.collision.defenderState ?? '-'}`);
      lines.push(`  collision mode=${fighter.collision.weaponHitMode ?? fighter.weaponHitMode ?? '-'} hitRadius=${this._fmt((fighter.collision.weaponHitRadius ?? fighter.weaponHitRadius ?? 0), 3)} window=${fighter.collision.contactWindowPassed} progress=${this._fmt((fighter.collision.attackProgress ?? 0), 2)} [${this._fmt((fighter.collision.contactWindowStart ?? 0), 2)}..${this._fmt((fighter.collision.contactWindowEnd ?? 1), 2)}] motionGate=${fighter.collision.motionGatePassed} forward=${this._fmt(fighter.collision.forwardDrive, 4)} toward=${this._fmt(fighter.collision.towardTarget, 4)} segmentHit=${fighter.collision.segmentHit}`);
      lines.push(`  collision resolve=${fighter.collision.lastResolve ?? '-'} result=${fighter.collision.lastCheckResult ?? '-'}`);
      if (Number.isFinite(fighter.collision.weaponClashDistance)) {
        lines.push(`  clash dist=${this._fmt(fighter.collision.weaponClashDistance, 4)} radius=${this._fmt(fighter.weaponClashRadius, 3)} overlap=${fighter.collision.weaponClashOverlap}`);
      }
    }
    return lines.join('\n');
  }

  _fmt(value, digits = 2) {
    return Number.isFinite(value) ? value.toFixed(digits) : '-';
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    if (this.helperRoot?.parent) {
      this.helperRoot.parent.remove(this.helperRoot);
    }
    this.el.remove();
  }

  _createSceneHelpers() {
    if (!this.scene) return;

    this.helperRoot = new THREE.Group();
    this.helperRoot.visible = this.enabled;
    this.scene.add(this.helperRoot);

    this._fighterHelpers = [
      this._buildFighterHelpers(0xff6666, 0xffb347),
      this._buildFighterHelpers(0x66aaff, 0x66ffd9),
    ];
    for (const helper of this._fighterHelpers) {
      this.helperRoot.add(helper.group);
    }
  }

  _buildFighterHelpers(hurtColor, segmentColor) {
    const group = new THREE.Group();

    const hurt = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: hurtColor,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      }),
    );

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, BODY_COLLISION.cylinderHeight, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
      }),
    );

    const lineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(0, 1, 0),
    ]);
    const weaponLine = new THREE.Line(
      lineGeom,
      new THREE.LineBasicMaterial({
        color: segmentColor,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );

    const base = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 10, 8),
      new THREE.MeshBasicMaterial({
        color: segmentColor,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    );

    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 10, 8),
      new THREE.MeshBasicMaterial({
        color: segmentColor,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );

    group.add(hurt);
    group.add(body);
    group.add(weaponLine);
    group.add(base);
    group.add(tip);

    const clashCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: segmentColor,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
      }),
    );
    const clashCapA = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshBasicMaterial({
        color: segmentColor,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
      }),
    );
    const clashCapB = clashCapA.clone();

    const hitCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: segmentColor,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    const hitCapA = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshBasicMaterial({
        color: segmentColor,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    const hitCapB = hitCapA.clone();

    group.add(clashCylinder);
    group.add(clashCapA);
    group.add(clashCapB);
    group.add(hitCylinder);
    group.add(hitCapA);
    group.add(hitCapB);

    return {
      group,
      hurt,
      body,
      weaponLine,
      base,
      tip,
      clashCylinder,
      clashCapA,
      clashCapB,
      hitCylinder,
      hitCapA,
      hitCapB,
    };
  }

  _updateSceneHelpers(data) {
    if (!this.helperRoot || !data) return;
    this._updateFighterHelper(this._fighterHelpers[0], data.fighter1);
    this._updateFighterHelper(this._fighterHelpers[1], data.fighter2);
  }

  _updateFighterHelper(helper, fighter) {
    if (!helper) return;
    if (!fighter) {
      helper.group.visible = false;
      return;
    }

    helper.group.visible = true;

    helper.hurt.position.set(
      fighter.hurtCenter.x,
      fighter.hurtCenter.y,
      fighter.hurtCenter.z,
    );
    helper.hurt.scale.set(fighter.hurtRadius, fighter.hurtHeight, fighter.hurtRadius);

    helper.body.position.set(
      fighter.bodyCollision.x,
      BODY_COLLISION.centerHeight,
      fighter.bodyCollision.z,
    );
    helper.body.scale.set(fighter.bodyRadius, 1, fighter.bodyRadius);

    const base = new THREE.Vector3(
      fighter.weaponBase.x,
      fighter.weaponBase.y,
      fighter.weaponBase.z,
    );
    const tip = new THREE.Vector3(
      fighter.weaponTip.x,
      fighter.weaponTip.y,
      fighter.weaponTip.z,
    );
    helper.base.position.copy(base);
    helper.tip.position.copy(tip);
    helper.weaponLine.geometry.setFromPoints([base, tip]);

    const clashRadius = fighter.weaponClashRadius ?? getDefaultWeaponHitRadius(fighter.weaponType);
    const hitRadius = fighter.collision?.weaponHitRadius ?? fighter.weaponHitRadius ?? getDefaultWeaponHitRadius(fighter.weaponType);
    _segMid.addVectors(base, tip).multiplyScalar(0.5);
    _segDir.subVectors(tip, base);
    const segLen = _segDir.length();

    helper.clashCylinder.position.copy(_segMid);
    helper.clashCapA.position.copy(base);
    helper.clashCapB.position.copy(tip);
    helper.clashCapA.scale.setScalar(clashRadius);
    helper.clashCapB.scale.setScalar(clashRadius);
    helper.hitCylinder.position.copy(_segMid);
    helper.hitCapA.position.copy(base);
    helper.hitCapB.position.copy(tip);
    helper.hitCapA.scale.setScalar(hitRadius);
    helper.hitCapB.scale.setScalar(hitRadius);

    if (segLen > 1e-5) {
      _segDir.normalize();
      _segQuat.setFromUnitVectors(_worldUp, _segDir);
      helper.clashCylinder.quaternion.copy(_segQuat);
      helper.clashCylinder.scale.set(clashRadius, segLen, clashRadius);
      helper.clashCylinder.visible = true;
      helper.hitCylinder.quaternion.copy(_segQuat);
      helper.hitCylinder.scale.set(hitRadius, segLen, hitRadius);
      helper.hitCylinder.visible = true;
    } else {
      helper.clashCylinder.visible = false;
      helper.hitCylinder.visible = false;
    }
  }
}
