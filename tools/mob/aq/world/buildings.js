// Every building on the island, modeled from parts (no boxes-as-buildings). Each returns {g, door, r, top}.
import * as THREE from "three";
import { M, Merger, uv, column, steps, box, temple, dome, sprite, tint } from "./kit.js";
import { bakeStatue } from "./people.js";
import * as T from "../textures.js";
import { Screen } from "./screens.js";

export const DR = 100; // district ring radius
export const angleOf = (i) => (i / 12) * Math.PI * 2;
export const polar = (r, a) => [Math.sin(a) * r, -Math.cos(a) * r];

// ---------------- statues ----------------
let clipsRef = null; export function setClips(c) { clipsRef = c; }
function posed(fn) {
  return bakeStatue((b, model) => {
    const mx = new THREE.AnimationMixer(model); const c = clipsRef.Idle_Loop; if (c) { mx.clipAction(c).play(); mx.update(0.6); }
    model.updateMatrixWorld(true); fn && fn(b); model.updateMatrixWorld(true);
  }, M.marble);
}
const rot = (b, n, x, y, z) => { if (b[n]) { b[n].rotation.x += x; b[n].rotation.y += y; b[n].rotation.z += z; } };
const armUp = (b, side, amt = 1) => { rot(b, "upperarm_" + side, 0, 0, (side === "r" ? 1 : -1) * 0); rot(b, "upperarm_" + side, -2.4 * amt, 0, 0); };
export function statue(god) {
  const g = new THREE.Group();
  const m = new Merger();
  // pedestal: stepped base, fluted drum, gold name band
  steps(m, 0, 0, 3.2, 3.2, 2, 0.3, M.marbleWarm);
  m.add(uv(new THREE.CylinderGeometry(1.5, 1.6, 2.2, 32), 2, 1), M.marble, 0, 0.6 + 1.1, 0);
  m.add(new THREE.CylinderGeometry(1.62, 1.62, 0.25, 32), M.gold, 0, 0.6 + 2.2, 0);
  g.add(m.build());
  const pose = {
    zeus: (b) => { rot(b, "upperarm_r", 0, 0, -2.0); rot(b, "lowerarm_r", 0, 0, -0.3); },
    athena: (b) => { rot(b, "upperarm_r", 0, 0, -0.9); rot(b, "lowerarm_r", 0, 0, -0.9); rot(b, "upperarm_l", 0, 0, 0.5); rot(b, "lowerarm_l", 0, 0, 1.2); },
    apollo: (b) => { rot(b, "upperarm_l", 0, 0, 0.6); rot(b, "lowerarm_l", 0, 0, 1.4); rot(b, "upperarm_r", 0, 0, -0.4); rot(b, "lowerarm_r", 0, 0, -1.2); },
    hermes: (b) => { rot(b, "upperarm_r", 0, 0, -1.2); rot(b, "lowerarm_r", 0, 0, -0.6); rot(b, "thigh_l", 0, 0, 0.15); },
    dionysus: (b) => { rot(b, "upperarm_r", 0, 0, -1.3); rot(b, "lowerarm_r", 0, 0, -1.0); rot(b, "upperarm_l", 0, 0, 0.5); rot(b, "lowerarm_l", 0, 0, 1.1); },
    hecate: (b) => { rot(b, "upperarm_r", 0, 0, -1.1); rot(b, "lowerarm_r", 0, 0, -0.5); rot(b, "upperarm_l", 0, 0, 1.1); rot(b, "lowerarm_l", 0, 0, 0.5); },
  }[god];
  const fig = posed(pose); const S = 2.4; fig.scale.setScalar(S); fig.position.y = 2.95; g.add(fig);
  const hand = (s) => fig.userData.boneWorld("hand_" + s).multiplyScalar(S).add(new THREE.Vector3(0, 2.95, 0));
  const head = fig.userData.boneWorld("Head").multiplyScalar(S).add(new THREE.Vector3(0, 2.95, 0));
  const a = new Merger(); const hr = hand("r"), hl = hand("l");
  // himation drape: marble robe cone around the legs (classical statue look)
  a.add(new THREE.CylinderGeometry(0.42 * S / 2.4, 0.62 * S / 2.4, 2.2, 24, 1, true), M.marble, 0, 2.95 + 1.15, 0);
  // laurel crown in gold for every god
  a.add(new THREE.TorusGeometry(0.2, 0.05, 6, 16), M.gold, head.x, head.y + 0.18, head.z, 0, 1, 1, 1, Math.PI / 2);
  if (god === "zeus") { // thunderbolt: zigzag gold
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.25, 0.7); s.lineTo(0.08, 0.7); s.lineTo(0.3, 1.5); s.lineTo(-0.15, 0.6); s.lineTo(0.05, 0.6); s.lineTo(-0.2, 0); s.closePath();
    const bg = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false }); bg.translate(0, -0.3, -0.05);
    a.add(bg, M.gold, hr.x, hr.y, hr.z, 0, 1.2, 1.2, 1.2); }
  if (god === "athena") { a.add(new THREE.CylinderGeometry(0.04, 0.04, 5.2, 8), M.bronze, hr.x, hr.y + 0.6, hr.z); a.add(new THREE.ConeGeometry(0.12, 0.45, 8), M.gold, hr.x, hr.y + 3.4, hr.z);
    a.add(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 32), M.gold, hl.x, hl.y, hl.z + 0.25, 0, 1, 1, 1, Math.PI / 2); a.add(new THREE.SphereGeometry(0.18, 12, 8), M.marble, hl.x, hl.y, hl.z + 0.33);
    a.add(new THREE.BoxGeometry(0.06, 0.35, 0.55), M.red, head.x, head.y + 0.42, head.z); a.add(new THREE.SphereGeometry(0.23, 14, 10, 0, 6.3, 0, 1.7), M.gold, head.x, head.y + 0.08, head.z); }
  if (god === "apollo") { const ly = new THREE.TorusGeometry(0.32, 0.04, 6, 20, Math.PI * 1.25); a.add(ly, M.gold, hl.x, hl.y + 0.2, hl.z + 0.15, 0, 1, 1, 1, 0, -Math.PI * 0.125 + Math.PI);
    for (let k = -2; k <= 2; k++) a.add(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), M.gold, hl.x + k * 0.08, hl.y + 0.12, hl.z + 0.15);
    a.add(new THREE.BoxGeometry(0.62, 0.05, 0.05), M.gold, hl.x, hl.y - 0.12, hl.z + 0.15); }
  if (god === "hermes") { a.add(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 8), M.gold, hr.x, hr.y + 0.6, hr.z);
    for (let k = 0; k < 30; k++) { const t = k / 30, an = t * Math.PI * 4; for (const s of [-1, 1]) a.add(new THREE.SphereGeometry(0.05, 6, 4), M.bronze, hr.x + Math.cos(an) * 0.1 * s, hr.y + 0.1 + t * 1.6, hr.z + Math.sin(an) * 0.1); }
    for (const s of [-1, 1]) { const wg = new THREE.ConeGeometry(0.12, 0.45, 4); a.add(wg, M.gold, hr.x + s * 0.18, hr.y + 1.85, hr.z, 0, 1, 1, 1, 0, s * 1.2);
      const fp = fig.userData.boneWorld(s < 0 ? "foot_l" : "foot_r").multiplyScalar(S).add(new THREE.Vector3(0, 2.95, 0));
      a.add(new THREE.ConeGeometry(0.1, 0.42, 4), M.gold, fp.x + s * 0.15, fp.y + 0.12, fp.z - 0.05, 0, 1, 1, 1, 0.4, s * 1.3); }
    a.add(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 16), M.gold, head.x, head.y + 0.22, head.z); }
  if (god === "dionysus") { const gp = new THREE.SphereGeometry(0.07, 8, 6); const grapeM = new THREE.MeshStandardMaterial({ color: 0x6b2a8a, roughness: 0.35, emissive: 0x200030 });
    for (let k = 0; k < 16; k++) { const lay = Math.floor(Math.sqrt(k)); a.add(gp, grapeM, hl.x + Math.cos(k * 2.4) * 0.05 * lay, hl.y - 0.1 - lay * 0.1, hl.z + 0.12 + Math.sin(k * 2.4) * 0.05 * lay); }
    const cup = new THREE.LatheGeometry([new THREE.Vector2(0.01, 0), new THREE.Vector2(0.12, 0), new THREE.Vector2(0.03, 0.05), new THREE.Vector2(0.03, 0.18), new THREE.Vector2(0.22, 0.28), new THREE.Vector2(0.25, 0.4)], 16);
    a.add(cup, M.gold, hr.x, hr.y + 0.05, hr.z); }
  if (god === "hecate") for (const h of [hr, hl]) { a.add(new THREE.CylinderGeometry(0.05, 0.04, 1.1, 8), M.bronze, h.x, h.y + 0.35, h.z); a.add(new THREE.CylinderGeometry(0.14, 0.06, 0.2, 10), M.gold, h.x, h.y + 0.95, h.z); }
  g.add(a.build());
  if (god === "hecate") for (const h of [hr, hl]) { const f = sprite(T.flame(), 0.6, 1.1); f.position.set(h.x, h.y + 1.45, h.z); f.userData.flame = true; g.add(f); }
  // name plate
  const lab = sprite(T.label(god.toUpperCase(), { zeus: "risk", athena: "setups", apollo: "learning", hermes: "execution", dionysus: "news", hecate: "the gate" }[god]), 4, 1); lab.position.y = 11.5; lab.userData.label = true; g.add(lab);
  return g;
}

