// Building kit: shared hand-painted materials, a geometry merger (few draw calls), and Greek parts.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as T from "../textures.js";

export const M = {};
export function initMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, ...o });
  M.marble = std({ map: T.marble(), roughness: 0.45 });
  M.marbleWarm = std({ map: T.marble("#efe2c8", "rgba(150,110,70,A)"), roughness: 0.5 });
  M.stone = std({ map: T.stone(), roughness: 0.85 });
  M.stoneGrey = std({ map: T.stone("#a9a9a0"), color: 0xc8c8d0, roughness: 0.9 });
  M.rock = std({ map: T.rock(), roughness: 0.95 });
  M.paving = std({ map: T.paving(), roughness: 0.8 });
  M.grass = std({ map: T.grass(), roughness: 1 });
  M.roof = std({ map: T.roofTiles(12), roughness: 0.7 });
  M.roofBlue = std({ map: T.roofTiles(205), roughness: 0.5 });
  M.gold = std({ map: T.gold(), metalness: 0.75, roughness: 0.32, emissive: 0x3a2400, emissiveIntensity: 0.25 });
  M.bronze = std({ color: 0x8a5a2a, metalness: 0.7, roughness: 0.4 });
  M.wood = std({ map: T.wood(), roughness: 0.8 });
  M.cyan = new THREE.MeshStandardMaterial({ color: 0x0b3a48, emissive: 0x22e0ff, emissiveIntensity: 1.6 });
  M.cyanSoft = new THREE.MeshBasicMaterial({ color: 0x5ef0ff, transparent: true, opacity: 0.55, depthWrite: false });
  M.red = std({ color: 0xc8231b, emissive: 0x500000, emissiveIntensity: 0.6, roughness: 0.4 });
  M.redGlow = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2a1a, emissiveIntensity: 2 });
  M.green = std({ color: 0x1f9d55, emissive: 0x0a4020, emissiveIntensity: 0.5 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1, depthWrite: false });
  M.cloth = std({ color: 0xfaf3e0, roughness: 0.9, side: THREE.DoubleSide });
  M.sand = std({ map: T.paving("#e7d3a6"), color: 0xf1d9a0, roughness: 1 });
  M.dark = std({ color: 0x1b2333, roughness: 0.6 });
  M.leafOlive = std({ map: T.foliage(85), color: 0xb8d090, roughness: 0.9, flatShading: false });
  M.leafCypress = std({ map: T.foliage(130), color: 0x7fb070, roughness: 0.9 });
  M.trunk = std({ map: T.wood(), color: 0x9a7650 });
  M.mosaic = std({ map: T.mosaicSpiral(), roughness: 0.6 });
  return M;
}
const tinted = {};
export function tint(hex, base = "cloth") { const k = base + hex; if (!tinted[k]) { tinted[k] = M[base].clone(); tinted[k].color = new THREE.Color(hex); } return tinted[k]; }

// ---------- merger ----------
export class Merger {
  constructor() { this.parts = new Map(); }
  add(geo, mat, x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(m);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g); return this;
  }
  addMatrix(geo, mat, m4) { const g = geo.index ? geo.toNonIndexed() : geo.clone(); for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); g.applyMatrix4(m4); if (!this.parts.has(mat)) this.parts.set(mat, []); this.parts.get(mat).push(g); }
  build(cast = true, receive = true) {
    const grp = new THREE.Group();
    for (const [mat, gs] of this.parts) { const mg = mergeGeometries(gs, false); gs.forEach((g) => g.dispose()); const mesh = new THREE.Mesh(mg, mat); mesh.castShadow = cast && mat !== M.cyanSoft && !mat.transparent; mesh.receiveShadow = receive; grp.add(mesh); }
    this.parts.clear(); return grp;
  }
}
export function uv(geo, sx, sy = sx) { const a = geo.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * sx, a.getY(i) * sy); return geo; }

