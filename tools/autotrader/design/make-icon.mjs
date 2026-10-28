// The Dock icon for Ultra, drawn in code so it can be redrawn at any size:
//   node make-icon.mjs [outdir]      writes icon.svg, icon-<size>.png, AppIcon.icns
// A near-black glass squircle, a cyan glow, and a glass cursor arrow with a bright rim. No text.
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
  <radialGradient id="base" cx="50%" cy="36%" r="80%"><stop offset="0" stop-color="#16222b"/><stop offset=".55" stop-color="#080b0f"/><stop offset="1" stop-color="#020304"/></radialGradient>
  <radialGradient id="signal" cx="50%" cy="52%" r="44%"><stop offset="0" stop-color="#7ee7ff" stop-opacity=".42"/><stop offset=".55" stop-color="#3aa6c9" stop-opacity=".12"/><stop offset="1" stop-color="#3aa6c9" stop-opacity="0"/></radialGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".55"/><stop offset=".4" stop-color="#ffffff" stop-opacity=".06"/><stop offset="1" stop-color="#7ee7ff" stop-opacity=".30"/></linearGradient>
  <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9fbff"/><stop offset=".4" stop-color="#9fdcee"/><stop offset="1" stop-color="#3b7f93"/></linearGradient>
  <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#bfeaf5"/><stop offset="1" stop-color="#5aa9bf"/></linearGradient>
  <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <filter id="blur24" x="-40%" y="-60%" width="180%" height="220%"><feGaussianBlur stdDeviation="26"/></filter>
  <filter id="drop" x="-30%" y="-40%" width="160%" height="190%"><feDropShadow dx="0" dy="22" stdDeviation="20" flood-color="#000" flood-opacity=".75"/></filter>
  <clipPath id="sq"><rect x="100" y="100" width="824" height="824" rx="186"/></clipPath>
  <clipPath id="arrowclip"><path d="ARROW" stroke-linejoin="round"/></clipPath>
</defs>
<rect x="100" y="100" width="824" height="824" rx="186" fill="url(#base)"/>
<g clip-path="url(#sq)"><rect x="100" y="100" width="824" height="824" fill="url(#signal)"/><ellipse cx="512" cy="140" rx="470" ry="180" fill="#fff" fill-opacity=".05"/></g>
<rect x="104" y="104" width="816" height="816" rx="182" fill="none" stroke="url(#rim)" stroke-width="3.5"/>
<g transform="translate(-28,-4)" filter="url(#drop)">
  <path d="ARROW" fill="#7ee7ff" fill-opacity=".5" filter="url(#blur24)"/>
  <path d="ARROW" fill="url(#body)" stroke="url(#edge)" stroke-width="10" stroke-linejoin="round"/>
  <g clip-path="url(#arrowclip)"><ellipse cx="500" cy="420" rx="260" ry="80" fill="url(#gloss)" fill-opacity=".8"/></g>
</g>
</svg>`.replaceAll("ARROW", "M382,300 L382,716 L490,612 L568,764 L650,724 L572,576 L722,570 Z");

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
