// Aquarius engine: drives the whole paper loop against stubbed copies of real API responses (test/aq-fixtures.mjs).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { makeEnv, dropEnv, reqOf, login, mock, resetMocks, res, calls } from "./helpers.mjs";
import { db } from "../src/db.mjs";
import { FX, FX2, FX3, FX5, FX6 } from "./aq-fixtures.mjs";
import { whaleSignal, refreshWinners, mineTick, scoreTick, scoreWallet, parseKolscan, kolTick } from "../src/aq/whales.mjs";
import { readFileSync } from "node:fs";
const FXD = JSON.parse(readFileSync(new URL("./aq-fixtures-d.json", import.meta.url), "utf8"));
// Jupiter's wallet scorecard in its real shape: the fixture wallet is the real one (a bot); any other wallet gets a human pace
const humanPnl = (w) => ({ [w]: { [SOL]: { pnl: { totalBuys: 40, totalSells: 38, firstActiveTime: new Date(Date.now() - 20 * 86400000).toISOString(), lastActiveTime: new Date().toISOString() } }, HeldCoin1: { pnl: { unrealizedPnl: -3.5 } } } });
let pnlFor = {}, kolPage = null;
import { GT_GAP, GT_BACKOFF, DS_BACKOFF, bestPairs, jupPool, resetCalls, CALLS } from "../src/aq/feeds.mjs";
GT_GAP.ms = 0; GT_BACKOFF.sec = 0; DS_BACKOFF.sec = 0;
const JSOL = Object.values(FX5.jupPrice).find((x) => x.decimals === 9);
const jupPx = (px) => (rec, u) => Object.fromEntries(u.searchParams.get("ids").split(",").filter((m) => m === SOL || px()[m] != null).map((m) => [m, m === SOL ? clone(JSOL) : { ...clone(Object.values(FX5.jupPrice).find((x) => x.decimals === 6)), usdPrice: px()[m], liquidity: 250000 }]));
import { tick, proposeBot, _resetSeeded } from "../src/aq/engine.mjs";
import { fibSetup, safety, slimRug, stats, replay, candlesFromGT } from "../src/aq/logic.mjs";
import { R3_PARAMS, seedWorkers, DEPT_IDS } from "../src/aq/seed.mjs";

const clone = (x) => JSON.parse(JSON.stringify(x));
const SOL = "So11111111111111111111111111111111111111112";
let env, R, cookie;
before(async () => { env = await makeEnv({ AQ_JUP_GAP_MS: "0", AQUARIUS_KEY: "aqkey", AQ_HELPER_KEY: "helperkey123", AQ_TEST_ARMS: "L:A" }); _resetSeeded(); R = reqOf(env); cookie = await login(env);
  // these tests run a 1 SOL wallet with 0.26 SOL positions (the CEO setting lives in the state; production is 10 SOL / 2.6 SOL, same ratio)
  await db(env).q(`INSERT INTO mob_aq_state (k, v) VALUES ('position_sol', '0.26') ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v`); });
after(async () => { await dropEnv(env); });

// a pool in GeckoTerminal's real shape
function pool(sym, mint, addr, liq, priceUsd = 1.1) {
  const p = clone(FX.gtTrending.data[0]);
  p.id = `solana_${addr}`; p.attributes.address = addr; p.attributes.name = `${sym} / SOL`; p.attributes.reserve_in_usd = String(liq);
  p.attributes.base_token_price_usd = String(priceUsd); p.relationships.base_token.data.id = `solana_${mint}`;
  return p;
}
// one hour of 1m candles: rise 1.00 -> 1.20, pull back to 1.10 (0.5 retrace), last candle green; newest first like GT
function goldenCandles() {
  const now = Math.floor(Date.now() / 60000) * 60 - 60, rows = [];
  for (let i = 0; i < 60; i++) {
    const t = now - (59 - i) * 60;
    let c = i < 40 ? 1 + (0.2 * i) / 40 : i === 40 ? 1.2 : 1.2 - (0.12 * (i - 40)) / 18;
    if (i === 59) c = 1.1;
    const o = i === 59 ? 1.09 : c, h = Math.max(o, c) * 1.001, l = Math.min(o, c) * 0.999;
    rows.push([t, o, i === 40 ? 1.2 : h, l, c, 100]);
  }
  rows[0][3] = 1.0; // swing low exactly 1.00
  const j = clone(FX.ohlcv); j.data.attributes.ohlcv_list = rows.reverse(); return j;
}
const safeRug = () => { const r = clone(FX.rugWasted); r.topHolders = r.topHolders.map((h) => ({ ...h, pct: h.pct / 2 })); return r; };
const MINT = { A: "AAAAgoodmint1111111111111111111111111111pump", B: "BBBBrugmint11111111111111111111111111111pump", C: "CCCCcostmint1111111111111111111111111111pump", F: "FFFFnewmint11111111111111111111111111111pump" };
const POOL = { A: "PoolA111111111111111111111111111111111111111", B: "PoolB111111111111111111111111111111111111111", C: "PoolC111111111111111111111111111111111111111", F: "PoolF111111111111111111111111111111111111111" };
let trendingPools = [], prices = {}, tradesFor = {}, liqOf = {}, backOf = {}, rugFor = {}, sellOut = {}, jupLists = () => ({ pools: [] }), jupCharts = {};
// a swap in Jupiter's real txs shape
const jtx = (wallet, type, sol, mint, i = 0, at = new Date()) => ({ ...clone(FX6.jupTxs1.txs[0]), asset: mint, type, traderAddress: wallet, txHash: `tx-${wallet}-${mint}-${type}-${i}`, nativeVolume: sol, isMev: false, timestamp: at.toISOString() });

function stubAll() {
  resetMocks();
  mock("GET", "https://api.geckoterminal.com/api/v2/networks/solana/trending_pools", () => ({ data: trendingPools }));
  mock("GET", "https://api.geckoterminal.com/api/v2/networks/solana/new_pools", () => clone(FX.gtNew));
  mock("GET", /geckoterminal\.com\/.*\/ohlcv\/minute/, () => goldenCandles());
  mock("GET", /geckoterminal\.com\/api\/v2\/networks\/solana\/pools\/[^/]+\/trades$/, (rec) => tradesFor[rec.url.split("/").at(-2)] || clone(FX2.gtTrades));
  mock("GET", "https://api.dexscreener.com/token-boosts/latest/v1", () => { const b = clone(FX.dsBoosts); b[0].tokenAddress = MINT.C; return b; });
  mock("GET", "https://api.dexscreener.com/token-profiles/latest/v1", () => clone(FX.dsProfiles));
  mock("GET", "https://api.dexscreener.com/token-boosts/top/v1", () => []);
  mock("GET", "https://api.dexscreener.com/community-takeovers/latest/v1", () => []);
  mock("GET", "https://api.coingecko.com/api/v3/simple/price", () => clone(FX.cg));
  mock("GET", "https://api.alternative.me/fng/", () => clone(FX.fng));
  mock("GET", /rugcheck\.xyz\/v1\/tokens\/([^/]+)\/report$/, (rec) => { const m = rec.url.split("/tokens/")[1].split("/")[0]; return rugFor[m] ? rugFor[m]() : rec.url.includes(MINT.B) ? clone(FX.rugNew) : safeRug(); });
  mock("GET", "https://api.dexscreener.com/tokens/v1/solana/", (rec) => {
    const mints = rec.url.split("/").pop().split(",");
    return mints.filter((m) => prices[m] != null).map((m) => { const p = clone(FX.dsTokens[0]); p.baseToken.address = m; p.pairAddress = "x"; p.priceUsd = String(prices[m]); if (liqOf[m] != null) p.liquidity.usd = liqOf[m]; return p; });
  });
  mock("GET", "https://lite-api.jup.ag/price/v3", jupPx(() => prices));
  mock("GET", "https://datapi.jup.ag/v1/pools/", () => jupLists());
  mock("GET", "https://datapi.jup.ag/v2/charts/", (rec) => (jupCharts[rec.url.split("/charts/")[1].split("?")[0]] ? jupCharts[rec.url.split("/charts/")[1].split("?")[0]]() : res({ status: 404 }, 404)));
  mock("GET", "https://datapi.jup.ag/v1/pnl", (rec, u) => { const w = u.searchParams.get("addresses"); return pnlFor[w] ? pnlFor[w]() : w === FXD.jupPnlWallet ? clone(FXD.jupPnl) : humanPnl(w); });
  mock("GET", "https://kolscan.io/leaderboard", () => (kolPage ? new Response(kolPage, { status: 200, headers: { "content-type": "text/html" } }) : res({ status: 503 }, 503)));
  mock("GET", "https://datapi.jup.ag/v1/txs/", (rec, u) => (tradesFor[u.pathname.split("/").pop()] || (() => ({ txs: [], next: null })))(u));
  mock("GET", "https://lite-api.jup.ag/swap/v1/quote", quoteMock(() => prices));
}
// Jupiter quote in its real shape with one price model for both sides (6-decimal tokens): a buy fills at the coin's current price (prices[mint], else 1.1) at the
// fixture SOL price; a sale fetches that price times `back` (the pool's cost). sellOut[mint] forces the sale price.
function quoteMock(px) {
  return (rec, u) => {
    const q = clone(u.searchParams.get("inputMint") === SOL ? FX.jupBuy : FX.jupSell), amt = Number(u.searchParams.get("amount"));
    if (u.searchParams.get("inputMint") === SOL) { const m = u.searchParams.get("outputMint"); q.inAmount = String(amt); q.outAmount = String(Math.floor(((amt / 1e9) * SOLUSD / (px()[m] ?? 1.1)) * 1e6)); return q; }
    const mint = u.searchParams.get("inputMint"), back = backOf[mint] ?? (mint === MINT.C ? 0.9 : 0.995);  // C loses 10% round trip
    const p = sellOut[mint] ?? px()[mint] ?? 1.1; q.inAmount = String(amt); q.outAmount = String(Math.floor(((amt / 1e6) * p / SOLUSD) * 1e9 * back)); return q;
  };
}
const SOLUSD = FX.cg.solana.usd;
// raw token amount (6 decimals) that `sol` buys at `px` in the mock above
const TOK = (sol, px = 1.1) => String(Math.floor(((sol * SOLUSD) / px) * 1e6));
const S = async () => (await R("GET", "/api/aq/state", { bearer: "tok-test" })).json();
// evidence that lets a strategy onto the real paper ledger (the engine reads it, it does not make it up):
// a fresh Time Machine result for R6, or 200+ logged signals of a source that beat their matched control
const replayState = (r6) => db(env).q(`INSERT INTO mob_aq_state (k, v, at) VALUES ('replays', $1, now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [JSON.stringify({ at: Date.now() / 1000, pools: 3, candles: 900,
  R3: { n: 0, trades: 0, expectancyPct: null, ci95: null }, R7: { n: 0, trades: 0, expectancyPct: null, ci95: null }, R6: r6 })]);
const R6_GOOD = { n: 40, trades: 40, expectancyPct: 0.8, ci95: [0.1, 1.5], costPct: 0.76 }, R6_BAD = { n: 40, trades: 40, expectancyPct: -0.9, ci95: [-1.6, -0.2], costPct: 0.76 };
const seedSignals = (source, n, sig, ctrl) => db(env).q(`INSERT INTO mob_aq_signals (mint, symbol, source, at, price_usd, pct_5m, pct_15m, pct_30m, pct_60m, ctrl_mint, ctrl_symbol, ctrl_price, ctrl_5m, ctrl_15m, ctrl_30m, ctrl_60m)
  SELECT 'seed' || i, 'SEED', $1, now() - interval '5 hours', 1, $2::float8 / 2, $2::float8 + (i % 3) * 0.01, $2, $2, 'ctrl' || i, 'CTRL', 1, $3::float8 / 2, $3::float8 - (i % 3) * 0.01, $3, $3 FROM generate_series(1, $4::int) i`, [source, sig, ctrl, n]);
const clearCache = () => db(env).q(`DELETE FROM mob_aq_market`);

test("logic: fib setup, safety on the real RugCheck reports, stats evidence", () => {
  const cs = candlesFromGT(goldenCandles().data.attributes.ohlcv_list);
  const s = fibSetup(cs, R3_PARAMS, Date.now() / 1000);
  assert.equal(s.signal, true, s.why); assert.ok(s.stopPct < s.targetPct); assert.ok(s.retrace >= 0.382 && s.retrace <= 0.618);
  assert.ok(s.staleSec <= 120);
  assert.equal(fibSetup(cs.slice(0, 41), R3_PARAMS, Date.now() / 1000).signal, false, "no pullback yet");
  const wasted = safety(slimRug(FX.rugWasted), R3_PARAMS);
  assert.equal(wasted.ok, false); assert.match(wasted.reason, /top 10/); // the real WASTED report: top10 26.6% excluding the pool
  assert.match(safety(slimRug(FX.rugNew), R3_PARAMS).reason, /Creator history of rugged tokens/);
  assert.equal(safety(slimRug(safeRug()), R3_PARAMS).ok, true);
  assert.equal(safety(null, R3_PARAMS).reason, "missing data: safety report");
  assert.equal(stats([1, -1, 2]).evidence, "NO EVIDENCE yet");
  const many = Array.from({ length: 120 }, (_, i) => (i % 2 ? 3 : -1));
  assert.equal(stats(many).evidence, "EDGE"); assert.equal(stats(many.map((x) => -x)).evidence, "NO EDGE");
  assert.equal(replay({}, R3_PARAMS, 5).trades, 0);
  const w = seedWorkers(); assert.equal(w.length, 144); assert.equal(new Set(w.map((x) => x.name)).size, 144, "unique names"); assert.ok(w.every((x) => x.skills.length >= 1 && x.rules));
});

test("tick: one PASS, one safety BLOCK, one WAIT; next tick the cost gate blocks", async () => {
  stubAll();
  trendingPools = [pool("GOOD", MINT.A, POOL.A, 200000), pool("RUG", MINT.B, POOL.B, 200000), pool("COST", MINT.C, POOL.C, 200000)];
  const t1 = await tick(env);
  // all three are tier B (liquidity $200k, 17 days old); best score first: GOOD is taken, the others wait for the next tick
  assert.deepEqual(t1.evaluated.map((e) => [e.symbol, e.verdict]), [["GOOD", "PASS"], ["COST", "WAIT"], ["RUG", "WAIT"]], JSON.stringify(t1.evaluated));
  assert.equal(t1.entered.tier, "B"); assert.equal(t1.entered.tag, "PASS"); assert.equal(t1.entered.strategy, "R3");
  assert.ok(t1.entered && t1.entered.sizeSol === 0.26 && t1.entered.rtPct > 0, "the CEO's fixed paper position: 0.26 SOL");
  const pos = await db(env).q(`SELECT * FROM mob_aq_positions`); assert.equal(pos.length, 1); assert.equal(pos[0].symbol, "GOOD");
  const t2 = await tick(env);
  const cost = t2.evaluated.find((e) => e.symbol === "COST"); assert.equal(cost.verdict, "BLOCK"); assert.equal(cost.kind, "hard"); assert.equal(cost.reason, "cost gate"); assert.ok(cost.number < 6);
  // the rug-history coin is not a hard block any more: its soft rules sink the score (and a soft block names them)
  const rug = t2.evaluated.find((e) => e.symbol === "RUG"); assert.equal(rug.verdict, "BLOCK"); assert.equal(rug.kind, "soft"); assert.match(rug.reason, /^soft rules: score .*danger_risk/); assert.ok(rug.number < 70);
  const s = await S();
  assert.equal(s.positions.length, 1); assert.ok(s.council.vetoes.some((v) => v.symbol === "COST" && v.reason === "cost gate"));
  assert.ok(s.flows.some((f) => f.kind === "buy") && s.flows.some((f) => f.kind === "fee"));
  assert.ok(s.market.trending.find((x) => x.symbol === "COST").boosted, "paid boost flagged");
  const fixedCash = await db(env).one(`SELECT v FROM mob_aq_state WHERE k='cash_sol'`); assert.ok(Number(fixedCash.v) < 1);
});

test("exits: stop, target and time stop with real-shape quotes; journal, flows, lessons", async () => {
  const d = db(env);
  const [p] = await d.q(`SELECT * FROM mob_aq_positions`);
  prices[MINT.A] = p.stop_price * 0.98; // below the stop
  let t = await tick(env);
  assert.equal(t.exits[0].why, "stop"); assert.ok(t.exits[0].pnlPct < 0);
  // two more positions placed directly: one at target, one past its time stop
  for (const [sym, mint, ts] of [["TGT", "TTTTmint", "now() + interval '20 minutes'"], ["OLD", "OOOOmint", "now() - interval '1 minute'"]])
    await d.q(`INSERT INTO mob_aq_positions (strategy, mint, pool, symbol, decimals, tokens_raw, size_sol, fee_sol, entry_price_usd, stop_price, target_price, stop_pct, target_pct, rt_pct, time_stop_at)
      VALUES ('R3',$1,'x',$2,6,'${TOK(0.05)}',0.05,0.0001,1.1,1.03,1.2,6,9,1.4,${ts})`, [mint, sym]);
  prices.TTTTmint = 1.25; prices.OOOOmint = 1.12;
  t = await tick(env);
  assert.deepEqual(t.exits.map((e) => e.why).sort(), ["target", "time stop"]);
  const trades = await d.q(`SELECT * FROM mob_aq_trades ORDER BY id`);
  assert.equal(trades.length, 3);
  assert.ok(trades.every((x) => x.fees_sol > 0 && x.reason && x.grade && x.slippage_pct != null));
  assert.ok(trades.find((x) => x.reason === "target").pnl_sol > 0);
  const s = await S();
  assert.equal(s.trades.n, 3); assert.equal(s.trades.evidence, "NO EVIDENCE yet"); assert.ok(Array.isArray(s.trades.ci95));
  assert.ok(s.flows.some((f) => f.kind === "loss") && s.flows.some((f) => f.kind === "win") && s.flows.some((f) => f.kind === "sell"));
  for (let i = 1; i < s.flows.length; i++) assert.ok(s.flows[i - 1].id > s.flows[i].id, "flows newest first, ids monotonic");
  assert.ok(s.brain.some((b) => b.dept === "review" && /stop at/.test(b.text)));
  assert.equal(s.strategies.find((x) => x.id === "R3").trades, 3);
});

test("shadow lane: a cost-gate near miss is probed on paper, closed, graded, and kept out of the real ledger", async () => {
  const d = db(env);
  const sh = await d.one(`SELECT * FROM mob_aq_shadow WHERE symbol='COST'`);
  assert.ok(sh, "the COST near miss got a SHADOW probe"); assert.equal(sh.block_reason, "cost gate"); assert.match(sh.cost_source, /^measured \(the blocked trade's own quote\)/); assert.ok(sh.cost_pct > 9); assert.equal(sh.v, 2); assert.equal(sh.strategy, "R3");
  assert.ok(sh.stop_price < sh.entry_price && sh.target_price > sh.entry_price && sh.entry_price - sh.stop_price < sh.target_price - sh.entry_price, "the blocked setup's own levels, stop under target");
  const realBefore = (await d.one(`SELECT count(*)::int n FROM mob_aq_trades`)).n;
  prices[MINT.C] = sh.target_price * 1.01;
  const t = await tick(env);
  assert.ok(t.shadow.closed.some((x) => x.symbol === "COST" && x.why === "target"));
  const s = await S();
  assert.equal(s.shadow.tag, "SHADOW"); assert.ok(s.shadow.n >= 1); assert.ok(s.shadow.expectancyPct < 0, "target 9% minus a 10% round trip still loses");
  assert.ok(s.shadow.byReason.some((x) => x.reason === "cost gate"));
  assert.ok(s.brain.some((b) => /SHADOW COST R3: blocked for "cost gate".*The block was RIGHT/.test(b.text)));
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_trades`)).n, realBefore, "shadow never touches the real ledger");
  assert.equal(s.trades.n, realBefore);
});

test("whales: 2+ independent winners buying = signal; creator excluded; bots not winners; Helius funder clustering merges one owner", async () => {
  const d = db(env), W1 = "WhaleOne111", W2 = "WhaleTwo222", DEV = "CreatorDev333", BOT = "BotWallet444", MW = "WhaleMint1pump";
  // three real traders: six coins each, bought ten minutes before they were sold, five of them for a profit
  for (const w of [W1, W2, DEV]) for (const m of ["m1", "m2", "m3", "m4", "m5", "m6"])
    await d.q(`INSERT INTO mob_aq_wtrades (tx, wallet, mint, kind, sol, at) VALUES ($1,$2,$3,'buy',1,now() - interval '20 minutes'),($1,$2,$3,'sell',$4,now() - interval '10 minutes')`, [`${w}${m}`, w, m, m === "m6" ? 0.5 : 2]);
  // a bot: profitable on two coins but with hundreds of swaps per coin
  for (const m of ["m1", "m2"]) await d.q(`INSERT INTO mob_aq_wtrades (tx, wallet, mint, kind, sol, at) SELECT 'bot' || $2 || i, $1, $2, CASE WHEN i % 2 = 0 THEN 'buy' ELSE 'sell' END, CASE WHEN i % 2 = 0 THEN 1 ELSE 1.1 END, now() FROM generate_series(1, 200) i`, [BOT, m]);
  // the old book's fake winners: only two closed coins; "wins" whose sell came before any buy we saw; same-second round trips
  for (const m of ["m1", "m2"]) await d.q(`INSERT INTO mob_aq_wtrades (tx, wallet, mint, kind, sol, at) VALUES ($1,'TwoCoin',$2,'buy',1,now() - interval '20 minutes'),($1,'TwoCoin',$2,'sell',3,now() - interval '10 minutes')`, [`two${m}`, m]);
  for (const m of ["m1", "m2", "m3", "m4", "m5", "m6"]) {
    await d.q(`INSERT INTO mob_aq_wtrades (tx, wallet, mint, kind, sol, at) VALUES ($1,'SellFirst',$2,'sell',3,now() - interval '20 minutes'),($1,'SellFirst',$2,'buy',1,now() - interval '10 minutes')`, [`sf${m}`, m]);
    await d.q(`INSERT INTO mob_aq_wtrades (tx, wallet, mint, kind, sol, at) VALUES ($1,'SameSec',$2,'buy',1,now() - interval '10 minutes'),($1,'SameSec',$2,'sell',3,now() - interval '10 minutes' + interval '20 seconds')`, [`ss${m}`, m]);
  }
  let book = await refreshWinners(d);
  assert.equal(book.candidates, 3, "W1, W2 and the dev: five wins on six closed coins each"); assert.equal(book.winners, 0, "a candidate is not a winner until Jupiter's scorecard is read");
  const rowOf = async (w) => d.one(`SELECT cand, winner, closed, wins, jup FROM mob_aq_whales WHERE wallet=$1`, [w]);
  assert.deepEqual([(await rowOf("TwoCoin")).cand, (await rowOf("TwoCoin")).closed], [false, 2]); assert.deepEqual([(await rowOf("SellFirst")).closed, (await rowOf("SellFirst")).cand], [0, false], "a sell before any buy is not a closed coin"); assert.deepEqual([(await rowOf("SameSec")).closed, (await rowOf("SameSec")).cand], [0, false], "held 20 seconds: not counted");
  assert.equal((await rowOf(BOT)).cand, false);
  // Jupiter's scorecard on real responses: the old book's top wallet does 4,543 swaps a day (a bot); a human pace with a positive net passes
  const bot = scoreWallet(FXD.jupPnl, FXD.jupPnlWallet, 0.436, 71.5);
  assert.deepEqual([bot.ok, bot.swaps, bot.swapsDay > 1000, bot.heldCoins], [false, 23367, true, 8]); assert.match(bot.why, /^bot pace: \d+ swaps a day$/);
  const hum = scoreWallet(humanPnl("X"), "X", 0.5, 70); assert.deepEqual([hum.ok, hum.swapsDay, hum.bagsUsd, hum.netUsd], [true, 3.9, -3.5, 31.5]);
  assert.equal(scoreWallet(humanPnl("X"), "X", 0.01, 70).ok, false, "the bag it still holds is counted: net with bags below zero"); assert.equal(scoreWallet({}, "X", 1, 70), null);
  stubAll(); resetCalls();
  pnlFor[DEV] = () => { const j = humanPnl(DEV); j[DEV][SOL].pnl.totalBuys = 90000; return j; }; // one candidate turns out to trade at a bot's pace
  let sc = await scoreTick(env, { solUsd: 72 });
  assert.deepEqual([sc.scored, sc.ok], [3, 2]); assert.equal(CALLS.jupiterData, 3, "three scorecards a tick, inside the Jupiter budget");
  book = await refreshWinners(d);
  assert.equal(book.winners, 2); assert.equal((await rowOf(DEV)).winner, false); assert.match((await rowOf(DEV)).jup.why, /^bot pace/); assert.equal((await rowOf(W1)).winner, true);
  sc = await scoreTick(env, { solUsd: 72 }); assert.equal(sc.scored, 0, "scored wallets rest for 12 hours");
  delete pnlFor[DEV];
  // KOLscan: the real page slice parses into named wallets with their 1/7/30 day frames; they are seeds, not winners
  const kols = parseKolscan(FXD.kolscanSlice);
  assert.ok(kols.length >= 5, String(kols.length)); assert.equal(kols[0].wallet, "5YRgrP3mjGzrzirYYN5HAQH19cTYREYwGxW6XRJQUzij"); assert.equal(kols[0].name, "slingoor"); assert.ok(kols[0].frames["1"].wins >= 0 && typeof kols[0].frames["1"].profitSol === "number");
  assert.deepEqual(parseKolscan("<html>nothing</html>"), []);
  let kt = await kolTick(env); assert.equal(kt.ok, false, "page down: said so, nothing invented");
  kolPage = FXD.kolscanSlice; await d.q(`DELETE FROM mob_aq_market WHERE k='kolscan'`);
  kt = await kolTick(env); assert.deepEqual([kt.ok, kt.wallets, kt.fresh], [true, kols.length, true]);
  resetCalls(); sc = await scoreTick(env, { solUsd: 72, max: 200 }); assert.ok(sc.scored >= 5 && sc.scored <= 36, `seeds get a scorecard inside the call budget: ${JSON.stringify(sc)}`);
  assert.equal((await refreshWinners(d)).winners, 2, "a good scorecard does not make a seed a winner: it has no closed coins of its own in our swaps");
  const k0 = await d.one(`SELECT source, label, cand, winner, kol FROM mob_aq_whales WHERE wallet=$1`, [kols[0].wallet]);
  assert.deepEqual([k0.source, k0.label, k0.cand, k0.winner], ["kolscan", "slingoor", true, false]); assert.ok(k0.kol["1"]);
  kolPage = null;
  // the signal reads up to three pages of swaps (the first page of a busy coin is seconds, not 15 minutes); a KOL's buy is logged as its own source
  tradesFor[MW] = (u) => (u.searchParams.get("offset") ? { txs: [jtx(W2, "buy", 1, MW, 7), jtx(kols[0].wallet, "buy", 4, MW, 8)], next: null }
    : { txs: [W1, DEV, BOT].map((w, i) => jtx(w, "buy", 1, MW, i)).concat([{ ...jtx("Mev555", "buy", 5, MW), isMev: true }]), next: 777 });
  resetCalls();
  let w = await whaleSignal(env, { mint: MW, symbol: "WH", priceUsd: 1 }, { creator: DEV, insiders: [] }, () => {});
  assert.equal(w.signal, true); assert.equal(w.independent, 2, "W2 was on the second page"); assert.equal(w.excluded, 1); assert.match(w.funders, /unchecked \(no HELIUS_API_KEY\)/);
  assert.equal((await d.one(`SELECT independent FROM mob_aq_signals WHERE mint=$1 AND source='own'`, [MW])).independent, 2, "every signal is logged");
  const ks = await d.one(`SELECT label, source FROM mob_aq_signals WHERE mint=$1 AND source='kolscan'`, [MW]); assert.equal(ks.label, "slingoor");
  assert.ok(!(await d.one(`SELECT 1 FROM mob_aq_wtrades WHERE wallet='Mev555'`)), "MEV swaps never enter the book");
  // with a Helius key: both winners were first funded by the same wallet -> one owner -> no signal
  env.HELIUS_API_KEY = "hk-test"; let lastWallet = null;
  mock("POST", "https://mainnet.helius-rpc.com/", (rec) => {
    assert.ok(rec.url.includes("api-key=hk-test"));
    const b = JSON.parse(rec.body);
    if (b.method === "getSignaturesForAddress") { lastWallet = b.params[0]; return clone(FX2.rpcSigs); }
    const tx = clone(FX2.rpcTx); tx.result.transaction.message.instructions[0].parsed.info.wallet = lastWallet; return tx;
  });
  w = await whaleSignal(env, { mint: MW, symbol: "WH", priceUsd: 1 }, { creator: DEV, insiders: [] }, () => {});
  assert.equal(w.winners, 2); assert.equal(w.independent, 1); assert.equal(w.signal, false); assert.match(w.funders, /checked \(helius\)/);
  assert.equal(CALLS.helius, 4, "2 RPC calls per wallet, counted against the budget");
  assert.equal((await d.q(`SELECT DISTINCT funder FROM mob_aq_funders`)).length, 1);
  await d.q(`DELETE FROM mob_aq_funders`); delete env.HELIUS_API_KEY;
});

