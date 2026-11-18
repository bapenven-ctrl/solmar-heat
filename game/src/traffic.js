// Traffic cars looping the road network, parked cars waiting to be
// stolen, and pedestrians strolling the sidewalks (who sensibly run
// away from gunfire and fast cars).

import * as THREE from 'three';
import { WORLD, TUNING, PALETTE } from './config.js';
import { makeCarMesh, Vehicle } from './vehicles.js';

function densify(pts, step = 6) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) out.push([x1 + ((x2 - x1) * k) / n, z1 + ((z2 - z1) * k) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function offsetPath(pts, offset) {
  return pts.map(([x, z], i) => {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    // Right-hand side of the direction of travel.
    return [x + (dz / len) * offset, z - (dx / len) * offset];
  });
}

class TrafficCar {
  constructor(vehicle, path, rng) {
    this.vehicle = vehicle;
    this.path = path; // array of [x,z] lane points
    this.i = rng.int(0, path.length - 1);
    this.dir = 1;
    this.cruise = rng.range(8, 12.5);
    const [x, z] = path[this.i];
    const [nx, nz] = path[(this.i + 1) % path.length];
    vehicle.angle = Math.atan2(nx - x, nz - z);
    vehicle.setPosition(x, z, null);
  }

  control(ctx) {
    const v = this.vehicle;
    const p = v.mesh.position;
    let target = this.path[this.i];
    let dx = target[0] - p.x;
    let dz = target[1] - p.z;
    if (Math.hypot(dx, dz) < 5.5) {
      this.i += this.dir;
      if (this.i >= this.path.length || this.i < 0) {
        if (this.path.loop) {
          this.i = (this.i + this.path.length) % this.path.length;
        } else {
          this.dir *= -1;
          this.i += this.dir * 2;
          // On the way back the lane is the other side of the road.
          this.path = this.path.reversePoints;
        }
      }
      target = this.path[this.i];
      dx = target[0] - p.x;
      dz = target[1] - p.z;
    }
    const want = Math.atan2(dx, dz);
    let diff = want - v.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = THREE.MathUtils.clamp(diff * 1.7, -1, 1);

    // Slow for anything ahead: traffic, the player, a crossing pedestrian.
    let targetSpeed = this.cruise;
    const fx = Math.sin(v.angle);
    const fz = Math.cos(v.angle);
    for (const o of ctx.vehicles) {
      if (o === v) continue;
      const ox = o.mesh.position.x - p.x;
      const oz = o.mesh.position.z - p.z;
      const ahead = ox * fx + oz * fz;
      const side = Math.abs(ox * fz - oz * fx);
      if (ahead > 0 && ahead < 10 && side < 2.4) targetSpeed = Math.min(targetSpeed, ahead < 5 ? 0 : this.cruise * 0.4);
    }
    if (ctx.playerOnFoot) {
      const ox = ctx.playerPos.x - p.x;
      const oz = ctx.playerPos.z - p.z;
      const ahead = ox * fx + oz * fz;
      const side = Math.abs(ox * fz - oz * fx);
      if (ahead > 0 && ahead < 8 && side < 2.2) targetSpeed = 0;
    }
    const throttle = v.speed < targetSpeed ? 0.75 : -0.4;
    return { throttle: targetSpeed === 0 && v.speed < 0.4 ? -0.2 : throttle, steer };
  }
}

const skinTones = [0xf2c79b, 0xc68863, 0x8a5a3b, 0x6e4530];
const shirtColors = [0xd94f30, 0x2e6fd8, 0xf2b035, 0x39b56a, 0xe8e6df, 0xd6336c, 0x1abc9c, 0x935116];

export function makePedMesh(rng) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick(skinTones) });
  const shirt = new THREE.MeshLambertMaterial({ color: rng.pick(shirtColors) });
  const pants = new THREE.MeshLambertMaterial({ color: rng.pick([0x2c3440, 0x5a4632, 0x707880, 0x24304d]) });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.18), pants);
  legL.position.set(-0.11, 0.39, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.24), shirt);
  torso.position.y = 1.08;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.26), skin);
  head.position.y = 1.56;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.6, 0.13), shirt);
  armL.position.set(-0.3, 1.06, 0);
  const armR = armL.clone();
  armR.position.x = 0.3;
  g.add(legL, legR, torso, head, armL, armR);
  g.userData.parts = { legL, legR, armL, armR };
  return g;
}

class Ped {
  constructor(scene, path, rng, groundHeight) {
    this.mesh = makePedMesh(rng);
    scene.add(this.mesh);
    this.path = path;
    this.groundHeight = groundHeight;
    this.t = rng.float();
    this.dir = rng.chance(0.5) ? 1 : -1;
    this.speed = rng.range(1.1, 1.8);
    this.phase = rng.range(0, 6);
    this.fleeUntil = -1;
    this.fleeFrom = new THREE.Vector3();
    this.dead = false;
    this.deadTimer = 0;
    this.place();
  }

  place() {
    const [a, b] = this.path;
    const x = a[0] + (b[0] - a[0]) * this.t;
    const z = a[1] + (b[1] - a[1]) * this.t;
    this.mesh.position.set(x, this.groundHeight(x, z), z);
    this.mesh.rotation.y = Math.atan2((b[0] - a[0]) * this.dir, (b[1] - a[1]) * this.dir);
  }

