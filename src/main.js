// main.js — one job: wire Solmar Bay together and run it.
// Builds every system, owns the game state (cash, wanted, clock, screens),
// the update loop, entering/exiting cars, crime + wanted decay, save/load,
// and the ?shot= deterministic screenshot mode.

import * as THREE from 'three';
import { Renderer } from './render.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { Vehicle, TrafficManager, spawnParkedCars } from './vehicles.js';
import { PoliceManager } from './police.js';
import { Peds } from './peds.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import { GAME, LOCATIONS, WORLD } from './config.js';
import { stageShot } from './shots.js';

const SAVE_KEY = 'solmar-save-v1';

class Game {
  constructor() {
    this.seed = 1;
    this.state = 'title'; // title | play | pause | over
    this.cash = GAME.startCash;
    this.wanted = 0;
    this.clockMinutes = GAME.startHour * 60 + GAME.startMinute;
    this.elapsed = 0;
    this.lastCrimeTime = -100;
    this.decayTimer = 0;
    this.saveTimer = 0;
    this.overKind = null;
    this.yaw = Math.PI;
    this.pitch = 0.25;
    this.audioMuted = false;

    const canvas = document.getElementById('game-canvas');
    this.renderer = new Renderer(canvas);
    this.scene = this.renderer.scene;
    this.world = buildWorld(this.scene, this.seed);
    this.player = new Player(this.scene);
    this.player.reset(LOCATIONS.spawn.x, LOCATIONS.spawn.z);
    this.rp = 0; // reputation: total mission payout earned
    this.traffic = new TrafficManager(this.scene, this.world, this.seed);
    this.parked = spawnParkedCars(this.scene, this.world, this.seed, GAME.parkedCount);
    // the mission Viento GT, parked on Palm Row
    this.missionCar = new Vehicle(this.scene, 'viento', LOCATIONS.vientoParked.x, LOCATIONS.vientoParked.z, 0);
    this.missionCar.isParked = true;
    this.parked.push(this.missionCar);
    this.freeCars = [];
    this.police = new PoliceManager(this.scene, this.world);
    this.peds = new Peds(this.scene, this.world, this.seed);
    this.combat = new Combat(this.scene, this.renderer.camera);
    this.missions = new Missions(this.scene);
    this.hud = new HUD();
    this.audio = new AudioSys();
    this.input = new Input(canvas);
    this.missions.refreshBeacon(this);
    this._wireScreens();
  }

  async initWasm() {
    await this.traffic.initWasm();
  }

  // --- screens ---------------------------------------------------------
  _wireScreens() {
    const title = document.getElementById('screen-title');
    const pause = document.getElementById('screen-pause');
    this.titleEl = title;
    this.pauseEl = pause;
    document.getElementById('btn-new').addEventListener('click', () => {
      this.audio.start();
      this.newGame();
    });
    const cont = document.getElementById('btn-continue');
    if (!this.loadSaveData()) cont.style.display = 'none';
    cont.addEventListener('click', () => {
      this.audio.start();
      this.loadGame();
      this.state = 'play';
      this.hideTitle();
    });
    document.getElementById('btn-resume').addEventListener('click', () => this.resume());
    document.getElementById('btn-quit').addEventListener('click', () => {
      this.save();
      this.state = 'title';
      this.pauseEl.style.display = 'none';
      this.showTitle();
    });
  }

  showTitle() { this.titleEl.style.display = 'flex'; }
  hideTitle() { this.titleEl.style.display = 'none'; }

  newGame() {
    this.reset();
    this.state = 'play';
    this.hideTitle();
    this.hud.toast("Dante: 'First Wheels — steal the red Viento GT on Palm Row.'", 6);
  }

  reset() {
    this.cash = GAME.startCash;
    this.rp = 0;
    this.wanted = 0;
    this.clockMinutes = GAME.startHour * 60 + GAME.startMinute;
    this.elapsed = 0;
    this.player.reset(LOCATIONS.spawn.x, LOCATIONS.spawn.z);
    this.police.clear();
    this.missions.reset(this);
    this.hud.hideWasted();
    this.yaw = Math.PI;
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.pauseEl.style.display = 'flex';
  }

  resume() {
    if (this.state !== 'pause') return;
    this.state = 'play';
    this.pauseEl.style.display = 'none';
  }

