// whatif-004 — "What if the Moon vanished?" Style: lowpolyMagic. An ORIGINAL blocky wizard sneezes the Moon away;
// every consequence is real, sourced science (script.json facts). Pure function of t, one case per shot.
import { THREE, P, rng, mat, glowMat, box, halo, tree, house, person, sparkles, PAL, clamp, lerp, ease, easeOut } from '../world.js';

export function build(world, { script, timing }) {
  const { scene, camera, skyU, sun, hemi, water, flat } = world;
  const V = (x, y, z) => new THREE.Vector3(x, y, z), look = new THREE.Vector3();
  const cam = (p, l, fov = 55) => { camera.position.copy(p); look.copy(l); camera.lookAt(look); if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); } };
  const r = rng(404);

  // ---------- the island village at night ----------
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28 + .4, d = 16 + r() * 8, x = Math.cos(a) * d, z = Math.sin(a) * d; if (z > 4 && x > -6) continue; const h = house(r); h.position.set(x, flat(x, z) + .5, z); h.rotation.y = -a; scene.add(h); }
  for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = 26 + r() * 14, x = Math.cos(a) * d, z = Math.sin(a) * d; if (flat(x, z) < 1) continue; const t = tree(r); t.position.set(x, flat(x, z) + .5, z); scene.add(t); }
  const wiz = person(rng(4), { noPhone: true, shirt: 0x7c5cff, hair: 0xeeeeee }); wiz.scale.setScalar(2); wiz.position.set(0, flat(0, 6) + .5, 6); scene.add(wiz);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 6), mat(0x3a2a8a, { tex: 'none' })); hat.position.set(0, 4.5, 0); wiz.add(hat);
  wiz.add(P(box(1.6, .2, 1.6, 0x3a2a8a, { tex: 'none' }), 0, 3.4, 0), P(box(.9, .7, .3, 0xeeeeee, { tex: 'none' }), 0, 2.35, .5));
  const wand = P(box(.15, 1.8, .15, PAL.trunk), .9, 2.4, .9); wand.rotation.x = -.8; wiz.add(wand); const wandTip = P(new THREE.Mesh(new THREE.OctahedronGeometry(.3, 0), glowMat(PAL.magic, 1.8)), .9, 3.1, 1.5); wiz.add(wandTip);
  const sneeze = sparkles(120, 9, 0xffe7b0, .9, [10, 10, 10]); sneeze.position.set(0, 4, 10); scene.add(sneeze);

  // ---------- the Moon (sky prop over the island) ----------
  const moonMat = new THREE.MeshStandardMaterial({ color: 0xd8d2e8, emissive: 0x8a84a8, emissiveIntensity: .55, flatShading: true, roughness: 1 });
  const mkMoon = (R) => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(R, 1), moonMat)); const cr = rng(77);
    for (let i = 0; i < 9; i++) { const d = V(cr() - .5, cr() - .5, .6 + cr()).normalize(); const c = new THREE.Mesh(new THREE.CylinderGeometry(R * (.12 + cr() * .1), R * .1, R * .08, 7), mat(0x9a94b4, { tex: 'none' })); c.position.copy(d.multiplyScalar(R * .97)); c.quaternion.setFromUnitVectors(V(0, 1, 0), c.position.clone().normalize()); g.add(c); }
    return g; };
  const MOONP = V(-40, 120, -160); const skyMoon = mkMoon(26); skyMoon.position.copy(MOONP); scene.add(skyMoon);
  const moonGlow = halo(0xcfc8ff, 120, .35); moonGlow.material.fog = false; moonGlow.position.copy(MOONP); scene.add(moonGlow);
  const poof = halo(PAL.gold, 30, .9); poof.material.fog = false; poof.position.copy(MOONP); scene.add(poof);
  const dust = sparkles(160, 21, 0xfff4d6, 2.2, [70, 70, 70]); dust.position.copy(MOONP).add(V(0, -35, 0)); dust.material.fog = false; scene.add(dust);

  // ---------- space stage: Earth, its tidal bulge, the Moon, the Sun ----------
  const S = V(0, 600, 0), ER = 30; const earth = new THREE.Group(); earth.position.copy(S); scene.add(earth);
  { const geo = new THREE.IcosahedronGeometry(ER, 3), pos = geo.attributes.position, v = new THREE.Vector3(), cols = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let f = 0; f < pos.count; f += 3) { v.fromBufferAttribute(pos, f); const n = Math.sin(v.x * .13 + 1.3) * Math.sin(v.y * .15 + .4) + Math.sin(v.z * .11 + 2.1) * .8;
      c.set(Math.abs(v.y) > ER * .86 ? 0xe8eef8 : n > .45 ? (f % 9 ? 0x5cc05a : 0xf2cf86) : 0x2fa6e0); for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (f + k) * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); earth.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .9 }))); }
  const bulge = new THREE.Mesh(new THREE.IcosahedronGeometry(ER + .2, 3), new THREE.MeshStandardMaterial({ color: 0x46c8f0, transparent: true, opacity: .55, flatShading: true, emissive: 0x0b4a7a, emissiveIntensity: .5 })); earth.add(bulge);
  const atmo = halo(PAL.magic, ER * 2.9, .2); atmo.material.fog = false; earth.add(atmo);
  const sMoon = mkMoon(8); scene.add(sMoon); const faceMark = new THREE.Group(); sMoon.add(faceMark);
  for (const [x, y] of [[-2.6, 2], [2.6, 2]]) faceMark.add(P(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, .6), glowMat(PAL.gold, 1.4)), x, y, 7.6));
  { const sm = new THREE.Mesh(new THREE.BoxGeometry(5, 1, .6), glowMat(PAL.gold, 1.4)); sm.position.set(0, -2.4, 7.6); faceMark.add(sm); }
  const sunBall = new THREE.Mesh(new THREE.IcosahedronGeometry(34, 2), glowMat(0xffb040, 1.2)); scene.add(sunBall); const sunGlow = halo(0xffb040, 140, .35); sunGlow.material.fog = false; scene.add(sunGlow);
  const corona = halo(0xfff0c0, 100, .6); corona.material.fog = false; scene.add(corona);
  const arrow = new THREE.Group(); arrow.add(P(box(30, 2, 2, glowMat(PAL.magic, 1.5)), 0, 0, 0)); const head = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 4), glowMat(PAL.magic, 1.5)); head.rotation.z = -Math.PI / 2; head.position.x = 18; arrow.add(head); scene.add(arrow);

  // ---------- timeline ----------
  const L = timing.lines, shots = script.lines.map((l, i) => ({ name: l.shot, start: i ? L[i].start - .12 : 0, end: i < L.length - 1 ? L[i + 1].start - .12 : timing.duration }));
  const C3 = a => a.map(c => new THREE.Color(c)); const skyNight = C3([0x0b0726, 0x2a1a5a, 0x6b3d8a]), skyDark = C3([0x02010a, 0x080420, 0x1a1036]), skySpace = C3([0x04020c, 0x0b0722, 0x1c0f3a]);
  const setSky = (a, b = a, m = 0) => ['top', 'mid', 'low'].forEach((k, i) => skyU[k].value.copy(a[i]).lerp(b[i], m));
  const wizCam = (k) => { const w = wiz.position; cam(V(w.x + lerp(12, 10, k), w.y + 4, w.z + lerp(26, 23, k)), V(-24, 50, -100), 58); };

  return function update(t) {
    let si = shots.findIndex(s => t < s.end); if (si < 0) si = shots.length - 1; const S_ = shots[si]; const u = t - S_.start, k = clamp(u / (S_.end - S_.start));
    setSky(skyNight); skyU.sunCol.value.set(0x302050); scene.fog.color.set(0x3a2a6a); scene.fog.near = 90; scene.fog.far = 420; sun.position.set(-60, 80, -120); sun.color.set(0xb9b0ff); sun.intensity = 1.6; hemi.intensity = .8; world.bloom.strength = .7;
    const space = ['tides', 'small', 'eclipse', 'face'].includes(S_.name);
    if (space) { setSky(skySpace); scene.fog.near = 5000; scene.fog.far = 6000; sun.position.set(300, 40, 0); sun.color.set(0xffe0b0); sun.intensity = 3; hemi.intensity = .5; }
    const moonOn = ['hook', 'back', 'end'].includes(S_.name) || (S_.name === 'poof' && u < .4); skyMoon.visible = moonOn; moonGlow.visible = moonOn;
    skyMoon.rotation.y = t * .05; poof.visible = false; dust.visible = false; sneeze.visible = false; dust.userData.update(t); sneeze.userData.update(t);
    wiz.rotation.set(0, Math.PI + .5, 0); wiz.userData.head.rotation.x = 0; wandTip.material.emissiveIntensity = 1.8; wiz.visible = !space;
    earth.rotation.y = t * .1; bulge.scale.set(1, 1, 1); sMoon.scale.setScalar(1); sMoon.visible = false; sunBall.visible = sunGlow.visible = corona.visible = false; arrow.visible = false; faceMark.visible = false;
    let notify = 0, notifyText = null;

    switch (S_.name) {
      case 'hook': { const sn = clamp((u - 1.4) / .3); wiz.userData.head.rotation.x = u < 1.4 ? -.25 * clamp(u / 1.2) : lerp(-.25, .45, sn); sneeze.visible = u > 1.45; wizCam(k); break; }
      case 'poof': { poof.visible = u < 1.6; const p = clamp(u / 1.4); poof.scale.setScalar(40 + 200 * p); poof.material.opacity = .9 * (1 - p); dust.visible = true; dust.material.opacity = .9 * (1 - clamp(u / 3));
        cam(V(lerp(0, 4, k), flat(0, 30) + 6, 30), V(-40, 110, -160), 55); break; }
      case 'tides': { sMoon.visible = true; sMoon.position.copy(S).add(V(0, 0, -110)); const b = ease(clamp(u / 1.5)); bulge.scale.set(1, 1, 1 + .22 * b); bulge.lookAt(sMoon.position);
        cam(V(S.x + lerp(240, 215, k), S.y + 50, S.z - 40), V(S.x, S.y, S.z - 40), 50); break; }
      case 'small': { sunBall.visible = sunGlow.visible = true; sunBall.position.copy(S).add(V(260, 20, 0)); sunGlow.position.copy(sunBall.position); const b = lerp(.22, .09, ease(clamp(u / 2)));
        bulge.scale.set(1, 1, 1 + b); bulge.lookAt(sunBall.position); cam(V(S.x + 20, S.y + 60, S.z + lerp(230, 210, k)), V(S.x + 40, S.y, S.z), 52); break; }
      case 'night': { setSky(skyNight, skyDark, ease(clamp(u / 1.5))); sun.intensity = lerp(1.6, .35, ease(clamp(u / 1.5))); hemi.intensity = lerp(.8, .35, ease(clamp(u / 1.5)));
        wiz.rotation.y = Math.PI; wandTip.material.emissiveIntensity = 2.2; cam(V(-8, wiz.position.y + 5, 26), V(0, wiz.position.y + 9, 0), 58); break; }
      case 'eclipse': { const SP = S.clone().add(V(0, 0, -420)); sunBall.visible = corona.visible = true; sunBall.position.copy(SP); corona.position.copy(SP); earth.visible = true;
        const gone = clamp((u - 1.8) / .6); sMoon.visible = gone < 1; sMoon.scale.setScalar(1 - gone); sMoon.position.copy(S).lerp(SP, .32).add(V(lerp(30, 0, ease(clamp(u / 1.6))), 0, 0));
        sMoon.scale.multiplyScalar(1.7); corona.material.opacity = .6; sunGlow.visible = gone > 0; sunGlow.position.copy(SP); cam(V(S.x, S.y + 4, S.z - 34), SP, 30); break; }
      case 'face': { sMoon.visible = true; faceMark.visible = true; const a = t * .5; sMoon.position.copy(S).add(V(Math.sin(a) * 90, 0, Math.cos(a) * 90)); sMoon.lookAt(S);
        cam(V(S.x + Math.sin(a) * 36, S.y + 6, S.z + Math.cos(a) * 36), sMoon.position, 40); break; }
      case 'back': { const ap = easeOut(clamp(u / 1.2)); skyMoon.scale.setScalar(Math.max(.01, ap)); moonGlow.material.opacity = .35 * ap; wiz.rotation.y = Math.PI + .3; wand.rotation.x = -.8 - .6 * Math.sin(Math.PI * clamp(u / 1));
        arrow.visible = u > 2; arrow.position.copy(MOONP).add(V(50 + Math.sin(u * 3) * 3, 0, 0)); skyMoon.position.copy(MOONP).add(V(clamp((u - 2) / 4) * 6, 0, 0)); moonGlow.position.copy(skyMoon.position);
        cam(V(14, wiz.position.y + 5, 26), V(-30, 70, -120), 55); break; }
      case 'end': { skyMoon.scale.setScalar(1); skyMoon.position.copy(MOONP).add(V(6, 0, 0)); moonGlow.position.copy(skyMoon.position); moonGlow.material.opacity = .35;
        notify = clamp((u - 1) / .45); notifyText = ['THE MOON   ·   now', 'Leaving you, slowly', '~1 inch a year. Enjoy the view.'];
        cam(V(lerp(10, 22, k), wiz.position.y + lerp(5, 9, k), lerp(24, 34, k)), V(-20, 50, -100), 55); break; }
    }
    if (S_.name !== 'back' && S_.name !== 'end') { skyMoon.scale.setScalar(1); skyMoon.position.copy(MOONP); moonGlow.position.copy(MOONP); moonGlow.material.opacity = .35; wand.rotation.x = -.8; }
    if (S_.name === 'poof') { skyMoon.scale.setScalar(Math.max(.01, 1 - u / .4)); }
    return { title: script.title, titleA: si === 0 ? clamp((u - .3) / .3) * clamp((S_.end - S_.start - u) / .4) : 0, notify, notifyText };
  };
}
