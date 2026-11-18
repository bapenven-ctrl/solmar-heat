// DOM HUD and the top-down minimap covering both districts.
import { WORLD } from './config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      health: $('health'), money: $('money'), stars: $('stars'), speed: $('speed'),
      clock: $('clock'), objective: $('objective'), toast: $('toast'),
      title: $('title-screen'), pause: $('pause-screen'), complete: $('complete-screen'),
      completeText: $('complete-text'), saved: $('saved'), minimap: $('minimap'),
      missionName: $('mission-name'),
    };
    this.toastT = 0; this.savedT = 0; this.mapT = 0;
    this.mm = this.el.minimap.getContext('2d');
  }
  toast(msg, secs = 3) { this.el.toast.textContent = msg; this.el.toast.style.opacity = 1; this.toastT = secs; }
  flashSaved() { this.el.saved.style.opacity = 1; this.savedT = 1.6; }
  showTitle(v) { this.el.title.style.display = v ? 'flex' : 'none'; }
  showPause(v) { this.el.pause.style.display = v ? 'flex' : 'none'; }
  showComplete(def) {
    this.el.completeText.textContent = def.name + ' selesai — +$' + def.reward;
    this.el.complete.style.display = 'flex';
  }
  hideComplete() { this.el.complete.style.display = 'none'; }
  update(dt, G) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.style.opacity = 0; }
    if (this.savedT > 0) { this.savedT -= dt; if (this.savedT <= 0) this.el.saved.style.opacity = 0; }
    const P = G.player;
    this.el.health.style.width = Math.max(0, P.health) + '%';
    this.el.money.textContent = '$' + G.money;
    this.el.stars.textContent = '★★★★★'.slice(0, G.wanted) + '☆☆☆☆☆'.slice(0, 5 - G.wanted);
    this.el.stars.style.color = G.wanted ? '#ffc93c' : '#666';
    this.el.speed.textContent = P.car ? Math.round(Math.abs(P.car.speed) * 3.2) + ' km/j' : '';
    const mins = Math.floor(G.time * 2) % (24 * 60);
    this.el.clock.textContent = String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
    this.el.objective.textContent = G.missions.objectiveText();
    this.el.missionName.textContent = G.missions.done ? 'CERITA SELESAI' :
      'MISI ' + (G.missions.index + 1) + '/7';
    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 0.12; this.drawMap(G); }
  }
  drawMap(G) {
    const c = this.mm, S = 176;
    const x0 = WORLD.hillMinX - 70, x1 = 300, z0 = -290, z1 = 360;
    const px = (x) => (x - x0) / (x1 - x0) * S, pz = (z) => (z - z0) / (z1 - z0) * S;
    c.fillStyle = '#20242e'; c.fillRect(0, 0, S, S);
    c.fillStyle = '#3d5230'; c.fillRect(px(WORLD.hillMinX), pz(-250), px(-292) - px(WORLD.hillMinX), pz(250) - pz(-250));
    c.fillStyle = '#4a4436'; c.fillRect(px(-240), pz(-250), px(250) - px(-240), pz(250) - pz(-250));
    c.fillStyle = '#1d5f73'; c.fillRect(px(262), 0, S - px(262), S);
    c.strokeStyle = '#8f8a7a'; c.lineWidth = 1;
    for (let v = -240; v <= 240; v += 60) {
      c.beginPath(); c.moveTo(px(v), pz(-250)); c.lineTo(px(v), pz(250)); c.stroke();
      c.beginPath(); c.moveTo(px(-250), pz(v)); c.lineTo(px(250), pz(v)); c.stroke();
    }
    c.beginPath(); c.moveTo(px(-560), pz(-90)); c.lineTo(px(-310), pz(-90)); c.stroke();
    c.beginPath(); c.moveTo(px(-560), pz(90)); c.lineTo(px(-310), pz(90)); c.stroke();
    c.beginPath(); c.moveTo(px(-440), pz(-210)); c.lineTo(px(-440), pz(210)); c.stroke();
    c.beginPath(); c.moveTo(px(-250), pz(318)); c.lineTo(px(280), pz(318)); c.stroke();
    const dot = (x, z, col, r = 2.4) => { c.fillStyle = col; c.beginPath(); c.arc(px(x), pz(z), r, 0, 7); c.fill(); };
    for (const car of G.traffic.allCars()) if (!car.dead) dot(car.x, car.z, '#c8c8c8', 1.8);
    for (const u of G.police.units) dot(u.x, u.z, '#4d8dff', 2.6);
    if (G.police.roadblock) dot(G.police.roadblock.x, G.police.roadblock.z, '#ff4040', 3.4);
    const tp = G.missions.targetPos();
    if (tp) { dot(tp.x, tp.z, '#ffc93c', 3.6); }
    const P = G.player;
    c.save(); c.translate(px(P.x), pz(P.z)); c.rotate(Math.PI - P.headingNow);
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(0, -5); c.lineTo(3.6, 4); c.lineTo(-3.6, 4); c.closePath(); c.fill(); c.restore();
  }
}
