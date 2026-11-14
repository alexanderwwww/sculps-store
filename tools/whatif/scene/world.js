// "aesthetic blocks" — the default WHAT IF look (Alex, 2026-11-14): a blocky low-poly
// fantasy world, warm saturated colours, chunky shapes, glowing magic, epic sky,
// dramatic light. Original: no characters, logos or assets from any game.
// Everything here is deterministic: the same t always draws the same frame.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

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
  skyTop: 0x1a0f3d, skyMid: 0x6b2d86, skyLow: 0xff9a5a, fog: 0x7e4a8a, rose: 0xff6f91,
  grass: [0x5cc05a, 0x4fae4f, 0x74cc5c], dirt: 0x9a6b43, sand: 0xf2cf86, rock: [0x8d8aa6, 0x77748f],
  water: 0x2fb6d6, leaf: [0x3fa34d, 0x58c25a, 0xf29a2e, 0xe8603c, 0xffc43d], trunk: 0x7a4a2a,
  wall: [0xf1e3c6, 0xe8d2b0, 0xd9c2a0], roof: [0xd8443a, 0x3e64d8, 0x8b4fd8, 0x2f9e8f], stone: 0xb7b2c9,
  magic: 0x46f0d2, gold: 0xffc23d, warm: 0xffa040, shirts: [0xe84a5f, 0x3fa7f5, 0xffc43d, 0x7c5cff, 0x2ecc71, 0xff7a3d, 0xff5fa2], skin: [0xf5c9a0, 0xd9a273, 0xa86d45, 0x7a4a2e, 0xffd9b8],
};
const mats = new Map();
export function mat(color, o = {}) { const k = color + JSON.stringify(o); if (!mats.has(k)) { const { tex, ...rest } = o; const m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .85, metalness: 0, ...rest });
  if (STYLE.v2 && tex !== 'none') painted(m, tex || texFor(color)); mats.set(k, m); } return mats.get(k); }
// ---------- style v2: hand-painted procedural textures (canvas), mapped in world space ----------
export const STYLE = { v2: true };
const texCache = {};
function texFor(c) { if (c === PAL.stone || PAL.rock.includes(c)) return 'brick'; if (PAL.roof.includes(c)) return 'tile'; if (c === PAL.trunk || c === 0x6b3e22 || c === 0x7a4a2a) return 'wood';
  if (PAL.shirts.includes(c) || c === 0x34386b) return 'cloth'; if (PAL.leaf.includes(c)) return 'leaf'; return 'paint'; }
