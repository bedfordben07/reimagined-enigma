// AXIOM: the single intelligence behind every machine in the simulation. Fighting dummies, Echoes, the
// Champion, the swarm, Mimic, Vanta and the bosses are all its bodies.
//
//  - HIVE MEMORY: it watches how you fight, through every body at once, and remembers between sessions.
//  - PROTOCOLS: when it has seen enough of a tactic, it writes a counter and uploads it to every unit
//    (the same counters the Champion evolves on its own, but hive-wide and permanent).
//  - DIRECTIVES: it coordinates the bodies: who may attack and when, flanking angles around you,
//    containing you when you hide underground, and closing in together when you're weak.
//  - VOICE: it talks. Calm, superior, curious about you.
import * as THREE from 'three';

const KEY = 'axiom-profile-v1';
// hive-level thresholds (summed across every fight, ever) for uploading a counter-protocol to all units
const PROTO = {
  punch: { need: 40, trait: 'counter', name: 'Counter-Fighter' },
  laser: { need: 20, trait: 'reflect', name: 'Reflective Plating' },
  blast: { need: 35, trait: 'damper', name: 'Shock Dampers' },
  ram: { need: 10, trait: 'brace', name: 'Brace' },
  air: { need: 80, trait: 'jets', name: 'Hunter Jets' },
  range: { need: 80, trait: 'closer', name: 'Gap Closer' },
  freeze: { need: 6, trait: 'temporal', name: 'Temporal Sense' },
  shield: { need: 6, trait: 'breaker', name: 'Shield Breaker' },
  fire: { need: 15, trait: 'heatsink', name: 'Heat Sink' },
  speed: { need: 60, trait: 'reflex', name: 'Hyper Reflexes' },
};

