/*
 * ultracursor's runner. run.command starts it from WORK
 * (~/Library/Application Support/ultracursor/runtime) with ULTRA_BUILD set.
 *
 *   every 2 s   GET /order (read-once): run | pause | stop | update
 *   every 5 s   GET /hunt; a new id (not state.lastHuntId) -> a sweep
 *               POST /status (and on every phase change)
 *   every 60 s  GET /runtime; another build -> download, verify, exit 97
 *
 * A sweep, per query: Meta Ad Library -> TikTok (clips, comments) ->
 * Instagram (posts, comments) -> Google Trends; then once: competitor stores.
 * Then POST /report. Read-only on every site.
 *
 * Build 2 adds the agent beside the sweep (src/agent/, SPEC "Build 2"): Alex
 * types a task into the panel on any page (or Claude posts a hunt whose
 * `looking` starts with "task:"), and the desk runs it, one at a time, never
 * at the same time as a sweep, with every final action approved on a card.
 *
 * It drives his real Chrome over the DevTools port (9333), never a bundled
 * browser. Nothing here crashes on a network or page failure: it says what is
 * wrong in the status and keeps going.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as uiReal from "./ui.mjs";
import { createCloud, parseGoals } from "./cloud.mjs";
import { buildReport } from "./report.mjs";
import { queriesFrom } from "./parse.mjs";
import * as adlibrary from "./sites/adlibrary.mjs";
import * as tiktok from "./sites/tiktok.mjs";
import * as instagram from "./sites/instagram.mjs";
import * as trends from "./sites/trends.mjs";
import * as stores from "./sites/stores.mjs";

const WORK = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const FAST = process.env.ULTRA_FAST === "1";
const PORT = Number(process.env.ULTRA_CDP_PORT || 9333);
const STATE_FILE = path.join(WORK, "state.json");

function readBuild() {
  if (process.env.ULTRA_BUILD) return String(process.env.ULTRA_BUILD).trim();
  try { return fs.readFileSync(path.join(WORK, "build.txt"), "utf8").trim() || "0"; } catch { return "0"; }
}
const BUILD = readBuild();
// Trader data lives beside WORK, never inside it: run.command replaces WORK's
// folders from the bundle, and the memory must survive that.
if (!process.env.ULTRA_TRADER_DIR) process.env.ULTRA_TRADER_DIR = path.join(WORK, "..", "trader");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cloud = createCloud(process.env.ULTRA_CLOUD || undefined);
const log = (l) => cloud.log(l);

/* ------------------------------------------------------------------ state */

function loadState() {
  try { return Object.assign({ lastHuntId: null, lastReportAt: null }, JSON.parse(fs.readFileSync(STATE_FILE, "utf8"))); }
  catch { return { lastHuntId: null, lastReportAt: null }; }
}
function saveState(s) {
  try { fs.writeFileSync(STATE_FILE + ".tmp", JSON.stringify(s, null, 2)); fs.renameSync(STATE_FILE + ".tmp", STATE_FILE); }
  catch (e) { log(`could not save state.json: ${e.message}`); }
}
const saved = loadState();

/* ------------------------------------------------------------------ the agent desk */