function paintTex(kind) { if (texCache[kind]) return texCache[kind]; const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); const r = rng(kind.length * 977 + kind.charCodeAt(0));
  const rgb = (v, a = 1, w = [0, 0, 0]) => `rgba(${Math.round(v + w[0])},${Math.round(v + w[1])},${Math.round(v + w[2])},${a})`;
  const blot = (n, a, lo, hi, rmin, rmax) => { for (let i = 0; i < n; i++) { const x = r() * N, y = r() * N, rad = rmin + r() * (rmax - rmin); const gr = g.createRadialGradient(x, y, 0, x, y, rad); const v = lo + r() * (hi - lo); gr.addColorStop(0, rgb(v, a)); gr.addColorStop(1, rgb(v, 0)); g.fillStyle = gr;
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) { g.save(); g.translate(dx, dy); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore(); } } };
  const brick = (rows, cols, mortar, lo, hi, round) => { g.fillStyle = rgb(mortar); g.fillRect(0, 0, N, N); const bh = N / rows, bw = N / cols;
    for (let y = 0; y < rows; y++) for (let x = -1; x <= cols; x++) { const ox = (y % 2) * bw / 2 + x * bw, v = lo + r() * (hi - lo); g.fillStyle = rgb(v); g.beginPath(); g.roundRect(ox + 4, y * bh + 4, bw - 8, bh - 8, round); g.fill();
      g.strokeStyle = rgb(255, .55); g.lineWidth = 3; g.beginPath(); g.moveTo(ox + 7, y * bh + bh - 8); g.lineTo(ox + 7, y * bh + 7); g.lineTo(ox + bw - 8, y * bh + 7); g.stroke();
      g.strokeStyle = rgb(v - 55, .5); g.beginPath(); g.moveTo(ox + bw - 6, y * bh + 8); g.lineTo(ox + bw - 6, y * bh + bh - 6); g.lineTo(ox + 8, y * bh + bh - 6); g.stroke(); } };
  if (kind === 'grass') { g.fillStyle = rgb(232, 1, [0, 6, -6]); g.fillRect(0, 0, N, N); blot(30, .55, 150, 255, 30, 90);
    for (let i = 0; i < 150; i++) { const x = r() * N, y = r() * N, l = 18 + r() * 22, lt = r() > .45; g.strokeStyle = lt ? rgb(255, .85, [0, 0, -30]) : rgb(135, .7, [0, 18, -10]); g.lineWidth = 4 + r() * 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x - 1, y - l); g.moveTo(x + 3, y); g.lineTo(x + 2, y - l * .8); g.stroke(); } }
  else if (kind === 'dirt') { g.fillStyle = rgb(222, 1, [6, 0, -8]); g.fillRect(0, 0, N, N); for (let i = 0; i < 40; i++) { const y = r() * N; g.strokeStyle = rgb(130 + r() * 110, .55); g.lineWidth = 5 + r() * 12; g.beginPath(); g.moveTo(-5, y); g.bezierCurveTo(N * .3, y + (r() - .5) * 12, N * .6, y + (r() - .5) * 12, N + 5, y); g.stroke(); }
    for (let i = 0; i < 50; i++) { g.fillStyle = rgb(160 + r() * 80, .6); g.beginPath(); g.ellipse(r() * N, r() * N, 3 + r() * 6, 2 + r() * 4, 0, 0, 7); g.fill(); } }
  else if (kind === 'brick') { brick(4, 2, 115, 180, 250, 12); blot(10, .2, 140, 200, 20, 50); }
  else if (kind === 'cobble') { brick(6, 4, 160, 205, 250, 18); }
  else if (kind === 'wood') { const n = 4, w = N / n; for (let i = 0; i < n; i++) { const v = 205 + r() * 40; g.fillStyle = rgb(v); g.fillRect(i * w, 0, w, N);
      for (let j = 0; j < 7; j++) { const x0 = i * w + 6 + r() * (w - 12); g.strokeStyle = rgb(v - 50, .45); g.lineWidth = 1.5 + r() * 2; g.beginPath(); g.moveTo(x0, 0); for (let y = 0; y <= N; y += 16) g.lineTo(x0 + Math.sin(y * .05 + j) * 3, y); g.stroke(); }
      g.fillStyle = rgb(110, .9); g.fillRect(i * w, 0, 4, N); g.fillStyle = rgb(255, .4); g.fillRect(i * w + 4, 0, 3, N); } }
  else if (kind === 'tile') { g.fillStyle = rgb(140); g.fillRect(0, 0, N, N); const rows = 6, cols = 5, th = N / rows, tw = N / cols;
    for (let y = rows; y >= -1; y--) for (let x = -1; x <= cols; x++) { const ox = x * tw + (y % 2) * tw / 2, oy = y * th; const gr = g.createLinearGradient(0, oy - th * .4, 0, oy + th); gr.addColorStop(0, rgb(250)); gr.addColorStop(1, rgb(175 + r() * 25)); g.fillStyle = gr;
      g.beginPath(); g.moveTo(ox + 2, oy - th * .4); g.lineTo(ox + tw - 2, oy - th * .4); g.lineTo(ox + tw - 2, oy + th * .55); g.quadraticCurveTo(ox + tw / 2, oy + th * 1.2, ox + 2, oy + th * .55); g.closePath(); g.fill(); } }
  else if (kind === 'cloth') { g.fillStyle = rgb(240); g.fillRect(0, 0, N, N); g.globalAlpha = .1; for (let i = 0; i < N; i += 4) { g.fillStyle = rgb(150); g.fillRect(i, 0, 1, N); g.fillRect(0, i, N, 1); } g.globalAlpha = 1; blot(8, .25, 180, 255, 30, 80); }
  else if (kind === 'leaf') { g.fillStyle = rgb(230); g.fillRect(0, 0, N, N); for (let i = 0; i < 120; i++) { const x = r() * N, y = r() * N, s = 8 + r() * 14; g.fillStyle = r() > .5 ? rgb(255, .5) : rgb(175, .4); g.beginPath(); g.ellipse(x, y, s, s * .55, r() * 3, 0, 7); g.fill(); } }
  else { g.fillStyle = rgb(236); g.fillRect(0, 0, N, N); blot(30, .45, 165, 255, 30, 90); for (let i = 0; i < 70; i++) { const y = r() * N, x = r() * N; g.strokeStyle = rgb(170 + r() * 85, .4); g.lineWidth = 10 + r() * 14; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + r() * 40, y + (r() - .5) * 10); g.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return (texCache[kind] = t); }
