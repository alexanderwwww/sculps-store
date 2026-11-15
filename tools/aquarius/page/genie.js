// Aquarius — the genie on Alex's screen. PS1 low-poly (lowpolyMagic): a 130x160 render upscaled
// nearest-neighbour to 260x320, vertex snap, 4x4 Bayer dither, 24 levels; crisp sparkles and glow on top.
// Original design: classic folklore genie (blue, muscular, smoke tail, black topknot, gold cuffs, goatee, big grin).
import * as THREE from "three";
import { parseWake } from "./wake.js";

import { CSS, HTML } from "./markup.js";
export function mountGenie(root, cfg = {}, hooks = {}) {
const CFG = Object.assign({ build: "dev", suit: false, listen: true, typeMs: 32 }, cfg);
root.innerHTML = `<style>${CSS}</style>${HTML}`;
const $ = (id) => root.querySelector("#" + id);
const W = 260, H = 320, LW = 130, LH = 160;
const FACES = ["happy", "focused", "smug", "worried", "talking"];
const post = (m) => { try { hooks.post?.(m); } catch {} };

// ---------------- renderer ----------------
const canvas = $("gl");
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(LW, LH, false);
renderer.setClearColor(0x000000, 0);
const rt = new THREE.WebGLRenderTarget(LW, LH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, LW / LH, 0.1, 50);
camera.position.set(0, 0.95, 9.2);
camera.lookAt(0, 0.95, 0);

scene.add(new THREE.HemisphereLight(0xd8fbff, 0x4a3a86, 1.9));
const key = new THREE.DirectionalLight(0xfff1d6, 2.2); key.position.set(-3, 4, 6); scene.add(key);
const rim = new THREE.DirectionalLight(0x7ff5e0, 1.6); rim.position.set(4, 2, -5); scene.add(rim);

// PS1 vertex snap (same idea as whatif's ps1(): clip-space snapped to a coarse grid).
function ps1(m) {
  const gx = (LW / 2).toFixed(1), gy = (LH / 2).toFixed(1);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <fog_vertex>", `#include <fog_vertex>
      { vec2 sg = vec2(${gx}, ${gy}); gl_Position.xy = floor(gl_Position.xy / gl_Position.w * sg + .5) / sg * gl_Position.w; }`);
  };
  m.customProgramCacheKey = () => "ps1";
  return m;
}
const mat = (color, o = {}) => ps1(new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: o.shine ?? 12, specular: o.spec ?? 0x222222, emissive: o.em ?? 0x000000, transparent: !!o.t, opacity: o.op ?? 1, side: o.side ?? THREE.FrontSide }));
const SKIN = 0x56b8ff, SKIN_D = 0x2f7fd6, GOLD = 0xf2c14e, HAIR = 0x14121c;
const M = {
  skin: mat(SKIN, { shine: 20, spec: 0x335577 }), skinD: mat(SKIN_D), gold: mat(GOLD, { shine: 80, spec: 0xffffff, em: 0x3a2600 }),
  hair: mat(HAIR, { shine: 30, spec: 0x444466 }), suit: mat(0x101018, { shine: 30, spec: 0x333344 }), shirt: mat(0xf4f1ea),
  gem: mat(0x9ff8ff, { shine: 100, spec: 0xffffff, em: 0x1a6f7a }),
};
const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };

// ---------------- the genie ----------------
const genie = new THREE.Group(); scene.add(genie);
const body = new THREE.Group(); genie.add(body);

// chest: big, V-shaped, muscular
const chest = mesh(new THREE.CylinderGeometry(0.78, 0.42, 1.0, 7), M.skin, 0, 0.62, 0); chest.scale.set(1.15, 1, 0.75); body.add(chest);
const pecL = mesh(new THREE.IcosahedronGeometry(0.34, 0), M.skin, -0.3, 0.86, 0.3); pecL.scale.set(1.1, 0.75, 0.6); body.add(pecL);
const pecR = pecL.clone(); pecR.position.x = 0.3; body.add(pecR);
const abs = mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.35, 7), M.skin, 0, 0.0, 0); abs.scale.set(1.1, 1, 0.8); body.add(abs);
// gold accent: a medallion on a chain (not a sash)
const chain = mesh(new THREE.TorusGeometry(0.36, 0.035, 3, 10), M.gold, 0, 1.08, 0.08); chain.rotation.x = 1.25; body.add(chain);
const medal = mesh(new THREE.OctahedronGeometry(0.1, 0), M.gem, 0, 0.82, 0.52); body.add(medal);

// shoulders + arms (pivot groups so he can gesture)
function arm(side) {
  const g = new THREE.Group(); g.position.set(side * 0.86, 0.98, 0); body.add(g);
  const sh = mesh(new THREE.IcosahedronGeometry(0.34, 0), M.skin); sh.scale.set(1.05, 0.95, 0.9); g.add(sh);
  const up = mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.62, 6), M.skin, 0, -0.38, 0); g.add(up);
  const bicep = mesh(new THREE.IcosahedronGeometry(0.2, 0), M.skin, side * -0.02, -0.3, 0.08); bicep.scale.set(1, 1.3, 1); g.add(bicep);
  const el = new THREE.Group(); el.position.set(0, -0.68, 0); g.add(el);
  const fore = mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.56, 6), M.skin, 0, -0.28, 0); el.add(fore);
  const cuff = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 7), M.gold, 0, -0.5, 0); el.add(cuff);
  const hand = mesh(new THREE.IcosahedronGeometry(0.16, 0), M.skin, 0, -0.66, 0.02); el.add(hand);
  // suit sleeves (shown in business mode)
  const sl1 = mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.66, 6), M.suit, 0, -0.38, 0); g.add(sl1);
  const sl2 = mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.46, 6), M.suit, 0, -0.22, 0); el.add(sl2);
  const ssh = mesh(new THREE.IcosahedronGeometry(0.37, 0), M.suit); ssh.scale.set(1.05, 0.95, 0.9); g.add(ssh);
  return { g, el, hand, suitParts: [sl1, sl2, ssh], skinParts: [sh, up, bicep, fore] };
}
const armL = arm(-1), armR = arm(1);

// head
const head = new THREE.Group(); head.position.set(0, 1.62, 0.05); body.add(head);
const skull = mesh(new THREE.IcosahedronGeometry(0.62, 1), M.skin); skull.scale.set(1, 1.02, 0.95); head.add(skull);
const jaw = mesh(new THREE.CylinderGeometry(0.5, 0.36, 0.4, 7), M.skin, 0, -0.38, 0.04); head.add(jaw);
for (const s of [-1, 1]) { // pointed ears + gold earrings
  const ear = mesh(new THREE.ConeGeometry(0.11, 0.34, 4), M.skin, s * 0.62, 0.04, -0.02); ear.rotation.z = s * -1.25; head.add(ear);
  const ring = mesh(new THREE.TorusGeometry(0.07, 0.022, 3, 8), M.gold, s * 0.66, -0.12, 0); ring.rotation.y = 1.57; head.add(ring);
}
// black topknot ponytail: a knot on the crown and a tail that sways
const knot = mesh(new THREE.IcosahedronGeometry(0.17, 0), M.hair, 0, 0.66, -0.05); head.add(knot);
const knotBand = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 6), M.gold, 0, 0.8, -0.06); head.add(knotBand);
const pony = new THREE.Group(); pony.position.set(0, 0.84, -0.06); head.add(pony);
const ponySegs = [];
for (let i = 0; i < 5; i++) {
  const s = mesh(new THREE.IcosahedronGeometry(0.15 - i * 0.022, 0), M.hair, 0, 0, 0); s.scale.set(1, 1.35, 1);
  ponySegs.push(s); pony.add(s);
}
// goatee + brows live on the face texture; the goatee also gets a little 3D point
const goatee = mesh(new THREE.ConeGeometry(0.13, 0.36, 4), M.hair, 0, -0.66, 0.4); goatee.rotation.x = Math.PI - 0.5; head.add(goatee);

// face: a 32px canvas on a plane, nearest-filtered
const fc = document.createElement("canvas"); fc.width = fc.height = 48;
const fx = fc.getContext("2d");
const faceTex = new THREE.CanvasTexture(fc); faceTex.magFilter = faceTex.minFilter = THREE.NearestFilter; faceTex.generateMipmaps = false;
faceTex.colorSpace = THREE.SRGBColorSpace;
const facePlane = mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, alphaTest: 0.5 }), 0, -0.04, 0.6);
head.add(facePlane);

// smoke tail
const tail = new THREE.Group(); genie.add(tail);
const tailMats = [], tailSegs = [];
for (let i = 0; i < 9; i++) {
  const k = i / 8;
  const m = mat(new THREE.Color().lerpColors(new THREE.Color(SKIN), new THREE.Color(0xc9f4ff), k).getHex(), { t: true, op: 1 - k * 0.55, em: 0x0a2a44 });
  tailMats.push(m);
  const s = mesh(new THREE.IcosahedronGeometry(0.46 * (1 - k * 0.82), 0), m); tailSegs.push(s); tail.add(s);
}

// suit body
const suitBody = new THREE.Group(); body.add(suitBody);
const jacket = mesh(new THREE.CylinderGeometry(0.84, 0.46, 1.06, 7), M.suit, 0, 0.6, 0); jacket.scale.set(1.15, 1, 0.8); suitBody.add(jacket);
const jacketLow = mesh(new THREE.CylinderGeometry(0.47, 0.4, 0.42, 7), M.suit, 0, -0.02, 0); jacketLow.scale.set(1.1, 1, 0.85); suitBody.add(jacketLow);
const shirt = mesh(new THREE.ConeGeometry(0.3, 0.62, 3), M.shirt, 0, 0.86, 0.58); shirt.rotation.x = Math.PI; shirt.scale.z = 0.25; suitBody.add(shirt);
const tie = mesh(new THREE.ConeGeometry(0.09, 0.5, 4), M.gold, 0, 0.74, 0.66); tie.rotation.x = Math.PI; tie.scale.z = 0.4; suitBody.add(tie);
const tieKnot = mesh(new THREE.OctahedronGeometry(0.07, 0), M.gold, 0, 1.02, 0.64); suitBody.add(tieKnot);
for (const s of [-1, 1]) { const lapel = mesh(new THREE.BoxGeometry(0.1, 0.55, 0.04), M.suit, s * 0.22, 0.84, 0.64); lapel.rotation.z = s * 0.45; suitBody.add(lapel); }

// ---------------- post: dither + quantize, alpha dithered too ----------------
const postMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: rt.texture }, uRes: { value: new THREE.Vector2(LW, LH) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes; varying vec2 vUv;
    float bay4(vec2 p){ int x = int(mod(p.x,4.)), y = int(mod(p.y,4.)); int i = x + y*4;
      float m[16]; m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
      for(int k=0;k<16;k++){ if(k==i) return m[k]/16.; } return 0.; }
    void main(){ vec4 s = texture2D(tDiffuse, vUv); float b = bay4(floor(vUv*uRes));
      float a = s.a > b * .98 + .01 ? 1. : 0.;
      vec3 c = s.a > 0. ? s.rgb / max(s.a, .001) : vec3(0.);
      c = floor(c * 24. + b) / 24.;
      gl_FragColor = vec4(c * a, a); }`,
  transparent: true, depthTest: false, depthWrite: false,
});
postMat.blending = THREE.NoBlending;
const postScene = new THREE.Scene(); const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

