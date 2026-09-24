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
import {
  DESKS, isDesk, searchUrl, QUESTIONS, QUESTION_IDS, FIRST_QUESTION, sourcingQueries,
  newSupplier, record, fact, logMessage, readReply, unanswered, shortlistCase,
  Outbox, sendApproved, openingDraft, followUpDraft,
} from "./desk.mjs";
import { sourcingTable } from "./report.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/** The build this file was written as. What is running may be newer. */
export const BUILD = 1;

const SUPPORT = process.env.RESEARCH_HOME
  ? join(process.env.RESEARCH_HOME, "ProductResearch")
  : join(homedir(), "Library", "Application Support", "ProductResearch");
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


/* ------------------------------------------------------- the sourcing job */

/**
 * The second kind of job this brain runs.
 *
 * The hunt looks for a product. This one goes and gets it made: it searches
 * Alibaba and 1688 in his signed-in window, reads what the listings actually
 * say, shortlists on that, opens a conversation, asks the eight questions,
 * waits, reads the replies, files what was answered and — this is the part
 * that matters — leaves everything that was not answered visibly blank.
 *
 * Every stage writes itself to disk before it moves on, so closing the app in
 * the middle of a search loses a page, not a week of conversations.
 */
const STAGES = ["search", "read", "shortlist", "open", "ask", "wait", "reply", "record", "followup"];

const SRC = {
  job: null,           // { id, product, at }
  stage: "idle",
  queries: [],         // [{ site, q }]
  doneQueries: [],     // the ones already swept, by "site|q"
  listings: [],        // what the search pages showed
  suppliers: [],       // the records
  outbox: new Outbox(),
  waitingSince: null,
  at: null,
};

const SRC_FILE = () => join(PATHS.data, "sourcing.json");

async function loadSourcing() {
  try {
    const raw = JSON.parse(await readFile(SRC_FILE(), "utf8"));
    SRC.job = raw.job ?? null;
    SRC.stage = raw.stage ?? "idle";
    SRC.queries = Array.isArray(raw.queries) ? raw.queries : [];
    SRC.doneQueries = Array.isArray(raw.doneQueries) ? raw.doneQueries : [];
    SRC.listings = Array.isArray(raw.listings) ? raw.listings : [];
    SRC.suppliers = Array.isArray(raw.suppliers) ? raw.suppliers : [];
    SRC.outbox = new Outbox(raw.outbox ?? null);
    SRC.waitingSince = raw.waitingSince ?? null;
  } catch { /* a first run */ }
}

async function saveSourcing() {
  await mkdir(PATHS.data, { recursive: true });
  await writeFile(SRC_FILE(), JSON.stringify({
    job: SRC.job, stage: SRC.stage, queries: SRC.queries, doneQueries: SRC.doneQueries,
    listings: SRC.listings.slice(-600), suppliers: SRC.suppliers,
    outbox: SRC.outbox.toJSON(), waitingSince: SRC.waitingSince, at: Date.now(),
  }, null, 0), "utf8");
}

const supplierById = (id) => SRC.suppliers.find((s) => s.id === id) ?? null;

async function startSourcing(job) {
  SRC.job = { id: job.id ?? String(Date.now()), product: job.product ?? job.looking ?? "portable countertop bottle chiller", at: Date.now() };
  SRC.stage = "search";
  SRC.queries = sourcingQueries(SRC.job.product);
  SRC.doneQueries = [];
  say("desk", `sourcing "${SRC.job.product}" — ${SRC.queries.length} searches across Alibaba and 1688`);
  await saveSourcing();
}

/** search + read: one query shape at a time, and the page decides what is true. */
async function stageSearch() {
  while (!stopNow() && await oneSearch()) { /* the whole sweep, one query at a time */ }
}

