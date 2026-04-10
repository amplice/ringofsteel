import * as THREE from 'three';

const MAX_PARTICLES = 320;
const MAX_BLOOD = 420;
const ORIENT_UP = new THREE.Vector3(0, 1, 0);

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.bloodParticles = [];
    this.activeCount = 0;

    const geo = new THREE.SphereGeometry(0.02, 4, 3);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.visible = true;
    scene.add(this.mesh);

    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(this.colors, 3);

    const dummy = new THREE.Matrix4();
    dummy.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.mesh.setMatrixAt(i, dummy);
      this.particles.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        size: 1,
        stretch: 1,
        gravity: -5,
        color: new THREE.Color(1, 1, 1),
      });
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    const bloodGeo = new THREE.SphereGeometry(0.1, 5, 4);
    const bloodMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      opacity: 0.9,
    });

    this.bloodMesh = new THREE.InstancedMesh(bloodGeo, bloodMat, MAX_BLOOD);
    this.bloodMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bloodMesh.frustumCulled = false;
    this.bloodMesh.visible = true;
    scene.add(this.bloodMesh);

    this.bloodColors = new Float32Array(MAX_BLOOD * 3);
    this.bloodMesh.instanceColor = new THREE.InstancedBufferAttribute(this.bloodColors, 3);

    for (let i = 0; i < MAX_BLOOD; i++) {
      this.bloodMesh.setMatrixAt(i, dummy);
      this.bloodParticles.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        size: 1,
        stretch: 1,
        gravity: -5,
        color: new THREE.Color(1, 0, 0),
      });
    }
    this.bloodMesh.instanceMatrix.needsUpdate = true;

    this._dummy = new THREE.Object3D();
  }

  _emitToPool(pool, position, count, options) {
    const {
      color = new THREE.Color(0xffaa44),
      speed = 3,
      spread = 1,
      life = 0.5,
      size = 1,
      gravity = -5,
      stretch = 1,
      direction = null,
      directionalBias = 0,
      upwardBias = 0,
    } = options;

    const dir = direction ? direction.clone().normalize() : null;

    let spawned = 0;
    for (let i = 0; i < pool.length && spawned < count; i++) {
      if (!pool[i].active) {
        const p = pool[i];
        p.active = true;
        p.position.copy(position);
        p.velocity.set(
          (Math.random() - 0.5) * spread,
          Math.random() * speed * 0.5 + speed * 0.5 + upwardBias,
          (Math.random() - 0.5) * spread,
        );
        if (dir && directionalBias > 0) {
          p.velocity.addScaledVector(dir, speed * directionalBias);
        }
        p.gravity = gravity;
        p.life = life + Math.random() * life * 0.5;
        p.maxLife = p.life;
        p.size = size;
        p.stretch = stretch;
        p.color.copy(color);
        spawned++;
      }
    }
  }

  emit(position, count, options = {}) {
    this._emitToPool(this.particles, position, count, options);
  }

  emitSparks(position, count = 8, direction = null) {
    this.emit(position, count, {
      color: new THREE.Color(0xffcc44),
      speed: 5,
      spread: 3,
      life: 0.3,
      size: 1.2,
      gravity: -8,
      stretch: 1.8,
      direction,
      directionalBias: 0.25,
    });
  }

  emitWhiteImpact(position, direction = null, count = 18) {
    this.emit(position, count, {
      color: new THREE.Color(1, 1, 1),
      speed: 9,
      spread: 3.2,
      life: 0.28,
      size: 2.1,
      gravity: -5,
      stretch: 3.2,
      direction,
      directionalBias: 0.5,
      upwardBias: 0.6,
    });
    this.emit(position, Math.floor(count * 0.65), {
      color: new THREE.Color(0.85, 0.92, 1.0),
      speed: 6.5,
      spread: 2.2,
      life: 0.4,
      size: 1.4,
      gravity: -9,
      stretch: 2.4,
      direction,
      directionalBias: 0.35,
    });
  }

  emitClashSparks(position, direction = null) {
    this.emitWhiteImpact(position, direction, 28);
    this.emit(position, 10, {
      color: new THREE.Color(1, 1, 1),
      speed: 11,
      spread: 5,
      life: 0.2,
      size: 2.6,
      gravity: -4,
      stretch: 3.6,
      direction,
      directionalBias: 0.6,
    });
  }

  emitInkSplash(position, count = 30) {
    this.emit(position, count, {
      color: new THREE.Color(0x110000),
      speed: 4,
      spread: 2.5,
      life: 1.0,
      size: 2.5,
      gravity: -3,
    });
  }

  emitBlood(position, count = 12, direction = null) {
    this._emitToPool(this.bloodParticles, position, count, {
      color: new THREE.Color(0.86, 0.03, 0.03),
      speed: 8,
      spread: 2.2,
      life: 1.8,
      size: 4.5,
      gravity: -7,
      stretch: 4.2,
      direction,
      directionalBias: 0.75,
      upwardBias: 1.1,
    });
    this._emitToPool(this.bloodParticles, position, Math.floor(count * 0.9), {
      color: new THREE.Color(0.45, 0.0, 0.0),
      speed: 5,
      spread: 1.8,
      life: 2.6,
      size: 5.2,
      gravity: -5,
      stretch: 5.0,
      direction,
      directionalBias: 0.65,
    });
    this._emitToPool(this.bloodParticles, position, Math.floor(count * 0.45), {
      color: new THREE.Color(0.25, 0.0, 0.0),
      speed: 3.5,
      spread: 1.4,
      life: 3.1,
      size: 3.2,
      gravity: -10,
      stretch: 2.0,
      direction,
      directionalBias: 0.4,
    });
  }

  emitBloodGush(position, count = 40, direction = null) {
    this._emitToPool(this.bloodParticles, position, count, {
      color: new THREE.Color(0.9, 0.02, 0.02),
      speed: 11,
      spread: 2.4,
      life: 4.6,
      size: 5.8,
      gravity: -5,
      stretch: 6.5,
      direction,
      directionalBias: 0.95,
      upwardBias: 1.4,
    });
    this._emitToPool(this.bloodParticles, position, Math.floor(count * 0.8), {
      color: new THREE.Color(0.65, 0.0, 0.0),
      speed: 7,
      spread: 2.0,
      life: 5.2,
      size: 6.8,
      gravity: -3,
      stretch: 7.8,
      direction,
      directionalBias: 0.8,
    });
    this._emitToPool(this.bloodParticles, position, Math.floor(count * 0.6), {
      color: new THREE.Color(0.3, 0.0, 0.0),
      speed: 3,
      spread: 1.0,
      life: 5.8,
      size: 3.2,
      gravity: -11,
      stretch: 2.3,
      direction,
      directionalBias: 0.3,
    });
  }

  emitDust(position, count = 5) {
    this.emit(position, count, {
      color: new THREE.Color(0x887766),
      speed: 1,
      spread: 0.5,
      life: 0.6,
      size: 1.5,
      gravity: -1,
    });
  }

  _updatePool(pool, mesh, colors, maxCount, dt) {
    for (let i = 0; i < maxCount; i++) {
      const p = pool[i];
      if (!p.active) {
        this._dummy.position.set(0, -100, 0);
        this._dummy.scale.set(0, 0, 0);
        this._dummy.quaternion.identity();
        this._dummy.updateMatrix();
        mesh.setMatrixAt(i, this._dummy.matrix);
        continue;
      }

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this._dummy.position.set(0, -100, 0);
        this._dummy.scale.set(0, 0, 0);
        this._dummy.quaternion.identity();
        this._dummy.updateMatrix();
        mesh.setMatrixAt(i, this._dummy.matrix);
        continue;
      }

      p.velocity.y += p.gravity * dt;
      p.position.addScaledVector(p.velocity, dt);

      const lifeRatio = p.life / p.maxLife;
      const scale = p.size * lifeRatio * 0.02;
      const speed = p.velocity.length();
      const stretchScale = Math.max(1, p.stretch * Math.min(speed * 0.12, 2.8));

      this._dummy.position.copy(p.position);
      if (speed > 0.0001) {
        const direction = p.velocity.clone().normalize();
        this._dummy.quaternion.setFromUnitVectors(ORIENT_UP, direction);
      } else {
        this._dummy.quaternion.identity();
      }
      this._dummy.scale.set(scale, scale * stretchScale, scale);
      this._dummy.updateMatrix();
      mesh.setMatrixAt(i, this._dummy.matrix);

      colors[i * 3] = p.color.r * lifeRatio;
      colors[i * 3 + 1] = p.color.g * lifeRatio;
      colors[i * 3 + 2] = p.color.b * lifeRatio;

      this.activeCount++;
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    this.activeCount = 0;
    this._updatePool(this.particles, this.mesh, this.colors, MAX_PARTICLES, dt);
    this._updatePool(this.bloodParticles, this.bloodMesh, this.bloodColors, MAX_BLOOD, dt);
  }

  reset() {
    for (const p of this.particles) p.active = false;
    for (const p of this.bloodParticles) p.active = false;
  }
}
