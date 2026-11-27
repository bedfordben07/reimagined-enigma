// Town layout: voxel buildings plus static scenery (roads, sidewalks, lamps, trees).
import * as THREE from 'three';
import { VS } from './voxels.js?v=1795814734';
import * as T from './textures.js?v=1795814734';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const MAT = { BRICK: 1, BRICK_TAN: 2, PLASTER: 3, PLASTER_BLUE: 4, CONCRETE: 5, TRIM: 6, GLASS: 7, ROOF: 8, SLAB: 9, TILE: 10, TRIM_DARK: 11, GLASS_LIT: 12, AWN_RED: 13, AWN_GREEN: 14, AWN_BLUE: 15, SIGN_WARM: 16, SIGN_CYAN: 17, SIGN_PINK: 18, WOOD: 19 };

export function makeVoxelMaterials() {
  const std = (tex, extra = {}) => T.pbr(tex, { metalness: extra.metalness ?? 0, ...extra });
  const defs = [null];
  defs[MAT.BRICK] = { material: std(T.brickTex(11, '#9a4a35')), dust: 0x8a6656 };
  defs[MAT.BRICK_TAN] = { material: std(T.brickTex(12, '#b58d62', '#cfc6b6')), dust: 0xa89478 };
  defs[MAT.PLASTER] = { material: std(T.plasterTex(13, '#e3d6bc')), dust: 0xcfc5b3 };
  defs[MAT.PLASTER_BLUE] = { material: std(T.plasterTex(14, '#8fa7b5')), dust: 0xb8c0c4 };
  defs[MAT.CONCRETE] = { material: std(T.concreteTex(15, '#a7a49d')), dust: 0xa9a6a0 };
  defs[MAT.TRIM] = { material: std(T.concreteTex(16, '#d8d1c4')), dust: 0xcac4b8 };
  defs[MAT.GLASS] = { material: std(T.glassTex(17), { metalness: 0.9, roughness: 1, envMapIntensity: 1.5 }), dust: 0xd0e0ea, glass: true, noTint: true };
  // windows with a warm room light behind them
  { const lit = std(T.glassTex(23), { metalness: 0.6, roughness: 1, envMapIntensity: 1.1, emissive: 0xffb36a, emissiveIntensity: 0.9 });
    lit.emissiveMap = T.windowGlowTex(); defs[MAT.GLASS_LIT] = { material: lit, dust: 0xd0e0ea, glass: true, noTint: true }; }
  defs[MAT.ROOF] = { material: std(T.roofTex(18)), dust: 0x6a6a6a };
  defs[MAT.SLAB] = { material: std(T.concreteTex(19, '#8c8984')), dust: 0x9a9792 };
  defs[MAT.TILE] = { material: std(T.tileTex(20)), dust: 0x9a5a48 };
  defs[MAT.TRIM_DARK] = { material: std(T.concreteTex(21, '#5d5a57')), dust: 0x77736f };
  defs[MAT.AWN_RED] = { material: std(T.awningTex('#b8302a', '#efe6d6', 31)), dust: 0xb08070, noTint: true };
  defs[MAT.AWN_GREEN] = { material: std(T.awningTex('#2f6b45', '#efe6d6', 32)), dust: 0x80a088, noTint: true };
  defs[MAT.AWN_BLUE] = { material: std(T.awningTex('#2b4f86', '#efe6d6', 33)), dust: 0x8090b0, noTint: true };
  const sign = (hex) => new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, emissive: hex, emissiveIntensity: 1.5, emissiveMap: T.signTex() });
  defs[MAT.SIGN_WARM] = { material: sign(0xffc46a), dust: 0x999999, noTint: true };
  defs[MAT.SIGN_CYAN] = { material: sign(0x46e0ff), dust: 0x999999, noTint: true };
  defs[MAT.SIGN_PINK] = { material: sign(0xff4fa8), dust: 0x999999, noTint: true };
  defs[MAT.WOOD] = { material: std(T.woodTex(34)), dust: 0x8a6a4a, noTint: true };
  return defs;
}

const STOREY = 6; // cells per storey (3 m)

// Stable per-window random so a whole window is either lit or dark.
function litHash(b, st, w, side) {
  let h = (b * 374761393 + st * 668265263 + w * 2246822519 + String(side).charCodeAt(0) * 3266489917) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Rectangular block with windows, a shopfront, floor slabs and a parapet.
function block(vox, o) {
  const x0 = vox.cx(o.x), z0 = vox.cz(o.z);
  const W = Math.round(o.w / VS), D = Math.round(o.d / VS);
  const floors = Math.min(21, o.floors); // the voxel world is 65 m tall
  const b = vox.addBuilding(o.tint || [1, 1, 1]);
  const topY = floors * STOREY;
  const door = o.front; // 'n' (+z), 's' (-z), 'e' (+x), 'w' (-x)
  const doorC = (door === 'n' || door === 's') ? Math.floor(W / 2) : Math.floor(D / 2);
  for (let y = 0; y <= topY + 2; y++) {
    const st = Math.floor(y / STOREY), ly = y % STOREY;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const edgeX = x === 0 || x === W - 1, edgeZ = z === 0 || z === D - 1;
      const per = edgeX || edgeZ;
      let m = 0;
      if (y === topY) m = per ? o.trim : MAT.ROOF;
      else if (y > topY) { if (per) m = o.trim; }
      else if (ly === 0 && st > 0) m = per ? o.trim : (floors <= 5 || st % (floors > 8 ? 4 : 3) === 0 ? MAT.SLAB : 0);
      else if (per) {
        const corner = edgeX && edgeZ;
        // u = position along this wall, L = wall length
        let u, L, side;
        if (edgeZ && !edgeX) { u = x; L = W; side = z === 0 ? 's' : 'n'; }
        else if (edgeX && !edgeZ) { u = z; L = D; side = x === 0 ? 'w' : 'e'; }
        m = o.wall;
        if (corner || u === 1 || u === L - 2) m = o.trim;
        else {
          const isFront = side === door;
          if (st === 0 && isFront) {
            const du = Math.abs(u - doorC);
            if (du <= 1 && ly <= 4) m = 0; // doorway
            else if (du === 2 && ly <= 4) m = o.trim;
            else if (ly >= 1 && ly <= 4 && u > 2 && u < L - 3) m = o.shopfront ? MAT.GLASS_LIT : litHash(b, 0, Math.floor(u / 6), side) < 0.3 ? MAT.GLASS_LIT : MAT.GLASS;
            else if (ly === 5) m = MAT.TRIM_DARK;
          } else {
            const pu = (u - 2) % 5;
            if (ly >= 2 && ly <= 4 && pu >= 1 && pu <= 3 && u < L - 3) m = litHash(b, st, Math.floor((u - 2) / 5), side) < 0.22 ? MAT.GLASS_LIT : MAT.GLASS;
            else if (ly === 1 && pu >= 1 && pu <= 3 && u < L - 3) m = o.trim; // sill
          }
        }
      }
      if (m) vox.set(x0 + x, y, z0 + z, m, b);
    }
  }
  cornice(vox, x0, z0, W, D, topY, o.trim, b);
  if (floors > 1) cornice(vox, x0, z0, W, D, STOREY, o.trim, b); // band above the shopfront
  if (!o.shopfront || floors > 1) roofDetails(vox, x0, z0, W, D, topY, b, o);
}

