// Alex's Phantom on the panel (src/aq/phantom.mjs): the server holds only his public address, builds transactions for it
// and never signs them. Fake Jupiter and fake RPC on a throwaway schema; an unmocked fetch throws (helpers.mjs).
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, dropEnv, reqOf, login, mock, resetMocks } from "./helpers.mjs";
import { db } from "../src/db.mjs";
import * as PH from "../src/aq/phantom.mjs";
import * as W from "../src/aq/wallet.mjs";
import * as L from "../src/aq/live.mjs";
import { buildState, _resetSeeded } from "../src/aq/engine.mjs";
import * as C from "../src/aq/chart.mjs";
import { chart, asJup } from "./fib-fixture.mjs";
import { AQ_JS, AQ_PHANTOM_JS } from "../src/aq-bundle.mjs";

const SOL = "So11111111111111111111111111111111111111112", MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", THIN = "ThinPoo1Coin1111111111111111111111111111111", GTA = "4kjruqGHDsSqkMdFfCjV7Vb62HPFhtXyWc2t6JpQzDnz";
let env, R, cookie, d, ME, OTHER; const F = {}, seen = [];
const one = (q, p) => d.one(q, p), st = async (k) => (await one(`SELECT v FROM mob_aq_state WHERE k=$1`, [k]))?.v ?? null;
const J = async (r) => { const t = await r.text(); seen.push(t); const j = JSON.parse(t); return { ...j, state: j.status, status: r.status }; }; // status = HTTP, state = the order's own status
const post = async (path, body) => J(await R("POST", "/api/aq/phantom" + path, { cookie, body }));
const orders = () => d.q(`SELECT * FROM mob_aq_live_orders WHERE venue = 'phantom' ORDER BY id`), positions = () => d.q(`SELECT * FROM mob_aq_live_positions WHERE venue = 'phantom' ORDER BY id`);
const sigOf = (n) => W.base58(new Uint8Array(64).fill(n));
const fakeTx = (payer) => { const b = new Uint8Array(1 + 64 + 4 + 1 + 64 + 32 + 1); b[0] = 1; let p = 65; b[p++] = 0x80; b[p++] = 1; b[p++] = 0; b[p++] = 1; b[p++] = 2; b.set(W.unbase58(payer), p); return Buffer.from(b).toString("base64"); };
// the chart trader's picture (test/fib-fixture.mjs): a golden-pocket bounce that closed a minute ago, unless a test sets F.candles
const nowCandles = () => asJup(chart(Date.now() / 1000)).candles;
function world() {
  resetMocks();
  Object.assign(F, { candles: null, balance: 3_000_000_000, tokens: { [MINT]: "8000000" }, impact: "0.001", jupSim: null, payer: null, tokensOut: "5000000", sellOut: "60000000", status: {}, txs: {}, height: 1000, simErr: null, calls: [], swapBody: null, rug: { mintAuthority: null, freezeAuthority: null, rugged: false, risks: [], topHolders: [], markets: [], token: { decimals: 5 } },
    pools: [{ id: "p1", quoteAsset: SOL, baseAsset: { id: MINT, symbol: "BONK", liquidity: 250000, decimals: 5, firstPool: { createdAt: "2024-01-01T00:00:00Z" }, stats5m: { priceChange: -4 }, audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true } } },
      { id: "p2", quoteAsset: SOL, baseAsset: { id: THIN, symbol: "THIN", liquidity: 30000, decimals: 6, firstPool: { createdAt: "2024-01-01T00:00:00Z" }, stats5m: { priceChange: 3 } } }] });
  mock("GET", /^https:\/\/datapi\.jup\.ag\/v1\/pools\//, () => ({ pools: F.pools })); mock("GET", /^https:\/\/datapi\.jup\.ag\/v2\/charts\//, () => ({ candles: F.candles || nowCandles() })); mock("GET", /^https:\/\/api\.rugcheck\.xyz\//, () => F.rug);
  for (const host of ["https://api.jup.ag", "https://lite-api.jup.ag"]) {
    mock("GET", `${host}/swap/v1/quote`, (c, u) => { F.calls.push("quote"); const buy = u.searchParams.get("inputMint") === SOL, out = buy ? F.tokensOut : F.sellOut;
      return { inputMint: u.searchParams.get("inputMint"), outputMint: u.searchParams.get("outputMint"), inAmount: u.searchParams.get("amount"), outAmount: out, otherAmountThreshold: String(Math.floor(Number(out) * 0.99)), priceImpactPct: F.impact, slippageBps: Number(u.searchParams.get("slippageBps")), routePlan: [{ swapInfo: { label: "Meteora" } }] }; });
    mock("POST", `${host}/swap/v1/swap`, (c) => { F.calls.push("swap"); F.swapBody = JSON.parse(c.body); return { swapTransaction: fakeTx(F.payer || F.swapBody.userPublicKey), lastValidBlockHeight: 2000, prioritizationFeeLamports: 9555, simulationError: F.jupSim }; });
  }
  mock("POST", "https://mainnet.helius-rpc.com/", (c) => { const m = JSON.parse(c.body), ok = (result) => ({ jsonrpc: "2.0", id: 1, result }), val = (value) => ok({ context: { slot: 1 }, value }); F.calls.push(m.method);
    if (m.method === "getBalance") return val(F.balance);
    if (m.method === "getTokenAccountsByOwner") return val(Object.entries(F.tokens).filter(([mint]) => !m.params[1].mint || m.params[1].mint === mint).filter(() => m.params[1].mint || m.params[1].programId.startsWith("Tokenkeg")).map(([mint, amount]) => ({ account: { data: { parsed: { info: { mint, tokenAmount: { amount, decimals: 5, uiAmount: Number(amount) / 1e5 } } } } } })));
    if (m.method === "getTokenSupply") return val({ amount: "1", decimals: 6 });
    if (m.method === "getLatestBlockhash") return val({ blockhash: "CtZPwQCiDbsGsxevfnEksSK4nviBJD6vVZVAcR6Tw2z8", lastValidBlockHeight: 2000 });
    if (m.method === "getBlockHeight") return ok(F.height);
    if (m.method === "simulateTransaction") return val({ err: F.simErr, logs: [], accounts: null });
    if (m.method === "getSignatureStatuses") return val(m.params[0].map((s) => F.status[s] ?? null));
    if (m.method === "getTransaction") return ok(F.txs[m.params[0]] ?? null);
    return { jsonrpc: "2.0", id: 1, error: { code: -32601, message: `Method not found: ${m.method}` } }; });
}
// what the chain shows once Phantom sent it: his wallet paid, the coins moved
const land = (sig, { payer = ME, sol, mint = MINT, tokens = "0" }) => { F.status[sig] = { confirmationStatus: "confirmed", err: null }; const t = BigInt(tokens);
  F.txs[sig] = { meta: { err: null, fee: 14556, preBalances: [F.balance], postBalances: [F.balance + Math.round(sol * 1e9)], preTokenBalances: t < 0n ? [{ owner: payer, mint, uiTokenAmount: { amount: (-t).toString() } }] : [], postTokenBalances: t > 0n ? [{ owner: payer, mint, uiTokenAmount: { amount: t.toString() } }] : [] }, transaction: { message: { accountKeys: [payer, "x"] }, signatures: [sig] } }; };

