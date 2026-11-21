// Palmera Bay itself: the road grid with sidewalks and crosswalks, city blocks with
// varied buildings (parapets, rooftop tanks, awnings, 3D sign boards, lit windows),
// parks with paths and benches, the sand beach with umbrellas, the boardwalk, the
// marina pier with moored sailboats and bobbing buoys, and the ocean beyond.
// Everything is generated in code from canvas textures — no image files, no downloads.
import * as THREE from 'three';
import { range, intRange, pick } from './random.js';

/** Avenues run north–south (constant x); streets run east–west (constant z). */
export const AVENUES_X = [-250, -125, 0, 125, 250];
export const STREETS_Z = [-170, -55, 60, 175];
export const ROAD_W = 20;
export const WORLD = { minX: -320, maxX: 330, minZ: -240, maxZ: 240 };
export const BEACH_X = 282;
export const CLINIC_POS = { x: -6, z: -78 };
export const GARAGE_POS = { x: -190, z: -112 };
export const WAREHOUSE_POS = { x: -196, z: 116 };
export const PIER_POS = { x: 306, z: 60 };

const DISTRICTS = [
  { name: 'Solano Yards', test: (x, z) => x < -125 && z < 0 },
  { name: 'Old Market', test: (x, z) => x < -125 && z >= 0 },
  { name: 'Downtown Palmera', test: (x, z) => x < 125 && z < 60 },
  { name: 'Coral Heights', test: (x, z) => x < 125 && z >= 60 },
  { name: 'Marina Palms', test: (x, z) => x < BEACH_X && z < 60 },
  { name: 'Loma Beach', test: () => true },
];
export function districtAt(x, z) {
  for (const d of DISTRICTS) if (d.test(x, z)) return d.name;
  return 'Palmera Bay';
}

/** Push a circle (pos.x, pos.z, radius) out of every building AABB; returns pos. */
export function collideCircle(pos, radius, colliders) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        const left = pos.x - c.minX, right = c.maxX - pos.x;
        const top = pos.z - c.minZ, bot = c.maxZ - pos.z;
        const m = Math.min(left, right, top, bot);
        if (m === left) pos.x = c.minX - radius;
        else if (m === right) pos.x = c.maxX + radius;
        else if (m === top) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  pos.x = Math.max(WORLD.minX, Math.min(WORLD.maxX, pos.x));
  pos.z = Math.max(WORLD.minZ, Math.min(WORLD.maxZ, pos.z));
  return pos;
}

