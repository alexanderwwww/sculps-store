/*
 * The task panel (src/panel.js + src/agent/host.mjs) in a real Chromium,
 * reached over CDP like his Chrome: what the panel must never let happen.
 *
 *   - a wrong token, a page script, or an iframe cannot talk to ultracursor;
 *   - keys typed into the panel never reach the page's own listeners;
 *   - the agent's view of the page (ai snapshot) never contains the panel;
 *   - nothing is drawn on sign-in pages, and it comes back after them;
 *   - a page-side click on the panel's host does nothing;
 *   - screenshots of each mode over a white and a dark page, saved to
 *     test/shots/panel-*.png to be looked at.
 *
 *   TMPDIR=/tmp node test/panel.test.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHost } from "../src/agent/host.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(path.resolve(HERE, "../../../node_modules/playwright-core"));
const CHROME = process.env.ULTRA_TEST_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = path.join(HERE, "shots");
const KILL = setTimeout(() => { console.log("FAIL  panel test timed out"); process.exit(1); }, 180000);
let failed = 0, passed = 0;
const check = (name, cond, detail) => {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}${detail === undefined ? "" : `  -> ${JSON.stringify(detail).slice(0, 400)}`}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(100); } return null; };
// The bar slides in when it appears: rects count once two reads 350 ms apart agree.
const steady = (fn, ms = 8000) => until(async () => { const a = fn(); if (!a) return null; await sleep(350); const b = fn(); return b && JSON.stringify(a) === JSON.stringify(b) ? b : null; }, ms);

const page_ = (dark, extra = "") => `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body style="margin:0;font:16px Helvetica,Arial,sans-serif;background:${dark ? "#111" : "#fff"};color:${dark ? "#bbb" : "#333"}">
<h1>Shop page</h1><p>${"Plain words on the page. ".repeat(120)}</p>
<script>window.keys=[];document.addEventListener("keydown",e=>keys.push(e.key),true);window.addEventListener("keyup",e=>keys.push(e.key));</script>${extra}</body></html>`;
const srv = http.createServer((q, r) => {
  r.writeHead(200, { "content-type": "text/html" });
  if (q.url.startsWith("/frame")) return r.end(`<html><body><script>window.parent.__ucAgent && 0;</script></body></html>`);
  if (q.url.startsWith("/withframe")) return r.end(page_(false, `<iframe src="/frame" id="f"></iframe>`));
  r.end(page_(q.url.includes("dark")));
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const U = `http://127.0.0.1:${srv.address().port}`;
const cdp = 9300 + Math.floor(Math.random() * 300);
const dir = fs.mkdtempSync("/tmp/uc-panel-");
const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--no-proxy-server", `--remote-debugging-port=${cdp}`, `--user-data-dir=${dir}`, "--window-size=1280,800", "--hide-scrollbars", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "about:blank"], { stdio: "ignore" });
await until(async () => { try { return (await fetch(`http://127.0.0.1:${cdp}/json/version`)).ok; } catch { return false; } }, 20000);
const b = await chromium.connectOverCDP(`http://127.0.0.1:${cdp}`);
const ctx = b.contexts()[0];
const page = ctx.pages()[0] || await ctx.newPage();

let state = { build: "2", hasKey: false, mode: "needkey", status: "", step: null, usd: null, task: null, card: null };
const msgs = [];
const host = createHost({ build: "2", getState: () => state, onMessage: (m) => { msgs.push(m); if (m.type === "setKey") state = { ...state, hasKey: true, mode: "idle" }; return { ok: true }; } });
await host.install(ctx);

await page.goto(`${U}/`);
const L = await steady(() => { const l = host.layout(page); return l && l.keyInput ? l : null; });
check("the panel mounts and reports where its controls are", Boolean(L), host.layout(page));
check("it found the binding before any page script ran", (await page.evaluate(() => window.__ucPanel && window.__ucPanel.brief().bound)) === "init");
await page.screenshot({ path: path.join(SHOTS, "panel-needkey-white.png") });

// Keys into the panel never reach the page.
await page.mouse.click(L.keyInput.x + 20, L.keyInput.y + L.keyInput.h / 2);
await page.keyboard.type("sk-ant-api03-panel-test-0123456789");
await page.mouse.click(L.keySave.x + L.keySave.w / 2, L.keySave.y + L.keySave.h / 2);
await until(() => msgs.find((m) => m.type === "setKey"), 5000);
check("the key typed into the panel reaches ultracursor exactly", msgs.some((m) => m.type === "setKey" && m.key === "sk-ant-api03-panel-test-0123456789"), msgs);
check("the page's own key listeners saw none of it", (await page.evaluate(() => window.keys.length)) === 0, await page.evaluate(() => window.keys.slice(0, 10)));
check("the key is not shown on the page or in the panel's API", !(await page.evaluate(() => document.documentElement.outerHTML + JSON.stringify(window.__ucPanel))).includes("panel-test"));

// Nobody else can talk to ultracursor.
const wrong = await page.evaluate(async () => { try { return await window.__ucAgent("guess", JSON.stringify({ type: "poll" })); } catch (e) { return String(e); } });
check("a page script with a wrong token is refused", wrong && wrong.error === "bad token", wrong);
const tokenVisible = await page.evaluate((t) => { const seen = JSON.stringify(Object.keys(window)) + document.documentElement.outerHTML; return seen.includes(t); }, host.token);
check("the token is nowhere on window or in the document", !tokenVisible);
await page.goto(`${U}/withframe`);
await sleep(800);
const fromFrame = await page.frames()[1].evaluate(async (t) => { try { return await window.__ucAgent(t, JSON.stringify({ type: "poll" })); } catch (e) { return String(e); } }, host.token);
check("even with the right token, a call from an iframe is refused", fromFrame && fromFrame.ok === false, fromFrame);

// The agent never sees the panel.
const snap = await page.ariaSnapshot({ mode: "ai" });
check("the agent's snapshot of the page has no trace of the panel", !/ultracursor|Tell ultracursor|Approve|Paste/i.test(snap));

// A card, clicked by a page script vs by the mouse.
state = { ...state, mode: "card", card: { id: "c1", kind: "approval", title: "Approve? Publish", lines: ['Button: "Post listing"', "On: shop.example/sell/", "Why: post the listing", "Description: Chrome Hearts cross tee, black, worn twice", "Price: 240", "Size: M"], choices: [{ id: "approve", label: "Approve" }, { id: "skip", label: "Skip" }, { id: "stop", label: "Stop" }] } };
await page.goto(`${U}/`);
const C = await steady(() => { const l = host.layout(page); return l && l.choices && l.choices.approve && l.shownCard === "c1" ? l : null; });
await page.evaluate(() => { const h = document.querySelector("ultracursor-panel") || document.documentElement.lastElementChild; h && h.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true })); h && h.click && h.click(); });
await sleep(900);
check("a page-side click on the panel decides nothing", !msgs.some((m) => m.type === "decide"));
await page.screenshot({ path: path.join(SHOTS, "panel-card-white.png") });
await page.mouse.click(C.choices.approve.x + C.choices.approve.w / 2, C.choices.approve.y + C.choices.approve.h / 2);
await until(() => msgs.find((m) => m.type === "decide"), 4000);
check("a real click on Approve decides that card", msgs.some((m) => m.type === "decide" && m.card === "c1" && m.choice === "approve"), msgs.filter((m) => m.type === "decide"));

// Sign-in pages: nothing drawn; back afterwards.
await page.goto(`${U}/login/`);
await sleep(900);
check("nothing drawn on a /login page", !(await page.evaluate(() => { const p = window.__ucPanel; return p && p.brief().mounted; })));
await page.goto(`${U}/dark`);
state = { ...state, mode: "running", card: null, status: "Typing the description", step: { n: 7, max: 80 }, usd: { spent: 0.12, cap: 2 }, task: { id: "t", text: "list the tee" } };
const R = await until(() => { const l = host.layout(page); return l && l.pause ? l : null; }, 8000);
check("back on the next page, showing the running task with Pause and Stop", Boolean(R && R.stop));
await page.screenshot({ path: path.join(SHOTS, "panel-running-dark.png") });
state = { ...state, mode: "idle", task: null, step: null, usd: null, status: "" };
await sleep(900);
await page.screenshot({ path: path.join(SHOTS, "panel-idle-dark.png") });

await b.close(); srv.close();
const gone = new Promise((r) => ch.once("exit", r));
ch.kill();
await Promise.race([gone, sleep(3000)]);
try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Chrome's last writes; /tmp is cleaned anyway */ }
clearTimeout(KILL);
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
