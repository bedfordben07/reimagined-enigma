// Crash-test dummy: a Verlet ragdoll. Standing still until something hits it, then pure physics.
// Fast-moving body parts smash through walls.
import * as THREE from 'three';
import { dummyTex, brushedMetalTex, pbr } from './textures.js';
import { lathe, extrude, roundRect, smoothSym, smoothShape, toX } from './geom.js';

// Lines it says, by situation.
const LINES = {
  greet: ['Hi there!', 'Test subject reporting!', 'Be gentle?', 'Oh good, you again.', 'Ready when you are!'],
  hit: ['OOF!', 'Not the face!', 'Ow ow ow!', 'Was that necessary?!', 'My warranty!', 'AAAAH!', 'Rude!'],
  big: ['WHY?!', 'I saw my whole life!', 'That one hurt!', 'AAAAAAAAH'],
  wall: ['Ow. Drywall.', '*crunch*', 'Sorry! Coming through!', 'Who put a wall there?'],
  grabbed: ['Hey! Put me down!', 'Whoa whoa whoa!', 'I bruise easily!', 'Not again...'],
  held: ['This is undignified.', 'Nice view up here.', 'My feet are dangling.'],
  thrown: ['WHEEEEE!', 'Nooooooo!', 'I regret nothiiing!', 'Tell my mother—'],
  getup: ["I'm okay!", 'Is that all you got?', 'Still standing!', '...ow.', 'Walk it off. Walk it off.'],
  taunt: ['Come on then!', 'Float like a butterfly!', 'Put em up!', 'My turn!'],
  cower: ['Uh oh.', 'Wait wait wait!', "Let's talk about this!", 'Not the fist!'],
  laserNear: ['Is that a laser?!', 'Eyes OFF, please!', 'Point that elsewhere!'],
  laser: ['Hot hot hot!', "I'm melting!", 'Smells like toast!', 'OW, that burns!'],
};

// Paint the chest plate: crash-test target and a stencilled number.
function chestTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#e9b52a'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#121212'; x.beginPath(); x.arc(128, 150, 54, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#f0c030'; x.beginPath(); x.arc(128, 150, 48, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#121212';
  x.beginPath(); x.moveTo(128, 150); x.arc(128, 150, 48, 0, Math.PI / 2); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(128, 150); x.arc(128, 150, 48, Math.PI, Math.PI * 1.5); x.closePath(); x.fill();
  x.font = 'bold 44px Arial, sans-serif'; x.textAlign = 'center'; x.fillText('07', 128, 72);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

const POSE = {
  head: [0, 1.72, 0.0, 0.15],
  neck: [0, 1.47, 0.04, 0.1],
  lsh: [-0.21, 1.42, 0, 0.09], rsh: [0.21, 1.42, 0, 0.09],
  lel: [-0.27, 1.13, 0.0, 0.07], rel: [0.27, 1.13, 0.0, 0.07],
  lha: [-0.29, 0.86, 0.04, 0.07], rha: [0.29, 0.86, 0.04, 0.07],
  lhp: [-0.12, 0.95, 0, 0.1], rhp: [0.12, 0.95, 0, 0.1],
  lkn: [-0.13, 0.52, 0.03, 0.08], rkn: [0.13, 0.52, 0.03, 0.08],
  lft: [-0.13, 0.08, 0.05, 0.07], rft: [0.13, 0.08, 0.05, 0.07],
};
// Half-way pose for getting up: one knee down, hands pushing off the ground.
const KNEEL = {
  head: [0, 1.0, 0.38], neck: [0, 0.82, 0.27],
  lsh: [-0.21, 0.79, 0.21], rsh: [0.21, 0.79, 0.21],
  lel: [-0.27, 0.48, 0.33], rel: [0.27, 0.48, 0.33],
  lha: [-0.27, 0.1, 0.45], rha: [0.27, 0.1, 0.45],
  lhp: [-0.12, 0.55, -0.08], rhp: [0.12, 0.55, -0.08],
  lkn: [-0.13, 0.09, 0.12], rkn: [0.14, 0.52, 0.38],
  lft: [-0.13, 0.08, -0.42], rft: [0.14, 0.08, 0.3],
};
const NAMES = Object.keys(POSE);
const ID = Object.fromEntries(NAMES.map((n, i) => [n, i]));
const G = -20;
const BREAK_SPEED = 17;

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _up = new THREE.Vector3(), _rt = new THREE.Vector3(), _fw = new THREE.Vector3();
const _mat = new THREE.Matrix4(), _y = new THREE.Vector3(0, 1, 0), _yN = new THREE.Vector3(0, -1, 0);
const _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _char = new THREE.Color(0x231a12);

