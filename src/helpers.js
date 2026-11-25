// The Champion's helper bots: compact hovering combat units it launches off its back when it decides it
// needs backup. They circle you at a distance, fire plasma bolts aimed where you're heading, and every so
// often dive straight at you. Unlike the Champion they can be destroyed: punch, laser or blast them.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const inTown = (x, z) => Math.abs(x) < 182 && Math.abs(z) < 182;

function botModel(glow) {
  const g = new THREE.Group();
  const shell = new THREE.MeshPhysicalMaterial({ color: 0x4a5059, metalness: 0.85, roughness: 0.25, clearcoat: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.6, roughness: 0.4 });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x110000, emissive: glow, emissiveIntensity: 4 });
  const eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 1.2, 0.6) });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), shell); body.scale.set(1, 0.85, 1.15); g.add(body);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.035, 8, 32), glowMat); band.rotation.x = Math.PI / 2; g.add(band);
  const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), eye); e.position.set(0, 0.05, 0.42); e.scale.z = 0.5; g.add(e);
  for (const sx of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.28), dark); fin.position.set(0.5 * sx, 0, -0.05); fin.rotation.z = sx * 0.35; g.add(fin);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6), shell); tip.rotation.z = -sx * Math.PI / 2; tip.position.set(0.82 * sx, -0.1, -0.05); g.add(tip);
  }
  const jet = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 12, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.6), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  jet.rotation.x = Math.PI; jet.position.y = -0.6; jet.userData.noOutline = true; g.add(jet);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, jet, glowMat };
}

