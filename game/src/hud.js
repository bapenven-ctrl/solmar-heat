// The HUD and the screens: big readable text over the 3D view — health,
// money, wanted stars, speed, the game clock, the mission objective and
// toasts — plus a 2D top-down minimap canvas, and the title, pause,
// mission-complete and wasted overlays.
import { CITY, FONT, MISSIONS, PALETTE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_COMPLETE = 'missionComplete';
export const SCREEN_WASTED = 'wasted';

const MAP_SIZE = 220;
const MAP_MIN_X = -120;
const MAP_MAX_X = 160;
const MAP_MIN_Z = -120;
const MAP_MAX_Z = 120;

function mapX(x) {
  return ((x - MAP_MIN_X) / (MAP_MAX_X - MAP_MIN_X)) * MAP_SIZE;
}
function mapZ(z) {
  return ((z - MAP_MIN_Z) / (MAP_MAX_Z - MAP_MIN_Z)) * MAP_SIZE;
}

export function createHud(game) {
  const root = document.getElementById('hud');
  const healthFill = document.getElementById('health-fill');
  const healthText = document.getElementById('health-text');
  const moneyText = document.getElementById('money');
  const starsText = document.getElementById('stars');
  const clockText = document.getElementById('clock');
  const speedText = document.getElementById('speed');
  const objectiveText = document.getElementById('objective');
  const toastText = document.getElementById('toast');
  const minimap = document.getElementById('minimap');
  const mapCtx = minimap.getContext('2d');
  const savedText = document.getElementById('saved');
  const titleScreen = document.getElementById('title-screen');
  const pauseScreen = document.getElementById('pause-screen');
  const completeScreen = document.getElementById('complete-screen');
  const wastedScreen = document.getElementById('wasted-screen');
  const muteButton = document.getElementById('mute-btn');

  let toastTimer = 0;
  let savedTimer = 0;
  let lastHealth = -1;
  let lastMoney = -1;
  let lastWanted = -1;
  let lastSpeed = -1;
  let lastClock = '';
  let lastObjective = '';

  function showOnly(screen) {
    titleScreen.style.display = screen === SCREEN_TITLE ? 'flex' : 'none';
    pauseScreen.style.display = screen === SCREEN_PAUSED ? 'flex' : 'none';
    completeScreen.style.display = screen === SCREEN_COMPLETE ? 'flex' : 'none';
    wastedScreen.style.display = screen === SCREEN_WASTED ? 'flex' : 'none';
    root.style.display = screen === SCREEN_PLAY || screen === SCREEN_COMPLETE ? 'block' : 'none';
  }

  function toast(message) {
    toastText.textContent = message;
    toastText.style.opacity = '1';
    toastTimer = 3.5;
  }

  function flashSaved() {
    savedText.style.opacity = '1';
    savedTimer = 2.5;
  }

  function drawMinimap() {
    const ctx = mapCtx;
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.fillStyle = '#20242c';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Sea and sand on the east edge.
    ctx.fillStyle = PALETTE.minimapSea;
    ctx.fillRect(mapX(CITY.seaX), 0, MAP_SIZE - mapX(CITY.seaX), MAP_SIZE);
    ctx.fillStyle = PALETTE.minimapSand;
    ctx.fillRect(mapX(CITY.beachX), 0, mapX(CITY.seaX) - mapX(CITY.beachX), MAP_SIZE);
    // Buildings.
    ctx.fillStyle = PALETTE.minimapBuilding;
    for (const box of game.city.colliders) {
      if (box.height < 6) continue;
      ctx.fillRect(mapX(box.minX), mapZ(box.minZ), mapX(box.maxX) - mapX(box.minX), mapZ(box.maxZ) - mapZ(box.minZ));
    }
    // Roads.
    ctx.strokeStyle = PALETTE.minimapRoad;
    ctx.lineWidth = 7;
    for (const road of [-80, -40, 0, 40, 80]) {
      ctx.beginPath();
      ctx.moveTo(mapX(road), mapZ(-110));
      ctx.lineTo(mapX(road), mapZ(110));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mapX(-110), mapZ(road));
      ctx.lineTo(mapX(110), mapZ(road));
      ctx.stroke();
    }
    // Mission marker: a pulsing gold diamond.
    const mission = game.missions.currentMission;
    const target = game.missions.state.target;
    if (mission && target && !game.missions.state.done) {
      const pulse = 5 + Math.sin(game.time * 4) * 2;
      ctx.fillStyle = PALETTE.hudGold;
      ctx.beginPath();
      ctx.arc(mapX(target.x), mapZ(target.z), pulse + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a5a00';
      ctx.beginPath();
      ctx.arc(mapX(target.x), mapZ(target.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Cars, police and gang members.
    for (const car of game.traffic.cars) {
      if (!car.active) continue;
      ctx.fillStyle = car.kind === 'police' ? '#ff4040' : '#ffe14d';
      ctx.beginPath();
      ctx.arc(mapX(car.pos.x), mapZ(car.pos.z), car.kind === 'police' ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const enemy of game.gang) {
      if (!enemy.alive) continue;
      ctx.fillStyle = '#ff5040';
      ctx.beginPath();
      ctx.arc(mapX(enemy.pos.x), mapZ(enemy.pos.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player: a white arrow pointing where they face.
    const px = mapX(game.player.pos.x);
    const pz = mapZ(game.player.pos.z);
    const heading = game.player.onFoot ? game.player.heading : game.player.car.heading;
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function clockString() {
    const hours = (17.5 + game.time / 240) % 24;
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** Refresh the HUD from the game state; cheap writes only on change. */
  function update(dt) {
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toastText.style.opacity = '0';
    }
    if (savedTimer > 0) {
      savedTimer -= dt;
      if (savedTimer <= 0) savedText.style.opacity = '0';
    }
    const health = Math.max(0, Math.round(game.health));
    if (health !== lastHealth) {
      lastHealth = health;
      healthFill.style.width = `${health}%`;
      healthFill.style.background = health > 50 ? '#4caf50' : health > 25 ? '#ff9800' : '#f44336';
      healthText.textContent = `NYAWA ${health}`;
    }
    if (game.money !== lastMoney) {
      lastMoney = game.money;
      moneyText.textContent = `$${game.money}`;
    }
    if (game.wanted !== lastWanted) {
      lastWanted = game.wanted;
      starsText.textContent = '★'.repeat(game.wanted) + '☆'.repeat(5 - game.wanted);
      starsText.style.color = game.wanted > 0 ? PALETTE.hudRed : '#dddddd';
    }
    const speedKmh = Math.round(Math.abs(game.player.onFoot ? game.player.speed : game.player.car.speed) * 3.6);
    if (speedKmh !== lastSpeed) {
      lastSpeed = speedKmh;
      speedText.textContent = game.player.onFoot ? 'JALAN KAKI' : `${speedKmh} km/jam`;
    }
    const clock = clockString();
    if (clock !== lastClock) {
      lastClock = clock;
      clockText.textContent = clock;
    }
    const objective = game.missions.objectiveText();
    if (objective !== lastObjective) {
      lastObjective = objective;
      const mission = game.missions.currentMission;
      objectiveText.textContent = mission
        ? `MISI ${game.missions.state.index + 1}: ${mission.name} — ${objective}`
        : objective;
    }
    if (root.style.display !== 'none') drawMinimap();
    muteButton.textContent = game.audio.isMuted ? '🔇 Suara: Mati (M)' : '🔊 Suara: Hidup (M)';
  }

  function showMissionComplete(mission, totalMoney) {
    document.getElementById('complete-title').textContent = 'MISI SELESAI';
    document.getElementById('complete-mission').textContent = mission.name;
    document.getElementById('complete-reward').textContent = `Hadiah: $${mission.reward}`;
    document.getElementById('complete-total').textContent = `Total uang: $${totalMoney}`;
    document.getElementById('complete-saved').textContent = '✓ TERSIMPAN';
    showOnly(SCREEN_COMPLETE);
  }

  function showWasted() {
    showOnly(SCREEN_WASTED);
  }

  return {
    update,
    toast,
    flashSaved,
    showOnly,
    showMissionComplete,
    showWasted,
    get muteButton() {
      return muteButton;
    },
  };
}