// ---------------- HQ: the Aquarius colosseum ----------------
function archTex() {
  const c = document.createElement("canvas"); c.width = 128; c.height = 384; const g = c.getContext("2d");
  const im = new Image(); // marble base color with veins from the shared marble texture image
  const base = M.marble.map.image; g.drawImage(base, 0, 0, 128, 384);
  g.fillStyle = "rgba(240,228,205,.35)"; g.fillRect(0, 0, 128, 384);
  for (let t = 0; t < 3; t++) {
    const y0 = t * 128;
    // cornice band
    g.fillStyle = "#d9c8a4"; g.fillRect(0, y0, 128, 12); g.fillStyle = "#c9962a"; g.fillRect(0, y0 + 12, 128, 4);
    // arch opening (transparent)
    g.save(); g.globalCompositeOperation = "destination-out"; g.beginPath(); g.moveTo(26, y0 + 128); g.lineTo(26, y0 + 58); g.arc(64, y0 + 58, 38, Math.PI, 0); g.lineTo(102, y0 + 128); g.closePath(); g.fill(); g.restore();
    // arch voussoir rim shading
    g.strokeStyle = "rgba(120,90,50,.45)"; g.lineWidth = 6; g.beginPath(); g.arc(64, y0 + 58, 41, Math.PI, 0); g.stroke();
    g.strokeStyle = "rgba(255,250,235,.7)"; g.lineWidth = 2; g.beginPath(); g.arc(64, y0 + 58, 45, Math.PI, 0); g.stroke();
    g.fillStyle = "#c9962a"; g.fillRect(58, y0 + 14, 12, 8); // keystone gold
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
export function colosseum() {
  const g = new THREE.Group(); const R1 = 26, H = 17.4, N = 44;
  const at = archTex(); at.repeat.set(N, 1);
  const wm = new THREE.MeshStandardMaterial({ map: at, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(R1, R1, H, N * 4, 1, true), wm); outer.rotation.y = Math.PI / N; outer.position.y = H / 2; outer.castShadow = outer.receiveShadow = true; g.add(outer);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(R1 - 3.2, R1 - 3.2, H, N * 4, 1, true), wm.clone()); inner.material.map = at.clone(); inner.material.map.repeat.set(N - 6, 1); inner.material.map.needsUpdate = true; inner.rotation.y = Math.PI / (N - 6); inner.position.y = H / 2; inner.castShadow = inner.receiveShadow = true; g.add(inner);
  const m = new Merger();
  // floors between the two walls (ambulatory) at each tier + top attic
  for (let t = 0; t <= 3; t++) { const rg = new THREE.RingGeometry(R1 - 3.2, R1 + 0.6, N * 2, 1); rg.rotateX(-Math.PI / 2); uv(rg, 4, 4); m.add(rg, t === 3 ? M.marble : M.paving, 0, t * (H / 3) + (t ? 0.02 : 0.04), 0);
    if (t) { m.add(new THREE.TorusGeometry(R1 + 0.35, 0.28, 6, N * 3), M.marbleWarm, 0, t * (H / 3) - 0.1, 0, 0, 1, 1, 1, Math.PI / 2); m.add(new THREE.TorusGeometry(R1 + 0.5, 0.12, 6, N * 3), M.gold, 0, t * (H / 3) + 0.25, 0, 0, 1, 1, 1, Math.PI / 2); } }
  // engaged columns between arches, three orders
  for (let t = 0; t < 3; t++) for (let i = 0; i < N; i++) { const a = ((i + 0.5) / N) * Math.PI * 2 + Math.PI / N; column(m, Math.sin(a) * (R1 + 0.35), Math.cos(a) * (R1 + 0.35), H / 3 - 0.5, 0.32, M.marble, t === 2 ? M.gold : M.marbleWarm, t ? "ionic" : "doric", t * (H / 3) + 0.1); }
  // attic with gold crown + masts
  m.add(uv(new THREE.CylinderGeometry(R1 + 0.2, R1 + 0.2, 1.6, N * 3, 1, true), N, 0.5), M.marbleWarm, 0, H + 0.8, 0);
  m.add(new THREE.TorusGeometry(R1 + 0.25, 0.22, 6, N * 3), M.gold, 0, H + 1.6, 0, 0, 1, 1, 1, Math.PI / 2);
  for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2; m.add(new THREE.CylinderGeometry(0.08, 0.1, 4, 6), M.gold, Math.sin(a) * (R1 + 0.2), H + 3.6, Math.cos(a) * (R1 + 0.2)); }
  // seating cavea inside: stepped lathe
  const prof = [new THREE.Vector2(12, 0)]; for (let k = 0; k < 14; k++) { const r = 12 + k * 0.78, y = k * 1.0; prof.push(new THREE.Vector2(r, y + 1.0)); prof.push(new THREE.Vector2(r + 0.78, y + 1.0)); }
  prof.push(new THREE.Vector2(R1 - 3.2, 14)); const cav = new THREE.LatheGeometry(prof, N * 2, 0.13, Math.PI * 2 - 0.26); uv(cav, 30, 6); m.add(cav, M.marbleWarm, 0, 0, 0);
  // gate passage walls through the cavea
  for (const sx of [-1, 1]) m.add(uv(new THREE.BoxGeometry(0.4, 3.2, 11), 3, 1), M.marble, sx * 1.6, 1.6, 17.5);
  // arena: sand with gold ring and cyan rune circle
  const ar = new THREE.CircleGeometry(12, 48); ar.rotateX(-Math.PI / 2); uv(ar, 3, 3); m.add(ar, M.sand, 0, 0.06, 0);
  m.add(new THREE.TorusGeometry(12, 0.2, 6, 64), M.gold, 0, 0.9, 0, 0, 1, 1, 1, Math.PI / 2);
  // CEO desk on the north side of the arena, facing the gate
  m.add(uv(new THREE.BoxGeometry(3.6, 0.95, 1.5), 1, 0.4), M.wood, 0, 0.55, -8.6); m.add(new THREE.BoxGeometry(3.7, 0.06, 1.6), M.gold, 0, 1.05, -8.6);
  m.add(new THREE.BoxGeometry(1.0, 1.9, 0.2), new THREE.MeshStandardMaterial({ color: 0x7a1020, roughness: 0.6 }), 0, 1.0, -9.9); m.add(new THREE.BoxGeometry(0.9, 0.5, 0.9), M.gold, 0, 0.3, -9.6);
  for (const sx of [-1, 1]) m.add(new THREE.BoxGeometry(1.2, 0.7, 0.05), M.cyan, sx * 0.9, 1.45, -8.9, sx * -0.25);
  // main gate (south): big arch frame + AQUARIUS sign
  for (const s of [-1, 1]) { column(m, s * 3.6, R1 + 1.4, 8.4, 0.55, M.marble, M.gold, "ionic"); }
  m.add(uv(new THREE.BoxGeometry(9.6, 1.6, 1.6), 3, 0.5), M.marbleWarm, 0, 9.2, R1 + 1.4);
  const ped = new THREE.Shape(); ped.moveTo(-5.2, 0); ped.lineTo(5.2, 0); ped.lineTo(0, 2.2); ped.closePath(); const pg = new THREE.ExtrudeGeometry(ped, { depth: 1.6, bevelEnabled: false }); pg.translate(0, 0, -0.8); uv(pg, 0.2, 0.2); m.add(pg, M.marble, 0, 10, R1 + 1.4);
  // boss office on top (north rim): a gold-domed glass tholos
  const bx = 0, bz = -(R1 - 1.6), by = H + 1.6;
  m.add(new THREE.CylinderGeometry(5.6, 5.8, 1.0, 40), M.marble, bx, by + 0.5, bz);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; column(m, bx + Math.sin(a) * 4.8, bz + Math.cos(a) * 4.8, 4.6, 0.25, M.marble, M.gold, "ionic", by + 1); }
  m.add(new THREE.CylinderGeometry(5.3, 5.3, 0.6, 40), M.gold, bx, by + 6.0, bz);
  dome(m, bx, by + 6.3, bz, 4.6, M.gold);
  g.add(m.build());
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 4.6, 32, 1, true), M.glass); glass.position.set(bx, by + 3.3, bz); g.add(glass);
  // the boss at his desk (silhouette lamp)
  const lamp = new THREE.PointLight(0xffd28a, 30, 18, 2); lamp.position.set(bx, by + 4, bz); g.add(lamp);
  // sign
  const sc = document.createElement("canvas"); sc.width = 1024; sc.height = 160; const sg = sc.getContext("2d"); sg.fillStyle = "#d9c8a4"; sg.fillRect(0, 0, 1024, 160); sg.fillStyle = "#b8862a"; sg.font = "700 110px Cinzel, Georgia, serif"; sg.textAlign = "center"; sg.textBaseline = "middle"; sg.fillText("AQUARIUS", 512, 86);
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 1.3), new THREE.MeshStandardMaterial({ map: st, roughness: 0.5, metalness: 0.2 })); sign.position.set(0, 9.2, R1 + 2.22); g.add(sign);
  // the two giant screens, raised over the north stands, facing the plaza (south) and readable from the bridge
  const wallet = new Screen(17, 9.6, 1280).back(); wallet.mesh.position.set(-9.4, 14.8, -4); wallet.mesh.rotation.y = 0.12; g.add(wallet.mesh);
  const x = new Screen(17, 9.6, 1280).back(); x.mesh.position.set(9.4, 14.8, -4); x.mesh.rotation.y = -0.12; g.add(x.mesh);
  // pylons holding them
  const pm = new Merger(); for (const sx of [-9.4, 9.4]) for (const d of [-6, 6]) { pm.add(new THREE.CylinderGeometry(0.35, 0.45, 10.2, 12), M.gold, sx + d * 0.98, 5.1, -4.4); }
  g.add(pm.build());
  g.add(inlay());
  const cr = amethyst(); g.add(cr);
  g.userData = { door: new THREE.Vector3(0, 0, -6.6), r: R1 + 1, top: H + 14, screens: { wallet, x }, crystal: cr };
  return g;
}

