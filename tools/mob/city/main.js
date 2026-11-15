// THE CITY client. Everything here is read-only: it fetches /city/data (same-origin, admin session cookie) and renders.
import { THREE, Geo, G, hash, smooth, lerp, canvasTex, plasterTex, cylT } from "./gfx.js";
import { BUILDINGS, PLOTS, WORKERS, DISTRICTS, CALENDAR, TZ, layout, PLAZA } from "./config.mjs";
import { height, snowAmt, makeTerrain, buildTown, Atlas, HALF } from "./world.js";
import { makePerson, Walker, makeCat, makeBoat, makeGull, makeGenie, makeCoinCart, charMat } from "./actors.js";
import { buildGallery, buildRoom } from "./interior.js";
import { makeSky, makeSea, makeClouds, makeSnow, makeSmoke, makeHalos, mixPreset } from "./fx.js";

const $ = (id) => document.getElementById(id), qs = new URLSearchParams(location.search);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const coarse = matchMedia("(pointer:coarse)").matches || innerWidth < 700;
const ST = { open: "OPEN", construction: "UNDER CONSTRUCTION", closed: "CLOSED", planned: "PLANNED" };

async function loadData() {
  try { const r = await fetch("/city/data", { credentials: "same-origin" }); if (!(r.headers.get("content-type") || "").includes("json")) { location.href = "/login"; return null; } return await r.json(); } catch { return null; }
}
// ---- real date + hour in Alex's timezone (URL ?date=YYYY-MM-DD&hour=H only for testing screenshots) ----
function nowAthens() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const date = qs.get("date") || `${p.year}-${p.month}-${p.day}`, hour = qs.has("hour") ? Number(qs.get("hour")) : Number(p.hour) + Number(p.minute) / 60;
  return { date, hour, md: date.slice(5) };
}
const inRange = (md, f, t) => (f <= t ? md >= f && md <= t : md >= f || md <= t);

