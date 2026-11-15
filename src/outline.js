// Inverted-hull ink outline: a back-face shell pushed out along the normals in view space,
// widened with distance so the line stays roughly the same on screen. Toggle with setVisible.
import * as THREE from 'three';

export function addOutline(root, { thickness = 0.0035, color = 0x0d0b10 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uThick: { value: thickness }, uColor: { value: new THREE.Color(color) } },
    side: THREE.BackSide,
    vertexShader: `uniform float uThick;
      void main(){
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float w = uThick * clamp(-mv.z, 1.5, 30.0);
        mv.xyz += n * w;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, 1.0); }`,
  });
  const targets = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.noOutline || o.userData.isOutline) return;
    const m = o.material;
    if (m.transparent || m.blending === THREE.AdditiveBlending || (m.emissiveIntensity && m.emissiveIntensity > 1)) return;
    if (!o.geometry.attributes.normal) return;
    targets.push(o);
  });
  const shells = targets.map((o) => {
    const s = new THREE.Mesh(o.geometry, mat);
    s.userData.isOutline = true; s.castShadow = false; s.receiveShadow = false; s.raycast = () => {};
    o.add(s);
    return s;
  });
  return {
    material: mat,
    setVisible(v) { for (const s of shells) s.visible = v; },
  };
}
