// The floating Atlantis island: dusk sky with stars, animated sea, cliffs, waterfalls, canal ring, plaza, painted trees.
import * as THREE from "three";
import { M, Merger, uv } from "./kit.js";
import * as T from "../textures.js";

export const R = 150;           // island top radius
export const CANAL = [47, 53];  // canal ring (inner, outer)
export const BRIDGES = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
export const PLAZA = 46;

export function sky(scene) {
  const g = new THREE.SphereGeometry(1400, 32, 16);
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { t: { value: 0 }, dark: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `varying vec3 vP; uniform float t; uniform float dark;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){ float y = vP.y;
        vec3 top = vec3(0.07,0.10,0.28), mid = vec3(0.36,0.33,0.62), hor = vec3(1.0,0.62,0.38), low = vec3(0.95,0.45,0.35);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.25, y)); c = mix(c, top, smoothstep(0.22, 0.75, y)); c = mix(low, c, smoothstep(-0.1, 0.03, y));
        // sun glow (west, low)
        vec3 sd = normalize(vec3(-0.75, 0.12, 0.45)); float s = max(dot(vP, sd), 0.); c += vec3(1.0,0.7,0.35) * pow(s, 40.) * 0.9 + vec3(1.,.5,.3)*pow(s,6.)*0.25;
        // stars above
        vec3 q = floor(vP * 420.); float st = step(0.9965, h(q)) * smoothstep(0.18, 0.6, y) * (0.6 + 0.4*sin(t*2. + h(q)*40.));
        c += vec3(st);
        c = mix(c, vec3(0.12,0.1,0.13) + c*0.25, dark);
        gl_FragColor = vec4(c, 1.); }` });
  const s = new THREE.Mesh(g, m); s.renderOrder = -1; scene.add(s); return s;
}

