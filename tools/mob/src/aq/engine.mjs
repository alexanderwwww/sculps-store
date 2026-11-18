// Aquarius engine: the one-minute PAPER tick. Scouts -> Hecate safety -> Athena setup -> Costs -> Council -> Zeus risk ->
// Hermes paper fill -> Review -> Learning -> Ops. PAPER ONLY: no wallet, no keys, no orders. Missing data = NO trade.
import { db } from "../db.mjs";
import { DEPTS, seedWorkers, TOOLS, STRATEGIES, GTA6_DATE, GTA_RE, GTA6_MINT, CEO, R5_PARAMS } from "./seed.mjs";
import { feeds, midPrices, jupQuote, SOL_MINT, jupPrices, getJson, CALLS, CAPS, resetCalls } from "./feeds.mjs";
import { fibSetup, safety, roundTripPct, sizeFor, stats, replay, round, survival, whaleSetup, replaySetup, momentumSetup, bounceSetup, planFor, atr5Pct, median } from "./logic.mjs";
import { whaleSignal, shadowTick, shadowStats, mineTick, followSignals, whaleState, logSignal, signalEvidence, EVIDENCE_MIN, scoreTick, kolTick } from "./whales.mjs";
import { lanesTick, laneStats } from "./lanes.mjs";
import { nansenTick, nansenSignals, nansenState } from "./nansen.mjs";
import { councilTick, learnFromTrade, recomputeRules, costBook, ruleWeights, MIN_OWN_BARS } from "./council.mjs";
import { R6_PARAMS, R7_PARAMS } from "./seed.mjs";
import { COUNCIL, STRENGTH_BUCKETS } from "./logic.mjs";
import { trainingState } from "./arena.mjs";
import { publicState as rhPublic } from "./robinhood.mjs";
import { walletPublic } from "./wallet.mjs";
import { liveState } from "./live.mjs";
import { publicPayout, withdrawals } from "./payout.mjs";
import { watch } from "./keeper.mjs";
import { seatTick, seatStats, exitVotes, exitVoteRule, markHandled, impliedMid, warroom, chatFor, recentAlerts } from "./seat.mjs";
import { START_SOL, reconcile, scaleOut, closePosition, resetLedger, walletBase, tickLock, tickUnlock } from "./ledger.mjs";
export { START_SOL };

export const AQ_BUILD = "aq-engine-1";
// Network fee per side, in SOL (the chain charges lamports, not dollars). MEASURED 2026-11-16 15:10-15:25Z: meta.fee (base +
// priority fee) of 122 real swaps of 0.01-0.2 SOL on 40 trending / most-traded coins, read with getTransaction on the public
// RPC: min 5,000, quartile 8,690, median 15,001, upper quartile 55,777, 90th percentile 145,000, MEAN 60,957 lamports.
// The old assumption ($0.0067 = about 95,000 lamports at SOL $70) sat near the 85th percentile and alone was 39% of the
// audited loss. The paper book now charges the measured mean, rounded up (0.000061 SOL): above the median on purpose, because
// meta.fee does not include Jito tips or the one-time token-account rent. Detail: .claude/skills/trading-kb/fee-2026-11-16.md
export const NET_FEE_LAMPORTS = 61000, NET_FEE_SOL = NET_FEE_LAMPORTS / 1e9;
// A stop does not fill at the stop. Overshoot of the mid past the stop level, measured by the 2026-11-16 audit on 15 paper stops;
// replaced by this desk's own measurement (trades.overshoot_pct) once ten stops carry one.
export const AUDIT_OVERSHOOT_PCT = 0.69;
export const SOL_PRICE_MAX_AGE_SEC = 600;
const BINANCE_SOL = "https://data-api.binance.vision/api/v3/ticker/price?symbol=SOLUSDT"; // shape read 2026-11-16: {"symbol":"SOLUSDT","price":"70.43000000"}
export { MIN_OWN_BARS };
// Our own 1-minute candles from the price samples: open = the previous bar's close (one sample a minute would otherwise
// make every bar flat), high/low/close from the samples inside the minute. Last 60 minutes, oldest first.
export async function ownCandles(d, mint) {
  const rows = await d.q(`SELECT extract(epoch from date_trunc('minute', at))::bigint t, max(price) h, min(price) l, (array_agg(price ORDER BY at DESC))[1] c, (array_agg(price ORDER BY at))[1] f
    FROM mob_aq_prices WHERE mint=$1 AND at > now() - interval '61 minutes' GROUP BY 1 ORDER BY 1`, [mint]);
  return rows.map((r, i) => { const o = i ? rows[i - 1].c : r.f; return { t: Number(r.t), o, h: Math.max(r.h, o), l: Math.min(r.l, o), c: r.c, v: 0 }; });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const seeded = new Set();
export async function ensureSeed(env) {
  const d = db(env), tag = d.schema || "public";
  if (seeded.has(tag)) return;
  const have = await d.one(`SELECT count(*)::int n FROM mob_aq_bots WHERE created_by='seed'`);
  for (const [id, name, god, skills] of DEPTS) await d.q(`INSERT INTO mob_aq_depts (id, name, god, skills) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, god=EXCLUDED.god, skills=EXCLUDED.skills`, [id, name, god, JSON.stringify(skills)]);
  if (have.n < 144) {
    const w = seedWorkers();
    await d.q(`INSERT INTO mob_aq_bots (key, dept, name, job, rules, skills, power, note, created_by, approved)
      SELECT k, dp, nm, jb, rl, sk::jsonb, pw, 'not wired yet', 'seed', true FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::text[]) x(k,dp,nm,jb,rl,sk,pw)
      ON CONFLICT (key) DO NOTHING`, [w.map((x) => x.key), w.map((x) => x.dept), w.map((x) => x.name), w.map((x) => x.job), w.map((x) => x.rules), w.map((x) => JSON.stringify(x.skills)), w.map((x) => x.power)]);
  }
  for (const [name, licence, verdict, used_by, best] of TOOLS) await d.q(`INSERT INTO mob_aq_tools (name, licence, verdict, status, used_by, best_use) VALUES ($1,$2,$3,'planned',$4,$5) ON CONFLICT (name) DO NOTHING`, [name, licence, verdict, used_by, best]);
  for (const [id, name, market, status, params] of STRATEGIES) await d.q(`INSERT INTO mob_aq_strategies (id, name, market, status, params, alive) VALUES ($1,$2,$3,$4,$5,true) ON CONFLICT (id) DO NOTHING`, [id, name, market, status, JSON.stringify(params)]);
  await d.q(`INSERT INTO mob_aq_state (k, v) VALUES ('cash_sol', $1), ('kill', 'false'), ('mode', '"PAPER"') ON CONFLICT (k) DO NOTHING`, [JSON.stringify(START_SOL)]);
  // R5 went from "not tested" to paper on Alex's word (2026-11-16, "whales first"). A recorded change, never a silent one.
  const r5 = await d.one(`UPDATE mob_aq_strategies SET status='paper', name=$1, params=$2 WHERE id='R5' AND status='not tested' RETURNING id`, [STRATEGIES[4][1], JSON.stringify(R5_PARAMS)]);
  // recipe v3 (Alex, 2026-11-16): signals in units of each coin's own volatility. Stored params from before that are replaced, on the record.
  const v3 = await d.q(`UPDATE mob_aq_strategies SET params = CASE id WHEN 'R6' THEN $1::jsonb ELSE $2::jsonb END WHERE id IN ('R6','R7') AND NOT (params ? 'atrStop') RETURNING id`, [JSON.stringify(STRATEGIES[5][4]), JSON.stringify(STRATEGIES[6][4])]);
  if (v3.length) await brain(d, "learning", "tournament", `Recipe v3 adopted for ${v3.map((r) => r.id).join(", ")}: breakout, bounce, stops and targets are measured in the coin's own 5-minute ATR instead of fixed percentages; fib swings need 3x ATR instead of a fixed 8%.`);
  if (r5) await brain(d, "learning", "tournament", "R5 whale follow activated on PAPER by Alex (2026-11-16): entry = 2+ independent winning wallets buying a coin that passes safety and the cost gate; stop under the recent swing low (4-12%), target 2.5x the stop, 30 min time stop.");
  // recipe v4 (audit 2026-11-16), each change on the record once
  const v4 = await d.one(`UPDATE mob_aq_strategies SET params=$1 WHERE id='R5' AND NOT (params ? 'atrStop') RETURNING id`, [JSON.stringify(R5_PARAMS)]);
  if (v4) await brain(d, "learning", "tournament", "Recipe v4, R5: the fixed 4% stop / 10% target floor is gone (27 tier A trades never reached such targets); the stop floor is 1.5x the coin's own 5-minute ATR, the target stays 2.5x the stop. Source: audit 2026-11-16, cause 3.");
  if (!(await getState(d, "recipe_v4", null))) {
    await setState(d, "recipe_v4", { at: new Date().toISOString() });
    await brain(d, "learning", "tournament", "Recipe v4 (audit 2026-11-16), all strategies: (1) a coin is tradable only when 6x its measured round trip fits inside 3x its 5-minute ATR; (2) stop and target are anchored to the actual fill and a fill outside them is refused; (3) a stop is confirmed against the executable sell quote; (4) stops are never inside the noise of the hold (ATR5 x sqrt(hold/5)); (5) two independent seeded coin flips per trade: exit A plain / B half off at +1R (B no longer caps the stop), and time L recipe time stop / S flat after 10 minutes; (6) R6 and R5 leave the real paper ledger for the shadow lane until R6's replay with measured cost is positive and R5's signals beat a matched control on 200+ signals; (7) every strategy is blocked when its own replay loses; (8) EXPLORE takes the smallest size that clears the fee floor. These are hypotheses from one 8-hour sample, to be judged by the tournament, not proof.");
    await recomputeRules(d, "recipe v4: the old step counted losses for rules that object to every coin");
    await brain(d, "costs", "tournament", `Network fee corrected by measurement: ${NET_FEE_LAMPORTS} lamports (${NET_FEE_SOL} SOL) a side, the mean of 122 real swaps of 0.01-0.2 SOL read from the chain on 2026-11-16 (median 15,001, 90th percentile 145,000). Was $0.0067 a side (about 95,000 lamports), near the 85th percentile. Jito tips and token-account rent are not in the measurement.`);
  }
  if (!(await getState(d, "whale_book_v2", null))) {
    await setState(d, "whale_book_v2", { at: new Date().toISOString() });
    const old = await d.one(`SELECT count(*) FILTER (WHERE winner)::int w FROM mob_aq_whales`);
    await brain(d, "whales", "tournament", `Whale book rebuilt (audit 2026-11-16, cause 5): the ${old.w} old "winners" are dropped. A winner now needs 5+ closed coins whose buy we saw before the sell and that were held over a minute, 60% of them won and a positive net, and then Jupiter's wallet scorecard: at most 100 swaps a day and a net with open bags above zero. The old top wallet has 23,080 swaps in five days by that scorecard: a bot. KOLscan's named wallets join as labelled seeds. The signal reads up to 90 swaps instead of 30. R5 stays on the shadow lane until 200+ signals beat their control.`);
  }
  seeded.add(tag);
}
export const _resetSeeded = () => seeded.clear();

async function getState(d, k, dflt = null) { const r = await d.one(`SELECT v FROM mob_aq_state WHERE k=$1`, [k]); return r ? r.v : dflt; }
async function setState(d, k, v) { await d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ($1,$2,now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [k, JSON.stringify(v)]); }
const flow = (d, kind, sol, dept, label) => d.q(`INSERT INTO mob_aq_flows (kind, sol, dept, label) VALUES ($1,$2,$3,$4)`, [kind, round(sol, 9), dept, label]);
const brain = (d, dept, kind, text, data = null) => d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ($1,$2,$3,$4)`, [dept, kind, text, data && JSON.stringify(data)]);

async function council(d, verdict, c, reason, number, facts = {}) {
  // A repeated identical verdict within the cooldown is not written again (no 1440 copies a day).
  const last = await d.one(`SELECT verdict, reason, symbol FROM mob_aq_council WHERE coalesce(mint,'')=coalesce($1,'') ORDER BY id DESC LIMIT 1`, [c?.mint || null]);
  if (verdict === "BLOCK" && last && last.reason === reason && last.verdict === verdict && !c?.mint) return;
  await d.q(`INSERT INTO mob_aq_council (verdict, symbol, mint, strategy, reason, number, facts) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [verdict, c?.symbol || null, c?.mint || null, c?.strategy || null, reason, number == null || !Number.isFinite(Number(number)) ? null : Number(number), JSON.stringify(facts)]);
}

