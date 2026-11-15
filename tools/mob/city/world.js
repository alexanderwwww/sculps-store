// The static town: terrain, painted ground, every building (generated from config), trees, plaza. All merged for few draw calls.
import { THREE, Geo, G, cylT, hash, smooth, lerp, canvasTex, plasterTex } from "./gfx.js";
import { PLAZA, SNOW_ZONES, PLOTS } from "./config.mjs";

export const SEA = 0, HALF = 130;
export function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), h = (a, b) => hash(a * 127.1 + b * 311.7); return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v; }
export function snowAmt(x, z) { let a = 0; for (const s of SNOW_ZONES) a = Math.max(a, 1 - smooth(s.r0, s.r1, Math.hypot(x - s.c[0], z - s.c[1]))); return a; }
export function height(x, z) {
  const ang = Math.atan2(z, x), r = Math.hypot(x, z) + (vnoise(Math.cos(ang) * 2.2 + 5, Math.sin(ang) * 2.2) - 0.5) * 12;
  let h = 3.2 - 9 * smooth(78, 104, r);
  h += 8 * Math.exp(-((z + 60) ** 2) / (2 * 16 * 16) - (x * x) / (2 * 34 * 34));
  h += 11 * Math.exp(-((x + 74) ** 2 + (z + 60) ** 2) / (2 * 15 * 15));
  const far = smooth(26, 50, Math.hypot(x, z));
  h += ((vnoise(x * 0.07, z * 0.07) - 0.5) * 3.2 + (vnoise(x * 0.23, z * 0.23) - 0.5) * 0.7) * far;
  return h;
}
const plazaR = 14;
export function groundY(x, z) { return height(x, z); }

// ---------- painted terrain ----------
export function makeTerrain(paths) {
  const SEG = 190, geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, SEG, SEG); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, Math.max(-6, height(p.getX(i), p.getZ(i))));
  const uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + HALF) / (HALF * 2), 1 - (p.getZ(i) + HALF) / (HALF * 2) * 0 - 0); // set below
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + HALF) / (HALF * 2), (p.getZ(i) + HALF) / (HALF * 2));
  geo.computeVertexNormals();
  const N = 512, hg = new Float32Array(N * N); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) hg[j * N + i] = height(-HALF + (i + 0.5) * (HALF * 2 / N), -HALF + (j + 0.5) * (HALF * 2 / N));
  const base = document.createElement("canvas"); base.width = base.height = N; const bx = base.getContext("2d"), id = bx.createImageData(N, N);
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const h = hg[j * N + i], x = -HALF + (i + 0.5) * (HALF * 2 / N), z = -HALF + (j + 0.5) * (HALF * 2 / N);
    const sl = Math.hypot((hg[j * N + Math.min(N - 1, i + 1)] - hg[j * N + Math.max(0, i - 1)]), (hg[Math.min(N - 1, j + 1) * N + i] - hg[Math.max(0, j - 1) * N + i])) / (2 * HALF * 2 / N);
    const n = vnoise(x * 0.11, z * 0.11), n2 = vnoise(x * 0.4, z * 0.4);
    let c = mix([112, 150, 70], [168, 168, 84], smooth(0.25, 0.8, n) * 0.8 + n2 * 0.2);       // green to dry gold
    c = mix(c, [150, 138, 100], smooth(5, 9, h) * 0.7);                                        // dry hill
    c = mix(c, [142, 134, 122], smooth(0.5, 0.95, sl));                                        // rock on slopes
    c = mix([226, 205, 150], c, smooth(0.5, 1.7, h));                                          // sand
    c = mix([70, 168, 178], c, smooth(-3, 0.1, h));                                            // shallows
    c = mix(c, [236, 242, 252], snowAmt(x, z) * smooth(-0.2, 0.6, h) * (1 - smooth(0.9, 1.2, sl) * 0.5)); // snow
    const o = (j * N + i) * 4; id.data[o] = c[0]; id.data[o + 1] = c[1]; id.data[o + 2] = c[2]; id.data[o + 3] = 255;
  }
  bx.putImageData(id, 0, 0);
  const T = 2048, cv = document.createElement("canvas"); cv.width = cv.height = T; const c = cv.getContext("2d"); c.imageSmoothingEnabled = true; c.drawImage(base, 0, 0, T, T);
  const W = (v) => (v + HALF) / (HALF * 2) * T, S = T / (HALF * 2);
  // brush strokes (grass blades, flowers, pebbles) only where it is land
  for (let i = 0; i < 52000; i++) {
    const x = (hash(i * 3.1) - 0.5) * HALF * 2, z = (hash(i * 5.7 + 1) - 0.5) * HALF * 2, h = height(x, z); if (h < 0.9) continue;
    const sn = snowAmt(x, z), k = hash(i + 9);
    c.strokeStyle = sn > 0.5 ? `rgba(${200 + k * 50 | 0},${215 + k * 35 | 0},255,.35)` : k < 0.5 ? `rgba(${70 + k * 90 | 0},${120 + k * 90 | 0},50,.30)` : `rgba(${190 + k * 50 | 0},${180 + k * 50 | 0},90,.28)`;
    c.lineWidth = 2 + hash(i + 2) * 2; c.beginPath(); c.moveTo(W(x), W(z)); c.lineTo(W(x) + (hash(i + 4) - 0.5) * 10, W(z) - 6 - hash(i + 6) * 10); c.stroke();
  }
  for (let i = 0; i < 1400; i++) { const x = (hash(i * 7.3) - 0.5) * 150, z = (hash(i * 2.9 + 5) - 0.5) * 150, h = height(x, z); if (h < 1.5 || snowAmt(x, z) > 0.4) continue; c.fillStyle = ["#ff6fa8", "#fff2a0", "#ffffff", "#c58aff", "#ff9a5a"][i % 5]; c.beginPath(); c.arc(W(x), W(z), 2.2 + hash(i) * 2.5, 0, 7); c.fill(); }
  // paths: plaza disc, radial lanes to each door, ring road
  const lane = (pts, w) => { c.lineCap = c.lineJoin = "round"; c.strokeStyle = "rgba(120,96,64,.55)"; c.lineWidth = w * S + 6; c.beginPath(); pts.forEach((q, k) => (k ? c.lineTo(W(q[0]), W(q[1])) : c.moveTo(W(q[0]), W(q[1])))); c.stroke(); c.strokeStyle = "#e7d7ae"; c.lineWidth = w * S; c.stroke(); };
  for (const pth of paths) lane(pth, 2.4);
  c.beginPath(); c.arc(W(0), W(0), 30 * S, 0, 7); c.strokeStyle = "rgba(120,96,64,.5)"; c.lineWidth = 3.2 * S + 6; c.stroke(); c.strokeStyle = "#e7d7ae"; c.lineWidth = 3.2 * S; c.stroke();
  const pz = plazaR * S; c.fillStyle = "#efe2c0"; c.beginPath(); c.arc(W(0), W(0), pz, 0, 7); c.fill(); c.strokeStyle = "rgba(120,96,64,.6)"; c.lineWidth = 6; c.stroke();
  c.strokeStyle = "rgba(150,125,90,.55)"; c.lineWidth = 2; for (let r = 3; r < plazaR; r += 2.2) { c.beginPath(); c.arc(W(0), W(0), r * S, 0, 7); c.stroke(); }
  for (let a = 0; a < 24; a++) { c.beginPath(); c.moveTo(W(0), W(0)); c.lineTo(W(Math.cos(a / 24 * 6.283) * plazaR), W(Math.sin(a / 24 * 6.283) * plazaR)); c.stroke(); }
  for (let i = 0; i < 900; i++) { const a = hash(i) * 6.283, r = hash(i + 3) * plazaR; c.fillStyle = `rgba(${150 + hash(i) * 60 | 0},${130 + hash(i) * 50 | 0},100,.35)`; c.beginPath(); c.arc(W(Math.cos(a) * r), W(Math.sin(a) * r), 2 + hash(i + 1) * 3, 0, 7); c.fill(); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, flatShading: true }));
  mesh.receiveShadow = true; return mesh;
}

