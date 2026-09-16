import { describe, it, expect } from 'vitest';
import {
  altitudeFromElements,
  elementsFromForm,
  elementsToTle,
  meanMotionRevPerDay,
  parseTle,
  semiMajorAxisFromAltitude,
  validateElements,
  TEMPLATES,
  type ElementFormValues,
} from '../src/orbit/elements';
import { createSgp4Propagator } from '../src/orbit/sgp4';
import { buildRecord } from '../src/orbit/catalog';
import { WGS84_A_KM } from '../src/core/frames';
import type { OrbitClassKey, SatelliteMeta } from '../src/orbit/types';

const EPOCH = new Date('2026-09-16T00:00:00Z');

function baseValues(overrides: Partial<ElementFormValues> = {}): ElementFormValues {
  return {
    name: 'TEST',
    altitudeKm: 550,
    eccentricity: 0.001,
    inclinationDeg: 98,
    raanDeg: 120,
    argPerigeeDeg: 90,
    meanAnomalyDeg: 0,
    fovDeg: 20,
    epoch: EPOCH,
    ...overrides,
  };
}

function tleChecksum(line: string): number {
  let sum = 0;
  for (const char of line.slice(0, 68)) {
    if (char >= '0' && char <= '9') sum += char.charCodeAt(0) - 48;
    else if (char === '-') sum += 1;
  }
  return sum % 10;
}

describe('semiMajorAxisFromAltitude', () => {
  it('maps perigee altitude to semi-major axis for near-circular orbits', () => {
    expect(semiMajorAxisFromAltitude(550, 0)).toBeCloseTo(WGS84_A_KM + 550, 6);
  });

  it('handles high eccentricity (Molniya-like)', () => {
    const axis = semiMajorAxisFromAltitude(526, 0.74);
    expect(axis).toBeCloseTo(26554.4, 0);
    const { perigeeAltitudeKm, apogeeAltitudeKm } = altitudeFromElements({
      epoch: EPOCH,
      semiMajorAxisKm: axis,
      eccentricity: 0.74,
      inclinationDeg: 63.4,
      raanDeg: 0,
      argPerigeeDeg: 0,
      meanAnomalyDeg: 0,
      meanMotionRevPerDay: 6,
    });
    expect(perigeeAltitudeKm).toBeCloseTo(526, 6);
    expect(apogeeAltitudeKm).toBeGreaterThan(39000);
    expect(apogeeAltitudeKm).toBeLessThan(41000);
  });
});

describe('meanMotionRevPerDay', () => {
  it('matches the geostationary period', () => {
    const motion = meanMotionRevPerDay(42164.17);
    expect(motion).toBeCloseTo(1.0027, 3);
    const periodMinutes = 1440 / motion;
    expect(periodMinutes).toBeGreaterThan(1400);
    expect(periodMinutes).toBeLessThan(1480);
  });

  it('matches a ~90 minute LEO', () => {
    const periodMinutes = 1440 / meanMotionRevPerDay(6798);
    expect(periodMinutes).toBeGreaterThan(88);
    expect(periodMinutes).toBeLessThan(94);
  });
});

describe('elementsFromForm', () => {
  it('normalizes angles into [0, 360)', () => {
    const elements = elementsFromForm(baseValues({ raanDeg: -30, argPerigeeDeg: 450, meanAnomalyDeg: 720 }));
    expect(elements.raanDeg).toBeCloseTo(330, 9);
    expect(elements.argPerigeeDeg).toBeCloseTo(90, 9);
    expect(elements.meanAnomalyDeg).toBeCloseTo(0, 9);
  });
});

describe('validateElements', () => {
  it('accepts a sane low orbit', () => {
    const result = validateElements(baseValues());
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects orbits that would graze or enter the atmosphere', () => {
    const result = validateElements(baseValues({ altitudeKm: 50 }));
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('perigee-too-low');
  });

  it('rejects eccentricity and inclination out of range', () => {
    expect(validateElements(baseValues({ eccentricity: 0.96 })).errors).toContain('eccentricity-out-of-range');
    expect(validateElements(baseValues({ eccentricity: -0.1 })).errors).toContain('eccentricity-out-of-range');
    expect(validateElements(baseValues({ inclinationDeg: 200 })).errors).toContain('inclination-out-of-range');
    expect(validateElements(baseValues({ fovDeg: 180 })).errors).toContain('fov-out-of-range');
  });

  it('emits warnings without failing', () => {
    const result = validateElements(baseValues({ altitudeKm: 120, eccentricity: 0.3, inclinationDeg: 20 }));
    expect(result.ok).toBe(true);
    expect(result.warnings).toContain('very-low-orbit');
    expect(result.warnings).toContain('heo-low-inclination');
  });
});

