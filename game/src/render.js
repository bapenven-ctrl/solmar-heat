// Renderer, scene, sunset lighting and the third-person camera rig.
import * as THREE from 'three';
import { COLORS } from './config.js';

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.fog, 230, 850);
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2000);

  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x35304a, 1.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(COLORS.sun, 1.9);
  sun.position.set(320, 190, -140);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x7a86ff, 0.35);
  fill.position.set(-200, 120, 200);
  scene.add(fill);

  // Low sun disc and a band of sunset glow on the horizon.
  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(26, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffcf8a, fog: false }));
  sunBall.position.set(760, 92, -330);
  scene.add(sunBall);

  const cam = { yaw: 0, dist: 11, height: 4.6 };
  function follow(dt, target, heading, speed) {
    const wantYaw = heading;
    let d = wantYaw - cam.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    cam.yaw += d * Math.min(1, dt * 4.5);
    const back = new THREE.Vector3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw));
    const pos = target.clone().addScaledVector(back, -cam.dist);
    pos.y = target.y + cam.height + Math.min(2, Math.abs(speed) * 0.03);
    camera.position.lerp(pos, Math.min(1, dt * 7));
    const look = target.clone(); look.y += 2.2;
    camera.lookAt(look);
  }
  function snap(target, heading) {
    cam.yaw = heading;
    const back = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    camera.position.copy(target).addScaledVector(back, -cam.dist);
    camera.position.y = target.y + cam.height;
    camera.lookAt(target.x, target.y + 2.2, target.z);
  }
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });
  return { renderer, scene, camera, follow, snap };
}

// Shared canvas texture of lit windows, tinted per building at draw time.
export function windowTexture(rng, base) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 120; y += 11) for (let x = 5; x < 58; x += 10) {
    g.fillStyle = rng.chance(0.55) ? '#ffd98a' : '#241f2e';
    g.fillRect(x, y, 6, 7);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
