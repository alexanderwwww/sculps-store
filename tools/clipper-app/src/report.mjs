/*
 * Sweep evidence -> the report object posted to the control plane.
 *
 * It does not judge. Claude judges, from this evidence, with the skills. This
 * only counts and measures what was read: ads and advertisers, the longest
 * running ad, views, comments read, buying signals, search growth, the Q4 day
 * counts, store prices and offers. Where too little was seen it says so.
 *
 * The live report page (Kerberos /research/<key>/report) was built for the old
 * app's shape, so `at`, `seen` and `candidates` are also filled in that shape;
 * `best` stays null because picking one is Claude's job, not this file's.
 */
import { calendar } from "./q4.mjs";
import { tally } from "./signals.mjs";

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const max = (xs) => xs.reduce((m, x) => (num(x) !== null && (m === null || x > m) ? x : m), null);
const sum = (xs) => xs.reduce((s, x) => s + (num(x) ?? 0), 0);

function perQuery(query, items) {
  const by = (src) => items.filter((e) => e && e.source === src);
  const ad = by("adlibrary")[0] || null;
  const tt = by("tiktok")[0] || null;
  const ig = by("instagram")[0] || null;
  const tr = by("trends")[0] || null;

  const ads = ad && Array.isArray(ad.ads) ? ad.ads : [];
  const clips = tt && Array.isArray(tt.clips) ? tt.clips : [];
  const posts = ig && Array.isArray(ig.posts) ? ig.posts : [];
  const ttSignals = clips.flatMap((c) => c.signals || []);
  const igSignals = posts.flatMap((p) => p.signals || []);
  const longest = max(ads.map((a) => a.days));
  const advertisers = new Set(ads.map((a) => a.advertiser).filter(Boolean)).size;
  const longRunners = new Set(ads.filter((a) => (a.days ?? 0) >= 28).map((a) => a.advertiser).filter(Boolean)).size;

  const hints = [];
  if (ad && ad.blocked) hints.push(`Ad Library not read (${ad.blocked}).`);
  else if (ad && !ads.length) hints.push("No active US ads found for this query.");
  if (longRunners) hints.push(`${longRunners} advertiser(s) have run an ad 28+ days (paying for it, so it likely sells).`);
  if (tt && tt.blocked) hints.push(`TikTok not read (${tt.blocked}).`);
  if (ig && ig.blocked) hints.push(`Instagram not read (${ig.blocked}).`);
  const commentsRead = sum(clips.map((c) => c.commentsRead)) + sum(posts.map((p) => p.commentsRead));
  if (commentsRead && ttSignals.length + igSignals.length === 0) hints.push(`${commentsRead} comments read, no buying signals.`);
  if (num(tr?.growth4w) !== null) hints.push(`Search interest ${tr.growth4w >= 0 ? "up" : "down"} ${Math.abs(tr.growth4w)}% over the last 4 weeks.`);
  const thin = ads.length < 3 && clips.length < 3 && posts.length < 2;
  if (thin) hints.push("Not enough seen yet for this query.");

  return {
    query,
    ads: {
      count: ads.length,
      advertisers,
      longRunners,
      longestDays: longest,
      top: [...ads].sort((a, b) => (b.days ?? -1) - (a.days ?? -1)).slice(0, 5)
        .map((a) => ({ advertiser: a.advertiser, days: a.days, startedOn: a.startedOn, landing: a.landing, libraryId: a.libraryId, text: String(a.text || "").slice(0, 160) })),
      url: ad?.url ?? null,
    },
    tiktok: {
      clips: clips.length,
      bestViews: max(clips.map((c) => c.views)),
      comments: sum(clips.map((c) => c.commentsRead)),
      signals: ttSignals.length,
      kinds: tally(ttSignals),
      topSignals: ttSignals.slice(0, 8),
      topClips: [...clips].sort((a, b) => (b.views ?? -1) - (a.views ?? -1)).slice(0, 5)
        .map((c) => ({ url: c.url, author: c.author, views: c.views, likes: c.likes, comments: c.comments })),
      url: tt?.url ?? null,
    },
    instagram: {
      posts: posts.length,
      comments: sum(posts.map((p) => p.commentsRead)),
      signals: igSignals.length,
      kinds: tally(igSignals),
      topSignals: igSignals.slice(0, 8),
      url: ig?.url ?? null,
    },
    trends: tr && !tr.blocked
      ? { growth4w: num(tr.growth4w), yoy: num(tr.yoy), peakWeek: tr.peakWeek ?? null, weeks: (tr.weekly || []).length, url: tr.url }
      : { growth4w: null, yoy: null, peakWeek: null, weeks: 0, url: tr?.url ?? null },
    thin,
    verdictHints: hints,
  };
}

