// The screenshot scenes behind ?shot=cover|start|chase|mission. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by a simple autopilot that drives the road grid toward a
// target — slowing for bends, never flooring it while turning or already
// fast — so the frame is what a short game really looks like and the same
// seed always gives the same frame.
import { CAR, STEP } from './config.js';
import { createCar } from './vehicles.js';
import { enterCar } from './player.js';
import { nearestRoadCoord } from './city.js';

const COVER_SECONDS = 6;
const CHASE_SECONDS = 12;
const MISSION_LIMIT_SECONDS = 45;
const START_SECONDS = 5;

/** A route plus the autopilot's stuck-recovery state. */
function createRoute(waypoints) {
  return { waypoints: [...waypoints], lastX: null, lastZ: null, stuckTime: 0, reverseTime: 0 };
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

/**
 * Waypoints along the road grid from `from` to `to`: first along the road
 * the car is on, then along the target's road, then the target itself.
 */
function planRoute(from, to) {
  const waypoints = [];
  const fromRoadX = nearestRoadCoord(from.x);
  const fromRoadZ = nearestRoadCoord(from.z);
  const toRoadX = nearestRoadCoord(to.x);
  const toRoadZ = nearestRoadCoord(to.z);
  if (Math.abs(from.x - fromRoadX) < 7) {
    waypoints.push({ x: fromRoadX, z: toRoadZ });
    waypoints.push({ x: toRoadX, z: toRoadZ });
  } else {
    waypoints.push({ x: toRoadX, z: fromRoadZ });
    waypoints.push({ x: toRoadX, z: toRoadZ });
  }
  waypoints.push({ x: to.x, z: to.z });
  return waypoints;
}

/**
 * Drive input toward the next waypoint. driveCar turns the heading down
 * when steer is positive, so steer is the negative of the heading error.
 * The car creeps through a bend instead of stopping in it, starts the turn
 * before the intersection centre, and reverses briefly if it gets wedged.
 */
function autopilotDrive(game, route) {
  const car = game.player.car;
  const idle = { driveThrottle: 0, driveBrake: 0, driveSteer: 0, moveX: 0, moveZ: 0 };
  if (!car) return idle;
  const waypoints = route.waypoints;
  const forward = { x: -Math.sin(car.heading), z: -Math.cos(car.heading) };
  while (waypoints.length > 0) {
    const next = waypoints[0];
    const dx = next.x - car.pos.x;
    const dz = next.z - car.pos.z;
    const behind = dx * forward.x + dz * forward.z < -1;
    if (Math.hypot(dx, dz) < 7 || behind) waypoints.shift();
    else break;
  }
  if (waypoints.length === 0) return { ...idle, driveBrake: 1 };

  // Stuck? If the car barely moved for a second while it had a target,
  // reverse out for a moment instead of grinding against the wall.
  if (route.lastX !== null) {
    const moved = Math.hypot(car.pos.x - route.lastX, car.pos.z - route.lastZ);
    if (moved < 0.4 && Math.abs(car.speed) < 1.5) {
      route.stuckTime += STEP;
      if (route.stuckTime > 1 && route.reverseTime <= 0) route.reverseTime = 0.8;
    } else {
      route.stuckTime = 0;
    }
  }
  route.lastX = car.pos.x;
  route.lastZ = car.pos.z;
  if (route.reverseTime > 0) {
    route.reverseTime -= STEP;
    return { driveThrottle: 0, driveBrake: 1, driveSteer: 0.5, moveX: 0, moveZ: 0 };
  }

  // Aim at the next waypoint once close to this one, so the bend starts
  // inside the intersection instead of past it.
  let target = waypoints[0];
  const toCurrent = Math.hypot(target.x - car.pos.x, target.z - car.pos.z);
  if (toCurrent < 12 && waypoints.length > 1) target = waypoints[1];
  const dx = target.x - car.pos.x;
  const dz = target.z - car.pos.z;
  const desired = Math.atan2(-dx, -dz);
  const diff = wrapAngle(desired - car.heading);
  const speed = Math.abs(car.speed);
  const turning = Math.abs(diff) > 0.5;
  let throttle = 0;
  let brake = 0;
  if (turning) {
    // Creep through the bend at low speed; brake only when too fast.
    if (speed < 4) throttle = 0.6;
    else if (speed > CAR.turnSpeed) brake = 0.6;
  } else if (speed < CAR.fastSpeed) {
    throttle = 1;
  }
  const steer = Math.max(-1, Math.min(1, -diff * 2.2));
  return { driveThrottle: throttle, driveBrake: brake, driveSteer: steer, moveX: 0, moveZ: 0 };
}

/** Put the player in a fresh car at (x, z), facing `heading`. */
function putPlayerInCar(game, x, z, heading, color) {
  const car = createCar(game.scene, x, z, heading, color, false);
  car.speed = 0;
  game.traffic.cars.push(car);
  enterCar(game.player, car);
  return car;
}

/** Move a few traffic cars onto the road ahead of the player, for a busy street. */
function crowdStreet(game, roadX, zFrom, zTo, count) {
  let placed = 0;
  for (const car of game.traffic.cars) {
    if (placed >= count) break;
    if (car.kind !== 'traffic' || car === game.player.car) continue;
    const z = zFrom + (placed / count) * (zTo - zFrom);
    car.pos.set(roadX + (placed % 2 === 0 ? -2.2 : 2.2), 0, z);
    car.heading = placed % 2 === 0 ? 0 : Math.PI;
    car.vertical = true;
    car.dir = placed % 2 === 0 ? -1 : 1;
    car.speed = car.cruise;
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
    placed += 1;
  }
}

/** Put `count` police cars head-on ahead of the player, light bars on. */
function placePoliceAhead(game, count) {
  const car = game.player.car;
  const forward = { x: -Math.sin(car.heading), z: -Math.cos(car.heading) };
  const right = { x: -forward.z, z: forward.x };
  let placed = 0;
  for (const cop of game.police.cars) {
    if (placed >= count) break;
    const lateral = placed === 0 ? -4 : 4;
    cop.pos.set(
      car.pos.x + forward.x * 35 + right.x * lateral, 0,
      car.pos.z + forward.z * 35 + right.z * lateral,
    );
    cop.heading = car.heading + Math.PI;
    cop.speed = 16;
    cop.mesh.position.copy(cop.pos);
    cop.mesh.rotation.y = cop.heading;
    placed += 1;
  }
  while (placed < count) {
    const lateral = placed === 0 ? -4 : 4;
    const cop = createCar(
      game.scene,
      car.pos.x + forward.x * 35 + right.x * lateral,
      car.pos.z + forward.z * 35 + right.z * lateral,
      car.heading + Math.PI,
      '#ffffff',
      true,
    );
    cop.speed = 16;
    game.police.cars.push(cop);
    placed += 1;
  }
}

function stepFor(game, seconds, inputFn) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    game.step(STEP, inputFn(game));
  }
}

