// Palmera Bay: Vice Run 3D — the game loop that wires the city, Rio, the cars, the
// crowd, the law, the missions, combat and the save game together. Third-person
// open-world crime in the browser, built on the vendored Three.js engine.
import * as THREE from 'three';
import { makeRandom, pick } from './random.js';
import { buildCity, collideCircle, CLINIC_POS } from './city.js';
import { createCar, placeCar, stepCarPhysics, CAR_COLORS, CORAL } from './vehicles.js';
import { WantedSystem, spawnTraffic, stepTraffic, stepPolice } from './traffic.js';
import { makePerson, animatePerson, createPedestrian, stepPedestrians } from './people.js';
import { MissionChain } from './missions.js';
import { Hud } from './hud.js';
import { SoundBank } from './audio.js';
import { InputState, CameraRig } from './input.js';
import { stageScene } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 7);
const random = makeRandom(seed * 1000 + 17);
const SAVE_KEY = 'palmera-bay-vice-run-3d-save';

// ---------- renderer, scene, golden-hour light ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe9b083, 150, 520);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 2000);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

{ // a gradient sky dome: teal up top melting into sunset peach at the horizon
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 256;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2e6b9e'); grad.addColorStop(0.45, '#7fb2d9');
  grad.addColorStop(0.72, '#f7c489'); grad.addColorStop(0.9, '#ff9e6b'); grad.addColorStop(1, '#e2703a');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(760, 18, 12),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(34, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false }));
  sunDisc.position.set(690, 92, 180);
  sunDisc.lookAt(0, 30, 0);
  scene.add(sunDisc);
}

const hemi = new THREE.HemisphereLight(0xffe3b3, 0x46586a, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb36b, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -95; sun.shadow.camera.right = 95;
sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -95;
sun.shadow.camera.far = 420;
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

// ---------- the world ----------
const city = buildCity(scene, random);
const colliders = city.colliders;

// ---------- Rio ----------
const rio = makePerson(random, { shirt: 0xff7847, pants: 0x2b3a55, cap: 0xd23b4e });
rio.group.position.set(7, 0, 42);
scene.add(rio.group);

// ---------- cars ----------
const allCars = [];
const trafficCars = spawnTraffic(scene, random, 16);
allCars.push(...trafficCars);
for (let i = 0; i < Math.min(12, city.parkedSpots.length); i++) {
  const spot = city.parkedSpots[i];
  const car = createCar(scene, pick(random, CAR_COLORS));
  placeCar(car, spot.x, spot.z, spot.angle);
  car.parked = true;
  allCars.push(car);
}
const coupe = createCar(scene, CORAL, { coupe: true });
placeCar(coupe, 34, 51.5, Math.PI / 2);
coupe.parked = true;
allCars.push(coupe);
const policeCars = [];

// ---------- people ----------
const peds = [];
for (let i = 0; i < 26; i++) peds.push(createPedestrian(scene, random));

// ---------- state ----------
const hud = new Hud();
const sound = new SoundBank();
const input = new InputState(canvas);
const rig = new CameraRig(camera);
const wanted = new WantedSystem();
const missions = new MissionChain(scene);

const G = {
  mode: 'title', paused: false, time: 0, shotName: params.get('shot'),
  health: 100, cash: 250, respect: 0, ammo: 12, reloading: 0,
  playerCar: null, lastDamageAt: -99, fireCd: 0, bustTimer: 0,
  nextMissionAt: 0, endTimer: 0, trafficCars, policeCars, peds, allCars,
  wanted, missions, hud, sound, camera, scene, rio, coupe,
  shotTick: null, startedAt: performance.now(),
};
window.__game = G;
hud.nowFn = () => G.time * 1000;

function playerPos() { return G.playerCar ? G.playerCar.group.position : rio.group.position; }
function playerAngle() { return G.playerCar ? G.playerCar.angle : rio.group.rotation.y; }

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ cash: G.cash, respect: G.respect, missionIndex: missions.index }));
  } catch { /* private mode */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ---------- tracers & muzzle flash ----------
const tracers = [];
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95 });
const enemyTracerMat = new THREE.LineBasicMaterial({ color: 0xff6b5e, transparent: true, opacity: 0.95 });
const flash = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6),
  new THREE.MeshBasicMaterial({ color: 0xffd98a }));
flash.visible = false;
scene.add(flash);
function tracer(from, to, enemy = false) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, enemy ? enemyTracerMat : tracerMat);
  scene.add(line);
  tracers.push({ line, until: G.time + 0.07 });
}

