import { describe, it, expect } from 'vitest';
import { buildRecord } from '../src/orbit/catalog';
import { classifyOrbit } from '../src/orbit/classify';
import { createKeplerJ2Propagator, j2SecularRates, solveKepler } from '../src/orbit/keplerJ2';
import type { OrbitClassKey } from '../src/orbit/types';
import catalogJson from '../public/data/catalog.json';

const catalog = catalogJson;

function recordFor(noradId: number) {
  const meta = catalog.satellites.find((sat) => sat.noradId === noradId);
  if (!meta) throw new Error(`catalog missing ${noradId}`);
  return buildRecord(meta, new Map());
}

/** 规格 §17 的 18 颗预制卫星，按真实 TLE 判定出的轨道类型 */
const EXPECTED: [number, OrbitClassKey][] = [
  [49954, 'equatorial'],
  [38358, 'equatorial'],
  [43613, 'polar'],
  [36508, 'polar'],
  [49260, 'sso'],
  [40697, 'sso'],
  [25544, 'leo'],
  [56232, 'leo'],
  [43873, 'meo'],
  [43246, 'meo'],
  [44337, 'igso'],
  [42738, 'igso'],
  [41836, 'geo'],
  [51850, 'geo'],
  [58584, 'heo'],
  [44453, 'heo'],
  [54880, 'retrograde'],
  [67433, 'retrograde'],
];

describe('catalog + classification', () => {
  it('loads the full preset and library catalog', () => {
    expect(catalog.satellites.length).toBeGreaterThanOrEqual(76);
    expect(catalog.satellites.filter((sat) => sat.preset).length).toBe(18);
    expect(catalog.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  for (const [noradId, expected] of EXPECTED) {
    it(`classifies ${noradId} as ${expected}`, () => {
      expect(recordFor(noradId).derived.orbitClass).toBe(expected);
    });
  }

  it('does not classify everything into the same bucket', () => {
    const classes = new Set(EXPECTED.map(([id]) => recordFor(id).derived.orbitClass));
    expect(classes.size).toBe(9);
  });
});

describe('classifyOrbit rules', () => {
  const base = {
    eccentricity: 0,
    inclinationDeg: 0,
    periodSeconds: 5400,
    perigeeAltitudeKm: 500,
    apogeeAltitudeKm: 520,
  };
  it('prefers highly elliptical over everything else', () => {
    expect(classifyOrbit({ ...base, eccentricity: 0.7, perigeeAltitudeKm: 1000, periodSeconds: 43000 })).toBe('heo');
  });
  it('splits geosynchronous by inclination', () => {
    const geoSync = { ...base, periodSeconds: 1436 * 60, perigeeAltitudeKm: 35786, apogeeAltitudeKm: 35786 };
    expect(classifyOrbit({ ...geoSync, inclinationDeg: 0.1 })).toBe('geo');
    expect(classifyOrbit({ ...geoSync, inclinationDeg: 55 })).toBe('igso');
  });
  it('treats 12-hour orbits as MEO', () => {
    expect(
      classifyOrbit({ ...base, periodSeconds: 718 * 60, perigeeAltitudeKm: 20000, apogeeAltitudeKm: 20200 }),
    ).toBe('meo');
  });
  it('subdivides low orbits by inclination', () => {
    expect(classifyOrbit({ ...base, inclinationDeg: 0.2 })).toBe('equatorial');
    expect(classifyOrbit({ ...base, inclinationDeg: 92 })).toBe('polar');
    expect(classifyOrbit({ ...base, inclinationDeg: 98.2 })).toBe('sso');
    expect(classifyOrbit({ ...base, inclinationDeg: 51.6 })).toBe('leo');
    expect(classifyOrbit({ ...base, inclinationDeg: 142 })).toBe('retrograde');
  });
});

describe('sgp4 propagator', () => {
  it('puts the ISS at low Earth orbit altitude with orbital speed', () => {
    const iss = recordFor(25544);
    const t = new Date();
    const position = iss.propagator.positionEciKm(t);
    const velocity = iss.propagator.velocityEciKmS(t);
    expect(position).not.toBeNull();
    expect(velocity).not.toBeNull();
    const radius = Math.hypot(position!.x, position!.y, position!.z);
    expect(radius).toBeGreaterThan(6600);
    expect(radius).toBeLessThan(6900);
    const speed = Math.hypot(velocity!.x, velocity!.y, velocity!.z);
    expect(speed).toBeGreaterThan(7.4);
    expect(speed).toBeLessThan(7.9);
    expect(iss.derived.periodSeconds!).toBeGreaterThan(88 * 60);
    expect(iss.derived.periodSeconds!).toBeLessThan(94 * 60);
  });

  it('keeps a geostationary satellite at 42164 km', () => {
    const geo = recordFor(41836);
    const position = geo.propagator.positionEciKm(new Date());
    const radius = Math.hypot(position!.x, position!.y, position!.z);
    expect(radius).toBeGreaterThan(42000);
    expect(radius).toBeLessThan(42400);
    expect(geo.derived.periodSeconds! / 60).toBeGreaterThan(1430);
    expect(geo.derived.periodSeconds! / 60).toBeLessThan(1445);
  });

  it('reports perigee and apogee consistent with a highly elliptical orbit', () => {
    const arktika = recordFor(58584);
    expect(arktika.derived.apogeeAltitudeKm).toBeGreaterThan(30000);
    expect(arktika.derived.perigeeAltitudeKm).toBeLessThan(5000);
  });
});

describe('kepler j2 propagator', () => {
  const epoch = new Date('2026-01-01T00:00:00.000Z');
  const elements = {
    epoch,
    semiMajorAxisKm: 7078,
    eccentricity: 0.001,
    inclinationDeg: 98.2,
    raanDeg: 30,
    argPerigeeDeg: 90,
    meanAnomalyDeg: 0,
    meanMotionRevPerDay: 14.6,
  };

  it('matches the keplerian period', () => {
    const propagator = createKeplerJ2Propagator(elements);
    const period = propagator.periodSeconds()!;
    const expected = 2 * Math.PI * Math.sqrt(7078 ** 3 / 398600.4418);
    expect(period).toBeCloseTo(expected, 3);
  });

  it('precesses sun-synchronously (about +0.9856 deg/day)', () => {
    const rates = j2SecularRates(elements);
    const degreesPerDay = (rates.raanDotRadPerSec * 86400 * 180) / Math.PI;
    expect(degreesPerDay).toBeGreaterThan(0.9);
    expect(degreesPerDay).toBeLessThan(1.05);
  });

  it('keeps the radius inside the expected range over one orbit', () => {
    const propagator = createKeplerJ2Propagator(elements);
    let min = Infinity;
    let max = 0;
    for (let i = 0; i < 64; i += 1) {
      const t = new Date(epoch.getTime() + (i / 64) * propagator.periodSeconds()! * 1000);
      const position = propagator.positionEciKm(t)!;
      const radius = Math.hypot(position.x, position.y, position.z);
      min = Math.min(min, radius);
      max = Math.max(max, radius);
    }
    expect(min).toBeGreaterThan(7078 * 0.998);
    expect(max).toBeLessThan(7078 * 1.002);
  });

  it('solves the kepler equation for eccentric orbits', () => {
    const eccentricAnomaly = solveKepler(1.2, 0.7);
    expect(eccentricAnomaly - 0.7 * Math.sin(eccentricAnomaly)).toBeCloseTo(1.2, 9);
  });
});
