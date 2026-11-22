// The player avatar ("Sentinel"): an original sleek android. Brushed-silver sculpted armour over a
// dark exposed mechanical core, cable bundles at the neck and waist, articulated three-joint
// fingers and glowing seams. Built from smooth lathes and bevel-extruded plates.
import * as THREE from 'three';
import { brushedMetalTex, pbr } from './textures.js';
import { lathe, extrude, roundRect, smoothSym, smoothShape, cable, mesher, toX } from './geom.js';

const lerpA = (a, b, k) => a + (b - a) * k;
const _pivot = new THREE.Vector3();

export class Robot {
  constructor() {
    this.name = 'Sentinel';
    this.eyeColor = new THREE.Color(1, 0.32, 0.08);
    this.eyeIntensity = 5;
    this.laserCore = new THREE.Color(12, 5, 2.2);
    this.laserGlow = new THREE.Color(4, 0.7, 0.1);
    this.build();
    this._physique();
    this._addHandJets();
    // a pivot between the root and the body, so a heavy hit can send the whole figure tumbling
    this.tumbleG = new THREE.Group();
    this.root.remove(this.body); this.tumbleG.add(this.body); this.root.add(this.tumbleG);
    this.tumbleAxis = new THREE.Vector3(1, 0, 0); this.tumbleAng = 0; this.tumbleVel = 0; this.knock = null;
    this.phase = 0;
    this.punchFist = 0;
    this.hover = 0;
  }

  // Thrusters in the palms: a bright core and a softer outer flame, scaled by thrust each frame.
  _addHandJets() {
    this.handJets = [];
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.5, 3), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const outerMat = new THREE.MeshBasicMaterial({ color: this.laserGlow.clone().multiplyScalar(0.9), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    // wide at the palm, tapering away along the hand's -Y
    const cg = new THREE.ConeGeometry(0.045, 0.45, 16, 1, true); cg.rotateX(Math.PI); cg.translate(0, -0.225, 0);
    const og = new THREE.ConeGeometry(0.085, 0.7, 16, 1, true); og.rotateX(Math.PI); og.translate(0, -0.35, 0);
    for (const side of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(0, -0.12, 0.0);
      const core = new THREE.Mesh(cg, coreMat), outer = new THREE.Mesh(og, outerMat);
      core.userData.noOutline = outer.userData.noOutline = true;
      g.add(core, outer);
      this.arms[side].hand.add(g);
      this.handJets.push({ g, core, outer, side });
    }
    this.handJetMats = [coreMat, outerMat];
    this.thrust = 0;
  }

  // Heroic proportions applied to whichever model was built: broad V-taper chest and shoulders,
  // heavy arms and fists, a narrow waist and powerful legs.
  _physique({ chest = 1.16, shoulders = 1.14, arms = 1.24, hands = 1.12, waist = 0.86, thigh = 1.16, calf = 1.12 } = {}) {
    const meshes = (g) => g.children.filter((c) => c.isMesh);
    for (const m of meshes(this.chest)) { m.scale.x *= chest; m.scale.z *= 1.08; m.position.x *= chest; }
    for (const m of meshes(this.spine)) { m.scale.x *= waist; m.scale.z *= waist; m.position.x *= waist; }
    for (const side of [-1, 1]) {
      const a = this.arms[side];
      a.sh.position.x *= shoulders;
      for (const m of meshes(a.sh)) { m.scale.x *= arms; m.scale.z *= arms; m.scale.y *= 1.06; }
      for (const m of meshes(a.el)) { m.scale.x *= arms; m.scale.z *= arms; }
      a.hand.scale.setScalar(hands);
      const l = this.legs[side];
      for (const m of meshes(l.hip)) { m.scale.x *= thigh; m.scale.z *= thigh; }
      for (const m of meshes(l.kn)) { m.scale.x *= calf; m.scale.z *= calf; }
    }
  }

  handJetWorld(i, out) { const j = this.handJets[i]; j.g.updateWorldMatrix(true, false); return out.setFromMatrixPosition(j.g.matrixWorld); }
  handJetDir(i, out) { const j = this.handJets[i]; j.g.updateWorldMatrix(true, false); return out.set(0, -1, 0).transformDirection(j.g.matrixWorld); }

  build() {
    const silver = pbr(brushedMetalTex(51, '#d4d8dc', 0.3), { metalness: 0.82, envMapIntensity: 1.9, clearcoat: 0.35, clearcoatRoughness: 0.35 }, THREE.MeshPhysicalMaterial);
    const steel = pbr(brushedMetalTex(52, '#9aa1a8', 0.34), { metalness: 0.85, envMapIntensity: 1.6 });
    const graphite = pbr(brushedMetalTex(53, '#33383e', 0.4), { metalness: 0.85 });
    const core = new THREE.MeshStandardMaterial({ color: 0x111316, roughness: 0.5, metalness: 0.5 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.7, metalness: 0.1 });
    this.mats = { silver, steel, graphite, core, rubber };
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff4a14, emissiveIntensity: 5, roughness: 0.2 });
    this.glowMat = new THREE.MeshStandardMaterial({ color: 0x200500, emissive: 0xff3a10, emissiveIntensity: 2.6, roughness: 0.3 });
    this.jetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.4, 0.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const glow = this.glowMat;
    const M = mesher();

    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.body.position.y = 1.15; this.root.add(this.body);

