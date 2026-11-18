// SYMBIOTE rules: the paper engine for EVERY pump.fun launch. Pure: no network, no database, no wallet, no signer.
// Fed with decoded events (decode.mjs), it keeps every live coin in memory, paper-trades it in two lanes and hands back
// batches for the Durable Object to write. Nothing here can move money: it has no key, no RPC, no imports beyond decode.mjs.
//
// THE RULES (stated; tested in test/symbiote.test.mjs on a recorded real stream):
//  Data behind them (aquarius-lessons): new pairs lose on dips and on momentum (lessons 1, 7); the only thing that paid on NEW
//  pairs was a Fibonacci pullback, 50% level +1.18 edge (492 trades) and 38.2% +1.05 (526) (lesson 14); new coins cost about
//  4x established ones (lesson 3), so the leg must be big against the real round trip (rulebook rule 6: room >= 4x the cost);
//  no clock decides an entry or exit (HOW IT TRADES, 2026-11-18).
//  LEG     low L = the lowest curve price since launch before the high; high H = the running high. A leg counts when
//          H/L - 1 >= 4 x the round trip of our size on this curve right now (fees from the event + curve impact + network fee).
//  ENTRY   lane "aquarius": price pulls back to the 50% level (<= H - 0.5(H-L)); lane "grok": the 38.2% level. Entry on the
//          first BUY trade inside the zone (the bounce), never below 78.6%. A Grok "VETO <mint>" stops the grok lane's entry.
//  STOP    a trade printing under the 78.6% level sells all. Before entry, a break of 78.6% resets the leg from that low.
//  T1      the leg high: sell half, stop to the entry price.
//  T2      the 1.272 extension: the stop moves up to 1.272 (a print back under it sells the rest).
//  T3      the 1.618 extension: sell the rest.
//  END     the curve completes (migration) or the coin goes quiet for QUIET_MS (no trade: no liquidity): the rest is sold at
//          the last curve price. A coin that never forms a leg is "no_setup" for that lane (decided, 0 SOL).
//  CONTROL every coin is also bought at its first seen trade and sold at its end: the coin-flip baseline (rulebook rule 12).
//  COSTS   1 SOL a trade (100,000 paper SOL a lane); pump fee + creator fee from the event itself, constant-product impact on
//          the virtual reserves, network fee 61,000 lamports a side (measured 2026-11-16, trading-kb). Non-SOL-quoted coins
//          are traded in % at the same share of their starting curve as 1 SOL of a 30 SOL curve.
//  EXPLODED a lane trade whose marked value after costs reached +100% (doubled). It then goes to the deep health checks.
export const LANES = { aquarius: { retrace: 0.5 }, grok: { retrace: 0.382, veto: true } };
export const SIZE_SOL = 1, WALLET_SOL = 100000, NET_FEE_SOL = 0.000061, LEG_X_COST = 4, EXPLODE_PCT = 100;
export const STOP_FIB = 0.786, T2_EXT = 1.272, T3_EXT = 1.618;
export const QUIET_MS = 20 * 60 * 1000, DEFAULT_FEE_BPS = 125, REF_CURVE_SOL = 30;
export const GTA_MAIN = "4kjruqGHDsSqkMdFfCjV7Vb62HPFhtXyWc2t6JpQzDnz";
const GTA_RE = /(gta|grand\s*theft|\bvi\b|rockstar|vice\s*city|leonida|lucia|jason)/i;
export const isGta = (c) => c?.mint === GTA_MAIN || GTA_RE.test(`${c?.name || ""} ${c?.symbol || ""}`);

// constant product on the virtual reserves (pump.fun's curve), fees in basis points of the SOL side
export function buyFill(vsol, vtok, solIn, feeBps) {
  const lam = solIn * 1e9, net = lam * 10000 / (10000 + feeBps);
  const tokens = vtok * net / (vsol + net);
  return { tokens, avgPx: tokens > 0 ? (solIn) / (tokens / 1e6) : 0 };
}
export function sellFill(vsol, vtok, tokens, feeBps) {
  const gross = vsol * tokens / (vtok + tokens);
  return gross * (1 - feeBps / 10000) / 1e9;
}
// round trip of `size` against the CURRENT price, as a fraction: our buy's impact, our sell's impact (both measured from the
// reserves as they are now, since the levels are drawn on that price), both fees and both network fees
export function roundTrip(vsol, vtok, size, feeBps) {
  const { tokens } = buyFill(vsol, vtok, size, feeBps);
  const back = sellFill(vsol, vtok, tokens, feeBps);
  return (size - back + 2 * NET_FEE_SOL) / size;
}
const r6 = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null);
const pxOf = (vsol, vtok) => (vtok > 0 ? (vsol / 1e9) / (vtok / 1e6) : 0);

