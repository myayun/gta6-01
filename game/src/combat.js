// combat.js — one job: Mara's pistol.
// Click to shoot: a raycast from the camera, a tracer line, a muzzle flash,
// and consequences — pedestrians fall, police notice, cars take the hit.

import * as THREE from 'three';

export class Combat {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.lastShot = 0;
    this.fireRate = 0.25;
    // muzzle flash: a small bright plane that blinks for a frame
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0, depthTest: false }),
    );
    this.flash.renderOrder = 999;
    this.scene.add(this.flash);
    this.flashTimer = 0;
    // tracer line
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    this.tracer.frustumCulled = false;
    this.scene.add(this.tracer);
    this.tracerTimer = 0;
  }

  // Fires one shot. Returns an event object or null.
  // targets: { peds, cars } — meshes to test against.
  shoot(now, origin, targets) {
    if (now - this.lastShot < this.fireRate) return null;
    this.lastShot = now;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = 80;
    const meshes = [];
    for (const ped of targets.peds.list) {
      if (ped.state !== 'down') meshes.push({ mesh: ped.mesh, kind: 'ped', ref: ped });
    }
    for (const car of targets.cars) {
      meshes.push({ mesh: car.mesh, kind: car.isPolice ? 'police' : 'car', ref: car });
    }
    const hits = this.raycaster.intersectObjects(meshes.map((m) => m.mesh), true);
    let event = { type: 'shot', hit: null, point: null };
    if (hits.length > 0) {
      const hit = hits[0];
      let obj = hit.object;
      while (obj.parent && obj.parent !== this.scene) obj = obj.parent;
      const entry = meshes.find((m) => m.mesh === obj);
      event.point = hit.point;
      if (entry) {
        event.hit = entry.kind;
        event.ref = entry.ref;
      }
    } else {
      // trace to max range
      event.point = this.raycaster.ray.at(80, new THREE.Vector3());
    }
    // tracer + flash
    const start = origin.clone();
    const pos = this.tracer.geometry.attributes.position;
    pos.setXYZ(0, start.x, start.y, start.z);
    pos.setXYZ(1, event.point.x, event.point.y, event.point.z);
    pos.needsUpdate = true;
    this.tracer.material.opacity = 0.9;
    this.tracerTimer = 0.08;
    this.flash.position.copy(start).add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1.2));
    this.flash.lookAt(this.camera.position);
    this.flash.material.opacity = 0.9;
    this.flashTimer = 0.05;
    return event;
  }

  update(dt) {
    if (this.tracerTimer > 0) {
      this.tracerTimer -= dt;
      if (this.tracerTimer <= 0) this.tracer.material.opacity = 0;
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.material.opacity = 0;
    }
  }
}
