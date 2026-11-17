// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens:
// title, play, paused, mission complete and wasted.
//
// ?seed=N fixes the city and the traffic. ?shot=cover|start|chase|mission
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import * as THREE from 'three';
import { CAR, PLAYER, SAVE_KEY, STEP } from './config.js';
import { createSeededRandom } from './random.js';
import { buildCity } from './city.js';
import { createRender } from './render.js';
import { createPlayer, enterCar, exitCar, nearestCarToEnter, walkPlayer } from './player.js';
import { createTraffic, scarePedestrians, updateTraffic } from './traffic.js';
import { addWanted, createPoliceSystem, updatePolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import {
  SCREEN_COMPLETE,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WASTED,
  createHud,
} from './hud.js';
import { createSoundEngine } from './audio.js';
import { stageShot } from './shots.js';
import { driveCar, separateCars } from './vehicles.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;
const SAVE_INTERVAL = 10;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const errors = [];
window.__gameErrors = errors;
window.addEventListener('error', (event) => errors.push(String(event.message || event.error)));
const realConsoleError = console.error.bind(console);
console.error = (...args) => {
  errors.push(args.map(String).join(' '));
  realConsoleError(...args);
};

const canvas = document.getElementById('game');
const status = document.getElementById('status');

/** Build a fresh game world from a seed: renderer, city, player, traffic. */
export function createGame(seedValue) {
  const rng = createSeededRandom(seedValue);
  const render = createRender(canvas);
  const scene = render.scene;
  const city = buildCity(scene, rng);
  const player = createPlayer(scene);
  const traffic = createTraffic(scene, rng, city.colliders);
  const police = createPoliceSystem(scene, rng);
  const audio = createSoundEngine();

  const game = {
    seed: seedValue,
    rng,
    scene,
    camera: render.camera,
    city,
    player,
    traffic,
    police,
    audio,
    gang: [],
    screen: SCREEN_TITLE,
    time: 0,
    money: 0,
    health: PLAYER.maxHealth,
    wanted: 0,
    cameraYaw: player.heading,
    missionsStarted: false,
    policeHitCooldown: 0,
    saveTimer: SAVE_INTERVAL,
    missions: null,
    combat: null,
    hud: null,
  };

  game.missions = createMissions(game);
  game.combat = createCombat(game);
  game.hud = createHud(game);

  function announce(message) {
    status.textContent = message;
  }

  function setScreen(next) {
    game.screen = next;
    game.hud.showOnly(next);
  }

  function saveGame() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: game.money,
        missionIndex: game.missions.state.index,
        x: game.player.pos.x,
        z: game.player.pos.z,
        health: game.health,
      }));
      game.hud.flashSaved();
    } catch {
      // Storage can be off: the save then lasts this visit only.
    }
  }

  function loadSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data.money !== 'number') return null;
      return data;
    } catch {
      return null;
    }
  }

  function startPlay(resumeSave) {
    audio.unlock();
    if (resumeSave) {
      const save = loadSave();
      if (save) {
        game.money = save.money;
        game.health = save.health || PLAYER.maxHealth;
        game.player.pos.set(save.x || PLAYER.spawn.x, 0, save.z || PLAYER.spawn.z);
        game.player.mesh.position.copy(game.player.pos);
        game.missions.startMission(Math.min(save.missionIndex || 0, 2));
        game.missionsStarted = true;
        announce(`Lanjutkan. Misi ${game.missions.state.index + 1}.`);
      }
    }
    if (!game.missionsStarted) {
      game.missions.startMission(0);
      game.missionsStarted = true;
    }
    setScreen(SCREEN_PLAY);
    announce('Bermain. Ikuti objektif misi di layar.');
  }

  function respawn() {
    if (game.player.car) exitCar(game.player);
    game.player.pos.set(PLAYER.spawn.x, 0, PLAYER.spawn.z);
    game.player.mesh.position.copy(game.player.pos);
    game.player.heading = Math.PI;
    game.health = PLAYER.maxHealth;
    game.wanted = 0;
    game.cameraYaw = Math.PI;
    setScreen(SCREEN_PLAY);
    announce('Rex bangkit lagi di persimpangan.');
  }

  function damagePlayer(amount, reason) {
    if (game.player.invulnerable > 0 || game.screen !== SCREEN_PLAY) return;
    game.health -= amount;
    game.player.invulnerable = 0.8;
    game.hud.toast(reason);
    if (game.health <= 0) {
      game.health = 0;
      game.money = Math.max(0, game.money - 50);
      saveGame();
      setScreen(SCREEN_WASTED);
      game.hud.showWasted();
      announce('Tertangkap. Bangkit lagi?');
    }
  }

  game.damagePlayer = damagePlayer;
  game.saveGame = saveGame;
  game.loadSave = loadSave;
  game.startPlay = startPlay;
  game.setScreen = setScreen;

  /** One fixed step of the world, driven by `input` (live keys or autopilot). */
  game.step = function step(dt, input) {
    if (game.screen === SCREEN_TITLE) {
      game.time += dt;
      updateTraffic(traffic, rng, dt, city.colliders, player.pos);
      return;
    }
    if (game.screen !== SCREEN_PLAY) return;
    game.time += dt;
    if (game.policeHitCooldown > 0) game.policeHitCooldown -= dt;
    if (input.mutePressed) {
      audio.toggleMute();
      input.mutePressed = false;
    }

    if (input.enterPressed) {
      input.enterPressed = false;
      if (player.onFoot) {
        const car = nearestCarToEnter(player, traffic.cars);
        if (car) {
          if (car.kind === 'parked') {
            addWanted(game, 1, 'Mencuri mobil');
            scarePedestrians(traffic, player.pos, 18);
          }
          enterCar(player, car);
          audio.click();
        }
      } else {
        exitCar(player);
        audio.click();
      }
    }
    if (input.punchPressed) {
      input.punchPressed = false;
      game.combat.punch();
    }
    if (input.shootPressed) {
      input.shootPressed = false;
      game.combat.shoot();
    }

    if (player.onFoot) {
      walkPlayer(player, { x: input.moveX, z: input.moveZ }, input.run, dt, city.colliders);
      audio.engine(0);
      if (player.speed > 0.5) {
        game.cameraYaw += wrapAngle(player.heading - game.cameraYaw) * Math.min(1, dt * 3);
      }
    } else {
      const car = player.car;
      const hitBuilding = driveCar(car, {
        throttle: input.driveThrottle,
        brake: input.driveBrake,
        steer: input.driveSteer,
      }, dt, city.colliders);
      if (hitBuilding && Math.abs(car.speed) > 12) {
        game.hud.toast('Tabrakan!');
      }
      game.cameraYaw += wrapAngle(car.heading - game.cameraYaw) * Math.min(1, dt * 4);
      audio.engine(Math.abs(car.speed) / CAR.maxSpeed);
      // Hitting a pedestrian with the car is a crime.
      for (const ped of traffic.pedestrians) {
        if (ped.hitCooldown > 0) continue;
        const dist = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
        if (dist < 2.6 && Math.abs(car.speed) > 3) {
          ped.hitCooldown = 5;
          addWanted(game, 1, 'Menabrak pejalan kaki');
          scarePedestrians(traffic, car.pos, 20);
          car.speed *= 0.6;
        }
      }
      // Ramming a police car hard is a crime too.
      for (const cop of police.cars) {
        const dist = Math.hypot(cop.pos.x - car.pos.x, cop.pos.z - car.pos.z);
        if (dist < 4 && Math.abs(car.speed) > 10 && game.policeHitCooldown <= 0) {
          game.policeHitCooldown = 3;
          addWanted(game, 1, 'Menabrak mobil polisi');
        }
      }
    }

    // Keep cars from overlapping each other.
    const cars = traffic.cars;
    for (let i = 0; i < cars.length; i += 1) {
      if (!cars[i].active) continue;
      for (let j = i + 1; j < cars.length; j += 1) {
        if (cars[j].active) separateCars(cars[i], cars[j]);
      }
    }

    updateTraffic(traffic, rng, dt, city.colliders, player.pos);
    updatePolice(police, game, dt);
    game.missions.update(dt);
    game.combat.update(dt);

    if (game.player.invulnerable > 0) game.player.invulnerable -= dt;
    if (game.wanted === 0 && game.health < PLAYER.maxHealth) {
      game.health = Math.min(PLAYER.maxHealth, game.health + 2 * dt);
    }
    game.saveTimer -= dt;
    if (game.saveTimer <= 0) {
      game.saveTimer = SAVE_INTERVAL;
      saveGame();
    }
  };

  /** Paint one frame: the camera, the HUD and the 3D scene. */
  game.draw = function draw(dt) {
    if (game.screen === SCREEN_TITLE) {
      render.orbitCamera(game.time);
    } else {
      const focus = player.onFoot ? player.pos : player.car.pos;
      render.followCamera(focus, game.cameraYaw, player.onFoot ? 9 : 13, player.onFoot ? 4.2 : 6, city.colliders, dt);
    }
    if (game.screen === SCREEN_PLAY || game.screen === SCREEN_COMPLETE) game.hud.update(dt);
    render.render();
  };

  return game;
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

