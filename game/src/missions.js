// The story campaign: seven missions for Raka, a courier who keeps
// taking one job too many. Missions unlock in order; each is started at
// its gold beacon and pays cash into the player's pocket.

import * as THREE from 'three';
import { makeCarMesh, Vehicle } from './vehicles.js';

export const MISSIONS = [
  {
    id: 'paket-pertama',
    title: 'Paket Pertama',
    giverName: 'Bang Jali, Pelabuhan',
    giver: { x: -60, z: -2 },
    brief: 'Ambil paket di dermaga, antar ke Kafe Senja di pusat kota.',
    payout: 250,
    type: 'deliver',
    pickup: { x: -35, z: -80 },
    dropoff: { x: 44, z: 102 },
  },
  {
    id: 'balapan-dermaga',
    title: 'Balapan Dermaga',
    giverName: 'Sinta, Ratu Jalanan',
    giver: { x: 122, z: -2 },
    brief: 'Lewati semua gerbang di jalan pelabuhan sebelum waktu habis.',
    payout: 400,
    type: 'race',
    checkpoints: [[92, -12], [34, -12], [-28, -12], [-88, -12], [-128, 26]],
    timeLimit: 85,
  },
  {
    id: 'kejar-pencuri',
    title: 'Kejar Pencuri',
    giverName: 'Pak RT Darmawan',
    giver: { x: 4, z: 58 },
    brief: 'Pencuri mobil kabur ke arah utara. Tabrak sampai mobilnya berhenti!',
    payout: 500,
    type: 'chase',
    thiefSpawn: { x: 84, z: 142 },
  },
  {
    id: 'antar-bukit',
    title: 'Antar ke Bukit Cemara',
    giverName: 'Nona Laras, Hotel Melati',
    giver: { x: -44, z: 150 },
    brief: 'Jemput Nona Laras dan antar ke gardu pandang Bukit Cemara.',
    payout: 450,
    type: 'passenger',
    dropoff: { x: 0, z: 420 },
    timeLimit: 170,
  },
  {
    id: 'lima-koper',
    title: 'Lima Koper',
    giverName: 'Orang Misterius',
    giver: { x: -102, z: 198 },
    brief: 'Kumpulkan 5 koper yang tercecer di pusat kota. Cepat, jangan banyak tanya.',
    payout: 600,
    type: 'collect',
    spots: [[-118, 60], [-14, 30], [66, 66], [118, 150], [-66, 168]],
  },
  {
    id: 'kabur-blokade',
    title: 'Kabur dari Blokade',
    giverName: 'Bang Jali, Pelabuhan',
    giver: { x: 102, z: 58 },
    brief: 'Polisi memasang blokade. Capai gudang dermaga dan sembunyi di sana!',
    payout: 750,
    type: 'escape',
    hideout: { x: -95, z: -78 },
    wantedFloor: 3,
  },
  {
    id: 'paket-terakhir',
    title: 'Paket Terakhir',
    giverName: 'Bang Jali, Pelabuhan',
    giver: { x: -60, z: -2 },
    brief: 'Satu paket terakhir: dari dermaga ke hanggar bandara. Semua polisi akan mengejarmu.',
    payout: 1500,
    type: 'deliver',
    pickup: { x: 105, z: -82 },
    dropoff: { x: 208, z: 168 },
    wantedFloor: 4,
  },
];

