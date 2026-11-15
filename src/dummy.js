// Crash-test dummy: a Verlet ragdoll. Standing still until something hits it, then pure physics.
// Fast-moving body parts smash through walls.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { dummyTex } from './textures.js';

const POSE = {
  head: [0, 1.72, 0.0, 0.15],
  neck: [0, 1.47, 0.04, 0.1],
  lsh: [-0.21, 1.42, 0, 0.09], rsh: [0.21, 1.42, 0, 0.09],
  lel: [-0.27, 1.13, 0.0, 0.07], rel: [0.27, 1.13, 0.0, 0.07],
  lha: [-0.29, 0.86, 0.04, 0.07], rha: [0.29, 0.86, 0.04, 0.07],
  lhp: [-0.12, 0.95, 0, 0.1], rhp: [0.12, 0.95, 0, 0.1],
  lkn: [-0.13, 0.52, 0.03, 0.08], rkn: [0.13, 0.52, 0.03, 0.08],
  lft: [-0.13, 0.08, 0.05, 0.07], rft: [0.13, 0.08, 0.05, 0.07],
};
const NAMES = Object.keys(POSE);
const ID = Object.fromEntries(NAMES.map((n, i) => [n, i]));
const G = -20;
const BREAK_SPEED = 17;

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _up = new THREE.Vector3(), _rt = new THREE.Vector3(), _fw = new THREE.Vector3();
const _mat = new THREE.Matrix4(), _y = new THREE.Vector3(0, 1, 0);

export class Dummy {
  constructor(scene, voxels, ctx) {
    this.scene = scene; this.voxels = voxels; this.ctx = ctx; // ctx.smash(center, r, vel)
    this.n = NAMES.length;
    this.p = []; this.o = []; this.r = [];
    for (const k of NAMES) { this.p.push(new THREE.Vector3()); this.o.push(new THREE.Vector3()); this.r.push(POSE[k][3]); }
    this.cons = [];
    const rigid = ['neck', 'lsh', 'rsh', 'lhp', 'rhp'];
    for (let i = 0; i < rigid.length; i++) for (let j = i + 1; j < rigid.length; j++) this._con(rigid[i], rigid[j], 1);
    this._con('head', 'neck', 1); this._con('head', 'lsh', 1); this._con('head', 'rsh', 1);
    this._con('lsh', 'lel', 1); this._con('lel', 'lha', 1); this._con('rsh', 'rel', 1); this._con('rel', 'rha', 1);
    this._con('lhp', 'lkn', 1); this._con('lkn', 'lft', 1); this._con('rhp', 'rkn', 1); this._con('rkn', 'rft', 1);
    this._con('lsh', 'lha', 1, 0.28); this._con('rsh', 'rha', 1, 0.28);
    this._con('lhp', 'lft', 1, 0.5); this._con('rhp', 'rft', 1, 0.5);
    this._con('lkn', 'rkn', 1, 0.12); this._con('lft', 'rft', 1, 0.1);
    this.mode = 'stand';
    this.root = new THREE.Vector3(); this.yaw = 0;
    this.holdTarget = new THREE.Vector3();
    this.burn = 0;
    this.lastHitTime = 0;
    this._buildMeshes();
  }

  _con(a, b, stiff, minOnly = 0) {
    const A = POSE[a], B = POSE[b];
    const len = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
    this.cons.push([ID[a], ID[b], minOnly ? minOnly : len, stiff, !!minOnly]);
  }

