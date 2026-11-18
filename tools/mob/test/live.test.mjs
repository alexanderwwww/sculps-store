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
// a v0 transaction: keys [payer, a random one, and `extra` (the coin's token account on a buy)], no instructions, no lookup tables
const fakeTx = (payer, nsig = 1, extra = null) => { const ex = [extra, ...(F.txExtra || [])].filter(Boolean); const nk = 2 + ex.length, b = new Uint8Array(1 + 64 * nsig + 4 + 1 + 32 * nk + 32 + 1 + 1); b[0] = nsig; let p = 1 + 64 * nsig; b[p++] = 0x80; b[p++] = nsig; b[p++] = 0; b[p++] = 1; b[p++] = nk; b.set(W.unbase58(payer), p); b.set(crypto.getRandomValues(new Uint8Array(32)), p + 32); ex.forEach((k, i) => b.set(W.unbase58(k), p + 64 + 32 * i)); return Buffer.from(b).toString("base64"); };
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
  Object.assign(F, { payer: null, nsig: 1, swapBody: null, balance: 1_000_000_000, quoteFail: false, swapFail: false, jupSim: null, impact: "0.001", simTake: null, simErr: null, send: "ok", sent: [], status: {}, txs: {}, height: 1000, lastValid: 2000, tokensOut: "5000000", sellOut: "60000000", candles: fibCandles(), tokAccts: [], tokPost: {}, mint: { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: { parsed: { type: "mint", info: { freezeAuthority: null, mintAuthority: null, decimals: 5 } } } },
    solUsd: null, priceFail: false, noChart: new Set(), quoteFailIf: null, route: "Meteora", holderSimErr: null, recvTokens: null, ataOwner: null, txExtra: [], rentApart: false, holderOwner: "11111111111111111111111111111111", prices: null, rug: { mintAuthority: null, freezeAuthority: null, rugged: false, risks: [], topHolders: [], markets: [], token: { decimals: 5 } }, calls: [], rowAtSend: null,
    pools: [{ id: "pool1", quoteAsset: SOL, baseAsset: { id: MINT, symbol: "BONK", usdPrice: 0.00002, liquidity: 250000, decimals: 5, firstPool: { createdAt: "2024-01-01T00:00:00Z" }, stats5m: { priceChange: -4 }, audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true } } },
      { id: "pool2", quoteAsset: SOL, baseAsset: { id: NEWMINT, symbol: "NEWP", usdPrice: 1, liquidity: 900000, decimals: 6, firstPool: { createdAt: new Date(Date.now() - 3600e3).toISOString() }, stats5m: { priceChange: -9 } } }] });
  mock("GET", /^https:\/\/datapi\.jup\.ag\/v1\/pools\//, () => ({ pools: F.pools }));
  mock("GET", /^https:\/\/datapi\.jup\.ag\/v2\/charts\//, (c, u) => ([...F.noChart].some((m) => u.pathname.includes(m)) ? new Response("{}", { status: 404 }) : { candles: F.candles }));
  mock("GET", /^https:\/\/api\.rugcheck\.xyz\//, () => F.rug);
  for (const host of ["https://api.jup.ag", "https://lite-api.jup.ag"]) {
    // price/v3: SOL at a price that makes the fake quotes agree with the fake chart (0.05 SOL buys 50 tokens = 0.001 SOL each = 114.6 "USD")
    mock("GET", `${host}/price/v3`, (c, u) => { F.calls.push("price"); if (F.priceFail) return new Response("{}", { status: 503 }); const all = { [SOL]: { usdPrice: F.solUsd ?? F.candles.at(-1).close * 1000, decimals: 9 }, ...(F.prices || {}) }; return Object.fromEntries(u.searchParams.get("ids").split(",").filter((m) => all[m]).map((m) => [m, all[m]])); });
    mock("GET", `${host}/swap/v1/quote`, (c, u) => { F.calls.push("quote"); if (F.quoteFail || F.quoteFailIf?.(u)) return new Response(JSON.stringify({ error: "Could not find any route" }), { status: 400 });
      const buy = u.searchParams.get("inputMint") === SOL, usdc = u.searchParams.get("outputMint").startsWith("EPjFWdd5"), out = usdc ? String(Math.round((F.solUsd ?? F.candles.at(-1).close * 1000) * (Number(u.searchParams.get("amount")) / 1e9) * 1e6)) : buy ? String(Math.round((Number(F.tokensOut) * Number(u.searchParams.get("amount"))) / 5e7)) : F.sellOut;
      return { inputMint: u.searchParams.get("inputMint"), outputMint: u.searchParams.get("outputMint"), inAmount: u.searchParams.get("amount"), outAmount: out, otherAmountThreshold: String(Math.floor(Number(out) * 0.99)), priceImpactPct: F.impact, slippageBps: Number(u.searchParams.get("slippageBps")), routePlan: [{ swapInfo: { label: F.route } }] }; });
    mock("POST", `${host}/swap/v1/swap`, async (c) => { F.calls.push("swap"); const b = JSON.parse(c.body); F.swapBody = b; const ours = b.userPublicKey === wallet?.address; if (F.swapFail && ours) return new Response("{}", { status: 500 });
      return { swapTransaction: fakeTx(F.payer || b.userPublicKey, F.nsig || 1, ours && b.quoteResponse.inputMint === SOL ? await L.ataOf(b.userPublicKey, b.quoteResponse.outputMint) : null), lastValidBlockHeight: F.lastValid, prioritizationFeeLamports: 9555, simulationError: ours ? F.jupSim : null }; });
  }
  mock("POST", "https://mainnet.helius-rpc.com/", async (c) => { const m = JSON.parse(c.body), ok = (result) => ({ jsonrpc: "2.0", id: 1, result }); if (m.method !== "simulateTransaction") F.calls.push(m.method);
    if (m.method === "getBalance") return ok({ context: { slot: 1 }, value: F.balance });
    if (m.method === "getTokenAccountsByOwner") { const f = m.params[1]; return ok({ context: { slot: 1 }, value: F.tokAccts.filter((t) => (f.mint ? t.mint === f.mint : t.program === f.programId)).map((t) => ({ pubkey: t.address, account: { owner: t.program, lamports: 2039280, data: { parsed: { info: { mint: t.mint, tokenAmount: { amount: t.raw ?? "0", decimals: 5 } } } } } })) }); }
    if (m.method === "getBlockHeight") return F.heightFail ? { jsonrpc: "2.0", id: 1, error: { code: -32000, message: "busy" } } : ok(F.height);
    if (m.method === "getTokenLargestAccounts") return ok({ context: { slot: 1 }, value: [{ address: "HolderAcct1111111111111111111111111111111111", amount: "900000000", decimals: 5, uiAmount: 9000, uiAmountString: "9000" }] });
    if (m.method === "getMultipleAccounts") { const [addrs, cfg] = m.params;
      if (cfg.encoding === "jsonParsed") return ok({ context: { slot: 1 }, value: addrs.map(() => ({ owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", lamports: 2039280, data: { parsed: { type: "account", info: { owner: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", mint: MINT } } } })) });
      if (cfg.dataSlice) return ok({ context: { slot: 1 }, value: addrs.map(() => ({ owner: F.holderOwner, lamports: 1e9, data: ["", "base64"] })) });
      return ok({ context: { slot: 1 }, value: addrs.map((a) => { const t = F.tokAccts.find((x) => x.address === a); return t ? { owner: t.program, lamports: 2039280, data: [t.data, "base64"] } : null; }) }); }
    if (m.method === "getAccountInfo") return ok({ context: { slot: 1 }, value: F.mint });
    if (m.method === "getLatestBlockhash") return ok({ context: { slot: 1 }, value: { blockhash: W.base58(new Uint8Array(32).fill(7)), lastValidBlockHeight: 3000 } });
    if (m.method === "getMinimumBalanceForRentExemption") return ok(1488440);
    if (m.method === "simulateTransaction") {
      const ix = L.readIxs(m.params[0]), close = ix.ixs.length === 1 && ix.ixs[0].data[0] === 9;
      if (close) { F.calls.push("simulateTransaction:close"); return ok({ context: { slot: 1 }, value: { err: null, accounts: [{ lamports: F.balance + 1488440 - 5000 }] } }); }
      if (F.swapBody.userPublicKey !== wallet.address) { F.calls.push("simulateTransaction:holder"); return ok({ context: { slot: 1 }, value: { err: F.holderSimErr, accounts: null, logs: [] } }); }
      F.calls.push("simulateTransaction");
      const q = F.swapBody.quoteResponse, coinAta = q.inputMint === SOL ? await L.ataOf(wallet.address, q.outputMint) : null;
      const extra = (m.params[1].accounts.addresses || []).slice(1).map((a) => { if (a === coinAta) return { owner: L.PROG.token, lamports: 1488440, data: [tokData(q.outputMint, F.ataOwner || wallet.address, F.recvTokens ?? q.outAmount), "base64"] }; const t = F.tokAccts.find((x) => x.address === a); const post = F.tokPost[a] !== undefined ? F.tokPost[a] : t?.data; return post == null ? null : { owner: t.program, lamports: 2039280, data: [post, "base64"] }; });
      return ok({ context: { slot: 1 }, value: { err: F.simErr, accounts: [{ lamports: F.balance - (F.simTake ?? (F.swapBody.quoteResponse.inputMint === SOL ? Number(F.swapBody.quoteResponse.inAmount) + 2_050_000 : -Number(F.swapBody.quoteResponse.otherAmountThreshold))) }, ...extra], logs: [] } }); }
    if (m.method === "sendTransaction" && L.readIxs(m.params[0]).ixs[0]?.data[0] === 9) { const sig = W.base58(Buffer.from(m.params[0], "base64").subarray(1, 65)); F.closes = (F.closes || 0) + 1; F.status[sig] = { confirmationStatus: "confirmed", err: null }; return ok(sig); }
    if (m.method === "sendTransaction") { F.sent.push(m.params[0]); F.rowAtSend = await one(`SELECT status, signature FROM mob_aq_live_orders ORDER BY id DESC LIMIT 1`);
      if (F.send === "throw") throw new Error("socket hang up"); if (F.send === "rpcerror") return { jsonrpc: "2.0", id: 1, error: { code: -32002, message: "Transaction simulation failed: Blockhash not found" } };
      const sig = F.rowAtSend.signature, q = F.swapBody.quoteResponse, buy = q.inputMint === SOL; // it lands, exactly as quoted
      if (F.send === "ok") { F.status[sig] = { confirmationStatus: "confirmed", err: null }; F.txs[sig] = landed(buy, q); }
      return ok(sig); }
    if (m.method === "getSignatureStatuses") return ok({ context: { slot: 1 }, value: m.params[0].map((s) => F.status[s] ?? null) });
    if (m.method === "getTransaction") return ok(F.txs[m.params[0]] ?? null);
    return { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } }; });
}
function tokData(mint, owner, amount, extra = 0) { const b = Buffer.alloc(165 + extra); b.set(W.unbase58(mint), 0); b.set(W.unbase58(owner), 32); b.writeBigUInt64LE(BigInt(amount), 64); return b.toString("base64"); }
const landed = (buy, q, err = null) => { const t = landed0(buy, q, err); if (buy && F.rentApart) { t.meta.preBalances.push(0); t.meta.postBalances.push(1488440); t.meta.postTokenBalances[0].accountIndex = 1; } return t; };
const landed0 = (buy, q, err = null) => ({ slot: 5, meta: { err, fee: 14556, preBalances: [F.balance], postBalances: [buy ? F.balance - Number(q.inAmount) - 2_050_000 : F.balance + Number(q.outAmount) - 14556],
  preTokenBalances: buy ? [] : [{ owner: wallet.address, mint: q.inputMint, uiTokenAmount: { amount: q.inAmount } }], postTokenBalances: buy ? [{ owner: wallet.address, mint: q.outputMint, uiTokenAmount: { amount: q.outAmount } }, { owner: "someone-else", mint: q.outputMint, uiTokenAmount: { amount: "999" } }] : [] }, transaction: { message: { accountKeys: [wallet.address, "x"] }, signatures: ["s"] } });
