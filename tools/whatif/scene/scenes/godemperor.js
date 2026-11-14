// whatif-002 — "What if you woke up as the God-Emperor of a galaxy-wide empire?"
// Original design only: gold armour, sun-ray crown, giant stepped throne, kneeling crowd,
// blocky star fleets, a spiral galaxy in the sky. Pure function of t, one case per shot.
import { THREE, P, rng, mat, glowMat, box, halo, tree, tower, person, sparkles, PAL, clamp, lerp, ease, easeOut } from '../world.js';

export function build(world, { script, timing }) {
  const { scene, camera, flat, skyU, sun, hemi } = world;
  const r = rng(202);
  const look = new THREE.Vector3();
  const cam = (p, l, fov = 55) => { camera.position.copy(p); look.copy(l); camera.lookAt(look); if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); } };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const GOLD = mat(0xf2b632, { metalness: .35, roughness: .35 }), GOLD2 = mat(0xc98a1c, { metalness: .35, roughness: .4 }), ROYAL = mat(0x6a2bd0), RED = mat(0xc8243a);

  // ---- the throne: stepped dais, seat, tall back with glowing gem rows ----
  const TZ = -8, B = flat(0, TZ); const throne = new THREE.Group(); throne.position.set(0, B, TZ); scene.add(throne);
  [[30, 26, 0], [23, 20, 1], [16, 14, 2]].forEach(([w, d, i]) => throne.add(P(box(w, 1.5, d, i % 2 ? PAL.stone : 0xe9dcc0), 0, .75 + i * 1.5, i * -.5)));
  throne.add(P(box(12, 1.6, 8.4, ROYAL), 0, 4.5 + .1, 6)); // carpet on the top step
  const SEAT = 4.5 + 3; throne.add(P(box(9, 3, 7, GOLD), 0, 4.5 + 1.5, -1), P(box(9.4, .5, 7.4, RED), 0, SEAT + .1, -1));
  throne.add(P(box(10, 26, 2.2, GOLD), 0, 4.5 + 13, -4.4), P(box(7, 22, .3, RED), 0, 4.5 + 12, -3.2));
  for (const sx of [-1, 1]) { throne.add(P(box(1.6, 2.4, 7, GOLD2), sx * 5.2, SEAT + 1.2, -1)); throne.add(P(box(2.4, 30, 2.4, GOLD2), sx * 6.4, 4.5 + 15, -4.4));
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 0), glowMat(PAL.magic, 1.6)); orb.position.set(sx * 6.4, 4.5 + 31.6, -4.4); throne.add(orb); }
  const gems = []; for (let i = 0; i < 6; i++) { const g = new THREE.Mesh(new THREE.OctahedronGeometry(.55, 0), glowMat(i % 2 ? PAL.magic : 0xff6fb0, 1.4)); g.position.set(0, 4.5 + 9 + i * 3.2, -3); throne.add(g); gems.push(g); }
  const sunDisc = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, .4, 12), glowMat(PAL.gold, 1.1)); sunDisc.rotation.x = Math.PI / 2; sunDisc.position.set(0, 4.5 + 26.5, -3.2); throne.add(sunDisc);
  const throneL = new THREE.PointLight(0xffc860, 260, 70, 2); throneL.position.set(0, 24, 10); throne.add(throneL);

  // ---- the Emperor (you): gold armour, red cape, sun-ray crown; seated, scale 3.4 ----
  const emp = new THREE.Group(); const ES = 3.4; emp.scale.setScalar(ES); emp.position.set(0, SEAT + .35, -1.4); throne.add(emp);
  for (const sx of [-1, 1]) emp.add(P(box(.55, .55, 1.4, GOLD), sx * .32, .28, .55), P(box(.52, 1.2, .52, GOLD), sx * .32, -.35, 1.15), P(box(.6, .32, .8, GOLD2), sx * .32, -.95, 1.3));
  emp.add(P(box(1.5, 1.6, .95, GOLD), 0, 1.05, 0), P(box(1.56, .28, 1.0, GOLD2), 0, .38, 0), P(box(1.8, 3.4, .12, RED), 0, .9, -.55));
  const chestGem = new THREE.Mesh(new THREE.OctahedronGeometry(.2, 0), glowMat(PAL.magic, 1.6)); chestGem.position.set(0, 1.3, .5); emp.add(chestGem);
  for (const sx of [-1, 1]) emp.add(P(box(.85, .55, 1.1, GOLD2), sx * 1.0, 1.75, 0));
  const armL = new THREE.Group(); armL.position.set(-1.0, 1.6, 0); armL.add(P(box(.44, 1.15, .44, GOLD), 0, -.55, 0)); armL.rotation.x = -.9; emp.add(armL);
  const armR = new THREE.Group(); armR.position.set(1.0, 1.6, 0); armR.add(P(box(.44, 1.15, .44, GOLD), 0, -.55, 0), P(box(.5, .4, .5, GOLD2), 0, -1.2, 0)); armR.rotation.x = -.9; emp.add(armR);
  const head = new THREE.Group(); head.position.set(0, 2.35, 0); emp.add(head);
  head.add(P(box(.95, .95, .95, PAL.skin[0]), 0, 0, 0), P(box(1.0, .3, 1.0, 0x3a2412), 0, .5, -.05), P(box(1.02, .2, 1.02, GOLD2), 0, .38, 0), P(box(.36, .22, .14, 0x5a3418), 0, -.42, .45), P(box(.3, .06, .05, 0x7a2a2a), 0, -.22, .49));
  const eyeM = mat(0x1a1020); const eyes = [-.2, .2].map(x => { const e = new THREE.Mesh(new THREE.BoxGeometry(.15, .18, .05), eyeM); e.position.set(x, .05, .49); head.add(e); return e; });
  const crown = new THREE.Group(); crown.position.set(0, .2, -.35); head.add(crown);
  for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * .33; const ray = new THREE.Mesh(new THREE.BoxGeometry(.12, .75, .1), glowMat(PAL.gold, 1.5)); ray.position.set(Math.sin(a + Math.PI / 2) * -1, Math.cos(a + Math.PI / 2) * -1 + .1, 0); ray.rotation.z = a + Math.PI / 2; ray.position.set(Math.cos(a + Math.PI) * -.95, -Math.sin(a + Math.PI) * .95 + .1, 0); ray.rotation.z = -(a + Math.PI / 2) + Math.PI; crown.add(ray); }
  const crownHalo = halo(PAL.gold, 3.2, .35); crownHalo.position.set(0, .3, -.4); head.add(crownHalo);
  const HEAD = V(0, B + SEAT + .35 + 2.35 * ES, TZ - 1.4);

  // ---- palace spires and trees around the plateau ----
  for (let i = 0; i < 10; i++) { const a = Math.PI + (i / 9) * Math.PI + (r() - .5) * .1, d = 24 + r() * 10; const x = Math.cos(a) * d, z = Math.sin(a) * d * .8 - 10; if (flat(x, z) < 1) continue; const tw = tower(r, 5 + Math.floor(r() * 6)); tw.position.set(x, flat(x, z), z); scene.add(tw); }
  for (let i = 0; i < 40; i++) { const a = r() * Math.PI * 2, d = 26 + r() * 22; const x = Math.cos(a) * d, z = Math.sin(a) * d; if (flat(x, z) < 1 || (z > 0 && Math.abs(x) < 32)) continue; const tr = tree(r); tr.position.set(x, flat(x, z), z); scene.add(tr); }

  // ---- the crowd: rows of robed subjects facing the throne, kneeling in a wave ----
  const crowd = []; const cr = rng(17); const robes = [0xe84a5f, 0x3fa7f5, 0x7c5cff, 0x2ecc71, 0xff7a3d, 0xff5fa2, 0xffc43d];
  for (let row = 0; row < 14; row++) for (let c = 0; c < 22; c++) { const x = (c - 10.5) * 2.6 + (row % 2) * 1.3 + (cr() - .5) * .6, z = 10 + row * 2.6 + (cr() - .5) * .6; if (Math.abs(x) < 3.2 || flat(x, z) < 1) continue;
    const w = new THREE.Group(); const p = person(cr, { noPhone: true, shirt: robes[Math.floor(cr() * robes.length)] }); w.add(p); w.rotation.y = Math.PI; w.position.set(x, flat(x, z), z); scene.add(w); crowd.push({ w, p, z, ph: cr() * 6 }); }
  const prayers = sparkles(220, 21, 0xffe7a0, .5, [60, 40, 40]); prayers.position.set(0, 4, 26); scene.add(prayers);

  // ---- star fleets: blocky ships in V formations crossing the sky ----
  const ships = []; const sr = rng(33);
  const ship = (s) => { const g = new THREE.Group(); const hull = sr() > .5 ? 0xe9e4f5 : 0xb7b2c9;
    g.add(P(box(3, 1.6, 12, hull), 0, 0, 0), P(box(2, 1.2, 3, hull), 0, .2, 7), P(box(11, .4, 4, PAL.roof[Math.floor(sr() * 4)]), 0, 0, -2), P(box(1.6, 1.4, 2.4, 0x3e64d8), 0, 1.2, 2));
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(1, 1, .4), glowMat(PAL.magic, 2)); e.position.set(sx * 1, 0, -6.2); g.add(e); }
    const eh = halo(PAL.magic, 4, .5); eh.position.z = -7; g.add(eh); g.scale.setScalar(s); g.rotation.y = Math.PI / 2; scene.add(g); return g; };
  for (let f = 0; f < 5; f++) { const fy = 55 + f * 14, fz = -60 + f * 26, fx = -260 + f * 70 - sr() * 40, sp = 14 + sr() * 8;
    for (let k = 0; k < 7; k++) { const row = Math.ceil(k / 2), side = k % 2 ? 1 : -1; ships.push({ g: ship(k ? 1 : 1.6), f, rx: -row * 14, x0: fx - row * 14, y: fy + (sr() - .5) * 3, z: fz + side * row * 12, sp }); } }

  // ---- paperwork: falling sheets and growing stacks ----
  const NP = 420, pIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, .06, 2.1), mat(0xe8dcc0, { roughness: 1 }), NP); pIM.castShadow = false; scene.add(pIM);
  const pr = rng(44), pd = [...Array(NP)].map(() => [(pr() - .5) * 70, pr() * 60, -14 + pr() * 54, pr() * 6.28, .6 + pr()]);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  const stacks = []; const sk = rng(55); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, d = 13 + sk() * 6; const x = Math.cos(a) * d, z = TZ + 4 + Math.sin(a) * d * .7; const s = box(2.2, 1, 2.8, mat(0xe8dcc0, { roughness: 1 })); s.position.set(x, flat(x, z), z); s.rotation.y = sk(); scene.add(s); stacks.push({ s, h: 6 + sk() * 14, d: sk() * .5, y0: flat(x, z) }); }

  // ---- sandwich (floats in front of you) + a servant who runs for it ----
  const sand = new THREE.Group(); [[3.2, .7, 0xd9a05b], [3.4, .25, 0x5cc05a], [3.0, .4, 0xe8483a], [3.2, .3, 0xffd23f], [3.2, .7, 0xd9a05b]].reduce((y, [w, h, c]) => { sand.add(P(box(w, h, 2.6, c), 0, y + h / 2, 0)); return y + h; }, 0);
  const sandHalo = halo(PAL.gold, 9, .35); sandHalo.position.y = 1.2; sand.add(sandHalo); scene.add(sand);
  const servant = person(rng(9), { noPhone: true, shirt: 0xffc43d }); scene.add(servant);

  // ---- the galaxy in the sky: two-armed spiral of points, plus route markers ----
  const gal = new THREE.Group(); gal.position.set(0, 430, -260); gal.rotation.x = .75; scene.add(gal);
  { const n = 26000, gr = rng(77), pos = new Float32Array(n * 3), colA = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) { const arm = i % 2, t = Math.pow(gr(), .8), rad = 12 + t * 190, a = arm * Math.PI + t * 7.5 + (gr() - .5) * .55, sc = (1 - t) * 14 + 4;
      pos.set([Math.cos(a) * rad + (gr() - .5) * sc, Math.sin(a) * rad + (gr() - .5) * sc, (gr() - .5) * (1 - t) * 10], i * 3); c.setHSL(lerp(.12, .72, t) + (gr() - .5) * .08, .8, lerp(.75, .62, t)); colA.set([c.r, c.g, c.b], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    gal.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, transparent: true, opacity: .75, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }))); }
  const core = halo(0xffe0a0, 90, .55); core.material.fog = false; gal.add(core);
  const homeP = V(-55, -125, 4), kitP = V(60, 130, 4);
  const home = halo(PAL.gold, 70, 1); home.material.fog = false; home.position.copy(homeP); gal.add(home);
  const kit = halo(0xff7a3d, 70, 1); kit.material.fog = false; kit.position.copy(kitP); gal.add(kit);
  const NR = 90, rp = new Float32Array(NR * 3); for (let i = 0; i < NR; i++) { const k = i / (NR - 1); pv.lerpVectors(homeP, kitP, k); pv.x += Math.sin(k * Math.PI) * 70; rp.set([pv.x, pv.y, pv.z + 2], i * 3); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); const route = new THREE.Points(rg, new THREE.PointsMaterial({ color: 0xffd23f, size: 4, sizeAttenuation: true, transparent: true, depthWrite: false, fog: false })); gal.add(route);
  const courier = halo(0xffffff, 14, 1); courier.material.fog = false; gal.add(courier);
  const galN = new THREE.Vector3(0, 0, 1).applyEuler(gal.rotation);

  // ---- timeline ----
  const L = timing.lines, shots = script.lines.map((l, i) => ({ name: l.shot, start: i ? L[i].start - .12 : 0, end: i < L.length - 1 ? L[i + 1].start - .12 : timing.duration }));
  const skyDusk = [new THREE.Color(PAL.skyTop), new THREE.Color(PAL.skyMid), new THREE.Color(PAL.skyLow)];
  const skyNight = [new THREE.Color(0x050314), new THREE.Color(0x140a3a), new THREE.Color(0x3a1a5a)];
  const skyDay = [new THREE.Color(0x2b6fe0), new THREE.Color(0x7fc4ff), new THREE.Color(0xffe0b0)];
  const setSky = (n, d = 0) => { ['top', 'mid', 'low'].forEach((k, i) => skyU[k].value.copy(skyDusk[i]).lerp(skyNight[i], n).lerp(skyDay[i], d)); scene.fog.color.set(PAL.fog).lerp(new THREE.Color(0x0a0620), n).lerp(new THREE.Color(0xbfd8ff), d); };

  return function update(t) {
    let si = shots.findIndex(s => t < s.end); if (si < 0) si = shots.length - 1; const S = shots[si]; const u = t - S.start, k = clamp(u / (S.end - S.start));
    // defaults
    setSky(0); sun.position.set(80, 60, -90); sun.intensity = 3.2; hemi.intensity = 1.1; world.bloom.strength = .7; scene.fog.near = 90; scene.fog.far = 420;
    prayers.userData.update(t); prayers.visible = false; gems.forEach((g, i) => { g.rotation.y = t * 1.5 + i; }); crownHalo.material.opacity = .35;
    eyes.forEach(e => e.scale.y = 1); head.rotation.set(0, 0, 0); armR.rotation.set(-.9, 0, 0); emp.position.y = SEAT + .35;
    crowd.forEach(({ p, w, z, ph }) => { const kneel = si >= 3 ? 1 : si === 2 ? clamp((u - .2 - (z - 10) / 36 * 1.4) / .5) : 0; p.rotation.x = .55 * kneel; p.position.y = -.55 * kneel; w.visible = true; });
    ships.forEach(({ g, x0, y, z, sp }) => { const x = ((x0 + t * sp + 300) % 600 + 600) % 600 - 300; g.position.set(x, y + Math.sin(t + z) * .8, z); });
    pIM.visible = false; stacks.forEach(s => { s.s.scale.y = .001; s.s.position.y = s.y0; s.s.visible = si >= 5; });
    sand.visible = false; servant.visible = false; gal.visible = si >= 3; route.geometry.setDrawRange(0, 0); courier.visible = false;
    let notify = 0, notifyText = null;
    const stackGrow = (g) => stacks.forEach(s => { const h = Math.max(.001, s.h * clamp(g - s.d)); s.s.scale.y = h; s.s.position.y = s.y0 + h / 2; });
    const rain = (amt) => { pIM.visible = true; pd.forEach(([x, y, z, ph, sp], i) => { const yy = 70 - ((y + t * 9 * sp) % 70); e3.set(t * sp + ph, ph, Math.sin(t * 2 + ph) * .8); q.setFromEuler(e3); pv.set(x + Math.sin(t * sp + ph) * 3, B + yy, z); m4.compose(pv, q, i < NP * amt ? one : pv.clone().set(0, 0, 0).addScalar(.0001)); pIM.setMatrixAt(i, m4); }); pIM.instanceMatrix.needsUpdate = true; };
    const H = HEAD;

    switch (S.name) {
      case 'hook': { // dark, eyes closed -> eyes snap open, the crown ignites, light floods in, pull back
        const wake = clamp((u - .9) / .35); eyes.forEach(e => e.scale.y = lerp(.12, 1, wake)); setSky(1 - wake * .9); hemi.intensity = lerp(.25, 1.1, wake); sun.intensity = lerp(.3, 3.2, wake);
        crownHalo.material.opacity = lerp(.05, .5, wake); world.bloom.strength = .6 + .6 * Math.sin(Math.PI * clamp((u - .9) / .8));
        const z = lerp(H.z + 17, H.z + 34, ease(clamp((u - 1.2) / 2.6))); cam(V(lerp(.6, 3, k), H.y + lerp(.2, 3, ease(k)), z), V(0, H.y - lerp(.3, 4, ease(k)), H.z), 40); break; }
      case 'armour': { const a = lerp(.15, .7, ease(k)), d = lerp(26, 62, ease(k)); cam(V(Math.sin(a) * d, B + lerp(14, 26, ease(k)), TZ + Math.cos(a) * d), V(0, B + lerp(14, 17, k), TZ), 50);
        world.bloom.strength = .7 + .25 * Math.sin(Math.PI * clamp(u / 1.2)); break; }
      case 'kneel': { cam(V(lerp(16, 12, k), B + lerp(42, 46, k), TZ - lerp(10, 14, k)), V(0, B + 2, lerp(20, 26, k)), 50); prayers.visible = u > 1.2; break; }
      case 'stars': { const n = ease(clamp(u / 1.6)); setSky(n); hemi.intensity = lerp(1.1, .7, n); scene.fog.far = lerp(420, 900, n);
        const g = gal.position; const p = V(lerp(0, 0, k), lerp(B + 8, 190, ease(k)), lerp(48, 120, ease(k))); const tgt = V(0, B + 14, TZ).lerp(g, ease(clamp(u / 2.2))); cam(p, tgt, lerp(55, 62, k)); world.bloom.strength = .8; break; }
      case 'fleet': { ships.forEach(({ g, f, rx, z }) => { const fz = -60 + f * 26; g.position.set(rx + lerp(-70, 110, k) - f * 30, 34 + f * 7, -24 + f * 8 + (z - fz) * .8); }); cam(V(lerp(18, 12, k), B + 3, lerp(40, 36, k)), V(lerp(-10, 10, k), lerp(52, 64, k), lerp(-10, -20, k)), 58); break; }
      case 'paperwork': { rain(clamp(u / .8)); stackGrow(k * 1.4); prayers.visible = true; const a = lerp(-.6, -.35, k); cam(V(Math.sin(a) * 44, B + lerp(18, 22, k), TZ + Math.cos(a) * 44), V(0, B + 13, TZ), 52);
        head.rotation.y = Math.sin(u * 4) * .35; break; }
      case 'sandwich': { stackGrow(1.4); armR.rotation.set(-1.9 + Math.sin(u * 3) * .1, 0, -.2); const sk2 = easeOut(clamp((u - .9) / .6)); sand.visible = sk2 > 0; sand.scale.setScalar(sk2 * .9);
        sand.position.set(5, H.y - 3 + Math.sin(t * 2) * .3, H.z + 3); stacks.forEach(s => { if (s.s.position.z > TZ + 5) s.s.visible = false; }); sand.rotation.y = t * .9;
        servant.visible = true; const sp = clamp((u - 1.6) / 2.2); servant.position.set(lerp(-7, -16, sp), flat(-12, 14) + Math.abs(Math.sin(u * 14)) * .4, lerp(6, 24, sp)); servant.rotation.y = -.4; servant.userData.body && (servant.rotation.x = .2);
        cam(V(lerp(13, 10, ease(k)), H.y + 2.5, H.z + lerp(24, 19, ease(k))), V(2.4, H.y - .5, H.z + 1), 42); break; }
      case 'kitchen': { setSky(1); scene.fog.far = 2000; route.geometry.setDrawRange(0, Math.floor(NR * clamp(u / 2.5)));
        courier.visible = true; const ck = clamp((u - .6) / 9) * .04; courier.position.set(lerp(homeP.x, kitP.x, ck) + Math.sin(ck * Math.PI) * 70, lerp(homeP.y, kitP.y, ck), 6); courier.material.opacity = .6 + .4 * Math.sin(t * 8);
        const g = gal.position; const d = lerp(360, 470, ease(k)); const p = g.clone().addScaledVector(galN, d); cam(p, g, 60); world.bloom.strength = .8; break; }
      case 'twist': { stackGrow(1.5 + k); stacks.forEach(s => { if (s.s.position.z > TZ + 5) s.s.visible = false; }); const cyc = u * 2.6; setSky(.5 - .5 * Math.cos(cyc), 0); hemi.intensity = .8 + .3 * Math.cos(cyc);
        head.rotation.set(lerp(0, .25, ease(clamp((u - 2) / 1))), 0, lerp(0, .18, ease(clamp((u - 2) / 1)))); eyes.forEach(e => e.scale.y = u > 2.4 ? .45 : 1); armR.rotation.set(-.9 + Math.abs(Math.sin(u * 8)) * .25, 0, 0);
        notify = clamp((u - .5) / .45); notifyText = ['GALAXY EATS   ·   now', 'Order on its way!', 'Arrives in 100,000 years'];
        cam(V(lerp(12, 8, ease(k)), H.y + lerp(2, 3, k), H.z + lerp(30, 24, ease(k))), V(0, H.y - 4.5, H.z), 46); world.bloom.strength = .7; break; }
    }
    return { title: script.title, titleA: si === 0 ? clamp(u / .3) * clamp((S.end - S.start - u) / .4) : 0, notify, notifyText };
  };
}
