import * as THREE from 'three';
import { EARTH_RADIUS_KM, type Vec3 } from './frames';
import { generateFallbackPixels } from './earth-texture';

const EARTH_VERTEX = [
  'varying vec2 vUv;',
  'varying vec3 vNormalW;',
  'varying vec3 vPosW;',
  'void main() {',
  '  vUv = uv;',
  '  vNormalW = normalize(mat3(modelMatrix) * normal);',
  '  vec4 wp = modelMatrix * vec4(position, 1.0);',
  '  vPosW = wp.xyz;',
  '  gl_Position = projectionMatrix * viewMatrix * wp;',
  '}',
].join('\n');

const EARTH_FRAGMENT = [
  'uniform sampler2D dayMap;',
  'uniform sampler2D nightMap;',
  'uniform vec3 sunDir;',
  'uniform float hasNight;',
  'uniform vec2 texel;',
  'uniform float relief;',
  'varying vec2 vUv;',
  'varying vec3 vNormalW;',
  'varying vec3 vPosW;',
  'float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }',
  'void main() {',
  '  vec3 sun = normalize(sunDir);',
  '  vec3 n = normalize(vNormalW);',
  '  vec3 day = texture2D(dayMap, vUv).rgb;',
  '  // 用地形亮度梯度扰动法线：山脉在斜射阳光下出现立体感（低成本凹凸光照）',
  '  vec3 polar = vec3(0.0, 0.0, 1.0);',
  '  vec3 east = cross(polar, n);',
  '  float eastLen = length(east);',
  '  east = eastLen > 1e-4 ? east / eastLen : vec3(1.0, 0.0, 0.0);',
  '  vec3 northDir = cross(n, east);',
  '  float h = luma(day);',
  '  float hEast = luma(texture2D(dayMap, vUv + vec2(texel.x * 3.0, 0.0)).rgb);',
  '  float hNorth = luma(texture2D(dayMap, vUv - vec2(0.0, texel.y * 3.0)).rgb);',
  '  // 贴图自带一层地形阴影，凹凸光照只在贴近地表时加强；远景衰减掉，免得整个地球看起来发花',
  '  float camAlt = max(length(cameraPosition) - 6371.0, 0.0);',
  '  float detailLod = 1.0 - smoothstep(2600.0, 15000.0, camAlt);',
  '  float bumpStrength = relief * mix(0.12, 1.0, detailLod);',
  '  vec3 bumped = normalize(n + (east * (h - hEast) + northDir * (h - hNorth)) * bumpStrength);',
  '  float d = dot(bumped, sun);',
  '  float dayMix = smoothstep(-0.2, 0.24, d);',
  '  // 一点点对比与饱和度，让贴图更像照片而不是灰蒙蒙的地图',
  '  vec3 graded = clamp((day - 0.5) * 1.12 + 0.5, 0.0, 1.0);',
  '  graded = mix(vec3(luma(graded)), graded, 1.14);',
  '  vec3 night = hasNight > 0.5 ? texture2D(nightMap, vUv).rgb * 1.7 + day * 0.1 : day * 0.16;',
  '  vec3 color = mix(night, graded, dayMix);',
  '  // 轻微环境光：夜面不至于全黑，仍能看出地球轮廓与地貌',
  '  color += graded * (0.055 + 0.05 * (1.0 - dayMix));',
  '  // 海面阳光反射：蓝色明显强于红色的像素视为水面，给一个小的镜面高光',
  '  float water = smoothstep(0.01, 0.08, day.b - day.r);',
  '  vec3 viewDir = normalize(cameraPosition - vPosW);',
  '  vec3 halfVec = normalize(sun + viewDir);',
  '  float glint = pow(max(dot(bumped, halfVec), 0.0), 90.0) * water * dayMix;',
  '  color += vec3(1.0, 0.97, 0.9) * glint * 0.28;',
  '  gl_FragColor = vec4(color, 1.0);',
  '}',
].join('\n');

const ATMOS_VERTEX = [
  'varying vec3 vNormalW;',
  'varying vec3 vPosW;',
  'void main() {',
  '  vNormalW = normalize(mat3(modelMatrix) * normal);',
  '  vec4 wp = modelMatrix * vec4(position, 1.0);',
  '  vPosW = wp.xyz;',
  '  gl_Position = projectionMatrix * viewMatrix * wp;',
  '}',
].join('\n');

const ATMOS_FRAGMENT = [
  'uniform vec3 glowColor;',
  'varying vec3 vNormalW;',
  'varying vec3 vPosW;',
  'void main() {',
  '  vec3 viewDir = normalize(cameraPosition - vPosW);',
  '  float rim = pow(1.0 - abs(dot(normalize(vNormalW), viewDir)), 2.6);',
  '  gl_FragColor = vec4(glowColor * rim * 1.6, rim * 0.85);',
  '}',
].join('\n');

function fallbackDataTexture(): THREE.DataTexture {
  const width = 512;
  const height = 256;
  const tex = new THREE.DataTexture(generateFallbackPixels(width, height), width, height);
  tex.needsUpdate = true;
  return tex;
}

