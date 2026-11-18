// Dev loop: drives the built page in headless Chromium and saves screenshots. node aq/dev/shoot.mjs <outdir> [dpr] [only]
import { createRequire } from "node:module"; const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const out = process.argv[2] || "/tmp/aqshots", dpr = Number(process.argv[3] || 1), only = process.argv[4] || "";
const URL = process.env.URL || "http://localhost:8787/aq";
import { mkdirSync } from "node:fs"; mkdirSync(out, { recursive: true });
const errors = [];
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
async function page(vp, mobile = false) { const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile }); const p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }); p.on("pageerror", (e) => errors.push("pageerror: " + e.message)); return p; }
const want = (n) => !only || only.split(",").includes(n);
const wait = (p, ms) => p.waitForTimeout(ms);
// bot mode desktop + phone
if (want("bot")) { const p = await page({ width: 1440, height: 1480 }); await p.goto(URL); await wait(p, Number(process.env.WAIT || 7000)); console.log("reactor", JSON.stringify(await p.evaluate(() => window.__aq.reactorInfo && window.__aq.reactorInfo()))); await p.screenshot({ timeout: 240000, path: out + "/01-bot-desktop.png" }); { const bb = await p.evaluate(() => { const r = document.querySelector(".reactor").getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; }); await p.screenshot({ path: out + "/01-reactor.png", clip: bb }); } await p.setViewportSize({ width: 1440, height: 900 });
  await p.keyboard.press("Escape"); await wait(p, 300); await p.click("nav [data-t=inv]"); await wait(p, 300); await p.screenshot({ timeout: 240000, path: out + "/02-inventory.png" });
  await p.click("nav [data-t=new]"); await wait(p, 200); await p.fill("input[name=name]", "Golden Hawk 2"); await p.fill("input[name=job]", "phi pullbacks"); await p.click("button[type=submit]"); await wait(p, 600); await p.screenshot({ timeout: 240000, path: out + "/03-bot-creator.png" });
  await p.click("nav [data-t=db]"); await wait(p, 200); await p.click("[data-db=flows]"); await wait(p, 200); await p.screenshot({ timeout: 240000, path: out + "/04-database.png" }); await p.context().close(); }
if (want("phone")) { const p = await page({ width: 390, height: 844 }, true); await p.goto(URL); await wait(p, Number(process.env.WAIT || 7000)); console.log("phone overflow px:", await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)); await p.screenshot({ timeout: 240000, path: out + "/05-bot-phone.png" }); await p.screenshot({ timeout: 240000, fullPage: true, path: out + "/05-bot-phone-full.png" }); await p.context().close(); }
console.log("console errors:", errors.length); for (const e of errors.slice(0, 20)) console.log("  ", e);
await b.close();
