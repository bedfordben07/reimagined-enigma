// COLOSSUS: the boss that arrives every sixth wave. A 16 m android in black and crimson armour that falls
// out of the sky, strides through buildings, stomps out shockwaves, backhands you across the town, tears
// off chunks of building to throw, and sweeps a heat beam from its eyes. Everything that hurts the dummy
// hurts it too: punches, blasts, missiles, meteors, the laser.
import * as THREE from 'three';
import { Robot } from './robot.js';
import { retint } from './heroes.js';
import { brushedMetalTex, pbr } from './textures.js';
import { groundH } from './world.js';

const S = 8; // scale: the rig is ~2 m tall
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const inTown = (x, z) => Math.abs(x) < 182 && Math.abs(z) < 182;

export class Colossus {
  constructor(g) {
    this.g = g; // { scene, fx, sfx, vox, smash, blastAll, fire, player, chest(), knockPlayer, hurtPlayer, quake }
    this.active = false; this.robot = null;
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
    r.root.scale.setScalar(S);
    r.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    this.robot = r;
  }

  spawn(near, level = 0) {
    if (!this.robot) this._build();
    const a = Math.random() * Math.PI * 2;
    const x = Math.max(-150, Math.min(150, near.x + Math.cos(a) * 70)), z = Math.max(-150, Math.min(150, near.z + Math.sin(a) * 70));
    this.pos = new THREE.Vector3(x, 260, z);
    this.yaw = Math.atan2(near.x - x, near.z - z);
    this.max = Math.round(4000 * (1 + level * 0.6)); this.hp = this.max; this.level = level;
    this.state = 'drop'; this.t = 0; this.cool = 2; this.atk = null; this.vy = -60;
    this.active = true; this.dead = false;
    this.g.scene.add(this.robot.root);
    this.robot.root.quaternion.identity(); this.robot.root.visible = true;
    this.anim = { charge: 0, punchT: 0, throwWind: 0, throwT: 0, laser: false, speed: 0 };
  }

  // top of the head and the feet, for hit tests
  _axis(a, b) { a.copy(this.pos); b.copy(this.pos).y += 1.95 * S; }
  _distTo(p) { this._axis(_a, _b); const ab = _b.sub(_a); const t = Math.max(0, Math.min(1, _v.subVectors(p, _a).dot(ab) / ab.lengthSq())); return _v.copy(_a).addScaledVector(ab, t).distanceTo(p); }
  get radius() { return 0.42 * S; }

  damage(n, at = null) {
    if (!this.active || this.dead || this.state === 'drop') return;
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
    for (let t = 0; t < maxT; t += 1.5) { if (this._distTo(_b.copy(o).addScaledVector(d, t)) < this.radius) return t; }
    return null;
  }

  _die() {
    this.dead = true; this.state = 'fall'; this.t = 0; this.atk = null; this.anim.laser = false; this.beam.visible = false;
    this.fallAxis = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); // topple forward
    this.g.onDefeat?.();
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
      if (!this.atk && d > 13 && Math.abs(dy) < 1.2) {
        walk = 1;
        const sp = 9 + this.level * 2;
        this.pos.x += Math.sin(this.yaw) * sp * dt; this.pos.z += Math.cos(this.yaw) * sp * dt;
        this.pos.y = inTown(this.pos.x, this.pos.z) ? 0 : groundH(this.pos.x, this.pos.z);
        this.smashT = (this.smashT || 0) - dt;
        if (this.smashT <= 0 && inTown(this.pos.x, this.pos.z)) {
          this.smashT = 0.12;
          const fw = _a.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          const p = this.pos.clone().addScaledVector(fw, 2.2 + Math.random() * 1.5).add(_b.set((Math.random() - 0.5) * 5, 1 + Math.random() * 14, 0));
          if (g.vox.solidAt(p.x, p.y, p.z)) g.smash(p, 2.4, { vel: fw.clone().multiplyScalar(14), inherit: 1, outward: 8, up: 3, max: 600 });
        }
        // footfalls
        this.stepT = (this.stepT || 0) - dt;
        if (this.stepT <= 0) { this.stepT = 0.5; g.shake(Math.max(0, 0.25 - d / 400)); g.sfx.boom(0.5); g.fx.ring(this.pos.clone(), 6); g.blastAll(this.pos.clone(), 8, 10, null, 0.6); }
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
    const pitch = Math.atan2(g.chest().y - (this.pos.y + 1.8 * S), Math.max(1, d));
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
