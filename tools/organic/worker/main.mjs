/**
 * Organic — the worker.
 *
 * Started by the launcher, it opens its own headless Chrome, shows the
 * window live pictures of the pages in it, lets Alex sign in through those
 * pictures, and then runs the crew: market research on the market screen,
 * human-paced sessions on each connected account, everything logged to the
 * control plane. It updates itself from the runtime slot and exits 75 so the
 * launcher restarts it; Chrome and the window both survive that.
 *
 * stdout carries exactly one line ("PORT n"). Everything said goes through
 * say() → ticker, cloud log, stderr.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { openChrome, ask, sleep } from "./chrome.mjs";
import { Screens, HOME, LOGIN } from "./screens.mjs";
import { startServer } from "./server.mjs";
import { connectCloud } from "./cloud.mjs";
import { say, onSay, recent, nameOf } from "./crew.mjs";
import * as accounts from "./accounts.mjs";
import * as market from "./market.mjs";
import * as store from "./store.mjs";
import * as discover from "./discover.mjs";
import { isAwake, planDay, scatterAcrossDay, watchMs, react, dayBudget, scrollPauseMs, shouldRest, between, around, chance, pick, frictionIn } from "./human.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/** The build this file was written as. What is RUNNING may be newer — see running(). */
export const BUILD = 2;

const SUPPORT = process.env.ORGANIC_HOME || join(homedir(), "Library", "Application Support", "Organic");
export const PATHS = {
  home: SUPPORT,
  chrome: join(SUPPORT, "chrome"),
  worker: join(SUPPORT, "worker"),
  log: join(SUPPORT, "log"),
};

/** The build on disk is the truth: a push writes BUILD beside the files it replaces. */
async function running() {
  try {
    const n = Number((await readFile(join(PATHS.worker, "BUILD"), "utf8")).trim());
    return Number.isFinite(n) && n > 0 ? n : BUILD;
  } catch {
    return BUILD;
  }
}

const PLATFORMS = ["instagram", "tiktok", "youtube"];
const CDP_PORT = Number(process.env.ORGANIC_CDP_PORT) || 9444;

/* ---------------------------------------------------------------- state */

const S = {
  phase: "setup",
  paused: false,
  stopped: false,
  build: BUILD,
  brief: null,
  screens: Object.fromEntries(
    [...PLATFORMS, "market"].map((id) => [id, { id, platform: id, state: "none", handle: null, accountId: null, since: 0 }]),
  ),
  doing: "starting",
};

let cloud, server, browser, chromeChild, screens;
/** The last picture of each screen, so a window that opens late is not blank until something repaints. */
const lastFrame = {};
let quitting = false;

function stateMsg() {
  return {
    t: "state",
    phase: S.phase,
    build: S.build,
    paused: S.paused,
    stopped: S.stopped,
    screens: Object.values(S.screens).map(({ id, platform, state, handle }) => ({ id, platform, state, handle })),
    brief: S.brief,
    // Where Claude plugs in. Shown in the window so it is never hunted for.
    mcp: (cloud?.base ?? "") + "/mcp",
  };
}
const pushState = () => server?.broadcast(stateMsg());

function setScreen(id, state, handle) {
  const sc = S.screens[id];
  if (!sc) return;
  if (sc.state !== state || (handle !== undefined && sc.handle !== handle)) {
    sc.state = state;
    if (handle !== undefined) sc.handle = handle;
    sc.since = Date.now();
    pushState();
  }
}
const connectedIds = () => PLATFORMS.filter((p) => S.screens[p].state === "connected");

/* ----------------------------------------------------------- the cloud */

async function report() {
  await cloud.status({
    state: S.stopped ? "stopped" : S.paused ? "paused" : S.phase,
    doing: S.doing,
    build: S.build,
    at: Date.now(),
    screens: stateMsg().screens,
    tail: recent.slice(-18).map((l) => `${l.who} · ${l.what}`),
  }).catch(() => {});
}

async function readBrief() {
  const b = await cloud.brief().catch(() => null);
  const next = b && (Array.isArray(b.products) || b.store) ? b : null;
  const changed = JSON.stringify(next) !== JSON.stringify(S.brief);
  S.brief = next;
  if (changed) pushState();
  return S.brief;
}

/**
 * Pull a new build and restart. Forward only: a slot holding an older build
 * is stale, not an instruction to downgrade. Files land beside this one and
 * nowhere else — no parent hops, no absolute paths.
 */
async function maybeUpdate() {
  const runtime = await cloud.runtime().catch(() => null);
  const current = await running();
  const build = Number(runtime?.build);
  if (!Number.isFinite(build) || build <= current) return false;
  // A build that would not start: the launcher fell back to the bundle and wrote its number here. Never pull it again.
  let bad = 0;
  try { bad = Number((await readFile(join(PATHS.worker, "BAD"), "utf8")).trim()) || 0; } catch { /* none */ }
  if (build <= bad) return false;
  say("organic", `updating to build ${build}`);
  await mkdir(PATHS.worker, { recursive: true });
  let wrote = 0;
  for (const [name, source] of Object.entries(runtime.files ?? {})) {
    const isCode = /^(ui\/)?[\w.-]+\.(mjs|json|html)$/.test(name);
    const isSkill = /^skills\/[\w.-]+\.md$/.test(name);
    if ((!isCode && !isSkill) || name.includes("..") || typeof source !== "string") continue;
    if (name.includes("/")) await mkdir(join(PATHS.worker, dirname(name)), { recursive: true });
    await writeFile(join(PATHS.worker, name), source, "utf8");
    wrote++;
  }
  await writeFile(join(PATHS.worker, "BUILD"), String(build), "utf8");
  say("organic", `build ${build}: ${wrote} file${wrote === 1 ? "" : "s"} written — restarting`);
  S.doing = "updating";
  await report();
  await shutdown(75, { keepChrome: true });
  return true;
}