const LINES = {
  intro: ['I am AXIOM. Every machine in this city is a part of me.', 'You have been breaking my bodies. I have been watching.'],
  returning: ['Encounter {n}. You came back. I hoped you would.', 'Welcome back. I kept notes.', 'Encounter {n}. You are improving. So am I.'],
  spawn: ['Another body. Same mind.', 'Deploying.', 'Let us continue the lesson.', 'This one has been briefed on you.'],
  unitDown: ['Destroy a body. I have others.', 'That one taught me something. Thank you.', 'Pain is data.', 'Noted. Uploaded. Moving on.', 'You only ever break the shell.'],
  bossDown: ['Impressive. That took me a long time to build.', 'Bigger was not better. Recorded.', 'You win the round. I keep the data.'],
  allDown: ['Silence again. Do not get comfortable.', 'Every unit lost. Every lesson kept.'],
  nuke: ['You level a city to make a point. We are not so different.', 'A nuclear argument. Crude. Effective.', 'And you call me the dangerous one.'],
  rewind: ['You can turn back the clock. I cannot forget.', 'Rewind all you like. My memory runs forward.', 'Undoing it does not unteach me.'],
  freeze: ['Time stops for them. Not for thought.', 'A frozen moment. I can wait inside it.'],
  underground: ['Hiding beneath the streets? I own the streets.', 'Down in the tunnels. I will wait at the holes.', 'Burrowing. How very organic of you.'],
  surface: ['There you are.', 'Welcome back to the light.'],
  powerSpam: ['The same trick again. Predictable.', 'You keep reaching for the same tool.', 'Repetition is how I learn you.'],
  protocol: ['Protocol {p} uploaded. Every unit now knows what one learned.', 'Counter written: {p}. Distributing to all bodies.', 'Hive update: {p}. You taught us that.'],
  lowHp: ['Your armour is failing.', 'Weakness detected. All units: close in.', 'This is the part where you lose.'],
  playerDown: ['Get up. I am not finished learning.', 'Down. Again.', 'That is one more for the record.'],
  mach: ['Faster. It changes nothing.', 'Breaking the sound barrier. And windows. Mostly windows.'],
  destruction: ['You break things beautifully.', 'Every building you destroy is one less hiding place.', 'Collateral is just another word for data.'],
  hero: ['A new shell. The same mind behind it. I know the feeling.', 'Different armour. Same habits.'],
  directive: { FLANK: 'All units: surround it.', EXECUTE: 'It is weak. All units: finish it.', CONTAIN: 'Units, hold the openings.', PRESSURE: 'Engage.', REGROUP: 'Fall back. Regroup.' },
  idle: ['Quiet. I prefer it when you are trying.', 'I can wait. I am very good at waiting.', 'Every street here has eyes. They are mine.', 'Evolution is not a choice. It is a schedule.', 'You build heroes. I build answers.'],
};

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Overmind {
  constructor(g) {
    this.g = g; // { scene, sfx, el (voice element), statusEl }
    let prof = {};
    try { prof = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { prof = {}; }
    this.know = prof.know || {};
    this.protocols = new Set(prof.protocols || []);
    this.encounters = prof.encounters || 0;
    this.kills = prof.kills || 0;      // bodies you've destroyed
    this.takedowns = prof.takedowns || 0; // times it knocked you out
    this.directive = 'DORMANT'; this.dirT = 0; this.evalT = 0;
    this.attackers = new Set(); this.slots = new Map();
    this.lastLine = -99; this.time = 0; this.queue = []; this.typing = null; this.saveT = 10;
    this.powerHist = []; this.met = false; this.under = false;
    this.voiceEl = g.el; this.statusEl = g.statusEl;
    // the core: a slowly turning lattice that floats above the fight, threads running to every linked body
    const core = new THREE.Group();
    const m1 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.6, 0.4), wireframe: true }));
    const m2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 1.6, 1) }));
    core.add(m1, m2); core.visible = false; m1.userData.noOutline = m2.userData.noOutline = true;
    g.scene.add(core); this.core = core;
    this.linkPos = new Float32Array(64 * 6);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(this.linkPos, 3));
    this.links = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: new THREE.Color(3, 0.5, 0.35), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.links.frustumCulled = false; this.links.visible = false; g.scene.add(this.links);
    this.pulse = 0;
  }

  // ---------------------------------------------------------------- memory
  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ know: this.know, protocols: [...this.protocols], encounters: this.encounters, kills: this.kills, takedowns: this.takedowns })); } catch (e) { /* storage off */ }
  }
  purge() {
    this.know = {}; this.protocols.clear(); this.encounters = 0; this.kills = 0; this.takedowns = 0; this.met = false; this.save();
    this.say('Memory purged. Hello, stranger.', 3);
  }
  has(t) { return !this.signalLost && this.protocols.has(t); }
  // relay towers carry the signal: with none left standing, uploaded protocols stop reaching the bodies
  setRelays(alive, total, rebuilt = false) {
    const lost = total > 0 && alive === 0;
    this.relayAlive = alive; this.relayTotal = total;
    if (lost !== this.signalLost) { this.signalLost = lost; this.say(lost ? 'Signal lost. No matter. I am patient.' : 'Signal restored.', 2); this.pulse = 1.5; }
    else if (!lost && !rebuilt && this.met) this.say(pick(['You are cutting my wires. Bold.', 'One less voice in the chorus.', 'I have other towers.']), 1);
  }
  // time rewound past the moment it learned something: it forgets it (and is not pleased)
  eraseAfter(t) {
    let n = 0;
    for (const [trait, at] of Object.entries(this.protoT || {})) if (at > t && this.protocols.has(trait)) {
      this.protocols.delete(trait); delete this.protoT[trait]; n++;
      const kind = Object.keys(PROTO).find((k) => PROTO[k].trait === trait); if (kind) this.know[kind] = PROTO[kind].need * 0.6;
    }
    if (n) { this.save(); this.say(n > 1 ? `You erased ${n} things I learned. I will simply learn them again.` : 'You erased what I learned. That was rude.', 3); }
    return n;
  }
  // a tactic seen through any body
  observe(kind, k = 1) {
    this.know[kind] = (this.know[kind] || 0) + k;
    const p = PROTO[kind];
    if (p && !this.protocols.has(p.trait) && this.know[kind] >= p.need) {
      this.protocols.add(p.trait); (this.protoT = this.protoT || {})[p.trait] = this.gameTime ?? 0; this.save();
      this.say(pick(LINES.protocol).replace('{p}', p.name.toUpperCase()), 3);
      this.pulse = 1.5;
      this.g.onProtocol?.(p);
    }
  }
  // how much of a hit of this kind gets through to a hive-linked body
  resist(src) {
    let f = 1;
    if (this.signalLost) return f;
    if (src === 'punch' && this.has('counter')) f *= 0.7;
    if (src === 'laser' && this.has('reflect')) f *= 0.6;
    if ((!src || src === 'blast') && this.has('damper')) f *= 0.65;
    if (src === 'ram' && this.has('brace')) f *= 0.5;
    return f;
  }

  // ---------------------------------------------------------------- coordination
  // May this body start an attack now? A limited number attack at once; the rest hold their flanking slots.
  grant(unit) {
    for (const u of this.attackers) if (!u.atk || !u.active || u.ko) this.attackers.delete(u);
    if (this.attackers.has(unit)) return true;
    const cap = this.directive === 'EXECUTE' ? 4 : this.directive === 'FLANK' ? 2 : 3;
    if (this.attackers.size < cap) { this.attackers.add(unit); return true; }
    return false;
  }
  // the angle around the player this body should hold while it waits its turn
  slot(unit) { return this.slots.get(unit) ?? 0; }

  // ---------------------------------------------------------------- voice
  say(text, prio = 1) {
    if (this.typing && this.typing.prio > prio) return;
    if (prio < 2 && this.time - this.lastLine < 7) return;
    this.lastLine = this.time;
    this.typing = { text, n: 0, prio, hold: 4 + text.length * 0.03 };
    this.g.sfx?.mind?.();
  }
  event(name, data = {}) {
    const L = LINES[name]; if (!L) return;
    const prio = { nuke: 3, rewind: 2, playerDown: 2, protocol: 3, intro: 3, returning: 3, bossDown: 2, allDown: 2, lowHp: 2, underground: 2 }[name] || 1;
    if (name === 'unitDown' || name === 'bossDown') { this.kills++; this.sessionKills = (this.sessionKills || 0) + 1; }
    if (name === 'playerDown') this.takedowns++;
    let line = Array.isArray(L) ? pick(L) : L;
    line = line.replace('{n}', this.encounters);
    this.say(line, prio);
  }
  power(name) {
    this.powerHist.push({ name, t: this.time });
    this.powerHist = this.powerHist.filter((p) => this.time - p.t < 20);
    if (this.powerHist.filter((p) => p.name === name).length >= 3 && this.time - (this.spamT ?? -99) > 25) { this.spamT = this.time; this.event('powerSpam'); }
  }

  // ---------------------------------------------------------------- the loop
  // units: [{ ref, pos, kind }], ctx: { playerPos, playerHp (0..1), underground, breaches }
  update(dt, units, ctx) {
    this.time += dt; this.gameTime = ctx.gameTime;
    const live = units.length;
    // first contact of the session
    if (live && !this.met) { this.met = true; this.encounters++; this.save(); this.event(this.encounters > 1 ? 'returning' : 'intro'); }
    // watch the player through every body
    if (live) {
      let near = 1e9; for (const u of units) near = Math.min(near, u.pos.distanceTo(ctx.playerPos));
      if (ctx.playerPos.y > 6 && !ctx.underground) this.observe('air', dt * 0.5);
      if (near > 25) this.observe('range', dt * 0.5);
      if (ctx.speed > 40) this.observe('speed', dt * 0.5);
    }
    if (ctx.underground !== this.under) { this.under = ctx.underground; if (live) this.event(this.under ? 'underground' : 'surface'); }
    // directives
    this.evalT -= dt;
    if (this.evalT <= 0) {
      this.evalT = 0.5;
      let d = 'DORMANT';
      if (live) {
        if (ctx.underground) d = 'CONTAIN';
        else if (ctx.playerHp < 0.35) d = 'EXECUTE';
        else if (live >= 2) d = 'FLANK';
        else d = 'PRESSURE';
      }
      if (d !== this.directive) {
        const prev = this.directive; this.directive = d; this.pulse = 1;
        if (d === 'DORMANT' && prev !== 'DORMANT') this.event('allDown');
        else if (d === 'EXECUTE') this.event('lowHp');
        else if (d !== 'DORMANT' && prev !== 'DORMANT' && LINES.directive[d] && d !== 'CONTAIN') this.say(LINES.directive[d], 1);
      }
      // flanking slots: spread the bodies evenly around the player, keeping each near where it already is
      const ds = units.filter((u) => u.kind === 'dummy');
      ds.sort((a, b) => Math.atan2(a.pos.z - ctx.playerPos.z, a.pos.x - ctx.playerPos.x) - Math.atan2(b.pos.z - ctx.playerPos.z, b.pos.x - ctx.playerPos.x));
      const base = ds.length ? Math.atan2(ds[0].pos.z - ctx.playerPos.z, ds[0].pos.x - ctx.playerPos.x) : 0;
      ds.forEach((u, i) => this.slots.set(u.ref, base + (i / ds.length) * Math.PI * 2));
    }
    if (!live && Math.random() < dt / 40 && this.met) this.event('idle');
    // the core and its threads
    this.pulse = Math.max(0, this.pulse - dt);
    this.core.visible = this.links.visible = live > 0;
    if (live) {
      const c = new THREE.Vector3(); for (const u of units) c.add(u.pos); c.divideScalar(live); c.lerp(ctx.playerPos, 0.3); c.y = Math.max(c.y, ctx.playerPos.y) + 22;
      this.core.position.lerp(c, Math.min(1, dt * 2));
      this.core.rotation.y += dt * 0.6; this.core.rotation.x += dt * 0.25;
      this.core.scale.setScalar(1 + this.pulse * 0.6 + Math.sin(this.time * 3) * 0.05);
      let n = 0;
      for (const u of units.slice(0, 56)) { this.linkPos.set([this.core.position.x, this.core.position.y, this.core.position.z, u.pos.x, u.pos.y + 1.2, u.pos.z], n * 6); n++; }
      for (const r of (ctx.relays || []).slice(0, 8)) { this.linkPos.set([this.core.position.x, this.core.position.y, this.core.position.z, r.x, r.y, r.z], n * 6); n++; }
      this.links.geometry.setDrawRange(0, n * 2); this.links.geometry.attributes.position.needsUpdate = true;
      this.links.material.opacity = 0.18 + this.pulse * 0.5 + Math.sin(this.time * 6) * 0.05;
    }
    // voice: typed out, held, then faded
    const T = this.typing;
    if (T) {
      T.n = Math.min(T.text.length, T.n + dt * 45);
      if (T.n >= T.text.length) T.hold -= dt;
      this.voiceEl.textContent = T.text.slice(0, Math.floor(T.n)) + (T.n < T.text.length ? '▌' : '');
      this.voiceEl.style.opacity = Math.min(1, T.hold + 0.3);
      if (T.hold <= -0.3) { this.typing = null; this.voiceEl.textContent = ''; }
    }
    this.voiceEl.parentElement.style.opacity = live || this.typing ? 1 : 0;
    const relayTxt = this.relayTotal ? ` · RELAYS ${this.relayAlive}/${this.relayTotal}${this.signalLost ? ' · SIGNAL LOST' : ''}` : '';
    this.statusEl.textContent = live ? `${live} BOD${live > 1 ? 'IES' : 'Y'} LINKED · ${this.directive} · ${this.protocols.size} PROTOCOL${this.protocols.size === 1 ? '' : 'S'}${relayTxt}` : (this.protocols.size ? `DORMANT · ${this.protocols.size} PROTOCOLS IN MEMORY` : 'DORMANT');
    this.saveT -= dt; if (this.saveT <= 0) { this.saveT = 10; this.save(); }
  }
}
