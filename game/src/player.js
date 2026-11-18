// Rex Marlowe on foot: walking, sprinting, entering and leaving cars.
import * as THREE from 'three';
import { groundHeight, COLORS } from './config.js';
import { collide } from './city.js';
import { makeFigure } from './traffic.js';
import { Car } from './vehicles.js';

export class Player {
  constructor(scene, rng, x, z) {
    this.mesh = makeFigure(rng, 0xd9822b);
    // Rex's signature cap.
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x22242c }));
    cap.position.y = 2.14; this.mesh.add(cap);
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(x, groundHeight(x, z), z);
    this.heading = Math.PI; this.speed = 0;
    this.car = null;             // car currently driven
    this.ownCar = new Car(scene, COLORS.playerCar, x + 6, z + 4, Math.PI / 2);
    this.health = 100; this.walkPhase = 0;
    this.sync();
  }
  get x() { return this.car ? this.car.x : this.pos.x; }
  get z() { return this.car ? this.car.z : this.pos.z; }
  get y() { return this.car ? this.car.pos.y : this.pos.y; }
  get headingNow() { return this.car ? this.car.heading : this.heading; }
  get speedNow() { return this.car ? this.car.speed : this.speed; }
  anchor() { return new THREE.Vector3(this.x, this.y, this.z); }

  nearestCar(cars, maxD = 4.2) {
    let best = null, bd = maxD;
    for (const c of cars) {
      if (c.dead) continue;
      const d = Math.hypot(c.x - this.pos.x, c.z - this.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  enter(car) {
    this.car = car; this.mesh.visible = false;
    return car === this.ownCar ? 'own' : 'stolen';
  }
  exit() {
    if (!this.car) return;
    this.pos.set(this.car.x + Math.cos(this.car.heading) * 2.4, 0, this.car.z - Math.sin(this.car.heading) * 2.4);
    this.pos.y = groundHeight(this.pos.x, this.pos.z);
    this.heading = this.car.heading; this.car = null;
    this.mesh.visible = true; this.sync();
  }
  update(dt, input, colliders, cars) {
    if (this.car) {
      this.car.drive(dt, input, colliders);
      if (this.car.crashed) { this.car.crashed = false; this.bumpEvent = true; }
      return;
    }
    const f = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    const s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const moving = f !== 0 || s !== 0;
    if (moving) {
      const base = Math.atan2(s, f);
      // Camera-relative-ish: heading set directly from key direction in world axes.
      this.heading = Math.atan2(-s, f) + input.camYaw;
      const run = input.run ? 8.4 : 4.6;
      this.speed = run;
      this.pos.x += Math.sin(this.heading) * run * dt;
      this.pos.z += Math.cos(this.heading) * run * dt;
      this.walkPhase += dt * (input.run ? 11 : 8);
    } else this.speed = 0;
    this.pos.x = Math.max(-630, Math.min(272, this.pos.x));
    this.pos.z = Math.max(-268, Math.min(340, this.pos.z));
    collide(this.pos, 0.9, colliders);
    for (const c of cars) { // don't walk through cars
      const d = Math.hypot(c.x - this.pos.x, c.z - this.pos.z);
      if (d < 2.4 && d > 0.01) {
        this.pos.x += (this.pos.x - c.x) / d * (2.4 - d);
        this.pos.z += (this.pos.z - c.z) / d * (2.4 - d);
      }
    }
    this.pos.y = groundHeight(this.pos.x, this.pos.z);
    this.sync();
  }
  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.position.y += Math.abs(Math.sin(this.walkPhase)) * 0.07;
    this.mesh.rotation.y = this.heading;
  }
}
