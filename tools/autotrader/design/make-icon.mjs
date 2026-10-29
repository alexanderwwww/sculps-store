// The Dock icon for Ultra, drawn in code so it can be redrawn at any size:
//   node make-icon.mjs [outdir]      writes icon.svg, icon-<size>.png, AppIcon.icns
// A near-black glass squircle and the white glass face from the terminal: two pause-bar eyes. No text.
// Alex, 2026-10-29: "use the pause button you had that was like a face."
// Chromium rasterises the SVG; the .icns is written here
// because iconutil does not exist off a Mac.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || here;
mkdirSync(out, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs>
  <radialGradient id="base" cx="50%" cy="36%" r="80%"><stop offset="0" stop-color="#1a1d24"/><stop offset=".55" stop-color="#0a0b0f"/><stop offset="1" stop-color="#030304"/></radialGradient>
  <radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffffff" stop-opacity=".28"/><stop offset=".6" stop-color="#ffffff" stop-opacity=".05"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  <radialGradient id="orb" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#e9edf2"/><stop offset="1" stop-color="#a3acb9"/></radialGradient>
  <radialGradient id="shade" cx="50%" cy="100%" r="70%"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".5"/><stop offset=".4" stop-color="#ffffff" stop-opacity=".06"/><stop offset="1" stop-color="#ffffff" stop-opacity=".18"/></linearGradient>
  <filter id="drop" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="24" stdDeviation="22" flood-color="#000" flood-opacity=".8"/></filter>
  <clipPath id="sq"><rect x="100" y="100" width="824" height="824" rx="186"/></clipPath>
</defs>
<rect x="100" y="100" width="824" height="824" rx="186" fill="url(#base)"/>
<g clip-path="url(#sq)"><circle cx="512" cy="512" r="380" fill="url(#halo)"/><ellipse cx="512" cy="140" rx="470" ry="180" fill="#fff" fill-opacity=".05"/></g>
<rect x="104" y="104" width="816" height="816" rx="182" fill="none" stroke="url(#rim)" stroke-width="3.5"/>
<g filter="url(#drop)">
  <circle cx="512" cy="512" r="270" fill="url(#orb)"/>
  <circle cx="512" cy="512" r="270" fill="url(#shade)"/>
  <rect x="432" y="430" width="50" height="150" rx="25" fill="#0b0c10"/>
  <rect x="542" y="430" width="50" height="150" rx="25" fill="#0b0c10"/>
  <ellipse cx="450" cy="352" rx="110" ry="46" fill="#fff" fill-opacity=".75" transform="rotate(-24 450 352)"/>
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
