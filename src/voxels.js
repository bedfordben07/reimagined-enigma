// Voxel world: every building is made of 0.5 m blocks rendered as instanced meshes.
// Blocks are static until something breaks them; then they become rigid debris.
import * as THREE from 'three';

export const VS = 0.5;

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

export class VoxelWorld {
  constructor(scene, matDefs) {
    this.scene = scene;
    this.matDefs = matDefs; // index = material id (1..n), {material, dust, glass}
    this.ox = -180; this.oz = -180;
    this.nx = 720; this.nz = 720; this.ny = 130; // 360 m square, 65 m tall
    this.occ = new Uint8Array(this.nx * this.ny * this.nz);
    // buildings never share a column, so the owner is stored per (x, z) column instead of per cell
    this.nxz = this.nx * this.nz;
    this.bcol = new Uint16Array(this.nxz);
    this.buildings = [null];
    // instanced meshes are split per material AND per 32 m chunk so off-screen chunks are culled
    this.meshes = new Map(); this.cells = new Map(); this.slot = new Map();
    this.dirty = new Set();
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.range = new Map();
    this.integrityTimer = 0;
    this.total = 0;
  }

  idx(x, y, z) { return (y * this.nz + z) * this.nx + x; }
  inb(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz; }
  cx(w) { return Math.floor((w - this.ox) / VS); }
  cy(w) { return Math.floor(w / VS); }
  cz(w) { return Math.floor((w - this.oz) / VS); }
  center(x, y, z, out) { return out.set(this.ox + (x + 0.5) * VS, (y + 0.5) * VS, this.oz + (z + 0.5) * VS); }
  decode(i) { const x = i % this.nx; const t = (i - x) / this.nx; const z = t % this.nz; const y = (t - z) / this.nz; return [x, y, z]; }

  solid(x, y, z) { return this.inb(x, y, z) && this.occ[this.idx(x, y, z)] !== 0; }
  solidAt(wx, wy, wz) {
    const x = this.cx(wx), y = this.cy(wy), z = this.cz(wz);
    return this.inb(x, y, z) ? this.occ[this.idx(x, y, z)] : 0;
  }

  addBuilding(tint) {
    this.buildings.push({ x0: 1e9, y0: 1e9, z0: 1e9, x1: -1, y1: -1, z1: -1, tint });
    return this.buildings.length - 1;
  }

  set(x, y, z, m, b) {
    if (!this.inb(x, y, z)) return;
    const i = this.idx(x, y, z);
    this.occ[i] = m; if (m && b) this.bcol[i % this.nxz] = b;
    if (m && b) {
      const B = this.buildings[b];
      if (x < B.x0) B.x0 = x; if (y < B.y0) B.y0 = y; if (z < B.z0) B.z0 = z;
      if (x > B.x1) B.x1 = x; if (y > B.y1) B.y1 = y; if (z > B.z1) B.z1 = z;
    }
  }

  reset() {
    for (const m of this.meshes.values()) { this.scene.remove(m); m.dispose(); }
    this.meshes.clear(); this.cells.clear(); this.range.clear(); this.slot.clear();
    this.occ.fill(0); this.bcol.fill(0);
    this.buildings = [null]; this.dirty.clear();
  }

  _key(m, i) {
    const x = i % this.nx, z = Math.floor(i / this.nx) % this.nz;
    return m * 64 + (z >> 7) * 8 + (x >> 7); // 64 m chunks
  }

