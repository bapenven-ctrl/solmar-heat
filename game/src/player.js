// Rex Marlowe on foot: a simple third-person character who walks, runs,
// enters the nearest car and steps back out of it. The mesh is a few boxes
// and a sphere — a jacket, jeans, head and cap — with a walk swing.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { clampToCity, resolveBuildingCollision } from './city.js';

/** Build Rex: jacket torso, jeans legs, head and a cap. */
export function buildPlayerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: '#c0392b' });
  const jeans = new THREE.MeshLambertMaterial({ color: '#2c3e50' });
  const skin = new THREE.MeshLambertMaterial({ color: '#e8b98a' });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.36), jacket);
  torso.position.y = 1.15;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.75;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: '#1a1a1a' }));
  cap.position.y = 1.95;
  group.add(cap);
  const legGeo = new THREE.BoxGeometry(0.24, 0.75, 0.28);
  const leftLeg = new THREE.Mesh(legGeo, jeans);
  leftLeg.position.set(-0.16, 0.38, 0);
  const rightLeg = new THREE.Mesh(legGeo, jeans);
  rightLeg.position.set(0.16, 0.38, 0);
  group.add(leftLeg);
  group.add(rightLeg);
  const armGeo = new THREE.BoxGeometry(0.18, 0.7, 0.22);
  const leftArm = new THREE.Mesh(armGeo, jacket);
  leftArm.position.set(-0.42, 1.15, 0);
  const rightArm = new THREE.Mesh(armGeo, jacket);
  rightArm.position.set(0.42, 1.15, 0);
  group.add(rightArm);
  return { group, leftLeg, rightLeg, leftArm, rightArm };
}

/** Create the player record at the spawn intersection. */
export function createPlayer(scene) {
  const { group, leftLeg, rightLeg, leftArm, rightArm } = buildPlayerMesh();
  group.position.set(PLAYER.spawn.x, 0, PLAYER.spawn.z);
  scene.add(group);
  return {
    mesh: group,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    pos: new THREE.Vector3(PLAYER.spawn.x, 0, PLAYER.spawn.z),
    heading: Math.PI,
    speed: 0,
    onFoot: true,
    car: null,
    walkPhase: 0,
    invulnerable: 0,
  };
}

/**
 * Move the player on foot one fixed step. `move` is {x, z} in world space
 * (already rotated by the camera); `run` is shift. Returns true on a hit.
 */
export function walkPlayer(player, move, run, dt, colliders) {
  const length = Math.hypot(move.x, move.z);
  const targetSpeed = length > 0.01 ? (run ? PLAYER.runSpeed : PLAYER.walkSpeed) : 0;
  player.speed += (targetSpeed - player.speed) * Math.min(1, dt * 10);
  if (length > 0.01) {
    const nx = move.x / length;
    const nz = move.z / length;
    player.heading = Math.atan2(-nx, -nz);
    const next = player.pos.clone();
    next.x += nx * player.speed * dt;
    next.z += nz * player.speed * dt;
    clampToCity(next);
    resolveBuildingCollision(next, PLAYER.radius, colliders);
    player.pos.copy(next);
    player.walkPhase += player.speed * dt * 2.2;
  }
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.heading;
  const swing = Math.sin(player.walkPhase) * Math.min(1, player.speed / PLAYER.walkSpeed) * 0.5;
  player.leftLeg.rotation.x = swing;
  player.rightLeg.rotation.x = -swing;
  player.leftArm.rotation.x = -swing * 0.8;
  player.rightArm.rotation.x = swing * 0.8;
}

/** The nearest drivable car within 4 units of the player, or null. */
export function nearestCarToEnter(player, cars) {
  let best = null;
  let bestDist = 4;
  for (const car of cars) {
    if (!car.active || car.kind === 'police') continue;
    const dist = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
    if (dist < bestDist) {
      bestDist = dist;
      best = car;
    }
  }
  return best;
}

/** Put the player into `car`: the mesh hides, the car becomes the player car. */
export function enterCar(player, car) {
  player.onFoot = false;
  player.car = car;
  player.mesh.visible = false;
  car.kind = 'player';
}

/** Step out of the car beside its driver door. */
export function exitCar(player) {
  const car = player.car;
  if (!car) return;
  player.onFoot = true;
  player.car = null;
  const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
  player.pos.copy(car.pos).addScaledVector(side, 3);
  player.pos.y = 0;
  player.heading = car.heading;
  player.mesh.visible = true;
  player.mesh.position.copy(player.pos);
  car.kind = 'traffic';
}