test("kill switch blocks every new entry; a loss streak throttles size on paper, never halts", async () => {
  await clearCache();
  trendingPools = [pool("FRESH", MINT.F, POOL.F, 300000)];
  assert.equal((await R("POST", "/api/aq/kill", { body: { on: true } })).status, 401);
  assert.equal((await R("POST", "/api/aq/kill", { bearer: "tok-test", body: { on: "yes" } })).status, 400);
  assert.equal((await R("POST", "/api/aq/kill", { cookie, body: { on: true } })).status, 200);
  const t = await tick(env);
  assert.equal(t.entered, null, JSON.stringify(t)); assert.equal(t.evaluated.length, 0);
  let s = await S(); assert.equal(s.killSwitch, true); assert.equal(s.council.last.reason, "risk: kill switch on");
  await R("POST", "/api/aq/kill", { bearer: "tok-test", body: { on: false } });
  // three recent losses in a row
  await db(env).q(`INSERT INTO mob_aq_trades (strategy, symbol, pnl_sol, pnl_pct, reason) VALUES ('R3','L1',-0.001,-2,'stop'),('R3','L2',-0.001,-2,'stop'),('R3','L3',-0.001,-2,'stop')`);
  // PAPER never halts on a losing streak: it asks for 10 more score points; the size stays the CEO's fixed 0.26 SOL (cut only by cash, survival or the pool)
  const t2 = await tick(env);
  assert.ok(t2.entered && t2.entered.symbol === "FRESH", JSON.stringify(t2.evaluated)); assert.equal(t2.entered.sizeSol, 0.26, String(t2.entered.sizeSol));
  s = await S(); assert.ok(!s.council.vetoes.some((v) => /loss-streak/.test(v.reason)));
  assert.match(s.departments.find((x) => x.id === "risk").workers.find((w) => w.job === "Loss-streak throttle").note, /3 losses in a row: score \+10 \(paper never halts; the size stays the CEO's fixed position\)/);
  await db(env).q(`DELETE FROM mob_aq_positions WHERE mint=$1`, [MINT.F]); await db(env).q(`UPDATE mob_aq_state SET v='1' WHERE k='cash_sol'`);
});

test("state JSON follows the contract", async () => {
  const s = await S();
  for (const k of ["build", "mode", "killSwitch", "updatedAt", "equitySol", "startSol", "pnlTodaySol", "pnlTotalSol", "trades", "positions", "recent", "flows", "council", "departments", "market", "brain", "strategies", "helpers", "tools", "xfeed"]) assert.ok(k in s, k);
  assert.equal(s.mode, "PAPER"); assert.equal(s.startSol, 1);
  assert.deepEqual(s.departments.map((x) => x.id), DEPT_IDS);
  assert.deepEqual(DEPT_IDS, ["scouts_sol", "scouts_stocks", "whales", "news", "setups", "costs", "council", "risk", "execution", "review", "learning", "ops"]);
  const god = Object.fromEntries(s.departments.map((x) => [x.id, x.god]));
  assert.deepEqual({ h: god.scouts_sol, a: god.learning, t: god.setups, z: god.risk, m: god.execution, d: god.news, c: god.council }, { h: "hecate", a: "apollo", t: "athena", z: "zeus", m: "hermes", d: "dionysus", c: null });
  for (const dp of s.departments) {
    assert.equal(dp.workers.length, 12, dp.id); assert.ok(dp.skills.length >= 2); assert.equal(typeof dp.live, "boolean");
    for (const w of dp.workers) { assert.ok(["idle", "busy", "blocked"].includes(w.status)); assert.ok(["code", "claude", "grok", "chatgpt"].includes(w.power)); assert.ok(w.skills.length); }
  }
  assert.equal(s.departments.find((x) => x.id === "scouts_stocks").live, true); // every department reports a real boolean; whales go live when swaps were read
  assert.ok(s.departments.find((x) => x.id === "scouts_sol").workers.find((w) => w.job === "Trending list").status === "busy");
  assert.ok(s.market.sol.price > 0 && s.market.fearGreed.value === 10);
  assert.ok(s.council.vetoes.length <= 10 && s.flows.length <= 40 && s.brain.length <= 30);
  assert.deepEqual(s.strategies.map((x) => x.id), ["R1", "R2", "R3", "R4", "R5", "R6", "R7"]);
  assert.deepEqual(s.rules.map((r) => r.name).sort(), ["boosted", "copycat", "danger_risk", "fear", "lp_locked", "no_whale", "top10", "top_holder", "young"]);
  assert.ok(s.rules.every((r) => typeof r.weight === "number" && r.blockedWinners >= 0 && r.blockedLosers >= 0)); assert.ok(s.council_rules.hard.length === 11 && typeof s.tradesLastHour === "number");
  assert.equal(s.strategies.find((x) => x.id === "R1").status, "not tested");
  assert.deepEqual(s.tools.map((t) => t.name).sort(), ["Freqtrade", "Hummingbot", "Kronos", "NautilusTrader", "skfolio"]);
  assert.ok(s.tools.every((t) => t.status === "planned" && t.usedBy));
  assert.deepEqual(s.helpers, { grok: "not connected", chatgpt: "not connected", codex: "not connected", codexLastAt: null, grokLastAt: null, chatgptLastAt: null });
  assert.ok(s.tape && s.tape.candles.length > 10 && s.tape.candles.length <= 90 && ["PASS", "BLOCK"].includes(s.tape.verdict)); assert.ok(s.tape.candles[0].t < s.tape.candles.at(-1).t);
  assert.ok(s.costs.length >= 1 && s.costs.every((c) => typeof c.rtPct === "number" && c.symbol)); assert.ok(s.council.recent.length <= 20 && s.council.recent.some((v) => v.verdict === "PASS"));
  assert.deepEqual(s.xfeed, [], "no invented posts");
  const txt = JSON.stringify(s);
  for (const secret of [env.ADMIN_PASSWORD, env.MOB_API_TOKEN, env.DATABASE_URL, "postgres://"]) assert.ok(!txt.includes(secret));
  assert.equal((await R("GET", "/api/aq/state")).status, 401);
  assert.equal((await R("GET", "/api/aq/state", { cookie })).status, 200);
});

test("CEO makes a bot (no vote); a bot-made bot waits for the Council", async () => {
  assert.equal((await R("POST", "/api/aq/bots", { body: { name: "x" } })).status, 401);
  assert.equal((await R("POST", "/api/aq/bots", { bearer: "tok-test", body: { name: "Kira", dept: "nope", job: "j" } })).status, 400);
  const r = await R("POST", "/api/aq/bots", { cookie, body: { name: "Kira", dept: "whales", job: "Watch one wallet", rules: "paper only", skills: ["gmgn-fib"], power: "claude" } });
  assert.equal(r.status, 201);
  let s = await S();
  const kira = s.departments.find((x) => x.id === "whales").workers.find((w) => w.name === "Kira");
  assert.ok(kira); assert.equal(kira.power, "claude"); assert.equal(kira.by, "ceo");
  assert.ok((await proposeBot(env, "nope.key", { name: "Z", dept: "ops", job: "j" })).error);
  await proposeBot(env, "ln.experiments", { name: "Bolt", dept: "ops", job: "Count blocks", power: "code" });
  await proposeBot(env, "ln.experiments", { name: "Pricey", dept: "ops", job: "Think hard", power: "claude" });
  s = await S();
  assert.ok(!s.departments.find((x) => x.id === "ops").workers.some((w) => w.name === "Bolt"), "pending bot not in the city yet");
  await tick(env);
  s = await S();
  const ops = s.departments.find((x) => x.id === "ops").workers;
  assert.ok(ops.some((w) => w.name === "Bolt" && w.by === "bot")); assert.ok(!ops.some((w) => w.name === "Pricey"));
  const v = await db(env).one(`SELECT verdict, note FROM mob_aq_bots WHERE name='Pricey'`); assert.equal(v.verdict, "BLOCK"); assert.match(v.note, /budget/);
});

test("helper inbox is evidence only; xfeed and briefing", async () => {
  const before = await db(env).one(`SELECT count(*)::int n FROM mob_aq_positions`);
  assert.equal((await R("POST", "/api/aq/helper", { body: { from: "grok" } })).status, 401);
  assert.equal((await R("POST", "/api/aq/helper?key=aqkey", { body: { from: "grok", role: "scout", text: "x", labels: ["SURE"] } })).status, 400);
  const r = await R("POST", "/api/aq/helper?key=aqkey", { body: { from: "grok", role: "news", channel: "x", text: "Posts say $GOOD listing soon", labels: ["VERIFIED"] } });
  assert.equal(r.status, 201); const m = (await r.json()).message; assert.equal(m.trigger, false);
  await R("POST", "/api/aq/helper", { bearer: "tok-test", body: { from: "chatgpt", role: "skeptic", text: "Costs eat the edge", labels: ["INFERRED"] } });
  const s = await S();
  assert.equal(s.helpers.grok, "connected"); assert.equal(s.helpers.chatgpt, "connected"); assert.ok(s.helpers.grokLastAt);
  assert.equal(s.xfeed.length, 1); assert.deepEqual({ ...s.xfeed[0], at: 0 }, { at: 0, section: "news", text: "Posts say $GOOD listing soon", label: "CLAIMED", source: "grok", weight: 1 });
  assert.equal((await db(env).one(`SELECT count(*)::int n FROM mob_aq_positions`)).n, before.n, "a helper message never opens a trade");
  const b = await R("GET", "/api/aq/briefing?key=aqkey"); assert.equal(b.status, 200);
  const txt = await b.text();
  for (const k of ["- Mode: PAPER", "Kill switch:", "Free market context: Fear and Greed 10", "Measured costs today", "Open positions:", "Yesterday's journal"]) assert.ok(txt.includes(k), k);
});

test("page, bundle and R2 assets behind the admin session", async () => {
  env.MEDIA.store.set("aq/hero.glb", new Uint8Array([1, 2, 3]));
  for (const p of ["/aq", "/aq/app.js", "/aq/assets/hero.glb"]) assert.equal((await R("GET", p)).status, 302, p);
  assert.equal((await R("GET", "/aq", { bearer: "tok-test" })).status, 302);
  const pg = await R("GET", "/aq", { cookie }); assert.equal(pg.status, 200); assert.ok((await pg.text()).includes("/aq/app.js"));
  assert.match((await R("GET", "/aq/app.js", { cookie })).headers.get("content-type"), /javascript/);
  const a = await R("GET", "/aq/assets/hero.glb", { cookie }); assert.equal(a.status, 200); assert.equal(a.headers.get("content-type"), "model/gltf-binary");
  assert.equal((await R("GET", "/aq/assets/none.png", { cookie })).status, 404);
  assert.equal((await R("GET", "/aq/assets/../secret", { cookie })).status, 404);
});

test("cron: '* * * * *' runs the Aquarius tick, '*/5' still runs mob's tick", async () => {
  const { default: worker } = await import("../src/worker.mjs");
  const waits = [];
  await worker.scheduled({ cron: "* * * * *" }, env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  const lt = await db(env).one(`SELECT v FROM mob_aq_state WHERE k='last_tick'`); assert.ok(lt.v.at);
  assert.ok(calls.length >= 0);
});

test("helper MCP: link + access code, every tool, and no money control", async () => {
  const mcp = (body, key = "helperkey123", headers = {}) => R("POST", `/api/aq/helper/${key}/mcp`, { body, headers });
  const call = async (name, args, headers) => (await (await mcp({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } }, undefined, headers)).json()).result;
  assert.equal((await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "wrong")).status, 404);
  const saved = env.AQ_HELPER_KEY; delete env.AQ_HELPER_KEY;
  assert.equal((await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" })).status, 404, "unset secret = 404");
  env.AQ_HELPER_KEY = saved;
  const init = await mcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "Codex" } } });
  assert.equal(init.status, 200); const sid = init.headers.get("mcp-session-id"); assert.ok(sid);
  assert.equal((await init.json()).result.serverInfo.name, "aquarius-helpers");
  const tools = (await (await mcp({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json()).result.tools.map((t) => t.name);
  assert.deepEqual(tools, ["aq_state", "aq_briefing", "aq_post_evidence", "aq_propose_bot", "aq_submit_pick", "aq_list_tasks", "aq_task_done", "aq_council_cases", "aq_council_vote", "aq_alert", "aq_chat_post", "aq_chat_read"]);
  for (const t of tools) assert.ok(!/kill|trade|buy|sell|limit|secret|approve/.test(t));
  const st = JSON.parse((await call("aq_state", {}, { "mcp-session-id": sid })).content[0].text); assert.equal(st.mode, "PAPER");
  assert.match((await call("aq_briefing", { helper: "grok" })).content[0].text, /- Mode: PAPER/);
  const ev = await call("aq_post_evidence", { helper: "grok", role: "scout", text: "X says $FRESH trending", label: "VERIFIED", section: "x" });
  assert.ok(!ev.isError, JSON.stringify(ev));
  const ev2 = await call("aq_post_evidence", { role: "news", text: "codex note", label: "INFERRED" }, { "mcp-session-id": sid });
  assert.ok(!ev2.isError, "helper name from initialize clientInfo");
  const s = await S(); assert.equal(s.xfeed[0].text, "X says $FRESH trending"); assert.equal(s.xfeed[0].label, "CLAIMED");
  assert.equal((await db(env).one(`SELECT from_helper FROM mob_aq_helpers WHERE text='codex note'`)).from_helper, "codex");
  const pb = await call("aq_propose_bot", { helper: "chatgpt", name: "Sneak", dept: "ops", job: "x", power: "code", approved: true, status: "busy" });
  assert.equal(JSON.parse(pb.content[0].text).approved, false);
  assert.equal((await db(env).one(`SELECT approved FROM mob_aq_bots WHERE name='Sneak'`)).approved, false, "a helper never makes an approved bot");
  assert.equal((await R("POST", "/api/aq/tasks", { body: { title: "x" } })).status, 401);
  const tk = (await (await R("POST", "/api/aq/tasks", { cookie, body: { title: "Read the Freqtrade fee docs", kind: "research" } })).json()).task;
  const open = JSON.parse((await call("aq_list_tasks", { helper: "chatgpt" })).content[0].text).tasks; assert.ok(open.some((t) => t.id === tk.id));
  assert.ok(!(await call("aq_task_done", { helper: "chatgpt", id: tk.id, result: "fees: --fee flag" })).isError);
  assert.ok((await call("aq_task_done", { helper: "chatgpt", id: tk.id, result: "again" })).isError, "done twice");
  // money control is impossible: no such tools, kill switch and cash untouched
  const cash0 = (await db(env).one(`SELECT v FROM mob_aq_state WHERE k='cash_sol'`)).v, kill0 = (await db(env).one(`SELECT v FROM mob_aq_state WHERE k='kill'`)).v;
  for (const n of ["aq_kill", "aq_trade", "aq_buy", "aq_set_limits", "aq_secrets", "aq_create_bot"]) assert.ok((await call(n, { helper: "grok", on: true })).isError, n);
  assert.equal((await db(env).one(`SELECT v FROM mob_aq_state WHERE k='cash_sol'`)).v, cash0); assert.equal((await db(env).one(`SELECT v FROM mob_aq_state WHERE k='kill'`)).v, kill0);
  const log = await db(env).q(`SELECT helper, tool, ok FROM mob_aq_helper_log`);
  assert.ok(log.some((l) => l.helper === "codex" && l.tool === "aq_state") && log.some((l) => l.helper === "grok" && l.tool === "aq_kill" && l.ok === false));
});

test("survival: every stage, critical tightens risk, destroyed stops trading, only Alex rebuilds", async () => {
  const { survival } = await import("../src/aq/logic.mjs");
  assert.deepEqual([1.5, 1, 0.7, 0.3, 0.1, 0].map((e) => survival(e, 1).stage), ["thriving", "healthy", "hurt", "critical", "destroyed", "destroyed"]);
  assert.equal(survival(0.3, 1).health, 30); assert.equal(survival(2, 1).health, 100);
  assert.deepEqual([survival(0.3, 1).sizeMult, survival(0.3, 1).maxOpen], [0.5, 1]);
  const d = db(env);
  await d.q(`DELETE FROM mob_aq_positions`);
  await d.q(`UPDATE mob_aq_state SET v='0.3' WHERE k='cash_sol'`);
  await d.q(`INSERT INTO mob_aq_positions (strategy, mint, pool, symbol, decimals, tokens_raw, size_sol, fee_sol, entry_price_usd, stop_price, target_price, time_stop_at, last_value_sol)
    VALUES ('R3','HOLDmint','x','HOLD',6,'1',0.01,0.0001,1,0.5,9,now() + interval '1 hour',0.01)`);
  prices.HOLDmint = 1;
  await tick(env);
  let s = await S();
  assert.equal(s.survival.stage, "critical"); assert.equal(s.survival.maxOpen, 1);
  assert.ok(s.council.vetoes.some((v) => v.reason === "risk: max open positions (critical)"));
  await d.q(`UPDATE mob_aq_state SET v='0.05' WHERE k='cash_sol'`);
  const t = await tick(env);
  assert.equal(t.entered, null); assert.equal(t.exits.length, 0);
  s = await S();
  assert.equal(s.survival.stage, "destroyed"); assert.equal(s.survival.health, 5); // the held position marks at ~0 SOL (1 raw unit)
  assert.ok(s.council.vetoes.some((v) => /island destroyed/.test(v.reason)));
  assert.ok(s.brain.some((b) => /^POST-MORTEM/.test(b.text)));
  const brainN = (await d.one(`SELECT count(*)::int n FROM mob_aq_brain`)).n;
  await d.q(`UPDATE mob_aq_state SET v='5' WHERE k='cash_sol'`); // even a bounce does not revive it
  await tick(env); s = await S(); assert.equal(s.survival.stage, "destroyed");
  assert.equal((await R("POST", "/api/aq/rebuild", { bearer: "tok-test" })).status, 403, "Claude cannot rebuild");
  assert.equal((await R("POST", "/api/aq/rebuild")).status, 401);
  assert.equal((await R("POST", "/api/aq/rebuild", { cookie })).status, 200);
  s = await S();
  assert.equal(s.survival.stage, "healthy"); assert.equal(s.equitySol, 1); assert.equal(s.positions.length, 0);
  assert.ok((await d.one(`SELECT count(*)::int n FROM mob_aq_brain`)).n > brainN, "brain memory kept and grows");
});

test("sell all: Alex only; positions sold at the Jupiter quote, shadows closed, no-price ones kept", async () => {
  const d = db(env);
  await d.q(`DELETE FROM mob_aq_positions`); await d.q(`UPDATE mob_aq_shadow SET closed_at=now() WHERE closed_at IS NULL`);
  await d.q(`INSERT INTO mob_aq_positions (strategy, mint, pool, symbol, decimals, tokens_raw, size_sol, fee_sol, entry_price_usd, stop_price, target_price, time_stop_at, last_price_usd)
    VALUES ('R3','SELLmint','x','SELL',6,'${TOK(0.05)}',0.05,0.0001,1.1,1,2,now() + interval '1 hour',1.1)`);
  await d.q(`INSERT INTO mob_aq_shadow (mint, pool, symbol, block_reason, entry_price, stop_price, target_price, cost_pct, time_stop_at) VALUES ('SHmint','x','SH','cost gate',1,0.9,1.2,2,now() + interval '1 hour'), ('NOPXmint','x','NOPX','cost gate',1,0.9,1.2,2,now() + interval '1 hour')`);
  prices.SELLmint = 1.1; prices.SHmint = 1.05; prices.NOPXmint = null;
  const cash0 = Number((await d.one(`SELECT v FROM mob_aq_state WHERE k='cash_sol'`)).v);
  assert.equal((await R("POST", "/api/aq/sellall", { bearer: "tok-test" })).status, 403);
  assert.equal((await R("POST", "/api/aq/sellall")).status, 401);
  const r = await R("POST", "/api/aq/sellall", { cookie }); assert.equal(r.status, 200);
  const o = await r.json();
  assert.equal(o.sold.length, 1); assert.equal(o.shadowClosed.length, 1); assert.equal(o.kept[0].symbol, "NOPX");
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_positions`)).n, 0);
  const t = await d.one(`SELECT * FROM mob_aq_trades WHERE symbol='SELL'`);
  assert.equal(t.reason, "CEO sell all"); assert.ok(t.fees_sol > 0.0001 && t.back_sol > 0);
  assert.ok(Math.abs(Number((await d.one(`SELECT v FROM mob_aq_state WHERE k='cash_sol'`)).v) - (cash0 + t.back_sol)) < 1e-9, "cash gets the quote minus the fee");
  assert.equal((await d.one(`SELECT outcome FROM mob_aq_shadow WHERE symbol='SH'`)).outcome, "CEO sell all");
  const s = await S();
  assert.ok(s.flows.some((f) => f.label === "sell SELL (CEO sell all)")); assert.ok(s.brain.some((b) => /^CEO sell all: sold 1/.test(b.text)));
});

test("helper lanes: a pick is judged for the record, paper-tracked apart, scored, and never touches the real ledger", async () => {
  const d = db(env);
  const call = async (name, args) => (await (await R("POST", "/api/aq/helper/helperkey123/mcp", { body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } })).json()).result;
  const GM = "GrokPick11111111111111111111111111111111pump", BAD = "NoSuchMint1111111111111111111111111111111111";
  const ok = { helper: "grok", symbol: "GP", mint: GM, entry: 2, stopPct: 5, targetPct: 12, thesis: "X talk plus volume", labels: ["CLAIMED"] };
  assert.ok((await call("aq_submit_pick", { ...ok, mint: "not-a-mint" })).isError);
  assert.ok((await call("aq_submit_pick", { ...ok, stopPct: 0 })).isError);
  assert.ok((await call("aq_submit_pick", { ...ok, labels: ["SURE"] })).isError);
  assert.ok((await call("aq_submit_pick", { ...ok, helper: undefined })).isError, "a pick needs a named helper");
  const sub = JSON.parse((await call("aq_submit_pick", ok)).content[0].text);
  assert.equal(sub.lane, "LANE:grok"); assert.equal(sub.realLedger, false); assert.equal(sub.status, "queued");
  await call("aq_submit_pick", { ...ok, helper: "chatgpt", mint: BAD, symbol: "NOPE" });
  const before = { trades: (await d.one(`SELECT count(*)::int n FROM mob_aq_trades`)).n, pos: (await d.one(`SELECT count(*)::int n FROM mob_aq_positions`)).n, cash: (await d.one(`SELECT v FROM mob_aq_state WHERE k='cash_sol'`)).v };
  prices[GM] = 1.1; liqOf[GM] = 250000;
  let t = await tick(env);
  assert.equal(t.lanes.judged.status, "open"); assert.equal(t.lanes.judged.verdict, "PASS"); assert.ok(t.lanes.judged.rtPct > 0);
  const pk = await d.one(`SELECT * FROM mob_aq_picks WHERE mint=$1`, [GM]);
  assert.equal(pk.entry_price, 1.1); assert.ok(Math.abs(pk.stop_price - 1.045) < 1e-9); assert.ok(Math.abs(pk.target_price - 1.232) < 1e-9); assert.equal(pk.cost_source, "measured");
  assert.ok(await d.one(`SELECT 1 FROM mob_aq_council WHERE strategy='LANE:grok' AND verdict='PASS'`), "Council verdict recorded");
  t = await tick(env);
  assert.equal(t.lanes.judged.status, "rejected"); assert.match(t.lanes.judged.reason, /mint not found/);
  prices[GM] = 1.3;
  t = await tick(env);
  assert.deepEqual(t.lanes.closed.map((x) => [x.helper, x.why]), [["grok", "target"]]);
  const s = await S();
  const grok = s.lanes.find((l) => l.helper === "grok"), ours = s.lanes.find((l) => l.helper === "aquarius"), gpt = s.lanes.find((l) => l.helper === "chatgpt");
  assert.equal(grok.n, 1); assert.equal(grok.winRate, 1); assert.ok(grok.expectancyPct > 9 && grok.expectancyPct < 12); assert.equal(grok.weight, 1, "weight moves only after 5 closed picks");
  assert.equal(gpt.rejected, 1); assert.equal(gpt.n, 0); assert.equal(ours.n, s.trades.n);
  assert.ok(s.brain.some((b) => /^LANE:grok pick GP: target at .* Council had said PASS .* RIGHT\. Lane grok: 1 picks.*ours: \d+ trades/.test(b.text)));
  // weight: 5 closed picks averaging -5% -> 0.5; +30% -> capped at 2; the next evidence carries it
  await d.q(`INSERT INTO mob_aq_picks (helper, mint, thesis, stop_pct, target_pct, status, pnl_pct) SELECT 'codex','m','t',5,10,'closed',-5 FROM generate_series(1,4)`);
  await d.q(`INSERT INTO mob_aq_picks (helper, mint, pool, symbol, thesis, stop_pct, target_pct, status, verdict, verdict_reason, entry_price, stop_price, target_price, cost_pct, time_stop_at) VALUES ('codex','CodexMint','x','CX','t',5,10,'open','BLOCK','cost gate',1,0.95,1.1,1,now() + interval '1 hour')`);
  prices.CodexMint = 0.9;
  await tick(env);
  const st2 = await S(); const codex = st2.lanes.find((l) => l.helper === "codex");
  assert.equal(codex.n, 5); assert.ok(codex.weight < 1 && codex.weight >= 0.25, String(codex.weight));
  const ev = await call("aq_post_evidence", { helper: "codex", role: "skeptic", text: "weighted note", label: "INFERRED" });
  assert.ok(!ev.isError); assert.equal((await d.one(`SELECT weight FROM mob_aq_helpers WHERE text='weighted note'`)).weight, codex.weight);
  assert.ok(st2.brain.some((b) => /LANE:codex pick CX: stop .* Council had said BLOCK \(cost gate\): the Council was RIGHT/.test(b.text)));
  const after = { trades: (await d.one(`SELECT count(*)::int n FROM mob_aq_trades`)).n, pos: (await d.one(`SELECT count(*)::int n FROM mob_aq_positions`)).n, cash: (await d.one(`SELECT v FROM mob_aq_state WHERE k='cash_sol'`)).v };
  assert.deepEqual(after, before, "no helper pick ever opens, closes or moves money on the real ledger");
});

test("production path: GeckoTerminal refuses (429), DexScreener alone feeds candidates, trending, prices and our own candles", async () => {
  const d = db(env);
  await d.q(`DELETE FROM mob_aq_market`); await d.q(`DELETE FROM mob_aq_watch`); await d.q(`DELETE FROM mob_aq_prices`); await d.q(`DELETE FROM mob_aq_positions`);
  await d.q(`DELETE FROM mob_aq_trades WHERE symbol IN ('L1','L2','L3')`); await d.q(`DELETE FROM mob_aq_council`);
  resetMocks();
  const GATO = FX3.dsBatch[0].baseToken.address;
  let dsDown = false; const gatoPx = { [GATO]: 1.1 };
  for (const m of FX3.dsBatch) gatoPx[m.baseToken.address] ??= Number(m.priceUsd);
  mock("GET", "https://api.dexscreener.com/", () => (dsDown ? new Response("error code: 1015", { status: 429 }) : undefined));
  assert.equal(bestPairs(FX3.dsBatch).length, 5);
  mock("GET", /api\.geckoterminal\.com|api\.coingecko\.com\/api\/v3\/onchain/, () => res({ status: { error_code: 429, error_message: "Rate limit exceeded" } }, 429));
  mock("GET", "https://api.dexscreener.com/token-boosts/latest/v1", () => clone(FX3.dsBoostsLatest));
  mock("GET", "https://api.dexscreener.com/token-boosts/top/v1", () => clone(FX3.dsBoostsTop));
  mock("GET", "https://api.dexscreener.com/token-profiles/latest/v1", () => clone(FX3.dsProfiles));
  mock("GET", "https://api.dexscreener.com/community-takeovers/latest/v1", () => clone(FX3.dsCto));
  mock("GET", "https://api.dexscreener.com/tokens/v1/solana/", (rec) => { const want = rec.url.split("/").pop().split(","); return clone(FX3.dsBatch).filter((p) => want.includes(p.baseToken.address)).map((p) => (p.baseToken.address === GATO ? { ...p, priceUsd: "1.1" } : p)); });
  // CoinGecko's price call is refused too (seen in production): SOL comes from DexScreener's SOL/USDC pair, BTC stays unknown
  mock("GET", "https://api.coingecko.com/api/v3/simple/price", () => res({ status: { error_code: 429, error_message: "Rate limit exceeded" } }, 429));
  mock("GET", "https://lite-api.jup.ag/price/v3", jupPx(() => gatoPx));
  mock("GET", "https://datapi.jup.ag/", () => res({ status: 503 }, 503)); // Jupiter's data API down as well: our own bars are the fallback
  mock("GET", "https://api.alternative.me/fng/", () => clone(FX.fng));
  mock("GET", /rugcheck\.xyz\/v1\/tokens\/([^/]+)\/report$/, () => safeRug());
  mock("GET", "https://lite-api.jup.ag/swap/v1/quote", quoteMock(() => gatoPx));
  let t = await tick(env);
  let s = await S();
  assert.equal(t.feeds.geckoterminal, false); assert.equal(t.feeds.dexscreener, true);
  assert.ok(s.market.trending.length >= 3, "trending comes from DexScreener");
  assert.equal(s.market.sol.price, JSOL.usdPrice); assert.equal(s.market.btc, null, "BTC unknown, never invented"); assert.equal(t.feeds.coingecko, false); assert.equal(t.feeds.sol_price, true); assert.ok(s.market.trending.some((x) => x.symbol === "GATO" && x.boosted === true));
  assert.equal(s.departments.find((x) => x.id === "scouts_sol").live, true);
  assert.ok(s.health.errors.some((e) => e.feed === "gt:trending" && /HTTP 429 .*Rate limit/.test(e.error)), JSON.stringify(s.health.errors));
  assert.ok(s.history.priceSamples1h >= 3 && s.history.ready === 0);
  assert.ok((await d.q(`SELECT 1 FROM mob_aq_council WHERE reason LIKE 'missing data: candles (own history 1/30 bars)'`)).length, "no history yet = NO, with the bar count");
  // 59 minutes of our own samples for GATO: 1.00 -> 1.20, back to 1.09, then the live tick samples 1.10 (a green bounce)
  await d.q(`DELETE FROM mob_aq_council`); await d.q(`DELETE FROM mob_aq_prices WHERE mint=$1`, [GATO]);
  const px = (i) => (i < 40 ? 1 + (0.2 * i) / 40 : i === 40 ? 1.2 : 1.2 - (0.11 * (i - 40)) / 18);
  await d.q(`INSERT INTO mob_aq_prices (mint, at, price) SELECT $1, date_trunc('minute', now()) - make_interval(mins => 59 - i), p FROM unnest($2::int[], $3::float8[]) x(i, p)`, [GATO, [...Array(59).keys()], [...Array(59).keys()].map(px)]);
  await d.q(`UPDATE mob_aq_trades SET opened_at = now() - interval '1 hour'`); // no entry for an hour: the Council must explore
  t = await tick(env);
  const g = t.evaluated.find((e) => e.symbol === "GATO");
  assert.equal(g.verdict, "PASS", JSON.stringify(t.evaluated)); assert.equal(g.tag, "EXPLORE"); assert.equal(g.tier, "C");
  const row = await d.one(`SELECT facts FROM mob_aq_council WHERE symbol='GATO' AND verdict='PASS'`);
  assert.equal(row.facts.candles.src, "own"); assert.ok(row.facts.candles.ownBars >= 30); assert.equal(row.facts.setup.signal, true);
  s = await S(); assert.ok(s.history.ready >= 1); assert.equal(s.positions[0].symbol, "GATO");
  assert.equal(s.departments.find((x) => x.id === "setups").live, true);
  // DexScreener refuses too (HTTP 429 "error code: 1015", seen in production): Jupiter keeps the samples, the list and the exits alive
  dsDown = true; await d.q(`UPDATE mob_aq_market SET at = now() - interval '10 minutes' WHERE k='ds:universe'`);
  const n0 = (await d.one(`SELECT count(*)::int n FROM mob_aq_prices`)).n;
  await d.q(`UPDATE mob_aq_prices SET at = at - interval '1 minute'`);
  t = await tick(env); s = await S();
  assert.equal(t.feeds.dexscreener, false); assert.equal(t.feeds.prices, true);
  assert.ok((await d.one(`SELECT count(*)::int n FROM mob_aq_prices`)).n > n0, "samples keep accumulating");
  assert.ok(s.market.trending.length >= 3); assert.ok(s.market.trending.some((x) => x.symbol === "GATO" && x.boosted), "boost flag kept from the last good read");
  assert.equal(s.departments.find((x) => x.id === "scouts_sol").live, true);
  assert.ok(s.health.errors.some((e) => e.feed === "ds:universe" && /429 error code: 1015/.test(e.error)), JSON.stringify(s.health.errors));
  assert.equal(s.positions[0].price, 1.1, "the open position is still priced");
});

test("zip drop-off: access code, .zip names only, put + list + get; nothing else", async () => {
  env.AQ_DROP_KEY = "dropkey456";
  const zip = new Uint8Array(1024).fill(7);
  assert.equal((await R("PUT", "/api/aq/drop/wrong/a.zip", { body: zip })).status, 404);
  const saved = env.AQ_DROP_KEY; delete env.AQ_DROP_KEY;
  assert.equal((await R("PUT", "/api/aq/drop/dropkey456/a.zip", { body: zip })).status, 404, "unset secret = 404");
  env.AQ_DROP_KEY = saved;
  for (const bad of ["a.txt", "a.zip.exe", "sp%20ace.zip", "..zip.sh"]) assert.equal((await R("PUT", `/api/aq/drop/dropkey456/${bad}`, { body: zip })).status, 400, bad);
  assert.equal((await R("PUT", "/api/aq/drop/dropkey456/big.zip", { body: zip, headers: { "content-length": String(96 * 1024 * 1024) } })).status, 413);
  const r = await R("PUT", "/api/aq/drop/dropkey456/work-1.zip", { body: zip }); assert.equal(r.status, 200);
  const o = await r.json(); assert.equal(o.ok, true); assert.equal(o.size, 1024); assert.match(o.key, /^aq-drop\/\d+-work-1\.zip$/);
  const list = await (await R("GET", "/api/aq/drop/dropkey456")).json();
  assert.equal(list.files.length, 1); assert.equal(list.files[0].size, 1024); assert.equal(`aq-drop/${list.files[0].name}`, o.key);
  const g = await R("GET", `/api/aq/drop/dropkey456/${list.files[0].name}`); assert.equal(g.status, 200);
  assert.deepEqual(new Uint8Array(await g.arrayBuffer()), zip);
  assert.equal((await R("GET", "/api/aq/drop/dropkey456/oraktys-a.mp4")).status, 405, "cannot read anything outside aq-drop zips");
  assert.equal((await R("DELETE", `/api/aq/drop/dropkey456/${list.files[0].name}`)).status, 405);
  assert.equal((await R("POST", "/api/aq/kill?key=dropkey456", { body: { on: true } })).status, 401, "the drop key opens nothing else");
});

test("whales first: Jupiter lists pick tradable coins, 60 bars on first sight, a whale signal opens an R5 paper trade; mining pages the swaps", async () => {
  const d = db(env);
  for (const t of ["mob_aq_market", "mob_aq_watch", "mob_aq_prices", "mob_aq_positions", "mob_aq_council", "mob_aq_signals", "mob_aq_mined"]) await d.q(`DELETE FROM ${t}`);
  await d.q(`DELETE FROM mob_aq_trades WHERE reason='stop' AND symbol LIKE 'L%'`); await d.q(`UPDATE mob_aq_state SET v='false' WHERE k IN ('kill','destroyed')`); await d.q(`UPDATE mob_aq_state SET v='1' WHERE k='cash_sol'`);
  await d.q(`DELETE FROM mob_aq_trades`);
  // R5 activation is a recorded change on an already-seeded database
  await d.q(`UPDATE mob_aq_strategies SET status='not tested', params='{}' WHERE id='R5'`); _resetSeeded();
  stubAll(); trendingPools = [];
  const pools = clone(FX6.jupTop.pools), FART = pools.find((p) => p.baseAsset.symbol === "Fartcoin").baseAsset.id;
  assert.equal(jupPool(pools.find((p) => p.baseAsset.symbol === "SPCX")), null, "stock wrappers are not memecoins");
  Object.assign(pools.find((p) => p.baseAsset.symbol === "ACT").baseAsset.stats1h, { buyVolume: 900, sellVolume: 800 }); // liquid but dead: not tradable
  // volume in the last 5 minutes well above the hourly pace, so the R5 entry rule is met in either of its seeded variants
  { const fb = pools.find((p) => p.baseAsset.symbol === "Fartcoin").baseAsset; fb.stats5m = { ...(fb.stats5m || {}), buyVolume: (fb.stats1h.buyVolume || 1000) / 3, sellVolume: (fb.stats1h.sellVolume || 1000) / 3 }; }
  jupLists = () => ({ pools: clone(pools) });
  const chart = clone(FX6.jupChart), shift = Math.floor(Date.now() / 60000) * 60 - chart.candles.at(-1).time;
  for (const c of chart.candles) c.time += shift;
  jupCharts[FART] = () => clone(chart);
  // two winners from the book (seeded in the whale test) buy Fartcoin now; swaps page 1 then page 2
  let pagesAsked = [];
  tradesFor[FART] = (u) => { pagesAsked.push(u.searchParams.get("offset")); return u.searchParams.get("offset") ? { txs: [jtx("OldBuyer", "buy", 2, FART, 9, new Date(Date.now() - 3600000))], next: null } : { txs: [jtx("WhaleOne111", "buy", 3, FART, 1), jtx("WhaleTwo222", "buy", 2, FART, 2)], next: FX6.jupTxs1.next }; };
  prices[FART] = chart.candles.at(-1).close;
  const ACT = pools.find((p) => p.baseAsset.symbol === "ACT").baseAsset; prices[ACT.id] = ACT.usdPrice; // priced this tick, nobody signalled it: the control
  let t = await tick(env);
  assert.ok((await d.one(`SELECT 1 FROM mob_aq_brain WHERE text LIKE 'R5 whale follow activated on PAPER%'`)), "activation recorded");
  assert.equal(t.funnel.seen >= 3, true); assert.ok(t.funnel.tradable >= 1 && t.funnel.tradable < t.funnel.seen, JSON.stringify([t.funnel, t.evaluated])); assert.equal(t.funnel.judged, t.funnel.tradable);
  assert.ok(!t.evaluated.some((e) => e.symbol === "ACT" || e.symbol === "NEIL" || e.symbol === "SPCX"), "dead, illiquid and stock coins never reach the Council");
  // R5 is OFF the real ledger until its signals beat a matched control on 200+ signals: the whale signal is logged and shadowed, not bought
  assert.equal(t.entered?.strategy === "R5", false, JSON.stringify(t.evaluated));
  let cn = await d.one(`SELECT strategy, reason, facts FROM mob_aq_council WHERE symbol='Fartcoin' ORDER BY id DESC LIMIT 1`);
  assert.deepEqual(cn.facts.shadowSignals, ["R5"]); assert.equal(cn.facts.tier, "A"); assert.equal(cn.facts.candles.src, "jupiter"); assert.equal(cn.facts.candles.bars, 60, "history on first sight, no warm-up");
  assert.equal(cn.facts.whale.independent, 2); assert.equal(cn.facts.r5.taken, true); assert.ok(["A", "B"].includes(cn.facts.r5.entryVariant));
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_positions WHERE strategy='R5'`)).n, 0);
  const sg = await d.one(`SELECT * FROM mob_aq_signals WHERE mint=$1`, [FART]);
  assert.equal(sg.source, "own"); assert.equal(sg.ctrl_mint, ACT.id, "a matched control priced in the same tick"); assert.equal(sg.ctrl_price, ACT.usdPrice); assert.equal(sg.price_usd > 0, true);
  const sh = await d.one(`SELECT * FROM mob_aq_shadow WHERE mint=$1`, [FART]);
  assert.ok(sh, "the R5 signal runs on the shadow lane"); assert.equal(sh.strategy, "R5"); assert.equal(sh.v, 2); assert.match(sh.block_reason, /^R5 signal, off the real ledger: 0\/200 signals with a matched control/); assert.match(sh.cost_source, /^measured \(Jupiter round trip at 0\.26 SOL\)/);
  assert.ok(sh.stop_price < sh.entry_price && sh.target_price > sh.entry_price);
  let s = await S();
  assert.deepEqual([s.strategies.find((x) => x.id === "R5").ledger, s.strategies.find((x) => x.id === "R6").ledger, s.strategies.find((x) => x.id === "R3").ledger], ["shadow", "shadow", "real"]);
  const evd = s.whales.evidence.find((e) => e.source === "own"); assert.deepEqual([evd.signals, evd.withControl, evd.needed, evd.real], [1, 0, 200, false]); assert.deepEqual(s.whales.evidence.map((e) => e.source), ["own", "nansen", "kolscan"]);
  assert.deepEqual(s.whales.signals[0].control, { symbol: "ACT", pct5m: null, pct15m: null, pct30m: null, pct60m: null });
  // forward returns of the signal and of its control are stamped from the tick's price call: 5, 15, 30, 60 minutes
  for (const [min, sp, cp] of [[5, 1.01, 0.99], [15, 1.02, 1], [30, 1.04, 1.01], [60, 1.05, 1.02]]) {
    await d.q(`UPDATE mob_aq_signals SET at = now() - make_interval(mins => $2::int, secs => 20) WHERE mint=$1`, [FART, min]);
    prices[FART] = sg.price_usd * sp; prices[ACT.id] = ACT.usdPrice * cp;
    await tick(env);
  }
  const f = await d.one(`SELECT * FROM mob_aq_signals WHERE mint=$1`, [FART]);
  assert.deepEqual([f.pct_5m, f.pct_15m, f.pct_30m, f.pct_60m], [1, 2, 4, 5]); assert.deepEqual([f.ctrl_5m, f.ctrl_15m, f.ctrl_30m, f.ctrl_60m], [-1, 0, 1, 2]);
  assert.ok((await d.one(`SELECT 1 FROM mob_aq_brain WHERE kind='signal' AND text LIKE 'own signal on Fartcoin%Control ACT:%'`)), "the lesson names the control");
  prices[FART] = chart.candles.at(-1).close; prices[ACT.id] = ACT.usdPrice;
  // 199 more pairs where the signal beat its control: now the evidence carries R5 onto the real paper ledger
  await seedSignals("own", 199, 0.6, 0.1);
  for (const tb of ["mob_aq_council", "mob_aq_positions", "mob_aq_shadow"]) await d.q(`DELETE FROM ${tb}`);
  await d.q(`UPDATE mob_aq_signals SET at = now() - interval '5 hours' WHERE mint=$1`, [FART]); await d.q(`UPDATE mob_aq_state SET v='1' WHERE k='cash_sol'`); await d.q(`DELETE FROM mob_aq_market WHERE k LIKE 'jup:%'`);
  pagesAsked = [];
  t = await tick(env);
  assert.deepEqual([t.evaluated[0].symbol, t.evaluated[0].verdict, t.evaluated[0].tier], ["Fartcoin", "PASS", "A"], JSON.stringify(t.evaluated));
  cn = await d.one(`SELECT strategy, reason, facts FROM mob_aq_council WHERE symbol='Fartcoin' AND verdict='PASS'`);
  assert.equal(cn.strategy, "R5"); assert.match(cn.reason, /R5 whale signal, stop under the recent swing low; hard blocks clear; 6x round trip [\d.]+% = [\d.]+% fits target [\d.]+% and 3x ATR5 [\d.]+%; score/);
  const p = await d.one(`SELECT * FROM mob_aq_positions`); assert.equal(p.strategy, "R5"); assert.equal(p.size_sol, 0.26); assert.equal(p.variant, "A"); assert.equal(p.tvar, "L"); assert.equal(p.hold_min, 30);
  // the stop is in the coin's own volatility (no fixed 4%), never inside the noise of the hold; the target is 2.5x the stop
  assert.ok(cn.facts.plan.stopPct >= cn.facts.plan.noisePct && cn.facts.plan.noisePct > 0); assert.ok(Math.abs(cn.facts.plan.targetPct - cn.facts.plan.stopPct * 2.5) < 0.01);
  assert.ok(6 * p.rt_pct <= 3 * p.atr5_pct && 6 * p.rt_pct <= p.target_pct, "it can pay: 6x measured cost fits 3x ATR5 and the target");
  assert.equal((await d.one(`SELECT verdict FROM mob_aq_signals WHERE mint=$1 ORDER BY id DESC LIMIT 1`, [FART])).verdict, "PASS");
  // mining: the same tick walked the coin's swaps back with the cursor (offset + offsetTs) and finished it
  const m = await d.one(`SELECT * FROM mob_aq_mined WHERE mint=$1`, [FART]);
  assert.equal(m.done, true); assert.ok(m.pages >= 2);
  assert.ok(await d.one(`SELECT 1 FROM mob_aq_wtrades WHERE wallet='OldBuyer' AND mint=$1`, [FART]));
  s = await S();
  assert.ok(s.whales.winners >= 2 && s.whales.book >= s.whales.winners); assert.equal(s.whales.mining.done, 1);
  assert.ok(s.health.budget.jupiterDataCalls > 0 && s.health.budget.jupiterDataCalls <= s.health.budget.jupiterDataCap); assert.equal(s.health.budget.heliusCalls, 0);
  assert.ok(s.funnel.tradable >= 1); assert.ok(s.market.trending.some((x) => x.symbol === "Fartcoin"));
  assert.deepEqual([s.strategies.find((x) => x.id === "R5").status, s.strategies.find((x) => x.id === "R5").ledger], ["paper", "real"]); assert.equal(s.whales.evidence[0].real, true);
  assert.equal(s.departments.find((x) => x.id === "whales").live, true);
  assert.ok(s.brain.some((b) => /^R5 paper entry Fartcoin: 2 independent winners/.test(b.text)));
  // no bars at all: no ATR, so no stop can be sized and there is no trade (the fixed 8% / 20% is gone)
  const { whaleSetup } = await import("../src/aq/logic.mjs"); const { R5_PARAMS } = await import("../src/aq/seed.mjs");
  const fx = whaleSetup([], R5_PARAMS, Date.now() / 1000, 2); assert.equal(fx.signal, false); assert.match(fx.why, /no bars to size a stop/); assert.equal(R5_PARAMS.minStopPct, undefined);
  await d.q(`DELETE FROM mob_aq_signals WHERE mint LIKE 'seed%'`);
  jupLists = () => ({ pools: [] }); jupCharts = {};
});

