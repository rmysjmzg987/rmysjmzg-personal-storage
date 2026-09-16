# M0–M1 地基与地球场景 · 实施计划

> **执行方式**：逐任务执行（推荐 subagent-driven-development，或本会话内联执行）；步骤用 `- [ ]` 勾选跟踪。

**Goal:** 搭起可运行的 Vite + TypeScript + three.js 工程，渲染一颗有质感、会自转的写实地球（贴图/夜面灯光/大气辉光/星空/昼夜光照/经纬网格/时间系统/画质档位），为后续轨道与拍摄范围打好底座。

**Architecture:** 场景世界坐标 = ECI 惯性系，地球网格每帧按 GMST 绕 Z 轴自转。渲染层（three）与纯数学层（frames/clock/sun/store）严格分离：纯函数全部走 Vitest 单测，渲染只在人工验收清单里检查。资源全部随仓库分发，运行时不联网。

**Tech Stack:** Vite 8.3 · TypeScript 7.0 · three 0.186 · Vitest 5.0 · satellite.js 7.1（M2 正式使用） · 原生 DOM/CSS（无框架）

**Spec:** `docs/specs/2026-09-16-satellite-orbit-viewer-design.md`

## Global Constraints

- Node ≥ 20（本机 v24.20.0），包管理用 npm。
- **1 世界单位 = 1 km**；地球平均半径 `R = 6371 km`；WGS-84 椭球长半轴 6378.137、扁率 1/298.257223563。
- 场景为 **ECI 惯性系**；地面相关物一律在 ECEF 计算后按 GMST 旋转进场景。
- **运行时零网络依赖**：贴图放 `public/textures/`、数据放 `public/data/`，全部随仓库提交。
- 不使用 React/Vue/任何 UI 框架；不引入运行时 CDN。
- 纯数学模块必须先写测试（红 → 绿 → 重构）；渲染/样式模块以人工视觉验收为准。
- 提交信息用 Conventional Commits：`feat:` / `fix:` / `docs:` / `chore:` / `test:`。
- 画质默认 `medium`，pixelRatio 上限 2。

---

## 文件结构（M0–M1 完成时的样子）

```
index.html                     # 挂载点 + 预加载样式
package.json                   # 脚本与依赖
tsconfig.json                  # 严格模式 TS 配置
vite.config.ts                 # base:'./'、vitest 配置
eslint.config.js               # 扁平配置
.prettierrc / .editorconfig
.gitignore                     # 忽略 node_modules、dist、_probe、.DS_Store
public/textures/earth-day.jpg  # NASA Blue Marble（公有领域）
public/textures/earth-night.jpg# NASA 夜间灯光（公有领域）
scripts/fetch-textures.mjs     # 可选：重新下载贴图
src/main.ts                    # 装配与主循环
src/state/store.ts             # 轻量状态容器
src/core/clock.ts              # 仿真时钟
src/core/frames.ts             # 儒略日/GMST/ECI↔ECEF↔大地坐标
src/core/sun.ts                # 太阳方向（低精度）
src/core/scene.ts              # 渲染器/相机/控制器/尺寸适配
src/core/quality.ts            # 画质档位与自适应降级
src/core/earth.ts              # 地球网格、材质、大气辉光
src/viz/starfield.ts           # 程序化星空
src/viz/graticule.ts           # 经纬网格
src/ui/hud.ts                  # HUD 骨架（模板字符串生成）
src/styles/main.css            # 深色玻璃拟态样式
tests/store.test.ts
tests/clock.test.ts
tests/frames.test.ts
tests/sun.test.ts
tests/earth-fallback.test.ts
tests/starfield.test.ts
tests/graticule.test.ts
tests/quality.test.ts
tests/hud.test.ts
```

每个文件一个明确职责：`frames/clock/sun/store/quality` 是纯逻辑（可测），`scene/earth/starfield/graticule/hud` 是渲染与 DOM（人工验收）。

---

## Task 0.1：工程脚手架

**Files:** Create `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `.gitignore`, `.prettierrc`, `.editorconfig`, `eslint.config.js`

**Interfaces:** 无（本任务是后续所有任务的前提）

- [ ] **Step 1：写 `package.json`**

```json
{
  "name": "satellite-orbit-viewer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "description": "Interactive 3D visualization of artificial satellite orbits",
  "license": "MIT",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write .",
    "fetch:textures": "node scripts/fetch-textures.mjs",
    "fetch:tle": "node scripts/fetch-tle.mjs"
  },
  "dependencies": {
    "satellite.js": "^7.1.0",
    "three": "^0.186.0"
  },
  "devDependencies": {
    "@types/three": "^0.186.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "typescript": "^7.0.0",
    "typescript-eslint": "^8.0.0",
    "vite": "^8.0.0",
    "vitest": "^5.0.0"
  }
}
```

- [ ] **Step 2：安装依赖**

Run: `npm install`
Expected: 生成 `node_modules/` 与 `package-lock.json`，无 error。（首次安装需要联网授权）

- [ ] **Step 3：写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

- [ ] **Step 4：写 `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], globals: true },
});
```

- [ ] **Step 5：写 `index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>卫星轨道可视化 · Satellite Orbit Viewer</title>
  </head>
  <body>
    <canvas id="stage"></canvas>
    <div id="hud"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6：写最小 `src/main.ts`（先只画一个球，验证链路）**

```ts
import * as THREE from 'three';

const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 10, 500000);
camera.position.set(0, -18000, 12000);
camera.lookAt(0, 0, 0);

const earth = new THREE.Mesh(
  new THREE.SphereGeometry(6371, 96, 64),
  new THREE.MeshBasicMaterial({ color: 0x2b6cb0, wireframe: true }),
);
scene.add(earth);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  earth.rotation.y += 0.002;
  renderer.render(scene, camera);
});
```

- [ ] **Step 7：写 `.gitignore` / `.prettierrc` / `.editorconfig` / `eslint.config.js`**

`.gitignore`：
```
node_modules/
dist/
_probe/
.DS_Store
*.local
```

`.prettierrc`：`{ "singleQuote": true, "printWidth": 100, "trailingComma": "all" }`

`.editorconfig`：`root = true` + `[*]` 段设置 `charset=utf-8`、`indent_style=space`、`indent_size=2`、`end_of_line=lf`、`insert_final_newline=true`

`eslint.config.js`：
```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '_probe/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
```

- [ ] **Step 8：验证**

