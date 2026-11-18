// Hitscan combat: tracers, muzzle flash, impact sparks and hit tests
// against people, cars and buildings. Whoever fires calls shoot(); the
// caller decides what a hit means (crime, damage, a felled target).

import * as THREE from 'three';

const TRACER_LIFE = 0.07;

export class Combat {
  constructor(scene, sound) {
    this.scene = scene;
    this.sound = sound;
    this.tracers = [];
    this.sparks = [];
    this.flash = new THREE.PointLight(0xffc37a, 0, 16, 1.6);
    scene.add(this.flash);
    this.tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffd98a,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffb340 });
    this.sparkGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  }

  // targets: [{kind, ref, x, y, z, r}] — spheres tested along the ray.
  // colliders block shots at an assumed wall height.
  shoot(from, dir, targets, colliders, opts = {}) {
    this.sound.shot();
    const maxDist = 110;
    let best = maxDist;

    for (const c of colliders) {
      // 2D ray vs AABB (slab test), walls count up to 16 m high.
      if (from.y > 16) continue;
      let tmin = 0;
      let tmax = best;
      for (const axis of ['x', 'z']) {
        const o = axis === 'x' ? from.x : from.z;
        const d = axis === 'x' ? dir.x : dir.z;
        const lo = axis === 'x' ? c.minX : c.minZ;
        const hi = axis === 'x' ? c.maxX : c.maxZ;
        if (Math.abs(d) < 1e-6) {
          if (o < lo || o > hi) {
            tmin = Infinity;
            break;
          }
        } else {
          let t1 = (lo - o) / d;
          let t2 = (hi - o) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) {
            tmin = Infinity;
            break;
          }
        }
      }
      if (tmin !== Infinity && tmin > 0.5 && tmin < best) best = tmin;
    }

    let hit = null;
    const center = new THREE.Vector3();
    for (const t of targets) {
      center.set(t.x, t.y, t.z);
      const oc = center.clone().sub(from);
      const along = oc.dot(dir);
      if (along < 0.5 || along > best) continue;
      const closest = from.clone().addScaledVector(dir, along);
      if (closest.distanceToSquared(center) < t.r * t.r) {
        best = along;
        hit = t;
      }
    }

    const end = from.clone().addScaledVector(dir, best);
    this.spawnTracer(from, end);
    this.flash.position.copy(from).addScaledVector(dir, 0.7);
    this.flash.intensity = 26;
    if (hit || best < maxDist) this.spawnSparks(end);
    if (hit && opts.onHit) opts.onHit(hit, end);
    return hit;
  }

  spawnTracer(from, to) {
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    const geo = new THREE.BoxGeometry(0.035, 0.035, len);
    const mesh = new THREE.Mesh(geo, this.tracerMat);
    mesh.position.copy(from).lerp(to, 0.5);
    mesh.lookAt(to);
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: TRACER_LIFE });
  }

  spawnSparks(at) {
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      mesh.position.copy(at);
      this.scene.add(mesh);
      this.sparks.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 3.4, Math.random() * 3.2, (Math.random() - 0.5) * 3.4),
        life: 0.32,
      });
    }
    this.sound.hit();
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.vel.y -= 9.8 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.sparks.splice(i, 1);
      }
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 320);
  }
}