export function createEngine({ isVetoed = () => false } = {}) {
  const coins = new Map();
  const out = { coins: new Map(), trades: [], missed: [], lessons: [], gta: [], explode: [], feed: [] };
  const stats = { launches: 0, seen: 0, traded: 0, decided: 0, missed: 0, events: 0, trades: 0, failed: 0, lastAt: 0, fruits: 0 };
  const wallet = Object.fromEntries(Object.keys(LANES).map((l) => [l, { sol: WALLET_SOL, n: 0, wins: 0, open: 0 }]));
  const touch = (c) => out.coins.set(c.mint, c);
  const fee = (c) => c.feeBps ?? DEFAULT_FEE_BPS;
  const sizeFor = (c) => (c.sol ? SIZE_SOL : (c.vsol0 / 1e9) * SIZE_SOL / REF_CURVE_SOL);

  function newCoin(x, src) {
    const c = { mint: x.mint, name: x.name ?? null, symbol: x.symbol ?? null, uri: x.uri ?? null, creator: x.creator ?? null, curve: x.curve ?? null,
      createdAt: x.ts ? x.ts * 1000 : Date.now(), createSlot: x.slot ?? null, sol: x.sol !== false, src, vsol0: x.vsol ?? null, vtok0: x.vtok ?? null,
      px0: x.vsol && x.vtok ? pxOf(x.vsol, x.vtok) : null, last: null, lastAt: null, hi: null, lo: null, n: 0, buys: 0, sells: 0, volSol: 0,
      buyers: new Set(), sellers: new Set(), sizes: [], early: new Map(), devBuy: 0, devSell: 0, devTok: 0, cycles: new Map(), feeBps: null,
      vsol: x.vsol ?? null, vtok: x.vtok ?? null, realSol: 0, gta: false, done: false, migrated: false, end: null, ctrl: null, firstAt: null,
      lanes: Object.fromEntries(Object.keys(LANES).map((l) => [l, { st: "wait", L: null, H: null, armed: false }])), minute: null };
    c.gta = isGta(c);
    coins.set(c.mint, c); touch(c);
    return c;
  }

  function onCreate(x) {
    stats.events++;
    let c = coins.get(x.mint);
    if (!c) { c = newCoin(x, x.src || "chain"); stats.launches++; }
    else { for (const k of ["name", "symbol", "uri", "creator", "curve"]) if (x[k] && !c[k]) c[k] = x[k]; if (x.sol === false) c.sol = false; c.gta = isGta(c); if (!c.px0 && x.vsol && x.vtok) { c.vsol0 = x.vsol; c.vtok0 = x.vtok; c.px0 = pxOf(x.vsol, x.vtok); } touch(c); }
    if (x.src === "pumpportal") c.pp = true; else c.chain = true;
    return c;
  }

  function lessonFor(c, lane, t) {
    const why = t.exit === "stop" ? "the 78.6% level broke" : t.exit === "t3" ? "it ran to the 1.618 extension" : t.exit === "trail" ? "it fell back under 1.272 after reaching it" : t.exit === "migrated" ? "the curve completed (migration)" : "it went quiet (no trades for 20 minutes)";
    return { dept: "symbiote", kind: "lesson", text: `${c.symbol || c.mint.slice(0, 6)} ${lane}: ${t.netPct >= 0 ? "won" : "lost"} ${t.netPct.toFixed(1)}% after costs; entry at the ${LANES[lane].retrace * 100}% pullback of a +${t.legPct.toFixed(0)}% leg, out because ${why}${t.half ? ", half sold at the leg high" : ""}. Control (bought at first trade) ${c.ctrl?.netPct != null ? c.ctrl.netPct.toFixed(1) + "%" : "open"}.`,
      data: { mint: c.mint, lane, netPct: r6(t.netPct), peakPct: r6(t.peakPct), exit: t.exit, legPct: r6(t.legPct), rtPct: r6(t.rtPct * 100), gta: c.gta, ctrlPct: c.ctrl?.netPct ?? null } };
  }

  // PAIN (aquarius-trader, "Machine mistakes become pain"): every losing paper trade, with the numbers and the rule that should
  // have caught it, so the instinct layer never takes the same pain twice
  function painFor(c, lane, t) {
    const rule = t.exit === "stop" ? (t.legPct < 8 * t.rtPct * 100 ? "leg size: the leg was under 8x the round trip; LEG_X_COST 4 let it in" : "entry: the bounce buy in the zone was not confirmed by a second buy")
      : t.exit === "quiet" ? "liquidity: no exit rule fired before the coin went quiet; a volume-drop invalidation should have sold earlier"
      : t.exit === "migrated" ? "migration: the curve completed under the entry; no rule exits before migration" : t.exit === "trail" ? "trail: gave back from 1.272 to a loss" : "exit rules";
    return { dept: "symbiote", kind: "pain", text: `PAIN ${c.symbol || c.mint.slice(0, 6)} ${lane}: ${t.netPct.toFixed(1)}% after costs (${t.exit}, peak ${t.peakPct.toFixed(1)}%, leg +${t.legPct.toFixed(0)}%, round trip ${(t.rtPct * 100).toFixed(1)}%). Should have caught it: ${rule}.`,
      data: { mint: c.mint, lane, netPct: r6(t.netPct), peakPct: r6(t.peakPct), exit: t.exit, legPct: r6(t.legPct), rtPct: r6(t.rtPct * 100), rule, gta: c.gta } };
  }

  function closeLane(c, lane, s, exit, price, vsol, vtok, at) {
    const f = fee(c);
    const back = vsol && vtok ? sellFill(vsol, vtok, s.tokens, f) : s.tokens / 1e6 * price * (1 - f / 10000);
    s.proceeds += back - NET_FEE_SOL * (c.sol ? 1 : s.size);
    const netPct = (s.proceeds - s.cost) / s.cost * 100;
    const t = { mint: c.mint, symbol: c.symbol, lane, entryAt: s.at, exitAt: at, entryPx: s.px, exitPx: price, cost: s.cost, proceeds: s.proceeds, netPct, peakPct: s.peak, legPct: s.legPct, rtPct: s.rt, exit, half: s.half, gta: c.gta };
    s.st = "done"; s.tokens = 0; s.result = { netPct, exit };
    const w = wallet[lane]; w.n++; if (netPct > 0) w.wins++; w.open--; w.sol += (s.proceeds - s.cost) * (c.sol ? 1 : SIZE_SOL / s.size);
    out.trades.push(t); out.lessons.push(lessonFor(c, lane, t));
    if (netPct < 0) out.lessons.push(painFor(c, lane, t)); out.feed.push({ at, k: "exit", mint: c.mint, sym: c.symbol, lane, pct: r6(netPct), exit });
  }

  function markLane(c, lane, s, vsol, vtok) {
    const val = s.proceeds + sellFill(vsol, vtok, s.tokens, fee(c)) - NET_FEE_SOL * (c.sol ? 1 : s.size);
    const pct = (val - s.cost) / s.cost * 100;
    if (pct > s.peak) s.peak = pct;
    if (!s.exploded && s.peak >= EXPLODE_PCT) { s.exploded = true; out.explode.push({ mint: c.mint, symbol: c.symbol, lane, gainPct: r6(s.peak), at: Date.now() }); stats.fruits++; }
  }

  function stepLane(c, lane, s, tr, at) {
    const p = tr.px, cfg = LANES[lane], f = fee(c);
    if (s.st === "done") return;
    if (s.st === "wait") {
      if (s.L == null) s.L = Math.min(c.px0 ?? p, p);
      if (p < s.L) { s.L = p; s.H = p; s.armed = false; return; }
      if (s.H == null || p > s.H) { s.H = p; s.armed = false; }
      if (s.H <= s.L) return;
      const range = s.H - s.L, stopLvl = s.H - STOP_FIB * range, zone = s.H - cfg.retrace * range;
      const rt = roundTrip(tr.vsol, tr.vtok, sizeFor(c), f), legPct = (s.H / s.L - 1) * 100;
      if (p < stopLvl) { s.L = p; s.H = p; s.armed = false; return; }          // leg broken before entry: a new leg from this low
      if (legPct < LEG_X_COST * rt * 100) return;                              // not enough room for the real round trip
      if (p <= zone) s.armed = true;
      if (s.armed && tr.buy && p <= zone && p >= stopLvl) {
        if (cfg.veto && isVetoed(c.mint)) { s.st = "done"; s.result = { netPct: 0, exit: "veto" }; return; }
        const size = sizeFor(c), fill = buyFill(tr.vsol, tr.vtok, size, f);
        Object.assign(s, { st: "open", at, size, cost: size + NET_FEE_SOL * (c.sol ? 1 : size), tokens: fill.tokens, px: p, proceeds: 0, peak: -100, legPct, rt,
          stop: stopLvl, t1: s.H, t2: s.H + (T2_EXT - 1) * range, t3: s.H + (T3_EXT - 1) * range, half: false, trail: false });
        wallet[lane].open++; stats.traded++;
        out.feed.push({ at, k: "entry", mint: c.mint, sym: c.symbol, lane, px: p });
      }
      return;
    }
    // open
    markLane(c, lane, s, tr.vsol, tr.vtok);
    if (p <= s.stop) return closeLane(c, lane, s, s.trail ? "trail" : "stop", p, tr.vsol, tr.vtok, at);
    if (!s.half && p >= s.t1) { const half = s.tokens / 2; s.proceeds += sellFill(tr.vsol, tr.vtok, half, f) - NET_FEE_SOL * (c.sol ? 1 : s.size); s.tokens -= half; s.half = true; s.stop = s.px; }
    if (!s.trail && p >= s.t2) { s.trail = true; s.stop = s.t2; }
    if (p >= s.t3) return closeLane(c, lane, s, "t3", p, tr.vsol, tr.vtok, at);
  }

  function onTrade(tr, at = Date.now()) {
    stats.events++; stats.trades++; stats.lastAt = at;
    let c = coins.get(tr.mint);
    if (!c) return null;                       // a coin launched before we started: not ours to cover
    if (c.done) return c;
    if (tr.quoteSol === false) c.sol = false;
    if (tr.feeBps != null) c.feeBps = tr.feeBps + (tr.creatorFeeBps || 0);
    if (!c.firstAt) { c.firstAt = at; stats.seen++; }
    if (c.vsol0 == null) { c.vsol0 = tr.vsol; c.vtok0 = tr.vtok; c.px0 = tr.px; }
    c.n++; c.last = tr.px; c.lastAt = at; c.vsol = tr.vsol; c.vtok = tr.vtok; c.realSol = tr.realSol ?? c.realSol;
    c.hi = c.hi == null ? tr.px : Math.max(c.hi, tr.px); c.lo = c.lo == null ? tr.px : Math.min(c.lo, tr.px);
    if (tr.buy) { c.buys++; if (tr.user) c.buyers.add(tr.user); if (tr.user && c.sizes.length < 400) c.sizes.push(tr.sol); } else { c.sells++; if (tr.user) c.sellers.add(tr.user); }
    c.volSol += tr.sol;
    if (tr.user && tr.user === c.creator) { if (tr.buy) { c.devBuy += tr.sol; c.devTok += tr.tokens; } else { c.devSell += tr.sol; c.devTok -= tr.tokens; } }
    if (tr.user && tr.buy && c.createSlot != null && tr.slot != null && tr.slot - c.createSlot <= 2 && tr.user !== c.creator) c.early.set(tr.user, (c.early.get(tr.user) || 0) + tr.tokens);
    if (tr.user) { const cy = c.cycles.get(tr.user) || { b: 0, s: 0, sol: 0 }; tr.buy ? cy.b++ : cy.s++; cy.sol += tr.sol; if (c.cycles.size < 3000) c.cycles.set(tr.user, cy); }
    if (!c.ctrl) { const size = sizeFor(c), fill = buyFill(tr.vsol, tr.vtok, size, fee(c)); c.ctrl = { size, cost: size + NET_FEE_SOL * (c.sol ? 1 : size), tokens: fill.tokens, px: tr.px, netPct: null }; }
    for (const lane of Object.keys(LANES)) stepLane(c, lane, c.lanes[lane], tr, at);
    if (c.gta) gtaTick(c, at);
    touch(c);
    return c;
  }

  function gtaTick(c, at, px = c.last, src = "curve") {
    const m = Math.floor(at / 60000);
    if (c.minute && c.minute.m === m) { const k = c.minute; k.h = Math.max(k.h, px); k.l = Math.min(k.l, px); k.c = px; k.n++; return; }
    if (c.minute) out.gta.push({ ...c.minute, mint: c.mint });
    c.minute = { m, o: px, h: px, l: px, c: px, n: 1, src };
  }

  function finish(c, why, at = Date.now()) {
    if (c.done) return;
    c.done = true; c.end = why; stats.decided++;
    for (const lane of Object.keys(LANES)) {
      const s = c.lanes[lane];
      if (s.st === "open") closeLane(c, lane, s, why, c.last, c.vsol, c.vtok, at);
      else if (s.st === "wait") { s.st = "done"; s.result = { netPct: 0, exit: c.n ? "no_setup" : "no_trades" }; }
    }
    if (c.ctrl && c.n) { const back = sellFill(c.vsol, c.vtok, c.ctrl.tokens, fee(c)) - NET_FEE_SOL * (c.sol ? 1 : c.ctrl.size); c.ctrl.netPct = r6((back - c.ctrl.cost) / c.ctrl.cost * 100); }
    if (!c.n) { stats.missed++; out.missed.push({ mint: c.mint, symbol: c.symbol, reason: c.chain ? "no trade seen on the stream after launch" : "launch seen only on PumpPortal, never on the chain stream", at }); }
    if (c.minute) { out.gta.push({ ...c.minute, mint: c.mint }); c.minute = null; }
    touch(c);
  }

  function onComplete(x, at = Date.now()) { const c = coins.get(x.mint); if (c) { c.migrated = true; finish(c, "migrated", at); } }

  // every few seconds: coins quiet for QUIET_MS are decided; GTA coins are never dropped from memory
  function sweep(now = Date.now()) {
    for (const c of coins.values()) {
      const quietFrom = c.lastAt || c.firstAt || c.createdAt;
      if (!c.done && now - quietFrom > QUIET_MS) finish(c, "quiet", now);
      if (c.done && !c.gta && !out.coins.has(c.mint) && now - (c.lastAt || c.createdAt) > QUIET_MS) coins.delete(c.mint);
    }
  }

  // stream health from what the stream saw (the deep checks add holders, authorities, RugCheck, socials, funders, Grok)
  function streamHealth(mint) {
    const c = coins.get(mint); if (!c) return null;
    const supply = 1e15, sizes = c.sizes, mean = sizes.reduce((a, b) => a + b, 0) / (sizes.length || 1);
    const sd = Math.sqrt(sizes.reduce((a, b) => a + (b - mean) ** 2, 0) / (sizes.length || 1));
    const rounded = new Map(); for (const v of sizes) { const k = v.toFixed(3); rounded.set(k, (rounded.get(k) || 0) + 1); }
    const topSame = sizes.length ? Math.max(...rounded.values()) / sizes.length : 0;
    let washVol = 0; for (const v of c.cycles.values()) if (v.b >= 3 && v.s >= 3) washVol += v.sol;
    const sniperTok = [...c.early.values()].reduce((a, b) => a + b, 0);
    return { uniqueBuyers: c.buyers.size, buys: c.buys, sells: c.sells, buyShare: r6(c.buys / Math.max(1, c.buys + c.sells)), sizeCv: r6(mean ? sd / mean : 0), sameSizeShare: r6(topSame),
      washShare: r6(c.volSol ? washVol / c.volSol : 0), sniperWallets: c.early.size, sniperShare: r6(sniperTok / supply), devSold: c.devSell > 0, devShare: r6(Math.max(0, c.devTok) / supply),
      earlyBuyers: [...c.early.keys()].slice(0, 10), firstBuyers: [...c.buyers].slice(0, 12), creator: c.creator, curve: c.curve, uri: c.uri,
      realSol: c.realSol, mcapSol: r6(c.last ? c.last * 1e9 : null), liqToMcap: r6(c.last ? c.realSol / (c.last * 1e9) : null), quote: c.sol ? "SOL" : "other" };
  }

  // hands the accumulated changes to the writer and starts a new batch
  function drain() {
    const coinsOut = [...out.coins.values()].map((c) => ({ mint: c.mint, symbol: c.symbol, name: c.name, gta: c.gta, sol: c.sol, created_at: new Date(c.createdAt).toISOString(),
      n: c.n, buyers: c.buyers.size, px0: c.px0, last: c.last, hi: c.hi, end: c.end, done: c.done, pp: !!c.pp, chain: !!c.chain,
      lanes: Object.fromEntries(Object.entries(c.lanes).map(([l, s]) => [l, s.result || { st: s.st, peakPct: s.peak ?? null }])), ctrl: c.ctrl?.netPct ?? null }));
    const b = { coins: coinsOut, trades: out.trades.splice(0), missed: out.missed.splice(0), lessons: out.lessons.splice(0), gta: out.gta.splice(0), explode: out.explode.splice(0), feed: out.feed.splice(0) };
    out.coins.clear();
    return b;
  }
  // coverage: launches we saw trading / launches that are decided or already trading (a launch still inside its first
  // QUIET_MS with no trade yet is pending, not missed)
  const coverage = () => { let pending = 0; for (const c of coins.values()) if (!c.done && !c.n) pending++;
    const base = stats.launches - pending; return { ...stats, pending, live: coins.size, pct: base > 0 ? r6(Math.min(100, (base - stats.missed) / base * 100)) : null, wallet }; };
  return { onCreate, onTrade, onComplete, sweep, drain, streamHealth, coverage, coins, stats, wallet, gtaTick };
}

