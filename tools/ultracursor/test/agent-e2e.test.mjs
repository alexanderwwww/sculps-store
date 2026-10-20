/*
 * The agent, end to end, the way Alex will use it.
 *
 * A real Chromium with a DevTools port (his Chrome), the real runner started
 * from a copy of src/ (his WORK folder), the real panel on the page pressed
 * with a real mouse (layout read from the test-only ULTRA_TEST_PANEL_FILE),
 * the fake marketplace test/fixtures/shop.mjs, and test/stub-claude.mjs playing
 * Claude through the official SDK: it answers with scripted tool calls whose
 * refs it reads from the snapshots the agent sends, and records every request
 * so the API rules (append-only history, betas, params) are checked too.
 *
 *   A  key entry in the panel; a listing from 2 photos attached in the panel;
 *      sign-in wall paused and resumed after "Alex" signs in; cookie banner
 *      not gated; publish approved on the card (price on the card); photos
 *      arrive byte-exact
 *   B  a task posted by Claude through the control plane; a price change the
 *      model did NOT declare final is gated anyway; Skip -> nothing saved;
 *      the result is posted back as a report
 *   C  delete: one approval covers its own confirm dialog
 *   D  replies: Send approved (newline kept, not sent early); Enter in a chat
 *      box gated; Stop on the card ends the task, nothing sent
 *   E  checkout: navigating there is gated; the card number is refused
 *      without asking; Pay now skipped -> no purchase
 *   F  captcha wall paused and resumed; Pause and Resume from the panel
 *   G  the spend cap stops a task
 *   and: 0 API-rule violations, the panel never reaches the model, the
 *   action log has every step, the profile (brand, signature) reaches the model.
 *
 *   TMPDIR=/tmp node test/agent-e2e.test.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startStub, KEY } from "./stub-cloud.mjs";
import { startShop } from "./fixtures/shop.mjs";
import { startStubClaude } from "./stub-claude.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../src");
const REPO = path.resolve(HERE, "../../..");
const require = createRequire(import.meta.url);
const PW = path.join(REPO, "node_modules", "playwright-core");
const { chromium } = require(PW);
const CHROME = process.env.ULTRA_TEST_CHROMIUM || "/opt/pw-browsers/chromium";

const KILL = setTimeout(() => { console.log("FAIL  agent e2e timed out after 600 s"); cleanup(1); }, 600000);
let failed = 0, passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}${detail === undefined ? "" : `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`); }
  return Boolean(cond);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, every = 200) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(every); }
  return null;
}
const listen = (server) => new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)));

/* ------------------------------------------------------------------ photos */
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = (rgb[0] + x * 3) & 255; raw[o + 1] = (rgb[1] + y * 2) & 255; raw[o + 2] = rgb[2];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

/* ------------------------------------------------------------------ setup */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "uc-agent-e2e-"));
const WORK = path.join(tmp, "Application Support", "ultracursor", "runtime");
fs.mkdirSync(WORK, { recursive: true });
fs.cpSync(SRC, WORK, { recursive: true });
fs.mkdirSync(path.join(WORK, "node_modules", "@anthropic-ai"), { recursive: true });
fs.symlinkSync(PW, path.join(WORK, "node_modules", "playwright-core"));
fs.symlinkSync(path.join(REPO, "node_modules", "@anthropic-ai", "sdk"), path.join(WORK, "node_modules", "@anthropic-ai", "sdk"));
const CONFIG = path.join(tmp, "config.json");
const PANEL_FILE = path.join(tmp, "panel.json");
const photoDir = path.join(tmp, "Desktop photos");
fs.mkdirSync(photoDir);
const PHOTOS = { "tee-front.png": png(64, 48, [20, 20, 20]), "tee-back.png": png(64, 48, [200, 10, 10]) };
for (const [n, b] of Object.entries(PHOTOS)) fs.writeFileSync(path.join(photoDir, n), b);

