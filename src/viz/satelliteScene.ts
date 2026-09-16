import * as THREE from 'three';
import type { SatelliteRecord } from '../orbit/types';
import {
  createOrbitLine,
  createOrbitMaterials,
  sampleOrbit,
  type OrbitLineHandle,
  type OrbitMaterials,
} from './orbitLine';
import {
  createSatellitePoints,
  createSelectionHalo,
  type SatellitePointsHandle,
  type SelectionHalo,
} from './satellitePoints';
import { isOccludedByEarth, projectSample, pickNearest, type ScreenSample } from './picking';

const BASE_SIZE = 420;
const HOVER_SIZE = 560;
const SELECTED_SIZE = 780;
const LINE_REFRESH_SIM_MS = 15 * 60 * 1000;
const LINE_REFRESH_REAL_MS = 3500;
const LINES_PER_FRAME = 4;

const SELECTED_COLOR = '#ffd479';
const HOVER_COLOR = '#ffffff';

export interface SatelliteSceneHandle {
  group: THREE.Group;
  update(
    simTime: Date,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
    realDeltaMs: number,
  ): void;
  setRecords(records: SatelliteRecord[]): void;
  setSelected(id: string | null, immediate?: boolean): void;
  setHovered(id: string | null): void;
  setOrbitLinesVisible(visible: boolean): void;
  setPointScale(scale: number, minPixels?: number, maxPixels?: number): void;
  pick(pointerX: number, pointerY: number, maxPixels?: number): string | null;
  positionOf(id: string): { x: number; y: number; z: number } | null;
  samples(): ScreenSample[];
  setResolution(width: number, height: number): void;
  visibleCount(): number;
  dispose(): void;
}

