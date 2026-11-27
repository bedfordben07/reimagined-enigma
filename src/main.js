import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VoxelWorld, VS } from './voxels.js?v=1795814734';
import { DebrisSystem } from './debris.js?v=1795814734';
import { Dummy, VARIANTS } from './dummy.js?v=1795814734';
import { Robot } from './robot.js?v=1795814734';
import { Spectre } from './spectre.js?v=1795814734';
import { Volt, Titan, HeroPowers, SENTINEL_KIT } from './heroes.js?v=1795814734';
import { buildWorld, groundH, WORLD_HALF } from './world.js?v=1795814734';
import { Overmind } from './mind.js?v=1795814734';
import { FlyerFoe, Swarm } from './foes.js?v=1795814734';
import { ConstructionSite } from './site.js?v=1795814734';
import { Underground } from './under.js?v=1795814734';
import { VoxelTrain } from './train.js?v=1795814734';
import { Life } from './life.js?v=1795814734';
import { Colossus, Warlord } from './boss.js?v=1795814734';
import { newStats, rollUpgrades } from './upgrades.js?v=1795814734';
const up = newStats();
const ult = { k: 0 }, shield = { on: false, e: 1, flash: 0 };
let drones = [];
let life = null, boss = null, train = null, helpers = null, swarm = null, site = null, under = null;
let lastPower = null, mind = null;
import { addOutline } from './outline.js?v=1795814734';
import { Effects } from './effects.js?v=1795814734';
import { makeVoxelMaterials, buildVoxelTown, buildScenery, SITE, MAT, CAR_SPOTS, PROP_SPOTS, BIRD_HOMES } from './town.js?v=1795814734';
import { CarSystem } from './cars.js?v=1795814734';
import { Powers } from './powers.js?v=1795814734';
import { PropSystem } from './props.js?v=1795814734';
import { Birds } from './birds.js?v=1795814734';
import { FireSystem } from './fire.js?v=1795814734';
import { Sfx } from './audio.js?v=1795814734';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 26000);
camera.rotation.order = 'YXZ';

// ---------------------------------------------------------------- sky, sun, environment
const SUN_ELEV = 15, SUN_AZ = 32; // low golden-hour sun behind the start view
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - SUN_ELEV), THREE.MathUtils.degToRad(SUN_AZ));
function makeSky() {
  const s = new Sky();
  const u = s.material.uniforms;
  u.turbidity.value = 4.5; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.copy(sunDir);
  // scale the sky's radiance down so only the sun disc reaches bloom range
  s.material.fragmentShader = s.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * 0.42, 1.0 );');
  return s;
}
const sky = makeSky(); sky.scale.setScalar(20000); scene.add(sky);
// reflections come from a captured copy of the sky, re-captured as the time of day changes
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envSky = makeSky(); envSky.scale.setScalar(100); envScene.add(envSky);
// a darker ground half so reflections aren't lit from below by the sky
const envGround = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3d4234, side: THREE.BackSide }));
envScene.add(envGround);
let envRT = null;
function bakeEnv() {
  envSky.material.uniforms.sunPosition.value.copy(sky.material.uniforms.sunPosition.value);
  const rt = pmrem.fromScene(envScene, 0.02, 0.1, 1000);
  if (envRT) envRT.dispose();
  envRT = rt; scene.environment = rt.texture;
}
bakeEnv();
scene.environmentIntensity = 0.9;
// Drifting cloud layer: procedural fbm on a dome, lit warm on the sun side, fading at the horizon.
const clouds = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uSun: { value: sunDir.clone() }, uDay: { value: 1 }, uCover: { value: 0 } },
  transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uTime; uniform vec3 uSun; uniform float uDay; uniform float uCover; varying vec3 vDir;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * n(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
    void main(){
      if (vDir.y < 0.0) discard;
      vec2 p = vDir.xz / (vDir.y + 0.12) * 1.4 + vec2(uTime * 0.012, uTime * 0.004);
      float d = fbm(p), d2 = fbm(p + uSun.xz * 0.08);
      float cov = smoothstep(0.48 - uCover * 0.4, 0.78 - uCover * 0.35, d);
      float shade = clamp(0.55 + (d - d2) * 3.0, 0.0, 1.0);            // brighter edges facing the sun
      float sunSide = pow(max(dot(normalize(vDir), uSun), 0.0), 3.0);
      vec3 lit = mix(vec3(0.62, 0.64, 0.7), vec3(1.0, 0.86, 0.68), shade) * (0.75 + sunSide * 0.5);
      lit = mix(lit, vec3(0.42, 0.44, 0.47) * (0.6 + shade * 0.3), uCover) * mix(0.07, 1.0, uDay);
      float fade = smoothstep(0.02, 0.22, vDir.y);
      gl_FragColor = vec4(lit, cov * 0.85 * fade);
    }`,
}));
clouds.renderOrder = -1; scene.add(clouds);
scene.fog = new THREE.FogExp2(0xb3b4b0, 0.0021); // atmospheric haze matched to the horizon

// Lighting rig: warm golden-hour key (sun), cool sky/ground hemisphere fill, cool rim behind the player.
const sun = new THREE.DirectionalLight(0xffe8c8, 5.0);
sun.castShadow = true;
sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 500;
sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.035; // no acne on voxel faces, no peter-panning at feet
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0x7090b5, 0x2a2520, 1.0); scene.add(hemi);
// palm-thruster glow (two lights kept in the scene so the shader light count never changes)
const handLights = [0, 1].map(() => { const l = new THREE.PointLight(0xff8a3a, 0, 9, 2); scene.add(l); return l; });
const rim = new THREE.DirectionalLight(0xb8d4ff, 2.2); // placed behind the player each frame, facing the camera
scene.add(rim, rim.target);
// street-lamp light pools: a fixed set of spot lights moved to the lamps nearest the player
const lampSpots = [];
for (let i = 0; i < 6; i++) {
  const l = new THREE.SpotLight(0xffc98a, 70, 22, 0.95, 0.65, 2);
  scene.add(l, l.target); lampSpots.push(l);
}

// ---------------------------------------------------------------- world
const matDefs = makeVoxelMaterials();
const vox = new VoxelWorld(scene, matDefs);
buildVoxelTown(vox);
const { lampLights, traffic, wetMats, lampMats } = buildScenery(scene, renderer);
const world = buildWorld(scene);
const MACH = 343;
const debris = new DebrisSystem(scene, vox, matDefs, 4500);
const fx = new Effects(scene);
const sfx = new Sfx();
// heroes are built the first time they're picked (each carries its own set of armour textures)
const CHAR_TYPES = [Robot, Spectre, Volt, Titan];
const chars = [];
let onNewChar = null;
function getChar(i) {
  if (!chars[i]) { const c = new CHAR_TYPES[i](); c.kit = c.kit || (i === 1 ? { ...SENTINEL_KIT, mach: 3 } : SENTINEL_KIT); chars[i] = c; onNewChar?.(c); }
  return chars[i];
}
const kit = () => robot.kit;
let heroP = null;
let charIdx = 0;
try { charIdx = Math.min(CHAR_TYPES.length - 1, Math.max(0, parseInt(localStorage.getItem('rubble-char') || '0', 10) || 0)); } catch (e) { /* storage unavailable */ }
if (params.has('char')) charIdx = Math.min(CHAR_TYPES.length - 1, parseInt(params.get('char'), 10) || 0);
let robot = getChar(charIdx);
scene.add(robot.root);
function setCharacter(i) {
  scene.remove(robot.root);
  charIdx = (i + CHAR_TYPES.length) % CHAR_TYPES.length;
  robot = getChar(charIdx);
  scene.add(robot.root);
  fx.setLaserColors(robot.laserCore, robot.laserGlow);
  try { localStorage.setItem('rubble-char', String(charIdx)); } catch (e) { /* ignore */ }
  const el = document.getElementById('charName'); if (el) el.textContent = robot.name;
  if (heroP && mind?.met) mind.event('hero');
  if (heroP) { heroP.clear(); if (!robot.kit.canFly) player.flying = false; buildPowerHud(); }
  document.querySelectorAll('[data-char]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.char === charIdx)));
}
setCharacter(charIdx);
document.querySelectorAll('[data-char]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); setCharacter(+b.dataset.char); }));

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const dustColor = new THREE.Color();
let shake = 0, hitstop = 0, time = 0;

function rndVec(out, s) { return out.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s); }

function spawnPiece(r, pos, vel) {
  const def = matDefs[r.m];
  if (def.glass) {
    for (let k = 0; k < 3; k++) debris.spawn(tmp3.copy(pos).add(rndVec(tmp2, 0.3)), rndVec(tmp2, 4).add(vel), r.m, r.color, 0.16 + Math.random() * 0.12);
  } else {
    debris.spawn(pos, vel, r.m, r.color, VS * (0.8 + Math.random() * 0.2));
  }
}

// Break blocks inside a sphere and turn them into flying rubble.
function smash(center, radius, o = {}) {
  center = center.clone();
  if (o.vel) o = { ...o, vel: o.vel.clone() };
  const removed = vox.breakSphere(center, radius, [], o.max ?? 700);
  const tn = train ? train.smash(center, radius, o) : 0;
  if (!removed.length) return tn;
  if (life) life.heat += removed.length * 0.35;
  if (typeof game !== 'undefined') game.score += removed.length;
  const inherit = o.inherit ?? 0.5, outward = o.outward ?? 5, up = o.up ?? 2;
  let glass = 0;
  const pv = new THREE.Vector3();
  for (let k = 0; k < removed.length; k++) {
    const r = removed[k];
    vox.center(r.x, r.y, r.z, tmp);
    pv.subVectors(tmp, center); const d = pv.length() || 1; pv.divideScalar(d);
    pv.multiplyScalar(outward * (0.35 + Math.random()));
    pv.y += up * Math.random();
    if (o.vel) pv.addScaledVector(o.vel, inherit * (0.45 + Math.random() * 0.7));
    pv.add(rndVec(tmp2, 2));
    if (matDefs[r.m].glass) glass++;
    spawnPiece(r, tmp, pv);
    if (k % 3 === 0 && !o.noDust) {
      dustColor.set(matDefs[r.m].dust);
      fx.dust.emit(tmp, tmp2.copy(pv).multiplyScalar(0.12), dustColor, 1.2 + Math.random() * 1.6, 2.2 + Math.random() * 2.5, 1.4, 0.5);
    }
  }
  sfx.crumble(removed.length);
  if (glass) sfx.glass();
  birds.scare(center, 18 + radius * 4);
  debris.blast(center, radius * 2, outward * 0.5);
  return removed.length;
}

// Blocks cut off from the ground collapse.
function detach(list) {
  game.score += Math.round(list.length * 0.5);
  const pv = new THREE.Vector3();
  let cx = 0, cy = 0, cz = 0;
  for (let k = 0; k < list.length; k++) {
    const r = list[k];
    vox.center(r.x, r.y, r.z, tmp);
    cx += tmp.x; cy += tmp.y; cz += tmp.z;
    pv.set((Math.random() - 0.5) * 0.6, -Math.random() * 0.5, (Math.random() - 0.5) * 0.6);
    spawnPiece(r, tmp, pv);
    if (k % 10 === 0) { dustColor.set(matDefs[r.m].dust); fx.dust.emit(tmp, rndVec(pv, 1), dustColor, 2 + Math.random() * 2, 3 + Math.random() * 3, 1.2, 0.35); }
  }
  sfx.crumble(list.length * 2);
  tmp.set(cx / list.length, cy / list.length, cz / list.length);
  const d = tmp.distanceTo(player.pos);
  shake = Math.min(1, shake + Math.min(0.6, list.length / 400) * Math.max(0, 1 - d / 80));
}

let cascadeBudget = 0;
debris.onVoxelImpact = (i, speed, it) => {
  if (speed < 13 || cascadeBudget <= 0 || Math.random() > 0.3) return;
  cascadeBudget--;
  const [x, y, z] = vox.decode(i);
  smash(vox.center(x, y, z, new THREE.Vector3()), 0.55, { vel: it.v, inherit: 0.3, outward: 2, noDust: Math.random() < 0.5 });
  it.v.multiplyScalar(0.7);
};

// Up to two fighting dummies can be out at once. The rest of the game talks to `dummy`, which forwards
// to whichever one is nearest you (hits, steps and updates go to all of them).
const dummyA = new Dummy(scene, vox, { smash });
const dummyB = new Dummy(scene, vox, dummyA.ctx);
// two Echoes: lesser copies of the Champion that it calls in for backup
const echoA = new Dummy(scene, vox, dummyA.ctx), echoB = new Dummy(scene, vox, dummyA.ctx);
echoA.isHelper = echoB.isHelper = true;
const dummies = [dummyA, dummyB, echoA, echoB];
mind = new Overmind({ scene, sfx, el: document.getElementById('mindVoice'), statusEl: document.getElementById('mindStatus'), onProtocol: (p) => banner('HIVE PROTOCOL', `${p.name}: every unit now has it`, 2.6) });
dummyA.ctx.mind = mind;
let focusD = dummyA;
const D_SET_ALL = new Set(['fights', 'frozen', 'frozenHits', 'onKO', 'onDamage', 'onEvent', 'onAdapt']);
const D_EACH = new Set(['step', 'think', 'update']);
const dummy = new Proxy({}, {
  get(_, k) {
    if (D_EACH.has(k)) return (...a) => { for (const d of dummies) if (d.active) d[k](...a); };
    if (k === 'hit' || k === 'push') return (...a) => { let any = false; for (const d of dummies) if (d.active) any = d[k](...a) || any; return any; };
    if (k === 'raycast') return (o, dir, maxT) => { let best = null; for (const d of dummies) if (d.active && d.mode !== 'held') { const h = d.raycast(o, dir, best ? best.t : maxT); if (h && (!best || h.t < best.t)) best = h; } return best; };
    if (k === 'frozenHits') return dummies.reduce((n, d) => n + (d.frozenHits || 0), 0);
    const v = focusD[k];
    return typeof v === 'function' ? v.bind(focusD) : v;
  },
  set(_, k, v) { if (D_SET_ALL.has(k)) for (const d of dummies) d[k] = v; else focusD[k] = v; return true; },
});
const cars = new CarSystem(scene, CAR_SPOTS, { smash, voxels: vox });
const props = new PropSystem(scene, PROP_SPOTS, { voxels: vox, fx, sfx });
const birds = new Birds(scene, BIRD_HOMES);
let rainK = 0; // 0 dry .. 1 downpour (set by the weather)
const fire = new FireSystem({
  scene, camera, fx, vox, smash, blastAll, cars, dummy, props, sfx,
  hurtPlayer: (d) => hurtPlayer(d), knockPlayer: (d, p) => knockPlayer(d, p, 'blast'),
  playerChest: () => chestPos(new THREE.Vector3()), shake: (k) => { shake = Math.min(1, shake + k); },
});
cars.onWreck = (c) => fire.igniteCar(c);
{ const hit0 = cars.hit.bind(cars); cars.hit = (c, p, v) => { if (v.lengthSq() > 64) sfx.crunch(); return hit0(c, p, v); }; }
props.onExplode = (pr) => fire.explode(pr.p.clone());
// shockwaves push rubble, cars and street furniture alike, and send the pigeons flying
function blastAll(center, radius, strength, dir = null, up) {
  debris.blast(center, radius, strength, dir, up); cars.blast(center, radius, strength, dir, up); props.blast(center, radius, strength, dir, up);
  life?.blast(center, radius, strength, dir); boss?.blast(center, radius, strength); swarm?.blast(center, radius, strength); site?.blast(center, radius, strength, dir);
  if (!dummyA.ctx.src && strength >= 14 && (dummies.some((d) => d.active && d.chest(tmp3).distanceTo(center) < radius) || liveBosses().some((b) => b._distTo(center) < radius))) mind?.observe('blast');
  if (!dummyA.ctx.src && strength >= 14) for (const d of dummies) if (d.active && d.adapt && d.chest(tmp3).distanceTo(center) < radius) d.observe('blast');
  birds.scare(center, radius * 3 + 10);
}


// ---------------------------------------------------------------- time freeze
// X stops time for everything except the player. Hits on the frozen world are stored (the dummy keeps the
// momentum, rubble hangs where it broke off, collapses wait) and all of it lets go the moment time resumes.
const tf = { on: false, energy: 1, k: 0, ripple: -1, tickT: 0, hits: 0, tickHigh: false };
function freezeOn() {
  if (tf.on) return;
  for (const d of dummies) if (d.active) d.observe('freeze');
  if (enemies.length) { mind.observe('freeze'); mind.event('freeze'); }
  tf.on = true; tf.ripple = 0; tf.hits = 0; tf.tickT = 0; dummy.frozenHits = 0;
  dummy.frozen = true;
  sfx.freeze(true);
  fx.wave(chestPos(new THREE.Vector3()), 40, 0.9, new THREE.Color(0.6, 1.1, 2.4));
  shake = Math.min(1, shake + 0.25);
  dummy.say(['Wh—', 'Hey, what are you d—', '...'], true);
}
function freezeOff() {
  if (!tf.on) return;
  tf.on = false; tf.ripple = 0;
  dummy.frozen = false; tf.hits = dummy.frozenHits || 0;
  dummy.clampSpeed(170);
  sfx.freeze(false);
  fx.wave(chestPos(new THREE.Vector3()), 40, 0.7, new THREE.Color(2.2, 1.6, 0.8));
  shake = Math.min(1, shake + 0.35 + Math.min(0.4, tf.hits * 0.05));
  hitstop = Math.max(hitstop, 0.06);
  if (tf.hits > 0) {
    dummy.say(tf.hits > 3 ? ['WHAT JUST HAPPENED?!', 'ALL AT ONCE?!', 'That is CHEATING!'] : ['Did time just... stop?', 'Huh?! OW!'], true);
  }
}
function updateFreeze(dt) {
  if (tf.on) {
    // no time limit: frozen until X is pressed again
    tf.tickT -= dt;
    if (tf.tickT <= 0) { tf.tickT = 0.5; tf.tickHigh = !tf.tickHigh; sfx.tick(tf.tickHigh); }
  }
  tf.energy = 1;
  tf.k += ((tf.on ? 1 : 0) - tf.k) * Math.min(1, dt * 7);
  if (tf.ripple >= 0) { tf.ripple += dt / 0.7; if (tf.ripple > 1) tf.ripple = -1; }
  finish.uniforms.uFreeze.value = Math.max(tf.k, RW.k * 0.85);
  finish.uniforms.uRipple.value = tf.ripple;

  $('freezeBox').classList.toggle('active', tf.on);
}

// ---------------------------------------------------------------- extra powers
const powers = new Powers({
  scene, camera, fx, sfx, debris, cars, props, birds, dummy, vox, smash, blastAll, get aim() { return aim; }, get fire() { return fire; },
  hand: (side) => robot.handWorld(side, new THREE.Vector3()),
  knockPlayer: (dir, power) => knockPlayer(dir, power, 'blast'),
  get player() { return player; },
  teleport: (p) => { player.pos.copy(p); player.vel.multiplyScalar(0.15); player.stun = 0; },
  // a see-through copy of the current character, drawn as a flickering cyan hologram
  makeHologram: () => {
    const h = new robot.constructor();
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uK: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; vec4 mv = viewMatrix * w; vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; uniform float uK; varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.0); float scan = 0.55 + 0.45 * sin(vY * 40.0 - uTime * 8.0);
          float flick = 0.85 + 0.15 * sin(uTime * 37.0); gl_FragColor = vec4(vec3(0.25, 0.9, 1.6) * (0.25 + f * 1.4) * scan * flick * uK, 1.0); }`,
    });
    h.root.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; o.receiveShadow = false; } });
    scene.add(h.root);
    h.holoMat = mat;
    return h;
  },
  chest: () => chestPos(new THREE.Vector3()),
  forward: () => fwd3(new THREE.Vector3()),
  aimDir: (from) => aimDirFrom(from, new THREE.Vector3()),
  shake: (k) => { shake = Math.min(1, shake + k); },
  hitstop: (t) => { hitstop = Math.max(hitstop, t); },
  // gravitational lensing: project the hole onto the screen for the post-process warp
  lens: (p, size) => {
    const u = finish.uniforms.uHole.value;
    if (!p) { u.w = 0; return; }
    const v = p.clone().project(camera);
    const dist = p.distanceTo(camera.position);
    if (v.z > 1 || dist < 0.5) { u.w = 0; return; }
    u.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, Math.min(0.35, (size * 2.6) / (dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * 0.5), 1);
  },
});
life = new Life({
  scene, fx, sfx, vox, smash, blastAll, cars, dummy, get fire() { return fire; },
  score: (n, label) => { game.score += n; banner(label, `+${n.toLocaleString()}`, 1.4); },
});
train = new VoxelTrain({
  scene, debris, MAT, fx, sfx, vox, smash, blastAll, cars, dummy, get fire() { return fire; }, get player() { return player; },
  chest: () => chestPos(new THREE.Vector3()), knockPlayer: (d, p, k) => knockPlayer(d, p, k), hurtPlayer: (d) => hurtPlayer(d),
  score: (n, label) => { game.score += n; banner(label, `+${n.toLocaleString()}`, 1.4); },
});
// The Champion's backup: two Echoes, weaker copies of it that carry the adaptations it has learned so far.
helpers = {
  get alive() { return [echoA, echoB].filter((e) => e.active && !e.ko).length; },
  clear() { for (const e of [echoA, echoB]) if (e.active) parkDummy(e); },
  blast() {}, rayHit() { return null; }, at() { return null; }, damage() {}, bots: [], update() {},
};
dummy.ctx.helpersAlive = () => helpers.alive;
dummy.ctx.summonHelpers = (champ) => {
  const base = champ.root.clone(), toP = new THREE.Vector3(player.pos.x - base.x, 0, player.pos.z - base.z).normalize();
  [echoA, echoB].forEach((e, i) => {
    const side = i ? 1 : -1;
    const p = base.clone().add(new THREE.Vector3(-toP.z * side * 3, 0, toP.x * side * 3)).addScaledVector(toP, 1);
    p.y = e._groundAt(p.x, p.z, p.y + 3);
    e.active = true; e.group.visible = true; e.ko = false; e.fights = fightsPref;
    e.setVariant({ ...VARIANTS[4], name: 'Echo', hp: 300, dmg: 0.9, speed: 1.25, cool: 0.95, poise: 45, dodge: 0.35, tint: [0.8, 0.66, 0.42], adaptive: true });
    // it inherits whatever its maker has learned, but doesn't learn on its own
    for (const t of champ.adapt.have) e.adapt.have.add(t); e.adapt.level = champ.adapt.level; e.noLearn = true;
    if (e.has('reflect')) for (const m of e.mats) { m.metalness = 1; m.roughness = 0.08; }
    e.glowMat.emissive.copy(champ.glowMat.emissive); e.eyeMat.emissive.copy(champ.eyeMat.emissive);
    e.spawn(p, Math.atan2(player.pos.x - p.x, player.pos.z - p.z)); e.atkCool = 0.6 + i * 0.4;
    fx.wave(p.clone().add(new THREE.Vector3(0, 1, 0)), 3, 0.35, new THREE.Color(3, 2.4, 1)); for (let k = 0; k < 20; k++) fx.sparks.emit(p.clone().add(new THREE.Vector3(0, 1, 0)), rndVec(new THREE.Vector3(), 10), new THREE.Color(5, 3.5, 1.2), 0.3, 0.6, 0.02);
    e.say(i ? 'Echo two, online.' : 'Echo one, online.', true);
  });
  sfx.zap?.(1); banner('BACKUP', `the Champion summoned two Echoes${champ.adapt.level ? ` · they share its ${champ.adapt.level} adaptation${champ.adapt.level > 1 ? 's' : ''}` : ''}`, 2);
};
const bossCtx = {
  scene, fx, sfx, vox, smash, blastAll, cars, get fire() { return fire; }, get player() { return player; },
  chest: () => chestPos(new THREE.Vector3()), knockPlayer: (d, p, k) => knockPlayer(d, p, k), hurtPlayer: (d) => hurtPlayer(d),
  shake: (k) => { shake = Math.min(1, shake + k); }, hitstop: (t) => { hitstop = Math.max(hitstop, t); },
  onDamage: (d) => dummyA.onDamage?.(d), dummySay: () => {}, dmgMul: () => dummyA.ctx.dmgMul() * mind.resist(dummyA.ctx.src), get mind() { return mind; },
  onDefeat: (b) => {
    game.score += b.score;
    banner(`${b.name} DOWN!`, `+${b.score.toLocaleString()}`, 4);
    sfx.boom(2); game.pickT = 5; mind.event('bossDown');
  },
};
const bossPool = [];
const foeCtx = Object.assign(Object.create(bossCtx), {
  heroClass: () => robot.constructor, voltClass: Volt, lastPower: () => lastPower,
  sonicBoomAt: (p, level) => sonicBoom(level, p), banner: (a, b, t) => banner(a, b, t),
});
swarm = new Swarm({
  scene, fx, sfx, vox, get player() { return player; }, chest: () => chestPos(new THREE.Vector3()),
  knockPlayer: (d, p, k) => knockPlayer(d, p, k), hurtPlayer: (d) => hurtPlayer(d), score: (n) => { game.score += n; },
  shieldOn: () => shield.on, banner: (a, b, t) => banner(a, b, t), get mind() { return mind; },
});
site = new ConstructionSite({
  scene, fx, sfx, vox, smash, blastAll, dummy, cars, get player() { return player; },
  score: (n, label) => { game.score += n; banner(label, `+${n.toLocaleString()}`, 1.4); }, shake: (k) => { shake = Math.min(1, shake + k); },
}, new THREE.Vector3(SITE.x, 0, SITE.z));
under = new Underground({ scene });
const liveBosses = () => bossPool.filter((b) => b.active && !b.dead);
function nearestBoss(p) { let best = null, bd = 1e9; for (const b of liveBosses()) { const d = b._distTo(p); if (d < bd) { bd = d; best = b; } } return best; }
// `boss` stands for the whole pool: blasts and updates reach every boss, everything else the nearest one
boss = new Proxy({}, {
  get(_, k) {
    if (k === 'blast') return (...a) => { for (const b of bossPool) b.blast(...a); };
    if (k === 'update') return (dt) => { for (const b of bossPool) b.update(dt); };
    if (k === 'rayHit') return (o, d, maxT) => { let best = null; for (const b of liveBosses()) { const t = b.rayHit(o, d, best ?? maxT); if (t != null && (best == null || t < best)) best = t; } return best; };
    if (k === 'active') return liveBosses().length > 0;
    const b = nearestBoss(player.pos) || { active: false, dead: true, _distTo: () => 1e9, radius: 0, damage() {}, pos: new THREE.Vector3(0, -999, 0), hp: 0, max: 1 };
    const v = b[k]; return typeof v === 'function' ? v.bind(b) : v;
  },
});