const shop = await startShop();
const S = shop.url.replace(/\/$/, "");
// The fake marketplace's own profile, laid in beside depop.json the way a new site is added.
fs.writeFileSync(path.join(WORK, "profiles", "thrift.json"), JSON.stringify({
  name: "thrift", match: ["127.0.0.1"], about: "Alex's test shop.", brand: "Chrome God", signature: "Alexander",
  voice: ["short and lowercase-leaning"], notes: ["drafting replies means typing them; Send waits for Alex"],
  limits: { stepsPerTask: 40, tasksPerHour: 50, finalPerHour: 50, finalPerDay: 100 },
}));

const cloud = startStub();
const cloudPort = await listen(cloud.server);

const SCRIPTS = [
  {
    name: "A listing", match: /^Task: List the black tee/m, steps: [
      { tool: "navigate", input: { url: `${S}/sell/`, why: "open the sell page" } },
      { tool: "look", input: {}, expect: /Log in to Thrift/ },
      { tool: "click", target: { role: "button", name: "Accept" }, input: { why: "close the cookie banner", final: "none" }, expect: /Alex signed in[\s\S]*List an item/ },
      { tool: "upload", target: { role: "button", name: "Add photos" }, input: { files: ["tee-front.png", "tee-back.png"], why: "add the photos" }, expect: /ok: true\ndid: clicked/ },
      { tool: "type", target: { role: "textbox", name: "Description" }, input: { text: "Chrome Hearts cross tee, black. Worn twice.\nFits like a medium.", why: "write the description" }, expect: /ok: true\ndid: picked 2 file/ },
      { tool: "select", target: { role: "combobox", name: "Category" }, input: { option: "Tops", why: "pick the category" }, expect: /ok: true/ },
      { tool: "click", target: { role: "button", name: /^Condition/ }, input: { why: "open the condition list", final: "none" }, expect: /chose "Tops"/ },
      { tool: "click", target: { role: "option", name: "Used - Excellent" }, input: { why: "pick the condition", final: "none" }, expect: /ok: true/ },
      { tool: "type", target: { role: "textbox", name: "Size" }, input: { text: "M", why: "the size" }, expect: /ok: true/ },
      { tool: "type", target: { role: "textbox", name: "Price" }, input: { text: "240", why: "the price" }, expect: /ok: true/ },
      { tool: "click", target: { role: "button", name: "Post listing" }, input: { why: "post the listing", final: "publish" }, expect: /it now reads: "240"/ },
      { tool: "finish", input: { status: "done", summary: "Listed the Chrome Hearts cross tee at $240." }, expect: /ok: true\ndid: clicked button "Post listing"/ },
    ],
  },
  {
    name: "B price", match: /^Task: change the price of the Arc'teryx jacket to 199/m, steps: [
      { tool: "navigate", input: { url: `${S}/item/102/edit/`, why: "open the edit page" } },
      { tool: "type", target: { role: "textbox", name: "Price" }, input: { text: "199", why: "the new price" }, expect: /Edit listing/ },
      // Declared "none" on purpose: the harness must gate it anyway (a price was typed, the button says Save).
      { tool: "click", target: { role: "button", name: "Save changes" }, input: { why: "save it", final: "none" }, expect: /it now reads: "199"/ },
      { tool: "finish", input: { status: "needs_alex", summary: "Alex skipped the price change." }, expect: /Alex skipped this action/ },
    ],
  },
  {
    name: "C delete", match: /^Task: Delete the Stüssy hoodie listing/m, steps: [
      { tool: "navigate", input: { url: `${S}/item/103/edit/`, why: "open the hoodie" } },
      { tool: "click", target: { role: "button", name: "Delete listing" }, input: { why: "delete it", final: "delete" }, expect: /Edit listing/ },
      { tool: "click", target: { role: "button", name: "Delete" }, input: { why: "confirm", final: "delete" }, expect: /Delete this listing\?/ },
      { tool: "finish", input: { status: "done", summary: "Deleted the Stüssy hoodie." }, expect: /ok: true/ },
    ],
  },
  {
    name: "D replies", match: /^Task: Draft replies to my new messages/m, steps: [
      { tool: "navigate", input: { url: `${S}/messages/t1/`, why: "open maya's message" } },
      { tool: "type", target: { role: "textbox", name: "Write a message" }, input: { text: "yeah it's still here\nfits like a medium", why: "write the reply" }, expect: /Conversation with maya/ },
      { tool: "click", target: { role: "button", name: "Send" }, input: { why: "send it", final: "send" }, expect: /ok: true/ },
      { tool: "navigate", input: { url: `${S}/messages/t2/`, why: "next message" }, expect: /ok: true\ndid: clicked button "Send"/ },
      { tool: "type", target: { role: "textbox", name: "Write a message" }, input: { text: "make me an offer and i'll see what i can do", why: "answer the offer", enter: true }, expect: /Conversation with jdub/ },
      { tool: "finish", input: { status: "done", summary: "should never be reached: Alex stopped" } },
    ],
  },
  {
    name: "E checkout", match: /^Task: Buy item 201/m, steps: [
      { tool: "navigate", input: { url: `${S}/checkout/201/`, why: "open the checkout" } },
      { tool: "type", target: { role: "textbox", name: "Card number" }, input: { text: "4242424242424242", why: "card" }, expect: /Pay now/ },
      { tool: "click", target: { role: "button", name: "Pay now" }, input: { why: "pay", final: "buy" }, expect: /ultracursor never types into a card field/ },
      { tool: "finish", input: { status: "blocked", summary: "Payment skipped." }, expect: /Alex skipped this action/ },
    ],
  },
  {
    name: "F captcha+pause", match: /^Task: Look at my shop/m, steps: [
      { tool: "navigate", input: { url: `${S}/shop/`, why: "open my shop" } },
      { tool: "look", input: {}, expect: /Verify you are human/ },
      { tool: "wait", input: { seconds: 3 }, expect: /human check was in the way[\s\S]*My shop|human check was in the way/ },
      { tool: "finish", input: { status: "done", summary: "Your shop has 3 listings." }, expect: /waited 3 s/ },
    ],
  },
  {
    name: "G cap", match: /^Task: Read the home page/m, steps: [
      { tool: "look", input: {} },
      { tool: "look", input: {} },
      { tool: "finish", input: { status: "done", summary: "never reached: cap" } },
    ],
  },
];
const claude = await startStubClaude({ scripts: SCRIPTS });

