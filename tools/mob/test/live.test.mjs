// LIVE orders (src/aq/live.mjs) against a fake Jupiter and a fake Solana RPC, on a throwaway schema. Nothing real is sent:
// every Jupiter and RPC URL is mocked, and an unmocked fetch throws (helpers.mjs).
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import { makeEnv, dropEnv, reqOf, login, mock, resetMocks } from "./helpers.mjs";
import { db } from "../src/db.mjs";
import * as L from "../src/aq/live.mjs";
import * as W from "../src/aq/wallet.mjs";
import { usMarket } from "../src/aq/robinhood.mjs";
import * as C from "../src/aq/chart.mjs";
import { chart, asJup, rise } from "./fib-fixture.mjs";
import { buildState, _resetSeeded } from "../src/aq/engine.mjs";

const SOL = "So11111111111111111111111111111111111111112", MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", NEWMINT = "NewPair1111111111111111111111111111111111111";
let env, R, cookie, d, wallet;
const one = (q, p) => d.one(q, p), all = (q, p) => d.q(q, p);
const setS = (k, v) => d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ($1,$2,now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [k, JSON.stringify(v)]);
const limits = (o = {}) => setS("sol_wallet_limits", { maxPerTradeSol: 0.05, maxDailyLossSol: 0.2, maxOpenPositions: 2, autoTrade: true, ...o });
// the fake world
const F = {};
const fakeTx = (payer, nsig = 1) => { const b = new Uint8Array(1 + 64 * nsig + 4 + 1 + 64 + 32 + 1); b[0] = nsig; let p = 1 + 64 * nsig; b[p++] = 0x80; b[p++] = nsig; b[p++] = 0; b[p++] = 1; b[p++] = 2; b.set(W.unbase58(payer), p); b.set(crypto.getRandomValues(new Uint8Array(32)), p + 64); return Buffer.from(b).toString("base64"); };
const fibCandles = (opts) => asJup(chart(Date.now() / 1000, opts)).candles; // a golden-pocket bounce that closed a minute ago
// After a buy: the same leg placed `rows.length` minutes ago, then those minutes (built from the plan's own levels), so the
// position's plan is exactly the one entrySetup made at that moment. Five flat minutes at the end close the last 5-minute bar.
async function scenario(rowsOf) {
  const n = Math.floor(Date.now() / 1000), probe = C.entrySetup(chart(n - 3600), n - 3600), rows0 = rowsOf(probe);
  const rows = [...rows0, ...Array(5).fill([rows0[rows0.length - 1][1], rows0[rows0.length - 1][1], 5])];
  const start = Math.floor(n / 60) * 60 - rows.length * 60, base = chart(start), s = C.entrySetup(base, start); assert.equal(s.signal, true, s.why);
  const plan = C.planOf(s, start, { liq: 250000 });
  await d.q(`DELETE FROM mob_aq_market`); // the chart cache: this scenario is a new picture
  F.candles = [...base, ...rows.map(([o, c, v], k) => ({ t: start + k * 60, o, h: Math.max(o, c) * 1.001, l: Math.min(o, c) * 0.999, c, v }))].map((c) => ({ time: c.t, open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v }));
  await d.q(`UPDATE mob_aq_live_positions SET plan = $1 WHERE status IN ('open','stuck')`, [JSON.stringify(plan)]);
  return plan;
}
const flat = (p, k, v = 5) => Array.from({ length: k }, () => [p, p, v]);
function world() {
  resetMocks();
  Object.assign(F, { payer: null, nsig: 1, swapBody: null, balance: 1_000_000_000, quoteFail: false, swapFail: false, jupSim: null, impact: "0.001", simTake: null, simErr: null, send: "ok", sent: [], status: {}, txs: {}, height: 1000, lastValid: 2000, tokensOut: "5000000", sellOut: "60000000", candles: fibCandles(), rug: { mintAuthority: null, freezeAuthority: null, rugged: false, risks: [], topHolders: [], markets: [], token: { decimals: 5 } }, calls: [], rowAtSend: null,
    pools: [{ id: "pool1", quoteAsset: SOL, baseAsset: { id: MINT, symbol: "BONK", usdPrice: 0.00002, liquidity: 250000, decimals: 5, firstPool: { createdAt: "2024-01-01T00:00:00Z" }, stats5m: { priceChange: -4 }, audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true } } },
      { id: "pool2", quoteAsset: SOL, baseAsset: { id: NEWMINT, symbol: "NEWP", usdPrice: 1, liquidity: 900000, decimals: 6, firstPool: { createdAt: new Date(Date.now() - 3600e3).toISOString() }, stats5m: { priceChange: -9 } } }] });
  mock("GET", /^https:\/\/datapi\.jup\.ag\/v1\/pools\//, () => ({ pools: F.pools }));
  mock("GET", /^https:\/\/datapi\.jup\.ag\/v2\/charts\//, () => ({ candles: F.candles }));
  mock("GET", /^https:\/\/api\.rugcheck\.xyz\//, () => F.rug);
  for (const host of ["https://api.jup.ag", "https://lite-api.jup.ag"]) {
    mock("GET", `${host}/swap/v1/quote`, (c, u) => { F.calls.push("quote"); if (F.quoteFail) return new Response(JSON.stringify({ error: "Could not find any route" }), { status: 400 });
      const buy = u.searchParams.get("inputMint") === SOL, out = buy ? F.tokensOut : F.sellOut;
      return { inputMint: u.searchParams.get("inputMint"), outputMint: u.searchParams.get("outputMint"), inAmount: u.searchParams.get("amount"), outAmount: out, otherAmountThreshold: String(Math.floor(Number(out) * 0.99)), priceImpactPct: F.impact, slippageBps: Number(u.searchParams.get("slippageBps")), routePlan: [{ swapInfo: { label: "Meteora" } }] }; });
    mock("POST", `${host}/swap/v1/swap`, (c) => { F.calls.push("swap"); const b = JSON.parse(c.body); F.swapBody = b; if (F.swapFail) return new Response("{}", { status: 500 });
      return { swapTransaction: fakeTx(F.payer || b.userPublicKey, F.nsig || 1), lastValidBlockHeight: F.lastValid, prioritizationFeeLamports: 9555, simulationError: F.jupSim }; });
  }
  mock("POST", "https://mainnet.helius-rpc.com/", async (c) => { const m = JSON.parse(c.body), ok = (result) => ({ jsonrpc: "2.0", id: 1, result }); F.calls.push(m.method);
    if (m.method === "getBalance") return ok({ context: { slot: 1 }, value: F.balance });
    if (m.method === "getTokenAccountsByOwner") return ok({ context: { slot: 1 }, value: [] });
    if (m.method === "getBlockHeight") return ok(F.height);
    if (m.method === "simulateTransaction") return ok({ context: { slot: 1 }, value: { err: F.simErr, accounts: [{ lamports: F.balance - (F.simTake ?? (F.swapBody.quoteResponse.inputMint === SOL ? Number(F.swapBody.quoteResponse.inAmount) + 2_050_000 : -Number(F.swapBody.quoteResponse.otherAmountThreshold))) }], logs: [] } });
    if (m.method === "sendTransaction") { F.sent.push(m.params[0]); F.rowAtSend = await one(`SELECT status, signature FROM mob_aq_live_orders ORDER BY id DESC LIMIT 1`);
      if (F.send === "throw") throw new Error("socket hang up"); if (F.send === "rpcerror") return { jsonrpc: "2.0", id: 1, error: { code: -32002, message: "Transaction simulation failed: Blockhash not found" } };
      const sig = F.rowAtSend.signature, q = F.swapBody.quoteResponse, buy = q.inputMint === SOL; // it lands, exactly as quoted
      if (F.send === "ok") { F.status[sig] = { confirmationStatus: "confirmed", err: null }; F.txs[sig] = landed(buy, q); }
      return ok(sig); }
    if (m.method === "getSignatureStatuses") return ok({ context: { slot: 1 }, value: m.params[0].map((s) => F.status[s] ?? null) });
    if (m.method === "getTransaction") return ok(F.txs[m.params[0]] ?? null);
    return { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } }; });
}
const landed = (buy, q, err = null) => ({ slot: 5, meta: { err, fee: 14556, preBalances: [F.balance], postBalances: [buy ? F.balance - Number(q.inAmount) - 2_050_000 : F.balance + Number(q.outAmount) - 14556],
  preTokenBalances: buy ? [] : [{ owner: wallet.address, mint: q.inputMint, uiTokenAmount: { amount: q.inAmount } }], postTokenBalances: buy ? [{ owner: wallet.address, mint: q.outputMint, uiTokenAmount: { amount: q.outAmount } }, { owner: "someone-else", mint: q.outputMint, uiTokenAmount: { amount: "999" } }] : [] }, transaction: { message: { accountKeys: [wallet.address, "x"] }, signatures: ["s"] } });
const wipe = async () => { await d.q(`DELETE FROM mob_aq_live_orders`); await d.q(`DELETE FROM mob_aq_live_positions`); await d.q(`DELETE FROM mob_aq_live_refusals`); await d.q(`DELETE FROM mob_aq_market`); await d.q(`DELETE FROM mob_aq_state WHERE k IN ('live_auto_off','live_tick','live_tick_lock')`); await setS("kill", false); await limits(); };
const lastRef = async (venue = "solana") => one(`SELECT gate, reason, symbol, n FROM mob_aq_live_refusals WHERE venue = $1 ORDER BY at DESC, id DESC LIMIT 1`, [venue]);
const orders = () => all(`SELECT * FROM mob_aq_live_orders ORDER BY id`), positions = () => all(`SELECT * FROM mob_aq_live_positions ORDER BY id`);

before(async () => { env = await makeEnv({ HELIUS_API_KEY: "hk", AQ_JUP_GAP_MS: "0", AQ_LIVE_POLL_MS: "0" }); _resetSeeded(); R = reqOf(env); cookie = await login(env); d = db(env); world(); await buildState(env); });
after(async () => { await dropEnv(env); });
beforeEach(async () => { world(); if (wallet) await wipe(); });

test("with no wallet and every limit at zero nothing can trade: the tick records the refusal and asks nobody", async () => {
  const r = await L.liveTick(env, { minute: 1 });
  assert.equal(r.result.refused, "no_wallet"); assert.deepEqual(await lastRef(), { gate: "no_wallet", reason: "The Aquarius wallet has not been created", symbol: null, n: 1 });
  assert.equal(F.calls.length, 0, "no Jupiter call, no RPC call"); assert.equal((await orders()).length, 0);
  await L.liveTick(env, { minute: 1 }); assert.equal((await lastRef()).n, 2, "the same refusal inside ten minutes is one row with a count");
  assert.equal((await W.createWallet(env)).created, true); wallet = await one(`SELECT v FROM mob_aq_state WHERE k='sol_wallet_key'`).then((x) => x.v);
  assert.equal((await L.liveTick(env, { minute: 1 })).result.refused, "auto_trade_off"); assert.equal(F.calls.length, 0);
});

test("every gate refuses, in order, and says why", async () => {
  const gate = async () => (await L.liveTick(env, { minute: 1 })).result.refused;
  await limits({ autoTrade: false }); assert.equal(await gate(), "auto_trade_off");
  await limits(); await setS("kill", true); assert.equal(await gate(), "kill_switch"); await setS("kill", false);
  await limits({ maxPerTradeSol: 0 }); assert.equal(await gate(), "limit_per_trade");
  await limits({ maxDailyLossSol: 0 }); assert.equal(await gate(), "limit_daily_loss");
  await limits({ maxOpenPositions: 0 }); assert.equal(await gate(), "limit_open");
  assert.equal(F.sent.length, 0); assert.equal(F.calls.filter((c) => c === "quote" || c === "swap").length, 0);
  // the reserve: the wallet must hold the trade, the fee budget and 0.01 SOL on top
  await limits(); F.balance = 0.05e9 + 3_500_000 + 0.01e9 - 1; assert.equal(await gate(), "reserve"); assert.match((await lastRef()).reason, /not enough for a 0.05 SOL trade/);
  await wipe(); world(); F.impact = "0.02"; assert.equal(await gate(), "price_impact"); assert.match((await lastRef()).reason, /2% is over the 1% cap/);
  await wipe(); world(); F.rug = { ...F.rug, mintAuthority: "SomeAuthority111" }; assert.equal(await gate(), "safety"); assert.match((await lastRef()).reason, /mint authority/);
  await wipe(); world(); F.pools[0].baseAsset.liquidity = 99000; assert.equal(await gate(), "no_candidate", "a pool under $100K is not looked at, and the one-hour-old pair never is");
  await wipe(); world(); F.candles = fibCandles({ tail: [[114.6, 114.1, 9]] }); assert.equal(await gate(), "no_setup"); assert.match((await lastRef()).reason, /no bounce candle yet: a falling knife/);
  await wipe(); world(); F.candles = fibCandles({ tail: [[114.1, 114.6, 9], [114.6, 117, 9], [117, 118, 9]] }); assert.equal(await gate(), "no_setup"); assert.match((await lastRef()).reason, /never chase/);
  await wipe(); world(); F.candles = asJup(chart(Date.now() / 1000 - 900)).candles; assert.equal(await gate(), "stale_data");
  await wipe(); world(); await d.q(`INSERT INTO mob_aq_chat (from_name, text) VALUES ('grok', $1)`, [`VETO ${MINT}: dev wallet is selling`]); assert.equal(await gate(), "veto"); await d.q(`DELETE FROM mob_aq_chat`);
  await d.q(`INSERT INTO mob_aq_chat (from_name, text) VALUES ('grok', $1), ('chatgpt', $2)`, [`I like ${MINT}`, `VETO ${MINT}`]); await wipe(); world(); assert.notEqual(await gate(), "veto", "only Grok, only a message that starts with VETO"); await d.q(`DELETE FROM mob_aq_chat`);
  // cost first: the measured round trip under 1%, and target 1 at least 3x it
  await wipe(); world(); F.sellOut = "49000000"; assert.equal(await gate(), "cost"); assert.match((await lastRef()).reason, /round trip costs 2%, over 1%/);
  // a short leg: target 1 is 2.26% away. A 0.9% round trip needs 2.7%: refused for cost, by name
  await wipe(); world(); F.sellOut = "49550000"; F.candles = fibCandles({ legTo: 4, pull: 2, tail: rise(101.45, 101.8) }); assert.equal(await gate(), "cost"); assert.match((await lastRef()).reason, /^Target 1 is 2\.\d+% away, under 3x the 0\.9% round trip/);
  await wipe(); world(); F.sellOut = "49800000"; F.candles = fibCandles({ legTo: 4, pull: 2, tail: rise(101.45, 101.8) }); assert.equal((await L.liveTick(env, { minute: 1 })).result.confirmed, true, "a 0.4% round trip clears 3x on the same chart"); await wipe(); world();
  // the veto window is the last hour: 61 minutes old does not block, 59 minutes old does; "VETO lifted on <mint>" is not a veto
  await d.q(`INSERT INTO mob_aq_chat (from_name, text, at) VALUES ('grok', $1, now() - interval '61 minutes')`, [`VETO ${MINT}`]); assert.notEqual(await gate(), "veto"); await wipe(); world();
  await d.q(`INSERT INTO mob_aq_chat (from_name, text) VALUES ('grok', $1)`, [`VETO lifted on ${MINT}`]); assert.notEqual(await gate(), "veto"); await wipe(); world();
  await d.q(`INSERT INTO mob_aq_chat (from_name, text, at) VALUES ('grok', $1, now() - interval '59 minutes')`, [`**VETO** ${MINT}: paid wave`]); assert.equal(await gate(), "veto"); await d.q(`DELETE FROM mob_aq_chat`);
  await wipe(); world(); F.quoteFail = true; assert.equal(await gate(), "no_quote");
  assert.equal(F.sent.length, 0); assert.equal((await orders()).length, 0); assert.equal((await positions()).length, 0, "a refused trade leaves no order and no position");
  // max open and the daily loss
  await wipe(); world(); await limits({ maxOpenPositions: 1 }); await d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, tokens_raw, cost_sol, stop_pct) VALUES ('solana','OtherMint','OTH','open','1',0.05,10)`);
  assert.equal(await gate(), "max_open");
  await wipe(); world(); await d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, cost_sol, proceeds_sol, pnl_sol, closed_at) VALUES ('solana','L1','L1','closed',0.3,0.09,-0.21, now())`);
  assert.equal(await gate(), "daily_loss"); assert.equal((await one(`SELECT v FROM mob_aq_state WHERE k='sol_wallet_limits'`)).v.autoTrade, false, "auto trade switched itself off");
  assert.match((await one(`SELECT v FROM mob_aq_state WHERE k='live_auto_off'`)).v.why, /today's live loss is 0.21 SOL/); assert.equal(await gate(), "auto_trade_off");
});

