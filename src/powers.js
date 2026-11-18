// Extra powers: Singularity (Z), Telekinesis (hold B) and Thunderclap (N).
// Everything goes through the game context `g` so the powers act on the same rubble, cars, dummy and
// voxels as everything else, and respect frozen time.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class Powers {
  constructor(g) {
    this.g = g;
    this.cool = { hole: 0, clap: 0, meteor: 0 };
    this.zap = null;      // chain lightning while L is held
    this.meteor = null;   // incoming meteor
    // lightning arcs: one line-segment buffer, redrawn with fresh jagged paths every flicker
    const lg = new THREE.BufferGeometry();
    this.arcPos = new Float32Array(2000 * 3); this.arcCol = new Float32Array(2000 * 3);
    lg.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3)); lg.setAttribute('color', new THREE.BufferAttribute(this.arcCol, 3));
    this.arcs = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.arcs.frustumCulled = false; this.arcs.visible = false; g.scene.add(this.arcs);
    this.zapLight = new THREE.PointLight(0x9fc8ff, 0, 30, 1.5); g.scene.add(this.zapLight);
    // the meteor: a lumpy molten rock with a glowing shell
    let rock = new THREE.IcosahedronGeometry(1, 3);
    { const p = rock.attributes.position; const v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.multiplyScalar(1 + 0.18 * Math.sin(v.x * 5) * Math.cos(v.y * 4 + v.z * 3)); p.setXYZ(i, v.x, v.y, v.z); } rock.computeVertexNormals(); }
    this.rock = new THREE.Mesh(rock, new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.9, emissive: 0xff5a10, emissiveIntensity: 1.6 }));
    this.rock.visible = false; this.rock.castShadow = true; g.scene.add(this.rock);
    this.rockGlow = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.1, 0.3), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.rock.add(this.rockGlow); this.rockGlow.scale.setScalar(1.5);
    this.rockLight = new THREE.PointLight(0xff7a30, 0, 80, 1.4); g.scene.add(this.rockLight);
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

  // ---------------------------------------------------------------- chain lightning
  startZap() { if (!this.zap) { this.zap = { t: 0, tick: 0, hum: 0 }; this.arcs.visible = true; } }
  stopZap() { this.zap = null; this.arcs.visible = false; this.zapLight.intensity = 0; }

  // A jagged bolt from a to b written into the line buffer; returns the next free vertex.
  _bolt(a, b, at, color, rough = 0.18) {
    const n = Math.max(4, Math.min(24, Math.round(a.distanceTo(b) / 0.8)));
    let prev = a.clone();
    for (let i = 1; i <= n && at < 1998; i++) {
      const p = a.clone().lerp(b, i / n);
      if (i < n) p.add(_v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(a.distanceTo(b) * rough * Math.sin(Math.PI * i / n)));
      this.arcPos.set([prev.x, prev.y, prev.z, p.x, p.y, p.z], at * 3);
      this.arcCol.set([color.r, color.g, color.b, color.r, color.g, color.b], at * 3);
      at += 2; prev = p;
    }
    return at;
  }

  _updateZap(dt, frozen) {
    const g = this.g, Z = this.zap;
    Z.t += dt; Z.tick -= dt;
    if (Z.tick > 0) return;
    Z.tick = 0.06;
    // pick a chain: start from the hands, jump to the nearest target ahead, then onward
    const hands = [g.hand(-1), g.hand(1)];
    const f = g.forward();
    const cand = [];
    const add = (p, kind, ref) => { _v.subVectors(p, hands[0]); const d = _v.length(); if (d < 30 && _v.dot(f) > 0.45 * d) cand.push({ p: p.clone(), kind, ref, d }); };
    if (g.dummy.mode !== 'held') add(g.dummy.chest(_a), 'dummy');
    for (const car of g.cars.cars) if (!car.held && car.p.distanceToSquared(hands[0]) < 900) add(car.p, 'car', car);
    for (const pr of g.props.props) if (pr.p.distanceToSquared(hands[0]) < 900) add(pr.p, 'prop', pr);
    cand.sort((a, b) => a.d - b.d);
    let at = 0;
    const col = new THREE.Color(2.2, 2.8, 4.5), core = new THREE.Color(5, 5, 6);
    let from = hands[0].clone().lerp(hands[1], 0.5);
    const chain = cand.filter((c) => c.d < 24).slice(0, 4);
    if (!chain.length) chain.push({ p: g.aim.point.clone(), kind: 'wall' });
    for (const c of chain) {
      at = this._bolt(from, c.p, at, col, 0.09);
      at = this._bolt(from, c.p, at, core, 0.035);
      if (c === chain[0]) for (const h of hands) at = this._bolt(h, from, at, core, 0.15);
      this._zapHit(c, frozen);
      from = c.p;
    }
    // stray forks for flavour
    for (let i = 0; i < 2; i++) at = this._bolt(hands[i % 2], hands[i % 2].clone().addScaledVector(f, 0.8 + Math.random() * 1.2).add(_v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.8)), at, col, 0.3);
    for (let i = at; i < 2000; i++) { this.arcPos[i * 3] = this.arcPos[i * 3 + 1] = this.arcPos[i * 3 + 2] = 0; }
    this.arcs.geometry.setDrawRange(0, at);
    this.arcs.geometry.attributes.position.needsUpdate = true; this.arcs.geometry.attributes.color.needsUpdate = true;
    this.zapLight.position.copy(chain[0].p); this.zapLight.intensity = 30 + Math.random() * 30;
    if ((Z.hum -= 0.06) <= 0) { Z.hum = 0.12; g.sfx.glass(); }
  }

  _zapHit(c, frozen) {
    const g = this.g;
    for (let i = 0; i < 4; i++) g.fx.sparks.emit(c.p, _v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(18), new THREE.Color(2.5, 3, 5), 0.25, 0.8, 0.02);
    if (c.kind === 'dummy') {
      // electrocuted: jitter, scorch and a shove
      g.dummy.hit(c.p, 3, _v.set((Math.random() - 0.5) * 6, 3 + Math.random() * 3, (Math.random() - 0.5) * 6), 0.6);
      g.dummy.burn += 0.02;
      if (Math.random() < 0.08) g.dummy.say(['BZZZZT!', 'I can taste colours!', 'My bolts are tingling!', 'ZAP ZAP OW']);
    } else if (c.kind === 'car') g.cars.hit(c.ref, c.p, _v.set((Math.random() - 0.5) * 3, 4, (Math.random() - 0.5) * 3));
    else if (c.kind === 'prop') g.props._kick(c.ref, _v.set((Math.random() - 0.5) * 6, 6, (Math.random() - 0.5) * 6));
    else { g.smash(c.p, 0.75, { outward: 4, up: 2, noDust: true }); g.fx.addScorch(c.p, 0.8); }
  }

  // ---------------------------------------------------------------- meteor
  callMeteor() {
    const g = this.g;
    if (this.meteor || this.cool.meteor > 0) return;
    const target = g.aim.point.clone();
    const back = g.forward().setY(0).normalize();
    const from = target.clone().addScaledVector(back, -60).add(_v.set(15, 130, 0));
    this.meteor = { from, to: target, p: from.clone(), t: 0, dur: 1.5 };
    this.cool.meteor = 12;
    this.rock.visible = true; this.rock.scale.setScalar(2.2);
    g.sfx.whoosh();
    g.dummy.say(['Is that... a METEOR?!', 'Look up! LOOK UP!', 'Not today, sky!'], true);
    g.brain?.event('The player called down a meteor.');
  }

  _updateMeteor(dt, frozen) {
    const g = this.g, M = this.meteor;
    if (!frozen) M.t += dt;
    const u = Math.min(1, M.t / M.dur);
    M.p.lerpVectors(M.from, M.to, u * u);
    this.rock.position.copy(M.p); this.rock.rotation.x += dt * 4; this.rock.rotation.z += dt * 3;
    this.rockLight.position.copy(M.p); this.rockLight.intensity = 120;
    // fiery trail
    if (!frozen) {
      _v.subVectors(M.from, M.to).normalize();
      for (let i = 0; i < 6; i++) g.fx.dust.emit(_a.copy(M.p).addScaledVector(_v, 1 + Math.random() * 3).add(_b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2)), _b.set(0, 1, 0), i < 3 ? new THREE.Color(1.6, 0.6, 0.15) : new THREE.Color(0.25, 0.22, 0.2), 2.5 + Math.random() * 2, 1.5 + Math.random(), 2.5, 0.6);
      for (let i = 0; i < 4; i++) g.fx.sparks.emit(M.p, _b.copy(_v).multiplyScalar(30).add(_a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(20)), new THREE.Color(5, 2, 0.5), 0.6, 0.5, 0.04);
    }
    if (u >= 1) { this._impact(M.to); this.meteor = null; this.rock.visible = false; this.rockLight.intensity = 0; }
  }

  _impact(c) {
    const g = this.g;
    g.smash(c, 6.5, { outward: 18, up: 10, max: 4000 });
    g.smash(c.clone().add(_v.set(0, 4, 0)), 4.5, { outward: 14, up: 8, max: 1500 });
    g.blastAll(c, 40, 60, null, 0.8);
    g.props.blast(c, 40, 50, null, 0.8);
    g.birds.scare(c, 120);
    const dc = g.dummy.chest(_a); const dd = dc.distanceTo(c);
    if (dd < 30) g.dummy.hit(dc, 4, _b.subVectors(dc, c).normalize().multiplyScalar(70 * (1 - dd / 34)).add(_v.set(0, 25, 0)), 1);
    const pc = g.chest(); const pd = pc.distanceTo(c);
    if (pd < 14) g.knockPlayer(_b.subVectors(pc, c), 40 * (1 - pd / 16));
    g.fx.wave(c, 26, 0.7, new THREE.Color(3, 1.6, 0.6)); g.fx.wave(c, 12, 0.4, new THREE.Color(4, 3, 2));
    g.fx.ring(c, 45, 1.0); g.fx.addScorch(c, 14);
    g.fx.punchLight.position.copy(c).add(_v.set(0, 3, 0)); g.fx.punchLight.intensity = 400;
    for (let i = 0; i < 120; i++) g.fx.sparks.emit(c, _v.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(25 + Math.random() * 40), new THREE.Color(5, 2.2, 0.6), 0.8 + Math.random(), 1, 0.03);
    const dust = new THREE.Color(0.55, 0.5, 0.45);
    for (let i = 0; i < 70; i++) { const a = Math.random() * 6.28; g.fx.dust.emit(_v.set(c.x + Math.cos(a) * 3, c.y + 1, c.z + Math.sin(a) * 3), _a.set(Math.cos(a) * 18, 2 + Math.random() * 8, Math.sin(a) * 18), dust, 3 + Math.random() * 3, 3 + Math.random() * 3, 3, 0.5); }
    g.shake(1); g.hitstop(0.1); g.sfx.boom(2); g.sfx.crumble(400);
    g.brain?.event('A meteor just crashed down, leaving a huge crater.');
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
    if (this.zap) this._updateZap(dt, frozen);
    if (this.meteor) this._updateMeteor(dt, frozen);
    if (this.tk) this._updateTK(dt);
    if (this.clapT > 0) {
      this.clapT = Math.max(0, this.clapT - dt / 0.38);
      if (!this.clapFired && this.clapT < 0.55) { this.clapFired = true; this._fireClap(); }
    }
  }
}
