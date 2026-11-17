// The three.js renderer: a warm sunset sky dome, soft fog, a low sun and
// the follow camera. The camera rides behind the player or their car and
// climbs above any roof it would otherwise clip through.
import * as THREE from 'three';
import { PALETTE } from './config.js';

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, PALETTE.skyTop);
  gradient.addColorStop(0.55, PALETTE.skyMid);
  gradient.addColorStop(1, PALETTE.skyLow);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createRender(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.fog, 130, 340);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(420, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(26, 24),
    new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false }),
  );
  sun.position.set(-260, 55, -180);
  sun.lookAt(0, 20, 0);
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x4a3a5a, 1.15);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffb36b, 1.6);
  sunLight.position.set(-120, 90, -60);
  scene.add(sunLight);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(0, 8, 14);

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  const smoothed = new THREE.Vector3(0, 8, 14);
  let firstFrame = true;

  /**
   * Follow `focus` (the player or their car) from behind, at `distance`
   * and `height`; if the camera would sit inside a building, climb above
   * its roof instead of clipping through the wall.
   */
  function followCamera(focus, heading, distance, height, colliders, dt) {
    const behind = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    const wanted = focus.clone().addScaledVector(behind, distance);
    wanted.y = height;
    for (const box of colliders) {
      if (wanted.x > box.minX - 1 && wanted.x < box.maxX + 1 && wanted.z > box.minZ - 1 && wanted.z < box.maxZ + 1) {
        wanted.y = Math.max(wanted.y, box.height + 3);
      }
    }
    if (firstFrame) {
      smoothed.copy(wanted);
      firstFrame = false;
    } else {
      smoothed.lerp(wanted, Math.min(1, dt * 5));
    }
    camera.position.copy(smoothed);
    const look = focus.clone();
    look.y = 2;
    camera.lookAt(look);
  }

  /** A slow orbit around the city centre for the title screen backdrop. */
  function orbitCamera(time) {
    const angle = time * 0.05;
    camera.position.set(Math.sin(angle) * 90, 42, Math.cos(angle) * 90);
    camera.lookAt(0, 12, 0);
  }

  function render() {
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, resize, followCamera, orbitCamera, render };
}
