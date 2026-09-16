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

/** 折线上的一点：屏幕坐标 + 是否可见（被地球遮挡或在相机背后时为 false） */
export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

/** 屏幕空间折线，用于轨道线拾取 */
export interface ScreenPolyline {
  id: string;
  points: ScreenPoint[];
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

/** 点到线段的距离平方（屏幕像素） */
export function pointSegmentDistanceSq(
  pointerX: number,
  pointerY: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq > 0 ? ((pointerX - ax) * dx + (pointerY - ay) * dy) / lengthSq : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + dx * t - pointerX;
  const cy = ay + dy * t - pointerY;
  return cx * cx + cy * cy;
}

/**
 * 在若干条屏幕折线中找出离指针最近的一条。
 * 用于"点击轨道线直接锁定卫星"：整条轨道在屏幕上的每一段都参与判定。
 */
export function pickNearestPolyline(
  polylines: Iterable<ScreenPolyline>,
  pointerX: number,
  pointerY: number,
  maxPixels = 12,
): string | null {
  let bestId: string | null = null;
  let bestSquared = maxPixels * maxPixels;
  for (const line of polylines) {
    const points = line.points;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      // 遮挡/背向相机的点直接跳过，避免"点到地球背面的轨道"
      if (!a.visible || !b.visible) continue;
      if (Math.min(a.x, b.x) - maxPixels > pointerX || Math.max(a.x, b.x) + maxPixels < pointerX) continue;
      if (Math.min(a.y, b.y) - maxPixels > pointerY || Math.max(a.y, b.y) + maxPixels < pointerY) continue;
      const distance = pointSegmentDistanceSq(pointerX, pointerY, a.x, a.y, b.x, b.y);
      if (distance <= bestSquared) {
        bestSquared = distance;
        bestId = line.id;
      }
    }
  }
  return bestId;
}
