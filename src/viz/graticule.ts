import * as THREE from 'three';

const DEG = Math.PI / 180;

export function graticuleSegments(radiusKm: number, stepDeg = 15, samples = 120): Float32Array {
  const verts: number[] = [];
  const push = (latDeg: number, lonDeg: number) => {
    const lat = latDeg * DEG;
    const lon = lonDeg * DEG;
    verts.push(
      radiusKm * Math.cos(lat) * Math.cos(lon),
      radiusKm * Math.cos(lat) * Math.sin(lon),
      radiusKm * Math.sin(lat),
    );
  };

  for (let lat = -90 + stepDeg; lat < 90; lat += stepDeg) {
    for (let i = 0; i < samples; i++) {
      push(lat, (360 / samples) * i);
      push(lat, (360 / samples) * (i + 1));
    }
  }

  const half = Math.max(2, Math.round(samples / 2));
  for (let lon = 0; lon < 360; lon += stepDeg) {
    for (let i = 0; i < half; i++) {
      push(-90 + (180 / half) * i, lon);
      push(-90 + (180 / half) * (i + 1), lon);
    }
  }

  return new Float32Array(verts);
}

export function createGraticule(radiusKm: number): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(graticuleSegments(radiusKm), 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x2f6f9f,
    transparent: true,
    opacity: 0.35,
  });
  return new THREE.LineSegments(geometry, material);
}
