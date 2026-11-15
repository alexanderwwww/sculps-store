// Interiors: a separate lightweight scene built on entry and disposed on exit. The gallery is data driven (one pedestal per product).
import { THREE, Geo, G, hash, canvasTex, plasterTex, lerp, smooth } from "./gfx.js";
const RW = 26, RD = 24, RH = 10, PER = 12;
const money = (c, cur) => { try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", maximumFractionDigits: 0 }).format((c || 0) / 100); } catch { return "$" + Math.round((c || 0) / 100); } };
function marble() {
  return canvasTex(512, 512, (x) => {
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const dark = (i + j) % 2; const g = x.createLinearGradient(i * 128, j * 128, i * 128 + 128, j * 128 + 128); g.addColorStop(0, dark ? "#2c3a34" : "#efe6d2"); g.addColorStop(1, dark ? "#1f2a26" : "#ddd0b6"); x.fillStyle = g; x.fillRect(i * 128, j * 128, 128, 128); }
    for (let k = 0; k < 90; k++) { x.strokeStyle = `rgba(${k % 2 ? "255,255,255" : "40,50,45"},${0.05 + hash(k) * 0.08})`; x.lineWidth = 1 + hash(k + 1) * 2; x.beginPath(); const sx = hash(k + 2) * 512, sy = hash(k + 3) * 512; x.moveTo(sx, sy); x.bezierCurveTo(sx + 40, sy + 30 * hash(k + 4), sx + 80, sy - 30, sx + 120 + hash(k) * 60, sy + 20); x.stroke(); }
    x.strokeStyle = "rgba(232,184,74,.55)"; x.lineWidth = 2; for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(k * 128, 0); x.lineTo(k * 128, 512); x.moveTo(0, k * 128); x.lineTo(512, k * 128); x.stroke(); }
  }, { repeat: true, aniso: 8 });
}
const CW = 384, CH = 480;
function drawCard(it, img) {
  const c = it.ctx; c.fillStyle = "#17141e"; c.fillRect(0, 0, CW, CH);
  const g = c.createLinearGradient(0, 0, 0, 360); g.addColorStop(0, "#2a2438"); g.addColorStop(1, "#15121c"); c.fillStyle = g; c.fillRect(10, 10, CW - 20, 350);
  if (img) { const r = Math.max((CW - 20) / img.width, 350 / img.height), w = img.width * r, h = img.height * r; c.save(); c.beginPath(); c.rect(10, 10, CW - 20, 350); c.clip(); c.drawImage(img, 10 + (CW - 20 - w) / 2, 10 + (350 - h) / 2, w, h); c.restore(); }
  else { c.fillStyle = "rgba(232,184,74,.5)"; c.font = "120px Georgia,serif"; c.textAlign = "center"; c.fillText("✠", CW / 2, 230); }
  if (!it.data.available) { c.fillStyle = "rgba(10,8,14,.45)"; c.fillRect(10, 10, CW - 20, 350); }
  c.strokeStyle = "#e8b84a"; c.lineWidth = 4; c.strokeRect(5, 5, CW - 10, CH - 10);
  c.fillStyle = "#f6ecd6"; c.textAlign = "center"; c.textBaseline = "alphabetic"; c.font = "700 24px 'Trebuchet MS',Arial,sans-serif";
  const words = it.data.title.replace("Chrome Hearts ", "").split(" "), lines = []; let cur = "";
  for (const w of words) { const t = cur ? cur + " " + w : w; if (c.measureText(t).width > CW - 40 && cur) { lines.push(cur); cur = w; } else cur = t; } lines.push(cur);
  lines.slice(0, 2).forEach((l, i) => c.fillText(l.length > 30 ? l.slice(0, 29) + "…" : l, CW / 2, 392 + i * 28));
  c.fillStyle = it.data.available ? "#e8b84a" : "#ff6a6a"; c.font = "800 28px Georgia,serif"; c.fillText(it.data.available ? money(it.data.price_cents, it.data.currency) : "SOLD", CW / 2, 462);
  it.tex.needsUpdate = true;
}
export function buildGallery({ items: data = [], onNear }) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color("#1a1220"); scene.fog = new THREE.Fog("#1a1220", 34, 120);
  scene.add(new THREE.HemisphereLight(0xffe2b8, 0x5a3a4a, 1.25)); const dl = new THREE.DirectionalLight(0xfff0d8, 1.3); dl.position.set(6, 20, 10); scene.add(dl);
  const rooms = Math.max(1, Math.ceil(data.length / PER)), g = new Geo(); g.baseY = 0; g.seed = 11;
  const P = (t, s, p, c, r, tg) => g.part(t, s, p, c, r || [0, 0, 0], tg || "solid");
  const WALL = "#4a2c40", TRIM = "#e8b84a", CREAM = "#f2e8d0", halos = [];
  const zEnd = -(rooms - 1) * RD - RD / 2;
  for (let k = 0; k < rooms; k++) {
    const zc = -k * RD;
    for (const s of [-1, 1]) { P("box", [0.6, RH, RD], [s * (RW / 2 + 0.3), RH / 2, zc], WALL); P("box", [0.25, 0.25, RD], [s * (RW / 2 - 0.05), 3.3, zc], TRIM); P("box", [0.2, 0.2, RD], [s * (RW / 2 - 0.05), RH - 0.9, zc], TRIM); P("box", [0.3, 3.2, RD - 0.4], [s * (RW / 2 - 0.1), 1.6, zc], "#33202e");
      for (let c = 0; c < 4; c++) { const z = zc - 8.5 + c * 5.6; P("cyl", [0.55, RH - 0.8, 0.55], [s * (RW / 2 - 1.3), (RH - 0.8) / 2, z], CREAM); P("box", [1.5, 0.45, 1.5], [s * (RW / 2 - 1.3), RH - 0.8, z], TRIM); P("box", [1.5, 0.45, 1.5], [s * (RW / 2 - 1.3), 0.22, z], TRIM);
        P("box", [0.12, 3.2, 1.5], [s * (RW / 2 - 0.1), 6.2, z + 2.8], "#a82a3a"); P("box", [0.14, 1.4, 0.1], [s * (RW / 2 - 0.16), 6.6, z + 2.8], "#e8e0f0"); P("box", [0.14, 0.1, 0.7], [s * (RW / 2 - 0.16), 7.0, z + 2.8], "#e8e0f0"); P("sph", 0.22, [s * (RW / 2 - 0.9), 5.4, z + 2.8], "#ffcf6a", [0, 0, 0], "glow"); halos.push([s * (RW / 2 - 0.9), 5.4, z + 2.8]); } }
    P("box", [RW + 1.2, 0.6, RD], [0, RH + 0.3, zc], "#2a2030"); for (let c = 0; c < 5; c++) P("box", [RW - 1, 0.2, 0.8], [0, RH - 0.05, zc - 9 + c * 4.5], "#3a2c40");
    for (const dz of [-6, 6]) { P("cyl", [2.4, 0.18, 2.4], [0, RH - 1.4, zc + dz], TRIM, [0, 0, 0]); for (let a = 0; a < 10; a++) { const px = Math.cos(a * 0.628) * 2.4, pz = Math.sin(a * 0.628) * 2.4; P("sph", 0.26, [px, RH - 1.7, zc + dz + pz], "#ffe2a0", [0, 0, 0], "glow"); } P("cyl", [0.05, 1.6, 0.05], [0, RH - 0.6, zc + dz], TRIM); halos.push([0, RH - 1.7, zc + dz]); }
    P("box", [RW - 6, 0.05, RD - 6], [0, 0.03, zc], "#6a1a2a"); P("box", [RW - 5.4, 0.04, 0.25], [0, 0.06, zc + RD / 2 - 3.1], TRIM); P("box", [RW - 5.4, 0.04, 0.25], [0, 0.06, zc - RD / 2 + 3.1], TRIM);
    const zb = zc - RD / 2;
    if (k < rooms - 1) { for (const s of [-1, 1]) P("box", [(RW - 6) / 2, RH, 0.7], [s * (3 + (RW - 6) / 4), RH / 2, zb], WALL); P("box", [6, RH - 6.2, 0.7], [0, 6.2 + (RH - 6.2) / 2, zb], WALL); for (const s of [-1, 1]) { P("cyl", [0.5, 6.2, 0.5], [s * 3, 3.1, zb + 0.3], CREAM); P("box", [1.2, 0.4, 1.2], [s * 3, 6.2, zb + 0.3], TRIM); } P("box", [6.4, 0.3, 0.9], [0, 6.2, zb], TRIM); }
    else { P("box", [RW, RH, 0.7], [0, RH / 2, zb], WALL); P("box", [0.5, 4.2, 0.3], [0, 4.6, zb + 0.5], TRIM); P("box", [2.4, 0.5, 0.3], [0, 5.6, zb + 0.5], TRIM); for (const [dx, dy] of [[0, 7.0], [0, 2.6], [-1.4, 5.6], [1.4, 5.6]]) P("ico", 0.32, [dx, dy, zb + 0.5], "#fff0b0", [0, 0, 0], "glow"); halos.push([0, 4.8, zb + 1]); }
    if (k === 0) { for (const s of [-1, 1]) P("box", [(RW - 5) / 2, RH, 0.7], [s * (2.5 + (RW - 5) / 4), RH / 2, RD / 2], WALL); P("box", [5, RH - 5, 0.7], [0, 5 + (RH - 5) / 2, RD / 2], WALL); P("box", [5.4, 0.3, 0.8], [0, 5, RD / 2], TRIM); P("box", [2.4, 0.6, 0.12], [0, 5.9, RD / 2 - 0.4], "#2a9a5a", [0, 0, 0], "glow"); }
  }
  const floorTex = marble(); floorTex.repeat.set(RW / 4, rooms * RD / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, rooms * RD), new THREE.MeshBasicMaterial({ map: floorTex, color: 0xcfc4b0 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -(rooms - 1) * RD / 2); scene.add(floor);
  // pedestals + display cards
  const itemsOut = [], glassPos = [], cardGeo = new THREE.PlaneGeometry(1.7, 2.125), soldTex = canvasTex(256, 96, (c) => { c.fillStyle = "#c82a3a"; c.fillRect(0, 0, 256, 96); c.strokeStyle = "#fff"; c.lineWidth = 6; c.strokeRect(6, 6, 244, 84); c.fillStyle = "#fff"; c.font = "800 62px Georgia,serif"; c.textAlign = "center"; c.fillText("SOLD", 128, 68); });
  const soldMat = new THREE.MeshBasicMaterial({ map: soldTex, toneMapped: false }), soldGeo = new THREE.PlaneGeometry(1.1, 0.41);
  data.forEach((d, i) => {
    const r = Math.floor(i / PER), idx = i % PER, row = idx < 6 ? 0 : 1, col = idx % 6, x = -9 + col * 3.6, z = -r * RD + (row ? -4.6 : 4.6);
    P("box", [1.7, 1.1, 1.7], [x, 0.55, z], "#e0d4ba"); P("box", [2.0, 0.16, 2.0], [x, 1.18, z], TRIM); P("box", [1.9, 0.18, 1.9], [x, 0.09, z], "#c8bc9e"); P("box", [1.86, 2.3, 0.1], [x, 2.45, z - 0.2], TRIM, [-0.08, 0, 0]); glassPos.push([x, 1.18 + 1.45, z]);
    const cv = document.createElement("canvas"); cv.width = CW; cv.height = CH; const it = { data: d, canvas: cv, ctx: cv.getContext("2d"), room: r, x, z, loaded: false, index: i };
    it.tex = new THREE.CanvasTexture(cv); it.tex.colorSpace = THREE.SRGBColorSpace; it.tex.anisotropy = 4; drawCard(it, null);
    const m = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: it.tex, toneMapped: false })); m.position.set(x, 2.5, z - 0.12); m.rotation.x = -0.08; m.userData.item = it; scene.add(m); it.mesh = m;
    if (!d.available) { const s = new THREE.Mesh(soldGeo, soldMat); s.position.set(x - 0.45, 3.35, z - 0.04); s.rotation.set(-0.08, 0, 0.12); scene.add(s); }
    itemsOut.push(it);
  });
  // central statue in room 0: the archive cross (our own design)
  const sx = 0, sz = 0; P("box", [1.6, 1.0, 1.6], [sx, 0.5, sz], "#2a2a34"); P("box", [1.2, 0.5, 1.2], [sx, 1.25, sz], TRIM);
  const cross = new Geo(); cross.part("box", [0.34, 2.8, 0.34], [0, 1.4, 0], "#e8b84a"); cross.part("box", [1.7, 0.34, 0.34], [0, 2.0, 0], "#e8b84a"); for (const [dx, dy] of [[0, 3.0], [-0.95, 2.0], [0.95, 2.0], [0, 0.1]]) cross.part("ico", 0.26, [dx, dy, 0], "#fff4c0", [0, 0, 0], "glow");
  const crossM = cross.mesh("solid", new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); crossM.position.set(sx, 1.5, sz); scene.add(crossM); const crossG = cross.mesh("glow", new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); if (crossG) { crossG.position.copy(crossM.position); scene.add(crossG); } halos.push([sx, 3.3, sz]);
  const solid = g.mesh("solid", new THREE.MeshStandardMaterial({ vertexColors: true, map: plasterTex(), roughness: 0.85, flatShading: true, emissive: 0x2a1a22, emissiveIntensity: 0.5 }), false); scene.add(solid);
  const glow = g.mesh("glow", new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false); if (glow) scene.add(glow);
  if (glassPos.length) { const gl = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 3.0, 1.9), new THREE.MeshBasicMaterial({ color: 0xaad4ff, transparent: true, opacity: 0.1, depthWrite: false }), glassPos.length); const o = new THREE.Object3D(); glassPos.forEach((p, i) => { o.position.set(...p); o.updateMatrix(); gl.setMatrixAt(i, o.matrix); }); scene.add(gl); }
  // soft halos for the lamps
  const hp = new Float32Array(halos.length * 3); halos.forEach((h, i) => hp.set(h, i * 3)); const hg = new THREE.BufferGeometry(); hg.setAttribute("position", new THREE.BufferAttribute(hp, 3));
  scene.add(new THREE.Points(hg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { px: { value: 1 } }, vertexShader: "uniform float px; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(900.0*px/-mv.z,4.0,220.0); }", fragmentShader: "void main(){ float a=smoothstep(1.0,0.0,length(gl_PointCoord-0.5)*2.0)*0.55; gl_FragColor=vec4(1.0,0.8,0.45,a); }" })));
  // image streaming: only rooms near the visitor
  let active = 0; const queue = []; const loadItem = (it) => { if (it.loaded || !it.data.img) { it.loaded = true; return; } it.loaded = true; queue.push(it); };
  const pump = () => { while (active < 3 && queue.length) { const it = queue.shift(); active++; const im = new Image(); im.onload = () => { active--; drawCard(it, im); pump(); }; im.onerror = () => { active--; pump(); }; im.src = "/city/img?p=" + encodeURIComponent(it.data.img); } };
  const blockedCircles = itemsOut.map((i) => ({ x: i.x, z: i.z, r: 1.35 })).concat([{ x: sx, z: sz, r: 1.3 }]);
  const api = {
    scene, rooms, items: itemsOut, spawn: { x: 0, z: RD / 2 - 3.5, yaw: Math.PI }, exit: { x: 0, z: RD / 2 - 1.0, r: 2.4 }, name: "The Gallery", crossPos: { x: sx, z: sz },
    blocked(x, z) { if (x < -RW / 2 + 0.8 || x > RW / 2 - 0.8 || z > RD / 2 + 0.8 || z < zEnd + 0.8) return true; if (z > RD / 2 - 0.9 && Math.abs(x) > 2.2) return true; for (let k = 0; k < rooms - 1; k++) { const zb = -k * RD - RD / 2; if (Math.abs(z - zb) < 0.8 && Math.abs(x) > 2.8) return true; } for (const c of blockedCircles) if (Math.hypot(x - c.x, z - c.z) < c.r) return true; return false; },
    groundY: () => 0, camClamp(v) { v.x = Math.min(RW / 2 - 0.6, Math.max(-RW / 2 + 0.6, v.x)); v.z = Math.min(RD / 2 + 0.5, Math.max(zEnd + 0.6, v.z)); v.y = Math.min(RH - 1.2, Math.max(0.8, v.y)); },
    nearest(x, z) { let b = null, bd = 2.9; for (const it of itemsOut) { const d = Math.hypot(x - it.x, z - it.z); if (d < bd) { bd = d; b = it; } } return b; },
    update(dt, hx, hz, t) { const room = Math.round(-hz / RD); for (const it of itemsOut) if (!it.loaded && Math.abs(it.room - room) <= 1) loadItem(it); pump(); crossM.rotation.y = t * 0.6; if (crossG) crossG.rotation.y = t * 0.6; },
    dispose() { scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { for (const k of ["map"]) if (o.material[k]) o.material[k].dispose(); o.material.dispose(); } }); itemsOut.forEach((i) => i.tex.dispose()); floorTex.dispose(); },
  };
  return api;
}