// Rooftop clutter: water tower on legs, air-con boxes, a mast on tall towers, billboards on mid-rises.
// Everything is ordinary blocks, so it all breaks.
function roofDetails(vox, x0, z0, W, D, topY, b, o) {
  const h = (k) => litHash(b, k, 7, 'r');
  const set = (x, y, z, m) => { if (x > 1 && z > 1 && x < W - 2 && z < D - 2 && y < vox.ny - 1) vox.set(x0 + x, y, z0 + z, m, b); };
  const floors = Math.min(21, o.floors);
  // air-con units
  const ac = 1 + Math.floor(h(1) * 3);
  for (let k = 0; k < ac; k++) {
    const ax = 3 + Math.floor(h(10 + k) * Math.max(1, W - 8)), az = 3 + Math.floor(h(20 + k) * Math.max(1, D - 8));
    for (let x = 0; x < 3; x++) for (let z = 0; z < 2; z++) for (let y = 1; y <= 2; y++) set(ax + x, topY + y, az + z, MAT.TRIM);
  }
  // water tower (mid-rise roofs)
  if (floors >= 3 && floors <= 14 && W >= 16 && D >= 16 && h(2) < 0.45) {
    const cx = Math.floor(W / 2) + (h(3) < 0.5 ? -3 : 3), cz = Math.floor(D / 2) + (h(4) < 0.5 ? -2 : 2);
    for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) for (let y = 1; y <= 4; y++) set(cx + lx, topY + y, cz + lz, MAT.TRIM_DARK);
    for (let y = 5; y <= 9; y++) for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (x * x + z * z <= 8.5) set(cx + x, topY + y, cz + z, MAT.WOOD);
    for (let k = 0; k < 3; k++) for (let x = -2 + k; x <= 2 - k; x++) for (let z = -2 + k; z <= 2 - k; z++) if (x * x + z * z <= (2.6 - k) ** 2) set(cx + x, topY + 10 + k, cz + z, MAT.ROOF);
  }
  // radio mast on tall towers
  if (floors >= 10) { const mx = Math.floor(W / 2), mz = Math.floor(D / 2); for (let y = 1; y <= 12; y++) set(mx, topY + y, mz, MAT.TRIM_DARK); set(mx, topY + 13, mz, MAT.SIGN_PINK); }
  // billboard facing the street
  if (floors >= 2 && floors <= 7 && h(5) < 0.35) {
    const sign = [MAT.SIGN_WARM, MAT.SIGN_CYAN, MAT.SIGN_PINK][Math.floor(h(6) * 3)];
    const front = o.front, along = front === 'n' || front === 's' ? W : D, len = Math.min(along - 6, 16), st = Math.floor((along - len) / 2);
    const depth = front === 's' || front === 'w' ? 3 : (front === 'n' ? D : W) - 4;
    for (let u = 0; u < len; u++) for (let y = 1; y <= 7; y++) {
      const isLeg = (u === 1 || u === len - 2) && y <= 2;
      if (y <= 2 && !isLeg) continue;
      const m = isLeg ? MAT.TRIM_DARK : y === 3 || y === 7 ? MAT.TRIM_DARK : sign;
      if (front === 'n' || front === 's') set(st + u, topY + y, depth, m); else set(depth, topY + y, st + u, m);
    }
  }
}

// (called at the end of block) projecting cornice one block out around the roof line
function cornice(vox, x0, z0, W, D, y, m, b) {
  for (let z = -1; z <= D; z++) for (let x = -1; x <= W; x++) {
    if (x === -1 || x === W || z === -1 || z === D) vox.set(x0 + x, y, z0 + z, m, b);
  }
}

// Shop: one or two storeys with a full-width shopfront, a striped awning over the pavement and a glowing
// sign band above it.
function shop(vox, o) {
  block(vox, { ...o, floors: o.floors, shopfront: true });
  const x0 = vox.cx(o.x), z0 = vox.cz(o.z), W = Math.round(o.w / VS), D = Math.round(o.d / VS);
  const b = vox.buildings.length - 1;
  // front face cells, outward direction
  const f = o.front;
  const along = f === 'n' || f === 's' ? W : D;
  const cell = (u, out, y, m) => {
    if (f === 's') vox.set(x0 + u, y, z0 - 1 - out, m, b);
    else if (f === 'n') vox.set(x0 + u, y, z0 + D + out, m, b);
    else if (f === 'w') vox.set(x0 - 1 - out, y, z0 + u, m, b);
    else vox.set(x0 + W + out, y, z0 + u, m, b);
  };
  for (let u = 1; u < along - 1; u++) {
    for (let out = 0; out < 3; out++) cell(u, out, 5 - (out === 2 ? 1 : 0), o.awning); // awning slopes down at the lip
    if (u > 1 && u < along - 2) cell(u, -1, 6, o.sign); // sign band on the facade (replaces the wall cell)
  }
}

// House with a stepped gable roof.
function house(vox, o) {
  const x0 = vox.cx(o.x), z0 = vox.cz(o.z);
  const W = Math.round(o.w / VS), D = Math.round(o.d / VS);
  const b = vox.addBuilding(o.tint || [1, 1, 1]);
  const topY = o.floors * STOREY;
  for (let y = 0; y < topY; y++) {
    const st = Math.floor(y / STOREY), ly = y % STOREY;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const edgeX = x === 0 || x === W - 1, edgeZ = z === 0 || z === D - 1;
      let m = 0;
      if (ly === 0 && st > 0) m = (edgeX || edgeZ) ? o.trim : MAT.SLAB;
      else if (edgeX || edgeZ) {
        const corner = edgeX && edgeZ;
        const u = edgeZ ? x : z, L = edgeZ ? W : D;
        m = corner ? o.trim : o.wall;
        const front = (o.front === 's' && z === 0 && edgeZ) || (o.front === 'n' && z === D - 1 && edgeZ) || (o.front === 'w' && x === 0 && edgeX) || (o.front === 'e' && x === W - 1 && edgeX);
        const c = Math.floor(L / 2);
        if (!corner) {
          if (front && st === 0 && Math.abs(u - c) <= 1 && ly <= 4) m = 0;
          else if (ly >= 2 && ly <= 4 && ((u >= 2 && u <= 4) || (u >= L - 5 && u <= L - 3))) m = litHash(b, st, u < L / 2 ? 0 : 1, edgeZ ? 1 : 2) < 0.3 ? MAT.GLASS_LIT : MAT.GLASS;
        }
      }
      if (m) vox.set(x0 + x, y, z0 + z, m, b);
    }
  }
  // gable roof along z (ridge runs along z), with 1-cell overhang
  for (let k = 0; ; k++) {
    const a = -1 + k, c = W - k;
    if (a > c) break;
    const y = topY + k;
    for (let z = -1; z <= D; z++) {
      for (const x of a === c ? [a] : [a, c]) vox.set(x0 + x, y, z0 + z, MAT.TILE, b);
      if (k > 0 && (z === 0 || z === D - 1)) for (let x = a + 1; x < c; x++) vox.set(x0 + x, y, z0 + z, o.wall, b);
      if (a + 1 === c) vox.set(x0 + a, y, z0 + z, MAT.TILE, b), vox.set(x0 + c, y, z0 + z, MAT.TILE, b);
    }
  }
}

