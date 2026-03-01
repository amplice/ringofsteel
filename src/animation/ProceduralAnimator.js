import { lerp } from '../utils/MathUtils.js';
import { BASE_IDLE } from './AnimationLibrary.js';

export class ProceduralAnimator {
  constructor(joints, isFBX = false) {
    this.joints = joints;
    this.currentPose = {};
    this.targetPose = {};
    this.blendSpeed = 0.15;
    this.isFBX = isFBX;

    // Initialize current pose from BASE_IDLE
    this._initPose();
  }

  _initPose() {
    for (const [jointName, rot] of Object.entries(BASE_IDLE)) {
      this.currentPose[jointName] = { rx: rot.rx, ry: rot.ry, rz: rot.rz };
    }
  }

  setTargetPose(pose, speed = 0.15) {
    this.targetPose = pose;
    this.blendSpeed = speed;
  }

  update() {
    // FBX models: skip bone animation entirely, use as static mesh
    if (this.isFBX) return;

    // Merge target pose with BASE_IDLE for missing joints
    const fullTarget = { ...BASE_IDLE };
    if (this.targetPose) {
      for (const [joint, rot] of Object.entries(this.targetPose)) {
        fullTarget[joint] = {
          rx: rot.rx ?? (fullTarget[joint]?.rx ?? 0),
          ry: rot.ry ?? (fullTarget[joint]?.ry ?? 0),
          rz: rot.rz ?? (fullTarget[joint]?.rz ?? 0),
        };
      }
    }

    // Blend current pose toward target
    for (const [jointName, targetRot] of Object.entries(fullTarget)) {
      if (!this.currentPose[jointName]) {
        this.currentPose[jointName] = { rx: 0, ry: 0, rz: 0 };
      }
      const cur = this.currentPose[jointName];
      cur.rx = lerp(cur.rx, targetRot.rx, this.blendSpeed);
      cur.ry = lerp(cur.ry, targetRot.ry, this.blendSpeed);
      cur.rz = lerp(cur.rz, targetRot.rz, this.blendSpeed);

      // Apply to joint
      const joint = this.joints[jointName];
      if (joint) {
        joint.rotation.x = cur.rx;
        joint.rotation.y = cur.ry;
        joint.rotation.z = cur.rz;
      }
    }
  }

  snapToPose(pose) {
    if (this.isFBX) return;

    const fullTarget = { ...BASE_IDLE, ...pose };
    for (const [jointName, rot] of Object.entries(fullTarget)) {
      this.currentPose[jointName] = { rx: rot.rx || 0, ry: rot.ry || 0, rz: rot.rz || 0 };
      const joint = this.joints[jointName];
      if (joint) {
        joint.rotation.x = rot.rx || 0;
        joint.rotation.y = rot.ry || 0;
        joint.rotation.z = rot.rz || 0;
      }
    }
  }

  reset() {
    if (this.isFBX) return;
    this.snapToPose(BASE_IDLE);
    this.targetPose = {};
  }
}
