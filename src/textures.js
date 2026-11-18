// Procedural PBR textures, generated on canvases at startup (no image downloads).
import * as THREE from 'three';

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// Tileable multi-octave value noise in [0,1].
export function noise2D(n, seed, startCells = 4, octaves = 5, persistence = 0.5) {
  const out = new Float32Array(n * n);
  const r = rng(seed);
  let amp = 1, total = 0, cells = startCells;
  for (let o = 0; o < octaves && cells <= n; o++) {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = r();
    const step = n / cells;
    for (let y = 0; y < n; y++) {
      const gy = y / step, y0 = Math.floor(gy), fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      const ya = (y0 % cells) * cells, yb = ((y0 + 1) % cells) * cells;
      for (let x = 0; x < n; x++) {
        const gx = x / step, x0 = Math.floor(gx), fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const xa = x0 % cells, xb = (x0 + 1) % cells;
        const a = g[ya + xa], b = g[ya + xb], c = g[yb + xa], d = g[yb + xb];
        out[y * n + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
      }
    }
    total += amp; amp *= persistence; cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Build textures from a per-pixel painter: paint(x,y) -> [r,g,b, height, rough, metal]
function build(n, paint, { normalStrength = 2, repeat = 1, srgb = true, aoStrength = 2.2, aoRadius = 6 } = {}) {
  const cC = document.createElement('canvas'); cC.width = cC.height = n;
  const cN = document.createElement('canvas'); cN.width = cN.height = n;
  const cR = document.createElement('canvas'); cR.width = cR.height = n;
  const ctxC = cC.getContext('2d'), ctxN = cN.getContext('2d'), ctxR = cR.getContext('2d');
  const iC = ctxC.createImageData(n, n), iN = ctxN.createImageData(n, n), iR = ctxR.createImageData(n, n);
  const H = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const p = paint(x, y);
      const i = y * n + x, o = i * 4;
      iC.data[o] = clamp01(p[0]) * 255; iC.data[o + 1] = clamp01(p[1]) * 255; iC.data[o + 2] = clamp01(p[2]) * 255; iC.data[o + 3] = 255;
      H[i] = p[3];
      iR.data[o] = 255; iR.data[o + 1] = clamp01(p[4]) * 255; iR.data[o + 2] = clamp01(p[5] || 0) * 255; iR.data[o + 3] = 255;
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const xl = H[y * n + ((x - 1 + n) % n)], xr = H[y * n + ((x + 1) % n)];
      const yu = H[((y - 1 + n) % n) * n + x], yd = H[((y + 1) % n) * n + x];
      let nx = -(xr - xl) * normalStrength, ny = (yd - yu) * normalStrength, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const o = (y * n + x) * 4;
      iN.data[o] = (nx * 0.5 + 0.5) * 255; iN.data[o + 1] = (ny * 0.5 + 0.5) * 255; iN.data[o + 2] = (nz * 0.5 + 0.5) * 255; iN.data[o + 3] = 255;
    }
  }
  // Ambient occlusion from the height field: cavities lower than their surroundings get darker.
  // Stored in the red channel so one texture serves as aoMap (R), roughnessMap (G) and metalnessMap (B).
  const tmpB = new Float32Array(n * n), blur = new Float32Array(n * n), r = aoRadius, w = 2 * r + 1;
  for (let y = 0; y < n; y++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += H[y * n + ((k + n) % n)];
    for (let x = 0; x < n; x++) {
      tmpB[y * n + x] = acc / w;
      acc += H[y * n + ((x + r + 1) % n)] - H[y * n + ((x - r + n) % n)];
    }
  }
  for (let x = 0; x < n; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmpB[((k + n) % n) * n + x];
    for (let y = 0; y < n; y++) {
      blur[y * n + x] = acc / w;
      acc += tmpB[((y + r + 1) % n) * n + x] - tmpB[((y - r + n) % n) * n + x];
    }
  }
  for (let i = 0; i < n * n; i++) iR.data[i * 4] = clamp01(1 - Math.max(0, blur[i] - H[i]) * aoStrength) * 255;
  ctxC.putImageData(iC, 0, 0); ctxN.putImageData(iN, 0, 0); ctxR.putImageData(iR, 0, 0);
  const mk = (c, isColor) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    if (isColor && srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  return { map: mk(cC, true), normalMap: mk(cN, false), ormMap: mk(cR, false) };
}

// Soft darkening near a voxel face edge so individual blocks read in the light.
function edge(x, y, n, w) {
  const d = Math.min(x, y, n - 1 - x, n - 1 - y);
  return d >= w ? 1 : 0.78 + 0.22 * (d / w);
}

function hexRGB(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

// ---------- voxel face textures (one texture = one 0.5 m face) ----------
export function brickTex(seed, baseHex, mortarHex = '#b9b2a6') {
  const n = 256, base = hexRGB(baseHex), mort = hexRGB(mortarHex);
  const nz = noise2D(n, seed, 8, 5), fine = noise2D(n, seed + 7, 64, 2);
  const r = rng(seed + 3);
  const rows = 8, cols = 2, bh = n / rows, bw = n / cols, m = 3;
  const tint = [];
  for (let i = 0; i < rows * (cols + 1); i++) tint.push([0.8 + r() * 0.3, 0.9 + r() * 0.15, r()]);
  return build(n, (x, y) => {
    const row = Math.floor(y / bh), off = (row % 2) * bw * 0.5;
    const xx = (x + off) % n, col = Math.floor(xx / bw);
    const ly = y - row * bh, lx = xx - col * bw;
    const isM = ly < m || lx < m;
    const f = fine[y * n + x], v = nz[y * n + x];
    if (isM) {
      const k = 0.85 + f * 0.25;
      return [mort[0] * k, mort[1] * k, mort[2] * k, 0.15 + f * 0.1, 0.97, 0];
    }
    const t = tint[(row * (cols + 1) + col) % tint.length];
    const k = t[0] * (0.82 + v * 0.35) * (0.92 + f * 0.16);
    const chip = f > 0.86 ? 0.75 : 1;
    return [base[0] * k * chip, base[1] * k * t[1] * chip, base[2] * k * t[1] * chip, 0.75 + v * 0.25 - (chip < 1 ? 0.2 : 0), 0.82 + f * 0.12, 0];
  }, { normalStrength: 3 });
}

export function plasterTex(seed, baseHex) {
  const n = 256, base = hexRGB(baseHex);
  const nz = noise2D(n, seed, 4, 6, 0.55), fine = noise2D(n, seed + 11, 64, 3);
  return build(n, (x, y) => {
    const v = nz[y * n + x], f = fine[y * n + x];
    const e = edge(x, y, n, 5);
    const k = (0.88 + v * 0.18 + (f - 0.5) * 0.06) * e;
    const dirt = clamp01((y / n) * 0.15 * v);
    return [base[0] * k - dirt * 0.1, base[1] * k - dirt * 0.1, base[2] * k - dirt * 0.12, f * 0.6 + v * 0.4 - (e < 1 ? 0.3 : 0), 0.88 + f * 0.1, 0];
  }, { normalStrength: 1.6 });
}

export function concreteTex(seed, baseHex, seam = true) {
  const n = 256, base = hexRGB(baseHex);
  const nz = noise2D(n, seed, 4, 6, 0.6), fine = noise2D(n, seed + 5, 128, 2);
  const r = rng(seed + 9); const pores = new Set();
  for (let i = 0; i < 260; i++) pores.add(Math.floor(r() * n) * n + Math.floor(r() * n));
  return build(n, (x, y) => {
    const v = nz[y * n + x], f = fine[y * n + x];
    const e = seam ? edge(x, y, n, 4) : 1;
    const pore = pores.has(y * n + x) || pores.has(y * n + x + 1) ? 0.6 : 1;
    const k = (0.8 + v * 0.3 + (f - 0.5) * 0.1) * e * pore;
    return [base[0] * k, base[1] * k, base[2] * k, v * 0.7 + f * 0.3 - (pore < 1 ? 0.4 : 0) - (e < 1 ? 0.3 : 0), 0.84 + f * 0.12, 0];
  }, { normalStrength: 2 });
}

export function glassTex(seed) {
  const n = 256;
  const nz = noise2D(n, seed, 2, 4);
  const frame = hexRGB('#2c3034'), pane = hexRGB('#6f8aa3');
  const fw = 14;
  return build(n, (x, y) => {
    const d = Math.min(x, y, n - 1 - x, n - 1 - y);
    const v = nz[y * n + x];
    if (d < fw) {
      const bevel = d < 3 ? 0.6 : 1;
      return [frame[0] * bevel, frame[1] * bevel, frame[2] * bevel, d < 3 ? 0.4 : 1, 0.45, 0.6];
    }
    // smudges + sky-ish gradient
    const k = 0.8 + v * 0.3;
    return [pane[0] * k, pane[1] * k, pane[2] * k * 1.05, 0.55, 0.06 + v * 0.08, 1];
  }, { normalStrength: 4 });
}

export function roofTex(seed) {
  const n = 256; const base = hexRGB('#4b4d50');
  const nz = noise2D(n, seed, 4, 5), fine = noise2D(n, seed + 1, 128, 2);
  return build(n, (x, y) => {
    const v = nz[y * n + x], f = fine[y * n + x];
    const g = f > 0.7 ? 1.25 : f < 0.25 ? 0.7 : 1;
    const k = (0.75 + v * 0.35) * g;
    return [base[0] * k, base[1] * k, base[2] * k * 1.02, f, 0.9, 0];
  }, { normalStrength: 3 });
}

export function tileTex(seed) {
  const n = 256; const base = hexRGB('#a4523a');
  const nz = noise2D(n, seed, 4, 5);
  const rows = 4, bh = n / rows, cols = 3, bw = n / cols;
  return build(n, (x, y) => {
    const row = Math.floor(y / bh), off = (row % 2) * bw * 0.5;
    const xx = (x + off) % n, col = Math.floor(xx / bw), lx = (xx - col * bw) / bw, ly = (y - row * bh) / bh;
    const curve = Math.sin(lx * Math.PI);
    const shade = 0.6 + 0.4 * curve * (0.6 + ly * 0.4);
    const v = nz[y * n + x];
    const k = shade * (0.8 + v * 0.35) * (ly > 0.9 ? 0.6 : 1);
    return [base[0] * k, base[1] * k, base[2] * k, curve * 0.8 + ly * 0.3, 0.7, 0];
  }, { normalStrength: 3 });
}

// ---------- ground textures (tiling) ----------
export function grassTex(seed) {
  const n = 512;
  const nz = noise2D(n, seed, 4, 6, 0.55), fine = noise2D(n, seed + 3, 256, 1), mid = noise2D(n, seed + 8, 32, 3);
  const g1 = hexRGB('#4e6b2c'), g2 = hexRGB('#7d8f3e'), dirt = hexRGB('#6b5a3e');
  return build(n, (x, y) => {
    const v = nz[y * n + x], f = fine[y * n + x], m = mid[y * n + x];
    const t = clamp01(v * 1.4 - 0.2);
    let c = [g1[0] + (g2[0] - g1[0]) * t, g1[1] + (g2[1] - g1[1]) * t, g1[2] + (g2[2] - g1[2]) * t];
    const d = clamp01((0.35 - m) * 4);
    c = [c[0] + (dirt[0] - c[0]) * d, c[1] + (dirt[1] - c[1]) * d, c[2] + (dirt[2] - c[2]) * d];
    const blade = 0.75 + f * 0.5;
    return [c[0] * blade, c[1] * blade, c[2] * blade, f * 0.7 + v * 0.3, 0.95, 0];
  }, { normalStrength: 2.5, repeat: 1 });
}

export function asphaltTex(seed) {
  const n = 512; const base = hexRGB('#3b3c3e');
  const nz = noise2D(n, seed, 4, 6), fine = noise2D(n, seed + 1, 256, 1), patch = noise2D(n, seed + 4, 8, 3);
  return build(n, (x, y) => {
    const v = nz[y * n + x], f = fine[y * n + x], p = patch[y * n + x];
    const agg = f > 0.78 ? 1.35 : f < 0.2 ? 0.75 : 1;
    const k = (0.78 + v * 0.3) * agg * (p > 0.62 ? 0.82 : 1);
    return [base[0] * k, base[1] * k, base[2] * k * 1.03, f * 0.8 + v * 0.2, 0.78 + f * 0.15 - (p > 0.62 ? 0.15 : 0), 0];
  }, { normalStrength: 3 });
}

export function paverTex(seed) {
  const n = 512; const base = hexRGB('#a19c93');
  const nz = noise2D(n, seed, 8, 5), fine = noise2D(n, seed + 2, 128, 2);
  const r = rng(seed); const tints = []; for (let i = 0; i < 16; i++) tints.push(0.88 + r() * 0.18);
  const cells = 4, s = n / cells;
  return build(n, (x, y) => {
    const cx = Math.floor(x / s), cy = Math.floor(y / s), lx = x - cx * s, ly = y - cy * s;
    const d = Math.min(lx, ly, s - 1 - lx, s - 1 - ly);
    const v = nz[y * n + x], f = fine[y * n + x];
    if (d < 3) return [0.32, 0.31, 0.29, 0.1, 0.95, 0];
    const k = tints[cy * cells + cx] * (0.85 + v * 0.25) * (d < 7 ? 0.9 : 1);
    return [base[0] * k, base[1] * k, base[2] * k, 0.8 + f * 0.2, 0.85, 0];
  }, { normalStrength: 2.5 });
}

// ---------- character textures ----------
export function scuffTex(seed, baseHex) {
  const n = 512; const base = hexRGB(baseHex);
  const c = document.createElement('canvas'); c.width = c.height = n;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex; ctx.fillRect(0, 0, n, n);
  const r = rng(seed);
  const nz = noise2D(n, seed, 4, 5);
  const img = ctx.getImageData(0, 0, n, n);
  for (let i = 0; i < n * n; i++) {
    const k = 0.9 + nz[i] * 0.12;
    img.data[i * 4] = base[0] * 255 * k; img.data[i * 4 + 1] = base[1] * 255 * k; img.data[i * 4 + 2] = base[2] * 255 * k;
  }
  ctx.putImageData(img, 0, 0);
  ctx.lineCap = 'round';
  for (let i = 0; i < 160; i++) {
    const x = r() * n, y = r() * n, l = 4 + r() * 22, a = r() * Math.PI;
    ctx.strokeStyle = `rgba(${r() < 0.5 ? '70,72,74' : '120,110,100'},${0.15 + r() * 0.35})`;
    ctx.lineWidth = 0.6 + r() * 1.4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  for (let i = 0; i < 40; i++) {
    const x = r() * n, y = r() * n, rad = 6 + r() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(90,80,70,0.18)'); g.addColorStop(1, 'rgba(90,80,70,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

export function fabricTex(seed, baseHex = '#6b7550') {
  const n = 256; const base = hexRGB(baseHex);
  const nz = noise2D(n, seed, 8, 4);
  return build(n, (x, y) => {
    const w = (Math.sin(x * 0.8) * 0.5 + 0.5) * (Math.sin(y * 0.8 + 1.5) * 0.5 + 0.5);
    const v = nz[y * n + x];
    const k = 0.82 + w * 0.15 + v * 0.15;
    return [base[0] * k, base[1] * k, base[2] * k, w * 0.6 + v * 0.4, 0.95, 0];
  }, { normalStrength: 3.5 });
}

export function dummyTex(markerOnly = false) {
  const n = 256;
  const c = document.createElement('canvas'); c.width = c.height = n;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e9b52a'; ctx.fillRect(0, 0, n, n);
  const nz = noise2D(n, 77, 4, 4);
  const img = ctx.getImageData(0, 0, n, n);
  for (let i = 0; i < n * n; i++) { const k = 0.93 + nz[i] * 0.1; img.data[i * 4] *= k; img.data[i * 4 + 1] *= k; img.data[i * 4 + 2] *= k; }
  ctx.putImageData(img, 0, 0);
  const cx = n / 2, cy = n / 2, R = markerOnly ? n * 0.3 : n * 0.22;
  ctx.fillStyle = '#121212';
  ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f0c030';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#121212';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, 0, Math.PI / 2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, Math.PI, Math.PI * 1.5); ctx.closePath(); ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function radialTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', n = 128) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function scorchTex() {
  const n = 128;
  const c = document.createElement('canvas'); c.width = c.height = n;
  const ctx = c.getContext('2d');
  const nz = noise2D(n, 31, 4, 4);
  const img = ctx.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot(x - n / 2, y - n / 2) / (n / 2);
    const a = clamp01((1 - d) * 1.6 * (0.6 + nz[y * n + x] * 0.6));
    const o = (y * n + x) * 4;
    img.data[o] = 18; img.data[o + 1] = 14; img.data[o + 2] = 10; img.data[o + 3] = a * 235;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Brushed metal: fine directional streaks in roughness and normal, light wear on edges.
export function brushedMetalTex(seed, baseHex, roughness = 0.35) {
  const n = 256, base = hexRGB(baseHex);
  const r = rng(seed);
  const streak = new Float32Array(n);
  for (let y = 0; y < n; y++) streak[y] = r();
  const nz = noise2D(n, seed, 4, 4), fine = noise2D(n, seed + 3, 128, 2);
  return build(n, (x, y) => {
    const s = streak[y] * 0.6 + streak[(y + 1) % n] * 0.4;
    const v = nz[y * n + x], f = fine[y * n + x];
    const k = 0.9 + s * 0.12 + (v - 0.5) * 0.1;
    return [base[0] * k, base[1] * k, base[2] * k, s * 0.5 + f * 0.15, roughness - 0.08 + s * 0.12 + v * 0.06, 1];
  }, { normalStrength: 1.2, aoStrength: 0.6 });
}

// Matte painted armour: soft mottling, micro-scratches in roughness.
export function paintedArmorTex(seed, baseHex, roughness = 0.45) {
  const n = 512, base = hexRGB(baseHex);
  const nz = noise2D(n, seed, 4, 5), fine = noise2D(n, seed + 9, 256, 1);
  const r = rng(seed + 1);
  const scratches = new Uint8Array(n * n);
  for (let i = 0; i < 180; i++) {
    let x = r() * n, y = r() * n; const a = r() * Math.PI, l = 6 + r() * 30;
    for (let t = 0; t < l; t++) { scratches[(Math.floor(y + Math.sin(a) * t + n) % n) * n + Math.floor(x + Math.cos(a) * t + n) % n] = 1; }
  }
  return build(n, (x, y) => {
    const i = y * n + x, v = nz[i], f = fine[i], sc = scratches[i];
    const k = (0.93 + v * 0.1) * (sc ? 1.12 : 1);
    return [base[0] * k, base[1] * k, base[2] * k, v * 0.3 + f * 0.05 - sc * 0.15, roughness - 0.05 + v * 0.1 - sc * 0.15, sc ? 0.4 : 0];
  }, { normalStrength: 1.0, aoStrength: 0.8 });
}

// Wire a generated texture set into a PBR material (map, normal, AO, roughness, metalness).
export function pbr(tex, params = {}, Mat = THREE.MeshStandardMaterial) {
  return new Mat({ map: tex.map, normalMap: tex.normalMap, aoMap: tex.ormMap, roughnessMap: tex.ormMap, metalnessMap: tex.ormMap, roughness: 1, metalness: 0, ...params });
}

// Emissive mask for lit windows: glowing pane with a soft warm gradient, dark frame.
export function windowGlowTex() {
  const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, n, n);
  const g = x.createLinearGradient(0, 0, 0, n);
  g.addColorStop(0, '#6a5a48'); g.addColorStop(0.6, '#ffffff'); g.addColorStop(1, '#c9b8a0');
  x.fillStyle = g; x.fillRect(8, 8, n - 16, n - 16);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Hazard stripes (yellow / black diagonals) for the dummy's armour.
export function hazardTex() {
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d');
  x.fillStyle = '#efb622'; x.fillRect(0, 0, n, n);
  x.fillStyle = '#141414';
  for (let i = -n; i < n * 2; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 32, 0); x.lineTo(i + 32 - n, n); x.lineTo(i - n, n); x.closePath(); x.fill(); }
  const nz = noise2D(n, 91, 4, 4), img = x.getImageData(0, 0, n, n);
  for (let i = 0; i < n * n; i++) { const k = 0.9 + nz[i] * 0.14; img.data[i * 4] *= k; img.data[i * 4 + 1] *= k; img.data[i * 4 + 2] *= k; }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// Striped canvas awning (one 0.5 m voxel face = two stripes).
export function awningTex(hexA, hexB, seed) {
  const n = 128, a = hexRGB(hexA), b = hexRGB(hexB);
  const nz = noise2D(n, seed, 4, 3);
  return build(n, (x, y) => {
    const c = Math.floor(x / (n / 2)) % 2 ? a : b;
    const v = nz[y * n + x], fold = 0.85 + 0.15 * Math.sin((x % (n / 2)) / (n / 2) * Math.PI);
    const k = (0.88 + v * 0.18) * fold * (y > n - 10 ? 0.75 : 1);
    return [c[0] * k, c[1] * k, c[2] * k, fold * 0.6 + v * 0.2, 0.9, 0];
  }, { normalStrength: 2 });
}

// Shop sign panel: glowing face with a dark border; the colour comes from the material's emissive.
export function signTex() {
  const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d');
  x.fillStyle = '#111'; x.fillRect(0, 0, n, n);
  x.fillStyle = '#fff'; x.fillRect(0, 18, n, n - 36);
  x.fillStyle = '#000'; for (let i = 0; i < 6; i++) x.fillRect(10 + i * 20, 46, 12, 36); // letter blocks
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Weathered vertical planks (water towers).
export function woodTex(seed) {
  const n = 256, base = hexRGB('#7a5636');
  const nz = noise2D(n, seed, 4, 5), grain = noise2D(n, seed + 4, 8, 4);
  const r = rng(seed); const tints = []; for (let i = 0; i < 8; i++) tints.push(0.8 + r() * 0.3);
  return build(n, (x, y) => {
    const plank = Math.floor(x / 32), lx = x % 32;
    const v = nz[y * n + x], g = grain[(y * 3 % n) * n + x];
    const k = tints[plank] * (0.82 + v * 0.2 + Math.sin(y * 0.15 + g * 6) * 0.05) * (lx < 2 ? 0.55 : 1);
    return [base[0] * k, base[1] * k, base[2] * k, lx < 2 ? 0.1 : 0.7 + g * 0.3, 0.85, 0];
  }, { normalStrength: 2.5 });
}