export const LAYOUT = [
  // NE block
  { t: 'block', x: 9, z: 9.5, w: 12, d: 11, floors: 4, wall: MAT.BRICK, trim: MAT.TRIM, front: 'w', tint: [1, 0.97, 0.95] },
  { t: 'block', x: 23, z: 9.5, w: 12, d: 10, floors: 3, wall: MAT.PLASTER, trim: MAT.TRIM_DARK, front: 's', tint: [1, 1, 1] },
  { t: 'house', x: 23, z: 24, w: 10, d: 11, floors: 2, wall: MAT.PLASTER_BLUE, trim: MAT.TRIM, front: 's', tint: [1, 1, 1] },
  { t: 'block', x: 9, z: 24, w: 11, d: 11, floors: 2, wall: MAT.BRICK_TAN, trim: MAT.TRIM_DARK, front: 'w', tint: [1, 1, 1] },
  // NW block
  { t: 'block', x: -23, z: 9.5, w: 13.5, d: 13.5, floors: 7, wall: MAT.CONCRETE, trim: MAT.TRIM_DARK, front: 's', tint: [1, 1, 1.02] },
  { t: 'block', x: -36, z: 9.5, w: 11, d: 10, floors: 2, wall: MAT.PLASTER, trim: MAT.TRIM, front: 's', tint: [1, 0.93, 0.85] },
  { t: 'house', x: -35, z: 24, w: 10, d: 11, floors: 2, wall: MAT.BRICK, trim: MAT.TRIM, front: 'e', tint: [1, 1, 1] },
  { t: 'block', x: -21, z: 27, w: 11, d: 9, floors: 3, wall: MAT.BRICK_TAN, trim: MAT.TRIM, front: 'e', tint: [0.95, 1, 1] },
  // SW block
  { t: 'block', x: -22, z: -21.5, w: 13, d: 12, floors: 3, wall: MAT.BRICK_TAN, trim: MAT.TRIM_DARK, front: 'n', tint: [1, 1, 1] },
  { t: 'block', x: -36, z: -21.5, w: 11, d: 12, floors: 5, wall: MAT.BRICK, trim: MAT.TRIM, front: 'n', tint: [0.9, 0.9, 0.95] },
  { t: 'house', x: -23, z: -36, w: 10, d: 11, floors: 2, wall: MAT.PLASTER, trim: MAT.TRIM_DARK, front: 'n', tint: [1, 1, 1] },
  // SE block: corner shop + park
  { t: 'block', x: 9, z: -21.5, w: 11, d: 12, floors: 2, wall: MAT.PLASTER_BLUE, trim: MAT.TRIM, front: 'w', tint: [0.95, 1, 1] },
  // ---- east district (x 49..83)
  { t: 'block', x: 52, z: 9.5, w: 13, d: 12, floors: 5, wall: MAT.BRICK, trim: MAT.TRIM, front: 'w', tint: [0.95, 0.92, 0.9] },
  { t: 'block', x: 67, z: 9.5, w: 13, d: 11, floors: 3, wall: MAT.CONCRETE, trim: MAT.TRIM_DARK, front: 's', tint: [1, 1, 1] },
  { t: 'house', x: 52, z: 25, w: 10, d: 11, floors: 2, wall: MAT.PLASTER, trim: MAT.TRIM_DARK, front: 'w', tint: [1, 0.96, 0.9] },
  { t: 'block', x: 66, z: 23.5, w: 14, d: 12.5, floors: 9, wall: MAT.CONCRETE, trim: MAT.TRIM_DARK, front: 'w', tint: [0.92, 0.95, 1] },
  { t: 'block', x: 52, z: -36, w: 28, d: 12, floors: 2, wall: MAT.BRICK_TAN, trim: MAT.TRIM_DARK, front: 's', tint: [1, 1, 1] },
  { t: 'block', x: 52, z: -21.5, w: 12, d: 11, floors: 4, wall: MAT.PLASTER_BLUE, trim: MAT.TRIM, front: 'n', tint: [1, 1, 1] },
  { t: 'block', x: 67, z: -21.5, w: 13, d: 11, floors: 3, wall: MAT.BRICK, trim: MAT.TRIM, front: 'n', tint: [1, 0.95, 0.92] },
  // ---- west district (x -83..-49)
  { t: 'block', x: -80, z: 9.5, w: 12, d: 12, floors: 4, wall: MAT.PLASTER, trim: MAT.TRIM, front: 's', tint: [0.98, 0.95, 0.88] },
  { t: 'block', x: -66, z: 9.5, w: 13, d: 13, floors: 6, wall: MAT.BRICK_TAN, trim: MAT.TRIM_DARK, front: 'e', tint: [1, 1, 1] },
  { t: 'house', x: -80, z: 25, w: 10, d: 11, floors: 2, wall: MAT.BRICK, trim: MAT.TRIM, front: 's', tint: [0.95, 1, 1] },
  { t: 'house', x: -63, z: 25, w: 10, d: 11, floors: 2, wall: MAT.PLASTER_BLUE, trim: MAT.TRIM, front: 'e', tint: [1, 1, 1] },
  { t: 'block', x: -80, z: -36, w: 14, d: 12, floors: 3, wall: MAT.CONCRETE, trim: MAT.TRIM, front: 's', tint: [1, 0.98, 0.95] },
  { t: 'block', x: -63, z: -21.5, w: 11, d: 12, floors: 5, wall: MAT.BRICK, trim: MAT.TRIM_DARK, front: 'n', tint: [0.92, 0.9, 0.9] },
];

// ---- outer districts (north and south rows), generated from block templates
const WALLS = [MAT.BRICK, MAT.BRICK_TAN, MAT.PLASTER, MAT.PLASTER_BLUE, MAT.CONCRETE];
const TRIMS = [MAT.TRIM, MAT.TRIM_DARK];
export const PARKS = []; // [x0, z0, x1, z1] areas that get trees
function outerBlocks() {
  const out = [];
  let seed = 9001;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pick = (a) => a[Math.floor(r() * a.length)];
  const kinds = ['mixed', 'warehouse', 'plaza', 'houses', 'mixed', 'houses', 'mixed', 'plaza'];
  let n = 0;
  for (const cz of [66, -66]) for (const cx of [-66, -22, 22, 66]) {
    const x0 = cx - 14, z0 = cz - 14; // buildable 28 x 28 m inside the sidewalk ring
    const front = cz > 0 ? 's' : 'n';
    const tint = () => [0.92 + r() * 0.1, 0.92 + r() * 0.1, 0.92 + r() * 0.1];
    const B = (x, z, w, d, floors, t = 'block') => out.push({ t, x: x0 + x, z: z0 + z, w, d, floors, wall: pick(WALLS), trim: pick(TRIMS), front, tint: tint() });
    const kind = kinds[n++];
    if (kind === 'mixed') {
      B(0, 0, 13, 12, 2 + Math.floor(r() * 4)); B(15, 0, 13, 11, 2 + Math.floor(r() * 3));
      B(1, 16, 10, 11, 2, 'house'); B(15, 15, 13, 13, 5 + Math.floor(r() * 5));
    } else if (kind === 'warehouse') {
      B(0, cz > 0 ? 16 : 0, 28, 12, 2); B(0, cz > 0 ? 0 : 15, 12, 12, 3 + Math.floor(r() * 3)); B(17, cz > 0 ? 1 : 16, 10, 11, 2, 'house');
    } else if (kind === 'plaza') {
      B(7, 7, 14, 14, 8 + Math.floor(r() * 4));
      PARKS.push([x0, z0, x0 + 28, z0 + 6], [x0, z0 + 22, x0 + 28, z0 + 28]);
    } else {
      for (const [x, z] of [[0, 1], [15, 1], [0, 16], [15, 16]]) B(x + 1, z, 10, 11, 2, 'house');
    }
  }
  return out;
}
const OUTER = outerBlocks();