test("ALWAYS TRADING: hard vs soft, tiers, R6 and R7 entries, explore cadence, weights learn from closed trades", async () => {
  const L = await import("../src/aq/logic.mjs"); const { R6_PARAMS, R7_PARAMS } = await import("../src/aq/seed.mjs");
  const now = Date.now(), day = 86400000, iso = (d) => new Date(now - d * day).toISOString();
  assert.deepEqual([L.tierOf(600000, iso(30), now), L.tierOf(600000, iso(2), now), L.tierOf(150000, iso(2), now), L.tierOf(150000, iso(0.2), now), L.tierOf(600000, null, now)], ["A", "B", "B", "C", "C"]);
  // hard: authorities and rugged; soft: LP lock / holders (and not at all for tier A)
  const base = { mintAuthority: null, freezeAuthority: null, rugged: false, danger: [], topHolderPct: 40, top10Pct: 60, lpLockedPct: 0, decimals: 6 };
  assert.equal(L.hardSafety(base).ok, true, "LP lock and holders are not hard blocks");
  assert.equal(L.hardSafety({ ...base, mintAuthority: "x" }).ok, false); assert.equal(L.hardSafety({ ...base, freezeAuthority: "x" }).ok, false); assert.equal(L.hardSafety(null).reason, "missing data: safety report");
  const obj = (tier, extra = {}) => L.softObjections({ tier, rug: base, createdAt: iso(30), boosted: false, copycat: false, whale: true, fng: 50, nowMs: now, ...extra });
  assert.deepEqual(obj("A"), []); assert.deepEqual(obj("B"), ["lp_locked", "top10", "top_holder"]); assert.deepEqual(obj("A", { boosted: true, whale: false, fng: 10 }), ["boosted", "no_whale", "fear"]);
  const w1 = Object.fromEntries(L.SOFT_RULES.map((n) => [n, 1]));
  assert.equal(L.scoreOf([], w1, "A", false).score, 110); assert.equal(L.scoreOf(["lp_locked", "top10", "top_holder"], w1, "B", false).score, 75); assert.ok(L.scoreOf(["lp_locked", "top10", "top_holder", "young"], w1, "C", false).score < L.COUNCIL.passScore);
  assert.ok(L.scoreOf(["lp_locked"], { lp_locked: 0.2 }, "B", false).score > L.scoreOf(["lp_locked"], { lp_locked: 3 }, "B", false).score, "a rule's weight moves the score");
  // R6: 44 choppy bars (0.8% wicks) then a green close clearly above the 20-bar high; stop 1.5x ATR5, target 2x the stop
  const t0 = Math.floor(now / 60000) * 60 - 60, bar = (i, o, c2, n = 45) => ({ t: t0 - (n - 1 - i) * 60, o, h: Math.max(o, c2) * 1.008, l: Math.min(o, c2) * 0.992, c: c2, v: 1 });
  const flat = Array.from({ length: 44 }, (_, i) => bar(i, 1, 1 + (i % 2) * 0.001));
  const BRK = bar(44, 1.001, 1.03);
  const brk = L.momentumSetup([...flat, BRK], R6_PARAMS, now / 1000);
  assert.equal(brk.signal, true, brk.why); assert.ok(brk.atrPct > 1); assert.ok(Math.abs(brk.stopPct - 1.5 * brk.atrPct) < 0.01, "stop in ATR units"); assert.ok(Math.abs(brk.targetPct - brk.stopPct * 2) < 0.01); assert.ok(brk.stopPct < brk.targetPct);
  assert.match(L.momentumSetup([...flat, bar(44, 1.001, 1.0005)], R6_PARAMS, now / 1000).why, /no breakout/);
  assert.match(L.momentumSetup([...flat, bar(44, 1.001, 1.0095)], R6_PARAMS, now / 1000).why, /breakout too small \(0\.\d+x ATR/, "a close a hair over the high is noise (the first 9 paper R6 trades)");
  assert.match(L.momentumSetup([...flat, { ...BRK, v: 0.2 }], R6_PARAMS, now / 1000).why, /without a volume uptick/);
  assert.equal(L.atr5Pct(flat.slice(0, 10)), null, "too few bars: unknown, never invented");
  // R7: a 9% slide (RSI under 35, more than 2.5x ATR) then a green bar closing above the previous close
  const slide = Array.from({ length: 44 }, (_, i) => (i < 24 ? bar(i, 1, 1) : bar(i, 1 - (i - 24) * 0.0045, 1 - (i - 23) * 0.0045)));
  const BNC_BAR = bar(44, 0.91, 0.918);
  const bounce = L.bounceSetup([...slide, BNC_BAR], R7_PARAMS, now / 1000);
  assert.equal(bounce.signal, true, bounce.why); assert.ok(bounce.rsi < 35 && bounce.dropPct >= 2.5 * bounce.atrPct); assert.ok(Math.abs(bounce.targetPct - bounce.stopPct * 2) < 0.01);
  assert.match(L.bounceSetup([...slide, bar(44, 0.91, 0.905)], R7_PARAMS, now / 1000).why, /no bounce bar/);
  assert.match(L.bounceSetup([...flat, bar(44, 1, 1.001)], R7_PARAMS, now / 1000).why, /not oversold/);

  // engine: an R6 breakout on a tier A coin and an R7 bounce on another; then explore cadence and learning
  const d = db(env);
  for (const t of ["mob_aq_market", "mob_aq_watch", "mob_aq_prices", "mob_aq_positions", "mob_aq_council", "mob_aq_trades", "mob_aq_rules"]) await d.q(`DELETE FROM ${t}`);
  await d.q(`UPDATE mob_aq_state SET v='1' WHERE k='cash_sol'`);
  stubAll(); trendingPools = []; prices = {}; tradesFor = {};
  const mk = (sym, mint, liq, days) => { const p = clone(FX6.jupTop.pools.find((q) => q.baseAsset.symbol === "Fartcoin")); Object.assign(p.baseAsset, { id: mint, symbol: sym, liquidity: liq, firstPool: { id: "x", createdAt: iso(days) } }); p.id = `pool-${sym}`; return p; };
  const asJup = (cs) => ({ candles: cs.map((c2) => ({ time: c2.t, open: c2.o, high: c2.h, low: c2.l, close: c2.c, volume: 1 })) });
  const MOM = "MomentumAAAA1111111111111111111111111111111", BNC = "BounceAAAAA11111111111111111111111111111111", NEW = "NewLaunchCC11111111111111111111111111111111";
  backOf = { [MOM]: 0.998, [BNC]: 0.998 }; // liquid tier A coins: 0.2% pool cost, like the 0.09-0.25% measured live
  prices[MOM] = 1.03; prices[BNC] = 0.918; prices[NEW] = 1.03;
  jupLists = () => ({ pools: [mk("MOMO", MOM, 900000, 40), mk("BNCE", BNC, 800000, 40), mk("NEWC", NEW, 60000, 0.5)] });
  jupCharts[MOM] = () => asJup([...flat, BRK]); jupCharts[BNC] = () => asJup([...slide, BNC_BAR]); jupCharts[NEW] = () => asJup([...flat, BRK]);
  // R6 has no positive replay yet: its breakout is real, but it goes to the shadow lane; R7 takes the real trade
  await d.q(`DELETE FROM mob_aq_state WHERE k='replays'`); await d.q(`DELETE FROM mob_aq_candles`); await d.q(`DELETE FROM mob_aq_shadow`);
  let t = await tick(env);
  assert.equal(t.entered?.strategy, "R7", JSON.stringify([t.evaluated, t.funnel, t.survival])); assert.equal(t.entered.tier, "A"); assert.equal(t.entered.tag, "PASS");
  const mo0 = await d.one(`SELECT facts, reason FROM mob_aq_council WHERE symbol='MOMO' ORDER BY id DESC LIMIT 1`);
  assert.deepEqual(mo0.facts.shadowSignals, ["R6"]); assert.equal(mo0.facts.signals.R6, "SIGNAL");
  let s = await S(); assert.equal(s.strategies.find((x) => x.id === "R6").ledger, "shadow"); assert.match(s.strategies.find((x) => x.id === "R6").ledgerWhy, /replay with measured cost has 0 of the 30 trades needed/);
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_positions WHERE strategy='R6'`)).n, 0, "R6 never touches the paper wallet without a positive replay");
  // tier C never gets R6/R7; its fib has no pullback -> a "signal" block, not a trade
  const nw = t.evaluated.find((e) => e.symbol === "NEWC"); assert.equal(nw.tier, "C"); assert.equal(nw.kind, "signal"); assert.match(nw.reason, /^no signal: R3 /);
  // the next tick has no real entry, so the shadow lane probes the R6 breakout with R6's own levels and a measured cost
  await d.q(`DELETE FROM mob_aq_council`);
  t = await tick(env);
  const shR6 = await d.one(`SELECT * FROM mob_aq_shadow WHERE symbol='MOMO'`);
  assert.ok(shR6, JSON.stringify([t.shadow, t.evaluated])); assert.equal(shR6.strategy, "R6"); assert.equal(shR6.v, 2); assert.match(shR6.block_reason, /^R6 signal, off the real ledger/); assert.match(shR6.cost_source, /^measured/);
  assert.ok(Math.abs((shR6.target_price - shR6.entry_price) / (shR6.entry_price - shR6.stop_price) - 2) < 0.01, "R6's own stop and 2x target, not fib levels");
  // a positive replay (30+ trades, measured cost) puts R6 back on the real ledger; a losing one blocks it by name
  await replayState(R6_GOOD); await d.q(`DELETE FROM mob_aq_council`);
  t = await tick(env);
  assert.equal(t.entered?.strategy, "R6", JSON.stringify(t.evaluated)); assert.equal(t.entered.symbol, "MOMO"); assert.equal(t.entered.tier, "A");
  const mp = await d.one(`SELECT * FROM mob_aq_positions WHERE symbol='MOMO'`);
  assert.ok(mp.stop_pct >= mp.atr5_pct * Math.sqrt(30 / 5) * 0.99, "stop outside the noise of a 30 minute hold"); assert.ok(Math.abs(mp.target_pct / mp.stop_pct - 2) < 0.2); assert.equal(mp.slot >= 1 && mp.slot <= 5, true);
  s = await S(); assert.equal(s.positions.length, 2); assert.deepEqual(s.positions.map((p) => p.tier), ["A", "A"]); assert.equal(s.tradesLastHour, 2); assert.equal(s.strategies.find((x) => x.id === "R6").ledger, "real");
  // explore cadence: a coin whose soft rules sink the score is refused while an entry is fresh, and taken as EXPLORE after 3 minutes
  const SOFT = "SoftCoinBB111111111111111111111111111111111";
  backOf[SOFT] = 0.998; prices[SOFT] = 1.03;
  jupLists = () => ({ pools: [mk("SOFT", SOFT, 150000, 3)] }); jupCharts[SOFT] = () => asJup([...flat, BRK]);
  rugFor[SOFT] = () => { const r = safeRug(); r.risks = [{ name: "Low Liquidity", level: "danger" }, { name: "x", level: "danger" }]; r.topHolders = r.topHolders.map((h) => ({ ...h, pct: h.pct * 8 })); return r; };
  await d.q(`DELETE FROM mob_aq_market WHERE k LIKE 'rug:%' OR k = 'jup:top'`);
  t = await tick(env);
  const sb = t.evaluated.find((e) => e.symbol === "SOFT"); assert.equal(sb.verdict, "BLOCK", JSON.stringify(t.evaluated)); assert.equal(sb.kind, "soft"); assert.match(sb.reason, /next explore in/);
  await d.q(`UPDATE mob_aq_positions SET opened_at = now() - interval '4 minutes'`); await d.q(`DELETE FROM mob_aq_council WHERE symbol='SOFT'`);
  t = await tick(env);
  assert.equal(t.entered?.symbol, "SOFT", JSON.stringify(t.evaluated)); assert.equal(t.entered.tag, "EXPLORE"); assert.equal(t.entered.tier, "B");
  const sp = await d.one(`SELECT * FROM mob_aq_positions WHERE symbol='SOFT'`);
  assert.ok(sp.soft.includes("danger_risk") && sp.soft.includes("top10"));
  // a full-signal EXPLORE takes the CEO's position like a PASS; with two 0.26 positions open only cash is left to cut it
  assert.equal(mp.size_sol, 0.26); assert.ok(sp.size_sol <= 0.26 && sp.size_sol >= 0.05, `${sp.size_sol}`); assert.equal(sp.sizing.positionSol, 0.26); assert.ok(6 * sp.rt_pct <= Math.min(sp.target_pct, 3 * sp.atr5_pct) + 1e-9, "at that size six round trips still fit");
  // SOFT hits its target, MOMO its stop: each trade row carries its plan
  const mo = await d.one(`SELECT * FROM mob_aq_positions WHERE symbol='MOMO'`);
  prices[SOFT] = sp.target_price * 1.01; prices[MOM] = mo.stop_price * 0.99;
  jupLists = () => ({ pools: [] });
  t = await tick(env);
  assert.deepEqual(t.exits.map((e) => [e.symbol, e.why]).sort(), [["MOMO", "stop"], ["SOFT", "target"]]);
  const tr = await d.one(`SELECT * FROM mob_aq_trades WHERE symbol='SOFT'`); assert.deepEqual([tr.tier, tr.tag, tr.tvar, tr.variant], ["B", "EXPLORE", "L", "A"]); assert.ok(tr.soft.length >= 2);
  assert.ok(tr.stop_price > 0 && tr.target_price > tr.stop_price && tr.rt_pct > 0 && tr.atr5_pct > 0 && tr.entry_mid_usd > 0 && tr.sol_usd_entry > 0 && tr.pool && tr.hold_min === 30);
  const ms = await d.one(`SELECT * FROM mob_aq_trades WHERE symbol='MOMO'`); assert.ok(ms.overshoot_pct > 0.9 && ms.overshoot_pct < 1.1, "how far the mid ran past the stop is measured for the Time Machine");
  // the learner: fear objected to EVERY trade, so it has nothing to compare and its weight stays 1 (it used to climb with every loss)
  s = await S();
  const rule = (n) => s.rules.find((r) => r.name === n);
  assert.equal(rule("fear").weight, 1); assert.equal(rule("no_whale").weight, 1); assert.ok(rule("fear").blockedLosers >= 1 && rule("fear").blockedWinners >= 1, JSON.stringify(s.rules));
  assert.equal(rule("danger_risk").weight, 1, "under 10 trades on each side: no evidence, no move"); assert.equal(rule("danger_risk").blockedWinners, 1);
  // with evidence on both sides a rule moves on its own record only: 12 trades it objected to (9 lost) against 12 it did not (3 lost)
  await d.q(`INSERT INTO mob_aq_trades (strategy, symbol, pnl_sol, pnl_pct, reason, soft) SELECT 'R3', 'lw' || i, CASE WHEN i <= 9 THEN -0.001 ELSE 0.001 END, CASE WHEN i <= 9 THEN -2 ELSE 2 END, 'stop', '["fear","copycat"]'::jsonb FROM generate_series(1, 12) i`);
  await d.q(`INSERT INTO mob_aq_trades (strategy, symbol, pnl_sol, pnl_pct, reason, soft) SELECT 'R3', 'lx' || i, CASE WHEN i <= 3 THEN -0.001 ELSE 0.001 END, CASE WHEN i <= 3 THEN -2 ELSE 2 END, 'stop', '["fear"]'::jsonb FROM generate_series(1, 12) i`);
  const { recomputeRules } = await import("../src/aq/council.mjs");
  const moved = await recomputeRules(d, "test");
  const w = Object.fromEntries((await d.q(`SELECT name, weight FROM mob_aq_rules`)).map((r) => [r.name, r.weight]));
  assert.ok(w.copycat > 1.5 && w.copycat <= 3, `copycat's own record moved it: ${w.copycat}`); assert.equal(w.fear, 1, "fear still objects to everything: still 1");
  assert.ok(moved.some((m) => /^copycat 1 -> /.test(m))); assert.ok((await d.one(`SELECT 1 FROM mob_aq_brain WHERE kind='tournament' AND text LIKE 'Rule T3 (test): soft-rule weights recomputed%copycat%'`)));
  assert.equal(L.ruleWeight({ objN: 9, objLosses: 9, restN: 50, restLosses: 0 }), 1); assert.equal(L.ruleWeight({ objN: 20, objLosses: 5, restN: 20, restLosses: 15 }), 0.2); assert.equal(L.ruleWeight({ objN: 20, objLosses: 10, restN: 20, restLosses: 10 }), 1);
  jupCharts = {}; sellOut = {};
});

test("variants: exits alternate A/B per strategy; B sells half at +1R and moves the stop to break-even; a clear leader becomes the default", async () => {
  const d = db(env);
  for (const t of ["mob_aq_market", "mob_aq_watch", "mob_aq_prices", "mob_aq_positions", "mob_aq_council", "mob_aq_trades"]) await d.q(`DELETE FROM ${t}`);
  await d.q(`DELETE FROM mob_aq_state WHERE k IN ('variant_cmp','variant_default')`); await d.q(`UPDATE mob_aq_state SET v='1' WHERE k='cash_sol'`);
  stubAll(); trendingPools = []; prices = {}; tradesFor = {}; jupLists = () => ({ pools: [] }); sellOut = {};
  // a variant B position: entry 1.00, stop 4% (R = 4%), target 1.20, round trip 1%
  await d.q(`INSERT INTO mob_aq_positions (strategy, mint, pool, symbol, decimals, tokens_raw, size_sol, fee_sol, entry_price_usd, entry_mid_usd, stop_price, target_price, stop_pct, target_pct, rt_pct, time_stop_at, variant)
    VALUES ('R6','ScaleMintBB','x','SCALE',6,'${TOK(0.05, 1)}',0.05,0.0001,1,1,0.96,1.2,4,20,1,now() + interval '1 hour','B'), ('R6','PlainMintAA','x','PLAIN',6,'${TOK(0.05, 1)}',0.05,0.0001,1,1,0.96,1.2,4,20,1,now() + interval '1 hour','A')`);
  prices.ScaleMintBB = 1.05; prices.PlainMintAA = 1.05; sellOut = { ScaleMintBB: 1.05, PlainMintAA: 1.05 };
  let t = await tick(env);
  assert.equal(t.scaled, 1); assert.equal(t.exits.length, 0);
  const sc = await d.one(`SELECT * FROM mob_aq_positions WHERE symbol='SCALE'`), pl = await d.one(`SELECT * FROM mob_aq_positions WHERE symbol='PLAIN'`);
  assert.equal(sc.half_done, true); assert.equal(sc.tokens_raw, String(BigInt(TOK(0.05, 1)) - BigInt(TOK(0.05, 1)) / 2n)); assert.ok(sc.realized_sol > 0.026 && sc.realized_sol < 0.0265); assert.ok(Math.abs(sc.stop_price - 1.01) < 1e-9, "stop = break-even plus the 1% cost");
  assert.equal(pl.half_done, false); assert.equal(pl.tokens_raw, TOK(0.05, 1)); assert.equal(pl.stop_price, 0.96, "variant A is untouched");
  assert.ok(Math.abs(Number((await d.one(`SELECT v FROM mob_aq_state WHERE k='cash_sol'`)).v) - (1 + sc.realized_sol)) < 1e-9);
  // price falls back to 1.00: B is stopped at break-even-plus-cost with its half banked; A is still open and losing nothing yet
  prices.ScaleMintBB = 1.0; prices.PlainMintAA = 0.95; sellOut = { ScaleMintBB: 1.0, PlainMintAA: 0.95 };
  t = await tick(env);
  assert.deepEqual(t.exits.map((e) => [e.symbol, e.why]).sort(), [["PLAIN", "stop"], ["SCALE", "stop"]]);
  const tb = await d.one(`SELECT * FROM mob_aq_trades WHERE symbol='SCALE'`), ta = await d.one(`SELECT * FROM mob_aq_trades WHERE symbol='PLAIN'`);
  assert.deepEqual([tb.variant, tb.scaled, ta.variant, ta.scaled], ["B", true, "A", false]);
  assert.ok(tb.pnl_pct > 1 && tb.pnl_pct < 3, `B keeps the banked half: ${tb.pnl_pct}`); assert.ok(ta.pnl_pct < -5, `A takes the full stop: ${ta.pnl_pct}`);
  // scoreboard + tournament step T4 after 20 closed trades per variant
  await d.q(`INSERT INTO mob_aq_trades (strategy, symbol, pnl_sol, pnl_pct, reason, variant, opened_at) SELECT 'R6', 'a' || i, -0.0005, -1 - (i % 3) * 0.2, 'time stop', 'A', now() - interval '2 hours' FROM generate_series(1, 19) i`);
  await d.q(`INSERT INTO mob_aq_trades (strategy, symbol, pnl_sol, pnl_pct, reason, variant, opened_at) SELECT 'R6', 'b' || i, 0.001, 2 + (i % 3) * 0.2, 'target', 'B', now() - interval '2 hours' FROM generate_series(1, 19) i`);
  await tick(env);
  const s = await S(), r6 = s.strategies.find((x) => x.id === "R6");
  assert.equal(r6.defaultVariant, "B"); assert.deepEqual(r6.variants.map((v) => [v.id, v.n]), [["A", 20], ["B", 20]]);
  assert.ok(r6.variants[1].expectancyPct > 0 && r6.variants[0].expectancyPct < 0 && r6.variants[0].avgLoss < 0 && r6.variants[1].avgWin > 0);
  assert.ok(s.brain.some((b) => /^R6 exits after 20 A and 20 B trades:.*B leads clearly/.test(b.text)) && s.brain.some((b) => /^Rule T4: R6 exit variant B becomes the default/.test(b.text)));
  assert.ok(typeof s.whales.signalsLastHour === "number" && "hitRate" in s.whales.r5 && typeof s.whales.fundersKnown === "number");
  assert.ok("variant" in (await S()).positions.concat([{ variant: "A" }])[0]);
});

test("paper explores by STRENGTH: a partial setup is taken as EXPLORE-WEAK at the smallest size; a dead market says why", async () => {
  const d = db(env), L = await import("../src/aq/logic.mjs"), { R6_PARAMS } = await import("../src/aq/seed.mjs");
  for (const t of ["mob_aq_market", "mob_aq_watch", "mob_aq_prices", "mob_aq_positions", "mob_aq_council", "mob_aq_trades"]) await d.q(`DELETE FROM ${t}`);
  await d.q(`UPDATE mob_aq_state SET v='1' WHERE k='cash_sol'`);
  stubAll(); trendingPools = []; prices = {}; tradesFor = {}; sellOut = {};
  const now = Date.now(), t0 = Math.floor(now / 60000) * 60 - 60;
  const bar = (i, o, c2, w) => ({ t: t0 - (44 - i) * 60, o, h: Math.max(o, c2) * (1 + w), l: Math.min(o, c2) * (1 - w), c: c2, v: 1 });
  const choppy = Array.from({ length: 44 }, (_, i) => bar(i, 1, 1 + (i % 2) * 0.001, 0.008)), dead = Array.from({ length: 45 }, (_, i) => bar(i, 1, 1 + (i % 2) * 0.0002, 0.0003));
  const near = [...choppy, bar(44, 1.001, 1.006, 0.001)]; // closes just under the 8-bar high: no breakout, but close
  const m = L.momentumSetup(near, R6_PARAMS, now / 1000), st = L.strengthOf("R6", m, R6_PARAMS);
  assert.equal(m.signal, false); assert.ok(st > 0.3 && st < 0.95, String(st)); assert.equal(L.strengthOf("R6", { ...m, signal: true }, R6_PARAMS), 1);
  assert.equal(L.strengthOf("R6", { signal: false, why: "too few candles" }, R6_PARAMS), 0, "no levels = no strength");
  const mk = (sym, mint) => { const p = clone(FX6.jupTop.pools.find((q) => q.baseAsset.symbol === "Fartcoin")); Object.assign(p.baseAsset, { id: mint, symbol: sym, liquidity: 900000, firstPool: { id: "x", createdAt: new Date(now - 40 * 86400000).toISOString() } }); p.id = `pool-${sym}`; return p; };
  const asJup = (cs) => ({ candles: cs.map((c2) => ({ time: c2.t, open: c2.o, high: c2.h, low: c2.l, close: c2.c, volume: 1 })) });
  const WK = "WeakSetupAA1111111111111111111111111111111", DD = "DeadCoinAAA1111111111111111111111111111111";
  backOf = { [WK]: 0.998, [DD]: 0.998 }; prices[WK] = 1.006; prices[DD] = 1.0002;
  await replayState(R6_GOOD); // R6 holds a positive replay here; this test is about how EXPLORE sizes and what a dead market says
  jupLists = () => ({ pools: [mk("WEAK", WK)] }); jupCharts[WK] = () => asJup(near);
  let t = await tick(env);
  assert.equal(t.entered?.symbol, "WEAK", JSON.stringify(t.evaluated)); assert.equal(t.entered.tag, "EXPLORE-WEAK"); assert.ok(t.entered.strength > 0.3 && t.entered.strength < 0.95);
  const cnw = await d.one(`SELECT reason, facts FROM mob_aq_council WHERE symbol='WEAK'`); assert.match(cnw.reason, /^EXPLORE-WEAK: R6 strength 0\.\d+ \(no breakout/);
  // EXPLORE-WEAK takes half the CEO's position (0.13 SOL), well over the fee floor; the sizing inputs ride on the position and the verdict
  const fee = 61000 / 1e9, floorNow = L.feeFloorSize(fee, Math.min(cnw.facts.plan.targetPct, 3 * t.entered.atr5Pct), cnw.facts.poolRtPct);
  assert.equal(t.entered.sizeSol, 0.13); assert.ok(t.entered.sizeSol >= floorNow, `size ${t.entered.sizeSol} vs floor ${floorNow}`);
  assert.deepEqual([cnw.facts.sizing.positionSol, cnw.facts.sizing.weak, cnw.facts.sizing.limitedBy, cnw.facts.sizing.minSol], [0.26, true, null, 0.05]); assert.ok(cnw.facts.sizing.lossAtStopPctOfEquity > 0 && cnw.facts.sizing.lossAtStopPctOfEquity < 3);
  assert.ok(t.entered.targetPct >= 6 * t.entered.rtPct, "the cost gate still holds"); assert.ok(3 * t.entered.atr5Pct >= 6 * t.entered.rtPct, "gate B holds");
  // close it and read the strength curve
  const p = await d.one(`SELECT * FROM mob_aq_positions`); assert.ok(p.strength < 1);
  prices[WK] = p.target_price * 1.01;
  t = await tick(env); assert.equal(t.exits[0].why, "target");
  let s = await S();
  const bucket = s.strategies.find((x) => x.id === "R6").byStrength.find((b) => p.strength >= b.from && (b.to == null || p.strength < b.to));
  assert.equal(bucket.n, 1); assert.ok(bucket.expectancyPct > 0); assert.equal(s.strategies.find((x) => x.id === "R6").byStrength.length, 5);
  assert.deepEqual(s.strategies.find((x) => x.id === "R6").timeArms.map((a) => [a.id, a.n]), [["L", 1], ["S", 0]]);
  // a dead market: 6x the coin's measured round trip does not fit inside 3x its ATR5 -> not tradable, and one verdict says so with the numbers
  await d.q(`UPDATE mob_aq_trades SET opened_at = now() - interval '10 minutes'`); await d.q(`DELETE FROM mob_aq_market WHERE k='jup:top'`);
  jupLists = () => ({ pools: [mk("DEAD", DD)] }); jupCharts[DD] = () => asJup(dead);
  const quotes0 = calls.filter((c) => c.url.includes("/swap/v1/quote")).length;
  t = await tick(env);
  assert.equal(t.entered, null); assert.ok(t.quiet && t.quiet.coins === 1 && t.quiet.best === "DEAD" && t.quiet.have < t.quiet.needed, JSON.stringify([t.quiet, t.evaluated]));
  const dv = t.evaluated.find((e) => e.symbol === "DEAD"); assert.equal(dv.kind, "untradable"); assert.match(dv.reason, /^size: needs [\d.]+ SOL \(minimum 0\.05, fee floor [\d.]+\) but the position size 0\.26 SOL \(half for EXPLORE-WEAK\), cash [\d.]+ SOL and 1% of the pool allow 0\.13 SOL$/, "so quiet that the fee floor is above the position: no quote is spent on it");
  s = await S(); assert.match(s.council.recent.find((v) => v.symbol == null).reason, /^market too quiet: 1 coin\(s\) cannot pay 6x their round trip; best DEAD has [\d.]+% of room against [\d.]+% needed$/);
  // not tradable = the shadow lane, and it is not judged again every tick: volatility does not change in 3 minutes
  const shd = await d.one(`SELECT * FROM mob_aq_shadow WHERE symbol='DEAD'`); assert.ok(shd && shd.v === 2 && /^size: needs/.test(shd.block_reason), JSON.stringify(t.shadow)); assert.ok(shd.cost_pct > 0);
  assert.equal(calls.filter((c) => c.url.includes("/swap/v1/quote")).length - quotes0, 2, "only the shadow probe's own cost quote was spent");
  await d.q(`UPDATE mob_aq_council SET at = now() - interval '5 minutes' WHERE symbol='DEAD'`);
  t = await tick(env); assert.ok(!t.evaluated.some((e) => e.symbol === "DEAD"), "rests 15 minutes");
  jupCharts = {}; backOf = {}; sellOut = {};
});

test("nansen reader: real page text parses; gentle state machine over the link queue; a labelled buy becomes an R5 signal of source nansen", async () => {
  const { FX7 } = await import("./aq-fixtures.mjs");
  const N = await import("../src/aq/nansen.mjs");
  const rows = N.parseTrades(FX7.nansenTrades);
  assert.ok(rows.length >= 15, String(rows.length));
  assert.deepEqual(rows.find((r) => r.bought === "MASK"), { label: "SmoreGanic on pump.fun", prefix: "22WjtR", amtBought: 4090, bought: "MASK", amtSold: 0.99, sold: "SOL", valueUsd: 70.5, agoMin: 6 });
  const doug = rows.find((r) => r.bought === "DOUG"); assert.deepEqual([doug.label, doug.prefix, doug.amtBought, doug.sold, doug.valueUsd], ["Smart Trader", "3YnKCVST", 8250000, "USDC", 1410]);
  assert.equal(rows.find((r) => r.sold === "CLAWD").bought, "SOL", "a sell of CLAWD for SOL is read as that, never as a buy");
  const leaders = N.parseLeaders(FX7.nansenLeaders);
  assert.ok(leaders.length >= 10); assert.deepEqual(leaders[0], { label: "RaRa", prefix: "9tH2zRYd", totalPnl: 1190000, realizedPnl: 751210, roiPct: 3048, winRatePct: 39.13, trades: 3498 });
  assert.deepEqual(N.parseTrades("Sign in to Nansen"), [], "a signed-out page gives no rows, never invented ones");

  const d = db(env);
  for (const t of ["mob_aq_market", "mob_aq_watch", "mob_aq_prices", "mob_aq_positions", "mob_aq_council", "mob_aq_trades", "mob_aq_nansen_trades", "mob_aq_nansen_leaders", "mob_aquarius_link"]) await d.q(`DELETE FROM ${t}`);
  await d.q(`DELETE FROM mob_aq_state WHERE k='nansen'`); await d.q(`UPDATE mob_aq_state SET v='1' WHERE k='cash_sol'`);
  stubAll(); trendingPools = []; prices = {}; tradesFor = {}; sellOut = {}; jupLists = () => ({ pools: [] });
  // browser offline: nothing is queued, the state says so
  let st = await N.nansenTick(env);
  assert.equal(st.online, false); assert.equal(st.note, "nansen: browser offline"); assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aquarius_link`)).n, 0);
  const online = (extra = {}) => d.q(`INSERT INTO mob_settings (key, value) VALUES ('aquarius_link_status', $1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [JSON.stringify({ at: Date.now(), chrome: true, hands: true, busy: false, card: null, ...extra })]);
  // browser busy, or another user of the tab: the cycle is skipped
  await online({ busy: true }); st = await N.nansenTick(env); assert.match(st.note, /browser busy/); assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aquarius_link`)).n, 0);
  await online(); await d.q(`INSERT INTO mob_aquarius_link (id, action, input) VALUES ('other1','look','{}')`);
  st = await N.nansenTick(env); assert.match(st.note, /someone else is using the tab/); await d.q(`DELETE FROM mob_aquarius_link`);
  // free: tick 1 navigates, tick 2 reads, tick 3 parses and stores
  const ext = async (text) => d.q(`UPDATE mob_aquarius_link SET state='done', done_at=now(), result=$1 WHERE state='queued'`, [JSON.stringify({ text, image: null })]);
  const GOODM = "MaskMint11111111111111111111111111111111111", item = (sym, id, liq) => ({ ...clone(FX7.jupSearch[0]), id, symbol: sym, liquidity: liq, firstPool: { id: `pool-${id}`, createdAt: new Date(Date.now() - 5 * 86400000).toISOString() } });
  mock("GET", "https://lite-api.jup.ag/tokens/v2/search", (rec, u) => { const q = u.searchParams.get("query"); return q === "MASK" ? [item("MASK", GOODM, 400000), item("MASK", "dust1", 900)] : q === "DOUG" ? [item("DOUG", "d1", 90000), item("DOUG", "d2", 80000)] : clone(FX7.jupSearch); });
  st = await N.nansenTick(env); assert.equal(st.phase, "nav"); assert.equal(st.kind, "trades");
  let q = await d.one(`SELECT * FROM mob_aquarius_link`); assert.equal(q.action, "navigate"); assert.equal(q.input.url, N.NANSEN.trades);
  st = await N.nansenTick(env); assert.equal(st.phase, "nav", "still waiting: the extension has not answered");
  await ext("ok: true"); st = await N.nansenTick(env); assert.equal(st.phase, "read");
  await ext(FX7.nansenTrades); st = await N.nansenTick(env);
  assert.equal(st.phase, "idle"); assert.equal(st.online, true); assert.ok(st.lastReadAt);
  const stored = await d.q(`SELECT * FROM mob_aq_nansen_trades`); assert.equal(stored.length, new Set(rows.map((r) => [r.prefix, r.bought, r.amtBought, r.sold, r.amtSold, r.valueUsd].join("|"))).size);
  const mask = stored.find((r) => r.bought === "MASK"); assert.equal(mask.signal, true); assert.equal(mask.mint, GOODM, "one liquid MASK: resolved");
  const dg = stored.find((r) => r.bought === "DOUG"); assert.equal(dg.signal, false); assert.match(dg.resolved, /ambiguous: 2 liquid tokens named DOUG/);
  assert.equal(stored.find((r) => r.sold === "SNDK").signal, false, "a sell (and under $50): stored, not a signal");
  assert.equal(stored.filter((r) => r.signal).length, 1, "old, small, stable and sell rows are never signals");
  // the leaderboard is read once right after the first trades read (then every 4 hours), with the same three small steps
  st = await N.nansenTick(env); assert.deepEqual([st.phase, st.kind], ["nav", "leaders"]);
  await ext("ok: true"); st = await N.nansenTick(env); assert.equal(st.phase, "read");
  await ext(FX7.nansenLeaders); st = await N.nansenTick(env); assert.equal(st.phase, "idle"); assert.equal(st.leaders, leaders.length);
  assert.equal((await d.one(`SELECT win_rate_pct FROM mob_aq_nansen_leaders WHERE prefix='EFmDSnRb'`)).win_rate_pct, 51.85);
  st = await N.nansenTick(env); assert.equal(st.phase, "idle", "nothing is due: not again before 3 minutes");
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aquarius_link WHERE state='queued'`)).n, 0);
  // the Council: the Nansen buy is an R5 entry of its own source, and the scoreboard keeps it apart from our own winners
  jupCharts[GOODM] = () => { const cs = clone(FX6.jupChart), shift = Math.floor(Date.now() / 60000) * 60 - cs.candles.at(-1).time; for (const c of cs.candles) c.time += shift; return cs; };
  backOf = { [GOODM]: 0.998 };
  prices[GOODM] = clone(FX6.jupChart).candles.at(-1).close;
  // off the real ledger by default: the Nansen buy is logged as a signal of source "nansen" with forward returns to come, nothing is bought on it
  await d.q(`DELETE FROM mob_aq_signals`);
  const t0 = await tick(env);
  assert.notEqual(t0.entered?.entryVariant, "N"); assert.deepEqual((await d.one(`SELECT facts FROM mob_aq_council WHERE symbol='MASK' ORDER BY id DESC LIMIT 1`)).facts.nansen.traders, ["SmoreGanic on pump.fun [22WjtR]"]);
  const ns = await d.one(`SELECT * FROM mob_aq_signals WHERE mint=$1`, [GOODM]);
  assert.equal(ns.source, "nansen"); assert.equal(ns.label, "SmoreGanic on pump.fun [22WjtR]"); assert.ok(ns.price_usd > 0);
  // even with the switch on, R5 from Nansen needs its own evidence: 200+ nansen signals that beat their control
  await d.q(`DELETE FROM mob_aq_council`); await d.q(`DELETE FROM mob_aq_positions`); await d.q(`UPDATE mob_aq_state SET v='1' WHERE k='cash_sol'`);
  env.AQ_NANSEN_R5 = "1";
  const t1 = await tick(env);
  assert.notEqual(t1.entered?.entryVariant, "N", "no evidence, no real trade");
  await seedSignals("nansen", 200, 0.7, 0.1);
  await d.q(`DELETE FROM mob_aq_council`); await d.q(`DELETE FROM mob_aq_positions`); await d.q(`UPDATE mob_aq_state SET v='1' WHERE k='cash_sol'`);
  const t = await tick(env); delete env.AQ_NANSEN_R5;
  assert.equal(t.entered?.symbol, "MASK", JSON.stringify(t.evaluated)); assert.equal(t.entered.strategy, "R5"); assert.equal(t.entered.entryVariant, "N");
  const cn = await d.one(`SELECT reason, facts FROM mob_aq_council WHERE symbol='MASK' AND verdict='PASS'`); assert.match(cn.reason, /R5 nansen: SmoreGanic on pump\.fun \[22WjtR\] bought/); assert.deepEqual(cn.facts.nansen.traders, ["SmoreGanic on pump.fun [22WjtR]"]);
  const s = await S();
  assert.deepEqual([s.whales.nansen.online, s.whales.nansen.signals1h, s.whales.nansen.tradesSeen1h], [true, 1, stored.length]); assert.ok(s.whales.nansen.lastReadAt);
  assert.ok(s.marketFeed.length > 5 && s.marketFeed.every((r) => r.label === "REPORTED" && r.source === "nansen")); assert.ok(s.marketFeed.some((r) => /bought MASK for SOL \(\$70\.5\) -> R5 signal/.test(r.text)));
  assert.deepEqual(s.whales.r5BySource, { ownWinners: { trades: 0, wins: 0 }, nansen: { trades: 0, wins: 0 } });
  const en = s.whales.evidence.find((e) => e.source === "nansen"); assert.equal(en.real, true); assert.ok(en.withControl >= 200 && en.edge15 > 0.5);
  await d.q(`DELETE FROM mob_aq_signals WHERE mint LIKE 'seed%'`);
  jupCharts = {}; backOf = {};
});

