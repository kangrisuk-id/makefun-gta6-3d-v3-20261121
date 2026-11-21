// Every sound in Palmera Bay is synthesized with WebAudio — the engine hum, horns,
// gunshots, the police siren wail, pickups and a lazy bassline loop. No audio files,
// and nothing here ever throws before the first user gesture, so screenshot mode
// stays silent and safe.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
  }

  /** Create the context on the first user gesture (autoplay rules) — safe to call often. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngine();
      this.startSiren();
      this.startMusic();
    } catch { this.ctx = null; }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  blip(freq, dur, type = 'square', vol = 0.16, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  noise(dur, vol = 0.3, low = 400) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = low;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  shoot() { this.noise(0.13, 0.5, 2600); this.blip(160, 0.1, 'sawtooth', 0.2, -110); }
  dryFire() { this.blip(900, 0.04, 'square', 0.08); }
  reload() { this.blip(500, 0.06, 'square', 0.12); setTimeout(() => this.blip(760, 0.06, 'square', 0.12), 130); }
  horn() { this.blip(370, 0.28, 'square', 0.1); this.blip(466, 0.28, 'square', 0.08); }
  crash() { this.noise(0.3, 0.5, 500); }
  pickup() { this.blip(880, 0.09, 'sine', 0.2); setTimeout(() => this.blip(1320, 0.14, 'sine', 0.2), 80); }
  cash() { this.pickup(); }
  mission() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.2), i * 110)); }
  hurt() { this.blip(110, 0.18, 'sawtooth', 0.22, -50); }

  startEngine() {
    if (!this.ctx) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }
  /** rpm 0..1 while driving; -1 means the engine is off. */
  engine(rpm) {
    if (!this.engineOsc) return;
    const t = this.ctx.currentTime;
    if (rpm < 0) { this.engineGain.gain.setTargetAtTime(0, t, 0.1); return; }
    this.engineOsc.frequency.setTargetAtTime(55 + rpm * 130, t, 0.06);
    this.engineGain.gain.setTargetAtTime(0.05 + rpm * 0.05, t, 0.1);
  }
  startSiren() {
    if (!this.ctx) return;
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }
  /** level 0..1: how close the law is. */
  siren(level, time) {
    if (!this.sirenOsc) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(level * 0.045, t, 0.2);
    if (level > 0) this.sirenOsc.frequency.setTargetAtTime(650 + Math.sin(time * 5.2) * 190, t, 0.03);
  }
  startMusic() {
    if (!this.ctx) return;
    const bass = [55, 55, 65.4, 49, 55, 55, 73.4, 82.4];
    let step = 0;
    this.musicTimer = setInterval(() => {
      if (this.muted || document.hidden) return;
      this.blip(bass[step % bass.length], 0.24, 'triangle', 0.11);
      step += 1;
    }, 265);
  }
}
