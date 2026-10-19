/*
 * The whole runner, end to end, the way it runs on his Mac.
 *
 * A real Chromium is started on its own with a DevTools port (his Chrome on
 * 9333); the runner is a child process started from a copy of src/ (the WORK
 * folder), pointed at the stub control plane and the fixture sites. Then:
 *
 *   1. it posts status with its build and Chrome connected
 *   2. a hunt (two queries) -> Ad Library, TikTok (network + DOM comments),
 *      Instagram (one tag behind a login wall), Trends, a Shopify-like store
 *      -> a report with the right numbers; the overlay cursor moved and the
 *      pill text changed while it worked
 *   3. log posts are batched (<= 20 lines, never two at once)
 *   4. pause holds the sweep, run resumes it, stop ends it with a partial report
 *   5. after a restart the same hunt is not run again
 *   6. self-update: a build with a syntax error is refused and the runner keeps
 *      going; a good build is downloaded, installed and the runner exits 97
 *
 *   TMPDIR=/tmp node test/e2e.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startStub, KEY } from "./stub-cloud.mjs";
import { startSites, COMMENTS } from "./fixtures/sites.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "../src");
const require = createRequire(import.meta.url);
const PW = fs.existsSync("/home/user/sculps-store/node_modules/playwright-core")
  ? "/home/user/sculps-store/node_modules/playwright-core"
  : path.resolve(HERE, "../../../node_modules/playwright-core");
const { chromium } = require(PW);
const CHROME = process.env.ULTRA_TEST_CHROMIUM || "/opt/pw-browsers/chromium";

const KILL = setTimeout(() => { console.log("FAIL  e2e timed out after 420 s"); cleanup(1); }, 420000);

let failed = 0, passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}${detail === undefined ? "" : `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}`}`); }
  return Boolean(cond);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, every = 200) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(every); }
  return null;
}
const listen = (server) => new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)));

/* ------------------------------------------------------------------ setup */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "uc-e2e-"));
const WORK = path.join(tmp, "Application Support", "ultracursor", "runtime");
fs.mkdirSync(WORK, { recursive: true });
fs.cpSync(SRC, WORK, { recursive: true });
fs.mkdirSync(path.join(WORK, "node_modules"), { recursive: true });
fs.symlinkSync(PW, path.join(WORK, "node_modules", "playwright-core"));

const stub = startStub();
const stubPort = await listen(stub.server);
const { server: sites, store } = startSites(0);
const storePort = await listen(store);
// The ad cards point at the store's port, which is only known now.
sites.close();
const { server: sites2 } = startSites(storePort);
const sitePort = await listen(sites2);
const S = `http://127.0.0.1:${sitePort}`;

const CDP = 9500 + Math.floor(Math.random() * 300);
const chromeProc = spawn(CHROME, [
  "--headless=new", "--no-sandbox", "--no-proxy-server", `--remote-debugging-port=${CDP}`, `--user-data-dir=${path.join(tmp, "profile")}`,
  "--no-first-run", "--no-default-browser-check", "--window-size=1280,860", "about:blank",
], { stdio: "ignore" });
await until(async () => { try { return (await fetch(`http://127.0.0.1:${CDP}/json/version`)).ok; } catch { return false; } }, 20000);

