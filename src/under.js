// Underground: service tunnels under the two main roads, joined to a subway tunnel the train dives into on
// the north side of its loop. Get in by punching through the street (or slamming into it), or walk in
// through a subway portal. Down here it's dark concrete, strip lights, pipes and the rumble of the train.
import * as THREE from 'three';

const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const FLOOR = -10, CEIL = -2.6;
const SUB_Z = 206, PORTAL = 165, RAMP_END = 125;

// how far below the surface the train track runs at (x, z)
export function trackDip(x, z) {
  if (z < SUB_Z - 20) return 0;
  return FLOOR * sstep(PORTAL, RAMP_END, Math.abs(x));
}

export class Underground {
  constructor(g) {
    this.g = g; // { scene }
    this.cor = [
      { x0: -170, x1: 170, z0: -4.6, z1: 4.6 },              // under the east-west main road
      { x0: -4.6, x1: 4.6, z0: -170, z1: SUB_Z - 5 },         // under the north-south main road, running out to the subway
      { x0: -PORTAL, x1: PORTAL, z0: SUB_Z - 6, z1: SUB_Z + 6, subway: true },
    ];
    this.breaches = [];
    this._build();
  }

  _build() {
    const g = this.g;
    const wall = new THREE.MeshStandardMaterial({ color: 0x6f6b64, roughness: 0.95, side: THREE.BackSide });
    wall.shadowSide = THREE.DoubleSide;
    const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.2, 1.8) });
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x3d4a52, metalness: 0.6, roughness: 0.5 });
    const strips = [], pipes = [];
    for (const c of this.cor) {
      const w = c.x1 - c.x0, d = c.z1 - c.z0, h = CEIL - FLOOR;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
      box.position.set((c.x0 + c.x1) / 2, (FLOOR + CEIL) / 2 - (c.subway ? 0.6 : 0), (c.z0 + c.z1) / 2);
      if (c.subway) box.scale.y = (h + 1.2) / h;
      box.receiveShadow = true; g.scene.add(box);
      const alongX = w > d, L = Math.max(w, d);
      for (let s = 4; s < L - 4; s += 9) strips.push([alongX ? c.x0 + s : (c.x0 + c.x1) / 2, CEIL - 0.15, alongX ? (c.z0 + c.z1) / 2 : c.z0 + s, alongX]);
      for (const side of [-1, 1]) pipes.push([(c.x0 + c.x1) / 2 + (alongX ? 0 : side * (w / 2 - 0.4)), CEIL - 1.1, (c.z0 + c.z1) / 2 + (alongX ? side * (d / 2 - 0.4) : 0), alongX, L]);
    }
    const sm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.12, 0.3), lightMat, strips.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    strips.forEach(([x, y, z, ax], i) => { m.compose(p.set(x, y, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ax ? 0 : Math.PI / 2), one); sm.setMatrixAt(i, m); });
    g.scene.add(sm);
    for (const [x, y, z, ax, L] of pipes) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, L, 10), pipeMat);
      c.position.set(x, y, z); c.rotation[ax ? 'z' : 'x'] = Math.PI / 2; g.scene.add(c);
    }
    // subway portals: concrete arches where the track dives under
    const conc = new THREE.MeshStandardMaterial({ color: 0x8a867e, roughness: 0.9 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x050505 });
    for (const sx of [-1, 1]) {
      const grp = new THREE.Group(); grp.position.set(sx * PORTAL, 0, SUB_Z);
      for (const sz of [-1, 1]) { const pier = new THREE.Mesh(new THREE.BoxGeometry(3, 7, 1.4), conc); pier.position.set(sx * 1.5, 3.5, sz * 5.4); pier.castShadow = true; grp.add(pier); }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 12.2), conc); lintel.position.set(sx * 1.5, 7.6, 0); lintel.castShadow = true; grp.add(lintel);
      const mouth = new THREE.Mesh(new THREE.PlaneGeometry(10, 6.8), dark); mouth.position.set(sx * 1.6, 3.4, 0); mouth.rotation.y = -sx * Math.PI / 2; grp.add(mouth);
      // a sunken cutting the track drops into
      const cut = new THREE.Mesh(new THREE.PlaneGeometry(PORTAL - RAMP_END, 10), dark); cut.rotation.x = -Math.PI / 2; cut.position.set(-sx * (PORTAL - RAMP_END) / 2 + sx * 0, 0.03, 0); grp.add(cut);
      g.scene.add(grp);
    }
    // lights that follow you down here
    this.lamps = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffe2b8, 0, 22, 1.6); g.scene.add(l); return l; });
    this.holeGeo = new THREE.CircleGeometry(1, 24); this.holeMat = new THREE.MeshBasicMaterial({ color: 0x030303 });
    this.rimGeo = new THREE.TorusGeometry(1, 0.18, 6, 24); this.rimMat = new THREE.MeshStandardMaterial({ color: 0x3a3936, roughness: 1 });
  }

  // the corridor (if any) whose footprint contains (x, z)
  corridorAt(x, z, pad = 0) { for (const c of this.cor) if (x >= c.x0 - pad && x <= c.x1 + pad && z >= c.z0 - pad && z <= c.z1 + pad) return c; return null; }
  // can you pass between the surface and the tunnel at (x, z)?
  openAt(x, z) {
    for (const b of this.breaches) if (Math.hypot(x - b.x, z - b.z) < b.r * 0.8) return true;
    return z > SUB_Z - 6 && z < SUB_Z + 6 && Math.abs(x) > RAMP_END && Math.abs(x) < PORTAL + 1;
  }
  floorAt(x, z) { const c = this.corridorAt(x, z); if (!c) return null; return c.subway ? trackDip(x, z) : FLOOR; }

  // punch / slam a hole into the tunnel below; only works over a corridor
  breach(x, z, r) {
    if (!this.corridorAt(x, z, 1)) return false;
    for (const b of this.breaches) if (Math.hypot(x - b.x, z - b.z) < b.r) { b.r = Math.max(b.r, r); b.hole.scale.setScalar(b.r); b.rim.scale.setScalar(b.r); return true; }
    const hole = new THREE.Mesh(this.holeGeo, this.holeMat); hole.rotation.x = -Math.PI / 2; hole.position.set(x, 0.035, z); hole.scale.setScalar(r);
    const rim = new THREE.Mesh(this.rimGeo, this.rimMat); rim.rotation.x = -Math.PI / 2; rim.position.set(x, 0.06, z); rim.scale.setScalar(r); rim.scale.z = 0.4;
    this.g.scene.add(hole, rim);
    this.breaches.push({ x, z, r, hole, rim });
    if (this.breaches.length > 24) { const o = this.breaches.shift(); this.g.scene.remove(o.hole, o.rim); }
    return true;
  }
  clear() { for (const b of this.breaches) this.g.scene.remove(b.hole, b.rim); this.breaches = []; }

  // keep a body that's below the surface inside the tunnels: returns the floor height to stand on
  constrain(p, headroom = 1.9) {
    let c = this.corridorAt(p.x, p.z);
    if (!c) {
      // pushed into the rock: back to the nearest corridor
      let best = null, bd = 1e9;
      for (const k of this.cor) { const cx = Math.max(k.x0 + 0.5, Math.min(k.x1 - 0.5, p.x)), cz = Math.max(k.z0 + 0.5, Math.min(k.z1 - 0.5, p.z)); const d = Math.hypot(cx - p.x, cz - p.z); if (d < bd) { bd = d; best = [cx, cz, k]; } }
      p.x = best[0]; p.z = best[1]; c = best[2];
    }
    const fl = this.floorAt(p.x, p.z);
    const ceil = c.subway && Math.abs(p.x) > RAMP_END ? Infinity : CEIL;
    if (!this.openAt(p.x, p.z) && p.y + headroom > ceil) p.y = ceil - headroom;
    return fl;
  }
  update(playerPos, below) {
    // three warm work-lights hop along the tunnel with you
    this.lamps.forEach((l, i) => {
      if (!below) { l.intensity = 0; return; }
      const c = this.corridorAt(playerPos.x, playerPos.z);
      const alongX = c ? (c.x1 - c.x0) > (c.z1 - c.z0) : true;
      const off = (i - 1) * 14;
      l.position.set(playerPos.x + (alongX ? off : 0), CEIL - 0.6, playerPos.z + (alongX ? 0 : off));
      l.intensity = 30;
    });
  }
}
