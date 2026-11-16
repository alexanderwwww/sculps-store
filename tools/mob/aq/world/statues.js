// The six god statues: Zeus, Athena, Apollo, Hermes, Dionysus, Hecate.
// Each figure is SCULPTED, not assembled: the body, drapery, hair and face are one signed-distance field (smooth-blended
// round cones, ellipsoids and lofted cloth with fold relief) meshed with surface nets, finer around the head and hands.
// Ambient occlusion is baked into vertex colours so folds, curls and eye sockets read from far away. Gold attributes are
// plain merged geometry. Result per statue: 1 marble mesh + 1 gold mesh (+ 2 flames for Hecate). Geometry is cached per god.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { M } from "./kit.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const A3 = (a) => (a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const PLINTH = 1.2, HB = 0.092, HD = 0.043, HF = 0.028, HH = 0.034; // grid cell: body, head, face, hands
let QS = 1; // per-god grid scale, set in build()
const QGOD = { zeus: 1.02, athena: 1.02, hecate: 0.9, hermes: 1.06, dionysus: 1.06, apollo: 1.02 };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------ signed distance sculpting
const smin = (a, b, k) => { if (k <= 0) return a < b ? a : b; const h = k - Math.abs(a - b); if (h <= 0) return a < b ? a : b; return (a < b ? a : b) - (h * h) / (4 * k); };
function field(list, x, y, z) {
  let d = 1e9;
  for (let i = 0; i < list.length; i++) { const p = list[i], v = p.f(x, y, z); d = p.op === 0 ? smin(d, v, p.k) : -smin(-d, v, p.k); }
  return d;
}
class Sculpt {
  constructor() { this.p = []; this.m = new THREE.Matrix4(); this.st = []; this.sc = 1; }
  push(m) { this.st.push(this.m); this.m = this.m.clone().multiply(m); const e = this.m.elements; this.sc = Math.hypot(e[0], e[1], e[2]); return this; }
  pop() { this.m = this.st.pop(); const e = this.m.elements; this.sc = Math.hypot(e[0], e[1], e[2]); return this; }
  w(v) { return A3(v).applyMatrix4(this.m); }
  add(f, k, op, L = 1) { this.p.push({ f, k, op, L }); return this; } // L: how much faster than distance the value may change
  ball(c, r, k = 0.05, op = 0) { const { x: cx, y: cy, z: cz } = this.w(c); r *= this.sc; return this.add((x, y, z) => { x -= cx; y -= cy; z -= cz; return Math.sqrt(x * x + y * y + z * z) - r; }, k, op); }
  // round cone between two points (exact)
  cone(a, b, r1, r2 = r1, k = 0.05, op = 0) {
    a = this.w(a); b = this.w(b); r1 *= this.sc; r2 *= this.sc; const ax = a.x, ay = a.y, az = a.z, bx = b.x - ax, by = b.y - ay, bz = b.z - az;
    const l2 = bx * bx + by * by + bz * bz; if (l2 < 1e-10) return this.ball(a.applyMatrix4(this.m.clone().invert()), Math.max(r1, r2) / this.sc, k, op);
    const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
    return this.add((x, y, z) => {
      x -= ax; y -= ay; z -= az; const yy = x * bx + y * by + z * bz, zz = yy - l2;
      const qx = x * l2 - bx * yy, qy = y * l2 - by * yy, qz = z * l2 - bz * yy, x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
      const kk = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > kk) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < kk) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    }, k, op);
  }
  ell(c, r, rot = null, k = 0.05, op = 0) {
    const m = this.m.clone().multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, "YXZ")).setPosition(A3(c)));
    const e = m.invert().elements, rx = 1 / r[0], ry = 1 / r[1], rz = 1 / r[2], sc = this.sc, mn = Math.min(r[0], r[1], r[2]) * sc;
    return this.add((x, y, z) => {
      const lx = (e[0] * x + e[4] * y + e[8] * z + e[12]) * rx, ly = (e[1] * x + e[5] * y + e[9] * z + e[13]) * ry, lz = (e[2] * x + e[6] * y + e[10] * z + e[14]) * rz;
      const k0 = Math.sqrt(lx * lx + ly * ly + lz * lz); if (k0 < 1e-4) return -mn;
      const k1 = Math.sqrt(lx * lx * rx * rx + ly * ly * ry * ry + lz * lz * rz * rz); return ((k0 * (k0 - 1)) / k1) * sc;
    }, k, op, 1.3);
  }
  // chain of round cones through points; r is a number or r(t)
  chain(pts, r, k = 0.04, op = 0) { const n = pts.length - 1, R = typeof r === "function" ? r : () => r; for (let i = 0; i < n; i++) this.cone(pts[i], pts[i + 1], R(i / n), R((i + 1) / n), k, op); return this; }
  curve(pts, seg, r, k = 0.04) { return this.chain(new THREE.CatmullRomCurve3(pts.map(A3)).getPoints(seg), r, k); }
  // lofted elliptical column along local Y. keys: [y, cx, cz, a, b] ascending. fold(angle, y) adds relief.
  loft(keys, { fold = null, k = 0.06, op = 0 } = {}) {
    const e = this.m.clone().invert().elements, n = keys.length, y0 = keys[0][0], y1 = keys[n - 1][0], sc = this.sc;
    const cr = (i, t, c) => { const p0 = keys[Math.max(i - 1, 0)][c], p1 = keys[i][c], p2 = keys[i + 1][c], p3 = keys[Math.min(i + 2, n - 1)][c]; return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t); };
    return this.add((x, y, z) => {
      const lx = e[0] * x + e[4] * y + e[8] * z + e[12], ly = e[1] * x + e[5] * y + e[9] * z + e[13], lz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const yc = ly < y0 ? y0 : ly > y1 ? y1 : ly; let i = 0; while (i < n - 2 && keys[i + 1][0] < yc) i++;
      const t = (yc - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
      const a = cr(i, t, 3), b = cr(i, t, 4), dx = lx - cr(i, t, 1), dz = lz - cr(i, t, 2);
      let d = (Math.sqrt((dx * dx) / (a * a) + (dz * dz) / (b * b)) - 1) * Math.min(a, b);
      if (fold) d -= fold(Math.atan2(dx, dz), ly);
      const dy = Math.max(y0 - ly, ly - y1); return (d > dy ? d : dy) * sc;
    }, k, op, fold ? 1.7 : 1.3);
  }
  // cloth band: parallel strands along a path, laid over the surface around `center`
  band(pts, center, width, n, r, k = 0.035, seg = 14) {
    const c = new THREE.CatmullRomCurve3(pts.map(A3)), P = c.getPoints(seg), ce = A3(center);
    for (let j = 0; j < n; j++) { const o = (n === 1 ? 0 : j / (n - 1) - 0.5) * width, q = [];
      for (let i = 0; i <= seg; i++) { const t = c.getTangent(i / seg), out = P[i].clone().sub(ce); out.addScaledVector(t, -out.dot(t)).normalize(); const lat = t.clone().cross(out).normalize();
        q.push(P[i].clone().addScaledVector(lat, o).addScaledVector(out, (j % 2) * r * 0.45 + Math.sin(i * 0.7 + j * 2.1) * r * 0.1)); }
      this.chain(q, r * (0.85 + 0.3 * ((j * 7) % 3) / 2), k); }
    return this;
  }
}
// drapery fold relief: sharp valleys, round ridges, growing toward `y0` (bottom); tw twists the folds diagonally
const folds = (n, amp, y0, y1, tw = 0, ph = 0, top = 0.25) => (a, y) => { const t = clamp((y1 - y) / (y1 - y0), 0, 1); const m = Math.round(n * 1.6);
  return amp * (top + (1 - top) * t) * ((1 - 2 * Math.abs(Math.sin(n * a * 0.5 + tw * y + ph))) * 0.7 + Math.cos(m * a - tw * 0.7 * y + ph * 2.3) * 0.3); };