  scare(from, now) {
    if (this.dead) return;
    this.fleeFrom.copy(from);
    this.fleeUntil = now + 3.2;
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.deadTimer = 18;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = this.groundHeight(this.mesh.position.x, this.mesh.position.z) + 0.25;
  }

  update(dt, now, ctx) {
    const m = this.mesh;
    if (this.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) {
        this.dead = false;
        m.rotation.x = 0;
        this.t = (this.phase * 0.37) % 0.9 + 0.05; // deterministic respawn point
        this.place();
      }
      return;
    }
    const parts = m.userData.parts;
    let moving = true;
    if (now < this.fleeUntil) {
      const away = Math.atan2(m.position.x - this.fleeFrom.x, m.position.z - this.fleeFrom.z);
      m.rotation.y = away;
      m.position.x += Math.sin(away) * 4.6 * dt;
      m.position.z += Math.cos(away) * 4.6 * dt;
      m.position.y = this.groundHeight(m.position.x, m.position.z);
    } else {
      const [a, b] = this.path;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      this.t += (this.speed * dt * this.dir) / len;
      if (this.t > 1) {
        this.t = 1;
        this.dir = -1;
      } else if (this.t < 0) {
        this.t = 0;
        this.dir = 1;
      }
      const prevX = m.position.x;
      const prevZ = m.position.z;
      this.place();
      if (Math.abs(m.position.x - prevX) + Math.abs(m.position.z - prevZ) < 0.0001) moving = false;
    }
    const swing = moving ? Math.sin(now * 9 + this.phase) * 0.55 : 0;
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
    parts.armL.rotation.x = -swing * 0.8;
    parts.armR.rotation.x = swing * 0.8;

    // Run over?
    for (const v of ctx.vehicles) {
      if (v.speed === 0) continue;
      const dx = m.position.x - v.mesh.position.x;
      const dz = m.position.z - v.mesh.position.z;
      if (dx * dx + dz * dz < 1.7 * 1.7 && Math.abs(v.speed) > 3.5) {
        this.kill();
        if (ctx.onPedHit) ctx.onPedHit(v);
        break;
      }
    }
  }
}

export class Traffic {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.cars = [];
    this.parked = [];
    this.peds = [];

    const lanePaths = city.circuits.map((c) => {
      const dense = densify(c.pts, 6);
      const closed = c.mode === 'loop';
      const loopPts = closed ? [...dense, dense[0]] : dense;
      const fwd = offsetPath(loopPts, WORLD.laneOffset);
      fwd.loop = closed;
      if (!closed) {
        const back = offsetPath([...loopPts].reverse(), WORLD.laneOffset);
        back.loop = false;
        fwd.reversePoints = back;
        back.reversePoints = fwd;
      }
      return fwd;
    });

    for (let i = 0; i < TUNING.trafficCount; i++) {
      const path = lanePaths[i % lanePaths.length];
      const mesh = makeCarMesh(rng, { color: rng.pick(PALETTE.carColors) });
      scene.add(mesh);
      const vehicle = new Vehicle(mesh, { maxSpeed: 16, accel: 9 });
      vehicle.setPosition(path[0][0], path[0][1], city.groundHeight);
      const car = new TrafficCar(vehicle, path, rng);
      // Spread the cars along their paths.
      car.i = rng.int(0, path.length - 1);
      const [x, z] = path[car.i];
      const [nx, nz] = path[(car.i + 1) % path.length];
      vehicle.angle = Math.atan2(nx - x, nz - z);
      vehicle.setPosition(x, z, city.groundHeight);
      this.cars.push(car);
    }

    const spots = [...city.parkingSpots];
    for (let i = 0; i < TUNING.parkedCount && spots.length; i++) {
      const idx = rng.int(0, spots.length - 1);
      const spot = spots.splice(idx, 1)[0];
      const mesh = makeCarMesh(rng, { color: rng.pick(PALETTE.carColors) });
      scene.add(mesh);
      const vehicle = new Vehicle(mesh, { angle: spot.angle });
      vehicle.setPosition(spot.x, spot.z, city.groundHeight);
      vehicle.parked = true;
      this.parked.push(vehicle);
    }

    for (let i = 0; i < TUNING.pedCount; i++) {
      const path = city.pedPaths[i % city.pedPaths.length];
      this.peds.push(new Ped(scene, path, rng, city.groundHeight));
    }
  }

  vehicles() {
    return [...this.cars.map((c) => c.vehicle), ...this.parked];
  }

  scareAll(from, now, radius = 26) {
    for (const ped of this.peds) {
      if (ped.mesh.position.distanceToSquared(from) < radius * radius) ped.scare(from, now);
    }
  }

  update(dt, now, ctx) {
    const carCtx = { vehicles: ctx.vehicles, playerPos: ctx.playerPos, playerOnFoot: ctx.playerOnFoot };
    for (const car of this.cars) {
      if (car.vehicle.dead) continue;
      const control = car.control(carCtx);
      car.vehicle.update(dt, control, ctx.world);
    }
    const pedCtx = { vehicles: ctx.vehicles, onPedHit: ctx.onPedHit };
    for (const ped of this.peds) ped.update(dt, now, pedCtx);
  }
}
