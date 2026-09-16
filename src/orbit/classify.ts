import type { OrbitClassKey } from './types';
import { EARTH_RADIUS_KM } from '../core/frames';

export interface OrbitShape {
  eccentricity: number;
  inclinationDeg: number;
  periodSeconds: number | null;
  /** 近地点高度（距地面），km */
  perigeeAltitudeKm: number;
  /** 远地点高度（距地面），km */
  apogeeAltitudeKm: number;
}

export const GEO_PERIOD_MIN_MINUTES = 1400;
export const GEO_PERIOD_MAX_MINUTES = 1480;
export const MEO_PERIOD_MIN_MINUTES = 600;
export const LOW_ORBIT_CEILING_KM = 2000;

/**
 * 轨道分类：按规格 §4 的优先级自上而下判定
 * 大椭圆 → 静止/倾斜同步 → 中轨 → 低轨细分
 */
export function classifyOrbit(shape: OrbitShape): OrbitClassKey {
  const { eccentricity, inclinationDeg, perigeeAltitudeKm } = shape;
  const periodMinutes = shape.periodSeconds === null ? null : shape.periodSeconds / 60;

  if (eccentricity > 0.25 && perigeeAltitudeKm < LOW_ORBIT_CEILING_KM) return 'heo';

  if (periodMinutes !== null && periodMinutes >= GEO_PERIOD_MIN_MINUTES && periodMinutes <= GEO_PERIOD_MAX_MINUTES) {
    return inclinationDeg < 5 ? 'geo' : 'igso';
  }

  if (periodMinutes !== null && periodMinutes >= MEO_PERIOD_MIN_MINUTES && periodMinutes < GEO_PERIOD_MIN_MINUTES) {
    return 'meo';
  }

  if (inclinationDeg < 10) return 'equatorial';
  if (inclinationDeg >= 80 && inclinationDeg <= 95) return 'polar';
  if (inclinationDeg > 95 && inclinationDeg <= 106) return 'sso';
  if (inclinationDeg > 106) return 'retrograde';
  return 'leo';
}

export function orbitShapeFrom(elements: {
  semiMajorAxisKm: number;
  eccentricity: number;
  inclinationDeg: number;
}): { perigeeAltitudeKm: number; apogeeAltitudeKm: number } {
  const perigeeRadiusKm = elements.semiMajorAxisKm * (1 - elements.eccentricity);
  const apogeeRadiusKm = elements.semiMajorAxisKm * (1 + elements.eccentricity);
  return {
    perigeeAltitudeKm: perigeeRadiusKm - EARTH_RADIUS_KM,
    apogeeAltitudeKm: apogeeRadiusKm - EARTH_RADIUS_KM,
  };
}
