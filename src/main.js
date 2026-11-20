import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VoxelWorld, VS } from './voxels.js';
import { DebrisSystem } from './debris.js';
import { Dummy } from './dummy.js';
import { Robot } from './robot.js';
import { Spectre } from './spectre.js';
import { addOutline } from './outline.js';
import { Effects } from './effects.js';
import { makeVoxelMaterials, buildVoxelTown, buildScenery, MAT, CAR_SPOTS, PROP_SPOTS, BIRD_HOMES } from './town.js';
import { CarSystem } from './cars.js';
import { Powers } from './powers.js';
import { PropSystem } from './props.js';
import { Birds } from './birds.js';
import { Sfx } from './audio.js';

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
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 3000);
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
const sky = makeSky(); sky.scale.setScalar(5000); scene.add(sky);
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const s2 = makeSky(); s2.scale.setScalar(100); envScene.add(s2);
  // a darker ground half so reflections aren't lit from below by the sky
  const gnd = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3d4234, side: THREE.BackSide }));
  envScene.add(gnd);
  scene.environment = pmrem.fromScene(envScene, 0.02, 0.1, 1000).texture;
  scene.environmentIntensity = 0.9;
}
// Drifting cloud layer: procedural fbm on a dome, lit warm on the sun side, fading at the horizon.
const clouds = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uSun: { value: sunDir.clone() } },
  transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uTime; uniform vec3 uSun; varying vec3 vDir;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * n(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
    void main(){
      if (vDir.y < 0.0) discard;
      vec2 p = vDir.xz / (vDir.y + 0.12) * 1.4 + vec2(uTime * 0.012, uTime * 0.004);
      float d = fbm(p), d2 = fbm(p + uSun.xz * 0.08);
      float cov = smoothstep(0.48, 0.78, d);
      float shade = clamp(0.55 + (d - d2) * 3.0, 0.0, 1.0);            // brighter edges facing the sun
      float sunSide = pow(max(dot(normalize(vDir), uSun), 0.0), 3.0);
      vec3 lit = mix(vec3(0.62, 0.64, 0.7), vec3(1.0, 0.86, 0.68), shade) * (0.75 + sunSide * 0.5);
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
const { lampLights, traffic } = buildScenery(scene, renderer);
const debris = new DebrisSystem(scene, vox, matDefs, 4500);
const fx = new Effects(scene);
const sfx = new Sfx();
const chars = [new Robot(), new Spectre()];
let charIdx = 0;
try { charIdx = Math.min(chars.length - 1, Math.max(0, parseInt(localStorage.getItem('rubble-char') || '0', 10) || 0)); } catch (e) { /* storage unavailable */ }
if (params.has('char')) charIdx = Math.min(chars.length - 1, parseInt(params.get('char'), 10) || 0);
let robot = chars[charIdx];
scene.add(robot.root);
function setCharacter(i) {
  scene.remove(robot.root);
  charIdx = (i + chars.length) % chars.length;
  robot = chars[charIdx];
  scene.add(robot.root);
  fx.setLaserColors(robot.laserCore, robot.laserGlow);
  try { localStorage.setItem('rubble-char', String(charIdx)); } catch (e) { /* ignore */ }
  const el = document.getElementById('charName'); if (el) el.textContent = robot.name;
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
  if (!removed.length) return 0;
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

const dummy = new Dummy(scene, vox, { smash });
const cars = new CarSystem(scene, CAR_SPOTS, { smash, voxels: vox });
const props = new PropSystem(scene, PROP_SPOTS, { voxels: vox, fx, sfx });
const birds = new Birds(scene, BIRD_HOMES);
// shockwaves push rubble, cars and street furniture alike, and send the pigeons flying
function blastAll(center, radius, strength, dir = null, up) {
  debris.blast(center, radius, strength, dir, up); cars.blast(center, radius, strength, dir, up); props.blast(center, radius, strength, dir, up);
  birds.scare(center, radius * 3 + 10);
}


// ---------------------------------------------------------------- time freeze
// X stops time for everything except the player. Hits on the frozen world are stored (the dummy keeps the
// momentum, rubble hangs where it broke off, collapses wait) and all of it lets go the moment time resumes.
const tf = { on: false, energy: 1, k: 0, ripple: -1, tickT: 0, hits: 0, tickHigh: false };
function freezeOn() {
  if (tf.on) return;
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
  finish.uniforms.uFreeze.value = tf.k;
  finish.uniforms.uRipple.value = tf.ripple;

  $('freezeBox').classList.toggle('active', tf.on);
}

// ---------------------------------------------------------------- extra powers
const powers = new Powers({
  scene, camera, fx, sfx, debris, cars, props, birds, dummy, vox, smash, blastAll, get aim() { return aim; },
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
function setFights(v) {
  dummy.fights = v; if (!v) dummy.atk = null;
  try { localStorage.setItem('rubble-fight', v ? '1' : '0'); } catch (e) { /* ignore */ }
  $('fightHud').textContent = v ? 'Fights back' : 'Peaceful';
}
try { dummy.fights = localStorage.getItem('rubble-fight') !== '0'; } catch (e) { /* ignore */ }
setFights(dummy.fights);
// knock the player back with a jolt
// knock the player around (any source); dummy hits also count on the scoreboard
function knockPlayer(dir, power, kind = 'blast') {
  const d = dir.clone().setY(0).normalize();
  // real knockback: big launch plus a short loss of control so it carries (hard hits smash you through walls)
  const up = { tackle: 0.35, slam: 0.75, uppercut: 1.0, rock: 0.35, punch: 0.3 }[kind] ?? 0.3;
  player.vel.set(player.vel.x * 0.3, Math.max(0, player.vel.y * 0.3), player.vel.z * 0.3);
  player.vel.addScaledVector(d, power); player.vel.y += power * up;
  player.stun = power >= 8 ? 0.25 + power / 90 : 0;
  player.grounded = false; player.charging = false; player.punchT = 0;
  if (power >= 30) hitstop = Math.max(hitstop, 0.05 + power / 900);
  robot.hitReact(power);
  const c = chestPos(new THREE.Vector3());
  for (let i = 0; i < 24; i++) fx.sparks.emit(c, rndVec(new THREE.Vector3(), 14).addScaledVector(d, 6), new THREE.Color(5, 4, 2.5), 0.2 + Math.random() * 0.25, 0.6, 0.02);
  fx.wave(c, 1.6, 0.22);
  shake = Math.min(1, shake + 0.25 + power / 60);
  sfx.boom(0.4 + power / 45);
}
dummy.ctx.hitPlayer = (dir, power, kind) => {
  if (powers.decoy) { powers.decoyHit(power); return; } // it was fighting the hologram
  knockPlayer(dir, power, kind);
  tagged++; $('tagHud').textContent = tagged;
};
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
const outlines = [...chars.map((c) => addOutline(c.root)), addOutline(dummy.group, { thickness: 0.003 })];
let outlineOn = true;
try { outlineOn = localStorage.getItem('rubble-ink') !== '0'; } catch (e) { /* ignore */ }
function setOutline(v) { outlineOn = v; outlines.forEach((o) => o.setVisible(v)); try { localStorage.setItem('rubble-ink', v ? '1' : '0'); } catch (e) { /* ignore */ } }
setOutline(outlineOn);
dummy.spawn(new THREE.Vector3(0, 0, 3), 0);

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
  if (d.y < 0) { const tg = -o.y / d.y; if (tg < best) { best = tg; kind = 'ground'; aim.normal.set(0, 1, 0); } }
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
  switch (e.code) {
    case 'KeyF': toggleFlight(); break;
    case 'KeyE': if (player.holding) throwDummy(); else tryGrab(); break;
    case 'KeyR': respawnDummy(); break;
    case 'KeyT': rebuildTown(); break;
    case 'KeyQ': setQuality((quality + 1) % QUALITY.length, true); break;
    case 'KeyV': setCharacter(charIdx + 1); break;
    case 'KeyO': setOutline(!outlineOn); break;
    case 'KeyG': setFights(!dummy.fights); break;
    case 'KeyX': if (tf.on) freezeOff(); else freezeOn(); break;
    case 'KeyZ': powers.castHole(); break;
    case 'KeyN': powers.clap(); break;
    case 'KeyM': powers.callMeteor(); break;
    case 'KeyL': powers.startZap(); break;
    case 'KeyY': powers.blink(); break;
    case 'KeyP': powers.gravityFlip(); break;
    case 'KeyU': powers.spawnDecoy(); break;
    case 'Digit1': powers.barrage(); break;
    case 'Digit2': powers.quake(); break;
    case 'Digit3': powers.tornado(); break;
    case 'KeyB': if (!player.holding) powers.grab(); break;
    case 'KeyH': $('help').hidden = !$('help').hidden; break;
    case 'KeyJ': mouse.l = true; onPrimaryDown(); break;
    case 'KeyK': mouse.r = true; break;
    case 'Space': if (!player.flying && !player.grounded) startFlight(); else if (!player.flying && player.grounded) { player.vel.y = 13; player.grounded = false; } break;
  }
});
addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'KeyJ') { if (mouse.l) onPrimaryUp(); mouse.l = false; }
  if (e.code === 'KeyK') mouse.r = false;
  if (e.code === 'KeyB') powers.release();
  if (e.code === 'KeyL') powers.stopZap();
});
addEventListener('blur', () => { keys.clear(); mouse.l = mouse.r = false; });