test("a buy: the row is written before the send, the signature is ours, the fill comes from the chain; a second tick cannot buy again", async () => {
  const r = await L.liveTick(env, { minute: 1 });
  assert.equal(r.result.buy, "BONK"); assert.equal(r.result.confirmed, true);
  const [o] = await orders(), [p] = await positions();
  assert.deepEqual(F.rowAtSend, { status: "sent", signature: o.signature }, "status and signature were on record before sendTransaction ran");
  assert.equal(F.sent.length, 1);
  // what was sent is the transaction Jupiter built, with a valid signature of the Aquarius wallet over its message
  const t = L.readTx(F.sent[0]), pub = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(W.unbase58(wallet.address))]), format: "der", type: "spki" });
  assert.equal(verify(null, t.bytes.subarray(t.msgStart), pub, t.bytes.subarray(t.sigStart, t.sigStart + 64)), true); assert.equal(W.base58(t.bytes.subarray(t.sigStart, t.sigStart + 64)), o.signature);
  assert.equal(F.swapBody.userPublicKey, wallet.address); assert.equal(F.swapBody.wrapAndUnwrapSol, true); assert.equal(F.swapBody.quoteResponse.inAmount, "50000000");
  assert.equal(o.status, "confirmed"); assert.equal(o.side, "buy"); assert.equal(o.in_amount, "50000000"); assert.equal(o.quote_out, "5000000"); assert.equal(o.fill_tokens, "5000000"); assert.ok(Math.abs(o.fill_sol + 0.05205) < 1e-9); assert.ok(Math.abs(o.fee_sol - 0.000014556) < 1e-12);
  assert.equal(p.status, "open"); assert.equal(p.tokens_raw, "5000000"); assert.ok(Math.abs(p.cost_sol - 0.05205) < 1e-9); assert.equal(p.time_exit_at, null, "no clock");
  assert.equal(p.plan.kind, "fib"); assert.equal(p.plan.entry, 114.6); assert.ok(p.plan.stop < p.plan.levels.z786 && p.plan.t1 > 129); assert.equal(p.plan.phase, 0);
  for (const k of ["leg", "pocket", "bounceClose", "pullbackVolumeLower", "notVetoed", "safety", "cost", "impact"]) assert.equal(p.plan.validations[k], true, k);
  assert.ok(p.plan.rtPct < 1 && p.plan.rewardPct > 3 * p.plan.rtPct); assert.match(o.reason, /golden pocket bounce/);
  assert.deepEqual(F.calls.filter((c) => ["simulateTransaction", "sendTransaction"].includes(c)), ["simulateTransaction", "sendTransaction"], "simulated before it was signed and sent");
  // same minute, and later ticks: the coin is held, so nothing is bought and nothing is sent
  const again = await L.liveTick(env, { minute: 1 }); assert.equal(again.result.refused, "no_setup"); assert.equal(F.sent.length, 1); assert.equal((await orders()).length, 1);
  const [a, b] = await Promise.all([L.liveTick(env, { minute: 1 }), L.liveTick(env, { minute: 1 })]); assert.ok(a.skipped || b.skipped, "two ticks at once: one of them does not run"); assert.equal(F.sent.length, 1);
  // the order's one-time key: the same coin, side and minute can never be written twice
  await assert.rejects(d.q(`INSERT INTO mob_aq_live_orders (venue, side, mint, claim) VALUES ('solana','buy',$1,$2)`, [MINT, o.claim]), /duplicate key/);
  await assert.rejects(d.q(`INSERT INTO mob_aq_live_positions (venue, mint, status) VALUES ('solana',$1,'opening')`, [MINT]), /duplicate key/);
  const st = (await buildState(env)).solWallet.live;
  assert.equal(st.positions.length, 1); assert.equal(st.orders[0].signature, o.signature); assert.equal(st.proven, false); assert.ok(!JSON.stringify(st).includes(wallet.sealed));
});

