// The Council of Olympus, ALWAYS TRADING edition (aquarius-trader skill). Hard blocks are never traded. Soft rules only move
// a score and the size. On paper the Council takes the best-scored candidate with a real signal at least every few minutes
// (EXPLORE, small), and every closed trade moves the soft-rule weights through a recorded tournament step.
import { db } from "../db.mjs";
import { feeds, jupQuote, SOL_MINT, CALLS, CAPS } from "./feeds.mjs";
import { R3_ATR, R6_PARAMS, R7_PARAMS } from "./seed.mjs";
import { atr5Pct, fibSetup, whaleSetup, momentumSetup, bounceSetup, hardSafety, softObjections, scoreOf, tierOf, sizeFor, roundTripPct, round, COUNCIL, SOFT_RULES } from "./logic.mjs";
import { whaleSignal } from "./whales.mjs";

export const RUG_PER_TICK = 4;
export const MAX_EVAL = 10, COOLDOWN_MIN = 10, RECHECK_MIN = 3, WHALE_CHECKS = 6, MIN_OWN_BARS = 30, KB_COST_PCT = 5, QUOTE_TRIES = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function ruleWeights(d) {
  await d.q(`INSERT INTO mob_aq_rules (name) SELECT * FROM unnest($1::text[]) ON CONFLICT DO NOTHING`, [SOFT_RULES]);
  return Object.fromEntries((await d.q(`SELECT name, weight FROM mob_aq_rules`)).map((r) => [r.name, r.weight]));
}
// Tournament step T3: a soft rule that objected to a winner loses weight, one that objected to a loser gains weight.
export async function learnFromTrade(d, pos, tradeId, pnlPct) {
  const soft = Array.isArray(pos.soft) ? pos.soft : [];
  await d.q(`UPDATE mob_aq_trades SET tier=$2, tag=$3, soft=$4 WHERE id=$1`, [tradeId, pos.tier || null, pos.tag || null, JSON.stringify(soft)]);
  if (!soft.length) return [];
  const won = pnlPct > 0, moved = [];
  for (const name of soft) {
    const r = await d.one(`UPDATE mob_aq_rules SET weight = ${won ? "greatest(0.2, weight - 0.05)" : "least(3, weight + 0.05)"}, blocked_winners = blocked_winners + $2, blocked_losers = blocked_losers + $3,
      history = CASE WHEN jsonb_array_length(history) >= 50 THEN history - 0 ELSE history END || jsonb_build_array(jsonb_build_object('trade', $4::int, 'pnl', $5::float8, 'at', now())), updated_at = now() WHERE name=$1 RETURNING name, weight`,
      [name, won ? 1 : 0, won ? 0 : 1, tradeId, pnlPct]);
    if (r) moved.push(`${r.name} -> ${round(r.weight, 2)}`);
  }
  await d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ('learning','tournament',$1,$2)`, [`Rule T3 (trade #${tradeId}, ${pos.symbol} ${won ? "won" : "lost"} ${round(pnlPct, 2)}%): soft rules that objected ${won ? "lose" : "gain"} weight: ${moved.join(", ")}.`, JSON.stringify({ trade: tradeId, soft, won })]);
  return moved;
}

export async function councilTick(env, x) {
  const throttle = x.throttle || { size: 1, score: 0 };
  const { d, cands, tradable, strategies, pos, cash, equity, sv, solUsd, feeSol, nowSec, gap, health, set, out, near, rpl, fng, council, brain, flow, setState } = x;
  const nowMs = nowSec * 1000, C = COUNCIL;
  const weights = await ruleWeights(d);
  const live = (id) => strategies[id]?.alive && strategies[id].status === "paper";
  // a coin that only lacked a signal is looked at again after RECHECK_MIN; any other verdict rests for COOLDOWN_MIN
  const recent = new Set((await d.q(`SELECT DISTINCT mint FROM mob_aq_council WHERE mint IS NOT NULL AND at > now() - make_interval(mins => CASE WHEN facts->>'block' IN ('signal','quiet') THEN $2::int ELSE $1::int END)`, [COOLDOWN_MIN, RECHECK_MIN])).map((r) => r.mint));
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
  const ready = [];
  let rugCalls = 0, whaleCalls = 0;
  let tape = null; // the coin on the big screen: the one entered, else the last one judged with bars
  for (const c of queue) {
    const tier = tierOf(c.liqUsd || 0, c.createdAt, nowMs);
    const facts = { tier, liqUsd: c.liqUsd, boosted: c.boosted, copycat: c.copycat, gta: c.gta, src: c.src };
    let s = null;
    const noteSignal = (verdict, reason) => (facts.whale?.signal ? d.q(`UPDATE mob_aq_signals SET verdict=$2, reason=$3 WHERE mint=$1 AND verdict IS NULL AND at > now() - interval '30 minutes'`, [c.mint, verdict, reason]) : null);
    const block = async (reason, number, kind = "hard") => { await noteSignal("BLOCK", reason); facts.block = kind; await council("BLOCK", c, reason, number, facts); out.evaluated.push({ symbol: c.symbol, tier, verdict: "BLOCK", kind, reason, number }); near.push({ c, reason, setup: s, rt: facts.rtPct ?? null }); };
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
    const wh = hs.ok && whaleCalls < WHALE_CHECKS && CALLS.jupiterData < CAPS.jupiterData ? (whaleCalls++, await whaleSignal(env, c, rg.data, set)) : { ok: null, signal: false, reason: hs.ok ? "not read: call budget" : "not read: hard safety failed" };
    if (wh.ok != null) health.whales_trades = wh.ok;
    facts.whale = wh;
    if (!hs.ok) { await block(hs.reason, hs.number); continue; }
    // every strategy looks at the same bars; the first real signal wins, whales first
    const tries = [];
    // R5 entry variants, alternating per signal: A = 2 independent winners; B = 3 winners, or 2 with volume rising (5-minute pace above the hourly pace)
    const rising = c.volM5 != null && c.volH1 ? c.volM5 * 12 > c.volH1 : false;
    const ev = wh.signal ? ((await d.one(`SELECT count(*)::int n FROM mob_aq_signals`)).n % 2 ? "A" : "B") : null; // the signal row was just written, so the first signal is A
    const r5ok = wh.signal && (ev === "A" || wh.independent >= 3 || rising);
    facts.r5 = wh.signal ? { entryVariant: ev, independent: wh.independent, rising, taken: r5ok } : null;
    if (r5ok && live("R5")) tries.push(["R5", whaleSetup(bars || [], strategies.R5.params, nowSec, c.priceUsd)]);
    if (bars && live(c.gta ? "R4" : "R3")) tries.push([c.gta ? "R4" : "R3", fib]);
    if (bars && tier !== "C" && live("R6")) tries.push(["R6", momentumSetup(bars, { ...R6_PARAMS, ...strategies.R6.params }, nowSec)]);
    if (bars && tier === "A" && live("R7")) tries.push(["R7", bounceSetup(bars, { ...R7_PARAMS, ...strategies.R7.params }, nowSec)]);
    facts.signals = Object.fromEntries(tries.map(([id, t]) => [id, t.signal ? "SIGNAL" : t.why]));
    if (!tries.length) { await block(bars ? "no strategy applies to this tier" : `missing data: candles (own history ${own.length}/${MIN_OWN_BARS} bars)`, own.length); continue; }
    const keep = !bars ? [] : oh.src === "own" ? bars.slice(0, -1) : bars;
    if (keep.length) await d.q(`INSERT INTO mob_aq_candles (pool, t, o, h, l, c, v) SELECT $1, t, o, h, l, c, v FROM unnest($2::bigint[],$3::float8[],$4::float8[],$5::float8[],$6::float8[],$7::float8[]) x(t,o,h,l,c,v) ON CONFLICT DO NOTHING`,
      [c.pool, keep.map((k) => k.t), keep.map((k) => k.o), keep.map((k) => k.h), keep.map((k) => k.l), keep.map((k) => k.c), keep.map((k) => k.v)]);
    const hit = tries.find(([, t]) => t.signal);
    if (fib) { set("st.fib", "busy", `${c.symbol}: ${fib.why}`); set("st.swing", "busy", `${c.symbol}: impulse ${fib.impulsePct ?? "?"}%`); }
    const stale = Math.max(...tries.map(([, t]) => t.staleSec ?? 0));
    if (bars && stale > C.staleSec) { await block("stale data", stale); continue; }
    if (!hit) { const t = tries[0][1]; await block(`no signal: ${tries.map(([i, t2]) => `${i} ${t2.why}`).join("; ")}`.slice(0, 240), t.number, "signal"); continue; }
    const [sid, setup] = hit;
    s = setup; c.strategy = sid; facts.setup = s; facts.strategy = sid;
    const SP = { ...strategies.R3.params, ...strategies[sid].params };
    set("st.stop", "busy", `${c.symbol}: stop ${s.stopPct}%`); set("st.target", "busy", `${c.symbol}: target ${s.targetPct}%`);
    if (s.stopPct >= s.targetPct) { await block("stop > target", round(s.stopPct / s.targetPct, 3)); continue; }
    // too quiet: even the cheapest possible round trip (the fixed network fee at this tier's size, plus 0.1% of pool cost)
    // times 6 is above the target this coin's own volatility gives. No quote is spent on it.
    if (feeSol) {
      const floorRt = ((2 * feeSol) / (C.maxSizeSol * sv.sizeMult * throttle.size)) * 100 + 0.1, needs = round(C.costMultiple * floorRt, 2);
      if (s.targetPct < needs) { await block(`too quiet: ${sid} target ${s.targetPct}% cannot clear 6x cost (needs >= ${needs}%)`, s.targetPct, "quiet"); continue; }
    }
    if ((sid === "R3" || sid === "R4") && rpl && rpl.n >= 30 && rpl.ci95 && rpl.ci95[1] < 0) { await block("time machine: replay loses", rpl.expectancyPct, "soft"); continue; }
    const objections = softObjections({ tier, rug: rg.data, createdAt: c.createdAt, boosted: c.boosted, copycat: c.copycat, whale: wh.signal || wh.winners > 0, fng, nowMs });
    const sc = scoreOf(objections, weights, tier, !!wh.signal);
    // tier C (new launches) keeps the strict rules: an LP-lock, holder or danger objection is not a normal PASS there
    const strict = tier === "C" && objections.some((o) => ["lp_locked", "top10", "top_holder", "danger_risk", "copycat"].includes(o));
    Object.assign(facts, { soft: objections, score: sc.score, strict });
    ready.push({ ev: sid === "R5" ? ev : null, c, tier, s, sid, SP, objections, sc, strict, facts, rg, wh, block, noteSignal, tape: bars ? { c, src: oh.src, bars, fib, setup: s, verdict: "BLOCK" } : null });
  }
  // ---- decide: a normal PASS needs the score; otherwise EXPLORE takes the best-scored signal when no entry happened lately
  const lastOpen = await d.one(`SELECT greatest((SELECT max(opened_at) FROM mob_aq_positions), (SELECT max(opened_at) FROM mob_aq_trades)) t`);
  const sinceMin = lastOpen?.t ? (nowMs - new Date(lastOpen.t).getTime()) / 60000 : Infinity;
  const exploreDue = sinceMin >= C.exploreEveryMin;
  ready.sort((a, b) => b.sc.score - a.sc.score);
  let tries = 0;
  for (const g of ready) {
    const { c, sid, SP, tier } = g;
    // exit variant alternates per entry of this strategy unless the tournament already named a default
    const dfl = x.variantDefault?.[sid];
    const variant = dfl || ((await d.one(`SELECT (SELECT count(*) FROM mob_aq_positions WHERE strategy=$1) + (SELECT count(*) FROM mob_aq_trades WHERE strategy=$1 AND variant IS NOT NULL) n`, [sid])).n % 2 ? "B" : "A");
    // variant B caps the initial stop at 6% (one stop must never erase five wins); the target is untouched
    let s = g.s;
    if (variant === "B" && s.stopPct > 6) s = { ...s, stopPct: 6, stopPrice: s.price * 0.94 };
    const normal = !g.strict && g.sc.score >= C.passScore + throttle.score;
    const tag = normal ? "PASS" : exploreDue ? "EXPLORE" : null;
    if (out.entered || !tag || tries >= QUOTE_TRIES) {
      const why = out.entered ? "another candidate was taken this tick" : tries >= QUOTE_TRIES ? "quote budget used this tick" : null;
      if (why) { out.evaluated.push({ symbol: c.symbol, tier, verdict: "WAIT", reason: why, number: g.sc.score }); continue; }
      await g.block(`soft rules: score ${g.sc.score} under ${C.passScore} (${g.objections.join(", ") || "none"})${g.strict ? ", tier C strict" : ""}; next explore in ${round(Math.max(0, C.exploreEveryMin - sinceMin), 1)} min`, g.sc.score, "soft");
      continue;
    }
    if (!feeSol) { await g.block("missing data: SOL price", null); continue; }
    const mult = C.tiers[tier].size * g.sc.sizeMult * (tag === "EXPLORE" ? C.exploreSize : 1) * sv.sizeMult * throttle.size;
    // tier, soft rules and EXPLORE cut the RISK taken (never above 1% of equity); the SOL cap itself is not shrunk, because the
    // network fee is a fixed amount and a small position could never clear the 6x cost gate (tier C explores died on that)
    const SZ = { stressMult: C.stressMult, riskPct: C.riskPct * mult, maxSizeSol: C.maxSizeSol * sv.sizeMult * throttle.size };
    const est = sizeFor(equity, cash, s.stopPct, KB_COST_PCT, SZ);
    set("st.stress", "busy", `${c.symbol}: stressed ${est.stressedPct}% -> ${est.sizeSol} SOL (tier ${tier}, x${round(mult, 2)})`);
    if (est.sizeSol < C.minSizeSol) { await g.block("size too small", est.sizeSol); continue; }
    if (tries) await sleep(gap);
    tries++;
    const buy = await jupQuote(SOL_MINT, c.mint, Math.floor(est.sizeSol * 1e9));
    if (buy) await sleep(gap);
    const sell = buy ? await jupQuote(c.mint, SOL_MINT, buy.outAmount) : null;
    health.jupiter = !!(buy && sell);
    set("co.jup", buy && sell ? "busy" : "blocked", buy && sell ? `${c.symbol}: quoted ${est.sizeSol} SOL round trip` : `${c.symbol}: no quote (honeypot or venue down)`);
    set("cn.honeypot", buy && sell ? "busy" : "blocked", buy && sell ? `${c.symbol}: a sell route exists` : `${c.symbol}: ${buy ? "NO SELL ROUTE" : "no buy quote"}`);
    if (!buy || !sell) { await g.block(buy ? "cannot sell: no Jupiter sell route" : "missing data: Jupiter quote", null); continue; }
    const rt = roundTripPct(est.sizeSol, Number(sell.outAmount) / 1e9, feeSol);
    Object.assign(g.facts, { rtPct: rt, sizeSol: est.sizeSol, tag });
    const x6 = rt > 0 ? round(s.targetPct / rt, 2) : null;
    set("co.gate", "busy", `${c.symbol}: target ${s.targetPct}% vs round trip ${rt}% = ${x6 ?? "inf"}x`);
    set("co.breakeven", "busy", `${c.symbol}: break-even win rate ${round(((s.stopPct + rt) / (s.targetPct + s.stopPct)) * 100, 1)}%`);
    if (rt > 0 && s.targetPct < C.costMultiple * rt) { await g.block("cost gate", x6); continue; }
    const fin = sizeFor(equity, cash, s.stopPct, Math.max(rt, 0), SZ);
    const size = Math.min(fin.sizeSol, est.sizeSol);
    const tokensUi = Number(buy.outAmount) / 10 ** g.rg.data.decimals;
    const tokensRaw = size === est.sizeSol ? buy.outAmount : String(Math.floor(Number(buy.outAmount) * (size / est.sizeSol)));
    const entryPx = (solUsd * est.sizeSol) / tokensUi;
    const slip = c.priceUsd ? round((entryPx / c.priceUsd - 1) * 100, 3) : null;
    const reason = `${tag === "EXPLORE" ? "EXPLORE: " : ""}${sid} ${s.why}; hard blocks clear; score ${g.sc.score}${g.objections.length ? ` (soft: ${g.objections.join(", ")})` : ""}`;
    await g.noteSignal("PASS", reason);
    await council("PASS", c, reason, x6, g.facts);
    const p = await d.one(`INSERT INTO mob_aq_positions (strategy, mint, pool, symbol, decimals, tokens_raw, size_sol, fee_sol, entry_price_usd, entry_mid_usd, stop_price, target_price, stop_pct, target_pct, rt_pct, buy_slip_pct, time_stop_at, last_price_usd, last_value_sol, tier, tag, soft, score, variant, entry_variant)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, to_timestamp($17), $10, $7, $18, $19, $20, $21, $22, $23) RETURNING id`,
      [sid, c.mint, c.pool, c.symbol, g.rg.data.decimals, tokensRaw, size, feeSol, entryPx, c.priceUsd, s.stopPrice, s.targetPrice, s.stopPct, s.targetPct, rt, slip, nowSec + (sid === "R6" && x.r6TimeStopMin ? x.r6TimeStopMin : SP.timeStopMin) * 60, tier, tag, JSON.stringify(g.objections), g.sc.score, variant, g.ev]);
    if (sid === "R5") await brain(d, "whales", "entry", `R5 paper entry ${c.symbol}: ${g.wh.independent} independent winners bought in 15 min (funders ${g.wh.funders}); stop ${s.stopPct}% (${s.structure}), target ${s.targetPct}%, round trip ${rt}%, size ${size} SOL.`, { whale: g.wh, setup: s });
    await setState(d, "cash_sol", cash - size - feeSol);
    await flow(d, "buy", -size, "execution", `buy ${c.symbol} (${sid}${tag === "EXPLORE" ? ", explore" : ""})`);
    await flow(d, "fee", -feeSol, "costs", `network fee ${c.symbol}`);
    if (g.tape) tape = { ...g.tape, verdict: "PASS" };
    out.entered = { id: p.id, symbol: c.symbol, tier, strategy: sid, tag, variant, entryVariant: g.ev, sizeSol: size, entryUsd: entryPx, rtPct: rt, stopPct: s.stopPct, targetPct: s.targetPct, score: g.sc.score };
    out.evaluated.push({ symbol: c.symbol, tier, verdict: "PASS", tag, reason, number: x6 });
    set("ex.paper", "busy", `bought ${size} SOL of ${c.symbol} (paper, ${sid}, tier ${tier}${tag === "EXPLORE" ? ", EXPLORE" : ""})`); set("ex.caps", "busy", `cap ${C.maxSizeSol} SOL respected`);
  }
  if (tape) await setState(d, "tape", { symbol: tape.c.symbol, mint: tape.c.mint, src: tape.src, verdict: tape.verdict, strategy: tape.c.strategy || null,
    candles: tape.bars.slice(-90).map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v ?? 0 })),
    fib: tape.setup?.stopPrice ? { high: tape.fib?.high ?? null, low: tape.fib?.low ?? null, entry: tape.setup.price ?? null, stop: tape.setup.stopPrice, target: tape.setup.targetPrice } : tape.fib?.high ? { high: tape.fib.high, low: tape.fib.low, entry: null, stop: null, target: null } : null });
  set("cn.veto", out.evaluated.length ? "busy" : "idle", out.evaluated.length ? `${out.evaluated.filter((e) => e.verdict === "BLOCK").length} BLOCK, ${out.evaluated.filter((e) => e.verdict === "PASS").length} PASS` : "nothing new to judge");
  set("cn.adversary", out.evaluated.length ? "busy" : "idle", out.evaluated[0] ? `${out.evaluated[0].symbol}: ${String(out.evaluated[0].reason).slice(0, 150)}` : "waiting");
  set("ln.refit", "busy", `soft-rule weights: ${Object.entries(weights).map(([k, v]) => `${k} ${round(v, 2)}`).join(", ")}`.slice(0, 190));
}