// ---------- procedural canvas textures ----------
function windowTexture(random, base, litRatio) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, 0, 64, 7); // a shadow line under the roof
  for (let y = 8; y < 120; y += 11) {
    for (let x = 5; x < 56; x += 11) {
      g.fillStyle = random() < litRatio ? '#ffd98a' : 'rgba(18,24,36,0.88)';
      g.fillRect(x, y, 7, 7);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function signTexture(text, bg, fg) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 48;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 48);
  g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(3, 3, 250, 42);
  g.fillStyle = fg; g.font = 'bold 25px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 25);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roadTexture(horizontal) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#33333c'; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 130; i++) { // asphalt speckle
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 64, Math.random() * 64, 1.4, 1.4);
  }
  g.fillStyle = '#e8e4da';
  if (horizontal) {
    g.fillRect(0, 2, 64, 2); g.fillRect(0, 60, 64, 2);
    g.fillStyle = '#f7c948'; g.fillRect(2, 31, 26, 2); // one centre dash per tile
  } else {
    g.fillRect(2, 0, 2, 64); g.fillRect(60, 0, 2, 64);
    g.fillStyle = '#f7c948'; g.fillRect(31, 2, 2, 26);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function crosswalkTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(238,236,228,0.92)';
  for (let i = 0; i < 5; i++) { // stripes across the top and bottom (crossing the avenue)
    g.fillRect(10 + i * 23, 2, 12, 20);
    g.fillRect(10 + i * 23, 106, 12, 20);
    g.fillRect(2, 10 + i * 23, 20, 12); // and across the left and right (crossing the street)
    g.fillRect(106, 10 + i * 23, 20, 12);
  }
  g.fillRect(30, 27, 68, 3); g.fillRect(30, 98, 68, 3); // stop lines
  g.fillRect(27, 30, 3, 68); g.fillRect(98, 30, 3, 68);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function stallTexture() { // parking-lot asphalt with painted stall lines
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#4c4c55'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(240,238,230,0.75)'; g.lineWidth = 2;
  for (let x = 6; x < 128; x += 24) {
    g.beginPath(); g.moveTo(x, 4); g.lineTo(x, 44); g.stroke();
    g.beginPath(); g.moveTo(x, 84); g.lineTo(x, 124); g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function awningTexture(colorA, colorB) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 16;
  const g = cv.getContext('2d');
  for (let x = 0; x < 64; x += 16) {
    g.fillStyle = colorA; g.fillRect(x, 0, 8, 16);
    g.fillStyle = colorB; g.fillRect(x + 8, 0, 8, 16);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- shared prop builders ----------
const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6844, roughness: 1 });
const palmLeafMat = new THREE.MeshStandardMaterial({ color: 0x2e9e5b, roughness: 1, side: THREE.DoubleSide });
const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.4, 5);
const frondGeo = new THREE.BoxGeometry(3.6, 0.06, 0.7);
export function makePalm(random) {
  const palm = new THREE.Group();
  const trunk = new THREE.Mesh(trunkGeo, palmTrunkMat);
  trunk.position.y = 2.7;
  trunk.rotation.z = range(random, -0.08, 0.08);
  trunk.castShadow = true;
  palm.add(trunk);
  for (let i = 0; i < 6; i++) {
    const frond = new THREE.Mesh(frondGeo, palmLeafMat);
    const a = (i / 6) * Math.PI * 2;
    frond.position.set(Math.cos(a) * 1.4, 5.6, Math.sin(a) * 1.4);
    frond.rotation.y = -a;
    frond.rotation.z = -0.5;
    frond.castShadow = true;
    palm.add(frond);
  }
  return palm;
}

const benchWood = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9 });
const benchIron = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.6, metalness: 0.5 });
function makeBench() {
  const b = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.55), benchWood);
  seat.position.y = 0.55; seat.castShadow = true;
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 0.09), benchWood);
  back.position.set(0, 0.95, -0.27); back.rotation.x = -0.16;
  b.add(seat, back);
  for (const sx of [-0.8, 0.8]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.55, 0.5), benchIron);
    leg.position.set(sx, 0.27, 0);
    b.add(leg);
  }
  return b;
}

const dumpsterMat = new THREE.MeshStandardMaterial({ color: 0x2e5d43, roughness: 0.8, metalness: 0.25 });
function makeDumpster() {
  const d = new THREE.Group();
  const bin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.25, 1.15), dumpsterMat);
  bin.position.y = 0.68; bin.castShadow = true;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.09, 1.25),
    new THREE.MeshStandardMaterial({ color: 0x24493a, roughness: 0.8 }));
  lid.position.y = 1.35; lid.rotation.z = 0.03;
  d.add(bin, lid);
  return d;
}

const hullColors = [0xe8e2d4, 0x3e7cb1, 0xd94f30, 0x2ea8a0, 0xe8b93e, 0xf2f2f2];
function makeBoat(random) {
  const boat = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: pick(random, hullColors), roughness: 0.45, metalness: 0.15 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.85, 5.6), paint);
  hull.position.y = 0.45; hull.castShadow = true;
  const bow = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.8, 1.5), paint);
  bow.position.set(0, 0.45, 3.3); bow.rotation.y = Math.PI / 4;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.6, 1.7),
    new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.6 }));
  cabin.position.set(0, 1.1, -0.7);
  boat.add(hull, bow, cabin);
  if (random() < 0.75) { // most boats carry a mast and a furled sail triangle
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 6.6, 5),
      new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.6, roughness: 0.4 }));
    mast.position.set(0, 4, 0.9);
    boat.add(mast);
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, 1.1, 1.05, 0, 6.6, 0.95, 0, 1.2, 3.1,
    ]), 3));
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({
      color: 0xfdf6e3, roughness: 0.9, side: THREE.DoubleSide }));
    boat.add(sail);
  }
  return boat;
}

