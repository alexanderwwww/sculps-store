// Whales and the shadow lane (aquarius-trader skill).
// Whale book: swaps come from Jupiter's data API (datapi.jup.ag/v1/txs/<mint>, paged back in time; answers from the Worker).
// Every swap goes into mob_aq_wtrades; mob_aq_whales keeps each wallet's realized result per coin. A WINNER sold at least
// two different coins for more SOL than it paid, is net positive, wins >= 60% of its closed coins, and is not a bot
// (bots: more than BOT_TRADES swaps in the book per coin on average). Whale signal = 2+ INDEPENDENT winners bought the coin
// in the last 15 minutes; the creator and RugCheck insiders never count; wallets with one funder count once.
// Funders come from Helius RPC (HELIUS_API_KEY, https://mainnet.helius-rpc.com/?api-key=..., 1 credit per call, capped per tick).
// Shadow lane: when nothing passes, paper probes on near misses, own ledger, never mixed into the real one.
import { db } from "../db.mjs";
import { cached, SOL_MINT, midPrices, jupTxs, jupQuote, getJson, URLS, CALLS, CAPS } from "./feeds.mjs";
import { stats, round, num, median, roundTripPct, COUNCIL } from "./logic.mjs";

export const HELIUS_URL = (key) => `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`;
const KB_COST_PCT = 5;
export const BOT_TRADES = 60, MINE_PAGES_PER_TICK = 6, MINE_MAX_PAGES = 60, MIN_SOL = 0.02, SIGNAL_PAGES = 3;

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
// ---- the whale book, rebuilt after the 2026-11-16 audit. The old book called a wallet a winner on two closed coins; of its
// 212 "winners" 108 had exactly two, 92 had a "win" whose sell came before any recorded buy, 60 held under a minute.
// Step 1, from our own swaps (one statement, idempotent). A coin counts as CLOSED for a wallet only when its first buy is
// before its first sell (the whole trade is inside what we saw) and more than 60 seconds lie between that buy and the last
// sell (no same-second or sub-minute round trips). A wallet is a CANDIDATE with 5+ closed coins, 60%+ of them sold for more
// SOL than paid, a positive net, and not a bot by our own count (swaps per coin).
// Step 2, from Jupiter's wallet scorecard (scoreTick): a candidate becomes a WINNER only when it trades at a human pace
// (at most 100 swaps a day over its active life) and its realized net plus the bags it still holds is above zero.
export const MIN_CLOSED = 5, MIN_HOLD_SEC = 60, MAX_SWAPS_DAY = 100, SCORE_PER_TICK = 3, RESCORE_HOURS = 12;
export async function refreshWinners(d) {
  await d.q(`INSERT INTO mob_aq_whales (wallet, wins, closed, net_sol, cand, updated_at)
    SELECT wallet, wins, closed, net, (closed >= $2 AND net > 0 AND wins::float / closed >= 0.6 AND swaps::float / coins <= $1), now() FROM (
      SELECT wallet, count(*) FILTER (WHERE ok AND s > b)::int wins, count(*) FILTER (WHERE ok)::int closed, coalesce(sum(s - b) FILTER (WHERE ok), 0)::float net, sum(n)::int swaps, count(*)::int coins FROM (
        SELECT wallet, mint, b, s, n, (b > 0 AND s > 0 AND fb < fs AND extract(epoch FROM ls - fb) > $3) ok FROM (
          SELECT wallet, mint, coalesce(sum(sol) FILTER (WHERE kind='buy'), 0) b, coalesce(sum(sol) FILTER (WHERE kind='sell'), 0) s, count(*) n,
            min(at) FILTER (WHERE kind='buy') fb, min(at) FILTER (WHERE kind='sell') fs, max(at) FILTER (WHERE kind='sell') ls FROM mob_aq_wtrades GROUP BY wallet, mint) w) x
      GROUP BY wallet HAVING count(*) FILTER (WHERE b > 0 AND s > 0) > 0) y
    ON CONFLICT (wallet) DO UPDATE SET wins=EXCLUDED.wins, closed=EXCLUDED.closed, net_sol=EXCLUDED.net_sol, cand=EXCLUDED.cand OR mob_aq_whales.source='kolscan', updated_at=now()`, [BOT_TRADES, MIN_CLOSED, MIN_HOLD_SEC]);
  // a wallet that is no longer a candidate, or was never scored by Jupiter, is not a winner
  await d.q(`UPDATE mob_aq_whales SET winner = (cand AND coalesce((jup->>'ok')::boolean, false)) WHERE winner IS DISTINCT FROM (cand AND coalesce((jup->>'ok')::boolean, false))`);
  return d.one(`SELECT count(*)::int book, count(*) FILTER (WHERE cand)::int candidates, count(*) FILTER (WHERE jup IS NOT NULL)::int scored, count(*) FILTER (WHERE winner)::int winners, count(*) FILTER (WHERE source='kolscan')::int kol FROM mob_aq_whales`);
}
// Jupiter's scorecard for one wallet -> the few numbers we judge. The SOL row carries the wallet's swap counts and active
// days; every other row with a pnl block is a coin it still holds (realized + unrealized dollars = the bag, counted).
export function scoreWallet(j, wallet, netSol, solUsd) {
  const w = j?.[wallet];
  if (!w || typeof w !== "object") return null;
  const sol = w[SOL_MINT]?.pnl || null;
  let bagsUsd = 0, held = 0;
  for (const [mint, e] of Object.entries(w)) if (mint !== SOL_MINT && e?.pnl && num(e.pnl.unrealizedPnl) != null) { bagsUsd += num(e.pnl.unrealizedPnl); held++; }
  const swaps = sol ? (num(sol.totalBuys) || 0) + (num(sol.totalSells) || 0) : null;
  const days = sol?.firstActiveTime && sol?.lastActiveTime ? Math.max(1, (Date.parse(sol.lastActiveTime) - Date.parse(sol.firstActiveTime)) / 86400000) : null;
  const swapsDay = swaps != null && days ? round(swaps / days, 1) : null;
  const netUsd = solUsd ? round(netSol * solUsd + bagsUsd, 2) : null;
  const why = swapsDay == null ? "no activity record" : swapsDay > MAX_SWAPS_DAY ? `bot pace: ${swapsDay} swaps a day` : netUsd == null ? "no SOL price" : netUsd <= 0 ? `net with bags $${netUsd}` : null;
  return { ok: !why, why, swaps, days: days == null ? null : round(days, 1), swapsDay, heldCoins: held, bagsUsd: round(bagsUsd, 2), netUsd };
}
// A few candidates a tick (budgeted, cached in the row for 12 hours): score, then winner = candidate AND scorecard ok.
export async function scoreTick(env, { solUsd, set = () => {}, max = SCORE_PER_TICK } = {}) {
  const d = db(env), res = { scored: 0, ok: 0, errors: 0 };
  const todo = await d.q(`SELECT wallet, net_sol FROM mob_aq_whales WHERE cand AND (scored_at IS NULL OR scored_at < now() - make_interval(hours => $2::int)) ORDER BY scored_at NULLS FIRST, (source='kolscan') DESC, closed DESC LIMIT $1`, [max, RESCORE_HOURS]);
  for (const w of todo) {
    if (CALLS.jupiterData >= CAPS.jupiterData) break;
    let sc = null;
    try { sc = scoreWallet(await getJson(URLS.jupPnl(w.wallet)), w.wallet, w.net_sol, solUsd); } catch (e) { res.errors++; res.error = String(e.message || e).slice(0, 100); break; }
    if (!sc) sc = { ok: false, why: "no scorecard" };
    await d.q(`UPDATE mob_aq_whales SET jup=$2, scored_at=now(), winner=(cand AND $3::boolean) WHERE wallet=$1`, [w.wallet, JSON.stringify(sc), sc.ok]);
    res.scored++; if (sc.ok) res.ok++;
  }
  if (res.scored || res.errors) set("wh.pnl", res.errors ? "blocked" : "busy", res.errors ? `Jupiter scorecard failed: ${res.error}` : `${res.scored} candidate wallet(s) scored by Jupiter, ${res.ok} at a human pace with a positive net`);
  return res;
}
// KOLscan's public leaderboard is a SEED list of named wallets (they get front-run and they dump): each is stored with its
// label, becomes a candidate, and must pass the same Jupiter scorecard. Their buys are logged as signals of source "kolscan".
export function parseKolscan(html) {
  const out = new Map(), re = /\\"wallet_address\\":\\"([1-9A-HJ-NP-Za-km-z]{32,44})\\",\\"name\\":\\"([^"\\]{0,60})\\"[^{}]*?\\"profit\\":(-?[\d.e+-]+),\\"wins\\":(\d+),\\"losses\\":(\d+),\\"timeframe\\":(\d+)/g;
  for (const m of String(html || "").matchAll(re)) {
    const k = out.get(m[1]) || { wallet: m[1], name: m[2], frames: {} };
    k.frames[m[6]] = { profitSol: round(Number(m[3]), 3), wins: Number(m[4]), losses: Number(m[5]) };
    out.set(m[1], k);
  }
  return [...out.values()];
}
export async function kolTick(env, { set = () => {} } = {}) {
  const d = db(env);
  const r = await cached(env, "kolscan", 6 * 3600, async () => {
    const res = await fetch(URLS.kolscan, { headers: { accept: "text/html", "user-agent": "aquarius-paper/1" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = parseKolscan(await res.text());
    if (!rows.length) throw new Error("no leaderboard rows in the page");
    return rows;
  }, 1800);
  if (!r.ok) { set("wh.kol", "blocked", `kolscan: ${r.err}`.slice(0, 190)); return { ok: false, error: r.err }; }
  if (!r.cached) {
    await d.q(`INSERT INTO mob_aq_whales (wallet, source, label, cand, kol) SELECT w, 'kolscan', l, true, k::jsonb FROM unnest($1::text[],$2::text[],$3::text[]) x(w,l,k)
      ON CONFLICT (wallet) DO UPDATE SET source='kolscan', label=EXCLUDED.label, cand=true, kol=EXCLUDED.kol`, [r.data.map((x) => x.wallet), r.data.map((x) => x.name), r.data.map((x) => JSON.stringify(x.frames))]);
    await d.q(`INSERT INTO mob_aq_brain (dept, kind, text) VALUES ('whales','finding',$1)`, [`KOLscan seed read: ${r.data.length} named wallets stored as candidates (source kolscan, CLAIMED). Each still has to pass the Jupiter scorecard; their buys are logged as signals, nothing is traded on them.`]);
  }
  return { ok: true, wallets: r.data.length, fresh: !r.cached };
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

// ---- signal log with a matched control. Every signal, whatever its source (own whale book, nansen, kolscan), is one row:
// the coin, its price, and a CONTROL coin priced in the same tick that nobody signalled, closest in liquidity. Forward returns
// of both are stamped 5, 15, 30 and 60 minutes later. A source earns the real ledger only on 200+ such pairs.
export const EVIDENCE_MIN = 200, SIGNAL_SOURCES = ["own", "nansen", "kolscan"];
export async function logSignal(d, sg, controls = []) {
  const dup = await d.one(`SELECT 1 FROM mob_aq_signals WHERE mint=$1 AND source=$2 AND at > now() - interval '30 minutes'`, [sg.mint, sg.source]);
  if (dup) return null;
  const busy = new Set((await d.q(`SELECT mint FROM mob_aq_signals WHERE at > now() - interval '60 minutes'`)).map((r) => r.mint));
  const liq = sg.liqUsd > 0 ? sg.liqUsd : null;
  const ctrl = sg.price == null ? null : controls.filter((c) => c.mint !== sg.mint && c.price > 0 && !busy.has(c.mint) && (!liq || c.liqUsd > 0))
    .sort((a, b) => (liq ? Math.abs(Math.log(a.liqUsd / liq)) - Math.abs(Math.log(b.liqUsd / liq)) : 0))[0] || null;
  return d.one(`INSERT INTO mob_aq_signals (mint, symbol, wallets, independent, funders, price_usd, source, label, ctrl_mint, ctrl_symbol, ctrl_price) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [sg.mint, sg.symbol, JSON.stringify(sg.wallets || []), sg.independent ?? null, sg.funders ?? null, sg.price ?? null, sg.source, sg.label ?? null, ctrl?.mint ?? null, ctrl?.symbol ?? null, ctrl?.price ?? null]);
}
export async function signalEvidence(d) {
  const rows = await d.q(`SELECT source, pct_5m, pct_15m, pct_30m, pct_60m, ctrl_5m, ctrl_15m, ctrl_30m, ctrl_60m, ctrl_mint FROM mob_aq_signals`);
  const out = {};
  for (const src of SIGNAL_SOURCES) {
    const all = rows.filter((r) => r.source === src), m = all.filter((r) => r.ctrl_mint && r.pct_15m != null && r.ctrl_15m != null);
    const med = (k) => round(median(m.map((r) => r[k])), 3);
    const e = { source: src, signals: all.length, withControl: m.length, needed: EVIDENCE_MIN, median: { m5: med("pct_5m"), m15: med("pct_15m"), m30: med("pct_30m"), m60: med("pct_60m") }, control: { m5: med("ctrl_5m"), m15: med("ctrl_15m"), m30: med("ctrl_30m"), m60: med("ctrl_60m") } };
    e.edge15 = e.median.m15 != null && e.control.m15 != null ? round(e.median.m15 - e.control.m15, 3) : null;
    e.real = m.length >= EVIDENCE_MIN && e.median.m15 > 0 && e.median.m15 > e.control.m15;
    out[src] = e;
  }
  return out;
}

export async function whaleSignal(env, c, rug, set, ctx = {}) {
  const d = db(env);
  // up to three pages (90 swaps): one page of a busy coin is a few seconds, not the 15 minutes the signal looks at
  const tr = await cached(env, `jup:txs:${c.mint}`, 50, async () => {
    let pg = await jupTxs(c.mint), all = pg.txs;
    for (let i = 1; i < SIGNAL_PAGES && pg.next && pg.oldest && Date.now() - Date.parse(pg.oldest) < 15 * 60000 && CALLS.jupiterData < CAPS.jupiterData; i++) { pg = await jupTxs(c.mint, pg.next); all = all.concat(pg.txs); }
    return all;
  }, 120);
  if (!tr.ok) { set("wh.steady", "blocked", `swaps feed failed: ${tr.err}`.slice(0, 190)); return { ok: false, signal: false, reason: "missing data: swaps" }; }
  const t = tr.data;
  await saveTrades(d, c.mint, t);
  await d.q(`DELETE FROM mob_aq_wtrades WHERE at < now() - interval '14 days'`);
  const excluded = new Set([rug?.creator, c.dev, ...(rug?.insiders || [])].filter(Boolean));
  const buyers = [...new Set(t.filter((x) => x.kind === "buy" && Date.now() - Date.parse(x.at) < 15 * 60000).map((x) => x.wallet))].filter((w) => !excluded.has(w));
  const winners = buyers.length ? await d.q(`SELECT wallet, wins, closed, net_sol FROM mob_aq_whales WHERE winner AND wallet = ANY($1)`, [buyers]) : [];
  // a named KOLscan wallet that is not a bot by its scorecard bought: logged as its own source (never mixed into "own")
  const kols = buyers.length ? await d.q(`SELECT wallet, label FROM mob_aq_whales WHERE source='kolscan' AND wallet = ANY($1) AND (jup IS NULL OR coalesce((jup->>'swapsDay')::float8, 0) <= $2)`, [buyers, MAX_SWAPS_DAY]) : [];
  if (kols.length) await logSignal(d, { mint: c.mint, symbol: c.symbol, price: c.priceUsd ?? null, liqUsd: c.liqUsd, source: "kolscan", label: kols.map((k) => k.label).slice(0, 3).join(", "), wallets: kols.map((k) => k.wallet), independent: kols.length }, ctx.controls || []);
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
  if (out.signal) await logSignal(d, { mint: c.mint, symbol: c.symbol, price: c.priceUsd ?? null, liqUsd: c.liqUsd, source: "own", wallets: out.wallets, independent: groups.size, funders }, ctx.controls || []);
  return out;
}
// What happened after each signal: the price of the coin and of its control 5, 15, 30 and 60 minutes later, then a lesson.
// Prices come from the tick's one Jupiter price call. A horizon that was missed by more than half its length stays empty.
const HORIZONS = [[5, "pct_5m", "ctrl_5m"], [15, "pct_15m", "ctrl_15m"], [30, "pct_30m", "ctrl_30m"], [60, "pct_60m", "ctrl_60m"]];
export async function followSignals(env, priceOf) {
  const d = db(env);
  const open = await d.q(`SELECT * FROM mob_aq_signals WHERE price_usd IS NOT NULL AND (pct_60m IS NULL OR (ctrl_mint IS NOT NULL AND ctrl_60m IS NULL)) AND at > now() - interval '3 hours' ORDER BY id LIMIT 40`);
  for (const s of open) {
    const px = priceOf(s.mint), cx = s.ctrl_mint ? priceOf(s.ctrl_mint) : null, age = (Date.now() - new Date(s.at).getTime()) / 60000;
    const pct = px == null ? null : round((px / s.price_usd - 1) * 100, 2), cpct = cx == null || !s.ctrl_price ? null : round((cx / s.ctrl_price - 1) * 100, 2);
    for (const [min, col, ccol] of HORIZONS) {
      if (age < min || age > min * 1.5 + 2) continue;
      if (pct != null && s[col] == null) { await d.q(`UPDATE mob_aq_signals SET ${col}=$2${min === 15 ? ", price_15m=$3" : min === 60 ? ", price_60m=$3" : ""} WHERE id=$1 AND ${col} IS NULL`, min === 15 || min === 60 ? [s.id, pct, px] : [s.id, pct]); s[col] = pct;
        if (min === 60) await d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ('whales','signal',$1,$2)`, [`${s.source} signal on ${s.symbol}${s.label ? ` (${s.label})` : s.independent ? ` (${s.independent} independent winners)` : ""}: ${s.pct_5m ?? "n/a"}% after 5 min, ${s.pct_15m ?? "n/a"}% after 15, ${s.pct_30m ?? "n/a"}% after 30, ${pct}% after 60. Control ${s.ctrl_symbol || "none"}: ${s.ctrl_15m ?? "n/a"}% after 15, ${cpct ?? "n/a"}% after 60. Council verdict then: ${s.verdict || "none"}${s.reason ? ` (${s.reason})` : ""}.`, JSON.stringify({ signal: s.id, source: s.source, pct15: s.pct_15m, pct60: pct, ctrl15: s.ctrl_15m, ctrl60: cpct })]); }
      if (cpct != null && s[ccol] == null) { await d.q(`UPDATE mob_aq_signals SET ${ccol}=$2 WHERE id=$1 AND ${ccol} IS NULL`, [s.id, cpct]); s[ccol] = cpct; }
    }
  }
  return open.map((s) => s.mint);
}
export async function whaleState(d) {
  const [b, m, sg, top] = await Promise.all([
    d.one(`SELECT count(*)::int book, count(*) FILTER (WHERE winner)::int winners, count(*) FILTER (WHERE cand)::int candidates, count(*) FILTER (WHERE jup IS NOT NULL)::int scored, count(*) FILTER (WHERE source='kolscan')::int kol,
      count(*) FILTER (WHERE jup->>'why' LIKE 'bot pace%')::int bots FROM mob_aq_whales`),
    d.one(`SELECT count(*)::int coins, count(*) FILTER (WHERE done)::int done, coalesce(sum(trades),0)::int swaps FROM mob_aq_mined`),
    d.q(`SELECT symbol, at, independent, funders, verdict, reason, source, label, pct_5m, pct_15m, pct_30m, pct_60m, ctrl_symbol, ctrl_5m, ctrl_15m, ctrl_30m, ctrl_60m FROM mob_aq_signals ORDER BY id DESC LIMIT 10`),
    d.q(`SELECT wallet, wins, closed, net_sol, source, label, jup FROM mob_aq_whales WHERE winner ORDER BY wins DESC, net_sol DESC LIMIT 10`),
  ]);
  const hr = await d.one(`SELECT (SELECT count(*)::int FROM mob_aq_signals WHERE at > now() - interval '1 hour') sph, (SELECT count(*)::int FROM mob_aq_trades WHERE strategy='R5') n, (SELECT count(*)::int FROM mob_aq_trades WHERE strategy='R5' AND pnl_sol > 0) w, (SELECT count(*)::int FROM mob_aq_funders) f`);
  return { book: b.book, winners: b.winners,
    // the rebuilt book: 5+ closed coins seen whole and held over a minute, then Jupiter's scorecard (human pace, bags counted)
    rebuilt: { definition: `${MIN_CLOSED}+ closed coins (buy seen before the sell, held over ${MIN_HOLD_SEC}s), 60%+ won, net positive, then Jupiter scorecard: at most ${MAX_SWAPS_DAY} swaps a day and net with open bags above zero`, candidates: b.candidates, scored: b.scored, winners: b.winners, botsByPace: b.bots, kolscanSeeds: b.kol },
    signalsLastHour: hr.sph, r5: { trades: hr.n, wins: hr.w, hitRate: hr.n ? round(hr.w / hr.n, 3) : null }, r5BySource: await (async () => { const q = await d.one(`SELECT count(*) FILTER (WHERE entry_variant = 'N')::int nn, count(*) FILTER (WHERE entry_variant = 'N' AND pnl_sol > 0)::int nw, count(*) FILTER (WHERE entry_variant IS DISTINCT FROM 'N')::int on_, count(*) FILTER (WHERE entry_variant IS DISTINCT FROM 'N' AND pnl_sol > 0)::int ow FROM mob_aq_trades WHERE strategy='R5'`); return { ownWinners: { trades: q.on_, wins: q.ow }, nansen: { trades: q.nn, wins: q.nw } }; })(), fundersKnown: hr.f, mining: m, signals: sg.map((s) => ({ symbol: s.symbol, at: s.at, source: s.source, label: s.label, independent: s.independent, funders: s.funders, verdict: s.verdict, reason: s.reason, pct5m: s.pct_5m, pct15m: s.pct_15m, pct30m: s.pct_30m, pct60m: s.pct_60m,
      control: s.ctrl_symbol ? { symbol: s.ctrl_symbol, pct5m: s.ctrl_5m, pct15m: s.ctrl_15m, pct30m: s.ctrl_30m, pct60m: s.ctrl_60m } : null })),
    // forward returns of every source against its matched control: what decides whether R5 may touch the real ledger
    evidence: Object.values(await signalEvidence(d)),
    top: top.map((w) => ({ wallet: `${w.wallet.slice(0, 4)}…${w.wallet.slice(-4)}`, wins: w.wins, closed: w.closed, netSol: round(w.net_sol, 3), source: w.source, label: w.label || null, swapsDay: w.jup?.swapsDay ?? null, netUsdWithBags: w.jup?.netUsd ?? null })) };
}

// ------------------------------------------------------------------ shadow lane
// v2 (audit 2026-11-16, bug 5): a probe is charged the round trip MEASURED for that coin (a Jupiter buy+sell quote when the
// block came before any quote; no quote = no probe) and uses the levels of the setup that was actually blocked (stop under
// target, both around the entry). Probes from before that (v = 1: most charged an assumed 5%, many had fib levels with the
// stop wider than the target) are kept in the table, flagged legacy and left out of every statistic.
export const SHADOW_V = 2, SHADOW_MAX_OPEN = 5;
const NEAR_RANK = ["not tradable", "cost gate", "size", "stop > target", "time machine", "soft rules", "no signal", "safety", "stale data", "liquidity too low"];
const rank = (n) => { if (n.first) return -1; const i = NEAR_RANK.findIndex((r) => n.reason.startsWith(r)); return i < 0 ? 99 : i; };

export async function shadowTick(env, { kill, entered, near, solUsd, feeSol, gap = 0, nowSec, set, P, positionSol = null }) {
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
      if (!(await d.one(`UPDATE mob_aq_shadow SET closed_at=now(), exit_price=$2, pnl_pct=$3, outcome=$4 WHERE id=$1 AND closed_at IS NULL RETURNING id`, [s.id, px, pnl, why]))) continue; // closed by another request
      const right = pnl <= 0;
      await d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ('review','shadow',$1,$2)`,
        [`SHADOW ${s.symbol}${s.strategy ? ` ${s.strategy}` : ""}: blocked for "${s.block_reason}", the probe hit ${why} at ${pnl}% net of ${s.cost_pct}% ${s.cost_source || ""} cost. The block was ${right ? "RIGHT" : "WRONG (it cost a win)"}.${s.v < SHADOW_V ? " (legacy probe: not counted)" : ""}`, JSON.stringify({ id: s.id, pnl, why, reason: s.block_reason, v: s.v })]);
      res.closed.push({ symbol: s.symbol, why, pnlPct: pnl });
    }
  }
  const stillOpen = open.length - res.closed.length;
  // a real entry this tick leaves the near misses alone, but a signal of a strategy that is off the real ledger is always
  // probed: the shadow lane is the only record that strategy has
  if (!kill && near.length && stillOpen < SHADOW_MAX_OPEN) {
    const ok = (n) => n.setup && n.setup.price > 0 && n.setup.stopPrice > 0 && n.setup.stopPrice < n.setup.price && n.setup.targetPrice > n.setup.price && (n.setup.price - n.setup.stopPrice) < (n.setup.targetPrice - n.setup.price)
      && !n.reason.startsWith("missing data") && !n.reason.startsWith("copycat") && !n.reason.startsWith("safety") && !n.reason.startsWith("cannot sell") && !n.reason.startsWith("liquidity");
    const cand = near.filter((n) => ok(n) && (!entered || n.first)).sort((a, b) => rank(a) - rank(b));
    let quoted = 0;
    for (const n of cand) {
      if (await d.one(`SELECT 1 FROM mob_aq_shadow WHERE mint=$1 AND (closed_at IS NULL OR closed_at > now() - interval '30 minutes')`, [n.c.mint])) continue;
      let cost = n.rt, src = "measured (the blocked trade's own quote)";
      if (cost == null) {
        if (!feeSol || quoted) continue; // one quoted probe a tick; no SOL price or no quote = no probe, never an assumed cost
        quoted++;
        // the cost at the size a real trade would have had: the CEO's position, cut to 1% of the pool like a real entry
        const poolCap = n.c.liqUsd > 0 && solUsd ? ((COUNCIL.maxPoolPct / 100) * n.c.liqUsd) / solUsd : Infinity, size = round(Math.min(positionSol ?? COUNCIL.positionSol, poolCap), 6);
        if (size < COUNCIL.minSizeSol) continue;
        const buy = await jupQuote(SOL_MINT, n.c.mint, Math.floor(size * 1e9));
        if (buy && gap) await new Promise((r) => setTimeout(r, gap));
        const sell = buy ? await jupQuote(n.c.mint, SOL_MINT, buy.outAmount) : null;
        if (!sell) continue;
        cost = roundTripPct(size, Number(sell.outAmount) / 1e9, feeSol); src = `measured (Jupiter round trip at ${size} SOL)`;
      }
      const hold = n.setup.holdMin ?? P.timeStopMin;
      const r = await d.one(`INSERT INTO mob_aq_shadow (mint, pool, symbol, block_reason, entry_price, stop_price, target_price, cost_pct, cost_source, time_stop_at, v, strategy, tier, atr5_pct)
        SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,to_timestamp($10),$11,$12,$13,$14 WHERE NOT EXISTS (SELECT 1 FROM mob_aq_shadow WHERE mint=$1 AND closed_at IS NULL) RETURNING id`,
        [n.c.mint, n.c.pool, n.c.symbol, n.reason.slice(0, 240), n.setup.price, n.setup.stopPrice, n.setup.targetPrice, Math.max(cost, 0), src, nowSec + hold * 60, SHADOW_V, n.sid || null, n.tier || null, n.atr ?? null]);
      if (!r) continue;
      res.opened = { id: r.id, symbol: n.c.symbol, reason: n.reason, strategy: n.sid || null, costPct: cost };
      break;
    }
  }
  set("ln.paper", res.opened || res.closed.length ? "busy" : "idle", res.opened ? `SHADOW probe on ${res.opened.symbol} (${res.opened.reason})`.slice(0, 190) : res.closed.length ? `${res.closed.length} shadow probe(s) closed` : "no near miss to probe");
  set("rv.missed", "busy", `${stillOpen + (res.opened ? 1 : 0)} shadow probe(s) open`);
  return res;
}

export async function shadowStats(d) {
  const all = await d.q(`SELECT block_reason, pnl_pct, closed_at, v, strategy FROM mob_aq_shadow ORDER BY id`);
  const rows = all.filter((r) => r.v >= SHADOW_V), closed = rows.filter((r) => r.closed_at);
  const s = stats(closed.map((r) => r.pnl_pct));
  const by = {}, bs = {};
  for (const r of closed) { (by[r.block_reason.split(":")[0].replace(/,.*/, "")] ||= []).push(r.pnl_pct); if (r.strategy) (bs[r.strategy] ||= []).push(r.pnl_pct); }
  return { tag: "SHADOW", n: s.n, winRate: s.winRate, expectancyPct: s.expectancyPct, ci95: s.ci95, open: rows.length - closed.length,
    byReason: Object.entries(by).map(([reason, xs]) => ({ reason, n: xs.length, expectancyPct: stats(xs).expectancyPct })),
    byStrategy: Object.entries(bs).map(([strategy, xs]) => { const st = stats(xs); return { strategy, n: st.n, winRate: st.winRate, expectancyPct: st.expectancyPct, ci95: st.ci95 }; }),
    // probes opened before 2026-11-16 15:00Z: assumed cost and wrong levels, kept for the record, in no number above
    legacy: { n: all.filter((r) => r.v < SHADOW_V).length, note: "probes from before the audit fix (assumed 5% cost, fib levels on no-signal coins): excluded from every statistic" } };
}
