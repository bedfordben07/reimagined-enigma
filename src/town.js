// Town layout: voxel buildings plus static scenery (roads, sidewalks, lamps, trees).
import * as THREE from 'three';
import { VS } from './voxels.js';
import * as T from './textures.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const MAT = { BRICK: 1, BRICK_TAN: 2, PLASTER: 3, PLASTER_BLUE: 4, CONCRETE: 5, TRIM: 6, GLASS: 7, ROOF: 8, SLAB: 9, TILE: 10, TRIM_DARK: 11, GLASS_LIT: 12 };

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
  const floors = o.floors;
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
      else if (ly === 0 && st > 0) m = per ? o.trim : MAT.SLAB;
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
            else if (ly >= 1 && ly <= 4 && u > 2 && u < L - 3) m = litHash(b, 0, Math.floor(u / 6), side) < 0.3 ? MAT.GLASS_LIT : MAT.GLASS;
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
}

// (called at the end of block) projecting cornice one block out around the roof line
function cornice(vox, x0, z0, W, D, y, m, b) {
  for (let z = -1; z <= D; z++) for (let x = -1; x <= W; x++) {
    if (x === -1 || x === W || z === -1 || z === D) vox.set(x0 + x, y, z0 + z, m, b);
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

export function buildVoxelTown(vox) {
  vox.reset();
  for (const o of [...LAYOUT, ...OUTER]) (o.t === 'house' ? house : block)(vox, o);
  return vox.finalize();
}

export function buildScenery(scene, renderer) {
  const group = new THREE.Group();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const setRep = (tex, r) => { for (const t of [tex.map, tex.normalMap, tex.ormMap]) { t.repeat.set(r[0], r[1]); t.anisotropy = aniso; } return tex; };

  // grass
  const grass = T.grassTex(3);
  const gSize = 900;
  setRep(grass, [gSize / 6, gSize / 6]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gSize, gSize), new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.normalMap, aoMap: grass.ormMap, roughnessMap: grass.ormMap, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground);

  // roads
  const asph = T.asphaltTex(4);
  const roadMat = (len) => {
    const m = new THREE.MeshStandardMaterial({ map: asph.map.clone(), normalMap: asph.normalMap.clone(), roughnessMap: asph.ormMap.clone(), roughness: 1 });
    m.aoMap = m.roughnessMap;
    for (const t of [m.map, m.normalMap, m.roughnessMap]) { t.repeat.set(10 / 6, len / 6); t.anisotropy = aniso; t.needsUpdate = true; }
    return m;
  };
  const roads = [ // [cx, cz, along x?, length]
    [0, 0, false, 230], [44, 0, false, 230], [-44, 0, false, 230], [88, 0, false, 230], [-88, 0, false, 230],
    [0, 0, true, 230], [0, 44, true, 230], [0, -44, true, 230], [0, 88, true, 230], [0, -88, true, 230],
  ];
  for (const [x, z, alongX, len] of roads) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(10, len), roadMat(len));
    r.rotation.x = -Math.PI / 2; if (alongX) r.rotation.z = Math.PI / 2;
    r.position.set(x, 0.012 + (alongX ? 0.001 : 0), z); r.receiveShadow = true; group.add(r);
  }
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
  for (const t of [swMat.map, swMat.normalMap, swMat.roughnessMap]) { t.repeat.set(1, 1); t.anisotropy = aniso; }
  const curbMat = T.pbr(T.concreteTex(8, '#a29f98', false));
  for (const bx of [-66, -22, 22, 66]) for (const bz of [-66, -22, 22, 66]) {
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
  for (const s of [-30, -15, 15, 30]) { lampPos.push([5.6, s, -1], [-5.6, s, 1], [s, 5.6, -2], [s, -5.6, 2]); }
  for (const s of [-80, -66, -52, 52, 66, 80]) { lampPos.push([s, 5.6, -2], [s, -5.6, 2], [5.6, s, -1], [-5.6, s, 1]); }
  for (const s of [-74, -52, -30, -15, 15, 30, 52, 74]) { lampPos.push([s, 49.6, -2], [s, -49.6, 2]); }
  for (const [x, z, f] of lampPos) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 10), poleMat); pole.position.y = 3; pole.castShadow = true; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), poleMat); arm.position.set(0.6, 5.9, 0); arm.castShadow = true; g.add(arm);
    const head = new THREE.Mesh(shadeGeo, poleMat); head.position.set(1.25, 5.82, 0); head.castShadow = true; g.add(head);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bulbMat); bulb.position.set(1.25, 5.8, 0); g.add(bulb);
    g.position.set(x, 0.15, z);
    g.rotation.y = f === -1 ? Math.PI : f === 1 ? 0 : f === -2 ? Math.PI / 2 : -Math.PI / 2;
    group.add(g);
    g.updateMatrixWorld(true);
    const bp = new THREE.Vector3(1.25, 5.7, 0).applyMatrix4(g.matrixWorld);
    lampLights.push(bp);
    const pool = new THREE.Mesh(poolGeo, poolMat); pool.position.set(bp.x, 0.17, bp.z); pool.renderOrder = 1; group.add(pool);
  }

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
    const a = (i / 14) * Math.PI * 2 + r() * 0.2, d = 260 + r() * 80;
    const h = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    h.scale.set(70 + r() * 60, 18 + r() * 25, 50 + r() * 40);
    h.position.set(Math.cos(a) * d, -2, Math.sin(a) * d); h.rotation.y = r() * 3;
    group.add(h);
  }

  scene.add(group);
  return { group, lampLights };
}