export class HelperBots {
  constructor(g) {
    this.g = g; // { scene, fx, sfx, smash, blastAll, chest(), player, knockPlayer, hurtPlayer, vox, score }
    this.bots = []; this.bolts = [];
    this.boltGeo = new THREE.SphereGeometry(0.22, 10, 8);
    this.boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 1.6, 0.8) });
  }
  get alive() { return this.bots.filter((b) => !b.dead).length; }

  summon(from, glow = 0xffc020, n = 2) {
    for (let i = 0; i < n; i++) {
      const m = botModel(glow);
      const side = i % 2 ? 1 : -1;
      const p = from.clone().add(_v.set(side * 0.6, 1.4, 0));
      m.g.position.copy(p); this.g.scene.add(m.g);
      this.bots.push({ ...m, p, v: new THREE.Vector3(side * 8, 14, (Math.random() - 0.5) * 6), hp: 110, t: 0, fire: 1 + i * 0.6, ang: Math.random() * 6.28, side, state: 'deploy', diveT: 5 + Math.random() * 4 });
      this.g.fx.wave(p, 2, 0.25, new THREE.Color(3, 2, 0.8));
    }
    this.g.sfx.whoosh(); this.g.sfx.zap?.(0.8);
  }

  clear() { for (const b of this.bots) this.g.scene.remove(b.g); for (const o of this.bolts) this.g.scene.remove(o.m); this.bots = []; this.bolts = []; }

  damage(b, n, at) {
    if (b.dead) return;
    b.hp -= n;
    if (at) for (let i = 0; i < 4; i++) this.g.fx.sparks.emit(at, _a.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(10), new THREE.Color(5, 3, 1.5), 0.2, 0.9, 0.02);
    b.v.add(_v.set((Math.random() - 0.5) * 6, 3, (Math.random() - 0.5) * 6));
    if (b.hp <= 0) this._explode(b);
  }
  _explode(b) {
    b.dead = true; this.g.scene.remove(b.g);
    const p = b.p.clone();
    this.g.fx.wave(p, 4, 0.3, new THREE.Color(4, 2, 0.8)); this.g.fx.punchLight.position.copy(p); this.g.fx.punchLight.intensity = 80;
    for (let i = 0; i < 30; i++) this.g.fx.sparks.emit(p, _a.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(22), new THREE.Color(5, 2.4, 0.8), 0.4, 0.8, 0.03);
    if (inTown(p.x, p.z)) this.g.smash(p, 1.2, { outward: 6, up: 3, max: 200 });
    this.g.sfx.boom(0.8);
    this.g.score?.(750, 'HELPER BOT DOWN');
  }

  // anything exploding / striking near them
  blast(center, radius, strength) {
    if (strength < 6) return;
    for (const b of this.bots) if (!b.dead) { const d = b.p.distanceTo(center); if (d < radius + 0.6) this.damage(b, strength * 1.6 * (1 - d / (radius + 1)), b.p); }
  }
  // the bot (if any) within r of point p
  at(p, r = 1.2) { for (const b of this.bots) if (!b.dead && b.p.distanceTo(p) < r) return b; return null; }
  rayHit(o, d, maxT) {
    let best = null;
    for (const b of this.bots) {
      if (b.dead) continue;
      const tc = _a.subVectors(b.p, o).dot(d); if (tc < 0 || tc > maxT) continue;
      const miss = _b.copy(o).addScaledVector(d, tc).distanceTo(b.p);
      if (miss < 0.75) { const t = tc - Math.sqrt(0.5625 - miss * miss); if (!best || t < best.t) best = { t, b }; }
    }
    return best;
  }

  update(dt) {
    const g = this.g, pc = g.chest(), pv = g.player.vel;
    for (const b of this.bots) {
      if (b.dead) continue;
      b.t += dt;
      const gy = 0;
      if (b.state === 'deploy') {
        b.v.y -= 12 * dt; b.p.addScaledVector(b.v, dt);
        if (b.t > 0.8) b.state = 'fight';
      } else {
        // circle you at 10-14 m, a few metres up, weaving
        b.ang += dt * (0.7 + 0.2 * b.side) * b.side;
        const r = 11 + Math.sin(b.t * 0.9 + b.side) * 3;
        const want = _v.set(pc.x + Math.cos(b.ang) * r, Math.max(gy + 2.5, pc.y + 2 + Math.sin(b.t * 1.7) * 1.5), pc.z + Math.sin(b.ang) * r);
        b.diveT -= dt;
        if (b.diveT <= 0 && b.state === 'fight') { b.state = 'dive'; b.diveT = 0.9; b.v.subVectors(pc, b.p).setLength(32); g.sfx.whoosh(); }
        if (b.state === 'dive') {
          b.diveT -= dt; b.p.addScaledVector(b.v, dt);
          if (b.p.distanceTo(pc) < 1.4) { g.knockPlayer(b.v.clone(), 22, 'punch'); g.hurtPlayer(16); b.state = 'fight'; b.diveT = 6 + Math.random() * 4; b.v.multiplyScalar(-0.4); }
          else if (b.diveT <= 0) { b.state = 'fight'; b.diveT = 6 + Math.random() * 4; }
        } else {
          b.v.lerp(_a.subVectors(want, b.p).multiplyScalar(2.2).clampLength(0, 26), Math.min(1, dt * 3));
          b.p.addScaledVector(b.v, dt);
          // plasma bolts, leading the target
          b.fire -= dt;
          if (b.fire <= 0 && b.p.distanceTo(pc) < 60) {
            b.fire = 1.1 + Math.random() * 0.5;
            const T = b.p.distanceTo(pc) / 48;
            const tgt = pc.clone().addScaledVector(pv, T * 0.85);
            const m = new THREE.Mesh(this.boltGeo, this.boltMat); m.position.copy(b.p); g.scene.add(m);
            this.bolts.push({ p: b.p.clone(), v: tgt.sub(b.p).setLength(48), m, life: 3 });
            g.sfx.zap?.(0.35);
          }
        }
      }
      if (b.p.y < gy + 0.8) { b.p.y = gy + 0.8; if (b.v.y < 0) b.v.y = 0; }
      if (inTown(b.p.x, b.p.z) && g.vox.solidAt(b.p.x, b.p.y, b.p.z)) { b.p.addScaledVector(b.v, -dt * 2); b.v.multiplyScalar(-0.3); }
      b.g.position.copy(b.p);
      b.g.lookAt(pc.x, b.p.y + (pc.y - b.p.y) * 0.3, pc.z);
      b.g.rotateZ(Math.sin(b.t * 3) * 0.15 - b.side * 0.2);
      b.jet.scale.set(1, 0.7 + Math.random() * 0.5, 1);
    }
    this.bots = this.bots.filter((b) => !b.dead);
    for (const o of this.bolts) {
      o.life -= dt; o.p.addScaledVector(o.v, dt); o.m.position.copy(o.p);
      if (Math.random() < 0.5) g.fx.sparks.emit(o.p, _a.set(0, 0, 0), new THREE.Color(4, 1, 0.5), 0.15, 0, 0.02);
      if (o.p.distanceTo(pc) < 1.1) { o.dead = true; g.hurtPlayer(9); g.knockPlayer(o.v.clone(), 7, 'punch'); }
      else if (o.life <= 0 || o.p.y < 0 || (inTown(o.p.x, o.p.z) && g.vox.solidAt(o.p.x, o.p.y, o.p.z))) { o.dead = true; if (inTown(o.p.x, o.p.z)) g.smash(o.p.clone(), 0.6, { outward: 3, up: 2, noDust: true, max: 40 }); }
      if (o.dead) { g.scene.remove(o.m); g.fx.wave(o.p, 1.2, 0.15, new THREE.Color(4, 1.2, 0.6)); }
    }
    this.bolts = this.bolts.filter((o) => !o.dead);
  }
}