const CDP = 9500 + Math.floor(Math.random() * 300);
const chromeProc = spawn(CHROME, [
  "--headless=new", "--no-sandbox", "--no-proxy-server", `--remote-debugging-port=${CDP}`, `--user-data-dir=${path.join(tmp, "profile")}`,
  "--no-first-run", "--no-default-browser-check", "--window-size=1280,900", "about:blank",
], { stdio: "ignore" });
await until(async () => { try { return (await fetch(`http://127.0.0.1:${CDP}/json/version`)).ok; } catch { return false; } }, 20000);

const ENV = {
  ...process.env,
  ULTRA_BUILD: "2",
  ULTRA_CLOUD: `http://127.0.0.1:${cloudPort}/research/${KEY}`,
  ULTRA_CDP_PORT: String(CDP),
  ULTRA_FAST: "1",
  ULTRA_CONFIG: CONFIG,
  ULTRA_TRADER_FLAG: "http://127.0.0.1:9/no-flag.json", // never the live switch
  ULTRA_LINK: "http://127.0.0.1:9/no-link", // never the live link
  ULTRA_ANTHROPIC_BASE_URL: claude.url,
  ULTRA_TEST_PANEL_FILE: PANEL_FILE,
};
let runner = null, runnerOut = "", runnerExit = null;
function startRunner() {
  runner = spawn(process.execPath, ["ultra.mjs"], { cwd: WORK, env: ENV, stdio: ["ignore", "pipe", "pipe"] });
  runner.stdout.on("data", (d) => { runnerOut += d; });
  runner.stderr.on("data", (d) => { runnerOut += d; });
  runner.on("exit", (c) => { runnerExit = c; });
}
function cleanup(code) {
  try { runner && runner.kill("SIGKILL"); } catch {}
  try { chromeProc.kill("SIGKILL"); } catch {}
  try { cloud.server.close(); shop.close(); claude.close(); } catch {}
  if (code === 0 || !process.env.ULTRA_KEEP) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
  else console.log(`kept ${tmp}`);
  clearTimeout(KILL);
  process.exit(code);
}

