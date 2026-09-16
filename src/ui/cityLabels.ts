import type * as THREE from 'three';
import { EARTH_RADIUS_KM, geodeticToEcef, rotateZ } from '../core/frames';
import { isOccludedByEarth, projectSample } from '../viz/picking';
import type { CityInfo } from '../orbit/catalog';
import type { Lang } from './i18n';

/** 覆盖圈判定放宽系数：真正落在拍摄范围内的城市，判定圈比几何覆盖圈略大一点 */
export const CITY_HIGHLIGHT_MARGIN = 1.6;
/**
 * 掠过判定半径下限（弧度）。
 * 窄视场卫星的真实覆盖圈只有几十到两百公里，而内置城市只有一百来座（平均间距约 2000 km），
 * 按几何覆盖圈判定几乎永远扫不到任何城市；这里给一个下限，让"光锥掠过"这件事看得见。
 */
export const CITY_PASS_MIN_RAD = (8 * Math.PI) / 180;
/** 掠过高亮的余辉（模拟时间毫秒）：离开判定圈后城市名仍暖色一段时间，快速推进时间时也能看到轨迹 */
export const CITY_SWEEP_MEMORY_MS = 150_000;

/** 拍摄范围判定半径（弧度）：城市名变金色 + 闪烁 */
export function cityHighlightRadius(coverageRad: number): number {
  return coverageRad * CITY_HIGHLIGHT_MARGIN;
}

/** 掠过判定半径（弧度）：不小于 CITY_PASS_MIN_RAD，用来表示"这一带刚被光锥扫过" */
export function cityPassRadius(coverageRad: number): number {
  return Math.max(cityHighlightRadius(coverageRad), CITY_PASS_MIN_RAD);
}

export interface SweepMemory {
  /** 记录一批城市在本时刻被扫过 */
  record(keys: Iterable<string>, nowMs: number): void;
  /** 仍在余辉内的城市集合（每帧重建同一个 Set，避免每帧分配） */
  active(nowMs: number): Set<string>;
  clear(): void;
}

/** 掠过余辉：记住"刚刚被扫过"的城市，避免高速时间下高亮一闪而过 */
export function createSweepMemory(memoryMs = CITY_SWEEP_MEMORY_MS): SweepMemory {
  const expiresAt = new Map<string, number>();
  const live = new Set<string>();
  return {
    record(keys, nowMs) {
      const until = nowMs + memoryMs;
      for (const key of keys) expiresAt.set(key, until);
    },
    active(nowMs) {
      live.clear();
      for (const [key, until] of expiresAt) {
        if (until > nowMs) live.add(key);
        else expiresAt.delete(key);
      }
      return live;
    },
    clear() {
      expiresAt.clear();
      live.clear();
    },
  };
}

export interface CityLabelView {
  camera: THREE.PerspectiveCamera;
  width: number;
  height: number;
  gmstRad: number;
  lang: Lang;
  /** 被拍摄范围扫过的城市 key 集合 */
  covered: Set<string>;
  /** 刚刚被扫过、仍在余辉里的城市 key 集合 */
  swept: Set<string>;
  /** 是否处于"拍摄范围正在显示"的状态 */
  footprintActive: boolean;
}

export interface CityLabelHandle {
  update(view: CityLabelView): void;
  dispose(): void;
}

interface CityEntry {
  city: CityInfo;
  key: string;
  element: HTMLDivElement;
  nameElement: HTMLSpanElement;
  ecefUnit: { x: number; y: number; z: number };
  lastCovered: boolean;
  lastSwept: boolean;
  lastName: string;
}

export function cityKey(city: CityInfo): string {
  return city.en;
}

export function createCityLabels(root: HTMLElement, cities: CityInfo[]): CityLabelHandle {
  const container = document.createElement('div');
  container.className = 'city-layer';
  root.appendChild(container);

  const entries: CityEntry[] = cities.map((city) => {
    const element = document.createElement('div');
    element.className = `city-label rank-${city.rank}`;
    const dot = document.createElement('span');
    dot.className = 'city-dot';
    const nameElement = document.createElement('span');
    nameElement.className = 'city-name';
    element.append(dot, nameElement);
    container.appendChild(element);
    const ecef = geodeticToEcef(city.lat, city.lon, 0);
    const length = Math.hypot(ecef.x, ecef.y, ecef.z) || 1;
    return {
      city,
      key: cityKey(city),
      element,
      nameElement,
      ecefUnit: { x: ecef.x / length, y: ecef.y / length, z: ecef.z / length },
      lastCovered: false,
      lastSwept: false,
      lastName: '',
    };
  });

  const surface = EARTH_RADIUS_KM * 1.002;

  return {
    update({ camera, width, height, gmstRad, lang, covered, swept, footprintActive }) {
      for (const entry of entries) {
        const raw = {
          x: entry.ecefUnit.x * surface,
          y: entry.ecefUnit.y * surface,
          z: entry.ecefUnit.z * surface,
        };
        const eci = rotateZ(raw, gmstRad);
        const sample = projectSample(camera, eci, width, height);
        if (!sample) {
          entry.element.style.display = 'none';
          continue;
        }
        const occluded = isOccludedByEarth(camera.position, eci);
        if (occluded) {
          entry.element.style.display = 'none';
          continue;
        }
        const isCovered = footprintActive && covered.has(entry.key);
        const isSwept = !isCovered && footprintActive && swept.has(entry.key);
        if (isCovered !== entry.lastCovered) {
          entry.element.classList.toggle('is-covered', isCovered);
          entry.lastCovered = isCovered;
        }
        if (isSwept !== entry.lastSwept) {
          entry.element.classList.toggle('is-swept', isSwept);
          entry.lastSwept = isSwept;
        }
        const name = lang === 'zh' ? entry.city.zh : entry.city.en;
        if (name !== entry.lastName) {
          entry.nameElement.textContent = name;
          entry.lastName = name;
        }
        const near = sample.depth < 26000;
        const visible = entry.city.rank === 1 || isCovered || isSwept || near;
        entry.element.style.display = visible ? 'flex' : 'none';
        if (!visible) continue;
        const scale = Math.max(0.72, Math.min(1.12, 30000 / Math.max(sample.depth, 9000)));
        entry.element.style.transform = `translate3d(${(sample.x - 2).toFixed(1)}px, ${(sample.y - 2).toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
        entry.element.style.opacity = isCovered
          ? '1'
          : isSwept
            ? '0.9'
            : entry.city.rank === 1
              ? '0.52'
              : '0.42';
      }
    },
    dispose() {
      container.remove();
    },
  };
}

/** 判断城市是否落在高亮圆内（地心角比较） */
export function isCityWithin(
  cityUnit: { x: number; y: number; z: number },
  nadirUnit: { x: number; y: number; z: number },
  coverageAngleRad: number,
): boolean {
  const dot = cityUnit.x * nadirUnit.x + cityUnit.y * nadirUnit.y + cityUnit.z * nadirUnit.z;
  const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
  return angle <= coverageAngleRad;
}
