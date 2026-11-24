// police.js — one job: the Solmar Bay PD response to the wanted level.
// Police cars spawn, chase and ram; on foot, a cop chases on foot and a
// two-second hold means BUSTED. No wanted stars, no police.

import * as THREE from 'three';
import { WORLD } from './config.js';
import { Vehicle } from './vehicles.js';
import { resolveBuildingCollision } from './world.js';

export class PoliceManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.cops = []; // {vehicle, ramCooldown}
    this.footCops = []; // {mesh, x, z, heading, hold, giveUp}
  }

  _makeFootCop(x, z) {
    const group = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a6b });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.72, 0.32), navy);
    torso.position.y = 1.05;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
    head.position.y = 1.62;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 12), navy);
    cap.position.y = 1.78;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), navy);
    legL.position.set(-0.14, 0.36, 0);
    const legR = legL.clone();
    legR.position.x = 0.14;
    group.add(torso, head, cap, legL, legR);
    group.position.set(x, 0, z);
    this.scene.add(group);
    return { mesh: group, x, z, heading: 0, hold: 0, giveUp: 0, phase: 0 };
  }

  _spawnCar(game) {
    const p = game.player;
    const focus = p.inCar ? p.inCar : p;
    // one cop plays interceptor: it cuts in front of the player instead of
    // only chasing from behind, so a pursuit reads on screen
    const hasInterceptor = this.cops.some((c) => c.interceptor);
    const interceptor = !hasInterceptor && game.wanted >= 3;
    let x, z, heading;
    if (interceptor) {
      // roadblock position: ahead of the player, facing them
      heading = focus.heading + Math.PI;
      x = focus.x + Math.sin(focus.heading) * 50;
      z = focus.z + Math.cos(focus.heading) * 50;
    } else {
      // behind the player, fanned out sideways so cops never stack
      const behind = focus.heading + Math.PI;
      const side = (this.cops.length % 3 - 1) * 6;
      x = focus.x + Math.sin(behind) * 70 - Math.cos(focus.heading) * side;
      z = focus.z + Math.cos(behind) * 70 + Math.sin(focus.heading) * side;
      heading = focus.heading;
    }
    x = Math.max(20, Math.min(WORLD.LIMIT - 20, x));
    z = Math.max(20, Math.min(690, z));
    const car = new Vehicle(this.scene, 'police', x, z, heading);
    car.isPolice = true;
    this.cops.push({ vehicle: car, ramCooldown: 0, stuckTimer: 0, interceptor });
    return car;
  }

  _removeCop(index) {
    const cop = this.cops[index];
    this.scene.remove(cop.vehicle.mesh);
    this.cops.splice(index, 1);
  }

  _removeFootCop(index) {
    this.scene.remove(this.footCops[index].mesh);
    this.footCops.splice(index, 1);
  }

  // Returns events: [{type:'ram'|'busted', ...}].
  update(dt, game) {
    const events = [];
    const wanted = game.wanted;
    const player = game.player;
    const focus = player.inCar ? player.inCar : player;

    // --- car cops: wanted stars decide how many
    const wantCars = Math.min(wanted, 3);
    while (this.cops.length < wantCars) this._spawnCar(game);
    while (this.cops.length > wantCars) this._removeCop(this.cops.length - 1);

    for (const cop of this.cops) {
      const car = cop.vehicle;
      cop.ramCooldown = Math.max(0, cop.ramCooldown - dt);
      // steer toward the player — or, for the interceptor, toward a point
      // 30 m ahead of the player and one lane over, so it pulls alongside
      let tx = focus.x;
      let tz = focus.z;
      if (cop.interceptor) {
        tx = focus.x + Math.sin(focus.heading) * 30 - Math.cos(focus.heading) * 11;
        tz = focus.z + Math.cos(focus.heading) * 30 + Math.sin(focus.heading) * 11;
      }
      const dx = tx - car.x;
      const dz = tz - car.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      let dh = want - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += Math.max(-2.6 * dt, Math.min(2.6 * dt, dh));
      const targetSpeed = player.inCar ? Math.min(50, Math.abs(player.inCar.speed) + 8) : 14;
      if (dist > 7) {
        car.speed = Math.min(targetSpeed, car.speed + 14 * dt);
      } else {
        car.speed = Math.max(0, car.speed - 20 * dt);
      }
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      const fixed = resolveBuildingCollision(this.world.colliders, car.x, car.z, 2.3);
      if (fixed.x !== car.x || fixed.z !== car.z) car.speed *= 0.5;
      car.x = Math.max(10, Math.min(WORLD.LIMIT, fixed.x));
      car.z = Math.max(10, Math.min(700, fixed.z));
      // ram the player's car
      if (player.inCar && dist < 4.8 && cop.ramCooldown <= 0) {
        cop.ramCooldown = 1.2;
        events.push({ type: 'ram', speed: Math.abs(car.speed) + Math.abs(player.inCar.speed) });
        player.inCar.speed *= 0.75;
        car.speed *= 0.6;
      }
      // stuck against a building: respawn so the chase never dies on a
      // wall — the interceptor respawns ahead of the player, the rest
      // behind
      if (Math.abs(car.speed) < 1.5) cop.stuckTimer += dt;
      else cop.stuckTimer = 0;
      if (cop.stuckTimer > 3) {
        cop.stuckTimer = 0;
        if (cop.interceptor) {
          car.x = Math.max(20, Math.min(WORLD.LIMIT - 20, focus.x + Math.sin(focus.heading) * 30 - Math.cos(focus.heading) * 11));
          car.z = Math.max(20, Math.min(690, focus.z + Math.cos(focus.heading) * 30 + Math.sin(focus.heading) * 11));
          car.heading = focus.heading;
          car.speed = Math.abs(focus.speed || 0) + 5;
        } else {
          const behind = focus.heading + Math.PI;
          car.x = Math.max(20, Math.min(WORLD.LIMIT - 20, focus.x + Math.sin(behind) * 50));
          car.z = Math.max(20, Math.min(690, focus.z + Math.cos(behind) * 50));
          car.heading = focus.heading;
          car.speed = 12;
        }
      }
      car.syncMesh();
    }

    // --- foot cops: only while the player is on foot and wanted
    if (!player.inCar && wanted >= 1 && this.footCops.length < Math.min(2, wanted)) {
      const cop = this._makeFootCop(focus.x + (Math.random() < 0.5 ? -25 : 25), focus.z + 20);
      this.footCops.push(cop);
    }
    if (wanted === 0) {
      while (this.footCops.length) this._removeFootCop(0);
    }
    for (let i = this.footCops.length - 1; i >= 0; i--) {
      const cop = this.footCops[i];
      const dx = player.x - cop.x;
      const dz = player.z - cop.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 30) {
        cop.giveUp += dt;
        if (cop.giveUp > 5) { this._removeFootCop(i); continue; }
      } else {
        cop.giveUp = 0;
      }
      cop.heading = Math.atan2(dx, dz);
      cop.phase += dt * 10;
      if (dist > 1.7) {
        cop.x += Math.sin(cop.heading) * 7 * dt;
        cop.z += Math.cos(cop.heading) * 7 * dt;
        cop.hold = 0;
      } else {
        cop.hold += dt;
        if (cop.hold > 2) {
          events.push({ type: 'busted' });
          cop.hold = 0;
        }
      }
      const fixed = resolveBuildingCollision(this.world.colliders, cop.x, cop.z, 0.5);
      cop.x = fixed.x; cop.z = fixed.z;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
    }
    return events;
  }

  clear() {
    while (this.cops.length) this._removeCop(0);
    while (this.footCops.length) this._removeFootCop(0);
  }
}
