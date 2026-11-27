// New enemies.
//   MIMIC — a dark chrome copy of whichever hero you're playing. It flies, dashes in to punch, burns you
//           with its own laser, and turns your powers back on you: it copies the last power you used.
//   VANTA — a rival flying hero (original design, black and crimson) who dogfights at Mach speed: strafing
//           laser runs, supersonic rams that set off sonic booms, and tight circling duels.
//   SWARM — twenty small robots that pour in, climb straight up walls and pile onto you. Each one is weak;
//           together they drag you down. Shake them off at speed, with a shield, or smash them.
// Mimic and Vanta follow the same interface as the bosses, so every attack in the game already hits them.
import * as THREE from 'three';
import { groundH } from './world.js?v=1795822750';

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();
const inTown = (x, z) => Math.abs(x) < 182 && Math.abs(z) < 182;
const floorAt = (x, z) => (inTown(x, z) ? 0 : groundH(x, z));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function darken(root, eye, glow) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material || o.material.isMeshBasicMaterial) return;
    const m = o.material.clone();
    if (m.emissive && m.emissiveIntensity > 1) { m.emissive.set(glow); }
    else if (m.color) { m.color.multiplyScalar(0.22); if ('metalness' in m) { m.metalness = 1; m.roughness = Math.min(m.roughness ?? 0.3, 0.22); } }
    o.material = m;
  });
}