// ---------------------------------------------------------------- spawning
// R opens the menu. At most two enemies at a time; a third replaces the oldest.
const enemies = []; // { kind: 'dummy' | 'boss', ref }
function parkDummy(d) { d.active = false; d.group.visible = false; d.atk = null; d.spawn(new THREE.Vector3(9000, -400, 9000), 0); d.active = false; }
function despawn(e) {
  if (e.kind === 'dummy' && e.ref.adapt) helpers.clear();
  if (e.kind === 'dummy') { if (player.holding && focusD === e.ref) { player.holding = false; player.throwWind = 0; } parkDummy(e.ref); }
  else if (e.kind === 'swarm') swarm.clear();
  else { const b = e.ref; for (const s2 of b.shots || []) scene.remove(s2.m); if (b.shots) b.shots = []; b.active = false; b.dead = true; if (b.robot) scene.remove(b.robot.root); b.beam.visible = false; for (const k of b.rocks) scene.remove(k.m); b.rocks = []; for (const o of b.orbs || []) scene.remove(o.m); if (b.orbs) b.orbs = []; }
  const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1);
}
function spawnEnemy(type) {
  for (const e of [...enemies]) if ((e.kind === 'boss' && !e.ref.active) || (e.kind === 'dummy' && !e.ref.active)) enemies.splice(enemies.indexOf(e), 1);
  if (enemies.length >= 2) despawn(enemies[0]);
  const f = fwdH(new THREE.Vector3());
  if (type === 'dummy' || type === 'champion') {
    const d = dummies.find((x) => !x.active && !x.isHelper) || dummies[0];
    const p = player.pos.clone().addScaledVector(f, 9); p.x += (Math.random() - 0.5) * 6;
    p.y = d._groundAt(p.x, p.z, Math.max(p.y + 2, 70));
    d.active = true; d.group.visible = true; d.ko = false; d.fights = fightsPref;
    d.setVariant(type === 'champion' ? { ...VARIANTS[4], invulnerable: true, adaptive: true } : { ...VARIANTS[0], name: 'Fighting Dummy' });
    d.spawn(p, Math.atan2(player.pos.x - p.x, player.pos.z - p.z));
    d.say(type === 'champion' ? ['Finally. A worthy opponent.', 'Kneel before the Champion.'] : ['Fresh out of the box!', 'Let us dance.'], true);
    enemies.push({ kind: 'dummy', ref: d }); if (mind.met) mind.event('spawn');
    banner(type === 'champion' ? 'CHAMPION' : 'FIGHTING DUMMY', 'incoming', 1.4);
  } else if (type === 'swarm') {
    swarm.spawn(20, player.pos);
    enemies.push({ kind: 'swarm', ref: swarm });
    banner('SWARM', '20 bots incoming · they climb', 1.8);
  } else if (type === 'mimic' || type === 'rival') {
    const kind = type === 'mimic' ? 'mimic' : 'vanta';
    let b = bossPool.find((x) => x.kind === kind && !x.active);
    if (!b) { b = new FlyerFoe(foeCtx, kind); bossPool.push(b); }
    b.spawn(player.pos);
    enemies.push({ kind: 'boss', ref: b });
    banner(b.name, kind === 'mimic' ? 'it copies you · and your powers' : 'a rival hero · dogfights at Mach speed', 2.5);
  } else {
    const Cls = type === 'warlord' ? Warlord : Colossus;
    let b = bossPool.find((x) => x instanceof Cls && x.constructor === Cls && !x.active);
    if (!b) { b = new Cls(bossCtx); bossPool.push(b); }
    b.spawn(player.pos, 0, type === 'warlord' ? player.pos.clone().addScaledVector(f, 26) : player.pos.clone().addScaledVector(f, 70));
    enemies.push({ kind: 'boss', ref: b });
    if (mind.met) mind.event('spawn');
    banner(b.name, type === 'warlord' ? '"Kneel."' : 'boss incoming', 2.5);
  }
}
const spawnMenu = { open: false };
function toggleSpawnMenu(v = !spawnMenu.open) { spawnMenu.open = v; $('spawnMenu').hidden = !v; }
function spawnChoice(k) {
  if (k === 0) { for (const e of [...enemies]) despawn(e); banner('CLEARED', '', 0.8); }
  else if (k === 9) mind.purge();
  else if (k === 8) { ambush.on = !ambush.on; banner('AMBUSHES', ambush.on ? 'ON · enemies may burst out of buildings' : 'OFF', 1.4); $('ambushState').textContent = ambush.on ? 'on' : 'off'; }
  else spawnEnemy(['dummy', 'champion', 'colossus', 'warlord', 'swarm', 'mimic', 'rival'][k - 1]);
  toggleSpawnMenu(false);
}
document.querySelectorAll('[data-spawn]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); spawnChoice(+b.dataset.spawn); }));
heroP = new HeroPowers({
  scene, fx, sfx, vox, dummy, cars, props, birds, smash, blastAll, get fire() { return fire; }, get player() { return player; },
  strike: (p) => strikeLightning(p), quake: () => powers.quake(),
  chest: () => chestPos(new THREE.Vector3()), aim: () => aim.point, aimDir: (from) => aimDirFrom(from, new THREE.Vector3()),
  hand: (side) => robot.handWorld(side, new THREE.Vector3()),
  teleport: (p) => { player.pos.copy(p); player.stun = 0; },
  shake: (k) => { shake = Math.min(1, shake + k); }, hitstop: (t) => { hitstop = Math.max(hitstop, t); },
});
// the powers panel lists the current hero's kit
const POW_STATE = {
  HOLE: () => (powers.hole ? 'active' : 'ready'), LIFT: () => (powers.tk ? 'holding' : 'hold'), ZAP: () => (powers.zap ? 'zapping' : 'hold'),
  METEOR: () => (powers.meteor ? 'incoming' : 'ready'), GRAVITY: () => (powers.grav ? 'active' : 'ready'), DECOY: () => (powers.decoy ? 'up' : 'ready'),
  MISSILES: () => (powers.missiles.length ? powers.missiles.length + ' in air' : 'ready'), QUAKE: () => (powers.quakes.length ? 'shaking' : 'ready'),
  TORNADO: () => (powers.twisters.length ? powers.twisters.length + ' active' : 'ready'),
  OVERDRIVE: () => (heroP.overdrive > 0 ? 'ON' : 'off'), STORM: () => (heroP.storms.length ? 'striking' : 'ready'),
  BOULDER: () => (heroP.boulders.length ? 'thrown' : 'ready'), 'GROUND POUND': () => (heroP.pound ? heroP.pound.phase : 'ready'),
  RAGE: () => (heroP.rage > 0 ? 'RAGING' : 'off'),
  REWIND: () => (RW.on ? 'rewinding' : `hold · ${Math.min(RW.keep, RW.snaps.length / 10).toFixed(0)}s`),
  NOVA: () => (ult.k >= 1 ? 'READY' : Math.round(ult.k * 100) + '%'), SHIELD: () => (shield.on ? 'UP' : Math.round(shield.e * 100) + '%'), DRONES: () => (drones.length ? Math.ceil(drones[0].t) + 's' : 'ready'), 'STOP TIME': () => (tf.on ? 'stopped' : 'ready'),
};
let powCells = [];
function buildPowerHud() {
  const el = $('powers'); el.textContent = '';
  powCells = [...robot.kit.hud, ['4', 'NOVA'], ['5', 'SHIELD'], ['6', 'DRONES'], ['7', 'REWIND']].map(([k, name]) => {
    const s = document.createElement('span'); s.textContent = `${k} ${name} `;
    const b = document.createElement('b'); b.textContent = 'ready'; s.appendChild(b); el.appendChild(s);
    return [b, POW_STATE[name] || (() => 'ready')];
  });
}
buildPowerHud();

// what the dummy is fighting: the player, or the hologram decoy while one is up
function targetPos() { return powers.decoy ? powers.decoy.pos : player.pos; }
function targetChest(out) { return powers.decoy ? out.copy(powers.decoy.pos).setY(powers.decoy.pos.y + 1.6) : chestPos(out); }
function targetVel() { return powers.decoy ? ZERO : player.vel; }
const ZERO = new THREE.Vector3();

// ---------------------------------------------------------------- flying cars
function updateCarHits() {
  const pc = chestPos(tmp3), dc = dummy.chest(new THREE.Vector3());
  for (const c of cars.cars) {
    if (c.asleep || c.held) continue;
    const sp = c.v.length();
    if (sp < 9) continue;
    if (c.thrownBy === 'dummy' && c.p.distanceTo(targetChest(tmp2)) < 2.7) {
      dummy.ctx.hitPlayer(c.v.clone(), 46, 'car'); c.v.multiplyScalar(0.35); c.thrownBy = null;
      dummy.say(['Parking ticket!', 'Special delivery!', 'Hope you have insurance!'], true);
    } else if (c.thrownBy !== 'dummy' && dummy.mode !== 'held' && c.p.distanceTo(dc) < 2.5) {
      dummy.hit(dc, 3, c.v.clone().multiplyScalar(0.9)); c.v.multiplyScalar(0.6); c.thrownBy = null;
    }
  }
  // the player ramming cars at speed
  const sp = player.vel.length();
  if (sp > 9) { const c = cars.carAt(pc, 0.6); if (c && c !== player.holdingCar) { cars.hit(c, pc, player.vel.clone().multiplyScalar(0.9)); player.vel.multiplyScalar(0.85); shake = Math.min(1, shake + 0.15); sfx.boom(0.4); } }
}
// anything fast that brushes street furniture knocks it flying
function bumpProps() {
  const sp = player.vel.length();
  if (sp > 5) props.bump(tmp.copy(player.pos).setY(player.pos.y + 0.6), 0.9, player.vel);
  if (dummy.runFast && dummy.mode === 'stand') props.bump(tmp.copy(dummy.root).setY(dummy.root.y + 0.6), 0.7, tmp2.set(Math.sin(dummy.yaw) * 9, 0, Math.cos(dummy.yaw) * 9));
  for (const c of cars.cars) if (!c.asleep && !c.held && c.v.lengthSq() > 16) props.bump(c.p, 2.2, c.v);
}

// the dummy can lift a parked car and throw it
dummy.ctx.nearestCar = (p, r) => cars.nearest(p, r);
dummy.ctx.holdCar = (c) => cars.hold(c, 'dummy');
dummy.ctx.carryCar = (c, pos, yaw) => cars.carry(c, pos, yaw);
dummy.ctx.dropCar = (c) => cars.release(c, new THREE.Vector3(), null);
dummy.ctx.throwCar = (c) => {
  const aim = targetChest(new THREE.Vector3());
  const T = Math.max(0.35, Math.hypot(aim.x - c.p.x, aim.z - c.p.z) / 30);
  aim.addScaledVector(targetVel(), T * 0.7);
  cars.release(c, new THREE.Vector3((aim.x - c.p.x) / T, (aim.y - c.p.y) / T + 0.5 * 20 * T, (aim.z - c.p.z) / T), 'dummy');
  sfx.whoosh(); shake = Math.min(1, shake + 0.15);
};

// ---------------------------------------------------------------- the dummy fights back
let tagged = 0;
let fightsPref = true;
function setFights(v) {
  fightsPref = v;
  dummy.fights = v; if (!v) dummy.atk = null;
  try { localStorage.setItem('rubble-fight', v ? '1' : '0'); } catch (e) { /* ignore */ }
  $('fightHud').textContent = v ? 'Fights back' : 'Peaceful';
}
try { dummy.fights = localStorage.getItem('rubble-fight') !== '0'; } catch (e) { /* ignore */ }
setFights(dummy.fights);
// knock the player back with a jolt
// knock the player around (any source); dummy hits also count on the scoreboard
function knockPlayer(dir, power, kind = 'blast') {
  if (shield.on && shield.e > 0) { shield.flash = 1; shield.e = Math.max(0, shield.e - power * 0.002); player.vel.addScaledVector(dir.clone().normalize(), power * 0.1); return; }
  const d = dir.clone().setY(0).normalize();
  // real knockback: big launch plus a short loss of control so it carries (hard hits smash you through walls)
  const up = { tackle: 0.35, slam: 0.75, uppercut: 1.0, rock: 0.35, punch: 0.3 }[kind] ?? 0.3;
  player.vel.set(player.vel.x * 0.3, Math.max(0, player.vel.y * 0.3), player.vel.z * 0.3);
  player.vel.addScaledVector(d, power); player.vel.y += power * up;
  player.stun = power >= 18 ? 0.5 + power / 60 : power >= 8 ? 0.25 + power / 90 : 0;
  player.grounded = false; player.charging = false; player.punchT = 0;
  if (power >= 30) hitstop = Math.max(hitstop, 0.05 + power / 900);
  robot.hitReact(power, d);
  const c = chestPos(new THREE.Vector3());
  for (let i = 0; i < 24; i++) fx.sparks.emit(c, rndVec(new THREE.Vector3(), 14).addScaledVector(d, 6), new THREE.Color(5, 4, 2.5), 0.2 + Math.random() * 0.25, 0.6, 0.02);
  fx.wave(c, 1.6, 0.22);
  shake = Math.min(1, shake + 0.25 + power / 60);
  sfx.boom(0.4 + power / 45); sfx.punch(1);
}
dummy.ctx.hitPlayer = (dir, power, kind) => {
  if (powers.decoy) { powers.decoyHit(power); return; } // it was fighting the hologram
  if (shield.on && dummies.some((d) => d.active && d.has('breaker'))) {
    shield.e = Math.max(0, shield.e - 0.4); shield.flash = 1;
    if (shield.e <= 0.01) { shield.on = false; banner('SHIELD BROKEN', 'it learned to break it', 1.2); sfx.glass(); }
  }
  dummy.noteHit();
  const m = dummy.v.dmg;
  knockPlayer(dir, power * Math.sqrt(m), kind);
  tagged++; $('tagHud').textContent = tagged;
  hurtPlayer(power * 0.75 * m);
  // reactive armour / a raised shield sends it flying back
  if ((up.thorns || shield.on) && power > 4) {
    const dc = dummy.chest(new THREE.Vector3()), away = dc.clone().sub(player.pos).setY(0).normalize();
    dummy.hit(dc, 3, away.multiplyScalar(30 + 15 * up.thorns + (shield.on ? 15 : 0)).add(new THREE.Vector3(0, 9, 0)), 1);
    fx.wave(chestPos(new THREE.Vector3()), 3, 0.25, new THREE.Color(0.6, 2.4, 3.5));
  }
};
dummy.ctx.clang = (p) => { sfx.clang?.(); for (let i = 0; i < 10; i++) fx.sparks.emit(p, rndVec(new THREE.Vector3(), 16), new THREE.Color(5, 4.5, 3), 0.2, 0.8, 0.02); };

// ---------------------------------------------------------------- waves, health, score
// Knock the dummy out to bring on the next, tougher variant. Your armour regenerates when you
// avoid hits for a few seconds; get knocked out and you're back up with a score penalty.
const game = { wave: 0, score: 0, combo: 0, comboT: 0, php: 200, pmax: 200, regenT: 0, invuln: 0, nextWaveT: -1, bannerT: 0, best: 0 };
try { game.best = parseInt(localStorage.getItem('rubble-best') || '0', 10) || 0; } catch (e) { /* ignore */ }
function banner(text, sub = '', t = 2.6) { $('banner').hidden = false; $('bannerText').textContent = text; $('bannerSub').textContent = sub; game.bannerT = t; }
function variantFor(i) {
  const v = VARIANTS[Math.min(i, VARIANTS.length - 1)];
  const extra = Math.max(0, i - (VARIANTS.length - 1));
  return { ...v, hp: Math.round(v.hp * (1 + extra * 0.35)), dmg: v.dmg * (1 + extra * 0.1), name: extra ? `${v.name} ${extra + 1}` : v.name };
}
const INTROS = { Rookie: 'Fresh out of the box!', Brawler: "I've been working out.", Speedster: 'Catch me if you can!', Juggernaut: 'Go on. Hit me.', Champion: 'Finally. A worthy opponent.' };
dummy.onKO = (d) => {
  mind.event('unitDown');
  if (d && d.isHelper) { game.score += 1500; banner('ECHO DOWN', '+1,500', 1.2); sfx.boom(0.9); setTimeout(() => { if (d.ko) parkDummy(d); }, 3500); return; }
  const bonus = d && d.v.name === 'Champion' ? 5000 : 1000;
  game.score += bonus;
  banner('KNOCKOUT!', `+${bonus.toLocaleString()}`);
  game.pickT = 1.6; game.windUsed = 0;
  sfx.boom(1.2);
  // it lies there a while, then is taken away
  if (d) setTimeout(() => { const e = enemies.find((x) => x.ref === d); if (e && d.ko) despawn(e); }, 6000);
};
dummy.onDamage = (d) => {
  if (up.lifesteal) game.php = Math.min(game.pmax, game.php + d * up.lifesteal);
  if (!ult.lock) ult.k = Math.min(1, ult.k + d * 0.0028 * up.ult);
  game.combo = game.comboT > 0 ? game.combo + 1 : 1; game.comboT = 2.5;
  game.score += Math.round(d * 3 * (1 + Math.min(40, game.combo) * 0.1));
};
function hurtPlayer(d) {
  if (game.invuln > 0) return;
  d *= kit().armor * heroP.armorMul * up.armor;
  if (shield.on && shield.e > 0) { shield.e = Math.max(0, shield.e - d * 0.004); shield.flash = 1; sfx.clang(); return; }
  ult.k = Math.min(1, ult.k + d * 0.003 * up.ult);
  game.php -= d; game.regenT = up.regenDelay;
  $('hpBox').classList.add('hit'); setTimeout(() => $('hpBox').classList.remove('hit'), 140);
  if (game.php <= 0 && up.secondWind > (game.windUsed || 0)) {
    game.windUsed = (game.windUsed || 0) + 1; game.php = game.pmax * 0.5; game.invuln = 3;
    banner('SECOND WIND', 'back in the fight', 1.6); nova(chestPos(new THREE.Vector3()), 0.7);
    return;
  }
  if (game.php <= 0) {
    game.php = game.pmax; game.invuln = 2.5; game.score = Math.max(0, game.score - 500);
    banner('KNOCKED OUT', 'back on your feet · −500'); mind.event('playerDown');
    dummy.say(['Down goes the robot!', 'Stay down!', 'And THAT is how it is done.'], true);
  }
}
function updateGame(dt) {
  game.comboT = Math.max(0, game.comboT - dt); if (game.comboT === 0) game.combo = 0;
  game.invuln = Math.max(0, game.invuln - dt);
  game.pmax = 200 + up.hpAdd;
  game.regenT -= dt; if (game.regenT <= 0) game.php = Math.min(game.pmax, game.php + 14 * up.regen * dt);
  if (game.pickT > 0) { game.pickT -= dt; if (game.pickT <= 0) openPicker(); }
  if (game.bannerT > 0) { game.bannerT -= dt; $('banner').style.opacity = Math.min(1, game.bannerT * 2); if (game.bannerT <= 0) $('banner').hidden = true; }
  if (game.score > game.best) { game.best = game.score; if (Math.random() < dt) { try { localStorage.setItem('rubble-best', String(Math.round(game.best))); } catch (e) { /* ignore */ } } }
  // the top bar follows the nearest enemy
  let tgtName = 'PRESS R TO SPAWN AN ENEMY', tgtK = 0, bestD = 1e9;
  for (const d of dummies) if (d.active && !d.ko) { const dd = d.chest(tmp).distanceTo(player.pos); if (dd < bestD) { bestD = dd; tgtName = d.v.name.toUpperCase() + (d.adapt ? `${d.adapt.level ? ` · ADAPTED ×${d.adapt.level}` : ''}${helpers.alive && !d.isHelper ? ` · ${helpers.alive} ECHO${helpers.alive > 1 ? 'ES' : ''}` : ''}` : d.v.invulnerable ? ' · INDESTRUCTIBLE' : ''); tgtK = d.hp / d.v.hp; } }
  for (const b of liveBosses()) { const dd = b._distTo(player.pos); if (dd < bestD) { bestD = dd; tgtName = b.name; tgtK = b.hp / b.max; } }
  $('waveName').textContent = tgtName;
  $('dhpFill').style.transform = `scaleX(${Math.max(0, tgtK)})`;
  $('scoreVal').textContent = Math.round(game.score).toLocaleString();
  $('comboVal').textContent = game.combo > 1 ? `×${(1 + Math.min(40, game.combo) * 0.1).toFixed(1)} · ${game.combo} hit combo` : `best ${Math.round(game.best).toLocaleString()}`;
  $('hpFill').style.transform = `scaleX(${Math.max(0, game.php / game.pmax)})`;
  $('ultFill').style.transform = `scaleX(${ult.k})`; $('ultBox').classList.toggle('ready', ult.k >= 1);
  $('shFill').style.transform = `scaleX(${shield.e})`; $('shBox').classList.toggle('on', shield.on);
}

// hurl a chunk of rubble on a ballistic arc, leading the player
const rocks = [];
dummy.ctx.throwRock = (from, spread = 0, size = 1) => {
  const aim = targetChest(new THREE.Vector3());
  const dist = Math.hypot(aim.x - from.x, aim.z - from.z);
  const T = Math.max(0.3, dist / 30);
  aim.addScaledVector(targetVel(), T * 0.8);
  if (spread) { const side = new THREE.Vector3(aim.z - from.z, 0, -(aim.x - from.x)).normalize(); aim.addScaledVector(side, spread * 2.2); }
  const v = new THREE.Vector3((aim.x - from.x) / T, (aim.y - from.y) / T + 0.5 * 20 * T, (aim.z - from.z) / T);
  const it = debris.spawn(from, v, MAT.CONCRETE, new THREE.Color(0.75, 0.73, 0.7), 0.6 * size);
  if (it) rocks.push({ it, life: 5, prev: v.length(), size });
  sfx.whoosh();
};
dummy.ctx.whoosh = () => sfx.whoosh();
// Reflective Plating: your laser comes back at you
dummy.ctx.reflectLaser = (dt, d) => {
  hurtPlayer(16 * dt);
  if (Math.random() < dt * 12) { const c = d.chest(new THREE.Vector3()); fx.sparks.emit(c, chestPos(new THREE.Vector3()).sub(c).setLength(60), new THREE.Color(6, 2, 1), 0.25, 0, 0.06); }
};
dummy.onAdapt = (d, a) => {
  banner('CHAMPION ADAPTS', `${a.name}: ${a.desc}`, 3);
  fx.wave(d.chest(new THREE.Vector3()), 5, 0.45, new THREE.Color(3, 2.6, 1)); sfx.zap?.(1.2); sfx.freeze(true); setTimeout(() => sfx.freeze(false), 120);
};
const adrenalineOn = () => up.adrenaline > 0 && game.php < game.pmax * 0.35;
dummy.ctx.dmgMul = () => up.dmg * (adrenalineOn() ? 1 + 0.6 * up.adrenaline : 1);
dummy.ctx.poiseMul = () => up.poise;
// metal-on-metal sparks where it's hit, and armour plates that break off and clatter away
dummy.ctx.sparks = (p, k) => { for (let i = 0; i < 4 + k * 22; i++) fx.sparks.emit(p, rndVec(new THREE.Vector3(), 6 + k * 18), new THREE.Color(5, 3.6, 1.8), 0.15 + Math.random() * 0.3, 0.9, 0.02); if (k > 0.5) sfx.clang(); };
dummy.ctx.shed = (p) => { debris.spawn(p, rndVec(new THREE.Vector3(), 7).add(new THREE.Vector3(0, 6, 0)), MAT.TRIM_DARK, new THREE.Color(0.55, 0.58, 0.62), 0.35); sfx.clang(); };
// the rock bursts where it lands: a small blast that hurts if you're near it
function rockBurst(p, size) {
  smash(p, 1.1 * size, { outward: 6, up: 3 });
  fx.wave(p, 2.6 * size, 0.25, new THREE.Color(1.6, 1.3, 1.0));
  blastAll(p, 4, 10);
  dustColor.setRGB(0.6, 0.57, 0.53);
  for (let i = 0; i < 8; i++) fx.dust.emit(p, rndVec(tmp3, 6), dustColor, 1.2, 1.4, 2, 0.4);
  const c = targetChest(new THREE.Vector3()), dd = c.distanceTo(p);
  if (dd < 3.2) dummy.ctx.hitPlayer(c.clone().sub(p), 26 * size * (1 - dd / 4), 'rock');
  sfx.boom(0.3);
}
function updateRocks(dt) {
  const c = targetChest(tmp3);
  for (let i = rocks.length - 1; i >= 0; i--) {
    const r = rocks[i];
    r.life -= dt;
    if (r.it.dead || r.life <= 0) { rocks.splice(i, 1); continue; }
    const sp = r.it.v.length();
    if (sp > 5 && r.it.p.distanceTo(c) < 1.4) {
      dummy.ctx.hitPlayer(r.it.v.clone(), 30 * r.size, 'rock');
      rockBurst(r.it.p.clone(), r.size * 0.7);
      r.it.v.multiplyScalar(-0.25);
      dummy.say(['Bullseye!', 'Nothing but brick!', 'Ha! Got you!'], true);
      rocks.splice(i, 1); continue;
    }
    if (r.prev > 10 && sp < r.prev * 0.55) { rockBurst(r.it.p.clone(), r.size); rocks.splice(i, 1); continue; } // hit something
    r.prev = sp;
  }
}
// leaping ground slam: shockwave that breaks what it lands on and launches you if you're close
dummy.ctx.slam = (p) => {
  smash(p.clone().add(new THREE.Vector3(0, 0.2, 0)), 2.6, { outward: 9, up: 6, max: 600 });
  fx.ring(p, 16, 0.6); fx.wave(p.clone().add(new THREE.Vector3(0, 0.6, 0)), 7, 0.35, new THREE.Color(1.8, 1.6, 1.3));
  blastAll(p, 12, 24, null, 0.9);
  dustColor.set(0xb9ad98);
  for (let i = 0; i < 36; i++) { const a = Math.random() * 6.28; fx.dust.emit(tmp.set(p.x, p.y + 0.4, p.z), tmp2.set(Math.cos(a) * 15, 0.6, Math.sin(a) * 15), dustColor, 1.6, 1.6 + Math.random(), 2.4, 0.45); }
  const tp = targetPos(), dd = Math.hypot(tp.x - p.x, tp.z - p.z);
  if (dd < 9 && Math.abs(tp.y - p.y) < 4) dummy.ctx.hitPlayer(new THREE.Vector3(tp.x - p.x, 0, tp.z - p.z), 14 + 32 * (1 - dd / 9), 'slam');
  shake = Math.min(1, shake + Math.max(0.15, 0.7 - p.distanceTo(camera.position) / 60));
  sfx.boom(1.1);
};


// optional comic-ink outlines on the characters (toggle with O)
const outlines = [...chars.filter(Boolean).map((c) => addOutline(c.root)), addOutline(dummy.group, { thickness: 0.003 })];
let outlineOn = true;
onNewChar = (c) => { const o = addOutline(c.root); o.setVisible(outlineOn); outlines.push(o); };
try { outlineOn = localStorage.getItem('rubble-ink') !== '0'; } catch (e) { /* ignore */ }
function setOutline(v) { outlineOn = v; outlines.forEach((o) => o.setVisible(v)); try { localStorage.setItem('rubble-ink', v ? '1' : '0'); } catch (e) { /* ignore */ } }
setOutline(outlineOn);
parkDummy(dummyA); parkDummy(dummyB); parkDummy(echoA); parkDummy(echoB);
setTimeout(() => banner('PRESS R', 'to spawn a dummy or a boss', 3), 1500);

// ---------------------------------------------------------------- player
const player = {
  pos: new THREE.Vector3(0, 0, 13), vel: new THREE.Vector3(), flying: false, grounded: true,
  yaw: Math.PI, camYaw: Math.PI, camPitch: -0.08, camDist: 5.5, holding: false, throwT: 0, throwWind: 0, lastYaw: Math.PI, turnRate: 0, yawVel: 0, prevVel: new THREE.Vector3(), acc: new THREE.Vector3(),
  charge: 0, charging: false, punchT: 0, punchDir: new THREE.Vector3(), punchPow: 0, punchHit: false, laser: false, laserTick: 0,
};
const keys = new Set();
const mouse = { l: false, r: false };
let locked = false, started = false, fallbackLook = false;

function fwd3(out) { const cp = Math.cos(player.camPitch); return out.set(Math.sin(player.camYaw) * cp, Math.sin(player.camPitch), Math.cos(player.camYaw) * cp); }
function fwdH(out) { return out.set(Math.sin(player.camYaw), 0, Math.cos(player.camYaw)); }
function rightH(out) { return out.set(-Math.cos(player.camYaw), 0, Math.sin(player.camYaw)); }
function chestPos(out) { out.copy(player.pos); out.y += 1.6; return out; }

// Where the crosshair points in the world.
const aim = { point: new THREE.Vector3(), normal: new THREE.Vector3(), kind: 'none', t: 0 };
function updateAim() {
  const o = tmp.copy(camera.position);
  const d = camera.getWorldDirection(tmp2);
  const skip = Math.max(0, camera.position.distanceTo(player.pos) - 1.5);
  o.addScaledVector(d, skip);
  let best = 600, kind = 'sky';
  aim.normal.set(0, 0, 0);
  const vh = vox.raycast(o, d, best);
  if (vh) { best = vh.t; kind = 'voxel'; aim.normal.set(vh.nx, vh.ny, vh.nz); }
  if (dummy.mode !== 'held') { const dh = dummy.raycast(o, d, best); if (dh) { best = dh.t; kind = 'dummy'; aim.normal.copy(d).negate(); } }
  aim.car = null;
  { const ch = cars.raycast(o, d, best); if (ch && ch.car !== player.holdingCar) { best = ch.t; kind = 'car'; aim.car = ch.car; aim.normal.copy(d).negate(); } }
  { const th = train.raycast(o, d, best); if (th) { best = th.t; kind = 'voxel'; aim.normal.copy(d).negate(); } }
  aim.swarmBot = null; { const sb = swarm.rayHit(o, d, best); if (sb) { best = sb.t; kind = 'swarm'; aim.swarmBot = sb.b; aim.normal.copy(d).negate(); } }
  if (boss.active) { const bt = boss.rayHit(o, d, best); if (bt != null) { best = bt; kind = 'boss'; aim.normal.copy(d).negate(); } }
  if (d.y < 0) {
    const tg = -o.y / d.y;
    if (Math.hypot(o.x, o.z) < 600 && Math.hypot(o.x + d.x * Math.min(tg, best), o.z + d.z * Math.min(tg, best)) < 600) { if (tg < best) { best = tg; kind = 'ground'; aim.normal.set(0, 1, 0); } }
    else {
      // march the hills
      for (let t = 2; t < best; t += Math.max(2, t * 0.02)) {
        const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
        if (y < groundH(x, z)) { best = t; kind = 'ground'; aim.normal.set(0, 1, 0); break; }
      }
    }
  }
  aim.point.copy(o).addScaledVector(d, best); aim.kind = kind; aim.t = best + skip;
}
function aimDirFrom(from, out) { return out.subVectors(aim.point, from).normalize(); }

// ---------------------------------------------------------------- input
const overlay = $('overlay');
function requestLock() {
  sfx.init();
  started = true;
  try {
    const p = renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => enableFallback());
  } catch (e) { enableFallback(); }
  setTimeout(() => { if (!locked) enableFallback(); }, 600);
}
function enableFallback() { fallbackLook = true; overlay.hidden = true; $('lookhint').hidden = false; }
overlay.addEventListener('click', requestLock);
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (locked) { overlay.hidden = true; fallbackLook = false; $('lookhint').hidden = true; }
  else if (started && !fallbackLook) { overlay.hidden = false; $('startBtn').textContent = 'Click to resume'; mouse.l = mouse.r = false; player.laser = false; }
});
document.addEventListener('pointerlockerror', enableFallback);
addEventListener('mousemove', (e) => {
  if (!locked && !fallbackLook) return;
  const s = fallbackLook ? 0.004 : 0.0022;
  player.camYaw -= e.movementX * s;
  player.camPitch = Math.max(-1.45, Math.min(1.45, player.camPitch - e.movementY * s));
});
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!locked && !fallbackLook) return;
  if (e.button === 0) { mouse.l = true; onPrimaryDown(); }
  if (e.button === 2) mouse.r = true;
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) { if (mouse.l) onPrimaryUp(); mouse.l = false; }
  if (e.button === 2) mouse.r = false;
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  {
    const kid = kit().id;
    const P = { KeyZ: 'hole', KeyN: 'clap', KeyM: 'meteor', KeyB: 'lift', KeyP: 'gravity', KeyU: 'decoy', Digit4: 'nova', Digit6: 'drones', KeyI: 'gravity slam',
      Digit1: kid === 'titan' ? 'boulder' : kid === 'volt' ? 'overdrive' : 'missiles', Digit2: kid === 'titan' ? 'pound' : kid === 'volt' ? 'storm' : 'quake', Digit3: kid === 'titan' ? 'rage' : 'dash' }[e.code];
    if (P && !spawnMenu.open && !picker.open) { lastPower = { name: P, t: time }; if (enemies.length) mind.power(P); }
  }
  if (spawnMenu.open) { const k = { Digit0: 0, Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, Digit6: 6, Digit7: 7, Digit8: 8, Digit9: 9 }[e.code]; if (k != null) { spawnChoice(k); return; } if (e.code === 'KeyR' || e.code === 'Escape') { toggleSpawnMenu(false); return; } }
  if (picker.open) { const k = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code]; if (k != null) pickUpgrade(k); return; }
  if (e.code === 'Digit4') { if (ult.k >= 1) { ult.k = 0; nuke(chestPos(new THREE.Vector3())); } else banner('NOVA', `charging · ${Math.round(ult.k * 100)}%`, 0.8); return; }
  if (e.code === 'Digit5') { if (shield.on) shield.on = false; else if (shield.e > 0.1) { shield.on = true; for (const d of dummies) if (d.active) d.observe('shield'); if (enemies.length) mind.observe('shield'); sfx.freeze(true); setTimeout(() => sfx.freeze(false), 60); } return; }
  if (e.code === 'Digit6') { spawnDrones(); return; }
  if (e.code === 'KeyI') { gravitySlam(); return; }
  const gated = ['KeyZ', 'KeyN', 'KeyM', 'KeyP', 'KeyU', 'KeyB', 'KeyX'];
  if (kit().allowed && gated.includes(e.code) && !kit().allowed.has(e.code)) { banner(robot.name.toUpperCase(), 'that power is not in this hero\'s kit · V to switch', 1.2); return; }
  if (kit().id === 'volt' && /^Digit[123]$/.test(e.code)) { ({ Digit1: () => heroP.toggleOverdrive(), Digit2: () => heroP.storm(), Digit3: () => heroP.boltDash() })[e.code](); return; }
  if (kit().id === 'titan' && /^Digit[123]$/.test(e.code)) { ({ Digit1: () => heroP.boulder(), Digit2: () => heroP.groundPound(), Digit3: () => heroP.toggleRage() })[e.code](); return; }
  switch (e.code) {
    case 'KeyF': toggleFlight(); break;
    case 'KeyE': if (player.holding) throwDummy(); else tryGrab(); break;
    case 'KeyR': toggleSpawnMenu(); break;
    case 'KeyT': rebuildTown(); break;
    case 'KeyQ': setQuality((quality + 1) % QUALITY.length, true); break;
    case 'KeyV': setCharacter(charIdx + 1); break;
    case 'KeyO': setOutline(!outlineOn); break;
    case 'KeyG': setFights(!dummy.fights); break;
    case 'KeyX': if (tf.on) freezeOff(); else freezeOn(); break;
    case 'KeyZ': powers.castHole(); break;
    case 'KeyN': powers.clap(); break;
    case 'KeyM': powers.callMeteor(); break;
    case 'KeyP': powers.gravityFlip(); break;
    case 'KeyU': powers.spawnDecoy(); break;
    case 'Digit1': powers.barrage(); break;
    case 'Digit2': powers.quake(); break;
    case 'Digit8': sfx.musicOn = !sfx.musicOn; break;
    case 'Digit9': atmo.hour = (atmo.hour + 6) % 24; break;
    case 'Digit0': atmo.weather = (atmo.weather + 1) % 3; atmo.stormT = 2; break;
    case 'KeyB': if (!player.holding) powers.grab(); break;
    case 'KeyH': $('help').hidden = !$('help').hidden; break;
    case 'KeyJ': mouse.l = true; onPrimaryDown(); break;
    case 'KeyK': mouse.r = true; break;
    case 'Space': if (!player.flying && !player.grounded) startFlight(); else if (!player.flying && player.grounded) { player.vel.y = kit().jump; player.grounded = false; } break;
  }
});
addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'KeyJ') { if (mouse.l) onPrimaryUp(); mouse.l = false; }
  if (e.code === 'KeyK') mouse.r = false;
  if (e.code === 'KeyB') powers.release();
});
addEventListener('blur', () => { keys.clear(); mouse.l = mouse.r = false; });