// ---------------- faces ----------------
const state = { face: "happy", baseFace: "happy", talking: false, suit: !!CFG.suit, workSuitUntil: 0, listen: !!CFG.listen, working: false,
  menuOpen: false, typed: [], listening: false, yaw: 0, blinkAt: 2, blink: 0, mouth: 0 };
function drawFace(face, mouthOpen, blink) {
  const g = fx; g.clearRect(0, 0, 48, 48);
  const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const INK = "#0b0f2a", WHITE = "#f7fbff", BROW = "#0b0b14", MOUTH = "#3a0b2a", TEETH = "#ffffff", TONGUE = "#ff6f91";
  const eye = (cx, lid, look = 0) => { // cx: centre x, lid 0 open .. 1 shut
    if (blink || lid >= 1) { px(cx - 4, 19, 8, 2, INK); return; }
    const top = 15 + Math.round(lid * 5);
    px(cx - 4, top, 8, 23 - top, WHITE); px(cx - 3, top - 1, 6, 1, WHITE);
    px(cx - 2 + look, Math.max(top, 17), 3, 4, INK); px(cx - 1 + look, Math.max(top, 17), 1, 1, WHITE);
    if (lid > 0) px(cx - 4, top - 1, 8, 2, "#1f63b8");
  };
  const brow = (x0, y0, x1, y1) => { g.strokeStyle = BROW; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  const grin = (w, h, y = 29) => { // big expressive grin
    g.fillStyle = MOUTH; g.beginPath(); g.moveTo(24 - w, y); g.quadraticCurveTo(24, y + h * 2, 24 + w, y); g.closePath(); g.fill();
    px(24 - w + 2, y, w * 2 - 4, 2, TEETH);
    if (h > 4) { g.fillStyle = TONGUE; g.beginPath(); g.ellipse(24, y + h - 0.5, w * 0.45, 2, 0, 0, 7); g.fill(); }
  };
  if (face === "happy") { eye(16, 0); eye(32, 0); brow(12, 11, 20, 10); brow(28, 10, 36, 11); if (!mouthOpen) grin(11, 6); }
  if (face === "focused") { eye(16, 0.45, 0); eye(32, 0.45, 0); brow(11, 11, 20, 14); brow(28, 14, 37, 11); if (!mouthOpen) { px(18, 31, 12, 2, MOUTH); } }
  if (face === "smug") { eye(16, 0.55, 1); eye(32, 0.55, 1); brow(12, 12, 20, 12); brow(28, 9, 36, 7);
    if (!mouthOpen) { g.fillStyle = MOUTH; g.beginPath(); g.moveTo(17, 31); g.quadraticCurveTo(27, 34, 33, 27); g.lineTo(32, 31); g.quadraticCurveTo(25, 36, 17, 31); g.fill(); px(25, 30, 6, 1, TEETH); } }
  if (face === "worried") { eye(16, 0, 0); eye(32, 0, 0); brow(12, 12, 20, 9); brow(28, 9, 36, 12);
    if (!mouthOpen) { g.strokeStyle = MOUTH; g.lineWidth = 2; g.beginPath(); g.moveTo(17, 33); for (let i = 0; i <= 14; i += 2) g.lineTo(17 + i, 31 + (i % 4 ? 2 : 0)); g.stroke(); }
    g.fillStyle = "#bfefff"; g.beginPath(); g.moveTo(39, 7); g.quadraticCurveTo(43, 13, 39, 14); g.quadraticCurveTo(35, 13, 39, 7); g.fill(); }
  if (mouthOpen) { // talking: eyes of the base face, mouth cycles open/closed
    const h = [2, 6, 9, 5][mouthOpen % 4];
    if (h <= 2) px(17, 30, 14, 3, MOUTH); else grin(8 + (h > 6 ? 2 : 0), h, 28);
  }
  // goatee + cheek lines
  g.fillStyle = BROW; g.beginPath(); g.moveTo(20, 42); g.lineTo(28, 42); g.lineTo(24, 48); g.fill();
  faceTex.needsUpdate = true;
}

// ---------------- bubble + menu ----------------
const bubble = $("bubble"), btext = $("btext");
const menu = $("menu");
$("mbuild").textContent = `CEO · build ${CFG.build}`;
const queue = []; let typing = null;
function say(text, face, suit) {
  queue.push({ text: String(text), face: FACES.includes(face) ? face : null, suit });
  if (!typing) next();
}
function next() {
  const m = queue.shift(); if (!m) { typing = null; return; }
  if (typeof m.suit === "boolean") setSuit(m.suit, true);
  const chars = Array.from(m.text); let i = 0;
  state.baseFace = m.face && m.face !== "talking" ? m.face : "happy";
  state.talking = true; bubble.classList.add("show"); btext.textContent = "";
  bubble.dataset.state = "typing";
  typing = { m, timer: setInterval(() => {
    btext.textContent = chars.slice(0, ++i).join("");
    if (i >= chars.length) {
      clearInterval(typing.timer); state.talking = false; bubble.dataset.state = "done";
      const hold = Math.min(15000, 3500 + chars.length * 55);
      typing.timer = setTimeout(() => { bubble.classList.remove("show"); bubble.dataset.state = "idle"; state.baseFace = "happy"; setTimeout(next, 350); }, CFG.holdMs ?? hold);
    }
  }, CFG.typeMs) };
}
function setSuit(on, persist) { state.suit = !!on; if (persist) post({ type: "state", suit: state.suit }); renderMenu(); }
function wearingSuit() { return state.suit || state.listening || Date.now() < state.workSuitUntil; }
function renderMenu() {
  $("msuit").textContent = state.suit ? "Suit off" : "Suit on";
  $("mlisten").textContent = state.listen ? "Listening: on" : "Listening: off";
}
let menuTimer = 0;
function openMenu(open) {
  state.menuOpen = open; menu.classList.toggle("show", open); post({ type: "menu", open }); pushHits(true);
  clearTimeout(menuTimer); if (open) menuTimer = setTimeout(() => openMenu(false), 12000);
}
menu.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act;
  if (act === "suit") setSuit(!state.suit, true);
  if (act === "listen") { state.listen = !state.listen; renderMenu(); }
  post({ type: "action", name: act, suit: state.suit, listen: state.listen });
  if (act !== "listen" && act !== "suit") openMenu(false);
});

