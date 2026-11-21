// The people of Palmera Bay: low-poly figures built from boxes — shirt, trousers,
// head, and arms and legs that swing as they walk. Sidewalk wanderers stroll between
// corners and flee from danger; the warehouse crew advance and shoot back in the
// finale; officers run Rio down when the story calls for them.
import * as THREE from 'three';
import { range, pick } from './random.js';
import { AVENUES_X, STREETS_Z, ROAD_W, collideCircle } from './city.js';

const SHIRTS = [0xe2543e, 0x3e7cb1, 0xf2f2f2, 0x59a96a, 0xe8b93e, 0xd1607a, 0x2ea8a0, 0x744a9e];
const PANTS = [0x2b3a55, 0x4a3728, 0x222226, 0x707880, 0x7a4a2e];
const SKINS = [0xf2c79b, 0xc68863, 0x8a5a3b, 0xffdbac];

/** Build one figure. Returns the group plus its swinging limb pivots. */
export function makePerson(random, opts = {}) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: opts.shirt ?? pick(random, SHIRTS), roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: opts.pants ?? pick(random, PANTS), roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: pick(random, SKINS), roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.06;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.4), skin);
  head.position.y = 1.66;
  head.castShadow = true;
  group.add(head);
  if (opts.cap) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46),
      new THREE.MeshStandardMaterial({ color: opts.cap, roughness: 0.8 }));
    cap.position.y = 1.9;
    group.add(cap);
  }
  const limb = (mat, w, h) => {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    mesh.position.y = -h / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    return pivot;
  };
  const armL = limb(shirt, 0.18, 0.66); armL.position.set(-0.42, 1.38, 0);
  const armR = limb(shirt, 0.18, 0.66); armR.position.set(0.42, 1.38, 0);
  const legL = limb(pants, 0.22, 0.72); legL.position.set(-0.16, 0.72, 0);
  const legR = limb(pants, 0.22, 0.72); legR.position.set(0.16, 0.72, 0);
  group.add(armL, armR, legL, legR);
  return { group, armL, armR, legL, legR, walkPhase: Math.random() * 6 };
}

/** Swing a figure's limbs for its speed; lay it flat when it is down. */
export function animatePerson(person, dt, speed) {
  if (person.dead) {
    person.group.rotation.x = -Math.PI / 2;
    person.group.position.y = 0.25;
    return;
  }
  person.walkPhase += dt * (4 + speed * 2.2);
  const swing = Math.min(0.75, speed * 0.16) * Math.sin(person.walkPhase);
  person.armL.rotation.x = swing;
  person.armR.rotation.x = -swing;
  person.legL.rotation.x = -swing;
  person.legR.rotation.x = swing;
}

/** A random point on a sidewalk, just off a random road. */
export function sidewalkPoint(random) {
  if (random() < 0.5) {
    const x = pick(random, AVENUES_X) + (random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 2.2);
    return { x, z: range(random, -225, 225) };
  }
  const z = pick(random, STREETS_Z) + (random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 2.2);
  return { x: range(random, -300, 270), z };
}

/** Create one pedestrian: a body plus its walking state. */
export function createPedestrian(scene, random, opts = {}) {
  const body = makePerson(random, opts);
  const start = opts.at || sidewalkPoint(random);
  body.group.position.set(start.x, 0, start.z);
  scene.add(body.group);
  return {
    ...body,
    target: sidewalkPoint(random), speed: 0, baseSpeed: range(random, 1.1, 1.9),
    health: 30, dead: false, hostile: !!opts.hostile, cop: !!opts.cop,
    shootCd: range(random, 0.4, 1.4),
  };
}

/**
 * Move every pedestrian one step. `danger` is the {x, z} of gunfire or a fast car
 * (or null); `playerPos` is who hostiles and officers close on when engaged.
 */
export function stepPedestrians(peds, dt, random, colliders, danger, playerPos, engaged) {
  for (const ped of peds) {
    if (ped.dead) { animatePerson(ped, dt, 0); continue; }
    const p = ped.group.position;
    let tx = ped.target.x, tz = ped.target.z, speed = ped.baseSpeed;
    const dangerD = danger ? Math.hypot(p.x - danger.x, p.z - danger.z) : 999;
    if (ped.hostile && engaged && playerPos) {
      const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      if (d > 16) { tx = playerPos.x; tz = playerPos.z; speed = 3.4; }
      else { tx = p.x; tz = p.z; speed = 0; }
    } else if (ped.cop && playerPos) {
      tx = playerPos.x; tz = playerPos.z; speed = 4.4;
    } else if (dangerD < 17) {
      tx = p.x + (p.x - danger.x) * 3;
      tz = p.z + (p.z - danger.z) * 3;
      speed = 5.2;
    } else if (Math.hypot(p.x - tx, p.z - tz) < 2.5) {
      ped.target = sidewalkPoint(random);
      tx = ped.target.x; tz = ped.target.z;
    }
    const dx = tx - p.x, dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.2 && speed > 0) {
      p.x += (dx / dist) * speed * dt;
      p.z += (dz / dist) * speed * dt;
      ped.group.rotation.y = Math.atan2(dx, dz);
    }
    collideCircle(p, 0.55, colliders);
    ped.speed = speed;
    animatePerson(ped, dt, speed);
  }
}