Run: `npm run build`
Expected: `tsc --noEmit` 无报错、`vite build` 产出 `dist/`。

Run: `npm run dev`（人工）
Expected: 浏览器打开后能看到一个线框球缓慢旋转。

- [ ] **Step 9：提交**

```bash
git add -A
git commit -m "chore: scaffold vite + typescript + three.js project"
```

---

## Task 0.2：测试骨架

**Files:** Create `tests/smoke.test.ts`；Modify `package.json`（已含 test 脚本）

**Interfaces:** Consumes 无；Produces 测试运行命令 `npm test`

- [ ] **Step 1：写哨兵测试 `tests/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2：运行**

Run: `npm test`
Expected: 1 passed。

- [ ] **Step 3：提交**

```bash
git add tests/smoke.test.ts
git commit -m "test: add vitest smoke test"
```

---

## Task 0.3：状态容器 store

**Files:** Create `src/state/store.ts`, `tests/store.test.ts`

**Interfaces:**
- Produces `createStore<T extends object>(initial: T): Store<T>`，其中
  `Store<T> = { get(): Readonly<T>; set(patch: Partial<T>): void; subscribe(fn: (s: Readonly<T>) => void): () => void }`
- 后续所有 UI 与图层开关都通过它读写（M3 起大量使用）。

- [ ] **Step 1：写失败测试 `tests/store.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../src/state/store';

