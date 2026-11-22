// Pigeons: small flocks peck about in parks and squares, and burst into the air when something big
// comes near or explodes. They circle for a while, then glide back down.
import * as THREE from 'three';
import { lathe } from './geom.js?v=1795378812';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _v = new THREE.Vector3(), _p = new THREE.Vector3();

export class Birds {
  constructor(scene, homes, perFlock = 9) {
    const n = homes.length * perFlock;
    const body = lathe([[0, 0.13], [0.04, 0.11], [0.06, 0.03], [0.055, -0.05], [0.03, -0.12], [0, -0.14]], 10); body.rotateX(Math.PI / 2);
    const wing = new THREE.BoxGeometry(0.22, 0.01, 0.1); wing.translate(0.11, 0, 0);
    const grey = new THREE.MeshStandardMaterial({ color: 0x7c8088, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.8 });
    this.body = new THREE.InstancedMesh(body, grey, n); this.wl = new THREE.InstancedMesh(wing, dark, n); this.wr = new THREE.InstancedMesh(wing, dark, n);
    for (const m of [this.body, this.wl, this.wr]) { m.frustumCulled = false; m.castShadow = true; scene.add(m); }
    this.birds = [];
    homes.forEach(([hx, hz], f) => {
      for (let k = 0; k < perFlock; k++) {
        const p = new THREE.Vector3(hx + (Math.random() - 0.5) * 4, 0.2, hz + (Math.random() - 0.5) * 4);
        this.birds.push({ i: this.birds.length, flock: f, home: new THREE.Vector2(hx, hz), p, v: new THREE.Vector3(), yaw: Math.random() * 6.28, mode: 'ground', t: Math.random() * 3, flap: Math.random() * 6, air: 0, peck: 0 });
      }
    });
  }

  // Startle every bird within `radius` of a point.
  scare(center, radius) {
    for (const b of this.birds) {
      if (b.mode === 'fly' || b.p.distanceToSquared(center) > radius * radius) continue;
      b.mode = 'fly'; b.air = 6 + Math.random() * 6;
      _v.subVectors(b.p, center).setY(0).normalize();
      b.v.set(_v.x * 6 + (Math.random() - 0.5) * 3, 7 + Math.random() * 4, _v.z * 6 + (Math.random() - 0.5) * 3);
    }
  }

  update(dt, threat, threatSpeed) {
    for (const b of this.birds) {
      if (b.mode === 'ground') {
        // spooked by anything big coming close, or by a fast flyer overhead
        const d2 = b.p.distanceToSquared(threat);
        if (d2 < 49 || (threatSpeed > 15 && d2 < 400)) { this.scare(b.p, 3); continue; }
        b.t -= dt;
        if (b.t <= 0) { b.t = 0.6 + Math.random() * 2; b.yaw += (Math.random() - 0.5) * 2; b.peck = Math.random() < 0.5 ? 0.5 : 0; }
        if (b.t > 0.3 && Math.random() < dt * 2) { b.p.x += Math.sin(b.yaw) * 0.08; b.p.z += Math.cos(b.yaw) * 0.08; }
        b.peck = Math.max(0, b.peck - dt);
        b.p.y = 0.2;
      } else {
        b.air -= dt;
        b.flap += dt * (b.v.y > 0 ? 28 : 16);
        // circle the home spot, rising, then drift back down when calm
        _v.set(b.home.x - b.p.x, 0, b.home.y - b.p.z);
        const d = _v.length() + 1e-3; _v.divideScalar(d);
        const want = b.air > 0 ? 18 : 0.2;
        b.v.x += (_v.x * 2 - _v.z * 4) * dt + (Math.random() - 0.5) * dt * 4;
        b.v.z += (_v.z * 2 + _v.x * 4) * dt + (Math.random() - 0.5) * dt * 4;
        b.v.y += (want - b.p.y) * 0.6 * dt - b.v.y * 0.8 * dt;
        const sp = Math.hypot(b.v.x, b.v.z), max = b.air > 0 ? 11 : 6;
        if (sp > max) { b.v.x *= max / sp; b.v.z *= max / sp; }
        b.p.addScaledVector(b.v, dt);
        b.yaw = Math.atan2(b.v.x, b.v.z);
        if (b.air <= 0 && b.p.y < 0.3 && d < 8) { b.mode = 'ground'; b.p.y = 0.2; b.v.set(0, 0, 0); }
      }
      // draw
      const pitch = b.mode === 'fly' ? -Math.atan2(b.v.y, Math.hypot(b.v.x, b.v.z) + 0.1) * 0.6 : b.peck > 0 ? 0.6 : 0;
      _q.setFromEuler(_e.set(pitch, b.yaw, 0, 'YXZ'));
      _m.compose(b.p, _q, _s); this.body.setMatrixAt(b.i, _m);
      const flap = b.mode === 'fly' ? Math.sin(b.flap) * 0.9 : 0.1;
      for (const [mesh, side] of [[this.wl, -1], [this.wr, 1]]) {
        _q.setFromEuler(_e.set(pitch, b.yaw, side * flap, 'YXZ'));
        _p.set(side * 0.03, 0.03, 0).applyQuaternion(_q).add(b.p);
        const qq = _q.clone(); if (side < 0) qq.multiply(new THREE.Quaternion().setFromAxisAngle(_v.set(0, 1, 0), Math.PI));
        _m.compose(_p, qq, _s); mesh.setMatrixAt(b.i, _m);
      }
    }
    for (const m of [this.body, this.wl, this.wr]) m.instanceMatrix.needsUpdate = true;
  }
}