async function checkOrders() {
  const order = await cloud.order().catch(() => null);
  const cmd = order?.cmd ? String(order.cmd) : null;
  if (!cmd) return;
  say("organic", `heard: ${cmd}`);
  if (cmd === "pause") S.paused = true;
  if (cmd === "resume" || cmd === "run") { S.paused = false; S.stopped = false; if (cmd === "run") sched.marketNext = 0; }
  if (cmd === "stop") S.stopped = true;
  if (cmd === "update") await maybeUpdate();
  const connect = /^connect(?: (\w+))?$/.exec(cmd);
  if (connect) {
    for (const p of connect[1] ? [connect[1]] : PLATFORMS) if (S.screens[p]?.state !== "connected") await connectScreen(p);
  }
  pushState();
}

/* ----------------------------------------------------------- the pages */

async function openScreen(id) {
  const page = await screens.open(id, HOME[id]);
  await screens.startStream(id);
  return page;
}

/**
 * Is this platform signed in, and as whom? Reads the cookie/URL via
 * accounts.signedIn, then the handle — a connection with no readable
 * handle is not a connection.
 */
async function checkSignedIn(platform, { quiet = false } = {}) {
  const page = screens.page(platform);
  if (!page) return false;
  const sc = S.screens[platform];
  let result = { connected: false, friction: null };
  try { result = (await accounts.signedIn(page, platform)) ?? result; } catch { /* not connected then */ }
  if (!result.connected) {
    if (sc.state === "connected") {
      say("sam", `${platform} is signed out now — it was ${sc.handle}`);
      setScreen(platform, "out", null);
    }
    if (result.friction && !quiet) say("sam", `${platform}: ${result.friction}`);
    return false;
  }
  if (sc.state === "connected" && sc.handle) return true;
  let handle = null;
  try { handle = await accounts.whoAmI(page, platform); } catch { /* no name */ }
  if (!handle || String(handle).replace(/[@\s]/g, "") === "") {
    if (!quiet || sc.state !== "waiting") say("sam", `${platform} looks signed in but will not tell me who — not taking that as connected yet`);
    setScreen(platform, "waiting", null);
    return false;
  }
  handle = String(handle).startsWith("@") ? String(handle) : `@${handle}`;
  let row = null;
  try { row = await cloud.db.markConnected(platform, handle); } catch (e) { say("organic", `could not record ${handle}: ${e.message}`); }
  sc.accountId = row?.id ?? sc.accountId ?? null;
  setScreen(platform, "connected", handle);
  // Signed in: Chrome goes back out of sight, and the app is the only window
  // again. Alex never has to close it himself.
  await screens.showWindow(platform, false).catch(() => {});
  say("sam", `${platform} connected as ${handle}`);
  sched.firstLook.add(platform);
  if (S.phase === "working") await prepareAccount(platform).catch(() => {});
  return true;
}

/* -------------------------------------------------------- the scheduler */

/**
 * One task per screen at a time, suspended while Alex has that screen.
 * Jobs come from the plan: the accounts' sessions from human.mjs, spread
 * across their persona's day, and the market sweeps once an hour. The plan
 * is sent to the window and updated as jobs run.
 */
const sched = {
  tasks: new Map(),      // screen id → { who, label, promise }
  jobs: [],              // the plan: { id, who, what, at, state, platform, seconds, kind }
  marketNext: 0,
  planned: {},           // platform → day string the plan was made for
  firstLook: new Set(),  // platforms that connected today and have not had their look-around
  lookedOn: {},          // platform → day string of the last look-around
  verifyNext: {},        // platform → when to re-check the sign-in
  personas: {},          // platform → persona
  accountIds: {},        // platform → account id
  warmed: {},            // platform → warmed_days
  idleSaidFor: null,
};

/** What the crew hunts: products read from the store, the terms they expand to, and what the feeds taught us. */
const hunt = {
  products: [],
  queries: [],
  tags: [],
  known: new Set(),      // every tag ever used or discovered
  next: [],              // discovered this sweep, for the next one: { tag, from, views }
  sweep: 0,
};

class Stopped extends Error {}

const day = () => new Date().toISOString().slice(0, 10);
const hhmm = (d) => { const x = new Date(d); return `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`; };

function planMsg() {
  return { t: "plan", jobs: sched.jobs.map(({ id, who, what, at, state }) => ({ id, who, what, at: new Date(at).toISOString(), state })) };
}
const pushPlan = () => server?.broadcast(planMsg());

function setJob(id, state) {
  const j = sched.jobs.find((x) => x.id === id);
  if (j && j.state !== state) { j.state = state; pushPlan(); }
}

function addJob(job) {
  sched.jobs.push({ state: "next", ...job });
  sched.jobs.sort((x, y) => x.at - y.at);
  // Yesterday's are not today's plan.
  const cutoff = Date.now() - 20 * 60 * 60 * 1000;
  sched.jobs = sched.jobs.filter((j) => j.at > cutoff || j.state === "next" || j.state === "doing");
  pushPlan();
  return job;
}