// surface nets over a block-culled grid. clip(x,y,z) is intersected with the field (cut faces are dropped).
function mesh(prims, lo, hi, h, keep, tint = [0.86, 0.85, 0.83]) {
  const clip = (x, y, z) => -y; // the plinth top
  const L = 1.3, nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const val = new Float32Array(nx * ny * nz), lx = (nx + 1) >> 1, ly = (ny + 1) >> 1, lz = (nz + 1) >> 1, lists = new Array(lx * ly * lz).fill(null), aol = new Array(lx * ly * lz).fill(null);
  // octree descent: each node culls its parent's primitive list; leaves (2 cells wide) evaluate the grid points
  const node = (i0, j0, k0, B, list, ao) => {
    if (i0 >= nx || j0 >= ny || k0 >= nz) return;
    const R = (Math.sqrt(3) * (B - 1) * h) / 2 + 0.75 * h, cx = lo[0] + (i0 + B / 2 - 0.5) * h, cy = lo[1] + (j0 + B / 2 - 0.5) * h, cz = lo[2] + (k0 + B / 2 - 0.5) * h, n = list.length, di = new Float64Array(n);
    let lo2 = 1e9, up = 1e9, mk = 0; for (let i = 0; i < n; i++) { const p = list[i], v = (di[i] = p.f(cx, cy, cz)); if (p.k > mk) mk = p.k; if (p.op === 0) { if (v - p.L * R < lo2) lo2 = v - p.L * R; if (v + p.L * R < up) up = v + p.L * R; } }
    let fill = 0, sub = null;
    if (lo2 - mk * 0.5 > 0 || clip(cx, cy, cz) > R) fill = 1;
    else { sub = []; for (let i = 0; i < n; i++) { const p = list[i]; if (p.op === 0 ? di[i] - p.L * R < up + mk : di[i] - p.L * R < mk) sub.push(p); }
      if (B === 4) { ao = []; for (let i = 0; i < n; i++) if (di[i] - list[i].L * R < 0.3) ao.push(list[i]); } }
    if (!fill && B > 2) { const b = B / 2; for (let c = 0; c < 8; c++) node(i0 + (c & 1) * b, j0 + ((c >> 1) & 1) * b, k0 + (c >> 2) * b, b, sub, ao); return; }
    const i1 = Math.min(i0 + B, nx), j1 = Math.min(j0 + B, ny), k1 = Math.min(k0 + B, nz);
    if (!fill) { const o = (i0 >> 1) + lx * ((j0 >> 1) + ly * (k0 >> 1)); lists[o] = sub; aol[o] = ao; }
    for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      let d = fill; if (!fill) { const x = lo[0] + i * h, y = lo[1] + j * h, z = lo[2] + k * h; d = field(sub, x, y, z); const c = clip(x, y, z); if (c > d) d = c; }
      val[i + nx * (j + ny * k)] = d; }
  };
  for (let k = 0; k < nz; k += 8) for (let j = 0; j < ny; j += 8) for (let i = 0; i < nx; i += 8) node(i, j, k, 8, prims, prims);
  // one vertex per sign-changing cell
  const cx1 = nx - 1, cy1 = ny - 1, cz1 = nz - 1, cellV = new Int32Array(cx1 * cy1 * cz1).fill(-1), pos = [];
  const EA = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3], EB = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7]; // cube edges by corner index (x=1,y=2,z=4)
  const cv = new Float32Array(8);
  for (let k = 0; k < cz1; k++) for (let j = 0; j < cy1; j++) for (let i = 0; i < cx1; i++) {
    const o = i + nx * (j + ny * k); let mask = 0;
    for (let c = 0; c < 8; c++) { const v = val[o + (c & 1) + nx * (((c >> 1) & 1) + ny * (c >> 2))]; cv[c] = v; if (v < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (let e = 0; e < 12; e++) { const a = EA[e], b = EB[e], va = cv[a], vb = cv[b]; if ((va < 0) === (vb < 0)) continue; const t = va / (va - vb);
      sx += (a & 1) + t * ((b & 1) - (a & 1)); sy += ((a >> 1) & 1) + t * (((b >> 1) & 1) - ((a >> 1) & 1)); sz += (a >> 2) + t * ((b >> 2) - (a >> 2)); cnt++; }
    cellV[i + cx1 * (j + cy1 * k)] = pos.length / 3; pos.push(lo[0] + (i + sx / cnt) * h, lo[1] + (j + sy / cnt) * h, lo[2] + (k + sz / cnt) * h);
  }
  const quads = [], C = (i, j, k) => cellV[i + cx1 * (j + cy1 * k)];
  for (let k = 1; k < cz1; k++) for (let j = 1; j < cy1; j++) for (let i = 1; i < cx1; i++) {
    const o = i + nx * (j + ny * k), s0 = val[o] < 0;
    if (s0 !== (val[o + 1] < 0)) { const q = [C(i, j - 1, k - 1), C(i, j, k - 1), C(i, j, k), C(i, j - 1, k)]; if (!s0) q.reverse(); quads.push(q); }
    if (s0 !== (val[o + nx] < 0)) { const q = [C(i - 1, j, k - 1), C(i - 1, j, k), C(i, j, k), C(i, j, k - 1)]; if (!s0) q.reverse(); quads.push(q); }
    if (s0 !== (val[o + nx * ny] < 0)) { const q = [C(i - 1, j - 1, k), C(i, j - 1, k), C(i, j, k), C(i - 1, j, k)]; if (!s0) q.reverse(); quads.push(q); }
  }
  // per vertex: snap to the true surface, analytic normal, baked ambient occlusion
  const nv = pos.length / 3, nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), cap = new Uint8Array(nv), e = 0.012;
  for (let v = 0; v < nv; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const o = Math.min(lx - 1, ((x - lo[0]) / h) >> 1) + lx * (Math.min(ly - 1, ((y - lo[1]) / h) >> 1) + ly * Math.min(lz - 1, ((z - lo[2]) / h) >> 1));
    const list = lists[o] || prims, al = aol[o] || prims; let gx = 0, gy = 1, gz = 0;
    for (let it = 0; it < 3; it++) { // tetrahedral gradient: 4 samples give distance and normal
      const f1 = field(list, x + e, y - e, z - e), f2 = field(list, x - e, y - e, z + e), f3 = field(list, x - e, y + e, z - e), f4 = field(list, x + e, y + e, z + e), d = (f1 + f2 + f3 + f4) / 4;
      gx = f1 - f2 - f3 + f4; gy = -f1 - f2 + f3 + f4; gz = -f1 + f2 - f3 + f4;
      const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1; gx /= gl; gy /= gl; gz /= gl;
      if (it === 2) break;
      if (clip(x, y, z) > d - h * 0.3) { if (d < -h * 0.6) cap[v] = 1; break; }
      const st = clamp(d / (gl / (4 * e)), -h * 0.6, h * 0.6); x -= gx * st; y -= gy * st; z -= gz * st;
    }
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z; nor[v * 3] = gx; nor[v * 3 + 1] = gy; nor[v * 3 + 2] = gz;
    let ao = 0; for (const [t, wgt] of [[0.045, 0.5], [0.11, 0.3], [0.24, 0.2]]) ao += wgt * clamp(1 - field(al, x + gx * t, y + gy * t, z + gz * t) / t, 0, 1);
    const up = 0.5 + 0.5 * gy, l = clamp(1 - ao * 1.6, 0, 1) * (0.86 + 0.14 * up), s = 0.34 + 0.66 * l;
    col[v * 3] = tint[0] * s; col[v * 3 + 1] = tint[1] * (s - (1 - l) * 0.03); col[v * 3 + 2] = tint[2] * (s - (1 - l) * 0.06);
  }
  const idx = [], d2 = (a, b) => (pos[a * 3] - pos[b * 3]) ** 2 + (pos[a * 3 + 1] - pos[b * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[b * 3 + 2]) ** 2;
  for (const q of quads) { if (q[0] < 0 || q[1] < 0 || q[2] < 0 || q[3] < 0) continue; if (cap[q[0]] && cap[q[1]] && cap[q[2]] && cap[q[3]]) continue;
    if (keep && !keep((pos[q[0] * 3] + pos[q[2] * 3]) / 2, (pos[q[0] * 3 + 1] + pos[q[2] * 3 + 1]) / 2, (pos[q[0] * 3 + 2] + pos[q[2] * 3 + 2]) / 2)) continue;
    if (d2(q[0], q[2]) <= d2(q[1], q[3])) idx.push(q[0], q[1], q[2], q[0], q[2], q[3]); else idx.push(q[0], q[1], q[3], q[1], q[2], q[3]); }
  // compact
  const map = new Int32Array(nv).fill(-1); let m = 0; for (const i of idx) if (map[i] < 0) map[i] = m++;
  const P = new Float32Array(m * 3), N = new Float32Array(m * 3), Cc = new Float32Array(m * 3), U = new Float32Array(m * 2);
  for (let v = 0; v < nv; v++) { const t = map[v]; if (t < 0) continue; for (let c = 0; c < 3; c++) { P[t * 3 + c] = pos[v * 3 + c]; N[t * 3 + c] = nor[v * 3 + c]; Cc[t * 3 + c] = col[v * 3 + c]; }
    U[t * 2] = (pos[v * 3] * 0.9 + pos[v * 3 + 2] * 0.45) * 0.21; U[t * 2 + 1] = (pos[v * 3 + 1] * 0.95 + pos[v * 3 + 2] * 0.3) * 0.21; }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.BufferAttribute(N, 3)); g.setAttribute("color", new THREE.BufferAttribute(Cc, 3)); g.setAttribute("uv", new THREE.BufferAttribute(U, 2));
  g.setIndex(idx.map((i) => map[i])); return g;
}
const sdBox = (b) => (x, y, z) => { const dx = Math.abs(x - b.c[0]) - b.s[0], dy = Math.abs(y - b.c[1]) - b.s[1], dz = Math.abs(z - b.c[2]) - b.s[2]; return Math.max(dx, dy, dz); };
// body at coarse resolution, detail boxes (head, hands) at fine resolution
// returns one job per part so the caller can spread the work over several ticks
function meshJobs(S, boxes, { h = HB * QS, lo = [-2.4, 0, -1.8], hi = [2.4, 7.7, 1.8], tint } = {}) {
  const bf = boxes.map(sdBox), jobs = [];
  jobs.push(() => mesh(S.p, lo, hi, h, (x, y, z) => { for (const f of bf) if (f(x, y, z) < -h * 0.9) return false; return true; }, tint));
  boxes.forEach((b, i) => { const m = b.h * 2; jobs.push(() => mesh(S.p, [b.c[0] - b.s[0] - m, b.c[1] - b.s[1] - m, b.c[2] - b.s[2] - m], [b.c[0] + b.s[0] + m, b.c[1] + b.s[1] + m, b.c[2] + b.s[2] + m], b.h,
    (x, y, z) => { if (bf[i](x, y, z) > 0) return false; for (let j = 0; j < i; j++) if (bf[j](x, y, z) < -b.h * 0.9) return false; return true; }, tint)); });
  return jobs;
}

// ------------------------------------------------------------------ anatomy
function ik(a, c, l1, l2, pole) {
  const d = c.clone().sub(a); let Ln = d.length(); const mx = (l1 + l2) * 0.995; if (Ln > mx) { d.setLength(mx); c.copy(a).add(d); Ln = mx; }
  const dn = d.clone().normalize(), x = (l1 * l1 - l2 * l2 + Ln * Ln) / (2 * Ln), hg = Math.sqrt(Math.max(l1 * l1 - x * x, 0)), pn = A3(pole); pn.addScaledVector(dn, -pn.dot(dn)).normalize();
  return a.clone().addScaledVector(dn, x).addScaledVector(pn, hg);
}
const rotM = (pos, ry = 0, rx = 0, rz = 0, s = 1) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")).scale(V(s, s, s)).setPosition(A3(pos));

