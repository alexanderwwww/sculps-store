// Interiors: one room per building, built on first entry, placed below the sea (y = ROOM_Y) so the island can be hidden.
import * as THREE from "three";
import { M, Merger, uv, column, box, dome, tint } from "./kit.js";
import { Screen } from "./screens.js";
import * as T from "../textures.js";

export const ROOM_Y = -400;
// returns { g, bounds:{type:'rect',w,d}|{type:'circle',r}, spawn:Vector3, exit:Vector3, seats:[{x,z,ry,stand}], screens:{...} }
export function buildRoom(kind, A) {
  if (kind === "council") return councilRoom();
  if (kind === "hq") return hqRoom();
  return deptRoom(kind);
}
function floorWalls(m, w, d, h, wallMat = M.marbleWarm, floor = M.paving) {
  const f = new THREE.PlaneGeometry(w, d); f.rotateX(-Math.PI / 2); uv(f, w / 4, d / 4); m.add(f, floor, 0, 0, 0);
  const rim = new THREE.PlaneGeometry(w - 4, d - 4); rim.rotateX(-Math.PI / 2); uv(rim, (w - 4) / 6, (d - 4) / 6); m.add(rim, M.marble, 0, 0.02, 0);
  box(m, wallMat, 0, 0, -d / 2, w, h, 0.6, 0, 5); box(m, wallMat, -w / 2, 0, 0, 0.6, h, d, 0, 5); box(m, wallMat, w / 2, 0, 0, 0.6, h, d, 0, 5);
  box(m, wallMat, -w / 4 - 1.5, 0, d / 2, w / 2 - 3, h, 0.6, 0, 5); box(m, wallMat, w / 4 + 1.5, 0, d / 2, w / 2 - 3, h, 0.6, 0, 5); box(m, wallMat, 0, h - 1.5, d / 2, 6, 1.5, 0.6);
  // gold cornice + pilasters
  for (const [x, z, ww, dd] of [[0, -d / 2 + 0.35, w, 0.2], [-w / 2 + 0.35, 0, 0.2, d], [w / 2 - 0.35, 0, 0.2, d]]) box(m, M.gold, x, h - 0.6, z, ww, 0.3, dd);
  for (let i = 0; i < Math.floor(w / 6); i++) { const x = -w / 2 + 3 + i * 6; if (Math.abs(x) < 13) continue; column(m, x, -d / 2 + 0.9, h - 0.6, 0.35, M.marble, M.gold, "ionic"); }
  for (let j = 0; j < Math.floor(d / 6); j++) { const z = -d / 2 + 3 + j * 6; column(m, -w / 2 + 0.9, z, h - 0.6, 0.35, M.marble, M.gold, "ionic"); column(m, w / 2 - 0.9, z, h - 0.6, 0.35, M.marble, M.gold, "ionic"); }
  // door frame
  for (const s of [-1, 1]) column(m, s * 3.2, d / 2 - 0.2, h - 1.5, 0.4, M.marble, M.gold, "ionic");
}
function desk(m, x, z, ry = 0) {
  box(m, M.wood, x, 0, z, 1.8, 0.85, 0.9, ry); box(m, M.gold, x, 0.85, z, 1.85, 0.05, 0.95, ry);
  const s = Math.sin(ry), c = Math.cos(ry);
  m.add(new THREE.BoxGeometry(0.9, 0.55, 0.05), M.cyan, x - s * 0.3, 1.25, z - c * 0.3, ry);
  m.add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), M.bronze, x - s * 0.32, 1.0, z - c * 0.32);
  m.add(new THREE.CylinderGeometry(0.3, 0.3, 0.46, 14), M.marble, x + s * 0.85, 0.23, z + c * 0.85); // stool
}
function deptRoom(kind) {
  const g = new THREE.Group(), m = new Merger(); const W = 30, D = 24, H = 8;
  floorWalls(m, W, D, H, kind === "risk" || kind === "ops" ? M.stoneGrey : M.marbleWarm, kind === "setups" ? M.paving : M.paving);
  const seats = []; // 4 x 3 desks + extras row
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const x = -9 + c * 6, z = -5 + r * 4.2; desk(m, x, z, Math.PI); seats.push({ x, z: z - 0.85, ry: Math.PI, desk: [x, z] }); }
  // centerpiece per department
  const cx = 0, cz = 8.5;
  if (kind === "costs") { m.add(new THREE.CylinderGeometry(0.15, 0.3, 4, 8), M.gold, cx, 2, -D / 2 + 2); m.add(new THREE.BoxGeometry(5, 0.15, 0.15), M.gold, cx, 4, -D / 2 + 2); for (const s of [-1, 1]) m.add(new THREE.CylinderGeometry(0.7, 0.3, 0.2, 16), M.gold, cx + s * 2.4, 2.8, -D / 2 + 2); }
  if (kind === "risk") { m.add(new THREE.CylinderGeometry(0.15, 0.15, 3, 8), M.red, -W / 2 + 3, 1.5, -D / 2 + 3, 0, 1, 1, 1, 0, 0.4); m.add(new THREE.SphereGeometry(0.45, 12, 8), M.redGlow, -W / 2 + 3 - 0.6, 2.9, -D / 2 + 3); }
  if (kind === "learning") { m.add(new THREE.CylinderGeometry(0.35, 0.7, 4, 10), M.trunk, -W / 2 + 4, 2, -D / 2 + 4); m.add(new THREE.IcosahedronGeometry(2.2, 1), M.cyan, -W / 2 + 4, 5, -D / 2 + 4); }
  if (kind === "ops") { m.add(new THREE.OctahedronGeometry(1.1), M.cyan, -W / 2 + 4, 2.4, -D / 2 + 4); m.add(new THREE.TorusGeometry(1.8, 0.2, 8, 24), M.gold, -W / 2 + 4, 2.4, -D / 2 + 4); }
  if (kind === "setups") { const mo = new THREE.PlaneGeometry(7, 7); mo.rotateX(-Math.PI / 2); m.add(mo, M.mosaic, cx, 0.04, cz); }
  if (kind === "scouts_sol") { m.add(new THREE.CylinderGeometry(0.25, 0.4, 3, 10), M.bronze, -W / 2 + 3, 2.2, -D / 2 + 3, 0, 1, 1, 1, 0.6, 0.3); }
  if (kind === "execution") { const h = new THREE.LatheGeometry([0, 0.3, 0.6, 0.8].map((r, i) => new THREE.Vector2(r, i * 0.25)), 14); h.scale(1, 1, 3); m.add(h, M.wood, -W / 2 + 4, 0.8, -D / 2 + 4, Math.PI / 2); }
  if (kind === "whales" || kind === "news") for (let i = 0; i < 4; i++) m.add(new THREE.PlaneGeometry(1.2, 2.6), tint(["#2f5bd5", "#c03fb0", "#d4a020", "#1aa6c8"][i]), -W / 2 + 0.4, 4.2, -6 + i * 4, Math.PI / 2);
  if (kind === "review") for (let i = 0; i < 6; i++) box(m, M.wood, W / 2 - 1.2, 0, -8 + i * 3, 1, 4.5, 2.4);
  g.add(m.build());
  // wall screens: big one on the back wall = this dept's workers; side = dept data
  const big = new Screen(16, 6.4, 1280); big.mesh.position.set(0, 4.6, -D / 2 + 0.45); g.add(big.mesh);
  const side = new Screen(9, 5.4, 1024); side.mesh.position.set(W / 2 - 0.45, 4.2, 2); side.mesh.rotation.y = -Math.PI / 2; g.add(side.mesh);
  addLights(g, W, D, H);
  return { g, bounds: { type: "rect", w: W - 2.4, d: D - 1.6 }, spawn: new THREE.Vector3(0, 0, D / 2 - 7.5), exit: new THREE.Vector3(0, 0, D / 2 - 0.2), seats, screens: { big, side }, kind };
}
function councilRoom() {
  const g = new THREE.Group(), m = new Merger(); const R = 13, H = 9;
  const f = new THREE.CircleGeometry(R, 64); f.rotateX(-Math.PI / 2); uv(f, 4, 4); m.add(f, M.paving, 0, 0, 0);
  const mo = new THREE.CircleGeometry(5, 48); mo.rotateX(-Math.PI / 2); m.add(mo, M.gold, 0, 0.02, 0);
  const wall = new THREE.CylinderGeometry(R, R, H, 64, 1, true, 0.35, Math.PI * 2 - 0.7); wall.rotateY(Math.PI / 2 - 0.0); uv(wall, 10, 2);
  m.add(wall, M.marbleWarm, 0, H / 2, 0, -Math.PI / 2 + Math.PI / 2);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; if (Math.abs(Math.sin(a / 2 - Math.PI / 2)) < 0.12) continue; column(m, Math.sin(a) * (R - 0.8), Math.cos(a) * (R - 0.8), H - 0.4, 0.4, M.gold, M.gold, "ionic"); }
  m.add(new THREE.TorusGeometry(R - 0.3, 0.3, 6, 64), M.gold, 0, H, 0, 0, 1, 1, 1, Math.PI / 2);
  // round table
  m.add(new THREE.CylinderGeometry(4.2, 4.2, 0.25, 48), M.marble, 0, 1.0, 0); m.add(new THREE.TorusGeometry(4.2, 0.1, 6, 48), M.gold, 0, 1.1, 0, 0, 1, 1, 1, Math.PI / 2); m.add(new THREE.CylinderGeometry(1, 1.4, 1, 24), M.marbleWarm, 0, 0.5, 0);
  const seats = []; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + Math.PI / 12; const x = Math.sin(a) * 5.4, z = Math.cos(a) * 5.4;
    m.add(new THREE.BoxGeometry(0.9, 0.5, 0.9), M.gold, x, 0.25, z, a); m.add(new THREE.BoxGeometry(0.9, 1.5, 0.12), M.gold, Math.sin(a) * 5.9, 1.0, Math.cos(a) * 5.9, a);
    seats.push({ x, z, ry: a + Math.PI, round: true }); }
  g.add(m.build());
  const vs = new Screen(3, 3, 512); vs.mesh.position.set(0, 3.2, 0); g.add(vs.mesh); vs.back();
  const vet = new Screen(14, 6, 1280); vet.mesh.position.set(0, 5, -R + 1.2); g.add(vet.mesh);
  addLights(g, R * 2, R * 2, H); const gl = new THREE.PointLight(0xffd070, 40, 20, 2); gl.position.set(0, 6, 0); g.add(gl);
  return { g, bounds: { type: "circle", r: R - 1.6 }, spawn: new THREE.Vector3(0, 0, R - 6), exit: new THREE.Vector3(0, 0, R - 0.8), seats, screens: { verdict: vs, vetoes: vet }, kind: "council" };
}
function hqRoom() { // Alex's boss office at the top of the colosseum: wall of screens + panoramic window
  const g = new THREE.Group(), m = new Merger(); const W = 34, D = 26, H = 10;
  floorWalls(m, W, D, H, M.marble, M.paving);
  box(m, M.wood, 0, 0, 4, 4.2, 0.95, 1.8); box(m, M.gold, 0, 0.95, 4, 4.3, 0.06, 1.9); // CEO desk
  m.add(new THREE.BoxGeometry(1.1, 1.8, 0.2), new THREE.MeshStandardMaterial({ color: 0x7a1020, roughness: 0.6 }), 0, 1.1, 5.6); // throne-ish chair back
  // olive planters
  for (const s of [-1, 1]) { m.add(new THREE.CylinderGeometry(0.8, 0.6, 1, 16), M.gold, s * 13, 0.5, 8); m.add(new THREE.IcosahedronGeometry(1.4, 1), M.leafOlive, s * 13, 2.6, 8); }
  g.add(m.build());
  // panoramic window on the left wall: painted sky band
  const c = document.createElement("canvas"); c.width = 512; c.height = 128; const gg = c.getContext("2d"); const gr = gg.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "#26306a"); gr.addColorStop(0.6, "#f2a06a"); gr.addColorStop(1, "#2a7fa0"); gg.fillStyle = gr; gg.fillRect(0, 0, 512, 128);
  const wt = new THREE.CanvasTexture(c); wt.colorSpace = THREE.SRGBColorSpace; const win = new THREE.Mesh(new THREE.PlaneGeometry(D - 6, 5), new THREE.MeshBasicMaterial({ map: wt })); win.position.set(-W / 2 + 0.35, 5, 0); win.rotation.y = Math.PI / 2; g.add(win);
  const neur = new Screen(24, 7.4, 1600); neur.mesh.position.set(0, 5.1, -D / 2 + 0.45); g.add(neur.mesh);
  const wal = new Screen(9, 5.4, 1024); wal.mesh.position.set(W / 2 - 0.45, 4.4, -5); wal.mesh.rotation.y = -Math.PI / 2; g.add(wal.mesh);
  const xs = new Screen(9, 5.4, 1024); xs.mesh.position.set(W / 2 - 0.45, 4.4, 5.5); xs.mesh.rotation.y = -Math.PI / 2; g.add(xs.mesh);
  addLights(g, W, D, H);
  return { g, bounds: { type: "rect", w: W - 2.4, d: D - 1.6 }, spawn: new THREE.Vector3(0, 0, D / 2 - 7.5), exit: new THREE.Vector3(0, 0, D / 2 - 0.2), seats: [], screens: { neurons: neur, wallet: wal, x: xs }, kind: "hq" };
}
export function embassyRoom() {
  const r = deptRoom("embassy"); r.kind = "embassy"; return r;
}
function addLights(g, W, D, H) {
  for (const [x, z] of [[-W / 4, 0], [W / 4, 0]]) { const l = new THREE.PointLight(0xffe0b0, 35, Math.max(W, D), 1.6); l.position.set(x, H - 1, z); g.add(l); }
  // braziers / lanterns visual
  const m = new Merger(); for (const [x, z] of [[-W / 2 + 2, D / 2 - 2], [W / 2 - 2, D / 2 - 2]]) { m.add(new THREE.CylinderGeometry(0.1, 0.15, 2.2, 8), M.bronze, x, 1.1, z); m.add(new THREE.CylinderGeometry(0.45, 0.2, 0.35, 12), M.gold, x, 2.3, z); }
  g.add(m.build());
  for (const [x, z] of [[-W / 2 + 2, D / 2 - 2], [W / 2 - 2, D / 2 - 2]]) { const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.flame(), transparent: true, depthWrite: false })); f.scale.set(0.6, 1.1, 1); f.position.set(x, 2.95, z); f.userData.flame = true; g.add(f); }
}
