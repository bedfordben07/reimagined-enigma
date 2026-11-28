// AXIOM's relay towers: antenna masts on the tallest rooftops that carry the hive's signal. While they
// stand, its units hit harder; knock them all out and the hive loses its uploaded protocols until they're
// rebuilt. They break like anything else: punch, laser, blast them, or bring the building down under them.
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Relays {
  constructor(g) {
    this.g = g; // { scene, vox, fx, sfx, score, onChange }
    this.list = [];
    const grey = new THREE.MeshStandardMaterial({ color: 0x5a5e66, metalness: 0.8, roughness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.6, roughness: 0.5 });
    this.mats = { grey, dark, beacon: new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 0.8, 0.4) }) };
    this.build();
  }
  _top(x, z) { for (let y = 64; y > 0; y -= 0.5) if (this.g.vox.solidAt(x, y, z)) return y + 0.5; return 0; }
  build() {
    for (const r of this.list) this.g.scene.remove(r.g);
    const cand = [];
    for (let x = -160; x <= 160; x += 11) for (let z = -160; z <= 160; z += 11) { const h = this._top(x, z); if (h > 12) cand.push([x, z, h]); }
    cand.sort((a, b) => b[2] - a[2]);
    const pick = [];
    for (const c of cand) { if (pick.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) > 90)) pick.push(c); if (pick.length === 4) break; }
    this.list = pick.map(([x, z, h]) => this._make(x, z, h));
  }
  _make(x, z, h) {
    const g = new THREE.Group(); g.position.set(x, h, z);
    const M = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = true; g.add(o); return o; };
    M(new THREE.BoxGeometry(1.6, 0.6, 1.6), this.mats.dark, 0, 0.3, 0);
    M(new THREE.CylinderGeometry(0.12, 0.22, 9, 8), this.mats.grey, 0, 5, 0);
    for (let i = 0; i < 3; i++) { const d = M(new THREE.ConeGeometry(0.7, 0.4, 16, 1, true), this.mats.grey, Math.cos(i * 2.1) * 0.5, 3 + i * 2, Math.sin(i * 2.1) * 0.5); d.rotation.z = Math.PI / 2; d.rotation.y = i * 2.1; }
    const b = M(new THREE.SphereGeometry(0.25, 12, 8), this.mats.beacon, 0, 9.6, 0); b.castShadow = false; b.userData.noOutline = true;
    this.g.scene.add(g);
    return { g, beacon: b, p: new THREE.Vector3(x, h, z), hp: 260, alive: true, respawn: 0 };
  }
  get alive() { return this.list.filter((r) => r.alive).length; }
  get total() { return this.list.length; }
  positions() { return this.list.filter((r) => r.alive).map((r) => _v.copy(r.p).setY(r.p.y + 9.6).clone()); }
  _destroy(r, quiet = false) {
    if (!r.alive) return;
    r.alive = false; r.respawn = 90; r.g.visible = false;
    const p = r.p.clone().add(new THREE.Vector3(0, 5, 0));
    if (!quiet) {
      this.g.fx.wave(p, 6, 0.35, new THREE.Color(4, 1, 0.5)); this.g.sfx.boom(1.2); this.g.sfx.glass?.();
      for (let i = 0; i < 30; i++) this.g.fx.sparks.emit(p, new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(20), new THREE.Color(5, 2, 0.8), 0.5, 0.9, 0.03);
      this.g.score?.(1500, 'RELAY DESTROYED');
    }
    this.g.onChange?.(this.alive, this.total);
  }
  blast(center, radius, strength) {
    if (strength < 8) return;
    for (const r of this.list) {
      if (!r.alive) continue;
      const d = Math.min(center.distanceTo(r.p), center.distanceTo(_v.copy(r.p).setY(r.p.y + 5)), center.distanceTo(_v.copy(r.p).setY(r.p.y + 9)));
      if (d < radius + 1.5) { r.hp -= strength * 1.5 * (1 - d / (radius + 3)); if (r.hp <= 0) this._destroy(r); }
    }
  }
  update(dt, t) {
    this.checkT = (this.checkT || 0) - dt;
    for (const r of this.list) {
      if (r.alive) {
        r.beacon.visible = (t % 1.2) < 0.25;
        if (this.checkT <= 0 && !this.g.vox.solidAt(r.p.x, r.p.y - 0.3, r.p.z)) this._destroy(r); // its building came down
      } else {
        r.respawn -= dt;
        if (r.respawn <= 0) {
          const h = this._top(r.p.x, r.p.z);
          if (h > 8) { r.p.y = h; r.g.position.y = h; r.alive = true; r.hp = 260; r.g.visible = true; this.g.onChange?.(this.alive, this.total, true); }
          else r.respawn = 30; // nothing left to stand on: wait for a rebuild
        }
      }
    }
    if (this.checkT <= 0) this.checkT = 1;
  }
}