function startFlight() { if (!kit().canFly) return; player.flying = true; player.grounded = false; sfx.whoosh(); }
function toggleFlight() { if (player.flying) player.flying = false; else startFlight(); }

function respawnDummy() {
  const f = fwdH(tmp);
  const p = player.pos.clone().addScaledVector(f, 5); p.y = 0;
  player.holding = false; player.throwWind = 0; if (player.holdingCar) { cars.release(player.holdingCar, new THREE.Vector3(), null); player.holdingCar = null; }
  dummy.spawn(p, player.camYaw + Math.PI);
  game.nextWaveT = -1;
}
function rebuildTown() {
  debris.clear(); buildVoxelTown(vox); fx.clearScorch(); train.newTrain(); RW.snaps.length = 0; RW.log.length = 0;
  player.holding = false; player.throwWind = 0; if (player.holdingCar) { cars.release(player.holdingCar, new THREE.Vector3(), null); player.holdingCar = null; }
}

function tryGrab() {
  const c = chestPos(tmp); dummy.chest(tmp2);
  if (tmp2.distanceTo(c) < 3.6) { player.holding = true; dummy.grab(robot.handWorld(-1, tmp3)); return; }
  const G = site.nearestGirder(player.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 3.5);
  if (G) { player.holding = true; player.holdingGirder = G; site.grab(G); banner('GIRDER', 'click to swing · E to throw', 1.2); return; }
  const car = cars.nearest(player.pos, 4.8);
  if (car) { player.holding = true; player.holdingCar = car; cars.hold(car, 'player'); sfx.boom(0.3); }
}
// Throwing is a short wind-up (lean and twist back), then the release with a whipping follow-through.
const THROW_WIND = 0.3;
function throwDummy() {
  if (!player.holding || player.throwWind > 0) return;
  player.throwWind = 0.001;
}
function releaseThrow() {
  player.holding = false; player.throwWind = 0; player.throwT = 1;
  const d = aimDirFrom(robot.handWorld(-1, tmp3), tmp);
  if (player.holdingGirder) { site.throw(tmp2.copy(d).multiplyScalar(70).add(player.vel)); player.holdingGirder = null; }
  else if (player.holdingCar) { cars.release(player.holdingCar, tmp2.copy(d).multiplyScalar(75).add(player.vel), 'player'); player.holdingCar = null; }
  else dummy.release(tmp2.copy(d).multiplyScalar(105).add(player.vel));
  shake = Math.min(1, shake + 0.2);
  sfx.whoosh();
}