test("failures before signing spend nothing: no swap, Jupiter's simulation, our simulation, a transaction that is not ours", async () => {
  const run = async (prep, re) => { await wipe(); world(); prep(); const r = await L.liveTick(env, { minute: 1 }); const [o] = await orders(), [p] = await positions();
    assert.equal(o.status, "failed", JSON.stringify(r)); assert.match(o.error, re); assert.equal(o.signature, null); assert.equal(p.status, "failed"); assert.equal(F.sent.length, 0); };
  await run(() => { F.swapFail = true; }, /Jupiter answered HTTP 500/);
  await run(() => { F.jupSim = { errorCode: "TRANSACTION_ERROR", error: "custom program error" }; }, /Jupiter's own simulation failed/);
  await run(() => { F.simErr = { InstructionError: [3, { Custom: 6001 }] }; }, /the simulation failed/);
  await run(() => { F.simTake = 0.9e9; }, /would take 0.9 SOL, more than the 0.05 SOL trade plus fees; not signed/);
  await run(() => { F.payer = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"; }, /not a one-signature transaction of the Aquarius wallet; not signed/);
  await run(() => { F.nsig = 2; }, /not a one-signature transaction/);
  assert.throws(() => L.readTx(Buffer.from([1, 2, 3]).toString("base64")));
});

test("a send with an unknown outcome is never sent again: found on the chain later, or expired, decided by the chain", async () => {
  F.send = "throw"; // the RPC call dies: was it broadcast? unknown
  let r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.pending, true, JSON.stringify(r));
  let [o] = await orders(), [p] = await positions(); assert.equal(o.status, "sent"); assert.match(o.error, /send:/); assert.equal(p.status, "opening"); assert.equal(F.sent.length, 1);
  r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.refused, "order_pending"); assert.equal(F.sent.length, 1, "not sent again"); assert.equal((await orders()).length, 1);
  // ...and it had landed after all
  F.status[o.signature] = { confirmationStatus: "finalized", err: null }; F.txs[o.signature] = landed(true, F.swapBody.quoteResponse);
  r = await L.liveTick(env, { minute: 1 }); assert.deepEqual(r.reconciled, [{ id: Number(o.id), end: "confirmed" }].map((x) => ({ ...x, id: o.id })));
  [o] = await orders(); [p] = await positions(); assert.equal(o.status, "confirmed"); assert.equal(p.status, "open"); assert.equal(p.tokens_raw, "5000000"); assert.equal(F.sent.length, 1);
  // the other ending: never seen, and its time window passed
  await wipe(); world(); F.send = "rpcerror"; await L.liveTick(env, { minute: 1 }); [o] = await orders(); assert.equal(o.status, "sent");
  await L.liveTick(env, { minute: 1 }); assert.equal((await orders())[0].status, "sent", "inside its window it is still unknown");
  F.height = F.lastValid + 50; r = await L.liveTick(env, { minute: 1 }); [o] = await orders(); [p] = await positions();
  assert.equal(o.status, "failed"); assert.match(o.error, /never reached the chain/); assert.equal(p.status, "failed"); assert.equal(F.sent.length, 1);
  // confirmed on the chain but rejected there
  await wipe(); world(); F.send = "throw"; await L.liveTick(env, { minute: 1 }); [o] = await orders(); F.status[o.signature] = { confirmationStatus: "confirmed", err: { InstructionError: [2, "Custom"] } };
  await L.liveTick(env, { minute: 1 }); assert.equal((await orders())[0].status, "failed"); assert.equal((await positions())[0].status, "failed");
  // a run that died before signing leaves a row with no signature: closed as "nothing was sent"
  await wipe(); world(); await d.q(`INSERT INTO mob_aq_live_orders (venue, side, mint, symbol, claim, requested_at) VALUES ('solana','buy','X','X','old-claim', now() - interval '5 minutes')`);
  await limits({ autoTrade: false }); await L.liveTick(env, { minute: 1 }); assert.match((await orders())[0].error, /stopped before signing/);
});

test("exits by the chart: half at target 1, the rest at the stop moved to entry; a stop at a loss; never by the clock", async () => {
  await L.liveTick(env, { minute: 1 }); let [p] = await positions(); assert.equal(p.status, "open");
  // no bar after entry yet: marked, not sold
  await L.liveTick(env, { minute: 1 }); [p] = await positions(); assert.equal(p.status, "open"); assert.ok(Math.abs(p.last_value_sol - 0.06) < 1e-9); assert.equal(F.sent.length, 1);
  // hours on a flat chart above the stop: still open (no clock)
  await scenario((s) => flat(116, 240)); const hr = await L.liveTick(env, { minute: 2 }); assert.equal((await positions())[0].status, "open", JSON.stringify(hr.exits)); assert.equal(F.sent.length, 1);
  // target 1: half is sold, the position stays open with the stop at entry
  let plan = await scenario((s) => [...flat(118, 10), [118, s.t1 + 0.2, 9]]);
  let r = await L.liveTick(env, { minute: 3 }); assert.equal(r.exits[0].confirmed, true, JSON.stringify(r)); assert.match(r.exits[0].reason, /^target 1/);
  [p] = await positions(); assert.equal(p.status, "open"); assert.equal(p.tokens_raw, "2500000"); assert.equal(p.plan.phase, 1); assert.equal(p.plan.stop, plan.entry); assert.equal(F.sent.length, 2);
  assert.equal((await orders())[1].in_amount, "2500000"); assert.ok(p.proceeds_sol > 0); assert.equal(p.pnl_sol, null, "not closed, so no result yet");
  // then the rest: a 5-minute close under entry, after the stop moved
  { const cut = Math.floor(Date.now() / 60000) * 60 - 600; F.candles = F.candles.filter((c) => c.time < cut);
    for (let k = 0; k < 10; k++) F.candles.push({ time: cut + k * 60, open: plan.entry - 1, high: plan.entry - 0.9, low: plan.entry - 1.1, close: plan.entry - 1, volume: 5 });
    await d.q(`UPDATE mob_aq_live_positions SET plan = plan || jsonb_build_object('since', $1::bigint)`, [cut - (cut % 300)]); }
  r = await L.liveTick(env, { minute: 4 }); assert.match(r.exits[0].reason, /stop at entry after target 1/, JSON.stringify(r));
  [p] = await positions(); assert.equal(p.status, "closed"); assert.equal(p.tokens_raw, "0"); assert.ok(Math.abs(p.pnl_sol - (p.proceeds_sol - p.cost_sol)) < 1e-12); assert.equal(p.plan.outcome, p.exit_reason);
  assert.equal(F.sent.length, 3); assert.deepEqual((await orders()).map((o) => o.side), ["buy", "sell", "sell"]);
  // exits run with auto trade off and the kill switch on; a sell that fails puts the position back; the chart stop sells at a loss
  await wipe(); world(); await L.liveTick(env, { minute: 1 }); await limits({ autoTrade: false }); await setS("kill", true);
  plan = await scenario((s) => [...flat(114.6, 5), ...flat(s.stop - 0.5, 5)]);
  F.sellOut = "40000000"; F.simErr = { InstructionError: [1, "Custom"] }; let t = await L.liveTick(env, { minute: 5 }); assert.match(t.exits[0].failed, /simulation failed/);
  [p] = await positions(); assert.equal(p.status, "open"); assert.equal(p.sell_fails, 1); assert.equal(F.sent.length, 1);
  F.simErr = null; t = await L.liveTick(env, { minute: 6 }); assert.match(t.exits[0].reason, /^stop: a 5-minute close under the 78.6% stop|^invalidation: a lower low/); assert.equal(t.result.refused, "auto_trade_off");
  [p] = await positions(); assert.equal(p.status, "closed"); assert.ok(p.pnl_sol < -0.012);
  // a veto on a held coin sells it
  await wipe(); world(); await setS("kill", false); await L.liveTick(env, { minute: 1 }); await d.q(`INSERT INTO mob_aq_chat (from_name, text) VALUES ('grok', $1)`, [`VETO ${MINT}`]);
  t = await L.liveTick(env, { minute: 7 }); assert.match(t.exits[0].reason, /^veto/); assert.equal((await positions())[0].status, "closed"); await d.q(`DELETE FROM mob_aq_chat`);
  // the daily loss limit is reached by a real sell: auto trade goes off by itself
  await wipe(); world(); await limits({ maxDailyLossSol: 0.01 }); await L.liveTick(env, { minute: 1 }); await scenario((s) => [...flat(114.6, 5), ...flat(s.stop - 0.5, 5)]); F.sellOut = "30000000"; await L.liveTick(env, { minute: 8 });
  assert.equal((await one(`SELECT v FROM mob_aq_state WHERE k='sol_wallet_limits'`)).v.autoTrade, false); assert.match((await lastRef()).reason, /Auto trade is off|switched itself OFF/);
  assert.ok((await buildState(env)).solWallet.live.autoOff.why.includes("daily limit")); assert.ok((await buildState(env)).solWallet.live.pnlTodaySol < -0.01);
  // SELL ALL LIVE: Alex only
  await wipe(); world(); await L.liveTick(env, { minute: 1 }); await d.q(`UPDATE mob_aq_live_orders SET claim = claim || '-z'`);
  assert.equal((await R("POST", "/api/aq/wallet/sellall")).status, 401); assert.equal((await R("POST", "/api/aq/wallet/sellall", { bearer: env.MOB_API_TOKEN })).status, 403); assert.equal(F.sent.length, 1);
  const out = await (await R("POST", "/api/aq/wallet/sellall", { cookie, body: {} })).json(); assert.equal(out.sold.length, 1); assert.equal(out.sold[0].symbol, "BONK"); assert.equal((await positions())[0].status, "closed"); assert.equal((await positions())[0].exit_reason, "SELL ALL LIVE (Alex)");
  const live = await (await R("GET", "/api/aq/wallet/live", { cookie })).json(); assert.equal(live.positions.length, 0); assert.equal(live.orders.length, 2); assert.ok(!JSON.stringify(live).includes("sealed"));
  for (const path of ["/api/aq/wallet/buy", "/api/aq/wallet/order", "/api/aq/wallet/tick"]) assert.equal((await R("POST", path, { cookie, body: {} })).status, 404, "there is no route that buys");
});

test("hardening: a stuck coin is still managed and counts toward the daily loss, orphans heal, an exit is not blocked by impact, an unknown sell is never sent twice", async () => {
  // a sell over 1% impact still goes out when the chart says sell (the simulation still checks what comes back)
  await L.liveTick(env, { minute: 1 }); let plan = await scenario((s) => [...flat(114.6, 5), ...flat(s.stop - 0.5, 5)]); F.impact = "0.03";
  let r = await L.liveTick(env, { minute: 2 }); assert.equal(r.exits[0].confirmed, true, JSON.stringify(r.exits)); assert.equal((await positions())[0].status, "closed");
  // stuck: 5 failed sells; it is still managed every minute, its marked loss counts toward the daily limit, a success clears the count
  await wipe(); world(); await L.liveTick(env, { minute: 1 }); await scenario((s) => [...flat(114.6, 5), ...flat(s.stop - 0.5, 5)]);
  await d.q(`UPDATE mob_aq_live_positions SET status = 'stuck', sell_fails = 5, last_value_sol = 0.01`);
  assert.ok((await L.pnlToday(d)) < -0.04, "the stuck coin's marked loss is in today's result");
  F.sellOut = "30000000"; r = await L.liveTick(env, { minute: 3 }); assert.equal(r.exits[0].confirmed, true, "the chart stop sells a stuck position"); let [p] = await positions(); assert.equal(p.status, "closed"); assert.equal(p.sell_fails, 0);
  // an order row that could not be written: the claim is put back, nothing is sent; an orphan 'closing' row heals after 2 minutes
  await wipe(); world(); await L.liveTick(env, { minute: 1 }); [p] = await positions(); const n0 = F.sent.length;
  await d.q(`UPDATE mob_aq_live_positions SET status = 'closing'`); await L.liveTick(env, { minute: 4 }); assert.equal((await positions())[0].status, "closing", "a young closing row is left alone");
  await d.q(`UPDATE mob_aq_live_orders SET requested_at = now() - interval '5 minutes'`); r = await L.liveTick(env, { minute: 5 }); assert.equal(r.healed, 1); assert.equal((await positions())[0].status, "open"); assert.equal(F.sent.length, n0);
  await d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, created_at) VALUES ('solana','Orphan1111','ORPH','opening', now() - interval '5 minutes')`);
  await L.liveTick(env, { minute: 6 }); assert.equal((await one(`SELECT status FROM mob_aq_live_positions WHERE mint = 'Orphan1111'`)).status, "failed");
  // a half sale whose send outcome is unknown: reconciled from the chain, never sent again, the size comes from the claimed row
  await wipe(); world(); await L.liveTick(env, { minute: 1 }); plan = await scenario((s) => [...flat(118, 10), [118, s.t1 + 0.2, 9]]);
  F.send = "throw"; r = await L.liveTick(env, { minute: 7 }); const sells = () => all(`SELECT * FROM mob_aq_live_orders WHERE side = 'sell'`);
  let [o] = await sells(); assert.equal(o.status, "sent"); assert.equal(o.in_amount, "2500000"); assert.equal((await positions())[0].status, "closing"); const sentN = F.sent.length;
  r = await L.liveTick(env, { minute: 8 }); assert.equal((await sells()).length, 1, "pending on the chain: no second sell"); assert.equal(F.sent.length, sentN);
  F.status[o.signature] = { confirmationStatus: "confirmed", err: null }; F.txs[o.signature] = landed(false, { inputMint: MINT, outputMint: SOL, inAmount: "2500000", outAmount: F.sellOut });
  r = await L.liveTick(env, { minute: 9 }); [o] = await sells(); assert.equal(o.status, "confirmed"); [p] = await positions(); assert.equal(p.status, "open"); assert.equal(p.tokens_raw, "2500000"); assert.equal(p.plan.phase, 1);
  assert.equal(F.sent.length, sentN, "found on the chain, not sent again"); F.send = "ok";
});

test("Alex's manual orders: SELL 25% / ALL through the ledger, BUY MORE adds to the cost, one order per double click, the kill switch and rule 10", async () => {
  const M = (body, o = { cookie }) => R("POST", "/api/aq/wallet/manual", { ...o, body }), P = (body) => R("POST", "/api/aq/wallet/manual/preview", { cookie, body });
  assert.equal((await M({ positionId: 1, side: "sell", pct: 25 }, {})).status, 401, "no session: refused");
  assert.equal((await M({ positionId: 1, side: "sell", pct: 25 }, { bearer: env.MOB_API_TOKEN })).status, 403, "the bearer is not Alex");
  await L.liveTick(env, { minute: 1 }); let [p] = await positions(); assert.equal(p.status, "open"); const sent0 = F.sent.length;
  // the preview sends nothing and says coin, exact mint, amount, expected out, impact
  const pv = await (await P({ positionId: p.id, side: "sell", pct: 25 })).json(); assert.equal(pv.mint, MINT); assert.equal(pv.tokensIn, "1250000"); assert.ok(pv.expectSol > 0); assert.ok(pv.impactPct >= 0); assert.equal(F.sent.length, sent0);
  // the kill switch blocks manual orders too
  await setS("kill", true); let r = await M({ positionId: p.id, side: "sell", pct: 25 }); assert.equal(r.status, 400); assert.match((await r.json()).error.message, /kill switch/); assert.equal(F.sent.length, sent0); await setS("kill", false);
  // SELL 25%: one order, through the same ledger; the position stays open with 75% of the tokens
  r = await M({ positionId: p.id, side: "sell", pct: 25 }); const j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j)); assert.equal(j.confirmed, true);
  [p] = await positions(); assert.equal(p.status, "open"); assert.equal(p.tokens_raw, "3750000"); assert.ok(p.proceeds_sol > 0); const so = (await orders()).at(-1); assert.equal(so.side, "sell"); assert.equal(so.in_amount, "1250000"); assert.match(so.reason, /^manual: Alex/); assert.ok(so.signature);
  // BUY MORE: average cost = cost and tokens added together; the chart plan stays the original leg's
  const plan0 = p.plan, cost0 = p.cost_sol;
  r = await M({ positionId: p.id, side: "buy", sol: 0.02 }); assert.equal(r.status, 200, await r.clone().text()); [p] = await positions();
  assert.equal(p.tokens_raw, "8750000"); assert.ok(Math.abs(p.cost_sol - (cost0 + 0.02 + 0.00205)) < 1e-9); assert.deepEqual(p.plan.levels, plan0.levels); assert.equal(p.status, "open");
  assert.match((await orders()).at(-1).reason, /manual: Alex \(buy more\)/); assert.equal((await positions()).length, 1, "it adds, it never opens a second position");
  assert.equal((await M({ positionId: p.id, side: "buy", sol: 1 })).status, 400, "over the per-trade limit");
  // rule 10: under water, BUY MORE asks first; with "buy anyway" it goes
  await d.q(`UPDATE mob_aq_live_positions SET last_value_sol = 0.01`); const n0 = F.sent.length;
  const w1 = await (await P({ positionId: p.id, side: "buy", sol: 0.01 })).json(); assert.equal(w1.underwater, true); assert.match(w1.warning, /never add to a loser/);
  r = await M({ positionId: p.id, side: "buy", sol: 0.01 }); assert.equal(r.status, 400); assert.equal((await r.json()).underwater, true); assert.equal(F.sent.length, n0);
  // a double click: two requests at once make one order
  const [a, b] = await Promise.all([M({ positionId: p.id, side: "sell", pct: 100 }), M({ positionId: p.id, side: "sell", pct: 100 })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]); assert.equal(F.sent.length, n0 + 1);
  [p] = await positions(); assert.equal(p.status, "closed"); assert.equal(p.tokens_raw, "0"); assert.ok(Math.abs(p.pnl_sol - (p.proceeds_sol - p.cost_sol)) < 1e-12);
  assert.equal((await M({ positionId: p.id, side: "sell", pct: 50 })).status, 400, "a closed position takes no order");
  // with force, BUY MORE on a loser goes through (fresh position)
  await wipe(); world(); await L.liveTick(env, { minute: 9 }); [p] = await positions(); await d.q(`UPDATE mob_aq_live_positions SET last_value_sol = 0.01`);
  r = await M({ positionId: p.id, side: "buy", sol: 0.01, force: true }); assert.equal(r.status, 200, await r.clone().text()); assert.equal((await positions())[0].tokens_raw, "10000000");
  const live = await (await R("GET", "/api/aq/wallet/live", { cookie })).json(); assert.deepEqual(live.manualPcts, [25, 50, 100]); assert.equal(typeof live.positions[0].pnlPct, "number"); assert.ok(Array.isArray(live.positions[0].spark));
});

test("the timer's side jobs: every 5 minutes the Robinhood gate, twice an hour a read-only Jupiter question", async () => {
  await limits({ autoTrade: false }); const r = await L.liveTick(env, { minute: 30 });
  assert.equal(r.result.refused, "auto_trade_off"); assert.ok(r.robinhood.refused); assert.deepEqual(F.calls, ["quote", "quote"], "two read-only quotes, nothing else");
  assert.deepEqual((await one(`SELECT v FROM mob_aq_state WHERE k='live_probe'`)).v.hosts, { "https://api.jup.ag": 200, "https://lite-api.jup.ag": 200 }); assert.equal(F.sent.length, 0);
});

test("Robinhood: the same gates in USD, the order call is not built, and the US market clock", async () => {
  await d.q(`DELETE FROM mob_aq_state WHERE k LIKE 'rh\\_%'`);
  assert.equal((await L.rhGate(env)).refused, "not_connected");
  await setS("rh_tokens", { sealed: "v1.x.y", since: new Date().toISOString() }); assert.equal((await L.rhGate(env)).refused, "auto_trade_off");
  await setS("rh_limits", { maxPerTradeUsd: 0, maxDailyLossUsd: 50, maxOpenPositions: 2, allowStocks: true, autoTrade: true }); assert.equal((await L.rhGate(env)).refused, "limit_per_trade");
  await setS("rh_limits", { maxPerTradeUsd: 25, maxDailyLossUsd: 50, maxOpenPositions: 2, allowStocks: false, allowCrypto: false, autoTrade: true }); assert.equal((await L.rhGate(env)).refused, "nothing_allowed");
  await setS("rh_limits", { maxPerTradeUsd: 25, maxDailyLossUsd: 50, maxOpenPositions: 2, allowStocks: true, autoTrade: true });
  await setS("kill", true); assert.equal((await L.rhGate(env)).refused, "kill_switch"); await setS("kill", false);
  const g = await L.rhGate(env); assert.equal(g.refused, "orders_not_built"); assert.match(g.reason, /tool list has not been read/);
  assert.deepEqual(await lastRef("robinhood").then((x) => x.gate), "orders_not_built");
  const src = (await import("node:fs")).readFileSync(new URL("../src/aq/live.mjs", import.meta.url), "utf8");
  assert.ok(!/place_|cancel_|equity_order|callRead|tools\/call/.test(src.replace(/^\s*\/\/.*$/gm, "")), "live.mjs has no Robinhood order call of any kind");
  assert.equal(src.split('"sendTransaction"').length - 1, 1); assert.equal(src.split("subtle.sign(").length - 1, 1);
  const s = (await buildState(env)).robinhood; assert.equal(s.liveOrders, false); assert.match(s.ordersNote, /not built yet/); assert.equal(typeof s.market.note, "string");
  assert.deepEqual(usMarket(new Date("2026-11-18T15:00:00Z")), { open: true, note: "US market open" });            // Wed 10:00 New York
  assert.equal(usMarket(new Date("2026-11-18T14:29:00Z")).open, false); assert.equal(usMarket(new Date("2026-11-18T21:00:00Z")).open, false); // 9:29 and 16:00
  assert.match(usMarket(new Date("2026-11-21T16:00:00Z")).note, /weekend/); assert.match(usMarket(new Date("2026-11-26T16:00:00Z")).note, /holiday/);
  assert.equal(usMarket(new Date("2026-11-27T17:59:00Z")).open, true); assert.equal(usMarket(new Date("2026-11-27T18:00:00Z")).open, false, "1:00 p.m. early close");
  assert.equal(usMarket(new Date("2026-07-01T13:30:00Z")).open, true, "summer time: 9:30 New York is 13:30 UTC");
});