// ---- landmarks: a stadium, a clock tower on a plaza, and a petrol station
export const LANDMARKS = { '110,-154': 'stadium', '-22,-110': 'clock', '154,22': 'petrol', '-110,66': 'site' };
export const SITE = { x: -110, z: 66 };
const isLandmark = (cx, cz) => !!LANDMARKS[`${cx},${cz}`];

// Oval stadium: a concrete outer wall, a sloped bowl of seating with coloured rows, four gates and
// floodlight masts at the corners. The pitch itself is drawn as scenery.
function stadium(vox, cx, cz) {
  const b = vox.addBuilding([1, 1, 1]);
  const x0 = vox.cx(cx - 14), z0 = vox.cz(cz - 14), N = 56, H = 24;
  const seat = [MAT.AWN_RED, MAT.AWN_BLUE, MAT.TRIM, MAT.AWN_GREEN];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const dx = (x - N / 2 + 0.5) / 27, dz = (z - N / 2 + 0.5) / 24, r = Math.hypot(dx, dz);
    if (r > 1) continue;
    const gate = Math.abs(dx) < 0.09 || Math.abs(dz) < 0.1;
    if (r > 0.93) { for (let y = 0; y < H + 2; y++) { if (gate && y < 6) continue; const m = y >= H ? MAT.TRIM_DARK : (y % 6 === 5 ? MAT.TRIM : MAT.CONCRETE); vox.set(x0 + x, y, z0 + z, m, b); } continue; }
    if (r > 0.56) {
      // seating surface rises toward the wall
      const y = Math.floor((r - 0.56) / 0.37 * (H - 2));
      if (gate && y < 6) continue;
      vox.set(x0 + x, y, z0 + z, seat[Math.floor(y / 3) % seat.length], b);
      if (y > 0) vox.set(x0 + x, y - 1, z0 + z, MAT.SLAB, b);
    }
  }
  for (const [mx, mz] of [[2, 2], [N - 4, 2], [2, N - 4], [N - 4, N - 4]]) {
    for (let y = 0; y < 52; y++) for (let k = 0; k < 4; k++) vox.set(x0 + mx + (k & 1), y, z0 + mz + (k >> 1), MAT.TRIM_DARK, b);
    for (let y = 52; y < 56; y++) for (let u = -2; u < 4; u++) vox.set(x0 + mx + u, y, z0 + mz, MAT.SIGN_WARM, b);
  }
}

