// The way out of the Aquarius wallet (src/aq/payout.mjs): payout address, SOL withdrawal, key restore. Fake Solana RPC on a
// throwaway schema: nothing real is sent (an unmocked fetch throws, helpers.mjs).
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import { makeEnv, dropEnv, reqOf, login, mock, resetMocks } from "./helpers.mjs";
import { db } from "../src/db.mjs";
import { unseal } from "../src/auth.mjs";
import * as P from "../src/aq/payout.mjs";
import * as W from "../src/aq/wallet.mjs";
import * as L from "../src/aq/live.mjs";
import { buildState, _resetSeeded } from "../src/aq/engine.mjs";

let env, R, cookie, d, wallet, DEST, DEST2; const seen = [], F = {};
const TOKEN_ACCT = "11RiDGRArdrt8Y83d3hd88ELWRNJbtsbKDFppwF8ev", SYS = "11111111111111111111111111111111";
const one = (q, p) => d.one(q, p), st = async (k) => (await one(`SELECT v FROM mob_aq_state WHERE k=$1`, [k]))?.v ?? null;
const setS = (k, v) => d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ($1,$2,now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [k, JSON.stringify(v)]);
const J = async (r) => { const t = await r.text(); seen.push(t); return { status: r.status, ...JSON.parse(t) }; };
const post = async (path, body) => J(await R("POST", path, { cookie, body }));
const orders = () => d.q(`SELECT * FROM mob_aq_live_orders ORDER BY id`);
// what a serialized transfer says: who pays, where to, how much
const decode = (b64) => { const b = Buffer.from(b64, "base64"); return { from: W.base58(b.subarray(69, 101)), to: W.base58(b.subarray(101, 133)), program: W.base58(b.subarray(133, 165)), lamports: Number(b.readBigUInt64LE(65 + 142)), kind: b.readUInt32LE(65 + 138), sig: b.subarray(1, 65), msg: b.subarray(65) }; };
function world() {
  resetMocks();
  Object.assign(F, { balance: 2_000_000_000, destBal: {}, owner: { [TOKEN_ACCT]: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, simErr: null, simWallet: null, simDest: null, send: "ok", sent: [], status: {}, txs: {}, height: 1000, lastValid: 2000, calls: [], rowAtSend: null });
  mock("POST", "https://mainnet.helius-rpc.com/", async (c) => { const m = JSON.parse(c.body), ok = (result) => ({ jsonrpc: "2.0", id: 1, result }), val = (value) => ok({ context: { slot: 1 }, value }); F.calls.push(m.method);
    if (m.method === "getBalance") return val(F.balance);
    if (m.method === "getTokenAccountsByOwner") return val([]);
    if (m.method === "getMinimumBalanceForRentExemption") return ok(650240);
    if (m.method === "getLatestBlockhash") return val({ blockhash: "CtZPwQCiDbsGsxevfnEksSK4nviBJD6vVZVAcR6Tw2z8", lastValidBlockHeight: F.lastValid });
    if (m.method === "getFeeForMessage") return val(5000);
    if (m.method === "getBlockHeight") return ok(F.height);
    if (m.method === "getAccountInfo") { const a = m.params[0]; return val(F.owner[a] ? { owner: F.owner[a], lamports: 2039280, executable: false } : F.destBal[a] != null ? { owner: SYS, lamports: F.destBal[a], executable: false } : null); }
    if (m.method === "simulateTransaction") { const t = decode(m.params[0]); return val({ err: F.simErr, logs: [], accounts: F.simErr ? [null, null] : [{ lamports: F.simWallet ?? F.balance - t.lamports - 5000 }, { lamports: F.simDest ?? (F.destBal[t.to] ?? 0) + t.lamports }] }); }
    if (m.method === "sendTransaction") { const t = decode(m.params[0]); F.sent.push(t); F.rowAtSend = await one(`SELECT status, signature, dest, in_amount FROM mob_aq_live_orders ORDER BY id DESC LIMIT 1`);
      if (F.send === "throw") throw new Error("socket hang up");
      const sig = W.base58(t.sig); F.status[sig] = { confirmationStatus: "confirmed", err: null }; F.txs[sig] = landed(t); return ok(sig); }
    if (m.method === "getSignatureStatuses") return val(m.params[0].map((s) => F.status[s] ?? null));
    if (m.method === "getTransaction") return ok(F.txs[m.params[0]] ?? null);
    return { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } }; });
}
const landed = (t) => ({ slot: 9, meta: { err: null, fee: 5000, preBalances: [F.balance, 0, 1], postBalances: [F.balance - t.lamports - 5000, t.lamports, 1], preTokenBalances: [], postTokenBalances: [] }, transaction: { message: { accountKeys: [t.from, t.to, SYS] }, signatures: ["s"] } });
const wipe = async () => { await d.q(`DELETE FROM mob_aq_live_orders`); await d.q(`DELETE FROM mob_aq_live_positions`); await setS("sol_payout", { address: DEST, setAt: new Date().toISOString(), lockedUntil: null, previous: null }); };

