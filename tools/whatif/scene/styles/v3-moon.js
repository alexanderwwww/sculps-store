// WHAT IF — "the Moon vanished", re-made in style v3 (candidate A, golden hour, + a night grade for the night lines).
// Same sourced script and voice as whatif-004. build(S) gets the v3 study (v3-core createStudy) and returns update(t).
import { THREE, glow, mesh, lerp, clamp, rng, BLOOM } from './v3-core.js';
const sm = (a, b, t) => { const x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const eo = x => 1 - Math.pow(1 - clamp(x), 3);
const V = (...a) => new THREE.Vector3(...a);

function moonTex() { const N = 1024, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), r = rng(42);
  g.fillStyle = '#d9d4cc'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 14; i++) { g.fillStyle = r() > .5 ? '#9a96a4' : '#aaa6b0'; g.beginPath(); g.ellipse(r() * N, N * .25 + r() * N * .5, 60 + r() * 140, 40 + r() * 90, r() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 160; i++) { const x = r() * N, y = r() * N, s = 5 + r() * (i < 12 ? 50 : 18);
    g.fillStyle = '#8a8694'; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); g.strokeStyle = '#f4f0ea'; g.lineWidth = Math.max(2, s * .22); g.beginPath(); g.arc(x, y, s, 2.2, 5.6); g.stroke();
    g.strokeStyle = '#6a6674'; g.beginPath(); g.arc(x, y, s * .9, 5.8, 2.0); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function waterTex() { const N = 512, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), r = rng(9);
  g.fillStyle = '#1fa6c8'; g.fillRect(0, 0, N, N); for (let i = 0; i < 120; i++) { g.fillStyle = r() > .5 ? '#2ab8d8' : '#1890b8'; g.beginPath(); g.ellipse(r() * N, r() * N, 30 + r() * 50, 8 + r() * 10, 0, 0, 7); g.fill(); }
  g.lineCap = 'round'; for (let i = 0; i < 90; i++) { const x = r() * N, y = r() * N, l = 14 + r() * 26; g.strokeStyle = r() > .4 ? '#d8fbff' : '#7ae6f4'; g.lineWidth = 3 + r() * 2;
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) { g.beginPath(); g.moveTo(x + dx - l, y + dy); g.quadraticCurveTo(x + dx, y + dy - 7, x + dx + l, y + dy); g.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 60); t.anisotropy = 8; return t; }

