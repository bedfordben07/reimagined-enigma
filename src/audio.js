// Small synthesized sound kit (WebAudio) — no audio files.
export class Sfx {
  constructor() { this.ctx = null; }
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      this.ctx = new C();
    } catch (e) { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.55;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    // world sounds pass through a low-pass that closes while time is frozen
    this.world = c.createBiquadFilter(); this.world.type = 'lowpass'; this.world.frequency.value = 20000; this.world.Q.value = 0.7;
    this.master.connect(this.world); this.world.connect(comp); comp.connect(c.destination);
    this.direct = c.createGain(); this.direct.gain.value = 0.6; this.direct.connect(comp);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // wind (speed) loop
    this.wind = this._noiseSrc(true);
    this.windF = c.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 500; this.windF.Q.value = 0.6;
    this.windG = c.createGain(); this.windG.gain.value = 0;
    this.wind.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master); this.wind.start();
    // laser loop
    this.lo = c.createOscillator(); this.lo.type = 'sawtooth'; this.lo.frequency.value = 110;
    this.lo2 = c.createOscillator(); this.lo2.type = 'square'; this.lo2.frequency.value = 220.7;
    this.lf = c.createBiquadFilter(); this.lf.type = 'lowpass'; this.lf.frequency.value = 1400; this.lf.Q.value = 6;
    this.lg = c.createGain(); this.lg.gain.value = 0;
    this.lo.connect(this.lf); this.lo2.connect(this.lf); this.lf.connect(this.lg); this.lg.connect(this.master);
    this.lo.start(); this.lo2.start();
    this.last = {};
  }
  _noiseSrc(loop = false) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = loop; return s; }
  _throttle(k, ms) { const t = performance.now(); if (this.last[k] && t - this.last[k] < ms) return true; this.last[k] = t; return false; }
  boom(power = 1) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120 + power * 30, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.35);
    const g = c.createGain(); g.gain.setValueAtTime(Math.min(1.2, 0.5 + power * 0.5), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.55);
    const n = this._noiseSrc(); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(200, t + 0.4);
    const ng = c.createGain(); ng.gain.setValueAtTime(0.6 * Math.min(1.5, power), t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    n.connect(f); f.connect(ng); ng.connect(this.master); n.start(t, Math.random()); n.stop(t + 0.5);
  }
  crumble(amount) {
    if (!this.ctx || this._throttle('cr', 70)) return; const c = this.ctx, t = c.currentTime;
    const dur = 0.25 + Math.min(1.4, amount / 120);
    const n = this._noiseSrc(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 300 + Math.random() * 500; f.Q.value = 0.8;
    const g = c.createGain(); g.gain.setValueAtTime(Math.min(0.7, 0.08 + amount / 150), t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f); f.connect(g); g.connect(this.master); n.start(t, Math.random()); n.stop(t + dur);
  }
  glass() {
    if (!this.ctx || this._throttle('gl', 90)) return; const c = this.ctx, t = c.currentTime;
    for (let i = 0; i < 4; i++) {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 2500 + Math.random() * 3000;
      const g = c.createGain(); const s = t + i * 0.02; g.gain.setValueAtTime(0.06, s); g.gain.exponentialRampToValueAtTime(0.001, s + 0.25);
      o.connect(g); g.connect(this.master); o.start(s); o.stop(s + 0.3);
    }
  }
  whoosh() {
    if (!this.ctx || this._throttle('wh', 120)) return; const c = this.ctx, t = c.currentTime;
    const n = this._noiseSrc(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.18);
    const g = c.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    n.connect(f); f.connect(g); g.connect(this.master); n.start(t, Math.random()); n.stop(t + 0.3);
  }
  // Time stop: a deep downward sweep, the world goes muffled; release sweeps back up with a crack.
  freeze(on) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    this.world.frequency.cancelScheduledValues(t);
    this.world.frequency.setTargetAtTime(on ? 520 : 20000, t, on ? 0.08 : 0.15);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(on ? 520 : 55, t); o.frequency.exponentialRampToValueAtTime(on ? 45 : 600, t + 0.6);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    o.connect(g); g.connect(this.direct); o.start(t); o.stop(t + 0.85);
    const n = this._noiseSrc(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(on ? 3000 : 300, t); f.frequency.exponentialRampToValueAtTime(on ? 200 : 4000, t + 0.5);
    const ng = c.createGain(); ng.gain.setValueAtTime(0.25, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    n.connect(f); f.connect(ng); ng.connect(this.direct); n.start(t, Math.random()); n.stop(t + 0.6);
  }
  tick(high) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = high ? 1900 : 1450;
    const g = c.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.04);
    o.connect(g); g.connect(this.direct); o.start(t); o.stop(t + 0.05);
  }
  set(speed, laser) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.windG.gain.setTargetAtTime(Math.min(0.5, speed / 160), t, 0.1);
    this.windF.frequency.setTargetAtTime(300 + speed * 12, t, 0.1);
    this.lg.gain.setTargetAtTime(laser ? 0.12 : 0, t, 0.03);
    if (laser) { this.lo.frequency.setTargetAtTime(105 + Math.random() * 15, t, 0.02); this.lf.frequency.setTargetAtTime(1200 + Math.random() * 800, t, 0.02); }
  }
}
