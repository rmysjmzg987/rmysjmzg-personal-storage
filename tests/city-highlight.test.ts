import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CITY_PASS_MIN_RAD,
  cityHighlightRadius,
  cityPassRadius,
  createSweepMemory,
  isCityWithin,
} from '../src/ui/cityLabels';
import { buildRecord, type CatalogFile, type CityInfo } from '../src/orbit/catalog';
import { footprintAngularRadius } from '../src/viz/footprint';
import {
  EARTH_RADIUS_KM,
  eciToEcef,
  geodeticToEcef,
  gmstRadians,
  julianDate,
  rotateZ,
} from '../src/core/frames';

const DEG = Math.PI / 180;

const normalise = (v: { x: number; y: number; z: number }) => {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};

describe('城市高亮半径', () => {
  it('拍摄范围判定圈比几何覆盖圈略宽', () => {
    expect(cityHighlightRadius(0.0145)).toBeCloseTo(0.0145 * 1.6, 9);
  });

  it('窄视场卫星的判定圈被抬到下限，否则几乎扫不到任何城市', () => {
    // 700 km 高、15° 视场：几何覆盖半径只有约 0.83°
    const coverage = 0.0145;
    expect(cityHighlightRadius(coverage)).toBeLessThan(CITY_PASS_MIN_RAD);
    expect(cityPassRadius(coverage)).toBeCloseTo(CITY_PASS_MIN_RAD, 9);
  });

  it('大视场卫星（静止轨道）用真实覆盖圈，不被下限改写', () => {
    const coverage = 78.7 * DEG;
    expect(cityPassRadius(coverage)).toBeCloseTo(cityHighlightRadius(coverage), 9);
    expect(cityPassRadius(coverage)).toBeGreaterThan(CITY_PASS_MIN_RAD);
  });

  it('掠过圈永远不小于拍摄范围圈', () => {
    for (const coverage of [0.001, 0.01, 0.05, 0.3, 0.9, 1.37]) {
      expect(cityPassRadius(coverage)).toBeGreaterThanOrEqual(cityHighlightRadius(coverage));
    }
  });
});

describe('掠过余辉', () => {
  it('记录后立即生效，超过余辉时间后自动过期', () => {
    const memory = createSweepMemory(1000);
    memory.record(['a', 'b'], 0);
    expect([...memory.active(0)].sort()).toEqual(['a', 'b']);
    expect([...memory.active(999)].sort()).toEqual(['a', 'b']);
    expect(memory.active(1000).size).toBe(0);
  });

  it('再次扫过会刷新余辉起点', () => {
    const memory = createSweepMemory(1000);
    memory.record(['a'], 0);
    memory.record(['a'], 800);
    expect(memory.active(1500).has('a')).toBe(true);
    expect(memory.active(1801).has('a')).toBe(false);
  });

  it('clear() 清空全部余辉', () => {
    const memory = createSweepMemory(1000);
    memory.record(['a'], 0);
    memory.clear();
    expect(memory.active(0).size).toBe(0);
  });
});

/** 用真实 TLE + 真实城市坐标跑一遍：低轨卫星一天里应当真的能扫到城市 */
describe('真实数据下的掠过次数', () => {
  it('Landsat 9（15° 视场）一天内至少扫到若干次城市', () => {
    const catalog = JSON.parse(readFileSync('public/data/catalog.json', 'utf8')) as CatalogFile;
    const cities = JSON.parse(readFileSync('public/data/cities.json', 'utf8')).cities as CityInfo[];
    const orbitTypes = new Map(
      JSON.parse(readFileSync('public/data/orbit-types.json', 'utf8')).types.map(
        (type: { key: string }) => [type.key, type],
      ),
    ) as never;
    const meta = catalog.satellites.find((item) => item.noradId === 49260);
    expect(meta).toBeTruthy();
    const record = buildRecord(meta!, orbitTypes);
    const cityUnits = cities.map((city) => normalise(geodeticToEcef(city.lat, city.lon, 0)));

    const start = Date.parse('2026-09-16T04:50:00Z');
    let shots = 0;
    let sweeps = 0;
    for (let t = start; t < start + 24 * 3600 * 1000; t += 30_000) {
      const date = new Date(t);
      const position = record.propagator.positionEciKm(date);
      if (!position) continue;
      const gmst = gmstRadians(julianDate(date));
      const radius = Math.hypot(position.x, position.y, position.z);
      const halfFov = Math.min(
        (meta!.fovDeg / 2) * DEG,
        Math.asin(Math.min(1, EARTH_RADIUS_KM / radius)) * 0.999,
      );
      const coverage = footprintAngularRadius(radius, halfFov);
      const nadir = rotateZ(normalise(eciToEcef(position, gmst)), gmst);
      const nadirUnit = { x: -nadir.x, y: -nadir.y, z: -nadir.z };
      const shot = cityHighlightRadius(coverage);
      const pass = cityPassRadius(coverage);
      for (const unit of cityUnits) {
        const eci = rotateZ(unit, gmst);
        if (isCityWithin(eci, nadirUnit, shot)) shots += 1;
        if (isCityWithin(eci, nadirUnit, pass)) sweeps += 1;
      }
    }
    // 修正前只有几十次（30 秒采样），观测上等同"永远看不到"
    expect(sweeps).toBeGreaterThan(shots);
    expect(sweeps).toBeGreaterThan(200);
  });
});
