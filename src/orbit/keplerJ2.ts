import type { Vec3 } from '../core/frames';
import { WGS84_A_KM } from '../core/frames';
import type { KeplerianElements, Propagator } from './types';

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const MU_KM3_S2 = 398600.4418;
const J2 = 1.08262668e-3;
const EARTH_EQ_RADIUS_KM = WGS84_A_KM;

export interface SecularRates {
  raanDotRadPerSec: number;
  argPerigeeDotRadPerSec: number;
  meanAnomalyDotRadPerSec: number;
}

export function j2SecularRates(elements: KeplerianElements): SecularRates {
  const semiMajorAxis = elements.semiMajorAxisKm;
  const e = elements.eccentricity;
  const i = elements.inclinationDeg * DEG;
  const n0 = Math.sqrt(MU_KM3_S2 / (semiMajorAxis * semiMajorAxis * semiMajorAxis));
  const p = semiMajorAxis * (1 - e * e);
  const factor = 1.5 * J2 * ((EARTH_EQ_RADIUS_KM / p) ** 2) * n0;
  const sinI = Math.sin(i);
  return {
    raanDotRadPerSec: -factor * Math.cos(i),
    argPerigeeDotRadPerSec: factor * (2 - 2.5 * sinI * sinI),
    meanAnomalyDotRadPerSec: n0 + factor * Math.sqrt(1 - e * e) * (1 - 1.5 * sinI * sinI),
  };
}

export function solveKepler(meanAnomalyRad: number, e: number): number {
  const m = ((meanAnomalyRad % TWO_PI) + TWO_PI) % TWO_PI;
  let eccentricAnomaly = e < 0.8 ? m : Math.PI;
  for (let i = 0; i < 12; i += 1) {
    const f = eccentricAnomaly - e * Math.sin(eccentricAnomaly) - m;
    const fp = 1 - e * Math.cos(eccentricAnomaly);
    const step = f / fp;
    eccentricAnomaly -= step;
    if (Math.abs(step) < 1e-12) break;
  }
  return eccentricAnomaly;
}

function rotateToEci(x: number, y: number, raan: number, inclination: number, argPerigee: number): Vec3 {
  const cosO = Math.cos(raan);
  const sinO = Math.sin(raan);
  const cosI = Math.cos(inclination);
  const sinI = Math.sin(inclination);
  const cosW = Math.cos(argPerigee);
  const sinW = Math.sin(argPerigee);
  // R3(-Ω) · R1(-i) · R3(-ω)
  const x1 = x * cosW - y * sinW;
  const y1 = x * sinW + y * cosW;
  const y2 = y1 * cosI;
  const z2 = y1 * sinI;
  return {
    x: x1 * cosO - y2 * sinO,
    y: x1 * sinO + y2 * cosO,
    z: z2,
  };
}

/** 由轨道根数出发的解析传播器（J2 长期项），供用户自定义卫星与离线校验使用 */
export function createKeplerJ2Propagator(elements: KeplerianElements): Propagator {
  const a = elements.semiMajorAxisKm;
  const e = elements.eccentricity;
  const i = elements.inclinationDeg * DEG;
  const raan0 = elements.raanDeg * DEG;
  const argp0 = elements.argPerigeeDeg * DEG;
  const m0 = elements.meanAnomalyDeg * DEG;
  const n0 = Math.sqrt(MU_KM3_S2 / (a * a * a));
  const rates = j2SecularRates(elements);

  const stateAt = (t: Date): { position: Vec3; velocity: Vec3 } | null => {
    if (!Number.isFinite(a) || a <= 0 || e < 0 || e >= 1) return null;
    const dt = (t.getTime() - elements.epoch.getTime()) / 1000;
    const raan = raan0 + rates.raanDotRadPerSec * dt;
    const argp = argp0 + rates.argPerigeeDotRadPerSec * dt;
    const meanAnomaly = m0 + rates.meanAnomalyDotRadPerSec * dt;
    const eccentricAnomaly = solveKepler(meanAnomaly, e);
    const cosE = Math.cos(eccentricAnomaly);
    const sinE = Math.sin(eccentricAnomaly);
    const px = a * (cosE - e);
    const py = a * Math.sqrt(1 - e * e) * sinE;
    const edot = n0 / (1 - e * cosE);
    const vx = -a * sinE * edot;
    const vy = a * Math.sqrt(1 - e * e) * cosE * edot;
    return {
      position: rotateToEci(px, py, raan, i, argp),
      velocity: rotateToEci(vx, vy, raan, i, argp),
    };
  };

  return {
    positionEciKm(t) {
      const state = stateAt(t);
      return state ? state.position : null;
    },
    velocityEciKmS(t) {
      const state = stateAt(t);
      return state ? state.velocity : null;
    },
    periodSeconds: () => TWO_PI / n0,
    elements: () => ({ ...elements }),
  };
}
