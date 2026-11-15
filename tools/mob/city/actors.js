// People and critters: one chunky low-poly rig (hero, Perla, workers, citizens), cat, fisherman, boats, gulls, genie.
import { THREE, Geo, G, cylT, hash, lerp } from "./gfx.js";
import { height } from "./world.js";
export const charMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, flatShading: true });
const mk = (fn, name) => { const g = new Geo(); fn((t, s, p, c, r, tg) => g.part(t, s, p, c, r || [0, 0, 0], tg || "solid")); const m = g.mesh("solid", charMat); m.castShadow = true; m.receiveShadow = false; m.name = name || ""; return m; };
const grp = (x = 0, y = 0, z = 0) => { const o = new THREE.Group(); o.position.set(x, y, z); return o; };
const LEG = 0.92;

// opts: suit, shirt, tie, pants, skin, hair, hairHi, long (segments), dress, shoe, scale, beard
export function makePerson(o) {
  o = { skin: "#e3aa80", shoe: "#16161c", shirt: "#fbfbff", hair: "#3a2216", hairHi: "#6a4228", long: 0, scale: 1, ...o };
  const root = grp(), hips = grp(0, LEG, 0); root.add(hips);
  const dressy = !!o.dress, legCol = o.dress ? o.skin : o.pants || o.suit;
  const mkLeg = (side) => {
    const L = grp(side * 0.13, 0, 0), thigh = mk((P) => { P("cyl", [0.105, 0.5, 0.105], [0, -0.24, 0], legCol); P("sph", 0.105, [0, 0, 0], legCol); }); L.add(thigh);
    const shin = grp(0, -0.47, 0); shin.add(mk((P) => { P("cyl", [0.09, 0.44, 0.09], [0, -0.22, 0], legCol); P("box", [0.17, 0.1, 0.34], [0, -0.43, 0.07], o.shoe); P("sph", [0.09, 0.07, 0.09], [0, -0.01, 0], legCol); })); L.add(shin); L.shin = shin; hips.add(L); return L;
  };
  const legL = mkLeg(1), legR = mkLeg(-1);
  const torso = grp(0, 0, 0); hips.add(torso);
  torso.add(mk((P) => {
    const J = o.suit || o.dress, W = o.shirt;
    P("box", [0.52, 0.6, 0.28], [0, 0.3, 0], o.dress ? o.dress : o.suit);                        // jacket / dress body
    P("box", [0.5, 0.14, 0.26], [0, 0.02, 0], o.dress ? o.dress : o.suit);
    P("sph", [0.17, 0.12, 0.17], [-0.27, 0.56, 0], o.dress ? o.dress : o.suit); P("sph", [0.17, 0.12, 0.17], [0.27, 0.56, 0], o.dress ? o.dress : o.suit);
    if (!o.dress) {
      P("box", [0.16, 0.5, 0.012], [0, 0.31, 0.143], W);                                          // shirt panel (proud of the jacket front)
      P("box", [0.1, 0.3, 0.014], [-0.115, 0.38, 0.148], o.suit, [0, 0, 0.3]); P("box", [0.1, 0.3, 0.014], [0.115, 0.38, 0.148], o.suit, [0, 0, -0.3]); // lapels
      if (o.tie) { P("box", [0.05, 0.34, 0.016], [0, 0.34, 0.156], o.tie); P("box", [0.07, 0.06, 0.02], [0, 0.5, 0.157], o.tie); }
      P("box", [0.2, 0.05, 0.2], [0, 0.6, 0.0], W);                                              // collar
      for (const y of [0.16, 0.06]) P("sph", 0.018, [0, y, 0.15], "#0e0e12");
    } else { P("box", [0.2, 0.08, 0.02], [0, 0.55, 0.14], o.skin); }
    P("cyl", [0.075, 0.1, 0.075], [0, 0.64, 0], o.skin);                                         // neck
  }));
  const skirtF = grp(0, 0.04, 0.12), skirtB = grp(0, 0.04, -0.12);
  if (dressy) { const sk = mk((P) => P(cylT(0.2, 0.4, 14), [1, 0.62, 1], [0, -0.3, 0], o.dress)); sk.position.set(0, 0.05, 0); hips.add(sk); o.skirtMesh = sk; }
  else { skirtF.add(mk((P) => P("box", [0.5, 0.26, 0.06], [0, -0.12, 0.0], o.suit))); skirtB.add(mk((P) => P("box", [0.5, 0.26, 0.06], [0, -0.12, 0.0], o.suit))); hips.add(skirtF, skirtB); }
  const headG = grp(0, 0.66, 0); torso.add(headG);
  headG.add(mk((P) => {
    P("sph", [0.2, 0.22, 0.2], [0, 0.22, 0], o.skin);
    for (const s of [-1, 1]) { P("sph", [0.045, 0.055, 0.02], [s * 0.075, 0.24, 0.185], "#ffffff"); P("sph", 0.028, [s * 0.075, 0.24, 0.2], "#2a1a12"); P("box", [0.09, 0.02, 0.02], [s * 0.075, 0.31, 0.185], o.hair, [0, 0, s * 0.1]); P("sph", [0.03, 0.05, 0.03], [s * 0.2, 0.2, 0], o.skin); }
    P("sph", [0.03, 0.04, 0.03], [0, 0.18, 0.2], o.skin); P("box", [0.07, 0.014, 0.02], [0, 0.1, 0.19], "#8a3a3a");
    if (o.beard) P("sph", [0.17, 0.1, 0.12], [0, 0.09, 0.1], o.hair);
    P("sph", [0.215, 0.215, 0.21], [0, 0.29, -0.045], o.hair);                                    // hair cap (front hidden inside the forehead)
    P("sph", [0.2, 0.1, 0.12], [0, 0.42, 0.05], o.hairHi);
    for (const s of [-1, 1]) P("box", [0.05, 0.22, 0.14], [s * 0.2, 0.2, -0.04], o.hair);
  }));
  // long hair: a chain of tapered plates behind the back (never rotates forward, so it cannot enter the body)
  const hair = []; let parent = grp(0, 0.4, -0.2); headG.add(parent);
  for (let i = 0; i < o.long; i++) { const len = 0.2, w = 0.34 - i * 0.02; const seg = grp(0, i === 0 ? 0 : -len, 0); parent.add(seg); seg.add(mk((P) => { P("box", [w, len + 0.02, 0.085], [0, -len / 2, 0], i % 2 ? o.hair : o.hairHi === o.hair ? o.hair : o.hair); P("box", [w * 0.35, len, 0.09], [w * 0.2, -len / 2, 0.004], o.hairHi); if (i === o.long - 1) P("cone4", [w * 0.5, 0.16, 0.06], [0, -len - 0.05, 0], o.hair, [Math.PI, Math.PI / 4, 0]); })); hair.push(seg); parent = seg; }
  const mkArm = (side) => {
    const A = grp(side * 0.33, 0.52, 0), up = mk((P) => { P("cyl", [0.088, 0.3, 0.088], [0, -0.15, 0], o.dress ? o.skin : o.suit); P("sph", 0.095, [0, 0, 0], o.dress ? o.dress : o.suit); }); A.add(up);
    const fore = grp(0, -0.3, 0); fore.add(mk((P) => { P("cyl", [0.075, 0.27, 0.075], [0, -0.13, 0], o.dress ? o.skin : o.suit); if (!o.dress) P("cyl", [0.08, 0.05, 0.08], [0, -0.27, 0], o.shirt); P("sph", 0.07, [0, -0.31, 0], o.skin); })); A.add(fore); A.fore = fore; torso.add(A); return A;
  };
  const armL = mkArm(1), armR = mkArm(-1);
  root.scale.setScalar(o.scale);
  const rig = { root, hips, torso, headG, legL, legR, armL, armR, hair, skirtF, skirtB, phase: Math.random() * 6, t: Math.random() * 10, o };
  rig.update = (dt, sp, wave = 0, sit = false) => {
    rig.t += dt; rig.phase += dt * (4.2 + sp * 7.5); const s = Math.sin(rig.phase), c = Math.cos(rig.phase), A = sp * 0.85, t = rig.t;
    legL.rotation.x = A * s; legR.rotation.x = -A * s; legL.shin.rotation.x = 1.15 * sp * Math.max(0, -c) + 0.03; legR.shin.rotation.x = 1.15 * sp * Math.max(0, c) + 0.03;
    if (sit) { legL.rotation.x = legR.rotation.x = -1.45; legL.shin.rotation.x = legR.shin.rotation.x = 1.45; }
    armL.rotation.x = -A * 0.95 * s; armR.rotation.x = A * 0.95 * s; armL.rotation.z = -0.12; armR.rotation.z = 0.12;
    armL.fore.rotation.x = -(0.12 + 0.7 * sp); armR.fore.rotation.x = -(0.12 + 0.7 * sp);
    const lean = 0.03 + 0.2 * sp; torso.rotation.x = lean; torso.rotation.y = 0.13 * sp * s; headG.rotation.x = -lean * 0.7; headG.rotation.y = -0.13 * sp * s + Math.sin(t * 0.6) * 0.08 * (1 - sp);
    hips.position.y = LEG + 0.05 * sp * Math.cos(rig.phase * 2) - (sit ? 0.45 : 0); hips.position.y += Math.sin(t * 1.8) * 0.006;
    torso.scale.y = 1 + Math.sin(t * 1.8) * 0.012 * (1 - sp);
    skirtF.rotation.x = Math.min(0, Math.min(legL.rotation.x, legR.rotation.x)) * 0.95; skirtB.rotation.x = Math.max(0, Math.max(legL.rotation.x, legR.rotation.x)) * 0.95;
    if (o.skirtMesh) { o.skirtMesh.rotation.x = Math.sin(rig.phase) * sp * 0.08; o.skirtMesh.scale.set(1 + sp * 0.06, 1, 1 + sp * 0.06); }
    if (wave > 0.01) { armR.rotation.x = lerp(armR.rotation.x, -2.75, wave); armR.rotation.z = lerp(armR.rotation.z, 0.5, wave); armR.fore.rotation.x = lerp(armR.fore.rotation.x, -0.35, wave); armR.fore.rotation.z = Math.sin(t * 9) * 0.55 * wave; } else armR.fore.rotation.z = 0;
    hair.forEach((h, i) => { const base = 0.07 + sp * 0.3; h.rotation.x = Math.max(0.03, base * (0.55 + 0.18 * i) + (0.1 * sp * Math.sin(rig.phase * 2 - i * 0.8)) + 0.035 * Math.sin(t * 1.3 - i * 0.7)); h.rotation.z = 0.07 * (1 + sp) * Math.sin(rig.phase - i * 0.6) * (i + 1) / 3 + 0.02 * Math.sin(t * 0.9 + i); });
  };
  return rig;
}

