import * as THREE from 'three';

const MAX_PARTICLES = 200;

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.activeCount = 0;

    // InstancedMesh for sparks
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

    // Color attribute
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
        color: new THREE.Color(1, 1, 1),
      });
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    this._dummy = new THREE.Object3D();
  }

  emit(position, count, options = {}) {
    const {
      color = new THREE.Color(0xffaa44),
      speed = 3,
      spread = 1,
      life = 0.5,
      size = 1,
      gravity = -5,
    } = options;

    let spawned = 0;
    for (let i = 0; i < MAX_PARTICLES && spawned < count; i++) {
      if (!this.particles[i].active) {
        const p = this.particles[i];
        p.active = true;
        p.position.copy(position);
        p.velocity.set(
          (Math.random() - 0.5) * spread,
          Math.random() * speed * 0.5 + speed * 0.5,
          (Math.random() - 0.5) * spread
        );
        p.gravity = gravity;
        p.life = life + Math.random() * life * 0.5;
        p.maxLife = p.life;
        p.size = size;
        p.color.copy(color);
        spawned++;
      }
    }
  }

  emitSparks(position, count = 8) {
    this.emit(position, count, {
      color: new THREE.Color(0xffcc44),
      speed: 5,
      spread: 3,
      life: 0.3,
      size: 1.2,
      gravity: -8,
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
    // Red mist
    this.emit(position, 15, {
      color: new THREE.Color(0x881111),
      speed: 2,
      spread: 1.5,
      life: 0.8,
      size: 3,
      gravity: -1,
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

  update(dt) {
    this.activeCount = 0;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) {
        this._dummy.position.set(0, -100, 0);
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this._dummy.matrix);
        continue;
      }

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this._dummy.position.set(0, -100, 0);
        this._dummy.scale.set(0, 0, 0);
        this._dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this._dummy.matrix);
        continue;
      }

      p.velocity.y += p.gravity * dt;
      p.position.addScaledVector(p.velocity, dt);

      const lifeRatio = p.life / p.maxLife;
      const scale = p.size * lifeRatio * 0.02;

      this._dummy.position.copy(p.position);
      this._dummy.scale.set(scale, scale, scale);
      this._dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this._dummy.matrix);

      this.colors[i * 3] = p.color.r * lifeRatio;
      this.colors[i * 3 + 1] = p.color.g * lifeRatio;
      this.colors[i * 3 + 2] = p.color.b * lifeRatio;

      this.activeCount++;
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  reset() {
    for (const p of this.particles) {
      p.active = false;
    }
  }
}