  _buildMeshes() {
    const yellow = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: dummyTex(false), roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35 });
    const headMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: dummyTex(true), roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    const plain = new THREE.MeshPhysicalMaterial({ color: 0xe8b52a, roughness: 0.45, clearcoat: 0.4 });
    const black = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.55, metalness: 0.4 });
    this.mats = [yellow, headMat, plain];
    this.baseColors = this.mats.map((m) => m.color.clone());
    this.group = new THREE.Group();
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; this.group.add(m); return m; };
    this.head = add(new THREE.SphereGeometry(0.14, 28, 20), headMat); this.head.scale.set(1, 1.18, 1.05);
    this.neckM = add(new THREE.CylinderGeometry(0.05, 0.06, 0.14, 12), black);
    this.torso = add(new RoundedBoxGeometry(0.38, 0.5, 0.22, 3, 0.07), yellow);
    this.pelvis = add(new RoundedBoxGeometry(0.34, 0.18, 0.2, 3, 0.06), plain);
    this.limbs = [];
    const limb = (a, b, rad, mat) => {
      const A = POSE[a], B = POSE[b];
      const len = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
      const m = add(new THREE.CapsuleGeometry(rad, Math.max(0.01, len - rad * 0.6), 6, 14), mat);
      this.limbs.push([ID[a], ID[b], m]);
    };
    limb('lsh', 'lel', 0.065, plain); limb('lel', 'lha', 0.055, plain);
    limb('rsh', 'rel', 0.065, plain); limb('rel', 'rha', 0.055, plain);
    limb('lhp', 'lkn', 0.085, plain); limb('lkn', 'lft', 0.07, plain);
    limb('rhp', 'rkn', 0.085, plain); limb('rkn', 'rft', 0.07, plain);
    this.joints = [];
    for (const k of ['lel', 'rel', 'lkn', 'rkn', 'lsh', 'rsh']) {
      const m = add(new THREE.SphereGeometry(k.endsWith('kn') ? 0.075 : 0.06, 14, 10), black);
      this.joints.push([ID[k], m]);
    }
    this.hands = [ID.lha, ID.rha].map((i) => [i, add(new THREE.SphereGeometry(0.06, 14, 10), black)]);
    this.feet = [ID.lft, ID.rft].map((i) => [i, add(new RoundedBoxGeometry(0.12, 0.08, 0.26, 2, 0.03), black)]);
    this.scene.add(this.group);
  }

  spawn(pos, yaw) {
    this.root.copy(pos); this.yaw = yaw; this.mode = 'stand'; this.burn = 0;
    this._setPose();
    for (let i = 0; i < this.n; i++) this.o[i].copy(this.p[i]);
  }

  _setPose() {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    NAMES.forEach((k, i) => {
      const [x, y, z] = POSE[k];
      this.p[i].set(this.root.x + x * c + z * s, this.root.y + y, this.root.z - x * s + z * c);
    });
  }

  chest(out) { return out.copy(this.p[ID.neck]).add(this.p[ID.lhp]).add(this.p[ID.rhp]).multiplyScalar(1 / 3); }
  velocity(out) { const i = ID.neck; return out.subVectors(this.p[i], this.o[i]).multiplyScalar(120); }

  // Add velocity (m/s) to body parts inside a sphere.
  hit(center, radius, vel, minFrac = 0.35) {
    if (this.mode === 'held') return false;
    let any = false;
    for (let i = 0; i < this.n; i++) {
      const d = this.p[i].distanceTo(center);
      if (d > radius) continue;
      any = true;
    }
    if (!any) return false;
    if (this.mode === 'stand') this.mode = 'ragdoll';
    for (let i = 0; i < this.n; i++) {
      const d = this.p[i].distanceTo(center);
      const f = Math.max(minFrac, 1 - d / (radius * 1.6));
      this.o[i].addScaledVector(vel, -f * this.h);
    }
    this.lastHitTime = performance.now();
    return true;
  }

  push(vel) { // uniform velocity change
    if (this.mode === 'stand') this.mode = 'ragdoll';
    for (let i = 0; i < this.n; i++) this.o[i].addScaledVector(vel, -this.h);
  }

  raycast(o, d, maxT) {
    let best = null;
    for (let i = 0; i < this.n; i++) {
      _v.subVectors(this.p[i], o);
      const t = _v.dot(d);
      if (t < 0 || t > maxT) continue;
      const r = this.r[i] * 1.7;
      const d2 = _v.lengthSq() - t * t;
      if (d2 > r * r) continue;
      const th = t - Math.sqrt(r * r - d2);
      if (!best || th < best.t) best = { t: th, i };
    }
    return best;
  }

  grab(target) { this.mode = 'held'; this.holdTarget.copy(target); }
  release(vel) {
    this.mode = 'ragdoll';
    for (let i = 0; i < this.n; i++) this.o[i].copy(this.p[i]).addScaledVector(vel, -this.h);
  }

  get h() { return 1 / 120; }

  step(h) {
    if (this.mode === 'stand') { this._setPose(); for (let i = 0; i < this.n; i++) this.o[i].copy(this.p[i]); return; }
    // Verlet integrate
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i], o = this.o[i];
      _v.subVectors(p, o).multiplyScalar(0.9995);
      o.copy(p);
      p.add(_v); p.y += G * h * h;
    }
    if (this.mode === 'held') {
      const k = ID.neck;
      this.p[k].copy(this.holdTarget);
    }
    for (let it = 0; it < 10; it++) {
      for (const [a, b, len, , minOnly] of this.cons) {
        const pa = this.p[a], pb = this.p[b];
        _v.subVectors(pb, pa);
        const d = _v.length() || 1e-6;
        if (minOnly && d >= len) continue;
        const diff = (d - len) / d * 0.5;
        pa.addScaledVector(_v, diff); pb.addScaledVector(_v, -diff);
      }
      if (this.mode === 'held') this.p[ID.neck].copy(this.holdTarget);
    }
    this._collide(h);
  }

  _collide(h) {
    const vox = this.voxels;
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i], o = this.o[i], r = this.r[i];
      _v.subVectors(p, o);
      const speed = _v.length() / h;
      if (speed > BREAK_SPEED) {
        // check ahead along motion and punch a hole
        if (vox.solidAt(p.x, p.y, p.z) || vox.solidAt(p.x + _v.x * 2, p.y + _v.y * 2, p.z + _v.z * 2)) {
          const vel = _a.copy(_v).divideScalar(h);
          const n = this.ctx.smash(p, 0.75 + Math.min(0.9, speed * 0.012), { vel, inherit: 0.55, outward: 3 });
          if (n > 0) {
            // every body part loses a little momentum per wall
            for (let j = 0; j < this.n; j++) {
              _b.subVectors(this.p[j], this.o[j]).multiplyScalar(0.06);
              this.o[j].add(_b);
            }
          }
          continue;
        }
      }
      const upN = vox.collideSphere(p, r);
      if (upN !== null) {
        _v.subVectors(p, o);
        _v.multiplyScalar(0.7);
        o.subVectors(p, _v);
      }
      if (p.y < r) {
        p.y = r;
        _v.subVectors(p, o);
        if (_v.y < 0) _v.y = -_v.y * 0.25;
        _v.x *= 0.82; _v.z *= 0.82;
        o.subVectors(p, _v);
      }
    }
  }

  update(dt) {
    // burn tint
    if (this.burn > 0) {
      const k = Math.min(1, this.burn / 3);
      this.mats.forEach((m, i) => m.color.copy(this.baseColors[i]).lerp(new THREE.Color(0x231a12), k * 0.85));
    } else this.mats.forEach((m, i) => m.color.copy(this.baseColors[i]));
    // rebuild visuals
    const P = this.p;
    const mid = _a.addVectors(P[ID.lhp], P[ID.rhp]).multiplyScalar(0.5);
    const sh = _b.addVectors(P[ID.lsh], P[ID.rsh]).multiplyScalar(0.5);
    _up.subVectors(sh, mid).normalize();
    _rt.subVectors(P[ID.rsh], P[ID.lsh]).add(_v.subVectors(P[ID.rhp], P[ID.lhp])).normalize();
    _fw.crossVectors(_rt, _up).normalize();
    _rt.crossVectors(_up, _fw).normalize();
    _mat.makeBasis(_rt, _up, _fw);
    const q = new THREE.Quaternion().setFromRotationMatrix(_mat);
    this.torso.position.lerpVectors(mid, sh, 0.55); this.torso.quaternion.copy(q);
    this.pelvis.position.copy(mid).addScaledVector(_up, -0.02); this.pelvis.quaternion.copy(q);
    // head faces along torso forward but follows head point
    const hd = P[ID.head];
    _v.subVectors(hd, P[ID.neck]).normalize();
    const hf = _fw.clone().addScaledVector(_v, -_fw.dot(_v)).normalize();
    const hr = new THREE.Vector3().crossVectors(_v, hf).normalize();
    _mat.makeBasis(hr, _v, hf);
    this.head.position.copy(hd); this.head.quaternion.setFromRotationMatrix(_mat);
    this.neckM.position.lerpVectors(hd, P[ID.neck], 0.7);
    this.neckM.quaternion.setFromUnitVectors(_y, _v);
    for (const [a, b, m] of this.limbs) {
      m.position.lerpVectors(P[a], P[b], 0.5);
      _v.subVectors(P[b], P[a]).normalize();
      m.quaternion.setFromUnitVectors(_y, _v);
    }
    for (const [i, m] of this.joints) m.position.copy(P[i]);
    for (const [i, m] of this.hands) m.position.copy(P[i]);
    for (const [i, m] of this.feet) {
      m.position.copy(P[i]);
      const knee = i === ID.lft ? P[ID.lkn] : P[ID.rkn];
      _v.subVectors(knee, P[i]).normalize();
      const f = _fw.clone().addScaledVector(_v, -_fw.dot(_v)).normalize();
      const r = new THREE.Vector3().crossVectors(_v, f).normalize();
      _mat.makeBasis(r, _v, f);
      m.quaternion.setFromRotationMatrix(_mat);
      m.position.addScaledVector(f, 0.05);
    }
  }
}
