import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EARTH_RADIUS_KM, type Vec3 } from './frames';

/** 取景模式：nadir = 俯视（相机在卫星本地天顶，卫星居中、地球在下）；side = 正视（以光锥中点为中心的水平侧视） */
export type ViewMode = 'nadir' | 'side';

export interface FollowControllerOptions {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** 过渡时长，毫秒 */
  transitionMs?: number;
  /** 位置低通滤波时间常数，秒 */
  smoothingTau?: number;
  /** 视口高度（CSS 像素），用于把拖拽像素换算成世界尺度 */
  viewportHeight?: () => number;
  /** 时间源，默认 performance.now（测试可注入假时钟） */
  now?: () => number;
}

export interface FollowController {
  lock(id: string, target: Vec3, desiredDistanceKm: number): void;
  unlock(): void;
  activeId(): string | null;
  setDesiredDistance(km: number): void;
  /** 是否为自适应距离（大椭圆等高度跨度大的轨道） */
  setAdaptive(enabled: boolean): void;
  viewMode(): ViewMode;
  setViewMode(mode: ViewMode): void;
  /** 切换取景模式，返回切换后的模式 */
  toggleViewMode(): ViewMode;
  /** 左键拖拽：绕视角中心旋转（参数为屏幕像素增量） */
  rotateBy(dxPx: number, dyPx: number): void;
  /** 右键拖拽：平移视角中心（参数为屏幕像素增量） */
  panBy(dxPx: number, dyPx: number): void;
  /** 滚轮缩放：wheelDelta 为 WheelEvent.deltaY */
  zoomBy(wheelDelta: number): void;
  /** 当前缩放倍率（相对本位取景距离） */
  zoomFactor(): number;
  /** 拖拽期间冻结画面回正，手感与未锁定时一致 */
  setDragging(dragging: boolean): void;
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
/** 拖拽灵敏度：像素 → 弧度 */
const ROTATE_RATE = 0.0055;
/** 仰角范围（相对本地天顶，0 = 卫星正上方） */
const MAX_ELEVATION = (89 * Math.PI) / 180;
const MIN_ELEVATION = (-40 * Math.PI) / 180;
/** 正视模式的仰角：接近本地水平 */
const SIDE_ELEVATION = (88 * Math.PI) / 180;
/** 正视模式取景距离系数（相对卫星离地高度）：留足余量，让卫星与地球同时入画且不贴边 */
const SIDE_DISTANCE_FACTOR = 2.3;
const SIDE_MIN_DISTANCE = 1600;
/** 右键平移上限（相对取景距离），避免把目标推出画面之外 */
const PAN_LIMIT_FACTOR = 1.6;
/** 手动缩放范围（相对本位取景距离） */
const ZOOM_MIN_FACTOR = 0.04;
const ZOOM_MAX_FACTOR = 14;
/** 缩放的绝对上下限（km）：静止轨道这类本位距离本就极远的卫星，倍率再乘上去会看不见地球 */
const ABS_MIN_DISTANCE = 120;
const ABS_MAX_DISTANCE = 90_000;
/** 相机到地心的最小安全半径，避免拖到地球内部 */
const CAMERA_SAFE_RADIUS = EARTH_RADIUS_KM * 1.02;

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
  referenceAxis: THREE.Vector3 = SPIN_AXIS,
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

  _north.copy(referenceAxis).addScaledVector(viewDir, -referenceAxis.dot(viewDir));
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
  const viewportHeight = options.viewportHeight ?? (() => window.innerHeight);
  const now = options.now ?? (() => performance.now());

  let activeId: string | null = null;
  let desiredDistanceKm = 3000;
  let mode: ViewMode = 'nadir';
  /** 视线方向在卫星本地天球上的方位角 / 仰角（仰角自本地天顶起算） */
  let azimuth = 0;
  let elevation = 0;
  let distance = 0;
  let adaptive = false;
  let dragging = false;
  /** 用户滚轮缩放倍率（相对本位取景距离）；锁定或切换视角时复位 */
  let zoomFactor = 1;
  let transitionStart = 0;
  let transitioning = false;
  const fromCenter = new THREE.Vector3();
  const fromDirection = new THREE.Vector3(0, 0, 1);
  let fromDistance = 0;
  const filtered = new THREE.Vector3();
  const previousFiltered = new THREE.Vector3();
  const frameUp = new THREE.Vector3(0, 1, 0);
  /** 卫星处本地坐标系：localUp 为天顶，north / east 张成当地水平面 */
  const localUp = new THREE.Vector3(0, 0, 1);
  const north = new THREE.Vector3(0, 1, 0);
  const east = new THREE.Vector3(1, 0, 0);
  const center = new THREE.Vector3();
  const goalCenter = new THREE.Vector3();
  /** 右键平移产生的中心偏移（相对卫星） */
  const panOffset = new THREE.Vector3();
  const screenRight = new THREE.Vector3();
  const scratchDir = new THREE.Vector3();
  const scratchView = new THREE.Vector3();
  const alongTrack = new THREE.Vector3();