before(async () => { env = await makeEnv({ HELIUS_API_KEY: "hk", AQ_JUP_GAP_MS: "0", AQ_LIVE_POLL_MS: "0" }); _resetSeeded(); R = reqOf(env); cookie = await login(env); d = db(env); world(); await buildState(env);
  ME = (await W.makeKey(env)).address; OTHER = (await W.makeKey(env)).address; });
after(async () => { await dropEnv(env); });
beforeEach(() => world());

test("Alex only; a private key or a recovery phrase is refused, never stored, never echoed", async () => {
  for (const p of ["/connect", "/disconnect", "/trade", "/fund", "/sent"]) { assert.equal((await R("POST", "/api/aq/phantom" + p, { body: {} })).status, 401); assert.equal((await R("POST", "/api/aq/phantom" + p, { bearer: env.MOB_API_TOKEN, body: {} })).status, 403); }
  assert.equal((await R("GET", "/api/aq/phantom")).status, 401); assert.equal((await R("GET", "/aq/phantom-tx.js")).status, 302, "the chunk is behind the sign-in too");
  const off = await J(await R("GET", "/api/aq/phantom", { cookie })); assert.equal(off.connected, false); assert.match(off.note, /need your approval in Phantom each time/);
  const key64 = W.base58(crypto.getRandomValues(new Uint8Array(64))), phrase = "legal winner thank year wave sausage worth useful legal winner thank yellow", bytes = [...crypto.getRandomValues(new Uint8Array(64))], hex = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  const secrets = [key64, phrase, phrase + " abandon ability able about above absent absorb abstract absurd abuse access accident", JSON.stringify(bytes), bytes, bytes.join(","), hex, "0x" + hex + hex];
  for (const s of secrets) for (const [path, body] of [["/connect", { address: s }], ["/connect", { address: ME, note: s }], ["/trade", { mint: MINT, side: "buy", sol: 0.1, memo: s }], ["/trade", { mint: s, side: "buy", sol: 0.1 }], ["/fund", { sol: 0.1, key: s }]]) {
    const r = await post(path, body); assert.equal(r.status, 400, path); assert.equal(r.error.code, "secret_refused"); assert.match(r.error.message, /Aquarius never takes one: it was not saved/); }
  assert.equal((await post("/sent", { orderId: 1, signature: phrase })).error.code, "secret_refused");
  assert.equal(await st("phantom"), null); assert.equal(F.calls.length, 0, "a refused secret reaches nobody");
  const hay = JSON.stringify([seen, await d.q(`SELECT k, v FROM mob_aq_state`), await d.q(`SELECT text, data FROM mob_aq_brain`), await d.q(`SELECT * FROM mob_aq_live_orders`)]);
  for (const s of [key64, phrase, hex, bytes.join(","), JSON.stringify(bytes).slice(1, -1)]) assert.ok(!hay.includes(s), "the secret is in no response and no row");
  for (const ok of [ME, "BONK", "buy the dip now please", sigOf(3).slice(0, 44), 0.5, null]) assert.equal(PH.looksSecret(ok), null);
  // and a plain bad address
  for (const bad of ["hello", "", 5, SOL, "11111111111111111111111111111111"]) assert.equal((await post("/connect", { address: bad })).status, 400);
  assert.equal((await post("/trade", { mint: MINT, side: "buy", sol: 0.1 })).error.message, "Connect Phantom first");
});

