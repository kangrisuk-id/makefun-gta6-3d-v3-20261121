// Deterministic screenshot scenes behind ?shot=title|onfoot|chase|mission&seed=1.
// Each scene is staged with the real game code — real traffic, real police, the real
// mission chain — and framed with a fixed camera, so a headless browser captures
// the game exactly as it plays. The v3 staging is deliberate about richness: the
// cover hangs over the marina so water, boats, beach and skyline share one frame,
// and the street scenes are dressed with extra pedestrians and parked cars.
import { createCar, placeCar, CAR_COLORS } from './vehicles.js';
import { createPedestrian } from './people.js';
import { makeRandom } from './random.js';

let dressColor = 0;
function dressStreet(G, spots, pedSpots) {
  for (const [x, z, a] of spots) {
    const car = createCar(G.scene, CAR_COLORS[dressColor++ % CAR_COLORS.length]);
    placeCar(car, x, z, a);
    car.parked = true;
    G.allCars.push(car);
  }
  for (const at of pedSpots) {
    G.peds.push(createPedestrian(G.scene, makeRandom(at.x * 31 + at.z * 7 + 5), { at }));
  }
}

export function stageScene(name, G, helpers) {
  const { rio, rig, camera } = { rio: helpers.rio, rig: helpers.rig, camera: G.camera };

  if (name === 'onfoot') {
    helpers.startGame(true);
    G.cash = 900;
    // Rio on the marina promenade sidewalk, the bay opening up ahead of him
    rio.group.position.set(206, 0, 48.3);
    rio.group.rotation.y = Math.PI / 2; // facing east, down the marina street
    rig.yaw = Math.PI / 2;
    rig.pitch = 0.3;
    rig.dist = 9;
    // a crowd around him: promenade strollers, people crossing to the boardwalk,
    // beachgoers on the sand — the street has to look lived in
    dressStreet(G,
      [[172, 67.5, Math.PI / 2], [216, 67.5, Math.PI / 2], [238, 52.5, -Math.PI / 2]],
      [{ x: 198, z: 48.1 }, { x: 213, z: 47.6 }, { x: 219, z: 48.7 }, { x: 226, z: 47.8 },
       { x: 233, z: 48.4 }, { x: 200, z: 71.8 }, { x: 214, z: 72.3 }, { x: 228, z: 71.6 },
       { x: 246, z: 55 }, { x: 262, z: 64 }, { x: 285, z: 44 }, { x: 288, z: 76 },
       { x: 297, z: 58 }, { x: 252, z: 47.9 }]);
    return;
  }

  if (name === 'chase') {
    helpers.startGame(true);
    G.cash = 3900;
    G.health = 82;
    G.missions.index = 3; // LOSE THE HEAT
    G.missions.started = false;
    G.nextMissionAt = 0.3;
    placeCar(G.coupe, 150, 55.4, Math.PI / 2);
    helpers.enterCar(G.coupe);
    // life along the chase route: parked cars at the kerb, people on both sidewalks
    dressStreet(G,
      [[238, 67.5, Math.PI / 2], [262, 52.5, -Math.PI / 2]],
      [{ x: 226, z: 48 }, { x: 244, z: 72 }, { x: 255, z: 47.6 }, { x: 268, z: 72.4 }]);
    let staged = false;
    const stagedCops = [];
    G.shotTick = () => {
      const car = G.playerCar;
      if (!car) return;
      if (G.missions.started && G.wanted.stars < 4) G.wanted.addCrime(40); // up to four stars
      if (G.wanted.heat > 100) G.wanted.heat = 100; // hold it at four
      if (!staged && G.time > 0.6) {
        staged = true;
        for (const [dx, dz] of [[-9, -5.5], [-11, 2.5]]) {
          const cop = createCar(G.scene, 0x16161c, { police: true });
          placeCar(cop, car.group.position.x + dx, car.group.position.z + dz, Math.PI / 2);
          cop.speed = 21;
          G.policeCars.push(cop);
          G.allCars.push(cop);
          stagedCops.push({ cop, dx, dz });
        }
      }
      // the staged units hold formation on Rio's tail, so the frame always reads as a chase
      for (const s of stagedCops) {
        s.cop.group.position.set(car.group.position.x + s.dx, 0, car.group.position.z + s.dz);
        s.cop.angle = Math.PI / 2;
        s.cop.speed = car.speed;
      }
      car.speed = Math.max(car.speed, 19.5); // keep the run at speed
      car.angle = Math.PI / 2;
      car.group.position.z += (55.4 - car.group.position.z) * 0.06; // hold the lane
      const p = car.group.position;
      camera.position.set(p.x - 21, 7.5, p.z - 2);
      camera.lookAt(p.x + 20, 1, p.z);
    };
    return;
  }

  if (name === 'mission') {
    helpers.startGame(true);
    G.cash = 3250;
    G.health = 76;
    G.ammo = 9;
    G.missions.index = 4; // LAST RUN ON THE BAY
    G.missions.started = false;
    G.nextMissionAt = 0.3;
    rio.group.position.set(-196, 0, 149);
    rio.group.rotation.y = Math.PI; // facing the warehouse yard
    placeCar(G.coupe, -184, 152, 0.4);
    G.shotTick = () => {
      const p = rio.group.position;
      camera.position.set(p.x + 2.5, 4.4, p.z + 11.5);
      camera.lookAt(p.x - 2, 1.4, p.z - 16);
    };
    return;
  }

  // title: the cover. The camera hangs over the water east of the marina, looking
  // back west — boats and the pier in the foreground, the beach and boardwalk
  // crossing the frame, the marina street running into the skyline beyond.
  G.shotTick = () => {
    camera.position.set(394, 12.5, 124);
    camera.lookAt(168, 4, 36);
  };
}
