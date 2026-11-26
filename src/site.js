// The construction site: a tower crane you can knock over (its jib comes down across whatever is in the
// way) and loose steel girders you can pick up (E), swing like a bat (click) and hurl (E again).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const GL = 7; // girder length

function lattice(h, w, mat) {
  const g = new THREE.Group();
  const leg = new THREE.BoxGeometry(0.18, h, 0.18);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const m = new THREE.Mesh(leg, mat); m.position.set(x * w / 2, h / 2, z * w / 2); m.castShadow = true; g.add(m); }
  const step = w * 1.1, br = new THREE.BoxGeometry(0.1, Math.hypot(step, w), 0.1), tilt = Math.atan2(w, step);
  let flip = 1;
  for (let y = 0; y + step <= h; y += step, flip = -flip) {
    for (const sx of [-1, 1]) { const m = new THREE.Mesh(br, mat); m.position.set(sx * w / 2, y + step / 2, 0); m.rotation.x = tilt * flip; m.castShadow = true; g.add(m); }
    for (const sz of [-1, 1]) { const m = new THREE.Mesh(br, mat); m.position.set(0, y + step / 2, sz * w / 2); m.rotation.z = tilt * flip; m.castShadow = true; g.add(m); }
  }
  // bake all the struts into one mesh: one draw call per lattice
  g.updateMatrixWorld(true);
  const geos = g.children.map((m) => m.geometry.clone().applyMatrix4(m.matrix));
  const merged = new THREE.Mesh(mergeGeometries(geos), mat); merged.castShadow = true; merged.receiveShadow = true;
  const out = new THREE.Group(); out.add(merged);
  return out;
}