describe('createStore', () => {
  it('returns the initial state', () => {
    const store = createStore({ a: 1, b: 'x' });
    expect(store.get()).toEqual({ a: 1, b: 'x' });
  });

  it('merges patches and notifies subscribers once per set', () => {
    const store = createStore({ a: 1, b: 'x' });
    const spy = vi.fn();
    store.subscribe(spy);
    store.set({ a: 2 });
    expect(store.get().a).toBe(2);
    expect(store.get().b).toBe('x');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ a: 2, b: 'x' });
  });

  it('stops notifying after unsubscribe', () => {
    const store = createStore({ a: 1 });
    const spy = vi.fn();
    const off = store.subscribe(spy);
    off();
    store.set({ a: 3 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('replaces the state object identity so React-free UI can diff by reference', () => {
    const store = createStore({ a: 1 });
    const before = store.get();
    store.set({ a: 2 });
    expect(store.get()).not.toBe(before);
  });
});
```

- [ ] **Step 2：运行确认失败**

Run: `npm test -- store`
Expected: FAIL（找不到模块 `../src/state/store`）。

- [ ] **Step 3：实现 `src/state/store.ts`**

```ts
export interface Store<T extends object> {
  get(): Readonly<T>;
  set(patch: Partial<T>): void;
  subscribe(fn: (state: Readonly<T>) => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state: T = { ...initial };
  const listeners = new Set<(state: Readonly<T>) => void>();

  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      for (const fn of listeners) fn(state);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
```

- [ ] **Step 4：运行确认通过**

Run: `npm test -- store`
Expected: 4 passed。

- [ ] **Step 5：提交**

```bash
git add src/state/store.ts tests/store.test.ts
git commit -m "feat: add minimal observable store"
```

---

## Task 0.4：仿真时钟 clock

**Files:** Create `src/core/clock.ts`, `tests/clock.test.ts`

**Interfaces:**
- Produces `createClock(initialRate = 1): SimClock`，其中

```ts
export interface SimClock {
  now(): Date;                     // 仿真时刻
  setTime(date: Date): void;
  resetToNow(): void;              // 回到设备当前时间
  isPlaying(): boolean;
  setPlaying(playing: boolean): void;
  rate(): number;                  // 时间倍率，>= 0
  setRate(rate: number): void;
  tick(realDeltaMs: number): void; // 由渲染循环每帧调用
}
```
- 后续 M2 的传播、M4 的条带都读它；`resetToNow()` 是"按本机时间真实定位"的执行点（D3）。

- [ ] **Step 1：写失败测试 `tests/clock.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createClock } from '../src/core/clock';

const T0 = new Date('2026-09-16T00:00:00.000Z');

describe('createClock', () => {
  it('starts at the given time and rate 1', () => {
    const clock = createClock({ startAt: T0 });
    expect(clock.now().toISOString()).toBe(T0.toISOString());
    expect(clock.rate()).toBe(1);
    expect(clock.isPlaying()).toBe(true);
  });

  it('advances by real delta times rate', () => {
    const clock = createClock({ startAt: T0, rate: 60 });
    clock.tick(16.7);
    expect(clock.now().getTime() - T0.getTime()).toBeCloseTo(16.7 * 60, 3);
  });

  it('does not advance while paused', () => {
    const clock = createClock({ startAt: T0, rate: 600 });
    clock.setPlaying(false);
    clock.tick(1000);
    expect(clock.now().getTime()).toBe(T0.getTime());
  });

  it('rejects negative rates', () => {
    const clock = createClock({ startAt: T0 });
    expect(() => clock.setRate(-1)).toThrow();
  });

  it('resets to device time', () => {
    const clock = createClock({ startAt: T0 });
    clock.resetToNow();
    expect(Math.abs(clock.now().getTime() - Date.now())).toBeLessThan(1000);
  });
});
```

- [ ] **Step 2：运行确认失败**

Run: `npm test -- clock`
Expected: FAIL（模块不存在）。

- [ ] **Step 3：实现 `src/core/clock.ts`**

```ts
export interface SimClockOptions {
  startAt?: Date;
  rate?: number;
  playing?: boolean;
}

export interface SimClock {
  now(): Date;
  setTime(date: Date): void;
  resetToNow(): void;
  isPlaying(): boolean;
  setPlaying(playing: boolean): void;
  rate(): number;
  setRate(rate: number): void;
  tick(realDeltaMs: number): void;
}

export function createClock(options: SimClockOptions = {}): SimClock {
  const startAt = options.startAt ?? new Date();
  let simMs = startAt.getTime();
  let rate = options.rate ?? 1;
  let playing = options.playing ?? true;

  return {
    now: () => new Date(simMs),
    setTime: (date) => {
      simMs = date.getTime();
    },
    resetToNow: () => {
      simMs = Date.now();
    },
    isPlaying: () => playing,
    setPlaying: (value) => {
      playing = value;
    },
    rate: () => rate,
    setRate: (value) => {
      if (!Number.isFinite(value) || value < 0) throw new Error('rate must be >= 0');
      rate = value;
    },
    tick: (realDeltaMs) => {
      if (!playing) return;
      simMs += realDeltaMs * rate;
    },
  };
}
```

- [ ] **Step 4：运行确认通过**

Run: `npm test -- clock`
Expected: 5 passed。

- [ ] **Step 5：提交**

```bash
git add src/core/clock.ts tests/clock.test.ts
git commit -m "feat: add simulation clock with playback rate"
```

---

## Task 1.1：坐标系与时间 frames（纯数学，TDD）

**Files:** Create `src/core/frames.ts`, `tests/frames.test.ts`

**Interfaces:**
```ts
export interface Vec3 { x: number; y: number; z: number }
export const EARTH_RADIUS_KM = 6371;
export const WGS84_A_KM = 6378.137;
export const WGS84_F = 1 / 298.257223563;
export function julianDate(date: Date): number;
export function gmstRadians(jd: number): number;          // IAU-82，弧度
export function eciToEcef(v: Vec3, gmstRad: number): Vec3;
export function ecefToGeodetic(v: Vec3): { latDeg: number; lonDeg: number; altKm: number };
export function rotateZ(v: Vec3, angleRad: number): Vec3;
```

- [ ] **Step 1：写失败测试 `tests/frames.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { julianDate, gmstRadians, eciToEcef, ecefToGeodetic, rotateZ } from '../src/core/frames';

describe('julianDate', () => {
  it('maps J2000.0 epoch', () => {
    expect(julianDate(new Date('2000-01-01T12:00:00.000Z'))).toBeCloseTo(2451545.0, 9);
  });
});

describe('gmstRadians', () => {
  it('matches the J2000.0 value (280.46061837 deg)', () => {
    expect(gmstRadians(2451545.0)).toBeCloseTo(4.894961212735792, 9);
  });
  it('advances ~360.9856 deg per solar day', () => {
    const a = gmstRadians(2451545.0);
    const b = gmstRadians(2451546.0);
    const delta = ((b - a) * 180) / Math.PI + 360;
    expect(delta % 360).toBeCloseTo(0.9856, 2);
  });
});

describe('eciToEcef', () => {
  it('is the inverse of rotating by +gmst', () => {
    const v = { x: 7000, y: -1200, z: 300 };
    const g = 1.234;
    const ecef = eciToEcef(v, g);
    const back = rotateZ(ecef, g);
    expect(back.x).toBeCloseTo(v.x, 9);
    expect(back.y).toBeCloseTo(v.y, 9);
    expect(back.z).toBeCloseTo(v.z, 9);
  });
});

describe('ecefToGeodetic', () => {
  it('maps the equatorial point', () => {
    const r = ecefToGeodetic({ x: 6378.137, y: 0, z: 0 });
    expect(r.latDeg).toBeCloseTo(0, 9);
    expect(r.lonDeg).toBeCloseTo(0, 9);
    expect(r.altKm).toBeCloseTo(0, 6);
  });
  it('maps the north pole', () => {
    const r = ecefToGeodetic({ x: 0, y: 0, z: 6356.7523142 });
    expect(r.latDeg).toBeCloseTo(90, 6);
    expect(r.altKm).toBeCloseTo(0, 3);
  });
  it('recovers an altitude above the equator', () => {
    const r = ecefToGeodetic({ x: 6378.137 + 400, y: 0, z: 0 });
    expect(r.altKm).toBeCloseTo(400, 3);
  });
});
```

- [ ] **Step 2：运行确认失败**

Run: `npm test -- frames`
Expected: FAIL（模块不存在）。

- [ ] **Step 3：实现 `src/core/frames.ts`**

```ts
export interface Vec3 { x: number; y: number; z: number }

export const EARTH_RADIUS_KM = 6371;
export const WGS84_A_KM = 6378.137;
export const WGS84_F = 1 / 298.257223563;
const DEG = Math.PI / 180;

export function julianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

export function gmstRadians(jd: number): number {
  const t = (jd - 2451545.0) / 36525;
  const seconds =
    67310.54841 + (876600 * 3600 + 8640184.812866) * t + 0.093104 * t * t - 6.2e-6 * t * t * t;
  const wrapped = ((seconds % 86400) + 86400) % 86400;
  return (((wrapped / 240) % 360) + 360) % 360 * DEG;
}

export function rotateZ(v: Vec3, angleRad: number): Vec3 {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
}

export function eciToEcef(v: Vec3, gmstRad: number): Vec3 {
  const c = Math.cos(gmstRad);
  const s = Math.sin(gmstRad);
  return { x: v.x * c + v.y * s, y: -v.x * s + v.y * c, z: v.z };
}

export function ecefToGeodetic(v: Vec3): { latDeg: number; lonDeg: number; altKm: number } {
  const a = WGS84_A_KM;
  const f = WGS84_F;
  const e2 = f * (2 - f);
  const b = a * (1 - f);
  const ep2 = (a * a - b * b) / (b * b);
  const p = Math.hypot(v.x, v.y);
  const lon = Math.atan2(v.y, v.x);
  const theta = Math.atan2(v.z * a, p * b);
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  const lat = Math.atan2(v.z + ep2 * b * sinT * sinT * sinT, p - e2 * a * cosT * cosT * cosT);
  const sinLat = Math.sin(lat);
  const n = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const alt = Math.abs(Math.cos(lat)) > 1e-9 ? p / Math.cos(lat) - n : Math.abs(v.z) - b;
  return { latDeg: lat / DEG, lonDeg: lon / DEG, altKm: alt };
}
```

- [ ] **Step 4：运行确认通过**

Run: `npm test -- frames`
Expected: 7 passed。（若 `gmstRadians` 精度不足，检查 240 秒/度 的换算）

- [ ] **Step 5：提交**

```bash
git add src/core/frames.ts tests/frames.test.ts
git commit -m "feat: add time and coordinate frame math (julian date, GMST, ECEF, geodetic)"
```

---

## Task 1.2：渲染场景 scene

**Files:** Create `src/core/scene.ts`

**Interfaces:**
```ts
export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  resize(width: number, height: number): void;
  render(): void;
}
export function createSceneContext(canvas: HTMLCanvasElement): SceneContext;
```

- [ ] **Step 1：实现 `src/core/scene.ts`**

```ts
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  resize(width: number, height: number): void;
  render(): void;
}

export function createSceneContext(canvas: HTMLCanvasElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    logarithmicDepthBuffer: true, // 半径 6371 与 GEO 42164 同时在场时的深度精度
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x05070f, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 10, 400000);
  camera.position.set(0, -18000, 12000);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.8;
  controls.minDistance = 6600;   // 不允许穿进地球内部
  controls.maxDistance = 300000;

  return {
    renderer,
    scene,
    camera,
    controls,
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    },
    render() {
      controls.update();
      renderer.render(scene, camera);
    },
  };
}
```

- [ ] **Step 2：人工验证**

Run: `npm run dev`
Expected: 页面为深空底色，无报错；鼠标可拖拽旋转视角（此刻还没有地球模型，属正常）。

- [ ] **Step 3：提交**

```bash
git add src/core/scene.ts
git commit -m "feat: add renderer, camera and controls context"
```

---

## Task 1.3：地球贴图加载与兜底（TDD 纯函数部分）

**Files:** Create `src/core/earth-texture.ts`, `tests/earth-fallback.test.ts`, `scripts/fetch-textures.mjs`

**Interfaces:**
```ts
export async function resolveTextureUrl(url: string): Promise<string | null>; // 404/网络失败返回 null
export function generateFallbackPixels(width: number, height: number): Uint8Array; // RGBA
export const FALLBACK_OCEAN: [number, number, number];
```

- [ ] **Step 1：写失败测试 `tests/earth-fallback.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { generateFallbackPixels } from '../src/core/earth-texture';