// Clock tower: a tall brick tower with glowing clock faces on all four sides and a stepped spire.
function clockTower(vox, cx, cz) {
  const b = vox.addBuilding([1, 0.95, 0.9]);
  const W = 16, x0 = vox.cx(cx - 4), z0 = vox.cz(cz - 4), H = 92;
  for (let y = 0; y < H; y++) for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const edge = x === 0 || z === 0 || x === W - 1 || z === W - 1;
    const corner = (x < 2 || x > W - 3) && (z < 2 || z > W - 3);
    if (!edge && y % 12 !== 0) continue;
    let m = edge ? (corner || y % 12 === 0 ? MAT.TRIM : MAT.BRICK) : MAT.SLAB;
    if (edge && !corner && y % 12 >= 4 && y % 12 <= 8 && y < 70 && ((x + z) % 5 === 2)) m = MAT.GLASS;
    if (y < 6 && edge && (x === 7 || x === 8) && z === 0) continue; // door
    vox.set(x0 + x, y, z0 + z, m, b);
  }
  // clock faces: a glowing disc, a dark rim, hands at ten past ten
  const face = (u, v) => { const du = u - 7.5, dv = v - 7.5, r = Math.hypot(du, dv); if (r > 6.6) return 0; if (r > 5.6) return MAT.TRIM_DARK;
    const a1 = Math.atan2(dv, du); const onHand = (ang, len) => r < len && Math.abs(((a1 - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.22;
    if (r < 0.9 || onHand(Math.PI / 2 + Math.PI / 3, 4.5) || onHand(Math.PI / 2 - Math.PI / 3 * 2.0, 5.3)) return MAT.TRIM_DARK; return MAT.SIGN_WARM; };
  for (let v = 0; v < 16; v++) for (let u = 0; u < 16; u++) {
    const m = face(u, v); if (!m) continue; const y = 72 + v;
    vox.set(x0 + u, y, z0 - 1, m, b); vox.set(x0 + W - 1 - u, y, z0 + W, m, b); vox.set(x0 - 1, y, z0 + W - 1 - u, m, b); vox.set(x0 + W, y, z0 + u, m, b);
  }
  // stepped spire
  for (let k = 0; k < 9; k++) for (let z = k; z < W - k; z++) for (let x = k; x < W - k; x++) if (x === k || z === k || x === W - 1 - k || z === W - 1 - k) vox.set(x0 + x, H + k, z0 + z, MAT.TILE, b);
  for (let y = H + 9; y < H + 16; y++) vox.set(x0 + 7, y, z0 + 7, MAT.TRIM_DARK, b);
}

// Petrol station: a canopy on four columns with a glowing edge, a kiosk at the back. Pumps are props.
function petrol(vox, cx, cz) {
  const b = vox.addBuilding([1, 1, 1]);
  const x0 = vox.cx(cx - 12), z0 = vox.cz(cz - 6), W = 32, D = 20;
  for (const [x, z] of [[2, 2], [W - 4, 2], [2, D - 4], [W - 4, D - 4]]) for (let y = 0; y < 10; y++) for (let k = 0; k < 4; k++) vox.set(x0 + x + (k & 1), y, z0 + z + (k >> 1), MAT.TRIM, b);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const edge = x === 0 || z === 0 || x === W - 1 || z === D - 1;
    vox.set(x0 + x, 10, z0 + z, edge ? MAT.SIGN_PINK : MAT.TRIM, b);
    if (edge) vox.set(x0 + x, 11, z0 + z, MAT.TRIM_DARK, b);
  }
  shop(vox, { t: 'shop', x: cx - 6, z: cz + 8, w: 12, d: 6, floors: 1, wall: MAT.PLASTER, trim: MAT.TRIM_DARK, front: 'w', tint: [1, 1, 1], awning: MAT.AWN_RED, sign: MAT.SIGN_CYAN, fixed: true });
}
// Construction site: a half-built steel-frame tower (columns, girders, a few concrete floors) and a site
// fence; the tower crane and loose girders are added in site.js.
function constructionSite(vox, cx, cz) {
  const b = vox.addBuilding([1, 1, 1]);
  const x0 = vox.cx(cx - 10), z0 = vox.cz(cz - 10), N = 40, H = 64;
  for (let gx = 0; gx <= 4; gx++) for (let gz = 0; gz <= 4; gz++) {
    const x = Math.min(N - 1, gx * 10), z = Math.min(N - 1, gz * 10);
    const top = H - (gx + gz) % 3 * 8; // a ragged, unfinished skyline
    for (let y = 0; y < top; y++) vox.set(x0 + x, y, z0 + z, MAT.TRIM_DARK, b);
  }
  for (let f = 1; f <= 7; f++) {
    const y = f * 8;
    for (let k = 0; k < N; k++) for (let g = 0; g <= 4; g++) {
      const L = Math.min(N - 1, g * 10);
      if (y < H - ((g + Math.floor(k / 10)) % 3) * 8) { vox.set(x0 + k, y, z0 + L, MAT.TRIM_DARK, b); vox.set(x0 + L, y, z0 + k, MAT.TRIM_DARK, b); }
    }
    // poured concrete floors on the lower storeys only
    if (f <= 3) for (let x = 1; x < N - 1; x++) for (let z = 1; z < N - 1; z++) if (f < 3 || x < 24) vox.set(x0 + x, y - 1, z0 + z, MAT.SLAB, b);
  }
  // site fence
  const fb = vox.addBuilding([1, 1, 1]);
  const fx0 = vox.cx(cx - 14), fz0 = vox.cz(cz - 14);
  for (let k = 0; k < 56; k++) for (let y = 0; y < 4; y++) {
    if (k > 22 && k < 32) continue; // gate
    for (const [x, z] of [[k, 0], [k, 55], [0, k], [55, k]]) vox.set(fx0 + x, y, fz0 + z, y === 3 ? MAT.AWN_RED : MAT.TRIM, fb);
  }
}
export const PUMP_SPOTS = [[154 - 6, 22 - 2], [154 - 6, 22 + 2], [154 + 2, 22 - 2], [154 + 2, 22 + 2]];

// ---- outer ring (blocks centred at +-110): a skyscraper district, mid-rise streets, suburbs at the corners
function ringBlocks() {
  const out = [];
  let seed = 4242;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pick = (a) => a[Math.floor(r() * a.length)];
  const C = [-110, -66, -22, 22, 66, 110];
  for (const cz of C) for (const cx of C) {
    if (Math.abs(cx) < 100 && Math.abs(cz) < 100) continue; // inner 4 x 4 already built
    if (isLandmark(cx, cz)) { if (LANDMARKS[`${cx},${cz}`] === 'clock') PARKS.push([cx - 14, cz - 14, cx + 14, cz - 6], [cx - 14, cz + 6, cx + 14, cz + 14]); continue; }
    const x0 = cx - 14, z0 = cz - 14;
    const corner = Math.abs(cx) > 100 && Math.abs(cz) > 100;
    const front = Math.abs(cz) > 100 ? (cz > 0 ? 's' : 'n') : (cx > 0 ? 'w' : 'e');
    const tint = () => [0.92 + r() * 0.1, 0.92 + r() * 0.1, 0.92 + r() * 0.1];
    const B = (x, z, w, d, floors, t = 'block') => out.push({ t, x: x0 + x, z: z0 + z, w, d, floors, wall: pick(WALLS), trim: pick(TRIMS), front, tint: tint(), fixed: true });
    // the north-east and south-west edges form a downtown of high-rises
    const downtown = (cx > 0 && cz > 0) || (cx < 0 && cz < 0);
    if (corner) {
      for (const [x, z] of [[0, 1], [15, 1], [0, 16], [15, 16]]) B(x + 1, z, 10, 11, 2, 'house');
    } else if (downtown) {
      const k = r();
      if (k < 0.4) { B(0, 0, 13, 13, 12 + Math.floor(r() * 9)); B(15, 15, 13, 13, 14 + Math.floor(r() * 8)); B(15, 0, 13, 12, 5 + Math.floor(r() * 4)); B(0, 16, 12, 12, 4 + Math.floor(r() * 3)); }
      else if (k < 0.7) { B(6, 6, 16, 16, 17 + Math.floor(r() * 6)); PARKS.push([x0, z0 + 25, x0 + 28, z0 + 28]); }
      else { B(0, 0, 28, 12, 7 + Math.floor(r() * 5)); B(0, 15, 13, 13, 11 + Math.floor(r() * 7)); B(15, 15, 13, 13, 6 + Math.floor(r() * 5)); }
    } else {
      const k = r();
      if (k < 0.45) { B(0, 0, 13, 12, 3 + Math.floor(r() * 4)); B(15, 0, 13, 11, 2 + Math.floor(r() * 4)); B(1, 16, 10, 11, 2, 'house'); B(15, 15, 13, 13, 6 + Math.floor(r() * 6)); }
      else if (k < 0.7) { B(0, 0, 28, 12, 2); B(0, 15, 12, 12, 3 + Math.floor(r() * 3)); B(16, 16, 10, 11, 2, 'house'); }
      else { for (const [x, z] of [[0, 1], [15, 1], [0, 16]]) B(x + 1, z, 10, 11, 2, 'house'); PARKS.push([x0 + 15, z0 + 15, x0 + 28, z0 + 28]); }
    }
  }
  return out;
}
const RING = ringBlocks();

// ---- outermost ring (blocks centred at +-154): shopping streets, parking lots, parks and a few skyscrapers
export const PARKING = []; // [x0, z0, x1, z1] asphalt lots that get parked cars
function edgeBlocks() {
  const out = [];
  let seed = 777;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pick = (a) => a[Math.floor(r() * a.length)];
  const C = [-154, -110, -66, -22, 22, 66, 110, 154];
  const AWN = [MAT.AWN_RED, MAT.AWN_GREEN, MAT.AWN_BLUE], SIGN = [MAT.SIGN_WARM, MAT.SIGN_CYAN, MAT.SIGN_PINK];
  let i = 0;
  for (const cz of C) for (const cx of C) {
    if (Math.abs(cx) < 140 && Math.abs(cz) < 140) continue;
    if (isLandmark(cx, cz)) continue;
    const x0 = cx - 14, z0 = cz - 14;
    const tint = () => [0.92 + r() * 0.1, 0.92 + r() * 0.1, 0.92 + r() * 0.1];
    const B = (x, z, w, d, floors, front, t = 'block', extra = {}) => out.push({ t, x: x0 + x, z: z0 + z, w, d, floors, wall: pick(WALLS), trim: pick(TRIMS), front, tint: tint(), fixed: true, ...extra });
    const S = (x, z, w, front) => B(x, z, w, 9, 1 + (r() < 0.45 ? 1 : 0), front, 'shop', { awning: pick(AWN), sign: pick(SIGN) });
    // which side faces the town: shops line that street
    const inward = Math.abs(cx) > 140 ? (cx > 0 ? 'w' : 'e') : (cz > 0 ? 's' : 'n');
    const corner = Math.abs(cx) > 140 && Math.abs(cz) > 140;
    const kind = corner ? (i % 2 ? 'park' : 'sky') : ['shops', 'parking', 'shops', 'sky', 'shops', 'parking'][i % 6];
    i++;
    if (kind === 'shops') {
      // a terrace of shops on the inward street and a second row behind
      if (inward === 's' || inward === 'n') {
        const z = inward === 's' ? 0 : 19;
        for (let k = 0; k < 4; k++) S(k * 7, z, 6.5, inward);
        for (let k = 0; k < 3; k++) S(1 + k * 9, inward === 's' ? 19 : 0, 8, inward === 's' ? 'n' : 's');
      } else {
        const x = inward === 'w' ? 0 : 19;
        for (let k = 0; k < 4; k++) out.push(...[]), B(x, k * 7, 9, 6.5, 1 + (r() < 0.45 ? 1 : 0), inward, 'shop', { awning: pick(AWN), sign: pick(SIGN) });
        for (let k = 0; k < 3; k++) B(inward === 'w' ? 19 : 0, 1 + k * 9, 9, 8, 1 + (r() < 0.45 ? 1 : 0), inward === 'w' ? 'e' : 'w', 'shop', { awning: pick(AWN), sign: pick(SIGN) });
      }
    } else if (kind === 'parking') {
      // a big lot with a small kiosk
      PARKING.push([x0 + 1, z0 + 1, x0 + 27, z0 + 27]);
      B(11, 11, 6, 6, 1, inward, 'shop', { awning: pick(AWN), sign: pick(SIGN) });
    } else if (kind === 'sky') {
      B(2, 2, 14, 14, 16 + Math.floor(r() * 6), inward);
      B(19, 17, 9, 11, 9 + Math.floor(r() * 6), inward);
      PARKS.push([x0 + 17, x0 + 0 + z0 - x0, x0 + 28, z0 + 14]);
    } else {
      PARKS.push([x0, z0, x0 + 28, z0 + 28]);
    }
  }
  return out;
}
const EDGE = edgeBlocks();

// Street furniture along every sidewalk ring: [x, z, type, yaw]
export const PROP_SPOTS = (() => {
  const out = [];
  let seed = 2024;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const C = [-154, -110, -66, -22, 22, 66, 110, 154];
  for (const cx of C) for (const cz of C) {
    // each side of the block: outward normal (nx, nz)
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let t = -13; t <= 13; t += 4.3) {
        const x = cx + nx * 15.6 + (nz ? t : 0), z = cz + nz * 15.6 + (nx ? t : 0);
        if (Math.hypot(x, z - 3) < 10 || Math.hypot(x, z - 13) < 4) continue; // keep the start area clear
        const k = r(), yaw = Math.atan2(nx, nz);
        if (k < 0.07) out.push([x, z, 'hydrant', yaw]);
        else if (k < 0.17) out.push([x, z, 'bin', yaw]);
        else if (k < 0.23) out.push([x, z, 'bench', yaw]);
        else if (k < 0.26) out.push([x, z, 'mail', yaw]);
        else if (k < 0.29) out.push([x + nx * 1, z + nz * 1, 'cone', yaw]);
      }
    }
    if (isLandmark(cx, cz)) continue;
    // a hydrant on one corner of every block
    out.push([cx + 13.8, cz + 15.6, 'hydrant', 0]);
  }
  for (const [x, z] of PUMP_SPOTS) out.push([x, z, 'pump', Math.PI / 2]);
  return out;
})();
// Where pigeon flocks hang out: parks and a few junctions.
export const BIRD_HOMES = (() => [[6.5, 6.5], [-6.5, -40], [40, 6.5]].concat(PARKS.slice(0, 14).map(([ax, az, bx, bz]) => [(ax + bx) / 2, (az + bz) / 2])))();