function startFlight() { player.flying = true; player.grounded = false; sfx.whoosh(); }
function toggleFlight() { if (player.flying) player.flying = false; else startFlight(); }

function respawnDummy() {
  const f = fwdH(tmp);
  const p = player.pos.clone().addScaledVector(f, 5); p.y = 0;
  player.holding = false; player.throwWind = 0; if (player.holdingCar) { cars.release(player.holdingCar, new THREE.Vector3(), null); player.holdingCar = null; }
  dummy.spawn(p, player.camYaw + Math.PI);
}
function rebuildTown() {
  debris.clear(); buildVoxelTown(vox); fx.clearScorch();
  player.holding = false; player.throwWind = 0; if (player.holdingCar) { cars.release(player.holdingCar, new THREE.Vector3(), null); player.holdingCar = null; }
}

function tryGrab() {
  const c = chestPos(tmp); dummy.chest(tmp2);
  if (tmp2.distanceTo(c) < 3.6) { player.holding = true; dummy.grab(robot.handWorld(-1, tmp3)); return; }
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
  if (player.holdingCar) { cars.release(player.holdingCar, tmp2.copy(d).multiplyScalar(75).add(player.vel), 'player'); player.holdingCar = null; }
  else dummy.release(tmp2.copy(d).multiplyScalar(105).add(player.vel));
  shake = Math.min(1, shake + 0.2);
  sfx.whoosh();
}

