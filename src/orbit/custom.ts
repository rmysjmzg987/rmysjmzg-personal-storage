import type { SatelliteMeta } from './types';

export const CUSTOM_STORAGE_KEY = 'satviz.custom.v1';
/** 自定义卫星的 NORAD 编号起点，避开真实目录（当前最大 67433） */
export const CUSTOM_NORAD_BASE = 90000;
export const CUSTOM_GROUP = 'custom';

export interface CustomStoreData {
  version: 1;
  /** 用户从内置卫星库里启用的卫星（NORAD 编号） */
  enabledLibraryIds: number[];
  /** 被用户从场景中移除的预制卫星（NORAD 编号） */
  hiddenPresetIds: number[];
  /** 用户自定义卫星 */
  customSatellites: SatelliteMeta[];
}

export function emptyStore(): CustomStoreData {
  return { version: 1, enabledLibraryIds: [], hiddenPresetIds: [], customSatellites: [] };
}

function isTleLine(line: unknown, marker: string): line is string {
  return typeof line === 'string' && line.startsWith(marker) && line.trim().length >= 69;
}

function coerceMeta(value: unknown): SatelliteMeta | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const noradId = Number(raw.noradId);
  if (!Number.isFinite(noradId) || noradId <= 0) return null;
  if (!isTleLine(raw.tle1, '1 ') || !isTleLine(raw.tle2, '2 ')) return null;
  if (typeof raw.name !== 'string' || raw.name.trim().length === 0) return null;
  const fovDeg = Number(raw.fovDeg);
  return {
    noradId: Math.round(noradId),
    name: raw.name.trim().slice(0, 24),
    label: typeof raw.label === 'string' && raw.label ? raw.label.slice(0, 48) : raw.name.trim().slice(0, 48),
    labelZh: typeof raw.labelZh === 'string' && raw.labelZh ? raw.labelZh.slice(0, 48) : undefined,
    group: typeof raw.group === 'string' && raw.group ? raw.group : CUSTOM_GROUP,
    fovDeg: Number.isFinite(fovDeg) && fovDeg > 0.05 && fovDeg < 175 ? fovDeg : 20,
    tle1: raw.tle1,
    tle2: raw.tle2,
    descZh: typeof raw.descZh === 'string' ? raw.descZh.slice(0, 400) : '',
    descEn: typeof raw.descEn === 'string' ? raw.descEn.slice(0, 400) : '',
    preset: false,
  };
}

/** 解析 localStorage 或导入的 JSON；容错：任何不合法字段都被丢弃而不是抛错 */
export function parseStore(raw: string | null | undefined): CustomStoreData {
  const store = emptyStore();
  if (!raw) return store;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return store;
  }
  if (!parsed || typeof parsed !== 'object') return store;
  const source = parsed as Record<string, unknown>;

  const ids = Array.isArray(source.enabledLibraryIds) ? source.enabledLibraryIds : [];
  const seen = new Set<number>();
  for (const value of ids) {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    store.enabledLibraryIds.push(Math.round(id));
  }

  const hiddenIds = Array.isArray(source.hiddenPresetIds) ? source.hiddenPresetIds : [];
  const hiddenSeen = new Set<number>();
  for (const value of hiddenIds) {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0 || hiddenSeen.has(id)) continue;
    hiddenSeen.add(id);
    store.hiddenPresetIds.push(Math.round(id));
  }

  const customs = Array.isArray(source.customSatellites) ? source.customSatellites : [];
  for (const value of customs) {
    const meta = coerceMeta(value);
    if (meta && !store.customSatellites.some((existing) => existing.noradId === meta.noradId)) {
      store.customSatellites.push(meta);
    }
  }
  return store;
}

export function serializeStore(data: CustomStoreData): string {
  return JSON.stringify(data, null, 2);
}

/** 分配自定义卫星编号：90000 起递增，避开目录与已有自定义卫星 */
export function nextCustomNoradId(used: Iterable<number>): number {
  const taken = new Set<number>();
  for (const value of used) if (Number.isFinite(value)) taken.add(Math.round(value));
  for (let id = CUSTOM_NORAD_BASE; id <= 99999; id += 1) {
    if (!taken.has(id)) return id;
  }
  return CUSTOM_NORAD_BASE;
}

export function readStore(storage: Pick<Storage, 'getItem'> | null = safeStorage()): CustomStoreData {
  if (!storage) return emptyStore();
  try {
    return parseStore(storage.getItem(CUSTOM_STORAGE_KEY));
  } catch {
    return emptyStore();
  }
}

export function writeStore(
  data: CustomStoreData,
  storage: Pick<Storage, 'setItem'> | null = safeStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(CUSTOM_STORAGE_KEY, serializeStore(data));
  } catch {
    // 隐私模式等场景下写入会失败，忽略即可（不影响本次会话）
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