const wipe = async () => { await d.q(`DELETE FROM mob_aq_live_orders`); await d.q(`DELETE FROM mob_aq_live_positions`); await d.q(`DELETE FROM mob_aq_live_refusals`); await d.q(`DELETE FROM mob_aq_market`); await d.q(`DELETE FROM mob_aq_state WHERE k IN ('live_auto_off','live_tick','live_tick_lock')`); await setS("kill", false); await limits(); await rightAll(); };
// symbiote right calls (Alex's rule): the test coins are flagged and checked unless a test says otherwise
const rightAll = async () => { await d.q(`DELETE FROM mob_aq_sym_right`); for (const m of [MINT, NEWMINT]) await d.q(`INSERT INTO mob_aq_sym_right (mint, symbol, status) VALUES ($1, 'T', 'candidate')`, [m]); };
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
  await wipe(); world(); F.pools[0].baseAsset.liquidity = 99000; assert.equal(await gate(), "pool", "a pool under $100K is not an established candidate; the one-hour-old pair is a fresh right call now (Inspector fix 1, 2026-11-18) and is refused for having no liquidity figure");
  await wipe(); world(); F.candles = fibCandles({ tail: [[114.6, 114.1, 9]] }); assert.equal(await gate(), "no_setup"); assert.match((await lastRef()).reason, /no bounce candle yet: a falling knife/);
  await wipe(); world(); F.candles = fibCandles({ tail: [[114.1, 114.6, 9], [114.6, 117, 9], [117, 118, 9]] }); assert.equal(await gate(), "no_setup"); assert.match((await lastRef()).reason, /never chase/);
  await wipe(); world(); F.candles = asJup(chart(Date.now() / 1000 - 900)).candles; assert.equal(await gate(), "stale_data");
  await wipe(); world(); await d.q(`INSERT INTO mob_aq_chat (from_name, text) VALUES ('grok', $1)`, [`VETO ${MINT}: dev wallet is selling`]); assert.equal(await gate(), "veto"); await d.q(`DELETE FROM mob_aq_chat`);
  await d.q(`INSERT INTO mob_aq_chat (from_name, text) VALUES ('grok', $1), ('chatgpt', $2)`, [`I like ${MINT}`, `VETO ${MINT}`]); await wipe(); world(); assert.notEqual(await gate(), "veto", "only Grok, only a message that starts with VETO"); await d.q(`DELETE FROM mob_aq_chat`);
  // cost first: the measured round trip under 1%, and target 1 at least 3x it
  await wipe(); world(); F.sellOut = "49000000"; assert.equal(await gate(), "cost"); assert.match((await lastRef()).reason, /round trip costs 2\.254% \(2% in the quotes \+ 0\.254% fixed SOL fees at 0\.05 SOL\), over 1%/, "61,000 lamports a side x2 + a 5,000-lamport close = 0.254% of 0.05 SOL");
  // a short leg: target 1 is 2.26% away. 0.7% in the quotes + 0.254% fixed fees = 0.954% needs 2.86%: refused for cost, by name
  await wipe(); world(); F.sellOut = "49650000"; F.candles = fibCandles({ legTo: 4, pull: 2, tail: rise(101.45, 101.8) }); assert.equal(await gate(), "cost"); assert.match((await lastRef()).reason, /^Target 1 is 2\.\d+% away, under 3x the 0\.954% round trip \(0\.7% in the quotes/);
  // 0.9% in the quotes alone used to pass the 1% gate; with the fixed fees it is 1.154%: refused
  await wipe(); world(); F.sellOut = "49550000"; F.candles = fibCandles({ legTo: 4, pull: 2, tail: rise(101.45, 101.8) }); assert.equal(await gate(), "cost"); assert.match((await lastRef()).reason, /costs 1\.154%/);
  await wipe(); world(); F.sellOut = "49800000"; F.candles = fibCandles({ legTo: 4, pull: 2, tail: rise(101.45, 101.8) }); assert.equal((await L.liveTick(env, { minute: 1 })).result.confirmed, true, "0.4% + 0.254% clears 3x on the same chart"); await wipe(); world();
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
  assert.equal(p.plan.kind, "fib"); assert.equal(p.plan.chartEntry, 114.6); assert.equal(p.plan.entryFrom, "fill"); assert.ok(Math.abs(p.plan.entry - (0.05205 / 50) * 114600) < 1e-6, "entry = the SOL the buy really cost / the tokens that arrived, in the plan's unit");
  assert.equal(p.plan.source, "right_call"); assert.equal(p.plan.unit, "USD"); assert.equal(p.plan.dec, 5); assert.equal(p.plan.onCurve, false); assert.equal(p.plan.validations.livePrice, true); assert.match(o.reason, /^\[right call\] /); assert.ok(Math.abs(p.plan.stop - (Math.max(p.plan.levels.z786, p.plan.pullLow) - 0.25 * p.plan.leg.atr)) < 1e-4 && p.plan.t1 > 129); assert.equal(p.plan.phase, 0);
  for (const k of ["leg", "pocket", "bounceClose", "pullbackVolumeLower", "notVetoed", "safety", "cost", "impact"]) assert.equal(p.plan.validations[k], true, k);
  assert.ok(p.plan.rtPct < 1 && p.plan.rewardPct > 3 * p.plan.rtPct); assert.match(o.reason, /golden pocket bounce/);
  assert.deepEqual(F.calls.filter((c) => ["simulateTransaction", "sendTransaction"].includes(c)), ["simulateTransaction", "sendTransaction"], "simulated before it was signed and sent");
  // same minute, and later ticks: the coin is held, so nothing is bought and nothing is sent
  const again = await L.liveTick(env, { minute: 1 }); assert.ok(["no_setup", "pool"].includes(again.result.refused), again.result.refused); // the fresh right call (NEWMINT) is looked at too since fix 1 assert.equal(F.sent.length, 1); assert.equal((await orders()).length, 1);
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
    await d.q(`UPDATE mob_aq_live_positions SET plan = plan || jsonb_build_object('since', $1::bigint)`, [cut - (cut % 300)]); await d.q(`DELETE FROM mob_aq_market`); }
  r = await L.liveTick(env, { minute: 4 }); assert.match(r.exits[0].reason, /stop at entry after target 1/, JSON.stringify(r));
  [p] = await positions(); assert.equal(p.status, "closed"); assert.equal(p.tokens_raw, "0"); assert.ok(Math.abs(p.pnl_sol - (p.proceeds_sol - p.cost_sol)) < 1e-12); assert.equal(p.plan.outcome, p.exit_reason);
  assert.equal(F.sent.length, 3); assert.deepEqual((await orders()).map((o) => o.side), ["buy", "sell", "sell"]);
  // exits run with auto trade off and the kill switch on; a sell that fails puts the position back; the chart stop sells at a loss
  await wipe(); world(); await L.liveTick(env, { minute: 1 }); await limits({ autoTrade: false }); await setS("kill", true);
  plan = await scenario((s) => [...flat(114.6, 5), ...flat(s.stop - 0.5, 5)]);
  F.sellOut = "40000000"; F.simErr = { InstructionError: [1, "Custom"] }; let t = await L.liveTick(env, { minute: 5 }); assert.match(t.exits[0].failed, /simulation failed/);
  [p] = await positions(); assert.equal(p.status, "open"); assert.equal(p.sell_fails, 1); assert.equal(F.sent.length, 1);
  F.simErr = null; t = await L.liveTick(env, { minute: 6 }); assert.match(t.exits[0].reason, /^stop: a 5-minute close under the 78.6% stop|^invalidation: a lower low/); assert.equal(t.result.refused, "auto_trade_off"); assert.equal(t.exits[0].confirmed, true, JSON.stringify(t.exits));
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
  assert.equal(p.tokens_raw, "5750000"); assert.ok(Math.abs(p.cost_sol - (cost0 + 0.02 + 0.00205)) < 1e-9); assert.deepEqual(p.plan.levels, plan0.levels); assert.equal(p.status, "open");
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

