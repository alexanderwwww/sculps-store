// Geometry helpers: everything static is merged into a handful of meshes (vertex colours + one painted detail texture).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
export { THREE };
export const hash = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
export const smooth = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
export const lerp = (a, b, t) => a + (b - a) * t;
const cache = {};
export function cylT(rt, rb, seg = 12) { const k = `${rt},${rb},${seg}`; return (cache[k] ||= new THREE.CylinderGeometry(rt, rb, 1, seg)); }
export const G = {
  box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 10), cyl6: new THREE.CylinderGeometry(1, 1, 1, 6), cone: new THREE.ConeGeometry(1, 1, 10), cone4: new THREE.ConeGeometry(1, 1, 4),
  sph: new THREE.SphereGeometry(1, 10, 7), hemi: new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), ico: new THREE.IcosahedronGeometry(1, 1), ico0: new THREE.IcosahedronGeometry(1, 0),
  tor: new THREE.TorusGeometry(1, 0.2, 8, 20), plane: new THREE.PlaneGeometry(1, 1),
};
const V = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3();
export class Geo {
  constructor() { this.parts = { solid: [], glow: [], sign: [] }; this.base = new THREE.Matrix4(); this.baseY = null; this.seed = 1; }
  frame(pos, ry, fn) { const keep = this.base.clone(); this.base.multiply(new THREE.Matrix4().makeRotationY(ry).setPosition(pos[0], pos[1], pos[2])); fn(); this.base.copy(keep); }
  world(p) { return new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(this.base); }
  part(type, s, p, color, rot = [0, 0, 0], target = "solid") {
    const geo = typeof type === "string" ? G[type] : type, sc = typeof s === "number" ? [s, s, s] : s;
    const m = new THREE.Matrix4().compose(V.set(p[0], p[1], p[2]), Q.setFromEuler(E.set(rot[0], rot[1], rot[2], "YXZ")), S.set(sc[0], sc[1], sc[2]));
    m.premultiply(this.base);
    this.add(target, geo, m, color);
  }
  add(target, geo, m, color) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count, col = new Float32Array(n * 3), uv = new Float32Array(n * 2), c = new THREE.Color(color), by = this.baseY, solid = target === "solid";
    for (let i = 0; i < n; i++) {
      let k = 1;
      if (solid) { k = 1 + (hash((i / 3 | 0) + this.seed * 7.7) - 0.5) * 0.07; if (by != null) { const t = Math.min(1, Math.max(0, (pos.getY(i) - by) / 1.8)); k *= 0.7 + 0.3 * t * t * (3 - 2 * t); } }
      col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i)), x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let u, v; if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
      uv[i * 2] = u * 0.2; uv[i * 2 + 1] = v * 0.2;
    }
    g.deleteAttribute("uv"); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    this.parts[target].push(g);
  }
  // a sign face: plane in the current frame, uv rect inside the atlas
  sign(w, h, p, rot, rect) {
    const g = G.plane.clone(); const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * rect[2], rect[1] + uv.getY(i) * rect[3]);
    g.applyMatrix4(new THREE.Matrix4().compose(V.set(p[0], p[1], p[2]), Q.setFromEuler(E.set(rot[0], rot[1], rot[2], "YXZ")), S.set(w, h, 1)).premultiply(this.base));
    const n = g.attributes.position.count, col = new Float32Array(n * 3).fill(1); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); this.parts.sign.push(g);
  }
  mesh(target, mat, shadow = true) { const a = this.parts[target]; if (!a.length) return null; const m = new THREE.Mesh(mergeGeometries(a, false), mat); m.castShadow = shadow; m.receiveShadow = true; return m; }
}
export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), c);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = opts.aniso || 8;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
export function plasterTex() {
  return canvasTex(256, 256, (x) => {
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) { const r = 6 + hash(i) * 26; x.fillStyle = `rgba(${150 + hash(i + 9) * 80 | 0},${140 + hash(i + 3) * 70 | 0},${120 + hash(i + 5) * 70 | 0},${0.025 + hash(i + 1) * 0.035})`; x.beginPath(); x.ellipse(hash(i + 2) * 256, hash(i + 4) * 256, r, r * (0.5 + hash(i + 6) * 0.6), hash(i) * 3, 0, 7); x.fill(); }
    for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(90,80,60,${0.03 + hash(i + 11) * 0.04})`; x.fillRect(hash(i + 12) * 256, hash(i + 13) * 256, 1 + hash(i + 14) * 2, 1 + hash(i + 15) * 2); }
    x.strokeStyle = "rgba(255,255,255,.35)"; x.lineWidth = 1.5; for (let i = 0; i < 40; i++) { const px = hash(i + 20) * 256, py = hash(i + 21) * 256; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 12 + hash(i + 22) * 30, py + (hash(i + 23) - 0.5) * 5); x.stroke(); }
  }, { repeat: true });
}