function onPrimaryDown() {
  if (player.holdingGirder) { if (!(player.swingT > 0)) { player.swingT = 0.4; player.swingHits = 0; player.throwT = 1; sfx.whoosh(); } mouse.l = false; return; }
  if (player.holding) { throwDummy(); mouse.l = false; return; }
  if (player.punchT > 0.1) return;
  player.charging = true; player.charge = 0;
}
function onPrimaryUp() {
  if (!player.charging) return;
  if (player.charge > 0.5) swarm.shake(null);
  player.charging = false;
  const power = (0.3 + Math.min(1, player.charge / 1.1) * 1.0) * kit().punch * heroP.punchMul;
  player.punchPow = power; player.punchT = 0.4; player.punchHit = false;
  aimDirFrom(chestPos(tmp), player.punchDir);
  if (dummy.chest(tmp2).distanceTo(player.pos) < 9) dummy.tryDodge(player.punchDir);
  player.vel.addScaledVector(player.punchDir, 22 + 30 * power);
  if (!player.flying && player.punchDir.y > 0.3) player.grounded = false;
  player.charge = 0;
  sfx.whoosh();
}

function punchImpact(point, dir, power) {
  dummyA.ctx.src = 'punch';
  for (const d of dummies) if (d.active && d.adapt && d.chest(new THREE.Vector3()).distanceTo(point) < 3 + 2.6 * power) d.observe('punch');
  if (dummies.some((d) => d.active && d.chest(new THREE.Vector3()).distanceTo(point) < 4 + 2.6 * power) || liveBosses().some((b) => b._distTo(point) < b.radius + 3)) mind.observe('punch');
  try { punchImpact0(point, dir, power); } finally { dummyA.ctx.src = null; }
}
function punchImpact0(point, dir, power) {
  if (point.y < 0.6 && dir.y < 0.05 && under.breach(point.x, point.z, 2.2 + power * 1.6)) { fx.wave(point, 4, 0.3); sfx.crumble(200); banner('BREACH', 'drop in to the tunnels', 1); }
  const R = 1.3 + 2.6 * power;
  const c = point.clone().addScaledVector(dir, R * 0.35);
  smash(c, R, { vel: tmp2.copy(dir).multiplyScalar(18 + 45 * power), inherit: 1, outward: 6 + 10 * power, up: 3, max: 1200 });
  dummy.hit(point, R * 1.5, tmp2.copy(dir).multiplyScalar(40 + 75 * power).addScaledVector(UP, 5 + 6 * power));
  blastAll(point, R * 3, 10 + 25 * power, dir);
  fx.wave(point, R * 2.4, 0.3 + power * 0.15);
  if (point.y < 2.5) fx.ring(point, R * 4);
  fx.punchLight.position.copy(point); fx.punchLight.intensity = 80 * power;
  for (let i = 0; i < 30 + power * 50; i++) fx.sparks.emit(point, rndVec(tmp3, 30).addScaledVector(dir, -6), new THREE.Color(5, 3.6, 2), 0.25 + Math.random() * 0.4, 0.6, 0.02);
  dustColor.set(0xcfc7ba);
  for (let i = 0; i < 12 + power * 20; i++) fx.dust.emit(point, rndVec(tmp3, 14), dustColor, 1.5 + Math.random() * 2, 1.5 + Math.random() * 2, 2, 0.4);
  shake = Math.min(1, shake + 0.3 + 0.45 * power);
  hitstop = 0.04 + 0.07 * power;
  sfx.boom(power); sfx.punch(power);
  player.vel.multiplyScalar(0.12);
  player.punchHit = true;
}

function updatePunch(dt) {
  if (player.charging) player.charge += dt * kit().charge * up.charge;
  if (player.punchT <= 0) return;
  player.punchT -= dt;
  if (player.punchHit || player.punchT < 0.04) return;
  const c = chestPos(tmp3);
  const dir = player.punchDir;
  // contact tests along the punch line
  const reach = 2.6;
  const vh = vox.raycast(c, dir, reach);
  if (vh) { punchImpact(c.clone().addScaledVector(dir, vh.t), dir, player.punchPow); return; }
  { const th = train.raycast(c, dir, reach); if (th) { punchImpact(c.clone().addScaledVector(dir, th.t), dir, player.punchPow); return; } }
  { const sb = swarm.at(c.clone().addScaledVector(dir, 1.4), 1.2); if (sb) { swarm.damage(sb, 999); punchImpact(sb.p.clone().add(UP), dir, player.punchPow); return; } }
  dummy.chest(tmp);
  const fist = c.clone().addScaledVector(dir, 1.4);
  if (tmp.distanceTo(fist) < 1.6 && dummy.mode !== 'held') { punchImpact(tmp.clone(), dir, player.punchPow); return; }
  if (boss.active && !boss.dead && boss._distTo(fist) < boss.radius + 0.6) { punchImpact(fist.clone(), dir, player.punchPow); boss.damage(40 * player.punchPow, fist); return; }
  { const car = cars.carAt(fist, 0.6); if (car && car !== player.holdingCar) { punchImpact(fist.clone(), dir, player.punchPow); cars.hit(car, fist, dir.clone().multiplyScalar(30 + 60 * player.punchPow).add(new THREE.Vector3(0, 6, 0))); return; } }
  if (fist.y < 0.35) { punchImpact(new THREE.Vector3(fist.x, 0.1, fist.z), dir, player.punchPow); return; }
  // also bump any debris in the path
}

function updateLaser(dt) {
  const on = mouse.r && !player.holding;
  player.laser = on;
  if (!on) { fx.setBeam(0, null, null, false); fx.setBeam(1, null, null, false); fx.flare.visible = false; fx.laserLight.intensity = 0; return; }
  const ends = [];
  let hitKind = aim.kind, hitN = aim.normal.clone();
  if (robot.eyes.length < 2) fx.setBeam(1, null, null, false);
  for (let i = 0; i < robot.eyes.length; i++) {
    const e = robot.eyeWorld(i, new THREE.Vector3());
    const d = tmp.subVectors(aim.point, e);
    const len = d.length(); d.divideScalar(len);
    let end = aim.point.clone();
    const vh = vox.raycast(e, d, Math.max(0, len - 0.05));
    if (vh) { end = e.clone().addScaledVector(d, vh.t); if (i === 0) { hitKind = 'voxel'; hitN.set(vh.nx, vh.ny, vh.nz); } }
    fx.setBeam(i, e, end, true, time);
    ends.push(end);
  }
  const p = ends[0].clone().lerp(ends[ends.length - 1], 0.5);
  const beamDir = aimDirFrom(robot.eyeWorld(0, tmp3), new THREE.Vector3());
  // impact effects
  fx.flare.visible = hitKind !== 'sky';
  fx.flare.position.copy(p).addScaledVector(beamDir, -0.15);
  fx.flare.scale.setScalar(1.2 + Math.random() * 0.8);
  fx.laserLight.position.copy(p).addScaledVector(beamDir, -0.6);
  fx.laserLight.intensity = hitKind === 'sky' ? 0 : 10 + Math.random() * 6;
  if (hitKind !== 'sky') {
    for (let i = 0; i < 6; i++) {
      const v = rndVec(tmp, 1).add(hitN).normalize().multiplyScalar(6 + Math.random() * 14);
      fx.sparks.emit(p, v, robot.laserCore.clone().multiplyScalar(0.6), 0.2 + Math.random() * 0.45, 1, 0.025);
    }
    if (Math.random() < 0.5) { dustColor.setRGB(0.25, 0.23, 0.22); fx.dust.emit(p, tmp.copy(hitN).multiplyScalar(1.5).add(UP), dustColor, 0.6, 1.5 + Math.random(), 1.8, 0.35); }
  }
  player.laserTick -= dt;
  if (player.laserTick <= 0) {
    player.laserTick = 0.03;
    if (hitKind === 'voxel') {
      if (Math.random() < 0.1) fire.ignite(tmp3.copy(p).addScaledVector(hitN, 0.4), { life: 4 + Math.random() * 3, size: 0.8 });
      smash(tmp.copy(p).addScaledVector(beamDir, 0.25), 0.6, { vel: tmp2.copy(hitN).multiplyScalar(7), inherit: 1, outward: 2.5, up: 2.5, noDust: Math.random() < 0.6 });
    } else if (hitKind === 'ground') {
      fx.addScorch(tmp.copy(p).add(rndVec(tmp2, 0.25)), 0.9 + Math.random() * 0.6);
      if (Math.random() < 0.05) fire.ignite(tmp3.copy(p).setY(0.25), { life: 3 + Math.random() * 2, size: 0.7 });
    } else if (hitKind === 'car' && aim.car) {
      cars.hit(aim.car, p, tmp2.copy(beamDir).multiplyScalar(1.2));
      fire.heatCar(aim.car, 0.035);
    } else if (hitKind === 'swarm' && aim.swarmBot) {
      swarm.damage(aim.swarmBot, 6);
    } else if (hitKind === 'boss') {
      boss.damage(1.2, p);
    } else if (hitKind === 'dummy') {
      dummyA.ctx.src = 'laser';
      dummy.hit(p, 0.7, tmp2.copy(beamDir).multiplyScalar(2.2).addScaledVector(UP, 0.6), 0.2);
      dummy.burn += 0.03; dummy.anger += 0.04; dummyA.ctx.src = null;
    }
    blastAll(p, 1.2, 3);
  }
  // concussive pulse: every quarter second the beam detonates where it lands
  player.laserPulse = (player.laserPulse ?? 0) - dt;
  if (player.laserPulse <= 0 && hitKind !== 'sky') {
    player.laserPulse = 0.26;
    laserBlast(p.clone(), hitN.clone(), beamDir.clone());
  }
}

function laserBlast(p, n, dir) {
  dummyA.ctx.src = 'laser';
  try { laserBlast0(p, n, dir); } finally { dummyA.ctx.src = null; }
}
function laserBlast0(p, n, dir) {
  const R = 1.5;
  smash(p.clone().addScaledVector(dir, 0.4), R, { vel: n.clone().multiplyScalar(10).addScaledVector(dir, 6), inherit: 1, outward: 9, up: 4, max: 400 });
  dummy.hit(p, 3.2, tmp2.subVectors(dummy.chest(tmp3), p).setY(0).normalize().multiplyScalar(14).addScaledVector(dir, 10).addScaledVector(UP, 7), 0.4);
  blastAll(p, 5, 16, dir, 0.5);
  fx.wave(p, 3.4, 0.28, new THREE.Color(2.4, 1.0, 0.4));
  if (p.y < 1) { fx.ring(p, 6, 0.45); fx.addScorch(p, 2.2); }
  fx.punchLight.position.copy(p).addScaledVector(n, 0.5); fx.punchLight.intensity = Math.max(fx.punchLight.intensity, 45);
  for (let i = 0; i < 26; i++) fx.sparks.emit(p, rndVec(tmp3, 26).addScaledVector(n, 8), new THREE.Color(6, 2.6, 0.7), 0.2 + Math.random() * 0.35, 0.8, 0.02);
  dustColor.setRGB(0.42, 0.38, 0.35);
  for (let i = 0; i < 8; i++) fx.dust.emit(p, rndVec(tmp3, 7).addScaledVector(n, 3), dustColor, 1 + Math.random(), 1.2 + Math.random(), 2.2, 0.35);
  const dCam = p.distanceTo(camera.position);
  shake = Math.min(1, shake + Math.max(0.05, 0.3 - dCam / 120));
  sfx.boom(0.45);
}

