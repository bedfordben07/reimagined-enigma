// The wide world around the destructible town: 24 km of landscape for supersonic flight. Rolling hills
// rise into a snow-capped mountain range to the north, a coastline and open sea lie to the east, forests
// cover the slopes, and five distant cities (one a skyscraper downtown) stand on flattened ground. The
// far cities are lightweight instanced towers: fly between them, or hit one fast enough and it comes down.
import * as THREE from 'three';

export const WORLD_HALF = 12000;
export const SEA_LEVEL = -3;
const FLAT_R = 640, BLEND_R = 1500;

// ---------------------------------------------------------------- height field
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, oct = 5) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return s; }
function ridged(x, z, oct = 5) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(vnoise(x * f, z * f) * 2 - 1); s += a * n * n; f *= 2.1; a *= 0.5; } return s; }
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// cities: centre, radius, height scale, style
export const CITIES = [
  { x: -3200, z: 1800, r: 520, h: 1.0, name: 'Westbrook' },
  { x: 2600, z: -2700, r: 700, h: 2.4, name: 'Downtown' },     // the skyscraper city
  { x: -5600, z: -3600, r: 420, h: 0.8, name: 'Hollow Pines' },
  { x: 1400, z: 4600, r: 560, h: 1.3, name: 'Southport' },
  { x: 5400, z: 2200, r: 460, h: 1.0, name: 'Bay City' },         // on the coast
];
// a city sits on ground levelled to this height
const CITY_BASE = CITIES.map((c) => Math.max(SEA_LEVEL + 3, rawH(c.x, c.z) * 0.35));

function rawH(x, z) {
  const r = Math.hypot(x, z);
  const k = sstep(FLAT_R, BLEND_R, r);
  if (k <= 0) return 0;
  // rolling hills everywhere, more relief further out
  let h = (fbm(x / 1400, z / 1400) - 0.3) * (60 + Math.min(260, (r - FLAT_R) * 0.05));
  // the northern range: ridged peaks up to ~1.8 km
  const north = sstep(-2500, -7500, z);
  h += north * (ridged(x / 2600 + 3.1, z / 2600) * 2100 - 200);
  // a few lone peaks
  h += sstep(0.62, 0.9, vnoise(x / 3000 + 7, z / 3000 - 2)) * 700;
  // the eastern coast falls into the sea
  const coast = 4200 + (fbm(z / 1800, 5.3) - 0.5) * 1400;
  const sea = sstep(coast - 600, coast + 900, x);
  h = h * (1 - sea) + (-70 - fbm(x / 900, z / 900) * 40) * sea;
  return h * k;
}

export function terrainH(x, z) {
  let h = rawH(x, z);
  for (let i = 0; i < CITIES.length; i++) {
    const c = CITIES[i], d = Math.hypot(x - c.x, z - c.z);
    const k = sstep(c.r + 400, c.r * 0.9, d);
    if (k > 0) h = h * (1 - k) + CITY_BASE[i] * k;
  }
  return h;
}
// where something can stand: the land, or the sea surface
export function groundH(x, z) { return Math.max(terrainH(x, z), SEA_LEVEL); }