    // ---------------- pelvis: silver girdle over a dark core, glowing hip seams
    M(lathe([[0, 0.1], [0.15, 0.1], [0.19, 0.05], [0.2, -0.02], [0.16, -0.09], [0.08, -0.14], [0, -0.15]], 48, 0, Math.PI * 2, 4), core, this.body, 0, 0, 0).scale.z = 0.72;
    const girdle = smoothSym([[0.0, -0.13], [0.07, -0.12], [0.16, -0.02], [0.2, 0.06], [0.19, 0.1], [0.0, 0.06]]);
    M(extrude(girdle, 0.04, 0.02), silver, this.body, 0, 0, 0.12);
    M(extrude(girdle, 0.04, 0.02), silver, this.body, 0, 0, -0.12);
    for (const sx of [-1, 1]) {
      M(toX(lathe([[0, 0.04], [0.07, 0.04], [0.08, 0.0], [0.07, -0.04], [0, -0.04]], 32)), graphite, this.body, 0.2 * sx, -0.03, 0);
      M(new THREE.TorusGeometry(0.052, 0.008, 8, 32), glow, this.body, 0.235 * sx, -0.03, 0).rotation.y = Math.PI / 2;
    }

    // ---------------- exposed mechanical abdomen: ribbed spine, cables, glowing core line
    this.spine = new THREE.Group(); this.spine.position.y = 0.12; this.body.add(this.spine);
    const rib = [];
    for (let i = 0; i <= 8; i++) rib.push([i % 2 ? 0.11 : 0.135, 0.22 - i * 0.026]);
    M(lathe([[0, 0.23], ...rib, [0, 0.0]], 40), core, this.spine, 0, 0, -0.01).scale.z = 0.78;
    for (const sx of [-1, 1]) {
      M(cable([[0.1 * sx, -0.02, 0.05], [0.13 * sx, 0.1, 0.08], [0.12 * sx, 0.24, 0.06]], 0.014), rubber, this.spine);
      M(cable([[0.06 * sx, -0.02, -0.09], [0.08 * sx, 0.1, -0.11], [0.07 * sx, 0.25, -0.1]], 0.012), rubber, this.spine);
      // oblique armour plates
      const obl = smoothSym([[0.0, -0.06], [0.03, -0.05], [0.04, 0.06], [0.02, 0.1], [0.0, 0.1]]);
      const o = M(extrude(obl, 0.02, 0.012), steel, this.spine, 0.12 * sx, 0.1, 0.06); o.rotation.y = 0.9 * sx;
    }
    M(extrude(roundRect(0.022, 0.2, 0.01), 0.01, 0.005), glow, this.spine, 0, 0.11, 0.105);

    // ---------------- chest: dark core with layered, sculpted silver plates
    this.chest = new THREE.Group(); this.chest.position.y = 0.22; this.spine.add(this.chest);
    const torso = smoothSym([[0.15, 0.0], [0.22, 0.1], [0.28, 0.3], [0.29, 0.44], [0.2, 0.52], [0.0, 0.54]]);
    M(extrude(torso, 0.22, 0.07, 6), core, this.chest, 0, 0, -0.01);
    for (const sx of [-1, 1]) {
      // pectoral plate, angled outward, with a glowing seam underneath
      const pec = smoothSym([[0.0, 0.0], [0.1, 0.01], [0.15, 0.09], [0.14, 0.2], [0.06, 0.24], [0.0, 0.24]]);
      const p = M(extrude(pec, 0.04, 0.03, 5), silver, this.chest, 0.12 * sx, 0.24, 0.17); p.rotation.y = 0.28 * sx; p.rotation.x = -0.08;
      const seam = new THREE.Shape(); seam.moveTo(0, 0); seam.lineTo(0.15, 0.04); seam.lineTo(0.15, 0.055); seam.lineTo(0, 0.016);
      const sm = M(extrude(seam, 0.008, 0.004), glow, this.chest, 0.02 * sx, 0.22, 0.21); sm.scale.x = sx;
      // upper-back / trapezius plate
      const tr = smoothSym([[0.0, 0.0], [0.12, 0.02], [0.16, 0.1], [0.08, 0.15], [0.0, 0.15]]);
      const t = M(extrude(tr, 0.04, 0.025), silver, this.chest, 0.11 * sx, 0.36, -0.15); t.rotation.y = -0.3 * sx;
      // collarbone ridge
      const cb = M(lathe([[0.0, 0.11], [0.022, 0.1], [0.026, 0.0], [0.022, -0.1], [0, -0.11]], 16), steel, this.chest, 0.13 * sx, 0.5, 0.06);
      cb.rotation.z = (Math.PI / 2 - 0.25) * sx;
    }
    // back armour: a broad sculpted plate over the shoulder blades and a lower spine guard
    M(extrude(smoothSym([[0.0, 0.0], [0.13, 0.02], [0.22, 0.14], [0.25, 0.3], [0.2, 0.42], [0.0, 0.45]]), 0.05, 0.03, 5), silver, this.chest, 0, 0.05, -0.15);
    M(extrude(smoothSym([[0.0, -0.1], [0.06, -0.08], [0.08, 0.05], [0.0, 0.08]]), 0.03, 0.015), steel, this.chest, 0, -0.02, -0.14);
    // sternum and abdominal chevrons
    M(extrude(smoothSym([[0.0, 0.0], [0.04, 0.03], [0.045, 0.2], [0.02, 0.26], [0.0, 0.27]]), 0.03, 0.015), steel, this.chest, 0, 0.18, 0.2);
    for (let i = 0; i < 3; i++) {
      const ch = new THREE.Shape(); ch.moveTo(-0.1, 0); ch.lineTo(0, -0.035); ch.lineTo(0.1, 0); ch.lineTo(0.1, 0.03); ch.lineTo(0, -0.005); ch.lineTo(-0.1, 0.03);
      M(extrude(ch, 0.025, 0.01), silver, this.chest, 0, 0.12 - i * 0.055, 0.155 - i * 0.012);
    }
    // neck collar ring
    M(lathe([[0.12, 0.04], [0.135, 0.0], [0.15, -0.04]], 40), steel, this.chest, 0, 0.55, 0);

