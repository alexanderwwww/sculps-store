// WORLD MODE entry. Lazy-loaded from /aq/assets/world.js. start(stage, api) -> { dispose }.
import * as THREE from "three";
import { initMaterials, M, Merger, sprite } from "./kit.js";
import { sky, sea, islandMesh, waterfalls, trees, bushes, R, CANAL, BRIDGES } from "./island.js";
import { loadPeople, Person } from "./people.js";
import { colosseum, district, statue, embassy, strategyTower, setClips, DR, angleOf, polar } from "./buildings.js";
import { buildRoom, embassyRoom, ROOM_Y } from "./interiors.js";
import { drawWallet, drawX, drawNeurons, drawDept, drawData, drawTicker } from "./screens.js";
import * as T from "../textures.js";

const GOD_AT = { scouts_sol: "hecate", learning: "apollo", setups: "athena", risk: "zeus", execution: "hermes", news: "dionysus" };
const GROK_DESK = ["Scout", "News", "Setup", "Skeptic", "Risk", "Reviewer"];

export async function start(stage, A) {
  const disposers = [], timers = [];
  const on = (el, ev, f, o) => { el.addEventListener(ev, f, o); disposers.push(() => el.removeEventListener(ev, f, o)); };
  const touch = matchMedia("(pointer: coarse)").matches;

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 1.75));
  renderer.setSize(stage.clientWidth || innerWidth, stage.clientHeight || innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xb8a2c8, 140, 620);
  const camera = new THREE.PerspectiveCamera(55, renderer.domElement.width / renderer.domElement.height, 0.3, 2500);
  initMaterials();

  // lights: warm low sun, purple-blue sky fill
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a6a48, 1.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd6a0, 2.6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const SUN = new THREE.Vector3(-0.75, 0.42, 0.45).normalize();
  const skyM = sky(scene); const seaM = sea(scene);

  // ---------- world ----------
  const world = new THREE.Group(); scene.add(world);
  const island = islandMesh(world); const falls = waterfalls(world);
  const hq = colosseum(); world.add(hq);
  const colliders = [{ x: 0, z: 0, r: hq.userData.r }];
  const doors = []; // {id, kind, pos:Vector3, name}
  doors.push({ id: "hq", kind: "hq", pos: hq.userData.door.clone(), name: "Aquarius HQ · the boss office" });
  const districts = {};
  A.DEPTS.forEach(([id, nm, col], i) => {
    const a = angleOf(i); const [x, z] = polar(DR, a);
    const d = district(id, col); d.g.position.set(x, 0, z); d.g.rotation.y = -a + Math.PI; // local +z faces the centre
    // (rotation: -a faces outward; +PI flips to face the HQ)
    world.add(d.g); districts[id] = d; d.a = a; d.col = col; d.name = nm;
    const dv = new THREE.Vector3(d.door[0], 0, d.door[1]).applyAxisAngle(new THREE.Vector3(0, 1, 0), d.g.rotation.y).add(d.g.position);
    d.doorW = dv; doors.push({ id, kind: id, pos: dv, name: nm });
    colliders.push({ x, z, r: d.r });
    if (d.noWalk) { const nv = new THREE.Vector3(d.noWalk.x, 0, d.noWalk.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), d.g.rotation.y).add(d.g.position); colliders.push({ x: nv.x, z: nv.z, r: d.noWalk.r }); }
    // door glow ring = live feed indicator
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.7, 32), new THREE.MeshBasicMaterial({ color: 0x5ef0ff, transparent: true, opacity: 0.8, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.copy(dv).setY(0.08); world.add(ring); d.ring = ring;
  });
  // statues on the plaza, each facing its department
  const statues = [];
  Object.entries(GOD_AT).forEach(([dept, god]) => { const i = A.DEPTS.findIndex((d) => d[0] === dept); const a = angleOf(i); const [x, z] = polar(36, a);
    const s = statue(god); s.position.set(x, 0, z); s.rotation.y = -a + Math.PI; world.add(s); statues.push(s); colliders.push({ x, z, r: 2.4 }); });
  // embassy
  const emb = embassy(); { const a = Math.PI * 1.08; const [x, z] = polar(74, a); emb.g.position.set(x, 0, z); emb.g.rotation.y = -a + Math.PI; world.add(emb.g); colliders.push({ x, z, r: emb.r });
    const dv = new THREE.Vector3(emb.door[0], 0, emb.door[1]).applyAxisAngle(new THREE.Vector3(0, 1, 0), emb.g.rotation.y).add(emb.g.position); doors.push({ id: "embassy", kind: "embassy", pos: dv, name: "Embassy · Grok and ChatGPT" }); }
  // strategy towers on the rim
  const towers = []; for (let k = 0; k < 5; k++) { const a = angleOf(k * 2.4 + 0.5); const [x, z] = polar(R - 9, a); const t = strategyTower(); t.g.position.set(x, 0, z); world.add(t.g); towers.push(t); colliders.push({ x, z, r: 2.5 });
    const lab = sprite(T.label("—", ""), 6, 1.5); lab.position.y = 8; t.g.add(lab); t.lab = lab; }
  // cyan flow path through the doors in pipeline order, with moving light dots
  const pathPts = A.DEPTS.map(([id]) => districts[id].doorW.clone().setY(0.12));
  const curve = new THREE.CatmullRomCurve3(pathPts, true, "centripetal");
  { const N = 600, pos = [], idx = []; const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= N; i++) { const t = i / N, p = curve.getPointAt(t), tg = curve.getTangentAt(t), sd = new THREE.Vector3().crossVectors(tg, up).normalize().multiplyScalar(0.55);
      pos.push(p.x + sd.x, 0.1, p.z + sd.z, p.x - sd.x, 0.1, p.z - sd.z); if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
    const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); pg.setIndex(idx);
    const pm = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0x46e6ff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })); world.add(pm);
    // spokes from each bridge to HQ plaza
  }
  const DOTS = 140; const dotG = new THREE.BufferGeometry(); const dotP = new Float32Array(DOTS * 3); dotG.setAttribute("position", new THREE.BufferAttribute(dotP, 3));
  const dots = new THREE.Points(dotG, new THREE.PointsMaterial({ map: T.glowDot(), size: 1.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xaef8ff })); dots.frustumCulled = false; world.add(dots);
  // trees and bushes (avoid buildings, paths, canal)
  T.rnd(); const spots = []; const free = (x, z, pad) => colliders.every((c) => Math.hypot(x - c.x, z - c.z) > c.r + pad) && Math.hypot(x, z) < R - 4 && !(Math.hypot(x, z) > CANAL[0] - 3 && Math.hypot(x, z) < CANAL[1] + 5) && doors.every((d) => d.pos.distanceTo(new THREE.Vector3(x, 0, z)) > 7);
  for (let i = 0; i < 900 && spots.length < 170; i++) { const r = 58 + T.rnd() * (R - 62), a = T.rnd() * Math.PI * 2, x = Math.sin(a) * r, z = -Math.cos(a) * r; const near = pathPts.some((p, k) => { const q = pathPts[(k + 1) % 12]; const t = Math.max(0, Math.min(1, ((x - p.x) * (q.x - p.x) + (z - p.z) * (q.z - p.z)) / ((q.x - p.x) ** 2 + (q.z - p.z) ** 2))); return Math.hypot(x - (p.x + t * (q.x - p.x)), z - (p.z + t * (q.z - p.z))) < 4; });
    if (!near && free(x, z, 3)) spots.push({ x, z, k: T.rnd() < 0.55 ? "olive" : "cypress", s: 0.8 + T.rnd() * 0.6, r: T.rnd() * 6 }); }
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + 0.2; if (BRIDGES.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.2)) continue; spots.push({ x: Math.sin(a) * 43, z: -Math.cos(a) * 43, k: "cypress", s: 0.75, r: 0 }); }
  trees(world, spots);
  const bs = []; for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; if (BRIDGES.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.12)) continue; bs.push({ x: Math.sin(a) * 44.5, z: -Math.cos(a) * 44.5, s: 0.9, r: a, flower: i % 3 === 0 ? [0.95, 0.12, 0.6][i % 9 / 3 | 0] : 0 }); }
  bushes(world, bs);
  for (const t of spots) colliders.push({ x: t.x, z: t.z, r: 0.7 });

  // ---------- characters ----------
  const { clips } = await loadPeople(); setClips(clips);
  // statues need clips: rebuild them now that the body is loaded
  statues.forEach((s) => world.remove(s)); statues.length = 0;
  Object.entries(GOD_AT).forEach(([dept, god]) => { const i = A.DEPTS.findIndex((d) => d[0] === dept); const a = angleOf(i); const [x, z] = polar(36, a); const s = statue(god); s.position.set(x, 0, z); s.rotation.y = -a + Math.PI; world.add(s); statues.push(s); });
  const ceo = new Person("#f4ecd8", { ceo: true }); scene.add(ceo.root); ceo.play("Idle_Loop");
  const player = { pos: new THREE.Vector3(0, 0, 70), yaw: Math.PI, vel: 0, inside: null };
  ceo.root.position.copy(player.pos);

  // ---------- HUD ----------
  const hud = document.createElement("div"); stage.appendChild(hud);
  hud.innerHTML = `<div id="mini" class="hud glass"><div class="mh"><span>AQUARIUS · LIVE</span><span id="mini-t">▾</span></div><div class="mb" id="mini-b"></div></div>
    <div id="strip" class="hud"></div><div id="agents" class="hud glass"><div class="ah">DEPARTMENTS</div><div id="ag-l"></div></div>
    <div id="minimap" class="hud glass"><canvas width="380" height="380"></canvas></div>
    <div id="prompt" class="hud glass"></div><div id="roomtitle" class="hud"></div>
    <button id="exitbtn" class="hud glass">Leave · E</button><div id="fps" class="hud glass">—</div>
    <div id="joy" class="hud"><i></i></div><div id="tbtns" class="hud"><button data-k="o">O</button><button data-k="e">E</button><button data-k="m">☰</button></div><div id="tip" class="glass"></div>`;
  disposers.push(() => hud.remove());
  const $ = (s) => hud.querySelector(s);
  let miniCol = false; try { miniCol = localStorage.getItem("aq-mini") === "1"; } catch {}
  $("#mini").classList.toggle("col", miniCol);
  $("#mini .mh").onclick = () => { miniCol = !miniCol; $("#mini").classList.toggle("col", miniCol); $("#mini-t").textContent = miniCol ? "▸" : "▾"; try { localStorage.setItem("aq-mini", miniCol ? "1" : "0"); } catch {} };
  $("#exitbtn").onclick = () => leave();
  hud.querySelectorAll("#tbtns button").forEach((b) => (b.onclick = () => { if (b.dataset.k === "e") act(); if (b.dataset.k === "o") toggleOverview(); if (b.dataset.k === "m") A.openMenu(); }));
  const mm = $("#minimap canvas"), mg = mm.getContext("2d");

  // ---------- state -> world ----------
  const F = A.fmt; const equityHist = []; let lastFlow = null; const flights = [];
  const walkers = []; // outdoor workers
  const roomCache = {}; let room = null; // current interior
  function deptState(s, id) { return s && (s.departments || []).find((d) => d.id === id); }
  function applyState(s) {
    if (s && typeof s.equitySol === "number" && equityHist[equityHist.length - 1] !== s.equitySol) { equityHist.push(s.equitySol); if (equityHist.length > 200) equityHist.shift(); }
    drawWallet(hq.userData.screens.wallet, s, A, equityHist); drawX(hq.userData.screens.x, s, A);
    // mini panel
    const L = s && s.council && s.council.last, xf = A.xFeed(s);
    $("#mini-b").innerHTML = s ? `<div class="mrow"><span>Equity</span><b>${F.fSol(s.equitySol)}</b></div><div class="mrow"><span>Today</span><b class="${s.pnlTodaySol > 0 ? "up" : s.pnlTodaySol < 0 ? "dn" : ""}">${F.fSol(s.pnlTodaySol, true)}</b></div><div class="mrow"><span>Total</span><b class="${s.pnlTotalSol > 0 ? "up" : s.pnlTotalSol < 0 ? "dn" : ""}">${F.fSol(s.pnlTotalSol, true)}</b></div><div class="mrow"><span>Open trades</span><b>${(s.positions || []).length}</b></div><div class="mrow"><span>Council</span><b class="${L ? (L.verdict === "PASS" ? "up" : "dn") : ""}">${L ? F.esc(L.verdict + " " + (L.symbol || "")) : "—"}</b></div><div class="mrow"><span>Last flow</span><b>${s.flows && s.flows[0] ? F.esc(s.flows[0].kind) + " " + (typeof s.flows[0].sol === "number" ? Math.abs(s.flows[0].sol).toFixed(4) : "—") : "—"}</b></div><div class="mx">${xf.length ? F.esc((xf[0].label ? "[" + xf[0].label + "] " : "") + xf[0].text) : "X: Grok not connected"}</div>` : `<div class="mrow"><span>${A.store.err ? "Offline" : "Loading"}</span><b>—</b></div>`;
    // agents list
    $("#ag-l").innerHTML = A.DEPTS.map(([id, nm, col]) => { const d = deptState(s, id), ws = (d && d.workers) || []; const c = { busy: 0, idle: 0, blocked: 0 }; ws.forEach((w) => c[w.status]++);
      return `<div class="ag" data-id="${id}"><span class="dc" style="--dc:${col}"></span><span>${F.esc(nm)}</span><small>${ws.length ? c.busy + "/" + ws.length : "—"}</small><span class="stbar"><i class="st-busy" style="flex:${c.busy}"></i><i class="st-idle" style="flex:${c.idle}"></i><i class="st-blocked" style="flex:${c.blocked}"></i></span></div>`; }).join("");
    hud.querySelectorAll(".ag").forEach((e) => (e.onclick = () => enter(e.dataset.id)));
    // building liveness, risk lever, council stone, towers, ticker, news screen
    for (const [id, d] of Object.entries(districts)) { const ds = deptState(s, id); const live = !!(ds && ds.live); d.ring.material.color.set(live ? 0x5ef0ff : 0x55606e); d.ring.material.opacity = live ? 0.85 : 0.35; if (d.label) d.label.material.opacity = live ? 1 : 0.55; }
    const rk = districts.risk; rk.lever.rotation.z = s && s.killSwitch ? -0.5 : 0.5; rk.warn.intensity = s && s.killSwitch ? 120 : 0;
    const cn = districts.council; drawVerdict(cn.verdict, s); cn.glow.color.set(L ? (L.verdict === "PASS" ? 0x40ff80 : 0xff4030) : 0x888888);
    drawData(districts.news.screens.news, s, A, "news");
    const st = (s && s.strategies) || []; const mx = Math.max(0.0001, ...st.map((x) => Math.abs(typeof x.pnlSol === "number" ? x.pnlSol : 0)));
    towers.forEach((t, k) => { const x = st[k]; const v = x && typeof x.pnlSol === "number" ? x.pnlSol : null; const h = x ? (v == null ? 3 : 4 + (Math.abs(v) / mx) * 26) : 1.5;
      t.target = h; t.shaft.material.emissive.set(!x || v == null ? 0x445566 : v >= 0 ? 0x22e0ff : 0xff3a2a); t.shaft.material.emissiveIntensity = x && x.alive === false ? 0.25 : 0.9;
      t.lab.material.map.dispose(); t.lab.material.map = T.label(x ? x.id + " " + (x.name || "") : "—", x ? F.fSol(v, true) + (x.alive === false ? " · killed" : "") : "no strategy"); });
    // money flights
    const fl = (s && s.flows) || []; if (lastFlow == null) lastFlow = fl.length ? fl[0].id : 0;
    const fresh = fl.filter((f) => f.id > lastFlow).slice(0, 6).reverse(); if (fl.length) lastFlow = Math.max(lastFlow, ...fl.map((f) => f.id));
    for (const f of fresh) spawnFlight(f);
    syncWalkers(s);
    if (room) fillRoom(room, s);
  }
  function drawVerdict(scr, s) { const L = s && s.council && s.council.last; scr.draw((g, W, H) => { const gr = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.7); const c = L ? (L.verdict === "PASS" ? ["#7dffb0", "#0b5a2c"] : ["#ff8a7a", "#6a0c0c"]) : ["#9aa3ad", "#2a2f36"]; gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = "#fff"; g.textAlign = "center"; g.font = `700 ${W * 0.2}px Cinzel, Georgia, serif`; g.fillText(L ? L.verdict : "—", W / 2, H * 0.42); g.font = `600 ${W * 0.08}px sans-serif`; g.fillText(L ? (L.symbol || "") : "no verdict", W / 2, H * 0.62); g.fillText(L && L.number != null ? String(L.number) : "", W / 2, H * 0.78); }); }
  const coinTex = { win: T.glowDot(), loss: T.glowDot(), fee: T.glowDot(), buy: T.glowDot(), sell: T.glowDot() };
  const coinCol = { win: 0x22ff77, loss: 0xff3a3a, fee: 0xffcc33, buy: 0x40e8ff, sell: 0x40e8ff };
  function spawnFlight(f) {
    const icon = { buy: "↗", sell: "↘", fee: "◎", win: "▲", loss: "▼" }[f.kind] || "•";
    const el = document.createElement("div"); el.className = "coin f-" + f.kind; el.innerHTML = `<i>${icon}</i>${typeof f.sol === "number" ? Math.abs(f.sol).toFixed(4) : "—"} SOL`; const strip = $("#strip"); strip.prepend(el); while (strip.children.length > 6) strip.lastChild.remove();
    const from = districts[f.dept] ? districts[f.dept].g.position.clone().setY(8) : new THREE.Vector3(0, 8, 60);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: coinTex[f.kind] || coinTex.buy, color: coinCol[f.kind] || 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.setScalar(4); sp.position.copy(from); world.add(sp);
    flights.push({ sp, from, to: new THREE.Vector3(0, 22, 0), t: 0 });
  }
  // ---------- outdoor walkers: busy workers walk the pipeline path; blocked ones stand at their door with a red marker ----------
  const markTex = (() => { const c = document.createElement("canvas"); c.width = 64; c.height = 64; const g = c.getContext("2d"); g.fillStyle = "#ef4444"; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill(); g.fillStyle = "#fff"; g.font = "bold 44px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("!", 32, 34); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const proxies = []; // raycast targets {mesh, dept, wid}
  function makePerson(dept, w, color) {
    const p = new Person(color); p.dept = dept; p.wid = w.id; p.w = w;
    const proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 6), new THREE.MeshBasicMaterial({ visible: false })); proxy.position.y = 1; p.root.add(proxy); proxy.userData = { dept, wid: w.id }; p.proxy = proxy; proxies.push(proxy);
    const mk = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex, depthWrite: false })); mk.scale.setScalar(0.6); mk.position.y = 2.3; mk.visible = false; p.root.add(mk); p.mark = mk;
    const ringM = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 24), new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.85, depthWrite: false })); ringM.rotation.x = -Math.PI / 2; ringM.position.y = 0.05; ringM.visible = false; p.root.add(ringM); p.ringM = ringM;
    return p;
  }
  function removePerson(p) { p.root.parent && p.root.parent.remove(p.root); const i = proxies.indexOf(p.proxy); if (i >= 0) proxies.splice(i, 1); p.dispose(); }
  function syncWalkers(s) {
    const want = [];
    A.DEPTS.forEach(([id, , col], i) => { const ws = ((deptState(s, id) || {}).workers) || []; ws.filter((w) => w.status === "busy").slice(0, 1).forEach((w) => want.push({ id, w, col, i, mode: "walk" })); ws.filter((w) => w.status === "blocked").slice(0, 1).forEach((w) => want.push({ id, w, col, i, mode: "blocked" })); });
    const key = (x) => x.id + "/" + x.w.id;
    for (let k = walkers.length - 1; k >= 0; k--) { const p = walkers[k]; const m = want.find((x) => key(x) === p.dept + "/" + p.wid); if (!m || m.mode !== p.mode) { removePerson(p); walkers.splice(k, 1); } else p.w = m.w; }
    for (const m of want) if (!walkers.some((p) => p.dept + "/" + p.wid === key(m))) {
      const p = makePerson(m.id, m.w, m.col); p.mode = m.mode; world.add(p.root); walkers.push(p);
      if (m.mode === "walk") { p.t = (m.i / 12 + Math.random() * 0.02) % 1; p.dir = 1; p.play("Walk_Loop", 0); p.mixer.update(Math.random()); }
      else { const d = districts[m.id].doorW; p.root.position.copy(d).add(new THREE.Vector3(1.8, 0, 0)); p.play("Idle_Talking_Loop", 0); p.mark.visible = true; p.ringM.visible = true; }
    }
  }

  // ---------- interiors ----------
  function fillRoom(r, s) {
    if (r.kind === "hq") { drawNeurons(r.screens.neurons, s, A); drawWallet(r.screens.wallet, s, A, equityHist); drawX(r.screens.x, s, A); }
    else if (r.kind === "council") { drawVerdict(r.screens.verdict, s); drawData(r.screens.vetoes, s, A, "council"); }
    else if (r.kind === "embassy") { drawData(r.screens.big, s, A, "embassy"); drawX(r.screens.side, s, A); }
    else { drawDept(r.screens.big, s, A, r.kind); drawData(r.screens.side, s, A, r.kind); }
    // seat people
    let list = [];
    if (r.kind === "embassy") { const hp = (s && s.helpers) || {}; const gOn = hp.grok && (hp.grok === "connected" || hp.grok.status === "connected" || hp.grok.lastAt); const cOn = hp.chatgpt && (hp.chatgpt === "connected" || hp.chatgpt.status === "connected" || hp.chatgpt.lastAt);
      list = GROK_DESK.map((n, i) => ({ id: "grok-" + i, name: "Grok · " + n, job: n + " desk bot (Grok)", status: gOn ? "busy" : "idle", note: gOn ? "reading live X" : "Grok not connected", skills: ["live X search"], power: "grok", _col: "#222" }));
      list.push({ id: "chatgpt-0", name: "ChatGPT", job: "second reader", status: cOn ? "busy" : "idle", note: cOn ? "connected" : "ChatGPT not connected", skills: ["second reading"], power: "chatgpt", _col: "#10a37f" }); }
    else if (r.kind === "council") list = ((deptState(s, "council") || {}).workers) || [];
    else if (r.kind !== "hq") list = ((deptState(s, r.kind) || {}).workers) || [];
    const col = r.kind === "embassy" ? null : (A.DEPTS.find((d) => d[0] === r.kind) || [0, 0, "#ddd"])[2];
    r.people ||= [];
    const ids = list.map((w) => w.id);
    for (let k = r.people.length - 1; k >= 0; k--) if (!ids.includes(r.people[k].wid)) { removePerson(r.people[k]); r.people.splice(k, 1); }
    list.forEach((w, i) => {
      let p = r.people.find((x) => x.wid === w.id);
      if (!p) { p = makePerson(r.kind === "embassy" ? "embassy" : r.kind, w, w._col || col); r.g.add(p.root); r.people.push(p); p.mixer.update(Math.random() * 2); p.tagTex = null; }
      p.w = w;
      const seat = r.seats[i % Math.max(1, r.seats.length)] || { x: -10 + (i % 6) * 4, z: 8 + Math.floor(i / 6) * 2, ry: Math.PI };
      const extra = i >= r.seats.length ? { x: -12 + ((i - r.seats.length) % 8) * 3, z: 9.5 } : null;
      p.status = w.status; p.mark.visible = w.status === "blocked"; p.ringM.visible = w.status === "blocked";
      if (extra) { p.root.position.set(extra.x, 0, extra.z); p.root.rotation.y = Math.PI; p.play(w.status === "busy" ? "Interact" : "Idle_Loop"); p.walkSeat = null; }
      else if (w.status === "idle") { p.walkSeat = null; p.root.position.set(seat.x + Math.sin(seat.ry + Math.PI) * (seat.round ? 0.05 : -0.0), 0, seat.z + (seat.round ? 0 : 1.7)); p.root.rotation.y = seat.round ? seat.ry : 0 + Math.PI; p.play("Sitting_Idle_Loop"); if (!seat.round) { p.root.position.set(seat.x, 0, seat.z + 1.7); p.root.rotation.y = Math.PI; } }
      else if (w.status === "busy") { // working: stands at the desk using it, sometimes walks to the next desk
        if (!p.walkSeat) { p.walkSeat = { from: seat, t: Math.random() * 10 }; }
        p.root.position.set(seat.x, 0, seat.z + (seat.round ? 0 : 1.6)); p.root.rotation.y = seat.round ? seat.ry : Math.PI; p.play(seat.round ? "Sitting_Talking_Loop" : "Interact");
      } else { p.walkSeat = null; p.root.position.set(seat.x + 0.8, 0, seat.z + (seat.round ? 0 : 2.2)); p.root.rotation.y = Math.PI; p.play("Idle_Loop"); }
      if (seat.round) { p.root.position.set(seat.x, 0, seat.z); p.root.rotation.y = seat.ry; if (w.status !== "blocked") p.play(w.status === "busy" ? "Sitting_Talking_Loop" : "Sitting_Idle_Loop"); }
      // name tag
      const key = w.name + "|" + w.status + "|" + (w.note || "");
      if (p.tagKey !== key) { p.tagKey = key; if (p.tag) { p.tag.material.map.dispose(); p.root.remove(p.tag); } const t = nameTag(w); p.tag = t; p.root.add(t); }
    });
  }
  function nameTag(w) {
    const c = document.createElement("canvas"); c.width = 512; c.height = 128; const g = c.getContext("2d");
    g.fillStyle = "rgba(10,18,36,.78)"; T.roundRect(g, 8, 8, 496, 112, 26); g.fill();
    g.fillStyle = w.status === "busy" ? "#22c55e" : w.status === "blocked" ? "#ef4444" : "#94a3b8"; g.beginPath(); g.arc(50, 64, 16, 0, 7); g.fill();
    g.fillStyle = "#fff"; g.font = "700 40px -apple-system,Segoe UI,sans-serif"; g.fillText(w.name.slice(0, 18), 80, 56);
    g.fillStyle = w.status === "blocked" ? "#fca5a5" : "#8fe9ff"; g.font = "500 28px -apple-system,Segoe UI,sans-serif"; g.fillText(String(w.note || w.job || w.status).slice(0, 30), 80, 98);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true })); s.scale.set(1.9, 0.48, 1); s.position.y = 2.45; return s;
  }
  function enter(kind) {
    if (room && room.kind === kind) return;
    if (room) { room.g.visible = false; }
    let r = roomCache[kind];
    if (!r) { r = kind === "embassy" ? embassyRoom() : buildRoom(kind, A); r.g.position.y = ROOM_Y; scene.add(r.g); roomCache[kind] = r; }
    r.g.visible = true; room = r; world.visible = false; player.inside = kind;
    player.pos.copy(r.spawn).setY(ROOM_Y); player.yaw = Math.PI; cam.yaw = 0; cam.pitch = 0.32; cam.dist = 7.5; ceo.root.position.copy(player.pos);
    const d = doors.find((x) => x.kind === kind); $("#roomtitle").textContent = d ? d.name.toUpperCase() : kind; $("#roomtitle").style.display = "block"; setTimeout(() => ($("#roomtitle").style.display = "none"), 2600);
    $("#exitbtn").style.display = "block"; scene.fog.near = 60; scene.fog.far = 200;
    fillRoom(r, A.store.state); overview = false;
  }
  function leave() {
    if (!room) return; const kind = room.kind; room.g.visible = false; room = null; world.visible = true; player.inside = null;
    const d = doors.find((x) => x.kind === kind); const out = d.pos.clone(); const dir = out.clone().setY(0).normalize(); if (kind === "hq") dir.set(0, 0, 1);
    player.pos.copy(out).addScaledVector(kind === "hq" ? new THREE.Vector3(0, 0, 1) : dir.clone().negate(), -2.5); player.pos.y = 0;
    if (kind !== "hq") player.pos.copy(out).add(out.clone().normalize().multiplyScalar(-2.5)); else player.pos.copy(out).add(new THREE.Vector3(0, 0, 2.5));
    $("#exitbtn").style.display = "none"; scene.fog.near = 140; scene.fog.far = 620;
  }
  function nearestDoor() { let best = null, bd = 1e9; for (const d of doors) { const dd = Math.hypot(d.pos.x - player.pos.x, d.pos.z - player.pos.z); if (dd < bd) { bd = dd; best = d; } } return [best, bd]; }
  function act() { if (room) { const ex = room.exit; if (Math.hypot(player.pos.x - ex.x, player.pos.z - ex.z) < 5 || true) leave(); return; } const [d, dd] = nearestDoor(); if (d && dd < 6) enter(d.kind); }

  // ---------- camera & input ----------
  const cam = { yaw: 0, pitch: 0.38, dist: 11, tgt: new THREE.Vector3() };
  let overview = false, ovA = 0;
  function toggleOverview() { if (room) return; overview = !overview; }
  const keys = {};
  on(window, "keydown", (e) => { if (e.target.closest && e.target.closest("input,textarea,select")) return; const k = e.key.toLowerCase(); keys[k] = true; if (k === "e") act(); if (k === "o" || k === "tab") { e.preventDefault(); toggleOverview(); } });
  on(window, "keyup", (e) => { keys[e.key.toLowerCase()] = false; });
  on(window, "blur", () => { for (const k in keys) keys[k] = false; });
  const cv = renderer.domElement; cv.style.touchAction = "none";
  let drag = null;
  on(cv, "pointerdown", (e) => { if (e.pointerType === "touch" && joy.id === e.pointerId) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }; cv.setPointerCapture(e.pointerId); });
  on(cv, "pointermove", (e) => { if (drag && drag.id === e.pointerId) { cam.yaw -= (e.clientX - drag.x) * 0.006; cam.pitch = Math.max(0.05, Math.min(1.35, cam.pitch + (e.clientY - drag.y) * 0.005)); drag.x = e.clientX; drag.y = e.clientY; } else hover(e); });
  on(cv, "pointerup", (e) => { if (drag && drag.id === e.pointerId) { if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) click(e); drag = null; } });
  on(cv, "wheel", (e) => { e.preventDefault(); cam.dist = Math.max(3.5, Math.min(room ? 12 : 60, cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); }, { passive: false });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e) { const r = cv.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); const vis = proxies.filter((p) => { let o = p; while (o) { if (!o.visible) return false; o = o.parent; } return true; }); const h = ray.intersectObjects(vis, false)[0]; return h && h.object.userData; }
  function click(e) { const u = pick(e); if (!u) return; if (u.dept === "embassy") { const p = room && room.people && room.people.find((x) => x.wid === u.wid); if (p) A.dialog(`<div class="wp"><h3>${F.esc(p.w.name)}</h3><small>${F.esc(p.w.job)}</small><dl><dt>Status</dt><dd>${F.esc(p.w.status)}</dd><dt>Note</dt><dd>${F.esc(p.w.note)}</dd><dt>Power</dt><dd>${F.esc(p.w.power)}</dd></dl><div class="row"><button class="ghost" data-x>Close</button></div></div>`, (d, c) => (d.querySelector("[data-x]").onclick = c)); return; } A.openWorker(u.dept, u.wid); }
  const tip = $("#tip");
  function hover(e) { if (touch) return; const u = pick(e); if (!u) { tip.style.display = "none"; cv.style.cursor = ""; return; } const all = [...walkers, ...((room && room.people) || [])]; const p = all.find((x) => x.wid === u.wid); if (!p) return; tip.style.display = "block"; tip.style.left = e.clientX + 14 + "px"; tip.style.top = e.clientY + 10 + "px"; tip.textContent = `${p.w.name} · ${p.w.status}`; cv.style.cursor = "pointer"; }
  // joystick
  const joy = { id: null, x: 0, y: 0 }; const jEl = $("#joy"), jK = jEl.querySelector("i");
  on(jEl, "pointerdown", (e) => { joy.id = e.pointerId; jEl.setPointerCapture(e.pointerId); jmove(e); });
  on(jEl, "pointermove", (e) => { if (joy.id === e.pointerId) jmove(e); });
  const jend = (e) => { if (joy.id === e.pointerId) { joy.id = null; joy.x = joy.y = 0; jK.style.transform = ""; } }; on(jEl, "pointerup", jend); on(jEl, "pointercancel", jend);
  function jmove(e) { const r = jEl.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } joy.x = x; joy.y = y; jK.style.transform = `translate(${x * 40}px,${y * 40}px)`; }
  const onResize = () => { const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  on(window, "resize", onResize);

  // ---------- movement & collision ----------
  function blocked(x, z) {
    if (room) { const b = room.bounds; return b.type === "rect" ? Math.abs(x) > b.w / 2 || Math.abs(z) > b.d / 2 : Math.hypot(x, z) > b.r; }
    const r = Math.hypot(x, z); if (r > R - 1.5) return true;
    if (r > CANAL[0] - 0.3 && r < CANAL[1] + 0.3) { const a = Math.atan2(x, -z); if (!BRIDGES.some((b) => Math.abs(Math.sin(a - b)) * r < 2.0 && Math.cos(a - b) > 0)) return true; }
    for (const c of colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true;
    return false;
  }
  function moveCEO(dt) {
    let ix = 0, iz = 0; if (keys.w || keys.arrowup) iz -= 1; if (keys.s || keys.arrowdown) iz += 1; if (keys.a || keys.arrowleft) ix -= 1; if (keys.d || keys.arrowright) ix += 1;
    ix += joy.x; iz += joy.y; const mag = Math.min(1, Math.hypot(ix, iz));
    const run = keys.shift || Math.hypot(joy.x, joy.y) > 0.9;
    const target = mag < 0.1 ? 0 : (run ? 8.5 : 3.6) * mag; player.vel += (target - player.vel) * Math.min(1, dt * 8);
    const base = room ? ROOM_Y : 0;
    if (mag > 0.1) {
      const ang = Math.atan2(ix, iz) + cam.yaw; // camera-relative
      let dy = ang - player.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); player.yaw += dy * Math.min(1, dt * 10);
    }
    if (player.vel > 0.05) {
      const dx = Math.sin(player.yaw) * player.vel * dt, dz = Math.cos(player.yaw) * player.vel * dt; const lx = player.pos.x, lz = player.pos.z;
      if (!blocked(lx + dx, lz + dz)) { player.pos.x += dx; player.pos.z += dz; } else if (!blocked(lx + dx, lz)) player.pos.x += dx; else if (!blocked(lx, lz + dz)) player.pos.z += dz;
    }
    player.pos.y = base;
    ceo.root.position.copy(player.pos); ceo.root.rotation.y = player.yaw;
    ceo.play(player.vel < 0.3 ? "Idle_Loop" : player.vel < 5 ? "Walk_Loop" : "Sprint_Loop", 0.2, player.vel < 0.3 ? 1 : player.vel < 5 ? player.vel / 3.0 : player.vel / 7.5);
    // door prompt / auto-enter
    const pr = $("#prompt");
    if (room) { const ex = room.exit; const d = Math.hypot(player.pos.x - ex.x, player.pos.z - ex.z); pr.style.display = d < 4 ? "block" : "none"; pr.innerHTML = "<kbd>E</kbd> leave"; if (d < 1.2 && player.vel > 0.5 && Math.cos(player.yaw) > 0.5) leave(); }
    else { const [d, dd] = nearestDoor(); if (d && dd < 6) { pr.style.display = "block"; pr.innerHTML = `<kbd>E</kbd> enter ${F.esc(d.name)}`; } else pr.style.display = "none";
      if (d && dd < 1.6 && player.vel > 0.5) { const to = Math.atan2(d.pos.x - player.pos.x, d.pos.z - player.pos.z); if (Math.cos(to - player.yaw) > 0.5) enter(d.kind); } }
  }
  function updateCamera(dt) {
    const tgt = player.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
    let pos;
    if (overview && !room) { ovA += dt * 0.05; pos = new THREE.Vector3(Math.sin(ovA) * 230, 170, Math.cos(ovA) * 230); tgt.set(0, 0, 0); }
    else { const d = cam.dist; pos = new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch) * d, Math.sin(cam.pitch) * d, Math.cos(cam.yaw) * Math.cos(cam.pitch) * d).add(tgt);
      if (room) { const b = room.bounds; const lp = pos.clone(); lp.y -= ROOM_Y; if (b.type === "rect") { lp.x = Math.max(-b.w / 2, Math.min(b.w / 2, lp.x)); lp.z = Math.max(-b.d / 2, Math.min(b.d / 2 + 0.5, lp.z)); } else { const l = Math.hypot(lp.x, lp.z); if (l > b.r) { lp.x *= b.r / l; lp.z *= b.r / l; } } lp.y = Math.min(lp.y, 9); pos.set(lp.x, lp.y + ROOM_Y, lp.z); } }
    const k = 1 - Math.exp(-dt * 8); cam.tgt.lerp(tgt, k); if (!cam.p) cam.p = pos.clone(); cam.p.lerp(pos, overview ? 1 - Math.exp(-dt * 2) : k);
    camera.position.copy(cam.p); camera.lookAt(overview && !room ? tgt : cam.tgt);
    // sun shadow follows the player
    const c = overview && !room ? new THREE.Vector3() : player.pos; sun.position.copy(c).addScaledVector(SUN, 200); sun.target.position.copy(c);
    if (overview && !room) Object.assign(sun.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160 }); else Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70 });
    sun.shadow.camera.updateProjectionMatrix();
    skyM.position.copy(camera.position);
  }
  function drawMinimap() {
    const W = mm.width, H = mm.height, S = W / (2 * (R + 6)); mg.clearRect(0, 0, W, H);
    mg.save(); mg.translate(W / 2, H / 2);
    if (room) { mg.fillStyle = "#1b2740"; mg.fillRect(-W / 2, -H / 2, W, H); mg.fillStyle = "#f3d27a"; mg.font = "600 22px Cinzel,serif"; mg.textAlign = "center"; mg.fillText("INSIDE", 0, -8); mg.font = "16px sans-serif"; mg.fillStyle = "#cbd5e1"; mg.fillText((doors.find((d) => d.kind === room.kind) || {}).name?.split("·")[0] || room.kind, 0, 18); mg.restore(); return; }
    mg.fillStyle = "#4f8a3a"; mg.beginPath(); mg.arc(0, 0, R * S, 0, 7); mg.fill(); mg.strokeStyle = "#f3d27a"; mg.lineWidth = 2; mg.stroke();
    mg.strokeStyle = "#5ad1ec"; mg.lineWidth = (CANAL[1] - CANAL[0]) * S; mg.beginPath(); mg.arc(0, 0, ((CANAL[0] + CANAL[1]) / 2) * S, 0, 7); mg.stroke();
    mg.fillStyle = "#e9dcc0"; mg.beginPath(); mg.arc(0, 0, 27 * S, 0, 7); mg.fill();
    mg.strokeStyle = "rgba(94,240,255,.8)"; mg.lineWidth = 1.5; mg.beginPath(); pathPts.forEach((p, i) => (i ? mg.lineTo(p.x * S, p.z * S) : mg.moveTo(p.x * S, p.z * S))); mg.closePath(); mg.stroke();
    for (const d of Object.values(districts)) { mg.fillStyle = d.col; mg.beginPath(); mg.arc(d.g.position.x * S, d.g.position.z * S, 6, 0, 7); mg.fill(); }
    for (const w of walkers) { mg.fillStyle = w.mode === "blocked" ? "#ef4444" : "#ffffff"; mg.fillRect(w.root.position.x * S - 1.5, w.root.position.z * S - 1.5, 3, 3); }
    mg.translate(player.pos.x * S, player.pos.z * S); mg.rotate(-player.yaw + Math.PI); mg.fillStyle = "#ffd75e"; mg.beginPath(); mg.moveTo(0, -9); mg.lineTo(6, 7); mg.lineTo(-6, 7); mg.closePath(); mg.fill(); mg.strokeStyle = "#000"; mg.lineWidth = 1; mg.stroke();
    mg.restore();
  }

  // ---------- loop ----------
  const clock = new THREE.Clock(); let tAcc = 0, frames = 0, fps = 0, fT = 0, mmT = 0, tickOff = 0; const frameTimes = [];
  function frame() {
    const dt = Math.min(0.05, clock.getDelta()); tAcc += dt; const t0 = performance.now();
    moveCEO(dt); ceo.update(dt); updateCamera(dt);
    skyM.material.uniforms.t.value = tAcc; seaM.material.uniforms.t.value = tAcc; falls.userData.tex.offset.y -= dt * 0.9; if (island.userData.canal) island.userData.canal.map.offset.x += dt * 0.004;
    if (!room) {
      // flow dots along the path
      for (let i = 0; i < DOTS; i++) { const p = curve.getPointAt(((i / DOTS) + tAcc * 0.012) % 1); dotP[i * 3] = p.x; dotP[i * 3 + 1] = 0.5 + Math.sin(tAcc * 3 + i) * 0.1; dotP[i * 3 + 2] = p.z; } dotG.attributes.position.needsUpdate = true;
      // walkers
      for (const p of walkers) { const dist = p.root.position.distanceTo(camera.position);
        if (p.mode === "walk") { p.t = (p.t + dt * 0.0045) % 1; const pt = curve.getPointAt(p.t), nx = curve.getPointAt((p.t + 0.002) % 1); p.root.position.set(pt.x, 0, pt.z); p.root.rotation.y = Math.atan2(nx.x - pt.x, nx.z - pt.z); }
        if (dist < 90) p.update(dt); }
      for (const d of Object.values(districts)) { if (d.crystal) d.crystal.rotation.y += dt; if (d.blades) d.blades.forEach((b) => (b.rotation.z += dt * 1.5)); if (d.neurons) d.neurons.material.size = 0.8 + Math.sin(tAcc * 2) * 0.2; if (d.ticker) { tickOff += dt * 120; if ((frames & 3) === 0) drawTicker(d.ticker, A.store.state, A, tickOff); } }
      towers.forEach((t) => { const tg = t.target ?? 1.5; const h = t.shaft.scale.y + (tg - t.shaft.scale.y) * Math.min(1, dt * 2); t.shaft.scale.y = h; t.shaft.position.y = 0.6 + h / 2; t.cap.position.y = 0.6 + h + 1; t.cap.rotation.y += dt; t.lab.position.y = h + 3.5; });
      for (let k = flights.length - 1; k >= 0; k--) { const f = flights[k]; f.t += dt / 2.4; const p = f.from.clone().lerp(f.to, f.t); p.y += Math.sin(f.t * Math.PI) * 18; f.sp.position.copy(p); f.sp.material.opacity = 1 - Math.max(0, f.t - 0.8) * 5; if (f.t >= 1) { world.remove(f.sp); f.sp.material.dispose(); flights.splice(k, 1); } }
    } else if (room.people) for (const p of room.people) p.update(dt);
    scene.traverseVisible?.call;
    renderer.render(scene, camera);
    frames++; fT += dt; frameTimes.push(performance.now() - t0); if (frameTimes.length > 120) frameTimes.shift();
    if (fT > 1) { fps = Math.round(frames / fT); frames = 0; fT = 0; $("#fps").textContent = fps + " fps · build " + A.BUILD; }
    mmT += dt; if (mmT > 0.2) { mmT = 0; drawMinimap(); }
  }
  renderer.setAnimationLoop(frame);
  const unsub = A.onState(applyState);

  // test hooks (dev loop + Alex's support): window.__aqWorld
  window.__aqWorld = { get fps() { return fps; }, frameTimes, enter, leave, teleport: (x, z, yaw = Math.PI) => { if (room) leave(); player.pos.set(x, 0, z); player.yaw = yaw; cam.yaw = yaw + Math.PI; cam.p = null; }, cam, toggleOverview, get overview() { return overview; }, info: () => renderer.info, scene, camera };

  return {
    dispose() {
      renderer.setAnimationLoop(null); unsub(); disposers.forEach((f) => f()); timers.forEach(clearInterval);
      for (const p of [...walkers, ...Object.values(roomCache).flatMap((r) => r.people || [])]) p.dispose(); walkers.length = 0;
      const seen = new Set();
      scene.traverse((o) => { if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); } const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) { if (seen.has(m)) continue; seen.add(m); for (const k in m) { const v = m[k]; if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); } } if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value && u.value.isTexture) u.value.dispose(); m.dispose(); } });
      for (const m of Object.values(M)) { if (m.map) m.map.dispose(); m.dispose(); }
      renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
      delete window.__aqWorld;
    },
  };
}
