// Drives src/app.mjs end to end: a stub link (the same 3 routes as the real
// worker), a real headless Chrome on a DevTools port, a local fixture site.
//   node test/app.test.mjs
import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, "../src/app.mjs"));
const { chromium } = (() => { try { return require("playwright-core"); } catch { return createRequire(import.meta.url)("playwright"); } })();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, x === undefined ? "" : String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 600)); } };
const KILL = setTimeout(() => { console.log("FAIL  timed out"); process.exit(1); }, 180000);

// fixture site
const site = http.createServer((q, s) => {
  s.setHeader("content-type", "text/html");
  if (q.url.startsWith("/login")) return s.end(`<label>Password <input type=password id=pw></label>`);
  s.end(`<h1>Campaigns</h1><button onclick="document.title='joined'">Join campaign</button><input aria-label="Video link" id=v><a href="/login">Sign in</a>`);
}).listen(0);
// stub link
const queue = [], results = new Map(), statuses = [];
const link = http.createServer(async (q, s) => {
  let body = ""; for await (const c of q) body += c;
  s.setHeader("content-type", "application/json");
  const what = q.url.split("/").pop();
  if (what === "next") return s.end(JSON.stringify(queue.shift() || null));
  if (what === "result") { const b = JSON.parse(body); results.set(b.id, b); return s.end("{}"); }
  if (what === "status") { statuses.push(JSON.parse(body)); return s.end("{}"); }
  s.statusCode = 404; s.end("null");
}).listen(0);
await sleep(200);
const SITE = `http://127.0.0.1:${site.address().port}`;

// Chrome with a DevTools port, opened on a site that is NOT a clipping site (like his old GMGN tab)
const PORT = 9700 + Math.floor(Math.random() * 200);
const bad = http.createServer((q, s) => { s.setHeader("content-type", "text/html"); s.end("<h1>GMGN look-alike</h1>"); }).listen(0);
await sleep(100);
const BAD = `http://localhost:${bad.address().port}/`;
const exe = chromium.executablePath();
const prof = fs.mkdtempSync(path.join(os.tmpdir(), "cc-prof-"));
const chrome = spawn(exe, ["--headless=new", "--no-sandbox", `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, BAD], { stdio: "ignore" });
for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {} await sleep(200); }

let out = "";
const app = spawn(process.execPath, [path.join(HERE, "../src/app.mjs")], {
  env: { ...process.env, CC_LINK: `http://127.0.0.1:${link.address().port}/KEY`, CC_PORT: String(PORT), CC_TEST_HOSTS: "127.0.0.1", CC_CARD_MS: "8000" },
});
app.stdout.on("data", (d) => { out += d; }); app.stderr.on("data", (d) => { out += d; });

const until = async (f, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = f(); if (v) return v; await sleep(200); } return null; };
let n = 0;
async function send(action, input = {}) { const id = `c${++n}`; queue.push({ id, action, input }); return (await until(() => results.get(id), 40000)) || { text: "(no answer)" }; }

// 1. connects, heartbeats, and the stray tab is sent to Content Rewards (no internet here, so only the attempt is seen)
const st = await until(() => statuses.find((s) => s.chrome === true));
ok("heartbeat says Cursor Clipper and Chrome connected", st && st.app === "Cursor Clipper" && st.build === "1", st);
ok("a tab on a non-clipping site is left at once", await until(() => /not a clipping site, leaving it: localhost/.test(out)), out);

// 2. GMGN and any other site are refused
let r = await send("navigate", { url: "https://gmgn.ai/?chain=sol", why: "test" });
ok("GMGN is refused", /ok: false[\s\S]*only for clipping: gmgn\.ai is not allowed/.test(r.text), r.text);
r = await send("navigate", { url: "https://www.depop.com/", why: "test" });
ok("any other site is refused", /not allowed/.test(r.text), r.text);

// 3. an allowed site opens and reads as a snapshot with refs
r = await send("navigate", { url: `${SITE}/`, why: "open" });
ok("an allowed site opens and returns refs", /ok: true[\s\S]*button "Join campaign" \[ref=[a-z0-9]+\]/.test(r.text), r.text);
const joinRef = (r.text.match(/button "Join campaign" \[ref=([a-z0-9]+)\]/) || [])[1];
const boxRef = (r.text.match(/textbox "Video link" \[ref=([a-z0-9]+)\]/) || [])[1];

// 4. a final click waits for the card: Deny -> nothing happens; Approve -> clicked
const spy = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const spyPage = () => spy.contexts()[0].pages().find((p) => p.url().startsWith(SITE));
const press = async (v) => { const p = await until(() => spyPage()); await until(async () => false, 1); for (let i = 0; i < 40; i++) { const has = await p.evaluate(() => !!document.getElementById("__cc_card")).catch(() => false); if (has) { await p.evaluate((v) => { window.__ccChoice = v; document.getElementById("__cc_card").remove(); }, v); return true; } await sleep(250); } return false; };
let pr = press("deny"); r = await send("click", { ref: joinRef, why: "join", final: "publish" }); await pr;
ok("Deny on the card: the click does not happen", /Alex pressed Deny/.test(r.text) && (await spyPage().title()) !== "joined", r.text);
pr = press("approve"); r = await send("click", { ref: joinRef, why: "join", final: "publish" }); await pr;
ok("Approve on the card: clicked", /did: clicked "Join campaign"/.test(r.text) && (await spyPage().title()) === "joined", r.text);
r = await send("click", { ref: joinRef, why: "join", final: "publish" });
ok("no answer on the card: nothing happens", /did not answer the card/.test(r.text), r.text);

// 5. typing works; Enter needs the card; a password field is never typed into
r = await send("type", { ref: boxRef, text: "https://youtube.com/shorts/abc", why: "link" });
ok("types into a box", /typed 30 characters/.test(r.text) && (await spyPage().inputValue("#v")) === "https://youtube.com/shorts/abc", r.text);
r = await send("navigate", { url: `${SITE}/login`, why: "login" });
const pwRef = (r.text.match(/textbox "Password" \[ref=([a-z0-9]+)\]/) || [])[1];
r = await send("type", { ref: pwRef, text: "hunter2", why: "x" });
ok("never types a password", /secret field/.test(r.text) && (await spyPage().inputValue("#pw")) === "", r.text);

// 6. screenshot comes back as an image; done ends cleanly
r = await send("screenshot");
ok("screenshot returns an image", typeof r.image === "string" && r.image.length > 1000);
r = await send("done", { summary: "test over" });
ok("done answers", /session ended/.test(r.text), r.text);

// 7. no trading, no update code anywhere in the app
const src = fs.readFileSync(path.join(HERE, "../src/app.mjs"), "utf8");
ok("no GMGN, trading or self-update code in the app", !/gmgn|trade|wallet|solana|runtime|update/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));

await spy.close().catch(() => {});
app.kill(); chrome.kill(); site.close(); link.close(); bad.close();
clearTimeout(KILL);
console.log(`app.test.mjs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