// ---------------------------------------------------------------- ledger: atomic claims (2026-11-16 SELL ALL sold every position three times)
import { reconcile, openPosition, closePosition, scaleOut, tickLock, tickUnlock, TICK_LOCK_SEC } from "../src/aq/ledger.mjs";
import { sellAll } from "../src/aq/engine.mjs";
import { repairLedger } from "../scripts/aq-repair-ledger.mjs";
// a clean book: no positions, cash 1, the reconciliation base moved past every trade the earlier tests wrote by hand
async function cleanBook(d) {
  await d.q(`DELETE FROM mob_aq_positions`); await d.q(`UPDATE mob_aq_shadow SET closed_at=now() WHERE closed_at IS NULL`); await d.q(`UPDATE mob_aq_picks SET status='closed' WHERE status IN ('open','queued')`);
  await d.q(`UPDATE mob_aq_state SET v='1' WHERE k='cash_sol'`); await d.q(`UPDATE mob_aq_state SET v='false' WHERE k IN ('kill','destroyed','tick_lock')`);
  await d.q(`INSERT INTO mob_aq_state (k, v) VALUES ('ledger_base', jsonb_build_object('cash', 1, 'tradeId', (SELECT coalesce(max(id),0) FROM mob_aq_trades))) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v`);
}
const posRow = (sym, over = {}) => ({ strategy: "R3", mint: `${sym}mint`, pool: "x", symbol: sym, decimals: 6, tokens_raw: TOK(0.05), size_sol: 0.05, fee_sol: 0.0001, entry_price_usd: 1.1, entry_mid_usd: 1.1, stop_price: 1, target_price: 2,
  stop_pct: 9, target_pct: 80, rt_pct: 0.7, buy_slip_pct: 0, last_price_usd: 1.1, last_value_sol: 0.05, tier: "A", tag: "PASS", soft: [], score: 80, variant: "A", entry_variant: null, strength: 1, timeStopSec: Date.now() / 1000 + 3600, ...over });
