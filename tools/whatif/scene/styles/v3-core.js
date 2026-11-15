// WHAT IF style v3 (study, 2026-11-15): PS1 x WoW. Real modeled low-poly characters (no cubes), crisp hand-painted
// canvas textures, real lighting (key + rim + bounce + IBL from the sky, PCFSoft shadows, GTAO, ACES), selective bloom
// (only objects on the BLOOM layer glow). One candidate = one look object from v3-looks.js. Old styles are untouched.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

export { THREE };
export const W = 1080, H = 1920, BLOOM = 1;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const h3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 269.5 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
export function noise3(x, y, z) { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf); let r = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) r += h3(xi + a, yi + b, zi + c) * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w); return r; }

// ---------- geometry helpers ----------
export function disp(geo, f) { const p = geo.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); f(v); p.setXYZ(i, v.x, v.y, v.z); } geo.computeVertexNormals(); return geo; }
// baked AO / tint as vertex colours (multiplies the painted texture)
export function vcol(geo, f) { const p = geo.attributes.position, n = geo.attributes.normal, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { f(col.setRGB(1, 1, 1), p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)); c.set([col.r, col.g, col.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo; }
// world-scale box-projected UVs (no stretching on long walls)
export function wuv(geo, s = .5) { geo = geo.index ? geo.toNonIndexed() : geo; geo.computeVertexNormals(); const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) { let nx = 0, ny = 0, nz = 0; for (let k = 0; k < 3; k++) { nx += Math.abs(n.getX(i + k)); ny += Math.abs(n.getY(i + k)); nz += Math.abs(n.getZ(i + k)); }
    for (let k = 0; k < 3; k++) { const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k); const [u, v] = ny > nx && ny > nz ? [x, z] : nx > nz ? [z, y] : [x, y]; uv.set([u * s, v * s], (i + k) * 2); } }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo; }

// ---------- hand-painted canvas textures (crisp strokes, painted light: warm highlight, cool shadow) ----------
let LOOK = null; const TEX = {};
function canvasTex(key, N, paint, rep = true) { if (TEX[key]) return TEX[key]; const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); paint(g, N, rng(key.length * 131 + key.charCodeAt(0) * 7));
  let src = c; if (LOOK.ps1 && N > 128 && key !== 'ground') { src = document.createElement('canvas'); src.width = src.height = 128; const sg = src.getContext('2d'); sg.imageSmoothingEnabled = true; sg.drawImage(c, 0, 0, 128, 128); }
  const t = new THREE.CanvasTexture(src); t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (LOOK.ps1 && key !== 'ground') { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter; } else { t.anisotropy = 8; t.minFilter = THREE.LinearMipmapLinearFilter; }
  return (TEX[key] = t); }
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
function strokes(g, r, N, n, cols, wmin, wmax, lmin, lmax, ang = null, alpha = 1) { g.lineCap = 'round'; for (let i = 0; i < n; i++) { const x = r() * N, y = r() * N, l = lmin + r() * (lmax - lmin), a = ang ?? r() * Math.PI;
  g.globalAlpha = alpha; g.strokeStyle = pick(r, cols); g.lineWidth = wmin + r() * (wmax - wmin);
  for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); g.stroke(); } } g.globalAlpha = 1; }
function dabs(g, r, N, n, cols, smin, smax, alpha = 1) { for (let i = 0; i < n; i++) { const x = r() * N, y = r() * N, s = smin + r() * (smax - smin), a = r() * 3; g.globalAlpha = alpha; g.fillStyle = pick(r, cols);
  for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) { g.beginPath(); g.ellipse(x + dx, y + dy, s, s * .6, a, 0, 7); g.fill(); } } g.globalAlpha = 1; }
function stones(g, r, N, rows, cols, base, mortar, hi, lo) { g.fillStyle = mortar; g.fillRect(0, 0, N, N); const bh = N / rows, bw = N / cols;
  for (let y = 0; y < rows; y++) for (let x = -1; x <= cols; x++) { const ox = x * bw + (y % 2) * bw * .5 + (r() - .5) * bw * .15, oy = y * bh, w = bw * (.86 + r() * .1), h = bh * (.8 + r() * .1);
    g.fillStyle = pick(r, base); g.beginPath(); g.roundRect(ox + 3, oy + 3, w - 6, h - 6, Math.min(w, h) * .32); g.fill();
    g.strokeStyle = hi; g.lineWidth = Math.max(2, N / 150); g.beginPath(); g.moveTo(ox + 8, oy + h * .7); g.quadraticCurveTo(ox + 8, oy + 8, ox + w * .75, oy + 8); g.stroke();
    g.strokeStyle = lo; g.beginPath(); g.moveTo(ox + w - 6, oy + h * .3); g.quadraticCurveTo(ox + w - 6, oy + h - 6, ox + w * .3, oy + h - 6); g.stroke(); } }
