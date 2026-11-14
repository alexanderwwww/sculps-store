// whatif-003 — "What if someone drained all the oceans?" Style: lowpolyMagic (PS1 low-poly + our magic).
// An ORIGINAL cosmic cow god (galaxy hide, gold halo, gold horns, a striped straw) drinks the oceans; every
// consequence after that is real, sourced science (script.json facts). Pure function of t, one case per shot.
import { THREE, P, rng, mat, glowMat, box, halo, tree, person, sparkles, painted, PAL, clamp, lerp, ease, easeOut } from '../world.js';

export function build(world, { script, timing }) {
  const { scene, camera, skyU, sun, hemi, water } = world;
  world.island.visible = false;
  const look = new THREE.Vector3(), V = (x, y, z) => new THREE.Vector3(x, y, z);
  const cam = (p, l, fov = 55) => { camera.position.copy(p); look.copy(l); camera.lookAt(look); if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); } };
  const LP = world.lowpoly, TN = LP ? 64 : 256;
  const canvasTex = (draw, n = TN) => { const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), n); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    if (LP) { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; } return t; };

  // ================= the sea floor (surface stage, around the origin) =================
  const sn = (x, z) => Math.sin(x * .09 + 1.3) * Math.sin(z * .11 + .4) + Math.sin((x + z) * .05) * .6;
  const RIDGE = 14, TRZ = -100, LAKE = [-116, 18];
  const ground = (x, z) => { const n = sn(x, z); let h;
    if (x < -84) h = 5 + n * 1.5; else if (x < -62) h = lerp(5, -14, (x + 84) / 22); else if (x < -50) h = lerp(-14, -40, (x + 62) / 12); else if (x > 104) h = 5 + n * 1.5; else if (x > 84) h = lerp(-30, 5, (x - 84) / 20); else h = -40 + n * 3;
    const r = Math.abs(x - RIDGE); if (x > -50 && x < 84) { let rh = -40 + 27 * Math.exp(-((r / 16) ** 2)) + Math.sin(z * .21) * 3 * Math.exp(-((r / 12) ** 2)); if (r < 3) rh -= 7; h = Math.max(h, rh); }
    if (Math.abs(z - TRZ) < 11 && x > -56 && x < 90) h = Math.abs(z - TRZ) < 7 ? -170 : -95;
    if (Math.hypot(x - LAKE[0], z - LAKE[1]) < 14) h = Math.min(h, -1);
    return Math.round(h / 2) * 2; };
  const G = 4, cells = []; for (let x = -144; x <= 144; x += G) for (let z = -136; z <= 136; z += G) cells.push([x, z, ground(x, z)]);
  const gh = (x, z) => ground(Math.round(x / G) * G, Math.round(z / G) * G); // the height of the cell under (x, z)
  { const tm = new THREE.MeshStandardMaterial({ flatShading: true, roughness: .9 }); painted(tm, 'dirt', 'grass', { terrain: true }); const im = new THREE.InstancedMesh(new THREE.BoxGeometry(G, 1, G), tm, cells.length); const m4 = new THREE.Matrix4(), col = new THREE.Color(), base = -190;
    cells.forEach(([x, z, h], i) => { const hh = h - base; m4.makeScale(1, hh, 1); m4.setPosition(x, base + hh / 2, z); im.setMatrixAt(i, m4); const v = (Math.sin(x * 12.9 + z * 78.2) * 43758.5) % 1;
      col.set(h > 2 ? PAL.grass[Math.floor(Math.abs(v) * 3)] : h >= -2 ? PAL.sand : h > -20 ? 0xe2c48c : h < -100 ? 0x3e3560 : h > -30 && Math.abs(x - RIDGE) < 30 ? 0x6a5f80 : (Math.abs(v) > .5 ? 0xb08a5a : 0x9f7d5c)); im.setColorAt(i, col); });
    im.castShadow = im.receiveShadow = true; scene.add(im); }
  water.material.opacity = .82;
  // magic on the floor: glowing vents in the ridge rift, mint crystals down the trench walls, coral
  const r = rng(303);
  for (let z = -130; z < 130; z += 10) { if (Math.abs(z - TRZ) < 12) continue; const g = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 2), glowMat(0xff7a3d, 1.6)); g.position.set(RIDGE, gh(RIDGE, z) + .8, z); scene.add(g); }
  for (let i = 0; i < 60; i++) { const x = -50 + r() * 136, side = r() > .5 ? 1 : -1, y = -100 - r() * 66; const c = new THREE.Mesh(new THREE.OctahedronGeometry(.9 + r() * 1.3, 0), glowMat(i % 3 ? PAL.magic : PAL.gold, 1.5)); c.position.set(x, y, TRZ + side * 6.8); scene.add(c); }
  for (let i = 0; i < 70; i++) { const x = -48 + r() * 128, z = -130 + r() * 260; if (Math.abs(z - TRZ) < 14 || Math.abs(x - RIDGE) < 8) continue; const c = box(1.4, 2 + r() * 4, 1.4, [PAL.rose, 0xff9a5a, 0xc46cff][i % 3]); c.position.set(x, gh(x, z) + 1.5, z); scene.add(c); }
  for (let i = 0; i < 26; i++) { const x = -140 + r() * 52, z = -130 + r() * 260; if (gh(x, z) < 3) continue; const tr = tree(r); tr.position.set(x, gh(x, z) + .5, z); scene.add(tr); }
  const lake = new THREE.Mesh(new THREE.CircleGeometry(13.5, 10), new THREE.MeshStandardMaterial({ color: PAL.water, roughness: .3, emissive: 0x0b4a7a, emissiveIntensity: .35, flatShading: true }));
  lake.rotation.x = -Math.PI / 2; lake.position.set(LAKE[0], 3, LAKE[1]); scene.add(lake);
  const clouds = new THREE.Group(); for (let i = 0; i < 12; i++) { const c = box(10 + r() * 10, 4 + r() * 3, 8 + r() * 8, mat(0xe8e2f5, { tex: 'none', transparent: true, opacity: .95 })); c.castShadow = false; c.position.set(-150 + r() * 70, 42 + r() * 10, -40 + r() * 90); clouds.add(c); } scene.add(clouds);
  const snow = sparkles(400, 31, 0xcfe8ff, .6, [90, 40, 90]); snow.position.set(-110, 0, 10); scene.add(snow);

  const trL = new THREE.PointLight(0x7ff5e0, 900, 200, 1.6); trL.position.set(20, -140, TRZ); scene.add(trL);
  // ships, a whale, a walker, a sign
  const ship = () => { const g = new THREE.Group(); g.add(P(box(8, 4, 26, 0xc8243a), 0, 0, 0), P(box(8.4, 1, 26.4, 0x34386b), 0, 2.4, 0), P(box(6, 5, 5, PAL.wall[0]), 0, 5.2, -9), P(box(1.6, 3, 1.6, 0xffc23d), 0, 9, -9));
    for (let k = 0; k < 6; k++) g.add(P(box(3, 2.4, 4, PAL.roof[k % 4]), k % 2 ? 1.6 : -1.6, 4.1, -2 + Math.floor(k / 2) * 4.4)); return g; };
  const ships = [[-66, 20, .3], [-30, -30, -.5], [44, 46, 2.4]].map(([x, z, ry]) => { const s = ship(); s.rotation.y = ry; scene.add(s); return { s, x, z, g: gh(x, z) }; });
  const WX = -26, WZ = 46, WG = gh(WX, WZ); const whale = new THREE.Group(); const wbody = new THREE.Group(); whale.add(wbody); whale.position.set(WX, WG, WZ); whale.rotation.y = .6; scene.add(whale);
  wbody.add(P(box(8, 7, 20, 0x4f86f0), 0, 0, 0), P(box(7.4, 2, 18, 0xa9c8f5), 0, -3, .5), P(box(3, 2, 6, 0x4f86f0), 0, .5, -12), P(box(12, 1, 4, 0x4f86f0), 0, 1, -16), P(box(5, .8, 3, 0x4f86f0), 4.5, -2, 3), P(box(5, .8, 3, 0x4f86f0), -4.5, -2, 3));
  for (const sx of [-1, 1]) wbody.add(P(box(.3, 1.6, 1.6, 0xf5efe0), sx * 4.05, 1.2, 6.5), P(box(.35, .9, .9, 0x1a1020), sx * 4.1, 1.1, 6.8));
  const spout = sparkles(80, 41, 0x8fe3ff, .7, [3, 12, 3]); spout.position.set(0, 3.5, 4); wbody.add(spout);
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(12, 9), lake.material); puddle.rotation.x = -Math.PI / 2; puddle.position.set(WX, WG + 1.05, WZ); scene.add(puddle);
  const walker = person(rng(12), { noPhone: true, shirt: 0xff7a3d }); walker.scale.setScalar(2.2); scene.add(walker); const pack = box(1.1, 1.3, .6, 0xffc43d); pack.position.set(0, 1.8, -.6); walker.add(pack);
  const signTex = canvasTex((g, n) => { g.fillStyle = '#7a4a2a'; g.fillRect(0, 0, n, n); g.fillStyle = '#ffe7b0'; g.font = `900 ${n * .26}px Inter`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('AMERICA', n / 2, n * .36); g.fillText('→', n / 2, n * .7); }, LP ? 128 : 256);
  const sign = new THREE.Group(); sign.add(P(box(.8, 9, .8, PAL.trunk), 0, 4.5, 0)); const board = new THREE.Mesh(new THREE.BoxGeometry(7, 7, .5), new THREE.MeshStandardMaterial({ map: signTex, flatShading: true })); board.position.set(0, 8.5, .4); sign.add(board);
  const SZ = 30, SX = RIDGE + 9; sign.position.set(SX, gh(SX, SZ), SZ); sign.rotation.y = -.5; scene.add(sign);

  // ================= space stage: Earth + the cow god =================
  const S = V(0, 600, 0), ER = 30;
  const earth = new THREE.Group(); earth.position.copy(S); scene.add(earth);
  { const geo = new THREE.IcosahedronGeometry(ER, 4), pos = geo.attributes.position, v = new THREE.Vector3(); const n3 = p => Math.sin(p.x * .13 + 1.3) * Math.sin(p.y * .15 + .4) + Math.sin(p.z * .11 + 2.1) * .8 + Math.sin((p.x + p.z) * .23) * .35;
    const ns = []; for (let i = 0; i < pos.count; i++) ns.push(n3(v.fromBufferAttribute(pos, i))); const th = [...ns].sort((a, b) => a - b)[Math.floor(ns.length * .71)];
    const cols = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).setLength(ns[i] > th ? ER + 1.5 : ER - 2.5); pos.setXYZ(i, v.x, v.y, v.z); }
    for (let f = 0; f < pos.count; f += 3) { const land = (ns[f] > th) + (ns[f + 1] > th) + (ns[f + 2] > th); const pol = Math.abs(v.fromBufferAttribute(pos, f).y) > ER * .86;
      c.set(pol ? 0xe8eef8 : land >= 2 ? (f % 9 ? 0x5cc05a : 0xf2cf86) : land ? 0xc9a36b : (f % 7 ? 0x8a6f8f : 0x6a5f80)); for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (f + k) * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .9 })); earth.add(m); }
  const ocean = new THREE.Mesh(new THREE.IcosahedronGeometry(ER + .3, 3), new THREE.MeshStandardMaterial({ color: 0x2fa6e0, roughness: .25, flatShading: true, transparent: true, opacity: .9, emissive: 0x0b4a7a, emissiveIntensity: .45 })); earth.add(ocean);
  const eClouds = new THREE.Group(); { const cr = rng(5); for (let i = 0; i < 16; i++) { const d = new THREE.Vector3(cr() - .5, (cr() - .5) * 1.4, cr() - .5).normalize().multiplyScalar(ER + 4); const c = box(6 + cr() * 6, 1.6, 4 + cr() * 4, mat(0xe8e2f5, { tex: 'none', transparent: true, opacity: .9 })); c.position.copy(d); c.lookAt(0, 0, 0); eClouds.add(c); } } earth.add(eClouds);
  const atmo = halo(PAL.magic, ER * 2.9, .22); atmo.material.fog = false; earth.add(atmo);
  const nebula = [[-160, 120, -320, 0xc46cff, 260], [190, -60, -380, 0x46f0d2, 220], [40, 260, -420, 0xff6f91, 240]].map(([x, y, z, c, s]) => { const h = halo(c, s, .35); h.material.fog = false; h.position.set(S.x + x, S.y + y, S.z + z); scene.add(h); return h; });

  // the cow god — original: blocky cow, galaxy hide, gold halo + horns + hooves
  const hideTex = canvasTex((g, n) => { const hr = rng(88); g.fillStyle = '#2a1660'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 9; i++) { const x = hr() * n, y = hr() * n, rad = n * (.15 + hr() * .25); const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, ['rgba(196,108,255,.8)', 'rgba(70,240,210,.55)', 'rgba(255,111,145,.6)'][i % 3]); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); }
    g.fillStyle = 'rgba(232,220,255,.95)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(hr() * n, hr() * n, n * (.1 + hr() * .1), n * (.07 + hr() * .08), hr() * 3, 0, 7); g.fill(); }
    for (let i = 0; i < n * .8; i++) { g.fillStyle = hr() > .8 ? '#ffe08a' : '#fff4d6'; const s = hr() > .9 ? 2 : 1; g.fillRect(Math.floor(hr() * n), Math.floor(hr() * n), s, s); } });
  hideTex.wrapS = hideTex.wrapT = THREE.RepeatWrapping;
  const HIDE = new THREE.MeshStandardMaterial({ map: hideTex, emissive: 0xffffff, emissiveMap: hideTex, emissiveIntensity: .45, flatShading: true, roughness: .8 });
  const cbox = (w, h, d, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof m === 'number' ? mat(m, { tex: 'none' }) : m); return b; };
  const GOLDM = mat(0xf2b632, { metalness: .4, roughness: .35, tex: 'none' }), PINK = 0xffa3b5;
  const cow = new THREE.Group(); scene.add(cow); const head = new THREE.Group(); head.position.set(0, 3, 6); cow.add(head);
  cow.add(P(cbox(26, 18, 40, HIDE), 0, 0, -20));
  for (const [x, z] of [[-8, -6], [8, -6], [-8, -34], [8, -34]]) cow.add(P(cbox(6, 16, 6, HIDE), x, -16, z), P(cbox(6.6, 3, 6.6, GOLDM), x, -25, z));
  const tail = new THREE.Group(); tail.position.set(0, 6, -40); tail.add(P(cbox(1.6, 14, 1.6, HIDE), 0, -7, 0), P(cbox(3, 4, 3, 0xe8dcff), 0, -14, 0)); cow.add(tail);
  head.add(P(cbox(16, 15, 15, HIDE), 0, 0, 2), P(cbox(13, 7, 5, PINK), 0, -4.5, 11.5), P(cbox(1.6, 1.6, .4, 0x7a2a4a), -3, -3.5, 14.1), P(cbox(1.6, 1.6, .4, 0x7a2a4a), 3, -3.5, 14.1));
  const eyes = [], tongue = P(cbox(4, 1, 5, 0xff6f91), 0, -8.2, 14); tongue.visible = false; head.add(tongue);
  for (const sx of [-1, 1]) { head.add(P(cbox(6, 2.5, 3.5, 0xd9c8ff), sx * 10, 3, 1)); const horn = P(cbox(2, 7, 2, GOLDM), sx * 6.5, 10, 3); horn.rotation.z = -sx * .35; head.add(horn);
    const e = new THREE.Group(); e.position.set(sx * 4.5, 2.5, 9.6); e.add(P(cbox(3.6, 4, .6, 0xf5efe0), 0, 0, 0), P(cbox(1.8, 2.2, .4, 0x1a1020), sx * -.4, -.4, .4), P(cbox(.7, .7, .3, 0xffffff), sx * -.8, .3, .6)); head.add(e); eyes.push(e); }
  const haloRing = new THREE.Mesh(new THREE.TorusGeometry(10, .9, 6, 18), glowMat(PAL.gold, 1.7)); haloRing.rotation.x = Math.PI / 2; haloRing.position.set(0, 15, 3); head.add(haloRing);
  const haloGlow = halo(PAL.gold, 30, .4); haloGlow.position.set(0, 15, 3); head.add(haloGlow);
  const MOUTH = V(0, -6.5, 14); // head-local
  const strawTex = canvasTex((g, n) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ff6f91' : '#ffe7b0'; g.fillRect(0, i * n / 8, n, n / 8); } }, LP ? 32 : 64); strawTex.wrapS = strawTex.wrapT = THREE.RepeatWrapping; strawTex.repeat.set(1, 6);
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1, 8, 1, true), new THREE.MeshStandardMaterial({ map: strawTex, flatShading: true, side: THREE.DoubleSide, emissive: 0x331018 })); scene.add(straw);
  const NW = 220, wpos = new Float32Array(NW * 3), wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
  const drops = new THREE.Points(wg, new THREE.PointsMaterial({ color: 0x6fd8ff, size: 2.2, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })); scene.add(drops); const dr = rng(9), dj = [...Array(NW)].map(() => [dr(), dr() - .5, dr() - .5, dr() - .5]);
  const burp = halo(PAL.magic, 10, .8); burp.material.fog = false; scene.add(burp);
  const sweat = P(cbox(1.4, 2.4, 1.4, glowMat(0x8fe3ff, 1.2)), 9, 6, 8); head.add(sweat);

  // ================= timeline =================
  const L = timing.lines, shots = script.lines.map((l, i) => ({ name: l.shot, start: i ? L[i].start - .12 : 0, end: i < L.length - 1 ? L[i + 1].start - .12 : timing.duration }));
  const C3 = a => a.map(c => new THREE.Color(c)); const skyDusk = C3([PAL.skyTop, PAL.skyMid, PAL.skyLow]), skySpace = C3([0x04020c, 0x0b0722, 0x1c0f3a]);
  const skyHot = C3([0x6a1a2a, 0xe8603c, 0xffc23d]), skyCold = C3([0x0a1840, 0x3a6ab0, 0xbfe0ff]), skyDry = C3([0x3a2a4a, 0xb07a6a, 0xf2cf86]);
  const setSky = (a, b = a, m = 0) => ['top', 'mid', 'low'].forEach((k, i) => skyU[k].value.copy(a[i]).lerp(b[i], m));
  const mouthW = new THREE.Vector3(), tip = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
  const placeCow = (lift = 0, tilt = .32, nod = 0) => { cow.position.set(S.x, S.y + 72 + lift, S.z - 26); cow.rotation.set(tilt, 0, 0); head.rotation.set(.25 + nod, 0, 0); cow.updateMatrixWorld(true); mouthW.copy(MOUTH).applyMatrix4(head.matrixWorld); };
  const setStraw = () => { tip.set(S.x + (mouthW.x - S.x) * .3, S.y + ER - 1, S.z + (mouthW.z - S.z) * .3);
    tmp.subVectors(mouthW, tip); straw.position.copy(tip).addScaledVector(tmp, .5); straw.scale.set(1, tmp.length(), 1); straw.quaternion.setFromUnitVectors(up, tmp.clone().normalize()); straw.visible = true; };
  const flow = (t, rate, spit) => { drops.visible = true; for (let i = 0; i < NW; i++) { const [o, a, b, c] = dj[i], f = (o + t * rate) % 1;
      if (!spit) tmp.lerpVectors(tip, mouthW, f).add(V(a * 1.4, 0, b * 1.4)); else { tmp.set(a, -.6 - Math.abs(c), b).normalize().multiplyScalar(ER + 2).add(S); tmp.lerpVectors(mouthW, tmp, f); tmp.y += Math.sin(f * Math.PI) * 10; }
      wpos.set([tmp.x, tmp.y, tmp.z], i * 3); } wg.attributes.position.needsUpdate = true; };

  return function update(t) {
    let si = shots.findIndex(s => t < s.end); if (si < 0) si = shots.length - 1; const S_ = shots[si]; const u = t - S_.start, k = clamp(u / (S_.end - S_.start));
    // defaults
    setSky(skyDusk); scene.fog.color.set(PAL.fog); scene.fog.near = 90; scene.fog.far = 420; sun.position.set(80, 60, -90); sun.intensity = 3.2; sun.color.set(0xffb070); hemi.intensity = 1.1; world.bloom.strength = .7;
    const space = ['hook', 'cow', 'slurp', 'globe', 'oxygen', 'salty', 'spit'].includes(S_.name);
    if (space) { setSky(skySpace); scene.fog.far = 6000; scene.fog.near = 5000; hemi.intensity = .9; sun.position.set(120, 80, 140); }
    const sea = si < 4 ? 0 : S_.name === 'ships' ? lerp(0, -48, ease(clamp((u - .3) / 2.6))) : -60; water.position.y = sea; water.visible = sea > -47;
    ships.forEach(({ s, x, z, g }) => { const fl = Math.max(sea, g + 2) - 1; s.position.set(x, fl + Math.sin(t * 1.3 + x) * (sea > g + 2 ? .3 : 0), z); s.rotation.z = sea > g + 2 ? 0 : .16; s.rotation.x = sea > g + 2 ? 0 : .05; });
    wbody.rotation.set(0, 0, 0); wbody.position.y = 3.5; spout.userData.update(t); snow.userData.update(t); snow.visible = false; lake.scale.setScalar(1); lake.position.y = 3; clouds.visible = si < 8; clouds.children.forEach(c => c.material.opacity = .95);
    walker.position.set(-30, gh(-30, SZ) + .5, SZ - 6); walker.rotation.set(0, Math.PI / 2, 0);
    eyes.forEach(e => e.scale.set(1, 1, 1)); trL.visible = false; tongue.visible = false; sweat.visible = false; burp.visible = false; drops.visible = false; straw.visible = false; tail.rotation.x = .5 + Math.sin(t * 3) * .2;
    haloRing.rotation.z = t * .8; haloGlow.material.opacity = .35 + .1 * Math.sin(t * 3); earth.rotation.y = t * .12; eClouds.rotation.y = t * .05;
    const oc = si <= 1 ? 1 : S_.name === 'slurp' ? lerp(1, .95, k) : S_.name === 'globe' ? lerp(.95, .86, ease(k)) : S_.name === 'spit' ? lerp(.86, 1, ease(clamp((u - .9) / 2.2))) : .86;
    ocean.scale.setScalar(oc); ocean.visible = oc > .87; eClouds.visible = si <= 3 || (S_.name === 'spit' && u > 2.4); atmo.material.opacity = S_.name === 'oxygen' ? lerp(.22, .05, ease(k)) : si > 9 && S_.name !== 'spit' ? .06 : .22;
    let notify = 0, notifyText = null;

    switch (S_.name) {
      case 'hook': { const arr = easeOut(clamp((u - .2) / 1.6)); placeCow(lerp(160, 0, arr), .32, 0); setStraw(); straw.visible = arr > .95; world.bloom.strength = .7 + .5 * Math.sin(Math.PI * clamp((u - .3) / 1.2));
        cam(V(lerp(30, 8, ease(k)), S.y + 44, lerp(185, 160, ease(k))), V(S.x, S.y + 50, S.z), 52); break; }
      case 'cow': { placeCow(0, .32, Math.sin(u * 2) * .05); setStraw(); const a = lerp(.5, .15, ease(k)); cam(V(Math.sin(a) * 70, mouthW.y + 14, mouthW.z + Math.cos(a) * 70), V(0, mouthW.y + 8, mouthW.z - 12), 48);
        eyes.forEach(e => e.scale.y = (u % 2.2) < .12 ? .15 : 1); world.bloom.strength = .8; break; }
      case 'slurp': { placeCow(0, .32, 0); setStraw(); flow(t, 1.6, false); head.scale.set(1 + .06 * Math.abs(Math.sin(u * 5)), 1, 1);
        cam(V(lerp(40, 55, k), S.y + lerp(40, 55, k), lerp(115, 135, k)), V(S.x, S.y + 45, S.z - 5), 50); break; }
      case 'globe': { placeCow(0, .32, 0); setStraw(); flow(t, 2.2, false); cam(V(Math.sin(t * .2) * 20, S.y + lerp(10, 25, k), S.z + lerp(125, 112, k)), V(S.x, S.y + 6, S.z), 50); break; }
      case 'ships': { const s = ships[0]; cam(V(lerp(-36, -30, k), lerp(5, 16, ease(k)), lerp(66, 74, k)), V(-62, lerp(-1, -12, ease(k)), 22), 52); break; }
      case 'whale': { wbody.rotation.z = Math.sin(u * 6) * .35; wbody.position.y = 3.5 + Math.abs(Math.sin(u * 6)) * 2.5; eyes; cam(V(WX + lerp(34, 28, k), WG + 22, WZ + lerp(30, 26, k)), V(WX, WG + 3, WZ), 50); break; }
      case 'walk': { const x = lerp(-14, RIDGE + 22, k), y = gh(x, SZ - 6); walker.position.set(x, y + .5 + Math.abs(Math.sin(u * 7)) * .4, SZ - 6); walker.rotation.z = Math.sin(u * 7) * .06;
        cam(V(x - 12, y + 11, SZ - 34), V(x + 6, y + 4, SZ - 4), 55); break; }
      case 'trench': { cam(V(lerp(-50, -30, k), lerp(-55, -120, ease(k)), TRZ), V(70, lerp(-150, -168, ease(k)), TRZ), 58); scene.fog.color.set(0x3a2a70); scene.fog.near = 40; scene.fog.far = 260; trL.visible = true; world.bloom.strength = .9; hemi.intensity = .8; break; }
      case 'rain': { const dry = ease(clamp(u / 4)); setSky(skyDusk, skyDry, dry); clouds.children.forEach(c => c.material.opacity = .95 * (1 - dry)); clouds.visible = dry < .98; clouds.position.x = u * 3;
        lake.scale.setScalar(Math.max(.01, 1 - ease(clamp((u - 2) / 5)))); cam(V(-92, 16, 44), V(-120, 3, 10), 55); break; }
      case 'heat': { const sw = .5 + .5 * Math.sin(u * 2.6); setSky(skyCold, skyHot, sw); sun.color.set(0x9fc8ff).lerp(new THREE.Color(0xff7a3d), sw); sun.intensity = lerp(1.6, 4.2, sw); hemi.intensity = lerp(.7, 1.3, sw);
        scene.fog.color.set(0x8aa8d8).lerp(new THREE.Color(0xd8704a), sw); snow.visible = sw < .45; lake.scale.setScalar(.01); cam(V(-80 - k * 10, 22, 60), V(-118, 2, 0), 55); break; }
      case 'oxygen': { placeCow(0, .32, 0); straw.visible = false; cam(V(lerp(30, 10, k), S.y + 15, S.z + lerp(110, 90, ease(k))), V(S.x, S.y + 8, S.z), 50); hemi.intensity = .7; break; }
      case 'salty': { placeCow(0, .32, Math.sin(u * 9) * .06 * clamp(u - 1)); setStraw(); straw.visible = u < 1; const sour = clamp((u - .6) / .4); eyes.forEach(e => e.scale.y = lerp(1, .18, sour)); tongue.visible = sour > .5; sweat.visible = sour > .5; sweat.position.y = 6 - (u * 4 % 6);
        head.rotation.y = Math.sin(u * 10) * .12 * sour; cam(V(22, mouthW.y + 10, mouthW.z + 62), V(0, mouthW.y + 4, mouthW.z - 4), 48); break; }
      case 'spit': { placeCow(lerp(0, 8, ease(clamp(u / .6))), lerp(.32, .2, clamp(u / .6)), -.2 * Math.sin(Math.PI * clamp(u / .8))); const bp = clamp(u / .8); burp.visible = bp < 1; burp.position.copy(mouthW).add(V(0, 4, 10 * bp)); burp.scale.setScalar(10 + 40 * bp); burp.material.opacity = .8 * (1 - bp);
        if (u > .7 && u < 3.4) flow(t, 1.4, true); eyes.forEach(e => e.scale.y = u > 3 ? .5 : 1); notify = clamp((u - 3.2) / .45); notifyText = ['COSMIC COW   ·   now', 'Refill, please?', 'Less salt this time'];
        cam(V(lerp(60, 30, ease(k)), S.y + 45, lerp(230, 250, k)), V(S.x, S.y + 45, S.z), 52); world.bloom.strength = .8; break; }
    }
    return { title: script.title, titleA: si === 0 ? clamp((u - .3) / .3) * clamp((S_.end - S_.start - u) / .4) : 0, notify, notifyText };
  };
}
