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
import { jupQuote, getJson, SOL_MINT } from "./feeds.mjs";
import { atr5Pct, fibSetup, momentumSetup, bounceSetup, roundTripPct, seed01, round, median, num } from "./logic.mjs";
import { R3_PARAMS, R6_PARAMS, R7_PARAMS } from "./seed.mjs";
import { costBook, AUDIT_RT } from "./council.mjs";
import { NET_FEE_SOL, AUDIT_OVERSHOOT_PCT } from "./engine.mjs";

// Alex, 2026-11-16 (final): 700 paper trades a minute, every minute, each 0.8 to 1 SOL, any coin, out of a 1,000 SOL paper wallet.
export const ARENA = { walletSol: 1000, sizeSol: 1, sizeMin: 0.8, sizeMax: 1, perMinute: 700, ring: 90, look: 25, holds: [2, 5, 10, 20, 45], stops: [1, 2, 3], rrs: [1.5, 3], randomP: 0.15, maxCoins: 150, minLiqUsd: 20000,
  minTrades: 300, boardMin: 50, maxPicks: 20, z: 1.96, sampleSlots: 20, samplesPerTick: 40, costSizes: [1, 5], keepDays: 35 };
// Fibonacci retracement bands of the last up-leg: [entry name, from, to) as a share of the leg given back
export const FIB_BANDS = [["fib382", 0.33, 0.44], ["fib50", 0.44, 0.56], ["fib618", 0.56, 0.70], ["fib786", 0.70, 0.85]];
// entry type -> the rule of the main book its result speaks to
export const ENTRY_RULE = { random: "baseline (luck)", mom1: "R6 momentum, 1x ATR in 5 min", mom2: "R6 momentum, 2x ATR in 5 min", rev1: "R7 mean reversion, -1x ATR in 5 min", rev2: "R7 mean reversion, -2x ATR in 5 min",
  brk: "R6 breakout over the 20-minute high (no margin, no volume rule)", brkpb: "breakout then pullback of half an ATR", volspike: "volume spike: a green minute on 3x the 20-minute volume", r3: "R3 Fibonacci pullback (recipe entry)", fib382: "Fibonacci 38.2% pullback of the last up-leg (observation)", fib50: "Fibonacci 50% pullback (observation)", fib618: "Fibonacci 61.8% golden pocket (observation)", fib786: "Fibonacci 78.6% deep pullback (observation)", r6: "R6 breakout (recipe entry)", r7: "R7 oversold bounce (recipe entry)",
  whale: "R5 whale signal (own book)", nansen: "R5 Nansen-labelled buy", grok_trade: "Grok's own trade (his pick, his stop and target, 45 minutes)", grok_pick: "Grok pick", grok_vote: "Grok BUY vote", grok_skip: "Grok SKIP vote (should lose to random if he is right)", grok_heat: "Grok X narrative heat" };
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
  for (let i = from; i <= e; i++) {
    if (px[i] == null) return { fired: out, atr: null };
    const b = coin.bars?.[i], o = i > from ? px[i - 1] : px[i];
    cs.push(b ? { t: (minuteOfE - (e - i)) * 60, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v } : { t: (minuteOfE - (e - i)) * 60, o, h: Math.max(o, px[i]), l: Math.min(o, px[i]), c: px[i], v: 1 });
  }
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
  if (coin.bars) { // a green minute on three times the volume of the twenty before it (needs real candles)
    let v = 0; for (let i = e - 20; i < e; i++) v += coin.bars[i].v || 0;
    if (v > 0 && coin.bars[e].v >= 3 * (v / 20) && coin.bars[e].c > coin.bars[e].o) out.push("volspike");
  }
  { // Fibonacci, as observation (Alex, 2026-11-17): the up-leg of the window (its lowest low, then the highest high after it), at least 2x ATR tall and
    // finished at least a minute ago. Which retracement band the price sits in now names the entry: 38.2, 50, 61.8 (the golden pocket) or 78.6.
    let li = 0; for (let i = 1; i < cs.length - 1; i++) if (cs[i].l < cs[li].l) li = i;
    let hi = li; for (let i = li + 1; i < cs.length - 1; i++) if (cs[i].h > cs[hi].h) hi = i;
    const L = cs[li].l, H = cs[hi].h;
    if (hi > li && L > 0 && (H / L - 1) * 100 >= 2 * atr) {
      const r = (H - P) / (H - L);
      for (const [name, a, b] of FIB_BANDS) if (r >= a && r < b) out.push(name);
    }
  }
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
// One virtual trade on real 1-minute candles after the entry bar. Entry = the close of bar e. Inside a bar the low is checked
// before the high (when both levels sit inside one bar the stop is assumed first: the careful reading). A stop fills at the
// stop level, or at the bar's open when the bar opened under it, less the measured overshoot, and never under the bar's low.
// Returns null when a bar of its path is missing.
export function simulate(bars, e, H, atr, s, rr, costPct, overshootPct) {
  const P = bars[e].c, stop = P * (1 - (s * atr) / 100), target = P * (1 + (s * rr * atr) / 100);
  let exit = null, why = "time";
  for (let i = e + 1; i <= e + H; i++) {
    const b = bars[i];
    if (!b) return null;
    if (b.l <= stop) { exit = Math.max(b.l, Math.min(b.o, stop) * (1 - overshootPct / 100)); why = "stop"; break; }
    if (b.h >= target) { exit = target; why = "target"; break; }
    if (i === e + H) exit = b.c;
  }
  const gross = (exit / P - 1) * 100;
  return { why, grossPct: gross, netPct: gross - costPct };
}
// Raw candles [{t (sec), o, h, l, c, v}] -> one slot per minute from minute `from` to `to`. A minute nobody traded in carries
// the last close forward with zero volume (the price did not move); a hole of more than 30 minutes stays a hole.
export function minuteSeries(candles, from, to) {
  const out = new Array(to - from + 1).fill(null);
  for (const c of candles) { const k = Math.floor(c.t / 60) - from; if (k >= 0 && k < out.length) out[k] = c; }
  let last = null, at = -1;
  for (let k = 0; k < out.length; k++) {
    if (out[k]) { last = out[k]; at = k; } else if (last && k - at <= 30) out[k] = { t: (from + k) * 60, o: last.c, h: last.c, l: last.c, c: last.c, v: 0 };
  }
  return out;
}
// Every virtual trade of one coin whose ENTRY minute lies in [eFrom, eTo]: each entry type that fires, every hold, every grid
// point. `bars` is a minuteSeries starting at minute `from`; an entry reads bars up to its own minute only.
export function resolveSeries(coin, bars, from, eFrom, eTo, { cost, overshootPct = AUDIT_OVERSHOOT_PCT, events = {} }) {
  const trades = [], c2 = { ...coin, bars, px: bars.map((b) => (b ? b.c : null)) };
  let skipped = 0;
  for (let m = eFrom; m <= eTo; m++) {
    const e = m - from;
    if (e < 0 || !bars[e]) continue;
    const { fired, atr } = entriesAt(c2, e, m, events);
    if (!fired.length) continue;
    const tod = Math.floor(((m % 1440) + 1440) % 1440 / 360), day = dayOf(m);
    for (const H of ARENA.holds) for (const s of ARENA.stops) for (const rr of ARENA.rrs) {
      const r = simulate(bars, e, H, atr, s, rr, cost, overshootPct);
      if (!r) { skipped += fired.length; continue; }
      for (const entry of fired) trades.push({ variant: variantId(entry, s, rr, H), entry, tier: coin.tier, tod, day, mint: coin.mint, symbol: coin.symbol, entryMin: m, hold: H, entryPx: bars[e].c, atr, why: r.why, netPct: r.netPct, grossPct: r.grossPct });
    }
  }
  return { trades, skipped };
}
export function aggregate(trades) {
  const m = new Map();
  for (const t of trades) {
    const k = `${t.day}\t${t.variant}\t${t.tier}\t${t.tod}`;
    let a = m.get(k);
    if (!a) m.set(k, (a = { day: t.day, variant: t.variant, tier: t.tier, tod: t.tod, n: 0, wins: 0, sum: 0, sumsq: 0, stop: 0, target: 0, time: 0, pnl: 0 }));
    a.n++; if (t.netPct > 0) a.wins++; a.sum += t.netPct; a.sumsq += t.netPct * t.netPct; a[t.why]++; a.pnl += t.pnlSol ?? (t.netPct / 100) * ARENA.sizeSol;
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
// Live results go to mob_aq_arena_agg (the only table walk-forward reads); the replay of history goes to mob_aq_arena_replay.
export async function writeAggregates(d, table, regime, aggs) {
  if (!["mob_aq_arena_agg", "mob_aq_arena_replay"].includes(table)) throw new Error("unknown arena table");
  for (let i = 0; i < aggs.length; i += 4000) {
    const part = aggs.slice(i, i + 4000), col = (k) => part.map((a) => a[k]);
    await d.q(`INSERT INTO ${table} AS g (day, variant, tier, tod, regime, n, wins, sum_pct, sumsq_pct, n_stop, n_target, n_time, cum_pct, peak_pct, maxdd_pct, pnl_sol)
      SELECT x.dy::date, x.v, x.t, x.td, $1::text, x.n, x.w, x.s, x.q, x.a, x.b, x.c, x.s, greatest(x.s, 0), greatest(-x.s, 0), x.p
      FROM unnest($2::text[], $3::text[], $4::text[], $5::int[], $6::int[], $7::int[], $8::float8[], $9::float8[], $10::int[], $11::int[], $12::int[], $13::float8[]) x(dy, v, t, td, n, w, s, q, a, b, c, p)
      ON CONFLICT (day, variant, tier, tod, regime) DO UPDATE SET n = g.n + EXCLUDED.n, wins = g.wins + EXCLUDED.wins, sum_pct = g.sum_pct + EXCLUDED.sum_pct, sumsq_pct = g.sumsq_pct + EXCLUDED.sumsq_pct,
        n_stop = g.n_stop + EXCLUDED.n_stop, n_target = g.n_target + EXCLUDED.n_target, n_time = g.n_time + EXCLUDED.n_time, pnl_sol = g.pnl_sol + EXCLUDED.pnl_sol, cum_pct = g.cum_pct + EXCLUDED.sum_pct,
        peak_pct = greatest(g.peak_pct, g.cum_pct + EXCLUDED.sum_pct), maxdd_pct = greatest(g.maxdd_pct, greatest(g.peak_pct, g.cum_pct + EXCLUDED.sum_pct) - (g.cum_pct + EXCLUDED.sum_pct))`,
      [regime || "unknown", col("day"), col("variant"), col("tier"), col("tod"), col("n"), col("wins"), col("sum"), col("sumsq"), col("stop"), col("target"), col("time"), col("pnl")]);
  }
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
    wins: a.wins ?? 0, losses: a.losses ?? 0, winRate: a.winRate ?? null, won: a.wins ?? 0, lost: a.losses ?? 0, liveTrades: a.liveTrades ?? 0, replayTrades: a.replayTrades ?? 0, prevTradesTotal: a.prevTradesTotal ?? 0, prevWins: a.prevWins ?? 0, prevWalletSol: a.prevWalletSol ?? ARENA.walletSol, coinsReadThisTick: a.coinsReadThisTick ?? 0, fetchFailed: a.fetchFailed ?? 0, perMinuteLive: a.perMinuteLive ?? 0, perMinuteReplay: a.perMinuteReplay ?? 0, equitySol: a.walletSol ?? ARENA.walletSol, tape: a.tape ?? [], walletPath: a.walletPath ?? [], equityLine: a.equityLine ?? [], batchPnlSol: a.batchPnlSol ?? 0, sizeRange: [ARENA.sizeMin, ARENA.sizeMax], targetPerMin: ARENA.perMinute, replay: a.replay ?? null,
    variantsTried: a.variantsTried ?? 0, boardOf: a.boardOf ?? null, families: a.families ?? [], leaders: (a.leaders ?? []).map((x) => ({ ...x, name: x.tier === "all" ? `${x.variant.split("|")[0]}: ${x.rule || ""}` : `${x.variant} tier ${x.tier}`, expectancyPct: x.meanPct, vsRandomPct: x.edgePct, graduated: grads.has(`${x.variant}\t${x.tier}`) })), laggards: a.laggards ?? [], graduated: a.graduated ?? [], pending: a.pending ?? [], grok: a.grok ?? [], costs: a.costs ?? null, lastTickAt: a.lastTickAt ?? null, resolution: "real 1-minute candles (open, high, low, close, volume) from Jupiter; inside a minute the low is checked before the high",
    note: a.note ?? (on ? "starting: the first candles are read on the next minute" : "off: turn it on in the panel") };
}

// ---------------------------------------------------------------- the arena tick (after the main tick, never inside its lock or its ledger)
// Real 1-minute candles (open, high, low, close, volume) from Jupiter's chart API, up to 5,000 a call, any time in the past
// (shape read live 2026-11-16: {candles:[{time (sec), open, high, low, close, volume}]}). Each tick a few coins are read:
//   LIVE  : the minutes since training was switched on (entry minutes the arena had not seen), a coin at a time, round robin;
//   REPLAY: the same coins' history before the switch, walking backwards 10 hours a visit, each minute used once (a cursor
//           per coin in mob_aq_state 'arena_cur'), up to 30 days back or as far as the API has candles.
// PACE: the minutes read each tick hold more candidate trades than 700; exactly ARENA.perMinute of them are taken, drawn at
// random with a seed (an unbiased sample of every setting), each sized 0.8 to 1 SOL by its own seeded draw.
// Live and replay are stored apart. Walk-forward graduation reads live days only.
export const FEED = { livePerTick: 2, backPerTick: 6, chunkMin: 80, backChunkMin: 20, grokPerTick: 3, extraRounds: 3, pad: 45, backDays: 30, tape: 60, path: 700, line: 180 };
const chartUrl = (mint, toMin, n) => `https://datapi.jup.ag/v2/charts/${mint}?interval=1_MINUTE&to=${toMin * 60000}&candles=${n}&type=price&quote=usd`;
async function candlesOf(mint, toMin, n) {
  const cs = (await getJson(chartUrl(mint, toMin, n), 12000))?.candles;
  if (!Array.isArray(cs)) throw new Error("no candles");
  return cs.map((c) => ({ t: Number(c.time), o: num(c.open), h: num(c.high), l: num(c.low), c: num(c.close), v: num(c.volume) || 0 })).filter((c) => [c.t, c.o, c.h, c.l, c.c].every((x) => Number.isFinite(x)) && c.c > 0);
}
export async function arenaTick(env, opts = {}) {
  const d = db(env);
  if ((await getState(d, "training_mode", false)) !== true) return { off: true };
  const t0 = Date.now(), T = Math.floor((opts.now ?? Date.now()) / 60000);
  // one arena tick per minute: the claim is one statement, an overlapping run gets nothing
  if (!(await d.one(`INSERT INTO mob_aq_state (k, v, at) VALUES ('arena_min', to_jsonb($1::bigint), now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, at = now() WHERE (mob_aq_state.v #>> '{}')::bigint < $1::bigint OR ((mob_aq_state.v #>> '{}')::bigint = $1::bigint AND mob_aq_state.at < now() - interval '50 seconds') RETURNING k`, [T]))) return { skipped: "this minute is already done" };
  // (the second half of the claim: a run that started late and was filed under the next minute must not cost that minute its own batch;
  //  seen live 2026-11-16 22:35, when the main tick ran 52 seconds and one batch in four was lost)
  const out = { minute: T }, prev = (await getState(d, "arena", {})) || {};
  const sinceMin = Math.floor(new Date(prev.since || Date.now()).getTime() / 60000);
  // ---- signals and Grok inputs of the last 31 days, by minute
  const evRows = await d.q(`SELECT 'whale' kind, mint, NULL sym, at FROM mob_aq_signals WHERE source = 'own' AND at > now() - interval '31 days'
    UNION ALL SELECT 'nansen', mint, NULL, at FROM mob_aq_signals WHERE source = 'nansen' AND at > now() - interval '31 days'
    UNION ALL SELECT 'grok_pick', mint, NULL, created_at FROM mob_aq_picks WHERE helper = 'grok' AND created_at > now() - interval '31 days'
    UNION ALL SELECT CASE vote WHEN 'BUY' THEN 'grok_vote' ELSE 'grok_skip' END, mint, NULL, at FROM mob_aq_votes WHERE helper = 'grok' AND vote IN ('BUY','SKIP') AND at > now() - interval '31 days'
    UNION ALL SELECT 'grok_heat', NULL, text, at FROM mob_aq_helpers WHERE from_helper = 'grok' AND channel = 'x' AND at > now() - interval '31 days'`);
  const events = {}, add = (kind, key, at) => (((events[kind] ||= {})[key] ||= []).push(Math.floor(new Date(at).getTime() / 60000)));
  for (const r of evRows) { if (r.kind === "grok_heat") for (const m of String(r.sym).matchAll(/\$([A-Za-z0-9]{2,12})\b/g)) add("grok_heat", m[1].toLowerCase(), r.at); else add(r.kind, r.mint, r.at); }
  const named = [...new Set(evRows.filter((r) => r.mint).map((r) => r.mint))].slice(0, 30);
  // ---- universe: the most liquid tracked coins plus any coin a signal or Grok named. Data-quality rules only: a pool with
  // liquidity, real candles, and not known unsellable (the cost sampler marks a coin with no sell route).
  const dead = new Set((await getState(d, "arena_dead", [])) || []);
  const coins = (await d.q(`SELECT mint, symbol, liq_usd FROM mob_aq_watch WHERE ((last_seen > now() - interval '1 day' AND liq_usd >= $1) OR mint = ANY($3::text[])) AND liq_usd >= $1 ORDER BY liq_usd DESC NULLS LAST LIMIT $2`, [ARENA.minLiqUsd, ARENA.maxCoins, named]))
    .filter((w) => !dead.has(w.mint)).map((w) => ({ mint: w.mint, symbol: w.symbol || w.mint.slice(0, 6), tier: tierOfLiq(w.liq_usd) }))
    // visited in a fixed mixed order, not by size: the biggest pools are stablecoins and wrapped majors that barely move
    .sort((a, b) => seed01(a.mint) - seed01(b.mint));
  // ---- costs: one real round-trip quote a minute on a rotating coin, 1 SOL and 5 SOL in turn
  if (coins.length && opts.quote !== false) {
    const c = coins[Math.floor(seed01(`cost|${T}`) * coins.length)], size = ARENA.costSizes[T % ARENA.costSizes.length];
    const buy = await jupQuote(SOL_MINT, c.mint, Math.floor(size * 1e9)), sell = buy ? await jupQuote(c.mint, SOL_MINT, buy.outAmount) : null;
    if (buy && sell) await d.q(`INSERT INTO mob_aq_arena_costs (tier, size_sol, mint, rt_pct) VALUES ($1,$2,$3,$4)`, [c.tier, size, c.mint, roundTripPct(size, Number(sell.outAmount) / 1e9, NET_FEE_SOL)]);
    else if (buy && !sell) { dead.add(c.mint); await setState(d, "arena_dead", [...dead].slice(-500)); } // a coin that cannot be sold leaves the arena
    out.costQuote = { symbol: c.symbol, size, ok: !!(buy && sell) };
  }
  const { table, costs } = await costTable(d);
  const os = (await getState(d, "replays", null))?.overshootPct ?? AUDIT_OVERSHOOT_PCT;
  const regime = (await getState(d, "regime", null))?.label || "unknown";
  // ---- which coins this minute: cursors per coin
  const cur = (await getState(d, "arena_cur", null)) || { live: {}, back: {}, li: 0, bi: 0 };
  const liveEnd = T - FEED.pad - 1, backStart = sinceMin - FEED.pad - 1, oldest = T - FEED.backDays * 1440, jobs = [];
  for (let k = 0, seen = 0; seen < coins.length && k < FEED.livePerTick; seen++) {
    const c = coins[(cur.li + seen) % coins.length], from = (cur.live[c.mint] ?? backStart) + 1, to = Math.min(liveEnd, from + FEED.chunkMin - 1);
    if (to >= from) { jobs.push({ kind: "live", c, eFrom: from, eTo: to }); k++; }
    if (seen === coins.length - 1 || k === FEED.livePerTick) cur.li = (cur.li + seen + 1) % Math.max(1, coins.length);
  }
  const pickBack = (want) => { const js = [];
    for (let k = 0, seen = 0; seen < coins.length && k < want; seen++) {
      const c = coins[(cur.bi + seen) % coins.length], to = cur.back[c.mint] ?? backStart, from = Math.max(oldest, to - FEED.backChunkMin + 1);
      if (to !== 0 && to >= from && !busy.has(c.mint)) { js.push({ kind: "replay", c, eFrom: from, eTo: to }); busy.add(c.mint); k++; }
      if (seen === coins.length - 1 || k === want) { cur.bi = (cur.bi + seen + 1) % Math.max(1, coins.length); break; }
    }
    return js; };
  // ---- fetch and resolve. A failed fetch leaves that coin's cursor where it was: the same minutes are tried again later.
  const cand = [], busy = new Set();
  let skipped = 0, fetched = 0, failed = 0, nJobs = 0;
  const run = async (js) => {
    nJobs += js.length;
    const got = await Promise.all(js.map(async (j) => { try { const from = j.eFrom - FEED.pad, to = j.eTo + FEED.pad; return { j, from, to, cs: await candlesOf(j.c.mint, to + 1, to - from + 2) }; } catch (e) { return { j, err: String(e.message || e) }; } }));
    for (const g of got) {
      const { j } = g;
      if (g.err) { failed++; continue; }
      fetched++;
      const cost = costs[j.c.tier];
      if (cost == null) continue;
      const bars = minuteSeries(g.cs, g.from, g.to), r = resolveSeries(j.c, bars, g.from, j.eFrom, j.eTo, { cost, overshootPct: os, events });
      skipped += r.skipped;
      for (const t of r.trades) { t.src = j.kind; cand.push(t); }
      if (j.kind === "live") cur.live[j.c.mint] = j.eTo;
      // history is used up when the API has nothing before this chunk (or the 30-day line is reached)
      else cur.back[j.c.mint] = !g.cs.length || Math.floor(Math.min(...g.cs.map((c) => c.t)) / 60) > j.eFrom || j.eFrom <= oldest ? 0 : j.eFrom - 1;
    }
  };
  await run([...jobs, ...pickBack(FEED.backPerTick)]);
  // not enough for the pace (quiet coins, a failed read): read more history, at most three more rounds this minute
  for (let round = 0; round < FEED.extraRounds && cand.length < ARENA.perMinute * 1.2; round++) { const more = pickBack(FEED.backPerTick); if (!more.length) break; await run(more); }
  // ---- Grok trades for himself: every pick he submits while training is on is one arena trade under his name, entered at
  // the close of the minute he sent it, with HIS stop and target, 45 minutes at most, on the real candles after it.
  const grokTrades = [];
  try {
    const lastPick = Number((await getState(d, "arena_grok_pick", 0)) || 0);
    const due = await d.q(`SELECT id, mint, symbol, stop_pct, target_pct, created_at FROM mob_aq_picks WHERE helper = 'grok' AND id > $1 AND created_at >= to_timestamp($2::float8) AND created_at < now() - interval '47 minutes' ORDER BY id LIMIT $3`, [lastPick, sinceMin * 60, FEED.grokPerTick]);
    for (const p of due) {
      const m = Math.floor(new Date(p.created_at).getTime() / 60000), cs = await candlesOf(p.mint, m + 47, 80), bars = minuteSeries(cs, m - 5, m + 46), e = 5;
      const w = coins.find((c) => c.mint === p.mint), tier = w?.tier || "C", cost = costs[tier];
      const r = bars[e] && cost != null && p.stop_pct > 0 ? simulate(bars, e, 45, 1, p.stop_pct, p.target_pct / p.stop_pct, cost, os) : null;
      if (r) grokTrades.push({ variant: "grok_trade|own levels", entry: "grok_trade", tier, tod: Math.floor((m % 1440) / 360), day: dayOf(m), mint: p.mint, symbol: p.symbol || w?.symbol || p.mint.slice(0, 6), entryMin: m, hold: 45, entryPx: bars[e].c, atr: null, why: r.why, netPct: r.netPct, grossPct: r.grossPct, src: "live", pick: p.id });
      await setState(d, "arena_grok_pick", p.id); // a pick with no candles at its minute is recorded as not tradable, once
      if (!r) await brain(d, "learning", "arena", `Grok pick #${p.id} (${p.symbol || p.mint.slice(0, 6)}) could not be traded in the arena: no real candle at the minute he sent it, or no cost for its tier.`);
    }
  } catch (e) { out.grokError = String(e.message || e).slice(0, 120); }
  // the pace: ARENA.perMinute trades, a seeded random draw from the candidates (a partial Fisher-Yates shuffle), in that order
  const take = Math.min(ARENA.perMinute, cand.length);
  for (let i = 0; i < take; i++) { const k = i + Math.floor(seed01(`pace|${T}|${i}`) * (cand.length - i)); [cand[i], cand[k]] = [cand[k], cand[i]]; }
  const all = cand.slice(0, take).concat(grokTrades); // (his trades are his own, on top of the 700)
  for (const t of all) { t.sizeSol = round(ARENA.sizeMin + (ARENA.sizeMax - ARENA.sizeMin) * seed01(`size|${t.mint}|${t.entryMin}|${t.variant}`), 3); t.pnlSol = (t.netPct / 100) * t.sizeSol; }
  const live = all.filter((t) => t.src === "live"), replay = all.filter((t) => t.src === "replay");
  await writeAggregates(d, "mob_aq_arena_agg", regime, aggregate(live));
  await writeAggregates(d, "mob_aq_arena_replay", "replay", aggregate(replay));
  await setState(d, "arena_cur", cur);
  const trades = all.length;
  // a small recent sample of individual trades per setting (a fixed number of slots, overwritten at random), and the tape
  const tape = [];
  if (all.length) {
    const pick = new Map();
    for (let i = 0; i < ARENA.samplesPerTick; i++) { const t = all[Math.floor(seed01(`s|${T}|${i}`) * all.length)]; pick.set(`${t.variant}\t${t.tier}\t${Math.floor(seed01(`slot|${T}|${i}`) * ARENA.sampleSlots)}`, t); }
    const ks = [...pick.keys()].map((k) => k.split("\t")), vs = [...pick.values()];
    await d.q(`INSERT INTO mob_aq_arena_samples (variant, tier, slot, mint, symbol, entry_min, hold_min, entry_px, atr_pct, why, gross_pct, net_pct, at)
      SELECT * , now() FROM unnest($1::text[], $2::text[], $3::int[], $4::text[], $5::text[], $6::bigint[], $7::int[], $8::float8[], $9::float8[], $10::text[], $11::float8[], $12::float8[]) x
      ON CONFLICT (variant, tier, slot) DO UPDATE SET mint = EXCLUDED.mint, symbol = EXCLUDED.symbol, entry_min = EXCLUDED.entry_min, hold_min = EXCLUDED.hold_min, entry_px = EXCLUDED.entry_px, atr_pct = EXCLUDED.atr_pct, why = EXCLUDED.why, gross_pct = EXCLUDED.gross_pct, net_pct = EXCLUDED.net_pct, at = now()`,
      [ks.map((k) => k[0]), ks.map((k) => k[1]), ks.map((k) => Number(k[2])), vs.map((t) => t.mint), vs.map((t) => t.symbol), vs.map((t) => t.entryMin), vs.map((t) => t.hold), vs.map((t) => t.entryPx), vs.map((t) => t.atr), vs.map((t) => t.why), vs.map((t) => round(t.grossPct, 4)), vs.map((t) => round(t.netPct, 4))]);
    for (let i = 0; i < Math.min(FEED.tape, all.length); i++) { const t = all[Math.floor((i * all.length) / Math.min(FEED.tape, all.length))]; tape.push({ id: `${T}-${i}`, symbol: t.symbol, variant: t.variant, tier: t.tier, pnlPct: round(t.netPct, 3), pnlSol: round(t.pnlSol, 5), sizeSol: t.sizeSol, exit: t.why, holdMin: t.hold, enteredAt: new Date(t.entryMin * 60000).toISOString(), src: t.src }); }
  }
  Object.assign(out, { coins: coins.length, jobs: nJobs, fetched, failed, candidates: cand.length, trades, live: live.length, replay: replay.length, skipped });
  // ---- the scoreboard: live + replay together for the board (what the arena has seen), live alone for graduation
  const board = await d.q(`SELECT variant, tier, sum(n)::float8 n, sum(wins)::float8 wins, sum(sum_pct)::float8 sum, sum(sumsq_pct)::float8 sumsq, sum(pnl_sol)::float8 pnl FROM (SELECT variant, tier, n, wins, sum_pct, sumsq_pct, pnl_sol FROM mob_aq_arena_agg UNION ALL SELECT variant, tier, n, wins, sum_pct, sumsq_pct, pnl_sol FROM mob_aq_arena_replay) u GROUP BY variant, tier`);
  const scored = scoreDay(board).filter((x) => x.edgeLo != null && x.n >= ARENA.boardMin && x.baseN >= ARENA.boardMin); // the board shows a setting from 50 trades; graduation still needs 300 on each of two live days
  // at 700 trades a minute one setting on one tier gets a few hundred trades a day, so until five settings have 50+ trades the
  // board ranks the entry families (every stop, target, hold and tier of one entry type together) against random entries
  const famOf = (e) => board.filter((r) => r.variant.startsWith(`${e}|`)).reduce((a, r) => ({ n: a.n + r.n, wins: a.wins + r.wins, sum: a.sum + r.sum, sumsq: a.sumsq + r.sumsq }), { n: 0, wins: 0, sum: 0, sumsq: 0 });
  const rndFam = famOf("random"), fams = Object.keys(ENTRY_RULE).filter((e) => e !== "random").map((e) => ({ variant: `${e}|all settings`, tier: "all", ...edgeOf(famOf(e), rndFam) })).filter((x) => x.edgeLo != null && x.n >= ARENA.boardMin && x.baseN >= ARENA.boardMin);
  const rank = scored.length >= 5 ? scored : fams;
  const tot = board.reduce((a, r) => ({ n: a.n + r.n, s: a.s + r.sum, w: a.w + r.wins, p: a.p + r.pnl }), { n: 0, s: 0, w: 0, p: 0 });
  // the wallet after each part of this batch, in the order the trades were counted: what the panel plays back between refreshes
  const wallet = round(ARENA.walletSol + tot.p, 4), batchPnl = all.reduce((a, t) => a + t.pnlSol, 0), w0 = wallet - batchPnl, path = [];
  { let cum = 0, next = 0; for (let i = 0; i < all.length; i++) { cum += all[i].pnlSol; if (i + 1 >= ((next + 1) * all.length) / FEED.path) { path.push(round(w0 + cum, 4)); next++; } } }
  const line = [...(prev.equityLine || []), { t: T, w: wallet }].slice(-FEED.line);
  const liveTot = await d.one(`SELECT coalesce(sum(n),0)::float8 n, count(DISTINCT day)::int days FROM mob_aq_arena_agg`), repl = await d.one(`SELECT coalesce(sum(n),0)::float8 n, min(day) first, count(DISTINCT day)::int days FROM mob_aq_arena_replay`);
  const rb = board.filter((r) => r.variant.startsWith("random|")).reduce((a, r) => ({ n: a.n + r.n, wins: a.wins + r.wins, sum: a.sum + r.sum, sumsq: a.sumsq + r.sumsq }), { n: 0, wins: 0, sum: 0, sumsq: 0 }), rnd = statOf(rb);
  const show = (x) => ({ variant: x.variant, tier: x.tier, rule: ENTRY_RULE[x.variant.split("|")[0]] || null, n: x.n, meanPct: x.mean, ci95: [x.lo, x.hi], randomPct: x.base, edgePct: x.edge, edgeCi95: [x.edgeLo, x.edgeHi] });
  const gk = ["grok_trade", "grok_pick", "grok_vote", "grok_skip", "grok_heat"].map((e) => ({ entry: e, ...board.filter((r) => r.variant.startsWith(`${e}|`)).reduce((a, r) => ({ n: a.n + r.n, wins: a.wins + r.wins, sum: a.sum + r.sum, sumsq: a.sumsq + r.sumsq }), { n: 0, wins: 0, sum: 0, sumsq: 0 }) })).filter((g) => g.n > 0);
  const picks = await d.q(`SELECT variant, tier, selected_day, status, confirm_day, sel, conf FROM mob_aq_arena_picks ORDER BY id DESC LIMIT 60`);
  const backDone = coins.filter((c) => cur.back[c.mint] === 0).length;
  const state = { ...prev, on: true, since: prev.since ?? new Date().toISOString(), lastTickAt: new Date().toISOString(), walletSol: wallet, walletPath: path, equityLine: line, batchPnlSol: round(batchPnl, 4), prevTradesTotal: prev.virtualTradesTotal ?? 0, prevWins: prev.wins ?? 0, prevWalletSol: round(w0, 4), virtualTradesTotal: tot.n, wins: tot.w, losses: tot.n - tot.w, winRate: tot.n ? round(tot.w / tot.n, 4) : null, liveTrades: liveTot.n, replayTrades: repl.n,
    perMinute: trades, perMinuteLive: live.length, perMinuteReplay: replay.length, tickMs: Date.now() - t0, coins: coins.length, coinsReady: coins.length, coinsReadThisTick: fetched, fetchFailed: failed, variantsTried: board.length, costs: table, overshootPct: os,
    random: { n: rnd.n, expectancyPct: rnd.mean, ci95: rnd.mean == null ? null : [rnd.lo, rnd.hi] }, tape,
    replay: { trades: repl.n, days: repl.days, from: repl.first ? new Date(repl.first).toISOString().slice(0, 10) : null, coinsFinished: backDone },
    boardOf: scored.length >= 5 ? "settings" : "entry families", leaders: rank.slice().sort((a, b) => b.edgeLo - a.edgeLo).slice(0, 5).map(show), laggards: rank.slice().sort((a, b) => a.edgeHi - b.edgeHi).slice(0, 5).map(show), families: fams.map(show),
    graduated: picks.filter((p) => p.status === "graduated").map((p) => ({ variant: p.variant, tier: p.tier, pickedOn: p.selected_day, confirmedOn: p.confirm_day, stats: p.conf })),
    pending: picks.filter((p) => p.status === "selected").map((p) => ({ variant: p.variant, tier: p.tier, pickedOn: p.selected_day })),
    grok: gk.map((g) => ({ input: g.entry, rule: ENTRY_RULE[g.entry], trades: g.n, won: g.wins, lost: g.n - g.wins, ...(({ n, mean, lo, hi }) => ({ n, meanPct: mean ?? (g.n ? round(g.sum / g.n, 4) : null), ci95: [lo, hi] }))(statOf(g)) })),
    note: trades ? `${trades} virtual trades resolved this minute (${live.length} on fresh minutes, ${replay.length} replaying history) from the real 1-minute candles of ${fetched} coins; ${board.length} settings tried so far, so some lead by luck: only walk-forward graduates on fresh days count` : coins.length ? `no candles read this minute (${failed} of ${nJobs} reads failed)` : "no tracked coin with liquidity yet" };
  await setState(d, "arena", state);
  // ---- one lesson line from the batch just resolved: which entry family won and which lost, against luck in the same minutes
  if (all.length) { // (every minute: Alex, 2026-11-16, "lessons into the brain each minute")
    const fam = new Map(); for (const t of all) { const f = fam.get(t.entry) || fam.set(t.entry, { n: 0, sum: 0, wins: 0 }).get(t.entry); f.n++; f.sum += t.netPct; if (t.netPct > 0) f.wins++; }
    const rows = [...fam.entries()].filter(([, f]) => f.n >= 30).map(([e, f]) => ({ e, n: f.n, mean: round(f.sum / f.n, 3), win: round((f.wins / f.n) * 100, 1) })).sort((a, b) => b.mean - a.mean), rd = rows.find((r) => r.e === "random");
    if (rows.length >= 2) await brain(d, "learning", "arena-lesson", `Arena batch at ${new Date(T * 60000).toISOString().slice(0, 16)}Z: ${all.length} virtual trades (${live.length} fresh, ${replay.length} replay) on ${fetched} coins. Random entries made ${rd ? `${rd.mean}%` : "n/a"} a trade after costs. Best: ${rows[0].e} [${ENTRY_RULE[rows[0].e]}] ${rows[0].mean}% over ${rows[0].n} (${rows[0].win}% won). Worst: ${rows.at(-1).e} [${ENTRY_RULE[rows.at(-1).e]}] ${rows.at(-1).mean}% over ${rows.at(-1).n} (${rows.at(-1).win}% won). One batch is not evidence: the hourly board and the fresh-day check decide.`, { rows });
  }
  // ---- every hour: what beat random and what cost money, with the multiple-comparison warning
  const hour = Math.floor(T / 60), last = (await getState(d, "arena_hour", 0)) || 0, day = dayOf(T);
  if (hour > last && rank.length) {
    await setState(d, "arena_hour", hour);
    const line = (x) => `${x.variant} tier ${x.tier} [${ENTRY_RULE[x.variant.split("|")[0]]}]: ${x.mean}% a trade after costs over ${x.n} (random ${x.base}%), edge ${x.edge}% (95% ${x.edgeLo} to ${x.edgeHi})`;
    const top = rank.slice().sort((a, b) => b.edgeLo - a.edgeLo).slice(0, 5), bottom = rank.slice().sort((a, b) => a.edgeHi - b.edgeHi).slice(0, 5), clear = scored.filter((x) => x.edgeLo > 0).length;
    await brain(d, "learning", "arena", `Training arena so far: ${tot.n} virtual trades (${liveTot.n} on fresh minutes, ${repl.n} replaying ${repl.days} days of real 1-minute candles), ${scored.length} settings with ${ARENA.boardMin}+ trades compared with their random baseline. ${clear} have an interval above random; with ${scored.length} tried, about ${round(scored.length * 0.025, 1)} would look like that by luck alone, and trades in the same minute move together, so the intervals are too narrow. The replay charges today's measured cost and today's liquidity tier to past minutes. Nothing here is a result until it repeats on a fresh live day. TOP: ${top.map(line).join("; ")}. BOTTOM (rules that cost money): ${bottom.map(line).join("; ")}.`.slice(0, 6000), { day, tried: scored.length, clear, top: top.map(show), bottom: bottom.map(show) });
    out.hourly = true;
  }
  // ---- once a day, three hours into it (every coin's fresh minutes of yesterday have been read by then): walk-forward on LIVE days, then housekeeping
  const wfDay = await getState(d, "arena_wf_day", null);
  if (wfDay !== day && (T % 1440) >= 180) { await setState(d, "arena_wf_day", day); out.walkForward = await walkForward(d, day); await d.q(`DELETE FROM mob_aq_arena_agg WHERE day < $1::date - $2::int`, [day, ARENA.keepDays]); await d.q(`DELETE FROM mob_aq_arena_replay WHERE day < $1::date - $2::int`, [day, ARENA.keepDays + FEED.backDays]); await d.q(`DELETE FROM mob_aq_arena_costs WHERE at < now() - interval '7 days'`); }
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