// hand in its own frame: origin wrist, +Y fingers, +Z palm, +X thumb side
function hand(S, mtx, { curl = 0.5, fem = false, spread = 0, point = false, fan = 0 }) {
  S.push(mtx); const fr = fem ? 0.029 : 0.034, sc = fem ? 0.9 : 1;
  S.ell([0, 0.15 * sc, -0.005], [0.125 * sc, 0.17 * sc, 0.055], null, 0.03).cone([0, -0.08, 0], [0, 0.04, 0], fem ? 0.07 : 0.085, fem ? 0.075 : 0.09, 0.04);
  const bxs = [0.094, 0.032, -0.032, -0.094], len = [0.3, 0.33, 0.31, 0.245];
  for (let f = 0; f < 4; f++) { let p = V(bxs[f] * sc, 0.29 * sc, 0), a = 0; const c = point && f === 0 ? 0.04 : clamp(curl + f * 0.05 + fan * (f - 1.5), 0, 1.05), sx = (bxs[f] / 0.1) * spread;
    [[0.45, 1.3], [0.31, 1.6], [0.24, 1.0]].forEach(([fl, ang], s) => { a += c * ang; const q = p.clone().add(V(sx * 0.3, Math.cos(a), Math.sin(a)).normalize().multiplyScalar(len[f] * fl * sc)); S.cone(p, q, fr * (1 - s * 0.08), fr * (0.94 - s * 0.08), 0.014); p = q; }); }
  const t = clamp(curl * 1.3, 0, 1), mix = (a, b) => V(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t).multiplyScalar(sc);
  S.chain([V(0.1, 0.05, 0.02).multiplyScalar(sc), mix([0.2, 0.16, 0.02], [0.17, 0.2, 0.1]), mix([0.26, 0.28, 0.03], [0.11, 0.31, 0.17]), mix([0.29, 0.38, 0.04], [0.02, 0.35, 0.2])], (u) => (fr + 0.008) * (1.05 - u * 0.2), 0.02);
  S.ell([0.09 * sc, 0.1 * sc, 0.03], [0.07, 0.1, 0.05], null, 0.03); // thenar
  S.pop();
}
// resolve one arm. spec: {g, ax, rod, palm, pole} for a grip around a rod, or {w, dir, palm, pole, curl,...} for a free hand
function arm(S, sh, spec, side, o) {
  const L1 = o.fem ? 1.0 : 1.08, L2 = o.fem ? 0.86 : 0.92, hs = o.fem ? 1.06 : 1.14; let W, X, Y, Z, G = null, E;
  const hint = A3(spec.palm || [0, 0, 1]);
  if (spec.g) { G = A3(spec.g); const Ax = A3(spec.ax).normalize(), rod = (spec.rod || 0.05) + 0.055 * hs; let F = G.clone().sub(sh).normalize();
    for (let it = 0; it < 4; it++) { Y = F.clone().addScaledVector(Ax, -F.dot(Ax)).normalize(); Z = Ax.clone().cross(Y).normalize(); if (Z.dot(hint) < 0) Z.negate();
      W = G.clone().addScaledVector(Y, -0.31 * hs).addScaledVector(Z, -rod); E = ik(sh, W, L1, L2, spec.pole); F = W.clone().sub(E).normalize(); }
    G = W.clone().addScaledVector(Y, 0.31 * hs).addScaledVector(Z, rod);
  } else { W = A3(spec.w); E = ik(sh, W, L1, L2, spec.pole); Y = A3(spec.dir).normalize(); Z = hint.addScaledVector(Y, -hint.dot(Y)).normalize(); }
  X = side < 0 ? Y.clone().cross(Z) : Z.clone().cross(Y);
  const hm = new THREE.Matrix4().makeBasis(X, Y, Z).scale(V(hs, hs, hs)).setPosition(W), r = o.fem ? [0.15, 0.145, 0.112, 0.115, 0.122, 0.078] : [0.19, 0.2, 0.135, 0.145, 0.155, 0.095];
  const k = 1 - (o.soft || 0) * 0.25; for (let i = 0; i < 5; i++) r[i] *= o.bulk || 1;
  S.chain([sh, sh.clone().lerp(E, 0.45), E], (t) => (t < 0.5 ? r[0] + (r[1] * k - r[0]) * t * 2 : r[1] * k + (r[2] - r[1] * k) * (t - 0.5) * 2), 0.07);
  S.chain([E, E.clone().lerp(W, 0.3), W], (t) => (t < 0.5 ? r[3] + (r[4] - r[3]) * t * 2 : r[4] + (r[5] - r[4]) * (t - 0.5) * 2), 0.05);
  hand(S, hm, { curl: spec.g ? 0.8 : spec.curl ?? 0.45, fem: o.fem, spread: spec.spread || 0, point: spec.point, fan: spec.fan || 0 });
  return { E, W, X, Y, Z, G, hm, box: { c: W.clone().addScaledVector(Y, 0.29).addScaledVector(Z, 0.08).toArray(), s: [0.3, 0.3, 0.3], h: HH * QS } };
}
function leg(S, hip, spec, o, flesh) {
  const A = A3(spec.a), K = ik(hip, A, 1.5, 1.4, spec.pole || [0, 0, 1]), f = o.fem ? 0.9 : 1, sf = 1 + (o.soft || 0) * 0.06;
  if (flesh) {
    S.chain([hip, hip.clone().lerp(K, 0.4), K], (t) => f * sf * (t < 0.5 ? 0.265 - 0.03 * t * 2 : 0.235 - 0.07 * (t - 0.5) * 2), 0.1);
    const fw = K.clone().sub(hip).cross(V(1, 0, 0)).normalize(); if (fw.z < 0) fw.negate();
    S.ball(K.clone().addScaledVector(fw, 0.04), 0.155 * f, 0.06);
    S.cone(K, A, 0.15 * f, 0.095 * f, 0.07);
    const cm = K.clone().lerp(A, 0.3).addScaledVector(fw, -0.07); S.ell(cm, [0.135 * f, 0.34, 0.15 * f], null, 0.07);
  }
  const fm = rotM(A, spec.yaw || 0, spec.pitch || 0); S.push(fm);
  S.ball([0, -0.12, -0.07], 0.125 * f, 0.06).ell([0, -0.13, 0.2], [0.145 * f, 0.115, 0.36], null, 0.06).ell([0.01, -0.2, 0.5], [0.165 * f, 0.055, 0.17], null, 0.04);
  for (let t = 0; t < 5; t++) S.ball([0.12 - t * 0.062, -0.2, 0.64 - t * 0.035 - (t === 0 ? 0 : 0.02)], 0.042 - t * 0.004, 0.012); // toes
  S.ball([0.1, 0.0, -0.02], 0.06, 0.05).ball([-0.1, 0.02, -0.02], 0.06, 0.05); // ankle bones
  S.pop(); return { K, A, fm };
}
// head in its own frame: origin skull centre, +Z face
function face(S, o) {
  const f = o.fem, w = f ? 0.93 : 1, yo = o.young;
  S.ell([0, 0.08, -0.04], [0.28, 0.31, 0.335], null, 0.05);
  S.ell([0, -0.1, 0.07], [0.222 * w, 0.3, 0.255], null, 0.08);
  S.ball([0, 0.17, 0.12], 0.2, 0.08);
  if (!f) S.cone([-0.13, -0.26, 0.09], [0.13, -0.26, 0.09], 0.095, 0.095, 0.06);
  S.ball([0, -0.335, 0.215], f ? 0.07 : 0.085, 0.05);
  for (const s of [-1, 1]) { S.ball([s * 0.14 * w, -0.075, 0.185], 0.1, 0.06); if (f || yo) S.ball([s * 0.125, -0.15, 0.185], 0.095, 0.07); }
  S.cone([-0.15 * w, 0.078, 0.262], [0.15 * w, 0.078, 0.262], f ? 0.045 : yo ? 0.05 : 0.058, undefined, 0.035);
  S.ball([0, -0.19, 0.258], 0.095, 0.05); // muzzle
  for (const s of [-1, 1]) S.ell([s * 0.118 * w, 0.004, 0.335], [0.076, 0.056, 0.06], null, 0.03, 1); // sockets
  for (const s of [-1, 1]) { S.ell([s * 0.118 * w, -0.006, 0.272], [0.06, 0.038, 0.044], null, 0.006); S.cone([s * 0.055 * w, 0.045, 0.3], [s * 0.118 * w, 0.058, 0.3], 0.013, 0.013, 0.012).cone([s * 0.118 * w, 0.058, 0.3], [s * 0.18 * w, 0.036, 0.268], 0.013, 0.013, 0.012); } // eye + upper lid
  S.cone([0, 0.085, 0.3], [0, -0.09, f || yo ? 0.385 : 0.4], 0.034, f || yo ? 0.037 : 0.045, 0.03).ball([0, -0.105, f || yo ? 0.385 : 0.4], f || yo ? 0.037 : 0.045, 0.02);
  for (const s of [-1, 1]) S.ball([s * 0.043, -0.118, 0.352], 0.03, 0.02);
  S.ell([0, -0.209, 0.326], [0.082, 0.02, 0.024], null, 0.016).ell([0, -0.245, 0.318], [0.066, 0.024, 0.025], null, 0.016);
  S.cone([-0.085, -0.227, 0.335], [0.085, -0.227, 0.335], 0.007, 0.007, 0.008, 1); // mouth line
  for (const s of [-1, 1]) S.ell([s * 0.272, -0.02, 0.0], [0.035, 0.085, 0.055], [0, s * 0.3, 0], 0.02);
}
// scalp point on the hair ellipsoid: phi from crown toward the face (+) or nape (-), psi sideways
const scalp = (phi, psi, lift = 1) => V(Math.sin(psi) * 0.3 * lift, 0.09 + Math.cos(psi) * Math.cos(phi) * 0.33 * lift, -0.05 + Math.cos(psi) * Math.sin(phi) * 0.36 * lift);
const hairCap = (S, s = 1) => S.ell([0, 0.1, -0.06], [0.3 * s, 0.325 * s, 0.355 * s], null, 0.03);
// short curls over the scalp (keep(p) filters), and wavy parted strands
function curls(S, rnd, n, r, keep, k = 0.02, lift = 1.02) { for (let i = 0; i < n; i++) { const y = 1 - (i + 0.5) / n * 1.75, rad = Math.sqrt(Math.max(0, 1 - y * y)), th = i * 2.39996; const p = V(Math.cos(th) * rad * 0.3 * lift, 0.09 + y * 0.33 * lift, -0.05 + Math.sin(th) * rad * 0.36 * lift); if (!keep(p)) continue;
    const q = p.clone().add(V((rnd() - 0.5) * r, -r * (0.5 + rnd() * 0.6), (rnd() - 0.5) * r)); S.cone(p, q, r * (0.8 + rnd() * 0.3), r * 0.62, k); } }
// strands radiating from the crown, each ending in a curl. umax(theta) is the hairline (theta 0 = front)
function radial(S, { n = 20, r = 0.055, wave = 0.12, front = 0.95, back = 2.2, tip = 1.25, lift = 1.04 }) {
  for (let i = 0; i < n; i++) { const th = (i + 0.5) / n * Math.PI * 2, um = front + (back - front) * (1 - Math.cos(th)) / 2, pts = [], lf = lift + (i % 2) * 0.04;
    for (let j = 0; j <= 6; j++) { const u = 0.12 + (um - 0.12) * (j / 6), t = th + Math.sin(u * 5 + i * 2.3) * wave; pts.push(V(Math.sin(u) * Math.sin(t) * 0.3 * lf, 0.09 + Math.cos(u) * 0.33 * lf, -0.05 + Math.sin(u) * Math.cos(t) * 0.36 * lf)); }
    S.chain(pts, (t) => r * (0.8 + 0.3 * t), 0.022); S.ball(pts[6].clone().add(V(0, -r * 0.4, 0)), r * tip, 0.02); }
}
function parted(S, { n = 9, to = 1.75, r = 0.045, wave = 0.07, from = 1.15, back = -1.2, end = null }) {
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) { const phi = from + (back - from) * (i / (n - 1)), pts = [];
    for (let j = 0; j <= 7; j++) { const psi = 0.08 + (to - 0.08) * (j / 7); pts.push(scalp(phi + Math.sin(psi * 5 + i * 1.7) * wave - psi * 0.18 * Math.max(0, phi), s * psi, 1.0 + 0.03 * (i % 2))); }
    if (end) pts.push(...end(s, i, pts[pts.length - 1]));
    S.chain(pts, (t) => r * (1 - 0.25 * t), 0.022); }
}

