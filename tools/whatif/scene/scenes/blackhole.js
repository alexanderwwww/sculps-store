// whatif-005 — "What if you fell into a black hole?" Style: lowpolyMagic. An ORIGINAL blocky astronaut falls into a
// stellar-mass black hole; every step is real, sourced science (script.json facts). Pure function of t, one case per shot.
import { THREE, P, rng, mat, glowMat, box, halo, person, sparkles, PAL, clamp, lerp, ease, easeOut } from '../world.js';

export function build(world, { script, timing }) {
  const { scene, camera, skyU, sun, hemi, water } = world;
  world.island.visible = false; water.visible = false;
  const V = (x, y, z) => new THREE.Vector3(x, y, z), look = new THREE.Vector3();
  const cam = (p, l, fov = 55) => { camera.position.copy(p); look.copy(l); camera.lookAt(look); if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); } };
  const S = V(0, 600, 0), BR = 14;

  // the hole: a black ball, a photon ring, a tilted accretion disk of glowing blocks
  const hole = new THREE.Mesh(new THREE.IcosahedronGeometry(BR, 3), new THREE.MeshBasicMaterial({ color: 0x000000 })); hole.position.copy(S); scene.add(hole);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(BR * 1.25, .8, 6, 40), glowMat(0xffd27a, 1.8)); scene.add(ring);
  const disk = new THREE.Group(); disk.position.copy(S); disk.rotation.x = .32; scene.add(disk); const r = rng(55);
  const dcols = [0xffc23d, 0xff9a5a, 0xff6f91, 0xfff0c0];
  for (let i = 0; i < 420; i++) { const a = r() * 6.28, d = BR * 1.6 + Math.pow(r(), 1.6) * BR * 3.2, s = .8 + r() * 1.6;
    const b = new THREE.Mesh(new THREE.BoxGeometry(s * 1.8, s * .5, s), glowMat(dcols[i % 4], d < BR * 2.6 ? 1.6 : 1.1)); b.position.set(Math.cos(a) * d, (r() - .5) * 1.2, Math.sin(a) * d); b.rotation.y = -a; b.userData.w = 1 / Math.pow(d / BR, 1.5); disk.add(b); }
  const diskGlow = halo(0xff9a5a, BR * 9, .3); diskGlow.material.fog = false; diskGlow.position.copy(S); scene.add(diskGlow);
  const lens = new THREE.Mesh(new THREE.TorusGeometry(BR * 1.9, 1.4, 6, 40), glowMat(0xff9a5a, 1.2)); scene.add(lens); // the far side of the disk, bent over the top

  // the star that collapses into it
  const star = new THREE.Mesh(new THREE.IcosahedronGeometry(60, 2), glowMat(0xff8a3d, 1.3)); star.position.copy(S); scene.add(star);
  const starGlow = halo(0xffa040, 260, .5); starGlow.material.fog = false; starGlow.position.copy(S); scene.add(starGlow);
  const nova = halo(0xfff0c0, 40, .9); nova.material.fog = false; nova.position.copy(S); scene.add(nova);

  // the astronaut (original): white suit, gold visor, a little mint backpack light
  const astro = person(rng(3), { noPhone: true, shirt: 0xf2eefa, skin: 0xf2eefa, hair: 0xf2eefa }); astro.scale.setScalar(2.4); scene.add(astro);
  const visor = P(box(.8, .5, .1, glowMat(PAL.gold, 1.2)), 0, 2.85, .5); astro.add(visor); astro.add(P(box(.9, 1.1, .5, 0x8a84a8), 0, 1.7, -.6), P(new THREE.Mesh(new THREE.OctahedronGeometry(.2, 0), glowMat(PAL.magic, 1.8)), 0, 2.4, -.9));
  const trail = sparkles(90, 12, 0x7ff5e0, 1.4, [6, 30, 6]); scene.add(trail);
  // light falling in: points spiralling to the centre
  const NL = 160, lpos = new Float32Array(NL * 3), lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
  const lightIn = new THREE.Points(lg, new THREE.PointsMaterial({ color: 0xfff0c0, size: 2.4, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })); scene.add(lightIn); const lj = [...Array(NL)].map(() => [r(), r() * 6.28, (r() - .5) * .6]);
  const q = new THREE.Mesh(new THREE.TorusGeometry(BR * 1.1, .5, 4, 30), glowMat(PAL.magic, 1.4)); q.position.copy(S); scene.add(q);

  // ---------- timeline ----------
  const L = timing.lines, shots = script.lines.map((l, i) => ({ name: l.shot, start: i ? L[i].start - .12 : 0, end: i < L.length - 1 ? L[i + 1].start - .12 : timing.duration }));
  const sp = [0x04020c, 0x0b0722, 0x1c0f3a].map(c => new THREE.Color(c));
  const astroAt = (d, a, y = 0) => { astro.position.copy(S).add(V(Math.sin(a) * d, y, Math.cos(a) * d)); astro.rotation.set(0, a + Math.PI, 0); };

  return function update(t) {
    let si = shots.findIndex(s => t < s.end); if (si < 0) si = shots.length - 1; const S_ = shots[si]; const u = t - S_.start, k = clamp(u / (S_.end - S_.start));
    ['top', 'mid', 'low'].forEach((n, i) => skyU[n].value.copy(sp[i])); skyU.sunCol.value.set(0x201030); scene.fog.near = 5000; scene.fog.far = 6000;
    sun.position.set(S.x + 80, S.y + 60, S.z + 120); sun.color.set(0xffd0a0); sun.intensity = 2.4; hemi.intensity = .7; world.bloom.strength = .75;
    disk.children.forEach(b => { const a = Math.atan2(b.position.z, b.position.x) + 0; }); disk.rotation.y = t * .5;
    ring.position.copy(S); ring.quaternion.copy(camera.quaternion); lens.position.copy(S); lens.quaternion.copy(camera.quaternion); lens.scale.set(1, .55, 1);
    const holeOn = S_.name !== 'star' || u > 2.2; hole.visible = disk.visible = ring.visible = lens.visible = diskGlow.visible = holeOn;
    star.visible = starGlow.visible = nova.visible = false; astro.visible = true; astro.scale.set(2.4, 2.4, 2.4); trail.visible = false; lightIn.visible = false; q.visible = false; visor.material.emissiveIntensity = 1.2;
    trail.userData.update(t); let notify = 0, notifyText = null;
    switch (S_.name) {
      case 'hook': { astroAt(lerp(120, 100, k), .5, 10); astro.rotation.z = Math.sin(u * 1.5) * .3; trail.visible = true; trail.position.copy(astro.position).add(V(0, -30, 0));
        cam(astro.position.clone().add(V(10, 6, 18)), S.clone().lerp(astro.position, .7), 55); break; }
      case 'star': { astro.visible = false; const c = ease(clamp(u / 2.2)); star.visible = c < 1; star.scale.setScalar(Math.max(.02, 1 - c)); starGlow.visible = c < 1; starGlow.material.opacity = .5 * (1 - c);
        nova.visible = u > 1.9 && u < 3.6; const nv = clamp((u - 1.9) / 1.7); nova.scale.setScalar(40 + 420 * nv); nova.material.opacity = .9 * (1 - nv);
        cam(S.clone().add(V(0, 40, lerp(320, 260, k))), S, 50); break; }
      case 'disk': { astroAt(110, .8, 14); astro.visible = false; const a = .3 + k * .8; cam(S.clone().add(V(Math.sin(a) * 120, 34, Math.cos(a) * 120)), S, 50); world.bloom.strength = .85; break; }
      case 'bend': { astro.visible = false; lens.scale.set(1, lerp(.35, .7, ease(k)), 1); cam(S.clone().add(V(0, 14, lerp(120, 95, k))), S, 50); world.bloom.strength = .9; break; }
      case 'noodle': { const st = ease(k); astroAt(lerp(58, 40, k), .2, 0); astro.rotation.set(-Math.PI / 2, .2 + Math.PI, 0); astro.scale.set(2.4 * lerp(1, .45, st), 2.4 * lerp(1, 3.6, st), 2.4 * lerp(1, .45, st));
        cam(astro.position.clone().add(V(28, 8, 16)), astro.position.clone().lerp(S, .35), 55); break; }
      case 'horizon': { astroAt(lerp(36, 18, ease(k)), .2, 0); astro.rotation.set(-Math.PI / 2, .2 + Math.PI, 0); astro.scale.set(1, 9, 1); visor.material.emissiveIntensity = lerp(1.2, .2, k);
        cam(S.clone().add(V(40, 18, 70)), S, 50); break; }
      case 'trapped': { astro.visible = false; lightIn.visible = true; for (let i = 0; i < NL; i++) { const [o, a0, y] = lj[i], f = (o + t * .5) % 1, d = lerp(BR * 6, BR * .6, f), a = a0 + f * 4; lpos.set([S.x + Math.cos(a) * d, S.y + y * d * .4, S.z + Math.sin(a) * d], i * 3); } lg.attributes.position.needsUpdate = true;
        cam(S.clone().add(V(0, 70, 120)), S, 52); break; }
      case 'secret': { astro.visible = false; q.visible = true; q.quaternion.copy(camera.quaternion); q.scale.setScalar(1 + .05 * Math.sin(u * 4)); cam(S.clone().add(V(-20, 10, lerp(80, 60, k))), S, 50); break; }
      case 'twist': { astro.visible = false; notify = clamp((u - .8) / .45); notifyText = ['BLACK HOLE   ·   now', 'Search history received', 'Nothing gets out. Ever.']; cam(S.clone().add(V(lerp(-30, 30, k), 20, 110)), S, 52); break; }
    }
    return { title: script.title, titleA: si === 0 ? clamp((u - .3) / .3) * clamp((S_.end - S_.start - u) / .4) : 0, notify, notifyText };
  };
}