// ---------- parts ----------
const cache = {};
export function flutedShaft(h, r) {
  const k = "shaft" + h + "_" + r; if (cache[k]) return cache[k];
  const g = new THREE.CylinderGeometry(r * 0.88, r, h, 40, 6, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x); const f = 1 - 0.07 * Math.pow(Math.abs(Math.sin(a * 10)), 0.6); p.setX(i, x * f); p.setZ(i, z * f); }
  g.computeVertexNormals(); uv(g, 2, h / 4); return (cache[k] = g);
}
// a full column: plinth, torus base, fluted shaft, capital (doric | ionic)
export function column(m, x, z, h = 6, r = 0.4, mat = M.marble, capMat = null, style = "ionic", y = 0) {
  m.add(new THREE.BoxGeometry(r * 2.6, r * 0.4, r * 2.6), mat, x, y + r * 0.2, z);
  m.add(new THREE.TorusGeometry(r * 1.05, r * 0.18, 8, 24), mat, x, y + r * 0.5, z, 0, 1, 1, 1, Math.PI / 2);
  const sh = h - r * 1.6;
  m.add(flutedShaft(sh, r), mat, x, y + r * 0.55 + sh / 2, z);
  const top = y + r * 0.55 + sh;
  m.add(new THREE.CylinderGeometry(r * 1.25, r * 0.9, r * 0.45, 24), capMat || mat, x, top + r * 0.22, z);
  m.add(new THREE.BoxGeometry(r * 2.7, r * 0.3, r * 2.7), capMat || mat, x, top + r * 0.6, z);
  if (style === "ionic") for (const s of [-1, 1]) m.add(new THREE.TorusGeometry(r * 0.32, r * 0.13, 8, 18), capMat || mat, x + s * r * 1.15, top + r * 0.35, z, 0, 1, 1, 1);
  return top + r * 0.75;
}
// triangular pediment along x, depth d
export function pediment(m, x, y, z, w, hgt, d, mat = M.marble, ry = 0, roofMat = M.roof) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, hgt); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2); uv(g, 0.15, 0.15);
  m.add(g, mat, x, y, z, ry);
  // roof slopes with tiles
  const L = Math.hypot(w / 2, hgt) + 0.4, ang = Math.atan2(hgt, w / 2);
  for (const sgn of [-1, 1]) {
    const rg = uv(new THREE.BoxGeometry(L, 0.25, d + 0.8), L / 3, (d + 0.8) / 3);
    const cx = (sgn * w) / 4, cy = hgt / 2 + 0.15;
    const mm = new THREE.Matrix4().makeRotationY(ry).multiply(new THREE.Matrix4().makeTranslation(cx, y + cy, 0)).multiply(new THREE.Matrix4().makeRotationZ(-sgn * ang));
    mm.premultiply(new THREE.Matrix4().makeTranslation(x, 0, z));
    m.addMatrix(rg, roofMat, mm);
  }
  // tympanum relief disk (gold)
  m.add(new THREE.CylinderGeometry(hgt * 0.25, hgt * 0.25, 0.1, 24), M.gold, x + Math.sin(ry) * (d / 2 + 0.06), y + hgt * 0.38, z + Math.cos(ry) * (d / 2 + 0.06), ry, 1, 1, 1, Math.PI / 2);
}
export function steps(m, x, z, w, d, n = 3, sh = 0.3, mat = M.marble, ry = 0) {
  for (let i = 0; i < n; i++) m.add(uv(new THREE.BoxGeometry(w + (n - i) * sh * 2, sh, d + (n - i) * sh * 2), (w + 2) / 4, (d + 2) / 4), mat, x, sh / 2 + i * sh, z, ry);
  return n * sh;
}
export function box(m, mat, x, y, z, w, h, d, ry = 0, s = 4) { m.add(uv(new THREE.BoxGeometry(w, h, d), Math.max(w, d) / s, h / s), mat, x, y + h / 2, z, ry); }
// a temple: steps, colonnade around a cella, entablature, pediments front/back
export function temple(m, { x = 0, z = 0, ry = 0, w = 12, d = 18, colH = 6, nx = 6, nz = 8, mat = M.marble, cap = M.gold, roof = M.roof, style = "ionic", cella = M.marbleWarm, frieze = M.gold }) {
  const g = new THREE.Group();
  const lm = new Merger();
  const base = steps(lm, 0, 0, w, d, 3, 0.35, mat);
  const r = Math.min(w / nx, d / nz) * 0.16;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if (i > 0 && i < nx - 1 && j > 0 && j < nz - 1) continue;
    column(lm, -w / 2 + r * 2 + (i * (w - r * 4)) / (nx - 1), -d / 2 + r * 2 + (j * (d - r * 4)) / (nz - 1), colH, r, mat, cap, style, base);
  }
  // cella with a door gap at the front (+z)
  const cw = w * 0.62, cd = d * 0.6, ch = colH * 0.92, t = 0.4;
  box(lm, cella, -cw / 2 + t / 2, base, 0, t, ch, cd); box(lm, cella, cw / 2 - t / 2, base, 0, t, ch, cd); box(lm, cella, 0, base, -cd / 2 + t / 2, cw, ch, t);
  box(lm, cella, -cw / 2 + cw * 0.17, base, cd / 2 - t / 2, cw * 0.34, ch, t); box(lm, cella, cw / 2 - cw * 0.17, base, cd / 2 - t / 2, cw * 0.34, ch, t);
  box(lm, cella, 0, base + ch * 0.75, cd / 2 - t / 2, cw * 0.32, ch * 0.25, t);
  box(lm, M.dark, 0, base, cd / 2 - t * 0.8, cw * 0.32, ch * 0.75, 0.05);
  // entablature: architrave + gold frieze + cornice
  const top = base + colH;
  box(lm, mat, 0, top, 0, w, 0.5, d); box(lm, frieze, 0, top + 0.5, 0, w - 0.1, 0.35, d - 0.1); box(lm, mat, 0, top + 0.85, 0, w + 0.4, 0.3, d + 0.4);
  // roof: pitched along z
  const ph = w * 0.22;
  const s = new THREE.Shape(); s.moveTo(-w / 2 - 0.2, 0); s.lineTo(w / 2 + 0.2, 0); s.lineTo(0, ph); s.closePath();
  const eg = new THREE.ExtrudeGeometry(s, { depth: d + 0.4, bevelEnabled: false }); eg.translate(0, 0, -(d + 0.4) / 2); uv(eg, 0.15, 0.15);
  lm.add(eg, mat, 0, top + 1.15, 0);
  const L = Math.hypot(w / 2 + 0.2, ph) + 0.3, ang = Math.atan2(ph, w / 2 + 0.2);
  for (const sg of [-1, 1]) lm.add(uv(new THREE.BoxGeometry(L, 0.22, d + 1), L / 2.5, (d + 1) / 2.5), roof, (sg * (w / 2 + 0.2)) / 2, top + 1.15 + ph / 2 + 0.12, 0, 0, 1, 1, 1, 0, -sg * ang);
  // gold acroteria
  for (const zz of [-1, 1]) { lm.add(new THREE.SphereGeometry(0.35, 12, 8), M.gold, 0, top + 1.2 + ph + 0.3, zz * (d / 2 + 0.2)); lm.add(new THREE.CylinderGeometry(ph * 0.22, ph * 0.22, 0.12, 20), M.gold, 0, top + 1.15 + ph * 0.38, zz * (d / 2 + 0.26), 0, 1, 1, 1, Math.PI / 2); }
  g.add(lm.build()); g.position.set(x, 0, z); g.rotation.y = ry;
  g.userData.top = top + 1.15 + ph; g.userData.door = cd / 2 + 2;
  return g;
}
export function dome(m, x, y, z, r, mat = M.gold, segs = 32) { m.add(new THREE.SphereGeometry(r, segs, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat, x, y, z); m.add(new THREE.CylinderGeometry(0.12, 0.25, r * 0.5, 8), mat, x, y + r + r * 0.2, z); m.add(new THREE.SphereGeometry(r * 0.08, 12, 8), mat, x, y + r * 1.5, z); }
export function sprite(texture, w, h) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })); s.scale.set(w, h, 1); return s; }