  finalize() {
    const counts = new Array(this.matDefs.length).fill(0);
    const lists = new Map();
    for (let b = 1; b < this.buildings.length; b++) {
      const B = this.buildings[b];
      for (let y = B.y0; y <= B.y1; y++) for (let z = B.z0; z <= B.z1; z++) for (let x = B.x0; x <= B.x1; x++) {
        const i = this.idx(x, y, z);
        if (this.occ[i] && this.bcol[i % this.nxz] === b && !this.slot.has(i)) {
          const k = this._key(this.occ[i], i);
          let l = lists.get(k); if (!l) { l = []; lists.set(k, l); }
          l.push(i); this.slot.set(i, -1);
        }
      }
    }
    this.slot.clear();
    const v = new THREE.Vector3();
    let h = 1234567;
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
    this.total = 0;
    for (const [key, list] of lists) {
      const m = Math.floor(key / 64);
      counts[m] += list.length;
      const def = this.matDefs[m];
      const mesh = new THREE.InstancedMesh(this.geo, def.material, list.length);
      mesh.castShadow = true; mesh.receiveShadow = true;
      const cells = new Int32Array(list.length);
      for (let s = 0; s < list.length; s++) {
        const i = list[s]; const [x, y, z] = this.decode(i);
        this.center(x, y, z, v);
        if (def.glass) {
          // recess window panes: thin along the wall's normal so the surrounding blocks form a reveal
          const thinX = !this.solid(x - 1, y, z) && !this.solid(x + 1, y, z);
          const thinZ = !this.solid(x, y, z - 1) && !this.solid(x, y, z + 1);
          _m.makeScale(thinX ? VS * 0.32 : VS, VS, thinZ && !thinX ? VS * 0.32 : VS);
        } else _m.makeScale(VS, VS, VS);
        _m.setPosition(v);
        mesh.setMatrixAt(s, _m);
        const B = this.buildings[this.bcol[i % this.nxz]];
        const var_ = def.glass ? 0.04 : 0.1;
        const k = 1 - var_ / 2 + rnd() * var_;
        _c.setRGB(B.tint[0] * k, B.tint[1] * k, B.tint[2] * k);
        if (def.noTint) _c.setRGB(k, k, k);
        mesh.setColorAt(s, _c);
        cells[s] = i; this.slot.set(i, s);
      }
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      this.meshes.set(key, mesh); this.cells.set(key, cells);
      this.total += list.length;
      this.range.set(key, [Infinity, -1]);
    }
    return counts;
  }

  _mark(key, s) {
    const r = this.range.get(key);
    if (s < r[0]) r[0] = s; if (s > r[1]) r[1] = s;
  }

  // Remove a block by cell index; returns material id (0 if empty). Writes its color into outColor.
  remove(i, outColor) {
    const m = this.occ[i];
    if (!m) return 0;
    const key = this._key(m, i);
    const mesh = this.meshes.get(key), cells = this.cells.get(key);
    const s = this.slot.get(i);
    const last = mesh.count - 1;
    if (outColor) mesh.getColorAt(s, outColor);
    // time rewind keeps a record of every block that goes, so it can be put back
    if (this.onRemove) this.onRemove(i, m, mesh.instanceMatrix.array.slice(s * 16, s * 16 + 16), mesh.instanceColor.array.slice(s * 3, s * 3 + 3));
    if (s !== last) {
      const a = mesh.instanceMatrix.array, c = mesh.instanceColor.array;
      for (let k = 0; k < 16; k++) a[s * 16 + k] = a[last * 16 + k];
      for (let k = 0; k < 3; k++) c[s * 3 + k] = c[last * 3 + k];
      const mi = cells[last]; cells[s] = mi; this.slot.set(mi, s);
      this._mark(key, s);
    }
    mesh.count = last;
    this.slot.delete(i);
    this.occ[i] = 0;
    const b = this.bcol[i % this.nxz];
    if (b) this.dirty.add(b);
    this.total--;
    return m;
  }

  // Put a removed block back exactly as it was (time rewind).
  restore(i, m, mat16, col3) {
    if (this.occ[i]) return;
    const key = this._key(m, i);
    const mesh = this.meshes.get(key), cells = this.cells.get(key);
    if (!mesh || mesh.count >= mesh.instanceMatrix.count) return;
    const s = mesh.count;
    mesh.instanceMatrix.array.set(mat16, s * 16); mesh.instanceColor.array.set(col3, s * 3);
    cells[s] = i; this.slot.set(i, s); mesh.count = s + 1;
    this.occ[i] = m; this.total++;
    this._mark(key, s);
  }