// builds torso, limbs, head. Returns joints and frames for dressing.
function figure(S, P) {
  const o = { fem: !!P.fem, soft: P.soft || 0, young: P.young, bulk: P.bulk || 1 }, f = o.fem, J = { o }, bk = o.bulk;
  const pel = rotM([P.hipX || 0, 3.12, P.hipZ || 0], P.pelYaw || 0, 0, P.pelRoll || 0), ch = rotM([P.chX || 0, 4.32, P.chZ || 0], P.chYaw || 0, P.chPitch || 0, P.chRoll || 0);
  J.pel = pel; J.ch = ch; const sw = (f ? 0.56 : 0.68) * bk, hw = f ? 0.26 : 0.26;
  const pc = V().applyMatrix4(pel), cc = V().applyMatrix4(ch);
  // torso
  S.push(ch);
  if (f) { S.ell([0, 0.05, -0.02], [0.4, 0.52, 0.26], null, 0.08).cone([-0.42, 0.5, -0.02], [0.42, 0.5, -0.02], 0.165, 0.165, 0.1); for (const s of [-1, 1]) S.ell([s * 0.175, 0.1, 0.2], [0.17, 0.17, 0.15], null, 0.08).ball([s * sw, 0.5, 0], 0.165, 0.08).cone([0, 0.78, -0.05], [s * 0.4, 0.62, -0.04], 0.1, 0.1, 0.1); }
  else { const m = 1 - o.soft * 0.6;
    S.ell([0, 0.05, -0.02], [0.52 * bk, 0.56, 0.33 * bk], null, 0.08).cone([-0.52 * bk, 0.5, -0.03], [0.52 * bk, 0.5, -0.03], 0.19 * bk, 0.19 * bk, 0.12);
    for (const s of [-1, 1]) { S.ell([s * 0.235, 0.2, 0.225], [0.265, 0.2, 0.07 + 0.035 * m], [0, s * 0.25, -s * 0.12], 0.06).cone([0, 0.8, -0.07], [s * 0.46, 0.6, -0.05], 0.13, 0.1, 0.1).ell([s * 0.45, -0.05, -0.1], [0.14, 0.38, 0.2], null, 0.1).ball([s * sw, 0.5, 0], 0.21 + 0.015 * m, 0.08);
      for (let r = 0; r < 3; r++) S.ell([s * 0.105, -0.4 - r * 0.17, 0.268 - r * 0.012], [0.095, 0.078, 0.02 + 0.03 * m], null, 0.04); }
  }
  S.pop();
  const wy = (pc.y + cc.y) / 2 + 0.02;
  if (f) S.loft([[pc.y - 0.1, pc.x, pc.z, 0.44, 0.3], [wy, (pc.x + cc.x) / 2, (pc.z + cc.z) / 2, 0.33, 0.24], [cc.y - 0.1, cc.x, cc.z, 0.38, 0.27]], { k: 0.1 });
  else S.loft([[pc.y - 0.15, pc.x, pc.z, 0.44, 0.29], [pc.y + 0.2, pc.x, pc.z + 0.02, 0.42 + o.soft * 0.03, 0.285 + o.soft * 0.05], [wy, (pc.x + cc.x) / 2, (pc.z + cc.z) / 2 + 0.01, 0.39, 0.27], [cc.y - 0.25, cc.x, cc.z, 0.46, 0.3]], { k: 0.1 });
  S.push(pel);
  S.ell([0, 0, 0], [f ? 0.46 : 0.45, 0.31, 0.29], null, 0.12);
  for (const s of [-1, 1]) { S.ell([s * 0.2, -0.13, -0.16], [0.23, 0.25, 0.21], null, 0.07); if (!f) S.ell([s * 0.36, 0.23, 0.03], [0.1, 0.12, 0.19], null, 0.06); }
  if (!f) S.ell([0, 0.05, 0.17], [0.28, 0.22, 0.1 + o.soft * 0.05], null, 0.1).ball([0, -0.3, 0.08], 0.13, 0.08);
  S.pop();
  // head + neck
  const hS = P.headS || 1.12, hc = V(0, 0.93 + 0.4 * hS, 0.04).applyMatrix4(ch); J.headC = hc; const hy = (P.chYaw || 0) + (P.head ? P.head[0] : 0);
  J.head = rotM(hc, hy, P.head ? P.head[1] : 0, P.head ? P.head[2] : 0, hS);
  const nb = V(0, 0.72, -0.04).applyMatrix4(ch), nt = V(0, -0.2, -0.06).applyMatrix4(J.head); S.cone(nb, nt, f ? 0.155 : 0.2, f ? 0.135 : 0.17, 0.08);
  if (!f) for (const s of [-1, 1]) S.cone(V(s * 0.05, 0.62, 0.12).applyMatrix4(ch), V(s * 0.17, -0.12, -0.08).applyMatrix4(J.head), 0.05, 0.055, 0.05); // sternomastoid
  S.push(J.head); face(S, o); S.pop();
  // limbs
  J.arm = {}; J.leg = {}; J.sh = {}; J.hip = {};
  for (const [n, s] of [["L", 1], ["R", -1]]) {
    J.sh[n] = V(s * sw, 0.5, 0).applyMatrix4(ch); J.hip[n] = V(s * hw, -0.07, 0).applyMatrix4(pel);
    J.arm[n] = arm(S, J.sh[n], P["arm" + n], s, o); J.leg[n] = leg(S, J.hip[n], P["leg" + n], o, P.bareLegs !== false);
  }
  J.pc = pc; J.cc = cc;
  const fc = V(0, -0.1, 0.26).applyMatrix4(J.head);
  J.boxes = [{ c: fc.toArray(), s: [0.25 * hS, 0.33 * hS, 0.2 * hS], h: HF * QS }, { c: [hc.x, hc.y + 0.04, hc.z - 0.02], s: [0.48 * hS, 0.56 * hS, 0.56 * hS], h: HD * QS }, J.arm.L.box, J.arm.R.box];
  return J;
}

// ------------------------------------------------------------------ explicit (gold) geometry helpers
function prep(g, m) { if (m) g.applyMatrix4(m); if (!g.index) { const n = g.attributes.position.count, ix = new Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(ix); }
  for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k); g.morphAttributes = {}; return g; }
const Y_AXIS = new THREE.Vector3(0, 1, 0);
// lathe with outward normals whichever way the profile was written
function latheGeo(prof, seg) { let a = 0; for (let i = 0; i < prof.length; i++) { const p = prof[i], q = prof[(i + 1) % prof.length]; a += p[0] * q[1] - q[0] * p[1]; } if (a < 0) prof = prof.slice().reverse(); return new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), seg); }
const aim = (pos, dir, roll = 0) => { const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, A3(dir).normalize()); return new THREE.Matrix4().compose(A3(pos), q.multiply(new THREE.Quaternion().setFromAxisAngle(Y_AXIS, roll)), V(1, 1, 1)); };
class Gold { constructor() { this.g = []; }
  add(g, m) { this.g.push(prep(g, m)); return this; }
  rod(a, b, r, r2 = r, seg = 10) { a = A3(a); b = A3(b); const d = b.clone().sub(a); return this.add(new THREE.CylinderGeometry(r2, r, d.length(), seg), aim(a.clone().add(b).multiplyScalar(0.5), d)); }
  ball(c, r, sx = 1, sy = 1, sz = 1, seg = 10) { return this.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), new THREE.Matrix4().makeScale(sx, sy, sz).setPosition(A3(c))); }
  tube(pts, r, seg = 24, rs = 8, closed = false) { return this.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(A3), closed), seg, r, rs, closed)); }
  // leaf / feather: flattened pointed ellipsoid from `pos` along `dir`, flat side facing `nrm`
  leaf(pos, dir, nrm, len, wid, th = 0.25) { const y = A3(dir).normalize(), z = A3(nrm); z.addScaledVector(y, -z.dot(y)).normalize(); const x = y.clone().cross(z); const g = new THREE.SphereGeometry(1, 6, 4); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = p.getY(i), w = t > 0 ? 1 - t * t * 0.55 : 1; p.setXYZ(i, p.getX(i) * w * wid * 0.5, (t * 0.5 + 0.5) * len, p.getZ(i) * w * wid * th * 0.5 + Math.abs(p.getX(i)) * wid * 0.12); }
    g.computeVertexNormals(); return this.add(g, new THREE.Matrix4().makeBasis(x, y, z).setPosition(A3(pos))); }
  lathe(prof, seg, m) { return this.add(latheGeo(prof, seg), m); }
  // a wing: fanned feathers from a root, in the plane spanned by `out` (tip direction) and `up`
  wing(root, out, up, len, n = 6) { root = A3(root); const o = A3(out).normalize(), u = A3(up).normalize(), nr = o.clone().cross(u);
    for (let i = 0; i < n; i++) { const t = i / (n - 1), a = -0.25 + t * 1.15, d = o.clone().multiplyScalar(Math.cos(a)).addScaledVector(u, Math.sin(a)); this.leaf(root.clone().addScaledVector(u, -0.02 * i), d, nr, len * (1 - 0.42 * t), len * 0.3, 0.3); }
    return this.ball(root, len * 0.12); }
  merged() { return this.g.length ? mergeGeometries(this.g, false) : null; }
}
function plinthGeo() {
  const g = new THREE.LatheGeometry([[1.72, 0], [1.72, 0.16], [1.6, 0.2], [1.6, 0.26], [1.5, 0.36], [1.42, 0.4], [1.42, 0.9], [1.5, 0.96], [1.58, 1.0], [1.58, 1.12], [1.52, PLINTH], [0, PLINTH]].map((p) => new THREE.Vector2(p[0], p[1])), 36);
  // the lathe smooths every edge; split normals so mouldings stay crisp
  const n = g.toNonIndexed(); n.computeVertexNormals(); prep(n); const c = new Float32Array(n.attributes.position.count * 3); const p = n.attributes.position, nm = n.attributes.normal, uv = n.attributes.uv;
  for (let i = 0; i < p.count; i++) { const s = 0.64 + 0.2 * (0.5 + 0.5 * nm.getY(i)) - (p.getY(i) > 0.3 && p.getY(i) < 0.42 ? 0.1 : 0); c[i * 3] = s; c[i * 3 + 1] = s - 0.01; c[i * 3 + 2] = s - 0.025; uv.setXY(i, uv.getX(i) * 3, p.getY(i) * 0.4); }
  n.setAttribute("color", new THREE.BufferAttribute(c, 3)); return n;
}