// ---------------------------------------------------------------- the tick
export async function tick(env, opts = {}) {
  const d = db(env);
  await ensureSeed(env);
  const lock = await tickLock(d);
  if (!lock) return { skipped: "another tick is running" };
  const gap = opts.gapMs ?? Number(env.AQ_JUP_GAP_MS ?? 1100);
  const nowSec = (opts.now ?? Date.now()) / 1000;
  const W = {}; // worker key -> [status, note]
  const set = (k, s, n) => { W[k] = [s, String(n).slice(0, 200)]; };
  const health = {};
  const out = { evaluated: [], entered: null, exits: [], feeds: health };
  resetCalls();
  try {
    const kill = (await getState(d, "kill", false)) === true;
    const destroyed = (await getState(d, "destroyed", false)) === true; // only Alex's rebuild clears it
    const strategies = Object.fromEntries((await d.q(`SELECT * FROM mob_aq_strategies`)).map((s) => [s.id, s]));
    const P = strategies.R3?.params || STRATEGIES[2][4];

    // ---- feeds (cached, so most ticks read the database, not the internet)
    const [tr, nw, mj, fg, un, jt] = await Promise.all([feeds.trending(env), feeds.newPools(env), feeds.majors(env), feeds.fng(env), feeds.universe(env), feeds.jupTop(env)]);
    health.jupiter_lists = jt.ok;
    // tradable = can pass the gate: liquidity at or above it, real volume in the last hour, older than a few minutes
    // (a coin a Nansen-labelled trader just bought is judged on liquidity alone: the volume and age preference is for list coins)
    const tradable = (p) => (p.liqUsd || 0) >= COUNCIL.hardMinLiq && (p.src === "nansen" || ((p.volH1 == null || p.volH1 >= (P.minVolH1Usd ?? 10000)) && (!p.createdAt || nowSec * 1000 - Date.parse(p.createdAt) >= (P.minAgeMin ?? 10) * 60000)));
    const jtop = (jt.data || []).map((p) => ({ ...p, src: "jupiter" }));
    // Nansen (Alex's own signed-in browser): one gentle step per tick; its fresh labelled buys join the candidates
    try { out.nansen = await nansenTick(env, { set, nowMs: nowSec * 1000 }); } catch (e) { out.nansen = { error: String(e.message || e).slice(0, 120) }; }
    const nz = await nansenSignals(d);
    const nzCands = Object.entries(nz).filter(([, v]) => v.cand).map(([, v]) => ({ ...v.cand, src: "nansen" }));
    const uni = un.data || un.stale || null; // boost and profile flags may come from the last good read; candidates never do
    Object.assign(health, { geckoterminal: tr.ok && nw.ok, dexscreener: un.ok, coingecko: mj.ok && mj.data?.src === "coingecko", sol_price: !!mj.data?.sol, feargreed: fg.ok });
    let solUsd = mj.data?.sol?.price ?? (tr.data || []).find((p) => p.solUsd)?.solUsd ?? null;
    let solSrc = solUsd ? (mj.data?.sol?.price ? mj.data.src : "geckoterminal") : null;
    let feeSol = solUsd ? NET_FEE_SOL : null;
    const boosted = new Set(uni?.boosted || []);
    const profiles = uni?.profiles || {};
    set("sol.new_pairs", un.ok || nw.ok ? "busy" : "blocked", `${un.ok ? `${un.data.pairs.length} DexScreener pairs` : `DexScreener refused: ${un.err}`}; ${nw.ok ? `${nw.data.length} new GeckoTerminal pools` : "GeckoTerminal not answering (bonus feed)"}`.slice(0, 190));
    set("sol.boosted", un.ok ? "busy" : "blocked", (un.ok ? `${boosted.size} paid boosts flagged` : `DexScreener refused (${un.err}); ${boosted.size} flags from the last good read`).slice(0, 190));
    set("nw.tokens", un.ok ? "busy" : "blocked", (un.ok ? `${Object.keys(profiles).length} token profiles read` : `DexScreener refused (${un.err})`).slice(0, 190));
    set("stk.regime", mj.ok ? "busy" : "blocked", (mj.ok ? `SOL $${mj.data.sol?.price ?? "?"} BTC $${mj.data.btc?.price ?? "unknown"} (${mj.data.src})` : `price feeds failed: ${mj.err}`).slice(0, 190));
    set("nw.fng", fg.ok ? "busy" : "blocked", fg.ok ? `Fear and Greed ${fg.data.value} (${fg.data.label})` : `alternative.me failed: ${fg.err}`);
    const daysToGta = Math.ceil((Date.parse(GTA6_DATE + "T00:00:00Z") / 1000 - nowSec) / 86400);
    set("nw.calendar", "busy", daysToGta > 0 ? `GTA 6 in ${daysToGta} day(s)` : daysToGta === 0 ? "GTA 6 releases today" : `GTA 6 out ${-daysToGta} day(s)`);

    // ---- candidates: trending first, then new; copycats and narrative tags
    // ---- watchlist: every pair seen at or above the liquidity gate is tracked from then on; the top 15 get a price
    // sample every tick, which builds our own 1-minute candles (no dependence on GeckoTerminal for history)
    const found = [...jtop, ...(tr.data || []).map((p) => ({ ...p, src: "trending" })), ...(un.data?.pairs || []).map((p) => ({ ...p, src: "dexscreener" })), ...(nw.data || []).map((p) => ({ ...p, src: "new" }))];
    const liquid = [...new Map(found.filter((p) => p.mint && (p.liqUsd || 0) >= P.minLiqUsd).map((p) => [p.mint, p])).values()]; // one row per mint
    if (liquid.length) await d.q(`INSERT INTO mob_aq_watch (mint, pool, symbol, liq_usd, vol_h1, ch1h, price_usd, src) SELECT * FROM unnest($1::text[],$2::text[],$3::text[],$4::float8[],$5::float8[],$6::float8[],$7::float8[],$8::text[])
      ON CONFLICT (mint) DO UPDATE SET liq_usd=EXCLUDED.liq_usd, vol_h1=EXCLUDED.vol_h1, ch1h=EXCLUDED.ch1h, price_usd=EXCLUDED.price_usd, last_seen=now()`,
      [liquid.map((p) => p.mint), liquid.map((p) => p.pool), liquid.map((p) => p.symbol), liquid.map((p) => p.liqUsd), liquid.map((p) => p.volH1), liquid.map((p) => p.ch1h), liquid.map((p) => p.priceUsd), liquid.map((p) => p.src)]);
    const watch = await d.q(`SELECT * FROM mob_aq_watch WHERE last_seen > now() - interval '1 day' AND liq_usd >= $1 ORDER BY liq_usd DESC LIMIT 15`, [P.minLiqUsd]);
    // one Jupiter price call a tick samples every watched coin (and SOL); the samples become our own 1-minute candles
    let jp = null;
    const sigMints = (await d.q(`SELECT DISTINCT m FROM (SELECT mint m, id FROM mob_aq_signals WHERE pct_60m IS NULL AND price_usd IS NOT NULL AND at > now() - interval '3 hours'
        UNION ALL SELECT ctrl_mint, id FROM mob_aq_signals WHERE ctrl_mint IS NOT NULL AND ctrl_60m IS NULL AND at > now() - interval '3 hours') x LIMIT 30`)).map((r) => r.m);
    if (watch.length || sigMints.length) {
      try { jp = await jupPrices([SOL_MINT, ...watch.map((w) => w.mint), ...sigMints]); health.prices = Object.keys(jp).length > 0; } catch (e) { health.prices = false; health.prices_error = String(e.message || e).slice(0, 120); }
      const px = watch.filter((w) => jp?.[w.mint]);
      if (px.length) {
        await d.q(`INSERT INTO mob_aq_prices (mint, price) SELECT * FROM unnest($1::text[],$2::float8[]) ON CONFLICT DO NOTHING`, [px.map((w) => w.mint), px.map((w) => jp[w.mint].price)]);
        await d.q(`UPDATE mob_aq_watch w SET price_usd=x.p FROM unnest($1::text[],$2::float8[]) x(m,p) WHERE w.mint=x.m`, [px.map((w) => w.mint), px.map((w) => jp[w.mint].price)]);
      }
      await d.q(`DELETE FROM mob_aq_prices WHERE at < now() - interval '2 days'`);
    }
    // liquidity: DexScreener's number while it is fresh (seen in the last 30 minutes), else Jupiter's own liquidity figure
    const fresh = watch.filter((w) => jp?.[w.mint]).map((w) => ({ pool: w.pool, name: `${w.symbol} / SOL`, symbol: w.symbol || "", mint: w.mint, quoteMint: SOL_MINT, priceUsd: jp[w.mint].price, solUsd: null,
      liqUsd: Date.now() - new Date(w.last_seen).getTime() < 1800000 ? w.liq_usd : jp[w.mint].liqUsd, createdAt: null, ch5m: null, ch1h: w.ch1h, volM5: null, volH1: w.vol_h1 }));
    if (!solUsd && jp?.[SOL_MINT]) { solUsd = jp[SOL_MINT].price; solSrc = "jupiter"; }
    // a tick must never leave open positions unmanaged for want of a SOL price: Jupiter asked directly, then Binance's public
    // ticker, then the last price this desk saw (any age, for exits only; entries need one no older than 10 minutes)
    if (!solUsd) { try { solUsd = (await jupPrices([SOL_MINT]))[SOL_MINT]?.price ?? null; if (solUsd) solSrc = "jupiter"; } catch {} }
    if (!solUsd) { try { const b = Number((await getJson(BINANCE_SOL, 5000))?.price); if (Number.isFinite(b) && b > 0) { solUsd = b; solSrc = "binance SOLUSDT"; } } catch {} }
    const solLast = await getState(d, "sol_usd", null);
    const noSol = await getState(d, "no_sol_ticks", { total: 0, run: 0 });
    let solExit = solUsd, solAgeSec = 0;
    if (solUsd) { await setState(d, "sol_usd", { price: solUsd, src: solSrc, at: nowSec }); if (noSol.run) await setState(d, "no_sol_ticks", { ...noSol, run: 0 }); }
    else {
      noSol.total++; noSol.run++; noSol.lastAt = new Date(nowSec * 1000).toISOString();
      await setState(d, "no_sol_ticks", noSol);
      if (solLast?.price) { solExit = solLast.price; solAgeSec = Math.round(nowSec - solLast.at); solSrc = `last seen ${solAgeSec}s ago (${solLast.src})`; if (solAgeSec <= SOL_PRICE_MAX_AGE_SEC) solUsd = solLast.price; }
    }
    feeSol = solUsd ? NET_FEE_SOL : null; // an entry needs a SOL price (its levels are dollar prices); the fee itself does not
    const feeExit = NET_FEE_SOL;
    health.sol_price = !!solUsd;
    health.counters = { noSolPriceTicks: noSol.total, noSolPriceRun: solUsd && !solAgeSec ? 0 : noSol.run, solPriceSource: solSrc, solPriceAgeSec: solAgeSec, stopsUnconfirmed: 0 };
    const tracked = fresh.map((p) => ({ ...p, src: "watchlist" })).sort((a, b) => (b.volH1 || 0) - (a.volH1 || 0));
    const jtrade = jtop.filter(tradable);
    // matched controls for signal logging: coins priced this very tick that nobody signalled
    const controls = fresh.map((p) => ({ mint: p.mint, symbol: p.symbol, price: p.priceUsd, liqUsd: p.liqUsd }));
    // every Nansen-labelled buy is logged as a signal of source "nansen" with its control, whether or not anything is traded
    for (const [mint, v] of Object.entries(nz)) if (v.cand?.priceUsd) await logSignal(d, { mint, symbol: v.cand.symbol, price: jp?.[mint]?.price ?? v.cand.priceUsd, liqUsd: v.cand.liqUsd, source: "nansen", label: v.traders.slice(0, 3).join(", "), independent: v.traders.length }, controls);
    const trendingNow = (jtrade.length ? jtrade : tracked.length ? tracked : liquid).slice(0, 12).map((p) => ({ symbol: p.symbol, mint: p.mint, ch1h: p.ch1h, liqUsd: p.liqUsd, boosted: boosted.has(p.mint) }));
    await d.q(`INSERT INTO mob_aq_market (k, data, ok, at) VALUES ('trending', $1, true, now()) ON CONFLICT (k) DO UPDATE SET data=EXCLUDED.data, ok=true, err=null, at=now()`, [JSON.stringify(trendingNow)]);
    const bars = await d.one(`SELECT count(*)::int n, count(DISTINCT mint)::int m FROM mob_aq_prices WHERE at > now() - interval '1 hour'`);
    set("sol.trending", trendingNow.length ? "busy" : "blocked", (trendingNow.length ? `${jtop.length} Jupiter trending/traded coins, ${jtrade.length} tradable; ${watch.length} liquid pairs on the watchlist (${bars.n} own price samples in 1h)` : `no tradable coin found this tick${jt.ok ? "" : ` (Jupiter lists: ${jt.err})`}`).slice(0, 190));
    // candidates: Jupiter's trending coins that can pass the gate first, then the tracked watchlist, then everything else
    const all = [...nzCands, ...jtrade, ...tracked, ...found];
    const seen = new Set(), cands = [];
    for (const p of all) if (p.mint && !seen.has(p.mint)) { seen.add(p.mint); cands.push(p); }
    const bySym = {};
    for (const c of cands) (bySym[c.symbol.toLowerCase()] ||= []).push(c);
    let copies = 0, gta = 0, hot = 0, spikes = 0;
    for (const c of cands) {
      const same = bySym[c.symbol.toLowerCase()].filter((x) => x.mint !== c.mint);
      const deepest = [c, ...same].sort((a, b) => (b.liqUsd || 0) - (a.liqUsd || 0))[0];
      c.copycat = same.length > 0 && deepest.mint !== c.mint;
      c.copies = same.length;
      c.boosted = boosted.has(c.mint);
      c.gta = GTA_RE.test(`${c.name} ${profiles[c.mint] || ""}`);
      c.strategy = c.gta ? "R4" : "R3";
      if (c.copycat) copies++;
      if (c.gta) gta++;
      if (c.ch1h != null && c.ch1h > 100) hot++;
      if (c.volM5 != null && c.volH1 && c.volM5 * 12 > 2 * c.volH1) spikes++;
    }
    set("sol.copycat", cands.length ? "busy" : "idle", `${copies} copycat name(s) in ${cands.length} pools`);
    set("sol.narrative", cands.length ? "busy" : "idle", `${gta} GTA 6 tagged`);
    // ---- the GTA 6 list for release day (2026-11-19): every coin seen under that name at or above the liquidity gate, with
    // what the desk knows about it. A list to judge from, never a trigger: each coin still passes every gate like any other.
    const gl = (await getState(d, "gta6_list", null)) || { tokens: {} };
    for (const c of cands) if ((c.gta || c.mint === GTA6_MINT) && (c.liqUsd || 0) >= COUNCIL.hardMinLiq) {
      const prev = gl.tokens[c.mint] || { firstSeen: new Date(nowSec * 1000).toISOString() };
      gl.tokens[c.mint] = { ...prev, symbol: c.symbol, mint: c.mint, liqUsd: Math.round(c.liqUsd), priceUsd: c.priceUsd ?? null, ch1h: c.ch1h ?? null, createdAt: c.createdAt || prev.createdAt || null, clone: !!c.copycat, boosted: !!c.boosted, main: c.mint === GTA6_MINT, lastSeen: new Date(nowSec * 1000).toISOString() };
    }
    const glKeep = Object.values(gl.tokens).filter((t) => nowSec * 1000 - Date.parse(t.lastSeen) < 3 * 86400000).sort((a, b) => (b.main - a.main) || b.liqUsd - a.liqUsd).slice(0, 30);
    await setState(d, "gta6_list", { releaseDate: GTA6_DATE, daysToRelease: daysToGta, mainMint: GTA6_MINT, tokens: Object.fromEntries(glKeep.map((t) => [t.mint, t])) });
    // ---- regime: what the wider market is doing this minute. Stored with every entry so results can be read per regime later;
    // it changes no decision yet (no rule is tuned on it until there is a sample to judge).
    const regime = { fearGreed: fg.data?.value ?? null, solUsd: solUsd ?? null, solCh24: mj.data?.sol?.ch24 ?? null, btcUsd: mj.data?.btc?.price ?? null, btcCh24: mj.data?.btc?.ch24 ?? null,
      label: fg.data?.value == null ? null : fg.data.value < 25 ? "extreme fear" : fg.data.value < 45 ? "fear" : fg.data.value < 55 ? "neutral" : fg.data.value < 75 ? "greed" : "extreme greed", at: new Date(nowSec * 1000).toISOString() };
    await setState(d, "regime", regime);
    set("sol.gainers", cands.length ? "busy" : "idle", `${hot} pools over +100% in 1h (warning)`);
    set("sol.volume", cands.length ? "busy" : "idle", `${spikes} 5-minute volume spikes`);
    set("sol.liquidity", cands.length ? "busy" : "idle", `${cands.filter((c) => (c.liqUsd || 0) >= P.minLiqUsd).length} pools at or above $${P.minLiqUsd}`);

    // ---- exits first (Hermes): real prices every tick, stops keep working even with the kill switch on and without a fresh SOL price
    const open = await d.q(`SELECT * FROM mob_aq_positions ORDER BY id`);
    if (open.length && !destroyed) {
      let mids = null;
      try { mids = await midPrices(open.map((p) => ({ mint: p.mint, pool: p.pool }))); health.position_prices = true; } catch (e) { health.position_prices = false; }
      // Council seat: a helper's fresh EXIT vote is a warning. The position is checked now with a real sell quote and the
      // exit-vote rule (seat.mjs: exitVoteRule) decides; the stop and the target never move on a vote.
      const warned = await exitVotes(d);
      for (const p of open) {
        const mid = mids?.[p.mint] ?? null;
        if (mid == null) { set("ex.stops", "blocked", `${p.symbol}: no price, holding`); continue; }
        // ONE unit for levels and P&L: the position is paid for and paid out in SOL, so the USD mid is restated at the SOL price of
        // the entry (m = the coin's price in SOL, scaled back to entry dollars). A SOL move alone no longer trips a stop.
        const m = p.sol_usd_entry && solExit ? mid * (p.sol_usd_entry / solExit) : mid;
        const ref = p.sol_usd_entry ? p.entry_price_usd : p.entry_mid_usd;
        const tokensUi = Number(p.tokens_raw) / 10 ** p.decimals;
        // exit variant B (scale-out): at +1R sell half, then the stop on the rest moves to break-even plus the measured cost
        if (p.variant === "B" && !p.half_done && ref && p.stop_pct && m >= ref * (1 + p.stop_pct / 100) && m < p.target_price && feeExit) {
          const half = (BigInt(p.tokens_raw) / 2n).toString();
          if (out.exits.length || out.scaled) await sleep(gap);
          const hq = half !== "0" ? await jupQuote(p.mint, SOL_MINT, half) : null;
          if (hq) {
            const be = p.entry_price_usd * (1 + (p.rt_pct || 0) / 100);
            // one statement: the half is claimed, cash credited and the flows written together, or nothing is (ledger.mjs)
            const sc = await scaleOut(d, p, { half, gross: Number(hq.outAmount) / 1e9, feeSol: feeExit, stopPrice: be });
            if (!sc) { set("ex.stops", "busy", `${p.symbol}: changed by another request, left alone this tick`); continue; }
            Object.assign(p, { tokens_raw: sc.tokens_raw, realized_sol: sc.realized_sol, half_done: true, stop_price: sc.stop_price });
            out.scaled = (out.scaled || 0) + 1;
            set("ex.stops", "busy", `${p.symbol}: half sold at +1R, stop moved to break-even plus cost`);
          }
        }
        let why = m <= p.stop_price ? "stop" : m >= p.target_price ? "target" : nowSec * 1000 >= new Date(p.time_stop_at).getTime() ? "time stop" : null;
        const markSol = solExit ? (Number(p.tokens_raw) / 10 ** p.decimals) * mid / solExit : null;
        await d.q(`UPDATE mob_aq_positions SET last_price_usd=$2, last_value_sol=$3, last_at=now() WHERE id=$1`, [p.id, mid, markSol]);
        const xv = warned[p.id] || null;
        if (!why && !xv) continue;
        if (out.exits.length) await sleep(gap);
        const q = await jupQuote(p.mint, SOL_MINT, p.tokens_raw);
        if (!q || !feeExit) { set("ex.reconcile", "blocked", `${p.symbol}: ${why ? `${why} hit` : `exit vote by ${xv.helper}`} but no ${q ? "SOL price ever seen" : "sell quote"}; retry next tick`); health.jupiter = !!q && health.jupiter !== false; continue; }
        health.jupiter = true;
        const gross = Number(q.outAmount) / 1e9;
        // the label the trade is recorded with: a time stop that a helper's warning moved in says so
        let label = why === "time stop" && p.seat_exit ? `council exit vote (${p.seat_exit})` : why;
        if (!why) {
          // "under entry" is read from the executable quote (the mid it implies), not from a mid that may be stale
          const imp = impliedMid(p, gross) ?? m, entry = p.entry_mid_usd ?? p.entry_price_usd, rule = exitVoteRule(xv.eff, imp < entry);
          const says = `${xv.helper} EXIT ${xv.confidence} x weight ${xv.mult} = ${xv.eff}; the sell quote implies $${round(imp, 10)} against $${round(entry, 10)} at entry`;
          if (rule.act === "close") { why = "council exit"; label = `council exit vote (${xv.helper})`; }
          else {
            let did = "recorded only (confidence too low to act)";
            if (rule.act === "shorten") {
              const sh = await d.one(`UPDATE mob_aq_positions SET time_stop_at = to_timestamp($2::float8), seat_exit = $3 WHERE id=$1 AND time_stop_at > to_timestamp($2::float8) RETURNING time_stop_at`, [p.id, nowSec + rule.mins * 60, xv.helper]);
              did = sh ? `time stop moved in to ${rule.mins} minutes from now` : `time stop already within ${rule.mins} minutes: nothing changed`;
            }
            await markHandled(d, xv.ids, `${did} (${says})`);
            await brain(d, "council", "seat", `Exit warning on ${p.symbol}: ${says}. ${did}. The stop and the target did not move.`, { position: p.id, helper: xv.helper, eff: xv.eff, act: rule.act });
            set("ex.stops", "busy", `${p.symbol}: exit warning by ${xv.helper}, ${did}`);
            (out.warnings ||= []).push({ symbol: p.symbol, helper: xv.helper, eff: xv.eff, act: rule.act, mins: rule.mins ?? null });
            continue;
          }
        }
        const exitPx = gross * solExit / (Number(p.tokens_raw) / 10 ** p.decimals);
        const slip = round((mid / exitPx - 1) * 100, 3);
        // a stop is confirmed against the executable quote before it fills. exit_k = what a sale fetched against the mid when the
        // position was opened; quote / exit_k is the mid the quote implies now. If that is still above the stop AND selling here
        // would lose less than the planned stop, the mid was wrong (stale or a glitch): nothing is sold, the next tick looks again.
        if (why === "stop" && p.exit_k && p.sol_usd_entry) {
          const implied = ((gross / (Number(p.tokens_raw) / 10 ** p.decimals)) * p.sol_usd_entry) / p.exit_k, cost = p.size_sol + p.fee_sol;
          const lossPct = (((p.realized_sol || 0) + gross - feeExit - cost) / cost) * 100;
          if (implied > p.stop_price && lossPct > -(p.stop_pct ?? Infinity)) {
            await d.q(`UPDATE mob_aq_positions SET stop_unconfirmed = stop_unconfirmed + 1 WHERE id=$1`, [p.id]);
            health.counters.stopsUnconfirmed++;
            set("ex.reconcile", "busy", `${p.symbol}: mid ${round(m, 10)} under the stop ${round(p.stop_price, 10)} but the sell quote implies ${round(implied, 10)}: stop NOT confirmed, holding`);
            continue;
          }
        }
        // the claim: one statement deletes the position, writes the trade, credits cash and writes the flows (ledger.mjs).
        // null = another request (SELL ALL, an overlapping tick) closed it first; this tick writes nothing for it.
        const t = await closePosition(d, p, { gross, feeSol: feeExit, exitPx, slip, why: label, gradePrefix: why === "time stop" ? "B" : why === "council exit" ? "C" : "A", exitMid: mid });
        if (!t) { set("ex.stops", "busy", `${p.symbol}: already closed by another request`); continue; }
        if (xv) await markHandled(d, xv.ids, why === "council exit" ? `sold at the live quote: ${round(t.pnl_pct, 2)}% net` : `the position closed on its own rule first (${label})`, t.id);
        const pnlPct = t.pnl_pct, grade = t.grade;
        // how far the mid had run past the stop level when it was seen: the Time Machine fills its stops this much lower
        if (why === "stop" && p.stop_price > 0) await d.q(`UPDATE mob_aq_trades SET overshoot_pct=$2 WHERE id=$1`, [t.id, round(((p.stop_price - m) / p.stop_price) * 100, 3)]);
        await brain(d, "review", "lesson", `${p.symbol} ${p.strategy}: ${label} at ${round(pnlPct, 2)}% net (round trip at entry ${round(p.rt_pct, 2)}%, exit slippage ${slip ?? "unknown"}%). Process ${grade.split("/")[0]}: ${why === "council exit" ? `a helper's exit warning at ${xv.eff} effective confidence while the sell quote was under the entry` : label !== why ? "the time stop a helper's exit warning moved in" : why === "time stop" ? "time stop is a plan exit but the setup did not move" : "plan followed"}.`, { trade: t.id, pnlPct: round(pnlPct, 3), why: label });
        out.exits.push({ symbol: p.symbol, why: label, pnlPct: round(pnlPct, 3) });
        set("ex.stops", "busy", `${p.symbol}: ${label}`);
        set("rv.journal", "busy", `trade #${t.id} journaled`);
        set("rv.lesson", "busy", `lesson from ${p.symbol}`);
        await learnFromTrade(d, p, t.id, pnlPct);
      }
      if (!W["ex.stops"]) set("ex.stops", "busy", `${open.length} open position(s) checked`);
    } else set("ex.stops", "idle", "no open positions");

    // ---- Time Machine, every strategy that can be replayed on candles (every 30 minutes): closed candles only, each coin
    // charged the round trip measured for its tier, stops filled with the measured overshoot, the live plan's stop sizing
    const positionState = await getState(d, "position_sol", COUNCIL.positionSol);
    const book = await costBook(d, Number(positionState) > 0 ? Number(positionState) : COUNCIL.positionSol);
    let replays = (await getState(d, "replays", null)) || {};
    if (!replays.at || nowSec - replays.at > 1800) {
      const rows = await d.q(`SELECT pool, t, o, h, l, c, v FROM mob_aq_candles WHERE t > $1 ORDER BY pool, t`, [Math.floor(nowSec) - 86400]);
      const by = {};
      for (const r of rows) (by[r.pool] ||= []).push({ t: Number(r.t), o: r.o, h: r.h, l: r.l, c: r.c, v: r.v });
      // pools judged before the tier was recorded get it from the Council's own verdicts on that coin
      await d.q(`INSERT INTO mob_aq_pools (pool, mint, symbol, tier) SELECT DISTINCT ON (w.pool) w.pool, w.mint, w.symbol, c.facts->>'tier' FROM mob_aq_watch w JOIN mob_aq_council c ON c.mint = w.mint
        WHERE c.facts->>'tier' IN ('A','B','C') ORDER BY w.pool, c.id DESC ON CONFLICT (pool) DO NOTHING`);
      const tierOf = Object.fromEntries((await d.q(`SELECT pool, tier FROM mob_aq_pools`)).map((r) => [r.pool, r.tier]));
      // a pool whose tier was never recorded is charged as tier C, the dearest: never the hopeful number
      const costOf = (pool) => book.tierCost(tierOf[pool] || "C").pct;
      // each strategy is replayed only on the coins it may trade: R6 on tier A/B, R7 on tier A (a pool of unknown tier is left out for them)
      const only = { R6: ["A", "B"], R7: ["A"] };
      const os = await d.one(`SELECT avg(overshoot_pct)::float8 a, count(*)::int n FROM (SELECT overshoot_pct FROM mob_aq_trades WHERE reason='stop' AND overshoot_pct IS NOT NULL ORDER BY id DESC LIMIT 200) x`);
      const overshootPct = os.n >= 10 ? round(Math.max(0, os.a), 3) : AUDIT_OVERSHOOT_PCT, overshootSrc = os.n >= 10 ? `measured on ${os.n} paper stops` : "audit 2026-11-16 (15 stops)";
      const withPlan = (fn, hold, rr) => (cs, p, now) => { const st = fn(cs, p, now); return st.signal ? { ...st, ...planFor(st, atr5Pct(cs), hold, rr) } : st; };
      const defs = { R3: [fibSetup, P, null], R6: [momentumSetup, { ...R6_PARAMS, ...(strategies.R6?.params || {}) }, "rr"], R7: [bounceSetup, { ...R7_PARAMS, ...(strategies.R7?.params || {}) }, "rr"] };
      replays = { at: nowSec, pools: Object.keys(by).length, candles: rows.length, overshootPct, overshootSrc, costs: Object.fromEntries(["A", "B", "C"].map((t) => [t, book.tierCost(t)])) };
      for (const [sid, [fn, p, rr]] of Object.entries(defs)) {
        const mine = only[sid] ? Object.fromEntries(Object.entries(by).filter(([pool]) => only[sid].includes(tierOf[pool]))) : by;
        const rp = { ...replaySetup(mine, withPlan(fn, p.timeStopMin, rr ? p.rr : null), p, costOf, { maxBars: p.timeStopMin, overshootPct }), pools: Object.keys(mine).length };
        replays[sid] = rp;
        if (rows.length) await brain(d, "council", "finding", `Time Machine ${sid} replay: ${rp.trades} trades on ${rp.pools} pools${only[sid] ? ` of tier ${only[sid].join("/")}` : ""} (${rows.length} closed candles), mean ${rp.expectancyPct ?? "n/a"}% net of the measured cost (A ${replays.costs.A.pct}%, B ${replays.costs.B.pct}%, C ${replays.costs.C.pct}%; mean charged ${rp.costPct ?? "n/a"}%), stops filled ${overshootPct}% past the level (${overshootSrc}), 95% CI ${rp.ci95 ? rp.ci95.join(" to ") : "n/a"}. ${rp.evidence}.`, rp);
      }
      await setState(d, "replays", replays);
      await setState(d, "replay_R3", { at: nowSec, pools: replays.pools, candles: rows.length, ...replays.R3 });
      set("cn.timemachine", "busy", `replayed R3 ${replays.R3.trades}, R6 ${replays.R6.trades}, R7 ${replays.R7.trades} trades on ${replays.pools} pools`);
    } else set("cn.timemachine", "idle", `last replay R3 ${replays.R3?.trades ?? 0} trades (mean ${replays.R3?.expectancyPct ?? "n/a"}%), R6 ${replays.R6?.trades ?? 0} (${replays.R6?.expectancyPct ?? "n/a"}%), R7 ${replays.R7?.trades ?? 0} (${replays.R7?.expectancyPct ?? "n/a"}%)`);
    const rpl = replays.R3 || null;
    // ---- which strategies may touch the real paper ledger (the rest keep firing on the shadow lane)
    const ev = await signalEvidence(d);
    const evWhy = (e) => `${e.withControl}/${EVIDENCE_MIN} signals with a matched control; median after 15 min ${e.median.m15 ?? "n/a"}% vs control ${e.control.m15 ?? "n/a"}%`;
    const r6 = replays.R6;
    const modes = {
      R6: r6 && r6.n >= 30 && r6.expectancyPct > 0 ? { real: true, why: `replay positive: ${r6.n} trades, ${r6.expectancyPct}% net` } : { real: false, why: r6 && r6.n >= 30 ? `its replay with measured cost loses ${r6.expectancyPct}% a trade over ${r6.n} trades` : `its replay with measured cost has ${r6?.n ?? 0} of the 30 trades needed` },
      R5: { real: ev.own.real, why: evWhy(ev.own) }, "R5:nansen": { real: ev.nansen.real, why: evWhy(ev.nansen) },
    };
    await setState(d, "modes", modes);

    // ---- Zeus: limits before any candidate is looked at
    const cash = Number(await getState(d, "cash_sol", START_SOL));
    const pos = await d.q(`SELECT * FROM mob_aq_positions`);
    const near = [];
    const equity = cash + pos.reduce((a, p) => a + (p.last_value_sol ?? p.size_sol), 0);
    const today = await d.one(`SELECT coalesce(sum(pnl_sol),0)::float s FROM mob_aq_trades WHERE closed_at >= date_trunc('day', now())`);
    const dayStartEq = equity - today.s;
    const dayPct = dayStartEq > 0 ? (today.s / dayStartEq) * 100 : 0;
    const lastTrades = await d.q(`SELECT pnl_sol, closed_at FROM mob_aq_trades ORDER BY id DESC LIMIT $1`, [P.lossStreak]);
    const streak = lastTrades.length >= P.lossStreak && lastTrades.every((t) => t.pnl_sol <= 0) && nowSec * 1000 - new Date(lastTrades[0].closed_at).getTime() < P.cooldownMin * 60000;
    const baseSol = await walletBase(d); // 1 SOL at the start plus every CEO deposit: health is measured against it
    const sv = survival(equity, baseSol);
    if (sv.stage === "destroyed" && !destroyed) {
      await setState(d, "destroyed", true);
      const tl = await d.one(`SELECT count(*)::int n, coalesce(sum(pnl_sol),0)::float pnl, mode() WITHIN GROUP (ORDER BY reason) worst FROM mob_aq_trades`);
      const rs = await d.q(`SELECT reason, count(*)::int n, round(avg(pnl_pct)::numeric,2)::float avg FROM mob_aq_trades GROUP BY reason ORDER BY n DESC LIMIT 3`);
      await brain(d, "review", "post-mortem", `POST-MORTEM: the island was destroyed at ${round(equity, 4)} SOL (${sv.health}% of ${baseSol}). ${tl.n} trades, ${round(tl.pnl, 4)} SOL realized. Exits: ${rs.map((x) => `${x.reason} x${x.n} avg ${x.avg}%`).join("; ") || "none"}. Trading stopped until Alex rebuilds.`, { sv, trades: tl.n });
    }
    const dead = destroyed || sv.stage === "destroyed";
    await setState(d, "survival", sv);
    set("rk.exposure", dead ? "blocked" : "busy", `health ${sv.health} (${sv.stage}): size x${sv.sizeMult}, max ${sv.maxOpen} open`);
    const paperMode = (await getState(d, "mode", "PAPER")) !== "LIVE";
    const runTrades = await d.q(`SELECT pnl_sol FROM mob_aq_trades ORDER BY id DESC LIMIT 10`);
    let riskBlock = null;
    if (dead) riskBlock = ["island destroyed: only Alex can rebuild", sv.health];
    else if (kill) riskBlock = ["kill switch on", 1];
    else if (pos.length >= Math.min(COUNCIL.maxOpen, sv.maxOpen)) riskBlock = [sv.maxOpen < COUNCIL.maxOpen ? `max open positions (${sv.stage})` : "max open positions", pos.length];
    else if (dayPct <= -P.dayStopPct) riskBlock = ["daily stop hit", round(dayPct, 2)];
    // PAPER never halts on a losing streak (halting is for live): it trades smaller and asks for a stronger score instead
    else if (streak && paperMode === false) riskBlock = ["loss-streak throttle", P.lossStreak];
    const lossRun = (() => { let n = 0; for (const t of runTrades) { if (t.pnl_sol <= 0) n++; else break; } return n; })();
    const throttle = lossRun >= 5 ? { size: 0.5, score: 10, losses: lossRun } : lossRun >= 3 ? { size: 0.75, score: 10, losses: lossRun } : { size: 1, score: 0, losses: lossRun };
    set("rk.kill", kill ? "blocked" : "busy", kill ? "KILL SWITCH ON: no new entries" : "kill switch off");
    set("rk.limits", "busy", `${pos.length}/${Math.min(COUNCIL.maxOpen, sv.maxOpen)} positions open, ${COUNCIL.positionSol} SOL each (CEO setting)`);
    set("rk.day", dayPct <= -P.dayStopPct ? "blocked" : "busy", `today ${round(dayPct, 2)}% (stop -${P.dayStopPct}%)`);
    set("rk.streak", "busy", throttle.size < 1 ? `${throttle.losses} losses in a row: score +${throttle.score} (paper never halts; the size stays the CEO's fixed position)` : "no loss streak");
    set("rk.dd", "busy", `equity ${round(equity, 4)} SOL vs wallet base ${baseSol}`);
    set("ex.balance", "busy", `cash ${round(cash, 4)} SOL`);
    set("ex.live", "blocked", "locked: PAPER only, no wallet");

    if (riskBlock) {
      await council(d, "BLOCK", null, `risk: ${riskBlock[0]}`, riskBlock[1]);
      set("cn.veto", "busy", `BLOCK: ${riskBlock[0]}`);
    } else {
      // ---- the Council (hard blocks, soft score, tiers, R3/R5/R6/R7, explore) lives in council.mjs
      await councilTick(env, { nansen: nz, variantDefault: (await getState(d, "variant_default", {})) || {}, throttle, r6TimeStopMin: null, book, modes, replays, controls, regime, positionSol: (() => { const v = Number(positionState); return Number.isFinite(v) && v > 0 ? v : COUNCIL.positionSol; })(), d, cands, tradable, strategies, pos, cash, equity, sv, solUsd, feeSol, nowSec, gap, health, set, out, near, rpl, fng: fg.data?.value ?? null, ownCandles, brain, flow, setState,
        council: (v, c, reason, number, facts) => council(d, v, c, reason, number, facts) });
    }
    if (!W["ex.paper"]) set("ex.paper", "idle", "no PASS this tick");
    // ---- never idle: shadow lane (paper probes on near misses, own ledger, never mixed into the real one)
    out.survival = sv;
    // ---- whales, all night: follow up on old signals, then mine swaps of today's runners into the book (budgeted)
    await followSignals(env, (m) => jp?.[m]?.price ?? null);
    // ---- Council seat: grade the helpers' votes (15 minutes forward, or the trade a vote was part of) and refit their weights
    try { out.seat = await seatTick(env); } catch (e) { out.seat = { error: String(e.message || e).slice(0, 120) }; }
    const runners = jtop.filter((p) => (p.liqUsd || 0) >= P.minLiqUsd && ((p.ch24 ?? 0) >= 50 || (p.ch1h ?? 0) >= 20)).map((p) => ({ mint: p.mint, symbol: p.symbol, why: `ran ${round(p.ch24 ?? 0, 0)}% in 24h, ${round(p.ch1h ?? 0, 0)}% in 1h` }));
    out.mining = await mineTick(env, { runners: runners.length ? runners : jtrade.slice(0, 6).map((p) => ({ mint: p.mint, symbol: p.symbol, why: "trending, tradable" })), set });
    // the rebuilt book: KOLscan seeds every six hours, a few candidates scored by Jupiter each tick (inside the call budget)
    try { out.kol = await kolTick(env, { set }); } catch (e) { out.kol = { ok: false, error: String(e.message || e).slice(0, 100) }; }
    try { out.scoring = await scoreTick(env, { solUsd: solExit, set }); } catch (e) { out.scoring = { error: String(e.message || e).slice(0, 100) }; }
    health.budget = { heliusCalls: CALLS.helius, heliusCap: CAPS.helius, heliusKey: !!env.HELIUS_API_KEY, jupiterDataCalls: CALLS.jupiterData, jupiterDataCap: CAPS.jupiterData, dexscreenerCalls: CALLS.dexscreener, geckoterminalCalls: CALLS.geckoterminal };
    // ---- helper lanes (second brains): judged by the same Council for the record, paper-tracked apart, never the real ledger
    out.lanes = await lanesTick(env, { halted: dead || kill, nowSec, gap, feeSol, P, set, council: (v, c, reason, number, facts) => council(d, v, c, reason, number, facts) });
    out.shadow = dead ? { opened: null, closed: [] } : await shadowTick(env, { kill, entered: !!out.entered, near, solUsd, feeSol, gap, book, nowSec, set, P, positionSol: Number(positionState) > 0 ? Number(positionState) : COUNCIL.positionSol });

    // ---- Review + Learning: stats, tournament rules (recorded, never silent)
    const trades = await d.q(`SELECT strategy, pnl_pct, pnl_sol FROM mob_aq_trades`);
    const st = stats(trades.map((t) => t.pnl_pct));
    set("rv.stats", "busy", `${st.n} trades, win rate ${st.winRate == null ? "n/a" : round(st.winRate * 100, 1) + "%"}`);
    set("rv.expectancy", "busy", `expectancy ${st.expectancyPct ?? "n/a"}%`);
    set("cn.ci", "busy", st.ci95 ? `95% CI ${st.ci95.join(" to ")}` : "not enough trades");
    set("cn.sample", "busy", `${st.evidence} (${st.n}/100)`);
    for (const sid of Object.keys(strategies)) {
      const s = strategies[sid];
      const ss = stats(trades.filter((t) => t.strategy === sid).map((t) => t.pnl_pct));
      ss.pnlSol = round(trades.filter((t) => t.strategy === sid).reduce((a, t) => a + t.pnl_sol, 0), 9);
      let status = s.status, alive = s.alive;
      // Rule T1 (recipe: abandon if): 100+ trades and the whole 95% interval below zero -> killed.
      if (alive && ss.n >= 100 && ss.ci95 && ss.ci95[1] < 0) { alive = false; status = "killed"; await brain(d, "learning", "tournament", `Rule T1 killed ${sid}: ${ss.n} trades, 95% CI ${ss.ci95.join(" to ")} below zero.`, ss); }
      // Rule T2: 100+ trades and the 95% interval above zero -> edge (eligible for tiny live, Alex decides).
      else if (alive && ss.n >= 100 && ss.ci95 && ss.ci95[0] > 0 && status !== "edge") { status = "edge"; await brain(d, "learning", "tournament", `Rule T2: ${sid} shows an edge over ${ss.n} trades, 95% CI ${ss.ci95.join(" to ")}. Live stays locked until Alex says.`, ss); }
      await d.q(`UPDATE mob_aq_strategies SET stats=$2, alive=$3, status=$4 WHERE id=$1`, [sid, JSON.stringify(ss), alive, status]);
    }
    // ---- exit variants A/B per strategy: compared every 20 closed trades per variant; a clear leader becomes the default (step T4)
    const vt = await d.q(`SELECT strategy, coalesce(variant,'A') v, pnl_pct FROM mob_aq_trades WHERE variant IS NOT NULL AND reason NOT LIKE 'council exit vote%'`); // a trade a helper's warning cut short is not a clean sample of either arm
    const cmp = (await getState(d, "variant_cmp", {})) || {}, dflt = (await getState(d, "variant_default", {})) || {};
    for (const sid of ["R3", "R4", "R5", "R6", "R7"]) {
      const a = stats(vt.filter((t) => t.strategy === sid && t.v === "A").map((t) => t.pnl_pct)), b = stats(vt.filter((t) => t.strategy === sid && t.v === "B").map((t) => t.pnl_pct));
      const mark = Math.floor(Math.min(a.n, b.n) / 20) * 20;
      if (mark >= 20 && (cmp[sid] || 0) < mark) {
        cmp[sid] = mark;
        const lead = a.expectancyPct >= b.expectancyPct ? ["A", a, b] : ["B", b, a], clear = lead[1].ci95 && lead[1].ci95[0] > lead[2].expectancyPct;
        await brain(d, "review", "variants", `${sid} exits after ${a.n} A and ${b.n} B trades: A (plain stop/target) ${a.expectancyPct}% per trade, 95% CI ${a.ci95?.join(" to ")}; B (half off at +1R, stop to break-even, stop capped at 6%) ${b.expectancyPct}%, 95% CI ${b.ci95?.join(" to ")}. ${clear ? `${lead[0]} leads clearly.` : "No clear leader: both keep running."}`, { sid, a, b });
        if (clear && dflt[sid] !== lead[0]) {
          dflt[sid] = lead[0];
          await brain(d, "learning", "tournament", `Rule T4: ${sid} exit variant ${lead[0]} becomes the default (its 95% interval is above the other variant's mean). A new challenger is needed: proposed next test is a trailing stop of 1x ATR after +1R against the new default.`, { sid, winner: lead[0] });
        }
      }
    }
    await setState(d, "variant_cmp", cmp); await setState(d, "variant_default", dflt);
    set("ln.tournament", "busy", `${Object.keys(strategies).length} recipes scored`);
    set("ln.killer", "busy", "rule T1: 100+ trades with the 95% CI below zero");

    // ---- Council: bot proposals (a bot may make a bot only if the budget/limit check passes)
    const pending = await d.q(`SELECT * FROM mob_aq_bots WHERE approved=false AND verdict IS NULL ORDER BY id LIMIT 5`);
    for (const b of pending) {
      const { n } = await d.one(`SELECT count(*)::int n FROM mob_aq_bots WHERE approved=true`);
      const { nd } = await d.one(`SELECT count(*)::int nd FROM mob_aq_bots WHERE approved=true AND dept=$1`, [b.dept]);
      const reason = b.power !== "code" ? "budget: only free code bots may be made by bots" : n >= 200 ? "limit: 200 bots" : nd >= 20 ? "limit: 20 bots per department" : null;
      if (reason) await d.q(`UPDATE mob_aq_bots SET verdict='BLOCK', status='blocked', note=$2 WHERE id=$1`, [b.id, reason]);
      else await d.q(`UPDATE mob_aq_bots SET verdict='PASS', approved=true, status='idle', note='approved by the Council, paper only' WHERE id=$1`, [b.id]);
      await council(d, reason ? "BLOCK" : "PASS", { symbol: `bot:${b.name}`, mint: `bot:${b.id}` }, reason || "bot proposal within budget and limits", reason ? null : n + 1);
    }
    set("ln.experiments", pending.length ? "busy" : "idle", pending.length ? `${pending.length} bot proposal(s) judged` : "no bot proposals");

    // ---- ledger invariant, every tick: cash must equal base + realized P&L - cost still open, and no position may have two closes
    const led = await reconcile(d);
    health.ledger = led.ok;
    const ledPrev = await getState(d, "ledger_check", null);
    if (!led.ok && !(ledPrev && ledPrev.ok === false && Math.abs((ledPrev.diffSol ?? 0) - (led.diffSol ?? 0)) < 1e-9 && ledPrev.duplicateCloses === led.duplicateCloses))
      await brain(d, "ops", "alert", `LEDGER ALERT: cash ${round(led.cashSol, 9)} SOL does not reconcile with the trades (expected ${round(led.expectedSol, 9)} = base ${led.baseSol} + realized ${round(led.realizedSol, 9)} - open cost ${round(led.openCostSol, 9)}; difference ${round(led.diffSol, 9)} SOL; ${led.duplicateCloses} position(s) closed more than once). Equity and P&L on the desk are not to be trusted until this is repaired.`, led);
    else if (led.ok && ledPrev && ledPrev.ok === false) await brain(d, "ops", "event", `Ledger reconciles again: cash ${round(led.cashSol, 9)} SOL = base ${led.baseSol} + realized ${round(led.realizedSol, 9)} - open cost ${round(led.openCostSol, 9)}.`, led);
    await setState(d, "ledger_check", { ...led, at: new Date(nowSec * 1000).toISOString() });
    set("ex.reconcile", led.ok ? "busy" : "blocked", led.ok ? `cash reconciles with ${round(led.realizedSol, 6)} SOL realized and ${round(led.openCostSol, 6)} SOL open` : `LEDGER MISMATCH ${round(led.diffSol, 9)} SOL`);
    // ---- helpers (Grok / ChatGPT) and ops
    const h = await d.one(`SELECT max(at) FILTER (WHERE from_helper='grok') g, count(*) FILTER (WHERE at > now() - interval '1 day')::int n FROM mob_aq_helpers`);
    set("nw.x", h?.g ? "busy" : "idle", h?.g ? `last Grok message ${new Date(h.g).toISOString()}` : "Grok not connected: no free X API");
    set("op.bridge", h?.n ? "busy" : "idle", `${h?.n || 0} helper message(s) in 24h, stored as evidence`);
    set("op.health", Object.values(health).every(Boolean) ? "busy" : "blocked", Object.entries(health).map(([k, v]) => `${k} ${v ? "up" : "DOWN"}`).join(", "));
    set("op.scheduler", "busy", `tick at ${new Date(nowSec * 1000).toISOString()}`);
    set("op.cityfeed", "busy", "state ready");
    set("op.screen", mj.ok || fg.ok ? "busy" : "blocked", "market square updated");
    set("op.uptime", "busy", "tick ran");

    // department live flags: a department is live when every feed it needs answered this tick
    const live = {
      scouts_sol: trendingNow.length > 0 && (health.jupiter_lists || health.prices !== false), scouts_stocks: !!health.sol_price, news: !!health.feargreed,
      setups: health.jupiter_candles === true || bars.n > 0 || health.geckoterminal_ohlcv === true, costs: health.jupiter !== false, council: health.rugcheck !== false,
      whales: health.whales_trades === true || (out.mining?.pages || 0) > 0, risk: true, execution: health.position_prices !== false && health.jupiter !== false, review: true, learning: true, ops: true,
    };
    await d.q(`UPDATE mob_aq_depts d SET live=x.l, last_run_at=now() FROM unnest($1::text[], $2::bool[]) x(id, l) WHERE d.id=x.id`, [Object.keys(live), Object.values(live)]);
    const keys = Object.keys(W);
    await d.q(`UPDATE mob_aq_bots b SET status=x.s, note=x.n, last_run_at=now() FROM unnest($1::text[],$2::text[],$3::text[]) x(k,s,n) WHERE b.key=x.k`, [keys, keys.map((k) => W[k][0]), keys.map((k) => W[k][1])]);
    await setState(d, "health", health);
    await setState(d, "funnel", out.funnel || { seen: cands.length, tradable: cands.filter(tradable).length, judged: 0 });
    await setState(d, "last_tick", { at: new Date(nowSec * 1000).toISOString(), evaluated: out.evaluated.length, entered: !!out.entered, exits: out.exits.length });
    // a short finding every 30 minutes: why the Council said no
    const lastF = await d.one(`SELECT at FROM mob_aq_brain WHERE dept='council' AND kind='summary' ORDER BY id DESC LIMIT 1`);
    if (!lastF || nowSec * 1000 - new Date(lastF.at).getTime() > 1800000) {
      const rs = await d.q(`SELECT reason, count(*)::int n FROM mob_aq_council WHERE at > now() - interval '30 minutes' GROUP BY reason ORDER BY n DESC LIMIT 3`);
      if (rs.length) await brain(d, "council", "summary", `Last 30 min verdicts: ${rs.map((r) => `${r.reason} x${r.n}`).join("; ")}.`);
    }
    return out;
  } finally {
    await tickUnlock(d, lock);
  }
}

// ---------------------------------------------------------------- bots
const POWERS = ["code", "claude", "grok", "chatgpt"];
function cleanBot(b) {
  const s = (x, n) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, n) : "");
  const bot = { name: s(b?.name, 40), dept: s(b?.dept, 30), job: s(b?.job, 120), rules: s(b?.rules, 300), power: s(b?.power, 10) || "code",
    skills: Array.isArray(b?.skills) ? b.skills.filter((x) => typeof x === "string" && /^[a-z0-9:_-]{1,40}$/.test(x)).slice(0, 8) : [] };
  if (!bot.name) return { error: "name is required" };
  if (!DEPTS.some((d) => d[0] === bot.dept)) return { error: `dept must be one of ${DEPTS.map((d) => d[0]).join(", ")}` };
  if (!bot.job) return { error: "job is required" };
  if (!POWERS.includes(bot.power)) return { error: "power must be code, claude, grok or chatgpt" };
  return { bot };
}
export async function createBot(env, body) {
  await ensureSeed(env);
  const { bot, error } = cleanBot(body);
  if (error) return { error };
  const r = await db(env).one(`INSERT INTO mob_aq_bots (dept, name, job, rules, skills, power, status, note, created_by, approved) VALUES ($1,$2,$3,$4,$5,$6,'idle','made by the CEO, starts on paper','ceo',true) RETURNING *`,
    [bot.dept, bot.name, bot.job, bot.rules, JSON.stringify(bot.skills), bot.power]);
  await brain(db(env), "ops", "event", `CEO made a bot: ${bot.name} (${bot.dept}, ${bot.power}).`);
  return { bot: r };
}
// A bot proposes a bot: stored unapproved; the Council decides on the next tick.
export async function proposeBot(env, byKey, body) {
  await ensureSeed(env);
  const by = await db(env).one(`SELECT key FROM mob_aq_bots WHERE key=$1 AND approved=true`, [byKey]);
  if (!by) return { error: "proposer must be an approved bot" };
  const { bot, error } = cleanBot(body);
  if (error) return { error };
  const r = await db(env).one(`INSERT INTO mob_aq_bots (dept, name, job, rules, skills, power, status, note, created_by, approved, proposed_by) VALUES ($1,$2,$3,$4,$5,$6,'idle','waiting for the Council','bot',false,$7) RETURNING *`,
    [bot.dept, bot.name, bot.job, bot.rules, JSON.stringify(bot.skills), bot.power, byKey]);
  return { bot: r };
}

