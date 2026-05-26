import * as THREE from 'three';
import { ARENA_RADIUS } from '../core/Constants.js';
import { DEFAULT_STAGE, STAGE_DEFS, normalizeStageId } from './StageDefs.js';
import { StageLoader } from './StageLoader.js';
import { setCurrentArenaStage } from './ArenaBounds.js';

export class Arena {
  constructor(scene, stageId = DEFAULT_STAGE) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.stageId = normalizeStageId(stageId);
    this._loadToken = 0;
    this._weather = null;
    this._stageEffects = [];
    this._lineEffects = [];
    this._meshEffects = [];
    this._shaderEffects = [];
    scene.add(this.group);
  }

  async setStage(stageId = DEFAULT_STAGE) {
    const normalized = normalizeStageId(stageId);
    const token = ++this._loadToken;
    this.stageId = normalized;
    setCurrentArenaStage(normalized);
    this._clearGroup();

    const stage = STAGE_DEFS[normalized];
    this._applyStageEnvironment(stage);
    if (stage.builder === 'low_poly_arena') {
      this._buildLowPolyArena(stage);
      return normalized;
    }

    if (!stage.modelPath) {
      this._buildTestArena();
      return normalized;
    }

    try {
      const model = await StageLoader.loadStage(stage);
      if (token !== this._loadToken) return this.stageId;
      await this._buildModelArena(model.scene, stage, token);
      return normalized;
    } catch (error) {
      console.warn(`[arena] Failed to load stage '${normalized}', falling back to test arena`, error);
      if (token === this._loadToken) {
        this.stageId = DEFAULT_STAGE;
        setCurrentArenaStage(DEFAULT_STAGE);
        this._buildTestArena();
      }
      return DEFAULT_STAGE;
    }
  }

  update(dt) {
    this._updateWeather(dt);
    this._updateStageEffects(dt);
  }

  _updateWeather(dt) {
    if (!this._weather?.rain) return;
    const attr = this._weather.rain.geometry.getAttribute('position');
    const speed = this._weather.rainSpeed ?? 9.5;
    const windX = this._weather.rainWindX ?? 3.2;
    const windZ = this._weather.rainWindZ ?? -0.7;
    const minY = this._weather.minY ?? -1.6;
    const maxY = this._weather.maxY ?? 9.8;

    for (let i = 0; i < attr.count; i += 2) {
      const fall = dt * speed;
      const driftX = dt * windX;
      const driftZ = dt * windZ;
      for (const point of [i, i + 1]) {
        attr.setX(point, attr.getX(point) + driftX);
        attr.setY(point, attr.getY(point) - fall);
        attr.setZ(point, attr.getZ(point) + driftZ);
      }
      if (attr.getY(i) < minY || Math.abs(attr.getX(i)) > 13 || Math.abs(attr.getZ(i)) > 10) {
        const resetY = maxY + Math.random() * 1.8;
        const x = -12 + Math.random() * 24;
        const z = -9 + Math.random() * 18;
        const length = 0.42 + Math.random() * 0.72;
        attr.setXYZ(i, x, resetY, z);
        attr.setXYZ(i + 1, x + 0.28, resetY - length, z - 0.08);
      }
    }
    attr.needsUpdate = true;

    this._updateLightning(dt);
  }

  _updateStageEffects(dt) {
    for (const effect of this._lineEffects) {
      const attr = effect.lines.geometry.getAttribute('position');
      effect.time = (effect.time ?? 0) + dt;
      for (let i = 0; i < attr.count; i += 2) {
        const base = (i / 2) * 3;
        let x = attr.getX(i);
        let y = attr.getY(i);
        let z = attr.getZ(i);
        x += (effect.velocities[base] + Math.sin(effect.time * effect.swaySpeed + i) * effect.sway) * dt;
        y += effect.velocities[base + 1] * dt;
        z += (effect.velocities[base + 2] + Math.cos(effect.time * effect.swaySpeed + i * 1.7) * effect.sway) * dt;
        if (
          y < effect.bounds.minY || y > effect.bounds.maxY ||
          Math.abs(x) > effect.bounds.x || Math.abs(z) > effect.bounds.z
        ) {
          x = (effect.rand() - 0.5) * effect.bounds.x * 2;
          z = (effect.rand() - 0.5) * effect.bounds.z * 2;
          y = effect.bounds.maxY - effect.rand() * effect.resetDepth;
        }
        const length = effect.lengths[i / 2];
        attr.setXYZ(i, x, y, z);
        attr.setXYZ(i + 1, x + length * 0.55, y - length, z + length * 0.16);
      }
      attr.needsUpdate = true;
    }

    for (const effect of this._stageEffects) {
      const attr = effect.points.geometry.getAttribute('position');
      effect.time = (effect.time ?? 0) + dt;
      for (let i = 0; i < attr.count; i++) {
        const base = i * 3;
        let x = attr.getX(i);
        let y = attr.getY(i);
        let z = attr.getZ(i);
        x += (effect.velocities[base] + Math.sin(effect.time * effect.swaySpeed + i) * effect.sway) * dt;
        y += effect.velocities[base + 1] * dt;
        z += (effect.velocities[base + 2] + Math.cos(effect.time * effect.swaySpeed + i * 1.7) * effect.sway) * dt;

        if (
          y < effect.bounds.minY || y > effect.bounds.maxY ||
          Math.abs(x) > effect.bounds.x || Math.abs(z) > effect.bounds.z
        ) {
          x = (effect.rand() - 0.5) * effect.bounds.x * 2;
          z = (effect.rand() - 0.5) * effect.bounds.z * 2;
          y = effect.resetFromTop
            ? effect.bounds.maxY - effect.rand() * effect.resetDepth
            : effect.bounds.minY + effect.rand() * (effect.bounds.maxY - effect.bounds.minY);
        }

        attr.setXYZ(i, x, y, z);
      }
      attr.needsUpdate = true;
    }

    for (const effect of this._meshEffects) {
      effect.time = (effect.time ?? 0) + dt;
      if (effect.kind === 'heat_shimmer') {
        const wave = Math.sin(effect.time * effect.speed + effect.phase);
        effect.mesh.position.x = effect.basePosition.x + wave * effect.drift.x;
        effect.mesh.position.y = effect.basePosition.y + Math.sin(effect.time * effect.speed * 0.73 + effect.phase) * effect.drift.y;
        effect.mesh.position.z = effect.basePosition.z + Math.cos(effect.time * effect.speed * 0.61 + effect.phase) * effect.drift.z;
        effect.mesh.material.opacity = THREE.MathUtils.clamp(effect.opacity + wave * effect.opacityPulse, 0, 1);
        effect.mesh.scale.x = effect.baseScale.x * (1 + wave * effect.scalePulse);
      }
      if (effect.kind === 'sway_group') {
        const wave = Math.sin(effect.time * effect.speed + effect.phase);
        effect.mesh.rotation.x = effect.baseRotation.x + wave * effect.amountX;
        effect.mesh.rotation.z = effect.baseRotation.z + Math.sin(effect.time * effect.speed * 0.77 + effect.phase) * effect.amountZ;
      }
    }

    for (const effect of this._shaderEffects) {
      effect.material.uniforms.uTime.value += dt;
    }
  }

  _updateLightning(dt) {
    const weather = this._weather;
    if (!weather?.lightning) return;

    weather.lightningTimer = (weather.lightningTimer ?? 0) - dt;
    if (weather.lightningTimer <= 0) {
      weather.lightningTimer = 3.8 + Math.random() * 6.5;
      weather.flashTime = 0.12 + Math.random() * 0.08;
      weather.flashPulse = Math.random() > 0.68 ? 2 : 1;
    }

    if ((weather.flashTime ?? 0) > 0) {
      weather.flashTime -= dt;
      const flicker = weather.flashPulse === 2 && weather.flashTime < 0.08 ? 0.45 : 1;
      const strength = Math.max(0, weather.flashTime / 0.18) * flicker;
      weather.lightning.material.opacity = 0.25 + strength * 0.85;
      weather.flashLight.intensity = 0.6 + strength * 5.2;
      weather.flashFill.intensity = 0.15 + strength * 1.15;
      this.scene.background = new THREE.Color(0x081526).lerp(new THREE.Color(0x9fb9ff), strength * 0.32);
      return;
    }

    weather.lightning.material.opacity = 0.0;
    weather.flashLight.intensity = 0.0;
    weather.flashFill.intensity = 0.0;
    const stage = STAGE_DEFS[this.stageId];
    const background = stage?.environment?.background ?? 0x111118;
    this.scene.background = new THREE.Color(background);
  }

  _clearGroup() {
    this._weather = null;
    this._stageEffects = [];
    this._lineEffects = [];
    this._meshEffects = [];
    this._shaderEffects = [];
    while (this.group.children.length) {
      const child = this.group.children.pop();
      this._disposeObject(child);
    }
  }

  _disposeObject(object) {
    object.traverse?.((child) => {
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material) continue;
        for (const value of Object.values(material)) {
          if (value?.isTexture) value.dispose();
        }
        material.dispose?.();
      }
    });
  }

  _isStageFeatureEnabled(stage, feature) {
    return !feature || stage.features?.[feature] !== false;
  }

  async _buildModelArena(model, stage, token) {
    const root = new THREE.Group();
    root.name = `stage_${stage.id}`;
    model.name = `${stage.id}_model`;
    model.scale.setScalar(stage.modelScale ?? 1);
    model.position.y = stage.modelYOffset ?? 0;
    model.rotation.y = stage.modelRotationY ?? 0;
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material) continue;
        material.roughness = Math.max(material.roughness ?? 0.8, 0.72);
        material.metalness = Math.min(material.metalness ?? 0, 0.12);
        if (stage.materialMood) {
          material.roughness = Math.max(material.roughness ?? 0.8, stage.materialMood.roughness ?? 0.9);
          material.metalness = Math.min(material.metalness ?? 0, stage.materialMood.metalnessMax ?? 0.05);
          if (stage.materialMood.tint && material.color) {
            material.color.lerp(new THREE.Color(stage.materialMood.tint), stage.materialMood.tintStrength ?? 0.12);
          }
        }
      }
    });
    root.add(model);
    this._addModelStageLighting(root, stage);
    this._addModelStageBackdrop(root, stage);
    this._addModelStageAtmosphere(root, stage);
    this.group.add(root);
    this._addPitFloor(stage);
    if (stage.showBoundaryMarkers !== false) {
      this._addFightBoundaryMarkers(0.035, 0xb88d55);
    }
    await this._addModelStageDecor(root, stage, token);
  }

  _applyStageEnvironment(stage) {
    const env = stage.environment ?? {};
    const background = env.background ?? 0x111118;
    const fogColor = env.fogColor ?? background;
    this.scene.background = new THREE.Color(background);
    this.scene.fog = env.fogDensity
      ? new THREE.FogExp2(fogColor, env.fogDensity)
      : null;
  }

  _addModelStageLighting(root, stage) {
    const lighting = stage.lighting;
    if (!lighting) return;

    if (lighting.hemisphere) {
      const hemi = new THREE.HemisphereLight(
        lighting.hemisphere.skyColor,
        lighting.hemisphere.groundColor,
        lighting.hemisphere.intensity,
      );
      hemi.name = `${stage.id}_hemisphere_light`;
      root.add(hemi);
    }

    if (lighting.sun && this._isStageFeatureEnabled(stage, lighting.sun.feature)) {
      const sun = new THREE.DirectionalLight(lighting.sun.color, lighting.sun.intensity);
      sun.name = `${stage.id}_sun_light`;
      sun.position.set(...lighting.sun.position);
      sun.castShadow = true;
      sun.shadow.mapSize.width = 2048;
      sun.shadow.mapSize.height = 2048;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 36;
      sun.shadow.camera.left = -14;
      sun.shadow.camera.right = 14;
      sun.shadow.camera.top = 14;
      sun.shadow.camera.bottom = -14;
      sun.shadow.bias = -0.00025;
      sun.shadow.normalBias = 0.01;
      root.add(sun);
    }

    if (lighting.fill && this._isStageFeatureEnabled(stage, lighting.fill.feature)) {
      const fill = new THREE.AmbientLight(lighting.fill.color, lighting.fill.intensity);
      fill.name = `${stage.id}_ambient_fill`;
      root.add(fill);
    }
  }

  _addModelStageBackdrop(root, stage) {
    if (stage.backdrop?.type !== 'amphitheater_day') return;

    const blockerMat = new THREE.MeshStandardMaterial({
      color: stage.backdrop.blockerColor ?? 0x5d4b38,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const blocker = new THREE.Mesh(
      new THREE.CylinderGeometry(
        stage.backdrop.blockerRadius ?? 16,
        stage.backdrop.blockerRadius ?? 16,
        stage.backdrop.blockerHeight ?? 8,
        96,
        1,
        true,
      ),
      blockerMat,
    );
    blocker.name = `${stage.id}_lower_opening_shadow_backdrop`;
    blocker.position.y = stage.backdrop.blockerY ?? 3;
    blocker.receiveShadow = true;
    root.add(blocker);

    const sky = new THREE.Group();
    sky.name = `${stage.id}_cloud_sky`;
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xf6efe0,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const shadeMat = new THREE.MeshBasicMaterial({
      color: 0xd7c5a9,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const cloudDefs = [
      [-10.5, 8.0, -18.5, 2.8, 0.65, -0.08],
      [-7.6, 8.25, -19.0, 2.1, 0.5, 0.02],
      [6.8, 8.5, -19.5, 2.7, 0.58, 0.1],
      [10.0, 8.15, -18.2, 1.9, 0.44, -0.04],
      [-13.5, 7.8, 3.2, 2.0, 0.42, 0.22],
      [13.0, 8.4, 2.5, 2.4, 0.5, -0.18],
    ];
    for (const [x, y, z, sx, sy, rot] of cloudDefs) {
      const cloud = new THREE.Mesh(new THREE.CircleGeometry(1, 18), cloudMat);
      cloud.name = `${stage.id}_soft_cloud`;
      cloud.position.set(x, y, z);
      cloud.scale.set(sx, sy, 1);
      cloud.rotation.set(-0.18, 0, rot);
      sky.add(cloud);

      const shade = new THREE.Mesh(new THREE.CircleGeometry(1, 18), shadeMat);
      shade.name = `${stage.id}_soft_cloud_shadow`;
      shade.position.set(x + sx * 0.16, y - sy * 0.18, z + 0.02);
      shade.scale.set(sx * 0.72, sy * 0.52, 1);
      shade.rotation.copy(cloud.rotation);
      sky.add(shade);
    }
    root.add(sky);
  }

  _addModelStageAtmosphere(root, stage) {
    if (stage.atmosphere?.type === 'mountaintop_clouds') {
      this._addMountaintopClouds(root, stage);
      return;
    }
    if (stage.atmosphere?.type === 'amphitheater_sun_dust') {
      this._addAmphitheaterAtmosphere(root, stage);
      return;
    }
    if (stage.atmosphere?.type === 'pier_sunset') {
      this._addPierSunsetAtmosphere(root, stage);
      return;
    }
    if (stage.atmosphere?.type !== 'moonlit_bamboo' && stage.atmosphere?.type !== 'bamboo_dawn') return;

    const atmosphere = stage.atmosphere;
    if (this._isStageFeatureEnabled(stage, 'sunShafts')) {
      const shafts = new THREE.Group();
      shafts.name = `${stage.id}_moonlight_shafts`;
      root.add(shafts);

      const shaftMat = new THREE.MeshBasicMaterial({
        color: atmosphere.shaftColor ?? 0xb9d8ff,
        map: this._makeMoonlightShaftTexture(),
        transparent: true,
        opacity: atmosphere.shaftOpacity ?? 0.14,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });

      const shaftDefs = [
        [-4.6, 4.95, -5.6, 1.45, 7.8, -0.66],
        [-1.7, 5.25, -6.2, 1.1, 8.2, -0.54],
        [1.7, 5.15, -6.0, 1.35, 7.6, -0.48],
        [4.5, 4.65, -3.7, 0.95, 6.4, -0.58],
        [-5.6, 4.5, -2.4, 0.9, 6.1, -0.68],
      ];
      for (const [x, y, z, width, height, tilt] of shaftDefs) {
        const shaft = new THREE.Mesh(new THREE.PlaneGeometry(width, height), shaftMat.clone());
        shaft.name = `${stage.id}_moonlight_shaft`;
        shaft.position.set(x, y, z);
        shaft.rotation.set(tilt, -0.42, -0.14);
        shaft.renderOrder = -1;
        shafts.add(shaft);
      }
    }

    if (this._isStageFeatureEnabled(stage, 'groundGlow')) {
      const glowMat = new THREE.MeshBasicMaterial({
        color: atmosphere.groundGlowColor ?? 0xc8e2ff,
        transparent: true,
        opacity: atmosphere.groundGlowOpacity ?? 0.035,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Mesh(new THREE.CircleGeometry(5.6, 32), glowMat);
      glow.name = `${stage.id}_moonlit_ground_glow`;
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.035;
      root.add(glow);
    }

    if (stage.atmosphere?.type === 'bamboo_dawn') {
      this._addBambooAtmosphere(root, stage);
    }
  }

  _addBambooAtmosphere(root, stage) {
    const atmosphere = stage.atmosphere ?? {};

    if (this._isStageFeatureEnabled(stage, 'groundMist')) {
      const mistMat = new THREE.MeshBasicMaterial({
        color: atmosphere.mistColor ?? 0x9fcfa9,
        map: this._makeSoftCloudTexture(),
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
      });
      for (const [x, z, sx, sz, rot, opacity] of [
        [-3.4, -2.6, 5.8, 1.52, 0.12, 0.42],
        [2.9, -1.75, 5.2, 1.42, -0.08, 0.38],
        [0.0, 1.75, 6.4, 1.7, 0.04, 0.36],
        [-1.8, 0.25, 7.2, 2.02, -0.02, 0.34],
        [2.9, 2.15, 5.8, 1.46, 0.18, 0.32],
        [-3.8, 2.45, 5.2, 1.3, -0.18, 0.31],
        [0.6, -0.2, 7.6, 2.12, 0.0, 0.3],
        [0.0, 0.0, 8.9, 2.4, 0.08, 0.24],
      ]) {
        const mist = new THREE.Mesh(new THREE.CircleGeometry(1, 32), mistMat.clone());
        mist.name = `${stage.id}_ground_mist`;
        mist.material.opacity = opacity;
        mist.rotation.x = -Math.PI / 2;
        mist.rotation.z = rot;
        mist.position.set(x, 0.055, z);
        mist.scale.set(sx, sz, 1);
        mist.renderOrder = -1;
        root.add(mist);
        this._meshEffects.push({
          kind: 'heat_shimmer',
          mesh: mist,
          basePosition: mist.position.clone(),
          baseScale: mist.scale.clone(),
          drift: new THREE.Vector3(0.045, 0, 0.025),
          speed: 0.18 + sx * 0.015,
          phase: x * 0.33 + z * 0.17,
          opacity,
          opacityPulse: opacity * 0.12,
          scalePulse: 0.018,
        });
      }

      const blanketMat = new THREE.MeshBasicMaterial({
        color: atmosphere.mistColor ?? 0x9fcfa9,
        map: this._makeSoftCloudTexture(),
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
      });
      const blanket = new THREE.Mesh(new THREE.CircleGeometry(1, 48), blanketMat);
      blanket.name = `${stage.id}_mist_blanket`;
      blanket.rotation.x = -Math.PI / 2;
      blanket.position.y = 0.075;
      blanket.scale.set(6.8, 5.7, 1);
      blanket.renderOrder = -3;
      root.add(blanket);
      this._meshEffects.push({
        kind: 'heat_shimmer',
        mesh: blanket,
        basePosition: blanket.position.clone(),
        baseScale: blanket.scale.clone(),
        drift: new THREE.Vector3(0.035, 0, 0.018),
        speed: 0.12,
        phase: 1.7,
        opacity: blanket.material.opacity,
        opacityPulse: blanket.material.opacity * 0.08,
        scalePulse: 0.012,
      });
    }

    if (this._isStageFeatureEnabled(stage, 'stoneLantern')) {
      this._addBambooStoneLantern(root, stage);
    }

    if (this._isStageFeatureEnabled(stage, 'ambientMotion')) {
      this._addBambooAmbientDrift(root, stage);
    }
  }

  _addBambooAmbientDrift(root, stage) {
    const atmosphere = stage.atmosphere ?? {};
    if (this._isStageFeatureEnabled(stage, 'fireflies')) {
      this._addDriftPoints(root, stage, {
        name: 'fireflies',
        count: 72,
        seed: 0xf1ef1e,
        color: atmosphere.fireflyColor ?? 0xdfff93,
        size: 0.022,
        opacity: 0.45,
        soft: true,
        additive: true,
        bounds: { x: 4.7, z: 4.5, minY: 0.45, maxY: 2.8 },
        velocity: { x: 0.018, y: 0.012, z: -0.008 },
        jitter: { x: 0.06, y: 0.035, z: 0.06 },
        sway: 0.24,
        swaySpeed: 1.8,
        resetFromTop: false,
        resetDepth: 1,
      });
    }

    this._addDriftLines(root, stage, {
      name: 'bamboo_pollen_threads',
      count: 34,
      seed: 0xba0b4d,
      color: atmosphere.pollenColor ?? 0xd8d8a6,
      opacity: 0.16,
      bounds: { x: 5.2, z: 5.0, minY: 0.65, maxY: 3.2 },
      velocity: { x: 0.025, y: -0.015, z: -0.018 },
      jitter: { x: 0.055, y: 0.025, z: 0.055 },
      sway: 0.18,
      swaySpeed: 0.9,
      lengthMin: 0.04,
      lengthMax: 0.12,
      resetDepth: 0.9,
    });
  }

  _addBambooStoneLantern(root, stage) {
    const lantern = new THREE.Group();
    lantern.name = `${stage.id}_stone_lantern_silhouette`;
    lantern.position.set(-3.6, 0.04, -4.15);
    lantern.rotation.y = 0.42;
    root.add(lantern);

    const stone = new THREE.MeshStandardMaterial({
      color: 0x293020,
      roughness: 0.96,
      metalness: 0,
      flatShading: true,
    });
    const warm = new THREE.MeshBasicMaterial({
      color: 0xffb45b,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const add = (mesh, x, y, z) => {
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      lantern.add(mesh);
      return mesh;
    };

    add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.55, 6), stone), 0, 0.28, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.5), stone), 0, 0.62, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.36, 0.38), stone), 0, 0.85, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.11, 0.6), stone), 0, 1.07, 0);
    const roof = add(new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.28, 4), stone), 0, 1.26, 0);
    roof.rotation.y = Math.PI / 4;

    const glow = add(new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.18), warm), 0, 0.86, -0.205);
    glow.renderOrder = 2;
  }

  _addPierSunsetAtmosphere(root, stage) {
    const atmosphere = stage.atmosphere ?? {};
    const waterY = atmosphere.waterY ?? -0.72;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(88, 88, 96, 96),
      this._makePierWaterMaterial({
        color: atmosphere.waterColor ?? 0x194766,
        highlight: atmosphere.waterHighlightColor ?? 0xffb66d,
        opacity: atmosphere.waterOpacity ?? 0.72,
        strength: 1.0,
      }),
    );
    water.name = `${stage.id}_sunset_water`;
    water.rotation.x = -Math.PI / 2;
    water.position.y = waterY;
    water.receiveShadow = true;
    water.renderOrder = -8;
    root.add(water);
    this._shaderEffects.push({ material: water.material });

    const deckTexture = this._makePierDeckTexture();
    deckTexture.repeat.set(2.8, 2.25);
    const deck = new THREE.Mesh(
      this._makePierDeckFillGeometry(),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: deckTexture,
        roughness: 0.92,
        metalness: 0.02,
        side: THREE.DoubleSide,
      }),
    );
    deck.name = `${stage.id}_playable_deck_fill`;
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(0, -0.045, -0.42);
    deck.receiveShadow = true;
    deck.renderOrder = -1;
    root.add(deck);

    const sunMat = new THREE.MeshBasicMaterial({
      color: atmosphere.sunColor ?? 0xff8e45,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const sun = new THREE.Mesh(new THREE.CircleGeometry(1, 64), sunMat);
    sun.name = `${stage.id}_low_sunset_disc`;
    sun.position.set(-7.8, 4.85, -31);
    sun.scale.set(3.3, 3.3, 1);
    sun.renderOrder = -10;
    root.add(sun);

    const hazeMat = new THREE.MeshBasicMaterial({
      color: atmosphere.hazeColor ?? 0xffc28a,
      map: this._makeSoftCloudTexture(),
      transparent: true,
      opacity: atmosphere.hazeOpacity ?? 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    for (const [x, y, z, sx, sy, opacity, rot] of [
      [-8.2, 3.6, -25.5, 9.4, 2.2, atmosphere.hazeOpacity ?? 0.28, -0.04],
      [2.9, 3.95, -27.5, 8.2, 1.75, (atmosphere.hazeOpacity ?? 0.28) * 0.58, 0.08],
      [-0.8, 1.5, -18.6, 16.0, 1.05, (atmosphere.hazeOpacity ?? 0.28) * 0.42, 0.0],
    ]) {
      const haze = new THREE.Mesh(new THREE.CircleGeometry(1, 32), hazeMat.clone());
      haze.name = `${stage.id}_sunset_haze`;
      haze.material.opacity = opacity;
      haze.position.set(x, y, z);
      haze.scale.set(sx, sy, 1);
      haze.rotation.z = rot;
      haze.renderOrder = -9;
      root.add(haze);
    }

    const cloudMat = new THREE.MeshBasicMaterial({
      color: atmosphere.cloudColor ?? 0xffd0a0,
      map: this._makeSoftCloudTexture(),
      transparent: true,
      opacity: atmosphere.cloudOpacity ?? 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    for (const [x, y, z, sx, sy, rot] of [
      [-15.5, 7.4, -30, 4.6, 1.0, -0.08],
      [-11.8, 7.65, -30.2, 3.1, 0.72, 0.04],
      [8.5, 7.1, -29.0, 4.2, 0.82, 0.12],
      [12.4, 7.32, -28.6, 2.8, 0.62, -0.03],
    ]) {
      const cloud = new THREE.Mesh(new THREE.CircleGeometry(1, 24), cloudMat.clone());
      cloud.name = `${stage.id}_sunset_cloud`;
      cloud.position.set(x, y, z);
      cloud.scale.set(sx, sy, 1);
      cloud.rotation.z = rot;
      cloud.renderOrder = -10;
      root.add(cloud);
    }

    const glintMat = new THREE.MeshBasicMaterial({
      color: atmosphere.waterHighlightColor ?? 0xffb66d,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const rand = this._makeRand(this._hashString(`${stage.id}:water_glints`));
    for (let i = 0; i < 36; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = 6.6 + rand() * 24;
      const glint = new THREE.Mesh(new THREE.PlaneGeometry(0.9 + rand() * 1.35, 0.025), glintMat.clone());
      glint.name = `${stage.id}_water_glint`;
      glint.material.opacity = 0.08 + rand() * 0.16;
      glint.position.set(Math.cos(angle) * radius, waterY + 0.035, Math.sin(angle) * radius);
      glint.rotation.set(-Math.PI / 2, 0, angle + (rand() - 0.5) * 0.55);
      glint.renderOrder = -6;
      root.add(glint);
      this._meshEffects.push({
        kind: 'heat_shimmer',
        mesh: glint,
        basePosition: glint.position.clone(),
        baseScale: glint.scale.clone(),
        drift: new THREE.Vector3((rand() - 0.5) * 0.06, 0, (rand() - 0.5) * 0.06),
        speed: 0.22 + rand() * 0.28,
        phase: rand() * Math.PI * 2,
        opacity: glint.material.opacity,
        opacityPulse: glint.material.opacity * 0.36,
        scalePulse: 0.08,
      });
    }

    this._addDriftPoints(root, stage, {
      name: 'salt_mist',
      count: 70,
      seed: 0x51a7d0,
      color: atmosphere.hazeColor ?? 0xffc28a,
      size: 0.025,
      opacity: 0.16,
      soft: true,
      additive: true,
      bounds: { x: 7.2, z: 6.4, minY: waterY + 0.28, maxY: 1.55 },
      velocity: { x: 0.022, y: 0.04, z: -0.018 },
      jitter: { x: 0.055, y: 0.035, z: 0.055 },
      sway: 0.08,
      swaySpeed: 0.82,
      resetFromTop: false,
      resetDepth: 0.8,
    });
  }

  _addAmphitheaterAtmosphere(root, stage) {
    const atmosphere = stage.atmosphere ?? {};
    this._addAmphitheaterExteriorCity(root, stage);
    this._addAmphitheaterSkyClouds(root, stage);

    const shaftMat = new THREE.MeshBasicMaterial({
      color: atmosphere.shaftColor ?? 0xffd18a,
      map: this._makeMoonlightShaftTexture(),
      transparent: true,
      opacity: atmosphere.shaftOpacity ?? 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    for (const [x, y, z, width, height, rx, ry, rz] of [
      [-6.0, 5.25, -5.95, 1.9, 8.6, -0.82, 0.3, -0.2],
      [-3.2, 5.65, -6.65, 1.25, 8.4, -0.76, 0.18, -0.06],
      [-0.65, 5.95, -7.0, 1.55, 9.1, -0.72, 0.04, 0.02],
      [2.35, 5.65, -6.3, 2.05, 8.9, -0.76, -0.1, 0.14],
      [5.65, 5.15, -5.1, 1.45, 7.4, -0.84, -0.3, 0.26],
      [-6.8, 4.3, -1.8, 0.9, 5.7, -0.9, 0.34, -0.3],
      [6.5, 4.2, -1.25, 0.85, 5.4, -0.92, -0.36, 0.34],
    ]) {
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(width, height), shaftMat.clone());
      shaft.name = `${stage.id}_sun_shaft`;
      shaft.position.set(x, y, z);
      shaft.rotation.set(rx, ry, rz);
      shaft.renderOrder = -1;
      root.add(shaft);
    }

    const hazeMat = new THREE.MeshBasicMaterial({
      color: atmosphere.dustColor ?? 0xe0b26e,
      map: this._makeSoftCloudTexture(),
      transparent: true,
      opacity: atmosphere.hazeOpacity ?? 0.09,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    for (const [name, radius, y, sx, sz, opacity, rot] of [
      ['sand_heat_haze_low', 7.4, 0.055, 1.0, 0.62, atmosphere.hazeOpacity ?? 0.15, 0],
      ['sand_heat_haze_mid', 6.6, 0.14, 0.92, 0.52, (atmosphere.hazeOpacity ?? 0.15) * 0.82, 0.18],
      ['sand_heat_haze_back', 5.2, 0.24, 0.7, 0.34, (atmosphere.hazeOpacity ?? 0.15) * 0.55, -0.12],
    ]) {
      const haze = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), hazeMat.clone());
      haze.name = `${stage.id}_${name}`;
      haze.material.opacity = opacity;
      haze.rotation.x = -Math.PI / 2;
      haze.rotation.z = rot;
      haze.position.y = y;
      haze.scale.set(sx, sz, 1);
      haze.renderOrder = -2;
      root.add(haze);
      this._meshEffects.push({
        kind: 'heat_shimmer',
        mesh: haze,
        basePosition: haze.position.clone(),
        baseScale: haze.scale.clone(),
        drift: new THREE.Vector3(0.035, 0, 0.02),
        speed: 0.55 + radius * 0.035,
        phase: radius * 0.71,
        opacity,
        opacityPulse: opacity * 0.13,
        scalePulse: 0.012,
      });
    }

    const heatMat = this._makeHeatShimmerMaterial({
      color: atmosphere.heatColor ?? 0xf7efe0,
      opacity: atmosphere.heatOpacity ?? 0.075,
      strength: atmosphere.heatStrength ?? 0.65,
    });
    const heatDefs = [
      [0.0, 1.16, -5.45, 12.4, 2.85, 0.0, atmosphere.heatOpacity ?? 0.1],
      [-4.2, 1.36, -3.75, 4.8, 2.25, 0.18, (atmosphere.heatOpacity ?? 0.1) * 0.72],
      [4.35, 1.34, -3.65, 4.6, 2.2, -0.18, (atmosphere.heatOpacity ?? 0.1) * 0.68],
    ];
    for (const [x, y, z, width, height, rotY, opacity] of heatDefs) {
      const heat = new THREE.Mesh(new THREE.PlaneGeometry(width, height), heatMat.clone());
      heat.name = `${stage.id}_rising_heat_shimmer`;
      heat.material.uniforms.uOpacity.value = opacity;
      heat.position.set(x, y, z);
      heat.rotation.set(-0.04, rotY, 0);
      heat.renderOrder = 1;
      root.add(heat);
      this._shaderEffects.push({ material: heat.material });
      this._meshEffects.push({
        kind: 'heat_shimmer',
        mesh: heat,
        basePosition: heat.position.clone(),
        baseScale: heat.scale.clone(),
        drift: new THREE.Vector3(0.08, 0.035, 0.025),
        speed: 0.9 + Math.abs(x) * 0.05,
        phase: x * 0.63 + z * 0.19,
        opacity,
        opacityPulse: opacity * 0.22,
        scalePulse: 0.025,
      });
    }

    this._addDriftPoints(root, stage, {
      name: 'gold_dust',
      count: 170,
      seed: 0xd05700,
      color: atmosphere.dustColor ?? 0xe0b26e,
      size: 0.032,
      opacity: atmosphere.dustOpacity ?? 0.22,
      soft: true,
      additive: true,
      bounds: { x: 7.1, z: 6.2, minY: 0.25, maxY: 4.4 },
      velocity: { x: 0.035, y: 0.22, z: -0.015 },
      jitter: { x: 0.1, y: 0.07, z: 0.1 },
      sway: 0.11,
      swaySpeed: 0.95,
      resetFromTop: false,
      resetDepth: 1,
    });
  }

  _addAmphitheaterSkyClouds(root, stage) {
    const atmosphere = stage.atmosphere ?? {};
    const sky = new THREE.Group();
    sky.name = `${stage.id}_open_sky_clouds`;
    root.add(sky);

    const cloudMat = new THREE.MeshBasicMaterial({
      color: atmosphere.cloudColor ?? 0xf4ead6,
      map: this._makeSoftCloudTexture(),
      transparent: true,
      opacity: atmosphere.cloudOpacity ?? 0.48,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const shadowMat = new THREE.MeshBasicMaterial({
      color: atmosphere.cloudShadowColor ?? 0xc8b492,
      map: this._makeSoftCloudTexture(),
      transparent: true,
      opacity: atmosphere.cloudShadowOpacity ?? 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });

    const cloudDefs = [
      [-11.0, 5.9, -14.0, 5.5, 1.05, -0.06],
      [-5.7, 6.15, -15.2, 4.3, 0.86, 0.05],
      [0.2, 6.35, -16.2, 6.0, 1.05, 0.0],
      [6.9, 6.1, -14.8, 4.9, 0.92, 0.08],
      [11.8, 5.82, -13.4, 4.1, 0.76, -0.08],
      [-16.8, 5.6, -4.2, 4.1, 0.82, 0.18],
      [16.6, 5.7, -3.8, 4.3, 0.86, -0.14],
      [-15.0, 5.92, 7.0, 3.6, 0.72, -0.22],
      [15.3, 5.9, 6.5, 3.9, 0.76, 0.2],
      [-4.0, 5.5, 15.5, 4.0, 0.76, 0.12],
      [4.2, 5.65, 15.2, 4.4, 0.82, -0.12],
    ];
    for (const [x, y, z, sx, sy, rot] of cloudDefs) {
      const cloud = new THREE.Mesh(new THREE.CircleGeometry(1, 32), cloudMat.clone());
      cloud.name = `${stage.id}_soft_sky_cloud`;
      cloud.position.set(x, y, z);
      cloud.scale.set(sx, sy, 1);
      cloud.rotation.set(-0.12, 0, rot);
      cloud.renderOrder = -5;
      sky.add(cloud);

      const shade = new THREE.Mesh(new THREE.CircleGeometry(1, 28), shadowMat.clone());
      shade.name = `${stage.id}_soft_sky_cloud_shadow`;
      shade.position.set(x + sx * 0.18, y - sy * 0.28, z + 0.04);
      shade.scale.set(sx * 0.75, sy * 0.58, 1);
      shade.rotation.copy(cloud.rotation);
      shade.renderOrder = -6;
      sky.add(shade);

      this._meshEffects.push({
        kind: 'heat_shimmer',
        mesh: cloud,
        basePosition: cloud.position.clone(),
        baseScale: cloud.scale.clone(),
        drift: new THREE.Vector3(0.018, 0.004, 0.01),
        speed: 0.08,
        phase: x * 0.17 + z * 0.11,
        opacity: cloud.material.opacity,
        opacityPulse: 0.018,
        scalePulse: 0.01,
      });
    }
  }

  _addAmphitheaterExteriorCity(root, stage) {
    const atmosphere = stage.atmosphere ?? {};
    const city = new THREE.Group();
    city.name = `${stage.id}_exterior_city`;
    root.add(city);

    const stoneMat = new THREE.MeshLambertMaterial({
      color: atmosphere.exteriorCityColor ?? 0xb49a74,
      transparent: true,
      opacity: atmosphere.exteriorCityOpacity ?? 0.78,
      depthWrite: true,
      depthTest: true,
      fog: true,
    });
    const shadeMat = new THREE.MeshLambertMaterial({
      color: atmosphere.exteriorCityShadowColor ?? 0x6f5840,
      transparent: true,
      opacity: atmosphere.exteriorCityShadowOpacity ?? 0.52,
      depthWrite: true,
      depthTest: true,
      fog: true,
    });
    const roofMat = new THREE.MeshLambertMaterial({
      color: atmosphere.exteriorCityRoofColor ?? 0x8a6144,
      transparent: true,
      opacity: atmosphere.exteriorCityOpacity ?? 0.78,
      depthWrite: true,
      depthTest: true,
      fog: true,
    });

    const placeOnRing = (mesh, angle, radius, y, radialDepth = 0) => {
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      mesh.position.set(x, y, z);
      mesh.rotation.y = -angle + Math.PI / 2;
      if (radialDepth) {
        mesh.position.x += Math.cos(angle) * radialDepth;
        mesh.position.z += Math.sin(angle) * radialDepth;
      }
      city.add(mesh);
      return mesh;
    };

    const addBlock = (angle, radius, y, width, height, depth, material = stoneMat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material.clone());
      mesh.name = `${stage.id}_exterior_city_block`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      return placeOnRing(mesh, angle, radius, y + height * 0.5);
    };

    const addTower = (angle, radius, y, height, bodyRadius, material = stoneMat) => {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(bodyRadius * 0.85, bodyRadius, height, 8), material.clone());
      tower.name = `${stage.id}_exterior_city_tower`;
      placeOnRing(tower, angle, radius, y + height * 0.5);

      const cap = new THREE.Mesh(new THREE.ConeGeometry(bodyRadius * 1.35, bodyRadius * 1.2, 8), roofMat.clone());
      cap.name = `${stage.id}_exterior_city_tower_roof`;
      placeOnRing(cap, angle, radius, y + height + bodyRadius * 0.6);
      return tower;
    };

    const addDome = (angle, radius, y, domeRadius, stretch = 1.0) => {
      addBlock(angle, radius, y, domeRadius * 1.65, domeRadius * 0.7, domeRadius * 1.25, stoneMat);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(domeRadius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        roofMat.clone(),
      );
      dome.name = `${stage.id}_exterior_city_dome`;
      dome.scale.x = stretch;
      return placeOnRing(dome, angle, radius, y + domeRadius * 0.7);
    };

    const radius = atmosphere.exteriorCityRadius ?? 18.4;
    const baseY = atmosphere.exteriorCityBaseY ?? 4.45;
    const farSide = -Math.PI / 2;
    const skyline = [
      [-0.92, 2.6, 3.0, 1.9, 0.4],
      [-0.74, 1.9, 4.0, 1.45, 0.3],
      [-0.56, 2.9, 3.3, 2.0, 0.45],
      [-0.38, 2.1, 4.45, 1.55, 0.28],
      [-0.2, 3.2, 3.25, 2.1, 0.42],
      [0.0, 2.4, 4.2, 1.6, 0.25],
      [0.2, 3.4, 3.4, 2.2, 0.42],
      [0.39, 2.1, 4.55, 1.5, 0.28],
      [0.58, 2.8, 3.2, 1.9, 0.38],
      [0.76, 1.95, 3.9, 1.45, 0.28],
      [0.94, 2.7, 3.1, 1.85, 0.36],
    ];
    for (const [angleOffset, width, height, depth, offset] of skyline) {
      const angle = farSide + angleOffset;
      addBlock(angle, radius + offset, baseY, width, height, depth);
      addBlock(angle + 0.025, radius + offset - 0.06, baseY + height * 0.08, width * 0.38, height * 0.74, depth * 1.04, shadeMat);
    }

    const lowerBaseY = atmosphere.exteriorCityLowerBaseY ?? 1.05;
    const lowerRadius = atmosphere.exteriorCityLowerRadius ?? (radius + 0.25);
    const lowerSkyline = [
      [-0.96, 2.8, 3.9, 1.5],
      [-0.74, 2.1, 4.6, 1.28],
      [-0.5, 3.0, 4.05, 1.5],
      [-0.25, 2.3, 4.85, 1.28],
      [0.0, 3.2, 4.15, 1.5],
      [0.25, 2.2, 4.7, 1.28],
      [0.5, 2.95, 4.0, 1.5],
      [0.74, 2.1, 4.5, 1.28],
      [0.96, 2.6, 3.85, 1.4],
    ];
    for (const [angleOffset, width, height, depth] of lowerSkyline) {
      const angle = farSide + angleOffset;
      addBlock(angle, lowerRadius, lowerBaseY, width, height, depth);
      addBlock(angle + 0.02, lowerRadius - 0.08, lowerBaseY + height * 0.1, width * 0.34, height * 0.7, depth * 1.05, shadeMat);
    }

    for (const [angleOffset, height, bodyRadius] of [
      [-0.82, 5.6, 0.34],
      [-0.46, 6.1, 0.3],
      [-0.08, 5.8, 0.36],
      [0.34, 6.2, 0.32],
      [0.78, 5.4, 0.3],
    ]) {
      addTower(farSide + angleOffset, radius + 0.55, baseY, height, bodyRadius);
    }

    for (const [angleOffset, domeRadius, stretch] of [
      [-0.62, 1.05, 1.25],
      [-0.18, 1.25, 1.1],
      [0.26, 1.0, 1.35],
      [0.68, 0.9, 1.2],
    ]) {
      addDome(farSide + angleOffset, radius + 0.95, baseY + 1.35, domeRadius, stretch);
    }

    const hazeMat = new THREE.MeshBasicMaterial({
      color: atmosphere.exteriorCityHazeColor ?? 0xf2d2a0,
      map: this._makeSoftCloudTexture(),
      transparent: true,
      opacity: atmosphere.exteriorCityHazeOpacity ?? 0.18,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      fog: true,
    });
    for (const [angleOffset, y, sx, sy] of [
      [-0.68, 6.65, 4.8, 0.9],
      [0.0, 6.95, 6.0, 1.0],
      [0.68, 6.7, 4.6, 0.86],
    ]) {
      const haze = new THREE.Mesh(new THREE.CircleGeometry(1, 28), hazeMat.clone());
      haze.name = `${stage.id}_exterior_city_heat_haze`;
      haze.scale.set(sx, sy, 1);
      placeOnRing(haze, farSide + angleOffset, radius - 0.5, y, -0.35);
      haze.rotation.x = -0.08;
      haze.renderOrder = -4;
      this._meshEffects.push({
        kind: 'heat_shimmer',
        mesh: haze,
        basePosition: haze.position.clone(),
        baseScale: haze.scale.clone(),
        drift: new THREE.Vector3(0.025, 0.01, 0.02),
        speed: 0.18,
        phase: angleOffset * 4.3,
        opacity: haze.material.opacity,
        opacityPulse: haze.material.opacity * 0.12,
        scalePulse: 0.012,
      });
    }
  }

  _addDriftPoints(root, stage, options) {
    const rand = this._makeRand(this._hashString(`${stage.id}:${options.name}:${options.seed}`));
    const positions = new Float32Array(options.count * 3);
    const velocities = new Float32Array(options.count * 3);
    for (let i = 0; i < options.count; i++) {
      const base = i * 3;
      positions[base] = (rand() - 0.5) * options.bounds.x * 2;
      positions[base + 1] = options.bounds.minY + rand() * (options.bounds.maxY - options.bounds.minY);
      positions[base + 2] = (rand() - 0.5) * options.bounds.z * 2;
      velocities[base] = (options.velocity.x ?? 0) + (rand() - 0.5) * (options.jitter.x ?? 0);
      velocities[base + 1] = (options.velocity.y ?? 0) + (rand() - 0.5) * (options.jitter.y ?? 0);
      velocities[base + 2] = (options.velocity.z ?? 0) + (rand() - 0.5) * (options.jitter.z ?? 0);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.PointsMaterial({
      color: options.color,
      size: options.size ?? 0.05,
      map: options.soft ? this._makeDustMoteTexture() : null,
      transparent: true,
      opacity: options.opacity ?? 0.4,
      depthWrite: false,
      alphaTest: options.soft ? 0.02 : 0,
      blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.name = `${stage.id}_${options.name}`;
    root.add(points);
    this._stageEffects.push({
      points,
      velocities,
      bounds: options.bounds,
      sway: options.sway ?? 0,
      swaySpeed: options.swaySpeed ?? 1,
      resetFromTop: options.resetFromTop ?? false,
      resetDepth: options.resetDepth ?? 1,
      rand,
      time: rand() * 10,
    });
  }

  _addDriftLines(root, stage, options) {
    const rand = this._makeRand(this._hashString(`${stage.id}:${options.name}:${options.seed}`));
    const positions = new Float32Array(options.count * 2 * 3);
    const velocities = new Float32Array(options.count * 3);
    const lengths = new Float32Array(options.count);
    for (let i = 0; i < options.count; i++) {
      const leafBase = i * 3;
      const pointBase = i * 6;
      const x = (rand() - 0.5) * options.bounds.x * 2;
      const y = options.bounds.minY + rand() * (options.bounds.maxY - options.bounds.minY);
      const z = (rand() - 0.5) * options.bounds.z * 2;
      const length = (options.lengthMin ?? 0.08) + rand() * ((options.lengthMax ?? 0.16) - (options.lengthMin ?? 0.08));
      positions[pointBase] = x;
      positions[pointBase + 1] = y;
      positions[pointBase + 2] = z;
      positions[pointBase + 3] = x + length * 0.55;
      positions[pointBase + 4] = y - length;
      positions[pointBase + 5] = z + length * 0.16;
      velocities[leafBase] = (options.velocity.x ?? 0) + (rand() - 0.5) * (options.jitter.x ?? 0);
      velocities[leafBase + 1] = (options.velocity.y ?? 0) + (rand() - 0.5) * (options.jitter.y ?? 0);
      velocities[leafBase + 2] = (options.velocity.z ?? 0) + (rand() - 0.5) * (options.jitter.z ?? 0);
      lengths[i] = length;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: options.color,
        transparent: true,
        opacity: options.opacity ?? 0.3,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    );
    lines.name = `${stage.id}_${options.name}`;
    root.add(lines);
    this._lineEffects.push({
      lines,
      velocities,
      lengths,
      bounds: options.bounds,
      sway: options.sway ?? 0,
      swaySpeed: options.swaySpeed ?? 1,
      resetDepth: options.resetDepth ?? 1,
      rand,
      time: rand() * 10,
    });
  }

  _makeMoonlightShaftTexture() {
    return this._makeCanvasTexture(128, 512, (ctx, width, height) => {
      const horizontal = ctx.createLinearGradient(0, 0, width, 0);
      horizontal.addColorStop(0, 'rgba(255,255,255,0)');
      horizontal.addColorStop(0.42, 'rgba(255,255,255,0.45)');
      horizontal.addColorStop(0.5, 'rgba(255,255,255,0.65)');
      horizontal.addColorStop(0.58, 'rgba(255,255,255,0.45)');
      horizontal.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = horizontal;
      ctx.fillRect(0, 0, width, height);

      const fade = ctx.createLinearGradient(0, 0, 0, height);
      fade.addColorStop(0, 'rgba(0,0,0,0)');
      fade.addColorStop(0.18, 'rgba(0,0,0,0.78)');
      fade.addColorStop(0.72, 'rgba(0,0,0,0.44)');
      fade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';

      const rand = this._makeRand(0x5a7bb1);
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 22; i++) {
        ctx.fillStyle = `rgba(0,0,0,${0.025 + rand() * 0.035})`;
        ctx.fillRect(rand() * width, rand() * height, 2 + rand() * 14, height * (0.12 + rand() * 0.32));
      }
      ctx.globalCompositeOperation = 'source-over';
    });
  }

  _makeDustMoteTexture() {
    return this._makeCanvasTexture(64, 64, (ctx, width, height) => {
      const gradient = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        0,
        width * 0.5,
        height * 0.5,
        width * 0.5,
      );
      gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
      gradient.addColorStop(0.42, 'rgba(255,255,255,0.52)');
      gradient.addColorStop(0.78, 'rgba(255,255,255,0.12)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    });
  }

  _addMountaintopClouds(root, stage) {
    const atmosphere = stage.atmosphere;
    const cloudGroup = new THREE.Group();
    cloudGroup.name = `${stage.id}_cloud_sea`;
    root.add(cloudGroup);
    this._addMountaintopWeather(cloudGroup, stage);

    const cloudMat = new THREE.MeshBasicMaterial({
      color: atmosphere.cloudColor ?? 0xf0f3f4,
      map: this._makeSoftCloudTexture(),
      transparent: true,
      opacity: atmosphere.cloudOpacity ?? 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x1a2330,
      map: this._makeSoftCloudTexture(),
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const cloudDefs = [
      [-9.0, -7.2, 5.2, 1.2, 0.08],
      [-5.2, -8.8, 4.0, 0.95, -0.04],
      [-0.8, -9.4, 5.8, 1.25, 0.03],
      [4.4, -8.4, 4.6, 1.0, -0.12],
      [8.6, -6.8, 5.0, 1.1, 0.1],
      [-10.4, 0.8, 4.4, 0.9, -0.08],
      [10.2, 1.0, 4.9, 1.0, 0.07],
      [-6.4, 7.6, 4.8, 1.05, 0.02],
      [0.0, 8.6, 5.4, 1.2, -0.05],
      [6.5, 7.4, 4.7, 1.05, 0.08],
    ];
    for (const [x, z, radius, scale, rot] of cloudDefs) {
      const cloud = new THREE.Mesh(new THREE.CircleGeometry(radius, 28), cloudMat.clone());
      cloud.name = `${stage.id}_low_cloud`;
      cloud.position.set(x, atmosphere.cloudY ?? -2.2, z);
      cloud.rotation.x = -Math.PI / 2;
      cloud.rotation.z = rot;
      cloud.scale.set(1.45 * scale, 0.62 * scale, 1);
      cloud.renderOrder = -2;
      cloudGroup.add(cloud);

      const shade = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.72, 24), shadowMat.clone());
      shade.name = `${stage.id}_low_cloud_shadow`;
      shade.position.set(x + radius * 0.18, (atmosphere.cloudY ?? -2.2) - 0.04, z - radius * 0.08);
      shade.rotation.copy(cloud.rotation);
      shade.scale.set(1.28 * scale, 0.48 * scale, 1);
      shade.renderOrder = -3;
      cloudGroup.add(shade);
    }

    const bankMat = cloudMat.clone();
    bankMat.opacity = Math.min(0.55, (atmosphere.cloudOpacity ?? 0.55) * 0.72);
    const bankDefs = [
      [-7.8, -0.35, 6.8, 5.0, 1.05, -0.28],
      [-2.8, -0.15, 8.9, 4.2, 0.82, -0.08],
      [3.4, -0.22, 8.4, 4.8, 0.95, 0.14],
      [8.6, -0.4, 5.4, 4.5, 0.9, 0.32],
      [-9.2, -0.55, -1.7, 4.1, 0.8, 0.5],
      [9.4, -0.48, -1.2, 4.0, 0.78, -0.48],
    ];
    for (const [x, y, z, sx, sy, rot] of bankDefs) {
      const bank = new THREE.Mesh(new THREE.CircleGeometry(1, 32), bankMat.clone());
      bank.name = `${stage.id}_distant_cloud_bank`;
      bank.position.set(x, y, z);
      bank.scale.set(sx, sy, 1);
      bank.rotation.set(-0.06, 0, rot);
      bank.renderOrder = -1;
      cloudGroup.add(bank);
    }

    const haze = new THREE.Mesh(
      new THREE.CircleGeometry(18, 64),
      new THREE.MeshBasicMaterial({
        color: 0x263547,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    haze.name = `${stage.id}_distant_haze_disk`;
    haze.rotation.x = -Math.PI / 2;
    haze.position.y = (atmosphere.cloudY ?? -2.2) - 0.1;
    haze.renderOrder = -4;
    cloudGroup.add(haze);
  }

  _addMountaintopWeather(root, stage) {
    const rand = this._makeRand(this._hashString(`${stage.id}:storm_rain`));
    const rainPositions = [];
    for (let i = 0; i < 920; i++) {
      const x = (rand() - 0.5) * 24;
      const z = (rand() - 0.5) * 18;
      const y = -0.8 + rand() * 10.8;
      const length = 0.42 + rand() * 0.72;
      rainPositions.push(x, y, z, x + 0.28, y - length, z - 0.08);
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.Float32BufferAttribute(rainPositions, 3));
    rainGeo.getAttribute('position').setUsage(THREE.DynamicDrawUsage);
    const rain = new THREE.LineSegments(
      rainGeo,
      new THREE.LineBasicMaterial({
        color: 0x8fb3d6,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        fog: true,
      }),
    );
    rain.name = `${stage.id}_slant_rain`;
    rain.renderOrder = 2;
    root.add(rain);

    const lightningPoints = [
      new THREE.Vector3(7.6, 7.0, -10.5),
      new THREE.Vector3(7.1, 5.9, -10.3),
      new THREE.Vector3(7.5, 5.15, -10.45),
      new THREE.Vector3(6.85, 4.25, -10.2),
    ];
    const lightning = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(lightningPoints),
      new THREE.LineBasicMaterial({
        color: 0xb8d1ff,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        fog: false,
      }),
    );
    lightning.name = `${stage.id}_distant_lightning`;
    lightning.renderOrder = 3;
    root.add(lightning);

    const flashLight = new THREE.DirectionalLight(0xbdd7ff, 0);
    flashLight.name = `${stage.id}_lightning_flash_key`;
    flashLight.position.set(7, 9, -8);
    root.add(flashLight);

    const flashFill = new THREE.AmbientLight(0x8fb8ff, 0);
    flashFill.name = `${stage.id}_lightning_flash_fill`;
    root.add(flashFill);

    this._weather = {
      rain,
      rainSpeed: 9.5,
      rainWindX: 3.2,
      rainWindZ: -0.7,
      minY: -1.6,
      maxY: 9.8,
      lightning,
      flashLight,
      flashFill,
      lightningTimer: 1.6,
      flashTime: 0,
      flashPulse: 1,
    };
  }

  _makeSoftCloudTexture() {
    return this._makeCanvasTexture(256, 256, (ctx, width, height) => {
      const gradient = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        width * 0.05,
        width * 0.5,
        height * 0.5,
        width * 0.5,
      );
      gradient.addColorStop(0, 'rgba(255,255,255,0.78)');
      gradient.addColorStop(0.42, 'rgba(255,255,255,0.58)');
      gradient.addColorStop(0.72, 'rgba(255,255,255,0.22)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const rand = this._makeRand(0xc10dd5);
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 18; i++) {
        const x = rand() * width;
        const y = rand() * height;
        const r = 12 + rand() * 38;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(0,0,0,0.12)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    });
  }

  _makeHeatShimmerMaterial({ color = 0xffcf88, opacity = 0.2, strength = 1.0 } = {}) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
        uStrength: { value: strength },
      },
      vertexShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uStrength;
        void main() {
          vUv = uv;
          vec3 pos = position;
          float slow = sin(uv.y * 7.0 + sin(uv.x * 4.0 + uTime * 0.45) * 1.3 + uTime * 0.8);
          float fine = sin(uv.y * 24.0 + uv.x * 5.0 + uTime * 1.55);
          pos.x += (slow * 0.010 + fine * 0.003) * uv.y * uStrength;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uStrength;
        varying vec2 vUv;

        float heatHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
          float edgeFade = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
          float verticalFade = smoothstep(0.02, 0.2, vUv.y) * smoothstep(1.0, 0.22, 1.0 - vUv.y);
          float bend = sin(vUv.x * 4.2 + uTime * 0.5) * 1.15;
          float slowBand = sin(vUv.y * 8.0 + bend + uTime * 0.9);
          float ripple = sin(vUv.y * 31.0 + vUv.x * 8.0 + uTime * 1.8);
          float band = smoothstep(0.15, 0.92, slowBand * 0.48 + ripple * 0.16 + 0.52);
          float noise = heatHash(floor(vUv * vec2(10.0, 8.0)) + floor(uTime * 0.8));
          float alpha = band * edgeFade * verticalFade * (0.82 + noise * 0.08) * uOpacity * uStrength;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
  }

  _makePierWaterMaterial({ color = 0x194766, highlight = 0xffb66d, opacity = 0.72, strength = 1.0 } = {}) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWaterColor: { value: new THREE.Color(color) },
        uHighlightColor: { value: new THREE.Color(highlight) },
        uOpacity: { value: opacity },
        uStrength: { value: strength },
      },
      vertexShader: `
        varying vec2 vUv;
        varying float vWave;
        uniform float uTime;
        uniform float uStrength;
        void main() {
          vUv = uv;
          vec3 pos = position;
          float broad = sin(pos.x * 0.42 + uTime * 0.55) + sin(pos.y * 0.36 - uTime * 0.38);
          float tight = sin((pos.x + pos.y) * 1.15 + uTime * 0.9);
          vWave = broad * 0.5 + tight * 0.25;
          pos.z += vWave * 0.022 * uStrength;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uWaterColor;
        uniform vec3 uHighlightColor;
        uniform float uOpacity;
        varying vec2 vUv;
        varying float vWave;

        void main() {
          float horizon = smoothstep(0.45, 1.0, vUv.y);
          float rippleA = sin(vUv.x * 118.0 + vUv.y * 21.0 + uTime * 1.15) * 0.34;
          float rippleB = sin(vUv.y * 74.0 - vUv.x * 15.0 - uTime * 0.85) * 0.22;
          float ripple = rippleA + rippleB + 0.5;
          float band = smoothstep(0.8, 1.08, ripple + vWave * 0.08 + horizon * 0.12);
          vec3 water = mix(uWaterColor, uHighlightColor, band * 0.14 + horizon * 0.025);
          float edgeFade = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
          float alpha = uOpacity * (0.95 + band * 0.04) * edgeFade;
          gl_FragColor = vec4(water, max(alpha, 0.98));
        }
      `,
      transparent: false,
      depthWrite: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
  }

  _makePierDeckFillGeometry() {
    const shape = new THREE.Shape();
    shape.moveTo(-3.42, 2.98);
    shape.lineTo(3.42, 2.98);
    shape.lineTo(3.42, -2.36);
    shape.lineTo(2.54, -2.58);
    shape.lineTo(1.44, -2.42);
    shape.lineTo(0.38, -2.68);
    shape.lineTo(-0.58, -2.46);
    shape.lineTo(-1.7, -2.64);
    shape.lineTo(-2.62, -2.4);
    shape.lineTo(-3.42, -2.56);
    shape.lineTo(-3.42, 2.98);
    return new THREE.ShapeGeometry(shape);
  }

  _makePierDeckTexture() {
    return this._makeCanvasTexture(512, 512, (ctx, width, height) => {
      const rand = this._makeRand(0xd0c1f10);
      ctx.fillStyle = '#5c3a25';
      ctx.fillRect(0, 0, width, height);

      const plankWidth = 34;
      for (let x = 0; x < width + plankWidth; x += plankWidth) {
        const tone = rand();
        ctx.fillStyle = tone > 0.55
          ? this._colorStyle(0x81512e, 0.22)
          : this._colorStyle(0x352318, 0.2);
        ctx.fillRect(x, 0, plankWidth - 2, height);

        ctx.strokeStyle = this._colorStyle(0x2b1a12, 0.34);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + plankWidth - 1, 0);
        ctx.lineTo(x + plankWidth - 1, height);
        ctx.stroke();
      }

      for (let i = 0; i < 950; i++) {
        const x = rand() * width;
        const y = rand() * height;
        const len = 12 + rand() * 42;
        ctx.strokeStyle = rand() > 0.48
          ? this._colorStyle(0xa9703d, 0.1)
          : this._colorStyle(0x21160f, 0.12);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 6, y + len);
        ctx.stroke();
      }

      for (let y = 46; y < height; y += 92) {
        ctx.strokeStyle = this._colorStyle(0x2d1c14, 0.18);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + (rand() - 0.5) * 8);
        ctx.lineTo(width, y + (rand() - 0.5) * 8);
        ctx.stroke();
      }
    });
  }

  _makeHeatWaveTexture() {
    return this._makeCanvasTexture(128, 256, (ctx, width, height) => {
      const fade = ctx.createLinearGradient(0, 0, 0, height);
      fade.addColorStop(0, 'rgba(255,255,255,0)');
      fade.addColorStop(0.18, 'rgba(255,255,255,0.22)');
      fade.addColorStop(0.52, 'rgba(255,255,255,0.38)');
      fade.addColorStop(0.84, 'rgba(255,255,255,0.12)');
      fade.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, width, height);

      const rand = this._makeRand(0x8e47a13);
      for (let i = 0; i < 18; i++) {
        const x = rand() * width;
        const amp = 4 + rand() * 8;
        const phase = rand() * Math.PI * 2;
        ctx.strokeStyle = `rgba(255,255,255,${0.06 + rand() * 0.1})`;
        ctx.lineWidth = 2 + rand() * 3;
        ctx.beginPath();
        for (let y = 0; y <= height; y += 8) {
          const px = x + Math.sin(y * 0.055 + phase) * amp;
          if (y === 0) ctx.moveTo(px, y);
          else ctx.lineTo(px, y);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = `rgba(0,0,0,${0.04 + rand() * 0.08})`;
        ctx.fillRect(rand() * width, rand() * height, 4 + rand() * 14, 18 + rand() * 60);
      }
      ctx.globalCompositeOperation = 'source-over';
    });
  }

  _makeBambooLeafLitterTexture() {
    return this._makeCanvasTexture(512, 512, (ctx, width, height) => {
      const rand = this._makeRand(0xbab0011);
      ctx.fillStyle = '#4b3a24';
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < 2200; i++) {
        const x = rand() * width;
        const y = rand() * height;
        const r = 0.6 + rand() * 2.4;
        const tone = rand();
        ctx.fillStyle = tone > 0.72
          ? `rgba(128, 104, 54, ${0.16 + rand() * 0.16})`
          : tone > 0.38
            ? `rgba(63, 78, 36, ${0.1 + rand() * 0.14})`
            : `rgba(27, 23, 15, ${0.09 + rand() * 0.12})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < 190; i++) {
        const x = rand() * width;
        const y = rand() * height;
        const len = 10 + rand() * 34;
        const angle = rand() * Math.PI;
        const w = 0.7 + rand() * 1.4;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.strokeStyle = rand() > 0.45
          ? `rgba(135, 117, 63, ${0.22 + rand() * 0.24})`
          : `rgba(39, 54, 29, ${0.18 + rand() * 0.2})`;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(-len * 0.5, 0);
        ctx.quadraticCurveTo(0, (rand() - 0.5) * 5, len * 0.5, 0);
        ctx.stroke();
        ctx.restore();
      }

      const vignette = ctx.createRadialGradient(width * 0.5, height * 0.5, width * 0.08, width * 0.5, height * 0.5, width * 0.64);
      vignette.addColorStop(0, 'rgba(255, 226, 156, 0.1)');
      vignette.addColorStop(0.72, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    });
  }

  async _addModelStageDecor(root, stage, token) {
    if (!stage.decorModels?.length) return;

    const decorRoot = new THREE.Group();
    decorRoot.name = `${stage.id}_decor`;
    root.add(decorRoot);

    for (const decor of stage.decorModels) {
      if (!this._isStageFeatureEnabled(stage, decor.feature)) continue;
      try {
        const model = await StageLoader.loadModel(decor.path);
        if (token !== this._loadToken) return;
        this._addDecorScatter(decorRoot, model.scene, decor, stage);
      } catch (error) {
        console.warn(`[arena] Failed to load decor '${decor.path}' for stage '${stage.id}'`, error);
      }
    }
  }

  _addDecorScatter(root, source, decor, stage) {
    source.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      if (decor.materialTint || decor.materialOpacity != null) {
        const wasArray = Array.isArray(child.material);
        const materials = wasArray ? child.material : [child.material];
        const cloned = materials.map((material) => {
          const clone = material.clone();
          if (decor.materialTint) clone.color?.setHex(decor.materialTint);
          if (decor.materialStyle === 'matte') {
            clone.roughness = 1;
            clone.metalness = 0;
            clone.emissive?.setHex(0x000000);
            clone.envMap = null;
            clone.map = null;
            clone.normalMap = null;
            clone.roughnessMap = null;
            clone.metalnessMap = null;
          }
          if (decor.materialOpacity != null) {
            clone.transparent = true;
            clone.opacity = decor.materialOpacity;
            clone.depthWrite = false;
          }
          clone.fog = true;
          return clone;
        });
        child.material = wasArray ? cloned : cloned[0];
      }
    });
    source.updateMatrixWorld(true);

    if (decor.mode === 'placements') {
      this._addDecorPlacements(root, source, decor, stage);
      return;
    }
    if (decor.mode !== 'ring') return;

    const sourceBox = new THREE.Box3().setFromObject(source);
    const rand = this._makeRand(this._hashString(`${stage.id}:${decor.path}:${decor.radius}:${decor.count}`));
    const count = decor.count ?? 1;
    const radius = decor.radius ?? 8;
    const radialJitter = decor.radialJitter ?? 0;
    const angleJitter = decor.angleJitter ?? 0;
    const scaleMin = decor.scaleMin ?? 1;
    const scaleMax = decor.scaleMax ?? scaleMin;
    const rotationJitter = decor.rotationJitter ?? 0;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (rand() - 0.5) * angleJitter;
      const scale = scaleMin + rand() * (scaleMax - scaleMin);
      const r = radius + (rand() - 0.5) * radialJitter;
      const clone = source.clone(true);
      clone.name = `${stage.id}_decor_${i}`;
      clone.scale.setScalar(scale);
      clone.position.set(
        Math.cos(angle) * r,
        (-sourceBox.min.y * scale) + (decor.yOffset ?? 0) - (decor.groundSink ?? 0),
        Math.sin(angle) * r,
      );
      clone.rotation.y = decor.faceCenter
        ? -angle + Math.PI / 2 + (rand() - 0.5) * rotationJitter
        : rand() * Math.PI * 2;
      root.add(clone);
      if (decor.sway && this._isStageFeatureEnabled(stage, decor.swayFeature)) {
        this._meshEffects.push({
          kind: 'sway_group',
          mesh: clone,
          baseRotation: clone.rotation.clone(),
          speed: decor.swaySpeed ?? 0.18,
          phase: i * 1.73 + r * 0.11,
          amountX: decor.swayX ?? 0.008,
          amountZ: decor.swayZ ?? 0.012,
        });
      }
    }
  }

  _addDecorPlacements(root, source, decor, stage) {
    for (let i = 0; i < (decor.placements?.length ?? 0); i++) {
      const placement = decor.placements[i];
      const clone = source.clone(true);
      clone.name = `${stage.id}_decor_placement_${i}`;
      const scale = placement.scale ?? 1;
      if (Array.isArray(scale)) {
        clone.scale.set(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1);
      } else {
        clone.scale.setScalar(scale);
      }
      clone.position.set(...(placement.position ?? [0, 0, 0]));
      clone.rotation.set(
        placement.rotationX ?? 0,
        placement.rotationY ?? 0,
        placement.rotationZ ?? 0,
      );
      root.add(clone);
      if (decor.sway && this._isStageFeatureEnabled(stage, decor.swayFeature)) {
        this._meshEffects.push({
          kind: 'sway_group',
          mesh: clone,
          baseRotation: clone.rotation.clone(),
          speed: decor.swaySpeed ?? 0.18,
          phase: i * 1.73,
          amountX: decor.swayX ?? 0.006,
          amountZ: decor.swayZ ?? 0.01,
        });
      }
    }
  }

  _hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }


  _addPitFloor(stage) {
    if (!stage.pitFloor) return;
    if (!this._isStageFeatureEnabled(stage, stage.pitFloor.feature)) return;
    const floorGeo = new THREE.CircleGeometry(stage.pitFloor.radius ?? ARENA_RADIUS, 96);
    const floorMat = new THREE.MeshStandardMaterial({
      color: stage.pitFloor.color ?? 0x8b7354,
      map: stage.pitFloor.texture === 'bamboo_leaf_litter' ? this._makeBambooLeafLitterTexture() : null,
      roughness: 0.92,
      metalness: 0.02,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.name = `${stage.id}_fight_pit_floor`;
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = stage.pitFloor.y ?? 0.015;
    floor.receiveShadow = true;
    this.group.add(floor);
  }


  _buildTestArena() {
    const platformGeo = new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS + 0.3, 0.4, 48);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.85,
      metalness: 0.05,
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = -0.2;
    platform.receiveShadow = true;
    this.group.add(platform);

    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    this._addFightBoundaryMarkers(0.01, 0x666666, ringMat);

    const centerGeo = new THREE.CircleGeometry(0.5, 24);
    const centerMat = new THREE.MeshStandardMaterial({
      color: 0x776644,
      roughness: 0.7,
    });
    const center = new THREE.Mesh(centerGeo, centerMat);
    center.rotation.x = -Math.PI / 2;
    center.position.y = 0.01;
    this.group.add(center);

    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const markerGeo = new THREE.BoxGeometry(0.3, 0.05, 0.1);
      const marker = new THREE.Mesh(markerGeo, ringMat);
      marker.position.set(
        Math.cos(angle) * (ARENA_RADIUS - 0.3),
        0.02,
        Math.sin(angle) * (ARENA_RADIUS - 0.3),
      );
      marker.rotation.y = angle;
      this.group.add(marker);
    }

    const groundGeo = new THREE.PlaneGeometry(50, 50);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  _buildLowPolyArena(stage) {
    const root = new THREE.Group();
    root.name = `stage_${stage.id}`;
    this.group.add(root);

    const sandTexture = this._makeSandTexture();
    const stoneTexture = this._makeStoneTexture(0x746959, 0x463f37, 0x9b8e78);
    const stoneDarkTexture = this._makeStoneTexture(0x4a4238, 0x2b2622, 0x685d4f);
    const redBannerTexture = this._makeBannerTexture(0x79201c, 0xa42c25);
    const blueBannerTexture = this._makeBannerTexture(0x172a46, 0x25456d);

    const sandMat = this._mat(0xffffff, { map: sandTexture, roughness: 0.98, flatShading: true });
    const stoneMat = this._mat(0xffffff, { map: stoneTexture, roughness: 0.94, flatShading: true, side: THREE.DoubleSide });
    const stoneDarkMat = this._mat(0xffffff, { map: stoneDarkTexture, roughness: 0.98, flatShading: true, side: THREE.DoubleSide });
    const stoneLightMat = this._mat(0xb0a185, { map: stoneTexture, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
    const woodMat = this._mat(0x3e2418, { roughness: 0.82, flatShading: true });
    const redBannerMat = this._mat(0xffffff, { map: redBannerTexture, roughness: 0.92, side: THREE.DoubleSide });
    const blueBannerMat = this._mat(0xffffff, { map: blueBannerTexture, roughness: 0.92, side: THREE.DoubleSide });
    const emberMat = this._mat(0xff8a22, { emissive: 0xff4a00, emissiveIntensity: 1.7, flatShading: true });

    this._addGround(root);
    this._addStageLighting(root);

    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_RADIUS + 0.22, ARENA_RADIUS + 0.58, 0.26, 40),
      sandMat,
    );
    floor.name = 'blood_sand_floor';
    floor.position.y = -0.13;
    floor.receiveShadow = true;
    root.add(floor);

    this._addLowPolyWall(root, stoneMat, stoneDarkMat, stoneLightMat);
    this._addLowPolyStands(root, stoneMat, stoneDarkMat, stoneLightMat);
    this._addMonumentArches(root, stoneMat, stoneDarkMat, stoneLightMat, redBannerMat, emberMat);
    this._addBanners(root, redBannerMat, blueBannerMat);
    this._addTorches(root, woodMat, emberMat);
    this._addBrokenStone(root, stoneMat, stoneDarkMat, stoneLightMat);
  }

  _mat(color, options = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      metalness: 0.03,
      ...options,
    });
  }

  _makeCanvasTexture(width, height, draw) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    draw(ctx, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 2;
    texture.needsUpdate = true;
    return texture;
  }

  _colorStyle(color, alpha = 1) {
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  _makeRand(seed) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  _makeSandTexture() {
    return this._makeCanvasTexture(512, 512, (ctx, width, height) => {
      const rand = this._makeRand(0x5a4d201d);
      ctx.fillStyle = this._colorStyle(0xa86f3e);
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < 4200; i++) {
        const v = rand();
        ctx.fillStyle = v > 0.58
          ? this._colorStyle(0xc18a52, 0.13)
          : this._colorStyle(0x704831, 0.1);
        ctx.fillRect(rand() * width, rand() * height, 1, 1);
      }

      for (let i = 0; i < 18; i++) {
        const x = rand() * width;
        const y = rand() * height;
        ctx.strokeStyle = this._colorStyle(0x60402e, 0.07);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 28, y + (rand() - 0.5) * 8);
        ctx.stroke();
      }
    });
  }

  _makeStoneTexture(base = 0x696051, shadow = 0x3e3831, light = 0x8d816e) {
    return this._makeCanvasTexture(256, 256, (ctx, width, height) => {
      const rand = this._makeRand(base ^ shadow ^ light);
      ctx.fillStyle = this._colorStyle(base);
      ctx.fillRect(0, 0, width, height);

      for (let y = 0; y < height; y += 32) {
        for (let x = -16; x < width; x += 52) {
          const offset = (Math.floor(y / 32) % 2) * 24;
          ctx.fillStyle = this._colorStyle(rand() > 0.5 ? light : shadow, 0.18);
          ctx.fillRect(x + offset, y, 48 + rand() * 16, 28 + rand() * 8);
        }
      }

      ctx.strokeStyle = this._colorStyle(0x1c1916, 0.26);
      ctx.lineWidth = 2;
      for (let y = 32; y < height; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y + (rand() - 0.5) * 3);
        ctx.lineTo(width, y + (rand() - 0.5) * 3);
        ctx.stroke();
      }
      for (let i = 0; i < 32; i++) {
        const x = rand() * width;
        const y = rand() * height;
        ctx.strokeStyle = this._colorStyle(0x171412, 0.22);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 34, y + (rand() - 0.5) * 26);
        ctx.stroke();
      }
    });
  }

  _makeBannerTexture(base, highlight) {
    return this._makeCanvasTexture(128, 256, (ctx, width, height) => {
      const rand = this._makeRand(base ^ highlight ^ 0x9119);
      ctx.fillStyle = this._colorStyle(base);
      ctx.fillRect(0, 0, width, height);

      for (let x = 0; x < width; x += 18) {
        ctx.fillStyle = this._colorStyle(x % 36 === 0 ? highlight : 0x080706, x % 36 === 0 ? 0.18 : 0.12);
        ctx.fillRect(x, 0, 8 + rand() * 5, height);
      }

      for (let i = 0; i < 16; i++) {
        ctx.strokeStyle = this._colorStyle(0x0b0908, 0.18);
        ctx.lineWidth = 1;
        ctx.beginPath();
        const y = rand() * height;
        ctx.moveTo(rand() * width, y);
        ctx.lineTo(rand() * width, y + (rand() - 0.5) * 18);
        ctx.stroke();
      }
    });
  }

  _addGround(root) {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(18, 48),
      new THREE.MeshStandardMaterial({
        color: 0x171411,
        roughness: 1,
        flatShading: true,
      }),
    );
    ground.name = 'arena_dark_ground';
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.32;
    ground.receiveShadow = true;
    root.add(ground);
  }

  _addStageLighting(root) {
    const warmFill = new THREE.PointLight(0xffb06a, 1.75, 18, 1.65);
    warmFill.name = 'arena_warm_fill';
    warmFill.position.set(0, 5.4, 1.2);
    root.add(warmFill);

    const coolBack = new THREE.DirectionalLight(0x7f9dff, 0.34);
    coolBack.name = 'arena_cool_backlight';
    coolBack.position.set(-4, 5, -7);
    root.add(coolBack);

    const upperBounce = new THREE.HemisphereLight(0xffd2a2, 0x241713, 0.44);
    upperBounce.name = 'arena_upper_bounce';
    root.add(upperBounce);
  }

  _addLowPolyWall(root, stoneMat, stoneDarkMat, stoneLightMat) {
    const innerWall = new THREE.Mesh(
      new THREE.CylinderGeometry(8.28, 8.52, 0.92, 48, 1, true),
      stoneMat,
    );
    innerWall.name = 'continuous_inner_arena_wall';
    innerWall.position.y = 0.44;
    innerWall.castShadow = true;
    innerWall.receiveShadow = true;
    root.add(innerWall);

    for (const [radius, y, tube, mat] of [
      [8.4, 0.04, 0.05, stoneDarkMat],
      [8.5, 0.94, 0.08, stoneLightMat],
    ]) {
      const rail = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 5, 48), mat);
      rail.name = 'arena_wall_rail';
      rail.rotation.x = Math.PI / 2;
      rail.position.y = y;
      rail.castShadow = true;
      rail.receiveShadow = true;
      root.add(rail);
    }

    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2;
      const inset = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.54, 0.06),
        stoneDarkMat,
      );
      inset.name = 'inner_wall_arch_shadow';
      this._placeRadial(inset, 8.22, angle, 0.44, true);
      inset.receiveShadow = true;
      root.add(inset);
    }

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + Math.PI / 12;
      const buttress = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.12, 0.68), stoneDarkMat);
      buttress.name = 'arena_wall_buttress';
      this._placeRadial(buttress, 8.7, angle, 0.58, true);
      buttress.castShadow = true;
      buttress.receiveShadow = true;
      root.add(buttress);
    }
  }

  _addLowPolyStands(root, stoneMat, stoneDarkMat, stoneLightMat) {
    for (let row = 0; row < 5; row++) {
      const inner = 8.88 + row * 0.78;
      const outer = inner + 0.56;
      const step = new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, 48),
        row % 2 === 0 ? stoneLightMat : stoneMat,
      );
      step.name = 'continuous_stand_step';
      step.rotation.x = -Math.PI / 2;
      step.position.y = 0.96 + row * 0.22;
      step.receiveShadow = true;
      root.add(step);

      const riser = new THREE.Mesh(
        new THREE.CylinderGeometry(inner, inner, 0.28, 48, 1, true),
        stoneDarkMat,
      );
      riser.name = 'stand_riser';
      riser.position.y = 0.82 + row * 0.22;
      riser.receiveShadow = true;
      root.add(riser);
    }
  }

  _addMonumentArches(root, stoneMat, stoneDarkMat, stoneLightMat, redBannerMat, emberMat) {
    for (const [angle, width, height, broken] of [
      [-Math.PI / 2, 3.2, 2.0, false],
      [-Math.PI / 2 - 0.62, 1.9, 1.45, true],
      [-Math.PI / 2 + 0.62, 1.9, 1.45, true],
      [Math.PI / 2, 2.25, 1.45, true],
    ]) {
      const arch = new THREE.Group();
      arch.name = 'ruined_arena_arch';
      arch.position.set(Math.cos(angle) * 9.1, 0, Math.sin(angle) * 9.1);
      arch.rotation.y = -angle - Math.PI / 2;
      root.add(arch);

      for (const sx of [-1, 1]) {
        const column = new THREE.Mesh(
          new THREE.BoxGeometry(broken ? 0.38 : 0.5, height, 0.64),
          sx < 0 && broken ? stoneDarkMat : stoneMat,
        );
        column.name = 'ruined_arch_column';
        column.position.set(sx * width * 0.38, height * 0.5, 0);
        column.rotation.z = broken && sx < 0 ? -0.08 : 0;
        column.castShadow = true;
        column.receiveShadow = true;
        arch.add(column);
      }

      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(width, broken ? 0.28 : 0.34, 0.72),
        broken ? stoneDarkMat : stoneLightMat,
      );
      lintel.name = 'ruined_arch_lintel';
      lintel.position.set(broken ? 0.1 : 0, height + (broken ? 0.03 : 0.08), 0);
      lintel.rotation.z = broken ? 0.04 : 0;
      lintel.castShadow = true;
      lintel.receiveShadow = true;
      arch.add(lintel);

      if (!broken) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, 0.18, 0.84), stoneDarkMat);
        cap.name = 'main_arch_capstone';
        cap.position.set(0, height + 0.36, 0);
        cap.castShadow = true;
        cap.receiveShadow = true;
        arch.add(cap);

        const banner = new THREE.Mesh(this._bannerGeometry(0.92, 1.38), redBannerMat);
        banner.name = 'main_arch_banner';
        banner.position.set(0, height * 0.48, 0.38);
        arch.add(banner);

        for (const sx of [-1.25, 1.25]) {
          const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.42, 6), emberMat);
          flame.name = 'main_arch_flame';
          flame.position.set(sx, height + 0.36, 0.08);
          arch.add(flame);

          const light = new THREE.PointLight(0xff8a33, 0.45, 4.0, 2.1);
          light.name = 'main_arch_light';
          light.position.copy(flame.position);
          arch.add(light);
        }
      }
    }
  }

  _addBanners(root, redBannerMat, blueBannerMat) {
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const banner = new THREE.Mesh(
        this._bannerGeometry(0.52, 1.12),
        i % 2 === 0 ? redBannerMat : blueBannerMat,
      );
      banner.name = 'hanging_arena_banner';
      banner.position.set(Math.cos(angle) * 8.18, 0.66, Math.sin(angle) * 8.18);
      banner.rotation.y = -angle;
      banner.rotation.z = ((i % 3) - 1) * 0.06;
      banner.castShadow = true;
      root.add(banner);
    }

    for (const [angle, mat, y] of [
      [-0.98, redBannerMat, 0.98],
      [-2.16, blueBannerMat, 0.92],
    ]) {
      const longBanner = new THREE.Mesh(this._bannerGeometry(0.7, 1.42), mat);
      longBanner.name = 'tall_ruin_banner';
      longBanner.position.set(Math.cos(angle) * 8.18, y, Math.sin(angle) * 8.18);
      longBanner.rotation.y = -angle;
      longBanner.rotation.z = angle < -1 ? -0.08 : 0.06;
      root.add(longBanner);
    }
  }

  _bannerGeometry(width, height) {
    const half = width / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-half, height / 2);
    shape.lineTo(half, height / 2);
    shape.lineTo(half, -height / 2 + 0.18);
    shape.lineTo(0, -height / 2);
    shape.lineTo(-half, -height / 2 + 0.18);
    shape.lineTo(-half, height / 2);
    return new THREE.ShapeGeometry(shape);
  }

  _addTorches(root, woodMat, emberMat) {
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(angle) * 7.86;
      const z = Math.sin(angle) * 7.86;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 1.16, 5), woodMat);
      post.name = 'torch_post';
      post.position.set(x, 0.76, z);
      post.castShadow = true;
      root.add(post);

      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 6), emberMat);
      flame.name = 'torch_flame';
      flame.position.set(x, 1.42, z);
      flame.rotation.y = angle;
      root.add(flame);

      const light = new THREE.PointLight(0xff8a33, 0.42, 4.2, 2.1);
      light.name = 'torch_light';
      light.position.set(x, 1.35, z);
      root.add(light);
    }
  }

  _addBrokenStone(root, stoneMat, stoneDarkMat, stoneLightMat) {
    for (const [angle, height, lean] of [
      [0.55, 0.9, 0.16],
      [2.6, 0.62, -0.22],
      [4.05, 1.05, 0.1],
    ]) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, height, 7), stoneMat);
      column.name = 'broken_column';
      column.position.set(Math.cos(angle) * 9.45, height * 0.5 - 0.03, Math.sin(angle) * 9.45);
      column.rotation.z = lean;
      column.castShadow = true;
      column.receiveShadow = true;
      root.add(column);
    }
  }

  _placeRadial(object, radius, angle, y, tangent = false) {
    object.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    object.rotation.y = tangent ? -angle : 0;
  }

  _addFightBoundaryMarkers(y, color, material = null) {
    const ringGeo = new THREE.RingGeometry(ARENA_RADIUS * 0.6, ARENA_RADIUS * 0.62, 64);
    const ringMat = material ?? new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = 'fight_boundary_ring';
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = y;
    ring.receiveShadow = true;
    this.group.add(ring);
  }

  isOutOfBounds(x, z) {
    return Math.sqrt(x * x + z * z) > ARENA_RADIUS + 0.5;
  }

  clampToArena(pos) {
    const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
    if (dist > ARENA_RADIUS - 0.3) {
      const scale = (ARENA_RADIUS - 0.3) / dist;
      pos.x *= scale;
      pos.z *= scale;
    }
    return pos;
  }
}