describe('generateFallbackPixels', () => {
  const w = 64;
  const h = 32;
  const px = generateFallbackPixels(w, h);

  it('produces RGBA bytes for every texel', () => {
    expect(px.length).toBe(w * h * 4);
  });

  it('paints poles light and oceans blue', () => {
    const top = (0 * w + 32) * 4;
    const middle = (16 * w + 32) * 4;
    expect(px[top]).toBeGreaterThan(200);            // 极地偏白
    expect(px[middle + 2]).toBeGreaterThan(px[middle]); // 海洋偏蓝
  });

  it('is deterministic', () => {
    expect(Array.from(generateFallbackPixels(w, h))).toEqual(Array.from(px));
  });
});
```

- [ ] **Step 2：运行确认失败**

Run: `npm test -- earth-fallback`
Expected: FAIL（模块不存在）。

- [ ] **Step 3：实现 `src/core/earth-texture.ts`**

```ts
export const FALLBACK_OCEAN: [number, number, number] = [16, 42, 82];
export const FALLBACK_GRID: [number, number, number] = [96, 148, 196];
export const FALLBACK_POLE: [number, number, number] = [232, 240, 248];

export async function resolveTextureUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok ? url : null;
  } catch {
    return null;
  }
}

export function generateFallbackPixels(width: number, height: number): Uint8Array {
  const px = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    const polar = Math.abs(v - 0.5) * 2; // 0 赤道 → 1 极点
    for (let x = 0; x < width; x++) {
      const onGridRow = Math.abs((v * 12) % 1) < 0.02 || Math.abs((v * 12) % 1) > 0.98;
      const onGridCol = Math.abs(((x / width) * 24) % 1) < 0.02 || Math.abs(((x / width) * 24) % 1) > 0.98;
      const color = polar > 0.86 ? FALLBACK_POLE : onGridRow || onGridCol ? FALLBACK_GRID : FALLBACK_OCEAN;
      const i = (y * width + x) * 4;
      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = 255;
    }
  }
  return px;
}
```

- [ ] **Step 4：运行确认通过**

Run: `npm test -- earth-fallback`
Expected: 3 passed。

- [ ] **Step 5：写贴图下载脚本 `scripts/fetch-textures.mjs`**

```js
import { mkdir, writeFile } from 'node:fs/promises';

const SOURCES = [
  {
    file: 'public/textures/earth-day.jpg',
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57752/land_shallow_topo_2048.jpg',
  },
  {
    file: 'public/textures/earth-night.jpg',
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/55000/55167/earth_lights_lrg.jpg',
  },
];

await mkdir('public/textures', { recursive: true });
for (const { file, url } of SOURCES) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed ${url}: ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  console.log(`saved ${file}`);
}
```

- [ ] **Step 6：下载贴图**

Run: `npm run fetch:textures`（需要联网授权）
Expected: `public/textures/earth-day.jpg`（约 1–2 MB）与 `earth-night.jpg` 生成。

注：两张图均来自 NASA 官方影像库（公有领域），需在 README 注明来源；下载失败时程序会自动退化为 `generateFallbackPixels` 生成的条纹球，功能不受阻。

- [ ] **Step 7：提交**

```bash
git add src/core/earth-texture.ts tests/earth-fallback.test.ts scripts/fetch-textures.mjs public/textures
git commit -m "feat: add earth texture resolution with procedural fallback"
```

---

## Task 1.4：太阳方向 sun（TDD）

**Files:** Create `src/core/sun.ts`, `tests/sun.test.ts`

**Interfaces:**
```ts
export function sunDirectionEci(date: Date): Vec3;   // 单位向量，ECI
export function sunDeclinationDeg(date: Date): number;
```

- [ ] **Step 1：写失败测试 `tests/sun.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { sunDirectionEci, sunDeclinationDeg } from '../src/core/sun';

describe('sun', () => {
  it('returns a unit vector', () => {
    const v = sunDirectionEci(new Date('2026-09-16T00:00:00.000Z'));
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 9);
  });

  it('is near zero declination at the March equinox', () => {
    expect(Math.abs(sunDeclinationDeg(new Date('2026-03-20T14:46:00.000Z')))).toBeLessThan(0.3);
  });

  it('reaches about +23.4 deg at the June solstice', () => {
    const dec = sunDeclinationDeg(new Date('2026-06-21T08:25:00.000Z'));
    expect(dec).toBeGreaterThan(23.2);
    expect(dec).toBeLessThan(23.6);
  });

  it('is about -23.4 deg at the December solstice', () => {
    const dec = sunDeclinationDeg(new Date('2026-12-21T20:50:00.000Z'));
    expect(dec).toBeLessThan(-23.2);
    expect(dec).toBeGreaterThan(-23.6);
  });
});
```

- [ ] **Step 2：运行确认失败**

Run: `npm test -- sun`
Expected: FAIL。

- [ ] **Step 3：实现 `src/core/sun.ts`**

```ts
import { julianDate, type Vec3 } from './frames';

const DEG = Math.PI / 180;
const OBLIQUITY_DEG = 23.439;

