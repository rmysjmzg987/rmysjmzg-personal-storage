import type * as THREE from 'three';
import { EARTH_RADIUS_KM, geodeticToEcef, rotateZ } from '../core/frames';
import { isOccludedByEarth, projectSample } from '../viz/picking';
import type { CityInfo } from '../orbit/catalog';
import type { Lang } from './i18n';

export interface CityLabelView {
  camera: THREE.PerspectiveCamera;
  width: number;
  height: number;
  gmstRad: number;
  lang: Lang;
  /** 被拍摄范围扫过的城市 key 集合 */
  covered: Set<string>;
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
      lastName: '',
    };
  });

  const surface = EARTH_RADIUS_KM * 1.002;

  return {
    update({ camera, width, height, gmstRad, lang, covered, footprintActive }) {
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
        if (isCovered !== entry.lastCovered) {
          entry.element.classList.toggle('is-covered', isCovered);
          entry.lastCovered = isCovered;
        }
        const name = lang === 'zh' ? entry.city.zh : entry.city.en;
        if (name !== entry.lastName) {
          entry.nameElement.textContent = name;
          entry.lastName = name;
        }
        const near = sample.depth < 26000;
        const visible = entry.city.rank === 1 || isCovered || near;
        entry.element.style.display = visible ? 'flex' : 'none';
        if (!visible) continue;
        const scale = Math.max(0.72, Math.min(1.12, 30000 / Math.max(sample.depth, 9000)));
        entry.element.style.transform = `translate3d(${(sample.x - 2).toFixed(1)}px, ${(sample.y - 2).toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
        entry.element.style.opacity = isCovered ? '1' : entry.city.rank === 1 ? '0.52' : '0.42';
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
