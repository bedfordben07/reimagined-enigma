// Crash-test dummy: a Verlet ragdoll. Standing still until something hits it, then pure physics.
// Fast-moving body parts smash through walls.
import * as THREE from 'three';
import { brushedMetalTex, pbr } from './textures.js?v=1795441931';
import { lathe, extrude, roundRect, smoothShape } from './geom.js?v=1795441931';
import { groundH, WORLD_HALF } from './world.js?v=1795441931';

// Lines it says, by situation.
// Boss waves: each variant tunes the same dummy (health, armour, speed, damage, dodging, colour).
export const VARIANTS = [
  { name: 'Rookie', hp: 260, armor: 0, dmg: 1.0, speed: 1.0, dodge: 0.3, cool: 1.3, poise: 40, tint: [1, 1, 1], glow: 0xff2214 },
  { name: 'Brawler', hp: 380, armor: 0, dmg: 1.4, speed: 1.1, dodge: 0.35, cool: 1.0, poise: 55, tint: [1.15, 0.85, 0.8], glow: 0xff6a10 },
  { name: 'Speedster', hp: 340, armor: 0, dmg: 1.1, speed: 1.7, dodge: 0.75, cool: 0.6, poise: 35, tint: [0.75, 0.95, 1.2], glow: 0x20c8ff },
  { name: 'Juggernaut', hp: 650, armor: 24, dmg: 1.6, speed: 0.85, dodge: 0.1, cool: 1.0, poise: 120, tint: [0.6, 0.6, 0.68], glow: 0xa040ff },
  { name: 'Champion', hp: 900, armor: 12, dmg: 1.8, speed: 1.4, dodge: 0.55, cool: 0.55, poise: 80, tint: [1.35, 1.1, 0.6], glow: 0xffc020 },
];
export const ACTIONS = ['idle', 'wave', 'taunt', 'cower', 'flee', 'approach', 'dance', 'point', 'shrug', 'punch', 'combo', 'throw', 'volley', 'charge', 'slam', 'car', 'leap'];
const ATTACKS = ['punch', 'combo', 'throw', 'volley', 'charge', 'slam', 'car', 'leap'];
const LINES = {
  punch: ['My turn!', 'Taste rubber!', 'Haaa-YAH!', 'Fist of fury!', 'Incoming!'],
  throw: ['Catch!', 'Eat brick!', 'Special delivery!', 'Fore!', 'Think fast!'],
  charge: ['CHAAARGE!', 'Here I come!', 'Full tackle!', 'Out of my way!'],
  combo: ['One-two-THREE!', 'Combo time!', 'Ora ora ora!', 'Hold still!'],
  volley: ['Rubble storm!', 'Incoming x3!', 'Dodge THIS!', 'Bricks for days!'],
  slam: ['Up we go!', 'Ground pound!', 'Heads up!'],
  car: ['Nice car. Mine now.', 'Hold my bolts...', 'Watch THIS!', 'Valet service!'],
  shrug: ['Is that it?', 'Tickles.', 'Nice try.', 'Barely felt it.', 'Again?'],
  bounce: ["OW! You're made of METAL!", 'Bad idea. Bad idea.', 'I regret that.', 'Like hitting a wall...'],
  scored: ['GOT YOU!', 'Ha! Bullseye!', 'How do YOU like it?', 'Point to the dummy!', 'Boom!'],
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
// braced pose held while tumbling: arms a little out, knees slightly bent
const BRACE = { ...POSE, lel: [-0.33, 1.15, 0.05], rel: [0.33, 1.15, 0.05], lha: [-0.42, 0.92, 0.12], rha: [0.42, 0.92, 0.12], lkn: [-0.14, 0.53, 0.08], rkn: [0.14, 0.53, 0.08], lft: [-0.15, 0.1, -0.02], rft: [0.15, 0.1, -0.02] };
const LIMBS = ['head', 'lel', 'rel', 'lha', 'rha', 'lkn', 'rkn', 'lft', 'rft'];
const ID = Object.fromEntries(NAMES.map((n, i) => [n, i]));
const G = -20;
// how far from the town centre it can roam (the flat ground around the town)
export const DUMMY_BOUND = WORLD_HALF - 300; // it follows you anywhere
const inTown = (x, z) => Math.abs(x) < 182 && Math.abs(z) < 182;
const clampB = (x) => Math.max(-DUMMY_BOUND, Math.min(DUMMY_BOUND, x));
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
    this.mood = 'idle'; this.moodT = 0; this.moodW = { wave: 0, cower: 0, taunt: 0, dizzy: 0, dance: 0, point: 0, shrug: 0, walk: 0, wind: 0, jab: 0, throwW: 0, throwF: 0, lean: 0 };
    this.atk = null; this.anger = 0; this.atkCool = 0; this.fights = true; this.runFast = false;
    // what it has learned about you: which attacks land, and whether you like to fight from the air
    this.stats = Object.fromEntries(ATTACKS.map((k) => [k, { tries: 0, hits: 0 }]));
    this.shedN = 0; this.airHabit = 0; this.lastKind = null; this.guardT = 0; this.counterT = 0; this.strafeT = 0; this.strafeSide = 1; this.lastHurt = 0; this.whiffUsed = false;
    this.poise = 45; this.stagger = 0; this.dodge = null;
    this.v = VARIANTS[0]; this.hp = this.v.hp; this.ko = false; this.onDamage = null; this.tintC = new THREE.Color(1, 1, 1);
    this.cmd = null; this.walkPh = 0; this.brainOn = false; this.brainMood = 'cheerful'; this.onEvent = null;
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
    // "Revenant": a sleek, menacing hunter. Dark brushed-gunmetal armour over a black carbon frame, a long
    // blade-crested helm with narrow slanted eye slits, a glowing core in the chest, angular pauldrons,
    // forearm blades, clawed hands and pointed greaves, all edged in a variant-coloured glow.
    const armor = pbr(brushedMetalTex(64, '#9aa2ad', 0.24), { metalness: 0.75, clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 1.7 }, THREE.MeshPhysicalMaterial);
    const plate = pbr(brushedMetalTex(65, '#5d646e', 0.28), { metalness: 0.8, clearcoat: 0.6, clearcoatRoughness: 0.25 }, THREE.MeshPhysicalMaterial);
    const carbon = new THREE.MeshPhysicalMaterial({ color: 0x15171b, roughness: 0.35, metalness: 0.6, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    const edge = pbr(brushedMetalTex(66, '#8d939c', 0.22), { metalness: 1 });
    const visor = new THREE.MeshPhysicalMaterial({ color: 0x040506, roughness: 0.3, metalness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.35 });
    this.glowMat = new THREE.MeshStandardMaterial({ color: 0x1a0000, emissive: 0xff2214, emissiveIntensity: 3.2, roughness: 0.3 });
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a18, emissiveIntensity: 9, roughness: 0.2 });
    const eyeCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.2, 2.6) });
    this.mats = [armor, plate, edge];
    this.baseColors = this.mats.map((m) => m.color.clone());
    this.group = new THREE.Group(); this.shedable = [];
    const M = (geo, mat, parent = this.group) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    const poly = (pts) => { const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath(); return sh; };

    // ---- head: a long, narrow helm swept back to a point, with a blade crest and a black visor band
    this.head = new THREE.Group(); this.group.add(this.head);
    const skull = M(lathe([[0, 0.165], [0.055, 0.158], [0.095, 0.12], [0.112, 0.05], [0.108, -0.03], [0.09, -0.095], [0.055, -0.145], [0, -0.16]], 48, 0, Math.PI * 2, 4), armor, this.head);
    skull.scale.set(0.9, 1, 1.15);
    // jaw guard: a pointed chin plate
    const jaw = M(extrude(poly([[-0.075, 0.0], [0.075, 0.0], [0.05, -0.06], [0, -0.1], [-0.05, -0.06]]), 0.05, 0.008, 2), new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.6, metalness: 0.3 }), this.head);
    jaw.position.set(0, -0.06, 0.06); jaw.scale.set(0.85, 0.8, 1); jaw.rotation.x = -0.25;
    // visor band across the eyes
    const vb = M(new THREE.SphereGeometry(0.115, 40, 20, -Math.PI * 0.34 + Math.PI / 2, Math.PI * 0.68, Math.PI * 0.32, Math.PI * 0.66), visor, this.head);
    vb.position.z = 0.004;
    vb.scale.set(0.93, 1, 1.17);
    // crest: a thin blade running from the brow over the crown
    const crest = M(extrude(poly([[0.1, 0.11], [0.06, 0.19], [-0.06, 0.215], [-0.19, 0.17], [-0.12, 0.15], [0.0, 0.16]]), 0.012, 0.004, 2), edge, this.head);
    crest.rotation.y = Math.PI / 2; this.shedable.push(crest);
    // swept-back cheek blades
    for (const sx of [-1, 1]) {
      const fin = M(extrude(poly([[0.05, 0.0], [-0.12, 0.05], [-0.16, 0.02], [-0.02, -0.04]]), 0.01, 0.004, 2), plate, this.head);
      fin.position.set(0.1 * sx, 0.02, -0.01); fin.rotation.y = Math.PI / 2 + sx * 0.15; this.shedable.push(fin);
    }
    // eyes: narrow slits slanting down toward the centre, a white-hot core in each
    this.eyesD = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group(); eye.position.set(0.045 * sx, 0.042, 0.128); eye.rotation.y = sx * 0.3; this.head.add(eye);
      const ball = M(extrude(poly([[-0.036 * sx, -0.014], [0.036 * sx, 0.004], [0.034 * sx, 0.016], [-0.038 * sx, -0.002]]), 0.008, 0.002, 1), this.eyeMat, eye);
      ball.castShadow = false; ball.scale.z = 0.6;
      const pu = M(new THREE.SphereGeometry(0.004, 8, 6), eyeCore, eye); pu.castShadow = false; pu.visible = false;
      // brow ridge: an armour plate that juts over the eye, angled into a permanent scowl
      const brow = M(extrude(poly([[-0.04 * sx, -0.016], [0.034 * sx, 0.006], [0.034 * sx, 0.0], [-0.04 * sx, -0.026]]), 0.03, 0.003, 1), plate, this.head);
      brow.position.set(0.045 * sx, 0.078, 0.11);
      this.eyesD.push({ eye, ball, pu, brow, sx });
    }
    // mouth: a faint grille slit that flares when it talks
    M(extrude(roundRect(0.05, 0.005, 0.0025), 0.006, 0.002), this.glowMat, this.head).position.set(0, -0.055, 0.118);
    this.mouth = this.head.children[this.head.children.length - 1];
    // neck: stacked carbon rings
    const rib = []; for (let i = 0; i <= 8; i++) rib.push([i % 2 ? 0.036 : 0.046, 0.075 - i * 0.019]);
    this.neckM = M(lathe(rib, 24), carbon);

    // ---- torso: a V-shaped armoured chest over a narrow carbon waist, a glowing core at the sternum
    this.torso = new THREE.Group(); this.group.add(this.torso);
    M(lathe([[0, 0.27], [0.14, 0.26], [0.205, 0.2], [0.2, 0.1], [0.16, -0.02], [0.12, -0.14], [0.1, -0.2], [0, -0.21]], 48, 0, Math.PI * 2, 3), carbon, this.torso).scale.z = 0.62;
    const chestPlate = extrude(poly([[0, -0.14], [0.06, -0.1], [0.17, 0.08], [0.19, 0.17], [0.1, 0.2], [0.03, 0.13], [0, 0.14], [-0.03, 0.13], [-0.1, 0.2], [-0.19, 0.17], [-0.17, 0.08], [-0.06, -0.1]]), 0.04, 0.012, 2);
    M(chestPlate, armor, this.torso).position.set(0, 0.04, 0.095);
    for (const sx of [-1, 1]) { const seam = M(extrude(poly([[0.0, -0.12], [0.012 * sx, -0.12], [0.175 * sx, 0.09], [0.163 * sx, 0.1]]), 0.006, 0.002, 1), this.glowMat, this.torso); seam.position.set(0, 0.04, 0.125); seam.castShadow = false; }
    const core = M(new THREE.OctahedronGeometry(0.03, 0), this.glowMat, this.torso); core.position.set(0, 0.11, 0.135); core.scale.set(0.8, 1.2, 0.5); core.castShadow = false;
    // abdomen plates
    for (let i = 0; i < 3; i++) { const ab = M(extrude(roundRect(0.11 - i * 0.012, 0.035, 0.01), 0.02, 0.006, 2), plate, this.torso); ab.position.set(0, -0.08 - i * 0.045, 0.085 - i * 0.008); }
    // spine fins down the back
    for (let i = 0; i < 4; i++) { const f = M(extrude(poly([[0, 0], [-0.07, 0.04], [-0.05, -0.01]]), 0.008, 0.003, 1), edge, this.torso); f.position.set(0, 0.22 - i * 0.08, -0.115); f.rotation.y = Math.PI / 2; f.scale.setScalar(1 - i * 0.15); }
    const waist = []; for (let i = 0; i <= 6; i++) waist.push([i % 2 ? 0.1 : 0.115, 0.06 - i * 0.02]);
    M(lathe(waist, 32), carbon, this.torso).position.y = -0.24;
    this.torso.children[this.torso.children.length - 1].scale.z = 0.7;
    this.pelvis = new THREE.Group(); this.group.add(this.pelvis);
    M(lathe([[0, 0.07], [0.125, 0.065], [0.15, 0.0], [0.12, -0.07], [0.05, -0.11], [0, -0.11]], 40, 0, Math.PI * 2, 3), plate, this.pelvis).scale.z = 0.7;
    // a tasset plate hanging at each hip and a glowing belt line
    for (const sx of [-1, 1]) { const t = M(extrude(poly([[-0.05, 0.03], [0.05, 0.03], [0.04, -0.09], [0, -0.12], [-0.04, -0.09]]), 0.015, 0.005, 1), armor, this.pelvis); t.position.set(0.12 * sx, -0.03, 0.03); t.rotation.y = sx * 1.1; this.shedable.push(t); }
    const belt = M(new THREE.TorusGeometry(0.142, 0.007, 8, 48), this.glowMat, this.pelvis); belt.rotation.x = Math.PI / 2; belt.position.y = 0.05; belt.scale.y = 0.72; belt.castShadow = false;

    // ---- limbs: slim and tapered, armour shells over the upper segments, blades on the forearms
    this.limbs = [];
    const limb = (a, b, r0, r1, mat) => {
      const A = POSE[a], B = POSE[b];
      const L = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
      const g = lathe([[0, -L / 2 - r0 * 0.4], [r0 * 0.8, -L / 2], [r0, -L / 2 + L * 0.25], [r1 * 1.08, L * 0.2], [r1, L / 2], [0, L / 2 + r1 * 0.35]], 28, 0, Math.PI * 2, 3);
      const m = M(g, mat);
      this.limbs.push([ID[a], ID[b], m]);
      return m;
    };
    limb('lsh', 'lel', 0.05, 0.036, armor); limb('rsh', 'rel', 0.05, 0.036, armor);
    for (const [a, b] of [['lel', 'lha'], ['rel', 'rha']]) {
      const fa = limb(a, b, 0.044, 0.03, plate);
      // forearm blade along the outside edge
      const sx = a[0] === 'l' ? -1 : 1;
      const bl = new THREE.Mesh(extrude(poly([[0, 0.12], [0.035, 0.07], [0.03, -0.12], [0.0, -0.08]]), 0.008, 0.003, 1), edge);
      const be = new THREE.Mesh(extrude(poly([[0.035, 0.07], [0.039, 0.07], [0.034, -0.12], [0.03, -0.12]]), 0.009, 0.001, 1), this.glowMat); bl.add(be);
      bl.castShadow = true; bl.position.set(0.038 * sx, 0.0, -0.01); bl.rotation.y = sx > 0 ? 0 : Math.PI; bl.rotation.z = 0;
      fa.add(bl);
    }
    limb('lhp', 'lkn', 0.07, 0.046, armor); limb('rhp', 'rkn', 0.07, 0.046, armor);
    for (const [a, b] of [['lkn', 'lft'], ['rkn', 'rft']]) {
      const sh = limb(a, b, 0.052, 0.032, plate);
      // greave: a pointed shin guard
      const gv = new THREE.Mesh(extrude(poly([[-0.045, 0.17], [0.045, 0.17], [0.035, -0.12], [0, -0.16], [-0.035, -0.12]]), 0.012, 0.005, 1), armor);
      gv.castShadow = true; gv.position.set(0, 0.0, 0.042); sh.add(gv); this.shedable.push(gv);
    }
    // joints: carbon balls with a thin glowing ring
    this.joints = [];
    for (const k of ['lel', 'rel', 'lkn', 'rkn', 'lsh', 'rsh']) {
      const g = new THREE.Group(); this.group.add(g);
      const big = k.endsWith('kn');
      M(new THREE.SphereGeometry(big ? 0.05 : 0.04, 18, 12), carbon, g);
      this.joints.push([ID[k], g]);
    }
    // clawed hands
    this.hands = [ID.lha, ID.rha].map((i, n) => {
      const g = new THREE.Group(); this.group.add(g);
      M(lathe([[0, 0.02], [0.036, 0.0], [0.042, -0.045], [0.032, -0.07], [0, -0.075]], 20, 0, Math.PI * 2, 3), carbon, g).scale.z = 0.6;
      for (let f = 0; f < 3; f++) {
        const c = M(new THREE.ConeGeometry(0.009, 0.07, 6), edge, g);
        c.position.set((f - 1) * 0.022, -0.1, 0.012); c.rotation.x = 0.35;
      }
      const th = M(new THREE.ConeGeometry(0.009, 0.05, 6), edge, g); th.position.set((n ? -1 : 1) * 0.04, -0.05, 0.02); th.rotation.z = (n ? -1 : 1) * 0.8;
      const cuff = M(lathe([[0.044, 0.03], [0.05, 0.0], [0.044, -0.02]], 20), armor, g); cuff.position.y = 0.025; cuff.scale.z = 0.7;
      return [i, g];
    });
    // pointed armoured boots
    const shoe = extrude(smoothShape([[-0.07, 0], [0.12, 0], [0.2, 0.015], [0.1, 0.06], [0.0, 0.085], [-0.07, 0.08]]), 0.08, 0.015, 3);
    this.feet = [ID.lft, ID.rft].map((i) => { const g = new THREE.Group(); this.group.add(g); const sh = M(shoe, plate, g); sh.rotation.y = -Math.PI / 2; sh.position.y = -0.07; return [i, g]; });

    // ---- pauldrons: layered, angled plates with a spike, plus knee spikes and glowing elbow/knee rings
    for (const [i, g] of this.joints) {
      const name = NAMES[i], sx = name[0] === 'l' ? -1 : 1;
      if (name.endsWith('sh')) {
        for (let l = 0; l < 2; l++) {
          const p = M(lathe([[0, 0.085], [0.06, 0.08], [0.105, 0.045], [0.12, 0.0], [0.11, -0.025], [0, -0.025]], 6, 0, Math.PI * 2, 0), l ? plate : armor, g);
          p.position.set((0.04 + l * 0.02) * sx, 0.04 - l * 0.045, 0); p.rotation.z = -sx * (0.55 + l * 0.25); p.scale.set(1 - l * 0.15, 0.85, 1.2 - l * 0.15); this.shedable.push(p);
        }
        const sp = M(new THREE.ConeGeometry(0.018, 0.11, 8), edge, g); sp.position.set(0.07 * sx, 0.1, -0.01); sp.rotation.z = -sx * 0.6;
      }
      if (name.endsWith('kn')) { const s2 = M(new THREE.ConeGeometry(0.02, 0.08, 6), edge, g); s2.position.set(0, 0.0, 0.07); s2.rotation.x = Math.PI / 2; }
      if (name.endsWith('el') || name.endsWith('kn')) { const r = M(new THREE.TorusGeometry(name.endsWith('kn') ? 0.052 : 0.043, 0.005, 8, 32), this.glowMat, g); r.rotation.y = Math.PI / 2; r.castShadow = false; }
    }
    // scarf: two tails simulated as short Verlet chains, drawn as ribbons
    this.scarfMat = new THREE.MeshStandardMaterial({ color: 0x4a0b0e, roughness: 0.8, side: THREE.DoubleSide });
    const knot = M(new THREE.TorusGeometry(0.07, 0.022, 10, 28), carbon, this.group); this.scarfKnot = knot;
    this.scarf = [0, 1].map((k) => {
      const n = 8, pts = [], prev = [];
      for (let i = 0; i < n; i++) { pts.push(new THREE.Vector3()); prev.push(new THREE.Vector3()); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, this.scarfMat); mesh.castShadow = true; mesh.frustumCulled = false; mesh.userData.noOutline = true;
      this.group.add(mesh);
      return { pts, prev, mesh, len: k ? 0.11 : 0.125, side: k ? 1 : -1, init: false };
    });
    this.scene.add(this.group);
  }

  spawn(pos, yaw) {
    this.root.copy(pos); this.yaw = yaw; this.mode = 'stand'; this.burn = 0; this.atk = null; this.atkCool = 1.5;
    this.ko = false; this.hp = this.v.hp; this.poise = this.v.poise;
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
    if (this.ko) { for (let i = 0; i < this.n; i++) this.o[i].addScaledVector(vel, -0.5 * this.h); return true; } // knocked out: just a ragdoll
    // armour: a Juggernaut ignores anything that isn't a heavy blow
    const spd0 = vel.length();
    if (this.v.armor && spd0 < this.v.armor && !this.frozen) {
      if (spd0 > 6) { this.say(['*CLANG*', 'Armour, baby.', 'Not even a scratch.']); this.ctx.clang?.(center); }
      return true;
    }
    // damage
    if (spd0 > 2) this.takeDamage((spd0 - this.v.armor * 0.5) * 0.55);
    // poise: while on its feet it shrugs off lighter hits with a stagger, until the poise breaks
    const spd = vel.length();
    if (this.frozen) this.frozenHits = (this.frozenHits || 0) + 1; // stored: it all lands when time resumes
    if (this.mode === 'stand' && !this.frozen && !this.ko && this.atk?.phase !== 'air' && spd < 32 && this.poise > spd * 0.6) {
      this.poise -= (spd * 0.6 + 3) * (this.ctx.poiseMul?.() ?? 1);
      this.stagger = Math.max(this.stagger || 0, 0.25 + spd * 0.01);
      this.root.x += vel.x * 0.02; this.root.z += vel.z * 0.02;
      if (spd > 6) { this.say(LINES.shrug); this.anger += 0.5; }
      return true;
    }
    this.poise = 0;
    if (this.atk?.car && this.atk.car.held === 'dummy') this.ctx.dropCar?.(this.atk.car);
    if (this.mode === 'stand' || this.mode === 'getup') this.mode = 'ragdoll';
    this.atk = null; this.runFast = false; this.dodge = null;
    this.restT = 0;
    for (let i = 0; i < this.n; i++) {
      const d = this.p[i].distanceTo(center);
      const f = Math.max(minFrac, 1 - d / (radius * 1.6));
      this.o[i].addScaledVector(vel, -f * this.h);
    }
    this.lastHitTime = performance.now(); this.lastHurt = this.time;
    // heavy blows send it cartwheeling: spin the whole body about the axis across the hit
    if (spd0 > 28) {
      const com = _c.set(0, 0, 0); for (let i = 0; i < this.n; i++) com.add(this.p[i]); com.multiplyScalar(1 / this.n);
      const axis = _d.set(0, 1, 0).cross(_e.copy(vel).setY(0)).normalize();
      if (axis.lengthSq() > 0.5) {
        const w = Math.min(16, spd0 * 0.14) * (Math.random() < 0.3 ? -0.6 : 1);
        for (let i = 0; i < this.n; i++) { const r = _a.subVectors(this.p[i], com); this.o[i].addScaledVector(_b.crossVectors(axis, r), -w * this.h); }
      }
    }
    if (spd0 > 6) this.ctx.sparks?.(center.clone(), Math.min(1, spd0 / 50));
    const sp = vel.length();
    this.slack = Math.min(0.25, 0.05 + sp * 0.003);
    if (sp > 3) this.anger += sp > 45 ? 2.2 : 1;
    this.atk = null;
    if (sp > 45) this.bigHit = 1;
    if (sp > 3) this.say(sp > 45 ? LINES.big : LINES.hit, sp > 45);
    if (sp > 3) this.onEvent?.(sp > 45 ? 'You just got hit extremely hard and sent flying.' : 'You just got hit.');
    this.cmd = null;
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

  grab(target) { if (this.atk?.car && this.atk.car.held === 'dummy') this.ctx.dropCar?.(this.atk.car); this.atk = null; this.restT = 0; this.heldSince = this.time; this.say(LINES.grabbed, true); this.onEvent?.('The player grabbed you and is holding you over their head.'); this.cmd = null; this.mode = 'held'; this.holdTarget.copy(target); }
  release(vel) {
    this.mode = 'ragdoll'; this.bigHit = 1; this.anger += 1.5; this.atk = null;
    if (vel.length() > 30) { this.say(LINES.thrown, true); this.onEvent?.('The player just threw you as hard as they can.'); }
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
    let gy = inTown(mid.x, mid.z) ? 0 : groundH(mid.x, mid.z);
    for (let y = mid.y + 0.4; y > gy; y -= 0.25) { if (this.voxels.solidAt(mid.x, y, mid.z)) { gy = (Math.floor(y / 0.5) + 1) * 0.5; break; } }
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
      const T1 = 0.35, T2 = 0.45; // springs back up like a fighter
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
        this.atkCool = Math.min(this.atkCool, 0.15); // straight back into it
        if (this.bigHit && !this.fights) { this.mood = 'dizzy'; this.moodT = 1.6; this.moodW.dizzy = 1; this.say(['Whoa... stars...', 'Which one of you is real?', '...ow.']); }
        else { this.mood = 'taunt'; this.moodT = 2.2; this.moodW.taunt = 1; this.say(LINES.getup); }
        this.onEvent?.(this.bigHit ? 'You got back up after a huge hit and you are dizzy.' : 'You got back on your feet.');
        this.bigHit = 0;
      }
      return;
    }
    if (this.mode === 'ragdoll') {
      let maxV = 0;
      for (let i = 0; i < this.n; i++) maxV = Math.max(maxV, this.p[i].distanceToSquared(this.o[i]));
      if (!this.ko && Math.sqrt(maxV) / h < 1.4) { this.restT += h; if (this.restT > (this.fights ? 0.2 : 0.4)) { this.restT = 0; this._startGetup(); return; } }
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
    if (this.mode === 'ragdoll') this._muscles(h);
    this._collide(h);
  }

  // Active ragdoll: the limbs keep trying to hold a braced pose relative to the torso, so the dummy
  // tumbles as one stiff body instead of flopping. Muscles go slack for a moment after each hit.
  _muscles(h) {
    this.slack = Math.max(0, (this.slack || 0) - h);
    const k = this.slack > 0 ? 0.012 : 0.07;
    const P = this.p;
    const mid = _a.addVectors(P[ID.lhp], P[ID.rhp]).multiplyScalar(0.5);
    const sh = _b.addVectors(P[ID.lsh], P[ID.rsh]).multiplyScalar(0.5);
    _up.subVectors(sh, mid).normalize();
    _rt.subVectors(P[ID.rsh], P[ID.lsh]).add(_v.subVectors(P[ID.rhp], P[ID.lhp]));
    _rt.addScaledVector(_up, -_rt.dot(_up)).normalize();
    _fw.crossVectors(_rt, _up);
    for (const name of LIMBS) {
      const i = ID[name], b = BRACE[name];
      _c.copy(mid).addScaledVector(_rt, b[0]).addScaledVector(_up, b[1] - 0.95).addScaledVector(_fw, b[2]);
      _d.subVectors(_c, P[i]).multiplyScalar(k);
      P[i].add(_d); this.o[i].addScaledVector(_d, 0.6); // mostly a position correction, little added energy
    }
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
            if (Math.random() < 0.3) { this.say(LINES.wall); this.onEvent?.('You were smashed through a wall.'); }
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
      const gy = inTown(p.x, p.z) ? 0 : groundH(p.x, p.z);
      if (p.y < gy + r) {
        p.y = gy + r;
        _v.subVectors(p, o);
        if (_v.y < 0) _v.y = -_v.y * 0.25;
        _v.x *= 0.7; _v.z *= 0.7;
        o.subVectors(p, _v);
      }
    }
  }

  // Scarf tails: anchored behind the neck, swing with gravity and stream back as the dummy moves.
  _updateScarf(dt, mid, sh) {
    const P = this.p;
    const anchor = _e.copy(P[ID.neck]).addScaledVector(_fw, -0.07).addScaledVector(_up, -0.02);
    this.scarfKnot.position.copy(P[ID.neck]).addScaledVector(_up, -0.03);
    this.scarfKnot.quaternion.setFromUnitVectors(_y, _up);
    const h = Math.min(dt, 1 / 30), frozen = this.frozen;
    for (const t of this.scarf) {
      const { pts, prev } = t;
      const a = _c.copy(anchor).addScaledVector(_rt, t.side * 0.04);
      if (!t.init) { for (let i = 0; i < pts.length; i++) { pts[i].copy(a).addScaledVector(_fw, -i * t.len); prev[i].copy(pts[i]); } t.init = true; }
      if (!frozen) {
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i], o = prev[i];
          _d.subVectors(p, o).multiplyScalar(0.96);
          o.copy(p); p.add(_d);
          p.y -= 9 * h * h;
          // a little flutter
          p.addScaledVector(_rt, Math.sin(this.time * 9 + i * 0.9 + t.side) * 0.0015 * i);
        }
        pts[0].copy(a); prev[0].copy(a);
        for (let it = 0; it < 4; it++) for (let i = 1; i < pts.length; i++) {
          _d.subVectors(pts[i], pts[i - 1]); const L = _d.length() || 1e-6;
          pts[i].copy(pts[i - 1]).addScaledVector(_d, t.len / L);
          if (pts[i].y < 0.02) pts[i].y = 0.02;
        }
      }
      // ribbon: two vertices per point, tapering toward the tip
      const arr = t.mesh.geometry.attributes.position.array;
      for (let i = 0; i < pts.length; i++) {
        const w = 0.045 * (1 - i / pts.length * 0.55);
        arr[i * 6] = pts[i].x - _rt.x * w; arr[i * 6 + 1] = pts[i].y - _rt.y * w; arr[i * 6 + 2] = pts[i].z - _rt.z * w;
        arr[i * 6 + 3] = pts[i].x + _rt.x * w; arr[i * 6 + 4] = pts[i].y + _rt.y * w; arr[i * 6 + 5] = pts[i].z + _rt.z * w;
      }
      t.mesh.geometry.attributes.position.needsUpdate = true;
      t.mesh.geometry.computeVertexNormals();
    }
  }

  setVariant(v) { for (const m of this.shedable || []) m.visible = true; this.shedN = 0; this.v = v; this.tintC.setRGB(v.tint[0], v.tint[1], v.tint[2]); this.hp = v.hp; this.poise = v.poise; if (v.glow != null) { this.glowMat.emissive.set(v.glow); this.eyeMat.emissive.set(v.glow); } }

  // Lose health (scaled by the player's damage upgrades); knocks it out at zero.
  takeDamage(dmg) {
    if (this.ko) return;
    dmg *= this.ctx.dmgMul?.() ?? 1;
    this.hp -= dmg; this.lastHurt = this.time;
    this.onDamage?.(dmg);
    // armour comes away as it takes damage
    const frac = Math.max(0, this.hp / this.v.hp);
    while (this.shedN < 4 && frac < 1 - (this.shedN + 1) * 0.2) this._shed();
    if (this.hp <= 0 && !this.ko) { this.hp = 0; this.ko = true; this.mode = 'ragdoll'; this.atk = null; this.say(['I... need a... nap...', 'Tell my creator... I tried...', 'Ow. Okay. You win.'], true); this.onKO?.(this); }
  }

  // knock a couple of armour pieces off (they fly away as rubble)
  _shed() {
    this.shedN++;
    const left = (this.shedable || []).filter((m) => m.visible);
    for (let k = 0; k < 2 && left.length; k++) {
      const m = left.splice(Math.floor(Math.random() * left.length), 1)[0];
      m.visible = false;
      this.ctx.shed?.(m.getWorldPosition(new THREE.Vector3()));
    }
    this.say(['My ARMOUR!', 'That was load-bearing!', 'You will PAY for that paint job.'], true);
  }

  // Cap how fast stored-up hits can launch it (frozen time can stack a lot of momentum).
  clampSpeed(max) {
    for (let i = 0; i < this.n; i++) {
      _v.subVectors(this.p[i], this.o[i]); const sp = _v.length() * 120;
      if (sp > max) this.o[i].copy(this.p[i]).addScaledVector(_v, -max / sp);
    }
  }

  // ------------------------------------------------------------ personality
  say(lines, force = false) {
    const now = performance.now();
    if (!force && now - this.lastSay < 1600) return;
    this.lastSay = now;
    this.speech = { text: Array.isArray(lines) ? lines[Math.floor(Math.random() * lines.length)] : lines, t: 2.4 };
  }

  // A scripted action override: plays for `secs` seconds.
  command(name, secs = 3) {
    if (!ACTIONS.includes(name)) name = 'idle';
    if (ATTACKS.includes(name)) { if (this.mode === 'stand' && this.fights) this.startAttack(name, true); return; }
    this.cmd = { name, t: Math.max(1, Math.min(6, secs || 3)) };
  }

  startAttack(kind, quiet = false, fast = false) {
    this.atk = { kind, phase: kind === 'throw' || kind === 'volley' ? 'windup' : kind === 'slam' || kind === 'leap' ? 'crouch' : 'approach', t: 0, n: 0, fast };
    if (this.stats[kind] && kind !== 'leap') { this.stats[kind].tries++; this.lastKind = kind; }
    if (kind === 'car') { this.atk.car = this.ctx.nearestCar?.(this.root, 22); if (!this.atk.car) { this.atk = null; return this.startAttack('volley', quiet); } this.atk.phase = 'fetch'; }
    this.anger = Math.max(0, this.anger - 0.6);
    this.atkCool = (Math.max(0.25, 0.85 - this.anger * 0.2) + Math.random() * 0.4) * this.v.cool; // relentless, and angrier = faster still
    if (kind !== 'leap' && (!quiet || !this.speech)) this.say(LINES[kind] || LINES.punch, true);
    const what = { punch: 'punch', combo: 'hit with a three-punch combo', throw: 'throw rubble at', volley: 'hurl a volley of rubble at', charge: 'tackle', slam: 'leap at and ground-slam', car: 'pick up a parked car and throw it at', leap: 'leap after' }[kind];
    if (kind !== 'leap') this.onEvent?.(`You decided to ${what} the player.`);
  }

  // The player was hit by our last attack: remember that it works.
  noteHit() { if (this.lastKind && this.stats[this.lastKind]) this.stats[this.lastKind].hits++; this.anger = Math.max(0, this.anger - 0.2); }

  // Pick the attack that suits the range: up close combos, mid range leaps and tackles, far away volleys.
  // It weighs every option by range, by how well each attack has worked on you so far, by whether you
  // tend to fight from the air, and goes for the heavy hitters when you're nearly finished.
  _chooseAttack(d, air, ctx = {}) {
    const w = {};
    const add = (k, x) => { w[k] = (w[k] || 0) + x; };
    const car = d > 7 && this.ctx.nearestCar?.(this.root, 18);
    if (air) { add('volley', 3); add('slam', 2.5); add('throw', 1); if (car) add('car', 2.5); }
    else if (d < 4) { add('combo', 3); add('punch', 1.5); add('slam', 0.6); }
    else if (d < 16) { add('slam', 2); add('charge', 2.2); add('combo', 1); if (car) add('car', 1); }
    else { add('volley', 2); add('charge', 1.6); add('throw', 1); add('slam', 0.8); if (car) add('car', 2); }
    // habits: an air fighter gets more ranged attacks; a ground fighter more rushes
    const h = this.airHabit;
    for (const k of ['volley', 'throw', 'car']) if (w[k]) w[k] *= 1 + h;
    for (const k of ['combo', 'charge']) if (w[k]) w[k] *= 1.4 - h * 0.6;
    if (ctx.playerHp != null && ctx.playerHp < 0.3) { if (w.charge) w.charge *= 1.8; if (w.slam) w.slam *= 1.8; if (w.car) w.car *= 1.5; }
    // learning: success rate shifts the odds (a Bayesian-ish running estimate)
    for (const k in w) { const st = this.stats[k]; w[k] *= 0.5 + 2 * (st.hits + 1) / (st.tries + 3); }
    // never the same thing three times running
    if (this.prevKinds && this.prevKinds[0] === this.prevKinds[1] && w[this.prevKinds[0]]) w[this.prevKinds[0]] *= 0.25;
    let sum = 0; for (const k in w) sum += w[k];
    let r = Math.random() * sum, pick = 'punch';
    for (const k in w) { r -= w[k]; if (r <= 0) { pick = k; break; } }
    this.prevKinds = [pick, (this.prevKinds || [])[0]];
    return pick;
  }

  // Where it would stand at (x, z): the top of whatever is below `fromY`, or the street.
  _groundAt(x, z, fromY) {
    if (!inTown(x, z)) return groundH(x, z);
    for (let y = fromY; y > 0; y -= 0.25) if (this.voxels.solidAt(x, y, z)) return (Math.floor(y / 0.5) + 1) * 0.5;
    return 0;
  }

  // Sidestep a punch it sees coming.
  tryDodge(punchDir) {
    const guarding = this.guardT > 0;
    const chance = guarding ? Math.max(this.v.dodge, 0.75) : Math.max(this.v.dodge, 0.4);
    if (this.mode !== 'stand' || this.dodge || this.time - (this.lastDodge || 0) < (guarding ? 1.1 : 2) || Math.random() > chance) return false;
    const side = Math.random() < 0.5 ? -1 : 1;
    this.dodge = { x: -punchDir.z * side, z: punchDir.x * side, t: 0.24 };
    this.lastDodge = this.time; this.atk = null;
    this.counterT = 0.26; // the moment the sidestep ends, it hits back
    this.say(['Too slow!', 'Missed me!', 'Saw that coming.', 'Predictable.'], true);
    this.onEvent?.('You dodged the player\'s punch.');
    return true;
  }

  // Runs the current attack. Returns the direction to face.
  _attack(dt, ctx, d, dx, dz, want) {
    const A = this.atk, toP = Math.atan2(dx, dz);
    A.t += dt;
    const next = (phase) => { A.phase = phase; A.t = 0; };
    const dirToPlayer = () => new THREE.Vector3(dx, 0, dz).normalize();
    const strike = (power, kind) => { if (d < 3.0 && Math.abs(ctx.playerPos.y - this.root.y) < 2.5) { this.ctx.hitPlayer?.(dirToPlayer(), power, kind); return true; } return false; };
    if (A.kind === 'punch' || A.kind === 'combo') {
      const hits = A.kind === 'combo' ? 3 : 1;
      if (A.phase === 'approach') {
        if (d < 2.1) next('windup');
        else if (A.t > 4 || d > 35 || !this._walk(dt, toP, A.fast ? 11 : 8, true)) this.atk = null;
        else { want.walk = 1; want.lean = 0.4; this.runFast = true; }
      } else if (A.phase === 'windup') {
        this.runFast = false;
        want.wind = 1;
        if (d > 2.1 && d < 6) { this._walk(dt, toP, 7); want.walk = 0.6; } // press forward between blows
        if (A.t > (A.n === 0 ? (A.fast ? 0.07 : 0.2) : 0.09)) {
          next('strike'); A.n++;
          const last = A.n >= hits;
          if (strike(last ? (hits === 3 ? 40 : 34) : 2, A.n === 3 ? 'uppercut' : last ? 'punch' : 'jab') && last) this.say(LINES.scored, true);
          this.ctx.whoosh?.();
        }
      } else if (A.phase === 'strike') { want.jab = 1; if (A.t > 0.14) next(A.n < hits ? 'windup' : 'recover'); }
      else { want.jab = 0.4; if (A.t > 0.3) this.atk = null; }
    } else if (A.kind === 'throw' || A.kind === 'volley') {
      const n = A.kind === 'volley' ? 3 : 1;
      if (A.phase === 'windup') { want.throwW = 1; if (A.t > (A.n === 0 ? 0.45 : 0.18)) { next('follow'); A.n++; this.ctx.throwRock?.(this.p[ID.rha].clone(), A.n > 1 ? (A.n === 2 ? -1 : 1) : 0, A.kind === 'throw' ? 1.3 : 0.9); } }
      else { want.throwF = 1; if (A.t > 0.22) { if (A.n < n) next('windup'); else this.atk = null; } }
    } else if (A.kind === 'car') {
      const car = A.car;
      if (!car || (car.held && car.held !== 'dummy')) { this.atk = null; return toP; }
      if (A.phase === 'fetch') {
        const cx = car.p.x - this.root.x, cz = car.p.z - this.root.z, cd = Math.hypot(cx, cz);
        if (cd < 3) { this.ctx.holdCar(car); next('lift'); }
        else if (A.t > 5 || !this._walk(dt, Math.atan2(cx, cz), 7)) this.atk = null;
        else { want.walk = 1; this.runFast = true; return Math.atan2(cx, cz); }
      } else {
        this.runFast = false;
        // hoist it overhead, lean back, then heave it
        const u = Math.min(1, A.t / 0.5);
        const lift = A.phase === 'lift' ? u : 1;
        const back = A.phase === 'windup' ? Math.min(1, A.t / 0.3) : 0;
        want.throwW = A.phase === 'follow' ? 0 : 1; want.throwF = A.phase === 'follow' ? 1 : 0;
        if (A.phase !== 'follow') {
          const pos = new THREE.Vector3(this.root.x, this.root.y + 1.0 + 1.6 * lift, this.root.z).addScaledVector(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), -0.6 * back);
          this.ctx.carryCar(car, pos, this.yaw + Math.PI / 2);
        }
        if (A.phase === 'lift' && A.t > 0.55) next('windup');
        else if (A.phase === 'windup' && A.t > 0.32) { this.ctx.throwCar(car); next('follow'); this.say(['FORE!', 'CATCH!', 'Beep beep!'], true); }
        else if (A.phase === 'follow' && A.t > 0.4) this.atk = null;
      }
    } else if (A.kind === 'leap') {
      // a huge bound toward the player: up to 40 m a jump, landing on roofs if that's where they are
      if (A.phase === 'approach' || A.phase === 'crouch') {
        want.wind = 1; want.cower = 0.35;
        if (A.t > 0.22) {
          // aim where you're going to be, not where you are
          const pv = ctx.playerVel || _v.set(0, 0, 0), lead = Math.min(1.2, 0.5 + d / 90);
          const tx = ctx.playerPos.x + pv.x * lead - this.root.x, tz = ctx.playerPos.z + pv.z * lead - this.root.z, td = Math.hypot(tx, tz) || 1;
          const dir = new THREE.Vector3(tx / td, 0, tz / td), hop = Math.min(td > 120 ? 450 : 55, Math.max(8, td - 4));
          A.from = this.root.clone();
          A.to = new THREE.Vector3(clampB(this.root.x + dir.x * hop), 0, clampB(this.root.z + dir.z * hop));
          A.to.y = this._groundAt(A.to.x, A.to.z, Math.max(ctx.playerPos.y + 1, this.root.y + 2));
          A.peak = Math.max(A.from.y, A.to.y) + 5 + Math.min(120, hop * 0.25);
          A.dur = hop > 60 ? 0.9 + Math.sqrt(hop) / 6 : 0.5 + hop / 45;
          if (hop > 60) this.say(['You can run...', 'INCOMING!', 'Did you think I would just WAIT?', 'Wherever you go, I go.'], true);
          next('air');
        }
      } else if (A.phase === 'air') {
        const u = Math.min(1, A.t / A.dur);
        const base = A.from.y + (A.to.y - A.from.y) * u;
        this.root.set(A.from.x + (A.to.x - A.from.x) * u, base + 4 * (A.peak - Math.max(A.from.y, A.to.y)) * u * (1 - u), A.from.z + (A.to.z - A.from.z) * u);
        want.lean = 0.5; want.throwW = 0.3;
        if (u >= 1) { this.root.copy(A.to); next('land'); this.ctx.slam?.(this.root.clone()); }
      } else { want.cower = Math.max(0, 0.6 - A.t * 2); if (A.t > 0.25) this.atk = null; }
      return toP;
    } else if (A.kind === 'slam') {
      // crouch, leap in an arc onto the player, then hit the ground hard
      if (A.phase === 'crouch') {
        want.wind = 1; want.cower = 0.35;
        if (A.t > 0.28) {
          A.from = this.root.clone();
          const pv = ctx.playerVel || _v.set(0, 0, 0), lead = Math.min(0.8, 0.45 + d / 60);
          A.to = new THREE.Vector3(clampB(ctx.playerPos.x + pv.x * lead - dirToPlayer().x * 1.2), 0, clampB(ctx.playerPos.z + pv.z * lead - dirToPlayer().z * 1.2));
          A.to.y = this._groundAt(A.to.x, A.to.z, Math.max(ctx.playerPos.y + 1, this.root.y + 1));
          A.peak = Math.max(A.from.y, A.to.y, ctx.playerPos.y) + 4.5;
          A.dur = Math.min(1.0, 0.45 + A.from.distanceTo(A.to) / 30);
          next('air'); this.say(['HAAA!', 'From above!', 'Death from above!'], true);
        }
      } else if (A.phase === 'air') {
        const u = Math.min(1, A.t / A.dur);
        const base = A.from.y + (A.to.y - A.from.y) * u;
        this.root.set(A.from.x + (A.to.x - A.from.x) * u, base + 4 * (A.peak - Math.max(A.from.y, A.to.y)) * u * (1 - u), A.from.z + (A.to.z - A.from.z) * u);
        want.taunt = 0; want.throwW = 0.6; want.lean = 0.3;
        if (u >= 1) { this.root.copy(A.to); next('land'); this.ctx.slam?.(this.root.clone()); }
      } else { want.cower = Math.max(0, 0.8 - A.t * 2); if (A.t > 0.45) this.atk = null; }
    } else { // charge
      want.walk = 1; want.lean = 1; this.runFast = true;
      if (d < 1.7) {
        const dir = dirToPlayer();
        this.ctx.hitPlayer?.(dir, 48, 'tackle');
        this.atk = null; this.runFast = false;
        // it keeps its feet now: a short stumble instead of bouncing off
        this.stagger = 0.4; this.say(['TACKLE!', 'Down you go!', 'Like a freight train!'], true);
      } else if (A.t > 3.5 || d > 50 || !this._walk(dt, ctx.playerVel ? Math.atan2(dx + ctx.playerVel.x * 0.35, dz + ctx.playerVel.z * 0.35) : toP, 14, true)) { this.atk = null; this.runFast = false; }
    }
    return toP;
  }

  // Called every frame with what the player is doing, to pick a mood and react.
  think(dt, ctx) {
    this.time += dt;
    if (this.speech) { this.speech.t -= dt; if (this.speech.t <= 0) this.speech = null; }
    this.player.copy(ctx.playerPos);
    const dx = ctx.playerPos.x - this.root.x, dz = ctx.playerPos.z - this.root.z, d = Math.hypot(dx, dz);
    const W = this.moodW;
    const want = { wave: 0, cower: 0, taunt: 0, dizzy: 0, dance: 0, point: 0, shrug: 0, walk: 0, wind: 0, jab: 0, throwW: 0, throwF: 0, lean: 0 };
    if (this.cmd) { this.cmd.t -= dt; if (this.cmd.t <= 0) this.cmd = null; }
    let faceTarget = Math.atan2(dx, dz), turnRate = 2.5;
    if (this.mode === 'stand') {
      this.moodT = Math.max(0, this.moodT - dt);
      const threatened = (ctx.charging && d < 14) || (ctx.laserNear && d < 40) || (ctx.speed > 40 && d < 20);
      const c = this.cmd && this.cmd.name;
      this.anger = Math.max(0, this.anger - dt * 0.05);
      this.poise = Math.min(this.v.poise, this.poise + dt * 14);
      if (this.dodge) {
        this.dodge.t -= dt;
        const nx = this.root.x + this.dodge.x * 13 * dt, nz = this.root.z + this.dodge.z * 13 * dt;
        if (!this.voxels.solidAt(nx, this.root.y + 0.8, nz)) { this.root.x = nx; this.root.z = nz; }
        want.lean = 0.5; want.cower = 0.3;
        if (this.dodge.t <= 0) this.dodge = null;
      }
      if (this.stagger > 0) { this.stagger -= dt; want.cower = 0.5; want.dizzy = 0.4; }
      this.atkCool = Math.max(0, this.atkCool - dt);
      // scripted fighting back: once angry enough, pick an attack that suits the distance
      // it's spoiling for a fight from the start: attacks whenever it's ready and you're in range
      // (with Claude driving, Claude's own choice of action takes priority while it plays)
      const free = !this.atk && !this.dodge && !(this.stagger > 0) && this.fights && !(this.cmd && this.cmd.name !== 'idle');
      const dy = ctx.playerPos.y - this.root.y;
      // read the player: how much they fight from the air (slow running average)
      this.airHabit += ((ctx.playerAir ? 1 : 0) - this.airHabit) * Math.min(1, dt * 0.08);
      // patient regeneration: left alone for a while it patches itself up
      if (this.fights && this.time - this.lastHurt > 6 && this.hp < this.v.hp) this.hp = Math.min(this.v.hp, this.hp + this.v.hp * 0.012 * dt);
      this.guardT = Math.max(0, this.guardT - dt);
      const outOfReach = dy > 45;
      if (!ctx.whiff) this.whiffUsed = false;
      if (this.counterT > 0 && !this.dodge) {
        // the counter-attack right after a dodge
        this.counterT -= dt;
        if (this.counterT <= 0 && free && d < 9) { this.startAttack('combo', true, true); this.say(['My turn.', 'Counter!', 'And THAT is how you do it.'], true); }
      } else if (free && ctx.whiff && d < 8 && !this.whiffUsed) {
        // you swung and missed: punish the recovery
        this.whiffUsed = true;
        this.startAttack(d < 3.5 ? 'combo' : 'charge', true, true);
        this.say(['Missed. My turn.', 'Opening!', 'Wide open!'], true);
      } else if (free && ctx.charging && d < 12 && dy < 3) {
        // you're winding up a punch: close and interrupt it, or set up a dodge and a counter
        if (d < 4.5 && Math.random() < dt * 3) { this.startAttack('punch', true, true); this.say(['Not so fast!', 'Interrupted!'], true); }
        else { this.guardT = 0.4; want.wind = 0.4; want.lean = 0.2; if (d > 4.5) { this._walk(dt, Math.atan2(dx, dz) + this.strafeSide * 0.9, 6, false); want.walk = 0.6; } }
      } else if (free && this.atkCool <= 0 && !outOfReach && d < 45 && dy < 16) {
        this.startAttack(this._chooseAttack(d, ctx.playerAir, ctx));
      } else if (free && outOfReach) {
        // you've gone where it can't follow: arm itself and wait at the closest point, taunting
        const tx = clampB(ctx.playerPos.x), tz = clampB(ctx.playerPos.z);
        const ex = tx - this.root.x, ez = tz - this.root.z, ed = Math.hypot(ex, ez);
        if (ed > 3) { this._walk(dt, Math.atan2(ex, ez), 10, true); want.walk = 1; this.runFast = true; }
        else { this.runFast = false; want.taunt = 0.6; }
        if (d < 70 && this.atkCool <= 0) this.startAttack(this.ctx.nearestCar?.(this.root, 20) ? 'car' : 'volley');
        if (Math.random() < dt * 0.12) this.say(['Come down here and fight!', 'I can wait. I am VERY patient.', 'You have to land eventually.', 'Coward! ...Respectfully.']);
      } else if (free && (d >= 45 || dy >= 16)) {
        // the hunt: far away or high up, it leaps after you; otherwise it runs at you through anything
        this.huntT = (this.huntT || 0) - dt;
        if ((d > 45 || dy > 6 || this.huntStuck) && this.huntT <= 0) { this.huntStuck = false; this.huntT = 0.25; this.startAttack('leap', true); }
        else if (!(d > 45 || dy > 6)) {
          if (!this._walk(dt, Math.atan2(dx, dz), 13, true)) this.huntStuck = true;
          want.walk = 1; want.lean = 0.6; this.runFast = true;
        }
        if (Math.random() < dt * 0.15) this.say(['Where do you think YOU\'RE going?', 'Running? I love running!', 'Found you!', 'Here I COME!', 'You can\'t hide from me.']);
      } else if (free && d > 3) {
        // between attacks it never stands still: it stalks you, weaving side to side so it's hard to laser
        if ((this.strafeT -= dt) <= 0) { this.strafeT = 0.5 + Math.random() * 0.7; this.strafeSide = -this.strafeSide; }
        const lead = ctx.playerVel ? Math.atan2(dx + ctx.playerVel.x * 0.3, dz + ctx.playerVel.z * 0.3) : Math.atan2(dx, dz);
        const weave = (ctx.laserNear || ctx.laserOnMe) ? 1.1 : 0.55;
        if (!this._walk(dt, lead + this.strafeSide * weave, (ctx.laserNear ? 12 : 8.5), true)) this.strafeSide = -this.strafeSide;
        want.walk = 1; want.lean = 0.35; this.runFast = d > 10;
        faceTarget = Math.atan2(dx, dz);
      } else if (!this.atk) this.runFast = false;
      if (this.atk && !this.fights) this.atk = null;
      if (this.dodge || this.stagger > 0) { /* busy */ }
      else if (this.atk) { faceTarget = this._attack(dt, ctx, d, dx, dz, want); turnRate = 12; }
      else if (c && c !== 'idle') {
        // an action override is playing
        if (c === 'flee' || c === 'approach') {
          const away = c === 'flee';
          if (!away && d < 3.5) this.cmd = null;
          else {
            const dir = away ? Math.atan2(-dx, -dz) : faceTarget;
            this._walk(dt, dir, away ? 3.4 : 2.2);
            want.walk = 1; faceTarget = dir; turnRate = 8;
          }
        } else if (c in want) want[c] = 1;
      } else if (threatened && !this.fights) {
        want.cower = 1;
        if (!this.wasThreat && !this.brainOn) this.say(ctx.laserNear ? LINES.laserNear : LINES.cower);
      } else if (this.mood === 'dizzy' && this.moodT > 0) want.dizzy = 1;
      else if (this.mood === 'taunt' && this.moodT > 0) want.taunt = 1;
      else if (this.mood === 'wave' && this.moodT > 0) want.wave = 1;
      else {
        if (this.mood === 'dizzy') { this.mood = 'taunt'; this.moodT = 2.2; if (!this.brainOn) this.say(LINES.taunt); }
        else this.mood = 'idle';
        if (d < 14 && this.greetReady) { this.greetReady = false; this.mood = 'wave'; this.moodT = 2.4; if (!this.brainOn) this.say(LINES.greet); this.onEvent?.('The player walked up to you.'); }
      }
      if (d > 30) this.greetReady = true;
      if (threatened && !this.wasThreat) this.onEvent?.(ctx.laserNear ? 'The player is firing laser eyes right next to you.' : ctx.charging ? 'The player is charging up a punch near you.' : 'The player is flying at you at high speed.');
      this.wasThreat = threatened;
      // turn to face the player (or the way it's walking)
      if (d > 0.5) {
        let dy = faceTarget - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.yaw += dy * Math.min(1, dt * (threatened ? 6 : turnRate));
      }
    }
    for (const k in W) W[k] += (want[k] - W[k]) * Math.min(1, dt * (k === 'cower' ? 9 : 5));
    if (this.mode === 'held' && this.time - this.heldSince > 2.5 && Math.random() < dt * 0.5 && !this.brainOn) this.say(LINES.held);
    if (this.burn > 0 && ctx.laserOnMe && Math.random() < dt * 2 && !this.brainOn) this.say(LINES.laser);
  }

  // Walk the standing dummy along the ground; walls stop it, stepping off a roof edge drops it.
  _walk(dt, dir, speed, smashWalls = false) {
    speed *= this.v.speed;
    const nx = this.root.x + Math.sin(dir) * speed * dt, nz = this.root.z + Math.cos(dir) * speed * dt;
    const y = this.root.y, v = this.voxels;
    if (Math.abs(nx) > DUMMY_BOUND || Math.abs(nz) > DUMMY_BOUND) { this.cmd = null; return false; }
    if (v.solidAt(nx, y + 0.6, nz) || v.solidAt(nx, y + 1.4, nz)) {
      if (!smashWalls) { this.cmd = null; return false; }
      // shoulder straight through the wall
      const p = new THREE.Vector3(nx + Math.sin(dir) * 0.5, y + 1.0, nz + Math.cos(dir) * 0.5);
      this.ctx.smash?.(p, 1.35, { vel: new THREE.Vector3(Math.sin(dir) * speed * 2, 2, Math.cos(dir) * speed * 2), inherit: 1, outward: 4, noDust: Math.random() < 0.5 });
      this.wallT = (this.wallT || 0) + dt;
      if (this.wallT > 1.5) { this.wallT = 0; return false; } // still stuck: let it leap instead
      return true;
    }
    this.wallT = 0;
    if (!inTown(nx, nz)) {
      // out in the country: follow the lie of the land
      this.root.x = nx; this.root.z = nz; this.root.y = groundH(nx, nz);
      this.walkPh += dt * speed * (speed > 6 ? 2.2 : 3.4);
      return true;
    }
    this.root.x = nx; this.root.z = nz;
    this.walkPh += dt * speed * (speed > 6 ? 2.2 : 3.4);
    if (y > 0.01 && !v.solidAt(nx, y - 0.25, nz)) {
      // walked off the edge
      this.mode = 'ragdoll';
      this.push(new THREE.Vector3(Math.sin(dir) * speed, 1, Math.cos(dir) * speed));
      this.say(['Oh no.', 'Whoops!', 'That was not there before!'], true);
      this.cmd = null; this.atk = null;
      return false;
    }
    return true;
  }

  // Standing pose with mood layers blended in (local space, facing +Z).
  _localPose(i, out) {
    const name = NAMES[i], b = POSE[name], W = this.moodW, t = this.time;
    let x = b[0], y = b[1], z = b[2];
    const upper = ['head', 'neck', 'lsh', 'rsh', 'lel', 'rel', 'lha', 'rha'].includes(name);
    // breathing and a slow weight shift
    if (upper) { y += Math.sin(t * 1.8) * 0.008; x += Math.sin(t * 0.6) * 0.012; }
    const blend = (w, tx, ty, tz) => { if (w <= 0.001) return; x += (tx - b[0]) * w; y += (ty - b[1]) * w; z += (tz - b[2]) * w; };
    if (W.wave > 0) {
      if (name === 'rel') blend(W.wave, 0.36, 1.5, 0.05);
      if (name === 'rha') blend(W.wave, 0.4 + Math.sin(t * 11) * 0.09, 1.8, 0.08);
    }
    if (W.cower > 0) {
      const c = W.cower, dip = 0.24 * c;
      if (name === 'lha') blend(c, -0.07, 1.62, 0.2); if (name === 'rha') blend(c, 0.07, 1.6, 0.2);
      if (name === 'lel') blend(c, -0.24, 1.32, 0.22); if (name === 'rel') blend(c, 0.24, 1.3, 0.22);
      if (upper || name === 'lhp' || name === 'rhp') y -= dip;
      if (name === 'head') { z += 0.05 * c; x += Math.sin(t * 30) * 0.006 * c; }
      if (name === 'lkn' || name === 'rkn') { z += 0.16 * c; y -= 0.08 * c; }
    }
    if (W.taunt > 0) {
      const k = W.taunt, hop = Math.abs(Math.sin(t * 7)) * 0.07 * k, jab = Math.max(0, Math.sin(t * 3.5)) ** 8;
      if (name === 'lha') blend(k, -0.1, 1.38, 0.26 + jab * 0.22); if (name === 'rha') blend(k, 0.12, 1.33, 0.2);
      if (name === 'lel') blend(k, -0.26, 1.14, 0.14 + jab * 0.08); if (name === 'rel') blend(k, 0.28, 1.1, 0.1);
      if (name !== 'lft' && name !== 'rft') y += hop - 0.04 * k;
      if (name === 'lkn' || name === 'rkn') z += 0.05 * k;
    }
    if (W.dizzy > 0) {
      const k = W.dizzy;
      if (upper) { x += Math.sin(t * 5) * 0.05 * k * (name === 'head' ? 1.6 : 1); z += Math.cos(t * 5) * 0.05 * k * (name === 'head' ? 1.6 : 1); }
    }
    if (W.dance > 0) {
      // hip sway, bouncing knees, arms pumping up in turn
      const k = W.dance, s6 = Math.sin(t * 6), bounce = Math.abs(Math.sin(t * 6)) * 0.07;
      if (name === 'lha') blend(k, -0.36, 1.45 + Math.max(0, s6) * 0.45, 0.1); if (name === 'rha') blend(k, 0.36, 1.45 + Math.max(0, -s6) * 0.45, 0.1);
      if (name === 'lel') blend(k, -0.36, 1.38, 0.05); if (name === 'rel') blend(k, 0.36, 1.38, 0.05);
      if (name === 'lhp' || name === 'rhp') x += s6 * 0.07 * k;
      if (upper) x -= s6 * 0.04 * k;
      if (name !== 'lft' && name !== 'rft') y -= bounce * k;
    }
    if (W.point > 0) {
      const k = W.point;
      if (name === 'rel') blend(k, 0.25, 1.42, 0.24); if (name === 'rha') blend(k, 0.2, 1.45, 0.52);
      if (name === 'lel') blend(k, -0.37, 1.15, -0.06); if (name === 'lha') blend(k, -0.27, 0.98, 0.06);
    }
    if (W.shrug > 0) {
      const k = W.shrug;
      if (name === 'lel') blend(k, -0.3, 1.12, 0.06); if (name === 'rel') blend(k, 0.3, 1.12, 0.06);
      if (name === 'lha') blend(k, -0.42, 1.14, 0.26); if (name === 'rha') blend(k, 0.42, 1.14, 0.26);
      if (name === 'lsh' || name === 'rsh') y += 0.05 * k;
      if (name === 'head') x += 0.04 * k;
    }
    if (W.walk > 0) {
      const k = W.walk, ph = this.walkPh, sL = Math.sin(ph), cL = Math.cos(ph);
      if (name === 'lft') { z += sL * 0.26 * k; y += Math.max(0, cL) * 0.1 * k; }
      if (name === 'rft') { z -= sL * 0.26 * k; y += Math.max(0, -cL) * 0.1 * k; }
      if (name === 'lkn') { z += sL * 0.14 * k + 0.04 * k; y += Math.max(0, cL) * 0.05 * k; }
      if (name === 'rkn') { z -= sL * 0.14 * k - 0.04 * k; y += Math.max(0, -cL) * 0.05 * k; }
      if (name === 'lha' || name === 'lel') z -= sL * (name === 'lha' ? 0.2 : 0.08) * k;
      if (name === 'rha' || name === 'rel') z += sL * (name === 'rha' ? 0.2 : 0.08) * k;
      if (name !== 'lft' && name !== 'rft') y += Math.abs(cL) * 0.03 * k;
      if (upper) z += 0.04 * k;
    }
    // attacks
    if (W.wind > 0) {
      const k = W.wind;
      if (name === 'rha') blend(k, 0.3, 1.25, -0.25); if (name === 'rel') blend(k, 0.34, 1.3, -0.1);
      if (name === 'lha') blend(k, -0.12, 1.42, 0.26); if (name === 'lel') blend(k, -0.26, 1.18, 0.16);
      if (name === 'rsh') z -= 0.07 * k; if (name === 'lsh') z += 0.06 * k;
      if (name === 'lkn' || name === 'rkn') y -= 0.06 * k;
    }
    if (W.jab > 0) {
      const k = W.jab;
      if (name === 'rha') blend(k, 0.06, 1.45, 0.64); if (name === 'rel') blend(k, 0.16, 1.44, 0.32);
      if (name === 'lha') blend(k, -0.14, 1.38, 0.2); if (name === 'lel') blend(k, -0.27, 1.15, 0.1);
      if (name === 'rsh') z += 0.09 * k; if (name === 'lsh') z -= 0.06 * k;
      if (upper) z += 0.06 * k;
    }
    if (W.throwW > 0) {
      const k = W.throwW;
      if (name === 'rha') blend(k, 0.26, 1.95, -0.28); if (name === 'rel') blend(k, 0.3, 1.62, -0.14);
      if (name === 'lha') blend(k, -0.3, 1.4, 0.38); if (name === 'lel') blend(k, -0.3, 1.32, 0.16);
      if (upper) z -= 0.06 * k;
    }
    if (W.throwF > 0) {
      const k = W.throwF;
      if (name === 'rha') blend(k, 0.04, 1.02, 0.5); if (name === 'rel') blend(k, 0.2, 1.3, 0.34);
      if (upper) z += 0.1 * k;
    }
    if (W.lean > 0) {
      const k = W.lean;
      if (upper) z += (name === 'head' ? 0.28 : 0.18) * k;
      if (name === 'lha') blend(k, -0.2, 1.3, 0.34); if (name === 'rha') blend(k, 0.2, 1.3, 0.34);
    }
    return out.set(x, y, z);
  }

  update(dt) {
    // damage: the glow stutters and joints spit sparks as it gets beaten up
    const dmgK = 1 - Math.max(0, this.hp / this.v.hp);
    const fl = dmgK > 0.45 && Math.random() < dmgK * 0.25 ? 0.15 : 1;
    this.glowMat.emissiveIntensity = 3.2 * fl * (this.ko ? 0.2 : 1); this.eyeMat.emissiveIntensity = 9 * (fl < 1 ? 0.3 : 1) * (this.ko ? 0.1 : 1);
    if (dmgK > 0.55 && Math.random() < dt * dmgK * 3) this.ctx.sparks?.(this.p[[ID.lsh, ID.rsh, ID.lkn, ID.rkn, ID.neck][Math.floor(Math.random() * 5)]].clone(), 0.25);
    for (const m of this.mats) if (m.clearcoat !== undefined) m.clearcoat = 0.8 * (1 - dmgK * 0.8);
    // burn tint
    if (this.burn > 0) {
      const k = Math.min(1, this.burn / 3);
      this.mats.forEach((m, i) => m.color.copy(this.baseColors[i]).lerp(_char, k * 0.85));
    } else this.mats.forEach((m, i) => m.color.copy(this.baseColors[i]));
    if (this.tintC) this.mats.forEach((m) => m.color.multiply(this.tintC));
    // frozen in time: a cold blue sheen
    this.frozenK = (this.frozenK || 0) + ((this.frozen ? 1 : 0) - (this.frozenK || 0)) * Math.min(1, dt * 8);
    for (const m of this.mats) if (m.emissive) m.emissive.setRGB(0.05, 0.16, 0.42).multiplyScalar(this.frozenK);
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
    const bm = this.brainOn && this.mode === 'stand' ? this.brainMood : '';
    const scared = Math.max(W.cower, ragdoll ? 1 : 0, bm === 'scared' ? 0.6 : 0), angry = Math.max(W.taunt, bm === 'annoyed' ? 0.8 : 0), dizzy = W.dizzy;
    const happy = bm === 'cheerful' ? 1 : 0, smug = bm === 'cocky' || bm === 'smug' ? 1 : 0;
    const talking = this.speech && this.speech.t > 1.0 ? Math.abs(Math.sin(this.time * 17)) : 0;
    for (const e of this.eyesD) {
      const open = (1 + scared * 0.35) * blink;
      e.ball.scale.set(1 + scared * 0.25, open * (ragdoll ? 0.25 + Math.abs(Math.sin(this.time * 3)) * 0.2 : 1), 0.6);
      const sp = dizzy > 0.1 ? [Math.cos(this.time * 9 * e.sx) * 0.012, Math.sin(this.time * 9) * 0.012] : [Math.sin(this.time * 0.7 + e.sx) * 0.004, 0];
      e.pu.position.set(sp[0], sp[1], 0.017);
      e.pu.scale.setScalar(1 - scared * 0.35);
      e.brow.rotation.z = e.sx * (angry * 0.45 - scared * 0.35 - happy * 0.15) + (smug && e.sx < 0 ? -0.25 : 0);
      e.brow.position.y = 0.078 + scared * 0.012 - angry * 0.006 + happy * 0.008 + (smug && e.sx < 0 ? 0.012 : 0);
    }
    this.mouth.scale.set(1 - scared * 0.3 + angry * 0.2 + happy * 0.45 + smug * 0.2, 1 + scared * 3.5 + talking * 3, 1);
    this.mouth.rotation.z = smug ? 0.25 : 0;
    for (const [a, b, m] of this.limbs) {
      m.position.lerpVectors(P[a], P[b], 0.5);
      _v.subVectors(P[b], P[a]).normalize();
      m.quaternion.setFromUnitVectors(_y, _v);
    }
    for (const [i, g] of this.joints) { g.position.copy(P[i]); g.quaternion.copy(q); }
    this._updateScarf(dt, mid, sh);
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