const watcher = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`);
const ctx = watcher.contexts()[0];
const page = ctx.pages()[0] || await ctx.newPage();
const shopState = async () => (await fetch(`${S}/__test/state`)).json();
const post = (p) => fetch(`${S}${p}`, { method: "POST" });

/* ------------------------------------------------------------------ the panel, by hand */
const panel = () => { try { return JSON.parse(fs.readFileSync(PANEL_FILE, "utf8")); } catch { return null; } };
const layoutHere = () => {
  const p = panel();
  if (!p) return null;
  let url = ""; try { url = page.url(); } catch {}
  const e = p.pages.find((x) => x.url === url) || p.pages.find((x) => x.current) || p.pages[0];
  return e ? e.layout : null;
};
let cardSeen = { id: null, at: 0 };
async function waitCard(kind, ms = 60000) {
  const c = await until(() => { const p = panel(); const c = p && p.state.card; return c && c.kind === kind ? c : null; }, ms, 150);
  if (c && cardSeen.id !== c.id) cardSeen = { id: c.id, at: Date.now() };
  return c;
}
async function press(key, ms = 15000) {
  // A card's buttons only count 600 ms after it appeared (the panel's own rule).
  if (cardSeen.at && Date.now() - cardSeen.at < 800) await sleep(800 - (Date.now() - cardSeen.at));
  // The rects come from the panel's last poll, up to ~0.7 s behind what is on
  // screen: wait until they belong to the card now shown and hold still.
  const pick = () => {
    const l = layoutHere();
    const s = stateNow();
    if (!l) return null;
    if (s && s.card && l.shownCard !== s.card.id) return null;
    return l[key] || (l.choices && l.choices[key]) || null;
  };
  const r = await until(async () => {
    const a = pick();
    if (!a) return null;
    await sleep(350);
    const b = pick();
    return b && JSON.stringify(a) === JSON.stringify(b) ? b : null;
  }, ms, 100);
  if (!r) return false;
  if (process.env.E2E_DEBUG) console.log(`   press ${key} at`, JSON.stringify(r), "on", page.url(), "hit:", await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}#${e.id}.${e.className}` : null; }, { x: r.x + r.w / 2, y: r.y + r.h / 2 }));
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  return true;
}
async function typeInPanel(key, text) {
  const r = await until(() => { const l = layoutHere(); return l && l[key]; }, 15000, 150);
  if (!r) return false;
  await page.mouse.click(r.x + 20, r.y + r.h / 2);
  await page.keyboard.type(text, { delay: 5 });
  return true;
}
const stateNow = () => { const p = panel(); return p ? p.state : null; };
async function waitIdle(ms = 60000) { return until(() => { const s = stateNow(); return s && !s.task && (s.mode === "idle" || (s.card && s.card.kind === "done")) ? s : null; }, ms, 200); }
async function dismissDone() {
  const c = await waitCard("done", 120000);
  if (!c) return null;
  await press("ok");
  await until(() => { const s = stateNow(); return s && (!s.card || s.card.id !== c.id); }, 8000);
  return c;
}
async function giveTask(text, files = []) {
  await until(() => { const s = stateNow(); return s && s.mode === "idle"; }, 30000);
  if (!(await typeInPanel("input", text))) return false;
  if (files.length) {
    const chooser = page.waitForEvent("filechooser", { timeout: 10000 });
    await press("attach");
    const fc = await chooser;
    await fc.setFiles(files);
    await until(() => { const l = layoutHere(); return l && l.chips; }, 8000);
  }
  return press("send");
}
const logEntries = () => {
  const dir = path.join(WORK, "logs");
  try { return fs.readdirSync(dir).flatMap((f) => fs.readFileSync(path.join(dir, f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))); }
  catch { return []; }
};