export function build(S, { timing }) {
  const { scene, lights, sky } = S, U = sky.material.uniforms, L = timing.lines.map(l => l.start).concat([timing.duration]);
  // ---- props ----
  const MOON = V(-2, 24, -30), mt = moonTex();
  const moon = mesh(new THREE.SphereGeometry(5.5, 40, 24), new THREE.MeshStandardMaterial({ map: mt, emissiveMap: mt, emissive: 0xfff4e0, emissiveIntensity: .32, roughness: 1, fog: false }), false);
  moon.position.copy(MOON); scene.add(moon);
  const SUN = V(14, 9, 10).normalize().multiplyScalar(160); const sun = mesh(new THREE.SphereGeometry(6.5, 24, 16), glow(0xffb84a, 0.55), false); sun.material.fog = false; sun.position.copy(SUN); scene.add(sun);
  const ghost = mesh(new THREE.SphereGeometry(6.7, 24, 16), new THREE.MeshBasicMaterial({ color: 0x0a0612, transparent: true, fog: false, depthWrite: false }), false); scene.add(ghost);
  const ring = mesh(new THREE.TorusGeometry(1, .08, 8, 64), glow(0xbffcff, 4), false); ring.material.transparent = true; scene.add(ring);
  const shards = [...Array(16)].map((_, i) => { const m = mesh(new THREE.OctahedronGeometry(.6, 0), glow(i % 2 ? 0xffe9a0 : 0x8ff6ff, 3), false); scene.add(m); return m; });
  const water = mesh(new THREE.PlaneGeometry(600, 600, 1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: waterTex(), roughness: .22, metalness: .05, color: 0xffffff, envMapIntensity: 1 }), false); scene.add(water);
  const foam = mesh(new THREE.TorusGeometry(6.4, .18, 6, 72).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xeaffff, roughness: .6 }), false); scene.add(foam);
  const beam = mesh(new THREE.CylinderGeometry(.08, .2, 1, 10, 1, true), glow(0x8ff6ff, 1.8), false); beam.material.transparent = true; scene.add(beam);
  const mini = mesh(new THREE.SphereGeometry(1.1, 32, 20), new THREE.MeshStandardMaterial({ map: mt, roughness: 1, emissiveMap: mt, emissive: 0xffffff, emissiveIntensity: .25 }), false); scene.add(mini);
  const mark = mesh(new THREE.TorusGeometry(.32, .07, 6, 24), glow(0xffc23d, 3), false); mini.add(mark); mark.position.set(0, 0, 1.08);
  const tail = mesh(new THREE.TorusGeometry(8, .03, 4, 120).rotateX(Math.PI / 2), glow(0x8ff6ff, 1.2), false); scene.add(tail);
  // ---- day / night: interpolate the whole light rig ----
  const DAY = { key: new THREE.Color(lights.key.color), keyI: lights.key.intensity, rim: new THREE.Color(lights.rim.color), rimI: lights.rim.intensity, hemiI: lights.hemi.intensity, top: U.top.value.clone(), mid: U.mid.value.clone(), low: U.low.value.clone(), sunK: U.sunK.value, fog: S.fog.color.clone(), exp: S.renderer.toneMappingExposure, keyPos: lights.key.position.clone() };
  const NIGHT = { key: new THREE.Color(0x9ab4ff), keyI: 1.35, rim: new THREE.Color(0x8af0ff), rimI: 3.6, hemiI: .38, top: new THREE.Color(0x040820), mid: new THREE.Color(0x101c50), low: new THREE.Color(0x30306e), sunK: 0, fog: new THREE.Color(0x141c48), exp: 1.12, keyPos: V(-12, 14, -6) };
  const night = t => t < L[4] - .2 ? 0 : t < L[5] - .05 ? sm(L[4] - .2, L[4] + 1.1, t) : t < L[6] ? 0 : t < L[7] ? .55 : 1;
  function setNight(n) { lights.key.color.copy(DAY.key).lerp(NIGHT.key, n); lights.key.intensity = lerp(DAY.keyI, NIGHT.keyI, n); lights.key.position.copy(DAY.keyPos).lerp(NIGHT.keyPos, n);
    lights.rim.color.copy(DAY.rim).lerp(NIGHT.rim, n); lights.rim.intensity = lerp(DAY.rimI, NIGHT.rimI, n); lights.hemi.intensity = lerp(DAY.hemiI, NIGHT.hemiI, n);
    U.top.value.copy(DAY.top).lerp(NIGHT.top, n); U.mid.value.copy(DAY.mid).lerp(NIGHT.mid, n); U.low.value.copy(DAY.low).lerp(NIGHT.low, n); U.sunK.value = lerp(DAY.sunK, 0, n);
    S.fog.color.copy(DAY.fog).lerp(NIGHT.fog, n); S.renderer.toneMappingExposure = lerp(DAY.exp, NIGHT.exp, n); scene.environmentIntensity = lerp(1, .35, n); sky.userData.stars.material.opacity = sm(.3, 1, n); sun.visible = n < .5; }
  const H0 = { x: .2, z: .6, ry: -.25 };
  const sneeze = t => t < .35 ? 0 : t < .72 ? -.6 * sm(.35, .72, t) : t < .95 ? lerp(-.6, 1, sm(.72, .8, t)) : 1 - sm(.95, 1.6, t);
  const shake = t => { const k = Math.max(0, 1 - Math.abs(t - .82) / .3); return k * .08; };
  const moonGone = t => t >= L[1] - .05 && t < L[7] + 1.0;   // vanishes at "Poof", back when the wizard puts it back
  // ---- shots: [start, end, fn(u, t) -> cam] (two cuts per line: fast pacing) ----
  const C = (pos, look, fov, hero = H0) => ({ pos, look, fov, hero });
  const shots = [
    [0, 1.75, (u, t) => { const s = shake(t); return C([1.6 - u * .5 + s, .8 + u * .2, 6.8 - u * 1.2], [-.6, 4.6 + s * 3, -5], 52, { ...H0, lookUp: .9 * (1 - Math.max(0, sneeze(t))), sneeze: sneeze(t), ry: -.45 }); }],
    [1.75, L[1], (u, t) => C([.6 - u * .3, 1.5, 3.4], [MOON.x * .5, MOON.y * .5, MOON.z * .5], 30 - u * 6, { ...H0, lookUp: 1, ry: -.5 })],
    [L[1], 5.0, (u, t) => C([.6, 1.4, 3.4 + u * .6], [MOON.x * .5, MOON.y * .5, MOON.z * .5], 26 + u * 8, { ...H0, lookUp: 1, ry: -.5 })],
    [5.0, L[2], (u, t) => C([-.9 + u * .3, 2.0, 2.9 - u * .3], [.2, 2.05, .6], 30, { ...H0, lookUp: .5 + .3 * Math.sin(t * 3), ry: -.15 + .25 * Math.sin(t * 1.7), shrug: sm(5.6, 6.2, t) * (1 - sm(6.6, 7, t)) })],
    [L[2], 9.6, (u, t) => C([16 - u * 3, 10 - u * 2, 18 - u * 2], [0, -1, 0], 42)],
    [9.6, L[3], (u, t) => C([8.5 - u * .8, 1.6, 7 + u * .6], [2, -1.6, 0], 44)],
    [L[3], 14.8, (u, t) => C([-2.5 - u * .4, 2.2, -1.2 - u * .4], [6, 4.5, 5], 44, { ...H0, ry: .9, lookUp: .4 })],
    [14.8, L[4], (u, t) => { const a = .6 + u * .9; return C([Math.cos(a) * 15, 5, Math.sin(a) * 15], [0, -.5, 0], 40); }],
    [L[4], L[5], (u, t) => { const a = -.1 + u * .5; return C([.2 + Math.sin(a) * 3.6, 1.0, .6 + Math.cos(a) * 3.6], [.2, 2.0, .6], 40, { ...H0, ry: a * .6, cast: .55 * sm(L[4] + .2, L[4] + 1, t), lookUp: .3 }); }],
    [L[5], 23.3, (u, t) => C([-2, 2.5, 4], [SUN.x * .22, SUN.y * .22 - 2.5, SUN.z * .22], 34 + u * 5)],
    [23.3, L[6], (u, t) => C([.6 + u * .4, 1.6, 4.6 - u * .6], [.2, 1.6, .6], 36, { ...H0, ry: -.1, shrug: sm(23.6, 24.2, t) * (1 - sm(25.2, 25.8, t)) })],
    [L[6], 28.2, (u, t) => C([0, 22 - u * 3, 14 - u * 2], [0, 1, 0], 44)],
    [28.2, L[7], (u, t) => { const a = 2.2 + u * .5; return C([Math.cos(a) * 15, 7, Math.sin(a) * 15], [0, 3, 0], 46); }],
    [L[7], 32.6, (u, t) => C([2.2 - u * .6, .55, 4.4 - u * .6], [-.6, 3.0 + u * 1.5, -2], 46, { ...H0, ry: -.5, cast: sm(L[7], L[7] + .5, t), lookUp: .9 })],
    [32.6, L[8], (u, t) => C([0, 3, 4 - u * 2], [MOON.x * .5, MOON.y * .5 + 1, MOON.z * .5], 30 - u * 4)],
    [L[8], 38.3, (u, t) => { const z = -1.6 + u * 2.2, x = -1.15 + u * 1.3; return C([1.6 - u * .3, 1.7, 5.6 - u * .4], [x * .8, 1.5, z], 36, { x, z, ry: .38 - u * .2, walk: 1, look: 0, t }); }],
    [38.3, L[9] + 1, (u, t) => { const e = eo(u); return C([.2 + e * .8, 1.8 + e * 3.5, 3.8 + e * 2], [lerp(.4, MOON.x * .45, e), lerp(1.6, 9, e), lerp(.9, -14, e)], 40, { x: .15, z: .6, ry: -.3, lookUp: sm(38.4, 39.2, t) }); }],
  ];
  return t => {
    const si = shots.findIndex(s => t >= s[0] && t < s[1]), [a, b, f] = shots[si < 0 ? shots.length - 1 : si], u = clamp((t - a) / (b - a)), cam = f(u, t);
    setNight(night(t)); S.hero.userData.J.magicLight.intensity = lerp(2.5, 7, night(t));
    // moon: vanish with a ring + shards at "Poof"; returns, then drifts away (line 7)
    const back = t >= L[7] + 1.0 ? eo((t - L[7] - 1.0) / .5) : 0, drift = t >= L[7] + 1.0 ? Math.min(1, (t - L[7] - 1.0) / 3.6) : 0;
    const pre = t < L[1] ? 1 + .04 * Math.sin(t * 30) * sm(1.8, 3, t) : 0; moon.visible = !moonGone(t) || (t >= L[7] + 1.0 && t < L[6] + 99);
    moon.scale.setScalar(t < L[1] ? pre : (back * (1 + .15 * Math.sin(clamp((t - L[7] - 1) / .5) * Math.PI)))); moon.position.copy(MOON).multiplyScalar(1 + drift * .35); moon.rotation.y = t * .02;
    if (t >= L[6] && t < L[7]) moon.visible = false;
    const pp = t - L[1] + .05; ring.visible = pp > 0 && pp < 1.4; if (ring.visible) { ring.position.copy(MOON); ring.lookAt(...cam.pos); ring.scale.setScalar(2 + eo(pp / 1.2) * 14); ring.material.opacity = 1 - pp / 1.4; }
    shards.forEach((s, i) => { s.visible = pp > 0 && pp < 1.6; if (!s.visible) return; const r = rng(i * 7 + 1), d = V(r() - .5, r() - .5, r() - .5).normalize(); s.position.copy(MOON).addScaledVector(d, eo(pp / 1.5) * 16); s.rotation.set(t * 3 + i, t * 2, 0); s.scale.setScalar(1 - pp / 1.6); });
    // eclipse that never happens: the dark disc slides toward the sun and dissolves before it covers it
    const ec = clamp((t - L[5]) / 2.7); ghost.visible = t >= L[5] && t < 23.3; ghost.position.copy(SUN).add(V(-30 + ec * 22, 6 - ec * 4, 0).applyAxisAngle(V(0, 1, 0), Math.atan2(SUN.x, SUN.z))); ghost.material.opacity = 1 * (1 - sm(.62, .98, ec)); ghost.lookAt(0, 0, 0);
    // tides: high bulge -> collapses when the Moon is gone; the Sun alone gives a smaller tide
    const sea = t < L[2] + .3 ? -.7 : t < L[3] ? lerp(-.7, -2.0, sm(L[2] + .3, L[3] - .5, t)) : t < L[4] ? -1.7 + .3 * Math.sin((t - L[3]) * 2.2) : -1.6;
    water.position.y = sea; water.material.map.offset.set(t * .004, t * .007); foam.position.y = sea + .05; foam.scale.setScalar(1 + (-1.6 - sea) * -.06);
    // one side only: a small moon orbits the island, its gold ring always facing in (tidal locking)
    const ol = t >= L[6] && t < L[7]; mini.visible = tail.visible = ol; if (ol) { const a = t * .8; mini.position.set(Math.cos(a) * 8, 4, Math.sin(a) * 8); mini.lookAt(0, 4, 0); tail.position.y = 4; }
    // the wizard puts it back: a beam from the crystal
    const bp = t - L[7] - .35; beam.visible = bp > 0 && bp < 1.1; if (beam.visible) { const J = S.hero.userData.J; S.place(t, cam); const c0 = V(); J.crystal.getWorldPosition(c0); const dir = MOON.clone().sub(c0), len = dir.length() * eo(bp / .5);
      beam.position.copy(c0).addScaledVector(dir.normalize(), len / 2); beam.scale.set(1 + 2 * Math.sin(bp * 20) * .1, len, 1); beam.quaternion.setFromUnitVectors(V(0, 1, 0), dir); beam.material.opacity = 1 - sm(.7, 1.1, bp); }
    const title = 'WHAT IF THE\nMOON JUST\nVANISHED?', titleA = t < L[1] ? clamp((t - .2) / .3) * clamp((L[1] - t) / .3) : 0;
    const notify = t > 38.6 ? clamp((t - 38.6) / .45) : 0;
    return { cam, title, titleA, notify, notifyText: ['THE MOON   ·   now', 'Leaving you, slowly', '~1 inch a year. Enjoy the view.'] };
  };
}
