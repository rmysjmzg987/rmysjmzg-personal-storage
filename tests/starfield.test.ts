import { describe, it, expect } from 'vitest';
import { randomSpherePoints } from '../src/viz/starfield';

describe('randomSpherePoints', () => {
  const radius = 300000;
  const pts = randomSpherePoints(500, radius, 7);

  it('returns 3 floats per star', () => {
    expect(pts.length).toBe(500 * 3);
  });

  it('places every star on the sphere', () => {
    for (let i = 0; i < pts.length; i += 3) {
      const r = Math.hypot(pts[i], pts[i + 1], pts[i + 2]);
      expect(Math.abs(r - radius) / radius).toBeLessThan(1e-5);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(Array.from(randomSpherePoints(50, radius, 7))).toEqual(
      Array.from(randomSpherePoints(50, radius, 7)),
    );
    expect(Array.from(randomSpherePoints(50, radius, 8))).not.toEqual(
      Array.from(randomSpherePoints(50, radius, 7)),
    );
  });
});
