/**
 * The brain of the research app.
 *
 * One window, one page at a time, and a job that is nothing like the organic
 * app's: this one does not have accounts, does not post, does not like
 * anything. It is sent looking for a product — in Alex's words, with his own
 * daily target and his own window — and it comes back with a report he can
 * act on the same afternoon, or with an honest "not enough seen yet".
 *
 * Everything it claims has to have come off a page it actually loaded. There
 * is no model here inventing a market; there is a sweep, what the sweep saw,
 * and arithmetic on top of it.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

import { NAME } from "./name.mjs";
import { connectCloud } from "./cloud.mjs";
import { startBridge } from "./bridge.mjs";
import { Phone } from "./phone.mjs";
import { buildReport } from "./report.mjs";
import {
  queriesFrom, adLibraryUrl, tiktokSearchUrl, instagramTagUrl, tagFor, runningDays, priceIn,
} from "./hunt.mjs";
import { between, chance, frictionIn, shouldRest } from "./human.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/** The build this file was written as. What is running may be newer. */
export const BUILD = 1;

const SUPPORT = join(homedir(), "Library", "Application Support", "ProductResearch");
const PATHS = { worker: join(SUPPORT, "worker"), data: join(SUPPORT, "data") };

const S = {
  phase: "idle",        // idle | sweeping | writing
  build: BUILD,
  paused: false,
  stopped: false,
  doing: "starting",
  hunt: null,           // what he asked for, as he asked for it
  sweptAt: 0,
  report: null,
};

let cloud, bridge, phone, quitting = false;

/* ------------------------------------------------------------- the record */

const recent = [];
function say(who, what) {
  const line = { who, what, at: Date.now() };
  recent.push(line);
  if (recent.length > 200) recent.shift();
  console.error(`${who} · ${what}`);
  phone?.say(who, what).catch(() => {});
  cloud?.log([`${who} · ${what}`]).catch(() => {});
}

/* -------------------------------------------------------- what it has seen */

/**
 * Findings live on the Mac, in one file, keyed so the same ad seen twice is
 * one finding. Nothing goes to a database: this app's evidence is its own.
 */
const seen = { list: [], byKey: new Set() };

async function loadSeen() {
  try {
    const raw = JSON.parse(await readFile(join(PATHS.data, "findings.json"), "utf8"));
    seen.list = Array.isArray(raw?.findings) ? raw.findings : [];
    for (const f of seen.list) seen.byKey.add(keyOf(f));
  } catch { seen.list = []; }
}

const keyOf = (f) => `${f.kind}|${f.query}|${f.url ?? ""}|${f.who ?? ""}|${(f.title ?? "").slice(0, 40)}`;

async function saveSeen() {
  await mkdir(PATHS.data, { recursive: true });
  // Kept to the last few thousand: a sweep from March is not evidence in October.
  await writeFile(join(PATHS.data, "findings.json"),
    JSON.stringify({ findings: seen.list.slice(-4000) }, null, 0), "utf8");
}

function remember(finding) {
  const f = { ...finding, at: finding.at ?? new Date().toISOString() };
  const k = keyOf(f);
  if (seen.byKey.has(k)) return false;
  seen.byKey.add(k);
  seen.list.push(f);
  return true;
}

/* ------------------------------------------------------------- the panel */

function panelState() {
  const h = S.hunt;
  return {
    phase: S.phase,
    build: S.build,
    paused: S.paused,
    stopped: S.stopped,
    doing: S.doing,
    mcp: (cloud?.base ?? "") + "/mcp",
    accounts: [
      { id: "ads", platform: "market", label: "Ad Library", state: "on", doing: S.at?.ads ?? "waiting", on: S.source === "ads" },
      { id: "tiktok", platform: "tiktok", label: "TikTok", state: "on", doing: S.at?.tiktok ?? "waiting", on: S.source === "tiktok" },
      { id: "instagram", platform: "instagram", label: "Instagram", state: "on", doing: S.at?.instagram ?? "waiting", on: S.source === "instagram" },
    ],
    jobs: h ? [{ who: NAME.toLowerCase(), what: h.looking, state: S.phase }] : [],
    lines: recent.slice(-6).map((l) => ({ who: l.who, what: l.what })),
  };
}
const pushPanel = () => phone?.panel(undefined, panelState()).catch(() => {});

async function report() {
  await cloud.status({
    state: S.stopped ? "stopped" : S.paused ? "paused" : S.phase,
    doing: S.doing,
    build: S.build,
    at: Date.now(),
    hunt: S.hunt,
    sweptAt: S.sweptAt,
    tail: recent.slice(-18).map((l) => `${l.who} · ${l.what}`),
  }).catch(() => {});
}