before(async () => { env = await makeEnv({ HELIUS_API_KEY: "hk", AQ_LIVE_POLL_MS: "0", AQ_JUP_GAP_MS: "0" }); _resetSeeded(); R = reqOf(env); cookie = await login(env); d = db(env); world(); await buildState(env);
  DEST = (await W.makeKey(env)).address; DEST2 = (await W.makeKey(env)).address; });
after(async () => { await dropEnv(env); });
beforeEach(() => world());

test("payout address: Alex only, a real wallet address only, and never the wallet itself", async () => {
  for (const p of ["/api/aq/wallet/payout-address", "/api/aq/wallet/withdraw", "/api/aq/wallet/restore"]) { assert.equal((await R("POST", p, { body: {} })).status, 401); assert.equal((await R("POST", p, { bearer: env.MOB_API_TOKEN, body: {} })).status, 403); }
  assert.equal((await R("GET", "/api/aq/wallet/withdraw-preview?sol=all")).status, 401);
  assert.match((await post("/api/aq/wallet/payout-address", { address: DEST })).error.message, /Create the wallet first/);
  assert.match((await post("/api/aq/wallet/withdraw", { sol: 1 })).error.message, /has not been created/);
  await W.createWallet(env); wallet = await st("sol_wallet_key");
  assert.match((await post("/api/aq/wallet/withdraw", { sol: 1 })).error.message, /Save a payout address first/);
  const bad = async (address, re) => { const r = await post("/api/aq/wallet/payout-address", { address }); assert.equal(r.status, 400, String(address)); assert.match(r.error.message, re); };
  await bad("", /not a Solana address/); await bad("hello", /not a Solana address/); await bad("0OIl" + DEST.slice(4), /not a Solana address/); await bad(12345, /not a Solana address/);
  await bad(DEST.slice(0, 20) + DEST.slice(0, 20), /32 bytes|not a Solana address/); await bad(W.base58(new Uint8Array(31).fill(7)), /not a Solana address/);
  await bad(wallet.address, /own address/); await bad(SYS, /program, not a wallet/); await bad("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", /program, not a wallet/); await bad("So11111111111111111111111111111111111111112", /program, not a wallet/); await bad("SysvarRent111111111111111111111111111111111", /program, not a wallet/);
  await bad(TOKEN_ACCT, /token account or a program/);
  assert.equal((await post("/api/aq/wallet/payout-address", { address: DEST, lockedUntil: null })).status, 400, "only the address is accepted");
  assert.equal(await st("sol_payout"), null);
  assert.equal(P.checkAddress(DEST, wallet.address), null);
});

