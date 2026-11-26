// Street furniture you can knock about: fire hydrants (which burst into a water geyser), bins, benches,
// mailboxes and traffic cones. Each prop is a simple tumbling rigid body (sphere contact, upright
// or toppled), instanced per type so hundreds cost a few draw calls.
import * as THREE from 'three';
import { lathe, extrude, roundRect } from './geom.js?v=1795701775';

const G = -20;
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);

function types() {
  const paint = (c, r = 0.5, m = 0.2) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const hydrant = lathe([[0, 0.42], [0.09, 0.42], [0.12, 0.36], [0.12, 0.3], [0.1, 0.28], [0.1, -0.3], [0.14, -0.34], [0.14, -0.42], [0, -0.42]], 20);
  const bin = lathe([[0, 0.5], [0.3, 0.5], [0.32, 0.46], [0.29, -0.46], [0.24, -0.5], [0, -0.5]], 24);
  const cone = lathe([[0, 0.36], [0.03, 0.36], [0.16, -0.3], [0.22, -0.3], [0.22, -0.36], [0, -0.36]], 20);
  const mail = extrude(roundRect(0.42, 1.0, 0.12), 0.42, 0.04, 3);
  const bench = new THREE.BoxGeometry(1.7, 0.12, 0.5); bench.translate(0, 0.02, 0);
  const back = new THREE.BoxGeometry(1.7, 0.45, 0.08); back.translate(0, 0.28, -0.22);
  const legs = new THREE.BoxGeometry(1.5, 0.4, 0.06); legs.translate(0, -0.22, 0);
  const benchGeo = mergeGeos([bench, back, legs]);
  return {
    hydrant: { geo: hydrant, mat: paint(0xb3261e, 0.45, 0.3), r: 0.2, hh: 0.42, mass: 3 },
    bin: { geo: bin, mat: paint(0x2f5a3a, 0.6, 0.4), r: 0.32, hh: 0.5, mass: 1 },
    cone: { geo: cone, mat: paint(0xe8641c, 0.6, 0), r: 0.22, hh: 0.36, mass: 0.4 },
    mail: { geo: mail, mat: paint(0x1f4e8c, 0.4, 0.5), r: 0.3, hh: 0.5, mass: 1.5 },
    bench: { geo: benchGeo, mat: paint(0x6b4a2e, 0.8, 0), r: 0.5, hh: 0.3, mass: 1.5 },
    pump: { geo: extrude(roundRect(0.7, 1.7, 0.12), 0.45, 0.05, 3), mat: paint(0xd8d4cc, 0.4, 0.3), r: 0.4, hh: 0.85, mass: 2.5 },
  };
}
function mergeGeos(list) {
  const pos = [], nor = [];
  for (const g of list) { const n = g.toNonIndexed(); n.computeVertexNormals(); pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

export class PropSystem {
  constructor(scene, spots, ctx) {
    this.ctx = ctx; // { voxels, fx, sfx }
    this.T = types();
    this.props = []; this.meshes = {};
    const byType = {};
    for (const [x, z, type, yaw] of spots) (byType[type] = byType[type] || []).push([x, z, yaw]);
    for (const [type, list] of Object.entries(byType)) {
      const t = this.T[type];
      const m = new THREE.InstancedMesh(t.geo, t.mat, list.length);
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
      this.meshes[type] = m;
      list.forEach(([x, z, yaw], i) => {
        const p = { type, i, t, p: new THREE.Vector3(x, 0.15 + t.hh, z), q: new THREE.Quaternion().setFromAxisAngle(_up, yaw), v: new THREE.Vector3(), w: new THREE.Vector3(), asleep: true, still: 0, burst: false };
        this.props.push(p); this._write(p);
      });
      m.instanceMatrix.needsUpdate = true;
    }
    this.geysers = [];
  }

  _write(p) { _m.compose(p.p, p.q, _s); this.meshes[p.type].setMatrixAt(p.i, _m); this.dirty = true; }
  flush() { if (!this.dirty) return; for (const m of Object.values(this.meshes)) m.instanceMatrix.needsUpdate = true; this.dirty = false; }

  _kick(p, dv) {
    p.asleep = false; p.still = 0;
    p.v.addScaledVector(dv, 1 / p.t.mass);
    p.w.add(_a.set(dv.z, (Math.random() - 0.5) * 2, -dv.x).multiplyScalar(0.6 / p.t.mass));
    if (p.type === 'pump' && !p.exploded && dv.length() > 5) { p.exploded = true; this.onExplode?.(p); }
    if (p.type === 'hydrant' && !p.burst && dv.length() > 4) { p.burst = true; this.geysers.push({ p: p.p.clone().setY(0.2), t: 7 }); this.ctx.sfx?.crumble(60); }
  }

  blast(center, radius, strength, dir = null, up = 0.4) {
    for (const p of this.props) {
      _v.subVectors(p.p, center); const d = _v.length();
      if (d > radius) continue;
      const f = (1 - d / radius) * strength;
      if (f < 1) continue;
      _v.divideScalar(d + 1e-4).multiplyScalar(f); _v.y += f * up;
      if (dir) _v.addScaledVector(dir, f * 0.6);
      this._kick(p, _v.clone());
    }
  }

  // Something moving at `vel` passes point `at` with radius r (the player, the dummy, a car).
  bump(at, r, vel) {
    for (const p of this.props) {
      if (p.p.distanceToSquared(at) > (r + p.t.r) ** 2) continue;
      this._kick(p, vel.clone().multiplyScalar(0.9).add(_a.set(0, vel.length() * 0.2, 0)));
    }
  }

  update(dt) {
    const vox = this.ctx.voxels;
    for (const p of this.props) {
      if (p.asleep) continue;
      p.v.y += G * dt;
      p.p.addScaledVector(p.v, dt);
      const wl = p.w.length();
      if (wl > 1e-5) { _q.setFromAxisAngle(_a.copy(p.w).divideScalar(wl), wl * dt); p.q.premultiply(_q).normalize(); }
      // support height depends on how far it has tipped
      const upY = Math.abs(_a.set(0, 1, 0).applyQuaternion(p.q).y);
      const support = p.t.hh * upY + p.t.r * Math.sqrt(Math.max(0, 1 - upY * upY));
      if (p.p.y < support) {
        p.p.y = support;
        if (p.v.y < 0) p.v.y *= -0.25;
        p.v.x *= Math.max(0, 1 - 6 * dt); p.v.z *= Math.max(0, 1 - 6 * dt); p.w.multiplyScalar(Math.max(0, 1 - 5 * dt));
      }
      // walls: push out of solid blocks
      if (vox.solidAt(p.p.x, p.p.y, p.p.z)) { p.v.multiplyScalar(-0.3); p.p.y += 0.3; }
      if (p.v.lengthSq() < 0.04 && p.w.lengthSq() < 0.05 && p.p.y <= support + 0.02) { p.still += dt; if (p.still > 0.5) { p.asleep = true; p.v.set(0, 0, 0); p.w.set(0, 0, 0); } }
      this._write(p);
    }
    // burst hydrants: a column of water spray for a few seconds
    const fx = this.ctx.fx, c = new THREE.Color(0.75, 0.85, 0.95);
    for (const g of this.geysers) {
      if (g.t <= 0) continue;
      g.t -= dt;
      const k = Math.min(1, g.t / 2);
      for (let i = 0; i < 3; i++) fx.dust.emit(g.p, _v.set((Math.random() - 0.5) * 2.5, (12 + Math.random() * 6) * k, (Math.random() - 0.5) * 2.5), c, 0.5 + Math.random() * 0.5, 1.2, 1.4, 0.45);
      if (Math.random() < 0.5) fx.sparks.emit(g.p, _v.set((Math.random() - 0.5) * 6, 14 * k, (Math.random() - 0.5) * 6), new THREE.Color(0.6, 0.7, 0.85), 1.2, 0.8, 0.03);
    }
    this.geysers = this.geysers.filter((g) => g.t > 0);
    this.flush();
  }
}