export class ConstructionSite {
  constructor(g, at) {
    this.g = g; // { scene, fx, sfx, vox, smash, blastAll, dummy, cars, player, score }
    this.at = at.clone();
    const yellow = new THREE.MeshStandardMaterial({ color: 0xe8b020, metalness: 0.5, roughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.6, roughness: 0.5 });
    // --- the crane: mast, slewing jib, counter-jib with weights, cab, cable and hook
    const crane = new THREE.Group(); crane.position.set(at.x + 13, 0, at.z - 13);
    const MH = 46; this.MH = MH;
    crane.add(lattice(MH, 2, yellow));
    const top = new THREE.Group(); top.position.y = MH; crane.add(top);
    const jib = lattice(36, 1.4, yellow); jib.rotation.z = -Math.PI / 2; jib.position.set(0, 0.8, 0); top.add(jib);
    const cj = lattice(12, 1.4, yellow); cj.rotation.z = Math.PI / 2; cj.position.set(0, 0.8, 0); top.add(cj);
    const cw = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2.4), new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.9 })); cw.position.set(-10, 0, 0); cw.castShadow = true; top.add(cw);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), dark); cab.position.set(1.6, -1, 1.2); cab.castShadow = true; top.add(cab);
    const peak = new THREE.Mesh(new THREE.ConeGeometry(1.2, 6, 4), yellow); peak.position.y = 3.5; top.add(peak);
    this.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4), dark); top.add(this.cable);
    this.hook = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), dark); top.add(this.hook);
    g.scene.add(crane);
    this.crane = crane; this.top = top; this.craneUp = true; this.fall = null; this.trolley = 24; this.hookY = -22;
    this._placeHook();
    // --- girders
    this.geo = new THREE.BoxGeometry(0.34, 0.42, GL);
    this.mat = new THREE.MeshStandardMaterial({ color: 0xb2452a, metalness: 0.65, roughness: 0.45 });
    this.girders = [];
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Vector3(at.x - 12 + (i % 3) * 0.6, 0.25 + Math.floor(i / 3) * 0.45, at.z + 12 - (i % 3) * 0.1);
      this._girder(p, new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2 + (Math.random() - 0.5) * 0.1));
    }
    this.held = null;
  }
  _placeHook() { this.cable.position.set(this.trolley, this.hookY / 2, 0); this.cable.scale.y = -this.hookY; this.hook.position.set(this.trolley, this.hookY, 0); }
  _girder(p, q) {
    const m = new THREE.Mesh(this.geo, this.mat); m.castShadow = true; m.receiveShadow = true; this.g.scene.add(m);
    const G = { m, p: p.clone(), q: q.clone(), v: new THREE.Vector3(), w: new THREE.Vector3(), asleep: true, held: false, thrown: false };
    m.position.copy(p); m.quaternion.copy(q);
    this.girders.push(G); return G;
  }
  _ends(G, a, b) { const ax = _v.set(0, 0, GL / 2).applyQuaternion(G.q); a.copy(G.p).add(ax); b.copy(G.p).sub(ax); return ax; }

  nearestGirder(p, r = 3.5) {
    let best = null, bd = r;
    for (const G of this.girders) { if (G.held) continue; const d = this._segDist(G, p); if (d < bd) { bd = d; best = G; } }
    return best;
  }
  _segDist(G, p) { const a = _a, b = _b; this._ends(G, a, b); const ab = _v.subVectors(b, a); const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(p, a).dot(ab) / ab.lengthSq())); return a.clone().addScaledVector(ab, t).distanceTo(p); }
  grab(G) { G.held = true; G.asleep = false; G.thrown = false; this.held = G; this.g.sfx.clang?.(); }
  // carried like a bat in the right hand, pointing along `dir`, swung through `swing` (0 rest .. 1 follow-through)
  carry(hand, yaw, swing = -1) {
    const G = this.held; if (!G) return;
    const a = swing < 0 ? 0.35 : 1.6 - swing * 3.0; // sweeps from the right side round to the left
    const dir = _v.set(Math.sin(yaw + a), swing < 0 ? 0.5 : 0.05, Math.cos(yaw + a)).normalize();
    G.q.setFromUnitVectors(_a.set(0, 0, 1), dir);
    G.p.copy(hand).addScaledVector(dir, GL / 2 - 0.6);
    G.m.position.copy(G.p); G.m.quaternion.copy(G.q);
    return dir;
  }
  throw(vel) {
    const G = this.held; if (!G) return;
    G.held = false; G.thrown = true; this.held = null;
    G.v.copy(vel); G.w.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6, 6 + Math.random() * 4);
    this.g.sfx.whoosh();
  }
  drop() { if (this.held) this.throw(new THREE.Vector3()); }

  // a blast or blow near the mast topples the crane
  blast(center, radius, strength, dir) {
    if (this.craneUp && strength > 22) {
      const base = this.crane.position;
      const d = Math.hypot(center.x - base.x, center.z - base.z);
      if (d < radius + 2 && center.y < this.MH + 4) this.topple(dir ? dir.clone().setY(0) : _v.set(base.x - center.x, 0, base.z - center.z));
    }
    for (const G of this.girders) if (!G.held && G.p.distanceTo(center) < radius + 2 && strength > 8) { G.asleep = false; G.v.add(_v.subVectors(G.p, center).setLength(strength * 0.4)).add(_a.set(0, strength * 0.3, 0)); G.w.add(_v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(4)); }
  }
  topple(dir) {
    if (!this.craneUp) return;
    if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
    dir.normalize();
    this.craneUp = false;
    // swing the jib round to face the fall, so it comes down across the street
    this.top.rotation.y = Math.atan2(-dir.z, dir.x);
    this.fall = { axis: new THREE.Vector3(dir.z, 0, -dir.x), ang: 0, w: 0.05, dir, landed: false };
    this.g.sfx.crumble?.(300); this.g.sfx.clang?.();
    this.g.score?.(2000, 'CRANE DOWN');
  }

  // smash along a moving girder (thrown, or swung by the player); returns true if it hit something
  _sweep(G, vel, power) {
    const g = this.g, a = new THREE.Vector3(), b = new THREE.Vector3(); this._ends(G, a, b);
    let hit = false;
    for (let k = 0; k <= 4; k++) {
      const p = a.clone().lerp(b, k / 4);
      if (Math.abs(p.x) < 182 && Math.abs(p.z) < 182 && g.vox.solidAt(p.x, p.y, p.z)) { g.smash(p, 1.2 + power * 0.8, { vel, inherit: 0.8, outward: 6 + power * 4, up: 2, max: 500 }); hit = true; }
      const dc = g.dummy.chest(new THREE.Vector3());
      if (dc.distanceTo(p) < 1.6) { g.dummy.hit(dc, 2.5, vel.clone().setLength(35 + 45 * power).add(_v.set(0, 10, 0)), 1); hit = true; }
      const car = g.cars.carAt(p, 0.4); if (car) { g.cars.hit(car, p, vel.clone().setLength(25 + 30 * power).add(_v.set(0, 8, 0))); hit = true; }
    }
    return hit;
  }
  swingHit(power) {
    const G = this.held; if (!G) return false;
    const dir = _v.set(0, 0, 1).applyQuaternion(G.q);
    const vel = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(-40 * (0.6 + power));
    const hit = this._sweep(G, vel, power);
    this.g.blastAll(G.p.clone().addScaledVector(dir, GL * 0.3), 4, 10 + 20 * power, vel.clone().normalize(), 0.4);
    return hit;
  }

  update(dt) {
    const g = this.g;
    // the hook sways a little
    if (this.craneUp) { this.trolley = 24 + Math.sin(performance.now() / 4000) * 6; this._placeHook(); }
    if (this.fall && !this.fall.landed) {
      const F = this.fall;
      F.w += dt * (0.4 + Math.sin(F.ang) * 1.6); F.ang += F.w * dt;
      if (F.ang >= Math.PI / 2 - 0.05) {
        F.ang = Math.PI / 2 - 0.05; F.landed = true;
        // the jib and mast crash down along the fall line
        const base = this.crane.position;
        for (let s = 6; s <= this.MH + 34; s += 3) {
          const p = new THREE.Vector3(base.x + F.dir.x * s, 1.2, base.z + F.dir.z * s);
          if (Math.abs(p.x) < 182 && Math.abs(p.z) < 182) for (let y = 1; y < 30; y += 3) if (g.vox.solidAt(p.x, y, p.z)) { g.smash(new THREE.Vector3(p.x, y, p.z), 3, { vel: new THREE.Vector3(0, -20, 0), outward: 8, up: 2, max: 900 }); }
          if (s % 9 === 0) g.blastAll(p, 6, 30, F.dir, 0.6);
        }
        g.fx.wave(new THREE.Vector3(base.x + F.dir.x * 30, 1, base.z + F.dir.z * 30), 18, 0.5); g.sfx.boom(2); g.sfx.crumble?.(600);
        g.shake?.(0.8);
      }
      this.crane.quaternion.setFromAxisAngle(F.axis, F.ang);
      // things under the falling mast get crushed as it sweeps through them
      const tipH = this.MH * Math.cos(F.ang), reach = this.MH * Math.sin(F.ang);
      const tip = new THREE.Vector3(this.crane.position.x + F.dir.x * reach, tipH, this.crane.position.z + F.dir.z * reach);
      if (Math.abs(tip.x) < 182 && Math.abs(tip.z) < 182 && g.vox.solidAt(tip.x, tip.y, tip.z)) g.smash(tip, 3, { vel: F.dir.clone().multiplyScalar(20), outward: 8, up: 0, max: 800 });
    }
    // girders: tumbling rigid sticks
    for (const G of this.girders) {
      if (G.held || G.asleep) continue;
      G.v.y -= 20 * dt; G.p.addScaledVector(G.v, dt);
      const wl = G.w.length(); if (wl > 1e-4) { _q.setFromAxisAngle(_a.copy(G.w).divideScalar(wl), wl * dt); G.q.premultiply(_q).normalize(); }
      const sp = G.v.length();
      if (G.thrown && sp > 18) { if (this._sweep(G, G.v.clone(), Math.min(1.5, sp / 40))) G.v.multiplyScalar(0.8); }
      const a = new THREE.Vector3(), b = new THREE.Vector3(); this._ends(G, a, b);
      const low = Math.min(a.y, b.y, G.p.y) - 0.2;
      if (low < 0) {
        G.p.y -= low; if (G.v.y < 0) G.v.y *= -0.25; G.v.x *= 0.8; G.v.z *= 0.8; G.w.multiplyScalar(0.7);
        // fall flat
        const ax = _v.set(0, 0, 1).applyQuaternion(G.q); if (Math.abs(ax.y) > 0.05) { const flat = ax.clone().setY(0).normalize(); if (flat.lengthSq() > 0.1) G.q.premultiply(_q.setFromUnitVectors(ax, flat).slerp(new THREE.Quaternion(), 0.7)); }
        if (sp > 10) g.sfx.clang?.();
        if (sp < 0.8 && wl < 0.5) { G.asleep = true; G.thrown = false; G.v.set(0, 0, 0); G.w.set(0, 0, 0); }
      }
      G.m.position.copy(G.p); G.m.quaternion.copy(G.q);
    }
  }
}