/**
 * Set `game` to the named scene and return the screen to draw. The game is
 * fresh from its seed; each scene only arranges it and plays it forward.
 */
export function stageShot(name, game) {
  if (name === 'start') {
    game.screen = 'title';
    stepFor(game, START_SECONDS, () => ({ driveThrottle: 0, driveBrake: 0, driveSteer: 0, moveX: 0, moveZ: 0 }));
    return 'title';
  }

  if (name === 'chase') {
    game.startPlay();
    game.missions.startMission(1);
    putPlayerInCar(game, 0, 40, 0, '#c0392b');
    game.wanted = 3;
    const route = createRoute([
      { x: 0, z: -40 }, { x: 40, z: -40 }, { x: 40, z: 40 },
      { x: -40, z: 40 }, { x: -40, z: -40 }, { x: 0, z: -40 },
    ]);
    stepFor(game, CHASE_SECONDS - 1, (g) => autopilotDrive(g, route));
    // Bring two police cars into frame: head-on down the same road, light
    // bars flashing, closing on the player as the picture is taken.
    game.wanted = 3;
    placePoliceAhead(game, 2);
    game.hud.toast('Kejar-kejaran polisi! Wanted ★★★');
    stepFor(game, 0.6, (g) => autopilotDrive(g, route));
    return 'play';
  }

  if (name === 'mission') {
    game.startPlay();
    game.missions.startMission(0);
    game.missions.setStage(1);
    putPlayerInCar(game, 0, -40, -Math.PI / 2, '#2471a3');
    const route = createRoute(planRoute(game.player.car.pos, { x: 104, z: -68 }));
    let done = false;
    for (let i = 0; i < MISSION_LIMIT_SECONDS / STEP && !done; i += 1) {
      game.step(STEP, autopilotDrive(game, route));
      if (game.screen === 'missionComplete') done = true;
    }
    return game.screen === 'missionComplete' ? 'missionComplete' : 'play';
  }

  // Cover: driving a busy street with the HUD, the minimap, a wanted star
  // and the delivery objective all in frame.
  game.startPlay();
  game.missions.startMission(0);
  game.missions.setStage(1);
  putPlayerInCar(game, 0, 60, 0, '#c0392b');
  game.wanted = 1;
  crowdStreet(game, 0, 45, -35, 6);
  const route = createRoute(planRoute(game.player.car.pos, { x: 104, z: -68 }));
  stepFor(game, COVER_SECONDS, (g) => autopilotDrive(g, route));
  return 'play';
}
