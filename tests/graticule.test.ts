import { describe, it, expect } from 'vitest';
import { graticuleSegments } from '../src/viz/graticule';

describe('graticuleSegments', () => {
  const radius = 6371 * 1.001;
  const seg = graticuleSegments(radius, 15, 72);

  it('emits whole segments of 6 floats', () => {
    expect(seg.length % 6).toBe(0);
    expect(seg.length).toBeGreaterThan(0);
  });

  it('keeps every vertex on the sphere', () => {
    for (let i = 0; i < seg.length; i += 3) {
      expect(Math.hypot(seg[i], seg[i + 1], seg[i + 2])).toBeCloseTo(radius, 3);
    }
  });
});