// Loaded on its own: if the agent cannot load (Claude's SDK missing after a
// broken install), research keeps working and the status says why.
let trader = null;   // trader mode (build 5), created once chrome() exists below
const traderCtl = {
  want: () => (trader ? trader.want() : false),
  set: (on) => (trader ? trader.set(on, "panel") : { ok: false, error: "the trader is not available" }),
};
let desk;
try {
  const [{ createDesk }, { createHost }] = await Promise.all([import("./agent/desk.mjs"), import("./agent/host.mjs")]);
  desk = createDesk({
    work: WORK,
    build: BUILD,
    cloudLog: (l) => log(l),
    ui: { attach: uiReal.attach, say: uiReal.say, hover: uiReal.hover, scroll: uiReal.scroll, setSpeed: uiReal.setSpeed },
    pacingScale: FAST ? 0.05 : 1,
    trader: traderCtl,
    baseURL: process.env.ULTRA_ANTHROPIC_BASE_URL || undefined,
    createHost,
  });
} catch (e) {
  const why = String(e && e.message || e).split("\n")[0].slice(0, 200);
  log(`the agent could not start (${why}); research still works. Open ultracursor again to reinstall.`);
  const off = { mode: "off", status: `agent unavailable: ${why}`, task: null, step: null, usd: null, card: null, hasKey: false };
  desk = {
    install: async () => {}, control: () => {}, state: () => off, hasWork: () => false,
    enqueue: () => log("a task arrived but the agent is unavailable"), runNext: async () => null, onFinished: () => {},
  };
}
let agentRun = null;

// The link: Claude in the chat commands the agent (no API key), like Magic Wand.
let link = null;
try {
  const { createLink, DEFAULT_LINK } = await import("./agent/link.mjs");
  link = createLink({ base: process.env.ULTRA_LINK || DEFAULT_LINK, log: (l) => log(l), inbox: path.join(WORK, "inbox") });
} catch (e) { log(`the link to Claude could not start: ${String(e && e.message || e).slice(0, 160)}`); }
let lastBeat = 0, lastTake = 0;
desk.onFinished(async (r) => {
  log(`task ${r.status}: ${String(r.summary || "").slice(0, 200)} (${r.steps} steps, $${(r.usd || 0).toFixed(2)})`);
  // A task Claude posted gets its answer where Claude reads reports.
  if (r.task.huntId) {
    await cloud.report(r.task.huntId, {
      app: "ultracursor", kind: "task", build: BUILD, huntId: r.task.huntId, looking: `task: ${r.task.text}`,
      status: r.status, summary: r.summary, steps: r.steps, usd: Math.round((r.usd || 0) * 100) / 100, at: Date.now(),
    });
  }
});

/** Photos for a task Claude posted: image URLs in the hunt's terms, fetched once. */
async function fetchTaskFiles(id, urls) {
  const out = [];
  const dir = path.join(WORK, "inbox", `cloud-${String(id).replace(/[^a-z0-9_-]/gi, "").slice(0, 40)}`);
  for (const u of urls.slice(0, 12)) {
    try {
      const url = new URL(u);
      if (!/^https?:$/.test(url.protocol)) continue;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30000);
      const r = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
      const mime = String(r.headers.get("content-type") || "").split(";")[0].trim();
      if (!r.ok || !/^image\//.test(mime)) { log(`task photo skipped (${r.status} ${mime || "?"}): ${u.slice(0, 120)}`); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length || buf.length > 25 * 1024 * 1024) continue;
      fs.mkdirSync(dir, { recursive: true });
      let name = (decodeURIComponent(url.pathname.split("/").pop() || "") || `photo-${out.length + 1}`).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
      if (!/\.[a-z0-9]{2,5}$/i.test(name)) name += mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
      while (out.some((f) => f.name === name)) name = `1-${name}`;
      const file = path.join(dir, name);
      fs.writeFileSync(file, buf);
      out.push({ name, path: file, mime, size: buf.length });
    } catch (e) {
      log(`task photo could not be fetched: ${u.slice(0, 120)} (${String(e && e.message || e).slice(0, 80)})`);
    }
  }
  return out;
}

const S = {
  state: "idle",
  phase: "starting",
  step: "",
  hunt: null,
  progress: { done: 0, total: 0 },
  chrome: { connected: false },
  signin: { facebook: null, tiktok: null, instagram: null, google: null },
  counts: { ads: 0, clips: 0, posts: 0, comments: 0, signals: 0, stores: 0 },
  lastError: null,
};
let paused = false;
let stopped = false;
let stopSweep = false;
let updateNow = false;
let quitting = false;

