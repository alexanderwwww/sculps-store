/**
 * The whole worker, booted for real: its own Chrome, the cloud stubbed, the
 * UI opened in a second browser. Three boots on one Chrome:
 *   1. nothing signed in → setup, three cards, live frames, connect → waiting
 *   2. an "update" order → files written, BUILD advanced, exit 75
 *   3. cookies say tiktok is signed in → straight to working, build 2, grid
 */
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, cp, readFile, writeFile, access } from "node:fs/promises";
import { chromium } from "playwright";
import { check, failures, until, sleep } from "./lib.mjs";
import { cloudStub } from "./_cloud-stub.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const HOME = "/tmp/claude-0/organic-test-5";
const WORKER = join(HOME, "worker");
const CDP = 9465;
const EXE = process.env.OX_CHROME;
const guard = setTimeout(() => { console.log("HARD STOP"); process.exit(9); }, 240000);

execSync(`rm -rf ${HOME}; fuser -k ${CDP}/tcp 2>/dev/null || true`);
await mkdir(WORKER, { recursive: true });
await cp(join(here, "..", "worker"), WORKER, { recursive: true });
// The other agents' modules are stubbed here: this test is main's wiring, not their page reading.
const exists = (p) => access(p).then(() => true, () => false);
for (const name of ["accounts.mjs", "market.mjs", "store.mjs", "discover.mjs"]) await cp(join(here, "_stubs", name), join(WORKER, name));
for (const name of ["human.mjs", "score.mjs"]) if (!(await exists(join(WORKER, name)))) await cp(join(here, "..", "..", "organicx", name), join(WORKER, name));
if (!(await exists(join(WORKER, "node_modules")))) execSync(`ln -s ${join(here, "..", "..", "..", "node_modules")} ${join(WORKER, "node_modules")}`);

let pendingOrder = null;
const cloud = await cloudStub({
  order: () => { const o = pendingOrder; pendingOrder = null; return o; },
  runtime: () => ({ build: 2, files: { "ui/index.html": "<!doctype html><title>Organic</title><body>updated ui", "skills/hello.md": "# hi", "../evil.mjs": "nope", "notes.txt": "nope" } }),
  brief: () => ({ store: "Test Store", storeUrl: "https://store.test/", products: ["Widget"], market: ["widget deal"], platforms: ["instagram", "tiktok", "youtube"], notes: "#widgets" }),
});

function boot(extraEnv = {}) {
  const child = spawn(process.execPath, ["main.mjs"], {
    cwd: WORKER, stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ORGANIC_HOME: HOME, ORGANIC_CLOUD: cloud.base, ORGANIC_CDP_PORT: String(CDP), ORGANIC_PORT: "", ORGANIC_STUB_SIGNEDIN: "", ...extraEnv },
  });
  let out = "", err = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { err += d; });
  return { child, out: () => out, err: () => err, port: () => { const m = /^PORT (\d+)\n/.exec(out); return m ? Number(m[1]) : null; }, exit: () => new Promise((r) => child.once("exit", r)) };
}

const ui = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });

/* ---------------------------------------------------------------- boot 1 */
let w = boot();
let port = await until(w.port, 20000);
check("boot 1: PORT is the first stdout line", Boolean(port), JSON.stringify(w.out().slice(0, 30)));
const page = await ui.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`http://127.0.0.1:${port}/`);
await until(() => page.evaluate(() => window.__organic?.phase === "setup").catch(() => false), 60000);
check("boot 1: the worker reaches setup", await page.evaluate(() => window.__organic.phase) === "setup");
const cards = await page.$$("#cards .card");
check("three cards render", cards.length === 3);
const names = await page.$$eval("#cards .card .name", (els) => els.map((e) => e.textContent));
check("Instagram, TikTok, YouTube", names.join(",") === "Instagram,TikTok,YouTube", names.join(","));
check("YouTube says optional", (await page.$eval("#cards .card:nth-child(3) .meta", (e) => e.textContent)) === "optional");
check("OK is disabled with nothing connected", await page.$eval("#ok", (b) => b.disabled));
check("the canvas is white", (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(255, 255, 255)");

const withSrc = await until(() => page.$$eval("#cards .card .screen img", (els) => els.filter((i) => i.src.startsWith("data:image/jpeg;base64,")).length).catch(() => 0), 30000);
check("a frame img gets a src", withSrc >= 1, String(withSrc));

// Connect → the card goes to waiting; the screen becomes big and interactive.
await page.click("#cards .card:nth-child(2) .connect");
const waiting = await until(() => page.$eval("#cards .card:nth-child(2) .dot", (e) => e.classList.contains("waiting")).catch(() => false), 10000);
check("connect marks the card waiting", Boolean(waiting));
check("the screen is focused (big)", await page.$eval("#focus", (e) => e.classList.contains("on")));
const stageBox = await page.$eval("#stage", (e) => e.getBoundingClientRect().width);
check("the focused stage fills the window", stageBox > 900, String(stageBox));
await page.keyboard.press("Escape");
check("Escape returns to the cards", !(await page.$eval("#focus", (e) => e.classList.contains("on"))));

// 1000×700 still shows three cards across.
await page.setViewportSize({ width: 1000, height: 700 });
await sleep(200);
const tops = await page.$$eval("#cards .card", (els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
const okVisible = await page.$eval("#ok", (b) => { const r = b.getBoundingClientRect(); return r.bottom <= innerHeight && r.top > 0; });
check("at 1000x700 the cards sit in one row and OK is on screen", new Set(tops).size === 1 && okVisible, `${tops.join(",")} ok=${okVisible}`);
await page.setViewportSize({ width: 1280, height: 800 });

// ok with nothing connected does not flip.
await page.evaluate(() => { const ws = new WebSocket("ws://" + location.host + "/ws"); ws.onopen = () => ws.send(JSON.stringify({ t: "ok" })); });
await sleep(800);
check("ok without a connection stays in setup", await page.evaluate(() => window.__organic.phase) === "setup");
const dbOps = cloud.calls.map((c) => c.op);
check("nothing was recorded as connected", !dbOps.includes("markConnected"));
check("the cloud got status and log", cloud.statuses.length >= 1 && cloud.logs.some((l) => /build 1 is up/.test(l.what)));

/* ---------------------------------------------------------------- boot 2: update */
pendingOrder = { cmd: "update" };
const code = await Promise.race([w.exit(), sleep(30000).then(() => "timeout")]);
check("an update order exits 75", code === 75, String(code));
check("BUILD advanced on disk", (await readFile(join(WORKER, "BUILD"), "utf8")).trim() === "2");
check("ui/index.html was replaced", (await readFile(join(WORKER, "ui", "index.html"), "utf8")).includes("updated ui"));
check("skills/hello.md was written", await exists(join(WORKER, "skills", "hello.md")));
check("bad names were refused", !(await exists(join(HOME, "evil.mjs"))) && !(await exists(join(WORKER, "notes.txt"))));
const toast = await until(() => page.$eval("#toast", (e) => e.classList.contains("on") ? e.textContent : null).catch(() => null), 5000);
check("the window shows updating…", Boolean(toast) && /updating/.test(toast), String(toast));
// Put the real UI back for the next boot (the stub UI proved the write).
await cp(join(here, "..", "worker", "ui", "index.html"), join(WORKER, "ui", "index.html"));

/* ---------------------------------------------------------------- boot 3: already signed in */
w = boot({ ORGANIC_PORT: String(port), ORGANIC_STUB_SIGNEDIN: "tiktok:@tester" });
const port3 = await until(w.port, 20000);
check("boot 3 binds the same ORGANIC_PORT", port3 === port, `${port3} vs ${port}`);
await until(() => page.evaluate(() => window.__organic?.phase === "working").catch(() => false), 60000);
check("the window reconnected on its own and is working", await page.evaluate(() => window.__organic.phase) === "working");
check("build 2 is what runs now", await page.evaluate(() => window.__organic.build) === 2);
check("tiktok shows its handle", await page.evaluate(() => window.__organic.screens.tiktok.handle) === "@tester");
const ops3 = cloud.calls.map((c) => c.op);
check("markConnected was recorded", ops3.includes("markConnected"));
check("chrome was attached to, not reopened", /chrome was already open/.test(w.err()));
const tilesShown = await page.$$eval("#grid > .tile", (els) => els.filter((e) => e.style.display !== "none").map((e) => e.id || e.querySelector(".name")?.textContent));
check("the grid has instagram, tiktok, market and the ticker", tilesShown.join(",") === "Instagram,TikTok,Market,tickerTile", tilesShown.join(","));
check("the pill is up", await page.$eval("#pill", (e) => e.classList.contains("on")));
const productFinding = await until(() => cloud.calls.find((c) => c.op === "saveFinding" && c.args?.finding?.kind === "product"), 30000);
check("the store was read first and its product saved", Boolean(productFinding) && productFinding.args.finding.title === "Stub Widget");
check("reyna said she was looking at what we sell", cloud.logs.some((l) => l.who === "Reyna" && /looking at what we sell/.test(l.what)));
const finding = await until(() => cloud.calls.find((c) => c.op === "saveFinding" && c.args?.finding?.kind === "ad"), 30000);
check("the ad query came from the store product", cloud.calls.some((c) => c.op === "saveFinding" && c.args?.finding?.kind === "ad" && c.args.finding.query === "Stub Widget"));
const plan = await until(() => page.evaluate(() => window.__organic.plan.length ? window.__organic.plan : null).catch(() => null), 10000);
check("a plan arrived and the market sweep is in it", Array.isArray(plan) && plan.some((j) => /ad library/.test(j.what) && j.who === "Reyna"), JSON.stringify((plan ?? []).map((j) => j.what)));
const look = await until(() => page.evaluate(() => window.__organic.plan.find((j) => /@tester/.test(j.what) && /look around/.test(j.what)) || null).catch(() => null), 20000);
check("the look-around is a job for @tester", Boolean(look), JSON.stringify((plan ?? []).map((j) => j.what + ":" + j.state)));
check("the plan is drawn in the ticker tile", (await page.$$eval("#tickerTile .job", (els) => els.length)) >= 1);
check("market research saved an ad finding", Boolean(finding) && finding.args.finding.who === "Stub Co");
check("…and a seller", cloud.calls.some((c) => c.op === "saveFinding" && c.args?.finding?.kind === "seller"));
const cursorSeen = await until(() => page.$$eval("#grid .tile .cur", (els) => els.some((e) => e.classList.contains("on"))).catch(() => false), 20000);
check("a crew cursor is drawn on a tile", Boolean(cursorSeen));
check("the ticker has lines", (await page.$$eval("#tickerTile .line", (els) => els.length)) >= 1);
// The persona and first look-around: bea speaks for @tester.
const bea = await until(() => cloud.logs.find((l) => l.who === "Bea" && /@tester — a first look around/.test(l.what)), 30000);
check("the first session starts as a look around", Boolean(bea) && /first look around/.test(bea.what), bea?.what);
const remembered = await until(() => cloud.calls.find((c) => c.op === "remember" && c.args?.scope === "discovery"), 120000);
check("a tag pass discovered tags for the next sweep", Boolean(remembered) && remembered.args.evidence?.tag === "discoveredtag", JSON.stringify(remembered?.args));
check("clips from the pass were saved", cloud.calls.some((c) => c.op === "saveClip") && cloud.calls.some((c) => c.op === "saveFinding" && c.args?.finding?.kind === "clip"));
const moves = await page.evaluate(() => window.__organic.cursorMoves || 0);
check("the crew cursor moved many times (real mouse glides)", moves >= 8, String(moves));

// Connect a platform from the brief after setup: YouTube was closed at OK; the pill offers it, and the worker opens it again.
check("youtube is not a tile while not connected", (await page.$$eval("#grid > .tile", (els) => els.filter((e) => e.style.display !== "none").length)) === 4);
const ytBtn = (await page.$$("#pillDots button.can")).at(-1);
check("the pill offers to connect the brief's missing platform", Boolean(ytBtn) && /YouTube/.test(await ytBtn.evaluate((b) => b.title)), ytBtn ? await ytBtn.evaluate((b) => b.title) : "none");
await ytBtn.click();
const ytWaiting = await until(() => page.evaluate(() => window.__organic.screens.youtube.state === "waiting").catch(() => false), 15000);
check("connect while working marks youtube waiting", Boolean(ytWaiting));
check("...and the screen is focused for the sign-in", await page.$eval("#focus", (e) => e.classList.contains("on")));
await page.keyboard.press("Escape");
check("Escape returns to the grid", !(await page.$eval("#focus", (e) => e.classList.contains("on"))));
{
  const peek = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`);
  const live = peek.contexts()[0].pages().filter((p) => !p.isClosed());
  check("four pages, no strays (instagram, tiktok, market, youtube)", live.length === 4, live.map((p) => p.url()).join(" "));
  await peek.close();
}
await sleep(3500);
check("a waiting screen is polled while working (still waiting, not connected)", await page.evaluate(() => window.__organic.screens.youtube.state) === "waiting");

w.child.stdin.end();
const code3 = await Promise.race([w.exit(), sleep(15000).then(() => "timeout")]);
check("stdin closing ends boot 3 cleanly", code3 === 0, String(code3));

clearTimeout(guard);
await ui.close();
await cloud.close();
execSync(`fuser -k ${CDP}/tcp 2>/dev/null || true`);
console.log(failures() ? `\n${failures()} FAILED` : "\nall passed");
process.exit(failures() ? 1 : 0);