// ---------------------------------------------------------------- helpers (Grok / ChatGPT evidence inbox)
export const HELPERS = ["grok", "chatgpt", "codex"];
export const LABELS = ["VERIFIED", "REPORTED", "CLAIMED", "INFERRED"];
export const ROLE_DEPT = { scout: "scouts_sol", news: "news", setup: "setups", skeptic: "council", risk: "risk", reviewer: "review" };
export async function helperMessage(env, b) {
  const from = String(b?.from || "").toLowerCase();
  if (!HELPERS.includes(from)) return { error: `from must be one of ${HELPERS.join(", ")}` };
  const role = String(b?.role || "").toLowerCase();
  if (!ROLE_DEPT[role]) return { error: `role must be one of ${Object.keys(ROLE_DEPT).join(", ")}` };
  const text = typeof b?.text === "string" ? b.text.replace(/\s+/g, " ").trim() : "";
  if (!text || text.length > 2000) return { error: "text must be 1-2000 characters" };
  let labels = [].concat(b?.labels ?? b?.label ?? []).map((x) => String(x).toUpperCase()).filter((x) => LABELS.includes(x));
  if (!labels.length) return { error: "labels must include VERIFIED, REPORTED, CLAIMED or INFERRED" };
  const channel = b?.channel === "x" || b?.source === "x" || /^(x|twitter)$/i.test(String(b?.channel || "")) ? "x" : null;
  // Social posts are CLAIMED, never VERIFIED (grok-desk shared rule 1).
  if (channel === "x") labels = labels.map((l) => (l === "VERIFIED" ? "CLAIMED" : l));
  // evidence weight = the helper's own lane result at the time of posting (1 until its lane has 5 closed picks)
  const weight = Number(((await db(env).one(`SELECT v FROM mob_aq_state WHERE k='helper_weights'`))?.v || {})[from] ?? 1);
  const r = await db(env).one(`INSERT INTO mob_aq_helpers (from_helper, role, dept, channel, text, labels, weight) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, at`, [from, role, ROLE_DEPT[role], channel, text, JSON.stringify([...new Set(labels)]), weight]);
  return { message: { id: r.id, at: r.at, evidence: true, trigger: false, weight } };
}

