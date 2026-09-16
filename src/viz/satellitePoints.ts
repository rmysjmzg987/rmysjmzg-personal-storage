import * as THREE from 'three';

export interface SatellitePointsHandle {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  updatePositions(positions: Float32Array, colors: Float32Array, sizes: Float32Array, count: number): void;
  setScale(scale: number, minPx: number, maxPx: number): void;
  dispose(): void;
}

function createGlowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.55, 'rgba(200,230,255,0.28)');
  gradient.addColorStop(1, 'rgba(160,200,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function createSatellitePoints(capacity: number): SatellitePointsHandle {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const sizes = new Float32Array(capacity);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setDrawRange(0, 0);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: createGlowTexture() },
      uScale: { value: 1200 },
      uMinPx: { value: 2.5 },
      uMaxPx: { value: 16 },
    },
    vertexShader: `
      attribute float size;
      uniform float uScale;
      uniform float uMinPx;
      uniform float uMaxPx;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float px = size * uScale / max(-mv.z, 1.0);
        gl_PointSize = clamp(px, uMinPx, uMaxPx);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uTexture;
      varying vec3 vColor;
      void main() {
        vec4 tex = texture2D(uTexture, gl_PointCoord);
        if (tex.a < 0.02) discard;
        gl_FragColor = vec4(vColor * tex.rgb * 1.35, tex.a);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 3;

  return {
    points,
    material,
    updatePositions(nextPositions, nextColors, nextSizes, count) {
      const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
      const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
      const sizeAttr = geometry.getAttribute('size') as THREE.BufferAttribute;
      (positionAttr.array as Float32Array).set(nextPositions.subarray(0, count * 3));
      (colorAttr.array as Float32Array).set(nextColors.subarray(0, count * 3));
      (sizeAttr.array as Float32Array).set(nextSizes.subarray(0, count));
      positionAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
      geometry.setDrawRange(0, count);
      geometry.computeBoundingSphere();
    },
    setScale(scale, minPx, maxPx) {
      material.uniforms.uScale.value = scale;
      material.uniforms.uMinPx.value = minPx;
      material.uniforms.uMaxPx.value = maxPx;
    },
    dispose() {
      geometry.dispose();
      material.uniforms.uTexture.value?.dispose?.();
      material.dispose();
    },
  };
}

function createRingTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255, 214, 130, 0.95)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 20, 0, Math.PI * 2);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export interface SelectionHalo {
  sprite: THREE.Sprite;
  setPosition(x: number, y: number, z: number, distanceToCamera: number): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export function createSelectionHalo(): SelectionHalo {
  const material = new THREE.SpriteMaterial({
    map: createRingTexture(),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.9,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 5;
  sprite.visible = false;
  return {
    sprite,
    setPosition(x, y, z, distanceToCamera) {
      sprite.position.set(x, y, z);
      const scale = Math.max(60, distanceToCamera * 0.02);
      sprite.scale.setScalar(scale);
    },
    setVisible(visible) {
      sprite.visible = visible;
    },
    dispose() {
      material.map?.dispose();
      material.dispose();
    },
  };
}