// ---------------- hit areas (Swift lets clicks through everywhere else) ----------------
let bodyRect = { x: 70, y: 120, w: 120, h: 190 }, lastHits = "";
const v3 = new THREE.Vector3(), box = new THREE.Box3();
function measure() {
  box.makeEmpty(); body.updateWorldMatrix(true, true);
  box.expandByObject(chest); box.expandByObject(head); box.expandByObject(armL.g); box.expandByObject(armR.g); box.expandByObject(tailSegs[3]);
  const pts = []; for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) { v3.set(x, y, z).project(camera); pts.push(v3.clone()); }
  const xs = pts.map((p) => (p.x + 1) / 2 * W), ys = pts.map((p) => (1 - p.y) / 2 * H);
  const x0 = Math.max(0, Math.min(...xs)), y0 = Math.max(0, Math.min(...ys)), x1 = Math.min(W, Math.max(...xs)), y1 = Math.min(H, Math.max(...ys));
  bodyRect = { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}
function pushHits(force) {
  const rects = [bodyRect];
  if (state.menuOpen) { const r = menu.getBoundingClientRect(); rects.push({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }); }
  const s = JSON.stringify(rects); if (!force && s === lastHits) return; lastHits = s;
  const h = $("hit"); h.style.left = bodyRect.x + "px"; h.style.top = bodyRect.y + "px"; h.style.width = bodyRect.w + "px"; h.style.height = bodyRect.h + "px";
  post({ type: "hit", rects });
}
const inside = (r, x, y) => x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
$("hit").addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); openMenu(!state.menuOpen); });

