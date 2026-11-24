// vehicles.js — one job: every car in Solmar Bay.
// The low-poly car model, arcade driving physics, the traffic manager
// (routes cars along streets, integrates them in Rust/wasm when available),
// parked cars, and stealing.

import * as THREE from 'three';
import { CAR_MODELS, GAME, WORLD } from './config.js';
import { mulberry32, pick, range, intRange } from './random.js';
import { resolveBuildingCollision } from './world.js';
import { jsTrafficStep, loadTrafficWasm, TRAFFIC_STRIDE } from './traffic-wasm.js';

const MODEL_KEYS = ['viento', 'brisa', 'coral', 'marlin', 'taxi'];

export function makeCarModel(modelKey) {
  const spec = CAR_MODELS[modelKey];
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: spec.colour });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const L = spec.length;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, L), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.55, L * 0.48), glassMat);
  cabin.position.set(0, 1.18, -L * 0.06);
  cabin.castShadow = true;
  group.add(cabin);
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  [[-0.85, L * 0.32], [0.85, L * 0.32], [-0.85, -L * 0.32], [0.85, -L * 0.32]].forEach(([wx, wz]) => {
    const wheel = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  });
  // headlights + taillights
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c9, emissive: 0xccbb55 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xaa1111, emissive: 0x550000 });
  [[-0.6, L / 2], [0.6, L / 2]].forEach(([hx, hz]) => {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lightMat);
    h.position.set(hx, 0.68, hz);
    group.add(h);
  });
  [[-0.6, -L / 2], [0.6, -L / 2]].forEach(([hx, hz]) => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    t.position.set(hx, 0.68, hz);
    group.add(t);
  });
  if (modelKey === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.52, -0.1);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.42), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xaa0000 }));
    red.position.set(-0.28, 1.62, -0.1);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.42), new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0000aa }));
    blue.position.set(0.28, 1.62, -0.1);
    group.add(blue);
  }
  if (modelKey === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.4), new THREE.MeshLambertMaterial({ color: 0x111111, emissive: 0x332200 }));
    sign.position.set(0, 1.56, -0.1);
    group.add(sign);
  }
  return { group, wheels, bodyMat };
}

export class Vehicle {
  constructor(scene, modelKey, x, z, heading) {
    this.modelKey = modelKey;
    this.spec = CAR_MODELS[modelKey];
    const built = makeCarModel(modelKey);
    this.mesh = built.group;
    this.wheels = built.wheels;
    scene.add(this.mesh);
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.isPlayer = false;
    this.isPolice = modelKey === 'police';
    this.isTraffic = false;
    this.isParked = false;
    this.slot = -1;
    this.wheelSpin = 0;
    this.damage = 0;
    this.syncMesh();
  }

  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.wheelSpin += this.speed * 0.016;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    // front wheels steer visually
    this.wheels[0].rotation.y = this.steer * 0.4;
    this.wheels[1].rotation.y = this.steer * 0.4;
  }

  // Player driving. Returns events: [{type, speed, other}].
  stepPlayer(dt, input, world, others) {
    const events = [];
    const axes = input.moveAxes();
    const throttle = axes.y; // W forward, S brake/reverse
    const steerIn = axes.x;
    const maxSpeed = this.spec.maxSpeed * (1 - this.damage * 0.25);
    // steering: less at standstill, flips in reverse
    const steerTarget = steerIn * 0.55;
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    if (throttle > 0) {
      this.speed = Math.min(maxSpeed, this.speed + this.spec.accel * dt);
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed = Math.max(0, this.speed - 26 * dt);
      else this.speed = Math.max(-this.spec.reverse, this.speed - this.spec.accel * 0.6 * dt);
    } else {
      this.speed *= Math.max(0, 1 - 0.9 * dt);
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }
    this.speed -= this.speed * 0.12 * dt;
    const turn = this.steer * 2.1 * Math.min(1, Math.abs(this.speed) / 9) * (this.speed >= 0 ? 1 : -1);
    this.heading += turn * dt;
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    // buildings
    const fixed = resolveBuildingCollision(world.colliders, nx, nz, 2.3);
    if (fixed.x !== nx || fixed.z !== nz) {
      if (Math.abs(this.speed) > 6) events.push({ type: 'building', speed: Math.abs(this.speed) });
      this.speed *= 0.55;
    }
    this.x = Math.max(10, Math.min(WORLD.LIMIT, fixed.x));
    this.z = Math.max(10, Math.min(700, fixed.z));
    // other vehicles: push apart, slow both
    for (const other of others) {
      if (other === this) continue;
      const dx = other.x - this.x;
      const dz = other.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.6 && d > 0.01) {
        const push = (4.6 - d) / 2;
        const ux = dx / d; const uz = dz / d;
        this.x -= ux * push; this.z -= uz * push;
        other.x += ux * push; other.z += uz * push;
        if (Math.abs(this.speed) > 5 || Math.abs(other.speed) > 5) {
          events.push({ type: 'car', speed: Math.abs(this.speed) + Math.abs(other.speed), other });
          this.speed *= 0.7;
          other.speed *= 0.7;
        }
      }
    }
    this.syncMesh();
    return events;
  }
}

export class TrafficManager {
  constructor(scene, world, seed) {
    this.scene = scene;
    this.world = world;
    this.rng = mulberry32(seed + 77);
    this.cars = [];
    this.wasm = null;
    this.state = null; // Float32Array view (wasm memory or plain)
    this.wasmState = null;
    this.count = GAME.trafficCount;
    for (let i = 0; i < this.count; i++) {
      const car = this.spawnCar();
      this.cars.push(car);
    }
  }

