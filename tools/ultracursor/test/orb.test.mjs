/*
 * The trader orb and the "got paid" chime, in a real Chromium over CDP with
 * the real panel (src/panel.js), the real host and the real memory folder:
 *   - no orb while the trader is off (ultracursor is also Depop, research ...);
 *   - the orb appears with the trader, shows the memory's KB = bytes on disk,
 *     and grows as the memory grows;
 *   - a profitable exit (paid count rises) chimes once; a loss (no change)
 *     does not; muted does not; trader off does not;
 *   - a real click on the orb toggles mute through the host.
 * Screenshot: test/shots/panel-orb.png.
 *
 *   TMPDIR=/tmp node test/orb.test.mjs
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHost } from "../src/agent/host.mjs";
import { Memory, traderOrb, setTraderMute } from "../src/trader/memory.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(path.resolve(HERE, "../../../node_modules/playwright-core"));
const CHROME = process.env.ULTRA_TEST_CHROMIUM || "/opt/pw-browsers/chromium";
const KILL = setTimeout(() => { console.log("FAIL  orb test timed out"); process.exit(1); }, 120000);
let failed = 0, passed = 0;
const check = (name, cond, detail) => { if (cond) { passed++; console.log(`  ok  ${name}`); } else { failed++; console.log(`FAIL  ${name}${detail === undefined ? "" : `  -> ${JSON.stringify(detail).slice(0, 400)}`}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(100); } return null; };

const memDir = fs.mkdtempSync(path.join(os.tmpdir(), "uc-orb-"));
const mem = new Memory({ dir: memDir });
mem.journal({ addr: "X", decision: "NO", reason: "seed" });
mem.save();

const srv = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(`<!doctype html><html><body style="margin:0;background:#f4f4f4;font:16px Helvetica"><h1>Any page</h1><p>${"Words. ".repeat(200)}</p></body></html>`); });
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const U = `http://127.0.0.1:${srv.address().port}`;
const cdp = 9600 + Math.floor(Math.random() * 300);
const udir = fs.mkdtempSync("/tmp/uc-orb-chrome-");
const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--no-proxy-server", `--remote-debugging-port=${cdp}`, `--user-data-dir=${udir}`, "--window-size=1280,800", "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "about:blank"], { stdio: "ignore" });
await until(async () => { try { return (await fetch(`http://127.0.0.1:${cdp}/json/version`)).ok; } catch { return false; } }, 20000);
const b = await chromium.connectOverCDP(`http://127.0.0.1:${cdp}`);
const ctx = b.contexts()[0];
const page = ctx.pages()[0] || await ctx.newPage();

const msgs = [];
const host = createHost({
  build: "t",
  getState: () => ({ build: "t", hasKey: true, mode: "idle", status: "", step: null, usd: null, task: null, card: null, trader: traderOrb(memDir) }),
  onMessage: (m) => { msgs.push(m); if (m.type === "traderMute") return setTraderMute(m.muted === true, memDir); return { ok: true }; },
});
await host.install(ctx);
await page.goto(`${U}/`);
const lay = () => host.layout(page) || {};
await until(() => lay().bar, 8000);
await sleep(800);
check("trader off: the panel shows, the orb does not", lay().bar && !lay().orb, lay());

// trader on
mem.heartbeat({ paid: 0 });
const o1 = await until(() => lay().orb, 5000);
const want1 = traderOrb(memDir);
check("trader on: the orb appears", Boolean(o1), lay());
check("the orb's KB = the memory's bytes on disk", o1 && o1.kb === want1.kb && want1.kb === Math.round(want1.bytes / 1024), { o1, want1 });
const rOf = (kb) => Math.max(18, Math.min(36, 18 + 2.618 * Math.log(1 + kb))); // build 21: the liquid-glass orb, 18..36 px
check("the orb's radius follows log(KB)", o1 && Math.abs(o1.r - rOf(o1.kb)) < 1e-6 && Math.abs(o1.w - 2 * o1.r) < 1.5, o1);
const cx = o1 ? o1.x + o1.w / 2 : 0;
const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
check("at the bottom centre of the screen", o1 && Math.abs(cx - vp.w / 2) < 2 && Math.abs(vp.h - (o1.y + o1.h) - 16) < 2, { o1, vp });

// memory grows -> the orb grows
for (let i = 0; i < 300; i++) mem.journal({ addr: `T${i}`, decision: "NO", reason: "x".repeat(600), features: { pad: "y".repeat(200) } });
mem.heartbeat({ paid: 0 });
const o2 = await until(async () => { await sleep(700); const l = lay().orb; return l && l.kb > o1.kb ? l : null; }, 6000);
check("memory grew: KB and size grew with it", o2 && o2.kb === traderOrb(memDir).kb && o2.r > o1.r && o2.w > o1.w, { o1, o2, disk: traderOrb(memDir) });
await page.screenshot({ path: path.join(HERE, "shots", "panel-orb.png") });

// the chime: profitable exit only
const chimes = () => (lay().orb || {}).chimes;
const c0 = chimes();
mem.heartbeat({ paid: 1 });
await until(() => chimes() === c0 + 1, 4000);
check("a profitable exit chimes once", chimes() === c0 + 1, { c0, now: chimes() });
await sleep(1500);
mem.heartbeat({ paid: 1 });   // a loss: paid does not move
await sleep(1500);
check("a loss makes no sound", chimes() === c0 + 1, chimes());
mem.heartbeat({ paid: 3 });
await until(() => chimes() === c0 + 2, 4000);
check("two fills in one poll: one chime, not a burst", chimes() === c0 + 2, chimes());

// mute with a real click on the orb
const o3 = lay().orb;
await page.mouse.click(o3.x + o3.w / 2, o3.y + o3.h / 2);
await until(() => msgs.some((m) => m.type === "traderMute"), 4000);
await until(() => lay().orb && lay().orb.muted === true, 4000);
check("a click on the orb mutes (through the host, kept on disk)", lay().orb?.muted === true && fs.existsSync(path.join(memDir, ".mute")), { msgs, orb: lay().orb });
mem.heartbeat({ paid: 4 });
await sleep(1500);
check("muted: a profitable exit makes no sound", chimes() === c0 + 2, chimes());
setTraderMute(false, memDir);

// trader off
mem.off();
await until(() => !lay().orb, 4000);
check("trader off: the orb is gone", !lay().orb, lay());
mem.heartbeat({ paid: 9 });
const back = await until(() => lay().orb, 4000);
check("back on after a restart: no chime for wins it already counted", back && back.chimes === c0 + 2, back);

clearTimeout(KILL);
await b.close().catch(() => {});
ch.kill("SIGKILL");
srv.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