export function tex(kind) { const P = LOOK.pal, N = 512;
  switch (kind) {
    case 'cliff': return canvasTex(kind, N, (g, N, r) => { g.fillStyle = P.rock[1]; g.fillRect(0, 0, N, N); for (let y = 0; y < N; y += 24 + r() * 30) { g.fillStyle = pick(r, P.rock); g.fillRect(0, y, N, 14 + r() * 24); }
      dabs(g, r, N, 160, P.rock, 10, 40, .8); strokes(g, r, N, 80, [P.rockHi], 3, 6, 20, 60, 0, .9); strokes(g, r, N, 60, [P.rockLo], 3, 5, 10, 40, null, .9); });
    case 'stone': return canvasTex(kind, N, (g, N, r) => stones(g, r, N, 5, 3, P.rock, P.rockLo, P.rockHi, P.rockLo));
    case 'rock': return canvasTex(kind, N, (g, N, r) => { g.fillStyle = P.rock[0]; g.fillRect(0, 0, N, N); dabs(g, r, N, 220, P.rock, 14, 50); strokes(g, r, N, 120, [P.rockHi], 3, 6, 18, 50, null, .85); strokes(g, r, N, 70, [P.rockLo], 3, 6, 10, 40, null, .9); });
    case 'bark': return canvasTex(kind, N, (g, N, r) => { g.fillStyle = P.bark[0]; g.fillRect(0, 0, N, N); strokes(g, r, N, 260, P.bark, 6, 14, 40, 140, Math.PI / 2); strokes(g, r, N, 90, [P.barkHi], 3, 5, 30, 90, Math.PI / 2); strokes(g, r, N, 60, ['rgba(0,0,0,.35)'], 3, 5, 30, 90, Math.PI / 2); });
    case 'leaf': return canvasTex(kind, N, (g, N, r) => { g.fillStyle = P.leaf[0]; g.fillRect(0, 0, N, N); dabs(g, r, N, 700, P.leaf, 10, 22); dabs(g, r, N, 260, [P.leafHi], 7, 14); });
    case 'plaster': return canvasTex(kind, N, (g, N, r) => { g.fillStyle = P.plaster[0]; g.fillRect(0, 0, N, N); strokes(g, r, N, 200, P.plaster, 10, 20, 20, 60, null, .7);
      const beam = (x0, y0, x1, y1, w) => { g.lineCap = 'butt'; g.strokeStyle = P.wood[2]; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.strokeStyle = P.wood[0]; g.lineWidth = w * .62; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
      beam(0, 18, N, 18, 40); beam(0, N - 18, N, N - 18, 40); beam(18, 0, 18, N, 40); beam(N * .5, 0, N * .5, N, 30); beam(30, N - 30, N * .5 - 10, 30, 24); });
    case 'shingle': return canvasTex(kind, N, (g, N, r) => { g.fillStyle = P.roofLo; g.fillRect(0, 0, N, N); const rows = 8, cols = 6, th = N / rows, tw = N / cols;
      for (let y = -1; y <= rows; y++) for (let x = -1; x <= cols; x++) { const ox = x * tw + (y % 2) * tw / 2, oy = y * th; g.fillStyle = pick(r, P.roof); g.beginPath(); g.moveTo(ox + 3, oy); g.lineTo(ox + tw - 3, oy); g.lineTo(ox + tw - 3, oy + th * .75); g.quadraticCurveTo(ox + tw / 2, oy + th * 1.2, ox + 3, oy + th * .75); g.closePath(); g.fill();
        g.strokeStyle = P.roofHi; g.lineWidth = 4; g.beginPath(); g.moveTo(ox + 8, oy + th * .7); g.quadraticCurveTo(ox + tw / 2, oy + th * 1.05, ox + tw - 8, oy + th * .7); g.stroke(); } });
    case 'wood': return canvasTex(kind, N, (g, N, r) => { const n = 4, w = N / n; for (let i = 0; i < n; i++) { g.fillStyle = pick(r, P.wood); g.fillRect(i * w, 0, w, N); strokes(g, r, N, 0, P.wood, 1, 1, 1, 1);
      for (let j = 0; j < 6; j++) { const x0 = i * w + 8 + r() * (w - 16); g.strokeStyle = P.wood[2]; g.lineWidth = 2 + r() * 3; g.beginPath(); g.moveTo(x0, 0); for (let y = 0; y <= N; y += 16) g.lineTo(x0 + Math.sin(y * .04 + j * 2) * 4, y); g.stroke(); }
      g.fillStyle = 'rgba(20,10,5,.75)'; g.fillRect(i * w, 0, 5, N); g.fillStyle = P.woodHi; g.fillRect(i * w + 5, 0, 4, N); } });
    case 'cloth': return canvasTex(kind, N, (g, N, r) => { g.fillStyle = P.cloth[0]; g.fillRect(0, 0, N, N); dabs(g, r, N, 260, P.cloth, 14, 34, .8); strokes(g, r, N, 70, [P.clothHi], 5, 9, 10, 26, null, .55); strokes(g, r, N, 50, ['rgba(10,10,40,.35)'], 5, 9, 10, 26, null, 1);
      g.fillStyle = P.trim; g.fillRect(0, N - 46, N, 46); g.fillStyle = P.trimHi; g.fillRect(0, N - 46, N, 8); });
    case 'tabard': return canvasTex(kind, N, (g, N, r) => { g.fillStyle = P.cloth[0]; g.fillRect(0, 0, N, N); strokes(g, r, N, 160, P.cloth, 12, 24, 30, 90, Math.PI / 2, .8);
      g.strokeStyle = P.trim; g.lineWidth = 34; g.strokeRect(17, -20, N - 34, N + 3); g.strokeStyle = P.trimHi; g.lineWidth = 6; g.strokeRect(34, -20, N - 68, N);
      // original emblem: a rising sun over a leaf
      g.save(); g.translate(N / 2, N * .42); g.fillStyle = P.trim; for (let i = 0; i < 9; i++) { g.save(); g.rotate(-Math.PI / 2 + (i - 4) * .3); g.fillRect(70, -9, 60, 18); g.restore(); }
      g.beginPath(); g.arc(0, 0, 62, 0, 7); g.fill(); g.fillStyle = P.cloth[2]; g.beginPath(); g.moveTo(0, -40); g.quadraticCurveTo(40, 0, 0, 52); g.quadraticCurveTo(-40, 0, 0, -40); g.fill();
      g.strokeStyle = P.trim; g.lineWidth = 6; g.beginPath(); g.moveTo(0, -30); g.lineTo(0, 44); g.stroke(); g.restore(); });
    case 'leather': return canvasTex(kind, N, (g, N, r) => { g.fillStyle = P.leather[0]; g.fillRect(0, 0, N, N); dabs(g, r, N, 160, P.leather, 16, 46, .8); strokes(g, r, N, 50, [P.leatherHi], 3, 5, 20, 50, null, .8);
      g.setLineDash([12, 10]); g.strokeStyle = P.leatherHi; g.lineWidth = 4; for (const y of [30, N - 30]) { g.beginPath(); g.moveTo(0, y); g.lineTo(N, y); g.stroke(); } g.setLineDash([]); });
    case 'metal': return canvasTex(kind, N, (g, N, r) => { const gr = g.createLinearGradient(0, 0, 0, N); P.metal.forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c)); g.fillStyle = gr; g.fillRect(0, 0, N, N);
      g.fillStyle = P.metalHi; g.fillRect(0, N * .22, N, N * .06); g.fillRect(0, N * .3, N, N * .015); strokes(g, r, N, 80, [P.metalHi], 2, 4, 10, 40, 0, .6); strokes(g, r, N, 40, ['rgba(0,0,0,.35)'], 2, 3, 8, 24, null, 1);
      g.fillStyle = P.metalLo; g.fillRect(0, N * .9, N, N * .1); g.fillStyle = P.metalHi; for (let x = 16; x < N; x += 64) { g.beginPath(); g.arc(x, N * .86, 9, 0, 7); g.fill(); } });
    case 'skin': return canvasTex(kind, N, (g, N, r) => { g.fillStyle = P.skin[0]; g.fillRect(0, 0, N, N); dabs(g, r, N, 120, P.skin, 20, 50, .6); dabs(g, r, N, 30, [P.skinHi], 8, 20, .5); });
    case 'hair': return canvasTex(kind, N, (g, N, r) => { g.fillStyle = P.hair[0]; g.fillRect(0, 0, N, N); strokes(g, r, N, 400, P.hair, 5, 10, 40, 120, Math.PI / 2); strokes(g, r, N, 120, [P.hairHi], 3, 5, 30, 90, Math.PI / 2); });
  } }

