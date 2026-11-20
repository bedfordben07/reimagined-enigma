// Extra playable heroes. Each reuses the shared android rig (springs, poses, hand jets) with its own
// armour finish, proportions and glow, plus its own kit: movement stats and a set of powers.
//   Volt  — a lean speedster: very fast flight and sprint, quick punches, overdrive (the world slows
//           around them), a called-down lightning storm and a lightning dash.
//   Titan — a huge bruiser that cannot fly: enormous jumps and punches, takes less damage, tears up
//           boulders to throw, ground-pounds from the sky and goes into a rage.
// Sentinel (all the original powers) and Spectre are unchanged.
import * as THREE from 'three';
import { Robot } from './robot.js';
import { brushedMetalTex, pbr } from './textures.js';

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

function retint(robot, swaps, glow, eye) {
  const map = new Map();
  for (const [k, mat] of Object.entries(swaps)) if (robot.mats[k]) map.set(robot.mats[k], mat);
  robot.root.traverse((o) => { if (o.isMesh && map.has(o.material)) o.material = map.get(o.material); });
  robot.glowMat.emissive.set(glow); robot.glowMat.color.set(glow).multiplyScalar(0.12);
  robot.eyeColor.set(eye);
  robot.jetMat.color.copy(robot.laserGlow);
  robot.handJetMats[1].color.copy(robot.laserGlow).multiplyScalar(0.9);
}

export const SENTINEL_KIT = {
  id: 'sentinel', canFly: true, fly: 26, boost: 125, walk: 8, sprint: 17, jump: 13, punch: 1, charge: 1, armor: 1, allowed: null,
  hud: [['Z', 'HOLE'], ['N', 'CLAP'], ['B', 'LIFT'], ['L', 'ZAP'], ['M', 'METEOR'], ['Y', 'BLINK'], ['P', 'GRAVITY'], ['U', 'DECOY'], ['1', 'MISSILES'], ['2', 'QUAKE'], ['3', 'TORNADO']],
};

export class Volt extends Robot {
  constructor() {
    super();
    this.name = 'Volt';
    this.blurb = 'speedster · overdrive · lightning';
    this.eyeIntensity = 7;
    this.laserCore = new THREE.Color(5, 8, 12);
    this.laserGlow = new THREE.Color(0.4, 2.2, 5);
    retint(this, {
      silver: pbr(brushedMetalTex(61, '#3a66c4', 0.28), { metalness: 0.9, envMapIntensity: 1.8, clearcoat: 0.6, clearcoatRoughness: 0.2 }, THREE.MeshPhysicalMaterial),
      steel: pbr(brushedMetalTex(62, '#f0cf3a', 0.3), { metalness: 0.95, envMapIntensity: 1.6 }),
      graphite: pbr(brushedMetalTex(63, '#1b2230', 0.4), { metalness: 0.85 }),
    }, 0x38c8ff, 0x60e0ff);
    this.kit = {
      id: 'volt', canFly: true, fly: 38, boost: 190, walk: 11, sprint: 34, jump: 15, punch: 0.85, charge: 2, armor: 0.9,
      allowed: new Set(['KeyX', 'KeyY', 'KeyL', 'KeyN', 'KeyB']),
      hud: [['1', 'OVERDRIVE'], ['2', 'STORM'], ['3', 'BOLT DASH'], ['L', 'ZAP'], ['Y', 'BLINK'], ['N', 'CLAP'], ['B', 'LIFT'], ['X', 'STOP TIME']],
    };
  }
  _physique() { super._physique({ chest: 1.04, shoulders: 1.02, arms: 1.05, hands: 1.0, waist: 0.8, thigh: 1.02, calf: 1.0 }); }
}

export class Titan extends Robot {
  constructor() {
    super();
    this.name = 'Titan';
    this.blurb = 'bruiser · no flight · boulders, ground pound';
    this.eyeIntensity = 6;
    this.laserCore = new THREE.Color(5, 12, 4);
    this.laserGlow = new THREE.Color(0.6, 4, 0.3);
    retint(this, {
      silver: pbr(brushedMetalTex(71, '#a39d8e', 0.4), { metalness: 0.8, envMapIntensity: 1.3, clearcoat: 0.1 }, THREE.MeshPhysicalMaterial),
      steel: pbr(brushedMetalTex(72, '#c4632c', 0.45), { metalness: 0.75 }),
      graphite: pbr(brushedMetalTex(73, '#6e604c', 0.45), { metalness: 0.85 }),
      core: new THREE.MeshStandardMaterial({ color: 0x3a3128, roughness: 0.5, metalness: 0.6 }),
    }, 0x4cff3a, 0x7dff5a);
    this.root.scale.setScalar(1.32);
    this.kit = {
      id: 'titan', canFly: false, fly: 0, boost: 0, walk: 7, sprint: 16, jump: 24, punch: 1.7, charge: 0.8, armor: 0.5,
      allowed: new Set(['KeyX', 'KeyN', 'KeyM', 'KeyB', 'KeyP']),
      hud: [['1', 'BOULDER'], ['2', 'GROUND POUND'], ['3', 'RAGE'], ['N', 'CLAP'], ['M', 'METEOR'], ['B', 'LIFT'], ['P', 'GRAVITY'], ['X', 'STOP TIME']],
    };
  }
  _physique() { super._physique({ chest: 1.42, shoulders: 1.3, arms: 1.55, hands: 1.35, waist: 1.08, thigh: 1.38, calf: 1.32 }); }
}