// ---------------- the 12 districts ----------------
function label(g, text, sub, y) { const s = sprite(T.label(text, sub), 9, 2.25); s.position.y = y; s.userData.label = true; g.add(s); return s; }
function flame(g, x, y, z, s = 1) { const f = sprite(T.flame(), 0.7 * s, 1.3 * s); f.position.set(x, y, z); f.userData.flame = true; g.add(f); return f; }
function brazier(m, x, z, h = 2.6) { m.add(new THREE.CylinderGeometry(0.12, 0.18, h, 8), M.bronze, x, h / 2, z); m.add(new THREE.CylinderGeometry(0.5, 0.25, 0.4, 12), M.gold, x, h + 0.2, z); }

const B = {};
B.scouts_sol = (col) => { // lighthouse-observatory + Hecate torch gate + pier
  const g = new THREE.Group(), m = new Merger();
  steps(m, 0, -4, 10, 10, 2, 0.4, M.marbleWarm);
  m.add(uv(new THREE.CylinderGeometry(3.2, 4.4, 18, 24), 3, 4), M.stone, 0, 0.8 + 9, -4);
  for (let k = 0; k < 4; k++) m.add(new THREE.TorusGeometry(3.4 + (3 - k) * 0.3, 0.12, 6, 32), M.gold, 0, 2 + k * 4.4, -4, 0, 1, 1, 1, Math.PI / 2);
  m.add(new THREE.CylinderGeometry(4.4, 4.4, 0.5, 32), M.marble, 0, 19, -4);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; column(m, Math.sin(a) * 3.6, -4 + Math.cos(a) * 3.6, 3.4, 0.18, M.marble, M.gold, "ionic", 19.25); }
  dome(m, 0, 22.7, -4, 3.7, M.roofBlue);
  m.add(new THREE.CylinderGeometry(0.35, 0.55, 3.6, 12), M.bronze, 1.5, 25, -3, 0, 1, 1, 1, 0.6, -0.4); // telescope
  // door
  box(m, M.dark, 0, 0.8, -0.05 + 0.5, 2, 3.2, 0.3);
  // Hecate torch gate at the front
  for (const s of [-1, 1]) { box(m, M.marble, s * 4.5, 0, 6, 1.2, 6, 1.2); brazier(m, s * 4.5, 6, 6.6); }
  box(m, M.marbleWarm, 0, 6, 6, 10.4, 1, 1.4); box(m, M.gold, 0, 7, 6, 10.6, 0.25, 1.5);
  // pier with boats
  box(m, M.wood, 0, 0.05, -16, 3, 0.3, 14);
  g.add(m.build());
  for (const s of [-1, 1]) flame(g, s * 4.5, 7.6, 6, 1.6);
  const beacon = new THREE.PointLight(0x9ff3ff, 60, 40, 2); beacon.position.set(0, 21, -4); g.add(beacon); g.userData.beacon = beacon;
  return { g, door: [0, 9], r: 7, top: 30, label: label(g, "SCOUTS · SOLANA", "Hecate's gate", 31) };
};
B.scouts_stocks = (col) => { // long stoa with a scrolling ticker band
  const g = new THREE.Group(), m = new Merger(); const W = 30, D = 8;
  steps(m, 0, 0, W, D, 3, 0.3, M.marble);
  for (let i = 0; i < 13; i++) column(m, -W / 2 + 1 + i * ((W - 2) / 12), D / 2 - 0.8, 6.2, 0.36, M.marble, M.gold, "doric", 0.9);
  box(m, M.marbleWarm, 0, 0.9, -D / 2 + 0.3, W, 6.2, 0.6);
  for (const s of [-1, 1]) box(m, M.marbleWarm, s * (W / 2 - 0.3), 0.9, 0, 0.6, 6.2, D);
  box(m, M.marble, 0, 7.1, 0, W + 0.6, 0.6, D + 0.6); box(m, M.dark, 0, 7.7, D / 2 + 0.31, W, 1.2, 0.05);
  box(m, M.marble, 0, 8.9, 0, W + 1, 0.4, D + 1);
  const L = D / 2 + 0.8, ang = 0.32; for (const s of [-1, 1]) m.add(uv(new THREE.BoxGeometry(W + 1.4, 0.25, L * 1.06), (W + 1) / 2.5, L / 2.5), M.roof, 0, 9.1 + L * Math.sin(ang) / 2, s * L / 2, 0, 1, 1, 1, s * ang);
  // standing desks with chart screens inside
  for (let i = 0; i < 6; i++) { box(m, M.wood, -11 + i * 4.4, 0.9, -1, 1.6, 1.1, 0.7); box(m, M.cyan, -11 + i * 4.4, 2, -1.2, 1.4, 0.8, 0.05); }
  g.add(m.build());
  const tick = new Screen(W, 1.2, 2048, false); tick.mesh.position.set(0, 8.3, D / 2 + 0.36); g.add(tick.mesh);
  return { g, door: [0, D / 2 + 2], r: 15, top: 12, ticker: tick, label: label(g, "SCOUTS · STOCKS", "the ticker stoa", 14) };
};
B.whales = (col) => { // banner hill + whale fountain
  const g = new THREE.Group(), m = new Merger();
  const hill = new THREE.SphereGeometry(14, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2); hill.scale(1, 0.35, 1); uv(hill, 6, 2); m.add(hill, M.grass, 0, 0, -6);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r = 4 + (i % 3) * 3; const x = Math.sin(a) * r, z = -6 + Math.cos(a) * r; const y = 4.9 * Math.sqrt(Math.max(0, 1 - (r * r) / 196));
    m.add(new THREE.CylinderGeometry(0.08, 0.1, 7, 6), M.gold, x, y + 3.5, z);
    m.add(new THREE.PlaneGeometry(1.6, 2.6, 1, 4), tint(["#2f5bd5", "#1aa6c8", "#7d3cd8", "#d4a020"][i % 4]), x + 0.85, y + 5.4, z, a); }
  // whale fountain in front
  const bz = 8; m.add(uv(new THREE.CylinderGeometry(6, 6.4, 1.1, 40), 6, 0.4), M.marble, 0, 0.55, bz); m.add(new THREE.TorusGeometry(6.1, 0.2, 8, 48), M.gold, 0, 1.1, bz, 0, 1, 1, 1, Math.PI / 2);
  const wb = new THREE.SphereGeometry(1.4, 24, 16); wb.scale(2.2, 1, 1.1); m.add(wb, M.bronze, 0, 2.4, bz, 0.4, 1, 1, 1, 0, -0.25);
  const tail = new THREE.ConeGeometry(0.9, 2.2, 4); tail.scale(1.6, 1, 0.3); m.add(tail, M.bronze, -3.3, 3.6, bz - 1.2, 0.4, 1, 1, 1, 0, 0.9);
  for (const s of [-1, 1]) m.add(new THREE.SphereGeometry(0.15, 8, 6), M.dark, 2.4, 2.8, bz + s * 0.9 + 0.8);
  g.add(m.build());
  const wt = new THREE.Mesh(new THREE.CircleGeometry(5.9, 40), new THREE.MeshStandardMaterial({ map: T.water(), color: 0x8fe9ff, emissive: 0x0a3a50, emissiveIntensity: 0.5, roughness: 0.1 })); wt.rotation.x = -Math.PI / 2; wt.position.set(0, 1.0, bz); g.add(wt);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.5, 4, 8, 1, true), M.cyanSoft); spout.position.set(1.4, 5.3, bz + 0.6); g.add(spout);
  // small hall to enter (whale watchers' lodge)
  const t = temple(new Merger(), { x: 9, z: -2, ry: -0.6, w: 7, d: 8, colH: 4, nx: 4, nz: 4, roof: M.roofBlue }); g.add(t);
  return { g, door: [0, 15], r: 13, top: 14, label: label(g, "WHALES", "banner hill", 14) };
};
B.news = (col) => { // amphitheatre + scroll pillar + Dionysus market square with public screens
  const g = new THREE.Group(), m = new Merger();
  const prof = []; for (let k = 0; k < 9; k++) { prof.push(new THREE.Vector2(5 + k * 1.1, k * 0.55)); prof.push(new THREE.Vector2(5 + k * 1.1 + 1.1, k * 0.55)); prof.push(new THREE.Vector2(5 + k * 1.1 + 1.1, (k + 1) * 0.55)); }
  const am = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p.x, p.y)), 40, Math.PI * 0.55, Math.PI * 0.9); uv(am, 8, 2); m.add(am, M.marbleWarm, -6, 0, -4);
  const stg = new THREE.CircleGeometry(5, 32); stg.rotateX(-Math.PI / 2); uv(stg, 2, 2); m.add(stg, M.paving, -6, 0.08, -4);
  box(m, M.marble, -6, 0, -9.5, 10, 4.5, 1); for (let i = 0; i < 5; i++) column(m, -10 + i * 2, -8.6, 4.5, 0.22, M.marble, M.gold, "ionic");
  // scroll pillar
  m.add(new THREE.CylinderGeometry(0.9, 1, 6, 16), M.marble, -6, 3, 2); for (let k = 0; k < 14; k++) m.add(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 8), M.cloth, -6 + Math.sin(k) * 0.98, 1 + (k % 7) * 0.7, 2 + Math.cos(k) * 0.98, k, 1, 1, 1, Math.PI / 2);
  // Dionysus market square: stalls with striped awnings
  const sq = new THREE.CircleGeometry(9, 32); sq.rotateX(-Math.PI / 2); uv(sq, 3, 3); m.add(sq, M.paving, 9, 0.06, 3);
  for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.6, x = 9 + Math.sin(a) * 7.5, z = 3 - Math.cos(a) * 7.5;
    box(m, M.wood, x, 0, z, 2.6, 1.0, 1.2, -a); for (const s of [-1, 1]) m.add(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), M.wood, x + Math.cos(a) * s * 1.2, 1.3, z + Math.sin(a) * s * 1.2);
    m.add(new THREE.BoxGeometry(2.9, 0.1, 1.7), tint(i % 2 ? "#c03fb0" : "#f3d27a"), x, 2.65, z, -a, 1, 1, 1, 0.25); }
  g.add(m.build());
  const scr1 = new Screen(7, 4, 768); scr1.mesh.position.set(9, 4.2, -4.5); g.add(scr1.mesh);
  const pole = new Merger(); pole.add(new THREE.CylinderGeometry(0.2, 0.25, 4, 8), M.gold, 9, 1.5, -4.8); g.add(pole.build());
  return { g, door: [-6, 2.6 + 3], r: 13, top: 12, screens: { news: scr1 }, label: label(g, "NEWS & MOOD", "Dionysus' market square", 12) };
};
B.setups = () => { const g = new THREE.Group(); const t = temple(new Merger(), { w: 14, d: 18, colH: 6.5, nx: 6, nz: 7, roof: M.roof });
  t.position.z = -4; g.add(t); const m = new Merger();
  const mo = new THREE.PlaneGeometry(12, 12); mo.rotateX(-Math.PI / 2); m.add(mo, M.mosaic, 0, 0.07, 12);
  for (const s of [-1, 1]) { box(m, M.wood, s * 8, 0, 12, 2.4, 1, 1.4); m.add(new THREE.TorusGeometry(0.5, 0.04, 4, 20, Math.PI), M.gold, s * 8, 1.1, 12, 0, 1, 1, 1, -Math.PI / 2); }
  g.add(m.build());
  return { g, door: [0, 6.5], r: 11, top: 15, label: label(g, "SETUPS", "the drafting academy", 16) };
};
B.costs = () => { const g = new THREE.Group(), m = new Merger();
  steps(m, 0, -2, 14, 12, 2, 0.35, M.marble); box(m, M.stone, 0, 0.7, -2, 12, 7, 10); box(m, M.gold, 0, 7.7, -2, 12.4, 0.4, 10.4); box(m, M.marble, 0, 8.1, -2, 12.8, 0.5, 10.8);
  for (const s of [-1, 1]) column(m, s * 2.2, 4, 6.4, 0.35, M.marble, M.gold, "doric", 0.7);
  box(m, M.dark, 0, 0.7, 3.05, 2.6, 4, 0.1);
  // giant scales on the roof
  m.add(new THREE.CylinderGeometry(0.25, 0.4, 6, 10), M.gold, 0, 11.6, -2); m.add(new THREE.BoxGeometry(10, 0.3, 0.3), M.gold, 0, 14.5, -2, 0, 1, 1, 1, 0, 0.08);
  for (const s of [-1, 1]) { const y = 14.5 + s * -0.4; for (let k = 0; k < 3; k++) m.add(new THREE.CylinderGeometry(0.02, 0.02, 3, 4), M.gold, s * 4.8 + (k - 1) * 0.6, y - 1.5, -2); m.add(new THREE.CylinderGeometry(1.2, 0.6, 0.4, 20), M.gold, s * 4.8, y - 3, -2); }
  // coin stacks + aqueduct meter
  for (let i = 0; i < 6; i++) m.add(new THREE.CylinderGeometry(0.5, 0.5, 0.3 + i * 0.25, 20), M.gold, -6 + i * 0.6, 0.15 + i * 0.12, 7 + (i % 2));
  for (let i = 0; i < 4; i++) { box(m, M.stone, 9 + i * 0, 0, -8 + i * 4, 1, 5, 1); } box(m, M.stone, 9, 5, -2, 1.2, 1, 14); box(m, M.cyan, 9, 6, -2, 0.6, 0.3, 14);
  g.add(m.build());
  return { g, door: [0, 6], r: 9, top: 17, label: label(g, "COSTS", "the mint and toll house", 18) };
};
B.council = () => { // golden domed tholos + verdict stone
  const g = new THREE.Group(), m = new Merger(); const R = 7.5;
  steps(m, 0, 0, R * 2, R * 2, 3, 0.35, M.marble);
  m.add(new THREE.CylinderGeometry(R + 0.6, R + 0.8, 1.05, 48), M.marble, 0, 0.52, 0);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; column(m, Math.sin(a) * R, Math.cos(a) * R, 6.5, 0.38, M.gold, M.gold, "ionic", 1.05); }
  const cel = new THREE.CylinderGeometry(R - 2.2, R - 2.2, 6.5, 40, 1, true, 0.5, Math.PI * 2 - 1.0); uv(cel, 8, 2); m.add(cel, M.marbleWarm, 0, 1.05 + 3.25, 0);
  m.add(new THREE.CylinderGeometry(R + 0.6, R + 0.6, 0.8, 48), M.gold, 0, 7.95, 0);
  dome(m, 0, 8.35, 0, R - 0.3, M.gold, 48);
  // verdict stone at the entrance
  g.add(m.build());
  const vs = new Screen(2.6, 2.6, 512, false); vs.mesh.position.set(0, 2.6, R + 3.2); g.add(vs.mesh);
  const st = new Merger(); st.add(new THREE.BoxGeometry(3, 3.6, 0.8), M.marble, 0, 1.8, R + 2.75); g.add(st.build());
  const glow = new THREE.PointLight(0x40ff80, 25, 12, 2); glow.position.set(0, 3, R + 4.5); g.add(glow);
  return { g, door: [0, R + 5.5], r: R + 1.5, top: 19, verdict: vs, glow, label: label(g, "COUNCIL OF OLYMPUS", "the Skeptics", 20) };
};
B.risk = () => { // fortress + red kill-switch lever tower
  const g = new THREE.Group(), m = new Merger(); const S = 18;
  for (const [x, z, w, d] of [[0, -S / 2, S, 1.6], [-S / 2, 0, 1.6, S], [S / 2, 0, 1.6, S], [-S / 3.4, S / 2, S / 2.8, 1.6], [S / 3.4, S / 2, S / 2.8, 1.6]]) { box(m, M.stoneGrey, x, 0, z, w, 6, d, 0, 3);
    const n = Math.round(Math.max(w, d) / 1.2); for (let k = 0; k < n; k++) box(m, M.stoneGrey, x + (w > d ? -w / 2 + 0.6 + k * 1.2 : 0), 6, z + (d > w ? -d / 2 + 0.6 + k * 1.2 : 0), 0.7, 0.8, 0.7 + (w > d ? 0.9 : 0)); }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { m.add(uv(new THREE.CylinderGeometry(2, 2.3, 9, 16), 2, 2), M.stoneGrey, (x * S) / 2, 4.5, (z * S) / 2); m.add(new THREE.ConeGeometry(2.6, 3, 16), M.roof, (x * S) / 2, 10.5, (z * S) / 2); }
  // gate arch
  box(m, M.stoneGrey, 0, 4.2, S / 2, S / 3.4, 1.8, 1.6); m.add(new THREE.TorusGeometry(2.2, 0.35, 6, 16, Math.PI), M.gold, 0, 4.1, S / 2 + 0.85);
  // lever tower
  m.add(uv(new THREE.CylinderGeometry(1.8, 2.4, 16, 16), 2, 4), M.stoneGrey, 0, 8, -2); m.add(new THREE.CylinderGeometry(2.6, 2.6, 0.6, 16), M.gold, 0, 16.3, -2);
  g.add(m.build());
  const lever = new THREE.Group(); const lm = new Merger(); lm.add(new THREE.CylinderGeometry(0.22, 0.22, 6, 10), M.red, 0, 3, 0); lm.add(new THREE.SphereGeometry(0.8, 16, 12), M.redGlow, 0, 6.2, 0); lever.add(lm.build());
  lever.position.set(0, 16.6, -2); lever.rotation.z = 0.5; g.add(lever);
  const warn = new THREE.PointLight(0xff3020, 0, 30, 2); warn.position.set(0, 22, -2); g.add(warn);
  return { g, door: [0, S / 2 + 2.5], r: 11, top: 26, lever, warn, label: label(g, "RISK", "the fortress · Zeus", 27) };
};
B.execution = () => { // harbour: basin, quay, the ship, Hermes on the quay
  const g = new THREE.Group(), m = new Merger();
  const quay = new THREE.RingGeometry(10, 12.5, 40, 1, Math.PI * 0.1, Math.PI * 1.8); quay.rotateX(-Math.PI / 2); uv(quay, 6, 1); m.add(quay, M.paving, 0, 0.08, -6);
  m.add(uv(new THREE.CylinderGeometry(10, 10, 2, 40, 1, true), 10, 0.4), M.marble, 0, -0.95, -6);
  // ship: lathe hull stretched, mast, sail, oars
  const hull = new THREE.LatheGeometry([0, 0.5, 1, 1.4, 1.6, 1.6].map((r, i) => new THREE.Vector2(r, i * 0.4 - 0.8)), 20); hull.scale(1, 1, 4.2); hull.rotateX(0); m.add(hull, M.wood, 0, 0.2, -6, Math.PI / 2 - 0.3);
  m.add(new THREE.CylinderGeometry(0.12, 0.15, 9, 8), M.wood, 0, 4.8, -6); m.add(new THREE.BoxGeometry(0.15, 0.15, 5), M.wood, 0, 8, -6, Math.PI / 2 - 0.3 + Math.PI / 2);
  const sail = new THREE.PlaneGeometry(4.6, 4.6, 6, 6); { const p = sail.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.cos(p.getX(i) * 0.6) * 0.5); sail.computeVertexNormals(); }
  m.add(sail, tint("#0e9f6e"), 0, 5.6, -6, -0.3 + Math.PI / 2 - Math.PI / 2 + 0.0);
  m.add(new THREE.BoxGeometry(0.4, 0.6, 1.2), M.gold, Math.cos(0.3) * 0, 1.2, -6 + 6.3);
  // the trader's desk house
  const t = temple(new Merger(), { x: 10, z: 9, ry: -0.5, w: 8, d: 9, colH: 4.5, nx: 4, nz: 5, roof: M.roof }); g.add(t);
  // cargo
  for (let i = 0; i < 6; i++) box(m, M.wood, -9 + (i % 3) * 1.3, 0, 6 + Math.floor(i / 3) * 1.3, 1.1, 1.1, 1.1);
  g.add(m.build());
  const wt = new THREE.Mesh(new THREE.CircleGeometry(10, 40), new THREE.MeshStandardMaterial({ map: T.water(), color: 0x7fdcf0, emissive: 0x0a3a50, emissiveIntensity: 0.5, roughness: 0.1 })); wt.rotation.x = -Math.PI / 2; wt.position.set(0, -0.5, -6); g.add(wt);
  return { g, door: [10 - Math.sin(0.5) * 0, 15], r: 12, top: 14, ship: true, label: label(g, "EXECUTION", "the harbour · Hermes", 15), noWalk: { x: 0, z: -6, r: 10.5 } };
};
B.review = () => { const g = new THREE.Group(); const t = temple(new Merger(), { w: 16, d: 20, colH: 7, nx: 7, nz: 8, roof: M.roofBlue, style: "doric" }); t.position.z = -3; g.add(t);
  const m = new Merger(); for (let i = 0; i < 8; i++) box(m, M.marbleWarm, -9.5 + (i % 2) * 0.1, 0, -10 + i * 2.6, 0.4, 2.2, 1.6); g.add(m.build());
  return { g, door: [0, 8.5], r: 12, top: 16, label: label(g, "REVIEW & JOURNAL", "the courthouse-library", 17) };
};
B.learning = () => { // grove with the glowing tree of neurons + semicircle colonnade
  const g = new THREE.Group(), m = new Merger();
  for (let i = 0; i < 9; i++) { const a = Math.PI * 0.6 + (i / 8) * Math.PI * 0.8; column(m, Math.sin(a) * 11, Math.cos(a) * 11, 5.5, 0.32, M.marble, M.gold, "ionic"); }
  m.add(new THREE.TorusGeometry(11, 0.4, 6, 40, Math.PI * 0.85), M.marbleWarm, 0, 5.8, 0, 0, 1, 1, 1, Math.PI / 2, Math.PI * 0.6 - Math.PI / 2 + Math.PI * 0.075 - 0.25);
  // trunk: twisted lathe
  const tr = new THREE.CylinderGeometry(0.8, 1.6, 9, 12, 8); { const p = tr.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), a = y * 0.4; const x = p.getX(i), z = p.getZ(i); p.setX(i, x * Math.cos(a) - z * Math.sin(a)); p.setZ(i, x * Math.sin(a) + z * Math.cos(a)); } tr.computeVertexNormals(); }
  m.add(tr, M.trunk, 0, 4.5, 0); for (let k = 0; k < 5; k++) m.add(new THREE.CylinderGeometry(0.2, 0.45, 5, 6), M.trunk, Math.sin(k * 1.3) * 2, 9.5, Math.cos(k * 1.3) * 2, k * 1.3, 1, 1, 1, Math.cos(k * 1.3) * 0.7, -Math.sin(k * 1.3) * 0.7);
  const pond = new THREE.RingGeometry(2, 4, 32); pond.rotateX(-Math.PI / 2); m.add(pond, M.marble, 0, 0.1, 0);
  g.add(m.build());
  // canopy of neurons: instanced glowing points + soft leaf blobs
  const N = 420, pos = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const u = Math.random() * Math.PI * 2, v = Math.acos(2 * Math.random() - 1) * 0.55, r = 4 + Math.random() * 3.5; pos.set([Math.sin(v) * Math.cos(u) * r * 1.3, 12 + Math.cos(v) * r * 0.7, Math.sin(v) * Math.sin(u) * r * 1.3], i * 3); }
  const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ map: T.glowDot(), size: 0.9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xb6f7ff })); g.add(pts);
  const lm = new Merger(); for (let i = 0; i < 9; i++) { const a = i * 0.7; lm.add(new THREE.IcosahedronGeometry(2.6, 1), M.leafOlive, Math.sin(a) * 3.5, 11.5 + (i % 3), Math.cos(a) * 3.5, 0, 1, 0.8, 1); } const lf = lm.build(); lf.children.forEach((c) => (c.material = new THREE.MeshStandardMaterial({ map: M.leafOlive.map, color: 0x9fe0c0, transparent: true, opacity: 0.55, emissive: 0x104030, roughness: 1 }))); g.add(lf);
  const light = new THREE.PointLight(0x7ff3ff, 50, 30, 2); light.position.set(0, 12, 0); g.add(light);
  return { g, door: [0, 6], r: 5, top: 20, neurons: pts, label: label(g, "LEARNING", "the grove · Apollo", 21) };
};
B.ops = () => { // engine house + crystal reactor + turbines + watchtower
  const g = new THREE.Group(), m = new Merger();
  steps(m, 0, -2, 14, 10, 2, 0.35, M.stoneGrey); box(m, M.stone, 0, 0.7, -2, 12, 6, 8); m.add(new THREE.CylinderGeometry(4.2, 4.2, 12, 3, 1), M.roofBlue, 0, 7.2, -2, 0, 1, 0.25, 0.68, 0, Math.PI / 2);
  m.add(new THREE.CylinderGeometry(0.8, 1, 8, 12), M.stoneGrey, 4, 10, -4); box(m, M.dark, 0, 0.7, 2.05, 2.4, 3.8, 0.1);
  for (const s of [-1, 1]) column(m, s * 2, 3, 5.6, 0.3, M.marble, M.gold, "doric", 0.7);
  // reactor ring
  m.add(new THREE.TorusGeometry(2.4, 0.3, 8, 32), M.gold, -10, 3.5, 4); m.add(new THREE.CylinderGeometry(1.5, 2, 1, 16), M.stoneGrey, -10, 0.5, 4);
  // watchtower
  m.add(new THREE.CylinderGeometry(1.2, 1.6, 14, 10), M.stoneGrey, 10, 7, -8); m.add(new THREE.ConeGeometry(2.2, 3, 10), M.roof, 10, 15.5, -8);
  // turbine masts
  for (const [x, z] of [[-9, -9], [-14, -2]]) m.add(new THREE.CylinderGeometry(0.2, 0.35, 12, 8), M.marble, x, 6, z);
  g.add(m.build());
  const cr = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), new THREE.MeshStandardMaterial({ color: 0x5ef0ff, emissive: 0x22c8ff, emissiveIntensity: 2.2, transparent: true, opacity: 0.85 })); cr.position.set(-10, 3.5, 4); g.add(cr);
  const blades = []; for (const [x, z] of [[-9, -9], [-14, -2]]) { const b = new THREE.Group(); const bm = new Merger(); for (let k = 0; k < 3; k++) bm.add(new THREE.BoxGeometry(0.4, 4.5, 0.08), M.marble, Math.sin((k * Math.PI * 2) / 3) * 2.2, Math.cos((k * Math.PI * 2) / 3) * 2.2, 0, 0, 1, 1, 1, 0, -(k * Math.PI * 2) / 3); b.add(bm.build()); b.position.set(x, 12, z + 0.5); g.add(b); blades.push(b); }
  return { g, door: [0, 5.5], r: 9, top: 18, crystal: cr, blades, label: label(g, "OPS", "the engine house", 19) };
};
export function district(id, color) { return B[id](color); }

