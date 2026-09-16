import './styles/main.css';
import * as THREE from 'three';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('missing #stage canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(0x05070f, 1);

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
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});

renderer.setAnimationLoop(() => {
  earth.rotation.y += 0.002;
  renderer.render(scene, camera);
});