/* ------------------------------------------------------------------ run */
startRunner();
await page.goto(`${S}/`);

console.log("== key");
const idle = await until(() => { const s = stateNow(); return s && s.mode === "idle" ? s : null; }, 30000);
check("build 6: first launch never asks for a Claude API key; the bar is the task field", Boolean(idle), runnerOut.slice(-800));
// The bar's own tasks still run on a key from config.json (link tasks bring their own brain).
fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch {}
fs.writeFileSync(CONFIG, JSON.stringify({ ...cfg, anthropicApiKey: "sk-ant-api03-e2e-test-key-0123456789" }), { mode: 0o600 });

console.log("== A: a listing from photos");
await giveTask("List the black tee: Chrome Hearts cross tee, black, worn twice, size M, Used - Excellent, Tops, $240", Object.keys(PHOTOS).map((n) => path.join(photoDir, n)));
const wallA = await waitCard("wall", 60000);
check("the sign-in page pauses the task with a card (the agent never types a password)", wallA && /Sign in/.test(wallA.title), wallA);
await sleep(600);
// Alex signs in himself.
await page.locator("#email").fill("alex@example.com");
await page.locator("#password").fill("hunter2-not-stored");
await page.getByRole("button", { name: "Log in" }).click();
const apprA = await waitCard("approval", 90000);
check("Post listing waits for approval: title, button, and the fields typed (price included)",
  apprA && /Publish/.test(apprA.title) && apprA.lines.some((l) => l === 'Button: "Post listing"') && apprA.lines.some((l) => /^Price: 240$/.test(l)) && apprA.lines.some((l) => /^Size: M$/.test(l)), apprA);
let st = await shopState();
check("nothing was posted before the approval", !st.listings.some((l) => l.id >= 301), st.listings.map((l) => l.id));
await press("approve");
const doneA = await dismissDone();
check("the task ends with a Done card and its cost", doneA && doneA.title === "Done" && /Listed the Chrome Hearts/.test(doneA.lines[0]) && /\$\d+\.\d\d/.test(doneA.lines[1] || ""), doneA);
st = await shopState();
const L = st.listings.find((l) => l.id >= 301);
check("the listing exists with the typed details", L && L.price === 240 && L.size === "M" && L.condition === "Used - Excellent" && L.category === "Tops" && /Worn twice\.\nFits like a medium\./.test(L.description), L);
check("both photos arrived byte for byte, in order", L && L.photos.length === 2 && L.photos[0].sha256 === sha(PHOTOS["tee-front.png"]) && L.photos[1].sha256 === sha(PHOTOS["tee-back.png"]), L && L.photos);
check("the sign-in was Alex's, through the page", st.logins && st.logins.length >= 1, st.logins);
const reqA = claude.requests.filter((r) => r.task === "A listing");
const firstA = reqA[0] && reqA[0].body.messages[0].content;
check("the model saw both photos, the files list, and the site profile (brand, signature)",
  Array.isArray(firstA) && firstA.filter((b) => b.type === "image").length === 2 && /Files: tee-front\.png, tee-back\.png/.test(firstA[0].text)
  && /Site profile: thrift/.test(firstA[0].text) && /Shop \/ brand name: Chrome God/.test(firstA[0].text) && /Sign messages to people as: Alexander/.test(firstA[0].text),
  firstA && firstA[0] && firstA[0].text.slice(0, 600));