// The ground: one 2048 painted canvas over the whole plateau (grass, the dirt path, pebbles, flowers, contact shadows).
export const GROUND = 7.2;
export const pathPts = [[-1.6, -2.0], [-1.0, -0.6], [0.2, 1.0], [0.4, 2.8], [0.0, 4.8], [-0.4, 7.5]];
function groundTex() { const P = LOOK.pal; return canvasTex('ground', 2048, (g, N, r) => { const k = N / (GROUND * 2), X = x => (x + GROUND) * k, Z = z => (z + GROUND) * k;
  g.fillStyle = P.grass[1]; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 70; i++) { const x = r() * N, y = r() * N, s = 80 + r() * 200; g.fillStyle = pick(r, P.grass); g.globalAlpha = .7; g.beginPath(); g.ellipse(x, y, s, s * .7, r() * 3, 0, 7); g.fill(); } g.globalAlpha = 1;
  g.lineCap = 'round'; for (let i = 0; i < 26000; i++) { const x = r() * N, y = r() * N, nz = noise3(x * .004, y * .004, 1), l = 7 + r() * 10;
    g.strokeStyle = nz + (r() - .5) * .35 > .5 ? (r() > .6 ? P.grassHi : P.grass[2]) : (r() > .5 ? P.grass[0] : P.grass[1]); g.lineWidth = 2.5 + r() * 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - .5) * 5, y - l); g.stroke(); }
  // contact shadows (painted AO) under the house, tree and rock
  const ao = (x, z, rx, rz, a) => { const gr = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), rx * k); gr.addColorStop(0, `rgba(10,20,40,${a})`); gr.addColorStop(.6, `rgba(10,20,40,${a * .5})`); gr.addColorStop(1, 'rgba(10,20,40,0)'); g.save(); g.translate(X(x), Z(z)); g.scale(1, rz / rx); g.translate(-X(x), -Z(z)); g.fillStyle = gr; g.fillRect(0, 0, N, N); g.restore(); };
  // the path
  const path = (w, col) => { g.strokeStyle = col; g.lineWidth = w * k; g.lineJoin = 'round'; g.beginPath(); pathPts.forEach(([x, z], i) => i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))); g.stroke(); };
  path(1.5, P.dirt[2]); path(1.25, P.dirt[0]);
  for (let i = 0; i < 1800; i++) { const s = r() * (pathPts.length - 1), j = Math.floor(s), f = s - j, x = lerp(pathPts[j][0], pathPts[j + 1][0], f) + (r() - .5) * 1.1, z = lerp(pathPts[j][1], pathPts[j + 1][1], f) + (r() - .5) * .6;
    const rad = (4 + r() * 9); g.fillStyle = pick(r, P.dirt); g.beginPath(); g.ellipse(X(x), Z(z), rad, rad * .7, r() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 160; i++) { const s = r() * (pathPts.length - 1), j = Math.floor(s), f = s - j, x = lerp(pathPts[j][0], pathPts[j + 1][0], f) + (r() - .5) * .9, z = lerp(pathPts[j][1], pathPts[j + 1][1], f) + (r() - .5) * .5, rad = 9 + r() * 12;
    g.fillStyle = P.rockLo; g.beginPath(); g.ellipse(X(x) + 2, Z(z) + 3, rad, rad * .75, 0, 0, 7); g.fill(); g.fillStyle = pick(r, P.rock); g.beginPath(); g.ellipse(X(x), Z(z), rad, rad * .75, 0, 0, 7); g.fill();
    g.fillStyle = P.rockHi; g.beginPath(); g.ellipse(X(x) - rad * .25, Z(z) - rad * .25, rad * .45, rad * .3, 0, 0, 7); g.fill(); }
  // grass blades over the path edges
  for (let i = 0; i < 2500; i++) { const s = r() * (pathPts.length - 1), j = Math.floor(s), f = s - j, side = r() > .5 ? 1 : -1, x = lerp(pathPts[j][0], pathPts[j + 1][0], f) + side * (.55 + r() * .2), z = lerp(pathPts[j][1], pathPts[j + 1][1], f);
    g.strokeStyle = r() > .5 ? P.grass[2] : P.grassHi; g.lineWidth = 3; g.beginPath(); g.moveTo(X(x), Z(z)); g.lineTo(X(x) - side * 6, Z(z) - 9 - r() * 8); g.stroke(); }
  ao(-1.9, -3.4, 3.2, 2.6, .55); ao(2.5, -1.6, 1.7, 1.5, .55); ao(-2.4, 1.6, 1.2, 1.0, .5);
  for (let i = 0; i < 260; i++) { const x = (r() - .5) * GROUND * 1.8, z = (r() - .5) * GROUND * 1.8; if (Math.abs(x - 0.2) < 1 && z > -2) continue; const c = pick(r, P.flowers);
    for (let p = 0; p < 5; p++) { g.fillStyle = c; g.beginPath(); g.arc(X(x) + Math.cos(p * 1.26) * 5, Z(z) + Math.sin(p * 1.26) * 5, 4, 0, 7); g.fill(); } g.fillStyle = '#fff2b0'; g.beginPath(); g.arc(X(x), Z(z), 3, 0, 7); g.fill(); } }, false); }

const mats = {};
export function M(kind, o = {}) { const key = kind + JSON.stringify(o); if (mats[key]) return mats[key];
  const t = kind === 'ground' ? groundTex() : tex(kind);
  const m = new THREE.MeshStandardMaterial({ map: t, color: o.color ?? 0xffffff, roughness: o.rough ?? .85, metalness: o.metal ?? 0, vertexColors: !!o.vc, flatShading: !!o.flat, side: o.side ?? THREE.FrontSide, envMapIntensity: o.env ?? LOOK.light.env });
  if (o.rep) { m.map = t.clone(); m.map.repeat.set(o.rep[0], o.rep[1]); m.map.needsUpdate = true; } return (mats[key] = m); }
export function glow(color, i = 3) { const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: i, roughness: .4 }); m.userData.glow = 1; return m; }
export function mesh(geo, m, cast = true) { const o = new THREE.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = true; if (m.userData?.glow) { o.layers.enable(BLOOM); o.castShadow = false; } return o; }
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

// ---------- the hero (original): a broad lantern-warden, WoW proportions — huge pauldrons and hands, short sturdy legs ----------
function limb(r0, r1, len, seg = 8, bulge = .12) { const pts = []; for (let i = 0; i <= 6; i++) { const f = i / 6; pts.push(new THREE.Vector2(lerp(r0, r1, f) * (1 + bulge * Math.sin(f * Math.PI)), -f * len)); }
  const g = new THREE.LatheGeometry(pts, seg); return g; }
