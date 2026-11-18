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
// both lanes ON unless a test says otherwise (the server's own default is market ON, right call OFF: test "A)")
const limits = (o = {}) => setS("sol_wallet_limits", { maxPerTradeSol: 0.05, maxDailyLossSol: 0.2, maxOpenPositions: 2, autoTrade: true, lanes: { market: true, rightCall: true }, ...o });
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
    solUsd: null, priceFail: false, quoteDown: false, quoteDownIf: null, tokFail: false, rpcDeaf: null, rpcLimited: null, publicUp: false, noChart: new Set(), quoteFailIf: null, route: "Meteora", holderSimErr: null, recvTokens: null, ataOwner: null, txExtra: [], rentApart: false, holderOwner: "11111111111111111111111111111111", prices: null, rug: { mintAuthority: null, freezeAuthority: null, rugged: false, risks: [], topHolders: [], markets: [], token: { decimals: 5 } }, calls: [], rowAtSend: null,
    pools: [{ id: "pool1", quoteAsset: SOL, baseAsset: { id: MINT, symbol: "BONK", usdPrice: 0.00002, liquidity: 250000, decimals: 5, firstPool: { createdAt: "2024-01-01T00:00:00Z" }, stats5m: { priceChange: -4 }, audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true } } },
      { id: "pool2", quoteAsset: SOL, baseAsset: { id: NEWMINT, symbol: "NEWP", usdPrice: 1, liquidity: 900000, decimals: 6, firstPool: { createdAt: new Date(Date.now() - 3600e3).toISOString() }, stats5m: { priceChange: -9 } } }] });
  mock("GET", /^https:\/\/datapi\.jup\.ag\/v1\/pools\//, () => ({ pools: F.pools }));
  mock("GET", /^https:\/\/datapi\.jup\.ag\/v2\/charts\//, (c, u) => ([...F.noChart].some((m) => u.pathname.includes(m)) ? new Response("{}", { status: 404 }) : { candles: F.candles }));
  mock("GET", /^https:\/\/api\.rugcheck\.xyz\//, () => F.rug);
  for (const host of ["https://api.jup.ag", "https://lite-api.jup.ag"]) {
    // price/v3: SOL at a price that makes the fake quotes agree with the fake chart (0.05 SOL buys 50 tokens = 0.001 SOL each = 114.6 "USD")
    mock("GET", `${host}/price/v3`, (c, u) => { F.calls.push("price"); if (F.priceFail) return new Response("{}", { status: 503 }); const all = { [SOL]: { usdPrice: F.solUsd ?? F.candles.at(-1).close * 1000, decimals: 9 }, ...(F.prices || {}) }; return Object.fromEntries(u.searchParams.get("ids").split(",").filter((m) => all[m]).map((m) => [m, all[m]])); });
    mock("GET", `${host}/swap/v1/quote`, (c, u) => { F.calls.push("quote"); if (F.quoteDown || F.quoteDownIf?.(u)) return new Response("{}", { status: 503 }); if (F.quoteFail || F.quoteFailIf?.(u)) return new Response(JSON.stringify({ error: "Could not find any route" }), { status: 400 });
      const buy = u.searchParams.get("inputMint") === SOL, usdc = u.searchParams.get("outputMint").startsWith("EPjFWdd5"), out = usdc ? String(Math.round((F.solUsd ?? F.candles.at(-1).close * 1000) * (Number(u.searchParams.get("amount")) / 1e9) * 1e6)) : buy ? String(Math.round((Number(F.tokensOut) * Number(u.searchParams.get("amount"))) / 5e7)) : F.sellOut;
      return { inputMint: u.searchParams.get("inputMint"), outputMint: u.searchParams.get("outputMint"), inAmount: u.searchParams.get("amount"), outAmount: out, otherAmountThreshold: String(Math.floor(Number(out) * 0.99)), priceImpactPct: F.impact, slippageBps: Number(u.searchParams.get("slippageBps")), routePlan: [{ swapInfo: { label: F.route } }] }; });
    mock("POST", `${host}/swap/v1/swap`, async (c) => { F.calls.push("swap"); const b = JSON.parse(c.body); F.swapBody = b; const ours = b.userPublicKey === wallet?.address; if (F.swapFail && ours) return new Response("{}", { status: 500 });
      return { swapTransaction: fakeTx(F.payer || b.userPublicKey, F.nsig || 1, ours && b.quoteResponse.inputMint === SOL ? await L.ataOf(b.userPublicKey, b.quoteResponse.outputMint) : null), lastValidBlockHeight: F.lastValid, prioritizationFeeLamports: 9555, simulationError: ours ? F.jupSim : null }; });
  }
  // the main RPC (Helius) can be made deaf for one method a number of times (F.rpcDeaf = {method: n}); the public node answers only when F.publicUp
  // F.rpcLimited = {method: n}: the main RPC answers "rate limited" (HTTP 429) n times. The second RPC (the first of live.mjs RPC2) answers only when F.publicUp;
  // it takes a sendTransaction without running the fake chain a second time (the same signature can only land once).
  mock("POST", "https://mainnet.helius-rpc.com/", async (c) => { const m0 = JSON.parse(c.body).method; if (F.rpcDeaf?.[m0] > 0) { F.rpcDeaf[m0]--; F.calls.push("deaf:" + m0); throw new Error("socket hang up"); }
    if (F.rpcLimited?.[m0] > 0) { F.rpcLimited[m0]--; F.calls.push("limited:" + m0); return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32429, message: "rate limited" } }), { status: 429 }); } return rpcH(c); });
  mock("POST", "https://public.rpc.solanavibestation.com", async (c) => { const m = JSON.parse(c.body); if (!F.publicUp) throw new Error("down"); F.calls.push("public:" + m.method);
    if (m.method === "sendTransaction") return { jsonrpc: "2.0", id: 1, result: W.base58(Buffer.from(m.params[0], "base64").subarray(1, 65)) }; return rpcH(c); });
  const rpcH = async (c) => { const m = JSON.parse(c.body), ok = (result) => ({ jsonrpc: "2.0", id: 1, result }); if (m.method !== "simulateTransaction") F.calls.push(m.method);
    if (m.method === "getBalance") return ok({ context: { slot: 1 }, value: F.balance });
    if (m.method === "getTokenAccountsByOwner") { if (F.tokFail) return { jsonrpc: "2.0", id: 1, error: { code: -32000, message: "busy" } }; const f = m.params[1]; return ok({ context: { slot: 1 }, value: F.tokAccts.filter((t) => (f.mint ? t.mint === f.mint : t.program === f.programId)).map((t) => ({ pubkey: t.address, account: { owner: t.program, lamports: 2039280, data: { parsed: { info: { mint: t.mint, tokenAmount: { amount: t.raw ?? "0", decimals: 5 } } } } } })) }); }
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
      if (close) { F.calls.push("simulateTransaction:close"); return ok({ context: { slot: 1 }, value: { err: F.closeSimErr || null, accounts: [{ lamports: F.balance + 1488440 - 5000 }] } }); }
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
    return { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } }; };
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
  F.height = F.lastValid + 50; r = await L.liveTick(env, { minute: 1 }); assert.equal((await orders())[0].status, "sent", "ONE empty read past the window is not final");
  F.height += 5; await L.liveTick(env, { minute: 1 }); assert.equal((await orders())[0].status, "sent", "the second read must be some blocks later");
  F.height += 30; F.calls.length = 0; r = await L.liveTick(env, { minute: 1 }); [o] = await orders(); [p] = await positions(); assert.ok(F.calls.includes("getTokenAccountsByOwner"), "the wallet was looked at before it was called failed");
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
  await wipe(); world(); await L.liveTick(env, { minute: 1 }); await d.q(`UPDATE mob_aq_live_orders SET claim = claim || '-z' || id WHERE claim NOT LIKE '%-z%'`);
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
  const w1 = await (await P({ positionId: p.id, side: "buy", sol: 0.02 })).json(); assert.equal(w1.underwater, true); assert.match(w1.warning, /never add to a loser/);
  r = await M({ positionId: p.id, side: "buy", sol: 0.02 }); assert.equal(r.status, 400); assert.equal((await r.json()).underwater, true); assert.equal(F.sent.length, n0);
  // a double click: two requests at once make one order
  const [a, b] = await Promise.all([M({ positionId: p.id, side: "sell", pct: 100 }), M({ positionId: p.id, side: "sell", pct: 100 })]);
  // one is done; the other is refused: "busy" (409) while the first holds the lock, or "that position is closed" (400) when it arrives a moment later
  { const st = [a.status, b.status].sort(); assert.equal(st[0], 200); assert.ok(st[1] === 409 || st[1] === 400, "the second click was refused: " + st[1]); } assert.equal(F.sent.length, n0 + 1, "one sale, never two");
  [p] = await positions(); assert.equal(p.status, "closed"); assert.equal(p.tokens_raw, "0"); assert.ok(Math.abs(p.pnl_sol - (p.proceeds_sol - p.cost_sol)) < 1e-12);
  assert.equal((await M({ positionId: p.id, side: "sell", pct: 50 })).status, 400, "a closed position takes no order");
  // with force, BUY MORE on a loser goes through (fresh position)
  await wipe(); world(); await L.liveTick(env, { minute: 9 }); [p] = await positions(); await d.q(`UPDATE mob_aq_live_positions SET last_value_sol = 0.01`);
  r = await M({ positionId: p.id, side: "buy", sol: 0.02, force: true }); assert.equal(r.status, 200, await r.clone().text()); assert.equal((await positions())[0].tokens_raw, "7000000");
  const live = await (await R("GET", "/api/aq/wallet/live", { cookie })).json(); assert.deepEqual(live.manualPcts, [25, 50, 100]); assert.equal(typeof live.positions[0].pnlPct, "number"); assert.ok(Array.isArray(live.positions[0].spark));
});

