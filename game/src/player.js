// The player character, Raka: walking, running, entering and leaving
// cars, taking damage. Driving itself lives in vehicles.js; this class
// owns the on-foot body and the switch between the two modes.

import * as THREE from 'three';
import { TUNING } from './config.js';

export function makeHeroMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc68863 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0xe8641e }); // Raka's orange jacket
  const pants = new THREE.MeshLambertMaterial({ color: 0x24304d });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.8, 0.19), pants);
  legL.position.set(-0.11, 0.4, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.64, 0.25), shirt);
  torso.position.y = 1.1;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.3, 0.27), skin);
  head.position.y = 1.58;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.3), new THREE.MeshLambertMaterial({ color: 0x14213d }));
  cap.position.y = 1.76;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.22), cap.material);
  brim.position.set(0, 1.72, 0.24);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.14), shirt);
  armL.position.set(-0.31, 1.08, 0);
  const armR = armL.clone();
  armR.position.x = 0.31;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.34), new THREE.MeshLambertMaterial({ color: 0x14161a }));
  gun.position.set(0, -0.3, 0.12);
  armR.add(gun);
  g.add(legL, legR, torso, head, cap, brim, armL, armR);
  g.userData.parts = { legL, legR, armL, armR };
  g.userData.gun = gun;
  return g;
}

export class Player {
  constructor(scene, city) {
    this.mesh = makeHeroMesh();
    scene.add(this.mesh);
    this.city = city;
    this.mode = 'foot';
    this.vehicle = null;
    this.health = 100;
    this.angle = 0;
    this.animTime = 0;
    this.dead = false;
    this.position = this.mesh.position;
    this.position.set(-6, 0, 20);
  }

  get pos() {
    return this.mode === 'car' && this.vehicle ? this.vehicle.mesh.position : this.mesh.position;
  }

  muzzlePoint(out) {
    const p = this.pos;
    out.set(p.x + Math.sin(this.angle) * 0.5, p.y + 1.35, p.z + Math.cos(this.angle) * 0.5);
    return out;
  }

  placeAt(x, z, angle = 0) {
    this.mesh.position.set(x, this.city.groundHeight(x, z), z);
    this.angle = angle;
    this.mesh.rotation.y = angle;
  }

  enterCar(vehicle) {
    this.mode = 'car';
    this.vehicle = vehicle;
    vehicle.driver = this;
    this.mesh.visible = false;
  }

  exitCar() {
    if (!this.vehicle) return null;
    const v = this.vehicle;
    const side = new THREE.Vector3(Math.cos(v.angle), 0, -Math.sin(v.angle));
    const p = v.mesh.position;
    this.placeAt(p.x + side.x * 2.2, p.z + side.z * 2.2, v.angle);
    v.driver = null;
    this.vehicle = null;
    this.mode = 'foot';
    this.mesh.visible = true;
    return v;
  }

  nearestEnterable(vehicles) {
    let best = null;
    let bestD = TUNING.enterCarRange * TUNING.enterCarRange;
    for (const v of vehicles) {
      if (v.driver || v.dead) continue;
      if (Math.abs(v.speed) > 1.2) continue;
      const d = v.mesh.position.distanceToSquared(this.mesh.position);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  damage(amount) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  healFull() {
    this.health = 100;
    this.dead = false;
  }

  // move: {x, z} camera-relative wish direction (-1..1), run: bool,
  // aimAngle: facing when shooting (or null to face movement).
  update(dt, move, world) {
    if (this.mode === 'car') {
      if (this.vehicle) this.mesh.position.copy(this.vehicle.mesh.position);
      return;
    }
    const m = this.mesh;
    const moving = Math.abs(move.x) > 0.01 || Math.abs(move.z) > 0.01;
    if (moving) {
      const len = Math.hypot(move.x, move.z) || 1;
      const speed = move.run ? TUNING.playerRunSpeed : TUNING.playerWalkSpeed;
      const vx = (move.x / len) * speed;
      const vz = (move.z / len) * speed;
      m.position.x += vx * dt;
      m.position.z += vz * dt;
      if (move.aimAngle === null || move.aimAngle === undefined) {
        const want = Math.atan2(vx, vz);
        let diff = want - this.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.angle += diff * Math.min(1, dt * 12);
      }
      this.animTime += dt * (move.run ? 11 : 8);
    }
    if (move.aimAngle !== null && move.aimAngle !== undefined) this.angle = move.aimAngle;
    m.rotation.y = this.angle;

    // Keep the body out of buildings.
    const p = m.position;
    for (const c of world.colliders) {
      if (c.minX - p.x > 3 || p.x - c.maxX > 3 || c.minZ - p.z > 3 || p.z - c.maxZ > 3) continue;
      const nx = Math.max(c.minX, Math.min(p.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
      const dx = p.x - nx;
      const dz = p.z - nz;
      const d2 = dx * dx + dz * dz;
      const r = TUNING.playerRadius;
      if (d2 < r * r) {
        if (d2 < 0.0001) {
          p.x = c.minX - r;
          continue;
        }
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (r - d);
        p.z += (dz / d) * (r - d);
      }
    }
    p.y = this.city.groundHeight(p.x, p.z);

    const parts = m.userData.parts;
    const swing = moving ? Math.sin(this.animTime) * 0.6 : 0;
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
    if (move.aiming) {
      parts.armR.rotation.x = -Math.PI / 2 + 0.12;
      parts.armL.rotation.x = swing * 0.3;
    } else {
      parts.armL.rotation.x = -swing * 0.8;
      parts.armR.rotation.x = swing * 0.8;
    }
  }
}
