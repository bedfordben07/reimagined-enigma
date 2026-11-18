// Extra powers: Singularity (Z), Telekinesis (hold B) and Thunderclap (N).
// Everything goes through the game context `g` so the powers act on the same rubble, cars, dummy and
// voxels as everything else, and respect frozen time.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class Powers {
  constructor(g) {
    this.g = g;
    this.cool = { hole: 0, clap: 0 };
    this.hole = null;     // active singularity
    this.tk = null;       // active telekinesis grip
    this.clapT = 0;       // clap animation timer (1 -> 0)
    this.clapFired = false;
    this._buildHoleFx();
  }

  // ---------------------------------------------------------------- singularity
  _buildHoleFx() {
    const g = this.g;
    this.holeGroup = new THREE.Group(); this.holeGroup.visible = false; g.scene.add(this.holeGroup);
    // event horizon: unlit black core (light can't leave it)
    this.core = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    this.holeGroup.add(this.core);
    // accretion disc: a swirling hot ring, brightest at the inner edge
    this.discMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uK: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uK; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec2 d = vUv - 0.5; float r = length(d) * 2.0; float a = atan(d.y, d.x);
          if (r < 0.32 || r > 1.0) discard;
          float swirl = n(vec2(a * 3.0 + uTime * 4.0 - r * 8.0, r * 6.0)) * 0.6 + n(vec2(a * 7.0 - uTime * 6.0, r * 14.0)) * 0.4;
          float inner = smoothstep(1.0, 0.36, r) * smoothstep(0.3, 0.38, r);
          vec3 hot = mix(vec3(0.9, 0.25, 1.4), vec3(3.2, 1.6, 0.6), inner);
          gl_FragColor = vec4(hot * (0.35 + swirl) * inner * uK, inner * uK);
        }`,
    });
    this.disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.discMat);
    this.disc.rotation.x = -Math.PI / 2 + 0.35;
    this.holeGroup.add(this.disc);
    // photon ring: thin bright halo that always faces the camera
    this.halo = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.12, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.8, 3.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.holeGroup.add(this.halo);
    this.holeLight = new THREE.PointLight(0xb070ff, 0, 30, 1.6); g.scene.add(this.holeLight);
  }

  castHole() {
    const g = this.g;
    if (this.hole || this.cool.hole > 0) return;
    const target = g.aim.point.clone();
    const from = g.chest();
    if (target.distanceTo(from) > 90) target.copy(from).addScaledVector(_v.subVectors(target, from).normalize(), 90);
    target.addScaledVector(_v.subVectors(from, target).normalize(), 1.5); // sit just in front of the surface
    this.hole = { p: from.clone(), to: target, t: 0, travel: Math.min(0.5, from.distanceTo(target) / 80), life: 4.2, rip: 0, phase: 'fly', size: 0.2 };
    this.cool.hole = 9;
    g.sfx.whoosh();
    g.dummy.say(['Is that... a black hole?!', 'Oh no. Oh no no no.', 'That is NOT safety-rated!'], true);
    g.brain?.event('The player fired a miniature black hole that is sucking in everything nearby, including you.');
  }

  _updateHole(dt, frozen) {
    const g = this.g, H = this.hole;
    const p = H.p;
    if (H.phase === 'fly') {
      H.t += dt;
      const u = Math.min(1, H.t / H.travel);
      p.lerp(H.to, u);
      H.size = 0.25;
      if (u >= 1) { H.phase = 'pull'; H.t = 0; g.shake(0.3); g.sfx.boom(0.6); }
    } else if (H.phase === 'pull') {
      if (!frozen) H.t += dt;
      const grow = Math.min(1, H.t / 0.5);
      H.size = 0.25 + 0.85 * grow + Math.sin(H.t * 30) * 0.02;
      if (!frozen) this._pull(dt, p, grow);
      if (H.t >= H.life) { H.phase = 'collapse'; H.t = 0; }
    } else if (H.phase === 'collapse') {
      if (!frozen) H.t += dt;
      H.size = Math.max(0.05, 1.1 * (1 - H.t / 0.25));
      if (H.t >= 0.25) { this._detonate(p); this.hole = null; this.holeGroup.visible = false; this.holeLight.intensity = 0; g.lens(null); return; }
    }
    // visuals
    this.holeGroup.visible = true;
    this.holeGroup.position.copy(p);
    this.core.scale.setScalar(H.size);
    this.disc.scale.setScalar(H.size * 6.5);
    this.discMat.uniforms.uTime.value += frozen ? 0 : dt;
    this.discMat.uniforms.uK.value = Math.min(1, H.size);
    this.halo.scale.setScalar(H.size * 1.05);
    this.halo.quaternion.copy(g.camera.quaternion);
    this.holeLight.position.copy(p); this.holeLight.intensity = 25 * H.size;
    g.lens(p, H.size);
  }

  // Gravity: rubble, cars and the dummy fall in and spiral; buildings get torn apart around it.
  _pull(dt, c, k) {
    const g = this.g;
    const swirlAxis = _b.set(0, 1, 0);
    for (const it of g.debris.items) {
      if (it.tk) continue;
      _v.subVectors(c, it.p); const d = _v.length();
      if (d > 20) continue;
      g.debris.wake(it);
      const f = k * 140 / (d + 2);
      _v.divideScalar(d + 1e-4);
      it.v.addScaledVector(_v, f * dt);
      it.v.addScaledVector(_a.crossVectors(swirlAxis, _v), f * 0.55 * dt); // orbit
      it.v.y += 20 * dt * Math.min(1, 6 / (d + 1)); // cancel gravity near the core
      it.v.multiplyScalar(1 - Math.min(0.9, 2.5 * dt / (d * 0.3 + 0.5)));
    }
    for (const car of g.cars.cars) {
      if (car.held) continue;
      _v.subVectors(c, car.p); const d = _v.length();
      if (d > 22) continue;
      g.cars.wake(car);
      const f = k * 90 / (d + 3);
      _v.divideScalar(d + 1e-4);
      car.v.addScaledVector(_v, f * dt).addScaledVector(_a.crossVectors(swirlAxis, _v), f * 0.4 * dt);
      car.v.y += 20 * dt * Math.min(1, 8 / (d + 1));
      car.v.multiplyScalar(1 - Math.min(0.9, 1.6 * dt / (d * 0.3 + 0.5)));
      car.w.x += (Math.random() - 0.5) * dt * 4; car.w.z += (Math.random() - 0.5) * dt * 4;
    }
    const dc = g.dummy.chest(_a); const dd = dc.distanceTo(c);
    if (dd < 22 && g.dummy.mode !== 'held') {
      const f = k * 70 / (dd + 2);
      _v.subVectors(c, dc).normalize().multiplyScalar(f * dt);
      g.dummy.hit(dc, 3, _v.addScaledVector(_b.crossVectors(swirlAxis, _v).normalize(), f * dt * 0.4), 1);
      if (Math.random() < dt * 0.6) g.dummy.say(['NOT THE VOID!', 'I can see forever!', 'AAAAAAAAAH', 'Spaghettiiii!']);
    }
    // tear blocks out of nearby walls and feed them in
    this.hole.rip -= dt;
    if (this.hole.rip <= 0) {
      this.hole.rip = 0.07;
      for (let i = 0; i < 3; i++) {
        _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(1.5 + Math.random() * 6 * k);
        _v.add(c);
        if (g.vox.solidAt(_v.x, _v.y, _v.z)) g.smash(_v.clone(), 0.7, { vel: _a.subVectors(c, _v).multiplyScalar(2), inherit: 1, outward: 1, up: 0, noDust: true });
      }
      g.smash(c, 1.6 * k, { vel: new THREE.Vector3(), outward: 1, up: 0, noDust: true });
    }
    // infalling sparks
    for (let i = 0; i < 4; i++) {
      _v.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.4, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 4).add(c);
      _a.subVectors(c, _v).normalize();
      const vel = _a.clone().multiplyScalar(8).add(_b.crossVectors(swirlAxis, _a).multiplyScalar(10));
      g.fx.sparks.emit(_v, vel, new THREE.Color(2.4, 1.2, 3.2), 0.6, 0, 0.04);
    }
  }

  _detonate(c) {
    const g = this.g;
    g.smash(c, 3.6, { outward: 14, up: 4, max: 1200 });
    g.blastAll(c, 26, 46, null, 0.5);
    g.dummy.hit(c, 14, g.dummy.chest(_a).sub(c).normalize().multiplyScalar(55).add(new THREE.Vector3(0, 12, 0)), 0.6);
    g.fx.wave(c, 16, 0.6, new THREE.Color(2.0, 1.2, 3.0));
    g.fx.wave(c, 8, 0.35, new THREE.Color(3, 3, 3));
    g.fx.ring(c, 26, 0.8);
    g.fx.punchLight.position.copy(c); g.fx.punchLight.intensity = 160;
    for (let i = 0; i < 80; i++) g.fx.sparks.emit(c, _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(20 + Math.random() * 30), new THREE.Color(3, 2, 4), 0.5 + Math.random() * 0.5, 0.4, 0.03);
    g.shake(0.7); g.hitstop(0.08); g.sfx.boom(1.5);
    g.brain?.event('The black hole collapsed and exploded.');
  }

  // ---------------------------------------------------------------- telekinesis
  grab() {
    const g = this.g;
    if (this.tk) return;
    const c = g.chest(), f = g.forward();
    const inFront = (p, r) => { _v.subVectors(p, c); const d = _v.length(); return d < r && _v.dot(f) > -0.2 * d; };
    const items = g.debris.items.filter((it) => !it.dead && inFront(it.p, 18)).sort((a, b) => a.p.distanceToSquared(c) - b.p.distanceToSquared(c)).slice(0, 36);
    const carList = g.cars.cars.filter((car) => !car.held && inFront(car.p, 18)).sort((a, b) => a.p.distanceToSquared(c) - b.p.distanceToSquared(c)).slice(0, 3);
    const dummy = g.dummy.mode !== 'held' && inFront(g.dummy.chest(_a), 18);
    if (!items.length && !carList.length && !dummy) return;
    items.forEach((it, i) => { it.tk = true; it.asleep = false; it.tkSlot = i; it.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2); });
    carList.forEach((car) => g.cars.hold(car, 'tk'));
    if (dummy) { g.dummy.grab(g.dummy.chest(_a)); g.dummy.say(["I'm floating!", 'Put me DOWN!', 'Wheee... wait.'], true); }
    this.tk = { items, cars: carList, dummy, t: 0 };
    g.sfx.freeze(false);
    g.brain?.event('The player lifted you (and a lot of rubble) with telekinesis.');
  }

  _updateTK(dt) {
    const g = this.g, T = this.tk;
    T.t += dt;
    const c = g.chest(), f = g.forward();
    const right = _b.set(-f.z, 0, f.x).normalize();
    // everything orbits in loose rings around the player, lifting into place over the first half second
    const lift = Math.min(1, T.t / 0.5);
    const place = (k, n, r, hBase, out) => {
      const a = T.t * 1.1 + (k / Math.max(1, n)) * Math.PI * 2;
      return out.set(c.x + Math.cos(a) * r, c.y + hBase + Math.sin(T.t * 2 + k) * 0.35, c.z + Math.sin(a) * r);
    };
    T.items.forEach((it, i) => {
      if (it.dead) return;
      place(i, T.items.length, 3.4 + (i % 3) * 0.9, 0.6 + (i % 4) * 0.7, _v);
      const prev = _a.copy(it.p);
      it.p.lerp(_v, Math.min(1, dt * 4 * lift + 0.02));
      it.v.subVectors(it.p, prev).divideScalar(Math.max(dt, 1e-4));
      const wl = it.w.length();
      if (wl > 0) it.q.premultiply(new THREE.Quaternion().setFromAxisAngle(_a.copy(it.w).divideScalar(wl), wl * dt)).normalize();
      if (Math.random() < dt * 3) g.fx.sparks.emit(it.p, _a.set(0, 0.5, 0), new THREE.Color(0.8, 1.4, 2.6), 0.3, 0, 0.02);
    });
    T.cars.forEach((car, i) => {
      const a = T.t * 0.7 + i * (Math.PI * 2 / 3);
      _v.set(c.x + Math.cos(a) * 7, c.y + 3.2 + Math.sin(T.t * 1.5 + i) * 0.4, c.z + Math.sin(a) * 7);
      _v.lerp(car.p, 1 - Math.min(1, dt * 3 * lift + 0.02));
      g.cars.carry(car, _v, a + Math.PI / 2 + Math.sin(T.t + i) * 0.3);
    });
    if (T.dummy && g.dummy.mode === 'held') g.dummy.holdTarget.copy(c).addScaledVector(f, 3.2).add(_a.set(0, 1.4 + Math.sin(T.t * 2) * 0.2, 0));
  }

  release() {
    const g = this.g, T = this.tk;
    if (!T) return;
    const target = g.aim.point.clone();
    for (const it of T.items) {
      if (it.dead) continue;
      it.tk = false; it.asleep = false;
      _v.subVectors(target, it.p).normalize().multiplyScalar(55 + Math.random() * 15).add(_a.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4));
      it.v.copy(_v);
    }
    for (const car of T.cars) g.cars.release(car, _v.subVectors(target, car.p).normalize().multiplyScalar(60), 'player');
    if (T.dummy && g.dummy.mode === 'held') g.dummy.release(_v.subVectors(target, g.dummy.chest(_a)).normalize().multiplyScalar(85));
    g.sfx.whoosh(); g.shake(0.2);
    g.fx.wave(g.chest(), 6, 0.3, new THREE.Color(0.8, 1.4, 2.6));
    this.tk = null;
  }

  // ---------------------------------------------------------------- thunderclap
  clap() {
    if (this.clapT > 0 || this.cool.clap > 0) return;
    this.clapT = 1; this.clapFired = false; this.cool.clap = 3.5;
  }

  _fireClap() {
    const g = this.g;
    const c = g.chest(), dir = g.aimDir(c);
    // carve a widening tunnel through anything in front
    let budget = 1600;
    for (let d = 2.5; d <= 22 && budget > 0; d += 1.6) {
      const r = 0.9 + d * 0.11;
      const p = c.clone().addScaledVector(dir, d);
      budget -= g.smash(p, r, { vel: dir.clone().multiplyScalar(40 - d), inherit: 1, outward: 5, up: 1.5, max: 300, noDust: d % 3 > 1 });
    }
    // fling everything in the cone
    const cone = (p, range) => { _v.subVectors(p, c); const d = _v.length(); return d < range && _v.dot(dir) > Math.cos(0.65) * d ? d : -1; };
    for (const it of g.debris.items) { const d = cone(it.p, 26); if (d >= 0) { g.debris.wake(it); it.v.addScaledVector(dir, 55 * (1 - d / 30)).y += 6; } }
    for (const car of g.cars.cars) { if (car.held) continue; const d = cone(car.p, 26); if (d >= 0) g.cars.hit(car, car.p, dir.clone().multiplyScalar(48 * (1 - d / 32)).add(new THREE.Vector3(0, 8, 0))); }
    const dc = g.dummy.chest(new THREE.Vector3()); const dd = cone(dc, 26);
    if (dd >= 0) { g.dummy.hit(dc, 3, dir.clone().multiplyScalar(70 * (1 - dd / 34)).add(new THREE.Vector3(0, 9, 0)), 1); g.dummy.say(['MY EARS!', 'WHAT?! I CAN\'T HEAR YOU!', 'Rude!'], true); }
    // visuals: a train of shock rings down the cone, a white flash, screen jolt
    for (let i = 0; i < 6; i++) g.fx.wave(c.clone().addScaledVector(dir, 2 + i * 3.5), 2 + i * 1.3, 0.25 + i * 0.05, new THREE.Color(2.2, 2.2, 2.6));
    g.fx.punchLight.position.copy(c).addScaledVector(dir, 2); g.fx.punchLight.intensity = 120;
    for (let i = 0; i < 60; i++) g.fx.sparks.emit(c.clone().addScaledVector(dir, 1.5), dir.clone().multiplyScalar(30 + Math.random() * 30).add(_v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(30)), new THREE.Color(3, 3, 3.4), 0.25, 0.2, 0.03);
    g.shake(0.6); g.hitstop(0.06); g.sfx.boom(1.3);
    g.brain?.event('The player clapped and a sonic boom blasted everything in front of them.');
  }

  update(dt, frozen) {
    for (const k in this.cool) this.cool[k] = Math.max(0, this.cool[k] - dt);
    if (this.hole) this._updateHole(dt, frozen);
    if (this.tk) this._updateTK(dt);
    if (this.clapT > 0) {
      this.clapT = Math.max(0, this.clapT - dt / 0.38);
      if (!this.clapFired && this.clapT < 0.55) { this.clapFired = true; this._fireClap(); }
    }
  }
}