describe('elementsToTle', () => {
  it('emits well-formed two-line elements with valid checksums', () => {
    const tle = elementsToTle(elementsFromForm(baseValues()), 90007);
    expect(tle.line1).toHaveLength(69);
    expect(tle.line2).toHaveLength(69);
    expect(tle.line1.slice(2, 7)).toBe('90007');
    expect(Number(tle.line1[68])).toBe(tleChecksum(tle.line1));
    expect(Number(tle.line2[68])).toBe(tleChecksum(tle.line2));
  });

  it('round-trips through SGP4 for a low-eccentricity orbit', () => {
    const source = elementsFromForm(baseValues({ altitudeKm: 705, inclinationDeg: 98.2, eccentricity: 0.0012 }));
    const tle = elementsToTle(source, 90001);
    const parsed = createSgp4Propagator(tle.line1, tle.line2).elements();
    expect(parsed).not.toBeNull();
    expect(parsed!.eccentricity).toBeCloseTo(source.eccentricity, 6);
    expect(parsed!.inclinationDeg).toBeCloseTo(source.inclinationDeg, 3);
    // SGP4 会把 TLE 的平均运动换算成去 Kozai 项的值，允许 0.2% 量级的差异
    const relativeError = Math.abs(parsed!.meanMotionRevPerDay - source.meanMotionRevPerDay) / source.meanMotionRevPerDay;
    expect(relativeError).toBeLessThan(0.002);
    expect(parsed!.semiMajorAxisKm).toBeCloseTo(source.semiMajorAxisKm, -1);
  });

  it('round-trips a Molniya orbit and still classifies as HEO', () => {
    const template = TEMPLATES.find((entry) => entry.key === 'molniya')!;
    const source = elementsFromForm(baseValues(template.values));
    const tle = elementsToTle(source, 90002);
    const meta: SatelliteMeta = {
      noradId: 90002,
      name: 'MOLNIYA-TEST',
      group: 'custom',
      fovDeg: template.values.fovDeg,
      tle1: tle.line1,
      tle2: tle.line2,
      descZh: '',
      descEn: '',
    };
    const record = buildRecord(meta, new Map());
    expect(record.derived.orbitClass).toBe('heo');
    expect(record.derived.perigeeAltitudeKm).toBeGreaterThan(300);
    expect(record.derived.perigeeAltitudeKm).toBeLessThan(900);
    expect(record.derived.apogeeAltitudeKm).toBeGreaterThan(34000);
  });

  it('propagates to a finite position at epoch', () => {
    const tle = elementsToTle(elementsFromForm(baseValues()), 90003);
    const propagator = createSgp4Propagator(tle.line1, tle.line2);
    const position = propagator.positionEciKm(EPOCH);
    expect(position).not.toBeNull();
    const radius = Math.hypot(position!.x, position!.y, position!.z);
    expect(radius).toBeGreaterThan(WGS84_A_KM);
    expect(radius).toBeLessThan(7600);
  });
});

describe('TEMPLATES', () => {
  const EXPECTED: Record<string, OrbitClassKey> = {
    equatorial: 'equatorial',
    polar: 'polar',
    sso: 'sso',
    geo: 'geo',
    molniya: 'heo',
    retrograde: 'retrograde',
  };

  for (const template of TEMPLATES) {
    it(`${template.key} produces a ${EXPECTED[template.key]} orbit`, () => {
      const values = baseValues({ ...template.values, name: template.key });
      expect(validateElements(values).ok).toBe(true);
      const tle = elementsToTle(elementsFromForm(values), 91000);
      const meta: SatelliteMeta = {
        noradId: 91000,
        name: template.key,
        group: 'custom',
        fovDeg: values.fovDeg,
        tle1: tle.line1,
        tle2: tle.line2,
        descZh: '',
        descEn: '',
      };
      expect(buildRecord(meta, new Map()).derived.orbitClass).toBe(EXPECTED[template.key]);
    });
  }
});

describe('parseTle', () => {
  const line1 = '1 25544U 98067A   26259.50000000  .00016717  00000-0  30180-3 0  9993';
  const line2 = '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.49815340 11111';

  it('parses three-line TLE with name', () => {
    const parsed = parseTle(`ISS (ZARYA)\n${line1}\n${line2}`);
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('ISS (ZARYA)');
    expect(parsed!.noradId).toBe(25544);
    expect(parsed!.line1).toBe(line1);
    expect(parsed!.line2).toBe(line2);
  });

  it('parses two-line TLE and strips the "0 " name prefix', () => {
    expect(parseTle(`${line1}\n${line2}`)!.name).toBeNull();
    expect(parseTle(`0 ISS (ZARYA)\n${line1}\n${line2}`)!.name).toBe('ISS (ZARYA)');
  });

  it('tolerates surrounding whitespace and CRLF', () => {
    const parsed = parseTle(`\r\n  \r\n${line1}  \r\n${line2}\r\n\r\n`);
    expect(parsed!.noradId).toBe(25544);
  });

  it('rejects malformed input', () => {
    expect(parseTle('')).toBeNull();
    expect(parseTle('not a tle')).toBeNull();
    expect(parseTle(`${line1}\nonly one line`)).toBeNull();
  });
});
