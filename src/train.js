// A train built from the same 0.5 m blocks as the buildings, running a loop of track around the town.
// Every carriage is its own little voxel grid riding on the track, so anything that breaks buildings
// (punches, lasers, blasts, booms, the nuke) chews pieces out of it. Hit it hard enough and the whole
// train derails: the carriages leave the rails as tumbling bodies that plough through whatever they hit.
import * as THREE from 'three';
import { trackDip } from './under.js?v=1795701775';

const VS = 0.5;
const W = 6, H = 8, L = 36; // blocks: 3 m wide, 4 m tall, 18 m long
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const cell = (x, y, z) => (y * L + z) * W + x;

// Track: a rounded rectangle just outside the town.
function makeTrack(half = 206, r = 34) {
  const pts = [];
  const corners = [[half - r, half - r, 0], [-(half - r), half - r, Math.PI / 2], [-(half - r), -(half - r), Math.PI], [half - r, -(half - r), Math.PI * 1.5]];
  for (const [cx, cz, a0] of corners) for (let i = 0; i <= 12; i++) { const a = a0 + (i / 12) * Math.PI / 2; pts.push(new THREE.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r)); }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  return { curve, length: curve.getLength() };
}

function carLayout(kind, accent) {
  const out = []; // [x, y, z, color, glass]
  const body = new THREE.Color(kind === 'loco' ? 0xb8261c : 0x2c5a8e), dark = new THREE.Color(0x2a2c30), roof = new THREE.Color(0x8f969e), glass = new THREE.Color(0x1d2a36), stripe = new THREE.Color(accent), lamp = new THREE.Color(3, 2.6, 1.6);
  for (let z = 0; z < L; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let col = null, gl = false;
    const end = z === 0 || z === L - 1, side = x === 0 || x === W - 1;
    if (y === 0) { if ((z >= 3 && z <= 8) || (z >= L - 9 && z <= L - 4)) col = dark; }               // bogies
    else if (y === 1) col = dark;                                                                // chassis
    else if (y >= 2 && y <= 5) {
      if (side) { col = y === 2 ? stripe : body; if ((y === 3 || y === 4) && z % 5 >= 1 && z % 5 <= 3 && z > 2 && z < L - 3) { col = glass; gl = true; } }
      else if (end) { col = body; if (y >= 3 && y <= 4 && x >= 2 && x <= 3) { col = glass; gl = true; } }
    } else if (y === 6) col = roof;
    else if (y === 7 && x >= 1 && x <= 4) col = roof;
    if (kind === 'loco' && z >= L - 5) {
      // the cab nose: stepped down at the front, a big windscreen and headlamps
      const k = z - (L - 5);
      if (y >= 7 - Math.floor(k / 2) && y >= 5) col = null;
      if (col && z === L - 1 && y === 3 && (x === 1 || x === 4)) col = lamp;
      if (col && z === L - 2 && y >= 4 && y <= 5 && x >= 1 && x <= 4) { col = glass; gl = true; }
    }
    if (col) out.push([x, y, z, col, gl]);
  }
  return out;
}

