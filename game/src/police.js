// The wanted system and the police who answer it. Stars rise on crimes
// (stealing a car, hitting a pedestrian, ramming a police car, shooting)
// and fall when the player stays out of sight long enough. Police cars
// spawn on the roads, chase the player, and ram — but only once every two
// seconds, for a small amount of damage, so a chase is tense, not lethal.
import * as THREE from 'three';
import { POLICE } from './config.js';
import { createCar, driveCar, flashLightBar, separateCars } from './vehicles.js';
import { nearestRoadCoord } from './city.js';

export function createPoliceSystem(scene, rng) {
  return {
    scene,
    rng,
    cars: [],
    evadeTimer: 0,
    spawnTimer: 0,
  };
}

function spawnPoliceCar(system, playerPos, rng) {
  // Appear on a road 45–60 units from the player, roughly behind them.
  const angle = rng() * Math.PI * 2;
  const dist = 45 + rng() * 15;
  let x = nearestRoadCoord(playerPos.x + Math.cos(angle) * dist);
  let z = nearestRoadCoord(playerPos.z + Math.sin(angle) * dist);
  x = Math.max(-100, Math.min(100, x));
  z = Math.max(-100, Math.min(100, z));
  const car = createCar(system.scene, x, z, 0, '#ffffff', true);
  car.speed = 10;
  system.cars.push(car);
  return car;
}

function removePoliceCar(system, car) {
  car.active = false;
  system.scene.remove(car.mesh);
  const index = system.cars.indexOf(car);
  if (index !== -1) system.cars.splice(index, 1);
}

/** Raise the wanted level (0–5) and note the crime for the HUD toast. */
export function addWanted(game, amount, reason) {
  const before = game.wanted;
  game.wanted = Math.min(5, game.wanted + amount);
  if (game.wanted > before && game.hud) game.hud.toast(`${reason} — Wanted ${'★'.repeat(game.wanted)}`);
}

/**
 * One fixed step: keep the right number of police cars on the road, chase
 * the player, ram with a cooldown, and let the heat die down when the
 * player escapes.
 */
export function updatePolice(system, game, dt) {
  const wanted = game.wanted;
  const targetPos = game.player.onFoot ? game.player.pos : game.player.car.pos;
  system.spawnTimer -= dt;

  const wantedCount = Math.min(wanted, POLICE.maxActive);
  while (system.cars.length < wantedCount && system.spawnTimer <= 0) {
    spawnPoliceCar(system, targetPos, system.rng);
    system.spawnTimer = 1.5;
  }
  while (system.cars.length > wantedCount) {
    removePoliceCar(system, system.cars[system.cars.length - 1]);
  }

  let nearestPolice = Infinity;
  for (const car of system.cars) {
    // Steer toward the player: turn the heading toward the target, slow
    // for tight turns, never floor it while turning.
    const dx = targetPos.x - car.pos.x;
    const dz = targetPos.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    nearestPolice = Math.min(nearestPolice, dist);
    const desired = Math.atan2(-dx, -dz);
    let diff = desired - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turning = Math.abs(diff) > 0.35;
    const speedLimit = turning ? 7 : POLICE.chaseSpeed;
    const throttle = car.speed < speedLimit ? 1 : 0;
    const steer = Math.max(-1, Math.min(1, -diff * 2));
    driveCar(car, { throttle, brake: 0, steer }, dt, game.city.colliders);
    flashLightBar(car, game.time);

    // Ram: a short shove and a little damage, at most once per cooldown.
    const playerTarget = game.player.onFoot ? game.player : game.player.car;
    const hitDist = Math.hypot(playerTarget.pos.x - car.pos.x, playerTarget.pos.z - car.pos.z);
    if (hitDist < POLICE.ramRange && game.time - car.lastRamAt >= POLICE.ramCooldown) {
      car.lastRamAt = game.time;
      game.damagePlayer(POLICE.ramDamage, 'Polisi menabrakmu!');
      const away = new THREE.Vector3(
        playerTarget.pos.x - car.pos.x, 0, playerTarget.pos.z - car.pos.z,
      ).normalize();
      if (game.player.onFoot) {
        game.player.pos.addScaledVector(away, 1.5);
      } else {
        game.player.car.pos.addScaledVector(away, 2);
        game.player.car.speed *= 0.7;
      }
      car.speed *= 0.4;
      // Back off after the hit instead of grinding against the player.
      car.pos.addScaledVector(away, -2.5);
    }
  }

  // Separate police cars from each other and from traffic.
  for (let i = 0; i < system.cars.length; i += 1) {
    for (let j = i + 1; j < system.cars.length; j += 1) separateCars(system.cars[i], system.cars[j]);
    for (const other of game.traffic.cars) {
      if (other.active && other.kind !== 'police') separateCars(system.cars[i], other);
    }
  }

  // Evade: no police close by for long enough and the heat drops a star.
  if (wanted > 0) {
    if (nearestPolice > POLICE.evadeDistance) {
      system.evadeTimer += dt;
      if (system.evadeTimer >= POLICE.evadeSeconds) {
        system.evadeTimer = 0;
        game.wanted = Math.max(0, game.wanted - 1);
        if (game.hud) game.hud.toast(`Lolos dari kejaran — Wanted ${'★'.repeat(game.wanted) || 'bersih'}`);
      }
    } else {
      system.evadeTimer = 0;
    }
  } else {
    system.evadeTimer = 0;
  }

  game.audio.siren(wanted > 0 && system.cars.length > 0, dt);
}
