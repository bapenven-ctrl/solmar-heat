// Staging for the four screenshots. Each scene places the player, the
// traffic, the police and the mission state so a single frame shows as
// much of the game as possible, and names the camera that frames it.
// Used by tools/shoot.mjs through ?scene=<name>; never part of free play.

import * as THREE from 'three';
import { makeCarMesh, Vehicle } from './vehicles.js';
import { makePedMesh } from './traffic.js';

export const SCENE_NAMES = ['cover', 'harbor', 'district2', 'finale'];

function heroCar(game, color, x, z, angle) {
  const mesh = makeCarMesh(game.rng, { color });
  game.scene.add(mesh);
  const vehicle = new Vehicle(mesh, { maxSpeed: 34 });
  vehicle.angle = angle;
  vehicle.setPosition(x, z, game.city.groundHeight);
  game.addVehicle(vehicle);
  game.player.enterCar(vehicle);
  return vehicle;
}

// A stationary car sitting in a traffic lane: in a still frame it reads
// as traffic, and the live circuits fill the streets around it.
function laneCar(game, color, x, z, angle) {
  const mesh = makeCarMesh(game.rng, { color });
  game.scene.add(mesh);
  const vehicle = new Vehicle(mesh, {});
  vehicle.angle = angle;
  vehicle.setPosition(x, z, game.city.groundHeight);
  game.addVehicle(vehicle);
  return vehicle;
}

function stagedCop(game, x, z, angle) {
  const mesh = makeCarMesh(game.rng, { police: true });
  game.scene.add(mesh);
  const cop = new Vehicle(mesh, { maxSpeed: 36, accel: 15 });
  cop.angle = angle;
  cop.setPosition(x, z, game.city.groundHeight);
  cop.isCop = true;
  game.police.cops.push(cop);
  game.addVehicle(cop);
  return cop;
}

function bystander(game, x, z, angle) {
  const mesh = makePedMesh(game.rng);
  mesh.position.set(x, game.city.groundHeight(x, z), z);
  mesh.rotation.y = angle;
  game.scene.add(mesh);
  return mesh;
}

export function stageScene(game, name) {
  const { player, police, missions, hud } = game;
  switch (name) {
    case 'cover': {
      // Golden hour on the main avenue: the hero car rolls north in
      // traffic between the towers, first mission on the HUD.
      const car = heroCar(game, 0xe8641e, 43.4, 50, 0);
      car.speed = 8;
      laneCar(game, 0x2e6fd8, 43.4, 92, 0);
      laneCar(game, 0xf2b035, 36.6, 118, Math.PI);
      laneCar(game, 0xe8e6df, 43.4, 138, 0);
      laneCar(game, 0xd94f30, 36.6, 74, Math.PI);
      missions.index = 0;
      hud.setCash(1250);
      game.objectiveOverride = {
        no: 'MISI 1/7 — Bang Jali, Pelabuhan',
        title: 'Paket Pertama',
        text: 'Ambil paket di dermaga, antar ke Kafe Senja di pusat kota.',
        target: { x: -35, z: -80 },
      };
      return {
        hour: 17.9,
        camera: { pos: [36, 3.4, 32], look: [44, 1.6, 76] },
        drive: { x: 43.4, z: 400, speed: 8.5 },
      };
    }
    case 'harbor': {
      // Afternoon chase along the quay: two patrol cars on the player's
      // tail, the race's next gate ahead, cranes and boats behind.
      const car = heroCar(game, 0x2e6fd8, 62, -8.6, -Math.PI / 2);
      car.speed = 12;
      police.wanted = 1.6; // two stars
      stagedCop(game, 84, -8.6, -Math.PI / 2).speed = 12.5;
      stagedCop(game, 97, -15.2, -Math.PI / 2).speed = 12;
      missions.index = 1;
      missions.startMission({ police, rng: game.rng });
      if (missions.active) missions.active.checkpoint = 1;
      hud.setCash(1650);
      return {
        hour: 16.8,
        // From above the city side, looking south-west across the chase
        // to the quay, the piers and the sea behind them. The height
        // keeps the palm crowns below the sightline.
        camera: { pos: [98, 10.5, 26], look: [26, 1, -15] },
        drive: { x: -260, z: -8.6, speed: 12 },
      };
    }
    case 'district2': {
      // Morning at the Bukit Cemara viewpoint: Raka on foot by his car,
      // the whole city and the sea spread out below.
      player.placeAt(2.5, 426, Math.PI);
      const mesh = makeCarMesh(game.rng, { color: 0xe8641e });
      game.scene.add(mesh);
      const car = new Vehicle(mesh, {});
      car.angle = 0.5;
      car.setPosition(7.5, 422.5, game.city.groundHeight);
      car.parked = true;
      game.addVehicle(car);
      bystander(game, -3.5, 427.5, Math.PI - 0.4);
      bystander(game, -5.2, 425.8, Math.PI + 0.3);
      missions.index = 3;
      hud.setCash(2100);
      game.objectiveOverride = {
        no: 'MISI 4/7 — Nona Laras, Hotel Melati',
        title: 'Antar ke Bukit Cemara',
        text: 'Gardu pandang Bukit Cemara — kota Solmar dan teluknya di bawah sana.',
        target: { x: 0, z: 420 },
      };
      return {
        hour: 9.2,
        camera: { pos: [13.5, 31.5, 443], look: [-4, 25.5, 392] },
        drive: null,
      };
    }
    case 'finale': {
      // Night standoff: the last delivery, a roadblock across the avenue
      // and the helicopter's searchlight pinned on the hero car.
      const car = heroCar(game, 0xe8641e, 3.4, 128, 0);
      car.speed = 0;
      police.wanted = 3.6; // four stars
      police.placeRoadblock(player, 0);
      if (police.roadblock) {
        // Pull the roadblock closer so it reads clearly in the frame.
        // (parts already includes the two roadblock cars' meshes.)
        const dz = -20;
        for (const part of police.roadblock.parts) part.position.z += dz;
        police.roadblock.z += dz;
        police.extraColliders = police.extraColliders.map((c) => ({ ...c, minZ: c.minZ + dz, maxZ: c.maxZ + dz }));
      }
      stagedCop(game, 9.5, 108, 0.1);
      police.spawnHeli();
      if (police.heli) police.heli.group.position.set(18, 31, 146);
      hud.setCash(3200);
      game.objectiveOverride = {
        no: 'MISI 7/7 — Bang Jali, Pelabuhan',
        title: 'Paket Terakhir',
        text: 'Antar ke hanggar bandara — lewati blokade!',
        target: { x: 208, z: 168 },
      };
      return {
        hour: 21.4,
        camera: { pos: [-16, 6, 100], look: [4, 6.5, 170] },
        drive: null,
      };
    }
    default:
      return { hour: 10, camera: { pos: [0, 8, -16], look: [0, 1, 30] }, drive: null };
  }
}

// A fixed cinematic camera with a barely-there drift, so staged frames
// feel alive without wandering off.
export function shotCamera(stage, shot, elapsed) {
  const drift = Math.sin(elapsed * 0.25) * 0.7;
  stage.camera.position.set(
    shot.camera.pos[0] + drift,
    shot.camera.pos[1] + Math.sin(elapsed * 0.4) * 0.25,
    shot.camera.pos[2],
      );
  stage.camera.lookAt(shot.camera.look[0], shot.camera.look[1], shot.camera.look[2]);
  stage.focus.set(shot.camera.look[0], 0, shot.camera.look[2]);
}