function storesBlock(ev) {
  const st = ev.find((e) => e && e.source === "stores");
  return (st?.stores || []).map((s) => {
    const prices = (s.products || []).map((p) => p.price).filter((p) => num(p) !== null);
    return {
      domain: s.domain,
      shopify: Boolean(s.shopify),
      products: (s.products || []).length,
      priceMin: prices.length ? Math.min(...prices) : null,
      priceMax: prices.length ? Math.max(...prices) : null,
      offers: (s.products || []).filter((p) => p.offer).slice(0, 6).map((p) => ({ title: p.title, price: p.price, compareAt: p.compareAt, url: p.url })),
      freeShippingOver: num(s.freeShippingOver),
      top: (s.products || []).slice(0, 6).map((p) => ({ title: p.title, price: p.price, compareAt: p.compareAt, url: p.url })),
    };
  });
}

export function buildReport({ hunt, goals = null, evidence = [], build = null, startedAt = Date.now(), endedAt = Date.now(), partial = false }) {
  const ev = (evidence || []).filter(Boolean);
  const queries = [...new Set(ev.map((e) => e.query ?? e.tag ?? null).filter(Boolean).filter((q, i, a) => a.indexOf(q) === i))];
  const ordered = [];
  for (const e of ev) if (e.query && !ordered.includes(e.query)) ordered.push(e.query);
  const pq = ordered.map((q) => perQuery(q, ev.filter((e) => e.query === q)));
  const stores = storesBlock(ev);
  const blocked = ev.filter((e) => e.blocked).map((e) => ({ source: e.source, query: e.query ?? null, reason: e.blocked }));

  const totals = {
    ads: sum(pq.map((p) => p.ads.count)),
    clips: sum(pq.map((p) => p.tiktok.clips)),
    posts: sum(pq.map((p) => p.instagram.posts)),
    comments: sum(pq.map((p) => p.tiktok.comments + p.instagram.comments)),
    signals: sum(pq.map((p) => p.tiktok.signals + p.instagram.signals)),
    stores: stores.length,
  };

  const notes = [];
  if (partial) notes.push("Partial: the sweep was stopped before it finished.");
  if (!pq.length) notes.push("Nothing was read.");
  if (blocked.length) notes.push(`Blocked: ${blocked.map((b) => `${b.source}${b.query ? ` (${b.query})` : ""}: ${b.reason}`).join("; ")}.`);
  notes.push("Evidence only. The verdict is Claude's, made with the skills; no supplier cost or shipping is read here.");

  // The old page's shape, so the live report URL stays readable.
  const candidates = pq.map((p) => ({
    query: p.query,
    score: 0,
    thin: p.thin,
    verdict: p.verdictHints.join(" ") || "Read, nothing notable.",
    longestRunDays: p.ads.longestDays ?? 0,
    provenSellers: p.ads.longRunners,
    sellers: p.ads.advertisers,
    ads: p.ads.count,
    clips: p.tiktok.clips + p.instagram.posts,
    bestViews: p.tiktok.bestViews ?? 0,
    topSellers: p.ads.top.filter((a) => a.advertiser).map((a) => ({ who: a.advertiser, days: a.days ?? 0, url: a.libraryId ? `https://www.facebook.com/ads/library/?id=${a.libraryId}` : null })),
    topClips: p.tiktok.topClips.map((c) => ({ url: c.url, who: c.author, views: c.views ?? 0, platform: "TikTok" })),
    math: { known: false, why: "supplier cost and shipping are not read by ultracursor; Claude does the margin from the supplier's page" },
  }));

  return {
    app: "ultracursor",
    looking: hunt?.looking ?? "",
    huntId: hunt?.id ?? null,
    targetPerDay: hunt?.targetPerDay ?? null,
    window: hunt?.window ?? null,
    build: build === null ? null : String(build),
    at: endedAt,
    startedAt,
    seconds: Math.round((endedAt - startedAt) / 1000),
    partial: Boolean(partial),
    goals,
    q4: calendar(endedAt),
    perQuery: pq,
    stores,
    blocked,
    totals,
    notes,
    seen: { findings: totals.ads + totals.clips + totals.posts + totals.stores, candidates: pq.length },
    best: null,
    candidates,
    queries,
  };
}