export async function briefing(env, caller = null) {
  await ensureSeed(env);
  const s = await buildState(env);
  const d = db(env);
  const P = (await d.one(`SELECT params FROM mob_aq_strategies WHERE id='R3'`))?.params || {};
  const rts = await d.q(`SELECT symbol, (facts->>'rtPct')::float rt FROM mob_aq_council WHERE facts ? 'rtPct' AND at > now() - interval '1 day' ORDER BY id DESC LIMIT 5`);
  const y = await d.q(`SELECT text FROM mob_aq_brain WHERE dept='review' AND kind='lesson' AND at > now() - interval '2 days' ORDER BY id DESC LIMIT 3`);
  const t = s.trades, m = s.market;
  const room = caller ? await chatFor(d, caller) : [];
  const f = (v, suf = "") => (v == null ? "unknown" : `${v}${suf}`);
  return [
    `AQUARIUS DESK BRIEFING ${new Date().toISOString().slice(0, 10)}`,
    `- Mode: ${s.mode === "PAPER" ? "PAPER" : "LIVE-LOCKED"}. Budget: ${f(round(s.equitySol, 4))} SOL paper equity (start ${s.startSol}). Limits: risk ${f(P.riskPct, "%")} per trade on the stressed stop, daily stop -${f(P.dayStopPct, "%")}, max ${f(P.maxOpen)} positions, ${f(P.maxSizeSol)} SOL per click, target >= ${f(P.costMultiple)}x round trip. Kill switch: ${s.killSwitch ? "ON" : "off"}.`,
    `- Free market context: Fear and Greed ${m.fearGreed ? `${m.fearGreed.value} (${m.fearGreed.label})` : "unknown"}; SOL ${m.sol ? `$${m.sol.price}` : "unknown"}; BTC ${m.btc ? `$${m.btc.price}` : "unknown"}. Trending: ${m.trending.slice(0, 8).map((x) => `${x.symbol}${x.boosted ? " (PAID BOOST)" : ""}`).join(", ") || "unknown"}. Top headlines: none in the engine.`,
    `- Measured costs today (Jupiter round trip): ${rts.length ? rts.map((r) => `${r.symbol} ${round(r.rt, 2)}%`).join(", ") : "none measured yet"}.`,
    `- Open positions: ${s.positions.length ? s.positions.map((p) => `${p.symbol} ${f(p.pnlPct, "%")}`).join(", ") : "none"}. Ledger: ${t.n} trades, win rate ${t.winRate == null ? "n/a" : round(t.winRate * 100, 1) + "%"}, expectancy ${f(t.expectancyPct, "%")}, 95% interval ${t.ci95 ? t.ci95.join(" to ") : "n/a"}: ${t.evidence}.`,
    `- Yesterday's journal and the one lesson: ${y.length ? y.map((r) => r.text).join(" | ") : "no closed trades yet"}.`,
    ...(caller ? [`- War room, last messages to ${caller}: ${room.length ? "" : "none"}`, ...room.map((r) => `  [${new Date(r.at).toISOString().slice(11, 16)}Z] ${r.from}${r.to ? ` to ${r.to}` : " to all"}: ${r.text.replace(/\s+/g, " ")}`)] : []),
  ].join("\n");
}