// ---------------------------------------------------------------- movement + collision
const BODY = [0.4, 1.15, 1.9];
function updatePlayer(dt) {
  player.stun = Math.max(0, (player.stun || 0) - dt);
  const f3 = fwd3(new THREE.Vector3()), fh = fwdH(new THREE.Vector3()), rt = rightH(new THREE.Vector3());
  const ix = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const iz = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const iy = (keys.has('Space') ? 1 : 0) - (keys.has('KeyC') ? 1 : 0);
  const boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
  // arrow keys turn the camera (handy without a mouse)
  player.camYaw += ((keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0)) * dt * 2.2;
  player.camPitch = Math.max(-1.45, Math.min(1.45, player.camPitch + ((keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0)) * dt * 1.6));
  const v = player.vel;
  const charging = player.charging ? 0.5 : 1;
  if (player.flying) {
    const wish = new THREE.Vector3().addScaledVector(f3, iz).addScaledVector(rt, ix).addScaledVector(UP, iy);
    // afterburner: holding boost keeps accelerating toward the hero's top speed (Mach 3–5)
    player.burn = boost && iz > 0 ? (player.burn || 0) + dt : Math.max(0, (player.burn || 0) - dt * 3);
    const top = (kit().mach || 4) * MACH;
    const boostSp = kit().boost + (top - kit().boost) * Math.pow(Math.min(1, player.burn / 9), 1.6);
    const speed = (boost ? boostSp : kit().fly * up.speed * (adrenalineOn() ? 1.2 : 1)) * charging * (heroP.overdrive > 0 ? 1.4 : 1);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    const rate = boost ? (player.burn > 1.5 ? 1.2 : 1.8) : (v.length() > 200 ? 0.9 : 4);
    if (player.stun > 0) v.multiplyScalar(Math.exp(-0.7 * dt)); // knocked back: no control until it wears off
    else v.lerp(wish, 1 - Math.exp(-rate * dt));
  } else {
    const wish = new THREE.Vector3().addScaledVector(fh, iz).addScaledVector(rt, ix);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar((boost ? kit().sprint : kit().walk) * up.speed * (adrenalineOn() ? 1.2 : 1) * charging * (heroP.overdrive > 0 ? 1.5 : 1));
    const k = player.stun > 0 ? (player.grounded ? 1 - Math.exp(-2 * dt) : 0) : 1 - Math.exp(-(player.grounded && player.punchT <= 0 ? 12 : 2.5) * dt);
    v.x += (wish.x - v.x) * k; v.z += (wish.z - v.z) * k;
    v.y -= 32 * dt;
  }
  const speed = v.length();
  const steps = Math.min(140, Math.max(1, Math.ceil(speed * dt / 0.3)));
  let smashBudget = speed > 200 ? 5 : 1e9;
  const h = dt / steps;
  const wasGrounded = player.grounded;
  player.grounded = false;
  const preVy = v.y;
  for (let s = 0; s < steps; s++) {
    player.pos.addScaledVector(v, h);
    const sp = v.length();
    // super-speed: plough straight through buildings
    const sprinting = !player.flying && boost && Math.hypot(v.x, v.z) > 9;
    if (sp > 32 || sprinting) {
      const dir = tmp.copy(v).divideScalar(sp);
      const head = tmp2.copy(player.pos).add(new THREE.Vector3(0, 1.15, 0)).addScaledVector(dir, sprinting ? 0.9 : 1.1);
      if (smashBudget > 0 && (vox.solidAt(head.x, head.y, head.z) || vox.solidAt(head.x, head.y + 0.7, head.z) || vox.solidAt(head.x, head.y - 0.7, head.z))) {
        smashBudget--;
        const hyper = sp > 200;
        const n = smash(head, hyper ? 2.6 : sprinting && sp <= 32 ? 1.7 : 1.9, { vel: hyper ? tmp.clone().multiplyScalar(60) : v, inherit: 0.75, outward: hyper ? 14 : 7, up: 2, max: hyper ? 900 : undefined });
        if (n) { v.multiplyScalar(sprinting ? 0.995 : 0.985); shake = Math.min(1, shake + 0.12); }
      }
    }
    for (const bh of BODY) {
      const p = tmp3.set(player.pos.x, player.pos.y + bh, player.pos.z);
      const before = tmp.copy(p);
      const upN = vox.collideSphere(p, 0.42);
      if (upN !== null) {
        const delta = tmp2.subVectors(p, before);
        player.pos.add(delta);
        const dl = delta.length();
        if (dl > 1e-6) { delta.divideScalar(dl); const vn = v.dot(delta); if (vn < 0) v.addScaledVector(delta, -vn); }
        if (upN > 0.6 && bh === BODY[0]) player.grounded = true;
      }
    }
    { // the train: plough through it at speed, otherwise get pushed off it
      const hp = tmp3.set(player.pos.x, player.pos.y + 1.1, player.pos.z), car = train.solidAt(hp);
      if (car) {
        if (sp > 14) { smash(hp.clone().addScaledVector(v, 0.02), 2, { vel: v, inherit: 0.7, outward: 7, up: 2 }); v.multiplyScalar(0.96); shake = Math.min(1, shake + 0.1); }
        else { const lp = train._toLocal(car, hp, new THREE.Vector3()); if (lp.y > 3) lp.y = 4.1; else lp.x = Math.sign(lp.x || 1) * 1.9; car.g.localToWorld(lp); player.pos.set(lp.x, lp.y - 1.1, lp.z); if (lp.y > 3) { if (v.y < 0) v.y = 0; player.grounded = true; } }
      }
    }
    if (Math.abs(player.pos.x) > 300 || Math.abs(player.pos.z) > 300) {
      const tw = world.towers.at(tmp3.set(player.pos.x, player.pos.y + 1, player.pos.z));
      if (tw) {
        if (sp > 120) { towerImpact(tw, v); v.multiplyScalar(0.8); }
        else { // push out through the nearest face
          const ex = tw.w / 2 - Math.abs(player.pos.x - tw.x), ez = tw.d / 2 - Math.abs(player.pos.z - tw.z), ey = tw.y + tw.h - player.pos.y;
          if (ey < Math.min(ex, ez) && ey < 3) { player.pos.y = tw.y + tw.h; if (v.y < 0) v.y = 0; player.grounded = true; }
          else if (ex < ez) { player.pos.x = tw.x + Math.sign(player.pos.x - tw.x) * (tw.w / 2 + 0.05); v.x = 0; }
          else { player.pos.z = tw.z + Math.sign(player.pos.z - tw.z) * (tw.d / 2 + 0.05); v.z = 0; }
        }
      }
    }
    let gh = groundH(player.pos.x, player.pos.z), inTunnel = false;
    if (player.pos.y < -0.4 || (under.corridorAt(player.pos.x, player.pos.z) && under.openAt(player.pos.x, player.pos.z))) { gh = under.constrain(player.pos); inTunnel = true; if (player.pos.y < gh) {} }
    if (player.pos.y < gh) {
      if (v.y < -20 && gh < -2.5 && !inTunnel) { for (let i = 0; i < 20; i++) fx.dust.emit(player.pos, rndVec(new THREE.Vector3(), 6).setY(8 + Math.random() * 10), new THREE.Color(0.8, 0.88, 0.95), 1.5, 1.4, 1.8, 0.5); } // splash
      player.pos.y = gh;
      if (v.y < 0) v.y = 0;
      player.grounded = true;
    }
  }
  if (!player.flying && player.grounded && !wasGrounded && preVy < -24) superLanding(-preVy);
  if (player.grounded && !wasGrounded && preVy < -4) robot.land(-preVy);
  if (player.flying && player.grounded && iy < 0 && player.pos.y < 0.05) player.flying = false;
  if (player.flying) player.grounded = false;
  // dash through the dummy
  if (speed > 14 && dummy.mode !== 'held') {
    dummy.chest(tmp); chestPos(tmp2);
    if (tmp.distanceTo(tmp2) < 1.5 && (player.ramT = (player.ramT || 0) - dt) <= 0) {
      player.ramT = 0.5;
      dummy.observe?.('ram'); mind.observe('ram');
      if (dummy.has?.('brace')) {
        // it catches you mid-charge and hurls you back the way you came
        knockPlayer(v.clone().negate().add(new THREE.Vector3(0, 0.3, 0)), 45, 'tackle'); hurtPlayer(18);
        dummy.say(['Caught you.', 'Predictable.', 'Not this time.'], true); sfx.clang();
      } else { dummyA.ctx.src = 'ram'; dummy.hit(tmp, 1.8, tmp3.copy(v).multiplyScalar(1.15).addScaledVector(UP, 4)); dummyA.ctx.src = null; }
    }
  }
  player.pos.y = Math.min(player.pos.y, 4200);
  // the edge of the world: slide along it
  for (const k of ['x', 'z']) if (Math.abs(player.pos[k]) > WORLD_HALF - 200) { player.pos[k] = Math.sign(player.pos[k]) * (WORLD_HALF - 200); v[k] *= -0.2; }
  updateMach(dt);
  // facing
  const hv = Math.hypot(v.x, v.z);
  let targetYaw = player.yaw;
  if (player.charging || player.punchT > 0 || player.laser || player.holding) targetYaw = player.camYaw;
  else if (player.flying && hv > 3) targetYaw = Math.atan2(v.x, v.z);
  else if (!player.flying && hv > 0.5) targetYaw = Math.atan2(v.x, v.z);
  let dy = targetYaw - player.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  // turn with a damped spring so changes of direction have a little weight and settle smoothly
  const wy = player.punchT > 0 || player.charging || player.throwWind > 0 ? 26 : 13;
  player.yawVel += (wy * wy * dy - 2 * 0.85 * wy * player.yawVel) * dt;
  player.yaw += player.yawVel * dt;
}

// ---------------------------------------------------------------- supersonic flight
// A vapour cone flashes around you as you pass Mach 1, with a sonic boom; flying low and fast drags
// a shockwave over everything beneath you.
const vapor = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 32, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.5, 1.6), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
vapor.geometry.rotateX(-Math.PI / 2); vapor.geometry.translate(0, 0, -1.2); // tip forward along +Z
vapor.userData.noOutline = true; scene.add(vapor);
let machPrev = 0, shockT = 0;
function updateMach(dt) {
  const sp = player.vel.length(), m = sp / MACH;
  // every Mach barrier you break sets off a boom, each bigger than the last
  if (player.flying && Math.floor(m) > Math.floor(machPrev) && m >= 1) sonicBoom(Math.floor(m));
  // crossing into town at supersonic speed hits it with a boom too (you usually break the barrier out in the hills)
  { const inT = Math.abs(player.pos.x) < 200 && Math.abs(player.pos.z) < 200;
    if (inT && !updateMach.wasIn && m >= 1 && player.flying && time - (updateMach.lastEntry || -9) > 2) { updateMach.lastEntry = time; sonicBoom(Math.min(5, Math.floor(m)) + 1, player.pos.clone().addScaledVector(player.vel, 0.12)); }
    updateMach.wasIn = inT; }
  machPrev = m;
  // the cone: strongest right around the barrier, a ghost of it above
  const k = m < 0.85 ? 0 : m < 1.2 ? Math.sin((m - 0.85) / 0.35 * Math.PI) : 0.12;
  vapor.material.opacity += (k * 0.55 - vapor.material.opacity) * Math.min(1, dt * 10);
  vapor.visible = vapor.material.opacity > 0.01;
  if (vapor.visible) { vapor.position.copy(player.pos).add(tmp.set(0, 1.2, 0)); vapor.lookAt(tmp2.copy(vapor.position).add(player.vel)); vapor.scale.setScalar(1 + Math.random() * 0.06); }
  // low-level supersonic pass: a rolling shockwave on the ground
  if (m >= 1 && (shockT -= dt) <= 0) {
    shockT = 0.05;
    const gh = groundH(player.pos.x, player.pos.z), alt = player.pos.y - gh;
    if (alt < 80) {
      const g = new THREE.Vector3(player.pos.x, gh + 0.5, player.pos.z), k2 = 1 - alt / 80;
      blastAll(g, 18 + m * 6, (10 + m * 8) * k2, player.vel.clone().normalize(), 0.9);
      birds.scare(g, 120);
      if (alt < 40) shake = Math.min(1, shake + 0.06 * k2);
      // the shock cone rips windows and facades out of whatever it passes over
      if (Math.abs(g.x) < 185 && Math.abs(g.z) < 185) {
        for (let i = 0; i < 10 + m * 5; i++) {
          const q = tmp3.set(player.pos.x + (Math.random() - 0.5) * (14 + m * 6), player.pos.y - Math.random() * Math.min(alt + 2, 40), player.pos.z + (Math.random() - 0.5) * (14 + m * 6)).addScaledVector(player.vel, -Math.random() * 0.08);
          const mat = vox.solidAt(q.x, q.y, q.z);
          if (mat) smash(q.clone(), mat === MAT.GLASS || mat === MAT.GLASS_LIT ? 1.6 : 0.8 + k2 * 0.8, { vel: new THREE.Vector3(player.vel.x * 0.05, -6, player.vel.z * 0.05), outward: 5 + m * 2, up: 2, noDust: Math.random() < 0.6, max: 250 });
        }
      }
      const dc = dummy.chest(tmp); if (dc.distanceTo(g) < 14 * k2 + 4 && dummy.mode === 'stand') dummy.hit(dc, 3, tmp2.copy(player.vel).setLength(18 * k2).add(tmp3.set(0, 10 * k2, 0)), 1);
      if (gh < -2.5 && alt < 25) for (let i = 0; i < 6; i++) fx.dust.emit(g, rndVec(new THREE.Vector3(), 5).setY(10 + Math.random() * 14 * k2), new THREE.Color(0.85, 0.9, 0.95), 2.5, 1.8, 2, 0.5); // rooster tail over the sea
    }
  }
}
// A sonic boom launches a destructive shock sphere that expands at the speed of sound.
const shocks = [];
function sonicBoom(level = 1, at = null) {
  if (!at && enemies.length) mind.event('mach');
  const p = at ? at.clone() : player.pos.clone().add(tmp.set(0, 1.2, 0));
  const maxR = 60 + 40 * level;
  shocks.push({ c: p.clone(), r: 0, prev: 0, maxR, level, budget: 5000 + 4000 * level, hitD: false, hitB: false, towersDone: false, vdir: player.vel.clone().normalize() });
  fx.wave(p, maxR, maxR / MACH, new THREE.Color(1.6, 1.7, 1.8)); fx.wave(p, 12 + 6 * level, 0.35, new THREE.Color(2.5, 2.6, 2.8));
  blastAll(p, maxR * 0.55, 35 + 15 * level, null, 0.9);
  // a fireball at the heart of the boom
  fx.wave(p, 10 + 5 * level, 0.4, new THREE.Color(4, 2.4, 0.9)); fx.punchLight.position.copy(p); fx.punchLight.intensity = 300 + 150 * level;
  for (let i = 0; i < 40 + 20 * level; i++) fx.sparks.emit(p, rndVec(new THREE.Vector3(), 2).normalize().multiplyScalar(40 + Math.random() * 60), new THREE.Color(5, 3, 1.2), 0.4 + Math.random() * 0.5, 0.5, 0.04);
  for (let i = 0; i < 12; i++) fx.dust.emit(p, rndVec(new THREE.Vector3(), 14), new THREE.Color(2.6, 1.3, 0.4), 6 + 3 * level, 1.2, 2.5, 0.6);
  if (Math.abs(p.x) < 190 && Math.abs(p.z) < 190) smash(p.clone(), 3 + level, { outward: 16, up: 6, max: 6000 });
  if (level > 1) banner(`MACH ${level}`, 'sonic boom', 0.9);
  for (let i = 0; i < 40; i++) fx.dust.emit(p, rndVec(new THREE.Vector3(), 10).addScaledVector(player.vel, -0.05), new THREE.Color(0.9, 0.92, 0.95), 2 + Math.random() * 2, 0.8, 2.5, 0.5);
  sfx.boom(2); sfx.thunder?.(0.05, 0.6); sfx.duck?.(0.9);
  shake = Math.min(1, shake + 0.5); hitstop = Math.max(hitstop, 0.04);
  birds.scare(p, 200);
  if (dummy.chest(tmp).distanceTo(p) < 200) dummy.say(['Was that a SONIC BOOM?!', 'Show-off!', 'My EARS!'], true);
}
function updateShocks(dt) {
  for (const S of shocks) {
    S.prev = S.r; S.r = Math.min(S.maxR, S.r + (S.speed || MACH) * dt);
    const fall = 1 - S.r / S.maxR, L = S.level;
    // shatter whatever the shell passes through (glass goes first and furthest)
    const tries = S.nuke ? 220 : Math.min(200, 60 + L * 35);
    for (let i = 0; i < tries && S.budget > 0; i++) {
      const rr = S.prev + Math.random() * (S.r - S.prev + 0.5);
      const dir = rndVec(tmp, 2).normalize(); if (dir.y < -0.2) dir.y *= 0.3;
      const q = tmp2.copy(S.c).addScaledVector(dir, rr);
      // a share of every wave goes for the ground floors, so whole buildings lose their footing and come down
      if (Math.random() < 0.4) { const a = Math.random() * Math.PI * 2; q.set(S.c.x + Math.cos(a) * rr, 0.3 + Math.random() * 5, S.c.z + Math.sin(a) * rr); }
      if (Math.abs(q.x) > 185 || Math.abs(q.z) > 185 || q.y < 0) continue;
      const mat = vox.solidAt(q.x, q.y, q.z);
      if (!mat) continue;
      const glass = mat === MAT.GLASS || mat === MAT.GLASS_LIT;
      if (!glass && fall < 0.35 && Math.random() > 0.5) continue;
      if (Math.random() < 0.03 * L) fire.ignite(q.clone(), { life: 6, size: 1 });
      S.budget -= smash(q.clone(), S.nuke ? 2.6 + 2.2 * fall : glass ? 2.2 + L * 0.4 : 1.4 + (0.8 + L * 0.4) * fall, { vel: dir.clone().multiplyScalar(10 + 8 * L * fall), inherit: 1, outward: 4 + 3 * L * fall, up: 2, noDust: Math.random() < 0.5, max: 300 });
      if (glass && Math.random() < 0.2) sfx.glass();
    }
    // the dummy and the boss get slammed as it passes
    S.hitDs = S.hitDs || new Set();
    for (const dmy of dummies) {
      if (!dmy.active || S.hitDs.has(dmy)) continue;
      const dc = dmy.chest(new THREE.Vector3()), dd = dc.distanceTo(S.c);
      if (dd < S.r) { S.hitDs.add(dmy); const k = 1 - dd / S.maxR; dmy.takeDamage(S.nuke ? (dmy.v.hp * 0.75 + 400) * (0.4 + 0.6 * k) : (25 + 25 * L) * k); dmy.hit(dc, 3, dc.clone().sub(S.c).normalize().multiplyScalar(25 + 20 * L * k).add(new THREE.Vector3(0, 8, 0)), 1); dmy.say(['MY EARS!', 'Was that a SONIC BOOM?!', 'Show-off!'], true); }
    }
    S.hitBs = S.hitBs || new Set();
    for (const b of liveBosses()) if (!S.hitBs.has(b) && b._distTo(S.c) < S.r) { S.hitBs.add(b); b.damage(S.nuke ? b.max * 0.6 : (80 + 80 * L) * (1 - b._distTo(S.c) / S.maxR), S.c); }
    // far-city towers inside the blast come down
    if (!S.towersDone && S.r >= S.maxR * 0.6) {
      S.towersDone = true;
      for (const t of world.towers.list) if (t.alive && Math.hypot(t.x - S.c.x, t.z - S.c.z) < S.maxR * 0.45 && S.c.y < t.y + t.h + 40) { world.towers.topple(t, tmp.set(t.x - S.c.x, 0, t.z - S.c.z)); game.score += 800; }
    }
    if (S.r >= S.maxR) S.dead = true;
  }
  for (let i = shocks.length - 1; i >= 0; i--) if (shocks[i].dead) shocks.splice(i, 1);
}

// slamming into a far-city tower at speed brings it down
function towerImpact(t, v) {
  const p = player.pos.clone().add(tmp.set(0, 1.2, 0));
  world.towers.topple(t, v); mind.event('destruction');
  fx.wave(p, 30, 0.5, new THREE.Color(3, 2.2, 1.4));
  for (let i = 0; i < 60; i++) fx.sparks.emit(p, rndVec(new THREE.Vector3(), 40).addScaledVector(v, 0.1), new THREE.Color(5, 3.5, 2), 0.4 + Math.random() * 0.5, 0.8, 0.03);
  for (let i = 0; i < 30; i++) fx.dust.emit(p, rndVec(new THREE.Vector3(), 18).addScaledVector(v, 0.05), new THREE.Color(0.6, 0.56, 0.5), 8 + Math.random() * 10, 3 + Math.random() * 3, 2, 0.55);
  sfx.boom(2); sfx.crumble(500); sfx.glass();
  shake = Math.min(1, shake + 0.7); hitstop = Math.max(hitstop, 0.08);
  game.score += 2500; banner('TOWER DOWN', '+2500', 1.4);
}

// ---------------------------------------------------------------- upgrades + new powers
const picker = { open: false, opts: [] };
function openPicker() {
  picker.opts = rollUpgrades(3); picker.open = true;
  const el = $('upgCards'); el.textContent = '';
  picker.opts.forEach((u, i) => {
    const b = document.createElement('button'); b.type = 'button';
    const k = document.createElement('span'); k.className = 'k'; k.textContent = `${i + 1} · ${u.icon}`;
    const n = document.createElement('span'); n.className = 'n'; n.textContent = u.name;
    const d = document.createElement('span'); d.className = 'd'; d.textContent = u.desc;
    b.append(k, n, d); b.addEventListener('click', (e) => { e.stopPropagation(); pickUpgrade(i); }); el.appendChild(b);
  });
  $('upg').hidden = false;
}
function pickUpgrade(i) {
  const u = picker.opts[i]; if (!u) return;
  u.apply(up); up.picked.push(u.id);
  picker.open = false; $('upg').hidden = true;
  game.pmax = 200 + up.hpAdd; if (u.id === 'plating') game.php = game.pmax;
  banner(u.name.toUpperCase(), `upgrade ${up.picked.length} installed`, 1.4);
  sfx.freeze(false);
}

