// Solmar Heat — entry point. Boots the stage and every system, runs the
// game loop, owns the input, the camera, crime bookkeeping, saving, and
// the screenshot staging mode (?scene=<name>) used by tools/shoot.mjs.

import * as THREE from 'three';
import { createStage } from './render.js';
import { Rng, hashSeed } from './random.js';
import { buildCity } from './city.js';
import { SoundBank } from './audio.js';
import { Traffic } from './traffic.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { MissionRunner, MISSIONS } from './missions.js';
import { Combat } from './combat.js';
import { Hud } from './hud.js';
import { stageScene, shotCamera, SCENE_NAMES } from './shots.js';
import { TUNING } from './config.js';

window.__ERRORS = [];
window.addEventListener('error', (e) => window.__ERRORS.push(String(e.message || e.error)));

// ---------------------------------------------------------------- boot
const container = document.getElementById('stage');
const stage = createStage(container);
const rng = new Rng(hashSeed('solmar-heat-r4'));
const city = buildCity(stage.scene, rng);
const sound = new SoundBank();
const combat = new Combat(stage.scene, sound);
const traffic = new Traffic(stage.scene, city, rng);
const player = new Player(stage.scene, city);
const police = new Police(stage.scene, city, rng, sound, combat);
const missions = new MissionRunner(stage.scene, city, sound);
const hud = new Hud();

const extraVehicles = [];
const game = {
  scene: stage.scene,
  stage,
  city,
  player,
  traffic,
  police,
  missions,
  hud,
  sound,
  rng,
  objectiveOverride: null,
  addVehicle: (v) => extraVehicles.push(v),
  // Staging sets the wallet directly; the HUD loop reads state.cash.
  setCash: (n) => { state.cash = n; },
};

window.__GAME = game; // staging/debugging handle for tools/shoot.mjs

const SAVE_KEY = 'solmar-heat-save-v1';
const state = {
  mode: 'menu', // menu | play | pause
  cash: 100,
  hour: 17.9,
  lastHourSet: -1,
  lastGlow: -1,
  shootCooldown: 0,
  crimeCooldown: 0,
  autosaveAt: 0,
  startedAt: performance.now() / 1000,
};

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      missionIndex: missions.index,
      health: player.health,
    }));
  } catch { /* storage unavailable */ }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------- input
const keys = new Set();
let mouseDown = false;
let mouseDragged = 0;
let dragButton = -1;
let lastMouse = { x: 0, y: 0 };
let camYawOffset = 0;
let camPitch = 0.32;

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyE') tryInteract();
  if (e.code === 'KeyM') {
    sound.setMuted(!sound.muted);
    hud.toast(sound.muted ? 'Suara mati' : 'Suara nyala');
  }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
container.addEventListener('mousedown', (e) => {
  sound.resume();
  mouseDown = true;
  dragButton = e.button;
  mouseDragged = 0;
  lastMouse = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mousemove', (e) => {
  if (!mouseDown) return;
  const dx = e.clientX - lastMouse.x;
  const dy = e.clientY - lastMouse.y;
  lastMouse = { x: e.clientX, y: e.clientY };
  mouseDragged += Math.abs(dx) + Math.abs(dy);
  const orbiting = dragButton === 2 || player.mode === 'car' || mouseDragged > 8;
  if (orbiting) {
    camYawOffset -= dx * 0.005;
    camPitch = THREE.MathUtils.clamp(camPitch + dy * 0.004, 0.08, 1.1);
  }
});
window.addEventListener('mouseup', () => {
  mouseDown = false;
  dragButton = -1;
});
container.addEventListener('contextmenu', (e) => e.preventDefault());

function tryInteract() {
  if (state.mode !== 'play' || shotMode) return;
  if (player.mode === 'car') {
    if (player.vehicle && Math.abs(player.vehicle.speed) < 2) {
      player.exitCar();
      sound.engine(false);
    }
    return;
  }
  const all = allVehicles();
  const target = player.nearestEnterable(all);
  if (target) {
    player.enterCar(target);
    sound.beep();
    let witnessed = false;
    for (const cop of police.cops) {
      if (cop.mesh.position.distanceToSquared(player.pos) < 34 * 34) witnessed = true;
    }
    if (witnessed) {
      police.addCrime(0.9);
      hud.toast('Polisi melihatmu mencuri mobil!');
    }
  }
}

function togglePause() {
  if (shotMode) return;
  if (state.mode === 'play') {
    state.mode = 'pause';
    document.getElementById('pause-screen').style.display = 'flex';
    saveGame();
  } else if (state.mode === 'pause') {
    state.mode = 'play';
    document.getElementById('pause-screen').style.display = 'none';
  }
}

