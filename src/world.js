// world.js — one job: build the city of Solmar Bay from a seed.
// Streets on a grid, procedural buildings with canvas window textures,
// beach + ocean + marina pier, palms, streetlights. Returns the colliders
// (building AABBs) and the named places every other system needs.

import * as THREE from 'three';
import { WORLD, COLOURS } from './config.js';
import { mulberry32, pick, range, intRange, chance } from './random.js';

function makeFacadeTexture(base, lit) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // subtle vertical shading
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.12)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // window grid: 4 columns x 10 rows, some lit warm
  for (let r = 0; r < 10; r++) {
    for (let col = 0; col < 4; col++) {
      const x = 10 + col * 30;
      const y = 12 + r * 24;
      const warm = Math.random() < lit;
      g.fillStyle = warm ? '#ffd98a' : '#2c3a4a';
      g.fillRect(x, y, 18, 13);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x, y, 18, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  // dark asphalt base
  g.fillStyle = '#33373c';
  g.fillRect(0, 0, 128, 128);
  // asphalt grain: deterministic speckles so the surface is not flat paint
  for (let i = 0; i < 350; i++) {
    const x = (i * 37 + 11) % 128;
    const y = (i * 91 + 53) % 128;
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
    g.fillRect(x, y, 2, 2);
  }
  // white edge lines, running the length of the tile
  g.fillStyle = '#e8e4d8';
  g.fillRect(3, 0, 3, 128);
  g.fillRect(122, 0, 3, 128);
  // yellow centre dash (one per tile; the repeat below spaces them)
  g.fillStyle = '#f0c94a';
  g.fillRect(60, 8, 8, 36);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePalm(rng) {
  const palm = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: COLOURS.palmTrunk });
  const leafMat = new THREE.MeshLambertMaterial({ color: COLOURS.palmLeaf });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 5.2, 6), trunkMat);
  trunk.position.y = 2.6;
  trunk.rotation.z = range(rng, -0.08, 0.08);
  trunk.castShadow = true;
  palm.add(trunk);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.4, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.1, 5.4, Math.sin(a) * 1.1);
    leaf.rotation.z = Math.cos(a) * 1.9;
    leaf.rotation.x = -Math.sin(a) * 1.9;
    leaf.scale.set(1, 1, 0.28);
    leaf.castShadow = true;
    palm.add(leaf);
  }
  return palm;
}

