// Spectre V-01: purple armoured mecha with a teal armoured poncho cape, small helmet with a
// red mono-eye and gold ear rings, gold neck pistons, bulky purple arms with black clawed
// gauntlets (gatling unit on the right forearm), tan trousers and gunmetal track-heel feet.
// Shares the Robot animation rig; only the model differs.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Robot } from './robot.js';
import { scuffTex, fabricTex } from './textures.js';

export class Spectre extends Robot {
  constructor() {
    super();
    this.name = 'Spectre V-01';
    this.eyeColor = new THREE.Color(9, 0.7, 0.45);
    this.laserCore = new THREE.Color(12, 3.2, 2.4);
    this.laserGlow = new THREE.Color(4, 0.25, 0.12);
  }

  build() {
    const purple = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: scuffTex(9, '#a79fcf'), roughness: 0.55, metalness: 0.05, clearcoat: 0.15, clearcoatRoughness: 0.6 });
    const gun = new THREE.MeshStandardMaterial({ color: 0x2b3236, roughness: 0.4, metalness: 0.75 });
    const black = new THREE.MeshStandardMaterial({ color: 0x14181b, roughness: 0.45, metalness: 0.5 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0a640, roughness: 0.28, metalness: 1 });
    const tanF = fabricTex(21, '#a99a82');
    const tan = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tanF.map, normalMap: tanF.normalMap, roughness: 0.9 });
    const tealF = fabricTex(22, '#4a92a0');
    for (const t of [tealF.map, tealF.normalMap]) t.repeat.set(2, 2);
    const teal = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tealF.map, normalMap: tealF.normalMap, roughness: 0.85, normalScale: new THREE.Vector2(0.4, 0.4), side: THREE.DoubleSide });
    const capeIn = new THREE.MeshStandardMaterial({ color: 0x0f1416, roughness: 0.9, side: THREE.BackSide });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 0.7, 0.45) });
    this.jetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.6, 0.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });

    const M = (geo, mat, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
      parent.add(m); return m;
    };
    const RB = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 3, r);
    const CylX = (r, l, seg = 20) => { const g = new THREE.CylinderGeometry(r, r, l, seg); g.rotateZ(Math.PI / 2); return g; };
    const Taper = (r1, r2, l, seg = 24) => new THREE.CylinderGeometry(r1, r2, l, seg);

    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.body.position.y = 1.15; this.root.add(this.body);

    // pelvis + belt with gold buckle
    M(RB(0.4, 0.22, 0.28, 0.07), tan, this.body, 0, -0.02, 0);
    M(Taper(0.215, 0.215, 0.09, 32), black, this.body, 0, 0.09, 0);
    M(RB(0.09, 0.07, 0.03, 0.01), gold, this.body, 0, 0.09, 0.215);
    M(new THREE.TorusGeometry(0.02, 0.008, 8, 16), black, this.body, 0, 0.09, 0.232);

    this.spine = new THREE.Group(); this.spine.position.y = 0.12; this.body.add(this.spine);
    M(Taper(0.14, 0.17, 0.22, 20), black, this.spine, 0, 0.08, 0);
    for (const sx of [-0.08, 0.08]) M(Taper(0.02, 0.02, 0.24, 8), gun, this.spine, sx, 0.08, 0.14);

    this.chest = new THREE.Group(); this.chest.position.y = 0.22; this.spine.add(this.chest);
    // broad armoured torso
    M(RB(0.64, 0.56, 0.44, 0.12), purple, this.chest, 0, 0.26, 0);
    M(RB(0.92, 0.2, 0.46, 0.09), purple, this.chest, 0, 0.47, -0.01);
    M(RB(0.32, 0.26, 0.05, 0.03), black, this.chest, 0, 0.22, 0.215);
    M(new THREE.SphereGeometry(0.03, 12, 8), gun, this.chest, -0.2, 0.36, 0.22);
    M(new THREE.SphereGeometry(0.03, 12, 8), gun, this.chest, 0.2, 0.36, 0.22);
    // high dark collar
    M(new THREE.CylinderGeometry(0.17, 0.25, 0.22, 28, 1, true), capeIn, this.chest, 0, 0.62, -0.02);
    M(new THREE.CylinderGeometry(0.17, 0.25, 0.22, 28, 1, true), teal, this.chest, 0, 0.62, -0.02).scale.setScalar(1.04);

    // cape: hangs from the shoulders, open at the front, with folds
    this.cape = new THREE.Group(); this.cape.position.set(0, 0.6, -0.02); this.chest.add(this.cape);
    {
      const h = 1.2;
      const gap = 0.62;
      const g = new THREE.CylinderGeometry(0.66, 0.9, h, 56, 10, true, gap, Math.PI * 2 - gap * 2);
      g.translate(0, -h / 2, 0);
      const p = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const t = -v.y / h;
        const th = Math.atan2(v.x, v.z);
        const fold = 1 + t * 0.07 * Math.sin(th * 9) + t * 0.03 * Math.sin(th * 23 + 1);
        const back = v.z < 0 ? 1 : 0.92;
        p.setXYZ(i, v.x * fold, v.y - (v.z > 0 ? t * 0.1 : 0), v.z * fold * 0.78 * back);
      }
      g.computeVertexNormals();
      const outer = M(g, teal, this.cape);
      const inner = M(g, capeIn, this.cape); inner.scale.setScalar(0.985);
      outer.castShadow = true;
      // pointed shoulder flaps
      for (const sx of [-1, 1]) {
        const horn = M(new THREE.ConeGeometry(0.1, 0.34, 4), teal, this.cape, 0.6 * sx, 0.06, -0.04);
        horn.rotation.z = -1.0 * sx; horn.scale.z = 0.4;
      }
      // gold arc across the back of the collar
      const arc = M(new THREE.TorusGeometry(0.21, 0.022, 8, 28, Math.PI), gold, this.cape, 0, -0.04, -0.03);
      arc.rotation.x = -Math.PI / 2;
    }

    // neck with gold pistons
    this.neck = new THREE.Group(); this.neck.position.y = 0.55; this.chest.add(this.neck);
    M(Taper(0.06, 0.075, 0.18, 14), black, this.neck, 0, 0.07, 0);
    for (const [px, pz] of [[-0.07, 0.03], [0.07, 0.03], [0, -0.07]]) {
      M(Taper(0.017, 0.017, 0.2, 10), gold, this.neck, px, 0.07, pz);
      M(Taper(0.026, 0.026, 0.05, 10), gun, this.neck, px, -0.01, pz);
    }

    // helmet
    this.head = new THREE.Group(); this.head.position.y = 0.18; this.neck.add(this.head);
    M(new THREE.SphereGeometry(0.15, 40, 30), purple, this.head, 0, 0.09, -0.01).scale.set(0.95, 1.05, 1.05);
    // crest ridge
    M(RB(0.04, 0.06, 0.26, 0.015), purple, this.head, 0, 0.23, -0.01);
    // black face plate
    const face = M(new THREE.SphereGeometry(0.142, 32, 20, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.32, Math.PI * 0.45), black, this.head, 0, 0.08, 0.008);
    face.rotation.y = 0;
    // red mono-eye in a dark ring
    const ring = M(new THREE.TorusGeometry(0.042, 0.012, 10, 24), gun, this.head, 0, 0.1, 0.143);
    ring.rotation.x = -0.1;
    const eye = M(new THREE.SphereGeometry(0.034, 18, 14), this.eyeMat, this.head, 0, 0.1, 0.138);
    eye.castShadow = false;
    this.eyes = [eye];
    // gold ear rings
    for (const sx of [-1, 1]) {
      const r = M(new THREE.TorusGeometry(0.058, 0.02, 12, 28), gold, this.head, 0.145 * sx, 0.08, -0.01);
      r.rotation.y = Math.PI / 2;
      M(CylX(0.042, 0.04), gun, this.head, 0.15 * sx, 0.08, -0.01);
      // antenna fins
      const fin = M(RB(0.025, 0.2, 0.07, 0.01), purple, this.head, 0.075 * sx, 0.27, -0.02);
      fin.rotation.z = -0.18 * sx;
    }

    // arms
    this.arms = {};
    for (const side of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(0.44 * side, 0.42, 0); this.chest.add(sh);
      M(new THREE.SphereGeometry(0.17, 24, 16), purple, sh, 0.03 * side, 0.0, 0).scale.set(1, 0.9, 1.05);
      M(RB(0.18, 0.38, 0.2, 0.07), purple, sh, 0.04 * side, -0.25, 0);
      const el = new THREE.Group(); el.position.set(0.04 * side, -0.47, 0); sh.add(el);
      M(CylX(0.075, 0.15), gun, el, 0, 0, 0);
      M(Taper(0.105, 0.145, 0.44, 28), purple, el, 0, -0.25, 0);
      M(Taper(0.03, 0.03, 0.02, 12), black, el, 0.11 * side, -0.18, 0.06).rotation.z = Math.PI / 2;
      M(Taper(0.13, 0.12, 0.05, 28), black, el, 0, -0.475, 0);
      if (side === 1) {
        // retracted mini-gatling along the outside of the forearm
        const gat = new THREE.Group(); gat.position.set(0.15, -0.28, 0.0); el.add(gat);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          M(Taper(0.014, 0.014, 0.42, 8), black, gat, Math.cos(a) * 0.035, 0, Math.sin(a) * 0.035);
        }
        M(Taper(0.055, 0.055, 0.05, 16), gun, gat, 0, 0.12, 0);
        M(Taper(0.055, 0.055, 0.04, 16), gold, gat, 0, -0.16, 0);
      }
      const hand = new THREE.Group(); hand.position.set(0, -0.52, 0); el.add(hand);
      M(RB(0.15, 0.14, 0.09, 0.03), black, hand, 0, -0.06, 0);
      const fingers = new THREE.Group(); fingers.position.set(0, -0.13, 0); hand.add(fingers);
      for (let f = 0; f < 4; f++) {
        const x = -0.05 + f * 0.033;
        M(RB(0.026, 0.09, 0.034, 0.008), black, fingers, x, -0.045, 0);
        const claw = M(new THREE.ConeGeometry(0.014, 0.07, 8), gun, fingers, x, -0.12, 0.008);
        claw.rotation.x = Math.PI + 0.25;
      }
      const thumb = M(RB(0.03, 0.08, 0.034, 0.01), black, hand, -0.075 * side, -0.08, 0.035);
      thumb.rotation.z = 0.5 * side;
      this.arms[side] = { sh, el, hand, fingers };
    }

    // legs: tan trousers, gunmetal feet with track heels
    this.legs = {};
    for (const side of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(0.13 * side, -0.07, 0); this.body.add(hip);
      M(Taper(0.105, 0.085, 0.46, 20), tan, hip, 0, -0.25, 0);
      const kn = new THREE.Group(); kn.position.set(0, -0.5, 0); hip.add(kn);
      M(new THREE.SphereGeometry(0.075, 16, 12), tan, kn, 0, 0, 0);
      M(RB(0.1, 0.12, 0.05, 0.02), gun, kn, 0, 0.0, 0.07);
      M(Taper(0.08, 0.06, 0.42, 20), tan, kn, 0, -0.23, 0);
      const an = new THREE.Group(); an.position.set(0, -0.47, 0); kn.add(an);
      M(Taper(0.06, 0.07, 0.07, 16), gun, an, 0, 0, 0);
      M(RB(0.12, 0.07, 0.3, 0.025), gun, an, 0, -0.06, 0.07);
      const toe = M(new THREE.ConeGeometry(0.06, 0.12, 4), gun, an, 0, -0.07, 0.27);
      toe.rotation.x = Math.PI / 2; toe.scale.set(1, 1, 0.5);
      M(CylX(0.05, 0.13), black, an, 0, -0.05, -0.09);
      M(new THREE.TorusGeometry(0.05, 0.012, 8, 20), gold, an, 0.07 * side, -0.05, -0.09).rotation.y = Math.PI / 2;
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 16, 1, true), this.jetMat);
      jet.rotation.x = Math.PI; jet.position.set(0, -0.35, 0.03);
      an.add(jet);
      this.legs[side] = { hip, kn, an, jet };
    }
  }
}