// Hero-specific powers. g: { scene, fx, sfx, vox, dummy, cars, props, birds, smash, blastAll, strike, quake,
// player, chest, aim(), aimDir(from), hand(side), shake, hitstop, fire }
export class HeroPowers {
  constructor(g) {
    this.g = g;
    this.overdrive = 0; this.odK = 0;      // Volt: world slows while > 0
    this.storms = []; this.dashes = [];
    this.boulders = []; this.pound = null; this.rage = 0;
    const arcs = new THREE.BufferGeometry();
    this.arcPos = new Float32Array(1200 * 3);
    arcs.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3));
    this.arcs = new THREE.LineSegments(arcs, new THREE.LineBasicMaterial({ color: new THREE.Color(2.5, 5, 9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.arcs.frustumCulled = false; this.arcs.visible = false; g.scene.add(this.arcs);
    this.arcT = 0; this.arcN = 0;
    this.rockGeo = new THREE.IcosahedronGeometry(1, 1);
    { const p = this.rockGeo.attributes.position; for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i); _v.multiplyScalar(0.8 + Math.abs(Math.sin(_v.x * 5.1 + _v.y * 3.7 + _v.z * 2.3)) * 0.35); p.setXYZ(i, _v.x, _v.y, _v.z); } this.rockGeo.computeVertexNormals(); }
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 0.95, flatShading: true });
  }
  get worldScale() { return 1 - 0.72 * this.odK; }

  _arc(a, b, rough = 0.15) {
    const n = Math.max(4, Math.min(30, Math.round(a.distanceTo(b) / 1.2))), L = a.distanceTo(b);
    let prev = a.clone();
    for (let i = 1; i <= n && this.arcN < 1198; i++) {
      const p = a.clone().lerp(b, i / n);
      if (i < n) p.add(_v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(L * rough * Math.sin(Math.PI * i / n)));
      this.arcPos.set([prev.x, prev.y, prev.z, p.x, p.y, p.z], this.arcN * 3); this.arcN += 2; prev = p;
    }
  }

  // ---------------------------------------------------------------- Volt
  toggleOverdrive() {
    const g = this.g;
    this.overdrive = this.overdrive > 0 ? 0 : 1e9; // no limit: toggles
    g.sfx.zap(1.5); g.sfx.freeze(this.overdrive > 0); setTimeout(() => g.sfx.world && g.sfx.world.frequency.setTargetAtTime(this.overdrive > 0 ? 2600 : 20000, g.sfx.ctx.currentTime, 0.1), 60);
    g.shake(0.15);
    if (this.overdrive > 0) g.dummy.say(['Why is everything... so... slow...', 'He is a BLUR!'], true);
  }
  storm() {
    const g = this.g, c = g.aim().clone();
    this.storms.push({ c, n: 9, t: 0 });
    g.sfx.thunder(0.2, 0.6);
  }
  boltDash() {
    const g = this.g, p = g.player;
    const from = g.chest(), dir = g.aimDir(from);
    let len = 48;
    const to = from.clone().addScaledVector(dir, len);
    if (to.y < 0.5) { to.y = 0.5; }
    // tear through everything along the line
    const steps = Math.ceil(from.distanceTo(to) / 1.4);
    const dc = g.dummy.chest(new THREE.Vector3());
    let hitD = false;
    for (let i = 1; i <= steps; i++) {
      const q = _a.copy(from).lerp(to, i / steps);
      if (g.vox.solidAt(q.x, q.y, q.z) || g.vox.solidAt(q.x, q.y + 0.8, q.z)) g.smash(q.clone(), 1.9, { vel: dir.clone().multiplyScalar(30), inherit: 1, outward: 6, up: 2, max: 200 });
      if (!hitD && dc.distanceTo(q) < 3) { hitD = true; g.dummy.hit(dc, 2.5, dir.clone().multiplyScalar(55).add(_b.set(0, 12, 0)), 1); g.dummy.burn += 0.3; g.dummy.say(['WHAT WAS THAT', 'I did not even SEE it!'], true); }
      if (i % 3 === 0) g.blastAll(q.clone(), 4, 18, dir, 0.5);
    }
    for (const c of g.cars.cars) if (!c.burnt && distToSeg(c.p, from, to) < 2.5) g.fire.heatCar(c, 0.6);
    this.dashes.push({ from: from.clone(), to: to.clone(), t: 0.35 });
    g.fx.wave(from, 3, 0.25, new THREE.Color(2, 4, 8)); g.fx.wave(to, 5, 0.3, new THREE.Color(2, 4, 8));
    for (let i = 0; i < 40; i++) g.fx.sparks.emit(_a.copy(from).lerp(to, Math.random()), _v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(18), new THREE.Color(2, 4.5, 8), 0.3 + Math.random() * 0.3, 0.6, 0.03);
    g.teleport(to.addScaledVector(UPV, -1.15));
    p.vel.copy(dir).multiplyScalar(30);
    g.sfx.zap(1.6); g.sfx.boom(0.7); g.shake(0.3); g.hitstop(0.05);
    g.birds.scare(to, 60);
  }

  // ---------------------------------------------------------------- Titan
  boulder() {
    const g = this.g;
    const hand = g.hand(-1).add(_v.set(0, 1.6, 0));
    const p = g.player.pos;
    // rip it out of the ground at your feet
    if (p.y < 0.5) { g.fx.ring(p.clone(), 4); g.blastAll(p.clone(), 5, 6, null, 1); }
    g.smash(p.clone().add(_v.set(0, 0.2, 0)), 1.2, { up: 6, outward: 2, noDust: false, max: 80 });
    const m = new THREE.Mesh(this.rockGeo, this.rockMat); m.castShadow = true; m.scale.setScalar(1.3);
    g.scene.add(m);
    const dir = g.aimDir(hand);
    this.boulders.push({ p: hand.clone(), v: dir.multiplyScalar(62).add(_v.set(0, 4, 0)), w: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), m, life: 6, hold: 0.12 });
    g.sfx.crumble(80); g.sfx.whoosh(); g.shake(0.15);
  }
  _boulderHit(B) {
    const g = this.g, c = B.p.clone();
    g.smash(c, 3.2, { vel: B.v.clone().multiplyScalar(0.5), inherit: 0.8, outward: 12, up: 4, max: 1400 });
    g.blastAll(c, 12, 34, B.v.clone().normalize(), 0.6);
    const dc = g.dummy.chest(new THREE.Vector3()); const dd = dc.distanceTo(c);
    if (dd < 6) { g.dummy.hit(dc, 3, B.v.clone().multiplyScalar(0.9).add(_v.set(0, 10, 0)), 1); g.dummy.say(['A ROCK?! Really?!', 'Ow. Geology.'], true); }
    g.fx.wave(c, 6, 0.35); g.fx.ring(c, 8);
    for (let i = 0; i < 30; i++) g.fx.dust.emit(c, _v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(14), new THREE.Color(0.55, 0.52, 0.48), 2 + Math.random() * 2, 1.5 + Math.random() * 2, 2.4, 0.5);
    g.sfx.boom(1.3); g.sfx.crumble(300); g.shake(0.45); g.hitstop(0.05);
    g.scene.remove(B.m);
  }
  groundPound() {
    const g = this.g, p = g.player;
    if (this.pound) return;
    this.pound = { phase: p.grounded ? 'rise' : 'dive', t: 0 };
    if (p.grounded) { p.vel.y = 34; p.grounded = false; g.sfx.whoosh(); g.fx.ring(p.pos.clone(), 5); }
  }
  _poundLand() {
    const g = this.g, p = g.player.pos.clone();
    g.smash(p.clone().add(_v.set(0, 0.3, 0)), 4.5, { vel: new THREE.Vector3(0, -10, 0), outward: 14, up: 8, max: 2500 });
    g.blastAll(p, 26, 40, null, 1.1);
    g.quake();
    const dc = g.dummy.chest(new THREE.Vector3()); const dd = dc.distanceTo(p);
    if (dd < 16) g.dummy.hit(dc, 3, _v.subVectors(dc, p).setY(0).normalize().multiplyScalar(30 * (1 - dd / 18)).add(_a.set(0, 26, 0)), 1);
    g.fx.wave(p.clone().add(_v.set(0, 0.5, 0)), 14, 0.5, new THREE.Color(1.5, 3.5, 1.2)); g.fx.ring(p, 22); g.fx.addScorch(p, 8);
    g.sfx.boom(2); g.shake(1); g.hitstop(0.12);
  }
  toggleRage() {
    const g = this.g;
    this.rage = this.rage > 0 ? 0 : 1e9;
    g.sfx.boom(0.8); g.shake(0.3);
    if (this.rage > 0) { g.fx.wave(g.chest(), 4, 0.35, new THREE.Color(1.5, 4, 1)); g.dummy.say(['Uh oh. He is ANGRY.', 'Why is he GLOWING?!'], true); }
  }
  get punchMul() { return this.rage > 0 ? 1.8 : 1; }
  get armorMul() { return this.rage > 0 ? 0.4 : 1; }

  update(dt, wdt, frozen, robot) {
    const g = this.g;
    this.odK += ((this.overdrive > 0 ? 1 : 0) - this.odK) * Math.min(1, dt * 6);
    if (this.overdrive > 0 && g.player.vel.lengthSq() > 30 && Math.random() < 0.8) g.fx.sparks.emit(g.chest(), _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3), new THREE.Color(1.5, 3.5, 7), 0.35, 0, 0.04);
    if (robot.glowMat) robot.glowMat.emissiveIntensity = 2.6 * (this.rage > 0 ? 2.4 + Math.sin(performance.now() / 90) * 0.6 : 1) * (this.overdrive > 0 ? 1.8 : 1);
    this.arcN = 0;
    // storm bolts
    for (const S of this.storms) {
      if (frozen) continue;
      S.t -= wdt;
      if (S.t <= 0 && S.n > 0) { S.n--; S.t = 0.16 + Math.random() * 0.12; g.strike(S.c.clone().add(_v.set((Math.random() - 0.5) * 22, 0, (Math.random() - 0.5) * 22))); }
    }
    this.storms = this.storms.filter((S) => S.n > 0);
    for (const D of this.dashes) { D.t -= dt; this._arc(D.from, D.to, 0.06); this._arc(D.from, D.to, 0.1); }
    this.dashes = this.dashes.filter((D) => D.t > 0);
    if (this.overdrive > 0 && g.player.vel.lengthSq() > 200 && Math.random() < 0.3) { const c = g.chest(); this._arc(c, _a.copy(c).add(_v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(4)), 0.3); }
    this.arcs.visible = this.arcN > 0;
    this.arcs.geometry.setDrawRange(0, this.arcN); this.arcs.geometry.attributes.position.needsUpdate = true;
    // boulders
    for (const B of this.boulders) {
      if (frozen) { B.m.position.copy(B.p); continue; }
      B.life -= wdt;
      if (B.hold > 0) { B.hold -= wdt; B.p.copy(g.hand(-1)).add(_v.set(0, 1.6, 0)); }
      else {
        B.v.y -= 12 * wdt; B.p.addScaledVector(B.v, wdt);
        if (Math.random() < 0.4) g.fx.dust.emit(B.p, _v.set(0, 0.5, 0), new THREE.Color(0.5, 0.47, 0.43), 0.8, 0.8, 1.5, 0.3);
        const dc = g.dummy.chest(_b);
        if (B.p.y < 1 || g.vox.solidAt(B.p.x, B.p.y, B.p.z) || dc.distanceTo(B.p) < 2 || B.life <= 0 || g.cars.carAt(B.p, 1)) { this._boulderHit(B); B.dead = true; continue; }
      }
      B.m.position.copy(B.p); B.m.rotation.x += B.w.x * wdt; B.m.rotation.y += B.w.y * wdt;
    }
    this.boulders = this.boulders.filter((B) => !B.dead);
    // ground pound: rise, hang, then dive straight down
    if (this.pound && !frozen) {
      const P = this.pound, pl = g.player;
      P.t += dt;
      if (P.phase === 'rise' && (pl.vel.y < 4 || P.t > 1.2)) { P.phase = 'dive'; P.t = 0; }
      if (P.phase === 'dive') {
        pl.vel.set(pl.vel.x * 0.9, -85, pl.vel.z * 0.9);
        if (Math.random() < 0.8) g.fx.sparks.emit(g.chest(), _v.set(Math.random() - 0.5, 4, Math.random() - 0.5), new THREE.Color(1.5, 4, 1), 0.3, 0, 0.05);
        if (pl.grounded || P.t > 4) { this.pound = null; this._poundLand(); }
      }
    }
  }
  clear() { this.overdrive = 0; this.rage = 0; this.pound = null; }
}

const UPV = new THREE.Vector3(0, 1, 0);
function distToSeg(p, a, b) {
  const ab = _b.subVectors(b, a), t = Math.max(0, Math.min(1, _v.subVectors(p, a).dot(ab) / ab.lengthSq()));
  return _v.copy(a).addScaledVector(ab, t).distanceTo(p);
}
