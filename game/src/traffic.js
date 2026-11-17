// Traffic and pedestrians: AI cars that follow the road grid and turn at
// intersections, parked cars along the kerb, and walkers on the sidewalks
// who run away when a crime happens near them.
import * as THREE from 'three';
import { CAR, TRAFFIC } from './config.js';
import { createCar, driveCar, trafficColor } from './vehicles.js';
import { isOnRoad, nearestRoadCoord } from './city.js';
import { pickRandom } from './random.js';

const PED_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#fd79a8'];

/** A pedestrian: a small capsule figure walking a sidewalk. */
function buildPedestrianMesh(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.9, 3, 8),
    new THREE.MeshLambertMaterial({ color }),
  );
  body.position.y = 1.0;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshLambertMaterial({ color: '#e8b98a' }),
  );
  head.position.y = 1.85;
  group.add(head);
  return group;
}

/** Spawn the traffic cars, parked cars and pedestrians for a fresh world. */
export function createTraffic(scene, rng, colliders) {
  const cars = [];
  const pedestrians = [];
  const lanes = [-2.2, 2.2];

  function randomRoadCar() {
    const vertical = rng() < 0.5;
    const road = pickRandom(rng, [-80, -40, 0, 40, 80]);
    const along = -100 + rng() * 200;
    const lane = pickRandom(rng, lanes);
    const dir = rng() < 0.5 ? 1 : -1;
    const x = vertical ? road + lane : along;
    const z = vertical ? along : road + lane;
    const heading = vertical ? (dir > 0 ? Math.PI : 0) : dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    return { x, z, heading, vertical, dir };
  }

  for (let i = 0; i < TRAFFIC.cars; i += 1) {
    const spot = randomRoadCar();
    const car = createCar(scene, spot.x, spot.z, spot.heading, trafficColor(rng), false);
    car.speed = TRAFFIC.speedMin + rng() * (TRAFFIC.speedMax - TRAFFIC.speedMin);
    car.vertical = spot.vertical;
    car.dir = spot.dir;
    car.cruise = car.speed;
    cars.push(car);
  }

  for (let i = 0; i < TRAFFIC.parked; i += 1) {
    const vertical = rng() < 0.5;
    const road = pickRandom(rng, [-80, -40, 0, 40, 80]);
    const along = -95 + rng() * 190;
    const side = rng() < 0.5 ? -1 : 1;
    const x = vertical ? road + side * 4.2 : along;
    const z = vertical ? along : road + side * 4.2;
    const heading = vertical ? (side > 0 ? Math.PI : 0) : side > 0 ? -Math.PI / 2 : Math.PI / 2;
    const car = createCar(scene, x, z, heading, trafficColor(rng), false);
    car.kind = 'parked';
    car.speed = 0;
    cars.push(car);
  }

  for (let i = 0; i < TRAFFIC.pedestrians; i += 1) {
    const vertical = rng() < 0.5;
    const road = pickRandom(rng, [-80, -40, 0, 40, 80]);
    const along = -100 + rng() * 200;
    const side = rng() < 0.5 ? -1 : 1;
    const mesh = buildPedestrianMesh(pickRandom(rng, PED_COLORS));
    const x = vertical ? road + side * 7 : along;
    const z = vertical ? along : road + side * 7;
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    pedestrians.push({
      mesh,
      pos: new THREE.Vector3(x, 0, z),
      heading: rng() * Math.PI * 2,
      speed: TRAFFIC.pedSpeedMin + rng() * (TRAFFIC.pedSpeedMax - TRAFFIC.pedSpeedMin),
      vertical,
      dir: rng() < 0.5 ? 1 : -1,
      fleeTimer: 0,
      fleeFrom: new THREE.Vector3(),
      hitCooldown: 0,
    });
  }

  return { cars, pedestrians };
}

function deriveDirection(car) {
  // Snap the heading to a clean right angle and read back which way the
  // car now travels, so the "car ahead" check always agrees with it.
  const twoPi = Math.PI * 2;
  let h = ((car.heading % twoPi) + twoPi) % twoPi;
  h = Math.round(h / (Math.PI / 2)) * (Math.PI / 2);
  car.heading = h;
  if (Math.abs(h) < 0.01 || Math.abs(h - twoPi) < 0.01) { car.vertical = true; car.dir = -1; }
  else if (Math.abs(h - Math.PI) < 0.01) { car.vertical = true; car.dir = 1; }
  else if (Math.abs(h - Math.PI / 2) < 0.01) { car.vertical = false; car.dir = -1; }
  else { car.vertical = false; car.dir = 1; }
}

