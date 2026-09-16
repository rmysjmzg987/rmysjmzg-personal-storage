import { describe, it, expect } from 'vitest';
import {
  pointSegmentDistanceSq,
  pickNearestPolyline,
  type ScreenPoint,
  type ScreenPolyline,
} from '../src/viz/picking';

const visible = (x: number, y: number): ScreenPoint => ({ x, y, visible: true });
const hidden = (): ScreenPoint => ({ x: 0, y: 0, visible: false });

describe('pointSegmentDistanceSq', () => {
  it('measures perpendicular distance for a point beside the segment', () => {
    expect(pointSegmentDistanceSq(5, 3, 0, 0, 10, 0)).toBeCloseTo(9, 9);
  });

  it('clamps to the nearest endpoint beyond the segment', () => {
    expect(pointSegmentDistanceSq(-4, 0, 0, 0, 10, 0)).toBeCloseTo(16, 9);
    expect(pointSegmentDistanceSq(20, 0, 0, 0, 10, 0)).toBeCloseTo(100, 9);
  });

  it('handles degenerate zero-length segments', () => {
    expect(pointSegmentDistanceSq(3, 4, 0, 0, 0, 0)).toBeCloseTo(25, 9);
  });
});

describe('pickNearestPolyline', () => {
  const ring = (id: string, diameter: number): ScreenPolyline => {
    const points: ScreenPoint[] = [];
    const radius = diameter / 2;
    for (let i = 0; i <= 64; i += 1) {
      const angle = (i / 64) * Math.PI * 2;
      points.push(visible(300 + Math.cos(angle) * radius, 300 + Math.sin(angle) * radius));
    }
    return { id, points };
  };

  it('finds the orbit whose line passes under the pointer', () => {
    const lines = [ring('inner', 100), ring('outer', 260)];
    expect(pickNearestPolyline(lines, 300 + 130, 300, 12)).toBe('outer');
    expect(pickNearestPolyline(lines, 300 + 50, 300, 12)).toBe('inner');
  });

  it('returns null when every line is farther than the tolerance', () => {
    const lines = [ring('outer', 260)];
    expect(pickNearestPolyline(lines, 300, 300, 8)).toBeNull();
  });

  it('ignores segments that are occluded by the earth', () => {
    const lines: ScreenPolyline[] = [
      { id: 'behind', points: [visible(10, 400), hidden(), visible(200, 400)] },
      { id: 'front', points: [visible(300, 300), visible(400, 300)] },
    ];
    expect(pickNearestPolyline(lines, 100, 400, 12)).toBeNull();
    expect(pickNearestPolyline(lines, 350, 302, 12)).toBe('front');
  });

  it('prefers the closest line when two overlap', () => {
    const near: ScreenPolyline = { id: 'near', points: [visible(100, 200), visible(500, 200)] };
    const far: ScreenPolyline = { id: 'far', points: [visible(100, 206), visible(500, 206)] };
    expect(pickNearestPolyline([far, near], 300, 201, 10)).toBe('near');
    expect(pickNearestPolyline([near, far], 300, 205, 10)).toBe('far');
  });

  it('snaps a click onto a slanted orbit segment', () => {
    const line: ScreenPolyline = {
      id: 'slanted',
      points: [visible(0, 0), visible(100, 100), visible(200, 40)],
    };
    // 点到斜线段 (0,0)-(100,100) 的垂足
    expect(pickNearestPolyline([line], 50, 54, 12)).toBe('slanted');
    expect(pickNearestPolyline([line], 50, 90, 12)).toBeNull();
  });
});
