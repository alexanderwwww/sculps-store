// "aesthetic blocks" — the default WHAT IF look (Alex, 2026-11-14): a blocky low-poly
// fantasy world, warm saturated colours, chunky shapes, glowing magic, epic sky,
// dramatic light. Original: no characters, logos or assets from any game.
// Everything here is deterministic: the same t always draws the same frame.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export { THREE };
export const W = 1080, H = 1920;

// ---------- deterministic helpers ----------
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi; const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
export const smooth = (a, b, t) => ease((t - a) / (b - a));

export const PAL = {
  skyTop: 0x1b1046, skyMid: 0x7a2f8f, skyLow: 0xff8a4c, fog: 0x8a4a8e,
  grass: [0x5cc05a, 0x4fae4f, 0x74cc5c], dirt: 0x9a6b43, sand: 0xf2cf86, rock: [0x8d8aa6, 0x77748f],
  water: 0x2fb6d6, leaf: [0x3fa34d, 0x58c25a, 0xf29a2e, 0xe8603c, 0xffc43d], trunk: 0x7a4a2a,
  wall: [0xf1e3c6, 0xe8d2b0, 0xd9c2a0], roof: [0xd8443a, 0x3e64d8, 0x8b4fd8, 0x2f9e8f], stone: 0xb7b2c9,
  magic: 0x5ff6ff, gold: 0xffd23f, warm: 0xffa040, shirts: [0xe84a5f, 0x3fa7f5, 0xffc43d, 0x7c5cff, 0x2ecc71, 0xff7a3d, 0xff5fa2], skin: [0xf5c9a0, 0xd9a273, 0xa86d45, 0x7a4a2e, 0xffd9b8],
};
const mats = new Map();
export function mat(color, o = {}) { const k = color + JSON.stringify(o); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .85, metalness: 0, ...o })); return mats.get(k); }
export function glowMat(color, intensity = 2.5) { return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, flatShading: true }); }
export function P(o, x, y, z) { o.position.set(x, y, z); return o; }
export function box(w, h, d, color, o) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'number' ? mat(color, o) : color); m.castShadow = m.receiveShadow = true; return m; }

let haloTex;
export function halo(color, size, opacity = .9) {
  if (!haloTex) { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); haloTex = new THREE.CanvasTexture(c); }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.setScalar(size); return s;
}

