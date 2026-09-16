import { WGS84_A_KM } from '../core/frames';
import type { KeplerianElements } from './types';

const MU_KM3_S2 = 398600.4418;
const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;

export interface ElementFormValues {
  name: string;
  /** 轨道高度（近地点），km；与 semiMajorAxisKm 二选一 */
  altitudeKm: number;
  eccentricity: number;
  inclinationDeg: number;
  raanDeg: number;
  argPerigeeDeg: number;
  meanAnomalyDeg: number;
  fovDeg: number;
  epoch: Date;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function semiMajorAxisFromAltitude(altitudeKm: number, eccentricity: number): number {
  // altitudeKm 为近地点高度：r_p = WGS84_A + altitude → a = r_p / (1 - e)
  return (WGS84_A_KM + altitudeKm) / (1 - eccentricity);
}

export function altitudeFromElements(elements: KeplerianElements): {
  perigeeAltitudeKm: number;
  apogeeAltitudeKm: number;
} {
  return {
    perigeeAltitudeKm: elements.semiMajorAxisKm * (1 - elements.eccentricity) - WGS84_A_KM,
    apogeeAltitudeKm: elements.semiMajorAxisKm * (1 + elements.eccentricity) - WGS84_A_KM,
  };
}

export function meanMotionRevPerDay(semiMajorAxisKm: number): number {
  const n = Math.sqrt(MU_KM3_S2 / semiMajorAxisKm ** 3);
  return (n * 86400) / TWO_PI;
}

export function elementsFromForm(values: ElementFormValues): KeplerianElements {
  const semiMajorAxisKm = semiMajorAxisFromAltitude(values.altitudeKm, values.eccentricity);
  return {
    epoch: values.epoch,
    semiMajorAxisKm,
    eccentricity: values.eccentricity,
    inclinationDeg: values.inclinationDeg,
    raanDeg: normalize360(values.raanDeg),
    argPerigeeDeg: normalize360(values.argPerigeeDeg),
    meanAnomalyDeg: normalize360(values.meanAnomalyDeg),
    meanMotionRevPerDay: meanMotionRevPerDay(semiMajorAxisKm),
  };
}

function normalize360(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function validateElements(values: ElementFormValues): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const perigeeAltitude = values.altitudeKm;
  const apogeeAltitude =
    ((WGS84_A_KM + values.altitudeKm) / (1 - values.eccentricity)) * (1 + values.eccentricity) - WGS84_A_KM;

  if (!Number.isFinite(values.altitudeKm) || perigeeAltitude < 100) {
    errors.push('perigee-too-low');
  }
  if (perigeeAltitude > 200000) errors.push('perigee-too-high');
  if (!(values.eccentricity >= 0 && values.eccentricity < 0.95)) {
    errors.push('eccentricity-out-of-range');
  }
  if (!(values.inclinationDeg >= 0 && values.inclinationDeg <= 180) || !Number.isFinite(values.inclinationDeg)) {
    errors.push('inclination-out-of-range');
  }
  for (const [key, value] of [
    ['raan', values.raanDeg],
    ['arg-perigee', values.argPerigeeDeg],
    ['mean-anomaly', values.meanAnomalyDeg],
  ] as const) {
    if (!Number.isFinite(value)) errors.push(`${key}-not-finite`);
  }
  if (!(values.fovDeg > 0.05 && values.fovDeg < 175)) errors.push('fov-out-of-range');
  if (values.altitudeKm < 160) warnings.push('very-low-orbit');
  if (values.eccentricity > 0.25 && values.inclinationDeg < 60) warnings.push('heo-low-inclination');
  if (apogeeAltitude > 80000) warnings.push('very-high-apogee');
  return { ok: errors.length === 0, errors, warnings };
}

// ---------------- TLE 生成 ----------------

function checksum(line: string): number {
  let sum = 0;
  for (const char of line.slice(0, 68)) {
    if (char >= '0' && char <= '9') sum += char.charCodeAt(0) - 48;
    else if (char === '-') sum += 1;
  }
  return sum % 10;
}

function pad(value: string, length: number, right = false): string {
  const trimmed = value.length > length ? value.slice(0, length) : value;
  return right ? trimmed.padStart(length, ' ') : trimmed.padEnd(length, ' ');
}

function epochFields(epoch: Date): { yy: string; day: string } {
  const year = epoch.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const dayOfYear = (epoch.getTime() - start) / 86400000 + 1;
  return {
    yy: String(year % 100).padStart(2, '0'),
    day: dayOfYear.toFixed(8).padStart(12, '0'),
  };
}

/** 由开普勒根数生成两行 TLE（用于跑通 SGP4 传播，格式遵循 NORAD 规范） */
export function elementsToTle(
  elements: KeplerianElements,
  satelliteNumber: number,
  intlDesignator = '26001A',
): { line1: string; line2: string } {
  const satnum = String(Math.max(1, Math.min(99999, Math.round(satelliteNumber)))).padStart(5, '0');
  const { yy, day } = epochFields(elements.epoch);
  const inclination = elements.inclinationDeg.toFixed(4).padStart(8, ' ');
  const raan = elements.raanDeg.toFixed(4).padStart(8, ' ');
  const eccentricity = Math.round(Math.max(0, Math.min(0.9999999, elements.eccentricity)) * 1e7)
    .toString()
    .padStart(7, '0');
  const argPerigee = elements.argPerigeeDeg.toFixed(4).padStart(8, ' ');
  const meanAnomaly = elements.meanAnomalyDeg.toFixed(4).padStart(8, ' ');
  const meanMotion = elements.meanMotionRevPerDay.toFixed(8).padStart(11, ' ');

  const line1Base =
    `1 ${satnum}U ${pad(intlDesignator.toUpperCase(), 8)} ${yy}${day} ` +
    ' .00000000  00000-0  00000-0 0  000';
  const line2Base = `2 ${satnum} ${inclination} ${raan} ${eccentricity} ${argPerigee} ${meanAnomaly} ${meanMotion}00001`;
  const line1 = `${line1Base}${checksum(line1Base)}`;
  const line2 = `${line2Base}${checksum(line2Base)}`;
  return { line1, line2 };
}

export interface ParsedTle {
  name: string | null;
  noradId: number;
  line1: string;
  line2: string;
}

/** 解析 2 行 / 3 行 TLE 文本（可含卫星名） */
export function parseTle(text: string): ParsedTle | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  const index1 = lines.findIndex((line) => line.startsWith('1 ') && line.length >= 69);
  if (index1 < 0) return null;
  const line1 = lines[index1];
  const line2 = lines[index1 + 1];
  if (!line2 || !line2.startsWith('2 ') || line2.length < 69) return null;
  const nameLine = index1 > 0 ? lines[index1 - 1].replace(/^0 /, '').trim() : null;
  const noradId = parseInt(line1.slice(2, 7), 10);
  if (!Number.isFinite(noradId)) return null;
  return { name: nameLine && nameLine.length > 0 ? nameLine : null, noradId, line1, line2 };
}

