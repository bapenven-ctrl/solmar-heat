// Car meshes and the shared arcade driving model used by the player,
// traffic, police and the escort ally.
import * as THREE from 'three';
import { groundHeight } from './config.js';
import { collide } from './city.js';

const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.6 });
const glass = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.15, metalness: 0.4 });
const tyre = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 1 });

export function makeCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), paint);
  body.position.y = 0.62; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.58, 2.2), glass);
  cab.position.set(0, 1.18, -0.25); g.add(cab);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 0.9), paint);
  hood.position.set(0, 0.82, 1.95); g.add(hood);
  for (const [x, z] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), tyre);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.42, z); g.add(w);
  }
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), hl);
    h.position.set(x, 0.66, 2.22); g.add(h);
  }
  if (opts.police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.3, 4.44),
      new THREE.MeshStandardMaterial({ color: 0x2456a8, roughness: 0.4 }));
    stripe.position.y = 0.6; g.add(stripe);
    const bar = new THREE.Group();
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    bl.position.x = -0.3; bar.add(bl);
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2a5bff }));
    br.position.x = 0.3; bar.add(br);
    bar.position.set(0, 1.58, -0.25); g.add(bar);
    g.userData.lightBar = bar; g.userData.lights = [bl, br];
  }
  if (opts.target) { // gold beacon ring marks the mission-3 steal target
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.14, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xffc93c }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; g.add(ring);
    g.userData.ring = ring;
  }
  g.traverse(o => { o.frustumCulled = true; });
  return g;
}

export class Car {
  constructor(scene, color, x, z, heading, opts = {}) {
    this.mesh = makeCarMesh(color, opts);
    this.pos = new THREE.Vector3(x, groundHeight(x, z), z);
    this.heading = heading; this.speed = 0; this.health = 100;
    this.steerVis = 0; this.dead = false;
    scene.add(this.mesh); this.sync();
  }
  // input: {f:-1..1 throttle, s:-1..1 steer}; returns distance moved.
  drive(dt, input, colliders, maxSpeed = 34) {
    const accel = input.f > 0 ? 15 : input.f < 0 ? -10 : 0;
    this.speed += accel * dt;
    this.speed -= this.speed * 0.55 * dt;                       // drag
    if (input.f === 0) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 6 * dt);
    this.speed = Math.max(-11, Math.min(maxSpeed, this.speed));
    if (Math.abs(this.speed) > 0.4) this.heading += input.s * dt * 1.55 * Math.sign(this.speed) * Math.min(1, Math.abs(this.speed) / 9);
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    if (colliders) {
      const before = Math.hypot(this.pos.x - ox, this.pos.z - oz);
      collide(this.pos, 1.7, colliders);
      const after = Math.hypot(this.pos.x - ox, this.pos.z - oz);
      if (after < before * 0.45 && Math.abs(this.speed) > 7) { this.speed *= -0.25; this.health -= 3; this.crashed = true; }
    }
    this.pos.x = Math.max(-640, Math.min(275, this.pos.x));
    this.pos.z = Math.max(-275, Math.min(345, this.pos.z));
    this.pos.y = groundHeight(this.pos.x, this.pos.z);
    this.sync();
    return Math.abs(this.speed * dt);
  }
  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.heading, 0);
  }
  get x() { return this.pos.x; } get z() { return this.pos.z; }
}