export function createSatelliteScene(records: SatelliteRecord[]): SatelliteSceneHandle {
  const group = new THREE.Group();
  const materials: OrbitMaterials = createOrbitMaterials();
  const halo: SelectionHalo = createSelectionHalo();
  group.add(halo.sprite);

  let currentRecords: SatelliteRecord[] = [];
  let points: SatellitePointsHandle = createSatellitePoints(1);
  let positions = new Float32Array(3);
  let colors = new Float32Array(3);
  let sizes = new Float32Array(1);
  let indexById = new Map<string, number>();
  let lines = new Map<string, { handle: OrbitLineHandle; sampledAtMs: number }>();
  let lineQueue: string[] = [];
  let lastQueueRealMs = 0;
  let selectedId: string | null = null;
  let hoveredId: string | null = null;
  let screenSamples: ScreenSample[] = [];
  let orbitsVisible = true;
  const colorCache = new Map<string, THREE.Color>();
  const tmpCameraTarget = new THREE.Vector3();

  const colorOf = (hex: string): THREE.Color => {
    let color = colorCache.get(hex);
    if (!color) {
      color = new THREE.Color(hex);
      colorCache.set(hex, color);
    }
    return color;
  };

  function ensureLine(record: SatelliteRecord): OrbitLineHandle {
    let entry = lines.get(record.id);
    if (!entry) {
      const handle = createOrbitLine(record.colorHex, materials);
      handle.setSelected(record.id === selectedId);
      handle.line.visible = orbitsVisible;
      group.add(handle.line);
      entry = { handle, sampledAtMs: Number.NEGATIVE_INFINITY };
      lines.set(record.id, entry);
    }
    return entry.handle;
  }

  function rebuildLine(record: SatelliteRecord, simTime: Date, entry: { handle: OrbitLineHandle; sampledAtMs: number }): void {
    const pointsArray = sampleOrbit(record.propagator, simTime);
    if (!pointsArray) return;
    if (pointsArray.length / 3 > 200) {
      // Line2 顶点过多会明显拖慢线宽更新，超过 200 点时按步长抽稀
      const step = Math.ceil(pointsArray.length / 3 / 200);
      const reduced = new Float32Array(Math.ceil(pointsArray.length / 3 / step) * 3);
      let cursor = 0;
      for (let i = 0; i < pointsArray.length / 3; i += step) {
        reduced[cursor] = pointsArray[i * 3];
        reduced[cursor + 1] = pointsArray[i * 3 + 1];
        reduced[cursor + 2] = pointsArray[i * 3 + 2];
        cursor += 3;
      }
      entry.handle.update(reduced.subarray(0, cursor));
    } else {
      entry.handle.update(pointsArray);
    }
    entry.sampledAtMs = simTime.getTime();
  }

  function setRecords(nextRecords: SatelliteRecord[]): void {
    for (const entry of lines.values()) {
      group.remove(entry.handle.line);
      entry.handle.dispose();
    }
    lines = new Map();
    group.remove(points.points);
    points.dispose();
    points = createSatellitePoints(Math.max(1, nextRecords.length));
    group.add(points.points);
    positions = new Float32Array(nextRecords.length * 3);
    colors = new Float32Array(nextRecords.length * 3);
    sizes = new Float32Array(nextRecords.length);
    indexById = new Map(nextRecords.map((record, index) => [record.id, index]));
    currentRecords = nextRecords;
    lineQueue = nextRecords.map((record) => record.id);
    lastQueueRealMs = 0;
  }

  setRecords(records);

  function pick(pointerX: number, pointerY: number, maxPixels = 22): string | null {
    return pickNearest(screenSamples, pointerX, pointerY, maxPixels);
  }

  function positionOfId(id: string): { x: number; y: number; z: number } | null {
    const index = indexById.get(id);
    if (index === undefined) return null;
    if (sizes[index] <= 0) return null;
    return { x: positions[index * 3], y: positions[index * 3 + 1], z: positions[index * 3 + 2] };
  }

  return {
    group,
    setRecords,
    setResolution(width, height) {
      materials.setResolution(width, height);
    },
    setSelected(id) {
      if (selectedId === id) return;
      const previous = selectedId ? lines.get(selectedId) : undefined;
      previous?.handle.setSelected(false);
      selectedId = id;
      const next = id ? lines.get(id) : undefined;
      if (next) next.handle.setSelected(true);
    },
    setHovered(id) {
      hoveredId = id;
    },
    setOrbitLinesVisible(visible) {
      orbitsVisible = visible;
      for (const entry of lines.values()) entry.handle.line.visible = visible;
    },
    setPointScale(scale, minPixels = 3.5, maxPixels = 30) {
      points.setScale(scale, minPixels, maxPixels);
    },
    pick,
    positionOf: positionOfId,
    samples: () => screenSamples,
    visibleCount: () => {
      let count = 0;
      for (let i = 0; i < sizes.length; i += 1) if (sizes[i] > 0) count += 1;
      return count;
    },
    update(simTime, camera, width, height, realDeltaMs) {
      const nowMs = performance.now();
      screenSamples = [];

      for (let i = 0; i < currentRecords.length; i += 1) {
        const record = currentRecords[i];
        const position = record.propagator.positionEciKm(simTime);
        const isSelected = record.id === selectedId;
        const isHovered = record.id === hoveredId;
        if (!position) {
          sizes[i] = 0;
          continue;
        }
        positions[i * 3] = position.x;
        positions[i * 3 + 1] = position.y;
        positions[i * 3 + 2] = position.z;
        const color = colorOf(isSelected ? SELECTED_COLOR : isHovered ? HOVER_COLOR : record.colorHex);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
        sizes[i] = isSelected ? SELECTED_SIZE : isHovered ? HOVER_SIZE : BASE_SIZE;
      }

      points.updatePositions(positions, colors, sizes, currentRecords.length);

      if (camera) {
        const cameraPosition = camera.position;
        for (let i = 0; i < currentRecords.length; i += 1) {
          const record = currentRecords[i];
          if (sizes[i] <= 0) continue;
          const sample = projectSample(
            camera,
            { x: positions[i * 3], y: positions[i * 3 + 1], z: positions[i * 3 + 2] },
            width,
            height,
          );
          if (!sample) continue;
          screenSamples.push({
            id: record.id,
            x: positions[i * 3],
            y: positions[i * 3 + 1],
            z: positions[i * 3 + 2],
            screenX: sample.x,
            screenY: sample.y,
            visible: !isOccludedByEarth(cameraPosition, {
              x: positions[i * 3],
              y: positions[i * 3 + 1],
              z: positions[i * 3 + 2],
            }),
          });
        }
      }

      if (selectedId) {
        const position = positionOfId(selectedId);
        if (position) {
          const distance = camera
            ? camera.position.distanceTo(tmpCameraTarget.set(position.x, position.y, position.z))
            : 20000;
          halo.setPosition(position.x, position.y, position.z, distance);
          const pulse = 1 + 0.12 * Math.sin(nowMs / 320);
          halo.sprite.scale.multiplyScalar(pulse);
          halo.setVisible(true);
        } else {
          halo.setVisible(false);
        }
      } else {
        halo.setVisible(false);
      }

      if (lineQueue.length === 0 && nowMs - lastQueueRealMs > LINE_REFRESH_REAL_MS) {
        const stale = currentRecords.filter((record) => {
          const entry = lines.get(record.id);
          return !entry || Math.abs(simTime.getTime() - entry.sampledAtMs) > LINE_REFRESH_SIM_MS;
        });
        if (stale.length > 0) {
          lineQueue = stale.map((record) => record.id);
          lastQueueRealMs = nowMs;
        }
      }

      let built = 0;
      while (lineQueue.length > 0 && built < LINES_PER_FRAME) {
        const id = lineQueue.shift()!;
        const record = currentRecords.find((candidate) => candidate.id === id);
        if (!record) continue;
        const handle = ensureLine(record);
        const entry = lines.get(record.id)!;
        rebuildLine(record, simTime, entry);
        handle.setSelected(record.id === selectedId);
        built += 1;
      }

      void realDeltaMs;
    },
    dispose() {
      for (const entry of lines.values()) entry.handle.dispose();
      points.dispose();
      halo.dispose();
      materials.dispose();
    },
  };
}