// Parked cars: along the kerbs (some), and in rows in the parking lots. [x, z, yaw]
export const CAR_SPOTS = (() => {
  const spots = [];
  let seed = 31337;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const ROADS = [-176, -132, -88, -44, 0, 44, 88, 132, 176];
  for (const c of ROADS) for (let s = -170; s <= 170; s += 7.5) {
    if (ROADS.some((q) => Math.abs(s - q) < 9)) continue; // keep junctions clear
    if (Math.abs(c) < 1 && Math.abs(s) < 24) continue;     // and the start area
    if (r() < 0.12) spots.push([s, c + 3.4, Math.PI / 2]);
    if (r() < 0.12) spots.push([s, c - 3.4, -Math.PI / 2]);
    if (r() < 0.12) spots.push([c + 3.4, s, 0]);
    if (r() < 0.12) spots.push([c - 3.4, s, Math.PI]);
  }
  for (const [ax, az, bx, bz] of PARKING) {
    for (let row = 0; row < 2; row++) for (let k = 0; k < 9; k++) {
      if (r() < 0.25) continue;
      const x = ax + 2 + k * 2.8, z = row ? bz - 3.2 : az + 3.2;
      if (Math.abs(x - (ax + 14)) < 4 && Math.abs(z - (az + 14)) < 6) continue;
      spots.push([x, z, row ? 0 : Math.PI]);
    }
  }
  return spots;
})();

export function buildVoxelTown(vox) {
  vox.reset();
  stadium(vox, 110, -154); clockTower(vox, -22, -110); petrol(vox, 154, 22); constructionSite(vox, -110, 66);
  for (const o of [...LAYOUT, ...OUTER, ...RING, ...EDGE]) {
    if (o.t === 'house') house(vox, o);
    else if (o.t === 'shop') shop(vox, o);
    else block(vox, o.floors >= 5 && !o.fixed ? { ...o, floors: Math.min(21, Math.round(o.floors * 1.9)) } : o);
  }
  return vox.finalize();
}

