// Hand-painted procedural textures, generated on canvas at load. No image files.
import * as THREE from "three";

let seed = 1234567;
export const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
export const rr = (a, b) => a + (b - a) * rnd();

function cv(w, h = w) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
function tex(c, rx = 1, ry = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// soft painterly blotches
function blotch(g, w, h, n, cols, rMin, rMax, alpha) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, r = rr(rMin, rMax);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const c = cols[(rnd() * cols.length) | 0];
    gr.addColorStop(0, c.replace("A", alpha)); gr.addColorStop(1, c.replace("A", 0));
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    // wrap
    for (const [dx, dy] of [[w, 0], [-w, 0], [0, h], [0, -h]]) { g.save(); g.translate(dx, dy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
  }
}

export function marble(base = "#f4efe6", vein = "rgba(120,110,130,A)") {
  const [c, g] = cv(512); g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  blotch(g, 512, 512, 60, ["rgba(255,250,240,A)", "rgba(225,215,205,A)", "rgba(235,228,240,A)"], 30, 120, 0.5);
  // veins: wandering lines
  for (let v = 0; v < 14; v++) {
    let x = rnd() * 512, y = rnd() * 512, a = rnd() * Math.PI * 2;
    g.strokeStyle = vein.replace("A", rr(0.08, 0.35)); g.lineWidth = rr(0.6, 2.4);
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 80; s++) { a += rr(-0.35, 0.35); x += Math.cos(a) * 6; y += Math.sin(a) * 6; g.lineTo(x, y); }
    g.stroke();
  }
  return tex(c);
}
export function stone(base = "#cbb89a", rows = 8) {
  const [c, g] = cv(512); g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  const h = 512 / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rr(20, 60) : 0;
    while (x < 512) {
      const w = rr(70, 140), l = rr(-14, 14);
      g.fillStyle = `hsl(${rr(30, 42)},${rr(20, 32)}%,${62 + l}%)`;
      g.fillRect(x + 2, r * h + 2, w - 4, h - 4);
      // paint highlight top, shade bottom
      g.fillStyle = "rgba(255,245,220,.25)"; g.fillRect(x + 2, r * h + 2, w - 4, 4);
      g.fillStyle = "rgba(60,40,20,.22)"; g.fillRect(x + 2, r * h + h - 6, w - 4, 4);
      x += w;
    }
  }
  blotch(g, 512, 512, 40, ["rgba(90,70,40,A)", "rgba(255,240,210,A)"], 10, 50, 0.12);
  return tex(c);
}
export function rock() {
  const [c, g] = cv(512); g.fillStyle = "#8a7660"; g.fillRect(0, 0, 512, 512);
  // vertical strata, painted
  for (let i = 0; i < 90; i++) {
    const x = rnd() * 512, y = rnd() * 512, w = rr(20, 90), h = rr(8, 30);
    g.fillStyle = `hsl(${rr(22, 36)},${rr(18, 30)}%,${rr(30, 58)}%)`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + rr(-6, 6)); g.lineTo(x + w - rr(0, 10), y + h); g.lineTo(x + rr(0, 10), y + h + rr(-4, 4)); g.closePath(); g.fill();
    g.fillStyle = "rgba(255,230,190,.18)"; g.fillRect(x, y, w, 3);
  }
  blotch(g, 512, 512, 30, ["rgba(70,110,60,A)"], 10, 40, 0.35); // moss
  return tex(c, 8, 1);
}
export function grass() {
  const [c, g] = cv(512); g.fillStyle = "#5f9a3c"; g.fillRect(0, 0, 512, 512);
  blotch(g, 512, 512, 90, ["rgba(120,180,70,A)", "rgba(70,130,50,A)", "rgba(150,190,80,A)", "rgba(90,150,90,A)"], 20, 90, 0.45);
  for (let i = 0; i < 3000; i++) { // brush strokes
    const x = rnd() * 512, y = rnd() * 512; g.strokeStyle = `hsla(${rr(80, 120)},${rr(40, 60)}%,${rr(30, 55)}%,.5)`;
    g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rr(-2, 2), y - rr(3, 7)); g.stroke();
  }
  blotch(g, 512, 512, 25, ["rgba(240,220,120,A)"], 3, 8, 0.6); // tiny flowers
  return tex(c, 30, 30);
}
export function paving(base = "#e8dcc4") {
  const [c, g] = cv(512); g.fillStyle = "#b8a888"; g.fillRect(0, 0, 512, 512);
  const n = 8, s = 512 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = `hsl(${rr(34, 44)},${rr(28, 40)}%,${rr(80, 90)}%)`; g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
    g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(x * s + 2, y * s + 2, s - 4, 3);
  }
  blotch(g, 512, 512, 30, ["rgba(140,120,90,A)"], 10, 40, 0.15);
  return tex(c, 1, 1);
}
export function roofTiles(h = 12) {
  const [c, g] = cv(256); g.fillStyle = "#8a3a22"; g.fillRect(0, 0, 256, 256);
  const rows = 8, cols = 8, rh = 256 / rows, cw = 256 / cols;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols + 1; k++) {
    const x = k * cw - (r % 2 ? cw / 2 : 0), y = r * rh;
    const gr = g.createLinearGradient(x, 0, x + cw, 0);
    const L = rr(40, 52); gr.addColorStop(0, `hsl(${h},62%,${L - 12}%)`); gr.addColorStop(0.5, `hsl(${h + 4},70%,${L + 8}%)`); gr.addColorStop(1, `hsl(${h},62%,${L - 14}%)`);
    g.fillStyle = gr; g.beginPath(); g.ellipse(x + cw / 2, y + rh * 0.6, cw / 2 - 1, rh * 0.62, 0, 0, Math.PI * 2); g.fill();
  }
  return tex(c);
}
export function wood() {
  const [c, g] = cv(256); g.fillStyle = "#8a5a32"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) { g.strokeStyle = `hsla(28,45%,${rr(22, 45)}%,.6)`; g.lineWidth = rr(1, 3); const y = rnd() * 256; g.beginPath(); g.moveTo(0, y); for (let x = 0; x < 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 3); g.stroke(); }
  for (let k = 0; k < 4; k++) { g.fillStyle = "rgba(40,20,5,.5)"; g.fillRect(0, k * 64, 256, 2); }
  return tex(c);
}
export function gold() {
  const [c, g] = cv(256); const gr = g.createLinearGradient(0, 0, 256, 256);
  gr.addColorStop(0, "#ffe9a0"); gr.addColorStop(0.35, "#e6b84a"); gr.addColorStop(0.6, "#fff0b8"); gr.addColorStop(1, "#c8922e");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  blotch(g, 256, 256, 30, ["rgba(255,255,230,A)", "rgba(150,100,30,A)"], 10, 40, 0.25);
  return tex(c);
}
export function mosaicSpiral() { // golden-ratio spiral floor
  const [c, g] = cv(1024); g.fillStyle = "#f1e6cc"; g.fillRect(0, 0, 1024, 1024);
  for (let y = 0; y < 1024; y += 16) for (let x = 0; x < 1024; x += 16) { g.fillStyle = `hsl(${rr(36, 46)},${rr(30, 45)}%,${rr(80, 90)}%)`; g.fillRect(x + 1, y + 1, 14, 14); }
  const phi = 1.618; let s = 600, x = 212, y = 212; g.lineWidth = 10; g.strokeStyle = "#1aa6c8";
  // fibonacci rectangles + arcs
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let cx = 160, cy = 260, size = 620;
  for (let i = 0; i < 9; i++) {
    g.strokeStyle = i % 2 ? "#c99a2e" : "#1aa6c8"; g.strokeRect(cx, cy, size, size);
    g.beginPath();
    const k = i % 4;
    if (k === 0) g.arc(cx + size, cy + size, size, Math.PI, Math.PI * 1.5);
    if (k === 1) g.arc(cx, cy + size, size, Math.PI * 1.5, Math.PI * 2);
    if (k === 2) g.arc(cx, cy, size, 0, Math.PI * 0.5);
    if (k === 3) g.arc(cx + size, cy, size, Math.PI * 0.5, Math.PI);
    g.strokeStyle = "#d4a53a"; g.lineWidth = 14; g.stroke(); g.lineWidth = 8;
    const ns = size / phi;
    if (k === 0) { cx += size; size = ns; cx -= 0; }
    if (k === 1) { cy += 0; }
    // keep subdividing inward
    if (k === 0) { cx = cx - size; cy = cy; }
    size = ns;
    if (k === 0) { cx = cx + 0; }
    if (k === 1) { cx = cx + (size * phi - size); }
    if (k === 2) { cy = cy + (size * phi - size); }
  }
  // border meander
  g.fillStyle = "#1a6f8f"; for (let i = 0; i < 1024; i += 32) { g.fillRect(i, 0, 20, 18); g.fillRect(i, 1006, 20, 18); g.fillRect(0, i, 18, 20); g.fillRect(1006, i, 18, 20); }
  return tex(c, 1, 1);
}
export function water() {
  const [c, g] = cv(256); g.fillStyle = "#2a8fb0"; g.fillRect(0, 0, 256, 256);
  blotch(g, 256, 256, 40, ["rgba(120,220,240,A)", "rgba(20,90,140,A)"], 10, 50, 0.35);
  return tex(c, 1, 1);
}
export function waterfall() {
  const [c, g] = cv(128, 256); g.fillStyle = "rgba(140,220,255,.55)"; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${rr(0.2, 0.7)})`; g.fillRect(rnd() * 128, rnd() * 256, rr(1, 4), rr(20, 90)); }
  const t = tex(c, 6, 1); return t;
}
export function foliage(h = 105) { // leaf clumps painted
  const [c, g] = cv(256); g.fillStyle = `hsl(${h},45%,30%)`; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 500; i++) { const x = rnd() * 256, y = rnd() * 256; g.fillStyle = `hsl(${h + rr(-15, 15)},${rr(40, 65)}%,${rr(28, 60)}%)`; g.beginPath(); g.ellipse(x, y, rr(4, 9), rr(2, 4), rnd() * 3, 0, 7); g.fill(); }
  return tex(c);
}
export function glowDot() {
  const [c, g] = cv(64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(150,250,255,.9)"); gr.addColorStop(1, "rgba(0,200,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return tex(c);
}
export function flame() {
  const [c, g] = cv(64, 128); const gr = g.createRadialGradient(32, 90, 2, 32, 80, 60);
  gr.addColorStop(0, "rgba(255,255,220,1)"); gr.addColorStop(0.3, "rgba(255,190,60,.95)"); gr.addColorStop(0.7, "rgba(255,90,20,.5)"); gr.addColorStop(1, "rgba(255,40,0,0)");
  g.fillStyle = gr; g.beginPath(); g.moveTo(32, 0); g.quadraticCurveTo(64, 70, 50, 110); g.quadraticCurveTo(32, 128, 14, 110); g.quadraticCurveTo(0, 70, 32, 0); g.fill();
  return tex(c);
}
// a text label texture (building names)
export function label(text, sub = "", col = "#ffe7a8") {
  const [c, g] = cv(512, 128);
  g.fillStyle = "rgba(10,20,40,.72)"; roundRect(g, 4, 18, 504, 92, 22); g.fill();
  g.strokeStyle = "rgba(230,190,90,.9)"; g.lineWidth = 3; roundRect(g, 4, 18, 504, 92, 22); g.stroke();
  g.fillStyle = col; g.font = "bold 40px Cinzel, Georgia, serif"; g.textAlign = "center"; g.fillText(text, 256, sub ? 64 : 78);
  if (sub) { g.fillStyle = "#8fe9ff"; g.font = "26px Georgia, serif"; g.fillText(sub, 256, 98); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
