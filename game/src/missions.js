// The three story missions, in order: pick up a package at the docks and
// deliver it to the marina; escape a two-star police chase to the hideout;
// steal a marked car from a rival gang and deliver it to the garage. Each
// mission has a golden beacon at its target, a HUD objective that changes
// as it progresses, and a "MISI SELESAI" screen with its reward and an
// auto-save when it is done.
import * as THREE from 'three';
import { MISSIONS } from './config.js';
import { createCar, trafficColor } from './vehicles.js';
import { spawnGang } from './combat.js';

function buildBeacon(scene) {
  const group = new THREE.Group();
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  column.position.y = 30;
  group.add(column);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.4),
    new THREE.MeshLambertMaterial({ color: '#ffd24a', emissive: '#cc9900', emissiveIntensity: 0.8 }),
  );
  gem.position.y = 4;
  group.add(gem);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.2, 24),
    new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  group.add(ring);
  group.userData = { gem, ring };
  scene.add(group);
  return group;
}

export function createMissions(game) {
  const beacon = buildBeacon(game.scene);
  const state = {
    index: 0,
    stage: 0,
    target: null,
    targetCar: null,
    completed: false,
    done: false,
  };

  function targetOf() {
    const mission = MISSIONS[state.index];
    if (!mission) return null;
    if (mission.id === 'docks') return state.stage === 0 ? mission.pickup : mission.dropoff;
    if (mission.id === 'escape') return mission.hideout;
    return state.stage === 0 ? mission.targetCar : mission.garage;
  }

  function objectiveText() {
    const mission = MISSIONS[state.index];
    if (!mission) return 'Semua misi selesai — jelajahi Solmar sesukamu!';
    if (mission.id === 'docks') return state.stage === 0 ? mission.pickupText : mission.deliverText;
    if (mission.id === 'escape') return mission.hideoutText;
    return state.stage === 0 ? mission.stealText : mission.deliverText;
  }

  function placeBeacon() {
    state.target = targetOf();
    if (state.target) {
      beacon.visible = true;
      beacon.position.set(state.target.x, 0, state.target.z);
    } else {
      beacon.visible = false;
    }
  }

  function startMission(index) {
    state.index = index;
    state.stage = 0;
    state.completed = false;
    state.done = false;
    const mission = MISSIONS[index];
    if (!mission) {
      placeBeacon();
      return;
    }
    if (mission.id === 'escape') {
      game.wanted = 2;
      game.hud.toast('Polisi mengejarmu! Kabur ke tempat persembunyian!');
    }
    if (mission.id === 'steal' && !state.targetCar) {
      const spot = mission.targetCar;
      state.targetCar = createCar(game.scene, spot.x, spot.z, Math.PI / 2, '#ffd24a', false);
      state.targetCar.kind = 'parked';
      game.gang = spawnGang(game.scene, [
        { x: spot.x - 4, z: spot.z - 3 },
        { x: spot.x + 4, z: spot.z - 2 },
        { x: spot.x + 1, z: spot.z + 5 },
      ]);
      game.traffic.cars.push(state.targetCar);
    }
    game.hud.toast(`Misi ${index + 1}: ${mission.name}`);
    placeBeacon();
  }

  function arriveAt(target, radius) {
    const pos = game.player.onFoot ? game.player.pos : game.player.car.pos;
    return Math.hypot(pos.x - target.x, pos.z - target.z) < radius;
  }

  function completeMission() {
    const mission = MISSIONS[state.index];
    state.completed = true;
    game.money += mission.reward;
    game.audio.pickup();
    game.saveGame();
    game.hud.showMissionComplete(mission, game.money);
    game.screen = 'missionComplete';
  }

  /** One fixed step: beacon spin, arrival checks, stage advances. */
  function update(dt) {
    beacon.userData.gem.rotation.y += dt * 2;
    beacon.userData.ring.scale.setScalar(1 + Math.sin(game.time * 3) * 0.12);
    if (state.done || state.index >= MISSIONS.length) return;
    const mission = MISSIONS[state.index];
    const target = state.target;
    if (!target) return;

    if (mission.id === 'docks') {
      if (state.stage === 0 && arriveAt(target, 7)) {
        state.stage = 1;
        game.audio.pickup();
        game.hud.toast('Paket diambil! Antar ke marina.');
        placeBeacon();
      } else if (state.stage === 1 && arriveAt(target, 7)) {
        completeMission();
      }
    } else if (mission.id === 'escape') {
      if (arriveAt(target, 8)) {
        game.wanted = 0;
        completeMission();
      }
    } else if (mission.id === 'steal') {
      if (state.stage === 0) {
        const inTarget = game.player.car === state.targetCar;
        if (inTarget) {
          state.stage = 1;
          game.hud.toast('Mobil target dicuri! Antar ke garasi — awas geng rival!');
          placeBeacon();
        }
      } else if (arriveAt(target, 8) && game.player.car === state.targetCar) {
        completeMission();
      }
    }
  }

  /** Move on to the next mission after the complete screen is dismissed. */
  function nextMission() {
    state.index += 1;
    if (state.index >= MISSIONS.length) {
      state.done = true;
      placeBeacon();
      game.hud.toast('Semua misi selesai! Solmar milikmu, Rex.');
      return;
    }
    startMission(state.index);
  }

  /** Jump a mission to a later stage (used by the screenshot staging). */
  function setStage(stage) {
    state.stage = stage;
    placeBeacon();
  }

  return {
    state,
    startMission,
    setStage,
    update,
    nextMission,
    objectiveText,
    get currentMission() {
      return MISSIONS[state.index] || null;
    },
  };
}
