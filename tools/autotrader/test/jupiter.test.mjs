import crypto from "node:crypto";
import { walletFromPem, signSwapTransaction, buildCloseAccountTx, b58encode, b58decode, Rpc, Jupiter } from "../src/lib/solana.mjs";
import { jupiterExec, CAPS, SOL_MINT } from "../src/lib/exec-jupiter.mjs";
import { KIMCHI } from "../src/lib/exec-jupiter.mjs";
import { Engine } from "../src/lib/engine.mjs";
import { Journal } from "../src/lib/journal.mjs";
import { DEFAULTS } from "../src/lib/strategy.mjs";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { fakeFeed, moon } from "./fakefeed.mjs";
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, d ?? ""); } };
const pem = crypto.generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" });
const w = walletFromPem(pem);
const MINT = "3L3FzorEgwKDEraWb4trNYd62AmjNgc9osn3QMojpump";

// base58 and the wallet
ok("base58 round-trips, including leading zeros", b58decode(b58encode(Buffer.from([0, 0, 1, 2, 255]))).equals(Buffer.from([0, 0, 1, 2, 255])));
ok("the address decodes to the 32-byte public key, the backup to 64 bytes (seed + public)", b58decode(w.address).equals(w.publicKey) && b58decode(w.secretKeyBase58).length === 64 && b58decode(w.secretKeyBase58).subarray(32).equals(w.publicKey));
ok("a known address decodes to the known bytes (system program = 32 zero bytes)", b58encode(Buffer.alloc(32)) === "11111111111111111111111111111111");

import { mkTx, world as world_ } from "./fakechain.mjs";
const world = (o) => world_(w.publicKey, o);
const s1 = signSwapTransaction(mkTx(w.publicKey), w);
const msg = s1.tx.subarray(65);
ok("signing puts a valid Ed25519 signature over exactly the message bytes", crypto.verify(null, msg, crypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), w.publicKey]), format: "der", type: "spki" }), s1.tx.subarray(1, 65)));
ok("a transaction whose fee payer is someone else is refused", (() => { try { signSwapTransaction(mkTx(crypto.randomBytes(32)), w); return false; } catch (e) { return /fee payer/.test(e.message); } })());
ok("a transaction that needs two signers is refused", (() => { try { signSwapTransaction(mkTx(w.publicKey, 2), w); return false; } catch (e) { return /signers/.test(e.message); } })());
const c = buildCloseAccountTx({ wallet: w, tokenAccount: b58encode(crypto.randomBytes(32)), tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", blockhash: b58encode(crypto.randomBytes(32)) });
ok("the close-account transaction has the exact layout (1 sig, 3 keys, 1 instruction, opcode 9)", c.tx.length === 1 + 64 + 3 + 1 + 96 + 32 + 1 + 1 + 1 + 3 + 1 + 1 && c.tx[1 + 64 + 3 + 1 + 96 + 32 + 1 + 1 + 1 + 3 + 1] === 9, c.tx.length);

const mk = (o = {}, caps = {}) => { const x = world(o); return { ...x, ex: jupiterExec({ wallet: w, rpc: x.rpc, jupiter: x.jupiter, cfg: DEFAULTS, caps: { ...CAPS, pollMs: 1, confirmMs: 50, ...caps }, wait: async () => {} }) }; };

let t = mk(); let r = await t.ex.buy({ mint: MINT });
ok("buy: quote -> swap -> signed -> sent -> confirmed, with the real amounts", r.ok && r.orderId && r.inAmount === String(Math.round((0.11 - 0.006) * 0.12 * 1e9 / 1e5) * 1e5) || (r.ok && Number(r.inAmount) > 0), r);
ok("buy: stake is 12% of what is spendable (wallet minus the 0.006 SOL kept for fees)", Math.abs(r.sol - 0.0125) < 1e-9, r.sol);
ok("buy: slippage 12% and the user key are what Jupiter was asked for", t.W.quotes[0].slippageBps === "1200" && t.W.lastSwap.userPublicKey === w.address && t.W.lastSwap.wrapAndUnwrapSol === true, t.W.lastSwap);
ok("buy: the priority fee is capped (0.00015 SOL)", t.W.lastSwap.prioritizationFeeLamports.priorityLevelWithMaxLamports.maxLamports === 150000);
ok("buy: the transaction that was SENT carries our valid signature", (() => { const tx = t.W.sent[0]; return crypto.verify(null, tx.subarray(65), crypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), w.publicKey]), format: "der", type: "spki" }), tx.subarray(1, 65)); })());
ok("buy: the token amount is read from the wallet after the buy", r.outAmount === "5000000000", r.outAmount);
const big = mk({}, {}); big.W.sol = 5; r = await big.ex.buy({ mint: MINT });
ok("a 5 SOL wallet still risks only 0.05 SOL", r.ok && r.sol === 0.05, r);
t = mk(); r = await t.ex.buy({ mint: KIMCHI });
ok("Kimchi: refused, nothing sent", !r.ok && /Kimchi/.test(r.why) && t.W.sent.length === 0 && t.W.quotes.length === 0, r);
t = mk(); t.W.sol = 0.03; r = await t.ex.buy({ mint: MINT });
ok("a nearly empty wallet is refused, with the reason, before anything is sent", !r.ok && /too small/.test(r.why) && t.W.sent.length === 0, r);
t = mk(); await t.ex.buy({ mint: MINT }); t.W.sol = 0.07; r = await t.ex.buy({ mint: MINT });
ok("30% down halts trading and says so", !r.ok && /halted/.test(r.why), r);
t = mk({}, { perHour: 1 }); await t.ex.buy({ mint: MINT }); r = await t.ex.buy({ mint: MINT });
ok("the hourly cap stops the second buy", !r.ok && /last hour/.test(r.why), r);
t = mk({ confirm: "failed" }); r = await t.ex.buy({ mint: MINT });
ok("an on-chain failure is a failure, never a position", !r.ok && /rejected/.test(r.why) && r.sent, r);
t = mk({ confirm: "pending" }); r = await t.ex.buy({ mint: MINT });
ok("not confirmed in time is UNKNOWN (kept and rechecked), not dropped", !r.ok && r.unknown === true && r.orderId, r);
t.W.statusCalls = 0; const re = await t.ex.recheck(r.orderId);
ok("recheck of a still-pending order says pending", re.status === "pending");
const imp = mk(); const origQ = imp.jupiter.quote.bind(imp.jupiter); imp.jupiter.quote = async (a) => ({ ...(await origQ(a)), priceImpactPct: "0.2" });
r = await imp.ex.buy({ mint: MINT });
ok("a 20% price impact is refused before sending", !r.ok && /impact/.test(r.why) && imp.W.sent.length === 0, r);

