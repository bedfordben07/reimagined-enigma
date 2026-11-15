// The player android, modelled after the concept sketch: white shell, olive plate carrier,
// dark mechanical joints, orange-striped forearms and glowing yellow eyes.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { fabricTex, brushedMetalTex, paintedArmorTex, pbr } from './textures.js';

const lerpA = (a, b, k) => a + (b - a) * k;

export class Robot {
  constructor() {
    this.name = 'Android';
    this.eyeColor = new THREE.Color(1, 0.72, 0.12);
    this.eyeIntensity = 4;
    this.laserCore = new THREE.Color(12, 9, 4);
    this.laserGlow = new THREE.Color(3.5, 0.9, 0.1);
    this.build();
    this.phase = 0;
    this.punchFist = 0;
    this.hover = 0;
  }

  build() {
    // PBR set: painted shell, brushed gunmetal joints, matte cloth carrier, emissive eyes
    const white = pbr(paintedArmorTex(5, '#d9dedd', 0.42), { metalness: 1, clearcoat: 0.25, clearcoatRoughness: 0.5 }, THREE.MeshPhysicalMaterial);
    const dark = pbr(brushedMetalTex(31, '#2e3134', 0.35), { metalness: 0.85 });
    const joint = pbr(brushedMetalTex(32, '#5b6064', 0.38), { metalness: 0.85 });
    const fab = fabricTex(4);
    const olive = pbr(fab, { color: 0xc8d0b0, roughness: 0.85 / 0.95 });
    const oliveDark = pbr(fab, { color: 0xa3ab8c, roughness: 0.85 / 0.95 });
    const tan = new THREE.MeshStandardMaterial({ color: 0x9a9c84, roughness: 0.85, metalness: 0 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xc4634a, roughness: 0.7, metalness: 0 });
    const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.3, metalness: 0.2 });
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffc840, emissiveIntensity: 4, roughness: 0.2 });
    const redLed = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff3020, emissiveIntensity: 3, roughness: 0.3 });
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

  eyeWorld(i, out) { i %= this.eyes.length; this.eyes[i].updateWorldMatrix(true, false); return out.setFromMatrixPosition(this.eyes[i].matrixWorld); }

  // s: {dt, flying, grounded, hSpeed, fwdSpeed, sideSpeed, vSpeed, boost, aimPitch, aimYawRel, charge, punchT, holding, throwT, laser}
  // Procedural animation. s: {dt, flying, grounded, hSpeed, fwdSpeed, sideSpeed, vSpeed, boost, aimPitch,
  // aimYawRel, turnRate, charge (0..1+), punchT (1 -> 0), holding, throwWind (0 -> 1), throwT (1 -> 0), laser}
  animate(s) {
    const dt = s.dt;
    this.t = (this.t || 0) + dt;
    const t = this.t;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const sstep = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
    // pose targets
    const P = {
      bodyY: 1.15, bodyX: 0, bodyZ: 0, bodyYaw: 0, spineX: 0, spineY: 0, chestY: 0, chestX: 0, headX: 0, headY: 0, headZ: 0,
      L: { sx: 0.05, sy: 0, sz: -0.1, el: -0.15, curl: 0.25 }, R: { sx: 0.05, sy: 0, sz: 0.1, el: -0.15, curl: 0.25 },
      lHip: 0, rHip: 0, lHipZ: 0, rHipZ: 0, lKn: 0.05, rKn: 0.05, lAn: 0, rAn: 0,
    };
    let rate = 10, armRate = 12, jet = 0;

    if (s.flying) {
      this.hover += dt;
      const f = clamp(s.fwdSpeed / 90, 0, 1);
      const cruise = sstep(f / 0.35);        // 0 = hovering, 1 = travelling
      const fast = sstep((f - 0.35) / 0.4);  // horizontal superhero flight
      const bank = clamp(-s.sideSpeed / 35 - s.turnRate * 0.35, -0.85, 0.85);
      // hovering idle: upright and slightly reclined, arms spread with open hands, one knee drawn up
      const bob = Math.sin(t * 1.7), sway = Math.sin(t * 0.83);
      const hover = {
        bodyX: -0.1 + bob * 0.02, bodyZ: sway * 0.05, bodyY: 1.15 + bob * 0.07,
        L: { sx: -0.35 + sway * 0.06, sy: -0.3, sz: -0.75 - bob * 0.05, el: -0.45, curl: 0.05 },
        R: { sx: -0.25 - sway * 0.06, sy: 0.3, sz: 0.65 + bob * 0.05, el: -0.55, curl: 0.05 },
        lHip: -0.08 + bob * 0.03, rHip: 0.2, lKn: 0.18, rKn: 0.75 + bob * 0.05, lAn: 0.45, rAn: 0.55, headX: -0.12,
      };
      // gliding: body tips into travel, arms trail back along the sides, legs together with pointed toes
      const glide = {
        bodyX: 0.25 + fast * 1.25, bodyZ: bank, bodyY: 1.15,
        L: { sx: 0.25 - fast * 0.1, sy: 0, sz: -0.22 - (1 - fast) * 0.2, el: -0.2, curl: 0.15 },
        R: { sx: 0.25 - fast * 0.1, sy: 0, sz: 0.22 + (1 - fast) * 0.2, el: -0.2, curl: 0.15 },
        lHip: -0.05 + Math.sin(t * 5) * 0.04 * fast, rHip: -0.05 - Math.sin(t * 5) * 0.04 * fast,
        lKn: 0.15 + (1 - fast) * 0.2, rKn: 0.3 + (1 - fast) * 0.25, lAn: 0.65, rAn: 0.65, headX: -0.25 - fast * 0.9,
      };
      const mix = (a, b) => a + (b - a) * cruise;
      P.bodyX = mix(hover.bodyX, glide.bodyX); P.bodyZ = mix(hover.bodyZ, glide.bodyZ); P.bodyY = mix(hover.bodyY, glide.bodyY);
      for (const k of ['sx', 'sy', 'sz', 'el', 'curl']) { P.L[k] = mix(hover.L[k], glide.L[k]); P.R[k] = mix(hover.R[k], glide.R[k]); }
      for (const k of ['lHip', 'rHip', 'lKn', 'rKn', 'lAn', 'rAn', 'headX']) P[k] = mix(hover[k], glide[k]);
      // climbing / diving while slow
      const vy = clamp(s.vSpeed / 25, -1, 1) * (1 - cruise);
      P.bodyX -= vy * 0.2; P.headX -= vy * 0.3;
      if (vy < 0) { P.lKn += -vy * 0.6; P.rKn += -vy * 0.4; P.lHip += -vy * 0.4; P.rHip += -vy * 0.3; }
      P.bodyX = Math.max(P.bodyX, -0.4) + (fast > 0 ? 0 : 0);
      if (s.boost && s.fwdSpeed > 40) { // flying-fist pose at super speed
        P.R = { sx: -Math.PI + 0.05, sy: 0, sz: 0.1, el: 0, curl: 1 };
        P.L = { sx: 0.12, sy: 0, sz: -0.14, el: -0.05, curl: 0.4 };
      }
      jet = 0.3 + f * 0.7;
      rate = 6; armRate = 7;
    } else if (!s.grounded) {
      // jumping / falling: knees tuck on the way up, legs reach for the ground coming down
      const up = clamp(s.vSpeed / 12, -1, 1);
      P.lHip = 0.5 * Math.max(0, up) + 0.15; P.rHip = 0.1; P.lKn = 0.9 * Math.max(0, up) + 0.25; P.rKn = 0.45;
      P.L.sx = -0.6 - up * 0.3; P.R.sx = -0.4 - up * 0.3; P.L.sz = -0.5; P.R.sz = 0.5; P.L.el = -0.6; P.R.el = -0.6;
      P.bodyX = 0.1 - up * 0.08; P.lAn = 0.3; P.rAn = 0.3;
    } else {
      const sp = s.hSpeed;
      const a = sstep(sp / 4), sprint = sstep((sp - 9) / 8);
      this.phase += dt * (2.2 + sp * 0.78);
      const ph = this.phase;
      if (a > 0.01) {
        // run cycle: long stride, high knee recovery, pumping arms, hips and shoulders counter-rotating
        const stride = 0.55 + 0.4 * sprint;
        const lS = Math.sin(ph), rS = Math.sin(ph + Math.PI);
        const lC = Math.cos(ph), rC = Math.cos(ph + Math.PI);
        P.lHip = lS * stride * a; P.rHip = rS * stride * a;
        P.lKn = a * (0.15 + (0.75 + 0.65 * sprint) * Math.max(0, lC)) + 0.05;
        P.rKn = a * (0.15 + (0.75 + 0.65 * sprint) * Math.max(0, rC)) + 0.05;
        P.lAn = a * (-0.25 * lS + 0.35 * Math.max(0, lC));
        P.rAn = a * (-0.25 * rS + 0.35 * Math.max(0, rC));
        P.L.sx = -rS * (0.75 + 0.35 * sprint) * a; P.R.sx = -lS * (0.75 + 0.35 * sprint) * a;
        P.L.el = -0.25 - a * (1.05 + 0.2 * sprint) + rS * 0.25 * a; P.R.el = -0.25 - a * (1.05 + 0.2 * sprint) + lS * 0.25 * a;
        P.L.sz = -0.12; P.R.sz = 0.12; P.L.curl = P.R.curl = 0.7;
        P.bodyX = a * (0.1 + 0.25 * sprint);
        P.bodyY = 1.15 - 0.05 * a + Math.abs(lC) * 0.07 * a;
        P.bodyYaw = -lS * 0.12 * a; P.chestY = lS * 0.22 * a;
        P.bodyZ = clamp(-s.turnRate * 0.06, -0.15, 0.15);
        P.headX = -P.bodyX * 0.6;
        rate = 16; armRate = 16;
      } else {
        // standing: slow breathing, weight shifting, arms loose
        const br = Math.sin(t * 1.6);
        P.chestX = br * 0.025; P.bodyY = 1.15 + br * 0.006; P.bodyZ = Math.sin(t * 0.5) * 0.015;
        P.L.sz = -0.12 - br * 0.02; P.R.sz = 0.12 + br * 0.02; P.L.el = P.R.el = -0.2;
        P.lKn = 0.06; P.rKn = 0.1;
      }
    }

    // head follows the aim when attacking
    const aim = s.aimPitch;
    if (s.laser || s.charge > 0 || s.punchT > 0) P.headX = clamp(-aim - P.bodyX, -1.1, 0.9);
    P.headY = clamp(s.aimYawRel, -1.1, 1.1);

    // charged punch: the whole body coils with tension, trembling harder the longer it's held
    if (s.charge > 0) {
      const c = Math.min(1, s.charge), shake = (Math.random() - 0.5) * 0.05 * c * c;
      P.spineX = 0.38 * c + shake; P.chestY = 0.6 * c + shake; P.chestX = 0.12 * c; P.bodyYaw = 0.25 * c;
      P.R = { sx: 0.85 + 0.45 * c, sy: 0.2, sz: 0.35, el: -2.35, curl: 1 };
      P.L = { sx: -1.05, sy: -0.2, sz: -0.25, el: -1.7, curl: 0.8 };
      if (s.flying) { P.lHip = 0.7 * c; P.rHip = 0.45 * c; P.lKn = 1.1 * c; P.rKn = 0.9 * c; P.bodyX = -0.15 * c; }
      else { P.bodyY = 1.15 - 0.2 * c; P.lHip = 0.55 * c; P.rHip = -0.1; P.lKn = 0.8 * c; P.rKn = 0.55 * c + 0.1; P.lAn = -0.25 * c; P.bodyX = 0.15 * c; }
      P.headX += 0.1 * c;
      rate = 9; armRate = 10;
    }
    // release: snap open, drive the hip and shoulder through, lunge into the fist
    let snap = false;
    if (s.punchT > 0) {
      const u = 1 - s.punchT;
      const ext = u < 0.12 ? sstep(u / 0.12) : 1;
      const rec = u > 0.65 ? sstep((u - 0.65) / 0.35) : 0;
      const k = ext * (1 - rec);
      P.R = { sx: -Math.PI / 2 - aim - P.bodyX, sy: 0, sz: 0.04, el: 0, curl: 1 };
      P.L = { sx: 0.75 * k, sy: 0, sz: -0.3, el: -1.5 * k, curl: 0.9 };
      P.chestY = -0.6 * k; P.bodyYaw = -0.25 * k; P.spineX = 0.18 * k; P.chestX = 0.06 * k;
      P.bodyX += 0.2 * k;
      if (!s.flying && s.grounded) { P.lHip = 0.55 * k; P.lKn = 0.45 * k; P.rHip = -0.5 * k; P.rKn = 0.12; P.bodyY = 1.15 - 0.12 * k; P.lAn = -0.2 * k; P.rAn = 0.35 * k; }
      if (s.flying) { P.lHip = -0.1; P.rHip = -0.3 * k; P.lKn = 0.2; P.rKn = 0.1; }
      snap = u < 0.2;
      if (u >= 0.65) { rate = 8; armRate = 8; }
    }
    // carrying the dummy overhead with the left hand
    if (s.holding && !(s.throwWind > 0)) { P.L = { sx: -2.7 + Math.sin(t * 3) * 0.03, sy: 0, sz: -0.15, el: -0.25, curl: 1 }; P.spineX -= 0.05; }
    // throw wind-up: lean and twist back, cock the arm behind the head, counterbalance with the right arm
    if (s.throwWind > 0) {
      const w = sstep(s.throwWind);
      P.L = { sx: -2.7 - 0.85 * w, sy: 0.2 * w, sz: -0.25, el: -0.25 - 0.5 * w, curl: 1 };
      P.R = { sx: -1.1 * w, sy: 0, sz: 0.35, el: -0.4, curl: 0.4 };
      P.chestY = -0.75 * w; P.bodyYaw = -0.3 * w; P.spineX = -0.3 * w; P.bodyX += -0.15 * w;
      if (!s.flying && s.grounded) { P.rHip = 0.35 * w; P.rKn = 0.35 * w; P.lHip = -0.35 * w; P.lKn = 0.5 * w; P.bodyY = 1.15 - 0.1 * w; }
      rate = 14; armRate = 14;
    }
    // throw release: whip the arm through and fold forward over the front leg
    if (s.throwT > 0) {
      const u = 1 - s.throwT;
      const k = u < 0.6 ? 1 : 1 - sstep((u - 0.6) / 0.4);
      P.L = { sx: -0.25 * k + P.L.sx * (1 - k), sy: -0.3 * k, sz: -0.2, el: -0.05, curl: 0.1 };
      P.R = { sx: 0.8 * k, sy: 0, sz: 0.3, el: -0.9 * k, curl: 0.5 };
      P.chestY = 0.7 * k; P.bodyYaw = 0.3 * k; P.spineX = 0.4 * k; P.bodyX += 0.25 * k;
      if (!s.flying && s.grounded) { P.lHip = 0.6 * k; P.lKn = 0.4 * k; P.rHip = -0.55 * k; P.rKn = 0.15; P.bodyY = 1.15 - 0.15 * k; P.rAn = 0.4 * k; }
      snap = u < 0.25;
    }

    // apply with smoothing (snapping for explosive moments)
    const ka = snap ? 1 : Math.min(1, dt * armRate), kb = snap ? Math.min(1, dt * 30) : Math.min(1, dt * rate);
    const L = (o, key, v, k) => { o[key] = lerpA(o[key], v, k); };
    L(this.body.position, 'y', P.bodyY, kb);
    L(this.body.rotation, 'x', P.bodyX, kb); L(this.body.rotation, 'z', P.bodyZ, kb); L(this.body.rotation, 'y', P.bodyYaw, kb);
    L(this.spine.rotation, 'x', P.spineX, kb); L(this.spine.rotation, 'y', P.spineY, kb);
    L(this.chest.rotation, 'y', P.chestY, kb); L(this.chest.rotation, 'x', P.chestX, kb);
    L(this.head.rotation, 'x', P.headX, Math.min(1, dt * 10));
    L(this.neck.rotation, 'y', P.headY - P.chestY - P.bodyYaw, Math.min(1, dt * 10));
    for (const [side, A] of [[-1, P.L], [1, P.R]]) {
      const a = this.arms[side];
      L(a.sh.rotation, 'x', A.sx, ka); L(a.sh.rotation, 'y', A.sy, ka); L(a.sh.rotation, 'z', A.sz, ka);
      L(a.el.rotation, 'x', A.el, ka);
      L(a.fingers.rotation, 'x', -A.curl * 1.7, Math.min(1, dt * 14));
    }
    const lg = this.legs;
    L(lg[-1].hip.rotation, 'x', -P.lHip, kb); L(lg[1].hip.rotation, 'x', -P.rHip, kb);
    L(lg[-1].kn.rotation, 'x', P.lKn, kb); L(lg[1].kn.rotation, 'x', P.rKn, kb);
    L(lg[-1].an.rotation, 'x', P.lAn, kb); L(lg[1].an.rotation, 'x', P.rAn, kb);
    this.punchFist = P.R.curl;

    this.jetMat.opacity = lerpA(this.jetMat.opacity, jet * (0.55 + Math.random() * 0.2), Math.min(1, dt * 12));
    for (const side of [-1, 1]) lg[side].jet.scale.set(1, 0.6 + jet * 1.4 + Math.random() * 0.2, 1);
    const eyeBoost = s.laser ? 2.2 : 1 + (s.charge > 0 ? Math.min(1, s.charge) * 0.6 : 0);
    this.eyeMat.emissive.copy(this.eyeColor).multiplyScalar(1 / Math.max(this.eyeColor.r, this.eyeColor.g, this.eyeColor.b));
    this.eyeMat.emissiveIntensity = this.eyeIntensity * eyeBoost;
  }
}
