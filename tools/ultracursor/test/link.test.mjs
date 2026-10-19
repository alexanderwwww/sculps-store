/*
 * The link, end to end: link/worker.mjs (run here with an in-memory R2) <->
 * the real runner <-> a real Chromium on the fake marketplace. Commands go in
 * as MCP tools/call requests, exactly what claude.ai sends; approvals are
 * pressed on the real panel with a real mouse.
 *
 *   TMPDIR=/tmp node test/link.test.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import zlib from "node:zlib";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import worker from "../link/worker.mjs";
import { startShop } from "./fixtures/shop.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../src");
const REPO = path.resolve(HERE, "../../..");
const require = createRequire(import.meta.url);
const PW = path.join(REPO, "node_modules", "playwright-core");
const { chromium } = require(PW);
const KEY = fs.readFileSync(path.resolve(HERE, "../link/worker.mjs"), "utf8").match(/const KEY = "([^"]+)"/)[1];
const KILL = setTimeout(() => { console.log("FAIL  link test timed out"); done(1); }, 400000);
let failed = 0, passed = 0;
const check = (n, c, d) => { if (c) { passed++; console.log(`  ok  ${n}`); } else { failed++; console.log(`FAIL  ${n}${d === undefined ? "" : `  -> ${JSON.stringify(d).slice(0, 700)}`}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, e = 200) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(e); } return null; };

/* the worker, served from memory */
const store = new Map();
const R2 = {
  async get(k) { return store.has(k) ? { text: async () => store.get(k) } : null; },
  async put(k, v) { store.set(k, String(v)); },
  async delete(k) { store.delete(k); },
  async list({ prefix, limit }) { return { objects: [...store.keys()].filter((k) => k.startsWith(prefix)).sort().slice(0, limit || 1000).map((key) => ({ key })) }; },
};
const env = { MEDIA: R2 };
const wsrv = http.createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  const r = await worker.fetch(new Request(`http://x${req.url}`, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((r) => wsrv.listen(0, "127.0.0.1", r));
const LINK = `http://127.0.0.1:${wsrv.address().port}/${KEY}`;
let rpcId = 0;
async function mcp(name, args = {}) {
  const r = await fetch(`${LINK}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }) });
  const j = await r.json();
  return j.result.content;
}
const text = (c) => c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
const ref = (t, role, name) => { const m = new RegExp(`- ${role} "${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^\\n]*\\[ref=([^\\]\\s]+)\\]`).exec(t); return m && m[1]; };

/* a photo served from "R2" */
function png(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h, 90);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const PHOTO = png(40, 30);
const psrv = http.createServer((q, r) => { r.writeHead(200, { "content-type": "image/png" }); r.end(PHOTO); });
await new Promise((r) => psrv.listen(0, "127.0.0.1", r));
const PHOTO_URL = `http://127.0.0.1:${psrv.address().port}/media/tee-front.png`;

/* the app */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "uc-link-"));
const WORK = path.join(tmp, "Application Support", "ultracursor", "runtime");
fs.mkdirSync(WORK, { recursive: true });
fs.cpSync(SRC, WORK, { recursive: true });
fs.mkdirSync(path.join(WORK, "node_modules", "@anthropic-ai"), { recursive: true });
fs.symlinkSync(PW, path.join(WORK, "node_modules", "playwright-core"));
fs.symlinkSync(path.join(REPO, "node_modules", "@anthropic-ai", "sdk"), path.join(WORK, "node_modules", "@anthropic-ai", "sdk"));
const shop = await startShop();
const S = shop.url.replace(/\/$/, "");
fs.writeFileSync(path.join(WORK, "profiles", "thrift.json"), JSON.stringify({ name: "thrift", match: ["127.0.0.1"], limits: { stepsPerTask: 60, tasksPerHour: 50, finalPerHour: 50, finalPerDay: 100 } }));
const cloud = http.createServer((q, r) => { q.resume(); r.writeHead(200, { "content-type": "application/json" }); r.end("null"); });
await new Promise((r) => cloud.listen(0, "127.0.0.1", r));
const CDP = 9200 + Math.floor(Math.random() * 300);
const chrome = spawn("/opt/pw-browsers/chromium", ["--headless=new", "--no-sandbox", "--no-proxy-server", `--remote-debugging-port=${CDP}`, `--user-data-dir=${path.join(tmp, "p")}`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
await until(async () => { try { return (await fetch(`http://127.0.0.1:${CDP}/json/version`)).ok; } catch { return false; } }, 20000);
const PANEL_FILE = path.join(tmp, "panel.json");
let out = "";
const runner = spawn(process.execPath, ["ultra.mjs"], { cwd: WORK, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ULTRA_BUILD: "3", ULTRA_CDP_PORT: String(CDP), ULTRA_FAST: "1", ULTRA_CLOUD: `http://127.0.0.1:${cloud.address().port}/research/K`, ULTRA_LINK: LINK, ULTRA_CONFIG: path.join(tmp, "config.json"), ULTRA_TEST_PANEL_FILE: PANEL_FILE } });
runner.stdout.on("data", (d) => { out += d; }); runner.stderr.on("data", (d) => { out += d; });
function done(code) { try { runner.kill("SIGKILL"); chrome.kill("SIGKILL"); } catch {} try { wsrv.close(); psrv.close(); cloud.close(); shop.close(); } catch {} clearTimeout(KILL); process.exit(code); }

const w = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`);
const page = w.contexts()[0].pages()[0];
await page.goto(`${S}/__test/login`);
const panel = () => { try { return JSON.parse(fs.readFileSync(PANEL_FILE, "utf8")); } catch { return null; } };
async function press(key) {
  const pick = () => { const p = panel(); if (!p) return null; const e = p.pages.find((x) => x.url === page.url()) || p.pages[0]; const l = e && e.layout; if (!l) return null; if (p.state.card && l.shownCard !== p.state.card.id) return null; return l[key] || (l.choices && l.choices[key]); };
  const r = await until(async () => { const a = pick(); if (!a) return null; await sleep(400); const b = pick(); return b && JSON.stringify(a) === JSON.stringify(b) ? b : null; }, 20000);
  if (!r) return false;
  await sleep(700);
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  return true;
}

console.log("== connect");
const st = await until(async () => { const t = text(await mcp("ultra_status")); return /^connected/.test(t) ? t : null; }, 30000, 1000);
check("ultra_status: the app is connected with no API key", Boolean(st), out.slice(-500));
const tools = await (await fetch(`${LINK}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) })).json();
check("tools/list offers ultra_status, ultra_act, ultra_result", tools.result.tools.map((t) => t.name).join() === "ultra_status,ultra_act,ultra_result");