export function buildWorld(scene, seed) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  const colliders = [];
  const { PITCH, STREETS, STREET_W, SIZE } = WORLD;

  // --- ground base (sidewalk colour) and block tops
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE + 160, SIZE + 200),
    new THREE.MeshLambertMaterial({ color: COLOURS.sidewalk }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(SIZE / 2, 0, SIZE / 2 + 20);
  ground.receiveShadow = true;
  group.add(ground);

  // --- block tops: lawn / concrete yards so blocks read as city, not dirt
  const lawnMat = new THREE.MeshLambertMaterial({ color: 0x9aa584 });
  const yardMat = new THREE.MeshLambertMaterial({ color: 0xb5ad9c });
  for (let bx = 0; bx < 8; bx++) {
    for (let bz = 0; bz < 8; bz++) {
      const top = new THREE.Mesh(
        new THREE.PlaneGeometry(PITCH - STREET_W - 2, PITCH - STREET_W - 2),
        (bx + bz) % 2 ? lawnMat : yardMat,
      );
      top.rotation.x = -Math.PI / 2;
      top.position.set((bx + 0.5) * PITCH, 0.01, (bz + 0.5) * PITCH);
      top.receiveShadow = true;
      group.add(top);
    }
  }

  // --- roads: dark asphalt strips with yellow centre dashes on every
  // street, over paler sidewalk borders so each street reads as a street.
  // Strips run along their street centrelines: vertical roads along z at
  // x = i*PITCH, horizontal roads along x at z = i*PITCH.
  const roadTex = makeRoadTexture();
  roadTex.repeat.set(1, SIZE / 24);
  const roadTexH = roadTex.clone();
  roadTexH.needsUpdate = true;
  const roadMatV = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadMatH = new THREE.MeshLambertMaterial({ map: roadTexH });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xd9d2c0 });
  const walkW = STREET_W + 6; // 3 m of pale border each side of the asphalt
  for (let i = 0; i < STREETS; i++) {
    const c = i * PITCH;
    // sidewalk border under the vertical road (along z, at x = c)
    const wv = new THREE.Mesh(new THREE.PlaneGeometry(walkW, SIZE), walkMat);
    wv.rotation.x = -Math.PI / 2;
    wv.position.set(c, 0.02, SIZE / 2);
    wv.receiveShadow = true;
    group.add(wv);
    // sidewalk border under the horizontal road (along x, at z = c)
    const wh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, walkW), walkMat);
    wh.rotation.x = -Math.PI / 2;
    wh.position.set(SIZE / 2, 0.02, c);
    wh.receiveShadow = true;
    group.add(wh);
    // vertical asphalt (along z) at x = c: the plane's length axis is
    // already z, so no extra rotation; the texture's dash runs with it
    const rv = new THREE.Mesh(new THREE.PlaneGeometry(STREET_W, SIZE), roadMatV);
    rv.rotation.x = -Math.PI / 2;
    rv.position.set(c, 0.04, SIZE / 2);
    rv.receiveShadow = true;
    group.add(rv);
    // horizontal asphalt (along x) at z = c: the extra z-rotation swings
    // the plane's length axis (and the texture's dash direction) onto x
    const rh = new THREE.Mesh(new THREE.PlaneGeometry(STREET_W, SIZE), roadMatH);
    rh.rotation.x = -Math.PI / 2;
    rh.rotation.z = Math.PI / 2;
    rh.position.set(SIZE / 2, 0.04, c);
    rh.receiveShadow = true;
    group.add(rh);
  }

  // --- beach sand and ocean
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE + 160, 90),
    new THREE.MeshLambertMaterial({ color: COLOURS.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(SIZE / 2, 0.03, SIZE + 45);
  sand.receiveShadow = true;
  group.add(sand);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE + 400, 260),
    new THREE.MeshLambertMaterial({ color: COLOURS.ocean }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(SIZE / 2, 0.06, SIZE + 175);
  group.add(ocean);

  // --- buildings, one or more per block
  const facadeBases = ['#e8dcc8', '#d9a066', '#7fb3a3', '#c97b6b', '#f2e3c6', '#8fa8c8'];
  const facadeMats = facadeBases.map((base) => {
    const tex = makeFacadeTexture(base, 0.35);
    return new THREE.MeshLambertMaterial({ map: tex });
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: COLOURS.roof });
  const downtown = (bx, bz) => bx >= 3 && bx <= 5 && bz >= 3 && bz <= 5;

  for (let bx = 0; bx < 8; bx++) {
    for (let bz = 0; bz < 8; bz++) {
      const cx = (bx + 0.5) * PITCH;
      const cz = (bz + 0.5) * PITCH;
      const isDowntown = downtown(bx, bz);
      const count = isDowntown ? 1 : intRange(rng, 1, 3);
      for (let k = 0; k < count; k++) {
        const stories = isDowntown ? intRange(rng, 6, 10) : intRange(rng, 1, 4);
        const w = range(rng, 18, 34);
        const d = range(rng, 18, 34);
        const h = stories * 3.4;
        const ox = count === 1 ? 0 : range(rng, -14, 14);
        const oz = count === 1 ? 0 : range(rng, -14, 14);
        const x = cx + ox;
        const z = cz + oz;
        const baseMat = pick(rng, facadeMats);
        // one texture repeat per building so windows stay the same size
        // on a 1-storey house and a 10-storey tower
        const tex = baseMat.map.clone();
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(Math.max(1, Math.round(w / 9)), Math.max(1, Math.round(h / 9)));
        tex.needsUpdate = true;
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        // roof cap + AC box
        const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), roofMat);
        cap.position.set(x, h + 0.25, z);
        group.add(cap);
        if (chance(rng, 0.6)) {
          const ac = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 2.4), roofMat);
          ac.position.set(x + range(rng, -w / 4, w / 4), h + 1.1, z + range(rng, -d / 4, d / 4));
          group.add(ac);
        }
        colliders.push({ minX: x - w / 2 - 0.4, maxX: x + w / 2 + 0.4, minZ: z - d / 2 - 0.4, maxZ: z + d / 2 + 0.4 });
      }
    }
  }

  // --- palms along the beach and a few inland
  for (let x = 20; x < SIZE; x += 42) {
    const palm = makePalm(rng);
    palm.position.set(x + range(rng, -8, 8), 0, WORLD.BEACH_Z + range(rng, 8, 40));
    group.add(palm);
  }
  for (let i = 0; i < 10; i++) {
    const palm = makePalm(rng);
    palm.position.set(range(rng, 40, SIZE - 40), 0, range(rng, 40, SIZE - 80));
    group.add(palm);
  }

  // --- streetlights at every other intersection
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2f3542 });
  for (let i = 0; i < STREETS; i += 2) {
    for (let j = 0; j < STREETS; j += 2) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7, 6), poleMat);
      pole.position.set(i * PITCH + 9, 3.5, j * PITCH + 9);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xaa8833 }));
      lamp.position.set(i * PITCH + 9, 7.1, j * PITCH + 9);
      group.add(lamp);
    }
  }

  // --- marina pier (walkable, flush with the ground so cars sit on it)
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9a7b52 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(16, 0.12, 64), pierMat);
  pier.position.set(600, 0.06, 672);
  pier.castShadow = true;
  pier.receiveShadow = true;
  group.add(pier);
  const boatMat = new THREE.MeshLambertMaterial({ color: 0xf5f6fa });
  const boatMat2 = new THREE.MeshLambertMaterial({ color: 0x2e86de });
  [[560, 690, boatMat], [640, 700, boatMat2], [620, 668, boatMat]].forEach(([x, z, m]) => {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4, 1.4, 10), m);
    hull.position.set(x, 0.5, z);
    hull.castShadow = true;
    group.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 3.4), new THREE.MeshLambertMaterial({ color: 0x2f3542 }));
    cabin.position.set(x, 1.8, z - 1);
    group.add(cabin);
  });

  scene.add(group);
  return {
    group,
    colliders,
    streetCoords: Array.from({ length: STREETS }, (_, i) => i * PITCH),
    pier: { minX: 592, maxX: 608, maxZ: 702 },
  };
}

// Is (x, z) inside a building collider? Used by cars, player and peds.
export function collidesWithBuildings(colliders, x, z, radius) {
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    if (x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ) return b;
  }
  return null;
}

// Push a circle (x, z, radius) out of buildings; returns corrected position.
export function resolveBuildingCollision(colliders, x, z, radius) {
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        z = cz + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the smallest axis
        const pushL = x - b.minX + radius;
        const pushR = b.maxX - x + radius;
        const pushU = z - b.minZ + radius;
        const pushD = b.maxZ - z + radius;
        const m = Math.min(pushL, pushR, pushU, pushD);
        if (m === pushL) x = b.minX - radius;
        else if (m === pushR) x = b.maxX + radius;
        else if (m === pushU) z = b.minZ - radius;
        else z = b.maxZ + radius;
      }
    }
  }
  return { x, z };
}
