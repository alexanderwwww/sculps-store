// Dev loop for the GROK'S WORK section: node aq/dev/shoot-grok.mjs <outdir> [dpr]   (server: node aq/dev/server.mjs)
// Saves the desktop page, the section alone, the phone page and every phone tab; prints console errors and phone overflow.
// Headless Chromium paints the reactor canvas in software, so frames are slow: clicks go through the DOM and shots use clips
// (Playwright's "wait until stable" needs animation frames and times out here). CHAT=1 also sends a message and copies a contract.
import { createRequire } from "node:module"; const require = createRequire(import.meta.url);
import { mkdirSync } from "node:fs";
const { chromium } = require("playwright");
const out = process.argv[2] || "/tmp/aqshots", dpr = Number(process.argv[3] || 1), URL = process.env.URL || "http://localhost:8787/aq", tag = process.env.TAG || "grok", W = Number(process.env.W || 1440), only = process.env.ONLY || "";
mkdirSync(out, { recursive: true });
const errors = [], b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
async function page(vp, mobile = false) { const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile, permissions: ["clipboard-read", "clipboard-write"] }); const p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); }); p.on("pageerror", (e) => errors.push("pageerror: " + e.message)); return p; }
const box = (p, sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: Math.max(0, r.x + scrollX), y: r.y + scrollY, width: Math.min(r.width, innerWidth), height: r.height }; }, sel);
const sect = async (p, path) => p.screenshot({ path, fullPage: true, clip: await box(p, "#d-grok"), timeout: 240000 });
const hit = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(), t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return t === e || e.contains(t); }, sel);
const click = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
if (only !== "phone") { const p = await page({ width: W, height: 1500 }); await p.goto(URL); await p.waitForTimeout(Number(process.env.WAIT || 5000));
  if (!process.env.FAST) await p.screenshot({ path: `${out}/${tag}-desktop.png`, timeout: 240000 });
  if (process.env.REACTOR) await p.screenshot({ path: `${out}/${tag}-reactor.png`, clip: await box(p, ".reactor"), timeout: 240000 });
  await sect(p, `${out}/${tag}-section-desktop.png`);
  console.log("badge:", await p.evaluate(() => [...document.querySelectorAll("#hbadges .hb")].map((e) => e.className + " = " + e.innerText.replace(/\n/g, " ")).join(" ; ")), "| rows:", await p.evaluate(() => document.querySelectorAll("#g-radar .gk-row:not(.hd)").length), "| sparks:", await p.evaluate(() => document.querySelectorAll("#g-radar polyline").length));
  if (process.env.CHAT) { console.log("send button is the hit target:", await hit(p, "#g-chat button")); await p.evaluate(() => { document.querySelector("#g-chat input").value = "Good. Keep the swarm warning on GTA6."; }); await click(p, "#g-chat button"); await p.waitForTimeout(1200); console.log("chat msg at 1.2s:", JSON.stringify(await p.evaluate(() => document.querySelector("#g-chat-m").textContent))); await p.waitForTimeout(3000);
    console.log("chat msg:", JSON.stringify(await p.evaluate(() => document.querySelector("#g-chat-m").textContent)), "| bubbles:", await p.evaluate(() => document.querySelectorAll("#g-room .gk-b").length), "| alex:", await p.evaluate(() => document.querySelectorAll("#g-room .b-alex").length));
    if (await p.evaluate(() => !!document.querySelector("#g-radar [data-copy]"))) { console.log("copy button is the hit target:", await hit(p, "#g-radar [data-copy]")); await click(p, "#g-radar [data-copy]"); await p.waitForTimeout(300); console.log("copied:", await p.evaluate(() => navigator.clipboard.readText().catch((e) => "clipboard: " + e.message))); }
    await sect(p, `${out}/${tag}-section-desktop-chat.png`); }
  await p.context().close(); }
if (only !== "desktop") { const p = await page({ width: 390, height: 844 }, true); await p.goto(URL); await p.waitForTimeout(Number(process.env.WAIT || 5000));
  console.log("phone overflow px:", await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), "| tabs visible:", await p.evaluate(() => getComputedStyle(document.querySelector(".gk-tabs")).display), "| tab hit:", await hit(p, "[data-gt=picks]"));
  await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: `${out}/${tag}-phone-top.png`, timeout: 240000 });
  for (const t of (process.env.TABS || "radar,picks,room,seat,posts").split(",")) { await click(p, `[data-gt=${t}]`); await p.waitForTimeout(250); await sect(p, `${out}/${tag}-phone-${t}.png`); }
  await click(p, "[data-gt=radar]"); await p.evaluate(() => document.getElementById("d-grok").scrollIntoView({ block: "start" })); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/${tag}-section-phone.png`, timeout: 240000 }); await p.context().close(); }
console.log("console errors:", errors.length); for (const e of errors.slice(0, 20)) console.log("  ", e);
await b.close();
