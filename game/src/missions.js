// Marisol Vega's five-mission story chain for Rio Solano, plus the repeatable paid
// delivery jobs that keep the bay earning after the finale. A glowing beacon column
// marks every objective, phone banners carry the story, and the minimap reads
// `targetPos` from here.
import * as THREE from 'three';
import { PIER_POS, GARAGE_POS, WAREHOUSE_POS } from './city.js';
import { pick } from './random.js';

export const PACKAGE_POINTS = [
  { x: -238, z: -48 }, { x: 8, z: 168 }, { x: 238, z: -178 }, { x: -118, z: 68 },
];
const DELIVERY_POINTS = [
  { x: 250, z: 175 }, { x: -250, z: -170 }, { x: 0, z: -170 }, { x: 250, z: -55 },
  { x: -125, z: 175 }, { x: 125, z: -170 }, { x: -250, z: 60 }, { x: 125, z: 60 },
];

export class MissionChain {
  constructor(scene) {
    this.index = 0; // 0..4 are the story; 5 means the story is done and side jobs run
    this.stage = 0;
    this.stageTime = 0;
    this.packagesGot = 0;
    this.targetPos = null;
    this.title = '';
    this.objective = '';
    this.started = false;
    this.sideJob = null;
    const geo = new THREE.CylinderGeometry(2.2, 2.2, 42, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd75e, transparent: true, opacity: 0.34, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.position.y = 21;
    this.beacon.visible = false;
    scene.add(this.beacon);
  }

  get storyDone() { return this.index >= 5; }

  setTarget(x, z) {
    this.targetPos = { x, z };
    this.beacon.visible = true;
    this.beacon.position.x = x;
    this.beacon.position.z = z;
  }
  hideTarget() {
    this.targetPos = null;
    this.beacon.visible = false;
  }

  /** Begin the current mission (or the next side job). `api` is wired up in main.js. */
  start(api) {
    this.started = true;
    this.stage = 0;
    this.stageTime = 0;
    this.packagesGot = 0;
    const M = this.index;
    if (M === 0) {
      this.title = '1 · FIRST LIGHT';
      this.objective = 'Meet Marisol at the Loma pier';
      api.phone('Rio. One last chain of jobs and you retire on the bay. Meet me at the Loma pier — east end of the marina street.');
      this.setTarget(PIER_POS.x, PIER_POS.z);
    } else if (M === 1) {
      this.title = '2 · CORAL COUPE';
      this.objective = 'Steal the coral-red coupe (marked on your map)';
      api.phone('A collector owes me. His coral coupe sits in the lot by the Downtown lights. Take it — bring it to Solano Garage.');
      this.setTarget(api.coupePos.x, api.coupePos.z);
    } else if (M === 2) {
      this.title = '3 · SCATTERED PACKS';
      this.objective = 'Collect the packages (0/4)';
      api.phone('Four packs scattered over the bay. Pick them all up. Fast, quiet, no questions.');
      const p = PACKAGE_POINTS[0];
      this.setTarget(p.x, p.z);
    } else if (M === 3) {
      this.title = '4 · LOSE THE HEAT';
      this.objective = 'Escape the police — break line of sight until the stars are gone';
      api.phone('It was a set-up, Rio! The packs were bait. Every badge in the bay is coming — LOSE THEM.');
      api.crime(58);
      this.hideTarget();
    } else if (M === 4) {
      this.title = '5 · LAST RUN ON THE BAY';
      this.objective = 'Go to the Solano Storage warehouse yard';
      api.phone('The crew that sold us out hides at Solano Storage. Clear the yard, then run the money to the pier. This ends tonight.');
      this.setTarget(WAREHOUSE_POS.x, WAREHOUSE_POS.z + 26);
    } else {
      this.startSideJob(api);
    }
  }

  startSideJob(api) {
    this.title = 'SIDE JOB · DELIVERY';
    const from = pick(api.random, DELIVERY_POINTS);
    let to = pick(api.random, DELIVERY_POINTS);
    if (to === from) to = DELIVERY_POINTS[0];
    this.sideJob = { from, to };
    this.stage = 0;
    this.objective = 'Pick up the delivery package';
    api.phone('Got a paying run for you, Rio. Pick up, drop off, $300. Map is marked.');
    this.setTarget(from.x, from.z);
  }

  /** Advance the chain; called every frame while playing. */
  update(dt, api) {
    if (!this.started) return;
    this.stageTime += dt;
    if (this.beacon.visible) this.beacon.rotation.y += dt * 1.4;
    const pos = api.pos;
    const near = (x, z, r) => Math.hypot(pos.x - x, pos.z - z) < r;
    const M = this.index;

    if (M === 0) {
      if (near(PIER_POS.x, PIER_POS.z, 7)) return this.complete(api, 250, 'Marisol is waiting with work.');
    }
    if (M === 1) {
      if (this.stage === 0) {
        if (api.inCoupe) {
          this.stage = 1;
          this.objective = 'Deliver the coupe to Solano Garage';
          api.phone('That paint sings. Now the garage — and try not to scratch her.');
          this.setTarget(GARAGE_POS.x, GARAGE_POS.z);
        } else if (api.coupePos) {
          this.setTarget(api.coupePos.x, api.coupePos.z);
        }
      } else if (near(GARAGE_POS.x, GARAGE_POS.z, 11) && api.inCoupe) {
        return this.complete(api, 600, 'The collector sends his regards.');
      }
    }
    if (M === 2) {
      const p = PACKAGE_POINTS[this.packagesGot];
      if (p && near(p.x, p.z, 5.5)) {
        this.packagesGot += 1;
        api.cash(150);
        api.pickupSound();
        if (this.packagesGot >= 4) return this.complete(api, 400, 'All four packs. Something smells wrong…');
        this.objective = `Collect the packages (${this.packagesGot}/4)`;
        const n = PACKAGE_POINTS[this.packagesGot];
        this.setTarget(n.x, n.z);
      }
    }
    if (M === 3) {
      if (this.stageTime > 4 && api.wanted.stars === 0) {
        return this.complete(api, 800, 'Heat lost. Marisol exhales.');
      }
    }
    if (M === 4) {
      if (this.stage === 0 && near(WAREHOUSE_POS.x, WAREHOUSE_POS.z + 26, 12)) {
        this.stage = 1;
        this.objective = 'Clear the warehouse crew!';
        api.spawnHostiles();
        api.phone('That is them, Rio. Clear the yard!');
        this.hideTarget();
      } else if (this.stage === 1 && api.hostilesAlive() === 0) {
        this.stage = 2;
        this.objective = 'Getaway! Drive the money to the Loma pier';
        api.crime(30);
        api.phone('Yard is clean. Now RUN it to the pier — the bay is watching!');
        this.setTarget(PIER_POS.x, PIER_POS.z);
      } else if (this.stage === 2 && near(PIER_POS.x, PIER_POS.z, 9) && api.inCar) {
        return this.complete(api, 5000, 'Rio Solano retires on the bay. 🌴');
      }
    }
    if (M >= 5 && this.sideJob) {
      const job = this.sideJob;
      if (this.stage === 0 && near(job.from.x, job.from.z, 6)) {
        this.stage = 1;
        this.objective = 'Drop the package at the marked address';
        api.pickupSound();
        this.setTarget(job.to.x, job.to.z);
      } else if (this.stage === 1 && near(job.to.x, job.to.z, 7)) {
        api.cash(300);
        api.banner('DELIVERY DONE', '+ $300');
        this.startSideJob(api);
      }
    }
  }

  complete(api, payout, note) {
    api.cash(payout);
    api.banner('MISSION COMPLETE', `+ $${payout.toLocaleString()} — ${note}`);
    api.missionSound();
    this.index += 1;
    this.started = false;
    this.hideTarget();
    this.title = this.storyDone ? 'FREE ROAM' : 'NEW JOB INCOMING';
    this.objective = this.storyDone ? 'Palmera Bay is yours. Side jobs pay $300.' : 'Check your phone…';
    api.onMissionComplete(this.index);
  }
}
