// Dev loop: screenshots of the SYMBIOTE screen at 1440 and 390 wide. node aq/dev/shoot-sym.mjs <outdir> (dev server on :8787)
import { createRequire } from "node:module"; const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
import { mkdirSync } from "node:fs";
const out = process.argv[2] || "/tmp/symshots", URL = process.env.URL || "http://localhost:8787/aq"; mkdirSync(out, { recursive: true });
const errors = [], b = await chromium.launch();
for (const [w, h, mobile] of [[1440, 1000, false], [390, 844, true]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile }), p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }); p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await p.goto(URL); await p.waitForTimeout(9000);
  console.log(w, "overflow px:", await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  const box = async (sel) => p.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; }, sel);
  await p.screenshot({ timeout: 240000, fullPage: true, animations: "disabled", path: `${out}/full-${w}.png` }).catch(() => {});
  await p.screenshot({ timeout: 240000, fullPage: true, clip: await box("#sym"), path: `${out}/sym-${w}.png` });
  if (w === 1440) { await p.click("#sym .cnt", { force: true }); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/sources-${w}.png` }); }
  await ctx.close();
}
console.log("console errors:", errors.length); for (const e of errors.slice(0, 10)) console.log("  ", e);
await b.close();