function status(changes = {}, push = true) {
  Object.assign(S, changes);
  if (push) postStatus();
}
let posting = false;
async function postStatus() {
  if (posting) return;
  posting = true;
  try {
    await cloud.status({
      app: "ultracursor", build: BUILD, state: S.state, phase: S.phase, step: S.step,
      hunt: S.hunt, progress: S.progress, chrome: S.chrome, signin: S.signin, counts: S.counts,
      trader: trader ? trader.state() : null,
      agent: (() => { const a = desk.state(); return { mode: a.mode, status: a.status, task: a.task, step: a.step, usd: a.usd, card: a.card ? { kind: a.card.kind, title: a.card.title } : null, hasKey: a.hasKey }; })(),
      lastError: S.lastError || cloud.lastError || null, at: Date.now(),
    });
  } finally { posting = false; }
}

/* ------------------------------------------------------------------ chrome */

let chromium = null;
try { ({ chromium } = require("playwright-core")); } catch (e) { S.lastError = `playwright-core missing: ${e.message}`; }
let browser = null;

async function chrome() {
  if (browser && browser.isConnected()) return browser;
  browser = null;
  if (!chromium) return null;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 8000 });
    browser.on("disconnected", () => { S.chrome.connected = false; browser = null; });
    S.chrome.connected = true;
    log(`connected to Chrome on port ${PORT}`);
    // The cursor, the pill and the task panel on every page of this Chrome.
    const ctx = browser.contexts()[0];
    if (ctx) {
      await desk.install(ctx);
      for (const p of ctx.pages()) await uiReal.attach(ctx, p, BUILD);
      ctx.on("page", (p) => { uiReal.attach(ctx, p, BUILD).catch(() => {}); });
    }
  } catch (e) {
    if (S.chrome.connected !== false || !S.lastError) log(`Chrome is not answering on port ${PORT} — open ultracursor from the Dock to start it`);
    S.chrome.connected = false;
    S.lastError = `Chrome not reachable on port ${PORT}`;
    browser = null;
  }
  return browser;
}

try {
  const { createTraderMode } = await import("./trader/inapp.mjs");
  trader = createTraderMode({ dir: process.env.ULTRA_TRADER_DIR, getBrowser: chrome, log: (l) => log(l) });
} catch (e) { log(`trader mode could not load: ${String(e && e.message || e).slice(0, 160)}`); }

/* ------------------------------------------------------------------ orders */

async function pollOrder() {
  const o = await cloud.get("order");
  const cmd = o && o.cmd;
  if (!cmd) return;
  log(`order: ${cmd}`);
  // The same three words reach the agent desk: one pause button for everything.
  if (cmd === "pause") { paused = true; desk.control("pause"); status({ state: "paused" }); }
  else if (cmd === "run") { paused = false; stopped = false; desk.control("resume"); status({ state: S.hunt && running ? "sweeping" : "idle" }); }
  else if (cmd === "stop") { stopped = true; stopSweep = true; paused = false; desk.control("stop"); status({ state: "stopped" }); }
  else if (cmd === "update") { updateNow = true; }
}

/** Waits while paused; true when the sweep must end. Checked between actions. */
const shouldStop = () => stopSweep || quitting;
async function gate() {
  while (paused && !stopSweep && !quitting) await sleep(200);
  return shouldStop();
}

/* ------------------------------------------------------------------ self-update */

let refusedBuild = null;
let refusedAt = 0;

async function download(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(t); }
}

