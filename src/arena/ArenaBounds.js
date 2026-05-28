import { DEFAULT_STAGE, STAGE_DEFS, normalizeStageId } from './StageDefs.js';

let currentArenaStage = DEFAULT_STAGE;

export function setCurrentArenaStage(stageId) {
  currentArenaStage = normalizeStageId(stageId);
  return currentArenaStage;
}

export function getCurrentArenaStage() {
  return currentArenaStage;
}

function getStageBounds(stageId = currentArenaStage) {
  return STAGE_DEFS[normalizeStageId(stageId)].bounds;
}

function getRectLimits(bounds, margin = 0) {
  const halfWidth = bounds.halfWidth ?? 0;
  const halfDepth = bounds.halfDepth ?? 0;
  const centerX = bounds.centerX ?? 0;
  const centerZ = bounds.centerZ ?? 0;
  return {
    minX: bounds.minX ?? (centerX - halfWidth),
    maxX: bounds.maxX ?? (centerX + halfWidth),
    minZ: bounds.minZ ?? (centerZ - halfDepth),
    maxZ: bounds.maxZ ?? (centerZ + halfDepth),
    margin,
  };
}

export function getArenaBounds(stageId = currentArenaStage) {
  return getStageBounds(stageId);
}

export function getStageBoundaryMode(stageId = currentArenaStage) {
  return getStageBounds(stageId).boundary ?? 'cliff';
}

export function getStageCameraBounds(stageId = currentArenaStage) {
  return STAGE_DEFS[normalizeStageId(stageId)].camera ?? null;
}

export function isPointInsideArena(x, z, stageId = null, margin = 0) {
  const bounds = getStageBounds(stageId ?? currentArenaStage);
  if (bounds.type === 'circle') {
    return Math.hypot(x, z) <= bounds.radius + margin;
  }
  if (bounds.type === 'rect') {
    const rect = getRectLimits(bounds, margin);
    return (
      x >= rect.minX - margin &&
      x <= rect.maxX + margin &&
      z >= rect.minZ - margin &&
      z <= rect.maxZ + margin
    );
  }
  return true;
}

export function getArenaBoundaryDistance(x, z, stageId = null, margin = 0) {
  const bounds = getStageBounds(stageId ?? currentArenaStage);
  if (bounds.type === 'circle') {
    return Math.max(0, bounds.radius + margin - Math.hypot(x, z));
  }
  if (bounds.type === 'rect') {
    const rect = getRectLimits(bounds, margin);
    return Math.max(0, Math.min(
      x - (rect.minX - margin),
      (rect.maxX + margin) - x,
      z - (rect.minZ - margin),
      (rect.maxZ + margin) - z,
    ));
  }
  return Infinity;
}

export function getArenaEdgeDistance(x, z, stageId = null) {
  const bounds = getStageBounds(stageId ?? currentArenaStage);
  if (bounds.type === 'circle') return bounds.radius - Math.hypot(x, z);
  if (bounds.type === 'rect') {
    const rect = getRectLimits(bounds);
    return Math.min(
      x - rect.minX,
      rect.maxX - x,
      z - rect.minZ,
      rect.maxZ - z,
    );
  }
  return Infinity;
}

export function getArenaBoundaryContact(x, z, stageId = null, inset = 0) {
  const bounds = getStageBounds(stageId ?? currentArenaStage);
  if (bounds.type === 'circle') {
    const limit = Math.max(0.2, bounds.radius - inset);
    const dist = Math.hypot(x, z);
    if (dist <= limit) return null;

    const normalX = dist > 1e-6 ? x / dist : 1;
    const normalZ = dist > 1e-6 ? z / dist : 0;
    return {
      boundary: bounds.boundary ?? 'cliff',
      radius: bounds.radius,
      limit,
      targetX: normalX * limit,
      targetZ: normalZ * limit,
      penetration: dist - limit,
      normalX,
      normalZ,
      pointX: normalX * bounds.radius,
      pointZ: normalZ * bounds.radius,
    };
  }

  if (bounds.type === 'rect') {
    const rect = getRectLimits(bounds);
    const minX = rect.minX + inset;
    const maxX = rect.maxX - inset;
    const minZ = rect.minZ + inset;
    const maxZ = rect.maxZ - inset;
    const inside = x >= minX && x <= maxX && z >= minZ && z <= maxZ;
    if (inside) return null;

    const clampedX = Math.min(Math.max(x, minX), maxX);
    const clampedZ = Math.min(Math.max(z, minZ), maxZ);
    const distances = [
      { penetration: minX - x, normalX: -1, normalZ: 0, pointX: rect.minX, pointZ: Math.min(Math.max(z, rect.minZ), rect.maxZ) },
      { penetration: x - maxX, normalX: 1, normalZ: 0, pointX: rect.maxX, pointZ: Math.min(Math.max(z, rect.minZ), rect.maxZ) },
      { penetration: minZ - z, normalX: 0, normalZ: -1, pointX: Math.min(Math.max(x, rect.minX), rect.maxX), pointZ: rect.minZ },
      { penetration: z - maxZ, normalX: 0, normalZ: 1, pointX: Math.min(Math.max(x, rect.minX), rect.maxX), pointZ: rect.maxZ },
    ].filter((entry) => entry.penetration > 0);
    const contact = distances.sort((a, b) => b.penetration - a.penetration)[0];
    if (!contact) return null;

    return {
      boundary: bounds.boundary ?? 'cliff',
      targetX: clampedX,
      targetZ: clampedZ,
      penetration: contact.penetration,
      normalX: contact.normalX,
      normalZ: contact.normalZ,
      pointX: contact.pointX,
      pointZ: contact.pointZ,
    };
  }

  return null;
}

export function clampPointToArena(pos, stageId = null, inset = 0.3) {
  const bounds = getStageBounds(stageId ?? currentArenaStage);
  if (bounds.type === 'circle') {
    const maxRadius = Math.max(0.2, bounds.radius - inset);
    const dist = Math.hypot(pos.x, pos.z);
    if (dist <= maxRadius || dist < 1e-6) return pos;
    pos.x = (pos.x / dist) * maxRadius;
    pos.z = (pos.z / dist) * maxRadius;
  }
  if (bounds.type === 'rect') {
    const rect = getRectLimits(bounds);
    pos.x = Math.min(Math.max(pos.x, rect.minX + inset), rect.maxX - inset);
    pos.z = Math.min(Math.max(pos.z, rect.minZ + inset), rect.maxZ - inset);
  }
  return pos;
}