test("the first address has no lock; changing it locks withdrawals for 24 hours", async () => {
  let r = await post("/api/aq/wallet/payout-address", { address: ` ${DEST} ` }); assert.equal(r.status, 200); assert.deepEqual(Object.keys(r.payout), ["address", "setAt", "lockedUntil"]); assert.equal(r.payout.address, DEST); assert.equal(r.payout.lockedUntil, null);
  assert.equal((await post("/api/aq/wallet/withdraw-preview", {})).status, 404);
  let pv = await J(await R("GET", "/api/aq/wallet/withdraw-preview?sol=0.5", { cookie })); assert.equal(pv.ok, true); assert.equal(pv.destination, DEST); assert.equal(pv.sol, 0.5);
  r = await post("/api/aq/wallet/payout-address", { address: DEST }); assert.equal(r.payout.lockedUntil, null, "saving the same address again changes nothing");
  r = await post("/api/aq/wallet/payout-address", { address: DEST2 }); const until = new Date(r.payout.lockedUntil).getTime() - Date.now(); assert.ok(until > 23.9 * 3600e3 && until <= 24 * 3600e3);
  assert.equal((await st("sol_payout")).previous, DEST);
  const w = await post("/api/aq/wallet/withdraw", { sol: 0.5 }); assert.equal(w.status, 400); assert.match(w.error.message, /payout address was changed\. Withdrawals open again on .* Athens time/); assert.equal(F.sent.length, 0); assert.equal((await orders()).length, 0);
  pv = await J(await R("GET", "/api/aq/wallet/withdraw-preview?sol=all", { cookie })); assert.match(pv.error, /open again/);
  r = await post("/api/aq/wallet/payout-address", { address: DEST }); assert.ok(r.payout.lockedUntil, "changing it back is a change too");
  const s = (await buildState(env)).solWallet; assert.equal(s.payout.address, DEST); assert.ok(s.payout.lockedUntil);
  // the lock ends by itself
  await setS("sol_payout", { ...(await st("sol_payout")), lockedUntil: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await buildState(env)).solWallet.payout.lockedUntil, null); assert.equal((await J(await R("GET", "/api/aq/wallet/withdraw-preview?sol=0.5", { cookie }))).ok, true);
});

test("a withdrawal: only to the saved address, recorded before it is sent, signed by the wallet, confirmed from the chain", async () => {
  await wipe();
  // the request can never carry a destination
  for (const body of [{ sol: 0.5, to: DEST2 }, { sol: 0.5, destination: DEST2 }, { sol: 0.5, address: DEST2 }, { sol: "all", dest: DEST2 }, [0.5], null]) { const r = await post("/api/aq/wallet/withdraw", body); assert.equal(r.status, 400); }
  for (const sol of [0, -1, "0.5", NaN, null, Infinity]) assert.equal((await post("/api/aq/wallet/withdraw", { sol })).status, 400);
  assert.equal(F.sent.length, 0); assert.equal((await orders()).length, 0);
  const r = await post("/api/aq/wallet/withdraw", { sol: 0.5 }); assert.equal(r.status, 200); assert.equal(r.confirmed, true); assert.equal(r.destination, DEST); assert.equal(r.sol, 0.5);
  const [o] = await orders(), t = F.sent[0];
  assert.deepEqual(F.rowAtSend, { status: "sent", signature: o.signature, dest: DEST, in_amount: "500000000" }, "amount, destination and signature were on record before the send");
  assert.equal(F.sent.length, 1); assert.equal(t.from, wallet.address); assert.equal(t.to, DEST); assert.equal(t.program, SYS); assert.equal(t.kind, 2); assert.equal(t.lamports, 500000000);
  const pub = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(W.unbase58(wallet.address))]), format: "der", type: "spki" });
  assert.equal(verify(null, t.msg, pub, t.sig), true); assert.equal(W.base58(t.sig), o.signature);
  assert.equal(o.status, "confirmed"); assert.equal(o.side, "withdraw"); assert.ok(Math.abs(o.fill_sol + 0.500005) < 1e-12); assert.equal(o.position_id, null);
  assert.deepEqual(F.calls.filter((c) => /simulate|send/.test(c)), ["simulateTransaction", "sendTransaction"]);
  const s = (await buildState(env)).solWallet; assert.equal(s.withdrawals.length, 1); assert.equal(s.withdrawals[0].signature, o.signature); assert.equal(s.withdrawals[0].destination, DEST); assert.equal(s.withdrawals[0].sol, 0.5);
  assert.match((await one(`SELECT text FROM mob_aq_brain WHERE text LIKE 'WITHDRAWAL%' ORDER BY id DESC LIMIT 1`)).text, new RegExp(`0.5 SOL from the Aquarius wallet to ${DEST}`));
});

