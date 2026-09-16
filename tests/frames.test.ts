import { describe, it, expect } from 'vitest';
import { julianDate, gmstRadians, eciToEcef, ecefToGeodetic, rotateZ } from '../src/core/frames';

describe('julianDate', () => {
  it('maps the J2000.0 epoch', () => {
    expect(julianDate(new Date('2000-01-01T12:00:00.000Z'))).toBeCloseTo(2451545.0, 9);
  });
});

describe('gmstRadians', () => {
  it('matches the J2000.0 value (280.46061837 deg)', () => {
    expect(gmstRadians(2451545.0)).toBeCloseTo(4.894961212735792, 9);
  });

  it('advances about 0.9856 deg per solar day', () => {
    const a = gmstRadians(2451545.0);
    const b = gmstRadians(2451546.0);
    const delta = ((b - a) * 180) / Math.PI + 360;
    expect(delta % 360).toBeCloseTo(0.9856, 2);
  });
});

describe('eciToEcef', () => {
  it('is the inverse of rotating by +gmst', () => {
    const v = { x: 7000, y: -1200, z: 300 };
    const g = 1.234;
    const back = rotateZ(eciToEcef(v, g), g);
    expect(back.x).toBeCloseTo(v.x, 9);
    expect(back.y).toBeCloseTo(v.y, 9);
    expect(back.z).toBeCloseTo(v.z, 9);
  });
});

describe('ecefToGeodetic', () => {
  it('maps the equatorial point', () => {
    const r = ecefToGeodetic({ x: 6378.137, y: 0, z: 0 });
    expect(r.latDeg).toBeCloseTo(0, 9);
    expect(r.lonDeg).toBeCloseTo(0, 9);
    expect(r.altKm).toBeCloseTo(0, 6);
  });

  it('maps the north pole', () => {
    const r = ecefToGeodetic({ x: 0, y: 0, z: 6356.7523142 });
    expect(r.latDeg).toBeCloseTo(90, 6);
    expect(r.altKm).toBeCloseTo(0, 3);
  });

  it('recovers an altitude above the equator', () => {
    const r = ecefToGeodetic({ x: 6378.137 + 400, y: 0, z: 0 });
    expect(r.altKm).toBeCloseTo(400, 3);
  });
});
