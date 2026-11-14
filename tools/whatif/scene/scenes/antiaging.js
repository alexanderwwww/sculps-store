// whatif-001 — "What if the anti-aging cure was as common as a phone?"
// Shots are named in script.json; each gets local time u (seconds into its line)
// and k (0..1 progress). Everything is a pure function of t.
import { THREE, P, rng, mat, glowMat, box, halo, tree, house, tower, person, sparkles, PAL, clamp, lerp, ease, easeOut, smooth } from '../world.js';

export function build(world, { script, timing }) {
  const { scene, camera, flat, skyU, sun, hemi, water } = world;
  const r = rng(42);
  const at = (o, x, z, dy = 0) => { o.position.set(x, flat(x, z) + dy, z); scene.add(o); return o; };
  const look = new THREE.Vector3();
  const cam = (p, l, fov = 55) => { camera.position.copy(p); look.copy(l); camera.lookAt(look); if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); } };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // --- the alchemist tower at the centre, crystal on top ---
  const keep = tower(rng(3), 6); at(keep, 0, -4); keep.scale.set(1.5, 1, 1.5);
  const topY = flat(0, -4) + 6 * 3.4 + 4;
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(2.2, 0), glowMat(PAL.magic, 3)); crystal.position.set(0, topY + 4, -4); scene.add(crystal);
  const crystalHalo = halo(PAL.magic, 22, .8); crystalHalo.position.copy(crystal.position); scene.add(crystalHalo);
  const crystalLight = new THREE.PointLight(PAL.magic, 300, 60, 2); crystalLight.position.copy(crystal.position); scene.add(crystalLight);
  const motes = sparkles(260, 9, 0xffe7a0, 0.45, [90, 40, 90]); motes.position.set(0, 3, 0); scene.add(motes);

  // --- the cure: a glowing phone-shaped vial ---
  const cure = new THREE.Group();
  const slab = box(2.4, 4.4, .4, 0x241046, { metalness: .4, roughness: .3 }); cure.add(slab);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(2.0, 3.8, .1), glowMat(PAL.gold, .9)); screen.position.z = .22; cure.add(screen);
  const leaf = new THREE.Mesh(new THREE.OctahedronGeometry(.6, 0), glowMat(0x7dff9a, 4)); leaf.position.z = .4; leaf.scale.set(.8, 1.4, .3); cure.add(leaf);
  const cureHalo = halo(PAL.gold, 9, .4); cure.add(cureHalo); scene.add(cure);

  // --- village ---
  const houses = [];
  for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2 + r() * .2, d = 15 + r() * 15; const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (z > 8 && Math.abs(x) < 10) continue; if (flat(x, z) < 1) continue; const h = house(r, 4 + Math.floor(r() * 3), 4 + Math.floor(r() * 2)); h.rotation.y = -a + Math.PI / 2; at(h, x, z); houses.push(h); }
  for (let i = 0; i < 60; i++) { const a = r() * Math.PI * 2, d = 12 + r() * 30; const x = Math.cos(a) * d, z = Math.sin(a) * d; if (flat(x, z) < 1 || (z > 6 && z < 34 && Math.abs(x) < 12)) continue; at(tree(r), x, z); }

  // --- towers that grow (cities shot) ---
  const growers = [];
  for (let i = 0; i < 34; i++) { const a = i / 34 * Math.PI * 2 + r() * .15, d = 20 + r() * 18; const x = Math.cos(a) * d, z = Math.sin(a) * d; if (flat(x, z) < 1 || (z > 6 && Math.abs(x) < 12)) continue;
    const tw = tower(r, 4 + Math.floor(r() * 9)); tw.scale.y = .001; tw.visible = false; at(tw, x, z); growers.push({ tw, delay: r() * .6 }); }
  const clouds = new THREE.Group(); for (let i = 0; i < 14; i++) { const c = new THREE.Group(); const n = 3 + Math.floor(r() * 3); for (let j = 0; j < n; j++) { const b = box(6 + r() * 6, 3 + r() * 2, 5 + r() * 4, 0xf5e6ff, { roughness: 1 }); b.castShadow = false; b.position.set(j * 4 - n * 2, r() * 2, r() * 3); c.add(b); }
    const a = r() * Math.PI * 2, d = 25 + r() * 50; c.position.set(Math.cos(a) * d, 46 + r() * 10, Math.sin(a) * d); clouds.add(c); } scene.add(clouds);

  // --- crowd on the plaza and streets ---
  const crowd = []; const pr = rng(11);
  for (let i = 0; i < 90; i++) { const x = (pr() - .5) * 36, z = 9 + pr() * 30; if (flat(x, z) < 1) continue; const p = person(pr); p.rotation.y = Math.PI + (pr() - .5) * .8; at(p, x, z); crowd.push({ p, ph: pr() * 6 }); }
  const rings = crowd.map(({ p }) => { const s = halo(PAL.gold, 1, 0); scene.add(s); return s; });

  // --- lab: a floating rock with a mouse ---
  const lab = new THREE.Group(); lab.position.set(70, 34, -30); scene.add(lab);
  for (let i = 0; i < 5; i++) { const s = 14 - i * 2.6; const b = box(s, 2, s, i ? PAL.rock[i % 2] : PAL.grass[0]); b.position.y = -i * 2; lab.add(b); }
  const ped = box(3, 2, 3, PAL.stone); ped.position.y = 2; lab.add(ped);
  const mouse = new THREE.Group(); const fur = 0xb9b3c9;
  mouse.add(P(box(1.6, 1.1, 2.4, fur), 0, .55, 0), P(box(1.1, 1, 1.1, fur), 0, .9, 1.4),
    P(box(.6, .7, .15, 0xffa5c0), -.5, 1.6, 1.2), P(box(.6, .7, .15, 0xffa5c0), .5, 1.6, 1.2),
    P(box(.22, .22, .2, 0xff6f9a), 0, .85, 2.0), P(box(.15, .15, .1, 0x111111), -.28, 1.1, 1.96), P(box(.15, .15, .1, 0x111111), .28, 1.1, 1.96),
    P(box(.18, .18, 2.4, 0xffa5c0), 0, .4, -2.2));
  mouse.position.y = 3; lab.add(mouse);
  const genes = [0xff4f7a, 0x4fd6ff, 0x9dff5c, 0xffc43d].map(c => { const g = new THREE.Mesh(new THREE.IcosahedronGeometry(.5, 0), glowMat(c, 1.6)); const h = halo(c, 2.2, .45); g.add(h); lab.add(g); return g; });
  const glass = new THREE.Group(); { const gm = mat(0xbff6ff, { transparent: true, opacity: .35, roughness: .1 }); const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.6, 6), gm), c2 = c1.clone(); c1.position.y = .8; c1.rotation.x = Math.PI; c2.position.y = -.8;
    const sandA = new THREE.Mesh(new THREE.ConeGeometry(.8, .9, 6), glowMat(PAL.gold, 1.5)); sandA.position.y = -1.1; glass.add(c1, c2, sandA, P(box(2.6, .25, 2.6, 0x7a4a2a), 0, 1.7, 0), P(box(2.6, .25, 2.6, 0x7a4a2a), 0, -1.7, 0));
    glass.userData.sand = sandA; } glass.position.set(-3.4, 4.5, 1); lab.add(glass);
  const pill = new THREE.Group(); { const a = new THREE.Mesh(new THREE.CapsuleGeometry(.45, 1, 4, 8), glowMat(0xff5fa2, 1.2)); pill.add(a); pill.add(halo(0xff5fa2, 3, .4)); } pill.scale.setScalar(.7); pill.position.set(2.6, 5.2, -1.5); pill.rotation.z = 1; lab.add(pill);

  // --- family of six ---
  const fam = []; const fr = rng(5); const hairs = [0x2a1a10, 0xe0b04a, 0xb84a2a, 0x1a1a1a, 0x5a3418, 0xf0f0f0];
  for (let i = 0; i < 6; i++) { const p = person(fr, { hair: hairs[i], noPhone: true, shirt: PAL.shirts[i] }); p.userData.armR.rotation.x = 0; p.userData.armR.position.set(.8, 1.7, 0); p.visible = false; p.position.set(-30 + i * 2.2, 0, 60); scene.add(p); fam.push(p); }
  const famPad = box(16, 1, 6, 0xf2cf86); famPad.position.set(-24.5, .5, 60); famPad.visible = false; scene.add(famPad);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(.5, .45, .4, 6, 1, true), glowMat(PAL.gold, 2.5)); crown.position.y = 3.7; fam[5].add(crown);

  // --- career: forge + anvil ---
  const smith = person(rng(8), { noPhone: true, shirt: 0x7c5cff }); at(smith, -6, 20); smith.rotation.y = .6;
  const anvil = box(1.6, 1, .9, 0x3a3a4a, { metalness: .6, roughness: .4 }); at(anvil, -4.6, 21.4, .5);
  const forge = box(2.4, 2, 2.4, 0x6b6377); at(forge, -8.8, 22, 1); const fire = halo(0xff7a2a, 6, .9); at(fire, -8.8, 22, 2.6); const fireL = new THREE.PointLight(0xff8a3a, 60, 20, 2); fireL.position.copy(fire.position); scene.add(fireL);
  const sparks = sparkles(60, 3, 0xffb050, .35, [3, 4, 3]); at(sparks, -4.6, 21.4, 1); sparks.visible = false;

  // --- cake ---
  const cake = new THREE.Group(); const tiers = [[14, 4, 0xff9ac6], [10, 3.4, 0xfff0d8], [6.4, 3, 0xff9ac6]]; let cy = 0;
  tiers.forEach(([s, h, c]) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(s / 2, s / 2, h, 10), mat(c)); b.position.y = cy + h / 2; b.castShadow = b.receiveShadow = true; cake.add(b);
    const ic = new THREE.Mesh(new THREE.CylinderGeometry(s / 2 + .15, s / 2 + .15, .6, 10), mat(0xffffff)); ic.position.y = cy + h - .2; cake.add(ic); cy += h; });
  const cr = rng(122), N = 122, cIM = new THREE.InstancedMesh(new THREE.BoxGeometry(.22, 1.1, .22), mat(0x7fd6ff), N), fl = new Float32Array(N * 3), m4 = new THREE.Matrix4();
  for (let i = 0; i < N; i++) { const tier = i < 60 ? 0 : i < 100 ? 1 : 2; const rad = tiers[tier][0] / 2 - .6 - cr() * (tier ? 1.4 : 2.5); const a = cr() * Math.PI * 2; const y = [4, 7.4, 10.4][tier];
    m4.makeTranslation(Math.cos(a) * rad, y + .55, Math.sin(a) * rad); cIM.setMatrixAt(i, m4); fl.set([Math.cos(a) * rad, y + 1.35, Math.sin(a) * rad], i * 3); }
  cake.add(cIM); const flG = new THREE.BufferGeometry(); flG.setAttribute('position', new THREE.BufferAttribute(fl, 3));
  const flames = new THREE.Points(flG, new THREE.PointsMaterial({ color: 0xffb347, size: .55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); cake.add(flames);
  const cakeL = new THREE.PointLight(0xffa040, 120, 40, 2); cakeL.position.y = 14; cake.add(cakeL);
  cake.position.set(0, 0, 0); cake.visible = false; const cakeSpot = V(0, flat(0, 22), 22); cake.position.copy(cakeSpot); scene.add(cake);

  const redL = new THREE.PointLight(0xff3050, 0, 120, 1.5); redL.position.set(0, 30, 20); scene.add(redL);

  // ---- timeline ----
  const L = timing.lines, shots = script.lines.map((l, i) => ({ name: l.shot, start: i ? L[i].start - .12 : 0, end: i < L.length - 1 ? L[i + 1].start - .12 : timing.duration }));
  const wordT = (li, w) => { const x = timing.words.find(o => o.line === li && o.w.toLowerCase().replace(/[^a-z]/g, '').startsWith(w)); return x ? x.start : L[li].start; };
  const skyNight = [new THREE.Color(PAL.skyTop), new THREE.Color(PAL.skyMid), new THREE.Color(PAL.skyLow)];
  const skyDay = [new THREE.Color(0x2b6fe0), new THREE.Color(0x7fc4ff), new THREE.Color(0xffe0b0)];
  const tmp = new THREE.Color();
  const setSky = (d) => { ['top', 'mid', 'low'].forEach((k, i) => skyU[k].value.copy(skyNight[i]).lerp(skyDay[i], d)); scene.fog.color.copy(tmp.set(PAL.fog).lerp(new THREE.Color(0xbfd8ff), d)); };

  return function update(t) {
    const si = Math.max(0, shots.findIndex(s => t < s.end)); const S = shots[si === -1 ? shots.length - 1 : si]; const u = t - S.start, k = clamp(u / (S.end - S.start));
    // defaults
    motes.userData.update(t); crystal.rotation.y = t * .8; crystal.position.y = topY + 4 + Math.sin(t * 1.6) * .5; crystalHalo.position.copy(crystal.position);
    crystal.material.emissive.set(PAL.magic); crystalHalo.material.color.set(PAL.magic); crystalLight.color.set(PAL.magic);
    cure.visible = false; cake.visible = false; fam.forEach(p => p.visible = false); famPad.visible = false; redL.intensity = 0; sparks.visible = false;
    growers.forEach(g => { g.tw.visible = si >= 4; g.tw.scale.y = si > 4 ? 1 : .001; });
    rings.forEach(s => s.material.opacity = 0); setSky(0); sun.position.set(80, 60, -90); sun.intensity = 3.2; hemi.intensity = 1.1;
    crowd.forEach(({ p, ph }) => { p.userData.phone.visible = si >= 3; p.userData.phone.material.emissive.set(PAL.gold); p.userData.armR.rotation.x = si >= 3 ? -1.1 : 0; p.userData.phone.material.emissiveIntensity = 2.2; p.position.y = flat(p.position.x, p.position.z) + Math.max(0, Math.sin(t * 5 + ph)) * .15; });
    if (S.name !== 'career') crowd.forEach(({ p }) => p.visible = true);
    clouds.position.x = Math.sin(t * .05) * 8;
    world.bloom.strength = .75; let notify = 0;

    switch (S.name) {
      case 'hook': { // street-level push up to the tower; the crystal bursts and the cure floats down to camera
        const p = V(lerp(6, 3, ease(k)), lerp(8, 12, ease(k)), lerp(48, 30, ease(k))); cam(p, V(0, lerp(14, topY - 4, ease(k)), -4), 58);
        const b = clamp((u - .9) / .5); world.bloom.strength = .75 + .7 * Math.sin(Math.PI * b);
        cure.visible = u > .9; const ck = easeOut((u - .9) / 2.2); cure.position.set(lerp(0, p.x * .3, ck), lerp(topY + 4, p.y + 1.5, ck), lerp(-4, p.z - 20, ck)); cure.rotation.y = Math.sin(t * 1.5) * .35; cure.scale.setScalar(lerp(.2, .8, ck));
        break; }
      case 'mice': { const c = lab.position; const a = lerp(.4, 1.1, ease(k)); cam(V(c.x + Math.sin(a) * 13, c.y + 6.5 - 1.5 * ease(k), c.z + Math.cos(a) * 13), V(c.x, c.y + 3.6, c.z), 42);
        genes.forEach((g, i) => { const ga = t * 2.2 + i * Math.PI / 2, rad = lerp(5, 3.2, ease(k)); g.position.set(Math.cos(ga) * rad, 6.4 + Math.sin(t * 3 + i) * .4, Math.sin(ga) * rad); g.scale.setScalar(clamp(u / .6) * .8); });
        mouse.rotation.y = Math.sin(t * 1.3) * .5; mouse.position.y = 3 + Math.abs(Math.sin(t * 4)) * .25 * ease(k); glass.visible = false; pill.visible = false; break; }
      case 'pill': { const c = lab.position; const a = lerp(1.1, 1.9, ease(k)); cam(V(c.x + Math.sin(a) * 13, c.y + 6, c.z + Math.cos(a) * 13), V(c.x, c.y + 3.6, c.z), 45);
        genes.forEach((g, i) => { const ga = t * 2.2 + i * Math.PI / 2; g.position.set(Math.cos(ga) * 2.4, 4.6, Math.sin(ga) * 2.4); g.scale.setScalar(1 - clamp(u / .5)); });
        glass.visible = pill.visible = true; glass.rotation.z = Math.PI * ease((u - 1.2) / .8); glass.userData.sand.scale.setScalar(lerp(1, .3, clamp((u - 2) / 3)));
        pill.rotation.set(t * 1.5, t, 1); pill.position.y = 5 + Math.sin(t * 2) * .4; mouse.rotation.y = t * .6; break; }
      case 'everyone': { const p = V(lerp(0, -4, k), lerp(5, 34, ease(k)), lerp(48, 66, ease(k))); cam(p, V(0, lerp(6, 4, k), lerp(26, 18, k)), 55);
        crowd.forEach(({ p: q, ph }, i) => { const st = .2 + (q.position.z - 9) / 30 * .9 + (ph % 1) * .2; const e = clamp((u - st) / .9); const s = rings[i]; s.position.copy(q.position).add(V(.7, 2.4, .7)); s.scale.setScalar(1 + e * 9); s.material.opacity = (1 - e) * .8 * (e > 0 ? 1 : 0);
          q.userData.phone.material.emissiveIntensity = 2 + 3 * (1 - e) * (e > 0); }); world.bloom.strength = 1.0; break; }
      case 'cities': { const a = -.3 + k * 1.1; cam(V(Math.sin(a) * 85, lerp(30, 62, ease(k)), Math.cos(a) * 85), V(0, lerp(10, 22, k), 0), 55);
        growers.forEach(g => { g.tw.visible = true; g.tw.scale.y = Math.max(.001, easeOut((k * 1.25 - g.delay * .7) / .45)); }); break; }
      case 'family': { fam.forEach((p, i) => { p.visible = true; p.position.y = 1 + Math.max(0, Math.sin(t * 4 + i)) * .12; p.rotation.y = Math.sin(t * 1.2 + i) * .15; }); famPad.visible = true;
        crown.rotation.y = t; const x = lerp(-27.5, -21.5, ease(k)); cam(V(x + 4, 6, 98), V(x - .5, 2.6, 60), 36); break; }
      case 'career': { crowd.forEach(({ p }) => p.visible = false); setSky(.5 + .5 * Math.sin(u * 3.2)); const sa = u * 3.2; sun.position.set(Math.cos(sa) * 100, 30 + Math.sin(sa) * 70, -60); sun.intensity = 2 + Math.sin(sa); hemi.intensity = 1.1 + .4 * Math.sin(sa);
        smith.userData.armR.rotation.x = -1.6 + Math.abs(Math.sin(u * 9)) * 1.2; sparks.visible = true; sparks.userData.update(t * 3);
        { const cx = lerp(2, -1, k), cz = lerp(32, 28, ease(k)); cam(V(cx, Math.max(flat(cx, cz), flat(-6, 20)) + lerp(4, 5.5, k), cz), V(-5.6, flat(-6, 20) + 2.4, 21), 46); } break; }
      case 'cake': { cake.visible = true; flames.material.size = .55 + Math.sin(t * 20) * .08; const a = .2 + k * .9; cam(V(Math.sin(a) * 26, cakeSpot.y + lerp(8, 18, ease(k)), cakeSpot.z + Math.cos(a) * 26), V(0, cakeSpot.y + 7, cakeSpot.z), 50);
        world.bloom.strength = .6; break; }
      case 'twist': { const buzz = clamp((u - .8) / .2); const red = new THREE.Color(0xff3050);
        crowd.forEach(({ p, ph }) => { p.userData.phone.material.emissive.lerpColors(new THREE.Color(PAL.gold), red, buzz); p.userData.phone.material.emissiveIntensity = 2.5 + 2.5 * Math.abs(Math.sin(t * 22 + ph)) * buzz; p.position.x += Math.sin(t * 60 + ph) * .05 * buzz; });
        crystal.material.emissive.lerpColors(new THREE.Color(PAL.magic), red, buzz); crystalHalo.material.color.copy(crystal.material.emissive); crystalLight.color.copy(crystal.material.emissive); redL.intensity = 900 * buzz;
        const cardIn = clamp((u - 2.2) / .45); notify = cardIn;
        const shake = buzz * (1 - clamp((u - 1.4) / 1)) * .4; const p = V(lerp(2, 0, ease(k)) + Math.sin(t * 50) * shake, lerp(10, 16, ease(k)), lerp(62, 42, ease(k))); cam(p, V(0, lerp(12, topY - 7, ease(k)), 0), 55);
        world.bloom.strength = .9; break; }
    }
    return { title: script.title, titleA: si === 0 ? clamp(u / .3) * clamp((S.end - u - S.start) / .4 + 0, 0, 1) : 0, notify, counter: S.name === 'career' ? Math.min(150, Math.floor(1 + 149 * clamp(k * 1.15))) : null };
  };
}
