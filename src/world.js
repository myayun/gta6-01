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

// --- polish helpers (Costa Alba-inspired, reimplemented from scratch) ----
// mergeParts: merge transformed primitives into one BufferGeometry so the
// zebra crossings, traffic lights and beach props cost a handful of draw
// calls instead of hundreds.
function xform(x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  m.setPosition(x, y, z);
  return m;
}

function mergeParts(parts) {
  let vCount = 0;
  let iCount = 0;
  for (const p of parts) {
    vCount += p.geo.attributes.position.count;
    iCount += p.geo.index ? p.geo.index.count : 0;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  const m = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  for (const p of parts) {
    const g = p.geo;
    m.copy(p.matrix);
    nm.getNormalMatrix(m);
    const pa = g.attributes.position.array;
    const na = g.attributes.normal.array;
    const ua = g.attributes.uv ? g.attributes.uv.array : null;
    for (let i = 0; i < g.attributes.position.count; i++) {
      v.fromArray(pa, i * 3).applyMatrix4(m);
      pos[(vo + i) * 3] = v.x;
      pos[(vo + i) * 3 + 1] = v.y;
      pos[(vo + i) * 3 + 2] = v.z;
      v.fromArray(na, i * 3).applyMatrix3(nm).normalize();
      nor[(vo + i) * 3] = v.x;
      nor[(vo + i) * 3 + 1] = v.y;
      nor[(vo + i) * 3 + 2] = v.z;
      if (ua) {
        uv[(vo + i) * 2] = ua[i * 2];
        uv[(vo + i) * 2 + 1] = ua[i * 2 + 1];
      }
    }
    if (g.index) {
      const ia = g.index.array;
      for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo;
      io += ia.length;
    }
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// Shopfront sign: bold white text on a coloured band (canvas texture).
// The canvas is 512x96 (5.33:1); sign planes use the same aspect.
function makeSignTexture(text, bg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.fillRect(0, 0, 512, 8);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 56;
  g.font = `bold ${size}px Verdana, Arial, sans-serif`;
  while (g.measureText(text).width > 480 && size > 20) {
    size -= 2;
    g.font = `bold ${size}px Verdana, Arial, sans-serif`;
  }
  g.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Striped parasol canopy: vertical bands on the canvas become radial
// wedges around the cone.
function makeStripeTexture(colour) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#f8f4ea' : colour;
    g.fillRect(i * 16, 0, 16, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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

  // --- zebra crossings at every junction, one merged mesh.
  // Each approach gets 5 white bars across the road, just short of the
  // junction, so the crossings read in every street shot.
  {
    const pos = [];
    const nor = [];
    const uv = [];
    const idx = [];
    const addQuad = (x0, z0, x1, z1) => {
      const base = pos.length / 3;
      pos.push(x0, 0.06, z0, x1, 0.06, z0, x1, 0.06, z1, x0, 0.06, z1);
      for (let i = 0; i < 4; i++) nor.push(0, 1, 0);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    for (let i = 0; i < STREETS; i++) {
      for (let j = 0; j < STREETS; j++) {
        const cx = i * PITCH;
        const cz = j * PITCH;
        // approaches from the north / south: bars run across the road (x).
        // Wide bars (1.4 m) on a 2.4 m pitch so the stripes stay readable
        // from a low chase camera instead of blurring into one line.
        const zb = [19.4, 17.0, 14.6, 12.2, 9.8];
        for (const off of zb) {
          if (j > 0) addQuad(cx - 6.5, cz - off - 0.7, cx + 6.5, cz - off + 0.7);
          if (j < STREETS - 1) addQuad(cx - 6.5, cz + off - 0.7, cx + 6.5, cz + off + 0.7);
        }
        // approaches from the west / east: bars run across the road (z)
        for (const off of zb) {
          if (i > 0) addQuad(cx - off - 0.7, cz - 6.5, cx - off + 0.7, cz + 6.5);
          if (i < STREETS - 1) addQuad(cx + off - 0.7, cz - 6.5, cx + off + 0.7, cz + 6.5);
        }
      }
    }
    const zg = new THREE.BufferGeometry();
    zg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    zg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
    zg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    zg.setIndex(idx);
    const zebra = new THREE.Mesh(zg, new THREE.MeshLambertMaterial({ color: 0xe8e4d8 }));
    zebra.receiveShadow = true;
    group.add(zebra);
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

  // --- beach life: striped parasols, towels and loungers on the dry sand.
  // All procedural, merged per colour so the whole beach costs a few draw
  // calls. Kept clear of the pier and the marina approach so the M2 drive
  // reads clean. Dry sand runs z 640..685; the waterline is at ~685.
  {
    const beachRng = mulberry32(seed + 4242);
    const parasolCols = ['#d94f2b', '#1e8449', '#f1c40f'];
    const stripeTexs = parasolCols.map((c) => makeStripeTexture(c));
    const coneGeo = new THREE.ConeGeometry(1.7, 1.0, 8);
    const poleGeoB = new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6);
    const coneParts = [[], [], []];
    const poleParts = [];
    for (let i = 0; i < 30; i++) {
      const x = 30 + beachRng() * 660;
      const z = 650 + beachRng() * 28;
      if (x > 570 && x < 630) continue; // pier + marina approach
      const gi = i % 3;
      coneParts[gi].push({ geo: coneGeo, matrix: xform(x, 2.5, z, 0, beachRng() * Math.PI, 0) });
      poleParts.push({ geo: poleGeoB, matrix: xform(x, 1.25, z) });
    }
    const poleMeshB = new THREE.Mesh(mergeParts(poleParts), new THREE.MeshLambertMaterial({ color: 0xf5f6fa }));
    poleMeshB.castShadow = true;
    group.add(poleMeshB);
    for (let gi = 0; gi < 3; gi++) {
      if (!coneParts[gi].length) continue;
      const m = new THREE.Mesh(
        mergeParts(coneParts[gi]),
        new THREE.MeshLambertMaterial({ map: stripeTexs[gi] }),
      );
      m.castShadow = true;
      group.add(m);
    }
    // towels: bright flat rectangles on the sand
    const towelCols = [0xe84393, 0x0984e3, 0xfdcb6e, 0xe17055];
    const towelGeo = new THREE.PlaneGeometry(1.9, 0.95);
    towelGeo.rotateX(-Math.PI / 2); // lie flat; spin about Y per towel
    const towelParts = [[], [], [], []];
    for (let i = 0; i < 24; i++) {
      const x = 30 + beachRng() * 660;
      const z = 652 + beachRng() * 26;
      if (x > 570 && x < 630) continue;
      towelParts[i % 4].push({ geo: towelGeo, matrix: xform(x, 0.08, z, 0, beachRng() * Math.PI, 0) });
    }
    for (let gi = 0; gi < 4; gi++) {
      if (!towelParts[gi].length) continue;
      const m = new THREE.Mesh(
        mergeParts(towelParts[gi]),
        new THREE.MeshLambertMaterial({ color: towelCols[gi] }),
      );
      m.receiveShadow = true;
      group.add(m);
    }
    // loungers: low white beds with a raised headrest
    const bedGeo = new THREE.BoxGeometry(1.9, 0.3, 0.7);
    const restGeo = new THREE.BoxGeometry(0.7, 0.28, 0.66);
    const bedParts = [];
    const restParts = [];
    for (let i = 0; i < 10; i++) {
      const x = 40 + beachRng() * 640;
      const z = 654 + beachRng() * 24;
      if (x > 570 && x < 630) continue;
      const ry = beachRng() * Math.PI;
      bedParts.push({ geo: bedGeo, matrix: xform(x, 0.18, z, 0, ry, 0) });
      restParts.push({ geo: restGeo, matrix: xform(x + Math.cos(ry) * 0.6, 0.42, z - Math.sin(ry) * 0.6, 0, ry, -0.5) });
    }
    const loungerMat = new THREE.MeshLambertMaterial({ color: 0xf5f6fa });
    const bedMesh = new THREE.Mesh(mergeParts(bedParts), loungerMat);
    bedMesh.castShadow = true;
    group.add(bedMesh);
    group.add(new THREE.Mesh(mergeParts(restParts), loungerMat));
  }

  // --- buildings, one or more per block
  // Shopfront signs: our own shop names on ground-floor faces, facing the
  // nearest street. A separate seeded stream, so the building layout is
  // byte-identical to before this polish pass.
  const SHOPS = [
    ['TACO SOL', '#d94f2b'], ['LAUNDRY', '#2e6fb0'], ['PAWN SHOP', '#b03a2e'],
    ['GYM', '#7d3c98'], ['CAFÉ MAR', '#1e8449'], ['BURGER', '#b7950b'],
    ['PHARMACY', '#148f77'], ['BAR', '#5d3a1a'],
  ];
  const signTexs = SHOPS.map(([name, bg]) => makeSignTexture(name, bg));
  const signRng = mulberry32(seed + 777);
  const signRng2 = mulberry32(seed + 778);
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
        // ground-floor shopfront: a sign band on the face nearest a street.
        // Low blocks draw from the original stream (their signs are
        // unchanged); taller buildings draw from a second stream, so the
        // towers flanking the staged routes get shopfronts too.
        const sRng = stories <= 2 ? signRng : signRng2;
        if (sRng() < 0.5) {
          const si = Math.floor(sRng() * SHOPS.length);
          const sw = Math.min(w * 0.7, 9);
          const sh = sw * 0.1875;
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(sw, sh),
            new THREE.MeshLambertMaterial({ map: signTexs[si] }),
          );
          const dw = x - w / 2 - bx * PITCH;
          const de = (bx + 1) * PITCH - (x + w / 2);
          const dn = z - d / 2 - bz * PITCH;
          const ds = (bz + 1) * PITCH - (z + d / 2);
          const sy = 2.5;
          const m = Math.min(dw, de, dn, ds);
          if (m === ds) sign.position.set(x, sy, z + d / 2 + 0.08);
          else if (m === dn) { sign.position.set(x, sy, z - d / 2 - 0.08); sign.rotation.y = Math.PI; }
          else if (m === de) { sign.position.set(x + w / 2 + 0.08, sy, z); sign.rotation.y = Math.PI / 2; }
          else { sign.position.set(x - w / 2 - 0.08, sy, z); sign.rotation.y = -Math.PI / 2; }
          group.add(sign);
        }
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

  // --- traffic lights at eight junctions on the staged routes: a gantry
  // pole + arm over the road, signal box with red/green lamps on all four
  // faces. Purely visual — they never stop traffic or the autopilot.
  // Two phase groups alternate so the city doesn't switch in unison.
  // Lamps cycle on game.elapsed (deterministic), see updateLights below.
  const lightSpots = [
    [80, 160], [160, 320], [320, 320], [320, 480],
    [480, 400], [240, 480], [560, 560], [560, 640],
  ];
  const housingParts = [];
  const lampRedA = [];
  const lampGreenA = [];
  const lampRedB = [];
  const lampGreenB = [];
  const poleGeo = new THREE.CylinderGeometry(0.11, 0.14, 6.4, 6);
  const armGeo = new THREE.BoxGeometry(0.18, 0.18, 8.6);
  const houseGeo = new THREE.BoxGeometry(0.5, 1.15, 0.5);
  const lampGeo = new THREE.SphereGeometry(0.17, 8, 6);
  lightSpots.forEach(([jx, jz], li) => {
    const px = jx + 8.5;
    const pz = jz - 8.5;
    housingParts.push({ geo: poleGeo, matrix: xform(px, 3.2, pz) });
    housingParts.push({ geo: armGeo, matrix: xform(px, 6.3, pz + 4.3) });
    const hx = px;
    const hz = jz - 0.4;
    housingParts.push({ geo: houseGeo, matrix: xform(hx, 5.5, hz) });
    const reds = li % 2 === 0 ? lampRedA : lampRedB;
    const greens = li % 2 === 0 ? lampGreenA : lampGreenB;
    for (const [lx, lz] of [[-0.27, 0], [0.27, 0], [0, -0.27], [0, 0.27]]) {
      reds.push({ geo: lampGeo, matrix: xform(hx + lx, 5.78, hz + lz) });
      greens.push({ geo: lampGeo, matrix: xform(hx + lx, 5.22, hz + lz) });
    }
  });
  group.add(new THREE.Mesh(
    mergeParts(housingParts),
    new THREE.MeshLambertMaterial({ color: 0x2f3542 }),
  ));
  const lampMatRedA = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const lampMatGreenA = new THREE.MeshBasicMaterial({ color: 0x0d2a12 });
  const lampMatRedB = new THREE.MeshBasicMaterial({ color: 0x3a0d0d });
  const lampMatGreenB = new THREE.MeshBasicMaterial({ color: 0x2aff5a });
  for (const [geo, mat] of [
    [mergeParts(lampRedA), lampMatRedA],
    [mergeParts(lampGreenA), lampMatGreenA],
    [mergeParts(lampRedB), lampMatRedB],
    [mergeParts(lampGreenB), lampMatGreenB],
  ]) {
    group.add(new THREE.Mesh(geo, mat));
  }
  // 16 s cycle, red 8 s / green 8 s, group B offset by half a period.
  function updateLights(elapsed) {
    const a = elapsed % 16 < 8;
    lampMatRedA.color.setHex(a ? 0xff2a1a : 0x3a0d0d);
    lampMatGreenA.color.setHex(a ? 0x0d2a12 : 0x2aff5a);
    const b = (elapsed + 8) % 16 < 8;
    lampMatRedB.color.setHex(b ? 0xff2a1a : 0x3a0d0d);
    lampMatGreenB.color.setHex(b ? 0x0d2a12 : 0x2aff5a);
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
    update: updateLights,
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
