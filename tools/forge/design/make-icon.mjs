// The Dock icon: the eagle of Zeus, all gold, no lightning, no text.
// Drawn from code so it can be redrawn at any size: node make-icon.mjs <outdir>
// writes icon.svg, icon-1024.png (and the other sizes) and AppIcon.icns.
// Needs Playwright's Chromium only to rasterise the SVG.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const out = process.argv[2] || ".";
mkdirSync(out, { recursive: true });

const deg = (a) => (a * Math.PI) / 180;
const f = (n) => n.toFixed(1);
let uid = 0;
const defs = [];

// One feather: a tapered leaf from root (x,y) along angle a (degrees, y down),
// length L, widest w. `flip` bends it the other way so a wing curves.
function feather(x, y, a, L, w, tone, bend = 0) {
  const dx = Math.cos(deg(a)), dy = Math.sin(deg(a));
  const px = -dy, py = dx; // perpendicular
  const tip = [x + dx * L + px * bend, y + dy * L + py * bend];
  const mid = [x + dx * L * 0.58 + px * bend * 0.4, y + dy * L * 0.58 + py * bend * 0.4];
  const l1 = [mid[0] + px * w, mid[1] + py * w];
  const r1 = [mid[0] - px * w * 0.92, mid[1] - py * w * 0.92];
  const rootL = [x + px * w * 0.22, y + py * w * 0.22];
  const rootR = [x - px * w * 0.22, y - py * w * 0.22];
  const id = `g${uid++}`;
  const g0 = [x, y], g1 = tip;
  defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(g0[0])}" y1="${f(g0[1])}" x2="${f(g1[0])}" y2="${f(g1[1])}">
    <stop offset="0" stop-color="${tone[0]}"/><stop offset=".55" stop-color="${tone[1]}"/><stop offset="1" stop-color="${tone[2]}"/></linearGradient>`);
  const d = `M${f(rootL[0])},${f(rootL[1])} Q${f(l1[0])},${f(l1[1])} ${f(tip[0])},${f(tip[1])} Q${f(r1[0])},${f(r1[1])} ${f(rootR[0])},${f(rootR[1])} Z`;
  // The rachis: a thin dark line down the middle, and a light edge on the lit side.
  const rach = `M${f(x)},${f(y)} L${f(x + dx * L * 0.96 + px * bend * 0.9)},${f(y + dy * L * 0.96 + py * bend * 0.9)}`;
  return `<path d="${d}" fill="url(#${id})" stroke="#4a2c06" stroke-opacity=".55" stroke-width="2.2" stroke-linejoin="round"/>` +
         `<path d="${rach}" stroke="#5a3607" stroke-opacity=".45" stroke-width="2" fill="none"/>` +
         `<path d="M${f(l1[0] * 0.5 + rootL[0] * 0.5)},${f(l1[1] * 0.5 + rootL[1] * 0.5)} Q${f(l1[0] * .75 + tip[0] * .25)},${f(l1[1] * .75 + tip[1] * .25)} ${f(tip[0])},${f(tip[1])}" stroke="#fff3c4" stroke-opacity=".55" stroke-width="2.2" fill="none"/>`;
}

const GOLD_LIGHT = ["#ffeaa0", "#f2c85a", "#b9812a"];
const GOLD_MID = ["#f7d77a", "#dba93c", "#8f5f18"];
const GOLD_DEEP = ["#e9bf55", "#c18a28", "#74480f"];

function wing(side) {
  // side: -1 left, +1 right. The wing is drawn for the left and mirrored by sign.
  const sx = 512 + side * 70, sy = 520; // shoulder
  const A = (deg0) => (side < 0 ? deg0 : 180 - deg0);
  let s = "";
  // Back row first: long primaries, fanning up and out.
  const prim = [200, 209, 218, 227, 236, 245, 254];
  prim.forEach((a, i) => {
    const L = 372 - Math.abs(i - 1.5) * 18 - (i === 6 ? 70 : 0);
    s += feather(sx, sy - i * 4, A(a), L, 40, GOLD_DEEP, side * 16);
  });
  // Secondaries: shorter, lower and fuller.
  [168, 178, 188, 198, 208, 218, 228].forEach((a, i) => {
    s += feather(sx - side * 8, sy + 18 - i * 3, A(a), 270 - i * 7, 40, GOLD_MID, side * 12);
  });
  // Coverts: the small overlapping row at the shoulder.
  [150, 164, 178, 192, 206, 220, 234, 248].forEach((a, i) => {
    s += feather(sx - side * 14, sy + 6 + (i % 2) * 6, A(a), 160 - Math.abs(i - 3.5) * 9, 36, GOLD_LIGHT, side * 7);
  });
  return s;
}

function tail() {
  let s = "";
  [74, 84, 94, 104, 114].forEach((a, i) => {
    s += feather(512, 700, a, 190 - Math.abs(i - 2) * 14, 30, GOLD_DEEP, (i - 2) * 6);
  });
  return s;
}

const body = `
  <path d="M512,392 C462,420 440,520 446,620 C452,700 486,752 512,790 C538,752 572,700 578,620 C584,520 562,420 512,392 Z" fill="url(#body)" stroke="#4a2c06" stroke-opacity=".55" stroke-width="2.5"/>
  ${[0, 1, 2, 3, 4, 5, 6].map((r) => {
    const y = 470 + r * 44;
    return [-1, 0, 1].map((c) => `<path d="M${f(512 + c * 34 - 18)},${y} Q${f(512 + c * 34)},${y + 34} ${f(512 + c * 34 + 18)},${y}" fill="none" stroke="#6a4108" stroke-opacity=".38" stroke-width="2.6" stroke-linecap="round"/>`).join("");
  }).join("")}`;

// Head in profile, looking right: a heavy brow, a big hooked beak, a hard eye,
// and a ruff of pointed neck feathers. Built to read as an eagle at 32 px.
const ruff = [58, 70, 82, 94, 106, 118, 130].map((a, i) => feather(512 + (i - 3) * 20, 420, a, 120 - Math.abs(i - 3) * 8, 26, GOLD_LIGHT, (i - 3) * 3)).join("");
const head = `
  <path d="M452,430 C440,360 462,296 520,262 C566,238 618,252 640,288 C646,298 648,306 650,314 C676,322 704,350 708,386 C708,402 698,410 690,404 C676,394 664,382 654,376 L626,378 C622,396 610,416 588,436 C556,462 478,470 452,430 Z" fill="url(#head)" stroke="#4a2c06" stroke-opacity=".6" stroke-width="2.8" stroke-linejoin="round"/>
  <path d="M650,314 C676,322 704,350 708,386 C708,402 698,410 690,404 C676,394 664,382 654,376 L640,372 C646,352 650,334 650,314 Z" fill="url(#beak)" stroke="#4a2c06" stroke-opacity=".65" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M654,376 L626,378" stroke="#3a2205" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>
  <path d="M672,340 C686,350 694,366 694,380" fill="none" stroke="#fff0b8" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="664" cy="352" rx="4" ry="6" fill="#3a2205" fill-opacity=".8"/>
  <path d="M528,306 C566,288 614,294 644,324 C620,322 592,326 566,338 C548,326 536,316 528,306 Z" fill="#8a5a14" fill-opacity=".92" stroke="#3a2205" stroke-opacity=".7" stroke-width="2"/>
  <circle cx="602" cy="338" r="15" fill="#fff1b8"/><circle cx="602" cy="338" r="15" fill="none" stroke="#5a3607" stroke-width="2.4"/><circle cx="604" cy="339" r="9" fill="#1d1004"/><circle cx="608" cy="334" r="3.6" fill="#fff6d0"/>
  ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${470 + i * 20},${352 + i * 13} q12,20 24,6" fill="none" stroke="#6a4108" stroke-opacity=".34" stroke-width="2.6" stroke-linecap="round"/>`).join("")}`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs>
  <radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#2b2417"/><stop offset=".55" stop-color="#14120d"/><stop offset="1" stop-color="#07070a"/></radialGradient>
  <radialGradient id="glow" cx="50%" cy="46%" r="46%"><stop offset="0" stop-color="#e6b84a" stop-opacity=".42"/><stop offset="1" stop-color="#e6b84a" stop-opacity="0"/></radialGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b8" stop-opacity=".55"/><stop offset=".5" stop-color="#e6b84a" stop-opacity=".1"/><stop offset="1" stop-color="#8a5a14" stop-opacity=".45"/></linearGradient>
  <linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a0"/><stop offset=".5" stop-color="#e2b13e"/><stop offset="1" stop-color="#8c5a14"/></linearGradient>
  <linearGradient id="head" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6cf"/><stop offset=".5" stop-color="#f3cf6a"/><stop offset="1" stop-color="#b88226"/></linearGradient>
  <linearGradient id="beak" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4c646"/><stop offset="1" stop-color="#9a6416"/></linearGradient>
  ${"__DEFS__"}
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity=".55"/></filter>
</defs>
<rect x="100" y="100" width="824" height="824" rx="186" fill="url(#bg)"/>
<rect x="100" y="100" width="824" height="824" rx="186" fill="url(#glow)"/>
<rect x="104" y="104" width="816" height="816" rx="182" fill="none" stroke="url(#rim)" stroke-width="3"/>
<g filter="url(#shadow)" transform="translate(0,6)">
  ${"__WINGS__"}
  ${"__TAIL__"}
  ${body}
  ${ruff}
  ${head}
