// Whales and the shadow lane (aquarius-trader skill).
// Whale book: swaps come from Jupiter's data API (datapi.jup.ag/v1/txs/<mint>, paged back in time; answers from the Worker).
// Every swap goes into mob_aq_wtrades; mob_aq_whales keeps each wallet's realized result per coin. A WINNER sold at least
// two different coins for more SOL than it paid, is net positive, wins >= 60% of its closed coins, and is not a bot
// (bots: more than BOT_TRADES swaps in the book per coin on average). Whale signal = 2+ INDEPENDENT winners bought the coin
// in the last 15 minutes; the creator and RugCheck insiders never count; wallets with one funder count once.
// Funders come from Helius RPC (HELIUS_API_KEY, https://mainnet.helius-rpc.com/?api-key=..., 1 credit per call, capped per tick).
// Shadow lane: when nothing passes, paper probes on near misses, own ledger, never mixed into the real one.
import { db } from "../db.mjs";
import { cached, SOL_MINT, midPrices, jupTxs, CALLS, CAPS } from "./feeds.mjs";
import { stats, round, num } from "./logic.mjs";

export const HELIUS_URL = (key) => `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`;
const KB_COST_PCT = 5;
export const BOT_TRADES = 60, MINE_PAGES_PER_TICK = 6, MINE_MAX_PAGES = 60, MIN_SOL = 0.02;