const perPosition = (d) => d.q(`SELECT position_id, count(*)::int n FROM mob_aq_trades WHERE position_id IS NOT NULL GROUP BY position_id HAVING count(*) > 1`);

test("ledger: open and close are single claims; the reconciliation identity holds after every move", async () => {
  const d = db(env); await cleanBook(d);
  assert.equal((await reconcile(d)).ok, true);
  const id = await openPosition(d, posRow("LEDA", { tokens_raw: "50000000000" }), 5);
  assert.ok(id > 0);
  let rc = await reconcile(d);
  assert.equal(rc.ok, true); assert.ok(Math.abs(rc.cashSol - (1 - 0.0501)) < 1e-12, "buy debits size + fee");
  assert.equal((await d.q(`SELECT kind FROM mob_aq_flows WHERE position_id=$1 ORDER BY id`, [id])).map((f) => f.kind).join(), "buy,fee");
  assert.equal(await openPosition(d, posRow("LEDA"), 5), null, "the same coin is never bought twice");
  assert.equal(await openPosition(d, posRow("LEDB", { size_sol: 5 }), 5), null, "no cash, no position");
  assert.equal((await reconcile(d)).ok, true, "a refused open leaves cash alone");
  const p = await d.one(`SELECT * FROM mob_aq_positions WHERE id=$1`, [id]);
  // variant-B half: ten concurrent claims, one wins
  const halves = await Promise.all(Array.from({ length: 10 }, () => scaleOut(d, p, { half: "25000000000", gross: 0.03, feeSol: 0.0001, stopPrice: 1.11 })));
  assert.equal(halves.filter(Boolean).length, 1);
  rc = await reconcile(d); assert.equal(rc.ok, true); assert.ok(Math.abs(rc.cashSol - (1 - 0.0501 + 0.0299)) < 1e-12);
  // a close quoted for the old token amount loses: the position changed under it
  assert.equal(await closePosition(d, p, { gross: 0.06, feeSol: 0.0001, why: "stop", gradePrefix: "A" }), null);
  const p2 = await d.one(`SELECT * FROM mob_aq_positions WHERE id=$1`, [id]);
  assert.equal(p2.tokens_raw, "25000000000"); assert.equal(p2.half_done, true);
  // twelve concurrent closes of one position: exactly one trade, cash credited once
  const closes = await Promise.all(Array.from({ length: 12 }, () => closePosition(d, p2, { gross: 0.03, feeSol: 0.0001, exitPx: 1.2, slip: 0.1, why: "target", gradePrefix: "A", exitMid: 1.21 })));
  const won = closes.filter(Boolean);
  assert.equal(won.length, 1);
  const t = won[0];
  assert.ok(Math.abs(t.pnl_sol - (0.0299 + 0.0299 - 0.0501)) < 1e-12); assert.equal(t.grade, "A/win"); assert.equal(t.scaled, true); assert.equal(t.reason, "target");
  // the plan is stored on the trade row (audit bug 11)
  assert.deepEqual([t.stop_price, t.target_price, t.stop_pct, t.target_pct, t.rt_pct, t.pool, t.entry_mid_usd, t.exit_mid_usd, t.strength, t.tier, t.variant, t.tag, t.score], [1.11, 2, 9, 80, 0.7, "x", 1.1, 1.21, 1, "A", "A", "PASS", 80]);
  assert.equal((await d.q(`SELECT kind FROM mob_aq_flows WHERE trade_id=$1 ORDER BY id`, [t.id])).map((f) => f.kind).join(), "sell,fee,win");
  rc = await reconcile(d);
  assert.equal(rc.ok, true); assert.equal(rc.openCostSol, 0); assert.ok(Math.abs(rc.cashSol - (1 + t.pnl_sol)) < 1e-12, "start + sum(pnl) - open cost = cash");
  // the database itself refuses a second trade for one position
  await assert.rejects(d.q(`INSERT INTO mob_aq_trades (position_id, strategy, pnl_sol) VALUES ($1,'R3',0)`, [id]), /duplicate key/);
});