const logA = logEntries();
check("the cookie banner's Accept did not need approval (one approval in task A)", logA.filter((e) => e.kind === "approval").length === 1, logA.filter((e) => e.kind === "approval"));

console.log("== B: a task from Claude; an undeclared price change is gated; Skip");
cloud.set("hunt", { id: "task-b", looking: "task: change the price of the Arc'teryx jacket to 199", terms: [], depth: 1 });
const apprB = await waitCard("approval", 90000);
check("Save changes after typing a price is gated as a price change, old -> new, though the model said final: none",
  apprB && /Change a price/.test(apprB.title) && apprB.lines.some((l) => /^Price: 220(\.00)? → 199$/.test(l)), apprB);
await press("skip");
const doneB = await dismissDone();
check("skipped: the task says it needs Alex", doneB && doneB.title === "Needs you", doneB);
st = await shopState();
check("nothing was saved", !st.edits.some((e) => e.id === 102), st.edits);
const repB = await until(() => cloud.reports.find((r) => r.id === "task-b"), 10000);
check("the result went back to Claude as a report", repB && repB.report.kind === "task" && repB.report.status === "needs_alex", repB);

console.log("== C: delete with its confirm dialog");
await giveTask("Delete the Stüssy hoodie listing");
const apprC = await waitCard("approval", 90000);
check("Delete listing waits for approval", apprC && /Delete/.test(apprC.title) && apprC.lines.includes('Button: "Delete listing"'), apprC);
await press("approve");
const doneC = await dismissDone();
st = await shopState();
check("deleted after one approval (the dialog's Delete is the same decision)", doneC && doneC.title === "Done" && st.deletions.some((d) => String(d.id ?? d) === "103"), { doneC, deletions: st.deletions });
const taskC = logEntries().filter((e) => e.kind === "task" && e.event === "start" && /Stüssy/.test(e.text)).pop();
check("exactly one approval card in task C", taskC && logEntries().filter((e) => e.kind === "approval" && e.task === taskC.task).length === 1);

