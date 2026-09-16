import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  coneRayDirection,
  createFootprint,
  footprintAngularRadius,
  footprintGroundPoint,
  orthonormalBasis,
} from '../src/viz/footprint';
import { isCityWithin } from '../src/ui/cityLabels';
import { EARTH_RADIUS_KM, eciToEcef, geodeticToEcef, rotateZ } from '../src/core/frames';

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
  it('places the fan centre and nadir unit at the sub-satellite point, not its antipode', () => {
    const footprint = createFootprint();
    const gmst = 0.7;
    const position = { x: EARTH_RADIUS_KM + 420, y: 1200, z: 900 };
    footprint.update({ satelliteEci: position, gmstRad: gmst, fovDeg: 40 });

    const ecef = eciToEcef(position, gmst);
    const radius = Math.hypot(ecef.x, ecef.y, ecef.z);
    const expected = rotateZ(
      { x: ecef.x / radius, y: ecef.y / radius, z: ecef.z / radius },
      gmst,
    );

    const nadirUnit = footprint.nadirUnitEci();
    expect(nadirUnit).not.toBeNull();
    expect(nadirUnit!.x).toBeCloseTo(expected.x, 9);
    expect(nadirUnit!.y).toBeCloseTo(expected.y, 9);
    expect(nadirUnit!.z).toBeCloseTo(expected.z, 9);

    const fanGeometry = (footprint.group.children[0] as THREE.Mesh).geometry as THREE.BufferGeometry;
    const fanPositions = fanGeometry.getAttribute('position') as THREE.BufferAttribute;
    const centre = { x: fanPositions.getX(0), y: fanPositions.getY(0), z: fanPositions.getZ(0) };
    const centreRadius = Math.hypot(centre.x, centre.y, centre.z);
    expect(centreRadius).toBeGreaterThan(EARTH_RADIUS_KM);
    expect(centre.x / centreRadius).toBeCloseTo(expected.x, 6);
    expect(centre.y / centreRadius).toBeCloseTo(expected.y, 6);
    expect(centre.z / centreRadius).toBeCloseTo(expected.z, 6);

    footprint.dispose();
  });

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