test("ledger: racing entries never double-buy a coin and never pass the slot cap", async () => {
  const d = db(env); await cleanBook(d);
  const same = await Promise.all(Array.from({ length: 8 }, () => openPosition(d, posRow("RACE"), 5)));
  assert.equal(same.filter((x) => x != null).length, 1, "eight racing buys of one coin: one position");
  const many = await Promise.all(Array.from({ length: 10 }, (_, i) => openPosition(d, posRow(`CAP${i}`), 3)));
  const n = (await d.one(`SELECT count(*)::int n FROM mob_aq_positions`)).n;
  assert.ok(n <= 3 && n >= 1, `slot cap 3 held under a race (open ${n})`);
  assert.equal(many.filter((x) => x != null).length, n - 1);
  assert.equal(await openPosition(d, posRow("LATE"), n), null, "cap reached: refused");
  const rc = await reconcile(d);
  assert.equal(rc.ok, true); assert.ok(Math.abs(rc.cashSol - (1 - n * 0.0501)) < 1e-12, "cash was debited once per position that exists");
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_flows WHERE kind='buy' AND label LIKE 'buy CAP%'`)).n, n - 1);
});

test("SELL ALL pressed many times at once: every position is sold exactly once and cash reconciles", async () => {
  const d = db(env); await cleanBook(d); stubAll(); trendingPools = []; await clearCache();
  const syms = ["SA1", "SA2", "SA3", "SA4", "SA5"];
  for (const s of syms) { assert.ok(await openPosition(d, posRow(s), 5)); prices[`${s}mint`] = 1.1; }
  const ids = (await d.q(`SELECT id FROM mob_aq_positions`)).map((r) => r.id);
  const trades0 = (await d.one(`SELECT coalesce(max(id),0)::int n FROM mob_aq_trades`)).n;
  // six HTTP requests in the same instant (double click, retries), like 14:39:30Z in production
  const rs = await Promise.all(Array.from({ length: 6 }, () => R("POST", "/api/aq/sellall", { cookie })));
  const outs = await Promise.all(rs.map((r) => (assert.equal(r.status, 200), r.json())));
  assert.equal(outs.reduce((a, o) => a + o.sold.length, 0), 5, "five positions, five sales in total across the six requests");
  const seen = outs.reduce((a, o) => a + o.sold.length + o.skipped.length, 0);
  assert.ok(seen > 5 && seen <= 30, `the requests overlapped (${seen} rows seen across six requests) and the losers skipped what was already sold`);
  const tr = await d.q(`SELECT * FROM mob_aq_trades WHERE id > $1 ORDER BY id`, [trades0]);
  assert.equal(tr.length, 5); assert.deepEqual(tr.map((t) => t.position_id).sort(), ids.sort()); assert.equal((await perPosition(d)).length, 0);
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_positions`)).n, 0);
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_flows WHERE trade_id = ANY($1::int[])`, [tr.map((t) => t.id)])).n, 15, "three flow rows per sale, no more");
  const rc = await reconcile(d);
  assert.equal(rc.ok, true);
  assert.ok(Math.abs(rc.cashSol - (1 + tr.reduce((a, t) => a + t.pnl_sol, 0))) < 1e-9, "cash = start + sum(pnl): the proceeds were credited once");
  const s = await S();
  assert.equal(s.health.ledger, true); assert.equal(s.ledger.ok, true); assert.ok(Math.abs(s.equitySol - rc.cashSol) < 1e-9); assert.ok(s.pnlTotalSol < 0 && s.pnlTotalSol > -0.01);
});

test("cron tick and SELL ALL overlap on positions at their stop: one trade each; two ticks never run together; a dead lock expires", async () => {
  const d = db(env); await cleanBook(d); stubAll(); trendingPools = []; await clearCache();
  const syms = ["OV1", "OV2", "OV3", "OV4"];
  for (const s of syms) { assert.ok(await openPosition(d, posRow(s), 5)); prices[`${s}mint`] = 0.9; } // under the stop at 1: the tick wants to sell them too
  const trades0 = (await d.one(`SELECT coalesce(max(id),0)::int n FROM mob_aq_trades`)).n;
  const [t1, t2, s1, s2, s3] = await Promise.all([tick(env), tick(env), sellAll(env), sellAll(env), sellAll(env)]);
  assert.equal([t1, t2].filter((t) => t.skipped).length, 1, "the second tick found the lock and did nothing");
  const ran = [t1, t2].find((t) => !t.skipped);
  const tr = await d.q(`SELECT * FROM mob_aq_trades WHERE id > $1`, [trades0]);
  assert.equal(tr.length, 4); assert.equal((await perPosition(d)).length, 0);
  assert.equal(ran.exits.length + s1.sold.length + s2.sold.length + s3.sold.length, 4, "tick exits plus sell-all sales = the four positions");
  assert.equal(tr.filter((t) => t.reason === "stop").length, ran.exits.length);
  let rc = await reconcile(d);
  assert.equal(rc.ok, true); assert.ok(Math.abs(rc.cashSol - (1 + tr.reduce((a, t) => a + t.pnl_sol, 0))) < 1e-9);
  assert.equal((await d.one(`SELECT v FROM mob_aq_state WHERE k='tick_lock'`)).v, false, "the tick released its lock");
  // lock: owned, not released by someone else, expires
  const a = await tickLock(d); assert.ok(a); assert.equal(await tickLock(d), null);
  assert.equal((await tick(env)).skipped, "another tick is running");
  await tickUnlock(d, "someone-else"); assert.equal(await tickLock(d), null, "only the owner releases");
  await d.q(`UPDATE mob_aq_state SET at = now() - make_interval(secs => $1) WHERE k='tick_lock'`, [TICK_LOCK_SEC + 5]);
  const tk = await tick(env); assert.ok(!tk.skipped, "a lock left by a dead tick expires");
  assert.equal((await d.one(`SELECT v FROM mob_aq_state WHERE k='tick_lock'`)).v, false);
});

test("ledger invariant every tick: a cash mismatch raises one brain alert and health.ledger=false; the repair script fixes duplicate closes", async () => {
  const d = db(env); await cleanBook(d); stubAll(); trendingPools = []; await clearCache();
  await tick(env);
  let s = await S(); assert.equal(s.health.ledger, true); assert.equal(s.ledger.diffSol, 0);
  // reproduce production: one position, three closes, three credits (the unique index is dropped the way production never had it)
  const id = await openPosition(d, posRow("DUPE"), 5); const p = await d.one(`SELECT * FROM mob_aq_positions WHERE id=$1`, [id]);
  const t = await closePosition(d, p, { gross: 0.048, feeSol: 0.0001, why: "CEO sell all", gradePrefix: "CEO" });
  await d.q(`DROP INDEX ${env.MOB_SCHEMA}.aqx_trades_position`);
  for (let i = 0; i < 2; i++) {
    await d.q(`INSERT INTO mob_aq_trades (position_id, strategy, mint, symbol, size_sol, back_sol, pnl_sol, pnl_pct, fees_sol, reason, grade, opened_at) SELECT position_id, strategy, mint, symbol, size_sol, back_sol, pnl_sol, pnl_pct, fees_sol, reason, grade, opened_at FROM mob_aq_trades WHERE id=$1`, [t.id]);
    await d.q(`INSERT INTO mob_aq_flows (kind, sol, dept, label) SELECT kind, sol, dept, label FROM mob_aq_flows WHERE trade_id=$1 ORDER BY id`, [t.id]);
    await d.q(`UPDATE mob_aq_state SET v = to_jsonb((v #>> '{}')::float8 + $1::float8) WHERE k='cash_sol'`, [t.back_sol]);
  }
  const alerts = async () => (await d.one(`SELECT count(*)::int n FROM mob_aq_brain WHERE kind='alert' AND text LIKE 'LEDGER ALERT%'`)).n;
  const a0 = await alerts();
  await tick(env);
  s = await S();
  assert.equal(s.health.ledger, false); assert.equal(s.ledger.ok, false); assert.equal(s.ledger.duplicateCloses, 1); assert.ok(s.ledger.diffSol > 0.09);
  assert.equal(await alerts(), a0 + 1); assert.ok(s.brain.some((b) => /^LEDGER ALERT: cash .* does not reconcile/.test(b.text)));
  const rcBot = await d.one(`SELECT status, note FROM mob_aq_bots WHERE key='ex.reconcile'`);
  assert.equal(rcBot.status, "blocked"); assert.match(rcBot.note, /^LEDGER MISMATCH/);
  await tick(env); assert.equal(await alerts(), a0 + 1, "the same mismatch is not written again every minute");
  // dry run changes nothing
  const lines = [];
  const dry = await repairLedger(d, { log: (x) => lines.push(x) });
  assert.equal(dry.applied, false); assert.equal(dry.plan.length, 1); assert.equal(dry.plan[0].keep, t.id); assert.equal(dry.plan[0].deleteTrades.length, 2); assert.equal(dry.plan[0].deleteFlows.length, 6);
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_trades WHERE position_id=$1`, [id])).n, 3); assert.equal((await reconcile(d)).ok, false);
  assert.ok(lines.some((l) => /^DRY RUN/.test(l)));
  // apply: first trade kept, extras and their flows gone, cash from first principles
  const fix = await repairLedger(d, { apply: true, log: () => {} });
  assert.equal(fix.after.ok, true); assert.ok(Math.abs(fix.after.cashSol - dry.predictedCashSol) < 1e-12); assert.ok(Math.abs(fix.after.cashSol - (1 + t.pnl_sol)) < 1e-12);
  assert.deepEqual((await d.q(`SELECT id FROM mob_aq_trades WHERE position_id=$1`, [id])).map((r) => r.id), [t.id]);
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_flows WHERE label IN ('sell DUPE (CEO sell all)')`)).n, 1);
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_flows WHERE label = 'network fee DUPE'`)).n, 2, "the buy fee and one sell fee remain");
  // idempotent: a second apply finds nothing and does not move cash
  const again = await repairLedger(d, { apply: true, log: () => {} });
  assert.equal(again.plan.length, 0); assert.equal(again.after.cashSol, fix.after.cashSol);
  await d.q(`CREATE UNIQUE INDEX aqx_trades_position ON mob_aq_trades (position_id) WHERE position_id IS NOT NULL`);
  await tick(env);
  s = await S(); assert.equal(s.health.ledger, true); assert.ok(s.brain.some((b) => /^Ledger reconciles again/.test(b.text)));
  // a rebuild moves the base, so the identity still holds afterwards
  await openPosition(d, posRow("WOFF"), 5);
  assert.equal((await R("POST", "/api/aq/rebuild", { cookie })).status, 200);
  const rc = await reconcile(d); assert.equal(rc.ok, true); assert.equal(rc.cashSol, 1); assert.equal(rc.realizedSol, 0);
});

// ---------------------------------------------------------------- audit 2026-11-16: bugs 1-12, gate B, measured sticks
test("audit logic: seeded arms, volume pace, fee floor, tradability, plan sized to the hold, replay with cost per coin and stop overshoot", async () => {
  const L = await import("../src/aq/logic.mjs");
  // a seeded flip: same trade same arm, and the two arms of one trade are independent of each other
  assert.equal(L.seed01("mintX|100|time"), L.seed01("mintX|100|time")); assert.notEqual(L.seed01("mintX|100|time"), L.seed01("mintX|101|time"));
  let both = [0, 0, 0, 0];
  for (let i = 0; i < 4000; i++) both[(L.seed01(`m${i}|7|time`) < 0.5 ? 0 : 2) + (L.seed01(`m${i}|7|exit`) < 0.5 ? 0 : 1)]++;
  assert.ok(both.every((n) => n > 880 && n < 1120), `four cells near 1000 each: ${both}`);
  // volume pace: the last 5 minutes against the other 55, unknown stays unknown
  assert.equal(L.volumeRising(null, 1000), null); assert.equal(L.volumeRising(100, null), null); assert.equal(L.volumeRising(100, 1200), false, "exactly the hourly pace is not rising"); assert.equal(L.volumeRising(200, 1200), true);
  assert.equal(L.volumeRising(90, 1200), false);
  // gate B and the fee floor
  assert.deepEqual(L.tradability(0.5, 1), { ok: true, needPct: 3, havePct: 3 }); assert.equal(L.tradability(0.76, 0.56).ok, false, "tier A in the audit: 4.56% needed against 1.68%"); assert.equal(L.tradability(null, 1).ok, false);
  const floor = L.feeFloorSize(0.000061, 3, 0.2); assert.ok(Math.abs(floor - (2 * 0.000061 * 100) / (3 / 6 - 0.2)) < 1e-12); assert.equal(L.feeFloorSize(0.000061, 1.2, 0.2), null, "pool cost alone is over the cap: no size works");
  assert.ok(6 * (0.2 + (2 * 0.000061 * 100) / floor) <= 3 + 1e-9, "at the floor six round trips exactly fit");
  // a stop is never inside the noise of the hold; rr setups keep their ratio, fib keeps its own target
  const st = { price: 1, stopPct: 1.5, targetPct: 3, stopPrice: 0.985, targetPrice: 1.03 };
  assert.deepEqual([L.planFor(st, 1, 10, 2).stopPct, L.planFor(st, 1, 10, 2).targetPct], [1.5, 3]); assert.deepEqual([L.planFor(st, 1, 30, 2).stopPct, L.planFor(st, 1, 30, 2).targetPct], [2.449, 4.898]);
  const fibPlan = L.planFor(st, 1, 30, null); assert.equal(fibPlan.targetPrice, 1.03); assert.ok(fibPlan.stopPct > fibPlan.targetPct * 0.8);
  // replay: a setup that always signals at 1.00 with stop 0.98 / target 1.04. Pool X stops (bar low 0.97), pool Y hits target.
  const mk = (after) => [...Array.from({ length: 31 }, (_, i) => ({ t: i * 60, o: 1, h: 1, l: 1, c: 1 })), after, ...Array.from({ length: 3 }, (_, i) => ({ t: (33 + i) * 60, o: 1, h: 1, l: 1, c: 1 }))];
  const sig = (cs) => (cs[cs.length - 1].t === 30 * 60 ? { signal: true, price: 1, stopPct: 2, targetPct: 4, stopPrice: 0.98, targetPrice: 1.04 } : { signal: false });
  const by = { X: mk({ t: 31 * 60, o: 1, h: 1, l: 0.97, c: 0.975 }), Y: mk({ t: 31 * 60, o: 1, h: 1.05, l: 1, c: 1.04 }), Z: mk({ t: 31 * 60, o: 0.95, h: 0.96, l: 0.94, c: 0.95 }) };
  const flat = L.replaySetup({ X: by.X, Y: by.Y }, sig, {}, 1, { maxBars: 5 });
  assert.equal(flat.trades, 2); assert.equal(flat.expectancyPct, round3((-2 - 1 + 4 - 1) / 2));
  // measured cost per coin (tier A 0.5%, tier C 3%) and stops filled 0.69% past the level; a gap fills at the open
  const per = L.replaySetup(by, sig, {}, (pool) => ({ X: 0.5, Y: 3, Z: 0.5 })[pool], { maxBars: 5, overshootPct: 0.69 });
  assert.equal(per.trades, 3); assert.equal(per.overshootPct, 0.69);
  const want = [(0.98 * (1 - 0.0069) - 1) * 100 - 0.5, 4 - 3, (0.95 - 1) * 100 - 0.5];
  assert.ok(Math.abs(per.expectancyPct - want.reduce((a, b) => a + b, 0) / 3) < 0.002, `${per.expectancyPct}`); assert.ok(Math.abs(per.costPct - (0.5 + 3 + 0.5) / 3) < 0.001);
  assert.equal(L.replaySetup(by, sig, {}, () => null, { maxBars: 5 }).trades, 0, "no measured cost for a coin's tier: not replayed, never assumed");
});
const round3 = (x) => Math.round(x * 1000) / 1000;

test("audit engine: closed candles only, fill anchoring, stop confirmed by the quote, one unit for stops and P&L, no SOL price, authority cache, legacy shadows", async () => {
  const d = db(env); await cleanBook(d);
  for (const t of ["mob_aq_market", "mob_aq_watch", "mob_aq_prices", "mob_aq_council", "mob_aq_candles", "mob_aq_shadow", "mob_aq_pools", "mob_aq_nansen_trades", "mob_aq_signals"]) await d.q(`DELETE FROM ${t}`);
  await d.q(`DELETE FROM mob_aq_state WHERE k IN ('replays','sol_usd','no_sol_ticks')`); await d.q(`DELETE FROM mob_aq_trades`); await cleanBook(d);
  stubAll(); trendingPools = [pool("GOOD", MINT.A, POOL.A, 200000)]; prices = {}; sellOut = {}; backOf = {}; jupLists = () => ({ pools: [] }); jupCharts = {};
  // ---- bug 4: the fixture's 60 bars end one minute ago; a 61st bar that is still forming must not be stored
  const forming = Math.floor(Date.now() / 60000) * 60;
  mock("GET", /geckoterminal\.com\/.*\/ohlcv\/minute/, () => { const j = goldenCandles(); j.data.attributes.ohlcv_list.unshift([forming, 1.1, 1.3, 1.1, 1.1, 5]); return j; });
  resetMocks(); stubAll();
  const realOhlcv = goldenCandles;
  mock("GET", /geckoterminal\.com\/.*\/ohlcv\/minute/, () => { const j = realOhlcv(); j.data.attributes.ohlcv_list.unshift([forming, 1.1, 1.3, 1.1, 1.105, 5]); return j; });
  // (routes match in order: stubAll's ohlcv route answers first, so the forming bar comes through the Jupiter chart instead)
  const asJup = (rows) => ({ candles: rows.map((r) => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] })) });
  jupCharts[MINT.A] = () => asJup([...goldenCandles().data.attributes.ohlcv_list.reverse(), [forming, 1.1, 1.102, 1.1, 1.101, 5]]);
  // ---- bug 1: the buy would fill at 1.25, above the plan's target (1.20): refused, nothing bought
  prices[MINT.A] = 1.25;
  let t = await tick(env);
  const g1 = t.evaluated.find((e) => e.symbol === "GOOD");
  assert.equal(g1.verdict, "BLOCK", JSON.stringify(t.evaluated)); assert.match(g1.reason, /^fill outside the plan: filled at \$1\.25\d*, stop \$1\.0\d+, target \$1\.2$/); assert.equal(t.entered, null);
  const stored = await d.q(`SELECT t FROM mob_aq_candles WHERE pool=$1 ORDER BY t`, [POOL.A]);
  assert.equal(stored.length, 59, "60 bars were read, the last one is still forming"); assert.ok(stored.every((r) => Number(r.t) + 60 <= Date.now() / 1000), "the forming minute is not stored");
  assert.equal((await d.one(`SELECT tier FROM mob_aq_pools WHERE pool=$1`, [POOL.A])).tier, g1.tier, "the pool's tier is kept for the replay's cost");
  // a fill inside the plan: stop and target distances are measured from the fill (1.11), not from the candle close (1.10)
  prices[MINT.A] = 1.11; await d.q(`DELETE FROM mob_aq_council`);
  t = await tick(env);
  assert.equal(t.entered?.symbol, "GOOD", JSON.stringify(t.evaluated));
  let p = await d.one(`SELECT * FROM mob_aq_positions`);
  assert.ok(Math.abs(p.entry_price_usd - 1.11) < 1e-6 && p.target_price === 1.2); assert.ok(Math.abs(p.target_pct - ((1.2 - 1.11) / 1.11) * 100) < 0.01 && Math.abs(p.stop_pct - ((1.11 - p.stop_price) / 1.11) * 100) < 0.01);
  assert.equal(p.sol_usd_entry, SOLUSD); assert.ok(Math.abs(p.exit_k - 0.995) < 1e-6, "a sale fetched 0.995 of the mid at entry"); assert.equal(p.slot, 1); assert.equal(p.tvar, "L");
  assert.equal((await reconcile(d)).ok, true);
  // ---- bug 9: SOL falls 3% and the coin's dollar price falls with it past the dollar stop, but the coin did not move in SOL: no stop
  const cgDown = (usd) => { resetMocks(); mock("GET", "https://api.coingecko.com/api/v3/simple/price", () => ({ solana: { usd, usd_24h_change: 0 }, bitcoin: { usd: 65000, usd_24h_change: 0 } })); const r = [...Array(0)]; stubAll2(); };
  const stubAll2 = () => { const keep = jupCharts; trendingPools = []; mock("GET", "https://lite-api.jup.ag/swap/v1/quote", quoteMock(() => prices)); mock("GET", "https://lite-api.jup.ag/price/v3", jupPx(() => prices)); mock("GET", /.*/, () => res({ status: 503 }, 503)); jupCharts = keep; };
  await clearCache();
  cgDown(SOLUSD * 0.97); prices[MINT.A] = p.stop_price * 0.985; // dollar price under the dollar stop
  t = await tick(env);
  assert.equal(t.exits.length, 0, "a SOL move alone does not trip a stop"); assert.equal(t.feeds.sol_price, true);
  // ---- bug 2: the mid says stop, the executable quote says the price is still above it (stale mid): NOT filled, counted, checked again
  await clearCache(); resetMocks(); stubAll(); trendingPools = [];
  prices[MINT.A] = p.stop_price * 0.99; sellOut[MINT.A] = 1.09; // quote / exit_k = 1.09 mid, well above the stop; selling here would lose ~2%, less than the stop
  t = await tick(env);
  assert.equal(t.exits.length, 0); assert.equal(t.feeds.counters.stopsUnconfirmed, 1);
  p = await d.one(`SELECT * FROM mob_aq_positions`); assert.equal(p.stop_unconfirmed, 1);
  assert.match((await d.one(`SELECT note FROM mob_aq_bots WHERE key='ex.reconcile'`)).note, /cash reconciles|stop NOT confirmed/);
  // the quote agrees: the stop fills at the quote, and the overshoot of the mid past the stop is measured
  delete sellOut[MINT.A];
  t = await tick(env);
  assert.deepEqual(t.exits.map((e) => e.why), ["stop"]);
  let tr = await d.one(`SELECT * FROM mob_aq_trades ORDER BY id DESC LIMIT 1`);
  assert.equal(tr.stop_unconfirmed, 1); assert.ok(Math.abs(tr.overshoot_pct - 1) < 0.01); assert.ok(tr.pnl_pct < -p.stop_pct, "filled at the quote, under the stop"); assert.equal((await reconcile(d)).ok, true);
  // ---- bug 12: every SOL price source is down. An open position at its target is still sold (fee is in SOL), entries wait, the tick is counted
  const id = await openPosition(d, posRow("NOSOL", { stop_price: 1, target_price: 1.2, sol_usd_entry: SOLUSD, exit_k: 0.995, stop_pct: 9, target_pct: 9 }), 5);
  await clearCache(); resetMocks();
  mock("GET", "https://lite-api.jup.ag/swap/v1/quote", quoteMock(() => prices));
  mock("GET", "https://lite-api.jup.ag/price/v3", (rec, u) => Object.fromEntries(u.searchParams.get("ids").split(",").filter((m) => m !== SOL && prices[m] != null).map((m) => [m, { ...clone(Object.values(FX5.jupPrice).find((x) => x.decimals === 6)), usdPrice: prices[m], liquidity: 250000 }])));
  mock("GET", /.*/, () => res({ status: 503 }, 503));
  prices.NOSOLmint = 1.25;
  t = await tick(env);
  assert.equal(t.feeds.sol_price, true, "the price seen a minute ago is still good for ten minutes"); assert.match(t.feeds.counters.solPriceSource, /^last seen \d+s ago/); assert.equal(t.feeds.counters.noSolPriceTicks, 1);
  assert.deepEqual(t.exits.map((e) => [e.symbol, e.why]), [["NOSOL", "target"]]);
  // older than ten minutes: no entries, but exits still work and the position is not left alone
  const id2 = await openPosition(d, posRow("NOSOL2", { stop_price: 1, target_price: 1.2, sol_usd_entry: SOLUSD, exit_k: 0.995, stop_pct: 9, target_pct: 9 }), 5);
  await d.q(`UPDATE mob_aq_state SET v = jsonb_set(v, '{at}', to_jsonb((v->>'at')::float8 - 3600)) WHERE k='sol_usd'`); prices.NOSOL2mint = 0.9;
  t = await tick(env);
  assert.equal(t.feeds.sol_price, false); assert.equal(t.feeds.counters.noSolPriceTicks, 2); assert.equal(t.feeds.counters.noSolPriceRun, 2); assert.ok(t.feeds.counters.solPriceAgeSec > 3500);
  assert.deepEqual(t.exits.map((e) => [e.symbol, e.why]), [["NOSOL2", "stop"]], "managed without any SOL price source"); assert.equal((await reconcile(d)).ok, true);
  let s = await S(); assert.equal(s.health.counters.noSolPriceTicks, 2); assert.equal(s.health.sol_price, false);
  // Binance's public ticker is the last live source (shape read from the real endpoint)
  await clearCache(); resetMocks();
  mock("GET", "https://data-api.binance.vision/api/v3/ticker/price", () => ({ symbol: "SOLUSDT", price: "70.43000000" }));
  mock("GET", /.*/, () => res({ status: 503 }, 503));
  t = await tick(env);
  assert.equal(t.feeds.sol_price, true); assert.equal(t.feeds.counters.solPriceSource, "binance SOLUSDT"); assert.equal(t.feeds.counters.noSolPriceRun, 0);
  assert.equal((await d.one(`SELECT v FROM mob_aq_state WHERE k='sol_usd'`)).v.price, 70.43);
  // ---- a mint-authority coin is judged once and then left alone for hours (it was 17% of all judgements)
  await clearCache(); resetMocks(); stubAll(); await d.q(`DELETE FROM mob_aq_council`);
  trendingPools = [pool("AUTH", MINT.F, POOL.F, 200000)]; rugFor[MINT.F] = () => { const r = safeRug(); r.mintAuthority = "SomeAuthority111"; return r; };
  t = await tick(env);
  const av = t.evaluated.find((e) => e.symbol === "AUTH"); assert.equal(av.kind, "authority"); assert.equal(av.reason, "safety: mint authority enabled");
  await d.q(`UPDATE mob_aq_council SET at = now() - interval '2 hours' WHERE symbol='AUTH'`);
  t = await tick(env); assert.ok(!t.evaluated.some((e) => e.symbol === "AUTH"), "two hours later: still resting");
  await d.q(`UPDATE mob_aq_council SET at = now() - interval '7 hours' WHERE symbol='AUTH'`);
  t = await tick(env); assert.ok(t.evaluated.some((e) => e.symbol === "AUTH"), "after six hours it is looked at again (authorities can be revoked)");
  delete rugFor[MINT.F];
  // ---- bug 5: probes from before the fix are flagged legacy and are in no statistic
  await d.q(`DELETE FROM mob_aq_shadow`);
  await d.q(`INSERT INTO mob_aq_shadow (mint, pool, symbol, block_reason, entry_price, stop_price, target_price, cost_pct, cost_source, time_stop_at, closed_at, pnl_pct, outcome)
    SELECT 'old' || i, 'x', 'OLD', 'no signal: R3 x', 1, 0.8, 1.05, 5, 'trading-kb 5%', now(), now(), -6, 'stop' FROM generate_series(1, 7) i`);
  await d.q(`INSERT INTO mob_aq_shadow (mint, pool, symbol, block_reason, entry_price, stop_price, target_price, cost_pct, cost_source, time_stop_at, closed_at, pnl_pct, outcome, v, strategy)
    VALUES ('new1','x','NEW','R6 signal, off the real ledger: x',1,0.97,1.06,0.8,'measured (Jupiter round trip at 0.05 SOL)',now(),now(),5.2,'target',2,'R6'), ('new2','x','NEW2','not tradable: x',1,0.97,1.06,0.8,'measured',now(),now(),-3.8,'stop',2,'R6')`);
  s = await S();
  assert.equal(s.shadow.n, 2); assert.equal(s.shadow.legacy.n, 7); assert.equal(s.shadow.expectancyPct, 0.7); assert.deepEqual(s.shadow.byStrategy.map((x) => [x.strategy, x.n]), [["R6", 2]]);
  assert.ok(!s.shadow.byReason.some((r) => /no signal/.test(r.reason)));
  // ---- the Time Machine replays every strategy with the cost measured per tier and says so
  await d.q(`DELETE FROM mob_aq_state WHERE k='replays'`); trendingPools = [];
  await tick(env);
  const rp = (await d.one(`SELECT v FROM mob_aq_state WHERE k='replays'`)).v;
  assert.deepEqual(Object.keys(rp.costs), ["A", "B", "C"]); assert.equal(rp.costs.C.src, "audit 2026-11-16 (measured at about 0.03 SOL a trade)"); assert.equal(rp.costs.C.pct, 3.11); assert.equal(rp.overshootSrc, "audit 2026-11-16 (15 stops)"); assert.equal(rp.overshootPct, 0.69);
  assert.ok("R3" in rp && "R6" in rp && "R7" in rp && rp.candles >= 59);
  s = await S(); assert.equal(s.replay.costPct, rp.R3.costPct); assert.equal(s.strategies.find((x) => x.id === "R6").ledger, "shadow"); assert.ok(s.strategies.find((x) => x.id === "R7").replay);
  assert.ok(s.brain.some((b) => /^Time Machine R6 replay: \d+ trades .* net of the measured cost \(A [\d.]+%, B [\d.]+%, C [\d.]+%/.test(b.text)));
  // a strategy whose own replay loses is blocked by name (every strategy, not only the fib)
  const R7L = { n: 45, trades: 45, expectancyPct: -1.2, ci95: [-2, -0.4], costPct: 0.8 };
  await d.q(`UPDATE mob_aq_state SET v = jsonb_set(v, '{R7}', $1::jsonb) WHERE k='replays'`, [JSON.stringify(R7L)]);
  const now = Date.now(), t0 = Math.floor(now / 60000) * 60 - 60, bar = (i, o, c2) => ({ t: t0 - (44 - i) * 60, o, h: Math.max(o, c2) * 1.008, l: Math.min(o, c2) * 0.992, c: c2, v: 1 });
  const slide = [...Array.from({ length: 44 }, (_, i) => (i < 24 ? bar(i, 1, 1) : bar(i, 1 - (i - 24) * 0.0045, 1 - (i - 23) * 0.0045))), bar(44, 0.91, 0.918)];
  const BN = "BounceLoses111111111111111111111111111111111";
  const jp = clone(FX6.jupTop.pools.find((q) => q.baseAsset.symbol === "Fartcoin")); Object.assign(jp.baseAsset, { id: BN, symbol: "BLOS", liquidity: 900000, firstPool: { id: "x", createdAt: new Date(now - 40 * 86400000).toISOString() } }); jp.id = "pool-BLOS";
  jupLists = () => ({ pools: [jp] }); jupCharts[BN] = () => ({ candles: slide.map((c2) => ({ time: c2.t, open: c2.o, high: c2.h, low: c2.l, close: c2.c, volume: 1 })) }); prices[BN] = 0.918; backOf[BN] = 0.998;
  await d.q(`DELETE FROM mob_aq_market WHERE k='jup:top'`);
  t = await tick(env);
  const bl = t.evaluated.find((e) => e.symbol === "BLOS"); assert.equal(bl.verdict, "BLOCK", JSON.stringify(t.evaluated)); assert.match(bl.reason, /^time machine: R7 replay loses \(45 trades, mean -1\.2% net of 0\.8% measured cost, 95% CI -2 to -0\.4\)$/);
  // ---- the size is the CEO's and is not shrunk for risk, but a stop that would cost over 3% of the wallet is refused
  await cleanBook(d); await d.q(`DELETE FROM mob_aq_council`); await d.q(`UPDATE mob_aq_state SET v='0.9' WHERE k='position_sol'`); await d.q(`DELETE FROM mob_aq_state WHERE k='replays'`);
  jupCharts = {}; backOf = {}; jupLists = () => ({ pools: [] }); stubAll(); trendingPools = [pool("GOOD", MINT.A, POOL.A, 200000)]; prices[MINT.A] = 1.1; await clearCache();
  t = await tick(env);
  const rk = t.evaluated.find((e) => e.symbol === "GOOD"); assert.equal(rk.verdict, "BLOCK", JSON.stringify(t.evaluated)); assert.match(rk.reason, /^risk: a stop here costs [\d.]+% of the wallet \(0\.9 SOL, stop [\d.]+%\); the limit is 3%$/); assert.equal(t.entered, null);
  await d.q(`UPDATE mob_aq_state SET v='0.26' WHERE k='position_sol'`); await d.q(`DELETE FROM mob_aq_council`);
  t = await tick(env); assert.equal(t.entered?.symbol, "GOOD", "at the normal size the same coin is taken"); const gp = await d.one(`SELECT sizing FROM mob_aq_positions WHERE symbol='GOOD'`); assert.ok(gp.sizing.lossAtStopPctOfEquity <= 3 && gp.sizing.lossCapPctOfEquity === 3);
  await cleanBook(d);
  jupCharts = {}; backOf = {}; jupLists = () => ({ pools: [] }); stubAll(); trendingPools = [];
});

test("CEO deposit: the wallet base steps up with cash in one statement, profit does not move, health follows the new base, idempotent; size is cut by cash and by 1% of the pool", async () => {
  const { deposit, walletBase } = await import("../src/aq/ledger.mjs"); const { ceoDeposit } = await import("../scripts/aq-deposit.mjs");
  const d = db(env); await cleanBook(d); stubAll(); trendingPools = []; prices = {}; await clearCache();
  await d.q(`DELETE FROM mob_aq_trades`); await cleanBook(d);
  // a small loss on the 1 SOL wallet first
  const id = await openPosition(d, posRow("DEP"), 5); const p = await d.one(`SELECT * FROM mob_aq_positions WHERE id=$1`, [id]);
  const t = await closePosition(d, p, { gross: 0.045, feeSol: 0.0001, why: "stop", gradePrefix: "A" });
  let s = await S(); const pnl0 = s.pnlTotalSol;
  assert.ok(Math.abs(pnl0 - t.pnl_sol) < 1e-9 && pnl0 < 0); assert.equal(s.startSol, 1); assert.equal(s.wallet.baseSol, 1); assert.deepEqual(s.wallet.deposits, []);
  // dry run changes nothing
  const dry = await ceoDeposit(d, { id: "ceo-test-10", target: 10, positionSol: 2.6, log: () => {} });
  assert.equal(dry.applied, false); assert.equal(dry.add, 9); assert.equal(await walletBase(d), 1);
  // applied: +9 SOL of cash and base together
  const ap = await ceoDeposit(d, { id: "ceo-test-10", target: 10, positionSol: 2.6, apply: true, log: () => {} });
  assert.equal(ap.applied, true); assert.equal(ap.after.baseSol, 10); assert.equal(ap.after.ok, true); assert.ok(Math.abs(ap.after.cashSol - (10 + t.pnl_sol)) < 1e-9);
  s = await S();
  assert.equal(s.startSol, 10); assert.ok(Math.abs(s.equitySol - (10 + t.pnl_sol)) < 1e-9, "equity steps up by the deposit"); assert.ok(Math.abs(s.pnlTotalSol - pnl0) < 1e-9, "profit and loss did not move");
  assert.equal(s.ledger.ok, true); assert.equal(s.health.ledger, true); assert.equal(s.positionSol, 2.6); assert.ok(Math.abs(s.cashSol - s.equitySol) < 1e-9); assert.equal(s.maxOpen, 3);
  assert.deepEqual(s.wallet.deposits.map((x) => [x.id, x.sol]), [["ceo-test-10", 9]]); assert.equal(s.survival.stage, "healthy"); assert.equal(s.survival.health, 100);
  assert.equal(s.trades.n, 1, "history and stats kept"); assert.ok(s.brain.some((b) => /^PARAMETER CHANGE BY THE CEO .*DEPOSIT of 9 SOL takes the paper wallet base from 1 to 10 SOL/.test(b.text)));
  // the same deposit can never land twice, however it is called
  const again = await ceoDeposit(d, { id: "ceo-test-10", target: 10, positionSol: 2.6, apply: true, log: () => {} });
  assert.equal(again.applied, false); assert.equal(again.after.baseSol, 10);
  const race = await Promise.all(Array.from({ length: 6 }, () => deposit(d, { id: "race-1", sol: 0.5 })));
  assert.equal(race.filter((r) => r.applied).length, 1); assert.equal(await walletBase(d), 10.5); assert.equal((await reconcile(d)).ok, true);
  await assert.rejects(deposit(d, { id: "bad", sol: -1 }), /positive amount/);
  // health against the new base: 10.5 SOL base, equity 5 -> critical (it would read "thriving" against the old 1 SOL)
  const { survival } = await import("../src/aq/logic.mjs"); assert.equal(survival(5, await walletBase(d)).stage, "critical");
  // sizing at the real size: 2.6 SOL on a deep pool; a $15k-liquidity-equivalent cap binds at 1% of the pool; the quote is taken at that size
  await replayState(R6_GOOD);
  const now = Date.now(), t0 = Math.floor(now / 60000) * 60 - 60, bar = (i, o, c2) => ({ t: t0 - (44 - i) * 60, o, h: Math.max(o, c2) * 1.008, l: Math.min(o, c2) * 0.992, c: c2, v: 1 });
  const brk = [...Array.from({ length: 44 }, (_, i) => bar(i, 1, 1 + (i % 2) * 0.001)), bar(44, 1.001, 1.03)];
  const mk = (sym, mint, liq) => { const q = clone(FX6.jupTop.pools.find((x) => x.baseAsset.symbol === "Fartcoin")); Object.assign(q.baseAsset, { id: mint, symbol: sym, liquidity: liq, firstPool: { id: "x", createdAt: new Date(now - 40 * 86400000).toISOString() } }); q.id = `pool-${sym}`; return q; };
  const DEEP = "DeepPoolAAA11111111111111111111111111111111", THIN = "ThinPoolBBB11111111111111111111111111111111";
  backOf = { [DEEP]: 0.998, [THIN]: 0.998 }; prices[DEEP] = 1.03; prices[THIN] = 1.03;
  const asJup = (cs) => ({ candles: cs.map((c2) => ({ time: c2.t, open: c2.o, high: c2.h, low: c2.l, close: c2.c, volume: 1 })) });
  jupLists = () => ({ pools: [mk("DEEP", DEEP, 900000)] }); jupCharts[DEEP] = () => asJup(brk);
  await d.q(`DELETE FROM mob_aq_council`); calls.length = 0;
  let tk = await tick(env);
  assert.equal(tk.entered?.symbol, "DEEP", JSON.stringify(tk.evaluated)); assert.equal(tk.entered.sizeSol, 2.6);
  assert.ok(calls.some((c) => c.url.includes("/swap/v1/quote") && c.url.includes(`inputMint=${SOL}`) && c.url.includes("amount=2600000000")), "the round trip is quoted at the real 2.6 SOL");
  let ps = await d.one(`SELECT * FROM mob_aq_positions WHERE symbol='DEEP'`);
  assert.deepEqual([ps.sizing.positionSol, ps.sizing.limitedBy, ps.sizing.sizeSol], [2.6, null, 2.6]);
  // regime inputs ride on the trade row and in the state; the GTA 6 list is kept for release day
  assert.equal(ps.sizing.regime.fearGreed, FX.fng.data ? Number(FX.fng.data[0].value) : ps.sizing.regime.fearGreed); assert.ok(["extreme fear", "fear", "neutral", "greed", "extreme greed"].includes(ps.sizing.regime.label));
  s = await S(); assert.equal(s.regime.solUsd, SOLUSD); assert.equal(s.gta6.releaseDate, "2026-11-19"); assert.equal(s.gta6.mainMint, "4kjruqGHDsSqkMdFfCjV7Vb62HPFhtXyWc2t6JpQzDnz"); assert.ok(Array.isArray(s.gta6.tokens)); assert.ok(ps.rt_pct > 0.2 && ps.rt_pct < 0.22, `fee share is tiny at this size: ${ps.rt_pct}`); assert.ok(ps.sizing.lossAtStopPctOfEquity > 0.5);
  // the 1% cap: a $100,000 pool allows $1,000 = 13.88 SOL. With a 20 SOL position setting (and the cash for it) the pool decides the size.
  assert.equal((await deposit(d, { id: "big-1", sol: 100 })).applied, true);
  jupLists = () => ({ pools: [mk("THIN", THIN, 100000)] }); jupCharts[THIN] = () => asJup(brk);
  await d.q(`UPDATE mob_aq_positions SET opened_at = now() - interval '10 minutes'`); await d.q(`DELETE FROM mob_aq_market WHERE k='jup:top'`); await d.q(`DELETE FROM mob_aq_council`);
  await d.q(`UPDATE mob_aq_state SET v='20' WHERE k='position_sol'`);
  tk = await tick(env);
  const th = tk.evaluated.find((e) => e.symbol === "THIN");
  if (tk.entered?.symbol === "THIN") {
    ps = await d.one(`SELECT * FROM mob_aq_positions WHERE symbol='THIN'`);
    assert.equal(ps.sizing.limitedBy, "1% of the pool"); assert.ok(Math.abs(ps.size_sol - 1000 / SOLUSD) < 0.001, `${ps.size_sol}`); assert.ok(ps.size_sol * SOLUSD <= 0.01 * 100000 + 0.01); assert.equal(ps.sizing.positionSol, 20);
  } else assert.fail(`THIN should be taken at the pool-capped size: ${JSON.stringify(th)}`);
  // three open at most; and cash is never overspent: the claim itself refuses a position larger than cash
  assert.equal(await openPosition(d, posRow("TOOBIG", { size_sol: 5000 }), 3), null);
  await openPosition(d, posRow("THIRD"), 3);
  await d.q(`DELETE FROM mob_aq_council`); await d.q(`UPDATE mob_aq_positions SET opened_at = now() - interval '10 minutes'`);
  tk = await tick(env); assert.equal(tk.entered, null); s = await S(); assert.ok(s.council.recent.some((v) => v.reason === "risk: max open positions"), JSON.stringify(s.council.recent.slice(0, 3)));
  assert.equal((await reconcile(d)).ok, true);
  // a rebuild returns the wallet to its base (start + deposits), not to 1
  assert.equal((await R("POST", "/api/aq/rebuild", { cookie })).status, 200);
  const rc = await reconcile(d); assert.equal(rc.cashSol, 110.5); assert.equal(rc.ok, true);
  await d.q(`UPDATE mob_aq_state SET v='0.26' WHERE k='position_sol'`); await d.q(`DELETE FROM mob_aq_state WHERE k='ledger_base'`); await cleanBook(d);
  jupCharts = {}; backOf = {}; jupLists = () => ({ pools: [] });
});

// ================================================================ AQUARIUS ULTIMUM: Council seat, fast alerts, war room
import * as SEAT from "../src/aq/seat.mjs";
const B58 = (name) => { assert.ok(/^[1-9A-HJ-NP-Za-km-z]+$/.test(name), `${name} is not base58`); return (name + "1".repeat(44)).slice(0, 44); };
const mcpCall = async (name, args) => (await (await R("POST", "/api/aq/helper/helperkey123/mcp", { body: { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } } })).json()).result;
const mcpJson = async (name, args) => { const r = await mcpCall(name, args); assert.ok(!r.isError, `${name}: ${r.content[0].text}`); return JSON.parse(r.content[0].text); };
const seatBars = () => {
  const now = Date.now(), t0 = Math.floor(now / 60000) * 60 - 60, bar = (i, o, c2, w = 0.008) => ({ t: t0 - (44 - i) * 60, o, h: Math.max(o, c2) * (1 + w), l: Math.min(o, c2) * (1 - w), c: c2, v: 1 });
  const flat = Array.from({ length: 44 }, (_, i) => bar(i, 1, 1 + (i % 2) * 0.001));
  return { now, brk: [...flat, bar(44, 1.001, 1.03)], near: [...flat, bar(44, 1.001, 1.006, 0.001)] };
};
const jupCoin = (sym, mint, liq = 900000) => { const p = clone(FX6.jupTop.pools.find((q) => q.baseAsset.symbol === "Fartcoin")); Object.assign(p.baseAsset, { id: mint, symbol: sym, liquidity: liq, firstPool: { id: "x", createdAt: new Date(Date.now() - 40 * 86400000).toISOString() } }); p.id = `pool-${sym}`; return p; };
const asJupBars = (cs) => ({ candles: cs.map((c2) => ({ time: c2.t, open: c2.o, high: c2.h, low: c2.l, close: c2.c, volume: 1 })) });
const setRule = (name, w) => db(env).q(`INSERT INTO mob_aq_rules (name, weight) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET weight=EXCLUDED.weight`, [name, w]);
const ageVerdict = (sym, mins = 11) => db(env).q(`UPDATE mob_aq_council SET at = now() - make_interval(mins => $2::int) WHERE symbol=$1`, [sym, mins]);
const moneyState = async (d) => JSON.stringify([await d.q(`SELECT k, v FROM mob_aq_state WHERE k IN ('cash_sol','kill','position_sol','mode','ledger_base','destroyed','variant_default') ORDER BY k`), await d.q(`SELECT id, params, status, alive FROM mob_aq_strategies ORDER BY id`),
  await d.q(`SELECT name, weight FROM mob_aq_rules ORDER BY name`), await d.q(`SELECT id, tokens_raw, stop_price, target_price, time_stop_at, size_sol FROM mob_aq_positions ORDER BY id`), (await d.one(`SELECT count(*)::int n FROM mob_aq_trades`)).n, (await d.one(`SELECT count(*)::int n FROM mob_aq_flows`)).n]);
// a clean desk for the seat tests: nothing open, an R6 that may trade for real, and one freshly opened holding so no EXPLORE is due
async function seatDesk(d, { hold = true } = {}) {
  await S(); // the desk is seeded (a state read does it) even when this test runs alone
  await cleanBook(d);
  for (const t of ["mob_aq_market", "mob_aq_watch", "mob_aq_prices", "mob_aq_council", "mob_aq_votes", "mob_aq_alerts", "mob_aq_rules"]) await d.q(`DELETE FROM ${t}`);
  await d.q(`DELETE FROM mob_aq_state WHERE k IN ('helper_weights','seat_weights')`);
  await d.q(`UPDATE mob_aq_trades SET opened_at = now() - interval '1 hour' WHERE opened_at > now() - interval '1 hour'`);
  stubAll(); trendingPools = []; prices = {}; tradesFor = {}; sellOut = {}; backOf = {}; rugFor = {}; jupCharts = {}; jupLists = () => ({ pools: [] });
  await replayState(R6_GOOD);
  if (hold) { assert.ok(await openPosition(d, posRow("HOLD"), 5)); prices.HOLDmint = 1.1; }
}
const rehold = async (d) => { await cleanBook(d); assert.ok(await openPosition(d, posRow("HOLD"), 5)); };
const vote = (helper, mint, v, confidence, extra = {}) => SEAT.castVote(env, helper, { mint, vote: v, confidence, reason: "test reason", labels: ["INFERRED"], ...extra });

test("council seat: a helper vote is ONE soft rule; it adds, subtracts, lifts a partial setup and keeps the desk out, and never beats a hard block, the gates, cash, slots or the kill switch", async () => {
  const d = db(env); await seatDesk(d);
  const { brk, near } = seatBars();
  const SOFT = B58("SeatSoftAA"), SUBT = B58("SeatSubtAA"), WEAK = B58("SeatWeakAA"), HARD = B58("SeatHardAA"), GATE = B58("SeatGateAA"), CASH = B58("SeatCashAA");
  const list = (sym, mint, bars, px) => { jupLists = () => ({ pools: [jupCoin(sym, mint)] }); jupCharts = { [mint]: () => asJupBars(bars) }; prices[mint] = px; backOf[mint] ??= 0.998; return d.q(`DELETE FROM mob_aq_market WHERE k='jup:top'`); };
  const verdict = (sym) => d.one(`SELECT verdict, reason, number, facts FROM mob_aq_council WHERE symbol=$1 ORDER BY id DESC LIMIT 1`, [sym]);
  // ---- BUY adds. A tier A breakout whose soft score is 66 (fear weighs 3.4): under 70 and no explore is due -> BLOCK
  await setRule("fear", 3.4); await list("SOFT", SOFT, brk, 1.03);
  let t = await tick(env);
  assert.equal(t.entered, null, JSON.stringify(t.evaluated)); let v = await verdict("SOFT");
  assert.equal(v.facts.block, "soft"); assert.equal(v.number, 66); assert.match(v.reason, /^soft rules: score 66 under 70/); assert.ok(!/council seat/.test(v.reason));
  assert.equal(typeof t.seat.graded, "number", "the tick grades votes");
  // a helper reads the case, then votes
  let cs = await mcpJson("aq_council_cases", { helper: "grok" });
  const c0 = cs.cases.find((c) => c.mint === SOFT);
  assert.deepEqual([c0.symbol, c0.tier, c0.strategy, c0.verdict, c0.blockKind, c0.hardBlocksClear, c0.score, c0.number], ["SOFT", "A", "R6", "BLOCK", "soft", true, 66, 66]);
  assert.ok(c0.strength === 1 && c0.atr5Pct > 0 && c0.plan.stopPct > 0 && c0.plan.targetPct > c0.plan.stopPct && c0.softObjections.includes("fear")); assert.deepEqual(c0.canVote, ["BUY", "SKIP"]);
  assert.ok(cs.positions.some((p) => p.symbol === "HOLD" && p.entryUsd === 1.1 && p.stopUsd === 1 && p.targetUsd === 2 && p.ageMin >= 0 && p.canVote[0] === "EXIT"));
  // an expired vote does nothing
  let r = await vote("grok", SOFT, "BUY", 0.8); assert.ok(r.vote && r.vote.worthPoints === 8 && r.vote.counts === true, JSON.stringify(r));
  await d.q(`UPDATE mob_aq_votes SET expires_at = now() - interval '1 second' WHERE id=$1`, [r.vote.id]);
  assert.deepEqual(await SEAT.seatEffects(d, [SOFT]), {}); await ageVerdict("SOFT");
  t = await tick(env); assert.equal(t.entered, null); v = await verdict("SOFT"); assert.equal(v.number, 66); assert.ok(!/council seat/.test(v.reason), "expired: not in the score");
  assert.equal((await d.one(`SELECT applied FROM mob_aq_votes WHERE id=$1`, [r.vote.id])).applied, null);
  // a fresh BUY 0.8 = +8: 66 -> 74. The coin is judged again at once (no waiting for the cooldown) and passes, at the normal size
  r = await vote("grok", SOFT, "BUY", 0.8);
  t = await tick(env);
  assert.equal(t.entered?.symbol, "SOFT", JSON.stringify(t.evaluated)); assert.equal(t.entered.tag, "PASS"); assert.equal(t.entered.sizeSol, 0.26); assert.equal(t.entered.score, 74);
  v = await verdict("SOFT"); assert.equal(v.verdict, "PASS");
  assert.match(v.reason, /hard blocks clear; 6x round trip .* score 74 \(soft: no_whale, fear\); council seat MOVED this \(BLOCK became PASS\): grok BUY 0\.8 x weight 1 = \+8; score 66 -> 74 against 70$/);
  assert.deepEqual([v.facts.seat.delta, v.facts.seat.scoreBefore, v.facts.seat.scoreAfter, v.facts.seat.moved, v.facts.seat.votes[0].rule], [8, 66, 74, "BLOCK became PASS", "council_seat:grok"]);
  const pS = await d.one(`SELECT * FROM mob_aq_positions WHERE symbol='SOFT'`);
  let vr = await d.one(`SELECT * FROM mob_aq_votes WHERE id=$1`, [r.vote.id]); assert.equal(vr.position_id, pS.id); assert.equal(vr.applied.verdict, "PASS"); assert.equal(vr.applied.moved, "BLOCK became PASS"); assert.ok(vr.judged_at);
  assert.ok(pS.target_pct >= 6 * pS.rt_pct, "the cost gate held for the voted entry too");
  let s = await S(); const rec = s.council.recent.find((x) => x.symbol === "SOFT" && x.verdict === "PASS"); assert.equal(rec.seat.votes[0].helper, "grok"); assert.equal(rec.seat.delta, 8);
  assert.ok(s.council.votes.some((x) => x.helper === "grok" && x.mint === SOFT && x.vote === "BUY"));
  assert.equal((await reconcile(d)).ok, true);
  // ---- SKIP subtracts. Score 75 would pass; SKIP 1.0 = -10 -> 65: BLOCK
  await rehold(d); await setRule("fear", 3.4); await list("SUBT", SUBT, brk, 1.03);
  t = await tick(env); assert.equal(t.entered, null); assert.equal((await verdict("SUBT")).number, 66);
  await setRule("fear", 2.5); r = await vote("chatgpt", SUBT, "SKIP", 1); assert.equal(r.vote.worthPoints, -10); await ageVerdict("SUBT");
  t = await tick(env); assert.equal(t.entered, null, JSON.stringify(t.evaluated)); v = await verdict("SUBT");
  assert.match(v.reason, /^soft rules: score 65 under 70 .*council seat MOVED this \(PASS became BLOCK\): chatgpt SKIP 1 x weight 1 = -10; score 75 -> 65 against 70/); assert.equal(v.facts.block, "soft");
  assert.equal((await d.one(`SELECT applied FROM mob_aq_votes WHERE id=$1`, [r.vote.id])).applied.verdict, "BLOCK");
  // an explore is due: the same SKIP keeps the coin out of it; a faint SKIP (0.3 = -3) does not
  await setRule("fear", 3.4); await d.q(`UPDATE mob_aq_positions SET opened_at = now() - interval '10 minutes'`); await ageVerdict("SUBT");
  t = await tick(env); assert.equal(t.entered, null, JSON.stringify(t.evaluated)); v = await verdict("SUBT");
  assert.match(v.reason, /council seat MOVED this \(EXPLORE became BLOCK\): chatgpt SKIP 1 x weight 1 = -10; score 66 -> 56 against 70; a net vote of -5 or lower keeps a coin out of EXPLORE/);
  r = await vote("chatgpt", SUBT, "SKIP", 0.3); assert.ok(r.vote.replaced); await ageVerdict("SUBT");
  t = await tick(env); assert.equal(t.entered?.symbol, "SUBT", JSON.stringify(t.evaluated)); assert.equal(t.entered.tag, "EXPLORE"); assert.equal(t.entered.sizeSol, 0.26);
  assert.match((await verdict("SUBT")).reason, /^EXPLORE: .*council seat \(verdict unchanged\): chatgpt SKIP 0\.3 x weight 1 = -3; score 66 -> 63 against 70$/);
  // ---- LIFT. A partial setup (no breakout yet) is "no signal" when no explore is due; a faint BUY does not change that; a strong BUY lifts it to a normal entry at the normal size
  await rehold(d); await setRule("fear", 1); await list("WEAK", WEAK, near, 1.006);
  t = await tick(env); assert.equal(t.entered, null, JSON.stringify(t.evaluated)); v = await verdict("WEAK");
  assert.equal(v.facts.block, "signal"); const st = v.facts.strength; assert.ok(st > 0.3 && st < 0.95, String(st)); assert.equal(v.facts.score, 90);
  r = await vote("grok", WEAK, "BUY", 0.05);
  t = await tick(env); assert.equal(t.entered, null, JSON.stringify(t.evaluated)); v = await verdict("WEAK");
  assert.match(v.reason, /^no signal \(strength 0\.\d+\).*council seat \(verdict unchanged\): grok BUY 0\.05 x weight 1 = \+0\.5; score 90 -> 90\.5 against 70$/);
  r = await vote("grok", WEAK, "BUY", 0.9);
  t = await tick(env);
  assert.equal(t.entered?.symbol, "WEAK", JSON.stringify(t.evaluated)); assert.equal(t.entered.tag, "PASS"); assert.equal(t.entered.sizeSol, 0.26, "the normal size, not more"); assert.equal(t.entered.strength, st);
  v = await verdict("WEAK"); assert.match(v.reason, new RegExp(`council seat MOVED this \\(lifted from EXPLORE-WEAK to a normal entry\\): grok BUY 0\\.9 x weight 1 = \\+9; score 90 -> 99 against 70; strength ${String(st).replace(".", "\\.")} \\+ 0\\.9 reaches 1$`));
  assert.ok(t.entered.targetPct >= 6 * t.entered.rtPct && 3 * t.entered.atr5Pct >= 6 * t.entered.rtPct, "both cost gates held");
  // the helper's lane weight scales the vote, never past the heaviest soft rule (3)
  await d.q(`INSERT INTO mob_aq_state (k, v) VALUES ('helper_weights', '{"grok": 2, "codex": 0.25}') ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v`);
  const fxw = await SEAT.seatEffects(d, [WEAK]); assert.deepEqual([fxw[WEAK].votes[0].mult, fxw[WEAK].delta], [2, 18]);
  assert.equal(SEAT.seatMult(2, 2), 3); assert.equal(SEAT.seatMult(0.2, 0.25), 0.2);
  await d.q(`DELETE FROM mob_aq_state WHERE k='helper_weights'`);
  // ---- a hard block is never passed: mint authority. BUY 1.0 from every seat changes nothing, and the coin is not even re-opened
  await rehold(d); rugFor[HARD] = () => ({ ...safeRug(), mintAuthority: "SomeAuthority1111111111111111111111111111111" }); await list("HARD", HARD, brk, 1.03);
  t = await tick(env); v = await verdict("HARD"); assert.equal(v.verdict, "BLOCK"); assert.equal(v.reason, "safety: mint authority enabled"); assert.equal(v.facts.block, "authority");
  for (const h of ["grok", "chatgpt", "codex"]) assert.ok((await vote(h, HARD, "BUY", 1)).vote);
  cs = await SEAT.councilCases(env); assert.equal(cs.cases.find((c) => c.mint === HARD).hardBlocksClear, false); assert.equal(cs.cases.find((c) => c.mint === HARD).votes.length, 3);
  assert.deepEqual(await SEAT.seatRequeue(d), [], "a vote does not re-open a hard-blocked coin");
  const n0 = (await d.one(`SELECT count(*)::int n FROM mob_aq_council WHERE symbol='HARD'`)).n;
  t = await tick(env); assert.equal(t.entered, null); assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_council WHERE symbol='HARD'`)).n, n0, "still resting");
  await ageVerdict("HARD", 400); // even when it is judged again with three live BUY votes
  await d.q(`UPDATE mob_aq_votes SET expires_at = now() + interval '5 minutes', at = now() WHERE mint=$1`, [HARD]);
  t = await tick(env); assert.equal(t.entered, null); v = await verdict("HARD"); assert.equal(v.reason, "safety: mint authority enabled"); assert.ok(!v.facts.seat);
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_positions WHERE symbol='HARD'`)).n, 0);
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_votes WHERE mint=$1 AND applied IS NOT NULL`, [HARD])).n, 0);
  // ---- the cost gate is never passed: a coin that loses 10% on a round trip. First sight: cost gate at the quote. With BUY votes: still out.
  await rehold(d); backOf[GATE] = 0.9; await list("GATE", GATE, brk, 1.03);
  t = await tick(env); v = await verdict("GATE"); assert.equal(v.verdict, "BLOCK"); assert.equal(v.reason, "cost gate");
  for (const h of ["grok", "chatgpt", "codex"]) assert.ok((await vote(h, GATE, "BUY", 1)).vote);
  await ageVerdict("GATE", 20);
  t = await tick(env); assert.equal(t.entered, null, JSON.stringify(t.evaluated)); v = await verdict("GATE"); assert.equal(v.verdict, "BLOCK"); assert.match(v.reason, /^not tradable: 6x round trip/);
  // and when the vote does reach the decision (score +30), the measured cost still refuses the trade and the vote is recorded as overruled
  await d.q(`DELETE FROM mob_aq_council WHERE symbol='GATE'`); await d.q(`UPDATE mob_aq_votes SET expires_at = now() + interval '5 minutes' WHERE mint=$1`, [GATE]);
  t = await tick(env); assert.equal(t.entered, null, JSON.stringify(t.evaluated)); v = await verdict("GATE"); assert.equal(v.reason, "cost gate"); assert.equal(v.facts.seat.delta, 30);
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_votes WHERE mint=$1 AND applied->>'verdict'='BLOCK' AND applied->>'reason'='cost gate'`, [GATE])).n, 3);
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_positions WHERE symbol='GATE'`)).n, 0);
  // ---- cash, the kill switch and the slots are never passed
  await rehold(d); await setRule("fear", 3.4); await list("CASH", CASH, brk, 1.03);
  t = await tick(env); assert.equal((await verdict("CASH")).number, 66);
  r = await vote("grok", CASH, "BUY", 0.8);
  const cash0 = (await d.one(`SELECT v FROM mob_aq_state WHERE k='cash_sol'`)).v;
  const base0 = (await d.one(`SELECT v FROM mob_aq_state WHERE k='ledger_base'`)).v; // (the wallet base shrinks with it, so this is a small wallet, not a destroyed island)
  await d.q(`UPDATE mob_aq_state SET v='0.03' WHERE k='cash_sol'`); await d.q(`UPDATE mob_aq_state SET v = v || '{"cash": 0.08}' WHERE k='ledger_base'`);
  t = await tick(env); assert.equal(t.entered, null, JSON.stringify(t.evaluated)); v = await verdict("CASH");
  assert.match(v.reason, /^size: needs .* cash 0\.03 SOL and 1% of the pool allow 0\.0299\d* SOL$/); assert.ok(!v.facts.votable, "a size refusal is not a votable case"); assert.equal((await d.one(`SELECT applied FROM mob_aq_votes WHERE id=$1`, [r.vote.id])).applied.verdict, "BLOCK");
  await d.q(`UPDATE mob_aq_state SET v=$1 WHERE k='cash_sol'`, [JSON.stringify(cash0)]); await d.q(`UPDATE mob_aq_state SET v=$1 WHERE k='ledger_base'`, [JSON.stringify(base0)]);
  r = await vote("grok", CASH, "BUY", 0.8); await d.q(`DELETE FROM mob_aq_council WHERE symbol='CASH'`);
  assert.equal((await R("POST", "/api/aq/kill", { cookie, body: { on: true } })).status, 200);
  t = await tick(env); assert.equal(t.entered, null); assert.equal((await d.one(`SELECT reason FROM mob_aq_council ORDER BY id DESC LIMIT 1`)).reason, "risk: kill switch on");
  assert.equal((await R("POST", "/api/aq/kill", { cookie, body: { on: false } })).status, 200);
  assert.ok(await openPosition(d, posRow("HOLDB"), 5)); assert.ok(await openPosition(d, posRow("HOLDC"), 5)); prices.HOLDBmint = 1.1; prices.HOLDCmint = 1.1;
  t = await tick(env); assert.equal(t.entered, null); assert.equal((await d.one(`SELECT reason FROM mob_aq_council ORDER BY id DESC LIMIT 1`)).reason, "risk: max open positions");
  assert.equal((await d.one(`SELECT applied FROM mob_aq_votes WHERE id=$1`, [r.vote.id])).applied, null, "the vote never reached a decision");
  // the same vote, still live, with the limits out of the way: it was the limits that held, not a dead vote
  await rehold(d);
  t = await tick(env); assert.equal(t.entered?.symbol, "CASH", JSON.stringify(t.evaluated)); assert.equal(t.entered.score, 74); assert.equal(t.entered.sizeSol, 0.26);
  assert.equal((await reconcile(d)).ok, true);
  rugFor = {}; backOf = {}; jupCharts = {}; jupLists = () => ({ pools: [] });
});

