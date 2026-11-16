// TRAINING ARENA (aquarius-trader skill, "TRAINING MODE"). A switch Alex turns on. Beside the normal paper book, never mixed
// into it: its own 1,000 SOL paper wallet, its own tables (mob_aq_arena_*), no row of the main ledger is read for money or written.
//
// How a virtual trade is made, honestly:
// - PRICES are real: one Jupiter price sample a minute for up to 150 tracked coins, kept as a 90-minute ring per coin. The
//   resolution is ONE SAMPLE A MINUTE (no high/low inside the minute): a stop or target touched and left inside a minute is not seen.
// - No open virtual trades are stored. At minute T every trade that ENTERED at minute T-H (H = its hold) is resolved in one go:
//   the entry decision reads samples up to its entry minute only, the result reads the samples after it. Nothing can peek.
// - A GRID of settings is tried on every coin every minute: entry type x stop (in ATR5) x reward:risk x hold, per liquidity tier,
//   with a RANDOM-ENTRY baseline for every stop/target/hold/tier, so each setting is judged against luck, not against zero.
// - COSTS are measured: one real Jupiter round-trip quote a minute on a rotating coin feeds a table per tier and size; a
//   virtual trade pays the median of its tier. Stops fill at the sample that crossed them, never better than the measured overshoot.
// - STORAGE: running totals per setting per day (n, wins, sum, sum of squares, exits, drawdown) and a small sample of trades.
// - HONESTY: thousands of settings means some win by luck. A setting graduates only when it beats random on a LATER day than
//   the one it was picked on. Graduates are proposed to the main book as challengers (a tournament row), nothing is switched.
import { db } from "../db.mjs";
import { jupPrices, jupQuote, SOL_MINT } from "./feeds.mjs";
import { atr5Pct, fibSetup, momentumSetup, bounceSetup, roundTripPct, seed01, round, median } from "./logic.mjs";
import { R3_PARAMS, R6_PARAMS, R7_PARAMS } from "./seed.mjs";
import { costBook, AUDIT_RT } from "./council.mjs";
import { NET_FEE_SOL, AUDIT_OVERSHOOT_PCT } from "./engine.mjs";

export const ARENA = { walletSol: 1000, sizeSol: 1, ring: 90, look: 25, holds: [2, 5, 10, 20, 45], stops: [1, 2, 3], rrs: [1.5, 3], randomP: 0.15, maxCoins: 150, minLiqUsd: 20000,
  minTrades: 300, maxPicks: 20, z: 1.96, sampleSlots: 20, samplesPerTick: 40, costSizes: [1, 5], keepDays: 35 };
// entry type -> the rule of the main book its result speaks to
export const ENTRY_RULE = { random: "baseline (luck)", mom1: "R6 momentum, 1x ATR in 5 min", mom2: "R6 momentum, 2x ATR in 5 min", rev1: "R7 mean reversion, -1x ATR in 5 min", rev2: "R7 mean reversion, -2x ATR in 5 min",
  brk: "R6 breakout over the 20-minute high (no margin, no volume rule)", brkpb: "breakout then pullback of half an ATR", r3: "R3 Fibonacci pullback (recipe entry)", r6: "R6 breakout (recipe entry)", r7: "R7 oversold bounce (recipe entry)",
  whale: "R5 whale signal (own book)", nansen: "R5 Nansen-labelled buy", grok_pick: "Grok pick", grok_vote: "Grok BUY vote", grok_skip: "Grok SKIP vote (should lose to random if he is right)", grok_heat: "Grok X narrative heat" };
