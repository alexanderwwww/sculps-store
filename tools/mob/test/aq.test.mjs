// Aquarius engine: drives the whole paper loop against stubbed copies of real API responses (test/aq-fixtures.mjs).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { makeEnv, dropEnv, reqOf, login, mock, resetMocks, res, calls } from "./helpers.mjs";
import { db } from "../src/db.mjs";
import { FX, FX2, FX3, FX5, FX6 } from "./aq-fixtures.mjs";
import { whaleSignal, refreshWinners, mineTick } from "../src/aq/whales.mjs";
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
  for (const w of [W1, W2, DEV]) for (const m of ["m1", "m2", "m3"])
    await d.q(`INSERT INTO mob_aq_wtrades (tx, wallet, mint, kind, sol, at) VALUES ($1,$2,$3,'buy',1,now()),($1,$2,$3,'sell',$4,now())`, [`${w}${m}`, w, m, m === "m3" ? 0.5 : 2]);
  // a bot: profitable on two coins but with hundreds of swaps per coin
  for (const m of ["m1", "m2"]) await d.q(`INSERT INTO mob_aq_wtrades (tx, wallet, mint, kind, sol, at) SELECT 'bot' || $2 || i, $1, $2, CASE WHEN i % 2 = 0 THEN 'buy' ELSE 'sell' END, CASE WHEN i % 2 = 0 THEN 1 ELSE 1.1 END, now() FROM generate_series(1, 200) i`, [BOT, m]);
  const book = await refreshWinners(d);
  assert.equal(book.winners, 3, "W1, W2 and the dev win on 2 of 3 coins; the bot is not a winner");
  assert.equal((await d.one(`SELECT winner FROM mob_aq_whales WHERE wallet=$1`, [BOT])).winner, false);
  tradesFor[MW] = () => ({ txs: [W1, W2, DEV, BOT].map((w, i) => jtx(w, "buy", 1, MW, i)).concat([{ ...jtx("Mev555", "buy", 5, MW), isMev: true }]), next: null });
  resetCalls();
  let w = await whaleSignal(env, { mint: MW, symbol: "WH", priceUsd: 1 }, { creator: DEV, insiders: [] }, () => {});
  assert.equal(w.signal, true); assert.equal(w.independent, 2); assert.equal(w.excluded, 1); assert.match(w.funders, /unchecked \(no HELIUS_API_KEY\)/);
  assert.equal((await d.one(`SELECT independent FROM mob_aq_signals WHERE mint=$1`, [MW])).independent, 2, "every signal is logged");
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
  assert.deepEqual(tools, ["aq_state", "aq_briefing", "aq_post_evidence", "aq_propose_bot", "aq_submit_pick", "aq_list_tasks", "aq_task_done"]);
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
  // a dead market: 6x the cheapest round trip measured in the tier does not fit inside 3x the coin's ATR5 -> not tradable, no quote spent, and one verdict says so with the numbers
  await d.q(`UPDATE mob_aq_trades SET opened_at = now() - interval '10 minutes'`); await d.q(`DELETE FROM mob_aq_market WHERE k='jup:top'`);
  jupLists = () => ({ pools: [mk("DEAD", DD)] }); jupCharts[DD] = () => asJup(dead);
  const quotes0 = calls.filter((c) => c.url.includes("/swap/v1/quote")).length;
  t = await tick(env);
  assert.equal(t.entered, null); assert.ok(t.quiet && t.quiet.coins === 1 && t.quiet.best === "DEAD" && t.quiet.have < t.quiet.needed, JSON.stringify([t.quiet, t.evaluated]));
  const dv = t.evaluated.find((e) => e.symbol === "DEAD"); assert.equal(dv.kind, "untradable"); assert.match(dv.reason, /^not tradable: 6x round trip [\d.]+% = [\d.]+% is over 3x ATR5 [\d.]+% = [\d.]+% \(cheapest tier A quote of \d+ \(24h\)\)$/);
  s = await S(); assert.match(s.council.recent.find((v) => v.symbol == null).reason, /^market too quiet: 1 coin\(s\) cannot pay 6x their round trip; best DEAD has [\d.]+% of room against [\d.]+% needed$/);
  // not tradable = the shadow lane, and it is not judged again every tick: volatility does not change in 3 minutes
  const shd = await d.one(`SELECT * FROM mob_aq_shadow WHERE symbol='DEAD'`); assert.ok(shd && shd.v === 2 && /^not tradable/.test(shd.block_reason), JSON.stringify(t.shadow)); assert.ok(shd.cost_pct > 0);
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
  assert.deepEqual([ps.sizing.positionSol, ps.sizing.limitedBy, ps.sizing.sizeSol], [2.6, null, 2.6]); assert.ok(ps.rt_pct > 0.2 && ps.rt_pct < 0.22, `fee share is tiny at this size: ${ps.rt_pct}`); assert.ok(ps.sizing.lossAtStopPctOfEquity > 0.5);
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
