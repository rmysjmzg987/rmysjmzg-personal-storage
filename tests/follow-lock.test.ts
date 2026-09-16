import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createFollowController } from '../src/core/followCamera';

const DEG = Math.PI / 180;

function stubControls(): OrbitControls {
  return {
    target: new THREE.Vector3(),
    minDistance: 0,
    maxDistance: 0,
    enabled: true,
  } as unknown as OrbitControls;
}

/** 700 km 高的卫星，锁定后把过渡跑完 */
function setup(desiredDistanceKm = 2400) {
  let clockMs = 0;
  const camera = new THREE.PerspectiveCamera(50, 1.2, 20, 400000);
  camera.position.set(0, -18000, 12000);
  camera.lookAt(0, 0, 0);
  const controls = stubControls();
  const follow = createFollowController({
    camera,
    controls,
    transitionMs: 16,
    viewportHeight: () => 800,
    now: () => clockMs,
  });
  const satellite = new THREE.Vector3(0, 0, 7071);
  const advance = (frames: number) => {
    for (let i = 0; i < frames; i += 1) {
      clockMs += 16;
      follow.update({ x: satellite.x, y: satellite.y, z: satellite.z }, 16);
    }
  };
  follow.lock('sat', { x: satellite.x, y: satellite.y, z: satellite.z }, desiredDistanceKm);
  advance(150);
  return { camera, controls, follow, satellite, advance };
}

const viewDirOf = (camera: THREE.PerspectiveCamera, controls: OrbitControls) =>
  camera.position.clone().sub(controls.target).normalize();

describe('锁定态取景', () => {
  it('把相机放到卫星本地天顶，卫星居中、地球在下', () => {
    const { camera, controls, satellite } = setup();
    expect(controls.target.distanceTo(satellite)).toBeLessThan(1);
    const offset = camera.position.clone().sub(controls.target);
    expect(offset.length()).toBeCloseTo(2400, 0);
    // 本地天顶就是卫星的径向
    expect(offset.clone().normalize().dot(satellite.clone().normalize())).toBeCloseTo(1, 3);
  });

  it('锁定后接管 OrbitControls，避免两套相机逻辑互相打架', () => {
    const { controls } = setup();
    expect(controls.enabled).toBe(false);
  });
});

describe('左键拖拽：绕视角中心旋转', () => {
  it('旋转时保持取景距离与中心点不变', () => {
    const { camera, controls, follow, satellite, advance } = setup();
    const before = viewDirOf(camera, controls);
    const distance = camera.position.distanceTo(controls.target);
    follow.rotateBy(120, -60);
    advance(1);
    expect(controls.target.distanceTo(satellite)).toBeLessThan(1);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(distance, 3);
    expect(viewDirOf(camera, controls).angleTo(before)).toBeGreaterThan(0.2);
  });

  it('在正上方视角横向拖拽同样有响应（不会退化失效）', () => {
    const { camera, controls, follow, advance } = setup();
    const before = viewDirOf(camera, controls);
    follow.rotateBy(80, 0);
    advance(1);
    expect(viewDirOf(camera, controls).angleTo(before)).toBeGreaterThan(0.15);
  });

  it('同一方向的连续增量可累加，不会被单次事件覆盖（抖动/方向乱变的根因）', () => {
    const step = setup();
    step.follow.rotateBy(60, 0);
    step.follow.rotateBy(60, 0);
    step.advance(1);

    const once = setup();
    once.follow.rotateBy(120, 0);
    once.advance(1);

    expect(viewDirOf(step.camera, step.controls).angleTo(viewDirOf(once.camera, once.controls))).toBeLessThan(1e-6);
  });

  it('等步长拖拽产生等角位移，方向不会忽左忽右', () => {
    const { camera, controls, follow, advance } = setup();
    const angles: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const before = viewDirOf(camera, controls);
      follow.rotateBy(30, 0);
      advance(1);
      angles.push(viewDirOf(camera, controls).angleTo(before) / DEG);
    }
    for (const angle of angles) expect(angle).toBeGreaterThan(1);
    expect(Math.max(...angles) - Math.min(...angles)).toBeLessThan(0.5);
  });

  it('同一方向上的拖拽在卫星飞过不同纬度时方向保持一致', () => {
    // 卫星沿极轨飞行，同一手势应始终把相机推向同一侧
    const steps: number[] = [];
    for (const latitudeDeg of [0, 40, 70]) {
      const lat = latitudeDeg * DEG;
      const position = new THREE.Vector3(0, 7071 * Math.cos(lat), 7071 * Math.sin(lat));
      const camera2 = new THREE.PerspectiveCamera(50, 1.2, 20, 400000);
      camera2.position.copy(position).multiplyScalar(1.4);
      camera2.lookAt(position);
      const controls2 = stubControls();
      let clockMs = 0;
      const follow2 = createFollowController({
        camera: camera2,
        controls: controls2,
        transitionMs: 16,
        viewportHeight: () => 800,
        now: () => clockMs,
      });
      const target = { x: position.x, y: position.y, z: position.z };
      follow2.lock('p', target, 2400);
      for (let i = 0; i < 150; i += 1) {
        clockMs += 16;
        follow2.update(target, 16);
      }
      const before = viewDirOf(camera2, controls2);
      follow2.rotateBy(100, 0);
      clockMs += 16;
      follow2.update(target, 16);
      const after = viewDirOf(camera2, controls2);
      // 相机相对卫星的横向位移方向（本地东向），绕地球一圈不应反号
      const localUp = position.clone().normalize();
      const east = new THREE.Vector3(0, 0, 1).cross(localUp).normalize();
      steps.push(after.clone().sub(before).dot(east));
    }
    expect(steps.every((value) => value > 0) || steps.every((value) => value < 0)).toBe(true);
    for (const value of steps) expect(Math.abs(value)).toBeGreaterThan(0.05);
  });
});