// ---------------- sparkles + glow (crisp, full resolution) ----------------
const fxc = $("fx"), fg = fxc.getContext("2d");
const dpr = Math.min(2, window.devicePixelRatio || 1); fxc.width = W * dpr; fxc.height = H * dpr; fg.scale(dpr, dpr);
const sparks = Array.from({ length: 14 }, (_, i) => ({ seed: i * 7.31, life: (i / 14) }));
function toScreen(obj, out = {}) { obj.getWorldPosition(v3); v3.project(camera); out.x = (v3.x + 1) / 2 * W; out.y = (1 - v3.y) / 2 * H; return out; }
function star(x, y, r, a, col) {
  fg.globalAlpha = a; fg.fillStyle = col;
  fg.beginPath(); fg.moveTo(x, y - r); fg.lineTo(x + r * 0.22, y - r * 0.22); fg.lineTo(x + r, y); fg.lineTo(x + r * 0.22, y + r * 0.22);
  fg.lineTo(x, y + r); fg.lineTo(x - r * 0.22, y + r * 0.22); fg.lineTo(x - r, y); fg.lineTo(x - r * 0.22, y - r * 0.22); fg.closePath(); fg.fill();
  fg.fillStyle = "#fff"; fg.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
}
const hp = {}, tp = {}, cp = {};
function drawFx(t) {
  fg.clearRect(0, 0, W, H); fg.globalCompositeOperation = "lighter";
  toScreen(armR.hand, hp); toScreen(tailSegs[6], tp); toScreen(chest, cp);
  const gl = fg.createRadialGradient(cp.x, cp.y, 4, cp.x, cp.y, 95); gl.addColorStop(0, "rgba(90,200,255,.16)"); gl.addColorStop(1, "rgba(90,200,255,0)");
  fg.globalAlpha = 1; fg.fillStyle = gl; fg.fillRect(0, 0, W, H);
  const hg = fg.createRadialGradient(hp.x, hp.y, 1, hp.x, hp.y, 22); hg.addColorStop(0, "rgba(255,230,150,.55)"); hg.addColorStop(1, "rgba(255,230,150,0)");
  fg.fillStyle = hg; fg.fillRect(hp.x - 24, hp.y - 24, 48, 48);
  for (const s of (state.working ? sparks.concat(sparks) : sparks)) {
    const life = (s.life + t * 0.18) % 1, sx = Math.sin(s.seed * 3.1) * 38, ox = s.seed % 2 > 1 ? hp : tp;
    const x = ox.x + sx * (0.4 + life) + Math.sin(t * 2 + s.seed) * 4, y = ox.y - life * 70;
    const a = Math.sin(life * Math.PI) * (0.55 + 0.45 * Math.sin(t * 9 + s.seed));
    if (a > 0.05) star(x, y, 2.5 + 3.5 * Math.sin(life * Math.PI), a, s.seed % 3 > 1.5 ? "#ffe08a" : "#9ff8ff");
  }
  fg.globalAlpha = 1; fg.globalCompositeOperation = "source-over";
}