test("the timer's side jobs: every 5 minutes the Robinhood gate, twice an hour a read-only Jupiter question", async () => {
  await limits({ autoTrade: false }); const r = await L.liveTick(env, { minute: 30 });
  assert.equal(r.result.refused, "auto_trade_off"); assert.ok(r.robinhood.refused); assert.deepEqual(F.calls.filter((c) => c !== "getTokenAccountsByOwner"), ["quote", "quote"], "two read-only quotes and the 5-minute look at the wallet's own token accounts, nothing else");
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
  await d.q(`UPDATE mob_aq_sym_bars SET t = t - 10800 WHERE mint = $1`, [CURVEMINT]); // symbiote's stream froze three hours ago (a shift longer than the bars' own span, so no two rows ever share a minute); Jupiter has no chart
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
  // the third curve buy is sized to what is left: about 0.0195 SOL, not 0.05
  await wipe(); world(); await limits({ maxDailyLossSol: 0.06, maxOpenPositions: 3 }); await curveWorld(); await open("CurveA", curvePlan); await open("CurveB", curvePlan);
  F.quoteDownIf = (u) => /^Curve/.test(u.searchParams.get("inputMint")); F.noChart.add("CurveA"); F.noChart.add("CurveB"); // the two stand-in positions have no market and no chart: their marks stay where they are
  const r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.confirmed, true, JSON.stringify(r.result) + JSON.stringify(await lastRef()));
  const p = (await positions()).find((x) => x.mint === CURVEMINT); assert.ok(Math.abs(p.plan.sizeSol - (0.009878 - 2 * 61000 / 1e9) / 0.5) < 2e-6, "sized to the budget left after its own two network fees, 0.019512 SOL: " + p.plan.sizeSol); assert.match(p.plan.sizeCappedBy, /daily loss budget/); assert.equal(p.plan.worstPct, 50);
  // and with three open, the committed loss is inside the daily limit
  rk = await L.riskToday(d, 61000); assert.ok(-rk.committed <= 0.06 + 0.00205 + 1e-9, "worst case of everything open is the daily limit (plus the 2,050,000 lamports this fake chain charges a buy; a real one is inside the fee allowance): " + rk.committed);
});

test("5) CURVE cost gate: the measured 2.79% + 0.254% fixed fees (3.04%) is bought under the 3.5% cap; target 1 must still be 3x the true cost", async () => {
  assert.equal(L.LIVE.freshMaxRtPct, 3.5);
  await curveWorld(); let r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.confirmed, true, JSON.stringify(r.result) + JSON.stringify(await lastRef()));
  let [p] = await positions(); assert.equal(p.plan.quoteRtPct, 2.79); assert.equal(p.plan.rtPct, 3.044); assert.ok(p.plan.rewardPct >= 3 * p.plan.rtPct); assert.equal(p.plan.onCurve, true); assert.deepEqual(p.plan.route, ["Pump.fun"]);
  await wipe(); world(); await curveWorld(); F.sellOut = "48300000"; r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.refused, "cost"); assert.match((await lastRef()).reason, /costs 3\.654% .* over 3\.5%/);
  // a shallow leg: target 1 is under 3x the 3.05% cost -> refused by the same T1 rule
  await wipe(); world(); await curveWorld(); await symBars(chart(Date.now() / 1000, { legTo: 4, pull: 2, tail: rise(101.45, 101.8) })); F.tokensOut = String(Math.round((0.05 / 0.001018) * 1e5));
  r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.refused, "cost", JSON.stringify(r.result) + JSON.stringify(await lastRef())); assert.match((await lastRef()).reason, /^Target 1 is .*under 3x the 3\.044% round trip/);
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

test("A) lane switches in the live settings: default market ON / right call OFF; with right call off a fresh coin is never bought and the refusal says so", async () => {
  assert.deepEqual(L.lanesOf({}), { market: true, rightCall: false }); assert.deepEqual(L.lanesOf(null), { market: true, rightCall: false }); assert.deepEqual(L.lanesOf({ lanes: { market: false, rightCall: true } }), { market: false, rightCall: true });
  // the settings route's validator: lanes are booleans, only these two, a lane left out keeps its setting
  const V = W.validateWalletLimits; assert.deepEqual(V({ lanes: { rightCall: true } }, { maxPerTradeSol: 0.05 }).limits.lanes, { market: true, rightCall: true });
  assert.deepEqual(V({ lanes: { market: false } }, { lanes: { market: true, rightCall: true } }).limits.lanes, { market: false, rightCall: true }); assert.equal(V({ maxPerTradeSol: 0.01 }, { lanes: { market: false, rightCall: true } }).limits.lanes.market, false, "untouched by other edits");
  assert.match(V({ lanes: { market: "yes" } }).error, /must be on or off/); assert.match(V({ lanes: { curve: true } }).error, /is not a lane/); assert.match(V({ lanes: true }).error, /lanes must be/);
  const r0 = await (await R("POST", "/api/aq/wallet/limits", { cookie, body: { lanes: { rightCall: false } } })).json(); assert.equal(r0.limits.lanes.rightCall, false); assert.equal((await R("POST", "/api/aq/wallet/limits", { bearer: env.MOB_API_TOKEN, body: { lanes: { rightCall: true } } })).status, 403, "Alex only");
  // DEFAULT (no lanes stored): a fresh right call with a perfect setup is NOT bought; the refusal says the lane is off
  const dflt = () => setS("sol_wallet_limits", { maxPerTradeSol: 0.05, maxDailyLossSol: 0.2, maxOpenPositions: 2, autoTrade: true });
  await wipe(); world(); await dflt(); await curveWorld(); let r = await L.liveTick(env, { minute: 1 });
  assert.equal(r.result.refused, "lane_off", JSON.stringify(r.result)); assert.match(r.result.reason, /right-call lane is OFF in the live settings: 1 fresh right call\(s\) from symbiote were not looked at, a fresh coin is never bought while it is off/);
  assert.equal((await lastRef()).gate, "lane_off"); assert.equal((await orders()).length, 0); assert.equal((await positions()).length, 0); assert.deepEqual((await L.liveState(d)).lanes, { market: true, rightCall: false });
  // default, both kinds present: the established coin is bought on the market lane, the fresh one is left, and that is on record
  await wipe(); world(); await dflt(); await curveWorld({ keepPools: true }); F.sellOut = "60000000"; F.tokensOut = "5000000"; F.route = "Meteora"; F.solUsd = null; r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.buy, "BONK", JSON.stringify(r.result)); assert.equal(r.result.source, "market");
  assert.ok(await one(`SELECT 1 FROM mob_aq_live_refusals WHERE gate = 'lane_off' AND venue = 'solana'`), "the skipped fresh right call is written down");
  // default: an established coin that ALSO has a right call is a market coin under the 1% rules
  await wipe(); world(); await dflt(); r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.source, "market"); assert.equal((await positions())[0].plan.source, "market");
  // the same world with the lane ON buys the fresh coin
  await wipe(); world(); await curveWorld(); r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.buy, "NEWP", JSON.stringify(r.result)); assert.equal(r.result.source, "right_call");
  // market OFF, right call ON: an established coin with no right call is not bought
  await wipe(); world(); await limits({ lanes: { market: false, rightCall: true } }); await d.q(`DELETE FROM mob_aq_sym_right`); r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.refused, "no_right_call"); assert.match(r.result.reason, /market lane is OFF/); assert.equal((await orders()).length, 0);
  // both OFF
  await wipe(); world(); await limits({ lanes: { market: false, rightCall: false } }); r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.refused, "lanes_off"); assert.equal((await orders()).length, 0);
  // the Phantom signal obeys the same switches
  await wipe(); world(); await dflt(); await curveWorld(); await setS("phantom", { address: wallet.address, seenAt: new Date().toISOString() }); await d.q(`DELETE FROM mob_aq_state WHERE k = 'phantom_signal'`);
  assert.equal((await L.phantomWatch(env)).signal, null); assert.equal((await lastRef("phantom")).gate, "lane_off"); await d.q(`DELETE FROM mob_aq_state WHERE k IN ('phantom','phantom_signal')`);
});

