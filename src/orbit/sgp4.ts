import { twoline2satrec, propagate } from './satellite-core';
import type { SatRec } from './satellite-core';
import type { Vec3 } from '../core/frames';
import type { KeplerianElements, Propagator } from './types';

const TWO_PI = Math.PI * 2;
/** SGP4 使用的 WGS-72 地球引力常数，与 satellite.js 内部保持一致 */
const MU_KM3_S2 = 398600.8;
const JD_UNIX_EPOCH = 2440587.5;

export function satrecFromTle(tle1: string, tle2: string): SatRec {
  return twoline2satrec(tle1.trim(), tle2.trim());
}

/** 由平均运动（rad/s）推算半长轴，SGP4 的 no 已去 Kozai 项，可直接用开普勒第三定律 */
export function semiMajorAxisFromMeanMotion(meanMotionRadPerSec: number): number {
  return Math.cbrt(MU_KM3_S2 / (meanMotionRadPerSec * meanMotionRadPerSec));
}

function vec(pv: Vec3 | undefined | null): Vec3 | null {
  if (!pv) return null;
  const { x, y, z } = pv;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
}

export function createSgp4Propagator(tle1: string, tle2: string): Propagator {
  const satrec = satrecFromTle(tle1, tle2);
  const meanMotionRadPerSec = satrec.no / 60;
  const periodSeconds = meanMotionRadPerSec > 0 ? TWO_PI / meanMotionRadPerSec : null;
  const semiMajorAxisKm = meanMotionRadPerSec > 0 ? semiMajorAxisFromMeanMotion(meanMotionRadPerSec) : Number.NaN;
  const epoch = new Date((satrec.jdsatepoch - JD_UNIX_EPOCH) * 86400000);

  const elements = (): KeplerianElements | null => {
    if (!Number.isFinite(semiMajorAxisKm)) return null;
    return {
      epoch,
      semiMajorAxisKm,
      eccentricity: satrec.ecco,
      inclinationDeg: (satrec.inclo * 180) / Math.PI,
      raanDeg: (((satrec.nodeo * 180) / Math.PI) % 360 + 360) % 360,
      argPerigeeDeg: (((satrec.argpo * 180) / Math.PI) % 360 + 360) % 360,
      meanAnomalyDeg: (((satrec.mo * 180) / Math.PI) % 360 + 360) % 360,
      meanMotionRevPerDay: satrec.no * (1440 / TWO_PI),
    };
  };

  return {
    positionEciKm(t) {
      const pv = propagate(satrec, t);
      return pv ? vec(pv.position) : null;
    },
    velocityEciKmS(t) {
      const pv = propagate(satrec, t);
      return pv ? vec(pv.velocity) : null;
    },
    periodSeconds: () => periodSeconds,
    elements,
  };
}

export function tleEpoch(line1: string): Date | null {
  const field = line1.slice(18, 32).trim();
  if (!/^\d{5}\.\d+$/.test(field)) return null;
  const year = parseInt(field.slice(0, 2), 10);
  const day = parseFloat(field.slice(2));
  const fullYear = year < 57 ? 2000 + year : 1900 + year;
  return new Date(Date.UTC(fullYear, 0, 1) + (day - 1) * 86400000);
}
