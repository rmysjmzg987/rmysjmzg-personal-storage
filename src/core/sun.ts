import { julianDate, type Vec3 } from './frames';

const DEG = Math.PI / 180;
const OBLIQUITY_RAD = 23.439 * DEG;

function eclipticLongitudeDeg(date: Date): number {
  const n = julianDate(date) - 2451545.0;
  const meanLongitude = 280.46 + 0.9856474 * n;
  const meanAnomaly = (357.528 + 0.9856003 * n) * DEG;
  return meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly);
}

export function sunDeclinationDeg(date: Date): number {
  const lambda = eclipticLongitudeDeg(date) * DEG;
  return Math.asin(Math.sin(OBLIQUITY_RAD) * Math.sin(lambda)) / DEG;
}

export function sunDirectionEci(date: Date): Vec3 {
  const lambda = eclipticLongitudeDeg(date) * DEG;
  return {
    x: Math.cos(lambda),
    y: Math.cos(OBLIQUITY_RAD) * Math.sin(lambda),
    z: Math.sin(OBLIQUITY_RAD) * Math.sin(lambda),
  };
}