// ---------------- animation ----------------
let lastFaceKey = "", t0 = performance.now(), lastFrame = 0, frozen = null;
function frame(now) {
  if (dead) return; requestAnimationFrame(frame);
  if (now - lastFrame < 33) return; lastFrame = now;
  const t = frozen ?? (now - t0) / 1000;
  // bob + sway
  genie.position.y = Math.sin(t * 1.6) * 0.09;
  const targetYaw = state.listening ? 0 : Math.sin(t * 0.35) * 0.32;
  state.yaw += (targetYaw - state.yaw) * 0.12; body.rotation.y = state.yaw;
  body.rotation.z = Math.sin(t * 0.9) * 0.03;
  head.rotation.x = state.listening ? 0.08 : Math.sin(t * 0.7) * 0.05;
  armL.g.rotation.z = -0.55 + Math.sin(t * 1.3) * 0.04; armL.el.rotation.z = -1.25; armL.g.rotation.x = -0.25; armL.el.rotation.x = -0.6;
  const gest = state.talking ? Math.sin(t * 7) * 0.18 : 0;
  armR.g.rotation.z = 0.45 + gest * 0.5; armR.g.rotation.x = -0.6 + gest; armR.el.rotation.z = 1.05; armR.el.rotation.x = -1.0 - gest;
  // the topknot ponytail: up out of the knot, then over and down to his left, swaying
  for (let i = 0; i < ponySegs.length; i++) { const s = ponySegs[i], k = i / (ponySegs.length - 1), sw = Math.sin(t * 1.4 - i * 0.6) * 0.05 * i;
    s.position.set(-0.32 * k * k - 0.08 * k + sw, 0.18 + Math.sin(k * 2.6) * 0.32 - k * 0.55, -0.05 - k * 0.1); s.rotation.set(0, 0, 0.9 + k * 1.2); }
  pony.rotation.x = 0;
  for (let i = 0; i < tailSegs.length; i++) {
    const k = i / (tailSegs.length - 1), s = tailSegs[i];
    s.position.set(Math.sin(t * 1.2 - i * 0.6) * 0.12 * (1 + i * 0.35) + k * k * 0.55, -0.2 - i * 0.2, -0.1 + Math.cos(t - i) * 0.05);
    s.rotation.set(t * 0.3 + i, t * 0.2 + i * 2, 0);
  }
  // suit
  const suit = wearingSuit(); suitBody.visible = suit; chain.visible = medal.visible = !suit;
  for (const a of [armL, armR]) { for (const p of a.suitParts) p.visible = suit; a.skinParts[0].visible = !suit; }
  // face
  if (!state.talking && t > state.blinkAt) { state.blink = 1; if (t > state.blinkAt + 0.12) { state.blink = 0; state.blinkAt = t + 2.5 + Math.random() * 3; } }
  const mouth = state.talking ? 1 + Math.floor(t * 9) % 4 : 0;
  if (state.working && !state.talking && !state.listening) state.baseFace = "focused";
  state.face = state.talking ? "talking" : state.baseFace;
  const fk = `${state.baseFace}|${mouth}|${state.blink}`;
  if (fk !== lastFaceKey) { lastFaceKey = fk; drawFace(state.baseFace, mouth, state.blink); }
  // render low-res + post
  renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.clear(); renderer.render(postScene, postCam);
  drawFx(t);
  if (Math.floor(t * 4) !== Math.floor((t - 0.034) * 4)) { measure(); pushHits(false); }
}