/** One query shape. Returns false when the sweep is done. */
async function oneSearch() {
  const next = SRC.queries.find((x) => !SRC.doneQueries.includes(`${x.site}|${x.q}`));
  if (!next) { SRC.stage = "shortlist"; await saveSourcing(); return false; }
  await at("desk", `${DESKS[next.site].label} — "${next.q}"`, searchUrl(next.site, next.q));
  await phone.beat(1800, 3200);
  for (let pass = 0; pass < 2 && !stopNow(); pass++) {
    await phone.scroll(between(500, 900), { pace: "skim" });
    await phone.pause(1200, 2400);
  }
  const rows = (await phone.read("listings")) ?? [];
  for (const r of rows) {
    if (!r?.name) continue;
    const seenAlready = SRC.listings.some((l) => l.site === next.site && l.name === r.name);
    if (seenAlready) continue;
    SRC.listings.push({
      site: next.site, query: next.q, name: String(r.name), url: r.url ?? null,
      title: r.title ?? null, blurb: r.blurb ?? null, tags: r.tags ?? null, years: r.years ?? null,
      at: new Date().toISOString(),
    });
  }
  SRC.doneQueries.push(`${next.site}|${next.q}`);
  say("desk", `"${next.q}" on ${DESKS[next.site].label}: ${rows.length} listings read, ${SRC.listings.length} on file`);
  await saveSourcing();
  return true;
}

/** shortlist: on what the pages said, with the reasons kept. */
async function stageShortlist() {
  let added = 0;
  for (const l of SRC.listings) {
    const seat = shortlistCase(l);
    if (!seat.keep) continue;
    if (supplierById(`${l.site}:${l.name}`)) continue;
    const s = newSupplier({ name: l.name, site: l.site, url: l.url });
    s.shortlisted = true;
    s.shortlistBecause = seat.because;
    if (l.title || l.blurb) {
      try {
        record(s, "makes", String(l.title ?? l.blurb).slice(0, 200),
          { kind: "page", ref: l.url ?? `${l.site}:${l.query}`, quote: String(l.title ?? l.blurb).slice(0, 300) });
      } catch { /* nothing readable is not a fact */ }
    }
    if (/\b(oem|odm|定制|开模|代工)\b/i.test(`${l.title ?? ""} ${l.blurb ?? ""} ${l.tags ?? ""}`)) {
      try {
        record(s, "oem", true, { kind: "page", ref: l.url ?? `${l.site}:${l.query}`, quote: String(l.title ?? l.blurb ?? l.tags).slice(0, 300) });
      } catch { /* no quote, no fact */ }
    }
    SRC.suppliers.push(s);
    added++;
  }
  say("desk", `shortlist: ${added} new, ${SRC.suppliers.length} factories in total`);
  SRC.stage = SRC.suppliers.length ? "open" : "search";
  await saveSourcing();
  await publishSourcing();
}

/** open + ask: a thread, then a draft. Nothing is typed at this stage. */
async function stageOpen() {
  const s = SRC.suppliers.find((x) => x.shortlisted && !x.threadOpen);
  if (!s) { SRC.stage = "ask"; await saveSourcing(); return; }
  await at("desk", `${DESKS[s.site].label} — opening a conversation with ${s.name}`, s.url ?? DESKS[s.site].messages);
  await phone.beat(1500, 3000);
  const opened = await phone.openThread(s.name, { site: s.site });
  s.threadOpen = Boolean(opened?.ok ?? opened);
  say("desk", s.threadOpen ? `thread open with ${s.name}` : `could not open a thread with ${s.name} yet`);
  await saveSourcing();
}

async function stageAsk() {
  const s = SRC.suppliers.find((x) => x.threadOpen && !SRC.outbox.forSupplier(x.id).length);
  if (!s) { SRC.stage = "wait"; SRC.waitingSince = SRC.waitingSince ?? Date.now(); await saveSourcing(); return; }
  const d = openingDraft(s, { product: SRC.job?.product });
  const draft = SRC.outbox.draft({ supplierId: s.id, site: s.site, name: s.name, text: d.text, asks: d.asks, kind: "opening" });
  say("desk", `drafted the opening to ${s.name} — waiting on Alex to approve it (${draft.id})`);
  await saveSourcing();
  await publishSourcing();
}

/**
 * Send whatever he has approved, and nothing else.
 *
 * The text comes out of the outbox through `release`, which is the only way
 * to get it, and which refuses anything that is not approved.
 */