/** 贴图超过 GPU 上限时先降采样到合法尺寸，避免低端设备直接黑屏 */
function clampTextureSize(
  image: HTMLImageElement | ImageBitmap,
  maxSize: number,
): HTMLCanvasElement | null {
  const width = image.width;
  const height = image.height;
  if (!width || !height || Math.max(width, height) <= maxSize) return null;
  const scale = maxSize / Math.max(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  return canvas;
}

interface LoadTextureOptions {
  maxAnisotropy: number;
  maxTextureSize: number;
}

function tune(texture: THREE.Texture, options: LoadTextureOptions): void {
  texture.anisotropy = Math.max(1, options.maxAnisotropy);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
}

/** 异步载入一张贴图；失败或尺寸超限时返回 null，由调用方保留回退缩略图 */
function loadTexture(
  loader: THREE.TextureLoader,
  url: string,
  options: LoadTextureOptions,
): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    loader.load(
      url,
      (texture) => {
        const image = texture.image as HTMLImageElement | ImageBitmap | undefined;
        const canvas = image ? clampTextureSize(image, options.maxTextureSize) : null;
        if (canvas) {
          texture.dispose();
          const resized = new THREE.CanvasTexture(canvas);
          tune(resized, options);
          resolve(resized);
          return;
        }
        tune(texture, options);
        resolve(texture);
      },
      undefined,
      () => resolve(null),
    );
  });
}

export interface EarthHandles {
  group: THREE.Group;
  update(params: { gmstRad: number; sunDirEci: Vec3; atmosphere: boolean }): void;
  /** 高清贴图载入完成（首帧用回退缩略图先渲染，不阻塞页面） */
  ready: Promise<void>;
  dispose(): void;
}

export async function createEarth(opts: {
  dayUrl: string | null;
  nightUrl: string | null;
  maxAnisotropy?: number;
  maxTextureSize?: number;
}): Promise<EarthHandles> {
  const loader = new THREE.TextureLoader();
  const loadOptions: LoadTextureOptions = {
    maxAnisotropy: opts.maxAnisotropy ?? 8,
    maxTextureSize: opts.maxTextureSize ?? 8192,
  };
  const fallbackDay = fallbackDataTexture();
  const fallbackNight = fallbackDataTexture();

  const uniforms = {
    dayMap: { value: fallbackDay as THREE.Texture },
    nightMap: { value: fallbackNight as THREE.Texture },
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
    hasNight: { value: 0 },
    texel: { value: new THREE.Vector2(1 / 2048, 1 / 1024) },
    relief: { value: 3 },
  };

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS_KM, 160, 96),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: EARTH_VERTEX,
      fragmentShader: EARTH_FRAGMENT,
    }),
  );
  // 等距圆柱贴图的球体默认以 +y 为极轴，而卫星/城市/太阳都用 +z 作极轴。
  // 这里把球体绕 x 轴转 90°，让贴图与 ECI 坐标系（含经纬网格）严格对齐。
  earth.rotation.x = Math.PI / 2;

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
  // 云壳（renderOrder 1）必须先于大气辉光绘制，否则"大气在云外"的层次就反了
  atmosphere.renderOrder = 2;

  const group = new THREE.Group();
  group.add(earth, atmosphere);

  let disposed = false;
  const extraTextures: THREE.Texture[] = [];
  const pending: Promise<void>[] = [];
  const released = new Set<THREE.Texture>();
  /** 释放贴图（幂等）：回退缩略图可能先被高清贴图顶替，也可能一直用到最后 */
  const release = (texture: THREE.Texture) => {
    if (released.has(texture)) return;
    released.add(texture);
    texture.dispose();
  };

  if (opts.dayUrl) {
    pending.push(
      loadTexture(loader, opts.dayUrl, loadOptions).then((texture) => {
        if (!texture || disposed) {
          texture?.dispose();
          return;
        }
        extraTextures.push(texture);
        uniforms.dayMap.value = texture;
        const image = texture.image as HTMLImageElement | HTMLCanvasElement | undefined;
        if (image?.width && image?.height) {
          uniforms.texel.value.set(1 / image.width, 1 / image.height);
        }
      }),
    );
  }
  if (opts.nightUrl) {
    pending.push(
      loadTexture(loader, opts.nightUrl, loadOptions).then((texture) => {
        if (!texture || disposed) {
          texture?.dispose();
          return;
        }
        extraTextures.push(texture);
        uniforms.nightMap.value = texture;
        uniforms.hasNight.value = 1;
      }),
    );
  }
  const ready = Promise.all(pending).then(() => {
    if (disposed) return;
    // 高清贴图就位后回退缩略图就没用了；载入失败时它仍是当前贴图，得留着
    if (uniforms.dayMap.value !== fallbackDay) release(fallbackDay);
    if (uniforms.nightMap.value !== fallbackNight) release(fallbackNight);
  });

  return {
    group,
    ready,
    update({ gmstRad, sunDirEci, atmosphere: showAtmosphere }) {
      group.rotation.z = gmstRad;
      atmosphere.visible = showAtmosphere;
      (uniforms.sunDir.value as THREE.Vector3).set(sunDirEci.x, sunDirEci.y, sunDirEci.z);
    },
    dispose() {
      disposed = true;
      earth.geometry.dispose();
      atmosphere.geometry.dispose();
      (earth.material as THREE.Material).dispose();
      (atmosphere.material as THREE.Material).dispose();
      for (const texture of extraTextures) release(texture);
      release(fallbackDay);
      release(fallbackNight);
    },
  };
}
