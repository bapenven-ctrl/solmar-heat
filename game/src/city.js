// Builds both districts: the Solmar coastal grid and terraced Bukit Cemara,
// plus the harbor, beach, airstrip, landmarks and every static collider.
import * as THREE from 'three';
import { WORLD, COLORS, PLACES, groundHeight } from './config.js';
import { windowTexture } from './render.js';

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...o });
function box(scene, w, h, d, x, y, z, mat, colliders, solid = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); scene.add(m);
  if (solid && colliders) colliders.push({ x, z, hw: w / 2, hd: d / 2 });
  return m;
}
function flat(scene, w, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); scene.add(m); return m;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const roadMat = M(COLORS.road), roadMatH = M(COLORS.roadHill);
  const texMats = COLORS.building.map(c => new THREE.MeshStandardMaterial({ map: windowTexture(rng, '#' + c.toString(16).padStart(6, '0')), roughness: 0.85 }));
  const villaMats = COLORS.villa.map(c => M(c));

  // --- ground: main plain, terraced hill, beach, sea, little bay + bridge
  flat(scene, 920, 560, -210, -0.05, 0, M(COLORS.grass));
  for (let i = 0; i < 6; i++) {
    const x1 = -292 - 45 * i, x0 = x1 - 45;
    box(scene, 45, 3 * i + 1, 520, (x0 + x1) / 2, (3 * i - 1) / 2 - 0.02, 0, M(COLORS.hillGround), null, false);
  }
  box(scene, 110, 19, 520, -617, 8.4, 0, M(COLORS.hillGround), null, false);
  flat(scene, 46, 560, 268, 0.0, 0, M(COLORS.sand));
  const sea = flat(scene, 700, 900, 640, -0.35, 0, M(COLORS.sea, { roughness: 0.35, metalness: 0.25 }));
  flat(scene, 34, 60, -279, -0.3, 0, M(COLORS.sea));                       // bay inlet
  box(scene, 40, 0.5, 17, -279, 0.12, 0, M(0x6e5a44), null, false);       // bridge deck

  // --- main grid roads
  const coords = []; for (let v = WORLD.mainMin; v <= WORLD.mainMax; v += WORLD.grid) coords.push(v);
  for (const v of coords) {
    flat(scene, 500, 15, 0, 0.03, v, roadMat);
    flat(scene, 15, 500, v, 0.03, 0, roadMat);
  }
  flat(scene, 60, 15, -272, 0.06, 0, roadMat); // coastal connector to the hills
  // --- hill roads: two stepped east-west terraces roads + one north-south
  for (const rz of [-90, 90]) for (let i = 0; i < 7; i++) {
    const cx = -315 - 45 * i;
    flat(scene, 47, 13, cx, groundHeight(cx, rz) + 0.06, rz, roadMatH);
  }
  flat(scene, 13, 430, -440, groundHeight(-440, 0) + 0.06, 0, roadMatH);
  flat(scene, 15, 430, -300 + 7, 0.05, 0, roadMat); // hill foot link
  // --- airstrip
  flat(scene, 330, 30, 120, 0.04, PLACES.airport.z, M(0x35313c));
  for (let x = -30; x <= 270; x += 30) flat(scene, 14, 1.6, x, 0.06, PLACES.airport.z, M(0xe8e4da));
  box(scene, 34, 9, 16, 40, 4.5, 348, M(0x7d7468), colliders);
  box(scene, 26, 7, 14, 210, 3.5, 348, M(0x8a7a63), colliders);

  // --- main district buildings (skip harbor block and park blocks)
  for (const bx of coords.slice(0, -1)) for (const bz of coords.slice(0, -1)) {
    const cx = bx + 30, cz = bz + 30;
    if (cx > 180 && cz < -120) continue;              // harbor apron
    if ((cx === -30 && cz === -30) || (cx === 90 && cz === 90)) continue; // tower / park
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const w = rng.range(13, 20), d = rng.range(13, 20), h = rng.range(12, 46);
      const x = cx + rng.range(-11, 11), z = cz + rng.range(-11, 11);
      box(scene, w, h, d, x, h / 2, z, rng.pick(texMats), colliders);
    }
  }
  // Menara Solmar — the downtown landmark tower with a blinking beacon.
  const tower = box(scene, 16, 86, 16, -30, 43, -30, texMats[3], colliders);
  box(scene, 20, 4, 20, -30, 88, -30, M(0x3c3648), null, false);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), beaconMat);
  beacon.position.set(-30, 93, -30); scene.add(beacon);
  // Park block: palms and a fountain disc.
  flat(scene, 44, 44, 90, 0.05, 90, M(0x5d7a42));
  const fount = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 1, 20), M(0x9aa4ae));
  fount.position.set(90, 0.5, 90); scene.add(fount); colliders.push({ x: 90, z: 90, hw: 6, hd: 6 });

  // --- harbor: container stacks, crane, warehouse
  const contCols = [0xb5493a, 0x3a6ea5, 0x4d9e57, 0xd18f2d, 0x7456a8];
  for (let i = 0; i < 14; i++) {
    const x = 216 + (i % 4) * 13, z = -206 + Math.floor(i / 4) * 13;
    box(scene, 11, 4.4, 5, x, 2.2 + (i % 3 === 0 ? 4.4 : 0), z, M(rng.pick(contCols)), colliders);
  }
  const craneMat = M(0xd18f2d);
  box(scene, 2, 30, 2, 238, 15, -128, craneMat, colliders);
  box(scene, 2, 30, 2, 262, 15, -128, craneMat, colliders);
  box(scene, 40, 2.4, 2.4, 250, 30, -128, craneMat, null, false);
  box(scene, 44, 10, 20, 236, 5, -84, M(0x77685a), colliders);

  // --- Bukit Cemara: villas on the terraces + lookout tower landmark
  for (let i = 0; i < 26; i++) {
    const x = rng.range(-565, -318), z = rng.pick([-150, -130, -50, -30, 30, 50, 140, 160]) + rng.range(-6, 6);
    const w = rng.range(11, 16), d = rng.range(10, 14), h = rng.range(5, 9);
    const y = groundHeight(x, z);
    box(scene, w, h, d, x, y + h / 2, z, rng.pick(villaMats), colliders);
    box(scene, w + 2, 1.2, d + 2, x, y + h + 0.6, z, M(0x8a4f38), null, false);
  }
  const lk = PLACES.lookout, lkY = groundHeight(lk.x, lk.z);
  box(scene, 7, 30, 7, lk.x, lkY + 15, lk.z, M(0xcfc0a0), colliders);
  box(scene, 13, 2, 13, lk.x, lkY + 31, lk.z, M(0x8a4f38), null, false);
  box(scene, 2, 6, 2, lk.x, lkY + 35, lk.z, M(0xcfc0a0), null, false);

  // --- palms + street lamps in both districts
  const trunkM = M(0x7a5c3e), frondM = M(0x3f7a3a, { side: THREE.DoubleSide });
  function palm(x, z) {
    const y = groundHeight(x, z);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 7, 6), trunkM);
    tr.position.set(x, y + 3.5, z); scene.add(tr);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.5, 7), frondM);
    crown.position.set(x, y + 7.4, z); scene.add(crown);
    colliders.push({ x, z, hw: 0.6, hd: 0.6 });
  }
  for (let z = -230; z <= 230; z += 46) palm(252, z + rng.range(-6, 6));
  for (let i = 0; i < 16; i++) palm(rng.range(-230, 230), rng.pick(coords) + 11);
  for (let i = 0; i < 10; i++) palm(rng.range(-560, -320), rng.pick([-90, 90]) + 12);
  const lampGlow = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  function lamp(x, z) {
    const y = groundHeight(x, z);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 6, 5), M(0x333038));
    p.position.set(x, y + 3, z); scene.add(p);
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampGlow);
    s.position.set(x, y + 6.2, z); scene.add(s);
  }
  for (const v of coords) { lamp(v + 10, v + 10); lamp(v - 10, -v - 10); }
  for (let x = -560; x <= -320; x += 60) { lamp(x, -82); lamp(x, 98); }

  let tick = 0;
  return {
    colliders,
    update(dt) {
      tick += dt;
      beaconMat.color.setScalar(0).offsetHSL(0, 0, 0); // keep material live
      beacon.visible = (tick % 1.4) < 0.8;
      sea.position.y = -0.35 + Math.sin(tick * 0.7) * 0.05;
    },
  };
}

// Circle-vs-AABB push-out used by the player and every car.
export function collide(pos, r, colliders) {
  for (const c of colliders) {
    const dx = pos.x - Math.max(c.x - c.hw, Math.min(pos.x, c.x + c.hw));
    const dz = pos.z - Math.max(c.z - c.hd, Math.min(pos.z, c.z + c.hd));
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 < 1e-6) { pos.x += r; continue; }
      const d = Math.sqrt(d2), push = (r - d) / d;
      pos.x += dx * push; pos.z += dz * push;
    }
  }
}