export class MissionRunner {
  constructor(scene, city, sound) {
    this.scene = scene;
    this.city = city;
    this.sound = sound;
    this.index = 0; // next mission to offer
    this.active = null; // runtime state of the running mission
    this.events = [];

    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xffb340,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 26, 18, 1, true), beaconMat);
    this.beacon.position.y = 17;
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb340, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.22, 10, 28), ringMat);
    this.ring.visible = false;
    this.scene.add(this.beacon, this.ring);

    this.caseMeshes = [];
    this.caseMat = new THREE.MeshLambertMaterial({ color: 0xa8742c, emissive: 0x442a00 });
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.6), this.caseMat);
      c.visible = false;
      c.castShadow = true;
      this.scene.add(c);
      this.caseMeshes.push(c);
    }
    this.thief = null;
  }

  get current() {
    return MISSIONS[this.index] ?? null;
  }

  get allDone() {
    return this.index >= MISSIONS.length;
  }

  saveData() {
    return { index: this.index };
  }

  loadData(data) {
    if (data && Number.isInteger(data.index)) {
      this.index = Math.min(MISSIONS.length, Math.max(0, data.index));
    }
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  startMission(ctx) {
    const m = this.current;
    if (!m || this.active) return;
    this.active = {
      def: m,
      stage: 'go',
      timer: m.timeLimit ?? null,
      checkpoint: 0,
      collected: 0,
      hasPackage: m.type !== 'deliver' && m.type !== 'passenger',
      thiefTarget: null,
      retargetAt: 0,
    };
    if (m.type === 'deliver') this.active.stage = 'pickup';
    if (m.type === 'passenger') this.active.stage = 'pickup';
    if (m.wantedFloor && m.type === 'escape') ctx.police.setFloor(m.wantedFloor);
    if (m.type === 'chase') {
      const mesh = makeCarMesh(ctx.rng, { color: 0x22262b });
      this.scene.add(mesh);
      const thief = new Vehicle(mesh, { maxSpeed: 17.5, accel: 12 });
      thief.angle = -Math.PI / 2;
      thief.setPosition(m.thiefSpawn.x, m.thiefSpawn.z, this.city.groundHeight);
      thief.isThief = true;
      this.thief = thief;
      this.active.thiefTarget = { x: -80, z: 200 };
    }
    if (m.type === 'collect') {
      m.spots.forEach(([x, z], i) => {
        const c = this.caseMeshes[i];
        c.visible = true;
        c.position.set(x, this.city.groundHeight(x, z) + 0.7, z);
      });
    }
    this.emit('start', { mission: m });
    this.sound.beep();
  }

  failMission(ctx, reason) {
    const m = this.active.def;
    this.cleanup(ctx);
    this.emit('fail', { mission: m, reason });
    this.sound.fail();
  }

  completeMission(ctx) {
    const m = this.active.def;
    this.cleanup(ctx);
    this.index++;
    this.emit('complete', { mission: m, payout: m.payout });
    this.sound.success();
  }

  cleanup(ctx) {
    if (!this.active) return;
    const m = this.active.def;
    if (m.wantedFloor) ctx.police.setFloor(0);
    if (this.thief) {
      this.scene.remove(this.thief.mesh);
      this.thief = null;
    }
    for (const c of this.caseMeshes) c.visible = false;
    this.active = null;
  }

  targetPos() {
    if (!this.active) {
      const m = this.current;
      return m ? { x: m.giver.x, z: m.giver.z } : null;
    }
    const a = this.active;
    const m = a.def;
    switch (m.type) {
      case 'deliver':
        return a.stage === 'pickup' ? m.pickup : m.dropoff;
      case 'race':
        return { x: m.checkpoints[a.checkpoint][0], z: m.checkpoints[a.checkpoint][1] };
      case 'chase':
        return this.thief ? { x: this.thief.mesh.position.x, z: this.thief.mesh.position.z } : null;
      case 'passenger':
        return a.stage === 'pickup' ? m.giver : m.dropoff;
      case 'collect': {
        let best = null;
        let bestD = Infinity;
        m.spots.forEach(([x, z], i) => {
          if (!this.caseMeshes[i].visible) return;
          const d = (x - (a.lastX ?? 0)) ** 2 + (z - (a.lastZ ?? 0)) ** 2;
          if (d < bestD) {
            bestD = d;
            best = { x, z };
          }
        });
        return best;
      }
      case 'escape':
        return m.hideout;
      default:
        return null;
    }
  }

  objective() {
    if (!this.active) {
      const m = this.current;
      if (!m) return { no: 'SOLMAR HEAT', title: 'Kota Bebas', text: 'Semua misi selesai. Jelajahi Solmar sesukamu!', target: null };
      return {
        no: `MISI ${this.index + 1}/${MISSIONS.length} — ${m.giverName}`,
        title: m.title,
        text: 'Capai penanda emas untuk mulai: ' + m.brief,
        target: this.targetPos(),
      };
    }
    const a = this.active;
    const m = a.def;
    const base = { no: `MISI ${this.index + 1}/${MISSIONS.length}`, title: m.title, target: this.targetPos() };
    switch (m.type) {
      case 'deliver':
        return { ...base, text: a.stage === 'pickup' ? 'Ambil paket di penanda.' : 'Antar paket ke tujuan!' };
      case 'race':
        return { ...base, text: `Gerbang ${a.checkpoint + 1}/${m.checkpoints.length} — sisa ${Math.max(0, Math.ceil(a.timer))} detik!` };
      case 'chase':
        return { ...base, text: `Hentikan mobil pencuri! Kerusakan: ${Math.max(0, Math.round(100 - (this.thief?.health ?? 100)))}%` };
      case 'passenger':
        return {
          ...base,
          text: a.stage === 'pickup'
            ? 'Jemput Nona Laras, berhenti di penanda.'
            : `Antar ke Bukit Cemara — sisa ${Math.max(0, Math.ceil(a.timer))} detik.`,
        };
      case 'collect':
        return { ...base, text: `Koper terkumpul: ${a.collected}/${m.spots.length}.` };
      case 'escape':
        return { ...base, text: 'Capai gudang dermaga tanpa tertangkap!' };
      default:
        return { ...base, text: m.brief };
    }
  }

  update(dt, now, ctx) {
    const { player, police } = ctx;
    const p = player.pos;
    const target = this.targetPos();

    // Beacon and ring follow the current target.
    if (target) {
      this.beacon.visible = true;
      this.beacon.position.x = target.x;
      this.beacon.position.z = target.z;
      this.beacon.position.y = this.city.groundHeight(target.x, target.z) + 13;
    } else {
      this.beacon.visible = false;
    }
    const a = this.active;
    if (a && a.def.type === 'race') {
      const [cx, cz] = a.def.checkpoints[a.checkpoint];
      this.ring.visible = true;
      this.ring.position.set(cx, this.city.groundHeight(cx, cz) + 2.2, cz);
      this.ring.rotation.y += dt * 1.2;
    } else {
      this.ring.visible = false;
    }
    for (const c of this.caseMeshes) {
      if (c.visible) c.rotation.y += dt * 2.2;
    }

    if (!a) {
      // Standing in the giver beacon starts the mission.
      if (target && Math.hypot(p.x - target.x, p.z - target.z) < 3.4) this.startMission(ctx);
      return;
    }

    a.lastX = p.x;
    a.lastZ = p.z;
    const m = a.def;
    const distTo = (t) => (t ? Math.hypot(p.x - t.x, p.z - t.z) : Infinity);

    if (a.timer !== null && m.type !== 'deliver') {
      a.timer -= dt;
      if (a.timer <= 0) {
        this.failMission(ctx, 'Waktu habis!');
        return;
      }
    }

    switch (m.type) {
      case 'deliver': {
        if (a.stage === 'pickup' && distTo(m.pickup) < 4) {
          a.stage = 'dropoff';
          a.hasPackage = true;
          if (m.wantedFloor) police.setFloor(m.wantedFloor);
          this.emit('stage', { text: 'Paket diambil! Antar ke tujuan.' });
          this.sound.pickup();
        } else if (a.stage === 'dropoff' && distTo(m.dropoff) < 5) {
          this.completeMission(ctx);
        }
        break;
      }
      case 'race': {
        const [cx, cz] = m.checkpoints[a.checkpoint];
        if (Math.hypot(p.x - cx, p.z - cz) < 6.5 && player.mode === 'car') {
          a.checkpoint++;
          this.sound.checkpoint();
          this.emit('stage', { text: `Gerbang ${a.checkpoint}/${m.checkpoints.length}` });
          if (a.checkpoint >= m.checkpoints.length) this.completeMission(ctx);
        }
        break;
      }
      case 'chase': {
        const thief = this.thief;
        if (!thief) break;
        // The thief flees to whichever far corner is away from the player.
        if (now > a.retargetAt) {
          a.retargetAt = now + 4;
          const corners = [[-110, 30], [110, 30], [-110, 210], [110, 210], [0, 100]];
          let best = corners[0];
          let bestScore = -Infinity;
          for (const [cx, cz] of corners) {
            const score = Math.hypot(cx - p.x, cz - p.z) - Math.hypot(cx - thief.mesh.position.x, cz - thief.mesh.position.z) * 0.4;
            if (score > bestScore) {
              bestScore = score;
              best = { x: cx, z: cz };
            }
          }
          a.thiefTarget = best;
        }
        const tp = thief.mesh.position;
        const dx = a.thiefTarget.x - tp.x;
        const dz = a.thiefTarget.z - tp.z;
        const want = Math.atan2(dx, dz);
        let diff = want - thief.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        thief.update(dt, { throttle: thief.health > 30 ? 0.95 : 0, steer: THREE.MathUtils.clamp(diff * 1.8, -1, 1) }, ctx.world);
        if (thief.health <= 30 && distTo({ x: tp.x, z: tp.z }) < 7) {
          this.completeMission(ctx);
        }
        break;
      }
      case 'passenger': {
        if (a.stage === 'pickup') {
          if (player.mode === 'car' && distTo(m.giver) < 5 && Math.abs(player.vehicle.speed) < 0.6) {
            a.stage = 'dropoff';
            a.timer = m.timeLimit;
            this.emit('stage', { text: 'Nona Laras naik! Antar ke Bukit Cemara.' });
            this.sound.pickup();
          }
        } else if (distTo(m.dropoff) < 7 && player.mode === 'car') {
          this.completeMission(ctx);
        }
        break;
      }
      case 'collect': {
        m.spots.forEach(([x, z], i) => {
          const c = this.caseMeshes[i];
          if (c.visible && Math.hypot(p.x - x, p.z - z) < 3.2) {
            c.visible = false;
            a.collected++;
            police.addCrime(0.25);
            this.sound.pickup();
            this.emit('stage', { text: `Koper ${a.collected}/${m.spots.length}` });
            if (a.collected >= m.spots.length) this.completeMission(ctx);
          }
        });
        break;
      }
      case 'escape': {
        if (distTo(m.hideout) < 6) this.completeMission(ctx);
        break;
      }
      default:
        break;
    }
  }
}
