import * as THREE from 'three';

const TRAIL_LENGTH = 12;

export class TrailEffect {
  constructor(color = 0xffffff) {
    this.positions = [];
    this.maxLength = TRAIL_LENGTH;
    this.active = false;

    // Create ribbon geometry
    const geo = new THREE.BufferGeometry();
    const posArray = new Float32Array(TRAIL_LENGTH * 2 * 3);
    const alphaArray = new Float32Array(TRAIL_LENGTH * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alphaArray, 1));

    const indices = [];
    for (let i = 0; i < TRAIL_LENGTH - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, c, b, b, c, d);
    }
    geo.setIndex(indices);

    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  start() {
    this.active = true;
    this.positions = [];
    this.mesh.visible = true;
  }

  stop() {
    this.active = false;
    this.mesh.visible = false;
  }

  update(tipPos, basePos) {
    if (!this.active) return;

    this.positions.unshift({
      tip: tipPos.clone(),
      base: basePos.clone(),
    });

    if (this.positions.length > this.maxLength) {
      this.positions.length = this.maxLength;
    }

    // Update geometry
    const posAttr = this.mesh.geometry.getAttribute('position');
    const alphaAttr = this.mesh.geometry.getAttribute('alpha');

    for (let i = 0; i < this.maxLength; i++) {
      const idx = i * 2;
      if (i < this.positions.length) {
        const p = this.positions[i];
        posAttr.setXYZ(idx, p.base.x, p.base.y, p.base.z);
        posAttr.setXYZ(idx + 1, p.tip.x, p.tip.y, p.tip.z);
        const alpha = 1 - i / this.maxLength;
        alphaAttr.setX(idx, alpha);
        alphaAttr.setX(idx + 1, alpha);
      } else {
        posAttr.setXYZ(idx, 0, 0, 0);
        posAttr.setXYZ(idx + 1, 0, 0, 0);
        alphaAttr.setX(idx, 0);
        alphaAttr.setX(idx + 1, 0);
      }
    }

    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
    this.mesh.geometry.computeBoundingSphere();
  }
}