export function buildScenery(scene, renderer) {
  const group = new THREE.Group();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const setRep = (tex, r) => { for (const t of [tex.map, tex.normalMap, tex.ormMap]) { t.repeat.set(r[0], r[1]); t.anisotropy = aniso; } return tex; };

  // grass
  const grass = T.grassTex(3);
  const gSize = 1200;
  setRep(grass, [gSize / 6, gSize / 6]);
  const wetMats = []; // surfaces that turn glossy in the rain
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gSize, gSize), new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.normalMap, aoMap: grass.ormMap, roughnessMap: grass.ormMap, roughness: 1 }));
  wetMats.push(ground.material);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground);

  // roads
  const asph = T.asphaltTex(4);
  const roadMat = (len) => {
    const m = new THREE.MeshStandardMaterial({ map: asph.map.clone(), normalMap: asph.normalMap.clone(), roughnessMap: asph.ormMap.clone(), roughness: 1 });
    m.aoMap = m.roughnessMap;
    for (const t of [m.map, m.normalMap, m.roughnessMap]) { t.repeat.set(10 / 6, len / 6); t.anisotropy = aniso; t.needsUpdate = true; }
    wetMats.push(m);
    return m;
  };
  const roads = [ // [cx, cz, along x?, length]
    ...[-176, -132, -88, -44, 0, 44, 88, 132, 176].flatMap((c) => [[c, 0, false, 362], [0, c, true, 362]]),
  ];
  for (const [x, z, alongX, len] of roads) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(10, len), roadMat(len));
    r.rotation.x = -Math.PI / 2; if (alongX) r.rotation.z = Math.PI / 2;
    r.position.set(x, 0.012 + (alongX ? 0.001 : 0), z); r.receiveShadow = true; group.add(r);
  }
  // stadium pitch: striped grass with white lines
  {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
    for (let i = 0; i < 12; i++) { x.fillStyle = i % 2 ? '#3f7a32' : '#4a8a3a'; x.fillRect(i * 512 / 12, 0, 512 / 12 + 1, 256); }
    x.strokeStyle = '#f2f2ea'; x.lineWidth = 3; x.strokeRect(14, 14, 484, 228); x.beginPath(); x.moveTo(256, 14); x.lineTo(256, 242); x.stroke();
    x.beginPath(); x.arc(256, 128, 36, 0, Math.PI * 2); x.stroke(); x.strokeRect(14, 78, 60, 100); x.strokeRect(438, 78, 60, 100);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(28, 22), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
    pitch.rotation.x = -Math.PI / 2; pitch.position.set(110, 0.05, -154); pitch.receiveShadow = true; group.add(pitch);
  }
  // petrol station forecourt
  { const lot = new THREE.Mesh(new THREE.PlaneGeometry(26, 28), roadMat(28)); lot.rotation.x = -Math.PI / 2; lot.position.set(154, 0.16, 22); lot.receiveShadow = true; group.add(lot); }
  // parking lots: asphalt with painted bays
  for (const [ax, az, bx, bz] of PARKING) {
    const w = bx - ax, d = bz - az;
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat(d));
    lot.rotation.x = -Math.PI / 2; lot.position.set((ax + bx) / 2, 0.16, (az + bz) / 2); lot.receiveShadow = true; group.add(lot);
  }
  const bayGeo = new THREE.PlaneGeometry(0.12, 5); bayGeo.rotateX(-Math.PI / 2);
  const bays = new THREE.InstancedMesh(bayGeo, new THREE.MeshStandardMaterial({ color: 0xe8e2c8, roughness: 0.7 }), PARKING.length * 22);
  let bi = 0; const bm = new THREE.Matrix4();
  for (const [ax, az, bx, bz] of PARKING) for (let k = 0; k <= 9; k++) for (const z of [az + 3.2, bz - 3.2]) { bm.makeTranslation(ax + 0.6 + k * 2.8, 0.17, z); bays.setMatrixAt(bi++, bm); }
  bays.count = bi; bays.receiveShadow = true; group.add(bays);

  // lane markings
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xe8e2c8, roughness: 0.7, metalness: 0 });
  const dashGeo = new THREE.PlaneGeometry(0.18, 2.4); dashGeo.rotateX(-Math.PI / 2);
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, 1200); let di = 0;
  const m4 = new THREE.Matrix4();
  for (const [x, z, alongX, len] of roads) {
    for (let s = -len / 2 + 2; s <= len / 2 - 2; s += 5) {
      const px = alongX ? x + s : x, pz = alongX ? z : z + s;
      if ((Math.abs(px) % 44 < 6 || Math.abs(px) % 44 > 38) && (Math.abs(pz) % 44 < 6 || Math.abs(pz) % 44 > 38)) continue;
      m4.makeRotationY(alongX ? Math.PI / 2 : 0); m4.setPosition(px, 0.02, pz);
      dashes.setMatrixAt(di++, m4);
    }
  }
  dashes.count = di; dashes.receiveShadow = true; group.add(dashes);
  // crosswalks around the main intersection
  const cwGeo = new THREE.PlaneGeometry(0.5, 3); cwGeo.rotateX(-Math.PI / 2);
  const cw = new THREE.InstancedMesh(cwGeo, dashMat, 80); let ci = 0;
  for (const [dx, dz, rot] of [[0, 6.5, 0], [0, -6.5, 0], [6.5, 0, 1], [-6.5, 0, 1]]) {
    for (let k = -4; k <= 4; k++) {
      m4.makeRotationY(rot ? Math.PI / 2 : 0);
      m4.setPosition(dx + (rot ? 0 : k * 1.0), 0.021, dz + (rot ? k * 1.0 : 0));
      cw.setMatrixAt(ci++, m4);
    }
  }
  cw.count = ci; cw.receiveShadow = true; group.add(cw);

  // sidewalks (thin slabs along the blocks)
  const pav = T.paverTex(6);
  const swMat = new THREE.MeshStandardMaterial({ map: pav.map, normalMap: pav.normalMap, aoMap: pav.ormMap, roughnessMap: pav.ormMap, roughness: 1 });
  wetMats.push(swMat);
  for (const t of [swMat.map, swMat.normalMap, swMat.roughnessMap]) { t.repeat.set(1, 1); t.anisotropy = aniso; }
  const curbMat = T.pbr(T.concreteTex(8, '#a29f98', false));
  for (const bx of [-154, -110, -66, -22, 22, 66, 110, 154]) for (const bz of [-154, -110, -66, -22, 22, 66, 110, 154]) {
    // each block spans 5..39 from the road centres; ring of sidewalk 3 m wide
    const cx = bx, cz = bz, size = 34;
    for (const [w, d, ox, oz] of [[size, 3, 0, -size / 2 + 1.5], [size, 3, 0, size / 2 - 1.5], [3, size - 6, -size / 2 + 1.5, 0], [3, size - 6, size / 2 - 1.5, 0]]) {
      const g = new THREE.BoxGeometry(w, 0.15, d);
      const uv = g.attributes.uv; const pos = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + cx + ox) / 2, (pos.getZ(i) + cz + oz) / 2);
      const m = new THREE.Mesh(g, swMat); m.position.set(cx + ox, 0.075, cz + oz); m.receiveShadow = true; group.add(m);
    }
    const curb = new THREE.Mesh(new THREE.BoxGeometry(size + 0.3, 0.17, size + 0.3), curbMat);
    curb.position.set(cx, 0.06, cz); curb.receiveShadow = true; group.add(curb);
  }

  // street lamps
  const poleMat = T.pbr(T.brushedMetalTex(7, '#33383c', 0.4), { metalness: 0.85 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 2.4, roughness: 0.3 });
  const poolTex = T.radialTex('rgb(255,255,255)', 'rgb(0,0,0)', 256); // luminance falloff drives both glow and alpha
  const poolMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc98a, emissiveIntensity: 0.12, emissiveMap: poolTex, alphaMap: poolTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const poolGeo = new THREE.PlaneGeometry(7, 7); poolGeo.rotateX(-Math.PI / 2);
  const shadeGeo = new THREE.LatheGeometry([[0.02, 0.1], [0.18, 0.08], [0.3, 0.0], [0.31, -0.03], [0.0, -0.03]].map(([x, y]) => new THREE.Vector2(x, y)), 32);
  const lampLights = [];
  const lampPos = [];
  const R = [-176, -132, -88, -44, 0, 44, 88, 132, 176];
  for (const c of R) for (let s2 = -170; s2 <= 170; s2 += 22) {
    if (R.some((q) => Math.abs(s2 - q) < 7)) continue; // keep intersections clear
    lampPos.push([s2, c + 5.6, -2], [s2 + 11 > 170 ? s2 - 11 : s2 + 11, c - 5.6, 2]); // along east-west roads
    lampPos.push([c + 5.6, s2, -1], [c - 5.6, s2 + 11 > 170 ? s2 - 11 : s2 + 11, 1]); // along north-south roads
  }
  // one instanced mesh per lamp part keeps hundreds of lamps cheap to draw
  const parts = [
    [new THREE.CylinderGeometry(0.07, 0.1, 6, 10), poleMat, [0, 3, 0], true],
    [new THREE.BoxGeometry(1.4, 0.08, 0.08), poleMat, [0.6, 5.9, 0], true],
    [shadeGeo, poleMat, [1.25, 5.82, 0], true],
    [new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bulbMat, [1.25, 5.8, 0], false],
  ].map(([geo, mat, off, shadow]) => { const im = new THREE.InstancedMesh(geo, mat, lampPos.length); im.castShadow = shadow; im.receiveShadow = true; group.add(im); return [im, off]; });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, lampPos.length); pools.renderOrder = 1; group.add(pools);
  const g0 = new THREE.Object3D(), lm = new THREE.Matrix4(), om = new THREE.Matrix4();
  lampPos.forEach(([x, z, f], i) => {
    g0.position.set(x, 0.15, z);
    g0.rotation.set(0, f === -1 ? Math.PI : f === 1 ? 0 : f === -2 ? Math.PI / 2 : -Math.PI / 2, 0);
    g0.updateMatrix();
    for (const [im, off] of parts) { om.makeTranslation(off[0], off[1], off[2]); lm.multiplyMatrices(g0.matrix, om); im.setMatrixAt(i, lm); }
    const bp = new THREE.Vector3(1.25, 5.7, 0).applyMatrix4(g0.matrix);
    lampLights.push(bp);
    lm.makeTranslation(bp.x, 0.17, bp.z); pools.setMatrixAt(i, lm);
  });

  // traffic lights at every junction: two signal posts per junction, one per direction of travel
  const tlPole = new THREE.CylinderGeometry(0.08, 0.1, 4.6, 8); tlPole.translate(0, 2.3, 0);
  const tlHead = new THREE.BoxGeometry(0.34, 1.0, 0.3); tlHead.translate(0, 4.2, 0);
  const tlLamp = new THREE.SphereGeometry(0.1, 10, 8);
  const RJ = [-176, -132, -88, -44, 0, 44, 88, 132, 176];
  const posts = [];
  for (const jx of RJ) for (const jz of RJ) { posts.push([jx + 5.9, jz + 5.9, 0, 0], [jx - 5.9, jz - 5.9, Math.PI, 0], [jx - 5.9, jz + 5.9, -Math.PI / 2, 1], [jx + 5.9, jz - 5.9, Math.PI / 2, 1]); }
  const poleI = new THREE.InstancedMesh(tlPole, poleMat, posts.length), headI = new THREE.InstancedMesh(tlHead, poleMat, posts.length);
  const lampI = new THREE.InstancedMesh(tlLamp, new THREE.MeshBasicMaterial({ color: 0xffffff }), posts.length * 3);
  poleI.castShadow = headI.castShadow = true;
  const o3 = new THREE.Object3D(), lmm = new THREE.Matrix4(), off = new THREE.Matrix4();
  posts.forEach(([x, z, yaw], i) => {
    o3.position.set(x, 0.15, z); o3.rotation.set(0, yaw, 0); o3.updateMatrix();
    poleI.setMatrixAt(i, o3.matrix); headI.setMatrixAt(i, o3.matrix);
    for (let k = 0; k < 3; k++) { off.makeTranslation(0, 4.55 - k * 0.33, 0.16); lmm.multiplyMatrices(o3.matrix, off); lampI.setMatrixAt(i * 3 + k, lmm); }
  });
  group.add(poleI, headI, lampI);
  const RED = new THREE.Color(1, 0.08, 0.05), AMBER = new THREE.Color(1, 0.62, 0.05), GREEN = new THREE.Color(0.1, 1, 0.35), OFF = new THREE.Color(0.08, 0.08, 0.08);
  const traffic = {
    phase: -1,
    // 14 s cycle: one direction green 6 s, amber 1 s, then the other way
    update(time) {
      const t = time % 14, ph = t < 6 ? 0 : t < 7 ? 1 : t < 13 ? 2 : 3;
      if (ph === this.phase) return; this.phase = ph;
      posts.forEach(([, , , dir], i) => {
        const go = dir === 0 ? ph : (ph + 2) % 4; // 0 green, 1 amber, else red
        lampI.setColorAt(i * 3, go >= 2 ? RED : OFF); lampI.setColorAt(i * 3 + 1, go === 1 ? AMBER : OFF); lampI.setColorAt(i * 3 + 2, go === 0 ? GREEN : OFF);
      });
      lampI.instanceColor.needsUpdate = true;
    },
  };

  // trees (park in SE block + street trees)
  const trunkMat = T.pbr(T.concreteTex(9, '#5a4632', false), { roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, vertexColors: true });
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.24, 3.2, 8); trunkGeo.translate(0, 1.6, 0);
  let leafGeo = new THREE.IcosahedronGeometry(1, 4);
  leafGeo.deleteAttribute('normal'); leafGeo.deleteAttribute('uv');
  leafGeo = mergeVertices(leafGeo);
  { // lumpy foliage with darker undersides
    const p = leafGeo.attributes.position; const v = new THREE.Vector3();
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = 1 + 0.12 * Math.sin(v.x * 6.1 + 1.3) * Math.cos(v.y * 5.3 + v.z * 4.7) + 0.06 * Math.sin(v.z * 13 + v.x * 11);
      v.multiplyScalar(n); p.setXYZ(i, v.x, v.y, v.z);
      const k = 0.55 + 0.45 * (v.y * 0.5 + 0.5);
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    leafGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    leafGeo.computeVertexNormals();
  }
  const treeSpots = [];
  const r = T.rng(42);
  for (let i = 0; i < 22; i++) treeSpots.push([8 + r() * 30, -8 - r() * 30]);
  for (const s of [-32, -20, 20, 32]) { treeSpots.push([6.8, s + 2.5], [-6.8, s - 2.5]); }
  for (const s of [-74, -59, 59, 74]) { treeSpots.push([s + 2.5, 6.8], [s - 2.5, -6.8]); }
  for (let i = 0; i < 9; i++) treeSpots.push([-79 + r() * 12, -20 + r() * 11]); // west pocket park
  for (const [ax, az, bx, bz] of PARKS) for (let i = 0; i < 5; i++) treeSpots.push([ax + 1 + r() * (bx - ax - 2), az + 1 + r() * (bz - az - 2)]);
  for (const s of [-74, -59, -30, -15, 15, 30, 59, 74]) treeSpots.push([s + 2.5, 50.8], [s - 2.5, -50.8]);
  for (const s of [-118, -103, -74, -59, -30, -15, 15, 30, 59, 74, 103, 118]) treeSpots.push([s + 2.5, 94.8], [s - 2.5, -94.8], [94.8, s - 2.5], [-94.8, s + 2.5]);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, treeSpots.length * 3);
  let li = 0; const c = new THREE.Color();
  treeSpots.forEach(([x, z], i) => {
    if (i < 22 && x < 22 && z > -23) { x += 14; } // keep clear of the corner shop
    const s = 0.8 + r() * 0.5;
    m4.compose(new THREE.Vector3(x, 0.1, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6), new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m4);
    for (let k = 0; k < 3; k++) {
      const ls = s * (1.3 + r() * 0.8);
      m4.compose(new THREE.Vector3(x + (r() - 0.5) * 1.6 * s, (3.6 + r() * 1.6) * s, z + (r() - 0.5) * 1.6 * s), new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 3, r() * 3, 0)), new THREE.Vector3(ls, ls * 0.85, ls));
      leaves.setMatrixAt(li, m4);
      c.setHSL(0.22 + r() * 0.06, 0.45 + r() * 0.15, 0.22 + r() * 0.08); leaves.setColorAt(li, c);
      li++;
    }
  });
  trunks.castShadow = leaves.castShadow = true; trunks.receiveShadow = leaves.receiveShadow = true;
  group.add(trunks, leaves);

  // distant hills to close the horizon
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x55663f, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + r() * 0.2, d = 470 + r() * 90;
    const h = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    h.scale.set(70 + r() * 60, 18 + r() * 25, 50 + r() * 40);
    h.position.set(Math.cos(a) * d, -2, Math.sin(a) * d); h.rotation.y = r() * 3;
    group.add(h);
  }

  scene.add(group);
  return { group, lampLights, traffic, wetMats, lampMats: { bulb: bulbMat, pool: poolMat } };
}