export function sea(scene) {
  const g = new THREE.PlaneGeometry(3000, 3000, 1, 1); g.rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({ fog: true, uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { t: { value: 0 } }]),
    vertexShader: `varying vec3 vW; #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition; #include <fog_vertex> }`.replace(/#include <(\w+)>/g, "\n#include <$1>\n"),
    fragmentShader: `uniform float t; varying vec3 vW; #include <fog_pars_fragment>
      float n(vec2 p){ return sin(p.x)*sin(p.y); }
      void main(){ vec2 p = vW.xz * 0.05; float w = n(p*1.3 + t*0.4) + 0.5*n(p*2.7 - t*0.6) + 0.25*n(p*5.1 + vec2(t*0.9, -t*0.3));
        float r = length(vW.xz);
        vec3 deep = vec3(0.05,0.28,0.45), shal = vec3(0.12,0.62,0.72);
        vec3 c = mix(deep, shal, 0.5 + 0.25*w);
        c += vec3(1.0,0.75,0.5) * pow(max(w,0.), 6.) * 0.35; // sunset glints
        float foam = smoothstep(R+28., R+18., r) * (0.5 + 0.5*sin(r*1.4 - t*2.)); c = mix(c, vec3(0.92,0.98,1.), foam*0.55);
        gl_FragColor = vec4(c,1.); #include <fog_fragment> }`.replace(/R\+/g, R.toFixed(1) + "+").replace(/#include <(\w+)>/g, "\n#include <$1>\n") });
  const s = new THREE.Mesh(g, m); s.position.y = -38; scene.add(s); return s;
}

export function islandMesh(scene) {
  const grp = new THREE.Group();
  // grass top with a soft painted dome shape
  const top = new THREE.CircleGeometry(R, 96); top.rotateX(-Math.PI / 2); uv(top, 1, 1);
  const tm = new THREE.Mesh(top, M.grass); tm.receiveShadow = true; grp.add(tm);
  // cliff: tapered rocky underside
  const pts = []; const prof = [[R, 0], [R + 1.5, -2], [R - 1, -8], [R + 2, -14], [R - 6, -24], [R - 20, -36], [R - 50, -52], [R - 95, -74], [10, -92], [0, -95]];
  for (const [x, y] of prof) pts.push(new THREE.Vector2(x, y));
  const cl = new THREE.LatheGeometry(pts, 96); const p = cl.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i); if (y < -0.5) { const a = Math.atan2(z, x), f = 1 + 0.03 * Math.sin(a * 23) + 0.02 * Math.sin(a * 57 + y); p.setX(i, x * f); p.setZ(i, z * f); } }
  cl.computeVertexNormals(); uv(cl, 10, 3);
  const cm = new THREE.Mesh(cl, M.rock); cm.receiveShadow = true; grp.add(cm);
  // marble rim wall with gold cap
  const m = new Merger();
  m.add(uv(new THREE.CylinderGeometry(R + 0.4, R + 0.4, 1.0, 128, 1, true), 60, 0.3), M.marbleWarm, 0, 0.5, 0);
  m.add(new THREE.TorusGeometry(R + 0.4, 0.18, 6, 160), M.gold, 0, 1.0, 0, 0, 1, 1, 1, Math.PI / 2);
  // plaza paving + canal
  const pl = new THREE.CircleGeometry(CANAL[0], 64); pl.rotateX(-Math.PI / 2); uv(pl, 12, 12); m.add(pl, M.paving, 0, 0.03, 0);
  const ring = new THREE.RingGeometry(CANAL[1], CANAL[1] + 3, 96, 1); ring.rotateX(-Math.PI / 2); uv(ring, 30, 1); m.add(ring, M.paving, 0, 0.03, 0);
  // canal walls
  m.add(uv(new THREE.CylinderGeometry(CANAL[0], CANAL[0], 1.6, 96, 1, true), 40, 0.4), M.marble, 0, -0.75, 0);
  m.add(uv(new THREE.CylinderGeometry(CANAL[1], CANAL[1], 1.6, 96, 1, true), 40, 0.4), M.marble, 0, -0.75, 0);
  m.add(new THREE.TorusGeometry(CANAL[0], 0.15, 6, 120), M.gold, 0, 0.05, 0, 0, 1, 1, 1, Math.PI / 2);
  m.add(new THREE.TorusGeometry(CANAL[1], 0.15, 6, 120), M.gold, 0, 0.05, 0, 0, 1, 1, 1, Math.PI / 2);
  // bridges: arched marble with balustrades
  for (const a of BRIDGES) {
    const cx = Math.sin(a) * 50, cz = -Math.cos(a) * 50;
    m.add(uv(new THREE.BoxGeometry(5, 0.5, 9), 1, 2), M.marble, cx, 0.25, cz, -a);
    for (const s of [-1, 1]) { const ox = Math.cos(a) * s * 2.4, oz = Math.sin(a) * s * 2.4;
      m.add(new THREE.BoxGeometry(0.25, 0.9, 9), M.marbleWarm, cx + ox, 0.95, cz + oz, -a);
      m.add(new THREE.BoxGeometry(0.35, 0.12, 9.2), M.gold, cx + ox, 1.45, cz + oz, -a); }
  }
  grp.add(m.build(false, true));
  // canal water
  const wg = new THREE.RingGeometry(CANAL[0], CANAL[1], 96, 1); wg.rotateX(-Math.PI / 2);
  const wm = new THREE.MeshStandardMaterial({ map: T.water(), color: 0x7fdcf0, roughness: 0.15, metalness: 0.2, emissive: 0x0a3a50, emissiveIntensity: 0.4 });
  wm.map.repeat.set(8, 1);
  const w = new THREE.Mesh(wg, wm); w.position.y = -0.6; grp.add(w); grp.userData.canal = wm;
  scene.add(grp); return grp;
}

export function waterfalls(scene) {
  const tex = T.waterfall(); const mats = [];
  const grp = new THREE.Group();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2;
    const g = new THREE.CylinderGeometry(R + 1.2, R - 30, 40, 10, 1, true, a, 0.09); g.translate(0, -20, 0);
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const mesh = new THREE.Mesh(g, m); grp.add(mesh);
    // mist at the bottom
    const mist = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
    mist.position.set(Math.cos(-a - 0.045 + Math.PI / 2) * 0, -38, 0);
    const mid = a + 0.045; mist.position.set(Math.sin(mid) * (R - 28), -38, Math.cos(mid) * (R - 28)); mist.scale.set(1.6, 0.4, 1.6); grp.add(mist);
    // spill lip channel on the top
    const ch = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 14), new THREE.MeshStandardMaterial({ map: T.water(), color: 0x9fe8ff, emissive: 0x0a3a50, emissiveIntensity: 0.4 }));
    ch.position.set(Math.sin(mid) * (R - 6), 0.08, Math.cos(mid) * (R - 6)); ch.rotation.y = mid; grp.add(ch);
  }
  scene.add(grp); grp.userData.tex = tex; return grp;
}

