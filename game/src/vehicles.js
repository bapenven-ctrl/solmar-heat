// Cars: how they look and how they drive. One mesh builder serves the
// player's cars, parked cars, traffic and police — only the colour and the
// light bar differ. Driving is simple arcade physics: accelerate, brake,
// reverse, steer (less at speed), and slide out of buildings.
import * as THREE from 'three';
import { CAR } from './config.js';
import { clampToCity, resolveBuildingCollision } from './city.js';

const CAR_COLORS = ['#c0392b', '#2471a3', '#d4ac0d', '#7d3c98', '#1e8449', '#b9770e', '#2e4053', '#a93226'];

/** Pick a traffic colour from the seeded generator. */
export function trafficColor(random) {
  return CAR_COLORS[Math.floor(random() * CAR_COLORS.length)];
}

/** Build a low-poly car mesh. `police` adds a black-and-white body and a light bar. */
export function buildCarMesh(color, police) {
  const group = new THREE.Group();
  const bodyColor = police ? '#e8e8e8' : color;
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 4.4), bodyMat);
  body.position.y = 0.65;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.65, 2.2),
    new THREE.MeshLambertMaterial({ color: police ? '#1a1a1a' : '#20242c' }),
  );
  cabin.position.set(0, 1.3, -0.2);
  group.add(cabin);
  if (police) {
    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(2.05, 0.3, 4.45),
      new THREE.MeshLambertMaterial({ color: '#141414' }),
    );
    skirt.position.y = 0.35;
    group.add(skirt);
  }
  const wheelMat = new THREE.MeshLambertMaterial({ color: '#111111' });
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, 0.42, z);
    group.add(wheel);
  }
  const headMat = new THREE.MeshLambertMaterial({ color: '#fff6c8', emissive: '#ffee88', emissiveIntensity: 0.7 });
  for (const x of [-0.6, 0.6]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), headMat);
    light.position.set(x, 0.7, 2.22);
    group.add(light);
  }
  let lightBar = null;
  if (police) {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.22, 0.4),
      new THREE.MeshLambertMaterial({ color: '#ff2222', emissive: '#ff2222', emissiveIntensity: 1.5 }),
    );
    red.position.x = -0.35;
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.22, 0.4),
      new THREE.MeshLambertMaterial({ color: '#2244ff', emissive: '#2244ff', emissiveIntensity: 1.5 }),
    );
    blue.position.x = 0.35;
    lightBar.add(red);
    lightBar.add(blue);
    lightBar.position.y = 1.75;
    lightBar.userData = { red, blue };
    group.add(lightBar);
  }
  return { group, lightBar };
}

/** A car record: position, heading, speed and its mesh. */
export function createCar(scene, x, z, heading, color, police) {
  const { group, lightBar } = buildCarMesh(color, police);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  return {
    mesh: group,
    lightBar,
    pos: new THREE.Vector3(x, 0, z),
    heading,
    speed: 0,
    kind: police ? 'police' : 'traffic',
    color,
    active: true,
    lastRamAt: -99,
    turnCooldown: 0,
    stopped: false,
  };
}

/** Flash the police light bar: red on one beat, blue on the next. */
export function flashLightBar(car, time) {
  if (!car.lightBar) return;
  const on = Math.floor(time / 0.25) % 2 === 0;
  car.lightBar.userData.red.material.emissiveIntensity = on ? 2.2 : 0.15;
  car.lightBar.userData.blue.material.emissiveIntensity = on ? 0.15 : 2.2;
}

/**
 * Drive one car one fixed step. `drive` is {throttle, brake, steer} with
 * steer -1..1. Returns true when the car hit a building this step.
 */
export function driveCar(car, drive, dt, colliders) {
  const forward = new THREE.Vector3(-Math.sin(car.heading), 0, -Math.cos(car.heading));
  if (drive.throttle > 0) car.speed += CAR.accel * drive.throttle * dt;
  if (drive.brake > 0) {
    if (car.speed > 0.5) car.speed -= CAR.brake * drive.brake * dt;
    else car.speed -= CAR.reverseAccel * drive.brake * dt;
  }
  if (drive.throttle <= 0 && drive.brake <= 0) car.speed -= Math.sign(car.speed) * 6 * dt;
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
  if (Math.abs(car.speed) < 0.05 && drive.throttle <= 0 && drive.brake <= 0) car.speed = 0;
  const steerAuthority = Math.min(1, Math.abs(car.speed) / 6);
  car.heading -= drive.steer * CAR.turnRate * steerAuthority * Math.sign(car.speed || 1) * dt;
  const next = car.pos.clone().addScaledVector(forward, car.speed * dt);
  clampToCity(next);
  const hit = resolveBuildingCollision(next, CAR.radius, colliders);
  if (hit) car.speed *= 0.45;
  car.pos.copy(next);
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = car.heading;
  return hit;
}

/** Keep two cars from overlapping: push them apart along the line between them. */
export function separateCars(a, b) {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const dist = Math.hypot(dx, dz);
  const min = CAR.radius * 1.6;
  if (dist >= min || dist < 0.001) return;
  const push = (min - dist) / 2;
  const nx = dx / dist;
  const nz = dz / dist;
  a.pos.x -= nx * push;
  a.pos.z -= nz * push;
  b.pos.x += nx * push;
  b.pos.z += nz * push;
  a.mesh.position.copy(a.pos);
  b.mesh.position.copy(b.pos);
}