function turnAtIntersection(car, rng) {
  // At an intersection: mostly straight on, sometimes left or right.
  const roll = rng();
  const turn = roll < 0.6 ? 0 : roll < 0.8 ? 1 : -1;
  if (turn === 0) return;
  car.heading += turn * (Math.PI / 2) * (car.vertical ? car.dir : -car.dir);
  deriveDirection(car);
  car.turnCooldown = 1.5;
}

/** One fixed step of traffic: cars drive their lanes, pedestrians walk. */
export function updateTraffic(traffic, rng, dt, colliders, playerPos) {
  for (const car of traffic.cars) {
    if (!car.active || car.kind === 'parked' || car.kind === 'player' || car.kind === 'police') continue;
    // Slow down for a car ahead in the same lane.
    let targetSpeed = car.cruise;
    for (const other of traffic.cars) {
      if (other === car || !other.active) continue;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      const ahead = car.vertical ? Math.abs(dx) < 3 && dz * car.dir > 0 && dz * car.dir < 11
        : Math.abs(dz) < 3 && dx * car.dir > 0 && dx * car.dir < 11;
      if (ahead) targetSpeed = Math.min(targetSpeed, other.speed * 0.9);
    }
    car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2);
    if (car.turnCooldown > 0) car.turnCooldown -= dt;
    const forward = new THREE.Vector3(-Math.sin(car.heading), 0, -Math.cos(car.heading));
    const next = car.pos.clone().addScaledVector(forward, car.speed * dt);
    const nearX = nearestRoadCoord(next.x);
    const nearZ = nearestRoadCoord(next.z);
    if (car.turnCooldown <= 0 && Math.abs(next.x - nearX) < 2.5 && Math.abs(next.z - nearZ) < 2.5) {
      next.x = nearX;
      next.z = nearZ;
      turnAtIntersection(car, rng);
    }
    car.pos.copy(next);
    if (Math.abs(car.pos.x) > 108 || Math.abs(car.pos.z) > 108) {
      // Loop back to the far side so the streets never empty out.
      car.pos.x = -car.pos.x * 0.9;
      car.pos.z = -car.pos.z * 0.9;
    }
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
  }

  for (const ped of traffic.pedestrians) {
    if (ped.fleeTimer > 0) {
      ped.fleeTimer -= dt;
      const away = ped.pos.clone().sub(ped.fleeFrom).setY(0);
      if (away.lengthSq() > 0.01) away.normalize();
      ped.pos.addScaledVector(away, TRAFFIC.fleeSpeed * dt);
      ped.heading = Math.atan2(-away.x, -away.z);
    } else {
      const step = ped.speed * dt * ped.dir;
      if (ped.vertical) ped.pos.z += step;
      else ped.pos.x += step;
      if (Math.abs(ped.pos.x) > 105 || Math.abs(ped.pos.z) > 105) ped.dir *= -1;
      const nearX = nearestRoadCoord(ped.pos.x);
      const nearZ = nearestRoadCoord(ped.pos.z);
      if (Math.abs(ped.pos.x - nearX) < 1.5 && Math.abs(ped.pos.z - nearZ) < 1.5 && rng() < 0.01) {
        ped.vertical = !ped.vertical;
        ped.dir = rng() < 0.5 ? 1 : -1;
      }
      ped.heading = ped.vertical ? (ped.dir > 0 ? Math.PI : 0) : ped.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    // Keep walkers on the pavement, out of buildings and the sea.
    ped.pos.x = Math.max(-108, Math.min(104, ped.pos.x));
    ped.pos.z = Math.max(-108, Math.min(108, ped.pos.z));
    ped.mesh.position.copy(ped.pos);
    ped.mesh.rotation.y = ped.heading;
    if (ped.hitCooldown > 0) ped.hitCooldown -= dt;
  }
}

/** Make every pedestrian near `point` run away from it. */
export function scarePedestrians(traffic, point, radius) {
  for (const ped of traffic.pedestrians) {
    if (ped.pos.distanceTo(point) < radius) {
      ped.fleeTimer = 3;
      ped.fleeFrom.copy(point);
    }
  }
}