// ---------------------------------------------------------------- world build
export function buildWorld(scene) {
  const group = new THREE.Group(); scene.add(group);

  // terrain: a big grid, finer near the middle (vertices pulled toward the centre)
  const N = 300;
  const geo = new THREE.PlaneGeometry(2 * WORLD_HALF, 2 * WORLD_HALF, N, N); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const warp = (t) => Math.sign(t) * Math.pow(Math.abs(t), 1.6); // denser grid near the town
  for (let i = 0; i < pos.count; i++) {
    const x = warp(pos.getX(i) / WORLD_HALF) * WORLD_HALF, z = warp(pos.getZ(i) / WORLD_HALF) * WORLD_HALF;
    const h = terrainH(x, z);
    const r = Math.hypot(x, z);
    pos.setXYZ(i, x, r < FLAT_R + 40 ? -0.35 : h - 0.35, z);
    // colour by height and slope (slope from neighbouring samples)
    const sl = Math.hypot(terrainH(x + 30, z) - h, terrainH(x, z + 30) - h) / 30;
    const n = fbm(x / 300, z / 300, 3);
    if (h < SEA_LEVEL + 2.5 && r > FLAT_R) c.setRGB(0.76, 0.7, 0.52);               // beach / seabed
    else if (h > 1150 + n * 250) c.setRGB(0.93, 0.95, 0.98);                       // snow
    else if (sl > 0.55 || h > 800) c.setRGB(0.42 + n * 0.1, 0.4 + n * 0.08, 0.37);   // rock
    else c.setRGB(0.2 + n * 0.08, 0.3 + n * 0.1, 0.13 + n * 0.04);                 // grass
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  terrain.receiveShadow = true;
  group.add(terrain);

  // sea
  const seaMat = new THREE.MeshPhysicalMaterial({ color: 0x1d4a66, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 1.2 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2 * WORLD_HALF + 20000, 2 * WORLD_HALF + 20000), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.set(WORLD_HALF, SEA_LEVEL, 0); group.add(sea);
  // keep the sea off the land: only the part beyond the coast shows (terrain covers it elsewhere)

  // forests: instanced trees on gentle grassy slopes
  const treeGeo = mergeTree();
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const trees = [];
  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 60000 && trees.length < 9000; i++) {
    const x = (rnd() * 2 - 1) * WORLD_HALF * 0.95, z = (rnd() * 2 - 1) * WORLD_HALF * 0.95;
    if (Math.hypot(x, z) < FLAT_R + 200) continue;
    if (fbm(x / 900 + 11, z / 900, 3) < 0.5) continue; // forests come in patches
    if (CITIES.some((ct) => Math.hypot(x - ct.x, z - ct.z) < ct.r + 120)) continue;
    const h = terrainH(x, z);
    if (h < SEA_LEVEL + 3 || h > 900) continue;
    const sl = Math.hypot(terrainH(x + 10, z) - h, terrainH(x, z + 10) - h) / 10;
    if (sl > 0.5) continue;
    trees.push([x, h, z, 0.7 + rnd() * 0.9, rnd() * 6.28]);
  }
  const tm = new THREE.InstancedMesh(treeGeo, treeMat, trees.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  trees.forEach(([x, h, z, sc, yaw], i) => { m.compose(p.set(x, h - 0.5, z), q.setFromAxisAngle(UP, yaw), s.set(sc * 9, sc * 9, sc * 9)); tm.setMatrixAt(i, m); });
  tm.castShadow = false; tm.receiveShadow = true; group.add(tm);

  // cities
  const towers = buildCities(group);

  // a layer of cumulus at 900–1700 m: flying through them sells the speed
  const cloudGeo = mergeCloud();
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, emissive: 0x6a7280, emissiveIntensity: 0.35, flatShading: false });
  const NC = 420;
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, NC);
  for (let i = 0; i < NC; i++) {
    const sc = 60 + rnd() * 140;
    m.compose(p.set((rnd() * 2 - 1) * WORLD_HALF, 900 + rnd() * 800, (rnd() * 2 - 1) * WORLD_HALF), q.setFromAxisAngle(UP, rnd() * 6.28), s.set(sc * (1 + rnd()), sc * 0.45, sc));
    clouds.setMatrixAt(i, m);
  }
  group.add(clouds);

  return { group, terrain, sea, seaMat, towers, cloudMat, clouds };
}
const UP = new THREE.Vector3(0, 1, 0);