console.log("== drive");
let t = text(await mcp("ultra_act", { action: "navigate", url: `${S}/messages/t1/`, why: "open the message" }));
check("navigate answers with the page snapshot", /ok: true/.test(t) && /Write a message/.test(t), t.slice(0, 300));
t = text(await mcp("ultra_act", { action: "type", ref: ref(t, "textbox", "Write a message"), text: "yeah it's still here", why: "reply" }));
check("type works", /it now reads: "yeah it's still here"/.test(t), t.slice(0, 300));
const sendRef = ref(t, "button", "Send");
const pending = mcp("ultra_act", { action: "click", ref: sendRef, why: "send it", final: "send" });
const card = await until(() => { const p = panel(); return p && p.state.card && p.state.card.kind === "approval" ? p.state.card : null; }, 30000);
check("a final click shows the Approve card on Alex's screen", card && /Send/.test(card.title), card);
check("nothing sent before he presses", (await (await fetch(`${S}/__test/state`)).json()).sent.length === 0);
await sleep(1500);
await press("approve");
t = text(await pending);
let id = (/ultra_result with id "([^"]+)"/.exec(t) || [])[1];
if (id) t = text(await mcp("ultra_result", { id }));
check("after Approve the answer comes back to the chat", /ok: true\ndid: clicked button "Send"/.test(t), t.slice(0, 300));
check("the message was sent", (await (await fetch(`${S}/__test/state`)).json()).sent.some((m) => m.text === "yeah it's still here"));

t = text(await mcp("ultra_act", { action: "navigate", url: `${S}/sell/`, why: "sell" }));
const accept = ref(t, "button", "Accept");
if (accept) t = text(await mcp("ultra_act", { action: "click", ref: accept, why: "cookies", final: "none" }));
t = text(await mcp("ultra_act", { action: "upload", ref: ref(t, "button", "Add photos"), files: [PHOTO_URL], why: "photos" }));
check("upload takes a photo by URL (how Claude passes photos)", /ok: true\ndid: picked 1 file/.test(t), t.slice(0, 300));
const shot = await mcp("ultra_act", { action: "screenshot" });
check("screenshot comes back as an image", shot.some((b) => b.type === "image" && b.data.length > 1000));
t = text(await mcp("ultra_act", { action: "done", summary: "test over" }));
check("done ends the session and says so", /session ended: test over/.test(t), t);
const after = await until(() => { const p = panel(); return p && !p.state.task ? p.state : null; }, 15000);
check("the app is free again", Boolean(after));
t = text(await mcp("ultra_act", { action: "look" }));
check("a new command starts a new session by itself", /ok: true/.test(t) && /List an item/.test(t), t.slice(0, 200));
await mcp("ultra_act", { action: "done", summary: "bye" });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) console.log(out.slice(-2500));
done(failed ? 1 : 0);
