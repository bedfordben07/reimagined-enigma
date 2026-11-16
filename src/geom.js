// Shared shape builders for the characters: smooth lathes, beveled extrusions, cables.
import * as THREE from 'three';

export const V2 = (x, y) => new THREE.Vector2(x, y);

// Lathe around Y from [radius, y] pairs. `smooth` runs a spline through the profile first for
// organic, sculpted curves. Faces outward regardless of profile direction.
export function lathe(profile, seg = 48, phiStart = 0, phiLen = Math.PI * 2, smooth = 0) {
  if (profile[0][1] > profile[profile.length - 1][1]) profile = [...profile].reverse();
  let pts = profile.map(([r, y]) => V2(Math.max(0, r), y));
  if (smooth) pts = new THREE.SplineCurve(pts).getPoints(profile.length * smooth).map((p) => V2(Math.max(0, p.x), p.y));
  const g = new THREE.LatheGeometry(pts, seg, phiStart, phiLen);
  g.computeVertexNormals();
  return g;
}

// Extrude a 2D outline with a soft bevel, centred on its depth.
export function extrude(shape, depth, bevel = 0.02, segs = 4) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 24 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

export function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// Mirror-symmetric outline from right-half points (bottom to top), x >= 0.
export function symShape(pts) {
  const s = new THREE.Shape();
  s.moveTo(-pts[0][0], pts[0][1]);
  for (const [x, y] of pts) s.lineTo(x, y);
  for (let i = pts.length - 1; i >= 0; i--) s.lineTo(-pts[i][0], pts[i][1]);
  return s;
}
export function smoothSym(pts, div = 6) {
  const curve = new THREE.SplineCurve(pts.map(([x, y]) => V2(x, y)));
  return symShape(curve.getPoints(pts.length * div).map((p) => [p.x, p.y]));
}
// Closed smooth outline through points (any shape, not mirrored).
export function smoothShape(pts, div = 8) {
  const curve = new THREE.SplineCurve([...pts, pts[0]].map(([x, y]) => V2(x, y)));
  return new THREE.Shape(curve.getPoints(pts.length * div));
}

// A cable/hose along points.
export function cable(points, r = 0.012, seg = 24) {
  const c = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return new THREE.TubeGeometry(c, seg, r, 8, false);
}

// Mesh factory bound to a parent with shadows on.
export function mesher() {
  return (geo, mat, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  };
}
export const toX = (g) => g.rotateZ(Math.PI / 2);
export const toZ = (g) => g.rotateX(Math.PI / 2);