async function sendApprovedDrafts() {
  for (const it of SRC.outbox.approved()) {
    if (stopNow()) return;
    const s = supplierById(it.supplierId);
    if (!s) continue;
    const out = await sendApproved(SRC.outbox, it.id, async (payload) => {
      await at("desk", `${DESKS[payload.site].label} — writing to ${payload.name}`, undefined);
      const opened = s.threadOpen ? { ok: true } : await phone.openThread(payload.name, { site: payload.site });
      if (!(opened?.ok ?? opened)) return { ok: false, error: "no thread" };
      // A person's pace, but no typos: this is the exact text he approved, and
      // a slip of the finger in a quotation request is not "human", it is wrong.
      const typed = await phone.type(payload.text, {
        into: "message", who: "desk",
        persona: { typing: { cpsMin: 4, cpsMax: 8, typoRate: 0 } },
      });
      if (typed?.ok === false) return typed;
      return phone.send({ site: payload.site, to: payload.name });
    });
    if (out.ok) {
      const at_ = new Date().toISOString();
      logMessage(s, { dir: "out", text: it.text, at: at_, ref: it.id, asks: it.asks });
      for (const id of it.asks) {
        const slot = s.answers[id];
        if (slot && !slot.asked) { slot.asked = at_; slot.why = "asked, no answer yet"; }
      }
      say("desk", `sent to ${s.name}: ${it.asks.length} questions, starting with the measured chill time`);
      SRC.waitingSince = Date.now();
    } else {
      say("desk", `could not send to ${s.name}: ${out.error}`);
    }
    await saveSourcing();
  }
}

/** wait + reply + record: read the threads, file only what was answered. */
async function stageRead() {
  for (const s of SRC.suppliers) {
    if (stopNow()) return;
    if (!s.messages.some((m) => m.dir === "out")) continue;
    await at("desk", `${DESKS[s.site].label} — reading ${s.name}'s replies`, DESKS[s.site].messages);
    await phone.beat(1200, 2400);
    const replies = (await phone.read("thread", { who: s.name, site: s.site })) ?? [];
    let fresh = 0;
    for (const r of replies) {
      // Only what the page said came FROM the supplier. A message whose side
      // the page did not state is not filed as their answer.
      if (!r || r.dir !== "in") continue;
      const ref = r.id ?? `${s.id}@${r.at ?? ""}`;
      if (s.messages.some((m) => m.id === ref)) continue;
      const filed = readReply(s, { text: r.text ?? "", at: r.at ?? new Date().toISOString(), ref });
      fresh++;
      const still = filed.unanswered;
      say("desk", filed.moved.length
        ? `${s.name} answered: ${filed.moved.join(", ")}${still.length ? ` · still open: ${still.join(", ")}` : ""}`
        : `${s.name} replied and answered nothing: ${s.answers.chillTime?.note?.why ?? "nothing usable"}`);
    }
    if (fresh) await saveSourcing();
  }
  SRC.stage = "followup";
  await saveSourcing();
  await publishSourcing();
}

/** followup: only the questions still open, drafted, never sent on its own. */
async function stageFollowUp() {
  for (const s of SRC.suppliers) {
    const open = unanswered(s);
    if (!open.length) continue;
    const already = SRC.outbox.forSupplier(s.id).filter((d) => d.kind === "followup" && d.status !== "rejected");
    const last = s.messages.filter((m) => m.dir === "out").slice(-1)[0];
    const quiet = !last || Date.now() - Date.parse(last.at) > 2 * 86400000;
    if (already.length >= 3 || !quiet) continue;
    const d = followUpDraft(s);
    if (!d) continue;
    const draft = SRC.outbox.draft({ supplierId: s.id, site: s.site, name: s.name, text: d.text, asks: d.asks, kind: "followup" });
    say("desk", `drafted a follow-up to ${s.name} on ${open.length} open questions (${draft.id})`);
  }
  SRC.stage = "wait";
  await saveSourcing();
  await publishSourcing();
}

/** Everything the panel and the MCP need to see, pushed out. */
async function publishSourcing() {
  const table = sourcingTable(SRC.suppliers);
  await cloud.shortlist?.({ job: SRC.job, stage: SRC.stage, ...table }).catch(() => {});
  await cloud.queue?.(SRC.outbox.all()).catch(() => {});
  await cloud.answers?.(table.rows.map((r) => ({
    id: r.id, name: r.name, site: r.site, chillTime: r.chillTime,
    unanswered: r.unanswered, neverAsked: r.neverAsked,
  }))).catch(() => {});
}