describe('右键拖拽：平移视角中心', () => {
  it('中心从卫星上挪开，取景距离基本保持', () => {
    const { camera, controls, follow, satellite, advance } = setup();
    const distance = camera.position.distanceTo(controls.target);
    follow.panBy(120, 0);
    advance(1);
    const shifted = controls.target.clone().sub(satellite).length();
    // 800px 视口、2400 km 取景、43.5° 视场角下，120px ≈ 305 km
    expect(shifted).toBeGreaterThan(200);
    expect(shifted).toBeLessThan(450);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(distance, 3);
  });

  it('平移量有上限，不会把目标推出画面', () => {
    const { controls, follow, satellite, advance } = setup();
    for (let i = 0; i < 40; i += 1) follow.panBy(200, 0);
    advance(1);
    expect(controls.target.clone().sub(satellite).length()).toBeLessThanOrEqual(2400 * 1.6 + 1);
  });
});

describe('滚轮缩放', () => {
  it('向前滚拉近、向后滚推远，且夹在范围内', () => {
    const { camera, controls, follow, advance } = setup();
    follow.zoomBy(-400);
    advance(1);
    const near = camera.position.distanceTo(controls.target);
    expect(near).toBeLessThan(2400);
    follow.zoomBy(400);
    advance(1);
    expect(camera.position.distanceTo(controls.target)).toBeGreaterThan(near);
    for (let i = 0; i < 50; i += 1) follow.zoomBy(-1000);
    advance(1);
    expect(camera.position.distanceTo(controls.target)).toBeGreaterThan(50);
  });
});