const TEX_SCALE = { grass: .14, dirt: .18, brick: .3, cobble: .3, wood: .35, tile: .3, cloth: .7, leaf: .35, paint: .15 };
// world-space box mapping: top faces use `top`, sides use `side`; sides get a soft height gradient (baked AO) and painted edge bands.
export function painted(m, side, top = side, o = {}) { const ts = paintTex(top), ss = paintTex(side), sc = o.scale ?? TEX_SCALE[side] ?? .25, terrain = o.terrain ? 1 : 0;
  m.customProgramCacheKey = () => 'p2' + side + top + sc + terrain;
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, { pTop: { value: ts }, pSide: { value: ss }, pSc: { value: sc } });
    sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 pw = vec4(transformed, 1.0); vec3 pn = objectNormal;
      #ifdef USE_INSTANCING
        pw = instanceMatrix * pw; pn = mat3(instanceMatrix) * pn;
      #endif
      pw = modelMatrix * pw; vWP = pw.xyz; vWN = normalize(mat3(modelMatrix) * pn);`);
    sh.fragmentShader = 'uniform sampler2D pTop, pSide; uniform float pSc; varying vec3 vWP; varying vec3 vWN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 an = abs(vWN); bool isTop = vWN.y > .6; vec2 puv = an.y > .6 ? vWP.xz : (an.x > an.z ? vWP.zy : vWP.xy);
        vec3 tx = isTop ? texture2D(pTop, puv * pSc).rgb : texture2D(pSide, puv * pSc).rgb; diffuseColor.rgb *= tx;
        if (!isTop) diffuseColor.rgb *= mix(.8, 1.06, smoothstep(.5, 1., fract(vWP.y * ${terrain ? '1.0' : '0.5'}))) * ${terrain ? 'mix(.7, 1., smoothstep(-4., 7., vWP.y))' : '1.'};
        ${terrain ? 'if (isTop) { vec2 cc = abs(fract((vWP.xz + 1.) * .5) - .5) * 2.; float e = max(cc.x, cc.y); diffuseColor.rgb *= mix(1., 1.13, smoothstep(.8, .98, e)); }' : ''} }`);
  }; m.needsUpdate = true; return m; }
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
  const ig = new THREE.BoxGeometry(2, 1, 2); const im = new THREE.InstancedMesh(ig, (() => { const tm = new THREE.MeshStandardMaterial({ flatShading: true, roughness: .9 }); if (STYLE.v2) painted(tm, 'dirt', 'grass', { terrain: true }); return tm; })(), cells.length);
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
  const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), .75, .55, STYLE.v2 ? .88 : .82); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  if (STYLE.v2) composer.addPass(new ShaderPass(GRADE));

  return { renderer, scene, camera, composer, bloom, sky, skyU, sun, hemi, rim, water, height, flat: (x, z) => Math.max(height(x, z), 0) };
}