// ---------------------------------------------------------------- flying foes (Mimic, Vanta)
export class FlyerFoe {
  constructor(g, kind) {
    this.g = g; // { scene, fx, sfx, vox, smash, blastAll, player, chest(), knockPlayer, hurtPlayer, heroClass(), voltClass, lastPower(), sonicBoomAt(p, level), score }
    this.kind = kind;
    this.name = kind === 'mimic' ? 'MIMIC' : 'VANTA';
    this.baseHp = kind === 'mimic' ? 1600 : 2200; this.score = kind === 'mimic' ? 8000 : 10000;
    this.S = 1; this.active = false; this.dead = false; this.robot = null; this.rocks = []; this.orbs = [];
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0;
    const bm = new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 1, 0.6), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 8, 1, true), bm);
    this.beam.geometry.translate(0, 0.5, 0); this.beam.geometry.rotateX(Math.PI / 2); this.beam.visible = false; this.beam.userData.noOutline = true; g.scene.add(this.beam);
    this.shots = [];
    this.shotGeo = new THREE.SphereGeometry(0.35, 12, 8);
  }
  _build() {
    if (this.robot) { this.g.scene.remove(this.robot.root); }
    const Cls = this.kind === 'mimic' ? this.g.heroClass() : this.g.voltClass;
    const r = new Cls();
    darken(r.root, 0xff2010, this.kind === 'mimic' ? 0xff2a10 : 0xd01030);
    r.eyeColor = new THREE.Color(1, 0.1, 0.05);
    r.laserGlow = new THREE.Color(4, 0.4, 0.2);
    if (r.root.scale.x !== 1) r.root.scale.setScalar(r.root.scale.x); // keep a hero's own size (Titan is big)
    this.robot = r; this.heroCls = Cls;
  }
  get radius() { return 0.55 * this.robot.root.scale.x; }
  _axis(a, b) { a.copy(this.pos); b.copy(this.pos).y += 1.95 * this.robot.root.scale.x; }
  _distTo(p) { this._axis(_a, _b); const ab = _b.sub(_a); const t = Math.max(0, Math.min(1, _v.subVectors(p, _a).dot(ab) / ab.lengthSq())); return _v.copy(_a).addScaledVector(ab, t).distanceTo(p); }
  rayHit(o, d, maxT) {
    if (!this.active || this.dead) return null;
    const mid = new THREE.Vector3().copy(this.pos); mid.y += 1;
    const tc = new THREE.Vector3().subVectors(mid, o).dot(d);
    if (tc < 0 || tc > maxT + 2) return null;
    for (let t = Math.max(0, tc - 2.5); t < Math.min(maxT, tc + 2.5); t += 0.15) if (this._distTo(new THREE.Vector3().copy(o).addScaledVector(d, t)) < this.radius) return t;
    return null;
  }
  spawn(near) {
    if (!this.robot || (this.kind === 'mimic' && this.g.heroClass() !== this.heroCls)) this._build();
    const a = Math.random() * Math.PI * 2;
    this.pos.set(near.x + Math.cos(a) * 90, Math.max(30, near.y + 25), near.z + Math.sin(a) * 90);
    this.vel.set(0, 0, 0);
    this.max = this.baseHp; this.hp = this.max; this.active = true; this.dead = false; this.state = 'fly'; this.t = 0;
    this.mode = 'approach'; this.modeT = 2; this.fire = 1; this.beamT = 0; this.cool = 1.5;
    this.act = null; this.recent = []; this.onFoot = false; this.anim = {};
    if (this.kind === 'mimic') setTimeout(() => this.g.say?.(pick(['Is this what you look like from the outside?', 'Every move you make, I make better.', 'Two of you now. Only one leaves.'])), 600);
    this.g.scene.add(this.robot.root); this.robot.root.visible = true; this.robot.root.quaternion.identity();
    this.g.fx.wave(this.pos.clone(), 6, 0.4, new THREE.Color(4, 0.8, 0.5));
  }
  damage(n, at = null) {
    if (!this.active || this.dead) return;
    n *= this.g.dmgMul?.() ?? 1;
    this.hp -= n; this.g.onDamage?.(n);
    if (at && n > 15) { this.robot.hitReact(Math.min(30, n / 3), _v.subVectors(this.pos, at).setY(0).normalize()); this.vel.addScaledVector(_v.subVectors(this.pos, at).normalize(), Math.min(30, n * 0.3)); }
    if (this.hp <= 0) this._die();
  }
  blast(center, radius, strength) {
    if (!this.active || this.dead || this._self) return;
    const d = this._distTo(center) - this.radius;
    if (d < radius) this.damage(strength * Math.min(1, 1 - d / (radius + 1)) * 1.4, center);
  }
  _die() {
    this.dead = true; this.state = 'fall'; this.t = 0; this.beam.visible = false;
    this.vel.y = Math.min(this.vel.y, 0) - 5;
    this.g.onDefeat?.(this);
  }

  // a projectile that flies at the player and bursts
  _shot(from, target, speed, opts = {}) {
    const m = new THREE.Mesh(this.shotGeo, new THREE.MeshBasicMaterial({ color: opts.color || new THREE.Color(6, 1.5, 0.6) }));
    m.scale.setScalar(opts.size || 1); m.position.copy(from); this.g.scene.add(m);
    this.shots.push({ p: from.clone(), v: target.clone().sub(from).setLength(speed), m, life: opts.life || 4, home: opts.home || 0, dmg: opts.dmg || 14, r: opts.r || 5, grav: opts.grav || 0 });
  }
  // the Mimic turns the last power you used against you
  _mirror(power) {
    const g = this.g, pc = g.chest(), from = this.pos.clone().add(_v.set(0, 1.2, 0));
    const say = (t) => g.banner?.('MIMIC', t, 1);
    if (power === 'missiles' || power === 'drones' || power === 'storm') { say('copies your ' + power); for (let i = 0; i < 8; i++) setTimeout(() => this.active && !this.dead && this._shot(from.clone().add(_v.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2)), g.chest(), 38, { home: 2.5, dmg: 9, r: 4, color: new THREE.Color(5, 2.5, 0.8), size: 0.6 }), i * 90); }
    else if (power === 'meteor' || power === 'boulder') { say('copies your ' + power); const t = pc.clone(); this._shot(t.clone().add(_v.set(0, 90, 0)), t, 70, { dmg: 35, r: 9, size: 4, color: new THREE.Color(4, 1.4, 0.4) }); }
    else if (power === 'clap' || power === 'quake' || power === 'pound' || power === 'nova' || power === 'gravity slam') {
      say('copies your ' + power);
      const p = this.pos.clone(); g.fx.wave(p, 18, 0.45, new THREE.Color(3, 0.8, 0.5)); g.sfx.boom(1.2); g.blastAll(p, 18, 30, null, 0.8);
      const d = g.chest().distanceTo(p); if (d < 18) { g.knockPlayer(g.chest().sub(p), 40 * (1 - d / 20)); g.hurtPlayer(28 * (1 - d / 20)); }
    } else if (power === 'hole' || power === 'gravity' || power === 'lift') {
      say('copies your ' + power); g.knockPlayer(_v.subVectors(this.pos, g.chest()), 35); g.hurtPlayer(12);
    } else return false;
    return true;
  }

  // ---------------------------------------------------------------- the Mimic's brain
  // It fights the way you do: on foot if you're on foot (or can't fly), in the air if you fly. It picks
  // from a full move set, weighs each by range and the situation, and avoids repeating itself.
  _mimic(dt, to, d, pc) {
    const g = this.g, pl = g.player, kit = g.heroKit?.() || {}, canFly = kit.canFly !== false;
    const out = { laser: false, punchT: 0, boost: false };
    const an = this.anim = this.anim || {};
    an.charge = 0; an.punchT = undefined; an.holding = false; an.throwWind = 0; an.tk = false;
    an.throwT = Math.max(0, (an.throwT || 0) - dt * 2.5); an.clapT = Math.max(0, (an.clapT || 0) - dt / 0.38);
    // on foot or in the air, like you
    this.footT = !pl.flying && pl.grounded ? (this.footT || 0) + dt : 0;
    const foot = !canFly || this.footT > 2;
    if (foot !== this.onFoot && !(this.act && this.act.lockMode)) this.onFoot = foot;
    // your last power, turned back on you
    const lp = g.lastPower?.();
    if (lp && lp.t !== this.lastSeen && this.t > 1) { this.lastSeen = lp.t; if (this.cool <= 0 && this._mirror(lp.name)) this.cool = 2.5; }
    // it knows your wind-up: sidestep a charged punch and counter
    if (pl.charging && d < 7 && this.t - (this.evadeT ?? -9) > 3 && (!this.act || this.act.name !== 'grab')) { this.evadeT = this.t; this._start('evade'); g.say?.(pick(['I know that wind-up. It is mine too.', 'Too slow. I would know.'])); }
    if (!this.act) this._start(this._choose(d, foot));
    const A = this.act; A.t += dt;
    const fw = to.clone().setY(0).normalize();
    const moveTo = (p, sp) => {
      const dv = _b.subVectors(p, this.pos);
      if (this.onFoot) {
        const h = dv.clone().setY(0); const L = h.length();
        const v = L > 0.5 ? h.divideScalar(L).multiplyScalar(Math.min(sp, L * 3)) : h.set(0, 0, 0);
        this.vel.x += (v.x - this.vel.x) * Math.min(1, dt * 8); this.vel.z += (v.z - this.vel.z) * Math.min(1, dt * 8);
        if (this.grounded && dv.y > 3) this.vel.y = Math.min(30, 10 + dv.y * 1.6); // jump up to you
      } else this.vel.lerp(dv.clampLength(0, sp), Math.min(1, dt * 4));
      return dv.length();
    };
    const done = () => { this.recent = [A.name, ...(this.recent || [])].slice(0, 3); this.act = null; };
    const hit = (pow, kind, dmg) => { g.knockPlayer(fw.clone().add(_a.set(0, kind === 'uppercut' ? 0.8 : 0.25, 0)), pow, kind); g.hurtPlayer(dmg); g.sfx.boom(0.6 + pow / 100); };
    switch (A.name) {
      case 'punch': { // close in, wind up, lunge
        if (A.phase === 0) { if (moveTo(pc.clone().addScaledVector(fw, -3), this.onFoot ? 18 : 40) < 6 || A.t > 3) { A.phase = 1; A.t = 0; } }
        else if (A.phase === 1) { an.charge = Math.min(1, A.t / 0.45); this.vel.multiplyScalar(0.85); if (A.t > (A.fast ? 0.15 : 0.45)) { A.phase = 2; A.t = 0; this.vel.copy(to).setLength(70); g.sfx.whoosh(); } }
        else { an.punchT = Math.max(0, 1 - A.t / 0.4); if (d < 2.6) { hit(55, 'punch', 26); if (inTown(pc.x, pc.z)) g.smash(pc.clone(), 1.6, { vel: fw.clone().multiplyScalar(30), outward: 8, max: 600 }); this.vel.multiplyScalar(-0.3); done(); } else if (A.t > 0.45) done(); }
        break;
      }
      case 'combo': { // three jabs and an uppercut
        if (A.phase === 0) { if (moveTo(pc.clone().addScaledVector(fw, -1.8), this.onFoot ? 18 : 40) < 3 || A.t > 3) { A.phase = 1; A.t = 0; A.n = 0; } }
        else {
          moveTo(pc.clone().addScaledVector(fw, -1.8), 10);
          if (A.t > 0.22 * (A.n + 1) && A.n < 4) { A.n++; an.punchT = 1; this.jabT = 0.18; g.sfx.whoosh(); if (d < 3.4) { if (A.n < 4) hit(6, 'jab', 7); else hit(48, 'uppercut', 20); } }
          if (this.jabT > 0) { this.jabT -= dt; an.punchT = this.jabT / 0.18; }
          if (A.n >= 4 && A.t > 1.1) done();
        }
        break;
      }
      case 'grab': { // seize you, carry you up, hurl you down
        if (A.phase === 0) { if (moveTo(pc, this.onFoot ? 20 : 48) < 2.3) { if (g.shieldOn?.()) { done(); break; } A.phase = 1; A.t = 0; g.say?.(pick(['Hold still. I want to see how you break.', 'Got you.'])); } else if (A.t > 3.5) done(); }
        else if (A.phase === 1) {
          A.lockMode = true; this.onFoot = false; an.holding = true;
          this.vel.set(fw.x * 4, 16, fw.z * 4);
          const hand = this.robot.handWorld(-1, new THREE.Vector3());
          pl.pos.copy(hand).add(_a.set(0, 0.4, 0)); pl.vel.set(0, 0, 0); pl.stun = 0.3; pl.grounded = false;
          if (A.t > 1.0) { A.phase = 2; A.t = 0; an.throwT = 1; const dir = fw.clone().add(_a.set(0, -0.9, 0)); g.knockPlayer(dir, 80, 'slam'); pl.vel.y = -60; g.hurtPlayer(30); g.sfx.whoosh(); }
        } else { an.throwT = 1 - A.t * 2; if (A.t > 0.5) { A.lockMode = false; done(); } }
        break;
      }
      case 'car': { // grab a car and throw it, the way you would
        const c = A.car;
        if (!c || c.burnt || (c.held && c.held !== 'mimic')) { done(); break; }
        if (A.phase === 0) { if (moveTo(c.p.clone().add(_a.set(0, 1, 0)), this.onFoot ? 22 : 50) < 3.2) { g.cars.hold(c, 'mimic'); A.phase = 1; A.t = 0; g.say?.(pick(['You do this. I watched.', 'Your move. Borrowed.'])); } else if (A.t > 5) done(); }
        else {
          an.holding = A.phase === 1; this.vel.multiplyScalar(0.8);
          if (A.phase < 3) g.cars.carry(c, this.robot.handWorld(-1, new THREE.Vector3()).add(_a.set(0, 1, 0)), this.yaw);
          if (A.phase === 1 && A.t > 0.5) { A.phase = 2; A.t = 0; }
          if (A.phase === 2) { an.throwWind = Math.min(1, A.t / 0.3); if (A.t > 0.3) { A.phase = 3; A.t = 0; an.throwT = 1; const T = Math.max(0.4, c.p.distanceTo(pc) / 60); const v = pc.clone().addScaledVector(pl.vel, T * 0.7).sub(c.p).divideScalar(T); v.y += 10 * T; g.cars.release(c, v, 'dummy'); g.sfx.whoosh(); } }
          if (A.phase === 3 && A.t > 0.5) done();
        }
        break;
      }
      case 'laser': {
        moveTo(pc.clone().addScaledVector(fw, -16).add(_a.set(0, this.onFoot ? 0 : 4, 0)), 30);
        out.laser = A.t > 0.3; if (A.t > 2) done();
        break;
      }
      case 'slam': { // up high, then straight down on you
        A.lockMode = true; this.onFoot = false;
        if (A.phase === 0) { moveTo(pc.clone().add(_a.set(0, 20, 0)), 60); if (this.pos.y > pc.y + 16 || A.t > 1.6) { A.phase = 1; A.t = 0; A.tgt = pc.clone(); g.sfx.whoosh(); } }
        else {
          this.vel.copy(A.tgt).sub(this.pos).setLength(95); out.boost = true;
          if (this.pos.y <= floorAt(this.pos.x, this.pos.z) + 1.2 || this.pos.distanceTo(A.tgt) < 2 || A.t > 2) {
            const p = this.pos.clone(); g.fx.wave(p, 14, 0.4, new THREE.Color(3, 0.8, 0.5)); g.fx.ring(p.clone().setY(floorAt(p.x, p.z) + 0.1), 18); g.sfx.boom(1.6);
            if (inTown(p.x, p.z)) g.smash(p, 3.5, { vel: new THREE.Vector3(0, -15, 0), outward: 12, up: 6, max: 2000 });
            g.blastAll(p, 14, 35, null, 1);
            const pd = pc.distanceTo(p); if (pd < 13) { g.knockPlayer(pc.clone().sub(p), 45 * (1 - pd / 15)); g.hurtPlayer(28 * (1 - pd / 15)); }
            this.vel.set(0, 6, 0); A.lockMode = false; done();
          }
        }
        break;
      }
      case 'clap': {
        if (A.phase === 0) { if (moveTo(pc.clone().addScaledVector(fw, -7), this.onFoot ? 18 : 40) < 9 || A.t > 2.5) { A.phase = 1; A.t = 0; an.clapT = 1; } }
        else if (A.t > 0.2 && !A.fired) {
          A.fired = true; const p = this.pos.clone().add(_a.set(0, 1.3, 0)).addScaledVector(fw, 1.5);
          g.fx.wave(p, 6, 0.3, new THREE.Color(3, 1, 0.6)); g.sfx.boom(1.2); g.blastAll(p.clone().addScaledVector(fw, 5), 9, 30, fw, 0.4);
          if (d < 15 && to.clone().normalize().dot(fw) > 0.6) hit(45, 'blast', 22);
        } else if (A.t > 0.6) done();
        break;
      }
      case 'signature': { // your hero's own trademark
        const id = kit.id;
        if (id === 'volt') { // bolt dash: a telegraphed lightning streak straight through you
          if (A.phase === 0) { this.vel.multiplyScalar(0.8); an.charge = A.t / 0.5; for (let i = 0; i < 2; i++) g.fx.sparks.emit(this.pos.clone().add(_a.set(0, 1.2, 0)), _b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6), new THREE.Color(1.5, 3, 7), 0.2, 0, 0.03); if (A.t > 0.5) { A.phase = 1; A.t = 0; } }
          else if (!A.fired) {
            A.fired = true; const a = this.pos.clone().add(_a.set(0, 1, 0)), dir = to.clone().normalize(), b = pc.clone().addScaledVector(dir, 25);
            for (let k = 0; k <= 20; k++) { const q = a.clone().lerp(b, k / 20); if (inTown(q.x, q.z) && g.vox.solidAt(q.x, q.y, q.z)) g.smash(q, 1.6, { vel: dir.clone().multiplyScalar(25), outward: 6, max: 300 }); if (k % 2 === 0) g.fx.sparks.emit(q, _b.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(6), new THREE.Color(1.5, 3.5, 8), 0.3, 0.5, 0.04); }
            const ab = b.clone().sub(a), tt = Math.max(0, Math.min(1, pc.clone().sub(a).dot(ab) / ab.lengthSq()));
            if (a.clone().addScaledVector(ab, tt).distanceTo(pc) < 3) hit(50, 'blast', 30);
            this.pos.copy(b).y = Math.max(b.y - 1, floorAt(b.x, b.z)); this.vel.copy(dir).multiplyScalar(20); g.sfx.zap?.(1.5); g.sfx.boom(0.8);
          } else if (A.t > 0.4) done();
        } else if (id === 'titan') { // tears up a boulder and hurls it
          an.throwWind = Math.min(1, A.t / 0.6); this.vel.multiplyScalar(0.85);
          if (A.t > 0.6 && !A.fired) { A.fired = true; an.throwT = 1; const from = this.pos.clone().add(_a.set(0, 3, 0)); this._shot(from, pc.clone().add(_a.set(0, 4, 0)), 55, { size: 3.2, dmg: 34, r: 9, grav: 12, color: new THREE.Color(0.9, 0.8, 0.7) }); if (inTown(this.pos.x, this.pos.z)) g.smash(this.pos.clone(), 1.5, { up: 6, outward: 3, max: 200 }); }
          if (A.t > 1.1) done();
        } else { // Sentinel / Spectre: a missile barrage
          this.vel.multiplyScalar(0.9); an.tk = A.t < 0.3;
          if (!A.fired && A.t > 0.3) { A.fired = true; const from = this.pos.clone().add(_a.set(0, 1.5, 0)); for (let i = 0; i < 10; i++) setTimeout(() => this.active && !this.dead && this._shot(from.clone().add(_a.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2)), g.chest().add(_a.set(0, 8, 0)), 30, { home: 2.2, dmg: 8, r: 4, size: 0.55, color: new THREE.Color(5, 2.6, 0.9) }), i * 70); }
          if (A.t > 1.2) done();
        }
        break;
      }
      case 'evade': { // sidestep the punch, then hit back fast
        if (A.t < 0.35) { const side = new THREE.Vector3(-fw.z, 0, fw.x).multiplyScalar(A.side * 16); this.vel.x = side.x; this.vel.z = side.z; }
        else { this.act = { name: 'punch', t: 0, phase: 1, fast: true }; }
        break;
      }
      default: { // a breather: circle you
        this.ang = (this.ang ?? 0) + dt * 1.2;
        moveTo(new THREE.Vector3(pc.x + Math.cos(this.ang) * 12, pc.y + (this.onFoot ? 0 : 3), pc.z + Math.sin(this.ang) * 12), this.onFoot ? 12 : 30);
        if (A.t > 1.4) done();
      }
    }
    return out;
  }
  _start(name) { this.act = { name, t: 0, phase: 0, side: Math.random() < 0.5 ? -1 : 1 }; if (name === 'car') this.act.car = this._nearCar(); }
  _nearCar() { let best = null, bd = 50; for (const c of this.g.cars.cars) { if (c.held || c.burnt) continue; const d = c.p.distanceTo(this.pos); if (d < bd) { bd = d; best = c; } } return best; }
  _choose(d, foot) {
    const w = { punch: d < 35 ? 3 : 1, combo: d < 18 ? 2.5 : 0.4, grab: d < 22 ? 1.6 : 0.3, car: this._nearCar() && d > 6 ? 1.8 : 0, laser: d > 8 ? 1.2 : 0.3, slam: (!foot || d < 30) ? 1.4 : 0.4, clap: d < 14 ? 1.5 : 0.3, signature: 2, circle: 0.8 };
    for (const r of this.recent || []) if (w[r]) w[r] *= 0.2; // don't repeat itself
    let sum = 0; for (const k in w) sum += w[k];
    let r = Math.random() * sum; for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'punch';
  }

  update(dt) {
    if (!this.active) return;
    this._self = true;
    try { this._update(dt); } finally { this._self = false; }
  }
  _update(dt) {
    const g = this.g, R = this.robot, pc = g.chest(), pl = g.player;
    this.t += dt;
    const to = _a.subVectors(pc, this.pos); const d = to.length();
    let laser = false, punchT = 0, boost = false;
    if (this.state === 'fall') {
      this.vel.y -= 25 * dt; this.pos.addScaledVector(this.vel, dt);
      if (Math.random() < 0.6) g.fx.dust.emit(this.pos.clone().add(_v.set(0, 1, 0)), _v.set(0, 2, 0), new THREE.Color(0.15, 0.13, 0.12), 2, 1.5, 2, 0.5);
      if (this.pos.y <= floorAt(this.pos.x, this.pos.z)) {
        g.fx.wave(this.pos.clone(), 10, 0.4, new THREE.Color(4, 1.5, 0.6)); g.sfx.boom(1.6); g.blastAll(this.pos.clone(), 10, 25, null, 1);
        if (inTown(this.pos.x, this.pos.z)) g.smash(this.pos.clone(), 3, { outward: 10, up: 6, max: 1500 });
        this.active = false; g.scene.remove(R.root); return;
      }
    } else {
      this.modeT -= dt; this.cool -= dt;
      const want = new THREE.Vector3();
      if (this.kind === 'vanta') {
        if (this.modeT <= 0) { const r = Math.random(); this.mode = d > 60 ? (r < 0.6 ? 'ram' : 'strafe') : r < 0.35 ? 'circle' : r < 0.7 ? 'strafe' : 'ram'; this.modeT = this.mode === 'circle' ? 4 : this.mode === 'ram' ? 9 : 3.5; this.passDir = null; this.boomed = false; this.runup = this.mode === 'ram'; }
        if (this.mode === 'circle') {
          // tight duel: orbit you at 25 m, laser bursts
          this.ang = (this.ang ?? 0) + dt * 1.6;
          want.set(pc.x + Math.cos(this.ang) * 25, pc.y + 6 + Math.sin(this.t) * 4, pc.z + Math.sin(this.ang) * 25).sub(this.pos).multiplyScalar(4);
          this.vel.lerp(want.clampLength(0, 90), Math.min(1, dt * 3));
          laser = (this.t % 2.2) < 0.9 && d < 45;
        } else if (this.mode === 'strafe') {
          // high-speed pass straight through your position, firing as it closes
          if (!this.passDir) this.passDir = to.clone().normalize();
          const tgtV = _b.copy(this.passDir).multiplyScalar(240).addScaledVector(to.clone().normalize(), 80);
          this.vel.lerp(tgtV, Math.min(1, dt * 1.5)); boost = true;
          laser = d < 50 && to.dot(this.vel) > 0;
          if (d < 3) { g.knockPlayer(this.vel.clone(), 40, 'tackle'); g.hurtPlayer(22); this.passDir = null; this.modeT = 0.8; }
        } else if (this.runup) { // ram, part 1: peel away to get a long run at you
          this.vel.lerp(to.clone().setLength(-300).add(_v.set(0, 20, 0)), Math.min(1, dt * 2)); boost = true;
          if (d > 220) this.runup = false;
        } else { // ram, part 2: turn and come at you past Mach 1
          const tgtV = to.clone().setLength(470);
          this.vel.lerp(tgtV, Math.min(1, dt * 2.2)); boost = true; punchT = 0.8;
          if (!this.boomed && this.vel.length() > 343) { this.boomed = true; g.sonicBoomAt?.(this.pos.clone(), 1); }
          if (d < 3.5) { g.knockPlayer(this.vel.clone().add(_v.set(0, 60, 0)), 75, 'uppercut'); g.hurtPlayer(40); this.modeT = 0; this.vel.multiplyScalar(-0.3); }
        }
      } else { // mimic
        const A = this._mimic(dt, to, d, pc);
        laser = A.laser; punchT = A.punchT; boost = A.boost;
      }
      if (this.grounded !== undefined && this.onFoot) this.vel.y -= 32 * dt;
      this.pos.addScaledVector(this.vel, dt);
      // stay above ground and out of walls
      const fl = floorAt(this.pos.x, this.pos.z) + (this.onFoot ? 0 : 1);
      this.grounded = false;
      if (this.pos.y <= fl) { this.pos.y = fl; if (this.vel.y < 0) this.vel.y = 0; this.grounded = this.onFoot; }
      if (inTown(this.pos.x, this.pos.z) && g.vox.solidAt(this.pos.x, this.pos.y + 1, this.pos.z)) {
        if (this.vel.length() > 60) { g.smash(this.pos.clone().add(_v.set(0, 1, 0)), 2.2, { vel: this.vel.clone(), inherit: 0.7, outward: 8, up: 2, max: 600 }); this.vel.multiplyScalar(0.9); }
        else { this.pos.y += 4 * dt * 10; this.vel.multiplyScalar(0.5); }
      }
      // laser
      if (laser) {
        const e = R.eyeWorld(0, new THREE.Vector3());
        const tgt = pc.clone().add(_v.set(Math.sin(this.t * 7) * 0.8, Math.cos(this.t * 5) * 0.6, 0));
        const dir = tgt.clone().sub(e); const L = dir.length(); dir.divideScalar(L);
        const vh = inTown(e.x, e.z) ? g.vox.raycast(e, dir, L) : null;
        const end = vh ? e.clone().addScaledVector(dir, vh.t) : tgt;
        this.beam.visible = true; this.beam.position.copy(e); this.beam.lookAt(end); this.beam.scale.set(1, 1, e.distanceTo(end));
        if (!vh && end.distanceTo(pc) < 1.5) g.hurtPlayer((this.kind === 'vanta' ? 28 : 22) * dt);
        if ((this.beamT -= dt) <= 0) { this.beamT = 0.12; if (vh) g.smash(end.clone(), 0.7, { outward: 3, up: 2, noDust: true, max: 60 }); for (let i = 0; i < 3; i++) g.fx.sparks.emit(end, _v.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(10), new THREE.Color(6, 1.5, 0.6), 0.25, 0.8, 0.02); }
      } else this.beam.visible = false;
      const sp = this.vel.length();
      this.yaw = sp > 3 && !laser ? Math.atan2(this.vel.x, this.vel.z) : Math.atan2(to.x, to.z);
    }
    // shots
    for (const s of this.shots) {
      s.life -= dt;
      if (s.home) s.v.lerp(_v.subVectors(pc, s.p).setLength(s.v.length()), Math.min(1, dt * s.home));
      s.v.y -= s.grav * dt; s.p.addScaledVector(s.v, dt); s.m.position.copy(s.p);
      if (Math.random() < 0.5) g.fx.sparks.emit(s.p, _v.set(0, 0, 0), new THREE.Color(4, 1.4, 0.5), 0.2, 0, 0.03);
      const hitP = s.p.distanceTo(pc) < 1.4, gy = floorAt(s.p.x, s.p.z);
      if (hitP || s.life <= 0 || s.p.y < gy + 0.2 || (inTown(s.p.x, s.p.z) && g.vox.solidAt(s.p.x, s.p.y, s.p.z))) {
        s.dead = true; g.scene.remove(s.m);
        g.fx.wave(s.p.clone(), s.r, 0.3, new THREE.Color(4, 1.2, 0.5)); g.sfx.boom(Math.min(1.5, s.r / 6));
        if (inTown(s.p.x, s.p.z)) g.smash(s.p.clone(), s.r * 0.35, { outward: 8, up: 4, max: 800 });
        g.blastAll(s.p.clone(), s.r, 20, null, 0.6);
        const pd = s.p.distanceTo(pc); if (pd < s.r) { g.knockPlayer(_v.subVectors(pc, s.p), 25 * (1 - pd / (s.r + 1))); g.hurtPlayer(s.dmg * (1 - pd / (s.r + 1))); }
      }
    }
    this.shots = this.shots.filter((s) => !s.dead);
    // pose
    R.root.position.copy(this.pos); R.root.rotation.set(0, this.yaw, 0);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), v = this.vel;
    const an = this.anim || {};
    R.animate({ dt, flying: !this.onFoot, grounded: !!this.grounded, hSpeed: Math.hypot(v.x, v.z), fwdSpeed: v.x * sy + v.z * cy, sideSpeed: v.x * cy - v.z * sy, vSpeed: v.y, boost,
      aimPitch: -Math.atan2(to.y, Math.hypot(to.x, to.z)), aimYawRel: 0, turnRate: 0, charge: an.charge || (this.charge && this.mode === 'dash' && this.modeT > 0.9 ? this.charge : 0), punchT: an.punchT ?? punchT, holding: !!an.holding, throwWind: an.throwWind || 0, throwT: an.throwT || 0, laser, tk: !!an.tk, clapT: an.clapT || 0, accFwd: 0, accSide: 0 });
    this.charge = 0;
    R.root.updateMatrixWorld(true);
  }
}