describe('正视模式滚轮缩放', () => {
  it('推远与拉近都立即生效', () => {
    const { camera, controls, follow, advance } = setup();
    follow.setViewMode('side');
    advance(150);
    const base = camera.position.distanceTo(controls.target);
    expect(follow.zoomFactor()).toBeCloseTo(1, 6);
    follow.zoomBy(500);
    advance(40);
    const far = camera.position.distanceTo(controls.target);
    expect(far).toBeGreaterThan(base * 1.5);
    follow.zoomBy(-1000);
    advance(40);
    const near = camera.position.distanceTo(controls.target);
    expect(near).toBeLessThan(far * 0.5);
    expect(near).toBeGreaterThan(50);
  });

  it('缩放后的距离不会被本位距离拉回', () => {
    const { camera, controls, follow, advance } = setup();
    follow.setViewMode('side');
    advance(150);
    follow.zoomBy(600);
    advance(2);
    const zoomed = camera.position.distanceTo(controls.target);
    // 静置数秒：若仍按本位距离收敛，这里会明显缩小
    for (let i = 0; i < 300; i += 1) advance(1);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(zoomed, 3);
  });

  it('切换取景模式与重新锁定时缩放倍率复位', () => {
    const { follow, advance } = setup();
    follow.setViewMode('side');
    advance(150);
    follow.zoomBy(600);
    expect(follow.zoomFactor()).toBeGreaterThan(1.5);
    follow.setViewMode('nadir');
    expect(follow.zoomFactor()).toBeCloseTo(1, 6);
    follow.zoomBy(600);
    follow.lock('sat2', { x: 0, y: 0, z: 7071 }, 2400);
    expect(follow.zoomFactor()).toBeCloseTo(1, 6);
  });

  it('静止轨道这类远端目标不会被推到看不见地球的距离', () => {
    let clockMs = 0;
    const camera = new THREE.PerspectiveCamera(50, 1.2, 20, 4_000_000);
    camera.position.set(0, -18000, 12000);
    const controls = stubControls();
    const follow = createFollowController({
      camera,
      controls,
      transitionMs: 16,
      viewportHeight: () => 800,
      now: () => clockMs,
    });
    // 42164 km ≈ 静止轨道半径，本位正视距离约 82300 km
    const geo = { x: 0, y: 0, z: 42164 };
    follow.lock('geo', geo, 26000);
    follow.setViewMode('side');
    const tick = (frames: number) => {
      for (let i = 0; i < frames; i += 1) {
        clockMs += 16;
        follow.update(geo, 16);
      }
    };
    tick(200);
    for (let i = 0; i < 200; i += 1) follow.zoomBy(400);
    tick(200);
    const far = camera.position.distanceTo(controls.target);
    expect(far).toBeLessThanOrEqual(90_001);
    expect(far).toBeGreaterThan(60_000);
    for (let i = 0; i < 400; i += 1) follow.zoomBy(-400);
    tick(200);
    const near = camera.position.distanceTo(controls.target);
    expect(near).toBeGreaterThanOrEqual(120);
    expect(near).toBeLessThan(5_000);
  });
});

describe('取景模式切换', () => {
  it('正视模式把中心移到光锥中点，视线接近水平', () => {
    const { camera, controls, follow, satellite, advance } = setup();
    follow.setViewMode('side');
    advance(150);
    expect(follow.viewMode()).toBe('side');
    // 700 km 轨道：光锥中点在星下点上方约 350 km
    expect(controls.target.clone().sub(satellite).length()).toBeCloseTo(350, 0);
    const localUp = satellite.clone().normalize();
    expect(Math.abs(viewDirOf(camera, controls).dot(localUp))).toBeLessThan(0.1);
    // 画面朝上必须是当地天顶，卫星才会在"上"、地面在"下"
    expect(camera.up.dot(localUp)).toBeGreaterThan(0.9);
  });

  it('切回俯视模式后相机重新回到天顶', () => {
    const { camera, controls, follow, satellite, advance } = setup();
    follow.setViewMode('side');
    advance(80);
    follow.setViewMode('nadir');
    advance(150);
    expect(controls.target.distanceTo(satellite)).toBeLessThan(1);
    expect(viewDirOf(camera, controls).dot(satellite.clone().normalize())).toBeCloseTo(1, 3);
  });

  it('切换模式会清掉右键平移的偏移', () => {
    const { controls, follow, satellite, advance } = setup();
    follow.panBy(300, 0);
    advance(1);
    expect(controls.target.clone().sub(satellite).length()).toBeGreaterThan(100);
    follow.setViewMode('side');
    advance(150);
    const expected = satellite.clone().multiplyScalar(1 - 350 / satellite.length());
    expect(controls.target.distanceTo(expected)).toBeLessThan(2);
  });

  it('解锁后交还 OrbitControls 并复位朝向基准', () => {
    const { camera, controls, follow } = setup();
    follow.setViewMode('side');
    follow.unlock();
    expect(controls.enabled).toBe(true);
    expect(follow.activeId()).toBeNull();
    expect(follow.viewMode()).toBe('nadir');
    expect(camera.up.z).toBeCloseTo(0, 6);
    expect(camera.up.y).toBeCloseTo(1, 6);
  });
});

describe('拖拽期间冻结画面回正', () => {
  it('拖拽时 up 不再自行滚转，视线始终与 up 垂直', () => {
    const { camera, controls, follow, satellite, advance } = setup();
    follow.rotateBy(200, 0);
    follow.setDragging(true);
    advance(1);
    const up = camera.up.clone();
    for (let i = 0; i < 120; i += 1) advance(1);
    expect(camera.up.angleTo(up)).toBeLessThan(1e-3);
    expect(Math.abs(camera.up.dot(viewDirOf(camera, controls)))).toBeLessThan(1e-6);
    expect(controls.target.distanceTo(satellite)).toBeLessThan(1);
  });
});
