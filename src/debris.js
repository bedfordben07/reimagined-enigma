// Rigid-body rubble: cube chunks with corner contacts against the ground and voxel world,
// sphere contacts between chunks, and sleeping so settled piles cost nothing.
import * as THREE from 'three';
import { VS } from './voxels.js?v=1795443674';

const G = -20;
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _r = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();
const _vr = new THREE.Vector3();
const _rn = new THREE.Vector3();
const _t = new THREE.Vector3();
const _q = new THREE.Quaternion();
const CORNERS = [];
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) CORNERS.push(new THREE.Vector3(x, y, z));

function chunkGeometry(seed) {
  // A box with each corner nudged so pieces look like broken masonry rather than perfect cubes.
  const g = new THREE.BoxGeometry(1, 1, 1);
  const pos = g.attributes.position;
  const jit = new Map();
  let h = seed * 9301 + 49297;
  const rnd = () => { h = (h * 9301 + 49297) % 233280; return h / 233280; };
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.sign(pos.getX(i))},${Math.sign(pos.getY(i))},${Math.sign(pos.getZ(i))}`;
    if (!jit.has(key)) jit.set(key, [0.82 + rnd() * 0.22, 0.82 + rnd() * 0.22, 0.82 + rnd() * 0.22]);
    const j = jit.get(key);
    pos.setXYZ(i, pos.getX(i) * j[0], pos.getY(i) * j[1], pos.getZ(i) * j[2]);
  }
  g.computeVertexNormals();
  return g;
}

export class DebrisSystem {
  constructor(scene, voxels, matDefs, cap = 4500) {
    this.scene = scene; this.voxels = voxels; this.matDefs = matDefs; this.cap = cap;
    this.items = [];
    this.meshes = []; this.slots = [];
    this.nextId = 1;
    this.onVoxelImpact = null;
    this.dirtyMat = new Set();
    for (let m = 1; m < matDefs.length; m++) {
      const mesh = new THREE.InstancedMesh(chunkGeometry(m + 3), matDefs[m].material, cap);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      scene.add(mesh);
      this.meshes[m] = mesh; this.slots[m] = [];
    }
    this.hash = new Map();
  }

  get count() { return this.items.length; }
  get awakeCount() { let n = 0; for (const it of this.items) if (!it.asleep) n++; return n; }

  clear() {
    for (const it of this.items) it.dead = true;
    this.items.length = 0;
    for (let m = 1; m < this.meshes.length; m++) { this.meshes[m].count = 0; this.slots[m].length = 0; }
  }

  spawn(p, v, m, color, size = VS) {
    const mesh = this.meshes[m];
    if (!mesh) return null;
    const it = {
      id: this.nextId++, p: p.clone(), v: v.clone(),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 0.3, Math.random() * 0.3, Math.random() * 0.3)),
      w: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6).multiplyScalar(Math.min(1, v.length() / 8)),
      s: size, m, slot: -1, still: 0, asleep: false, dead: false,
    };
    const slots = this.slots[m];
    it.slot = slots.length; slots.push(it);
    mesh.count = slots.length;
    mesh.setColorAt(it.slot, color);
    mesh.instanceColor.needsUpdate = true;
    this.items.push(it);
    this._write(it);
    if (this.items.length > this.cap) this.trim(this.items.length - this.cap);
    return it;
  }

  trim(k) {
    // drop the oldest pieces
    const removed = this.items.splice(0, k);
    for (const it of removed) this._removeSlot(it);
  }

  _removeSlot(it) {
    it.dead = true;
    const slots = this.slots[it.m], mesh = this.meshes[it.m];
    const last = slots.length - 1;
    if (it.slot !== last) {
      const mv = slots[last];
      slots[it.slot] = mv;
      const a = mesh.instanceMatrix.array, c = mesh.instanceColor.array;
      for (let k = 0; k < 16; k++) a[it.slot * 16 + k] = a[last * 16 + k];
      for (let k = 0; k < 3; k++) c[it.slot * 3 + k] = c[last * 3 + k];
      mv.slot = it.slot;
    }
    slots.pop();
    mesh.count = slots.length;
    this.dirtyMat.add(it.m);
    mesh.instanceColor.needsUpdate = true;
  }

  _write(it) {
    _s.set(it.s, it.s, it.s);
    _m.compose(it.p, it.q, _s);
    _m.toArray(this.meshes[it.m].instanceMatrix.array, it.slot * 16);
    this.dirtyMat.add(it.m);
  }

  wake(it) { if (it.asleep) { it.asleep = false; it.still = 0; } }

  // Push every piece in range: outward from center plus an optional directional shove.
  blast(center, radius, strength, dir = null, up = 0.3) {
    const r2 = radius * radius;
    for (const it of this.items) {
      _r.subVectors(it.p, center);
      const d2 = _r.lengthSq();
      if (d2 > r2) continue;
      const d = Math.sqrt(d2) + 1e-4;
      const f = (1 - d / radius) * strength;
      this.wake(it);
      it.v.addScaledVector(_r, f / d);
      it.v.y += f * up;
      if (dir) it.v.addScaledVector(dir, f * 0.8);
      it.w.x += (Math.random() - 0.5) * f; it.w.z += (Math.random() - 0.5) * f;
    }
  }

  // Upload transforms without simulating (frozen time: new pieces still appear, nothing moves).
  flush() {
    for (const m of this.dirtyMat) { const mesh = this.meshes[m]; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
    this.dirtyMat.clear();
  }

  update(dt, substeps) {
    const h = dt / substeps;
    const vox = this.voxels;
    for (let s = 0; s < substeps; s++) {
      for (const it of this.items) {
        if (it.asleep || it.tk) continue;
        it.v.y += G * h;
        const damp = Math.max(0, 1 - 0.05 * h);
        it.v.multiplyScalar(damp);
        it.p.addScaledVector(it.v, h);
        // integrate orientation
        const wl = it.w.length();
        if (wl > 1e-6) {
          _q.setFromAxisAngle(_t.copy(it.w).divideScalar(wl), wl * h);
          it.q.premultiply(_q).normalize();
        }
        this._contacts(it, vox);
        if (it.p.y < -20) it.dead = true;
      }
    }
    this._pairs();
    // sleeping + render
    for (const it of this.items) {
      if (it.tk) { this._write(it); continue; }
      if (it.asleep) continue;
      if (it.v.lengthSq() < 0.3 && it.w.lengthSq() < 0.8) {
        it.still += dt;
        if (it.still > 0.5) { it.asleep = true; it.v.set(0, 0, 0); it.w.set(0, 0, 0); }
      } else it.still = 0;
      this._write(it);
    }
    if (this.items.some((it) => it.dead)) {
      const keep = [];
      for (const it of this.items) { if (it.dead) this._removeSlot(it); else keep.push(it); }
      this.items = keep;
    }
    for (const m of this.dirtyMat) {
      const mesh = this.meshes[m];
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
    this.dirtyMat.clear();
  }

  _contacts(it, vox) {
    const hs = it.s * 0.5 * 0.92;
    const invM = 1, invI = 6 / (it.s * it.s);
    let cx = 0, cy = 0, cz = 0, nc = 0;
    let impactI = -1, impactV = 0;
    for (const k of CORNERS) {
      _r.copy(k).multiplyScalar(hs).applyQuaternion(it.q);
      _c.addVectors(it.p, _r);
      let pen = 0, vi = -1;
      if (_c.y < 0) { _n.set(0, 1, 0); pen = -_c.y; }
      else {
        const x = vox.cx(_c.x), y = vox.cy(_c.y), z = vox.cz(_c.z);
        if (!vox.inb(x, y, z)) continue;
        const i = vox.idx(x, y, z);
        if (!vox.occ[i]) continue;
        // pick the shallowest exit through a face whose neighbour is open
        const ex = _c.x - (vox.ox + (x + 0.5) * VS), ey = _c.y - (y + 0.5) * VS, ez = _c.z - (vox.oz + (z + 0.5) * VS);
        let best = Infinity; _n.set(0, 1, 0);
        const tryAxis = (nx, ny, nz, e) => {
          const p = VS / 2 - Math.abs(e);
          if (p < best && !vox.solid(x + nx, y + ny, z + nz)) { best = p; _n.set(nx, ny, nz); }
        };
        tryAxis(Math.sign(ex) || 1, 0, 0, ex);
        tryAxis(0, Math.sign(ey) || 1, 0, ey);
        tryAxis(0, 0, Math.sign(ez) || 1, ez);
        if (best === Infinity) { best = VS / 2 - Math.abs(ey); _n.set(0, 1, 0); }
        pen = best; vi = i;
      }
      // relative velocity at the contact point
      _vr.crossVectors(it.w, _r).add(it.v);
      const vn = _vr.dot(_n);
      if (vn < 0) {
        if (vi >= 0 && -vn > impactV) { impactV = -vn; impactI = vi; }
        _rn.crossVectors(_r, _n);
        const K = invM + invI * _rn.lengthSq();
        const e = vn < -4 ? 0.22 : 0.0;
        const j = -(1 + e) * vn / K;
        it.v.addScaledVector(_n, j * invM);
        it.w.addScaledVector(_rn, j * invI);
        // Coulomb friction
        _vr.crossVectors(it.w, _r).add(it.v);
        const vn2 = _vr.dot(_n);
        _t.copy(_vr).addScaledVector(_n, -vn2);
        const vt = _t.length();
        if (vt > 1e-4) {
          _t.divideScalar(vt);
          _rn.crossVectors(_r, _t);
          const Kt = invM + invI * _rn.lengthSq();
          const jt = Math.min(vt / Kt, 0.65 * j);
          it.v.addScaledVector(_t, -jt * invM);
          it.w.addScaledVector(_rn, -jt * invI);
        }
      }
      cx += _n.x * pen; cy += _n.y * pen; cz += _n.z * pen; nc++;
    }
    if (nc) {
      const k = 0.9 / nc;
      it.p.x += cx * k; it.p.y += cy * k; it.p.z += cz * k;
      it.w.multiplyScalar(0.995);
    }
    if (impactI >= 0 && this.onVoxelImpact) this.onVoxelImpact(impactI, impactV, it);
  }

  _pairs() {
    const hash = this.hash; hash.clear();
    const cs = 0.6;
    const key = (x, y, z) => (x * 92837111) ^ (y * 689287499) ^ (z * 283923481);
    for (const it of this.items) {
      const k = key(Math.floor(it.p.x / cs), Math.floor(it.p.y / cs), Math.floor(it.p.z / cs));
      let a = hash.get(k); if (!a) { a = []; hash.set(k, a); } a.push(it);
    }
    for (const it of this.items) {
      if (it.asleep) continue;
      const ix = Math.floor(it.p.x / cs), iy = Math.floor(it.p.y / cs), iz = Math.floor(it.p.z / cs);
      const ri = it.s * 0.46;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const a = hash.get(key(ix + dx, iy + dy, iz + dz));
        if (!a) continue;
        for (const o of a) {
          if (o === it || (!o.asleep && o.id < it.id)) continue;
          _r.subVectors(it.p, o.p);
          const d2 = _r.lengthSq();
          const md = ri + o.s * 0.46;
          if (d2 >= md * md || d2 < 1e-8) continue;
          const d = Math.sqrt(d2);
          _r.divideScalar(d);
          const pen = md - d;
          _vr.subVectors(it.v, o.v);
          const vrel = _vr.dot(_r);
          if (o.asleep) {
            if (vrel < -3.5) this.wake(o);
          }
          if (o.asleep) {
            it.p.addScaledVector(_r, pen);
            if (vrel < 0) it.v.addScaledVector(_r, -vrel * 1.05);
            it.v.multiplyScalar(0.985);
          } else {
            it.p.addScaledVector(_r, pen * 0.5); o.p.addScaledVector(_r, -pen * 0.5);
            if (vrel < 0) { const j = -vrel * 0.55; it.v.addScaledVector(_r, j); o.v.addScaledVector(_r, -j); }
          }
        }
      }
    }
  }
}
