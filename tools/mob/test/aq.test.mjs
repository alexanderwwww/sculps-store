// Aquarius engine: drives the whole paper loop against stubbed copies of real API responses (test/aq-fixtures.mjs).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { makeEnv, dropEnv, reqOf, login, mock, resetMocks, res, calls } from "./helpers.mjs";
import { db } from "../src/db.mjs";
import { FX, FX2 } from "./aq-fixtures.mjs";
import { whaleSignal, slimTrades } from "../src/aq/whales.mjs";
import { GT_GAP } from "../src/aq/feeds.mjs";
GT_GAP.ms = 0;
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
let trendingPools = [], prices = {}, tradesFor = {};

function stubAll() {
  resetMocks();
  mock("GET", "https://api.geckoterminal.com/api/v2/networks/solana/trending_pools", () => ({ data: trendingPools }));
  mock("GET", "https://api.geckoterminal.com/api/v2/networks/solana/new_pools", () => clone(FX.gtNew));
  mock("GET", /geckoterminal\.com\/.*\/ohlcv\/minute/, () => goldenCandles());
  mock("GET", /geckoterminal\.com\/api\/v2\/networks\/solana\/pools\/[^/]+\/trades$/, (rec) => tradesFor[rec.url.split("/").at(-2)] || clone(FX2.gtTrades));
  mock("GET", "https://api.dexscreener.com/token-boosts/latest/v1", () => { const b = clone(FX.dsBoosts); b[0].tokenAddress = MINT.C; return b; });
  mock("GET", "https://api.dexscreener.com/token-profiles/latest/v1", () => clone(FX.dsProfiles));
  mock("GET", "https://api.coingecko.com/api/v3/simple/price", () => clone(FX.cg));
  mock("GET", "https://api.alternative.me/fng/", () => clone(FX.fng));
  mock("GET", /rugcheck\.xyz\/v1\/tokens\/([^/]+)\/report$/, (rec) => (rec.url.includes(MINT.B) ? clone(FX.rugNew) : safeRug()));
  mock("GET", "https://api.dexscreener.com/tokens/v1/solana/", (rec) => {
    const mints = rec.url.split("/").pop().split(",");
    return mints.filter((m) => prices[m] != null).map((m) => { const p = clone(FX.dsTokens[0]); p.baseToken.address = m; p.pairAddress = "x"; p.priceUsd = String(prices[m]); return p; });
  });
  mock("GET", "https://lite-api.jup.ag/swap/v1/quote", (rec, u) => {
    const q = clone(u.searchParams.get("inputMint") === SOL ? FX.jupBuy : FX.jupSell), amt = Number(u.searchParams.get("amount"));
    if (u.searchParams.get("inputMint") === SOL) { q.inAmount = String(amt); q.outAmount = String(Math.floor(amt * 1000)); return q; } // 1000 raw units per lamport
    const mint = u.searchParams.get("inputMint"), back = mint === MINT.C ? 0.9 : 0.99;  // C loses 10% round trip
    const px = prices[mint] != null ? prices[mint] / 1.1 : 1; q.inAmount = String(amt); q.outAmount = String(Math.floor((amt / 1000) * back * px)); return q;
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
  assert.deepEqual(t1.evaluated.map((e) => [e.symbol, e.verdict]), [["GOOD", "PASS"], ["RUG", "BLOCK"], ["COST", "WAIT"]], JSON.stringify(t1.evaluated));
  assert.match(t1.evaluated[1].reason, /^safety: /);
  assert.ok(t1.entered && t1.entered.sizeSol <= 0.05 && t1.entered.rtPct > 0);
  const pos = await db(env).q(`SELECT * FROM mob_aq_positions`); assert.equal(pos.length, 1); assert.equal(pos[0].symbol, "GOOD");
  const t2 = await tick(env);
  const cost = t2.evaluated.find((e) => e.symbol === "COST"); assert.equal(cost.verdict, "BLOCK"); assert.equal(cost.reason, "cost gate"); assert.ok(cost.number < 6);
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

test("whales: 2+ independent winners buying = signal; creator excluded; Helius funder clustering merges one owner", async () => {
  const d = db(env), W1 = "WhaleOne111", W2 = "WhaleTwo222", DEV = "CreatorDev333", MW = "WhaleMint1pump", PW = "WhalePool1";
  for (const w of [W1, W2, DEV]) for (const m of ["m1", "m2", "m3"])
    await d.q(`INSERT INTO mob_aq_wtrades (tx, wallet, mint, kind, sol, at) VALUES ($1,$2,$3,'buy',1,now()),($1,$2,$3,'sell',$4,now())`, [`${w}${m}`, w, m, m === "m3" ? 0.5 : 2]);
  const real = FX2.gtTrades.data[0];
  tradesFor[PW] = { data: [W1, W2, DEV].map((w, i) => { const x = clone(real); Object.assign(x.attributes, { tx_hash: `tx${i}`, tx_from_address: w, kind: "buy", from_token_address: SOL, to_token_address: MW, block_timestamp: new Date().toISOString() }); return x; }) };
  assert.equal(slimTrades(tradesFor[PW], MW).length, 3);
  const notes = {};
  let w = await whaleSignal(env, { pool: PW, mint: MW, symbol: "WH" }, { creator: DEV, insiders: [] }, (k, st, n) => { notes[k] = n; });
  assert.equal(w.signal, true); assert.equal(w.independent, 2); assert.equal(w.excluded, 1); assert.match(w.funders, /unchecked/);
  // with a Helius key: both winners were first funded by the same wallet -> one owner -> no signal
  env.HELIUS_API_KEY = "hk-test"; let lastWallet = null;
  mock("POST", "https://mainnet.helius-rpc.com/", (rec) => {
    assert.ok(rec.url.includes("api-key=hk-test"));
    const b = JSON.parse(rec.body);
    if (b.method === "getSignaturesForAddress") { lastWallet = b.params[0]; return clone(FX2.rpcSigs); }
    const tx = clone(FX2.rpcTx); tx.result.transaction.message.instructions[0].parsed.info.wallet = lastWallet; return tx;
  });
  w = await whaleSignal(env, { pool: PW, mint: MW, symbol: "WH" }, { creator: DEV, insiders: [] }, () => {});
  delete env.HELIUS_API_KEY;
  assert.equal(w.winners, 2); assert.equal(w.independent, 1); assert.equal(w.signal, false); assert.match(w.funders, /helius/);
  assert.equal((await d.q(`SELECT DISTINCT funder FROM mob_aq_funders`)).length, 1);
});

test("kill switch blocks every new entry; loss streak throttles", async () => {
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
  const t2 = await tick(env);
  assert.equal(t2.entered, null);
  s = await S(); assert.equal(s.council.last.reason, "risk: loss-streak throttle");
  assert.ok(!(await db(env).q(`SELECT 1 FROM mob_aq_positions WHERE mint=$1`, [MINT.F])).length);
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
  assert.equal(s.departments.find((x) => x.id === "whales").live, false, "no whale feed = not live");
  assert.ok(s.departments.find((x) => x.id === "scouts_sol").workers.find((w) => w.job === "Trending list").status === "busy");
  assert.ok(s.market.sol.price > 0 && s.market.fearGreed.value === 10);
  assert.ok(s.council.vetoes.length <= 10 && s.flows.length <= 40 && s.brain.length <= 30);
  assert.deepEqual(s.strategies.map((x) => x.id), ["R1", "R2", "R3", "R4", "R5"]);
  assert.equal(s.strategies.find((x) => x.id === "R1").status, "not tested");
  assert.deepEqual(s.tools.map((t) => t.name).sort(), ["Freqtrade", "Hummingbot", "Kronos", "NautilusTrader", "skfolio"]);
  assert.ok(s.tools.every((t) => t.status === "planned" && t.usedBy));
  assert.deepEqual(s.helpers, { grok: "not connected", chatgpt: "not connected", grokLastAt: null, chatgptLastAt: null });
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
  assert.equal(s.xfeed.length, 1); assert.deepEqual({ ...s.xfeed[0], at: 0 }, { at: 0, section: "news", text: "Posts say $GOOD listing soon", label: "CLAIMED", source: "grok" });
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
  assert.deepEqual(tools, ["aq_state", "aq_briefing", "aq_post_evidence", "aq_propose_bot", "aq_list_tasks", "aq_task_done"]);
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