export class Walker {
  constructor(rig, pos, speed = 2.2) { this.rig = rig; this.pos = new THREE.Vector3(pos[0], 0, pos[1]); this.speed = speed; this.route = []; this.yaw = 0; this.sp = 0; this.hidden = false; this.sit = false; rig.root.position.set(pos[0], height(pos[0], pos[1]), pos[1]); }
  goto(x, z, ring = 30) { const p = this.pos, r1 = Math.hypot(p.x, p.z), r2 = Math.hypot(x, z), rt = [];
    if (r1 > ring + 6 || r2 > ring + 6) { if (r1 > ring + 6) { const k = ring / r1; rt.push([p.x * k, p.z * k]); } if (r2 > ring + 6) { const a0 = Math.atan2(p.z, p.x), a1 = Math.atan2(z, x); let d = a1 - a0; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283; const n = Math.max(1, Math.ceil(Math.abs(d) / 0.35)); for (let i = 1; i <= n; i++) { const a = a0 + d * i / n; rt.push([Math.cos(a) * ring, Math.sin(a) * ring]); } } }
    rt.push([x, z]); this.route = rt; this.target = [x, z]; }
  at(x, z) { return Math.hypot(this.pos.x - x, this.pos.z - z) < 1.2; }
  update(dt) {
    let moving = false;
    if (this.route.length) { const [tx, tz] = this.route[0], dx = tx - this.pos.x, dz = tz - this.pos.z, dist = Math.hypot(dx, dz);
      if (dist < 0.5) this.route.shift(); else { const st = Math.min(dist, this.speed * dt); this.pos.x += dx / dist * st; this.pos.z += dz / dist * st; let da = Math.atan2(dx, dz) - this.yaw; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283; this.yaw += da * Math.min(1, dt * 8); moving = true; } }
    this.sp = lerp(this.sp, moving ? Math.min(1, this.speed / 6.5 + 0.1) : 0, Math.min(1, dt * 8));
    this.rig.root.position.set(this.pos.x, height(this.pos.x, this.pos.z), this.pos.z); this.rig.root.rotation.y = this.yaw; this.rig.update(dt, this.sp, 0, this.sit);
  }
}