document.getElementById('btn-new').addEventListener('click', () => {
  sound.resume();
  clearSave();
  state.cash = 100;
  missions.index = 0;
  player.healFull();
  player.placeAt(-6, 20, 0.6);
  police.reset();
  startPlay();
});
document.getElementById('btn-continue').addEventListener('click', () => {
  sound.resume();
  const save = loadSave();
  if (save) {
    state.cash = save.cash ?? 100;
    missions.loadData({ index: save.missionIndex ?? 0 });
    player.health = save.health ?? 100;
  }
  startPlay();
});
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-quit').addEventListener('click', () => {
  document.getElementById('pause-screen').style.display = 'none';
  document.getElementById('start-screen').style.display = 'flex';
  hud.show(false);
  state.mode = 'menu';
});
if (loadSave()) document.getElementById('btn-continue').style.display = '';

function startPlay() {
  document.getElementById('start-screen').style.display = 'none';
  hud.show(true);
  state.mode = 'play';
  state.hour = 8.2;
  hud.toast('Selamat datang di Solmar. Ikuti penanda emas!');
}

// ---------------------------------------------------------------- shot mode
const params = new URLSearchParams(location.search);
const shotName = params.get('scene');
const shotMode = !!shotName && SCENE_NAMES.includes(shotName);
let shot = null;
let shotFrames = 0;
if (shotMode) {
  document.getElementById('start-screen').style.display = 'none';
  hud.show(true);
  state.mode = 'play';
  shot = stageScene(game, shotName);
  state.hour = shot.hour;
  stage.setHour(shot.hour);
  state.lastHourSet = shot.hour;
}

// ---------------------------------------------------------------- helpers
function allVehicles() {
  const set = new Set(traffic.vehicles());
  for (const c of police.cops) set.add(c);
  if (missions.thief) set.add(missions.thief);
  for (const v of extraVehicles) set.add(v);
  if (player.vehicle) set.add(player.vehicle);
  return [...set];
}

function worldNow() {
  return {
    colliders: police.extraColliders.length ? city.colliders.concat(police.extraColliders) : city.colliders,
    groundHeight: city.groundHeight,
  };
}

const camTargetPos = new THREE.Vector3();
let camYaw = Math.PI;

function updateCamera(dt) {
  if (shotMode) {
    shotCamera(stage, shot, performance.now() / 1000 - state.startedAt);
    return;
  }
  if (state.mode === 'menu') {
    const t = performance.now() / 1000 * 0.03;
    stage.camera.position.set(Math.cos(t) * 120, 42, 105 + Math.sin(t) * 120);
    stage.camera.lookAt(0, 4, 105);
    stage.focus.set(0, 0, 105);
    return;
  }
  const target = player.pos;
  const heading = player.mode === 'car' && player.vehicle ? player.vehicle.angle : player.angle;
  let want = heading + Math.PI + camYawOffset;
  let diff = want - camYaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  camYaw += diff * Math.min(1, dt * (player.mode === 'car' ? 3.2 : 6));
  camYawOffset *= Math.pow(0.4, dt); // drift back behind the player
  const dist = player.mode === 'car' ? 10.5 : 7;
  const height = (player.mode === 'car' ? 3.6 : 2.8) + camPitch * 4;
  camTargetPos.set(
    target.x + Math.sin(camYaw) * dist * Math.cos(camPitch),
    target.y + height,
    target.z + Math.cos(camYaw) * dist * Math.cos(camPitch),
  );
  // Keep the camera out of the ground on the hill.
  const minY = city.groundHeight(camTargetPos.x, camTargetPos.z) + 1.4;
  if (camTargetPos.y < minY) camTargetPos.y = minY;
  stage.camera.position.lerp(camTargetPos, Math.min(1, dt * 7));
  const look = new THREE.Vector3(target.x, target.y + 1.7, target.z);
  look.x += Math.sin(heading) * 2.4;
  look.z += Math.cos(heading) * 2.4;
  stage.camera.lookAt(look);
  stage.focus.copy(target);
}