// ---------- sign atlas ----------
export class Atlas {
  constructor() { this.cells = []; this.cols = 4; this.cw = 512; this.ch = 128; this.rows = 16; }
  add(def) { this.cells.push(def); const i = this.cells.length - 1, c = i % this.cols, r = Math.floor(i / this.cols); return [c / this.cols + 0.002, 1 - (r + 1) / this.rows + 0.002, 1 / this.cols - 0.004, 1 / this.rows - 0.004]; }
  texture() {
    return canvasTex(this.cols * this.cw, this.rows * this.ch, (x) => {
      this.cells.forEach((d, i) => {
        const X = (i % this.cols) * this.cw, Y = Math.floor(i / this.cols) * this.ch, w = this.cw, h = this.ch;
        x.save(); x.beginPath(); x.rect(X, Y, w, h); x.clip();
        if (d.hazard) { x.fillStyle = "#f2c01c"; x.fillRect(X, Y, w, h); x.fillStyle = "#222"; for (let k = -h; k < w + h; k += 44) { x.beginPath(); x.moveTo(X + k, Y + h); x.lineTo(X + k + 22, Y + h); x.lineTo(X + k + 22 + h, Y); x.lineTo(X + k + h, Y); x.fill(); } x.fillStyle = "rgba(20,16,10,.88)"; x.fillRect(X + 14, Y + 14, w - 28, h - 28); }
        else { const g = x.createLinearGradient(0, Y, 0, Y + h); g.addColorStop(0, d.bg); g.addColorStop(1, shade(d.bg, 0.65)); x.fillStyle = g; x.fillRect(X, Y, w, h); }
        x.strokeStyle = d.hazard ? "#f2c01c" : "#f0c868"; x.lineWidth = 6; x.strokeRect(X + 5, Y + 5, w - 10, h - 10);
        x.fillStyle = d.fg || "#fff7e4"; x.textAlign = "center"; x.textBaseline = "middle";
        let size = d.sub ? 58 : 66; x.font = `800 ${size}px "Trebuchet MS","Segoe UI",Arial,sans-serif`; while (x.measureText(d.text).width > w - 56 && size > 20) { size -= 2; x.font = `800 ${size}px "Trebuchet MS","Segoe UI",Arial,sans-serif`; }
        x.shadowColor = "rgba(0,0,0,.55)"; x.shadowBlur = 5; x.fillText(d.text, X + w / 2, Y + (d.sub ? h * 0.40 : h / 2 + 2));
        if (d.sub) { x.shadowBlur = 0; x.font = '700 28px "Trebuchet MS",Arial,sans-serif'; x.fillStyle = d.subColor || "#ffe9b0"; x.fillText(d.sub, X + w / 2, Y + h * 0.80); }
        x.restore();
      });
    });
  }
}
function shade(hex, k) { const c = new THREE.Color(hex); return `rgb(${c.r * k * 255 | 0},${c.g * k * 255 | 0},${c.b * k * 255 | 0})`; }
const STAT_TXT = { open: "OPEN", construction: "OPENING SOON", closed: "CLOSED", planned: "COMING SOON" };

