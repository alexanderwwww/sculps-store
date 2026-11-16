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
if (want("bot")) { const p = await page({ width: 1440, height: 1480 }); await p.goto(URL); await wait(p, 7000); await p.click("details.dept >> nth=0"); await wait(p, 400); await p.screenshot({ timeout: 240000, path: out + "/01-bot-desktop.png" }); await p.setViewportSize({ width: 1440, height: 900 });
  await p.keyboard.press("Escape"); await wait(p, 300); await p.click("nav [data-t=inv]"); await wait(p, 300); await p.screenshot({ timeout: 240000, path: out + "/02-inventory.png" });
  await p.click("nav [data-t=new]"); await wait(p, 200); await p.fill("input[name=name]", "Golden Hawk 2"); await p.fill("input[name=job]", "phi pullbacks"); await p.click("button[type=submit]"); await wait(p, 600); await p.screenshot({ timeout: 240000, path: out + "/03-bot-creator.png" });
  await p.click("nav [data-t=db]"); await wait(p, 200); await p.click("[data-db=flows]"); await wait(p, 200); await p.screenshot({ timeout: 240000, path: out + "/04-database.png" }); await p.context().close(); }
if (want("phone")) { const p = await page({ width: 390, height: 844 }, true); await p.goto(URL); await wait(p, 1500); await p.screenshot({ timeout: 240000, path: out + "/05-bot-phone.png" }); await p.context().close(); }
// world
if (want("world") || want("wphone")) {
  const p = want("world") ? await page({ width: 1440, height: 900 }) : null;
  if (p) { await p.goto(URL + "?mode=world"); await p.waitForFunction(() => window.__aqWorld, null, { timeout: 120000 }); await wait(p, 5000);
    const fr = await p.evaluate(() => { const f = window.__aqWorld.frameTimes; return { fps: window.__aqWorld.fps, cpuMs: (f.reduce((a, b) => a + b, 0) / f.length).toFixed(1), calls: window.__aqWorld.info().render.calls, tris: window.__aqWorld.info().render.triangles }; }); console.log("perf plaza", JSON.stringify(fr));
    await p.screenshot({ timeout: 240000, path: out + "/10-world-spawn.png" });
    await p.evaluate(() => window.__aqWorld.teleport(6, 40, Math.PI)); await p.keyboard.down("w"); await wait(p, 1200); await p.keyboard.up("w"); await wait(p, 600); await p.screenshot({ timeout: 240000, path: out + "/11-walking-plaza.png" });
    await p.evaluate(() => window.__aqWorld.toggleOverview()); await wait(p, 4000); await p.screenshot({ timeout: 240000, path: out + "/12-overview.png" }); await p.evaluate(() => window.__aqWorld.toggleOverview());
    for (const [id, n] of [["hq", "13-inside-hq"], ["council", "14-inside-council"], ["execution", "15-inside-execution"], ["embassy", "16-inside-embassy"]]) { await p.evaluate((k) => window.__aqWorld.enter(k), id); await wait(p, 2500); await p.screenshot({ timeout: 240000, path: `${out}/${n}.png` }); }
    await p.evaluate(() => window.__aqWorld.leave()); await wait(p, 300);
    for (const [x, z, y, n] of [[-60, -80, 2.4, "17-district-scouts"], [80, 40, -0.8, "18-district-risk"], [-30, 75, 0.3, "19-district-learning"]]) { await p.evaluate(([x, z, y]) => window.__aqWorld.teleport(x, z, y), [x, z, y]); await wait(p, 2000); await p.screenshot({ timeout: 240000, path: `${out}/${n}.png` }); }
    // switch back to bot mode: renderer disposed?
    await p.click(".seg button[data-m=bot]"); await wait(p, 800); console.log("after dispose canvases:", await p.evaluate(() => document.querySelectorAll("canvas").length - document.querySelectorAll("#dash canvas").length), "world hook:", await p.evaluate(() => !!window.__aqWorld));
    await p.context().close(); }
  if (want("wphone")) { const q = await page({ width: 390, height: 844 }, true); await q.goto(URL + "?mode=world"); await q.waitForFunction(() => window.__aqWorld, null, { timeout: 120000 }); await wait(q, 4000); await q.screenshot({ timeout: 240000, path: out + "/20-world-phone.png" }); await q.context().close(); }
}
console.log("console errors:", errors.length); for (const e of errors.slice(0, 20)) console.log("  ", e);
await b.close();