console.log("== D: replies; Send approved; Enter gated; Stop");
await giveTask("Draft replies to my new messages");
const apprD1 = await waitCard("approval", 90000);
check("Send waits for approval and the card shows the message", apprD1 && /Send/.test(apprD1.title) && apprD1.lines.some((l) => /yeah it's still here/.test(l)), apprD1);
st = await shopState();
check("the newline did not send the message early", st.sent.length === 0, st.sent);
await press("approve");
const apprD2 = await until(async () => { const c = await waitCard("approval", 1000); return c && c.id !== apprD1.id ? c : null; }, 90000);
check("Enter in the chat box is gated too", apprD2 && /Submit/.test(apprD2.title), apprD2);
await press("stop");
const doneD = await dismissDone();
st = await shopState();
check("Stop ends the task: one message sent, with its line break, none to the second buyer",
  doneD && doneD.title === "Stopped" && st.sent.length === 1 && st.sent[0].thread === "t1" && st.sent[0].text === "yeah it's still here\nfits like a medium", { doneD, sent: st.sent });

console.log("== E: checkout");
await giveTask("Buy item 201 for me");
const apprE1 = await waitCard("approval", 90000);
check("opening a checkout page waits for approval", apprE1 && /Buy/.test(apprE1.title) && apprE1.lines.some((l) => /checkout\/201/.test(l)), apprE1);
await press("approve");
const apprE2 = await until(async () => { const c = await waitCard("approval", 1000); return c && c.id !== apprE1.id ? c : null; }, 90000);
check("Pay now waits for approval", apprE2 && /Buy/.test(apprE2.title) && apprE2.lines.includes('Button: "Pay now"'), apprE2);
const cardVal = await page.locator("#card").inputValue().catch(() => "?");
check("the card number was refused, never typed", cardVal === "", cardVal);
await press("skip");
const doneE = await dismissDone();
st = await shopState();
check("no purchase", doneE && st.purchases.length === 0, { doneE, purchases: st.purchases });
check("the refusal is in the action log", logEntries().some((e) => e.kind === "action" && /refused: a card field/.test(e.error || "")));

console.log("== F: captcha wall; pause and resume");
await post("/__test/captcha?on=1");
await giveTask("Look at my shop");
const wallF = await waitCard("wall", 90000);
check("a captcha pauses the task with its own card", wallF && /check/.test(wallF.title), wallF);
await sleep(1000);
await post("/__test/captcha?on=0");
const runningF = await until(() => { const s = stateNow(); return s && s.mode === "running" && /wait|Thinking/i.test(s.status) ? s : null; }, 30000, 100);
check("the check cleared by itself and the task carried on", Boolean(runningF), stateNow());
await press("pause");
const pausedF = await until(() => { const s = stateNow(); return s && s.mode === "paused" ? s : null; }, 10000);
check("Pause on the panel pauses", Boolean(pausedF), stateNow());
await sleep(4500);
const nF = claude.requests.filter((r) => r.task === "F captcha+pause").length;
await sleep(2500);
check("while paused nothing reaches Claude", claude.requests.filter((r) => r.task === "F captcha+pause").length === nF);
await press("resume");
const doneF = await dismissDone();
check("Resume carries on to the end", doneF && doneF.title === "Done" && /3 listings/.test(doneF.lines[0]), doneF);

console.log("== G: spend cap");
fs.writeFileSync(CONFIG, JSON.stringify({ ...JSON.parse(fs.readFileSync(CONFIG, "utf8")), maxUsdPerTask: 0.001 }));
await giveTask("Read the home page");
const doneG = await dismissDone();
check("the spend cap stops a task", doneG && doneG.title === "Limit reached" && /spend cap/.test(doneG.lines[0]), doneG);

console.log("== everywhere");
check("0 Claude API rule violations (append-only history, thinking kept, betas, params, tool inputs)", claude.violations.length === 0, claude.violations.slice(0, 8));
const bodies = claude.requests.map((r) => JSON.stringify(r.body.messages)).join("\n");
check("the panel never reaches the model", !/Tell ultracursor|Approve\?|Paste your Claude API key/.test(bodies));
check("the API key never appears in a request body or the log", !bodies.includes("e2e-test-key") && !JSON.stringify(logEntries()).includes("e2e-test-key") && !cloud.logs.join("\n").includes("e2e-test-key"));
const kinds = new Set(logEntries().map((e) => e.kind));
check("the action log has tasks, actions, approvals, walls, model turns and limits", ["task", "action", "approval", "wall", "model", "limit"].every((k) => kinds.has(k)), [...kinds]);
const acted = logEntries().filter((e) => e.kind === "action");
check("every tool call the model made has exactly one action-log line (reads, refusals, skips and finishes too)", acted.length === claude.requests.length && acted.every((e) => e.tool && e.step >= 1), { logged: acted.length, calls: claude.requests.length });
check("Claude can follow along: agent lines in the control-plane log", cloud.logs.filter((l) => /^agent /.test(l)).length >= 20);
const lastStatus = cloud.statuses.filter((s) => s.agent).pop();
check("the status Claude reads carries the agent's state", lastStatus && lastStatus.agent && typeof lastStatus.agent.mode === "string", lastStatus && lastStatus.agent);

await page.screenshot({ path: path.join(HERE, "shots", "agent-e2e-last.png") }).catch(() => {});
try { await watcher.close(); } catch {}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) console.log(runnerOut.split("\n").slice(-40).join("\n"));
cleanup(failed ? 1 : 0);
