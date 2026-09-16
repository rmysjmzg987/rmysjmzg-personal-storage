import { classifyOrbit, orbitShapeFrom } from './classify';
import { createSgp4Propagator, tleEpoch } from './sgp4';
import type { KeplerianElements, OrbitClassKey, SatelliteMeta, SatelliteRecord } from './types';

export interface OrbitTypeInfo {
  key: OrbitClassKey;
  zh: string;
  en: string;
  color: string;
  descZh: string;
  descEn: string;
}

export interface CityInfo {
  zh: string;
  en: string;
  lat: number;
  lon: number;
  rank: number;
}

export interface CatalogGroup {
  key: string;
  zh: string;
  en: string;
}

export interface CatalogFile {
  snapshotDate: string;
  source: string;
  generatedAt?: string;
  groups: CatalogGroup[];
  satellites: SatelliteMeta[];
}

export interface DataBundle {
  snapshotDate: string;
  source: string;
  groups: CatalogGroup[];
  records: SatelliteRecord[];
  orbitTypes: OrbitTypeInfo[];
  orbitTypeByKey: Map<OrbitClassKey, OrbitTypeInfo>;
  cities: CityInfo[];
}

export const FALLBACK_ORBIT_COLORS: Record<OrbitClassKey, string> = {
  equatorial: '#f9c74f',
  polar: '#4cc9f0',
  sso: '#8ce99a',
  leo: '#7fb3ff',
  meo: '#b388ff',
  igso: '#ffa552',
  geo: '#ff6ea9',
  heo: '#ef476f',
  retrograde: '#00e5c0',
};

export function buildRecord(
  meta: SatelliteMeta,
  orbitTypeByKey: Map<OrbitClassKey, OrbitTypeInfo>,
  options: { custom?: boolean; idPrefix?: string } = {},
): SatelliteRecord {
  const propagator = createSgp4Propagator(meta.tle1, meta.tle2);
  const elements = propagator.elements();
  const periodSeconds = propagator.periodSeconds();
  const shape = orbitShapeFrom(
    elements ?? { semiMajorAxisKm: 7000, eccentricity: 0, inclinationDeg: 0 },
  );
  const orbitClass = classifyOrbit({
    eccentricity: elements?.eccentricity ?? 0,
    inclinationDeg: elements?.inclinationDeg ?? 0,
    periodSeconds,
    perigeeAltitudeKm: shape.perigeeAltitudeKm,
    apogeeAltitudeKm: shape.apogeeAltitudeKm,
  });
  return {
    ...meta,
    id: `${options.idPrefix ?? 'cat'}:${meta.noradId}`,
    propagator,
    derived: {
      orbitClass,
      perigeeAltitudeKm: shape.perigeeAltitudeKm,
      apogeeAltitudeKm: shape.apogeeAltitudeKm,
      periodSeconds,
      inclinationDeg: elements?.inclinationDeg ?? 0,
      eccentricity: elements?.eccentricity ?? 0,
      semiMajorAxisKm: elements?.semiMajorAxisKm ?? 0,
    },
    colorHex: orbitTypeByKey.get(orbitClass)?.color ?? FALLBACK_ORBIT_COLORS[orbitClass],
    custom: options.custom,
  };
}

export function displayName(record: SatelliteMeta, lang: 'zh' | 'en'): string {
  if (lang === 'zh') return record.labelZh ?? record.label ?? record.name;
  return record.label ?? record.name;
}

export function altitudeKm(record: SatelliteRecord): number {
  return (record.derived.perigeeAltitudeKm + record.derived.apogeeAltitudeKm) / 2;
}

export function epochDate(record: SatelliteRecord): Date | null {
  const elements: KeplerianElements | null = record.propagator.elements();
  return elements ? elements.epoch : tleEpoch(record.tle1);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function loadData(baseUrl: string): Promise<DataBundle> {
  const [catalog, orbitTypesFile, citiesFile] = await Promise.all([
    fetchJson<CatalogFile>(`${baseUrl}data/catalog.json`),
    fetchJson<{ types: OrbitTypeInfo[] }>(`${baseUrl}data/orbit-types.json`),
    fetchJson<{ cities: CityInfo[] }>(`${baseUrl}data/cities.json`).catch(() => ({ cities: [] })),
  ]);

  const orbitTypes = orbitTypesFile.types;
  const orbitTypeByKey = new Map(orbitTypes.map((type) => [type.key, type]));
  const records = catalog.satellites.map((meta) => buildRecord(meta, orbitTypeByKey));

  return {
    snapshotDate: catalog.snapshotDate,
    source: catalog.source,
    groups: catalog.groups ?? [],
    records,
    orbitTypes,
    orbitTypeByKey,
    cities: citiesFile.cities ?? [],
  };
}
