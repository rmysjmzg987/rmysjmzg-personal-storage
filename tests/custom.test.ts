import { describe, it, expect } from 'vitest';
import {
  CUSTOM_STORAGE_KEY,
  emptyStore,
  nextCustomNoradId,
  parseStore,
  readStore,
  serializeStore,
  writeStore,
  type CustomStoreData,
} from '../src/orbit/custom';
import type { SatelliteMeta } from '../src/orbit/types';

const TLE1 = '1 25544U 98067A   26259.50000000  .00016717  00000-0  30180-3 0  9993';
const TLE2 = '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.49815340 11111';

function meta(overrides: Partial<SatelliteMeta> = {}): SatelliteMeta {
  return {
    noradId: 90001,
    name: 'MY-SAT',
    group: 'custom',
    fovDeg: 25,
    tle1: TLE1,
    tle2: TLE2,
    descZh: '测试卫星',
    descEn: 'test satellite',
    ...overrides,
  };
}

describe('parseStore', () => {
  it('returns an empty store for empty or broken input', () => {
    expect(parseStore(null)).toEqual(emptyStore());
    expect(parseStore('')).toEqual(emptyStore());
    expect(parseStore('{ not json')).toEqual(emptyStore());
    expect(parseStore('42')).toEqual(emptyStore());
  });

  it('drops invalid entries but keeps the valid ones', () => {
    const raw = JSON.stringify({
      version: 1,
      enabledLibraryIds: [25544, '43613', -4, 'nope', 25544, 49260.7],
      customSatellites: [
        meta(),
        { ...meta({ noradId: 90002 }), tle1: 'garbage' },
        { ...meta({ noradId: 90003 }), name: '' },
        null,
        meta({ noradId: 90001 }),
      ],
    });
    const store = parseStore(raw);
    expect(store.enabledLibraryIds).toEqual([25544, 43613, 49261]);
    expect(store.customSatellites.map((sat) => sat.noradId)).toEqual([90001]);
  });

  it('falls back to a usable fov when out of range', () => {
    const raw = JSON.stringify({ customSatellites: [meta({ fovDeg: 900 })] });
    expect(parseStore(raw).customSatellites[0].fovDeg).toBe(20);
  });

  it('round-trips through serialize', () => {
    const source: CustomStoreData = {
      version: 1,
      enabledLibraryIds: [25544],
      hiddenPresetIds: [49954],
      customSatellites: [meta()],
    };
    const first = parseStore(serializeStore(source));
    expect(first.customSatellites[0].noradId).toBe(90001);
    expect(first.customSatellites[0].label).toBe('MY-SAT');
    expect(first.enabledLibraryIds).toEqual([25544]);
    expect(first.hiddenPresetIds).toEqual([49954]);
    // 归一化后的形态必须稳定：再存再读不再变化
    expect(parseStore(serializeStore(first))).toEqual(first);
  });
});

describe('nextCustomNoradId', () => {
  it('starts at 90000 and skips used numbers', () => {
    expect(nextCustomNoradId([])).toBe(90000);
    expect(nextCustomNoradId([90000, 90001, 90003])).toBe(90002);
    expect(nextCustomNoradId([49260, 67433])).toBe(90000);
  });
});

describe('readStore / writeStore', () => {
  it('persists and restores through a storage-like object', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
    };
    const source: CustomStoreData = {
      version: 1,
      enabledLibraryIds: [43613],
      hiddenPresetIds: [],
      customSatellites: [meta()],
    };
    writeStore(source, storage);
    expect(memory.has(CUSTOM_STORAGE_KEY)).toBe(true);
    const restored = readStore(storage);
    expect(restored.customSatellites[0]).toMatchObject(meta());
    expect(parseStore(serializeStore(restored))).toEqual(restored);
  });

  it('survives storage errors', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readStore(broken)).toEqual(emptyStore());
    expect(() => writeStore(emptyStore(), broken)).not.toThrow();
    expect(readStore(null)).toEqual(emptyStore());
    expect(() => writeStore(emptyStore(), null)).not.toThrow();
  });
});
