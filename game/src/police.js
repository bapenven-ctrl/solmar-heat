// Police response: patrol cruisers that chase and ram, roadblocks from
// wanted 3, and the spotlight helicopter from wanted 4. Wanted never decays
// while a unit or the helicopter can see the player.
import * as THREE from 'three';
import { COLORS, groundHeight } from './config.js';
import { Car } from './vehicles.js';

export class Police {
  constructor(scene) {
    this.scene = scene; this.units = [];
    this.roadblock = null; this.ramCooldown = 0; this.blink = 0;
    // Helicopter: simple body, spinning rotor, translucent searchlight cone.
    const heli = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2c3242, roughness: 0.4, metalness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.7, 5.6), bodyMat); heli.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 4.6), bodyMat);
    tail.position.set(0, 0.3, -4.6); heli.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x111116 }));
    rotor.position.y = 1.25; heli.add(rotor);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7.5, 30, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.20, side: THREE.DoubleSide, depthWrite: false }));
    cone.position.y = -15.8; heli.add(cone);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff6c9 }));
    lamp.position.y = -1; heli.add(lamp);
    heli.visible = false; scene.add(heli);
    this.heli = heli; this.rotor = rotor; this.heliPos = new THREE.Vector3(0, 60, 0);
  }
  desiredUnits(wanted) { return [0, 1, 2, 3, 4, 5][wanted] || 0; }
  update(dt, G) {
    this.blink += dt; this.ramCooldown -= dt;
    if (G.shotFreeze) { // staged screenshot: hold positions, keep lights + rotor alive
      for (const u of this.units) if (u.mesh.userData.lights) {
        const ph = Math.floor(this.blink * 5) % 2;
        u.mesh.userData.lights[0].material.color.setHex(ph ? 0xff2a2a : 0x550000);
        u.mesh.userData.lights[1].material.color.setHex(ph ? 0x000055 : 0x2a5bff);
      }
      if (this.heli.visible) this.rotor.rotation.y += dt * 22;
      G.policeSeen = true; return;
    }
    const P = G.player, want = this.desiredUnits(G.wanted);
    while (this.units.length < want) {
      const a = (this.units.length * 2.4) + 1;
      const x = P.x + Math.sin(a) * 55, z = P.z + Math.cos(a) * 55;
      this.units.push(new Car(this.scene, COLORS.police, x, z, a + Math.PI, { police: true }));
    }
    while (this.units.length > want) { const u = this.units.pop(); this.scene.remove(u.mesh); }
    let seen = false;
    for (const u of this.units) {
      const dx = P.x - u.x, dz = P.z - u.z, dist = Math.hypot(dx, dz);
      if (dist < 70) seen = true;
      const targetHeading = Math.atan2(dx, dz);
      let dh = targetHeading - u.heading;
      while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, dh * 1.6));
      u.drive(dt, { f: dist > 7 ? 1 : 0.25, s: steer }, G.colliders, 37);
      if (u.mesh.userData.lightBar) {
        const ph = Math.floor(this.blink * 5) % 2;
        u.mesh.userData.lights[0].material.color.setHex(ph ? 0xff2a2a : 0x550000);
        u.mesh.userData.lights[1].material.color.setHex(ph ? 0x000055 : 0x2a5bff);
      }
      if (dist < 3.4 && this.ramCooldown <= 0) {
        this.ramCooldown = 1.1;
        P.health -= P.car ? 2 : 5;
        if (P.car) P.car.health -= 4;
        G.onRam?.();
      }
    }
    // Roadblock: two cruisers + striped barricades across the road ahead.
    if (G.wanted >= 3 && !this.roadblock) this.spawnRoadblock(G);
    if (G.wanted < 3 && this.roadblock) this.clearRoadblock(G);
    if (this.roadblock) {
      const rb = this.roadblock;
      const d = Math.hypot(P.x - rb.x, P.z - rb.z);
      if (d > 130) this.clearRoadblock(G);
      else if (d < 60) seen = true;
    }
    // Helicopter keeps visual contact from wanted 4 up.
    const heliOn = G.wanted >= 4;
    this.heli.visible = heliOn;
    if (heliOn) {
      seen = true;
      const t = G.time;
      this.heliPos.set(P.x + Math.sin(t * 0.35) * 14, P.y + 30, P.z + Math.cos(t * 0.35) * 14);
      this.heli.position.copy(this.heliPos);
      this.heli.rotation.y = Math.atan2(P.x - this.heliPos.x, P.z - this.heliPos.z);
      this.rotor.rotation.y += dt * 22;
    }
    G.policeSeen = seen;
  }
  spawnRoadblock(G) {
    const P = G.player, h = P.headingNow;
    const ahead = 46;
    let x = P.x + Math.sin(h) * ahead, z = P.z + Math.cos(h) * ahead;
    // Snap to the nearest road line so the block sits across a real street.
    if (Math.abs(Math.sin(h)) > Math.abs(Math.cos(h))) z = Math.round(z / 60) * 60;
    else x = Math.round(x / 60) * 60;
    x = Math.max(-238, Math.min(238, x)); z = Math.max(-238, Math.min(238, z));
    const grp = new THREE.Group(); this.scene.add(grp);
    const perp = h + Math.PI / 2;
    const cars = [];
    for (const off of [-4.2, 4.2]) {
      const c = new Car(this.scene, COLORS.police,
        x + Math.sin(perp) * off, z + Math.cos(perp) * off, perp, { police: true });
      cars.push(c);
    }
    const stripeM = new THREE.MeshStandardMaterial({ color: 0xe8e2d6 });
    const stripeR = new THREE.MeshStandardMaterial({ color: 0xc22e2e });
    const bars = [];
    for (const off of [-8.5, 0, 8.5]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.1, 0.5), (off === 0 ? stripeR : stripeM));
      b.position.set(x + Math.sin(perp) * off, groundHeight(x, z) + 0.8, z + Math.cos(perp) * off);
      b.rotation.y = perp; this.scene.add(b); bars.push(b);
      G.colliders.push({ x: b.position.x, z: b.position.z, hw: 2.4, hd: 2.4, roadblock: true });
    }
    this.roadblock = { x, z, cars, bars, grp };
  }
  clearRoadblock(G) {
    if (!this.roadblock) return;
    if (G) this.removeRoadblockColliders(G);
    for (const c of this.roadblock.cars) this.scene.remove(c.mesh);
    for (const b of this.roadblock.bars) this.scene.remove(b);
    this.scene.remove(this.roadblock.grp);
    this.roadblock = null;
  }
  removeRoadblockColliders(G) {
    for (let i = G.colliders.length - 1; i >= 0; i--)
      if (G.colliders[i].roadblock) G.colliders.splice(i, 1);
  }
}