// Grok/ChatGPT embassy: small modern-greek pavilion with two banners and 7 seats
export function embassy() {
  const g = new THREE.Group(); const t = temple(new Merger(), { w: 9, d: 10, colH: 4.6, nx: 4, nz: 5, roof: M.roofBlue, cap: M.gold }); g.add(t);
  const m = new Merger(); for (const [s, c] of [[-1, "#111111"], [1, "#10a37f"]]) { m.add(new THREE.CylinderGeometry(0.08, 0.1, 8, 6), M.gold, s * 6, 4, 5); m.add(new THREE.PlaneGeometry(1.8, 3.2), tint(c), s * 6 + 0.95, 6, 5); }
  g.add(m.build());
  return { g, door: [0, 7.5], r: 7, top: 10, label: label(g, "EMBASSY", "Grok · ChatGPT", 11.5) };
}
// strategy tower: height from pnl; glowing ring band
export function strategyTower() {
  const g = new THREE.Group(); const m = new Merger();
  steps(m, 0, 0, 4, 4, 2, 0.3, M.marble); g.add(m.build());
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.25, 1, 6), new THREE.MeshStandardMaterial({ color: 0x0b2a3a, emissive: 0x22e0ff, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.4 })); shaft.position.y = 0.6; shaft.castShadow = true; g.add(shaft);
  const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), M.gold); g.add(cap);
  return { g, shaft, cap };
}