// ---- Live input: held keys plus one-shot presses queued between frames. ----
const keys = new Set();
let actions = 0;
const ACTION_ENTER = 1;
const ACTION_PUNCH = 2;
const ACTION_SHOOT = 4;
const ACTION_PAUSE = 8;
const ACTION_CONFIRM = 16;
const ACTION_MUTE = 32;

const game = createGame(seed);

function liveInput() {
  const forward = keys.has('KeyW') || keys.has('ArrowUp');
  const back = keys.has('KeyS') || keys.has('ArrowDown');
  const left = keys.has('KeyA') || keys.has('ArrowLeft');
  const right = keys.has('KeyD') || keys.has('ArrowRight');
  const fx = -Math.sin(game.cameraYaw);
  const fz = -Math.cos(game.cameraYaw);
  const rx = -fz;
  const rz = fx;
  const along = (forward ? 1 : 0) - (back ? 1 : 0);
  const side = (right ? 1 : 0) - (left ? 1 : 0);
  const input = {
    driveThrottle: forward ? 1 : 0,
    driveBrake: back ? 1 : 0,
    driveSteer: side,
    moveX: fx * along + rx * side,
    moveZ: fz * along + rz * side,
    run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    enterPressed: false,
    punchPressed: false,
    shootPressed: false,
    mutePressed: false,
  };
  if (actions & ACTION_ENTER) input.enterPressed = true;
  if (actions & ACTION_PUNCH) input.punchPressed = true;
  if (actions & ACTION_SHOOT) input.shootPressed = true;
  if (actions & ACTION_MUTE) input.mutePressed = true;
  actions = 0;
  return input;
}

