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

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function createFollowController(options: FollowControllerOptions): FollowController {
  const { camera, controls } = options;
  const transitionMs = options.transitionMs ?? 950;
  const tau = options.smoothingTau ?? 0.28;

  let activeId: string | null = null;
  let desiredDistanceKm = 3000;
  let transitionStart = 0;
  let transitioning = false;
  let fromCamera = new THREE.Vector3();
  let fromTarget = new THREE.Vector3();
  let filtered = new THREE.Vector3();
  let previousFiltered = new THREE.Vector3();
  let direction = new THREE.Vector3(0, 0, 1);
  let fromDistance = 0;
  let adaptive = false;

  const applyDistanceLimits = () => {
    controls.minDistance = Math.max(120, desiredDistanceKm * 0.08);
    controls.maxDistance = desiredDistanceKm * 8;
  };

  return {
    lock(id, target, desiredDistance) {
      activeId = id;
      desiredDistanceKm = Math.max(400, desiredDistance);
      applyDistanceLimits();
      fromCamera.copy(camera.position);
      fromTarget.copy(controls.target);
      // 跟随视角：以目标"本地天顶方向"为主、当前接近方向为辅，
      // 这样相机始终从上方俯视（而不是贴着地平线擦过），地面与拍摄范围都在画面里。
      const localUp = new THREE.Vector3(target.x, target.y, target.z);
      if (localUp.lengthSq() < 1e-6) localUp.set(0, 0, 1);
      localUp.normalize();
      const approach = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z)
        .sub(new THREE.Vector3(target.x, target.y, target.z));
      if (approach.lengthSq() < 1e-6) approach.copy(localUp);
      approach.normalize();
      direction.copy(localUp).multiplyScalar(0.72).addScaledVector(approach, 0.28);
      if (direction.lengthSq() < 1e-6) direction.copy(localUp);
      direction.normalize();
      // 至少保留 45° 俯角，避免出现"贴地平线"的取景
      if (direction.dot(localUp) < 0.7071) {
        direction.copy(localUp).multiplyScalar(0.75).addScaledVector(approach, 0.25).normalize();
      }
      const currentTargetDistance = camera.position.distanceTo(controls.target);
      fromDistance = Math.max(fromDistance, currentTargetDistance);
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
        const endDistance = desiredDistanceKm;
        const distance = fromDistance + (endDistance - fromDistance) * eased;
        const desiredCamera = filtered.clone().addScaledVector(direction, distance);
        const desiredTarget = filtered.clone();
        camera.position.lerpVectors(fromCamera, desiredCamera, eased);
        controls.target.lerpVectors(fromTarget, desiredTarget, eased);
        camera.fov = BASE_FOV + (LOCK_FOV - BASE_FOV) * Math.sin(Math.PI * eased);
        camera.updateProjectionMatrix();
        if (t >= 1) {
          transitioning = false;
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