// ---- arena floor: triangle > circle > pentagram in gold, twelve Olympian symbols round the ring ----
function inlay() {
  const S = 2048, c = document.createElement("canvas"); c.width = c.height = S; const g = c.getContext("2d"); const C = S / 2, R = S * 0.33;
  g.strokeStyle = "#ffd76a"; g.lineWidth = 14; g.shadowColor = "#ffcf40"; g.shadowBlur = 30; g.lineJoin = "round";
  const tri = [0, 1, 2].map((k) => [C + Math.sin((k / 3) * Math.PI * 2 + Math.PI) * R * 2, C - Math.cos((k / 3) * Math.PI * 2 + Math.PI) * R * 2]);
  g.beginPath(); tri.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
  g.beginPath(); g.arc(C, C, R, 0, 7); g.stroke(); g.beginPath(); g.arc(C, C, R * 1.08, 0, 7); g.lineWidth = 6; g.stroke(); g.lineWidth = 14;
  const st = [0, 2, 4, 1, 3].map((k) => [C + Math.sin((k / 5) * Math.PI * 2) * R, C - Math.cos((k / 5) * Math.PI * 2) * R]);
  g.beginPath(); st.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
  const sym = [bolt, owl, lyre, caduceus, grapes, torch, trident, bow, hammer, peacock, wheat, dove];
  g.lineWidth = 9; g.strokeStyle = "#bff6ff"; g.fillStyle = "#bff6ff"; g.shadowColor = "#5ef0ff";
  sym.forEach((f, i) => { const a = (i / 12) * Math.PI * 2; const x = C + Math.sin(a) * R * 1.38, y = C - Math.cos(a) * R * 1.38; g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.arc(0, 0, 62, 0, 7); g.lineWidth = 5; g.stroke(); g.lineWidth = 8; f(g); g.restore(); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.09; m.renderOrder = 2; return m;
}
const P = (g, pts, close) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (close) g.closePath(); g.stroke(); };
const bolt = (g) => { g.beginPath(); g.moveTo(10, -44); g.lineTo(-14, 2); g.lineTo(6, 2); g.lineTo(-10, 44); g.lineTo(18, -8); g.lineTo(-2, -8); g.lineTo(14, -44); g.closePath(); g.fill(); };
const owl = (g) => { g.beginPath(); g.ellipse(0, 8, 26, 34, 0, 0, 7); g.stroke(); for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 11, -6, 9, 0, 7); g.stroke(); P(g, [[s * 8, -30], [s * 22, -42], [s * 24, -24]]); } P(g, [[-4, 6], [0, 12], [4, 6]]); };
const lyre = (g) => { P(g, [[-26, -36], [-30, 0], [-18, 34], [18, 34], [30, 0], [26, -36]]); P(g, [[-28, -30], [28, -30]]); for (let k = -2; k <= 2; k++) P(g, [[k * 8, -30], [k * 8, 32]]); };
const caduceus = (g) => { P(g, [[0, -46], [0, 46]]); g.beginPath(); for (let y = -30; y <= 34; y += 2) g.lineTo(Math.sin(y * 0.15) * 16, y); g.stroke(); g.beginPath(); for (let y = -30; y <= 34; y += 2) g.lineTo(-Math.sin(y * 0.15) * 16, y); g.stroke(); P(g, [[-30, -40], [0, -32], [30, -40]]); };
const grapes = (g) => { for (const [x, y] of [[-16, -14], [0, -14], [16, -14], [-8, 0], [8, 0], [0, 14], [-16, 0], [16, 0], [-8, 28 - 14], [8, 14], [0, 28]]) { g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); } P(g, [[0, -24], [6, -40]]); };
const torch = (g) => { for (const s of [-1, 1]) { P(g, [[s * 14, 40], [s * 14, -10]]); g.beginPath(); g.moveTo(s * 14, -40); g.quadraticCurveTo(s * 14 + 14, -20, s * 14, -12); g.quadraticCurveTo(s * 14 - 14, -20, s * 14, -40); g.fill(); } };
const trident = (g) => { P(g, [[0, 46], [0, -40]]); P(g, [[-22, -40], [-22, -16], [22, -16], [22, -40]]); P(g, [[-28, -32], [-22, -42], [-16, -32]]); P(g, [[-6, -34], [0, -46], [6, -34]]); P(g, [[16, -32], [22, -42], [28, -32]]); };
const bow = (g) => { g.beginPath(); g.arc(-30, 0, 46, -0.85, 0.85); g.stroke(); P(g, [[0, -34], [0, 34]]); P(g, [[-36, 0], [36, 0]]); P(g, [[26, -8], [36, 0], [26, 8]]); };
const hammer = (g) => { P(g, [[0, 44], [0, -18]]); g.fillRect(-28, -40, 56, 22); };
const peacock = (g) => { for (let k = -3; k <= 3; k++) { const a = k * 0.32 - Math.PI / 2; P(g, [[0, 30], [Math.cos(a) * 40, 30 + Math.sin(a) * 60 + 0]]); g.beginPath(); g.arc(Math.cos(a) * 42, 30 + Math.sin(a) * 62, 7, 0, 7); g.fill(); } };
const wheat = (g) => { P(g, [[0, 46], [0, -44]]); for (let y = -36; y < 16; y += 13) for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 9, y, 6, 11, s * 0.5, 0, 7); g.fill(); } };
const dove = (g) => { g.beginPath(); g.ellipse(0, 6, 30, 14, -0.2, 0, 7); g.stroke(); g.beginPath(); g.moveTo(-6, 0); g.quadraticCurveTo(-20, -40, 14, -36); g.quadraticCurveTo(4, -14, 8, 0); g.stroke(); g.beginPath(); g.arc(26, -4, 7, 0, 7); g.fill(); P(g, [[-28, 10], [-44, 20], [-40, 4]]); };