/** What he decided about the drafts, from the cloud, applied here. */
async function hearDecisions() {
  const said = await cloud.decisions?.().catch(() => null);
  const list = Array.isArray(said) ? said : Array.isArray(said?.decisions) ? said.decisions : [];
  let moved = 0;
  for (const d of list) {
    try {
      if (d?.decision === "approve") { SRC.outbox.approve(String(d.id), d.by ?? "alex"); moved++; say("desk", `Alex approved ${d.id}`); }
      else if (d?.decision === "reject") { SRC.outbox.reject(String(d.id), d.why ?? "", d.by ?? "alex"); moved++; say("desk", `Alex rejected ${d.id}${d.why ? `: ${d.why}` : ""}`); }
    } catch (e) { say("desk", `${d?.id}: ${e.message}`); }
  }
  if (moved) { await saveSourcing(); await publishSourcing(); }
}

/** One turn of the pipeline. Called on a timer; each stage is resumable. */
export async function stepSourcing() {
  if (!SRC.job || S.paused || S.stopped || quitting) return;
  await hearDecisions();
  await sendApprovedDrafts();
  if (stopNow()) return;
  const stage = SRC.stage;
  S.doing = `sourcing · ${stage}`;
  pushPanel();
  if (stage === "search" || stage === "read") await stageSearch();
  else if (stage === "shortlist") await stageShortlist();
  else if (stage === "open") await stageOpen();
  else if (stage === "ask") await stageAsk();
  else if (stage === "wait") {
    const pending = SRC.outbox.pending().length;
    if (SRC.suppliers.some((x) => x.shortlisted && !x.threadOpen)) { SRC.stage = "open"; }
    else if (SRC.suppliers.some((x) => x.threadOpen && !SRC.outbox.forSupplier(x.id).length)) { SRC.stage = "ask"; }
    else if (SRC.suppliers.some((x) => x.messages.some((m) => m.dir === "out"))) { SRC.stage = "reply"; }
    else if (!pending) { SRC.stage = "search"; }
    await saveSourcing();
  }
  else if (stage === "reply" || stage === "record") await stageRead();
  else if (stage === "followup") await stageFollowUp();
  await report();
}

let sourcing = false;
async function maybeSource() {
  if (S.paused || S.stopped || sourcing) return;
  sourcing = true;
  try { await sourceTurn(); } finally { sourcing = false; }
}

async function sourceTurn() {
  const job = await cloud.sourcing?.().catch(() => null);
  if (job?.product && job.id !== SRC.job?.id) await startSourcing(job);
  await stepSourcing();
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
    jobs: [
      ...(h ? [{ who: NAME.toLowerCase(), what: h.looking, state: S.phase }] : []),
      ...(SRC.job ? [{ who: "desk", what: `sourcing ${SRC.job.product}`, state: SRC.stage, pending: SRC.outbox.pending().length }] : []),
    ],
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
  const approve = /^approve\s+(\S+)/.exec(cmd);
  const reject = /^reject\s+(\S+)\s*(.*)$/.exec(cmd);
  const source = /^source\s+(.+)$/.exec(cmd);
  try {
    if (approve) { SRC.outbox.approve(approve[1]); say("desk", `Alex approved ${approve[1]}`); await saveSourcing(); await publishSourcing(); }
    if (reject) { SRC.outbox.reject(reject[1], reject[2] ?? ""); say("desk", `Alex rejected ${reject[1]}`); await saveSourcing(); await publishSourcing(); }
  } catch (e) { say("desk", e.message); }
  if (source) await startSourcing({ id: `order-${Date.now()}`, product: source[1].trim() });
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
  await loadSourcing();

  bridge = await startBridge({ dir: here, onMessage: fromPage });
  process.stdout.write(`PORT ${bridge.port}\n`);
  phone = new Phone(bridge);

  say("research", `${NAME} is up — build ${S.build}`);
  S.doing = "waiting for the next thing to look for";
  pushPanel();
  await report();

  setInterval(() => { heard().catch(() => {}); }, 6000).unref();
  setInterval(() => { maybeHunt().catch((e) => say("research", `the hunt stopped: ${e?.message ?? e}`)); }, 8000).unref();
  setInterval(() => { maybeSource().catch((e) => say("desk", `the desk stopped: ${e?.message ?? e}`)); }, Number(process.env.RESEARCH_TICK) || 7000).unref();
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
  try { await saveSourcing(); } catch { /* fine */ }
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