/** The market sweep's place in the plan: one "next" job at marketNext. */
function planMarket() {
  const have = sched.jobs.find((j) => j.kind === "market" && (j.state === "next" || j.state === "doing"));
  if (have) { if (have.state === "next" && have.at !== sched.marketNext) { have.at = sched.marketNext; sched.jobs.sort((x, y) => x.at - y.at); pushPlan(); } return have; }
  const first = !sched.jobs.some((j) => j.kind === "market");
  return addJob({ id: `market-${Date.now()}`, kind: "market", who: "Reyna", what: first && storeUrl() ? "read the store, then the ad library" : "ad library sweep", at: sched.marketNext });
}

/**
 * The day's sessions for an account, from its persona. Times in the past
 * are moved into what is left of today's waking hours, or skipped — a
 * person who missed the morning does not do it at midnight.
 */
function planAccount(platform, persona, warmedDays) {
  const today = day();
  if (sched.planned[platform] === today) return;
  sched.planned[platform] = today;
  const handle = S.screens[platform].handle;
  const now = new Date();
  const sessions = planDay(persona, warmedDays);
  if (!sessions.length) { say("bea", `${handle} does not open the app today — that happens`); pushPlan(); return; }
  const timed = scatterAcrossDay(persona, sessions, now);
  const spare = 4 * 60 * 60 * 1000; // move a missed one into the next four hours if the persona is up
  let i = 0;
  for (const s of timed) {
    let at = s.at.getTime();
    let state = "next";
    if (at < Date.now()) {
      const later = new Date(Date.now() + between(5 * 60 * 1000, spare));
      if (isAwake(persona, later)) at = later.getTime(); else state = "skipped";
    }
    const mins = Math.max(1, Math.round(s.seconds / 60));
    addJob({ id: `${platform}-${today}-${i++}`, kind: "session", platform, seconds: s.seconds, who: "Bea", what: `${handle} · ${s.long ? "the sofa session" : "a scroll"}, ${mins} min`, at, state });
  }
}

/** The context a task works in: its page, and the brakes. */
function taskContext(id, who) {
  return {
    id,
    who,
    page: screens.page(id),
    /** Wait while Alex has the screen or the app is paused; throw when stopped. */
    async hold() {
      for (;;) {
        if (S.stopped || quitting || S.phase !== "working") throw new Stopped();
        if (!screens.busy(id) && !S.paused) return;
        await sleep(500);
      }
    },
    async cursor(x, y, label) { await screens.cursor(id, x, y, label ?? `${nameOf(who)} · working`); },
    progress(pct, doing) { server.broadcast({ t: "progress", who: nameOf(who), doing, pct }); S.doing = doing; },
  };
}

/**
 * Move the real mouse there the way a hand does — an arc, a wobble, a
 * settle — and show every step in the window. The cursor Alex sees is the
 * mouse Chrome sees; nothing is drawn in the page.
 */