// ------------------------------------------------------------------ the gods
const GODS = {};
const hipWrap = (S, J, { top = 3.5, bottom = 0.06, tilt = 0.1, n = 9, amp = 0.06, tw = 0.9, wa = 0.5, wb = 0.36, ba = 0.6, bb = 0.5, roll = 0.065, cx = 0, cz = 0, k = 0.05, press = [], tubes = [], flap = null, flapLen = 0.95, weight = 0 }) => {
  const pc = J.pc; S.push(rotM([pc.x, 0, pc.z], 0, 0, tilt)); const mid = (top + bottom) / 2;
  S.loft([[bottom, cx, cz, ba, bb], [mid, cx * 0.5, cz * 0.5, (wa + ba) / 2 + 0.02, (wb + bb) / 2 + 0.02], [top - 0.35, 0, 0, wa + 0.03, wb + 0.03], [top, 0, 0, wa - 0.02, wb - 0.02]], { fold: folds(n, amp, bottom, top, tw, 0.4, 0.3), k });
  if (roll) for (let j = 0; j < 3; j++) { const pts = []; for (let i = 0; i <= 36; i++) { const a = (i / 36) * Math.PI * 2, ph = a * 5 + (j * Math.PI * 2) / 3, rr = 1 + Math.cos(ph) * 0.075; pts.push(V(Math.sin(a) * (wa + 0.035) * rr, top - 0.07 + Math.sin(ph) * 0.06, Math.cos(a) * (wb + 0.045) * rr)); } S.chain(pts, roll, 0.03); }
  if (weight) for (let i = 0; i < 7; i++) tubes.push([weight * (0.12 + i * 0.47), bottom + 0.03, top - 0.25, 0.1, 0.035]);
  for (const [a, y0, y1, r0, r1] of tubes) { const pts = []; for (let i = 0; i <= 5; i++) { const t = i / 5, y = y1 + (y0 - y1) * t, u = (y - bottom) / (top - bottom), A = ba + (wa - ba) * u, Bz = bb + (wb - bb) * u, aa = a + Math.sin(t * 3 + a * 5) * 0.06; pts.push(V(cx * (1 - u) + Math.sin(aa) * (A + 0.035), y, cz * (1 - u) + Math.cos(aa) * (Bz + 0.035))); } S.chain(pts, (t) => r1 + (r0 - r1) * t, 0.035); }
  if (flap != null) S.band([0, 0.25, 0.5, 0.75, 1].map((t) => V(Math.sin(flap) * (wa + 0.09 + t * 0.05), top - 0.05 - t * flapLen, Math.cos(flap) * (wb + 0.09 + t * 0.05))), [0, top - flapLen / 2, 0], 0.34, 4, 0.06, 0.03, 8);
  S.pop();
  for (const n2 of press) { const l = J.leg[n2]; S.cone(J.hip[n2], l.K, 0.29, 0.21, 0.2).cone(l.K, l.A, 0.2, 0.13, 0.2); }
};

GODS.zeus = () => {
  const S = new Sculpt(), G = new Gold(), rnd = rng(11), bolt = V(0.74, 0.44, 0.5).normalize();
  const J = figure(S, { bulk: 1.08, bareLegs: false, hipX: 0.1, pelRoll: 0.07, chX: 0.02, chRoll: -0.03, chYaw: -0.12, head: [-0.18, -0.05, 0.03],
    legL: { a: [0.3, 0.25, 0.02], yaw: 0.25 }, legR: { a: [-0.42, 0.29, -0.2], yaw: -0.55, pitch: 0.12, pole: [-0.35, 0, 1] },
    armR: { g: [-1.3, 6.0, -0.05], ax: bolt, rod: 0.06, palm: [0.2, 1, 0.2], pole: [-1, -0.6, -0.5] },
    armL: { w: [1.08, 3.0, 0.3], dir: [0.1, -1, 0.3], palm: [-1, 0, 0.2], pole: [0.4, 0, -1], curl: 0.55 } });
  hipWrap(S, J, { top: 3.44, tilt: 0.12, n: 7, amp: 0.085, tw: 0.9, wa: 0.5, wb: 0.37, ba: 0.68, bb: 0.54, cz: -0.04, cx: -0.1, press: ["R"], weight: 1, roll: 0.058 });
  // mantle: up the left flank, over the left shoulder, down the back
  S.band([[0.3, 3.45, 0.38], [0.5, 4.0, 0.37], [0.62, 4.6, 0.31], [0.7, 5.08, 0.03], [0.62, 4.6, -0.36], [0.47, 3.9, -0.44], [0.32, 3.2, -0.5], [0.27, 2.4, -0.58]], [0.15, 4.3, 0], 0.6, 5, 0.085, 0.05, 20);
  // hair: thick locks swept from the crown; full curled beard in rows, moustache
  S.push(J.head); hairCap(S, 0.93); radial(S, { n: 13, r: 0.08, wave: 0.22, front: 0.9, back: 2.25, lift: 1.0 }); S.ball([0, 0.42, -0.05], 0.12, 0.06);
  for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * 3.7, r = 0.074 + (i % 2) * 0.008; S.ball([Math.sin(a) * 0.29, 0.08 + Math.cos(a) * 0.31, 0.25 - Math.abs(a) * 0.08], r, 0.008); }
  S.ell([0, -0.235, 0.33], [0.09, 0.05, 0.05], null, 0.02);
  for (const s of [-1, 1]) S.chain([[s * 0.04, 0.33, 0.27], [s * 0.15, 0.36, 0.24], [s * 0.27, 0.22, 0.16], [s * 0.31, 0.0, 0.09], [s * 0.31, -0.2, 0.02], [s * 0.28, -0.38, -0.05]], 0.07, 0.03);
  S.ell([0, -0.36, 0.13], [0.2, 0.2, 0.17], null, 0.05);
  [[-0.16, 0.24, 0.265, 10, 0.72], [-0.24, 0.24, 0.275, 9, 0.42], [-0.32, 0.225, 0.275, 8, 0], [-0.4, 0.19, 0.26, 7, 0], [-0.48, 0.14, 0.235, 5, 0], [-0.55, 0.07, 0.2, 3, 0]].forEach(([y, wd, dp, cnt, skip], row) => {
    for (let i = 0; i < cnt; i++) { const a = ((i + 0.5 + (row % 2) * 0.0) / cnt - 0.5) * 2.7; if (Math.abs(a) < skip) continue; const x = Math.sin(a) * wd, z = 0.07 + Math.cos(a) * dp, r = 0.05 + rnd() * 0.012;
      S.cone([x, y + Math.abs(a) * 0.03, z], [x * 0.95, y - 0.06 + Math.abs(a) * 0.03, z + 0.012], r, r * 0.72, 0.014); } });
  for (const s of [-1, 1]) S.chain([[s * 0.012, -0.165, 0.365], [s * 0.07, -0.18, 0.345], [s * 0.115, -0.24, 0.3], [s * 0.12, -0.31, 0.27]], (t) => 0.034 - 0.008 * t, 0.015);
  S.pop();
  // thunderbolt: a chunky zig-zag blade through the fist, standing in the vertical plane so it reads from every side
  const a = J.arm.R, up = V(0, 1, 0).addScaledVector(bolt, -bolt.y).normalize(), bm = new THREE.Matrix4().makeBasis(up, bolt, up.clone().cross(bolt)).setPosition(a.G);
  const zz = [[0, 1.9, 0.005], [0.2, 1.12, 0.11], [-0.2, 0.98, 0.11], [0.06, 0.3, 0.1], [0, 0, 0.07], [-0.06, -0.3, 0.1], [0.2, -0.98, 0.11], [-0.2, -1.12, 0.11], [0, -1.9, 0.005]];
  const sh = new THREE.Shape(); [...zz.map(([x, y, w]) => [x + w, y]), ...zz.slice().reverse().map(([x, y, w]) => [x - w, y])].forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.13, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 1 }); bg.translate(0, 0, -0.065); G.add(bg, bm);
  J.boxes[0].s[1] += 0.1; J.boxes[0].c[1] -= 0.1; J.boxes[1].s[1] += 0.06; J.boxes[1].c[1] -= 0.06;
  return { S, G, J };
};

// long peplos with overfold; the free knee presses through the cloth
function peplos(S, J, { hem = 0.04, over = 3.12, press = "L", n = 12, amp = 0.085, vfolds = true } = {}) {
  const pc = J.pc, cc = J.cc, fx = (J.leg.L.A.x + J.leg.R.A.x) / 2, fz = (J.leg.L.A.z + J.leg.R.A.z) / 2 * 0.5, wy = (pc.y + cc.y) / 2 + 0.03, mx = (pc.x + cc.x) / 2, mz = (pc.z + cc.z) / 2;
  S.loft([[hem, fx, fz, 0.7, 0.56], [1.5, (fx + pc.x) / 2, fz / 2, 0.58, 0.46], [pc.y, pc.x, pc.z, 0.5, 0.37], [pc.y + 0.5, pc.x, pc.z, 0.38, 0.28]], { fold: folds(n, amp, hem, pc.y + 0.4, 0, 0.7, 0.3), k: 0.06 });
  const l = J.leg[press]; S.cone(J.hip[press], l.K, 0.27, 0.2, 0.2).cone(l.K, l.A, 0.19, 0.13, 0.2); const sg = press === "L" ? -1 : 1;
  for (let i = 0; i < 7; i++) { const a0 = sg * (i * 0.47 - 0.12), pts = []; for (let j = 0; j <= 5; j++) { const t = j / 5, y = pc.y + 0.25 + (hem + 0.02 - pc.y - 0.25) * t, u = clamp((y - hem) / (pc.y - hem), 0, 1.2), a = a0 + Math.sin(t * 3 + i * 2) * 0.05; pts.push(V(fx + (pc.x - fx) * u + Math.sin(a) * (0.7 - 0.2 * u + 0.03), y, fz + (pc.z - fz) * u + Math.cos(a) * (0.56 - 0.19 * u + 0.03))); } S.chain(pts, (t) => 0.035 + 0.075 * t, 0.035); }
  S.loft([[over, pc.x, pc.z, 0.55, 0.42], [over + 0.3, pc.x, pc.z, 0.51, 0.385], [wy, mx, mz, 0.4, 0.3], [cc.y - 0.02, cc.x, cc.z + 0.01, 0.43, 0.285], [cc.y + 0.4, cc.x, cc.z, 0.43, 0.24]], { fold: folds(10, 0.055, over, cc.y + 0.2, 0, 1.3, 0.12), k: 0.05 });
  S.loft([[wy - 0.05, mx, mz, 0.425, 0.325], [wy + 0.05, mx, mz, 0.425, 0.325]], { k: 0.015 }); // girdle
  if (vfolds) { const pts = []; for (let j = 0; j <= 8; j++) { const x = (j / 8 - 0.5) * 0.8, u = x / 0.4; pts.push(V(x, 0.63 - 0.2 * (1 - u * u), 0.235 * Math.sqrt(1 - (x / 0.5) ** 2)).applyMatrix4(J.ch)); } S.chain(pts, 0.05, 0.08); }
  return { wy, mx, mz };
}
// centre-parted wavy hair with long locks on the shoulders
function longHair(S, { locks = true, n = 7 } = {}) {
  hairCap(S, 0.95); parted(S, { n, to: 1.6, r: 0.065, wave: 0.12, from: 1.05, back: -1.3 });
  S.ell([0, -0.28, -0.2], [0.27, 0.32, 0.17], null, 0.06);
  if (locks) for (const s of [-1, 1]) { S.chain([[s * 0.3, -0.05, 0.03], [s * 0.34, -0.3, 0.05], [s * 0.3, -0.52, 0.13], [s * 0.33, -0.72, 0.17], [s * 0.28, -0.9, 0.2]], (t) => 0.07 - 0.02 * t, 0.03);
    S.chain([[s * 0.3, -0.1, -0.14], [s * 0.36, -0.4, -0.1], [s * 0.33, -0.62, -0.03], [s * 0.38, -0.84, 0.0]], (t) => 0.07 - 0.02 * t, 0.03); S.chain([[s * 0.16, -0.45, -0.34], [s * 0.2, -0.7, -0.32], [s * 0.15, -0.95, -0.3]], 0.07, 0.04); }
}
// wreath of gold leaves around the head (laurel: slim, ivy: broad)
function wreath(G, hm, { n = 9, len = 0.2, wid = 0.075, y = 0.2, th = 0.3 } = {}) {
  const sc = Math.hypot(hm.elements[0], hm.elements[1], hm.elements[2]);
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) for (const ud of [-1, 1]) { const a = 0.22 + (i / (n - 1)) * 2.55 + (ud > 0 ? 0.1 : 0);
    const p = V(s * Math.sin(a) * 0.31, y - 0.1 * (1 - Math.cos(a)) / 2 + 0.03 * Math.cos(a), Math.cos(a) * 0.36 - 0.05).applyMatrix4(hm);
    G.leaf(p, V(-s * Math.cos(a), ud * 0.55, Math.sin(a) * 1.0).transformDirection(hm), V(s * Math.sin(a), 0.3, Math.cos(a)).transformDirection(hm), len * sc, wid * sc, th); }
}
const marbleX = (g, m) => { prep(g, m); g.computeVertexNormals(); const p = g.attributes.position, nm = g.attributes.normal, c = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { const s = 0.66 + 0.2 * (0.5 + 0.5 * nm.getY(i)); c[i * 3] = s; c[i * 3 + 1] = s - 0.008; c[i * 3 + 2] = s - 0.02; uv[i * 2] = p.getX(i) * 0.2 + p.getZ(i) * 0.1; uv[i * 2 + 1] = p.getY(i) * 0.2; }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); return g; };

