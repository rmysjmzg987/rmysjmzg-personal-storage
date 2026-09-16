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
    const u = rng() * 2 - 1;
    const phi = rng() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    out[i * 3] = radius * s * Math.cos(phi);
    out[i * 3 + 1] = radius * s * Math.sin(phi);
    out[i * 3 + 2] = radius * u;
  }
  return out;
}

export function createStarfield(starCount: number, radiusKm = 300000): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(randomSpherePoints(starCount, radiusKm), 3),
  );
  const material = new THREE.PointsMaterial({
    color: 0xdfe9ff,
    size: 1.7,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}