test("B) the scan rotates: every candidate gets its turn across ticks, right calls first when that lane is on", async () => {
  const many = () => { F.pools = Array.from({ length: 10 }, (_, i) => ({ id: `pool${i}`, quoteAsset: SOL, baseAsset: { id: `Est${i}`, symbol: `E${i}`, usdPrice: 1, liquidity: 250000 - i, decimals: 5, firstPool: { createdAt: "2024-01-01T00:00:00Z" }, audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true } } })); };
  const look = async (venue = "solana") => { const seen = []; const r = await L.scanFib(env, venue, async (mint, s) => { if (!s) { seen.push(mint); return false; } return true; }); assert.ok(!r.c); return seen; }; // every leg "taken": nothing is ever returned
  await wipe(); world(); many(); await d.q(`DELETE FROM mob_aq_sym_right`); await d.q(`DELETE FROM mob_aq_state WHERE k LIKE 'live_scan_cursor%'`);
  const t1 = await look(), t2 = await look(), t3 = await look(), t4 = await look();
  assert.deepEqual(t1, ["Est0", "Est1", "Est2", "Est3"]); assert.deepEqual(t2, ["Est4", "Est5", "Est6", "Est7"], "the second tick goes on where the first stopped"); assert.deepEqual(t3, ["Est8", "Est9", "Est0", "Est1"], "and wraps"); assert.deepEqual(t4, ["Est2", "Est3", "Est4", "Est5"]);
  assert.equal(new Set([...t1, ...t2, ...t3]).size, 10, "all ten candidates were looked at inside three ticks");
  assert.deepEqual(await look("phantom"), ["Est0", "Est1", "Est2", "Est3"], "each venue keeps its own place");
  // a coin that left the lists does not stall the scan: it starts again from the top
  await setS("live_scan_cursor:solana", { mk: "Gone" }); assert.deepEqual(await look(), ["Est0", "Est1", "Est2", "Est3"]);
  // right calls first: two right calls are looked at every tick, the market coins rotate behind them
  await d.q(`DELETE FROM mob_aq_state WHERE k LIKE 'live_scan_cursor%'`); for (const m of ["Est7", "Est8"]) await d.q(`INSERT INTO mob_aq_sym_right (mint, symbol, status) VALUES ($1, 'T', 'candidate')`, [m]);
  const a = await look(), b = await look(); assert.deepEqual(a.slice(0, 2).sort(), ["Est7", "Est8"]); assert.deepEqual(a.slice(2), ["Est0", "Est1"]); assert.deepEqual(b.slice(0, 2).sort(), ["Est7", "Est8"]); assert.deepEqual(b.slice(2), ["Est2", "Est3"]);
  // five right calls: three looks for them (rotating), one always kept for the market lane
  for (const m of ["Est0", "Est1", "Est2"]) await d.q(`INSERT INTO mob_aq_sym_right (mint, symbol, status) VALUES ($1, 'T', 'candidate')`, [m]); await d.q(`DELETE FROM mob_aq_state WHERE k LIKE 'live_scan_cursor%'`);
  const c = await look(), e = await look(); assert.deepEqual(c, ["Est0", "Est1", "Est2", "Est3"]); assert.deepEqual(e, ["Est7", "Est8", "Est0", "Est4"], "right calls rotate among themselves; the market lane moved on to its next coin");
  // with the right-call lane OFF the same coins are all market coins, in the list's own order
  await limits({ lanes: { market: true, rightCall: false } }); await d.q(`DELETE FROM mob_aq_state WHERE k LIKE 'live_scan_cursor%'`); assert.deepEqual(await look(), ["Est0", "Est1", "Est2", "Est3"]);
});