GODS.athena = () => {
  const S = new Sculpt(), G = new Gold(), X = [];
  const sn = V(0.42, 0, 1).normalize(), st = V(1, 0, -0.42).normalize(), sc = V(1.22, 1.36, -0.02), sr = 1.36, spear = V(-0.055, 1, 0.0).normalize();
  const J = figure(S, { fem: true, bareLegs: false, hipX: -0.08, pelRoll: -0.05, chRoll: 0.03, chYaw: 0.05, head: [0.08, 0, 0],
    legR: { a: [-0.22, 0.25, 0], yaw: -0.15 }, legL: { a: [0.34, 0.27, 0.28], yaw: 0.35, pitch: 0.08, pole: [0.2, 0, 1] },
    armR: { g: [-1.5, 4.55, 0.12], ax: spear, rod: 0.04, palm: [0, 0, 1], pole: [-0.3, -1, -0.4] },
    armL: { g: sc.clone().add(V(0, sr - 0.04, 0)).addScaledVector(sn, 0.02), ax: st, rod: 0.05, palm: sn.clone().negate(), pole: [1, 0, -0.6] } });
  const pp = peplos(S, J, { press: "L", vfolds: false });
  // aegis: a cape over shoulders and chest
  const cc = J.cc, ay = cc.y - 0.1; S.loft([[ay, cc.x, cc.z + 0.01, 0.475, 0.34], [cc.y + 0.3, cc.x, cc.z, 0.5, 0.32], [cc.y + 0.62, cc.x, cc.z - 0.02, 0.46, 0.22]], { k: 0.03 });
  // crested helmet pushed back on the head: dome, raised face-mask with eye holes and nose guard, cheek pieces, neck guard
  S.push(J.head);
  S.ell([0, 0.15, -0.05], [0.34, 0.33, 0.4], null, 0.03);
  S.push(rotM([0, 0.3, 0.14], 0, -0.42)); S.ell([0, 0, 0.1], [0.28, 0.09, 0.3], null, 0.04).cone([0, 0.06, 0.0], [0, 0.0, 0.42], 0.05, 0.035, 0.03);
  for (const s of [-1, 1]) S.ell([s * 0.12, 0.05, 0.27], [0.055, 0.05, 0.07], null, 0.02, 1); // eye holes of the raised mask
  S.pop();
  { const rim = []; for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; rim.push(V(Math.sin(a) * 0.335, 0.06 + Math.cos(a) * 0.1, -0.05 + Math.cos(a) * 0.39)); } S.chain(rim, 0.04, 0.02); }
  S.ell([0, -0.14, -0.3], [0.31, 0.16, 0.17], [0.5, 0, 0], 0.05);
  for (const s of [-1, 1]) { S.ell([s * 0.29, -0.06, 0.02], [0.05, 0.16, 0.1], [0, 0, s * 0.1], 0.03); // cheek pieces
    S.chain([[s * 0.29, -0.24, -0.1], [s * 0.35, -0.5, -0.05], [s * 0.37, -0.78, 0.03], [s * 0.35, -1.0, 0.1]], (t) => 0.075 - 0.02 * t, 0.03);
    S.chain([[s * 0.2, -0.3, -0.24], [s * 0.26, -0.6, -0.2], [s * 0.24, -0.95, -0.2]], 0.08, 0.04); }
  S.pop();
  // gold crest: a striated plume sweeping from above the brow over the crown to the nape
  { const sh = new THREE.Shape(), R0 = 0.37, R1 = 0.84, n = 24, a0 = 0.55, a1 = 3.65; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n), r = R1 - (i % 2) * 0.06 - Math.max(0, a - 2.7) * 0.16; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * (i / n); sh.lineTo(Math.cos(a) * R0, Math.sin(a) * R0); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 1 }); g.translate(0, 0, -0.05);
    G.add(g, J.head.clone().multiply(new THREE.Matrix4().makeBasis(V(0, 0, 1), V(0, 1, 0), V(-1, 0, 0)).setPosition(0, 0.0, -0.05))); }
  // spear
  const a = J.arm.R, g0 = a.G, bot = g0.clone().addScaledVector(spear, -g0.y / spear.y), top = g0.clone().addScaledVector(spear, 2.75);
  G.rod(bot, top, 0.036, 0.032, 8); const hd = new THREE.ConeGeometry(0.13, 0.62, 4); hd.scale(1, 1, 0.3); G.add(hd, aim(top.clone().addScaledVector(spear, 0.3), spear)); G.rod(top.clone().addScaledVector(spear, -0.12), top, 0.055, 0.045, 8);
  // shield: marble bowl, gold rim, gorgon boss
  const sm = new THREE.Matrix4().makeBasis(st, sn, st.clone().cross(sn)).setPosition(sc);
  X.push(marbleX(latheGeo([[0.001, 0.26], [0.35, 0.24], [0.7, 0.18], [1.0, 0.09], [1.2, 0.0], [1.2, -0.06], [0.9, 0.0], [0.5, 0.08], [0.001, 0.12]], 36), sm));
  G.lathe([[1.19, 0.0], [1.22, 0.035], [1.33, 0.035], [1.365, 0.0], [1.33, -0.07], [1.19, -0.07]], 40, sm);
  // gorgon boss: face with staring eyes, wide mouth and tongue, snakes radiating
  G.lathe([[0.001, 0.4], [0.22, 0.37], [0.38, 0.31], [0.47, 0.24], [0.5, 0.2]], 20, sm);
  G.lathe([[0.56, 0.2], [0.6, 0.24], [0.64, 0.19]], 24, sm);
  for (let i = 0; i < 8; i++) { const an = (i / 8) * Math.PI * 2 + 0.3, c = Math.cos(an), s2 = Math.sin(an); G.tube([V(c * 0.66, 0.2, s2 * 0.66), V(c * 0.76 - s2 * 0.1, 0.2, s2 * 0.76 + c * 0.1), V(c * 0.88 + s2 * 0.1, 0.17, s2 * 0.88 - c * 0.1), V(c * 0.99 - s2 * 0.05, 0.13, s2 * 0.99 + c * 0.05), V(c * 1.08, 0.1, s2 * 1.08)].map((p) => p.applyMatrix4(sm)), 0.042, 7, 4); G.ball(V(c * 1.09, 0.1, s2 * 1.09).applyMatrix4(sm), 0.06, 1, 1, 1, 5); }
  // on the aegis: gold hem, snake curls, gorgoneion; shoulder pins
  { const hemP = []; for (let i = 0; i < 20; i++) { const an = (i / 20) * Math.PI * 2; hemP.push(V(cc.x + Math.sin(an) * 0.49, ay + 0.01, cc.z + 0.01 + Math.cos(an) * 0.355)); } G.tube(hemP, 0.028, 30, 5, true); }
  for (let i = 0; i < 7; i++) { const an = (i / 6 - 0.5) * 2.5, x = cc.x + Math.sin(an) * 0.5, z = cc.z + 0.02 + Math.cos(an) * 0.365, d = i % 2 ? 1 : -1; G.tube([[x, ay, z], [x + d * 0.07, ay - 0.05, z + 0.02], [x + d * 0.08, ay - 0.13, z + 0.02], [x, ay - 0.16, z + 0.03], [x - d * 0.04, ay - 0.11, z + 0.03]], 0.024, 6, 4); }
  const gm = aim([cc.x, cc.y + 0.2, cc.z + 0.36], [0, 0.12, 1]); G.lathe([[0.001, 0.1], [0.1, 0.085], [0.17, 0.04], [0.19, -0.02]], 14, gm);
  G.lathe([[0.17, 0.02], [0.2, 0.05], [0.23, 0.0]], 14, gm);
  for (const s of [-1, 1]) G.ball(V(s * 0.4, 0.66, 0.1).applyMatrix4(J.ch), 0.06, 1, 1, 1, 8);
  J.boxes[1].s[1] += 0.14; J.boxes[1].c[1] += 0.14; J.boxes[0].s[1] += 0.09; J.boxes[0].c[1] += 0.09;
  J.boxes[1].s[1] += 0.12; J.boxes[1].c[1] += 0.12; J.boxes[0].s[1] += 0.06; J.boxes[0].c[1] += 0.06;
  return { S, G, J, X };
};

