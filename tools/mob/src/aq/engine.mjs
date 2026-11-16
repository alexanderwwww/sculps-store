// Aquarius engine: the one-minute PAPER tick. Scouts -> Hecate safety -> Athena setup -> Costs -> Council -> Zeus risk ->
// Hermes paper fill -> Review -> Learning -> Ops. PAPER ONLY: no wallet, no keys, no orders. Missing data = NO trade.
import { db } from "../db.mjs";
import { DEPTS, seedWorkers, TOOLS, STRATEGIES, GTA6_DATE, GTA_RE, CEO } from "./seed.mjs";
import { feeds, midPrices, jupQuote, SOL_MINT, dsTokens } from "./feeds.mjs";
import { fibSetup, safety, roundTripPct, sizeFor, stats, replay, round, survival } from "./logic.mjs";
import { whaleSignal, shadowTick, shadowStats } from "./whales.mjs";
import { lanesTick, laneStats } from "./lanes.mjs";

export const AQ_BUILD = "aq-engine-1";
export const START_SOL = 1;
// Network fee per side: the worst measured value in trading-kb section 7 ($0.0015-0.0067 per trade), converted at the live SOL price.
export const NET_FEE_USD = 0.0067;
const KB_COST_PCT = 5; // trading-kb: measured memecoin round trip ~5%, used by the replay only when no quote was measured yet
const MAX_EVAL = 3, COOLDOWN_MIN = 10;
export const MIN_OWN_BARS = 30;
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
  const lock = await d.one(`INSERT INTO mob_aq_state (k, v, at) VALUES ('tick_lock', 'true', now()) ON CONFLICT (k) DO UPDATE SET v='true', at=now()
    WHERE mob_aq_state.v <> 'true'::jsonb OR mob_aq_state.at < now() - interval '50 seconds' RETURNING k`);
  if (!lock) return { skipped: "another tick is running" };
  const gap = opts.gapMs ?? Number(env.AQ_JUP_GAP_MS ?? 1100);
  const nowSec = (opts.now ?? Date.now()) / 1000;
  const W = {}; // worker key -> [status, note]
  const set = (k, s, n) => { W[k] = [s, String(n).slice(0, 200)]; };
  const health = {};
  const out = { evaluated: [], entered: null, exits: [], feeds: health };
  try {
    const kill = (await getState(d, "kill", false)) === true;
    const destroyed = (await getState(d, "destroyed", false)) === true; // only Alex's rebuild clears it
    const strategies = Object.fromEntries((await d.q(`SELECT * FROM mob_aq_strategies`)).map((s) => [s.id, s]));
    const P = strategies.R3?.params || STRATEGIES[2][4];

    // ---- feeds (cached, so most ticks read the database, not the internet)
    const [tr, nw, bo, pr, mj, fg, un] = await Promise.all([feeds.trending(env), feeds.newPools(env), feeds.boosts(env), feeds.profiles(env), feeds.majors(env), feeds.fng(env), feeds.universe(env)]);
    Object.assign(health, { geckoterminal: tr.ok && nw.ok, dexscreener: un.ok, coingecko: mj.ok && mj.data?.src !== "dexscreener", sol_price: !!mj.data?.sol, feargreed: fg.ok });
    const solUsd = mj.data?.sol?.price ?? (tr.data || []).find((p) => p.solUsd)?.solUsd ?? null;
    const feeSol = solUsd ? NET_FEE_USD / solUsd : null;
    const boosted = new Set(bo.data || []);
    const profiles = pr.data || {};
    set("sol.new_pairs", un.ok || nw.ok ? "busy" : "blocked", `${un.ok ? `${un.data.length} DexScreener pairs` : `DexScreener failed: ${un.err}`}; ${nw.ok ? `${nw.data.length} new GeckoTerminal pools` : "GeckoTerminal not answering (bonus feed)"}`.slice(0, 190));
    set("sol.boosted", bo.ok ? "busy" : "blocked", bo.ok ? `${boosted.size} paid boosts flagged` : `DexScreener failed: ${bo.err}`);
    set("nw.tokens", pr.ok ? "busy" : "blocked", pr.ok ? `${Object.keys(profiles).length} token profiles read` : `DexScreener failed: ${pr.err}`);
    set("stk.regime", mj.ok ? "busy" : "blocked", (mj.ok ? `SOL $${mj.data.sol?.price ?? "?"} BTC $${mj.data.btc?.price ?? "unknown"} (${mj.data.src})` : `price feeds failed: ${mj.err}`).slice(0, 190));
    set("nw.fng", fg.ok ? "busy" : "blocked", fg.ok ? `Fear and Greed ${fg.data.value} (${fg.data.label})` : `alternative.me failed: ${fg.err}`);
    const daysToGta = Math.ceil((Date.parse(GTA6_DATE + "T00:00:00Z") / 1000 - nowSec) / 86400);
    set("nw.calendar", "busy", daysToGta > 0 ? `GTA 6 in ${daysToGta} day(s)` : daysToGta === 0 ? "GTA 6 releases today" : `GTA 6 out ${-daysToGta} day(s)`);

    // ---- candidates: trending first, then new; copycats and narrative tags
    // ---- watchlist: every pair seen at or above the liquidity gate is tracked from then on; the top 15 get a price
    // sample every tick, which builds our own 1-minute candles (no dependence on GeckoTerminal for history)
    const found = [...(tr.data || []).map((p) => ({ ...p, src: "trending" })), ...(un.data || []).map((p) => ({ ...p, src: "dexscreener" })), ...(nw.data || []).map((p) => ({ ...p, src: "new" }))];
    const liquid = [...new Map(found.filter((p) => p.mint && (p.liqUsd || 0) >= P.minLiqUsd).map((p) => [p.mint, p])).values()]; // one row per mint
    if (liquid.length) await d.q(`INSERT INTO mob_aq_watch (mint, pool, symbol, liq_usd, vol_h1, ch1h, price_usd, src) SELECT * FROM unnest($1::text[],$2::text[],$3::text[],$4::float8[],$5::float8[],$6::float8[],$7::float8[],$8::text[])
      ON CONFLICT (mint) DO UPDATE SET liq_usd=EXCLUDED.liq_usd, vol_h1=EXCLUDED.vol_h1, ch1h=EXCLUDED.ch1h, price_usd=EXCLUDED.price_usd, last_seen=now()`,
      [liquid.map((p) => p.mint), liquid.map((p) => p.pool), liquid.map((p) => p.symbol), liquid.map((p) => p.liqUsd), liquid.map((p) => p.volH1), liquid.map((p) => p.ch1h), liquid.map((p) => p.priceUsd), liquid.map((p) => p.src)]);
    const watch = await d.q(`SELECT * FROM mob_aq_watch WHERE last_seen > now() - interval '1 day' AND liq_usd >= $1 ORDER BY liq_usd DESC LIMIT 15`, [P.minLiqUsd]);
    let fresh = [];
    if (watch.length) {
      try { fresh = await dsTokens(watch.map((w) => w.mint)); health.dexscreener_prices = true; } catch (e) { health.dexscreener_prices = false; }
      const px = fresh.filter((p) => p.priceUsd != null);
      if (px.length) {
        await d.q(`INSERT INTO mob_aq_prices (mint, price) SELECT * FROM unnest($1::text[],$2::float8[]) ON CONFLICT DO NOTHING`, [px.map((p) => p.mint), px.map((p) => p.priceUsd)]);
        await d.q(`UPDATE mob_aq_watch w SET liq_usd=x.l, vol_h1=x.v, ch1h=x.c, price_usd=x.p, pool=x.pool, last_seen=now() FROM unnest($1::text[],$2::float8[],$3::float8[],$4::float8[],$5::float8[],$6::text[]) x(m,l,v,c,p,pool) WHERE w.mint=x.m`,
          [px.map((p) => p.mint), px.map((p) => p.liqUsd), px.map((p) => p.volH1), px.map((p) => p.ch1h), px.map((p) => p.priceUsd), px.map((p) => p.pool)]);
      }
      await d.q(`DELETE FROM mob_aq_prices WHERE at < now() - interval '2 days'`);
    }
    const tracked = fresh.map((p) => ({ ...p, src: "watchlist" })).sort((a, b) => (b.volH1 || 0) - (a.volH1 || 0));
    const trendingNow = (tracked.length ? tracked : liquid).slice(0, 12).map((p) => ({ symbol: p.symbol, mint: p.mint, ch1h: p.ch1h, liqUsd: p.liqUsd }));
    await d.q(`INSERT INTO mob_aq_market (k, data, ok, at) VALUES ('trending', $1, true, now()) ON CONFLICT (k) DO UPDATE SET data=EXCLUDED.data, ok=true, err=null, at=now()`, [JSON.stringify(trendingNow)]);
    const bars = await d.one(`SELECT count(*)::int n, count(DISTINCT mint)::int m FROM mob_aq_prices WHERE at > now() - interval '1 hour'`);
    set("sol.trending", trendingNow.length ? "busy" : "blocked", trendingNow.length ? `${watch.length} liquid pairs on the watchlist; ${bars.n} price samples in the last hour (${bars.m} coins)` : "no liquid pair found this tick");
    // candidates: the tracked watchlist first (liquid, with history), then everything else found this tick
    const all = [...tracked, ...found];
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
    set("sol.gainers", cands.length ? "busy" : "idle", `${hot} pools over +100% in 1h (warning)`);
    set("sol.volume", cands.length ? "busy" : "idle", `${spikes} 5-minute volume spikes`);
    set("sol.liquidity", cands.length ? "busy" : "idle", `${cands.filter((c) => (c.liqUsd || 0) >= P.minLiqUsd).length} pools at or above $${P.minLiqUsd}`);

    // ---- exits first (Hermes): real prices every tick, stops keep working even with the kill switch on
    const open = await d.q(`SELECT * FROM mob_aq_positions ORDER BY id`);
    if (open.length && !destroyed) {
      let mids = null;
      try { mids = await midPrices(open.map((p) => ({ mint: p.mint, pool: p.pool }))); health.dexscreener_prices = true; } catch (e) { health.dexscreener_prices = false; }
      for (const p of open) {
        const mid = mids?.[p.mint] ?? null;
        if (mid == null) { set("ex.stops", "blocked", `${p.symbol}: no price, holding`); continue; }
        const why = mid <= p.stop_price ? "stop" : mid >= p.target_price ? "target" : nowSec * 1000 >= new Date(p.time_stop_at).getTime() ? "time stop" : null;
        const markSol = solUsd ? (Number(p.tokens_raw) / 10 ** p.decimals) * mid / solUsd : null;
        await d.q(`UPDATE mob_aq_positions SET last_price_usd=$2, last_value_sol=$3, last_at=now() WHERE id=$1`, [p.id, mid, markSol]);
        if (!why) continue;
        if (out.exits.length) await sleep(gap);
        const q = await jupQuote(p.mint, SOL_MINT, p.tokens_raw);
        if (!q || !feeSol) { set("ex.reconcile", "blocked", `${p.symbol}: ${why} hit but no sell quote; retry next tick`); health.jupiter = false; continue; }
        health.jupiter = true;
        const back = Number(q.outAmount) / 1e9 - feeSol;
        const pnl = back - (p.size_sol + p.fee_sol);
        const pnlPct = (pnl / (p.size_sol + p.fee_sol)) * 100;
        const exitPx = solUsd ? (Number(q.outAmount) / 1e9) * solUsd / (Number(p.tokens_raw) / 10 ** p.decimals) : null;
        const slip = exitPx ? round((mid / exitPx - 1) * 100, 3) : null;
        const grade = (why === "time stop" ? "B" : "A") + (pnl > 0 ? "/win" : "/loss");
        const t = await d.one(`INSERT INTO mob_aq_trades (position_id, strategy, mint, symbol, size_sol, back_sol, entry_price_usd, exit_price_usd, pnl_sol, pnl_pct, fees_sol, slippage_pct, reason, grade, opened_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
          [p.id, p.strategy, p.mint, p.symbol, p.size_sol, back, p.entry_price_usd, exitPx, pnl, round(pnlPct, 3), p.fee_sol + feeSol, slip, why, grade, p.opened_at]);
        await d.q(`DELETE FROM mob_aq_positions WHERE id=$1`, [p.id]);
        const cash = Number(await getState(d, "cash_sol", START_SOL)) + back;
        await setState(d, "cash_sol", cash);
        await flow(d, "sell", Number(q.outAmount) / 1e9, "execution", `sell ${p.symbol} (${why})`);
        await flow(d, "fee", -feeSol, "costs", `network fee ${p.symbol}`);
        await flow(d, pnl > 0 ? "win" : "loss", pnl, "review", `${p.symbol} ${pnl > 0 ? "+" : ""}${round(pnlPct, 2)}%`);
        await brain(d, "review", "lesson", `${p.symbol} ${p.strategy}: ${why} at ${round(pnlPct, 2)}% net (round trip at entry ${round(p.rt_pct, 2)}%, exit slippage ${slip ?? "unknown"}%). Process ${grade.split("/")[0]}: ${why === "time stop" ? "time stop is a plan exit but the setup did not move" : "plan followed"}.`, { trade: t.id, pnlPct: round(pnlPct, 3), why });
        out.exits.push({ symbol: p.symbol, why, pnlPct: round(pnlPct, 3) });
        set("ex.stops", "busy", `${p.symbol}: ${why}`);
        set("rv.journal", "busy", `trade #${t.id} journaled`);
        set("rv.lesson", "busy", `lesson from ${p.symbol}`);
      }
      if (!W["ex.stops"]) set("ex.stops", "busy", `${open.length} open position(s) checked`);
    } else set("ex.stops", "idle", "no open positions");

    // ---- Time Machine: replay R3 on stored candles before it may trade (every 30 minutes)
    const lastReplay = await getState(d, "replay_R3", null);
    if (!lastReplay || nowSec - lastReplay.at > 1800) {
      const rows = await d.q(`SELECT pool, t, o, h, l, c FROM mob_aq_candles WHERE t > $1 ORDER BY pool, t`, [Math.floor(nowSec) - 86400]);
      const by = {};
      for (const r of rows) (by[r.pool] ||= []).push({ t: Number(r.t), o: r.o, h: r.h, l: r.l, c: r.c });
      const measured = await d.one(`SELECT avg(rt_pct)::float a, count(*)::int n FROM (SELECT rt_pct FROM mob_aq_positions UNION ALL SELECT (facts->>'rtPct')::float FROM mob_aq_council WHERE facts ? 'rtPct') x WHERE rt_pct IS NOT NULL`);
      const cost = measured?.n ? round(measured.a, 3) : KB_COST_PCT;
      const rp = replay(by, P, cost);
      const v = { at: nowSec, pools: Object.keys(by).length, candles: rows.length, ...rp };
      await setState(d, "replay_R3", v);
      if (rows.length) await brain(d, "council", "finding", `Time Machine R3 replay: ${rp.trades} trades on ${v.pools} pools (${rows.length} candles), mean ${rp.expectancyPct ?? "n/a"}% net of ${cost}% cost, 95% CI ${rp.ci95 ? rp.ci95.join(" to ") : "n/a"}. ${rp.evidence}.`, v);
      set("cn.timemachine", "busy", `replayed ${rp.trades} trades on ${v.pools} pools`);
    } else set("cn.timemachine", "idle", `last replay ${lastReplay.trades} trades, mean ${lastReplay.expectancyPct ?? "n/a"}%`);
    const rpl = await getState(d, "replay_R3", null);

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
    const sv = survival(equity, START_SOL);
    if (sv.stage === "destroyed" && !destroyed) {
      await setState(d, "destroyed", true);
      const tl = await d.one(`SELECT count(*)::int n, coalesce(sum(pnl_sol),0)::float pnl, mode() WITHIN GROUP (ORDER BY reason) worst FROM mob_aq_trades`);
      const rs = await d.q(`SELECT reason, count(*)::int n, round(avg(pnl_pct)::numeric,2)::float avg FROM mob_aq_trades GROUP BY reason ORDER BY n DESC LIMIT 3`);
      await brain(d, "review", "post-mortem", `POST-MORTEM: the island was destroyed at ${round(equity, 4)} SOL (${sv.health}% of ${START_SOL}). ${tl.n} trades, ${round(tl.pnl, 4)} SOL realized. Exits: ${rs.map((x) => `${x.reason} x${x.n} avg ${x.avg}%`).join("; ") || "none"}. Trading stopped until Alex rebuilds.`, { sv, trades: tl.n });
    }
    const dead = destroyed || sv.stage === "destroyed";
    await setState(d, "survival", sv);
    set("rk.exposure", dead ? "blocked" : "busy", `health ${sv.health} (${sv.stage}): size x${sv.sizeMult}, max ${sv.maxOpen} open`);
    let riskBlock = null;
    if (dead) riskBlock = ["island destroyed: only Alex can rebuild", sv.health];
    else if (kill) riskBlock = ["kill switch on", 1];
    else if (pos.length >= Math.min(P.maxOpen, sv.maxOpen)) riskBlock = [sv.maxOpen < P.maxOpen ? `max open positions (${sv.stage})` : "max open positions", pos.length];
    else if (dayPct <= -P.dayStopPct) riskBlock = ["daily stop hit", round(dayPct, 2)];
    else if (streak) riskBlock = ["loss-streak throttle", P.lossStreak];
    set("rk.kill", kill ? "blocked" : "busy", kill ? "KILL SWITCH ON: no new entries" : "kill switch off");
    set("rk.limits", "busy", `${pos.length}/${P.maxOpen} positions open`);
    set("rk.day", dayPct <= -P.dayStopPct ? "blocked" : "busy", `today ${round(dayPct, 2)}% (stop -${P.dayStopPct}%)`);
    set("rk.streak", streak ? "blocked" : "busy", streak ? `${P.lossStreak} losses in a row: paused` : "no loss streak");
    set("rk.dd", "busy", `equity ${round(equity, 4)} SOL vs start ${START_SOL}`);
    set("ex.balance", "busy", `cash ${round(cash, 4)} SOL`);
    set("ex.live", "blocked", "locked: PAPER only, no wallet");

    if (riskBlock) {
      await council(d, "BLOCK", null, `risk: ${riskBlock[0]}`, riskBlock[1]);
      set("cn.veto", "busy", `BLOCK: ${riskBlock[0]}`);
    } else {
      // ---- evaluate up to MAX_EVAL candidates (not held, not judged in the last cooldown)
      const recent = new Set((await d.q(`SELECT DISTINCT mint FROM mob_aq_council WHERE mint IS NOT NULL AND at > now() - make_interval(mins => $1)`, [COOLDOWN_MIN])).map((r) => r.mint));
      const held = new Set(pos.map((p) => p.mint));
      const queue = cands.filter((c) => !recent.has(c.mint) && !held.has(c.mint) && strategies[c.strategy]?.alive).slice(0, MAX_EVAL);
      let jupUsed = false;
      for (const c of queue) {
        const SP = strategies[c.strategy].params;
        const facts = { liqUsd: c.liqUsd, boosted: c.boosted, copycat: c.copycat, gta: c.gta, src: c.src };
        let s = null;
        const block = async (reason, number) => { await council(d, "BLOCK", c, reason, number, facts); out.evaluated.push({ symbol: c.symbol, verdict: "BLOCK", reason, number }); near.push({ c, reason, setup: s, rt: facts.rtPct ?? null }); };
        if (c.liqUsd == null || c.liqUsd < SP.minLiqUsd) { await block("liquidity too low", c.liqUsd); continue; }
        if (c.copycat) { await block("copycat name", c.copies); continue; }
        const rg = await feeds.rug(env, c.mint);
        health.rugcheck = rg.ok;
        const sf = safety(rg.data, SP);
        Object.assign(facts, { safety: rg.data });
        set("cn.safety", rg.ok ? "busy" : "blocked", `${c.symbol}: ${sf.reason}`);
        // candles and whales are read before the safety verdict so a blocked coin still has levels for the shadow lane
        // our own 1-minute candles first (>= 30 bars from the price samples); GeckoTerminal only as a bonus when it answers
        let oh = { ok: false, data: null, src: "own" };
        const own = await ownCandles(d, c.mint);
        if (own.length >= MIN_OWN_BARS) oh = { ok: true, data: own, src: "own" };
        else if (health.geckoterminal) { oh = await feeds.ohlcv(env, c.pool); oh.src = "geckoterminal"; health.geckoterminal_ohlcv = oh.ok; }
        facts.candles = { src: oh.src, ownBars: own.length };
        health.candles = oh.ok || health.candles === true;
        if (oh.ok && oh.data?.length) s = fibSetup(oh.data, SP, nowSec);
        // whales only for coins that pass the gate (keeps GeckoTerminal calls inside its free rate limit)
        const wh = sf.ok ? await whaleSignal(env, c, rg.data, set) : { ok: null, signal: false, reason: "not read: safety failed" };
        if (wh.ok != null) health.whales_trades = wh.ok;
        facts.whale = wh;
        if (!sf.ok) { await block(sf.reason, sf.number); continue; }
        if (!oh.ok || !oh.data?.length) { await block(`missing data: candles (own history ${own.length}/${MIN_OWN_BARS} bars)`, own.length); continue; }
        const keep = oh.src === "own" ? oh.data.slice(0, -1) : oh.data; // the running minute is not stored for the replay
        if (keep.length) await d.q(`INSERT INTO mob_aq_candles (pool, t, o, h, l, c, v) SELECT $1, t, o, h, l, c, v FROM unnest($2::bigint[],$3::float8[],$4::float8[],$5::float8[],$6::float8[],$7::float8[]) x(t,o,h,l,c,v) ON CONFLICT DO NOTHING`,
          [c.pool, keep.map((x) => x.t), keep.map((x) => x.o), keep.map((x) => x.h), keep.map((x) => x.l), keep.map((x) => x.c), keep.map((x) => x.v)]);
        Object.assign(facts, { setup: s });
        set("st.fib", "busy", `${c.symbol}: ${s.why}`);
        set("st.swing", "busy", `${c.symbol}: impulse ${s.impulsePct ?? "?"}%`);
        if (s.staleSec > SP.staleSec) { await block("stale data", s.staleSec); continue; }
        if (!s.signal) { await block(`no signal: ${s.why}`, s.number); continue; }
        set("st.stop", "busy", `${c.symbol}: stop ${s.stopPct}%`); set("st.target", "busy", `${c.symbol}: target ${s.targetPct}%`);
        if (s.stopPct >= s.targetPct) { await block("stop > target", round(s.stopPct / s.targetPct, 3)); continue; }
        if (!rpl || rpl.at == null) { await block("time machine: no replay yet", null); continue; }
        if (rpl.n >= 30 && rpl.ci95 && rpl.ci95[1] < 0) { await block("time machine: replay loses", rpl.expectancyPct); continue; }
        if (!feeSol) { await block("missing data: SOL price", null); continue; }
        if (jupUsed) { out.evaluated.push({ symbol: c.symbol, verdict: "WAIT", reason: "one quote pair per tick" }); continue; }
        // size on a first stressed estimate with the KB cost, then measure the real round trip at that size
        const est = sizeFor(equity, cash, s.stopPct, KB_COST_PCT, { ...SP, maxSizeSol: SP.maxSizeSol * sv.sizeMult, riskPct: SP.riskPct * sv.sizeMult });
        set("st.stress", "busy", `${c.symbol}: stressed ${est.stressedPct}% -> ${est.sizeSol} SOL`);
        if (est.sizeSol < SP.minSizeSol) { await block("size too small", est.sizeSol); continue; }
        jupUsed = true;
        const lamports = Math.floor(est.sizeSol * 1e9);
        const buy = await jupQuote(SOL_MINT, c.mint, lamports);
        if (buy) await sleep(gap);
        const sell = buy ? await jupQuote(c.mint, SOL_MINT, buy.outAmount) : null;
        health.jupiter = !!(buy && sell);
        set("co.jup", buy && sell ? "busy" : "blocked", buy && sell ? `${c.symbol}: quoted ${est.sizeSol} SOL round trip` : `${c.symbol}: no quote (honeypot or venue down)`);
        if (!buy || !sell) { await block("missing data: Jupiter quote", null); continue; }
        const rt = roundTripPct(est.sizeSol, Number(sell.outAmount) / 1e9, feeSol);
        Object.assign(facts, { rtPct: rt, sizeSol: est.sizeSol });
        const mult = rt > 0 ? round(s.targetPct / rt, 2) : null;
        set("co.gate", "busy", `${c.symbol}: target ${s.targetPct}% vs round trip ${rt}% = ${mult ?? "inf"}x`);
        set("co.breakeven", "busy", `${c.symbol}: break-even win rate ${round(((s.stopPct + rt) / (s.targetPct + s.stopPct)) * 100, 1)}%`);
        if (rt > 0 && s.targetPct < SP.costMultiple * rt) { await block("cost gate", mult); continue; }
        const fin = sizeFor(equity, cash, s.stopPct, Math.max(rt, 0), { ...SP, maxSizeSol: SP.maxSizeSol * sv.sizeMult, riskPct: SP.riskPct * sv.sizeMult });
        const size = Math.min(fin.sizeSol, est.sizeSol); // never above the size we actually quoted
        // ---- PASS -> Hermes paper fill at the measured quote
        const tokensUi = Number(buy.outAmount) / 10 ** rg.data.decimals;
        const tokensRaw = size === est.sizeSol ? buy.outAmount : String(Math.floor(Number(buy.outAmount) * (size / est.sizeSol)));
        const entryPx = solUsd * est.sizeSol / tokensUi;
        const slip = c.priceUsd ? round((entryPx / c.priceUsd - 1) * 100, 3) : null;
        await council(d, "PASS", c, "all gates pass", mult, facts);
        const p = await d.one(`INSERT INTO mob_aq_positions (strategy, mint, pool, symbol, decimals, tokens_raw, size_sol, fee_sol, entry_price_usd, entry_mid_usd, stop_price, target_price, stop_pct, target_pct, rt_pct, buy_slip_pct, time_stop_at, last_price_usd, last_value_sol)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, to_timestamp($17), $10, $7) RETURNING id`,
          [c.strategy, c.mint, c.pool, c.symbol, rg.data.decimals, tokensRaw, size, feeSol, entryPx, c.priceUsd, s.stopPrice, s.targetPrice, s.stopPct, s.targetPct, rt, slip, nowSec + SP.timeStopMin * 60]);
        await setState(d, "cash_sol", cash - size - feeSol);
        await flow(d, "buy", -size, "execution", `buy ${c.symbol} (${c.strategy})`);
        await flow(d, "fee", -feeSol, "costs", `network fee ${c.symbol}`);
        out.entered = { id: p.id, symbol: c.symbol, sizeSol: size, rtPct: rt, stopPct: s.stopPct, targetPct: s.targetPct };
        out.evaluated.push({ symbol: c.symbol, verdict: "PASS", reason: "all gates pass", number: mult });
        set("ex.paper", "busy", `bought ${size} SOL of ${c.symbol} (paper)`); set("ex.caps", "busy", `cap ${SP.maxSizeSol} SOL respected`);
      }
      set("cn.veto", out.evaluated.length ? "busy" : "idle", out.evaluated.length ? `${out.evaluated.filter((e) => e.verdict === "BLOCK").length} BLOCK, ${out.evaluated.filter((e) => e.verdict === "PASS").length} PASS` : "nothing new to judge");
      set("cn.adversary", out.evaluated.length ? "busy" : "idle", out.evaluated[0] ? `${out.evaluated[0].symbol}: ${out.evaluated[0].reason}` : "waiting");
    }
    if (!W["ex.paper"]) set("ex.paper", "idle", "no PASS this tick");
    // ---- never idle: shadow lane (paper probes on near misses, own ledger, never mixed into the real one)
    out.survival = sv;
    // ---- helper lanes (second brains): judged by the same Council for the record, paper-tracked apart, never the real ledger
    out.lanes = await lanesTick(env, { halted: dead || kill, nowSec, gap, feeSol, P, set, council: (v, c, reason, number, facts) => council(d, v, c, reason, number, facts) });
    out.shadow = dead ? { opened: null, closed: [] } : await shadowTick(env, { kill, entered: !!out.entered, near, solUsd, nowSec, set, P });

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
      scouts_sol: !!(health.dexscreener || health.geckoterminal) && trendingNow.length > 0, scouts_stocks: !!health.sol_price, news: !!health.feargreed,
      setups: bars.n > 0 || health.geckoterminal_ohlcv === true, costs: health.jupiter !== false, council: health.rugcheck !== false,
      whales: health.whales_trades === true, risk: true, execution: health.dexscreener_prices !== false && health.jupiter !== false, review: true, learning: true, ops: true,
    };
    await d.q(`UPDATE mob_aq_depts d SET live=x.l, last_run_at=now() FROM unnest($1::text[], $2::bool[]) x(id, l) WHERE d.id=x.id`, [Object.keys(live), Object.values(live)]);
    const keys = Object.keys(W);
    await d.q(`UPDATE mob_aq_bots b SET status=x.s, note=x.n, last_run_at=now() FROM unnest($1::text[],$2::text[],$3::text[]) x(k,s,n) WHERE b.key=x.k`, [keys, keys.map((k) => W[k][0]), keys.map((k) => W[k][1])]);
    await setState(d, "health", health);
    await setState(d, "last_tick", { at: new Date(nowSec * 1000).toISOString(), evaluated: out.evaluated.length, entered: !!out.entered, exits: out.exits.length });
    // a short finding every 30 minutes: why the Council said no
    const lastF = await d.one(`SELECT at FROM mob_aq_brain WHERE dept='council' AND kind='summary' ORDER BY id DESC LIMIT 1`);
    if (!lastF || nowSec * 1000 - new Date(lastF.at).getTime() > 1800000) {
      const rs = await d.q(`SELECT reason, count(*)::int n FROM mob_aq_council WHERE at > now() - interval '30 minutes' GROUP BY reason ORDER BY n DESC LIMIT 3`);
      if (rs.length) await brain(d, "council", "summary", `Last 30 min verdicts: ${rs.map((r) => `${r.reason} x${r.n}`).join("; ")}.`);
    }
    return out;
  } finally {
    await d.q(`UPDATE mob_aq_state SET v='false', at=now() WHERE k='tick_lock'`);
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

export async function briefing(env) {
  await ensureSeed(env);
  const s = await buildState(env);
  const d = db(env);
  const P = (await d.one(`SELECT params FROM mob_aq_strategies WHERE id='R3'`))?.params || {};
  const rts = await d.q(`SELECT symbol, (facts->>'rtPct')::float rt FROM mob_aq_council WHERE facts ? 'rtPct' AND at > now() - interval '1 day' ORDER BY id DESC LIMIT 5`);
  const y = await d.q(`SELECT text FROM mob_aq_brain WHERE dept='review' AND kind='lesson' AND at > now() - interval '2 days' ORDER BY id DESC LIMIT 3`);
  const t = s.trades, m = s.market;
  const f = (v, suf = "") => (v == null ? "unknown" : `${v}${suf}`);
  return [
    `AQUARIUS DESK BRIEFING ${new Date().toISOString().slice(0, 10)}`,
    `- Mode: ${s.mode === "PAPER" ? "PAPER" : "LIVE-LOCKED"}. Budget: ${f(round(s.equitySol, 4))} SOL paper equity (start ${s.startSol}). Limits: risk ${f(P.riskPct, "%")} per trade on the stressed stop, daily stop -${f(P.dayStopPct, "%")}, max ${f(P.maxOpen)} positions, ${f(P.maxSizeSol)} SOL per click, target >= ${f(P.costMultiple)}x round trip. Kill switch: ${s.killSwitch ? "ON" : "off"}.`,
    `- Free market context: Fear and Greed ${m.fearGreed ? `${m.fearGreed.value} (${m.fearGreed.label})` : "unknown"}; SOL ${m.sol ? `$${m.sol.price}` : "unknown"}; BTC ${m.btc ? `$${m.btc.price}` : "unknown"}. Trending: ${m.trending.slice(0, 8).map((x) => `${x.symbol}${x.boosted ? " (PAID BOOST)" : ""}`).join(", ") || "unknown"}. Top headlines: none in the engine.`,
    `- Measured costs today (Jupiter round trip): ${rts.length ? rts.map((r) => `${r.symbol} ${round(r.rt, 2)}%`).join(", ") : "none measured yet"}.`,
    `- Open positions: ${s.positions.length ? s.positions.map((p) => `${p.symbol} ${f(p.pnlPct, "%")}`).join(", ") : "none"}. Ledger: ${t.n} trades, win rate ${t.winRate == null ? "n/a" : round(t.winRate * 100, 1) + "%"}, expectancy ${f(t.expectancyPct, "%")}, 95% interval ${t.ci95 ? t.ci95.join(" to ") : "n/a"}: ${t.evidence}.`,
    `- Yesterday's journal and the one lesson: ${y.length ? y.map((r) => r.text).join(" | ") : "no closed trades yet"}.`,
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
    d.q(`SELECT verdict, symbol, reason, number, at FROM mob_aq_council ORDER BY id DESC LIMIT 50`),
    d.q(`SELECT * FROM mob_aq_depts`),
    d.q(`SELECT id, key, dept, name, job, status, note, skills, power, approved, created_by FROM mob_aq_bots WHERE approved=true ORDER BY id`),
    d.q(`SELECT at, dept, text FROM mob_aq_brain ORDER BY id DESC LIMIT 30`),
    d.q(`SELECT * FROM mob_aq_strategies ORDER BY id`),
    d.q(`SELECT * FROM mob_aq_tools ORDER BY name`),
    d.q(`SELECT from_helper, max(at) at FROM mob_aq_helpers GROUP BY from_helper`),
    d.q(`SELECT at, dept, text, labels, weight FROM mob_aq_helpers WHERE channel='x' AND from_helper='grok' ORDER BY id DESC LIMIT 30`),
    d.q(`SELECT k, data, ok, err, at FROM mob_aq_market WHERE k IN ('trending','ds:boosts','cg:majors','fng') OR (ok=false AND at > now() - interval '1 hour')`),
  ]);
  const S = Object.fromEntries(st.map((r) => [r.k, r.v]));
  const hist = await d.one(`SELECT coalesce(sum(n),0)::int n, count(*)::int m, count(*) FILTER (WHERE n >= $1)::int ready FROM (SELECT mint, count(DISTINCT date_trunc('minute', at))::int n FROM mob_aq_prices WHERE at > now() - interval '1 hour' GROUP BY mint) x`, [MIN_OWN_BARS]);
  const M = Object.fromEntries(mkt.map((r) => [r.k, r.ok ? r.data : null]));
  const cash = Number(S.cash_sol ?? START_SOL);
  const equity = cash + pos.reduce((a, p) => a + (p.last_value_sol ?? p.size_sol), 0);
  const startDay = new Date(); startDay.setUTCHours(0, 0, 0, 0);
  const realizedToday = trd.filter((t) => new Date(t.closed_at) >= startDay).reduce((a, t) => a + t.pnl_sol, 0);
  const unreal = pos.reduce((a, p) => a + ((p.last_value_sol ?? p.size_sol) - p.size_sol - p.fee_sol), 0);
  const s = stats(trd.map((t) => t.pnl_pct));
  const boosted = new Set(M["ds:boosts"] || []);
  const v = (r) => (r ? { verdict: r.verdict, symbol: r.symbol, reason: r.reason, number: r.number, at: r.at } : null);
  const recent = [
    ...trd.slice(0, 20).map((t) => ({ id: `s${t.id}`, symbol: t.symbol, side: "sell", sizeSol: t.size_sol, pnlSol: round(t.pnl_sol, 9), reason: t.reason, at: t.closed_at })),
    ...trd.slice(0, 20).map((t) => ({ id: `b${t.position_id}`, symbol: t.symbol, side: "buy", sizeSol: t.size_sol, pnlSol: null, reason: t.strategy, at: t.opened_at })),
    ...pos.map((p) => ({ id: `b${p.id}`, symbol: p.symbol, side: "buy", sizeSol: p.size_sol, pnlSol: null, reason: p.strategy, at: p.opened_at })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 20);
  const hl = Object.fromEntries(helpers.map((r) => [r.from_helper, r.at]));
  const conn = (k) => (hl[k] && Date.now() - new Date(hl[k]).getTime() < 86400000 ? "connected" : "not connected");
  return {
    build: AQ_BUILD, mode: S.mode === "LIVE" ? "LIVE" : "PAPER", killSwitch: S.kill === true, updatedAt: S.last_tick?.at || null,
    equitySol: round(equity, 9), startSol: START_SOL, pnlTodaySol: round(realizedToday + unreal, 9), pnlTotalSol: round(equity - START_SOL, 9),
    trades: { n: s.n, wins: s.wins, winRate: s.winRate, expectancyPct: s.expectancyPct, ci95: s.ci95, evidence: s.evidence },
    positions: pos.map((p) => ({ id: p.id, symbol: p.symbol, mint: p.mint, entryPrice: p.entry_price_usd, price: p.last_price_usd, stopPct: p.stop_pct, targetPct: p.target_pct,
      sizeSol: p.size_sol, openedAt: p.opened_at, pnlPct: p.last_value_sol == null ? null : round(((p.last_value_sol - p.size_sol - p.fee_sol) / (p.size_sol + p.fee_sol)) * 100, 3), strategy: p.strategy })),
    recent,
    flows: flows.map((f) => ({ id: Number(f.id), kind: f.kind, sol: f.sol, dept: f.dept, label: f.label, at: f.at })),
    council: { last: v(cn[0]), vetoes: cn.filter((r) => r.verdict === "BLOCK").slice(0, 10).map(v) },
    departments: DEPTS.map(([id]) => {
      const x = depts.find((q) => q.id === id) || {};
      return { id, name: x.name, god: x.god || null, live: !!x.live, lastRunAt: x.last_run_at || null, skills: x.skills || [],
        workers: bots.filter((b) => b.dept === id).map((b) => ({ id: b.id, name: b.name, job: b.job, status: b.status, note: b.note, skills: b.skills, power: b.power, by: b.created_by })) };
    }),
    ceo: CEO,
    market: { sol: M["cg:majors"]?.sol ?? null, btc: M["cg:majors"]?.btc ?? null, fearGreed: M.fng ?? null,
      trending: (M.trending || []).slice(0, 12).map((p) => ({ symbol: p.symbol, ch1h: p.ch1h, liqUsd: p.liqUsd, boosted: boosted.has(p.mint) })) },
    brain: brainRows.map((r) => ({ at: r.at, dept: r.dept, text: r.text })),
    strategies: strat.map((r) => ({ id: r.id, name: r.name, trades: r.stats?.n ?? 0, pnlSol: r.stats?.pnlSol ?? 0, alive: r.alive, status: r.status, market: r.market })),
    tools: tools.map((t) => ({ name: t.name, licence: t.licence, verdict: t.verdict, status: t.status, usedBy: t.used_by, bestUse: t.best_use })),
    replay: S.replay_R3 ? { trades: S.replay_R3.trades, expectancyPct: S.replay_R3.expectancyPct, ci95: S.replay_R3.ci95, costPct: S.replay_R3.costPct, evidence: S.replay_R3.evidence } : null,
    health: { ...(S.health || {}), errors: mkt.filter((r) => !r.ok).slice(0, 12).map((r) => ({ feed: r.k, error: r.err, at: r.at })) },
    history: { priceSamples1h: hist.n, coins: hist.m, barsNeeded: MIN_OWN_BARS, ready: hist.ready },
    shadow: await shadowStats(d),
    lanes: await laneStats(d, { n: s.n, winRate: s.winRate, expectancyPct: s.expectancyPct, open: pos.length }),
    survival: (() => { const sv = survival(equity, START_SOL); return { health: sv.health, stage: S.destroyed === true ? "destroyed" : sv.stage, sizeMult: S.destroyed === true ? 0 : sv.sizeMult, maxOpen: S.destroyed === true ? 0 : sv.maxOpen }; })(),
    helpers: { grok: conn("grok"), chatgpt: conn("chatgpt"), grokLastAt: hl.grok || null, chatgptLastAt: hl.chatgpt || null },
    xfeed: xs.map((r) => ({ at: r.at, section: r.dept, text: r.text, label: (r.labels || [])[0] || "CLAIMED", source: "grok", weight: r.weight })),
  };
}

// Only Alex (admin session) rebuilds a destroyed island: new paper wallet, brain memory kept.
export async function rebuild(env) {
  await ensureSeed(env);
  const d = db(env);
  const n = (await d.one(`SELECT count(*)::int n FROM mob_aq_positions`)).n;
  await d.q(`DELETE FROM mob_aq_positions`);
  await setState(d, "cash_sol", START_SOL);
  await setState(d, "destroyed", false);
  await brain(d, "ops", "event", `Alex rebuilt the island: paper wallet reset to ${START_SOL} SOL (${n} open position(s) written off). The brain keeps everything it learned.`);
  return { rebuilt: true, equitySol: START_SOL };
}

// Alex's "sell all": every open paper position is sold at the live Jupiter sell quote (minus the network fee), every
// shadow probe is closed at the live mid minus its cost. No quote / no price = that one stays open (never a made-up fill).
// Live path note: swaps would go through Jupiter and be signed in Alex's own wallet on the page; the server never holds a key.
export async function sellAll(env, opts = {}) {
  await ensureSeed(env);
  const d = db(env), gap = opts.gapMs ?? Number(env.AQ_JUP_GAP_MS ?? 1100), why = "CEO sell all";
  const mj = await feeds.majors(env);
  const solUsd = mj.data?.sol?.price ?? null, feeSol = solUsd ? NET_FEE_USD / solUsd : null;
  const out = { sold: [], kept: [], shadowClosed: [] };
  const open = await d.q(`SELECT * FROM mob_aq_positions ORDER BY id`);
  for (const [i, p] of open.entries()) {
    if (i) await sleep(gap);
    const q = feeSol ? await jupQuote(p.mint, SOL_MINT, p.tokens_raw) : null;
    if (!q) { out.kept.push({ symbol: p.symbol, reason: feeSol ? "no sell quote" : "no SOL price" }); continue; }
    const gross = Number(q.outAmount) / 1e9, back = gross - feeSol, cost = p.size_sol + p.fee_sol, pnl = back - cost, pnlPct = (pnl / cost) * 100;
    const exitPx = (gross * solUsd) / (Number(p.tokens_raw) / 10 ** p.decimals);
    const slip = p.last_price_usd ? round((p.last_price_usd / exitPx - 1) * 100, 3) : null;
    await d.q(`INSERT INTO mob_aq_trades (position_id, strategy, mint, symbol, size_sol, back_sol, entry_price_usd, exit_price_usd, pnl_sol, pnl_pct, fees_sol, slippage_pct, reason, grade, opened_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, [p.id, p.strategy, p.mint, p.symbol, p.size_sol, back, p.entry_price_usd, exitPx, pnl, round(pnlPct, 3), p.fee_sol + feeSol, slip, why, "CEO/" + (pnl > 0 ? "win" : "loss"), p.opened_at]);
    await d.q(`DELETE FROM mob_aq_positions WHERE id=$1`, [p.id]);
    await setState(d, "cash_sol", Number(await getState(d, "cash_sol", START_SOL)) + back);
    await flow(d, "sell", gross, "execution", `sell ${p.symbol} (${why})`);
    await flow(d, "fee", -feeSol, "costs", `network fee ${p.symbol}`);
    await flow(d, pnl > 0 ? "win" : "loss", pnl, "review", `${p.symbol} ${pnl > 0 ? "+" : ""}${round(pnlPct, 2)}%`);
    out.sold.push({ symbol: p.symbol, pnlPct: round(pnlPct, 3), backSol: round(back, 9) });
  }
  const sh = await d.q(`SELECT * FROM mob_aq_shadow WHERE closed_at IS NULL`);
  if (sh.length) {
    let mids = {};
    try { mids = await midPrices(sh.map((s) => ({ mint: s.mint, pool: s.pool }))); } catch {}
    for (const s of sh) {
      const mid = mids[s.mint];
      if (mid == null) { out.kept.push({ symbol: s.symbol, reason: "SHADOW: no price" }); continue; }
      const pnl = round(((mid - s.entry_price) / s.entry_price) * 100 - s.cost_pct, 3);
      await d.q(`UPDATE mob_aq_shadow SET closed_at=now(), exit_price=$2, pnl_pct=$3, outcome=$4 WHERE id=$1`, [s.id, mid, pnl, why]);
      out.shadowClosed.push({ symbol: s.symbol, pnlPct: pnl });
    }
  }
  await brain(d, "execution", "event", `${why}: sold ${out.sold.length} paper position(s) (${out.sold.map((x) => `${x.symbol} ${x.pnlPct}%`).join(", ") || "none"}), closed ${out.shadowClosed.length} shadow probe(s)${out.kept.length ? `, kept ${out.kept.length} with no live price` : ""}.`, out);
  return out;
}