const CURVEMINT = "7deBYhKWNtXYL6brwF1DcWziqXqE2XLBUgkQq8SCpump"; // a valid 32-byte address, used only as a name inside the fake world
// CURVE MODE: a fresh pump coin still on its bonding curve. Jupiter has no chart for it; symbiote's bars are its candles (in SOL);
// every quote routes through "Pump.fun"; a round trip costs what was measured live on 2026-11-18 (2.79% in the quotes).
const CURVE_TOKENS = 43.63002; // what 0.05 SOL buys at 0.001146 SOL a token (5 decimals)
const symBars = async (cs) => { await d.q(`DELETE FROM mob_aq_sym_bars WHERE mint = $1`, [CURVEMINT]);
  await d.q(`INSERT INTO mob_aq_sym_bars (mint, t, o, h, l, c, v) SELECT $1, t, o, h, l, c, v FROM json_to_recordset($2::json) AS x(t bigint, o float8, h float8, l float8, c float8, v float8)`, [CURVEMINT, JSON.stringify(cs.map((c) => ({ ...c, o: c.o * 1e-5, h: c.h * 1e-5, l: c.l * 1e-5, c: c.c * 1e-5 })))]); };
async function curveWorld({ right = true, keepPools = false } = {}) {
  if (!keepPools) F.pools = []; F.noChart.add(CURVEMINT); F.route = "Pump.fun"; F.tokensOut = "4363002"; F.sellOut = "48605000"; F.solUsd = 75;
  F.prices = { [CURVEMINT]: { usdPrice: 0.001146 * 75, liquidity: 3000, decimals: 5 } };
  await d.q(`DELETE FROM mob_aq_sym_right`); await d.q(`DELETE FROM mob_aq_market`);
  if (right) await d.q(`INSERT INTO mob_aq_sym_right (mint, symbol, status, checked_at, checks) VALUES ($1, 'NEWP', 'candidate', now(), '{"realSol": 40}')`, [CURVEMINT]);
  await symBars(chart(Date.now() / 1000));
}
const curveOut = (px) => String(Math.round(px * CURVE_TOKENS * 1e9)); // the exit quote (lamports) that prices the curve position at px SOL a token
const usdOut = (px) => String(Math.round((px / 114600) * 50 * 1e9));   // the same for the standard USD position (50 tokens, SOL at 114,600)
const planNow = async () => (await one(`SELECT plan FROM mob_aq_live_positions WHERE status IN ('open','stuck','closing') ORDER BY id DESC LIMIT 1`)).plan;
const freeze = async () => { F.candles = asJup(chart(Date.now() / 1000 - 900)).candles; await d.q(`DELETE FROM mob_aq_market`); }; // every source's last bar is 15 minutes old

test("8) two lanes: right calls first, and an established coin may be bought on the market lane without one; a fresh coin never", async () => {
  for (const venue of ["solana", "phantom"]) {
    await wipe(); world(); await d.q(`DELETE FROM mob_aq_sym_right`);
    const mk = await L.scanFib(env, venue, async () => false); assert.equal(mk.c?.mint, MINT, JSON.stringify(mk.refusal)); assert.equal(mk.lane, "market", "no right call: the established coin is a market-lane candidate");
    await d.q(`INSERT INTO mob_aq_sym_right (mint, symbol, status) VALUES ($1, 'BONK', 'flagged')`, [MINT]);
    assert.equal((await L.scanFib(env, venue, async () => false)).lane, "market", "flagged but not deep-checked is not a right call");
    await d.q(`UPDATE mob_aq_sym_right SET status = 'candidate' WHERE mint = $1`, [MINT]);
    const rc = await L.scanFib(env, venue, async () => false); assert.equal(rc.c.mint, MINT); assert.equal(rc.lane, "right_call");
  }
  // the market lane buys, tagged, under the established 1% rules and every gate
  await wipe(); world(); await d.q(`DELETE FROM mob_aq_sym_right`);
  let r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.buy, "BONK"); assert.equal(r.result.confirmed, true, JSON.stringify(r.result)); assert.equal(r.result.source, "market");
  let [p] = await positions(), [o] = await orders(); assert.equal(p.plan.source, "market"); assert.equal(p.plan.fresh, false); assert.match(o.reason, /^\[market\] golden pocket bounce/);
  assert.equal((await L.liveState(d)).positions[0].source, "market", "the ledger shows the lane"); assert.equal((await L.liveState(d)).positions[0].plan.source, "market");
  await wipe(); world(); await d.q(`DELETE FROM mob_aq_sym_right`); F.sellOut = "49000000"; r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.refused, "cost"); assert.match((await lastRef()).reason, /over 1%/, "market lane: the 1% round-trip rule");
  await wipe(); world(); await d.q(`DELETE FROM mob_aq_sym_right`); await d.q(`INSERT INTO mob_aq_chat (from_name, text) VALUES ('grok', $1)`, [`VETO ${MINT}`]); assert.equal((await L.liveTick(env, { minute: 1 })).result.refused, "veto", "market lane: Grok's veto"); await d.q(`DELETE FROM mob_aq_chat`);
  await wipe(); world(); await d.q(`DELETE FROM mob_aq_sym_right`); F.holderSimErr = { InstructionError: [4, { Custom: 6022 }] }; assert.equal((await L.liveTick(env, { minute: 1 })).result.refused, "honeypot", "market lane: the honeypot test");
  // CURVE: a fresh coin with no right call is never a candidate, on any lane
  await wipe(); world(); await curveWorld({ right: false }); r = await L.liveTick(env, { minute: 1 }); assert.ok(["no_candidate", "no_right_call"].includes(r.result.refused), JSON.stringify(r.result)); assert.equal((await orders()).length, 0);
  // both lanes have a setup: the right call is taken first, with its own (curve) rules
  await wipe(); world(); await curveWorld({ keepPools: true }); r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.buy, "NEWP", JSON.stringify(r.result) + JSON.stringify(await lastRef())); assert.equal(r.result.source, "right_call");
  [p] = await positions(); assert.equal(p.plan.source, "right_call"); assert.equal(p.plan.fresh, true); assert.match((await orders())[0].reason, /^\[right call\] /);
  // BUY MORE on a market-lane position does not need a right call (it still needs every other gate)
  await wipe(); world(); await d.q(`DELETE FROM mob_aq_sym_right`); await L.liveTick(env, { minute: 1 }); [p] = await positions();
  const pv = await L.manualPreview(env, { side: "buy", positionId: Number(p.id), sol: 0.01 }); assert.ok(!/right call/.test(pv.error || ""), JSON.stringify(pv));
});