GODS.apollo = () => {
  const S = new Sculpt(), G = new Gold();
  const kn = V(0.4, 0.05, 1).normalize(), kx = V(1, 0, -0.4).normalize(), ky = kn.clone().cross(kx).normalize(), kc = V(1.0, 4.0, 0.42), kp = (x, y, z = 0) => kc.clone().addScaledVector(kx, x).addScaledVector(ky, y).addScaledVector(kn, z);
  const J = figure(S, { young: true, soft: 0.35, hipX: -0.1, pelRoll: -0.07, chRoll: 0.04, chX: 0.02, head: [0.3, 0.02, 0.07],
    legR: { a: [-0.24, 0.25, 0], yaw: -0.2 }, legL: { a: [0.42, 0.3, -0.12], yaw: 0.5, pitch: 0.14, pole: [0.3, 0, 1] },
    armL: { g: kp(0.37, 0.1), ax: ky, rod: 0.045, palm: [-1, 0, 0.3], pole: [0.5, -0.4, -1] },
    armR: { w: kp(-0.42, 0.02, 0.2), dir: kx.clone().add(V(0, 0.1, -0.25)), palm: [-0.15, -0.2, -1], pole: [-0.6, -1, 0.2], curl: 0.3, spread: 0.25, fan: 0.12 } });
  hipWrap(S, J, { top: 3.28, bottom: 0.62, tilt: -0.13, n: 8, amp: 0.07, tw: 0.8, wa: 0.48, wb: 0.36, ba: 0.62, bb: 0.5, cx: 0.06, press: ["L"], roll: 0.05, weight: -1 });
  // mantle hanging down the back from both shoulders, pinned at the right shoulder
  const cc = J.cc; S.loft([[0.45, 0.05, -0.62, 0.76, 0.13], [2.2, 0.03, -0.54, 0.66, 0.13], [3.6, 0, -0.44, 0.56, 0.13], [4.6, cc.x, cc.z - 0.31, 0.6, 0.13], [4.98, cc.x, cc.z - 0.22, 0.56, 0.12]], { fold: folds(5, 0.04, 0.45, 5, 0, 0.3, 0.5), k: 0.04 });
  S.band([[-0.72, 4.75, -0.28], [-0.62, 5.03, -0.02], [-0.3, 4.86, 0.26], [0.2, 4.78, 0.3], [0.62, 5.03, 0.02], [0.74, 4.75, -0.28]], [0, 4.4, 0], 0.26, 3, 0.07, 0.04, 16);
  S.push(J.head); longHair(S); S.pop();
  wreath(G, J.head, { n: 9, len: 0.2, wid: 0.07, y: 0.2 });
  // kithara
  const sb = new THREE.Shape(); [[-0.3, -0.12], [-0.36, -0.45], [-0.26, -0.8], [0.26, -0.8], [0.36, -0.45], [0.3, -0.12], [0.12, -0.2], [-0.12, -0.2]].forEach(([x, y], i) => (i ? sb.lineTo(x, y) : sb.moveTo(x, y)));
  const km = new THREE.Matrix4().makeBasis(kx, ky, kn).setPosition(kc), bg = new THREE.ExtrudeGeometry(sb, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 }); bg.translate(0, 0, -0.06); G.add(bg, km);
  for (const s of [-1, 1]) { G.tube([kp(s * 0.3, -0.16), kp(s * 0.42, 0.05), kp(s * 0.36, 0.35), kp(s * 0.4, 0.62), kp(s * 0.5, 0.78)], 0.045, 14, 7); G.ball(kp(s * 0.52, 0.8), 0.07, 1, 1, 1, 8); G.ball(kp(s * 0.56, 0.66), 0.05, 1, 1, 1, 6); }
  G.rod(kp(-0.56, 0.66), kp(0.56, 0.66), 0.035, 0.035, 8); G.rod(kp(-0.2, -0.5, 0.08), kp(0.2, -0.5, 0.08), 0.03, 0.03, 6);
  for (let i = 0; i < 7; i++) { const x = (i / 6 - 0.5) * 0.34; G.rod(kp(x, -0.5, 0.09), kp(x * 1.5, 0.66, 0.02), 0.011, 0.011, 4); }
  G.ball(V(-0.5, 0.6, 0.12).applyMatrix4(J.ch), 0.07, 1, 1, 0.6, 8); // fibula
  J.boxes[1].s[1] += 0.14; J.boxes[1].c[1] -= 0.08;
  return { S, G, J };
};

GODS.hermes = () => {
  const S = new Sculpt(), G = new Gold(), rnd = rng(5), cad = V(-0.22, 0.95, 0.22).normalize();
  const J = figure(S, { young: true, soft: 0.1, pelYaw: -0.12, chYaw: 0.1, chZ: 0.1, chPitch: 0.08, hipZ: 0.0, head: [0.05, -0.05, 0],
    legL: { a: [0.3, 0.25, 0.58], yaw: 0.08 }, legR: { a: [-0.3, 0.5, -0.62], yaw: -0.1, pitch: 0.75, pole: [-0.1, 0, 1] },
    armR: { g: [-1.0, 4.25, 0.6], ax: cad, rod: 0.04, palm: [1, 0, 0.2], pole: [-0.6, -0.4, -1] },
    armL: { w: [1.0, 3.35, -0.5], dir: [0.15, -0.75, -0.6], palm: [-1, 0, 0], pole: [0.6, 0, -1], curl: 0.6 } });
  // short tunic belted at the waist
  hipWrap(S, J, { top: 3.55, bottom: 2.3, tilt: 0, n: 13, amp: 0.045, tw: 0, wa: 0.46, wb: 0.34, ba: 0.6, bb: 0.56, roll: 0.045 });
  // chlamys: pinned at the right shoulder, streaming out behind
  S.loft([[2.1, 0.3, -1.0, 0.5, 0.12], [2.6, 0.28, -0.98, 0.6, 0.13], [3.3, 0.22, -0.74, 0.6, 0.13], [4.1, 0.15, -0.46, 0.58, 0.13], [4.7, 0.1, -0.3, 0.62, 0.14], [5.0, 0.08, -0.16, 0.6, 0.13]], { fold: folds(6, 0.05, 2.1, 5, 0.5, 0.3, 0.5), k: 0.04 });
  S.band([[-0.7, 4.85, -0.2], [-0.56, 5.05, 0.08], [-0.25, 4.82, 0.34], [0.25, 4.7, 0.36], [0.72, 4.95, 0.14], [0.86, 4.6, -0.1], [0.8, 4.2, -0.3]], [0, 4.4, 0], 0.34, 4, 0.075, 0.04, 18);
  // petasos over short curls
  S.push(J.head); hairCap(S); curls(S, rnd, 90, 0.075, (p) => p.y < 0.22 && !(p.z > 0.2 && p.y < 0.12) && p.y > -0.3, 0.02, 1.05);
  S.ell([0, 0.25, 0.0], [0.56, 0.04, 0.56], [-0.1, 0, 0], 0.03).ell([0, 0.3, -0.02], [0.3, 0.2, 0.33], [-0.1, 0, 0], 0.04);
  S.pop();
  for (const s of [-1, 1]) G.wing(V(s * 0.3, 0.36, -0.04).applyMatrix4(J.head), V(s * 0.6, 0.7, -0.4).transformDirection(J.head), V(-s * 0.3, 1, 0.1), 0.66, 6);
  // winged sandals
  for (const n of ["L", "R"]) { const l = J.leg[n]; for (const s of [-1, 1]) G.wing(V(s * 0.13, 0.02, -0.06).applyMatrix4(l.fm), V(s * 0.35, 0.45, -0.85).transformDirection(l.fm), V(0, 1, 0.2).transformDirection(l.fm), 0.5, 5);
    G.add(new THREE.TorusGeometry(0.125, 0.022, 5, 14), l.fm.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.05, 0))); G.add(new THREE.TorusGeometry(0.165, 0.02, 5, 14), l.fm.clone().multiply(new THREE.Matrix4().makeScale(1, 0.75, 1).setPosition(0, -0.15, 0.3))); }
  // caduceus: staff, two snakes, wings
  const g0 = J.arm.R.G, cx = V(1, 0, 0).addScaledVector(cad, -cad.x).normalize(), cz = cx.clone().cross(cad), cp = (x, y, z) => g0.clone().addScaledVector(cx, x).addScaledVector(cad, y).addScaledVector(cz, z);
  G.rod(cp(0, -0.85, 0), cp(0, 2.05, 0), 0.036, 0.03, 8); G.ball(cp(0, 2.1, 0), 0.085, 1, 1, 1, 10); G.ball(cp(0, -0.87, 0), 0.05, 1, 1, 1, 6);
  for (const s of [-1, 1]) { const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20, an = t * Math.PI * 3.2, r = 0.2 * Math.sin(Math.min(1, t * 1.15 + 0.1) * Math.PI) * (0.55 + 0.45 * t) + 0.04; pts.push(cp(Math.sin(an) * r * s, 0.75 + t * 1.0, Math.cos(an) * r * s * 0.35)); }
    G.tube(pts, 0.033, 36, 6); G.ball(pts[20], 0.055, 1, 1, 1.3, 7); G.wing(cp(s * 0.03, 1.86, 0), cx.clone().multiplyScalar(s).addScaledVector(cad, 0.25), cad, 0.6, 6); }
  G.ball(V(-0.52, 0.6, 0.12).applyMatrix4(J.ch), 0.075, 1, 1, 0.6, 8);
  J.boxes[1].s[0] += 0.14; J.boxes[1].s[2] += 0.1;
  return { S, G, J };
};

GODS.dionysus = () => {
  const S = new Sculpt(), G = new Gold(), rnd = rng(3);
  const J = figure(S, { young: true, soft: 0.85, bareLegs: false, hipX: 0.11, pelRoll: 0.08, chRoll: -0.05, chX: -0.01, head: [-0.3, -0.22, -0.08],
    legL: { a: [0.26, 0.25, 0], yaw: 0.15 }, legR: { a: [-0.42, 0.3, 0.24], yaw: -0.5, pitch: 0.14, pole: [-0.3, 0, 1] },
    armR: { g: [-1.05, 6.25, 0.35], ax: [1, 0, 0.1], rod: 0.03, palm: [0, 0, 1], pole: [-1, -0.2, -0.4] },
    armL: { g: [0.85, 3.8, 0.62], ax: [0, 1, 0], rod: 0.045, palm: [-1, 0, 0.2], pole: [0.5, -0.4, -1] } });
  hipWrap(S, J, { top: 3.32, tilt: 0.15, n: 7, amp: 0.085, tw: -0.9, wa: 0.5, wb: 0.38, ba: 0.68, bb: 0.55, cx: -0.06, cz: 0.03, press: ["R"], roll: 0.055, weight: 1 });
  // a fawn-skin sash from the right shoulder across the chest to the left hip
  S.band([[-0.3, 4.2, -0.38], [-0.56, 4.75, -0.3], [-0.6, 5.04, -0.02], [-0.42, 4.78, 0.3], [0.0, 4.25, 0.36], [0.4, 3.7, 0.36], [0.56, 3.3, 0.22]], [0, 4.2, 0], 0.3, 3, 0.085, 0.05, 12);
  S.push(J.head); longHair(S, { n: 7 }); S.pop();
  // ivy wreath with berry clusters at the temples
  wreath(G, J.head, { n: 7, len: 0.2, wid: 0.15, y: 0.22, th: 0.22 });
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) G.ball(V(s * (0.27 + (i % 2) * 0.05), 0.24 - (i >> 1) * 0.07, 0.24 - (i % 2) * 0.04).applyMatrix4(J.head), 0.045, 1, 1, 1, 6);
  // grapes hanging from the raised fist
  const g0 = J.arm.R.G; G.tube([g0.clone().add(V(-0.22, 0.02, 0)), g0, g0.clone().add(V(0.2, 0.0, 0.03)), g0.clone().add(V(0.3, -0.12, 0.05))], 0.03, 8, 6);
  const bc = g0.clone().add(V(0.3, -0.2, 0.06));
  [[0, 5, 0.15], [0.15, 6, 0.17], [0.3, 5, 0.15], [0.44, 4, 0.11], [0.56, 3, 0.07], [0.68, 1, 0]].forEach(([dy, cnt, r], row) => { for (let i = 0; i < cnt; i++) { const an = (i / cnt) * Math.PI * 2 + row * 0.9; G.ball(bc.clone().add(V(Math.cos(an) * r, -dy, Math.sin(an) * r)), 0.088 + rnd() * 0.012, 1, 1, 1, 7); } if (row < 4) G.ball(bc.clone().add(V(0, -dy - 0.02, 0)), 0.1, 1, 1, 1, 6); });
  G.leaf(g0.clone().add(V(0.22, 0.02, 0.02)), V(0.7, 0.5, 0.3), V(0, 0.3, 1), 0.36, 0.3, 0.15); G.leaf(g0.clone().add(V(0.2, 0.0, 0.0)), V(-0.2, 0.3, 1), V(0, 1, 0), 0.3, 0.26, 0.15);
  // kantharos
  const k0 = J.arm.L.G, km = new THREE.Matrix4().setPosition(k0.x, k0.y - 0.16, k0.z);
  G.lathe([[0.001, 0], [0.15, 0], [0.14, 0.03], [0.05, 0.07], [0.04, 0.3], [0.09, 0.35], [0.2, 0.42], [0.24, 0.55], [0.25, 0.72], [0.28, 0.78], [0.24, 0.76], [0.2, 0.56], [0.001, 0.46]], 16, km);
  for (const s of [-1, 1]) G.tube([V(s * 0.2, 0.44, 0), V(s * 0.4, 0.56, 0), V(s * 0.44, 0.86, 0), V(s * 0.34, 0.92, 0), V(s * 0.26, 0.76, 0)].map((p) => p.applyMatrix4(km)), 0.028, 12, 6);
  J.boxes[1].s[1] += 0.14; J.boxes[1].c[1] -= 0.08;
  return { S, G, J };
};