function eclipticLongitudeDeg(date: Date): number {
  const n = julianDate(date) - 2451545.0;
  const meanLongitude = 280.46 + 0.9856474 * n;
  const meanAnomaly = (357.528 + 0.9856003 * n) * DEG;
  return meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly);
}

export function sunDeclinationDeg(date: Date): number {
  const lambda = eclipticLongitudeDeg(date) * DEG;
  const eps = OBLIQUITY_DEG * DEG;
  return Math.asin(Math.sin(eps) * Math.sin(lambda)) / DEG;
}

export function sunDirectionEci(date: Date): Vec3 {
  const lambda = eclipticLongitudeDeg(date) * DEG;
  const eps = OBLIQUITY_DEG * DEG;
  return {
    x: Math.cos(lambda),
    y: Math.cos(eps) * Math.sin(lambda),
    z: Math.sin(eps) * Math.sin(lambda),
  };
}
```

- [ ] **Step 4：运行确认通过**

Run: `npm test -- sun`
Expected: 4 passed。

- [ ] **Step 5：提交**

```bash
git add src/core/sun.ts tests/sun.test.ts
git commit -m "feat: add low-precision sun direction for day/night shading"
```

---

## Task 1.5：地球网格、昼夜材质与大气辉光

**Files:** Create `src/core/earth.ts`

**Interfaces:**
```ts
export interface EarthHandles {
  group: THREE.Group;
  update(params: { gmstRad: number; sunDirEci: Vec3; atmosphere: boolean }): void;
  dispose(): void;
}
export function createEarth(opts: { dayUrl: string | null; nightUrl: string | null }): EarthHandles;
```

- [ ] **Step 1：实现 `src/core/earth.ts`**

要点：地球用自定义 ShaderMaterial 做昼夜混合（夜面显示灯光贴图），大气用略大的球 + 背面 + 边缘 Fresnel 加色。贴图为 `null` 时用 `generateFallbackPixels` 生成 DataTexture。

```ts
import * as THREE from 'three';
import { EARTH_RADIUS_KM, type Vec3 } from './frames';
import { generateFallbackPixels } from './earth-texture';

const EARTH_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const EARTH_FRAGMENT = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDir;
  uniform float hasNight;
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    float d = dot(normalize(vNormalW), normalize(sunDir));
    float dayMix = smoothstep(-0.12, 0.12, d);
    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = hasNight > 0.5 ? texture2D(nightMap, vUv).rgb * 1.35 : day * 0.06;
    gl_FragColor = vec4(mix(night, day, dayMix), 1.0);
  }
`;

const ATMOS_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ATMOS_FRAGMENT = /* glsl */ `
  uniform vec3 glowColor;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vPosW);
    float rim = pow(1.0 - abs(dot(normalize(vNormalW), viewDir)), 2.6);
    gl_FragColor = vec4(glowColor * rim * 1.6, rim * 0.85);
  }
`;

function fallbackDataTexture(): THREE.DataTexture {
  const width = 512;
  const height = 256;
  const tex = new THREE.DataTexture(generateFallbackPixels(width, height), width, height);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export interface EarthHandles {
  group: THREE.Group;
  update(params: { gmstRad: number; sunDirEci: Vec3; atmosphere: boolean }): void;
  dispose(): void;
}

export function createEarth(opts: { dayUrl: string | null; nightUrl: string | null }): EarthHandles {
  const loader = new THREE.TextureLoader();
  const dayMap = opts.dayUrl ? loader.load(opts.dayUrl) : fallbackDataTexture();
  const nightMap = opts.nightUrl ? loader.load(opts.nightUrl) : fallbackDataTexture();
  if (opts.dayUrl) dayMap.colorSpace = THREE.SRGBColorSpace;

  const uniforms = {
    dayMap: { value: dayMap },
    nightMap: { value: nightMap },
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
    hasNight: { value: opts.nightUrl ? 1 : 0 },
  };

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS_KM, 160, 96),
    new THREE.ShaderMaterial({ uniforms, vertexShader: EARTH_VERTEX, fragmentShader: EARTH_FRAGMENT }),
  );

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS_KM * 1.02, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: { glowColor: { value: new THREE.Color(0x4aa8ff) } },
      vertexShader: ATMOS_VERTEX,
      fragmentShader: ATMOS_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );

  const group = new THREE.Group();
  group.add(earth, atmosphere);

  return {
    group,
    update({ gmstRad, sunDirEci, atmosphere: showAtmosphere }) {
      earth.rotation.y = gmstRad;               // 地球随 GMST 自转
      atmosphere.rotation.y = gmstRad;
      atmosphere.visible = showAtmosphere;
      (uniforms.sunDir.value as THREE.Vector3).set(sunDirEci.x, sunDirEci.y, sunDirEci.z);
    },
    dispose() {
      earth.geometry.dispose();
      atmosphere.geometry.dispose();
      (earth.material as THREE.Material).dispose();
      (atmosphere.material as THREE.Material).dispose();
      dayMap.dispose();
      nightMap.dispose();
    },
  };
}
```

- [ ] **Step 2：人工验证**

Run: `npm run dev`
Expected: 能看到明亮/暗面分明的地球；转动角度时大气边缘出现蓝色辉光；缺贴图时不报错（显示条纹球）。

- [ ] **Step 3：提交**

```bash
git add src/core/earth.ts
git commit -m "feat: add earth mesh with day/night shader and atmosphere glow"
```

---

## Task 1.6：程序化星空

**Files:** Create `src/viz/starfield.ts`, `tests/starfield.test.ts`

**Interfaces:**
```ts
export function randomSpherePoints(count: number, radius: number, seed?: number): Float32Array;
export function createStarfield(starCount: number, radiusKm?: number): THREE.Points;
```

- [ ] **Step 1：写失败测试 `tests/starfield.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { randomSpherePoints } from '../src/viz/starfield';

describe('randomSpherePoints', () => {
  const radius = 300000;
  const pts = randomSpherePoints(500, radius, 7);

  it('returns 3 floats per star', () => {
    expect(pts.length).toBe(500 * 3);
  });

  it('places every star on the sphere', () => {
    for (let i = 0; i < pts.length; i += 3) {
      expect(Math.hypot(pts[i], pts[i + 1], pts[i + 2])).toBeCloseTo(radius, 3);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(Array.from(randomSpherePoints(50, radius, 7))).toEqual(Array.from(randomSpherePoints(50, radius, 7)));
    expect(Array.from(randomSpherePoints(50, radius, 8))).not.toEqual(Array.from(randomSpherePoints(50, radius, 7)));
  });
});
```

