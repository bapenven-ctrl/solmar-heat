// Boot, input, the fixed-step loop, crime/wanted bookkeeping and saves.
import { STEP, PLACES, SAVE_KEY, groundHeight } from './config.js';
import { makeRng } from './random.js';
import { createStage } from './render.js';
import { buildCity } from './city.js';
import { Traffic, Pedestrians } from './traffic.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { AudioSys } from './audio.js';
import { applyShot } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '7', 10);
const shotName = params.get('shot');
const rng = makeRng(seed);

const stage = createStage(document.getElementById('game'));
const city = buildCity(stage.scene, rng);
const traffic = new Traffic(stage.scene, rng, city.colliders);
const peds = new Pedestrians(stage.scene, rng);
const player = new Player(stage.scene, rng, PLACES.start.x, PLACES.start.z);
const police = new Police(stage.scene);
const combat = new Combat(stage.scene, rng);
const hud = new Hud();
const audio = new AudioSys();

const G = {
  scene: stage.scene, stage, player, police, traffic, combat, hud, audio,
  colliders: city.colliders, missions: null,
  money: 0, wanted: 0, time: 0, mode: shotName ? 'play' : 'title',
  hideoutTime: 0, policeSeen: false, groundAt: groundHeight,
  setWanted(n) { G.wanted = Math.max(0, Math.min(5, n)); },
  crime(n, cooldown = 1.2) {
    if (G.time < (G.crimeCool || 0)) return;
    G.crimeCool = G.time + cooldown; G.setWanted(G.wanted + n);
  },
  onRam() { audio.punch(); hud.toast('Polisi menabrakmu!'); },
  onPlayerHurt() { if (player.health <= 0) G.respawn(); },
  onGuardDown() { audio.pickup(); },
  onMissionComplete(def) {
    G.mode = 'complete'; hud.showComplete(def); audio.pickup(); G.save();
  },
  respawn() {
    player.health = 100; G.setWanted(0); G.money = Math.max(0, G.money - 50);
    if (player.car) player.exit();
    player.pos.set(PLACES.start.x, 0, PLACES.start.z); player.pos.y = groundHeight(player.pos.x, player.pos.z);
    player.sync(); hud.toast('Kamu pingsan — bangun di dermaga, -$50');
  },
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: G.money, mission: G.missions.index,
        x: Math.round(player.x), z: Math.round(player.z),
      }));
      hud.flashSaved();
    } catch (e) { /* storage unavailable */ }
  },
};
G.missions = new Missions(G);
const missions = G.missions;

// Restore a previous run (never in staged-shot mode).
if (!shotName) {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s) { G.money = s.money | 0; missions.start(Math.min(6, s.mission | 0)); }
    else missions.start(0);
  } catch (e) { missions.start(0); }
} else {
  missions.start(0);
  applyShot(G, shotName);
}
hud.showTitle(G.mode === 'title');
window.__game = G;

// --- input
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true; audio.ensure();
  if (e.code === 'Enter' || e.code === 'Space') {
    if (G.mode === 'title') { G.mode = 'play'; hud.showTitle(false); audio.click(); }
    else if (G.mode === 'complete') { G.mode = 'play'; hud.hideComplete(); audio.click(); }
  }
  if ((e.code === 'KeyP' || e.code === 'Escape') && (G.mode === 'play' || G.mode === 'pause')) {
    G.mode = G.mode === 'play' ? 'pause' : 'play'; hud.showPause(G.mode === 'pause');
  }
  if (e.code === 'KeyM') hud.toast(audio.toggleMute() ? 'Suara mati' : 'Suara hidup', 1.2);
  if (e.code === 'KeyE' && G.mode === 'play') {
    if (player.car) player.exit();
    else {
      const car = player.nearestCar([...traffic.allCars(), player.ownCar, missions.targetCar, missions.ally].filter(Boolean));
      if (car) {
        const res = player.enter(car);
        if (res === 'stolen') { G.crime(2); hud.toast('Mobil dicuri! Wanted naik'); audio.click(); }
      }
    }
  }
  if (e.code === 'KeyF' && G.mode === 'play' && !player.car) {
    audio.ensure();
    if (combat.punch(G)) { audio.punch(); G.crime(1); } else audio.punch();
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('mousedown', () => {
  audio.ensure();
  if (G.mode === 'play' && !player.car) { if (combat.shoot(G)) G.crime(1); audio.shot(); }
});
function readInput() {
  return {
    up: !!(keys.KeyW || keys.ArrowUp), down: !!(keys.KeyS || keys.ArrowDown),
    left: !!(keys.KeyA || keys.ArrowLeft), right: !!(keys.KeyD || keys.ArrowRight),
    run: !!(keys.ShiftLeft || keys.ShiftRight),
    f: (keys.KeyW || keys.ArrowUp) ? 1 : (keys.KeyS || keys.ArrowDown) ? -1 : 0,
    s: (keys.KeyA || keys.ArrowLeft) ? 1 : (keys.KeyD || keys.ArrowRight) ? -1 : 0,
    camYaw: 0,
  };
}

// --- per-step simulation
let decayT = 0, saveT = 0, pedHitCool = 0;
function step(dt) {
  G.time += dt;
  const input = readInput();
  player.update(dt, input, city.colliders, traffic.allCars());
  if (player.bumpEvent) { player.bumpEvent = false; }
  traffic.update(dt);
  police.update(dt, G);
  combat.update(dt, G);
  missions.update(dt);
  peds.update(dt, { x: player.x, z: player.z, alarm: (G.wanted > 0 || G.time < (G.crimeCool || 0)) ? 1 : 0 });
  city.update(dt);
  // Running down a pedestrian is a crime and costs health of the car.
  pedHitCool -= dt;
  if (player.car && Math.abs(player.car.speed) > 6 && pedHitCool <= 0) {
    for (const p of peds.list) {
      if (Math.hypot(p.x - player.x, p.z - player.z) < 2.3) {
        pedHitCool = 2; p.panic = 3; G.crime(1); hud.toast('Kamu menabrak pejalan kaki!');
        break;
      }
    }
  }
  // Wanted decays only while nobody in uniform can see Rex.
  if (G.wanted > 0 && !G.policeSeen && missions.current()?.t !== 'escape') {
    decayT += dt; if (decayT > 6) { decayT = 0; G.setWanted(G.wanted - 1); }
  } else decayT = 0;
  if (player.health <= 0) G.respawn();
  saveT += dt; if (saveT > 6) { saveT = 0; if (G.mode === 'play') G.save(); }
  audio.update(dt, player.speedNow, !!player.car, police.units.length > 0 && G.wanted > 0);
}

let last = performance.now() / 1000, acc = 0, firstFrame = true;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now() / 1000;
  let dt = Math.min(0.1, now - last); last = now;
  if (G.mode === 'play' || G.mode === 'complete') {
    acc += dt;
    while (acc >= STEP) { step(STEP); acc -= STEP; }
  }
  const anchor = player.anchor();
  if (firstFrame) { stage.snap(anchor, player.headingNow); firstFrame = false; }
  stage.follow(Math.max(dt, 0.001), anchor, player.headingNow, player.speedNow);
  hud.update(dt, G);
  stage.renderer.render(stage.scene, stage.camera);
}
if (shotName) { hud.showTitle(false); }
frame();
window.__ready = true;