GODS.hecate = () => {
  const S = new Sculpt(), G = new Gold(), flames = [];
  const J = figure(S, { fem: true, bareLegs: false, hipX: -0.04, pelRoll: -0.03, chRoll: 0.015, head: [0, 0.03, 0],
    legR: { a: [-0.2, 0.25, 0], yaw: -0.12 }, legL: { a: [0.27, 0.26, 0.16], yaw: 0.22, pole: [0.1, 0, 1] },
    armR: { g: [-1.02, 4.05, 0.62], ax: [-0.13, 1, 0.04], rod: 0.055, palm: [1, 0, 0.2], pole: [-0.5, -0.3, -1] },
    armL: { g: [1.02, 4.05, 0.62], ax: [0.13, 1, 0.04], rod: 0.055, palm: [-1, 0, 0.2], pole: [0.5, -0.3, -1] } });
  const pp = peplos(S, J, { press: "L", n: 13 });
  // hair parted and gathered; a veil falls from the crown down the back
  S.push(J.head); hairCap(S, 0.95); parted(S, { n: 6, to: 1.5, r: 0.065, wave: 0.11, from: 1.1, back: 0.1 });
  S.ell([0, 0.1, -0.13], [0.345, 0.37, 0.36], null, 0.02); S.ell([0, -0.25, -0.22], [0.3, 0.34, 0.2], null, 0.05);
  S.cone([-0.18, 0.4, 0.02], [0.18, 0.4, 0.02], 0.085, 0.085, 0.03); // polos band
  S.pop();
  const cc = J.cc; S.loft([[3.3, 0, -0.5, 0.56, 0.1], [4.2, cc.x, cc.z - 0.36, 0.5, 0.1], [4.85, cc.x, cc.z - 0.27, 0.46, 0.13], [5.35, cc.x, cc.z - 0.2, 0.36, 0.16]], { fold: folds(5, 0.045, 3.3, 5.3, 0, 0.5, 0.5), k: 0.05 });
  // crescent moon on the brow
  { const sh = new THREE.Shape(); const n = 16; for (let i = 0; i <= n; i++) { const a = (35 - (250 * i) / n) * Math.PI / 180; i ? sh.lineTo(Math.cos(a) * 0.3, Math.sin(a) * 0.3) : sh.moveTo(Math.cos(a) * 0.3, Math.sin(a) * 0.3); }
    for (let i = 0; i <= n; i++) { const a = (186.5 + (167 * i) / n) * Math.PI / 180; sh.lineTo(Math.cos(a) * 0.2476, 0.2 + Math.sin(a) * 0.2476); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1 }); g.translate(0, 0, -0.025); G.add(g, J.head.clone().multiply(rotM([0, 0.66, 0.06], 0, -0.1))); }
  // torches
  for (const n of ["L", "R"]) { const a = J.arm[n], ax = a.X.clone().multiplyScalar(a.X.y > 0 ? 1 : -1), b = a.G.clone().addScaledVector(ax, -0.75), t = a.G.clone().addScaledVector(ax, 1.75);
    G.rod(b, t, 0.045, 0.085, 10); G.ball(b, 0.06, 1, 1, 1, 6); for (const u of [0.45, 0.62, 0.8]) G.rod(b.clone().lerp(t, u), b.clone().lerp(t, u + 0.03), 0.045 + 0.04 * u + 0.022, 0.045 + 0.04 * u + 0.022, 10);
    G.lathe([[0.001, 0], [0.09, 0], [0.17, 0.1], [0.2, 0.22], [0.16, 0.2], [0.001, 0.12]], 12, aim(t, ax)); flames.push(t.clone().addScaledVector(ax, 0.12)); }
  for (const s of [-1, 1]) G.ball(V(s * 0.36, 0.63, 0.1).applyMatrix4(J.ch), 0.06, 1, 1, 1, 8);
  // the key of the crossroads at her girdle
  { const kx = pp.mx + 0.2, ky = pp.wy - 0.1, kz = pp.mz + 0.36; G.add(new THREE.TorusGeometry(0.07, 0.02, 5, 12), new THREE.Matrix4().setPosition(kx, ky, kz)); G.rod([kx, ky - 0.07, kz], [kx, ky - 0.42, kz], 0.02, 0.02, 6); G.rod([kx, ky - 0.4, kz], [kx + 0.1, ky - 0.4, kz], 0.02, 0.02, 5); G.rod([kx, ky - 0.32, kz], [kx + 0.08, ky - 0.32, kz], 0.02, 0.02, 5); }
  J.boxes[1].s[1] += 0.08; J.boxes[1].c[1] += 0.04;
  return { S, G, J, flames };
};

// ------------------------------------------------------------------ assembly
let mats = null;
function marbleTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 512; const g = c.getContext("2d"), r = rng(7); g.fillStyle = "#f6f1e8"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 70; i++) { const x = r() * 512, y = r() * 512, rad = 30 + r() * 100, gr = g.createRadialGradient(x, y, 0, x, y, rad); const col = ["255,251,243", "226,217,208", "236,230,240"][i % 3]; gr.addColorStop(0, `rgba(${col},0.5)`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr;
    for (const [dx, dy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) g.fillRect(x - rad + dx, y - rad + dy, rad * 2, rad * 2); }
  for (let v = 0; v < 12; v++) { let x = r() * 512, y = r() * 512, a = r() * 6.28; g.strokeStyle = `rgba(122,112,132,${0.06 + r() * 0.2})`; g.lineWidth = 0.6 + r() * 1.6; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 90; s++) { a += (r() - 0.5) * 0.7; x += Math.cos(a) * 6; y += Math.sin(a) * 6; g.lineTo(x, y); } g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function materials() {
  if (mats) return mats;
  const map = (M.marble && M.marble.map) || marbleTexture();
  mats = { marble: new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.5, metalness: 0 }),
    gold: M.gold || new THREE.MeshStandardMaterial({ color: 0xf0c24a, metalness: 0.6, roughness: 0.32, emissive: 0x5a3800, emissiveIntensity: 0.45 }),
    flame: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) };
  return mats;
}
function flameGeo() {
  const pr = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pr.push(new THREE.Vector2(Math.sin(Math.PI * Math.pow(t, 0.62)) * 0.2 * (1 - t * 0.25) + 0.002, t * 0.85)); }
  const g = new THREE.LatheGeometry(pr, 12), p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 0.85; p.setX(i, p.getX(i) + Math.sin(t * 4) * 0.04 * t); c[i * 3] = 1; c[i * 3 + 1] = 0.82 - t * 0.6; c[i * 3 + 2] = 0.3 - t * 0.28; }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3)); g.computeVertexNormals(); return g;
}
// Per god: the pose, gold and flame points are computed at once (cheap); the marble is meshed in a few short jobs.
const cache = {}, queue = []; let pumping = false, plinth = null;
function define(god) {
  if (cache[god]) return cache[god];
  QS = QGOD[god] || 1; const { S, G, J, X = [], flames = [], opts = {} } = (GODS[god] || GODS.zeus)();
  const gold = G.merged(); if (gold) gold.translate(0, PLINTH, 0);
  const c = (cache[god] = { god, gold, marble: null, parts: [], waiting: [], done: [], flames: flames.map((f) => A3(f).add(V(0, PLINTH, 0))) });
  c.jobs = meshJobs(S, J.boxes, opts).map((j) => () => c.parts.push(j().translate(0, PLINTH, 0)));
  c.jobs.push(() => { const parts = c.parts.filter((g) => g.index.count > 0); parts.push(...X.map((g) => g.translate(0, PLINTH, 0)), plinthGeo()); c.marble = mergeGeometries(parts, false); c.parts = null;
    for (const m of c.waiting) m.geometry = c.marble; c.waiting = null; for (const r of c.done) r(); c.done = null; });
  return c;
}
function finish(c) { while (c.jobs.length) c.jobs.shift()(); }
function pump() { const c = queue[0]; if (!c) { pumping = false; return; } if (c.jobs.length) c.jobs.shift()(); if (!c.jobs.length) queue.shift(); setTimeout(pump, 0); }
// makeStatue(god, { scale, sync }). The group is returned at once with plinth, gold and flames; the marble figure appears a moment
// later (group.userData.ready resolves), built in short jobs so the page never freezes. sync: true builds it before returning.
export function makeStatue(god, opts = {}) {
  const g = new THREE.Group(); g.name = "statue-" + god; g.userData.god = god; g.userData.flames = [];
  const c = define(god), m = materials();
  if (!c.marble && (opts.sync || typeof setTimeout !== "function")) finish(c);
  const body = new THREE.Mesh(c.marble || (plinth = plinth || plinthGeo()), m.marble); body.castShadow = body.receiveShadow = true; g.add(body);
  if (c.marble) g.userData.ready = Promise.resolve(g);
  else { c.waiting.push(body); g.userData.ready = new Promise((r) => c.done.push(() => r(g))); if (!queue.includes(c)) queue.push(c); if (!pumping) { pumping = true; setTimeout(pump, 0); } }
  if (c.gold) { const au = new THREE.Mesh(c.gold, m.gold); au.castShadow = true; g.add(au); }
  if (c.flames.length) { const fg = (cache._flame = cache._flame || flameGeo()); for (const p of c.flames) { const f = new THREE.Mesh(fg, m.flame); f.position.copy(p); g.add(f); g.userData.flames.push(f); } }
  if (opts.scale) g.scale.setScalar(opts.scale);
  return g;
}