// ---------- the world ----------
export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAL.fog, 90, 420);
  const camera = new THREE.PerspectiveCamera(55, W / H, .1, 2000);

  // sky dome
  const skyU = { top: { value: new THREE.Color(PAL.skyTop) }, mid: { value: new THREE.Color(PAL.skyMid) }, low: { value: new THREE.Color(PAL.skyLow) }, sunDir: { value: new THREE.Vector3(.6, .12, -.8).normalize() }, sunCol: { value: new THREE.Color(0xffc070) } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 top,mid,low,sunDir,sunCol; varying vec3 vP; void main(){ float h=vP.y; vec3 c = h>0.18 ? mix(mid,top,smoothstep(.18,.75,h)) : mix(low,mid,smoothstep(-.05,.18,h));
      float s = max(dot(vP, normalize(sunDir)),0.); c += sunCol*(pow(s,40.)*1.6 + pow(s,4.)*.35); gl_FragColor=vec4(c,1.); }` }));
  scene.add(sky);

  // stars
  { const r = rng(7), n = 900, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const th = r() * Math.PI * 2, y = .25 + r() * .75, rr = Math.sqrt(1 - y * y); p.set([Math.cos(th) * rr * 800, y * 800, Math.sin(th) * rr * 800], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff4d6, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: .85 }))); }

  // light
  const hemi = new THREE.HemisphereLight(0xb9a6ff, 0x6a3d2a, 1.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb070, 3.2); sun.position.set(80, 60, -90); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 400 }); sun.shadow.bias = -0.0008; scene.add(sun);
  const rim = new THREE.DirectionalLight(0x6fd8ff, 1.0); rim.position.set(-70, 40, 80); scene.add(rim);

  // voxel island
  const height = (x, z) => { const r = Math.hypot(x, z * 1.1); const fall = 1 - clamp((r - 26) / 22); const n = vnoise(x * .06, z * .06) * 5 + vnoise(x * .15 + 9, z * .15) * 2;
    let h = fall * (3 + n) - (1 - fall) * 5; if (r < 12) h = Math.max(h, 5); return Math.round(h); };
  const cells = []; for (let x = -70; x <= 70; x += 2) for (let z = -70; z <= 70; z += 2) { const h = height(x, z); if (h > -5) cells.push([x, z, h]); }
  const ig = new THREE.BoxGeometry(2, 1, 2); const im = new THREE.InstancedMesh(ig, new THREE.MeshStandardMaterial({ flatShading: true, roughness: .9 }), cells.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  cells.forEach(([x, z, h], i) => { const base = -12, hh = h - base; m4.makeScale(1, hh, 1); m4.setPosition(x, base + hh / 2, z); im.setMatrixAt(i, m4);
    const v = hash2(x, z); col.set(h <= 0 ? PAL.sand : h <= 1 ? PAL.sand : h > 8 ? PAL.rock[v > .5 ? 0 : 1] : PAL.grass[Math.floor(v * 3)]); im.setColorAt(i, col); });
  im.castShadow = im.receiveShadow = true; scene.add(im);

  // water
  const wg = new THREE.PlaneGeometry(900, 900, 1, 1); wg.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: PAL.water, roughness: .25, metalness: .1, transparent: true, opacity: .9, emissive: 0x0b4a7a, emissiveIntensity: .35 }));
  water.position.y = .3; water.receiveShadow = true; scene.add(water);

  const composer = new EffectComposer(renderer); composer.setPixelRatio(1); composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), .75, .55, .82); composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return { renderer, scene, camera, composer, bloom, sky, skyU, sun, hemi, rim, water, height, flat: (x, z) => Math.max(height(x, z), 0) };
}

// ---------- props ----------
export function tree(r) { const g = new THREE.Group(); const h = 2 + Math.floor(r() * 3); g.add(P(box(1, h, 1, PAL.trunk), 0, h / 2, 0));
  const c = PAL.leaf[Math.floor(r() * PAL.leaf.length)]; const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) { const s = 3.2 - i * .9; const b = box(s, s * .8, s, c); b.position.set((r() - .5) * .6, h + i * 1.8 + .6, (r() - .5) * .6); b.rotation.y = r(); g.add(b); } return g; }

export function house(r, w = 5, d = 5, floors = 1) { const g = new THREE.Group(); const wall = PAL.wall[Math.floor(r() * 3)], roof = PAL.roof[Math.floor(r() * 4)];
  const hh = 3.6 * floors; g.add(P(box(w, hh, d, wall), 0, hh / 2, 0));
  const rf = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * .8, 3, 4), mat(roof)); rf.rotation.y = Math.PI / 4; rf.position.y = hh + 1.5; rf.castShadow = true; g.add(rf);
  const win = glowMat(PAL.warm, 2.2); for (let f = 0; f < floors; f++) for (const sx of [-1, 1]) { const wdw = new THREE.Mesh(new THREE.BoxGeometry(.9, 1.1, .1), win); wdw.position.set(sx * w * .25, 1.9 + f * 3.6, d / 2 + .05); g.add(wdw); }
  const door = box(1.1, 1.8, .1, 0x6b3e22); door.position.set(0, .9, d / 2 + .06); g.add(door); return g; }

export function tower(r, floors) { const g = new THREE.Group(); const wall = PAL.wall[Math.floor(r() * 3)], roof = PAL.roof[Math.floor(r() * 4)]; const win = glowMat(PAL.warm, 2);
  for (let f = 0; f < floors; f++) { const b = box(4.4, 3.4, 4.4, f % 2 ? wall : PAL.stone); b.position.y = f * 3.4 + 1.7; g.add(b);
    for (let k = 0; k < 4; k++) { const wd = new THREE.Mesh(new THREE.BoxGeometry(.8, 1, .1), win); const a = k * Math.PI / 2; wd.position.set(Math.sin(a) * 2.25, f * 3.4 + 1.8, Math.cos(a) * 2.25); wd.rotation.y = a; g.add(wd); } }
  const rf = new THREE.Mesh(new THREE.ConeGeometry(3.6, 4, 4), mat(roof)); rf.rotation.y = Math.PI / 4; rf.position.y = floors * 3.4 + 2; rf.castShadow = true; g.add(rf); return g; }

export function person(r, o = {}) { const g = new THREE.Group(); const shirt = o.shirt ?? PAL.shirts[Math.floor(r() * PAL.shirts.length)], skin = o.skin ?? PAL.skin[Math.floor(r() * PAL.skin.length)];
  const hair = o.hair ?? [0x2a1a10, 0x5a3418, 0xe0b04a, 0x1a1a1a, 0xb84a2a, 0xeeeeee][Math.floor(r() * 6)];
  const legL = box(.45, 1, .45, 0x34386b), legR = legL.clone(); legL.position.set(-.27, .5, 0); legR.position.set(.27, .5, 0);
  const body = box(1.2, 1.3, .7, shirt); body.position.y = 1.65; const head = box(.95, .95, .95, skin); head.position.y = 2.8;
  const hr = box(1.02, .32, 1.02, hair); hr.position.y = 3.3; const eyeM = mat(0x1a1020); const e1 = new THREE.Mesh(new THREE.BoxGeometry(.14, .18, .05), eyeM), e2 = e1.clone(); e1.position.set(-.2, 2.85, .49); e2.position.set(.2, 2.85, .49);
  const armL = box(.36, 1.1, .36, shirt), armR = armL.clone(); armL.position.set(-.8, 1.7, 0); armR.position.set(.8, 1.85, .35); armR.rotation.x = -1.1;
  const phone = new THREE.Mesh(new THREE.BoxGeometry(.42, .7, .08), glowMat(o.phone ?? PAL.gold, 2.6)); phone.position.set(.75, 2.0, .85); phone.rotation.x = -.5;
  g.add(legL, legR, body, head, hr, e1, e2, armL, armR, phone); g.userData = { phone, head, armR, body }; if (o.noPhone) phone.visible = false; return g; }

export function sparkles(n, seed, color, size, spread) { const r = rng(seed), p = new Float32Array(n * 3), base = []; for (let i = 0; i < n; i++) base.push([(r() - .5) * spread[0], r() * spread[1], (r() - .5) * spread[2], r() * 6.28, .3 + r()]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .9 }));
  pts.userData.update = t => { base.forEach(([x, y, z, ph, sp], i) => p.set([x + Math.sin(t * sp + ph) * 1.2, (y + t * sp * 1.5) % spread[1], z + Math.cos(t * sp * .8 + ph) * 1.2], i * 3)); g.attributes.position.needsUpdate = true; }; return pts; }

// ---------- 2D overlay: captions, chips, title ----------
export function overlay(ctx, st) {
  const { words, t, chip, chipAge, title, titleA } = st;
  const SAFE_Y = H * .66;
  if (title && titleA > 0) { ctx.save(); ctx.globalAlpha = titleA; ctx.textAlign = 'center'; ctx.font = '900 104px Inter'; ctx.lineJoin = 'round';
    title.split('\n').forEach((l, i) => { const y = 300 + i * 118; ctx.lineWidth = 18; ctx.strokeStyle = '#1b0b33'; ctx.strokeText(l, W / 2, y); ctx.fillStyle = i ? PALCSS.gold : '#fff'; ctx.fillText(l, W / 2, y); }); ctx.restore(); }
  if (chip && chipAge >= 0) { const a = clamp(chipAge / .25) * clamp((st.chipLeft) / .25); const s = .8 + .2 * easeOut(chipAge / .3); ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, 470); ctx.scale(s, s);
    ctx.font = '800 58px Inter'; const tw = ctx.measureText(chip).width + 80; ctx.fillStyle = 'rgba(20,8,45,.82)'; rr(ctx, -tw / 2, -50, tw, 100, 50); ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = PALCSS.gold; ctx.stroke();
    ctx.fillStyle = PALCSS.gold; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(chip, 0, 3); ctx.restore(); }
  if (st.counter != null) { ctx.save(); ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.font = '900 150px Inter'; ctx.lineWidth = 20; ctx.strokeStyle = '#140826';
    const s = `YEAR ${st.counter}`; ctx.strokeText(s, W / 2, 700); ctx.fillStyle = '#fff'; ctx.fillText(s, W / 2, 700); ctx.restore(); }
  if (st.notify > 0) { const a = easeOut(st.notify); ctx.save(); ctx.translate(0, lerp(-260, 0, a)); ctx.globalAlpha = clamp(st.notify * 3);
    const x = 60, y = 150, w = W - 120, h = 230; ctx.fillStyle = 'rgba(28,10,40,.94)'; rr(ctx, x, y, w, h, 56); ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = '#ff4f6a'; ctx.stroke();
    ctx.fillStyle = '#ff4f6a'; rr(ctx, x + 40, y + 50, 130, 130, 32); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '900 100px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', x + 105, y + 118);
    ctx.textAlign = 'left'; ctx.font = '700 40px Inter'; ctx.fillStyle = '#ffb3c0'; const NT = st.notifyText || ['YOUTH+   ·   now', 'Free trial ended', 'Renew to stay young?']; ctx.fillText(NT[0], x + 200, y + 62);
    ctx.font = '900 66px Inter'; ctx.fillStyle = '#fff'; ctx.fillText(NT[1], x + 200, y + 125); ctx.font = '700 44px Inter'; ctx.fillStyle = '#ffd6dd'; ctx.fillText(NT[2], x + 200, y + 185); ctx.restore(); }
  // word-timed chunks of 2-3 words, current word highlighted
  const ch = chunks(words); const c = [...ch].reverse().find(k => t >= k.start - .05); if (!c || t > c.end + .35) return;
  ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; const pop = 1 + .12 * (1 - easeOut((t - c.start) / .15));
  let fs = 112; ctx.font = `900 ${fs}px Inter`; const txt = c.words.map(w => w.w.toUpperCase()); const sp = 26; let tw = txt.reduce((a, w) => a + ctx.measureText(w).width, 0) + sp * (txt.length - 1);
  if (tw > W - 140) { fs = Math.floor(fs * (W - 140) / tw); ctx.font = `900 ${fs}px Inter`; tw = txt.reduce((a, w) => a + ctx.measureText(w).width, 0) + sp * (txt.length - 1); }
  ctx.translate(W / 2, SAFE_Y); ctx.scale(pop, pop); let x = -tw / 2;
  txt.forEach((w, i) => { const on = t >= c.words[i].start - .03; const cur = on && (i === txt.length - 1 || t < c.words[i + 1].start - .03);
    ctx.lineWidth = 22; ctx.strokeStyle = '#140826'; ctx.strokeText(w, x, 0); ctx.fillStyle = cur ? PALCSS.gold : '#ffffff'; ctx.globalAlpha = on ? 1 : .55; ctx.fillText(w, x, 0); ctx.globalAlpha = 1; x += ctx.measureText(w).width + sp; });
  ctx.restore();
}
const PALCSS = { gold: '#FFD23F' };
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
let _chunks, _src;
function chunks(words) { if (_src === words) return _chunks; _src = words; _chunks = []; let cur = [];
  const flush = () => { if (cur.length) _chunks.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = []; };
  words.forEach((w, i) => { if (cur.length && (cur[0].line !== w.line)) flush(); cur.push(w); const punct = /[.,?!]$/.test(w.w); if (cur.length >= 3 || punct || (cur.length === 2 && w.w.length > 7)) flush(); }); flush();
  for (let i = 0; i < _chunks.length - 1; i++) _chunks[i].end = Math.min(_chunks[i].end + .25, _chunks[i + 1].start - .02); return _chunks; }
