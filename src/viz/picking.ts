import * as THREE from 'three';
import { EARTH_RADIUS_KM } from '../core/frames';

export interface ScreenSample {
  id: string;
  x: number;
  y: number;
  z: number;
  screenX: number;
  screenY: number;
  visible: boolean;
}

/** 相机与目标连线是否被地球挡住（用地球半径做简单球体遮挡判断） */
export function isOccludedByEarth(
  cameraPosition: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  earthRadiusKm = EARTH_RADIUS_KM,
): boolean {
  const dx = target.x - cameraPosition.x;
  const dy = target.y - cameraPosition.y;
  const dz = target.z - cameraPosition.z;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  if (lengthSquared === 0) return false;
  const t = -(cameraPosition.x * dx + cameraPosition.y * dy + cameraPosition.z * dz) / lengthSquared;
  if (t <= 0 || t >= 1) return false;
  const px = cameraPosition.x + dx * t;
  const py = cameraPosition.y + dy * t;
  const pz = cameraPosition.z + dz * t;
  const distanceToCenter = Math.hypot(px, py, pz);
  return distanceToCenter < earthRadiusKm * 0.999;
}

const projected = new THREE.Vector3();

export function projectSample(
  camera: THREE.PerspectiveCamera,
  position: { x: number; y: number; z: number },
  width: number,
  height: number,
): { x: number; y: number; depth: number } | null {
  projected.set(position.x, position.y, position.z);
  const depth = projected.distanceTo(camera.position);
  projected.project(camera);
  if (projected.z > 1) return null;
  return {
    x: ((projected.x + 1) / 2) * width,
    y: ((1 - projected.y) / 2) * height,
    depth,
  };
}

export function pickNearest(
  samples: ScreenSample[],
  pointerX: number,
  pointerY: number,
  maxPixels = 22,
): string | null {
  let bestId: string | null = null;
  let bestDistance = maxPixels * maxPixels;
  for (const sample of samples) {
    if (!sample.visible) continue;
    const dx = sample.screenX - pointerX;
    const dy = sample.screenY - pointerY;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared <= bestDistance) {
      bestDistance = distanceSquared;
      bestId = sample.id;
    }
  }
  return bestId;
}
