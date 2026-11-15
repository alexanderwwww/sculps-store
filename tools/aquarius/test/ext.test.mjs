// Drives the real extension in Chromium (persistent context + --load-extension):
//   a fixture page that mimics the claude.ai composer (on 127.0.0.1), a fixture web (on localhost)
//   for his hands, and a stub of the mob mailbox (feed + link) on a third port.
//   node test/ext.test.mjs [shotsDir]
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, "../../../package.json"));
const { chromium } = require("playwright");
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "aq-shots-"));
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, x === undefined ? "" : String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 700)); } };
const KILL = setTimeout(() => { console.log("FAIL  timed out"); process.exit(1); }, 240000);
const until = async (f, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await f(); if (v) return v; await sleep(150); } return null; };
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));

// ---- the claude.ai look-alike: a ProseMirror-style contenteditable and a Send button that only works with text in it
const chat = http.createServer((q, s) => { s.setHeader("content-type", "text/html; charset=utf-8"); s.end(`<!doctype html><html><body style="margin:0;background:#f5f4ee;font:15px sans-serif;height:100vh">
<div id="sent" style="padding:20px"></div>
<div style="position:fixed;left:50%;bottom:24px;transform:translateX(-50%);width:640px;background:#fff;border:1px solid #ddd;border-radius:16px;padding:12px;display:flex;gap:8px">
<div contenteditable="true" role="textbox" class="ProseMirror" aria-label="Write your prompt to Claude" style="flex:1;min-height:24px;outline:none"></div>
<button aria-label="Send message" disabled>↑</button></div>
<script>const box=document.querySelector('[role=textbox]'),btn=document.querySelector('button');
box.addEventListener('input',()=>{btn.disabled=!box.innerText.trim()});
btn.addEventListener('click',()=>{const d=document.createElement('div');d.className='msg';d.textContent=box.innerText;document.getElementById('sent').append(d);box.innerHTML='';btn.disabled=true});</script></body></html>`); });
// ---- the web his hands work in
const orders = [];
const web = http.createServer((q, s) => {
  s.setHeader("content-type", "text/html; charset=utf-8");
  const u = new URL(q.url, "http://x");
  if (u.pathname === "/search") return s.end(`<h1>Search</h1><form action="/results"><input name="q" aria-label="Search" style="width:400px;font-size:18px"><button>Go</button></form>`);
  if (u.pathname === "/results") return s.end(`<h1>Results for ${u.searchParams.get("q")}</h1><p>Aquarius is a constellation of the zodiac.</p>`);
  if (u.pathname === "/login") return s.end(`<label>Password <input type=password id=pw></label>`);
  if (u.pathname === "/checkout") return s.end(`<h1>Your cart</h1><button onclick="fetch('/order',{method:'POST'});document.title='ordered'">Place order</button>`);
  if (u.pathname === "/order") { orders.push(1); return s.end("ok"); }
  s.end("<h1>home</h1>");
});
// ---- the mob mailbox stub (same routes as the worker)
const feed = [], queue = [], results = new Map(), statuses = [];
const mob = http.createServer(async (q, s) => {
  let body = ""; for await (const c of q) body += c;
  s.setHeader("content-type", "application/json"); s.setHeader("access-control-allow-origin", "*");
  const u = new URL(q.url, "http://x");
  if (u.pathname === "/api/aquarius/feed") return s.end(JSON.stringify(u.searchParams.get("key") === "aq-key-test" ? { messages: feed } : { error: 1 }));
  const m = u.pathname.match(/^\/api\/aquarius\/link\/lk-test\/(next|result|status)$/);
  if (m && m[1] === "next") return s.end(JSON.stringify(queue.shift() || null));
  if (m && m[1] === "result") { const b = JSON.parse(body); results.set(b.id, b); return s.end("{}"); }
  if (m && m[1] === "status") { statuses.push(JSON.parse(body)); return s.end("{}"); }
  s.statusCode = 404; s.end("null");
});
const [CP, WP, MP] = [await listen(chat), await listen(web), await listen(mob)];
const CHAT = `http://127.0.0.1:${CP}/`, WEB = `http://localhost:${WP}`;

