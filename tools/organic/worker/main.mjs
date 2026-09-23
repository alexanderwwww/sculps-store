/**
 * Organic — the brain.
 *
 * The app is one window that is an iPhone, and inside it one real page. The
 * Swift shell is a wire; the crew's hands live in the page; everything that
 * decides anything lives here.
 *
 * It does one thing at a time, because there is one phone. That is not a
 * limitation to work around — it is the point. Alex watches the cursor move,
 * so whatever is happening has to be the thing on screen.
 *
 * stdout carries exactly one line ("PORT n"). Everything said goes through
 * say() → the ticker, the control plane, stderr.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { startBridge } from "./bridge.mjs";
import { Phone } from "./phone.mjs";
import { connectCloud } from "./cloud.mjs";
import { linkClaude } from "./claudelink.mjs";
import { say, onSay, recent } from "./crew.mjs";
import { accountsIn } from "./accounts-store.mjs";
import * as discover from "./discover.mjs";
import {
  isAwake, planDay, scatterAcrossDay, watchMs, react, dayBudget,
  shouldRest, between, around, chance, pick, frictionIn,
} from "./human.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/** The build this file was written as. What is RUNNING may be newer — see running(). */
export const BUILD = 17;

const SUPPORT = process.env.ORGANIC_HOME || join(homedir(), "Library", "Application Support", "Organic");
export const PATHS = { home: SUPPORT, worker: join(SUPPORT, "worker"), log: join(SUPPORT, "log") };

