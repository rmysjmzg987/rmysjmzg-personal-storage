import { describe, it, expect } from 'vitest';
import { sunDirectionEci, sunDeclinationDeg } from '../src/core/sun';

describe('sun', () => {
  it('returns a unit vector', () => {
    const v = sunDirectionEci(new Date('2026-09-16T00:00:00.000Z'));
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 9);
  });

  it('is near zero declination at the March equinox', () => {
    expect(Math.abs(sunDeclinationDeg(new Date('2026-03-20T14:46:00.000Z')))).toBeLessThan(0.3);
  });

  it('reaches about +23.4 deg at the June solstice', () => {
    const dec = sunDeclinationDeg(new Date('2026-06-21T08:25:00.000Z'));
    expect(dec).toBeGreaterThan(23.2);
    expect(dec).toBeLessThan(23.6);
  });

  it('is about -23.4 deg at the December solstice', () => {
    const dec = sunDeclinationDeg(new Date('2026-12-21T20:50:00.000Z'));
    expect(dec).toBeLessThan(-23.2);
    expect(dec).toBeGreaterThan(-23.6);
  });
});
