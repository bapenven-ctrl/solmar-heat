// The seven-mission story chain: sequential steps, a gold beacon on the
// active target, reward payouts and per-mission special rules (escape,
// steal, checkpoint race, debt fights, escort convoy, hot finale).
import * as THREE from 'three';
import { PLACES } from './config.js';
import { Car } from './vehicles.js';

export const MISSION_DEFS = [
  { name: 'Paket Pelabuhan', reward: 150 },
  { name: 'Pelarian', reward: 200 },
  { name: 'Curi dan Antar', reward: 400 },
  { name: 'Balapan Dermaga', reward: 300 },
  { name: 'Utang Lama', reward: 450 },
  { name: 'Konvoi', reward: 500 },
  { name: 'Paket Terakhir', reward: 750 },
];

export class Missions {
  constructor(G) {
    this.G = G; this.index = 0; this.step = 0; this.done = false;
    this.targetCar = null; this.ally = null; this.raceTime = 0; this.fightPoint = 0;
    const beacon = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 13; beacon.add(beam);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.22, 8, 30),
      new THREE.MeshBasicMaterial({ color: 0xffc93c }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.4; beacon.add(ring);
    G.scene.add(beacon); this.beacon = beacon;
    this.steps = [];
  }
  current() { return this.steps[this.step] || null; }
  start(i) {
    const G = this.G;
    this.index = i; this.step = 0; this.raceTime = 0; this.fightPoint = 0;
    G.combat.clearGuards();
    if (this.targetCar) { G.scene.remove(this.targetCar.mesh); this.targetCar = null; }
    if (this.ally) { G.scene.remove(this.ally.mesh); this.ally = null; }
    const H = PLACES.harbor, D = PLACES.drop1;
    switch (i) {
      case 0: this.steps = [
        { t: 'goto', ...H, r: 6, text: 'Ambil paket di Pelabuhan Solmar' },
        { t: 'goto', ...D, r: 7, text: 'Antar paket ke Gudang Jalan Kenanga' }]; break;
      case 1: G.setWanted(2); this.steps = [
        { t: 'escape', ...PLACES.hideout, r: 9, text: 'Kabur ke Persembunyian Gang Melati dan hilangkan wanted' }]; break;
      case 2: {
        this.targetCar = new Car(G.scene, 0x7a1f2b, PLACES.gangYard.x, PLACES.gangYard.z, 0.6, { target: true });
        this.steps = [
          { t: 'steal', ...PLACES.gangYard, r: 30, text: 'Curi mobil geng Karang yang ditandai emas' },
          { t: 'deliver', ...PLACES.garage, r: 8, text: 'Antar mobil curian ke Garasi Sinar Auto' }]; break; }
      case 3: this.raceTime = 150; this.steps = [
        { t: 'race', pts: [[200, -120], [60, 0], [-120, 0], [-279, 0], [-440, 90], [-520, 0]], at: 0,
          text: 'Balapan Dermaga: lewati semua checkpoint sebelum waktu habis' }]; break;
      case 4: this.steps = [
        { t: 'fight', pts: [[120, -60], [-60, 60], [180, 150]], at: 0,
          text: 'Utang Lama: kalahkan penjaga geng di 3 titik utang' }];
        this.spawnFightPoint(); break;
      case 5: {
        this.ally = new Car(G.scene, 0x3f9e57, 186, -186, -Math.PI / 2);
        this.allyRoute = [[60, -120], [-60, -60], [-120, 60], [PLACES.drop1.x, PLACES.drop1.z]];
        this.allyAt = 0; G.setWanted(2);
        this.steps = [{ t: 'escort', ...PLACES.drop1, r: 12, text: 'Kawal mobil kawan sampai Gudang Kenanga — jangan jauh, jangan sampai hancur' }]; break; }
      case 6: this.steps = [
        { t: 'goto', ...H, r: 6, text: 'Ambil Paket Terakhir di pelabuhan', hot: true },
        { t: 'goto', ...PLACES.airport, r: 10, text: 'Antar ke Strip Bandara — lewati roadblock!' }]; break;
      default: this.steps = []; this.done = true;
    }
    G.hud.toast('MISI ' + (i + 1) + ': ' + MISSION_DEFS[i].name);
  }
  spawnFightPoint() {
    const s = this.current(); if (!s || s.t !== 'fight') return;
    const [x, z] = s.pts[this.fightPoint];
    this.G.combat.spawnGuard(x + 3, z + 2); this.G.combat.spawnGuard(x - 3, z - 2);
  }
  targetPos() {
    const s = this.current(); if (!s) return null;
    if (s.t === 'race') { const [x, z] = s.pts[s.at]; return { x, z }; }
    if (s.t === 'fight') { const [x, z] = s.pts[this.fightPoint]; return { x, z }; }
    if (s.t === 'steal' && this.targetCar) return { x: this.targetCar.x, z: this.targetCar.z };
    if (s.t === 'escort' && this.ally) return { x: this.ally.x, z: this.ally.z };
    return { x: s.x, z: s.z };
  }
  objectiveText() {
    const s = this.current(); if (!s) return this.done ? 'Semua misi selesai — Solmar milikmu, Rex.' : '';
    const tp = this.targetPos();
    const d = tp ? Math.round(Math.hypot(tp.x - this.G.player.x, tp.z - this.G.player.z)) : 0;
    if (s.t === 'race') return s.text + ' — checkpoint ' + (s.at + 1) + '/' + s.pts.length + ' · ' + Math.ceil(this.raceTime) + ' dtk · ' + d + ' m';
    if (s.t === 'fight') return s.text + ' — titik ' + (this.fightPoint + 1) + '/' + s.pts.length;
    if (s.t === 'escort' && this.ally) return s.text + ' — kondisi kawan ' + Math.max(0, Math.round(this.ally.health)) + '%';
    return s.text + ' — ' + d + ' m';
  }
  advance() {
    const G = this.G, def = MISSION_DEFS[this.index];
    this.step++;
    if (this.step >= this.steps.length) {
      G.money += def.reward;
      G.onMissionComplete?.(def);
      if (this.index + 1 < MISSION_DEFS.length) this.start(this.index + 1);
      else { this.done = true; this.steps = []; }
    }
  }
  update(dt) {
    const G = this.G, s = this.current();
    const tp = this.targetPos();
    this.beacon.visible = !!tp;
    if (tp) {
      const y = G.groundAt(tp.x, tp.z);
      this.beacon.position.set(tp.x, y, tp.z);
      this.beacon.rotation.y += dt * 1.5;
    }
    if (!s || G.mode !== 'play') return;
    const P = G.player;
    const distTo = (x, z) => Math.hypot(x - P.x, z - P.z);
    switch (s.t) {
      case 'goto':
        if (distTo(s.x, s.z) < s.r) {
          if (s.hot) G.setWanted(4);
          G.audio.pickup(); this.advance();
        } break;
      case 'escape':
        if (distTo(s.x, s.z) < s.r) {
          G.hideoutTime += dt;
          if (G.hideoutTime > 2.4) { G.hideoutTime = 0; if (G.wanted > 0) G.setWanted(G.wanted - 1); }
          if (G.wanted === 0) this.advance();
        } else G.hideoutTime = 0;
        break;
      case 'steal':
        if (P.car && P.car === this.targetCar) this.advance();
        break;
      case 'deliver':
        if (P.car === this.targetCar && distTo(s.x, s.z) < s.r) this.advance();
        break;
      case 'race': {
        this.raceTime -= dt;
        const [x, z] = s.pts[s.at];
        if (distTo(x, z) < 13) { s.at++; G.audio.pickup(); if (s.at >= s.pts.length) this.advance(); }
        else if (this.raceTime <= 0) { s.at = 0; this.raceTime = 150; G.hud.toast('Waktu habis — balapan diulang!'); }
        break; }
      case 'fight':
        if (G.combat.aliveGuards().length === 0) {
          this.fightPoint++;
          if (this.fightPoint >= s.pts.length) this.advance(); else this.spawnFightPoint();
        }
        break;
      case 'escort': {
        const a = this.ally; if (!a) break;
        if (a.health <= 0) { // convoy lost: reset the run, keep the mission
          G.scene.remove(a.mesh);
          this.ally = new Car(G.scene, 0x3f9e57, 186, -186, -Math.PI / 2);
          this.allyAt = 0; G.hud.toast('Mobil kawan hancur — konvoi diulang!');
          break;
        }
        const [tx, tz] = this.allyRoute[this.allyAt];
        const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
        const th = Math.atan2(dx, dz);
        let dh = th - a.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
        a.drive(dt, { f: 0.75, s: Math.max(-1, Math.min(1, dh * 1.8)) }, G.colliders, 15);
        if (d < 9) { this.allyAt++; if (this.allyAt >= this.allyRoute.length) { this.advance(); } }
        break; }
    }
  }
}
