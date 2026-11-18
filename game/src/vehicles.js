// Stylised low-poly cars and the arcade vehicle physics every driver
// (player, traffic, police) shares: throttle, steering, ground following,
// building collisions and car-to-car bumps.

import * as THREE from 'three';
import { TUNING } from './config.js';

const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2836 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x14161a });

export function makeCarMesh(rng, options = {}) {
  const police = !!options.police;
  const color = police ? 0xf2f4f6 : options.color ?? 0xd94f30;
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const length = options.length ?? 4.4;
  const width = options.width ?? 1.9;

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, 0.62, length), paint);
  body.position.y = 0.58;
  body.castShadow = true;
  g.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(width * 0.86, 0.55, length * 0.48), glassMat);
  cabin.position.set(0, 1.12, -length * 0.06);
  cabin.castShadow = true;
  g.add(cabin);

  if (police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.3, length * 0.96), new THREE.MeshLambertMaterial({ color: 0x1d4ed8 }));
    stripe.position.y = 0.62;
    g.add(stripe);
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.4), new THREE.MeshLambertMaterial({ color: 0x22262b }));
    barBase.position.set(0, 1.46, -length * 0.06);
    g.add(barBase);
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2a6bff });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.34), redMat);
    red.position.set(-0.32, 1.58, -length * 0.06);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.34), blueMat);
    blue.position.set(0.32, 1.58, -length * 0.06);
    g.add(blue);
    g.userData.lightBar = { redMat, blueMat };
  }

  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd92b2b });
  const headBar = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, 0.15, 0.06), headMat);
  headBar.position.set(0, 0.62, length / 2 + 0.01);
  g.add(headBar);
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, 0.13, 0.06), tailMat);
  tailBar.position.set(0, 0.66, -length / 2 - 0.01);
  g.add(tailBar);

  const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const frontWheels = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.position.set(sx * (width / 2 - 0.05), 0.37, sz * (length / 2 - 0.95));
    g.add(w);
    wheels.push(w);
    if (sz > 0) frontWheels.push(w);
  }

  // One real headlight beam. It is only attached to the group while lit
  // (see Vehicle.setBeam): an attached spotlight costs every fragment
  // in the scene, so fifty parked cars must not carry fifty lights.
  const beam = new THREE.SpotLight(0xffe9bb, 0, 42, 0.5, 0.5, 1.2);
  beam.position.set(0, 0.9, length / 2);
  const beamTarget = new THREE.Object3D();
  beamTarget.position.set(0, 0.2, length / 2 + 18);
  beam.target = beamTarget;

  g.userData.beam = beam;
  g.userData.beamTarget = beamTarget;
  g.userData.wheels = wheels;
  g.userData.frontWheels = frontWheels;
  g.userData.length = length;
  g.userData.width = width;
  return g;
}

export class Vehicle {
  constructor(mesh, opts = {}) {
    this.mesh = mesh;
    this.angle = opts.angle ?? 0;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.dead = false;
    this.maxSpeed = opts.maxSpeed ?? TUNING.carMaxSpeed;
    this.maxReverse = opts.maxReverse ?? TUNING.carMaxReverse;
    this.accel = opts.accel ?? TUNING.carAccel;
    this.radius = (mesh.userData.length ?? 4.4) * 0.42;
    this.impact = 0; // strongest bump this frame, for sound and crime
    this.driver = null;
    this.setPosition(opts.x ?? 0, opts.z ?? 0, opts.groundHeight);
  }

  get pos() {
    return this.mesh.position;
  }

  forward(out) {
    return out.set(Math.sin(this.angle), 0, Math.cos(this.angle));
  }

  setPosition(x, z, groundHeight) {
    this.mesh.position.set(x, groundHeight ? groundHeight(x, z) : 0, z);
    this.mesh.rotation.y = this.angle;
  }

  speedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  update(dt, control, world) {
    this.impact = 0;
    if (this.dead) {
      this.speed = 0;
      return;
    }
    const throttle = THREE.MathUtils.clamp(control.throttle ?? 0, -1, 1);
    const steer = THREE.MathUtils.clamp(control.steer ?? 0, -1, 1);
    this.steer += (steer - this.steer) * Math.min(1, dt * 7);

    if (throttle > 0) {
      this.speed += this.accel * throttle * dt * (this.speed < 0 ? 2.4 : 1);
    } else if (throttle < 0) {
      this.speed += this.accel * throttle * dt * (this.speed > 0 ? 2.6 : 0.7);
    } else {
      const roll = 3.2 * dt;
      this.speed = Math.abs(this.speed) <= roll ? 0 : this.speed - Math.sign(this.speed) * roll;
    }
    this.speed -= this.speed * TUNING.carDrag * dt * 0.35;
    this.speed = THREE.MathUtils.clamp(this.speed, -this.maxReverse, this.maxSpeed);
    if (control.handbrake) this.speed -= this.speed * 3.4 * dt;

    const grip = Math.min(1, Math.abs(this.speed) / 5.5);
    this.angle += this.steer * TUNING.carTurnRate * grip * dt * (this.speed < 0 ? -1 : 1) * (1 - Math.min(0.45, Math.abs(this.speed) / this.maxSpeed * 0.45));

    const f = this.forward(new THREE.Vector3());
    this.mesh.position.addScaledVector(f, this.speed * dt);
    this.mesh.position.y = world.groundHeight(this.mesh.position.x, this.mesh.position.z);
    this.mesh.rotation.y = this.angle;

    // Slope pitch for the hill roads.
    const ahead = world.groundHeight(this.mesh.position.x + f.x * 2, this.mesh.position.z + f.z * 2);
    const behind = world.groundHeight(this.mesh.position.x - f.x * 2, this.mesh.position.z - f.z * 2);
    this.mesh.rotation.x = -Math.atan2(ahead - behind, 4) * 0.85;

    // Building collisions: circle against AABBs, cheap broadphase by distance.
    const p = this.mesh.position;
    for (const c of world.colliders) {
      if (c.minX - p.x > 6 || p.x - c.maxX > 6 || c.minZ - p.z > 6 || p.z - c.maxZ > 6) continue;
      const nx = Math.max(c.minX, Math.min(p.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
      const dx = p.x - nx;
      const dz = p.z - nz;
      const d2 = dx * dx + dz * dz;
      const r = this.radius * 0.78;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 0.001;
        let pushX = dx / d;
        let pushZ = dz / d;
        if (d2 < 0.0001) {
          pushX = -f.x;
          pushZ = -f.z;
        }
        const pen = r - d + 0.02;
        p.x += pushX * pen;
        p.z += pushZ * pen;
        const hit = Math.abs(this.speed);
        if (hit > 3) this.impact = Math.max(this.impact, hit);
        this.speed *= 0.35;
        if (hit > 6) this.health -= (hit - 6) * 1.6;
      }
    }

    // Wheel visuals.
    const spin = (this.speed * dt) / 0.37;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    for (const w of this.mesh.userData.frontWheels) w.rotation.y = this.steer * 0.45;

    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.speed = 0;
    }
  }

  // Circle-to-circle separation against the other vehicles.
  resolveVehicles(others) {
    if (this.dead) return;
    const p = this.mesh.position;
    for (const o of others) {
      if (o === this) continue;
      const q = o.mesh.position;
      const dx = p.x - q.x;
      const dz = p.z - q.z;
      const rr = (this.radius + o.radius) * 0.86;
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const push = (rr - d) / 2 + 0.02;
      const nx = dx / d;
      const nz = dz / d;
      p.x += nx * push;
      p.z += nz * push;
      if (!o.dead) {
        q.x -= nx * push;
        q.z -= nz * push;
      }
      const closing = Math.abs(this.speed) + Math.abs(o.speed);
      if (closing > 4) {
        this.impact = Math.max(this.impact, closing * 0.7);
        o.impact = Math.max(o.impact, closing * 0.7);
        const dmg = (closing - 4) * 1.1;
        this.health -= dmg * 0.5;
        o.health -= dmg;
      }
      this.speed *= 0.72;
      if (!o.dead) o.speed *= 0.72;
    }
  }

  setBeam(on) {
    const beam = this.mesh.userData.beam;
    if (!beam) return;
    if (on && !beam.parent) {
      this.mesh.add(beam);
      this.mesh.add(this.mesh.userData.beamTarget);
    } else if (!on && beam.parent) {
      this.mesh.remove(beam);
      this.mesh.remove(this.mesh.userData.beamTarget);
    }
    beam.intensity = on ? 160 : 0;
  }
}