// painted trees: olive (round layered) and cypress (tall flame), instanced
export function trees(scene, spots) {
  const grp = new THREE.Group();
  const trunkG = new THREE.CylinderGeometry(0.18, 0.32, 3, 7); trunkG.translate(0, 1.5, 0);
  const blob = new THREE.IcosahedronGeometry(1, 2); { const p = blob.attributes.position; for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); const f = 1 + 0.13 * Math.sin(v.x * 7 + v.y * 5) * Math.cos(v.z * 6); v.multiplyScalar(f); p.setXYZ(i, v.x, v.y, v.z); } blob.computeVertexNormals(); }
  const cyp = new THREE.ConeGeometry(1, 1, 10, 4); { const p = cyp.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const f = 1 + 0.25 * Math.sin((y + 0.5) * Math.PI) ; p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); } cyp.computeVertexNormals(); cyp.translate(0, 0.5, 0); }
  const olive = spots.filter((s) => s.k === "olive"), cypress = spots.filter((s) => s.k !== "olive");
  const tr = new THREE.InstancedMesh(trunkG, M.trunk, spots.length);
  const lb = new THREE.InstancedMesh(blob, M.leafOlive, olive.length * 4);
  const cy = new THREE.InstancedMesh(cyp, M.leafCypress, cypress.length);
  const o = new THREE.Object3D(); let ti = 0, bi = 0, ci = 0; const col = new THREE.Color();
  for (const s of spots) {
    o.position.set(s.x, 0, s.z); o.rotation.set(0, s.r || 0, 0); o.scale.setScalar(s.s || 1); o.updateMatrix(); tr.setMatrixAt(ti++, o.matrix);
    if (s.k === "olive") for (let k = 0; k < 4; k++) {
      const a = k * 2.1 + (s.r || 0), rr = k ? 1.1 : 0; o.position.set(s.x + Math.cos(a) * rr * s.s, (3.2 + (k ? 0 : 0.9)) * s.s, s.z + Math.sin(a) * rr * s.s);
      o.scale.set(1.9 * s.s, 1.35 * s.s, 1.9 * s.s); o.updateMatrix(); lb.setMatrixAt(bi, o.matrix); lb.setColorAt(bi++, col.setHSL(0.24 + Math.random() * 0.05, 0.45, 0.42 + Math.random() * 0.12));
    } else { o.position.set(s.x, 1.2 * s.s, s.z); o.scale.set(1.2 * s.s, 7.5 * s.s, 1.2 * s.s); o.updateMatrix(); cy.setMatrixAt(ci, o.matrix); cy.setColorAt(ci++, col.setHSL(0.33 + Math.random() * 0.04, 0.4, 0.3 + Math.random() * 0.08)); }
  }
  for (const m of [tr, lb, cy]) { m.castShadow = true; m.receiveShadow = true; grp.add(m); }
  scene.add(grp); return grp;
}

// low hedges + flower beds around the plaza ring for the WoW-painted density
export function bushes(scene, spots) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ map: T.foliage(100), roughness: 1 }), spots.length);
  const o = new THREE.Object3D(), col = new THREE.Color();
  spots.forEach((s, i) => { o.position.set(s.x, 0.4 * s.s, s.z); o.scale.set(1.2 * s.s, 0.8 * s.s, 1.2 * s.s); o.rotation.y = s.r; o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, s.flower ? col.setHSL(s.flower, 0.65, 0.6) : col.setHSL(0.27 + Math.random() * 0.06, 0.5, 0.4)); });
  im.castShadow = true; im.receiveShadow = true; scene.add(im); return im;
}
