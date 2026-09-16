import * as THREE from 'three';
import { EARTH_RADIUS_KM } from '../core/frames';

/** 云壳半径：略高于地表，又略低于大气辉光壳（1.02），这样云层夹在两者之间 */
export const CLOUD_SHELL_RADIUS = EARTH_RADIUS_KM * 1.012;

const VERTEX = [
  'varying vec2 vUv;',
  'varying vec3 vNormalW;',
  'void main() {',
  '  vUv = uv;',
  '  vNormalW = normalize(mat3(modelMatrix) * normal);',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}',
].join('\n');

/**
 * 云图是"真彩卫星影像"：云又白又中性，海洋很暗，沙漠/植被偏黄。这里用
 * 「亮度高 + 饱和度低 + 黄调弱」三条规则把云提取成 alpha，其余像素透明，
 * 于是球壳看起来就是一层悬浮的云，而不是一张贴纸。
 *
 * 三条判据的过渡段都放得比较宽，云的边缘才是渐隐的；其中饱和度那一条是分辨
 * 「云」和「亮沙漠」的关键——撒哈拉那种 (0.73, 0.63, 0.50) 的像素饱和度约 0.31，
 * 必须在这一档被彻底压掉，否则沙漠会整块糊成白云。
 */
const FRAGMENT = [
  'uniform sampler2D cloudMap;',
  'uniform float hasCloud;',
  'uniform vec3 sunDir;',
  'uniform float opacity;',
  'uniform float lumLow;',
  'uniform float lumHigh;',
  'uniform float satLow;',
  'uniform float satHigh;',
  'uniform float yellowLow;',
  'uniform float yellowHigh;',
  'varying vec2 vUv;',
  'varying vec3 vNormalW;',
  'void main() {',
  '  vec3 c = texture2D(cloudMap, vUv).rgb;',
  '  float lum = dot(c, vec3(0.299, 0.587, 0.114));',
  '  float mx = max(max(c.r, c.g), c.b);',
  '  float mn = min(min(c.r, c.g), c.b);',
  '  float sat = mx > 0.001 ? (mx - mn) / mx : 0.0;',
  '  float yellow = clamp(min(c.r, c.g) - c.b, 0.0, 1.0);',
  '  float alpha = smoothstep(lumLow, lumHigh, lum);',
  '  alpha *= 1.0 - smoothstep(satLow, satHigh, sat);',
  '  alpha *= 1.0 - smoothstep(yellowLow, yellowHigh, yellow);',
  '  vec3 n = normalize(vNormalW);',
  '  vec3 sun = normalize(sunDir);',
  '  // 真彩云图只有白天数据：夜面不给云，和地球夜灯面保持一致',
  '  float day = smoothstep(-0.12, 0.22, dot(n, sun));',
  '  float lambert = clamp(dot(n, sun), 0.0, 1.0);',
  '  float shade = 0.66 + 0.34 * lambert;',
  '  // 云的颜色直接用影像本身的颜色（提亮 + 提白一点）：云顶亮、云隙灰、薄云透蓝的层次都能留下，',
  '  // 比统一刷成纯白更像云',
  '  vec3 color = mix(clamp(c * 1.32 + 0.05, 0.0, 1.0), vec3(1.0), 0.34) * shade;',
  '  gl_FragColor = vec4(color, alpha * hasCloud * opacity * day);',
  '}',
].join('\n');

export interface CloudShellOptions {
  segments?: number;
  maxAnisotropy?: number;
}

export interface CloudShellHandle {
  mesh: THREE.Mesh;
  /** 换云图（传 null 表示暂时没有数据，云壳整体透明） */
  setTexture(canvas: HTMLCanvasElement | null): void;
  setVisible(visible: boolean): void;
  setOpacity(value: number): void;
  setSunDirection(sunEci: { x: number; y: number; z: number }): void;
  hasTexture(): boolean;
  dispose(): void;
}

export function createCloudShell(options: CloudShellOptions = {}): CloudShellHandle {
  const segments = Math.max(32, options.segments ?? 96);
  const geometry = new THREE.SphereGeometry(
    CLOUD_SHELL_RADIUS,
    segments,
    Math.max(24, Math.round(segments * 0.66)),
  );

  const uniforms = {
    cloudMap: { value: null as THREE.Texture | null },
    hasCloud: { value: 0 },
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
    opacity: { value: 0.92 },
    lumLow: { value: 0.34 },
    lumHigh: { value: 0.68 },
    satLow: { value: 0.10 },
    satHigh: { value: 0.30 },
    yellowLow: { value: 0.04 },
    yellowHigh: { value: 0.22 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  // 与地球同款处理：等距圆柱贴图默认以 +y 为极轴，转 90° 对齐 ECI 的 +z 极轴
  mesh.rotation.x = Math.PI / 2;
  // 透明物体的绘制顺序：云壳先于大气辉光，辉光叠加在云层之上才有"大气在云外"的感觉
  mesh.renderOrder = 1;
  mesh.visible = false;

  let texture: THREE.Texture | null = null;

  const disposeTexture = () => {
    texture?.dispose();
    texture = null;
    uniforms.cloudMap.value = null;
    uniforms.hasCloud.value = 0;
  };

  return {
    mesh,
    setTexture(canvas) {
      disposeTexture();
      if (!canvas) return;
      const next = new THREE.CanvasTexture(canvas);
      // 各向异性拉满：云壳是球面，越靠边缘采样越斜，这个值直接决定贴脸时糊不糊
      next.anisotropy = Math.max(1, options.maxAnisotropy ?? 16);
      next.generateMipmaps = true;
      next.minFilter = THREE.LinearMipmapLinearFilter;
      next.magFilter = THREE.LinearFilter;
      next.wrapS = THREE.RepeatWrapping;
      next.wrapT = THREE.ClampToEdgeWrapping;
      next.needsUpdate = true;
      texture = next;
      uniforms.cloudMap.value = next;
      uniforms.hasCloud.value = 1;
    },
    setVisible(visible) {
      mesh.visible = visible;
    },
    setOpacity(value) {
      uniforms.opacity.value = Math.min(1, Math.max(0, value));
    },
    setSunDirection(sunEci) {
      (uniforms.sunDir.value as THREE.Vector3).set(sunEci.x, sunEci.y, sunEci.z);
    },
    hasTexture() {
      return texture !== null;
    },
    dispose() {
      disposeTexture();
      geometry.dispose();
      material.dispose();
    },
  };
}