</g>
</svg>`;

const wings = wing(-1) + wing(1);
const tailS = tail();
const final = svg.replace("__DEFS__", defs.join("\n")).replace("__WINGS__", wings).replace("__TAIL__", tailS);
writeFileSync(join(out, "icon.svg"), final);

// ------------------------------------------------------------ rasterise
const require = createRequire(import.meta.url);
let pw;
for (const p of ["playwright", "playwright-core", "../../../node_modules/playwright", "../../../node_modules/playwright-core"]) {
  try { pw = require(p); break; } catch {}
}
if (!pw) { console.error("no playwright to rasterise with"); process.exit(1); }
const exe = process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium";
const browser = await pw.chromium.launch({ executablePath: exe });
const SIZES = [16, 32, 64, 128, 256, 512, 1024];
const png = {};
for (const s of SIZES) {
  const page = await browser.newPage({ viewport: { width: s, height: s }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(final).toString("base64")}" width="${s}" height="${s}" style="display:block"></body></html>`);
  png[s] = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: s, height: s } });
  writeFileSync(join(out, `icon-${s}.png`), png[s]);
  await page.close();
}
await browser.close();

// ------------------------------------------------------------ .icns
// An .icns is a magic word, a big-endian length, and one typed chunk per size,
// each holding a whole PNG. (iconutil does not exist off a Mac.)
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
