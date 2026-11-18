// The heads-up display: mission objective, cash and wanted stars, health
// and speed, toast messages, big centre banners, and the minimap that
// draws the whole of Solmar with every blip that matters.

import { WORLD } from './config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.misNo = $('mis-no');
    this.misTitle = $('mis-title');
    this.misText = $('mis-text');
    this.misDist = $('mis-dist');
    this.cashEl = $('cash');
    this.starsEl = $('stars');
    this.clockEl = $('clock');
    this.healthFill = $('health-fill');
    this.healthNum = $('health-num');
    this.cpPanel = $('complete-panel');
    this.cpMission = $('cp-mission');
    this.cpPayout = $('cp-payout');
    this.cpTotal = $('cp-total');
    this.speedEl = $('speed');
    this.gearEl = $('gear');
    this.toastEl = $('toast');
    this.bannerEl = $('banner');
    this.bannerBig = $('banner-big');
    this.bannerSub = $('banner-sub');
    this.crosshair = $('crosshair');
    this.vignette = $('vignette');
    this.map = $('minimap').getContext('2d');
    this.toastTimer = null;
    this.bannerTimer = null;
    this.lastStars = -1;
  }

  show(on) {
    this.root.classList.toggle('on', on);
  }

  setCash(n) {
    this.cashEl.textContent = `$${Math.round(n).toLocaleString('en-US')}`;
  }

  setWanted(stars) {
    if (stars === this.lastStars) return;
    this.lastStars = stars;
    let html = '';
    for (let i = 0; i < 5; i++) html += i < stars ? '★' : '<span class="off">★</span>';
    this.starsEl.innerHTML = html;
  }

  setClock(hourFloat) {
    const h = Math.floor(hourFloat);
    const m = Math.floor((hourFloat - h) * 60);
    this.clockEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  setObjective(obj, dist) {
    this.misNo.textContent = obj.no;
    this.misTitle.textContent = obj.title;
    this.misText.textContent = obj.text;
    this.misDist.textContent = dist !== null && dist !== undefined && obj.target ? `— ${Math.round(dist)} m` : '';
  }

  setHealth(frac) {
    const f = Math.max(0, Math.min(1, frac));
    this.healthFill.style.width = `${f * 100}%`;
    this.healthNum.textContent = `${Math.round(f * 100)}`;
  }

  // The mission-complete payout panel: proof of the game loop, shown by
  // the real completion flow and by the district2 screenshot staging.
  showComplete({ mission, payout, total }) {
    this.cpMission.textContent = mission;
    this.cpPayout.textContent = `+$${Math.round(payout).toLocaleString('en-US')}`;
    this.cpTotal.textContent = `$${Math.round(total).toLocaleString('en-US')}`;
    this.cpPanel.classList.add('show');
  }

  hideComplete() {
    this.cpPanel.classList.remove('show');
  }

  setSpeed(kmh, label) {
    this.speedEl.innerHTML = `${Math.round(kmh)} <small>km/j</small>`;
    this.gearEl.textContent = label;
  }

  setCrosshair(on) {
    this.crosshair.classList.toggle('on', on);
  }

  damageFlash() {
    this.vignette.style.boxShadow = 'inset 0 0 140px rgba(229,30,30,0.55)';
    setTimeout(() => {
      this.vignette.style.boxShadow = 'inset 0 0 140px rgba(229,30,30,0)';
    }, 130);
  }

  toast(text, ms = 2600) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  banner(big, sub = '', ms = 3000) {
    this.bannerBig.textContent = big;
    this.bannerSub.textContent = sub;
    this.bannerEl.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.bannerEl.classList.remove('show'), ms);
  }

  // state: {px, pz, angle, target, cops:[{x,z}], heli:{x,z}|null,
  //         thief:{x,z}|null, cases:[{x,z}], pois:[{x,z}], inCar}
  drawMinimap(state) {
    const ctx = this.map;
    const W = 376;
    const H = 376;
    // World window mapped onto the square: x -180..250, z -150..460.
    const mx = (x) => ((x + 180) / 430) * W;
    const mz = (z) => H - ((z + 150) / 610) * H;

    // Land base, then the sea with a sandy quay edge and grey piers.
    ctx.fillStyle = '#2e5b34';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1d6f8e';
    ctx.fillRect(0, mz(-24), W, H - mz(-24));
    ctx.fillStyle = '#d9c08a';
    ctx.fillRect(0, mz(-14), W, mz(-24) - mz(-14));
    ctx.fillStyle = '#8a8f96';
    for (const px of [-96, -16, 64]) {
      ctx.fillRect(mx(px), mz(-24), mx(px + 11) - mx(px), mz(-84) - mz(-24));
    }
    // Downtown: an urban ground tone with a built-up panel on every
    // block, so the grid reads as a city and not as lines on grass.
    ctx.fillStyle = '#57604f';
    ctx.fillRect(mx(-150), mz(228), mx(150) - mx(-150), mz(-24) - mz(228));
    ctx.fillStyle = '#7d8771';
    const ax = WORLD.avenueX;
    const sz = WORLD.streetZ;
    for (let i = 0; i < ax.length - 1; i++) {
      for (let j = 0; j < sz.length - 1; j++) {
        const x0 = ax[i] + WORLD.blockGap - 4;
        const x1 = ax[i + 1] - WORLD.blockGap + 4;
        const z0 = sz[j] + WORLD.blockGap - 4;
        const z1 = sz[j + 1] - WORLD.blockGap + 4;
        ctx.fillRect(mx(x0), mz(z1), mx(x1) - mx(x0), mz(z0) - mz(z1));
      }
    }
    // Hill mass with its plateau villas.
    ctx.fillStyle = '#3d6b35';
    ctx.fillRect(mx(-150), mz(460), mx(150) - mx(-150), mz(228) - mz(460));
    ctx.fillStyle = '#dcebcb';
    for (const v of [[-84, 330], [-40, 386], [38, 342], [86, 392], [-96, 402], [64, 318]]) {
      ctx.fillRect(mx(v[0]) - 3, mz(v[1]) - 3, 6, 6);
    }
    // Airstrip with a dashed centreline.
    ctx.fillStyle = '#6a7076';
    ctx.fillRect(mx(168), mz(224), mx(196) - mx(168), mz(8) - mz(224));
    ctx.strokeStyle = '#f2f4f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(mx(182), mz(216));
    ctx.lineTo(mx(182), mz(16));
    ctx.stroke();
    ctx.setLineDash([]);
    // Roads, bright on top of the blocks.
    ctx.strokeStyle = '#e8ecf0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (const x of WORLD.avenueX) {
      ctx.moveTo(mx(x), mz(-20));
      ctx.lineTo(mx(x), mz(228));
    }
    for (const z of WORLD.streetZ) {
      ctx.moveTo(mx(-150), mz(z));
      ctx.lineTo(mx(150), mz(z));
    }
    ctx.moveTo(mx(-150), mz(-12));
    ctx.lineTo(mx(150), mz(-12));
    ctx.moveTo(mx(0), mz(224));
    ctx.lineTo(mx(0), mz(424));
    ctx.moveTo(mx(-104), mz(352));
    ctx.lineTo(mx(104), mz(352));
    ctx.stroke();
    // District labels.
    ctx.font = '700 17px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText('PUSAT KOTA', mx(-36), mz(124));
    ctx.fillText('BUKIT CEMARA', mx(-54), mz(424));
    ctx.fillText('BANDARA', mx(96), mz(116));
    ctx.fillStyle = 'rgba(215,242,255,0.95)';
    ctx.fillText('PELABUHAN', mx(48), mz(-100));

    const dot = (x, z, color, r = 5) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx(x), mz(z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    // Mission givers as ringed gold POIs.
    for (const p of state.pois ?? []) {
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.arc(mx(p.x), mz(p.z), 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(24,18,2,0.9)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    for (const c of state.cases ?? []) dot(c.x, c.z, '#ffd34d', 4);
    if (state.thief) dot(state.thief.x, state.thief.z, '#ff4040', 6);
    for (const c of state.cops ?? []) dot(c.x, c.z, '#3d8bff', 5);
    if (state.heli) dot(state.heli.x, state.heli.z, '#9fd4ff', 5);
    if (state.target) {
      const pulse = 6 + Math.sin(performance.now() / 240) * 2;
      ctx.strokeStyle = '#ffb340';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(mx(state.target.x), mz(state.target.z), pulse + 4, 0, Math.PI * 2);
      ctx.stroke();
      dot(state.target.x, state.target.z, '#ffb340', 5);
    }
    // Player arrow.
    const px = mx(state.px);
    const pz = mz(state.pz);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(Math.atan2(Math.sin(state.angle), -Math.cos(state.angle)) + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
