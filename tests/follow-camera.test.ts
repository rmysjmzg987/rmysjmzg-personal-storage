import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { orthogonalizeUp, stabilizeFrameUp } from '../src/core/followCamera';

const DEG = Math.PI / 180;

/** 极轨道：卫星在 x-z 平面内绕行，u=90° 时正处北极上空 */
function polarViewDir(u: number): THREE.Vector3 {
  const r = new THREE.Vector3(Math.cos(u), 0, Math.sin(u));
  return r.negate().normalize();
}

describe('orthogonalizeUp', () => {
  it('removes the component parallel to the view direction', () => {
    const up = new THREE.Vector3(0, 1, 0);
    const view = new THREE.Vector3(0, 1, 0);
    expect(orthogonalizeUp(up, view)).toBeCloseTo(0, 12);
  });

  it('keeps an already perpendicular vector unchanged', () => {
    const up = new THREE.Vector3(0, 0, 1);
    const view = new THREE.Vector3(-1, 0, 0);
    expect(orthogonalizeUp(up, view)).toBeCloseTo(1, 12);
    expect(up.z).toBeCloseTo(1, 12);
  });
});

describe('stabilizeFrameUp', () => {
  it('settles on north when the satellite is over the equator', () => {
    const up = new THREE.Vector3(0, 1, 0);
    const view = new THREE.Vector3(-1, 0, 0);
    for (let i = 0; i < 400; i += 1) stabilizeFrameUp(up, view, 1 / 60, 1.5);
    expect(up.z).toBeCloseTo(1, 3);
    expect(Math.abs(up.dot(view))).toBeLessThan(1e-6);
  });

  it('always keeps up perpendicular to the view direction', () => {
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= 720; i += 1) {
      const view = polarViewDir((i / 720) * Math.PI * 2);
      stabilizeFrameUp(up, view, 1 / 60, 0.45);
      expect(up.length()).toBeCloseTo(1, 6);
      expect(Math.abs(up.dot(view))).toBeLessThan(1e-6);
      expect(Number.isFinite(up.x + up.y + up.z)).toBe(true);
    }
  });

  it('never flips abruptly while the satellite flies over a pole', () => {
    const up = new THREE.Vector3(0, 1, 0);
    const dt = 1 / 60;
    const rate = 0.45;
    let previous = up.clone();
    let previousView = polarViewDir(0);
    // 从南极方向飞向北极为止，覆盖整个极区穿越过程
    for (let i = 0; i <= 600; i += 1) {
      const u = (i / 600) * Math.PI;
      const view = polarViewDir(u);
      stabilizeFrameUp(up, view, dt, rate);
      const step = previous.angleTo(up);
      // 每帧允许的滚转 = 限速值 + 视线本身的转动（重新正交化带来的分量）
      expect(step).toBeLessThanOrEqual(rate * dt + previousView.angleTo(view) + 1e-6);
      previous = up.clone();
      previousView = view.clone();
    }
  });

  it('keeps a stable roll through the degenerate polar view', () => {
    const view = new THREE.Vector3(0, 0, -1);
    const up = new THREE.Vector3(0, 1, 0);
    stabilizeFrameUp(up, view, 1 / 60, 0.45);
    const before = up.clone();
    for (let i = 0; i < 120; i += 1) stabilizeFrameUp(up, view, 1 / 60, 0.45);
    // 视线正对极点时没有"北"可言，画面不应自行翻滚
    expect(before.angleTo(up)).toBeLessThan(1e-3);
    expect(Math.abs(up.dot(view))).toBeLessThan(1e-6);
  });

  it('recovers when the previous up is parallel to the view direction', () => {
    const view = new THREE.Vector3(0, 1, 0);
    const up = new THREE.Vector3(0, 1, 0);
    stabilizeFrameUp(up, view, 1 / 60, 0.45);
    expect(up.length()).toBeCloseTo(1, 6);
    expect(Math.abs(up.dot(view))).toBeLessThan(1e-6);
  });

  it('tracks north continuously for an inclined orbit', () => {
    const up = new THREE.Vector3(0, 1, 0);
    const inclination = 51.6 * DEG;
    for (let i = 0; i <= 1440; i += 1) {
      const u = (i / 720) * Math.PI * 2;
      const r = new THREE.Vector3(
        Math.cos(u),
        Math.sin(u) * Math.cos(inclination),
        Math.sin(u) * Math.sin(inclination),
      ).normalize();
      const view = r.clone().negate();
      stabilizeFrameUp(up, view, 1 / 60, 1.5);
      expect(Math.abs(up.dot(view))).toBeLessThan(1e-6);
      if (i < 180) continue; // 跳过起始对准阶段
      // 倾角 51.6° 的轨道不会接近极点，画面应始终"北朝上"
      const north = new THREE.Vector3(0, 0, 1).addScaledVector(view, -view.z).normalize();
      expect(up.dot(north)).toBeGreaterThan(0.999);
    }
  });
});
