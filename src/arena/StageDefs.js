import { ARENA_RADIUS } from '../core/Constants.js';

export const DEFAULT_STAGE = 'test';
export const AMPHITHEATER_PIT_RADIUS = 6.77;
export const BAMBOO_CLEARING_RADIUS = 4.6;
export const MOUNTAINTOP_RADIUS = 3.35;

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
    modelScale: 19.5,
    modelYOffset: 2.78,
    showBoundaryMarkers: false,
    camera: Object.freeze({
      maxRadius: 4.15,
    }),
    decorModels: Object.freeze([
      Object.freeze({
        path: '/stages/bamboo_forest_cluster.glb',
        mode: 'ring',
        count: 24,
        radius: 7.35,
        radialJitter: 0.45,
        angleJitter: 0.07,
        scaleMin: 3.7,
        scaleMax: 5.0,
        faceCenter: true,
        rotationJitter: 0.22,
        groundSink: 0.65,
      }),
      Object.freeze({
        path: '/stages/bamboo_forest_cluster.glb',
        mode: 'ring',
        count: 16,
        radius: 10.1,
        radialJitter: 0.8,
        angleJitter: 0.12,
        scaleMin: 5.8,
        scaleMax: 7.6,
        faceCenter: true,
        rotationJitter: 0.35,
        groundSink: 0.85,
      }),
    ]),
    environment: Object.freeze({
      background: 0x607f65,
      fogColor: 0x315740,
      fogDensity: 0.022,
    }),
    lighting: Object.freeze({
      sun: Object.freeze({
        color: 0xffd69a,
        intensity: 1.78,
        position: Object.freeze([-7, 9, -5]),
      }),
      hemisphere: Object.freeze({
        skyColor: 0xa5c99a,
        groundColor: 0x24381f,
        intensity: 0.92,
      }),
      fill: Object.freeze({
        color: 0x74a46c,
        intensity: 0.36,
      }),
    }),
    atmosphere: Object.freeze({
      type: 'moonlit_bamboo',
      shaftColor: 0xd5ffb8,
      shaftOpacity: 0.18,
    }),
    bounds: Object.freeze({ type: 'circle', radius: BAMBOO_CLEARING_RADIUS }),
  }),
  mountaintop: Object.freeze({
    id: 'mountaintop',
    displayName: 'Mountaintop',
    description: 'Tiny storm-lashed summit above distant mountains',
    modelPath: '/stages/mountaintop_rock_pillar_raw.glb',
    modelScale: 11,
    modelYOffset: -3.62,
    showBoundaryMarkers: false,
    camera: Object.freeze({
      maxRadius: 5.4,
    }),
    decorModels: Object.freeze([
      Object.freeze({
        path: '/stages/pyramidal_mountain_raw.glb',
        mode: 'placements',
        materialTint: 0x0b1220,
        materialOpacity: 0.94,
        materialStyle: 'matte',
        placements: Object.freeze([
          Object.freeze({
            position: Object.freeze([-30, -3.6, -18]),
            rotationY: -0.8,
            scale: Object.freeze([28, 20, 24]),
          }),
          Object.freeze({
            position: Object.freeze([-9, -3.8, -28]),
            rotationY: -0.12,
            scale: Object.freeze([34, 26, 31]),
          }),
          Object.freeze({
            position: Object.freeze([17, -3.7, -25]),
            rotationY: 0.34,
            scale: Object.freeze([32, 24, 29]),
          }),
          Object.freeze({
            position: Object.freeze([39, -3.5, -17]),
            rotationY: 0.9,
            scale: Object.freeze([27, 19, 23]),
          }),
        ]),
      }),
    ]),
    environment: Object.freeze({
      background: 0x02050a,
      fogColor: 0x0b1421,
      fogDensity: 0.032,
    }),
    lighting: Object.freeze({
      sun: Object.freeze({
        color: 0x83a7d7,
        intensity: 0.62,
        position: Object.freeze([-6, 10, -4]),
      }),
      hemisphere: Object.freeze({
        skyColor: 0x17263a,
        groundColor: 0x08090d,
        intensity: 0.24,
      }),
      fill: Object.freeze({
        color: 0x1b2e48,
        intensity: 0.09,
      }),
    }),
    atmosphere: Object.freeze({
      type: 'mountaintop_clouds',
      cloudColor: 0x26303d,
      cloudOpacity: 0.76,
      cloudY: -1.15,
    }),
    bounds: Object.freeze({ type: 'circle', radius: MOUNTAINTOP_RADIUS }),
  }),
});

export function normalizeStageId(stageId) {
  return STAGE_DEFS[stageId] ? stageId : DEFAULT_STAGE;
}
