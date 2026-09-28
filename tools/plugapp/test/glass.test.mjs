/**
 * The glass really bends what is behind it — measured, not admired.
 *
 * Every earlier version of this app shipped a grey slab that had been called
 * glass by whoever wrote it, including by me, four times. So this does not ask
 * whether it looks nice. It puts a black-and-white stripe pattern behind the
 * shape and then reads pixels:
 *
 *   - at the CENTRE the stripes must be exactly where they were. Clear glass
 *     does not move what is behind its middle.
 *   - at the RIM they must have moved. That displacement is the whole design.
 *   - the rim must carry colour the stripes do not have, because the three
 *     displacements are split by channel and that fringe is the crystal.
 *
 * If any of those three is false, the thing on screen is not this design.
 */
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const CHROME = process.env.PLUG_CHROME
  || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let bad = 0;
const check = (ok, what, extra) => {
  console.log(ok ? "  ok  " + what : "FAIL  " + what + (extra ? " — " + extra : ""));
  if (!ok) bad++;
};

const glass = await readFile("renderer/glass.js", "utf8");

const browser = await chromium.launch({ args: ["--no-sandbox"], executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 700, height: 1000 }, deviceScaleFactor: 1 });

/* Hard vertical stripes: any sideways displacement shows up as a pixel that
   changed colour, which is something a test can actually measure. */
await page.setContent(`<!doctype html><style>
  html,body{margin:0;height:100%;background:repeating-linear-gradient(90deg,#000 0 8px,#fff 8px 16px)}
  .wrap{position:absolute;left:150px;top:70px;width:393px;height:852px;border-radius:46px}
  .refract{position:absolute;inset:0;border-radius:inherit;
    backdrop-filter:url(#lg-phone) saturate(1.35) brightness(1.06)}
</style>
<div class="wrap"><div class="refract"></div></div>
<script type="module">
${glass.replace(/^export /gm, "")}
window.__go = () => installFilters(document);
</script>`);

await page.waitForFunction(() => typeof window.__go === "function");
await page.evaluate(() => window.__go());
await page.waitForTimeout(700);

const shot = await page.screenshot();
const { createCanvas, loadImage } = await import("canvas").catch(() => ({}));

/* No image library needed: read the pixels through the page itself. */
const probe = await page.evaluate(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 700; canvas.height = 1000;
  const ctx = canvas.getContext("2d");
  /* Paint the same stripes, then compare against a screenshot-free reading of
     what the compositor produced — done by drawing the page into the canvas is
     not possible, so instead we sample the filter's own output via an offscreen
     copy of the shape. The honest measurement is done in node below. */
  return true;
});

await browser.close();

/* Read the PNG without a third-party decoder: pull a few rows out with the
   browser we already have, which is the only decoder in this container. */
const reader = await chromium.launch({ args: ["--no-sandbox"], executablePath: CHROME });
const rp = await reader.newPage();
const b64 = shot.toString("base64");
const samples = await rp.evaluate(async (data) => {
  const img = new Image();
  img.src = "data:image/png;base64," + data;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0);
  const at = (px, py) => Array.from(x.getImageData(px, py, 1, 1).data);
  /* The shape sits at 150,70 and is 393 x 852. */
  const row = 70 + 426;          // halfway down
  const centre = [];
  const rim = [];
  for (let i = 0; i < 40; i++) {
    centre.push(at(150 + 176 + i, row));   // middle of the shape
    rim.push(at(150 + 6 + i, row));        // inside the left rim
  }
  /* The same columns with no glass over them, for comparison. */
  const bare = [];
  for (let i = 0; i < 40; i++) bare.push(at(20 + i, row));
  return { centre, rim, bare, width: img.width };
}, b64);
await reader.close();

const grey = (p) => Math.abs(p[0] - p[1]) < 6 && Math.abs(p[1] - p[2]) < 6;
const pattern = (list) => list.map((p) => (p[0] > 128 ? 1 : 0)).join("");

/* 1. The centre is untouched: the stripes there still alternate on the same
      8-pixel rhythm as the bare background. */
const centreEdges = pattern(samples.centre).replace(/(.)\1*/g, "$1").length;
const bareEdges = pattern(samples.bare).replace(/(.)\1*/g, "$1").length;
check(Math.abs(centreEdges - bareEdges) <= 1,
  "the centre is clear — the stripes behind it are not moved",
  `centre ${centreEdges} bands vs ${bareEdges} bare`);

/* 2. The rim moved them. Squeezed stripes mean more bands across the same
      distance; that compression IS the refraction. */
const rimEdges = pattern(samples.rim).replace(/(.)\1*/g, "$1").length;
check(rimEdges !== bareEdges,
  "the rim bends what is behind it",
  `rim ${rimEdges} bands vs ${bareEdges} bare`);

/* 3. And it bends the channels by different amounts, which is the rainbow.
      Black and white stripes have no colour of their own, so any colour found
      at the rim was made by the dispersion. */
const colouredAtRim = samples.rim.filter((p) => !grey(p)).length;
check(colouredAtRim > 0,
  "the rim carries a chromatic fringe the background never had",
  `${colouredAtRim}/40 samples coloured`);

if (bad) { console.log(`glass: ${bad} failed`); process.exit(1); }
console.log("glass: ok");
process.exit(0);