/** Build the whole city into `scene`. Returns colliders, parking spots and animated bits. */
export function buildCity(scene, random) {
  const colliders = [];
  const parkedSpots = [];
  const bobbers = [];
  const group = new THREE.Group();
  scene.add(group);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const flat = (w, d, mat, x, z, y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // ---- ground layers: city concrete, sand, ocean ----
  flat(WORLD.maxX - WORLD.minX, WORLD.maxZ - WORLD.minZ,
    new THREE.MeshStandardMaterial({ color: 0x6e685e, roughness: 1 }),
    (WORLD.minX + WORLD.maxX) / 2, 0, 0);
  flat(96, 500, new THREE.MeshStandardMaterial({ color: 0xe9d09c, roughness: 1 }), BEACH_X + 48, 0, 0.015);

  const oceanCv = document.createElement('canvas');
  oceanCv.width = 128; oceanCv.height = 128;
  const og = oceanCv.getContext('2d');
  og.fillStyle = '#1b7f8e'; og.fillRect(0, 0, 128, 128);
  og.strokeStyle = 'rgba(170,242,238,0.26)'; og.lineWidth = 3;
  for (let i = 0; i < 8; i++) { og.beginPath(); og.moveTo(0, i * 18 + 6); og.lineTo(128, i * 18); og.stroke(); }
  const oceanTex = new THREE.CanvasTexture(oceanCv);
  oceanTex.wrapS = oceanTex.wrapT = THREE.RepeatWrapping;
  oceanTex.repeat.set(10, 12);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(430, 620),
    new THREE.MeshStandardMaterial({ map: oceanTex, color: 0xaadfe4, roughness: 0.3, metalness: 0.12 }));
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(BEACH_X + 46 + 215, 0.05, 0);
  group.add(ocean);

  // ---- roads, sidewalks, crosswalks ----
  const walkMat = new THREE.MeshStandardMaterial({ color: 0x9d968a, roughness: 1 });
  const roadTexV = roadTexture(false);
  for (const x of AVENUES_X) {
    const tex = roadTexV.clone(); tex.needsUpdate = true; tex.repeat.set(1, 26);
    flat(ROAD_W, 470, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), x, 0, 0.04);
    flat(3.6, 470, walkMat, x - ROAD_W / 2 - 1.8, 0, 0.03);
    flat(3.6, 470, walkMat, x + ROAD_W / 2 + 1.8, 0, 0.03);
  }
  const roadTexH = roadTexture(true);
  for (const z of STREETS_Z) {
    const tex = roadTexH.clone(); tex.needsUpdate = true; tex.repeat.set(34, 1);
    flat(600, ROAD_W, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), -15, z, 0.04);
    flat(600, 3.6, walkMat, -15, z - ROAD_W / 2 - 1.8, 0.031);
    flat(600, 3.6, walkMat, -15, z + ROAD_W / 2 + 1.8, 0.031);
  }
  const cwTex = crosswalkTexture();
  const cwMat = new THREE.MeshStandardMaterial({ map: cwTex, transparent: true, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 });
  for (const x of AVENUES_X) for (const z of STREETS_Z) flat(27, 27, cwMat, x, z, 0.05);

  // ---- the blocks between the roads ----
  const bases = ['#c96f4a', '#b8b0a4', '#7fa3b8', '#d9a05b', '#a45a6e', '#8d9b6a', '#c2c8ce', '#e0b48c', '#9a7fb8', '#5f8f7a'];
  const textures = bases.map((b) => windowTexture(random, b, range(random, 0.35, 0.55)));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a423c, roughness: 1 });
  const awnings = [awningTexture('#2ea8a0', '#f4efe4'), awningTexture('#d94f30', '#f4efe4'), awningTexture('#e8b93e', '#7a4a2e')];
  const xSegs = [[-312, -264], [-236, -139], [-111, -14], [14, 111], [139, 236], [264, 278]];
  const zSegs = [[-232, -184], [-156, -69], [-41, 46], [74, 161], [189, 232]];
  const signDefs = [
    { at: [2, 1], text: 'HOTEL SOL', bg: '#20304a', fg: '#ffd75e' },
    { at: [3, 2], text: 'BANCO AZUL', bg: '#123a5e', fg: '#ffffff' },
    { at: [1, 3], text: 'MERCADO', bg: '#5e2f12', fg: '#ffe9c9' },
    { at: [4, 1], text: 'GYM 24', bg: '#222222', fg: '#57e389' },
    { at: [0, 2], text: 'CAFÉ MAR', bg: '#5e1230', fg: '#ffd98a' },
    { at: [5, 3], text: 'PIZZERÍA LOMA', bg: '#7a1f16', fg: '#ffe9c9' },
    { at: [3, 0], text: 'FARMACIA', bg: '#14532d', fg: '#a7f3c9' },
    { at: [2, 4], text: 'CINE PALMERA', bg: '#33124a', fg: '#ff9ec6' },
  ];
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x9c6b52, roughness: 0.9 });
  const acMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.7, metalness: 0.35 });

  for (let xi = 0; xi < xSegs.length; xi++) {
    for (let zi = 0; zi < zSegs.length; zi++) {
      const [x0, x1] = xSegs[xi], [z0, z1] = zSegs[zi];
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const isGarage = Math.abs(cx - GARAGE_POS.x) < 60 && Math.abs(cz - GARAGE_POS.z) < 60;
      const isWarehouse = Math.abs(cx - WAREHOUSE_POS.x) < 60 && Math.abs(cz - WAREHOUSE_POS.z) < 60;

      if (isWarehouse) {
        const wh = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x9c6b52, roughness: 0.9 }));
        wh.scale.set(64, 13, 40); wh.position.set(cx - 6, 6.5, cz - 18);
        wh.castShadow = wh.receiveShadow = true;
        group.add(wh);
        colliders.push({ minX: cx - 38, maxX: cx + 26, minZ: cz - 38, maxZ: cz + 2 });
        const sign = new THREE.Mesh(new THREE.BoxGeometry(30, 5.4, 0.7),
          [tankMat, tankMat, tankMat, tankMat,
           new THREE.MeshBasicMaterial({ map: signTexture('SOLANO STORAGE', '#33241a', '#ffd75e') }), tankMat]);
        sign.position.set(cx - 6, 10.4, cz + 2.4);
        group.add(sign);
        for (let i = 0; i < 7; i++) { // the yard: crates, barrels and a dumpster to fight around
          const crate = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xa9803e, roughness: 1 }));
          crate.scale.set(2.4, 2.4, 2.4);
          crate.position.set(cx - 34 + i * 9.5, 1.2, cz + 24 + (i % 2) * 5);
          crate.castShadow = true;
          group.add(crate);
          colliders.push({ minX: crate.position.x - 1.2, maxX: crate.position.x + 1.2, minZ: crate.position.z - 1.2, maxZ: crate.position.z + 1.2 });
          if (i % 3 === 0) {
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 1.5, 9),
              new THREE.MeshStandardMaterial({ color: 0x3e7cb1, roughness: 0.6, metalness: 0.3 }));
            barrel.position.set(crate.position.x + 2.4, 0.75, crate.position.z + 1.5);
            barrel.castShadow = true;
            group.add(barrel);
            colliders.push({ minX: barrel.position.x - 0.7, maxX: barrel.position.x + 0.7, minZ: barrel.position.z - 0.7, maxZ: barrel.position.z + 0.7 });
          }
        }
        const dump = makeDumpster();
        dump.position.set(cx + 22, 0, cz + 20);
        group.add(dump);
        colliders.push({ minX: cx + 20.8, maxX: cx + 23.2, minZ: cz + 19.4, maxZ: cz + 20.6 });
        continue;
      }

      if (isGarage) {
        const lotTex = stallTexture(); lotTex.repeat.set(4, 3);
        flat(x1 - x0, z1 - z0, new THREE.MeshStandardMaterial({ map: lotTex, roughness: 1 }), cx, cz, 0.03);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6.5, 6),
          new THREE.MeshStandardMaterial({ color: 0x555560 }));
        pole.position.set(cx, 3.25, z0 + 2);
        const sign = new THREE.Mesh(new THREE.BoxGeometry(24, 4.6, 0.6),
          [tankMat, tankMat, tankMat, tankMat,
           new THREE.MeshBasicMaterial({ map: signTexture('SOLANO GARAGE', '#402020', '#ff8a5c') }), tankMat]);
        sign.position.set(cx, 6.2, z0 + 2); sign.rotation.y = Math.PI; // face the street to the north
        group.add(pole, sign);
        const dump = makeDumpster();
        dump.position.set(cx - 30, 0, cz - 20); dump.rotation.y = 0.4;
        group.add(dump);
        for (let i = 0; i < 4; i++) parkedSpots.push({ x: cx - 24 + i * 15, z: cz + 8, angle: 0 });
        continue;
      }

      const roll = random();
      if (roll < 0.15) { // a park: grass, crossing paths, benches, palms, planters
        flat(x1 - x0, z1 - z0, new THREE.MeshStandardMaterial({ color: 0x5da24f, roughness: 1 }), cx, cz, 0.03);
        const pathMat = new THREE.MeshStandardMaterial({ color: 0xd8c9a3, roughness: 1 });
        flat(x1 - x0, 3.4, pathMat, cx, cz, 0.045);
        flat(3.4, z1 - z0, pathMat, cx, cz, 0.045);
        for (let i = 0; i < 5; i++) {
          const palm = makePalm(random);
          palm.position.set(range(random, x0 + 7, x1 - 7), 0, range(random, z0 + 7, z1 - 7));
          group.add(palm);
        }
        for (const [bx, bz, ry] of [[cx - 8, cz + 3.4, 0], [cx + 9, cz - 3.4, Math.PI], [cx + 3.4, cz + 10, Math.PI / 2]]) {
          const bench = makeBench();
          bench.position.set(bx, 0, bz); bench.rotation.y = ry;
          group.add(bench);
        }
        continue;
      }
      if (roll < 0.27) { // a parking lot full of stealable cars
        const lotTex = stallTexture(); lotTex.repeat.set(4, 3);
        flat(x1 - x0, z1 - z0, new THREE.MeshStandardMaterial({ map: lotTex, roughness: 1 }), cx, cz, 0.03);
        const n = intRange(random, 3, 5);
        for (let i = 0; i < n; i++) parkedSpots.push({ x: x0 + 12 + i * 14, z: cz, angle: Math.PI / 2 });
        continue;
      }

      // ordinary blocks: one or two buildings with real variety
      const count = (x1 - x0) > 80 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const w = range(random, 26, 40), d = range(random, 26, 40);
        let h = range(random, 13, 46) * (xi === 2 || xi === 3 ? 1.4 : 1);
        if (xi === 5) h = range(random, 9, 16); // low marina row
        const bx = count === 1 ? cx : x0 + (x1 - x0) * (0.27 + 0.46 * i);
        const bz = cz + range(random, -6, 6);
        const tex = pick(random, textures);
        const side = new THREE.MeshStandardMaterial({
          map: tex, emissive: 0xffbe78, emissiveMap: tex, emissiveIntensity: range(random, 0.3, 0.48), roughness: 0.9 });
        const b = new THREE.Mesh(boxGeo, [side, side, roofMat, roofMat, side, side]);
        b.scale.set(w, h, d);
        b.position.set(bx, h / 2, bz);
        b.castShadow = b.receiveShadow = true;
        group.add(b);
        colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
        // parapet rim, slightly wider than the tower, in a darkened trim
        const parapet = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x5c5148, roughness: 1 }));
        parapet.scale.set(w + 0.8, 0.9, d + 0.8);
        parapet.position.set(bx, h + 0.3, bz);
        group.add(parapet);
        // rooftop dressing: a water tank, or a cluster of AC units
        if (random() < 0.42) {
          const tank = new THREE.Group();
          const body = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 3.4, 9), tankMat);
          body.position.y = 1.7; body.castShadow = true;
          const cap = new THREE.Mesh(new THREE.ConeGeometry(2, 1.2, 9), roofMat);
          cap.position.y = 4;
          tank.add(body, cap);
          tank.position.set(bx + range(random, -w / 4, w / 4), h + 0.7, bz + range(random, -d / 4, d / 4));
          group.add(tank);
        } else {
          const n = intRange(random, 1, 3);
          for (let j = 0; j < n; j++) {
            const ac = new THREE.Mesh(boxGeo, acMat);
            ac.scale.set(range(random, 1.6, 2.8), 0.9, range(random, 1.4, 2.2));
            ac.position.set(bx + range(random, -w / 3, w / 3), h + 0.75, bz + range(random, -d / 3, d / 3));
            ac.castShadow = true;
            group.add(ac);
          }
        }
        // a striped awning over the ground floor, facing the nearest street
        if (random() < 0.6) {
          const faceSouth = (cz > bz) || Math.abs(bz - 60) < Math.abs(bz + 55);
          const awn = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w * 0.72, 17), 0.16, 2.7),
            new THREE.MeshStandardMaterial({ map: pick(random, awnings), roughness: 0.9 }));
          awn.position.set(bx, 3.15, bz + (faceSouth ? d / 2 + 1.15 : -d / 2 - 1.15));
          awn.rotation.x = faceSouth ? 0.42 : -0.42;
          awn.castShadow = true;
          group.add(awn);
        }
        // a proper 3D sign board for the named businesses
        const signDef = signDefs.find((s) => s.at[0] === xi && s.at[1] === zi);
        if (signDef && i === 0) {
          const board = new THREE.Mesh(new THREE.BoxGeometry(19, 3.6, 0.7),
            [tankMat, tankMat, tankMat, tankMat,
             new THREE.MeshBasicMaterial({ map: signTexture(signDef.text, signDef.bg, signDef.fg) }), tankMat]);
          board.position.set(bx, h * 0.74, bz + d / 2 + 0.4);
          group.add(board);
        }
      }
    }
  }

  // ---- the clinic: Rio's respawn point ----
  const clinic = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.8 }));
  clinic.scale.set(22, 9, 14);
  clinic.position.set(CLINIC_POS.x - 16, 4.5, CLINIC_POS.z - 16);
  clinic.castShadow = clinic.receiveShadow = true;
  group.add(clinic);
  colliders.push({ minX: clinic.position.x - 11, maxX: clinic.position.x + 11, minZ: clinic.position.z - 7, maxZ: clinic.position.z + 7 });
  const clinicSign = new THREE.Mesh(new THREE.BoxGeometry(17, 3.2, 0.6),
    [tankMat, tankMat, tankMat, tankMat,
     new THREE.MeshBasicMaterial({ map: signTexture('✚ CLÍNICA DEL SOL', '#f2f2f2', '#d23b4e') }), tankMat]);
  clinicSign.position.set(clinic.position.x, 7.4, clinic.position.z + 7.3);
  group.add(clinicSign);

  // ---- palms: beach row, avenue rows ----
  for (let z = -225; z < 235; z += 22) {
    const palm = makePalm(random);
    palm.position.set(BEACH_X + range(random, 3, 13), 0, z + range(random, -4, 4));
    group.add(palm);
  }
  for (const x of AVENUES_X) {
    for (let z = -210; z < 220; z += 55) {
      if (STREETS_Z.some((s) => Math.abs(s - z) < 16)) continue;
      const palm = makePalm(random);
      palm.position.set(x + ROAD_W / 2 + 3.6, 0, z);
      group.add(palm);
    }
  }

  // ---- streetlights along the avenues and the marina street ----
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.7, metalness: 0.4 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffc46b, emissiveIntensity: 1.6 });
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.18, 6.4, 5);
  const headGeo = new THREE.BoxGeometry(1.5, 0.22, 0.5);
  const addLamp = (x, z, flip) => {
    const lamp = new THREE.Group();
    const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.y = 3.2; pole.castShadow = true;
    const head = new THREE.Mesh(headGeo, headMat); head.position.set(flip ? -1 : 1, 6.4, 0);
    lamp.add(pole, head);
    lamp.position.set(x, 0, z);
    group.add(lamp);
  };
  for (const x of AVENUES_X) for (let z = -200; z < 230; z += 64) addLamp(x - ROAD_W / 2 - 1.6, z, false);
  for (let x = -280; x < 275; x += 55) { addLamp(x, 60 - ROAD_W / 2 - 1.6, false); addLamp(x + 27, 60 + ROAD_W / 2 + 1.6, true); }

  // ---- benches and planters where people actually walk ----
  for (let x = -235; x < 272; x += 42) { // the marina promenade
    const bench = makeBench();
    bench.position.set(x + range(random, -3, 3), 0, 47.4);
    group.add(bench);
  }
  const planterMat = new THREE.MeshStandardMaterial({ color: 0x8d8578, roughness: 1 });
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 1 });
  for (const x of [-125, 0, 125]) {
    for (let z = -140; z < 160; z += 60) {
      if (STREETS_Z.some((s) => Math.abs(s - z) < 15)) continue;
      const p = new THREE.Group();
      const pot = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 0.85), planterMat);
      pot.position.y = 0.28;
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.62, 7, 6), bushMat);
      bush.scale.y = 0.75; bush.position.y = 0.85; bush.castShadow = true;
      p.add(pot, bush);
      p.position.set(x + ROAD_W / 2 + 2, 0, z);
      group.add(p);
    }
  }

  // ---- the beach: boardwalk, umbrellas and towels ----
  const boardwalk = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 480),
    new THREE.MeshStandardMaterial({ color: 0xa97c50, roughness: 1 }));
  boardwalk.position.set(BEACH_X + 3, 0.11, 0);
  boardwalk.receiveShadow = true;
  group.add(boardwalk);
  for (let z = -215; z < 225; z += 44) { // benches on the boardwalk, facing the sea
    const bench = makeBench();
    bench.position.set(BEACH_X + 3, 0.22, z + range(random, -6, 6));
    bench.rotation.y = Math.PI / 2;
    group.add(bench);
  }
  const towelColors = [0xd94f30, 0x3e7cb1, 0xe8b93e, 0xd1607a, 0x2ea8a0];
  for (let z = -205; z < 220; z += 34) {
    const ux = BEACH_X + range(random, 15, 38), uz = z + range(random, -7, 7);
    const um = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5), poleMat);
    pole.position.y = 1.15;
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.3, 0.85, 8),
      new THREE.MeshStandardMaterial({ color: pick(random, towelColors), roughness: 0.9 }));
    canopy.position.y = 2.35; canopy.castShadow = true;
    um.add(pole, canopy);
    um.position.set(ux, 0, uz);
    um.rotation.z = range(random, -0.09, 0.09);
    group.add(um);
    const towel = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 2.1),
      new THREE.MeshStandardMaterial({ color: pick(random, towelColors), roughness: 1 }));
    towel.position.set(ux + range(random, 1.5, 3), 0.05, uz + range(random, -1, 1));
    towel.rotation.y = range(random, 0, 3);
    group.add(towel);
  }

  // ---- the pier and the marina ----
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x8a6844, roughness: 1 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(56, 1, 8), pierMat);
  pier.position.set(PIER_POS.x + 18, 0.8, PIER_POS.z);
  pier.castShadow = pier.receiveShadow = true;
  group.add(pier);
  for (let i = 0; i < 7; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.6, 5), pierMat);
    post.position.set(PIER_POS.x - 6 + i * 10, -0.4, PIER_POS.z + 3.4);
    group.add(post);
    const post2 = post.clone(); post2.position.z = PIER_POS.z - 3.4;
    group.add(post2);
    for (const side of [-3.8, 3.8]) { // railing posts along both edges
      const rp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.12), poleMat);
      rp.position.set(PIER_POS.x - 8 + i * 10.5, 1.8, PIER_POS.z + side);
      group.add(rp);
    }
  }
  for (const side of [-3.8, 3.8]) { // the top rails
    const rail = new THREE.Mesh(new THREE.BoxGeometry(64, 0.09, 0.09), poleMat);
    rail.position.set(PIER_POS.x + 18, 2.32, PIER_POS.z + side);
    group.add(rail);
  }
  // two finger docks reaching into the bay, north and south of the pier street
  for (const dz of [-34, 36]) {
    const dock = new THREE.Mesh(new THREE.BoxGeometry(30, 0.8, 3.2), pierMat);
    dock.position.set(BEACH_X + 52, 0.7, 60 + dz);
    dock.receiveShadow = true;
    group.add(dock);
  }
  // moored boats: along the pier, along the docks, one anchored out in the bay
  const moorings = [
    { x: 316, z: 50.5, ry: Math.PI / 2 }, { x: 332, z: 69.5, ry: Math.PI / 2 },
    { x: 300, z: 70, ry: Math.PI / 2 }, { x: 344, z: 49.5, ry: Math.PI / 2 },
    { x: 340, z: 21.5, ry: 0.2 }, { x: 340, z: 31, ry: -0.15 },
    { x: 340, z: 91.5, ry: 0.1 }, { x: 340, z: 101, ry: -0.2 },
    { x: 385, z: 130, ry: 0.7 },
  ];
  for (const m of moorings) {
    const boat = makeBoat(random);
    boat.position.set(m.x, 0.1, m.z);
    boat.rotation.y = m.ry;
    group.add(boat);
    bobbers.push({ obj: boat, phase: range(random, 0, 6.28), amp: 0.1 });
  }
  // channel buoys bobbing out in the water
  const buoyMat = new THREE.MeshStandardMaterial({ color: 0xe2543e, roughness: 0.6 });
  for (const [bx, bz] of [[352, 8], [368, 108], [392, 44], [404, 168], [360, 205]]) {
    const buoy = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.2, 7), buoyMat);
    cone.position.y = 0.5;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), headMat);
    tip.position.y = 1.25;
    buoy.add(cone, tip);
    buoy.position.set(bx, 0, bz);
    group.add(buoy);
    bobbers.push({ obj: buoy, phase: range(random, 0, 6.28), amp: 0.22 });
  }

  return { colliders, parkedSpots, oceanTex, bobbers, group };
}