  // Remove blocks inside a sphere (with a ragged edge). Returns [{x,y,z,m,color}]
  breakSphere(c, r, out = [], max = 900) {
    const x0 = this.cx(c.x - r), x1 = this.cx(c.x + r);
    const y0 = Math.max(0, this.cy(c.y - r)), y1 = this.cy(c.y + r);
    const z0 = this.cz(c.z - r), z1 = this.cz(c.z + r);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (!this.inb(x, y, z)) continue;
      const i = this.idx(x, y, z);
      if (!this.occ[i]) continue;
      const px = this.ox + (x + 0.5) * VS - c.x, py = (y + 0.5) * VS - c.y, pz = this.oz + (z + 0.5) * VS - c.z;
      const rr = r * (0.78 + Math.random() * 0.4);
      if (px * px + py * py + pz * pz > rr * rr) continue;
      const color = new THREE.Color();
      const m = this.remove(i, color);
      out.push({ x, y, z, m, color });
      if (out.length >= max) return out;
    }
    return out;
  }

  // Amanatides & Woo grid traversal. Returns {t, i, x,y,z, nx,ny,nz} or null.
  raycast(o, d, maxT) {
    let x = this.cx(o.x), y = this.cy(o.y), z = this.cz(o.z);
    const sx = d.x > 0 ? 1 : -1, sy = d.y > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
    const tdx = d.x !== 0 ? Math.abs(VS / d.x) : Infinity;
    const tdy = d.y !== 0 ? Math.abs(VS / d.y) : Infinity;
    const tdz = d.z !== 0 ? Math.abs(VS / d.z) : Infinity;
    let tmx = d.x !== 0 ? ((this.ox + (x + (d.x > 0 ? 1 : 0)) * VS) - o.x) / d.x : Infinity;
    let tmy = d.y !== 0 ? (((y + (d.y > 0 ? 1 : 0)) * VS) - o.y) / d.y : Infinity;
    let tmz = d.z !== 0 ? ((this.oz + (z + (d.z > 0 ? 1 : 0)) * VS) - o.z) / d.z : Infinity;
    let t = 0, nx = 0, ny = 0, nz = 0;
    for (let it = 0; it < 4000; it++) {
      if (this.inb(x, y, z)) {
        const i = this.idx(x, y, z);
        if (this.occ[i]) return { t, i, x, y, z, nx, ny, nz };
      } else {
        if ((y >= this.ny && d.y >= 0) || (y < 0 && d.y <= 0) || (x < 0 && d.x <= 0) || (x >= this.nx && d.x >= 0) || (z < 0 && d.z <= 0) || (z >= this.nz && d.z >= 0)) return null;
      }
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
      if (t > maxT) return null;
    }
    return null;
  }

  // Sphere vs voxels: pushes `p` out of solid blocks. Returns {hit, ny(max up-normal)} and calls onHit(i) per block.
  collideSphere(p, r, onHit) {
    const x0 = this.cx(p.x - r), x1 = this.cx(p.x + r);
    const y0 = Math.max(0, this.cy(p.y - r)), y1 = this.cy(p.y + r);
    const z0 = this.cz(p.z - r), z1 = this.cz(p.z + r);
    let hit = false, upN = -1;
    const n = { x: 0, y: 0, z: 0 };
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (!this.inb(x, y, z)) continue;
      const i = this.idx(x, y, z);
      if (!this.occ[i]) continue;
      if (onHit && onHit(i)) continue; // block was destroyed instead
      const bx0 = this.ox + x * VS, by0 = y * VS, bz0 = this.oz + z * VS;
      const qx = Math.max(bx0, Math.min(p.x, bx0 + VS));
      const qy = Math.max(by0, Math.min(p.y, by0 + VS));
      const qz = Math.max(bz0, Math.min(p.z, bz0 + VS));
      let dx = p.x - qx, dy = p.y - qy, dz = p.z - qz;
      let d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r) continue;
      let pen;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2); n.x = dx / d; n.y = dy / d; n.z = dz / d; pen = r - d;
      } else {
        // center inside block: push out through the nearest free face
        const cxw = bx0 + VS / 2, cyw = by0 + VS / 2, czw = bz0 + VS / 2;
        const ex = p.x - cxw, ey = p.y - cyw, ez = p.z - czw;
        const ax = Math.abs(ex), ay = Math.abs(ey), az = Math.abs(ez);
        n.x = n.y = n.z = 0;
        if (ay >= ax && ay >= az) { n.y = Math.sign(ey) || 1; pen = VS / 2 - ay + r; }
        else if (ax >= az) { n.x = Math.sign(ex) || 1; pen = VS / 2 - ax + r; }
        else { n.z = Math.sign(ez) || 1; pen = VS / 2 - az + r; }
      }
      p.x += n.x * pen; p.y += n.y * pen; p.z += n.z * pen;
      hit = true; if (n.y > upN) upN = n.y;
    }
    return hit ? upN : null;
  }

  // Cells cut off from the ground fall down as debris.
  updateIntegrity(dt, onDetach) {
    if (!this.dirty.size) return;
    this.integrityTimer -= dt;
    if (this.integrityTimer > 0) return;
    this.integrityTimer = 0.06;
    const list = [...this.dirty]; this.dirty.clear();
    for (const b of list) {
      const B = this.buildings[b];
      if (!B) continue;
      const W = B.x1 - B.x0 + 1, D = B.z1 - B.z0 + 1, Hh = B.y1 - B.y0 + 1;
      const vol = W * D * Hh;
      const vis = new Uint8Array(vol);
      const q = new Int32Array(vol);
      let qh = 0, qt = 0;
      const lidx = (x, y, z) => ((y - B.y0) * D + (z - B.z0)) * W + (x - B.x0);
      const yb = B.y0;
      for (let z = B.z0; z <= B.z1; z++) for (let x = B.x0; x <= B.x1; x++) {
        const i = this.idx(x, yb, z);
        if (this.occ[i] && this.bcol[i % this.nxz] === b) { const l = lidx(x, yb, z); vis[l] = 1; q[qt++] = l; }
      }
      while (qh < qt) {
        const l = q[qh++];
        const lx = l % W, t = (l - lx) / W, lz = t % D, ly = (t - lz) / D;
        const x = lx + B.x0, y = ly + B.y0, z = lz + B.z0;
        const nb = [[x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z], [x, y, z + 1], [x, y, z - 1]];
        for (const [a, bb, c] of nb) {
          if (a < B.x0 || a > B.x1 || bb < B.y0 || bb > B.y1 || c < B.z0 || c > B.z1) continue;
          const l2 = lidx(a, bb, c);
          if (vis[l2]) continue;
          const i2 = this.idx(a, bb, c);
          if (this.occ[i2] && this.bcol[i2 % this.nxz] === b) { vis[l2] = 1; q[qt++] = l2; }
        }
      }
      const detached = [];
      for (let y = B.y0; y <= B.y1; y++) for (let z = B.z0; z <= B.z1; z++) for (let x = B.x0; x <= B.x1; x++) {
        const i = this.idx(x, y, z);
        if (this.occ[i] && this.bcol[i % this.nxz] === b && !vis[lidx(x, y, z)]) detached.push(i);
      }
      if (detached.length) {
        const out = [];
        for (const i of detached) {
          const [x, y, z] = this.decode(i);
          const color = new THREE.Color();
          const m = this.remove(i, color);
          out.push({ x, y, z, m, color });
        }
        this.dirty.delete(b);
        onDetach(out);
      }
    }
  }

  flush() {
    for (const [key, mesh] of this.meshes) {
      const r = this.range.get(key);
      if (r[1] >= 0) {
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(r[0] * 16, (r[1] - r[0] + 1) * 16);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(r[0] * 3, (r[1] - r[0] + 1) * 3);
        mesh.instanceColor.needsUpdate = true;
        r[0] = Infinity; r[1] = -1;
      }
    }
  }
}
