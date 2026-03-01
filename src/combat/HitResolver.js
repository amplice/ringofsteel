import * as THREE from 'three';
import { FighterState, HitResult, PARRY_WINDOW_FRAMES } from '../core/Constants.js';

// Radius around defender center for sword-body collision
const HIT_RADIUS = 0.5;

// Reusable vectors to avoid GC pressure
const _defenderCenter = new THREE.Vector3();
const _lineDir = new THREE.Vector3();
const _toPoint = new THREE.Vector3();
const _closest = new THREE.Vector3();

export class HitResolver {
  resolve(attacker, defender) {
    // Priority 1: Both attacking → Clash
    if (this._isInActiveFrames(defender)) {
      return { result: HitResult.CLASH };
    }

    // Priority 2: Dodge i-frames → Whiff
    if (defender.state === FighterState.DODGE && defender.stateFrames <= defender.dodgeInvulnFrames) {
      return { result: HitResult.WHIFF };
    }

    // Priority 3: Parry → Parried
    if (defender.state === FighterState.PARRY && defender.stateFrames <= PARRY_WINDOW_FRAMES) {
      return { result: HitResult.PARRIED };
    }

    // Priority 4: Block correct zone → Blocked
    if (defender.state === FighterState.BLOCK) {
      const guardZone = defender.stanceSystem.getGuardZone();
      const attackZone = attacker.stanceSystem.getAttackTargetZone(attacker.currentAttackType);
      if (guardZone === attackZone) {
        return { result: HitResult.BLOCKED, zone: attackZone };
      }
    }

    // Priority 5: Clean Hit
    const attackZone = attacker.stanceSystem.getAttackTargetZone(attacker.currentAttackType);
    return { result: HitResult.CLEAN_HIT, zone: attackZone };
  }

  _isInActiveFrames(fighter) {
    return fighter.state === FighterState.ATTACK_ACTIVE;
  }

  /**
   * Check if attacker's sword blade physically intersects the defender's body.
   * Uses minimum distance from defender center to the sword line segment (base→tip).
   */
  checkSwordCollision(attacker, defender) {
    // Get sword tip world position
    const tip = attacker.weapon.getTipWorldPosition();

    // Get sword base (hand) world position
    const handJoint = attacker.joints.handR || attacker.joints.handL;
    const base = new THREE.Vector3();
    if (handJoint) {
      handJoint.getWorldPosition(base);
    } else {
      base.copy(attacker.position).setY(1.2);
    }

    // Defender center (approximate body center at chest height)
    _defenderCenter.copy(defender.position);
    _defenderCenter.y += 0.9;

    // Compute minimum distance from defender center to sword line segment
    const dist = this._distToLineSegment(_defenderCenter, base, tip);
    return dist < HIT_RADIUS;
  }

  /**
   * Minimum distance from a point to a line segment.
   */
  _distToLineSegment(point, lineStart, lineEnd) {
    _lineDir.subVectors(lineEnd, lineStart);
    const len = _lineDir.length();
    if (len < 0.001) return point.distanceTo(lineStart);

    _lineDir.divideScalar(len); // normalize
    _toPoint.subVectors(point, lineStart);
    const proj = _toPoint.dot(_lineDir);
    const t = Math.max(0, Math.min(len, proj));

    _closest.copy(_lineDir).multiplyScalar(t).add(lineStart);
    return point.distanceTo(_closest);
  }

  // Keep old method as fallback for non-clip fighters
  checkRange(attacker, defender) {
    const dist = attacker.distanceTo(defender);
    const reach = attacker.currentAttackData ? attacker.currentAttackData.reach : 0;
    return dist <= reach;
  }
}