  spawnCar() {
    const rng = this.rng;
    const coords = this.world.streetCoords;
    const axis = rng() < 0.5 ? 0 : 1;
    const line = coords[intRange(rng, 1, coords.length - 2)];
    const dir = rng() < 0.5 ? 1 : -1;
    const modelKey = pick(rng, MODEL_KEYS);
    const car = new Vehicle(this.scene, modelKey, 0, 0, 0);
    car.isTraffic = true;
    car.slot = this.cars.length;
    const route = { axis, line, dir };
    car.route = route;
    // place on the street at a random spot
    const along = range(rng, 40, WORLD.SIZE - 40);
    const lane = this.laneOffset(axis, dir);
    if (axis === 0) { car.x = along; car.z = line + lane; car.heading = dir > 0 ? 0 : Math.PI; }
    else { car.x = line + lane; car.z = along; car.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    car.speed = range(rng, 7, 12);
    this.assignTarget(car);
    car.syncMesh();
    return car;
  }

  laneOffset(axis, dir) {
    // right-hand traffic
    if (axis === 0) return dir > 0 ? 4.5 : -4.5;
    return dir > 0 ? -4.5 : 4.5;
  }

  assignTarget(car) {
    const coords = this.world.streetCoords;
    const { axis, line, dir } = car.route;
    const lane = this.laneOffset(axis, dir);
    if (axis === 0) {
      const next = dir > 0
        ? coords.find((c) => c > car.x + 20) ?? null
        : [...coords].reverse().find((c) => c < car.x - 20) ?? null;
      if (next === null) { this.turnCar(car); return; }
      car.target = { x: next, z: line + lane };
    } else {
      const next = dir > 0
        ? coords.find((c) => c > car.z + 20) ?? null
        : [...coords].reverse().find((c) => c < car.z - 20) ?? null;
      if (next === null) { this.turnCar(car); return; }
      car.target = { x: line + lane, z: next };
    }
    car.targetSpeed = range(this.rng, 8, 13);
  }

  turnCar(car) {
    const coords = this.world.streetCoords;
    const rng = this.rng;
    const cross = car.route.axis === 0 ? car.z : car.x;
    // snap to the nearest cross street and turn onto it
    let nearest = coords[0];
    for (const c of coords) if (Math.abs(c - cross) < Math.abs(nearest - cross)) nearest = c;
    const newDir = rng() < 0.5 ? 1 : -1;
    car.route = { axis: 1 - car.route.axis, line: nearest, dir: newDir };
    this.assignTarget(car);
  }

  async initWasm() {
    this.wasm = await loadTrafficWasm();
    if (this.wasm) {
      this.wasmState = this.wasm.makeState(this.count);
      this.state = this.wasmState.view;
    } else {
      this.state = new Float32Array(this.count * TRAFFIC_STRIDE);
    }
    for (let i = 0; i < this.count; i++) this.writeCarState(this.cars[i]);
  }

  writeCarState(car) {
    const b = car.slot * TRAFFIC_STRIDE;
    this.state[b] = car.x; this.state[b + 1] = car.z;
    this.state[b + 2] = car.heading; this.state[b + 3] = car.speed;
    this.state[b + 4] = car.targetSpeed || 9;
    this.state[b + 5] = car.target.x; this.state[b + 6] = car.target.z;
    this.state[b + 7] = 0;
  }

  // Step all traffic cars. Inactive slots (stolen cars) sit still.
  update(dt) {
    if (!this.state) return;
    if (this.wasm) {
      this.wasm.step(this.wasmState.ptr, this.count, dt);
    } else {
      jsTrafficStep(this.state, this.count, dt);
    }
    for (const car of this.cars) {
      if (!car.isTraffic) continue; // stolen: now player-driven
      const b = car.slot * TRAFFIC_STRIDE;
      car.x = this.state[b]; car.z = this.state[b + 1];
      car.heading = this.state[b + 2]; car.speed = this.state[b + 3];
      if (this.state[b + 7] === 1) {
        // reached its target: route on, or turn at the intersection
        if (this.rng() < 0.3) this.turnCar(car);
        else this.assignTarget(car);
        this.writeCarState(car);
      }
      car.syncMesh();
    }
  }

  removeFromTraffic(car) {
    car.isTraffic = false;
    if (this.state) {
      const b = car.slot * TRAFFIC_STRIDE;
      this.state[b + 4] = 0; // targetSpeed 0: the slot parks
      this.state[b + 5] = car.x; this.state[b + 6] = car.z;
    }
  }

  nearestCar(x, z, maxDist) {
    let best = null; let bestD = maxDist;
    for (const car of this.cars) {
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }
}

export function spawnParkedCars(scene, world, seed, count) {
  const rng = mulberry32(seed + 31);
  const parked = [];
  const coords = world.streetCoords;
  for (let i = 0; i < count; i++) {
    const axis = rng() < 0.5 ? 0 : 1;
    const line = coords[intRange(rng, 1, coords.length - 2)];
    const along = range(rng, 40, WORLD.SIZE - 40);
    const side = rng() < 0.5 ? 9.5 : -9.5;
    const modelKey = pick(rng, MODEL_KEYS);
    let x; let z; let heading;
    if (axis === 0) { x = along; z = line + side; heading = side > 0 ? 0 : Math.PI; }
    else { x = line + side; z = along; heading = side > 0 ? Math.PI / 2 : -Math.PI / 2; }
    const car = new Vehicle(scene, modelKey, x, z, heading);
    car.isParked = true;
    parked.push(car);
  }
  return parked;
}