/* -------------------------------------------------------------- the sweep */

const stopNow = () => S.stopped || S.paused || quitting;

/** Put a source on the glass and remember which one, for the sheet. */
async function at(source, line, url) {
  S.source = source;
  S.at = { ...(S.at ?? {}), [source]: line };
  S.doing = line;
  pushPanel();
  if (url) await phone.goto(url);
}

/**
 * The Ad Library, first and always.
 *
 * Spend is the only signal that costs the person making it money, so it is
 * the one that decides whether the rest of the sweep is worth running.
 */
async function sweepAds(q) {
  await at("ads", `ad library — who pays to show "${q}"`, adLibraryUrl(q));
  await phone.beat(2000, 3500);
  for (let pass = 0; pass < 4 && !stopNow(); pass++) {
    await phone.scroll(between(500, 900), { pace: "skim" });
    await phone.pause(1200, 2600);
  }
  const ads = (await phone.read("ads")) ?? [];
  if (!ads.length) { say("hunt", `nothing readable in the ad library for "${q}"`); return { ads: 0, sellers: 0, price: null }; }

  const sellers = new Map();
  let price = null;
  for (const ad of ads) {
    const days = runningDays(ad.started);
    price = price ?? priceIn(ad.text ?? "");
    remember({
      kind: "ad", query: q, platform: "meta", url: ad.url ?? null,
      who: ad.advertiser ?? null, title: (ad.text ?? "").slice(0, 300),
      metrics: { days, started: ad.started ?? null, price: priceIn(ad.text ?? "") },
    });
    if (ad.advertiser) sellers.set(ad.advertiser, Math.max(sellers.get(ad.advertiser) ?? 0, days ?? 0));
  }
  for (const [who, longestDays] of sellers) {
    remember({
      kind: "seller", query: q, platform: "meta", who, title: who,
      url: `https://www.facebook.com/ads/library/?search_type=page&q=${encodeURIComponent(who)}`,
      metrics: { longestDays },
    });
  }
  const proven = [...sellers.values()].filter((d) => d >= 28).length;
  say("hunt", proven
    ? `"${q}": ${proven} of ${sellers.size} advertisers past 28 days${price ? ` · seen at ${price}` : ""}`
    : `"${q}": ${ads.length} ads, nobody past 28 days yet`);
  return { ads: ads.length, sellers: sellers.size, price };
}

/** What people will watch, which is whether the creative can be made cheaply. */
async function sweepClips(source, q) {
  const url = source === "tiktok" ? tiktokSearchUrl(q) : instagramTagUrl(q);
  await at(source, `${source} — "${source === "tiktok" ? q : "#" + tagFor(q)}"`, url);
  await phone.beat(1800, 3400);
  for (let pass = 0; pass < 3 && !stopNow(); pass++) {
    await phone.scroll(between(600, 1100), { pace: "skim" });
    await phone.pause(1400, 3000);
  }
  const text = (await phone.read("text")) ?? "";
  const friction = frictionIn(String(text));
  if (friction) { say("hunt", `${source} is asking for a ${friction} — leaving it alone for now`); return 0; }

  const posts = (await phone.read("posts")) ?? [];
  let fresh = 0;
  for (const p of posts.slice(0, 40)) {
    if (!p?.url) continue;
    if (remember({
      kind: "clip", query: q, platform: source, url: p.url, who: p.handle ?? null,
      title: (p.caption ?? "").slice(0, 200),
      metrics: { views: p.views ?? null, likes: p.likes ?? null, price: priceIn(p.caption ?? "") },
    })) fresh++;
  }
  say("hunt", `${source}: ${posts.length} clips for "${q}", ${fresh} new`);
  if (shouldRest()) await phone.pause(2600, 6000);
  return posts.length;
}

/**
 * One hunt, start to finish.
 *
 * His words become a handful of queries, each query gets the three sources in
 * the order that matters, and what comes back is scored and published. A
 * sweep that finds nothing publishes that too — a quiet report is a result.
 */
