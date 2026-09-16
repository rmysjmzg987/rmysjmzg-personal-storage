export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const EARTH_RADIUS_KM = 6371;
export const WGS84_A_KM = 6378.137;
export const WGS84_F = 1 / 298.257223563;
const DEG = Math.PI / 180;

export function julianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

export function gmstRadians(jd: number): number {
  const t = (jd - 2451545.0) / 36525;
  const seconds =
    67310.54841 + (876600 * 3600 + 8640184.812866) * t + 0.093104 * t * t - 6.2e-6 * t * t * t;
  const wrapped = ((seconds % 86400) + 86400) % 86400;
  return (((wrapped / 240) % 360) + 360) % 360 * DEG;
}

export function rotateZ(v: Vec3, angleRad: number): Vec3 {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
}

export function eciToEcef(v: Vec3, gmstRad: number): Vec3 {
  const c = Math.cos(gmstRad);
  const s = Math.sin(gmstRad);
  return { x: v.x * c + v.y * s, y: -v.x * s + v.y * c, z: v.z };
}

export function ecefToGeodetic(v: Vec3): { latDeg: number; lonDeg: number; altKm: number } {
  const a = WGS84_A_KM;
  const f = WGS84_F;
  const e2 = f * (2 - f);
  const b = a * (1 - f);
  const ep2 = (a * a - b * b) / (b * b);
  const p = Math.hypot(v.x, v.y);
  const lon = Math.atan2(v.y, v.x);
  const theta = Math.atan2(v.z * a, p * b);
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  const lat = Math.atan2(v.z + ep2 * b * sinT * sinT * sinT, p - e2 * a * cosT * cosT * cosT);
  const sinLat = Math.sin(lat);
  const n = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const alt = Math.abs(Math.cos(lat)) > 1e-9 ? p / Math.cos(lat) - n : Math.abs(v.z) - b;
  return { latDeg: lat / DEG, lonDeg: lon / DEG, altKm: alt };
}

/** 大地坐标（近似球面）转 ECEF，用于城市点位 */
export function geodeticToEcef(latDeg: number, lonDeg: number, altKm = 0): Vec3 {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const r = EARTH_RADIUS_KM + altKm;
  const cosLat = Math.cos(lat);
  return {
    x: r * cosLat * Math.cos(lon),
    y: r * cosLat * Math.sin(lon),
    z: r * Math.sin(lat),
  };
}