export function hero() { const P = LOOK.pal, root = new THREE.Group(), J = {};
  const skin = M('skin', { rough: .7 }), cloth = M('cloth'), leather = M('leather'), metal = M('metal', { metal: .55, rough: .38 }), hairM = M('hair', { rough: .8 });
  const hips = at(new THREE.Group(), 0, .98, 0); root.add(hips); J.hips = hips;
  // pelvis + belt + tabard
  hips.add(mesh(disp(new THREE.CylinderGeometry(.3, .27, .3, 10), v => { v.z *= .78; }), leather));
  const belt = mesh(new THREE.TorusGeometry(.31, .06, 6, 14), metal); belt.rotation.x = Math.PI / 2; belt.scale.set(1, .8, 1); at(belt, 0, .12, 0); hips.add(belt);
  const buckle = mesh(new THREE.CylinderGeometry(.09, .09, .05, 8), metal); buckle.rotation.x = Math.PI / 2; at(buckle, 0, .12, .25); hips.add(buckle);
  const tab = mesh(disp(new THREE.PlaneGeometry(.36, .55, 2, 5), v => { v.z = .05 * Math.cos(v.y * 3) + .02 * Math.sin(v.x * 9); }), M('tabard', { side: THREE.DoubleSide })); at(tab, 0, -.18, .26); tab.rotation.x = .06; hips.add(tab); J.tab = tab;
  // torso: barrel chest, narrow waist
  const torso = at(new THREE.Group(), 0, .14, 0); hips.add(torso); J.torso = torso;
  const prof = [[.27, 0], [.3, .12], [.38, .3], [.44, .48], [.42, .6], [.3, .7], [.12, .74]].map(([x, y]) => new THREE.Vector2(x, y));
  const chest = mesh(disp(new THREE.LatheGeometry(prof, 12), v => { v.z *= .72; if (v.z > 0) v.z *= 1.08; }), cloth); torso.add(chest);
  // neck + head
  const neck = at(new THREE.Group(), 0, .7, .02); torso.add(neck); J.neck = neck; neck.add(mesh(new THREE.CylinderGeometry(.13, .16, .16, 8), skin));
  const head = at(new THREE.Group(), 0, .1, .02); neck.add(head); J.head = head;
  head.add(at(mesh(disp(new THREE.SphereGeometry(.26, 12, 10), v => { v.y *= 1.08; if (v.y < 0) { v.x *= 1.12; v.z *= 1.05; } if (v.z > .1 && v.y > -.05 && v.y < .08) v.z *= .93; }), skin), 0, .2, 0));
  const nose = mesh(disp(new THREE.SphereGeometry(.07, 7, 5), v => { v.z *= 1.1; v.y *= 1.15; }), skin); at(nose, 0, .17, .26); head.add(nose);
  for (const s of [-1, 1]) { const ew = mesh(disp(new THREE.SphereGeometry(.052, 8, 6), v => { v.z *= .5; v.y *= .85; }), new THREE.MeshStandardMaterial({ color: P.eyeWhite, roughness: .3 })); at(ew, s * .095, .235, .225); head.add(ew);
    const pu = mesh(new THREE.SphereGeometry(.03, 8, 6), new THREE.MeshStandardMaterial({ color: P.iris, roughness: .2 })); pu.scale.z = .5; at(pu, s * .092, .233, .247); head.add(pu);
    const gl = mesh(new THREE.SphereGeometry(.009, 4, 3), new THREE.MeshBasicMaterial({ color: 0xffffff })); at(gl, s * .085 + .008, .245, .262); head.add(gl);
    const brow = mesh(disp(new THREE.BoxGeometry(.13, .045, .06, 3, 1, 1), v => { v.y += -s * v.x * .35 + (Math.abs(v.x) < .03 ? .004 : 0); }), hairM); at(brow, s * .1, .3, .235); brow.rotation.z = s * -.18; head.add(brow);
    const ear = mesh(disp(new THREE.ConeGeometry(.06, .26, 5), v => { v.z *= .45; }), skin); at(ear, s * .27, .25, -.02); ear.rotation.set(-.4, 0, s * -1.25); head.add(ear);
    const mus = mesh(new THREE.ConeGeometry(.045, .2, 6), hairM); at(mus, s * .08, .1, .24); mus.rotation.set(0, 0, s * 2.1); head.add(mus); }
  const beard = mesh(disp(new THREE.ConeGeometry(.24, .36, 10, 3), v => { v.z = v.z * .55 + .03; v.x *= 1 + .12 * Math.sin(v.y * 22); }), hairM); beard.rotation.x = Math.PI + .5; at(beard, 0, -.0, .15); head.add(beard);
  const ring = mesh(new THREE.TorusGeometry(.05, .02, 5, 10), metal); ring.rotation.x = Math.PI / 2 - .2; at(ring, 0, -.17, .22); head.add(ring);
  const crown = mesh(disp(new THREE.SphereGeometry(.27, 12, 6, 0, Math.PI * 2, 0, Math.PI * .45), v => { v.y *= 1.05; }), hairM); at(crown, 0, .22, -.02); head.add(crown);
  const knot = mesh(new THREE.ConeGeometry(.09, .28, 7), hairM); at(knot, 0, .54, -.08); knot.rotation.x = -.5; head.add(knot);
  const band = mesh(new THREE.TorusGeometry(.07, .025, 5, 10), metal); band.rotation.x = Math.PI / 2 - .5; at(band, 0, .46, -.04); head.add(band);
  // arms: pauldron, upper arm, gauntlet forearm, BIG hand
  for (const s of [-1, 1]) { const sh = at(new THREE.Group(), s * .5, .56, 0); torso.add(sh); J['sh' + s] = sh;
    const pd = mesh(disp(new THREE.SphereGeometry(.3, 12, 7, 0, Math.PI * 2, 0, Math.PI * .6), v => { v.x *= 1.1; v.z *= .95; v.y *= 1.25; }), metal); const pd2 = mesh(new THREE.SphereGeometry(.27, 12, 5, 0, Math.PI * 2, Math.PI * .35, Math.PI * .25), metal); pd2.scale.set(1.15, 1.2, 1); at(pd2, s * .06, -.12, 0); pd2.rotation.z = s * -.5; sh.add(pd2); at(pd, s * .03, .02, 0); pd.rotation.z = s * -.35; sh.add(pd);
    const lip = mesh(new THREE.CylinderGeometry(.33, .36, .08, 12, 1, true), M('metal', { metal: .55, rough: .38, side: THREE.DoubleSide })); lip.scale.set(1.12, 1, .95); at(lip, s * .03, .0, 0); lip.rotation.z = s * -.35; sh.add(lip);
    const spike = mesh(new THREE.ConeGeometry(.06, .22, 6), metal); at(spike, s * .12, .27, 0); spike.rotation.z = s * -.5; sh.add(spike);
    sh.add(at(mesh(limb(.12, .1, .38), cloth), 0, -.08, 0));
    const el = at(new THREE.Group(), 0, -.44, 0); sh.add(el); J['el' + s] = el;
    el.add(mesh(limb(.11, .15, .36, 9, .05), leather));
    const cuff = mesh(new THREE.CylinderGeometry(.17, .15, .12, 9), metal); at(cuff, 0, -.3, 0); el.add(cuff);
    const hand = at(new THREE.Group(), 0, -.38, 0); el.add(hand); J['hand' + s] = hand;
    hand.add(at(mesh(disp(new THREE.SphereGeometry(.12, 9, 7), v => { v.z *= .62; v.y *= 1.05; v.x *= 1.05; }), skin), 0, -.08, 0));
    for (let f = 0; f < 4; f++) { const fx = (f - 1.5) * .056, fl = f === 0 || f === 3 ? .085 : .1, fg = at(new THREE.Group(), fx, -.17, .02); hand.add(fg);
      const p1 = mesh(new THREE.CapsuleGeometry(.03, fl * .55, 3, 7), skin); at(p1, 0, -fl * .35, 0); fg.add(p1); fg.rotation.x = 1.2; J['fing' + s + f] = fg;
      const p2 = mesh(new THREE.CapsuleGeometry(.027, fl * .45, 3, 7), skin); at(p2, 0, -fl * .8, .03); p2.rotation.x = 1.3; fg.add(p2);
      const kn = mesh(new THREE.SphereGeometry(.026, 6, 4), metal); at(kn, 0, -.005, .028); fg.add(kn); }
    const thumb = mesh(new THREE.CapsuleGeometry(.034, .08, 3, 7), skin); at(thumb, -s * .1, -.1, .06); thumb.rotation.set(.6, 0, s * .8); hand.add(thumb); }
  // legs + boots
  for (const s of [-1, 1]) { const lg = at(new THREE.Group(), s * .17, -.05, 0); hips.add(lg); J['leg' + s] = lg;
    lg.add(mesh(limb(.14, .11, .42, 8, .1), cloth));
    const kn = at(new THREE.Group(), 0, -.42, 0); lg.add(kn); J['kn' + s] = kn;
    kn.add(mesh(limb(.11, .1, .3), leather)); const kp = mesh(new THREE.SphereGeometry(.1, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2), metal); kp.rotation.x = Math.PI / 2; at(kp, 0, -.02, .07); kn.add(kp);
    const bootTop = mesh(new THREE.CylinderGeometry(.16, .12, .14, 9), leather); at(bootTop, 0, -.26, 0); kn.add(bootTop);
    const an = at(new THREE.Group(), 0, -.38, 0); kn.add(an); J['an' + s] = an;
    an.add(at(mesh(disp(new THREE.BoxGeometry(.2, .14, .34, 2, 1, 3), v => { if (v.z > .1) { v.y -= .02; v.x *= .9; } if (v.y > 0) v.x *= .8; }), leather), 0, -.05, .07)); }
  // cape
  const cape = mesh(disp(new THREE.PlaneGeometry(.9, 1.3, 6, 10), v => { const f = (v.y - .65) / -1.3; v.z = -.05 * Math.cos(v.x * 7) * f - .18 * f * f; v.x *= 1 + f * .35; }), M('cloth', { side: THREE.DoubleSide })); at(cape, 0, -.05, -.32); torso.add(cape); cape.rotation.x = .12; J.cape = cape;
  // staff + magic crystal (the one tasteful magic element)
  const staff = new THREE.Group(); J.handR = J['hand1']; staff.position.set(0, -.18, .07); J.handR.add(staff); J.staff = staff;
  staff.add(at(mesh(disp(new THREE.CylinderGeometry(.04, .05, 2.2, 7, 8), v => { v.x += .02 * Math.sin(v.y * 4); }), M('wood')), 0, .1, 0));
  for (const y of [.6, -.2]) staff.add(at(mesh(new THREE.TorusGeometry(.055, .02, 5, 10), metal), 0, y, 0).rotateX(Math.PI / 2));
  const claw = new THREE.Group(); at(claw, 0, 1.2, 0); staff.add(claw); for (let i = 0; i < 3; i++) { const c = mesh(new THREE.ConeGeometry(.035, .32, 5), metal); c.position.set(Math.cos(i * 2.09) * .1, .12, Math.sin(i * 2.09) * .1); c.rotation.set(Math.sin(i * 2.09) * .5, 0, -Math.cos(i * 2.09) * .5); claw.add(c); }
  const crystal = mesh(disp(new THREE.OctahedronGeometry(.13, 0), v => { v.y *= 1.7; }), glow(P.magic, LOOK.light.magicI)); at(crystal, 0, 1.42, 0); staff.add(crystal); J.crystal = crystal;
  const pl = new THREE.PointLight(P.magic, LOOK.light.magicL, 5, 1.6); at(pl, 0, 1.42, .1); staff.add(pl); J.magicLight = pl;
  root.userData.J = J; return root; }