test("connect stores the public address only; the card reads his balances by that address", async () => {
  await (await import("../src/aq/feeds.mjs")).feeds.jupTop(env); // what the paper tick does every minute
  const r = await post("/connect", { address: ME }); assert.equal(r.status, 200); assert.deepEqual({ connected: r.connected, address: r.address }, { connected: true, address: ME });
  assert.deepEqual(Object.keys(await st("phantom")).sort(), ["address", "connectedAt", "seenAt"]);
  const s = await J(await R("GET", "/api/aq/phantom", { cookie })); assert.equal(s.connected, true); assert.equal(s.address, ME); assert.equal(s.sol, 3); assert.deepEqual(s.tokens.map((t) => [t.mint, t.amount]), [[MINT, 80]]);
  assert.ok(F.calls.every((c) => ["getBalance", "getTokenAccountsByOwner"].includes(c)), F.calls.join());
  assert.equal(s.coins[0].mint, GTA); assert.equal(s.coins[0].from, "GTA6 main coin"); assert.ok(s.coins.some((c) => c.mint === MINT && c.from === "candidate"));
  const pub = (await buildState(env)).phantom; assert.equal(pub.address, ME); assert.equal(pub.sol, 3); assert.match(pub.note, /only happen while this page is open/);
});

test("a buy is built for HIS address and handed back unsigned; the server cannot sign it and sends nothing", async () => {
  assert.equal(await st("sol_wallet_key"), null, "there is no key of any kind on this server in this test");
  for (const bad of [{ mint: MINT, side: "buy" }, { mint: MINT, side: "buy", sol: -1 }, { mint: MINT, side: "hold", sol: 1 }, { mint: "nope", side: "buy", sol: 1 }, { mint: SOL, side: "buy", sol: 1 }, { mint: MINT, side: "buy", sol: 1, to: OTHER }, { mint: MINT, side: "sell", pct: 33 }]) assert.equal((await post("/trade", bad)).status, 400, JSON.stringify(bad));
  assert.match((await post("/trade", { mint: MINT, side: "buy", sol: 5 })).error.message, /not enough for 5 SOL/);
  const t = await post("/trade", { mint: MINT, side: "buy", sol: 0.1 }); assert.equal(t.status, 201);
  const tx = L.readTx(t.tx); assert.equal(tx.payer, ME); assert.equal(tx.nsig, 1); assert.ok(tx.bytes.subarray(tx.sigStart, tx.sigStart + 64).every((b) => b === 0), "the signature slot is empty: only Phantom can fill it");
  assert.equal(F.swapBody.userPublicKey, ME); assert.equal(F.swapBody.quoteResponse.inAmount, "100000000");
  assert.deepEqual({ side: t.side, symbol: t.symbol, mint: t.mint, solIn: t.solIn, expectOut: t.expectOut, minOut: t.minOut, impactPct: t.impactPct, feeSol: t.feeSol, wallet: t.wallet, warnings: t.warnings }, { side: "buy", symbol: "BONK", mint: MINT, solIn: 0.1, expectOut: 50, minOut: 49.5, impactPct: 0.1, feeSol: 0.000014555, wallet: ME, warnings: [] });
  const [o] = await orders(); assert.equal(o.status, "requested"); assert.equal(o.signature, null); assert.equal(o.wallet, ME); assert.equal(o.venue, "phantom"); assert.equal(Number(o.id), t.orderId);
  assert.ok(!F.calls.includes("sendTransaction")); assert.equal((await positions()).length, 0, "nothing is counted as bought until the chain says so");
  // the file has no way to sign or send, by construction
  const src = readFileSync(new URL("../src/aq/phantom.mjs", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/signTx|unseal|subtle|importKey|sendTransaction|sealed/.test(src));
  // warnings he can see; hard stops
  F.rug = { ...F.rug, mintAuthority: "Auth111" }; await d.q(`DELETE FROM mob_aq_market WHERE k LIKE 'rug:%'`);
  const w = await post("/trade", { mint: THIN, side: "buy", sol: 0.1 }); assert.equal(w.status, 201); assert.match(w.warnings.join(" | "), /Thin pool: about \$30,000, under \$100K/); assert.match(w.warnings.join(" | "), /Safety check: safety: mint authority enabled/);
  const g = await post("/trade", { mint: GTA, side: "buy", sol: 0.1 }); assert.equal(g.status, 201); assert.equal(g.symbol, "GTA6"); assert.equal(g.mint, GTA); assert.match(g.warnings.join(" | "), /not on Jupiter's lists/); assert.equal(g.decimals, 6);
  F.impact = "0.03"; assert.match((await post("/trade", { mint: MINT, side: "buy", sol: 0.1 })).warnings.join(" "), /Price impact 3%/);
  F.impact = "0.2"; assert.match((await post("/trade", { mint: MINT, side: "buy", sol: 0.1 })).error.message, /would move the price 20%/);
  F.impact = "0.001"; F.jupSim = { errorCode: "TRANSACTION_ERROR", error: "insufficient lamports" }; assert.match((await post("/trade", { mint: MINT, side: "buy", sol: 0.1 })).error.message, /Jupiter's own simulation failed/);
  F.jupSim = null; F.payer = OTHER; assert.match((await post("/trade", { mint: MINT, side: "buy", sol: 0.1 })).error.message, /not a one-signature transaction of your Phantom wallet/);
});

test("the signature he reports: unknown to the chain = nothing recorded; real = one trade record, however often it is posted", async () => {
  await d.q(`DELETE FROM mob_aq_live_orders`); const t = await post("/trade", { mint: MINT, side: "buy", sol: 0.1 }), sig = sigOf(7);
  for (const bad of [{ orderId: t.orderId }, { orderId: t.orderId, signature: "abc" }, { orderId: t.orderId, signature: ME }, { orderId: "1", signature: sig }, { orderId: t.orderId, signature: sig, status: "confirmed" }]) assert.equal((await post("/sent", bad)).status, 400);
  assert.equal((await post("/sent", { orderId: 999999, signature: sig })).status, 404);
  // a signature the chain has never seen: accepted for a retry, but NOT written down
  let r = await post("/sent", { orderId: t.orderId, signature: sig }); assert.equal(r.status, 202); assert.equal(r.notSeenYet, true);
  let [o] = await orders(); assert.equal(o.status, "requested"); assert.equal(o.signature, null); assert.equal((await positions()).length, 0);
  // a real signature of somebody else's transaction is not this order
  const foreign = sigOf(9); land(foreign, { payer: OTHER, sol: -0.1, tokens: "5000000" });
  r = await post("/sent", { orderId: t.orderId, signature: foreign }); assert.equal(r.status, 200); assert.equal(r.state, "failed"); assert.equal(r.reason, "that signature belongs to a different transaction, not to this order");
  assert.equal((await orders())[0].status, "failed"); assert.equal((await positions()).length, 0);
  // the real thing, posted twice at once and once more later
  const t2 = await post("/trade", { mint: MINT, side: "buy", sol: 0.1 }), real = sigOf(11); land(real, { sol: -0.10204, tokens: "5000000" });
  const [a, b] = await Promise.all([post("/sent", { orderId: t2.orderId, signature: real }), post("/sent", { orderId: t2.orderId, signature: real })]);
  assert.deepEqual([a.status, b.status], [200, 200]); const c = await post("/sent", { orderId: t2.orderId, signature: real }); assert.equal(c.already, true);
  o = (await orders()).find((x) => Number(x.id) === t2.orderId); assert.equal(o.status, "confirmed"); assert.equal(o.signature, real); assert.equal(o.fill_tokens, "5000000");
  let ps = await positions(); assert.equal(ps.length, 1, "one position, bought once"); assert.equal(ps[0].tokens_raw, "5000000"); assert.ok(Math.abs(ps[0].cost_sol - 0.10204) < 1e-9); assert.equal(ps[0].status, "open");
  // the same signature cannot be used for another order; a second real buy adds to the position
  const t3 = await post("/trade", { mint: MINT, side: "buy", sol: 0.1 }); assert.match((await post("/sent", { orderId: t3.orderId, signature: real })).error.message, /already recorded for another order/);
  const s3 = sigOf(13); land(s3, { sol: -0.1, tokens: "4000000" }); assert.equal((await post("/sent", { orderId: t3.orderId, signature: s3 })).status, 200);
  ps = await positions(); assert.equal(ps.length, 1); assert.equal(ps[0].tokens_raw, "9000000"); assert.ok(Math.abs(ps[0].cost_sol - 0.20204) < 1e-9);
  // sell half, then all: his on-chain balance decides the amount, the ledger takes the matching share of the cost
  assert.match((await post("/trade", { mint: THIN, side: "sell", pct: 50 })).error.message, /does not hold this coin/);
  const sh = await post("/trade", { mint: MINT, side: "sell", pct: 50 }); assert.equal(sh.status, 201); assert.equal(F.swapBody.quoteResponse.inAmount, "4000000"); assert.equal(sh.tokensIn, 40); assert.equal(sh.expectOut, 0.06);
  const s4 = sigOf(15); land(s4, { sol: 0.12, tokens: "-4500000" }); await post("/sent", { orderId: sh.orderId, signature: s4 });
  ps = await positions(); assert.equal(ps[0].status, "open"); assert.equal(ps[0].tokens_raw, "4500000"); assert.ok(Math.abs(ps[0].cost_sol - 0.10102) < 1e-9); assert.ok(Math.abs(ps[0].pnl_sol - (0.12 - 0.10102)) < 1e-9);
  const sa = await post("/trade", { mint: MINT, side: "sell", pct: 100 }); assert.equal(F.swapBody.quoteResponse.inAmount, "8000000"); const s5 = sigOf(17); land(s5, { sol: 0.05, tokens: "-4500000" }); await post("/sent", { orderId: sa.orderId, signature: s5 });
  ps = await positions(); assert.equal(ps[0].status, "closed"); assert.ok(Math.abs(ps[0].pnl_sol - (0.12 + 0.05 - 0.20204)) < 1e-9);
  const pub = (await buildState(env)).phantom; assert.equal(pub.positions.length, 0); assert.ok(Math.abs(pub.pnlSol - (-0.03204)) < 1e-6); assert.equal(pub.orders[0].signature, s5);
  // an order he never approved closes itself; one that was sent is settled by the timer even with the page shut
  const no = await post("/trade", { mint: MINT, side: "buy", sol: 0.1 }); assert.equal((await post("/cancel", { orderId: no.orderId })).cancelled, true); assert.equal((await orders()).find((x) => Number(x.id) === no.orderId).error, "you said no in Phantom");
  assert.equal((await post("/cancel", { orderId: sa.orderId })).cancelled, false, "an order that reached the chain cannot be cancelled"); assert.equal((await post("/sent", { orderId: no.orderId, signature: sigOf(31) })).status, 400);
  const never = await post("/trade", { mint: MINT, side: "buy", sol: 0.1 }); assert.equal((await orders()).find((x) => Number(x.id) === never.orderId).status, "requested");
  await d.q(`UPDATE mob_aq_live_orders SET requested_at = now() - interval '11 minutes' WHERE status = 'requested'`); await J(await R("GET", "/api/aq/phantom", { cookie }));
  assert.ok((await orders()).filter((x) => x.error === "not approved in Phantom").length >= 1); assert.equal((await orders()).filter((x) => x.status === "requested").length, 0);
});

test("signals: the chart trader's setup and SELL NOW, only while the page is open; FUND AQUARIUS WALLET goes to the Aquarius address only", async () => {
  await d.q(`DELETE FROM mob_aq_live_positions`); await d.q(`DELETE FROM mob_aq_state WHERE k = 'phantom_signal'`); await d.q(`DELETE FROM mob_aq_market`);
  const ph = await st("phantom"), setPh = (v) => d.q(`UPDATE mob_aq_state SET v = $1 WHERE k = 'phantom'`, [JSON.stringify(v)]);
  await setPh({ ...ph, seenAt: new Date(Date.now() - 10 * 60000).toISOString() }); assert.equal(await L.phantomWatch(env), null); assert.equal((await buildState(env)).phantom.signal, null, "page closed: nothing is looked for");
  await setPh({ ...ph, seenAt: new Date().toISOString() }); const w = await L.phantomWatch(env); assert.equal(w.signal, "BONK");
  let pub = (await buildState(env)).phantom; assert.equal(pub.signal.mint, MINT); assert.equal(pub.signal.symbol, "BONK"); assert.match(pub.signal.why, /golden pocket bounce/);
  assert.ok(pub.signal.zone[0] < pub.signal.zone[1] && pub.signal.stop < pub.signal.entry && pub.signal.entry >= pub.signal.zone[0] && pub.signal.t1 > pub.signal.zone[1] && pub.signal.t2 > pub.signal.t1, "the banner carries zone, stop and targets");
  assert.ok(!F.calls.includes("sendTransaction") && !F.calls.includes("swap"), "a signal builds nothing and sends nothing");
  // the same cost gate as the live trader: a 2% round trip means no signal
  await d.q(`DELETE FROM mob_aq_state WHERE k = 'phantom_signal'`); await d.q(`DELETE FROM mob_aq_market`); F.sellOut = "49000000"; assert.equal((await L.phantomWatch(env)).signal, null); assert.equal((await buildState(env)).phantom.signal, null); F.sellOut = "60000000";
  // he holds it with the signal's plan: no buy signal for it; no SELL NOW while the chart holds, however long; SELL NOW when a 5-minute close breaks the stop
  const n = Math.floor(Date.now() / 1000), start = Math.floor(n / 60) * 60 - 20 * 60, base = chart(start), s = C.entrySetup(base, start); assert.equal(s.signal, true);
  const plan = C.planOf(s, start, { liq: 250000 }), rows = (p, k) => Array.from({ length: k }, () => [p, p, 5]);
  const put = (rs) => { F.candles = asJup([...base, ...rs.map(([o, c, v], k) => ({ t: start + k * 60, o, h: Math.max(o, c) * 1.001, l: Math.min(o, c) * 0.999, c, v }))]).candles; return d.q(`DELETE FROM mob_aq_market`); };
  await d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, tokens_raw, cost_sol, stop_pct, opened_at, plan) VALUES ('phantom',$1,'BONK','open','5000000',0.1,10, now() - interval '3 days', $2)`, [MINT, JSON.stringify(plan)]);
  await put(rows(116, 20)); await L.phantomWatch(env); pub = (await buildState(env)).phantom; assert.equal(pub.signal, null); assert.equal(pub.positions[0].sellNow, null, "three days in, the chart holds: no timer"); assert.equal(pub.positions[0].valueSol, 0.06);
  assert.ok(pub.positions[0].plan && pub.positions[0].plan.stop === plan.stop);
  await put([...rows(114.6, 5), ...rows(plan.stop - 0.5, 15)]); await L.phantomWatch(env); pub = (await buildState(env)).phantom; assert.match(pub.positions[0].sellNow, /^stop: a 5-minute close/);
  // a minute with no candles leaves the SELL NOW up
  F.candles = []; await d.q(`DELETE FROM mob_aq_market`); mock("GET", /^https:\/\/datapi\.jup\.ag\/v2\/charts\//, () => new Response("{}", { status: 500 })); await L.phantomWatch(env);
  assert.match((await buildState(env)).phantom.positions[0].sellNow, /^stop/); F.candles = null; world();
  assert.equal((await positions())[0].status, "open", "Aquarius never sells a Phantom position: it only says so");
  // funding the Aquarius wallet
  assert.match((await post("/fund", { sol: 0.5 })).error.message, /Create the Aquarius wallet first/);
  await W.createWallet(env); const aq = (await st("sol_wallet_key")).address;
  assert.equal((await post("/fund", { sol: 0.5, to: OTHER })).status, 400); assert.equal((await post("/connect", { address: aq })).error.message, "That is the Aquarius wallet's address, not your Phantom");
  const f = await post("/fund", { sol: 0.5 }); assert.equal(f.status, 201); assert.equal(f.destination, aq); const b = Buffer.from(f.tx, "base64");
  assert.equal(W.base58(b.subarray(69, 101)), ME); assert.equal(W.base58(b.subarray(101, 133)), aq); assert.equal(Number(b.readBigUInt64LE(65 + 142)), 500000000); assert.ok(b.subarray(1, 65).every((x) => x === 0), "unsigned, although a key now exists on the server: it is not his");
  const fs = sigOf(21); land(fs, { sol: -0.500005 }); const r = await post("/sent", { orderId: f.orderId, signature: fs }); assert.equal(r.status, 200);
  const fo = (await orders()).find((x) => Number(x.id) === f.orderId); assert.equal(fo.status, "confirmed"); assert.equal(fo.side, "fund"); assert.equal(fo.dest, aq); assert.equal((await positions()).length, 1);
  F.simErr = "AccountNotFound"; assert.equal((await post("/fund", { sol: 0.5 })).error.message, "Your Phantom has no SOL");
  // disconnect forgets the address
  assert.equal((await post("/disconnect", {})).connected, false); assert.equal(await st("phantom"), null); assert.equal((await buildState(env)).phantom.connected, false);
});

test("the page talks only to this site: no outside fetch, no key field, Phantom called only as documented", () => {
  const page = readFileSync(new URL("../aq/phantom.js", import.meta.url), "utf8"), code = page.replace(/^\s*\/\/.*$/gm, "");
  assert.deepEqual([...code.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1].trim()), ['"/api/aq/phantom" + path']);
  assert.deepEqual([...new Set(code.match(/https?:\/\/[a-zA-Z0-9.\-]+/g))], ["https://solscan.io"], "the only outside address is the Solscan link he may click");
  assert.deepEqual([...new Set([...code.matchAll(/\bp\.(\w+)\(/g)].map((m) => m[1]))].sort(), ["connect", "disconnect", "on", "signAndSendTransaction"]);
  assert.ok(!/signTransaction\(|signAllTransactions|signMessage|secretKey|privateKey|mnemonic|seed phrase/i.test(code));
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket\(/.test(AQ_PHANTOM_JS), "the chunk with Solana's library cannot reach a network");
  assert.deepEqual([...new Set(AQ_JS.match(/https?:\/\/[a-zA-Z0-9.\-]+/g))], ["https://solscan.io"]);
  assert.ok(!/cursor|gmgn/i.test(page + readFileSync(new URL("../aq/wallet.js", import.meta.url), "utf8")));
});