test("1) the stop cannot go blind: every candle source must be fresh, converted or not; a frozen one is never good data (USD and CURVE)", async () => {
  const now = Math.floor(Date.now() / 1000), t = Math.floor(now / 60) * 60 - 120, old = t - 3600;
  const jupAt = (time, px) => { F.candles = [{ time, open: px, high: px, low: px, close: px, volume: 1 }]; return d.q(`DELETE FROM mob_aq_market`); };
  const symAt = async (time) => { await d.q(`DELETE FROM mob_aq_sym_bars WHERE mint = $1`, [CURVEMINT]); if (time) await d.q(`INSERT INTO mob_aq_sym_bars (mint, t, o, h, l, c, v) VALUES ($1, $2, 1, 1, 1, 1, 1)`, [CURVEMINT, time]); };
  const pc = (plan) => L.positionCandles(env, d, { mint: CURVEMINT, plan }, now); F.solUsd = 75;
  // CURVE plan (symbiote, SOL): its own bars frozen AND Jupiter's (the other unit) frozen -> NOT ok. This was returned as good data before.
  await symAt(old); await jupAt(old, 75); let cs = await pc({ src: "symbiote", unit: "SOL" }); assert.equal(cs.ok, false); assert.equal(cs.stale, true);
  // USD plan (Jupiter): Jupiter frozen and symbiote's SOL bars frozen -> NOT ok either
  cs = await pc({ src: "jupiter", unit: "USD" }); assert.equal(cs.ok, false); assert.equal(cs.stale, true);
  // the other source is fresh: used, converted at the SOL price
  await jupAt(t, 75); cs = await pc({ src: "symbiote", unit: "SOL" }); assert.equal(cs.ok, true); assert.equal(cs.converted, true); assert.equal(cs.src, "jupiter"); assert.ok(Math.abs(cs.data.at(-1).c - 1) < 1e-9);
  await jupAt(old, 75); await symAt(t); cs = await pc({ src: "jupiter", unit: "USD" }); assert.equal(cs.ok, true); assert.equal(cs.src, "symbiote"); assert.ok(Math.abs(cs.data.at(-1).c - 75) < 1e-9, "1 SOL at 75 USD");
  // its own source fresh: used as it is
  cs = await pc({ src: "symbiote", unit: "SOL" }); assert.equal(cs.ok, true); assert.equal(cs.converted, undefined); assert.equal(cs.data.at(-1).c, 1);
  // the other source is fresh but there is no SOL price to convert it with: not usable, never mixed raw
  await symAt(old); await jupAt(t, 75); F.priceFail = true; F.quoteFail = true; cs = await pc({ src: "symbiote", unit: "SOL" }); assert.equal(cs.ok, false);
});

test("2) one missed price never sells: frozen candles + no price holds for two ticks and sells on the third; a data outage never widens the slippage", async () => {
  await L.liveTick(env, { minute: 1 }); let [p] = await positions(); assert.equal(p.status, "open"); const n0 = (await orders()).length;
  await freeze();
  // candles frozen, prices fine and above the stop: held, nothing counted
  let r = await L.liveTick(env, { minute: 2 }); [p] = await positions(); assert.equal(p.status, "open"); assert.ok(!p.plan.noPx); assert.equal((await orders()).length, n0);
  // OUTAGE (no candle, no quote, no price API): the exit quote is asked twice, then the price API; one miss holds
  F.quoteFail = true; F.priceFail = true; F.calls.length = 0; r = await L.liveTick(env, { minute: 3 }); [p] = await positions();
  assert.equal(p.status, "open", JSON.stringify(r.exits)); assert.equal(p.plan.noPx, 1); assert.ok(F.calls.filter((c) => c === "quote").length >= 2, "the quote was retried"); assert.ok(F.calls.includes("price"), "the second source was asked"); assert.equal((await orders()).length, n0, "ONE missed price call sells nothing");
  // the price comes back: the count is cleared
  F.quoteFail = false; F.priceFail = false; await L.liveTick(env, { minute: 4 }); [p] = await positions(); assert.equal(p.status, "open"); assert.equal(p.plan.noPx, 0);
  // only the price API is down: the exit quote is the second source, still no miss
  F.priceFail = true; await L.liveTick(env, { minute: 5 }); [p] = await positions(); assert.equal(p.status, "open"); assert.ok(!p.plan.noPx, "the quote for the position's own tokens priced it");
  // three ticks in a row with nothing: the third sells (it cannot land in the outage, and that does NOT widen the slippage)
  F.quoteFail = true;
  await L.liveTick(env, { minute: 6 }); assert.equal((await positions())[0].plan.noPx, 1); await L.liveTick(env, { minute: 7 }); assert.equal((await positions())[0].plan.noPx, 2); assert.equal((await orders()).length, n0);
  r = await L.liveTick(env, { minute: 8 }); assert.match(r.exits[0].reason, /hard stop: no fresh candles and no price from any source for 3 ticks in a row/, JSON.stringify(r.exits));
  [p] = await positions(); let so = (await orders()).at(-1); assert.equal(so.side, "sell"); assert.equal(so.status, "failed"); assert.equal(so.slippage_bps, 150); assert.equal(p.status, "open"); assert.equal(p.sell_fails, 1); assert.ok(!p.plan.slipFails, "an outage is not a slippage failure");
  r = await L.liveTick(env, { minute: 9 }); so = (await orders()).at(-1); assert.equal(so.slippage_bps, 150, "still 1.5% after two failed sells in the outage"); assert.equal((await positions())[0].sell_fails, 2); assert.ok(!(await positions())[0].plan.slipFails);
  // data back, price above the stop: no sale, the count is cleared
  F.quoteFail = false; F.priceFail = false; const n1 = (await orders()).length; await L.liveTick(env, { minute: 10 }); [p] = await positions(); assert.equal(p.status, "open"); assert.equal(p.plan.noPx, 0); assert.equal((await orders()).length, n1);
  // candles still frozen, the live price under the stop: the HARD STOP sells at once. The chain refuses it (simulation): THAT widens the next try
  F.prices = { [MINT]: { usdPrice: p.plan.stop * 0.99, decimals: 5 } }; F.sellOut = usdOut(p.plan.stop * 0.97); F.simErr = { InstructionError: [3, { Custom: 6001 }] };
  r = await L.liveTick(env, { minute: 11 }); assert.match(r.exits[0].reason, /^hard stop: the spot price is at or under the stop/); assert.match(r.exits[0].failed, /simulation failed/);
  [p] = await positions(); assert.equal(p.plan.slipFails, 1); so = (await orders()).at(-1); assert.equal(so.slippage_bps, 150);
  F.simErr = null; r = await L.liveTick(env, { minute: 12 }); so = (await orders()).at(-1); assert.equal(so.slippage_bps, 300, "a real chain/simulator refusal doubles the slippage"); assert.equal(r.exits[0].confirmed, true); assert.equal((await positions())[0].status, "closed");
  assert.equal(L.isChainFail("the chain rejected it (x)"), true); assert.equal(L.isChainFail("the simulation failed (y)"), true); assert.equal(L.isChainFail("the transaction would bring back 0.01 SOL, less than the quoted minimum; not signed"), true);
  for (const e of ["Jupiter did not answer", "Jupiter answered HTTP 503", "Jupiter answered HTTP 400 (Could not find any route)", "it never reached the chain (its time window passed); nothing was spent", "busy"]) assert.equal(L.isChainFail(e), false, e);
  assert.equal(L.LIVE.noPriceTicks, 3);
});

test("2) CURVE: frozen bars on a curve coin: the exit quote's own fee is not read as a fall; a real fall under the stop sells; no price for 3 ticks sells", async () => {
  await curveWorld(); let r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.confirmed, true, JSON.stringify(r.result) + JSON.stringify(await lastRef())); let plan = await planNow(); assert.equal(plan.unit, "SOL");
  await d.q(`UPDATE mob_aq_sym_bars SET t = t - 3600 WHERE mint = $1`, [CURVEMINT]); // symbiote's stream froze an hour ago; Jupiter has no chart
  // the price API is down; the exit quote is the only source. It sits 1.4% under the mid (pump's fee): lifted by half the round trip, it is above the stop
  F.priceFail = true; F.sellOut = curveOut(plan.stop * 1.002); assert.ok(plan.quoteRtPct > 2.7); r = await L.liveTick(env, { minute: 2 }); assert.equal((await positions())[0].status, "open", JSON.stringify(r.exits));
  F.quoteFail = true; await L.liveTick(env, { minute: 3 }); await L.liveTick(env, { minute: 4 }); assert.equal((await positions())[0].plan.noPx, 2); assert.equal((await orders()).length, 1);
  F.quoteFail = false; F.sellOut = curveOut(plan.stop * 0.97); r = await L.liveTick(env, { minute: 5 }); assert.match(r.exits[0].reason, /^hard stop: the spot price is at or under the stop/, JSON.stringify(r.exits)); assert.equal((await positions())[0].status, "closed");
});

