import { ARENA_RADIUS } from '../core/Constants.js';

export const DEFAULT_STAGE = 'test';
export const AMPHITHEATER_PIT_RADIUS = 6.77;
export const BAMBOO_CLEARING_RADIUS = 5.75;

export const STAGE_DEFS = Object.freeze({
  test: Object.freeze({
    id: 'test',
    displayName: 'Test',
    description: 'Clean circular gameplay test arena',
    environment: Object.freeze({
      background: 0x111118,
      fogColor: 0x111118,
      fogDensity: 0.04,
    }),
    bounds: Object.freeze({ type: 'circle', radius: ARENA_RADIUS }),
  }),
  amphitheater: Object.freeze({
    id: 'amphitheater',
    displayName: 'Amphitheater',
    description: 'Ancient amphitheater model with original textures',
    modelPath: '/stages/ancient_amphitheater_model3_raw.glb',
    modelScale: 32,
    modelYOffset: 4.65,
    showBoundaryMarkers: false,
    camera: Object.freeze({
      maxRadius: 5.8,
    }),
    backdrop: Object.freeze({
      type: 'amphitheater_day',
      blockerRadius: 15.9,
      blockerHeight: 5.2,
      blockerY: 1.85,
      blockerColor: 0x5d4b38,
    }),
    environment: Object.freeze({
      background: 0xa9d2ee,
      fogColor: 0xd9c6a8,
      fogDensity: 0.004,
    }),
    lighting: Object.freeze({
      sun: Object.freeze({
        color: 0xfff1c2,
        intensity: 1.75,
        position: Object.freeze([-7, 13, 9]),
      }),
      hemisphere: Object.freeze({
        skyColor: 0xcfe7ff,
        groundColor: 0x8a6848,
        intensity: 0.62,
      }),
      fill: Object.freeze({
        color: 0xffd2a0,
        intensity: 0.22,
      }),
    }),
    bounds: Object.freeze({ type: 'circle', radius: AMPHITHEATER_PIT_RADIUS }),
  }),
  bamboo_clearing: Object.freeze({
    id: 'bamboo_clearing',
    displayName: 'Bamboo Clearing',
    description: 'Small clearing enclosed by dense bamboo',
    modelPath: '/stages/bamboo_courtyard_raw.glb',
    modelScale: 24,
    modelYOffset: 3.6,
    showBoundaryMarkers: false,
    camera: Object.freeze({
      maxRadius: 5.35,
    }),
    decorModels: Object.freeze([
      Object.freeze({
        path: '/stages/bamboo_forest_cluster.glb',
        mode: 'ring',
        count: 22,
        radius: 8.15,
        radialJitter: 0.55,
        angleJitter: 0.07,
        scaleMin: 4.4,
        scaleMax: 5.8,
        faceCenter: true,
        rotationJitter: 0.22,
        groundSink: 0.65,
      }),
      Object.freeze({
        path: '/stages/bamboo_forest_cluster.glb',
        mode: 'ring',
        count: 14,
        radius: 11.8,
        radialJitter: 1.1,
        angleJitter: 0.12,
        scaleMin: 6.5,
        scaleMax: 8.4,
        faceCenter: true,
        rotationJitter: 0.35,
        groundSink: 0.85,
      }),
    ]),
    environment: Object.freeze({
      background: 0xbfd7c1,
      fogColor: 0x6f8865,
      fogDensity: 0.018,
    }),
    lighting: Object.freeze({
      sun: Object.freeze({
        color: 0xfff1c4,
        intensity: 1.25,
        position: Object.freeze([-5, 12, 6]),
      }),
      hemisphere: Object.freeze({
        skyColor: 0xdff4da,
        groundColor: 0x4a3520,
        intensity: 0.72,
      }),
      fill: Object.freeze({
        color: 0xb6d89d,
        intensity: 0.18,
      }),
    }),
    bounds: Object.freeze({ type: 'circle', radius: BAMBOO_CLEARING_RADIUS }),
  }),
});

export function normalizeStageId(stageId) {
  return STAGE_DEFS[stageId] ? stageId : DEFAULT_STAGE;
}