export class VoxelTrain {
  constructor(g) {
    this.g = g; // { scene, debris, MAT, fx, sfx, fire, smash, blastAll, cars, dummy, knockPlayer, hurtPlayer, player, score, vox }
    this.track = makeTrack();
    this.speed = 24;
    this.geo = new THREE.BoxGeometry(VS * 0.98, VS * 0.98, VS * 0.98);
    this.mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.35 });
    this.log = null; // rewind log hook: (entry) => void
    this._buildTrackMeshes();
    this.cars = [];
    this.newTrain();
  }

  _buildTrackMeshes() {
    const g = this.g, n = Math.ceil(this.track.length / 1.2);
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.8, 0.14, 0.4), new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.9 }), n);
    const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.16, 1.25), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.3, metalness: 0.9 }), n * 2);
    for (let i = 0; i < n; i++) {
      const u = i / n, p = this.track.curve.getPointAt(u), t = this.track.curve.getTangentAt(u);
      _q.setFromUnitVectors(_a.set(0, 0, 1), t);
      const dy = trackDip(p.x, p.z);
      _m.compose(_v.set(p.x, 0.07 + dy, p.z), _q, _b.set(1, 1, 1)); sleepers.setMatrixAt(i, _m);
      const side = _a.set(t.z, 0, -t.x).normalize();
      for (const s of [-1, 1]) { _m.compose(_v.set(p.x + side.x * s * 0.72, 0.2 + dy, p.z + side.z * s * 0.72), _q, _b.set(1, 1, 1)); rails.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), _m); }
    }
    const bed = new THREE.Mesh(new THREE.TubeGeometry(this.track.curve, 200, 2.1, 4, true), new THREE.MeshStandardMaterial({ color: 0x5b5650, roughness: 1 }));
    bed.scale.y = 0.02; bed.receiveShadow = true;
    for (const m of [sleepers, rails]) { m.receiveShadow = true; g.scene.add(m); }
    bed.visible = false; g.scene.add(bed);
  }

  newTrain() {
    for (const c of this.cars) this.g.scene.remove(c.g);
    const kinds = ['loco', 'car', 'car', 'car', 'car', 'car'];
    const accents = [0xf2c230, 0xf2c230, 0xe8e8e8, 0xf2c230, 0xe8e8e8, 0xf2c230];
    this.cars = kinds.map((k, i) => this._makeCar(k, accents[i], i));
    this.s = 0; this.derailed = false; this.respawnT = 0;
  }

  _makeCar(kind, accent, idx) {
    const lay = carLayout(kind, accent);
    const mesh = new THREE.InstancedMesh(this.geo, this.mat, lay.length);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    const occ = new Uint8Array(W * H * L), slot = new Int32Array(W * H * L).fill(-1), cells = new Int32Array(lay.length);
    const colors = new Float32Array(W * H * L * 3), glass = new Uint8Array(W * H * L);
    lay.forEach(([x, y, z, col, gl], s) => {
      const i = cell(x, y, z);
      _m.makeTranslation((x - W / 2 + 0.5) * VS, (y + 0.5) * VS, (z - L / 2 + 0.5) * VS);
      mesh.setMatrixAt(s, _m); mesh.setColorAt(s, col);
      occ[i] = 1; slot[i] = s; cells[s] = i; colors.set([col.r, col.g, col.b], i * 3); glass[i] = gl ? 1 : 0;
    });
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const grp = new THREE.Group(); grp.add(mesh); this.g.scene.add(grp);
    return { kind, idx, g: grp, mesh, occ, slot, cells, colors, glass, total: lay.length, alive: lay.length, free: false, p: new THREE.Vector3(), q: new THREE.Quaternion(), v: new THREE.Vector3(), w: new THREE.Vector3(), rest: 0 };
  }

  _remove(car, i) {
    const s = car.slot[i]; if (s < 0) return;
    const mesh = car.mesh, last = mesh.count - 1;
    if (s !== last) {
      const a = mesh.instanceMatrix.array, c = mesh.instanceColor.array;
      for (let k = 0; k < 16; k++) a[s * 16 + k] = a[last * 16 + k];
      for (let k = 0; k < 3; k++) c[s * 3 + k] = c[last * 3 + k];
      const mi = car.cells[last]; car.cells[s] = mi; car.slot[mi] = s;
    }
    mesh.count = last; car.slot[i] = -1; car.occ[i] = 0; car.alive--;
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    this.log?.({ type: 'train', car, i });
  }
  // put a block back (time rewind)
  restore(car, i) {
    if (car.occ[i] || !this.cars.includes(car)) return;
    const mesh = car.mesh, s = mesh.count;
    const x = i % W, t = (i - x) / W, z = t % L, y = (t - z) / L;
    _m.makeTranslation((x - W / 2 + 0.5) * VS, (y + 0.5) * VS, (z - L / 2 + 0.5) * VS);
    mesh.setMatrixAt(s, _m); mesh.setColorAt(s, _c.fromArray(car.colors, i * 3));
    mesh.count = s + 1; car.slot[i] = s; car.cells[s] = i; car.occ[i] = 1; car.alive++;
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
  }

  _toLocal(car, p, out) { car.g.updateMatrixWorld(); _inv.copy(car.g.matrixWorld).invert(); return out.copy(p).applyMatrix4(_inv); }
  _cellAt(lp) {
    const x = Math.floor(lp.x / VS + W / 2), y = Math.floor(lp.y / VS), z = Math.floor(lp.z / VS + L / 2);
    if (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= L) return -1;
    return cell(x, y, z);
  }
  // is world point p inside a block of the train?
  solidAt(p) {
    for (const car of this.cars) {
      if (car.p.distanceToSquared(p) > 150) continue;
      const i = this._cellAt(this._toLocal(car, p, _a));
      if (i >= 0 && car.occ[i]) return car;
    }
    return null;
  }

  // Break blocks in a sphere (called from the game's smash). Returns the number removed.
  smash(center, radius, o = {}) {
    let n = 0;
    for (const car of this.cars) {
      if (car.p.distanceTo(center) > radius + 10) continue;
      const lc = this._toLocal(car, center, _b.set(0, 0, 0)).clone();
      const r = radius / VS;
      const x0 = Math.max(0, Math.floor(lc.x / VS + W / 2 - r)), x1 = Math.min(W - 1, Math.floor(lc.x / VS + W / 2 + r));
      const y0 = Math.max(0, Math.floor(lc.y / VS - r)), y1 = Math.min(H - 1, Math.floor(lc.y / VS + r));
      const z0 = Math.max(0, Math.floor(lc.z / VS + L / 2 - r)), z1 = Math.min(L - 1, Math.floor(lc.z / VS + L / 2 + r));
      let shards = 0, hitGlass = false;
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const i = cell(x, y, z); if (!car.occ[i]) continue;
        const dx = (x - W / 2 + 0.5) * VS - lc.x, dy = (y + 0.5) * VS - lc.y, dz = (z - L / 2 + 0.5) * VS - lc.z;
        const rr = radius * (0.8 + Math.random() * 0.4);
        if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
        if (car.glass[i]) hitGlass = true;
        this._remove(car, i); n++;
        if (shards < 40) {
          shards++;
          const wp = _a.set((x - W / 2 + 0.5) * VS, (y + 0.5) * VS, (z - L / 2 + 0.5) * VS).applyMatrix4(car.g.matrixWorld);
          const out = _v.subVectors(wp, center).normalize().multiplyScalar((o.outward ?? 4) * (0.5 + Math.random()));
          if (o.vel) out.addScaledVector(o.vel, (o.inherit ?? 0.6) * (0.6 + Math.random() * 0.5));
          out.y += (o.up ?? 2) * Math.random(); out.add(car.v);
          this.g.debris.spawn(wp, out, car.glass[i] ? this.g.MAT.GLASS : this.g.MAT.TRIM_DARK, _c.fromArray(car.colors, i * 3), VS * 0.9);
        }
      }
      if (hitGlass) this.g.sfx.glass();
      // a heavy enough hit, or a carriage torn half apart, throws the train off the rails
      if (!this.derailed && n > 0 && (radius >= 2.2 || car.alive < car.total * 0.65)) this.derail(car, o.vel ? o.vel.clone() : _v.subVectors(car.p, center).setY(0).setLength(radius * 6));
    }
    if (n) this.g.sfx.crunch?.();
    return n;
  }

  derail(hit, push) {
    if (this.derailed) return;
    this.derailed = true; this.respawnT = 40;
    const t = this.track.curve.getTangentAt(((this.s % this.track.length) + this.track.length) % this.track.length / this.track.length);
    this.cars.forEach((c, k) => {
      c.free = true;
      c.v.copy(t).multiplyScalar(this.speed * (1 - Math.abs(k - hit.idx) * 0.04)).add(_v.set((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6));
      if (Math.abs(k - hit.idx) <= 1) c.v.addScaledVector(push.clampLength(0, 60), 0.6).add(_v.set(0, 6, 0));
      c.w.set((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
    });
    this.g.score?.(3000, 'TRAIN DERAILED');
    this.g.sfx.boom(1.4); this.g.sfx.crunch?.();
  }

  // Ray against the train (aiming, punches). Returns {t, car} or null.
  raycast(o, d, maxT) {
    let best = null;
    for (const car of this.cars) {
      const tc = Math.max(0, _a.subVectors(car.p, o).dot(d));
      if (tc - 12 > maxT || _b.copy(o).addScaledVector(d, tc).distanceTo(car.p) > 10.5) continue;
      for (let t = Math.max(0, tc - 11); t < Math.min(maxT, tc + 11, best ? best.t : 1e9); t += 0.2) {
        const i = this._cellAt(this._toLocal(car, _b.copy(o).addScaledVector(d, t), _a));
        if (i >= 0 && car.occ[i]) { best = { t, car }; break; }
      }
    }
    return best;
  }

  snapshot() {
    return { s: this.s, derailed: this.derailed, respawnT: this.respawnT, cars: this.cars.map((c) => ({ c, free: c.free, p: c.p.clone(), q: c.q.clone(), v: c.v.clone(), w: c.w.clone() })) };
  }
  applySnapshot(S) {
    this.s = S.s; this.derailed = S.derailed; this.respawnT = S.respawnT;
    for (const e of S.cars) { if (!this.cars.includes(e.c)) continue; e.c.free = e.free; e.c.p.copy(e.p); e.c.q.copy(e.q); e.c.v.copy(e.v); e.c.w.copy(e.w); e.c.g.position.copy(e.p); e.c.g.quaternion.copy(e.q); }
  }

  update(dt) {
    const g = this.g, tr = this.track;
    if (!this.derailed) {
      this.s += this.speed * dt;
      this.cars.forEach((c, k) => {
        // each carriage spans two points on the curve, so it follows the bends
        const sf = this.s - k * 19 + 8.5, sb = this.s - k * 19 - 8.5;
        const pf = tr.curve.getPointAt((((sf % tr.length) + tr.length) % tr.length) / tr.length, _a);
        const pb = tr.curve.getPointAt((((sb % tr.length) + tr.length) % tr.length) / tr.length, _b);
        pf.y = trackDip(pf.x, pf.z); pb.y = trackDip(pb.x, pb.z);
        const prev = c.p.clone();
        c.p.addVectors(pf, pb).multiplyScalar(0.5); c.p.y += 0.25;
        c.q.setFromUnitVectors(_v.set(0, 0, 1), _v.subVectors(pf, pb).normalize());
        c.v.subVectors(c.p, prev).divideScalar(Math.max(dt, 1e-4));
        c.g.position.copy(c.p); c.g.quaternion.copy(c.q);
      });
      // anything on the line gets hit
      const loco = this.cars[0], fw = _v.set(0, 0, 1).applyQuaternion(loco.q);
      const nose = loco.p.clone().addScaledVector(fw, 9.5).add(_a.set(0, 1.5, 0));
      const pc = g.chest();
      if (pc.distanceTo(nose) < 3 && g.player.vel.length() < 20) { g.knockPlayer(fw.clone().add(_a.set(0, 0.4, 0)), 45, 'tackle'); g.hurtPlayer(25); }
      const dc = g.dummy.chest(new THREE.Vector3()); if (dc.distanceTo(nose) < 3) g.dummy.hit(dc, 3, fw.clone().multiplyScalar(45).add(_a.set(0, 14, 0)), 1);
      const car = g.cars.carAt(nose, 1.2); if (car) g.cars.hit(car, nose, fw.clone().multiplyScalar(35).add(_a.set(0, 10, 0)));
    } else {
      // free bodies: tumble, bounce, slide, and plough through buildings
      for (const c of this.cars) {
        if (!c.free) continue;
        const sp = c.v.length();
        if (c.rest > 2 && sp < 0.3) continue;
        c.v.y -= 20 * dt;
        c.p.addScaledVector(c.v, dt);
        const wl = c.w.length(); if (wl > 1e-4) { _q.setFromAxisAngle(_a.copy(c.w).divideScalar(wl), wl * dt); c.q.premultiply(_q).normalize(); }
        // lowest corner against the ground
        let low = 1e9;
        for (const cx of [-1.5, 1.5]) for (const cy of [0, 4]) for (const cz of [-9, 9]) { const y = _a.set(cx, cy, cz).applyQuaternion(c.q).y + c.p.y; if (y < low) low = y; }
        if (low < 0) {
          c.p.y -= low;
          if (c.v.y < -6) { g.sfx.boom(Math.min(1.2, -c.v.y / 20)); g.blastAll(c.p.clone(), 6, Math.min(20, -c.v.y), null, 0.5); for (let i = 0; i < 6; i++) g.fx.dust.emit(c.p, _a.set((Math.random() - 0.5) * 8, 3, (Math.random() - 0.5) * 8), new THREE.Color(0.55, 0.52, 0.48), 3, 2, 2, 0.5); }
          if (c.v.y < 0) c.v.y *= -0.2;
          c.v.x *= Math.exp(-1.6 * dt); c.v.z *= Math.exp(-1.6 * dt); c.w.multiplyScalar(Math.exp(-2.5 * dt));
          // settle flat-ish
          const up = _a.set(0, 1, 0).applyQuaternion(c.q);
          if (sp < 3) { const tgt = up.y >= 0 ? UP : _b.set(0, -1, 0); _q.setFromUnitVectors(up, tgt); c.q.premultiply(_q.slerp(new THREE.Quaternion(), 1 - Math.min(1, dt * 3))); }
          c.rest += sp < 1 ? dt : 0;
        }
        if (sp > 8 && Math.abs(c.p.x) < 182 && Math.abs(c.p.z) < 182) {
          const fw = _b.copy(c.v).normalize();
          const front = c.p.clone().addScaledVector(fw, 10.5).add(_a.set(0, 2, 0));
          if (g.vox.solidAt(front.x, front.y, front.z)) { g.smash(front, 2.4, { vel: c.v.clone(), inherit: 0.8, outward: 8, up: 3, max: 900 }); c.v.multiplyScalar(0.93); }
        }
        c.g.position.copy(c.p); c.g.quaternion.copy(c.q);
      }
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.newTrain();
    }
  }
}
