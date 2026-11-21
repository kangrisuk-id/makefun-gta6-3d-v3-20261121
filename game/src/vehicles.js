// Low-poly cars assembled from boxes, plus the arcade driving model: throttle,
// steering, braking, drag, building collision and spinning wheels. A single factory
// builds traffic cars, parked cars, the coral coupe and police interceptors with
// their flashing lightbars.
import * as THREE from 'three';
import { collideCircle } from './city.js';

const bodyGeo = new THREE.BoxGeometry(2.0, 0.55, 4.3);
const cabinGeo = new THREE.BoxGeometry(1.7, 0.5, 2.1);
const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.9 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x1c2a3a, roughness: 0.25, metalness: 0.5 });
const lampGeo = new THREE.BoxGeometry(0.34, 0.14, 0.06);

export const CAR_COLORS = [0xd94f30, 0x3e7cb1, 0xe8b93e, 0x59a96a, 0xb8bcc2, 0x744a9e, 0xe2703a, 0x2ea8a0, 0xd1607a];
export const CORAL = 0xff5a49;

/** Create a car, add it to the scene, and return the state object every system uses. */
export function createCar(scene, color, opts = {}) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const body = new THREE.Mesh(bodyGeo, paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(cabinGeo, glassMat);
  cabin.position.set(0, 1.05, opts.coupe ? -0.3 : -0.1);
  cabin.castShadow = true;
  group.add(cabin);
  if (opts.coupe) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.5), paint);
    spoiler.position.set(0, 0.95, -2.0);
    group.add(spoiler);
  }
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 1.4 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xcc2222, emissiveIntensity: 0.7 });
  for (const sx of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(lampGeo, headMat); hl.position.set(sx, 0.62, 2.16); group.add(hl);
    const tl = new THREE.Mesh(lampGeo, tailMat); tl.position.set(sx, 0.62, -2.16); group.add(tl);
  }
  let lightbar = null;
  if (opts.police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 4.32),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.3 }));
    stripe.position.y = 0.56;
    group.add(stripe);
    const bar = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x111116 }));
    bar.add(base);
    const redMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x2266ff, emissive: 0x2266ff, emissiveIntensity: 0.2 });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.42), redMat);
    red.position.x = -0.38;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.42), blueMat);
    blue.position.x = 0.38;
    bar.add(red, blue);
    bar.position.set(0, 1.42, -0.1);
    group.add(bar);
    lightbar = { redMat, blueMat };
  }
  scene.add(group);
  return {
    group, wheels, lightbar, tailMat, color,
    angle: 0, speed: 0, steerVis: 0, braking: false,
    police: !!opts.police, coupe: !!opts.coupe,
    parked: false, traffic: null, dead: false, rioOwned: false,
    radius: 2.3, flashPhase: Math.random() * 6,
  };
}

/** Teleport a car to a spot and settle it. */
export function placeCar(car, x, z, angle) {
  car.group.position.set(x, 0, z);
  car.angle = angle;
  car.speed = 0;
  syncCar(car);
}

/** Push the state object into the 3D group: heading, wheel spin, lightbar strobe. */
export function syncCar(car) {
  car.group.position.y = 0;
  car.group.rotation.y = car.angle;
  const spin = car.speed * 0.09;
  for (let i = 0; i < car.wheels.length; i++) {
    car.wheels[i].rotation.x += spin;
    if (i < 2) car.wheels[i].rotation.y = car.steerVis * 0.45;
  }
  car.tailMat.emissiveIntensity = car.braking ? 2.4 : 0.7;
  if (car.lightbar) {
    car.flashPhase += 0.35;
    const on = Math.sin(car.flashPhase * 6) > 0;
    car.lightbar.redMat.emissiveIntensity = on ? 2.6 : 0.15;
    car.lightbar.blueMat.emissiveIntensity = on ? 0.15 : 2.6;
  }
}

/**
 * One step of arcade physics. input: {throttle -1..1, steer -1..1, brake}.
 * Returns how far the car actually travelled (the caller smells crashes from it).
 */
export function stepCarPhysics(car, dt, input, colliders, maxSpeed = 34) {
  const accel = input.throttle > 0 ? 15 : 11;
  car.speed += input.throttle * accel * dt;
  car.braking = !!input.brake;
  if (input.brake) car.speed -= Math.sign(car.speed) * 26 * dt;
  car.speed -= car.speed * 0.55 * dt;
  if (input.throttle === 0) car.speed -= car.speed * 0.8 * dt;
  car.speed = Math.max(-11, Math.min(maxSpeed, car.speed));
  if (Math.abs(car.speed) < 0.04 && input.throttle === 0) car.speed = 0;
  car.steerVis += ((input.steer || 0) - car.steerVis) * Math.min(1, dt * 8);
  if (car.speed !== 0) {
    car.angle -= car.steerVis * dt * 1.55 * Math.min(1, Math.abs(car.speed) / 9) * Math.sign(car.speed);
  }
  const before = { x: car.group.position.x, z: car.group.position.z };
  car.group.position.x += Math.sin(car.angle) * car.speed * dt;
  car.group.position.z += Math.cos(car.angle) * car.speed * dt;
  const after = collideCircle(car.group.position, car.radius, colliders);
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  if (Math.abs(car.speed) * dt > 0.01 && moved < Math.abs(car.speed) * dt * 0.35) car.speed *= 0.25;
  syncCar(car);
  return moved;
}

/** The unit forward vector for a heading angle. */
export function forwardOf(angle) {
  return { x: Math.sin(angle), z: Math.cos(angle) };
}

/** Steering input that turns `car` toward a target point, plus the signed heading gap. */
export function steerToward(car, tx, tz) {
  const dx = tx - car.group.position.x;
  const dz = tz - car.group.position.z;
  const target = Math.atan2(dx, dz);
  let gap = target - car.angle;
  while (gap > Math.PI) gap -= Math.PI * 2;
  while (gap < -Math.PI) gap += Math.PI * 2;
  return { steer: Math.max(-1, Math.min(1, gap * 1.6)), gap };
}
