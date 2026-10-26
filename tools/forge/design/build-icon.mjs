// Turns the approved artwork (source/eagle-glass-gold.webp, made by ChatGPT in
// the same glass family as the ultracursor icon) into the Dock icon.
//
// The artwork is a rounded square on a black field. The black outside the
// square is cut away (flood fill from the border, so black INSIDE the art
// stays), the square is cropped and set at 820 of 1024 px, the size the other
// Dock icons of his use, then written as PNGs and an .icns.
//
//   node build-icon.mjs [source] [outdir]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2] || join(here, "source", "eagle-glass-gold.webp");
const out = process.argv[3] || here;
mkdirSync(out, { recursive: true });
const require = createRequire(join(here, "..", "..", "..", "package.json"));
let pw;
try { pw = require("playwright"); } catch { pw = require("playwright-core"); }
const exe = process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium";
const browser = await pw.chromium.launch({ executablePath: exe });
const page = await browser.newPage();
const mime = src.endsWith(".png") ? "image/png" : "image/webp";
const data = readFileSync(src).toString("base64");

const SIZES = [16, 32, 64, 128, 256, 512, 1024];
const result = await page.evaluate(async ({ data, mime, SIZES }) => {
  const img = new Image();
  img.src = `data:${mime};base64,${data}`;
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const id = x.getImageData(0, 0, W, H);
  const d = id.data;
  const dark = (i) => d[i] + d[i + 1] + d[i + 2] < 90;
  // Flood fill the outside black from every border pixel.
  const seen = new Uint8Array(W * H);
  const stack = [];
  const push = (px, py) => { const k = py * W + px; if (!seen[k] && dark(k * 4)) { seen[k] = 1; stack.push(k); } };
  for (let i = 0; i < W; i++) { push(i, 0); push(i, H - 1); }
  for (let j = 0; j < H; j++) { push(0, j); push(W - 1, j); }
  while (stack.length) {
    const k = stack.pop(), px = k % W, py = (k / W) | 0;
    if (px > 0) push(px - 1, py);
    if (px < W - 1) push(px + 1, py);
    if (py > 0) push(px, py - 1);
    if (py < H - 1) push(px, py + 1);
  }
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let k = 0; k < W * H; k++) {
    if (seen[k]) { d[k * 4 + 3] = 0; continue; }
    const px = k % W, py = (k / W) | 0;
    if (px < minX) minX = px; if (px > maxX) maxX = px;
    if (py < minY) minY = py; if (py > maxY) maxY = py;
  }
  // Soften the cut: pixels touching the removed area get partial alpha.
  const alpha = new Uint8ClampedArray(W * H);
  for (let k = 0; k < W * H; k++) alpha[k] = d[k * 4 + 3];
  for (let py = 1; py < H - 1; py++) for (let px = 1; px < W - 1; px++) {
    const k = py * W + px;
    if (alpha[k] === 0) continue;
    let n = 0;
    for (const dk of [-1, 1, -W, W]) if (alpha[k + dk] === 0) n++;
    if (n) d[k * 4 + 3] = n >= 2 ? 120 : 190;
  }
  x.putImageData(id, 0, 0);
  const bw = maxX - minX + 1, bh = maxY - minY + 1, side = Math.max(bw, bh);
  const png = {};
  for (const s of SIZES) {
    const o = document.createElement("canvas");
    o.width = s; o.height = s;
    const ox = o.getContext("2d");
    ox.imageSmoothingQuality = "high";
    const art = s * (820 / 1024);
    ox.drawImage(c, minX, minY, bw, bh, (s - art) / 2, (s - art * (bh / bw)) / 2, art, art * (bh / bw));
    png[s] = o.toDataURL("image/png").split(",")[1];
  }
  return { bbox: [minX, minY, maxX, maxY], png };
}, { data, mime, SIZES });
await browser.close();

const png = {};
for (const s of SIZES) { png[s] = Buffer.from(result.png[s], "base64"); writeFileSync(join(out, `icon-${s}.png`), png[s]); }
console.log("art box:", result.bbox.join(","));

// .icns: a magic word, a big-endian length, one typed chunk per size holding a whole PNG.
const CHUNKS = [["icp4", 16], ["icp5", 32], ["icp6", 64], ["ic07", 128], ["ic08", 256], ["ic09", 512], ["ic10", 1024], ["ic11", 32], ["ic12", 64], ["ic13", 256], ["ic14", 512]];
const parts = CHUNKS.map(([type, size]) => {
  const head = Buffer.alloc(8);
  head.write(type, 0, "ascii");
  head.writeUInt32BE(8 + png[size].length, 4);
  return Buffer.concat([head, png[size]]);
});
const total = 8 + parts.reduce((n, b) => n + b.length, 0);
const top = Buffer.alloc(8);
top.write("icns", 0, "ascii");
top.writeUInt32BE(total, 4);
writeFileSync(join(out, "AppIcon.icns"), Buffer.concat([top, ...parts]));
console.log("wrote", join(out, "AppIcon.icns"));