// poses: 'stand' (heroic, staff planted) and walk(t)
export function pose(h, o = {}) { const J = h.userData.J, t = o.t ?? 0, walk = o.walk ?? 0, p = t * Math.PI * 2 / 1.0, br = Math.sin(t * 2.2);
  const sw = Math.sin(p) * walk, cw = Math.cos(p) * walk;
  J.hips.position.y = .98 - .035 * walk * (1 - Math.abs(Math.cos(p))) + .006 * br; J.hips.rotation.set(0, .1 * sw, .03 * sw);
  J.torso.rotation.set(.06 + .05 * walk + .01 * br, -.16 * sw + (o.twist ?? 0), -.02 * sw);
  J.neck.rotation.set(-.05 - .04 * walk, .08 * sw + (o.look ?? 0), 0); J.head.rotation.set(-.04, 0, 0);
  for (const s of [-1, 1]) { const ph = s * sw, kp = s > 0 ? Math.max(0, Math.cos(p)) : Math.max(0, -Math.cos(p));
    J['leg' + s].rotation.set(walk ? -.5 * ph : (s > 0 ? -.12 : .1), 0, s * .06);
    J['kn' + s].rotation.x = walk ? .15 + .9 * kp * kp : (s > 0 ? .2 : .08); J['an' + s].rotation.x = walk ? -.2 * ph - .3 * kp * kp + .05 : (s > 0 ? -.08 : -.18); }
  // left arm: fist hanging / swinging; right arm holds the staff
  J['sh-1'].rotation.set(walk ? .45 * sw : .08, 0, -.3); J['el-1'].rotation.set(walk ? -.35 - .2 * Math.max(0, sw) : -.25, 0, 0);
  J['sh1'].rotation.set(walk ? -.22 * sw - .35 : -.5, 0, .32); J['el1'].rotation.set(walk ? -.9 : -1.05, 0, 0); J.staff.rotation.set(walk ? 1.25 + .1 * sw : 1.48, 0, -.1);
  J.cape.rotation.x = .12 + .2 * walk + .04 * Math.abs(sw) + .015 * br; J.tab.rotation.x = .06 + .2 * Math.max(0, cw) * walk;
  const up = o.lookUp ?? 0, sn = o.sneeze ?? 0, cast = o.cast ?? 0, shrug = o.shrug ?? 0;
  J.neck.rotation.x += -.45 * up + .5 * sn; J.torso.rotation.x += .35 * sn - .1 * up; J.head.rotation.x += .25 * sn;
  if (cast) { J['sh1'].rotation.x = lerp(J['sh1'].rotation.x, -2.5, cast); J['sh1'].rotation.z = lerp(J['sh1'].rotation.z, .15, cast); J['el1'].rotation.x = lerp(J['el1'].rotation.x, -.25, cast); J.torso.rotation.x -= .12 * cast; }
  if (shrug) { for (const s of [-1, 1]) { J['sh' + s].rotation.z += -s * .55 * shrug; J['sh' + s].position.y = .56 + .07 * shrug; J['el' + s].rotation.x = lerp(J['el' + s].rotation.x, -1.5, shrug); } J.neck.rotation.z = .18 * shrug; }
  else { J.neck.rotation.z = 0; J['sh1'].position.y = J['sh-1'].position.y = .56; }
  J.crystal.rotation.y = t * 1.3; J.crystal.position.y = 1.42 + .03 * Math.sin(t * 2.4); }

