// The city of Solmar: a road grid, procedural buildings with hand-drawn
// window textures, the tall Solmar Tower landmark, a beach and the sea to
// the east, palm trees and street lamps. Nothing here is loaded from a file:
// every texture is painted on a canvas at boot.
import * as THREE from 'three';
import { CITY, MISSIONS, PALETTE } from './config.js';
import { pickRandom } from './random.js';

export const ROAD_COORDS = [-80, -40, 0, 40, 80];
const BLOCK_CENTERS = [-60, -20, 20, 60];

/** Snap a coordinate to the nearest road line. */
export function nearestRoadCoord(value) {
  let best = ROAD_COORDS[0];
  for (const road of ROAD_COORDS) {
    if (Math.abs(value - road) < Math.abs(value - best)) best = road;
  }
  return best;
}

/** Is the point (x, z) on a road (within the asphalt)? */
export function isOnRoad(x, z) {
  for (const road of ROAD_COORDS) {
    if (Math.abs(x - road) <= CITY.roadWidth / 2 + 1.5) return true;
    if (Math.abs(z - road) <= CITY.roadWidth / 2 + 1.5) return true;
  }
  return false;
}

function canvasTexture(width, height, painter) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  painter(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A building facade: flat wall colour with a grid of windows, some lit warm. */
function facadeTexture(base, random) {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const cols = 6;
    const rows = 12;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const lit = random() < 0.35;
        ctx.fillStyle = lit ? '#ffd98a' : '#2c3444';
        ctx.fillRect(8 + col * 20, 10 + row * 20, 12, 14);
      }
    }
  });
}

/** Asphalt with a dashed centre line, repeated along the road. */
function roadTexture() {
  const texture = canvasTexture(64, 256, (ctx, w, h) => {
    ctx.fillStyle = PALETTE.road;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d8d8c8';
    ctx.fillRect(w / 2 - 2, 20, 4, 60);
    ctx.fillRect(w / 2 - 2, 148, 4, 60);
    ctx.fillStyle = '#8a8a7a';
    ctx.fillRect(0, 0, 3, h);
    ctx.fillRect(w - 3, 0, 3, h);
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function makePalm(random) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#7a5a38' });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 5, 6), trunkMat);
  trunk.position.y = 2.5;
  trunk.rotation.z = (random() - 0.5) * 0.2;
  group.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: '#3f8f4f' });
  const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.2, 7), leafMat);
  leaves.position.y = 5.6;
  leaves.scale.y = 0.55;
  group.add(leaves);
  const coconuts = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 6, 5),
    new THREE.MeshLambertMaterial({ color: '#6b4a26' }),
  );
  coconuts.position.y = 4.7;
  group.add(coconuts);
  return group;
}

function makeStreetLamp() {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshLambertMaterial({ color: '#3c3f45' });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6), poleMat);
  pole.position.y = 3;
  group.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), poleMat);
  arm.position.set(0.8, 5.9, 0);
  group.add(arm);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 6),
    new THREE.MeshLambertMaterial({ color: '#ffe9a8', emissive: '#ffca55', emissiveIntensity: 0.9 }),
  );
  lamp.position.set(1.6, 5.85, 0);
  group.add(lamp);
  return group;
}

/**
 * Build the whole city into `scene` and return its colliders (building
 * footprints as {minX,maxX,minZ,maxZ,height}), the road list and the
 * landmark positions missions need.
 */
