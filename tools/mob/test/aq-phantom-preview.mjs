// Local preview of the Aquarius panel for the Phantom flow: the REAL worker on a throwaway Neon schema, with a fake Jupiter
// and a fake Solana RPC (helpers.mjs mocks; production never sees any of it). Not a test file. The browser side injects a
// fake Phantom provider (aq/dev/shoot-phantom.mjs); its "send" calls POST /__fake/send here, which plays the chain.
// Usage: DATABASE_URL=... node test/aq-phantom-preview.mjs <port>
import http from "node:http";
import { makeEnv, dropEnv, mock, resetMocks } from "./helpers.mjs";
import { db } from "../src/db.mjs";
import * as W from "../src/aq/wallet.mjs";
import { feeds } from "../src/aq/feeds.mjs";
import { _resetSeeded } from "../src/aq/engine.mjs";
const port = Number(process.argv[2] || 8790), SOL = "So11111111111111111111111111111111111111112", MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const env = await makeEnv({ HELIUS_API_KEY: "hk", AQ_JUP_GAP_MS: "0", AQ_LIVE_POLL_MS: "0" }); _resetSeeded();
const d = db(env), ME = (await W.makeKey(env)).address, F = { balance: 3_000_000_000, tokens: {}, status: {}, txs: {}, built: null, sent: [] };
const dip = () => { const now = Math.floor(Date.now() / 60000) * 60, cs = []; for (let i = 39; i >= 0; i--) { const c = i < 5 ? 100 * (1 - (0.045 * (5 - i)) / 5) : 100; cs.push({ time: now - i * 60, open: c, high: c * 1.012, low: c * 0.988, close: c, volume: 10 }); } return cs; };
const fakeTx = (payer) => { const b = new Uint8Array(1 + 64 + 4 + 1 + 64 + 32 + 1 + 1); b[0] = 1; let p = 65; b[p++] = 0x80; b[p++] = 1; b[p++] = 0; b[p++] = 1; b[p++] = 2; b.set(W.unbase58(payer), p); b.set(crypto.getRandomValues(new Uint8Array(32)), p + 64); return Buffer.from(b).toString("base64"); };
resetMocks();
mock("GET", /^https:\/\/datapi\.jup\.ag\/v1\/pools\//, () => ({ pools: [{ id: "p1", quoteAsset: SOL, baseAsset: { id: MINT, symbol: "BONK", liquidity: 250000, decimals: 5, firstPool: { createdAt: "2024-01-01T00:00:00Z" }, stats5m: { priceChange: -4 }, audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true } } }] }));
mock("GET", /^https:\/\/datapi\.jup\.ag\/v2\/charts\//, () => ({ candles: dip() })); mock("GET", /^https:\/\/api\.rugcheck\.xyz\//, () => ({ mintAuthority: null, freezeAuthority: null, rugged: false, risks: [], topHolders: [], markets: [], token: { decimals: 5 } }));
for (const host of ["https://api.jup.ag", "https://lite-api.jup.ag"]) {
  mock("GET", `${host}/swap/v1/quote`, (c, u) => { const buy = u.searchParams.get("inputMint") === SOL, amt = u.searchParams.get("amount"), out = buy ? String(Math.round(Number(amt) * 0.05)) : String(Math.round(Number(amt) * 21));
    return { inputMint: u.searchParams.get("inputMint"), outputMint: u.searchParams.get("outputMint"), inAmount: amt, outAmount: out, otherAmountThreshold: String(Math.floor(Number(out) * 0.99)), priceImpactPct: "0.0012", slippageBps: Number(u.searchParams.get("slippageBps")), routePlan: [{ swapInfo: { label: "Meteora" } }] }; });
  mock("POST", `${host}/swap/v1/swap`, (c) => { const b = JSON.parse(c.body), tx = fakeTx(b.userPublicKey); F.built = { tx, q: b.quoteResponse }; return { swapTransaction: tx, lastValidBlockHeight: 2000, prioritizationFeeLamports: 9555, simulationError: null }; });
}
mock("POST", "https://mainnet.helius-rpc.com/", (c) => { const m = JSON.parse(c.body), ok = (result) => ({ jsonrpc: "2.0", id: 1, result }), val = (value) => ok({ context: { slot: 1 }, value });
  if (m.method === "getBalance") return val(F.balance);
  if (m.method === "getTokenAccountsByOwner") return val(Object.entries(F.tokens).filter(([mint, a]) => BigInt(a) > 0n && (m.params[1].mint ? m.params[1].mint === mint : m.params[1].programId.startsWith("Tokenkeg"))).map(([mint, amount]) => ({ account: { data: { parsed: { info: { mint, tokenAmount: { amount, decimals: 5, uiAmount: Number(amount) / 1e5 } } } } } })));
  if (m.method === "getLatestBlockhash") return val({ blockhash: "CtZPwQCiDbsGsxevfnEksSK4nviBJD6vVZVAcR6Tw2z8", lastValidBlockHeight: 2000 });
  if (m.method === "getBlockHeight") return ok(1000);
  if (m.method === "getMinimumBalanceForRentExemption") return ok(650240);
  if (m.method === "getFeeForMessage") return val(5000);
  if (m.method === "getAccountInfo") return val(null);
  if (m.method === "simulateTransaction") return val({ err: null, logs: [], accounts: null });
  if (m.method === "getSignatureStatuses") return val(m.params[0].map((s) => F.status[s] ?? null));
  if (m.method === "getTransaction") return ok(F.txs[m.params[0]] ?? null);
  return { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } }; });
await feeds.jupTop(env); await W.createWallet(env); const L = await import("../src/aq/live.mjs");
const { default: worker } = await import("../src/worker.mjs");
http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks);
    if (req.url === "/__fake/tick") { const r = await L.phantomWatch(env); res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(r)); } // what the minute timer does
    if (req.url === "/__fake/age") { await d.q(`UPDATE mob_aq_live_positions SET time_exit_at = now() - interval '1 minute' WHERE venue = 'phantom'`); res.writeHead(200); return res.end("{}"); }
    if (req.url === "/__fake/me") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ address: ME, sent: F.sent })); }
    if (req.url === "/__fake/send") { // the fake Phantom "sent" what the page handed it: it must be, byte for byte, the transaction the server built
      const got = body.toString(), same = F.built && got === F.built.tx, sig = W.base58(crypto.getRandomValues(new Uint8Array(64))); F.sent.push({ same, kind: req.headers["x-kind"] || "" });
      const q = F.built?.q, transfer = !same && Buffer.from(got, "base64")[65] !== 0x80, pre = F.balance;
      if (same) { const buy = q.inputMint === SOL; F.balance += buy ? -Number(q.inAmount) - 14556 : Number(q.outAmount) - 14556; const mint = buy ? q.outputMint : q.inputMint, held = BigInt(F.tokens[mint] || "0"), delta = buy ? BigInt(q.outAmount) : -BigInt(q.inAmount); F.tokens[mint] = (held + delta).toString();
        F.txs[sig] = { meta: { err: null, fee: 14556, preBalances: [pre], postBalances: [F.balance], preTokenBalances: [{ owner: ME, mint, uiTokenAmount: { amount: held.toString() } }], postTokenBalances: [{ owner: ME, mint, uiTokenAmount: { amount: (held + delta).toString() } }] }, transaction: { message: { accountKeys: [ME, "x"] }, signatures: [sig] } }; }
      else if (transfer) { const lam = Number(Buffer.from(got, "base64").readBigUInt64LE(65 + 142)); F.balance -= lam + 5000; F.txs[sig] = { meta: { err: null, fee: 5000, preBalances: [pre], postBalances: [F.balance], preTokenBalances: [], postTokenBalances: [] }, transaction: { message: { accountKeys: [ME, "y"] }, signatures: [sig] } }; }
      if (F.txs[sig]) F.status[sig] = { confirmationStatus: "confirmed", err: null };
      await d.q(`DELETE FROM mob_aq_state WHERE k = 'phantom_cache'`);
      res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ signature: sig, same }));
    }
    const r = await worker.fetch(new Request("https://mob.gardenbuddystore.workers.dev" + req.url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body, redirect: "manual" }), env, { waitUntil() {} });
    const h = {}; r.headers.forEach((v, k) => { h[k] = k === "set-cookie" ? v.replace(/; Secure/gi, "") : k === "location" ? v.replace("https://mob.gardenbuddystore.workers.dev", "") : v; });
    res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(500); res.end(String(e.stack || e)); }
}).listen(port, () => console.log("ready", port, ME));
const bye = async () => { try { await dropEnv(env); } finally { process.exit(0); } }; process.on("SIGTERM", bye); process.on("SIGINT", bye);