test("C) a buy that failed before anything was sent does not burn the leg: retried with a fresh quote, three times at most; a sent buy does burn it", async () => {
  F.swapFail = true; let r = await L.liveTick(env, { minute: 1 }); assert.match(r.result.failed, /HTTP 500/); let ps = await positions(); assert.equal(ps[0].status, "failed"); assert.equal((await orders())[0].signature, null);
  // the next tick tries the SAME leg again, with a new quote, and buys
  F.swapFail = false; F.calls.length = 0; await d.q(`UPDATE mob_aq_live_orders SET claim = claim || '-z' || id WHERE claim NOT LIKE '%-z%'`); r = await L.liveTick(env, { minute: 2 }); // (the order's one-time key holds the real clock minute: a tick a minute later, as in production) assert.equal(r.result.confirmed, true, JSON.stringify(r.result) + JSON.stringify(await lastRef())); assert.ok(F.calls.filter((x) => x === "quote").length >= 2, "fresh quotes");
  ps = await positions(); assert.equal(ps.length, 2); assert.equal(ps[1].status, "open"); assert.equal(ps[1].plan.leg.highT, ps[0].plan.leg.highT, "the same leg");
  // bounded: three failed tries, then the leg is left alone
  await wipe(); world(); F.jupSim = { error: "custom program error" };
  for (const m of [1, 2, 3]) { await d.q(`UPDATE mob_aq_live_orders SET claim = claim || '-z' || id WHERE claim NOT LIKE '%-z%'`); r = await L.liveTick(env, { minute: m }); assert.match(r.result.failed || "", /Jupiter's own simulation failed/, JSON.stringify(r.result)); }
  r = await L.liveTick(env, { minute: 4 }); assert.equal(r.result.refused, "same_leg", JSON.stringify(r.result)); assert.match(r.result.reason, /its buy failed 3 times before anything was sent/); assert.equal((await positions()).length, 3); assert.equal(F.sent.length, 0);
  F.jupSim = null; r = await L.liveTick(env, { minute: 5 }); assert.equal(r.result.refused, "same_leg", "still refused once the three tries are used");
  // a buy that WAS signed and sent, and the chain rejected: that leg is burned at once
  await wipe(); world(); F.send = "throw"; await L.liveTick(env, { minute: 1 }); const [o] = await orders(); F.status[o.signature] = { confirmationStatus: "confirmed", err: { InstructionError: [2, "Custom"] } };
  await L.liveTick(env, { minute: 2 }); assert.equal((await positions())[0].status, "failed"); F.send = "ok"; await d.q(`UPDATE mob_aq_live_orders SET claim = claim || '-z' || id WHERE claim NOT LIKE '%-z%'`); r = await L.liveTick(env, { minute: 3 }); assert.equal(r.result.refused, "same_leg"); assert.equal((await positions()).length, 1);
  // a leg that was really traded (stopped out) is still traded once
  await wipe(); world(); await L.liveTick(env, { minute: 1 }); await d.q(`UPDATE mob_aq_live_positions SET status = 'closed', closed_at = now(), pnl_sol = -0.001`); r = await L.liveTick(env, { minute: 2 }); assert.equal(r.result.refused, "same_leg");
});

test("D) a dead position: no sell route marks it at 0 at once, and 24 hours of that writes it off once, on that day, and frees the slot", async () => {
  assert.equal(L.LIVE.deadAfterHours, 24); await limits({ maxOpenPositions: 1, maxDailyLossSol: 0.2 });
  await L.liveTick(env, { minute: 1 }); let [p] = await positions(); const cost = p.cost_sol; assert.equal(p.status, "open");
  // an OUTAGE (Jupiter does not answer) leaves the mark alone
  await L.liveTick(env, { minute: 2 }); assert.ok(Math.abs((await positions())[0].last_value_sol - 0.06) < 1e-9);
  F.quoteDown = true; await L.liveTick(env, { minute: 3 }); [p] = await positions(); assert.ok(Math.abs(p.last_value_sol - 0.06) < 1e-9, "no answer is not 'worth nothing'"); assert.ok(!p.plan.noRouteSince); F.quoteDown = false;
  // Jupiter ANSWERS "no route": worth 0 now, so the loss is not understated; not written off yet
  F.quoteFail = true; let r = await L.liveTick(env, { minute: 4 }); [p] = await positions(); assert.equal(p.status, "open"); assert.equal(p.last_value_sol, 0); assert.ok(p.plan.noRouteSince > 0);
  assert.ok(Math.abs((await L.pnlToday(d)) + cost) < 1e-9, "today's loss counts the whole position"); assert.equal(r.result.refused, "max_open", "its slot is still taken");
  // the route comes back: marked again, the clock is cleared
  F.quoteFail = false; await L.liveTick(env, { minute: 5 }); [p] = await positions(); assert.ok(p.last_value_sol > 0); assert.equal(p.plan.noRouteSince, undefined);
  // 23 hours without a route: still open. 25 hours: written off
  F.quoteFail = true; await L.liveTick(env, { minute: 6 }); await d.q(`UPDATE mob_aq_live_positions SET plan = plan || jsonb_build_object('noRouteSince', extract(epoch from now())::bigint - 23 * 3600)`);
  await L.liveTick(env, { minute: 7 }); assert.equal((await positions())[0].status, "open");
  await d.q(`UPDATE mob_aq_live_positions SET plan = plan || jsonb_build_object('noRouteSince', extract(epoch from now())::bigint - 25 * 3600)`);
  r = await L.liveTick(env, { minute: 8 }); assert.equal(r.exits[0].writtenOff, "BONK", JSON.stringify(r)); [p] = await positions();
  assert.equal(p.status, "closed"); assert.ok(Math.abs(p.pnl_sol + cost) < 1e-12, "a total loss: " + p.pnl_sol); assert.match(p.exit_reason, /^written off: no sell route for 24 hours/); assert.equal(p.plan.writtenOff, true); assert.equal(p.last_value_sol, 0);
  assert.ok(new Date(p.closed_at).getTime() > Date.now() - 60000, "booked on the day it is written off"); assert.ok(Math.abs((await L.pnlToday(d)) + cost) < 1e-9, "counted once: realized now, no longer marked");
  assert.ok(await one(`SELECT 1 FROM mob_aq_brain WHERE kind = 'pain' AND text LIKE 'PAIN: LIVE BONK%written off%'`), "a PAIN row for the brain"); assert.equal((await orders()).filter((o) => o.side === "sell").length, 0, "nothing was sent for it");
  // once: later ticks do not book it again, and the slot is free (the scan runs again instead of max_open)
  const st = (await L.liveState(d)); assert.equal(st.positions.length, 0); assert.ok(Math.abs(st.pnlTodaySol + cost) < 1e-6); assert.equal(st.closedToday, 1);
  r = await L.liveTick(env, { minute: 9 }); assert.equal(r.exits, undefined); assert.notEqual(r.result.refused, "max_open"); assert.ok(Math.abs((await one(`SELECT sum(pnl_sol)::float8 s FROM mob_aq_live_positions WHERE status = 'closed'`)).s + cost) < 1e-9);
  // CURVE: the same for a curve coin whose route vanished, plan in SOL
  await wipe(); world(); await curveWorld(); await L.liveTick(env, { minute: 1 }); F.quoteFail = true; await L.liveTick(env, { minute: 2 }); [p] = await positions(); assert.equal(p.last_value_sol, 0); assert.equal(p.status, "open");
  await d.q(`UPDATE mob_aq_live_positions SET plan = plan || jsonb_build_object('noRouteSince', extract(epoch from now())::bigint - 25 * 3600)`); r = await L.liveTick(env, { minute: 3 }); [p] = await positions(); assert.equal(p.status, "closed"); assert.ok(Math.abs(p.pnl_sol + p.cost_sol) < 1e-12);
});

test("E) target 1 must be 3x the cost from the quote's REAL price, checked again before signing (USD and CURVE)", async () => {
  // the short leg: target 1 is 2.26% from the candle entry and the round trip is 0.654%, so 3x needs 1.96%: it passes AT the entry...
  const short = () => { F.sellOut = "49800000"; F.candles = fibCandles({ legTo: 4, pull: 2, tail: rise(101.45, 101.8) }); };
  short(); let r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.confirmed, true, JSON.stringify(r.result)); let [p] = await positions(); assert.ok(p.plan.rewardLivePct >= 3 * p.plan.rtPct); assert.ok(Math.abs(p.plan.rewardLivePct - p.plan.rewardPct) < 0.01);
  // ...but the quote pays 1.4% over the entry (inside the 1.5% tolerance): from THAT price target 1 is 0.85% away, under 3x: refused, nothing signed
  await wipe(); world(); short(); F.tokensOut = String(Math.round(5000000 / 1.014)); r = await L.liveTick(env, { minute: 1 });
  assert.equal(r.result.refused, "cost", JSON.stringify(r.result)); assert.match(r.result.reason, /^Target 1 is 0\.8\d*% from the live price this quote pays \(.+\), under 3x the 0\.654% round trip/); assert.equal((await orders()).length, 0); assert.equal(F.sent.length, 0);
  // CURVE: 13.4% from the entry clears 3 x 3.044% = 9.13%; a quote 2.9% over the entry (inside the 3% tolerance) leaves 10.2%: still bought; a leg whose target is 11% away does not survive it
  await wipe(); world(); await curveWorld(); F.tokensOut = String(Math.round(4363002 / 1.029)); r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.confirmed, true, JSON.stringify(r.result) + JSON.stringify(await lastRef())); [p] = await positions(); assert.ok(p.plan.rewardLivePct < p.plan.rewardPct - 2.5 && p.plan.rewardLivePct >= 9.13);
  await wipe(); world(); await curveWorld(); await symBars(chart(Date.now() / 1000, { legTo: 24, pull: 13, tail: rise(110.6, 111.2) })); const sx = C.entrySetup(chart(Date.now() / 1000, { legTo: 24, pull: 13, tail: rise(110.6, 111.2) }), Date.now() / 1000);
  assert.equal(sx.signal, true, sx.why); const rw = (sx.t1 / sx.entry - 1) * 100; assert.ok(rw > 9.2 && rw < 12, "target 1 is " + rw + "% from the entry: passes the candle check");
  F.tokensOut = String(Math.round(((0.05 / (sx.entry * 1e-5)) * 1e5) / 1.029)); r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.refused, "cost", JSON.stringify(r.result)); assert.match(r.result.reason, /from the live price this quote pays .* under 3x the 3\.044% round trip/);
});

test("F) the daily number is called what it is: a budget; the hard ceiling is every open position going to zero", async () => {
  await limits({ maxPerTradeSol: 0.05, maxDailyLossSol: 0.06, maxOpenPositions: 3 });
  const n = (await L.liveState(d)).dailyLoss; assert.equal(n.budgetSol, 0.06); assert.equal(n.hardCeilingSol, 0.15); assert.match(n.note, /0\.06 SOL a day is a budget, not a ceiling/); assert.match(n.note, /3 x 0\.05 = 0\.15 SOL/);
  assert.equal(L.dailyLossNote({ maxPerTradeSol: 5, maxOpenPositions: 9, maxDailyLossSol: 0.06 }).hardCeilingSol, 0.15, "from the server's hard caps, not a stored number above them");
  await d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, tokens_raw, cost_sol, last_value_sol, stop_pct) VALUES ('solana','OpenC','C','open','1',0.05,0.04,100)`); await d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, tokens_raw, cost_sol, last_value_sol, stop_pct) VALUES ('solana','OpenD','D','open','1',0.05,0.04,100)`);
  const g = await L.gates(env); assert.equal(g.gate, "daily_loss_risk"); assert.match(g.reason, /no room in the 0\.06 SOL daily budget/);
});

