// player.js — one job: Mara Voss on foot.
// WASD movement relative to the camera, run with Shift, Space to jump,
// a simple walk-cycle mesh, health, and the enter/exit-car handshake.

import * as THREE from 'three';
import { GAME, WORLD } from './config.js';
import { resolveBuildingCollision } from './world.js';

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0xc0392b });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2f3542 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.72, 0.32), jacket);
    torso.position.y = 1.05;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
    head.position.y = 1.62;
    head.castShadow = true;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), dark);
    hair.position.y = 1.66;
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), dark);
    this.legL.position.set(-0.14, 0.36, 0);
    this.legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), dark);
    this.legR.position.set(0.14, 0.36, 0);
    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.18), jacket);
    this.armL.position.set(-0.37, 1.05, 0);
    this.armR = this.armL.clone();
    this.armR.position.x = 0.37;
    this.group.add(torso, head, hair, this.legL, this.legR, this.armL, this.armR);
    scene.add(this.group);

    this.x = 88; this.z = 128; this.y = 0;
    this.heading = 0; // facing, radians; forward = (sin, cos)
    this.speed = 0;
    this.hp = GAME.playerHp;
    this.inCar = null; // Vehicle or null
    this.walkPhase = 0;
    this.vy = 0;
    this.onGround = true;
  }

  reset(x, z) {
    this.x = x; this.z = z; this.y = 0;
    this.heading = Math.PI;
    this.hp = GAME.playerHp;
    this.inCar = null;
    this.group.visible = true;
  }

  update(dt, input, yaw, world) {
    if (this.inCar) return;
    const axes = input.moveAxes();
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const top = run ? GAME.playerRun : GAME.playerWalk;
    // movement relative to camera yaw: forward is where the camera looks,
    // right is the camera's screen-right = cross(forward, up)
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);
    let mx = fx * axes.y + rx * axes.x;
    let mz = fz * axes.y + rz * axes.x;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len; mz /= len;
      this.speed = top;
      const targetHeading = Math.atan2(mx, mz);
      let dh = targetHeading - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += dh * Math.min(1, dt * 12);
      this.x += mx * top * dt;
      this.z += mz * top * dt;
      this.walkPhase += dt * top * 1.6;
    } else {
      this.speed = 0;
    }
    // jump
    if (input.down('Space') && this.onGround) {
      this.vy = 6.5;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.onGround = true; }
    }
    // buildings + world bounds
    const fixed = resolveBuildingCollision(world.colliders, this.x, this.z, 0.6);
    this.x = fixed.x; this.z = fixed.z;
    this.x = Math.max(10, Math.min(WORLD.LIMIT, this.x));
    // pier is walkable; ocean blocks at z > 700 unless on the pier
    const onPier = this.x > world.pier.minX && this.x < world.pier.maxX;
    this.z = Math.max(10, Math.min(onPier ? world.pier.maxZ : 700, this.z));
    // mesh
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
    const swing = this.speed > 0.1 ? Math.sin(this.walkPhase) * 0.55 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.7;
    this.armR.rotation.x = swing * 0.7;
  }

  damage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    return this.hp <= 0;
  }

  heal(amount) {
    this.hp = Math.min(GAME.playerHp, this.hp + amount);
  }
}
