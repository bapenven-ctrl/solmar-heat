// Staged, deterministic scenes for the four screenshots. Each shot starts
// the game mid-action with several systems visible at once — never a menu.
import * as THREE from 'three';
import { PLACES } from './config.js';
import { MISSION_DEFS } from './missions.js';

function placeCar(G, car, x, z, heading, speed = 0) {
  car.pos.set(x, G.groundAt(x, z), z); car.heading = heading; car.speed = speed; car.sync();
}

export function applyShot(G, name) {
  const P = G.player;
  G.mode = 'play'; G.hud.showTitle(false);
  if (name === 'cover') {
    G.missions.start(6); G.missions.step = 1;         // Paket Terakhir, antar leg
    placeCar(G, P.ownCar, 40, 0, Math.PI / 2, 19);
    P.enter(P.ownCar);
    G.setWanted(4);
    G.police.update(0.016, G);                        // spawns units, roadblock, heli
    const u = G.police.units;
    if (u[0]) placeCar(G, u[0], 25, -5.5, Math.PI / 2, 0);
    if (u[1]) placeCar(G, u[1], 25, 5.5, Math.PI / 2, 0);
    if (u[2]) placeCar(G, u[2], 48, -7, Math.PI / 2, 0);
    const rb = G.police.roadblock;                    // pull the block into frame
    if (rb) {
      for (const c of rb.cars) placeCar(G, c, c.x - 20, c.z, c.heading, 0);
      for (const b of rb.bars) b.position.x -= 20;
      rb.x -= 20;
    }
    if (G.police.heli) { G.police.heli.visible = true; G.police.heli.position.set(64, P.y + 12, 4); }
    G.shotFreeze = true;
    G.stage.snap(P.anchor(), Math.PI / 2);
  } else if (name === 'harbor') {
    G.missions.start(0);
    P.pos.set(199, 0, -117); P.heading = Math.atan2(PLACES.harbor.x - 199, PLACES.harbor.z + 117);
    P.pos.y = G.groundAt(P.pos.x, P.pos.z); P.sync();
    const pkg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1),
      new THREE.MeshStandardMaterial({ color: 0xd9a441, emissive: 0x664d00 }));
    pkg.position.set(PLACES.harbor.x, 0.6, PLACES.harbor.z); G.scene.add(pkg);
    placeCar(G, P.ownCar, 190, -108, 0.4, 0);
    G.stage.snap(P.anchor(), P.heading);
  } else if (name === 'district2') {
    G.missions.start(3);                              // Balapan Dermaga active
    placeCar(G, P.ownCar, -452, 93.4, -Math.PI / 2, 13);
    P.enter(P.ownCar);
    const hillCars = G.traffic.cars.filter(c => c.hill);
    if (hillCars[0]) placeCar(G, hillCars[0], -478, 86.6, Math.PI / 2, 10);
    if (hillCars[1]) placeCar(G, hillCars[1], -486, 93.4, -Math.PI / 2, 10);
    G.stage.snap(P.anchor(), -Math.PI / 2);
  } else if (name === 'finale') {
    G.money = 1250;
    G.missions.start(6); G.missions.step = 1;
    placeCar(G, P.ownCar, 88, 318, Math.PI / 2, 8);
    P.enter(P.ownCar);
    G.setWanted(0);
    G.hud.showComplete(MISSION_DEFS[6]);
    G.hud.el.complete.style.background = 'rgba(16,10,26,0.42)';
    G.hud.flashSaved();
    G.hud.toast('Paket Terakhir terkirim!');
    G.stage.snap(P.anchor(), Math.PI / 2);
  }
}