function mergeGeos(list) {
  const pos = [], nor = [], col = [];
  for (const [g, color] of list) {
    const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals();
    pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array);
    for (let i = 0; i < n.attributes.position.count; i++) col.push(color.r, color.g, color.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
function mergeTree() {
  const trunk = new THREE.CylinderGeometry(0.06, 0.09, 0.5, 5); trunk.translate(0, 0.25, 0);
  const c1 = new THREE.ConeGeometry(0.42, 0.8, 7); c1.translate(0, 0.75, 0);
  const c2 = new THREE.ConeGeometry(0.32, 0.65, 7); c2.translate(0, 1.1, 0);
  return mergeGeos([[trunk, new THREE.Color(0.3, 0.2, 0.12)], [c1, new THREE.Color(0.13, 0.3, 0.14)], [c2, new THREE.Color(0.16, 0.34, 0.16)]]);
}
function mergeCloud() {
  const parts = [];
  for (const [x, y, z, r] of [[0, 0, 0, 1], [0.9, -0.1, 0.2, 0.75], [-0.9, -0.15, -0.1, 0.7], [0.3, 0.35, -0.3, 0.7], [-0.4, 0.25, 0.4, 0.6], [1.5, -0.25, -0.3, 0.5], [-1.5, -0.3, 0.2, 0.5]]) {
    const g = new THREE.IcosahedronGeometry(r, 1); g.translate(x, y, z); parts.push([g, new THREE.Color(1, 1, 1)]);
  }
  const g = mergeGeos(parts); g.deleteAttribute('color'); return g;
}

// ---------------------------------------------------------------- far cities
// Towers are boxes drawn with a facade shader: window grids in world space, lit at night.
function buildCities(group) {
  let seed = 77; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const list = [];
  CITIES.forEach((ct, ci) => {
    const base = CITY_BASE[ci];
    const blk = 42, cells = Math.floor(ct.r / blk);
    for (let gx = -cells; gx <= cells; gx++) for (let gz = -cells; gz <= cells; gz++) {
      const cx = ct.x + gx * blk, cz = ct.z + gz * blk;
      const d = Math.hypot(cx - ct.x, cz - ct.z) / ct.r;
      if (d > 1) continue;
      if ((gx % 4 === 0) || (gz % 4 === 0)) continue; // avenues to fly down
      if (rnd() < 0.12) continue;
      const tall = Math.pow(1 - d, 2.2) * ct.h;
      const h = 12 + rnd() * 30 + tall * (60 + rnd() * 220);
      const w = 18 + rnd() * 16, dpt = 18 + rnd() * 16;
      list.push({ x: cx + (rnd() - 0.5) * 6, z: cz + (rnd() - 0.5) * 6, y: base, w, d: dpt, h, tint: rnd(), alive: true, fall: 0 });
    }
  });
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.35 });
  const uNight = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec4 wp4 = modelMatrix * instanceMatrix * vec4(transformed, 1.0); vWP = wp4.xyz; vWN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform float uNight;\nfloat h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float side = step(abs(vWN.y), 0.5);
        float u = abs(vWN.x) > 0.5 ? vWP.z : vWP.x;
        vec2 cell = vec2(u / 3.4, vWP.y / 3.8);
        vec2 f = fract(cell);
        float win = side * step(0.14, f.x) * step(f.x, 0.86) * step(0.22, f.y) * step(f.y, 0.86);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.1, 0.13), win * 0.85);
        float lit = step(0.55, h21(floor(cell) + floor(vWP.xz / 40.0)));`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += win * lit * uNight * vec3(1.6, 1.25, 0.8);');
  };
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  list.forEach((t, i) => {
    t.i = i;
    m.makeScale(t.w, t.h, t.d).setPosition(t.x, t.y, t.z); im.setMatrixAt(i, m);
    c.setHSL(0.08 + t.tint * 0.5, 0.08 + t.tint * 0.1, 0.45 + t.tint * 0.3); im.setColorAt(i, c);
  });
  im.castShadow = true; im.receiveShadow = true; group.add(im);
  // spatial hash for collisions
  const grid = new Map(), G = 100;
  const key = (x, z) => `${Math.floor(x / G)},${Math.floor(z / G)}`;
  for (const t of list) {
    for (let x = t.x - t.w / 2; x <= t.x + t.w / 2 + G; x += G) for (let z = t.z - t.d / 2; z <= t.z + t.d / 2 + G; z += G) {
      const k = key(Math.min(x, t.x + t.w / 2), Math.min(z, t.z + t.d / 2)); if (!grid.has(k)) grid.set(k, new Set()); grid.get(k).add(t);
    }
  }
  const falling = [];
  return {
    mesh: im, list, uNight, falling,
    // the tower (if any) that contains point p
    at(p) {
      const s = grid.get(key(p.x, p.z)); if (!s) return null;
      for (const t of s) if (t.alive && Math.abs(p.x - t.x) < t.w / 2 && Math.abs(p.z - t.z) < t.d / 2 && p.y >= t.y - 1 && p.y < t.y + t.h * (1 - t.fall)) return t;
      return null;
    },
    // knocked down: it sinks and tilts into its own dust cloud
    topple(t, dir) { if (!t.alive) return; t.alive = false; t.dir = dir.clone().setY(0).normalize(); t.ft = 0; falling.push(t); },
    update(dt, fx) {
      for (const t of falling) {
        t.ft += dt;
        t.fall = Math.min(1, (t.ft / 5) ** 1.5);
        const tilt = Math.min(0.5, t.ft * 0.12);
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(t.dir.z, 0, -t.dir.x), tilt);
        m.compose(new THREE.Vector3(t.x, t.y - t.h * t.fall, t.z), q, new THREE.Vector3(t.w, t.h, t.d));
        im.setMatrixAt(t.i, m); im.instanceMatrix.needsUpdate = true;
        if (fx && t.fall < 1 && Math.random() < 0.9) {
          const r = Math.max(t.w, t.d);
          fx.dust.emit(new THREE.Vector3(t.x + (Math.random() - 0.5) * r, t.y + Math.random() * 6, t.z + (Math.random() - 0.5) * r), new THREE.Vector3((Math.random() - 0.5) * 8, 3 + Math.random() * 4, (Math.random() - 0.5) * 8), new THREE.Color(0.62, 0.58, 0.53), 14 + Math.random() * 14, 4 + Math.random() * 3, 2.2, 0.55);
        }
      }
      for (let i = falling.length - 1; i >= 0; i--) if (falling[i].fall >= 1) { m.makeScale(0, 0, 0); im.setMatrixAt(falling[i].i, m); im.instanceMatrix.needsUpdate = true; falling.splice(i, 1); }
    },
  };
}