async function rpc(env, method, params) {
  CALLS.helius++;
  const r = await fetch(HELIUS_URL(env.HELIUS_API_KEY), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  if (!r.ok) throw new Error(`helius ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "rpc error");
  return j.result;
}
// Funder = who sent the wallet its first money (first transaction in its history). Null when the history is longer than one page.
export async function funderOf(env, wallet) {
  const sigs = await rpc(env, "getSignaturesForAddress", [wallet, { limit: 1000 }]);
  if (!Array.isArray(sigs) || !sigs.length || sigs.length >= 1000) return null;
  const tx = await rpc(env, "getTransaction", [sigs[sigs.length - 1].signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
  const ins = tx?.transaction?.message?.instructions || [];
  const sys = ins.find((i) => i.program === "system" && i.parsed?.type === "transfer" && i.parsed.info?.destination === wallet);
  if (sys) return sys.parsed.info.source;
  const ata = ins.find((i) => i.program === "spl-associated-token-account" && i.parsed?.info?.wallet === wallet);
  const tok = ins.find((i) => i.program === "spl-token" && /^transfer/.test(i.parsed?.type || "") && (!ata || i.parsed.info?.destination === ata.parsed.info.account));
  if (tok?.parsed?.info?.authority && tok.parsed.info.authority !== wallet) return tok.parsed.info.authority;
  const payer = tx?.transaction?.message?.accountKeys?.[0];
  const p = typeof payer === "string" ? payer : payer?.pubkey;
  return p && p !== wallet ? p : null;
}

export async function saveTrades(d, mint, txs) {
  const t = txs.filter((x) => x.sol >= MIN_SOL);
  if (!t.length) return 0;
  const r = await d.q(`INSERT INTO mob_aq_wtrades (tx, wallet, mint, kind, sol, at) SELECT tx, w, $1, k, s, at::timestamptz FROM unnest($2::text[],$3::text[],$4::text[],$5::float8[],$6::text[]) x(tx,w,k,s,at) ON CONFLICT DO NOTHING RETURNING 1`,
    [mint, t.map((x) => x.tx), t.map((x) => x.wallet), t.map((x) => x.kind), t.map((x) => x.sol), t.map((x) => x.at)]);
  return r.length;
}
// Recompute the book from raw swaps: realized result per wallet per coin, then winners. One statement, idempotent.
export async function refreshWinners(d) {
  await d.q(`INSERT INTO mob_aq_whales (wallet, wins, closed, net_sol, winner, updated_at)
    SELECT wallet, wins, closed, net, (wins >= 2 AND net > 0 AND wins::float / closed >= 0.6 AND swaps::float / coins <= $1), now() FROM (
      SELECT wallet, count(*) FILTER (WHERE b > 0 AND s > b)::int wins, count(*) FILTER (WHERE b > 0 AND s > 0)::int closed, coalesce(sum(s - b) FILTER (WHERE b > 0 AND s > 0), 0)::float net, sum(n)::int swaps, count(*)::int coins FROM (
        SELECT wallet, mint, coalesce(sum(sol) FILTER (WHERE kind='buy'), 0) b, coalesce(sum(sol) FILTER (WHERE kind='sell'), 0) s, count(*) n FROM mob_aq_wtrades GROUP BY wallet, mint) x
      GROUP BY wallet HAVING count(*) FILTER (WHERE b > 0 AND s > 0) > 0) y
    ON CONFLICT (wallet) DO UPDATE SET wins=EXCLUDED.wins, closed=EXCLUDED.closed, net_sol=EXCLUDED.net_sol, winner=EXCLUDED.winner, updated_at=now()`, [BOT_TRADES]);
  return d.one(`SELECT count(*)::int book, count(*) FILTER (WHERE winner)::int winners FROM mob_aq_whales`);
}

// Mining: walk a coin's swaps back in time, a few pages per tick, cursor kept in the database so it resumes next tick.
export async function mineTick(env, { runners = [], pages = MINE_PAGES_PER_TICK, set = () => {} } = {}) {
  const d = db(env), res = { pages: 0, trades: 0, coins: [] };
  const { active } = await d.one(`SELECT count(*)::int active FROM mob_aq_mined WHERE NOT done`);
  if (active < 3 && runners.length) {
    const add = runners.slice(0, 6);
    await d.q(`INSERT INTO mob_aq_mined (mint, symbol, why) SELECT * FROM unnest($1::text[],$2::text[],$3::text[]) ON CONFLICT (mint) DO NOTHING`, [add.map((r) => r.mint), add.map((r) => r.symbol), add.map((r) => r.why)]);
  }
  while (res.pages < pages && CALLS.jupiterData < CAPS.jupiterData) {
    const m = await d.one(`SELECT * FROM mob_aq_mined WHERE NOT done ORDER BY updated_at LIMIT 1`);
    if (!m) break;
    let pg;
    try { pg = await jupTxs(m.mint, m.cursor_offset ? { offset: m.cursor_offset, ts: m.cursor_ts } : null); } catch (e) { res.error = String(e.message || e).slice(0, 120); break; }
    res.pages++;
    const n = await saveTrades(d, m.mint, pg.txs);
    res.trades += n;
    const done = !pg.next || pg.n === 0 || m.pages + 1 >= MINE_MAX_PAGES || (pg.oldest && Date.now() - Date.parse(pg.oldest) > 3 * 86400000);
    await d.q(`UPDATE mob_aq_mined SET cursor_offset=$2, cursor_ts=$3, pages=pages+1, trades=trades+$4, done=$5, oldest=$6, updated_at=now() WHERE mint=$1`, [m.mint, pg.next?.offset || m.cursor_offset, pg.next?.ts || m.cursor_ts, n, done, pg.oldest]);
    if (!res.coins.includes(m.symbol)) res.coins.push(m.symbol);
  }
  if (res.pages) Object.assign(res, await refreshWinners(d));
  set("wh.discover", res.pages ? "busy" : "idle", res.pages ? `mined ${res.pages} page(s), ${res.trades} new swaps from ${res.coins.join(", ")}` : res.error ? `mining stopped: ${res.error}` : "nothing to mine this tick");
  return res;
}

export async function whaleSignal(env, c, rug, set) {
  const d = db(env);
  const tr = await cached(env, `jup:txs:${c.mint}`, 50, async () => (await jupTxs(c.mint)).txs, 120);
  if (!tr.ok) { set("wh.steady", "blocked", `swaps feed failed: ${tr.err}`.slice(0, 190)); return { ok: false, signal: false, reason: "missing data: swaps" }; }
  const t = tr.data;
  await saveTrades(d, c.mint, t);
  await d.q(`DELETE FROM mob_aq_wtrades WHERE at < now() - interval '14 days'`);
  const excluded = new Set([rug?.creator, c.dev, ...(rug?.insiders || [])].filter(Boolean));
  const buyers = [...new Set(t.filter((x) => x.kind === "buy" && Date.now() - Date.parse(x.at) < 15 * 60000).map((x) => x.wallet))].filter((w) => !excluded.has(w));
  const winners = buyers.length ? await d.q(`SELECT wallet, wins, closed, net_sol FROM mob_aq_whales WHERE winner AND wallet = ANY($1)`, [buyers]) : [];
  let checked = 0, unchecked = 0;
  const groups = new Set();
  for (const w of winners) {
    let f = null, known = false;
    const row = await d.one(`SELECT funder FROM mob_aq_funders WHERE wallet=$1`, [w.wallet]);
    if (row) { f = row.funder; known = true; }
    else if (env.HELIUS_API_KEY && CALLS.helius + 2 <= CAPS.helius) {
      try { f = await funderOf(env, w.wallet); known = true; await d.q(`INSERT INTO mob_aq_funders (wallet, funder, source) VALUES ($1,$2,'helius') ON CONFLICT (wallet) DO UPDATE SET funder=EXCLUDED.funder, checked_at=now()`, [w.wallet, f]); } catch { f = null; }
    }
    known ? checked++ : unchecked++;
    groups.add(f || w.wallet);
  }
  const { book, win } = await d.one(`SELECT count(*)::int book, count(*) FILTER (WHERE winner)::int win FROM mob_aq_whales`);
  const funders = !winners.length ? "none needed" : unchecked === 0 ? "checked (helius)" : checked ? `partly checked (${checked}/${winners.length}, Helius budget)` : env.HELIUS_API_KEY ? "unchecked (Helius budget used this tick)" : "unchecked (no HELIUS_API_KEY)";
  const out = { ok: true, signal: groups.size >= 2, independent: groups.size, winners: winners.length, wallets: winners.map((w) => w.wallet), buyers15m: buyers.length, excluded: excluded.size, funders, book, winnersInBook: win };
  set("wh.steady", "busy", `${book} wallets scored, ${win} winners; ${winners.length} of them bought ${c.symbol} in 15 min`);
  set("wh.funders", checked ? "busy" : "idle", winners.length ? `${groups.size} independent group(s); funders ${funders}` : "no winners to cluster this tick");
  set("wh.pnl", "busy", `wallet results recomputed from raw swaps (${t.length} of ${c.symbol})`);
  set("sol.dev", "busy", `${c.symbol}: ${excluded.size} creator/insider wallet(s) excluded`);
  set("wh.gmgn", out.signal ? "busy" : "idle", out.signal ? `WHALE SIGNAL ${c.symbol}: ${groups.size} independent winners buying` : "no GMGN key; our own whale book instead");
  if (out.signal) {
    const dup = await d.one(`SELECT 1 FROM mob_aq_signals WHERE mint=$1 AND at > now() - interval '30 minutes'`, [c.mint]);
    if (!dup) await d.q(`INSERT INTO mob_aq_signals (mint, symbol, wallets, independent, funders, price_usd) VALUES ($1,$2,$3,$4,$5,$6)`, [c.mint, c.symbol, JSON.stringify(out.wallets), groups.size, funders, c.priceUsd ?? null]);
  }
  return out;
}
// What happened after each whale signal: price 15 and 60 minutes later, then a lesson. Prices come from the tick's Jupiter call.
export async function followSignals(env, priceOf) {
  const d = db(env);
  const open = await d.q(`SELECT * FROM mob_aq_signals WHERE price_usd IS NOT NULL AND pct_60m IS NULL AND at > now() - interval '3 hours' ORDER BY id LIMIT 20`);
  for (const s of open) {
    const px = priceOf(s.mint), age = (Date.now() - new Date(s.at).getTime()) / 60000;
    if (px == null) continue;
    const pct = round((px / s.price_usd - 1) * 100, 2);
    if (age >= 15 && s.pct_15m == null) await d.q(`UPDATE mob_aq_signals SET price_15m=$2, pct_15m=$3 WHERE id=$1`, [s.id, px, pct]);
    if (age >= 60) {
      await d.q(`UPDATE mob_aq_signals SET price_60m=$2, pct_60m=$3 WHERE id=$1`, [s.id, px, pct]);
      await d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ('whales','signal',$1,$2)`, [`Whale signal on ${s.symbol} (${s.independent} independent winners, funders ${s.funders}): ${s.pct_15m ?? "n/a"}% after 15 min, ${pct}% after 60 min. Council verdict then: ${s.verdict || "none"}${s.reason ? ` (${s.reason})` : ""}.`, JSON.stringify({ signal: s.id, pct15: s.pct_15m, pct60: pct })]);
    }
  }
  return open.map((s) => s.mint);
}
export async function whaleState(d) {
  const [b, m, sg, top] = await Promise.all([
    d.one(`SELECT count(*)::int book, count(*) FILTER (WHERE winner)::int winners FROM mob_aq_whales`),
    d.one(`SELECT count(*)::int coins, count(*) FILTER (WHERE done)::int done, coalesce(sum(trades),0)::int swaps FROM mob_aq_mined`),
    d.q(`SELECT symbol, at, independent, funders, verdict, reason, pct_15m, pct_60m FROM mob_aq_signals ORDER BY id DESC LIMIT 10`),
    d.q(`SELECT wallet, wins, closed, net_sol FROM mob_aq_whales WHERE winner ORDER BY wins DESC, net_sol DESC LIMIT 10`),
  ]);
  return { book: b.book, winners: b.winners, mining: m, signals: sg.map((s) => ({ symbol: s.symbol, at: s.at, independent: s.independent, funders: s.funders, verdict: s.verdict, reason: s.reason, pct15m: s.pct_15m, pct60m: s.pct_60m })),
    top: top.map((w) => ({ wallet: `${w.wallet.slice(0, 4)}…${w.wallet.slice(-4)}`, wins: w.wins, closed: w.closed, netSol: round(w.net_sol, 3) })) };
}