test("\"All\" and the amounts that are refused: fee, dust, open live positions, an empty new address", async () => {
  await wipe(); const pv = async (sol) => J(await R("GET", `/api/aq/wallet/withdraw-preview?sol=${sol}`, { cookie }));
  let a = await pv("all"); assert.equal(a.ok, true); assert.equal(a.sol, 1.999995); assert.equal(a.leavesSol, 0); assert.equal(a.feeSol, 0.000005); assert.deepEqual(Object.keys(a).sort(), ["balanceSol", "destination", "feeSol", "keepSol", "leavesSol", "ok", "openPositions", "sol", "status"]);
  assert.match((await pv(2)).error, /not enough for 2 SOL and the fee/); assert.match((await pv(1.9997)).error, /less than Solana lets a wallet hold \(0\.00065024\)/); assert.equal((await pv(1.9)).ok, true);
  assert.match((await pv(0.0005)).error, /new and empty: the first transfer to it must be at least 0\.00065024 SOL/); F.destBal[DEST] = 5_000_000; assert.equal((await pv(0.0005)).ok, true);
  // an open live position keeps its selling reserve (0.01 SOL + the fee budget) in the wallet
  await d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, tokens_raw, cost_sol, stop_pct, time_exit_at) VALUES ('solana','SomeMint','SOME','open','1',0.05,10, now() + interval '1 hour')`);
  a = await pv("all"); assert.equal(a.ok, true); assert.equal(a.keepSol, 0.0135); assert.equal(a.sol, 1.986495); assert.equal(a.leavesSol, 0.0135); assert.equal(a.openPositions, 1);
  assert.match((await pv(1.99)).error, /too little to sell the 1 open live position\(s\)\. 0\.0135 SOL must stay: the most you can withdraw now is 1\.986495 SOL, or press SELL ALL LIVE first/);
  // the reserve scales with the open positions: two open keep twice as much
  await d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, tokens_raw, cost_sol, stop_pct) VALUES ('solana','SomeMint2','SOM2','open','1',0.05,10)`);
  a = await pv("all"); assert.equal(a.keepSol, 0.027); assert.equal(a.openPositions, 2); await d.q(`DELETE FROM mob_aq_live_positions WHERE mint = 'SomeMint2'`);
  // a withdrawal takes the money lease: while the trader's run holds it, nothing is sent
  await d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ('live_tick_lock', '{"owner":"tick"}'::jsonb, now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, at = now()`);
  { const r = await post("/api/aq/wallet/withdraw", { sol: 0.1 }); assert.equal(r.status, 409); assert.match(r.error.message, /middle of a run/); assert.equal(F.sent.length, 0); }
  await d.q(`UPDATE mob_aq_state SET v = 'false'::jsonb WHERE k = 'live_tick_lock'`);
  F.balance = 10_000_000; assert.match((await pv("all")).error, /nothing to withdraw: 0\.0135 SOL stays/);
  const r = await post("/api/aq/wallet/withdraw", { sol: "all" }); assert.equal(r.status, 400); assert.equal(F.sent.length, 0);
  // and the real thing for "all" with nothing open: the wallet is emptied to exactly zero
  await wipe(); world(); const w = await post("/api/aq/wallet/withdraw", { sol: "all" }); assert.equal(w.confirmed, true); assert.equal(F.sent[0].lamports, 2_000_000_000 - 5000); assert.equal((await orders())[0].reason, "withdraw all");
});

test("the simulation must show exactly the amount leaving and arriving, or nothing is signed", async () => {
  const run = async (prep, re) => { await wipe(); world(); prep(); const r = await post("/api/aq/wallet/withdraw", { sol: 0.5 }); assert.equal(r.status, 400); assert.match(r.error.message, re); const [o] = await orders(); assert.equal(o.status, "failed"); assert.equal(o.signature, null); assert.equal(F.sent.length, 0); };
  await run(() => { F.simWallet = 2_000_000_000 - 500_000_000 - 5001; }, /did not show exactly the amount/);   // one lamport more than amount + fee
  await run(() => { F.simWallet = 0; }, /did not show exactly the amount/);
  await run(() => { F.simDest = 499_999_999; }, /did not show exactly the amount/);
  await run(() => { F.simErr = "AccountNotFound"; }, /the simulation failed \("AccountNotFound"\); nothing was sent/);
  await run(() => { F.simErr = { InsufficientFundsForRent: { account_index: 1 } }; }, /InsufficientFundsForRent/);
});

test("an unknown send is never repeated; a double press makes one transfer", async () => {
  await wipe(); F.send = "throw";
  let r = await post("/api/aq/wallet/withdraw", { sol: 0.5 }); assert.equal(r.status, 202); assert.equal(r.pending, true);
  let [o] = await orders(); assert.equal(o.status, "sent"); assert.match(o.error, /send:/); assert.equal(F.sent.length, 1);
  r = await post("/api/aq/wallet/withdraw", { sol: 0.5 }); assert.equal(r.status, 409); assert.match(r.error.message, /still being confirmed/); assert.equal(F.sent.length, 1); assert.equal((await orders()).length, 1);
  // found on the chain after all: the next press (or the live tick) settles it, and only then is a new one possible
  const sig = o.signature; F.status[sig] = { confirmationStatus: "finalized", err: null }; F.txs[sig] = landed(F.sent[0]); F.send = "ok";
  const tick = await L.liveTick(env, { minute: 1 }); assert.equal(tick.reconciled[0].end, "confirmed"); assert.equal((await orders())[0].status, "confirmed"); assert.equal(F.sent.length, 1);
  // never seen and its window passed: closed as not sent, by the next press itself
  await wipe(); world(); F.send = "throw"; await post("/api/aq/wallet/withdraw", { sol: 0.5 }); F.send = "ok"; F.height = F.lastValid + 50;
  r = await post("/api/aq/wallet/withdraw", { sol: 0.25 }); assert.equal(r.confirmed, true); const os = await orders();
  assert.equal(os[0].status, "failed"); assert.match(os[0].error, /never reached the chain/); assert.equal(os[1].status, "confirmed"); assert.deepEqual(F.sent.map((t) => t.lamports), [500000000, 250000000]);
  // two presses at the same moment
  await wipe(); world(); const [a, b] = await Promise.all([post("/api/aq/wallet/withdraw", { sol: 0.5 }), post("/api/aq/wallet/withdraw", { sol: 0.5 })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]); assert.equal(F.sent.length, 1); assert.equal((await orders()).filter((x) => x.status === "confirmed").length, 1);
  await assert.rejects(d.q(`INSERT INTO mob_aq_live_orders (venue, side, claim, status) VALUES ('solana','withdraw','c1','sent'), ('solana','withdraw','c2','requested')`), /duplicate key/, "the table itself allows one unfinished withdrawal");
  // a pending withdrawal also holds back live buys
  await d.q(`INSERT INTO mob_aq_live_orders (venue, side, claim, status, signature, last_valid_height) VALUES ('solana','withdraw','c3','sent','SigThatIsNotOnChain', 5000)`); await setS("sol_wallet_limits", { maxPerTradeSol: 0.05, maxDailyLossSol: 0.2, maxOpenPositions: 2, autoTrade: true });
  assert.equal((await L.liveTick(env, { minute: 1 })).result.refused, "order_pending"); await setS("sol_wallet_limits", { autoTrade: false });
});

test("restore: only when the wallet row is missing, only a copy that opens to the address it names; no key material anywhere", async () => {
  await wipe(); const row = await st("sol_wallet_key"), copy = JSON.stringify(row), other = await W.makeKey(env);
  const restore = async (backup) => { env.AQ_WALLET_BACKUP = backup; return post("/api/aq/wallet/restore", {}); };
  let r = await restore(copy); assert.equal(r.status, 409); assert.match(r.error.message, /Nothing to restore/); assert.deepEqual(await st("sol_wallet_key"), row);
  assert.deepEqual((({ ok, present, note }) => ({ ok, present, note }))(await P.backupCheck(env)), { ok: true, present: true, note: "second copy checked" });
  await d.q(`DELETE FROM mob_aq_state WHERE k='sol_wallet_key'`);
  r = await restore(undefined); assert.equal(r.status, 400); assert.match(r.error.message, /no second copy/);
  r = await restore("not json"); assert.match(r.error.message, /not readable/);
  r = await restore(JSON.stringify({ address: row.address })); assert.match(r.error.message, /not a wallet/);
  r = await restore(JSON.stringify({ address: other.address, sealed: row.sealed })); assert.match(r.error.message, /does not open to the key of the address it names/);   // our key under someone else's address
  r = await restore(JSON.stringify({ address: row.address, sealed: other.sealed })); assert.match(r.error.message, /does not open/);
  r = await restore(JSON.stringify({ address: row.address, sealed: row.sealed.slice(0, -4) + "AAAA" })); assert.match(r.error.message, /does not open/);
  assert.equal(await st("sol_wallet_key"), null, "a refused restore writes nothing");
  r = await restore(copy); assert.equal(r.status, 201); assert.deepEqual(Object.keys(r).sort(), ["address", "restored", "status"]); assert.equal(r.address, row.address);
  const back = await st("sol_wallet_key"); assert.equal(back.sealed, row.sealed); assert.equal(back.address, row.address); assert.equal(await W.proves(env, back.sealed, back.address), true);
  assert.equal((await restore(JSON.stringify(other))).status, 409, "a wallet that is there is never replaced");
  assert.equal((await st("sol_wallet_key")).address, row.address);
  // the restored key withdraws
  world(); const w = await post("/api/aq/wallet/withdraw", { sol: 0.5 }); assert.equal(w.confirmed, true);
  // a copy of a different wallet is flagged for the panel
  env.AQ_WALLET_BACKUP = JSON.stringify(other); await d.q(`DELETE FROM mob_aq_state WHERE k='sol_wallet_backup'`); assert.equal((await P.backupCheck(env)).note, "the second copy is of a different wallet");
  // nothing that left the server, was logged or was written elsewhere carries the key in any form
  const b64 = await unseal(env, row.sealed), raw = Buffer.from(b64, "base64"), seed = raw.subarray(-32); const logs = [], log = console.log; console.log = (...x) => logs.push(x.join(" "));
  try { const { default: worker } = await import("../src/worker.mjs"); await new Promise((ok) => worker.scheduled({ cron: "*/5 * * * *" }, env, { waitUntil: (p) => p.then(ok, ok) })); await new Promise((r2) => setTimeout(r2, 1500)); } finally { console.log = log; }
  seen.push(JSON.stringify(await buildState(env)));
  const hay = JSON.stringify([seen, logs, await d.q(`SELECT k, v FROM mob_aq_state WHERE k <> 'sol_wallet_key'`), await d.q(`SELECT text, data FROM mob_aq_brain`), await orders()]);
  for (const f of [b64, raw.toString("hex"), seed.toString("hex"), seed.toString("base64"), W.base58(seed), row.sealed, other.sealed, "sealed"]) assert.ok(!hay.includes(f), "no key material in any response, log, state row, brain row or order row");
  assert.ok(seen.length > 40 && hay.includes(row.address));
  const src = (await import("node:fs")).readFileSync(new URL("../src/aq/payout.mjs", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.equal(src.split('"sendTransaction"').length - 1, 1); assert.ok(!/unseal|subtle\.sign|importKey/.test(src), "payout.mjs never opens the key itself: it signs through live.mjs's one signer");
});