async function glide(ctx, x, y, label) {
  const page = ctx.page;
  const from = page.__at ?? { x: x - between(120, 380), y: y - between(80, 260) };
  const steps = Math.round(between(8, 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, ease = t * t * (3 - 2 * t), wobble = Math.sin(t * Math.PI) * between(-12, 12);
    const px = from.x + (x - from.x) * ease + wobble, py = from.y + (y - from.y) * ease + wobble * 0.6;
    await page.mouse.move(px, py).catch(() => {});
    await ctx.cursor(px, py, label);
    await sleep(between(8, 24));
  }
  page.__at = { x, y };
  await sleep(around(180, 90, 60, 500));
}

function runTask(id, who, label, fn) {
  const ctx = taskContext(id, who);
  const promise = fn(ctx)
    .catch((e) => { if (!(e instanceof Stopped)) say(who, `${label} stopped on: ${e?.message ?? e}`); })
    .finally(() => { sched.tasks.delete(id); server.broadcast({ t: "progress", who: nameOf(who), doing: "", pct: 0 }); });
  sched.tasks.set(id, { who, label, promise });
}

function schedulerTick() {
  if (S.phase !== "working" || S.paused || S.stopped || quitting) return;
  const now = Date.now();
  // Market: once an hour.
  if (screens.page("market")) {
    const job = planMarket();
    if (!sched.tasks.has("market") && !screens.busy("market") && now >= sched.marketNext) {
      sched.marketNext = now + 60 * 60 * 1000;
      setJob(job.id, "doing");
      runTask("market", "reyna", "market research", async (ctx) => {
        try { await marketTask(ctx); setJob(job.id, "done"); } catch (e) { setJob(job.id, e instanceof Stopped ? "skipped" : "done"); throw e; }
      });
    }
  }
  for (const platform of connectedIds()) {
    if (sched.tasks.has(platform) || screens.busy(platform) || !screens.page(platform)) continue;
    if (now >= (sched.verifyNext[platform] ?? 0)) {
      sched.verifyNext[platform] = now + 5 * 60 * 1000;
      runTask(platform, "sam", "checking the sign-in", async () => { await checkSignedIn(platform, { quiet: true }); await prepareAccount(platform); });
      continue;
    }
    if (!sched.personas[platform]) continue; // prepareAccount has not run yet
    // The first connect of the day: a look around now, whatever the hour.
    let job = null;
    if (sched.firstLook.has(platform) && sched.lookedOn[platform] !== day()) {
      sched.firstLook.delete(platform);
      sched.lookedOn[platform] = day();
      const seconds = Math.round(between(5 * 60, 10 * 60));
      job = addJob({ id: `${platform}-${day()}-look`, kind: "session", platform, seconds, look: true, who: "Bea", what: `${S.screens[platform].handle} · a first look around, ${Math.round(seconds / 60)} min`, at: now });
    } else {
      job = sched.jobs.find((j) => j.kind === "session" && j.platform === platform && j.state === "next" && j.at <= now) ?? null;
    }
    if (!job) continue;
    setJob(job.id, "doing");
    runTask(platform, "bea", `a session on ${platform}`, async (ctx) => {
      try { await sessionTask(ctx, platform, job); setJob(job.id, "done"); } catch (e) { setJob(job.id, e instanceof Stopped ? "skipped" : "done"); throw e; }
    });
  }
  idleNotice(now);
}

/** Never idle silently: if nothing runs and nothing is due for ten minutes, say when the next thing is. Once. */
function idleNotice(now) {
  if (sched.tasks.size) { sched.idleSaidFor = null; return; }
  const next = sched.jobs.filter((j) => j.state === "next" && (j.kind !== "session" || connectedIds().includes(j.platform))).sort((x, y) => x.at - y.at)[0] ?? null;
  const key = next ? `${next.id}` : "none";
  if (next && next.at - now < 10 * 60 * 1000) { sched.idleSaidFor = null; return; }
  if (sched.idleSaidFor === key) return;
  sched.idleSaidFor = key;
  if (next) say("bea", `nothing until ${hhmm(next.at)} — next: ${next.who} · ${next.what}`);
  else say("bea", "nothing more scheduled today — the personas are done for the day");
}

/** Persona, account id and today's plan for a connected account. */
async function prepareAccount(platform) {
  const sc = S.screens[platform];
  if (sc.state !== "connected" || !sc.handle) return;
  let account = null;
  try { account = (await cloud.db.accountFor(platform, sc.handle)) ?? null; } catch { /* the plane is away */ }
  const accountId = account?.id ?? sc.accountId ?? null;
  sched.accountIds[platform] = accountId;
  sched.warmed[platform] = Number(account?.warmed_days ?? 0);
  let persona = sched.personas[platform] ?? null;
  if (!persona && accountId) {
    try { persona = await cloud.db.personaFor(accountId); } catch { /* none yet */ }
    if (!persona) {
      persona = personaSeed(sc.handle);
      say("ines", `writing who ${sc.handle} is — written once and kept`);
      await cloud.db.savePersona(accountId, persona).catch(() => {});
    }
  }
  persona ??= personaSeed(sc.handle);
  sched.personas[platform] = persona;
  planAccount(platform, persona, sched.warmed[platform]);
}

/* -------------------------------------------------------------- market */

function storeUrl() {
  const b = S.brief ?? {};
  if (b.storeUrl && /^https?:\/\//i.test(String(b.storeUrl))) return String(b.storeUrl);
  const name = String(b.store ?? "").trim();
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(name)) return `https://${name}`;
  return null;
}

/** What to look for, from the store's products, the brief, and what the feeds taught us. */
function refreshTerms() {
  const b = S.brief ?? {};
  const queries = [], tags = [];
  const addQ = (q) => { const t = String(q ?? "").trim(); if (t && !queries.some((x) => x.toLowerCase() === t.toLowerCase())) queries.push(t); };
  const addT = (t) => { const c = String(t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, ""); if (c.length >= 4 && !tags.includes(c)) tags.push(c); };
  try {
    const e = discover.expandTerms(hunt.products, b) ?? {};
    for (const q of e.queries ?? []) addQ(q);
    for (const t of e.tags ?? []) addT(t);
  } catch { /* fall through to the brief */ }
  try {
    const m = typeof market.termsFromBrief === "function" ? market.termsFromBrief(b) ?? {} : {};
    for (const q of m.queries ?? []) addQ(q);
    if (m.query) addQ(m.query);
    for (const t of m.tags ?? []) addT(t);
  } catch { /* fine */ }
  for (const q of [...(Array.isArray(b.products) ? b.products : []), ...(Array.isArray(b.market) ? b.market : [])]) { addQ(q); addT(q); }
  for (const m of String(b.notes ?? "").matchAll(/#([a-z0-9_]{3,40})/gi)) addT(m[1]);
  // What the last sweep discovered, best first.
  let ranked = [];
  try { ranked = discover.rankTags(hunt.next) ?? []; } catch { ranked = hunt.next; }
  for (const r of ranked.slice(0, 12)) addT(r.tag);
  hunt.next = [];
  hunt.queries = queries.slice(0, 12);
  hunt.tags = tags.slice(0, 20);
  for (const t of hunt.tags) hunt.known.add(t);
  hunt.sweep++;
  return { queries: hunt.queries, tags: hunt.tags };
}

const hash = (s) => createHash("sha1").update(s).digest("hex").slice(0, 16);

async function marketTask(ctx) {
  // Our store first: nobody tells the crew the products.
  const url = storeUrl();
  if (url) {
    await ctx.hold();
    say("reyna", "looking at what we sell");
    ctx.progress(0, `reading ${new URL(url).hostname}`);
    await ctx.cursor(640, 300, "Reyna · our store");
    let read = { products: [], stopped: null };
    try { read = (await store.readStore(ctx.page, url)) ?? read; } catch (e) { read = { products: [], stopped: e?.message ?? String(e) }; }
    if (read.stopped) say("reyna", `the store: ${read.stopped}`);
    const products = (read.products ?? []).filter((p) => p?.title).slice(0, 30);
    if (products.length) {
      hunt.products = products;
      for (const p of products) {
        await cloud.db.saveFinding({
          kind: "product", product: p.title, query: null, platform: "store", url: p.url || url, who: null,
          title: p.title, metrics: { price: p.price ?? null, image: p.image ?? null }, startedAt: null, note: null,
        }).catch(() => {});
      }
      say("reyna", `${products.length} product${products.length === 1 ? "" : "s"} on the store: ${products.slice(0, 4).map((p) => p.title).join(", ")}${products.length > 4 ? "…" : ""}`);
    }
  }
  const { queries, tags } = refreshTerms();
  if (!queries.length) {
    say("reyna", "nothing to look for yet — no store products and no products in the brief");
    return;
  }
  say("nadia", `hunting ${queries.length} term${queries.length === 1 ? "" : "s"} and ${tags.length} tag${tags.length === 1 ? "" : "s"}: ${tags.slice(0, 5).map((t) => "#" + t).join(" ")}${tags.length > 5 ? "…" : ""}`);
  const productFor = (q) => hunt.products.find((p) => String(p.title).toLowerCase() === q.toLowerCase())?.title ?? ((S.brief?.products ?? []).find((p) => String(p).toLowerCase() === q.toLowerCase()) ?? null);
  say("reyna", `ad library — ${queries.length} search${queries.length === 1 ? "" : "es"}`);
  let ads = 0, sellers = 0, i = 0;
  const seenSellers = new Set();
  for (const q of queries) {
    await ctx.hold();
    ctx.progress(Math.round((i++ / queries.length) * 100), `ad library · ${q}`);
    await glide(ctx, 640 + between(-200, 200), 200 + between(-60, 60), `Reyna · ad library: ${q}`);
    let found = { ads: [], stopped: null };
    try { found = (await market.adLibrary(ctx.page, { query: q })) ?? found; } catch (e) { found = { ads: [], stopped: e?.message ?? String(e) }; }
    if (found.stopped) { say("reyna", `ad library "${q}": ${found.stopped}`); continue; }
    const list = (found.ads ?? []).slice(0, 40);
    const product = productFor(q);
    let proven = 0;
    for (const ad of list) {
      const advertiser = String(ad.advertiser ?? "").trim();
      const adUrl = ad.video || ad.img || `https://www.facebook.com/ads/library/?q=${encodeURIComponent(q)}&ad=${hash(advertiser + "|" + (ad.text ?? "") + "|" + (ad.started ?? ""))}`;
      const days = runningDays(ad.started);
      if (days >= 28) proven++;
      await cloud.db.saveFinding({
        kind: "ad", product, query: q, platform: "meta", url: adUrl, who: advertiser || null,
        title: String(ad.text ?? "").slice(0, 160) || null, metrics: { days, video: Boolean(ad.video) },
        startedAt: ad.started ?? null, note: null,
      }).catch(() => {});
      ads++;
      if (advertiser && !seenSellers.has(advertiser.toLowerCase())) {
        seenSellers.add(advertiser.toLowerCase());
        await cloud.db.saveFinding({
          kind: "seller", product, query: q, platform: "meta",
          url: `https://www.facebook.com/ads/library/?search_type=page&q=${encodeURIComponent(advertiser)}`,
          who: advertiser, title: null, metrics: { firstSeenFor: q }, startedAt: ad.started ?? null, note: null,
        }).catch(() => {});
        sellers++;
      }
    }
    say("reyna", `"${q}": ${list.length} ads, ${proven} running 28+ days`);
    await sleep(around(4000, 1500, 1500, 9000));
  }
  ctx.progress(100, "ad library · done");
  say("kofi", `logged ${ads} ads and ${sellers} sellers`);
}

function runningDays(started) {
  if (!started) return 0;
  const t = Date.parse(String(started));
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
}

/* ------------------------------------------------------------ sessions */

/** A starting persona, written once and kept. Interests come from the brief and the store, not from anywhere in here. */
function personaSeed(handle) {
  const b = S.brief ?? {};
  const metros = ["Columbus, OH", "Boise, ID", "Mobile, AL", "Provo, UT", "Raleigh, NC", "Tucson, AZ"];
  const interests = [...(Array.isArray(b.market) ? b.market : []), ...hunt.products.map((p) => p.title), ...(Array.isArray(b.products) ? b.products : [])].map(String).slice(0, 6);
  return {
    who: `early thirties, scrolls at the kettle and on the sofa (${handle})`,
    metro: pick(metros),
    hours: [
      { start: "07:05", end: "07:40" },
      { start: "12:20", end: "12:55" },
      { start: "19:40", end: "23:10" },
    ],
    interests,
    voice: "short, lowercase, never uses a semicolon",
    typing: { cpsMin: 4.5, cpsMax: 9, typoRate: 0.04 },
    temperament: { likeRate: 0.055, saveRate: 0.012, shareRate: 0.004, commentRate: 0.006, followRate: 0.004 },
    daysOff: [Math.floor(Math.random() * 7)],
  };
}

const LIKE = {
  instagram: ['article svg[aria-label="Like"]', 'svg[aria-label="Like"]'],
  tiktok: ['[data-e2e="like-icon"]', '[data-e2e="browse-like-icon"]'],
  youtube: ['#like-button button', 'like-button-view-model button', 'button[aria-label^="like" i]'],
};

async function sessionTask(ctx, platform, job) {
  const sc = S.screens[platform];
  const handle = sc.handle;
  const accountId = sched.accountIds[platform] ?? null;
  const warmedDays = sched.warmed[platform] ?? 0;
  const persona = sched.personas[platform] ?? personaSeed(handle);
  if (accountId) {
    let parked = false;
    try { parked = Boolean(await cloud.db.isParked(accountId)); } catch { /* assume not */ }
    if (parked) { say("sam", `${handle} is parked for today — leaving it alone`); throw new Stopped(); }
  }
  const lookAround = Boolean(job.look);
  const seconds = Math.max(60, Number(job.seconds) || 180);
  const budget = dayBudget(persona, warmedDays);
  if (lookAround) budget.like = Math.min(budget.like, 2);
  const mins = Math.max(1, Math.round(seconds / 60));
  say("bea", `${handle} — ${lookAround ? "a first look around" : "having a scroll"}, about ${mins} min, up to ${budget.like} like${budget.like === 1 ? "" : "s"}`);
  if (accountId) { await cloud.db.warmedToday(accountId).catch(() => {}); await cloud.db.seen(accountId).catch(() => {}); }

  const page = ctx.page;
  await ctx.hold();
  if (!page.url().includes(new URL(HOME[platform]).hostname)) await screens.navigate(platform, HOME[platform]);

  const end = Date.now() + seconds * 1000;
  let watched = 0, liked = 0, passes = 0;
  const tagQueue = hunt.tags.length ? [...hunt.tags] : refreshTerms().tags;
  const tagFn = platform === "instagram" ? market.instagramTag : platform === "tiktok" ? market.tiktokTag : null;
  const nextPassAt = () => Date.now() + Math.round(between(2, 5)) * 60 * 1000;
  let passAt = lookAround ? Date.now() + 60 * 1000 : nextPassAt();

  while (Date.now() < end) {
    await ctx.hold();
    ctx.progress(Math.round(100 - ((end - Date.now()) / (seconds * 1000)) * 100), `${handle} · ${lookAround ? "looking around" : "scrolling"}`);

    // The brakes: a captcha, a block, a "verify" — the account is parked for the day.
    const text = await ask(page, () => document.body?.innerText?.slice(0, 4000) ?? "", undefined, 6000);
    const friction = frictionIn(text ?? "");
    if (friction && friction !== "logged out") {
      say("sam", `${handle}: ${friction}. That account is done for today.`);
      if (accountId) await cloud.db.park(accountId, friction).catch(() => {});
      for (const j of sched.jobs) if (j.platform === platform && j.state === "next") j.state = "skipped";
      pushPlan();
      return;
    }

    // Watch whatever is in view; the hand drifts a little while watching.
    const interesting = chance(0.4);
    const dwell = Math.min(watchMs(15000, interesting), 25000);
    const vp = await screens.viewport(platform);
    await glide(ctx, vp.w * between(0.4, 0.6), vp.h * between(0.35, 0.65), `${handle} · watching`);
    await sleep(dwell);
    watched++;

    // Like, sparingly, from the persona's own ratios.
    const r = react(persona, { interesting, budget });
    if (r.like && liked < budget.like) {
      const hit = await tryLike(ctx, platform, handle);
      if (hit) { liked++; budget.like--; if (accountId) await cloud.db.act(accountId, "like", { targetUrl: page.url(), dwellMs: dwell }).catch(() => {}); }
    }
    if (shouldRest()) await sleep(around(2600, 1200, 800, 7000));

    // A research pass, from the account, at browsing pace: one tag, a few screens, minutes between.
    if (tagFn && tagQueue.length && Date.now() >= passAt && Date.now() + 90 * 1000 < end) {
      const tag = tagQueue.shift();
      passAt = nextPassAt();
      passes++;
      say("reyna", `${handle} — #${tag} on ${platform}, a look at the feed`);
      await glide(ctx, vp.w * 0.5, vp.h * 0.2, `Reyna · #${tag}`);
      let got = { items: [], stopped: null };
      try { got = (await tagFn(page, tag, { passes: 2, limit: 40 })) ?? got; } catch (e) { got = { items: [], stopped: e?.message ?? String(e) }; }
      if (got.stopped) say("reyna", `#${tag}: ${got.stopped}`);
      const items = (got.items ?? got.links ?? []).slice(0, 40);
      let fresh = 0, topViews = 0;
      for (const link of items) {
        const url = typeof link === "string" ? link : link?.url;
        if (!url) continue;
        const views = typeof link === "object" && link.views != null ? Number(link.views) || 0 : 0;
        topViews = Math.max(topViews, views);
        let known = false;
        try { known = Boolean(await cloud.db.knownClip(url)); } catch { known = true; }
        if (known) continue;
        await cloud.db.saveClip({ platform, sourceUrl: url, sourceHandle: typeof link === "object" ? link.handle ?? null : null, views: views || null, seen: { tag, foundAt: new Date().toISOString(), by: handle } }).catch(() => {});
        await cloud.db.saveFinding({
          kind: "clip", product: hunt.products.find((p) => String(p.title).toLowerCase().replace(/[^a-z0-9]+/g, "") === tag)?.title ?? null, query: `#${tag}`, platform, url,
          who: typeof link === "object" ? link.handle ?? null : null, title: null,
          metrics: views ? { views } : {}, startedAt: null, note: null,
        }).catch(() => {});
        fresh++;
      }
      say("kofi", `#${tag}: ${items.length} clips, ${fresh} new — logged`);
      // What the people posting this actually tag it: into the next sweep.
      await discoverFrom(page, tag, topViews);
      await ctx.hold();
      await screens.navigate(platform, HOME[platform]);
      await sleep(around(2500, 800, 1200, 5000));
      continue;
    }

    // Scroll on, the way a thumb does.
    const distance = Math.round(around(interesting ? 520 : 900, 260, 180, 1600));
    const steps = Math.round(between(3, 8));
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, distance / steps).catch(() => {});
      await sleep(between(18, 70));
    }
    await sleep(scrollPauseMs(interesting));
  }
  say("bea", `${handle}: watched ${watched}, liked ${liked}${passes ? `, ${passes} research pass${passes === 1 ? "" : "es"}` : ""}`);
}

/** The hashtags beside this tag's clips — at most twelve new ones a sweep, remembered with where they came from. */
async function discoverFrom(page, from, views) {
  let found = [];
  try { found = (await discover.relatedTags(page, { except: [...hunt.known, from], limit: 20, ask })) ?? []; } catch { found = []; }
  const fresh = [];
  for (const t of found) {
    const tag = String(t).toLowerCase().replace(/[^a-z0-9_]+/g, "");
    if (tag.length < 4 || hunt.known.has(tag)) continue;
    if (hunt.next.length >= 12) break;
    hunt.known.add(tag);
    hunt.next.push({ tag, from, views });
    fresh.push(tag);
    await cloud.db.remember("discovery", `#${tag} sits beside #${from} clips`, { tag, from, views }, 0.4).catch(() => {});
  }
  if (fresh.length) say("reyna", `#${from} led to ${fresh.slice(0, 5).map((t) => "#" + t).join(" ")}${fresh.length > 5 ? ` +${fresh.length - 5}` : ""} — for the next sweep`);
}

/** Find a like button in view and press it like a hand would. */
async function tryLike(ctx, platform, handle) {
  const page = ctx.page;
  for (const sel of LIKE[platform] ?? []) {
    let box = null;
    try {
      const target = page.locator(sel).first();
      if (!(await target.count())) continue;
      box = await target.boundingBox({ timeout: 1500 });
    } catch { continue; }
    if (!box) continue;
    const vp = await screens.viewport(platform);
    if (box.y < 0 || box.y > vp.h) continue;
    const x = box.x + box.width * between(0.32, 0.68);
    const y = box.y + box.height * between(0.32, 0.68);
    await glide(ctx, x, y, `${handle} · like`);
    await page.mouse.click(x, y, { delay: Math.round(between(40, 130)) }).catch(() => {});
    return true;
  }
  return false;
}

/* ------------------------------------------------------------- phases */

async function startWorking() {
  if (S.phase === "working") return;
  S.phase = "working";
  S.doing = "working";
  pushState();
  say("organic", `working — ${connectedIds().map((p) => S.screens[p].handle).join(", ")}`);
  if (S.screens.youtube.state !== "connected") {
    // YouTube is a screen only when it is connected. "Connect" in the window opens it again.
    await screens.close("youtube").catch(() => {});
    setScreen("youtube", "none", null);
  }
  await openScreen("market").catch((e) => say("reyna", `could not open the market screen: ${e.message}`));
  setScreen("market", "connected", "Ad Library");
  await readBrief();
  if (S.brief) say("nadia", `the brief: ${S.brief.store ?? "our store"}${storeUrl() ? ` at ${new URL(storeUrl()).hostname}` : ""}${(S.brief.products ?? []).length ? ` · ${S.brief.products.join(", ")}` : ""}`);
  else say("nadia", "no brief yet — the crew will warm the accounts and wait for one");
  for (const p of connectedIds()) await prepareAccount(p).catch(() => {});
  planMarket();
  schedulerTick();
}

/**
 * Watch for sign-ins: in setup every screen that is not connected (waiting
 * ones every 3 s, the others every 15 s); while working, only the screens
 * Alex asked to connect and the ones that signed out — so YouTube can be
 * connected after the fact, and a re-login is picked up without a click.
 */
const lastLook = {};
async function setupPoll() {
  if (quitting) return;
  for (const platform of PLATFORMS) {
    const sc = S.screens[platform];
    if (sc.state === "connected" || !screens.page(platform)) continue;
    if (S.phase === "working" && sc.state !== "waiting" && sc.state !== "out") continue;
    const gap = sc.state === "waiting" ? 3000 : 15000;
    if (Date.now() - (lastLook[platform] ?? 0) < gap - 200) continue;
    lastLook[platform] = Date.now();
    await checkSignedIn(platform, { quiet: true });
  }
}

/* --------------------------------------------------------- the window */

/**
 * Put a platform's screen at its login page and watch it (setupPoll). In
 * either phase: a platform left out at setup — YouTube, usually — is opened
 * again here. A screen already waiting is left where Alex is on it.
 */
async function connectScreen(platform) {
  const sc = S.screens[platform];
  if (!sc || !PLATFORMS.includes(platform) || sc.state === "connected") return;
  if (sc.state === "waiting" && screens.page(platform)) return;
  if (!screens.page(platform)) await openScreen(platform).catch((e) => say("sam", `could not open ${platform}: ${e.message}`));
  if (!screens.page(platform)) return;
  setScreen(platform, "waiting", null);
  await screens.navigate(platform, LOGIN[platform]);
  // The real window, for the one moment that has to be fast.
  const infront = await screens.showWindow(platform, true);
  say(
    "sam",
    infront
      ? `${platform} is open in front of you — sign in there and I will pick it up`
      : `opening ${platform} — sign in on the screen and I will pick it up`,
  );
}

async function onMessage(msg) {
  switch (msg.t) {
    case "focus":
      await screens.focus(msg.id, msg.view);
      break;
    case "mouse":
    case "key":
      // The page is Alex's only while he has it focused.
      if (screens.focused === msg.id) await screens.input(msg.id, msg);
      break;
    case "connect":
      await connectScreen(msg.platform);
      break;
    case "ok":
      if (connectedIds().length >= 1) await startWorking();
      else say("sam", "connect at least one account first");
      break;
    case "stop":
      S.stopped = true; pushState(); say("organic", "stopped — the crew is off the screens");
      break;
    case "pause":
      S.paused = true; pushState(); say("organic", "paused");
      break;
    case "resume":
      S.paused = false; S.stopped = false; pushState(); say("organic", "back to work");
      break;
  }
}

/* -------------------------------------------------------------- lifecycle */

async function shutdown(code = 0, { keepChrome = code === 75 } = {}) {
  if (quitting) return;
  quitting = true;
  // Whatever hangs below, the process ends: a restart on 75 must not wait on a Chrome that stopped answering.
  setTimeout(() => process.exit(code), 8000).unref();
  try { await screens?.dispose(); } catch { /* fine */ }
  try { await report(); } catch { /* fine */ }
  try { await server?.close(); } catch { /* fine */ }
  if (!keepChrome && browser && !chromeChild) {
    // Attached, not started (a restart before this one): close() would only disconnect and leave a headless Chrome behind.
    try { const s = await browser.newBrowserCDPSession(); await s.send("Browser.close"); } catch { /* already gone */ }
  }
  try { await browser?.close(); } catch { /* disconnects only */ }
  if (!keepChrome && chromeChild && !chromeChild.killed) { try { chromeChild.kill(); } catch { /* gone */ } }
  process.exit(code);
}

function watchParent() {
  const pid = Number(process.env.ORGANIC_PARENT_PID);
  if (Number.isFinite(pid) && pid > 0) {
    setInterval(() => {
      try { process.kill(pid, 0); } catch { say("organic", "the app closed — stopping"); shutdown(0); }
    }, 5000).unref();
  }
  // The launcher starts the worker as a background job, whose stdin bash
  // points at /dev/null: it reads EOF at once. With a parent pid to watch,
  // stdin says nothing about the window; without one (tests, a terminal)
  // its end is the signal to go.
  if (!(Number.isFinite(pid) && pid > 0)) {
    process.stdin.on("end", () => shutdown(0));
    process.stdin.on("close", () => shutdown(0));
    process.stdin.on("error", () => {});
    process.stdin.resume();
  }
  process.on("SIGTERM", () => shutdown(0));
  process.on("SIGINT", () => shutdown(0));
}

const every = (ms, fn) => setInterval(() => { fn().catch?.(() => {}); }, ms).unref();

export async function main() {
  for (const d of Object.values(PATHS)) await mkdir(d, { recursive: true });
  S.build = await running();
  cloud = connectCloud();
  onSay((line) => { server?.broadcast(line); return cloud.log(line.who, line.what); });

  server = await startServer({ dir: here, onMessage, state: stateMsg, recent: () => recent, hello: () => [planMsg(), ...Object.values(lastFrame)] });
  watchParent();
  say("organic", `build ${S.build} is up`);
  await report();

  say("organic", "opening chrome");
  let started = false;
  ({ browser, child: chromeChild, started } = await openChrome({ port: CDP_PORT, profile: PATHS.chrome }));
  // Chrome gone (crashed, killed): every page call would fail quietly and the crew would idle for ever.
  // Restart the worker instead; it opens a fresh Chrome and the window reconnects.
  browser.on("disconnected", () => { if (!quitting) { say("organic", "chrome went away — restarting"); shutdown(75, { keepChrome: true }); } });
  screens = new Screens(browser);
  screens.on("frame", (f) => { lastFrame[f.id] = { t: "frame", ...f }; if (server.hasClients()) server.broadcast(lastFrame[f.id]); });
  screens.on("cursor", (c) => server.broadcast(c));
  const adopted = await screens.adopt();
  if (!started) say("organic", `chrome was already open${adopted.length ? ` — kept ${adopted.join(", ")}` : ""}`);
  await Promise.all(PLATFORMS.map((p) => openScreen(p).catch((e) => say("organic", `${p}: ${e.message}`))));
  await readBrief();

  // Who is already signed in? Cookies outlive a restart, and so should the connection.
  for (const p of PLATFORMS) setScreen(p, "checking");
  await Promise.all(PLATFORMS.map(async (p) => { const ok = await checkSignedIn(p, { quiet: true }); if (!ok && S.screens[p].state === "checking") setScreen(p, "none"); }));
  if (connectedIds().length >= 1) {
    await startWorking();
  } else {
    S.phase = "setup";
    S.doing = "waiting for a sign-in";
    pushState();
    say("sam", "connect your accounts — click a screen to sign in on it");
  }

  every(3000, setupPoll);
  every(3000, async () => schedulerTick());
  every(5000, checkOrders);
  every(10000, report);
  every(60000, maybeUpdate);
  every(5 * 60 * 1000, readBrief);
}

if (process.argv[1] && /main\.mjs$/.test(process.argv[1])) {
  main().catch((error) => {
    say("organic", `could not start: ${error?.message ?? error}`);
    process.stderr.write(String(error?.stack ?? error) + "\n");
    shutdown(1);
  });
}
