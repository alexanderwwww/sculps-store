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