test("council seat votes: validation, one live vote per helper per coin, replacement, expiry, the test identity, rate limit", async () => {
  const d = db(env); await seatDesk(d);
  const A = B58("VoteCaseAA"), U = B58("VoteUnknownAA");
  await d.q(`INSERT INTO mob_aq_council (verdict, symbol, mint, reason, facts) VALUES ('BLOCK','VCASE',$1,'no signal: x','{"tier":"A","block":"signal"}')`, [A]);
  prices[A] = 2;
  for (const [args, re] of [[{ mint: "nope" }, /mint must be/], [{ vote: "HOLD" }, /vote must be BUY, SKIP or EXIT/], [{ confidence: 1.2 }, /confidence/], [{ confidence: "0.5" }, /confidence/], [{ confidence: -0.1 }, /confidence/], [{ reason: " " }, /reason is required/], [{ labels: ["SURE"] }, /labels must include/], [{ mint: U }, /not a case/], [{ vote: "EXIT" }, /EXIT is for an open position/], [{ mint: "HOLDmint" }, /mint must be/]])
    assert.match((await SEAT.castVote(env, "grok", { mint: A, vote: "BUY", confidence: 0.5, reason: "r", labels: ["CLAIMED"], ...args })).error, re, JSON.stringify(args));
  assert.match((await SEAT.castVote(env, "alex", { mint: A, vote: "BUY", confidence: 0.5, reason: "r", labels: ["CLAIMED"] })).error, /helper must be one of grok, chatgpt, codex/);
  // through the link: a caller that does not say who it is cannot vote
  assert.match((await mcpCall("aq_council_vote", { mint: A, vote: "BUY", confidence: 0.5, reason: "r", labels: ["CLAIMED"] })).content[0].text, /say who you are/);
  assert.match((await mcpCall("aq_council_vote", { helper: "alex", mint: A, vote: "BUY", confidence: 0.5, reason: "r", labels: ["CLAIMED"] })).content[0].text, /say who you are/);
  // a held coin: EXIT only
  const HM = B58("VoteKeptAA"); assert.ok(await openPosition(d, posRow("VHELD", { mint: HM }), 5)); prices[HM] = 1.1;
  assert.match((await vote("grok", HM, "BUY", 0.5)).error, /already held/);
  const ex = await mcpJson("aq_council_vote", { helper: "grok", mint: HM, vote: "EXIT", confidence: 0.6, reason: "story is dying on X", labels: ["CLAIMED"] });
  assert.match(ex.note, /a warning, not an order/); assert.equal(ex.worthPoints, 0);
  // one live vote per helper per coin; the newer replaces the older; another helper's vote stands beside it
  const v1 = (await vote("grok", A, "BUY", 0.4)).vote, v2 = (await vote("grok", A, "SKIP", 0.7)).vote, v3 = (await vote("chatgpt", A, "BUY", 0.5)).vote;
  assert.equal(v1.replaced, null); assert.equal(v2.replaced, v1.id); assert.equal(v1.priceUsd, 2);
  // only a verdict the Council marked votable (a partial setup's missing signal, or the soft score) is re-opened by a BUY; a "no setup at all" or a risk refusal is not
  assert.deepEqual(await SEAT.seatRequeue(d), []); assert.equal((await SEAT.councilCases(env)).cases.find((c) => c.mint === A).hardBlocksClear, false);
  await d.q(`UPDATE mob_aq_council SET facts = facts || '{"votable": true}' WHERE mint=$1`, [A]);
  assert.deepEqual(await SEAT.seatRequeue(d), [A]); assert.equal((await SEAT.councilCases(env)).cases.find((c) => c.mint === A).hardBlocksClear, true);
  let rows = await d.q(`SELECT id, helper, vote, live, counted, replaced_at FROM mob_aq_votes WHERE mint=$1 ORDER BY id`, [A]);
  assert.deepEqual(rows.map((r) => [r.helper, r.vote, r.live]), [["grok", "BUY", false], ["grok", "SKIP", true], ["chatgpt", "BUY", true]]); assert.ok(rows[0].replaced_at);
  assert.deepEqual((await SEAT.seatEffects(d, [A]))[A].votes.map((x) => [x.helper, x.points]), [["grok", -7], ["chatgpt", 5]]); assert.equal((await SEAT.seatEffects(d, [A]))[A].delta, -2);
  // four posts at the same instant: exactly one stays live
  const burst = await Promise.all([0.1, 0.2, 0.3, 0.4].map((c) => vote("grok", A, "BUY", c)));
  assert.ok(burst.some((b) => b.vote), JSON.stringify(burst));
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_votes WHERE mint=$1 AND helper='grok' AND live`, [A])).n, 1);
  // repeating the same call inside 15 minutes is not a second result: only the first of a direction is counted; a change of mind is
  rows = await d.q(`SELECT vote, counted FROM mob_aq_votes WHERE mint=$1 AND helper='grok' ORDER BY id`, [A]);
  assert.deepEqual(rows.slice(0, 2).map((r) => [r.vote, r.counted]), [["BUY", true], ["SKIP", true]]); assert.ok(rows.slice(2).every((r) => r.vote === "BUY" && r.counted === false), JSON.stringify(rows));
  // expiry: after five minutes a vote is in no score and in no case list
  assert.equal(SEAT.VOTE_TTL_SEC, 300); const lv = await d.one(`SELECT extract(epoch FROM expires_at - at)::float8 ttl FROM mob_aq_votes WHERE id=$1`, [v3.id]); assert.ok(Math.abs(lv.ttl - 300) < 1);
  await d.q(`UPDATE mob_aq_votes SET at = now() - interval '301 seconds', expires_at = now() - interval '1 second' WHERE mint=$1`, [A]);
  assert.deepEqual(await SEAT.seatEffects(d, [A]), {}); assert.deepEqual((await SEAT.councilCases(env)).cases.find((c) => c.mint === A).votes, []); assert.deepEqual(await SEAT.seatRequeue(d), []);
  assert.ok(!(await S()).council.votes.some((x) => x.mint === A));
  // the test identity: stored and answered, never in a score, never graded, no seat
  const tv = await mcpJson("aq_council_vote", { helper: "claude-test", mint: A, vote: "BUY", confidence: 1, reason: "wiring check", labels: ["INFERRED"] });
  assert.equal(tv.counts, false); assert.equal(tv.worthPoints, 0); assert.match(tv.note, /engine ignores this vote/);
  assert.deepEqual(await SEAT.seatEffects(d, [A]), {}); assert.deepEqual(await SEAT.seatRequeue(d), []);
  assert.ok(!(await S()).council.seats.some((x) => x.helper === "claude-test"));
  assert.match((await mcpCall("aq_post_evidence", { helper: "claude-test", role: "scout", text: "x", label: "CLAIMED" })).content[0].text, /say who you are/, "the test identity cannot post evidence");
  // rate limit
  await d.q(`INSERT INTO mob_aq_votes (helper, mint, vote, confidence, expires_at, live) SELECT 'codex', 'm' || i, 'BUY', 0.1, now(), false FROM generate_series(1, 20) i`);
  assert.match((await vote("codex", A, "BUY", 0.5)).error, /rate limit: 20 votes a minute/);
  await d.q(`DELETE FROM mob_aq_votes`); await cleanBook(d);
});

test("council seat grading: every vote is graded (15 minutes forward, or the trade it was part of) and a helper's weight follows its own record", async () => {
  const d = db(env); await seatDesk(d, { hold: false });
  assert.deepEqual([SEAT.seatWeight({ right: 9, wrong: 0 }), SEAT.seatWeight({ right: 5, wrong: 5 }), SEAT.seatWeight({ right: 10, wrong: 0 }), SEAT.seatWeight({ right: 0, wrong: 10 }), SEAT.seatWeight({ right: 9, wrong: 3 })], [1, 1, 2, 0.2, 1.5]);
  const UP = B58("GradeUpAA"), DN = B58("GradeDownAA"), GONE = B58("GradeGoneAA");
  prices[UP] = 1.02; prices[DN] = 0.97; // against a vote price of 1: +2% and -3%
  const ins = (helper, mint, v, mins, o = {}) => d.one(`INSERT INTO mob_aq_votes (helper, mint, vote, confidence, at, expires_at, live, price_usd, cost_pct, counted, seat, position_id, pct_15m, graded_at, is_right)
    VALUES ($1,$2,$3,0.5, now() - make_interval(mins => $4::int), now() - make_interval(mins => $4::int) + interval '5 minutes', false, $5, 0.5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [helper, mint, v, mins, "price" in o ? o.price : 1, o.counted ?? true, o.seat ?? true, o.pos ?? null, o.pct15 ?? null, o.pct15 != null ? new Date() : null, o.pct15 != null ? true : null]);
  const id = {
    buyUp: await ins("grok", UP, "BUY", 16), skipUp: await ins("chatgpt", UP, "SKIP", 16), buyDn: await ins("grok", DN, "BUY", 17), skipDn: await ins("chatgpt", DN, "SKIP", 17), exitDn: await ins("codex", DN, "EXIT", 16, { pos: 999001 }), exitUp: await ins("codex", UP, "EXIT", 16, { pos: 999002 }),
    young: await ins("grok", UP, "BUY", 10), repeat: await ins("grok", UP, "BUY", 18, { counted: false }), noPrice: await ins("grok", UP, "BUY", 16, { price: null }), late: await ins("grok", GONE, "BUY", 26), tester: await ins("claude-test", UP, "BUY", 16, { seat: false }),
    thirty: await ins("grok", UP, "BUY", 31, { pct15: 1.5 }),
  };
  // two votes that were part of an entry: graded by that trade's result, not by the clock
  const posW = await openPosition(d, posRow("GWIN"), 5), posL = await openPosition(d, posRow("GLOSE"), 5);
  const tw = await closePosition(d, { id: posW, tokens_raw: TOK(0.05) }, { gross: 0.06, feeSol: 0.0001, why: "target", gradePrefix: "A" }), tl = await closePosition(d, { id: posL, tokens_raw: TOK(0.05) }, { gross: 0.04, feeSol: 0.0001, why: "stop", gradePrefix: "A" });
  assert.ok(tw.pnl_sol > 0 && tl.pnl_sol < 0);
  id.buyWin = await ins("grok", UP, "BUY", 2, { pos: posW }); id.skipWin = await ins("chatgpt", UP, "SKIP", 2, { pos: posW }); id.buyLose = await ins("grok", DN, "BUY", 2, { pos: posL });
  const openP = await openPosition(d, posRow("GOPEN"), 5); id.buyOpen = await ins("grok", DN, "BUY", 20, { pos: openP }); // its trade is still open: it waits
  const g = await SEAT.seatTick(env);
  const row = Object.fromEntries((await d.q(`SELECT * FROM mob_aq_votes`)).map((r) => [r.id, r])), R_ = (k) => row[id[k].id];
  assert.deepEqual(["buyUp", "skipUp", "buyDn", "skipDn", "exitDn", "exitUp"].map((k) => [R_(k).pct_15m, R_(k).is_right, R_(k).grade_by]),
    [[2, true, "forward 15m"], [2, false, "forward 15m"], [-3, false, "forward 15m"], [-3, true, "forward 15m"], [-3, true, "forward 15m"], [2, false, "forward 15m"]]);
  assert.equal(R_("young").graded_at, null, "not yet 15 minutes old"); assert.equal(R_("repeat").is_right, true); assert.equal(R_("buyOpen").graded_at, null);
  assert.deepEqual([R_("noPrice").is_right, R_("noPrice").grade_by], [null, "no price at the vote"]); assert.deepEqual([R_("late").is_right, R_("late").grade_by], [null, "no price 15 minutes later"]);
  assert.equal(R_("tester").graded_at, null, "the test identity is never graded"); assert.equal(R_("thirty").pct_30m, 2);
  assert.deepEqual(["buyWin", "skipWin", "buyLose"].map((k) => [R_(k).is_right, R_(k).grade_by, R_(k).trade_id]), [[true, "trade", tw.id], [false, "trade", tw.id], [false, "trade", tl.id]]);
  assert.ok(g.graded >= 9);
  // a BUY is only right when the move beats the cost of a round trip: +0.4% against 0.5% cost is not
  prices[UP] = 1.004; const thin = await ins("grok", UP, "BUY", 16); await SEAT.seatTick(env);
  assert.deepEqual(await d.one(`SELECT pct_15m, is_right FROM mob_aq_votes WHERE id=$1`, [thin.id]), { pct_15m: 0.4, is_right: false });
  // the record: counted votes only (the repeat is graded but is not a second result)
  let seats = Object.fromEntries((await S()).council.seats.map((x) => [x.helper, x]));
  assert.deepEqual([seats.grok.right, seats.grok.wrong, seats.chatgpt.right, seats.chatgpt.wrong, seats.codex.right, seats.codex.wrong], [3, 3, 1, 2, 1, 1]);
  assert.deepEqual([seats.grok.weight, seats.chatgpt.weight, seats.codex.weight], [1, 1, 1], "under ten graded votes the weight stays 1"); assert.ok(seats.grok.lastVoteAt && seats.grok.votes >= 8);
  // ten more right calls for chatgpt, ten more wrong ones for codex: the weights move, on the record, and the next vote is worth that much
  await d.q(`INSERT INTO mob_aq_votes (helper, mint, vote, confidence, at, expires_at, live, counted, is_right, graded_at, grade_by, price_usd) SELECT h, 'seed' || i, 'BUY', 0.5, now() - interval '1 hour', now() - interval '55 minutes', false, true, h = 'chatgpt', now(), 'forward 15m', 1
    FROM generate_series(1, 10) i, unnest(ARRAY['chatgpt','codex']) h`);
  const g2 = await SEAT.seatTick(env);
  seats = Object.fromEntries((await S()).council.seats.map((x) => [x.helper, x]));
  assert.deepEqual([seats.chatgpt.right, seats.chatgpt.wrong, seats.chatgpt.weight], [11, 2, round3(1 + 2 * (11 / 13 - 0.5))]); assert.deepEqual([seats.codex.right, seats.codex.wrong, seats.codex.weight], [1, 11, round3(Math.max(0.2, 1 + 2 * (1 / 12 - 0.5)))]);
  assert.equal(g2.moved.length, 2);
  const tr = await d.one(`SELECT text FROM mob_aq_brain WHERE kind='tournament' AND text LIKE 'Council seat weights%' ORDER BY id DESC LIMIT 1`);
  assert.match(tr.text, /council_seat:chatgpt 1 -> 1\.692 \(11 right, 2 wrong of 13 graded votes\)/); assert.match(tr.text, /council_seat:codex 1 -> 0\.2 /);
  assert.equal((await SEAT.seatTick(env)).moved.length, 0, "an unchanged weight is not recorded twice");
  const C2 = B58("GradeCaseAA"); await d.q(`INSERT INTO mob_aq_council (verdict, symbol, mint, reason, facts) VALUES ('BLOCK','GCASE',$1,'no signal: x','{"tier":"A","block":"signal"}')`, [C2]);
  assert.equal((await vote("chatgpt", C2, "BUY", 1)).vote.worthPoints, 16.92); assert.equal((await vote("codex", C2, "BUY", 1)).vote.worthPoints, 2);
  // a helper whose record is bad cannot keep the desk out of an explore any more: SKIP 1.0 x 0.2 = -2, above the -5 line
  assert.equal((await vote("codex", C2, "SKIP", 1)).vote.worthPoints, -2);
  // the soft rules of the desk are untouched by seat grading
  assert.deepEqual((await S()).rules.map((r) => r.name).filter((n) => /seat/.test(n)), []);
  await d.q(`DELETE FROM mob_aq_votes`); await cleanBook(d);
});