const ENV = {
  ...process.env,
  ULTRA_BUILD: "1",
  ULTRA_CLOUD: `http://127.0.0.1:${stubPort}/research/${KEY}`,
  ULTRA_CDP_PORT: String(CDP),
  ULTRA_FAST: "1",
  ULTRA_SITE_ADLIBRARY: `${S}/fb`,
  ULTRA_SITE_TIKTOK: `${S}/tt`,
  ULTRA_SITE_INSTAGRAM: `${S}/ig`,
  ULTRA_SITE_TRENDS: `${S}/gt`,
  ULTRA_STORE_PROTO: "http",
};
let runner = null;
let runnerOut = "";
let runnerExit = null;
function startRunner(extraEnv = {}) {
  runnerExit = null;
  runner = spawn(process.execPath, ["ultra.mjs"], { cwd: WORK, env: { ...ENV, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
  runner.stdout.on("data", (d) => { runnerOut += d; });
  runner.stderr.on("data", (d) => { runnerOut += d; });
  runner.on("exit", (code) => { runnerExit = code; });
}
async function stopRunner() {
  if (!runner || runnerExit !== null) return;
  runner.kill("SIGTERM");
  await until(() => runnerExit !== null, 8000);
}
function cleanup(code) {
  try { runner && runner.kill("SIGKILL"); } catch {}
  try { chromeProc.kill("SIGKILL"); } catch {}
  try { stub.server.close(); sites2.close(); store.close(); } catch {}
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  clearTimeout(KILL);
  process.exit(code);
}

/* The overlay as Alex would see it: sampled from the test's own CDP connection. */
const watcher = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`);
const seenTips = new Set();
const seenPills = new Set();
let sampling = true;
(async () => {
  while (sampling) {
    for (const ctx of watcher.contexts()) for (const p of ctx.pages()) {
      try {
        const st = await p.evaluate(() => (window.__uc ? window.__uc.state() : null));
        if (st && st.tip) seenTips.add(`${Math.round(st.tip.x)},${Math.round(st.tip.y)}`);
        if (st && st.status) seenPills.add(st.status);
      } catch { /* navigating */ }
    }
    await sleep(150);
  }
})();

/* ------------------------------------------------------------------ 1. start */

console.log("== start");
startRunner();
const firstStatus = await until(() => stub.statuses.find((s) => s.chrome && s.chrome.connected), 20000);
// This runtime has only playwright-core (no Claude SDK): research must still run.
check("research runs even when the agent cannot load (no Claude SDK here)", Boolean(await until(() => stub.logs.find((l) => /the agent could not start/.test(l)), 15000)), stub.logs.slice(0, 5));
check("status posted with build 1 and Chrome connected", firstStatus && firstStatus.build === "1" && firstStatus.app === "ultracursor", firstStatus || runnerOut.slice(-800));

/* ------------------------------------------------------------------ 2. a full hunt */

console.log("== hunt");
stub.set("skills", { files: { "goals.md": "budget: 500\ndaily_target: 10\nniches: beauty, gifts\nnever: weapons\ncurrency: USD\n" } });
stub.set("hunt", { id: "h1", looking: "heatless curlers", terms: ["heatless curlers", "sticker printer"], depth: 2, targetPerDay: 10 });
const sweepingSeen = await until(() => stub.statuses.find((s) => s.state === "sweeping" && s.hunt && s.hunt.id === "h1"), 20000);
check("status says sweeping hunt h1", Boolean(sweepingSeen));
const r1 = await until(() => stub.reports.find((r) => r.id === "h1"), 180000, 500);
check("report posted for h1", Boolean(r1), runnerOut.slice(-1500));
if (r1) {
  const rep = r1.report;
  const q1 = rep.perQuery.find((p) => p.query === "heatless curlers");
  const q2 = rep.perQuery.find((p) => p.query === "sticker printer");
  check("report not partial, build 1, goals parsed", rep.partial === false && rep.build === "1" && rep.goals.budget === 500 && rep.goals.niches.join() === "beauty,gifts", { partial: rep.partial, build: rep.build, goals: rep.goals });
  check("Ad Library: 3 ads, 2 advertisers, longest 45 days per query", q1 && q1.ads.count === 3 && q1.ads.advertisers === 2 && q1.ads.longestDays === 45 && q1.ads.longRunners === 1, q1 && q1.ads);
  check("Ad Library: European date read (12 days)", q1 && q1.ads.top.some((a) => a.days === 12 && /^\d{4}-\d\d-\d\d$/.test(a.startedOn)), q1 && q1.ads.top);
  check("TikTok: 4 clips, best views from page JSON 1,250,000", q1 && q1.tiktok.clips === 4 && q1.tiktok.bestViews === 1250000, q1 && q1.tiktok);
  const ttComments = COMMENTS.network.length + COMMENTS.dom.length * 2;
  check(`TikTok: comments read via network and DOM (${ttComments})`, q1 && q1.tiktok.comments === ttComments, q1 && q1.tiktok.comments);
  // network: where, price, bought, where(need the link), want = 5; dom x2: gift, want, where, price = 4 each
  check("TikTok: buying signals counted (13) and kinds split", q1 && q1.tiktok.signals === 13 && q1.tiktok.kinds.where === 4 && q1.tiktok.kinds.gift === 2, q1 && { s: q1.tiktok.signals, k: q1.tiktok.kinds, top: q1.tiktok.topSignals });
  check("Instagram: 2 posts, 12 comments, 6 signals for query 1", q1 && q1.instagram.posts === 2 && q1.instagram.comments === 12 && q1.instagram.signals === 6, q1 && q1.instagram);
  check("Instagram login wall on query 2 reported, not crashed", q2 && q2.instagram.posts === 0 && rep.blocked.some((b) => b.source === "instagram" && b.reason === "login"), rep.blocked);
  check("Trends: 52 weeks, growth4w +50%, yoy +88%", q1 && q1.trends.weeks === 52 && q1.trends.growth4w === 50 && q1.trends.yoy === 88, q1 && q1.trends);
  const st = rep.stores[0];
  check("store: Shopify, 3 products, $9-$39.98, 2 offers, free shipping over $35", rep.stores.length === 1 && st.shopify && st.products === 3 && st.priceMin === 9 && st.priceMax === 39.98 && st.offers.length === 2 && st.freeShippingOver === 35, rep.stores);
  check("amazon landing skipped as a marketplace", rep.stores.every((s) => !/amazon/.test(s.domain)));
  check("Q4 block present with day counts", rep.q4 && typeof rep.q4.daysTo.christmas === "number" && rep.q4.christmas === "2026-12-25", rep.q4);
  check("totals add up", rep.totals.ads === 6 && rep.totals.clips === 8 && rep.totals.posts === 2 && rep.totals.signals === 26 + 6 && rep.totals.stores === 1, rep.totals);
  check("old report page shape kept (candidates, seen)", Array.isArray(rep.candidates) && rep.candidates.length === 2 && rep.seen.candidates === 2 && rep.best === null);
}
const signin = stub.statuses.filter((s) => s.signin).pop()?.signin;
check("signin map: facebook/tiktok/google true, instagram false", signin && signin.facebook === true && signin.tiktok === true && signin.google === true && signin.instagram === false, signin);
check("overlay cursor moved (many positions seen)", seenTips.size >= 10, seenTips.size);
check("pill text changed with the work", [...seenPills].some((t) => /TikTok/.test(t)) && [...seenPills].some((t) => /Ad Library/.test(t)) && seenPills.size >= 5, [...seenPills].slice(0, 12));

await sleep(3500);
const ls = stub.logStats;
check("logs batched: <= 20 lines per POST, never two POSTs at once", ls.posts > 0 && ls.maxLines <= 20 && ls.maxConcurrent === 1, ls);
check("log lines say what was read", stub.logs.some((l) => /Ad Library "heatless curlers": 3 ads/.test(l)) && stub.logs.some((l) => /Instagram wants a sign-in/.test(l)), stub.logs.slice(-10));

/* ------------------------------------------------------------------ 4. pause / run / stop */

console.log("== pause / run / stop");
stub.set("hunt", { id: "h2", looking: "x", terms: ["heatless curlers", "satin curler", "curl rod"], depth: 3 });
await until(() => stub.statuses.find((s) => s.hunt && s.hunt.id === "h2" && s.progress && s.progress.done >= 1), 30000);
stub.set("order", { cmd: "pause" });
const pausedAt = await until(() => stub.statuses.find((s) => s.state === "paused" && s.hunt && s.hunt.id === "h2"), 6000);
check("pause: status says paused within a few seconds", Boolean(pausedAt));
await sleep(1500);
const doneA = stub.statuses.filter((s) => s.hunt && s.hunt.id === "h2").pop()?.progress?.done;
await sleep(4000);
const doneB = stub.statuses.filter((s) => s.hunt && s.hunt.id === "h2").pop()?.progress?.done;
check("pause holds the sweep (no progress for 4 s)", doneA !== undefined && doneA === doneB, { doneA, doneB });
stub.set("order", { cmd: "run" });
const resumed = await until(() => { const d = stub.statuses.filter((s) => s.hunt && s.hunt.id === "h2").pop()?.progress?.done; return d > doneB ? d : null; }, 20000);
check("run resumes it", Boolean(resumed));
stub.set("order", { cmd: "stop" });
const r2 = await until(() => stub.reports.find((r) => r.id === "h2"), 30000);
check("stop ends it with a partial report", r2 && r2.report.partial === true, r2 && { partial: r2.report.partial, notes: r2.report.notes });
check("status says stopped", Boolean(await until(() => stub.statuses.slice(-3).some((s) => s.state === "stopped"), 8000)));

/* ------------------------------------------------------------------ 5. restart: no re-run */

console.log("== restart");
await stopRunner();
check("runner stops cleanly on SIGTERM", runnerExit === 0, runnerExit);
const reportsBefore = stub.reports.length;
const huntGets = () => stub.calls.filter((c) => c.what === "hunt").length;
startRunner();
const g0 = huntGets();
await until(() => huntGets() >= g0 + 2, 20000);
await sleep(2000);
check("hunt h2 is not run again after a restart", stub.reports.length === reportsBefore && !stub.statuses.slice(-5).some((s) => s.state === "sweeping"), { reports: stub.reports.length, before: reportsBefore });

/* ------------------------------------------------------------------ 6. self-update */

console.log("== self-update");
const base = `http://127.0.0.1:${stubPort}/files`;
stub.files["broken-ultra.mjs"] = "export const = ;\n";
stub.set("runtime", { build: "2", files: { "ultra.mjs": `${base}/broken-ultra.mjs` } });
stub.set("order", { cmd: "update" });
const refused = await until(() => stub.logs.find((l) => /update to build 2 refused/.test(l)), 15000);
check("a build that does not parse is refused", Boolean(refused), stub.logs.slice(-5));
await sleep(2500);
check("…and the runner keeps going on build 1", runnerExit === null && fs.readFileSync(path.join(WORK, "ultra.mjs"), "utf8").includes("ultracursor's runner") && !fs.existsSync(path.join(WORK, "build.txt")), { exit: runnerExit });
stub.files["good-ultra.mjs"] = fs.readFileSync(path.join(SRC, "ultra.mjs"), "utf8") + "\n// build 3\n";
stub.files["good-tiktok.mjs"] = fs.readFileSync(path.join(SRC, "sites/tiktok.mjs"), "utf8") + "\n// build 3\n";
stub.set("runtime", { build: "3", files: { "ultra.mjs": `${base}/good-ultra.mjs`, "sites/tiktok.mjs": `${base}/good-tiktok.mjs` } });
stub.set("order", { cmd: "update" });
await until(() => runnerExit !== null, 20000);
check("a good build is installed and the runner exits 97", runnerExit === 97, { exit: runnerExit, out: runnerOut.slice(-600) });
check("build.txt says 3 and the new files are in place", fs.readFileSync(path.join(WORK, "build.txt"), "utf8").trim() === "3"
  && fs.readFileSync(path.join(WORK, "ultra.mjs"), "utf8").endsWith("// build 3\n")
  && fs.readFileSync(path.join(WORK, "sites/tiktok.mjs"), "utf8").endsWith("// build 3\n") && !fs.existsSync(path.join(WORK, ".next")));
// What run.command does next: start it again with the new number.
startRunner({ ULTRA_BUILD: "3" });
const s3 = await until(() => stub.statuses.find((s) => s.build === "3"), 15000);
check("the restarted runner reports build 3", Boolean(s3));
await stopRunner();

sampling = false;
await sleep(300);
try { await watcher.close(); } catch {}
console.log(`\n${passed} passed, ${failed} failed`);
cleanup(failed ? 1 : 0);