// ---------- the API the mission chain talks to ----------
const api = {
  random,
  get pos() { return playerPos(); },
  get inCar() { return !!G.playerCar; },
  get inCoupe() { return G.playerCar === coupe; },
  get coupePos() { return coupe.group.position; },
  wanted,
  cash(n) { G.cash += n; },
  crime(n) { wanted.addCrime(n); },
  phone(t) { hud.phone(t); },
  banner(h, p) { hud.banner(h, p); },
  pickupSound() { sound.pickup(); },
  missionSound() { sound.mission(); },
  onMissionComplete() { G.respect += 1; saveGame(); G.nextMissionAt = G.time + 3.5; },
  spawnHostiles() { spawnFinaleCrew(); },
  hostilesAlive() { return peds.filter((p) => p.hostile && !p.dead).length; },
};
G.api = api;

function spawnFinaleCrew() {
  for (let i = 0; i < 5; i++) {
    const ped = createPedestrian(scene, random, {
      hostile: true, shirt: 0x22222a, pants: 0x111116,
      at: { x: -214 + i * 9, z: 128 + (i % 2) * 10 },
    });
    ped.health = 60;
    peds.push(ped);
  }
  const car = createCar(scene, 0x22222a);
  placeCar(car, -178, 138, -Math.PI / 3);
  car.parked = true;
  allCars.push(car);
}

