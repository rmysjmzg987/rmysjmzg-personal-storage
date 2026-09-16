import * as THREE from 'three';
import { EARTH_RADIUS_KM, type Vec3 } from './frames';
import { generateFallbackPixels } from './earth-texture';

const EARTH_VERTEX = [
  'varying vec2 vUv;',
  'varying vec3 vNormalW;',
  'void main() {',
  '  vUv = uv;',
  '  vNormalW = normalize(mat3(modelMatrix) * normal);',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}',
].join('\n');

const EARTH_FRAGMENT = [
  'uniform sampler2D dayMap;',
  'uniform sampler2D nightMap;',
  'uniform vec3 sunDir;',
  'uniform float hasNight;',
  'varying vec2 vUv;',
  'varying vec3 vNormalW;',
  'void main() {',
  '  float d = dot(normalize(vNormalW), normalize(sunDir));',
  '  float dayMix = smoothstep(-0.2, 0.24, d);',
  '  vec3 day = texture2D(dayMap, vUv).rgb;',
  '  vec3 night = hasNight > 0.5 ? texture2D(nightMap, vUv).rgb * 1.7 + day * 0.1 : day * 0.16;',
  '  vec3 color = mix(night, day, dayMix);',
  '  // 轻微环境光：夜面不至于全黑，仍能看出地球轮廓与地貌',
  '  color += day * (0.055 + 0.05 * (1.0 - dayMix));',
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

async function loadTexture(
  loader: THREE.TextureLoader,
  url: string | null,
): Promise<{ texture: THREE.Texture; fromFile: boolean }> {
  if (!url) return { texture: fallbackDataTexture(), fromFile: false };
  return new Promise((resolve) => {
    loader.load(
      url,
      (texture) => {
        texture.anisotropy = 8;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        resolve({ texture, fromFile: true });
      },
      undefined,
      () => resolve({ texture: fallbackDataTexture(), fromFile: false }),
    );
  });
}

export interface EarthHandles {
  group: THREE.Group;
  update(params: { gmstRad: number; sunDirEci: Vec3; atmosphere: boolean }): void;
  dispose(): void;
}

export async function createEarth(opts: {
  dayUrl: string | null;
  nightUrl: string | null;
}): Promise<EarthHandles> {
  const loader = new THREE.TextureLoader();
  const day = await loadTexture(loader, opts.dayUrl);
  const night = await loadTexture(loader, opts.nightUrl);

  const uniforms = {
    dayMap: { value: day.texture },
    nightMap: { value: night.texture },
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
    hasNight: { value: night.fromFile ? 1 : 0 },
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

  const group = new THREE.Group();
  group.add(earth, atmosphere);

  return {
    group,
    update({ gmstRad, sunDirEci, atmosphere: showAtmosphere }) {
      group.rotation.z = gmstRad;
      atmosphere.visible = showAtmosphere;
      (uniforms.sunDir.value as THREE.Vector3).set(sunDirEci.x, sunDirEci.y, sunDirEci.z);
    },
    dispose() {
      earth.geometry.dispose();
      atmosphere.geometry.dispose();
      (earth.material as THREE.Material).dispose();
      (atmosphere.material as THREE.Material).dispose();
      day.texture.dispose();
      night.texture.dispose();
    },
  };
}
