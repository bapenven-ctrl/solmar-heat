// Builds the city of Solmar: downtown grid, the harbour, the eastern
// airstrip and the Bukit Cemara hill district, plus the road network the
// traffic system drives on and the colliders everything bumps into.

import * as THREE from 'three';
import { WORLD, PALETTE } from './config.js';
import { makeCanvasTexture } from './render.js';

function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

// Analytic ground height: flat downtown and harbour, a ramp climbing to
// the Bukit Cemara plateau in the north.
export function groundHeight(x, z) {
  if (z <= WORLD.hill.rampStartZ) return 0;
  const t = smoothstep((z - WORLD.hill.rampStartZ) / (WORLD.hill.rampTopZ - WORLD.hill.rampStartZ));
  let h = WORLD.hill.plateauHeight * t;
  if (z >= WORLD.hill.plateauZ) {
    h = WORLD.hill.plateauHeight + 1.1 * Math.sin(x * 0.045) * Math.cos((z - WORLD.hill.plateauZ) * 0.05);
  }
  const offRoad = smoothstep((Math.abs(x) - 11) / 18);
  const bumps = (2.0 * Math.sin(x * 0.1 + 1.7) + 1.6 * Math.cos(z * 0.12)) * t;
  return h + bumps * offRoad * (z < WORLD.hill.plateauZ ? 1 : 0.35);
}

function facadeTexture(rng, tone) {
  return makeCanvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = tone;
    ctx.fillRect(0, 0, w, h);
    const cols = 5;
    const rows = 12;
    const cw = w / cols;
    const ch = h / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const lit = rng.chance(0.42);
        ctx.fillStyle = lit ? '#ffd98a' : '#2c3542';
        ctx.fillRect(i * cw + 3, j * ch + 4, cw - 6, ch - 8);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, h - 10, w, 10);
  });
}

function dashTexture() {
  return makeCanvasTexture(32, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(w / 2 - 2, 8, 4, 52);
  });
}

function signTexture(lines, bg, fg) {
  return makeCanvasTexture(512, 192, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = lines.length > 1 ? 54 : 68;
    ctx.font = `900 ${size}px 'Segoe UI', sans-serif`;
    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (size + 12));
    });
  });
}