// ---------- entering / leaving cars ----------
function nearestCar(maxDist) {
  const p = rio.group.position;
  let best = null, bd = maxDist;
  for (const car of allCars) {
    if (car.dead) continue;
    const d = Math.hypot(car.group.position.x - p.x, car.group.position.z - p.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}
function enterCar(car) {
  G.playerCar = car;
  car.parked = false;
  if (car.traffic) {
    car.traffic = null;
    const i = trafficCars.indexOf(car);
    if (i >= 0) trafficCars.splice(i, 1);
  }
  rio.group.visible = false;
  if (!car.rioOwned) {
    car.rioOwned = true;
    wanted.addCrime(car.police ? 26 : 13); // carjacking is a crime — worse in a patrol car
    hud.banner('CARJACKED', car.police ? 'That was a POLICE car. Bold.' : 'The driver bails — the car is yours');
    sound.horn();
  }
  sound.unlock();
}
function exitCar() {
  const car = G.playerCar;
  if (!car) return;
  const side = { x: Math.cos(car.angle), z: -Math.sin(car.angle) };
  rio.group.position.set(car.group.position.x + side.x * 2.6, 0, car.group.position.z + side.z * 2.6);
  collideCircle(rio.group.position, 0.55, colliders);
  rio.group.visible = true;
  G.playerCar = null;
  sound.engine(-1);
}

// ---------- combat ----------
function shoot() {
  if (G.ammo <= 0) { sound.dryFire(); startReload(); return; }
  G.ammo -= 1;
  sound.shoot();
  const origin = rio.group.position.clone(); origin.y = 1.45;
  const dir = rig.facing();
  flash.position.copy(origin).add(new THREE.Vector3(dir.x * 0.7, 0, dir.z * 0.7));
  flash.visible = true;
  setTimeout(() => { flash.visible = false; }, 45);
  let bestTarget = null, bestDist = 34;
  for (const ped of peds) {
    if (ped.dead) continue;
    const pp = ped.group.position;
    const dx = pp.x - origin.x, dz = pp.z - origin.z;
    const dist = Math.hypot(dx, dz);
    if (dist > bestDist) continue;
    const dot = (dx * dir.x + dz * dir.z) / (dist || 1);
    if (dot > 0.965) { bestTarget = ped; bestDist = dist; }
  }
  const end = bestTarget
    ? bestTarget.group.position.clone().setY(1.2)
    : origin.clone().add(new THREE.Vector3(dir.x * 34, -0.6, dir.z * 34));
  tracer(origin.clone().add(new THREE.Vector3(dir.x * 0.7, 0, dir.z * 0.7)), end);
  wanted.addCrime(7);
  if (bestTarget) {
    bestTarget.health -= 34;
    wanted.addCrime(bestTarget.cop ? 22 : 10);
    if (bestTarget.health <= 0 && !bestTarget.dead) {
      bestTarget.dead = true;
      wanted.addCrime(bestTarget.cop ? 26 : 14);
      G.cash += 20;
      hud.banner('TARGET DOWN', '+ $20 dropped');
    }
  }
  if (G.ammo === 0) startReload();
}
function startReload() {
  if (G.reloading > 0 || G.ammo === 12) return;
  G.reloading = 0.9;
  sound.reload();
}

function damagePlayer(amount) {
  G.health -= amount;
  G.lastDamageAt = G.time;
  sound.hurt();
  if (G.health <= 0 && G.mode === 'play') endRun('WASTED', 'The bay lights fade…');
}
function endRun(kind, text) {
  G.mode = 'end';
  G.endTimer = 2.8;
  hud.endCard(kind, text);
  if (G.playerCar) exitCar();
  wanted.clear();
  for (const car of policeCars) car.speed = 0;
}
function respawn() {
  G.cash = Math.max(0, G.cash - 100);
  G.health = 100;
  rio.group.position.set(CLINIC_POS.x, 0, CLINIC_POS.z);
  rio.group.visible = true;
  hud.hideEndCard();
  hud.banner('CLÍNICA DEL SOL', '- $100 · Patched up. Stay out of trouble.');
  G.mode = 'play';
}

// ---------- starting the game ----------
function startGame(fresh) {
  const save = fresh ? null : loadSave();
  if (save) {
    G.cash = save.cash;
    G.respect = save.respect;
    missions.index = save.missionIndex || 0;
  }
  if (fresh) { G.cash = 250; G.respect = 0; missions.index = 0; saveGame(); }
  G.mode = 'play';
  hud.showGame(!!loadSave());
  hud.banner('PALMERA BAY', missions.storyDone ? 'Free roam — side jobs pay $300' : 'Marisol has work for you');
  G.nextMissionAt = G.time + 1.0;
  sound.unlock();
}
G.startGame = startGame;

// ---------- per-frame updates ----------
function stepOnFoot(dt) {
  const speedBase = input.down('ShiftLeft', 'ShiftRight') ? 8.4 : 5.0;
  let mx = 0, mz = 0;
  const f = rig.facing();
  const r = { x: f.z, z: -f.x };
  if (input.down('KeyW', 'ArrowUp')) { mx += f.x; mz += f.z; }
  if (input.down('KeyS', 'ArrowDown')) { mx -= f.x; mz -= f.z; }
  if (input.down('KeyD', 'ArrowRight')) { mx += r.x; mz += r.z; }
  if (input.down('KeyA', 'ArrowLeft')) { mx -= r.x; mz -= r.z; }
  const len = Math.hypot(mx, mz);
  let speed = 0;
  if (len > 0) {
    mx /= len; mz /= len;
    speed = speedBase;
    rio.group.position.x += mx * speed * dt;
    rio.group.position.z += mz * speed * dt;
    const targetYaw = Math.atan2(mx, mz);
    let gap = targetYaw - rio.group.rotation.y;
    while (gap > Math.PI) gap -= Math.PI * 2;
    while (gap < -Math.PI) gap += Math.PI * 2;
    rio.group.rotation.y += gap * Math.min(1, dt * 14);
  }
  collideCircle(rio.group.position, 0.55, colliders);
  for (const car of allCars) { // cars are solid too
    const cp = car.group.position;
    const d = Math.hypot(cp.x - rio.group.position.x, cp.z - rio.group.position.z);
    if (d < 2.1 && d > 0.01) {
      rio.group.position.x = cp.x + ((rio.group.position.x - cp.x) / d) * 2.1;
      rio.group.position.z = cp.z + ((rio.group.position.z - cp.z) / d) * 2.1;
    }
  }
  animatePerson(rio, dt, speed);
  G.fireCd -= dt;
  if ((input.mouseDown || input.down('KeyJ')) && G.fireCd <= 0) { G.fireCd = 0.24; shoot(); }
  if (input.hit('KeyR')) startReload();
  if (input.hit('KeyE', 'KeyF')) {
    const car = nearestCar(3.6);
    if (car) enterCar(car);
  }
  // busted: the law closes in while Rio is slow on foot
  const nearestPolice = policeCars.length
    ? Math.min(...policeCars.map((c) => Math.hypot(c.group.position.x - rio.group.position.x, c.group.position.z - rio.group.position.z)))
    : 999;
  if (wanted.stars > 0 && nearestPolice < 4.6 && speed < 2) {
    G.bustTimer += dt;
    if (G.bustTimer > 1.6) { G.bustTimer = 0; endRun('BUSTED', 'Caught on the Palmera pavement.'); }
  } else {
    G.bustTimer = Math.max(0, G.bustTimer - dt * 2);
  }
}

function stepDriving(dt) {
  const car = G.playerCar;
  const throttle = input.down('KeyW', 'ArrowUp') ? 1 : input.down('KeyS', 'ArrowDown') ? -1 : 0;
  const steer = input.down('KeyA', 'ArrowLeft') ? 1 : input.down('KeyD', 'ArrowRight') ? -1 : 0;
  const before = Math.abs(car.speed);
  stepCarPhysics(car, dt, { throttle, steer, brake: input.down('Space') }, colliders, car.coupe ? 39 : 34);
  sound.engine(Math.min(1, Math.abs(car.speed) / 30));
  for (const other of allCars) { // car-to-car contact: shove, slow, and consequences
    if (other === car || other.dead) continue;
    const dx = other.group.position.x - car.group.position.x;
    const dz = other.group.position.z - car.group.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.6 && d > 0.01) {
      other.group.position.x += (dx / d) * (3.6 - d) * 0.6;
      other.group.position.z += (dz / d) * (3.6 - d) * 0.6;
      collideCircle(other.group.position, other.radius, colliders);
      if (Math.abs(car.speed) > 8) {
        sound.crash();
        wanted.addCrime(4);
        if (other.police) wanted.addCrime(10);
      }
      car.speed *= 0.55;
      if (other.police) damagePlayer(2.5);
    }
  }
  if (before > 12 && Math.abs(car.speed) < 3) { sound.crash(); damagePlayer(3); } // a wall, hard
  if (input.hit('KeyE', 'KeyF')) exitCar();
}

function stepWorld(dt) {
  stepTraffic(trafficCars, dt, random, colliders, allCars);
  const pp = playerPos();
  const danger = (G.fireCd > 0.12 || (G.playerCar && Math.abs(G.playerCar.speed) > 13)) ? pp : null;
  const finaleEngaged = missions.index === 4 && missions.stage === 1;
  stepPedestrians(peds, dt, random, colliders, danger, pp, finaleEngaged);
  for (const ped of peds) { // hostile return fire, and the grim business of fast cars
    if (ped.dead) continue;
    const p = ped.group.position;
    const d = Math.hypot(p.x - pp.x, p.z - pp.z);
    if (ped.hostile && finaleEngaged) {
      ped.shootCd -= dt;
      if (d < 27 && ped.shootCd <= 0) {
        ped.shootCd = 0.9 + random() * 0.8;
        const from = p.clone(); from.y = 1.35;
        const to = pp.clone(); to.y = 1.2;
        tracer(from, to, true);
        sound.shoot();
        if (random() < 0.55) damagePlayer(3 + random() * 4);
      }
    }
    for (const car of allCars) {
      if (Math.abs(car.speed) > 5) {
        const cd = Math.hypot(p.x - car.group.position.x, p.z - car.group.position.z);
        if (cd < 2.1) {
          ped.dead = true;
          ped.health = 0;
          car.speed *= 0.6;
          sound.crash();
          if (car === G.playerCar) {
            wanted.addCrime(ped.cop ? 34 : 18);
            hud.banner('HIT AND RUN', ped.cop ? 'An OFFICER. The whole bay is coming.' : 'The city saw that.');
          }
        }
      }
    }
  }
  const nearestPolice = stepPolice(policeCars, dt, scene, pp, wanted, colliders, allCars, random);
  const seen = nearestPolice < 58 || peds.some((p) => p.cop && !p.dead &&
    Math.hypot(p.group.position.x - pp.x, p.group.position.z - pp.z) < 30);
  wanted.update(dt, seen, missions.index === 3 && missions.started ? 7.5 : 3.2);
  sound.siren(wanted.stars > 0 ? Math.max(0, 1 - nearestPolice / 90) : 0, G.time);
  if (G.time - G.lastDamageAt > 7 && G.health < 100 && G.mode === 'play') {
    G.health = Math.min(100, G.health + dt * 2.4);
  }
}

function hudState() {
  const pp = playerPos();
  return {
    cash: G.cash, respect: G.respect, health: G.health, stars: wanted.stars,
    driving: !!G.playerCar,
    carName: G.playerCar ? (G.playerCar.police ? 'PATROL CAR' : G.playerCar.coupe ? 'CORAL COUPE' : 'VEHICLE') : '',
    speed: G.playerCar ? G.playerCar.speed : 0, ammo: G.ammo, reloading: G.reloading > 0,
    pos: pp, angle: playerAngle(),
    missionTitle: missions.title || 'FREE ROAM',
    objective: missions.objective || 'Explore Palmera Bay',
    targetPos: missions.targetPos,
    targetDist: missions.targetPos ? Math.hypot(missions.targetPos.x - pp.x, missions.targetPos.z - pp.z) : null,
    policePositions: policeCars.map((c) => c.group.position),
    policeNear: policeCars.some((c) => Math.hypot(c.group.position.x - pp.x, c.group.position.z - pp.z) < 58),
    coupePos: coupe.group.position,
    coupeTaken: G.playerCar === coupe || (!coupe.parked && coupe.rioOwned),
  };
}

// ---------- title screen / screenshot staging ----------
hud.showTitle(!!loadSave());
if (G.shotName) {
  stageScene(G.shotName, G, { startGame, enterCar, exitCar, rio, rig, scene });
} else {
  canvas.addEventListener('mousedown', () => { if (G.mode === 'title') startGame(false); });
}

// ---------- the loop ----------
const clock = new THREE.Clock();
let titleAngle = 0.6;
function frame() {
  requestAnimationFrame(frame);
  const rawDt = Math.min(0.05, clock.getDelta());
  // Screenshot scenes run the same simulation on a faster clock, so a headless
  // software renderer (a few frames a second) still reaches the staged moment.
  const dt = G.shotName ? rawDt * 5 : rawDt;
  G.time += dt;
  if (G.reloading > 0) { G.reloading -= dt; if (G.reloading <= 0) G.ammo = 12; }

  if (input.hit('KeyM')) hud.banner(sound.toggleMute() ? 'SOUND OFF' : 'SOUND ON', '');
  if (G.mode === 'play' && input.hit('Escape', 'KeyP')) { G.paused = !G.paused; hud.setPaused(G.paused); }
  if (G.mode === 'title' && input.hit('KeyN')) startGame(true);
  if (G.mode === 'title' && input.hit('Enter')) startGame(false);

  if (!G.paused) {
    if (G.mode === 'end') {
      G.endTimer -= dt;
      stepWorld(dt);
      if (G.endTimer <= 0) respawn();
    } else if (G.mode === 'play') {
      if (G.playerCar) stepDriving(dt); else stepOnFoot(dt);
      stepWorld(dt);
      if (!missions.started && G.time > G.nextMissionAt && G.nextMissionAt > 0) missions.start(api);
      missions.update(dt, api);
    } else { // title: the ambient city breathes behind the logo
      stepTraffic(trafficCars, dt, random, colliders, allCars);
      stepPedestrians(peds, dt, random, colliders, null, null, false);
    }
  }

  // camera
  const focus = playerPos().clone(); focus.y = 1.4;
  if (G.shotTick) G.shotTick(G.time, dt, G);
  else if (G.mode === 'title') {
    titleAngle += dt * 0.03;
    camera.position.set(Math.sin(titleAngle) * 120, 30, Math.cos(titleAngle) * 120 + 20);
    camera.lookAt(20, 6, 20);
  } else {
    rig.update(dt, focus, G.playerCar ? 'car' : 'foot', input, G.playerCar ? G.playerCar.angle : 0);
  }

  // the sun's shadow box follows the action; the ocean shimmers; the boats ride the swell
  const pp = playerPos();
  sun.position.set(pp.x + 130, 95, pp.z + 55);
  sun.target.position.set(pp.x, 0, pp.z);
  city.oceanTex.offset.x = G.time * 0.008;
  city.oceanTex.offset.y = Math.sin(G.time * 0.4) * 0.01;
  for (const b of city.bobbers) {
    b.obj.position.y = Math.sin(G.time * 0.9 + b.phase) * b.amp;
    b.obj.rotation.z = Math.sin(G.time * 0.7 + b.phase) * 0.03;
  }

  for (let i = tracers.length - 1; i >= 0; i--) {
    if (G.time > tracers[i].until) {
      scene.remove(tracers[i].line);
      tracers[i].line.geometry.dispose();
      tracers.splice(i, 1);
    }
  }

  if (G.mode !== 'title') hud.update(hudState());
  input.endFrame();
  renderer.render(scene, camera);
  window.__frames = (window.__frames || 0) + 1;
  window.__ready = true;
}
frame();
