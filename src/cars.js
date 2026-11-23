// Parked cars: oriented-box rigid bodies that sleep until something hits them. Drawn with a handful of
// instanced meshes (body, glass, wheels, lights) so hundreds of cars stay cheap. Fast cars plough through
// walls; thrown cars hurt whoever they hit. Can be held overhead by the player or the dummy.
import * as THREE from 'three';
import { extrude, smoothShape, lathe } from './geom.js?v=1795442091';
import { VS } from './voxels.js?v=1795442091';

const G = -20;
const HX = 0.9, HY = 0.72, HZ = 2.15; // half extents: width, height, length
const MASS = 1;
const _r = new THREE.Vector3(), _n = new THREE.Vector3(), _vr = new THREE.Vector3(), _t = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _m3 = new THREE.Matrix3(), _m3t = new THREE.Matrix3(), _inv = new THREE.Matrix3();
const _s = new THREE.Vector3(1, 1, 1), _off = new THREE.Matrix4(), _w = new THREE.Matrix4();
const PAINT = [0xb3261e, 0x1f4e8c, 0xe8e6e0, 0x1b1d20, 0x8a8f94, 0x2f6b45, 0xd9a21b, 0x6b2a5f, 0xc75b1a, 0x9fb7c4];

// sample points on the box: corners, edge midpoints and face centres (so 0.5 m voxels can't slip between corners)
const SAMPLES = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, -0.5, 0, 0.5, 1]) {
  const outer = Math.abs(x) === 1 || Math.abs(y) === 1 || Math.abs(z) === 1;
  if (outer) SAMPLES.push(new THREE.Vector3(x * HX, y * HY, z * HZ));
}
const INV_I = new THREE.Vector3( // inverse inertia of a solid box, local axes
  12 / (MASS * ((2 * HY) ** 2 + (2 * HZ) ** 2)), 12 / (MASS * ((2 * HX) ** 2 + (2 * HZ) ** 2)), 12 / (MASS * ((2 * HX) ** 2 + (2 * HY) ** 2)));

