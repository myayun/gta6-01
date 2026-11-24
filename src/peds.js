// peds.js — one job: the pedestrians of Solmar Bay.
// They stroll the sidewalks, flee from gunshots and crashes, and fall down
// when a car hits them (which the law notices).

import * as THREE from 'three';
import { GAME, WORLD } from './config.js';
import { mulberry32, pick, range, intRange } from './random.js';
import { resolveBuildingCollision } from './world.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0x34495e];

export class Peds {
  constructor(scene, world, seed) {
    this.scene = scene;
    this.world = world;
    this.rng = mulberry32(seed + 55);
    this.list = [];
    for (let i = 0; i < GAME.pedCount; i++) {
      this.list.push(this._spawn());
    }
  }

  _spawn() {
    const rng = this.rng;
    const coords = this.world.streetCoords;
    const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, SHIRTS) });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2f3542 });
    const group = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.3), shirt);
    torso.position.y = 1.0;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin);
    head.position.y = 1.55;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.2), dark);
    legL.position.set(-0.13, 0.33, 0);
    const legR = legL.clone();
    legR.position.x = 0.13;
    group.add(torso, head, legL, legR);
    this.scene.add(group);
    const ped = {
      mesh: group, legL, legR,
      x: range(rng, 40, WORLD.SIZE - 40),
      z: range(rng, 40, WORLD.SIZE - 40),
      heading: range(rng, 0, Math.PI * 2),
      speed: range(rng, 1.2, 2.2),
      state: 'walk', // walk | flee | down
      target: null,
      timer: 0,
      phase: range(rng, 0, 6),
      downTimer: 0,
    };
    ped.target = this._newTarget(ped);
    group.position.set(ped.x, 0, ped.z);
    return ped;
  }

  _newTarget(ped) {
    const coords = this.world.streetCoords;
    const axis = this.rng() < 0.5 ? 0 : 1;
    const line = coords[intRange(this.rng, 1, coords.length - 2)];
    const along = range(this.rng, 30, WORLD.SIZE - 30);
    const side = this.rng() < 0.5 ? 11 : -11;
    if (axis === 0) return { x: along, z: line + side };
    return { x: line + side, z: along };
  }

  // Scare every ped near (x, z): they run away from it.
  scare(x, z, radius) {
    for (const ped of this.list) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius) {
        ped.state = 'flee';
        ped.timer = 3;
        ped.fleeFrom = { x, z };
      }
    }
  }

  // A car hit this ped. Returns true if it was standing.
  knockDown(ped) {
    if (ped.state === 'down') return false;
    ped.state = 'down';
    ped.downTimer = 4;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.35;
    return true;
  }

  nearest(x, z, maxDist) {
    let best = null; let bestD = maxDist;
    for (const ped of this.list) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }

  update(dt) {
    for (const ped of this.list) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.state = 'flee';
          ped.timer = 3;
          ped.fleeFrom = { x: ped.x, z: ped.z };
          ped.mesh.rotation.x = 0;
          ped.mesh.position.y = 0;
        }
        continue;
      }
      let tx; let tz; let speed;
      if (ped.state === 'flee') {
        ped.timer -= dt;
        const dx = ped.x - ped.fleeFrom.x;
        const dz = ped.z - ped.fleeFrom.z;
        const d = Math.hypot(dx, dz) || 1;
        tx = ped.x + (dx / d) * 10;
        tz = ped.z + (dz / d) * 10;
        speed = 7;
        if (ped.timer <= 0) { ped.state = 'walk'; ped.target = this._newTarget(ped); }
      } else {
        tx = ped.target.x; tz = ped.target.z;
        speed = ped.speed;
        if (Math.hypot(tx - ped.x, tz - ped.z) < 3) ped.target = this._newTarget(ped);
      }
      const dx = tx - ped.x;
      const dz = tz - ped.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.05) {
        ped.heading = Math.atan2(dx, dz);
        ped.x += Math.sin(ped.heading) * speed * dt;
        ped.z += Math.cos(ped.heading) * speed * dt;
        ped.phase += dt * speed * 3;
      }
      const fixed = resolveBuildingCollision(this.world.colliders, ped.x, ped.z, 0.5);
      ped.x = Math.max(10, Math.min(WORLD.LIMIT, fixed.x));
      ped.z = Math.max(10, Math.min(700, fixed.z));
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      const swing = Math.sin(ped.phase) * 0.5;
      ped.legL.rotation.x = swing;
      ped.legR.rotation.x = -swing;
    }
  }
}