function takeActionFlags() {
  const taken = actions;
  actions = 0;
  return taken;
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyE' && !event.repeat) actions |= ACTION_ENTER;
  else if (event.code === 'KeyF' && !event.repeat) actions |= ACTION_PUNCH;
  else if ((event.code === 'KeyP' || event.code === 'Escape') && !event.repeat) actions |= ACTION_PAUSE;
  else if ((event.code === 'Enter' || event.code === 'Space') && !event.repeat) actions |= ACTION_CONFIRM;
  else if (event.code === 'KeyM' && !event.repeat) actions |= ACTION_MUTE;
  keys.add(event.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());
canvas.addEventListener('pointerdown', (event) => {
  game.audio.unlock();
  if (event.button === 0) actions |= ACTION_SHOOT;
});

document.getElementById('start-btn').addEventListener('click', () => {
  game.audio.unlock();
  game.audio.click();
  game.startPlay(false);
});
document.getElementById('continue-btn').addEventListener('click', () => {
  game.audio.unlock();
  game.audio.click();
  game.startPlay(true);
});
document.getElementById('resume-btn').addEventListener('click', () => {
  game.audio.click();
  game.setScreen(SCREEN_PLAY);
});
document.getElementById('next-btn').addEventListener('click', () => {
  game.audio.click();
  game.missions.nextMission();
  game.setScreen(SCREEN_PLAY);
});
document.getElementById('respawn-btn').addEventListener('click', () => {
  game.audio.click();
  game.startPlay(false);
  game.health = PLAYER.maxHealth;
  game.wanted = 0;
  game.player.pos.set(PLAYER.spawn.x, 0, PLAYER.spawn.z);
  game.player.mesh.position.copy(game.player.pos);
});
game.hud.muteButton.addEventListener('click', () => {
  game.audio.unlock();
  game.audio.toggleMute();
});

if (game.loadSave()) document.getElementById('continue-btn').style.display = 'inline-block';

function runShot(name) {
  const screen = stageShot(name, game);
  game.setScreen(screen);
  let painted = 0;
  function paint() {
    game.draw(STEP);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();

  function handleActions() {
    const flags = takeActionFlags();
    // Pause, confirm and mute belong to the screens; the rest (enter the
    // car, punch, shoot) is handed back so the next step can use it.
    actions |= flags & (ACTION_ENTER | ACTION_PUNCH | ACTION_SHOOT);
    if (flags & ACTION_MUTE) game.audio.toggleMute();
    if (flags & ACTION_PAUSE) {
      if (game.screen === SCREEN_PLAY) {
        game.setScreen(SCREEN_PAUSED);
        status.textContent = 'Jeda.';
      } else if (game.screen === SCREEN_PAUSED) {
        game.setScreen(SCREEN_PLAY);
        status.textContent = 'Bermain.';
      }
    }
    if (flags & ACTION_CONFIRM) {
      if (game.screen === SCREEN_TITLE) game.startPlay(false);
      else if (game.screen === SCREEN_COMPLETE) {
        game.missions.nextMission();
        game.setScreen(SCREEN_PLAY);
      } else if (game.screen === SCREEN_WASTED) {
        game.startPlay(false);
        game.health = PLAYER.maxHealth;
        game.wanted = 0;
        game.player.pos.set(PLAYER.spawn.x, 0, PLAYER.spawn.z);
        game.player.mesh.position.copy(game.player.pos);
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (game.screen === SCREEN_TITLE || game.screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (game.screen === SCREEN_TITLE || game.screen === SCREEN_PLAY)) {
        game.step(STEP, liveInput());
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    game.draw(STEP);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === SCREEN_PLAY) game.setScreen(SCREEN_PAUSED);
  });

  status.textContent = 'Solmar Heat. Tekan Enter atau klik MULAI.';
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
