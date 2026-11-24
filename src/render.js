// render.js — one job: the three.js scene, lighting and cameras.
// Golden-hour sun, gradient sky dome, fog, shadows, and the three camera
// modes: title orbit, on-foot orbit, and the driving chase cam.

import * as THREE from 'three';
import { COLOURS, WORLD } from './config.js';

function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#33597f'); // zenith, deeper blue
  grad.addColorStop(0.45, '#7aaed6');
  grad.addColorStop(0.72, '#ffb35c'); // horizon glow, warmer
  grad.addColorStop(1.0, '#e07f3e');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(COLOURS.fog, 220, 900);

    // sky dome
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1400, 24, 16),
      new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false }),
    );
    this.scene.add(sky);

    // hemisphere + low golden sun
    const hemi = new THREE.HemisphereLight(0xcfe0f5, 0xa8845a, 0.8);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(COLOURS.sun, 2.6);
    this.sun.position.set(-300, 110, -160);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -140;
    this.sun.shadow.camera.right = 140;
    this.sun.shadow.camera.top = 140;
    this.sun.shadow.camera.bottom = -140;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 900;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2200);
    this.camera.position.set(320, 90, 700);

    this._camPos = new THREE.Vector3(320, 90, 700);
    this._camLook = new THREE.Vector3(320, 0, 320);
    this._titleAngle = 0.6;

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // Keep the shadow frustum centred on the action.
  followSun(x, z) {
    this.sun.position.set(x - 300, 110, z - 160);
    this.sun.target.position.set(x, 0, z);
    this.sun.target.updateMatrixWorld();
  }

  // mode: 'title' | 'foot' | 'drive' | 'fixed'. focus: {x, z, heading, y}.
  // yaw/pitch are the orbit angles for 'foot' mode.
  updateCamera(mode, focus, yaw, pitch, dt) {
    const cam = this.camera;
    let wantPos;
    let wantLook;
    if (mode === 'title') {
      this._titleAngle += dt * 0.02;
      const cx = WORLD.SIZE / 2;
      const cz = WORLD.SIZE / 2;
      wantPos = new THREE.Vector3(cx + Math.cos(this._titleAngle) * 260, 95, cz + Math.sin(this._titleAngle) * 260);
      wantLook = new THREE.Vector3(cx, 20, cz);
    } else if (mode === 'drive') {
      const fx = Math.sin(focus.heading);
      const fz = Math.cos(focus.heading);
      wantPos = new THREE.Vector3(focus.x - fx * 11.5, 4.6, focus.z - fz * 11.5);
      wantLook = new THREE.Vector3(focus.x + fx * 9, 1.2, focus.z + fz * 9);
    } else if (mode === 'fixed') {
      wantPos = new THREE.Vector3(focus.camX, focus.camY, focus.camZ);
      wantLook = new THREE.Vector3(focus.x, focus.y ?? 2, focus.z);
    } else {
      // on foot: orbit around the player
      const dist = 6.5;
      const h = 3.6 + Math.sin(pitch) * 3.2;
      const d = dist * Math.cos(pitch);
      wantPos = new THREE.Vector3(
        focus.x - Math.sin(yaw) * d,
        h + (focus.y ?? 0),
        focus.z - Math.cos(yaw) * d,
      );
      wantLook = new THREE.Vector3(focus.x, 1.6 + (focus.y ?? 0), focus.z);
    }
    // smooth the chase cams, snap the fixed/title ones
    const k = mode === 'fixed' || mode === 'title' ? 1 : 1 - Math.exp(-dt * 7);
    this._camPos.lerp(wantPos, k);
    this._camLook.lerp(wantLook, k);
    cam.position.copy(this._camPos);
    cam.lookAt(this._camLook);
  }

  setFixedCamera(x, y, z) {
    this._camPos.set(x, y, z);
    this.camera.position.set(x, y, z);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