function bodyGeometry() {
  // side profile (length along x here, rotated to z), extruded across the width
  const side = smoothShape([[-2.15, -0.42], [2.15, -0.42], [2.2, -0.05], [2.05, 0.1], [1.0, 0.2], [0.45, 0.62], [-1.05, 0.66], [-1.75, 0.3], [-2.15, 0.22]], 6);
  const g = extrude(side, 1.5, 0.12, 4);
  g.rotateY(-Math.PI / 2); // nose toward +z
  return g;
}
function glassGeometry() {
  const side = smoothShape([[0.95, 0.2], [0.42, 0.6], [-1.0, 0.63], [-1.6, 0.28]], 6);
  const g = extrude(side, 1.56, 0.04, 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

export class CarSystem {
  constructor(scene, spots, ctx) {
    this.ctx = ctx; // { smash(center, r, opts), voxels }
    this.cars = [];
    const n = spots.length;
    const paint = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.12 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x1a2430, roughness: 0.05, metalness: 0.9, envMapIntensity: 1.4 });
    const tyre = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 });
    const front = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff2d6, emissiveIntensity: 1.6 });
    const rear = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 1.4 });
    const mk = (geo, mat, count, shadow = true) => { const m = new THREE.InstancedMesh(geo, mat, count); m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m; };
    this.body = mk(bodyGeometry(), paint, n);
    this.glass = mk(glassGeometry(), glass, n);
    const wheel = lathe([[0.22, 0.13], [0.33, 0.12], [0.35, 0.0], [0.33, -0.12], [0.22, -0.13]], 20); wheel.rotateZ(Math.PI / 2);
    this.wheels = mk(wheel, tyre, n * 4);
    const lamp = new THREE.BoxGeometry(0.36, 0.12, 0.06);
    this.lightsF = mk(lamp, front, n * 2, false);
    this.lightsR = mk(lamp, rear, n * 2, false);
    this.wheelOff = [[-0.82, -0.38, 1.35], [0.82, -0.38, 1.35], [-0.82, -0.38, -1.35], [0.82, -0.38, -1.35]].map(([x, y, z]) => new THREE.Matrix4().makeTranslation(x, y, z));
    this.lightOffF = [[-0.62, -0.05, 2.2], [0.62, -0.05, 2.2]].map(([x, y, z]) => new THREE.Matrix4().makeTranslation(x, y, z));
    this.lightOffR = [[-0.62, 0.0, -2.2], [0.62, 0.0, -2.2]].map(([x, y, z]) => new THREE.Matrix4().makeTranslation(x, y, z));
    this.bodyOff = new THREE.Matrix4().makeTranslation(0, -0.08, 0);
    const col = new THREE.Color();
    spots.forEach(([x, z, yaw], i) => {
      const c = {
        i, p: new THREE.Vector3(x, HY + 0.02, z), q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
        v: new THREE.Vector3(), w: new THREE.Vector3(), asleep: true, still: 0, held: null, thrownBy: null, wreck: 0, color: new THREE.Color(PAINT[i % PAINT.length]),
      };
      col.copy(c.color).multiplyScalar(0.9 + ((i * 7919) % 100) / 500);
      this.body.setColorAt(i, col);
      this.cars.push(c);
      this._write(c);
    });
    this.body.instanceColor.needsUpdate = true;
    this._upload();
  }

  _write(c) {
    _m4.compose(c.p, c.q, _s);
    this.body.setMatrixAt(c.i, _w.multiplyMatrices(_m4, this.bodyOff));
    this.glass.setMatrixAt(c.i, _w.multiplyMatrices(_m4, this.bodyOff));
    for (let k = 0; k < 4; k++) this.wheels.setMatrixAt(c.i * 4 + k, _w.multiplyMatrices(_m4, this.wheelOff[k]));
    for (let k = 0; k < 2; k++) {
      this.lightsF.setMatrixAt(c.i * 2 + k, _w.multiplyMatrices(_m4, this.lightOffF[k]));
      this.lightsR.setMatrixAt(c.i * 2 + k, _w.multiplyMatrices(_m4, this.lightOffR[k]));
    }
    this.dirty = true;
  }
  _upload() {
    for (const m of [this.body, this.glass, this.wheels, this.lightsF, this.lightsR]) m.instanceMatrix.needsUpdate = true;
    this.dirty = false;
  }
  flush() { if (this.dirty) this._upload(); }

  wake(c) { c.asleep = false; c.still = 0; }

  // Push cars in range away from a point (explosions, punches, shockwaves).
  blast(center, radius, strength, dir = null, up = 0.4) {
    for (const c of this.cars) {
      if (c.held) continue;
      _r.subVectors(c.p, center);
      const d = _r.length();
      if (d > radius + 2) continue;
      const f = Math.max(0, 1 - Math.max(0, d - 1.5) / radius) * strength * 0.7;
      if (f < 0.5) continue;
      this.wake(c);
      c.v.addScaledVector(_r, f / (d + 1e-3)); c.v.y += f * up;
      if (dir) c.v.addScaledVector(dir, f * 0.6);
      c.w.x += (Math.random() - 0.5) * f * 0.5; c.w.y += (Math.random() - 0.5) * f * 0.4; c.w.z += (Math.random() - 0.5) * f * 0.5;
      if (f > 18) this._damage(c, f);
    }
  }

  // A hit on one car at a point (punch, body slam).
  hit(c, point, vel) {
    if (c.held) return;
    this.wake(c);
    c.v.add(vel);
    _r.subVectors(point, c.p);
    c.w.add(_t.crossVectors(_r, vel).multiplyScalar(0.25));
    if (vel.length() > 18) this._damage(c, vel.length());
  }

  _damage(c, f) {
    c.wreck = Math.min(1, c.wreck + f / 80);
    if (c.wreck >= 1 && !c.wrecked) { c.wrecked = true; this.onWreck?.(c); } // a wrecked car catches fire
    const k = 1 - c.wreck * 0.7;
    this.body.setColorAt(c.i, _a.set(c.color.r * k, c.color.g * k, c.color.b * k));
    this.body.instanceColor.needsUpdate = true;
  }

  // Nearest car (centre) within `range` of p, not held.
  nearest(p, range) {
    let best = null, bd = range;
    for (const c of this.cars) { if (c.held) continue; const d = c.p.distanceTo(p); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  hold(c, by) { c.held = by; c.asleep = false; c.v.set(0, 0, 0); c.w.set(0, 0, 0); }
  carry(c, pos, yaw) {
    const prev = _a.copy(c.p);
    c.p.copy(pos); c.q.setFromAxisAngle(_b.set(0, 1, 0), yaw);
    c.v.subVectors(c.p, prev).multiplyScalar(60);
    this._write(c);
  }
  release(c, vel, by) {
    c.held = null; c.thrownBy = by; c.v.copy(vel);
    c.w.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2);
    this.wake(c);
  }

  // Ray against the cars' boxes. Returns {t, car} or null.
  raycast(o, d, maxT) {
    let best = null;
    for (const c of this.cars) {
      _r.subVectors(c.p, o);
      const tc = _r.dot(d);
      if (tc < -3 || tc > maxT + 3) continue;
      if (_r.lengthSq() - tc * tc > 6.5) continue; // bounding sphere
      _q.copy(c.q).invert();
      const lo = _a.copy(o).sub(c.p).applyQuaternion(_q), ld = _b.copy(d).applyQuaternion(_q);
      let t0 = 0, t1 = maxT;
      for (const [oc, dc, h] of [[lo.x, ld.x, HX], [lo.y, ld.y, HY], [lo.z, ld.z, HZ]]) {
        if (Math.abs(dc) < 1e-8) { if (oc < -h || oc > h) { t0 = Infinity; break; } continue; }
        let ta = (-h - oc) / dc, tb = (h - oc) / dc; if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) break;
      }
      if (t0 <= t1 && t0 < maxT && (!best || t0 < best.t)) best = { t: t0, car: c };
    }
    return best;
  }

  // Is a world point inside a car (with margin)? Returns the car.
  carAt(p, margin = 0.3) {
    for (const c of this.cars) {
      if (c.held || c.p.distanceToSquared(p) > 9) continue;
      _q.copy(c.q).invert();
      const l = _a.copy(p).sub(c.p).applyQuaternion(_q);
      if (Math.abs(l.x) < HX + margin && Math.abs(l.y) < HY + margin && Math.abs(l.z) < HZ + margin) return c;
    }
    return null;
  }

  update(dt, sub = 2) {
    const h = dt / sub;
    const vox = this.ctx.voxels;
    for (let s = 0; s < sub; s++) {
      for (const c of this.cars) {
        if (c.asleep || c.held) continue;
        c.v.y += G * h;
        c.v.multiplyScalar(Math.max(0, 1 - 0.03 * h));
        c.p.addScaledVector(c.v, h);
        const wl = c.w.length();
        if (wl > 1e-6) { _q.setFromAxisAngle(_t.copy(c.w).divideScalar(wl), wl * h); c.q.premultiply(_q).normalize(); }
        this._contacts(c, vox);
      }
    }
    // car vs car: two spheres per car
    const awake = this.cars.filter((c) => !c.asleep && !c.held);
    for (const a of awake) for (const b of this.cars) {
      if (a === b || b.held || a.p.distanceToSquared(b.p) > 25) continue;
      for (const za of [-1.2, 1.2]) for (const zb of [-1.2, 1.2]) {
        const pa = _a.set(0, 0, za).applyQuaternion(a.q).add(a.p), pb = _b.set(0, 0, zb).applyQuaternion(b.q).add(b.p);
        _r.subVectors(pa, pb); const d = _r.length();
        if (d > 1.9 || d < 1e-4) continue;
        _r.divideScalar(d); const pen = 1.9 - d;
        a.p.addScaledVector(_r, pen * 0.5); b.p.addScaledVector(_r, -pen * 0.5);
        const vrel = _vr.subVectors(a.v, b.v).dot(_r);
        if (vrel < 0) { const j = -vrel * 0.6; a.v.addScaledVector(_r, j); if (vrel < -3) this.wake(b); b.v.addScaledVector(_r, -j); }
      }
    }
    for (const c of this.cars) {
      if (c.held || c.asleep) continue;
      if (c.p.y < -10) { c.p.set(c.p.x, HY, c.p.z); c.v.set(0, 0, 0); }
      if (c.v.lengthSq() < 0.05 && c.w.lengthSq() < 0.08) { c.still += dt; if (c.still > 0.6) { c.asleep = true; c.v.set(0, 0, 0); c.w.set(0, 0, 0); c.thrownBy = null; } }
      else c.still = 0;
      this._write(c);
    }
    if (this.dirty) this._upload();
  }

  _worldInvI(c) {
    _m4.makeRotationFromQuaternion(c.q); _m3.setFromMatrix4(_m4);
    _m3t.copy(_m3).transpose();
    const e = _inv.set(INV_I.x, 0, 0, 0, INV_I.y, 0, 0, 0, INV_I.z);
    return e.premultiply(_m3).multiply(_m3t);
  }

  _contacts(c, vox) {
    const invI = this._worldInvI(c);
    let cx = 0, cy = 0, cz = 0, nc = 0;
    const speed = c.v.length();
    let smashed = false;
    for (const sp of SAMPLES) {
      _r.copy(sp).applyQuaternion(c.q);
      const px = c.p.x + _r.x, py = c.p.y + _r.y, pz = c.p.z + _r.z;
      let pen = 0;
      if (py < 0) { _n.set(0, 1, 0); pen = -py; }
      else {
        const x = vox.cx(px), y = vox.cy(py), z = vox.cz(pz);
        if (!vox.inb(x, y, z) || !vox.occ[vox.idx(x, y, z)]) continue;
        // fast cars smash through instead of bouncing
        if (speed > 16) {
          if (!smashed) {
            const n = this.ctx.smash(_a.set(px, py, pz), 1.3, { vel: c.v, inherit: 0.6, outward: 4, noDust: Math.random() < 0.5 });
            if (n) { c.v.multiplyScalar(0.96); this._damage(c, 6); smashed = true; }
          }
          continue;
        }
        const ex = px - (vox.ox + (x + 0.5) * VS), ey = py - (y + 0.5) * VS, ez = pz - (vox.oz + (z + 0.5) * VS);
        let best = Infinity; _n.set(0, 1, 0);
        const tryA = (nx, ny, nz, e) => { const p = VS / 2 - Math.abs(e); if (p < best && !vox.solid(x + nx, y + ny, z + nz)) { best = p; _n.set(nx, ny, nz); } };
        tryA(Math.sign(ex) || 1, 0, 0, ex); tryA(0, Math.sign(ey) || 1, 0, ey); tryA(0, 0, Math.sign(ez) || 1, ez);
        if (best === Infinity) { best = VS / 2 - Math.abs(ey); _n.set(0, 1, 0); }
        pen = best;
      }
      _vr.crossVectors(c.w, _r).add(c.v);
      const vn = _vr.dot(_n);
      if (vn < 0) {
        const rn = _t.crossVectors(_r, _n);
        const irn = _a.copy(rn).applyMatrix3(invI);
        const K = 1 / MASS + _b.crossVectors(irn, _r).dot(_n);
        const e = vn < -5 ? 0.25 : 0;
        const j = -(1 + e) * vn / K;
        c.v.addScaledVector(_n, j / MASS);
        c.w.addScaledVector(irn, j);
        // friction
        _vr.crossVectors(c.w, _r).add(c.v);
        const tv = _a.copy(_vr).addScaledVector(_n, -_vr.dot(_n));
        const tl = tv.length();
        if (tl > 1e-4) {
          tv.divideScalar(tl);
          const rt = _t.crossVectors(_r, tv);
          const irt = _b.copy(rt).applyMatrix3(invI);
          const Kt = 1 / MASS + _vr.crossVectors(irt, _r).dot(tv);
          const jt = Math.min(tl / Kt, 0.8 * j);
          c.v.addScaledVector(tv, -jt / MASS);
          c.w.addScaledVector(irt, -jt);
        }
      }
      cx += _n.x * pen; cy += _n.y * pen; cz += _n.z * pen; nc++;
    }
    if (nc) { c.p.x += cx / nc * 0.8; c.p.y += cy / nc * 0.8; c.p.z += cz / nc * 0.8; }
  }
}
