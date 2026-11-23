// Spectre V-01: violet beveled armour, gold neck pistons, gunmetal
// joints and a crimson mono-eye. Built from lathed and bevel-extruded sub-assemblies (no raw
// boxes) and driven by the shared Robot animation rig.
import * as THREE from 'three';
import { Robot } from './robot.js?v=1795442091';
import { fabricTex, brushedMetalTex, paintedArmorTex, pbr } from './textures.js?v=1795442091';

import { V2, lathe, extrude, roundRect, symShape, smoothSym } from './geom.js?v=1795442091';

export class Spectre extends Robot {
  constructor() {
    super();
    this.name = 'Spectre V-01';
    this.eyeColor = new THREE.Color(1, 0.08, 0.05);
    this.eyeIntensity = 6;
    this.laserCore = new THREE.Color(12, 3.2, 2.4);
    this.laserGlow = new THREE.Color(4, 0.25, 0.12);
  }

  build() {
    const violet = pbr(paintedArmorTex(9, '#b2a0c8', 0.42), { metalness: 1, clearcoat: 0.2, clearcoatRoughness: 0.5 }, THREE.MeshPhysicalMaterial);
    const violetDark = pbr(paintedArmorTex(10, '#83729e', 0.48), { metalness: 1 });
    const gun = pbr(brushedMetalTex(41, '#2d3337', 0.35), { metalness: 0.85 });
    const gold = pbr(brushedMetalTex(42, '#d6a242', 0.28), { metalness: 1 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x15191c, roughness: 0.62, metalness: 0.1 });
    const tanT = fabricTex(21, '#a99a82');
    const tan = pbr(tanT, { roughness: 0.85 / 0.95 });
    const lining = new THREE.MeshStandardMaterial({ color: 0x10171a, roughness: 0.9, metalness: 0, side: THREE.BackSide });
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a10, emissiveIntensity: 6, roughness: 0.15 });
    const lens = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.05, metalness: 0, clearcoat: 1, transmission: 0, transparent: true, opacity: 0.35 });
    this.jetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.6, 0.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });

    const M = (geo, mat, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
      parent.add(m); return m;
    };
    const toX = (g) => g.rotateZ(Math.PI / 2); // lathe axis Y -> X

    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.body.position.y = 1.15; this.root.add(this.body);

    // ---------------- pelvis + belt
    M(lathe([[0, 0.1], [0.16, 0.1], [0.2, 0.06], [0.21, -0.04], [0.17, -0.12], [0, -0.13]], 40), tan, this.body, 0, -0.02, 0).scale.z = 0.75;
    M(new THREE.TorusGeometry(0.205, 0.035, 12, 48), rubber, this.body, 0, 0.08, 0).rotation.x = Math.PI / 2;
    this.body.children[this.body.children.length - 1].scale.set(1, 0.78, 1);
    M(extrude(roundRect(0.09, 0.065, 0.015), 0.015, 0.008), gold, this.body, 0, 0.08, 0.165);
    M(new THREE.TorusGeometry(0.02, 0.006, 8, 20), gun, this.body, 0, 0.08, 0.183);

    // ---------------- ribbed mechanical waist
    this.spine = new THREE.Group(); this.spine.position.y = 0.12; this.body.add(this.spine);
    const rib = [];
    for (let i = 0; i <= 6; i++) { const y = 0.2 - i * 0.033; rib.push([i % 2 ? 0.13 : 0.15, y]); }
    M(lathe([[0, 0.21], ...rib, [0, -0.01]], 40), gun, this.spine, 0, 0, 0).scale.z = 0.8;
    for (const sx of [-0.075, 0.075]) {
      M(lathe([[0.016, 0.12], [0.016, -0.12]], 12), gold, this.spine, sx, 0.09, 0.115);
      M(lathe([[0.026, 0.03], [0.026, -0.03]], 12), gun, this.spine, sx, 0.0, 0.115);
    }

    // ---------------- armoured torso (bevel-extruded silhouette, layered plates)
    this.chest = new THREE.Group(); this.chest.position.y = 0.22; this.spine.add(this.chest);
    const torso = smoothSym([[0.17, -0.02], [0.25, 0.1], [0.31, 0.3], [0.3, 0.46], [0.2, 0.53], [0.0, 0.55]]);
    M(extrude(torso, 0.28, 0.07, 6), violet, this.chest, 0, 0, 0);
    // pectoral plates
    for (const sx of [-1, 1]) {
      const pec = smoothSym([[0.0, 0.0], [0.11, 0.02], [0.13, 0.12], [0.08, 0.17], [0.0, 0.18]]);
      M(extrude(pec, 0.03, 0.02), violetDark, this.chest, 0.1 * sx, 0.28, 0.2).rotation.y = 0.18 * sx;
    }
    // sternum vent
    M(extrude(roundRect(0.13, 0.17, 0.03), 0.02, 0.012), rubber, this.chest, 0, 0.19, 0.215);
    for (let i = 0; i < 4; i++) M(extrude(roundRect(0.1, 0.012, 0.005), 0.01, 0.004), gun, this.chest, 0, 0.13 + i * 0.04, 0.236);
    // shoulder yoke
    const yoke = smoothSym([[0.0, -0.07], [0.3, -0.06], [0.45, -0.02], [0.47, 0.04], [0.36, 0.08], [0.0, 0.09]]);
    M(extrude(yoke, 0.34, 0.05, 5), violet, this.chest, 0, 0.47, -0.01);
    // high armoured collar
    const collar = [[0.18, 0.13], [0.2, 0.06], [0.24, -0.06], [0.26, -0.1]];
    M(lathe(collar, 48), violetDark, this.chest, 0, 0.62, -0.03);
    M(lathe(collar.map(([r, y]) => [r - 0.012, y]), 48), lining, this.chest, 0, 0.62, -0.03);

    // ---------------- neck with gold pistons
    this.neck = new THREE.Group(); this.neck.position.y = 0.55; this.chest.add(this.neck);
    M(lathe([[0, 0.17], [0.055, 0.17], [0.06, 0.12], [0.055, 0.06], [0.07, 0.0], [0.075, -0.03], [0, -0.03]], 32), rubber, this.neck, 0, 0, 0);
    for (const [px, pz] of [[-0.075, 0.03], [0.075, 0.03], [0, -0.075]]) {
      M(lathe([[0.0, 0.2], [0.014, 0.2], [0.014, 0.09], [0.022, 0.085], [0.024, -0.02], [0.03, -0.03], [0.03, -0.06], [0, -0.06]], 16), gold, this.neck, px, 0.0, pz);
    }

    // ---------------- helmet
    this.head = new THREE.Group(); this.head.position.y = 0.18; this.neck.add(this.head);
    const dome = [[0, 0.26], [0.05, 0.255], [0.1, 0.235], [0.135, 0.19], [0.152, 0.12], [0.152, 0.05], [0.142, -0.0], [0.115, -0.04], [0.06, -0.055], [0, -0.055]];
    M(lathe(dome, 64), violet, this.head, 0, 0, -0.01).scale.z = 1.08;
    // crest
    const crest = new THREE.Shape(); crest.moveTo(-0.12, 0); crest.quadraticCurveTo(0, 0.07, 0.14, 0.0); crest.lineTo(0.12, -0.02); crest.lineTo(-0.1, -0.02);
    const cr = M(extrude(crest, 0.03, 0.01), violetDark, this.head, 0, 0.245, -0.02); cr.rotation.y = Math.PI / 2;
    // black face band wrapping the front
    M(lathe(dome.slice(3, 8).map(([r, y]) => [r + 0.004, y]), 48, -1.05, 2.1), rubber, this.head, 0, 0.0, -0.002).scale.z = 1.09;
    // mono-eye: gunmetal bezel, crimson emitter, glossy lens
    const bez = M(lathe([[0.045, 0.012], [0.05, 0.0], [0.045, -0.012], [0.03, -0.012], [0.03, 0.012], [0.045, 0.012]], 32), gun, this.head, 0, 0.1, 0.152);
    bez.rotation.x = Math.PI / 2;
    const eye = M(new THREE.SphereGeometry(0.03, 24, 16), this.eyeMat, this.head, 0, 0.1, 0.152);
    eye.castShadow = false;
    M(new THREE.SphereGeometry(0.034, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), lens, this.head, 0, 0.1, 0.158).rotation.x = Math.PI / 2;
    this.eyes = [eye];
    for (const sx of [-1, 1]) {
      // gold ear rings around gunmetal hubs
      const ringG = toX(lathe([[0.062, 0.022], [0.07, 0.0], [0.062, -0.022], [0.045, -0.022], [0.045, 0.022], [0.062, 0.022]], 40));
      M(ringG, gold, this.head, 0.15 * sx, 0.08, -0.01);
      M(toX(lathe([[0, 0.03], [0.035, 0.03], [0.042, 0.0], [0.035, -0.03], [0, -0.03]], 24)), gun, this.head, 0.15 * sx, 0.08, -0.01);
      // antenna fins
      const fin = new THREE.Shape(); fin.moveTo(-0.035, 0); fin.lineTo(0.035, 0); fin.quadraticCurveTo(0.02, 0.12, 0.0, 0.2); fin.quadraticCurveTo(-0.025, 0.1, -0.035, 0);
      const fm = M(extrude(fin, 0.012, 0.008), violet, this.head, 0.08 * sx, 0.2, -0.02);
      fm.rotation.set(0, Math.PI / 2, -0.2 * sx);
    }

    // ---------------- arms
    this.arms = {};
    for (const side of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(0.44 * side, 0.42, 0); this.chest.add(sh);
      // pauldron dome facing outward with a rolled lip
      const pd = lathe([[0, 0.13], [0.08, 0.12], [0.15, 0.08], [0.185, 0.0], [0.19, -0.06], [0.2, -0.08], [0.17, -0.085], [0.0, -0.085]], 48);
      const pm = M(pd, violet, sh, 0.05 * side, 0.0, 0); pm.rotation.z = -side * Math.PI / 2 * 0.85; pm.scale.set(1, 0.9, 1.05);
      M(toX(lathe([[0, 0.05], [0.07, 0.05], [0.08, 0.0], [0.07, -0.05], [0, -0.05]], 32)), gun, sh, 0.0, 0.0, 0);
      // upper arm
      M(lathe([[0, 0.0], [0.08, -0.02], [0.095, -0.1], [0.1, -0.28], [0.09, -0.38], [0.06, -0.41], [0, -0.41]], 40), violet, sh, 0.04 * side, -0.04, 0);
      const el = new THREE.Group(); el.position.set(0.04 * side, -0.47, 0); sh.add(el);
      M(toX(lathe([[0, 0.08], [0.06, 0.08], [0.075, 0.05], [0.075, -0.05], [0.06, -0.08], [0, -0.08]], 32)), gun, el, 0, 0, 0);
      // flared gauntlet forearm with ridge bands
      M(lathe([[0, 0.02], [0.09, 0.0], [0.105, -0.06], [0.125, -0.2], [0.145, -0.36], [0.155, -0.41], [0.15, -0.44], [0.12, -0.45], [0, -0.45]], 48), violet, el, 0, -0.03, 0);
      for (const y of [-0.14, -0.3]) M(new THREE.TorusGeometry(y === -0.14 ? 0.118 : 0.138, 0.01, 10, 48), violetDark, el, 0, y, 0).rotation.x = Math.PI / 2;
      M(lathe([[0.14, 0.02], [0.135, -0.03], [0.12, -0.04], [0, -0.04]], 40), gun, el, 0, -0.48, 0);
      if (side === 1) {
        // retractable mini-gatling along the outer forearm
        const gat = new THREE.Group(); gat.position.set(0.17, -0.28, 0.0); el.add(gat);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          M(lathe([[0.013, 0.22], [0.013, -0.2], [0.016, -0.21], [0.016, -0.23], [0, -0.23]], 10), rubber, gat, Math.cos(a) * 0.033, 0, Math.sin(a) * 0.033);
        }
        M(lathe([[0, 0.17], [0.05, 0.17], [0.058, 0.12], [0.058, 0.08], [0.05, 0.06], [0, 0.06]], 24), gun, gat, 0, 0, 0);
        M(new THREE.TorusGeometry(0.055, 0.012, 8, 28), gold, gat, 0, -0.16, 0).rotation.x = Math.PI / 2;
      }
      // clawed gauntlet hand
      const hand = new THREE.Group(); hand.position.set(0, -0.52, 0); el.add(hand);
      const palm = smoothSym([[0.05, -0.07], [0.075, -0.04], [0.075, 0.03], [0.06, 0.06], [0.0, 0.065]]);
      M(extrude(palm, 0.05, 0.022), rubber, hand, 0, -0.06, 0);
      M(extrude(roundRect(0.1, 0.06, 0.02), 0.012, 0.01), gun, hand, 0, -0.04, 0.042);
      const fingers = new THREE.Group(); fingers.position.set(0, -0.13, 0); hand.add(fingers);
      const seg = extrude(roundRect(0.024, 0.055, 0.01), 0.02, 0.008);
      const clawG = lathe([[0.0, 0.0], [0.013, -0.005], [0.01, -0.04], [0.0, -0.075]], 10);
      for (let f = 0; f < 4; f++) {
        const x = -0.05 + f * 0.033;
        const k1 = new THREE.Group(); k1.position.set(x, 0, 0); fingers.add(k1);
        M(seg, rubber, k1, 0, -0.03, 0);
        const k2 = new THREE.Group(); k2.position.set(0, -0.065, 0); k2.rotation.x = -0.25; k1.add(k2);
        M(seg, rubber, k2, 0, -0.025, 0);
        const c = M(clawG, gun, k2, 0, -0.055, 0.004); c.rotation.x = -0.3;
      }
      const th = new THREE.Group(); th.position.set(-0.07 * side, -0.07, 0.03); th.rotation.z = 0.55 * side; hand.add(th);
      M(seg, rubber, th, 0, -0.03, 0); M(clawG, gun, th, 0, -0.065, 0);
      this.arms[side] = { sh, el, hand, fingers };
    }

    // ---------------- legs: tactical trousers over mechanical joints, gunmetal boots
    this.legs = {};
    const thigh = lathe([[0, 0.02], [0.09, 0.0], [0.108, -0.08], [0.105, -0.25], [0.09, -0.4], [0.078, -0.47], [0, -0.48]], 40);
    const shin = lathe([[0, 0.0], [0.075, -0.02], [0.082, -0.12], [0.072, -0.3], [0.062, -0.42], [0.0, -0.43]], 40);
    const bootShape = new THREE.Shape(); // side profile, toe toward +x
    bootShape.moveTo(-0.13, 0.0); bootShape.lineTo(0.12, 0.0); bootShape.quadraticCurveTo(0.24, 0.0, 0.25, 0.02);
    bootShape.quadraticCurveTo(0.16, 0.06, 0.06, 0.1); bootShape.lineTo(-0.06, 0.12); bootShape.quadraticCurveTo(-0.13, 0.1, -0.13, 0.0);
    const boot = extrude(bootShape, 0.08, 0.025, 4);
    for (const side of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(0.13 * side, -0.07, 0); this.body.add(hip);
      M(toX(lathe([[0, 0.05], [0.065, 0.05], [0.075, 0.0], [0.065, -0.05], [0, -0.05]], 24)), gun, hip, 0, 0, 0);
      M(thigh, tan, hip, 0, -0.03, 0);
      // cargo pocket
      M(extrude(roundRect(0.09, 0.12, 0.02), 0.025, 0.012), tan, hip, 0.1 * side, -0.24, 0.0).rotation.y = Math.PI / 2;
      const kn = new THREE.Group(); kn.position.set(0, -0.5, 0); hip.add(kn);
      M(toX(lathe([[0, 0.07], [0.065, 0.07], [0.075, 0.0], [0.065, -0.07], [0, -0.07]], 24)), gun, kn, 0, 0, 0);
      const pad = smoothSym([[0.0, -0.07], [0.05, -0.06], [0.06, 0.02], [0.04, 0.07], [0.0, 0.08]]);
      M(extrude(pad, 0.03, 0.02), gun, kn, 0, -0.01, 0.075);
      M(shin, tan, kn, 0, -0.03, 0);
      const an = new THREE.Group(); an.position.set(0, -0.47, 0); kn.add(an);
      M(lathe([[0, 0.04], [0.06, 0.04], [0.07, 0.0], [0.065, -0.03], [0, -0.03]], 24), gun, an, 0, 0, 0);
      const b = M(boot, gun, an, 0, -0.1, 0.06); b.rotation.y = -Math.PI / 2;
      // track-tread heel wheel with gold ring
      M(toX(lathe([[0, 0.05], [0.04, 0.05], [0.05, 0.03], [0.05, -0.03], [0.04, -0.05], [0, -0.05]], 28)), rubber, an, 0, -0.06, -0.08);
      M(new THREE.TorusGeometry(0.05, 0.01, 8, 28), gold, an, 0.055 * side, -0.06, -0.08).rotation.y = Math.PI / 2;
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 16, 1, true), this.jetMat);
      jet.rotation.x = Math.PI; jet.position.set(0, -0.36, 0.03); jet.userData.noOutline = true;
      an.add(jet);
      this.legs[side] = { hip, kn, an, jet };
    }
    eye.userData.noOutline = true;
  }
}