function baseHeight(x, z, w, d, ry) {
  let m = -9; const c = Math.cos(ry), s = Math.sin(ry);
  for (const [a, b] of [[0, 0], [-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) m = Math.max(m, height(x + a * c + b * s, z - a * s + b * c));
  return m;
}
const WALLS = ["#f7f2e6", "#f2ebdd", "#faf6ee", "#efe6d2"];
const STONE = "#cdc3b0", DARK = "#243a58", GOLD = "#f0c040", WOOD = "#6a4428";

export function buildTown(layout, ctx) {
  // ctx: {status(id)->status, atlas, decor:{christmas,bf,celebrate,newyear}, X:{halos,chimneys,colliders,picks,blades,doors,spots}}
  const g = new Geo(), X = ctx.X;
  const D = ctx.decor || {};
  for (const [bi, b] of layout.entries()) {
    g.seed = bi + 1;
    const st = ctx.status(b.id), [w0, d0, h0] = b.size, ry = b.ry, [x, z] = b.pos;
    const small = st === "closed" ? 0.62 : 1, w = w0 * small, d = d0 * small, h = h0 * (st === "closed" ? 0.55 : 1);
    const by = baseHeight(x, z, w0, d0, ry);
    g.base.makeRotationY(ry).setPosition(x, by, z); g.baseY = by;
    const Y0 = 0.35, wall = WALLS[bi % 4], P = (t, s, p, c, r, tg) => g.part(t, s, p, c, r || [0, 0, 0], tg || "solid");
    const sn = snowAmt(x, z);
    const door = [x + Math.sin(ry) * (d0 / 2 + 2.6), z + Math.cos(ry) * (d0 / 2 + 2.6)];
    X.doors[b.id] = door;
    X.colliders.push({ x, z, hw: w0 / 2 + 0.25, hd: d0 / 2 + 0.25, ry });
    X.picks.push({ id: b.id, c: [x, by + h0 / 2 + 1, z], s: [w0 + 1, h0 + 3, d0 + 1], ry });
    P("box", [w0 + 0.5, 3.4, d0 + 0.5], [0, -1.35, 0], STONE);
    const sign = (text, sub, bg, opts = {}) => { const Sw = Math.min(Math.max(w0 * 0.95, 4.8), 7), Sh = Sw / 4, rect = ctx.atlas.add({ text, sub, bg, ...opts }); const yy = Y0 + h + Sh / 2 + 0.55;
      P("box", [Sw + 0.25, Sh + 0.25, 0.18], [0, yy, d / 2 - 0.15], WOOD, [-0.08, 0, 0]); P("box", [0.18, 0.7, 0.18], [-Sw * 0.4, yy - Sh / 2 - 0.25, d / 2 - 0.25], WOOD); P("box", [0.18, 0.7, 0.18], [Sw * 0.4, yy - Sh / 2 - 0.25, d / 2 - 0.25], WOOD);
      g.sign(Sw, Sh, [0, yy - 0.01, d / 2 - 0.04], [-0.08, 0, 0], rect); };
    const win = (px, py, pz, r, lit) => g.frame([px, py, pz], r, () => {
      P("box", [1.25, 1.55, 0.14], [0, 0, 0], b.trim); P("box", [0.95, 1.25, 0.18], [0, 0, 0.01], lit ? "#ffc968" : DARK, [0, 0, 0], lit ? "glow" : "solid");
      P("box", [0.46, 1.45, 0.1], [-0.88, 0, 0.02], b.accent); P("box", [0.46, 1.45, 0.1], [0.88, 0, 0.02], b.accent); P("box", [1.5, 0.12, 0.34], [0, -0.82, 0.12], b.trim);
      if (lit) X.halos.push({ p: g.world([0, 0, 0.5]), s: 2.2, a: 0.5 }); });
    const lantern = (px) => { P("box", [0.1, 2.3, 0.1], [px, Y0 + 1.15, d / 2 + 0.45], "#2a2a30"); P("box", [0.32, 0.44, 0.32], [px, Y0 + 2.45, d / 2 + 0.45], "#ffcf6a", [0, 0, 0], "glow"); X.halos.push({ p: g.world([px, Y0 + 2.45, d / 2 + 0.45]), s: 3.2, a: 0.9 }); };

    if (b.kind === "bank") { bank(g, b, ctx, w0, d0, Y0, by); }
    else if (b.kind === "home") { villa(g, b, ctx, w0, d0, Y0, by, X); }
    else if (b.style === "stall") { stall(g, b, st, ctx, w0, d0, Y0, sign, lantern); }
    else if (st === "planned") {
      fence(P, w0, d0, Y0); sign(b.name, "COMING SOON", "#8a7a5a", { fg: "#2a1c00", subColor: "#4a3a20" });
      P("ico", [0.7, 0.5, 0.7], [-w0 * 0.25, Y0 + 0.3, 0.2], "#6c9a40");
    } else if (st === "closed") {
      P("box", [w, h, d], [0, Y0 + h / 2, 0], "#b9b2a4"); P("box", [w + 0.1, 0.25, d + 0.1], [0, Y0 + h + 0.12, 0], "#8e887c");
      P("box", [1.1, 1.8, 0.14], [0, Y0 + 0.9, d / 2 + 0.05], "#4a3a2a"); P("box", [1.5, 0.14, 0.1], [0, Y0 + 1.0, d / 2 + 0.14], "#6a5030", [0, 0, 0.5]); P("box", [1.5, 0.14, 0.1], [0, Y0 + 1.0, d / 2 + 0.14], "#6a5030", [0, 0, -0.5]);
      for (const i of [-1, 1]) { P("box", [0.8, 0.9, 0.12], [i * w * 0.3, Y0 + h * 0.6, d / 2 + 0.05], "#3a3228"); P("box", [1.0, 0.12, 0.1], [i * w * 0.3, Y0 + h * 0.6, d / 2 + 0.12], "#7a6040", [0, 0, 0.4]); }
      fence(P, w0, d0, Y0); sign(b.name, "CLOSED", "#6a6a70", { fg: "#e8e8ee", subColor: "#c0c0c8" });
      for (let i = 0; i < 5; i++) P("ico0", 0.25, [(hash(bi + i) - 0.5) * w0, Y0 + 0.15, d / 2 + 0.8 + hash(i) * 1.5], "#8a8a4a");
    } else if (st === "construction") {
      const hh = h * 0.58;
      P("box", [w, hh, d], [0, Y0 + hh / 2, 0], "#d8d0bc"); P("box", [w * 0.6, hh * 0.5, d * 0.6], [w * 0.15, Y0 + hh + hh * 0.25, -d * 0.1], "#cfc6b0");
      for (let i = 0; i < 4; i++) P("box", [w / 4 - 0.1, 0.3, d + 0.1], [-w * 0.375 + i * w / 4, Y0 + hh + 0.15, 0], i % 2 ? "#c0b8a4" : "#d4ccb8");
      for (const side of [1, -1]) for (let k = 0; k <= 3; k++) { const px = -w / 2 + k * w / 3; P("cyl", [0.07, h * 1.0, 0.07], [px, Y0 + h * 0.5, side * (d / 2 + 0.9)], "#8a8a92"); }
      for (let lv = 1; lv <= 3; lv++) { P("box", [w + 0.4, 0.1, 1.2], [0, Y0 + lv * h * 0.3, d / 2 + 0.9], "#a87a44"); P("box", [w + 0.4, 0.06, 0.06], [0, Y0 + lv * h * 0.3 + 0.9, d / 2 + 1.5], "#8a8a92"); }
      P("box", [0.06, h, 0.06], [-w / 3, Y0 + h * 0.5, d / 2 + 0.9], "#8a8a92", [0, 0, 0.55]);
      // crane
      g.frame([w / 2 + 2.4, 0, -d / 2 - 1], 0, () => { P("box", [1.4, 0.5, 1.4], [0, Y0 + 0.25, 0], "#777"); for (const [a, c2] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) P("cyl", [0.06, 11, 0.06], [a, Y0 + 5.7, c2], "#f2b21c"); for (let k = 0; k < 9; k++) P("box", [0.7, 0.07, 0.07], [0, Y0 + 1 + k * 1.2, 0.3], "#f2b21c"); P("box", [0.8, 0.8, 0.8], [0, Y0 + 11.4, 0], "#f2b21c"); X.cranes.push({ p: g.world([0, Y0 + 11.9, 0]), len: 7, ry }); });
      for (let i = 0; i < 3; i++) P("box", [0.5, 0.3, 0.3], [-w / 2 + 0.6 + (i % 2) * 0.55, Y0 + 0.15 + Math.floor(i / 2) * 0.3, d / 2 + 2.6], "#b5482a");
      for (let i = 0; i < 2; i++) P("cone", [0.22, 0.55, 0.22], [w / 2 - 0.5 - i * 0.7, Y0 + 0.28, d / 2 + 2.4], "#ff7a1a");
      sign(b.name, "OPENING SOON", "#222", { hazard: true });
    } else {
      // ---- OPEN: whitewashed Cycladic cube with blue accents, lit windows ----
      const lit = true;
      P("box", [w, h, d], [0, Y0 + h / 2, 0], wall);
      P("box", [w * 0.62, h * 0.5, d * 0.62], [w * 0.14, Y0 + h + h * 0.25, -d * 0.1], wall);
      P("box", [w + 0.2, 0.32, 0.26], [0, Y0 + h + 0.16, d / 2], wall); P("box", [0.26, 0.32, d], [-w / 2, Y0 + h + 0.16, 0], wall); P("box", [0.26, 0.32, d], [w / 2, Y0 + h + 0.16, 0], wall); P("box", [w + 0.2, 0.32, 0.26], [0, Y0 + h + 0.16, -d / 2], wall);
      P("box", [1.9, 2.75, 0.16], [0, Y0 + 1.37, d / 2 + 0.04], b.trim); P("cyl", [0.95, 0.16, 0.95], [0, Y0 + 2.75, d / 2 + 0.04], b.trim, [Math.PI / 2, 0, 0]);
      P("box", [1.4, 2.3, 0.2], [0, Y0 + 1.15, d / 2 + 0.1], b.accent); P("cyl", [0.7, 0.2, 0.7], [0, Y0 + 2.3, d / 2 + 0.1], b.accent, [Math.PI / 2, 0, 0]); P("sph", 0.09, [0.45, Y0 + 1.1, d / 2 + 0.25], GOLD);
      for (const i of [-1, 1]) { win(i * w * 0.3, Y0 + h * 0.58, d / 2 + 0.04, 0, lit); win(i * (w / 2 + 0.03), Y0 + h * 0.58, 0, i * Math.PI / 2, lit); }
      for (let k = 0; k < 5; k++) P("box", [w * 0.6 / 5, 0.09, 1.6], [-w * 0.3 + (k + 0.5) * w * 0.6 / 5, Y0 + 3.15, d / 2 + 0.85], k % 2 ? "#fff" : b.accent, [0.42, 0, 0]);
      P("box", [2.6, 0.22, 1.0], [0, Y0 + 0.11, d / 2 + 0.6], STONE);
      for (const i of [-1, 1]) { P("box", [0.5, 0.45, 0.5], [i * (w / 2 - 0.4), Y0 + 0.22, d / 2 + 0.7], "#b8643a"); P("ico", [0.55, 0.45, 0.55], [i * (w / 2 - 0.4), Y0 + 0.7, d / 2 + 0.7], i > 0 ? "#e0388c" : "#ff6fb0"); }
      P("ico", [0.5, 1.4, 0.5], [-w / 2 - 0.1, Y0 + 1.6, d / 2 - 0.3], "#e0388c");
      lantern(1.55); lantern(-1.55);
      P("box", [0.7, 1.2, 0.7], [-w * 0.3, Y0 + h + 0.6, -d * 0.3], "#d8cfc0"); X.chimneys.push(g.world([-w * 0.3, Y0 + h + 1.3, -d * 0.3]));
      if (b.dome) {} 
      P("cyl", [w * 0.2, 0.35, w * 0.2], [w * 0.14, Y0 + h * 1.5 + 0.18, -d * 0.1], "#f4efe4"); P("hemi", [w * 0.2, w * 0.2, w * 0.2], [w * 0.14, Y0 + h * 1.5 + 0.35, -d * 0.1], "#2a62c8"); P("cyl", [0.05, 0.6, 0.05], [w * 0.14, Y0 + h * 1.5 + w * 0.2 + 0.55, -d * 0.1], GOLD);
      if (sn > 0.45) { P("box", [w + 0.3, 0.22, d + 0.3], [0, Y0 + h + 0.4, 0], "#f6fbff"); P("box", [w * 0.62, 0.2, d * 0.62], [w * 0.14, Y0 + h * 1.5 + 0.1, -d * 0.1], "#f6fbff"); }
      if (D.christmas || D.celebrate) { P("tor", [0.55, 0.55, 0.55], [0, Y0 + 3.2, d / 2 + 0.22], "#1f7a3a", [0, 0, 0]); P("box", [0.3, 0.2, 0.08], [0, Y0 + 2.7, d / 2 + 0.3], "#d82a2a"); for (let k = 0; k < 11; k++) { const px = -w / 2 + 0.4 + k * (w - 0.8) / 10; P("box", [0.16, 0.16, 0.16], [px, Y0 + h - 0.1, d / 2 + 0.18], ["#ff4a4a", "#ffd84a", "#4aff7a", "#4ab0ff"][k % 4], [0, 0, 0], "glow"); } }
      if (D.bf && b.kind === "store") { const rect = ctx.atlas.add({ text: "BLACK FRIDAY", sub: "THE BIG DAYS", bg: "#101014", fg: "#ffd24a" }); P("box", [0.06, 2.6, 0.06], [w * 0.36, Y0 + h - 0.1, d / 2 + 0.3], "#222"); g.sign(2.6, 0.65, [w * 0.36 + 1.1, Y0 + h - 0.35, d / 2 + 0.34], [0, 0, 0], rect); }
      sign(b.name, null, b.accent === "#15151a" ? "#1b1b22" : darken(b.accent));
      (PROPS[b.prop] || PROPS.flag)(P, g, b, w, d, h, Y0, X);
      if (b.kind === "super") superMarket(P, w, d, Y0);
    }
    if (st !== "open" && b.kind !== "bank") { /* nothing glows */ }
    X.spots[b.id] = { door, by, top: by + h0 + Y0 };
  }
  return g;
}
const darken = (hex) => { const c = new THREE.Color(hex); c.multiplyScalar(0.55); return "#" + c.getHexString(); };
function fence(P, w, d, Y0) { for (let i = 0; i <= 8; i++) { const x = -w / 2 + (i / 8) * w; P("box", [0.12, 0.9, 0.12], [x, Y0 + 0.45, d / 2 + 2.6], "#8a6a44"); } P("box", [w, 0.08, 0.08], [0, Y0 + 0.75, d / 2 + 2.6], "#a88454"); P("box", [w, 0.08, 0.08], [0, Y0 + 0.4, d / 2 + 2.6], "#a88454"); }
function stall(g, b, st, ctx, w, d, Y0, sign) {
  const P = (t, s, p, c, r, tg) => g.part(t, s, p, c, r || [0, 0, 0], tg || "solid");
  P("box", [w, 0.3, d], [0, Y0 + 0.15, 0], "#a8844e");
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P("cyl", [0.1, 3.2, 0.1], [px * (w / 2 - 0.2), Y0 + 1.9, pz * (d / 2 - 0.2)], WOOD);
  for (let k = 0; k < 8; k++) P("box", [w / 8, 0.1, d + 0.8], [-w / 2 + (k + 0.5) * w / 8, Y0 + 3.55 - (k % 1) * 0, 0], k % 2 ? "#fff" : b.accent, [0.12, 0, 0]);
  P("box", [w, 2.4, 0.2], [0, Y0 + 1.5, -d / 2 + 0.1], "#e8dcc0"); P("box", [w * 0.9, 0.95, 0.8], [0, Y0 + 0.78, d / 2 - 0.5], WOOD); P("box", [w * 0.92, 0.1, 0.9], [0, Y0 + 1.3, d / 2 - 0.5], "#9a6a3a");
  sign(b.name, st === "construction" ? "PAPER ONLY" : null, darken(b.accent));
  (PROPS[b.prop] || PROPS.flag)(P, g, b, w, d, 2.6, Y0, ctx.X);
  P("box", [0.3, 0.4, 0.3], [w / 2 - 0.2, Y0 + 3.7, d / 2], "#ffcf6a", [0, 0, 0], "glow"); ctx.X.halos.push({ p: g.world([w / 2 - 0.2, Y0 + 3.7, d / 2]), s: 3, a: 0.9 });
}
function superMarket(P, w, d, Y0) {
  for (let i = 0; i < 3; i++) { P("box", [1.2, 1.6, 0.14], [-w * 0.3 + i * 1.5, Y0 + 1.0, d / 2 + 0.08], "#bfe8ff"); P("box", [1.0, 1.4, 0.16], [-w * 0.3 + i * 1.5, Y0 + 1.0, d / 2 + 0.1], "#ffe6a0", [0, 0, 0], "glow"); }
  P("box", [0.5, 0.5, 0.5], [w / 2 - 0.6, Y0 + 0.3, d / 2 + 1.0], "#e8a03a"); P("box", [0.5, 0.5, 0.5], [w / 2 - 1.2, Y0 + 0.3, d / 2 + 1.0], "#7ac04a"); P("sph", 0.3, [w / 2 - 0.9, Y0 + 0.85, d / 2 + 1.0], "#e0383a");
}
function bank(g, b, ctx, w, d, Y0, by) {
  const P = (t, s, p, c, r, tg) => g.part(t, s, p, c, r || [0, 0, 0], tg || "solid");
  P("box", [w + 0.5, 3.4, d + 0.5], [0, -1.35, 0], STONE); P("box", [w, 4.8, d], [0, Y0 + 2.4, 0], "#a89c88"); P("box", [w + 0.8, 0.5, d + 0.8], [0, Y0 + 4.95, 0], "#8a8070");
  for (let i = 0; i < 5; i++) { P("cyl", [0.42, 4.4, 0.42], [-w * 0.36 + i * w * 0.18, Y0 + 2.4, d / 2 + 0.9], "#e6ddca"); P("box", [1.0, 0.3, 1.0], [-w * 0.36 + i * w * 0.18, Y0 + 4.7, d / 2 + 0.9], "#cfc4ae"); }
  P("box", [w + 0.6, 0.5, 1.9], [0, Y0 + 4.9, d / 2 + 0.9], "#cfc4ae"); P("cyl", [w * 0.5, 0.5, w * 0.5], [0, Y0 + 5.5, d / 2 + 0.9], "#d9cfba", [Math.PI / 2, 0, 0]);
  P("cyl", [1.5, 0.6, 1.5], [0, Y0 + 2.0, d / 2 + 0.05], "#4a4a52", [Math.PI / 2, 0, 0]); P("cyl", [1.1, 0.7, 1.1], [0, Y0 + 2.0, d / 2 + 0.1], "#8a8a94", [Math.PI / 2, 0, 0]); P("cyl", [0.35, 0.8, 0.35], [0, Y0 + 2.0, d / 2 + 0.2], GOLD, [Math.PI / 2, 0, 0]);
  for (let k = 0; k < 6; k++) P("box", [0.12, 1.6, 0.12], [0, Y0 + 2.0, d / 2 + 0.3], "#6a6a74", [0, 0, k * 0.52]);
  for (let i = 0; i < 4; i++) P("sph", [0.9 - i * 0.12, 0.3, 0.9 - i * 0.12], [-w / 2 - 1.2 + (i % 2) * 0.4, Y0 + 0.25 + i * 0.28, d / 2 + 1.6 - i * 0.2], GOLD);
  for (let i = 0; i < 14; i++) P("cyl", [0.34, 0.07, 0.34], [w / 2 + 1.1 + hash(i) * 0.9, Y0 + 0.1 + (i % 4) * 0.14, d / 2 + 1.2 + hash(i + 1) * 0.8], GOLD, [0.1 * (i % 3), 0, 0.1]);
  P("box", [3.2, 1.0, 0.2], [0, Y0 + 6.5, d / 2 + 0.9], "#2a2a32", [0, 0, 0]);
  const rect = ctx.atlas.add({ text: "THE BANK", sub: "gold stays here", bg: "#3a3028", fg: "#ffd24a" }); g.sign(5.2, 1.3, [0, Y0 + 6.3, d / 2 + 1.2], [0, 0, 0], rect);
  // coin fountain in front
  g.frame([ -5.5, 0, d / 2 + 5 ], 0, () => { P("cyl", [1.8, 0.5, 1.8], [0, 0.25, 0], STONE); P("cyl", [1.5, 0.12, 1.5], [0, 0.55, 0], "#ffd24a"); P("cyl", [0.3, 1.4, 0.3], [0, 1.1, 0], "#e6c040"); P("cyl", [0.8, 0.14, 0.8], [0, 1.8, 0], "#ffd24a"); for (let i = 0; i < 8; i++) P("cyl", [0.25, 0.05, 0.25], [Math.cos(i) * 1.1, 0.62, Math.sin(i) * 1.1], "#fff2a0", [0.2, 0, 0.2], "glow"); ctx.X.halos.push({ p: g.world([0, 1.6, 0]), s: 5, a: 0.9 }); });
  ctx.X.bank = { p: g.world([0, 0, d / 2 + 3]), by };
}
function villa(g, b, ctx, w, d, Y0, by, X) {
  const P = (t, s, p, c, r, tg) => g.part(t, s, p, c, r || [0, 0, 0], tg || "solid");
  P("box", [w + 1, 3.4, d + 1], [0, -1.35, 0], STONE); P("box", [w, 4.2, d], [0, Y0 + 2.1, 0], "#faf6ee"); P("box", [w * 0.5, 2.8, d * 0.6], [-w * 0.5 - 1.2, Y0 + 1.4, -0.4], "#f4ede0");
  for (let k = 0; k < 7; k++) { P("cyl", [0.36, 3.9, 0.36], [-w * 0.4 + k * w * 0.8 / 6, Y0 + 2.0, d / 2 + 1.2], "#fffaf0"); P("box", [0.9, 0.25, 0.9], [-w * 0.4 + k * w * 0.8 / 6, Y0 + 4.0, d / 2 + 1.2], "#efe6d2"); P("box", [0.9, 0.25, 0.9], [-w * 0.4 + k * w * 0.8 / 6, Y0 + 0.12, d / 2 + 1.2], "#efe6d2"); }
  P("box", [w + 0.6, 0.4, 2.4], [0, Y0 + 4.3, d / 2 + 1.1], "#efe6d2");
  // terracotta roof: two sloped planes + ridge
  for (const s of [-1, 1]) P("box", [w + 1.4, 0.3, d / 2 + 0.9], [0, Y0 + 5.0, s * (d / 4 + 0.1)], "#c8643a", [s * 0.5, 0, 0]);
  P("box", [w + 1.4, 0.25, 0.4], [0, Y0 + 5.65, 0], "#a8482a"); P("box", [w, 1.2, 0.3], [0, Y0 + 4.7, d / 2 + 0.7], "#faf6ee"); 
  P("box", [1.7, 2.8, 0.16], [0, Y0 + 1.4, d / 2 + 0.05], b.trim); P("box", [1.4, 2.4, 0.2], [0, Y0 + 1.2, d / 2 + 0.1], "#6a4428");
  for (const i of [-1, 1]) for (const j of [-1, 1]) { P("box", [1.1, 1.5, 0.14], [i * w * 0.32, Y0 + 2.2, d / 2 + 0.06], "#3a6ab8"); P("box", [0.85, 1.25, 0.18], [i * w * 0.32, Y0 + 2.2, d / 2 + 0.08], "#ffc968", [0, 0, 0], "glow"); X.halos.push({ p: g.world([i * w * 0.32, Y0 + 2.2, d / 2 + 0.6]), s: 2.4, a: 0.5 }); break; }
  // pool + lounge on the sea side (behind the villa, local -z)
  g.frame([w * 0.05, 0, -d / 2 - 7], 0, () => {
    P("box", [11, 0.5, 6.4], [0, 0.0, 0], "#efe6d2"); P("box", [9.6, 0.15, 5.0], [0, 0.28, 0], "#3ac8e8", [0, 0, 0], "glow"); P("box", [9.6, 0.1, 5.0], [0, 0.27, 0], "#7ee6f4");
    for (let i = 0; i < 2; i++) { P("box", [0.7, 0.18, 2.0], [-3 + i * 1.1, 0.7, -4.4], "#fff6e0", [-0.25, 0, 0]); P("box", [0.7, 0.35, 1.4], [-3 + i * 1.1, 0.45, -3.9], "#ffd8c0"); }
    P("cyl", [0.06, 3.0, 0.06], [3.8, 1.8, -4.2], WOOD); P("cone", [1.6, 0.5, 1.6], [3.8, 3.4, -4.2], "#e86a4a"); P("box", [1.6, 0.35, 0.8], [3.6, 0.45, -4.2], "#e8dcc0");
    for (let i = 0; i < 3; i++) P("box", [0.14, 1.1, 0.14], [-5.4, 0.6, -2.5 + i * 2.5], "#fff"); 
  });
  X.pool = { c: g.world([w * 0.05, 0, -d / 2 - 7]), hw: 4.8, hd: 2.5 };
  // olive grove marker positions handled by trees
}
function olivePos() {}
const PROPS = {
  flag(P, g, b, w, d, h, Y0) { P("cyl", [0.06, 2.6, 0.06], [w * 0.35, Y0 + h + 1.3, 0], WOOD); P("box", [1.3, 0.7, 0.04], [w * 0.35 + 0.7, Y0 + h + 2.3, 0], b.accent, [0, 0.2, 0]); },
  chimneyonly() {},
  reaper(P, g, b, w, d, h, Y0) { P("sph", 0.75, [-w * 0.3, Y0 + h + 0.9, -d * 0.1], "#ff7a1a"); P("box", [0.12, 0.3, 0.12], [-w * 0.3, Y0 + h + 1.7, -d * 0.1], "#3a5a20"); P("cyl", [0.06, 3.4, 0.06], [w * 0.4, Y0 + h + 1.8, d * 0.1], "#2a2a30", [0, 0, 0.15]); P("box", [1.2, 0.14, 0.05], [w * 0.4 - 0.5, Y0 + h + 3.4, d * 0.1], "#cfd2da", [0, 0, 0.5]); },
  cross(P, g, b, w, d, h, Y0) { P("box", [0.28, 2.6, 0.28], [-w * 0.3, Y0 + h + 1.5, d * 0.1], "#c9ccd6"); P("box", [1.3, 0.28, 0.28], [-w * 0.3, Y0 + h + 2.1, d * 0.1], "#c9ccd6"); P("ico", [0.22, 0.22, 0.22], [-w * 0.3, Y0 + h + 3.0, d * 0.1], "#ffffff", [0, 0, 0], "glow"); },
  ring(P, g, b, w, d, h, Y0) { P("tor", [1.0, 1.0, 1.0], [-w * 0.3, Y0 + h + 1.4, d * 0.1], "#c6a8ff", [0, 0.3, 0]); P("box", [1.8, 0.1, 0.6], [-w * 0.3, Y0 + h + 0.4, d * 0.1], "#9a7ad8"); },
  ice(P, g, b, w, d, h, Y0) { for (let i = 0; i < 3; i++) P("ico", [0.5 + i * 0.12, 0.7 + i * 0.2, 0.5 + i * 0.12], [-w * 0.3 + i * 0.7, Y0 + h + 0.7, d * 0.1 + i * 0.2], "#a8e6ff", [0.2 * i, 0.4 * i, 0]); },
  snowman(P, g, b, w, d, h, Y0) { const x = -w * 0.3, z = d * 0.1; P("sph", 0.8, [x, Y0 + h + 0.8, z], "#fff"); P("sph", 0.58, [x, Y0 + h + 1.9, z], "#fff"); P("sph", 0.4, [x, Y0 + h + 2.7, z], "#fff"); P("cone", [0.08, 0.4, 0.08], [x, Y0 + h + 2.7, z + 0.45], "#ff7a1a", [Math.PI / 2, 0, 0]); P("cyl", [0.3, 0.4, 0.3], [x, Y0 + h + 3.1, z], "#222"); P("sph", 0.05, [x - 0.13, Y0 + h + 2.8, z + 0.36], "#111"); P("sph", 0.05, [x + 0.13, Y0 + h + 2.8, z + 0.36], "#111"); },
  planter(P, g, b, w, d, h, Y0) { for (let i = 0; i < 3; i++) { P("box", [0.8, 0.5, 0.6], [-w * 0.3 + i * 1.0, Y0 + h + 0.25, 0], "#8a5a34"); P("ico", [0.5, 0.5, 0.5], [-w * 0.3 + i * 1.0, Y0 + h + 0.7, 0], "#4aa83a"); } P("box", [1.8, 0.2, 1.1], [w * 0.1, Y0 + 0.15, d / 2 + 2.2], "#3f8f3a"); },
  lamp(P, g, b, w, d, h, Y0) { P("cyl", [0.03, 2.2, 0.03], [-w * 0.3, Y0 + h + 1.1, 0], "#333"); P("sph", 0.55, [-w * 0.3, Y0 + h + 2.4, 0], "#ffd878", [0, 0, 0], "glow"); },
  windmill(P, g, b, w, d, h, Y0, X) { P("cone", [1.3, 3.4, 1.3], [-w * 0.25, Y0 + h + 1.7, 0], "#f4efe4"); P("cone", [1.5, 1.0, 1.5], [-w * 0.25, Y0 + h + 3.9, 0], "#8a5a34"); X.blades.push({ p: g.world([-w * 0.25, Y0 + h + 3.0, 1.0]), ry: 0 }); X.blades[X.blades.length - 1].frame = g.base.clone(); },
  scream(P, g, b, w, d, h, Y0) { P("sph", [1.2, 1.5, 1.0], [-w * 0.28, Y0 + h + 1.6, 0.3], "#f4f4f8"); P("ico", [0.3, 0.45, 0.2], [-w * 0.28 - 0.4, Y0 + h + 2.0, 1.15], "#111"); P("ico", [0.3, 0.45, 0.2], [-w * 0.28 + 0.4, Y0 + h + 2.0, 1.15], "#111"); P("sph", [0.3, 0.55, 0.2], [-w * 0.28, Y0 + h + 1.1, 1.2], "#111"); },
  gate(P, g, b, w, d, h, Y0) { P("box", [0.4, 3.6, 0.4], [-w * 0.35, Y0 + h + 1.8, d * 0.1], GOLD); P("box", [0.4, 3.6, 0.4], [w * 0.1, Y0 + h + 1.8, d * 0.1], GOLD); P("box", [w * 0.6, 0.4, 0.4], [-w * 0.12, Y0 + h + 3.7, d * 0.1], GOLD); for (let k = 0; k < 3; k++) P("sph", 0.5, [-w * 0.35 + 0.7 + k * 0.6, Y0 + h + 4.4, d * 0.1], "#3a8ae8", [0, 0, 0], "glow"); },
  projector(P, g, b, w, d, h, Y0) { P("box", [1.0, 0.7, 1.0], [0, Y0 + h + 0.35, 0], "#444"); P("cyl", [0.3, 0.5, 0.3], [0, Y0 + h + 0.9, 0.7], "#222", [Math.PI / 2, 0, 0]); },
  bank() {}, hq(P, g, b, w, d, h, Y0, X) { hq(P, g, b, w, d, h, Y0, X); }, pillars(P, g, b, w, d, h, Y0) { for (let k = 0; k < 4; k++) P("cyl", [0.3, 3.2, 0.3], [-w * 0.3 + k * 1.1, Y0 + h + 1.6, 0], "#f6ecd0"); P("box", [4.2, 0.3, 1.0], [-w * 0.3 + 1.65, Y0 + h + 3.35, 0], "#e6dcc0"); },
  battery(P, g, b, w, d, h, Y0) { P("box", [1.4, 3.0, 1.0], [-w * 0.25, Y0 + h + 1.5, 0], "#3aa876"); P("box", [0.5, 0.3, 0.4], [-w * 0.25, Y0 + h + 3.15, 0], "#cfd8d4"); P("box", [1.0, 0.5, 0.05], [-w * 0.25, Y0 + h + 2.2, 0.55], "#c8ffd8", [0, 0, 0], "glow"); },
  pointer(P, g, b, w, d, h, Y0) { P("cone", [0.7, 1.8, 0.2], [-w * 0.25, Y0 + h + 1.2, 0], "#ffffff", [0, 0, 0.5]); },
  hanger(P, g, b, w, d, h, Y0) { P("tor", [0.5, 0.5, 0.5], [-w * 0.25, Y0 + h + 1.9, 0], "#cfd2da"); P("box", [1.6, 0.12, 0.12], [-w * 0.25, Y0 + h + 1.1, 0], "#cfd2da", [0, 0, 0.3]); P("box", [1.6, 0.12, 0.12], [-w * 0.25, Y0 + h + 1.1, 0], "#cfd2da", [0, 0, -0.3]); P("box", [0.7, 0.9, 0.1], [w * 0.1, Y0 + h + 1.1, 0], "#d83a3a"); },
  telescope(P, g, b, w, d, h, Y0) { P("cyl", [0.2, 2.2, 0.2], [-w * 0.2, Y0 + h + 1.6, 0], "#3a5a8a", [0.7, 0, 0.2]); for (const a of [0, 2, 4]) P("cyl", [0.05, 1.5, 0.05], [-w * 0.2 + Math.cos(a) * 0.5, Y0 + h + 0.75, Math.sin(a) * 0.5], "#555"); },
  scales(P, g, b, w, d, h, Y0) { P("cyl", [0.06, 2.0, 0.06], [-w * 0.25, Y0 + h + 1, 0], "#c8a24a"); P("box", [2.0, 0.08, 0.08], [-w * 0.25, Y0 + h + 2.0, 0], "#c8a24a"); for (const s of [-1, 1]) P("cyl", [0.45, 0.06, 0.45], [-w * 0.25 + s * 0.95, Y0 + h + 1.5, 0], "#e8c860"); },
  mail(P, g, b, w, d, h, Y0) { P("box", [1.0, 0.8, 0.6], [-w * 0.25, Y0 + h + 0.4, 0], "#d83a3a"); P("hemi", [0.5, 0.5, 0.3], [-w * 0.25, Y0 + h + 0.8, 0], "#d83a3a", [Math.PI / 2, 0, Math.PI / 2]); },
  billboard(P, g, b, w, d, h, Y0) { P("box", [4.2, 2.4, 0.2], [-w * 0.05, Y0 + h + 2.6, 0], "#222"); P("box", [3.8, 2.0, 0.22], [-w * 0.05, Y0 + h + 2.6, 0.02], "#ff6a3a", [0, 0, 0], "glow"); P("box", [0.14, 1.6, 0.14], [-1.2, Y0 + h + 0.8, 0], "#444"); P("box", [0.14, 1.6, 0.14], [1.2, Y0 + h + 0.8, 0], "#444"); P("cone", [0.5, 0.8, 0.5], [-w * 0.05, Y0 + h + 2.6, 0.2], "#fff", [0, 0, -Math.PI / 2]); },
  clapper(P, g, b, w, d, h, Y0) { P("box", [1.8, 1.2, 0.2], [-w * 0.25, Y0 + h + 0.9, 0], "#222"); P("box", [1.8, 0.35, 0.22], [-w * 0.25, Y0 + h + 1.65, 0], "#fff", [0, 0, 0.25]); },
  tv(P, g, b, w, d, h, Y0) { P("box", [2.2, 1.5, 0.3], [-w * 0.25, Y0 + h + 1.2, 0], "#222"); P("box", [1.9, 1.2, 0.32], [-w * 0.25, Y0 + h + 1.2, 0.02], "#d84ad8", [0, 0, 0], "glow"); },
  observatory(P, g, b, w, d, h, Y0) { P("cyl", [1.6, 0.8, 1.6], [-w * 0.1, Y0 + h * 1.5 + 0.4, -d * 0.1], "#e8e4f4"); P("hemi", [1.6, 1.6, 1.6], [-w * 0.1, Y0 + h * 1.5 + 0.8, -d * 0.1], "#6a5ad8"); P("cyl", [0.2, 1.6, 0.2], [-w * 0.1, Y0 + h * 1.5 + 1.9, 0.9], "#cfd2da", [1.0, 0, 0]); P("sph", 0.6, [w * 0.3, Y0 + h + 1.6, 0], "#f2f2ff", [0, 0, 0], "glow"); },
  candles(P, g, b, w, d, h, Y0) { for (let i = 0; i < 5; i++) { const c = i % 2 ? "#d83a3a" : "#2ac868", hh = 0.8 + (i * 37 % 7) * 0.2; P("box", [0.28, hh, 0.28], [-1.4 + i * 0.7, Y0 + h + 0.4 + hh / 2, 0], c); P("box", [0.05, hh + 0.5, 0.05], [-1.4 + i * 0.7, Y0 + h + 0.4 + hh / 2, 0], c); } },
  clock(P, g, b, w, d, h, Y0) { P("cyl", [0.9, 0.2, 0.9], [-w * 0.2, Y0 + h + 1.4, 0], "#fff", [Math.PI / 2, 0, 0]); P("box", [0.06, 0.6, 0.04], [-w * 0.2, Y0 + h + 1.6, 0.14], "#222"); P("box", [0.4, 0.06, 0.04], [-w * 0.2 + 0.15, Y0 + h + 1.4, 0.14], "#222"); },
  coin(P, g, b, w, d, h, Y0) { P("cyl", [1.0, 0.18, 1.0], [-w * 0.2, Y0 + h + 1.3, 0], "#e8c040", [Math.PI / 2, 0, 0]); P("cyl", [0.7, 0.2, 0.7], [-w * 0.2, Y0 + h + 1.3, 0], "#ffe880", [Math.PI / 2, 0, 0]); },
  phone(P, g, b, w, d, h, Y0) { P("box", [1.1, 2.0, 0.2], [-w * 0.25, Y0 + h + 1.2, 0], "#222"); P("box", [0.9, 1.7, 0.22], [-w * 0.25, Y0 + h + 1.2, 0.02], "#ff8a4a", [0, 0, 0], "glow"); },
  camera(P, g, b, w, d, h, Y0) { P("box", [1.6, 1.0, 0.9], [-w * 0.25, Y0 + h + 0.6, 0], "#333"); P("cyl", [0.4, 0.5, 0.4], [-w * 0.25, Y0 + h + 0.6, 0.7], "#8a8a94", [Math.PI / 2, 0, 0]); },
  wand(P, g, b, w, d, h, Y0) { P("cyl", [0.06, 2.4, 0.06], [-w * 0.25, Y0 + h + 1.2, 0], "#4a2a8a", [0, 0, 0.4]); P("ico", 0.4, [-w * 0.25 - 0.5, Y0 + h + 2.5, 0], "#ffe880", [0, 0, 0], "glow"); },
  bulb(P, g, b, w, d, h, Y0) { P("sph", 0.8, [-w * 0.25, Y0 + h + 1.7, 0], "#ffe070", [0, 0, 0], "glow"); P("cyl", [0.3, 0.5, 0.3], [-w * 0.25, Y0 + h + 0.75, 0], "#888"); },
  minihouse(P, g, b, w, d, h, Y0) { P("box", [1.4, 0.9, 1.0], [-w * 0.25, Y0 + h + 0.45, 0], "#f4efe4"); P("cone4", [1.2, 0.8, 1.2], [-w * 0.25, Y0 + h + 1.3, 0], "#c8643a", [0, Math.PI / 4, 0]); P("box", [0.5, 0.15, 0.1], [w * 0.15, Y0 + h + 0.4, 0], GOLD); },
  gear(P, g, b, w, d, h, Y0) { P("tor", [0.9, 0.9, 0.9], [-w * 0.25, Y0 + h + 1.4, 0], "#8a8a92"); for (let k = 0; k < 8; k++) P("box", [0.3, 0.3, 0.3], [-w * 0.25 + Math.cos(k * 0.785) * 1.0, Y0 + h + 1.4 + Math.sin(k * 0.785) * 1.0, 0], "#8a8a92"); P("box", [0.2, 1.6, 0.2], [w * 0.2, Y0 + h + 1.0, 0], WOOD, [0, 0, 0.4]); },
  dumbbell(P, g, b, w, d, h, Y0) { P("cyl", [0.1, 2.2, 0.1], [-w * 0.2, Y0 + h + 1.0, 0], "#aaa", [0, 0, Math.PI / 2]); for (const s of [-1, 1]) P("cyl", [0.5, 0.25, 0.5], [-w * 0.2 + s * 1.0, Y0 + h + 1.0, 0], "#2a2a30", [0, 0, Math.PI / 2]); },
  scrolls(P, g, b, w, d, h, Y0) { for (let i = 0; i < 4; i++) { P("cyl", [0.26, 1.6, 0.26], [-w * 0.3 + i * 0.7, Y0 + h + 0.5 + (i % 2) * 0.25, 0], "#f4e4b8", [0, 0, 1.4 + i * 0.2]); P("sph", 0.28, [-w * 0.3 + i * 0.7 + 0.8, Y0 + h + 0.6 + (i % 2) * 0.25, 0], "#ffd878", [0, 0, 0], "glow"); } },
  crier(P, g, b, w, d, h, Y0) { P("hemi", [0.8, 0.8, 0.8], [-w * 0.25, Y0 + h + 1.3, 0], GOLD, [Math.PI, 0, 0]); P("cyl", [0.06, 1.2, 0.06], [-w * 0.25, Y0 + h + 0.6, 0], "#555"); P("sph", 0.14, [-w * 0.25, Y0 + h + 0.7, 0], "#555"); },
  cart(P, g, b, w, d, h, Y0) { P("box", [0.9, 0.4, 0.6], [w * 0.3, Y0 + 0.5, d / 2 + 1.6], "#8a8a92"); P("box", [0.9, 0.1, 0.1], [w * 0.3, Y0 + 1.0, d / 2 + 1.9], "#8a8a92"); P("sph", 0.35, [w * 0.3, Y0 + 0.9, d / 2 + 1.6], "#e0383a"); P("cyl", [0.06, 2.4, 0.06], [-w * 0.4, Y0 + h + 1.2, 0], WOOD); P("box", [1.4, 0.8, 0.05], [-w * 0.4 + 0.8, Y0 + h + 2.2, 0], "#e8504a"); },
};
function hq(P, g, b, w, d, h, Y0, X) {
  for (let k = 0; k < 8; k++) P("cyl", [0.4, h - 0.6, 0.4], [-w * 0.42 + k * w * 0.84 / 7, Y0 + (h - 0.6) / 2 + 0.2, d / 2 + 1.4], "#fff8e8");
  P("box", [w + 1.2, 0.5, 3.4], [0, Y0 + h - 0.3, d / 2 + 1.0], "#efe6d2"); P("box", [w * 0.92, 0.6, 0.3], [0, Y0 + h + 0.5, d / 2 + 2.6], "#efe6d2");
  P("cyl", [w * 0.28, 0.5, w * 0.28], [0, Y0 + h + 0.2, 0], "#f4efe4"); P("hemi", [w * 0.3, w * 0.3, w * 0.3], [0, Y0 + h + 0.4, 0], "#f0c040"); P("cyl", [0.12, 2.6, 0.12], [0, Y0 + h + w * 0.3 + 1.6, 0], "#f0c040"); P("ico", 0.55, [0, Y0 + h + w * 0.3 + 3.1, 0], "#fff6a0", [0, 0, 0], "glow");
  for (const s of [-1, 1]) { P("cyl", [1.0, 6, 1.0], [s * (w / 2 + 0.6), Y0 + h + 0.2, -1], "#f4efe4"); P("hemi", [1.1, 1.1, 1.1], [s * (w / 2 + 0.6), Y0 + h + 3.2, -1], "#2a62c8"); }
  X.halos.push({ p: g.world([0, Y0 + h + w * 0.3 + 3.1, 0]), s: 7, a: 1 }); X.genie = g.world([0, Y0 + h + w * 0.3 + 6.4, 0]);
}
