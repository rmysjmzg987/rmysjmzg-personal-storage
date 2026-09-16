import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Propagator } from '../orbit/types';

export interface OrbitMaterials {
  normal: LineMaterial;
  hovered: LineMaterial;
  selected: LineMaterial;
  setResolution(width: number, height: number): void;
  dispose(): void;
}

export function createOrbitMaterials(): OrbitMaterials {
  const common = {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    dashed: false,
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
  };
  const normal = new LineMaterial({ ...common, linewidth: 1.4, opacity: 0.5 });
  const hovered = new LineMaterial({ ...common, linewidth: 2.4, opacity: 0.85 });
  const selected = new LineMaterial({ ...common, linewidth: 3.4, opacity: 1 });
  return {
    normal,
    hovered,
    selected,
    setResolution(width, height) {
      normal.resolution.set(width, height);
      hovered.resolution.set(width, height);
      selected.resolution.set(width, height);
    },
    dispose() {
      normal.dispose();
      hovered.dispose();
      selected.dispose();
    },
  };
}

export interface OrbitLineHandle {
  line: Line2;
  geometry: LineGeometry;
  /** 最近一次写入的轨道采样点（世界坐标，用于屏幕空间拾取） */
  positions: Float32Array;
  setSelected(selected: boolean): void;
  setHovered(hovered: boolean): void;
  update(points: Float32Array): void;
  dispose(): void;
}

const tmpColor = new THREE.Color();
const tmpFloat = new Float32Array(3);

function hexToRgb(hex: string): [number, number, number] {
  tmpColor.set(hex);
  tmpFloat[0] = tmpColor.r;
  tmpFloat[1] = tmpColor.g;
  tmpFloat[2] = tmpColor.b;
  return [tmpFloat[0], tmpFloat[1], tmpFloat[2]];
}

export function createOrbitLine(colorHex: string, materials: OrbitMaterials): OrbitLineHandle {
  const geometry = new LineGeometry();
  const [r, g, b] = hexToRgb(colorHex);
  geometry.setColors([r, g, b, r, g, b]);
  const line = new Line2(geometry, materials.normal);
  line.frustumCulled = false;
  line.renderOrder = 1;
  let selected = false;
  let hovered = false;
  const handle: OrbitLineHandle = {
    line,
    geometry,
    positions: new Float32Array(0),
    setSelected(next) {
      selected = next;
      applyMaterial();
    },
    setHovered(next) {
      hovered = next;
      applyMaterial();
    },
    update(points) {
      handle.positions = points;
      geometry.setPositions(points);
      line.computeLineDistances();
      const vertexCount = points.length / 3;
      const colors = new Array<number>(vertexCount * 3);
      for (let i = 0; i < vertexCount; i += 1) {
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      }
      geometry.setColors(colors);
    },
    dispose() {
      geometry.dispose();
    },
  };
  function applyMaterial(): void {
    line.material = selected ? materials.selected : hovered ? materials.hovered : materials.normal;
  }
  return handle;
}

/**
 * 采样一条完整轨道：以当前时刻为起点、按一个周期均匀取点。
 * 偏心率越大，近地点附近越快，采样点相应加密。
 */
export function sampleOrbit(propagator: Propagator, at: Date, minPoints = 160): Float32Array | null {
  const periodSeconds = propagator.periodSeconds();
  const elements = propagator.elements();
  if (!periodSeconds || !Number.isFinite(periodSeconds) || !elements) return null;
  const eccentricity = Math.min(elements.eccentricity, 0.95);
  const count = Math.round(Math.min(600, Math.max(minPoints, minPoints + 440 * eccentricity)));
  const out = new Float32Array(count * 3);
  const startMs = at.getTime();
  for (let i = 0; i < count; i += 1) {
    const t = new Date(startMs + (i / (count - 1)) * periodSeconds * 1000);
    const position = propagator.positionEciKm(t);
    if (!position) return null;
    out[i * 3] = position.x;
    out[i * 3 + 1] = position.y;
    out[i * 3 + 2] = position.z;
  }
  return out;
}