test("G1) a sent buy that the RPC calls 'never landed' is NOT failed while its tokens are in the wallet; two empty reads and a balance read come first", async () => {
  const acct = async (raw) => { F.tokAccts = raw == null ? [] : [{ address: await L.ataOf(wallet.address, MINT), mint: MINT, program: L.PROG.token, raw: String(raw), data: tokData(MINT, wallet.address, raw) }]; };
  // the buy is sent, the RPC never shows its status (an inconsistent node), its window passes... and the tokens ARE in the wallet
  F.send = "rpcerror"; await L.liveTick(env, { minute: 1 }); let [o] = await orders(); assert.equal(o.status, "sent"); await acct(5000000);
  F.height = F.lastValid + 50; await L.liveTick(env, { minute: 2 }); assert.equal((await orders())[0].status, "sent", "first empty read: written down, nothing decided");
  F.height += 40; let r = await L.liveTick(env, { minute: 3 }); [o] = await orders(); let [p] = await positions();
  assert.equal(o.status, "confirmed", JSON.stringify(r)); assert.match(o.error, /never landed, but the tokens are in the wallet: booked from the token balance \(estimated\)/); assert.equal(o.fill_tokens, "5000000");
  assert.equal(p.status, "open", "the position exists, with its stop"); assert.equal(p.tokens_raw, "5000000"); assert.ok(p.cost_sol >= 0.05); assert.ok(p.plan.stop > 0); assert.equal(F.sent.length, 1, "never sent again");
  assert.ok(await one(`SELECT 1 FROM mob_aq_brain WHERE text LIKE 'LIVE BUY BONK: the RPC said this order never landed%'`)); assert.equal(await one(`SELECT 1 x FROM mob_aq_state WHERE k LIKE 'live_null:%'`), null);
  // ...and it is managed like any position from then on
  F.send = "ok"; await scenario((s) => [...flat(114.6, 5), ...flat(s.stop - 0.5, 5)]); r = await L.liveTick(env, { minute: 4 }); assert.match(r.exits?.[0]?.reason || "", /^stop:/, JSON.stringify(r)); assert.equal((await positions())[0].status, "closed");
  // fewer tokens than the quote's minimum (dust from an older trade) is NOT this buy's fill: failed, nothing booked
  await wipe(); world(); F.send = "rpcerror"; await L.liveTick(env, { minute: 1 }); await acct(1000); F.height = F.lastValid + 50; await L.liveTick(env, { minute: 2 }); F.height += 40; await L.liveTick(env, { minute: 3 });
  [o] = await orders(); [p] = await positions(); assert.equal(o.status, "failed"); assert.match(o.error, /never reached the chain/); assert.equal(p.status, "failed");
  // the wallet already held this coin before the buy (an old bag): only what is ABOVE that counts, so the old bag is not mistaken for a fill
  await wipe(); world(); await acct(9000000); F.recvTokens = "14000000"; F.send = "rpcerror"; await L.liveTick(env, { minute: 1 }); assert.equal((await positions())[0].plan.heldBefore, "9000000"); assert.equal((await orders())[0].status, "sent"); F.height = F.lastValid + 50; await L.liveTick(env, { minute: 2 }); F.height += 40; await L.liveTick(env, { minute: 3 });
  assert.equal((await orders())[0].status, "failed", "9,000,000 before and 9,000,000 after: nothing arrived"); await wipe(); world(); await acct(9000000); F.recvTokens = "14000000"; F.send = "rpcerror"; await L.liveTick(env, { minute: 1 }); await acct(14000000); F.height = F.lastValid + 50; await L.liveTick(env, { minute: 2 }); F.height += 40; await L.liveTick(env, { minute: 3 });
  [o] = await orders(); [p] = await positions(); assert.equal(o.status, "confirmed"); assert.equal(o.fill_tokens, "5000000", "only the 5,000,000 that arrived are this position's"); assert.equal(p.tokens_raw, "5000000"); await acct(null);
  // the balance cannot be read: nothing is decided (the order stays pending and blocks new buys)
  await wipe(); world(); F.send = "rpcerror"; await L.liveTick(env, { minute: 1 }); F.height = F.lastValid + 50; await L.liveTick(env, { minute: 2 }); F.height += 40; F.tokFail = true;
  r = await L.liveTick(env, { minute: 3 }); assert.equal((await orders())[0].status, "sent"); assert.equal(r.result.refused, "order_pending"); F.tokFail = false;
  await L.liveTick(env, { minute: 4 }); assert.equal((await orders())[0].status, "failed", "read, empty: now it is final");
  // a SALE the RPC lost: the tokens left the wallet -> booked as sold, not put back as open
  await wipe(); world(); await L.liveTick(env, { minute: 1 }); await acct(5000000); await scenario((s) => [...flat(114.6, 5), ...flat(s.stop - 0.5, 5)]); F.send = "rpcerror";
  await L.liveTick(env, { minute: 2 }); let so = (await orders()).at(-1); assert.equal(so.side, "sell"); assert.equal(so.status, "sent"); assert.equal((await positions())[0].status, "closing");
  await acct(0); F.height = F.lastValid + 50; await L.liveTick(env, { minute: 3 }); F.height += 40; await L.liveTick(env, { minute: 4 }); so = (await orders()).at(-1); [p] = await positions();
  assert.equal(so.status, "confirmed"); assert.match(so.error, /tokens left the wallet/); assert.equal(p.status, "closed"); assert.equal(p.tokens_raw, "0"); assert.equal(F.sent.length, 2, "the sale was not sent a second time");
  // the same lost sale with the tokens still there: it did not happen, the position is open again and the stop acts again
  await wipe(); world(); await L.liveTick(env, { minute: 1 }); await acct(5000000); await scenario((s) => [...flat(114.6, 5), ...flat(s.stop - 0.5, 5)]); F.send = "rpcerror"; await L.liveTick(env, { minute: 2 });
  F.height = F.lastValid + 50; await L.liveTick(env, { minute: 3 }); F.height += 40; F.send = "ok"; F.lastValid = F.height + 1000; await d.q(`UPDATE mob_aq_live_orders SET claim = claim || '-z' || id WHERE claim NOT LIKE '%-z%'`); r = await L.liveTick(env, { minute: 5 });
  assert.equal((await orders()).filter((x) => x.side === "sell")[0].status, "failed"); assert.equal(r.exits?.[0]?.confirmed, true, "sold on the same tick it was found unsold: " + JSON.stringify(r.exits));
});

test("G1) the wallet is checked against the book: a coin with no open position is reported, shown in the state, and never sold", async () => {
  const STRAY = "7deBYhKWNtXYL6brwF1DcWziqXqE2XLBUgkQq8SCpump";
  await L.liveTick(env, { minute: 1 }); // BONK is open
  F.tokAccts = [{ address: await L.ataOf(wallet.address, MINT), mint: MINT, program: L.PROG.token, raw: "5000000", data: tokData(MINT, wallet.address, 5000000) },
    { address: "StrayAcct111", mint: STRAY, program: L.PROG.token, raw: "777", data: tokData(STRAY, wallet.address, 777) }, { address: "EmptyAcct111", mint: "EmptyMint", program: L.PROG.token, raw: "0", data: "" }];
  const n0 = F.sent.length; let r = await L.liveTick(env, { minute: 5 }); assert.equal(r.orphans, 1, JSON.stringify(r));
  let st = await L.liveState(d); assert.equal(st.orphans.length, 1); assert.equal(st.orphans[0].mint, STRAY); assert.equal(st.orphans[0].raw, "777"); assert.match(st.orphans[0].note, /no position was ever recorded/); assert.ok(st.orphansAt);
  assert.equal(F.sent.length, n0, "nothing is sold without a position record"); assert.equal((await orders()).filter((o) => o.mint === STRAY).length, 0);
  const told0 = (await one(`SELECT count(*)::int n FROM mob_aq_brain WHERE text LIKE 'LIVE WALLET CHECK:%'`)).n - 1, told = async () => ({ n: (await one(`SELECT count(*)::int n FROM mob_aq_brain WHERE text LIKE 'LIVE WALLET CHECK:%'`)).n - told0 }); assert.equal((await told()).n, 1); await L.liveTick(env, { minute: 10 }); assert.equal((await told()).n, 1, "reported once, not every 5 minutes");
  await L.liveTick(env, { minute: 11 }); assert.equal((await told()).n, 1, "only every 5th minute looks");
  // the held coin is not an orphan; once its position is closed with tokens left, it is
  await d.q(`UPDATE mob_aq_live_positions SET status = 'closed', closed_at = now(), pnl_sol = 0, plan = plan || '{"rent":{"state":"dust"}}'::jsonb`); const l = await L.reconcileWallet(env, wallet); assert.deepEqual(l.map((x) => x.mint).sort(), [STRAY, MINT].sort()); assert.match(l.find((x) => x.mint === MINT).note, /left after a closed position/);
  F.tokAccts = []; assert.deepEqual(await L.reconcileWallet(env, wallet), []); assert.deepEqual((await L.liveState(d)).orphans, []);
  F.tokFail = true; assert.equal(await L.reconcileWallet(env, wallet), null, "unreadable: no claim either way"); F.tokFail = false;
});