test("3) the buy is checked against the LIVE price before signing, and the plan's entry is the real fill price (USD and CURVE)", async () => {
  const s = { entry: 100, stop: 92, t1: 112 };
  assert.equal(L.entryCheck(s, 100.9, 1.5), null); assert.match(L.entryCheck(s, null, 1.5), /could not be read/); assert.match(L.entryCheck(s, 91.9, 50), /at or under the stop/); assert.match(L.entryCheck(s, 112, 50), /at or over target 1/);
  assert.match(L.entryCheck(s, 101.6, 1.5), /1\.6% from the candle entry 100, over the 1\.5% tolerance/); assert.match(L.entryCheck(s, 98.4, 1.5), /-1\.6% from/); assert.equal(L.entryCheck(s, 102.9, 3), null);
  assert.equal(L.pxOf(50000000, "5000000", 5, "SOL"), 0.001); assert.ok(Math.abs(L.pxOf(50000000, "5000000", 5, "USD", 114600) - 114.6) < 1e-9); assert.equal(L.pxOf(50000000, "5000000", 5, "USD", null), null); assert.equal(L.pxOf(5, "0", 5, "SOL"), null); assert.equal(L.pxOf(5, "5", undefined, "SOL"), null);
  assert.deepEqual([L.LIVE.entryTolPct, L.LIVE.freshEntryTolPct], [1.5, 3]);
  const refused = async (prep, re) => { await wipe(); world(); await prep(); const r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.refused, "entry_price", JSON.stringify(r.result)); assert.match((await lastRef()).reason, re); assert.equal((await orders()).length, 0, "refused before any order row"); assert.equal(F.sent.length, 0); assert.equal((await positions()).length, 0); };
  // USD: the quote pays 2% over the candle entry (the price ran while the bar closed): over the 1.5% tolerance
  await refused(() => { F.tokensOut = String(Math.round(5000000 / 1.02)); }, /is 2% from the candle entry 114\.6, over the 1\.5% tolerance/);
  await refused(() => { F.tokensOut = "6000000"; }, /at or under the stop/);       // the quote's price is 16.7% under: below the stop
  await refused(() => { F.tokensOut = "4000000"; }, /at or over target 1/);        // 25% over: above target 1
  await refused(() => { F.priceFail = true; F.quoteFailIf = (u) => u.searchParams.get("outputMint").startsWith("EPj"); }, /could not be read/); // no SOL price from the API or a USDC quote: no USD price, no buy
  // the SOL price API is down but a SOL->USDC quote answers: the second source prices it and the buy goes through
  await wipe(); world(); F.priceFail = true; { const r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.confirmed, true, JSON.stringify(r.result)); assert.equal((await positions())[0].plan.solUsd, 114600, "SOL priced by a 1 SOL -> USDC quote"); }
  // 1.4% over the entry is inside the tolerance: bought, and the entry becomes the REAL fill price
  await wipe(); world(); F.tokensOut = String(Math.round(5000000 / 1.014)); let r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.confirmed, true, JSON.stringify(r.result));
  let [p] = await positions(); const real = (p.cost_sol / (Number(p.tokens_raw) / 1e5)) * 114600;
  assert.ok(Math.abs(p.plan.entry - real) < 1e-6, `entry ${p.plan.entry} is SOL paid / tokens received (${real})`); assert.ok(p.plan.entry > 114.6 * 1.014); assert.equal(p.plan.chartEntry, 114.6); assert.equal(p.plan.entryFrom, "fill"); assert.ok(Math.abs(p.plan.livePx - 114.6 * 1.014) < 0.01);
  // breakeven after target 1 is that real fill price
  const fillEntry = p.plan.entry; F.candles = [...F.candles.slice(0, -1), { ...F.candles.at(-1), close: p.plan.t1 + 0.2, high: p.plan.t1 + 0.3 }]; F.solUsd = 114600; await d.q(`DELETE FROM mob_aq_market`);
  r = await L.liveTick(env, { minute: 2 }); assert.match(r.exits?.[0]?.reason || "", /^target 1/, JSON.stringify(r)); [p] = await positions(); assert.equal(p.plan.phase, 1); assert.equal(p.plan.stop, fillEntry, "stop to entry = the real fill price");
  // CURVE (SOL plan, 3% tolerance: the curve's 1.25% fee is inside the quote's price)
  await wipe(); world(); await curveWorld(); F.tokensOut = String(Math.round(4363002 / 1.035)); r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.refused, "entry_price", JSON.stringify(r.result)); assert.match((await lastRef()).reason, /over the 3% tolerance/);
  await wipe(); world(); await curveWorld(); F.tokensOut = String(Math.round(4363002 / 1.02)); r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.confirmed, true, JSON.stringify(r.result) + JSON.stringify(await lastRef()));
  [p] = await positions(); assert.equal(p.plan.unit, "SOL"); assert.equal(p.plan.src, "symbiote"); assert.equal(p.plan.solUsd, null);
  assert.ok(Math.abs(p.plan.entry - p.cost_sol / (Number(p.tokens_raw) / 1e5)) < 1e-12, "CURVE entry = SOL paid / tokens received, in SOL"); assert.ok(p.plan.entry > 0.001146 * 1.02 && p.plan.entry < 0.00125); assert.ok(Math.abs(p.plan.chartEntry - 0.001146) < 1e-9);
});

test("4) disaster stop: the live exit quote 5% under the stop on two ticks in a row sells without waiting for the 5-minute close (USD and CURVE)", async () => {
  assert.deepEqual([L.LIVE.disasterPct, L.LIVE.disasterTicks], [5, 2]);
  await L.liveTick(env, { minute: 1 }); let plan = await planNow(), n0 = (await orders()).length; // candles stay fresh and above the stop: the chart itself says hold
  F.sellOut = usdOut(plan.stop * 0.96); await L.liveTick(env, { minute: 2 }); let [p] = await positions(); assert.equal(p.status, "open"); assert.ok(!p.plan.dz, "4% under the stop is the normal stop's business (a 5-minute close)");
  F.sellOut = usdOut(plan.stop * 0.94); await L.liveTick(env, { minute: 3 }); [p] = await positions(); assert.equal(p.status, "open"); assert.equal(p.plan.dz, 1, "one tick is not enough"); assert.equal((await orders()).length, n0);
  F.sellOut = usdOut(plan.stop * 1.05); await L.liveTick(env, { minute: 4 }); assert.equal((await positions())[0].plan.dz, 0, "it came back: the count is cleared");
  F.sellOut = usdOut(plan.stop * 0.5); await L.liveTick(env, { minute: 5 }); assert.equal((await positions())[0].plan.dz, 1);
  F.quoteFail = true; await L.liveTick(env, { minute: 6 }); assert.equal((await positions())[0].plan.dz, 1, "an unreadable tick neither counts nor clears"); assert.equal((await positions())[0].status, "open"); F.quoteFail = false;
  const r = await L.liveTick(env, { minute: 7 }); assert.match(r.exits[0].reason, /^disaster stop: the live exit quote \(.+\) is 5% or more under the stop \(.+\) on 2 ticks in a row/, JSON.stringify(r.exits)); assert.equal(r.exits[0].confirmed, true);
  [p] = await positions(); assert.equal(p.status, "closed"); assert.match(p.exit_reason, /^disaster stop/);
  // CURVE: a 50% dump inside one bar on a curve coin (bars still say hold): out on the second tick
  await wipe(); world(); await curveWorld(); let t = await L.liveTick(env, { minute: 1 }); assert.equal(t.result.confirmed, true, JSON.stringify(t.result)); plan = await planNow(); assert.equal(plan.onCurve, true);
  F.sellOut = curveOut(plan.entry * 0.5); t = await L.liveTick(env, { minute: 2 }); assert.equal((await positions())[0].status, "open"); assert.equal((await positions())[0].plan.dz, 1);
  t = await L.liveTick(env, { minute: 3 }); assert.match(t.exits[0].reason, /^disaster stop/); [p] = await positions(); assert.equal(p.status, "closed"); assert.ok(p.pnl_sol < -0.02 && p.pnl_sol > -0.03, "sold about 50% down, two ticks after the dump: " + p.pnl_sol);
});