  gameOver(kind) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.overKind = kind;
    this.audio.setSiren(false);
    this.audio.setEngine(0, 1, false);
    this.hud.showWasted(kind);
  }

  respawn() {
    this.cash = Math.max(0, Math.floor(this.cash * 0.9));
    this.player.reset(LOCATIONS.spawn.x, LOCATIONS.spawn.z);
    this.wanted = 0;
    this.police.clear();
    this.hud.hideWasted();
    this.state = 'play';
  }

  // --- crime -----------------------------------------------------------
  setWanted(n) {
    this.wanted = Math.max(0, Math.min(5, n));
    this.lastCrimeTime = this.elapsed;
    this.decayTimer = 0;
  }

  commitCrime(levels) {
    if (this.elapsed - this.lastCrimeTime < 4) return;
    this.setWanted(this.wanted + levels);
  }

  // --- cars ------------------------------------------------------------
  spawnFreeCar(modelKey, x, z, heading) {
    const car = new Vehicle(this.scene, modelKey, x, z, heading);
    this.freeCars.push(car);
    return car;
  }

  enterCar(car, opts = {}) {
    if (car.isTraffic) this.traffic.removeFromTraffic(car);
    if (car.isParked) {
      const i = this.parked.indexOf(car);
      if (i >= 0) this.parked.splice(i, 1);
      car.isParked = false;
    }
    if (!this.freeCars.includes(car)) this.freeCars.push(car);
    car.isPlayer = true;
    this.player.inCar = car;
    this.player.group.visible = false;
    if (!opts.silent) {
      const witness = this.peds.nearest(car.x, car.z, 50) || this.police.cops.some((c) => Math.hypot(c.vehicle.x - car.x, c.vehicle.z - car.z) < 60);
      if (witness) {
        this.commitCrime(1);
        this.hud.toast('Car stolen — someone saw that!', 3);
      }
    }
  }

  exitCar() {
    const car = this.player.inCar;
    if (!car) return;
    car.isPlayer = false;
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);
    this.player.x = car.x + rx * 3;
    this.player.z = car.z + rz * 3;
    this.player.heading = car.heading;
    this.player.inCar = null;
    this.player.group.visible = true;
    this.player.group.position.set(this.player.x, 0, this.player.z);
  }

  nearestEnterable(x, z, maxDist) {
    let best = null; let bestD = maxDist;
    const all = [...this.parked, ...this.traffic.cars.filter((c) => c.isTraffic), ...this.freeCars];
    for (const car of all) {
      if (car.isPlayer) continue;
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  // --- save / load -----------------------------------------------------
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.cash,
        missionIndex: this.missions.index,
        x: this.player.x, z: this.player.z,
        wanted: this.wanted,
        clockMinutes: this.clockMinutes,
      }));
    } catch (err) { /* storage unavailable */ }
  }

  loadSaveData() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) { return null; }
  }

  loadGame() {
    const data = this.loadSaveData();
    if (!data) return;
    this.reset();
    this.cash = data.cash ?? GAME.startCash;
    this.wanted = data.wanted ?? 0;
    this.clockMinutes = data.clockMinutes ?? GAME.startHour * 60 + GAME.startMinute;
    this.player.x = data.x ?? LOCATIONS.spawn.x;
    this.player.z = data.z ?? LOCATIONS.spawn.z;
    this.missions.index = data.missionIndex ?? 0;
    this.missions.step = 0;
    this.missions.state = 'active';
    this.missions.refreshBeacon(this);
  }

  // --- the frame -------------------------------------------------------
  update(dt, input) {
    this.elapsed += dt;
    this.clockMinutes += dt * 0.5;
    const mouse = input.consumeMouse();
    this.yaw -= mouse.dx * 0.0032;
    this.pitch = Math.max(-0.15, Math.min(0.85, this.pitch + mouse.dy * 0.0028));

    if (input.pressed('Escape') || input.pressed('KeyP')) { this.pause(); return; }
    if (input.pressed('KeyM')) this.audio.toggleMute();
    if (input.pressed('Digit1')) this.player.weapon = 'fists';
    if (input.pressed('Digit2')) this.player.weapon = 'pistol';
    if (input.pressed('KeyE')) {
      if (this.player.inCar) this.exitCar();
      else {
        const car = this.nearestEnterable(this.player.x, this.player.z, 4.5);
        if (car) this.enterCar(car);
      }
    }

    const focus = this.player.inCar ? this.player.inCar : this.player;

    // --- player / driving
    if (this.player.inCar) {
      const car = this.player.inCar;
      const others = [...this.traffic.cars.filter((c) => c.isTraffic), ...this.freeCars.filter((c) => c !== car), ...this.police.cops.map((c) => c.vehicle)];
      const events = car.stepPlayer(dt, input, this.world, others);
      for (const ev of events) {
        if (ev.type === 'building') {
          this.audio.thud();
          car.damage = Math.min(0.6, car.damage + 0.03);
          if (ev.speed > 15) this.hud.flashDamage();
        } else if (ev.type === 'car') {
          this.audio.thud();
          if (ev.other && ev.other.isPolice) {
            this.commitCrime(1);
            this.hud.toast('You rammed a police car!', 3);
          } else if (ev.speed > 18) {
            this.commitCrime(1);
          }
          if (ev.speed > 15) this.hud.flashDamage();
        }
      }
      // running over pedestrians
      for (const ped of this.peds.list) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - car.x, ped.z - car.z) < 2.2 && Math.abs(car.speed) > 5) {
          this.peds.knockDown(ped);
          this.commitCrime(1);
          this.audio.thud();
          this.hud.flashDamage();
          this.hud.toast('You hit a pedestrian!', 3);
        }
      }
      this.audio.setEngine(car.speed, car.spec.maxSpeed, true);
    } else {
      this.player.update(dt, input, this.yaw, this.world);
      this.audio.setEngine(0, 1, false);
      // shooting (pistol only; fists can't shoot)
      if (input.consumeClick() && this.player.weapon === 'pistol') {
        const origin = this.player.getMuzzleWorldPosition(new THREE.Vector3());
        const cars = [...this.traffic.cars.filter((c) => c.isTraffic), ...this.police.cops.map((c) => c.vehicle), ...this.parked];
        const ev = this.combat.shoot(this.elapsed, origin, { peds: this.peds, cars });
        if (ev) {
          this.player.muzzleFlash();
          this.audio.shot();
          if (ev.hit === 'ped' && ev.ref) {
            if (this.peds.knockDown(ev.ref)) this.commitCrime(1);
            this.peds.scare(ev.point.x, ev.point.z, 30);
          } else if (ev.hit === 'police') {
            this.commitCrime(1);
            this.hud.toast('You shot at the police!', 3);
          } else if (ev.hit === 'car') {
            this.commitCrime(1);
          }
          if (ev.point) this.peds.scare(ev.point.x, ev.point.z, 18);
        }
      }
    }

    // --- world systems
    this.traffic.update(dt);
    if (this.world.update) this.world.update(this.elapsed);
    const policeEvents = this.police.update(dt, this);
    for (const ev of policeEvents) {
      if (ev.type === 'ram') {
        if (this.player.damage(4)) { this.gameOver('wasted'); return; }
        this.audio.thud();
        this.hud.flashDamage();
      } else if (ev.type === 'busted') {
        this.gameOver('busted');
        return;
      }
    }
    this.peds.update(dt);
    this.combat.update(dt);
    this.missions.update(dt, this);

    // --- wanted decay: quiet for 20s and no cop close, lose a star
    if (this.wanted > 0 && this.elapsed - this.lastCrimeTime > GAME.wantedDecaySeconds) {
      const nearCop = this.police.cops.some((c) => Math.hypot(c.vehicle.x - focus.x, c.vehicle.z - focus.z) < 40);
      if (!nearCop) {
        this.decayTimer += dt;
        if (this.decayTimer > 10) {
          this.decayTimer = 0;
          this.setWanted(this.wanted - 1);
        }
      }
    }
    this.audio.setSiren(this.wanted > 0);

    // --- save + hud + camera
    this.saveTimer += dt;
    if (this.saveTimer > 10) { this.saveTimer = 0; this.save(); }
    this.hud.update(this, dt);
    this.renderer.followSun(focus.x, focus.z);
    const mode = this.player.inCar ? 'drive' : 'foot';
    this.renderer.updateCamera(mode, focus, this.yaw, this.pitch, dt);
  }

  renderFrame(dt) {
    if (this.state === 'title') {
      this.renderer.updateCamera('title', { x: WORLD.SIZE / 2, z: WORLD.SIZE / 2 }, 0, 0, dt);
    }
    this.renderer.render();
  }
}

// --- boot ---------------------------------------------------------------
window.addEventListener('error', (e) => {
  const el = document.getElementById('fatal');
  if (el) { el.style.display = 'block'; el.textContent = `Error: ${e.message}`; }
});

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || 1);

const game = new Game();
game.seed = seed;
window.__game = game; // debug handle: the screenshot runner reads state here

if (shotName) {
  // deterministic screenshot mode: stage the scene, render it, keep
  // re-rendering the same frame so the screenshot always catches it.
  await game.initWasm();
  stageShot(game, shotName);
  game.hud.update(game, 0);
  const loop = () => {
    game.renderFrame(0.016);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
} else {
  await game.initWasm();
  game.showTitle();
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (game.state === 'play') {
      game.update(dt, game.input);
    } else if (game.state === 'over') {
      if (game.input.pressed('KeyR')) game.respawn();
    } else if (game.state === 'pause') {
      if (game.input.pressed('Escape') || game.input.pressed('KeyP')) game.resume();
    }
    game.renderFrame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