export function makeCat() {
  const g = grp(), body = mk((P) => { P("sph", [0.17, 0.15, 0.3], [0, 0.22, 0], "#e08a3a"); P("sph", [0.13, 0.13, 0.13], [0, 0.33, 0.3], "#e08a3a"); P("cone", [0.04, 0.1, 0.04], [-0.07, 0.46, 0.3], "#e08a3a"); P("cone", [0.04, 0.1, 0.04], [0.07, 0.46, 0.3], "#e08a3a"); P("sph", 0.02, [-0.05, 0.35, 0.41], "#222"); P("sph", 0.02, [0.05, 0.35, 0.41], "#222"); P("box", [0.2, 0.03, 0.34], [0, 0.3, 0], "#a85a1a"); for (const x of [-0.1, 0.1]) { P("cyl", [0.04, 0.2, 0.04], [x, 0.1, 0.18], "#e08a3a"); P("cyl", [0.04, 0.2, 0.04], [x, 0.1, -0.18], "#e08a3a"); } }, "cat");
  const tail = grp(0, 0.3, -0.28); tail.add(mk((P) => { P("cyl", [0.04, 0.4, 0.04], [0, 0.18, -0.05], "#e08a3a", [-0.4, 0, 0]); P("sph", 0.05, [0, 0.38, -0.12], "#fff0d8"); })); g.add(body, tail); g.tail = tail; g.scale.setScalar(1.6); return g;
}
export function makeBoat(sail = "#fff4e0", hull = "#2a62c8") {
  const g = grp(); g.add(mk((P) => { P("box", [1.4, 0.55, 3.4], [0, 0.3, 0], hull); P("box", [1.6, 0.14, 3.6], [0, 0.62, 0], "#fff4e0"); P("cone4", [0.99, 1.5, 0.7], [0, 0.3, 2.35], hull, [Math.PI / 2, Math.PI / 4, 0]); P("cyl", [0.06, 4.2, 0.06], [0, 2.7, 0.3], "#5a3a20"); const t = new THREE.BufferGeometry(); t.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 3.4, 0, 0, 0, -2.2, 0, 0, 0, 0, 0, -2.2, 0, 3.4, 0], 3)); t.computeVertexNormals(); P(t, 1, [0, 1.0, 1.4], sail); P("box", [0.05, 0.5, 0.05], [0, 4.9, 0.3], "#e0383a"); }));
  return g;
}
export function makeGull() { const g = grp(); const wl = grp(), wr = grp(); const tri = (s) => { const t = new THREE.BufferGeometry(); t.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.18, s * 0.9, 0, 0.1, 0, 0, -0.14], 3)); t.computeVertexNormals(); return t; };
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", side: THREE.DoubleSide, flatShading: true }); wl.add(new THREE.Mesh(tri(1), m)); wr.add(new THREE.Mesh(tri(-1), m)); g.add(wl, wr, mk((P) => { P("sph", [0.09, 0.08, 0.2], [0, 0, 0], "#fff"); P("cone", [0.025, 0.08, 0.025], [0, -0.01, 0.2], "#ffb02a", [Math.PI / 2, 0, 0]); })); g.wl = wl; g.wr = wr; g.scale.setScalar(1.7); return g; }
export function makeGenie() {
  const g = grp(); const body = mk((P) => { P(cylT(0.1, 0.62, 12), [1, 1.9, 1], [0, 0.35, 0], "#3a8ae8"); P(cylT(0.62, 0.9, 12), [1, 0.9, 1], [0, 1.6, 0], "#4a9af8"); P("cone", [0.3, 1.0, 0.3], [0, -0.35, 0], "#7ac8ff", [Math.PI, 0, 0]);
    P("box", [0.9, 0.16, 0.5], [0, 2.1, 0.1], "#f0c040"); P("sph", [0.4, 0.4, 0.38], [0, 2.8, 0], "#4aa0f8"); P("sph", [0.2, 0.2, 0.1], [-0.15, 2.85, 0.33], "#fff"); P("sph", [0.2, 0.2, 0.1], [0.15, 2.85, 0.33], "#fff"); P("sph", 0.07, [-0.15, 2.85, 0.4], "#111"); P("sph", 0.07, [0.15, 2.85, 0.4], "#111");
    P("sph", [0.34, 0.3, 0.34], [0, 3.2, 0], "#f6f0ff"); P("sph", [0.36, 0.14, 0.36], [0, 3.05, 0], "#f0c040"); P("ico", 0.1, [0, 3.2, 0.34], "#ff4a8a", [0, 0, 0], "glow");
    P("cyl", [0.17, 0.5, 0.17], [-0.62, 1.95, 0.25], "#4a9af8", [0, 0, 0.9]); P("cyl", [0.17, 0.5, 0.17], [0.62, 1.95, 0.25], "#4a9af8", [0, 0, -0.9]); P("sph", 0.16, [-0.4, 1.65, 0.45], "#4aa0f8"); P("sph", 0.16, [0.4, 1.65, 0.45], "#4aa0f8"); P("tor", [0.55, 0.55, 0.55], [0, 2.1, 0], "#f0c040", [Math.PI / 2, 0, 0]); }, "genie");
  const glow = new THREE.MeshBasicMaterial({ color: "#7ad0ff", transparent: true, opacity: 0.25, depthWrite: false }); const aura = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), glow); aura.position.y = 1.8; g.add(body, aura); g.scale.setScalar(1.5); return g;
}
export function makeCoinCart() { const g = grp(); g.add(mk((P) => { P("box", [1.2, 0.5, 1.9], [0, 0.65, 0], "#7a4a24"); for (let i = 0; i < 9; i++) P("cyl", [0.22, 0.06, 0.22], [(i % 3 - 1) * 0.3, 1.0 + Math.floor(i / 3) * 0.06, (Math.floor(i / 3) - 1) * 0.45], "#ffd24a", [0.1, 0, 0.1]); for (const [x, z] of [[-0.65, -0.6], [0.65, -0.6], [-0.65, 0.6], [0.65, 0.6]]) P("cyl", [0.3, 0.1, 0.3], [x, 0.3, z], "#3a2a1a", [0, 0, Math.PI / 2]); P("box", [0.1, 0.1, 1.2], [0, 0.9, 1.5], "#5a3a20"); })); return g; }