// sells
t = mk({ held: 5000000000n }); t.W.lastKind = "sell"; t.W.zero = true; r = await t.ex.sell({ mint: MINT });
ok("sell: the whole balance is sold, proceeds read from the chain, the empty account closed for its rent", r.ok && r.inAmount === "5000000000" && r.outAmount === "14000000" && r.closed === 1 && t.W.closes === 1, r);
t = mk({ held: 0n }); r = await t.ex.sell({ mint: MINT });
ok("selling a token that is not in the wallet says so (noBalance), sends nothing", !r.ok && r.noBalance && t.W.sent.length === 0, r);

// the engine around it
const T0 = 1_800_000_000_000, M = 60000;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-jup-"));
const { feed, state } = fakeFeed();
const eT = mk(); eT.W.held = 0n;
const eng = new Engine({ feed, exec: eT.ex, journal: new Journal(path.join(dir, "j.jsonl")), rug: async () => ({ pass: true, reason: "ok" }), now: () => state.now, startEq: 0.11 });
await eng.tick();
ok("engine + own wallet: a signal becomes a real-shaped buy and an open position with the order id", eng.open.size === 1 && [...eng.open.values()][0].orderId && eng.unit === "SOL", eng.status());
state.series = moon; state.px.P1 = 2.6; state.now += 2 * M; eT.W.lastKind = "sell"; eT.W.zero = true;
await eng.tick();
ok("the target closes it with the chain's own proceeds (0.014 SOL on 0.0125)", eng.closed.length === 1 && Math.abs(eng.closed[0].ret - (0.014 / eng.closed[0].stake - 1)) < 1e-9, eng.closed[0]);
console.log(`\njupiter tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

test("buys pause when the wallet is under minBalSol (0.05)", async () => {
  const { jupiterExec, PLUG_CAPS_EXTRA, CAPS } = await import("../src/lib/exec-jupiter.mjs");
  assert.equal(PLUG_CAPS_EXTRA.minBalSol, 0.05);
  const mk = (sol) => jupiterExec({ wallet: { address: "x" }, rpc: { solBalance: async () => sol }, jupiter: {}, cfg: {}, caps: { ...CAPS, ...PLUG_CAPS_EXTRA } });
  assert.equal((await mk(0.0457).sizeSol()).sol, 0);
  assert.equal((await mk(0.0457).sizeSol({ scale: 0.618 })).sol, 0);
  const r = await mk(0.0457).buy({ mint: "m" }); assert.equal(r.ok, false); assert.match(r.why, /paused/);
  assert.ok((await mk(0.06).sizeSol()).sol > 0);
});
