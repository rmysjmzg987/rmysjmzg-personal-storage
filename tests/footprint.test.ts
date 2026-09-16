import { describe, it, expect } from 'vitest';
import {
  coneRayDirection,
  footprintAngularRadius,
  footprintGroundPoint,
  orthonormalBasis,
} from '../src/viz/footprint';
import { isCityWithin } from '../src/ui/cityLabels';
import { EARTH_RADIUS_KM, geodeticToEcef } from '../src/core/frames';

const DEG = Math.PI / 180;

describe('footprintAngularRadius', () => {
  it('matches the analytic nadir formula', () => {
    const r = EARTH_RADIUS_KM + 700;
    const alpha = 7.5 * DEG;
    const lambda = footprintAngularRadius(r, alpha);
    const expected = Math.asin((r * Math.sin(alpha)) / EARTH_RADIUS_KM) - alpha;
    expect(lambda).toBeCloseTo(expected, 12);
  });

  it('approaches the horizon limit for very wide fields of view', () => {
    const r = EARTH_RADIUS_KM + 500;
    const alphaMax = Math.asin(EARTH_RADIUS_KM / r);
    const lambda = footprintAngularRadius(r, alphaMax);
    expect(Number.isFinite(lambda)).toBe(true);
    expect(lambda).toBeCloseTo(Math.acos(EARTH_RADIUS_KM / r), 12);
  });
});

describe('footprint ground ring', () => {
  const ecef = { x: 0, y: 0, z: EARTH_RADIUS_KM + 706 };
  const nadir = { x: 0, y: 0, z: -1 };
  const { u, v } = orthonormalBasis(nadir);

  it('lands every sampled boundary point on the sphere', () => {
    const alpha = 7.5 * DEG;
    for (let i = 0; i < 96; i += 1) {
      const azimuth = (i / 96) * Math.PI * 2;
      const direction = coneRayDirection(nadir, u, v, alpha, azimuth);
      const point = footprintGroundPoint(ecef, direction);
      expect(point).not.toBeNull();
      const radius = Math.hypot(point!.x, point!.y, point!.z);
      expect(radius).toBeCloseTo(EARTH_RADIUS_KM, 6);
    }
  });

  it('keeps the boundary at the analytic angular radius', () => {
    const alpha = 7.5 * DEG;
    const lambda = footprintAngularRadius(
      Math.hypot(ecef.x, ecef.y, ecef.z),
      alpha,
    );
    for (let i = 0; i < 24; i += 1) {
      const azimuth = (i / 24) * Math.PI * 2;
      const direction = coneRayDirection(nadir, u, v, alpha, azimuth);
      const point = footprintGroundPoint(ecef, direction)!;
      const angle = Math.acos(point.z / Math.hypot(point.x, point.y, point.z));
      expect(angle).toBeCloseTo(lambda, 9);
    }
  });

  it('does not produce NaN at the horizon limit', () => {
    const r = EARTH_RADIUS_KM + 500;
    const position = { x: 0, y: 0, z: r };
    const alphaMax = Math.asin(EARTH_RADIUS_KM / r);
    const axis = { x: 0, y: 0, z: -1 };
    const basis = orthonormalBasis(axis);
    for (let i = 0; i < 32; i += 1) {
      const direction = coneRayDirection(axis, basis.u, basis.v, alphaMax, (i / 32) * Math.PI * 2);
      const point = footprintGroundPoint(position, direction);
      expect(point).not.toBeNull();
      expect(Number.isFinite(point!.x + point!.y + point!.z)).toBe(true);
    }
  });

  it('stays flat (no NaN) when the satellite is below the surface', () => {
    expect(footprintGroundPoint({ x: 0, y: 0, z: EARTH_RADIUS_KM - 10 }, nadir)).toBeNull();
  });
});

describe('city coverage test', () => {
  it('detects a city inside the highlighted circle', () => {
    const beijing = geodeticToEcef(39.904, 116.407);
    const length = Math.hypot(beijing.x, beijing.y, beijing.z);
    const unit = { x: beijing.x / length, y: beijing.y / length, z: beijing.z / length };
    expect(isCityWithin(unit, unit, 0.01)).toBe(true);
    expect(isCityWithin(unit, unit, -0.5)).toBe(false);
  });

  it('measures distance in geocentric angle, not chord length', () => {
    const a = geodeticToEcef(0, 0);
    const b = geodeticToEcef(0, 90);
    const normalise = (v: { x: number; y: number; z: number }) => {
      const length = Math.hypot(v.x, v.y, v.z);
      return { x: v.x / length, y: v.y / length, z: v.z / length };
    };
    expect(isCityWithin(normalise(a), normalise(b), Math.PI / 2 - 0.02)).toBe(false);
    expect(isCityWithin(normalise(a), normalise(b), Math.PI / 2 + 0.02)).toBe(true);
  });
});
