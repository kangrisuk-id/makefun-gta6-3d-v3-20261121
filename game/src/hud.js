// The DOM HUD — cash, health, respect, wanted stars, mission panel, phone banners,
// the big centre banners, the speedometer — and the live top-down minimap on its 2D
// canvas: roads, beach and ocean, the player arrow, flashing police blips, the
// target coupe and the pulsing mission marker.
import { AVENUES_X, STREETS_Z, WORLD, BEACH_X, districtAt } from './city.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'), cash: $('cash'), respect: $('respect'), health: $('health'), mode: $('mode'),
      stars: $('stars'), district: $('district'), policestat: $('policestat'),
      mtitle: $('mtitle'), mtext: $('mtext'), mdist: $('mdist'),
      phone: $('phone'), phonetext: $('phonetext'), banner: $('banner'),
      bannerh: $('bannerh'), bannerp: $('bannerp'), speedo: $('speedo'), speedv: $('speedv'),
      ammo: $('ammo'), status: $('status'), title: $('title'), endcard: $('endcard'),
      endh: $('endh'), endp: $('endp'), pause: $('pause'), goprompt: $('goprompt'),
    };
    this.map = $('minimap').getContext('2d');
    this.phoneUntil = 0;
    this.bannerUntil = 0;
    this.hasSave = false;
    this.nowFn = null; // main.js points this at the game clock (screenshot time runs faster)
  }
  now() { return this.nowFn ? this.nowFn() : performance.now(); }

  showGame(hasSave) {
    this.el.hud.style.display = 'block';
    this.el.title.style.display = 'none';
    this.hasSave = hasSave;
  }
  showTitle(hasSave) {
    this.el.title.style.display = 'flex';
    this.el.goprompt.textContent = hasSave ? 'CLICK — CONTINUE · N — NEW GAME' : 'CLICK or press N — NEW GAME';
  }
  phone(text, seconds = 7) {
    this.el.phonetext.textContent = text;
    this.el.phone.style.display = 'block';
    this.phoneUntil = this.now() + seconds * 1000;
  }
  banner(head, sub, seconds = 3.4) {
    this.el.bannerh.textContent = head;
    this.el.bannerp.textContent = sub;
    this.el.banner.style.display = 'block';
    this.bannerUntil = this.now() + seconds * 1000;
  }
  endCard(kind, text) {
    this.el.endh.textContent = kind;
    this.el.endh.style.color = kind === 'BUSTED' ? '#7ae0ff' : '#ff4d6d';
    this.el.endp.textContent = text;
    this.el.endcard.style.display = 'flex';
  }
  hideEndCard() { this.el.endcard.style.display = 'none'; }
  setPaused(paused) { this.el.pause.style.display = paused ? 'flex' : 'none'; }

  /** Refresh every HUD element from the game state; called once per frame. */
  update(s) {
    const now = this.now();
    if (now > this.phoneUntil) this.el.phone.style.display = 'none';
    if (now > this.bannerUntil) this.el.banner.style.display = 'none';
    this.el.cash.textContent = `$${s.cash.toLocaleString()}`;
    this.el.respect.textContent = `RESPECT ★ ${s.respect}`;
    this.el.health.style.width = `${Math.max(0, s.health)}%`;
    this.el.mode.textContent = s.driving ? `IN CAR · ${s.carName}` : 'ON FOOT';
    let starsHtml = '';
    for (let i = 0; i < 5; i++) starsHtml += i < s.stars ? '★' : '<span class="off">★</span>';
    this.el.stars.innerHTML = starsHtml;
    this.el.district.textContent = districtAt(s.pos.x, s.pos.z);
    this.el.policestat.textContent = s.stars === 0 ? '' : (s.policeNear ? 'POLICE IN PURSUIT' : 'BREAKING LINE OF SIGHT…');
    this.el.mtitle.textContent = s.missionTitle;
    this.el.mtext.textContent = s.objective;
    this.el.mdist.textContent = s.targetDist != null ? `◈ ${Math.round(s.targetDist)} m` : '';
    this.el.speedo.style.display = s.driving ? 'block' : 'none';
    if (s.driving) this.el.speedv.textContent = Math.round(Math.abs(s.speed) * 3.6);
    this.el.ammo.textContent = s.reloading ? '···' : `${s.ammo} / ∞`;
    this.el.status.textContent = `${s.missionTitle}: ${s.objective}`;
    this.drawMinimap(s);
  }

  drawMinimap(s) {
    const g = this.map, W = 196, H = 150;
    const sx = (x) => ((x - WORLD.minX) / (WORLD.maxX - WORLD.minX)) * W;
    const sz = (z) => ((z - WORLD.minZ) / (WORLD.maxZ - WORLD.minZ)) * H;
    g.fillStyle = '#232b26';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#c9a86a';
    g.fillRect(sx(BEACH_X), 0, W - sx(BEACH_X), H);
    g.fillStyle = '#1b7f8e';
    g.fillRect(sx(BEACH_X + 48), 0, W - sx(BEACH_X + 48), H);
    g.strokeStyle = '#4a4f58';
    g.lineWidth = 3;
    for (const x of AVENUES_X) { g.beginPath(); g.moveTo(sx(x), 0); g.lineTo(sx(x), H); g.stroke(); }
    for (const z of STREETS_Z) { g.beginPath(); g.moveTo(0, sz(z)); g.lineTo(W, sz(z)); g.stroke(); }
    if (s.coupePos && !s.coupeTaken) {
      g.fillStyle = '#ff5a49';
      g.beginPath(); g.arc(sx(s.coupePos.x), sz(s.coupePos.z), 3.4, 0, 7); g.fill();
    }
    for (const p of s.policePositions) {
      g.fillStyle = (performance.now() % 600 < 300) ? '#ff4444' : '#4488ff';
      g.beginPath(); g.arc(sx(p.x), sz(p.z), 2.6, 0, 7); g.fill();
    }
    if (s.targetPos) {
      g.fillStyle = '#ffd75e';
      g.beginPath(); g.arc(sx(s.targetPos.x), sz(s.targetPos.z), 4, 0, 7); g.fill();
      g.strokeStyle = '#ffd75e'; g.lineWidth = 1.4;
      g.beginPath(); g.arc(sx(s.targetPos.x), sz(s.targetPos.z), 6.5 + Math.sin(performance.now() / 240) * 1.6, 0, 7); g.stroke();
    }
    // the player: a white arrow pointing the way Rio (or his car) faces
    g.save();
    g.translate(sx(s.pos.x), sz(s.pos.z));
    g.rotate(Math.PI - s.angle);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -5.4); g.lineTo(3.6, 4.4); g.lineTo(0, 2.4); g.lineTo(-3.6, 4.4);
    g.closePath(); g.fill();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.font = 'bold 8px sans-serif';
    g.fillText('PALMERA BAY', 5, H - 5);
  }
}