// ---------- diorama ----------
export function diorama() { const P = LOOK.pal, g = new THREE.Group(), R = GROUND - .6;
  const hgt = (x, z) => .18 * noise3(x * .5, 0, z * .5) + .1 * noise3(x * 1.3, 5, z * 1.3) - .14 + Math.max(0, -z - 2.5) * .05;
  const rn = a => 1 + .07 * Math.sin(a * 5 + 1) + .05 * Math.sin(a * 11 + 3);
  // top: polar grid so the edge follows the wobbly cliff exactly
  const rings = 26, segs = 72, pos = [], uv = [], idx = [];
  for (let i = 0; i <= rings; i++) for (let j = 0; j < segs; j++) { const a = j / segs * Math.PI * 2, rr = R * rn(a) * i / rings, x = Math.cos(a) * rr, z = Math.sin(a) * rr; pos.push(x, hgt(x, z), z); uv.push((x + GROUND) / (GROUND * 2), 1 - (z + GROUND) / (GROUND * 2)); }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const a = i * segs + j, b = i * segs + (j + 1) % segs, c = a + segs, d = b + segs; idx.push(a, b, c, b, d, c); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); tg.setIndex(idx); tg.computeVertexNormals();
  const gm = M('ground', { rough: .95 }); gm.map.flipY = true; g.add(mesh(tg, gm, false));
  // cliff skirt with strata
  const cg = new THREE.CylinderGeometry(1, 1, 1, segs, 6, true); disp(cg, v => { const a = Math.atan2(v.z, v.x), f = .5 - v.y, rr = R * rn(a) * lerp(1, .62, f * f) + (f > .02 ? (noise3(v.x * 3, v.y * 4, v.z * 3) - .5) * .5 : 0);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr; v.set(x, f < .01 ? hgt(x, z) : -f * 3.4 + .05, z); });
  g.add(mesh(vcol(wuv(cg, .55), (c, x, y) => c.setScalar(lerp(.55, 1, clamp((y + 3.4) / 3.4)))), M('cliff', { vc: 1, flat: 1 }), false));
  // cottage
  const house = new THREE.Group(); at(house, -2.0, -.05, -3.6); house.rotation.y = .38; g.add(house);
  house.add(at(mesh(wuv(disp(new THREE.BoxGeometry(3.0, 1.2, 2.4, 4, 2, 4), v => { v.x += (noise3(v.x, v.y * 2, v.z) - .5) * .12; v.z += (noise3(v.z, v.y * 2, v.x) - .5) * .12; }), .55), M('stone', { flat: 1 })), 0, .6, 0));
  house.add(at(mesh(wuv(disp(new THREE.BoxGeometry(3.3, 1.5, 2.7, 3, 2, 3), v => { if (v.y > 0) v.x *= 1.04; }), .62), M('plaster')), 0, 1.95, 0));
  const ridgeY = 4.05, roofW = 3.9, half = 1.75;
  for (const s of [-1, 1]) { const rf = mesh(wuv(disp(new THREE.BoxGeometry(roofW, .16, 2.25, 6, 1, 3), v => { v.y -= .1 * Math.sin((v.x / roofW + .5) * Math.PI) * (v.z / 2.25 + .5); }), .7), M('shingle', { flat: 1 }));
    rf.position.set(0, ridgeY - .78, s * .95); rf.rotation.x = s * .72; house.add(rf); }
  const gableShape = new THREE.Shape([new THREE.Vector2(-half * .78, 0), new THREE.Vector2(half * .78, 0), new THREE.Vector2(0, 1.25)]);
  for (const s of [-1, 1]) { const gb = mesh(wuv(new THREE.ExtrudeGeometry(gableShape, { depth: .1, bevelEnabled: false }), .62), M('plaster')); gb.rotation.y = Math.PI / 2; at(gb, s * 1.6, 2.7, 0); house.add(gb); }
  house.add(at(mesh(new THREE.BoxGeometry(roofW + .1, .14, .2), M('wood')), 0, ridgeY - .05, 0));
  house.add(at(mesh(wuv(disp(new THREE.BoxGeometry(.6, 1.8, .6, 1, 3, 1), v => { v.x *= 1 - v.y * .05; }), .55), M('stone', { flat: 1 })), .9, 3.9, -.6));
  const door = mesh(wuv(new THREE.BoxGeometry(.75, 1.15, .1), .9), M('wood')); at(door, .3, .6, 1.22); house.add(door);
  const win = glow(P.window, LOOK.light.windowI); for (const [x, y, z, ry] of [[-.85, 2.0, 1.36, 0], [.95, 2.0, 1.36, 0], [-.7, .62, 1.21, 0]]) { const w = mesh(new THREE.PlaneGeometry(.5, .55), win); at(w, x, y, z); w.rotation.y = ry; house.add(w);
    const fr = mesh(new THREE.BoxGeometry(.62, .07, .08), M('wood')); house.add(at(fr.clone(), x, y + .3, z + .02)); house.add(at(fr.clone(), x, y - .3, z + .02)); const fv = mesh(new THREE.BoxGeometry(.06, .55, .08), M('wood')); house.add(at(fv, x, y, z + .02)); }
  const lamp = mesh(new THREE.SphereGeometry(.09, 8, 6), glow(P.window, LOOK.light.windowI * 1.2)); at(lamp, .95, 1.05, 1.42); house.add(lamp); const ll = new THREE.PointLight(P.window, LOOK.light.windowL, 4, 1.8); at(ll, .95, 1.05, 1.7); house.add(ll);
  // tree: flared, bent trunk + clumpy painted canopy
  const tree = new THREE.Group(); at(tree, 2.5, -.1, -1.6); g.add(tree);
  const tp = [[.62, 0], [.36, .25], [.27, .8], [.24, 1.6], [.22, 2.3], [.16, 3.0], [.05, 3.3]].map(([x, y]) => new THREE.Vector2(x, y));
  tree.add(mesh(disp(new THREE.LatheGeometry(tp, 9), v => { v.x += .35 * Math.sin(v.y * .9) - .1; v.z += .15 * Math.sin(v.y * 1.4); v.x += (noise3(v.x * 4, v.y * 2, v.z * 4) - .5) * .12; }), M('bark')));
  for (const [a, y, l] of [[-.9, 2.2, 1.3], [1.0, 2.5, 1.1]]) { const br = mesh(limb(.13, .05, l, 6), M('bark')); at(br, .25, y, 0); br.rotation.z = a + Math.PI; tree.add(br); }
  const rt = rng(3); for (const [x, y, z, s] of [[.2, 3.6, 0, 1.45], [-1.0, 3.1, .3, 1.0], [1.3, 3.25, -.2, 1.05], [.3, 4.4, -.2, .95], [.7, 3.0, .9, .8], [-.3, 3.4, -.9, .9]]) {
    const cg2 = disp(new THREE.IcosahedronGeometry(s, 2), v => { const n = noise3(v.x * 1.6 + x, v.y * 1.6, v.z * 1.6); v.multiplyScalar(1 + (n - .5) * .45); v.y *= .82; });
    vcol(cg2, (c, px, py, pz, nx, ny) => c.setScalar(lerp(.42, 1.12, clamp(ny * .5 + .5))).lerp(new THREE.Color(P.leafTint), clamp(ny) * .35)); const cm = mesh(cg2, M('leaf', { vc: 1, flat: !!LOOK.flatLeaves })); at(cm, x + (rt() - .5) * .1, y, z); tree.add(cm); }
  // rock
  const rk = disp(new THREE.DodecahedronGeometry(.75, 1), v => { v.multiplyScalar(1 + (noise3(v.x * 2, v.y * 2, v.z * 2) - .5) * .5); v.y *= .7; });
  const rockM = mesh(vcol(wuv(rk, .9), (c, x, y, z, nx, ny) => { c.setScalar(lerp(.6, 1.05, clamp(y / .5 + .5))); if (ny > .6) c.lerp(new THREE.Color(P.moss), .6); }), M('rock', { vc: 1, flat: 1 })); at(rockM, -2.4, .12, 1.6); rockM.rotation.y = .7; g.add(rockM);
  const rk2 = mesh(vcol(wuv(disp(new THREE.DodecahedronGeometry(.35, 0), v => { v.y *= .7; }), .9), (c, x, y, z, nx, ny) => { if (ny > .6) c.lerp(new THREE.Color(P.moss), .5); }), M('rock', { vc: 1, flat: 1 })); at(rk2, -1.65, .05, 2.25); g.add(rk2);
  // grass tufts + a few rocks on the rim
  const tuftM = new THREE.MeshStandardMaterial({ color: P.tuft, roughness: .9, flatShading: true, envMapIntensity: LOOK.light.env }); const rg = rng(11);
  for (let i = 0; i < 70; i++) { const a = rg() * Math.PI * 2, rr = 1.2 + rg() * (R - 1.6), x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (Math.abs(x - .1) < 1 && z > -2.2) continue; if (Math.hypot(x + 2, z + 3.6) < 2.2) continue;
    const tf = new THREE.Group(); for (let k = 0; k < 5; k++) { const bl = mesh(new THREE.ConeGeometry(.05, .3 + rg() * .2, 3), tuftM, false); bl.position.set((rg() - .5) * .18, .14, (rg() - .5) * .18); bl.rotation.set((rg() - .5) * .6, 0, (rg() - .5) * .6); tf.add(bl); } at(tf, x, hgt(x, z), z); g.add(tf); }
  // floating islands far away + distant low-poly mountains (depth)
  const far = new THREE.MeshStandardMaterial({ color: P.far, roughness: 1, flatShading: true, envMapIntensity: .3, emissive: P.far, emissiveIntensity: .25 }); const rm = rng(5);
  for (let i = 0; i < 14; i++) { const a = -Math.PI * .95 + i / 13 * Math.PI * .9 + (rm() - .5) * .1, d = 70 + rm() * 30, hh = 10 + rm() * 16, m = mesh(disp(new THREE.ConeGeometry(7 + rm() * 6, hh, 6, 2), v => { v.x += (rm() - .5) * 1.5; }), far, false); at(m, Math.cos(a) * d, hh / 2 - 9, Math.sin(a) * d); g.add(m); }
  return { g, hgt }; }