function playerShoot(now) {
  const dir = new THREE.Vector3();
  stage.camera.getWorldDirection(dir);
  const targetPoint = stage.camera.position.clone().addScaledVector(dir, 46);
  const muzzle = player.muzzlePoint(new THREE.Vector3());
  const shootDir = targetPoint.sub(muzzle).normalize();
  player.angle = Math.atan2(shootDir.x, shootDir.z);

  const targets = [];
  for (const ped of traffic.peds) {
    if (ped.dead) continue;
    const p = ped.mesh.position;
    targets.push({ kind: 'ped', ref: ped, x: p.x, y: p.y + 1.1, z: p.z, r: 0.62 });
  }
  for (const v of allVehicles()) {
    const p = v.mesh.position;
    targets.push({ kind: v.isCop ? 'copcar' : 'car', ref: v, x: p.x, y: p.y + 0.8, z: p.z, r: 2.35 });
  }
  const heli = police.heliTarget();
  if (heli) targets.push(heli);

  combat.shoot(muzzle, shootDir, targets, city.colliders, {
    onHit: (hit) => {
      if (hit.kind === 'ped') {
        hit.ref.kill();
        police.addCrime(1.2);
        hud.toast('Kau menembak warga!');
        hud.damageFlash();
      } else if (hit.kind === 'copcar') {
        hit.ref.health -= 16;
        police.addCrime(0.6);
      } else if (hit.kind === 'car') {
        hit.ref.health -= 14;
        if (police.cops.length) police.addCrime(0.35);
      } else if (hit.kind === 'heli') {
        police.damageHeli(9);
        hud.toast('Helikopter terkena!');
      }
    },
  });
  traffic.scareAll(player.pos, now, 30);
  if (police.cops.length || police.wanted > 0) police.addCrime(0.3);
}

