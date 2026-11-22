// Things going on around you: news helicopters circling the action, police cars that respond when the
// destruction gets serious, a train on a line through the countryside, and container ships at sea.
// All of them can be wrecked: hit them hard and they become tumbling wrecks that crash and burn.
import * as THREE from 'three';
import { groundH, terrainH, SEA_LEVEL } from './world.js?v=1795378381';

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const ROADS = [-176, -132, -88, -44, 0, 44, 88, 132, 176];
const inTown = (x, z) => Math.abs(x) < 182 && Math.abs(z) < 182;
const std = (c, r = 0.5, m = 0.3, e = null) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...(e ? { emissive: e, emissiveIntensity: 3 } : {}) });
function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent?.add(m); return m; }

// ---------------------------------------------------------------- models
function heliModel() {
  const g = new THREE.Group();
  const body = std(0x1f3550, 0.35, 0.5), dark = std(0x1a1c20, 0.6, 0.4), glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1a22, roughness: 0.05, clearcoat: 1, metalness: 0.2 });
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), body); hull.scale.set(1, 0.9, 1.9); hull.castShadow = true; g.add(hull);
  const cab = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass); cab.scale.set(1, 0.9, 1.3); cab.position.set(0, 0.2, 1.4); cab.rotation.x = 0.5; g.add(cab);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 6, 12), body); boom.rotation.x = Math.PI / 2; boom.position.set(0, 0.3, -4.5); boom.castShadow = true; g.add(boom);
  box(0.15, 1.6, 0.9, body, 0, 1, -7.3, g);
  for (const sx of [-1, 1]) { box(0.12, 0.12, 4, dark, sx * 1.1, -1.6, 0.2, g); box(0.1, 0.6, 0.1, dark, sx * 1.0, -1.3, 1.1, g); box(0.1, 0.6, 0.1, dark, sx * 1.0, -1.3, -0.8, g); }
  const rotor = new THREE.Group(); rotor.position.set(0, 1.55, 0); g.add(rotor);
  box(11, 0.06, 0.35, dark, 0, 0, 0, rotor); box(0.35, 0.06, 11, dark, 0, 0, 0, rotor); box(0.4, 0.4, 0.4, dark, 0, -0.2, 0, rotor);
  const tail = new THREE.Group(); tail.position.set(0.25, 1.1, -7.3); g.add(tail);
  box(0.05, 2, 0.2, dark, 0, 0, 0, tail);
  // night searchlight: a soft additive cone under the nose
  const beam = new THREE.Mesh(new THREE.ConeGeometry(9, 90, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.9, 0.8), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.position.set(0, -45, 1.5); g.add(beam);
  const blink = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.4, 0.3) })); blink.position.set(0, 1.8, -7.3); g.add(blink);
  return { g, rotor, tail, beam, blink };
}
function policeModel() {
  const g = new THREE.Group();
  const white = std(0xe8e8ea, 0.35, 0.4), black = std(0x15161a, 0.35, 0.5), glass = std(0x101418, 0.1, 0.6), tyre = std(0x111111, 0.8, 0);
  box(2.0, 0.7, 4.6, black, 0, 0.75, 0, g); box(2.02, 0.32, 1.8, white, 0, 0.82, 0.1, g);
  box(1.75, 0.55, 2.3, glass, 0, 1.35, -0.2, g); box(1.8, 0.08, 2.0, white, 0, 1.65, -0.2, g);
  const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.2, 0.2) }), blue = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.6, 7) });
  const lr = box(0.6, 0.16, 0.3, red, -0.35, 1.76, -0.2, g), lb = box(0.6, 0.16, 0.3, blue, 0.35, 1.76, -0.2, g);
  for (const [x, z] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14), tyre); w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); g.add(w); }
  return { g, lr, lb, red, blue };
}
function trainCar(loco, color) {
  const g = new THREE.Group();
  const body = std(color, 0.45, 0.5), dark = std(0x202226, 0.6, 0.5), win = std(0x0b1016, 0.15, 0.4, loco ? null : 0x332211);
  box(3.0, 3.2, 17, body, 0, 2.3, 0, g); box(2.6, 0.6, 15, dark, 0, 0.4, 0, g);
  for (const sx of [-1, 1]) box(0.05, 0.9, 13, win, sx * 1.51, 2.8, 0, g);
  if (loco) { const nose = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3, 16, 1, false, 0, Math.PI), body); nose.rotation.x = Math.PI / 2; nose.rotation.z = Math.PI / 2; nose.position.set(0, 2.3, 9); nose.scale.set(1, 1, 1.07); g.add(nose); box(2.2, 0.8, 0.1, win, 0, 3.0, 10.3, g); }
  return g;
}
function shipModel(seed) {
  const g = new THREE.Group();
  const hullM = std(seed % 2 ? 0x7a1f1a : 0x22344a, 0.6, 0.3), deck = std(0x3a3d40, 0.8, 0.2), white = std(0xe8e6e0, 0.5, 0.2);
  const shape = new THREE.Shape(); shape.moveTo(-9, -60); shape.lineTo(9, -60); shape.lineTo(9, 40); shape.quadraticCurveTo(9, 56, 0, 66); shape.quadraticCurveTo(-9, 56, -9, 40); shape.closePath();
  const hg = new THREE.ExtrudeGeometry(shape, { depth: 12, bevelEnabled: false }); hg.rotateX(Math.PI / 2); hg.translate(0, 4, 0);
  const hull = new THREE.Mesh(hg, hullM); hull.castShadow = true; g.add(hull);
  box(17.6, 0.4, 118, deck, 0, 4.2, 0, g);
  box(16, 12, 10, white, 0, 10, -48, g); box(8, 5, 6, white, 0, 18, -48, g); box(2, 8, 2, std(0x222222), 0, 24, -50, g);
  const cols = [0xb03a2e, 0x2e6eb0, 0xd9a520, 0x2f8a4a, 0x8a8f96, 0xd26a1e];
  let s = seed * 97 + 1; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let z = -36; z < 50; z += 6.4) for (let x = -6; x <= 6; x += 3) { const h = 1 + Math.floor(r() * 4); for (let y = 0; y < h; y++) box(2.6, 2.6, 6.1, std(cols[Math.floor(r() * cols.length)], 0.6, 0.4), x, 5.7 + y * 2.65, z, g); }
  return g;
}