// ---------- sky ----------
function sky(scene) { const S = LOOK.sky;
  const u = { top: { value: new THREE.Color(S.top) }, mid: { value: new THREE.Color(S.mid) }, low: { value: new THREE.Color(S.low) }, sunDir: { value: new THREE.Vector3(...LOOK.light.keyPos).normalize() }, sunCol: { value: new THREE.Color(S.sun) }, sunK: { value: S.sunK } };
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: u,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 top,mid,low,sunDir,sunCol; uniform float sunK; varying vec3 vP; void main(){ float h=vP.y; vec3 c = h>0.12 ? mix(mid,top,smoothstep(.12,.7,h)) : mix(low,mid,smoothstep(-.1,.12,h));
      float s = max(dot(vP, normalize(vec3(sunDir.x, max(sunDir.y,.05), sunDir.z))),0.); c += sunCol*sunK*(pow(s,60.)*1.2 + pow(s,5.)*.3); gl_FragColor=vec4(c,1.); }` }));
  scene.add(m);
  { const r = rng(7), n = 700, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const th = r() * 6.283, y = .1 + r() * .9, rr = Math.sqrt(1 - y * y); p.set([Math.cos(th) * rr * 280, y * 280, Math.sin(th) * rr * 280], i * 3); }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(p, 3)); const st = new THREE.Points(gg, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 2.4, sizeAttenuation: false, fog: false, transparent: true, opacity: S.stars ? 1 : 0 })); scene.add(st); m.userData.stars = st; }
  if (S.moon) { const mo = mesh(new THREE.SphereGeometry(9, 24, 16), glow(S.moon, 1.6), false); mo.position.set(...S.moonPos); mo.material.fog = false; scene.add(mo); }
  if (S.clouds) { const cm = new THREE.MeshStandardMaterial({ color: S.clouds, roughness: 1, flatShading: true, envMapIntensity: .6, fog: false, emissive: S.clouds, emissiveIntensity: .45 }), r = rng(21);
    for (let i = 0; i < 9; i++) { const c = new THREE.Group(); for (let k = 0; k < 4; k++) { const b = mesh(new THREE.IcosahedronGeometry(3 + r() * 3, 1), cm, false); b.scale.y = .55; b.position.set(k * 3.5 - 5, r() * 1.2, (r() - .5) * 3); c.add(b); }
      const a = -Math.PI * .9 + i / 8 * Math.PI * .8; c.position.set(Math.cos(a) * (60 + r() * 30), 18 + r() * 16, Math.sin(a) * (60 + r() * 30)); scene.add(c); } }
  return m; }

// ---------- grade (display space, after ACES + sRGB) ----------
const GRADE = { uniforms: { tDiffuse: { value: null }, wb: { value: new THREE.Vector3(1, 1, 1) }, sh: { value: new THREE.Vector3() }, hi: { value: new THREE.Vector3() }, sat: { value: 1 }, con: { value: 0 }, vig: { value: .3 }, lift: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 wb, sh, hi; uniform float sat, con, vig, lift; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * wb; float l = dot(c, vec3(.2126,.7152,.0722));
      c += sh * (1. - l) * (1. - l); c += hi * l * l; c = mix(vec3(l), c, sat); c = clamp(c, 0., 1.); c = mix(c, c*c*(3.-2.*c), con); c = lift + c * (1. - lift);
      vec2 d = (vUv - .5) * vec2(.5625, 1.) * 1.6; c *= 1. - vig * smoothstep(.4, 1.05, length(d)); gl_FragColor = vec4(c, 1.); }` };