// ---------- themed rooms for every other building (small, cheap, built on entry, disposed on exit) ----------
function screenTex(b, d) {
  return canvasTex(1024, 512, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, "#14233a"); g.addColorStop(1, "#0a1424"); c.fillStyle = g; c.fillRect(0, 0, 1024, 512);
    c.strokeStyle = "#e8b84a"; c.lineWidth = 6; c.strokeRect(8, 8, 1008, 496); c.fillStyle = "#ffd98a"; c.font = "800 52px Georgia,serif"; c.textBaseline = "alphabetic"; c.fillText(b.name, 36, 80);
    const st = d ? d.status : b.status; c.fillStyle = { open: "#3aa876", construction: "#f2b21c", closed: "#777", planned: "#6a8ad8" }[st] || "#777"; c.fillRect(36, 100, 230, 40); c.fillStyle = "#06100a"; c.font = "800 24px Arial"; c.fillText({ open: "OPEN", construction: "UNDER CONSTRUCTION", closed: "CLOSED", planned: "PLANNED" }[st] || st, 46, 129);
    c.fillStyle = "#cfe0f5"; c.font = "500 26px 'Trebuchet MS',Arial"; c.fillText((b.purpose || "").slice(0, 70), 36, 182);
    const k = d?.kpis || []; k.slice(0, 8).forEach((x, i) => { const px = 36 + (i % 2) * 490, py = 214 + Math.floor(i / 2) * 68; c.fillStyle = "rgba(255,255,255,.07)"; c.fillRect(px, py, 470, 58); c.fillStyle = "#9fb4d0"; c.font = "500 20px Arial"; c.fillText(x.l + (x.tag ? "  [" + x.tag + "]" : ""), px + 12, py + 22); c.fillStyle = x.no ? "#6a7890" : "#ffffff"; c.font = "700 28px Arial"; c.fillText(String(x.v).slice(0, 28), px + 12, py + 50); });
    if (!k.length) { c.fillStyle = "#6a7890"; c.font = "500 30px Arial"; c.fillText((d?.notes?.[0] || "no data yet").slice(0, 60), 36, 260); }
    c.fillStyle = "#6a7890"; c.font = "500 18px Arial"; c.fillText("Live, read-only. Press E for the full panel.", 36, 496);
  });
}
function floorTex(kind) {
  return canvasTex(256, 256, (c) => {
    if (kind === "wood") { for (let i = 0; i < 8; i++) { c.fillStyle = ["#9a6a3a", "#8a5a2e", "#a87a46", "#946432"][i % 4]; c.fillRect(0, i * 32, 256, 32); c.strokeStyle = "rgba(40,20,5,.35)"; c.strokeRect(0, i * 32, 256, 32); for (let k = 0; k < 6; k++) { c.strokeStyle = "rgba(60,30,10,.2)"; c.beginPath(); c.moveTo(hash(i * 9 + k) * 256, i * 32); c.lineTo(hash(i * 9 + k) * 256 + 30, i * 32 + 30); c.stroke(); } } }
    else { for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { c.fillStyle = (i + j) % 2 ? "#e8dcc0" : "#cfc2a0"; c.fillRect(i * 64, j * 64, 64, 64); c.strokeStyle = "rgba(90,70,40,.4)"; c.strokeRect(i * 64, j * 64, 64, 64); } }
  }, { repeat: true });
}
const THEME = { bank: "bank", lab: "lab", home: "villa", news: "news", super: "super", workerhome: "cozy", market: "market" };
export function buildRoom({ b, panel }) {
  const theme = THEME[b.id] || THEME[b.kind] || "office", big = theme === "villa" ? [22, 18] : theme === "bank" ? [20, 16] : theme === "lab" ? [16, 14] : theme === "super" ? [18, 14] : [14, 12], [W, D] = big, H = theme === "villa" ? 6.5 : 6;
  const scene = new THREE.Scene(); const bgc = theme === "villa" ? "#9ad4ff" : "#241a2a"; scene.background = new THREE.Color(bgc); scene.add(new THREE.HemisphereLight(0xffe8c8, 0x6a4a3a, 1.45)); const dl = new THREE.DirectionalLight(0xfff0d8, 1.1); dl.position.set(5, 12, 8); scene.add(dl);
  const g = new Geo(); g.baseY = 0; g.seed = 21; const P = (t, s, p, c, r, tg) => g.part(t, s, p, c, r || [0, 0, 0], tg || "solid");
  const acc = b.accent || "#6a4a8a", wall = theme === "villa" ? "#f4ece0" : theme === "bank" ? "#6a5a48" : theme === "lab" ? "#3a2a4a" : theme === "super" ? "#e8f0e8" : theme === "cozy" ? "#d8b890" : theme === "news" ? "#5a3a2a" : new THREE.Color(acc).multiplyScalar(0.55).getStyle();
  const obstacles = [], halos = [], screens = [], items = [], status = panel?.status || b.status;
  for (const s of [-1, 1]) { P("box", [0.5, H, D], [s * (W / 2 + 0.25), H / 2, 0], wall); P("box", [0.2, 0.22, D], [s * (W / 2 - 0.05), 1.2, 0], "#e8b84a"); }
  P("box", [W + 1, H, 0.5], [0, H / 2, -D / 2 - 0.25], wall); P("box", [W + 1, 0.6, D + 1], [0, H + 0.3, 0], "#2a2030");
  for (const s of [-1, 1]) P("box", [(W - 3.2) / 2, H, 0.5], [s * (1.6 + (W - 3.2) / 4), H / 2, D / 2 + 0.25], wall); P("box", [3.2, H - 3.4, 0.5], [0, 3.4 + (H - 3.4) / 2, D / 2 + 0.25], wall); P("box", [3.6, 0.25, 0.7], [0, 3.4, D / 2 + 0.25], "#e8b84a"); P("box", [2.2, 0.5, 0.1], [0, 3.9, D / 2 - 0.1], "#2a9a5a", [0, 0, 0], "glow");
  for (const x of [-W * 0.3, W * 0.3]) { P("box", [1.6, 1.8, 0.12], [x, 3.4, D / 2 - 0.05], status === "open" ? "#ffd78a" : "#222", [0, 0, 0], status === "open" ? "glow" : "solid"); } for (let i = 0; i < 3; i++) { P("cyl", [0.4, 0.14, 0.4], [-W / 4 + i * W / 4, H - 0.3, 0], "#ffd890", [0, 0, 0], "glow"); halos.push([-W / 4 + i * W / 4, H - 0.5, 0]); }
  // diegetic screen on the back wall + counter in front of it
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.6), new THREE.MeshBasicMaterial({ map: screenTex(b, panel), toneMapped: false })); sc.position.set(0, 3.3, -D / 2 + 0.02); scene.add(sc); P("box", [5.5, 2.9, 0.12], [0, 3.3, -D / 2 + 0.0], "#e8b84a");
  P("box", [4.0, 1.0, 1.2], [0, 0.5, -D / 2 + 1.6], "#5a3a22"); P("box", [4.2, 0.14, 1.4], [0, 1.05, -D / 2 + 1.6], "#8a6a3a"); obstacles.push({ x: 0, z: -D / 2 + 1.6, r: 2.3 }); screens.push({ x: 0, z: -D / 2 + 3.4, panel: true });
  const rug = acc; P("box", [W * 0.5, 0.04, D * 0.4], [0, 0.03, 1], rug);
  const ob = (x, z, r) => obstacles.push({ x, z, r });
  if (theme === "bank") {
    P("cyl", [2.6, 0.7, 2.6], [W / 2 - 3, 3, -D / 2 + 0.5], "#4a4a54", [Math.PI / 2, 0, 0]); P("cyl", [2.0, 0.8, 2.0], [W / 2 - 3, 3, -D / 2 + 0.6], "#8a8a96", [Math.PI / 2, 0, 0]); for (let k = 0; k < 6; k++) P("box", [0.14, 3.6, 0.14], [W / 2 - 3, 3, -D / 2 + 1.1], "#6a6a76", [0, 0, k * 0.52]); P("sph", 0.35, [W / 2 - 3, 3, -D / 2 + 1.2], "#e8b84a");
    for (let i = 0; i < 18; i++) P("cyl", [0.5 + hash(i) * 0.2, 0.09, 0.5], [-W / 2 + 2 + (i % 6) * 0.9, 0.1 + Math.floor(i / 6) * 0.2, D / 2 - 3 - Math.floor(i / 6) * 0.3], "#ffd24a", [0.1, 0, 0.1]); for (let i = 0; i < 6; i++) P("box", [1.2, 0.7, 0.8], [-W / 2 + 2 + i * 1.4, 0.35, -D / 2 + 1.0], "#e8b84a"); ob(-W / 2 + 4.5, D / 2 - 3, 2.2);
    P("box", [9, 1.2, 0.9], [-3, 0.6, 0.5], "#4a3a2a"); P("box", [9.2, 0.14, 1.1], [-3, 1.25, 0.5], "#8a6a3a"); for (let i = 0; i < 3; i++) P("box", [1.2, 1.3, 0.1], [-6.2 + i * 3.2, 2.1, 0.5], "#c8e0f0"); ob(-3, 0.5, 4.8); halos.push([W / 2 - 3, 3, -D / 2 + 1.4]);
  } else if (theme === "lab") {
    for (const s of [-1, 1]) for (let r = 0; r < 3; r++) { P("box", [0.7, 0.1, D - 3], [s * (W / 2 - 0.5), 1.2 + r * 1.4, 0], "#6a4428"); for (let k = 0; k < 9; k++) { P("cyl", [0.13, 0.55, 0.13], [s * (W / 2 - 0.5), 1.45 + r * 1.4, -D / 2 + 2 + k * 1.1], ["#f4e4b8", "#e8d4a0"][k % 2], [0, 0, 1.45 + (k % 3) * 0.05]); P("sph", 0.1, [s * (W / 2 - 0.5), 1.5 + r * 1.4, -D / 2 + 2.3 + k * 1.1], "#ffd878", [0, 0, 0], k % 3 ? "solid" : "glow"); } }
    P("box", [2.6, 0.9, 1.4], [0, 0.45, 0.5], "#6a4428"); P("box", [2.2, 0.06, 1.0], [0, 0.95, 0.5], "#f4e4b8"); P("cyl", [0.1, 0.5, 0.1], [0.8, 1.2, 0.3], "#c8a050"); ob(0, 0.5, 1.6); halos.push([0, 1.2, 0.5]);
  } else if (theme === "villa") {
    P("box", [9, 0.4, 5.5], [W / 2 - 6, 0.2, 2.2], "#efe6d2"); P("box", [8, 0.1, 4.6], [W / 2 - 6, 0.43, 2.2], "#3ac8e8", [0, 0, 0], "glow"); ob(W / 2 - 6, 2.2, 4.2);
    P("box", [3.2, 0.5, 2.2], [-W / 2 + 3, 0.35, -D / 2 + 2.2], "#7a4a2a"); P("box", [3.0, 0.4, 2.0], [-W / 2 + 3, 0.75, -D / 2 + 2.2], "#f4ece0"); P("box", [1.0, 0.2, 0.6], [-W / 2 + 2.3, 1.05, -D / 2 + 1.6], "#fff"); ob(-W / 2 + 3, -D / 2 + 2.2, 2.4);
    P("box", [4, 0.6, 1.2], [-W / 2 + 3.5, 0.35, 3], "#a8482a"); P("box", [4, 0.9, 0.3], [-W / 2 + 3.5, 0.95, 3.5], "#a8482a"); ob(-W / 2 + 3.5, 3, 2.4);
    P("box", [3, 2.2, 0.7], [-3, 1.1, -D / 2 + 0.5], "#cfc6b4"); P("box", [1.8, 1.1, 0.5], [-3, 0.7, -D / 2 + 0.75], "#2a1a14"); P("sph", 0.4, [-3, 0.5, -D / 2 + 0.9], "#ff8a3a", [0, 0, 0], "glow"); halos.push([-3, 0.6, -D / 2 + 1]);
    for (let i = 0; i < 6; i++) P("cyl", [0.3, 1.0, 0.3], [-W / 2 + 1 + i * 4, 0.5, D / 2 - 1.2], "#fffaf0");
  } else if (theme === "news") {
    P("box", [3.4, 1.6, 2.0], [-W / 4, 0.8, 0.5], "#2a2a34"); for (let i = 0; i < 3; i++) P("cyl", [0.3, 3.0, 0.3], [-W / 4, 1.9 + i * 0.4, 0.5], "#8a8a96", [0, 0, Math.PI / 2]); P("box", [3.0, 0.05, 1.6], [-W / 4 + 2.4, 0.6, 0.5], "#f4efe4"); ob(-W / 4, 0.5, 2.2);
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) P("box", [0.08, 1.2, 1.0], [s * (W / 2 - 0.1), 3 + (i % 2) * 1.5, -D / 2 + 2.6 + i * 2.2], ["#f4efe4", "#fff0c8"][i % 2]);
  } else if (theme === "super") {
    for (let r = 0; r < 3; r++) { P("box", [W * 0.6, 1.8, 0.7], [-1, 0.9, -D / 2 + 3 + r * 3], "#cfd8d0"); for (let k = 0; k < 14; k++) P("box", [0.5, 0.5 + (k % 3) * 0.2, 0.4], [-1 - W * 0.28 + k * 0.82, 1.9, -D / 2 + 3 + r * 3], ["#e0383a", "#e8a03a", "#7ac04a", "#4a8ae8", "#e8e0d0"][k % 5]); ob(-1, -D / 2 + 3 + r * 3, 0); obstacles.pop(); for (let k = 0; k < 5; k++) obstacles.push({ x: -1 - 3.5 + k * 2.4, z: -D / 2 + 3 + r * 3, r: 1.3 }); }
    P("box", [3, 1.0, 1.0], [W / 2 - 2.5, 0.5, D / 2 - 2], "#e8504a");
  } else if (theme === "cozy") {
    P("box", [2.6, 0.5, 1.4], [-W / 2 + 2, 0.3, -D / 2 + 1.5], "#8a5a34"); P("box", [2.4, 0.3, 1.2], [-W / 2 + 2, 0.65, -D / 2 + 1.5], acc); P("box", [0.9, 0.15, 0.5], [-W / 2 + 1.2, 0.9, -D / 2 + 1.5], "#fff"); ob(-W / 2 + 2, -D / 2 + 1.5, 1.8);
    P("box", [1.8, 0.8, 1.0], [W / 2 - 3, 0.4, 0], "#6a4428"); for (const dz of [-1, 1]) P("box", [0.6, 0.5, 0.6], [W / 2 - 3, 0.25, dz * 1.1], "#8a5a34"); ob(W / 2 - 3, 0, 1.4); P("box", [2.2, 1.8, 0.6], [W / 2 - 1.2, 0.9, -D / 2 + 1], "#a89a88"); P("sph", 0.3, [W / 2 - 1.2, 0.4, -D / 2 + 1.35], "#ff8a3a", [0, 0, 0], "glow"); halos.push([W / 2 - 1.2, 0.5, -D / 2 + 1.4]);
  } else if (theme === "market") {
    for (let i = 0; i < 3; i++) { P("box", [2.6, 1.0, 1.2], [-W / 3 + i * W / 3, 0.5, 0], "#7a5a34"); P("box", [2.8, 0.1, 1.4], [-W / 3 + i * W / 3, 1.05, 0], "#a8844e"); for (let k = 0; k < 5; k++) P("box", [0.2, 0.6 + k * 0.15, 0.2], [-W / 3 + i * W / 3 - 0.8 + k * 0.4, 1.4 + k * 0.07, 0], k % 2 ? "#d83a3a" : "#2ac868"); ob(-W / 3 + i * W / 3, 0, 1.7); }
  } else { P("box", [1.6, 0.9, 0.9], [W / 2 - 2.5, 0.45, 1], "#6a4428"); P("cyl", [0.5, 1.4, 0.5], [-W / 2 + 1.5, 0.7, D / 2 - 2], "#8a5a34"); P("ico", [0.9, 0.9, 0.9], [-W / 2 + 1.5, 1.8, D / 2 - 2], "#4aa83a"); ob(-W / 2 + 1.5, D / 2 - 2, 1.0); ob(W / 2 - 2.5, 1, 1.2); }
  const solid = g.mesh("solid", new THREE.MeshStandardMaterial({ vertexColors: true, map: plasterTex(), roughness: 0.85, flatShading: true, emissive: 0x2a1a22, emissiveIntensity: 0.5 }), false); scene.add(solid); const glow = g.mesh("glow", new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false); if (glow) scene.add(glow);
  const ft = floorTex(theme === "villa" || theme === "super" || theme === "bank" ? "tile" : "wood"); ft.repeat.set(W / 3, D / 3); const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ map: ft, color: 0xdcd0c0 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  if (theme === "villa") { const sky = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, 2.4), new THREE.MeshBasicMaterial({ color: 0x8fd0ff })); sky.position.set(0, 3.6, -D / 2 + 0.01); scene.add(sky); sc.position.z += 0.02; }
  const hp = new Float32Array(halos.length * 3); halos.forEach((h, i) => hp.set(h, i * 3)); const hg = new THREE.BufferGeometry(); hg.setAttribute("position", new THREE.BufferAttribute(hp, 3));
  scene.add(new THREE.Points(hg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: "void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=clamp(500.0/-mv.z,4.0,160.0); }", fragmentShader: "void main(){ float a=smoothstep(1.0,0.0,length(gl_PointCoord-0.5)*2.0)*0.5; gl_FragColor=vec4(1.0,0.8,0.45,a); }" })));
  return {
    scene, rooms: 1, items, spawn: { x: 0, z: D / 2 - 2.6, yaw: Math.PI }, exit: { x: 0, z: D / 2 - 0.5, r: 1.8 }, name: theme, theme, panelOnly: true,
    blocked(x, z) { if (x < -W / 2 + 0.7 || x > W / 2 - 0.7 || z < -D / 2 + 0.7 || z > D / 2 + 0.6) return true; if (z > D / 2 - 0.7 && Math.abs(x) > 1.4) return true; for (const o of obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r) return true; return false; },
    groundY: () => 0, camClamp(v) { v.x = Math.min(W / 2 - 0.5, Math.max(-W / 2 + 0.5, v.x)); v.z = Math.min(D / 2 + 0.3, Math.max(-D / 2 + 0.5, v.z)); v.y = Math.min(H - 0.8, Math.max(0.8, v.y)); },
    nearest(x, z) { const s = screens[0]; return Math.hypot(x - s.x, z - s.z) < 3.4 ? { screen: true, data: { title: b.name + " · live screen" } } : null; },
    update() {}, dispose() { scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); },
  };
}