// NOVA: the ultimate. Everything within ~40 m is blasted, the dummy loses a big chunk of health and is
// thrown down, and the boss takes a huge hit.
// The full NOVA is a nuke: a ~400 m blast with a blinding flash, a crater, a shock wave that rolls
// through the whole town and a mushroom cloud. (Second Wind still sets off the small version.)
const nukes = [];
const craterQ = [];
function nuke(p) {
  mind.event('nuke');
  const R = 700;
  ult.lock = true; setTimeout(() => { ult.lock = false; }, 6000);
  const gp = p.clone().setY(Math.max(0.1, groundH(p.x, p.z)));
  atmo.flash = 3; fx.punchLight.position.copy(p); fx.punchLight.intensity = 4000;
  fx.wave(p, 70, 0.7, new THREE.Color(6, 5.5, 4.5)); fx.wave(p, R, R / 110, new THREE.Color(3.5, 2.2, 1.0)); fx.ring(gp, R);
  for (let i = 0; i < 300; i++) fx.sparks.emit(p, rndVec(new THREE.Vector3(), 2).normalize().multiplyScalar(60 + Math.random() * 140), new THREE.Color(6, 3.6, 1.4), 0.8 + Math.random() * 1.2, 0.3, 0.05);
  smash(gp.clone().add(new THREE.Vector3(0, 2, 0)), 16, { outward: 30, up: 20, max: 40000 });
  // ground zero is levelled: a ring of crater blasts eaten through over the next couple of seconds
  for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2, rr = 10 + Math.sqrt(Math.random()) * 110; craterQ.push(gp.clone().add(new THREE.Vector3(Math.cos(a) * rr, 2 + Math.random() * 30, Math.sin(a) * rr))); }
  blastAll(p, R * 0.6, 120, null, 1.5);
  shocks.push({ c: p.clone(), r: 0, prev: 0, maxR: R, level: 6, budget: 260000, speed: 160, nuke: true, hitD: false, hitB: false, towersDone: false });
  fx.addScorch(gp, 70);
  nukes.push({ p: gp, t: 0 });
  game.invuln = Math.max(game.invuln, 4);
  shake = 1; hitstop = Math.max(hitstop, 0.2);
  sfx.boom(2); sfx.thunder?.(0, 1); sfx.thunder?.(0.6, 1); sfx.duck?.(1); setTimeout(() => sfx.boom(2), 250); setTimeout(() => sfx.boom(1.6), 700);
  birds.scare(p, 1000);
  banner('NOVA', 'ground zero', 2);
}
function updateNukes(dt) {
  for (let i = 0; i < 3 && craterQ.length; i++) { const q = craterQ.shift(); smash(q, 9 + Math.random() * 4, { outward: 22, up: 14, max: 9000, noDust: Math.random() < 0.5 }); if (Math.random() < 0.3) fire.ignite(q.clone().setY(0.4), { life: 10, size: 1.6 }); }
  for (const N of nukes) {
    N.t += dt;
    const t = N.t, rise = Math.min(380, t * 70);
    if (t < 7) {
      // fireball, a rising stem, and the spreading cap of the mushroom cloud
      const hot = Math.max(0, 1 - t / 3);
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2, rr = Math.random() * (40 + Math.min(130, t * 30));
        fx.dust.emit(tmp.set(N.p.x + Math.cos(a) * rr, N.p.y + rise + (Math.random() - 0.3) * 25, N.p.z + Math.sin(a) * rr), tmp2.set(Math.cos(a) * 6, 4, Math.sin(a) * 6),
          new THREE.Color().setRGB(0.25 + 3 * hot, 0.22 + 1.4 * hot, 0.2 + 0.3 * hot), 50 + Math.random() * 50, 8 + Math.random() * 6, 2.2, 0.55);
      }
      fx.dust.emit(tmp.set(N.p.x + (Math.random() - 0.5) * 18, N.p.y + Math.random() * rise, N.p.z + (Math.random() - 0.5) * 18), tmp2.set(0, 12, 0), new THREE.Color().setRGB(0.3 + 2 * hot, 0.26 + 0.9 * hot, 0.22), 18 + Math.random() * 12, 6, 2, 0.5);
      if (t < 1.5) { fx.punchLight.position.copy(N.p).y += rise; fx.punchLight.intensity = 2500 * (1 - t / 1.5); }
    }
    if (t > 9) N.dead = true;
  }
  for (let i = nukes.length - 1; i >= 0; i--) if (nukes[i].dead) nukes.splice(i, 1);
}
function nova(p, k = 1) {
  ult.lock = true; setTimeout(() => { ult.lock = false; }, 600);
  fx.wave(p, 40 * k, 0.8, new THREE.Color(3.5, 2.6, 1.2)); fx.wave(p, 18 * k, 0.45, new THREE.Color(5, 4.5, 3.5)); fx.ring(p.clone().setY(Math.max(0.1, groundH(p.x, p.z))), 50 * k);
  fx.punchLight.position.copy(p); fx.punchLight.intensity = 400;
  for (let i = 0; i < 120; i++) fx.sparks.emit(p, rndVec(new THREE.Vector3(), 2).normalize().multiplyScalar(30 + Math.random() * 40), new THREE.Color(5, 3.8, 1.8), 0.5 + Math.random() * 0.6, 0.4, 0.04);
  smash(p.clone(), 5 * k, { outward: 18, up: 8, max: 3000 });
  blastAll(p, 40 * k, 60 * k, null, 1);
  const dc = dummy.chest(new THREE.Vector3()), dd = dc.distanceTo(p);
  for (const dmy of dummies) { if (!dmy.active) continue; const c2 = dmy.chest(new THREE.Vector3()); if (c2.distanceTo(p) < 45 * k) { dmy.takeDamage((dmy.v.hp * 0.28 + 120) * k); dmy.hit(c2, 3, c2.clone().sub(p).setY(0).normalize().multiplyScalar(55).add(new THREE.Vector3(0, 28, 0)), 1); } }
  void dd;
  for (const b of liveBosses()) if (b._distTo(p) < 60 * k) b.damage(900 * k, p);
  game.invuln = Math.max(game.invuln, 1.2);
  shake = 1; hitstop = Math.max(hitstop, 0.12); sfx.boom(2); sfx.duck?.(0.8); birds.scare(p, 200);
}

// SHIELD: a hard-light bubble that soaks hits and knockback and throws attackers back; drains while up.
const bubble3 = new THREE.Mesh(new THREE.SphereGeometry(1.6, 40, 24), new THREE.ShaderMaterial({
  uniforms: { uK: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vP = position; vec4 mv = viewMatrix * w; vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform float uK; uniform float uFlash; uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); float hex = 0.5 + 0.5 * sin(vP.y * 18.0 + uTime * 3.0) * sin(atan(vP.z, vP.x) * 12.0); gl_FragColor = vec4(vec3(0.35, 1.6, 2.4) * (f * 1.4 + hex * 0.08 + uFlash * 0.6) * uK, 1.0); }',
}));
bubble3.userData.noOutline = true; bubble3.visible = false; scene.add(bubble3);
function updateShield(dt) {
  if (shield.on) { shield.e -= dt * 0.2 / up.shieldMax; if (shield.e <= 0) { shield.e = 0; shield.on = false; sfx.glass(); } }
  else shield.e = Math.min(1, shield.e + dt * 0.08);
  shield.flash = Math.max(0, shield.flash - dt * 4);
  const u = bubble3.material.uniforms; u.uK.value += ((shield.on ? 1 : 0) - u.uK.value) * Math.min(1, dt * 10); u.uFlash.value = shield.flash; u.uTime.value = time;
  bubble3.visible = u.uK.value > 0.02;
  if (bubble3.visible) { bubble3.position.copy(chestPos(tmp3)); bubble3.scale.setScalar(robot.root.scale.x * (1 + shield.flash * 0.08)); }
}

// DRONES: two (or more) attack drones orbit you and shoot the dummy or the boss for 30 seconds.
const droneGeo = new THREE.OctahedronGeometry(0.16, 0), droneMat = new THREE.MeshStandardMaterial({ color: 0x223040, emissive: 0x40d8ff, emissiveIntensity: 2.5, metalness: 0.6, roughness: 0.3 });
const droneRing = new THREE.TorusGeometry(0.24, 0.025, 6, 20);
function spawnDrones() {
  for (const d of drones) scene.remove(d.m);
  drones = [];
  const n = 2 + up.drones;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Group(); m.add(new THREE.Mesh(droneGeo, droneMat)); const r = new THREE.Mesh(droneRing, droneMat); r.rotation.x = Math.PI / 2; m.add(r);
    m.userData.noOutline = true; scene.add(m);
    drones.push({ m, a: (i / n) * Math.PI * 2, t: 30, fire: Math.random() * 0.4, p: chestPos(new THREE.Vector3()) });
  }
  sfx.zap(0.8); banner('DRONES', `${n} deployed · 30s`, 1);
}
function updateDrones(dt) {
  const c = chestPos(tmp3);
  for (const D of drones) {
    D.t -= dt; D.a += dt * 2.2;
    const want = tmp2.set(c.x + Math.cos(D.a) * 1.8, c.y + 0.8 + Math.sin(D.a * 1.7) * 0.3, c.z + Math.sin(D.a) * 1.8);
    D.p.lerp(want, Math.min(1, dt * 8)); D.m.position.copy(D.p); D.m.rotation.y += dt * 6;
    D.fire -= dt;
    if (D.fire <= 0) {
      D.fire = 0.38;
      let tgt = null, onBoss = false;
      const onBot = null;
      if (!tgt && boss.active && !boss.dead) { const b = boss.pos.clone(); b.y += 1.2 * (boss.S || 8); if (b.distanceTo(D.p) < 110) { tgt = b; onBoss = true; } }
      if (!tgt && dummy.group.visible && !dummy.ko) { const dc = dummy.chest(new THREE.Vector3()); if (dc.distanceTo(D.p) < 70) tgt = dc; }
      if (tgt) {
        const dir = tgt.clone().sub(D.p), L = dir.length(); dir.divideScalar(L);
        for (let i = 0; i < 6; i++) fx.sparks.emit(D.p.clone().addScaledVector(dir, (i / 6) * L), dir.clone().multiplyScalar(0.01), new THREE.Color(1.5, 5, 7), 0.08, 0, 0.02);
        const k = 1 + 0.35 * up.drones;
        if (onBoss) boss.damage(9 * k, tgt);
        else { dummy.takeDamage(5 * k); if (Math.random() < 0.3) dummy.hit(tgt, 1.5, dir.clone().multiplyScalar(10).add(UP), 0.5); dummy.ctx.sparks?.(tgt, 0.2); }
        sfx.zap(0.25);
      }
    }
  }
  for (const D of drones) if (D.t <= 0) scene.remove(D.m);
  drones = drones.filter((D) => D.t > 0);
}

// ---------------------------------------------------------------- REWIND (hold 7)
// The last 12 seconds are recorded: every block that breaks (buildings and the train), and ten snapshots
// a second of you, the dummies, the bosses, the cars, the street props and the train. Holding 7 runs it
// all backwards: rubble flies back into the walls, the train rerails, the dummy un-flies. Let go and
// time carries on from there.
const RW = { snaps: [], log: [], on: false, cursor: 0, keep: 12, snapT: 0, k: 0, tickT: 0 };
vox.onRemove = (i, m, mat, col) => { if (!RW.on) RW.log.push({ t: time, i, m, mat, col }); };
const V3 = () => new THREE.Vector3();
function takeSnap() {
  const cs = cars.cars, ps = props.props;
  const carA = new Float32Array(cs.length * 10), propA = new Float32Array(ps.length * 7);
  cs.forEach((c, i) => { c.p.toArray(carA, i * 10); c.q.toArray(carA, i * 10 + 3); c.v.toArray(carA, i * 10 + 7); });
  ps.forEach((p, i) => { p.p.toArray(propA, i * 7); p.q.toArray(propA, i * 7 + 3); });
  RW.snaps.push({
    t: time,
    pl: { pos: player.pos.clone(), vel: player.vel.clone(), php: game.php, flying: player.flying, yaw: player.yaw },
    dm: dummies.map((d) => ({ active: d.active, ko: d.ko, hp: d.hp, mode: d.mode, root: d.root.clone(), yaw: d.yaw, p: d.p.map((v) => v.clone()), o: d.o.map((v) => v.clone()), vis: d.group.visible })),
    bs: bossPool.map((b) => ({ b, active: b.active, dead: b.dead, hp: b.hp, pos: b.pos ? b.pos.clone() : null, yaw: b.yaw, state: b.state, t: b.t })),
    carA, propA, tr: train.snapshot(),
  });
  while (RW.snaps.length && RW.snaps[0].t < time - RW.keep) RW.snaps.shift();
  // forget blocks older than the window
  let n = 0; while (n < RW.log.length && RW.log[n].t < time - RW.keep) n++;
  if (n > 2000 || (n && RW.log.length < 5000)) RW.log.splice(0, n);
}
function applySnap(A, B, k) {
  const L = (a, b) => (b ? a.clone().lerp(b, k) : a.clone());
  // you stand outside time: the world rewinds around you, you keep your place and your armour
  A.dm.forEach((s, j) => {
    const d = dummies[j], sb = B?.dm[j];
    d.active = s.active; d.ko = s.ko; d.hp = s.hp; d.group.visible = s.vis; d.atk = null;
    d.mode = s.mode === 'getup' || s.mode === 'held' ? 'ragdoll' : s.mode;
    d.root.copy(L(s.root, sb?.root)); d.yaw = s.yaw;
    for (let i = 0; i < d.n; i++) { d.p[i].copy(L(s.p[i], sb?.p[i])); d.o[i].copy(L(s.o[i], sb?.o[i])); }
  });
  for (const s of A.bs) { const b = s.b; if (!s.pos) continue; const was = b.active; b.active = s.active; b.dead = s.dead; b.hp = s.hp; b.pos.copy(s.pos); b.yaw = s.yaw; b.state = s.state; b.t = s.t; b.atk = null; if (b.robot) { if (b.active && !was) scene.add(b.robot.root); b.robot.root.visible = b.active; if (b.state !== 'fall') b.robot.root.quaternion.identity(); } }
  cars.cars.forEach((c, i) => { c.p.fromArray(A.carA, i * 10); c.q.fromArray(A.carA, i * 10 + 3); c.v.fromArray(A.carA, i * 10 + 7); c.w.set(0, 0, 0); c.held = null; c.asleep = c.v.lengthSq() < 0.01; cars._write(c); });
  props.props.forEach((p, i) => { p.p.fromArray(A.propA, i * 7); p.q.fromArray(A.propA, i * 7 + 3); p.v.set(0, 0, 0); p.w.set(0, 0, 0); p.asleep = true; props._write(p); });
  train.applySnapshot(A.tr);
}
train.log = (e) => { if (!RW.on) RW.log.push({ t: time, ...e }); };
// returns true while rewinding (the normal simulation is skipped)
function updateRewind(rdt) {
  const want = keys.has('Digit7') && RW.snaps.length > 1 && !picker.open;
  if (want && !RW.on) {
    RW.on = true; RW.cursor = time; if (enemies.length || mind.met) mind.event('rewind');
    debris.clear(); fire.fires.length = 0; shocks.length = 0; nukes.length = 0; craterQ.length = 0;
    player.holding = false; player.throwWind = 0; player.charging = false; player.laser = false; mouse.l = mouse.r = false;
    if (player.holdingGirder) { site.drop(); player.holdingGirder = null; }
    if (tf.on) freezeOff();
    sfx.freeze(true);
  } else if (!want && RW.on) {
    RW.on = false; time = RW.cursor; sfx.freeze(false);
    RW.snaps.length = Math.max(1, RW.snaps.findIndex((sn) => sn.t > time) < 0 ? RW.snaps.length : RW.snaps.findIndex((sn) => sn.t > time));
  }
  RW.k += ((RW.on ? 1 : 0) - RW.k) * Math.min(1, rdt * 8);
  if (!RW.on) {
    RW.snapT -= rdt; if (RW.snapT <= 0) { RW.snapT = 0.1; takeSnap(); }
    return false;
  }
  const oldest = RW.snaps[0].t;
  RW.cursor = Math.max(oldest, RW.cursor - rdt * 1.6);
  // un-break: blocks come back in reverse order
  let budget = 6000;
  while (RW.log.length && RW.log[RW.log.length - 1].t > RW.cursor && budget-- > 0) {
    const e = RW.log.pop();
    if (e.type === 'train') train.restore(e.car, e.i); else vox.restore(e.i, e.m, e.mat, e.col);
  }
  // snapshots either side of the cursor
  while (RW.snaps.length > 2 && RW.snaps[RW.snaps.length - 2].t > RW.cursor) RW.snaps.pop();
  const B = RW.snaps[RW.snaps.length - 1], A = RW.snaps.length > 1 ? RW.snaps[RW.snaps.length - 2] : B;
  const k = B.t > A.t ? Math.min(1, Math.max(0, (RW.cursor - A.t) / (B.t - A.t))) : 0;
  applySnap(A, B, k);
  time = RW.cursor;
  // you keep moving freely while the world runs backwards
  updatePlayer(rdt);
  const v = player.vel, cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
  robot.root.position.copy(player.pos); robot.root.rotation.y = player.yaw;
  robot.animate({ dt: rdt, flying: player.flying, grounded: player.grounded, hSpeed: Math.hypot(v.x, v.z), fwdSpeed: v.x * sy + v.z * cy, sideSpeed: v.x * cy - v.z * sy, vSpeed: v.y, boost: keys.has('ShiftLeft') || keys.has('ShiftRight'), aimPitch: player.camPitch, aimYawRel: 0, charge: 0, punchT: 0, holding: false, throwWind: 0, throwT: 0, turnRate: 0, laser: false, tk: false, clapT: 0, accFwd: 0, accSide: 0 });
  robot.root.updateMatrixWorld(true);
  dummy.update(0); boss.update(0);
  for (const b of bossPool) if (b.robot && b.active) { b.robot.root.position.copy(b.pos); if (b.state !== 'fall') b.robot.root.rotation.set(0, b.yaw, 0); }
  updateCamera(rdt); camera.updateMatrixWorld(); updateAim();
  fx.update(rdt, camera, false);
  finish.uniforms.uFreeze.value = Math.max(tf.k, RW.k * 0.85);
  RW.tickT -= rdt; if (RW.tickT <= 0) { RW.tickT = 0.12; sfx.tick(Math.random() < 0.5); }
  vox.flush(); cars.flush(); props.flush(); debris.flush?.();
  updateHud(rdt);
  hud.mode.textContent = `◀◀ REWIND  ${Math.max(0, RW.cursor - oldest).toFixed(1)}s`;
  return true;
}

// ---------------------------------------------------------------- GRAVITY WELL SLAM (I)
// From the air, plummet straight down; where you land a gravity well opens: everything is dragged in and
// down, and the buildings around you are crushed floor by floor from the top. From the ground you leap
// up first.
const gslam = { phase: null, t: 0, crush: [] };
function gravitySlam() {
  if (gslam.phase) return;
  const alt = player.pos.y - (player.pos.y < -0.4 ? (under.floorAt(player.pos.x, player.pos.z) ?? 0) : groundH(player.pos.x, player.pos.z));
  if (alt < 6) { player.vel.set(player.vel.x * 0.3, 34, player.vel.z * 0.3); player.grounded = false; player.flying = false; gslam.phase = 'rise'; }
  else { gslam.phase = 'dive'; player.flying = false; }
  gslam.t = 0; sfx.whoosh();
}
function updateGravitySlam(dt) {
  if (gslam.phase === 'rise' && player.vel.y < 6) gslam.phase = 'dive';
  if (gslam.phase === 'dive') {
    gslam.t += dt;
    player.vel.set(player.vel.x * 0.85, -150, player.vel.z * 0.85); player.flying = false;
    if (Math.random() < 0.9) fx.sparks.emit(chestPos(tmp), rndVec(tmp2, 3).setY(8), new THREE.Color(2.2, 0.8, 4), 0.3, 0, 0.06);
    if (player.grounded || gslam.t > 4) { gslam.phase = null; gravityWell(player.pos.clone()); }
  }
  // the crush: slices of the buildings around the well, eaten from the top down
  for (let n = 0; n < 4 && gslam.crush.length; n++) {
    const C = gslam.crush[0];
    C.t -= dt * (n ? 0 : 1);
    if (C.t > 0) break;
    gslam.crush.shift();
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * C.R;
      const q = new THREE.Vector3(C.c.x + Math.cos(a) * r, C.y, C.c.z + Math.sin(a) * r);
      if (vox.solidAt(q.x, q.y, q.z)) smash(q, 2.4, { vel: new THREE.Vector3((C.c.x - q.x) * 0.4, -26, (C.c.z - q.z) * 0.4), inherit: 1, outward: 2, up: 0, noDust: Math.random() < 0.6, max: 500 });
    }
  }
}
function gravityWell(p) {
  const R = 30;
  fx.wave(p.clone().add(UP), R, 0.6, new THREE.Color(2, 0.7, 4)); fx.wave(p.clone().add(UP), 10, 0.3, new THREE.Color(4, 2, 6)); fx.ring(p.clone(), R * 1.3); fx.addScorch(p, 12);
  for (let i = 0; i < 80; i++) { const a = Math.random() * Math.PI * 2, r = R * (0.3 + Math.random() * 0.7); fx.sparks.emit(new THREE.Vector3(p.x + Math.cos(a) * r, p.y + Math.random() * 12, p.z + Math.sin(a) * r), new THREE.Vector3(-Math.cos(a) * r, -8, -Math.sin(a) * r).multiplyScalar(1.2), new THREE.Color(2.4, 1, 4.5), 0.6, 0.5, 0.05); }
  sfx.boom(2); sfx.duck?.(0.6); shake = 1; hitstop = Math.max(hitstop, 0.12);
  smash(p.clone().add(new THREE.Vector3(0, 0.3, 0)), 5, { vel: new THREE.Vector3(0, -20, 0), outward: 6, up: 0, max: 3000 });
  under.breach(p.x, p.z, 6);
  // everything nearby is dragged in and slammed down
  for (const it of debris.items) { const d = it.p.distanceTo(p); if (d < R) { debris.wake(it); it.v.add(new THREE.Vector3(p.x - it.p.x, -12, p.z - it.p.z).multiplyScalar(0.6)); } }
  for (const c of cars.cars) { const d = c.p.distanceTo(p); if (d < R && !c.held) cars.hit(c, c.p.clone().add(UP), new THREE.Vector3(p.x - c.p.x, -14, p.z - c.p.z).setLength(20 * (1 - d / R) + 6)); }
  for (const pr of props.props) if (pr.p.distanceTo(p) < R) props._kick(pr, new THREE.Vector3(p.x - pr.p.x, -6, p.z - pr.p.z).multiplyScalar(0.5));
  for (const d of dummies) { if (!d.active) continue; const c = d.chest(new THREE.Vector3()); const dd = c.distanceTo(p); if (dd < R) { d.takeDamage(40 + 110 * (1 - dd / R)); d.hit(c, 3, new THREE.Vector3(p.x - c.x, -30, p.z - c.z).multiplyScalar(0.7), 1); } }
  for (const b of liveBosses()) if (b._distTo(p) < R) b.damage(350 * (1 - b._distTo(p) / (R + 5)) + 150, p);
  swarm.blast(p, R, 80); life.blast(p, R, 40, null); site.blast(p, R, 40, null);
  // queue the crush, top floor first
  gslam.crush.length = 0;
  for (let y = 60, k = 0; y >= 0.5; y -= 1.5, k++) gslam.crush.push({ c: p.clone(), y, R: R * (0.55 + 0.45 * (1 - y / 60)), t: k === 0 ? 0 : 0.035 });
  game.score += 1500; banner('GRAVITY WELL', '', 0.8);
}

