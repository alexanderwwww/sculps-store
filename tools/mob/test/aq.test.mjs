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
before(async () => { env = await makeEnv({ AQ_JUP_GAP_MS: "0", AQUARIUS_KEY: "aqkey", AQ_HELPER_KEY: "helperkey123" }); _resetSeeded(); R = reqOf(env); cookie = await login(env); });
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
  mock("GET", "https://lite-api.jup.ag/swap/v1/quote", (rec, u) => {
    const q = clone(u.searchParams.get("inputMint") === SOL ? FX.jupBuy : FX.jupSell), amt = Number(u.searchParams.get("amount"));
    if (u.searchParams.get("inputMint") === SOL) { q.inAmount = String(amt); q.outAmount = String(Math.floor(amt * 1000)); return q; } // 1000 raw units per lamport
    const mint = u.searchParams.get("inputMint"), back = backOf[mint] ?? (mint === MINT.C ? 0.9 : 0.995);  // C loses 10% round trip
    const px = sellOut[mint] != null ? sellOut[mint] / back : prices[mint] != null ? prices[mint] / 1.1 : 1; q.inAmount = String(amt); q.outAmount = String(Math.floor((amt / 1000) * back * px)); return q;
  });
}
const S = async () => (await R("GET", "/api/aq/state", { bearer: "tok-test" })).json();
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
  assert.ok(t1.entered && t1.entered.sizeSol <= 0.05 && t1.entered.rtPct > 0);
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
      VALUES ('R3',$1,'x',$2,6,'50000000000',0.05,0.0001,1.1,1.03,1.2,6,9,1.4,${ts})`, [mint, sym]);
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
  assert.ok(sh, "the COST near miss got a SHADOW probe"); assert.equal(sh.block_reason, "cost gate"); assert.equal(sh.cost_source, "measured"); assert.ok(sh.cost_pct > 9);
  const realBefore = (await d.one(`SELECT count(*)::int n FROM mob_aq_trades`)).n;
  prices[MINT.C] = sh.target_price * 1.01;
  const t = await tick(env);
  assert.ok(t.shadow.closed.some((x) => x.symbol === "COST" && x.why === "target"));
  const s = await S();
  assert.equal(s.shadow.tag, "SHADOW"); assert.ok(s.shadow.n >= 1); assert.ok(s.shadow.expectancyPct < 0, "target 9% minus a 10% round trip still loses");
  assert.ok(s.shadow.byReason.some((x) => x.reason === "cost gate"));
  assert.ok(s.brain.some((b) => /SHADOW COST: blocked for "cost gate".*The block was RIGHT/.test(b.text)));
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
  // PAPER never halts on a losing streak: it enters smaller (x0.75 after 3 losses) and asks for 10 more score points
  const t2 = await tick(env);
  assert.ok(t2.entered && t2.entered.symbol === "FRESH", JSON.stringify(t2.evaluated)); assert.ok(t2.entered.sizeSol <= 0.05 * 0.85 * 0.75 + 1e-9, String(t2.entered.sizeSol));
  s = await S(); assert.ok(!s.council.vetoes.some((v) => /loss-streak/.test(v.reason)));
  assert.match(s.departments.find((x) => x.id === "risk").workers.find((w) => w.job === "Loss-streak throttle").note, /3 losses in a row: size x0\.75, score \+10 \(paper never halts\)/);
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
  assert.ok(s.rules.every((r) => typeof r.weight === "number" && r.blockedWinners >= 0 && r.blockedLosers >= 0)); assert.ok(s.council_rules.hard.length === 8 && typeof s.tradesLastHour === "number");
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
    VALUES ('R3','SELLmint','x','SELL',6,'50000000000',0.05,0.0001,1.1,1,2,now() + interval '1 hour',1.1)`);
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
  mock("GET", "https://lite-api.jup.ag/swap/v1/quote", (rec, u) => {
    const q = clone(u.searchParams.get("inputMint") === SOL ? FX.jupBuy : FX.jupSell), amt = Number(u.searchParams.get("amount"));
    q.inAmount = String(amt); q.outAmount = String(u.searchParams.get("inputMint") === SOL ? Math.floor(amt * 1000) : Math.floor((amt / 1000) * 0.995)); return q;
  });
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
  jupLists = () => ({ pools: clone(pools) });
  const chart = clone(FX6.jupChart), shift = Math.floor(Date.now() / 60000) * 60 - chart.candles.at(-1).time;
  for (const c of chart.candles) c.time += shift;
  jupCharts[FART] = () => clone(chart);
  // two winners from the book (seeded in the whale test) buy Fartcoin now; swaps page 1 then page 2
  let pagesAsked = [];
  tradesFor[FART] = (u) => { pagesAsked.push(u.searchParams.get("offset")); return u.searchParams.get("offset") ? { txs: [jtx("OldBuyer", "buy", 2, FART, 9, new Date(Date.now() - 3600000))], next: null } : { txs: [jtx("WhaleOne111", "buy", 3, FART, 1), jtx("WhaleTwo222", "buy", 2, FART, 2)], next: FX6.jupTxs1.next }; };
  const t = await tick(env);
  assert.ok((await d.one(`SELECT 1 FROM mob_aq_brain WHERE text LIKE 'R5 whale follow activated on PAPER%'`)), "activation recorded");
  assert.equal(t.funnel.seen >= 3, true); assert.ok(t.funnel.tradable >= 1 && t.funnel.tradable < t.funnel.seen, JSON.stringify([t.funnel, t.evaluated])); assert.equal(t.funnel.judged, t.funnel.tradable);
  assert.deepEqual([t.evaluated[0].symbol, t.evaluated[0].verdict, t.evaluated[0].tier, t.evaluated[0].tag], ["Fartcoin", "PASS", "A", "PASS"], JSON.stringify(t.evaluated));
  assert.ok(!t.evaluated.some((e) => e.symbol === "ACT" || e.symbol === "NEIL" || e.symbol === "SPCX"), "dead, illiquid and stock coins never reach the Council");
  const cn = await d.one(`SELECT strategy, reason, facts FROM mob_aq_council WHERE symbol='Fartcoin'`);
  assert.equal(cn.strategy, "R5"); assert.match(cn.reason, /^R5 whale signal, stop under the recent swing low; hard blocks clear; score/); assert.equal(cn.facts.tier, "A");
  assert.equal(cn.facts.candles.src, "jupiter"); assert.equal(cn.facts.candles.bars, 60, "history on first sight, no warm-up");
  assert.equal(cn.facts.whale.independent, 2); assert.ok(cn.facts.setup.stopPct >= 4 && cn.facts.setup.stopPct <= 12); assert.equal(cn.facts.setup.targetPct, Math.round(cn.facts.setup.stopPct * 2.5 * 1000) / 1000);
  const p = await d.one(`SELECT * FROM mob_aq_positions`); assert.equal(p.strategy, "R5"); assert.ok(p.size_sol <= 0.05);
  assert.equal((await d.one(`SELECT verdict FROM mob_aq_signals WHERE mint=$1`, [FART])).verdict, "PASS");
  // mining: the same tick walked the coin's swaps back with the cursor (offset + offsetTs) and finished it
  const m = await d.one(`SELECT * FROM mob_aq_mined WHERE mint=$1`, [FART]);
  assert.equal(m.pages, 2); assert.equal(m.done, true); assert.ok(pagesAsked.includes(String(FX6.jupTxs1.next)));
  assert.ok(await d.one(`SELECT 1 FROM mob_aq_wtrades WHERE wallet='OldBuyer' AND mint=$1`, [FART]));
  const s = await S();
  assert.ok(s.whales.winners >= 2 && s.whales.book >= s.whales.winners); assert.equal(s.whales.signals[0].symbol, "Fartcoin"); assert.equal(s.whales.mining.done, 1);
  assert.ok(s.health.budget.jupiterDataCalls > 0 && s.health.budget.jupiterDataCalls <= s.health.budget.jupiterDataCap); assert.equal(s.health.budget.heliusCalls, 0);
  assert.ok(s.funnel.tradable >= 1); assert.ok(s.market.trending.some((x) => x.symbol === "Fartcoin"));
  assert.equal(s.strategies.find((x) => x.id === "R5").status, "paper");
  assert.equal(s.departments.find((x) => x.id === "whales").live, true);
  assert.ok(s.brain.some((b) => /^R5 paper entry Fartcoin: 2 independent winners/.test(b.text)));
  // no bars at all: the fixed structure (8% stop, 20% target), stop never larger than target
  const { whaleSetup } = await import("../src/aq/logic.mjs"); const { R5_PARAMS } = await import("../src/aq/seed.mjs");
  const fx = whaleSetup([], R5_PARAMS, Date.now() / 1000, 2); assert.deepEqual([fx.signal, fx.stopPct, fx.targetPct, fx.structure], [true, 8, 20, "fixed"]);
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
  stubAll(); trendingPools = []; prices = {}; tradesFor = {};
  const mk = (sym, mint, liq, days) => { const p = clone(FX6.jupTop.pools.find((q) => q.baseAsset.symbol === "Fartcoin")); Object.assign(p.baseAsset, { id: mint, symbol: sym, liquidity: liq, firstPool: { id: "x", createdAt: iso(days) } }); p.id = `pool-${sym}`; return p; };
  const asJup = (cs) => ({ candles: cs.map((c2) => ({ time: c2.t, open: c2.o, high: c2.h, low: c2.l, close: c2.c, volume: 1 })) });
  const MOM = "MomentumAAAA1111111111111111111111111111111", BNC = "BounceAAAAA11111111111111111111111111111111", NEW = "NewLaunchCC11111111111111111111111111111111";
  backOf = { [MOM]: 0.998, [BNC]: 0.998 }; // liquid tier A coins: 0.2% pool cost, like the 0.09-0.25% measured live
  jupLists = () => ({ pools: [mk("MOMO", MOM, 900000, 40), mk("BNCE", BNC, 800000, 40), mk("NEWC", NEW, 60000, 0.5)] });
  jupCharts[MOM] = () => asJup([...flat, BRK]); jupCharts[BNC] = () => asJup([...slide, BNC_BAR]); jupCharts[NEW] = () => asJup([...flat, BRK]);
  let t = await tick(env);
  assert.equal(t.entered?.strategy, "R6", JSON.stringify([t.evaluated, t.funnel, t.survival])); assert.equal(t.entered.tier, "A"); assert.equal(t.entered.tag, "PASS"); assert.ok(t.entered.targetPct >= 3 && t.entered.targetPct <= 12, String(t.entered.targetPct));
  assert.equal(t.evaluated.find((e) => e.symbol === "BNCE").verdict, "WAIT");
  // tier C never gets R6/R7; its fib has no pullback -> a "signal" block, not a trade
  const nw = t.evaluated.find((e) => e.symbol === "NEWC"); assert.equal(nw.tier, "C"); assert.equal(nw.kind, "signal"); assert.match(nw.reason, /^no signal: R3 /);
  t = await tick(env);
  assert.equal(t.entered.strategy, "R7", JSON.stringify(t.evaluated)); assert.equal(t.entered.tier, "A");
  let s = await S(); assert.equal(s.positions.length, 2); assert.deepEqual(s.positions.map((p) => p.tier), ["A", "A"]); assert.equal(s.tradesLastHour, 2);
  // explore cadence: a coin whose soft rules sink the score is refused while an entry is fresh, and taken as EXPLORE after 3 minutes
  const SOFT = "SoftCoinBB111111111111111111111111111111111";
  backOf[SOFT] = 0.998;
  jupLists = () => ({ pools: [mk("SOFT", SOFT, 150000, 3)] }); jupCharts[SOFT] = () => asJup([...flat, BRK]);
  rugFor[SOFT] = () => { const r = safeRug(); r.risks = [{ name: "Low Liquidity", level: "danger" }, { name: "x", level: "danger" }]; r.topHolders = r.topHolders.map((h) => ({ ...h, pct: h.pct * 8 })); return r; };
  await d.q(`UPDATE mob_aq_rules SET weight = 1.5 WHERE name IN ('danger_risk','top10','top_holder')`);
  await d.q(`DELETE FROM mob_aq_market WHERE k LIKE 'rug:%' OR k = 'jup:top'`);
  t = await tick(env);
  const sb = t.evaluated.find((e) => e.symbol === "SOFT"); assert.equal(sb.verdict, "BLOCK", JSON.stringify(t.evaluated)); assert.equal(sb.kind, "soft"); assert.match(sb.reason, /next explore in/);
  await d.q(`UPDATE mob_aq_positions SET opened_at = now() - interval '4 minutes'`); await d.q(`DELETE FROM mob_aq_council WHERE symbol='SOFT'`);
  t = await tick(env);
  assert.equal(t.entered?.symbol, "SOFT", JSON.stringify(t.evaluated)); assert.equal(t.entered.tag, "EXPLORE"); assert.equal(t.entered.tier, "B");
  const sp = await d.one(`SELECT * FROM mob_aq_positions WHERE symbol='SOFT'`);
  assert.ok(sp.soft.includes("danger_risk") && sp.soft.includes("top10")); assert.ok(sp.size_sol <= 0.05 * 0.85 + 1e-9);
  // learning: SOFT hits its target -> the rules that objected blocked a winner and lose weight; MOMO stops out -> its rules gain
  const w0 = Object.fromEntries((await d.q(`SELECT name, weight FROM mob_aq_rules`)).map((r) => [r.name, r.weight]));
  const mo = await d.one(`SELECT * FROM mob_aq_positions WHERE symbol='MOMO'`);
  prices[SOFT] = sp.target_price * 1.01; prices[MOM] = mo.stop_price * 0.99;
  sellOut = { [SOFT]: 1.1, [MOM]: 0.95 }; // what the sell quote returns per SOL put in
  jupLists = () => ({ pools: [] });
  t = await tick(env);
  assert.deepEqual(t.exits.map((e) => [e.symbol, e.why]).sort(), [["MOMO", "stop"], ["SOFT", "target"]]);
  s = await S();
  const rule = (n) => s.rules.find((r) => r.name === n);
  assert.ok(rule("danger_risk").weight < w0.danger_risk && rule("danger_risk").blockedWinners === 1, JSON.stringify(s.rules));
  assert.ok(rule("fear").blockedLosers >= 1 && rule("fear").blockedWinners >= 1, "fear objected to both the winner and the loser");
  assert.ok(s.brain.some((b) => /^Rule T3 \(trade #\d+, SOFT won/.test(b.text)) && s.brain.some((b) => /^Rule T3 \(trade #\d+, MOMO lost/.test(b.text)));
  const tr = await d.one(`SELECT tier, tag, soft FROM mob_aq_trades WHERE symbol='SOFT'`); assert.deepEqual([tr.tier, tr.tag], ["B", "EXPLORE"]); assert.ok(tr.soft.length >= 2);
  jupCharts = {}; sellOut = {};
});
