// shots.js — one job: stage the four deterministic screenshot scenes.
// Each scene plays the real simulation forward from the seeded fresh world
// with a simple autopilot driver, so the frame is what the game really
// looks like — never a mock. ?shot=start|play|chase|mission&seed=1.

import { LOCATIONS } from './config.js';

// A fake input that drives a car toward a list of waypoints.
function makeDriver(waypoints) {
  let wp = 0;
  return {
    waypoints,
    moveAxes() {
      return { x: this._steer, y: this._throttle };
    },
    down() { return false; },
    consumeMouse() { return { dx: 0, dy: 0 }; },
    consumeClick() { return false; },
    pressed() { return false; },
    _steer: 0,
    _throttle: 1,
    // steer the car toward its current waypoint, braking hard before a
    // sharp turn so it stays on the road instead of cutting the corner
    // into a building. Stops at the final waypoint.
    aim(car) {
      const target = this.waypoints[Math.min(wp, this.waypoints.length - 1)];
      const dx = target.x - car.x;
      const dz = target.z - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 12 && wp < this.waypoints.length - 1) wp += 1;
      if (wp === this.waypoints.length - 1 && dist < 15) {
        this._steer = 0;
        this._throttle = 0;
        return;
      }
      const want = Math.atan2(dx, dz);
      let dh = want - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this._steer = Math.max(-1, Math.min(1, dh * 2.2));
      const ad = Math.abs(dh);
      // how sharp is the turn at the current waypoint? brake on the
      // approach so the car enters it slowly and stays on the road
      let turn = 0;
      if (wp < this.waypoints.length - 1) {
        const next = this.waypoints[wp + 1];
        let d = Math.atan2(next.x - target.x, next.z - target.z)
          - Math.atan2(target.x - car.x, target.z - car.z);
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        turn = Math.abs(d);
      }
      if (turn > 0.7 && dist < 70) {
        if (Math.abs(car.speed) > 14) this._throttle = -1;
        else if (Math.abs(car.speed) > 8) this._throttle = 0;
        else this._throttle = 0.4;
      } else if (ad > 0.9 && Math.abs(car.speed) > 8) this._throttle = -1; // brake
      else if (ad > 0.9) this._throttle = 0.2;
      else if (ad > 0.45) this._throttle = 0.5;
      else if (dist < 30 && Math.abs(car.speed) > 12) this._throttle = 0.3;
      else this._throttle = 1;
    },
  };
}

function putPlayerInCar(game, modelKey, x, z, heading) {
  const car = game.spawnFreeCar(modelKey, x, z, heading);
  game.enterCar(car, { silent: true });
  return car;
}

export function stageShot(game, name) {
  const dt = 1 / 60;
  if (name === 'start') {
    game.state = 'title';
    game.showTitle();
    return;
  }

  game.hideTitle();
  game.state = 'play';
  game.audioMuted = true;

  if (name === 'play') {
    // Driving downtown in traffic, HUD + minimap on.
    const car = putPlayerInCar(game, 'brisa', 315.5, 180, 0);
    const driver = makeDriver([
      { x: 320, z: 540 },
      { x: 560, z: 564.5 },
      { x: 564.5, z: 320 },
    ]);
    for (let i = 0; i < 20 * 60; i++) {
      driver.aim(car);
      game.update(dt, driver);
    }
    return;
  }

  if (name === 'chase') {
    // Three-star police pursuit down one long straight: the interceptors
    // stay in frame behind the player the whole run.
    const car = putPlayerInCar(game, 'viento', 315.5, 120, 0);
    game.setWanted(3);
    const driver = makeDriver([
      { x: 315.5, z: 560 },
      { x: 560, z: 564.5 },
    ]);
    for (let i = 0; i < 18 * 60; i++) {
      driver.aim(car);
      game.update(dt, driver);
    }
    return;
  }

  if (name === 'mission') {
    // Bayfront Drop, delivery leg: beacon on the marina, timer running.
    game.missions.startMission(game, 1);
    game.missions.step = 1;
    game.missions.timer = 75;
    game.missions.refreshBeacon(game);
    game.setWanted(2);
    const car = putPlayerInCar(game, 'marlin', 520, 560, Math.PI / 2);
    const driver = makeDriver([
      { x: 560, z: 564.5 },
      { x: 555.5, z: 640 },
      { x: 600, z: 688 },
    ]);
    for (let i = 0; i < 7 * 60; i++) {
      driver.aim(car);
      game.update(dt, driver);
    }
    return;
  }

  // unknown shot name: fall back to the title screen
  game.state = 'title';
  game.showTitle();
}