// ---------------------------------------------------------------- AMBUSH (toggle: R then 8)
// While you're moving through town, enemies sometimes burst out of a building beside you.
const ambush = { on: false, t: 25 };
function updateAmbush(dt) {
  if (!ambush.on) return;
  ambush.t -= dt;
  const inT = Math.abs(player.pos.x) < 175 && Math.abs(player.pos.z) < 175 && player.pos.y < 40 && player.pos.y > -0.4;
  if (ambush.t > 0 || !inT || player.vel.length() < 5) return;
  // find a wall beside you
  const fw = fwdH(new THREE.Vector3()), side = new THREE.Vector3(-fw.z, 0, fw.x);
  let wall = null;
  for (let k = 0; k < 12 && !wall; k++) {
    const dir = side.clone().multiplyScalar(k % 2 ? 1 : -1).addScaledVector(fw, 0.3 + Math.random() * 0.8).normalize();
    for (let r = 4; r < 18; r += 1) { const q = player.pos.clone().addScaledVector(dir, r); q.y = 1.5 + Math.random() * 4; if (vox.solidAt(q.x, q.y, q.z)) { wall = { q, dir }; break; } }
  }
  if (!wall) { ambush.t = 3; return; }
  ambush.t = 30 + Math.random() * 30;
  const q = wall.q, out = wall.dir.clone().negate();
  smash(q.clone(), 3.2, { vel: out.clone().multiplyScalar(25), inherit: 1, outward: 10, up: 3, max: 1200 });
  fx.wave(q.clone(), 6, 0.35, new THREE.Color(3, 1.4, 0.6)); sfx.boom(1.4); shake = Math.min(1, shake + 0.4);
  const at = q.clone().addScaledVector(out, 1.5); at.y = 0;
  const live = enemies.filter((e) => e.ref.active).length;
  if (Math.random() < 0.5 || live >= 2) { swarm.spawn(8, player.pos, q.clone().addScaledVector(out, 1)); if (!enemies.some((e) => e.kind === 'swarm')) enemies.push({ kind: 'swarm', ref: swarm }); banner('AMBUSH!', 'a swarm burst out of the wall', 1.4); }
  else { spawnEnemy('dummy'); const d = enemies[enemies.length - 1].ref; d.spawn(at, Math.atan2(player.pos.x - at.x, player.pos.z - at.z)); d.push(out.clone().multiplyScalar(14).add(new THREE.Vector3(0, 5, 0))); banner('AMBUSH!', 'a fighter smashed out of the wall', 1.4); }
}

function superLanding(vy) {
  const p = player.pos.clone();
  if (vy > 40 && p.y < 0.3 && under.breach(p.x, p.z, 3 + vy / 30)) { player.grounded = false; player.vel.y = -vy * 0.4; }
  const onRoof = p.y > 0.2;
  if (onRoof && vy > 30) { // crash through
    smash(p.clone().add(new THREE.Vector3(0, -0.3, 0)), 2.2, { vel: new THREE.Vector3(0, -vy * 0.5, 0), inherit: 1, outward: 6 });
    player.grounded = false; player.vel.y = -vy * 0.6;
  }
  const power = Math.min(1.3, vy / 50);
  fx.ring(p, 10 * power + 4);
  fx.wave(p.clone().add(new THREE.Vector3(0, 0.5, 0)), 4 + 5 * power);
  dummy.hit(p, 6 + 6 * power, new THREE.Vector3(0, 10 + 14 * power, 0));
  blastAll(p, 8 + 8 * power, 8 + 14 * power, null, 0.8);
  dustColor.set(0xb9ad98);
  for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28; fx.dust.emit(tmp.set(p.x, 0.4, p.z), tmp2.set(Math.cos(a) * 14, 0.5, Math.sin(a) * 14), dustColor, 1.6, 1.6 + Math.random(), 2.4, 0.45); }
  shake = Math.min(1, shake + 0.4 * power + 0.2);
  sfx.boom(power);
}

// ---------------------------------------------------------------- post-processing + quality
const QUALITY = [
  { name: 'Low', pr: 0.75, shadow: 2048, ao: false, smaa: true },
  { name: 'Medium', pr: 1, shadow: 2048, ao: true, smaa: true },
  { name: 'High', pr: 1.25, shadow: 4096, ao: true, smaa: true },
  { name: 'Ultra', pr: 2, shadow: 4096, ao: true, smaa: true },
];
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.6, thickness: 1.0, scale: 1.1, samples: 16 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
gtao.blendIntensity = 0.9;
{
  const ov = gtao.overrideVisibility.bind(gtao);
  gtao.overrideVisibility = () => { ov(); fx.fx.visible = false; fx.scorch.visible = false; sky.visible = false; clouds.visible = false; };
}
composer.addPass(gtao);
// threshold above 1: only HDR emissives (eyes, lasers, sparks, bulbs) bloom, never lit surfaces
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.4, 1.1);
composer.addPass(bloom);
const smaa = new SMAAPass(innerWidth, innerHeight);
composer.addPass(smaa);
composer.addPass(new OutputPass());
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.28 }, uTime: { value: 0 }, uAb: { value: 0 }, uFreeze: { value: 0 }, uRipple: { value: -1 }, uAspect: { value: 1.7 }, uHole: { value: new THREE.Vector4(0, 0, 0, 0) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig; uniform float uTime; uniform float uAb; uniform float uFreeze; uniform float uRipple; uniform float uAspect; uniform vec4 uHole; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 d=vUv-.5; float r=dot(d,d);
      vec2 uv = vUv;
      // singularity: gravitational lensing around its point on screen (xy = screen pos, z = radius, w = strength)
      if (uHole.w > 0.0) {
        vec2 hd = (vUv - uHole.xy) * vec2(uAspect, 1.0);
        float hr = length(hd);
        float pull = uHole.w * uHole.z * uHole.z / (hr * hr + uHole.z * uHole.z * 0.35);
        uv -= normalize(hd + 1e-5) / vec2(uAspect, 1.0) * min(pull * 0.06, hr * 0.9);
      }
      // time-stop ripple: a refracting ring that sweeps outward from the centre of the screen
      if (uRipple >= 0.0) {
        float dist = length(d * vec2(uAspect, 1.0));
        float ring = uRipple * 1.9;
        float w = exp(-pow((dist - ring) * 9.0, 2.0)) * (1.0 - uRipple);
        uv += normalize(d + 1e-5) * w * 0.035;
      }
      float ab = uAb + uFreeze * 0.006;
      vec3 c;
      c.r=texture2D(tDiffuse, uv - d*ab*r*4.0).r; c.g=texture2D(tDiffuse, uv).g; c.b=texture2D(tDiffuse, uv + d*ab*r*4.0).b;
      // frozen time: drain the colour, push it cold, frost the edges, add a faint shimmer
      if (uFreeze > 0.001) {
        float lum = dot(c, vec3(0.299, 0.587, 0.114));
        vec3 cold = mix(vec3(lum), c, 0.22) * vec3(0.82, 0.96, 1.2) + vec3(0.0, 0.01, 0.03);
        c = mix(c, cold, uFreeze);
        float edge = smoothstep(0.12, 0.42, r);
        float frost = h(floor(vUv * vec2(320.0, 180.0))) * 0.5 + 0.5;
        c = mix(c, vec3(0.78, 0.9, 1.0) * frost, uFreeze * edge * 0.38);
        c += uFreeze * 0.025 * sin(vUv.y * 900.0 + uTime * 3.0) * vec3(0.3, 0.5, 0.8);
      }
      c *= 1. - (uVig + uFreeze * 0.25) * r * 1.6;
      c += (h(vUv*1000.+uTime)-.5)*0.018;
      gl_FragColor=vec4(c,1.);
    }`,
});
composer.addPass(finish);
addEventListener('resize', () => { finish.uniforms.uAspect.value = innerWidth / innerHeight; });
finish.uniforms.uAspect.value = innerWidth / innerHeight;

let quality = Math.min(3, Math.max(0, parseInt(params.get('q') ?? '2', 10)));
let autoQuality = !params.has('q');
function setQuality(q, manual = false) {
  quality = q; if (manual) autoQuality = false;
  const Q = QUALITY[q];
  const pr = Math.min(window.devicePixelRatio || 1, Q.pr);
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  if (sun.shadow.mapSize.x !== Q.shadow) {
    sun.shadow.mapSize.set(Q.shadow, Q.shadow);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  gtao.enabled = Q.ao; smaa.enabled = Q.smaa;
  $('qual').textContent = Q.name;
}
setQuality(quality);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- day, night and weather
// A full day passes in about six minutes (9 skips ahead six hours). 0 cycles clear / rain / storm.
const atmo = { hour: 16.9, speed: 24 / 360, weather: 0, rain: 0, bakeHour: -99, stormT: 4, flash: 0, boltT: 0 };
const WEATHERS = ['Clear', 'Rain', 'Storm'];
// stars
const stars = (() => {
  const n = 2600, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const u = Math.random(), v = Math.random() * 0.95; const th = u * Math.PI * 2, ph = Math.acos(1 - v); pos.set([Math.sin(ph) * Math.cos(th) * 2200, Math.cos(ph) * 2200, Math.sin(ph) * Math.sin(th) * 2200], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = -2; scene.add(pts); return pts;
})();
// rain: streaks in a box that follows the camera
const rain = (() => {
  const n = 2600, pos = new Float32Array(n * 6);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0, depthWrite: false });
  const ls = new THREE.LineSegments(g, m); ls.frustumCulled = false; ls.visible = false; scene.add(ls);
  const drops = []; for (let i = 0; i < n; i++) drops.push(new THREE.Vector3((Math.random() - 0.5) * 50, Math.random() * 36, (Math.random() - 0.5) * 50));
  return { ls, pos, drops };
})();
// lightning bolt (storms)
const sky_bolt = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3)), new THREE.LineBasicMaterial({ color: new THREE.Color(4, 4.5, 6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
sky_bolt.frustumCulled = false; sky_bolt.visible = false; scene.add(sky_bolt);
const C = (h) => new THREE.Color(h);
const FOG = { day: C(0xb3b4b0), dusk: C(0xc9a088), night: C(0x0c1018), rain: C(0x7d858c) };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const tc = new THREE.Color(), tc2 = new THREE.Color();

function strikeLightning(at = null) {
  const a = Math.random() * Math.PI * 2, r = 15 + Math.random() * 60;
  const x = at ? at.x : player.pos.x + Math.cos(a) * r, z = at ? at.z : player.pos.z + Math.sin(a) * r;
  let y = 0; for (let yy = 64; yy > 0; yy -= 0.5) if (vox.solidAt(x, yy, z)) { y = yy + 0.5; break; }
  const top = new THREE.Vector3(x, y, z);
  // jagged bolt with a couple of forks
  const arr = sky_bolt.geometry.attributes.position.array; let k = 0;
  const seg = (from, to, n, j) => { let prev = from.clone(); for (let i = 1; i <= n && k < 396; i++) { const p = from.clone().lerp(to, i / n); if (i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * j, 0, (Math.random() - 0.5) * j)); arr.set([prev.x, prev.y, prev.z, p.x, p.y, p.z], k * 3); k += 2; prev = p; } return prev; };
  const from = new THREE.Vector3(x + (Math.random() - 0.5) * 30, 160, z + (Math.random() - 0.5) * 30);
  seg(from, top, 40, 7);
  for (let f = 0; f < 3; f++) { const st = from.clone().lerp(top, 0.2 + Math.random() * 0.5); seg(st, st.clone().add(new THREE.Vector3((Math.random() - 0.5) * 40, -20 - Math.random() * 20, (Math.random() - 0.5) * 40)), 10, 5); }
  sky_bolt.geometry.setDrawRange(0, k); sky_bolt.geometry.attributes.position.needsUpdate = true;
  sky_bolt.visible = true; atmo.boltT = 0.22; atmo.flash = 1;
  // the strike itself
  smash(top, at ? 2.4 : 1.4, { outward: 6, up: 4 });
  if (at) { blastAll(top, 8, 22, null, 0.8); for (const c of cars.cars) if (!c.burnt && c.p.distanceTo(top) < 5) fire.heatCar(c, 0.6); }
  fx.wave(top, 4, 0.3, new THREE.Color(3, 3.4, 5)); fx.addScorch(top, 2.5);
  for (let i = 0; i < 30; i++) fx.sparks.emit(top, rndVec(new THREE.Vector3(), 30).setY(Math.random() * 18), new THREE.Color(3, 3.5, 5), 0.4, 0.8, 0.03);
  birds.scare(top, 50);
  const dc = dummy.chest(new THREE.Vector3()); if (dc.distanceTo(top) < (at ? 8 : 5)) { dummy.hit(dc, 3, new THREE.Vector3(0, 18, 0), 1); dummy.burn += 0.5; dummy.say(['WHO ORDERED LIGHTNING?!', 'BZZT— rude.'], true); }
  const pc = chestPos(new THREE.Vector3()); if (!at && pc.distanceTo(top) < 5) { knockPlayer(pc.clone().sub(top), 20); hurtPlayer(20); }
  if (atmo.rain < 0.85) fire.ignite(top, { life: 5 });
  sfx.thunder?.(Math.min(2.5, top.distanceTo(camera.position) / 340), 1);
}

function updateAtmo(dt) {
  atmo.hour = (atmo.hour + dt * atmo.speed) % 24;
  const h = atmo.hour;
  const elev = Math.sin((h - 6) / 12 * Math.PI) * 62;           // degrees above the horizon
  const az = 32 + (h - 16.9) * 12;
  const dayK = smooth(-4, 12, elev), golden = smooth(30, 4, elev) * dayK;
  atmo.dayK = dayK;
  const wantRain = atmo.weather === 0 ? 0 : atmo.weather === 1 ? 0.8 : 1;
  atmo.rain += (wantRain - atmo.rain) * Math.min(1, dt * 0.6);
  rainK = atmo.rain; const R = atmo.rain;
  // sun (or the moon at night)
  const sunPos = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(az));
  sky.material.uniforms.sunPosition.value.copy(sunPos);
  const lightDir = elev > -3 ? sunPos : new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - Math.max(25, -elev)), THREE.MathUtils.degToRad(az + 180));
  sunDir.copy(lightDir);
  sun.intensity = (5 * dayK + 0.45 * (1 - dayK)) * (1 - 0.65 * R);
  sun.color.copy(tc.set(0xff9a5a).lerp(tc2.set(0xfff0dc), smooth(2, 30, elev))).lerp(tc2.set(0x8ea8d8), 1 - dayK);
  hemi.intensity = (0.22 + 0.78 * dayK) * (1 - 0.25 * R) + atmo.flash * 3;
  hemi.color.copy(tc.set(0x7090b5).lerp(tc2.set(0x26385a), 1 - dayK));
  scene.environmentIntensity = (0.1 + 0.8 * dayK) * (1 - 0.35 * R) + atmo.flash * 0.8;
  // haze
  scene.fog.color.copy(FOG.day).lerp(FOG.dusk, golden * 0.7).lerp(FOG.night, 1 - dayK).lerp(tc.copy(FOG.rain).multiplyScalar(0.25 + 0.75 * dayK), R * 0.8);
  scene.fog.density = (0.0021 + 0.0045 * R + 0.0008 * (1 - dayK)) * (camState.fogK ?? 1);
  world.towers.uNight.value = 1 - dayK; world.cloudMat.emissiveIntensity = 0.1 + 0.3 * dayK; world.cloudMat.color.setScalar(0.25 + 0.75 * dayK);
  renderer.toneMappingExposure = 1.15 + 0.35 * (1 - dayK) + atmo.flash * 0.7;
  stars.material.opacity = (1 - dayK) * (1 - R) * 0.9;
  stars.position.copy(camera.position);
  clouds.material.uniforms.uDay.value = 0.08 + 0.92 * dayK; clouds.material.uniforms.uCover.value = R; clouds.material.uniforms.uSun.value.copy(sunPos);
  // the city lights up after dark
  const nk = 1 - dayK;
  lampMats.bulb.emissiveIntensity = 2.4 + 3 * nk; lampMats.pool.emissiveIntensity = 0.1 + 0.65 * nk;
  for (const l of lampSpots) l.intensity = 60 + 260 * nk;
  matDefs[MAT.GLASS_LIT].material.emissiveIntensity = 0.9 + 2.2 * nk;
  for (const m of [MAT.SIGN_WARM, MAT.SIGN_CYAN, MAT.SIGN_PINK]) matDefs[m].material.emissiveIntensity = 1.5 + 2.5 * nk;
  // wet streets turn glossy
  for (const m of wetMats) { m.roughness = 1 - 0.6 * R; m.envMapIntensity = 1 + 1.2 * R; }
  // re-capture reflections every so often as the light changes
  const dh = Math.abs(((h - atmo.bakeHour + 36) % 24) - 12);
  if (12 - dh > 0.6) { atmo.bakeHour = h; bakeEnv(); }
  // rain
  rain.ls.visible = R > 0.02;
  if (rain.ls.visible) {
    rain.ls.material.opacity = 0.42 * R;
    const cp = camera.position, wind = 3 + 6 * (atmo.weather === 2 ? 1 : 0);
    for (let i = 0; i < rain.drops.length; i++) {
      const d = rain.drops[i];
      d.y -= 28 * dt; d.x += wind * dt;
      if (d.y < -cp.y + 0.05 || d.y < -2 || d.x > 25) { d.set((Math.random() - 0.5) * 50, 20 + Math.random() * 16, (Math.random() - 0.5) * 50); }
      const x = cp.x + d.x, y = cp.y + d.y - 10, z = cp.z + d.z;
      rain.pos.set([x, y, z, x - wind * 0.03, y + 0.9, z], i * 6);
    }
    rain.ls.geometry.attributes.position.needsUpdate = true;
  }
  sfx.rain?.(R);
  // storms
  atmo.flash = Math.max(0, atmo.flash - dt * 5);
  if (atmo.boltT > 0) { atmo.boltT -= dt; if (atmo.boltT <= 0) sky_bolt.visible = false; }
  if (atmo.weather === 2 && R > 0.7) { atmo.stormT -= dt; if (atmo.stormT <= 0) { atmo.stormT = 3 + Math.random() * 7; strikeLightning(); } }
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${WEATHERS[atmo.weather]}`;
}