// ---------------------------------------------------------------- the swarm
function swarmGeo() {
  const parts = [];
  const add = (g, x, y, z) => { g.translate(x, y, z); parts.push(g.toNonIndexed()); };
  add(new THREE.BoxGeometry(0.46, 0.4, 0.36), 0, 0.62, 0);
  add(new THREE.SphereGeometry(0.17, 10, 8), 0, 0.98, 0.02);
  for (const s of [-1, 1]) { add(new THREE.BoxGeometry(0.1, 0.42, 0.12), s * 0.14, 0.22, 0); add(new THREE.BoxGeometry(0.09, 0.34, 0.09), s * 0.3, 0.6, 0.06); }
  const pos = [], nor = [];
  for (const p of parts) { p.computeVertexNormals(); pos.push(...p.attributes.position.array); nor.push(...p.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
export class Swarm {
  constructor(g) {
    this.g = g; // { scene, fx, sfx, vox, player, chest(), knockPlayer, hurtPlayer, score, shieldOn() }
    this.bots = [];
    this.geo = swarmGeo();
    this.mat = new THREE.MeshStandardMaterial({ color: 0x3c3f45, metalness: 0.8, roughness: 0.35 });
    this.eyeGeo = new THREE.SphereGeometry(0.06, 8, 6);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.6, 0.3) });
  }
  get active() { return this.bots.length > 0; }
  get alive() { return this.bots.length; }
  spawn(n, near, at = null) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = at ? Math.random() * 3 : 30 + Math.random() * 25;
      const c = at || near;
      const p = new THREE.Vector3(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r);
      p.y = at ? at.y : floorAt(p.x, p.z);
      const m = new THREE.Mesh(this.geo, this.mat); m.castShadow = true;
      const e = new THREE.Mesh(this.eyeGeo, this.eyeMat); e.position.set(0, 0.99, 0.16); m.add(e);
      this.g.scene.add(m);
      this.bots.push({ m, p, v: at ? new THREE.Vector3((Math.random() - 0.5) * 12, 6 + Math.random() * 6, (Math.random() - 0.5) * 12) : new THREE.Vector3(), hp: 30, ph: Math.random() * 6, latched: null, climb: false, jumpT: Math.random() * 2, spd: 8 + Math.random() * 4 });
    }
  }
  clear() { for (const b of this.bots) this.g.scene.remove(b.m); this.bots = []; }
  _kill(b, burst = true) {
    b.dead = true; this.g.scene.remove(b.m);
    if (burst) { for (let i = 0; i < 8; i++) this.g.fx.sparks.emit(b.p.clone().add(_v.set(0, 0.6, 0)), _a.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(9), new THREE.Color(5, 2.5, 0.8), 0.25, 0.9, 0.02); this.g.sfx.clang?.(); }
    this.g.score?.(100);
  }
  damage(b, n) { b.hp -= n; if (b.hp <= 0 && !b.dead) this._kill(b); }
  blast(center, radius, strength) { if (strength < 5) return; for (const b of this.bots) if (!b.dead && b.p.distanceTo(center) < radius + 0.6) { this.damage(b, strength * 1.5); if (!b.dead) { b.latched = null; b.v.add(_v.subVectors(b.p, center).setLength(strength * 0.5)).add(_a.set(0, strength * 0.3, 0)); } } }
  at(p, r = 1.2) { for (const b of this.bots) if (!b.dead && b.p.distanceTo(p) < r + 0.3) return b; return null; }
  rayHit(o, d, maxT) {
    let best = null;
    for (const b of this.bots) {
      if (b.dead) continue;
      const c = _b.copy(b.p); c.y += 0.6;
      const tc = _a.subVectors(c, o).dot(d); if (tc < 0 || tc > maxT) continue;
      const miss = _v.copy(o).addScaledVector(d, tc).distanceTo(c); if (miss < 0.6 && (!best || tc < best.t)) best = { t: tc, b };
    }
    return best;
  }
  // shake loose anything clinging on
  shake(vel) { for (const b of this.bots) if (b.latched) { b.latched = null; b.v.copy(vel || _v.set((Math.random() - 0.5) * 20, 8, (Math.random() - 0.5) * 20)).add(_a.set((Math.random() - 0.5) * 10, 6, (Math.random() - 0.5) * 10)); } }

  update(dt) {
    const g = this.g, pl = g.player, pc = g.chest();
    let clinging = 0;
    const fast = pl.vel.length() > 38;
    if (fast || g.shieldOn?.()) this.shake(null);
    for (const b of this.bots) {
      if (b.dead) continue;
      b.ph += dt * 14;
      if (b.latched) {
        // clinging on: ride along with you and chip away
        clinging++;
        b.p.copy(pc).add(b.latched);
        b.m.lookAt(pc);
        continue;
      }
      const to = _a.set(pl.pos.x - b.p.x, 0, pl.pos.z - b.p.z); const dh = to.length(); to.divideScalar(dh || 1);
      const gy = floorAt(b.p.x, b.p.z);
      const onGround = b.p.y <= gy + 0.02;
      if (onGround) {
        const hs = g.mind?.has('closer') ? 1.45 : 1; // hive protocols reach the swarm too
        b.v.x += (to.x * b.spd * hs - b.v.x) * Math.min(1, dt * 6); b.v.z += (to.z * b.spd * hs - b.v.z) * Math.min(1, dt * 6);
        // leap at you when you're close or above
        b.jumpT -= dt;
        if (b.jumpT <= 0 && b.p.distanceTo(pc) < (g.mind?.has('jets') ? 16 : 9)) { b.jumpT = 1.5 + Math.random(); const t = 0.6; b.v.set((pc.x - b.p.x) / t, (pc.y - b.p.y) / t + 10 * t * 0.5 + 3, (pc.z - b.p.z) / t); }
      }
      // climb straight up walls
      const ahead = _b.copy(b.p).addScaledVector(to, 0.5); ahead.y += 0.6;
      b.climb = inTown(b.p.x, b.p.z) && g.vox.solidAt(ahead.x, ahead.y, ahead.z);
      if (b.climb) { b.v.y = 5.5; b.v.x = to.x * 0.5; b.v.z = to.z * 0.5; }
      else if (!onGround) b.v.y -= 20 * dt;
      b.p.addScaledVector(b.v, dt);
      if (b.p.y < gy) { b.p.y = gy; if (b.v.y < 0) b.v.y = 0; }
      // standing on a roof
      if (!b.climb && inTown(b.p.x, b.p.z) && g.vox.solidAt(b.p.x, b.p.y - 0.05, b.p.z)) { if (b.v.y < 0) b.v.y = 0; b.p.y = Math.ceil(b.p.y * 2) / 2; }
      // grab on
      if (b.p.distanceTo(pc) < 1.3 && !fast) { b.latched = _v.subVectors(b.p, pc).setLength(0.55 + Math.random() * 0.2).clone(); g.sfx.clang?.(); }
      b.m.position.copy(b.p);
      b.m.rotation.set(b.climb ? -1.2 : Math.sin(b.ph) * 0.12, Math.atan2(to.x, to.z), 0);
      b.m.position.y += onGround ? Math.abs(Math.sin(b.ph)) * 0.08 : 0;
    }
    for (const b of this.bots) if (b.latched && !b.dead) { b.m.position.copy(b.p); }
    if (clinging) { g.hurtPlayer(clinging * 2.2 * dt); pl.vel.multiplyScalar(Math.max(0, 1 - clinging * 0.025 * dt * 60 / 60)); if (clinging >= 6 && Math.random() < dt) g.banner?.('SWARMED', 'boost (Shift) or raise your shield (5) to shake them off', 1.2); }
    this.bots = this.bots.filter((b) => !b.dead);
  }
}
