// COLOSSUS: a giant boss you can summon. A 16 m android in black and crimson armour that falls
// out of the sky, strides through buildings, stomps out shockwaves, backhands you across the town, tears
// off chunks of building to throw, and sweeps a heat beam from its eyes. Everything that hurts the dummy
// hurts it too: punches, blasts, missiles, meteors, the laser.
import * as THREE from 'three';
import { Robot } from './robot.js?v=1795648513';
import { retint } from './heroes.js?v=1795648513';
import { brushedMetalTex, pbr } from './textures.js?v=1795648513';
import { groundH } from './world.js?v=1795648513';

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _r1 = new THREE.Vector3(), _r2 = new THREE.Vector3();
const inTown = (x, z) => Math.abs(x) < 182 && Math.abs(z) < 182;

export class Colossus {
  constructor(g) {
    this.g = g; // { scene, fx, sfx, vox, smash, blastAll, fire, player, chest(), knockPlayer, hurtPlayer, quake }
    this.active = false; this.robot = null;
    this.S = 8; this.name = 'COLOSSUS'; this.baseHp = 4000; this.walkSpeed = 9; this.reach = 13; this.dropH = 260; this.score = 10000;
    this.rocks = [];
    const bm = new THREE.MeshBasicMaterial({ color: new THREE.Color(10, 1.2, 0.6), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 12, 1, true), bm);
    this.beam.geometry.translate(0, 0.5, 0); this.beam.geometry.rotateX(Math.PI / 2); // along +Z from its origin
    this.beam.visible = false; this.beam.userData.noOutline = true; g.scene.add(this.beam);
    this.rockGeo = new THREE.DodecahedronGeometry(2.4, 0);
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8278, roughness: 0.95, flatShading: true });
  }

  _build() {
    const r = new Robot();
    retint(r, {
      silver: pbr(brushedMetalTex(81, '#2a2c31', 0.3), { metalness: 0.9, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 1.6 }, THREE.MeshPhysicalMaterial),
      steel: pbr(brushedMetalTex(82, '#7a1414', 0.32), { metalness: 0.85 }),
      graphite: pbr(brushedMetalTex(83, '#141518', 0.4), { metalness: 0.8 }),
    }, 0xff2010, 0xff3010);
    r.eyeIntensity = 12;
    r.root.scale.setScalar(this.S);
    r.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    this.robot = r;
  }

  spawn(near, level = 0, at = null) {
    if (!this.robot) this._build();
    const a = Math.random() * Math.PI * 2;
    const x = at ? at.x : near.x + Math.cos(a) * 70, z = at ? at.z : near.z + Math.sin(a) * 70;
    this.pos = new THREE.Vector3(x, (inTown(x, z) ? 0 : groundH(x, z)) + this.dropH, z);
    this.yaw = Math.atan2(near.x - x, near.z - z);
    this.max = Math.round(this.baseHp * (1 + level * 0.6)); this.hp = this.max; this.level = level;
    this.crashed = false; this.rocks.forEach((k) => this.g.scene.remove(k.m)); this.rocks = [];
    this.state = 'drop'; this.t = 0; this.cool = 2; this.atk = null; this.vy = -60;
    this.active = true; this.dead = false;
    this.g.scene.add(this.robot.root);
    this.robot.root.quaternion.identity(); this.robot.root.visible = true;
    this.anim = { charge: 0, punchT: 0, throwWind: 0, throwT: 0, laser: false, speed: 0 };
  }

  // top of the head and the feet, for hit tests
  _axis(a, b) { a.copy(this.pos); b.copy(this.pos).y += 1.95 * this.S; }
  _distTo(p) { this._axis(_a, _b); const ab = _b.sub(_a); const t = Math.max(0, Math.min(1, _v.subVectors(p, _a).dot(ab) / ab.lengthSq())); return _v.copy(_a).addScaledVector(ab, t).distanceTo(p); }
  get radius() { return 0.42 * this.S; }

  damage(n, at = null) {
    if (!this.active || this.dead || this.state === 'drop') return;
    n *= this.g.dmgMul?.() ?? 1;
    this.hp -= n; this.g.onDamage?.(n);
    if (at && n > 20) { this.robot.hitReact(Math.min(17, n / 4), _v.subVectors(this.pos, at).setY(0).normalize()); for (let i = 0; i < 8; i++) this.g.fx.sparks.emit(at, _a.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(20), new THREE.Color(5, 3, 1.5), 0.3, 0.8, 0.02); }
    if (this.hp <= 0) this._die();
  }
  blast(center, radius, strength) {
    if (!this.active || this.dead || this._self) return; // its own stomps don't count
    const d = this._distTo(center) - this.radius;
    if (d < radius) this.damage(strength * Math.min(1, 1 - d / (radius + 1)) * 1.5, center);
  }
  // ray against the body capsule: returns the distance along the ray, or null
  rayHit(o, d, maxT) {
    if (!this.active || this.dead) return null;
    // quick reject: is the ray anywhere near the body at all?
    const mid = _r1.copy(this.pos); mid.y += 0.97 * this.S;
    const tc = Math.max(0, _r2.subVectors(mid, o).dot(d));
    if (tc - this.S * 1.2 > maxT || _r2.copy(o).addScaledVector(d, tc).distanceTo(mid) > this.S * 1.1 + this.radius) return null;
    // march finely through the body (step scales with its size, so a slim boss can't be skipped)
    const step = Math.max(0.15, this.radius * 0.35);
    for (let t = Math.max(0, tc - this.S * 1.3); t < Math.min(maxT, tc + this.S * 1.3); t += step) { if (this._distTo(_r2.copy(o).addScaledVector(d, t)) < this.radius) return t; }
    return null;
  }

  _die() {
    this.dead = true; this.state = 'fall'; this.t = 0; this.atk = null; this.anim.laser = false; this.beam.visible = false;
    this.fallAxis = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); // topple forward
    this.g.onDefeat?.(this);
  }

  update(dt) {
    if (!this.active) return;
    this._self = true;
    try { this._update(dt); } finally { this._self = false; }
  }
  _update(dt) {
    const g = this.g, pl = g.player, R = this.robot, A = this.anim;
    this.t += dt;
    const toP = _v.subVectors(pl.pos, this.pos).setY(0), d = toP.length();
    const gy = inTown(this.pos.x, this.pos.z) ? 0 : groundH(this.pos.x, this.pos.z);
    let walk = 0;
    A.punchT = Math.max(0, A.punchT - dt / 0.5); A.throwT = Math.max(0, A.throwT - dt * 2.5);

    if (this.state === 'drop') {
      this.vy -= 40 * dt; this.pos.y += this.vy * dt;
      if (Math.random() < 0.8) g.fx.dust.emit(_a.copy(this.pos).add(_b.set(0, 8, 0)), _b.set(0, 20, 0), new THREE.Color(3, 1, 0.4), 4, 0.5, 1.5, 0.6);
      if (this.pos.y <= gy) {
        this.pos.y = gy; this.state = 'walk';
        g.smash(this.pos.clone().add(_b.set(0, 0.5, 0)), 7, { outward: 18, up: 10, max: 4000 });
        g.blastAll(this.pos.clone(), 45, 40, null, 1);
        g.fx.wave(this.pos.clone().add(_b.set(0, 1, 0)), 30, 0.6, new THREE.Color(3, 1, 0.4)); g.fx.ring(this.pos.clone(), 45); g.fx.addScorch(this.pos.clone(), 14);
        g.sfx.boom(2); g.sfx.thunder?.(0.05, 1); g.shake(1); g.hitstop(0.12);
        const pd = g.chest().distanceTo(this.pos);
        if (pd < 45) { g.knockPlayer(_a.subVectors(g.chest(), this.pos), 40 * (1 - pd / 50)); g.hurtPlayer(25 * (1 - pd / 50)); }
      }
    } else if (this.state === 'walk') {
      // turn toward you and come on; plough through whatever is in the way
      const want = Math.atan2(toP.x, toP.z);
      let dy = want - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += Math.max(-1.4 * dt, Math.min(1.4 * dt, dy));
      this.cool -= dt;
      if (!this.atk && d > this.reach && Math.abs(dy) < 1.2) {
        walk = 1;
        const sp = this.walkSpeed + this.level * 2;
        this.pos.x += Math.sin(this.yaw) * sp * dt; this.pos.z += Math.cos(this.yaw) * sp * dt;
        this.pos.y = inTown(this.pos.x, this.pos.z) ? 0 : groundH(this.pos.x, this.pos.z);
        this.smashT = (this.smashT || 0) - dt;
        if (this.smashT <= 0 && inTown(this.pos.x, this.pos.z)) {
          this.smashT = 0.12;
          const fw = _a.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          const p = this.pos.clone().addScaledVector(fw, 2.2 + Math.random() * 1.5).add(_b.set((Math.random() - 0.5) * 0.6 * this.S, 0.5 + Math.random() * 1.75 * this.S, 0));
          if (g.vox.solidAt(p.x, p.y, p.z)) g.smash(p, 0.3 * this.S + 0.4, { vel: fw.clone().multiplyScalar(14), inherit: 1, outward: 8, up: 3, max: 600 });
        }
        // footfalls
        this.stepT = (this.stepT || 0) - dt;
        if (this.stepT <= 0) { this.stepT = 0.5 * Math.sqrt(this.S / 8); g.shake(this.S / 8 * Math.max(0, 0.25 - d / 400)); g.sfx.boom(0.5); g.fx.ring(this.pos.clone(), 0.75 * this.S); if (this.S > 4) g.blastAll(this.pos.clone(), this.S, 10, null, 0.6); }
      }
      if (!this.atk && this.cool <= 0) this._choose(d, pl);
      if (this.atk) this._attack(dt, d);
    } else if (this.state === 'fall') {
      // keel over, crash down, then sink away
      const u = Math.min(1, this.t / 2.2), ang = u * u * Math.PI / 2;
      R.root.quaternion.setFromAxisAngle(this.fallAxis, ang).multiply(_q1.setFromAxisAngle(_y1, this.yaw));
      if (Math.random() < 0.5) g.fire.explode?.(this.pos.clone().add(_b.set((Math.random() - 0.5) * 6, 4 + Math.random() * 10, (Math.random() - 0.5) * 6)));
      if (u >= 1 && !this.crashed) {
        this.crashed = true;
        const fw = _a.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        for (let k = 1; k <= 4; k++) { const p = this.pos.clone().addScaledVector(fw, k * 3.5).add(_b.set(0, 1, 0)); g.smash(p, 4, { outward: 14, up: 8, max: 2000 }); g.blastAll(p, 20, 35, null, 1); }
        g.fx.wave(this.pos.clone().addScaledVector(fw, 8), 40, 0.7, new THREE.Color(3, 1.2, 0.5));
        g.sfx.boom(2); g.sfx.thunder?.(0, 1); g.shake(1);
      }
      if (this.t > 6) { R.root.position.y -= dt * 3; }
      if (this.t > 9) { this.active = false; g.scene.remove(R.root); this.crashed = false; }
    }
    // rocks in flight
    for (const k of this.rocks) {
      k.v.y -= 20 * dt; k.p.addScaledVector(k.v, dt); k.m.position.copy(k.p); k.m.rotation.x += dt * 3; k.m.rotation.z += dt * 2;
      const hit = k.p.y < (inTown(k.p.x, k.p.z) ? 0.5 : groundH(k.p.x, k.p.z)) || (inTown(k.p.x, k.p.z) && g.vox.solidAt(k.p.x, k.p.y, k.p.z)) || k.p.distanceTo(g.chest()) < 4;
      if (hit) {
        k.dead = true; g.scene.remove(k.m);
        g.smash(k.p.clone(), 3.5, { vel: k.v.clone().multiplyScalar(0.4), outward: 12, up: 5, max: 1500 }); g.blastAll(k.p.clone(), 16, 35, null, 0.8);
        g.fx.wave(k.p.clone(), 8, 0.35); g.sfx.boom(1.4); g.shake(0.4);
        const pd = k.p.distanceTo(g.chest()); if (pd < 9) { g.knockPlayer(_a.subVectors(g.chest(), k.p), 45 * (1 - pd / 10)); g.hurtPlayer(30 * (1 - pd / 10)); }
      }
    }
    this.rocks = this.rocks.filter((k) => !k.dead);
    // pose the rig
    if (this.state !== 'fall') { R.root.position.copy(this.pos); R.root.rotation.set(0, this.yaw, 0); } else R.root.position.copy(this.pos).y += Math.max(0, this.t - 6) * -3;
    let rel = Math.atan2(toP.x, toP.z) - this.yaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const pitch = Math.atan2(g.chest().y - (this.pos.y + 1.8 * this.S), Math.max(1, d));
    R.animate({ dt, flying: false, grounded: this.state !== 'drop', hSpeed: walk * 4.5, fwdSpeed: walk * 4.5, sideSpeed: 0, vSpeed: this.state === 'drop' ? -20 : 0, boost: false,
      aimPitch: -pitch, aimYawRel: Math.max(-1, Math.min(1, rel)), turnRate: 0, charge: A.charge, punchT: A.punchT, holding: false, throwWind: A.throwWind, throwT: A.throwT, laser: A.laser, tk: false, clapT: 0, accFwd: 0, accSide: 0 });
    R.root.updateMatrixWorld(true);
    // eye beam
    if (A.laser && this._drawEnd) {
      const e = R.eyeWorld(0, _a);
      this.beam.visible = true; this.beam.position.copy(e); this.beam.lookAt(this._drawEnd);
      this.beam.scale.set(1 + Math.random() * 0.3, 1 + Math.random() * 0.3, e.distanceTo(this._drawEnd));
    } else this.beam.visible = false;
  }

  _choose(d, pl) {
    const air = pl.pos.y - this.pos.y > 10;
    const r = Math.random();
    let k;
    if (d < 20 && !air) k = r < 0.55 ? 'swipe' : 'stomp';
    else if (d < 32 && !air) k = r < 0.6 ? 'stomp' : 'throw';
    else if (air) k = r < 0.6 ? 'beam' : 'throw';
    else k = r < 0.5 ? 'throw' : 'beam';
    this.atk = { k, t: 0, fired: false };
    this.cool = Math.max(0.8, 2.2 - this.level * 0.4);
    this.g.dummySay?.({ swipe: 'Backhand!', stomp: 'TREMBLE!', throw: 'Catch!', beam: 'BURN.' }[k]);
  }
  _attack(dt, d) {
    const g = this.g, A = this.anim, K = this.atk;
    K.t += dt;
    const fw = _a.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    if (K.k === 'swipe') {
      A.charge = Math.min(1, K.t / 0.6);
      if (K.t > 0.6 && !K.fired) {
        K.fired = true; A.charge = 0; A.punchT = 1;
        const hand = this.pos.clone().addScaledVector(fw, 9).add(_b.set(0, 10, 0));
        g.smash(hand, 4, { vel: fw.clone().multiplyScalar(25), outward: 12, up: 4, max: 1500 }); g.blastAll(hand, 14, 30, fw, 0.5);
        const pc = g.chest();
        if (pc.distanceTo(hand) < 12 || d < 13) { g.knockPlayer(fw.clone().add(_b.set(0, 0.3, 0)), 75, 'punch'); g.hurtPlayer(40); }
        g.sfx.whoosh(); g.shake(0.4);
      }
      if (K.t > 1.3) this.atk = null;
    } else if (K.k === 'stomp') {
      A.charge = Math.min(1, K.t / 0.8);
      if (K.t > 0.8 && !K.fired) {
        K.fired = true; A.charge = 0;
        const p = this.pos.clone().addScaledVector(fw, 2);
        g.smash(p.clone().add(_b.set(0, 0.3, 0)), 5, { outward: 14, up: 10, max: 2500 }); g.blastAll(p, 40, 38, null, 1.2);
        g.fx.wave(p.clone().add(_b.set(0, 0.5, 0)), 35, 0.6, new THREE.Color(3, 1.2, 0.5)); g.fx.ring(p, 40); g.fx.addScorch(p, 10);
        g.sfx.boom(2); g.shake(0.9); g.hitstop(0.08);
        const pc = g.chest(), pd = Math.hypot(pc.x - p.x, pc.z - p.z);
        if (pd < 38 && pc.y - p.y < 8) { g.knockPlayer(_b.set(pc.x - p.x, 0, pc.z - p.z), 30 + 30 * (1 - pd / 38), 'slam'); g.hurtPlayer(35 * (1 - pd / 40)); }
      }
      if (K.t > 1.5) this.atk = null;
    } else if (K.k === 'throw') {
      A.throwWind = Math.min(1, K.t / 0.9);
      if (K.t > 0.9 && !K.fired) {
        K.fired = true; A.throwWind = 0; A.throwT = 1;
        const from = this.robot.handWorld(-1, new THREE.Vector3()).add(_b.set(0, 3, 0));
        if (inTown(this.pos.x, this.pos.z)) g.smash(from.clone().addScaledVector(fw, -4).setY(Math.max(2, from.y - 6)), 3, { outward: 6, up: 6, max: 800 });
        const tgt = g.chest().addScaledVector(g.player.vel, Math.min(1.4, from.distanceTo(g.chest()) / 60));
        const T = Math.max(0.6, from.distanceTo(tgt) / 60);
        const v = new THREE.Vector3((tgt.x - from.x) / T, (tgt.y - from.y) / T + 10 * T, (tgt.z - from.z) / T);
        const m = new THREE.Mesh(this.rockGeo, this.rockMat); m.castShadow = true; m.position.copy(from); g.scene.add(m);
        this.rocks.push({ p: from, v, m });
        g.sfx.whoosh(); g.sfx.crumble(200);
      }
      if (K.t > 1.5) { this.atk = null; A.throwT = 0; }
    } else if (K.k === 'beam') {
      // the heat beam drags across toward you; it cuts through anything between
      A.laser = K.t > 0.4;
      const e = this.robot.eyeWorld(0, new THREE.Vector3());
      const tgt = g.chest();
      if (!this.beamEnd || K.t < 0.45) this.beamEnd = this.pos.clone().addScaledVector(fw, 15).setY(this.pos.y);
      this.beamEnd.lerp(tgt, Math.min(1, dt * 1.6));
      const dir = _b.subVectors(this.beamEnd, e); const len = dir.length(); dir.divideScalar(len);
      const vh = inTown(e.x, e.z) || inTown(this.beamEnd.x, this.beamEnd.z) ? g.vox.raycast(e, dir, len) : null;
      const end = vh ? e.clone().addScaledVector(dir, vh.t) : this.beamEnd;
      if (A.laser) {
        this.beamTick = (this.beamTick || 0) - dt;
        if (this.beamTick <= 0) {
          this.beamTick = 0.08;
          g.smash(end.clone(), 1.8, { vel: dir.clone().multiplyScalar(10), outward: 6, up: 4, max: 500 });
          g.blastAll(end.clone(), 4, 14, dir, 0.6);
          if (Math.random() < 0.15) g.fire.ignite(end.clone().setY(Math.max(0.3, end.y)), { life: 5 });
          for (let i = 0; i < 6; i++) g.fx.sparks.emit(end, _a.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(18), new THREE.Color(6, 1.5, 0.5), 0.3, 0.9, 0.03);
        }
        if (end.distanceTo(tgt) < 3.5) { g.hurtPlayer(45 * dt); if (Math.random() < dt * 2) g.knockPlayer(dir.clone(), 14, 'blast'); }
      }
      this._drawEnd = end; // the drag target is beamEnd; the beam is drawn to whatever it hits first
      if (K.t > 3.4) { this.atk = null; A.laser = false; this.beamEnd = null; this._drawEnd = null; }
    }
    if (this.atk == null) { A.charge = 0; A.throwWind = 0; }
  }
}
const _q1 = new THREE.Quaternion(), _y1 = new THREE.Vector3(0, 1, 0);