async function runHunt(h) {
  S.phase = "sweeping";
  S.hunt = h;
  pushPanel();
  const queries = queriesFrom(h.looking, h.terms ?? [], h.depth ?? 5);
  say("hunt", `looking for: ${h.looking}${h.targetPerDay ? ` · for ${h.targetPerDay} a day` : ""}${h.window ? ` · ${h.window}` : ""}`);
  say("hunt", `${queries.length} searches: ${queries.join(", ")}`);

  const prices = {};
  for (const q of queries) {
    if (stopNow()) break;
    const fromAds = await sweepAds(q);
    if (fromAds.price) prices[q] = fromAds.price;
    if (stopNow()) break;
    await sweepClips("tiktok", q);
    if (stopNow()) break;
    await sweepClips("instagram", q);
    await saveSeen();
  }

  S.phase = "writing";
  S.doing = "writing the report";
  pushPanel();
  const built = buildReport({
    looking: h.looking,
    findings: seen.list.filter((f) => queries.includes(f.query)),
    targetPerDay: h.targetPerDay ?? null,
    window: h.window ?? null,
    prices,
    sweptFor: queries,
  });
  S.report = built;
  S.sweptAt = Date.now();
  const published = await cloud.publish({ id: h.id ?? String(Date.now()), report: built }).catch(() => null);
  say("hunt", built.nothingSolid
    ? `nothing solid yet for "${h.looking}" — ${built.seen.findings} things seen, none proved. Worth another sweep.`
    : `best right now: ${built.best.query} — ${built.best.verdict}`);
  if (published?.url) say("hunt", `the report: ${published.url}`);
  S.phase = "idle";
  S.doing = "waiting for the next thing to look for";
  pushPanel();
  await report();
}

/* --------------------------------------------------------------- the life */

async function heard() {
  const order = await cloud.order().catch(() => null);
  const cmd = order?.cmd ? String(order.cmd) : null;
  if (!cmd) return;
  say("research", `heard: ${cmd}`);
  if (cmd === "pause") { S.paused = true; pushPanel(); }
  if (cmd === "run" || cmd === "resume") { S.paused = false; S.stopped = false; phone.resume(); pushPanel(); }
  if (cmd === "stop") { S.stopped = true; await phone.stop().catch(() => {}); pushPanel(); }
}

async function maybeHunt() {
  if (S.phase !== "idle" || S.paused || S.stopped) return;
  const h = await cloud.hunt().catch(() => null);
  if (!h?.looking) return;
  if (S.hunt?.id && h.id === S.hunt.id) return;
  await runHunt(h);
}

export async function main() {
  for (const d of Object.values(PATHS)) await mkdir(d, { recursive: true });
  cloud = connectCloud();
  await loadSeen();

  bridge = await startBridge({ dir: here, onMessage: fromPage });
  process.stdout.write(`PORT ${bridge.port}\n`);
  phone = new Phone(bridge);

  say("research", `${NAME} is up — build ${S.build}`);
  S.doing = "waiting for the next thing to look for";
  pushPanel();
  await report();

  setInterval(() => { heard().catch(() => {}); }, 6000).unref();
  setInterval(() => { maybeHunt().catch((e) => say("research", `the hunt stopped: ${e?.message ?? e}`)); }, 8000).unref();
  setInterval(() => { report().catch(() => {}); }, 20000).unref();
  watchParent();
}

async function fromPage(msg) {
  if (msg.t === "hello") { phone.sawPage(msg); pushPanel(); return; }
  if (msg.t === "tick") { say(msg.who || "research", String(msg.what ?? "")); return; }
  if (msg.t === "trouble") { say("research", String(msg.what ?? "something on the page")); return; }
  if (msg.t === "asked") {
    const what = String(msg.do ?? "");
    if (what === "stop") { S.stopped = true; await phone.stop().catch(() => {}); pushPanel(); }
    else if (what === "resume") { S.stopped = false; S.paused = false; phone.resume(); pushPanel(); }
    else if (what === "quit") await shutdown(0);
  }
}

async function shutdown(code = 0) {
  if (quitting) return;
  quitting = true;
  setTimeout(() => process.exit(code), 8000).unref();
  try { await saveSeen(); } catch { /* fine */ }
  try { await report(); } catch { /* fine */ }
  try { await bridge?.close(); } catch { /* fine */ }
  process.exit(code);
}

function watchParent() {
  const pid = Number(process.env.RESEARCH_PARENT_PID) || 0;
  if (!pid) {
    process.stdin.on("end", () => { say("research", "the app closed — stopping"); shutdown(0); });
    process.stdin.resume();
    return;
  }
  setInterval(() => {
    try { process.kill(pid, 0); } catch { say("research", "the app closed — stopping"); shutdown(0); }
  }, 5000).unref();
}

if (process.argv[1] && process.argv[1].endsWith("main.mjs")) main();
