import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Vec3 } from './frames';

export interface FollowControllerOptions {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** 过渡时长，毫秒 */
  transitionMs?: number;
  /** 位置低通滤波时间常数，秒 */
  smoothingTau?: number;
}

export interface FollowController {
  lock(id: string, target: Vec3, desiredDistanceKm: number): void;
  unlock(): void;
  activeId(): string | null;
  setDesiredDistance(km: number): void;
  /** 是否为自适应距离（大椭圆等高度跨度大的轨道） */
  setAdaptive(enabled: boolean): void;
  update(target: Vec3 | null, dtMs: number): void;
  isTransitioning(): boolean;
  desiredDistance(): number;
}

const BASE_FOV = 50;
const LOCK_FOV = 43.5;
/** 地球自转轴：锁定期间以它作为"画面朝北"的基准 */
export const SPIN_AXIS = new THREE.Vector3(0, 0, 1);
/** 跟随状态下画面滚转的最大角速度（弧度/秒），越大越快回正 */
const FOLLOW_ROLL_RATE = 0.8;
/** 过渡状态下允许的滚转角速度，明显更快，避免过渡结束时画面还是歪的 */
const TRANSITION_ROLL_RATE = 3.2;
/** 北向分量小于该值时视为极区，退化为平行传输（画面不翻滚） */
const NORTH_SOLID_LIMIT = 0.08;
/** 过渡期间放宽距离限制，防止 OrbitControls 中途夹紧半径造成跳变 */
const LOOSE_MIN_DISTANCE = 40;
const LOOSE_MAX_DISTANCE = 4_000_000;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

const _north = new THREE.Vector3();
const _cross = new THREE.Vector3();

/**
 * 把视线方向从 up 中去掉，让 up 始终垂直于视线。返回投影后的长度。
 */
export function orthogonalizeUp(up: THREE.Vector3, viewDir: THREE.Vector3): number {
  up.addScaledVector(viewDir, -up.dot(viewDir));
  return up.length();
}

/**
 * 计算锁定跟随时画面的"朝上"方向。
 *
 * - 常规情况：把地球自转轴投影到垂直于视线的平面上（画面里"北"朝上），
 *   并按最大角速度逐步靠拢，避免画面突然翻转。
 * - 极区（视线几乎与自转轴平行，例如卫星正好掠过极点）：投影长度趋近 0，
 *   此时只保留上一帧的滚转（平行传输），画面平滑掠过，不会像 OrbitControls
 *   那样在极点附近卡死或打转。
 *
 * up 会被就地修改，函数结束后保证 up ⟂ viewDir 且为单位向量。
 */
export function stabilizeFrameUp(
  up: THREE.Vector3,
  viewDir: THREE.Vector3,
  dtSeconds: number,
  maxRollRateRad: number,
): void {
  if (orthogonalizeUp(up, viewDir) < 1e-4) {
    // up 与视线几乎平行：用自转轴重开，仍不行则退回世界 +y
    up.copy(SPIN_AXIS);
    if (orthogonalizeUp(up, viewDir) < 1e-4) {
      up.set(0, 1, 0);
      orthogonalizeUp(up, viewDir);
    }
    if (up.lengthSq() < 1e-12) up.set(1, 0, 0);
  }
  up.normalize();

  _north.set(0, 0, 1).addScaledVector(viewDir, -viewDir.z);
  const northLength = _north.length();
  if (northLength < NORTH_SOLID_LIMIT) return;
  _north.divideScalar(northLength);

  // 绕视线方向滚转：夹角用带符号角，保证转向最短方向
  _cross.crossVectors(up, _north);
  const delta = Math.atan2(_cross.dot(viewDir), up.dot(_north));
  if (Math.abs(delta) < 1e-4) return;
  const maxStep = Math.max(0, maxRollRateRad) * Math.max(0, dtSeconds);
  const step = Math.max(-maxStep, Math.min(maxStep, delta));
  up.applyAxisAngle(viewDir, step);
  orthogonalizeUp(up, viewDir);
  up.normalize();
}