// ------------------------------------------------------------------ shadow lane
const NEAR_RANK = ["cost gate", "stop > target", "time machine", "no signal", "safety", "stale data", "liquidity too low"];
const rank = (reason) => { const i = NEAR_RANK.findIndex((r) => reason.startsWith(r)); return i < 0 ? 99 : i; };

export async function shadowTick(env, { kill, entered, near, solUsd, nowSec, set, P }) {
  const d = db(env);
  const res = { opened: null, closed: [] };
  const open = await d.q(`SELECT * FROM mob_aq_shadow WHERE closed_at IS NULL ORDER BY id`);
  if (open.length) {
    let mids = null;
    try { mids = await midPrices(open.map((s) => ({ mint: s.mint, pool: s.pool }))); } catch { mids = null; }
    for (const s of open) {
      const mid = mids?.[s.mint] ?? null;
      if (mid == null) continue;
      const why = mid <= s.stop_price ? "stop" : mid >= s.target_price ? "target" : nowSec * 1000 >= new Date(s.time_stop_at).getTime() ? "time stop" : null;
      if (!why) continue;
      // fill at the level that was hit (stop/target) or the mid (time stop), then subtract the round-trip cost
      const px = why === "stop" ? Math.min(mid, s.stop_price) : why === "target" ? s.target_price : mid;
      const pnl = round(((px - s.entry_price) / s.entry_price) * 100 - s.cost_pct, 3);
      await d.q(`UPDATE mob_aq_shadow SET closed_at=now(), exit_price=$2, pnl_pct=$3, outcome=$4 WHERE id=$1`, [s.id, px, pnl, why]);
      const right = pnl <= 0;
      await d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ('review','shadow',$1,$2)`,
        [`SHADOW ${s.symbol}: blocked for "${s.block_reason}", the probe hit ${why} at ${pnl}% net of ${s.cost_pct}% cost. The block was ${right ? "RIGHT" : "WRONG (it cost a win)"}.`, JSON.stringify({ id: s.id, pnl, why, reason: s.block_reason })]);
      res.closed.push({ symbol: s.symbol, why, pnlPct: pnl });
    }
  }
  const stillOpen = open.length - res.closed.length;
  if (!kill && !entered && near.length && stillOpen < 5) {
    const cand = near.filter((n) => n.setup && n.setup.stopPrice && n.setup.targetPrice && n.setup.price && n.setup.stopPrice < n.setup.price && n.setup.targetPrice > n.setup.price && !n.reason.startsWith("missing data") && !n.reason.startsWith("copycat"))
      .sort((a, b) => rank(a.reason) - rank(b.reason));
    for (const n of cand) {
      if (await d.one(`SELECT 1 FROM mob_aq_shadow WHERE mint=$1 AND (closed_at IS NULL OR closed_at > now() - interval '30 minutes')`, [n.c.mint])) continue;
      const cost = n.rt != null ? n.rt : KB_COST_PCT;
      const r = await d.one(`INSERT INTO mob_aq_shadow (mint, pool, symbol, block_reason, entry_price, stop_price, target_price, cost_pct, cost_source, time_stop_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,to_timestamp($10)) RETURNING id`,
        [n.c.mint, n.c.pool, n.c.symbol, n.reason, n.setup.price, n.setup.stopPrice, n.setup.targetPrice, cost, n.rt != null ? "measured" : "trading-kb 5%", nowSec + P.timeStopMin * 60]);
      res.opened = { id: r.id, symbol: n.c.symbol, reason: n.reason };
      break;
    }
  }
  set("ln.paper", res.opened || res.closed.length ? "busy" : "idle", res.opened ? `SHADOW probe on ${res.opened.symbol} (blocked: ${res.opened.reason})` : res.closed.length ? `${res.closed.length} shadow probe(s) closed` : "no near miss to probe");
  set("rv.missed", "busy", `${stillOpen + (res.opened ? 1 : 0)} shadow probe(s) open`);
  return res;
}

export async function shadowStats(d) {
  const rows = await d.q(`SELECT block_reason, pnl_pct, closed_at FROM mob_aq_shadow ORDER BY id`);
  const closed = rows.filter((r) => r.closed_at);
  const s = stats(closed.map((r) => r.pnl_pct));
  const by = {};
  for (const r of closed) (by[r.block_reason.split(":")[0]] ||= []).push(r.pnl_pct);
  return { tag: "SHADOW", n: s.n, winRate: s.winRate, expectancyPct: s.expectancyPct, open: rows.length - closed.length,
    byReason: Object.entries(by).map(([reason, xs]) => ({ reason, n: xs.length, expectancyPct: stats(xs).expectancyPct })) };
}
