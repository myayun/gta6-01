// missions.js — one job: the three-mission story of The Solmar Job.
// A tiny state machine: each mission is a list of steps (steal a car, reach
// a place, beat a timer). The waypoint beacon and the HUD objective come
// from here.

import * as THREE from 'three';
import { MISSIONS, LOCATIONS } from './config.js';

export class Missions {
  constructor(scene) {
    this.scene = scene;
    this.index = 0; // current mission
    this.step = 0; // current step inside it
    this.state = 'active'; // active | done
    this.timer = 0;
    this.beacon = null;
    this.beaconRing = null;
    this._makeBeacon();
  }

  _makeBeacon() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.25, depthWrite: false });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 42, 16, 1, true), mat);
    this.beacon.position.y = 21;
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.7 });
    this.beaconRing = new THREE.Mesh(new THREE.RingGeometry(3, 4.4, 24), ringMat);
    this.beaconRing.rotation.x = -Math.PI / 2;
    this.beaconRing.position.y = 0.15;
    this.scene.add(this.beacon, this.beaconRing);
  }

  current() {
    return MISSIONS[this.index] || null;
  }

  currentStep() {
    const m = this.current();
    return m ? m.steps[this.step] : null;
  }

  // Place the beacon on the current step's target (or hide it).
  refreshBeacon(game) {
    const step = this.currentStep();
    if (!step || this.state === 'done') {
      this.beacon.visible = false;
      this.beaconRing.visible = false;
      return;
    }
    let target = null;
    if (step.type === 'steal') target = LOCATIONS.vientoParked;
    else if (step.target) target = LOCATIONS[step.target];
    if (!target) {
      this.beacon.visible = false;
      this.beaconRing.visible = false;
      return;
    }
    this.beacon.visible = true;
    this.beaconRing.visible = true;
    this.beacon.position.set(target.x, 21, target.z);
    this.beaconRing.position.set(target.x, 0.15, target.z);
  }

  startMission(game, index) {
    this.index = index;
    this.step = 0;
    this.state = 'active';
    const m = this.current();
    game.hud.showDialogue(m.speaker, m.role, m.line);
    this.refreshBeacon(game);
  }

  // Called when a step's wanted level applies.
  applyStepWanted(game) {
    const step = this.currentStep();
    if (step && step.wanted) game.setWanted(step.wanted);
    if (step && step.timer) this.timer = step.timer;
  }

  // Returns 'complete' | 'fail' | null.
  update(dt, game) {
    if (this.state === 'done') return null;
    const step = this.currentStep();
    if (!step) return null;
    const focus = game.player.inCar ? game.player.inCar : game.player;

    if (step.timer) {
      this.timer -= dt;
      if (this.timer <= 0) {
        game.hud.toast('Too slow — the drop is off. Try the mission again.', 4);
        this.startMission(game, this.index);
        this.applyStepWanted(game);
        return 'fail';
      }
    }

    if (step.type === 'steal') {
      if (game.player.inCar && game.player.inCar === game.missionCar) {
        return this._advance(game);
      }
      return null;
    }
    // goto / pickup / deliver: reach the target
    const target = LOCATIONS[step.target];
    if (!target) return null;
    const d = Math.hypot(focus.x - target.x, focus.z - target.z);
    if (d < (step.radius || 10)) return this._advance(game);
    return null;
  }

  _advance(game) {
    const m = this.current();
    this.step += 1;
    if (this.step >= m.steps.length) {
      // mission complete
      game.cash += m.payout;
      game.rp = (game.rp || 0) + m.payout;
      game.audio.chime();
      game.hud.showDialogue(m.speaker, m.role, `${m.complete} ($${m.payout.toLocaleString()} paid.)`);
      game.hud.toast(`${m.title} complete — $${m.payout.toLocaleString()} paid.`, 5);
      game.save();
      this.index += 1;
      if (this.index >= MISSIONS.length) {
        this.state = 'done';
        this.refreshBeacon(game);
        return 'complete';
      }
      this.step = 0;
      const next = this.current();
      game.hud.showDialogue(next.speaker, next.role, next.line);
    } else {
      game.audio.chime();
    }
    this.refreshBeacon(game);
    this.applyStepWanted(game);
    return 'complete';
  }

  objective(game) {
    if (this.state === 'done') return { text: 'Free roam — Solmar Bay is yours', distance: 0 };
    const step = this.currentStep();
    if (!step) return { text: '', distance: 0 };
    let target = null;
    if (step.type === 'steal') target = LOCATIONS.vientoParked;
    else if (step.target) target = LOCATIONS[step.target];
    const focus = game.player.inCar ? game.player.inCar : game.player;
    const distance = target ? Math.hypot(focus.x - target.x, focus.z - target.z) : 0;
    let text = step.text;
    if (step.timer) text += ` — ${Math.max(0, Math.ceil(this.timer))}s`;
    return { text, distance };
  }

  reset(game) {
    this.index = 0;
    this.step = 0;
    this.state = 'active';
    this.timer = 0;
    this.refreshBeacon(game);
  }
}