    // ---------------- neck: vertebrae and a cable bundle
    this.neck = new THREE.Group(); this.neck.position.y = 0.5; this.chest.add(this.neck);
    for (let i = 0; i < 3; i++) M(lathe([[0.045, 0.012], [0.055, 0.0], [0.045, -0.012]], 20), graphite, this.neck, 0, 0.04 + i * 0.045, -0.015);
    for (const [x, z] of [[-0.04, 0.02], [0.04, 0.02], [0, 0.04], [-0.055, -0.02], [0.055, -0.02]]) {
      M(cable([[x, -0.02, z], [x * 1.1, 0.08, z + 0.01], [x * 0.8, 0.17, z]], 0.011, 12), rubber, this.neck);
    }

    // ---------------- head: elongated helmet, recessed dark face, angular glowing eyes, central ridge
    this.head = new THREE.Group(); this.head.position.y = 0.16; this.neck.add(this.head);
    const skull = [[0, 0.3], [0.06, 0.29], [0.11, 0.25], [0.135, 0.18], [0.14, 0.09], [0.125, 0.0], [0.09, -0.06], [0.04, -0.08], [0, -0.085]];
    M(lathe(skull, 64, 0, Math.PI * 2, 4), silver, this.head, 0, 0, -0.01).scale.set(0.88, 1, 1.05);
    // faceplate: a smooth shield shape set slightly into the helmet front
    const face = smoothSym([[0.0, -0.075], [0.05, -0.06], [0.085, 0.04], [0.095, 0.13], [0.06, 0.19], [0.0, 0.2]]);
    M(extrude(face, 0.03, 0.015), core, this.head, 0, 0.0, 0.115);
    // brow ridge and centre crest
    M(extrude(smoothSym([[0.0, 0.0], [0.09, 0.0], [0.1, 0.02], [0.05, 0.035], [0.0, 0.04]]), 0.04, 0.012), silver, this.head, 0, 0.14, 0.12).rotation.x = -0.25;
    const crest = new THREE.Shape(); crest.moveTo(-0.15, 0); crest.quadraticCurveTo(0.0, 0.05, 0.16, 0.0); crest.lineTo(0.13, -0.02); crest.lineTo(-0.14, -0.02);
    M(extrude(crest, 0.018, 0.008), steel, this.head, 0, 0.29, -0.02).rotation.y = Math.PI / 2;
    // angled eye slits
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const sl = new THREE.Shape(); sl.moveTo(0, 0); sl.lineTo(0.055, 0.018); sl.lineTo(0.05, 0.03); sl.lineTo(-0.002, 0.016);
      const e = M(extrude(sl, 0.006, 0.004), this.eyeMat, this.head, 0.012 * sx, 0.095, 0.145);
      e.scale.x = sx; e.castShadow = false; e.userData.noOutline = true;
      const anchor = new THREE.Object3D(); anchor.position.set(0.04 * sx, 0.107, 0.15); this.head.add(anchor);
      this.eyes.push(anchor);
      // side sensor discs
      M(toX(lathe([[0, 0.012], [0.04, 0.012], [0.045, 0.0], [0.04, -0.012], [0, -0.012]], 24)), graphite, this.head, 0.125 * sx, 0.1, -0.02);
      M(new THREE.TorusGeometry(0.028, 0.005, 8, 24), glow, this.head, 0.138 * sx, 0.1, -0.02).rotation.y = Math.PI / 2;
    }

    // ---------------- arms
    this.arms = {};
    for (const side of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(0.36 * side, 0.42, 0); this.chest.add(sh);
      // deltoid dome with a dark groove
      const dl = M(lathe([[0, 0.14], [0.09, 0.13], [0.15, 0.08], [0.165, 0.0], [0.155, -0.08], [0.12, -0.13], [0, -0.14]], 48, 0, Math.PI * 2, 3), silver, sh, 0.05 * side, 0.01, 0);
      dl.scale.set(1, 1, 1.05);
      M(new THREE.TorusGeometry(0.155, 0.01, 8, 48), core, sh, 0.05 * side, 0.01, 0).rotation.y = Math.PI / 2;
      M(toX(lathe([[0, 0.05], [0.07, 0.05], [0.08, 0.0], [0.07, -0.05], [0, -0.05]], 28)), graphite, sh, -0.02 * side, 0, 0);
      // bicep: muscular bulge, dark inner strip with a cable
      M(lathe([[0, 0.0], [0.07, -0.04], [0.095, -0.12], [0.1, -0.22], [0.085, -0.34], [0.065, -0.41], [0, -0.42]], 40, 0, Math.PI * 2, 3), silver, sh, 0.04 * side, -0.05, 0.005).scale.set(1, 1, 1.08);
      M(cable([[0.04 * side - 0.06 * side, -0.12, -0.06], [0.04 * side - 0.08 * side, -0.3, -0.05], [0.04 * side - 0.05 * side, -0.45, -0.03]], 0.012, 12), rubber, sh);
      const el = new THREE.Group(); el.position.set(0.04 * side, -0.48, 0); sh.add(el);
      M(toX(lathe([[0, 0.065], [0.055, 0.065], [0.07, 0.03], [0.07, -0.03], [0.055, -0.065], [0, -0.065]], 28)), graphite, el, 0, 0, 0);
      M(lathe([[0, 0.02], [0.05, 0.015], [0.06, -0.02], [0, -0.03]], 20), steel, el, 0, 0.02, -0.06).scale.set(1, 1, 0.7);
      // forearm: swells below the elbow then tapers to the wrist; glowing strip on the outside
      M(lathe([[0, 0.0], [0.075, -0.02], [0.098, -0.09], [0.094, -0.2], [0.078, -0.33], [0.06, -0.41], [0, -0.42]], 40, 0, Math.PI * 2, 3), silver, el, 0, -0.03, 0).scale.set(1, 1, 1.1);
      const fs = M(extrude(roundRect(0.016, 0.2, 0.008), 0.008, 0.004), glow, el, 0.09 * side, -0.2, 0); fs.rotation.y = Math.PI / 2 * side;
      M(lathe([[0.062, 0.02], [0.066, 0.0], [0.06, -0.025], [0, -0.03]], 28), graphite, el, 0, -0.45, 0);
      // hand: sculpted palm, knuckle discs, three-joint fingers with pointed tips
      const hand = new THREE.Group(); hand.position.set(0, -0.5, 0); el.add(hand);
      const palm = smoothSym([[0.04, -0.075], [0.065, -0.05], [0.068, 0.02], [0.05, 0.05], [0.0, 0.055]]);
      M(extrude(palm, 0.04, 0.02), graphite, hand, 0, -0.06, 0);
      M(extrude(smoothSym([[0.0, -0.05], [0.055, -0.045], [0.058, 0.02], [0.03, 0.04], [0.0, 0.04]]), 0.01, 0.008), silver, hand, 0, -0.06, 0.03);
      const fingers = new THREE.Group(); fingers.position.set(0, -0.13, 0); hand.add(fingers);
      const segG = [0.04, 0.032, 0.026].map((l) => lathe([[0, 0.004], [0.012, 0.0], [0.013, -l * 0.5], [0.011, -l], [0, -l - 0.004]], 12));
      const knG = toX(lathe([[0, 0.012], [0.012, 0.012], [0.013, 0], [0.012, -0.012], [0, -0.012]], 12));
      const tipG = lathe([[0, 0], [0.011, -0.003], [0.008, -0.02], [0, -0.034]], 10);
      for (let f = 0; f < 4; f++) {
        const x = -0.045 + f * 0.03, len = f === 1 || f === 2 ? 1 : 0.88;
        let parent = new THREE.Group(); parent.position.set(x, 0, 0); fingers.add(parent);
        for (let k = 0; k < 3; k++) {
          M(knG, core, parent, 0, 0, 0);
          M(segG[k], k === 0 ? steel : silver, parent, 0, 0, 0).scale.y = len;
          const next = new THREE.Group(); next.position.y = -[0.04, 0.032, 0.026][k] * len - 0.006; next.rotation.x = -0.18; parent.add(next);
          parent = next;
        }
        M(tipG, steel, parent, 0, 0.004, 0);
      }
      const th = new THREE.Group(); th.position.set(-0.06 * side, -0.07, 0.025); th.rotation.set(0.3, 0, 0.6 * side); hand.add(th);
      M(knG, core, th); M(segG[0], steel, th);
      const th2 = new THREE.Group(); th2.position.y = -0.046; th2.rotation.x = -0.2; th.add(th2); M(segG[1], silver, th2); M(tipG, steel, th2, 0, -0.034, 0);
      this.arms[side] = { sh, el, hand, fingers };
    }

    // ---------------- legs
    this.legs = {};
    const thigh = lathe([[0, 0.02], [0.08, 0.0], [0.11, -0.07], [0.118, -0.18], [0.105, -0.32], [0.085, -0.42], [0.07, -0.47], [0, -0.48]], 44, 0, Math.PI * 2, 3);
    const calf = lathe([[0, 0.0], [0.065, -0.02], [0.086, -0.1], [0.082, -0.2], [0.065, -0.33], [0.05, -0.42], [0, -0.43]], 44, 0, Math.PI * 2, 3);
    const footShape = smoothShape([[-0.1, 0.0], [0.14, 0.0], [0.22, 0.012], [0.2, 0.04], [0.1, 0.07], [0.0, 0.1], [-0.08, 0.1], [-0.11, 0.05]]);
    const foot = extrude(footShape, 0.08, 0.025, 4);
    for (const side of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(0.12 * side, -0.07, 0); this.body.add(hip);
      M(thigh, silver, hip, 0, -0.02, 0.005).scale.set(1, 1, 1.12);
      M(cable([[-0.06 * side, -0.05, -0.07], [-0.07 * side, -0.25, -0.08], [-0.04 * side, -0.46, -0.05]], 0.012, 12), rubber, hip);
      const ts = M(extrude(roundRect(0.016, 0.18, 0.008), 0.008, 0.004), glow, hip, 0.112 * side, -0.24, 0.02); ts.rotation.y = Math.PI / 2 * side;
      const kn = new THREE.Group(); kn.position.set(0, -0.5, 0); hip.add(kn);
      M(toX(lathe([[0, 0.06], [0.06, 0.06], [0.072, 0.0], [0.06, -0.06], [0, -0.06]], 28)), graphite, kn, 0, 0, 0);
      M(lathe([[0, 0.06], [0.045, 0.05], [0.06, 0.0], [0.045, -0.05], [0, -0.06]], 28, 0, Math.PI * 2, 3), silver, kn, 0, 0.0, 0.065).scale.set(1, 1.15, 0.6);
      M(calf, silver, kn, 0, -0.03, -0.005).scale.set(1, 1, 1.1);
      M(extrude(smoothSym([[0.0, -0.18], [0.035, -0.15], [0.04, 0.12], [0.0, 0.16]]), 0.02, 0.012), steel, kn, 0, -0.18, 0.07);
      const an = new THREE.Group(); an.position.set(0, -0.47, 0); kn.add(an);
      M(lathe([[0, 0.035], [0.05, 0.035], [0.058, 0.0], [0.05, -0.03], [0, -0.03]], 24), graphite, an, 0, 0, 0);
      const f = M(foot, silver, an, 0, -0.1, 0.03); f.rotation.y = -Math.PI / 2;
      M(extrude(roundRect(0.3, 0.012, 0.005), 0.085, 0.004), rubber, an, 0, -0.1, 0.05).rotation.y = Math.PI / 2;
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 16, 1, true), this.jetMat);
      jet.rotation.x = Math.PI; jet.position.set(0, -0.36, 0.03); jet.userData.noOutline = true;
      an.add(jet);
      this.legs[side] = { hip, kn, an, jet };
    }
  }

  // Kick a joint's spring (e.g. absorb a landing): positive dy pushes the body down.
  // Recoil when the dummy lands a hit: the body snaps back and twists, the springs bring it round.
  // dir: the world direction the hit pushes you. Light hits make the body buckle away from the blow and
  // the limbs fling; heavy ones send the whole figure tumbling end over end until it rights itself.
  hitReact(power, dir = null) {
    const yaw = this.root.rotation.y;
    let nx = 0, nz = -1;
    if (dir) {
      const lx = dir.x * Math.cos(yaw) - dir.z * Math.sin(yaw), lz = dir.x * Math.sin(yaw) + dir.z * Math.cos(yaw), h = Math.hypot(lx, lz);
      if (h > 1e-3) { nx = lx / h; nz = lz / h; }
    }
    const k = Math.max(0.2, Math.min(2, power / 30));
    const heavy = power >= 18;
    this.knock = { t: 0, k, nx, nz, heavy, dur: heavy ? 0.9 + k * 0.35 : 0.4 + k * 0.35, seed: Math.random() * 10, phase: 'air', downT: 0, side: Math.random() < 0.5 ? -1 : 1 };
    if (heavy) {
      // spin about the axis across the push: the top goes the way you're shoved
      const ax = new THREE.Vector3(nz, 0, -nx);
      if (this.tumbleVel > 1 && ax.dot(this.tumbleAxis) < 0) this.tumbleVel *= 0.3;
      this.tumbleAxis.copy(ax);
      this.tumbleVel = Math.min(18, Math.max(this.tumbleVel, 0) + 4 + 6 * k);
    }
    if (!this.springs) return;
    const kick = (id, dv) => { const st = this.springs.get(id); if (st) st.v += dv; };
    const kk = Math.min(1.6, power / 15);
    kick(this.body.uuid + 'r' + 'x', 9 * kk * nz); kick(this.body.uuid + 'r' + 'z', -9 * kk * nx);
    kick(this.spine.uuid + 'x', 7 * kk * nz); kick(this.chest.uuid + 'y', (Math.random() - 0.5) * 16 * kk);
    kick(this.head.uuid + 'x', 14 * kk * nz - 4 * kk); kick(this.head.uuid + 'z', -10 * kk * nx);
    kick(this.body.uuid + 'p' + 'y', -2 * kk);
    for (const side of [-1, 1]) { kick(this.arms[side].sh.uuid + 'z', side * 14 * kk); kick(this.arms[side].sh.uuid + 'x', -10 * kk * (0.5 + Math.random())); kick(this.arms[side].el.uuid + 'x', -12 * kk * Math.random()); }
    for (const side of [-1, 1]) kick(this.legs[side].kn.uuid + 'x', 10 * kk * Math.random());
  }

  // Pose layer for being hit (called from animate before the springs run).
  _knockPose(P, s, dt, sstep) {
    const K = this.knock;
    if (K) {
      K.t += dt;
      if (K.heavy && K.phase === 'air' && s.grounded && K.t > 0.12) { K.phase = 'down'; K.downT = 0; this.tumbleVel *= 0.3; }
      if (K.phase === 'down') K.downT += dt;
      const end = K.phase === 'down' ? K.downT > 0.75 : K.t > K.dur && (!K.heavy || s.flying || K.t > K.dur + 1.5);
      if (end) this.knock = null;
    }
    if (this.knock) {
      const fade = K.phase === 'down' ? 1 - sstep((K.downT - 0.35) / 0.4) : 1 - sstep((K.t - K.dur * 0.55) / (K.dur * 0.45));
      const a = fade * Math.min(1.3, K.k + 0.3);
      const bF = K.nz, bS = K.nx;
      const fl = Math.sin(K.t * 13 + K.seed), fl2 = Math.sin(K.t * 10.3 + K.seed * 2), fl3 = Math.sin(K.t * 8.1 + K.seed * 3);
      const mixP = (A, B, w) => { for (const k of Object.keys(B)) A[k] = A[k] + (B[k] - A[k]) * w; };
      const w = Math.min(1, a);
      if (K.phase === 'down') {
        // skid to a stop on a knee and a hand, then push back up
        const u = K.downT;
        const kneel = { sx: -0.9, sy: 0, sz: -0.35, el: -0.3, curl: 0.2 };
        mixP(P.L, kneel, w); mixP(P.R, { sx: -0.2, sy: 0.2, sz: 0.6, el: -0.5, curl: 0.6 }, w);
        P.bodyY += (-0.55 * w); P.bodyX += 0.45 * w; P.spineX += 0.3 * w; P.headX -= 0.3 * w;
        P.lHip += 1.2 * w; P.lKn += 1.5 * w; P.rHip += 0.2 * w; P.rKn += 1.9 * w; P.lAn -= 0.3 * w; P.rAn += 0.4 * w;
        P.chestY += K.side * 0.25 * w * Math.max(0, 1 - u * 2);
      } else {
        // buckle away from the blow: hips lead, chest and head whip after, arms and legs fly loose
        P.bodyX += bF * 0.7 * a; P.bodyZ += -bS * 0.6 * a; P.spineX += bF * 0.45 * a; P.chestX += bF * 0.25 * a;
        P.chestY += (K.side * 0.6 + fl3 * 0.25) * a; P.bodyYaw += K.side * 0.3 * a;
        P.headX += bF * 0.7 * a + fl2 * 0.15 * a; P.headZ += -bS * 0.6 * a + fl * 0.12 * a;
        mixP(P.L, { sx: -0.5 + bF * 1.3 + fl * 0.55, sy: -0.4, sz: -1.35 - fl2 * 0.35, el: -0.5 + fl3 * 0.45, curl: 0.15 }, w);
        mixP(P.R, { sx: -0.5 + bF * 1.3 - fl2 * 0.55, sy: 0.4, sz: 1.35 + fl3 * 0.35, el: -0.6 - fl * 0.45, curl: 0.15 }, w);
        if (s.grounded && !s.flying) {
          // stagger: knees give, hips drop, a foot slides back
          P.bodyY -= 0.22 * a; P.lKn += 0.6 * a; P.rKn += 0.45 * a; P.lHip += (0.35 - bF * 0.4) * a; P.rHip += (-0.15 - bF * 0.3) * a;
        } else {
          P.lHip += (0.6 + fl * 0.5) * w; P.rHip += (0.15 - fl2 * 0.6) * w; P.lKn += (1.0 + fl3 * 0.4) * w; P.rKn += (0.55 + fl * 0.5) * w;
          P.lHipZ += 0.3 * w; P.rHipZ -= 0.3 * w; P.lAn += 0.4 * w; P.rAn += 0.3 * w;
        }
      }
    }
    // tumble: spin while airborne, then right yourself (a quick flip back upright with the thrusters,
    // or a hard stop on the ground)
    const K2 = this.knock;
    const spinning = K2 && K2.heavy && K2.phase === 'air' && K2.t < K2.dur * 0.7 && !s.grounded;
    if (spinning) { this.tumbleAng += this.tumbleVel * dt; this.tumbleVel *= Math.exp(-0.5 * dt); }
    else if (this.tumbleAng !== 0 || this.tumbleVel !== 0) {
      const target = Math.round(this.tumbleAng / (Math.PI * 2)) * Math.PI * 2;
      const wv = s.grounded ? 16 : 9, z = 0.7;
      const n = Math.max(1, Math.ceil(dt * wv / 0.25)), h = dt / n;
      for (let i = 0; i < n; i++) { this.tumbleVel += (wv * wv * (target - this.tumbleAng) - 2 * z * wv * this.tumbleVel) * h; this.tumbleAng += this.tumbleVel * h; }
      if (Math.abs(this.tumbleAng - target) < 1e-3 && Math.abs(this.tumbleVel) < 1e-2) { this.tumbleAng = 0; this.tumbleVel = 0; }
    }
    const q = this.tumbleG.quaternion.setFromAxisAngle(this.tumbleAxis, this.tumbleAng);
    const pivot = _pivot.set(0, 1.05, 0);
    this.tumbleG.position.copy(pivot).sub(pivot.clone().applyQuaternion(q));
    return !!this.knock;
  }

  land(speed) {
    if (!this.springs) return;
    const k = Math.min(1, speed / 30);
    const by = this.springs.get(this.body.uuid + 'p' + 'y'); if (by) by.v -= 1.5 + 5 * k;
    for (const side of [-1, 1]) {
      const kn = this.springs.get(this.legs[side].kn.uuid + 'x'); if (kn) kn.v += 8 + 22 * k;
      const hp = this.springs.get(this.legs[side].hip.uuid + 'x'); if (hp) hp.v -= 5 + 12 * k;
    }
    const sx = this.springs.get(this.spine.uuid + 'x'); if (sx) sx.v += 3 + 6 * k;
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
    this.lookOff = 0;
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
      const bob = Math.sin(t * 1.7) * 0.75 + Math.sin(t * 2.9 + 1.1) * 0.25, sway = Math.sin(t * 0.83) * 0.7 + Math.sin(t * 1.37 + 2) * 0.3;
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
        P.L.sz = -0.2; P.R.sz = 0.2; P.L.curl = P.R.curl = 1;
        P.lHipZ = 0.05; P.rHipZ = -0.05;
        P.bodyX = a * (0.1 + 0.25 * sprint);
        P.bodyY = 1.15 - 0.05 * a + Math.abs(lC) * 0.07 * a;
        P.bodyYaw = -lS * 0.16 * a; P.chestY = lS * 0.3 * a; P.spineY = lS * 0.06 * a;
        P.bodyZ = clamp(-s.turnRate * 0.06, -0.15, 0.15) + lS * 0.05 * a; P.headZ = -lS * 0.04 * a;
        P.headX = -P.bodyX * 0.6;
        rate = 16; armRate = 16;
      } else {
        // standing: wide planted power stance, but alive. Weight drifts from leg to leg (hip drops on the
        // loaded side, other knee softens), the spine curves a little, arms hang and sway like pendulums,
        // and every few seconds there is a fidget: a look around, a shoulder roll, a fist flex or a neck crack.
        const br = Math.sin(t * 1.6), shift = Math.sin(t * 0.37) * 0.8 + Math.sin(t * 0.9) * 0.2, sway = Math.sin(t * 1.15);
        P.chestX = -0.07 + br * 0.03; P.spineX = 0.04 + br * 0.01; P.bodyY = 1.11 + br * 0.008 - Math.abs(shift) * 0.012;
        P.bodyZ = shift * 0.055; P.chestY = Math.sin(t * 0.27) * 0.06; P.bodyYaw = Math.sin(t * 0.21) * 0.05;
        P.lHipZ = 0.15 - shift * 0.05; P.rHipZ = -0.15 - shift * 0.05; P.lAn = 0; P.rAn = 0;
        P.lHip = 0.05; P.rHip = -0.04; P.lKn = 0.1 + Math.max(0, -shift) * 0.16; P.rKn = 0.1 + Math.max(0, shift) * 0.16;
        P.L = { sx: -0.1 + sway * 0.035, sy: 0.15, sz: -0.28 - br * 0.025 - shift * 0.03, el: -0.4 - br * 0.05, curl: 0.9 };
        P.R = { sx: -0.06 - sway * 0.035, sy: -0.15, sz: 0.28 + br * 0.025 - shift * 0.03, el: -0.36 - br * 0.05, curl: 0.9 };
        P.headX = 0.06 + br * 0.015; P.headZ = -shift * 0.04;
        // fidgets
        this.fidgetT = (this.fidgetT ?? 4) - dt;
        if (this.fidgetT <= 0) { this.fidget = ['look', 'roll', 'fist', 'neck', 'look'][Math.floor(Math.random() * 5)]; this.fidgetDur = 1.6; this.fidgetT = 4.5 + Math.random() * 5; this.fidgetDir = Math.random() < 0.5 ? -1 : 1; }
        if (this.fidget && this.fidgetDur > 0) {
          this.fidgetDur -= dt;
          const f = Math.sin(Math.min(1, 1 - this.fidgetDur / 1.6) * Math.PI); // 0 -> 1 -> 0
          if (this.fidget === 'look') { this.lookOff = this.fidgetDir * 0.75 * f; P.chestY += this.fidgetDir * 0.12 * f; }
          if (this.fidget === 'roll') { P.chestX -= 0.12 * f; P.L.sx += 0.25 * Math.sin(f * Math.PI); P.R.sx += 0.25 * Math.sin(f * Math.PI); P.L.sz -= 0.1 * f; P.R.sz += 0.1 * f; }
          if (this.fidget === 'fist') { P.R.el = -1.3 * f - 0.36; P.R.sx -= 0.5 * f; P.R.curl = 0.5 + Math.abs(Math.sin(f * 9)) * 0.5; P.headX += 0.15 * f; this.lookOff = 0.35 * f; }
          if (this.fidget === 'neck') { P.headZ += this.fidgetDir * 0.35 * f; }
        }      }
    }

    // head follows the aim when attacking
    const aim = s.aimPitch;
    if (s.laser || s.charge > 0 || s.punchT > 0) P.headX = clamp(-aim - P.bodyX, -1.1, 0.9);
    P.headY = clamp(s.aimYawRel + (s.charge > 0 || s.laser || s.punchT > 0 ? 0 : (this.lookOff || 0)), -1.1, 1.1);

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
    // telekinesis: both arms raised forward, fingers spread, a little tremble of effort
    if (s.tk) {
      const tr = Math.sin(t * 23) * 0.015;
      P.L = { sx: -1.75 + tr, sy: -0.3, sz: -0.45, el: -0.35, curl: 0.05 }; P.R = { sx: -1.75 - tr, sy: 0.3, sz: 0.45, el: -0.35, curl: 0.05 };
      P.chestX -= 0.08; P.headX -= 0.1;
    }
    // thunderclap: arms swing wide, then slam together in front
    if (s.clapT > 0) {
      const u = 1 - s.clapT, open = u < 0.35 ? u / 0.35 : 0, shut = u >= 0.35 ? 1 : 0;
      P.L = { sx: -1.45, sy: -1.2 * open + 0.5 * shut, sz: -0.2, el: -0.1, curl: 0 }; P.R = { sx: -1.45, sy: 1.2 * open - 0.5 * shut, sz: 0.2, el: -0.1, curl: 0 };
      P.chestX = -0.15 * open + 0.1 * shut; P.spineX = 0.12 * shut;
      snap = shut && u < 0.5;
    }
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

    // being hit overrides the rest
    const knocked = this._knockPose(P, s, dt, sstep);
    if (knocked) { rate = 14; armRate = 15; }

    // Momentum from movement: lean into acceleration, bank into turns.
    const accF = clamp((s.accFwd || 0) / 50, -1, 1), accS = clamp((s.accSide || 0) / 50, -1, 1);
    if (s.flying) { P.bodyX += accF * 0.3; P.bodyZ -= accS * 0.35; }
    else if (s.grounded) { P.bodyX += accF * 0.18; P.bodyZ -= accS * 0.12; P.chestX -= accF * 0.06; }

    // Drive every joint with a damped spring instead of easing straight to the target: limbs carry
    // momentum, overshoot a touch and settle at different speeds, which reads as weight and follow-through.
    const sp = this.springs || (this.springs = new Map());
    const spring = (obj, key, target, w, z = 0.75) => {
      const id = obj.uuid ? obj.uuid + key : key;
      let st = sp.get(id);
      if (!st) { st = { x: obj[key] ?? 0, v: 0 }; sp.set(id, st); }
      const n = Math.max(1, Math.ceil(dt * w / 0.25)), h = dt / n;
      for (let i = 0; i < n; i++) {
        st.v += (w * w * (target - st.x) - 2 * z * w * st.v) * h;
        st.x += st.v * h;
      }
      obj[key] = st.x;
      return st;
    };
    this._spring = spring;
    const action = snap ? 2.2 : 1;
    const wBody = (rate > 12 ? 14 : 10) * action, wArm = (armRate > 12 ? 17 : 13) * action, wLeg = rate > 12 ? 24 : 15;
    const pos = this.body.position, rot = this.body.rotation;
    pos.uuid = this.body.uuid + 'p'; rot.uuid = this.body.uuid + 'r';
    spring(pos, 'y', P.bodyY, wBody * 1.1, 0.45);
    spring(rot, 'x', P.bodyX, wBody, 0.6); spring(rot, 'z', P.bodyZ, wBody * 0.8, 0.45); spring(rot, 'y', P.bodyYaw, wBody, 0.5);
    const spR = this.spine.rotation, chR = this.chest.rotation;
    spR.uuid = this.spine.uuid; chR.uuid = this.chest.uuid;
    spring(spR, 'x', P.spineX, wBody * 1.1, 0.5); spring(spR, 'y', P.spineY, wBody, 0.45);
    spring(chR, 'y', P.chestY, wBody * 1.15, 0.4); spring(chR, 'x', P.chestX, wBody, 0.5);
    // the head trails the body slightly and stabilises against the run
    const hR = this.head.rotation, nR = this.neck.rotation;
    hR.uuid = this.head.uuid; nR.uuid = this.neck.uuid;
    spring(hR, 'x', P.headX + (s.grounded && !s.flying ? -this.body.rotation.x * 0.15 : 0), 11, 0.6);
    spring(hR, 'z', P.headZ, 9, 0.55);
    spring(nR, 'y', P.headY - this.chest.rotation.y - this.body.rotation.y, 11, 0.7);
    for (const [side, A] of [[-1, P.L], [1, P.R]]) {
      const a = this.arms[side];
      const r1 = a.sh.rotation, r2 = a.el.rotation, r3 = a.fingers.rotation;
      r1.uuid = a.sh.uuid; r2.uuid = a.el.uuid; r3.uuid = a.fingers.uuid;
      spring(r1, 'x', A.sx, wArm, 0.42); spring(r1, 'y', A.sy, wArm, 0.5); spring(r1, 'z', A.sz, wArm, 0.45);
      spring(r2, 'x', A.el, wArm * 1.25, 0.38); // forearm lags and whips past the upper arm
      spring(r3, 'x', -A.curl * 1.7, 20, 0.8);
    }
    const lg = this.legs;
    for (const [side, hip, kn, an, hz] of [[-1, P.lHip, P.lKn, P.lAn, -P.lHipZ], [1, P.rHip, P.rKn, P.rAn, -P.rHipZ]]) {
      const l = lg[side];
      const r1 = l.hip.rotation, r2 = l.kn.rotation, r3 = l.an.rotation;
      r1.uuid = l.hip.uuid; r2.uuid = l.kn.uuid; r3.uuid = l.an.uuid;
      spring(r1, 'x', -hip, wLeg, 0.8); spring(r2, 'x', kn, wLeg * 1.1, 0.75); spring(r3, 'x', an, wLeg, 0.8);
      spring(r1, 'z', hz, wLeg * 0.7, 0.8); spring(r3, 'z', -hz, wLeg * 0.7, 0.8); // feet stay flat when the legs spread
    }
    this.punchFist = P.R.curl;

    this.jetMat.opacity = lerpA(this.jetMat.opacity, jet * (0.55 + Math.random() * 0.2), Math.min(1, dt * 12));
    // palm thrusters: drive flight, off for a clenched fist; flicker with a little noise
    const thrust = s.flying ? Math.min(1.3, 0.3 + clamp(s.fwdSpeed / 90, 0, 1) * 0.7 + (s.boost ? 0.3 : 0) + Math.max(0, s.vSpeed) / 40) : 0;
    this.thrust = lerpA(this.thrust, thrust, Math.min(1, dt * 8));
    if (this.handJets) {
      for (const j of this.handJets) {
        const open = 1 - Math.min(1, (j.side === 1 ? P.R.curl : P.L.curl));
        const k = this.thrust * open, fl = 0.85 + Math.random() * 0.3;
        j.g.visible = k > 0.02;
        j.core.scale.set(0.8 + k * 0.4, (0.4 + k) * fl, 0.8 + k * 0.4);
        j.outer.scale.set(0.8 + k * 0.5, (0.35 + k * 1.2) * fl, 0.8 + k * 0.5);
        j.k = k;
      }
      this.handJetMats[0].opacity = Math.min(1, this.thrust * 1.2);
      this.handJetMats[1].opacity = Math.min(0.75, this.thrust * 0.8);
    }
    if (this.glowMat) this.glowMat.emissiveIntensity = 2.4 + Math.sin(t * 2.2) * 0.3 + (s.charge > 0 ? Math.min(1, s.charge) * 4 : 0) + (s.laser ? 1.5 : 0);
    for (const side of [-1, 1]) lg[side].jet.scale.set(1, 0.6 + jet * 1.4 + Math.random() * 0.2, 1);
    const eyeBoost = s.laser ? 2.2 : 1 + (s.charge > 0 ? Math.min(1, s.charge) * 0.6 : 0);
    this.eyeMat.emissive.copy(this.eyeColor).multiplyScalar(1 / Math.max(this.eyeColor.r, this.eyeColor.g, this.eyeColor.b));
    this.eyeMat.emissiveIntensity = this.eyeIntensity * eyeBoost;
  }
}