export function buildCity(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const glowMaterials = [];

  const addCollider = (cx, cz, w, d) => {
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  };

  // Repeated props (lamps, trees, containers) are drawn as instanced
  // meshes: one draw call per kind instead of one per object.
  const dummy = new THREE.Object3D();
  function instanced(geo, mat, items) {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
      if (it.sx || it.sy || it.sz) dummy.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
      else dummy.scale.setScalar(it.s ?? 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    return mesh;
  }

  // ---------- ground base ----------
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 1500),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.08;
  base.receiveShadow = true;
  group.add(base);

  const grassMat = new THREE.MeshLambertMaterial({ color: PALETTE.grass });
  const cityGround = new THREE.Mesh(new THREE.PlaneGeometry(330, 262), grassMat);
  cityGround.rotation.x = -Math.PI / 2;
  cityGround.position.set(0, -0.02, 102);
  cityGround.receiveShadow = true;
  group.add(cityGround);

  // ---------- roads ----------
  const asphaltMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const dashTex = dashTexture();
  dashTex.wrapS = THREE.RepeatWrapping;
  dashTex.wrapT = THREE.RepeatWrapping;

  function roadPlane(cx, cz, w, d, alongZ) {
    const g = new THREE.Group();
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(w, d), asphaltMat);
    surf.rotation.x = -Math.PI / 2;
    surf.receiveShadow = true;
    g.add(surf);
    const len = alongZ ? d : w;
    const lineTex = dashTex.clone();
    lineTex.needsUpdate = true;
    lineTex.repeat.set(1, Math.max(2, Math.floor(len / 9)));
    if (!alongZ) lineTex.rotation = Math.PI / 2;
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(alongZ ? 0.5 : len, alongZ ? len : 0.5),
      new THREE.MeshBasicMaterial({ map: lineTex, transparent: true }),
    );
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.02;
    g.add(line);
    for (const s of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(alongZ ? 2.2 : w, alongZ ? d : 2.2), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(alongZ ? s * (WORLD.roadHalf + 1.1) : 0, -0.005, alongZ ? 0 : s * (WORLD.roadHalf + 1.1));
      walk.receiveShadow = true;
      g.add(walk);
    }
    g.position.set(cx, 0.01, cz);
    group.add(g);
    return g;
  }

  for (const x of WORLD.avenueX) roadPlane(x, 102, WORLD.roadHalf * 2, 252, true);
  for (const z of WORLD.streetZ) roadPlane(0, z, 300, WORLD.roadHalf * 2, false);
  roadPlane(0, -12, 300, WORLD.roadHalf * 2, false); // harbour front road

  // ---------- buildings ----------
  const facadeMats = PALETTE.buildingTones.map((tone) => {
    const tex = facadeTexture(rng, `#${new THREE.Color(tone).getHexString()}`);
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffb45e, emissiveMap: tex, emissiveIntensity: 0 });
    glowMaterials.push(mat);
    return mat;
  });
  const boxGeoCache = new Map();
  function boxGeo(w, h, d) {
    const key = `${w}|${h}|${d}`;
    if (!boxGeoCache.has(key)) boxGeoCache.set(key, new THREE.BoxGeometry(w, h, d));
    return boxGeoCache.get(key);
  }

  function building(x, z, w, d, h, fac) {
    const mesh = new THREE.Mesh(boxGeo(w, h, d), fac);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    addCollider(x, z, w + 0.4, d + 0.4);
    return mesh;
  }

  const { avenueX, streetZ, blockGap } = WORLD;
  for (let i = 0; i < avenueX.length - 1; i++) {
    for (let j = 0; j < streetZ.length - 1; j++) {
      const x0 = avenueX[i] + blockGap;
      const x1 = avenueX[i + 1] - blockGap;
      const z0 = streetZ[j] + blockGap;
      const z1 = streetZ[j + 1] - blockGap;
      if (rng.chance(0.14)) continue; // a plaza or car park stays empty
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const distCore = Math.hypot(cx, cz - 110) / 190;
      const w = Math.min(x1 - x0 - 2, rng.range(11, 17));
      const d = Math.min(z1 - z0 - 2, rng.range(11, 17));
      const h = Math.round(rng.range(13, 46) * (1.25 - distCore * 0.55));
      const fac = rng.pick(facadeMats);
      building(cx + rng.range(-2, 2), cz + rng.range(-2, 2), w, d, h, fac);
      if (rng.chance(0.4)) {
        building(cx + rng.range(-6, 6), cz + rng.range(-6, 6), w * 0.55, d * 0.55, Math.round(h * 0.45), fac);
      }
    }
  }

  // ---------- harbour ----------
  const quay = new THREE.Mesh(new THREE.PlaneGeometry(320, 48), new THREE.MeshLambertMaterial({ color: 0x8f9296 }));
  quay.rotation.x = -Math.PI / 2;
  quay.position.set(0, 0.0, -48);
  quay.receiveShadow = true;
  group.add(quay);

  const waterTex = makeCanvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1d6f8e';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      const y = rng.range(0, h);
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y);
      ctx.stroke();
    }
  });
  waterTex.wrapS = THREE.RepeatWrapping;
  waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(24, 24);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 560),
    new THREE.MeshLambertMaterial({ map: waterTex, transparent: true, opacity: 0.94 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -1.1, -352);
  group.add(water);

  const containerMats = [0xc94f36, 0x2e6fd8, 0x39b56a, 0xd9a441, 0x7f8c9b].map(
    (c) => new THREE.MeshLambertMaterial({ color: c }),
  );
  const containersByMat = containerMats.map(() => []);
  const crateItems = [];
  for (const px of [-95, -35, 45, 105]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(16, 1.6, 52), new THREE.MeshLambertMaterial({ color: 0x7d8187 }));
    pier.position.set(px, -0.4, -96);
    pier.receiveShadow = true;
    group.add(pier);
    addCollider(px, -80, 16, 4);
    for (let k = 0; k < 4; k++) {
      const mi = rng.int(0, containerMats.length - 1);
      containersByMat[mi].push({ x: px + rng.range(-3.4, 3.4), y: 1.3, z: -84 - k * 9 + rng.range(-2, 2), ry: rng.range(-0.06, 0.06) });
    }
  }
  containersByMat.forEach((items, mi) => {
    if (items.length) instanced(boxGeo(6, 2.6, 2.6), containerMats[mi], items);
  });
  for (let k = 0; k < 10; k++) {
    const cx = rng.range(-140, 140);
    const cz = rng.range(-64, -34);
    crateItems.push({ x: cx, y: 1.2, z: cz, ry: rng.range(0, 3) });
    addCollider(cx, cz, 2.8, 2.8);
  }
  instanced(boxGeo(2.4, 2.4, 2.4), new THREE.MeshLambertMaterial({ color: 0xa9805a }), crateItems);

  // Cranes.
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xe07b2a });
  const cranes = [];
  for (const cx of [-62, 66]) {
    const crane = new THREE.Group();
    for (const [lx, lz] of [[-5, -4], [5, -4], [-5, 4], [5, 4]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 26, 1.2), craneMat);
      leg.position.set(lx, 13, lz);
      crane.add(leg);
    }
    const jib = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 44), craneMat);
    jib.position.set(0, 27, -8);
    crane.add(jib);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3, 3.4), craneMat);
    cab.position.set(0, 24.5, 2);
    crane.add(cab);
    crane.position.set(cx, 0, -52);
    crane.traverse((o) => { o.castShadow = true; });
    group.add(crane);
    cranes.push(crane);
    addCollider(cx, -52, 12, 10);
  }

  // Boats bobbing at the piers.
  const boats = [];
  const hullMats = [0xe8e6df, 0xc94f36, 0x2e6fd8].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  for (let i = 0; i < 6; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.6, 11), rng.pick(hullMats));
    hull.position.y = 0.4;
    boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3.6), new THREE.MeshLambertMaterial({ color: 0xf2efe6 }));
    cabin.position.set(0, 1.9, -0.8);
    boat.add(cabin);
    boat.position.set(rng.pick([-95, -35, 45, 105]) + rng.range(-13, 13), -1.0, rng.range(-128, -104));
    boat.rotation.y = rng.range(-0.2, 0.2);
    group.add(boat);
    boats.push({ mesh: boat, phase: rng.range(0, 6) });
  }

  // ---------- airstrip ----------
  const stripMesh = new THREE.Mesh(new THREE.PlaneGeometry(28, 220), new THREE.MeshLambertMaterial({ color: 0x555a60 }));
  stripMesh.rotation.x = -Math.PI / 2;
  stripMesh.position.set(182, 0.005, 116);
  stripMesh.receiveShadow = true;
  group.add(stripMesh);
  for (let i = 0; i < 9; i++) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 9), new THREE.MeshBasicMaterial({ color: 0xf5f2e8 }));
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(182, 0.03, 18 + i * 24);
    group.add(dash);
  }
  const hangar = new THREE.Group();
  const hangarBody = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 20), new THREE.MeshLambertMaterial({ color: 0xb9c0c7 }));
  hangarBody.position.y = 4.5;
  hangarBody.castShadow = true;
  hangar.add(hangarBody);
  const hangarRoof = new THREE.Mesh(new THREE.CylinderGeometry(13.4, 13.4, 20, 14, 1, false, 0, Math.PI), new THREE.MeshLambertMaterial({ color: 0x707880 }));
  hangarRoof.rotation.z = Math.PI / 2;
  hangarRoof.rotation.y = Math.PI / 2;
  hangarRoof.position.y = 9;
  hangar.add(hangarRoof);
  hangar.position.set(224, 0, 168);
  group.add(hangar);
  addCollider(224, 168, 27, 21);

  // ---------- Bukit Cemara hill ----------
  const hillGeo = new THREE.PlaneGeometry(300, 214, 60, 44);
  hillGeo.rotateX(-Math.PI / 2);
  const pos = hillGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(PALETTE.grass);
  const rock = new THREE.Color(PALETTE.hillRock);
  const dry = new THREE.Color(0xa8a05e);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) + 335;
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const t = Math.min(1, h / WORLD.hill.plateauHeight);
    const c = rock.clone().lerp(grass, 0.35 + 0.65 * t).lerp(dry, rng.chance(0.3) ? 0.25 : 0);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  hillGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  hillGeo.computeVertexNormals();
  const hill = new THREE.Mesh(hillGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  hill.position.set(0, 0, 335);
  hill.receiveShadow = true;
  group.add(hill);

  // Hill roads as ribbons that follow the terrain.
  function roadRibbon(points, width) {
    const verts = [];
    const idx = [];
    points.forEach(([x, z], i) => {
      const p = new THREE.Vector2(x, z);
      const q = points[Math.min(points.length - 1, i + 1)] ? new THREE.Vector2(...points[Math.min(points.length - 1, i + 1)]) : p;
      const qPrev = new THREE.Vector2(...points[Math.max(0, i - 1)]);
      const dir = q.clone().sub(qPrev).normalize();
      const side = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(width / 2);
      for (const s of [-1, 1]) {
        const vx = p.x + side.x * s;
        const vz = p.y + side.y * s;
        verts.push(vx, groundHeight(vx, vz) + 0.07, vz);
      }
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, asphaltMat);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  const rampPts = [];
  for (let z = 220; z <= 356; z += 12) rampPts.push([0, z]);
  roadRibbon(rampPts, 17);
  roadRibbon([[-104, 352], [104, 352]], 15);
  roadRibbon([[0, 352], [0, 424]], 13);

  // Hill houses (villas) with lit windows.
  const villaRoof = new THREE.MeshLambertMaterial({ color: 0x8a4a34 });
  const villaWall = new THREE.MeshLambertMaterial({ color: 0xf0e6d2 });
  for (let i = 0; i < 12; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const hx = side * rng.range(24, 108);
    const hz = rng.range(330, 408);
    if (Math.abs(hx) < 20 && hz < 360) continue;
    const hy = groundHeight(hx, hz);
    const villa = new THREE.Group();
    const body = new THREE.Mesh(boxGeo(9, 4.6, 8), villaWall);
    body.position.y = 2.3;
    body.castShadow = true;
    villa.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7.4, 3, 4), villaRoof);
    roof.position.y = 6.1;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    villa.add(roof);
    villa.position.set(hx, hy - 0.2, hz);
    villa.rotation.y = rng.range(0, Math.PI);
    group.add(villa);
    addCollider(hx, hz, 10, 9);
  }

  // Viewpoint at the top of the spur road.
  const viewPad = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.5, 20), walkMat);
  viewPad.position.set(0, groundHeight(0, 428) + 0.1, 428);
  viewPad.receiveShadow = true;
  group.add(viewPad);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 3.8),
    new THREE.MeshBasicMaterial({ map: signTexture(['BUKIT', 'CEMARA'], '#173a5e', '#ffd98a'), side: THREE.DoubleSide }),
  );
  sign.position.set(-8, groundHeight(-8, 424) + 2.6, 424);
  sign.rotation.y = 0.5; // faces the viewpoint pad, readable from the north
  group.add(sign);

  // Harbour and city billboards.
  function billboard(x, z, ry, lines, bg, fg, w = 15) {
    const b = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.7, 9, 0.7), new THREE.MeshLambertMaterial({ color: 0x555c63 }));
    pole.position.y = 4.5;
    b.add(pole);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), new THREE.MeshBasicMaterial({ map: signTexture(lines, bg, fg), side: THREE.DoubleSide }));
    face.position.y = 10.5;
    b.add(face);
    b.position.set(x, groundHeight(x, z), z);
    b.rotation.y = ry;
    group.add(b);
    addCollider(x, z, 1.4, 1.4);
  }
  billboard(-132, -18, 0.5, ['SOLMAR'], '#0d2b45', '#ffd98a', 17);
  billboard(136, 30, -0.6, ['PELABUHAN', 'SOLMAR'], '#7a2d16', '#ffe9c4');
  billboard(150, 200, -0.9, ['BANDAR', 'SOLMAR'], '#173a5e', '#ffffff');

  // ---------- street lights and trees (all instanced) ----------
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3f464d });
  const lampPoles = [];
  const lampHeads = [];
  function lamp(x, z) {
    const y = groundHeight(x, z);
    lampPoles.push({ x, y: y + 3.2, z });
    lampHeads.push({ x, y: y + 6.4, z });
  }
  for (const x of WORLD.avenueX) for (let z = -8; z <= 224; z += 44) lamp(x + WORLD.roadHalf + 1.4, z);
  for (const z of WORLD.streetZ) for (let x = -132; x <= 132; x += 44) lamp(x, z - WORLD.roadHalf - 1.4);
  instanced(new THREE.CylinderGeometry(0.12, 0.16, 6.4, 6), poleMat, lampPoles);
  instanced(new THREE.BoxGeometry(0.5, 0.22, 1.4), lampHeadMat, lampHeads);

  const palmTrunks = [];
  const palmFronds = [];
  function palm(x, z) {
    const y = groundHeight(x, z);
    const tilt = rng.range(-0.09, 0.09);
    palmTrunks.push({ x, y: y + 2.8, z, rz: tilt });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      palmFronds.push({
        x: x + Math.cos(a) * 1.2,
        y: y + 5.7,
        z: z + Math.sin(a) * 1.2,
        rx: 0.5,
        ry: -a,
      });
    }
  }
  for (let x = -144; x <= 144; x += 18) if (rng.chance(0.75)) palm(x + rng.range(-3, 3), -19 + rng.range(-1.5, 1.5));
  for (let i = 0; i < 14; i++) palm(rng.range(-140, 140), rng.range(14, 218));
  instanced(new THREE.CylinderGeometry(0.16, 0.26, 5.6, 6), new THREE.MeshLambertMaterial({ color: 0x7a5a3a }), palmTrunks);
  instanced(
    new THREE.PlaneGeometry(3.4, 0.8),
    new THREE.MeshLambertMaterial({ color: 0x3f8f4f, side: THREE.DoubleSide }),
    palmFronds,
  );

  const pineTrunks = [];
  const pineCones1 = [];
  const pineCones2 = [];
  function pine(x, z) {
    const y = groundHeight(x, z) - 0.1;
    const s = rng.range(0.85, 1.5);
    pineTrunks.push({ x, y: y + 1.2 * s, z, s });
    pineCones1.push({ x, y: y + 4.4 * s, z, s });
    pineCones2.push({ x, y: y + 6.8 * s, z, s });
  }
  for (let i = 0; i < 70; i++) {
    const x = rng.range(-138, 138);
    const z = rng.range(238, 428);
    if (Math.abs(x) < 15 && z < 430) continue;
    if (Math.abs(z - 352) < 11 && Math.abs(x) < 110) continue;
    pine(x, z);
  }
  const pineMat = new THREE.MeshLambertMaterial({ color: 0x2e6b34 });
  instanced(new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6), new THREE.MeshLambertMaterial({ color: 0x5e4630 }), pineTrunks);
  instanced(new THREE.ConeGeometry(2.3, 4.6, 8), pineMat, pineCones1);
  instanced(new THREE.ConeGeometry(1.6, 3.4, 8), pineMat, pineCones2);

  // ---------- road network for traffic and pedestrians ----------
  const circuits = [
    { mode: 'loop', pts: [[-120, 8], [120, 8], [120, 224], [-120, 224]] },
    { mode: 'loop', pts: [[-80, 52], [40, 52], [40, 140], [-80, 140]] },
    { mode: 'loop', pts: [[40, 96], [120, 96], [120, 184], [40, 184]] },
    { mode: 'loop', pts: [[-140, -12], [140, -12], [140, 8], [-140, 8]] },
    { mode: 'loop', pts: [[-40, 8], [80, 8], [80, 96], [-40, 96]] },
    { mode: 'pingpong', pts: [[0, 230], [0, 352], [84, 352]] },
    { mode: 'pingpong', pts: [[-84, 352], [0, 352], [0, 300]] },
  ];

  const pedPaths = [];
  for (const x of WORLD.avenueX) {
    for (const s of [-1, 1]) pedPaths.push([[x + s * (WORLD.roadHalf + 1.7), -14], [x + s * (WORLD.roadHalf + 1.7), 222]]);
  }
  for (const z of WORLD.streetZ) {
    for (const s of [-1, 1]) pedPaths.push([[-142, z + s * (WORLD.roadHalf + 1.7)], [142, z + s * (WORLD.roadHalf + 1.7)]]);
  }
  pedPaths.push([[-142, -12 + WORLD.roadHalf + 1.7], [142, -12 + WORLD.roadHalf + 1.7]]);

  const parkingSpots = [];
  for (const z of WORLD.streetZ) {
    for (let x = -132; x <= 132; x += 16) {
      if (WORLD.avenueX.some((ax) => Math.abs(ax - x) < 10)) continue;
      parkingSpots.push({ x: x + rng.range(-2, 2), z: z - WORLD.roadHalf - 2.4, angle: Math.PI / 2 });
      parkingSpots.push({ x: x + rng.range(-2, 2), z: z + WORLD.roadHalf + 2.4, angle: -Math.PI / 2 });
    }
  }

  return {
    group,
    colliders,
    circuits,
    pedPaths,
    parkingSpots,
    groundHeight,
    update(dt, elapsed) {
      waterTex.offset.x = (elapsed * 0.008) % 1;
      waterTex.offset.y = (elapsed * 0.005) % 1;
      for (const b of boats) {
        b.mesh.position.y = -1.0 + Math.sin(elapsed * 0.9 + b.phase) * 0.16;
        b.mesh.rotation.z = Math.sin(elapsed * 0.7 + b.phase) * 0.03;
      }
      cranes[0].rotation.y = Math.sin(elapsed * 0.05) * 0.4;
      cranes[1].rotation.y = Math.cos(elapsed * 0.04) * 0.4;
    },
    setGlow(v) {
      for (const m of glowMaterials) m.emissiveIntensity = v * 0.85;
      lampHeadMat.color.setHex(v > 0.35 ? 0xffd98a : 0xcfd6da);
    },
  };
}

// Is a point on any road surface (downtown grid, harbour front, strip)?
export function isOnRoad(x, z) {
  if (Math.abs(x) < WORLD.hill.roadHalf + 1 && z >= 220 && z <= 430) return true;
  if (Math.abs(z - 352) < 9 && Math.abs(x) <= 108 && z > 300) return true;
  if (z >= -24 && z <= 232 && Math.abs(x) <= 152) {
    if (WORLD.avenueX.some((ax) => Math.abs(ax - x) < WORLD.roadHalf + 0.6)) return true;
    if (WORLD.streetZ.some((sz) => Math.abs(sz - z) < WORLD.roadHalf + 0.6)) return true;
    if (Math.abs(z + 12) < WORLD.roadHalf + 0.6) return true;
    return false;
  }
  if (x >= WORLD.strip.minX - 4 && x <= WORLD.strip.maxX + 4 && z >= 0 && z <= 232) return true;
  return false;
}
