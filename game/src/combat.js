// Fists and pistol against the Karang gang: guards with health who close
// in and swing back, plus ambient gang members near their yard.
import * as THREE from 'three';
import { groundHeight, COLORS } from './config.js';
import { makeFigure } from './traffic.js';

export class Combat {
  constructor(scene, rng) {
    this.scene = scene; this.rng = rng; this.guards = [];
    this.muzzle = 0; this.swingT = 0;
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd76a }));
    flash.visible = false; scene.add(flash); this.flash = flash;
  }
  spawnGuard(x, z, hp = 3) {
    const mesh = makeFigure(this.rng, COLORS.gang);
    this.scene.add(mesh);
    const g = { mesh, x, z, hp, heading: 0, swing: 0, dead: false };
    this.guards.push(g); return g;
  }
  clearGuards() {
    for (const g of this.guards) this.scene.remove(g.mesh);
    this.guards = [];
  }
  aliveGuards() { return this.guards.filter(g => !g.dead); }
  punch(G) {
    this.swingT = 0.25;
    let hit = false;
    for (const g of this.aliveGuards()) {
      const d = Math.hypot(g.x - G.player.x, g.z - G.player.z);
      if (d < 2.6) { g.hp -= 1; hit = true; this.hurt(g, G); }
    }
    return hit;
  }
  shoot(G) {
    this.muzzle = 0.07;
    const P = G.player, h = P.headingNow;
    this.flash.visible = true;
    this.flash.position.set(P.x + Math.sin(h) * 1.2, P.y + 1.5, P.z + Math.cos(h) * 1.2);
    let best = null, bd = 46;
    for (const g of this.aliveGuards()) {
      const dx = g.x - P.x, dz = g.z - P.z, d = Math.hypot(dx, dz);
      if (d > bd) continue;
      let dh = Math.atan2(dx, dz) - h;
      while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      if (Math.abs(dh) < 0.3) { best = g; bd = d; }
    }
    if (best) { best.hp -= 2; this.hurt(best, G); return true; }
    return false;
  }
  hurt(g, G) {
    if (g.hp <= 0 && !g.dead) {
      g.dead = true; g.mesh.rotation.x = Math.PI / 2; g.mesh.position.y = groundHeight(g.x, g.z) + 0.3;
      G.onGuardDown?.(g);
    }
  }
  update(dt, G) {
    if (this.muzzle > 0) { this.muzzle -= dt; if (this.muzzle <= 0) this.flash.visible = false; }
    if (this.swingT > 0) this.swingT -= dt;
    for (const g of this.guards) {
      if (g.dead) continue;
      const dx = G.player.x - g.x, dz = G.player.z - g.z, d = Math.hypot(dx, dz);
      g.heading = Math.atan2(dx, dz);
      if (d > 1.9 && d < 60) {
        const sp = 3.6;
        g.x += Math.sin(g.heading) * sp * dt; g.z += Math.cos(g.heading) * sp * dt;
      }
      g.swing -= dt;
      if (d <= 2.0 && g.swing <= 0) { g.swing = 1.2; G.player.health -= 4; G.onPlayerHurt?.(); }
      g.mesh.position.set(g.x, groundHeight(g.x, g.z), g.z);
      g.mesh.rotation.y = g.heading;
    }
  }
}