// ---------------------------------------------------------------- state (CONTRACT.md)
export async function buildState(env) {
  await ensureSeed(env);
  const d = db(env);
  const [st, pos, trd, flows, cn, depts, bots, brainRows, strat, tools, helpers, xs, mkt] = await Promise.all([
    d.q(`SELECT k, v, at FROM mob_aq_state`),
    d.q(`SELECT * FROM mob_aq_positions ORDER BY id`),
    d.q(`SELECT * FROM mob_aq_trades ORDER BY id DESC`),
    d.q(`SELECT id, kind, sol, dept, label, at FROM mob_aq_flows ORDER BY id DESC LIMIT 40`),
    d.q(`SELECT verdict, symbol, reason, number, at, facts->'seat' seat FROM mob_aq_council ORDER BY id DESC LIMIT 50`),
    d.q(`SELECT * FROM mob_aq_depts`),
    d.q(`SELECT id, key, dept, name, job, status, note, skills, power, approved, created_by FROM mob_aq_bots WHERE approved=true ORDER BY id`),
    d.q(`SELECT at, dept, text FROM mob_aq_brain ORDER BY id DESC LIMIT 30`),
    d.q(`SELECT * FROM mob_aq_strategies ORDER BY id`),
    d.q(`SELECT * FROM mob_aq_tools ORDER BY name`),
    d.q(`SELECT from_helper, max(at) at FROM mob_aq_helpers GROUP BY from_helper`),
    d.q(`SELECT at, dept, text, labels, weight FROM mob_aq_helpers WHERE channel='x' AND from_helper='grok' ORDER BY id DESC LIMIT 30`),
    d.q(`SELECT k, data, ok, err, at FROM mob_aq_market WHERE k IN ('trending','cg:majors','fng') OR (ok=false AND at > now() - interval '1 hour')`),
  ]);
  const S = Object.fromEntries(st.map((r) => [r.k, r.v]));
  const hist = await d.one(`SELECT coalesce(sum(n),0)::int n, count(*)::int m, count(*) FILTER (WHERE n >= $1)::int ready FROM (SELECT mint, count(DISTINCT date_trunc('minute', at))::int n FROM mob_aq_prices WHERE at > now() - interval '1 hour' GROUP BY mint) x`, [MIN_OWN_BARS]);
  const M = Object.fromEntries(mkt.map((r) => [r.k, r.ok ? r.data : null]));
  const nzs = await nansenState(d);
  const ledNow = await reconcile(d); // read live on every state call, not only what the last tick stored
  const cash = Number(S.cash_sol ?? START_SOL);
  const equity = cash + pos.reduce((a, p) => a + (p.last_value_sol ?? p.size_sol), 0);
  const startDay = new Date(); startDay.setUTCHours(0, 0, 0, 0);
  const realizedToday = trd.filter((t) => new Date(t.closed_at) >= startDay).reduce((a, t) => a + t.pnl_sol, 0);
  const unreal = pos.reduce((a, p) => a + ((p.last_value_sol ?? p.size_sol) + (p.realized_sol || 0) - p.size_sol - p.fee_sol), 0);
  const s = stats(trd.map((t) => t.pnl_pct));
  const v = (r) => (r ? { verdict: r.verdict, symbol: r.symbol, reason: r.reason, number: r.number, at: r.at, ...(r.seat ? { seat: r.seat } : {}) } : null);
  const recent = [
    ...trd.slice(0, 20).map((t) => ({ id: `s${t.id}`, symbol: t.symbol, side: "sell", sizeSol: t.size_sol, pnlSol: round(t.pnl_sol, 9), reason: t.reason, at: t.closed_at })),
    ...trd.slice(0, 20).map((t) => ({ id: `b${t.position_id}`, symbol: t.symbol, side: "buy", sizeSol: t.size_sol, pnlSol: null, reason: t.strategy, at: t.opened_at })),
    ...pos.map((p) => ({ id: `b${p.id}`, symbol: p.symbol, side: "buy", sizeSol: p.size_sol, pnlSol: null, reason: p.strategy, at: p.opened_at })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 20);
  const hl = Object.fromEntries(helpers.map((r) => [r.from_helper, r.at]));
  const seatCut = (t) => /^council exit vote/.test(t.reason || "");
  const [seats, room, alerts, liveVotes] = await Promise.all([seatStats(d), warroom(d), recentAlerts(d), d.q(`SELECT helper, mint, symbol, vote, confidence, reason, at, expires_at FROM mob_aq_votes WHERE live AND seat AND expires_at > now() ORDER BY id DESC LIMIT 30`)]);
  const conn = (k) => (hl[k] && Date.now() - new Date(hl[k]).getTime() < 86400000 ? "connected" : "not connected");
  return {
    build: AQ_BUILD, mode: S.mode === "LIVE" ? "LIVE" : "PAPER", killSwitch: S.kill === true, updatedAt: S.last_tick?.at || null,
    // startSol is the wallet base (the first 1 SOL plus CEO deposits): a deposit raises it, so it is never counted as profit
    equitySol: round(equity, 9), cashSol: round(cash, 9), positionSol: Number(S.position_sol) > 0 ? Number(S.position_sol) : COUNCIL.positionSol, maxOpen: COUNCIL.maxOpen, startSol: ledNow.baseSol,
    wallet: { baseSol: ledNow.baseSol, firstSol: START_SOL, deposits: S.ledger_base?.deposits || [] }, pnlTodaySol: round(realizedToday + unreal, 9), pnlTotalSol: round(equity - ledNow.baseSol, 9),
    trades: { n: s.n, wins: s.wins, winRate: s.winRate, expectancyPct: s.expectancyPct, ci95: s.ci95, evidence: s.evidence },
    positions: pos.map((p) => ({ id: p.id, symbol: p.symbol, mint: p.mint, entryPrice: p.entry_price_usd, price: p.last_price_usd, stopPct: p.stop_pct, targetPct: p.target_pct,
      sizeSol: p.size_sol, tier: p.tier || null, tag: p.tag || null, openedAt: p.opened_at, variant: p.variant || "A", scaledOut: !!p.half_done, strength: p.strength ?? null,
      pnlPct: p.last_value_sol == null ? null : round(((p.last_value_sol + (p.realized_sol || 0) - p.size_sol - p.fee_sol) / (p.size_sol + p.fee_sol)) * 100, 3), strategy: p.strategy })),
    recent,
    flows: flows.map((f) => ({ id: Number(f.id), kind: f.kind, sol: f.sol, dept: f.dept, label: f.label, at: f.at })),
    council: { last: v(cn[0]), vetoes: cn.filter((r) => r.verdict === "BLOCK").slice(0, 10).map(v), recent: cn.slice(0, 20).map(v), seats,
      votes: liveVotes.map((x) => ({ helper: x.helper, mint: x.mint, symbol: x.symbol, vote: x.vote, confidence: x.confidence, reason: x.reason, at: x.at, expiresAt: x.expires_at })) },
    warroom: room, alerts,
    training: await trainingState(d, S),
    tape: S.tape || null,
    regime: S.regime || null,
    gta6: S.gta6_list ? { releaseDate: S.gta6_list.releaseDate, daysToRelease: S.gta6_list.daysToRelease, mainMint: S.gta6_list.mainMint, tokens: Object.values(S.gta6_list.tokens || {}) } : null,
    costs: (await d.q(`SELECT symbol, (facts->>'rtPct')::float rt, at FROM mob_aq_council WHERE facts ? 'rtPct' AND facts->>'rtPct' IS NOT NULL ORDER BY id DESC LIMIT 20`)).map((r) => ({ symbol: r.symbol, rtPct: r.rt, at: r.at })),
    departments: DEPTS.map(([id]) => {
      const x = depts.find((q) => q.id === id) || {};
      return { id, name: x.name, god: x.god || null, live: !!x.live, lastRunAt: x.last_run_at || null, skills: x.skills || [],
        workers: bots.filter((b) => b.dept === id).map((b) => ({ id: b.id, name: b.name, job: b.job, status: b.status, note: b.note, skills: b.skills, power: b.power, by: b.created_by })) };
    }),
    ceo: CEO,
    market: { sol: M["cg:majors"]?.sol ?? null, btc: M["cg:majors"]?.btc ?? null, fearGreed: M.fng ?? null,
      trending: (M.trending || []).slice(0, 12).map((p) => ({ symbol: p.symbol, ch1h: p.ch1h, liqUsd: p.liqUsd, boosted: !!p.boosted })) },
    brain: brainRows.map((r) => ({ at: r.at, dept: r.dept, text: r.text })),
    strategies: strat.map((r) => ({ id: r.id, name: r.name, trades: r.stats?.n ?? 0, pnlSol: r.stats?.pnlSol ?? 0, alive: r.alive, status: r.status, market: r.market, defaultVariant: S.variant_default?.[r.id] || null,
      byStrength: STRENGTH_BUCKETS.map(([lo, hi]) => { const xs = trd.filter((t) => t.strategy === r.id && t.strength != null && t.strength >= lo && t.strength < hi).map((t) => t.pnl_pct), st3 = stats(xs); return { from: lo, to: hi === 9 ? null : hi, n: st3.n, winRate: st3.winRate, expectancyPct: st3.expectancyPct }; }),
      variants: ["A", "B"].map((v) => { const xs = trd.filter((t) => t.strategy === r.id && t.variant === v && !seatCut(t)).map((t) => t.pnl_pct), w = xs.filter((p) => p > 0), l = xs.filter((p) => p <= 0), st2 = stats(xs);
        return { id: v, n: st2.n, winRate: st2.winRate, expectancyPct: st2.expectancyPct, avgWin: w.length ? round(w.reduce((a, c) => a + c, 0) / w.length, 2) : null, avgLoss: l.length ? round(l.reduce((a, c) => a + c, 0) / l.length, 2) : null }; }),
      // which book this strategy trades on now, and the evidence behind that
      ledger: S.modes?.[r.id] ? (S.modes[r.id].real ? "real" : "shadow") : "real", ledgerWhy: S.modes?.[r.id]?.why ?? null,
      replay: S.replays?.[r.id === "R4" ? "R3" : r.id] ? (({ trades, expectancyPct, ci95, costPct, overshootPct }) => ({ trades, expectancyPct, ci95, costPct, overshootPct }))(S.replays[r.id === "R4" ? "R3" : r.id]) : null,
      timeArms: ["L", "S"].map((v) => { const st4 = stats(trd.filter((t) => t.strategy === r.id && t.tvar === v && !seatCut(t)).map((t) => t.pnl_pct)); return { id: v, n: st4.n, winRate: st4.winRate, expectancyPct: st4.expectancyPct }; }) })),
    tools: tools.map((t) => ({ name: t.name, licence: t.licence, verdict: t.verdict, status: t.status, usedBy: t.used_by, bestUse: t.best_use })),
    replay: S.replay_R3 ? { trades: S.replay_R3.trades, expectancyPct: S.replay_R3.expectancyPct, ci95: S.replay_R3.ci95, costPct: S.replay_R3.costPct, evidence: S.replay_R3.evidence } : null,
    health: { ...(S.health || {}), ledger: ledNow.ok, watch: await watch(d, S), errors: mkt.filter((r) => !r.ok).slice(0, 12).map((r) => ({ feed: r.k, error: r.err, at: r.at })) },
    history: { priceSamples1h: hist.n, coins: hist.m, barsNeeded: MIN_OWN_BARS, ready: hist.ready },
    shadow: await shadowStats(d),
    whales: { ...(await whaleState(d)), nansen: nzs.state },
    rules: (await d.q(`SELECT name, weight, blocked_winners, blocked_losers FROM mob_aq_rules ORDER BY name`)).map((r) => ({ name: r.name, weight: round(r.weight, 2), blockedWinners: r.blocked_winners, blockedLosers: r.blocked_losers })),
    council_rules: { hard: ["no Jupiter sell route", "mint or freeze authority", `liquidity under $${COUNCIL.hardMinLiq}`, "stale price", "stop > target", `target under ${COUNCIL.costMultiple}x measured round trip`, `${COUNCIL.costMultiple}x measured round trip over ${COUNCIL.atrMultiple}x ATR5`, "fill outside its own stop/target", "strategy's own replay loses", "kill switch", "destroyed"], passScore: COUNCIL.passScore, exploreEveryMin: COUNCIL.exploreEveryMin, maxOpen: COUNCIL.maxOpen, riskPct: COUNCIL.riskPct },
    tradesLastHour: trd.filter((t) => t.opened_at && Date.now() - new Date(t.opened_at).getTime() < 3600000).length + pos.filter((p) => Date.now() - new Date(p.opened_at).getTime() < 3600000).length,
    funnel: S.funnel || null,
    lanes: await laneStats(d, { n: s.n, winRate: s.winRate, expectancyPct: s.expectancyPct, open: pos.length }),
    ledger: ledNow,
    survival: (() => { const sv = survival(equity, ledNow.baseSol); return { health: sv.health, stage: S.destroyed === true ? "destroyed" : sv.stage, sizeMult: S.destroyed === true ? 0 : sv.sizeMult, maxOpen: S.destroyed === true ? 0 : sv.maxOpen }; })(),
    helpers: { grok: conn("grok"), chatgpt: conn("chatgpt"), codex: conn("codex"), codexLastAt: hl.codex || null, grokLastAt: hl.grok || null, chatgptLastAt: hl.chatgpt || null },
    xfeed: xs.map((r) => ({ at: r.at, section: r.dept, text: r.text, label: (r.labels || [])[0] || "CLAIMED", source: "grok", weight: r.weight })),
    marketFeed: nzs.feed,
    solWallet: { ...walletPublic(S), live: await liveState(d), payout: publicPayout(S.sol_payout), withdrawals: await withdrawals(d), backup: S.sol_wallet_backup ? { ok: S.sol_wallet_backup.ok, note: S.sol_wallet_backup.note, at: S.sol_wallet_backup.at } : null }, // the Aquarius Solana wallet made on the server: public address, balances, limits. Never the key.
    robinhood: rhPublic(S), // the Robinhood agent account link: connected or not, the last read, the limits. No token.
  };
}

// Only Alex (admin session) rebuilds a destroyed island: new paper wallet, brain memory kept.
export async function rebuild(env) {
  await ensureSeed(env);
  const d = db(env);
  const { n, baseSol } = await resetLedger(d); // positions written off, cash back to the wallet base, one statement
  await setState(d, "destroyed", false);
  await brain(d, "ops", "event", `Alex rebuilt the island: paper wallet reset to ${baseSol} SOL (${n} open position(s) written off). The brain keeps everything it learned.`);
  return { rebuilt: true, equitySol: baseSol };
}

// Alex's "sell all": every open paper position is sold at the live Jupiter sell quote (minus the network fee), every
// shadow probe is closed at the live mid minus its cost. No quote / no price = that one stays open (never a made-up fill).
// Live path note: swaps would go through Jupiter and be signed in Alex's own wallet on the page; the server never holds a key.
export async function sellAll(env, opts = {}) {
  await ensureSeed(env);
  const d = db(env), gap = opts.gapMs ?? Number(env.AQ_JUP_GAP_MS ?? 1100), why = "CEO sell all";
  const mj = await feeds.majors(env);
  // no fresh SOL price: the last one the desk saw still sells (a sale is quoted in SOL; the price only sizes the tiny fee)
  const solUsd = mj.data?.sol?.price ?? (await getState(d, "sol_usd", null))?.price ?? null, feeSol = solUsd ? NET_FEE_SOL : null;
  const out = { sold: [], kept: [], shadowClosed: [], skipped: [] };
  const open = await d.q(`SELECT * FROM mob_aq_positions ORDER BY id`);
  for (const [i, p] of open.entries()) {
    if (i) await sleep(gap);
    const q = feeSol ? await jupQuote(p.mint, SOL_MINT, p.tokens_raw) : null;
    if (!q) { out.kept.push({ symbol: p.symbol, reason: feeSol ? "no sell quote" : "no SOL price" }); continue; }
    const gross = Number(q.outAmount) / 1e9;
    const exitPx = (gross * solUsd) / (Number(p.tokens_raw) / 10 ** p.decimals);
    const slip = p.last_price_usd ? round((p.last_price_usd / exitPx - 1) * 100, 3) : null;
    // the claim (ledger.mjs): only the request that deletes the row writes the trade, the cash and the flows
    const t = await closePosition(d, p, { gross, feeSol, exitPx, slip, why, gradePrefix: "CEO", exitMid: p.last_price_usd ?? null });
    if (!t) { out.skipped.push({ symbol: p.symbol, reason: "already sold by another request" }); continue; }
    out.sold.push({ symbol: p.symbol, pnlPct: t.pnl_pct, backSol: round(t.back_sol, 9) });
  }
  const sh = await d.q(`SELECT * FROM mob_aq_shadow WHERE closed_at IS NULL`);
  if (sh.length) {
    let mids = {};
    try { mids = await midPrices(sh.map((s) => ({ mint: s.mint, pool: s.pool }))); } catch {}
    for (const s of sh) {
      const mid = mids[s.mint];
      if (mid == null) { out.kept.push({ symbol: s.symbol, reason: "SHADOW: no price" }); continue; }
      const pnl = round(((mid - s.entry_price) / s.entry_price) * 100 - s.cost_pct, 3);
      const won = await d.one(`UPDATE mob_aq_shadow SET closed_at=now(), exit_price=$2, pnl_pct=$3, outcome=$4 WHERE id=$1 AND closed_at IS NULL RETURNING id`, [s.id, mid, pnl, why]);
      if (won) out.shadowClosed.push({ symbol: s.symbol, pnlPct: pnl });
    }
  }
  if (out.sold.length || out.shadowClosed.length || out.kept.length || !out.skipped.length) await brain(d, "execution", "event", `${why}: sold ${out.sold.length} paper position(s) (${out.sold.map((x) => `${x.symbol} ${x.pnlPct}%`).join(", ") || "none"}), closed ${out.shadowClosed.length} shadow probe(s)${out.kept.length ? `, kept ${out.kept.length} with no live price` : ""}.`, out);
  return out;
}