// ---------------- the API (content script) ----------------
let dead = false;
const api = {
  receive(m) {
    if (m.type === "listening") { state.listening = true; state.baseFace = "focused"; showStatus("Listening…"); }
    if (m.type === "sent") { state.listening = false; state.workSuitUntil = Date.now() + 10 * 60000; state.baseFace = "happy"; showStatus("On it."); }
    if (m.type === "cancel") { state.listening = false; state.baseFace = "happy"; hideStatus(); }
    if (m.type === "state") { if ("suit" in m) state.suit = !!m.suit; if ("listen" in m) state.listen = !!m.listen; renderMenu(); }
    if (m.type === "working") { state.working = !!m.on; if (!m.on && state.baseFace === "focused" && !state.listening) state.baseFace = "happy"; }
    if (m.type === "say") say(m.text, m.face, m.suit);
  },
  state: () => ({ face: state.face, baseFace: state.baseFace, talking: state.talking, suit: wearingSuit(), menuOpen: state.menuOpen, text: btext.textContent, bubble: bubble.dataset.state, body: bodyRect, listening: state.listening, working: state.working, listen: state.listen }),
  destroy() { dead = true; renderer.dispose(); root.innerHTML = ""; },
  setFace(f) { state.baseFace = f === "talking" ? "happy" : f; state.talking = f === "talking"; },
  setSuit(on) { state.suit = !!on; },
  freeze(t) { frozen = t; },
  parseWake,
};
let statusTimer = 0;
function showStatus(text) { // not queued: it is his answer to Alex, right now
  if (typing) { clearInterval(typing.timer); clearTimeout(typing.timer); if (typing.m) queue.unshift(typing.m); typing = null; }
  state.talking = false; clearTimeout(statusTimer);
  btext.textContent = text; bubble.classList.add("show"); bubble.dataset.state = "status";
  if (text !== "Listening…") statusTimer = setTimeout(() => { hideStatus(); next(); }, 2600);
}
function hideStatus() { if (bubble.dataset.state === "status") { bubble.classList.remove("show"); bubble.dataset.state = "idle"; } }

renderMenu();
drawFace("happy", 0, 0);
requestAnimationFrame(frame);
post({ type: "ready", build: CFG.build });
return api;
}
