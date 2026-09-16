import type { Vec3 } from '../core/frames';

export type OrbitClassKey =
  | 'equatorial'
  | 'polar'
  | 'sso'
  | 'leo'
  | 'meo'
  | 'igso'
  | 'geo'
  | 'heo'
  | 'retrograde';

export interface KeplerianElements {
  epoch: Date;
  /** 半长轴，km */
  semiMajorAxisKm: number;
  eccentricity: number;
  inclinationDeg: number;
  raanDeg: number;
  argPerigeeDeg: number;
  meanAnomalyDeg: number;
  /** 平均运动，圈/天 */
  meanMotionRevPerDay: number;
}

export interface Propagator {
  /** 惯性系（TEME，按 ECI 使用）位置，km；失败时返回 null */
  positionEciKm(t: Date): Vec3 | null;
  /** 惯性系速度，km/s；失败时返回 null */
  velocityEciKmS(t: Date): Vec3 | null;
  /** 轨道周期，秒 */
  periodSeconds(): number | null;
  /** 轨道根数（用于分类、UI 展示、采样轨道线） */
  elements(): KeplerianElements | null;
}

export interface SatelliteMeta {
  noradId: number;
  /** TLE 中的名称 */
  name: string;
  /** 展示用名称（英文优先） */
  label?: string;
  /** 展示用中文名称 */
  labelZh?: string;
  group: string;
  fovDeg: number;
  tle1: string;
  tle2: string;
  descZh: string;
  descEn: string;
  preset?: boolean;
}

export interface SatelliteDerived {
  orbitClass: OrbitClassKey;
  /** 近地点高度（距地面），km */
  perigeeAltitudeKm: number;
  /** 远地点高度（距地面），km */
  apogeeAltitudeKm: number;
  periodSeconds: number | null;
  inclinationDeg: number;
  eccentricity: number;
  semiMajorAxisKm: number;
}

export interface SatelliteRecord extends SatelliteMeta {
  id: string;
  propagator: Propagator;
  derived: SatelliteDerived;
  colorHex: string;
  /** 自定义卫星标记 */
  custom?: boolean;
}
