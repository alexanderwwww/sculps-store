// The Dock icon for kcal, drawn in code so it can be redrawn at any size:
//   node make-icon.mjs [outdir]      writes icon.svg, icon-<size>.png, AppIcon.icns
// Dark Knight: a near-black glass squircle, a cold moonlit glow behind, and the
// bat in black glass with a steel rim. No text. Chromium rasterises the SVG; the .icns is written here
// because iconutil does not exist off a Mac.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || here;
mkdirSync(out, { recursive: true });

// Ring geometry: centre (512,512), radius 238, stroke 76. Filled 74% from the top, clockwise.
const R = 238;
const C = 2 * Math.PI * R;
const FILL = 0.74;
const arc = (frac) => `${(C * frac).toFixed(1)} ${(C * (1 - frac) + 4).toFixed(1)}`;
const sparkle = (x, y, s, o) => `<path d="M${x},${y - s} Q${x + s * 0.12},${y - s * 0.12} ${x + s},${y} Q${x + s * 0.12},${y + s * 0.12} ${x},${y + s} Q${x - s * 0.12},${y + s * 0.12} ${x - s},${y} Q${x - s * 0.12},${y - s * 0.12} ${x},${y - s} Z" fill="#fff" fill-opacity="${o}"/>`;

// The bat: drawn as the right half, then mirrored about x=512. Points run from the
// notch between the ears, over the ear, along the top of the wing to its tip,
// back under the wing in three scallops, and down to the centre line.
const half = [
  ["M", 512, 452],
  ["L", 536, 334], ["L", 560, 432],                         // ear
  ["C", 624, 418, 732, 392, 816, 322],                      // top of the wing, rising to the tip
  ["C", 794, 392, 774, 426, 760, 472],                      // under the tip, back in
  ["C", 740, 452, 714, 454, 698, 484],                      // first scallop
  ["C", 692, 520, 702, 552, 680, 584],
  ["C", 662, 552, 636, 548, 618, 568],                      // second scallop
  ["C", 614, 600, 622, 626, 602, 658],
  ["C", 580, 626, 548, 614, 512, 646],                      // centre point
];
const d = (pts, mirror) => pts.map(([c, ...n]) => {
  if (c === "M" || c === "L") return `${c}${mirror ? 1024 - n[0] : n[0]},${n[1]}`;
  return `C${[0, 2, 4].map((i) => `${mirror ? 1024 - n[i] : n[i]},${n[i + 1]}`).join(" ")}`;
}).join(" ");
const rev = (pts) => {
  // the left half walks the same path backwards so the outline closes cleanly
  const out = [];
  const seq = [];
  let cur = null;
  for (const [c, ...n] of pts) {
    if (c === "M" || c === "L") { seq.push({ c, to: [n[0], n[1]], from: cur }); cur = [n[0], n[1]]; }
    else { seq.push({ c, to: [n[4], n[5]], c1: [n[0], n[1]], c2: [n[2], n[3]], from: cur }); cur = [n[4], n[5]]; }
  }
  const last = seq[seq.length - 1].to;
  out.push(`L${1024 - last[0]},${last[1]}`);
  for (let i = seq.length - 1; i >= 1; i--) {
    const sgm = seq[i];
    if (sgm.c === "L") out.push(`L${1024 - sgm.from[0]},${sgm.from[1]}`);
    else out.push(`C${1024 - sgm.c2[0]},${sgm.c2[1]} ${1024 - sgm.c1[0]},${sgm.c1[1]} ${1024 - sgm.from[0]},${sgm.from[1]}`);
  }
  return out.join(" ");
};
const bat = `${d(half, false)} ${rev(half)} Z`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs>
  <radialGradient id="base" cx="50%" cy="36%" r="80%"><stop offset="0" stop-color="#1d2024"/><stop offset=".55" stop-color="#0b0c0e"/><stop offset="1" stop-color="#020203"/></radialGradient>
  <radialGradient id="signal" cx="50%" cy="46%" r="42%"><stop offset="0" stop-color="#cfe0f2" stop-opacity=".30"/><stop offset=".55" stop-color="#7f9bb8" stop-opacity=".10"/><stop offset="1" stop-color="#7f9bb8" stop-opacity="0"/></radialGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset=".4" stop-color="#ffffff" stop-opacity=".06"/><stop offset="1" stop-color="#9db4cc" stop-opacity=".30"/></linearGradient>
  <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3f46"/><stop offset=".35" stop-color="#14161a"/><stop offset="1" stop-color="#050506"/></linearGradient>
  <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f8fc"/><stop offset=".5" stop-color="#8e9aa8"/><stop offset="1" stop-color="#3b434d"/></linearGradient>
  <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <filter id="blur24" x="-40%" y="-60%" width="180%" height="220%"><feGaussianBlur stdDeviation="24"/></filter>
  <filter id="blur3" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="drop" x="-30%" y="-40%" width="160%" height="190%"><feDropShadow dx="0" dy="20" stdDeviation="18" flood-color="#000" flood-opacity=".8"/></filter>
  <clipPath id="sq"><rect x="100" y="100" width="824" height="824" rx="186"/></clipPath>
  <clipPath id="batclip"><path d="${bat}"/></clipPath>
</defs>
<rect x="100" y="100" width="824" height="824" rx="186" fill="url(#base)"/>
<g clip-path="url(#sq)">
  <rect x="100" y="100" width="824" height="824" fill="url(#signal)"/>
  <ellipse cx="512" cy="140" rx="470" ry="180" fill="#fff" fill-opacity=".05"/>
</g>
<rect x="104" y="104" width="816" height="816" rx="182" fill="none" stroke="url(#rim)" stroke-width="3.5"/>
<g transform="translate(-41,-18) scale(1.08)">
  <g filter="url(#drop)">
    <path d="${bat}" fill="#9db4cc" fill-opacity=".45" filter="url(#blur24)"/>
    <path d="${bat}" fill="url(#body)" stroke="url(#edge)" stroke-width="6" stroke-linejoin="round"/>
    <g clip-path="url(#batclip)">
      <ellipse cx="512" cy="430" rx="300" ry="60" fill="url(#gloss)" fill-opacity=".8"/>
    </g>
    <path d="${bat}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2" stroke-linejoin="round" transform="translate(0,3)"/>
  </g>
</g>
</svg>`;

writeFileSync(join(out, "icon.svg"), svg);

const require = createRequire(join(here, "..", "..", "..", "package.json"));
let pw;
try { pw = require("playwright"); } catch { pw = require("playwright-core"); }
const exe = process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium";
const browser = await pw.chromium.launch({ executablePath: exe });
const SIZES = [16, 32, 64, 128, 256, 512, 1024];
const png = {};
for (const s of SIZES) {
  const page = await browser.newPage({ viewport: { width: s, height: s }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" width="${s}" height="${s}" style="display:block"></body></html>`);
  await page.waitForTimeout(150);
  png[s] = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: s, height: s } });
  writeFileSync(join(out, `icon-${s}.png`), png[s]);
  await page.close();
}
await browser.close();

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
console.log("icon written to", out);
