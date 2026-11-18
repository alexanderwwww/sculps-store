// Dev loop: the reactor, the SYMBIOTE screen and the HYMN screen at 1440 and 390 wide. node aq/dev/shoot-j2.mjs <outdir> (dev server on :8787)
import { createRequire } from "node:module"; const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
import { mkdirSync } from "node:fs";
const out = process.argv[2] || "/tmp/j2shots", URL = process.env.URL || "http://localhost:8787/aq"; mkdirSync(out, { recursive: true });
const errors = [], b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const [w, h, mobile] of [[1440, 1000, false], [390, 844, true]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile }), p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }); p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await p.goto(URL); await p.waitForTimeout(8000);
  console.log(w, "overflow px:", await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), "reactor", JSON.stringify(await p.evaluate(() => window.__aq?.reactorInfo?.())));
  const box = async (sel) => p.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; }, sel);
  await p.screenshot({ timeout: 240000, fullPage: true, clip: await box("#d-rx"), path: `${out}/reactor-${w}.png` });
  await p.screenshot({ timeout: 240000, fullPage: true, clip: await box("#tv"), path: `${out}/tv-a-${w}.png` });
  console.log(w, "tv screens:", await p.evaluate(() => [...document.querySelectorAll("#tv>.tv-s")].map((s) => (s.firstElementChild?.id || s.firstElementChild?.className) + (s.classList.contains("on") ? "*" : ""))));
  for (let k = 1; k <= 3; k++) { await p.waitForTimeout(20500); await p.screenshot({ timeout: 240000, fullPage: true, clip: await box("#tv"), path: `${out}/tv-${"bcd"[k - 1]}-${w}.png` }); }
  await p.screenshot({ timeout: 240000, fullPage: true, animations: "disabled", path: `${out}/full-${w}.png` }).catch(() => {});
  await ctx.close();
}
console.log("console errors:", errors.length); for (const e of errors.slice(0, 10)) console.log("  ", e);
await b.close();