// ---------- the recipe: one shared grade after tone mapping (ACES, exposure 1.05) ----------
export const GRADE = { uniforms: { tDiffuse: { value: null } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
    c *= vec3(1.04, 1.0, 0.94);                                  // white balance: warm
    float l = dot(c, vec3(.2126, .7152, .0722));
    c += vec3(-.020, .035, .060) * (1. - l) * (1. - l);          // teal-leaning shadows
    c += vec3(.050, .022, -.030) * l * l;                        // honey-gold highlights
    c = mix(vec3(l), c, 1.12);                                   // saturation +12%
    c = clamp(c, 0., 1.); c = mix(c, c * c * (3. - 2. * c), .18); // soft S-curve
    vec2 d = (vUv - .5) * vec2(.5625, 1.) * 1.6; c *= 1. - .36 * smoothstep(.36, 1., length(d)); // vignette
    gl_FragColor = vec4(c, 1.); }` };

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
  const SAFE_Y = STYLE.v2 ? H * .618 : H * .66; if (STYLE.v2) ornaments(ctx, st);
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
// ---------- style v2: flat vector magic over the 3D (sparkles on phi points, rune ring, swoosh) ----------
const PHI = .618, IPHI = .382;
function star4(c, x, y, s, col, a) { c.save(); c.globalAlpha = a; c.translate(x, y); c.fillStyle = col; c.beginPath(); c.moveTo(0, -s); c.quadraticCurveTo(0, 0, s, 0); c.quadraticCurveTo(0, 0, 0, s); c.quadraticCurveTo(0, 0, -s, 0); c.quadraticCurveTo(0, 0, 0, -s); c.fill();
  c.globalAlpha = a * .35; c.beginPath(); c.arc(0, 0, s * .45, 0, 7); c.fill(); c.restore(); }
export function ornaments(ctx, st) { const t = st.t;
  [[W * IPHI, H * .236, 1], [W * PHI, H * .146, .62], [W * .854, H * IPHI, .62], [W * .146, H * .5, .38], [W * .764, H * .79, .38]].forEach(([x, y, s], i) => {
    const tw = .5 + .5 * Math.sin(t * 2.4 + i * 2.1); star4(ctx, x + Math.sin(t * .7 + i) * 6, y + Math.cos(t * .5 + i) * 6, (30 + 34 * tw) * s, i % 2 ? '#7ff5e0' : '#ffe08a', .35 + .55 * tw); });
  if (st.title && st.titleA > 0) { ctx.save(); ctx.globalAlpha = st.titleA; ctx.shadowColor = '#ffc23d'; ctx.shadowBlur = 18; ctx.translate(W / 2, 360); ctx.rotate(t * .3); ctx.strokeStyle = '#ffd88a'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, 300, 0, 7); ctx.stroke(); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 300 * PHI + 70, 0, 7); ctx.stroke();
    for (let i = 0; i < 13; i++) { ctx.save(); ctx.rotate(i / 13 * Math.PI * 2); ctx.translate(0, -255); ctx.lineWidth = 6; ctx.beginPath(); const k = i % 3;
      if (k === 0) { ctx.moveTo(-10, -12); ctx.lineTo(0, 12); ctx.lineTo(10, -12); } else if (k === 1) { ctx.moveTo(0, -14); ctx.lineTo(0, 14); ctx.moveTo(-9, -4); ctx.lineTo(9, 4); } else { ctx.arc(0, 0, 9, 0, 5); ctx.moveTo(0, -14); ctx.lineTo(0, 14); }
      ctx.stroke(); ctx.restore(); } ctx.restore(); }
  // swoosh under the caption, honey -> mint, flat shaded
  const y = H * PHI + 92; ctx.save(); const gr = ctx.createLinearGradient(W * .2, 0, W * .8, 0); gr.addColorStop(0, 'rgba(255,194,61,0)'); gr.addColorStop(IPHI, 'rgba(255,194,61,.85)'); gr.addColorStop(1, 'rgba(70,240,210,0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(W * .2, y); ctx.quadraticCurveTo(W / 2, y + 26, W * .8, y - 6); ctx.quadraticCurveTo(W / 2, y + 12, W * .2, y); ctx.fill(); ctx.restore(); }
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
let _chunks, _src;
function chunks(words) { if (_src === words) return _chunks; _src = words; _chunks = []; let cur = [];
  const flush = () => { if (cur.length) _chunks.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = []; };
  words.forEach((w, i) => { if (cur.length && (cur[0].line !== w.line)) flush(); cur.push(w); const punct = /[.,?!]$/.test(w.w); if (cur.length >= 3 || punct || (cur.length === 2 && w.w.length > 7)) flush(); }); flush();
  for (let i = 0; i < _chunks.length - 1; i++) _chunks[i].end = Math.min(_chunks[i].end + .25, _chunks[i + 1].start - .02); return _chunks; }