const MIX = { uniforms: { tDiffuse: { value: null }, bloomTex: { value: null }, k: { value: 1 } }, vertexShader: GRADE.vertexShader,
  fragmentShader: 'uniform sampler2D tDiffuse, bloomTex; uniform float k; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv) + k * texture2D(bloomTex, vUv); }' };

// PS1 (candidate D only): subtle clip-space vertex snap + affine (non-perspective) texture mapping
function ps1(m, gx, gy) { if (m.userData.ps1 || !m.isMeshStandardMaterial) return; m.userData.ps1 = 1;
  m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('varying vec2 vMapUv;', 'noperspective varying vec2 vMapUv;').replace('#include <fog_vertex>', `#include <fog_vertex>
    { vec2 sg = vec2(${gx.toFixed(1)}, ${gy.toFixed(1)}); gl_Position.xy = floor(gl_Position.xy / gl_Position.w * sg + .5) / sg * gl_Position.w; }`);
    sh.fragmentShader = sh.fragmentShader.replace('varying vec2 vMapUv;', 'noperspective varying vec2 vMapUv;'); };
  m.customProgramCacheKey = () => 'ps1v3'; m.needsUpdate = true; }

// ---------- the study: build everything for one look ----------
export function createStudy(canvas, look) { LOOK = look; const L = look.light;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true }); renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; // r186: PCFSoft was removed; PCF + shadow.radius is the soft path renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = L.exposure; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(look.sky.fog, L.fogNear ?? 30, L.fogFar ?? 140);
  const camera = new THREE.PerspectiveCamera(38, W / H, .05, 800); camera.layers.enable(BLOOM);
  const skyMesh = sky(scene);
  // image-based bounce from the sky itself
  { const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene(); es.add(skyMesh.clone()); const gr = new THREE.Mesh(new THREE.SphereGeometry(100, 16, 8, 0, Math.PI * 2, Math.PI * .55, Math.PI * .45), new THREE.MeshBasicMaterial({ color: L.groundBounce, side: THREE.BackSide })); es.add(gr);
    scene.environment = pm.fromScene(es, .02).texture; }
  const hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiI); scene.add(hemi);
  const key = new THREE.DirectionalLight(L.key, L.keyI); key.position.set(...L.keyPos); key.castShadow = true; key.shadow.mapSize.set(4096, 4096);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 80 }); key.shadow.bias = -.0004; key.shadow.normalBias = .025; key.shadow.radius = 4; key.shadow.blurSamples = 16; scene.add(key);
  const rim = new THREE.DirectionalLight(L.rim, L.rimI); rim.position.set(...L.rimPos); scene.add(rim);
  const bounce = new THREE.DirectionalLight(L.bounce, L.bounceI); bounce.position.set(-L.keyPos[0], -4, -L.keyPos[2] * .2 + 6); scene.add(bounce);
  const { g: dio, hgt } = diorama(); scene.add(dio);
  const h = hero(); scene.add(h);
  // motes: a few soft sparks around the crystal (tasteful, on the bloom layer)
  const motes = []; { const mg = new THREE.OctahedronGeometry(.025, 0), mm = glow(look.pal.magic, L.magicI * .8); for (let i = 0; i < 9; i++) { const m = mesh(mg, mm, false); motes.push(m); scene.add(m); } }
  // passes: selective bloom composer (everything not on BLOOM drawn black) + final composer
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const bloomC = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType })); bloomC.renderToScreen = false; bloomC.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), L.bloom, L.bloomR ?? .5, 0); bloomC.addPass(bloom);
  const fin = new EffectComposer(renderer, rt); fin.addPass(new RenderPass(scene, camera));
  let gtao = null; if (L.ao) { gtao = new GTAOPass(scene, camera, W, H); gtao.blendIntensity = L.ao; gtao.updateGtaoMaterial({ radius: .45, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 16 }); gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 }); fin.addPass(gtao); }
  const mix = new ShaderPass(new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(MIX.uniforms), vertexShader: MIX.vertexShader, fragmentShader: MIX.fragmentShader }), 'tDiffuse'); mix.uniforms.k.value = 1; fin.addPass(mix);
  fin.addPass(new OutputPass()); const gp = new ShaderPass(GRADE); const G = look.grade; gp.uniforms.wb.value.set(...G.wb); gp.uniforms.sh.value.set(...G.sh); gp.uniforms.hi.value.set(...G.hi);
  Object.assign(gp.uniforms.sat, { value: G.sat }); gp.uniforms.con.value = G.con; gp.uniforms.vig.value = G.vig; gp.uniforms.lift.value = G.lift ?? 0; fin.addPass(gp);
  const black = new THREE.MeshBasicMaterial({ color: 0 }), blackPts = new THREE.PointsMaterial({ color: 0, size: 2, sizeAttenuation: false }), saved = new Map();
  if (look.ps1) scene.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => ps1(m, look.ps1[0], look.ps1[1])); });
  function render() { scene.traverse(o => { if ((o.isMesh || o.isPoints) && !o.layers.isEnabled(BLOOM)) { saved.set(o, o.material); o.material = o.isPoints ? blackPts : black; } });
    const fog = scene.fog; scene.fog = null; bloomC.render(); scene.fog = fog; saved.forEach((m, o) => { o.material = m; }); saved.clear();
    mix.uniforms.bloomTex.value = bloomC.readBuffer.texture; fin.render(); }
  function place(t, cam) { const c = typeof cam === 'function' ? cam(t) : cam; camera.position.set(...c.pos); camera.fov = c.fov; camera.updateProjectionMatrix(); camera.lookAt(...c.look);
    const st = c.hero ?? { x: .2, z: .6, ry: -.25 }; h.position.set(st.x, hgt(st.x, st.z), st.z); h.rotation.y = st.ry; pose(h, { look: .12, ...st, t: st.t ?? t, walk: st.walk ?? 0 });
    { const J = h.userData.J, hq = new THREE.Quaternion(); J.handR.updateWorldMatrix(true, false); J.handR.getWorldQuaternion(hq); J.staff.parent.updateWorldMatrix(true, false);
      const want = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(st.staff ?? [st.walk ? .12 + .06 * Math.sin(t * Math.PI * 2) : .05, 0, st.walk ? -.08 : -.12]))); J.staff.quaternion.copy(hq.invert().multiply(want)); }
    h.updateMatrixWorld(true); const cp = new THREE.Vector3(); h.userData.J.crystal.getWorldPosition(cp);
    motes.forEach((m, i) => { const a = t * (.6 + i * .07) + i * 2.4, r = .25 + (i % 3) * .12; m.position.set(cp.x + Math.cos(a) * r, cp.y - .1 + ((t * .25 + i * .13) % 1) * .6, cp.z + Math.sin(a) * r); m.scale.setScalar(.6 + .4 * Math.sin(t * 3 + i)); });
  }
  function frame(t, cam) { place(t, cam); render(); return canvas.toDataURL('image/jpeg', .94); }
  return { renderer, scene, camera, frame, place, render, hero: h, hgt, sky: skyMesh, lights: { key, rim, bounce, hemi }, fog: scene.fog, motes, bloom, gp }; }