test("G2) BUY MORE obeys the lanes, the cost gate, check E and the hard ceiling of open positions x size (USD and CURVE)", async () => {
  const buyMore = (p, sol, extra = {}) => L.manualOrder(env, { side: "buy", positionId: Number(p.id), sol, force: true, ...extra }), bump = () => d.q(`UPDATE mob_aq_live_orders SET claim = claim || '-z' || id WHERE claim NOT LIKE '%-z%'`);
  await limits({ maxOpenPositions: 3 }); await L.liveTick(env, { minute: 1 }); let [p] = await positions(); assert.equal(p.plan.source, "right_call");
  // the lanes: this position came from the right-call lane; with that lane off an add is refused, nothing is sent
  await limits({ maxOpenPositions: 3, lanes: { market: true, rightCall: false } }); let r = await buyMore(p, 0.02); assert.match(r.error, /right-call lane is OFF in the live settings: BUY MORE on BONK is refused/); assert.equal(F.sent.length, 1);
  await d.q(`UPDATE mob_aq_live_positions SET plan = plan || '{"source":"market"}'::jsonb`); [p] = await positions(); await limits({ maxOpenPositions: 3, lanes: { market: false, rightCall: true } }); r = await buyMore(p, 0.02); assert.match(r.error, /market lane is OFF/);
  await limits({ maxOpenPositions: 3, lanes: "on" }); r = await buyMore(p, 0.02); assert.match(r.error, /market lane is OFF/, "a malformed setting fails closed"); await limits({ maxOpenPositions: 3 });
  // the cost gate at the add's own size: 0.01 SOL cannot carry the fixed fees (1.27%); a 2% round trip is over the market lane's 1%
  r = await buyMore(p, 0.01); assert.match(r.error, /^Cost: The fixed SOL fees alone .* are 1\.27% of 0\.01 SOL, over 1%/); F.sellOut = "19600000"; r = await buyMore(p, 0.02); assert.match(r.error, /^Cost: The round trip costs 2\.\d+% .* over 1%/); F.sellOut = "60000000";
  F.holderSimErr = { InstructionError: [4, { Custom: 6022 }] }; r = await buyMore(p, 0.02); assert.match(r.error, /^Cost: .*real holder's sale fails/, "the honeypot test runs for an add too"); F.holderSimErr = null;
  // check E on the price the add really pays: under the stop, over the target, and the target 3x the cost away
  F.tokensOut = "6000000"; r = await buyMore(p, 0.02); assert.match(r.error, /at or under the stop/); F.tokensOut = "4000000"; r = await buyMore(p, 0.02); assert.match(r.error, /at or over the next target/);
  F.tokensOut = String(Math.round(5000000 / 1.13)); F.sellOut = "19900000"; r = await buyMore(p, 0.02); assert.match(r.error, /^The next target is 0\.\d+% from the live price this quote pays, under 3x the 1\.\d+% round trip|^Cost: /, r.error); F.tokensOut = "5000000"; F.sellOut = "60000000";
  assert.equal(F.sent.length, 1, "every refusal came before anything was signed"); assert.match((await L.manualPreview(env, { side: "buy", positionId: Number(p.id), sol: 0.01 })).error, /^Cost: /, "the confirm dialog says the same");
  // a clean add goes through, with the fee room of the cost gate
  await bump(); r = await buyMore(p, 0.02); assert.equal(r.confirmed, true, JSON.stringify(r)); [p] = await positions(); assert.equal(p.tokens_raw, "7000000");
  // THE HARD CEILING: 3 x 0.05 = 0.15 SOL in open positions, and an add counts
  await d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, tokens_raw, cost_sol, last_value_sol, stop_pct) VALUES ('solana','OpenX','X','open','1',0.05,0.05,5)`); F.quoteDownIf = (u) => u.searchParams.get("inputMint") === "OpenX";
  const open = (await one(`SELECT sum(cost_sol)::float8 s FROM mob_aq_live_positions WHERE status = 'open'`)).s; await limits({ maxOpenPositions: 3, maxDailyLossSol: 5 });
  await bump(); r = await buyMore(p, 0.05); assert.match(r.error, /would put 0\.17\d* SOL into open positions, over the hard ceiling of 3 x 0\.05 = 0\.15 SOL/, r.error + " (open " + open + ")");
  await bump(); r = await buyMore(p, 0.02); assert.equal(r.confirmed, true, "0.02 more still fits under 0.15: " + JSON.stringify(r)); await bump(); r = await buyMore(p, 0.02); assert.match(r.error, /over the hard ceiling/, "and then it does not");
  await limits({ maxPerTradeSol: 5, maxOpenPositions: 9, maxDailyLossSol: 5 }); await bump(); r = await buyMore(p, 0.02); assert.match(r.error, /hard ceiling of 3 x 0\.05 = 0\.15 SOL/, "a stored limit above the server's caps does not raise it");
  // CURVE: an add to a curve position is held to the curve's own rules (3.5%), and to its lane
  await wipe(); world(); await limits({ maxOpenPositions: 3 }); await curveWorld(); await L.liveTick(env, { minute: 1 }); [p] = await positions(); assert.equal(p.plan.fresh, true); await bump();
  F.sellOut = "19300000"; r = await buyMore(p, 0.02); assert.match(r.error, /^Cost: The round trip costs 4\.\d+% .* over 3\.5%/, r.error);
  F.sellOut = "19442000"; r = await buyMore(p, 0.02); assert.equal(r.confirmed, true, "2.79% + 0.61% fixed = 3.4%, under 3.5%, target 13% away: " + JSON.stringify(r));
  await limits({ maxOpenPositions: 3, lanes: { market: true, rightCall: false } }); await bump(); r = await buyMore(p, 0.02); assert.match(r.error, /right-call lane is OFF/);
});

test("G3) lanes fail closed on a malformed stored value; a written-off coin is sold if a route returns, and its rent comes back", async () => {
  assert.deepEqual(L.lanesOf({}), { market: true, rightCall: false }, "nothing stored: the default");
  for (const bad of ["on", 1, true, [], [true, true]]) assert.deepEqual(L.lanesOf({ lanes: bad }), { market: false, rightCall: false }, JSON.stringify(bad));
  for (const bad of ["true", 1, "on", null, {}, 0]) assert.equal(L.lanesOf({ lanes: { market: bad, rightCall: bad } }).market, false, "market: " + JSON.stringify(bad));
  for (const bad of ["true", 1, "on", null, {}]) assert.equal(L.lanesOf({ lanes: { market: true, rightCall: bad } }).rightCall, false);
  assert.deepEqual(L.lanesOf({ lanes: { rightCall: true } }), { market: true, rightCall: true }, "a switch that was never stored keeps its default"); assert.deepEqual(L.lanesOf({ lanes: { market: false } }), { market: false, rightCall: false });
  await limits({ lanes: { market: "yes", rightCall: false } }); let r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.refused, "lanes_off", "a malformed market switch buys nothing: " + JSON.stringify(r.result)); assert.equal((await orders()).length, 0);
  // ---- write-off, then the route returns
  await wipe(); world(); F.rentApart = true; const closes0 = F.closes || 0; await limits({ maxOpenPositions: 1 }); await L.liveTick(env, { minute: 1 }); let [p] = await positions(); const cost = p.cost_sol; assert.ok(p.plan.rentSol > 0);
  F.quoteFail = true; await L.liveTick(env, { minute: 2 }); await d.q(`UPDATE mob_aq_live_positions SET plan = plan || jsonb_build_object('noRouteSince', extract(epoch from now())::bigint - 25 * 3600)`); await L.liveTick(env, { minute: 3 });
  [p] = await positions(); assert.equal(p.status, "closed"); assert.equal(p.plan.writtenOff, true); assert.equal(p.plan.rentLost, true); assert.ok(Math.abs(p.pnl_sol + cost + p.plan.rentSol) < 1e-12, "the cost AND the rent it can no longer get back");
  const day = p.closed_at, lost = p.pnl_sol; F.tokAccts = [{ address: await L.ataOf(wallet.address, MINT), mint: MINT, program: L.PROG.token, raw: p.tokens_raw, data: tokData(MINT, wallet.address, p.tokens_raw) }];
  // still no route: nothing happens on the 5-minute pass, the rent is not touched (the account still holds the coin), the slot stays free
  r = await L.liveTick(env, { minute: 5 }); assert.equal(r.recovered, undefined); assert.equal(r.rent, undefined); assert.equal((await positions())[0].plan.rent, undefined); assert.notEqual(r.result.refused, "max_open");
  // the route is back (worth a fifth of what it cost): sold on the next 5-minute pass, booked onto the written-off trade, on its own day
  F.quoteFail = false; F.sellOut = "10000000"; await limits({ maxOpenPositions: 1, autoTrade: false }); r = await L.liveTick(env, { minute: 6 }); assert.equal(r.recovered, undefined, "only every 5th minute");
  F.tokAccts = [{ ...F.tokAccts[0], raw: "0", data: tokData(MINT, wallet.address, 0) }]; // what the wallet holds once that sale has landed (this fake chain does not move tokens by itself)
  r = await L.liveTick(env, { minute: 10 }); assert.equal(r.recovered?.[0]?.confirmed, true, JSON.stringify(r)); [p] = await positions();
  assert.equal(p.status, "closed"); assert.equal(p.tokens_raw, "0"); assert.equal(p.plan.recovered, true); assert.match(p.exit_reason, /^written off/); assert.equal(new Date(p.closed_at).getTime(), new Date(day).getTime(), "it stays on the day it was written off");
  const back = (await orders()).at(-1).fill_sol; assert.ok(back > 0.0099); assert.match((await orders()).at(-1).reason, /^recovery: a sell route returned/);
  // and, in the same run, the now empty account's rent is reclaimed and added back: the loss is smaller by exactly what came back
  assert.equal(r.rent?.[0]?.booked, true, JSON.stringify(r)); assert.equal(p.plan.rent.state, "closed"); assert.ok(Math.abs(p.pnl_sol - (lost + back + (1488440 - 5000) / 1e9)) < 1e-12, p.pnl_sol + " vs " + (lost + back)); r = await L.liveTick(env, { minute: 15 }); assert.equal(r.recovered, undefined, "recovered once"); assert.equal(F.closes, closes0 + 1, "the account was closed once");
  // a recovery sale that fails leaves the position closed (never back to open, never a slot), and is tried again
  await wipe(); world(); await limits({ maxOpenPositions: 1, autoTrade: false }); await limits({ maxOpenPositions: 1 }); await L.liveTick(env, { minute: 1 }); F.quoteFail = true; await L.liveTick(env, { minute: 2 });
  await d.q(`UPDATE mob_aq_live_positions SET plan = plan || jsonb_build_object('noRouteSince', extract(epoch from now())::bigint - 25 * 3600)`); await L.liveTick(env, { minute: 3 }); F.quoteFail = false; F.sellOut = "10000000"; F.simErr = { InstructionError: [1, "Custom"] }; await limits({ maxOpenPositions: 1, autoTrade: false });
  r = await L.liveTick(env, { minute: 5 }); assert.match(r.recovered?.[0]?.failed || "", /simulation failed/, JSON.stringify(r)); [p] = await positions(); assert.equal(p.status, "closed"); assert.ok(!p.plan.recovered);
  F.simErr = null; r = await L.liveTick(env, { minute: 10 }); assert.equal(r.recovered?.[0]?.confirmed, true); assert.equal((await positions())[0].plan.recovered, true);
  // after 7 days it is left alone
  await wipe(); world(); await d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, tokens_raw, cost_sol, pnl_sol, closed_at, plan) VALUES ('solana',$1,'OLD','closed','5000000',0.05,-0.05, now() - interval '8 days', '{"kind":"fib","writtenOff":true}')`, [MINT]); await limits({ autoTrade: false });
  F.calls.length = 0; r = await L.liveTick(env, { minute: 5 }); assert.equal(r.recovered, undefined); assert.equal(F.sent.length, 0);
});