async function main() {
  const data = await loadData(); $("loadmsg").textContent = "Building the village…";
  await new Promise((r) => setTimeout(r, 30));
  const when = nowAthens(), events = CALENDAR.filter((e) => inRange(when.md, e.from, e.to)), decor = {};
  for (const e of events) { decor[e.decor] = true; if (e.decor === "celebrate") decor.christmas = true; }
  const mix = mixPreset(when.hour);
  const statusOf = (id) => { const b = data?.buildings?.[id]; if (b) return b.status; const c = BUILDINGS.find((x) => x.id === id); return c && c.status !== "auto" ? c.status : c?.idle || "open"; };

  // ---- renderer / scene ----
  const canvas = $("gl"), renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  const px = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 1.75); renderer.setPixelRatio(px); renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.3, 900);
  scene.fog = new THREE.Fog(0xf0c8a0, 70, 300);
  const sky = makeSky(); scene.add(sky);
  const sea = makeSea(); scene.add(sea);
  const clouds = makeClouds(); scene.add(clouds);
  const hemi = new THREE.HemisphereLight(0x9ac0ff, 0x8a6a3a, 0.8), key = new THREE.DirectionalLight(0xffc890, 3.2); scene.add(hemi, key, key.target);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); const sc = key.shadow.camera; sc.left = sc.bottom = -44; sc.right = sc.top = 44; sc.near = 1; sc.far = 220; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.05;

  // ---- town ----
  const atlas = new Atlas(), X = { halos: [], chimneys: [], colliders: [], picks: [], blades: [], cranes: [], doors: {}, spots: {}, platforms: [] };
  const L = layout();
  const plots = PLOTS.map((p, i) => ({ id: p.id, name: "For sale", kind: "plot", district: "plot", pos: p.pos, size: [6.4, 5.4, 4.2], accent: "#8a7a5a", trim: "#fff6e0", status: "planned", ry: Math.atan2(PLAZA[0] - p.pos[0], PLAZA[1] - p.pos[1]) }));
  const all = [...L, ...plots];
  const geo = buildTown(all, { status: (id) => (id.startsWith("plot") ? "planned" : statusOf(id)), atlas, decor, X });
  // plaza dressing (fountain, notice board, tree, lamps, gifts), same Geo -> merged
  const pg = new Geo(); pg.seed = 99; const PP = (t, s, p, c, r, tg) => pg.part(t, s, p, c, r || [0, 0, 0], tg || "solid"); const py = height(0, 0) + 0.2;
  PP("cyl", [3.4, 0.7, 3.4], [0, py + 0.35, 0], "#cfc6b4"); PP("cyl", [3.0, 0.1, 3.0], [0, py + 0.72, 0], "#4fc4e8"); PP("cyl", [0.5, 1.6, 0.5], [0, py + 1.3, 0], "#e8dcc0"); PP("cyl", [1.4, 0.2, 1.4], [0, py + 2.0, 0], "#d8ccb0"); PP("cyl", [0.2, 0.7, 0.2], [0, py + 2.4, 0], "#e8dcc0"); PP("sph", 0.4, [0, py + 2.9, 0], "#7ee6f4", [0, 0, 0], "glow");
  X.colliders.push({ x: 0, z: 0, hw: 3.6, hd: 3.6, ry: 0 });
  for (let a = 0; a < 6; a++) { const x = Math.cos(a * 1.047 + 0.3) * 10.5, z = Math.sin(a * 1.047 + 0.3) * 10.5, y = height(x, z); PP("cyl", [0.09, 3.0, 0.09], [x, y + 1.5, z], "#2a2a30"); PP("box", [0.4, 0.5, 0.4], [x, y + 3.1, z], "#ffcf6a", [0, 0, 0], "glow"); X.halos.push({ p: new THREE.Vector3(x, y + 3.1, z), s: 4, a: 1 }); }
  // notice board (east of the fountain)
  const BX = 8, BZ = 8, bY = height(BX, BZ); const bry = Math.atan2(-BX, -BZ);
  pg.base.makeRotationY(bry).setPosition(BX, bY, BZ); pg.baseY = null;
  PP("box", [0.2, 3.4, 0.2], [-2.0, 1.7, 0], "#6a4428"); PP("box", [0.2, 3.4, 0.2], [2.0, 1.7, 0], "#6a4428"); PP("box", [4.6, 3.0, 0.2], [0, 2.7, -0.1], "#5a3a20"); PP("box", [4.9, 0.3, 0.5], [0, 4.3, 0], "#5a3a20", [0, 0, 0]);
  X.boardFrame = pg.base.clone(); X.colliders.push({ x: BX, z: BZ, hw: 2.6, hd: 0.8, ry: bry }); X.picks.push({ id: "board", c: [BX, bY + 2.7, BZ], s: [5, 3.4, 1.4], ry: bry });
  X.doors.board = [BX + Math.sin(bry) * 3, BZ + Math.cos(bry) * 3];
  pg.base.identity();
  // Christmas tree + gifts in the square
  if (decor.christmas) {
    const tx = -7, tz = 6, ty = height(tx, tz);
    for (let k = 0; k < 4; k++) PP("cone", [2.6 - k * 0.55, 1.9, 2.6 - k * 0.55], [tx, ty + 1.6 + k * 1.15, tz], "#1f7a3a"); PP("cyl", [0.3, 1.0, 0.3], [tx, ty + 0.5, tz], "#5a3a20"); PP("ico", 0.4, [tx, ty + 6.4, tz], "#fff2a0", [0, 0, 0], "glow"); X.halos.push({ p: new THREE.Vector3(tx, ty + 6.4, tz), s: 6, a: 1 });
    for (let i = 0; i < 26; i++) { const a = i * 2.4, k = i / 26, r = (1 - k) * 2.1 + 0.2, y = ty + 1.2 + k * 4.2; const c = ["#ff4a4a", "#ffd84a", "#4aa8ff", "#ff8ad8"][i % 4]; PP("sph", 0.14, [tx + Math.cos(a) * r, y, tz + Math.sin(a) * r], c, [0, 0, 0], "glow"); if (i % 3 === 0) X.halos.push({ p: new THREE.Vector3(tx + Math.cos(a) * r, y, tz + Math.sin(a) * r), s: 1.6, a: 0.8 }); }
    for (let i = 0; i < 7; i++) { const gx = tx + 2.4 + (i % 3) * 0.9, gz = tz - 1 + Math.floor(i / 3) * 0.9, gy = height(gx, gz); PP("box", [0.7, 0.55 + (i % 2) * 0.25, 0.7], [gx, gy + 0.3, gz], ["#d82a2a", "#2a8a3a", "#f0c040", "#2a62c8"][i % 4], [0, i, 0]); PP("box", [0.74, 0.1, 0.12], [gx, gy + 0.42 + (i % 2) * 0.12, gz], "#fff", [0, i, 0]); }
    X.colliders.push({ x: tx, z: tz, hw: 1.6, hd: 1.6, ry: 0 });
  }
  // pier + fisherman spot
  let shoreZ = 40; while (height(14, shoreZ) > 0.3 && shoreZ < 130) shoreZ += 1;
  const pierX = 14, pierY = 1.0; for (let k = 0; k < 14; k++) { const z = shoreZ - 6 + k * 1.2; PP("box", [3.0, 0.16, 1.15], [pierX, pierY, z], k % 2 ? "#a8844e" : "#9a7646"); if (k % 3 === 0) for (const s of [-1, 1]) PP("cyl", [0.12, 3.2, 0.12], [pierX + s * 1.35, pierY - 1.2, z], "#5a3a20"); }
  const pierEnd = [pierX, shoreZ - 6 + 13 * 1.2];
  // trees (instanced), exclusions from colliders/plaza/shore
  const treeGeo = (() => { const t = new Geo(); t.seed = 5; t.part("cyl", [0.22, 1.5, 0.22], [0, 0.75, 0], "#6b5a48", [0, 0, 0.1]); t.part("cyl", [0.16, 1.1, 0.16], [0.18, 1.7, 0], "#6b5a48", [0, 0, -0.5]); for (let k = 0; k < 4; k++) t.part("ico", [1.1 + (k % 2) * 0.3, 0.8, 1.1], [Math.cos(k * 1.7) * 0.7, 2.3 + (k % 3) * 0.25, Math.sin(k * 1.7) * 0.7], ["#7b8f58", "#92a266", "#6a8450", "#a2b070"][k]); return t; })();
  const cypGeo = (() => { const t = new Geo(); t.seed = 6; t.part("cyl", [0.15, 0.8, 0.15], [0, 0.4, 0], "#5a4a38"); t.part(cylT(0.05, 0.8, 8), [1, 5.0, 1], [0, 3.0, 0], "#2a5a3a"); t.part("cone", [0.7, 2.0, 0.7], [0, 5.4, 0], "#2f6a40"); return t; })();
  const bushGeo = (() => { const t = new Geo(); t.seed = 7; t.part("ico", [0.7, 0.5, 0.7], [0, 0.35, 0], "#5a9a48"); t.part("ico", 0.28, [0.3, 0.7, 0.1], "#ff6fb0"); t.part("ico", 0.24, [-0.25, 0.65, 0.2], "#ffd8e8"); return t; })();
  const rockGeo = (() => { const t = new Geo(); t.seed = 8; t.part("ico", [0.9, 0.6, 0.8], [0, 0.3, 0], "#8d8678"); return t; })();
  const free = (x, z, pad) => { if (height(x, z) < 1.2) return false; if (Math.hypot(x, z) < 15) return false; for (const c of X.colliders) { const dx = x - c.x, dz = z - c.z; if (Math.hypot(dx, dz) < Math.max(c.hw, c.hd) + pad) return false; } if (Math.hypot(x - 8, z - 8) < 4) return false; return true; };
  const scatter = (g, n, pad, seedK, ok, sMin, sMax) => { const m = new THREE.InstancedMesh(g.mesh("solid", new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), true).geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), n); const d = new THREE.Object3D(); let c = 0;
    for (let i = 0; i < n * 8 && c < n; i++) { const x = (hash(i * seedK) - 0.5) * 210, z = (hash(i * seedK + 3.3) - 0.5) * 210; if (!free(x, z, pad) || (ok && !ok(x, z))) continue; d.position.set(x, height(x, z) - 0.05, z); d.rotation.y = hash(i + 4) * 6.28; d.scale.setScalar(sMin + hash(i + 8) * (sMax - sMin)); d.updateMatrix(); m.setMatrixAt(c++, d.matrix); }
    m.count = c; m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; return m; };
  const olives = scatter(treeGeo, 110, 5, 1.7, (x, z) => snowAmt(x, z) < 0.3, 0.9, 1.5), cyp = scatter(cypGeo, 36, 5, 2.9, (x, z) => snowAmt(x, z) < 0.3, 0.9, 1.3), bushes = scatter(bushGeo, 140, 3.5, 4.3, null, 0.8, 1.5), rocks = scatter(rockGeo, 60, 3, 5.1, null, 0.6, 2.2);
  // pines in the snow zone
  const pineGeo = (() => { const t = new Geo(); t.seed = 9; t.part("cyl", [0.2, 1.0, 0.2], [0, 0.5, 0], "#5a4030"); for (let k = 0; k < 3; k++) t.part("cone", [1.5 - k * 0.35, 1.7, 1.5 - k * 0.35], [0, 1.5 + k * 1.0, 0], "#2a6a4a"), t.part("cone", [1.0 - k * 0.25, 0.4, 1.0 - k * 0.25], [0, 2.3 + k * 1.0, 0], "#f4faff"); return t; })();
  const pines = scatter(pineGeo, 50, 4.5, 6.7, (x, z) => snowAmt(x, z) > 0.55, 1.0, 1.7);
  scene.add(olives, cyp, bushes, rocks, pines);
  // paths: from plaza ring to each door
  const paths = all.filter((b) => X.doors[b.id]).map((b) => { const d = X.doors[b.id]; const k = 14 / Math.hypot(d[0], d[1]); return [[d[0] * k, d[1] * k], [d[0], d[1]]]; });
  const terrain = makeTerrain(paths); scene.add(terrain);

  const plaster = plasterTex(), solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: plaster, roughness: 0.92, flatShading: true });
  const solid = geo.mesh("solid", solidMat); scene.add(solid);
  const psolid = pg.mesh("solid", solidMat); scene.add(psolid);
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); glowMat.color.setScalar(0.85);
  const glow = geo.mesh("glow", glowMat, false), pglow = pg.mesh("glow", glowMat, false); [glow, pglow].forEach((m) => m && scene.add(m));
  const atlasTex = atlas.texture(); const signMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: atlasTex, emissive: 0xffffff, emissiveMap: atlasTex, emissiveIntensity: 0.28, roughness: 0.8 });
  const signs = geo.mesh("sign", signMat, false); if (signs) { signs.castShadow = false; scene.add(signs); }

  // notice board texture (re-drawn when data arrives)
  const boardCv = document.createElement("canvas"); boardCv.width = 1024; boardCv.height = 640; const boardTex = new THREE.CanvasTexture(boardCv); boardTex.colorSpace = THREE.SRGBColorSpace; boardTex.anisotropy = 8;
  function drawBoard() {
    const x = boardCv.getContext("2d"); x.fillStyle = "#e6d3a6"; x.fillRect(0, 0, 1024, 640); x.fillStyle = "#3a2a14"; x.textBaseline = "top"; x.font = "800 46px Georgia,serif"; x.fillText("TOWN NOTICE BOARD", 40, 24);
    const row = (t, y, col) => { x.fillStyle = col; x.font = "600 27px 'Trebuchet MS',Arial"; let s = String(t); while (x.measureText(s).width > 940 && s.length > 8) s = s.slice(0, -2); x.fillText(s === t ? s : s + "…", 40, y); };
    let y = 92; x.fillStyle = "#8a2a1a"; x.font = "800 30px Georgia,serif"; x.fillText("Today's jobs", 40, y); y += 40;
    const b = data?.board; (b?.jobs || [{ t: "no data yet" }]).slice(0, 5).forEach((j) => { row("• " + j.t, y, "#3a2a14"); y += 36; });
    y += 12; x.fillStyle = "#1a5a2a"; x.font = "800 30px Georgia,serif"; x.fillText("Latest results", 40, y); y += 40;
    (b?.results?.length ? b.results : [{ t: "no data yet" }]).slice(0, 3).forEach((j) => { row("• " + j.t, y, "#3a2a14"); y += 36; });
    boardTex.needsUpdate = true;
  }
  drawBoard();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 2.7), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false })); board.material.color.setScalar(0.8);
  board.applyMatrix4(X.boardFrame.clone().multiply(new THREE.Matrix4().makeTranslation(0, 2.7, 0.02))); scene.add(board);

  // windmill blades (XERO) and cranes: tiny animated meshes
  const animated = [];
  for (const bl of X.blades) { const g = new THREE.Group(); const gm = new Geo(); gm.seed = 4; for (let k = 0; k < 4; k++) gm.part("box", [0.35, 3.2, 0.06], [0, 1.7, 0], "#f4efe4", [0, 0, k * Math.PI / 2]); gm.part("sph", 0.3, [0, 0, 0], "#8a5a34"); g.add(gm.mesh("solid", solidMat)); g.position.copy(bl.p); g.applyMatrix4(new THREE.Matrix4()); g.rotation.order = "YXZ"; g.userData.bl = bl; scene.add(g); animated.push(g); }
  const cranes = X.cranes.map((cr) => { const g = new THREE.Group(); const gm = new Geo(); gm.seed = 5; gm.part("box", [8.5, 0.35, 0.35], [3.2, 0, 0], "#f2b21c"); gm.part("box", [1.4, 0.8, 0.8], [-1.4, -0.3, 0], "#555"); gm.part("box", [0.08, 3.0, 0.08], [6.0, -1.6, 0], "#222"); gm.part("box", [0.4, 0.3, 0.4], [6.0, -3.2, 0], "#d82a2a"); g.add(gm.mesh("solid", solidMat)); g.position.copy(cr.p); scene.add(g); return g; });

  // fx
  const snow = makeSnow(); scene.add(snow); const smoke = makeSmoke(X.chimneys); scene.add(smoke); const halos = makeHalos(X.halos); scene.add(halos);
  for (const m of [snow, smoke, halos]) m.material.uniforms.px.value = px * (innerHeight / 900);

  // ---- actors ----
  const home = L.find((b) => b.id === "home"), hq = L.find((b) => b.id === "hq");
  const hero = makePerson({ suit: "#33446c", shirt: "#fbfbff", tie: "#c8323f", pants: "#2c3a5c", hair: "#4a2c18", hairHi: "#8a5a34", long: 4, scale: 1.18, skin: "#ecb48c", shoe: "#0e0e12", beard: false });
  hero.root.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(hero.root);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })); blob.rotation.x = -Math.PI / 2; scene.add(blob);
  const hdoor = X.doors.home; const P0 = { x: hdoor[0] + Math.sin(home.ry) * 2.2, z: hdoor[1] + Math.cos(home.ry) * 2.2 };
  const state = { x: P0.x, z: P0.z, y: 0, vy: 0, yaw: Math.atan2(PLAZA[0] - P0.x, PLAZA[1] - P0.z), speed: 0, face: 0, camYaw: Math.atan2(P0.x, P0.z) + Math.PI, camPitch: 0.32, camDist: 9, orbit: coarse && false, dismissed: "home", open: null };
  state.camYaw = Math.atan2(PLAZA[0] - P0.x, PLAZA[1] - P0.z) + Math.PI; // camera sits behind the hero, looking towards the plaza
  const people = [];
  const addPerson = (opts, pos, speed) => { const r = makePerson(opts); scene.add(r.root); const w = new Walker(r, pos, speed); people.push(w); return w; };
  // Perla (original stylised character): long black hair, summer dress, waves when the hero is near
  const pc = X.pool.c, perlaPos = [pc.x + Math.sin(home.ry) * 6.4, pc.z + Math.cos(home.ry) * 6.4];
  const perla = makePerson({ dress: "#ff8a6a", skin: "#e8b48c", hair: "#0c0a10", hairHi: "#2a2440", long: 5, scale: 1.12, shoe: "#fff0e0" }); perla.root.position.set(perlaPos[0], height(perlaPos[0], perlaPos[1]) + 0.35, perlaPos[1]); perla.root.rotation.y = Math.atan2(home.pos[0] - perlaPos[0], home.pos[1] - perlaPos[1]) + 0.6; scene.add(perla.root);
  perla.fixedY = perla.root.position.y;
  // workers: one per WORKERS entry, tied to a real building; state comes from data.workers
  const workers = WORKERS.map((w) => {
    const cot = L.find((b) => b.id === "wh-" + w.id), work = L.find((b) => b.id === w.home), live = data?.workers?.find((x) => x.id === w.id) || { s: "idle", t: "no data" };
    const c = new THREE.Color(w.color);
    if (w.id === "genie") return { w, live, genie: true };
    const wk = addPerson({ suit: "#" + c.clone().multiplyScalar(0.55).getHexString(), shirt: "#fff6e0", tie: w.color, pants: "#2a2a34", hair: ["#2a1810", "#5a3a20", "#1a1a1a", "#8a5a30", "#3a2a1a"][WORKERS.indexOf(w) % 5], long: 0, scale: 1.0, skin: ["#e3aa80", "#c88a60", "#f0c09a", "#a8704a", "#e8b890"][WORKERS.indexOf(w) % 5] }, [X.doors["wh-" + w.id][0], X.doors["wh-" + w.id][1]], 2.4);
    return { w, live, wk, cot, work, stop: 0, until: 0 };
  });
  // citizens at the supermarket (decoration): walk door -> ring -> back, hide while "inside"
  const sm = L.find((b) => b.id === "super"), shoppers = [0, 1, 2].map((i) => { const wk = addPerson({ suit: ["#c8503a", "#3a8a5a", "#8a5ad8"][i], shirt: "#fff", pants: ["#2a3a5a", "#5a4a3a", "#3a3a3a"][i], hair: ["#2a1810", "#c8a050", "#1a1a1a"][i], long: i === 1 ? 3 : 0, scale: 0.98, skin: ["#e3aa80", "#f0c09a", "#a8704a"][i] }, X.doors.super, 2.0); return { wk, t: i * 7, phase: 0 }; });
  // bank: banker + two guards
  const bk = L.find((b) => b.id === "bank"), bdoor = X.doors.bank, rgt = [Math.cos(bk.ry), -Math.sin(bk.ry)];
  const guard = (s) => { const r = makePerson({ suit: "#6a6a78", shirt: "#8a8a98", tie: "#f0c040", pants: "#4a4a58", hair: "#222", long: 0, scale: 1.12, skin: "#d8a074", beard: true }); r.root.position.set(bdoor[0] + rgt[0] * s * 2.6, height(bdoor[0], bdoor[1]), bdoor[1] + rgt[1] * s * 2.6); r.root.rotation.y = bk.ry; scene.add(r.root); return r; };
  const guards = [guard(1), guard(-1)];
  const banker = makePerson({ suit: "#3a2a1a", shirt: "#fff", tie: "#f0c040", pants: "#3a2a1a", hair: "#bbb", long: 0, scale: 1.0, skin: "#e8b890", beard: true }); const bkp = [bdoor[0] - rgt[0] * 6.2 + Math.sin(bk.ry) * 1.5, bdoor[1] - rgt[1] * 6.2 + Math.cos(bk.ry) * 1.5]; banker.root.position.set(bkp[0], height(bkp[0], bkp[1]), bkp[1]); banker.root.rotation.y = bk.ry + 0.2; scene.add(banker.root);
  const cart = makeCoinCart(); scene.add(cart);
  const cat = makeCat(); scene.add(cat); const cat1 = { x: 3, z: 4, tx: 3, tz: 4, wait: 0 };
  const fish = makePerson({ suit: "#3a6a8a", shirt: "#e8dcc0", pants: "#6a5a3a", hair: "#ddd", long: 0, scale: 1.05, skin: "#d8a074", beard: true }); fish.root.position.set(pierEnd[0], pierY + 0.08, pierEnd[1] - 0.2); fish.root.rotation.y = 0; scene.add(fish.root);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 3.2, 5), new THREE.MeshStandardMaterial({ color: "#6a4428" })); rod.position.set(pierEnd[0] + 0.3, pierY + 1.6, pierEnd[1] + 1.2); rod.rotation.x = 1.0; scene.add(rod);
  const bobber = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ color: "#e0383a" })); bobber.position.set(pierEnd[0] + 0.3, 0.1, pierEnd[1] + 3.8); scene.add(bobber);
  const boats = [makeBoat("#fff4e0", "#2a62c8"), makeBoat("#ffe0c0", "#c8503a"), makeBoat("#fff", "#3a8a5a")]; boats.forEach((b) => scene.add(b));
  const gulls = [0, 1, 2, 3, 4].map(() => { const g = makeGull(); scene.add(g); return g; });
  const genie = makeGenie(); genie.position.copy(X.genie); scene.add(genie); X.genieHome = X.genie.clone();
  const sparkle = (() => { const n = 60, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const r = 2 + hash(i) * 2.6, t = hash(i + 3) * 6.28; a[i * 3] = Math.cos(t) * r; a[i * 3 + 1] = hash(i + 5) * 6 - 1; a[i * 3 + 2] = Math.sin(t) * r; } const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(a, 3)); const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffe9a0, size: 0.28, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })); p.position.copy(X.genie); scene.add(p); return p; })();

  // ---- lights by real hour ----
  function applyLight() {
    const m = mixPreset(when.hour); scene.fog.color.copy(m.fog); renderer.setClearColor(m.fog); scene.background = null;
    sky.material.uniforms.top.value.copy(m.top); sky.material.uniforms.mid.value.copy(m.mid); sky.material.uniforms.low.value.copy(m.low); sky.material.uniforms.sun.value.copy(m.sun); sky.material.uniforms.sd.value.set(...m.sunDir).normalize(); sky.material.uniforms.stars.value = m.night;
    key.color.copy(m.key); key.intensity = m.keyI; hemi.color.copy(m.hemiS); hemi.groundColor.copy(m.hemiG); hemi.intensity = m.hemiI; renderer.toneMappingExposure = m.exp; sea.material.color.copy(m.sea);
    const sd = new THREE.Vector3(...m.sunDir).normalize(); key.userData.dir = sd; halos.material.uniforms.k.value = 0.25 + m.glow * 0.75; glowMat.color.setScalar(0.7 + m.glow * 0.5);
    clouds.material.emissiveIntensity = 0.5 * (1 - m.night * 0.8); scene.userData.night = m.night;
  }
  applyLight();

  // ---- collision / movement ----
  const inBox = (c, x, z, pad) => { const dx = x - c.x, dz = z - c.z, cs = Math.cos(c.ry), sn = Math.sin(c.ry); return Math.abs(dx * cs - dz * sn) < c.hw + pad && Math.abs(dx * sn + dz * cs) < c.hd + pad; };
  let inside = null, busy = false; const blk = (x, z) => (inside ? inside.blocked(x, z) : blocked(x, z)), gAt = (x, z) => (inside ? 0 : groundAt(x, z));
  const blocked = (x, z) => { if (height(x, z) < 0.28 && !onPier(x, z)) return true; for (const c of X.colliders) if (inBox(c, x, z, 0.45)) return true; if (X.pool && inBox({ x: X.pool.c.x, z: X.pool.c.z, hw: 4.9, hd: 2.6, ry: X.pool.ry }, x, z, 0.1)) return true; return Math.hypot(x, z) > 118; };
  const onPier = (x, z) => Math.abs(x - pierX) < 1.4 && z > shoreZ - 6.6 && z < pierEnd[1] + 0.2;
  const groundAt = (x, z) => { let y = height(x, z); if (onPier(x, z)) y = Math.max(y, pierY + 0.1); for (const p of X.platforms) if (inBox(p, x, z, 0)) y = Math.max(y, p.y); return y; };

  // ---- input ----
  const keys = {}; addEventListener("keydown", (e) => { keys[e.code] = true; if (e.code === "KeyE") openNearest(); if (e.code === "Escape") closePanel(); if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault(); }); addEventListener("keyup", (e) => (keys[e.code] = false));
  const joy = { x: 0, z: 0 }; let drag = null, orbitMode = false;
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => { if (!drag) { hover(e); return; } const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; state.camYaw -= dx * 0.0058; state.camPitch = Math.min(1.25, Math.max(0.05, state.camPitch + dy * 0.004)); });
  canvas.addEventListener("pointerup", (e) => { if (drag && drag.moved < 6) pick(e.clientX, e.clientY); drag = null; });
  canvas.addEventListener("wheel", (e) => { state.camDist = Math.min(60, Math.max(3.5, state.camDist * (1 + e.deltaY * 0.0012))); e.preventDefault(); }, { passive: false });
  if (coarse) { $("joy").style.display = "block"; const j = $("joy"), k = j.firstElementChild; const set = (e) => { const r = j.getBoundingClientRect(), dx = e.clientX - (r.left + 60), dy = e.clientY - (r.top + 60), l = Math.min(1, Math.hypot(dx, dy) / 50), a = Math.atan2(dy, dx); joy.x = Math.cos(a) * l; joy.z = -Math.sin(a) * l; k.style.transform = `translate(${Math.cos(a) * l * 40}px,${Math.sin(a) * l * 40}px)`; }; j.addEventListener("pointerdown", (e) => { j.setPointerCapture(e.pointerId); set(e); }); j.addEventListener("pointermove", (e) => { if (e.buttons || e.pressure) set(e); }); j.addEventListener("pointerup", () => { joy.x = joy.z = 0; k.style.transform = ""; }); }
  const ray = new THREE.Raycaster(), pickGroup = new THREE.Group(); scene.add(pickGroup);
  for (const p of X.picks) { const m = new THREE.Mesh(new THREE.BoxGeometry(...p.s), new THREE.MeshBasicMaterial()); m.position.set(...p.c); m.rotation.y = p.ry; m.userData.id = p.id; m.visible = false; pickGroup.add(m); }
  const genieHit = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 5), new THREE.MeshBasicMaterial()); genieHit.visible = false; genieHit.userData.id = "hq"; pickGroup.add(genieHit);
  const ndc = new THREE.Vector2(); function pickAt(cx, cy) { ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); const h = ray.intersectObjects(pickGroup.children, false)[0]; return h ? h.object.userData.id : null; }
  let lastHover = 0; function hover(e) { const n = performance.now(); if (n - lastHover < 120) return; lastHover = n; canvas.style.cursor = pickAt(e.clientX, e.clientY) ? "pointer" : "default"; }
  function pick(cx, cy) { if (inside) { ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); const h = ray.intersectObjects(inside.items.map((i) => i.mesh), false)[0]; if (h) showItem(h.object.userData.item); return; } const id = pickAt(cx, cy); if (id) openPanel(id, true); }
  $("snow").onclick = () => { snowOn = !snowOn; $("snow").textContent = "Snow: " + (snowOn ? "on" : "off"); };
  $("orbit").onclick = () => { orbitMode = !orbitMode; $("orbit").textContent = orbitMode ? "Walk view" : "Orbit view"; };
  $("x").onclick = () => closePanel();
  let snowOn = qs.get("snow") !== "0";

  // ---- panels ----
  const byId = Object.fromEntries(all.map((b) => [b.id, b]));
  function openPanel(id, user) {
    const b = byId[id], d = data?.buildings?.[id]; let h = "";
    if (id === "board") { const bd = data?.board; h = `<h2>Town notice board</h2><div class="dist">Square</div><p>Today's active jobs and the latest results, read from our own data.</p><h3>Today's jobs</h3><ul>${(bd?.jobs || [{ t: "no data yet" }]).map((j) => `<li>${esc(j.t)}${j.s ? `<small>${esc(j.s)}</small>` : ""}</li>`).join("")}</ul><h3>Latest results</h3><ul>${(bd?.results?.length ? bd.results : [{ t: "no data yet" }]).map((j) => `<li>${esc(j.t)}<small>${esc(j.s)}</small></li>`).join("")}</ul><h3>Headlines</h3><ul>${(bd?.news?.length ? bd.news : [{ t: "no data yet" }]).map((j) => `<li>${esc(j.t)}<small>${esc(j.s)}</small></li>`).join("")}</ul>`; }
    else if (b?.kind === "plot") h = `<h2>For sale / coming</h2><div class="dist">Open plot</div><p>An empty plot for a future business. Add one entry to <b>tools/mob/city/config.mjs</b> (BUILDINGS) and it appears here with a sign and a panel.</p>`;
    else if (b?.kind === "super") h = `<h2>${esc(b.name)}</h2><div class="dist">Decoration</div><p>Just a supermarket. Nothing here is for sale. (Aisle 3 is protein. Goal: 96 kg by 25 Dec.)</p>`;
    else if (b?.kind === "workerhome") { const w = workers.find((x) => "wh-" + x.w.id === id); h = `<h2>${esc(b.name)}</h2><div class="dist">Worker neighbourhood</div><span class="st open">${esc(w?.live.s === "working" ? "AT WORK" : "RESTING")}</span><p>${esc(w?.live.t || "no data")}</p><p>Works at: <b>${esc(byId[w?.w.home]?.name || "")}</b>. Task hook (not wired): POST /api/aquarius/say.</p>`; }
    else if (d) {
      h = `<h2>${esc(d.name)}</h2><div class="dist">${esc(DISTRICTS[d.district]?.name || d.district)}${d.skill ? " · skill: " + esc(d.skill) : ""}</div><span class="st ${d.status}">${ST[d.status] || d.status}</span><small style="opacity:.6">${esc(d.why)}</small><p>${esc(d.purpose)}</p>`;
      if (d.kpis.length) h += `<div class="kp">${d.kpis.map((k) => `<div class="${k.no ? "no" : ""}"><small>${esc(k.l)}${k.tag ? `<span class="tg ${k.tag}">${esc(k.tag)}</span>` : ""}</small><b>${esc(k.v)}</b></div>`).join("")}</div>`;
      for (const n of d.notes) h += `<p>${esc(n)}</p>`;
      for (const l of d.lists) h += `<h3>${esc(l.title)}</h3><ul>${l.rows.map((r) => `<li>${esc(r.t)}${r.tag ? `<span class="tg">${esc(r.tag)}</span>` : ""}${r.s ? `<small>${esc(r.s)}</small>` : ""}</li>`).join("")}</ul>`;
      if (d.next?.length) h += `<h3>What we should build next</h3><ul>${d.next.map((r) => `<li>${esc(r.t)}<small>${esc(r.s)}</small></li>`).join("")}</ul>`;
    } else if (b) h = `<h2>${esc(b.name)}</h2><p>${esc(b.purpose || "")}</p><p>No data yet.</p>`;
    else return;
    h += `<div class="asof">Live data as of ${esc(data?.asof ? new Date(data.asof).toLocaleTimeString() : "n/a")}. Read-only.</div>`;
    $("pc").innerHTML = h; $("panel").classList.add("on"); state.open = id; if (user) state.dismissed = null;
  }
  function closePanel() { $("panel").classList.remove("on"); state.dismissed = state.open; state.open = null; }
  let nearId = null; function openNearest() { if (inside) { if (curItem?.screen) openPanel(inside.buildingId, true); else if (curItem) showItem(curItem); return; } if (nearId && byId[nearId] && byId[nearId].kind !== "plot" && !busy) enterBuilding(nearId); else if (nearId) openPanel(nearId, true); }

  // ---- enterable buildings ----
  let curItem = null, productsP = null; const fade = $("fade"), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getProducts = () => (productsP ||= fetch("/city/products", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({ items: [] })));
  async function enterBuilding(id) {
    if (busy || inside) return; busy = true; fade.style.opacity = 1; await sleep(380);
    $("panel").classList.remove("on"); state.open = null; for (const k in chips) chips[k].style.display = "none"; $("tip").style.display = "none";
    const b = byId[id]; inside = b.interior === "gallery" ? buildGallery({ items: (await getProducts()).items || [] }) : buildRoom({ b, panel: data?.buildings?.[id] }); inside.buildingId = id; inside.scene.userData.px = px;
    state.out = { x: state.x, z: state.z }; scene.remove(hero.root, blob); inside.scene.add(hero.root, blob);
    state.x = inside.spawn.x; state.z = inside.spawn.z; state.y = 0; state.vy = 0; state.face = inside.spawn.yaw; state.camYaw = 0; state.camPitch = 0.3; camInit = false; manual = null;
    $("help").textContent = "WASD walk · E on a display opens it · walk to the green EXIT door to leave"; fade.style.opacity = 0; busy = false;
    window.__city.inside = { rooms: inside.rooms, items: inside.items.length };
  }
  async function leaveBuilding() {
    if (busy || !inside) return; busy = true; fade.style.opacity = 1; await sleep(380); const b = byId[inside.buildingId];
    inside.scene.remove(hero.root, blob); scene.add(hero.root, blob); inside.dispose(); inside = null; curItem = null;
    const d = X.doors[b.id]; const ox = Math.sin(b.ry), oz = Math.cos(b.ry); state.x = d[0] + ox * 3.2; state.z = d[1] + oz * 3.2; state.y = height(state.x, state.z); state.face = b.ry; state.camYaw = b.ry + Math.PI; camInit = false; state.noEnter = tAll + 2.5; state.dismissed = b.id;
    $("help").textContent = HELP; fade.style.opacity = 0; busy = false; window.__city.inside = null;
  }
  function showItem(it) { const d = it.data; $("pc").innerHTML = `<h2>${esc(d.title)}</h2><div class="dist">Mysterious Archive · gallery</div><span class="st ${d.available ? "open" : "closed"}">${d.available ? "AVAILABLE" : "SOLD"}</span><p style="font-size:22px;font-weight:700;color:#ffd98a">${d.available ? esc(new Intl.NumberFormat("en-US", { style: "currency", currency: d.currency || "USD" }).format((d.price_cents || 0) / 100)) : "Sold"}</p>${d.img ? `<img src="/city/img?p=${encodeURIComponent(d.img)}" alt="" style="width:100%;border-radius:10px;margin:6px 0">` : ""}<p>${esc(d.desc)}</p><p><a href="${esc(d.url)}" target="_blank" rel="noopener" style="color:#ffd98a">Open the real product page</a></p><div class="asof">Live from the store's products. Read-only.</div>`; $("panel").classList.add("on"); }
  function insideUpdate(dt, l) {
    inside.update(dt, state.x, state.z, tAll); curItem = inside.nearest(state.x, state.z);
    const tip = $("tip"); if (curItem) { tip.style.display = "block"; tip.textContent = curItem.screen ? "Live screen · press E for the full panel" : `${curItem.data.title.slice(0, 48)} · press E`; } else tip.style.display = "none";
    if (curItem === null && state.open !== "x") { /* keep panel until closed */ }
    if (Math.hypot(state.x - inside.exit.x, state.z - inside.exit.z) < inside.exit.r && state.z > inside.exit.z - 1.4) leaveBuilding();
    miniT += dt; if (miniT > 0.15) { miniT = 0; drawMini(); }
  }
  // ---- labels (nearby names) and bubbles ----
  const HELP = $("help").textContent; const labelsEl = $("labels"), chips = {}; const mkChip = (id, cls = "") => { const d = document.createElement("div"); if (cls) d.className = cls; labelsEl.appendChild(d); chips[id] = d; return d; };
  const chipFor = (id, text) => (chips[id] || mkChip(id)).textContent !== text ? ((chips[id].textContent = text), chips[id]) : chips[id];
  const proj = new THREE.Vector3(); const place = (id, wp, text, cls) => { const el = chips[id] || mkChip(id, cls); if (el.textContent !== text) el.textContent = text; proj.copy(wp).project(camera); const vis = proj.z < 1 && proj.z > -1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1; el.style.display = vis ? "block" : "none"; if (vis) { el.style.left = (proj.x * 0.5 + 0.5) * innerWidth + "px"; el.style.top = (-proj.y * 0.5 + 0.5) * innerHeight + "px"; } };

  // ---- HUD ----
  const fm = (m) => { const k = Object.keys(m || {}); return k.length ? k.map((c) => new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(m[c] / 100)).join(" + ") : "$0"; };
  function drawHud() { const t = data?.totals; $("tot").innerHTML = t ? `Auto (orders) 30d: <b style="color:#fff">${esc(fm(t.auto30))}</b> · <span style="color:#ffd98a">Manual</span> 30d: <b style="color:#fff">${esc(fm(t.manual30))}</b> · visitors today ${t.visitorsToday}${events.length ? " · " + esc([...new Set(events.map((e) => e.note))].join(", ")) : ""}` : "no data yet"; }
  drawHud();

  // ---- minimap ----
  const mini = $("mini"), mx = mini.getContext("2d"), MS = 160, mapBase = document.createElement("canvas"); mapBase.width = mapBase.height = MS; { const c = mapBase.getContext("2d"), id = c.createImageData(MS, MS); for (let j = 0; j < MS; j++) for (let i = 0; i < MS; i++) { const x = (i / MS - 0.5) * 230, z = (j / MS - 0.5) * 230, h = height(x, z), o = (j * MS + i) * 4, s = snowAmt(x, z); const col = h < 0 ? [40, 110, 150] : h < 1 ? [226, 205, 150] : s > 0.5 ? [236, 242, 252] : [110, 150, 70]; id.data.set([...col, 255], o); } c.putImageData(id, 0, 0); }
  const dotCol = { open: "#3aa876", construction: "#f2b21c", closed: "#888", planned: "#6a8ad8" };
  function drawMini() { mx.clearRect(0, 0, MS, MS); mx.save(); mx.beginPath(); mx.arc(80, 80, 79, 0, 7); mx.clip(); mx.drawImage(mapBase, 0, 0); const P = (x, z) => [(x / 230 + 0.5) * MS, (z / 230 + 0.5) * MS]; for (const b of all) { const [a, c] = P(b.pos[0], b.pos[1]); mx.fillStyle = dotCol[b.kind === "plot" ? "planned" : statusOf(b.id)] || "#fff"; mx.fillRect(a - 1.5, c - 1.5, 3, 3); } const [hx, hz] = P(state.x, state.z); mx.fillStyle = "#ff3a3a"; mx.beginPath(); mx.arc(hx, hz, 3, 0, 7); mx.fill(); mx.restore(); }

  // ---- loop ----
  let lastT = performance.now(); let acc = 0, tAll = 0, frames = 0, miniT = 0, lightT = 0; const ft = [];
  const tmp = new THREE.Vector3(), camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(); let camInit = false, manual = null;
  const sunDirV = new THREE.Vector3();
  function update(dt) {
    tAll += dt;
    // hero movement (camera-relative)
    let f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + joy.z, r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
    const mag = Math.min(1, Math.hypot(f, r)); const run = keys.ShiftLeft || keys.ShiftRight || mag > 0.95 && coarse;
    if (orbitMode) { f = r = 0; state.camYaw += dt * 0.12; }
    const fx = -Math.sin(state.camYaw), fz = -Math.cos(state.camYaw), rx = -fz, rz = fx;
    let mxv = (fx * f + rx * r), mzv = (fz * f + rz * r); const l = Math.hypot(mxv, mzv);
    const target = l > 0.05 ? (run ? 6.8 : 3.6) * mag : 0; state.speed = lerp(state.speed, target, Math.min(1, dt * 9));
    if (l > 0.05 && state.speed > 0.05) { mxv /= l; mzv /= l; const nx = state.x + mxv * state.speed * dt, nz = state.z + mzv * state.speed * dt; if (!blk(nx, nz)) { state.x = nx; state.z = nz; } else if (!blk(nx, state.z)) state.x = nx; else if (!blk(state.x, nz)) state.z = nz; let da = Math.atan2(mxv, mzv) - state.face; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283; state.face += da * Math.min(1, dt * 11); }
    if (keys.Space && state.y <= gAt(state.x, state.z) + 0.02) state.vy = 5.2; state.vy -= 14 * dt; state.y += state.vy * dt; const gy = gAt(state.x, state.z); if (state.y < gy) { state.y = gy; state.vy = 0; }
    const sp01 = Math.min(1, state.speed / 6.8) * (state.y > gy + 0.05 ? 0.5 : 1);
    hero.root.position.set(state.x, state.y, state.z); hero.root.rotation.y = state.face; hero.update(dt, sp01 * 1.0);
    blob.position.set(state.x, gy + 0.05, state.z); blob.scale.setScalar(1 - Math.min(0.5, (state.y - gy) * 0.2));
    // camera
    const cp = Math.cos(state.camPitch), sd = inside ? Math.min(state.camDist, 6.5) : state.camDist; camTarget.set(state.x, state.y + 1.9, state.z); camPos.set(state.x + Math.sin(state.camYaw) * cp * sd, state.y + 1.9 + Math.sin(state.camPitch) * sd, state.z + Math.cos(state.camYaw) * cp * sd);
    if (inside) inside.camClamp(camPos); else camPos.y = Math.max(camPos.y, height(camPos.x, camPos.z) + 1.0);
    if (manual) { camera.position.copy(manual.pos); camera.lookAt(manual.look); } else { if (!camInit) { camera.position.copy(camPos); camInit = true; } camera.position.lerp(camPos, Math.min(1, dt * 7)); camera.lookAt(camTarget); }
    if (inside) { insideUpdate(dt, l); return; }
    // sun shadow follows the hero
    sunDirV.copy(key.userData.dir || new THREE.Vector3(-0.7, 0.4, 0.6)); const fcx = manual ? manual.look.x : state.x, fcz = manual ? manual.look.z : state.z; key.target.position.set(Math.round(fcx / 2) * 2, 0, Math.round(fcz / 2) * 2); key.position.copy(key.target.position).addScaledVector(sunDirV, 90); key.target.updateMatrixWorld();
    // proximity: door zone opens the panel (once per approach), E key too
    nearId = null; let best = 99; for (const id in X.doors) { const d = X.doors[id], dist = Math.hypot(state.x - d[0], state.z - d[1]); if (dist < best) { best = dist; nearId = id; } } if (best > 4.2) nearId = null;
    $("tip").style.display = nearId && !state.open ? "block" : "none"; if (nearId) $("tip").textContent = (byId[nearId]?.name || "Notice board") + " · press E";
    if (nearId && byId[nearId] && byId[nearId].kind !== "plot" && best < 1.7 && tAll > (state.noEnter || 0) && l > 0.05 && !busy) { enterBuilding(nearId); return; }
    if (nearId && state.dismissed !== nearId && state.open !== nearId && best < 3.0) openPanel(nearId, false);
    if (!nearId || (state.dismissed && state.dismissed !== nearId)) { if (state.dismissed && (!nearId || nearId !== state.dismissed)) state.dismissed = null; }
    if (state.open && state.open !== "hq" && best > 9 && X.doors[state.open] && Math.hypot(state.x - X.doors[state.open][0], state.z - X.doors[state.open][1]) > 11) { $("panel").classList.remove("on"); state.open = null; }
    // actors
    const night = scene.userData.night > 0.65;
    for (const w of workers) {
      if (w.genie) continue;
      const wk = w.wk, hd = X.doors["wh-" + w.w.id], wd = X.doors[w.w.home], working = w.live.s === "working";
      if (night) { if (wk.at(hd[0], hd[1])) { wk.root_hidden = true; } else if (!wk.route.length) wk.goto(hd[0], hd[1]); }
      else { wk.root_hidden = false; if (tAll > w.until) { const opts = working ? [wd, [PLAZA[0] + 7, PLAZA[1] - 4], wd] : [[hd[0], hd[1] + 3], [PLAZA[0] - 6, PLAZA[1] + 3], hd]; const p = opts[(w.stop++) % opts.length]; wk.goto(p[0], p[1]); w.until = tAll + 14 + hash(w.stop + wk.pos.x) * 10; } }
      wk.rig.root.visible = !wk.root_hidden; wk.update(dt);
    }
    shoppers.forEach((s, i) => { const wk = s.wk; s.t += dt; const cyc = (s.t % 40); if (cyc < 14) { wk.rig.root.visible = false; wk.pos.set(X.doors.super[0], 0, X.doors.super[1]); wk.route = []; } else if (cyc < 15 && !wk.route.length) { wk.rig.root.visible = true; wk.goto(X.doors.super[0] + 14, X.doors.super[1] - 3 + i * 2, 20); } else if (cyc > 28 && wk.route.length === 0 && !wk.at(X.doors.super[0], X.doors.super[1])) wk.goto(X.doors.super[0], X.doors.super[1], 20); wk.update(dt); if (wk.at(X.doors.super[0], X.doors.super[1]) && cyc > 28) wk.rig.root.visible = false; });
    guards.forEach((g) => g.update(dt, 0)); banker.update(dt, 0); fish.update(dt, 0, 0, true); fish.root.position.y = pierY + 0.5;
    // Perla waves when the hero is close
    const dp = Math.hypot(state.x - perla.root.position.x, state.z - perla.root.position.z); perla.update(dt, 0, smooth(16, 8, dp)); if (dp < 18) perla.root.rotation.y = lerp(perla.root.rotation.y, Math.atan2(state.x - perla.root.position.x, state.z - perla.root.position.z), Math.min(1, dt * 3)); perla.root.position.y = perla.fixedY;
    // cat wanders the square
    if (cat1.wait > 0) cat1.wait -= dt; else { const dx = cat1.tx - cat1.x, dz = cat1.tz - cat1.z, d = Math.hypot(dx, dz); if (d < 0.3) { cat1.wait = 3 + Math.random() * 6; const a = Math.random() * 6.28, r = 4 + Math.random() * 8; cat1.tx = Math.cos(a) * r; cat1.tz = Math.sin(a) * r; if (blocked(cat1.tx, cat1.tz)) { cat1.tx = 3; cat1.tz = 6; } } else { cat1.x += dx / d * dt * 1.3; cat1.z += dz / d * dt * 1.3; cat.rotation.y = Math.atan2(dx, dz); } }
    cat.position.set(cat1.x, height(cat1.x, cat1.z) + 0.05 + (cat1.wait > 0 ? 0 : Math.abs(Math.sin(tAll * 9)) * 0.05), cat1.z); cat.tail.rotation.z = Math.sin(tAll * 3) * 0.5;
    cart.position.set(Math.cos(tAll * 0.12) * 16, 0, Math.sin(tAll * 0.12) * 16); cart.position.y = height(cart.position.x, cart.position.z); cart.rotation.y = -tAll * 0.12 + 0; cart.rotation.y = Math.atan2(-Math.sin(tAll * 0.12), Math.cos(tAll * 0.12)) + Math.PI / 2 * 0 + Math.PI / 2 * 0;
    boats.forEach((b, i) => { const a = tAll * (0.02 + i * 0.006) + i * 2.1, r = 112 + i * 14; b.position.set(Math.cos(a) * r, 0.2 + Math.sin(tAll * 1.4 + i) * 0.12, Math.sin(a) * r); b.rotation.y = -a; b.rotation.z = Math.sin(tAll * 1.1 + i) * 0.05; });
    gulls.forEach((g, i) => { const a = tAll * (0.25 + i * 0.03) + i * 1.3, r = 40 + i * 9; g.position.set(Math.cos(a) * r, 22 + Math.sin(a * 2 + i) * 4, Math.sin(a) * r); g.rotation.y = -a; const fl = Math.sin(tAll * 7 + i) * 0.5; g.wl.rotation.z = fl; g.wr.rotation.z = -fl; });
    bobber.position.y = 0.06 + Math.sin(tAll * 2) * 0.04;
    genie.position.set(X.genieHome.x + Math.sin(tAll * 0.5) * 0.8, X.genieHome.y + Math.sin(tAll * 1.1) * 0.5, X.genieHome.z); genie.rotation.y = Math.sin(tAll * 0.4) * 0.6; sparkle.rotation.y = tAll * 0.3; genieHit.position.copy(genie.position);
    for (const a of animated) a.rotation.z = tAll * 0.9; cranes.forEach((c, i) => (c.rotation.y = Math.sin(tAll * 0.15 + i) * 1.2));
    // sea / fx
    const nrm = sea.userData.nrm; nrm.offset.x = tAll * 0.004; nrm.offset.y = tAll * 0.0026;
    clouds.rotation.y = tAll * 0.004; sky.position.copy(camera.position);
    smoke.material.uniforms.t.value = tAll; halos.material.uniforms.t.value = tAll;
    const amt = snowOn ? snowAmt(camera.position.x, camera.position.z) : 0; snow.visible = amt > 0.02; snow.material.uniforms.amt.value = amt; snow.material.uniforms.t.value = tAll; snow.material.uniforms.cam.value.copy(camera.position);
    lightT += dt; if (lightT > 20) { lightT = 0; Object.assign(when, nowAthens()); applyLight(); }
    // labels
    for (const b of all) { const sp = X.spots[b.id]; if (!sp) continue; const dist = Math.hypot(b.pos[0] - camera.position.x, b.pos[1] - camera.position.z); if (dist > 28) { if (chips[b.id]) chips[b.id].style.display = "none"; continue; } const st = b.kind === "plot" ? "planned" : statusOf(b.id); const dd = data?.buildings?.[b.id]; const rev = dd?.kpis?.find((k) => /Revenue \(30/.test(k.l)); place(b.id, tmp.set(b.pos[0], sp.top + 3.2, b.pos[1]), `${b.kind === "plot" ? "For sale" : b.name}${rev && !rev.no ? " · " + rev.v : ""}${st === "construction" ? " · soon" : ""}`); }
    for (const w of workers) { const pos = w.genie ? tmp.copy(genie.position).add(new THREE.Vector3(0, 6.2, 0)) : w.wk.rig.root.position.clone().add(new THREE.Vector3(0, 2.7, 0)); const d = Math.hypot(pos.x - camera.position.x, pos.z - camera.position.z); if (d > 34 || (w.wk && !w.wk.rig.root.visible && !night)) { if (chips["w" + w.w.id]) chips["w" + w.w.id].style.display = "none"; continue; } const txt = night && !w.genie ? "zzz… sleeping" : `${w.w.name}: ${w.live.t}`; place("w" + w.w.id, pos, txt, "say"); }
    miniT += dt; if (miniT > 0.15) { miniT = 0; drawMini(); }
  }
  function frame() {
    const nowT = performance.now(), dt = Math.min(0.05, (nowT - lastT) / 1000); lastT = nowT; update(dt); renderer.render(inside ? inside.scene : scene, camera);
    ft.push(dt * 1000); if (ft.length > 240) ft.shift(); frames++; requestAnimationFrame(frame);
  }
  addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); });
  window.__city = {
    enter: enterBuilding, leave: leaveBuilding,
    setView(pos, look) { manual = pos ? { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look) } : null; }, teleport(x, z, yaw) { state.x = x; state.z = z; state.y = height(x, z); if (yaw != null) state.camYaw = yaw; camInit = false; },
    set(k, v) { state[k] = v; }, key(k, v) { keys[k] = v; }, openPanel, mainCalls() { renderer.shadowMap.enabled = false; renderer.info.reset(); renderer.render(scene, camera); const c = renderer.info.render.calls, t = renderer.info.render.triangles; renderer.shadowMap.enabled = true; return { c, t }; }, stats() { const a = ft.slice().sort((x, y) => x - y); const avg = ft.reduce((s, v) => s + v, 0) / (ft.length || 1); return { frames, avgMs: +avg.toFixed(2), p95Ms: +(a[Math.floor(a.length * 0.95)] || 0).toFixed(2), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geoms: renderer.info.memory.geometries, tex: renderer.info.memory.textures }; },
    info: { buildings: all.length, doors: X.doors, home: home.pos, hq: hq.pos, when, events: events.map((e) => e.id), statuses: Object.fromEntries(all.map((b) => [b.id, b.kind === "plot" ? "planned" : statusOf(b.id)])) }, workers: () => workers.map((w) => ({ id: w.w.id, ...w.live })),
    renderOnce(dt = 0.016) { update(dt); renderer.render(scene, camera); },
  };
  $("load").style.opacity = 0; setTimeout(() => ($("load").style.display = "none"), 700);
  if (qs.get("manual") === "1") { /* tests drive frames themselves */ } 
  frame();
}
main().catch((e) => { console.error(e); const m = $("loadmsg"); if (m) m.textContent = "Something broke: " + e.message; });