test("4) the daily budget is honest: the worst case of a position is what its exit can really do; three curve positions do not fit in 0.06 SOL", async () => {
  // established: 8% stop + 5% disaster margin + 1.5% exit slippage + 1% round trip = 15.5%; a fresh curve coin: never under 50%
  assert.ok(Math.abs(L.worstFrac(0.08, 1, false) - 0.155) < 1e-12); assert.equal(L.worstFrac(0.01, 3.05, true), 0.5); assert.ok(Math.abs(L.worstFrac(0.6, 3.05, true) - 0.6955) < 1e-12); assert.equal(L.worstFrac(0.99, 3, true), 1);
  assert.equal(L.LIVE.freshGapLossPct, 50); assert.ok(3 * 0.05 * 0.5 > 0.06, "3 x 0.05 SOL of curve coins can lose 0.075 SOL: over the 0.06 daily limit");
  await limits({ maxDailyLossSol: 0.06, maxOpenPositions: 3 });
  const open = (mint, plan) => d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, tokens_raw, cost_sol, last_value_sol, stop_pct, plan) VALUES ('solana',$1,$1,'open','1000',0.05,0.05,1,$2)`, [mint, JSON.stringify(plan)]);
  const curvePlan = { kind: "fib", fresh: true, source: "right_call", entry: 1, chartEntry: 1, stop: 0.99, t1: 1.2, t2: 1.3, t3: 1.4, phase: 0, since: 0 };
  await open("CurveA", curvePlan); let rk = await L.riskToday(d, 61000); assert.ok(Math.abs(rk.committed + 0.025061) < 1e-9, "one 0.05 SOL curve position commits 0.025 SOL + a fee, whatever its 1% stop says: " + rk.committed);
  await open("CurveB", curvePlan); rk = await L.riskToday(d, 61000); assert.ok(Math.abs(rk.committed + 0.050122) < 1e-9);
  let g = await L.gates(env); assert.equal(g.ok, true); assert.ok(Math.abs(g.budgetLeft - 0.009878) < 1e-9, "0.06 - 2 x 0.025061 = 0.009878 SOL left");
  // an established position commits its stop + margin, not a gap
  await d.q(`DELETE FROM mob_aq_live_positions`); await open("EstA", { ...curvePlan, fresh: false, stop: 0.92 }); rk = await L.riskToday(d, 61000);
  assert.ok(Math.abs(rk.committed - (0.05 * 0.92 * 0.95 * 0.985 - 0.05 - 0.000061)) < 1e-9, "value at (stop less 5%) less 1.5% slippage: " + rk.committed);
  // the third curve buy is sized to what is left: about 0.0198 SOL, not 0.05
  await wipe(); world(); await limits({ maxDailyLossSol: 0.06, maxOpenPositions: 3 }); await curveWorld(); await open("CurveA", curvePlan); await open("CurveB", curvePlan);
  F.quoteFailIf = (u) => /^Curve/.test(u.searchParams.get("inputMint")); // the two stand-in positions have no market: their marks stay where they are
  const r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.confirmed, true, JSON.stringify(r.result) + JSON.stringify(await lastRef()));
  const p = (await positions()).find((x) => x.mint === CURVEMINT); assert.ok(Math.abs(p.plan.sizeSol - 0.019756) < 1e-6, "sized to the budget: " + p.plan.sizeSol); assert.match(p.plan.sizeCappedBy, /daily loss budget/); assert.equal(p.plan.worstPct, 50);
  // and with three open, the committed loss is inside the daily limit
  rk = await L.riskToday(d, 61000); assert.ok(-rk.committed <= 0.06 + 1e-9, "worst case of everything open: " + rk.committed);
});

test("5) CURVE cost gate: the measured 2.79% + 0.264% fixed fees (3.05%) is bought under the 3.5% cap; target 1 must still be 3x the true cost", async () => {
  assert.equal(L.LIVE.freshMaxRtPct, 3.5);
  await curveWorld(); let r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.confirmed, true, JSON.stringify(r.result) + JSON.stringify(await lastRef()));
  let [p] = await positions(); assert.equal(p.plan.quoteRtPct, 2.79); assert.equal(p.plan.rtPct, 3.054); assert.ok(p.plan.rewardPct >= 3 * p.plan.rtPct); assert.equal(p.plan.onCurve, true); assert.deepEqual(p.plan.route, ["Pump.fun"]);
  await wipe(); world(); await curveWorld(); F.sellOut = "48300000"; r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.refused, "cost"); assert.match((await lastRef()).reason, /costs 3\.664% .* over 3\.5%/);
  // a shallow leg: target 1 is under 3x the 3.05% cost -> refused by the same T1 rule
  await wipe(); world(); await curveWorld(); await symBars(chart(Date.now() / 1000, { legTo: 8, pull: 4, tail: rise(103.4, 103.9) })); F.tokensOut = String(Math.round((0.05 / 0.001039) * 1e5));
  r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.refused, "cost", JSON.stringify(r.result) + JSON.stringify(await lastRef())); assert.match((await lastRef()).reason, /^Target 1 is .*under 3x the 3\.054% round trip/);
});

test("6) migration: a curve liquidity figure is never compared with the pool's; the plan is re-based on the pool the tick the route leaves the curve", async () => {
  await curveWorld(); const r0 = await L.liveTick(env, { minute: 1 }); assert.equal(r0.result.confirmed, true, JSON.stringify(r0.result)); let plan = await planNow();
  assert.equal(plan.onCurve, true); assert.equal(plan.liq, 3000, "Jupiter's price API gives a figure on the curve too"); F.sellOut = curveOut(plan.entry);
  const liq = (v) => { F.prices = { [CURVEMINT]: { usdPrice: 0.001146 * 75, liquidity: v, decimals: 5 } }; };
  // on the curve the figure halves (it is the curve's reserves): NOT the pool-drain exit
  liq(1500); let r = await L.liveTick(env, { minute: 2 }); assert.equal((await positions())[0].status, "open", JSON.stringify(r.exits)); assert.equal((await planNow()).liq, 3000);
  // migration: the quote now routes through the pool. Its figure (far from the curve's, either way) becomes the base, no exit
  for (const [first, v] of [[800, 800]]) { F.route = "Pump.fun Amm"; liq(first); r = await L.liveTick(env, { minute: 3 }); plan = await planNow();
    assert.equal((await positions())[0].status, "open", "800 against the curve's 3000 would have been a false -73% exit: " + JSON.stringify(r.exits)); assert.equal(plan.onCurve, false); assert.equal(plan.liq, v); assert.equal(plan.liqAtEntry, 3000); assert.equal(plan.liqBasis, "jupiter"); assert.ok(plan.migratedAt > 0); assert.deepEqual(plan.route, ["Pump.fun Amm"]); }
  liq(700); await L.liveTick(env, { minute: 4 }); assert.equal((await positions())[0].status, "open", "-12.5% of the pool: held");
  liq(500); r = await L.liveTick(env, { minute: 5 }); assert.match(r.exits[0].reason, /lost 30% of its liquidity/, "-37.5% of the POOL's own base: out"); assert.equal((await positions())[0].status, "closed");
  // migrated before the pool has a figure: nothing to compare until the first one arrives, which becomes the base
  await wipe(); world(); await curveWorld(); await L.liveTick(env, { minute: 1 }); plan = await planNow(); F.sellOut = curveOut(plan.entry); F.route = "Pump.fun Amm"; F.prices = { [CURVEMINT]: { usdPrice: 0.001146 * 75, decimals: 5 } };
  await L.liveTick(env, { minute: 2 }); plan = await planNow(); assert.equal(plan.onCurve, false); assert.equal(plan.liq, null); assert.equal((await positions())[0].status, "open");
  liq(900); await L.liveTick(env, { minute: 3 }); assert.equal((await planNow()).liq, 900); liq(600); r = await L.liveTick(env, { minute: 4 }); assert.match(r.exits[0].reason, /lost 30% of its liquidity/);
});

test("7) a Phantom signal's plan carries its lane, candle source, unit and liquidity basis (USD and CURVE)", async () => {
  const sig = async () => { await setS("phantom", { address: wallet.address, seenAt: new Date().toISOString() }); const r = await L.phantomWatch(env); return { r, s: (await one(`SELECT v FROM mob_aq_state WHERE k='phantom_signal'`))?.v }; };
  await d.q(`DELETE FROM mob_aq_state WHERE k = 'phantom_signal'`); let { r, s } = await sig(); assert.equal(r.signal, "BONK", JSON.stringify(r) + JSON.stringify(await lastRef("phantom")));
  assert.equal(s.plan.unit, "USD"); assert.equal(s.plan.src, "jupiter"); assert.equal(s.plan.source, "right_call"); assert.equal(s.source, "right_call"); assert.equal(s.plan.liqBasis, "jupiter"); assert.equal(s.plan.onCurve, false); assert.equal(s.plan.fresh, false); assert.equal(s.plan.dec, 5);
  await wipe(); world(); await curveWorld(); await d.q(`DELETE FROM mob_aq_state WHERE k = 'phantom_signal'`); ({ r, s } = await sig()); assert.equal(r.signal, "NEWP", JSON.stringify(r) + JSON.stringify(await lastRef("phantom")));
  assert.equal(s.plan.unit, "SOL"); assert.equal(s.plan.src, "symbiote"); assert.equal(s.plan.fresh, true); assert.equal(s.plan.onCurve, true); assert.equal(s.plan.liqBasis, "jupiter"); assert.ok(Math.abs(s.plan.entry - 0.001146) < 1e-9, "levels in SOL, as symbiote's bars are");
  // a Phantom position bought on that signal reads candles in ITS unit: Jupiter's USD chart is never read raw against SOL levels
  await d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, tokens_raw, cost_sol, plan, opened_at) VALUES ('phantom',$1,'NEWP','open','4363002',0.05,$2, now())`, [CURVEMINT, JSON.stringify(s.plan)]);
  F.noChart.clear(); F.candles = [{ time: Math.floor(Date.now() / 60000) * 60 - 120, open: 75, high: 75, low: 75, close: 75, volume: 1 }]; await d.q(`DELETE FROM mob_aq_market`); // a USD chart appears, at 75 "USD" = 1 SOL: 870x the SOL levels
  await L.phantomWatch(env); const pp = await one(`SELECT alert, alert_action FROM mob_aq_live_positions WHERE venue = 'phantom'`); assert.equal(pp.alert, null, "no false SELL NOW / target from a chart in another unit: " + pp.alert);
  await d.q(`DELETE FROM mob_aq_state WHERE k IN ('phantom','phantom_signal')`);
});

const ixTx = (payer, program, data, other = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1") => { const msg = Buffer.concat([Buffer.from([1, 0, 1, 3]), Buffer.from(W.unbase58(payer)), Buffer.from(W.unbase58(other)), Buffer.from(W.unbase58(program)), Buffer.alloc(32, 7), Buffer.from([1, 2, 3, 0, 1, 0, data.length]), Buffer.from(data)]);
  return Buffer.concat([Buffer.from([1]), Buffer.alloc(64), msg]).toString("base64"); };

