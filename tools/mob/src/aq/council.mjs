// The Council of Olympus, ALWAYS TRADING edition (aquarius-trader skill). Hard blocks are never traded. Soft rules only move
// a score and the size. On paper the Council takes the best-scored candidate with a real signal at least every few minutes
// (EXPLORE, small), and every closed trade moves the soft-rule weights through a recorded tournament step.
import { db } from "../db.mjs";
import { feeds, jupQuote, jupPrices, SOL_MINT, CALLS, CAPS } from "./feeds.mjs";
import { R3_ATR, R6_PARAMS, R7_PARAMS } from "./seed.mjs";
import { strengthOf, tradability, feeFloorSize, planFor, seed01, ruleWeight, volumeRising, median, RULE_MIN_N } from "./logic.mjs";
import { atr5Pct, fibSetup, whaleSetup, momentumSetup, bounceSetup, hardSafety, softObjections, scoreOf, tierOf, sizeFor, roundTripPct, round, COUNCIL, SOFT_RULES } from "./logic.mjs";
import { whaleSignal } from "./whales.mjs";
import { openPosition } from "./ledger.mjs";

export const RUG_PER_TICK = 4;
export const MAX_EVAL = 10, COOLDOWN_MIN = 10, RECHECK_MIN = 3, WHALE_CHECKS = 6, MIN_OWN_BARS = 30, KB_COST_PCT = 5, QUOTE_TRIES = 2;
// a mint or freeze authority (or a rug) does not change in ten minutes: such a coin is judged again after hours, not every cooldown;
// a coin too quiet for its cost is looked at again after a quarter of an hour (volatility moves slowly)
export const AUTHORITY_RECHECK_MIN = 360, UNTRADABLE_RECHECK_MIN = 15, SHORT_HOLD_MIN = 10, FLOOR_MARGIN = 1.15;
// Round trip per tier measured by the 2026-11-16 audit on the first 53 paper trades. Used only until this desk has five of its
// own measurements for a tier in the last 24 hours; every use says which source it is.
export const AUDIT_RT = { A: 0.76, B: 1.41, C: 3.11 };
// Every measured Jupiter round trip of the last day (Council facts), per coin and per tier.
// Only quotes taken at a size comparable to today's position count (at least a quarter of it): a round trip measured at
// 0.03 SOL says nothing about the price impact of 2.6 SOL.
export async function costBook(d, positionSol = COUNCIL.positionSol) {
  const rows = await d.q(`SELECT mint, facts->>'tier' tier, (facts->>'rtPct')::float8 rt, (facts->>'poolRtPct')::float8 pool, extract(epoch FROM now() - at)::float8 age FROM mob_aq_council
    WHERE facts->>'rtPct' IS NOT NULL AND facts->>'tier' IS NOT NULL AND mint IS NOT NULL AND at > now() - interval '24 hours' AND (facts->>'sizeSol')::float8 >= $1::float8 ORDER BY id DESC`, [positionSol / 4]);
  const byMint = {}, by = { A: [], B: [], C: [] }, pools = { A: [], B: [], C: [] };
  for (const r of rows) {
    if (!byMint[r.mint] && r.age < 6 * 3600) byMint[r.mint] = { rt: r.rt, pool: r.pool, tier: r.tier };
    if (by[r.tier]) { by[r.tier].push(r.rt); if (r.pool != null) pools[r.tier].push(r.pool); }
  }
  const tier = Object.fromEntries(Object.keys(by).map((t) => [t, { n: by[t].length, median: round(median(by[t]), 3), min: by[t].length ? Math.min(...by[t]) : null, poolMin: pools[t].length ? Math.max(0, Math.min(...pools[t])) : null }]));
  // the cost a replay or a shadow probe charges a coin of this tier: this desk's own median when it has five, else the audit's
  const tierCost = (t) => (tier[t]?.n >= 5 ? { pct: tier[t].median, src: `measured median of ${tier[t].n} round trips (24h)` } : AUDIT_RT[t] != null ? { pct: AUDIT_RT[t], src: "audit 2026-11-16 (measured at about 0.03 SOL a trade)" } : { pct: null, src: "none" });
  // the most hopeful honest cost for a coin BEFORE it is quoted: its own last quote, else the cheapest quote seen in its tier
  const optimistic = (mint, t) => (byMint[mint] ? { pct: byMint[mint].rt, pool: byMint[mint].pool, src: "this coin's last quote" } : tier[t]?.n ? { pct: tier[t].min, pool: tier[t].poolMin, src: `cheapest tier ${t} quote of ${tier[t].n} (24h)` } : { pct: null, pool: null, src: "none" });
  return { byMint, tier, tierCost, optimistic };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function ruleWeights(d) {
  await d.q(`INSERT INTO mob_aq_rules (name) SELECT * FROM unnest($1::text[]) ON CONFLICT DO NOTHING`, [SOFT_RULES]);
  return Object.fromEntries((await d.q(`SELECT name, weight FROM mob_aq_rules`)).map((r) => [r.name, r.weight]));
}
// Tournament step T3 (rewritten after the 2026-11-16 audit). The old step added 0.05 to every objecting rule after each loss,
// so a rule that objects to every coin ("fear" on a fearful day, "no_whale" with a thin book) just counted losses: fear went
// from 1.0 to 2.25 and took 22.5 points off every candidate. Now a weight is recomputed from the rule's own record: the loss
// rate of the trades it objected to against the loss rate of the trades it did not object to (10+ of each, else 1).
export async function recomputeRules(d, note = null) {
  await d.q(`INSERT INTO mob_aq_rules (name) SELECT * FROM unnest($1::text[]) ON CONFLICT DO NOTHING`, [SOFT_RULES]);
  const rows = await d.q(`SELECT r.name, r.weight, count(t.id) FILTER (WHERE t.soft ? r.name)::int obj_n, count(t.id) FILTER (WHERE t.soft ? r.name AND t.pnl_sol <= 0)::int obj_l,
      count(t.id) FILTER (WHERE NOT (t.soft ? r.name))::int rest_n, count(t.id) FILTER (WHERE NOT (t.soft ? r.name) AND t.pnl_sol <= 0)::int rest_l
    FROM mob_aq_rules r LEFT JOIN mob_aq_trades t ON t.soft IS NOT NULL AND jsonb_typeof(t.soft) = 'array' GROUP BY r.name, r.weight`);
  const moved = [];
  for (const r of rows) {
    const w = ruleWeight({ objN: r.obj_n, objLosses: r.obj_l, restN: r.rest_n, restLosses: r.rest_l });
    await d.q(`UPDATE mob_aq_rules SET weight=$2, blocked_winners=$3, blocked_losers=$4, updated_at=now() WHERE name=$1`, [r.name, w, r.obj_n - r.obj_l, r.obj_l]);
    if (Math.abs(w - r.weight) >= 0.01) moved.push(`${r.name} ${round(r.weight, 2)} -> ${round(w, 2)} (objected to ${r.obj_n} trades, ${r.obj_l} lost; not objected ${r.rest_n}, ${r.rest_l} lost)`);
  }
  if (moved.length) await d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ('learning','tournament',$1,$2)`, [`Rule T3${note ? ` (${note})` : ""}: soft-rule weights recomputed from each rule's own record (loss rate when it objected against loss rate when it did not, ${RULE_MIN_N}+ trades on each side, else 1): ${moved.join("; ")}.`, JSON.stringify({ moved })]);
  return moved;
}
export async function learnFromTrade(d, pos, tradeId, pnlPct) {
  return recomputeRules(d, `after trade #${tradeId}, ${pos.symbol} ${round(pnlPct, 2)}%`);
}

export async function councilTick(env, x) {
  const throttle = x.throttle || { size: 1, score: 0 };
  const { d, cands, tradable, strategies, pos, cash, equity, sv, solUsd, feeSol, nowSec, gap, health, set, out, near, rpl, fng, council, brain, flow, setState } = x;
  const nowMs = nowSec * 1000, C = COUNCIL;
  const weights = await ruleWeights(d);
  const live = (id) => strategies[id]?.alive && strategies[id].status === "paper";
  // a coin that only lacked a signal is looked at again after RECHECK_MIN; any other verdict rests for COOLDOWN_MIN
  const recent = new Set((await d.q(`SELECT DISTINCT mint FROM mob_aq_council WHERE mint IS NOT NULL AND at > now() - make_interval(mins => CASE facts->>'block' WHEN 'signal' THEN $2::int WHEN 'quiet' THEN $2::int WHEN 'authority' THEN $3::int WHEN 'untradable' THEN $4::int ELSE $1::int END)`, [COOLDOWN_MIN, RECHECK_MIN, AUTHORITY_RECHECK_MIN, UNTRADABLE_RECHECK_MIN])).map((r) => r.mint));
  const held = new Set(pos.map((p) => p.mint));
  const pool = cands.filter(tradable);
  // movers first: the ten slots go to the coins that are actually moving (5-minute and 1-hour change), where signals form
  const heat = (c) => Math.abs(c.ch5m ?? 0) * 3 + Math.abs(c.ch1h ?? 0);
  // half the slots to the hottest movers, half in list order (Jupiter's trending / most traded / organic lists, where the
  // established tier A and B coins are), so every strategy gets coins it can trade
  const free = pool.filter((c) => !recent.has(c.mint) && !held.has(c.mint));
  const hot = free.map((c, i) => ({ c, i })).sort((a, b) => heat(b.c) - heat(a.c) || a.i - b.i).slice(0, MAX_EVAL / 2).map((x2) => x2.c);
  const queue = [...hot, ...free.filter((c) => !hot.includes(c))].slice(0, MAX_EVAL);
  out.funnel = { seen: cands.length, tradable: pool.length, inCooldown: pool.filter((c) => recent.has(c.mint)).length, judged: queue.length };
  const ready = [], weak = [], quiet = [];
  let rugCalls = 0, whaleCalls = 0;
  const book = x.book || (await costBook(d));
  const mode = (id) => x.modes?.[id] || { real: true, why: null };
  const minute = Math.floor(nowSec / 60);
  // tests pin the two arms (AQ_TEST_ARMS="L:A") so a run does not depend on the minute it starts in; unset everywhere else
  const arms = /^[LS]:[AB]$/.test(env.AQ_TEST_ARMS || "") ? env.AQ_TEST_ARMS.split(":") : null;
  // the plan of one trade: its two randomised arms (seeded per coin and minute, so neither depends on arrival order or on the
  // other) and its levels. Arm "tvar": S = flat after 10 minutes, L = the recipe's own time stop. The stop is the setup's stop,
  // never inside the noise of that hold (ATR5 x sqrt(hold / 5)); the exit variant no longer touches the stop.
  const planOf = (c, sid, setup, SP, atr) => {
    const tvar = arms?.[0] || (seed01(`${c.mint}|${minute}|time`) < 0.5 ? "L" : "S");
    const holdMin = tvar === "S" ? SHORT_HOLD_MIN : sid === "R6" && x.r6TimeStopMin ? x.r6TimeStopMin : SP.timeStopMin;
    return { tvar, ...planFor(setup, atr, holdMin, sid === "R3" || sid === "R4" ? null : SP.rr) };
  };
  // gate B before any quote is spent, on the most hopeful honest cost: this coin's last quote, else the cheapest quote in its tier
  const preGate = (c, tier, atr, plan) => {
    const o = book.optimistic(c.mint, tier);
    if (o.pct == null) return null; // nothing measured yet: the quote decides
    const tb = tradability(o.pct, atr), cg = plan.targetPct < C.costMultiple * o.pct;
    if (tb.ok && !cg) return null;
    return { reason: !tb.ok ? `not tradable: 6x round trip ${round(o.pct, 2)}% = ${tb.needPct}% is over 3x ATR5 ${atr}% = ${tb.havePct}% (${o.src})` : `not tradable: 6x round trip ${round(o.pct, 2)}% = ${tb.needPct}% is over the target ${plan.targetPct}% (${o.src})`,
      number: round((!tb.ok ? tb.havePct : plan.targetPct) / tb.needPct, 3), have: !tb.ok ? tb.havePct : plan.targetPct, need: tb.needPct };
  };
  let tape = null; // the coin on the big screen: the one entered, else the last one judged with bars
  for (const c of queue) {
    const tier = tierOf(c.liqUsd || 0, c.createdAt, nowMs);
    const facts = { tier, liqUsd: c.liqUsd, boosted: c.boosted, copycat: c.copycat, gta: c.gta, src: c.src };
    let s = null;
    const noteSignal = (verdict, reason) => (facts.whale?.signal ? d.q(`UPDATE mob_aq_signals SET verdict=$2, reason=$3 WHERE mint=$1 AND verdict IS NULL AND at > now() - interval '30 minutes'`, [c.mint, verdict, reason]) : null);
    const block = async (reason, number, kind = "hard", setup = s, sid = facts.strategy || null) => { await noteSignal("BLOCK", reason); facts.block = kind; await council("BLOCK", c, reason, number, facts); out.evaluated.push({ symbol: c.symbol, tier, verdict: "BLOCK", kind, reason, number }); near.push({ c, reason, setup, sid, tier, atr: facts.atr5Pct ?? null, rt: facts.rtPct ?? null }); };
    await d.q(`INSERT INTO mob_aq_pools (pool, mint, symbol, tier) VALUES ($1,$2,$3,$4) ON CONFLICT (pool) DO UPDATE SET tier=EXCLUDED.tier, mint=EXCLUDED.mint, symbol=EXCLUDED.symbol, updated_at=now()`, [c.pool, c.mint, c.symbol, tier]);
    if (c.liqUsd == null || c.liqUsd < C.hardMinLiq) { await block("liquidity too low", c.liqUsd); continue; }
    // RugCheck when it answers (cached 30 min); when it is rate limited, Jupiter's own audit carries the hard check for a
    // tier A coin (authorities off, decimals known). Tier B/C without a report stay a NO: missing data.
    let rg = rugCalls < RUG_PER_TICK || !c.audit ? await feeds.rug(env, c.mint) : { ok: false, data: null, skipped: true };
    if (!rg.cached && !rg.skipped) rugCalls++;
    if (!rg.skipped) health.rugcheck = rg.ok || health.rugcheck === true;
    if (!rg.ok && c.audit && tier === "A" && c.audit.decimals != null)
      rg = { ok: true, data: { mintAuthority: c.audit.mintOff ? null : "active (Jupiter audit)", freezeAuthority: c.audit.freezeOff ? null : "active (Jupiter audit)", rugged: false, danger: [], topHolderPct: 0, top10Pct: c.audit.topHolders ?? 0, lpLockedPct: null, decimals: c.audit.decimals, creator: c.dev, insiders: [], source: "jupiter audit" } };
    const hs = hardSafety(rg.data);
    facts.safety = rg.data;
    set("cn.safety", rg.ok ? "busy" : "blocked", `${c.symbol} (tier ${tier}): ${hs.reason}`);
    // instant history: Jupiter's chart (two hours of 1-minute bars in this tick), then our own bars, then GeckoTerminal
    let oh = { ok: false, data: null, src: "none" }, own = [];
    const jc = CALLS.jupiterData < CAPS.jupiterData ? await feeds.jupCandles(env, c.mint) : { ok: false };
    health.jupiter_candles = jc.ok || health.jupiter_candles === true;
    if (jc.ok && jc.data.length >= 15) oh = { ok: true, data: jc.data.slice(-60), src: "jupiter" };
    else {
      own = await x.ownCandles(d, c.mint);
      if (own.length >= MIN_OWN_BARS) oh = { ok: true, data: own, src: "own" };
      else if (health.geckoterminal) { oh = await feeds.ohlcv(env, c.pool); oh.src = "geckoterminal"; health.geckoterminal_ohlcv = oh.ok; }
    }
    facts.candles = { src: oh.src, bars: oh.data?.length || 0, ownBars: own.length };
    set("st.mtf", oh.ok ? "busy" : "blocked", `${c.symbol}: ${oh.data?.length || 0} one-minute bars from ${oh.src} on first sight`);
    health.candles = oh.ok || health.candles === true;
    const bars = oh.ok && oh.data?.length ? oh.data : null;
    const atr = bars ? atr5Pct(bars) : null;
    facts.atr5Pct = atr;
    const fib = bars ? fibSetup(bars, { ...strategies.R3.params, // adaptive only downward: a quiet coin needs a swing of 3x its ATR (never under 2%), a wild coin keeps the 8% rule
      minImpulsePct: atr != null ? Math.min(strategies.R3.params.minImpulsePct, Math.max(R3_ATR.minImpulseFloor, round(R3_ATR.impulseAtr * atr, 2))) : strategies.R3.params.minImpulsePct }, nowSec) : null;
    if (bars) tape = { c, src: oh.src, bars, fib, setup: fib, verdict: "BLOCK" };
    s = fib;
    const wh = hs.ok && whaleCalls < WHALE_CHECKS && CALLS.jupiterData < CAPS.jupiterData ? (whaleCalls++, await whaleSignal(env, c, rg.data, set, { controls: x.controls })) : { ok: null, signal: false, reason: hs.ok ? "not read: call budget" : "not read: hard safety failed" };
    if (wh.ok != null) health.whales_trades = wh.ok;
    facts.whale = wh;
    if (!hs.ok) { await block(hs.reason, hs.number, /authority|rugged/.test(hs.reason) ? "authority" : "hard"); continue; }
    // every strategy looks at the same bars; the first real signal wins, whales first
    const tries = [];
    // R5 entry variants, alternating per signal: A = 2 independent winners; B = 3 winners, or 2 with volume rising (5-minute pace above the hourly pace)
    // (volume: the 5-minute pace against the other 55 minutes of the hour; unknown volume is unknown, not "not rising")
    const rising = volumeRising(c.volM5, c.volH1);
    const ev = wh.signal ? (seed01(`${c.mint}|${Math.floor(nowSec / 1800)}|r5entry`) < 0.5 ? "A" : "B") : null; // seeded per coin and half hour, not by arrival order
    const r5ok = wh.signal && (ev === "A" || wh.independent >= 3 || rising === true);
    // a second, separate R5 source: a Nansen-labelled smart trader bought this coin in the last 10 minutes (REPORTED evidence)
    const nz = x.nansen?.[c.mint] || null;
    if (nz) facts.nansen = { traders: nz.traders.slice(0, 5), weight: nz.weight };
    facts.r5 = wh.signal ? { entryVariant: ev, independent: wh.independent, rising, taken: r5ok } : null;
    // Nansen buys are LOGGED as signals with their forward returns; they open a paper trade only when env AQ_NANSEN_R5 is "1"
    // (off by default: the 2026-11-16 audit takes R5 off the real ledger until its signals show a positive forward return)
    const nzTrade = nz && env.AQ_NANSEN_R5 === "1" && mode("R5:nansen").real;
    if ((r5ok || nzTrade) && live("R5")) tries.push(["R5", { ...whaleSetup(bars || [], strategies.R5.params, nowSec, c.priceUsd), ...(r5ok ? {} : { source: "nansen" }) }]);
    if (bars && live(c.gta ? "R4" : "R3")) tries.push([c.gta ? "R4" : "R3", fib]);
    if (bars && tier !== "C" && live("R6")) tries.push(["R6", momentumSetup(bars, { ...R6_PARAMS, ...strategies.R6.params }, nowSec)]);
    if (bars && tier === "A" && live("R7")) tries.push(["R7", bounceSetup(bars, { ...R7_PARAMS, ...strategies.R7.params }, nowSec)]);
    facts.signals = Object.fromEntries(tries.map(([id, t]) => [id, t.signal ? "SIGNAL" : t.why]));
    if (!tries.length) { await block(bars ? "no strategy applies to this tier" : `missing data: candles (own history ${own.length}/${MIN_OWN_BARS} bars)`, own.length); continue; }
    // only CLOSED candles are stored (the minute has ended), whatever the source; a bar stored earlier while still forming is corrected
    // (one row per minute: a source that repeats a timestamp would make the upsert fail)
    const keep = !bars ? [] : [...new Map(bars.filter((k) => k.t + 60 <= nowSec).map((k) => [k.t, k])).values()];
    if (keep.length) await d.q(`INSERT INTO mob_aq_candles (pool, t, o, h, l, c, v) SELECT $1, t, o, h, l, c, v FROM unnest($2::bigint[],$3::float8[],$4::float8[],$5::float8[],$6::float8[],$7::float8[]) x(t,o,h,l,c,v)
      ON CONFLICT (pool, t) DO UPDATE SET o=EXCLUDED.o, h=EXCLUDED.h, l=EXCLUDED.l, c=EXCLUDED.c, v=EXCLUDED.v`,
      [c.pool, keep.map((k) => k.t), keep.map((k) => k.o), keep.map((k) => k.h), keep.map((k) => k.l), keep.map((k) => k.c), keep.map((k) => k.v)]);
    // a strategy that is off the real ledger (R6 until its replay is positive, R5 until its signals beat their control) still
    // fires: its signal goes to the shadow lane with its own levels and is never bought with the paper wallet
    const off = tries.filter(([id, t]) => t.signal && !mode(t.source === "nansen" ? "R5:nansen" : id).real);
    for (const [id, t] of off) near.push({ c, reason: `${id} signal, off the real ledger: ${mode(t.source === "nansen" ? "R5:nansen" : id).why}`, setup: t, sid: id, tier, atr, rt: null, first: true });
    if (off.length) facts.shadowSignals = off.map(([id]) => id);
    const realTries = tries.filter(([id, t]) => mode(t.source === "nansen" ? "R5:nansen" : id).real);
    const hit = realTries.find(([, t]) => t.signal);
    if (fib) { set("st.fib", "busy", `${c.symbol}: ${fib.why}`); set("st.swing", "busy", `${c.symbol}: impulse ${fib.impulsePct ?? "?"}%`); }
    const stale = Math.max(...tries.map(([, t]) => t.staleSec ?? 0));
    if (bars && stale > C.staleSec) { await block("stale data", stale); continue; }
    if (!realTries.length) { await block(`no real-ledger strategy for this coin: ${off.map(([id]) => `${id} is on the shadow lane`).join("; ") || "none applies"}`.slice(0, 240), null, "signal"); continue; }
    if (atr == null) { await block("missing data: ATR5 (too few bars to measure this coin's volatility)", bars?.length ?? 0); continue; }
    const pOf = (id) => ({ ...strategies.R3.params, ...(id === "R6" ? R6_PARAMS : id === "R7" ? R7_PARAMS : {}), ...strategies[id].params });
    const objections = softObjections({ tier, rug: rg.data, createdAt: c.createdAt, boosted: c.boosted, copycat: c.copycat, whale: wh.signal || wh.winners > 0, fng, nowMs });
    // no full signal: on paper the coin still competes for an EXPLORE-WEAK slot with its best partial setup (strength 0-1)
    if (!hit) {
      const best = realTries.map(([id, t2]) => ({ id, t: t2, st: strengthOf(id, t2, pOf(id), wh) })).sort((a, b) => b.st - a.st)[0];
      const why = realTries.map(([i, t2]) => `${i} ${t2.why}`).join("; ");
      facts.strength = best.st;
      if (best.st < 0.1) { await block(`no signal: ${why}`.slice(0, 240), realTries[0][1].number, "signal"); continue; }
      const plan = planOf(c, best.id, best.t, pOf(best.id), atr);
      Object.assign(facts, { strategy: best.id, plan });
      if (plan.stopPct >= plan.targetPct) { await block(`no signal (strength ${best.st}): ${why}`.slice(0, 240), best.st, "signal", best.t, best.id); continue; }
      const pg = preGate(c, tier, atr, plan);
      if (pg) { quiet.push({ symbol: c.symbol, have: pg.have, need: pg.need }); await block(pg.reason, pg.number, "untradable", { ...best.t, ...plan }, best.id); continue; }
      weak.push({ c, tier, atr, s: best.t, plan, sid: best.id, SP: pOf(best.id), objections, sc: scoreOf(objections, weights, tier, false), strength: best.st, facts, rg, wh, noteSignal, why,
        block: (r, n, k = "hard") => block(r, n, k, { ...best.t, ...plan }, best.id), tape: bars ? { c, src: oh.src, bars, fib, setup: best.t, verdict: "BLOCK" } : null });
      continue;
    }
    const [sid, setup] = hit;
    s = setup; c.strategy = sid; facts.setup = s; facts.strategy = sid;
    const SP = { ...strategies.R3.params, ...strategies[sid].params };
    const plan = planOf(c, sid, s, SP, atr);
    facts.plan = plan;
    s = { ...s, ...plan };
    set("st.stop", "busy", `${c.symbol}: stop ${plan.stopPct}% (noise of a ${plan.holdMin} min hold ${plan.noisePct}%)`); set("st.target", "busy", `${c.symbol}: target ${plan.targetPct}%`);
    if (plan.stopPct >= plan.targetPct) { await block("stop > target", round(plan.stopPct / plan.targetPct, 3)); continue; }
    const pg = preGate(c, tier, atr, plan);
    if (pg) { quiet.push({ symbol: c.symbol, have: pg.have, need: pg.need }); await block(pg.reason, pg.number, "untradable"); continue; }
    // "replay loses" for every strategy that can be replayed on candles, each with the cost measured for its tier
    const rp = x.replays?.[sid === "R4" ? "R3" : sid];
    if (rp && rp.n >= 30 && rp.ci95 && rp.ci95[1] < 0) { await block(`time machine: ${sid} replay loses (${rp.n} trades, mean ${rp.expectancyPct}% net of ${rp.costPct}% measured cost, 95% CI ${rp.ci95.join(" to ")})`, rp.expectancyPct, "soft"); continue; }
    const sc = scoreOf(objections, weights, tier, !!wh.signal);
    // tier C (new launches) keeps the strict rules: an LP-lock, holder or danger objection is not a normal PASS there
    const strict = tier === "C" && objections.some((o) => ["lp_locked", "top10", "top_holder", "danger_risk", "copycat"].includes(o));
    Object.assign(facts, { soft: objections, score: sc.score, strict, strength: strengthOf(sid, setup, SP, wh) });
    if (sid === "R5" && s.source === "nansen") s.why = `nansen: ${nz.traders[0]} bought (${s.why.replace("whale signal, ", "")})`;
    ready.push({ strength: sid === "R5" && s.source === "nansen" ? round(nz.weight, 2) : strengthOf(sid, setup, SP, wh), ev: sid === "R5" ? (s.source === "nansen" ? "N" : ev) : null, c, tier, atr, s, plan, sid, SP, objections, sc, strict, facts, rg, wh, block, noteSignal, tape: bars ? { c, src: oh.src, bars, fib, setup: s, verdict: "BLOCK" } : null });
  }
  // ---- decide: a normal PASS needs the score; otherwise EXPLORE takes the best-scored signal when no entry happened lately
  const lastOpen = await d.one(`SELECT greatest((SELECT max(opened_at) FROM mob_aq_positions), (SELECT max(opened_at) FROM mob_aq_trades)) t`);
  const sinceMin = lastOpen?.t ? (nowMs - new Date(lastOpen.t).getTime()) / 60000 : Infinity;
  const exploreDue = sinceMin >= C.exploreEveryMin;
  ready.sort((a, b) => b.sc.score - a.sc.score);
  let tries = 0;
  // full signals first (best score), then, when an explore is due, the partial setups by strength (EXPLORE-WEAK, smallest size)
  weak.sort((a, b) => b.strength - a.strength || b.sc.score - a.sc.score);
  for (const g of [...ready, ...weak.map((w) => ({ ...w, weak: true, strict: false }))]) {
    const { c, sid, SP, tier, atr, plan } = g;
    // exit variant: a seeded coin flip per trade (not "every other trade"), unless the tournament already named a default.
    // It is independent of the time arm and it no longer changes the stop, so the two can be compared cleanly.
    const dfl = x.variantDefault?.[sid];
    const variant = dfl || arms?.[1] || (seed01(`${c.mint}|${minute}|exit`) < 0.5 ? "A" : "B");
    const s = { ...g.s, ...plan };
    const normal = !g.weak && !g.strict && g.sc.score >= C.passScore + throttle.score;
    const tag = normal ? "PASS" : exploreDue ? (g.weak ? "EXPLORE-WEAK" : "EXPLORE") : null;
    if (g.weak && (out.entered || !tag || tries >= QUOTE_TRIES)) { await g.block(`no signal (strength ${g.strength}): ${g.why}`.slice(0, 240), g.strength, "signal"); continue; }
    if (out.entered || !tag || tries >= QUOTE_TRIES) {
      const why = out.entered ? "another candidate was taken this tick" : tries >= QUOTE_TRIES ? "quote budget used this tick" : null;
      if (why) { out.evaluated.push({ symbol: c.symbol, tier, verdict: "WAIT", reason: why, number: g.sc.score }); continue; }
      await g.block(`soft rules: score ${g.sc.score} under ${C.passScore} (${g.objections.join(", ") || "none"})${g.strict ? ", tier C strict" : ""}; next explore in ${round(Math.max(0, C.exploreEveryMin - sinceMin), 1)} min`, g.sc.score, "soft");
      continue;
    }
    if (!feeSol || !solUsd) { await g.block("missing data: SOL price", null); continue; }
    // ---- size. The network fee is a fixed amount, so there is a smallest size at which six round trips still fit under the
    // target and under 3x ATR5 (the fee floor). EXPLORE takes that smallest size; a PASS takes its risk size, never under the
    // floor. Nothing is ever shrunk below the floor: if the 1% risk limit cannot carry the floor, the trade is refused.
    const o = book.optimistic(c.mint, tier), estRt = o.pct ?? KB_COST_PCT, cap = Math.min(plan.targetPct, C.atrMultiple * atr);
    const floor = feeFloorSize(feeSol, cap, o.pool ?? 0);
    // CEO sizing: a fixed position (0.26 SOL, half for EXPLORE-WEAK), scaled down only by a survival stage, by the cash that
    // exists, and by 1% of the pool's liquidity. Never under 0.05 SOL or the fee floor: then there is no trade.
    const positionSol = x.positionSol ?? C.positionSol, base = positionSol * (g.weak ? 0.5 : 1) * sv.sizeMult;
    const poolCap = c.liqUsd > 0 ? ((C.maxPoolPct / 100) * c.liqUsd) / solUsd : Infinity, cashCap = Math.max(0, cash - feeSol);
    const hard = { sizeSol: round(Math.max(0, Math.min(base, poolCap, cashCap)), 6), stressedPct: round(C.stressMult * plan.stopPct + estRt, 3) };
    const maxSize = hard.sizeSol, riskPct = round((hard.sizeSol * (plan.stopPct + estRt)) / equity, 3); // % of equity lost if the stop is hit: reported, not a limit
    const soft = hard;
    const sizing = { positionSol, weak: !!g.weak, survivalMult: sv.sizeMult, cashSol: round(cash, 6), equitySol: round(equity, 6), poolCapSol: Number.isFinite(poolCap) ? round(poolCap, 6) : null, limitedBy: hard.sizeSol < base - 1e-9 ? (cashCap <= poolCap ? "cash" : "1% of the pool") : sv.sizeMult < 1 ? "survival stage" : null,
      minSol: C.minSizeSol, feeFloorSol: floor == null ? null : round(floor, 6), stopPct: plan.stopPct, estRtPct: round(estRt, 3), lossAtStopPctOfEquity: riskPct };
    g.facts.sizing = sizing;
    if (floor == null || floor * FLOOR_MARGIN > hard.sizeSol || hard.sizeSol < C.minSizeSol) {
      // the 6x round trip this coin would pay at the largest size the limits allow, against the room it has
      quiet.push({ symbol: c.symbol, have: round(cap, 3), need: round(C.costMultiple * ((o.pool ?? 0) + (hard.sizeSol > 0 ? (2 * feeSol * 100) / hard.sizeSol : 0)), 3) });
      await g.block(floor == null ? `not tradable: no size clears the fee floor (6x pool cost ${round(o.pool ?? 0, 2)}% already over ${round(cap, 2)}%)` : `size: needs ${round(Math.max(C.minSizeSol, floor * FLOOR_MARGIN), 4)} SOL (minimum ${C.minSizeSol}, fee floor ${round(floor, 4)}) but the position size ${positionSol} SOL${g.weak ? " (half for EXPLORE-WEAK)" : ""}, cash ${round(cash, 4)} SOL and 1% of the pool allow ${hard.sizeSol} SOL`, floor == null ? null : round(floor, 6), "untradable");
      continue;
    }
    const est = { sizeSol: hard.sizeSol, stressedPct: hard.stressedPct };
    set("st.stress", "busy", `${c.symbol}: ${est.sizeSol} SOL (position ${positionSol}${g.weak ? " halved for EXPLORE-WEAK" : ""}${sizing.limitedBy ? `, cut by ${sizing.limitedBy}` : ""}); fee floor ${round(floor, 4)} SOL; a stop costs ${riskPct}% of equity`);
    if (est.sizeSol < C.minSizeSol) { await g.block("size too small", est.sizeSol); continue; }
    // quote the round trip. The pool's own cost is only known now: if the fixed fee is too big a share at this size and a
    // larger size inside the risk limit clears the floor, quote once more at that size (never a third time).
    let size = est.sizeSol, buy = null, sell = null, rt = null, poolRt = null, backSol = null;
    for (let turn = 0; turn < 2; turn++) {
      if (tries || turn) await sleep(gap);
      buy = await jupQuote(SOL_MINT, c.mint, Math.floor(size * 1e9));
      if (buy) await sleep(gap);
      sell = buy ? await jupQuote(c.mint, SOL_MINT, buy.outAmount) : null;
      if (!buy || !sell) break;
      backSol = Number(sell.outAmount) / 1e9;
      rt = roundTripPct(size, backSol, feeSol); poolRt = round(((size - backSol) / size) * 100, 3);
      const need = feeFloorSize(feeSol, cap, poolRt);
      if (turn === 0 && need != null && size < need && need * FLOOR_MARGIN <= hard.sizeSol) { size = round(need * FLOOR_MARGIN, 6); continue; }
      break;
    }
    tries++;
    health.jupiter = !!(buy && sell);
    set("co.jup", buy && sell ? "busy" : "blocked", buy && sell ? `${c.symbol}: quoted ${size} SOL round trip` : `${c.symbol}: no quote (honeypot or venue down)`);
    set("cn.honeypot", buy && sell ? "busy" : "blocked", buy && sell ? `${c.symbol}: a sell route exists` : `${c.symbol}: ${buy ? "NO SELL ROUTE" : "no buy quote"}`);
    if (!buy || !sell) { await g.block(buy ? "cannot sell: no Jupiter sell route" : "missing data: Jupiter quote", null); continue; }
    // ---- the fill. Stop and target are the plan's price levels; their distances are measured from what was actually paid.
    // A fill already at or beyond either level is refused (trade #28 was filled under its own stop).
    const tokensUi = Number(buy.outAmount) / 10 ** g.rg.data.decimals, tokensRaw = buy.outAmount;
    const entryPx = (solUsd * size) / tokensUi;
    let mid = c.priceUsd;
    try { mid = (await jupPrices([c.mint]))[c.mint]?.price ?? c.priceUsd; } catch {}
    const slip = mid ? round((entryPx / mid - 1) * 100, 3) : null;
    const stopPct = round(((entryPx - plan.stopPrice) / entryPx) * 100, 3), targetPct = round(((plan.targetPrice - entryPx) / entryPx) * 100, 3);
    Object.assign(g.facts, { rtPct: rt, poolRtPct: poolRt, sizeSol: size, tag, fill: { entryUsd: entryPx, midUsd: mid, stopUsd: plan.stopPrice, targetUsd: plan.targetPrice, stopPct, targetPct }, variant, tvar: plan.tvar });
    if (!(stopPct > 0) || !(targetPct > 0)) { await g.block(`fill outside the plan: filled at $${round(entryPx, 10)}, stop $${round(plan.stopPrice, 10)}, target $${round(plan.targetPrice, 10)}`, stopPct > 0 ? targetPct : stopPct); continue; }
    if (stopPct >= targetPct) { await g.block("stop > target at the fill", round(stopPct / targetPct, 3)); continue; }
    const x6 = rt > 0 ? round(targetPct / rt, 2) : null;
    const tb = tradability(rt, atr);
    set("co.gate", "busy", `${c.symbol}: target ${targetPct}% vs round trip ${rt}% = ${x6 ?? "inf"}x; 3x ATR5 ${tb.havePct}%`);
    set("co.breakeven", "busy", `${c.symbol}: break-even win rate ${round(((stopPct + rt) / (targetPct + stopPct)) * 100, 1)}%`);
    if (rt > 0 && targetPct < C.costMultiple * rt) { quiet.push({ symbol: c.symbol, have: targetPct, need: round(C.costMultiple * rt, 3) }); await g.block("cost gate", x6); continue; }
    if (rt > 0 && !tb.ok) { quiet.push({ symbol: c.symbol, have: tb.havePct, need: tb.needPct }); await g.block(`not tradable: 6x measured round trip ${rt}% = ${tb.needPct}% is over 3x ATR5 ${atr}% = ${tb.havePct}%`, round(tb.havePct / tb.needPct, 3), "untradable"); continue; }
    sizing.lossAtStopPctOfEquity = round((size * (stopPct + Math.max(rt, 0))) / equity, 3);
    // what a sale fetches against the mid, measured now: the exit loop uses it to tell a real stop from a wrong mid
    const exitK = mid ? ((backSol * solUsd) / tokensUi) / mid : null;
    const reason = `${tag !== "PASS" ? `${tag}: ` : ""}${sid} ${g.weak ? `strength ${g.strength} (${s.why})` : s.why}; hard blocks clear; 6x round trip ${rt}% = ${tb.needPct}% fits target ${targetPct}% and 3x ATR5 ${tb.havePct}%; score ${g.sc.score}${g.objections.length ? ` (soft: ${g.objections.join(", ")})` : ""}`;
    // the claim (ledger.mjs): cash debit, slot, position row and flows in one statement; a lost claim writes nothing
    const pid = await openPosition(d, { strategy: sid, mint: c.mint, pool: c.pool, symbol: c.symbol, decimals: g.rg.data.decimals, tokens_raw: tokensRaw, size_sol: size, fee_sol: feeSol, entry_price_usd: entryPx, entry_mid_usd: mid,
      stop_price: plan.stopPrice, target_price: plan.targetPrice, stop_pct: stopPct, target_pct: targetPct, rt_pct: rt, buy_slip_pct: slip, last_price_usd: mid, last_value_sol: mid ? (tokensUi * mid) / solUsd : size, tier, tag, soft: g.objections, score: g.sc.score,
      variant, entry_variant: g.ev, strength: g.strength, sizing: { ...sizing, sizeSol: size, rtPct: rt, poolRtPct: poolRt }, sol_usd_entry: solUsd, exit_k: exitK, tvar: plan.tvar, atr5_pct: atr, hold_min: plan.holdMin, timeStopSec: nowSec + plan.holdMin * 60, buyLabel: `buy ${c.symbol} (${sid}${tag === "EXPLORE" ? ", explore" : ""})` },
      Math.min(C.maxOpen, sv.maxOpen));
    if (pid == null) { await g.block("risk: no free slot, coin already held, or not enough cash at the moment of entry", null); continue; }
    const p = { id: pid };
    await g.noteSignal("PASS", reason);
    await council("PASS", c, reason, x6, g.facts);
    if (sid === "R5") await brain(d, "whales", "entry", `R5 paper entry ${c.symbol}: ${g.ev === "N" ? `Nansen-labelled ${g.facts.nansen.traders.join(", ")} bought (REPORTED)` : `${g.wh.independent} independent winners bought in 15 min (funders ${g.wh.funders})`}; stop ${stopPct}% (${s.structure}), target ${targetPct}%, round trip ${rt}%, size ${size} SOL.`, { whale: g.wh, setup: s });
    if (g.tape) tape = { ...g.tape, verdict: "PASS", plan };
    out.entered = { id: p.id, symbol: c.symbol, tier, strategy: sid, tag, variant, tvar: plan.tvar, holdMin: plan.holdMin, entryVariant: g.ev, strength: g.strength, sizeSol: size, entryUsd: entryPx, rtPct: rt, stopPct, targetPct, atr5Pct: atr, score: g.sc.score };
    out.evaluated.push({ symbol: c.symbol, tier, verdict: "PASS", tag, reason, number: x6 });
    set("ex.paper", "busy", `bought ${size} SOL of ${c.symbol} (paper, ${sid}, tier ${tier}${tag === "EXPLORE" ? ", EXPLORE" : ""})`); set("ex.caps", "busy", `position ${positionSol} SOL (CEO setting)${sizing.limitedBy ? `, cut to ${size} by ${sizing.limitedBy}` : ""}`);
  }
  // an explore was due and nothing could be taken because no coin can pay its cost: say so, with the numbers
  if (!out.entered && exploreDue && quiet.length && !ready.length) {
    const best = quiet.sort((a, b) => b.have / b.need - a.have / a.need)[0];
    await council("BLOCK", null, `market too quiet: ${quiet.length} coin(s) cannot pay 6x their round trip; best ${best.symbol} has ${best.have}% of room against ${best.need}% needed`, best.have, { block: "quiet", quiet: quiet.slice(0, 10) });
    out.quiet = { coins: quiet.length, best: best.symbol, have: best.have, needed: best.need };
  }
  if (tape) await setState(d, "tape", { symbol: tape.c.symbol, mint: tape.c.mint, src: tape.src, verdict: tape.verdict, strategy: tape.c.strategy || null,
    candles: tape.bars.slice(-90).map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v ?? 0 })),
    fib: tape.setup?.stopPrice ? { high: tape.fib?.high ?? null, low: tape.fib?.low ?? null, entry: tape.setup.price ?? null, stop: tape.plan?.stopPrice ?? tape.setup.stopPrice, target: tape.plan?.targetPrice ?? tape.setup.targetPrice } : tape.fib?.high ? { high: tape.fib.high, low: tape.fib.low, entry: null, stop: null, target: null } : null });
  set("cn.veto", out.evaluated.length ? "busy" : "idle", out.evaluated.length ? `${out.evaluated.filter((e) => e.verdict === "BLOCK").length} BLOCK, ${out.evaluated.filter((e) => e.verdict === "PASS").length} PASS` : "nothing new to judge");
  set("cn.adversary", out.evaluated.length ? "busy" : "idle", out.evaluated[0] ? `${out.evaluated[0].symbol}: ${String(out.evaluated[0].reason).slice(0, 150)}` : "waiting");
  set("ln.refit", "busy", `soft-rule weights: ${Object.entries(weights).map(([k, v]) => `${k} ${round(v, 2)}`).join(", ")}`.slice(0, 190));
}