async function checkRuntime() {
  const rt = await cloud.get("runtime");
  if (!rt || !rt.build || !rt.files || String(rt.build) === BUILD) return false;
  const want = String(rt.build);
  if (refusedBuild === want && Date.now() - refusedAt < 10 * 60000) return false;
  status({ state: "updating", phase: "update", step: `build ${want}` });
  log(`build ${want} is available (running ${BUILD}); downloading`);
  const next = path.join(WORK, ".next");
  try {
    fs.rmSync(next, { recursive: true, force: true });
    fs.mkdirSync(next, { recursive: true });
    const names = Object.keys(rt.files);
    if (!names.length) throw new Error("the runtime lists no files");
    for (const name of names) {
      if (name.includes("..") || path.isAbsolute(name)) throw new Error(`bad file name ${name}`);
      const buf = await download(rt.files[name]);
      if (!buf.length) throw new Error(`${name} is empty`);
      const dest = path.join(next, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      if (/\.(mjs|js)$/.test(name)) {
        try { execFileSync(process.execPath, ["--check", dest], { stdio: "pipe" }); }
        catch (e) { throw new Error(`${name} does not parse: ${String(e.stderr || e.message).split("\n").find((l) => /Error/.test(l)) || "syntax error"}`); }
      }
    }
    for (const name of names) {
      const dest = path.join(WORK, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(next, name), dest);
    }
    fs.writeFileSync(path.join(WORK, "build.txt"), want + "\n");
    fs.rmSync(next, { recursive: true, force: true });
    log(`build ${want} installed; restarting`);
    status({ phase: "restarting" }, false);
    await postStatus();
    await cloud.flush();
    process.exit(97);
  } catch (e) {
    fs.rmSync(next, { recursive: true, force: true });
    refusedBuild = want; refusedAt = Date.now();
    S.lastError = `update to build ${want} refused: ${e.message}`;
    log(S.lastError + `; staying on build ${BUILD}`);
    status({ state: running ? "sweeping" : stopped ? "stopped" : "idle", phase: running ? S.phase : "idle", step: "" });
    return false;
  }
}

/* ------------------------------------------------------------------ the sweep */

let running = false;

function uiFor() {
  const fastPause = () => sleep(60);
  return {
    attach: (c, p, b) => uiReal.attach(c, p, b ?? BUILD),
    say: (p, t) => { S.step = t; return uiReal.say(p, t); },
    hover: (p, t) => uiReal.hover(p, t),
    click: () => false, // read-only: readers never click
    scroll: (p, px) => uiReal.scroll(p, px),
    pause: async (a, b) => { await (FAST ? fastPause() : uiReal.pause(a, b)); await gate(); },
    highlight: (p, t) => uiReal.highlight(p, t),
  };
}

function signinFrom(src, r) {
  const key = { adlibrary: "facebook", tiktok: "tiktok", instagram: "instagram", trends: "google" }[src];
  if (!key || !r) return;
  if (r.blocked === "login" || r.blocked === "captcha") S.signin[key] = false;
  else if (!r.blocked || r.blocked === "empty") S.signin[key] = true;
}

async function sweep(hunt) {
  running = true;
  stopSweep = false;
  const startedAt = Date.now();
  const evidence = [];
  let goals = null;
  const skills = await cloud.get("skills");
  if (skills && skills.files && skills.files["goals.md"]) goals = parseGoals(skills.files["goals.md"]);

  const depth = Math.max(1, Math.min(10, Number(hunt.depth) || 5));
  const queries = (Array.isArray(hunt.terms) && hunt.terms.length ? hunt.terms.map((t) => String(t).toLowerCase().trim()).filter(Boolean) : queriesFrom(hunt.looking, [], depth)).slice(0, depth);
  S.hunt = { id: hunt.id, looking: hunt.looking };
  S.counts = { ads: 0, clips: 0, posts: 0, comments: 0, signals: 0, stores: 0 };
  const total = queries.length * 4 + 1;
  status({ state: paused ? "paused" : "sweeping", phase: "starting", step: `${queries.length} queries`, progress: { done: 0, total } });
  log(`hunt ${hunt.id}: "${hunt.looking}" -> ${queries.map((q) => `"${q}"`).join(", ") || "(no queries)"}`);

  let page = null;
  const blockedSites = new Set();
  try {
    const b = await chrome();
    if (!b) throw new Error("Chrome is not open");
    const context = b.contexts()[0] || (await b.newContext());
    page = await context.newPage();
    try { await page.bringToFront(); } catch { /* ignore */ }
    await uiReal.attach(context, page, BUILD);
    const ui = uiFor();
    const ctx = { ui, log, shouldStop, build: BUILD, limits: { clips: 3, posts: 2, comments: 40 } };
    const run = async (name, mod, input) => {
      if (await gate()) return null;
      if (blockedSites.has(name)) { S.progress.done++; return null; }
      status({ phase: name, step: `${name} · ${input}` });
      const r = await mod.sweep(page, input, ctx);
      evidence.push(r);
      signinFrom(name, r);
      if (r.blocked === "login" || r.blocked === "captcha") {
        blockedSites.add(name);
        log(`${name}: ${r.blocked} wall — skipped for the rest of this hunt`);
      }
      if (r.ads) S.counts.ads += r.ads.length;
      if (r.clips) { S.counts.clips += r.clips.length; S.counts.comments += r.clips.reduce((s, c) => s + (c.commentsRead || 0), 0); S.counts.signals += r.signalCount || 0; }
      if (r.posts) { S.counts.posts += r.posts.length; S.counts.comments += r.posts.reduce((s, p) => s + (p.commentsRead || 0), 0); S.counts.signals += r.signalCount || 0; }
      S.progress.done++;
      const social = ["adlibrary", "tiktok", "instagram"];
      if (social.every((s) => blockedSites.has(s))) status({ state: "waiting-signin" });
      else postStatus();
      return r;
    };
    for (const q of queries) {
      if (shouldStop()) break;
      await run("adlibrary", adlibrary, q);
      await run("tiktok", tiktok, q);
      await run("instagram", instagram, q);
      await run("trends", trends, q);
    }
    if (!shouldStop()) {
      const hrefs = evidence.filter((e) => e.source === "adlibrary").flatMap((e) => e.ads.map((a) => a.landing));
      const domains = stores.pickDomains(hrefs, 6);
      status({ phase: "stores", step: `${domains.length} stores` });
      const r = await stores.sweep(page, domains, ctx);
      evidence.push(r);
      S.counts.stores = r.stores.length;
      S.progress.done++;
    }
  } catch (e) {
    S.lastError = `sweep: ${String(e && e.message || e).split("\n")[0]}`;
    log(S.lastError);
  }
  const partial = shouldStop() || S.progress.done < S.progress.total;
  const report = buildReport({ hunt, goals, evidence, build: BUILD, startedAt, endedAt: Date.now(), partial });
  const ok = await cloud.report(hunt.id, report);
  log(ok ? `report posted for hunt ${hunt.id}: ${report.totals.ads} ads, ${report.totals.clips} clips, ${report.totals.posts} posts, ${report.totals.comments} comments, ${report.totals.signals} signals, ${report.totals.stores} stores${partial ? " (partial)" : ""}`
    : `report for hunt ${hunt.id} could not be posted: ${cloud.lastError}`);
  saved.lastReportAt = Date.now();
  saveState(saved);
  if (page) { try { await page.close(); } catch { /* ignore */ } }
  running = false;
  stopSweep = false;
  status({ state: stopped ? "stopped" : paused ? "paused" : "idle", phase: "done", step: partial ? "partial report posted" : "report posted" });
  return report;
}

/* ------------------------------------------------------------------ the loop */

async function main() {
  log(`ultracursor build ${BUILD} starting (control plane ${cloud.base.replace(/\/research\/.+$/, "/research/…")})`);
  status({ state: "idle", phase: "starting" });
  await chrome();
  let lastStatus = 0, lastHunt = 0, lastRuntime = 0;
  const orderLoop = setInterval(() => { if (!quitting) pollOrder().catch(() => {}); }, 2000);
  if (orderLoop.unref) orderLoop.unref();
  await checkRuntime();
  lastRuntime = Date.now();
  while (!quitting) {
    const now = Date.now();
    // Never restart for an update in the middle of a task: it waits until the task ends.
    if (!agentRun && (updateNow || now - lastRuntime > 60000)) { updateNow = false; lastRuntime = now; await checkRuntime(); }
    if (now - lastStatus > 5000) {
      lastStatus = now;
      if (!running) await chrome();
      await postStatus();
    }
    if (!running && !agentRun && !stopped && now - lastHunt > 5000) {
      lastHunt = now;
      const hunt = await cloud.get("hunt");
      if (hunt && hunt.id && hunt.id !== saved.lastHuntId) {
        saved.lastHuntId = hunt.id;
        saveState(saved);
        if (/^\s*task\s*:/i.test(String(hunt.looking || ""))) {
          const text = String(hunt.looking).replace(/^\s*task\s*:\s*/i, "").trim();
          const urls = (Array.isArray(hunt.terms) ? hunt.terms : []).filter((t) => /^https?:\/\//i.test(String(t)));
          const files = await fetchTaskFiles(hunt.id, urls);
          log(`task from Claude (hunt ${hunt.id}): ${text.slice(0, 160)}${files.length ? ` with ${files.length} photo(s)` : ""}`);
          desk.enqueue({ id: hunt.id, huntId: hunt.id, text, files, source: "cloud" });
        } else {
          await sweep(hunt);
        }
        lastStatus = 0;
      }
    }
    // Trader mode: follow the panel pill / cloud flag (never blocks this loop).
    if (trader) trader.tick(now).catch((e) => log(`trader: ${String(e && e.message || e).slice(0, 160)}`));
    // The link: a heartbeat Claude can see, and Claude's commands.
    if (link && now - lastBeat > 5000) {
      lastBeat = now;
      const a = desk.state();
      let url = "", title = "";
      try { const ctx = browser && browser.contexts()[0]; const p = ctx && ctx.pages().slice(-1)[0]; if (p) { url = p.url(); title = await p.title(); } } catch { /* fine */ }
      link.heartbeat({ build: BUILD, chrome: S.chrome.connected, url, title, mode: a.mode, status: a.status, trader: trader ? trader.state() : null, card: a.card ? { kind: a.card.kind, title: a.card.title, lines: a.card.lines } : null }).catch(() => {});
    }
    if (link && !running && !agentRun && !desk.hasWork() && now - lastTake > 1000) {
      lastTake = now;
      const cmd = await link.take();
      if (cmd && cmd.id) {
        const task = { id: `link${Date.now().toString(36)}`, text: "Claude is driving through the link (commands from the chat)", files: [], source: "link" };
        task.brain = link.brain(cmd, task);
        desk.enqueue(task);
      }
    }
    // One agent task at a time, never during a sweep. It runs beside this
    // loop so status, orders and the panel keep answering while it works.
    if (!running && !agentRun && desk.hasWork()) {
      const b = await chrome();
      const ctx = b && b.contexts()[0];
      if (ctx) {
        agentRun = desk.runNext(ctx)
          .catch((e) => log(`task crashed: ${String(e && e.stack || e).slice(0, 300)}`))
          .finally(() => { agentRun = null; lastStatus = 0; });
      }
    }
    await sleep(500);
  }
}

async function quit(code = 0) {
  if (quitting) return;
  quitting = true;
  stopSweep = true;
  try { if (trader) await trader.stop(); } catch { /* ignore */ }
  try { S.state = "stopped"; await postStatus(); await cloud.flush(); } catch { /* ignore */ }
  process.exit(code);
}
process.on("SIGTERM", () => quit(0));
process.on("SIGINT", () => quit(0));
process.on("unhandledRejection", (e) => { S.lastError = `unhandled: ${String(e && e.message || e)}`; log(S.lastError); });

main().catch(async (e) => { S.lastError = String(e && e.stack || e); log(`runner crashed: ${S.lastError}`); await quit(1); });
