// Particles, shockwaves, laser beams and scorch marks.
import * as THREE from 'three';
import { radialTex, scorchTex } from './textures.js?v=1795648513';

const _v = new THREE.Vector3();
const _y = new THREE.Vector3(0, 1, 0);

class DustSystem {
  constructor(scene, cap = 2500) {
    this.cap = cap; this.i = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 4); this.size = new Float32Array(cap);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.grow = new Float32Array(cap); this.base = new Float32Array(cap * 4);
    this.uniforms = { uScale: { value: 800 }, uTex: { value: radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)') } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC; uniform float uScale;
        void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec4 vC;
        void main(){ float a=texture2D(uTex,gl_PointCoord).a; gl_FragColor=vec4(vC.rgb, vC.a*a*a); }`,
    });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = g;
  }
  emit(p, v, color, size, life, grow = 1.5, alpha = 0.55) {
    const i = this.i; this.i = (this.i + 1) % this.cap;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.base[i * 4] = color.r; this.base[i * 4 + 1] = color.g; this.base[i * 4 + 2] = color.b; this.base[i * 4 + 3] = alpha;
    this.size[i] = size; this.life[i] = life; this.max[i] = life; this.grow[i] = grow;
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.max[i];
      const drag = Math.max(0, 1 - 2.2 * dt);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag + 0.35 * dt; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.2) this.pos[i * 3 + 1] = 0.2;
      this.size[i] += this.grow[i] * dt;
      const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      this.col[i * 4] = this.base[i * 4]; this.col[i * 4 + 1] = this.base[i * 4 + 1]; this.col[i * 4 + 2] = this.base[i * 4 + 2];
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * Math.max(0, fade);
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; this.geo.attributes.size.needsUpdate = true;
  }
}

class SparkSystem {
  constructor(scene, cap = 2500) {
    this.cap = cap; this.i = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 6); this.col = new Float32Array(cap * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.c = new Float32Array(cap * 3); this.grav = new Float32Array(cap); this.stretch = new Float32Array(cap);
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lines = new THREE.LineSegments(g, m); this.lines.frustumCulled = false;
    scene.add(this.lines); this.geo = g;
  }
  emit(p, v, color, life, grav = 1, stretch = 0.03) {
    const i = this.i; this.i = (this.i + 1) % this.cap;
    this.p[i * 3] = p.x; this.p[i * 3 + 1] = p.y; this.p[i * 3 + 2] = p.z;
    this.v[i * 3] = v.x; this.v[i * 3 + 1] = v.y; this.v[i * 3 + 2] = v.z;
    this.c[i * 3] = color.r; this.c[i * 3 + 1] = color.g; this.c[i * 3 + 2] = color.b;
    this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.stretch[i] = stretch;
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      const o = i * 6;
      if (this.life[i] <= 0) { this.col[o] = this.col[o + 1] = this.col[o + 2] = this.col[o + 3] = this.col[o + 4] = this.col[o + 5] = 0; continue; }
      this.life[i] -= dt;
      const f = Math.max(0, this.life[i] / this.max[i]);
      this.v[i * 3 + 1] -= 20 * this.grav[i] * dt;
      const dr = Math.max(0, 1 - 1.5 * dt);
      this.v[i * 3] *= dr; this.v[i * 3 + 1] *= dr; this.v[i * 3 + 2] *= dr;
      let px = this.p[i * 3] += this.v[i * 3] * dt, py = this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt, pz = this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      if (py < 0.02 && this.grav[i] > 0) { this.p[i * 3 + 1] = 0.02; this.v[i * 3 + 1] *= -0.35; this.v[i * 3] *= 0.6; this.v[i * 3 + 2] *= 0.6; py = 0.02; }
      const s = this.stretch[i];
      this.pos[o] = px; this.pos[o + 1] = py; this.pos[o + 2] = pz;
      this.pos[o + 3] = px - this.v[i * 3] * s; this.pos[o + 4] = py - this.v[i * 3 + 1] * s; this.pos[o + 5] = pz - this.v[i * 3 + 2] * s;
      const k = f * f;
      this.col[o] = this.c[i * 3] * k; this.col[o + 1] = this.c[i * 3 + 1] * k * f; this.col[o + 2] = this.c[i * 3 + 2] * k * f;
      this.col[o + 3] = this.col[o] * 0.4; this.col[o + 4] = this.col[o + 1] * 0.3; this.col[o + 5] = this.col[o + 2] * 0.2;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.fx = new THREE.Group(); scene.add(this.fx); // hidden from the AO pass
    this.dust = new DustSystem(scene);
    this.sparks = new SparkSystem(scene);
    // shockwave spheres
    this.waves = [];
    const waveMat = () => new THREE.ShaderMaterial({
      uniforms: { uO: { value: 0 }, uC: { value: new THREE.Color(1.6, 1.5, 1.3) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform float uO; uniform vec3 uC; varying vec3 vN; varying vec3 vV; void main(){ float f=1.-abs(dot(vN,vV)); f=pow(f,5.); gl_FragColor=vec4(uC*f*uO*0.55, 1.); }`,
    });
    const sg = new THREE.SphereGeometry(1, 32, 20);
    for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(sg, waveMat()); m.visible = false; this.fx.add(m); this.waves.push({ m, t: 0, d: 0, r: 0 }); }
    // ground rings
    this.rings = [];
    const ringTex = radialTex('rgba(255,255,255,0)', 'rgba(255,255,255,1)');
    const rg = new THREE.RingGeometry(0.7, 1, 64); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xd8cfc0, transparent: true, opacity: 0, depthWrite: false, alphaMap: ringTex }));
      m.visible = false; this.fx.add(m); this.rings.push({ m, t: 0, d: 0, r: 0 });
    }
    // laser beams
    this.beams = [];
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(12, 9, 4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 0.9, 0.1), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
    const cg = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true); cg.translate(0, 0.5, 0);
    for (let i = 0; i < 2; i++) {
      const core = new THREE.Mesh(cg, coreMat), glow = new THREE.Mesh(cg, glowMat);
      core.visible = glow.visible = false; this.fx.add(core); this.fx.add(glow);
      this.beams.push({ core, glow });
    }
    this.glowMat = glowMat; this.coreMat = coreMat;
    const flare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radialTex('rgba(255,220,140,1)', 'rgba(255,120,20,0)'), color: new THREE.Color(6, 3, 1), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    flare.visible = false; this.fx.add(flare); this.flare = flare;
    this.laserLight = new THREE.PointLight(0xffa040, 0, 14, 1.6); scene.add(this.laserLight);
    this.punchLight = new THREE.PointLight(0xfff0d0, 0, 30, 1.5); scene.add(this.punchLight);
    // scorch decals on the ground
    this.scorchCap = 400; this.scorchI = 0;
    const sm = new THREE.MeshStandardMaterial({ map: scorchTex(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    const sgeo = new THREE.PlaneGeometry(1, 1); sgeo.rotateX(-Math.PI / 2);
    this.scorch = new THREE.InstancedMesh(sgeo, sm, this.scorchCap); this.scorch.count = 0; this.scorch.frustumCulled = false; this.scorch.receiveShadow = true;
    scene.add(this.scorch);
  }

  wave(p, r, dur = 0.35, color = null) {
    const w = this.waves.find((w) => w.t <= 0) || this.waves[0];
    w.m.position.copy(p); w.t = dur; w.d = dur; w.r = r; w.m.visible = true;
    w.m.material.uniforms.uC.value.copy(color || new THREE.Color(1.6, 1.5, 1.3));
  }
  ring(p, r, dur = 0.6) {
    const w = this.rings.find((w) => w.t <= 0) || this.rings[0];
    w.m.position.set(p.x, 0.06, p.z); w.t = dur; w.d = dur; w.r = r; w.m.visible = true;
  }
  addScorch(p, size) {
    const i = this.scorchI; this.scorchI = (this.scorchI + 1) % this.scorchCap;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0.02 + (i % 7) * 0.001, p.z), new THREE.Quaternion().setFromAxisAngle(_y, Math.random() * 6.28), new THREE.Vector3(size, 1, size));
    this.scorch.setMatrixAt(i, m);
    this.scorch.count = Math.max(this.scorch.count, i + 1);
    this.scorch.instanceMatrix.needsUpdate = true;
  }

  setBeam(i, from, to, on, t) {
    const b = this.beams[i];
    b.core.visible = b.glow.visible = on;
    if (!on) return;
    _v.subVectors(to, from);
    const len = _v.length();
    _v.divideScalar(len);
    for (const m of [b.core, b.glow]) { m.position.copy(from); m.quaternion.setFromUnitVectors(_y, _v); }
    const flick = 0.85 + Math.sin(t * 90 + i) * 0.1 + Math.random() * 0.1;
    b.core.scale.set(0.022 * flick, len, 0.022 * flick);
    b.glow.scale.set(0.075 * flick, len, 0.075 * flick);
  }

  setLaserColors(core, glow) { this.coreMat.color.copy(core); this.glowMat.color.copy(glow); }

  clearScorch() { this.scorch.count = 0; this.scorchI = 0; }

  update(dt, camera, frozen = false) {
    if (!frozen) { this.dust.update(dt); this.sparks.update(dt); } // particles hang in frozen time
    else { this.dust.update(0); this.sparks.update(0); }
    for (const w of this.waves) {
      if (w.t <= 0) continue;
      w.t -= dt; const t = 1 - Math.max(0, w.t) / w.d;
      const s = w.r * (0.25 + 0.75 * Math.pow(t, 0.5));
      w.m.scale.setScalar(s);
      w.m.material.uniforms.uO.value = (1 - t) * 1.6;
      if (w.t <= 0) w.m.visible = false;
    }
    for (const w of this.rings) {
      if (w.t <= 0) continue;
      w.t -= dt; const t = 1 - Math.max(0, w.t) / w.d;
      w.m.scale.setScalar(w.r * (0.2 + 0.8 * Math.pow(t, 0.6)));
      w.m.material.opacity = (1 - t) * 0.7;
      if (w.t <= 0) w.m.visible = false;
    }
    this.punchLight.intensity *= Math.max(0, 1 - dt * 10);
    if (this.flare.visible) this.flare.quaternion.copy(camera.quaternion);
  }
}