test("G4) a manual sell does not die with one RPC: the simulation is asked again, then on a second RPC; a transaction is never sent twice", async () => {
  const sell = (p) => L.manualOrder(env, { side: "sell", positionId: Number(p.id), pct: 100 }), bump = () => d.q(`UPDATE mob_aq_live_orders SET claim = claim || '-z' || id WHERE claim NOT LIKE '%-z%'`);
  await L.liveTick(env, { minute: 1 }); let [p] = await positions(); const sent0 = F.sent.length;
  // Helius drops the simulation once (order 4's failure): asked again, answered, sold
  F.rpcDeaf = { simulateTransaction: 1 }; F.calls.length = 0; let r = await sell(p); assert.equal(r.confirmed, true, JSON.stringify(r)); assert.deepEqual(F.calls.filter((c) => /simulateTransaction/.test(c)), ["deaf:simulateTransaction", "simulateTransaction"]);
  assert.equal(F.sent.length, sent0 + 1); assert.equal((await positions())[0].status, "closed");
  // Helius is deaf to it twice: the second RPC answers the simulation, and the sale still goes out ONCE, through the main RPC
  await wipe(); world(); await L.liveTick(env, { minute: 1 }); [p] = await positions(); await bump(); F.rpcDeaf = { simulateTransaction: 2, getBalance: 2 }; F.publicUp = true; F.calls.length = 0; r = await sell(p);
  assert.equal(r.confirmed, true, JSON.stringify(r)); assert.ok(F.calls.includes("public:simulateTransaction") && F.calls.includes("public:getBalance")); assert.equal(F.calls.filter((c) => c === "sendTransaction").length, 1, "the main RPC got the send once"); assert.equal(F.calls.filter((c) => c === "public:sendTransaction").length, 1, "and the second RPC got the SAME signed transaction");
  // no RPC answers at all: nothing is signed, the position stays open with its stop, and this is NOT a reason to widen the slippage
  await wipe(); world(); await L.liveTick(env, { minute: 1 }); [p] = await positions(); await bump(); F.rpcDeaf = { simulateTransaction: 9 }; const n1 = F.sent.length; r = await sell(p);
  assert.match(r.failed, /no RPC answered simulateTransaction \(the main one twice: Helius did not answer simulateTransaction; then 3 second RPCs\); nothing was signed/); assert.equal(F.sent.length, n1); [p] = await positions(); assert.equal(p.status, "open"); assert.ok(!p.plan.slipFails); assert.equal((await orders()).at(-1).signature, null);
  // an RPC that ANSWERS with an error is believed, not shopped around
  F.rpcDeaf = null; F.publicUp = true; F.simErr = { InstructionError: [1, "Custom"] }; await bump(); F.calls.length = 0; r = await sell(p); assert.match(r.failed, /the simulation failed/); assert.ok(!F.calls.some((c) => c.startsWith("public:")));
  // the automatic stop uses the same path
  F.simErr = null; await scenario((s) => [...flat(114.6, 5), ...flat(s.stop - 0.5, 5)]); F.rpcDeaf = { simulateTransaction: 1 }; await bump(); r = await L.liveTick(env, { minute: 9 }); assert.equal(r.exits?.[0]?.confirmed, true, JSON.stringify(r.exits)); assert.equal((await positions())[0].status, "closed");
});