// A right call: exploded on paper AND every health rule passed. Returns {ok, failed:[...], checks}. Thresholds stated here.
export const HEALTH = { top10Max: 0.30, devShareMax: 0.05, devSold: false, sniperShareMax: 0.15, sameFunderMax: 3, uniqueBuyersMin: 60,
  sizeCvMin: 0.6, sameSizeShareMax: 0.25, washShareMax: 0.25, liqToMcapMin: 0.05 };
export function judgeHealth(h) {
  const failed = [], has = (v) => v !== null && v !== undefined;
  const need = (name, ok, v) => { if (!has(v)) failed.push(`${name}: unknown`); else if (!ok) failed.push(`${name}: ${typeof v === "number" ? Math.round(v * 1000) / 1000 : v}`); };
  need("top-10 holders excluding the curve", h.top10Share <= HEALTH.top10Max, h.top10Share);
  need("dev share", h.devShare <= HEALTH.devShareMax, h.devShare);
  need("dev sold", h.devSold === false, h.devSold);
  need("sniper/bundle share in the first blocks", h.sniperShare <= HEALTH.sniperShareMax, h.sniperShare);
  need("early wallets funded from one source", h.sameFunderMax <= HEALTH.sameFunderMax, h.sameFunderMax);
  need("unique buyers", h.uniqueBuyers >= HEALTH.uniqueBuyersMin, h.uniqueBuyers);
  need("natural trade sizes (spread)", h.sizeCv >= HEALTH.sizeCvMin, h.sizeCv);
  need("same-size buys", h.sameSizeShare <= HEALTH.sameSizeShareMax, h.sameSizeShare);
  need("wash cycling", h.washShare <= HEALTH.washShareMax, h.washShare);
  need("liquidity vs market cap", h.liqToMcap >= HEALTH.liqToMcapMin, h.liqToMcap);
  const auth = (name, v) => { if (v === undefined) failed.push(`${name}: unknown`); else if (v !== null) failed.push(`${name}: still active`); };
  auth("mint authority revoked", h.mintAuthority);
  auth("freeze authority revoked", h.freezeAuthority);
  need("RugCheck (no danger-level risk)", h.rugDanger === false, h.rugDanger === undefined ? undefined : h.rugDanger ? (h.rugRisks || []).join(", ") || "danger" : false);
  need("socials", h.socials > 0, h.socials);
  if (h.vetoed) failed.push("Grok VETO");
  return { ok: failed.length === 0, failed };
}
