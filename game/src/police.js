// The Solmar police: a wanted level that rises with crime and fades when
// nobody is watching, patrol cars that hunt the player, striped
// roadblocks from three stars, and a helicopter with a searchlight
// from four.

import * as THREE from 'three';
import { WORLD, TUNING } from './config.js';
import { makeCarMesh, Vehicle } from './vehicles.js';

function barrierMesh() {
  const g = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? '#e8e6df' : '#d92b2b';
    ctx.fillRect(i * 22 - 10, 0, 22, 32);
  }
  const tex = new THREE.CanvasTexture(canvas);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.8, 0.18),
    new THREE.MeshLambertMaterial({ map: tex }),
  );
  board.position.y = 0.75;
  board.castShadow = true;
  g.add(board);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.8, 0.5), new THREE.MeshLambertMaterial({ color: 0x3c4148 }));
    leg.position.set(s * 1.05, 0.4, 0);
    g.add(leg);
  }
  return g;
}

function helicopterMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1d4ed8 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 5.2), bodyMat);
  body.castShadow = true;
  g.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.2, 1.6), new THREE.MeshLambertMaterial({ color: 0x9fd4e8 }));
  glass.position.set(0, 0.2, 2.4);
  g.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 4.6), bodyMat);
  tail.position.set(0, 0.4, -4.6);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 0.9), bodyMat);
  fin.position.set(0, 0.9, -6.8);
  g.add(fin);
  for (const s of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 3.6), darkMat);
    skid.position.set(s * 1.1, -1.5, 0.2);
    g.add(skid);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), darkMat);
    strut.position.set(s * 1.1, -1.05, 0.9);
    g.add(strut);
  }
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.06, 0.5), darkMat);
  rotor.position.y = 1.45;
  g.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.7, 0.3), darkMat);
  tailRotor.position.set(0.3, 0.9, -6.8);
  g.add(tailRotor);
  g.userData.rotor = rotor;
  g.userData.tailRotor = tailRotor;
  return g;
}

