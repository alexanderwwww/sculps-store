// Aquarius Solana wallet (src/aq/wallet.mjs): server-made key, sealed at rest, never returned; balances; limits.
// Throwaway schema (helpers.makeEnv); the Solana RPC is mocked with the shapes read live from mainnet on 2026-11-18.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, dropEnv, reqOf, login, mock, resetMocks, calls } from "./helpers.mjs";
import { db } from "../src/db.mjs";
import { unseal } from "../src/auth.mjs";
import * as W from "../src/aq/wallet.mjs";
import { buildState, _resetSeeded } from "../src/aq/engine.mjs";

let env, R, cookie; const seen = [];
const st = async (k) => (await db(env).one(`SELECT v FROM mob_aq_state WHERE k=$1`, [k]))?.v ?? null;
const J = async (r) => { const t = await r.text(); seen.push(t); return JSON.parse(t); };
function fakeRpc() {
  mock("POST", "https://mainnet.helius-rpc.com/", (c) => { const m = JSON.parse(c.body), ctx = { slot: 1, apiVersion: "4.3.0" };
    if (m.method === "getBalance") return { jsonrpc: "2.0", id: 1, result: { context: ctx, value: 1250000000 } };
    if (m.method === "getTokenAccountsByOwner") return { jsonrpc: "2.0", id: 1, result: { context: ctx, value: m.params[1].programId.startsWith("Tokenkeg") ? [
      { pubkey: "acc1", account: { lamports: 2039280, data: { program: "spl-token", parsed: { info: { isNative: false, mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", owner: m.params[0], state: "initialized", tokenAmount: { amount: "123450000", decimals: 5, uiAmount: 1234.5, uiAmountString: "1234.5" } }, type: "account" }, space: 165 } } },
      { pubkey: "acc2", account: { data: { parsed: { info: { mint: "EmptyMint1111111111111111111111111111111111", tokenAmount: { amount: "0", decimals: 6, uiAmount: 0 } } } } } }] : [] } };
    return { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } }; });
}
before(async () => { env = await makeEnv({ HELIUS_API_KEY: "helius-secret-key" }); _resetSeeded(); R = reqOf(env); cookie = await login(env); });
after(async () => { await dropEnv(env); });
beforeEach(() => { resetMocks(); fakeRpc(); });

test("base58 and the key: a 32-byte public key, a valid Solana address, a sealed secret that proves itself", async () => {
  assert.equal(W.base58(new Uint8Array(32)), "11111111111111111111111111111111"); // the System Program address
  assert.equal(W.base58(W.unbase58("So11111111111111111111111111111111111111112")), "So11111111111111111111111111111111111111112");
  assert.equal(W.unbase58("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").length, 32);
  assert.equal(Buffer.from(W.unbase58("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")).toString("hex"), "06ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9");
  assert.throws(() => W.unbase58("0OIl"));
  const a = await W.makeKey(env), b = await W.makeKey(env);
  assert.match(a.address, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/); assert.equal(W.unbase58(a.address).length, 32); assert.notEqual(a.address, b.address);
  assert.match(a.sealed, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const pkcs8 = Buffer.from(await unseal(env, a.sealed), "base64"); assert.equal(pkcs8.length, 48); // encryption round trip
  // the opened key really is this address's key (node's own crypto derives the public key from it)
  const { createPrivateKey, createPublicKey } = await import("node:crypto");
  const pub = createPublicKey(createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" })).export({ format: "der", type: "spki" }).subarray(-32);
  assert.equal(W.base58(pub), a.address);
  assert.equal(await W.proves(env, a.sealed, a.address), true); assert.equal(await W.proves(env, a.sealed, b.address), false, "a key does not pass for another address");
  await assert.rejects(unseal({ MOB_ENC_KEY: "another-key" }, a.sealed));
});

test("routes: admin session only; nothing exists and nothing is asked of Solana before CREATE", async () => {
  assert.equal((await R("GET", "/api/aq/wallet")).status, 401); assert.equal((await R("POST", "/api/aq/wallet/create")).status, 401);
  assert.equal((await R("POST", "/api/aq/wallet/create", { bearer: env.MOB_API_TOKEN })).status, 403); assert.equal((await R("GET", "/api/aq/wallet", { bearer: env.MOB_API_TOKEN })).status, 403);
  assert.equal(await st("sol_wallet_key"), null);
  const s = await J(await R("GET", "/api/aq/wallet", { cookie }));
  assert.deepEqual(s, { exists: false, address: null, createdAt: null, sol: null, tokens: null, checkedAt: null, source: null, limits: W.WALLET_LIMIT_DEFAULTS, lastError: null, liveOrders: false });
  assert.equal(calls.length, 0);
  for (const p of ["/api/aq/wallet/export", "/api/aq/wallet/key", "/api/aq/wallet/send", "/api/aq/wallet/swap", "/api/aq/wallet/transfer"]) { assert.equal((await R("GET", p, { cookie })).status, 404); assert.equal((await R("POST", p, { cookie, body: {} })).status, 404); }
  assert.equal((await R("DELETE", "/api/aq/wallet", { cookie })).status, 404);
});

test("create is once only: a second press, and two presses at the same moment, leave one wallet", async () => {
  const [a, b] = await Promise.all([R("POST", "/api/aq/wallet/create", { cookie }), R("POST", "/api/aq/wallet/create", { cookie })]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  const made = await J(a.status === 201 ? a : b), lost = await J(a.status === 201 ? b : a);
  assert.deepEqual(Object.keys(made).sort(), ["address", "created", "createdAt"]); assert.equal(W.unbase58(made.address).length, 32);
  assert.equal(lost.error.code, "exists");
  const row = await st("sol_wallet_key"); assert.equal(row.address, made.address); assert.equal(await W.proves(env, row.sealed, row.address), true);
  const again = await R("POST", "/api/aq/wallet/create", { cookie }); assert.equal(again.status, 409); await J(again);
  assert.equal((await st("sol_wallet_key")).sealed, row.sealed, "the first key is never replaced");
});

test("read: address, SOL and coins from the RPC; the state the panel polls carries them and asks nobody", async () => {
  const row = await st("sol_wallet_key");
  const s = await J(await R("GET", "/api/aq/wallet?fresh=1", { cookie }));
  assert.equal(s.exists, true); assert.equal(s.address, row.address); assert.equal(s.sol, 1.25); assert.equal(s.source, "helius"); assert.equal(s.lastError, null);
  assert.deepEqual(s.tokens, [{ mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", amount: 1234.5, raw: "123450000", decimals: 5 }]);
  assert.deepEqual(calls.map((c) => JSON.parse(c.body).method), ["getBalance", "getTokenAccountsByOwner", "getTokenAccountsByOwner"]);
  assert.ok(calls.every((c) => JSON.parse(c.body).params[0] === row.address));
  const n = calls.length; await J(await R("GET", "/api/aq/wallet", { cookie })); assert.equal(calls.length, n, "inside a minute the stored read is served");
  const state = await buildState(env); seen.push(JSON.stringify(state));
  assert.equal(state.solWallet.address, row.address); assert.equal(state.solWallet.sol, 1.25); assert.equal(state.solWallet.liveOrders, false);
  assert.ok(state.wallet && "baseSol" in state.wallet, "the paper wallet's own state field is untouched");
  // the RPC failing: the reason is kept without the Helius key, the last good numbers stay
  resetMocks(); mock("POST", "https://mainnet.helius-rpc.com/", () => { throw new Error("connect failed https://mainnet.helius-rpc.com/?api-key=helius-secret-key"); });
  const f = await J(await R("GET", "/api/aq/wallet?fresh=1", { cookie }));
  assert.match(f.lastError, /Helius did not answer getBalance/); assert.equal(f.sol, 1.25);
  assert.deepEqual(await W.walletWarm(env), { ok: false });
});

test("limits: zero and off by default, numbers 0 or more, auto trade is only a stored flag and needs limits first", async () => {
  const L = (body) => R("POST", "/api/aq/wallet/limits", { cookie, body });
  assert.deepEqual(W.WALLET_LIMIT_DEFAULTS, { maxPerTradeSol: 0, maxDailyLossSol: 0, maxOpenPositions: 0, autoTrade: false });
  for (const bad of [{ maxPerTradeSol: -0.1 }, { maxPerTradeSol: "1" }, { maxDailyLossSol: null }, { maxOpenPositions: 2.5 }, { autoTrade: "on" }, { maxPerTradeUsd: 5 }, { maxPerTradeSol: 1e9 }, { autoTrade: true }])
    { const r = await L(bad); assert.equal(r.status, 400, JSON.stringify(bad)); await J(r); }
  assert.equal(await st("sol_wallet_limits"), null);
  let r = await L({ maxPerTradeSol: 0.05, maxDailyLossSol: 0.2, maxOpenPositions: 2 }); assert.equal(r.status, 200);
  assert.deepEqual((await J(r)).limits, { maxPerTradeSol: 0.05, maxDailyLossSol: 0.2, maxOpenPositions: 2, autoTrade: false });
  r = await L({ autoTrade: true }); assert.equal(r.status, 200); await J(r);
  assert.equal((await L({ maxDailyLossSol: 0 })).status, 400);
  assert.equal((await buildState(env)).solWallet.limits.autoTrade, true);
});

test("the secret is nowhere: no response, no state, no brain row, no log line; the module cannot send anything", async () => {
  const row = await st("sol_wallet_key"), b64 = await unseal(env, row.sealed), raw = Buffer.from(b64, "base64"), seed = raw.subarray(-32);
  const { default: worker } = await import("../src/worker.mjs"); const logs = []; const log = console.log; console.log = (...a) => logs.push(a.join(" "));
  try { await new Promise((ok) => worker.scheduled({ cron: "*/5 * * * *" }, env, { waitUntil: (p) => p.then(ok, ok) })); await new Promise((r) => setTimeout(r, 1500)); } finally { console.log = log; }
  const others = await db(env).q(`SELECT k, v FROM mob_aq_state WHERE k <> 'sol_wallet_key'`);
  const { backup, gunzip } = await import("../src/aq/keeper.mjs"); const bk = await backup(env, { day: "2026-11-18" }); assert.equal(bk.ok, true);
  seen.push(await gunzip(env.MEDIA.store.get(bk.key))); // the daily backup can be downloaded through a route, so it must not carry the key either
  const hay = JSON.stringify([seen, logs, others, await db(env).q(`SELECT text, data FROM mob_aq_brain`)]);
  const forms = [b64, raw.toString("hex"), seed.toString("hex"), seed.toString("base64"), W.base58(seed), W.base58(Buffer.concat([seed, W.unbase58(row.address)])), JSON.stringify([...seed]).slice(1, -1), row.sealed, "helius-secret-key"];
  for (const f of forms) assert.ok(!hay.includes(f), "no form of the key is in any response, log, state row or brain row");
  assert.ok(seen.length >= 10 && seen.some((t) => t.includes(row.address)), "the responses were really collected, and they carry the public address");
  // no transaction code: the module never names a send/sign-transaction RPC, and signs exactly once (the fixed self-check)
  const src = readFileSync(new URL("../src/aq/wallet.mjs", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/sendTransaction|sendRawTransaction|simulateTransaction|requestAirdrop|jup\.ag|swap|transfer/i.test(src));
  assert.equal(src.split("subtle.sign(").length - 1, 1); assert.equal(src.split('"getBalance"').length + src.split('"getTokenAccountsByOwner"').length - 2, 2);
  const routes = readFileSync(new URL("../src/aq/routes.mjs", import.meta.url), "utf8");
  assert.ok(!/unseal|sealed/.test(routes), "the routes file never touches a sealed value");
});
