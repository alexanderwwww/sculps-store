import crypto from "node:crypto";
import { b58encode, b58decode, Rpc, Jupiter } from "../src/lib/solana.mjs";
import { SOL_MINT } from "../src/lib/exec-jupiter.mjs";
// A transaction shaped like Jupiter's: 1 signature slot, v0 message, `payer` as fee payer.
export const mkTx = (payer, signers = 1) => Buffer.concat([Buffer.from([1]), Buffer.alloc(64), Buffer.from([0x80, signers, 0, 1, 2]), payer, crypto.randomBytes(32), Buffer.from([0])]).toString("base64");
// A fake chain and a fake Jupiter, scripted per test.
export function world(payer, { confirm = "confirmed", held = 0n, sellFails = false } = {}) {
  const W = { sol: 0.11, held, sent: [], quotes: [], statusCalls: 0, closes: 0, txs: new Map() };
  const rpc = new Rpc({ fetchImpl: async (_u, init) => {
    const { method, params } = JSON.parse(init.body); let result;
    if (method === "getBalance") result = { value: Math.round(W.sol * 1e9) };
    else if (method === "getLatestBlockhash") result = { value: { blockhash: b58encode(crypto.randomBytes(32)), lastValidBlockHeight: 100 } };
    else if (method === "sendTransaction") { const tx = Buffer.from(params[0], "base64"); W.sent.push(tx); result = b58encode(tx.subarray(1, 65)); if (tx.length > 180) { W.closes++; W.held = 0n; W.zero = false; } else if (W.lastKind === "buy") W.held = 5000000000n; else if (W.lastKind === "sell") { W.held = 0n; W.zero = true; } }
    else if (method === "getSignatureStatuses") { W.statusCalls++; result = { value: [confirm === "pending" ? { confirmationStatus: "processed", err: null } : confirm === "failed" ? { err: { InstructionError: [0, "Custom"] } } : { confirmationStatus: "confirmed", err: null }] }; }
    else if (method === "getTokenAccountsByOwner") result = { value: W.held > 0n || W.zero ? [{ pubkey: b58encode(crypto.randomBytes(32)), account: { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: { parsed: { info: { tokenAmount: { amount: String(W.held), decimals: 6 } } } } } }] : [] };
    else if (method === "getTransaction") result = { meta: { err: null, preBalances: [100000000], postBalances: [114000000], fee: 5000 } };
    else throw new Error("unexpected rpc " + method);
    return { status: 200, json: async () => ({ result }) };
  }, wait: async () => {} });
  const jupiter = new Jupiter({ fetchImpl: async (u, init) => {
    const url = new URL(u); let body;
    if (url.pathname.endsWith("/quote")) { W.quotes.push(Object.fromEntries(url.searchParams)); W.lastKind = url.searchParams.get("inputMint") === SOL_MINT ? "buy" : "sell"; body = { inAmount: url.searchParams.get("amount"), outAmount: "5000000000", priceImpactPct: "0.012", inputMint: url.searchParams.get("inputMint") }; }
    else { W.lastSwapRaw = init.body; W.lastSwap = JSON.parse(init.body); body = { swapTransaction: mkTx(payer || b58decode(W.lastSwap.userPublicKey)) }; }
    return { status: 200, ok: true, text: async () => JSON.stringify(body) };
  }, wait: async () => {} });
  return { W, rpc, jupiter };
}
