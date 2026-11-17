// Combat: a close-range punch (F) and a pistol (mouse click) with a
// hitscan shot and a fading tracer. Rival gang members have health, close
// in when the player is near, and punch back.
import * as THREE from 'three';
import { COMBAT } from './config.js';
import { addWanted } from './police.js';
import { scarePedestrians } from './traffic.js';

function buildGangMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.34, 0.95, 3, 8),
    new THREE.MeshLambertMaterial({ color: '#7b241c' }),
  );
  body.position.y = 1.05;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 8, 6),
    new THREE.MeshLambertMaterial({ color: '#d8a077' }),
  );
  head.position.y = 1.9;
  group.add(head);
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.1, 0.5),
    new THREE.MeshLambertMaterial({ color: '#f1c40f' }),
  );
  band.position.y = 2.05;
  group.add(band);
  // A small health bar floating over the head.
  const barBack = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.14),
    new THREE.MeshBasicMaterial({ color: '#222222', transparent: true, opacity: 0.8 }),
  );
  barBack.position.y = 2.45;
  const barFill = new THREE.Mesh(
    new THREE.PlaneGeometry(1.06, 0.1),
    new THREE.MeshBasicMaterial({ color: '#ff5040' }),
  );
  barFill.position.set(0, 2.45, 0.01);
  group.add(barBack);
  group.add(barFill);
  return { group, barFill };
}

/** Spawn the rival gang members who guard the target car. */
export function spawnGang(scene, spots) {
  const gang = [];
  for (const spot of spots) {
    const { group, barFill } = buildGangMesh();
    group.position.set(spot.x, 0, spot.z);
    scene.add(group);
    gang.push({
      mesh: group,
      barFill,
      pos: new THREE.Vector3(spot.x, 0, spot.z),
      heading: 0,
      health: COMBAT.gangHealth,
      alive: true,
      punchCooldown: 0,
      home: new THREE.Vector3(spot.x, 0, spot.z),
    });
  }
  return gang;
}

export function createCombat(game) {
  const tracers = [];
  let punchTimer = 0;
  let lastShotWantedAt = -99;

  function makeTracer(from, to) {
    const length = from.distanceTo(to);
    const geo = new THREE.BoxGeometry(0.06, 0.06, length);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.95 }));
    mesh.position.copy(from).lerp(to, 0.5);
    mesh.lookAt(to);
    game.scene.add(mesh);
    tracers.push({ mesh, life: 0.09 });
  }

  /** The player punches: anything hostile or civilian in front takes damage. */
  function punch() {
    if (punchTimer > 0 || !game.player.onFoot) return;
    punchTimer = COMBAT.punchCooldown;
    game.audio.punch();
    const px = game.player.pos.x;
    const pz = game.player.pos.z;
    const fx = -Math.sin(game.player.heading);
    const fz = -Math.cos(game.player.heading);
    let hitSomething = false;
    for (const enemy of game.gang) {
      if (!enemy.alive) continue;
      const dx = enemy.pos.x - px;
      const dz = enemy.pos.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist < COMBAT.punchRange && (dx * fx + dz * fz) / Math.max(dist, 0.01) > 0.3) {
        hurtEnemy(enemy, COMBAT.punchDamage);
        hitSomething = true;
      }
    }
    if (!hitSomething) {
      for (const ped of game.traffic.pedestrians) {
        const dx = ped.pos.x - px;
        const dz = ped.pos.z - pz;
        const dist = Math.hypot(dx, dz);
        if (dist < COMBAT.punchRange && (dx * fx + dz * fz) / Math.max(dist, 0.01) > 0.3) {
          scarePedestrians(game.traffic, game.player.pos, 18);
          addWanted(game, 1, 'Menyerang pejalan kaki');
          hitSomething = true;
          break;
        }
      }
    }
  }

  /** The player fires the pistol straight ahead from the camera line. */
  function shoot() {
    if (!game.player.onFoot) return;
    game.audio.gunshot();
    const from = game.player.pos.clone();
    from.y = 1.5;
    const dir = new THREE.Vector3(-Math.sin(game.player.heading), 0, -Math.cos(game.player.heading));
    const to = from.clone().addScaledVector(dir, COMBAT.pistolRange);
    let hitEnemy = null;
    let hitDist = COMBAT.pistolRange;
    for (const enemy of game.gang) {
      if (!enemy.alive) continue;
      const toEnemy = enemy.pos.clone().setY(1.2).sub(from);
      const along = toEnemy.dot(dir);
      if (along < 0 || along > COMBAT.pistolRange) continue;
      const side = toEnemy.clone().addScaledVector(dir, -along).length();
      if (side < 0.9 && along < hitDist) {
        hitDist = along;
        hitEnemy = enemy;
      }
    }
    if (hitEnemy) {
      to.copy(from).addScaledVector(dir, hitDist);
      hurtEnemy(hitEnemy, COMBAT.pistolDamage);
    }
    makeTracer(from, to);
    scarePedestrians(game.traffic, game.player.pos, 22);
    if (game.time - lastShotWantedAt > 2) {
      lastShotWantedAt = game.time;
      addWanted(game, 1, 'Tembakan terdengar');
    }
  }

  function hurtEnemy(enemy, damage) {
    enemy.health -= damage;
    enemy.barFill.scale.x = Math.max(0.01, enemy.health / COMBAT.gangHealth);
    if (enemy.health <= 0 && enemy.alive) {
      enemy.alive = false;
      enemy.mesh.rotation.x = -Math.PI / 2;
      enemy.mesh.position.y = 0.3;
      game.money += 20;
      game.hud.toast('Geng rival tumbang — +$20');
    }
  }

  /** One fixed step: gang AI, punch cooldown and tracer fade. */
  function update(dt) {
    if (punchTimer > 0) punchTimer -= dt;
    for (const enemy of game.gang) {
      if (!enemy.alive) continue;
      enemy.barFill.lookAt(game.camera.position);
      if (enemy.punchCooldown > 0) enemy.punchCooldown -= dt;
      const dist = enemy.pos.distanceTo(game.player.pos);
      if (dist < COMBAT.gangAggroRange && game.player.onFoot) {
        const dir = game.player.pos.clone().sub(enemy.pos).setY(0).normalize();
        if (dist > 1.8) {
          enemy.pos.addScaledVector(dir, 3.2 * dt);
          enemy.heading = Math.atan2(-dir.x, -dir.z);
        } else if (enemy.punchCooldown <= 0) {
          enemy.punchCooldown = COMBAT.gangPunchCooldown;
          game.damagePlayer(COMBAT.gangPunchDamage, 'Geng rival memukulmu!');
          game.audio.punch();
        }
        enemy.mesh.position.copy(enemy.pos);
        enemy.mesh.rotation.y = enemy.heading;
      }
    }
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) {
        game.scene.remove(tracers[i].mesh);
        tracers.splice(i, 1);
      }
    }
  }

  return { punch, shoot, update };
}