// ---------------------------------------------------------------- camera
const camState = { dist: 5.5, fov: 72, shoulder: 0.85 };
function updateCamera(dt) {
  const f3 = fwd3(new THREE.Vector3()), rt = rightH(new THREE.Vector3());
  const sp = player.vel.length();
  const boosting = player.flying && sp > 45;
  const hs = robot.root.scale.x;
  const machK = Math.min(1, Math.max(0, sp / MACH - 0.5) / 3);
  const wantDist = (boosting ? 8 + machK * 6 : player.flying ? 6.5 : 5.2) * hs * hs;
  camState.dist += (wantDist - camState.dist) * Math.min(1, dt * 3);
  const target = new THREE.Vector3(player.pos.x, player.pos.y + 1.9 * hs, player.pos.z);
  const back = f3.clone().negate();
  const start = target.clone().addScaledVector(rt, camState.shoulder);
  let dist = camState.dist;
  const hit = vox.raycast(start, back, dist);
  if (hit) dist = Math.max(0.6, hit.t - 0.25);
  const pos = start.addScaledVector(back, dist).addScaledVector(UP, 0.3);
  if (player.pos.y < -0.4) {
    // in the tunnels: keep the camera inside the corridor you're in
    const c = under.corridorAt(player.pos.x, player.pos.z);
    if (c) { pos.x = Math.max(c.x0 + 0.4, Math.min(c.x1 - 0.4, pos.x)); pos.z = Math.max(c.z0 + 0.4, Math.min(c.z1 - 0.4, pos.z)); }
    const fl = under.floorAt(player.pos.x, player.pos.z) ?? -10;
    pos.y = Math.max(fl + 0.4, Math.min(-2.9, pos.y));
  } else pos.y = Math.max(0.35, pos.y);
  shake = Math.max(0, shake - dt * 1.6);
  const s = shake * shake;
  pos.x += (Math.random() - 0.5) * s * 0.9; pos.y += (Math.random() - 0.5) * s * 0.9; pos.z += (Math.random() - 0.5) * s * 0.9;
  camera.position.copy(pos);
  camera.rotation.set(player.camPitch, player.camYaw + Math.PI, (Math.random() - 0.5) * s * 0.06);
  const wantFov = 72 + Math.min(22, Math.max(0, sp - 20) * 0.2) + machK * 14;
  // supersonic buffeting
  if (sp > MACH * 0.9) { const b = machK * 0.05 + 0.01; camera.rotation.z += (Math.random() - 0.5) * b; camera.position.addScaledVector(rndVec(tmp3, 1), b * 0.6); }
  camState.fov += (wantFov - camState.fov) * Math.min(1, dt * 4);
  camera.fov = camState.fov; camera.updateProjectionMatrix();
  finish.uniforms.uAb.value = Math.min(0.02, Math.max(0, sp - 40) * 0.0003) + s * 0.01 + machK * 0.012;
  sky.position.copy(camera.position);
  const alt = Math.max(0, camera.position.y - groundH(camera.position.x, camera.position.z));
  camera.near = Math.min(4, 0.1 + alt * 0.004 + Math.max(0, sp - 150) * 0.004);
  // the haze thins as you climb or head out of town, so the hills, lake and far cities come into view
  { const out = Math.max(0, Math.hypot(camera.position.x, camera.position.z) - 300) / 600, alt = Math.max(0, camera.position.y - 25) / 180; camState.fogK = 1 - 0.86 * Math.min(1, Math.max(out, alt)); }
}

let lampT = 0;
function updateSunShadow() {
  const t = new THREE.Vector3(player.pos.x, Math.max(groundH(player.pos.x, player.pos.z), player.pos.y - 30), player.pos.z);
  const texel = 140 / sun.shadow.mapSize.x;
  t.x = Math.round(t.x / texel) * texel; t.z = Math.round(t.z / texel) * texel;
  sun.target.position.copy(t);
  sun.position.copy(t).addScaledVector(sunDir, 250);
  // rim light sits beyond the player, shining back toward the camera
  const f = camera.getWorldDirection(new THREE.Vector3());
  rim.target.position.set(player.pos.x, player.pos.y + 1.4, player.pos.z);
  rim.position.copy(rim.target.position).addScaledVector(f, 10).add(new THREE.Vector3(0, 5, 0));
  if ((lampT -= 1 / 60) <= 0) {
    lampT = 0.4;
    const near = lampLights.map((p) => [p.distanceToSquared(player.pos), p]).sort((a, b) => a[0] - b[0]);
    lampSpots.forEach((l, i) => { const p = near[i][1]; l.position.copy(p); l.target.position.set(p.x, 0, p.z); });
  }
}

// speed streaks while boosting
function speedLines(dt) {
  const sp = player.vel.length();
  if (sp < 55) return;
  const n = Math.min(45, Math.floor((sp - 50) * 0.08));
  const d = tmp.copy(player.vel).normalize();
  for (let i = 0; i < n; i++) {
    const p = tmp2.copy(camera.position).addScaledVector(d, 18 + Math.random() * 20).add(rndVec(tmp3, 14));
    fx.sparks.emit(p, tmp3.copy(d).multiplyScalar(-0.001), new THREE.Color(0.6, 0.65, 0.7), 0.25, 0, -0);
    // stretch along travel
    const idx = (fx.sparks.i - 1 + fx.sparks.cap) % fx.sparks.cap;
    fx.sparks.v[idx * 3] = -d.x * 40; fx.sparks.v[idx * 3 + 1] = -d.y * 40; fx.sparks.v[idx * 3 + 2] = -d.z * 40;
    fx.sparks.stretch[idx] = 0.05;
  }
}

// ---------------------------------------------------------------- dummy speech bubble
const bubble = $('bubble');
function updateBubble() {
  const sp = dummy.speech;
  const head = tmp.copy(dummy.p[0]); head.y += 0.45;
  const d = head.distanceTo(camera.position);
  if (!sp || d > 70) { bubble.hidden = true; return; }
  head.project(camera);
  if (head.z > 1 || Math.abs(head.x) > 1.1 || Math.abs(head.y) > 1.1) { bubble.hidden = true; return; }
  bubble.hidden = false;
  if (bubble.textContent !== sp.text) bubble.textContent = sp.text;
  bubble.style.transform = `translate(${(head.x * 0.5 + 0.5) * innerWidth}px, ${(-head.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%) scale(${Math.max(0.7, Math.min(1.1, 14 / d))})`;
  bubble.style.opacity = Math.min(1, sp.t * 2);
}

// palm thrusters: exhaust sparks and heat haze from each open hand, plus a warm light
function updateHandThrust(dt) {
  const jets = robot.handJets || [];
  for (let i = 0; i < 2; i++) {
    const j = jets[i], l = handLights[i];
    const k = j && j.g.visible ? j.k : 0;
    if (k < 0.05) { l.intensity = 0; continue; }
    const p = robot.handJetWorld(i, tmp), dir = robot.handJetDir(i, tmp2);
    l.position.copy(p).addScaledVector(dir, 0.25); l.intensity = k * (6 + Math.random() * 3);
    const n = Math.random() < k * dt * 90 ? 1 + (k > 0.8 ? 1 : 0) : 0;
    for (let e = 0; e < n; e++) {
      const v = tmp3.copy(dir).multiplyScalar(14 + Math.random() * 10).add(rndVec(new THREE.Vector3(), 3)).addScaledVector(player.vel, 0.6);
      fx.sparks.emit(p, v, new THREE.Color(5, 2.4, 0.8), 0.12 + Math.random() * 0.15, 0.2, 0.015);
    }
    if (Math.random() < k * dt * 12) { dustColor.setRGB(0.5, 0.47, 0.45); fx.dust.emit(tmp3.copy(p).addScaledVector(dir, 0.6), tmp2.copy(dir).multiplyScalar(4).addScaledVector(player.vel, 0.3), dustColor, 0.25, 0.5, 1.2, 0.12); }
  }
}

// ---------------------------------------------------------------- HUD
const hud = { speed: $('speed'), mode: $('mode'), fps: $('fps'), rubble: $('rubble'), charge: $('chargeRing'), grab: $('grabHint'), grabLabel: $('grabLabel') };
let fpsAcc = 0, fpsN = 0, fpsT = 0, autoT = 0, autoSamples = [];
function updateHud(rdt) {
  fpsAcc += rdt; fpsN++;
  if (fpsAcc > 0.5) {
    const fps = fpsN / fpsAcc;
    hud.fps.textContent = Math.round(fps);
    if (autoQuality && started) {
      autoSamples.push(fps);
      if (autoSamples.length >= 6) {
        const avg = autoSamples.reduce((a, b) => a + b, 0) / autoSamples.length;
        autoSamples = [];
        if (avg < 30 && quality > 0) setQuality(quality - 1);
        else autoQuality = avg < 50; // stop adjusting once it runs well
      }
    }
    fpsAcc = 0; fpsN = 0;
    hud.rubble.textContent = debris.count;
  }
  hud.speed.textContent = Math.round(player.vel.length() * 3.6);
  if ((hud.powT = (hud.powT || 0) - rdt) <= 0) {
    hud.powT = 0.1;
    for (const [b, f] of powCells) { const t = f(); if (b.textContent !== t) b.textContent = t; }
  }
  { const m = player.vel.length() / MACH; hud.mode.textContent = tf.on ? 'TIME STOPPED' : player.flying ? (m >= 0.95 ? `MACH ${m.toFixed(1)}` : player.vel.length() > 45 ? 'HIGH SPEED' : 'FLIGHT') : 'GROUND'; }
  const c = player.charging ? Math.min(1, player.charge / 1.1) : 0;
  hud.charge.style.setProperty('--c', c);
  hud.charge.classList.toggle('on', player.charging);
  dummy.chest(tmp);
  const nearDummy = dummy.mode !== 'held' && tmp.distanceTo(chestPos(tmp2)) < 3.6;
  const nearCar = !player.holding && !nearDummy && (hud.carT = (hud.carT || 0) - rdt) <= 0 ? (hud.carT = 0.2, hud.car = !!cars.nearest(player.pos, 4.8)) : hud.car;
  hud.grab.hidden = player.holding || !(nearDummy || nearCar);
  if (!hud.grab.hidden) hud.grabLabel.textContent = nearDummy ? 'GRAB DUMMY' : 'LIFT CAR';
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
const H = 1 / 120;
let acc = 0;
const stats = { js: 0, render: 0, frames: 0 };
function frame() {
  requestAnimationFrame(frame);
  const t0 = performance.now();
  tick(Math.min(clock.getDelta(), 1 / 20));
  const t1 = performance.now();
  composer.render();
  stats.js = t1 - t0; stats.render = performance.now() - t1; stats.frames++;
}
function tick(rdt) {
  if (updateRewind(rdt)) return;
  const ts = hitstop > 0 ? 0.06 : 1;
  hitstop -= rdt;
  const dt = rdt * ts;
  time += dt;
  // the dummy everything targets is the nearest live one (unless you're carrying one)
  if (!player.holding) {
    let best = null, bd = 1e9;
    for (const d of dummies) if (d.active) { const dd = d.chest(tmp).distanceTo(player.pos) + (d.ko ? 1000 : 0); if (dd < bd) { bd = dd; best = d; } }
    focusD = best || dummyA;
  }

  updatePlayer(dt);
  // pose robot at the new position before using its hands/eyes
  robot.root.position.copy(player.pos);
  robot.root.rotation.y = player.yaw;
  const v = player.vel;
  const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
  let yawRel = player.camYaw - player.yaw; yawRel = Math.atan2(Math.sin(yawRel), Math.cos(yawRel));
  player.throwT = Math.max(0, player.throwT - dt * 3);
  if (player.throwWind > 0) { player.throwWind += dt / THROW_WIND; if (player.throwWind >= 1) releaseThrow(); }
  { let d = player.yaw - player.lastYaw; d = Math.atan2(Math.sin(d), Math.cos(d)); player.lastYaw = player.yaw;
    player.turnRate += ((dt > 0 ? d / dt : 0) - player.turnRate) * Math.min(1, dt * 6); }
  if (dt > 0) { tmp.subVectors(player.vel, player.prevVel).divideScalar(dt); player.acc.lerp(tmp, Math.min(1, dt * 8)); player.prevVel.copy(player.vel); }
  robot.animate({
    dt, flying: player.flying, grounded: player.grounded, hSpeed: Math.hypot(v.x, v.z),
    fwdSpeed: v.x * sy + v.z * cy, sideSpeed: v.x * cy - v.z * sy, vSpeed: v.y,
    boost: keys.has('ShiftLeft') || keys.has('ShiftRight'), aimPitch: player.camPitch, aimYawRel: yawRel,
    charge: player.charging ? player.charge / 1.1 : 0, punchT: Math.max(0, player.punchT / 0.4), holding: player.holding, throwWind: player.throwWind, throwT: player.throwT, turnRate: player.turnRate, laser: player.laser, tk: !!(powers.tk || powers.zap), clapT: powers.clapT,
    accFwd: player.acc.x * sy + player.acc.z * cy, accSide: player.acc.x * cy - player.acc.z * sy,
  });
  robot.root.updateMatrixWorld(true);
  updateCamera(rdt);
  camera.updateMatrixWorld();
  updateAim();
  updatePunch(dt);
  updateLaser(dt);
  if (player.holdingGirder) {
    // swinging the girder: sweep it round in front, hitting along the arc
    let ph = -1;
    if (player.swingT > 0) { player.swingT -= dt; ph = 1 - player.swingT / 0.4; if (player.swingT <= 0) player.swingT = 0; }
    site.carry(robot.handWorld(1, tmp), player.camYaw, ph);
    if (ph >= 0 && player.swingHits < 3 && ph > 0.3 + player.swingHits * 0.22) { player.swingHits++; if (site.swingHit(1)) { shake = Math.min(1, shake + 0.25); hitstop = Math.max(hitstop, 0.04); sfx.boom(0.8); } }
  } else if (player.holdingCar) cars.carry(player.holdingCar, robot.handWorld(-1, tmp).add(tmp2.set(0, 1.0, 0)), player.yaw);
  else if (player.holding) dummy.holdTarget.copy(robot.handWorld(-1, tmp)).y -= 0.15;

  const wdt = dt * heroP.worldScale;
  heroP.update(dt, wdt, tf.on, robot);
  acc += wdt;
  let n = 0;
  updateFreeze(rdt);
  const frozen = tf.on;
  powers.update(wdt, frozen);
  // the dummy only moves while time runs (or while it's in the player's hand)
  while (acc >= H && n < 8) { if (!frozen || dummy.mode === 'held') dummy.step(H); acc -= H; n++; }
  if (n === 8) acc = 0;
  cascadeBudget = 25;
  if (!frozen) {
    debris.update(wdt, wdt > 1 / 70 ? 3 : 2); cars.update(wdt); props.update(wdt); birds.update(wdt, player.pos, player.vel.length());
    fire.update(wdt, rainK > 0.3);
    vox.updateIntegrity(dt, detach); updateCarHits(); bumpProps();
  } else { debris.flush(); cars.flush(); props.flush(); }
  traffic.update(time);
  world.towers.update(wdt, frozen ? null : fx);
  if (!frozen) {
    life.update(wdt, { playerPos: player.pos, playerVel: player.vel, night: 1 - (atmo.dayK ?? 1) });
    life.bump(tmp.copy(player.pos).add(UP), player.vel);
    boss.update(wdt);
    updateDrones(wdt);
    updateShocks(wdt);
    train.update(wdt);
    swarm.update(wdt);
    site.update(wdt);
    updateAmbush(wdt);
    updateGravitySlam(wdt);
    updateNukes(wdt);
  }
  updateShield(dt);
  under.update(player.pos, player.pos.y < -0.4);
  vox.flush();
  const thinkCtx = {
    playerPos: targetPos(), charging: !powers.decoy && player.charging, speed: powers.decoy ? 0 : player.vel.length(), playerAir: targetPos().y > 4,
    laserNear: player.laser && aim.point.distanceTo(dummy.chest(tmp)) < 5, laserOnMe: player.laser && aim.kind === 'dummy',
    playerVel: powers.decoy ? null : targetVel(), playerHp: game.php / game.pmax, whiff: !powers.decoy && player.punchT > 0 && player.punchT < 0.3 && !player.punchHit,
  };
  if (thinkCtx.laserOnMe || (player.laser && aim.kind === 'boss')) mind.observe('laser', dt);
  // AXIOM: gather its bodies, then let it think
  {
    const U = [];
    for (const d of dummies) if (d.active && !d.ko) U.push({ ref: d, pos: d.root, kind: 'dummy' });
    for (const b of liveBosses()) U.push({ ref: b, pos: b.pos, kind: 'boss' });
    swarm.bots.forEach((b, i) => { if (i % 4 === 0) U.push({ ref: b, pos: b.p, kind: 'swarm' }); });
    mind.containAt = (from) => { let best = null, bd = 1e9; for (const b of under.breaches) { const d = Math.hypot(b.x - from.x, b.z - from.z); if (d < bd) { bd = d; best = b; } } return best ? new THREE.Vector3(best.x + 3, 0, best.z + 3) : new THREE.Vector3(player.pos.x, 0, player.pos.z); };
    mind.update(rdt, U, { playerPos: player.pos, playerHp: game.php / game.pmax, underground: player.pos.y < -0.4, speed: player.vel.length() });
  }
  if (!frozen) dummy.think(wdt, thinkCtx);
  else for (const d of dummies) if (d.active && d.has('temporal')) {
    // Temporal Sense: it moves through stopped time at a quarter speed
    d.tAcc = (d.tAcc || 0) + wdt * 0.25; d.frozen = false;
    while (d.tAcc >= H) { d.step(H); d.tAcc -= H; }
    d.think(wdt * 0.25, thinkCtx); d.frozen = true;
  }
  dummy.update(wdt);
  if (!frozen) updateRocks(dt);
  updateBubble();
  updateHandThrust(dt);
  speedLines(dt);
  fx.update(dt, camera, frozen);
  fx.dust.uniforms.uScale.value = renderer.domElement.height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  {
    const cp = camera.position; let fk = 0;
    for (const f of fire.fires) { const d = f.p.distanceTo(cp); if (d < 40) fk += f.size * Math.min(1, f.life) * (1 - d / 40) * 0.5; }
    const dd = dummy.chest(new THREE.Vector3()).distanceTo(player.pos);
    const ck = dummy.fights && !dummy.ko ? (dd < 25 ? 0.65 : dd < 70 ? 0.3 : 0.12) : 0;
    sfx.set(player.vel.length(), player.laser, { day: atmo.dayK ?? 1, fire: Math.min(1, fk), combat: ck });
  }
  updateSunShadow();
  finish.uniforms.uTime.value = time % 100;
  clouds.position.copy(camera.position); clouds.material.uniforms.uTime.value = time;
  updateGame(rdt);
  updateAtmo(rdt);
  updateHud(rdt);
}
// advance the game without rendering (used by automated tests)
function simulate(sec, step = 1 / 60) { for (let t = 0; t < sec; t += step) tick(step); }
frame();
$('loading').hidden = true;

// test hook for automated screenshots
window.__game = { get mind() { return mind; }, blastAll, swarm, site, under, gravitySlam, gslam, ambush, get lastPower() { return lastPower; }, helpers, RW, train, spawnEnemy, enemies, dummies, bossPool, nuke, sonicBoom, get shocks() { return shocks; }, up, ult, shield, get drones() { return drones; }, picker, pickUpgrade, nova, hurtPlayer, life, boss, heroP, get kit() { return robot.kit; }, atmo, fire, game, props, birds, powers, cars, tf, freezeOn, freezeOff, simulate, stats, onPrimaryDown, onPrimaryUp, camState, scene, sun, hemi, get robot() { return robot; }, setCharacter, setOutline, player, dummy, debris, vox, smash, punchImpact, respawnDummy, throwDummy, tryGrab, setQuality, keys, mouse, fx, camera, aim, renderer };