export class Police {
  constructor(scene, city, rng, sound, combat) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.sound = sound;
    this.combat = combat;
    this.wanted = 0;
    this.floor = 0;
    this.cops = [];
    this.lastSeenAt = -999;
    this.bustTimer = 0;
    this.extraColliders = [];
    this.roadblock = null;
    this.roadblockCooldown = 0;
    this.heli = null;
    this.heliHealth = 130;
    this.heliRespawnAt = -1;
    this.shotClock = 0;
    this.events = { busted: false };
  }

  get stars() {
    return this.wanted <= 0.05 ? 0 : Math.min(5, Math.ceil(this.wanted));
  }

  get anyActive() {
    return this.cops.length > 0 || !!this.heli;
  }

  addCrime(points) {
    this.wanted = Math.min(5, this.wanted + points);
  }

  setFloor(n) {
    this.floor = n ?? 0;
    if (this.wanted < this.floor) this.wanted = this.floor;
  }

  reset() {
    this.wanted = 0;
    this.floor = 0;
    this.bustTimer = 0;
    for (const cop of this.cops) this.scene.remove(cop.mesh);
    this.cops = [];
    this.clearRoadblock();
    if (this.heli) {
      this.scene.remove(this.heli.group);
      this.heli = null;
    }
  }

  spawnPointNear(playerPos) {
    const rng = this.rng;
    const hillSpots = [[0, 300], [0, 352], [-60, 352], [60, 352], [0, 398]];
    for (let tries = 0; tries < 8; tries++) {
      let x;
      let z;
      if (playerPos.z > 240) {
        [x, z] = rng.pick(hillSpots);
      } else {
        x = rng.pick(WORLD.avenueX);
        z = rng.pick(WORLD.streetZ);
      }
      const d = Math.hypot(x - playerPos.x, z - playerPos.z);
      if (d > 55 && d < 130) return { x, z };
    }
    return { x: playerPos.x + 80, z: playerPos.z + 40 };
  }

  spawnCop(playerPos) {
    const spot = this.spawnPointNear(playerPos);
    const mesh = makeCarMesh(this.rng, { police: true });
    this.scene.add(mesh);
    const cop = new Vehicle(mesh, { maxSpeed: TUNING.copMaxSpeed, accel: 15 });
    cop.angle = Math.atan2(playerPos.x - spot.x, playerPos.z - spot.z);
    cop.setPosition(spot.x, spot.z, this.city.groundHeight);
    cop.isCop = true;
    this.cops.push(cop);
    return cop;
  }

  clearRoadblock() {
    if (!this.roadblock) return;
    for (const part of this.roadblock.parts) this.scene.remove(part);
    for (const cop of this.roadblock.cops) {
      this.scene.remove(cop.mesh);
      this.cops = this.cops.filter((c) => c !== cop);
    }
    this.roadblock = null;
    this.extraColliders = [];
  }

  placeRoadblock(player, now) {
    const p = player.pos;
    // Block the road the player is on, ahead of their heading.
    let bx;
    let bz;
    let angle;
    const nearAvenue = WORLD.avenueX.reduce((best, ax) => (Math.abs(ax - p.x) < Math.abs(best - p.x) ? ax : best), WORLD.avenueX[0]);
    const nearStreet = WORLD.streetZ.reduce((best, sz) => (Math.abs(sz - p.z) < Math.abs(best - p.z) ? sz : best), WORLD.streetZ[0]);
    const heading = player.mode === 'car' && player.vehicle
      ? { x: Math.sin(player.vehicle.angle), z: Math.cos(player.vehicle.angle) }
      : { x: Math.sin(player.angle), z: Math.cos(player.angle) };
    if (Math.abs(p.x - nearAvenue) < Math.abs(p.z - nearStreet)) {
      bx = nearAvenue;
      bz = p.z + Math.sign(heading.z || 1) * 46;
      angle = Math.PI / 2;
    } else {
      bx = p.x + Math.sign(heading.x || 1) * 46;
      bz = nearStreet;
      angle = 0;
    }
    const parts = [];
    const cops = [];
    const group = new THREE.Group();
    for (let i = -1; i <= 1; i++) {
      const barrier = barrierMesh();
      const off = i * 3.1;
      barrier.position.set(bx + Math.cos(angle) * off, this.city.groundHeight(bx, bz), bz + Math.sin(angle) * off);
      barrier.rotation.y = angle;
      this.scene.add(barrier);
      parts.push(barrier);
    }
    for (const s of [-1, 1]) {
      const mesh = makeCarMesh(this.rng, { police: true });
      this.scene.add(mesh);
      const cop = new Vehicle(mesh, { maxSpeed: TUNING.copMaxSpeed });
      const cx = bx + Math.cos(angle) * s * 5.4;
      const cz = bz + Math.sin(angle) * s * 5.4;
      cop.angle = angle + s * 0.6;
      cop.setPosition(cx, cz, this.city.groundHeight);
      cop.isCop = true;
      cop.roadblockDuty = true;
      this.cops.push(cop);
      cops.push(cop);
      parts.push(mesh);
    }
    group.position.set(bx, 0, bz);
    this.roadblock = { x: bx, z: bz, parts, cops, placedAt: now };
    this.extraColliders = [
      { minX: bx - (angle ? 1 : 5.6), maxX: bx + (angle ? 1 : 5.6), minZ: bz - (angle ? 5.6 : 1), maxZ: bz + (angle ? 5.6 : 1) },
    ];
  }

  spawnHeli() {
    const group = helicopterMesh();
    this.scene.add(group);
    const spot = new THREE.SpotLight(0xfff2c8, 0, 130, 0.21, 0.45, 0.6);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(9.5, 34, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffeec2,
        transparent: true,
        opacity: 0.13,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.scene.add(cone);
    this.scene.add(spot);
    this.scene.add(spot.target);
    this.heli = { group, spot, cone, angle: 0, health: 130 };
    this.heliHealth = 130;
  }

  heliTarget() {
    if (!this.heli) return null;
    const p = this.heli.group.position;
    return { kind: 'heli', ref: this, x: p.x, y: p.y, z: p.z, r: 3.4 };
  }

  damageHeli(amount) {
    if (!this.heli) return;
    this.heli.health -= amount;
    if (this.heli.health <= 0) {
      this.scene.remove(this.heli.group);
      this.scene.remove(this.heli.spot);
      this.scene.remove(this.heli.cone);
      this.heli = null;
      this.heliRespawnAt = performance.now() / 1000 + 30;
      this.sound.crash(1);
    }
  }

  copControl(cop, player, dt) {
    const p = cop.mesh.position;
    const target = player.pos;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let diff = want - cop.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = THREE.MathUtils.clamp(diff * 1.9, -1, 1);
    let throttle = 1;
    if (player.mode === 'foot' && dist < 9) throttle = dist < 6 ? -0.2 : 0.25;
    else if (dist < 8) throttle = 0.35;
    else if (dist < 16) throttle = 0.7;
    return { throttle, steer };
  }

  update(dt, now, ctx) {
    this.events.busted = false;
    const { player, world } = ctx;
    const stars = this.stars;
    const p = player.pos;

    // Seeing the player refreshes the hunt; hiding decays the wanted level.
    let seen = false;
    for (const cop of this.cops) {
      if (cop.mesh.position.distanceToSquared(p) < 60 * 60) seen = true;
    }
    if (this.heli) seen = true;
    if (player.mode === 'car' && stars > 0) seen = seen || this.cops.length > 0;
    if (seen) this.lastSeenAt = now;
    if (this.wanted > this.floor && now - this.lastSeenAt > TUNING.wantedDecaySeconds) {
      this.wanted = Math.max(this.floor, this.wanted - 1);
      this.lastSeenAt = now;
      if (this.wanted <= 0.05 && this.floor === 0) this.wanted = 0;
    }

    // Maintain the pursuit strength for the current wanted level.
    const desired = [0, 1, 2, 3, 4, 5][stars] ?? 0;
    const activeCops = this.cops.filter((c) => !c.roadblockDuty);
    if (activeCops.length < desired) this.spawnCop(p);
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
      const far = cop.mesh.position.distanceToSquared(p) > 175 * 175;
      if ((stars === 0 && far) || cop.dead) {
        this.scene.remove(cop.mesh);
        this.cops.splice(i, 1);
      }
    }
    if (stars === 0 && this.cops.length && !seen) {
      // Nobody is looking and nobody wants you: patrol drifts away.
      for (const cop of [...this.cops]) {
        this.scene.remove(cop.mesh);
      }
      this.cops = [];
    }

    for (const cop of this.cops) {
      if (cop.roadblockDuty) continue;
      const control = this.copControl(cop, player, dt);
      cop.update(dt, control, world);
      const bar = cop.mesh.userData.lightBar;
      if (bar) {
        const phase = Math.floor(now * 5 + cop.mesh.position.x) % 2 === 0;
        bar.redMat.color.setHex(phase ? 0xff2a2a : 0x571010);
        bar.blueMat.color.setHex(phase ? 0x5710a0 : 0x2a6bff);
      }
      cop.setBeam(ctx.dark);
    }

    // Roadblocks from three stars.
    this.roadblockCooldown -= dt;
    if (stars >= 3 && !this.roadblock && this.roadblockCooldown <= 0 && p.z < 235) {
      this.placeRoadblock(player, now);
    }
    if (this.roadblock) {
      const d = Math.hypot(this.roadblock.x - p.x, this.roadblock.z - p.z);
      if (d > 110 || stars < 3) {
        this.clearRoadblock();
        this.roadblockCooldown = 10;
      }
    }

    // Helicopter from four stars.
    if (stars >= 4 && !this.heli && now > this.heliRespawnAt) this.spawnHeli();
    if (stars < 4 && this.heli) {
      this.scene.remove(this.heli.group);
      this.scene.remove(this.heli.spot);
      this.scene.remove(this.heli.cone);
      this.heli = null;
    }
    if (this.heli) {
      const h = this.heli;
      h.angle += dt * 0.35;
      const hx = p.x + Math.cos(h.angle) * 15;
      const hz = p.z + Math.sin(h.angle) * 15;
      const hy = this.city.groundHeight(hx, hz) + 30;
      h.group.position.lerp(new THREE.Vector3(hx, hy, hz), Math.min(1, dt * 1.6));
      h.group.rotation.y = h.angle + Math.PI / 2;
      h.group.userData.rotor.rotation.y += dt * 28;
      h.group.userData.tailRotor.rotation.x += dt * 34;
      const gp = h.group.position;
      h.spot.position.copy(gp);
      h.spot.target.position.copy(p);
      h.spot.intensity = ctx.dark ? 900 : 350;
      h.cone.position.copy(gp).lerp(p, 0.5);
      h.cone.position.y = (gp.y + p.y) / 2;
      h.cone.lookAt(p.x, p.y - 17, p.z);
      h.cone.rotateX(Math.PI / 2);
      h.cone.visible = ctx.dark;
    }

    // Police gunfire at high wanted levels.
    this.shotClock -= dt;
    if (stars >= 3 && this.shotClock <= 0 && !player.dead) {
      this.shotClock = 0.55;
      for (const cop of this.cops) {
        const cp = cop.mesh.position;
        const dist = cp.distanceTo(p);
        if (dist > 30 || dist < 4) continue;
        if (player.mode === 'car' && stars < 4) continue;
        const from = new THREE.Vector3(cp.x, cp.y + 1.3, cp.z);
        const aim = new THREE.Vector3(
          p.x + this.rng.range(-1.6, 1.6),
          p.y + 1.1,
          p.z + this.rng.range(-1.6, 1.6),
        );
        const dir = aim.sub(from).normalize();
        const targets = [
          player.mode === 'car' && player.vehicle
            ? { kind: 'car', ref: player.vehicle, x: p.x, y: p.y + 0.8, z: p.z, r: 2.5 }
            : { kind: 'player', ref: player, x: p.x, y: p.y + 1.1, z: p.z, r: 1.0 },
        ];
        this.combat.shoot(from, dir, targets, [], {
          onHit: (hit) => {
            if (hit.kind === 'player') player.damage(this.rng.range(3, 7));
            else if (hit.kind === 'car') {
              player.vehicle.health -= 6;
              if (this.rng.chance(0.3)) player.damage(2);
            }
          },
        });
        break; // one shooter per volley keeps it fair
      }
    }

    // A cornered player on foot gets arrested.
    if (player.mode === 'foot' && stars >= 1 && !player.dead) {
      let cornered = false;
      for (const cop of this.cops) {
        if (cop.mesh.position.distanceToSquared(p) < 4.2 * 4.2) cornered = true;
      }
      this.bustTimer = cornered ? this.bustTimer + dt : 0;
      if (this.bustTimer > 2.4) {
        this.events.busted = true;
        this.bustTimer = 0;
      }
    } else {
      this.bustTimer = 0;
    }

    this.sound.siren(this.anyActive && stars >= 1);
  }
}