test("RPC) every live call survives a deaf or rate-limited main RPC: retry, then a second RPC; the send goes to all; symbiote yields; what happened is on record", async () => {
  const bump = () => d.q(`UPDATE mob_aq_live_orders SET claim = claim || '-z' || id WHERE claim NOT LIKE '%-z%'`), sell = (p) => L.manualOrder(env, { side: "sell", positionId: Number(p.id), pct: 100 });
  await L.liveTick(env, { minute: 1 }); let [p] = await positions(); await d.q(`DELETE FROM mob_aq_state WHERE k = 'live_rpc'`);
  // order 10's failure: the main RPC is deaf to getTokenAccountsByOwner. Asked again: answered. Sold.
  F.rpcDeaf = { getTokenAccountsByOwner: 1 }; let r = await sell(p); assert.equal(r.confirmed, true, JSON.stringify(r)); assert.equal((await positions())[0].status, "closed");
  // rate limited (HTTP 429) on EVERY read the sale makes, twice each: the second RPC answers them all and the sale still lands
  await wipe(); world(); await L.liveTick(env, { minute: 1 }); [p] = await positions(); await bump(); F.publicUp = true; F.rpcLimited = { getBalance: 2, getTokenAccountsByOwner: 4, simulateTransaction: 2, getSignatureStatuses: 2, getTransaction: 2, getMultipleAccounts: 2 }; F.calls.length = 0;
  r = await sell(p); assert.equal(r.confirmed, true, JSON.stringify(r)); for (const m of ["getBalance", "getTokenAccountsByOwner", "simulateTransaction", "getSignatureStatuses", "getTransaction"]) assert.ok(F.calls.includes("public:" + m), "the second RPC answered " + m);
  const seen = (await one(`SELECT v FROM mob_aq_state WHERE k = 'live_rpc'`)).v; assert.ok(seen.mainFailures.some((x) => x.method === "simulateTransaction" && /rate limited/.test(x.why)), "the main RPC's refusals are written down: " + JSON.stringify(seen.mainFailures.slice(-2))); assert.ok(seen.answeredBySecond >= 5);
  // the main RPC does not take the SEND, the second does: it counts as sent (the signature is on record), and the chain is asked
  await wipe(); world(); await L.liveTick(env, { minute: 1 }); [p] = await positions(); await bump(); F.publicUp = true; F.send = "throw"; F.calls.length = 0; r = await sell(p);
  assert.ok(F.calls.includes("public:sendTransaction")); let so = (await orders()).at(-1); assert.equal(so.status, "sent"); assert.equal(so.error, null, "no send error: one RPC took it"); assert.ok(so.signature);
  F.status[so.signature] = { confirmationStatus: "confirmed", err: null }; F.txs[so.signature] = landed(false, { inputMint: MINT, outputMint: SOL, inAmount: p.tokens_raw, outAmount: F.sellOut }); await L.liveTick(env, { minute: 2 }); assert.equal((await orders()).at(-1).status, "confirmed"); assert.equal((await positions())[0].status, "closed");
  // no RPC takes the send at all: unknown outcome, exactly as before (never sent again, the chain decides)
  await wipe(); world(); await L.liveTick(env, { minute: 1 }); [p] = await positions(); await bump(); F.send = "throw"; r = await sell(p); so = (await orders()).at(-1); assert.equal(so.status, "sent"); assert.match(so.error, /send:/);
  // a real "no" from the main RPC (not a rate limit) is believed: nobody else is asked
  await wipe(); world(); F.publicUp = true; F.heightFail = true; F.calls.length = 0; await assert.rejects(L.rpcRead(env, "getBlockHeight", [{}]), /Helius refused getBlockHeight \(busy\)/); assert.ok(!F.calls.some((c) => c.startsWith("public:"))); F.heightFail = false;
  // symbiote is asked to hold its RPC reads before a live order, and a missing or slow symbiote never stops the order
  const asked = []; env.SYMBIOTE = { idFromName: (n) => n, get: (id) => ({ fetch: async (u, init) => { asked.push([id, u, JSON.parse(init.body).ms]); return new Response("{}"); } }) };
  await wipe(); world(); r = await L.liveTick(env, { minute: 1 }); assert.equal(r.result.confirmed, true); assert.deepEqual(asked, [["main", "https://sym/yield", 45000]]);
  env.SYMBIOTE = { idFromName: (n) => n, get: () => ({ fetch: async () => { throw new Error("object reset"); } }) }; [p] = await positions(); await bump(); r = await sell(p); assert.equal(r.confirmed, true, "a symbiote that throws does not stop a sale"); delete env.SYMBIOTE;
});

test("G5) empty token accounts a swap route left in the wallet are closed and their rent comes back; nothing else is ever closed", async () => {
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", STRAY = "7deBYhKWNtXYL6brwF1DcWziqXqE2XLBUgkQq8SCpump", A = (address, mint, raw) => ({ address, mint, program: L.PROG.token, raw: String(raw), data: tokData(mint, wallet.address, raw) });
  await L.liveTick(env, { minute: 1 }); const closes0 = F.closes || 0, sent0 = F.sent.length; // BONK is open
  F.tokAccts = [A(await L.ataOf(wallet.address, MINT), MINT, 5000000), A(await L.ataOf(wallet.address, USDC), USDC, 0), A(await L.ataOf(wallet.address, USDT), USDT, 0), A(await L.ataOf(wallet.address, STRAY), STRAY, 777)];
  let r = await L.liveTick(env, { minute: 2 }); assert.equal(r.swept, undefined, "only on the 5-minute pass"); assert.equal(F.closes || 0, closes0);
  r = await L.liveTick(env, { minute: 5 }); assert.equal(r.swept?.length, 2, JSON.stringify(r)); assert.deepEqual(r.swept.map((x) => x.mint).sort(), [USDC, USDT].sort()); assert.ok(r.swept.every((x) => x.backSol === 0.001483), "1,483,440 lamports each (the rent less the close's fee)");
  assert.equal(F.closes, closes0 + 2, "two CloseAccount transactions, nothing else"); assert.equal(F.sent.length, sent0, "no swap was sent"); assert.equal((await positions())[0].status, "open"); assert.equal((await positions())[0].tokens_raw, "5000000");
  assert.equal((await one(`SELECT count(*)::int n FROM mob_aq_brain WHERE text LIKE 'LIVE RENT SWEEP:%' AND at > now() - interval '1 minute'`)).n, 2); assert.equal(r.orphans, 1, "the stray coin with tokens in it is reported, not closed");
  // never: an account with tokens in it, the open position's own account, a closed position's account (reclaimRent books that one), or while an order is on its way
  F.tokAccts = [A(await L.ataOf(wallet.address, MINT), MINT, 0), A(await L.ataOf(wallet.address, STRAY), STRAY, 777)]; assert.deepEqual(await L.sweepEmpty(env, wallet), []);
  F.tokAccts = [A(await L.ataOf(wallet.address, USDC), USDC, 0)]; await d.q(`INSERT INTO mob_aq_live_orders (venue, side, mint, symbol, claim, status) VALUES ('solana','sell','X','X','pending-claim','sent')`); assert.deepEqual(await L.sweepEmpty(env, wallet), []); await d.q(`DELETE FROM mob_aq_live_orders WHERE claim = 'pending-claim'`);
  // a close that does not simulate cleanly is left alone; an unreadable wallet does nothing
  F.closeSimErr = { InstructionError: [0, { Custom: 11 }] }; assert.deepEqual(await L.sweepEmpty(env, wallet), []); F.closeSimErr = null; F.tokFail = true; assert.deepEqual(await L.sweepEmpty(env, wallet), []); F.tokFail = false;
  assert.equal((await L.sweepEmpty(env, wallet)).length, 1); assert.equal(F.closes, closes0 + 3);
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
  await d.q(`UPDATE mob_aq_live_orders SET claim = claim || '-z' || id WHERE claim NOT LIKE '%-z%'`); await R("POST", "/api/aq/wallet/sellall", { cookie, body: {} }); [p] = await positions(); assert.equal(p.status, "closed"); const pnl0 = p.pnl_sol;
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
  await L.liveTick(env, { minute: 3 }); assert.equal((await orders()).find((x) => x.id === o.id).status, "sent", "one empty read is written down, not believed");
  await d.q(`UPDATE mob_aq_state SET v = v || jsonb_build_object('at', (v->>'at')::bigint - 60000) WHERE k LIKE 'live_null:%'`); F.tokAccts = [{ address: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", mint: MINT, program: L.PROG.token, raw: (await positions())[0].tokens_raw, data: tokData(MINT, wallet.address, (await positions())[0].tokens_raw) }]; // the coin is still in the wallet: the sale did not happen
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
  await d.q(`DELETE FROM mob_aq_sym_right`); let r = await M({ positionId: p.id, side: "buy", sol: 0.02 }); assert.equal(r.status, 400); assert.match((await r.json()).error.message, /right call/); await rightAll();
  await d.q(`INSERT INTO mob_aq_chat (from_name, text) VALUES ('grok', $1)`, [`VETO ${MINT}`]); r = await M({ positionId: p.id, side: "buy", sol: 0.02 }); assert.match((await r.json()).error.message, /vetoed/); await d.q(`DELETE FROM mob_aq_chat`);
  F.rug = { ...F.rug, freezeAuthority: "Fz" }; await d.q(`DELETE FROM mob_aq_market`); r = await M({ positionId: p.id, side: "buy", sol: 0.02 }); assert.match((await r.json()).error.message, /Safety/);
  world(); await d.q(`DELETE FROM mob_aq_market`); r = await M({ positionId: p.id, side: "buy", sol: 0.02 }); assert.equal(r.status, 200, await r.clone().text());
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
  await d.q(`UPDATE mob_aq_live_orders SET claim = claim || '-z' || id WHERE claim NOT LIKE '%-z%'`); await R("POST", "/api/aq/wallet/sellall", { cookie, body: {} }); [p] = await positions(); const pnl0 = p.pnl_sol;
  F.tokAccts = [{ address: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", mint: MINT, program: L.PROG.token, raw: "0", data: tokData(MINT, wallet.address, 0) }];
  await limits({ autoTrade: false }); await L.liveTick(env, { minute: 2 }); [p] = await positions();
  assert.ok(Math.abs(p.pnl_sol - (pnl0 - 0.000005)) < 1e-12, "rent back: only the close's fee touches the trade");
  // a close that can never happen (dust): the rent kept apart is booked as lost, once
  await wipe(); world(); await limits(); F.rentApart = true; await L.liveTick(env, { minute: 1 }); await d.q(`UPDATE mob_aq_live_orders SET claim = claim || '-z' || id WHERE claim NOT LIKE '%-z%'`); await R("POST", "/api/aq/wallet/sellall", { cookie, body: {} });
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
