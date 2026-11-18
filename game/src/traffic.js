// Ambient traffic: cars loop the main grid and the Bukit Cemara roads,
// plus parked cars (some stealable) and the fleeing pedestrians.
import * as THREE from 'three';
import { WORLD, groundHeight } from './config.js';
import { Car } from './vehicles.js';

const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xcccccc, 0x3f9e57, 0xd9a441, 0x7456a8, 0x888888, 0x222831];
const LANES = [];
for (let v = WORLD.mainMin; v <= WORLD.mainMax; v += WORLD.grid) LANES.push(v);

export class Traffic {
  constructor(scene, rng, colliders) {
    this.colliders = colliders; this.rng = rng;
    this.cars = [];
    for (let i = 0; i < 13; i++) {
      const vertical = rng.chance(0.5);
      const lane = rng.pick(LANES) + (rng.chance(0.5) ? 3.4 : -3.4);
      const along = rng.range(-230, 230);
      const car = new Car(scene, rng.pick(CAR_COLORS),
        vertical ? lane : along, vertical ? along : lane, rng.chance(0.5) ? 0 : Math.PI);
      car.vertical = vertical; car.dir = car.heading < 0.1 || car.heading > 6 ? 1 : -1;
      if (!vertical) car.dir = Math.cos(car.heading) > 0 ? 1 : -1;
      car.cruise = rng.range(10, 16);
      this.cars.push(car);
    }
    // Hill loop cars: east-west on the two terrace roads.
    for (let i = 0; i < 4; i++) {
      const rz = i % 2 ? 90 : -90;
      const car = new Car(scene, rng.pick(CAR_COLORS), rng.range(-540, -340), rz + 3.4, i % 2 ? Math.PI / 2 : -Math.PI / 2);
      car.hill = true; car.dir = i % 2 ? -1 : 1; car.cruise = 11;
      this.cars.push(car);
    }
    // Parked cars along curbs.
    this.parked = [];
    for (let i = 0; i < 10; i++) {
      const lane = rng.pick(LANES);
      const car = new Car(scene, rng.pick(CAR_COLORS), lane + 5.6, rng.range(-225, 225), 0);
      this.parked.push(car);
    }
  }
  update(dt) {
    for (const c of this.cars) {
      if (c.dead) continue;
      let steer = 0;
      if (c.hill) {
        if (c.pos.x < -565 && c.dir < 0) c.dir = 1;
        if (c.pos.x > -322 && c.dir > 0) c.dir = -1;
        c.heading = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        c.drive(dt, { f: 1, s: 0 }, null, c.cruise + 2);
        c.speed = Math.min(c.speed, c.cruise);
        c.pos.z += ((c.pos.z > 0 ? 90 : -90) + 3.4 - c.pos.z) * dt * 2;
        c.pos.y = groundHeight(c.pos.x, c.pos.z); c.sync();
        continue;
      }
      // Turn decision near intersections.
      const near = (v) => Math.abs(((v + 30) % 60 + 60) % 60 - 30) < 2.2;
      if (c.vertical && near(c.pos.z) && this.rng.chance(0.012)) { c.vertical = false; c.heading = this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2; }
      else if (!c.vertical && near(c.pos.x) && this.rng.chance(0.012)) { c.vertical = true; c.heading = this.rng.chance(0.5) ? 0 : Math.PI; }
      if (c.vertical) { c.pos.x += (Math.round((c.pos.x) / 60) * 60 + 3.4 * Math.sign(Math.cos(c.heading) || 1) - c.pos.x) * dt * 1.5; }
      c.drive(dt, { f: 1, s: steer }, this.colliders, c.cruise + 2);
      if (c.speed > c.cruise) c.speed = c.cruise;
      if (c.pos.z > 245) c.pos.z = -245; if (c.pos.z < -245) c.pos.z = 245;
      if (c.pos.x > 245) c.pos.x = -245; if (c.pos.x < -245) c.pos.x = 245;
    }
  }
  allCars() { return [...this.cars, ...this.parked]; }
}

const skin = [0xc9995c, 0x8a5a34, 0xe0b08a, 0x6e4526];
const shirt = [0xd9573b, 0x3b78d9, 0x53b06a, 0xe3c84b, 0x9b59c9, 0xe8e2d6];
export function makeFigure(rng, shirtColor) {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x2c3242, roughness: 1 }));
  legs.position.y = 0.4; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4),
    new THREE.MeshStandardMaterial({ color: shirtColor ?? rng.pick(shirt), roughness: 1 }));
  torso.position.y = 1.22; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8),
    new THREE.MeshStandardMaterial({ color: rng.pick(skin), roughness: 0.8 }));
  head.position.y = 1.92; g.add(head);
  return g;
}

export class Pedestrians {
  constructor(scene, rng) {
    this.list = [];
    for (let i = 0; i < 22; i++) {
      const hill = i > 17;
      const m = makeFigure(rng);
      const p = {
        mesh: m, x: hill ? rng.range(-540, -330) : rng.range(-230, 230),
        z: hill ? rng.pick([-78, 102]) : rng.range(-230, 230),
        heading: rng.range(0, Math.PI * 2), speed: 0, panic: 0, phase: rng.range(0, 6),
      };
      scene.add(m); this.list.push(p);
    }
  }
  update(dt, threat) {
    for (const p of this.list) {
      const dx = p.x - threat.x, dz = p.z - threat.z;
      const dist = Math.hypot(dx, dz);
      if (threat.alarm > 0 && dist < 26) p.panic = 2.5;
      if (p.panic > 0) {
        p.panic -= dt; p.heading = Math.atan2(dx, dz); p.speed = 5.4;
      } else {
        p.speed = 1.4;
        p.phase -= dt; if (p.phase <= 0) { p.phase = 3 + (p.x * 7 % 3); p.heading += 1.1; }
      }
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      p.x = Math.max(-580, Math.min(258, p.x)); p.z = Math.max(-245, Math.min(245, p.z));
      const y = groundHeight(p.x, p.z);
      p.mesh.position.set(p.x, y, p.z);
      p.mesh.rotation.y = p.heading;
    }
  }
}