const PLATFORMS = ["instagram", "tiktok", "youtube"];
const HOME = {
  instagram: "https://www.instagram.com/",
  tiktok: "https://www.tiktok.com/foryou",
  youtube: "https://m.youtube.com/",
};
const LOGIN = {
  instagram: "https://www.instagram.com/accounts/login/",
  tiktok: "https://www.tiktok.com/login",
  youtube: "https://accounts.google.com/ServiceLogin?service=youtube&continue=https://m.youtube.com/",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** The build on disk is the truth: a push writes BUILD beside the files it replaces. */
async function running() {
  try {
    const n = Number((await readFile(join(PATHS.worker, "BUILD"), "utf8")).trim());
    return Number.isFinite(n) && n > 0 ? n : BUILD;
  } catch {
    return BUILD;
  }
}

/* ---------------------------------------------------------------- state */

const S = {
  phase: "setup",          // setup until one account is connected, then working
  paused: false,
  stopped: false,
  build: BUILD,
  brief: null,
  doing: "starting",
  showing: null,           // which account the glass is on, by id
};

/** Every account the app has, each with its own cookie jar. */
let accts;
const acct = (id) => accts?.find(id) ?? null;
const showingAccount = () => acct(S.showing);

/** What the crew has learned to look for. */
const hunt = { products: [], queries: [], tags: [], next: [], known: new Set(), sweep: 0, readStoreAt: 0 };

/** The day's plan, and what is running right now. */
const sched = { jobs: [], running: null, personas: {}, warmed: {}, plannedFor: null, firstLook: new Set(), marketAt: 0 };

let cloud, bridge, phone, quitting = false;

const connected = () => accts?.connected() ?? [];

/* ----------------------------------------------------------- the panel */

/** Everything the phone's own sheet shows. Sent whenever it changes. */
function panelState() {
  return {
    phase: S.phase,
    build: S.build,
    paused: S.paused,
    stopped: S.stopped,
    doing: S.doing,
    showing: S.showing,
    mcp: (cloud?.base ?? "") + "/mcp",
    accounts: (accts?.all() ?? []).map((a) => ({ id: a.id, platform: a.platform, state: a.state, handle: a.handle })),
    canAdd: PLATFORMS.map((p) => ({ platform: p, room: (accts?.forPlatform(p).length ?? 0) < 5 })),
    jobs: sched.jobs.slice(0, 8).map(({ id, who, what, at, state }) => ({ id, who, what, at, state })),
    lines: recent.slice(-6).map((l) => ({ who: l.who, what: l.what })),
  };
}
const pushPanel = () => phone?.panel(undefined, panelState()).catch(() => {});

function setAccount(id, state, handle) {
  const a = acct(id);
  if (!a) return;
  if (a.state !== state || (handle !== undefined && a.handle !== handle)) {
    accts.update(id, handle === undefined ? { state } : { state, handle }).catch(() => {});
    pushPanel();
  }
}

/* ----------------------------------------------------------- the cloud */

async function report() {
  await cloud.status({
    state: S.stopped ? "stopped" : S.paused ? "paused" : S.phase,
    doing: S.doing,
    build: S.build,
    at: Date.now(),
    showing: S.showing,
    accounts: (accts?.all() ?? []).map((a) => ({ id: a.id, platform: a.platform, state: a.state, handle: a.handle })),
    tail: recent.slice(-18).map((l) => `${l.who} · ${l.what}`),
  }).catch(() => {});
}

async function readBrief() {
  const b = await cloud.brief().catch(() => null);
  const next = b && (Array.isArray(b.products) || b.store) ? b : null;
  const changed = JSON.stringify(next) !== JSON.stringify(S.brief);
  S.brief = next;
  if (changed) pushPanel();
  return S.brief;
}

/**
 * Tell Claude where to find this app, so nobody has to type a command.
 * Additive, backed up, and never when pointed at a stub cloud.
 */
async function linkToClaude() {
  if (process.env.ORGANIC_CLOUD || process.env.ORGANIC_NO_LINK === "1") return;
  try {
    const results = await linkClaude((cloud?.base ?? "") + "/mcp");
    const added = results.filter((r) => r.state === "added" || r.state === "updated").map((r) => r.what);
    if (added.length) say("organic", `Claude can reach me now — added to ${added.join(" and ")}. Restart Claude to see it.`);
    for (const p of results.filter((r) => String(r.state).startsWith("left alone"))) say("organic", `${p.what}: ${p.state}`);
  } catch (e) {
    say("organic", `could not reach Claude's config: ${e.message}`);
  }
}

/**
 * Pull a new build and restart. Forward only: a slot holding an older build is
 * stale, not an instruction to downgrade. The crew's own code (agent.built.js)
 * ships the same way, so the hands can change without a download.
 */
async function maybeUpdate() {
  const runtime = await cloud.runtime().catch(() => null);
  const current = await running();
  const build = Number(runtime?.build);
  if (!Number.isFinite(build) || build <= current) return false;
  let bad = 0;
  try { bad = Number((await readFile(join(PATHS.worker, "BAD"), "utf8")).trim()) || 0; } catch { /* none */ }
  if (build <= bad) return false;
  say("organic", `updating to build ${build}`);
  await mkdir(PATHS.worker, { recursive: true });
  let wrote = 0;
  for (const [name, source] of Object.entries(runtime.files ?? {})) {
    const ok = /^[\w.-]+\.(mjs|js|json|html)$/.test(name) || /^(agent|ui)\/[\w.-]+\.(js|html)$/.test(name) || /^skills\/[\w.-]+\.md$/.test(name);
    if (!ok || name.includes("..") || typeof source !== "string") continue;
    if (name.includes("/")) await mkdir(join(PATHS.worker, dirname(name)), { recursive: true });
    await writeFile(join(PATHS.worker, name), source, "utf8");
    wrote++;
  }
  await writeFile(join(PATHS.worker, "BUILD"), String(build), "utf8");
  say("organic", `build ${build}: ${wrote} file${wrote === 1 ? "" : "s"} written — restarting`);
  S.doing = "updating";
  await report();
  await shutdown(75);
  return true;
}

async function checkOrders() {
  const order = await cloud.order().catch(() => null);
  const cmd = order?.cmd ? String(order.cmd) : null;
  if (!cmd) return;
  say("organic", `heard: ${cmd}`);
  if (cmd === "pause") { S.paused = true; pushPanel(); }
  if (cmd === "run" || cmd === "resume") { S.paused = false; S.stopped = false; phone.resume(); pushPanel(); }
  if (cmd === "stop") { S.stopped = true; await phone.stop().catch(() => {}); pushPanel(); }
  if (cmd === "update") await maybeUpdate();
  if (cmd.startsWith("connect")) {
    const only = cmd.split(" ")[1];
    await beginConnect(PLATFORMS.includes(only) ? only : connected().length ? null : "instagram");
  }
}

/* --------------------------------------------------------- the connect */

/**
 * Sign-in is Alex's, always.
 *
 * The phone goes to the login page and the crew stands back: nothing is typed
 * for him and nothing he types is read. Each account has its own cookie jar,
 * so adding a second Instagram is adding a second jar and signing into it —
 * the first one is untouched and stays signed in.
 */
async function beginConnect(what) {
  // Either an account we already know, or "another instagram, please".
  let account = acct(what);
  if (!account && PLATFORMS.includes(what)) {
    account = accts.forPlatform(what).find((a) => a.state !== "connected") ?? (await accts.add(what));
    if (!account) { say("sam", `that is as many ${what} accounts as this holds`); return; }
  }
  if (!account) return;
  if (account.state === "connected") return show(account.id);
  await accts.update(account.id, { state: "waiting" });
  S.showing = account.id;
  await phone.profile(account.profileId, LOGIN[account.platform]);
  say("sam", `${account.platform} is open — sign in on the phone and I will pick it up`);
  pushPanel();
}

let lastSeen = "";
function sawOnce(line) {
  if (line === lastSeen) return;
  lastSeen = line;
  say("sam", line);
}

/**
 * Look at the page and decide whether this account is signed in, and as whom.
 *
 * The proof of a session is the session, not the name on it: an account that
 * is plainly logged in but will not say who works under its own id, and the
 * name is asked for again on every sweep until it answers.
 */
async function checkSignedIn(id, { quiet = false } = {}) {
  const a = acct(id);
  if (!a) return false;
  const platform = a.platform;
  const inn = await phone.read("signedIn", { platform });
  if (inn === null || inn === undefined) {
    sawOnce(`${platform}: the page has not answered yet`);
    return false;
  }
  if (!inn) {
    sawOnce(`${platform}: not signed in yet — sign in on the phone`);
    if (a.state === "connected") {
      setAccount(id, "out", null);
      say("sam", `${a.handle ?? platform} is signed out now`);
    }
    return false;
  }

  const handle = await phone.read("handle", { platform });
  const clean = handle ? String(handle).trim() : "";
  let name = clean && clean !== "@" ? (clean.startsWith("@") ? clean : `@${clean}`) : null;
  let provisional = false;

  if (!name) {
    // Digits or nothing: an older agent answered an object once and the
    // account was recorded under an object's name.
    const raw = await phone.read("userId", { platform });
    const uid = typeof raw === "string" && /^\d{3,20}$/.test(raw) ? raw : null;
    if (!uid) {
      sawOnce(`${platform} is signed in but will not say who yet — looking again in a moment`);
      setAccount(id, "waiting", null);
      return false;
    }
    name = `@${uid.slice(0, 12)}`;
    provisional = true;
    sawOnce(`${platform} is signed in — working as ${name} until it tells me the name`);
  } else {
    lastSeen = "";
    if (a.provisional) say("sam", `${platform} says its name now: ${name}`);
  }

  const already = a.state === "connected" && a.handle === name;
  let row = null;
  try { row = await cloud.db.markConnected(platform, name); } catch (e) { if (!quiet) say("organic", `could not record ${name}: ${e.message}`); }
  await accts.update(id, { accountId: row?.id ?? a.accountId ?? null, provisional });
  setAccount(id, "connected", name);
  if (already) return true;

  if (!provisional) say("sam", `${platform} connected as ${name}`);
  sched.firstLook.add(id);
  await prepareAccount(id).catch(() => {});
  if (S.phase === "setup") await startWorking();
  // Move now, not at seven tonight: somebody just connected this and is
  // watching the phone. The persona's hours own everything after it.
  if (!sched.jobs.some((j) => j.account === id && j.now && j.state !== "done")) {
    addJob({
      kind: "session", account: id, platform, now: true, who: "bea",
      what: `${name} · a first look around`, at: Date.now(), seconds: Math.round(between(300, 600)),
    });
  }
  return true;
}

/** The person behind an account: written once, then kept. */
function personaSeed(handle) {
  const b = S.brief ?? {};
  const metros = ["Columbus, OH", "Boise, ID", "Mobile, AL", "Provo, UT", "Raleigh, NC", "Tucson, AZ"];
  const interests = [
    ...(Array.isArray(b.market) ? b.market : []),
    ...hunt.products.map((p) => p.title),
    ...(Array.isArray(b.products) ? b.products : []),
  ].map(String).slice(0, 6);
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

async function prepareAccount(id) {
  const a = acct(id);
  if (!a?.accountId) return;
  let persona = null;
  try { persona = await cloud.db.personaFor(a.accountId); } catch { /* none yet */ }
  if (!persona) {
    say("ines", `writing who ${a.handle} is — written once and kept`);
    try { persona = await cloud.db.savePersona(a.accountId, personaSeed(a.handle)); } catch { persona = personaSeed(a.handle); }
  }
  sched.personas[id] = persona?.hours ? persona : personaSeed(a.handle);
  try {
    const row = await cloud.db.accountFor(a.platform, a.handle);
    sched.warmed[id] = Number(row?.warmed_days ?? 0) || 0;
  } catch { sched.warmed[id] = 0; }
}

/* ------------------------------------------------------------ the plan */

let jobSeq = 1;
function addJob(job) {
  const j = { id: `j${jobSeq++}`, state: "next", ...job };
  sched.jobs.push(j);
  sched.jobs.sort((x, y) => (x.at ?? 0) - (y.at ?? 0));
  pushPanel();
  return j;
}

function planMarket(at = Date.now()) {
  addJob({ kind: "market", who: "reyna", what: "read the store, then the ad library", at });
}

function planAccount(id, persona, warmedDays) {
  const a = acct(id);
  if (!a) return;
  const sessions = planDay(persona, warmedDays);
  const times = scatterAcrossDay(persona, sessions);
  for (const t of times) {
    addJob({
      kind: "session",
      account: id,
      platform: a.platform,
      who: "bea",
      what: `${a.handle} · a scroll, ${Math.round((t.seconds ?? 180) / 60)} min`,
      at: t.at ?? Date.now(),
      seconds: t.seconds ?? 180,
    });
  }
}

/** Plan the day once, and again when the day turns over. */
function planTheDay() {
  const today = new Date().toDateString();
  if (sched.plannedFor === today) return;
  sched.plannedFor = today;
  sched.jobs = sched.jobs.filter((j) => j.state === "doing");
  planMarket(Date.now());
  // Every connected account gets its own day: its own hours, its own budget.
  for (const a of connected()) {
    const persona = sched.personas[a.id] ?? personaSeed(a.handle);
    planAccount(a.id, persona, sched.warmed[a.id] ?? 0);
  }
  pushPanel();
}

/* --------------------------------------------------------- the working */

/** Put a platform on the glass, and say so. */
/**
 * Put something on the glass.
 *
 * `what` is an account id, or "market". Each account has its own cookie jar,
 * so this is also the moment the window is swapped onto that jar — switching
 * account and switching what is on screen are the same act.
 */
async function show(what) {
  if (S.showing === what) return;
  S.showing = what;
  pushPanel();
  if (what === "market") {
    await phone.profile(MARKET_PROFILE, "https://www.facebook.com/ads/library/");
    return;
  }
  const a = acct(what);
  if (!a) return;
  await phone.profile(a.profileId, HOME[a.platform]);
}

/** The research screen has a jar of its own: it is nobody's account. */
const MARKET_PROFILE = "00000000-0000-4000-8000-000000000001";

/** A job may be interrupted between steps; this is where it gives way. */
function shouldStop() {
  return S.stopped || S.paused || quitting;
}

/**
 * The store first, then the market.
 *
 * Nobody tells the crew what we sell: they open the storefront in the brief
 * and read it like a visitor, and what they find is what they hunt.
 */
async function marketTask(job) {
  const url = storeUrl();
  await show("market");
  if (url && Date.now() - hunt.readStoreAt > 6 * 60 * 60 * 1000) {
    say("reyna", "looking at what we sell");
    await phone.goto(url);
    await phone.beat(1200, 2600);
    const found = await phone.read("store", { url });
    const products = Array.isArray(found?.products) ? found.products : [];
    if (products.length) {
      hunt.products = products;
      hunt.readStoreAt = Date.now();
      say("reyna", `our store: ${products.length} product${products.length === 1 ? "" : "s"} — ${products.slice(0, 3).map((p) => p.title).join(", ")}`);
      for (const p of products) {
        await cloud.db.saveFinding({
          kind: "product", product: p.title, url: p.url, who: S.brief?.store ?? null,
          title: p.title, metrics: { price: p.price ?? null, image: p.image ?? null },
        }).catch(() => {});
      }
    } else if (found?.stopped) {
      say("reyna", `the store did not read: ${found.stopped}`);
    }
  }

  const { queries } = refreshTerms();
  for (const q of queries.slice(0, 3)) {
    if (shouldStop()) return;
    say("reyna", `ad library — who is paying to show "${q}"`);
    const url2 = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=" +
      encodeURIComponent(q) + "&search_type=keyword_unordered";
    await phone.goto(url2);
    await phone.beat(2000, 3500);
    for (let pass = 0; pass < 4 && !shouldStop(); pass++) {
      await phone.scroll(between(500, 900), { pace: "skim" });
      await phone.pause(1200, 2600);
    }
    const ads = (await phone.read("ads")) ?? [];
    if (!ads.length) { say("reyna", `nothing readable for "${q}" this time`); continue; }
    const sellers = new Map();
    for (const ad of ads) {
      const days = runningDays(ad.started);
      const key = hash(`${ad.advertiser ?? ""}|${ad.text ?? ""}|${ad.started ?? ""}`);
      await cloud.db.saveFinding({
        kind: "ad", product: q, query: q, platform: "meta",
        url: ad.url || `https://www.facebook.com/ads/library/?q=${encodeURIComponent(q)}&ad=${key}`,
        who: ad.advertiser ?? null, title: (ad.text ?? "").slice(0, 200),
        metrics: { days, started: ad.started ?? null }, startedAt: ad.started ?? null,
      }).catch(() => {});
      if (ad.advertiser) sellers.set(ad.advertiser, Math.max(sellers.get(ad.advertiser) ?? 0, days ?? 0));
    }
    for (const [advertiser, longest] of sellers) {
      await cloud.db.saveFinding({
        kind: "seller", product: q, query: q, platform: "meta",
        url: `https://www.facebook.com/ads/library/?search_type=page&q=${encodeURIComponent(advertiser)}`,
        who: advertiser, title: advertiser, metrics: { longestDays: longest },
      }).catch(() => {});
    }
    const proven = [...sellers.entries()].filter(([, d]) => d >= 28);
    say("desmond", proven.length
      ? `"${q}": ${proven.length} of ${sellers.size} advertisers have run 28+ days — ${proven.slice(0, 3).map(([n]) => n).join(", ")}`
      : `"${q}": ${ads.length} ads, nobody running long yet`);
    await phone.pause(3000, 7000);
  }
  sched.marketAt = Date.now();
}

/**
 * One account, one session: scroll the way a person scrolls, watch what is
 * worth watching, like sparingly, and take a look at one hashtag while you
 * are in there. The cursor does all of it where Alex can see it.
 */
async function sessionTask(job) {
  const a = acct(job.account);
  if (!a || a.state !== "connected") return;
  const platform = a.platform;
  const persona = sched.personas[a.id] ?? personaSeed(a.handle);
  const warmedDays = sched.warmed[a.id] ?? 0;
  if (a.accountId) {
    let parked = false;
    try { parked = Boolean(await cloud.db.isParked(a.accountId)); } catch { /* assume not */ }
    if (parked) { say("sam", `${a.handle} is parked for today — leaving it alone`); return; }
  }
  const look = sched.firstLook.has(a.id);
  sched.firstLook.delete(a.id);
  const seconds = Math.max(60, Number(job.seconds) || 180);
  const budget = dayBudget(persona, warmedDays);
  if (look) budget.like = Math.min(budget.like, 2);
  say("bea", `${a.handle} — ${look ? "a first look around" : "having a scroll"}, about ${Math.round(seconds / 60)} min, up to ${budget.like} like${budget.like === 1 ? "" : "s"}`);
  if (a.accountId) {
    await cloud.db.warmedToday(a.accountId).catch(() => {});
    await cloud.db.seen(a.accountId).catch(() => {});
  }

  await show(a.id);
  const end = Date.now() + seconds * 1000;
  let liked = 0, watched = 0;
  const tags = hunt.tags.length ? [...hunt.tags] : refreshTerms().tags;
  let tagAt = Date.now() + (look ? 60 : Math.round(between(2, 5)) * 60) * 1000;

  while (Date.now() < end && !shouldStop()) {
    // The brakes: a captcha, a block, a "verify" — the account is done today.
    const text = (await phone.read("text")) ?? "";
    const friction = frictionIn(String(text));
    if (friction && friction !== "logged out") {
      say("sam", `${a.handle}: ${friction}. That account is done for today.`);
      if (a.accountId) await cloud.db.park(a.accountId, friction).catch(() => {});
      for (const j of sched.jobs) if (j.account === a.id && j.state === "next") j.state = "skipped";
      pushPanel();
      return;
    }

    const interesting = chance(0.4);
    const dwell = Math.min(watchMs(15000, interesting), 25000);
    await phone.say("bea", `${a.handle} · watching`);
    await phone.dwell(dwell);
    watched++;

    const r = react(persona, { interesting, budget });
    if (r.like && liked < budget.like) {
      const hit = await phone.tap("like", { who: "Bea" });
      if (hit?.ok && hit.result?.changed) {
        liked++;
        budget.like--;
        say("bea", `${a.handle} liked one`);
        if (a.accountId) await cloud.db.act(a.accountId, "like", { targetUrl: phone.where, dwellMs: dwell }).catch(() => {});
      } else if (hit?.ok && hit.result && hit.result.changed === false) {
        // The press landed on nothing that moved. Said once, not every time.
        if (!sessionTask.warned) { sessionTask.warned = true; say("sam", `${platform} did not take a tap from the app — I will keep watching and not pretend otherwise`); }
      }
    }
    if (shouldRest()) await phone.pause(2600, 7000);

    // A look at one hashtag, from the account, at browsing pace.
    if (tags.length && Date.now() >= tagAt && Date.now() + 90 * 1000 < end) {
      const tag = tags.shift();
      tagAt = Date.now() + Math.round(between(2, 5)) * 60 * 1000;
      say("reyna", `${a.handle} — #${tag} on ${platform}, a look at the feed`);
      const tagUrl = platform === "instagram"
        ? `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`
        : `https://www.tiktok.com/tag/${encodeURIComponent(tag)}`;
      await phone.goto(tagUrl);
      for (let pass = 0; pass < 3 && !shouldStop(); pass++) {
        await phone.scroll(between(600, 1100), { pace: "skim" });
        await phone.pause(1400, 3200);
      }
      const posts = (await phone.read("posts")) ?? [];
      let fresh = 0, top = 0;
      for (const p of posts.slice(0, 40)) {
        if (!p?.url) continue;
        top = Math.max(top, Number(p.views) || 0);
        let known = true;
        try { known = Boolean(await cloud.db.knownClip(p.url)); } catch { known = true; }
        if (known) continue;
        fresh++;
        await cloud.db.saveClip({
          platform, sourceUrl: p.url, sourceHandle: p.handle ?? null,
          views: Number(p.views) || null, seen: { tag, at: new Date().toISOString() },
        }).catch(() => {});
      }
      say("kofi", `#${tag}: ${posts.length} clips, ${fresh} new — logged`);
      // What sits next to this tag is where the next sweep goes.
      const near = (await phone.read("tags")) ?? [];
      for (const t of near.slice(0, 12)) {
        const c = String(t).toLowerCase().replace(/[^a-z0-9]+/g, "");
        if (c.length >= 4 && !hunt.known.has(c)) {
          hunt.next.push({ tag: c, from: tag, views: top });
          await cloud.db.remember("discovery", `#${c} sits beside #${tag} clips`, { tag: c, from: tag, views: top }, 0.4).catch(() => {});
        }
      }
      await show(a.id);
    }

    await phone.scroll(between(400, 900), { pace: "read" });
    await phone.pause(900, 2600);
  }
  say("bea", `${a.handle} — done for now: watched ${watched}, liked ${liked}`);
}

const hash = (s) => createHash("sha1").update(s).digest("hex").slice(0, 16);

function runningDays(started, now = new Date()) {
  if (!started) return null;
  const when = new Date(started);
  if (Number.isNaN(when.getTime())) return null;
  const a = Date.UTC(when.getFullYear(), when.getMonth(), when.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function storeUrl() {
  const b = S.brief ?? {};
  if (b.storeUrl && /^https?:\/\//i.test(String(b.storeUrl))) return String(b.storeUrl);
  const name = String(b.store ?? "").trim();
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(name)) return `https://${name}`;
  return null;
}

/** What to look for: the store's products, the brief, and what the feeds taught us. */
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
  for (const q of [...(Array.isArray(b.products) ? b.products : []), ...(Array.isArray(b.market) ? b.market : [])]) { addQ(q); addT(q); }
  for (const m of String(b.notes ?? "").matchAll(/#([a-z0-9_]{3,40})/gi)) addT(m[1]);
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

/* -------------------------------------------------------- the schedule */

async function startWorking() {
  if (S.phase === "working") return;
  S.phase = "working";
  S.doing = "getting started";
  pushPanel();
  await report();
  planTheDay();
}

/** One job at a time, because there is one phone. */
async function tick() {
  if (sched.running || S.paused || S.stopped || S.phase !== "working") return;
  planTheDay();
  const now = Date.now();
  const due =
    sched.jobs.find((j) => j.state === "next" && j.now) ??
    sched.jobs.find((j) => j.state === "next" && (j.at ?? 0) <= now);
  if (!due) {
    // Nothing now: say when, once, rather than going quiet.
    const next = sched.jobs.find((j) => j.state === "next");
    const when = next ? new Date(next.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
    const line = when ? `nothing until ${when} — next: ${next.what}` : "nothing scheduled";
    if (S.doing !== line) { S.doing = line; pushPanel(); }
    return;
  }
  // An account whose person is asleep waits for their own hours.
  if (due.kind === "session" && !due.now) {
    const persona = sched.personas[due.platform];
    if (persona && !isAwake(persona)) { due.at = now + 20 * 60 * 1000; pushPanel(); return; }
  }
  due.state = "doing";
  sched.running = due;
  S.doing = due.what;
  pushPanel();
  try {
    if (due.kind === "market") await marketTask(due);
    else if (due.kind === "session") await sessionTask(due);
    due.state = "done";
  } catch (error) {
    due.state = "skipped";
    say("organic", `${due.what}: ${error?.message ?? error}`);
  } finally {
    sched.running = null;
    S.doing = "between jobs";
    pushPanel();
  }
  if (due.kind === "market") planMarket(Date.now() + 60 * 60 * 1000);
}

/* ------------------------------------------------- what the page says */

async function fromPage(msg) {
  if (msg.t === "hello") {
    phone.sawPage(msg);
    pushPanel();
    // A sign-in that happened while nobody pressed anything still counts —
    // and it belongs to whichever account's jar is on the glass.
    const a = showingAccount();
    if (a && a.platform === msg.platform && (a.state !== "connected" || a.provisional)) {
      await checkSignedIn(a.id, { quiet: true }).catch(() => {});
    }
    return;
  }
  if (msg.t === "tick") { say(msg.who || "organic", String(msg.what ?? "")); return; }
  if (msg.t === "trouble") { say("sam", String(msg.what ?? "something on the page")); return; }
  if (msg.t === "asked") {
    const what = String(msg.do ?? "");
    if (what === "connect") await beginConnect(String(msg.platform ?? ""));
    else if (what === "switch") await show(String(msg.platform ?? ""));
    else if (what === "stop") { S.stopped = true; await phone.stop().catch(() => {}); pushPanel(); }
    else if (what === "resume") { S.stopped = false; S.paused = false; phone.resume(); pushPanel(); }
    else if (what === "quit") await shutdown(0);
  }
}

/* ------------------------------------------------------------ the life */

async function shutdown(code = 0) {
  if (quitting) return;
  quitting = true;
  setTimeout(() => process.exit(code), 8000).unref();
  try { await report(); } catch { /* fine */ }
  try { await bridge?.close(); } catch { /* fine */ }
  process.exit(code);
}

/** The window is the app: when it goes, so do we. */
function watchParent() {
  const pid = Number(process.env.ORGANIC_PARENT_PID) || 0;
  if (!pid) {
    process.stdin.on("end", () => { say("organic", "the app closed — stopping"); shutdown(0); });
    process.stdin.resume();
    return;
  }
  setInterval(() => {
    try { process.kill(pid, 0); } catch { say("organic", "the app closed — stopping"); shutdown(0); }
  }, 5000).unref();
}

export async function main() {
  for (const d of Object.values(PATHS)) await mkdir(d, { recursive: true });
  S.build = await running();
  cloud = connectCloud();
  accts = accountsIn(PATHS.worker);
  await accts.load();
  onSay((line) => { phone?.say(line.who, line.what).catch(() => {}); return cloud.log(line.who, line.what); });

  bridge = await startBridge({ dir: here, onMessage: (m) => { fromPage(m).catch(() => {}); } });
  phone = new Phone(bridge);
  // The one line stdout ever carries: the launcher reads it to find the window.
  process.stdout.write(`PORT ${bridge.port}\n`);
  watchParent();

  say("organic", `build ${S.build} is up`);
  await report();
  linkToClaude().catch(() => {});
  await readBrief();

  // Wait for the phone to arrive, then put something on the glass.
  for (let i = 0; i < 60 && !bridge.connected(); i++) await sleep(500);
  if (!bridge.connected()) say("organic", "the window has not connected yet — waiting");

  /*
   * What it remembered.
   *
   * Every account has its own jar and every jar keeps its sign-in through a
   * quit, an update and a reinstall. So this walks them, says which ones came
   * back, and only asks Alex for the ones that did not.
   */
  await accts.load();
  if (!accts.all().length) await accts.add("instagram");

  const back = [];
  for (const a of accts.all()) {
    S.showing = a.id;
    await phone.profile(a.profileId, HOME[a.platform]).catch(() => {});
    await sleep(2000);
    const inn = await checkSignedIn(a.id, { quiet: true }).catch(() => false);
    if (inn) back.push(acct(a.id)?.handle ?? a.platform);
  }
  if (back.length) say("sam", `still signed in from last time: ${back.join(", ")} — nothing to redo`);

  if (!connected().length) {
    sawOnce("connect an account on the phone — tap the platform you want");
    await phone.panel(true, panelState()).catch(() => {});
  } else {
    await show(connected()[0].id);
  }

  let lastSweep = 0, lastOrders = 0, lastReport = 0;
  for (;;) {
    const now = Date.now();
    try {
      if (now - lastOrders > 5000) { lastOrders = now; await checkOrders(); if (quitting) return; }
      if (now - lastSweep > 60000) {
        lastSweep = now;
        if (await maybeUpdate()) return;
        await readBrief();
        // Look at whatever is on the glass. Alex may have signed in without
        // pressing anything — he did exactly that, and nothing was watching.
        const on = showingAccount();
        if (on && (on.state !== "connected" || on.provisional)) {
          await checkSignedIn(on.id, { quiet: true }).catch(() => {});
        }
      }
      if (now - lastReport > 10000) { lastReport = now; await report(); }
      /*
       * Not awaited.
       *
       * A session is seven minutes of scrolling, and awaiting it here froze
       * everything else for seven minutes: no orders, no update, no second
       * look at a sign-in. tick() already refuses to start a second job, so
       * letting it run beside the loop is both correct and the only way the
       * app stays answerable while the crew works.
       */
      tick().catch((error) => say("organic", `the job stopped: ${error?.message ?? error}`));
    } catch (error) {
      say("organic", `stopped on: ${error?.message ?? error}`);
      await sleep(5000);
    }
    await sleep(1000);
  }
}

if (process.argv[1] && /(^|\/)main\.mjs$/.test(process.argv[1])) {
  main().catch(async (error) => {
    console.error(error);
    try { say("organic", `could not start: ${error?.message ?? error}`); } catch { /* nothing */ }
    await sleep(300);
    process.exit(1);
  });
}