export function buildCity(scene, rng) {
  const colliders = [];
  const facadeCache = new Map();

  function facadeFor(base) {
    if (!facadeCache.has(base)) facadeCache.set(base, facadeTexture(base, rng));
    return facadeCache.get(base);
  }

  // Ground: dry sunset grass/concrete far beyond the last road.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(360, 360),
    new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(20, 0, 0);
  scene.add(ground);

  // Beach sand and the sea, east of the city.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 260),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(109, 0.05, 0);
  scene.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 260),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(200, 0.08, 0);
  scene.add(sea);

  // Roads: dark strips with a dashed centre line, plus pale sidewalks.
  const roadTex = roadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  for (const road of ROAD_COORDS) {
    for (const vertical of [true, false]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, 230), roadMat);
      strip.rotation.x = -Math.PI / 2;
      if (!vertical) strip.rotation.z = Math.PI / 2;
      strip.position.set(vertical ? road : 0, 0.1, vertical ? 0 : road);
      scene.add(strip);
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(3, 230), sidewalkMat);
        walk.rotation.x = -Math.PI / 2;
        if (!vertical) walk.rotation.z = Math.PI / 2;
        walk.position.set(
          vertical ? road + side * (CITY.roadWidth / 2 + 1.5) : 0,
          0.12,
          vertical ? 0 : road + side * (CITY.roadWidth / 2 + 1.5),
        );
        scene.add(walk);
      }
    }
  }

  // Buildings, one to three per block, with lit-window facades.
  const bases = [PALETTE.buildingA, PALETTE.buildingB, PALETTE.buildingC];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      if (bx === 20 && bz === 20) continue; // the tower's block
      const count = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < count; i += 1) {
        const w = 9 + rng() * 9;
        const d = 9 + rng() * 9;
        const h = 8 + rng() * 26;
        const x = bx + (rng() - 0.5) * (30 - w - 2);
        const z = bz + (rng() - 0.5) * (30 - d - 2);
        const mat = new THREE.MeshLambertMaterial({ map: facadeFor(pickRandom(rng, bases)) });
        const building = new THREE.Mesh(boxGeo, mat);
        building.scale.set(w, h, d);
        building.position.set(x, h / 2, z);
        scene.add(building);
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
          new THREE.MeshLambertMaterial({ color: '#4a4a52' }),
        );
        roof.position.set(x, h + 0.25, z);
        scene.add(roof);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h });
      }
    }
  }

  // Menara Solmar: the tall landmark tower in the city's centre block.
  const towerMat = new THREE.MeshLambertMaterial({ map: facadeFor(PALETTE.tower) });
  const tower = new THREE.Mesh(boxGeo, towerMat);
  tower.scale.set(22, CITY.towerHeight, 22);
  tower.position.set(20, CITY.towerHeight / 2, 20);
  scene.add(tower);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 10, 8),
    new THREE.MeshLambertMaterial({ color: '#ff5a4e', emissive: '#ff2a1a', emissiveIntensity: 1.4 }),
  );
  beacon.position.set(20, CITY.towerHeight + 1.5, 20);
  scene.add(beacon);
  colliders.push({ minX: 9, maxX: 31, minZ: 9, maxZ: 31, height: CITY.towerHeight });

  // A small hideout hut at the south-west corner, and a garage block.
  const hutMat = new THREE.MeshLambertMaterial({ color: '#c98a4a' });
  const hut = new THREE.Mesh(boxGeo, hutMat);
  hut.scale.set(10, 5, 8);
  hut.position.set(-72, 2.5, -72);
  scene.add(hut);
  colliders.push({ minX: -77, maxX: -67, minZ: -76, maxZ: -68, height: 5 });
  const garage = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: '#5a6a7a' }));
  garage.scale.set(16, 7, 12);
  garage.position.set(-52, 3.5, 60);
  scene.add(garage);
  colliders.push({ minX: -60, maxX: -44, minZ: 54, maxZ: 66, height: 7 });

  // Palm trees along the beach and a few on the sidewalks.
  const palms = [];
  for (let z = -110; z <= 110; z += 16) {
    const palm = makePalm(rng);
    palm.position.set(104 + rng() * 6, 0, z + rng() * 6);
    scene.add(palm);
    palms.push(palm);
  }
  for (let i = 0; i < 10; i += 1) {
    const road = pickRandom(rng, ROAD_COORDS);
    const along = -100 + rng() * 200;
    const palm = makePalm(rng);
    palm.position.set(road + 7, 0, along);
    scene.add(palm);
    palms.push(palm);
    colliders.push({ minX: road + 6.4, maxX: road + 7.6, minZ: along - 0.6, maxZ: along + 0.6, height: 6 });
  }

  // Street lamps along every road, every 40 units.
  for (const road of ROAD_COORDS) {
    for (let along = -80; along <= 80; along += 40) {
      const lamp = makeStreetLamp();
      lamp.position.set(road + 6.5, 0, along);
      scene.add(lamp);
      const lamp2 = makeStreetLamp();
      lamp2.position.set(along, 0, road - 6.5);
      lamp2.rotation.y = Math.PI / 2;
      scene.add(lamp2);
    }
  }

  // Docks crates near the pickup point and a marina pier near the dropoff.
  const crateMat = new THREE.MeshLambertMaterial({ color: '#8a6a3a' });
  for (let i = 0; i < 5; i += 1) {
    const crate = new THREE.Mesh(boxGeo, crateMat);
    const s = 2 + rng() * 1.5;
    crate.scale.set(s, s, s);
    crate.position.set(100 + rng() * 8, s / 2, 62 + rng() * 12);
    scene.add(crate);
    colliders.push({ minX: crate.position.x - s / 2, maxX: crate.position.x + s / 2, minZ: crate.position.z - s / 2, maxZ: crate.position.z + s / 2, height: s });
  }
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.6, 18),
    new THREE.MeshLambertMaterial({ color: '#7a5a38' }),
  );
  pier.position.set(114, 0.4, -68);
  scene.add(pier);

  return {
    colliders,
    roads: ROAD_COORDS,
    tower: { x: 20, z: 20, height: CITY.towerHeight },
    docks: MISSIONS[0].pickup,
    marina: MISSIONS[0].dropoff,
    hideout: MISSIONS[1].hideout,
    garage: MISSIONS[2].garage,
  };
}

/**
 * Push a circle (x, z, radius) out of every building it overlaps; returns
 * true when anything was hit, and writes the corrected position back.
 */
export function resolveBuildingCollision(pos, radius, colliders) {
  let hit = false;
  for (const box of colliders) {
    const closestX = Math.max(box.minX, Math.min(pos.x, box.maxX));
    const closestZ = Math.max(box.minZ, Math.min(pos.z, box.maxZ));
    const dx = pos.x - closestX;
    const dz = pos.z - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;
    hit = true;
    if (distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      pos.x = closestX + (dx / dist) * radius;
      pos.z = closestZ + (dz / dist) * radius;
    } else {
      // Centre inside the box: push out along the smallest penetration.
      const pushLeft = pos.x - box.minX + radius;
      const pushRight = box.maxX - pos.x + radius;
      const pushBack = pos.z - box.minZ + radius;
      const pushFront = box.maxZ - pos.z + radius;
      const min = Math.min(pushLeft, pushRight, pushBack, pushFront);
      if (min === pushLeft) pos.x = box.minX - radius;
      else if (min === pushRight) pos.x = box.maxX + radius;
      else if (min === pushBack) pos.z = box.minZ - radius;
      else pos.z = box.maxZ + radius;
    }
  }
  return hit;
}

/** Keep a point inside the playable city (and out of the sea). */
export function clampToCity(pos) {
  pos.x = Math.max(-CITY.halfSize, Math.min(CITY.beachX + 8, pos.x));
  pos.z = Math.max(-CITY.halfSize, Math.min(CITY.halfSize, pos.z));
}
