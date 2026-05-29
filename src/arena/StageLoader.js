import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class StageLoader {
  static _loader = new GLTFLoader();
  static _assetCache = new Map();

  static getAssetPaths(stageDef) {
    const paths = [];
    if (stageDef?.modelPath) paths.push(stageDef.modelPath);
    for (const decor of stageDef?.decorModels ?? []) {
      if (decor?.path) paths.push(decor.path);
    }
    return [...new Set(paths)];
  }

  static async preloadStage(stageDef) {
    const paths = StageLoader.getAssetPaths(stageDef);
    const assets = await Promise.all(paths.map(async (path) => {
      const gltf = await StageLoader._loadGLTF(path);
      return {
        path,
        scene: gltf.scene,
        animations: gltf.animations ?? [],
      };
    }));
    return {
      stageId: stageDef?.id ?? null,
      paths,
      assets,
    };
  }

  static async preloadStages(stageDefs, onProgress = null) {
    const entries = Object.entries(stageDefs);
    const cache = {};
    for (let i = 0; i < entries.length; i++) {
      const [id, stage] = entries[i];
      onProgress?.({ id, stage, index: i, total: entries.length });
      cache[id] = await StageLoader.preloadStage(stage);
    }
    return cache;
  }

  static async loadStage(stageDef) {
    if (!stageDef?.modelPath) return null;
    return StageLoader.loadModel(stageDef.modelPath);
  }

  static async loadModel(path) {
    const gltf = await StageLoader._loadGLTF(path);
    return {
      scene: StageLoader._cloneScene(gltf.scene),
      animations: gltf.animations ?? [],
    };
  }

  static _loadGLTF(path) {
    if (!StageLoader._assetCache.has(path)) {
      StageLoader._assetCache.set(path, StageLoader._loader.loadAsync(path));
    }
    return StageLoader._assetCache.get(path);
  }

  static _cloneScene(scene) {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      child.material = Array.isArray(child.material)
        ? child.material.map((material) => material.clone())
        : child.material.clone();
    });
    return clone;
  }
}