function onPrimaryDown() {
  if (player.holding) { throwDummy(); mouse.l = false; return; }
  if (player.punchT > 0.1) return;
  player.charging = true; player.charge = 0;
}
function onPrimaryUp() {
  if (!player.charging) return;
  player.charging = false;
  const power = 0.3 + Math.min(1, player.charge / 1.1) * 1.0;
  player.punchPow = power; player.punchT = 0.4; player.punchHit = false;
  aimDirFrom(chestPos(tmp), player.punchDir);
  if (dummy.chest(tmp2).distanceTo(player.pos) < 9) dummy.tryDodge(player.punchDir);
  player.vel.addScaledVector(player.punchDir, 22 + 30 * power);
  if (!player.flying && player.punchDir.y > 0.3) player.grounded = false;
  player.charge = 0;
  sfx.whoosh();
}

function punchImpact(point, dir, power) {
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
  sfx.boom(power);
  player.vel.multiplyScalar(0.12);
  player.punchHit = true;
}

function updatePunch(dt) {
  if (player.charging) player.charge += dt;
  if (player.punchT <= 0) return;
  player.punchT -= dt;
  if (player.punchHit || player.punchT < 0.04) return;
  const c = chestPos(tmp3);
  const dir = player.punchDir;
  // contact tests along the punch line
  const reach = 2.6;
  const vh = vox.raycast(c, dir, reach);
  if (vh) { punchImpact(c.clone().addScaledVector(dir, vh.t), dir, player.punchPow); return; }
  dummy.chest(tmp);
  const fist = c.clone().addScaledVector(dir, 1.4);
  if (tmp.distanceTo(fist) < 1.6 && dummy.mode !== 'held') { punchImpact(tmp.clone(), dir, player.punchPow); return; }
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
      smash(tmp.copy(p).addScaledVector(beamDir, 0.25), 0.6, { vel: tmp2.copy(hitN).multiplyScalar(7), inherit: 1, outward: 2.5, up: 2.5, noDust: Math.random() < 0.6 });
    } else if (hitKind === 'ground') {
      fx.addScorch(tmp.copy(p).add(rndVec(tmp2, 0.25)), 0.9 + Math.random() * 0.6);
    } else if (hitKind === 'car' && aim.car) {
      cars.hit(aim.car, p, tmp2.copy(beamDir).multiplyScalar(1.2));
    } else if (hitKind === 'dummy') {
      dummy.hit(p, 0.7, tmp2.copy(beamDir).multiplyScalar(2.2).addScaledVector(UP, 0.6), 0.2);
      dummy.burn += 0.03; dummy.anger += 0.04;
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
    const speed = (boost ? 125 : 26) * charging;
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    const rate = boost ? 1.8 : 4;
    if (player.stun > 0) v.multiplyScalar(Math.exp(-0.7 * dt)); // knocked back: no control until it wears off
    else v.lerp(wish, 1 - Math.exp(-rate * dt));
  } else {
    const wish = new THREE.Vector3().addScaledVector(fh, iz).addScaledVector(rt, ix);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar((boost ? 17 : 8) * charging);
    const k = player.stun > 0 ? (player.grounded ? 1 - Math.exp(-2 * dt) : 0) : 1 - Math.exp(-(player.grounded && player.punchT <= 0 ? 12 : 2.5) * dt);
    v.x += (wish.x - v.x) * k; v.z += (wish.z - v.z) * k;
    v.y -= 32 * dt;
  }
  const speed = v.length();
  const steps = Math.max(1, Math.ceil(speed * dt / 0.3));
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
      if (vox.solidAt(head.x, head.y, head.z) || vox.solidAt(head.x, head.y + 0.7, head.z) || vox.solidAt(head.x, head.y - 0.7, head.z)) {
        const n = smash(head, sprinting && sp <= 32 ? 1.7 : 1.9, { vel: v, inherit: 0.75, outward: 7, up: 2 });
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
    if (player.pos.y < 0) {
      player.pos.y = 0;
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
    if (tmp.distanceTo(tmp2) < 1.5) dummy.hit(tmp, 1.8, tmp3.copy(v).multiplyScalar(1.15).addScaledVector(UP, 4));
  }
  player.pos.y = Math.min(player.pos.y, 160);
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

function superLanding(vy) {
  const p = player.pos.clone();
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

// ---------------------------------------------------------------- camera
const camState = { dist: 5.5, fov: 72, shoulder: 0.85 };
function updateCamera(dt) {
  const f3 = fwd3(new THREE.Vector3()), rt = rightH(new THREE.Vector3());
  const sp = player.vel.length();
  const boosting = player.flying && sp > 45;
  const wantDist = boosting ? 8 : player.flying ? 6.5 : 5.2;
  camState.dist += (wantDist - camState.dist) * Math.min(1, dt * 3);
  const target = new THREE.Vector3(player.pos.x, player.pos.y + 1.9, player.pos.z);
  const back = f3.clone().negate();
  const start = target.clone().addScaledVector(rt, camState.shoulder);
  let dist = camState.dist;
  const hit = vox.raycast(start, back, dist);
  if (hit) dist = Math.max(0.6, hit.t - 0.25);
  const pos = start.addScaledVector(back, dist).addScaledVector(UP, 0.3);
  pos.y = Math.max(0.35, pos.y);
  shake = Math.max(0, shake - dt * 1.6);
  const s = shake * shake;
  pos.x += (Math.random() - 0.5) * s * 0.9; pos.y += (Math.random() - 0.5) * s * 0.9; pos.z += (Math.random() - 0.5) * s * 0.9;
  camera.position.copy(pos);
  camera.rotation.set(player.camPitch, player.camYaw + Math.PI, (Math.random() - 0.5) * s * 0.06);
  const wantFov = 72 + Math.min(22, Math.max(0, sp - 20) * 0.2);
  camState.fov += (wantFov - camState.fov) * Math.min(1, dt * 4);
  camera.fov = camState.fov; camera.updateProjectionMatrix();
  finish.uniforms.uAb.value = Math.min(0.02, Math.max(0, sp - 40) * 0.0003) + s * 0.01;
}

let lampT = 0;
function updateSunShadow() {
  const t = new THREE.Vector3(player.pos.x, 0, player.pos.z);
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
  const n = Math.floor((sp - 50) * 0.08);
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
    const st = (k) => (powers.cool[k] > 0 ? Math.ceil(powers.cool[k]) + 's' : 'ready');
    $('powHole').textContent = powers.hole ? 'active' : st('hole');
    $('powClap').textContent = st('clap');
    $('powLift').textContent = powers.tk ? 'holding' : 'hold';
    $('powMeteor').textContent = powers.meteor ? 'incoming' : st('meteor');
    $('powZap').textContent = powers.zap ? 'zapping' : 'hold';
    $('powBlink').textContent = st('blink');
    $('powGrav').textContent = powers.grav ? 'active' : st('grav');
    $('powDecoy').textContent = powers.decoy ? 'up' : st('decoy');
    $('powMiss').textContent = powers.missiles.length ? powers.missiles.length + ' in air' : 'ready';
    $('powQuake').textContent = powers.quakes.length ? 'shaking' : 'ready';
    $('powTwist').textContent = powers.twisters.length ? powers.twisters.length + ' active' : 'ready';
  }
  hud.mode.textContent = tf.on ? 'TIME STOPPED' : player.flying ? (player.vel.length() > 45 ? 'SUPERSONIC' : 'FLIGHT') : 'GROUND';
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
  const ts = hitstop > 0 ? 0.06 : 1;
  hitstop -= rdt;
  const dt = rdt * ts;
  time += dt;

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
  if (player.holdingCar) cars.carry(player.holdingCar, robot.handWorld(-1, tmp).add(tmp2.set(0, 1.0, 0)), player.yaw);
  else if (player.holding) dummy.holdTarget.copy(robot.handWorld(-1, tmp)).y -= 0.15;

  acc += dt;
  let n = 0;
  updateFreeze(rdt);
  const frozen = tf.on;
  powers.update(dt, frozen);
  // the dummy only moves while time runs (or while it's in the player's hand)
  while (acc >= H && n < 8) { if (!frozen || dummy.mode === 'held') dummy.step(H); acc -= H; n++; }
  if (n === 8) acc = 0;
  cascadeBudget = 25;
  if (!frozen) {
    debris.update(dt, dt > 1 / 70 ? 3 : 2); cars.update(dt); props.update(dt); birds.update(dt, player.pos, player.vel.length());
    vox.updateIntegrity(dt, detach); updateCarHits(); bumpProps();
  } else { debris.flush(); cars.flush(); props.flush(); }
  traffic.update(time);
  vox.flush();
  if (!frozen) dummy.think(dt, {
    playerPos: targetPos(), charging: !powers.decoy && player.charging, speed: powers.decoy ? 0 : player.vel.length(), playerAir: targetPos().y > 4,
    laserNear: player.laser && aim.point.distanceTo(dummy.chest(tmp)) < 5, laserOnMe: player.laser && aim.kind === 'dummy',
  });
  dummy.update(dt);
  if (!frozen) updateRocks(dt);
  updateBubble();
  updateHandThrust(dt);
  speedLines(dt);
  fx.update(dt, camera, frozen);
  fx.dust.uniforms.uScale.value = renderer.domElement.height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  sfx.set(player.vel.length(), player.laser);
  updateSunShadow();
  finish.uniforms.uTime.value = time % 100;
  clouds.position.copy(camera.position); clouds.material.uniforms.uTime.value = time;
  updateHud(rdt);
}
// advance the game without rendering (used by automated tests)
function simulate(sec, step = 1 / 60) { for (let t = 0; t < sec; t += step) tick(step); }
frame();
$('loading').hidden = true;

// test hook for automated screenshots
window.__game = { props, birds, powers, cars, tf, freezeOn, freezeOff, simulate, stats, onPrimaryDown, onPrimaryUp, camState, scene, sun, hemi, get robot() { return robot; }, setCharacter, setOutline, player, dummy, debris, vox, smash, punchImpact, respawnDummy, throwDummy, tryGrab, setQuality, keys, mouse, fx, camera, aim, renderer };