  const applyDistanceLimits = () => {
    controls.minDistance = Math.max(120, desiredDistanceKm * 0.08);
    controls.maxDistance = desiredDistanceKm * 8;
  };

  /** 由卫星位置刷新本地天顶 / 北 / 东三个基向量 */
  const refreshBasis = () => {
    const radius = filtered.length();
    if (radius > 1e-6) localUp.copy(filtered).divideScalar(radius);
    else localUp.set(0, 0, 1);
    east.crossVectors(SPIN_AXIS, localUp);
    if (east.lengthSq() < 1e-8) east.set(1, 0, 0).cross(localUp);
    if (east.lengthSq() < 1e-8) east.set(0, 1, 0);
    east.normalize();
    north.crossVectors(localUp, east).normalize();
  };

  /** 由方位角 / 仰角还原出世界系下的单位视线方向（中心 → 相机） */
  const dirFromAngles = (out: THREE.Vector3) => {
    const ce = Math.cos(elevation);
    const se = Math.sin(elevation);
    return out
      .copy(localUp)
      .multiplyScalar(ce)
      .addScaledVector(north, se * Math.cos(azimuth))
      .addScaledVector(east, se * Math.sin(azimuth))
      .normalize();
  };

  /** 反向记录角度，并夹紧仰角，保证相机不会钻到地球里面 */
  const anglesFromDir = (dir: THREE.Vector3) => {
    const cosElevation = Math.max(-1, Math.min(1, dir.dot(localUp)));
    const next = Math.acos(cosElevation);
    elevation = Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, next));
    scratchView.copy(dir).addScaledVector(localUp, -cosElevation);
    if (scratchView.lengthSq() > 1e-10) {
      azimuth = Math.atan2(scratchView.dot(east), scratchView.dot(north));
    }
  };

  /** 本位（当前取景模式）的目标距离 */
  const intrinsicDistance = () => {
    if (mode === 'side') {
      const altitude = Math.max(0, filtered.length() - EARTH_RADIUS_KM);
      return Math.max(SIDE_MIN_DISTANCE, altitude * SIDE_DISTANCE_FACTOR);
    }
    return desiredDistanceKm;
  };

  /** 本位距离叠加用户缩放倍率后的目标取景距离 */
  const targetDistance = () => {
    const base = intrinsicDistance();
    const min = Math.max(ABS_MIN_DISTANCE, base * ZOOM_MIN_FACTOR);
    const max = Math.min(ABS_MAX_DISTANCE, base * ZOOM_MAX_FACTOR);
    return Math.min(Math.max(base * zoomFactor, min), max);
  };

  /** 记录当前机位，开始一段平滑过渡 */
  const beginTransition = () => {
    fromCenter.copy(controls.target);
    scratchView.copy(camera.position).sub(controls.target);
    const length = scratchView.length();
    fromDistance = length > 1e-3 ? length : intrinsicDistance();
    if (length > 1e-3) fromDirection.copy(scratchView).divideScalar(length);
    else dirFromAngles(fromDirection);
    transitionStart = now();
    transitioning = true;
  };

  /** 切到正视模式时若视线几乎与天顶重合，方位角无意义，改用垂直于星下点轨迹的方向 */
  const pickSideAzimuth = () => {
    alongTrack.copy(filtered).sub(previousFiltered);
    alongTrack.addScaledVector(localUp, -alongTrack.dot(localUp));
    if (alongTrack.lengthSq() > 1e-8) {
      azimuth = Math.atan2(alongTrack.dot(east), alongTrack.dot(north)) + Math.PI / 2;
    }
  };

  /** 切换取景模式：清掉平移偏移，并把仰角换到该模式的本位角度 */
  const applyMode = (next: ViewMode) => {
    if (next === mode) return;
    mode = next;
    zoomFactor = 1;
    panOffset.set(0, 0, 0);
    if (next === 'side') {
      if (Math.abs(Math.sin(elevation)) < 0.08) pickSideAzimuth();
      elevation = SIDE_ELEVATION;
    } else {
      elevation = 0;
    }
    if (activeId) beginTransition();
  };

  return {
    lock(id, target, desiredDistance) {
      activeId = id;
      desiredDistanceKm = Math.max(400, desiredDistance);
      mode = 'nadir';
      zoomFactor = 1;
      azimuth = 0;
      elevation = 0;
      panOffset.set(0, 0, 0);
      // 过渡期间先放宽限制，等镜头就位再收紧，避免中途被夹紧半径
      controls.minDistance = LOOSE_MIN_DISTANCE;
      controls.maxDistance = LOOSE_MAX_DISTANCE;
      frameUp.copy(camera.up);
      if (frameUp.lengthSq() < 1e-8) frameUp.set(0, 1, 0);
      filtered.set(target.x, target.y, target.z);
      previousFiltered.copy(filtered);
      refreshBasis();
      distance = Math.max(400, desiredDistance);
      // 记录起点球面方向 + 距离，过渡时沿球面绕过去而不是穿地球
      beginTransition();
      controls.enabled = false;
    },
    unlock() {
      activeId = null;
      transitioning = false;
      dragging = false;
      mode = 'nadir';
      panOffset.set(0, 0, 0);
      controls.enabled = true;
      controls.minDistance = 6600;
      controls.maxDistance = 300000;
      camera.up.set(0, 1, 0);
      camera.fov = BASE_FOV;
      camera.updateProjectionMatrix();
    },
    activeId: () => activeId,
    viewMode: () => mode,
    setViewMode: applyMode,
    toggleViewMode() {
      applyMode(mode === 'side' ? 'nadir' : 'side');
      return mode;
    },
    setAdaptive(enabled) {
      adaptive = enabled;
    },
    setDesiredDistance(km) {
      desiredDistanceKm = Math.max(400, km);
      applyDistanceLimits();
    },
    desiredDistance: () => desiredDistanceKm,
    isTransitioning: () => transitioning,
    setDragging(next) {
      dragging = next;
    },
    rotateBy(dxPx, dyPx) {
      if (!activeId) return;
      // 以内部角度状态为准，而不是相机当前位置：同一帧内多个指针事件
      // 到达时相机还没被重新摆放，用位置反推会丢掉前一次增量
      dirFromAngles(scratchDir);
      // 与 OrbitControls 同一套轴：横向绕画面 up 轴、纵向绕画面右轴，
      // 所以在正上方视角横向拖拽同样有效（绕本地天顶转会退化失效）
      if (Math.abs(dxPx) > 1e-6) scratchDir.applyAxisAngle(frameUp, -dxPx * ROTATE_RATE);
      scratchView.copy(scratchDir).negate();
      screenRight.crossVectors(scratchView, frameUp);
      if (screenRight.lengthSq() < 1e-10) screenRight.crossVectors(scratchView, localUp);
      if (screenRight.lengthSq() > 1e-10) {
        screenRight.normalize();
        scratchDir.applyAxisAngle(screenRight, -dyPx * ROTATE_RATE);
      }
      anglesFromDir(scratchDir.normalize());
    },
    panBy(dxPx, dyPx) {
      if (!activeId) return;
      const height = Math.max(1, viewportHeight());
      const perPixel = (2 * distance * Math.tan(((camera.fov / 2) * Math.PI) / 180)) / height;
      scratchDir.copy(center).sub(camera.position);
      if (scratchDir.lengthSq() < 1e-8) dirFromAngles(scratchDir).negate();
      else scratchDir.normalize();
      screenRight.crossVectors(scratchDir, frameUp);
      if (screenRight.lengthSq() < 1e-10) screenRight.crossVectors(scratchDir, localUp);
      if (screenRight.lengthSq() < 1e-10) return;
      screenRight.normalize();
      panOffset.addScaledVector(screenRight, -dxPx * perPixel);
      panOffset.addScaledVector(frameUp, dyPx * perPixel);
      const limit = distance * PAN_LIMIT_FACTOR;
      if (panOffset.length() > limit) panOffset.setLength(limit);
    },
    zoomBy(wheelDelta) {
      if (!activeId) return;
      // 缩放记在倍率上而不是直接改距离，这样正视/大椭圆模式下也不会被本位距离"拉回去"
      const next = zoomFactor * Math.exp(wheelDelta * 0.0012);
      zoomFactor = Math.max(ZOOM_MIN_FACTOR, Math.min(ZOOM_MAX_FACTOR, next));
      distance = targetDistance();
      const limit = distance * PAN_LIMIT_FACTOR;
      if (panOffset.length() > limit) panOffset.setLength(limit);
    },
    zoomFactor: () => zoomFactor,
    update(target, dtMs) {
      if (!activeId || !target) return;
      const dt = Math.max(0.001, dtMs / 1000);
      const alpha = 1 - Math.exp(-dt / tau);
      scratchView.set(target.x, target.y, target.z);
      filtered.lerp(scratchView, alpha);
      refreshBasis();

      // 视角中心：俯视模式跟随卫星本体，正视模式取光锥中点（卫星与星下点之间）
      goalCenter.copy(filtered);
      if (mode === 'side') {
        const altitude = Math.max(0, filtered.length() - EARTH_RADIUS_KM);
        goalCenter.addScaledVector(localUp, -altitude * 0.5);
      }
      goalCenter.add(panOffset);
      dirFromAngles(scratchDir);

      if (transitioning) {
        const elapsed = now() - transitionStart;
        const t = Math.min(1, elapsed / transitionMs);
        const eased = easeInOutCubic(t);
        center.lerpVectors(fromCenter, goalCenter, eased);
        scratchView.copy(fromDirection).lerp(scratchDir, eased);
        if (scratchView.lengthSq() < 1e-8) scratchView.copy(scratchDir);
        scratchView.normalize();
        distance = fromDistance + (targetDistance() - fromDistance) * eased;
        camera.position.copy(center).addScaledVector(scratchView, distance);
        camera.fov = BASE_FOV + (LOCK_FOV - BASE_FOV) * Math.sin(Math.PI * eased);
        camera.updateProjectionMatrix();
        if (t >= 1) {
          transitioning = false;
          applyDistanceLimits();
          camera.fov = LOCK_FOV;
          camera.updateProjectionMatrix();
          previousFiltered.copy(filtered);
        }
      } else {
        // 正视模式与自适应距离：只追随本位距离的变化（高度、模式），用户的缩放倍率始终保留
        if (mode === 'side' || adaptive) {
          distance += (targetDistance() - distance) * Math.min(1, dt * (adaptive ? 0.6 : 1.2));
        }
        center.copy(goalCenter);
        camera.position.copy(center).addScaledVector(scratchDir, distance);
      }

      // 安全网：任何情况下都不让相机钻进地球
      const radial = camera.position.length();
      if (radial < CAMERA_SAFE_RADIUS) {
        camera.position.multiplyScalar(CAMERA_SAFE_RADIUS / Math.max(radial, 1e-6));
        center.copy(camera.position).addScaledVector(scratchDir, -distance);
      }

      controls.target.copy(center);
      // 视线方向 = 相机 → 中心；拖拽期间冻结回正，松手后再慢慢转回"北朝上"
      scratchDir.copy(center).sub(camera.position);
      if (scratchDir.lengthSq() > 1e-8) {
        scratchDir.normalize();
        if (dragging) {
          if (orthogonalizeUp(frameUp, scratchDir) < 1e-4) frameUp.copy(SPIN_AXIS);
          if (orthogonalizeUp(frameUp, scratchDir) < 1e-4) frameUp.set(0, 1, 0);
          frameUp.normalize();
        } else {
          // 俯视模式以"北朝上"为基准；正视模式则以当地天顶为基准，
          // 这样画面里始终是"卫星在上、地面在下"
          stabilizeFrameUp(
            frameUp,
            scratchDir,
            dt,
            transitioning ? TRANSITION_ROLL_RATE : FOLLOW_ROLL_RATE,
            mode === 'side' ? localUp : SPIN_AXIS,
          );
        }
        camera.up.copy(frameUp);
      }
      camera.lookAt(center);
      previousFiltered.copy(filtered);
    },
  };
}