- [ ] **Step 2：运行确认失败** → Run: `npm test -- starfield`，Expected: FAIL。

- [ ] **Step 3：实现 `src/viz/starfield.ts`**

```ts
import * as THREE from 'three';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSpherePoints(count: number, radius: number, seed = 1): Float32Array {
  const rng = mulberry32(seed);
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rng() * 2 - 1;          // 均匀分布：先取 z，再取方位角
    const phi = rng() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    out[i * 3] = radius * s * Math.cos(phi);
    out[i * 3 + 1] = radius * s * Math.sin(phi);
    out[i * 3 + 2] = radius * u;
  }
  return out;
}

export function createStarfield(starCount: number, radiusKm = 300000): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(randomSpherePoints(starCount, radiusKm), 3));
  const material = new THREE.PointsMaterial({
    color: 0xdfe9ff,
    size: 1.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}
```

- [ ] **Step 4：运行确认通过** → Run: `npm test -- starfield`，Expected: 3 passed。

- [ ] **Step 5：提交**

```bash
git add src/viz/starfield.ts tests/starfield.test.ts
git commit -m "feat: add procedural starfield"
```

---

## Task 1.7：经纬网格

**Files:** Create `src/viz/graticule.ts`, `tests/graticule.test.ts`

**Interfaces:**
```ts
export function graticuleSegments(radiusKm: number, stepDeg?: number, samples?: number): Float32Array;
export function createGraticule(radiusKm: number): THREE.LineSegments;
```

- [ ] **Step 1：写失败测试 `tests/graticule.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { graticuleSegments } from '../src/viz/graticule';

describe('graticuleSegments', () => {
  const radius = 6371 * 1.001;
  const seg = graticuleSegments(radius, 15, 72);

  it('emits whole segments (6 floats each)', () => {
    expect(seg.length % 6).toBe(0);
    expect(seg.length).toBeGreaterThan(0);
  });

  it('keeps every vertex on the sphere', () => {
    for (let i = 0; i < seg.length; i += 3) {
      expect(Math.hypot(seg[i], seg[i + 1], seg[i + 2])).toBeCloseTo(radius, 3);
    }
  });
});
```

- [ ] **Step 2：运行确认失败** → Run: `npm test -- graticule`，Expected: FAIL。

- [ ] **Step 3：实现 `src/viz/graticule.ts`**

```ts
import * as THREE from 'three';

const DEG = Math.PI / 180;

export function graticuleSegments(radiusKm: number, stepDeg = 15, samples = 120): Float32Array {
  const verts: number[] = [];
  const push = (latDeg: number, lonDeg: number) => {
    const lat = latDeg * DEG;
    const lon = lonDeg * DEG;
    verts.push(radiusKm * Math.cos(lat) * Math.cos(lon), radiusKm * Math.cos(lat) * Math.sin(lon), radiusKm * Math.sin(lat));
  };

  for (let lat = -90 + stepDeg; lat < 90; lat += stepDeg) {          // 纬线
    for (let i = 0; i < samples; i++) {
      const lon0 = (360 / samples) * i;
      const lon1 = (360 / samples) * (i + 1);
      push(lat, lon0);
      push(lat, lon1);
    }
  }
  for (let lon = 0; lon < 360; lon += stepDeg) {                     // 经线
    for (let i = 0; i < samples / 2; i++) {
      const lat0 = -90 + (180 / (samples / 2)) * i;
      const lat1 = -90 + (180 / (samples / 2)) * (i + 1);
      push(lat0, lon);
      push(lat1, lon);
    }
  }
  return new Float32Array(verts);
}

export function createGraticule(radiusKm: number): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(graticuleSegments(radiusKm), 3));
  const material = new THREE.LineBasicMaterial({ color: 0x2f6f9f, transparent: true, opacity: 0.35 });
  return new THREE.LineSegments(geometry, material);
}
```

- [ ] **Step 4：运行确认通过** → Run: `npm test -- graticule`，Expected: 2 passed。

- [ ] **Step 5：提交**

```bash
git add src/viz/graticule.ts tests/graticule.test.ts
git commit -m "feat: add lat/lon graticule"
```

---

## Task 1.8：画质档位与自适应降级

**Files:** Create `src/core/quality.ts`, `tests/quality.test.ts`

**Interfaces:**

```ts
export type QualityLevel = 'low' | 'medium' | 'high';
export interface QualitySettings {
  pixelRatioCap: number; bloom: boolean; atmosphere: boolean; starCount: number; segments: number;
}
export function qualitySettings(level: QualityLevel): QualitySettings;
export function createFpsSampler(windowMs: number): { push(deltaMs: number): void; fps(): number; reset(): void };
export function shouldDowngrade(fps: number, lowFpsMs: number, msSinceLastDowngrade: number): boolean;
export function nextLowerLevel(level: QualityLevel): QualityLevel | null;
```

- [ ] **Step 1：写失败测试 `tests/quality.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { qualitySettings, createFpsSampler, shouldDowngrade, nextLowerLevel } from '../src/core/quality';

describe('qualitySettings', () => {
  it('disables heavy features on low', () => {
    const low = qualitySettings('low');
    expect(low.bloom).toBe(false);
    expect(low.atmosphere).toBe(false);
  });
  it('scales star count with level', () => {
    expect(qualitySettings('low').starCount).toBeLessThan(qualitySettings('high').starCount);
  });
});

describe('createFpsSampler', () => {
  it('reports about 60 fps for 16.7 ms frames', () => {
    const sampler = createFpsSampler(1000);
    for (let i = 0; i < 60; i++) sampler.push(16.7);
    expect(sampler.fps()).toBeGreaterThan(55);
    expect(sampler.fps()).toBeLessThan(65);
  });
  it('forgets frames older than the window', () => {
    const sampler = createFpsSampler(500);
    sampler.push(16.7);
    sampler.push(900);
    expect(sampler.fps()).toBeLessThan(20);
  });
});

describe('shouldDowngrade', () => {
  it('requires sustained low fps', () => {
    expect(shouldDowngrade(20, 1000, 99999)).toBe(false);
    expect(shouldDowngrade(20, 2500, 99999)).toBe(true);
  });
  it('ignores healthy fps', () => {
    expect(shouldDowngrade(58, 5000, 99999)).toBe(false);
  });
  it('respects the cooldown after a downgrade', () => {
    expect(shouldDowngrade(20, 5000, 3000)).toBe(false);
  });
});

describe('nextLowerLevel', () => {
  it('walks high to medium to low to null', () => {
    expect(nextLowerLevel('high')).toBe('medium');
    expect(nextLowerLevel('medium')).toBe('low');
    expect(nextLowerLevel('low')).toBeNull();
  });
});
```

