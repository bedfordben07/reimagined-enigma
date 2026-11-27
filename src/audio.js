// Synthesized sound kit (WebAudio), no audio files. Layered impacts and explosions, a room reverb
// send, rain, thunder, fire crackle, a city/nature ambience that follows the time of day, and a
// procedural combat score that builds with the fight.
export class Sfx {
  constructor() { this.ctx = null; this.musicOn = true; }
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      this.ctx = new C();
    } catch (e) { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.55;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
    // world sounds pass through a low-pass that closes while time is frozen
    this.world = c.createBiquadFilter(); this.world.type = 'lowpass'; this.world.frequency.value = 20000; this.world.Q.value = 0.7;
    this.master.connect(this.world); this.world.connect(comp); comp.connect(c.destination);
    this.direct = c.createGain(); this.direct.gain.value = 0.6; this.direct.connect(comp);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // brown noise for rumbles and rain body
    this.brown = c.createBuffer(1, len, c.sampleRate);
    const b = this.brown.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    // reverb: a generated 2.4 s street/canyon impulse on a send bus
    const rl = Math.floor(c.sampleRate * 2.4), ir = c.createBuffer(2, rl, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const a = ir.getChannelData(ch); for (let i = 0; i < rl; i++) { const t = i / rl; a[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < c.sampleRate * 0.012 ? 0.3 : 1); } }
    this.verb = c.createConvolver(); this.verb.buffer = ir;
    this.verbIn = c.createGain(); this.verbIn.gain.value = 0.35;
    const vOut = c.createGain(); vOut.gain.value = 0.55;
    this.verbIn.connect(this.verb); this.verb.connect(vOut); vOut.connect(this.world);
    // wind (speed) loop
    this.wind = this._src(this.noise, true);
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
    // rain: hiss + body + random drips
    this.rainSrc = this._src(this.noise, true); const rf = c.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1800;
    this.rainBody = this._src(this.brown, true); const rb = c.createBiquadFilter(); rb.type = 'lowpass'; rb.frequency.value = 600;
    this.rainG = c.createGain(); this.rainG.gain.value = 0;
    this.rainSrc.connect(rf); rf.connect(this.rainG); this.rainBody.connect(rb); rb.connect(this.rainG); this.rainG.connect(this.master);
    this.rainSrc.start(); this.rainBody.start(0, 0.7); this.rainK = 0;
    // fire: crackling roar
    this.fireSrc = this._src(this.brown, true); const ff = c.createBiquadFilter(); ff.type = 'lowpass'; ff.frequency.value = 900;
    this.fireG = c.createGain(); this.fireG.gain.value = 0;
    this.fireSrc.connect(ff); ff.connect(this.fireG); this.fireG.connect(this.master); this.fireSrc.start(0, 1.1); this.fireK = 0;
    // city: distant traffic hum (fades at night), birds by day, crickets at night
    this.city = this._src(this.brown, true); const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 180; cf.Q.value = 0.5;
    this.cityG = c.createGain(); this.cityG.gain.value = 0;
    this.city.connect(cf); cf.connect(this.cityG); this.cityG.connect(this.master); this.city.start(0, 0.3);
    this.day = 1; this.combat = 0; this.nextAmb = 0;
    // music bus (not muffled by time freeze — it ducks instead)
    this.music = c.createGain(); this.music.gain.value = 0.32; this.music.connect(comp);
    this.mStep = 0; this.mNext = 0; this.mLevel = 0;
    this.last = {};
  }
  _src(buf, loop = false) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s; }
  _noiseSrc(loop = false) { return this._src(this.noise, loop); }
  _throttle(k, ms) { const t = performance.now(); if (this.last[k] && t - this.last[k] < ms) return true; this.last[k] = t; return false; }
  // A shaped noise burst: filter type/freq sweep, gain envelope, optional reverb send.
  _burst(t, { buf = this.noise, type = 'lowpass', f0 = 3000, f1 = 200, q = 0.7, gain = 0.5, dur = 0.4, attack = 0.002, verb = 0, out = this.master }) {
    const c = this.ctx, n = this._src(buf), f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(out); if (verb) { const s = c.createGain(); s.gain.value = verb; g.connect(s); s.connect(this.verbIn); }
    n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.05);
  }
  _tone(t, { type = 'sine', f0 = 100, f1 = null, gain = 0.4, dur = 0.3, attack = 0.003, out = this.master, verb = 0 }) {
    const c = this.ctx, o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); if (verb) { const s = c.createGain(); s.gain.value = verb; g.connect(s); s.connect(this.verbIn); }
    o.start(t); o.stop(t + dur + 0.05);
  }

  // Explosion / heavy impact: sub drop, a bright crack, a long rumbling tail through the reverb.
  boom(power = 1) {
    if (!this.ctx || this._throttle('bm', 40)) return; const t = this.ctx.currentTime, p = Math.min(2, power);
    this._tone(t, { f0: 110 + p * 30, f1: 28, gain: Math.min(1.2, 0.5 + p * 0.5), dur: 0.55 + p * 0.2 });
    this._burst(t, { type: 'highpass', f0: 2500, f1: 900, gain: 0.35 * p, dur: 0.09, verb: 0.6 });
    this._burst(t, { f0: 3200, f1: 180, gain: 0.6 * Math.min(1.5, p), dur: 0.5, verb: 0.8 });
    if (p > 0.8) this._burst(t + 0.05, { buf: this.brown, f0: 500, f1: 60, gain: 0.5 * p, dur: 1.2 + p, attack: 0.08, verb: 0.5 });
    this.combat = Math.min(1, this.combat + 0.15 * p);
  }
  // A punch landing on metal / a body: thump + slap.
  punch(power = 1) {
    if (!this.ctx || this._throttle('pu', 50)) return; const t = this.ctx.currentTime;
    this._tone(t, { f0: 160, f1: 45, gain: 0.5 + power * 0.3, dur: 0.18 });
    this._burst(t, { type: 'bandpass', f0: 1800, f1: 500, q: 1.2, gain: 0.4, dur: 0.12, verb: 0.4 });
    this.combat = Math.min(1, this.combat + 0.1);
  }
  crumble(amount) {
    if (!this.ctx || this._throttle('cr', 70)) return; const c = this.ctx, t = c.currentTime;
    const dur = 0.25 + Math.min(1.4, amount / 120), k = Math.min(0.7, 0.08 + amount / 150);
    this._burst(t, { type: 'bandpass', f0: 300 + Math.random() * 500, f1: 150, q: 0.8, gain: k, dur, verb: 0.4 });
    if (amount > 40) this._burst(t, { buf: this.brown, f0: 260, f1: 50, gain: k * 0.9, dur: dur * 1.4, attack: 0.03 });
    // rattling chunks
    const n = Math.min(8, 2 + amount / 30);
    for (let i = 0; i < n; i++) this._tone(t + 0.05 + Math.random() * dur * 0.8, { type: 'triangle', f0: 180 + Math.random() * 500, f1: 90, gain: 0.05 + Math.random() * 0.05, dur: 0.06 });
  }
  glass() {
    if (!this.ctx || this._throttle('gl', 90)) return; const t = this.ctx.currentTime;
    this._burst(t, { type: 'highpass', f0: 5000, f1: 3000, gain: 0.18, dur: 0.15, verb: 0.5 });
    for (let i = 0; i < 7; i++) { const s = t + i * 0.012 + Math.random() * 0.12; this._tone(s, { type: 'triangle', f0: 2400 + Math.random() * 4200, gain: 0.035 + Math.random() * 0.03, dur: 0.12 + Math.random() * 0.25, verb: 0.6 }); }
  }
  whoosh() {
    if (!this.ctx || this._throttle('wh', 120)) return; const t = this.ctx.currentTime;
    this._burst(t, { type: 'bandpass', f0: 300, f1: 1800, q: 1.2, gain: 0.25, dur: 0.28, attack: 0.05 });
  }
  // Metal on metal: a struck plate with a few inharmonic partials.
  clang() {
    if (!this.ctx || this._throttle('cl', 60)) return; const t = this.ctx.currentTime;
    for (const [f, g] of [[420, 0.2], [1013, 0.12], [1720, 0.08], [2670, 0.05]]) this._tone(t, { type: 'sine', f0: f * (0.95 + Math.random() * 0.1), gain: g, dur: 0.5 + Math.random() * 0.4, verb: 0.5 });
    this._burst(t, { type: 'highpass', f0: 3000, f1: 2000, gain: 0.25, dur: 0.05 });
    this.combat = Math.min(1, this.combat + 0.08);
  }
  // Car body crunch.
  crunch() {
    if (!this.ctx || this._throttle('cn', 80)) return; const t = this.ctx.currentTime;
    this._burst(t, { type: 'bandpass', f0: 900, f1: 300, q: 2, gain: 0.45, dur: 0.25, verb: 0.3 });
    for (let i = 0; i < 4; i++) this._tone(t + Math.random() * 0.12, { type: 'square', f0: 120 + Math.random() * 300, f1: 60, gain: 0.05, dur: 0.1 });
  }
  // Electric zap / chain lightning.
  zap(k = 1) {
    if (!this.ctx || this._throttle('zp', 50)) return; const t = this.ctx.currentTime;
    this._tone(t, { type: 'sawtooth', f0: 1800 + Math.random() * 1200, f1: 120, gain: 0.18 * k, dur: 0.16 });
    this._burst(t, { type: 'highpass', f0: 4000, f1: 2500, gain: 0.3 * k, dur: 0.1, verb: 0.4 });
  }
  thunder(delay = 0, k = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime + delay;
    if (delay < 0.6) this._burst(t, { type: 'highpass', f0: 3000, f1: 800, gain: 0.5 * k, dur: 0.12, verb: 0.8 });
    this._burst(t + 0.05, { buf: this.brown, f0: 900 / (1 + delay), f1: 40, gain: 0.9 * k, dur: 2.5 + delay, attack: 0.1 + delay * 0.1, verb: 0.9 });
    this._burst(t + 0.4 + Math.random() * 0.6, { buf: this.brown, f0: 300, f1: 40, gain: 0.5 * k, dur: 2, attack: 0.3 });
  }
  rain(k) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    if (Math.abs(k - this.rainK) > 0.01) { this.rainK = k; this.rainG.gain.setTargetAtTime(k * 0.22, t, 0.5); }
  }
  freeze(on) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    this.world.frequency.cancelScheduledValues(t);
    this.world.frequency.setTargetAtTime(on ? 520 : 20000, t, on ? 0.08 : 0.15);
    this.music.gain.setTargetAtTime(on ? 0.08 : 0.32, t, 0.2);
    this._tone(t, { f0: on ? 520 : 55, f1: on ? 45 : 600, gain: 0.7, dur: 0.8, attack: 0.05, out: this.direct });
    this._burst(t, { type: 'bandpass', f0: on ? 3000 : 300, f1: on ? 200 : 4000, q: 3, gain: 0.25, dur: 0.55, out: this.direct });
  }
  // the world drops away for a moment (the sonic boom), then rushes back
  duck(k = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime, f = this.world.frequency;
    f.cancelScheduledValues(t); f.setValueAtTime(Math.max(300, 4000 * (1 - k)), t); f.exponentialRampToValueAtTime(20000, t + 0.9 + k * 0.6);
  }
  // a police siren at distance d (0 = off), wailing
  policeSiren(d) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    if (!this.pol) {
      const o = c.createOscillator(); o.type = 'triangle'; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
      const g = c.createGain(); g.gain.value = 0; o.connect(f); f.connect(g); g.connect(this.master);
      const lfo = c.createOscillator(); lfo.frequency.value = 0.55; const lg = c.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(o.frequency); o.frequency.value = 820;
      o.start(); lfo.start(); this.pol = { g };
    }
    this.pol.g.gain.setTargetAtTime(d > 0 ? Math.min(0.06, 3 / (d + 20)) : 0, t, 0.3);
  }
  // helicopter rotor chop, louder as it gets closer
  heli(d) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    if (!this.hl) {
      const n = this._src(this.brown, true); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
      const am = c.createGain(); am.gain.value = 0.5; const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 11; const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain);
      const g = c.createGain(); g.gain.value = 0; n.connect(f); f.connect(am); am.connect(g); g.connect(this.master); n.start(); lfo.start(); this.hl = { g };
    }
    this.hl.g.gain.setTargetAtTime(d > 0 ? Math.min(0.35, 18 / (d + 30)) : 0, t, 0.3);
  }
  // AXIOM speaking: a low, detuned chord with a digital edge
  mind() {
    if (!this.ctx || this._throttle('mind', 400)) return; const t = this.ctx.currentTime;
    for (const [f, g] of [[55, 0.12], [82.4, 0.08], [110.6, 0.06], [164.8, 0.03]]) this._tone(t, { type: 'sawtooth', f0: f, f1: f * 0.98, gain: g, dur: 1.1, attack: 0.08, out: this.direct, verb: 0.5 });
    for (let i = 0; i < 5; i++) this._tone(t + i * 0.05, { type: 'square', f0: 900 + Math.random() * 900, gain: 0.012, dur: 0.03, attack: 0.002, out: this.direct });
  }
  tick(high) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._tone(t, { type: 'square', f0: high ? 1900 : 1450, gain: 0.05, dur: 0.04, attack: 0.001, out: this.direct });
  }
  // Called every frame with the player's speed and laser state, plus the world: { day 0..1, fire 0..1, combat 0..1 }.
  set(speed, laser, env = {}) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    this.windG.gain.setTargetAtTime(Math.min(0.5, speed / 160), t, 0.1);
    this.windF.frequency.setTargetAtTime(300 + speed * 12, t, 0.1);
    this.lg.gain.setTargetAtTime(laser ? 0.12 : 0, t, 0.03);
    if (laser) { this.lo.frequency.setTargetAtTime(105 + Math.random() * 15, t, 0.02); this.lf.frequency.setTargetAtTime(1200 + Math.random() * 800, t, 0.02); }
    const day = env.day ?? 1, fire = env.fire ?? 0;
    this.day = day;
    this.cityG.gain.setTargetAtTime(0.025 + day * 0.05, t, 0.8);
    this.fireG.gain.setTargetAtTime(fire * 0.35, t, 0.3);
    if (fire > 0.05 && Math.random() < fire * 0.5) this._burst(t, { type: 'highpass', f0: 2000 + Math.random() * 3000, f1: 1500, gain: 0.04 + Math.random() * 0.08 * fire, dur: 0.02 + Math.random() * 0.03 }); // crackle
    if (env.combat != null) this.combat = Math.max(this.combat, env.combat);
    this.combat = Math.max(0, this.combat - 0.0025);
    // ambience one-shots: birdsong by day, crickets at night, a far siren now and then
    if (t > this.nextAmb && this.rainK < 0.3) {
      this.nextAmb = t + 1.5 + Math.random() * 4;
      if (day > 0.5) this._bird(t); else this._crickets(t);
      if (Math.random() < 0.06) this._siren(t);
    }
    this._music(t);
  }
  _bird(t) {
    const n = 2 + Math.floor(Math.random() * 4), base = 2600 + Math.random() * 1800;
    for (let i = 0; i < n; i++) this._tone(t + i * 0.11, { f0: base * (1 + Math.random() * 0.3), f1: base * (0.7 + Math.random() * 0.6), gain: 0.02, dur: 0.08, verb: 0.4 });
  }
  _crickets(t) {
    for (let i = 0; i < 6; i++) this._tone(t + i * 0.06, { type: 'triangle', f0: 4300, gain: 0.012, dur: 0.03, attack: 0.002 });
  }
  _siren(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(); o.type = 'triangle'; f.type = 'lowpass'; f.frequency.value = 1200;
    for (let i = 0; i < 6; i++) { o.frequency.setValueAtTime(700, t + i * 0.9); o.frequency.linearRampToValueAtTime(980, t + i * 0.9 + 0.45); o.frequency.linearRampToValueAtTime(700, t + i * 0.9 + 0.9); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.025, t + 1.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 5.4);
    o.connect(f); f.connect(g); g.connect(this.master); const s = c.createGain(); s.gain.value = 0.8; g.connect(s); s.connect(this.verbIn);
    o.start(t); o.stop(t + 5.5);
  }
  // Procedural score: a dark minor pulse that adds drums, bass and a lead as the fight heats up.
  _music(t) {
    if (!this.musicOn) return;
    const target = this.combat;
    this.mLevel += (target - this.mLevel) * 0.01;
    if (this.mNext < t) this.mNext = t + 0.05;
    const step = 60 / 128 / 4; // 16th notes at 128 bpm
    const roots = [45, 45, 41, 43]; // A, A, F, G
    while (this.mNext < t + 0.15) {
      const s = this.mStep++, at = this.mNext, L = this.mLevel, bar = Math.floor(s / 16) % 4, n = s % 16;
      const root = roots[bar], hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
      // pad: always present quietly
      if (n === 0) for (const iv of [0, 3, 7]) this._tone(at, { type: 'sawtooth', f0: hz(root + 12 + iv), gain: 0.012 + L * 0.01, dur: step * 16, attack: 0.6, out: this.music, verb: 0.6 });
      if (L > 0.15) {
        if (n % 4 === 0) { this._tone(at, { f0: 140, f1: 40, gain: 0.35 * Math.min(1, L * 2), dur: 0.2, out: this.music }); }
        if (n % 2 === 0) this._tone(at, { type: 'sawtooth', f0: hz(root - 12 + (n === 14 ? 7 : 0)), gain: 0.06 * L, dur: step * 1.6, out: this.music });
      }
      if (L > 0.35) {
        if (n % 4 === 2) this._burst(at, { type: 'highpass', f0: 7000, f1: 6000, gain: 0.05 * L, dur: 0.04, out: this.music });
        if (n === 4 || n === 12) this._burst(at, { type: 'bandpass', f0: 1800, f1: 600, q: 0.9, gain: 0.18 * L, dur: 0.14, out: this.music, verb: 0.4 });
      }
      if (L > 0.6 && [0, 3, 6, 10, 12].includes(n)) {
        const mel = [0, 3, 7, 10, 12, 7][(s >> 2) % 6];
        this._tone(at, { type: 'square', f0: hz(root + 24 + mel), gain: 0.025 * L, dur: step * 1.5, out: this.music, verb: 0.5 });
      }
      this.mNext += step;
    }
  }
}
