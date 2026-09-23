/**
 * What the hunt found, ranked, in one page.
 *
 * Reyna comes back from an afternoon on TikTok, Instagram and the Ad Library
 * with a few hundred findings. This turns them into the one thing worth
 * having: which product is actually working right now, and the evidence for
 * saying so.
 *
 * Everything here is arithmetic on what was seen. Nothing is invented and
 * nothing is scored on a hunch — a claim in the report is a number that came
 * off a page, or it is not in the report. When the evidence is thin the score
 * says thin, rather than filling the gap with confidence.
 */

/** A product that has been advertised for a month is a product that pays. */
const PROVEN_DAYS = 28;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const day = 86400000;

/**
 * Group findings by the thing they are about.
 *
 * Findings arrive flat — an ad, a seller, a clip — each carrying the query it
 * was found under. The query is the candidate: it is the words Alex asked
 * about, or the words the sweep widened into.
 */
export function groupByQuery(findings = []) {
  const out = new Map();
  for (const f of findings) {
    const q = String(f?.query ?? f?.product ?? "").trim().toLowerCase();
    if (!q) continue;
    if (!out.has(q)) out.set(q, { query: q, ads: [], sellers: [], clips: [] });
    const bucket = out.get(q);
    if (f.kind === "ad") bucket.ads.push(f);
    else if (f.kind === "seller") bucket.sellers.push(f);
    else if (f.kind === "clip" || f.kind === "post") bucket.clips.push(f);
  }
  return [...out.values()];
}

/**
 * One candidate's case, in numbers.
 *
 * Four things matter and they are not equal. That somebody has paid to run an
 * ad for a month is the strongest signal there is — it is the only one that
 * costs the person making it money. Several sellers doing it is next: one
 * seller is a hobby, five is a market. Organic reach says people want to
 * watch it. Freshness only breaks ties.
 */
export function scoreCandidate(bucket) {
  const sellers = bucket.sellers ?? [];
  const ads = bucket.ads ?? [];
  const clips = bucket.clips ?? [];

  const longest = Math.max(0, ...sellers.map((s) => num(s.metrics?.longestDays)), ...ads.map((a) => num(a.metrics?.days)));
  const proven = sellers.filter((s) => num(s.metrics?.longestDays) >= PROVEN_DAYS);
  const views = clips.map((c) => num(c.metrics?.views ?? c.views)).sort((a, b) => b - a);
  const bestViews = views[0] ?? 0;
  const medianViews = views.length ? views[Math.floor(views.length / 2)] : 0;

  // Each part is capped, so no single number can carry a weak case on its own.
  const longevity = Math.min(40, (longest / PROVEN_DAYS) * 28);
  const competition = Math.min(25, proven.length * 7);
  const reach = Math.min(25, Math.log10(Math.max(1, bestViews)) * 4.5);
  const depth = Math.min(10, clips.length * 0.7);

  const score = Math.round(longevity + competition + reach + depth);

  // What the score is actually standing on. A number with nothing under it is
  // worse than no number, so this is said plainly.
  const thin = proven.length === 0 && clips.length < 4;

  return {
    query: bucket.query,
    score,
    thin,
    longestRunDays: longest,
    provenSellers: proven.length,
    sellers: sellers.length,
    ads: ads.length,
    clips: clips.length,
    bestViews,
    medianViews,
    topSellers: [...sellers]
      .sort((a, b) => num(b.metrics?.longestDays) - num(a.metrics?.longestDays))
      .slice(0, 5)
      .map((s) => ({ who: s.who ?? s.title ?? "someone", days: num(s.metrics?.longestDays), url: s.url ?? null })),
    topClips: [...clips]
      .sort((a, b) => num(b.metrics?.views ?? b.views) - num(a.metrics?.views ?? a.views))
      .slice(0, 5)
      .map((c) => ({
        url: c.url ?? null,
        who: c.who ?? null,
        views: num(c.metrics?.views ?? c.views),
        platform: c.platform ?? null,
      })),
    topAds: [...ads]
      .sort((a, b) => num(b.metrics?.days) - num(a.metrics?.days))
      .slice(0, 4)
      .map((a) => ({ who: a.who ?? null, days: num(a.metrics?.days), text: (a.title ?? "").slice(0, 180), url: a.url ?? null })),
  };
}