test("audit: pre-sign checks refuse foreign programs and token instructions, and any change to another token account", async () => {
  const T = L.PROG.token;
  assert.match(L.checkIxs(ixTx(wallet.address, T, [3, 1, 0, 0, 0, 0, 0, 0, 0]), wallet.address), /token instruction 3/, "a Transfer is refused");
  assert.match(L.checkIxs(ixTx(wallet.address, T, [6, 2]), wallet.address), /token instruction 6/, "SetAuthority is refused");
  assert.match(L.checkIxs(ixTx(wallet.address, "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", [1]), wallet.address), /outside Jupiter/);
  assert.equal(L.checkIxs(ixTx(wallet.address, T, [17]), wallet.address), null, "SyncNative is allowed");
  assert.match(L.checkIxs(ixTx(wallet.address, T, [9]), wallet.address), /token instruction 9/, "CloseAccount sending the SOL to someone else is refused");
  assert.equal(L.checkIxs(L.closeTx(wallet.address, NEWMINT, T, W.base58(new Uint8Array(32).fill(7))), wallet.address), null, "our own close: rent back to the wallet");
  // another position's token account changes in the simulation: not signed, nothing sent
  const other = "So1idAcct1111111111111111111111111111111111";
  F.tokAccts = [{ address: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", mint: NEWMINT, program: T, raw: "100", data: tokData(NEWMINT, wallet.address, 100) }];
  F.tokPost = { "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1": tokData(NEWMINT, wallet.address, 0) }; void other; F.txExtra = ["5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"];
  await L.liveTick(env, { minute: 1 }); const [o] = await orders(); assert.equal(o.status, "failed"); assert.match(o.error, /change the wallet's .* token account, which this trade does not touch/); assert.equal(F.sent.length, 0);
  // untouched: the buy goes through
  await wipe(); world(); F.tokAccts = [{ address: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", mint: NEWMINT, program: T, raw: "100", data: tokData(NEWMINT, wallet.address, 100) }];
  assert.equal((await L.liveTick(env, { minute: 1 })).result.confirmed, true);
});

test("audit: honeypot and Token-2022 checks before a buy; a fresh right call only; hard caps clamp the panel", async () => {
  const gate = async () => (await L.liveTick(env, { minute: 1 })).result.refused;
  F.holderSimErr = { InstructionError: [4, { Custom: 6022 }] }; assert.equal(await gate(), "honeypot"); assert.match((await lastRef()).reason, /real holder's sale fails/); assert.equal((await orders()).length, 0);
  await wipe(); world(); F.holderOwner = L.PROG.token; assert.equal(await gate(), "honeypot"); assert.match((await lastRef()).reason, /no plain wallet/);
  await wipe(); world(); F.mint = { owner: L.PROG.token22, data: { parsed: { type: "mint", info: { decimals: 5, freezeAuthority: null, extensions: [{ extension: "transferFeeConfig", state: {} }] } } } }; assert.equal(await gate(), "token_program"); assert.match((await lastRef()).reason, /transfer fee/);
  await wipe(); world(); F.mint = { owner: L.PROG.token22, data: { parsed: { type: "mint", info: { freezeAuthority: "Fz11", extensions: [] } } } }; assert.equal(await gate(), "token_program"); assert.match((await lastRef()).reason, /freeze authority/);
  await wipe(); world(); F.mint = { owner: L.PROG.token22, data: { parsed: { type: "mint", info: { decimals: 5, freezeAuthority: null, extensions: [{ extension: "transferHook", state: { authority: "A1", programId: null } }, { extension: "metadataPointer", state: {} }] } } } };
  assert.equal((await L.liveTick(env, { minute: 1 })).result.confirmed, true, "pump-style Token-2022 with an empty hook slot passes");
  // right calls expire: 31 minutes since the check is stale (default TTL 30), a state key changes it
  await wipe(); world(); await d.q(`UPDATE mob_aq_sym_right SET checked_at = now() - interval '31 minutes'`); assert.equal((await L.rightCalls(d)).size, 0, "expired after 30 minutes"); assert.equal((await L.scanFib(env, "solana", async () => false)).lane, "market", "an expired right call is no longer the right-call lane");
  await setS("right_call_ttl_min", 60); await wipe(); world(); await d.q(`UPDATE mob_aq_sym_right SET checked_at = now() - interval '31 minutes'`); assert.equal((await L.rightCalls(d)).has(MINT), true); assert.equal((await L.scanFib(env, "solana", async () => false)).lane, "right_call"); await d.q(`DELETE FROM mob_aq_state WHERE k = 'right_call_ttl_min'`); await rightAll();
  // a panel value above the hard cap (stored before the cap existed) is clamped: the order is 0.05 SOL, not 5
  await wipe(); world(); await limits({ maxPerTradeSol: 5, maxOpenPositions: 9 }); await L.liveTick(env, { minute: 1 }); assert.equal((await orders())[0].in_amount, "50000000"); await limits();
});

test("audit: daily loss counts marked and stop-risk of open positions, and sizes to the budget left", async () => {
  await limits({ maxDailyLossSol: 0.05 });
  // a position marked 0.03 SOL down: realized 0, marked -0.03 counts
  F.sellOut = "20000000"; // the tick marks each held coin at the sell quote: 0.02 SOL for 0.05 = -0.03
  await d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, tokens_raw, cost_sol, last_value_sol, stop_pct) VALUES ('solana','OpenA','A','open','1',0.05,0.02,10)`);
  assert.ok(Math.abs((await L.pnlToday(d)) + 0.03) < 1e-9);
  let rk = await L.riskToday(d, 61000); assert.ok(rk.committed < -0.03, JSON.stringify(rk));
  // another marked loss reaches the limit: refused and auto trade switched off
  await d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, tokens_raw, cost_sol, last_value_sol, stop_pct) VALUES ('solana','OpenB','B','open','1',0.05,0.025,10)`);
  assert.equal((await L.liveTick(env, { minute: 1 })).result.refused, "daily_loss");
  // not at the limit yet, but the stops would take it there: no new trade
  await wipe(); world(); await limits({ maxDailyLossSol: 0.05, maxOpenPositions: 3 });
  await d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, tokens_raw, cost_sol, last_value_sol, stop_pct) VALUES ('solana','OpenC','C','open','1',0.05,0.04,100)`); F.sellOut = "40000000";
  assert.equal((await L.liveTick(env, { minute: 1 })).result.refused, "daily_loss_risk");
  // a small budget left: the buy is sized down to it
  await wipe(); world(); await limits({ maxDailyLossSol: 0.05, maxOpenPositions: 3 });
  await d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, cost_sol, proceeds_sol, pnl_sol, closed_at) VALUES ('solana','L9','L9','closed',0.05,0.0115,-0.0485, now())`);
  await L.liveTick(env, { minute: 1 }); const p = (await positions()).find((x) => x.mint === MINT); assert.ok(p.plan.sizeSol < 0.05, JSON.stringify(p.plan)); assert.match(p.plan.sizeCappedBy, /daily loss budget/);
});

test("audit: rent comes back after a full sale and is booked; the plan is rebased on the fill; a rug exit escalates slippage", async () => {
  // fewer tokens than quoted: the entry is rebased by the same ratio
  F.landTokens = null; await L.liveTick(env, { minute: 1 }); let [p] = await positions(); assert.equal(p.plan.ataCreated, true); assert.equal(p.plan.chartEntry, 114.6); assert.equal(p.plan.fillRatio, 1);
  // full sale, then the empty token account is closed and its rent booked back into the trade
  await d.q(`UPDATE mob_aq_live_orders SET claim = claim || '-z'`); await R("POST", "/api/aq/wallet/sellall", { cookie, body: {} }); [p] = await positions(); assert.equal(p.status, "closed"); const pnl0 = p.pnl_sol;
  F.tokAccts = [{ address: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", mint: MINT, program: L.PROG.token, raw: "0", data: tokData(MINT, wallet.address, 0) }];
  await limits({ autoTrade: false }); const r = await L.liveTick(env, { minute: 2 }); assert.equal(r.rent?.[0]?.booked, true, JSON.stringify(r) + JSON.stringify((await positions())[0].plan.rent));
  [p] = await positions(); assert.equal(p.plan.rent.state, "closed"); assert.ok(Math.abs(p.pnl_sol - (pnl0 + (1488440 - 5000) / 1e9)) < 1e-12); assert.ok(F.calls.includes("simulateTransaction:close"));
  const again = await L.liveTick(env, { minute: 3 }); assert.equal(again.rent, undefined, "booked once");
  // a stop that failed twice is retried at 4x the slippage, recorded on the order
  await wipe(); world(); await limits(); await L.liveTick(env, { minute: 1 }); await scenario((s) => [...flat(114.6, 5), ...flat(s.stop - 0.5, 5)]);
  await d.q(`UPDATE mob_aq_live_positions SET sell_fails = 2, plan = plan || '{"slipFails":2}'::jsonb`); const t = await L.liveTick(env, { minute: 4 });
  const so = (await orders()).at(-1); assert.equal(so.side, "sell"); assert.equal(so.slippage_bps, 600); assert.match(so.reason, /sell slippage 600 bps after 2 sell\(s\) the chain refused/, JSON.stringify(t.exits));
  assert.equal(L.exitBps(9), 2000, "capped at 20%"); assert.equal(L.exitBps(3, false), 150, "a target sale never escalates");
});

test("audit: a sell confirmed but unreadable is settled from the token balance; one the chain never sees fails after 10 minutes", async () => {
  await L.liveTick(env, { minute: 1 }); await scenario((s) => [...flat(114.6, 5), ...flat(s.stop - 0.5, 5)]);
  F.send = "throw"; await L.liveTick(env, { minute: 2 }); let o = (await orders()).at(-1); assert.equal(o.status, "sent");
  F.status[o.signature] = { confirmationStatus: "confirmed", err: null }; // getTransaction keeps answering null
  await L.liveTick(env, { minute: 3 }); assert.equal((await orders()).at(-1).status, "sent", "inside 3 minutes it waits");
  await d.q(`UPDATE mob_aq_live_orders SET sent_at = now() - interval '4 minutes' WHERE id = $1`, [o.id]); F.tokAccts = [];
  await L.liveTick(env, { minute: 4 }); o = (await orders()).at(-1); assert.equal(o.status, "confirmed"); assert.match(o.error, /estimated/); assert.equal((await positions())[0].status, "closed");
  // never seen, RPC height unknown: failed after 10 minutes, the position is open again for its stop
  await wipe(); world(); await L.liveTick(env, { minute: 1 }); await scenario((s) => [...flat(114.6, 5), ...flat(s.stop - 0.5, 5)]); F.send = "throw"; await L.liveTick(env, { minute: 2 });
  o = (await orders()).at(-1); F.heightFail = true; await d.q(`UPDATE mob_aq_live_orders SET sent_at = now() - interval '11 minutes' WHERE id = $1`, [o.id]);
  await L.liveTick(env, { minute: 3 }); assert.equal((await orders()).find((x) => x.id === o.id).status, "failed");
  assert.equal((await orders()).filter((x) => x.side === "sell").length, 2, "the stop acted again in the same run: a new sale was sent"); F.heightFail = false;
});

test("audit: liquidity drain is seen when the coin falls off the lists; the tick lease is renewed and a lost lease stops the buy", async () => {
  await L.liveTick(env, { minute: 1 });
  F.prices = { [MINT]: { usdPrice: 114.6, liquidity: 100000, decimals: 5 } };
  F.pools = F.pools.filter((p) => p.baseAsset.id !== MINT); await d.q(`DELETE FROM mob_aq_market`);
  assert.equal(await L.liqOf(env, MINT), 100000);
  const r = await L.liveTick(env, { minute: 2 }); assert.match(r.exits?.[0]?.reason || "", /lost 30% of its liquidity/, JSON.stringify(r));
  // a run that lost the lease does not claim a slot
  await d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ('live_tick_lock', '{"owner":"x"}'::jsonb, now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, at = now()`);
  assert.equal(await L.renewLock(d, "y"), false); assert.equal(await L.renewLock(d, "x"), true);
  await d.q(`UPDATE mob_aq_state SET v = 'false'::jsonb WHERE k = 'live_tick_lock'`);
});

test("audit: BUY MORE goes through the right-call, veto and safety gates", async () => {
  const M = (body) => R("POST", "/api/aq/wallet/manual", { cookie, body });
  await L.liveTick(env, { minute: 1 }); const [p] = await positions();
  await d.q(`DELETE FROM mob_aq_sym_right`); let r = await M({ positionId: p.id, side: "buy", sol: 0.01 }); assert.equal(r.status, 400); assert.match((await r.json()).error.message, /right call/); await rightAll();
  await d.q(`INSERT INTO mob_aq_chat (from_name, text) VALUES ('grok', $1)`, [`VETO ${MINT}`]); r = await M({ positionId: p.id, side: "buy", sol: 0.01 }); assert.match((await r.json()).error.message, /vetoed/); await d.q(`DELETE FROM mob_aq_chat`);
  F.rug = { ...F.rug, freezeAuthority: "Fz" }; await d.q(`DELETE FROM mob_aq_market`); r = await M({ positionId: p.id, side: "buy", sol: 0.01 }); assert.match((await r.json()).error.message, /Safety/);
  world(); await d.q(`DELETE FROM mob_aq_market`); r = await M({ positionId: p.id, side: "buy", sol: 0.01 }); assert.equal(r.status, 200, await r.clone().text());
});

test("re-audit: SOL may only go to the wallet's own wrapped-SOL account; the buy's tokens must arrive in OUR new account, at least the quote's minimum", async () => {
  const wsol = await L.ataOf(wallet.address, SOL), xfer = [2, 0, 0, 0, 0x80, 0xf0, 0xfa, 0x02, 0, 0, 0, 0];
  assert.match(L.checkIxs(ixTx(wallet.address, L.PROG.system, xfer), wallet.address, wsol), /System instruction other than a transfer from the wallet to its own wrapped-SOL account/, "a transfer to anyone else is refused");
  assert.equal(L.checkIxs(ixTx(wallet.address, L.PROG.system, xfer, wsol), wallet.address, wsol), null, "the wrap into its own wSOL account is allowed");
  assert.match(L.checkIxs(ixTx(wallet.address, L.PROG.system, xfer, wsol), wallet.address, null), /System instruction/, "no wSOL address known: refused");
  F.recvTokens = "100"; await L.liveTick(env, { minute: 1 }); let [o] = await orders(); assert.equal(o.status, "failed"); assert.match(o.error, /100 of the coin's tokens arriving.*under the quote's minimum of 4950000/); assert.equal(F.sent.length, 0);
  await wipe(); world(); F.ataOwner = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"; await L.liveTick(env, { minute: 1 }); [o] = await orders(); assert.match(o.error, /would not belong to the wallet/); assert.equal(F.sent.length, 0);
  // the derived address is the chain's: checked against a real Jupiter swap (wallet 5Q54... wraps into qx84...)
  assert.equal(await L.ataOf("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", SOL), "qx84tiXFKS93Md34ENxNBNu33vPsEJ4BU1o7KYHm6pV");
});

test("re-audit: rent is kept apart from the trade's cost; a token account outside the transaction is not a reason to refuse; an estimated fill books the rent", async () => {
  F.rentApart = true; await L.liveTick(env, { minute: 1 }); let [p] = await positions();
  assert.ok(Math.abs(p.cost_sol - (0.05205 - 0.00148844)) < 1e-12, "cost without the rent"); assert.equal(p.plan.rentSol, 0.00148844); assert.equal(p.plan.ataCreated, true);
  await d.q(`UPDATE mob_aq_live_positions SET last_value_sol = cost_sol`); assert.equal(await L.pnlToday(d), 0, "a flat mark is flat: the rent is not a loss");
  await d.q(`UPDATE mob_aq_live_orders SET claim = claim || '-z'`); await R("POST", "/api/aq/wallet/sellall", { cookie, body: {} }); [p] = await positions(); const pnl0 = p.pnl_sol;
  F.tokAccts = [{ address: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", mint: MINT, program: L.PROG.token, raw: "0", data: tokData(MINT, wallet.address, 0) }];
  await limits({ autoTrade: false }); await L.liveTick(env, { minute: 2 }); [p] = await positions();
  assert.ok(Math.abs(p.pnl_sol - (pnl0 - 0.000005)) < 1e-12, "rent back: only the close's fee touches the trade");
  // a close that can never happen (dust): the rent kept apart is booked as lost, once
  await wipe(); world(); await limits(); F.rentApart = true; await L.liveTick(env, { minute: 1 }); await d.q(`UPDATE mob_aq_live_orders SET claim = claim || '-z'`); await R("POST", "/api/aq/wallet/sellall", { cookie, body: {} });
  [p] = await positions(); const pnl1 = p.pnl_sol; F.tokAccts = [{ address: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", mint: MINT, program: L.PROG.token, raw: "7", data: tokData(MINT, wallet.address, 7) }];
  await limits({ autoTrade: false }); await L.liveTick(env, { minute: 2 }); await L.liveTick(env, { minute: 3 }); [p] = await positions();
  assert.equal(p.plan.rent.state, "dust"); assert.ok(Math.abs(p.pnl_sol - (pnl1 - 0.00148844)) < 1e-12); assert.equal(p.plan.rentLost, true);
  // a buy confirmed but unreadable: settled from the token balance, the new account's lamports are its rent, kept apart
  await wipe(); world(); await limits(); F.send = "throw"; await L.liveTick(env, { minute: 1 }); let o = (await orders()).at(-1); F.status[o.signature] = { confirmationStatus: "confirmed", err: null };
  F.tokAccts = [{ address: await L.ataOf(wallet.address, MINT), mint: MINT, program: L.PROG.token, raw: "5000000", data: tokData(MINT, wallet.address, 5000000) }];
  await d.q(`UPDATE mob_aq_live_orders SET sent_at = now() - interval '4 minutes'`); await limits({ autoTrade: false }); await L.liveTick(env, { minute: 2 });
  [p] = await positions(); o = (await orders())[0]; assert.equal(o.status, "confirmed"); assert.equal(p.status, "open"); assert.equal(p.plan.ataCreated, true); assert.equal(p.plan.rentSol, 0.00203928);
  assert.ok(Math.abs(p.cost_sol - 0.050005) < 1e-12, "the swap and its fee; the rent apart");
});
