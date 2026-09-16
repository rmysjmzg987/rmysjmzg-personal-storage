import * as THREE from 'three';
import { EARTH_RADIUS_KM, eciToEcef, rotateZ, type Vec3 } from '../core/frames';

const DEG = Math.PI / 180;
const RING_SEGMENTS = 96;
const SURFACE_OFFSET = 1.004;

export interface FootprintUpdate {
  /** 卫星在惯性系中的位置，km */
  satelliteEci: Vec3;
  gmstRad: number;
  /** 传感器视场角（整锥角，度） */
  fovDeg: number;
  /** 侧摆角（度），0 表示正下视 */
  offNadirDeg?: number;
}

export interface FootprintHandle {
  group: THREE.Group;
  update(params: FootprintUpdate): void;
  setVisible(visible: boolean): void;
  /** 地面高亮区的地心角半径（弧度），用于城市扫过判定 */
  coverageAngleRad(): number;
  /** 星下点在惯性系中的单位向量 */
  nadirUnitEci(): Vec3 | null;
  dispose(): void;
}

/** 正下视解析解：λ = asin(r·sinα / R) − α（规格 §8.3） */
export function footprintAngularRadius(
  radiusKm: number,
  halfFovRad: number,
  earthRadiusKm = EARTH_RADIUS_KM,
): number {
  const ratio = (radiusKm * Math.sin(halfFovRad)) / earthRadiusKm;
  const clamped = Math.min(1, Math.max(-1, ratio));
  return Math.asin(clamped) - halfFovRad;
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** 射线与地球球面求交（近根），返回地面交点；无交点时返回切点（地平线极限） */
export function footprintGroundPoint(
  ecef: Vec3,
  direction: Vec3,
  earthRadiusKm = EARTH_RADIUS_KM,
): Vec3 | null {
  const radius = Math.hypot(ecef.x, ecef.y, ecef.z);
  if (!Number.isFinite(radius) || radius <= earthRadiusKm) return null;
  const b = ecef.x * direction.x + ecef.y * direction.y + ecef.z * direction.z;
  const c = radius * radius - earthRadiusKm * earthRadiusKm;
  const discriminant = b * b - c;
  const t = discriminant >= 0 ? -b - Math.sqrt(discriminant) : -b;
  if (!(t > 0)) return null;
  return {
    x: ecef.x + direction.x * t,
    y: ecef.y + direction.y * t,
    z: ecef.z + direction.z * t,
  };
}

/** 由锥轴与半视场角构造某个方位角上的射线方向 */
export function coneRayDirection(
  axis: Vec3,
  basisU: Vec3,
  basisV: Vec3,
  halfAngleRad: number,
  azimuthRad: number,
): Vec3 {
  const cosAlpha = Math.cos(halfAngleRad);
  const sinAlpha = Math.sin(halfAngleRad);
  const cosAz = Math.cos(azimuthRad);
  const sinAz = Math.sin(azimuthRad);
  return {
    x: axis.x * cosAlpha + (basisU.x * cosAz + basisV.x * sinAz) * sinAlpha,
    y: axis.y * cosAlpha + (basisU.y * cosAz + basisV.y * sinAz) * sinAlpha,
    z: axis.z * cosAlpha + (basisU.z * cosAz + basisV.z * sinAz) * sinAlpha,
  };
}

export function orthonormalBasis(axis: Vec3): { u: Vec3; v: Vec3 } {
  const reference = Math.abs(axis.z) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const u = normalize(cross(axis, reference));
  const v = cross(axis, u);
  return { u, v };
}

export function createFootprint(): FootprintHandle {
  const group = new THREE.Group();
  group.visible = false;

  // ---- 球面高亮（中心 + 一圈边界，三角扇） ----
  const fanVertexCount = RING_SEGMENTS + 1;
  const fanPositions = new Float32Array(fanVertexCount * 3);
  const fanColors = new Float32Array(fanVertexCount * 3);
  const fanIndices: number[] = [];
  for (let i = 0; i < RING_SEGMENTS; i += 1) {
    fanIndices.push(0, 1 + i, 1 + ((i + 1) % RING_SEGMENTS));
  }
  fanColors[0] = 0.45;
  fanColors[1] = 0.85;
  fanColors[2] = 1.0;
  for (let i = 1; i <= RING_SEGMENTS; i += 1) {
    fanColors[i * 3] = 0.16;
    fanColors[i * 3 + 1] = 0.5;
    fanColors[i * 3 + 2] = 0.85;
  }
  const fanGeometry = new THREE.BufferGeometry();
  fanGeometry.setAttribute('position', new THREE.BufferAttribute(fanPositions, 3));
  fanGeometry.setAttribute('color', new THREE.BufferAttribute(fanColors, 3));
  fanGeometry.setIndex(fanIndices);
  const fanMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const fanMesh = new THREE.Mesh(fanGeometry, fanMaterial);
  fanMesh.frustumCulled = false;
  fanMesh.renderOrder = 2;
  group.add(fanMesh);

  // ---- 边界描边 ----
  const outlinePositions = new Float32Array(RING_SEGMENTS * 3);
  const outlineGeometry = new THREE.BufferGeometry();
  outlineGeometry.setAttribute('position', new THREE.BufferAttribute(outlinePositions, 3));
  const outlineMaterial = new THREE.LineBasicMaterial({
    color: 0xa9ecff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const outline = new THREE.LineLoop(outlineGeometry, outlineMaterial);
  outline.frustumCulled = false;
  outline.renderOrder = 3;
  group.add(outline);

  // ---- 光锥侧面（卫星端 ⇒ 地面边界） ----
  const conePositions = new Float32Array(RING_SEGMENTS * 2 * 3);
  const coneColors = new Float32Array(RING_SEGMENTS * 2 * 3);
  const coneIndices: number[] = [];
  for (let i = 0; i < RING_SEGMENTS; i += 1) {
    const a = i * 2;
    const b = i * 2 + 1;
    const nextA = ((i + 1) % RING_SEGMENTS) * 2;
    const nextB = nextA + 1;
    coneIndices.push(a, nextA, b, b, nextA, nextB);
    coneColors[a * 3] = 0.4;
    coneColors[a * 3 + 1] = 0.85;
    coneColors[a * 3 + 2] = 1.0;
    coneColors[b * 3] = 0.12;
    coneColors[b * 3 + 1] = 0.4;
    coneColors[b * 3 + 2] = 0.75;
  }
  const coneGeometry = new THREE.BufferGeometry();
  coneGeometry.setAttribute('position', new THREE.BufferAttribute(conePositions, 3));
  coneGeometry.setAttribute('color', new THREE.BufferAttribute(coneColors, 3));
  coneGeometry.setIndex(coneIndices);
  const coneMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.24,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const coneMesh = new THREE.Mesh(coneGeometry, coneMaterial);
  coneMesh.frustumCulled = false;
  coneMesh.renderOrder = 2;
  group.add(coneMesh);

  let coverageAngle = 0;
  let nadirUnit: Vec3 | null = null;

  return {
    group,
    coverageAngleRad: () => coverageAngle,
    nadirUnitEci: () => nadirUnit,
    setVisible(visible) {
      group.visible = visible;
    },
    update({ satelliteEci, gmstRad, fovDeg, offNadirDeg = 0 }) {
      const ecef = eciToEcef(satelliteEci, gmstRad);
      const radius = Math.hypot(ecef.x, ecef.y, ecef.z);
      if (!Number.isFinite(radius) || radius <= EARTH_RADIUS_KM) {
        group.visible = false;
        return;
      }

      const halfFov = Math.max(0.05 * DEG, (fovDeg / 2) * DEG);
      const horizon = Math.asin(Math.min(1, EARTH_RADIUS_KM / radius));
      const alpha = Math.min(halfFov, horizon * 0.999);
      coverageAngle = footprintAngularRadius(radius, alpha);

      const nadir = normalize({ x: -ecef.x, y: -ecef.y, z: -ecef.z });
      // 侧摆：把锥轴在轨道面内偏转 offNadirDeg
      let axis = nadir;
      if (offNadirDeg !== 0) {
        const beta = Math.min(45, Math.abs(offNadirDeg)) * DEG;
        const { u } = orthonormalBasis(nadir);
        const sign = offNadirDeg >= 0 ? 1 : -1;
        axis = normalize({
          x: nadir.x * Math.cos(beta) + sign * u.x * Math.sin(beta),
          y: nadir.y * Math.cos(beta) + sign * u.y * Math.sin(beta),
          z: nadir.z * Math.cos(beta) + sign * u.z * Math.sin(beta),
        });
      }

      const { u: basisU, v: basisV } = orthonormalBasis(axis);
      const surfaceRadius = EARTH_RADIUS_KM * SURFACE_OFFSET;

      const nadirGroundX = nadir.x * surfaceRadius;
      const nadirGroundY = nadir.y * surfaceRadius;
      const nadirGroundZ = nadir.z * surfaceRadius;
      const nadirGroundEci = rotateZ({ x: nadirGroundX, y: nadirGroundY, z: nadirGroundZ }, gmstRad);
      fanPositions[0] = nadirGroundEci.x;
      fanPositions[1] = nadirGroundEci.y;
      fanPositions[2] = nadirGroundEci.z;

      const subPoint = rotateZ(nadir, gmstRad);
      nadirUnit = subPoint;

      for (let i = 0; i < RING_SEGMENTS; i += 1) {
        const azimuth = (i / RING_SEGMENTS) * Math.PI * 2;
        const direction = coneRayDirection(axis, basisU, basisV, alpha, azimuth);
        const groundEcef =
          footprintGroundPoint(ecef, direction) ??
          { x: ecef.x + direction.x, y: ecef.y + direction.y, z: ecef.z + direction.z };
        const groundLength = Math.hypot(groundEcef.x, groundEcef.y, groundEcef.z) || 1;
        const scaled = {
          x: (groundEcef.x / groundLength) * surfaceRadius,
          y: (groundEcef.y / groundLength) * surfaceRadius,
          z: (groundEcef.z / groundLength) * surfaceRadius,
        };
        const groundEci = rotateZ(scaled, gmstRad);
        const ringIndex = (i + 1) * 3;
        fanPositions[ringIndex] = groundEci.x;
        fanPositions[ringIndex + 1] = groundEci.y;
        fanPositions[ringIndex + 2] = groundEci.z;
        outlinePositions[i * 3] = groundEci.x;
        outlinePositions[i * 3 + 1] = groundEci.y;
        outlinePositions[i * 3 + 2] = groundEci.z;
        const coneIndex = i * 6;
        conePositions[coneIndex] = satelliteEci.x;
        conePositions[coneIndex + 1] = satelliteEci.y;
        conePositions[coneIndex + 2] = satelliteEci.z;
        conePositions[coneIndex + 3] = groundEci.x;
        conePositions[coneIndex + 4] = groundEci.y;
        conePositions[coneIndex + 5] = groundEci.z;
      }

      (fanGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (outlineGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (coneGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      fanGeometry.computeBoundingSphere();
      coneGeometry.computeBoundingSphere();
      group.visible = true;
    },
    dispose() {
      fanGeometry.dispose();
      fanMaterial.dispose();
      outlineGeometry.dispose();
      outlineMaterial.dispose();
      coneGeometry.dispose();
      coneMaterial.dispose();
    },
  };
}