// ---- the amethyst: faceted purple crystal cluster with inner glow ----
function amethyst() {
  const grp = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x9b4dff, emissive: 0x6a1fd0, emissiveIntensity: 1.2, roughness: 0.12, metalness: 0.1, transmission: 0, transparent: true, opacity: 0.88, flatShading: true, clearcoat: 1 });
  const core = new THREE.MeshBasicMaterial({ color: 0xe0b8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const shard = (h, r) => { const g = new THREE.CylinderGeometry(r, r * 1.1, h, 6, 1); g.translate(0, h / 2, 0); const tip = new THREE.ConeGeometry(r, r * 1.8, 6); tip.translate(0, h + r * 0.9, 0); const m = new Merger(); m.add(g, mat); m.add(tip, mat); return m.build(true, false); };
  const big = shard(6.5, 1.1); grp.add(big);
  [[1.5, 0.2, 0.4, 0.6, 3.6], [-1.4, 0.1, -0.5, -0.55, 3.9], [0.4, -0.2, 1.4, 0.5, 2.8], [-0.6, 0, -1.5, -0.45, 3.0], [1.2, 0, -1.1, 0.7, 2.4], [-1.3, 0, 1.0, -0.7, 2.2]].forEach(([x, , z, tilt, h]) => { const s = shard(h, 0.55); s.position.set(x, 0, z); s.rotation.set(z * 0.25, 0, -tilt); grp.add(s); });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 14), core); glow.position.y = 3.6; glow.scale.set(1, 2.2, 1); grp.add(glow);
  const base = new Merger(); base.add(new THREE.CylinderGeometry(3.2, 3.6, 0.6, 32), M.marble, 0, 0.3, 0); base.add(new THREE.TorusGeometry(3.25, 0.12, 6, 48), M.gold, 0, 0.6, 0, 0, 1, 1, 1, Math.PI / 2); const b = base.build(); grp.add(b);
  const light = new THREE.PointLight(0xb070ff, 80, 34, 1.8); light.position.y = 5; grp.add(light);
  const holder = new THREE.Group(); holder.add(grp); holder.userData = { inner: grp, mat, glow, light, base: b }; grp.position.y = 0.6;
  return holder;
}