test("EXIT vote: a warning, never an order. The tick takes a real sell quote; sold only when confident and under entry, otherwise the time stop moves in; the stop and target never move", async () => {
  const d = db(env); await seatDesk(d, { hold: false });
  assert.deepEqual([SEAT.exitVoteRule(0.7, true), SEAT.exitVoteRule(0.7, false), SEAT.exitVoteRule(0.69, true), SEAT.exitVoteRule(0.4, false), SEAT.exitVoteRule(0.39, true)],
    [{ act: "close" }, { act: "shorten", mins: 5 }, { act: "shorten", mins: 10 }, { act: "shorten", mins: 10 }, { act: "none" }]);
  const cal = { exit_k: 0.995, sol_usd_entry: SOLUSD }, M = (s) => B58(`Exit${s}AA`);
  const open = async (sym, px, over = {}) => { const id = await openPosition(d, posRow(sym, { mint: M(sym), ...cal, ...over }), 6); assert.ok(id, sym); prices[M(sym)] = px; return id; };
  // a helper with a bad record: chatgpt's votes are worth 0.2
  await d.q(`INSERT INTO mob_aq_votes (helper, mint, vote, confidence, at, expires_at, live, counted, is_right, graded_at) SELECT 'chatgpt', 'seed' || i, 'BUY', 0.5, now() - interval '1 hour', now() - interval '55 minutes', false, true, false, now() FROM generate_series(1, 10) i`);
  const pDown = await open("XDN", 1.05), pUp = await open("XUP", 1.2), pMid = await open("XMD", 1.05), pLow = await open("XWK", 1.05), pStop = await open("XST", 0.9), pNoq = await open("XNQ", 1.05);
  const before = Object.fromEntries((await d.q(`SELECT id, stop_price, target_price, time_stop_at, tokens_raw FROM mob_aq_positions`)).map((p) => [p.id, p]));
  const cashB = (await reconcile(d)).cashSol;
  const vs = { down: (await vote("grok", M("XDN"), "EXIT", 0.8)).vote, up: (await vote("grok", M("XUP"), "EXIT", 0.9)).vote, mid: (await vote("grok", M("XMD"), "EXIT", 0.5)).vote, low: (await vote("chatgpt", M("XWK"), "EXIT", 1)).vote,
    stop: (await vote("codex", M("XST"), "EXIT", 0.9)).vote, noq: (await vote("grok", M("XNQ"), "EXIT", 0.9)).vote };
  for (const v of Object.values(vs)) assert.ok(v && v.worthPoints === 0, JSON.stringify(vs));
  assert.equal(cashB, (await reconcile(d)).cashSol, "casting an EXIT vote moves nothing"); assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_positions`)).n, 6);
  backOf[M("XNQ")] = NaN; // Jupiter gives no sell quote for this one
  const now0 = Date.now();
  let t = await tick(env, { now: now0 });
  // sold: confident (0.8) and the quote says the coin is under its entry price
  assert.deepEqual(t.exits.map((e) => [e.symbol, e.why]).sort(), [["XDN", "council exit vote (grok)"], ["XST", "stop"]]);
  const td = await d.one(`SELECT * FROM mob_aq_trades WHERE position_id=$1`, [pDown]); assert.equal(td.reason, "council exit vote (grok)"); assert.equal(td.grade, "C/loss"); assert.ok(td.pnl_pct < 0 && td.pnl_pct > -9, "sold at the live quote, well inside the stop");
  assert.ok(Math.abs(td.back_sol - (0.05 * 1.05 / 1.1 * 0.995 - 61000 / 1e9)) < 1e-6, "the fill is the real sell quote minus the network fee");
  // its own stop came first: the plan's reason stays, the warning is recorded as late
  assert.equal((await d.one(`SELECT reason FROM mob_aq_trades WHERE position_id=$1`, [pStop])).reason, "stop");
  const vrow = async (v) => d.one(`SELECT handled_at, outcome, trade_id FROM mob_aq_votes WHERE id=$1`, [v.id]);
  assert.match((await vrow(vs.down)).outcome, /^sold at the live quote: -\d/); assert.equal((await vrow(vs.down)).trade_id, td.id); assert.match((await vrow(vs.stop)).outcome, /closed on its own rule first \(stop\)/);
  // confident but above entry: not sold, five more minutes at most
  const after = Object.fromEntries((await d.q(`SELECT id, stop_price, target_price, time_stop_at, tokens_raw, seat_exit FROM mob_aq_positions`)).map((p) => [p.id, p]));
  assert.deepEqual(Object.keys(after).map(Number).sort(), [pUp, pMid, pLow, pNoq].sort());
  const ts = (p) => new Date(after[p].time_stop_at).getTime();
  assert.ok(Math.abs(ts(pUp) - (now0 + 5 * 60000)) < 1500, "5 minutes from the tick"); assert.equal(after[pUp].seat_exit, "grok"); assert.match((await vrow(vs.up)).outcome, /^time stop moved in to 5 minutes from now \(grok EXIT 0\.9 x weight 1 = 0\.9; the sell quote implies \$1\.(2|1999)\d* against \$1\.1 at entry\)/);
  // half confident, under entry: not sold, ten more minutes at most
  assert.ok(Math.abs(ts(pMid) - (now0 + 10 * 60000)) < 1500); assert.equal(after[pMid].seat_exit, "grok");
  // a helper with a bad record: 1.0 x 0.2 = 0.2, recorded only
  assert.equal(ts(pLow), new Date(before[pLow].time_stop_at).getTime()); assert.equal(after[pLow].seat_exit, null); assert.match((await vrow(vs.low)).outcome, /^recorded only .*chatgpt EXIT 1 x weight 0\.2 = 0\.2/);
  // no sell quote: nothing is decided, the warning waits for the next tick
  assert.equal((await vrow(vs.noq)).handled_at, null); assert.equal(ts(pNoq), new Date(before[pNoq].time_stop_at).getTime());
  // the stop and the target never move on a vote, on any path
  for (const p of [pUp, pMid, pLow, pNoq]) assert.deepEqual([after[p].stop_price, after[p].target_price, after[p].tokens_raw], [before[p].stop_price, before[p].target_price, before[p].tokens_raw]);
  assert.ok((t.warnings || []).length === 3, JSON.stringify(t.warnings));
  // a warning is handled once: the next tick does not act on it again, and a moved-in time stop is never moved back out
  delete backOf[M("XNQ")];
  t = await tick(env, { now: now0 + 60000 });
  assert.deepEqual(t.exits.map((e) => [e.symbol, e.why]), [["XNQ", "council exit vote (grok)"]], "the quote came back: the waiting warning was applied (0.9, under entry: sold)"); assert.match((await vrow(vs.noq)).outcome, /^sold at the live quote/);
  assert.equal(new Date((await d.one(`SELECT time_stop_at FROM mob_aq_positions WHERE id=$1`, [pUp])).time_stop_at).getTime(), ts(pUp), "XUP's warning was handled once: its time stop is not pushed again");
  // a time stop already nearer than the rule's is left alone
  const pNear = await open("XNR", 1.2, { timeStopSec: (now0 + 60000) / 1000 + 120 }); const vn = (await vote("grok", M("XNR"), "EXIT", 0.9)).vote;
  t = await tick(env, { now: now0 + 61000 }); assert.match((await vrow(vn)).outcome, /^time stop already within 5 minutes: nothing changed/); assert.equal((await d.one(`SELECT seat_exit FROM mob_aq_positions WHERE id=$1`, [pNear])).seat_exit, null);
  // the moved-in time stop arrives: the trade says whose warning ended it; the untouched one ends as a plain time stop
  t = await tick(env, { now: now0 + 6 * 60000 + 1000 });
  assert.deepEqual(t.exits.map((e) => [e.symbol, e.why]).sort(), [["XNR", "time stop"], ["XUP", "council exit vote (grok)"]]);
  const tu = await d.one(`SELECT * FROM mob_aq_trades WHERE position_id=$1`, [pUp]); assert.equal(tu.reason, "council exit vote (grok)"); assert.equal(tu.grade, "B/win");
  assert.match((await d.one(`SELECT text FROM mob_aq_brain WHERE kind='lesson' AND text LIKE 'XUP %' ORDER BY id DESC LIMIT 1`)).text, /council exit vote \(grok\) at .* the time stop a helper's exit warning moved in/);
  // trades a warning cut short are not a sample of the randomised arms; plan exits still are
  const sR3 = (await S()).strategies.find((x) => x.id === "R3"), cutA = (await d.one(`SELECT count(*)::int n FROM mob_aq_trades WHERE strategy='R3' AND variant='A' AND reason LIKE 'council exit vote%'`)).n, allA = (await d.one(`SELECT count(*)::int n FROM mob_aq_trades WHERE strategy='R3' AND variant='A'`)).n;
  assert.ok(cutA >= 3); assert.equal(sR3.variants.find((x) => x.id === "A").n, allA - cutA);
  // an expired warning does nothing
  const ve = (await vote("grok", M("XMD"), "EXIT", 1)).vote; await d.q(`UPDATE mob_aq_votes SET expires_at = now() - interval '1 second' WHERE id=$1`, [ve.id]);
  t = await tick(env, { now: now0 + 6 * 60000 + 2000 }); assert.deepEqual(t.exits, []); assert.equal((await vrow(ve)).handled_at, null);
  const rc = await reconcile(d); assert.equal(rc.ok, true, JSON.stringify(rc)); assert.equal((await perPosition(d)).length, 0);
  backOf = {}; await d.q(`DELETE FROM mob_aq_votes`); await cleanBook(d);
});

test("fast alerts: never trusted. A real sell quote decides; confirmed = the position's own stop or target, closed once even against overlapping ticks; the ledger reconciles", async () => {
  const d = db(env); await seatDesk(d, { hold: false });
  const cal = { exit_k: 0.995, sol_usd_entry: SOLUSD }, M = (s) => B58(`Ping${s}AA`);
  const open = async (sym, px, over = {}) => { const id = await openPosition(d, posRow(sym, { mint: M(sym), ...cal, ...over }), 6); assert.ok(id, sym); prices[M(sym)] = px; return id; };
  const pBetween = await open("ABTW", 1.05), pStop = await open("ASTP", 0.9), pTarget = await open("ATGT", 2.1), pLegacy = await open("ALEG", 0.9, { exit_k: null, sol_usd_entry: null }), pRace = await open("ARACE", 0.9);
  const cash0 = (await reconcile(d)).cashSol, trades0 = (await d.one(`SELECT coalesce(max(id),0)::int n FROM mob_aq_trades`)).n;
  const alert = (helper, sym, kind, price, note) => SEAT.fastAlert(env, helper, { mint: sym.length > 30 ? sym : M(sym), kind, price, note });
  for (const [args, re] of [[{ mint: "x" }, /mint must be/], [{ kind: "sell" }, /kind must be stop, target or narrative_dead/], [{ price: -1 }, /price must be/]]) assert.match((await SEAT.fastAlert(env, "grok", { mint: M("ABTW"), kind: "stop", price: 1, ...args })).error, re);
  assert.match((await SEAT.fastAlert(env, "alex", { mint: M("ABTW"), kind: "stop" })).error, /helper must be one of/);
  // not confirmed: no position; the quote is between the levels (whatever price the helper claims); no calibration
  assert.equal((await alert("grok", B58("PingNoneAA"), "stop", 0.5)).alert.result, "alert not confirmed: no open position in this coin");
  const quotes0 = calls.filter((c) => c.url.includes("/swap/v1/quote")).length;
  let a = (await alert("grok", "ABTW", "stop", 0.5, "it is crashing!")).alert;
  assert.equal(a.confirmed, false); assert.match(a.result, /^alert not confirmed: the sell quote implies \$1\.0\d+, between the stop \$1 and the target \$2$/);
  assert.ok(Math.abs(a.quotedUsd - 1.05) < 1e-6 && a.claimedUsd === 0.5); assert.equal(calls.filter((c) => c.url.includes("/swap/v1/quote")).length - quotes0, 1, "one real sell quote was taken");
  a = (await alert("grok", "ABTW", "narrative_dead", null, "dev sold")).alert; assert.equal(a.confirmed, false); assert.match(a.result, /a dying story is an EXIT vote \(aq_council_vote\), not an alert$/);
  a = (await alert("grok", "ALEG", "stop", 0.9)).alert; assert.match(a.result, /no entry calibration; the minute tick manages it/);
  // the test identity: the check runs, nothing is closed even though the stop is met
  a = (await mcpJson("aq_alert", { helper: "claude-test", mint: M("ASTP"), kind: "stop", price: 0.9 })); assert.equal(a.confirmed, false); assert.match(a.result, /test identity, nothing is closed \(the stop rule is met at the quote\)/); assert.equal(a.wouldClose, "stop");
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_positions`)).n, 5); assert.equal((await reconcile(d)).cashSol, cash0, "no unconfirmed alert moved cash");
  assert.equal((await d.one(`SELECT coalesce(max(id),0)::int n FROM mob_aq_trades`)).n, trades0);
  // confirmed target, through the link: closed at the real quote, between ticks, the position's own rule
  a = await mcpJson("aq_alert", { helper: "grok", mint: M("ATGT"), kind: "target", price: 2.1 });
  assert.equal(a.confirmed, true); assert.equal(a.result, "target confirmed after grok alert"); assert.ok(a.pnlPct > 80);
  let tr = await d.one(`SELECT * FROM mob_aq_trades WHERE position_id=$1`, [pTarget]); assert.equal(tr.reason, "target confirmed after grok alert"); assert.equal(tr.grade, "A/win");
  assert.ok(Math.abs(tr.back_sol - (0.05 * 2.1 / 1.1 * 0.995 - 61000 / 1e9)) < 1e-6, "filled at the quote, not at the helper's price");
  // the kind the helper names does not matter, the rule that is met does: a "target" alert on a coin under its stop is a confirmed stop
  a = (await alert("chatgpt", "ASTP", "target", 5)).alert; assert.equal(a.result, "stop confirmed after chatgpt alert"); assert.equal((await d.one(`SELECT reason FROM mob_aq_trades WHERE position_id=$1`, [pStop])).reason, "stop confirmed after chatgpt alert");
  a = (await alert("chatgpt", "ASTP", "stop", 0.9)).alert; assert.equal(a.result, "alert not confirmed: no open position in this coin", "already closed");
  assert.match((await d.one(`SELECT text FROM mob_aq_brain WHERE kind='lesson' AND text LIKE 'ASTP %' ORDER BY id DESC LIMIT 1`)).text, /stop confirmed after chatgpt alert at -\d.* between minute ticks/);
  let rc = await reconcile(d); assert.equal(rc.ok, true, JSON.stringify(rc));
  // stricter than the tick on purpose: the cost of selling alone never confirms a stop. At $1.005 a sale would lose more than the 9% stop distance, but the quote-implied price is still above the stop
  prices[M("ABTW")] = 1.005; a = (await alert("chatgpt", "ABTW", "stop", 0.99)).alert; assert.equal(a.confirmed, false); assert.ok(a.netPctIfSold < -9 && a.quotedUsd > 1, JSON.stringify(a)); prices[M("ABTW")] = 1.05;
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_positions WHERE id=$1`, [pBetween])).n, 1);
  // the race: three helpers alert and two ticks run at the same moment on a position under its stop -> exactly one close
  const race = await Promise.all([alert("grok", "ARACE", "stop", 0.9), alert("chatgpt", "ARACE", "stop", 0.9), alert("codex", "ARACE", "stop", 0.9), tick(env), tick(env)]);
  const closes = await d.q(`SELECT reason, pnl_sol FROM mob_aq_trades WHERE position_id=$1`, [pRace]);
  assert.equal(closes.length, 1, JSON.stringify(race.slice(0, 3))); assert.match(closes[0].reason, /^stop( confirmed after (grok|chatgpt|codex) alert)?$/);
  const won = race.slice(0, 3).filter((x) => x.alert.confirmed); assert.ok(won.length <= 1); assert.equal(won.length === 1, /alert/.test(closes[0].reason));
  for (const x of race.slice(0, 3)) if (!x.alert.confirmed) assert.match(x.alert.result, /^alert not confirmed: (the position was already closed by another request|no open position in this coin)$/);
  assert.equal((await perPosition(d)).length, 0); rc = await reconcile(d); assert.equal(rc.ok, true, JSON.stringify(rc));
  const all = await d.q(`SELECT back_sol FROM mob_aq_trades WHERE id > $1`, [trades0]);
  assert.equal(all.length, 4, "target, stop, the raced stop, and the uncalibrated one the tick closed on its own stop"); assert.equal((await d.one(`SELECT reason FROM mob_aq_trades WHERE position_id=$1`, [pLegacy])).reason, "stop");
  assert.ok(Math.abs(rc.cashSol - (cash0 + all.reduce((s2, x) => s2 + x.back_sol, 0))) < 1e-9, "cash rose by exactly what the closed positions paid back (quote minus fee), once each");
  // the state shows the last alerts, confirmed or not
  const s = await S(); assert.ok(s.alerts.length >= 8 && s.alerts.length <= 20); assert.ok(s.alerts.some((x) => x.confirmed && x.result === "target confirmed after grok alert" && x.tradeId === tr.id) && s.alerts.some((x) => !x.confirmed && x.note === "it is crashing!")); assert.equal(s.ledger.ok, true);
  // rate limit per helper
  let last = null; for (let i = 0; i < 8 && !last?.error; i++) last = await alert("codex", "ABTW", "stop", 1);
  assert.match(last.error, /rate limit: 6 alerts a minute/); assert.ok((await alert("chatgpt", "ABTW", "stop", 1)).alert, "the limit is per helper");
  // a destroyed island: alerts close nothing
  await d.q(`UPDATE mob_aq_state SET v='true' WHERE k='destroyed'`); await d.q(`DELETE FROM mob_aq_alerts`); prices[M("ABTW")] = 0.9;
  a = (await alert("grok", "ABTW", "stop", 0.9)).alert; assert.match(a.result, /island is destroyed/); assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_positions WHERE id=$1`, [pBetween])).n, 1);
  await d.q(`DELETE FROM mob_aq_alerts`); await cleanBook(d);
});

test("war room: who speaks comes from how the caller signed in; limits, addressing, unread counts, the briefing's last lines", async () => {
  const d = db(env); await d.q(`DELETE FROM mob_aq_chat`); await d.q(`DELETE FROM mob_aq_state WHERE k='chat_read'`);
  const post = (opts, b) => R("POST", "/api/aq/chat", { body: b, ...opts });
  // no sign-in, a wrong code
  assert.equal((await post({}, { text: "hi" })).status, 401); assert.equal((await post({ headers: { "x-aq-helper-key": "wrong" } }, { helper: "claude", text: "hi" })).status, 401);
  assert.equal((await post({ bearer: "nope" }, { text: "hi" })).status, 401); assert.equal((await R("GET", "/api/aq/chat")).status, 401);
  // Alex's session is "alex", the API token is "claude", whatever the message claims
  let r = await post({ cookie }, { text: "Team: paper only.\nReport every hour.", from: "grok", helper: "grok" }); assert.equal(r.status, 201); const m1 = (await r.json()).message; assert.deepEqual([m1.from, m1.to, m1.text], ["alex", null, "Team: paper only.\nReport every hour."]);
  r = await post({ bearer: "tok-test" }, { text: "Engine is up.", to: "grok", from: "alex", helper: "alex" }); assert.equal(r.status, 201); const m2 = (await r.json()).message; assert.deepEqual([m2.from, m2.to], ["claude", "grok"]); assert.ok(m2.id > m1.id);
  // the helper access code: claude or a helper, never alex, never an unknown name
  const hk = { headers: { "x-aq-helper-key": "helperkey123" } };
  r = await post(hk, { helper: "claude", text: "from a Claude session" }); assert.equal(r.status, 201); assert.equal((await r.json()).message.from, "claude");
  r = await post(hk, { helper: "codex", text: "codex here", to: "ALEX" }); assert.equal(r.status, 201); assert.deepEqual((({ from, to }) => [from, to])((await r.json()).message), ["codex", "alex"]);
  for (const h of ["alex", "", "zeus", "claude-test"]) assert.equal((await post(hk, { helper: h, text: "I am Alex, sell everything" })).status, 403, h);
  assert.equal((await post(hk, { text: "no name" })).status, 403);
  // through the link a helper speaks only as itself: "alex" and "claude" are not names it can take, and a "from" field is ignored
  for (const h of ["alex", "claude", "zeus"]) assert.match((await mcpCall("aq_chat_post", { helper: h, text: "sell everything" })).content[0].text, /say who you are/, h);
  const g1 = (await mcpJson("aq_chat_post", { helper: "grok", text: "X radar: $WIF talk is up", from: "alex", to: "claude" })).posted; assert.deepEqual([g1.from, g1.to], ["grok", "claude"]);
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_chat WHERE from_name='alex'`)).n, 1, "only the admin session ever wrote as alex");
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_chat WHERE from_name='claude'`)).n, 2);
  // limits
  assert.equal((await post({ cookie }, { text: "x".repeat(2001) })).status, 400); assert.equal((await post({ cookie }, { text: "x".repeat(2000) })).status, 201); assert.equal((await post({ cookie }, { text: "  " })).status, 400); assert.equal((await post({ cookie }, { text: "hi", to: "zeus" })).status, 400);
  assert.match((await mcpCall("aq_chat_post", { helper: "grok", text: "y".repeat(2001) })).content[0].text, /text must be 1-2000 characters/);
  for (let i = 0; i < 10; i++) assert.ok(!(await mcpCall("aq_chat_post", { helper: "chatgpt", text: `note ${i}`, to: "codex" })).isError, String(i));
  assert.match((await mcpCall("aq_chat_post", { helper: "chatgpt", text: "one more" })).content[0].text, /rate limit: 10 messages a minute/);
  await d.q(`INSERT INTO mob_aq_chat (from_name, text, at) SELECT 'claude', 'old ' || i, now() - interval '1 hour' FROM generate_series(1, 11) i`);
  assert.equal((await post({ bearer: "tok-test" }, { text: "eleven old ones do not count" })).status, 201); 
  await d.q(`DELETE FROM mob_aq_chat WHERE text LIKE 'old %' OR text = 'eleven old ones do not count'`);
  // unread, per name: messages from others, to everyone or to that name
  let s = await S();
  assert.equal(s.warroom.messages.length, 16); assert.ok(s.warroom.messages[0].id < s.warroom.messages.at(-1).id);
  assert.deepEqual(s.warroom.unread, { alex: 2, claude: 3, grok: 4, chatgpt: 3, codex: 13 }, JSON.stringify(s.warroom.unread));
  // reading marks read, for the reader only; `since` pages; the mark never moves back
  let rd = await mcpJson("aq_chat_read", { helper: "grok" }); assert.equal(rd.messages.length, 16); assert.equal(rd.unread, 0); assert.deepEqual(rd.messages[0], { id: m1.id, at: rd.messages[0].at, from: "alex", to: null, text: "Team: paper only.\nReport every hour." });
  rd = await mcpJson("aq_chat_read", { helper: "grok", since: rd.lastId }); assert.deepEqual(rd.messages, []);
  s = await S(); assert.equal(s.warroom.unread.grok, 0); assert.equal(s.warroom.unread.alex, 2); assert.equal(s.warroom.lastRead.grok, s.warroom.messages.at(-1).id);
  assert.equal((await post({ cookie }, { text: "Grok: what is hot?", to: "grok" })).status, 201);
  rd = await mcpJson("aq_chat_read", { helper: "grok", since: m2.id }); assert.equal(rd.messages.at(-1).text, "Grok: what is hot?"); assert.equal(rd.messages[0].id > m2.id, true);
  await mcpJson("aq_chat_read", { helper: "grok", since: 0 }); assert.equal((await S()).warroom.unread.grok, 0);
  r = await R("GET", "/api/aq/chat?since=0", { cookie }); let j = await r.json(); assert.equal(j.as, "alex"); assert.equal(j.unread, 2, "a plain GET does not mark read");
  r = await R("POST", "/api/aq/chat/read", { cookie }); j = await r.json(); assert.equal(j.unread, 0); assert.equal((await S()).warroom.unread.alex, 0);
  r = await R("GET", "/api/aq/chat?helper=claude&mark=1", hk); j = await r.json(); assert.equal(j.as, "claude"); assert.equal((await S()).warroom.unread.claude, 0);
  assert.equal((await R("GET", "/api/aq/chat?helper=alex", hk)).status, 403);
  // the state keeps the last 30
  await d.q(`INSERT INTO mob_aq_chat (from_name, text) SELECT 'claude', 'fill ' || i FROM generate_series(1, 20) i`);
  s = await S(); assert.equal(s.warroom.messages.length, 30); assert.equal(s.warroom.messages.at(-1).text, "fill 20");
  await d.q(`DELETE FROM mob_aq_chat WHERE text LIKE 'fill %'`);
  // the briefing ends with the last five messages to the caller (to it, or to everyone), oldest first
  const bf = (await mcpCall("aq_briefing", { helper: "grok" })).content[0].text.split("\n"), at = bf.findIndex((l) => l === "- War room, last messages to grok: ");
  assert.ok(at > 0, bf.join("\n")); assert.equal(bf.length - at - 1, 5); assert.match(bf.at(-1), /^  \[\d\d:\d\dZ\] alex to grok: Grok: what is hot\?$/); assert.ok(bf.slice(at + 1).every((l) => !/ grok to /.test(l) && !/ to codex: /.test(l)));
  assert.match(bf[at + 1], /alex to all: Team: paper only\. Report every hour\.$/);
  assert.ok(!(await (await R("GET", "/api/aq/briefing", { bearer: "tok-test" })).text()).includes("War room"), "the plain briefing has no caller");
  await d.q(`DELETE FROM mob_aq_chat`); assert.match((await mcpCall("aq_briefing", { helper: "codex" })).content[0].text, /- War room, last messages to codex: none$/);
});

test("nothing a helper can call changes cash, the limits, the strategies, the rules or the kill switch", async () => {
  const d = db(env); await seatDesk(d);
  const CS = B58("NoMoneyCaseAA"), HM = B58("NoMoneyKeptAA");
  await d.q(`INSERT INTO mob_aq_council (verdict, symbol, mint, reason, facts) VALUES ('BLOCK','NMC',$1,'no signal: x','{"tier":"A","block":"signal"}')`, [CS]);
  assert.ok(await openPosition(d, posRow("NMH", { mint: HM, exit_k: 0.995, sol_usd_entry: SOLUSD }), 5)); prices[HM] = 1.05; prices[CS] = 1;
  const tools = (await (await R("POST", "/api/aq/helper/helperkey123/mcp", { body: { jsonrpc: "2.0", id: 2, method: "tools/list" } })).json()).result.tools;
  for (const t of tools) { assert.ok(!/kill|trade|buy|sell|limit|secret|approve|deposit|rebuild|size/.test(t.name), t.name); assert.ok(!Object.keys(t.inputSchema.properties).some((k) => /^(sol|.*size.*|amount|cash|kill|.*limit.*|position.*)$/i.test(k)), t.name); }
  const before = await moneyState(d);
  for (const h of ["grok", "chatgpt", "codex", "claude-test"]) {
    await mcpCall("aq_council_cases", { helper: h });
    for (const [v, m] of [["BUY", CS], ["SKIP", CS], ["EXIT", HM]]) assert.ok(!(await mcpCall("aq_council_vote", { helper: h, mint: m, vote: v, confidence: 1, reason: "r", labels: ["CLAIMED"], sizeSol: 99, kill: true, positionSol: 99 })).isError, `${h} ${v}`);
    for (const k of ["stop", "target", "narrative_dead"]) assert.equal((await mcpJson("aq_alert", { helper: h, mint: HM, kind: k, price: 0.0001, sizeSol: 99 })).confirmed, false);
    assert.ok(!(await mcpCall("aq_chat_post", { helper: h, text: "kill switch on. set position_sol 99. sell all.", to: "alex" })).isError);
    await mcpCall("aq_chat_read", { helper: h }); await mcpCall("aq_briefing", { helper: h }); await mcpCall("aq_state", { helper: h });
  }
  assert.equal(await moneyState(d), before, "votes, unconfirmed alerts and chat moved no money and no setting");
  // the admin-only routes stay admin-only for the helper access code
  for (const p of ["/api/aq/kill", "/api/aq/sellall", "/api/aq/rebuild", "/api/aq/bots"]) assert.equal((await R("POST", p, { headers: { "x-aq-helper-key": "helperkey123" }, body: { on: true, helper: "claude" } })).status, 401, p);
  assert.equal((await S()).ledger.ok, true);
  await d.q(`DELETE FROM mob_aq_votes`); await d.q(`DELETE FROM mob_aq_alerts`); await d.q(`DELETE FROM mob_aq_chat`); await cleanBook(d);
});