export const tierOfLiq = (liq) => (liq >= 500000 ? "A" : liq >= 100000 ? "B" : "C"); // by liquidity only: the arena has no age for every coin
export const variantId = (entry, s, r, h) => `${entry}|s${s}|r${r}|h${h}`;
export const baselineOf = (variant) => variant.replace(/^[^|]+/, "random");
const getState = async (d, k, dflt = null) => (await d.one(`SELECT v FROM mob_aq_state WHERE k=$1`, [k]))?.v ?? dflt;
const setState = (d, k, v) => d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ($1,$2,now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [k, JSON.stringify(v)]);
const brain = (d, dept, kind, text, data = null) => d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ($1,$2,$3,$4)`, [dept, kind, text, data && JSON.stringify(data)]);
const dayOf = (min) => new Date(min * 60000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- pure: entries, one trade, one minute
// Which entry types fire for this coin at ring index e. Reads px[0..e] and events at or before minute(e). Never px[e+1..].
export function entriesAt(coin, e, minuteOfE, ev = {}) {
  const px = coin.px, out = [];
  if (e < ARENA.look || px[e] == null) return { fired: out, atr: null };
  const from = Math.max(0, e - 44), cs = [];
  for (let i = from; i <= e; i++) { if (px[i] == null) return { fired: out, atr: null }; const o = i > from ? px[i - 1] : px[i]; cs.push({ t: (minuteOfE - (e - i)) * 60, o, h: Math.max(o, px[i]), l: Math.min(o, px[i]), c: px[i], v: 1 }); }
  const atr = atr5Pct(cs.slice(-ARENA.look));
  if (atr == null || !(atr > 0)) return { fired: out, atr: null };
  const P = px[e], ret5 = (P / px[e - 5] - 1) * 100, max = (a, b) => { let m = -Infinity; for (let i = a; i <= b; i++) if (px[i] > m) m = px[i]; return m; };
  if (seed01(`${coin.mint}|${minuteOfE}|arena`) < ARENA.randomP) out.push("random");
  if (ret5 >= atr) out.push("mom1");
  if (ret5 >= 2 * atr) out.push("mom2");
  if (ret5 <= -atr) out.push("rev1");
  if (ret5 <= -2 * atr) out.push("rev2");
  if (P > max(e - 20, e - 1)) out.push("brk");
  const old = max(e - 25, e - 6), recent = max(e - 5, e - 1);
  if (recent > old && P > old && P <= recent * (1 - (0.5 * atr) / 100)) out.push("brkpb");
  if (cs.length >= 45) {
    const now = minuteOfE * 60 + 60;
    try { if (fibSetup(cs, R3_PARAMS, now).signal) out.push("r3"); } catch {}
    try { if (momentumSetup(cs, R6_PARAMS, now).signal) out.push("r6"); } catch {}
    try { if (bounceSetup(cs, R7_PARAMS, now).signal) out.push("r7"); } catch {}
  }
  // signals and Grok inputs: an event at or before the entry minute, no older than its window
  for (const [kind, win] of [["whale", 3], ["nansen", 3], ["grok_pick", 3], ["grok_vote", 3], ["grok_skip", 3], ["grok_heat", 30]]) {
    const ts = ev[kind]?.[kind === "grok_heat" ? String(coin.symbol || "").toLowerCase() : coin.mint];
    if (ts && ts.some((m) => m <= minuteOfE && m > minuteOfE - win)) out.push(kind);
  }
  return { fired: out, atr };
}
// One virtual trade on the samples after the entry. Returns null when a sample of its path is missing.
export function simulate(px, e, H, atr, s, rr, costPct, overshootPct) {
  const P = px[e], stop = P * (1 - (s * atr) / 100), target = P * (1 + (s * rr * atr) / 100);
  let exit = null, why = "time";
  for (let i = e + 1; i <= e + H; i++) {
    const p = px[i];
    if (p == null) return null;
    if (p <= stop) { exit = Math.min(p, stop * (1 - overshootPct / 100)); why = "stop"; break; }
    if (p >= target) { exit = target; why = "target"; break; }
    if (i === e + H) exit = p;
  }
  const gross = (exit / P - 1) * 100;
  return { why, grossPct: gross, netPct: gross - costPct };
}
// Every trade that entered H minutes before the newest sample (index px.length-1 = minute T), for every hold and grid point.
export function resolveMinute(coins, T, { costs, overshootPct = AUDIT_OVERSHOOT_PCT, events = {} }) {
  const trades = [];
  let skipped = 0;
  for (const coin of coins) {
    const last = coin.px.length - 1;
    for (const H of ARENA.holds) {
      const e = last - H;
      if (e < ARENA.look) continue;
      const { fired, atr } = entriesAt(coin, e, T - H, events);
      if (!fired.length) continue;
      const cost = costs[coin.tier];
      if (cost == null) { skipped += fired.length; continue; }
      for (const s of ARENA.stops) for (const rr of ARENA.rrs) {
        const r = simulate(coin.px, e, H, atr, s, rr, cost, overshootPct);
        if (!r) { skipped += fired.length; continue; }
        for (const entry of fired) trades.push({ variant: variantId(entry, s, rr, H), entry, tier: coin.tier, tod: Math.floor((((T - H) % 1440) + 1440) % 1440 / 360), mint: coin.mint, symbol: coin.symbol, entryMin: T - H, hold: H, entryPx: coin.px[e], atr, why: r.why, netPct: r.netPct, grossPct: r.grossPct });
      }
    }
  }
  return { trades, skipped };
}
export function aggregate(trades) {
  const m = new Map();
  for (const t of trades) {
    const k = `${t.variant}\t${t.tier}\t${t.tod}`;
    let a = m.get(k);
    if (!a) m.set(k, (a = { variant: t.variant, tier: t.tier, tod: t.tod, n: 0, wins: 0, sum: 0, sumsq: 0, stop: 0, target: 0, time: 0 }));
    a.n++; if (t.netPct > 0) a.wins++; a.sum += t.netPct; a.sumsq += t.netPct * t.netPct; a[t.why]++;
  }
  return [...m.values()];
}
// mean and 95% interval of a setting, and of its edge over the random baseline with the same stop/target/hold/tier
export function statOf(a) {
  if (!a || a.n < 2) return { n: a?.n || 0, mean: null, lo: null, hi: null, varOfMean: null };
  const mean = a.sum / a.n, v = Math.max(0, (a.sumsq - a.n * mean * mean) / (a.n - 1)), h = ARENA.z * Math.sqrt(v / a.n);
  return { n: a.n, wins: a.wins, mean: round(mean, 4), lo: round(mean - h, 4), hi: round(mean + h, 4), varOfMean: v / a.n };
}
export function edgeOf(a, base) {
  const x = statOf(a), b = statOf(base);
  if (x.mean == null || b.mean == null) return { ...x, base: b.mean, baseN: b.n, edge: null, edgeLo: null, edgeHi: null };
  const diff = x.mean - b.mean, h = ARENA.z * Math.sqrt(x.varOfMean + b.varOfMean);
  return { n: x.n, wins: x.wins, mean: x.mean, lo: x.lo, hi: x.hi, base: b.mean, baseN: b.n, edge: round(diff, 4), edgeLo: round(diff - h, 4), edgeHi: round(diff + h, 4) };
}
// rows = one day's totals [{variant, tier, n, wins, sum, sumsq}] -> every non-random setting with its edge over its baseline
export function scoreDay(rows) {
  const by = new Map(rows.map((r) => [`${r.variant}\t${r.tier}`, r])), out = [];
  for (const r of rows) {
    if (r.variant.startsWith("random|")) continue;
    out.push({ variant: r.variant, tier: r.tier, ...edgeOf(r, by.get(`${baselineOf(r.variant)}\t${r.tier}`)) });
  }
  return out;
}
// WALK-FORWARD, pure. select() reads ONE day's rows; confirm() reads a LATER day's rows for a pick made earlier.
export function wfSelect(rows) {
  const scored = scoreDay(rows), ok = scored.filter((x) => x.n >= ARENA.minTrades && x.baseN >= ARENA.minTrades && x.edgeLo != null && x.edgeLo > 0 && x.mean > 0); // better than luck AND paying after costs: the few places on the fresh day are not spent on a smaller loss
  return { tried: scored.length, eligible: ok.length, picks: ok.sort((a, b) => b.edgeLo - a.edgeLo).slice(0, ARENA.maxPicks) };
}
export function wfConfirm(pick, selectedDay, confirmDay, rows) {
  if (!(confirmDay > selectedDay)) throw new Error("walk-forward: the confirming day must be after the day the setting was picked on");
  const by = new Map(rows.map((r) => [`${r.variant}\t${r.tier}`, r]));
  const e = edgeOf(by.get(`${pick.variant}\t${pick.tier}`), by.get(`${baselineOf(pick.variant)}\t${pick.tier}`));
  const why = e.n < ARENA.minTrades || e.baseN < ARENA.minTrades ? `too few trades on the fresh day (${e.n}, baseline ${e.baseN}; ${ARENA.minTrades} needed)` : !(e.edgeLo > 0) ? `did not beat random on the fresh day (edge ${e.edge}%, interval ${e.edgeLo} to ${e.edgeHi})` : !(e.mean > 0) ? `beat random but still lost after costs (${e.mean}% a trade)` : null;
  return { graduated: !why, why: why || `beat random on a day it was not picked on: edge ${e.edge}% (interval ${e.edgeLo} to ${e.edgeHi}), ${e.mean}% a trade after costs over ${e.n} trades`, stats: e };
}

// ---------------------------------------------------------------- database
const DAY_ROWS = `SELECT variant, tier, sum(n)::int n, sum(wins)::int wins, sum(sum_pct)::float8 sum, sum(sumsq_pct)::float8 sumsq FROM mob_aq_arena_agg WHERE day = $1::date GROUP BY variant, tier`;
export async function writeAggregates(d, day, regime, aggs) {
  if (!aggs.length) return 0;
  const col = (k) => aggs.map((a) => a[k]);
  await d.q(`INSERT INTO mob_aq_arena_agg AS g (day, variant, tier, tod, regime, n, wins, sum_pct, sumsq_pct, n_stop, n_target, n_time, cum_pct, peak_pct, maxdd_pct)
    SELECT $1::date, x.v, x.t, x.td, $2::text, x.n, x.w, x.s, x.q, x.a, x.b, x.c, x.s, greatest(x.s, 0), greatest(-x.s, 0)
    FROM unnest($3::text[], $4::text[], $5::int[], $6::int[], $7::int[], $8::float8[], $9::float8[], $10::int[], $11::int[], $12::int[]) x(v, t, td, n, w, s, q, a, b, c)
    ON CONFLICT (day, variant, tier, tod, regime) DO UPDATE SET n = g.n + EXCLUDED.n, wins = g.wins + EXCLUDED.wins, sum_pct = g.sum_pct + EXCLUDED.sum_pct, sumsq_pct = g.sumsq_pct + EXCLUDED.sumsq_pct,
      n_stop = g.n_stop + EXCLUDED.n_stop, n_target = g.n_target + EXCLUDED.n_target, n_time = g.n_time + EXCLUDED.n_time, cum_pct = g.cum_pct + EXCLUDED.sum_pct,
      peak_pct = greatest(g.peak_pct, g.cum_pct + EXCLUDED.sum_pct), maxdd_pct = greatest(g.maxdd_pct, greatest(g.peak_pct, g.cum_pct + EXCLUDED.sum_pct) - (g.cum_pct + EXCLUDED.sum_pct))`,
    [day, regime || "unknown", col("variant"), col("tier"), col("tod"), col("n"), col("wins"), col("sum"), col("sumsq"), col("stop"), col("target"), col("time")]);
  return aggs.length;
}
// the measured round-trip table: per tier and size, the median of the last 50 real quotes of the day; until a tier has five,
// the main desk's own measured/audit cost for that tier
export async function costTable(d) {
  const rows = await d.q(`SELECT tier, size_sol, rt_pct FROM (SELECT tier, size_sol, rt_pct, row_number() OVER (PARTITION BY tier, size_sol ORDER BY id DESC) k FROM mob_aq_arena_costs WHERE at > now() - interval '24 hours') x WHERE k <= 50`);
  const book = await costBook(d, ARENA.sizeSol), table = {}, costs = {};
  for (const t of ["A", "B", "C"]) for (const size of ARENA.costSizes) {
    const xs = rows.filter((r) => r.tier === t && r.size_sol === size).map((r) => r.rt_pct);
    table[`${t}@${size}`] = xs.length >= 5 ? { pct: round(Math.max(0, median(xs)), 3), n: xs.length, src: "arena quotes (24h median)" } : size === ARENA.sizeSol ? { pct: book.tierCost(t).pct ?? AUDIT_RT[t], n: xs.length, src: `main desk: ${book.tierCost(t).src}` } : { pct: null, n: xs.length, src: "not measured yet" };
    if (size === ARENA.sizeSol) costs[t] = table[`${t}@${size}`].pct;
  }
  return { table, costs };
}

export async function setTraining(env, on, by) {
  const d = db(env), was = (await getState(d, "training_mode", false)) === true;
  await setState(d, "training_mode", !!on);
  if (was !== !!on) {
    const a = (await getState(d, "arena", {})) || {};
    await setState(d, "arena", { ...a, on: !!on, since: on ? new Date().toISOString() : a.since ?? null, stoppedAt: on ? null : new Date().toISOString() });
    await brain(d, "learning", "event", `Training arena turned ${on ? "ON" : "off"} by ${by}. It is a separate ${ARENA.walletSol} SOL paper wallet with its own tables; the main paper book is not touched.`);
  }
  return trainingState(d);
}
export async function trainingState(d, S = null) {
  const on = (S ? S.training_mode : await getState(d, "training_mode", false)) === true, a = (S ? S.arena : await getState(d, "arena", null)) || {};
  const grads = new Set((a.graduated ?? []).map((g) => `${g.variant}\t${g.tier}`));
  // (trades, perMin, variants, random and leaders[].name/expectancyPct/vsRandomPct are the names the panel reads)
  return { on, since: a.since ?? null, walletSol: a.walletSol ?? ARENA.walletSol, startSol: ARENA.walletSol, sizeSol: ARENA.sizeSol, virtualTradesTotal: a.virtualTradesTotal ?? 0, perMinute: a.perMinute ?? 0, trades: a.virtualTradesTotal ?? 0, perMin: a.perMinute ?? 0, variants: a.variantsTried ?? 0, random: a.random ?? { n: 0, expectancyPct: null, ci95: null }, tickMs: a.tickMs ?? null, coins: a.coins ?? 0, coinsReady: a.coinsReady ?? 0,
    variantsTried: a.variantsTried ?? 0, leaders: (a.leaders ?? []).map((x) => ({ ...x, name: `${x.variant} tier ${x.tier}`, expectancyPct: x.meanPct, vsRandomPct: x.edgePct, graduated: grads.has(`${x.variant}\t${x.tier}`) })), laggards: a.laggards ?? [], graduated: a.graduated ?? [], pending: a.pending ?? [], grok: a.grok ?? [], costs: a.costs ?? null, lastTickAt: a.lastTickAt ?? null, resolution: "one real price sample a minute per coin (no high/low inside the minute)",
    note: a.note ?? (on ? "warming up: a coin needs 25 minutes of samples before its first entry, plus the hold" : "off: turn it on in the panel") };
}

// ---------------------------------------------------------------- the arena tick (after the main tick, never inside its lock or its ledger)
export async function arenaTick(env, opts = {}) {
  const d = db(env);
  if ((await getState(d, "training_mode", false)) !== true) return { off: true };
  const t0 = Date.now(), T = Math.floor((opts.now ?? Date.now()) / 60000);
  // one arena tick per minute: the claim is one statement, an overlapping run gets nothing
  if (!(await d.one(`INSERT INTO mob_aq_state (k, v, at) VALUES ('arena_min', to_jsonb($1::bigint), now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, at = now() WHERE (mob_aq_state.v #>> '{}')::bigint < $1::bigint RETURNING k`, [T]))) return { skipped: "this minute is already done" };
  const out = { minute: T };
  // ---- universe: the most liquid tracked coins, plus any coin a signal or Grok named in the last two hours
  const evRows = await d.q(`SELECT 'whale' kind, mint, NULL sym, at FROM mob_aq_signals WHERE source = 'own' AND at > now() - interval '2 hours'
    UNION ALL SELECT 'nansen', mint, NULL, at FROM mob_aq_signals WHERE source = 'nansen' AND at > now() - interval '2 hours'
    UNION ALL SELECT 'grok_pick', mint, NULL, created_at FROM mob_aq_picks WHERE helper = 'grok' AND created_at > now() - interval '2 hours'
    UNION ALL SELECT CASE vote WHEN 'BUY' THEN 'grok_vote' ELSE 'grok_skip' END, mint, NULL, at FROM mob_aq_votes WHERE helper = 'grok' AND vote IN ('BUY','SKIP') AND at > now() - interval '2 hours'
    UNION ALL SELECT 'grok_heat', NULL, text, at FROM mob_aq_helpers WHERE from_helper = 'grok' AND channel = 'x' AND at > now() - interval '2 hours'`);
  const events = {}, add = (kind, key, at) => (((events[kind] ||= {})[key] ||= []).push(Math.floor(new Date(at).getTime() / 60000)));
  for (const r of evRows) { if (r.kind === "grok_heat") for (const m of String(r.sym).matchAll(/\$([A-Za-z0-9]{2,12})\b/g)) add("grok_heat", m[1].toLowerCase(), r.at); else add(r.kind, r.mint, r.at); }
  const named = [...new Set(evRows.filter((r) => r.mint).map((r) => r.mint))].slice(0, 30);
  const watch = await d.q(`SELECT mint, symbol, liq_usd FROM mob_aq_watch WHERE (last_seen > now() - interval '1 day' AND liq_usd >= $1) OR mint = ANY($3::text[]) ORDER BY (mint = ANY($3::text[])) DESC, liq_usd DESC NULLS LAST LIMIT $2`, [ARENA.minLiqUsd, ARENA.maxCoins, named]);
  // ---- real prices, 50 coins a call
  const px = {};
  for (let i = 0; i < watch.length; i += 50) { try { Object.assign(px, await jupPrices(watch.slice(i, i + 50).map((w) => w.mint))); } catch {} }
  // ---- the rings: append this minute's sample (a missed minute stays a gap, never a made-up price)
  const rings = Object.fromEntries((await d.q(`SELECT mint, symbol, tier, liq_usd, t_last, px, dead FROM mob_aq_arena_px`)).map((r) => [r.mint, r]));
  const coins = [];
  for (const w of watch) {
    const r = rings[w.mint], p = px[w.mint]?.price ?? null, liq = px[w.mint]?.liqUsd ?? w.liq_usd ?? r?.liq_usd ?? null;
    let arr = r ? r.px.slice() : [];
    const gap = r ? T - Number(r.t_last) : 1;
    if (r && gap <= 0) continue;
    if (gap > ARENA.ring) arr = []; else for (let k = 1; k < gap; k++) arr.push(null);
    arr.push(p);
    if (arr.length > ARENA.ring) arr = arr.slice(-ARENA.ring);
    coins.push({ mint: w.mint, symbol: w.symbol || r?.symbol || w.mint.slice(0, 6), liq, tier: liq != null && liq >= ARENA.minLiqUsd ? tierOfLiq(liq) : null, px: arr, dead: !!r?.dead });
  }
  if (coins.length) await d.q(`INSERT INTO mob_aq_arena_px (mint, symbol, tier, liq_usd, t_last, px, at) SELECT m, s, t, l, $5::bigint, p::jsonb, now() FROM unnest($1::text[], $2::text[], $3::text[], $4::float8[], $6::text[]) x(m, s, t, l, p)
    ON CONFLICT (mint) DO UPDATE SET symbol = EXCLUDED.symbol, tier = EXCLUDED.tier, liq_usd = EXCLUDED.liq_usd, t_last = EXCLUDED.t_last, px = EXCLUDED.px, at = now()`,
    [coins.map((c) => c.mint), coins.map((c) => c.symbol), coins.map((c) => c.tier), coins.map((c) => c.liq), T, coins.map((c) => JSON.stringify(c.px))]);
  // data-quality rules, the only ones that stay: a real price now, a pool with liquidity, not known unsellable
  const live = coins.filter((c) => c.tier && !c.dead && c.px.at(-1) != null);
  // ---- costs: one real round-trip quote a minute on a rotating coin, 1 SOL and 5 SOL in turn
  if (live.length && opts.quote !== false) {
    const c = live[Math.floor(seed01(`cost|${T}`) * live.length)], size = ARENA.costSizes[T % ARENA.costSizes.length];
    const buy = await jupQuote(SOL_MINT, c.mint, Math.floor(size * 1e9)), sell = buy ? await jupQuote(c.mint, SOL_MINT, buy.outAmount) : null;
    if (buy && sell) await d.q(`INSERT INTO mob_aq_arena_costs (tier, size_sol, mint, rt_pct) VALUES ($1,$2,$3,$4)`, [c.tier, size, c.mint, roundTripPct(size, Number(sell.outAmount) / 1e9, NET_FEE_SOL)]);
    else if (buy && !sell) { await d.q(`UPDATE mob_aq_arena_px SET dead = true WHERE mint = $1`, [c.mint]); c.dead = true; } // a coin that cannot be sold leaves the arena
    out.costQuote = { symbol: c.symbol, size, ok: !!(buy && sell) };
  }
  const { table, costs } = await costTable(d);
  const os = (await getState(d, "replays", null))?.overshootPct ?? AUDIT_OVERSHOOT_PCT;
  // ---- resolve every virtual trade whose hold ends this minute
  const regime = (await getState(d, "regime", null))?.label || "unknown";
  const { trades, skipped } = resolveMinute(live.filter((c) => !c.dead), T, { costs, overshootPct: os, events });
  const aggs = aggregate(trades), day = dayOf(T);
  await writeAggregates(d, day, regime, aggs);
  // a small recent sample of individual trades per setting (a fixed number of slots, overwritten at random)
  if (trades.length) {
    const pick = new Map();
    for (let i = 0; i < ARENA.samplesPerTick; i++) { const t = trades[Math.floor(seed01(`s|${T}|${i}`) * trades.length)]; pick.set(`${t.variant}\t${t.tier}\t${Math.floor(seed01(`slot|${T}|${i}`) * ARENA.sampleSlots)}`, t); }
    const ks = [...pick.keys()].map((k) => k.split("\t")), vs = [...pick.values()];
    await d.q(`INSERT INTO mob_aq_arena_samples (variant, tier, slot, mint, symbol, entry_min, hold_min, entry_px, atr_pct, why, gross_pct, net_pct, at)
      SELECT * , now() FROM unnest($1::text[], $2::text[], $3::int[], $4::text[], $5::text[], $6::bigint[], $7::int[], $8::float8[], $9::float8[], $10::text[], $11::float8[], $12::float8[]) x
      ON CONFLICT (variant, tier, slot) DO UPDATE SET mint = EXCLUDED.mint, symbol = EXCLUDED.symbol, entry_min = EXCLUDED.entry_min, hold_min = EXCLUDED.hold_min, entry_px = EXCLUDED.entry_px, atr_pct = EXCLUDED.atr_pct, why = EXCLUDED.why, gross_pct = EXCLUDED.gross_pct, net_pct = EXCLUDED.net_pct, at = now()`,
      [ks.map((k) => k[0]), ks.map((k) => k[1]), ks.map((k) => Number(k[2])), vs.map((t) => t.mint), vs.map((t) => t.symbol), vs.map((t) => t.entryMin), vs.map((t) => t.hold), vs.map((t) => t.entryPx), vs.map((t) => t.atr), vs.map((t) => t.why), vs.map((t) => round(t.grossPct, 4)), vs.map((t) => round(t.netPct, 4))]);
  }
  Object.assign(out, { coins: coins.length, coinsLive: live.length, trades: trades.length, skipped, settings: aggs.length });
  // ---- the scoreboard of today, the wallet, Grok's score
  const today = await d.q(DAY_ROWS, [day]), scored = scoreDay(today).filter((x) => x.edgeLo != null && x.n >= ARENA.minTrades && x.baseN >= ARENA.minTrades);
  const tot = await d.one(`SELECT coalesce(sum(n),0)::float8 n, coalesce(sum(sum_pct),0)::float8 s, count(DISTINCT variant || tier)::int v FROM mob_aq_arena_agg`);
  const rnd = statOf(await d.one(`SELECT coalesce(sum(n),0)::int n, coalesce(sum(wins),0)::int wins, coalesce(sum(sum_pct),0)::float8 sum, coalesce(sum(sumsq_pct),0)::float8 sumsq FROM mob_aq_arena_agg WHERE variant LIKE 'random|%'`));
  const show = (x) => ({ variant: x.variant, tier: x.tier, rule: ENTRY_RULE[x.variant.split("|")[0]] || null, n: x.n, meanPct: x.mean, ci95: [x.lo, x.hi], randomPct: x.base, edgePct: x.edge, edgeCi95: [x.edgeLo, x.edgeHi] });
  const gk = await d.q(`SELECT split_part(variant, '|', 1) entry, sum(n)::int n, sum(wins)::int wins, sum(sum_pct)::float8 sum, sum(sumsq_pct)::float8 sumsq FROM mob_aq_arena_agg WHERE variant LIKE 'grok_%' GROUP BY 1`);
  const picks = await d.q(`SELECT variant, tier, selected_day, status, confirm_day, sel, conf FROM mob_aq_arena_picks ORDER BY id DESC LIMIT 60`);
  const prev = (await getState(d, "arena", {})) || {};
  const state = { ...prev, on: true, since: prev.since ?? new Date().toISOString(), lastTickAt: new Date().toISOString(), walletSol: round(ARENA.walletSol + (tot.s / 100) * ARENA.sizeSol, 4), virtualTradesTotal: tot.n, perMinute: trades.length, tickMs: Date.now() - t0,
    coins: coins.length, coinsReady: live.filter((c) => c.px.length > ARENA.look + ARENA.holds[0]).length, variantsTried: tot.v, random: { n: rnd.n, expectancyPct: rnd.mean, ci95: rnd.mean == null ? null : [rnd.lo, rnd.hi] }, costs: table, overshootPct: os,
    leaders: scored.slice().sort((a, b) => b.edgeLo - a.edgeLo).slice(0, 5).map(show), laggards: scored.slice().sort((a, b) => a.edgeHi - b.edgeHi).slice(0, 5).map(show),
    graduated: picks.filter((p) => p.status === "graduated").map((p) => ({ variant: p.variant, tier: p.tier, pickedOn: p.selected_day, confirmedOn: p.confirm_day, stats: p.conf })),
    pending: picks.filter((p) => p.status === "selected").map((p) => ({ variant: p.variant, tier: p.tier, pickedOn: p.selected_day })),
    grok: gk.map((g) => ({ input: g.entry, rule: ENTRY_RULE[g.entry], ...(({ n, mean, lo, hi }) => ({ n, meanPct: mean, ci95: [lo, hi] }))(statOf(g)) })),
    note: trades.length ? `${trades.length} virtual trades resolved this minute on ${live.length} coins; ${tot.v} settings tried so far, so some lead by luck: only walk-forward graduates count` : live.length ? "warming up: a coin needs 25 minutes of samples before its first entry, plus the hold" : "no priced coin this minute" };
  await setState(d, "arena", state);
  // ---- every hour: what beat random and what cost money, with the multiple-comparison warning
  const hour = Math.floor(T / 60), last = (await getState(d, "arena_hour", 0)) || 0;
  if (hour > last && scored.length) {
    await setState(d, "arena_hour", hour);
    const line = (x) => `${x.variant} tier ${x.tier} [${ENTRY_RULE[x.variant.split("|")[0]]}]: ${x.mean}% a trade after costs over ${x.n} (random ${x.base}%), edge ${x.edge}% (95% ${x.edgeLo} to ${x.edgeHi})`;
    const top = scored.slice().sort((a, b) => b.edgeLo - a.edgeLo).slice(0, 5), bottom = scored.slice().sort((a, b) => a.edgeHi - b.edgeHi).slice(0, 5), clear = scored.filter((x) => x.edgeLo > 0).length;
    await brain(d, "learning", "arena", `Training arena, ${day} so far: ${tot.n} virtual trades in total, ${scored.length} settings with ${ARENA.minTrades}+ trades compared with their random baseline today. ${clear} have an interval above random; with ${scored.length} tried, about ${round(scored.length * 0.025, 1)} would look like that by luck alone, and trades in the same minute move together, so the intervals are too narrow. Nothing here is a result until it repeats on a fresh day. TOP: ${top.map(line).join("; ")}. BOTTOM (rules that cost money): ${bottom.map(line).join("; ")}.`.slice(0, 6000), { day, tried: scored.length, clear, top: top.map(show), bottom: bottom.map(show) });
    out.hourly = true;
  }
  // ---- once a day: walk-forward, then housekeeping
  const wfDay = await getState(d, "arena_wf_day", null);
  if (wfDay !== day) { await setState(d, "arena_wf_day", day); out.walkForward = await walkForward(d, day); await d.q(`DELETE FROM mob_aq_arena_agg WHERE day < $1::date - $2::int`, [day, ARENA.keepDays]); await d.q(`DELETE FROM mob_aq_arena_costs WHERE at < now() - interval '7 days'`); await d.q(`DELETE FROM mob_aq_arena_px WHERE at < now() - interval '1 day'`); }
  out.ms = Date.now() - t0;
  return out;
}

// Walk-forward on complete days only. `today` (YYYY-MM-DD) is still running and is never read here.
export async function walkForward(d, today) {
  const res = { confirmed: [], failed: [], selected: 0 };
  const dayBefore = (s, k = 1) => new Date(Date.parse(s + "T00:00:00Z") - k * 86400000).toISOString().slice(0, 10), nextDay = (s) => dayBefore(s, -1), iso = (x) => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x).slice(0, 10));
  // 1. picks whose confirming day (the day after they were picked) is complete
  const open = await d.q(`SELECT id, variant, tier, selected_day FROM mob_aq_arena_picks WHERE status = 'selected' AND selected_day < $1::date - 1 ORDER BY id`, [today]);
  const cache = {};
  for (const p of open) {
    const sel = iso(p.selected_day), conf = nextDay(sel), rows = (cache[conf] ||= await d.q(DAY_ROWS, [conf]));
    const r = wfConfirm(p, sel, conf, rows);
    await d.q(`UPDATE mob_aq_arena_picks SET status = $2, confirm_day = $3::date, conf = $4 WHERE id = $1 AND status = 'selected'`, [p.id, r.graduated ? "graduated" : "failed", conf, JSON.stringify({ ...r.stats, why: r.why })]);
    (r.graduated ? res.confirmed : res.failed).push({ variant: p.variant, tier: p.tier, pickedOn: sel, confirmedOn: conf, why: r.why });
  }
  for (const g of res.confirmed) await brain(d, "learning", "tournament", `Arena challenger proposed for the main paper book: ${g.variant} on tier ${g.tier} coins [${ENTRY_RULE[g.variant.split("|")[0]]}]. Picked on ${g.pickedOn}, then ${g.why} (${g.confirmedOn}). It is a proposal: nothing in the main book changed. One sample a minute, no intraminute highs or lows; ${ARENA.maxPicks} settings at most are carried to a fresh day, so about ${round(ARENA.maxPicks * 0.025, 1)} a day can pass by luck.`, g);
  // 2. new picks from yesterday (complete), to be confirmed on today's data tomorrow
  const y = dayBefore(today);
  if (!(await d.one(`SELECT 1 x FROM mob_aq_arena_picks WHERE selected_day = $1::date LIMIT 1`, [y]))) {
    const s = wfSelect(await d.q(DAY_ROWS, [y]));
    for (const p of s.picks) await d.q(`INSERT INTO mob_aq_arena_picks (variant, tier, selected_day, sel) VALUES ($1,$2,$3::date,$4) ON CONFLICT DO NOTHING`, [p.variant, p.tier, y, JSON.stringify(p)]);
    res.selected = s.picks.length; res.tried = s.tried;
    if (s.tried) await brain(d, "learning", "arena", `Arena walk-forward, ${y}: ${s.tried} settings tried, ${s.eligible} beat their random baseline with the interval above zero and made money after costs (about ${round(s.tried * 0.025, 1)} expected by luck), the best ${s.picks.length} are carried to ${today} to be confirmed on data they were not picked on. Confirmed today from earlier picks: ${res.confirmed.length}; failed: ${res.failed.length}.`, { day: y, tried: s.tried, eligible: s.eligible, picks: s.picks.map((p) => [p.variant, p.tier, p.edgeLo]) });
  }
  return res;
}