function respawnPlayer(note) {
  police.reset();
  missions.cleanup({ police });
  if (player.mode === 'car') player.exitCar();
  player.healFull();
  player.placeAt(-6, 20, 0.6);
  hud.banner(note.big, note.sub, 3400);
  saveGame();
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, clock.getDelta());
  // Screenshot staging advances on a fixed step: the scene settles the
  // same way on a fast desktop and in a slow software-rendered browser.
  const dt = shotMode ? 1 / 30 : realDt;
  const now = performance.now() / 1000;
  const world = worldNow();
  const paused = state.mode === 'pause';

  if (!paused) {
    // Day cycle (free play only; shots and the menu hold their hour).
    if (state.mode === 'play' && !shotMode) {
      state.hour = (state.hour + (dt * 24) / TUNING.dayLengthSeconds) % 24;
    }
    if (Math.abs(state.hour - state.lastHourSet) > 0.02) {
      stage.setHour(state.hour);
      state.lastHourSet = state.hour;
    }
    if (Math.abs(stage.windowGlow - state.lastGlow) > 0.05) {
      city.setGlow(stage.windowGlow);
      state.lastGlow = stage.windowGlow;
    }

    const vehicles = allVehicles();
    const inCar = player.mode === 'car' && player.vehicle;

    // --- player / driving input
    if (state.mode === 'play') {
      if (shotMode && shot) {
        if (inCar && shot.drive) {
          const v = player.vehicle;
          const dx = shot.drive.x - v.mesh.position.x;
          const dz = shot.drive.z - v.mesh.position.z;
          const want = Math.atan2(dx, dz);
          let diff = want - v.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          v.update(dt, {
            throttle: v.speed < shot.drive.speed ? 0.85 : 0,
            steer: THREE.MathUtils.clamp(diff * 1.6, -1, 1),
          }, world);
        } else if (inCar) {
          player.vehicle.update(dt, { throttle: 0, steer: 0, handbrake: true }, world);
        }
      } else if (inCar) {
        const v = player.vehicle;
        const control = {
          throttle: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + (keys.has('KeyS') || keys.has('ArrowDown') ? -1 : 0),
          steer: (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + (keys.has('KeyD') || keys.has('ArrowRight') ? -1 : 0),
          handbrake: keys.has('Space'),
        };
        if (keys.has('ShiftLeft')) control.throttle *= 1.25;
        v.update(dt, control, world);
        if (v.impact > 7) {
          sound.crash(Math.min(1, v.impact / 20));
          if (v.impact > 14) player.damage(3);
          if (state.crimeCooldown <= 0) {
            for (const cop of police.cops) {
              if (cop.mesh.position.distanceToSquared(v.mesh.position) < 6 * 6) {
                police.addCrime(0.5);
                state.crimeCooldown = 4;
              }
            }
          }
        }
        sound.engine(true, Math.abs(v.speed) / v.maxSpeed);
      } else if (player.mode === 'foot') {
        sound.engine(false);
        // Camera-relative movement.
        const fwd = new THREE.Vector3();
        stage.camera.getWorldDirection(fwd);
        fwd.y = 0;
        fwd.normalize();
        const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
        const wish = new THREE.Vector3();
        if (keys.has('KeyW') || keys.has('ArrowUp')) wish.add(fwd);
        if (keys.has('KeyS') || keys.has('ArrowDown')) wish.sub(fwd);
        if (keys.has('KeyD') || keys.has('ArrowRight')) wish.add(right);
        if (keys.has('KeyA') || keys.has('ArrowLeft')) wish.sub(right);
        const aiming = mouseDown && dragButton === 0;
        player.update(dt, {
          x: wish.x,
          z: wish.z,
          run: keys.has('ShiftLeft'),
          aiming,
          aimAngle: aiming ? Math.atan2(fwd.x, fwd.z) : null,
        }, world);
        hud.setCrosshair(true);
        state.shootCooldown -= dt;
        if (aiming && state.shootCooldown <= 0 && !player.dead) {
          state.shootCooldown = 0.24;
          playerShoot(now);
        }
      }
      if (player.mode === 'car' && player.vehicle) player.vehicle.setBeam(stage.streetLightsOn);
    }

    state.crimeCooldown = Math.max(0, state.crimeCooldown - dt);

    // --- world systems
    traffic.update(dt, now, {
      vehicles,
      playerPos: player.pos,
      playerOnFoot: player.mode === 'foot',
      world,
      onPedHit: (v) => {
        if (player.vehicle === v) {
          police.addCrime(1.1);
          hud.toast('Kau menabrak pejalan kaki!');
          hud.damageFlash();
        }
      },
    });
    if (state.mode === 'play') {
      missions.update(dt, now, { player, police, rng, world });
      for (const ev of missions.drainEvents()) {
        if (ev.type === 'start') {
          hud.hideComplete();
          hud.toast(`Misi dimulai: ${ev.mission.title}`);
        } else if (ev.type === 'stage') hud.toast(ev.text);
        else if (ev.type === 'complete') {
          state.cash += ev.payout;
          hud.banner('MISI SELESAI', `${ev.mission.title} — +$${ev.payout.toLocaleString('en-US')}`);
          hud.showComplete({ mission: ev.mission.title, payout: ev.payout, total: state.cash });
          if (missions.allDone) hud.banner('CERITA TAMAT', 'Semua 7 misi selesai. Solmar milikmu, Raka.', 5200);
          saveGame();
        } else if (ev.type === 'fail') {
          hud.banner('MISI GAGAL', `${ev.mission.title} — ${ev.reason}`);
        }
      }
      police.update(dt, now, { player, world, dark: stage.streetLightsOn });
      if (police.events.busted) {
        const fine = Math.min(state.cash, 300);
        state.cash -= fine;
        respawnPlayer({ big: 'TERTANGKAP', sub: `Polisi menahanmu. Denda $${fine}.` });
      }
      if (player.dead) {
        const fine = Math.min(state.cash, 150);
        state.cash -= fine;
        respawnPlayer({ big: 'TEWAS', sub: `Kau terbangun di Klinik Solmar. Biaya $${fine}.` });
      }
    }

    // Car-to-car separation after everyone has moved.
    for (const v of vehicles) v.resolveVehicles(vehicles);

    combat.update(dt);
    city.update(dt, now);
    if (state.mode === 'play' && !shotMode) {
      state.autosaveAt += dt;
      if (state.autosaveAt > 12) {
        state.autosaveAt = 0;
        saveGame();
      }
    }
  }

  updateCamera(dt);

  // --- HUD
  if (state.mode !== 'menu') {
    hud.setCash(state.cash);
    hud.setWanted(police.stars);
    hud.setClock(state.hour);
    hud.setHealth(player.health / 100);
    const obj = game.objectiveOverride ?? missions.objective();
    const dist = obj.target ? Math.hypot(player.pos.x - obj.target.x, player.pos.z - obj.target.z) : null;
    hud.setObjective(obj, dist);
    if (player.mode === 'car' && player.vehicle) hud.setSpeed(player.vehicle.speedKmh(), 'DI MOBIL');
    else hud.setSpeed(0, 'DI JALAN');
    hud.setCrosshair(player.mode === 'foot' && state.mode === 'play' && !shotMode);
    hud.drawMinimap({
      px: player.pos.x,
      pz: player.pos.z,
      angle: player.mode === 'car' && player.vehicle ? player.vehicle.angle : player.angle,
      target: obj.target,
      cops: police.cops.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
      heli: police.heli ? { x: police.heli.group.position.x, z: police.heli.group.position.z } : null,
      thief: missions.thief ? { x: missions.thief.mesh.position.x, z: missions.thief.mesh.position.z } : null,
      cases: missions.caseMeshes.filter((c) => c.visible).map((c) => ({ x: c.position.x, z: c.position.z })),
      pois: MISSIONS.map((m) => m.giver),
    });
  }

  stage.render();

  if (shotMode) {
    shotFrames++;
    if (shotFrames > 45) window.__SHOT_READY = true;
  }
}

stage.setHour(state.hour);
state.lastHourSet = state.hour;
frame();