const EXT = fs.mkdtempSync(path.join(os.tmpdir(), "aq-ext-"));
execFileSync(process.execPath, [path.join(HERE, "../ext/build.mjs"), EXT, "--test", WEB, `http://127.0.0.1:${MP}`], { stdio: "inherit" });
const prof = fs.mkdtempSync(path.join(os.tmpdir(), "aq-prof-"));
const ctx = await chromium.launchPersistentContext(prof, {
  headless: true, viewport: { width: 1100, height: 760 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--autoplay-policy=no-user-gesture-required"],
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 15000 });
ok("the extension loads (its service worker runs)", /background\.js$/.test(sw.url()), sw.url());
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8"));
ok("manifest v3, build 1, content script on claude.ai", manifest.manifest_version === 3 && manifest.version_name === "build 1" && manifest.content_scripts[0].matches.includes("https://claude.ai/*"));

// 1. the genie appears on the chat page
const page = await ctx.newPage();
await page.goto(CHAT);
const host = page.locator("#aquarius-genie");
ok("the genie appears on the chat page", await until(async () => (await host.count()) === 1), await page.content());
const st = async () => { const v = await host.getAttribute("data-aq").catch(() => null); return v ? JSON.parse(v) : {}; };
ok("he reports his state (happy, no suit)", await until(async () => (await st()).face === "happy"), await st());
const hostPos = async () => page.evaluate(() => getComputedStyle(document.getElementById("aquarius-genie")).transform);
const p1 = await hostPos(); await sleep(1500);
ok("he drifts", (await hostPos()) !== p1);
ok("clicks pass through everywhere but his body", await page.evaluate(() => getComputedStyle(document.getElementById("aquarius-genie")).pointerEvents) === "none"
  && await page.locator("#aquarius-genie >> #hit").evaluate((e) => getComputedStyle(e).pointerEvents) === "auto");
await sleep(600);
await page.screenshot({ path: path.join(SHOTS, "chat-genie.png") });

// 2. a bubble message from the feed types out, face from the message
feed.push({ id: 1, text: "🧞 Aquarius online.", face: "smug", suit: null, to_chat: false, at: new Date().toISOString() });
ok("a feed message starts typing (talking face)", await until(async () => { const s = await st(); return s.bubble === "typing" && s.face === "talking"; }, 15000), await st());
await page.screenshot({ path: path.join(SHOTS, "chat-typing.png") });
ok("the whole message is typed, then he wears its face", await until(async () => { const s = await st(); return s.text === "🧞 Aquarius online." && s.bubble === "done" && s.face === "smug"; }, 15000), await st());

// 3. a to_chat message is typed into the composer and sent with the real Send button
feed.push({ id: 2, text: "🧞 Magic Genie here: hourly run.", face: null, suit: null, to_chat: true, at: new Date().toISOString() });
ok("a to_chat message is typed into the composer and sent", await until(async () => (await page.locator("#sent .msg").allInnerTexts()).includes("🧞 Magic Genie here: hourly run."), 15000), await page.locator("#sent").innerText());
ok("the composer is empty again (Send was really pressed)", (await page.locator("[role=textbox]").innerText()).trim() === "");
// he never types over Alex
await page.locator("[role=textbox]").click(); await page.keyboard.type("Alex is typing");
feed.push({ id: 3, text: "second message", to_chat: true, at: new Date().toISOString() });
await sleep(2500);
ok("he waits while Alex has text in the composer", !(await page.locator("#sent .msg").allInnerTexts()).includes("second message") && (await page.locator("[role=textbox]").innerText()).includes("Alex is typing"));
await page.locator("[role=textbox]").evaluate((e) => { e.innerHTML = ""; e.dispatchEvent(new Event("input", { bubbles: true })); });
ok("then sends once the composer is free", await until(async () => (await page.locator("#sent .msg").allInnerTexts()).includes("second message"), 8000));

// 4. the menu: build number, suit, turn off, back on from the toolbar, hide 1 hour
await page.locator("#aquarius-genie >> #hit").click();
ok("clicking him opens the menu with CEO · build 1", await until(async () => (await page.locator("#aquarius-genie >> #menu").isVisible()) && (await page.locator("#aquarius-genie >> #mbuild").innerText()) === "CEO · build 1"));
await page.locator("#aquarius-genie >> #msuit").click();
ok("Suit on: he wears the suit", await until(async () => (await st()).suit === true));
await sleep(500);
await page.screenshot({ path: path.join(SHOTS, "chat-menu-suit.png") });
await page.locator("#aquarius-genie >> #msuit").click();
ok("Suit off", await until(async () => (await st()).suit === false));
await page.locator("#aquarius-genie >> #mlisten").click();
ok("Listening off is saved", await until(async () => (await sw.evaluate(() => chrome.storage.local.get("listen"))).listen === false));
await page.locator("#aquarius-genie >> [data-act=off]").click();
ok("Turn off: he is gone and stays off", await until(async () => (await host.count()) === 0) && (await sw.evaluate(() => chrome.storage.local.get("on"))).on === false);
await page.reload(); await sleep(1500);
ok("still off after a reload", (await host.count()) === 0);
await sw.evaluate(() => chrome.storage.local.set({ on: true, hiddenUntil: 0 })); // what the toolbar button does
ok("back on (toolbar)", await until(async () => (await host.count()) === 1));
await page.locator("#aquarius-genie >> #hit").click();
await page.locator("#aquarius-genie >> [data-act=hide]").click();
ok("Hide 1 hour", await until(async () => (await host.count()) === 0) && (await sw.evaluate(() => chrome.storage.local.get("hiddenUntil"))).hiddenUntil > Date.now() + 3500e3);
await sw.evaluate(() => chrome.storage.local.set({ hiddenUntil: 0, listen: true }));
await until(async () => (await host.count()) === 1);

// 5. the hands: his own tab, typing with sparkles, reading, refusals, the card
let n = 0;
async function send(action, input = {}) { const id = `c${++n}`; queue.push({ id, action, input }); return (await until(() => results.get(id), 40000)) || { text: "(no answer)" }; }
let r = await send("navigate", { url: `${WEB}/search`, look: true, why: "t" });
ok("navigate opens his tab and returns refs when asked", /ok: true[\s\S]*textbox "Search" \[ref=(a\d+)\]/.test(r.text), r.text);
ok("the heartbeat says Aquarius build 1", statuses.some((s) => s.app === "Aquarius" && s.build === "1"));
const hands = () => ctx.pages().find((p) => p.url().startsWith(WEB));
const searchRef = r.text.match(/textbox "Search" \[ref=(a\d+)\]/)[1];
r = await send("type", { ref: searchRef, text: "aquarius constellation", why: "t" });
ok("types instantly", /typed 22 characters/.test(r.text) && (await hands().inputValue("input[name=q]")) === "aquarius constellation", r.text);
ok("typing shows the sparkle overlay in the page", await hands().evaluate(() => !!document.getElementById("__aq_magic")));
r = await send("press", { key: "Enter", why: "search" });
ok("Enter submits the search", /did: pressed Enter[\s\S]*url: .*\/results\?q=aquarius\+constellation/.test(r.text), r.text);
r = await send("read_text", {});
ok("reads the result", /Results for aquarius constellation[\s\S]*constellation of the zodiac/.test(r.text), r.text);
r = await send("navigate", { url: `${WEB}/login`, look: true });
const pw = r.text.match(/textbox "Password" \[ref=(a\d+)\]/)[1];
r = await send("type", { ref: pw, text: "hunter2" });
ok("never types into a password field", /secret field/.test(r.text) && (await hands().inputValue("#pw")) === "", r.text);
r = await send("navigate", { url: `${WEB}/checkout`, look: true });
const po = r.text.match(/button "Place order" \[ref=(a\d+)\]/)[1];
const pending = send("click", { ref: po, why: "buy it", final: "none" });
const cardUp = await until(async () => (await hands().locator("#__aq_card").count()) === 1, 10000);
ok("a checkout click shows the card first", cardUp && orders.length === 0);
await hands().screenshot({ path: path.join(SHOTS, "hands-card.png") });
await hands().locator("#__aq_card [data-aq-choice=deny]").click();
r = await pending;
ok("Deny: the order is not placed", /Alex pressed Deny/.test(r.text) && orders.length === 0, r.text);
const pending2 = send("click", { ref: po, why: "buy it" });
await until(async () => (await hands().locator("#__aq_card").count()) === 1, 10000);
await hands().locator("#__aq_card [data-aq-choice=approve]").click();
r = await pending2;
ok("Approve: clicked", /did: clicked "Place order"/.test(r.text) && await until(() => orders.length === 1, 5000), r.text);
r = await send("screenshot");
ok("screenshot returns an image", typeof r.image === "string" && r.image.length > 1000, r.text);

// 6. the sparkle, frozen mid-burst, for a look
await hands().goto(`${WEB}/search`);
const { aqMagic } = await import("../ext/src/magic.js");
await hands().evaluate(`(${aqMagic.toString()})(300, 70, { freeze: 0.3, keep: true, silent: true })`);
await hands().screenshot({ path: path.join(SHOTS, "sparkle.png"), clip: { x: 150, y: 0, width: 320, height: 200 } });

await ctx.close(); chat.close(); web.close(); mob.close();
clearTimeout(KILL);
console.log(`ext.test.mjs: ${pass} passed, ${fail} failed   (screenshots: ${SHOTS})`);
process.exit(fail ? 1 : 0);
