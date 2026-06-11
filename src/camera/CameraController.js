import * as THREE from 'three';
import { lerp, clamp } from '../utils/MathUtils.js';
import { getCurrentArenaStage, getStageCameraBounds } from '../arena/ArenaBounds.js';
import { DEBUG_OPTIONS } from '../core/Constants.js';

const _bodyA = new THREE.Vector3();
const _bodyB = new THREE.Vector3();
const _manualOffset = new THREE.Vector3();

export class CameraController {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 3, 10);

    // Tracking state
    this.targetPosition = new THREE.Vector3();
    this.targetLookAt = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();

    // Camera orbit angle (radians, 0 = +Z side)
    this.orbitAngle = 0;

    // Shake
    this.shakeIntensity = 0;
    this.shakeDecay = 0.9;

    // Kill cam
    this.killCamActive = false;
    this.killCamAngle = 0;
    this.killCamTarget = null;
    this.killCamVictim = null;
    this.killCamKiller = null;
    this.killCamTime = 0;
    this.killCamPhase = 'freeze'; // 'freeze' | 'zoom' | 'orbit'

    this.debugManualCameraActive = false;
    this._debugCameraDragging = false;
    this._debugCameraLastX = 0;
    this._debugCameraLastY = 0;
    this._debugCameraYaw = 0;
    this._debugCameraPitch = 0.45;
    this._debugCameraDistance = 7;
    this._debugCameraTarget = new THREE.Vector3(0, 1, 0);

    this._onPointerDown = (event) => this._handleDebugPointerDown(event);
    this._onPointerMove = (event) => this._handleDebugPointerMove(event);
    this._onPointerUp = () => {
      this._debugCameraDragging = false;
    };
    this._onWheel = (event) => this._handleDebugWheel(event);
    this._onContextMenu = (event) => {
      if (this._isDebugCameraAllowed()) event.preventDefault();
    };
    this._onKeyDown = (event) => {
      if (event.code === 'Escape' && this.debugManualCameraActive) {
        this.debugManualCameraActive = false;
        this._debugCameraDragging = false;
        this._needsSnap = true;
      }
    };

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('keydown', this._onKeyDown);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  update(dt, fighter1, fighter2) {
    if (this.killCamActive) {
      this._updateKillCam(dt);
      return;
    }

    if (!fighter1 || !fighter2) return;

    fighter1.getBodyCollisionPosition(_bodyA);
    fighter2.getBodyCollisionPosition(_bodyB);

    // Midpoint between fighters
    const midX = (_bodyA.x + _bodyB.x) / 2;
    const midY = (fighter1.position.y + fighter2.position.y) / 2 + 1.0;
    const midZ = (_bodyA.z + _bodyB.z) / 2;

    if (this.debugManualCameraActive) {
      if (!this._isDebugCameraAllowed()) {
        this.debugManualCameraActive = false;
        this._needsSnap = true;
      } else {
        this._updateDebugManualCamera(midX, midY, midZ);
        return;
      }
    }

    // Distance-based zoom
    const dist = fighter1.distanceTo(fighter2);
    const zoomDist = clamp(5 + dist * 0.8, 5, 14);
    const stageCamera = getStageCameraBounds(getCurrentArenaStage());
    const heightOffset = stageCamera?.heightOffset ?? 2.5;
    const lookAtYOffset = stageCamera?.lookAtYOffset ?? 0;

    // Compute the angle of the line between fighters
    let dx = _bodyB.x - _bodyA.x;
    let dz = _bodyB.z - _bodyA.z;
    if ((dx * dx + dz * dz) < 1e-6) {
      dx = fighter1.playerIndex < fighter2.playerIndex ? 1 : -1;
      dz = 0;
    }
    // The normal fight camera should not rotate 180 degrees just because
    // fighters swapped physical sides between rounds. Treat the fighter line
    // as an undirected axis so side alternation is visible to the player.
    if (dx < 0 || (Math.abs(dx) < 1e-6 && dz < 0)) {
      dx = -dx;
      dz = -dz;
    }
    const fighterLineAngle = Math.atan2(dz, dx);
    const targetOrbit = fighterLineAngle + Math.PI / 2;

    this.orbitAngle = this._lerpAngle(this.orbitAngle, targetOrbit, 0.03);

    this.targetPosition.set(
      midX + Math.cos(this.orbitAngle) * zoomDist * 0.3,
      midY + heightOffset,
      midZ + Math.sin(this.orbitAngle) * zoomDist
    );
    this._clampPositionToStageCameraBounds(this.targetPosition);

    this.targetLookAt.set(midX, midY + lookAtYOffset, midZ);

    if (this._needsSnap) {
      this.camera.position.copy(this.targetPosition);
      this.currentLookAt.copy(this.targetLookAt);
      this._needsSnap = false;
    } else {
      this.camera.position.lerp(this.targetPosition, 0.08);
      this.currentLookAt.lerp(this.targetLookAt, 0.1);
    }
    this._clampPositionToStageCameraBounds(this.camera.position);

    // Apply shake
    if (this.shakeIntensity > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= this.shakeDecay;
      this._clampPositionToStageCameraBounds(this.camera.position);
    }

    this.camera.lookAt(this.currentLookAt);
  }

  _clampPositionToStageCameraBounds(position) {
    const cameraBounds = getStageCameraBounds(getCurrentArenaStage());
    if (!cameraBounds?.maxRadius) return;
    const dist = Math.hypot(position.x, position.z);
    if (dist <= cameraBounds.maxRadius || dist < 1e-6) return;
    const scale = cameraBounds.maxRadius / dist;
    position.x *= scale;
    position.z *= scale;
  }

  _lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  _isDebugCameraAllowed() {
    if (!DEBUG_OPTIONS.persistToggle) {
      return DEBUG_OPTIONS.overlayEnabled;
    }
    return window.localStorage.getItem(DEBUG_OPTIONS.storageKey) === 'true';
  }

  _syncDebugCameraFromCurrentView() {
    _manualOffset.copy(this.camera.position).sub(this.currentLookAt);
    const distance = _manualOffset.length();
    if (distance > 0.001) {
      this._debugCameraDistance = clamp(distance, 2, 18);
      this._debugCameraYaw = Math.atan2(_manualOffset.x, _manualOffset.z);
      this._debugCameraPitch = clamp(Math.asin(_manualOffset.y / distance), -0.35, 1.25);
    }
  }

  _handleDebugPointerDown(event) {
    if (event.button !== 2 || !this._isDebugCameraAllowed()) return;
    event.preventDefault();
    this._syncDebugCameraFromCurrentView();
    this.debugManualCameraActive = true;
    this._debugCameraDragging = true;
    this._debugCameraLastX = event.clientX;
    this._debugCameraLastY = event.clientY;
  }

  _handleDebugPointerMove(event) {
    if (!this._debugCameraDragging || !this.debugManualCameraActive || !this._isDebugCameraAllowed()) return;
    event.preventDefault();
    const dx = event.clientX - this._debugCameraLastX;
    const dy = event.clientY - this._debugCameraLastY;
    this._debugCameraLastX = event.clientX;
    this._debugCameraLastY = event.clientY;
    this._debugCameraYaw -= dx * 0.006;
    this._debugCameraPitch = clamp(this._debugCameraPitch - dy * 0.004, -0.35, 1.25);
  }

  _handleDebugWheel(event) {
    if (!this.debugManualCameraActive || !this._isDebugCameraAllowed()) return;
    event.preventDefault();
    this._debugCameraDistance = clamp(this._debugCameraDistance * (1 + event.deltaY * 0.0015), 2, 18);
  }

  _updateDebugManualCamera(midX, midY, midZ) {
    this._debugCameraTarget.set(midX, midY, midZ);
    const cosPitch = Math.cos(this._debugCameraPitch);
    this.camera.position.set(
      this._debugCameraTarget.x + Math.sin(this._debugCameraYaw) * cosPitch * this._debugCameraDistance,
      this._debugCameraTarget.y + Math.sin(this._debugCameraPitch) * this._debugCameraDistance,
      this._debugCameraTarget.z + Math.cos(this._debugCameraYaw) * cosPitch * this._debugCameraDistance,
    );
    this.currentLookAt.copy(this._debugCameraTarget);
    this.camera.lookAt(this._debugCameraTarget);
  }

  _updateKillCam(dt) {
    // Use real time so camera moves during time-freeze
    const now = performance.now() / 1000;
    const realDt = this._killLastTime ? Math.min(now - this._killLastTime, 0.05) : dt;
    this._killLastTime = now;
    this.killCamTime += realDt;

    // Track the victim's current position (follows ragdoll)
    const victimPos = this.killCamVictim
      ? this.killCamVictim.position
      : this.killCamTarget;
    const lookY = (victimPos.y || 0) + 1.0;

    const FREEZE_DUR = 0.15;
    const ZOOM_DUR = 0.6;

    if (this.killCamTime < FREEZE_DUR) {
      // Phase 1: FREEZE — camera holds, dramatic pause
      // Camera stays where it was, just look at victim
      this.currentLookAt.lerp(
        new THREE.Vector3(victimPos.x, lookY, victimPos.z), 0.3
      );
      this.camera.lookAt(this.currentLookAt);
    } else if (this.killCamTime < FREEZE_DUR + ZOOM_DUR) {
      // Phase 2: ZOOM — camera rapidly moves to dramatic close-up
      const t = (this.killCamTime - FREEZE_DUR) / ZOOM_DUR;
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

      // Target: close low-angle shot from the side
      const closeRadius = 2.5;
      const closeHeight = 0.8;
      const closePos = new THREE.Vector3(
        victimPos.x + Math.cos(this.killCamAngle) * closeRadius,
        lookY - 0.2 + closeHeight,
        victimPos.z + Math.sin(this.killCamAngle) * closeRadius
      );

      this.camera.position.lerp(closePos, ease * 0.15 + 0.02);
      this.currentLookAt.lerp(
        new THREE.Vector3(victimPos.x, lookY, victimPos.z), 0.15
      );
      this.camera.lookAt(this.currentLookAt);
    } else {
      // Phase 3: ORBIT — slow orbit pulling back, tracking ragdoll
      const orbitTime = this.killCamTime - FREEZE_DUR - ZOOM_DUR;
      this.killCamAngle += realDt * 0.4;

      // Gradually pull back from close to medium distance
      const pullback = Math.min(orbitTime * 0.8, 2.0);
      const radius = 2.5 + pullback;
      const height = 0.8 + pullback * 0.5;

      const orbitPos = new THREE.Vector3(
        victimPos.x + Math.cos(this.killCamAngle) * radius,
        lookY + height,
        victimPos.z + Math.sin(this.killCamAngle) * radius
      );

      this.camera.position.lerp(orbitPos, 0.06);
      this.currentLookAt.lerp(
        new THREE.Vector3(victimPos.x, lookY, victimPos.z), 0.08
      );
      this.camera.lookAt(this.currentLookAt);
    }

    // Shake during kill cam (diminishing)
    if (this.shakeIntensity > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= this.shakeDecay;
    }
    this._clampPositionToStageCameraBounds(this.camera.position);
    this.camera.lookAt(this.currentLookAt);
  }

  startKillCam(victim, killer) {
    this.killCamActive = true;
    this.killCamVictim = victim;
    this.killCamKiller = killer;
    this.killCamTarget = victim.position.clone();
    this.killCamTime = 0;
    this._killLastTime = null;

    // Start orbit angle from current camera direction toward victim
    this.killCamAngle = Math.atan2(
      this.camera.position.z - victim.position.z,
      this.camera.position.x - victim.position.x
    );
  }

  stopKillCam() {
    this.killCamActive = false;
    this.killCamTarget = null;
    this.killCamVictim = null;
    this.killCamKiller = null;
    this._killLastTime = null;
  }

  shake(intensity = 0.3) {
    // Respect OS-level reduced-motion preference.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
    this.shakeIntensity = intensity;
  }

  reset() {
    this.shakeIntensity = 0;
    this.killCamActive = false;
    this.killCamTarget = null;
    this.killCamVictim = null;
    this.killCamKiller = null;
    this._killLastTime = null;
    this.orbitAngle = 0;
    this._needsSnap = true;
  }
}