// WARLORD: a conqueror-class tyrant (original design). About 4.6 m tall and built like a fortress:
// violet-black plate with gold trim, swept-back horns, and a massive power gauntlet on the right hand
// with a burning core. Smaller than Colossus but fast, cunning and brutal: it blinks behind you,
// hammers you up close, fires gauntlet orbs, leaps in for crushing slams and flings cars with its mind.
class BruteRig extends Robot {
  _physique() { super._physique({ chest: 1.5, shoulders: 1.42, arms: 1.6, hands: 1.35, waist: 1.12, thigh: 1.42, calf: 1.32 }); }
}
export class Warlord extends Colossus {
  constructor(g) {
    super(g);
    this.S = 2.3; this.name = 'WARLORD'; this.baseHp = 6500; this.walkSpeed = 11; this.reach = 3.2; this.dropH = 45; this.score = 15000;
    this.orbs = [];
    this.orbGeo = new THREE.SphereGeometry(0.7, 20, 14);
    this.orbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.2, 7) });
  }
  _build() {
    const r = new BruteRig();
    const gold = pbr(brushedMetalTex(92, '#c9a23a', 0.25), { metalness: 1 });
    retint(r, {
      silver: pbr(brushedMetalTex(91, '#6a4f8c', 0.28), { metalness: 0.75, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 1.6 }, THREE.MeshPhysicalMaterial),
      steel: gold,
      graphite: pbr(brushedMetalTex(93, '#16121c', 0.4), { metalness: 0.8 }),
    }, 0xb040ff, 0xd070ff);
    r.eyeIntensity = 10;
    const M = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    // swept-back horns and a crest
    for (const sx of [-1, 1]) {
      const h = M(new THREE.ConeGeometry(0.055, 0.5, 12), gold, r.head, 0.1 * sx, 0.16, -0.04);
      h.rotation.set(-0.9, 0, -sx * 0.55);
    }
    M(new THREE.ConeGeometry(0.02, 0.16, 6), gold, r.head, 0, 0.17, 0.04).rotation.x = -0.4;
    // the power gauntlet: an armoured shell over the right fist, a burning core, gold knuckle plates
    const hand = r.arms[1].hand;
    const shell = M(new THREE.SphereGeometry(0.11, 20, 14), gold, hand, 0, -0.06, 0); shell.scale.set(1, 1.3, 1);
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 1.6, 8) });
    this.core = M(new THREE.SphereGeometry(0.045, 16, 10), coreMat, hand, 0, -0.04, 0.1); this.core.castShadow = false;
    for (let i = 0; i < 4; i++) M(new THREE.BoxGeometry(0.03, 0.05, 0.03), gold, hand, -0.05 + i * 0.033, -0.17, 0.06);
    // shoulder spikes
    for (const sx of [-1, 1]) M(new THREE.ConeGeometry(0.03, 0.18, 8), gold, r.arms[sx].sh, 0.06 * sx, 0.09, 0).rotation.z = -sx * 0.5;
    r.root.scale.setScalar(this.S);
    r.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.robot = r;
  }
  spawn(near, level = 0, at = null) {
    super.spawn(near, level, at || near.clone().add(new THREE.Vector3(Math.cos(Math.random() * 6.28) * 30, 0, Math.sin(Math.random() * 6.28) * 30)));
    this.orbs.forEach((o) => this.g.scene.remove(o.m)); this.orbs = [];
    this.cool = 1;
  }
  _blinkFx(p) {
    const g = this.g;
    g.fx.wave(p.clone().add(_b.set(0, 2, 0)), 6, 0.35, new THREE.Color(3, 1, 5));
    for (let i = 0; i < 30; i++) g.fx.sparks.emit(p.clone().add(_b.set(0, 2, 0)), _a.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(14), new THREE.Color(3, 1, 6), 0.4, 0.2, 0.03);
    g.sfx.zap?.(1.2);
  }
  get radius() { return 0.62 * this.S; } // its arms and shoulders are wide
  _choose(d, pl) {
    const g = this.g, air = pl.pos.y - this.pos.y > 6, r = Math.random();
    const car = d > 10 && g.cars?.cars.find((c) => !c.held && !c.burnt && c.p.distanceTo(this.pos) < 35);
    let k;
    // blinking is rare: at most once every 9 seconds, and mostly when you've got well away from it
    const canBlink = this.t - (this.lastBlink ?? -99) > 9;
    if (d < 5 && !air) k = r < 0.75 ? 'hammer' : 'slam';
    else if (canBlink && d > 35 && r < 0.3) k = 'blink';
    else if (air) k = r < 0.75 ? 'orb' : canBlink && r < 0.85 ? 'blink' : 'orb';
    else if (car && r < 0.3) k = 'fling';
    else k = r < 0.5 ? 'orb' : 'slam';
    if (k === 'blink') this.lastBlink = this.t;
    this.atk = { k, t: 0, fired: false, car };
    this.cool = Math.max(0.35, 0.9 - this.level * 0.15);
  }
  _attack(dt, d) {
    const g = this.g, A = this.anim, K = this.atk;
    K.t += dt;
    const fw = _a.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).clone();
    const S = this.S;
    if (K.k === 'hammer') {
      A.charge = Math.min(1, K.t / 0.4);
      if (K.t > 0.4 && !K.fired) {
        K.fired = true; A.charge = 0; A.punchT = 1;
        const hand = this.pos.clone().addScaledVector(fw, 2.2).add(_b.set(0, 2.6, 0));
        g.smash(hand, 2.2, { vel: fw.clone().multiplyScalar(25), outward: 10, up: 4, max: 800 }); g.blastAll(hand, 8, 28, fw, 0.5);
        g.fx.wave(hand, 4, 0.25, new THREE.Color(3, 1, 5));
        if (g.chest().distanceTo(hand) < 4.5) { g.knockPlayer(fw.clone().add(_b.set(0, 0.35, 0)), 70, 'punch'); g.hurtPlayer(38); }
        g.sfx.boom(1); g.shake(0.3);
      }
      if (K.t > 0.9) this.atk = null;
    } else if (K.k === 'orb') {
      A.charge = Math.min(1, K.t / 0.6);
      this.core.scale.setScalar(1 + A.charge * 2.5);
      if (K.t > 0.6 && !K.fired) {
        K.fired = true; A.charge = 0; A.punchT = 1; this.core.scale.setScalar(1);
        const from = this.robot.handWorld(1, new THREE.Vector3());
        const tgt = g.chest().addScaledVector(g.player.vel, Math.min(1, from.distanceTo(g.chest()) / 70));
        const m = new THREE.Mesh(this.orbGeo, this.orbMat); m.position.copy(from); g.scene.add(m);
        this.orbs.push({ p: from, v: tgt.sub(from).setLength(70), m, life: 4 });
        g.sfx.zap?.(1.5);
      }
      if (K.t > 1.0) this.atk = null;
    } else if (K.k === 'blink') {
      // telegraphed: it gathers violet energy for most of a second, then vanishes and reappears a few
      // metres from you, and pauses before it swings, so you can see it coming and get away
      A.charge = Math.min(1, K.t / 0.8);
      if (!K.fired && Math.random() < 0.6) g.fx.sparks.emit(this.pos.clone().add(_b.set((Math.random() - 0.5) * 2, Math.random() * 4, (Math.random() - 0.5) * 2)), _b.set(0, 4, 0), new THREE.Color(3, 1, 6), 0.4, -0.3, 0.03);
      if (!K.fired && K.t > 0.8) {
        K.fired = true; this._blinkFx(this.pos); A.charge = 0;
        const pf = _b.set(Math.sin(g.player.yaw ?? 0), 0, Math.cos(g.player.yaw ?? 0));
        const to = g.player.pos.clone().addScaledVector(pf, -7).add(_a.set((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4));
        to.y = inTown(to.x, to.z) ? 0 : groundH(to.x, to.z);
        if (g.player.pos.y - to.y > 6) to.y = g.player.pos.y - 2.6; // it can hang in the air for a moment
        this.pos.copy(to); this.yaw = Math.atan2(g.player.pos.x - to.x, g.player.pos.z - to.z);
        this._blinkFx(this.pos);
      }
      if (K.fired && K.t > 1.5) { this.atk = null; this.cool = 1.2; }
    } else if (K.k === 'slam') {
      // leap high and come down on where you'll be
      if (!K.from) { K.from = this.pos.clone(); const tg = g.player.pos.clone().addScaledVector(g.player.vel, 0.6); K.to = new THREE.Vector3(tg.x, inTown(tg.x, tg.z) ? 0 : groundH(tg.x, tg.z), tg.z); K.dur = 0.55 + K.from.distanceTo(K.to) / 60; }
      const u = Math.min(1, K.t / K.dur);
      A.charge = u < 0.2 ? u * 5 : 0;
      this.pos.lerpVectors(K.from, K.to, u); this.pos.y += Math.sin(u * Math.PI) * (6 + K.from.distanceTo(K.to) * 0.25);
      if (u >= 1 && !K.fired) {
        K.fired = true;
        const p = this.pos.clone();
        g.smash(p.clone().add(_b.set(0, 0.4, 0)), 4, { outward: 16, up: 10, max: 2500 }); g.blastAll(p, 22, 40, null, 1.2);
        g.fx.wave(p.clone().add(_b.set(0, 0.5, 0)), 18, 0.45, new THREE.Color(3, 1, 5)); g.fx.ring(p, 24); g.fx.addScorch(p, 6);
        g.sfx.boom(1.8); g.shake(0.7); g.hitstop(0.06);
        const pc = g.chest(), pd = pc.distanceTo(p);
        if (pd < 20) { g.knockPlayer(_b.set(pc.x - p.x, 0, pc.z - p.z), 30 + 30 * (1 - pd / 20), 'slam'); g.hurtPlayer(32 * (1 - pd / 22)); }
      }
      if (K.t > K.dur + 0.4) this.atk = null;
    } else if (K.k === 'fling') {
      // seize a car with the gauntlet's power and hurl it
      const c = K.car;
      A.charge = Math.min(1, K.t / 0.7);
      if (c && !K.fired) { for (let i = 0; i < 2; i++) g.fx.sparks.emit(c.p, _b.set(Math.random() - 0.5, 1, Math.random() - 0.5).multiplyScalar(4), new THREE.Color(3, 1, 6), 0.3, -0.2, 0.03); }
      if (K.t > 0.7 && !K.fired) {
        K.fired = true; A.charge = 0; A.punchT = 1;
        if (c) { const v = g.chest().sub(c.p); const T = Math.max(0.5, v.length() / 55); v.divideScalar(T); v.y += 10 * T; g.cars.hit(c, c.p.clone(), v); c.thrownBy = 'dummy'; }
        g.sfx.whoosh();
      }
      if (K.t > 1.1) this.atk = null;
    }
    if (this.atk == null) A.charge = 0;
  }
  _update(dt) {
    super._update(dt);
    // gauntlet orbs: fast, straight, and they explode
    const g = this.g;
    for (const o of this.orbs) {
      o.life -= dt; o.p.addScaledVector(o.v, dt); o.m.position.copy(o.p); o.m.scale.setScalar(1 + Math.random() * 0.2);
      if (Math.random() < 0.7) g.fx.sparks.emit(o.p, _b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3), new THREE.Color(3, 1, 6), 0.25, 0, 0.03);
      const gy = inTown(o.p.x, o.p.z) ? 0 : groundH(o.p.x, o.p.z);
      if (o.life <= 0 || o.p.y < gy + 0.3 || (inTown(o.p.x, o.p.z) && g.vox.solidAt(o.p.x, o.p.y, o.p.z)) || o.p.distanceTo(g.chest()) < 1.8) {
        o.dead = true; g.scene.remove(o.m);
        g.smash(o.p.clone(), 3, { outward: 12, up: 5, max: 1200 }); g.blastAll(o.p.clone(), 12, 34, null, 0.8);
        g.fx.wave(o.p.clone(), 9, 0.35, new THREE.Color(3, 1, 5)); g.sfx.boom(1.3); g.shake(0.35);
        const pd = o.p.distanceTo(g.chest()); if (pd < 8) { g.knockPlayer(_a.subVectors(g.chest(), o.p), 50 * (1 - pd / 9)); g.hurtPlayer(34 * (1 - pd / 9)); }
      }
    }
    this.orbs = this.orbs.filter((o) => !o.dead);
    if (this.core && this.active) this.core.material.color.setRGB(5 + Math.sin(this.t * 8) * 1.5, 1.6, 8);
  }
}