- [ ] **Step 2：运行确认失败**

Run: `npm test -- quality`
Expected: FAIL（模块不存在）。

- [ ] **Step 3：实现 `src/core/quality.ts`**

```ts
export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualitySettings {
  pixelRatioCap: number;
  bloom: boolean;
  atmosphere: boolean;
  starCount: number;
  segments: number;
}

const PRESETS: Record<QualityLevel, QualitySettings> = {
  low: { pixelRatioCap: 1, bloom: false, atmosphere: false, starCount: 2500, segments: 48 },
  medium: { pixelRatioCap: 1.5, bloom: true, atmosphere: true, starCount: 6000, segments: 72 },
  high: { pixelRatioCap: 2, bloom: true, atmosphere: true, starCount: 12000, segments: 96 },
};

export function qualitySettings(level: QualityLevel): QualitySettings {
  return PRESETS[level];
}

export function nextLowerLevel(level: QualityLevel): QualityLevel | null {
  if (level === 'high') return 'medium';
  if (level === 'medium') return 'low';
  return null;
}

export function createFpsSampler(windowMs: number): {
  push(deltaMs: number): void;
  fps(): number;
  reset(): void;
} {
  const frames: { at: number; dt: number }[] = [];
  let clock = 0;
  return {
    push(deltaMs) {
      clock += deltaMs;
      frames.push({ at: clock, dt: deltaMs });
      while (frames.length && clock - frames[0].at > windowMs) frames.shift();
    },
    fps() {
      if (!frames.length) return 0;
      const total = frames.reduce((sum, f) => sum + f.dt, 0);
      return total > 0 ? (frames.length * 1000) / total : 0;
    },
    reset() {
      frames.length = 0;
      clock = 0;
    },
  };
}

export function shouldDowngrade(fps: number, lowFpsMs: number, msSinceLastDowngrade: number): boolean {
  return fps < 30 && lowFpsMs >= 2000 && msSinceLastDowngrade >= 10000;
}
```

- [ ] **Step 4：运行确认通过**

Run: `npm test -- quality`
Expected: 7 passed。

- [ ] **Step 5：提交**

```bash
git add src/core/quality.ts tests/quality.test.ts
git commit -m "feat: add quality presets and adaptive downgrade heuristics"
```

---

## Task 1.9：HUD 骨架与样式

**Files:** Create `src/ui/hud.ts`, `src/styles/main.css`, `tests/hud.test.ts`

**Interfaces:**

```ts
export interface HudState {
  simTimeIso: string;
  playing: boolean;
  rate: number;
  fps: number;
  snapshotDate: string;
  quality: 'low' | 'medium' | 'high';
  lang: 'zh' | 'en';
}
export function renderHudMarkup(state: HudState): string;
export function mountHud(root: HTMLElement, getState: () => HudState): { refresh(): void };
```

- [ ] **Step 1：写失败测试 `tests/hud.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { renderHudMarkup } from '../src/ui/hud';

const state = {
  simTimeIso: '2026-09-16T04:00:00.000Z',
  playing: true,
  rate: 60,
  fps: 58,
  snapshotDate: '2026-09-16',
  quality: 'medium' as const,
  lang: 'zh' as const,
};

describe('renderHudMarkup', () => {
  it('shows the simulation time and rate', () => {
    const html = renderHudMarkup(state);
    expect(html).toContain('04:00');
    expect(html).toContain('60');
  });

  it('shows the data snapshot notice', () => {
    expect(renderHudMarkup(state)).toContain('数据快照：2026-09-16');
  });

  it('switches to English copy when lang is en', () => {
    expect(renderHudMarkup({ ...state, lang: 'en' })).toContain('Data snapshot: 2026-09-16');
  });

  it('marks paused state', () => {
    expect(renderHudMarkup({ ...state, playing: false })).toContain('已暂停');
  });
});
```

- [ ] **Step 2：运行确认失败**

Run: `npm test -- hud`
Expected: FAIL（模块不存在）。

- [ ] **Step 3：实现 `src/ui/hud.ts`**

```ts
export interface HudState {
  simTimeIso: string;
  playing: boolean;
  rate: number;
  fps: number;
  snapshotDate: string;
  quality: 'low' | 'medium' | 'high';
  lang: 'zh' | 'en';
}

const COPY = {
  zh: {
    title: '卫星轨道可视化',
    snapshot: (d: string) => `数据快照：${d} · 位置按本机时间实时计算`,
    paused: '已暂停',
  },
  en: {
    title: 'Satellite Orbit Viewer',
    snapshot: (d: string) => `Data snapshot: ${d} · positions computed from local time`,
    paused: 'Paused',
  },
} as const;

export function renderHudMarkup(state: HudState): string {
  const copy = COPY[state.lang];
  const time = state.simTimeIso.slice(11, 19);
  const rate = state.playing ? `x${state.rate}` : copy.paused;
  const parts = [
    '<div class="hud-top">',
    `<span class="hud-brand">${copy.title}</span>`,
    `<span class="hud-clock" data-role="clock">${time} UTC</span>`,
    `<span class="hud-rate" data-role="rate">${rate}</span>`,
    `<span class="hud-fps" data-role="fps">${Math.round(state.fps)} fps</span>`,
    `<span class="hud-quality" data-role="quality">${state.quality}</span>`,
    '</div>',
    `<div class="hud-note" data-role="snapshot">${copy.snapshot(state.snapshotDate)}</div>`,
  ];
  return parts.join('');
}

export function mountHud(root: HTMLElement, getState: () => HudState): { refresh(): void } {
  const refresh = () => {
    root.innerHTML = renderHudMarkup(getState());
  };
  refresh();
  return { refresh };
}
```

- [ ] **Step 4：写 `src/styles/main.css`**