/** One honest sentence about a candidate, built only from its own numbers. */
export function verdict(c) {
  if (c.thin) {
    return `Not enough seen yet: ${c.provenSellers} advertisers past ${PROVEN_DAYS} days and ${c.clips} clips. Worth another sweep before spending anything.`;
  }
  const bits = [];
  if (c.provenSellers) {
    bits.push(`${c.provenSellers} advertiser${c.provenSellers === 1 ? " has" : "s have"} been paying to run this for ${c.longestRunDays} days or more`);
  } else if (c.longestRunDays) {
    bits.push(`the longest ad running is ${c.longestRunDays} days — nobody has proved it for a month yet`);
  }
  if (c.bestViews) bits.push(`the best clip did ${c.bestViews.toLocaleString("en-US")} views`);
  if (c.clips) bits.push(`${c.clips} clips seen across the sweep`);
  return bits.join("; ") + ".";
}

/**
 * The arithmetic that decides whether a candidate can carry the day Alex
 * asked for. The target is his — a thousand a day, ten thousand a day,
 * whatever he said — and it is never assumed here.
 *
 * Price comes off the sellers' own pages. When it was not read, this returns
 * what it knows and says the rest is unknown, because a made-up price makes
 * every number after it a lie.
 */
export function targetMath(candidate, { targetPerDay = null, price = null, cost = null } = {}) {
  const p = num(price) || num(candidate?.price);
  const target = num(targetPerDay);
  if (!target) return { known: false, why: "no daily target was given" };
  if (!p) return { known: false, target, why: "no price was read off a seller's page" };
  const ordersPerDay = Math.ceil(target / p);
  const margin = num(cost) ? p - num(cost) : null;
  return {
    known: true,
    target,
    price: p,
    ordersPerDay,
    margin,
    // Half of gross margin is the most a small store survives paying for a
    // customer. More than that and the winner eats the business.
    adRoomPerOrder: margin == null ? null : Math.round(margin * 0.5 * 100) / 100,
    note: margin == null
      ? `${ordersPerDay} orders a day at ${p}. Landed cost unknown, so the ad room cannot be worked out yet.`
      : `${ordersPerDay} orders a day at ${p}, about ${Math.round(margin * 0.5)} of ad room per order.`,
  };
}

/**
 * The whole report.
 *
 * `looking` is what Alex asked for, in his words, kept at the top so the
 * report answers the question he asked rather than the one the data suited.
 */
export function buildReport({
  looking = "", findings = [], at = Date.now(), sweptFor = null,
  targetPerDay = null, window: windowSaid = null, prices = {},
} = {}) {
  const candidates = groupByQuery(findings).map(scoreCandidate).sort((a, b) => b.score - a.score);
  const solid = candidates.filter((c) => !c.thin);
  const best = solid[0] ?? null;
  const withMath = candidates.map((c) => ({
    ...c,
    math: targetMath(c, { targetPerDay, price: prices[c.query] ?? null }),
  }));
  const best2 = withMath.find((c) => !c.thin) ?? null;

  return {
    looking: String(looking ?? ""),
    at,
    sweptFor,
    // His numbers, kept as his: the report answers the day he asked about.
    targetPerDay: targetPerDay == null ? null : num(targetPerDay),
    window: windowSaid,
    seen: {
      findings: findings.length,
      candidates: candidates.length,
      fresh: findings.filter((f) => f.at && Date.now() - Date.parse(f.at) < 2 * day).length,
    },
    best: best2 ? { ...best2, verdict: verdict(best2) } : null,
    // Nothing solid is a real answer, and it gets said rather than dressed up.
    nothingSolid: !best2,
    candidates: withMath.map((c) => ({ ...c, verdict: verdict(c) })),
  };
}