export class Dummy {
  constructor(scene, voxels, ctx) {
    this.scene = scene; this.voxels = voxels; this.ctx = ctx; // ctx.smash(center, r, vel)
    this.n = NAMES.length;
    this.p = []; this.o = []; this.r = [];
    for (const k of NAMES) { this.p.push(new THREE.Vector3()); this.o.push(new THREE.Vector3()); this.r.push(POSE[k][3]); }
    this.cons = [];
    const rigid = ['neck', 'lsh', 'rsh', 'lhp', 'rhp'];
    for (let i = 0; i < rigid.length; i++) for (let j = i + 1; j < rigid.length; j++) this._con(rigid[i], rigid[j], 1);
    this._con('head', 'neck', 1); this._con('head', 'lsh', 1); this._con('head', 'rsh', 1);
    this._con('lsh', 'lel', 1); this._con('lel', 'lha', 1); this._con('rsh', 'rel', 1); this._con('rel', 'rha', 1);
    this._con('lhp', 'lkn', 1); this._con('lkn', 'lft', 1); this._con('rhp', 'rkn', 1); this._con('rkn', 'rft', 1);
    this._con('lsh', 'lha', 1, 0.28); this._con('rsh', 'rha', 1, 0.28);
    this._con('lhp', 'lft', 1, 0.5); this._con('rhp', 'rft', 1, 0.5);
    this._con('lkn', 'rkn', 1, 0.12); this._con('lft', 'rft', 1, 0.1);
    this.mode = 'stand';
    this.restT = 0; this.getT = 0; this.from = []; this.toRoot = new THREE.Vector3(); this.toYaw = 0;
    this.root = new THREE.Vector3(); this.yaw = 0;
    this.holdTarget = new THREE.Vector3();
    this.burn = 0;
    this.lastHitTime = 0;
    this.time = 0; this.blinkT = 2; this.lastSay = 0; this.speech = null;
    this.mood = 'idle'; this.moodT = 0; this.moodW = { wave: 0, cower: 0, taunt: 0, dizzy: 0 };
    this.greetReady = true; this.wasThreat = false; this.heldSince = 0; this.bigHit = 0;
    this.player = new THREE.Vector3(); this.headQ = new THREE.Quaternion();
    this._buildMeshes();
  }

  _con(a, b, stiff, minOnly = 0) {
    const A = POSE[a], B = POSE[b];
    const len = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
    this.cons.push([ID[a], ID[b], minOnly ? minOnly : len, stiff, !!minOnly]);
  }