export interface PresetTemplate {
  key: string;
  zh: string;
  en: string;
  values: Omit<ElementFormValues, 'name' | 'epoch'>;
}

export const TEMPLATES: PresetTemplate[] = [
  {
    key: 'equatorial',
    zh: '赤道低轨',
    en: 'Equatorial LEO',
    values: { altitudeKm: 550, eccentricity: 0.0005, inclinationDeg: 0.2, raanDeg: 0, argPerigeeDeg: 0, meanAnomalyDeg: 0, fovDeg: 25 },
  },
  {
    key: 'polar',
    zh: '极轨',
    en: 'Polar',
    values: { altitudeKm: 700, eccentricity: 0.001, inclinationDeg: 90, raanDeg: 45, argPerigeeDeg: 0, meanAnomalyDeg: 0, fovDeg: 20 },
  },
  {
    key: 'sso',
    zh: '太阳同步',
    en: 'Sun-synchronous',
    values: { altitudeKm: 705, eccentricity: 0.001, inclinationDeg: 98.2, raanDeg: 120, argPerigeeDeg: 90, meanAnomalyDeg: 0, fovDeg: 15 },
  },
  {
    key: 'geo',
    zh: '地球静止',
    en: 'Geostationary',
    values: { altitudeKm: 35786, eccentricity: 0.0002, inclinationDeg: 0.05, raanDeg: 0, argPerigeeDeg: 0, meanAnomalyDeg: 0, fovDeg: 17.4 },
  },
  {
    key: 'molniya',
    zh: '大椭圆（Molniya）',
    en: 'Molniya',
    values: { altitudeKm: 526, eccentricity: 0.74, inclinationDeg: 63.4, raanDeg: 60, argPerigeeDeg: 270, meanAnomalyDeg: 0, fovDeg: 30 },
  },
  {
    key: 'retrograde',
    zh: '逆行',
    en: 'Retrograde',
    values: { altitudeKm: 550, eccentricity: 0.001, inclinationDeg: 142, raanDeg: 30, argPerigeeDeg: 0, meanAnomalyDeg: 0, fovDeg: 12 },
  },
];

export const DEG_TO_RAD = DEG;