要点（逐条落地）：
1. `html, body { margin: 0; height: 100%; overflow: hidden; background: #05070f; color: #dbe6f5; }`
2. `#stage { position: fixed; inset: 0; display: block; }`
3. `#hud { position: fixed; inset: 0; pointer-events: none; font-family: system-ui, "PingFang SC", "Microsoft YaHei", sans-serif; }`
4. `.hud-top`：顶部居中横条，`display:flex; gap:16px; align-items:center;`，`background: rgba(10,16,30,.55); backdrop-filter: blur(10px); border:1px solid rgba(120,170,255,.18); border-radius: 999px; padding: 8px 18px; font-size: 13px;`
5. `.hud-clock`：等宽字体 `ui-monospace, monospace`，字距 `letter-spacing:.06em`。
6. `.hud-note`：底部居中，`font-size:12px; opacity:.62;`
7. 后续所有可点击控件必须单独加 `pointer-events: auto;`

- [ ] **Step 5：运行确认通过**

Run: `npm test -- hud`
Expected: 4 passed。

- [ ] **Step 6：提交**

```bash
git add src/ui/hud.ts src/styles/main.css tests/hud.test.ts
git commit -m "feat: add HUD skeleton with bilingual copy"
```

---

## Task 1.10：装配主循环

**Files:** Modify `src/main.ts`（替换 Task 0.1 的最小版本）

**Interfaces:** Consumes 前面全部任务的导出；Produces M1 可运行版本

- [ ] **Step 1：重写 `src/main.ts`**

```ts
import './styles/main.css';
import { createSceneContext } from './core/scene';
import { createClock } from './core/clock';
import { julianDate, gmstRadians, EARTH_RADIUS_KM } from './core/frames';
import { sunDirectionEci } from './core/sun';
import { createEarth } from './core/earth';
import { resolveTextureUrl } from './core/earth-texture';
import { createStarfield } from './viz/starfield';
import { createGraticule } from './viz/graticule';
import {
  createFpsSampler,
  qualitySettings,
  shouldDowngrade,
  nextLowerLevel,
  type QualityLevel,
} from './core/quality';
import { mountHud } from './ui/hud';

const SNAPSHOT_DATE = '2026-09-16';

async function bootstrap(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#stage');
  const hudRoot = document.querySelector<HTMLElement>('#hud');
  if (!canvas || !hudRoot) throw new Error('missing #stage or #hud in index.html');

  const ctx = createSceneContext(canvas);
  const base = import.meta.env.BASE_URL;

  let quality: QualityLevel = 'medium';
  let settings = qualitySettings(quality);

  const clock = createClock({ rate: 60 });
  const dayUrl = await resolveTextureUrl(base + 'textures/earth-day.jpg');
  const nightUrl = await resolveTextureUrl(base + 'textures/earth-night.jpg');

  const earth = createEarth({ dayUrl, nightUrl });
  ctx.scene.add(earth.group);
  ctx.scene.add(createStarfield(settings.starCount));
  const graticule = createGraticule(EARTH_RADIUS_KM * 1.001);
  ctx.scene.add(graticule);

  const sampler = createFpsSampler(1000);
  let lowFpsMs = 0;
  let sinceDowngrade = 0;
  let last = performance.now();

  const hud = mountHud(hudRoot, () => ({
    simTimeIso: clock.now().toISOString(),
    playing: clock.isPlaying(),
    rate: clock.rate(),
    fps: sampler.fps(),
    snapshotDate: SNAPSHOT_DATE,
    quality,
    lang: 'zh',
  }));

  const resize = () => ctx.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize);
  resize();

  ctx.renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    clock.tick(dt);

    const simTime = clock.now();
    earth.update({
      gmstRad: gmstRadians(julianDate(simTime)),
      sunDirEci: sunDirectionEci(simTime),
      atmosphere: settings.atmosphere,
    });
    ctx.render();

    sampler.push(dt);
    hud.refresh();

    const fps = sampler.fps();
    lowFpsMs = fps < 30 ? lowFpsMs + dt : 0;
    sinceDowngrade += dt;
    if (shouldDowngrade(fps, lowFpsMs, sinceDowngrade)) {
      const lower = nextLowerLevel(quality);
      if (lower) {
        quality = lower;
        settings = qualitySettings(quality);
        ctx.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatioCap));
        sinceDowngrade = 0;
        lowFpsMs = 0;
      }
    }
  });
}

void bootstrap();
```

- [ ] **Step 2：验证构建**

Run: `npm run build`
Expected: `tsc --noEmit` 无报错，`vite build` 成功。

- [ ] **Step 3：人工验收（M1 清单）**

Run: `npm run dev`，逐条确认：
1. 3 秒内出现地球，纹理清晰，昼夜分界自然（暗面是全黑或灯光）。
2. 地球自转平滑，无抖动、无闪烁。
3. 大气在边缘呈蓝色辉光，球体轮廓外无突兀的圆形边界。
4. 星空不闪烁，缩放时星点大小不变。
5. 经纬网格贴合球面，经线在极点附近自然汇聚。
6. 拖拽旋转有阻尼，滚轮缩放不会穿进地球内部。
7. HUD 显示时间、倍率、FPS、画质档位与"数据快照"提示。
8. 把倍率改成 600 后地球自转明显加快，帧率仍 ≥ 50。
9. 删除 `public/textures/` 后刷新：显示条纹兜底球且控制台无报错。

- [ ] **Step 4：提交**

```bash
git add src/main.ts
git commit -m "feat: assemble scene, clock, earth and hud into runnable app"
```

---

## 完成定义（Definition of Done）

- `npm test` 全绿（约 30 个用例），`npm run build` 通过。
- `npm run dev` 通过上面 9 条人工验收。
- 每个任务各一条提交，`git log` 清晰可读。
- 本文件全部步骤已勾选。

---

## 后续计划（本计划完成后另写，每个计划都产出可运行软件）

| 计划文件 | 覆盖 | 主要产出 |
|---|---|---|
| `M2-data-and-orbits.md` | M2 | `scripts/fetch-tle.mjs`、`catalog.json`（18 预制 + 卫星库）、SGP4 传播、轨道线、卫星点、时间轴 |
| `M3-interaction-and-lock.md` | M3 | 拾取、选中、列表搜索筛选、详情面板、相机缓动锁定与解除 |
| `M4-footprint.md` | M4 | 球面高亮、光锥、随动、视场/侧摆、地平线裁剪、条带、城市高亮 |
| `M5-custom-satellites.md` | M5 | 卫星库一键添加、TLE/根数输入、预设模板、校验、持久化、导入导出 |
| `M6-polish-and-release.md` | M6 | 简介与 ⓘ 说明、中英切换、动效、响应式、README、GitHub Pages |

写下一个计划前，先回顾本计划的落地情况（实际接口、踩到的坑），再据此编写。