  _buildMeshes() {
    const yellow = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: dummyTex(false), roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    const headMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: dummyTex(true), roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.25 });
    const plain = new THREE.MeshPhysicalMaterial({ color: 0xeab52c, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    const chestMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: chestTex(), roughness: 0.38, clearcoat: 0.6 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.65, metalness: 0.05 });
    const steel = pbr(brushedMetalTex(61, '#a9aeb3', 0.3), { metalness: 0.9 });
    const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f1ea, roughness: 0.15, clearcoat: 1 });
    const pupil = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.1 });
    this.mats = [yellow, headMat, plain, chestMat];
    this.baseColors = this.mats.map((m) => m.color.clone());
    this.group = new THREE.Group();
    const M = (geo, mat, parent = this.group) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

    // head: glossy egg with the crash-test marker, googly painted eyes and expressive brows
    this.head = new THREE.Group(); this.group.add(this.head);
    M(lathe([[0, 0.16], [0.07, 0.15], [0.115, 0.1], [0.13, 0.02], [0.125, -0.06], [0.1, -0.12], [0.05, -0.15], [0, -0.155]], 48, 0, Math.PI * 2, 4), headMat, this.head).scale.set(1, 1, 1.05);
    for (const sx of [-1, 1]) { // ear bolts
      M(toX(lathe([[0, 0.012], [0.03, 0.012], [0.034, 0], [0.03, -0.012], [0, -0.012]], 20)), steel, this.head).position.set(0.128 * sx, 0.0, 0);
    }
    this.eyesD = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group(); eye.position.set(0.046 * sx, 0.03, 0.112); this.head.add(eye);
      const ball = M(new THREE.SphereGeometry(0.032, 20, 14), white, eye); ball.scale.z = 0.6;
      const pu = M(new THREE.SphereGeometry(0.014, 14, 10), pupil, eye); pu.position.z = 0.017;
      const brow = M(extrude(roundRect(0.05, 0.011, 0.005), 0.008, 0.003), rubber, this.head);
      brow.position.set(0.048 * sx, 0.078, 0.112);
      this.eyesD.push({ eye, ball, pu, brow, sx });
    }
    M(extrude(roundRect(0.05, 0.008, 0.004), 0.006, 0.003), rubber, this.head).position.set(0, -0.055, 0.118); // mouth line
    this.mouth = this.head.children[this.head.children.length - 1];
    // neck: ribbed rubber
    const rib = []; for (let i = 0; i <= 6; i++) rib.push([i % 2 ? 0.042 : 0.052, 0.07 - i * 0.023]);
    this.neckM = M(lathe(rib, 24), rubber);
    // torso: barrel chest, numbered chest plate, ribbed waist, pelvis
    this.torso = new THREE.Group(); this.group.add(this.torso);
    M(lathe([[0, 0.27], [0.12, 0.26], [0.18, 0.2], [0.195, 0.08], [0.18, -0.06], [0.15, -0.16], [0.12, -0.2], [0, -0.21]], 48, 0, Math.PI * 2, 3), yellow, this.torso).scale.z = 0.66;
    const plate = extrude(smoothSym([[0.0, -0.13], [0.1, -0.12], [0.13, 0.0], [0.12, 0.12], [0.06, 0.15], [0.0, 0.15]]), 0.02, 0.012);
    { const uv = plate.attributes.uv, pos = plate.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 0.3 + 0.5, pos.getY(i) / 0.3 + 0.5); }
    M(plate, chestMat, this.torso).position.set(0, 0.06, 0.12);
    for (const sx of [-1, 1]) M(new THREE.SphereGeometry(0.012, 10, 8), steel, this.torso).position.set(0.1 * sx, 0.2, 0.115);
    const waist = []; for (let i = 0; i <= 6; i++) waist.push([i % 2 ? 0.12 : 0.135, 0.06 - i * 0.02]);
    M(lathe(waist, 32), rubber, this.torso).position.y = -0.24;
    this.torso.children[this.torso.children.length - 1].scale.z = 0.7;
    this.pelvis = new THREE.Group(); this.group.add(this.pelvis);
    M(lathe([[0, 0.07], [0.13, 0.065], [0.16, 0.0], [0.13, -0.07], [0.06, -0.1], [0, -0.1]], 40, 0, Math.PI * 2, 3), plain, this.pelvis).scale.z = 0.7;
    // limbs: tapered, thick at the body end
    this.limbs = [];
    const limb = (a, b, r0, r1, mat) => {
      const A = POSE[a], B = POSE[b];
      const L = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
      const g = lathe([[0, -L / 2 - r0 * 0.4], [r0 * 0.85, -L / 2], [r0, -L / 2 + L * 0.2], [r1 * 1.05, L * 0.25], [r1, L / 2], [0, L / 2 + r1 * 0.35]], 28, 0, Math.PI * 2, 3);
      const m = M(g, mat);
      this.limbs.push([ID[a], ID[b], m]);
    };
    limb('lsh', 'lel', 0.068, 0.055, plain); limb('lel', 'lha', 0.058, 0.045, plain);
    limb('rsh', 'rel', 0.068, 0.055, plain); limb('rel', 'rha', 0.058, 0.045, plain);
    limb('lhp', 'lkn', 0.092, 0.068, plain); limb('lkn', 'lft', 0.072, 0.052, plain);
    limb('rhp', 'rkn', 0.092, 0.068, plain); limb('rkn', 'rft', 0.072, 0.052, plain);
    // joints: rubber balls with a steel hinge bolt
    this.joints = [];
    for (const k of ['lel', 'rel', 'lkn', 'rkn', 'lsh', 'rsh']) {
      const g = new THREE.Group(); this.group.add(g);
      const big = k.endsWith('kn');
      M(new THREE.SphereGeometry(big ? 0.072 : 0.06, 18, 12), rubber, g);
      M(new THREE.SphereGeometry(big ? 0.022 : 0.018, 10, 8), steel, g).position.x = (k[0] === 'l' ? -1 : 1) * (big ? 0.066 : 0.055);
      this.joints.push([ID[k], g]);
    }
    // mitten hands and boots
    this.hands = [ID.lha, ID.rha].map((i, n) => {
      const g = new THREE.Group(); this.group.add(g);
      M(lathe([[0, 0.02], [0.04, 0.0], [0.05, -0.05], [0.04, -0.1], [0, -0.115]], 20, 0, Math.PI * 2, 3), rubber, g).scale.z = 0.62;
      const th = M(lathe([[0, 0.0], [0.016, -0.01], [0.014, -0.045], [0, -0.055]], 12), rubber, g); th.position.set((n ? -1 : 1) * 0.04, -0.03, 0.01); th.rotation.z = (n ? -1 : 1) * 0.6;
      return [i, g];
    });
    const shoe = extrude(smoothShape([[-0.08, 0], [0.13, 0], [0.17, 0.03], [0.12, 0.07], [0.0, 0.09], [-0.08, 0.08]]), 0.09, 0.02, 3);
    this.feet = [ID.lft, ID.rft].map((i) => { const g = new THREE.Group(); this.group.add(g); const s = M(shoe, rubber, g); s.rotation.y = -Math.PI / 2; s.position.y = -0.07; return [i, g]; });
    this.scene.add(this.group);
  }

  spawn(pos, yaw) {
    this.root.copy(pos); this.yaw = yaw; this.mode = 'stand'; this.burn = 0;
    this._setPose();
    for (let i = 0; i < this.n; i++) this.o[i].copy(this.p[i]);
  }

  _setPose() {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    for (let i = 0; i < this.n; i++) {
      const l = this._localPose(i, _e);
      this.p[i].set(this.root.x + l.x * c + l.z * s, this.root.y + l.y, this.root.z - l.x * s + l.z * c);
    }
  }

  chest(out) { return out.copy(this.p[ID.neck]).add(this.p[ID.lhp]).add(this.p[ID.rhp]).multiplyScalar(1 / 3); }
  velocity(out) { const i = ID.neck; return out.subVectors(this.p[i], this.o[i]).multiplyScalar(120); }

  // Add velocity (m/s) to body parts inside a sphere.
  hit(center, radius, vel, minFrac = 0.35) {
    if (this.mode === 'held') return false;
    let any = false;
    for (let i = 0; i < this.n; i++) {
      const d = this.p[i].distanceTo(center);
      if (d > radius) continue;
      any = true;
    }
    if (!any) return false;
    if (this.mode === 'stand' || this.mode === 'getup') this.mode = 'ragdoll';
    this.restT = 0;
    for (let i = 0; i < this.n; i++) {
      const d = this.p[i].distanceTo(center);
      const f = Math.max(minFrac, 1 - d / (radius * 1.6));
      this.o[i].addScaledVector(vel, -f * this.h);
    }
    this.lastHitTime = performance.now();
    const sp = vel.length();
    if (sp > 45) this.bigHit = 1;
    if (sp > 3) this.say(sp > 45 ? LINES.big : LINES.hit, sp > 45);
    return true;
  }

  push(vel) { // uniform velocity change
    if (this.mode === 'stand' || this.mode === 'getup') this.mode = 'ragdoll';
    this.restT = 0;
    for (let i = 0; i < this.n; i++) this.o[i].addScaledVector(vel, -this.h);
  }

  raycast(o, d, maxT) {
    let best = null;
    for (let i = 0; i < this.n; i++) {
      _v.subVectors(this.p[i], o);
      const t = _v.dot(d);
      if (t < 0 || t > maxT) continue;
      const r = this.r[i] * 1.7;
      const d2 = _v.lengthSq() - t * t;
      if (d2 > r * r) continue;
      const th = t - Math.sqrt(r * r - d2);
      if (!best || th < best.t) best = { t: th, i };
    }
    return best;
  }

  grab(target) { this.restT = 0; this.heldSince = this.time; this.say(LINES.grabbed, true); this.mode = 'held'; this.holdTarget.copy(target); }
  release(vel) {
    this.mode = 'ragdoll'; this.bigHit = 1;
    if (vel.length() > 30) this.say(LINES.thrown, true);
    for (let i = 0; i < this.n; i++) this.o[i].copy(this.p[i]).addScaledVector(vel, -this.h);
  }

  get h() { return 1 / 120; }

  // Lying still for a moment: work out where to stand and which way to face, then animate up.
  _startGetup() {
    const P = this.p;
    const mid = new THREE.Vector3().addVectors(P[ID.lhp], P[ID.rhp]).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(P[ID.head], mid); dir.y = 0;
    this.toYaw = dir.lengthSq() > 0.01 ? Math.atan2(dir.x, dir.z) : this.yaw;
    // stand on whatever is underneath: the ground, rubble-free floor or a roof
    let gy = 0;
    for (let y = mid.y + 0.4; y > 0; y -= 0.25) { if (this.voxels.solidAt(mid.x, y, mid.z)) { gy = (Math.floor(y / 0.5) + 1) * 0.5; break; } }
    this.toRoot.set(mid.x, gy, mid.z);
    this.from = P.map((p) => p.clone());
    this.getT = 0; this.mode = 'getup';
  }

  _poseAt(pose, root, yaw, k, out) {
    const [x, y, z] = pose[NAMES[k]];
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return out.set(root.x + x * c + z * s, root.y + y, root.z - x * s + z * c);
  }

  step(h) {
    if (this.mode === 'getup') {
      this.getT += h;
      const ss = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
      const T1 = 0.6, T2 = 0.75;
      for (let i = 0; i < this.n; i++) {
        const kneel = this._poseAt(KNEEL, this.toRoot, this.toYaw, i, _a);
        if (this.getT < T1) this.p[i].lerpVectors(this.from[i], kneel, ss(this.getT / T1));
        else {
          const stand = this._poseAt(POSE, this.toRoot, this.toYaw, i, _b);
          // a small overshoot as it straightens, so it settles instead of stopping dead
          const u = (this.getT - T1) / T2, e = ss(u) + Math.sin(Math.min(1, u) * Math.PI) * 0.06;
          this.p[i].lerpVectors(kneel, stand, e);
        }
        this.o[i].copy(this.p[i]);
      }
      if (this.getT >= T1 + T2) {
        this.root.copy(this.toRoot); this.yaw = this.toYaw; this.mode = 'stand';
        // shake it off: dizzy after a big one, then put its fists up
        if (this.bigHit) { this.mood = 'dizzy'; this.moodT = 1.6; this.moodW.dizzy = 1; this.say(['Whoa... stars...', 'Which one of you is real?', '...ow.']); }
        else { this.mood = 'taunt'; this.moodT = 2.2; this.moodW.taunt = 1; this.say(LINES.getup); }
        this.bigHit = 0;
      }
      return;
    }
    if (this.mode === 'ragdoll') {
      let maxV = 0;
      for (let i = 0; i < this.n; i++) maxV = Math.max(maxV, this.p[i].distanceToSquared(this.o[i]));
      if (Math.sqrt(maxV) / h < 0.7) { this.restT += h; if (this.restT > 1.4) { this.restT = 0; this._startGetup(); return; } }
      else this.restT = 0;
    }
    if (this.mode === 'stand') { this._setPose(); for (let i = 0; i < this.n; i++) this.o[i].copy(this.p[i]); return; }
    // Verlet integrate
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i], o = this.o[i];
      _v.subVectors(p, o).multiplyScalar(0.9995);
      o.copy(p);
      p.add(_v); p.y += G * h * h;
    }
    if (this.mode === 'held') {
      const k = ID.neck;
      this.p[k].copy(this.holdTarget);
    }
    for (let it = 0; it < 10; it++) {
      for (const [a, b, len, , minOnly] of this.cons) {
        const pa = this.p[a], pb = this.p[b];
        _v.subVectors(pb, pa);
        const d = _v.length() || 1e-6;
        if (minOnly && d >= len) continue;
        const diff = (d - len) / d * 0.5;
        pa.addScaledVector(_v, diff); pb.addScaledVector(_v, -diff);
      }
      if (this.mode === 'held') this.p[ID.neck].copy(this.holdTarget);
    }
    this._collide(h);
  }

  _collide(h) {
    const vox = this.voxels;
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i], o = this.o[i], r = this.r[i];
      _v.subVectors(p, o);
      const speed = _v.length() / h;
      if (speed > BREAK_SPEED) {
        // check ahead along motion and punch a hole
        if (vox.solidAt(p.x, p.y, p.z) || vox.solidAt(p.x + _v.x * 2, p.y + _v.y * 2, p.z + _v.z * 2)) {
          const vel = _a.copy(_v).divideScalar(h);
          const n = this.ctx.smash(p, 0.75 + Math.min(0.9, speed * 0.012), { vel, inherit: 0.55, outward: 3 });
          if (n > 0) {
            if (Math.random() < 0.3) this.say(LINES.wall);
            // every body part loses a little momentum per wall
            for (let j = 0; j < this.n; j++) {
              _b.subVectors(this.p[j], this.o[j]).multiplyScalar(0.06);
              this.o[j].add(_b);
            }
          }
          continue;
        }
      }
      const upN = vox.collideSphere(p, r);
      if (upN !== null) {
        _v.subVectors(p, o);
        _v.multiplyScalar(0.7);
        o.subVectors(p, _v);
      }
      if (p.y < r) {
        p.y = r;
        _v.subVectors(p, o);
        if (_v.y < 0) _v.y = -_v.y * 0.25;
        _v.x *= 0.82; _v.z *= 0.82;
        o.subVectors(p, _v);
      }
    }
  }

  // ------------------------------------------------------------ personality
  say(lines, force = false) {
    const now = performance.now();
    if (!force && now - this.lastSay < 1600) return;
    this.lastSay = now;
    this.speech = { text: Array.isArray(lines) ? lines[Math.floor(Math.random() * lines.length)] : lines, t: 2.4 };
  }

  // Called every frame with what the player is doing, to pick a mood and react.
  think(dt, ctx) {
    this.time += dt;
    if (this.speech) { this.speech.t -= dt; if (this.speech.t <= 0) this.speech = null; }
    this.player.copy(ctx.playerPos);
    const d = Math.hypot(ctx.playerPos.x - this.root.x, ctx.playerPos.z - this.root.z);
    const W = this.moodW;
    const want = { wave: 0, cower: 0, taunt: 0, dizzy: 0 };
    if (this.mode === 'stand') {
      this.moodT = Math.max(0, this.moodT - dt);
      const threatened = (ctx.charging && d < 14) || (ctx.laserNear && d < 40) || (ctx.speed > 40 && d < 20);
      if (threatened) {
        want.cower = 1;
        if (!this.wasThreat) this.say(ctx.laserNear ? LINES.laserNear : LINES.cower);
      } else if (this.mood === 'dizzy' && this.moodT > 0) want.dizzy = 1;
      else if (this.mood === 'taunt' && this.moodT > 0) want.taunt = 1;
      else if (this.mood === 'wave' && this.moodT > 0) want.wave = 1;
      else {
        if (this.mood === 'dizzy') { this.mood = 'taunt'; this.moodT = 2.2; this.say(LINES.taunt); }
        else this.mood = 'idle';
        if (d < 14 && this.greetReady) { this.greetReady = false; this.mood = 'wave'; this.moodT = 2.4; this.say(LINES.greet); }
      }
      if (d > 30) this.greetReady = true;
      this.wasThreat = threatened;
      // turn to face the player
      if (d < 35 && d > 0.5) {
        const target = Math.atan2(ctx.playerPos.x - this.root.x, ctx.playerPos.z - this.root.z);
        let dy = target - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.yaw += dy * Math.min(1, dt * (threatened ? 6 : 2.5));
      }
    }
    for (const k in W) W[k] += (want[k] - W[k]) * Math.min(1, dt * (k === 'cower' ? 9 : 5));
    if (this.mode === 'held' && this.time - this.heldSince > 2.5 && Math.random() < dt * 0.5) this.say(LINES.held);
    if (this.burn > 0 && ctx.laserOnMe && Math.random() < dt * 2) this.say(LINES.laser);
  }

  // Standing pose with mood layers blended in (local space, facing +Z).
  _localPose(i, out) {
    const name = NAMES[i], b = POSE[name], W = this.moodW, t = this.time;
    let x = b[0], y = b[1], z = b[2];
    const upper = ['head', 'neck', 'lsh', 'rsh', 'lel', 'rel', 'lha', 'rha'].includes(name);
    // breathing and a slow weight shift
    if (upper) { y += Math.sin(t * 1.8) * 0.008; x += Math.sin(t * 0.6) * 0.012; }
    const blend = (w, tx, ty, tz) => { if (w <= 0.001) return; x += (tx - b[0]) * w; y += (ty - b[1]) * w; z += (tz - b[2]) * w; };
    // wave hello with the right hand
    if (W.wave > 0) {
      if (name === 'rel') blend(W.wave, 0.36, 1.5, 0.05);
      if (name === 'rha') blend(W.wave, 0.4 + Math.sin(t * 11) * 0.09, 1.8, 0.08);
    }
    // cower: crouch, arms up over the face
    if (W.cower > 0) {
      const c = W.cower, dip = 0.24 * c;
      if (name === 'lha') blend(c, -0.07, 1.62, 0.2); if (name === 'rha') blend(c, 0.07, 1.6, 0.2);
      if (name === 'lel') blend(c, -0.24, 1.32, 0.22); if (name === 'rel') blend(c, 0.24, 1.3, 0.22);
      if (upper || name === 'lhp' || name === 'rhp') y -= dip;
      if (name === 'head') { z += 0.05 * c; x += Math.sin(t * 30) * 0.006 * c; }
      if (name === 'lkn' || name === 'rkn') { z += 0.16 * c; y -= 0.08 * c; }
    }
    // taunt: boxing guard and a bouncy hop
    if (W.taunt > 0) {
      const k = W.taunt, hop = Math.abs(Math.sin(t * 7)) * 0.07 * k, jab = Math.max(0, Math.sin(t * 3.5)) ** 8;
      if (name === 'lha') blend(k, -0.1, 1.38, 0.26 + jab * 0.22); if (name === 'rha') blend(k, 0.12, 1.33, 0.2);
      if (name === 'lel') blend(k, -0.26, 1.14, 0.14 + jab * 0.08); if (name === 'rel') blend(k, 0.28, 1.1, 0.1);
      if (name !== 'lft' && name !== 'rft') y += hop - 0.04 * k;
      if (name === 'lkn' || name === 'rkn') z += 0.05 * k;
    }
    // dizzy: head and shoulders circle
    if (W.dizzy > 0) {
      const k = W.dizzy;
      if (upper) { x += Math.sin(t * 5) * 0.05 * k * (name === 'head' ? 1.6 : 1); z += Math.cos(t * 5) * 0.05 * k * (name === 'head' ? 1.6 : 1); }
    }
    return out.set(x, y, z);
  }

  update(dt) {
    // burn tint
    if (this.burn > 0) {
      const k = Math.min(1, this.burn / 3);
      this.mats.forEach((m, i) => m.color.copy(this.baseColors[i]).lerp(_char, k * 0.85));
    } else this.mats.forEach((m, i) => m.color.copy(this.baseColors[i]));
    const P = this.p;
    const mid = _a.addVectors(P[ID.lhp], P[ID.rhp]).multiplyScalar(0.5);
    const sh = _b.addVectors(P[ID.lsh], P[ID.rsh]).multiplyScalar(0.5);
    _up.subVectors(sh, mid).normalize();
    _rt.subVectors(P[ID.rsh], P[ID.lsh]).add(_v.subVectors(P[ID.rhp], P[ID.lhp])).normalize();
    _fw.crossVectors(_rt, _up).normalize();
    _rt.crossVectors(_up, _fw).normalize();
    _mat.makeBasis(_rt, _up, _fw);
    const q = _q1.setFromRotationMatrix(_mat);
    this.torso.position.lerpVectors(mid, sh, 0.5).addScaledVector(_up, 0.04); this.torso.quaternion.copy(q);
    this.pelvis.position.copy(mid).addScaledVector(_up, -0.03); this.pelvis.quaternion.copy(q);
    // head: follow the torso, but look at the player while standing
    const hd = P[ID.head];
    _v.subVectors(hd, P[ID.neck]).normalize();
    const hf = _c.copy(_fw).addScaledVector(_v, -_fw.dot(_v)).normalize();
    const hr = _d.crossVectors(_v, hf).normalize();
    _mat.makeBasis(hr, _v, hf);
    const qh = _q2.setFromRotationMatrix(_mat);
    const lookW = this.mode === 'stand' ? 1 - this.moodW.cower * 0.7 - this.moodW.dizzy : 0;
    if (lookW > 0.01) {
      _e.copy(this.player); _e.y += 1.7;
      _mat.lookAt(_e, hd, _y);
      const ql = _q3.setFromRotationMatrix(_mat);
      // limit how far it can turn its head from the body
      if (qh.angleTo(ql) < 1.3) qh.slerp(ql, lookW * 0.85);
    }
    this.headQ.slerp(qh, Math.min(1, dt * 10));
    this.head.position.copy(hd); this.head.quaternion.copy(this.headQ);
    this.neckM.position.lerpVectors(hd, P[ID.neck], 0.62);
    this.neckM.quaternion.setFromUnitVectors(_y, _v);
    // face: blinking, darting pupils, brows and mouth show the mood
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 1.5 + Math.random() * 3.5;
    const blink = this.blinkT < 0 ? 0.12 : 1;
    const W = this.moodW, ragdoll = this.mode === 'ragdoll' || this.mode === 'held';
    const scared = Math.max(W.cower, ragdoll ? 1 : 0), angry = W.taunt, dizzy = W.dizzy;
    for (const e of this.eyesD) {
      const open = (1 + scared * 0.35) * blink;
      e.ball.scale.set(1 + scared * 0.25, open * (ragdoll ? 0.25 + Math.abs(Math.sin(this.time * 3)) * 0.2 : 1), 0.6);
      const sp = dizzy > 0.1 ? [Math.cos(this.time * 9 * e.sx) * 0.012, Math.sin(this.time * 9) * 0.012] : [Math.sin(this.time * 0.7 + e.sx) * 0.004, 0];
      e.pu.position.set(sp[0], sp[1], 0.017);
      e.pu.scale.setScalar(1 - scared * 0.35);
      e.brow.rotation.z = e.sx * (angry * 0.45 - scared * 0.35);
      e.brow.position.y = 0.078 + scared * 0.012 - angry * 0.006;
    }
    this.mouth.scale.set(1 - scared * 0.3 + angry * 0.2, 1 + scared * 3.5, 1);
    for (const [a, b, m] of this.limbs) {
      m.position.lerpVectors(P[a], P[b], 0.5);
      _v.subVectors(P[b], P[a]).normalize();
      m.quaternion.setFromUnitVectors(_y, _v);
    }
    for (const [i, g] of this.joints) { g.position.copy(P[i]); g.quaternion.copy(q); }
    for (const [i, g] of this.hands) {
      g.position.copy(P[i]);
      const el = i === ID.lha ? P[ID.lel] : P[ID.rel];
      _v.subVectors(P[i], el).normalize();
      g.quaternion.setFromUnitVectors(_yN, _v);
    }
    for (const [i, g] of this.feet) {
      g.position.copy(P[i]);
      const knee = i === ID.lft ? P[ID.lkn] : P[ID.rkn];
      _v.subVectors(knee, P[i]).normalize();
      const f = _c.copy(_fw).addScaledVector(_v, -_fw.dot(_v)).normalize();
      const r = _d.crossVectors(_v, f).normalize();
      _mat.makeBasis(r, _v, f);
      g.quaternion.setFromRotationMatrix(_mat);
    }
  }
}
