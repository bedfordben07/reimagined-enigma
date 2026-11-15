// The player android, modelled after the concept sketch: white shell, olive plate carrier,
// dark mechanical joints, orange-striped forearms and glowing yellow eyes.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { scuffTex, fabricTex } from './textures.js';

const lerpA = (a, b, k) => a + (b - a) * k;

export class Robot {
  constructor() {
    const white = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: scuffTex(5, '#d9dedd'), roughness: 0.42, metalness: 0.0, clearcoat: 0.35, clearcoatRoughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.38, metalness: 0.75 });
    const joint = new THREE.MeshStandardMaterial({ color: 0x5b6064, roughness: 0.42, metalness: 0.7 });
    const fab = fabricTex(4);
    const olive = new THREE.MeshStandardMaterial({ color: 0xc8d0b0, map: fab.map, normalMap: fab.normalMap, roughness: 0.95 });
    const oliveDark = new THREE.MeshStandardMaterial({ color: 0xa3ab8c, map: fab.map, normalMap: fab.normalMap, roughness: 0.95 });
    const tan = new THREE.MeshStandardMaterial({ color: 0x9a9c84, roughness: 0.9 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xc4634a, roughness: 0.75 });
    const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.3, metalness: 0.2 });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.6, 0.6) });
    const redLed = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.5, 0.3) });
    this.jetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 0.8), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });

    const M = (geo, mat, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
      parent.add(m); return m;
    };
    const RB = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 3, r);
    const CylX = (r, l, seg = 20) => { const g = new THREE.CylinderGeometry(r, r, l, seg); g.rotateZ(Math.PI / 2); return g; };

    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.body.position.y = 1.15; this.root.add(this.body);

    // hips
    M(RB(0.46, 0.24, 0.3, 0.07), white, this.body, 0, 0, 0);
    M(RB(0.16, 0.16, 0.05, 0.02), joint, this.body, 0, -0.02, 0.15);
    // spine
    this.spine = new THREE.Group(); this.spine.position.y = 0.12; this.body.add(this.spine);
    M(new THREE.CylinderGeometry(0.13, 0.15, 0.22, 20), joint, this.spine, 0, 0.08, 0);
    for (const sx of [-0.09, 0.09]) M(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 8), dark, this.spine, sx, 0.08, 0.12);
    // chest
    this.chest = new THREE.Group(); this.chest.position.y = 0.22; this.spine.add(this.chest);
    M(RB(0.5, 0.52, 0.34, 0.09), white, this.chest, 0, 0.24, 0);
    // plate carrier
    M(RB(0.58, 0.46, 0.4, 0.05), olive, this.chest, 0, 0.24, 0.01);
    M(RB(0.5, 0.06, 0.03, 0.01), tan, this.chest, 0, 0.36, 0.215);
    M(RB(0.4, 0.04, 0.03, 0.01), tan, this.chest, -0.03, 0.29, 0.215);
    for (let i = 0; i < 4; i++) {
      const x = -0.195 + i * 0.13;
      M(RB(0.12, 0.17, 0.07, 0.02), oliveDark, this.chest, x, 0.12, 0.235);
      M(RB(0.122, 0.05, 0.075, 0.015), olive, this.chest, x, 0.2, 0.24);
      M(new THREE.BoxGeometry(0.02, 0.06, 0.01), tan, this.chest, x, 0.17, 0.276);
    }
    // shoulder straps and back panel
    for (const sx of [-0.17, 0.17]) M(RB(0.1, 0.06, 0.38, 0.02), olive, this.chest, sx, 0.48, 0.0);
    M(RB(0.5, 0.4, 0.06, 0.02), oliveDark, this.chest, 0, 0.26, -0.21);
    // collar
    M(new THREE.TorusGeometry(0.11, 0.035, 10, 24), joint, this.chest, 0, 0.5, 0).rotation.x = Math.PI / 2;

    // neck + head
    this.neck = new THREE.Group(); this.neck.position.y = 0.5; this.chest.add(this.neck);
    M(new THREE.CylinderGeometry(0.06, 0.075, 0.16, 14), joint, this.neck, 0, 0.06, 0);
    for (const sx of [-0.05, 0.05]) M(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 8), dark, this.neck, sx, 0.06, 0.05);
    this.head = new THREE.Group(); this.head.position.y = 0.16; this.neck.add(this.head);
    const skull = M(new THREE.SphereGeometry(0.19, 40, 30), white, this.head, 0, 0.1, 0);
    skull.scale.set(0.86, 1.08, 0.92);
    M(new THREE.SphereGeometry(0.15, 30, 20), white, this.head, 0, 0.02, 0.03).scale.set(0.82, 0.7, 0.95);
    this.eyes = [];
    for (const sx of [-0.068, 0.068]) {
      const sock = M(new THREE.CylinderGeometry(0.044, 0.04, 0.05, 20), black, this.head, sx, 0.11, 0.152);
      sock.rotation.x = Math.PI / 2 - 0.12;
      const eye = M(new THREE.SphereGeometry(0.026, 16, 12), this.eyeMat, this.head, sx, 0.112, 0.172);
      eye.castShadow = false;
      this.eyes.push(eye);
    }
    M(new THREE.BoxGeometry(0.07, 0.006, 0.01), black, this.head, 0, 0.0, 0.163);

    // arms
    this.arms = {};
    for (const side of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(0.33 * side, 0.4, 0); this.chest.add(sh);
      M(CylX(0.085, 0.16), joint, sh, 0.03 * side, 0, 0);
      M(RB(0.1, 0.16, 0.12, 0.02), dark, sh, 0.06 * side, -0.06, 0);
      if (side === 1) {
        const pad = M(RB(0.22, 0.12, 0.26, 0.05), oliveDark, sh, 0.06, 0.06, 0);
        pad.rotation.z = -0.35;
        M(RB(0.08, 0.05, 0.12, 0.01), tan, pad, 0.03, 0.05, 0.0);
      }
      M(RB(0.15, 0.36, 0.16, 0.05), white, sh, 0.06 * side, -0.26, 0);
      M(RB(0.06, 0.08, 0.02, 0.01), tan, sh, 0.06 * side + 0.07 * side, -0.2, 0.03).rotation.y = Math.PI / 2;
      const el = new THREE.Group(); el.position.set(0.06 * side, -0.47, 0); sh.add(el);
      M(CylX(0.068, 0.13), dark, el, 0, 0, 0);
      M(new THREE.CylinderGeometry(0.1, 0.112, 0.4, 24), white, el, 0, -0.24, 0);
      M(new THREE.CylinderGeometry(0.115, 0.115, 0.1, 24), orange, el, 0, -0.21, 0);
      M(new THREE.CylinderGeometry(0.105, 0.098, 0.06, 24), dark, el, 0, -0.46, 0);
      const hand = new THREE.Group(); hand.position.set(0, -0.5, 0); el.add(hand);
      M(RB(0.12, 0.14, 0.07, 0.02), dark, hand, 0, -0.07, 0);
      M(new THREE.BoxGeometry(0.03, 0.012, 0.01), redLed, hand, 0.0, -0.04, 0.037);
      const fingers = new THREE.Group(); fingers.position.set(0, -0.14, 0); hand.add(fingers);
      for (let f = 0; f < 4; f++) {
        const g = M(RB(0.026, 0.1, 0.034, 0.008), dark, fingers, -0.045 + f * 0.03, -0.05, 0);
        g.scale.y = f === 0 || f === 3 ? 0.85 : 1;
      }
      const thumb = M(RB(0.026, 0.08, 0.03, 0.008), dark, hand, -0.065 * side, -0.08, 0.03);
      thumb.rotation.z = 0.5 * side;
      this.arms[side] = { sh, el, hand, fingers };
    }

    // legs
    this.legs = {};
    for (const side of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(0.15 * side, -0.06, 0); this.body.add(hip);
      M(CylX(0.08, 0.12), dark, hip, 0, 0, 0);
      M(RB(0.06, 0.16, 0.08, 0.02), joint, hip, 0.02 * side, -0.08, 0.05);
      M(RB(0.19, 0.4, 0.21, 0.06), white, hip, 0, -0.27, 0);
      const kn = new THREE.Group(); kn.position.set(0, -0.5, 0); hip.add(kn);
      M(CylX(0.085, 0.16, 24), dark, kn, 0, 0, 0);
      M(CylX(0.06, 0.18, 16), joint, kn, 0, 0, 0);
      M(RB(0.17, 0.38, 0.19, 0.05), white, kn, 0, -0.24, 0);
      M(RB(0.06, 0.05, 0.02, 0.01), tan, kn, 0, -0.32, 0.1);
      const an = new THREE.Group(); an.position.set(0, -0.47, 0); kn.add(an);
      for (const sx of [-0.04, 0.04]) M(RB(0.03, 0.12, 0.05, 0.01), dark, an, sx, 0.0, 0);
      M(RB(0.15, 0.05, 0.28, 0.02), dark, an, 0, -0.06, 0.04);
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 16, 1, true), this.jetMat);
      jet.rotation.x = Math.PI; jet.position.set(0, -0.35, 0.02);
      an.add(jet);
      this.legs[side] = { hip, kn, an, jet };
    }

    this.phase = 0;
    this.punchFist = 0;
    this.hover = 0;
  }

  handWorld(side, out) {
    const h = this.arms[side].hand;
    h.updateWorldMatrix(true, false);
    return out.set(0, -0.1, 0).applyMatrix4(h.matrixWorld);
  }

  eyeWorld(i, out) { this.eyes[i].updateWorldMatrix(true, false); return out.setFromMatrixPosition(this.eyes[i].matrixWorld); }

  // s: {dt, flying, grounded, hSpeed, fwdSpeed, sideSpeed, vSpeed, boost, aimPitch, aimYawRel, charge, punchT, holding, throwT, laser}
  animate(s) {
    const k = Math.min(1, s.dt * 12);
    const kk = Math.min(1, s.dt * 6);
    let bodyPitch = 0, bodyRoll = 0;
    const L = { sx: 0, sz: -0.08, el: -0.12 }, R = { sx: 0, sz: 0.08, el: -0.12 };
    let lHip = 0, rHip = 0, lKn = 0, rKn = 0, chestYaw = 0, spinePitch = 0;
    let headX = 0, headY = 0;
    let jet = 0;

    if (s.flying) {
      this.hover += s.dt;
      const f = Math.min(1, Math.max(0, s.fwdSpeed / 90));
      bodyPitch = f * 1.4 + Math.min(0.25, s.fwdSpeed / 60) * 0.3;
      bodyRoll = -Math.max(-0.6, Math.min(0.6, s.sideSpeed / 40));
      bodyPitch -= Math.max(-0.3, Math.min(0.3, s.vSpeed / 60)) * (1 - f);
      const bob = Math.sin(this.hover * 2.2);
      lHip = 0.12 + bob * 0.05 + f * 0.1; rHip = -0.05 - bob * 0.05 + f * 0.15;
      lKn = 0.35 - f * 0.25; rKn = 0.6 - f * 0.45;
      L.sx = -0.15 + f * 0.2; L.sz = -0.25 + f * 0.15; L.el = -0.35;
      R.sx = -0.15 + f * 0.2; R.sz = 0.25 - f * 0.15; R.el = -0.35;
      if (s.boost && s.fwdSpeed > 40) { // classic flying-fist pose
        R.sx = -Math.PI + 0.05; R.sz = 0.12; R.el = 0; this.punchFist = 1;
        L.sx = 0.1; L.sz = -0.12; L.el = -0.05;
      }
      jet = 0.25 + f * 0.75;
    } else {
      const sp = s.hSpeed;
      this.phase += s.dt * (2 + sp * 0.75);
      const a = Math.min(1, sp / 6);
      const ph = this.phase;
      if (!s.grounded) { lHip = -0.5; rHip = 0.3; lKn = 0.9; rKn = 0.4; L.sx = -0.4; R.sx = -0.4; L.sz = -0.5; R.sz = 0.5; }
      else {
        lHip = Math.sin(ph) * 0.65 * a; rHip = -Math.sin(ph) * 0.65 * a;
        lKn = Math.max(0, -Math.cos(ph)) * 1.0 * a + 0.05; rKn = Math.max(0, Math.cos(ph)) * 1.0 * a + 0.05;
        L.sx = -lHip * 0.7; R.sx = -rHip * 0.7; L.el = -0.15 - a * 0.3; R.el = -0.15 - a * 0.3;
        bodyPitch = a * 0.12;
        this.body.position.y = 1.15 + Math.abs(Math.sin(ph)) * 0.05 * a - 0.04 * a;
      }
    }
    if (s.flying || !s.grounded) this.body.position.y = lerpA(this.body.position.y, 1.15, k);

    // aim: face the target with head
    const localAim = s.aimPitch;
    if (s.laser || s.charge > 0 || s.punchT > 0) {
      headX = Math.max(-1.1, Math.min(0.9, -localAim - bodyPitch));
    } else headX = -bodyPitch * 0.6;
    headY = Math.max(-1.1, Math.min(1.1, s.aimYawRel));

    // punch
    let fist = s.boost && s.flying ? 1 : 0.25;
    if (s.charge > 0) {
      const c = Math.min(1, s.charge);
      R.sx = 0.7 + c * 0.3; R.sz = 0.35; R.el = -2.1;
      chestYaw = 0.4 * c; fist = 1; spinePitch = -0.1;
    }
    if (s.punchT > 0) {
      const t = s.punchT; // 1 -> 0
      const ext = t > 0.25 ? 1 : t / 0.25;
      R.sx = lerpA(R.sx, -Math.PI / 2 - localAim - bodyPitch, ext);
      R.sz = lerpA(R.sz, 0.05, ext); R.el = lerpA(R.el, 0, ext);
      chestYaw = -0.45 * ext; spinePitch = 0.12 * ext; fist = 1;
      L.sx = 0.5 * ext; L.el = -1.2 * ext;
    }
    if (s.holding) { L.sx = -2.7 + Math.sin(this.hover * 3) * 0.03; L.sz = -0.15; L.el = -0.25; }
    if (s.throwT > 0) { const t = s.throwT; L.sx = lerpA(-1.0, -2.7, t); L.el = -0.1; chestYaw = -0.3 * t; }
    this.punchFist = lerpA(this.punchFist, fist, k);

    this.body.rotation.x = lerpA(this.body.rotation.x, bodyPitch, kk);
    this.body.rotation.z = lerpA(this.body.rotation.z, bodyRoll, kk);
    this.spine.rotation.x = lerpA(this.spine.rotation.x, spinePitch, k);
    this.chest.rotation.y = lerpA(this.chest.rotation.y, chestYaw, k);
    this.head.rotation.x = lerpA(this.head.rotation.x, headX, k);
    this.neck.rotation.y = lerpA(this.neck.rotation.y, headY - chestYaw, k);
    const fast = s.punchT > 0.25 ? 1 : k;
    for (const [side, P] of [[-1, L], [1, R]]) {
      const a = this.arms[side];
      const kp = side === 1 ? fast : k;
      a.sh.rotation.x = lerpA(a.sh.rotation.x, P.sx, kp);
      a.sh.rotation.z = lerpA(a.sh.rotation.z, P.sz, kp);
      a.el.rotation.x = lerpA(a.el.rotation.x, P.el, kp);
      const curl = side === 1 ? this.punchFist : (s.holding ? 1 : 0.25);
      a.fingers.rotation.x = lerpA(a.fingers.rotation.x, -curl * 1.7, k);
    }
    const lg = this.legs;
    lg[-1].hip.rotation.x = lerpA(lg[-1].hip.rotation.x, -lHip, k);
    lg[1].hip.rotation.x = lerpA(lg[1].hip.rotation.x, -rHip, k);
    lg[-1].kn.rotation.x = lerpA(lg[-1].kn.rotation.x, lKn, k);
    lg[1].kn.rotation.x = lerpA(lg[1].kn.rotation.x, rKn, k);
    this.jetMat.opacity = lerpA(this.jetMat.opacity, jet * (0.55 + Math.random() * 0.2), k);
    for (const side of [-1, 1]) lg[side].jet.scale.set(1, 0.6 + jet * 1.4 + Math.random() * 0.2, 1);
    const eyeBoost = s.laser ? 2.2 : 1;
    this.eyeMat.color.setRGB(5 * eyeBoost, 3.6 * eyeBoost, 0.6 * eyeBoost);
  }
}