export function createFollowController(options: FollowControllerOptions): FollowController {
  const { camera, controls } = options;
  const transitionMs = options.transitionMs ?? 950;
  const tau = options.smoothingTau ?? 0.28;

  let activeId: string | null = null;
  let desiredDistanceKm = 3000;
  let transitionStart = 0;
  let transitioning = false;
  let fromTarget = new THREE.Vector3();
  let fromDirection = new THREE.Vector3(0, 0, 1);
  let filtered = new THREE.Vector3();
  let previousFiltered = new THREE.Vector3();
  let direction = new THREE.Vector3(0, 0, 1);
  let fromDistance = 0;
  let adaptive = false;
  const frameUp = new THREE.Vector3(0, 1, 0);
  const nextTarget = new THREE.Vector3();
  const scratchDir = new THREE.Vector3();
  const scratchView = new THREE.Vector3();

  const applyDistanceLimits = () => {
    controls.minDistance = Math.max(120, desiredDistanceKm * 0.08);
    controls.maxDistance = desiredDistanceKm * 8;
  };

  return {
    lock(id, target, desiredDistance) {
      activeId = id;
      desiredDistanceKm = Math.max(400, desiredDistance);
      // 过渡期间先放宽限制，等镜头就位再收紧，避免中途被夹紧半径
      controls.minDistance = LOOSE_MIN_DISTANCE;
      controls.maxDistance = LOOSE_MAX_DISTANCE;
      fromTarget.copy(controls.target);
      // 跟随视角：相机位于卫星正上方（本地天顶方向），画面里卫星在上、地球在下
      const localUp = new THREE.Vector3(target.x, target.y, target.z);
      if (localUp.lengthSq() < 1e-6) localUp.set(0, 0, 1);
      localUp.normalize();
      direction.copy(localUp);
      // 记录起点：相对目标的球面方向 + 距离，过渡时沿球面绕过去而不是穿地球
      scratchDir.copy(camera.position).sub(controls.target);
      const currentDistance = scratchDir.length();
      if (currentDistance > 1e-3) {
        fromDirection.copy(scratchDir).divideScalar(currentDistance);
      } else {
        fromDirection.copy(localUp);
      }
      fromDistance = currentDistance > 1e-3 ? currentDistance : desiredDistanceKm;
      frameUp.copy(camera.up);
      if (frameUp.lengthSq() < 1e-8) frameUp.set(0, 1, 0);
      filtered.set(target.x, target.y, target.z);
      previousFiltered.copy(filtered);
      transitionStart = performance.now();
      transitioning = true;
      controls.enabled = false;
    },
    unlock() {
      activeId = null;
      transitioning = false;
      controls.enabled = true;
      controls.minDistance = 6600;
      controls.maxDistance = 300000;
      camera.up.set(0, 1, 0);
      camera.fov = BASE_FOV;
      camera.updateProjectionMatrix();
    },
    activeId: () => activeId,
    setAdaptive(enabled) {
      adaptive = enabled;
    },
    setDesiredDistance(km) {
      desiredDistanceKm = Math.max(400, km);
      applyDistanceLimits();
    },
    desiredDistance: () => desiredDistanceKm,
    isTransitioning: () => transitioning,
    update(target, dtMs) {
      if (!activeId || !target) return;
      const dt = Math.max(0.001, dtMs / 1000);
      const alpha = 1 - Math.exp(-dt / tau);
      filtered.lerp(new THREE.Vector3(target.x, target.y, target.z), alpha);

      if (transitioning) {
        const elapsed = performance.now() - transitionStart;
        const t = Math.min(1, elapsed / transitionMs);
        const eased = easeInOutCubic(t);
        const distance = fromDistance + (desiredDistanceKm - fromDistance) * eased;
        nextTarget.lerpVectors(fromTarget, filtered, eased);
        scratchDir.copy(fromDirection).lerp(direction, eased);
        if (scratchDir.lengthSq() < 1e-8) scratchDir.copy(direction);
        scratchDir.normalize();
        controls.target.copy(nextTarget);
        camera.position.copy(nextTarget).addScaledVector(scratchDir, distance);
        scratchView.copy(controls.target).sub(camera.position);
        if (scratchView.lengthSq() > 1e-8) {
          scratchView.normalize();
          stabilizeFrameUp(frameUp, scratchView, dt, TRANSITION_ROLL_RATE);
          camera.up.copy(frameUp);
        }
        camera.fov = BASE_FOV + (LOCK_FOV - BASE_FOV) * Math.sin(Math.PI * eased);
        camera.updateProjectionMatrix();
        if (t >= 1) {
          transitioning = false;
          applyDistanceLimits();
          controls.enabled = true;
          camera.fov = LOCK_FOV;
          camera.updateProjectionMatrix();
          previousFiltered.copy(filtered);
        }
        return;
      }

      const delta = filtered.clone().sub(previousFiltered);
      camera.position.add(delta);
      controls.target.copy(filtered);
      previousFiltered.copy(filtered);

      // 视线方向：相机 → 卫星。据此挑选画面朝上方向，绕开 ±y 极点奇异
      scratchView.copy(controls.target).sub(camera.position);
      if (scratchView.lengthSq() > 1e-8) {
        scratchView.normalize();
        stabilizeFrameUp(frameUp, scratchView, dt, FOLLOW_ROLL_RATE);
        camera.up.copy(frameUp);
      }

      // 大椭圆轨道：随卫星高度平滑调整取景距离，近地点不穿模、远地点不丢目标
      if (adaptive) {
        const offset = camera.position.clone().sub(filtered);
        const distance = offset.length();
        if (distance > 1e-3) {
          const rate = Math.min(1, dt * 0.6);
          const corrected = Math.max(
            desiredDistanceKm * 0.6,
            Math.min(desiredDistanceKm * 1.6, distance + (desiredDistanceKm - distance) * rate),
          );
          offset.setLength(corrected);
          camera.position.copy(filtered).add(offset);
        }
      }
    },
  };
}