export class Life {
  constructor(g) {
    this.g = g; // { scene, fx, sfx, fire, smash, blastAll, cars, dummy, vox, score(n, label), player, knockPlayer, hurtPlayer }
    this.wrecks = [];
    this.heat = 0;
    // helicopters
    this.helis = [0, 1].map((i) => { const m = heliModel(); g.scene.add(m.g); return { ...m, a: i * Math.PI, r: 70 + i * 25, alt: 85 + i * 25, speed: 0.22 - i * 0.05, alive: true, respawn: 0, p: new THREE.Vector3(0, 100, 0), center: new THREE.Vector3() }; });
    // police
    this.police = []; this.polT = 0;
    // train
    this._buildRail();
    // ships
    this.ships = [0, 1, 2].map((i) => { const m = shipModel(i + 1); g.scene.add(m); return { g: m, cx: 8200 + i * 900, cz: -3000 + i * 3500, r: 1800 + i * 500, a: i * 2, sp: 6 / (1800 + i * 500), alive: true, sink: 0, respawn: 0, p: new THREE.Vector3() }; });
    this.night = 0;
  }

  // ---------------------------------------------------------------- rail line through the south
  _buildRail() {
    const g = this.g, Z = 1150, X0 = -9000, X1 = 3500, D = 40;
    const n = Math.floor((X1 - X0) / D) + 1, raw = [];
    for (let i = 0; i < n; i++) raw.push(Math.max(SEA_LEVEL + 2, groundH(X0 + i * D, Z)));
    // a smooth profile: averaged, so it runs on embankments, bridges and through tunnels
    const prof = raw.map((_, i) => { let s = 0, c = 0; for (let k = -12; k <= 12; k++) { const j = i + k; if (j >= 0 && j < n) { s += raw[j]; c++; } } return s / c + 1.2; });
    this.rail = { Z, X0, X1, D, prof };
    // sleepers + rails (instanced), and pylons wherever the track is in the air
    const seg = new THREE.BoxGeometry(D, 0.25, 4.2), rail = new THREE.BoxGeometry(D, 0.25, 0.15);
    const sm = new THREE.InstancedMesh(seg, std(0x4a3a2e, 0.9, 0), n), rm = new THREE.InstancedMesh(rail, std(0x8a8d90, 0.3, 0.9), n * 2);
    const pyl = [], m = new THREE.Matrix4();
    for (let i = 0; i < n - 1; i++) {
      const x = X0 + (i + 0.5) * D, y = (prof[i] + prof[i + 1]) / 2, pitch = Math.atan2(prof[i + 1] - prof[i], D);
      _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), pitch);
      m.compose(_v.set(x, y - 0.3, Z), _q, _a.set(1, 1, 1)); sm.setMatrixAt(i, m);
      for (const s of [-1, 1]) { m.compose(_v.set(x, y - 0.1, Z + s * 0.75), _q, _a.set(1, 1, 1)); rm.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), m); }
      const gh = terrainH(x, Z);
      if (y - gh > 4 && i % 2 === 0) pyl.push([x, gh, y]);
    }
    const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 1, 3.4), std(0x8c8880, 0.85, 0.05), Math.max(1, pyl.length));
    pyl.forEach(([x, gh, y], i) => { m.compose(_v.set(x, (gh + y) / 2 - 0.5, Z), _q.identity(), _a.set(1, y - gh, 1)); pm.setMatrixAt(i, m); });
    pm.count = pyl.length;
    for (const im of [sm, rm, pm]) { im.receiveShadow = true; g.scene.add(im); }
    this.trainCars = [];
    this._newTrain();
  }
  _newTrain() {
    for (const c of this.trainCars) if (!c.wrecked) this.g.scene.remove(c.g);
    const cols = [0xc23b22, 0x2a5b8c, 0x2a5b8c, 0xd0a030, 0x2a5b8c, 0x2a5b8c, 0xd0a030];
    this.trainCars = cols.map((c, i) => { const g = trainCar(i === 0, c); this.g.scene.add(g); return { g, off: -i * 18.5, wrecked: false }; });
    this.trainS = this.rail.X0 + 200; this.trainDir = 1; this.trainAlive = true; this.trainRespawn = 0;
  }
  _railAt(x) {
    const { X0, D, prof } = this.rail, f = Math.max(0, Math.min(prof.length - 1.001, (x - X0) / D)), i = Math.floor(f), u = f - i;
    return { y: prof[i] * (1 - u) + prof[i + 1] * u, slope: (prof[i + 1] - prof[i]) / D };
  }

  // ---------------------------------------------------------------- wrecks
  _wreck(obj, p, v, w, { explode = true, score = 0, label = '', sink = false } = {}) {
    this.wrecks.push({ obj, p: p.clone(), v: v.clone(), w: w.clone(), t: 0, explode, landed: false, sink });
    if (score) this.g.score(score, label);
  }
  _updateWrecks(dt) {
    const g = this.g;
    for (const W of this.wrecks) {
      W.t += dt;
      if (!W.landed || W.v.lengthSq() > 1) {
        W.v.y -= 20 * dt; W.p.addScaledVector(W.v, dt);
        const wl = W.w.length(); if (wl > 1e-4) { _q.setFromAxisAngle(_a.copy(W.w).divideScalar(wl), wl * dt); W.obj.quaternion.premultiply(_q); }
        if (!W.landed && Math.random() < 0.6) g.fx.dust.emit(W.p, _v.set(0, 2, 0), new THREE.Color(0.12, 0.11, 0.1), 2.5, 2.5, 2, 0.5);
        const gy = Math.max(groundH(W.p.x, W.p.z), SEA_LEVEL - (W.sink ? 40 : 0));
        const hitVox = inTown(W.p.x, W.p.z) && g.vox.solidAt(W.p.x, W.p.y, W.p.z);
        if (W.p.y < gy + 0.8 || hitVox) {
          if (!W.landed) {
            W.landed = true;
            if (W.explode) g.fire.explode(W.p.clone()); else { g.smash(W.p.clone(), 1.5, { outward: 6, up: 3 }); g.sfx.boom(0.8); }
            if (gy < SEA_LEVEL + 0.5 && !hitVox) for (let i = 0; i < 20; i++) g.fx.dust.emit(W.p, _v.set((Math.random() - 0.5) * 8, 10 + Math.random() * 12, (Math.random() - 0.5) * 8), new THREE.Color(0.85, 0.9, 0.95), 2.5, 1.6, 2, 0.5);
          }
          if (hitVox) { W.v.multiplyScalar(-0.2); } else { W.p.y = gy + 0.8; W.v.y = Math.abs(W.v.y) * 0.2; W.v.x *= 0.6; W.v.z *= 0.6; }
          W.w.multiplyScalar(0.5);
          if (W.p.y <= SEA_LEVEL + 1 && gy <= SEA_LEVEL) { W.sinking = true; }
        }
      } else if (W.sinking) W.p.y -= dt * 1.5;
      W.obj.position.copy(W.p);
      if (W.t > 25 || W.p.y < SEA_LEVEL - 30) W.dead = true;
    }
    for (const W of this.wrecks) if (W.dead) this.g.scene.remove(W.obj);
    this.wrecks = this.wrecks.filter((W) => !W.dead);
  }

  // Something blew up / struck at `center`: wreck whatever is caught in it.
  blast(center, radius, strength, dir = null) {
    if (strength < 12) return;
    const push = (p) => _v.subVectors(p, center).setLength(strength * 0.8).add(_a.set(0, strength * 0.5, 0)).addScaledVector(dir || UP, dir ? strength * 0.4 : 0);
    for (const H of this.helis) if (H.alive && H.p.distanceTo(center) < radius + 6) this._downHeli(H, push(H.p));
    for (const P of this.police) if (!P.wrecked && P.p.distanceTo(center) < radius + 2.5) this._wreckPolice(P, push(P.p));
    if (this.trainAlive) this.trainCars.forEach((c, i) => { if (!c.wrecked && c.g.position.distanceTo(center) < radius + 9) this._derail(i, push(c.g.position)); });
    for (const S of this.ships) if (S.alive && S.p.distanceTo(center) < radius + 60 && strength > 25) this._sinkShip(S);
  }
  // the player passing through at speed (vel is their velocity)
  bump(p, vel) {
    const sp = vel.length(); if (sp < 25) return;
    const kick = () => vel.clone().multiplyScalar(0.7).add(_a.set(0, 8, 0));
    for (const H of this.helis) if (H.alive && H.p.distanceTo(p) < 6) this._downHeli(H, kick());
    for (const P of this.police) if (!P.wrecked && P.p.distanceTo(p) < 3.2) this._wreckPolice(P, kick());
    if (this.trainAlive) this.trainCars.forEach((c, i) => { if (!c.wrecked && Math.abs(c.g.position.x - p.x) < 10 && Math.abs(c.g.position.z - p.z) < 3 && Math.abs(c.g.position.y + 2 - p.y) < 3.5) this._derail(i, kick()); });
    for (const S of this.ships) if (S.alive && sp > 120 && Math.abs(S.p.x - p.x) < 70 && Math.abs(S.p.z - p.z) < 70 && p.y < S.p.y + 18) { const local = _v.subVectors(p, S.p).applyQuaternion(_q.copy(S.g.quaternion).invert()); if (Math.abs(local.x) < 10 && Math.abs(local.z) < 64) this._sinkShip(S); }
  }

  _downHeli(H, v) {
    H.alive = false; H.respawn = 30;
    this.g.scene.remove(H.g);
    const g = H.g; g.position.copy(H.p); this.g.scene.add(g);
    H.beam.material.opacity = 0;
    this._wreck(g, H.p, v.clone().multiplyScalar(0.6), new THREE.Vector3((Math.random() - 0.5) * 3, 6 + Math.random() * 4, (Math.random() - 0.5) * 3), { score: 1500, label: 'CHOPPER DOWN' });
    this.g.fx.wave(H.p, 8, 0.35, new THREE.Color(3, 2, 1)); this.g.sfx.boom(1); this.g.sfx.glass();
    this.g.dummy.say?.(['That was a NEWS crew!', 'Film THAT!'], true);
  }
  _wreckPolice(P, v) {
    P.wrecked = true;
    this._wreck(P.g, P.p, v, new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8), { explode: Math.random() < 0.6, score: 500, label: 'COP CAR TRASHED' });
    this.g.sfx.crunch?.(); this.heat += 80;
  }
  _derail(i, v) {
    if (!this.trainAlive) return;
    this.trainAlive = false; this.trainRespawn = 45;
    const dirV = _a.set(this.trainDir * 45, 0, 0);
    this.trainCars.forEach((c, k) => {
      c.wrecked = true;
      const near = Math.abs(k - i);
      const vel = dirV.clone().multiplyScalar(0.9 - near * 0.05).add(_v.set((Math.random() - 0.5) * 10, 4 + Math.random() * 6, (Math.random() - 0.5) * 18));
      if (near < 2) vel.addScaledVector(v, 0.6);
      this._wreck(c.g, c.g.position, vel, new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 2.5), { explode: k === 0 || near < 1, score: k === 0 ? 3000 : 0, label: 'TRAIN DERAILED' });
    });
    this.g.sfx.boom(1.5); this.g.sfx.crunch?.();
  }
  _sinkShip(S) {
    S.alive = false; S.sink = 0; S.respawn = 70;
    this.g.score(4000, 'SHIP SUNK');
    for (let i = 0; i < 3; i++) setTimeout(() => this.g.fire.explode(S.p.clone().add(_v.set((Math.random() - 0.5) * 14, 8, (Math.random() - 0.5) * 80).applyQuaternion(S.g.quaternion))), i * 500);
  }

  // ---------------------------------------------------------------- update
  update(dt, { playerPos, playerVel, night }) {
    const g = this.g;
    this.night = night;
    this.heat = Math.max(0, this.heat - dt * 6);
    // helicopters circle the player when there's something to film (in town), else the town centre
    let nearHeli = 1e9;
    for (const H of this.helis) {
      if (!H.alive) { H.respawn -= dt; if (H.respawn <= 0) { H.alive = true; H.a = Math.random() * 6.28; H.g.quaternion.identity(); g.scene.add(H.g); } continue; }
      const want = inTown(playerPos.x, playerPos.z) || playerPos.distanceTo(H.center) < 400 ? playerPos : _a.set(0, 0, 0);
      H.center.lerp(_v.set(want.x, 0, want.z), Math.min(1, dt * 0.25));
      H.a += H.speed * dt;
      const x = H.center.x + Math.cos(H.a) * H.r, z = H.center.z + Math.sin(H.a) * H.r;
      const prev = H.p.clone();
      H.p.set(x, Math.max(H.alt, groundH(x, z) + 60), z);
      H.g.position.copy(H.p);
      const vel = _v.subVectors(H.p, prev);
      if (vel.lengthSq() > 1e-6) { H.g.rotation.set(0, Math.atan2(vel.x, vel.z), 0); H.g.rotateX(0.12); H.g.rotateZ(-0.25); }
      H.rotor.rotation.y += dt * 40; H.tail.rotation.x += dt * 60;
      H.blink.visible = (performance.now() % 1000) < 120;
      H.beam.material.opacity = 0.05 * night;
      nearHeli = Math.min(nearHeli, H.p.distanceTo(playerPos));
    }
    g.sfx.heli?.(nearHeli < 400 ? nearHeli : 0);
    // police respond to serious destruction in town
    this.polT -= dt;
    const want = Math.min(8, Math.floor(this.heat / 250));
    const live = this.police.filter((P) => !P.wrecked).length;
    if (want > live && this.polT <= 0 && this.police.length < 14) { this.polT = 2.5; this._spawnPolice(playerPos); }
    let nearPol = 1e9;
    for (const P of this.police) {
      if (P.wrecked) continue;
      P.flash += dt;
      const ph = Math.floor(P.flash * 6) % 2;
      P.lr.material = ph ? P.red : P.blue; P.lb.material = ph ? P.blue : P.red;
      // drive the route; the last waypoint follows the player (in town) and they stop short of you
      const tgt = P.path[P.wi];
      if (P.wi === P.path.length - 1 && inTown(playerPos.x, playerPos.z)) tgt.set(...this._nearRoad(playerPos));
      const d = _v.subVectors(tgt, P.p).setY(0), dl = d.length();
      const stopShort = P.wi === P.path.length - 1 ? 22 : 1;
      if (dl > stopShort) {
        const sp = Math.min(22, dl * 1.5);
        P.p.addScaledVector(d.divideScalar(dl), sp * dt);
        P.yaw += Math.atan2(Math.sin(Math.atan2(d.x, d.z) - P.yaw), Math.cos(Math.atan2(d.x, d.z) - P.yaw)) * Math.min(1, dt * 6);
        // shove parked cars aside
        const c = g.cars.carAt(_a.copy(P.p).setY(0.8), 0.8); if (c) g.cars.hit(c, P.p, _v.set(Math.sin(P.yaw) * 12, 3, Math.cos(P.yaw) * 12));
      } else if (P.wi < P.path.length - 1) P.wi++;
      P.p.y = 0.05;
      P.g.position.copy(P.p); P.g.rotation.set(0, P.yaw, 0);
      nearPol = Math.min(nearPol, P.p.distanceTo(playerPos));
    }
    this.police = this.police.filter((P) => !(P.wrecked && !this.wrecks.some((W) => W.obj === P.g)));
    g.sfx.policeSiren?.(nearPol < 300 ? nearPol : 0);
    // train
    if (this.trainAlive) {
      this.trainS += this.trainDir * 45 * dt;
      if (this.trainS > this.rail.X1 - 200) this.trainDir = -1; else if (this.trainS < this.rail.X0 + 200) this.trainDir = 1;
      for (const c of this.trainCars) {
        const xx = this.trainDir > 0 ? this.trainS + c.off : this.trainS - c.off;
        const r = this._railAt(xx);
        c.g.position.set(xx, r.y, this.rail.Z);
        c.g.rotation.set(0, this.trainDir > 0 ? Math.PI / 2 : -Math.PI / 2, 0); c.g.rotateX(-Math.atan(r.slope) * this.trainDir);
      }
    } else { this.trainRespawn -= dt; if (this.trainRespawn <= 0) this._newTrain(); }
    // ships
    for (const S of this.ships) {
      if (S.alive) {
        S.a += S.sp * dt;
        S.p.set(S.cx + Math.cos(S.a) * S.r, SEA_LEVEL - 4, S.cz + Math.sin(S.a) * S.r * 0.6);
        S.g.position.copy(S.p); S.g.rotation.set(0, Math.atan2(-Math.sin(S.a) * S.r, Math.cos(S.a) * S.r * 0.6), 0);
        S.g.rotation.z = Math.sin(performance.now() / 2300 + S.a * 10) * 0.015;
      } else if (S.sink >= 0) {
        S.sink += dt;
        S.g.position.y = S.p.y - S.sink * S.sink * 0.15; S.g.rotation.z = Math.min(0.5, S.sink * 0.04); S.g.rotation.x = Math.min(0.35, S.sink * 0.03);
        if (Math.random() < dt * 2) g.fx.dust.emit(S.p.clone().add(_v.set((Math.random() - 0.5) * 10, 10, (Math.random() - 0.5) * 60)), _v.set(0, 4, 0), new THREE.Color(0.15, 0.14, 0.13), 12, 6, 2.5, 0.5);
        if (S.sink > 16) { S.sink = -1; S.g.visible = false; }
      } else { S.respawn -= dt; if (S.respawn <= 0) { S.alive = true; S.g.visible = true; S.a += 2; } }
    }
    this._updateWrecks(dt);
  }

  // nearest road point (x or z on a road line) to p, for the police to drive to
  _nearRoad(p) {
    const snap = (v) => ROADS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    const rx = snap(p.x), rz = snap(p.z);
    return Math.abs(rx - p.x) < Math.abs(rz - p.z) ? [rx + 2.5, 0.05, Math.max(-178, Math.min(178, p.z))] : [Math.max(-178, Math.min(178, p.x)), 0.05, rz + 2.5];
  }
  _spawnPolice(playerPos) {
    const m = policeModel();
    // come in from the town edge along a road, turn at the player's column, then head for them
    const side = Math.floor(Math.random() * 4), road = ROADS[1 + Math.floor(Math.random() * 7)];
    const start = side === 0 ? [-240, road + 2.5] : side === 1 ? [240, road - 2.5] : side === 2 ? [road - 2.5, -240] : [road + 2.5, 240];
    const p = new THREE.Vector3(start[0], 0.05, start[1]);
    const tgt = this._nearRoad(playerPos);
    const col = ROADS.reduce((a, b) => (Math.abs(b - playerPos.x) < Math.abs(a - playerPos.x) ? b : a)) + 2.5;
    const rowZ = ROADS.reduce((a, b) => (Math.abs(b - playerPos.z) < Math.abs(a - playerPos.z) ? b : a)) + 2.5;
    const path = side < 2 ? [new THREE.Vector3(col, 0.05, start[1]), new THREE.Vector3(...tgt)] : [new THREE.Vector3(start[0], 0.05, rowZ), new THREE.Vector3(...tgt)];
    this.g.scene.add(m.g);
    this.police.push({ ...m, p, path, wi: 0, yaw: side === 0 ? Math.PI / 2 : side === 1 ? -Math.PI / 2 : side === 2 ? 0 : Math.PI, flash: Math.random(), wrecked: false });
  }
}
