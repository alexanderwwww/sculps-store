// LIVE orders for the Aquarius Solana wallet: real SOL, real swaps through Jupiter. The real ledger (mob_aq_live_orders,
// mob_aq_live_positions, mob_aq_live_refusals) is separate from the paper book and never touches it.
//
// THE RULE IT TRADES IS UNPROVEN AFTER COSTS (lesson 17: no rule made money after costs on a meaningful count; the dip, the
// best one, lost 0.16% a trade). It is the only entry the lessons support, run inside the limits Alex sets. Small size.
//
// Read live on 2026-11-18, not from memory:
//  - Jupiter: GET {host}/swap/v1/quote and POST {host}/swap/v1/swap answer on api.jup.ag WITHOUT a key (docs: keyless 0.5
//    requests a second) and still on lite-api.jup.ag (docs: being phased out). Quote: inAmount, outAmount,
//    otherAmountThreshold, priceImpactPct (string), routePlan. Swap: swapTransaction (base64, version 0),
//    lastValidBlockHeight, prioritizationFeeLamports, simulationError. An optional JUP_API_KEY secret is sent as x-api-key.
//    Re-read 2026-11-18 (developers.jup.ag/docs/portal/migration.md): "lite-api.jup.ag will be phased out ... The rate limit
//    will be reduced progressively until it is fully retired. All endpoints remain the same. Only the base URL changes."
//    So api.jup.ag is asked FIRST for quotes, swaps and prices (GET /price/v3?ids= -> {mint:{usdPrice, liquidity, decimals}},
//    answered keyless on both hosts today); lite-api is only the second try. Swap API V2 (/swap/v2/order, /build) is the
//    recommended API now; V1 /quote and /swap still answer on api.jup.ag and are what the pre-sign checks were read against.
//  - Venue labels (GET api.jup.ag/swap/v1/program-id-to-label, read 2026-11-18): the pump bonding curve is "Pump.fun", the
//    pool a coin migrates to is "Pump.fun Amm". A quote's routePlan[].swapInfo.label says which one the coin trades on now.
//  - RPC: simulateTransaction {sigVerify:false, replaceRecentBlockhash:true, accounts:{addresses}} -> value.err,
//    value.accounts[0].lamports; getSignatureStatuses -> value[i] null | {confirmationStatus, err}; getBlockHeight -> number.
//  - getTransaction (meta.preBalances/postBalances/fee/pre+postTokenBalances) is the standard shape; the public RPC rate
//    limited it on the day, so it was matched against simulateTransaction's identical field names, not a live answer.
// Order of every order: the row is written, THEN the swap is built, simulated, signed and the signature stored, THEN it is
// sent. A send whose outcome is unknown is never sent again: the next tick asks the chain for that signature first.
import { db } from "../db.mjs";
import { unseal } from "../auth.mjs";
import { base58, unbase58, rpc as solRpc, clampLimits } from "./wallet.mjs";
import { feeds, SOL_MINT } from "./feeds.mjs";
import { hardSafety, round } from "./logic.mjs";
import { FIB, entrySetup, manage, planOf } from "./chart.mjs";
import { AUDIT_RT } from "./council.mjs";

export const LIVE = {
  // ---- WHAT it trades: the chart trader in chart.mjs (Fibonacci pullback, chart stop, chart targets; no clock). UNPROVEN.
  // Which coins (the lesson numbers are in .claude/skills/aquarius-lessons):
  poolMinUsd: 100000,     // 3 PROVEN: thin pools cost four times more
  poolPreferMaxUsd: 500000, // 9 STRONG: mid-size pools are looked at first
  minAgeDays: 1,          // 7: established pairs only; same age line as the Council's tier B
  // 1 PROVEN: never chase. The only entry is a pullback into 50-61.8% that closes back up (chart.mjs entrySetup).
  // ---- how it executes (safety, not lessons)
  // symbiote right calls (bonding-curve coins) only; see costGate. MEASURED 2026-11-18 on live curve coins at 0.05 SOL
  // (api.jup.ag quotes, buy then sell what it buys): 2.724, 2.754, 2.788, 2.788, 2.789, 2.789% in the quotes (pump's fee of
  // about 1.25% a side plus the curve's own impact), plus 0.254% fixed SOL fees (2 x 61,000 + 5,000 lamports) = 2.98-3.04%.
  // A ">= 3%" refusal turned away every one of them but the two cheapest; the cap is 3.5% (the highest measured total, 3.04%, plus room for the curve
  // moving between the two quotes). Target 1 must still be 3x the true total, so about 9-10.5% away.
  freshMaxRtPct: 3.5, freshMaxImpactPct: 1.5,
  // ---- the live price and the stops that do not wait for a candle
  entryTolPct: 1.5, freshEntryTolPct: 3, // the buy quote's own price must be within this of the candle entry (a curve buy pays ~1.25% fee inside its price)
  noPriceTicks: 3,       // candles frozen AND no price from any source for 3 ticks in a row: sold. One or two misses never sell.
  disasterPct: 5, disasterTicks: 2, // the live exit quote 5% or more UNDER the stop on 2 ticks in a row: sold now, no 5-minute close awaited
  nullGapBlocks: 20,     // a sent order is "never landed" only after TWO empty status reads at least 20 blocks apart, past its window, AND no tokens moved
  recoverDays: 7,        // a written-off coin is still quoted every 5 minutes for 7 days: if a route returns, what is left is sold
  legBuyTries: 3,        // a buy that failed before anything was sent does not burn its leg: up to 3 tries per leg, each with a fresh quote
  deadAfterHours: 24,    // Jupiter answering "no route" for the position's sale for 24 hours in a row: written off as a total loss, once
  freshGapLossPct: 50,   // what a fresh curve coin can lose before any exit lands (a 50% dump inside one bar): its worst case in the daily budget
  slippageBps: 100, exitSlippageBps: 150, maxImpactPct: 1, reserveSol: 0.01, feeBudgetLamports: 3500000, priorityMaxLamports: 500000,
  candidatesPerTick: 4, paperCoinsPerTick: 8, paperOpenMax: 40, confirmPolls: 6, confirmGapMs: 2500, maxSellFails: 5,
  // a stop, invalidation, veto or liquidity exit that fails is retried with twice the slippage each time, never over 20%
  exitSlippageMaxBps: 2000,
  // fixed SOL costs of a round trip: 5,000 lamports a signature (Solana's base fee; getFeeForMessage gave 5,000 for one
  // signature, payout.mjs); the network fee per side from our own last confirmed orders, else 61,000 lamports measured on
  // 2026-11-16 (trading-kb/fee-2026-11-16.md). A coin's token account rent is read from the chain
  // (getMinimumBalanceForRentExemption(165) answered 1,488,440 lamports on 2026-11-18; 2,039,280 is only the fallback): it is
  // fronted on the first buy and RETURNED by closeAccount after the full sale (reclaimRent), so it is capital, not cost.
  baseFeeLamports: 5000, feePerSideFallbackLamports: 61000, tokenAccountRentFallbackLamports: 2039280,
  rightCallTtlMin: 30,   // a symbiote right call is good for 30 minutes after its last check ('right_call_ttl_min' in mob_aq_state overrides)
  tickBudgetMs: 60000,   // past 60 s a tick does no optional work (paper mirror, Phantom); the money lease is renewed between steps
  unreadableMin: 3,      // confirmed on the chain, details unreadable for 3 minutes: settled from the token balance (marked estimated)
  sentStaleMin: 10,      // a signature the chain still does not know 10 minutes after sending is far past its ~150-block window
};
const VENUE = "solana", ACTIVE = `('opening','open','closing','stuck')`;
const JUP_HOSTS = ["https://api.jup.ag", "https://lite-api.jup.ag"]; // api.jup.ag first: lite-api is being retired
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", CURVE_LABELS = new Set(["Pump.fun"]);
const labelsOf = (q) => (q?.routePlan || []).map((r) => r.swapInfo?.label).filter(Boolean);
const r8 = (x) => (Number.isFinite(x) ? Number(x.toPrecision(8)) : x);
const enc = new TextEncoder();
const get = async (d, k, dflt = null) => (await d.one(`SELECT v FROM mob_aq_state WHERE k=$1`, [k]))?.v ?? dflt;
const set = (d, k, v) => d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ($1,$2,now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [k, JSON.stringify(v)]);
const brain = (d, text) => d.q(`INSERT INTO mob_aq_brain (dept, kind, text) VALUES ('execution','event',$1)`, [text]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cut = (s, n = 240) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);
const TODAY = `(date_trunc('day', now() AT TIME ZONE 'Europe/Athens') AT TIME ZONE 'Europe/Athens')`; // Alex's day

// A refused trade is always written down: one row per gate, coin and ten minutes (a count, not a flood).
export async function refuse(d, venue, gate, reason, c = null) {
  await d.q(`INSERT INTO mob_aq_live_refusals (venue, gate, mint, symbol, reason, bucket) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (venue, gate, mint, bucket) DO UPDATE SET n = mob_aq_live_refusals.n + 1, reason = EXCLUDED.reason, at = now()`, [venue, gate, c?.mint || "", c?.symbol || null, cut(reason), Math.floor(Date.now() / 600000)]);
  return { refused: gate, reason };
}

// ---------------------------------------------------------------- Jupiter
let lastJup = 0;
async function jup(env, path, init = {}) {
  let last = null;
  for (const host of JUP_HOSTS) {
    const gap = Number(env.AQ_JUP_GAP_MS ?? (env.JUP_API_KEY ? 150 : 2100)), wait = lastJup + gap - Date.now();
    if (wait > 0) await sleep(wait);
    lastJup = Date.now();
    try {
      const r = await fetch(host + path, { ...init, headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...(env.JUP_API_KEY && host === JUP_HOSTS[0] ? { "x-api-key": env.JUP_API_KEY } : {}) }, signal: AbortSignal.timeout(12000) });
      const j = await r.json().catch(() => null);
      if (r.ok && j) return { ok: true, j, host };
      last = `Jupiter answered HTTP ${r.status}${j?.error ? ` (${cut(j.error, 100)})` : ""}`;
      // read live 2026-11-18: HTTP 400 {"error":"No routes found","errorCode":"NO_ROUTES_FOUND"}
      if (r.status === 400 && (j?.errorCode === "NO_ROUTES_FOUND" || /no routes? found|could not find any route/i.test(String(j?.error || "")))) return { ok: false, error: last, noRoute: true };
      if (r.status !== 429 && r.status < 500) break; // a real "no" (no route, bad amount): the other host would say the same
    } catch { last = "Jupiter did not answer"; }
  }
  return { ok: false, error: last };
}
export async function quote(env, inMint, outMint, amountRaw, slippageBps) {
  const r = await jup(env, `/swap/v1/quote?inputMint=${inMint}&outputMint=${outMint}&amount=${amountRaw}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`);
  if (!r.ok) return r;
  const q = r.j;
  if (!/^\d+$/.test(String(q.outAmount || "")) || !/^\d+$/.test(String(q.otherAmountThreshold || "")) || String(q.inAmount) !== String(amountRaw)) return { ok: false, error: "Jupiter's quote was not in the expected shape" };
  return { ok: true, q, impactPct: Math.abs(Number(q.priceImpactPct) * 100) };
}
export async function buildSwap(env, q, address) {
  const r = await jup(env, "/swap/v1/swap", { method: "POST", body: JSON.stringify({ quoteResponse: q, userPublicKey: address, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: LIVE.priorityMaxLamports, priorityLevel: "high" } } }) });
  if (!r.ok) return r;
  if (typeof r.j.swapTransaction !== "string" || !(Number(r.j.lastValidBlockHeight) > 0)) return { ok: false, error: "Jupiter's swap answer had no transaction in it" };
  if (r.j.simulationError) return { ok: false, error: `Jupiter's own simulation failed (${cut(JSON.stringify(r.j.simulationError), 160)})` };
  return { ok: true, tx: r.j.swapTransaction, lastValidBlockHeight: Number(r.j.lastValidBlockHeight), priorityLamports: Number(r.j.prioritizationFeeLamports) || 0 };
}
// ---- live prices. Two independent sources, each asked twice before it counts as a miss:
//  (1) a Jupiter QUOTE for a real amount (the buy's own quote, or the position's own tokens -> SOL, which is the true exit value);
//  (2) Jupiter's price API (price/v3: the last on-chain swap, USD).
// The price of one whole token in the plan's unit, from an amount of lamports and an amount of raw tokens.
export const pxOf = (lamports, raw, dec, unit, solUsd = null) => {
  const tokens = Number(raw) / 10 ** dec, sol = Number(lamports) / 1e9 / tokens;
  if (!Number.isInteger(dec) || !(tokens > 0) || !(sol > 0)) return null;
  return unit === "SOL" ? sol : solUsd > 0 ? sol * solUsd : null;
};
// price/v3 rows by mint ({usdPrice, liquidity, decimals}), api.jup.ag first, asked twice; null when it never answers
async function priceRows(env, mints) {
  for (let i = 0; i < 2; i++) { const r = await jup(env, `/price/v3?ids=${[...new Set(mints)].slice(0, 50).join(",")}`); if (r.ok) return r.j; }
  return null;
}
async function priceApi(env, mints) { const j = await priceRows(env, mints); return j ? Object.fromEntries(mints.map((m) => [m, Number(j[m]?.usdPrice) > 0 ? Number(j[m].usdPrice) : null])) : null; }
const liqIn = (j, m) => (j?.[m] && j[m].liquidity != null && Number.isFinite(Number(j[m].liquidity)) ? Number(j[m].liquidity) : null);
// SOL in USD: the price API, else a quote of 1 SOL -> USDC (6 decimals). Null only when both fail.
export async function solUsdLive(env) {
  const p = await priceApi(env, [SOL_MINT]); if (p?.[SOL_MINT]) return p[SOL_MINT];
  const q = await quote(env, SOL_MINT, USDC_MINT, 1000000000, 50); return q.ok && Number(q.q.outAmount) > 0 ? Number(q.q.outAmount) / 1e6 : null;
}
// the coin's price from the price API, in the plan's unit
async function apiSpot(env, mint, unit, solUsd) {
  const p = await priceApi(env, [mint]), usd = p?.[mint]; if (!(usd > 0)) return null;
  if (unit !== "SOL") return usd;
  const s = await solUsd(); return s > 0 ? usd / s : null;
}
// The buy is checked against the LIVE price before anything is signed: the price the buy quote itself pays (SOL in / tokens
// out, in the plan's unit) must be above the stop, under target 1 and within `tolPct` of the candle entry. Null = fine.
export function entryCheck(s, livePx, tolPct) {
  if (!(livePx > 0)) return "The live price could not be read from the buy quote: no buy without it";
  if (livePx <= s.stop) return `The live price ${r8(livePx)} is at or under the stop ${s.stop}: the setup is already broken`;
  if (livePx >= s.t1) return `The live price ${r8(livePx)} is at or over target 1 ${s.t1}: nothing left to earn`;
  const off = (livePx / s.entry - 1) * 100;
  if (Math.abs(off) > tolPct) return `The live price ${r8(livePx)} is ${round(off, 2)}% from the candle entry ${s.entry}, over the ${tolPct}% tolerance`;
  return null;
}
// What one position can lose, as a share of its size, when its exit really runs: the stop distance, the disaster margin under
// the stop (the price can fall that far before the fast exit acts), the exit slippage and the round trip. A fresh curve coin can
// gap further than any stop inside one bar: its worst case is never under freshGapLossPct.
export const worstFrac = (stopFrac, rtPct, fresh) => Math.min(1, Math.max(stopFrac + LIVE.disasterPct / 100 + LIVE.exitSlippageBps / 1e4 + rtPct / 100, fresh ? LIVE.freshGapLossPct / 100 : 0));
// A failed sell raises the next sell's slippage only when the chain or its simulator refused the swap itself (the price ran
// past the minimum). A quote, RPC or Jupiter outage, or a send that never landed, says nothing about slippage.
export const isChainFail = (error) => /chain rejected|simulation failed|less than the quoted minimum/i.test(String(error || ""));

// ---------------------------------------------------------------- the transaction: read it, check it, sign it
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)), b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const shortvec = (b, o) => { let n = 0, shift = 0; for (;;) { const x = b[o++]; n |= (x & 0x7f) << shift; if (!(x & 0x80)) return [n, o]; shift += 7; if (shift > 21) throw new Error("bad length"); } };
// A serialized Solana transaction: [signature count][64 bytes each][message]. The message starts with an optional version
// byte, three header bytes (the first is how many signatures it needs), then the accounts; the first account pays and signs.
export function readTx(b64tx) {
  const bytes = unb64(b64tx); const [nsig, sigStart] = shortvec(bytes, 0); const msgStart = sigStart + 64 * nsig;
  let p = msgStart; if (bytes[p] & 0x80) p++;
  const required = bytes[p]; p += 3;
  const [nacc, a0] = shortvec(bytes, p);
  if (!(nacc >= 1) || a0 + 32 > bytes.length) throw new Error("transaction too short");
  return { bytes, nsig, sigStart, msgStart, required, payer: base58(bytes.subarray(a0, a0 + 32)) };
}
// The instructions of a message: [{program, acc (key indexes), data}]. Legacy and v0 share this part of the layout; a program
// id is always one of the message's own keys (it cannot come from a lookup table), so the program is always known.
export function readIxs(b64tx) {
  const t = readTx(b64tx), b = t.bytes; let p = t.msgStart; if (b[p] & 0x80) p++; p += 3;
  let n; [n, p] = shortvec(b, p); const keys = []; for (let i = 0; i < n; i++) { keys.push(base58(b.subarray(p, p + 32))); p += 32; }
  p += 32; let ni; [ni, p] = shortvec(b, p); const ixs = [];
  for (let i = 0; i < ni; i++) { const pi = b[p++]; let na; [na, p] = shortvec(b, p); const acc = [...b.subarray(p, p + na)]; p += na; let nd; [nd, p] = shortvec(b, p); ixs.push({ program: keys[pi] ?? null, acc, data: b.slice(p, p + nd) }); p += nd; }
  const lookups = [];
  if (b[t.msgStart] & 0x80) { let nl; [nl, p] = shortvec(b, p); for (let i = 0; i < nl; i++) { const table = base58(b.subarray(p, p + 32)); p += 32; let nw; [nw, p] = shortvec(b, p); const w = [...b.subarray(p, p + nw)]; p += nw; let nr; [nr, p] = shortvec(b, p); const r = [...b.subarray(p, p + nr)]; p += nr; lookups.push({ table, w, r }); } }
  if (p > b.length) throw new Error("transaction too short");
  return { keys, ixs, lookups };
}
// Every account a transaction can touch: its own keys plus the ones it loads from lookup tables (a table's data holds its
// addresses from byte 56, 32 bytes each: LOOKUP_TABLE_META_SIZE in solana-sdk address-lookup-table-interface state.rs).
// An account that is not in this set cannot be changed by the transaction.
export async function txKeys(env, b64tx) {
  const { keys, lookups } = readIxs(b64tx), out = new Set(keys);
  if (!lookups.length) return out;
  const tabs = await multi(env, lookups.map((l) => l.table), { encoding: "base64" });
  for (const [i, l] of lookups.entries()) {
    const data = tabs[i]?.data?.[0]; if (!data) throw new Error("a lookup table of the transaction could not be read");
    const u = unb64(data); for (const k of [...l.w, ...l.r]) { const o = 56 + 32 * k; if (o + 32 > u.length) throw new Error("a lookup table index is out of range"); out.add(base58(u.subarray(o, o + 32))); }
  }
  return out;
}
// (4) THE READS BEFORE SIGNING DO NOT DIE WITH ONE RPC (order 4 on 2026-11-18, a manual sell, failed with "Helius did not answer
// simulateTransaction"). A read that got no answer (a timeout, a dropped connection, HTTP 429/5xx) is asked again once on the
// same RPC, then on another one: the SOLANA_RPC_FALLBACK_URL secret when it is set, then the public Solana node. Only reads
// (balances, accounts, the simulation): a transaction is never SENT twice, and an RPC that ANSWERED with an error is believed.
// (Measured earlier the same day: the public node answered Cloudflare with 403, so in production the second RPC is real only
// once SOLANA_RPC_FALLBACK_URL holds one.)
const noAnswer = (e) => /did not answer|\(HTTP (429|5\d\d)\)/.test(String(e?.message || e));
export async function rpcRead(env, method, params) {
  for (let i = 0; i < 2; i++) { if (i) await sleep(Number(env.AQ_LIVE_POLL_MS ?? 400)); try { return await solRpc(env, method, params); } catch (e) { if (!noAnswer(e)) throw e; } }
  for (const url of [env.SOLANA_RPC_FALLBACK_URL, "https://api.mainnet-beta.solana.com"].filter(Boolean)) {
    try { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15000) }), j = await r.json();
      if (r.ok && !j?.error && j?.result != null) return j.result;
      if (r.ok && j?.error) throw Object.assign(new Error(`the second RPC refused ${method} (${cut(j.error.message, 120)})`), { answered: true });
    } catch (e) { if (e?.answered) throw e; } // the URL may carry a key: its raw error is never passed on
  }
  throw new Error(`no RPC answered ${method} (the main one twice, then the second one); nothing was signed`);
}
// getMultipleAccounts takes at most 100 addresses (MAX_MULTIPLE_ACCOUNTS, agave rpc-client-types): asked in batches of 100
async function multi(env, addrs, cfg) { const out = []; for (let i = 0; i < addrs.length; i += 100) out.push(...((await rpcRead(env, "getMultipleAccounts", [addrs.slice(i, i + 100), { ...cfg, commitment: "confirmed" }])).value || [])); return out; }
// ---- the associated token account address, derived exactly as the chain does: sha256(owner, token program, mint, bump,
// ATA program, "ProgramDerivedAddress") with the highest bump whose hash is NOT a point on ed25519 (checked against a real
// Jupiter swap on 2026-11-18: the derived wSOL account of the wallet is the one the swap wraps into).
const EP = 2n ** 255n - 19n, emod = (a) => ((a % EP) + EP) % EP, epow = (b, e) => { let r = 1n; b = emod(b); while (e > 0n) { if (e & 1n) r = (r * b) % EP; b = (b * b) % EP; e >>= 1n; } return r; };
const ED = emod(-121665n * epow(121666n, EP - 2n));
export function onCurve(k) {
  let y = 0n; for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(k[i]);
  const sign = y >> 255n; y &= (1n << 255n) - 1n; if (y >= EP) return false;
  const y2 = (y * y) % EP, u = emod(y2 - 1n), v = emod(ED * y2 + 1n), x = (((u * epow(v, 3n)) % EP) * epow(u * epow(v, 7n), (EP - 5n) / 8n)) % EP, vx2 = (((v * x) % EP) * x) % EP;
  if (vx2 !== u && vx2 !== emod(-u)) return false;
  return !(x === 0n && sign);
}
export async function ataOf(owner, mint, program = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") {
  const parts = [unbase58(owner), unbase58(program), unbase58(mint)], tail = new TextEncoder().encode("ProgramDerivedAddress"), prog = unbase58("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  for (let bump = 255; bump >= 0; bump--) {
    const buf = new Uint8Array(96 + 1 + 32 + tail.length); buf.set(parts[0], 0); buf.set(parts[1], 32); buf.set(parts[2], 64); buf[96] = bump; buf.set(prog, 97); buf.set(tail, 129);
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", buf)); if (!onCurve(h)) return base58(h);
  }
  throw new Error("no associated token address");
}
export const PROG = { system: "11111111111111111111111111111111", token: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", token22: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  ata: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", budget: "ComputeBudget111111111111111111111111111111", jup: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4" };
// What a swap may contain. Read from a real Jupiter swap on 2026-11-18 (/swap/v1/swap, wrapAndUnwrapSol): compute budget x2,
// System transfer from the wallet (wrap), Token SyncNative (17), the Jupiter route, Token CloseAccount (9) of the wrapped SOL
// to the wallet; plus Associated Token create (0) / create-idempotent (1). SPL instruction numbers read from
// solana-program/token interface/src/instruction.rs. Anything else (a token Transfer, Approve, SetAuthority, another program)
// is refused before signing.
export function checkIxs(b64tx, wallet, wsolAta = null) {
  const { keys, ixs } = readIxs(b64tx);
  for (const [i, x] of ixs.entries()) {
    const no = (w) => `instruction ${i} (${x.program || "a program from a lookup table"}) ${w}; not signed`;
    if (x.program === PROG.budget || x.program === PROG.jup) continue;
    if (x.program === PROG.ata) { if (x.data.length === 0 || x.data[0] === 0 || x.data[0] === 1) continue; return no("is not a token-account creation"); }
    // the only SOL a swap may move by itself: from the wallet into the wallet's OWN wrapped-SOL account (the wrap)
    if (x.program === PROG.system) { if (x.data.length === 12 && x.data[0] === 2 && !x.data[1] && !x.data[2] && !x.data[3] && keys[x.acc[0]] === wallet && wsolAta && keys[x.acc[1]] === wsolAta) continue; return no("is a System instruction other than a transfer from the wallet to its own wrapped-SOL account"); }
    if (x.program === PROG.token || x.program === PROG.token22) {
      if (x.data.length === 1 && x.data[0] === 17) continue;                          // SyncNative
      if (x.data.length === 1 && x.data[0] === 9 && keys[x.acc[1]] === wallet) continue; // CloseAccount, its SOL back to the wallet
      return no(`is token instruction ${x.data[0]}, which could move or hand over tokens`);
    }
    return no("calls a program outside Jupiter, System, Token, Token-2022, Associated Token and Compute Budget");
  }
  return null;
}
// The wallet's token accounts (both token programs), or those of one mint: address, mint, program, raw amount, lamports.
export async function tokenAccounts(env, owner, mint = null) {
  const out = [];
  for (const filter of mint ? [{ mint }] : [{ programId: PROG.token }, { programId: PROG.token22 }])
    for (const a of (await rpcRead(env, "getTokenAccountsByOwner", [owner, filter, { encoding: "jsonParsed", commitment: "confirmed" }])).value || []) {
      const i = a?.account?.data?.parsed?.info; if (a?.pubkey && i?.mint) out.push({ address: a.pubkey, mint: i.mint, program: a.account.owner, raw: String(i.tokenAmount?.amount ?? "0"), lamports: a.account.lamports });
    }
  return out;
}
const broadcast = (env, tx) => solRpc(env, "sendTransaction", [tx, { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 5 }]);
// The ONLY place a transaction is signed. It signs only a transaction that needs exactly one signature and is paid by the
// Aquarius wallet itself. The key is opened here, used once and dropped; it is never returned, stored or logged.
export async function signTx(env, wallet, b64tx) {
  const t = readTx(b64tx);
  if (t.nsig !== 1 || t.required !== 1 || t.payer !== wallet.address) throw new Error("the transaction is not a one-signature transaction of the Aquarius wallet; not signed");
  const key = await crypto.subtle.importKey("pkcs8", unb64(await unseal(env, wallet.sealed)), { name: "Ed25519" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, t.bytes.subarray(t.msgStart)));
  t.bytes.set(sig, t.sigStart);
  return { tx: b64(t.bytes), signature: base58(sig) };
}
// Before signing: run it on the chain's own simulator and look at what it does to the wallet's SOL. A buy may take the
// size plus a small fee budget and nothing more; a sell must bring back at least the quoted minimum less that budget.
// Then every token account of the wallet: untouched, except this trade's coin (its amount moves the right way and, on a sale,
// by no more than is sold; owner, delegate and state unchanged) and wrapped SOL. SPL account layout (state.rs): mint 0-32,
// owner 32-64, amount u64 64-72, then delegate, state, is_native, delegated amount, close authority.
// Every token account of the wallet that the transaction can touch is checked (one it does not list cannot change); a buy's
// coin account is watched even before it exists, and the tokens it receives must reach the quote's minimum.
export async function simulate(env, address, b64tx, { side, inLamports, minOutLamports, mint = null, inTokens = "0", minOutTokens = "0" }) {
  const bad = checkIxs(b64tx, address, await ataOf(address, SOL_MINT)); if (bad) return { ok: false, error: bad };
  const pre = (await rpcRead(env, "getBalance", [address])).value, keys = await txKeys(env, b64tx), mine = await tokenAccounts(env, address);
  const accts = mine.filter((a) => keys.has(a.address));
  if (side === "buy" && mint) for (const prog of [PROG.token, PROG.token22]) { const a = await ataOf(address, mint, prog); if (keys.has(a) && !accts.some((x) => x.address === a)) accts.push({ address: a, mint, program: prog, absent: true }); }
  const preData = accts.length ? await multi(env, accts.map((a) => a.address), { encoding: "base64" }) : [];
  const v = (await rpcRead(env, "simulateTransaction", [b64tx, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed", accounts: { encoding: "base64", addresses: [address, ...accts.map((a) => a.address)] } }])).value;
  if (v?.err) return { ok: false, error: `the simulation failed (${cut(JSON.stringify(v.err), 140)})` };
  const post = v?.accounts?.[0]?.lamports;
  if (typeof pre !== "number" || typeof post !== "number") return { ok: false, error: "the simulation did not show the wallet's balance" };
  const delta = post - pre;
  if (side === "buy" && -delta > inLamports + LIVE.feeBudgetLamports) return { ok: false, error: `the transaction would take ${round(-delta / 1e9, 6)} SOL, more than the ${round(inLamports / 1e9, 6)} SOL trade plus fees; not signed` };
  if (side === "sell" && delta < minOutLamports - LIVE.feeBudgetLamports) return { ok: false, error: `the transaction would bring back ${round(delta / 1e9, 6)} SOL, less than the quoted minimum; not signed` };
  const same = (x, y) => x.length === y.length && x.every((b, i) => b === y[i]), amt = (u) => new DataView(u.buffer, u.byteOffset, u.byteLength).getBigUint64(64, true);
  let received = 0n;
  for (const [i, a] of accts.entries()) {
    if (a.mint === SOL_MINT) continue;
    const before = preData[i]?.data?.[0] ?? null, after = v?.accounts?.[i + 1]?.data?.[0] ?? null;
    if (a.mint !== mint) { if (before !== after) return { ok: false, error: `the transaction would change the wallet's ${a.mint} token account, which this trade does not touch; not signed` }; continue; }
    if (a.absent && !before) { // the buy creates the coin's account: it must be ours, for this mint, and hold what was bought
      if (!after) continue;
      const y = unb64(after); if (y.length < 72 || base58(y.subarray(0, 32)) !== mint || base58(y.subarray(32, 64)) !== address) return { ok: false, error: "the coin's new token account would not belong to the wallet; not signed" };
      received += amt(y); continue;
    }
    if (!before || !after) { if (side === "sell" && before && !after) continue; return { ok: false, error: "the simulation did not show the coin's token account; not signed" }; }
    const x = unb64(before), y = unb64(after);
    if (x.length !== y.length || !same(x.subarray(0, 64), y.subarray(0, 64)) || !same(x.subarray(72), y.subarray(72))) return { ok: false, error: "the transaction would change the owner, delegate or state of the coin's token account; not signed" };
    const dt = amt(y) - amt(x);
    if (side === "buy" ? dt < 0n : dt > 0n || -dt > BigInt(inTokens)) return { ok: false, error: `the transaction would move ${dt} of the coin's tokens, not what this ${side} says; not signed` };
    received += dt;
  }
  if (side === "buy" && mint && received < BigInt(minOutTokens || "0")) return { ok: false, error: `the simulation shows ${received} of the coin's tokens arriving in the wallet, under the quote's minimum of ${minOutTokens}; not signed` };
  return { ok: true, pre, delta };
}

// ---------------------------------------------------------------- one order, start to finish
export const upd = (d, id, f) => { const ks = Object.keys(f); return d.q(`UPDATE mob_aq_live_orders SET ${ks.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`, [id, ...ks.map((k) => f[k])]); };
// What actually happened, read from the confirmed transaction: SOL in or out of the wallet (fees included) and the tokens moved.
function fillOf(tx, address, mint) {
  const m = tx?.meta, keys = tx?.transaction?.message?.accountKeys || [];
  if (!m || !Array.isArray(m.preBalances) || (keys[0]?.pubkey ?? keys[0]) !== address) return null;
  const mine = (list) => (list || []).filter((b) => b.owner === address && b.mint === mint), tok = (list) => mine(list).reduce((a, b) => a + BigInt(b.uiTokenAmount?.amount || "0"), 0n);
  // created: the wallet had no account for this coin before and has one after (this buy paid its rent)
  const created = !mine(m.preTokenBalances).length && mine(m.postTokenBalances).length > 0, idx = created ? mine(m.postTokenBalances)[0].accountIndex : null;
  // the rent the new account took: its own balance before and after (it is 0 before; index into the full account list)
  const rentLamports = created && Number.isInteger(idx) && m.postBalances[idx] > 0 ? m.postBalances[idx] - (m.preBalances[idx] || 0) : 0;
  return { solLamports: m.postBalances[0] - m.preBalances[0], feeLamports: m.fee ?? 0, tokens: tok(m.postTokenBalances) - tok(m.preTokenBalances), err: m.err ?? null, created, rentLamports };
}
// Ask the chain about one sent order and write down the answer. Returns "confirmed" | "failed" | "pending".
export async function settle(env, o, { polls = 1 } = {}) {
  const d = db(env), address = o.wallet || (await get(d, "sol_wallet_key"))?.address;
  for (let i = 0; i < polls; i++) {
    if (i) await sleep(Number(env.AQ_LIVE_POLL_MS ?? LIVE.confirmGapMs));
    let st; try { st = (await solRpc(env, "getSignatureStatuses", [[o.signature], { searchTransactionHistory: true }])).value?.[0] ?? null; } catch { continue; }
    if (st && st.err) { await finish(d, o, "failed", { error: `the chain rejected it (${cut(JSON.stringify(st.err), 140)})` }); return "failed"; }
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
      let tx = null; try { tx = await solRpc(env, "getTransaction", [o.signature, { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]); } catch {}
      const payer = tx?.transaction?.message?.accountKeys?.[0];
      if (tx?.meta && payer && (payer.pubkey ?? payer) !== address) { await finish(d, o, "failed", { error: "that signature belongs to a different transaction, not to this order" }); return "failed"; }
      const f = fillOf(tx, address, o.mint);
      if (!f) { // confirmed, but the details are not readable yet: asked again; after 3 minutes, read from the token balance
        if (o.venue === VENUE && o.mint && ageMin(o) >= LIVE.unreadableMin) { const est = await estimateFill(env, db(env), o, address); if (est) { await finish(db(env), o, "confirmed", { fill: est, error: est.note }); return "confirmed"; } }
        continue;
      }
      if (f.err) { await finish(d, o, "failed", { error: "the chain rejected it" }); return "failed"; }
      await finish(d, o, "confirmed", { fill: f }); return "confirmed";
    }
    if (!st) { // not on chain, says this RPC node. Only once its blockhash has expired can that be final, and one node's "null" is not proof.
      let h = null; try { h = await solRpc(env, "getBlockHeight", [{ commitment: "confirmed" }]); } catch {}
      const expired = typeof h === "number" && o.last_valid_height && h > Number(o.last_valid_height) + 5, stale = typeof h !== "number" && ageMin(o) >= LIVE.sentStaleMin;
      if (!expired && !stale) continue;
      const why = expired ? "it never reached the chain (its time window passed); nothing was spent" : `the chain never saw it in ${LIVE.sentStaleMin} minutes (far past a blockhash's ~150-block window); nothing was spent`;
      if (o.venue !== VENUE || !o.mint) { await finish(d, o, "failed", { error: why }); return "failed"; } // Phantom's own orders: his wallet, his page
      // (a) TWO empty reads some blocks apart: the first one past the window is only written down
      const nk = `live_null:${o.id}`, first = await get(d, nk);
      if (!first) { await set(d, nk, { h: typeof h === "number" ? h : null, at: Date.now() }); return "pending"; }
      if (typeof h === "number" && typeof first.h === "number" ? h < first.h + LIVE.nullGapBlocks : Date.now() - first.at < 30000) return "pending";
      // (b) the wallet itself: did this order's tokens move? If the balance cannot be read, nothing is decided
      const moved = await movedFill(env, d, o, address);
      if (moved === null) return "pending";
      await d.q(`DELETE FROM mob_aq_state WHERE k = $1`, [nk]);
      if (moved) { await finish(d, o, "confirmed", { fill: moved, error: moved.note }); await brain(d, `LIVE ${String(o.side).toUpperCase()} ${o.symbol}: the RPC said this order never landed, but its tokens moved in the wallet. Booked from the token balance (estimated), not as failed (${o.signature}).`); return "confirmed"; }
      await finish(d, o, "failed", { error: why }); return "failed";
    }
  }
  return "pending";
}
// Did a sent order's tokens really move? A buy: the wallet holds at least the quote's minimum more of the coin than its position
// had before. A sale: it holds at least the amount sold less. Returns the estimated fill, false (nothing moved), or null (unreadable).
async function movedFill(env, d, o, address) {
  const est = await estimateFill(env, d, o, address); if (!est) return null;
  const r = await d.one(`SELECT in_amount, min_out FROM mob_aq_live_orders WHERE id = $1`, [o.id]);
  if (o.side === "buy") { const min = /^\d+$/.test(String(r?.min_out || "")) ? BigInt(r.min_out) : null; return min !== null && min > 0n && est.tokens >= min ? { ...est, note: "the RPC reported it as never landed, but the tokens are in the wallet: booked from the token balance (estimated)" } : false; }
  const sold = /^\d+$/.test(String(r?.in_amount || "")) ? BigInt(r.in_amount) : null; return sold !== null && sold > 0n && -est.tokens >= sold ? { ...est, note: "the RPC reported it as never landed, but the tokens left the wallet: booked from the token balance (estimated)" } : false;
}
const ageMin = (o) => (o.sent_at ? (Date.now() - new Date(o.sent_at).getTime()) / 60000 : 0);
// A confirmed swap whose transaction the RPC will not return: the coin's token balance now, against what the position held
// before, says how many tokens moved; the SOL is the quote's minimum (a sale) or the amount in (a buy). Marked as estimated.
async function estimateFill(env, d, o, address) {
  let accts; try { accts = await tokenAccounts(env, address, o.mint); } catch { return null; }
  const held = accts.reduce((a, x) => a + BigInt(x.raw), 0n);
  const p = o.position_id ? await d.one(`SELECT tokens_raw, status, plan FROM mob_aq_live_positions WHERE id = $1`, [o.position_id]) : null;
  // created: the cost gate saw no account for this coin before the buy (plan.ataNew) and one exists now: its lamports are the rent
  const created = o.side === "buy" && p?.status === "opening" && p?.plan?.ataNew === true && accts.length > 0, rentLamports = created ? Number(accts[0].lamports) || 0 : 0;
  const r = await d.one(`SELECT in_amount, quote_out, min_out FROM mob_aq_live_orders WHERE id = $1`, [o.id]);
  const before = p && p.status !== "opening" && /^\d+$/.test(p.tokens_raw || "") ? BigInt(p.tokens_raw) : 0n, tokens = held - before, fee = LIVE.baseFeeLamports;
  const sol = o.side === "buy" ? -Number(r?.in_amount || 0) - fee - rentLamports : tokens < 0n ? Number(r?.min_out ?? r?.quote_out ?? 0) - fee : -fee;
  return { solLamports: sol, feeLamports: fee, tokens, err: null, created, rentLamports, note: "confirmed on the chain; getTransaction never answered, so the fill was read from the token balance and the SOL is the quote's minimum (estimated)" };
}
// The order's end, and its position's, in one statement each way. A row that is already finished is never finished twice.
export async function finish(d, o, status, { error = null, fill = null } = {}) {
  const won = await d.one(`UPDATE mob_aq_live_orders SET status = $2, error = coalesce($3, error), fill_sol = $4, fill_tokens = $5, fee_sol = $6, confirmed_at = CASE WHEN $2 = 'confirmed' THEN now() END, updated_at = now()
    WHERE id = $1 AND status IN ('requested','sent') RETURNING id`, [o.id, status, error, fill ? fill.solLamports / 1e9 : null, fill ? fill.tokens.toString() : null, fill ? fill.feeLamports / 1e9 : null]);
  if (!won) return;
  await d.q(`DELETE FROM mob_aq_state WHERE k = $1`, [`live_null:${o.id}`]); // the "first empty read" note of settle(), if there was one
  if (o.venue === "phantom") { if (status === "confirmed") await phantomApply(d, o, fill); return; }
  if (!o.position_id) return;
  if (o.side === "buy" && /\|add\|/.test(o.claim || "")) { // Alex's BUY MORE on an open position: tokens and cost add up (average cost), the plan stays
    if (status === "confirmed" && fill.tokens > 0n) {
      await d.q(`UPDATE mob_aq_live_positions SET tokens_raw = (tokens_raw::numeric + $2::numeric)::text, cost_sol = cost_sol + $3, fees_sol = fees_sol + $4 WHERE id = $1`, [o.position_id, fill.tokens.toString(), -fill.solLamports / 1e9, fill.feeLamports / 1e9]);
      await brain(d, `LIVE BUY MORE ${o.symbol} (manual: Alex): ${round(-fill.solLamports / 1e9, 6)} SOL added (${o.signature}).`);
    }
    return;
  }
  if (o.side === "buy") {
    // the plan is rebased on the real fill: the quote promised quote_out tokens for the SOL; fewer tokens = a worse price by the
    // same ratio. entry becomes the fill price (so "stop to entry" after target 1 is the real breakeven); chartEntry keeps the chart's.
    if (status === "confirmed" && fill.tokens > 0n) {
      const row = await d.one(`SELECT o.quote_out, p.plan FROM mob_aq_live_orders o LEFT JOIN mob_aq_live_positions p ON p.id = o.position_id WHERE o.id = $1`, [o.id]);
      const qo = Number(row?.quote_out), ratio = qo > 0 ? qo / Number(fill.tokens) : 1, pl = row?.plan;
      // the rent of a new token account is NOT trade cost: it is kept apart (plan.rentSol), comes back by closeAccount, and is
      // booked as a loss only if it never does. Marks, the daily budget and the loss check never see it.
      const rent = fill.created ? Math.max(0, fill.rentLamports || 0) : 0;
      // THE REAL FILL PRICE: the SOL this buy cost (fees in, rent out) over the tokens that arrived, in the plan's unit (USD at
      // the SOL price the buy was checked at). Only a plan without the coin's decimals (none is made that way now) falls back
      // to the old ratio of quoted to received tokens.
      const real = pl ? pxOf(-fill.solLamports - rent, fill.tokens, pl.dec, pl.unit || "USD", pl.solUsd) : null, entry = real ?? (pl ? pl.entry * ratio : null);
      await d.q(`UPDATE mob_aq_live_positions SET status = 'open', tokens_raw = $2, cost_sol = $3, fees_sol = fees_sol + $4, opened_at = now(),
        plan = CASE WHEN plan IS NULL THEN NULL ELSE plan || jsonb_build_object('chartEntry', plan->'entry', 'entry', $8::float8, 'entryFrom', $9::text, 'fillRatio', $5::float8, 'ataCreated', $6::boolean, 'rentSol', $7::float8) END
        WHERE id = $1 AND status = 'opening'`, [o.position_id, fill.tokens.toString(), (-fill.solLamports - rent) / 1e9, fill.feeLamports / 1e9, ratio, !!fill.created, rent / 1e9, entry, real ? "fill" : "ratio"]);
    }
    else await d.q(`UPDATE mob_aq_live_positions SET status = 'failed', closed_at = now(), exit_reason = $2 WHERE id = $1 AND status = 'opening'`, [o.position_id, cut(error || "the buy brought no tokens")]);
    if (status === "confirmed") await brain(d, `LIVE BUY ${o.symbol}: ${round(-fill.solLamports / 1e9, 6)} SOL from the Aquarius wallet (${o.signature}). Chart plan: stop ${o.plan_patch?.stop ?? "?"}, targets ${o.plan_patch?.t1 ?? "?"} / ${o.plan_patch?.t2 ?? "?"}.`);
    return;
  }
  if (status === "confirmed") {
    // a partial sale (target 1: half) keeps the position open with the plan's next step; selling what is left closes it
    const p = await d.one(`UPDATE mob_aq_live_positions SET tokens_raw = greatest(0, tokens_raw::numeric - $5::numeric)::text, proceeds_sol = coalesce(proceeds_sol, 0) + $2, fees_sol = fees_sol + $3,
        status = CASE WHEN tokens_raw::numeric - $5::numeric <= 0 OR plan->>'writtenOff' = 'true' THEN 'closed' ELSE 'open' END, sell_fails = 0, closed_at = CASE WHEN tokens_raw::numeric - $5::numeric <= 0 OR plan->>'writtenOff' = 'true' THEN coalesce(closed_at, now()) END,
        pnl_sol = CASE WHEN plan->>'writtenOff' = 'true' THEN pnl_sol + $2 WHEN tokens_raw::numeric - $5::numeric <= 0 THEN coalesce(proceeds_sol, 0) + $2 - cost_sol END, exit_reason = CASE WHEN plan->>'writtenOff' = 'true' THEN exit_reason WHEN tokens_raw::numeric - $5::numeric <= 0 THEN $4 ELSE exit_reason END,
        plan = CASE WHEN plan->>'writtenOff' = 'true' THEN plan || jsonb_build_object('recovered', true, 'recoveredAt', now(), 'recoveredSol', $2::float8) WHEN tokens_raw::numeric - $5::numeric <= 0 THEN coalesce(plan, '{}'::jsonb) || jsonb_build_object('outcome', $4::text, 'closedAt', now()) WHEN plan IS NULL THEN NULL ELSE plan || coalesce($6::jsonb, '{}'::jsonb) || '{"slipFails":0}'::jsonb END
      WHERE id = $1 AND status = 'closing' RETURNING status, pnl_sol`, [o.position_id, fill.solLamports / 1e9, fill.feeLamports / 1e9, o.reason, (-fill.tokens).toString(), o.plan_patch ? JSON.stringify(o.plan_patch) : null]);
    if (p) { await brain(d, `LIVE SELL ${o.symbol} (${o.reason}): ${round(fill.solLamports / 1e9, 6)} SOL back${p.status === "closed" ? `, ${p.pnl_sol >= 0 ? "+" : ""}${round(p.pnl_sol, 6)} SOL on the trade` : ", the rest stays open"} (${o.signature}).`); if (p.status === "closed") await dailyLossCheck(d); }
  } else await d.q(`UPDATE mob_aq_live_positions SET status = CASE WHEN plan->>'writtenOff' = 'true' THEN 'closed' WHEN sell_fails + 1 >= $2 THEN 'stuck' ELSE 'open' END, sell_fails = sell_fails + 1,
      plan = CASE WHEN $3::boolean AND plan IS NOT NULL THEN plan || jsonb_build_object('slipFails', coalesce((plan->>'slipFails')::int, 0) + 1) ELSE plan END
    WHERE id = $1 AND status = 'closing'`, [o.position_id, LIVE.maxSellFails, isChainFail(error)]); // every failure counts toward 'stuck'; only a chain/simulator refusal widens the slippage
}
// A confirmed trade Alex approved in Phantom: his position in that coin is opened, added to, reduced or closed. Runs once
// per order (only the caller that moved the order to "confirmed" gets here). Phantom positions are his own: Aquarius
// never sells them, it only tells him (SELL NOW) when the chart says so: stop, target or invalidation. Never a timer.
async function phantomApply(d, o, fill) {
  if (o.side === "buy" && fill.tokens > 0n) {
    // bought on a signal of the same coin: that signal's chart plan is the position's plan; bought on his own: no plan, no SELL NOW
    const sig = await get(d, "phantom_signal"), plan = sig && sig.mint === o.mint && sig.plan && Date.now() - new Date(sig.at).getTime() < 600000 ? { ...sig.plan, entryT: Math.floor(Date.now() / 1000), since: Math.floor(Date.now() / 1000) } : null;
    await d.q(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, tokens_raw, cost_sol, fees_sol, plan, opened_at)
      VALUES ('phantom',$1,$2,'open',$3,$4,$5,$6, now())
      ON CONFLICT (venue, mint) WHERE status IN ('opening','open','closing','stuck') DO UPDATE SET tokens_raw = (mob_aq_live_positions.tokens_raw::numeric + EXCLUDED.tokens_raw::numeric)::text,
        cost_sol = mob_aq_live_positions.cost_sol + EXCLUDED.cost_sol, fees_sol = mob_aq_live_positions.fees_sol + EXCLUDED.fees_sol`,
      [o.mint, o.symbol, fill.tokens.toString(), -fill.solLamports / 1e9, fill.feeLamports / 1e9, plan ? JSON.stringify(plan) : null]);
    await brain(d, `PHANTOM BUY ${o.symbol} by Alex: ${round(-fill.solLamports / 1e9, 6)} SOL from his Phantom wallet (${o.signature}).`);
  } else if (o.side === "sell" && fill.tokens < 0n) {
    // the share of the position that was sold takes the same share of its cost; all of it sold (or a 100% sell) closes it
    await d.q(`UPDATE mob_aq_live_positions p SET tokens_raw = greatest(0, p.tokens_raw::numeric - $2::numeric)::text, proceeds_sol = coalesce(p.proceeds_sol, 0) + $3, fees_sol = p.fees_sol + $4,
        pnl_sol = coalesce(p.pnl_sol, 0) + $3 - p.cost_sol * least(1, $2::numeric / nullif(p.tokens_raw::numeric, 0))::float8, cost_sol = p.cost_sol * (1 - least(1, $2::numeric / nullif(p.tokens_raw::numeric, 0))::float8),
        status = CASE WHEN $5 OR p.tokens_raw::numeric <= $2::numeric THEN 'closed' ELSE p.status END, closed_at = CASE WHEN $5 OR p.tokens_raw::numeric <= $2::numeric THEN now() END, exit_reason = $6,
        plan = CASE WHEN NOT ($5 OR p.tokens_raw::numeric <= $2::numeric) AND p.alert_action = 'sell_half' AND p.plan IS NOT NULL THEN p.plan || p.alert_patch ELSE p.plan END,
        alert = CASE WHEN p.alert_action = 'sell_half' THEN NULL ELSE p.alert END, alert_action = CASE WHEN p.alert_action = 'sell_half' THEN NULL ELSE p.alert_action END
      WHERE p.venue = 'phantom' AND p.mint = $1 AND p.status IN ('open','stuck')`, [o.mint, (-fill.tokens).toString(), fill.solLamports / 1e9, fill.feeLamports / 1e9, /100%/.test(o.reason || ""), o.reason]);
    await brain(d, `PHANTOM SELL ${o.symbol} by Alex (${o.reason}): ${round(fill.solLamports / 1e9, 6)} SOL back to his Phantom wallet (${o.signature}).`);
  }
}
// today's realized result plus the marked loss of every position still held (open, closing, stuck): a loss on screen counts
export async function pnlToday(d) { return (await d.one(`SELECT (coalesce(sum(pnl_sol) FILTER (WHERE status = 'closed' AND closed_at >= ${TODAY}), 0)
  + coalesce(sum(least(0, coalesce(proceeds_sol, 0) + coalesce(last_value_sol, cost_sol - coalesce(proceeds_sol, 0)) - cost_sol)) FILTER (WHERE status IN ('open','closing','stuck') AND cost_sol IS NOT NULL), 0))::float8 s FROM mob_aq_live_positions WHERE venue = $1`, [VENUE])).s; }
// The day's risk: realized + marked (pnl), and what it becomes if every open position's exit runs as badly as it really can
// (committed): value = marked value x (stop less the 5% disaster margin) / last price, less the exit slippage and one network
// fee; a fresh curve coin never counts for less than a 50% fall. A buy still on its way counts its size times its plan's worst
// case. New buys are refused, and sized, against the committed number.
// THE NUMBERS (limits read from production 2026-11-18: 0.05 SOL a trade, 3 open, 0.06 SOL a day): a fresh curve position of
// 0.05 SOL commits 0.025 SOL, so three of them (0.075) do NOT fit in 0.06: two full positions commit 0.05, and the third is
// sized to what is left (0.06 - 2 x 0.025061 = 0.009878, less its own fees, / 0.5 = about 0.0195 SOL), i.e. at most about 0.12 SOL of curve coins open, not 0.15. An established coin
// with an 8% stop commits about 15.5% (8 + 5 + 1.5 + 1) = 0.0078 SOL, so three fit (0.023).
export async function riskToday(d, feeSide = LIVE.feePerSideFallbackLamports) {
  const realized = (await d.one(`SELECT coalesce(sum(pnl_sol), 0)::float8 s FROM mob_aq_live_positions WHERE venue = $1 AND status = 'closed' AND closed_at >= ${TODAY}`, [VENUE])).s;
  let marked = 0, worst = 0; const slip = 1 - LIVE.exitSlippageBps / 1e4;
  for (const p of await d.q(`SELECT cost_sol, proceeds_sol, last_value_sol, stop_pct, plan, alert_patch FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE}`, [VENUE])) {
    const fresh = p.plan?.fresh === true, gap = 1 - LIVE.freshGapLossPct / 100, dz = 1 - LIVE.disasterPct / 100;
    if (p.cost_sol == null) { worst -= (p.plan?.sizeSol ?? 0) * (p.plan?.worstPct > 0 ? p.plan.worstPct / 100 : worstFrac((p.stop_pct ?? 100) / 100, fresh ? LIVE.freshMaxRtPct : FIB.maxRtPct, fresh)) + (2 * feeSide) / 1e9; continue; }
    const got = p.proceeds_sol || 0, now = p.last_value_sol ?? p.cost_sol - got, pl = p.plan;
    marked += Math.min(0, got + now - p.cost_sol);
    const stop = pl ? (pl.phase === 2 ? Math.max(pl.stop, pl.trailStop ?? -Infinity) : pl.stop) : null, spark = p.alert_patch?.spark;
    const px = Array.isArray(spark) && spark.length ? spark[spark.length - 1] : pl?.chartEntry ?? pl?.entry;
    // the exit is not AT the stop: the stop waits for a 5-minute close and the fast exit acts disasterPct under it; a fresh curve
    // coin can fall freshGapLossPct inside one bar whatever the stop says
    const atStop = stop > 0 && px > 0 ? now * Math.min(1, (stop * dz) / px) : now * Math.max(0, 1 - (p.stop_pct ?? 100) / 100 - LIVE.disasterPct / 100);
    let atExit = atStop * slip; if (fresh) atExit = Math.min(atExit, now * gap); // the same worst case the buy was sized with (worstFrac)
    worst += Math.min(0, got + atExit - p.cost_sol) - feeSide / 1e9;
  }
  return { realized, marked, worst, pnl: realized + marked, committed: realized + worst };
}
// The network fee of one side, from our own last confirmed swaps (median of up to 20, at least 3), else the measured 61,000.
export async function feePerSide(d) {
  const r = await d.one(`SELECT count(*)::int n, percentile_cont(0.5) WITHIN GROUP (ORDER BY fee_sol)::float8 m FROM (SELECT fee_sol FROM mob_aq_live_orders WHERE venue = $1 AND side IN ('buy','sell') AND status = 'confirmed' AND fee_sol IS NOT NULL ORDER BY id DESC LIMIT 20) x`, [VENUE]);
  return r.n >= 3 && r.m > 0 ? Math.round(r.m * 1e9) : LIVE.feePerSideFallbackLamports;
}
// The daily loss limit: when today's realized loss reaches it, auto trade switches itself OFF and says why.
async function dailyLossCheck(d) {
  const lim = await get(d, "sol_wallet_limits", {}), pnl = await pnlToday(d);
  if (!lim.autoTrade || !(lim.maxDailyLossSol > 0) || -pnl < lim.maxDailyLossSol) return false;
  await set(d, "sol_wallet_limits", { ...lim, autoTrade: false });
  const why = `Auto trade switched itself OFF: today's live loss is ${round(-pnl, 6)} SOL, at the daily limit of ${lim.maxDailyLossSol} SOL.`;
  await set(d, "live_auto_off", { why, at: new Date().toISOString() }); await brain(d, why); await refuse(d, VENUE, "daily_loss", why);
  return true;
}
// Build, check, sign, record, send, confirm. `claim` is the order's one-time key; the caller already holds the position row.
// ORPHIC HYMN 15, Διός (Wikisource, CC BY-SA 4.0), first lines:
//   Ζεῦ πολυτίμητε, Ζεῦ ἄφθιτε, τήνδε τοι ἡμεῖς,
//   μαρτυρίην τιθέμεσθα λυτήριον ἠδὲ πρόσευξιν.
//   ὦ βασιλεῦ, διὰ σὴν κεφαλὴν ἐφάνη τάδε ῥεῖα,
async function execute(env, w, { side, c, positionId, inMint, outMint, amountRaw, slippageBps, reason, claim, q0 = null, patch = null, maxBuyFeeLamports = null }) {
  const d = db(env);
  let o;
  try { o = await d.one(`INSERT INTO mob_aq_live_orders (venue, side, mint, symbol, position_id, claim, reason, in_amount, slippage_bps, plan_patch) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [VENUE, side, c.mint, c.symbol, positionId, claim, reason, String(amountRaw), slippageBps, patch ? JSON.stringify(patch) : null]); }
  catch (e) { if (/duplicate key|unique constraint/i.test(String(e.message || e))) return { skipped: "this order was already made in this minute" }; return { skipped: `the order could not be written down (${cut(e.message || e, 120)}); nothing was sent`, noOrder: true }; }
  const fail = async (error) => { await finish(d, o, "failed", { error }); return { failed: error, orderId: o.id }; };
  try {
    const qr = q0 || (await quote(env, inMint, outMint, amountRaw, slippageBps));
    if (!qr.ok) return fail(qr.error);
    const impCap = c?.fresh ? LIVE.freshMaxImpactPct : LIVE.maxImpactPct;
    if (side === "buy" && qr.impactPct > impCap) return fail(`price impact ${round(qr.impactPct, 2)}% is over the ${impCap}% cap`);
    await upd(d, o.id, { quote_out: qr.q.outAmount, min_out: qr.q.otherAmountThreshold, impact_pct: qr.impactPct, quote: JSON.stringify({ route: (qr.q.routePlan || []).map((r) => r.swapInfo?.label).filter(Boolean) }) });
    const sw = await buildSwap(env, qr.q, w.address);
    if (!sw.ok) return fail(sw.error);
    // the buy's own network fee, now that Jupiter has priced it: it must still fit the cost gate's room
    if (side === "buy" && maxBuyFeeLamports != null && LIVE.baseFeeLamports + sw.priorityLamports > maxBuyFeeLamports) return fail(`the network fee (${LIVE.baseFeeLamports + sw.priorityLamports} lamports) is over the ${Math.max(0, maxBuyFeeLamports)} lamports the cost gate leaves for it`);
    const sim = await simulate(env, w.address, sw.tx, { side, inLamports: side === "buy" ? Number(amountRaw) : 0, minOutLamports: side === "sell" ? Number(qr.q.otherAmountThreshold) : 0, mint: c.mint, inTokens: side === "sell" ? String(amountRaw) : "0", minOutTokens: side === "buy" ? String(qr.q.otherAmountThreshold) : "0" });
    if (!sim.ok) return fail(sim.error);
    const signed = await signTx(env, w, sw.tx);
    // the signature is on record BEFORE the send: whatever happens next, the chain can be asked about this exact transaction
    await upd(d, o.id, { status: "sent", signature: signed.signature, last_valid_height: sw.lastValidBlockHeight, sent_at: new Date().toISOString() });
    o = { ...o, status: "sent", signature: signed.signature, last_valid_height: sw.lastValidBlockHeight, sent_at: new Date().toISOString(), quote_out: qr.q.outAmount };
    try { await broadcast(env, signed.tx); }
    catch (e) { await upd(d, o.id, { error: cut(`send: ${e.message || e}`) }); } // unknown outcome: NOT failed, NOT sent again. The chain decides.
    const end = await settle(env, o, { polls: LIVE.confirmPolls });
    return { [end]: true, orderId: o.id, signature: o.signature };
  } catch (e) {
    if (o.status === "sent") return { pending: true, orderId: o.id, signature: o.signature, note: cut(e.message || e) };
    return fail(cut(e.message || e));
  }
}

// ---------------------------------------------------------------- gates (every one, on the server, before any order)
export async function gates(env) {
  const d = db(env);
  const S = Object.fromEntries((await d.q(`SELECT k, v FROM mob_aq_state WHERE k IN ('sol_wallet_key','sol_wallet_limits','kill')`)).map((r) => [r.k, r.v]));
  // the panel's limits, never above the server's hard caps (wallet.mjs HARD_CAPS)
  const w = S.sol_wallet_key, lim = clampLimits({ maxPerTradeSol: 0, maxDailyLossSol: 0, maxOpenPositions: 0, autoTrade: false, ...(S.sol_wallet_limits || {}) }, env);
  const no = (gate, reason) => ({ ok: false, gate, reason, w, lim });
  if (!w?.address || !w.sealed) return no("no_wallet", "The Aquarius wallet has not been created");
  if (!lim.autoTrade) return no("auto_trade_off", "Auto trade is off");
  if (S.kill === true) return no("kill_switch", "The kill switch is on");
  if (!(lim.maxPerTradeSol > 0)) return no("limit_per_trade", "Most per trade is zero");
  if (!(lim.maxDailyLossSol > 0)) return no("limit_daily_loss", "Most lost in a day is zero");
  if (!(lim.maxOpenPositions > 0)) return no("limit_open", "Open positions at once is zero");
  const feeSide = await feePerSide(d), rk = await riskToday(d, feeSide);
  if (-rk.pnl >= lim.maxDailyLossSol) { await dailyLossCheck(d); return no("daily_loss", `Today's live loss is ${round(-rk.pnl, 6)} SOL (realized and marked), at the daily limit of ${lim.maxDailyLossSol} SOL`); }
  const budgetLeft = lim.maxDailyLossSol + rk.committed;
  if (!(budgetLeft > 0)) return no("daily_loss_risk", `Today's loss plus the worst case of the open positions is ${round(-rk.committed, 6)} SOL: no room in the ${lim.maxDailyLossSol} SOL daily budget for a new trade`);
  const open = (await d.one(`SELECT count(*)::int n FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE}`, [VENUE])).n;
  if (open >= lim.maxOpenPositions) return no("max_open", `${open} live position(s) open, the limit is ${lim.maxOpenPositions}`);
  if ((await d.one(`SELECT count(*)::int n FROM mob_aq_live_orders WHERE venue = $1 AND status IN ('requested','sent')`, [VENUE])).n) return no("order_pending", "An earlier order is still being confirmed on the chain");
  return { ok: true, w, lim, open, budgetLeft, feeSide, risk: rk };
}
// A Grok VETO: a war-room message or an evidence post from Grok in the last hour whose text is "VETO <exact mint>" (markup,
// quote marks and a colon allowed around the word). "VETO lifted on <mint>" or a mint named later in the text is not a veto.
export const isVeto = (text, mint) => new RegExp(`^[\\s>*_\`#~-]*VETO[\\s*_\`:~-]+${mint}(?![1-9A-HJ-NP-Za-km-z])`, "i").test(String(text || ""));
export async function vetoed(d, mint) {
  const rows = await d.q(`SELECT text FROM mob_aq_chat WHERE from_name = 'grok' AND at > now() - interval '1 hour' AND strpos(text, $1) > 0
    UNION ALL SELECT text FROM mob_aq_helpers WHERE from_helper = 'grok' AND at > now() - interval '1 hour' AND strpos(text, $1) > 0`, [mint]);
  return rows.some((r) => isVeto(r.text, mint));
}
// The coin's liquidity by exact mint: Jupiter's lists first, and when a draining coin has fallen off them (exactly when it
// matters), its own number from Jupiter's price API by mint (price/v3 "liquidity": read live 2026-11-18, the same figure as the
// lists' baseAsset.liquidity for the same 8 coins). Null only when neither answers; the chart stop still runs.
export async function liqOf(env, mint) {
  const top = await feeds.jupTop(env); const c = top.ok && Array.isArray(top.data) ? top.data.find((x) => x.mint === mint) : null;
  if (c && Number.isFinite(c.liqUsd)) return c.liqUsd;
  return liqIn(await priceRows(env, [mint]), mint);
}
// The coins the chart trader may look at: established pairs with a deep enough pool, mid-size pools first.
export async function candidates(env) {
  const top = await feeds.jupTop(env), nowMs = Date.now();
  if (!top.ok || !Array.isArray(top.data)) return null;
  return top.data.filter((c) => c.quoteMint === SOL_MINT && c.liqUsd >= LIVE.poolMinUsd && c.createdAt && nowMs - new Date(c.createdAt).getTime() > LIVE.minAgeDays * 86400000)
    .sort((a, b) => (a.liqUsd <= LIVE.poolPreferMaxUsd ? 0 : 1) - (b.liqUsd <= LIVE.poolPreferMaxUsd ? 0 : 1) || b.liqUsd - a.liqUsd);
}
// Look for the setup among those coins. Returns {c, s} (the coin and the chart setup) for the first coin that passes every
// validation, or the last refusal (each written down under `venue`). `skip(mint, s)` = coins or legs not to take again.
// A symbiote RIGHT CALL is its own candidate (Inspector 2026-11-18: right calls are fresh launches, never in the established
// list above). The pool floor for these fresh coins is symbiote's: 10 SOL of real reserves in the curve, re-checked every
// 5 minutes (sym/do.mjs LIQ_FLOOR_SOL); liqUsd here is Jupiter's figure for the coin, else those reserves x2 at the SOL price.
export async function freshRightCandidates(env, d, known = new Set()) {
  const rows = (await d.q(`SELECT r.mint, r.symbol, r.checks->>'realSol' real_sol FROM mob_aq_sym_right r WHERE r.status = 'candidate' AND coalesce(r.checked_at, r.flagged_at) > now() - $1::float8 * interval '1 minute'`, [await rightCallTtlMin(d)]).catch(() => [])).filter((r) => !known.has(r.mint));
  if (!rows.length) return [];
  // Jupiter's price API carries a "liquidity" figure for coins still ON the curve too (read 2026-11-18: $2.2K-$5.9K on seven
  // live curve coins): whether a figure is a curve's or a pool's is decided by the quote's route at the buy (plan.onCurve).
  const px = (await priceRows(env, [SOL_MINT, ...rows.map((r) => r.mint)])) || {}, solUsd = Number(px[SOL_MINT]?.usdPrice) > 0 ? Number(px[SOL_MINT].usdPrice) : null;
  return rows.map((r) => { const l = liqIn(px, r.mint), j = l != null; return { mint: r.mint, symbol: r.symbol, quoteMint: SOL_MINT, fresh: true, liqBasis: j ? "jupiter" : "curve", liqUsd: j ? l : solUsd && Number(r.real_sol) > 0 ? Number(r.real_sol) * 2 * solUsd : null }; });
}
// One-minute candles: Jupiter's chart first; for a fresh coin Jupiter may have none, then symbiote's own bars built from the
// curve's trade stream (mob_aq_sym_bars, the coin's price in SOL; the chart rules are ratios, so the unit does not matter).
export async function candlesFor(env, d, mint, prefer = "jupiter") {
  const jup = async () => { const cs = await feeds.jupCandles(env, mint); return cs.ok ? { ...cs, src: "jupiter", unit: "USD" } : cs; };
  const sym = async () => { const rows = await d.q(`SELECT t, o, h, l, c, v FROM mob_aq_sym_bars WHERE mint = $1 AND t > extract(epoch from now())::bigint - 21600 ORDER BY t`, [mint]).catch(() => []);
    return rows.length ? { ok: true, src: "symbiote", unit: "SOL", data: rows.map((r) => ({ t: Number(r.t), o: Number(r.o), h: Number(r.h), l: Number(r.l), c: Number(r.c), v: Number(r.v) || 0 })) } : { ok: false }; };
  if (prefer === "only:jupiter") return jup();
  if (prefer === "only:symbiote") return sym();
  const [a, b] = prefer === "symbiote" ? [sym, jup] : [jup, sym];
  const first = await a(); if (first.ok) return first;
  return b();
}
// 3) A live position's candles in ITS plan's unit. The plan's own source first, then the other one, converted at the SOL price
// (USD <-> SOL), never mixed silently. EVERY source must pass the same freshness test (a closed 1-minute bar inside
// FIB.staleSec), converted or not: a frozen source (migration, a pause, a restart) is never "good data". If neither is fresh
// the answer is {ok:false, stale:true} and the caller's live-price rules decide (see exits()).
export async function positionCandles(env, d, p, nowSec) {
  const unit = p.plan?.unit || "USD", own = p.plan?.src === "symbiote" ? "symbiote" : "jupiter", fresh = (cs) => cs.ok && cs.data.some((c) => c.t + 60 <= nowSec && nowSec - (c.t + 60) <= FIB.staleSec);
  let k; const perUsd = async () => { if (k === undefined) { const u = await solUsdLive(env); k = u > 0 ? 1 / u : null; } return k; };
  for (const src of [own, own === "symbiote" ? "jupiter" : "symbiote"]) {
    let cs = await candlesFor(env, d, p.mint, `only:${src}`);
    if (!fresh(cs)) continue; // judged on its timestamps before any conversion
    if (cs.unit !== unit) { const r = await perUsd(); if (!r) continue; cs = { ...cs, unit, converted: true, data: cs.data.map((c) => conv(c, cs.unit === "USD" ? r : 1 / r)) }; }
    return cs;
  }
  return { ok: false, stale: true };
}
// the HARD STOP (no fresh candle from either source): sell when the live price is at or under the live stop. `spot` null means
// "no price from any source": exits() calls it that way only after LIVE.noPriceTicks misses in a row (each miss already being
// two sources asked twice), because one missed price call must never dump a position. Otherwise null (manage() decides).
export function hardStop(plan, spot) {
  const stop = plan.phase === 2 && plan.trailStop ? plan.trailStop : plan.stop;
  if (spot == null || !Number.isFinite(spot)) return { action: "sell_all", reason: "hard stop: no price from any source, the stop cannot be watched" };
  if (spot <= stop) return { action: "sell_all", reason: "hard stop: the spot price is at or under the stop while the candles are frozen" };
  return null;
}
const conv = (c, k) => ({ ...c, o: c.o * k, h: c.h * k, l: c.l * k, c: c.c * k });
// A) THE LANE SWITCHES, in the live settings (sol_wallet_limits.lanes), enforced here on the server for the live trader and
// the Phantom signal alike. Default: market ON, right call OFF (the Inspector passed the market lane only, 2026-11-18).
// A lane is ON only on a clean value. Nothing stored at all = the default (market on, right call off). Anything malformed (lanes
// that is not a plain object, a switch that is not true/false) fails CLOSED: that lane is off.
export const lanesOf = (lim) => { const l = lim?.lanes;
  if (l === undefined || l === null) return { market: true, rightCall: false };
  if (typeof l !== "object" || Array.isArray(l)) return { market: false, rightCall: false };
  return { market: l.market === undefined ? true : l.market === true, rightCall: l.rightCall === true }; };
export async function scanFib(env, venue, skip) {
  const d = db(env), est = await candidates(env), nowSec = Date.now() / 1000;
  // a right call that is also an established coin is taken from the established list (Jupiter's own pool and chart)
  const fresh = await freshRightCandidates(env, d, new Set((est || []).map((c) => c.mint)));
  const list = [...(est || []), ...fresh];
  if (!est && !fresh.length) return { refusal: await refuse(d, venue, "no_market_data", "Jupiter's coin lists did not answer") };
  if (!list.length) return { refusal: await refuse(d, venue, "no_candidate", "No established coin with a pool of $100K or more, and no fresh right call, right now") };
  // TWO LANES (Alex via the coordinator, 2026-11-18: "trading is MAINLY from symbiote right calls, but Aquarius and Grok also
  // trade the market on their own judgement"):
  //  right_call: a coin symbiote flagged as a RIGHT CALL that passed its deep checks (fresh curve coins keep their own cost rules);
  //  market:     an ESTABLISHED coin (over a day old, pool of $100K or more: candidates()) with a valid chart setup, no right call
  //              needed, under the established rules (1% round trip, 1% impact) and every other gate.
  // Right calls are looked at first. A fresh coin is never bought without a right call.
  const right = await rightCalls(d), lanes = lanesOf(await get(d, "sol_wallet_limits", {}));
  if (!lanes.market && !lanes.rightCall) return { refusal: await refuse(d, venue, "lanes_off", "Both entry lanes (market and right call) are OFF in the live settings: no live entry") };
  // with the right-call lane off a FRESH coin is never bought; an established coin that also has a right call is a market coin
  const rc = lanes.rightCall ? list.filter((c) => right.has(c.mint)).map((c) => ({ ...c, lane: "right_call" })) : [];
  const mk = lanes.market ? list.filter((c) => !c.fresh && !(lanes.rightCall && right.has(c.mint))).map((c) => ({ ...c, lane: "market" })) : [];
  const freshOff = lanes.rightCall ? 0 : fresh.length;
  const offWhy = freshOff ? `The right-call lane is OFF in the live settings: ${freshOff} fresh right call(s) from symbiote were not looked at, a fresh coin is never bought while it is off` : null;
  if (offWhy) await refuse(d, venue, "lane_off", offWhy);
  if (!rc.length && !mk.length) return { refusal: offWhy ? { refused: "lane_off", reason: offWhy } : await refuse(d, venue, "no_right_call", lanes.market ? `Symbiote has no fresh right call (checked in the last ${await rightCallTtlMin(d)} minutes) that passed its deep checks, and no established coin is on the lists: no live entry` : `The market lane is OFF and symbiote has no fresh right call (checked in the last ${await rightCallTtlMin(d)} minutes): no live entry`) };
  // B) ROTATION: the scan looks at candidatesPerTick coins a tick and remembers where it stopped (per venue, per lane), so every
  // candidate gets its turn across ticks instead of the same first four forever. Right calls go first; when the market lane has
  // coins too, one look a tick is always kept for it.
  const curKey = `live_scan_cursor:${venue}`, cur = (await get(d, curKey)) || {}, seen = {}, per = LIVE.candidatesPerTick;
  const rot = (arr, lastMint) => { const i = arr.findIndex((c) => c.mint === lastMint); return i < 0 ? arr : [...arr.slice(i + 1), ...arr.slice(0, i + 1)]; };
  const saveCur = () => (Object.keys(seen).length ? set(d, curKey, { ...cur, ...seen }) : null);
  let last = null, looked = 0;
  for (const [k, arr, cap] of [["rc", rot(rc, cur.rc), mk.length ? per - 1 : per], ["mk", rot(mk, cur.mk), per]]) { let n = 0;
   for (const c of arr) {
    if (looked >= per || n >= cap) break;
    seen[k] = c.mint;
    if (await skip(c.mint, null)) continue;
    looked++; n++;
    if (c.fresh && !(c.liqUsd > 0)) { if (!last) last = await refuse(d, venue, "pool", "No liquidity figure for this fresh right call", c); continue; } // an established coin's refusal, written first, says more
    const cs = await candlesFor(env, d, c.mint);
    if (!cs.ok) { last = await refuse(d, venue, "no_candles", "No one-minute candles for this coin", c); continue; }
    const s = entrySetup(cs.data, nowSec);
    if (!s.signal) { last = await refuse(d, venue, s.stale ? "stale_data" : "no_setup", s.why, c); continue; }
    if (await skip(c.mint, s)) { last = await refuse(d, venue, "same_leg", `This leg was already traded once, or its buy failed ${LIVE.legBuyTries} times before anything was sent`, c); continue; }
    if (await vetoed(d, c.mint)) { last = await refuse(d, venue, "veto", "Grok vetoed this coin in the last hour", c); continue; }
    const hs = await safetyOf(env, c);
    if (!hs.ok) { last = await refuse(d, venue, "safety", hs.reason, c); continue; }
    const mc = await mintCheck(env, c.mint);
    if (!mc.ok) { last = await refuse(d, venue, "token_program", mc.reason, c); continue; }
    await saveCur();
    return { c, s, src: cs.src || "jupiter", unit: cs.unit || "USD", lane: c.lane, dec: mc.decimals };
   }
  }
  await saveCur();
  return { refusal: last || await refuse(d, venue, "no_setup", lanes.rightCall ? "No right-call coin and no established coin is in a Fibonacci pullback right now" : "No established coin is in a Fibonacci pullback right now (market lane; the right-call lane is OFF)") };
}
// The symbiote's right calls that passed the deep checks (status 'candidate') and are FRESH: checked (or flagged) inside the
// TTL. No symbiote data exists yet to measure how long a call stays good, so the TTL is 30 minutes until 'right_call_ttl_min'
// is set from that data. A missing table or a failed read = none.
export async function rightCallTtlMin(d) { const v = Number(await get(d, "right_call_ttl_min")); return v > 0 ? v : LIVE.rightCallTtlMin; }
export async function rightCalls(d) {
  try { const ttl = await rightCallTtlMin(d); return new Set((await d.q(`SELECT mint FROM mob_aq_sym_right WHERE status = 'candidate' AND coalesce(checked_at, flagged_at) > now() - $1::float8 * interval '1 minute'`, [ttl])).map((r) => r.mint)); }
  catch { return new Set(); }
}
// The mint itself, read from the chain (getAccountInfo jsonParsed; extension names read live 2026-11-18 and from agave's
// parse_token_extension.rs): a token program we know, no freeze authority, and no Token-2022 extension that can tax, block,
// freeze or take a holder's tokens. Pump's Token-2022 coins carry metadata and an EMPTY transfer-hook slot: those pass (the sell
// simulation would run a hook if one were ever set).
const BAD_EXT = { transferFeeConfig: "a transfer fee", transferHook: "a transfer hook program", permanentDelegate: "a permanent delegate", nonTransferable: "a non-transferable flag", defaultAccountState: "new accounts frozen by default", pausableConfig: "a pause switch" };
export async function mintCheck(env, mint) {
  let v; try { v = (await solRpc(env, "getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }])).value; } catch (e) { return { ok: false, reason: `the coin's mint could not be read (${cut(e.message, 80)})` }; }
  const info = v?.data?.parsed?.info;
  if (!info || v.data.parsed.type !== "mint") return { ok: false, reason: "the address is not a token mint" };
  if (v.owner !== PROG.token && v.owner !== PROG.token22) return { ok: false, reason: `the mint belongs to an unknown program (${v.owner})` };
  if (info.freezeAuthority) return { ok: false, reason: "freeze authority is set: the issuer can freeze any holder's tokens" };
  for (const e of info.extensions || []) {
    const st = e.state || {};
    if (e.extension === "transferHook" && !st.programId) continue;
    if (e.extension === "permanentDelegate" && !st.delegate) continue;
    if (e.extension === "defaultAccountState" && st.accountState !== "frozen") continue;
    if (e.extension === "pausableConfig" && !st.authority && !st.paused) continue;
    if (BAD_EXT[e.extension]) return { ok: false, reason: `Token-2022 ${BAD_EXT[e.extension]} (${e.extension}): refused` };
  }
  return { ok: true, program: v.owner, decimals: Number.isInteger(info.decimals) ? info.decimals : null };
}
// The honeypot test before any buy: a REAL holder's sale of this coin, built by Jupiter for that holder and run in the chain's
// simulator (sigVerify off: nothing is signed or sent). A coin whose holders cannot sell, or whose transfer hook blocks a sale,
// fails here. The holder is the first plain wallet (an account owned by the System program) among the 20 largest token accounts.
export async function sellProof(env, c, tokensRaw, self = null) {
  const no = (reason) => ({ ok: false, reason });
  let big, info, kind;
  try {
    big = ((await solRpc(env, "getTokenLargestAccounts", [c.mint, { commitment: "confirmed" }])).value || []).filter((a) => a?.address && /^\d+$/.test(String(a.amount)) && a.amount !== "0").slice(0, 20);
    if (!big.length) return no("no holder of this coin was found: its sale cannot be proven");
    info = (await solRpc(env, "getMultipleAccounts", [big.map((a) => a.address), { encoding: "jsonParsed", commitment: "confirmed" }])).value || [];
    const owners = info.map((x) => x?.data?.parsed?.info?.owner || null);
    const uniq = [...new Set(owners.filter((o) => o && o !== self))];
    kind = uniq.length ? (await solRpc(env, "getMultipleAccounts", [uniq, { encoding: "base64", dataSlice: { offset: 0, length: 0 }, commitment: "confirmed" }])).value || [] : [];
    const holder = uniq.find((o, i) => kind[i]?.owner === PROG.system);
    if (!holder) return no("no plain wallet among the coin's 20 largest holders: its sale cannot be proven");
    const held = BigInt(big[owners.indexOf(holder)].amount), want = BigInt(tokensRaw || "0"), amount = want > 0n && want < held ? want : held;
    const q = await quote(env, c.mint, SOL_MINT, amount.toString(), LIVE.exitSlippageBps);
    if (!q.ok) return no(`no sell route for this coin: ${q.error}`);
    const sw = await buildSwap(env, q.q, holder);
    if (!sw.ok) return no(`a holder's sale does not build: ${sw.error}`);
    const v = (await solRpc(env, "simulateTransaction", [sw.tx, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" }])).value;
    if (v?.err) return no(`a real holder's sale fails in the chain's simulator (${cut(JSON.stringify(v.err), 100)}): honeypot or transfer block`);
    return { ok: true, holder };
  } catch (e) { return no(`the sale could not be proven (${cut(e.message, 100)})`); }
}
// The hard safety check: RugCheck's report, or Jupiter's own audit when RugCheck does not answer. Unknown = not safe.
export async function safetyOf(env, c) {
  const rg = await feeds.rug(env, c.mint);
  return rg.ok ? hardSafety(rg.data) : c.audit && c.audit.mintOff && c.audit.freezeOff ? { ok: true } : { ok: false, reason: "safety unknown: no RugCheck report and no clean Jupiter audit" };
}
// A leg is traded once: after a stop, the same leg showing the same pocket again is not bought again.
// C) A buy that FAILED BEFORE ANYTHING WAS SENT (no route, a failed simulation, a fee over the gate: its order never got a signature)
// spent nothing and proved nothing about the leg: it does not burn it. The next tick may try the same leg again with a fresh quote,
// LIVE.legBuyTries (3) times at most. A position that was opened, or a buy that was signed and sent (whatever the chain said), does.
const legTaken = async (d, venue, mint, s) => !!(await d.one(`SELECT 1 t WHERE EXISTS (SELECT 1 FROM mob_aq_live_positions WHERE venue = $1 AND mint = $2 AND status IN ${ACTIVE})
  OR ($3::bigint IS NOT NULL AND (
    EXISTS (SELECT 1 FROM mob_aq_live_positions p WHERE p.venue = $1 AND p.mint = $2 AND (p.plan->'leg'->>'highT')::bigint = $3::bigint AND (p.status <> 'failed' OR EXISTS (SELECT 1 FROM mob_aq_live_orders o WHERE o.position_id = p.id AND o.signature IS NOT NULL)))
    OR (SELECT count(*) FROM mob_aq_live_positions p WHERE p.venue = $1 AND p.mint = $2 AND (p.plan->'leg'->>'highT')::bigint = $3::bigint AND p.status = 'failed') >= $4::int))`, [venue, mint, s ? s.leg.highT : null, LIVE.legBuyTries]));
// Cost first, at the real size: price impact under 1%, the measured round trip (buy this size, sell what it buys) under 1%,
// and the way to target 1 at least 3x it. Used by the live buy AND by the Phantom signal.
// The fixed SOL costs count too, as a % of the size: the network fee of both sides and, for a coin with no token account yet,
// the closeAccount that returns the rent after the sale. The rent itself is fronted capital that comes back, not a cost: it is
// required in the balance (tryBuy) and reported (rentFrontedLamports).
export async function costGate(env, venue, c, s, sizeSol, { feeSide = LIVE.feePerSideFallbackLamports, owner = null } = {}) {
  const d = db(env), lamports = Math.round(sizeSol * 1e9), no = async (gate, why) => ({ ok: false, refusal: await refuse(d, venue, gate, why, c) });
  let ataNew = true; if (owner) { try { ataNew = !(await tokenAccounts(env, owner, c.mint)).length; } catch {} }
  // a symbiote right call (a bonding-curve coin: pump fee about 1.25% a side) is held to 3.5% round trip (measured, see LIVE) and
  // 1.5% impact; the reward to target 1 must still be 3x the true total cost (so about 9%+). Established coins, on either lane,
  // keep 1% and 1% (Inspector 2026-11-18).
  const maxRt = c.fresh ? LIVE.freshMaxRtPct : FIB.maxRtPct, maxImp = c.fresh ? LIVE.freshMaxImpactPct : LIVE.maxImpactPct;
  const fixed = 2 * feeSide + (ataNew ? LIVE.baseFeeLamports : 0), fixedPct = (fixed / lamports) * 100;
  if (fixedPct >= maxRt) return no("cost", `The fixed SOL fees alone (${fixed} lamports) are ${round(fixedPct, 3)}% of ${sizeSol} SOL, over ${maxRt}%`);
  const q = await quote(env, SOL_MINT, c.mint, lamports, LIVE.slippageBps);
  if (!q.ok) return no("no_quote", q.error);
  if (q.impactPct > maxImp) return no("price_impact", `Price impact ${round(q.impactPct, 2)}% is over the ${maxImp}% cap`);
  const back = await quote(env, c.mint, SOL_MINT, q.q.outAmount, LIVE.exitSlippageBps);
  if (!back.ok) return no("no_quote", `no sell quote: ${back.error}`);
  const quoteRtPct = round((1 - Number(back.q.outAmount) / lamports) * 100, 3), rtPct = round(quoteRtPct + fixedPct, 3), rewardPct = round(((s.t1 - s.entry) / s.entry) * 100, 3);
  const parts = `${quoteRtPct}% in the quotes + ${round(fixedPct, 3)}% fixed SOL fees at ${sizeSol} SOL`;
  if (rtPct >= maxRt) return no("cost", `The round trip costs ${rtPct}% (${parts}), over ${maxRt}%`);
  if (rewardPct < FIB.minRewardRt * rtPct) return no("cost", `Target 1 is ${rewardPct}% away, under ${FIB.minRewardRt}x the ${rtPct}% round trip (${parts})`);
  const proof = await sellProof(env, c, q.q.outAmount, owner);
  if (!proof.ok) return no("honeypot", proof.reason);
  // room left for the buy's own network fee once Jupiter prices it (execute checks it before signing)
  const room = (Math.min(maxRt - quoteRtPct, rewardPct / FIB.minRewardRt - quoteRtPct) / 100) * lamports - feeSide - (ataNew ? LIVE.baseFeeLamports : 0);
  let rent = 0; if (ataNew) { try { rent = await solRpc(env, "getMinimumBalanceForRentExemption", [165]); } catch {} if (!(rent > 0)) rent = LIVE.tokenAccountRentFallbackLamports; }
  return { ok: true, q, rtPct, quoteRtPct, fixedLamports: fixed, fixedPct: round(fixedPct, 3), rewardPct, maxBuyFeeLamports: Math.floor(room), rentFrontedLamports: rent };
}
async function tryBuy(env, g, owner = null) {
  const d = db(env), minute = Math.floor(Date.now() / 60000);
  const found = await scanFib(env, VENUE, (mint, s) => legTaken(d, VENUE, mint, s));
  if (!found.c) return found.refusal;
  // size: the limit, cut to what the day's loss budget can still lose in this trade's real worst case (worstFrac: stop distance
  // + the 5% disaster margin + exit slippage + the round trip, and never under 50% for a fresh curve coin). The round trip used
  // here is the lane's own ceiling (3.5% fresh, 1% established), which the cost gate below enforces at this exact size, so the
  // true cost is never above what the size assumed; the plan then records the worst case at the TRUE measured cost.
  const { c, s } = found, fresh = !!c.fresh, stopFrac = (s.entry - s.stop) / s.entry, perSol = worstFrac(stopFrac, fresh ? LIVE.freshMaxRtPct : FIB.maxRtPct, fresh);
  // (the budget also has to carry this trade's own two network fees, which riskToday counts)
  const size = round(Math.min(g.lim.maxPerTradeSol, g.budgetLeft != null ? Math.max(0, g.budgetLeft - (2 * (g.feeSide ?? LIVE.feePerSideFallbackLamports)) / 1e9) / perSol : Infinity), 6), lamports = Math.round(size * 1e9);
  const cappedBy = size < g.lim.maxPerTradeSol ? `daily loss budget: ${round(g.budgetLeft, 6)} SOL left` : null;
  if (!(size > 0)) return refuse(d, VENUE, "daily_loss_risk", `The daily loss budget left (${round(g.budgetLeft, 6)} SOL) does not cover even this trade's network fees`, c);
  let bal; try { bal = (await solRpc(env, "getBalance", [g.w.address])).value; } catch (e) { return refuse(d, VENUE, "no_balance", cut(e.message)); }
  if (!(bal >= lamports + LIVE.feeBudgetLamports + LIVE.reserveSol * 1e9)) return refuse(d, VENUE, "reserve", `The wallet holds ${round(bal / 1e9, 6)} SOL: not enough for a ${size} SOL trade and the ${LIVE.reserveSol} SOL kept for fees`);
  const cg = await costGate(env, VENUE, c, s, size, { feeSide: g.feeSide, owner: g.w.address }); if (!cg.ok) return cg.refusal;
  const { q, rtPct, rewardPct } = cg;
  if (!(bal >= lamports + LIVE.feeBudgetLamports + LIVE.reserveSol * 1e9 + cg.rentFrontedLamports)) return refuse(d, VENUE, "reserve", `The wallet holds ${round(bal / 1e9, 6)} SOL: not enough for a ${size} SOL trade, the ${round(cg.rentFrontedLamports / 1e9, 6)} SOL token-account rent (returned after the sale) and the ${LIVE.reserveSol} SOL kept for fees`);
  // THE LIVE PRICE, before anything is signed: what this very quote pays per token, in the plan's unit, against the plan's levels
  const unit = found.unit || (found.src === "symbiote" ? "SOL" : "USD"), solUsd = unit === "USD" ? await solUsdLive(env) : null;
  const livePx = pxOf(lamports, q.q.outAmount, found.dec, unit, solUsd), tolPct = fresh ? LIVE.freshEntryTolPct : LIVE.entryTolPct, off = entryCheck(s, livePx, tolPct);
  if (off) return refuse(d, VENUE, "entry_price", off, c);
  // E) the cost rule again, on the REAL price: target 1 must be 3x the round trip away from what this quote pays, not from the candle
  const rewardLivePct = round(((s.t1 - livePx) / livePx) * 100, 3);
  if (rewardLivePct < FIB.minRewardRt * rtPct) return refuse(d, VENUE, "cost", `Target 1 is ${rewardLivePct}% from the live price this quote pays (${r8(livePx)}), under ${FIB.minRewardRt}x the ${rtPct}% round trip`, c);
  const route = labelsOf(q.q), onCurve = route.some((l) => CURVE_LABELS.has(l));
  const plan = planOf(s, Math.floor(Date.now() / 1000), { source: found.lane || "right_call", fresh, src: found.src, unit, dec: found.dec, solUsd, livePx: r8(livePx), route, onCurve, liqBasis: c.liqBasis || "jupiter", liq: c.liqUsd, rtPct, quoteRtPct: cg.quoteRtPct, fixedLamports: cg.fixedLamports, rewardPct, rewardLivePct, sizeSol: size, sizeCappedBy: cappedBy, worstPct: round(worstFrac(stopFrac, rtPct, fresh) * 100, 3), ataNew: cg.rentFrontedLamports > 0,
    validations: { ...s.validations, notVetoed: true, safety: true, tokenProgram: true, sellProven: true, cost: true, impact: true, livePrice: true } });
  // the claim: one statement takes the coin's only active slot, under the open-position limit. A second caller gets nothing.
  const p = await d.one(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, stop_pct, pool_liq_usd, plan)
    SELECT $1,$2,$3,'opening',$4,$5,$6 WHERE (SELECT count(*) FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE}) < $7::int
      AND ($8::text IS NULL OR EXISTS (SELECT 1 FROM mob_aq_state WHERE k = 'live_tick_lock' AND v = $8::jsonb)) ON CONFLICT DO NOTHING RETURNING id`,
    [VENUE, c.mint, c.symbol, round(((s.entry - s.stop) / s.entry) * 100, 3), c.liqUsd, JSON.stringify(plan), g.lim.maxOpenPositions, owner ? JSON.stringify({ owner }) : null]);
  if (!p) return refuse(d, VENUE, "claim_lost", "This coin or the last free slot was taken by another run", c);
  const r = await execute(env, g.w, { side: "buy", c, positionId: p.id, inMint: SOL_MINT, outMint: c.mint, amountRaw: lamports, slippageBps: LIVE.slippageBps, reason: `[${plan.source === "market" ? "market" : "right call"}] ${s.why}`, claim: `${VENUE}|${c.mint}|buy|${minute}`, q0: q, patch: { stop: s.stop, t1: s.t1, t2: s.t2 }, maxBuyFeeLamports: cg.maxBuyFeeLamports });
  if (r.skipped) await d.q(`UPDATE mob_aq_live_positions SET status = 'failed', closed_at = now(), exit_reason = $2 WHERE id = $1 AND status = 'opening'`, [p.id, r.noOrder ? cut(r.skipped) : "duplicate order"]);
  return { buy: c.symbol, source: plan.source, ...r };
}
// Exits run whenever a live position is open, with auto trade on or off and with the kill switch on: a position is never left alone.
// `size(tokensRaw)` turns the tokens held AT THE CLAIM into the amount to sell (default: all of them), never a stale read.
// An urgent exit (stop, invalidation, veto, liquidity, Alex's SELL ALL) that the CHAIN refused before (plan.slipFails: a rejected
// or failed-simulation swap, isChainFail) is sent with twice the slippage per such refusal, never over 20%: a rug must not hold
// the bag because the price ran past 1.5%. A sell that failed because Jupiter or the RPC did not answer does NOT widen it: in a
// data outage the price has not moved, only the data has. The order row keeps the bps used.
export const exitBps = (fails, urgent = true) => (urgent ? Math.min(LIVE.exitSlippageMaxBps, LIVE.exitSlippageBps * 2 ** Math.max(0, Number(fails) || 0)) : LIVE.exitSlippageBps);
async function sellPosition(env, w, p, reason, claimKey, { size = (t) => t, patch = null, slippageBps = LIVE.exitSlippageBps } = {}) {
  const d = db(env);
  const took = await d.one(`UPDATE mob_aq_live_positions SET status = 'closing' WHERE id = $1 AND status IN ('open','stuck') RETURNING id, status, tokens_raw`, [p.id]);
  if (!took) return { skipped: "already being sold" };
  let amountRaw = String(size(took.tokens_raw)); if (!/^\d+$/.test(amountRaw) || amountRaw === "0") amountRaw = took.tokens_raw;
  const r = await execute(env, w, { side: "sell", c: { mint: p.mint, symbol: p.symbol }, positionId: p.id, inMint: p.mint, outMint: SOL_MINT, amountRaw, slippageBps, reason: slippageBps > LIVE.exitSlippageBps ? `${reason} [sell slippage ${slippageBps} bps after ${p.plan?.slipFails ?? 0} sell(s) the chain refused]` : reason, claim: `${VENUE}|${p.mint}|sell|${claimKey}`, patch });
  if (r.skipped) await d.q(`UPDATE mob_aq_live_positions SET status = CASE WHEN plan->>'writtenOff' = 'true' THEN 'closed' WHEN sell_fails >= $2 THEN 'stuck' ELSE 'open' END WHERE id = $1 AND status = 'closing'`, [p.id, LIVE.maxSellFails]);
  return { sell: p.symbol, reason, ...r };
}
// The chart decides every exit (chart.mjs manage) on 5-minute closes. Beside it, three rules read the LIVE price so a position is
// never blind and never dumped on one bad read:
//  - the exit quote for the position's own tokens (asked twice before it counts as missing) is its true value and its live price;
//  - DISASTER STOP: that live price disasterPct (5%) or more under the stop on disasterTicks (2) ticks in a row sells now, so a
//    dump inside one 5-minute bar is out in about 2 minutes instead of waiting for the close;
//  - HARD STOP, only when no candle source is fresh: the live price (the price API, else the exit quote) at or under the stop
//    sells; no price from either source for noPriceTicks (3) ticks in a row sells. One or two misses hold.
//  - MIGRATION: a plan made on the bonding curve is re-based the first tick its quote no longer routes through the curve: the
//    pool's own liquidity becomes the new base, so the -30% liquidity exit never compares a curve figure with a pool figure.
// D) THE WRITE-OFF: one statement, guarded by the status, so it happens once. The whole remaining cost is booked as lost on the
// day it is written off (it was already counted as a marked loss every tick since the route vanished), and the slot is free.
async function writeOff(d, p, since) {
  const why = `written off: no sell route for ${LIVE.deadAfterHours} hours, value 0`;
  const r = await d.one(`UPDATE mob_aq_live_positions SET status = 'closed', closed_at = now(), last_value_sol = 0, last_value_at = now(), pnl_sol = coalesce(proceeds_sol, 0) - cost_sol - coalesce((plan->>'rentSol')::float8, 0), exit_reason = $2,
      plan = coalesce(plan, '{}'::jsonb) || jsonb_build_object('outcome', $2::text, 'writtenOff', true, 'closedAt', now(), 'rentLost', coalesce((plan->>'rentSol')::float8, 0) > 0)
    WHERE id = $1 AND status IN ('open','stuck') AND cost_sol IS NOT NULL RETURNING pnl_sol`, [p.id, why]);
  if (!r) return null;
  await d.q(`INSERT INTO mob_aq_brain (dept, kind, text) VALUES ('execution','pain',$1)`, [`PAIN: LIVE ${p.symbol} (${p.mint}) written off. Jupiter had no route to sell it for ${round((Date.now() / 1000 - since) / 3600, 1)} hours; ${round(-r.pnl_sol, 6)} SOL lost. The honeypot test and the liquidity exit should have caught a coin that can stop being sellable.`]);
  await dailyLossCheck(d);
  return { writtenOff: p.symbol, pnlSol: round(r.pnl_sol, 6), reason: why };
}
// A written-off coin is not forgotten: for LIVE.recoverDays its sale is quoted every 5 minutes (3 coins a pass). If a route is
// back, what is left is sold through the normal order path. The position stays closed on the day it was written off; the SOL that
// comes back is added to that trade's result, and once the account is empty its rent is reclaimed (reclaimRent).
async function recoverWrittenOff(env, w, minute) {
  const d = db(env), out = [];
  for (const p of await d.q(`SELECT * FROM mob_aq_live_positions p WHERE venue = $1 AND status = 'closed' AND plan->>'writtenOff' = 'true' AND NOT (plan ? 'recovered') AND tokens_raw ~ '^[0-9]+$' AND tokens_raw <> '0'
      AND closed_at > now() - $2::int * interval '1 day' AND NOT EXISTS (SELECT 1 FROM mob_aq_live_positions a WHERE a.venue = p.venue AND a.mint = p.mint AND a.status IN ${ACTIVE}) ORDER BY id LIMIT 3`, [VENUE, LIVE.recoverDays])) {
    const q = await quote(env, p.mint, SOL_MINT, p.tokens_raw, LIVE.exitSlippageBps); if (!q.ok) continue;
    const took = await d.one(`UPDATE mob_aq_live_positions SET status = 'closing' WHERE id = $1 AND status = 'closed' AND plan->>'writtenOff' = 'true' RETURNING id`, [p.id]); if (!took) continue;
    const r = await execute(env, w, { side: "sell", c: { mint: p.mint, symbol: p.symbol }, positionId: p.id, inMint: p.mint, outMint: SOL_MINT, amountRaw: p.tokens_raw, slippageBps: exitBps(p.plan?.slipFails ?? 0), reason: "recovery: a sell route returned for a written-off coin", claim: `${VENUE}|${p.mint}|sell|recover-${minute}`, q0: q });
    if (r.skipped) await d.q(`UPDATE mob_aq_live_positions SET status = 'closed' WHERE id = $1 AND status = 'closing'`, [p.id]);
    out.push({ recover: p.symbol, ...r });
  }
  return out;
}
// THE WALLET AGAINST THE BOOK: any coin the wallet holds that no active position and no order on its way accounts for is written
// down (state key live_orphans, shown in liveState().orphans) and reported once. Nothing here ever sells: a coin without a
// position record has no stop, no cost and no reason on record, so it is Alex's call.
export async function reconcileWallet(env, w) {
  const d = db(env); let accts; try { accts = await tokenAccounts(env, w.address); } catch { return null; }
  const held = accts.filter((a) => a.mint !== SOL_MINT && /^\d+$/.test(a.raw) && a.raw !== "0");
  const rows = await d.q(`SELECT mint, status, plan->>'writtenOff' wo, closed_at FROM mob_aq_live_positions WHERE venue = $1 ORDER BY id`, [VENUE]), busy = new Set((await d.q(`SELECT mint FROM mob_aq_live_orders WHERE venue = $1 AND status IN ('requested','sent')`, [VENUE])).map((r) => r.mint));
  const active = new Set(rows.filter((r) => ["opening", "open", "closing", "stuck"].includes(r.status)).map((r) => r.mint));
  const list = held.filter((a) => !active.has(a.mint) && !busy.has(a.mint)).map((a) => { const last = rows.filter((r) => r.mint === a.mint).pop();
    return { mint: a.mint, account: a.address, raw: a.raw, note: !last ? "no position was ever recorded for this coin" : last.wo === "true" ? "left from a written-off position (still quoted for a route)" : `left after a ${last.status} position` }; });
  const prev = await get(d, "live_orphans"), key = (l) => JSON.stringify((l || []).map((x) => [x.mint, x.raw]).sort());
  await set(d, "live_orphans", { at: new Date().toISOString(), list });
  if (list.length && key(prev?.list) !== key(list)) await brain(d, `LIVE WALLET CHECK: ${list.length} coin(s) in the Aquarius wallet with no open position: ${list.map((x) => `${x.mint} (${x.raw} raw; ${x.note})`).join("; ")}. Nothing is sold without a position record.`);
  return list;
}
async function exits(env, w, minute = Math.floor(Date.now() / 60000), renew = null) {
  const d = db(env), out = [], nowSec = Date.now() / 1000;
  let usd; const solUsd = async () => (usd !== undefined ? usd : (usd = await solUsdLive(env))); // once a tick, only when needed
  // a 'stuck' position (5 failed sells in a row) is still managed and retried every minute: a coin is never left alone
  for (const p of await d.q(`SELECT * FROM mob_aq_live_positions WHERE venue = $1 AND status IN ('open','stuck') ORDER BY id`, [VENUE])) {
    if (renew && !(await renew())) { out.push({ stopped: "the money lease was lost: no further orders this run" }); break; }
    let q = await quote(env, p.mint, SOL_MINT, p.tokens_raw, LIVE.exitSlippageBps);
    if (!q.ok) q = await quote(env, p.mint, SOL_MINT, p.tokens_raw, LIVE.exitSlippageBps); // one missed call is not "no price"
    if (q.ok) await d.q(`UPDATE mob_aq_live_positions SET last_value_sol = $2, last_value_at = now(), plan = CASE WHEN plan ? 'noRouteSince' THEN plan - 'noRouteSince' ELSE plan END WHERE id = $1`, [p.id, Number(q.q.outAmount) / 1e9]);
    else if (q.noRoute) {
      // D) Jupiter ANSWERED and there is no route to sell this coin: it is worth nothing right now, and it is marked at 0 (an
      // outage, where Jupiter does not answer, leaves the last mark alone). 24 hours of that in a row: written off, once.
      const since = Number(p.plan?.noRouteSince) > 0 ? Number(p.plan.noRouteSince) : Math.floor(nowSec);
      await d.q(`UPDATE mob_aq_live_positions SET last_value_sol = 0, last_value_at = now(), plan = coalesce(plan, '{}'::jsonb) || jsonb_build_object('noRouteSince', $2::bigint) WHERE id = $1 AND status IN ('open','stuck')`, [p.id, since]);
      if (nowSec - since >= LIVE.deadAfterHours * 3600) { const w0 = await writeOff(d, p, since); if (w0) out.push(w0); continue; }
    }
    if (!p.plan?.kind) continue; // a position without a chart plan (none is opened that way) waits for SELL ALL LIVE
    const plan = { ...p.plan }, unit = plan.unit || "USD", extra = {};
    const exitPx = q.ok && Number.isInteger(plan.dec) ? pxOf(q.q.outAmount, p.tokens_raw, plan.dec, unit, unit === "USD" ? await solUsd() : null) : null;
    // 6) migration: bought on the curve, and the quote no longer routes through it -> the pool's liquidity is the new base
    const route = q.ok ? labelsOf(q.q) : [];
    if (plan.onCurve && route.length && !route.some((l) => CURVE_LABELS.has(l))) Object.assign(extra, { onCurve: false, liqBasis: "jupiter", liq: (await liqOf(env, p.mint)) ?? null, liqAtEntry: plan.liq ?? null, migratedAt: Math.floor(nowSec), route });
    Object.assign(plan, extra);
    // the -30% liquidity exit compares like with like: Jupiter's pool figure against a base that is also a pool figure. A coin
    // still on the curve has no pool: its liquidity is the curve's reserves, which move with every trade (the stop covers it).
    const liqNow = !plan.onCurve && (plan.liqBasis || "jupiter") === "jupiter" ? await liqOf(env, p.mint) : null;
    if (plan.migratedAt && !(plan.liq > 0) && liqNow > 0) { extra.liq = liqNow; plan.liq = liqNow; } // migrated before the pool had a figure: the first one is the base
    const cs = await positionCandles(env, d, p, nowSec);
    let m = manage(plan, cs.ok ? cs.data : [], nowSec, { liqNow, vetoed: await vetoed(d, p.mint) });
    if (m.action === "hold") {
      const stopNow = plan.phase === 2 && plan.trailStop ? Math.max(plan.stop, plan.trailStop) : plan.stop;
      // 4) DISASTER STOP: an unreadable tick neither counts nor clears the count
      if (exitPx != null) {
        if (exitPx <= stopNow * (1 - LIVE.disasterPct / 100)) { const n = (plan.dz || 0) + 1;
          if (n >= LIVE.disasterTicks) m = { action: "sell_all", reason: `disaster stop: the live exit quote (${r8(exitPx)}) is ${LIVE.disasterPct}% or more under the stop (${r8(stopNow)}) on ${n} ticks in a row` }; else extra.dz = n; }
        else if (plan.dz) extra.dz = 0;
      }
      // 1) + 2) HARD STOP: no fresh candle from any source
      if (m.action === "hold" && !cs.ok) {
        // the price API first (the last swap: the same kind of price as a candle close); else the exit quote, lifted by the sell
        // side's own cost (half the round trip measured at the buy), so a curve coin's 1.25% fee is not read as a fall
        const spot = (await apiSpot(env, p.mint, unit, solUsd)) ?? (exitPx != null ? exitPx / (1 - (plan.quoteRtPct > 0 ? plan.quoteRtPct : 0) / 200) : null);
        if (spot == null) { const n = (plan.noPx || 0) + 1;
          if (n >= LIVE.noPriceTicks) m = { ...hardStop(plan, null), reason: `hard stop: no fresh candles and no price from any source for ${n} ticks in a row, the stop cannot be watched` }; else extra.noPx = n; }
        else { if (plan.noPx) extra.noPx = 0; m = hardStop(plan, spot) || m; }
      } else if (cs.ok && plan.noPx) extra.noPx = 0;
    }
    // the panel's sparkline: the last closed 1-minute price, once a minute, the last 90 kept (display only; manage() never reads it)
    const lastPx = cs.ok ? cs.data.filter((c) => c.t + 60 <= nowSec).slice(-1)[0]?.c : null;
    if (Number.isFinite(lastPx)) await d.q(`UPDATE mob_aq_live_positions SET alert_patch = jsonb_build_object('spark', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (SELECT x FROM jsonb_array_elements(coalesce(alert_patch->'spark', '[]'::jsonb)) x OFFSET greatest(0, jsonb_array_length(coalesce(alert_patch->'spark', '[]'::jsonb)) - 89)) z) || jsonb_build_array($2::float8)) WHERE id = $1`, [p.id, lastPx]);
    const patch = { ...extra, ...(m.patch || {}) };
    if (m.action === "hold") { if (Object.keys(patch).length) await d.q(`UPDATE mob_aq_live_positions SET plan = plan || $2::jsonb WHERE id = $1 AND status IN ('open','stuck')`, [p.id, JSON.stringify(patch)]); continue; }
    out.push(await sellPosition(env, w, p, m.reason, `${p.plan.phase ?? 0}-${minute}`, { size: m.action === "sell_half" ? (t) => (BigInt(t) / 2n).toString() : (t) => t, patch: m.action === "sell_half" ? patch : null, slippageBps: exitBps(p.plan?.slipFails ?? 0, !/^target/.test(m.reason)) }));
  }
  return out;
}
// ---------------------------------------------------------------- the paper mirror: the same chart trader on every candidate
// Not only the live slots: every established coin the scan can read, on paper, entry at the bounce close, exits by manage(),
// cost = the measured round trip of its liquidity tier. So the brain gets a large sample of this exact logic quickly.
const tierCost = (liq) => AUDIT_RT[liq >= 500000 ? "A" : liq >= 100000 ? "B" : "C"];
export async function paperTick(env, t0 = Date.now()) {
  const d = db(env), list = await candidates(env), nowSec = Date.now() / 1000, out = { opened: 0, closed: 0, halves: 0 }, late = () => Date.now() - t0 > LIVE.tickBudgetMs + 20000;
  if (!list) return out;
  for (const t of await d.q(`SELECT * FROM mob_aq_chart_paper WHERE closed_at IS NULL ORDER BY id LIMIT $1`, [LIVE.paperOpenMax])) {
    if (late()) return out;
    const cs = await feeds.jupCandles(env, t.mint); if (!cs.ok) continue;
    const m = manage(t.plan, cs.data, nowSec, { liqNow: await liqOf(env, t.mint), vetoed: await vetoed(d, t.mint) });
    const px = cs.data.filter((c) => c.t + 60 <= nowSec).slice(-1)[0]?.c;
    if (m.action === "hold") { if (m.patch) await d.q(`UPDATE mob_aq_chart_paper SET plan = plan || $2::jsonb WHERE id = $1`, [t.id, JSON.stringify(m.patch)]); continue; }
    const legPct = ((px - t.entry_px) / t.entry_px) * 100;
    if (m.action === "sell_half") { await d.q(`UPDATE mob_aq_chart_paper SET plan = plan || $2::jsonb, half_pct = $3 WHERE id = $1 AND half_pct IS NULL`, [t.id, JSON.stringify(m.patch), round(legPct, 4)]); out.halves++; continue; }
    const gross = t.half_pct != null ? (t.half_pct + legPct) / 2 : legPct;
    await d.q(`UPDATE mob_aq_chart_paper SET closed_at = now(), exit_px = $2, gross_pct = $3, net_pct = $3 - cost_pct, outcome = $4 WHERE id = $1 AND closed_at IS NULL`, [t.id, px, round(gross, 4), m.reason]); out.closed++;
  }
  const open = new Set((await d.q(`SELECT mint FROM mob_aq_chart_paper WHERE closed_at IS NULL`)).map((r) => r.mint));
  for (const c of list.slice(0, LIVE.paperCoinsPerTick)) {
    if (late()) return out;
    if (open.has(c.mint)) continue;
    const cs = await feeds.jupCandles(env, c.mint); if (!cs.ok) continue;
    const s = entrySetup(cs.data, nowSec); if (!s.signal) continue;
    const plan = planOf(s, Math.floor(nowSec), { liq: c.liqUsd });
    const r = await d.one(`INSERT INTO mob_aq_chart_paper (mint, symbol, leg_high_t, entry_px, cost_pct, liq_usd, plan) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (mint, leg_high_t) DO NOTHING RETURNING id`,
      [c.mint, c.symbol, s.leg.highT, s.entry, tierCost(c.liqUsd), c.liqUsd, JSON.stringify(plan)]);
    if (r) out.opened++;
  }
  return out;
}
export async function paperStats(d) {
  const r = await d.one(`SELECT count(*) FILTER (WHERE closed_at IS NOT NULL)::int n, count(*) FILTER (WHERE closed_at IS NULL)::int open, count(*) FILTER (WHERE net_pct > 0)::int wins, avg(net_pct)::float8 avg_net, avg(gross_pct)::float8 avg_gross FROM mob_aq_chart_paper`);
  const by = await d.q(`SELECT split_part(outcome, ':', 1) k, count(*)::int n, avg(net_pct)::float8 avg FROM mob_aq_chart_paper WHERE closed_at IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`);
  return { closed: r.n, open: r.open, wins: r.wins, avgNetPct: r.avg_net == null ? null : round(r.avg_net, 3), avgGrossPct: r.avg_gross == null ? null : round(r.avg_gross, 3), byOutcome: by.map((x) => ({ outcome: x.k, n: x.n, avgNetPct: round(x.avg, 3) })) };
}

// ---------------------------------------------------------------- the tick, SELL ALL LIVE, and what the panel sees
// One money run at a time (the tick, SELL ALL LIVE, a manual order): a 100-second lease in mob_aq_state.
async function takeLock(d) { const owner = crypto.randomUUID();
  const ok = await d.one(`INSERT INTO mob_aq_state (k, v, at) VALUES ('live_tick_lock', $1::jsonb, now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, at = now()
    WHERE mob_aq_state.v = 'false'::jsonb OR mob_aq_state.at < now() - interval '100 seconds' RETURNING k`, [JSON.stringify({ owner })]);
  return ok ? owner : null; }
export { takeLock };
export const dropLock = (d, owner) => d.q(`UPDATE mob_aq_state SET v = 'false'::jsonb, at = now() WHERE k = 'live_tick_lock' AND v = $1::jsonb`, [JSON.stringify({ owner })]);
// The lease is renewed between the steps of a run (each step is far under 100 s: one order is at most ~6 polls of 2.5 s plus
// a few 12-s-capped calls); a run that finds it lost stops ordering. The buy's claim also checks it in the same statement.
export const renewLock = async (d, owner) => !!(await d.one(`UPDATE mob_aq_state SET at = now() WHERE k = 'live_tick_lock' AND v = $1::jsonb RETURNING k`, [JSON.stringify({ owner })]));
// A position left 'closing' or 'opening' with no order on its way (the run died between the claim and the order row): healed
// after 2 minutes. 'closing' goes back to 'open' (or 'stuck'), 'opening' with no order that could still land becomes 'failed'.
async function healOrphans(d) {
  const live = `EXISTS (SELECT 1 FROM mob_aq_live_orders o WHERE o.position_id = p.id AND (o.status IN ('requested','sent') OR o.requested_at > now() - interval '2 minutes'))`;
  const a = await d.q(`UPDATE mob_aq_live_positions p SET status = CASE WHEN p.plan->>'writtenOff' = 'true' THEN 'closed' WHEN sell_fails >= $2 THEN 'stuck' ELSE 'open' END WHERE p.venue = $1 AND p.status = 'closing' AND NOT ${live} RETURNING id`, [VENUE, LIVE.maxSellFails]);
  const b = await d.q(`UPDATE mob_aq_live_positions p SET status = 'failed', closed_at = now(), exit_reason = 'no order was made for this buy; nothing was spent' WHERE p.venue = $1 AND p.status = 'opening' AND p.created_at < now() - interval '2 minutes' AND NOT ${live} RETURNING id`, [VENUE]);
  return a.length + b.length;
}
// After a full sale the coin's token account is empty but still holds its rent. SPL CloseAccount (instruction 9; accounts: the
// account, the destination, the owner as signer; solana-program/token instruction.rs) sends that rent back to the wallet.
// A legacy transaction: header [1 signer, 0, 1 read-only], keys [wallet, token account, token program], one instruction.
export function closeTx(wallet, account, program, blockhash) {
  const msg = new Uint8Array(3 + 1 + 96 + 32 + 1 + 1 + 1 + 3 + 1 + 1);
  msg.set([1, 0, 1, 3], 0); msg.set(unbase58(wallet), 4); msg.set(unbase58(account), 36); msg.set(unbase58(program), 68); msg.set(unbase58(blockhash), 100);
  msg.set([1, 2, 3, 1, 0, 0, 1, 9], 132);
  const tx = new Uint8Array(1 + 64 + msg.length); tx[0] = 1; tx.set(msg, 65);
  return b64(tx);
}
// One closed position at a time: its empty token account is closed, the rent comes back, and when this trade's buy paid that
// rent (plan.ataCreated) it is booked back into the trade's proceeds and P&L. A token account with dust in it is left (and noted).
export async function reclaimRent(env, w) {
  const d = db(env), out = [];
  for (const p of await d.q(`SELECT id, mint, symbol, plan FROM mob_aq_live_positions WHERE venue = $1 AND status = 'closed' AND plan IS NOT NULL AND (closed_at > now() - interval '3 days' OR (plan->>'recoveredAt')::timestamptz > now() - interval '3 days')
      AND NOT (coalesce(plan->>'writtenOff', '') = 'true' AND NOT (plan ? 'recovered'))
      AND (NOT (plan ? 'rent') OR (plan->'rent'->>'state' = 'sent') OR (plan->'rent'->>'state' = 'failed' AND coalesce((plan->'rent'->>'tries')::int, 0) < 3)) ORDER BY id LIMIT 3`, [VENUE])) {
    // a terminal end (dust left, or 3 failed closes): the rent kept apart at the buy is lost, and only then booked as a loss
    const lost = (r) => (r.state === "dust" || (r.state === "failed" && (r.tries || 0) >= 3)) && p.plan.rentSol > 0 && !p.plan.rentLost;
    const mark = async (r) => { const L = lost(r) ? p.plan.rentSol : 0;
      await d.q(`UPDATE mob_aq_live_positions SET plan = plan || jsonb_build_object('rent', $2::jsonb) || CASE WHEN $3::float8 > 0 THEN jsonb_build_object('rentLost', true) ELSE '{}'::jsonb END, pnl_sol = pnl_sol - $3::float8 WHERE id = $1`, [p.id, JSON.stringify(r), L]); };
    const r0 = p.plan.rent || {}, tries = (r0.tries || 0) + (r0.state === "sent" ? 0 : 1);
    try {
      if (r0.state === "sent") { // a close whose outcome is not known yet: the chain is asked, never sent again
        const st = (await solRpc(env, "getSignatureStatuses", [[r0.signature], { searchTransactionHistory: true }])).value?.[0] ?? null;
        if (st && !st.err && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) { out.push(await bookRent(d, p, r0)); continue; }
        if (st?.err || (Date.now() - new Date(r0.at).getTime()) / 60000 >= LIVE.sentStaleMin) await mark({ ...r0, state: "failed", error: st?.err ? "the chain rejected the close" : "the close never reached the chain" });
        continue;
      }
      const accts = await tokenAccounts(env, w.address, p.mint);
      if (!accts.length) { await mark({ state: "none", note: "no token account left for this coin" }); continue; }
      const a = accts[0];
      if (a.raw !== "0") { await mark({ state: "dust", amount: a.raw, account: a.address, note: "the account still holds tokens: it cannot be closed" }); continue; }
      const bh = (await solRpc(env, "getLatestBlockhash", [{ commitment: "confirmed" }])).value;
      const tx = closeTx(w.address, a.address, a.program, bh.blockhash);
      const pre = (await solRpc(env, "getBalance", [w.address])).value;
      const v = (await solRpc(env, "simulateTransaction", [tx, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed", accounts: { encoding: "base64", addresses: [w.address] } }])).value;
      const back = (v?.accounts?.[0]?.lamports ?? -1) - pre;
      if (v?.err || !(back > 0) || back > a.lamports) { await mark({ state: "failed", tries, error: v?.err ? `the close does not simulate (${cut(JSON.stringify(v.err), 100)})` : "the simulation did not show the rent coming back" }); continue; }
      const signed = await signTx(env, w, tx), r = { state: "sent", tries, signature: signed.signature, account: a.address, lamports: back, at: new Date().toISOString() };
      await mark(r);
      try { await broadcast(env, signed.tx); } catch {} // unknown outcome: the next tick asks the chain
      let st = null;
      for (let i = 0; i < LIVE.confirmPolls && !st; i++) { if (i) await sleep(Number(env.AQ_LIVE_POLL_MS ?? LIVE.confirmGapMs)); try { const x = (await solRpc(env, "getSignatureStatuses", [[r.signature], { searchTransactionHistory: true }])).value?.[0]; if (x && (x.err || x.confirmationStatus === "confirmed" || x.confirmationStatus === "finalized")) st = x; } catch {} }
      if (st && !st.err) out.push(await bookRent(d, p, r)); else if (st?.err) await mark({ ...r, state: "failed", error: "the chain rejected the close" }); else out.push({ symbol: p.symbol, rent: "sent, being confirmed" });
    } catch (e) { await mark({ ...r0, state: "failed", tries, error: cut(e.message || e, 160) }); }
  }
  return out;
}
async function bookRent(d, p, r) {
  // rent kept apart at the buy (plan.rentSol): only the difference (the close's fee) touches the trade. An older position whose
  // cost included the rent (ataCreated, no rentSol) gets all of it back into the trade.
  // (a written-off position already booked its rent as lost: when it comes back after a recovery sale, all of it is added back)
  const sol = r.lamports / 1e9, apart = p.plan.rentSol > 0, booked = apart || p.plan.ataCreated === true, delta = p.plan.rentLost === true ? sol : apart ? sol - p.plan.rentSol : booked ? sol : 0;
  await d.q(`UPDATE mob_aq_live_positions SET plan = plan || jsonb_build_object('rent', $2::jsonb), proceeds_sol = coalesce(proceeds_sol, 0) + $3, pnl_sol = pnl_sol + $3 WHERE id = $1 AND plan->'rent'->>'state' IS DISTINCT FROM 'closed'`,
    [p.id, JSON.stringify({ ...r, state: "closed", sol, booked }), delta]);
  await brain(d, `LIVE RENT BACK ${p.symbol}: the empty token account was closed, ${round(sol, 6)} SOL back to the Aquarius wallet${booked ? " and booked to the trade (its buy paid it)" : ""} (${r.signature}).`);
  return { symbol: p.symbol, rentBackSol: round(sol, 6), booked };
}
export async function liveTick(env, { cron = null, minute = Math.floor(Date.now() / 60000) } = {}) {
  const d = db(env), owner = await takeLock(d), t0 = Date.now();
  if (!owner) return { skipped: "another live tick is running" };
  const out = { at: new Date().toISOString(), cron }, renew = () => renewLock(d, owner);
  try {
    const w = await get(d, "sol_wallet_key");
    // 1. anything sent and not yet known: ask the chain first
    for (const o of await d.q(`SELECT * FROM mob_aq_live_orders WHERE venue = $1 AND status = 'sent' ORDER BY id`, [VENUE])) (out.reconciled ||= []).push({ id: o.id, end: await settle(env, o) });
    // an order row that never got as far as a signature (the run died first): nothing was signed, so nothing was spent
    for (const o of await d.q(`SELECT * FROM mob_aq_live_orders WHERE venue = $1 AND status = 'requested' AND requested_at < now() - interval '3 minutes'`, [VENUE])) await finish(d, o, "failed", { error: "the run stopped before signing; nothing was sent" });
    { const healed = await healOrphans(d); if (healed) out.healed = healed; }
    // 2. exits for what is open, then the rent of fully sold coins comes back
    if (w?.address) { const ex = await exits(env, w, minute, renew); if (ex.length) out.exits = ex; }
    if (w?.address && w.sealed && minute % 5 === 0 && (await renew())) { const rc = await recoverWrittenOff(env, w, minute); if (rc.length) out.recovered = rc; }
    if (w?.address && w.sealed && (await renew())) { const rr = await reclaimRent(env, w); if (rr.length) out.rent = rr; }
    if (w?.address && minute % 5 === 0) { try { const or = await reconcileWallet(env, w); if (or?.length) out.orphans = or.length; } catch (e) { out.orphansError = cut(e.message || e); } }
    // 3. one new buy at most, behind every gate, and only while this run still holds the lease
    if (!(await renew())) { out.result = { skipped: "the money lease was lost: no buy this run" }; return out; }
    const g = await gates(env);
    out.result = g.ok ? await tryBuy(env, g, owner) : await refuse(d, VENUE, g.gate, g.reason);
    if (minute % 5 === 0) out.robinhood = await rhGate(env);
    // optional work only inside the time budget, so a run never outlives its lease
    if (Date.now() - t0 > LIVE.tickBudgetMs) out.deferred = "paper mirror and Phantom signal skipped: the run is past its time budget";
    else {
      await renew(); try { const ph = await phantomWatch(env, g); if (ph) out.phantom = ph; } catch (e) { out.phantomError = cut(e.message || e); }
      await renew(); try { const pp = await paperTick(env, t0); if (pp.opened || pp.closed || pp.halves) out.paper = pp; } catch (e) { out.paperError = cut(e.message || e); }
    }
    // twice an hour, a read-only question to each Jupiter host from this Worker, so "does Jupiter answer from production" is on record
    if (minute % 30 === 0) { const hosts = {}; for (const h of JUP_HOSTS) { try { const r = await fetch(`${h}/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=10000000&slippageBps=50`, { signal: AbortSignal.timeout(8000) }); hosts[h] = r.status; await r.body?.cancel(); } catch { hosts[h] = "no answer"; } } await set(d, "live_probe", { at: out.at, hosts }); }
  } catch (e) { out.error = cut(e.message || e); }
  finally {
    try { await set(d, "live_tick", out); } catch {}
    await dropLock(d, owner);
  }
  return out;
}
// ---------------------------------------------------------------- Alex's own orders on a live position (SELL 25/50/ALL, BUY MORE)
// They skip the entry signal, never the safety: kill switch, simulation, impact cap, balance and fee reserve, the daily loss
// stop and the open-position limit (BUY MORE adds to a held coin, it never opens a new one). Same order/ledger/reconcile path
// as the trader (execute -> finish -> settle). Reason on record: "manual: Alex". One manual order at a time (the tick lock).
export const MANUAL_PCTS = [25, 50, 100];
async function manualCheck(env, b) {
  b = b && typeof b === "object" ? b : {};
  const d = db(env), S = Object.fromEntries((await d.q(`SELECT k, v FROM mob_aq_state WHERE k IN ('sol_wallet_key','sol_wallet_limits','kill')`)).map((r) => [r.k, r.v]));
  const w = S.sol_wallet_key, lim = clampLimits({ maxPerTradeSol: 0, maxDailyLossSol: 0, maxOpenPositions: 0, ...(S.sol_wallet_limits || {}) }, env);
  if (!w?.address || !w.sealed) return { error: "The Aquarius wallet has not been created" };
  if (S.kill === true) return { error: "The kill switch is on: no order, manual or automatic" };
  const p = await d.one(`SELECT * FROM mob_aq_live_positions WHERE id = $1 AND venue = $2`, [Number(b?.positionId) || 0, VENUE]);
  if (!p || p.status !== "open") return { error: p ? `That position is ${p.status}, not open` : "No such live position" };
  if (b.side === "sell") {
    if (!MANUAL_PCTS.includes(Number(b.pct))) return { error: "Sell 25, 50 or 100 percent" };
    const amount = Number(b.pct) === 100 ? p.tokens_raw : ((BigInt(p.tokens_raw) * BigInt(b.pct)) / 100n).toString();
    if (amount === "0") return { error: "Nothing to sell" };
    return { d, w, lim, p, amount };
  }
  if (b.side !== "buy") return { error: "side must be buy or sell" };
  const sol = Number(b.sol ?? lim.maxPerTradeSol);
  if (!(sol > 0)) return { error: "Amount must be above zero" };
  if (!(lim.maxPerTradeSol > 0) || sol > lim.maxPerTradeSol) return { error: `${sol} SOL is over the ${lim.maxPerTradeSol} SOL per-trade limit` };
  // BUY MORE is a buy: the same lane switches, right-call, veto and safety gates as the trader's own entries, the same daily loss
  // budget, and the hard ceiling on everything open (open positions x size: an add counts toward it)
  const lanes = lanesOf(S.sol_wallet_limits), lane = p.plan?.source === "market" ? "market" : "right_call";
  if (lane === "market" ? !lanes.market || p.plan?.fresh === true : !lanes.rightCall) return { error: `The ${lane === "market" ? "market" : "right-call"} lane is OFF in the live settings: BUY MORE on ${p.symbol} is refused` };
  const ceiling = round(lim.maxPerTradeSol * lim.maxOpenPositions, 6), exposure = (await d.one(`SELECT coalesce(sum(coalesce(cost_sol, (plan->>'sizeSol')::float8, 0)), 0)::float8 s FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE}`, [VENUE])).s;
  if (exposure + sol > ceiling + 1e-9) return { error: `Adding ${sol} SOL would put ${round(exposure + sol, 6)} SOL into open positions, over the hard ceiling of ${lim.maxOpenPositions} x ${lim.maxPerTradeSol} = ${ceiling} SOL` };
  if (p.plan?.source !== "market" && !(await rightCalls(d)).has(p.mint)) return { error: `No fresh symbiote right call on ${p.symbol}: BUY MORE is refused (Alex's right-call rule)` };
  if (await vetoed(d, p.mint)) return { error: `Grok vetoed ${p.symbol} in the last hour: BUY MORE is refused` };
  const hs = await safetyOf(env, { mint: p.mint, audit: null }); if (!hs.ok) return { error: `Safety: ${hs.reason}` };
  const mc = await mintCheck(env, p.mint); if (!mc.ok) return { error: `Token: ${mc.reason}` };
  const fresh = p.plan?.fresh === true, rk = await riskToday(d, await feePerSide(d)), stopFrac = worstFrac((p.stop_pct ?? 100) / 100, fresh ? LIVE.freshMaxRtPct : FIB.maxRtPct, fresh);
  if (lim.maxDailyLossSol > 0 && -rk.pnl >= lim.maxDailyLossSol) return { error: `Today's live loss is ${round(-rk.pnl, 6)} SOL, at the daily limit: no buying today` };
  if (!(lim.maxDailyLossSol > 0) || sol * stopFrac > lim.maxDailyLossSol + rk.committed) return { error: `Adding ${sol} SOL could lose ${round(sol * stopFrac, 6)} SOL in its worst case; today's loss budget left is ${round(Math.max(0, lim.maxDailyLossSol + rk.committed), 6)} SOL` };
  const open = (await d.one(`SELECT count(*)::int n FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE}`, [VENUE])).n;
  if (lim.maxOpenPositions > 0 && open > lim.maxOpenPositions) return { error: `${open} positions open, over the limit of ${lim.maxOpenPositions}` };
  const lamports = Math.round(sol * 1e9); let bal;
  try { bal = (await solRpc(env, "getBalance", [w.address])).value; } catch (e) { return { error: `The balance could not be read: ${cut(e.message)}` }; }
  if (!(bal >= lamports + LIVE.feeBudgetLamports + LIVE.reserveSol * 1e9)) return { error: `The wallet holds ${round(bal / 1e9, 6)} SOL: not enough for ${sol} SOL and the ${LIVE.reserveSol} SOL kept for fees` };
  return { d, w, lim, p, sol, lamports, underwater: p.last_value_sol != null && p.last_value_sol < p.cost_sol };
}
// The add's own cost gate, at its real size, against the position's NEXT target: round trip and impact under the lane's caps, the
// honeypot test, the buy's fee room; then check E on the price this quote really pays (above the stop, under the target, and the
// target at least 3x the round trip away). Returns the quote to execute, or the reason it is refused.
async function addGate(env, k) {
  const { d, p, sol, lamports, w } = k, pl = p.plan;
  if (!pl?.kind || !(pl.stop > 0) || !Number.isInteger(pl.dec)) return { error: `${p.symbol} has no chart plan to check an add against: BUY MORE is refused` };
  const stop = pl.phase === 2 && pl.trailStop ? Math.max(pl.stop, pl.trailStop) : pl.stop, target = pl.phase === 2 ? pl.t3 : pl.phase === 1 ? pl.t2 : pl.t1, unit = pl.unit || "USD";
  const c = { mint: p.mint, symbol: p.symbol, fresh: pl.fresh === true }, s = { entry: pl.chartEntry ?? pl.entry, t1: target, stop };
  const cg = await costGate(env, VENUE, c, s, sol, { feeSide: await feePerSide(d), owner: w.address }); if (!cg.ok) return { error: `Cost: ${cg.refusal.reason}` };
  const livePx = pxOf(lamports, cg.q.q.outAmount, pl.dec, unit, unit === "USD" ? await solUsdLive(env) : null);
  if (!(livePx > 0)) return { error: "The live price could not be read from the buy quote: no add without it" };
  if (livePx <= stop) return { error: `The live price ${r8(livePx)} is at or under the stop ${r8(stop)}: no add` };
  if (livePx >= target) return { error: `The live price ${r8(livePx)} is at or over the next target ${r8(target)}: nothing left to earn on an add` };
  const rewardLivePct = round(((target - livePx) / livePx) * 100, 3);
  if (rewardLivePct < FIB.minRewardRt * cg.rtPct) return { error: `The next target is ${rewardLivePct}% from the live price this quote pays, under ${FIB.minRewardRt}x the ${cg.rtPct}% round trip` };
  return { cg, livePx, rewardLivePct };
}
// What the order would do, for the confirm dialog. Sends nothing.
export async function manualPreview(env, b) {
  b = b && typeof b === "object" ? b : {};
  const k = await manualCheck(env, b); if (k.error) return k;
  const { p } = k; let q;
  if (b.side === "sell") q = await quote(env, p.mint, SOL_MINT, k.amount, LIVE.exitSlippageBps);
  else { const a = await addGate(env, k); if (a.error) return a; q = a.cg.q; } // the dialog shows what the order would really be told
  if (!q.ok) return { error: q.error };
  return { side: b.side, positionId: Number(p.id), symbol: p.symbol, mint: p.mint, pct: b.side === "sell" ? Number(b.pct) : null, sol: b.side === "buy" ? k.sol : null, tokensIn: b.side === "sell" ? k.amount : null,
    expectOut: q.q.outAmount, minOut: q.q.otherAmountThreshold, expectSol: b.side === "sell" ? Number(q.q.outAmount) / 1e9 : null, impactPct: round(q.impactPct, 3), overImpact: q.impactPct > LIVE.maxImpactPct,
    underwater: !!k.underwater, warning: k.underwater ? "Rulebook v2 rule 10: never add to a loser. Buy anyway?" : null };
}
export async function manualOrder(env, b) {
  b = b && typeof b === "object" ? b : {};
  const k = await manualCheck(env, b); if (k.error) return k;
  if (b.side === "buy" && k.underwater && b.force !== true) return { error: "Rulebook v2 rule 10: never add to a loser. Buy anyway?", underwater: true };
  const { d, w, p } = k, minute = Math.floor(Date.now() / 60000), owner = await takeLock(d);
  if (!owner) return { error: "Another order is being made right now: try again in a few seconds", busy: true };
  try {
    if ((await d.one(`SELECT count(*)::int n FROM mob_aq_live_orders WHERE venue = $1 AND status IN ('requested','sent')`, [VENUE])).n) return { error: "An earlier order is still being confirmed on the chain", busy: true };
    if (b.side === "sell") return await sellPosition(env, w, p, `manual: Alex (sell ${b.pct}%)`, `manual-${b.pct}-${minute}`, { size: (t) => (Number(b.pct) === 100 ? t : ((BigInt(t) * BigInt(b.pct)) / 100n).toString()), slippageBps: exitBps(p.plan?.slipFails ?? 0) });
    const a = await addGate(env, k); if (a.error) return a;
    const q = a.cg.q;
    const r = await execute(env, w, { side: "buy", c: { mint: p.mint, symbol: p.symbol, fresh: p.plan?.fresh === true }, maxBuyFeeLamports: a.cg.maxBuyFeeLamports, positionId: p.id, inMint: SOL_MINT, outMint: p.mint, amountRaw: k.lamports, slippageBps: LIVE.slippageBps, reason: "manual: Alex (buy more)", claim: `${VENUE}|${p.mint}|add|${minute}`, q0: q });
    return { buyMore: p.symbol, ...r };
  } finally { await dropLock(d, owner); }
}
export async function sellAllLive(env) {
  const d = db(env), w = await get(d, "sol_wallet_key"), out = { sold: [], kept: [] };
  if (!w?.address) return out;
  // the tick may be mid-sale: wait for its lease (up to ~20 s), never sell beside it
  let owner = null; for (let i = 0; i < 8 && !(owner = await takeLock(d)); i++) await sleep(Number(env.AQ_LIVE_POLL_MS ?? 2500));
  if (!owner) return { ...out, busy: "the trader is in the middle of a run: press again in a few seconds" };
  try { for (const p of await d.q(`SELECT * FROM mob_aq_live_positions WHERE venue = $1 AND status IN ('open','stuck') ORDER BY id`, [VENUE])) {
    if (!(await renewLock(d, owner))) break;
    const r = await sellPosition(env, w, p, "SELL ALL LIVE (Alex)", `all-${Math.floor(Date.now() / 60000)}`, { slippageBps: exitBps(p.plan?.slipFails ?? 0) });
    (r.confirmed ? out.sold : out.kept).push({ symbol: p.symbol, signature: r.signature || null, state: r.confirmed ? "sold" : r.pending ? "sent, being confirmed" : r.failed || r.skipped || "not sold" });
  } } finally { await dropLock(d, owner); }
  await brain(d, `SELL ALL LIVE by Alex: ${out.sold.length} sold, ${out.kept.length} not yet.`);
  return out;
}
// F) What the daily number really is. It is a BUDGET: new buys stop (and are sized) when today's loss plus the worst case of what
// is open reaches it. It is not a ceiling on what can be lost: positions already open can fall further than their stops (a rug
// goes to zero). The hard ceiling is every open position worth nothing: open positions x size.
export function dailyLossNote(lim0) {
  const lim = clampLimits({ maxPerTradeSol: 0, maxDailyLossSol: 0, maxOpenPositions: 0, ...(lim0 || {}) }), hard = round(lim.maxPerTradeSol * lim.maxOpenPositions, 6);
  return { budgetSol: Number(lim.maxDailyLossSol) || 0, hardCeilingSol: hard,
    note: `${Number(lim.maxDailyLossSol) || 0} SOL a day is a budget, not a ceiling: new buys stop when today's loss plus the worst case of the open positions reaches it. What can really be lost at most is every open position going to zero: ${lim.maxOpenPositions} x ${lim.maxPerTradeSol} = ${hard} SOL.` };
}
export async function liveState(d, venue = VENUE) {
  const [pos, ord, ref, pnl, S, tot] = await Promise.all([
    d.q(`SELECT id, mint, symbol, status, tokens_raw, cost_sol, stop_pct, last_value_sol, last_value_at, opened_at, plan, sell_fails, alert_patch FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE} ORDER BY id`, [venue]),
    d.q(`SELECT id, side, symbol, mint, status, reason, error, signature, fill_sol, fee_sol, requested_at FROM mob_aq_live_orders WHERE venue = $1 ORDER BY id DESC LIMIT 20`, [venue]),
    d.one(`SELECT gate, reason, symbol, n, at FROM mob_aq_live_refusals WHERE venue = $1 ORDER BY at DESC LIMIT 1`, [venue]),
    d.one(`SELECT coalesce(sum(pnl_sol), 0)::float8 s, count(*)::int n FROM mob_aq_live_positions WHERE venue = $1 AND status = 'closed' AND closed_at >= ${TODAY}`, [venue]),
    d.q(`SELECT k, v FROM mob_aq_state WHERE k IN ('live_tick','live_auto_off','sol_wallet_limits','live_orphans')`),
    d.one(`SELECT coalesce(sum(pnl_sol), 0)::float8 s, count(*)::int n, count(*) FILTER (WHERE pnl_sol > 0)::int w, (SELECT coalesce(sum(fee_sol), 0)::float8 FROM mob_aq_live_orders WHERE venue = $1 AND status = 'confirmed') f FROM mob_aq_live_positions WHERE venue = $1 AND status = 'closed'`, [venue]),
  ]);
  const st = Object.fromEntries(S.map((r) => [r.k, r.v]));
  const plan = (p) => (p.plan ? { source: p.plan.source || "right_call", stop: p.plan.phase === 2 ? Math.max(p.plan.stop, p.plan.trailStop ?? -Infinity) : p.plan.stop, t1: p.plan.t1, t2: p.plan.t2, t3: p.plan.t3, entry: p.plan.entry, phase: p.plan.phase, leg: p.plan.leg } : null);
  return { positions: pos.map((p) => ({ id: Number(p.id), symbol: p.symbol, mint: p.mint, source: p.plan ? p.plan.source || "right_call" : null, status: p.status, costSol: p.cost_sol, valueSol: p.last_value_sol, valueAt: p.last_value_at, openedAt: p.opened_at, plan: plan(p), spark: Array.isArray(p.alert_patch?.spark) ? p.alert_patch.spark : [], pnlPct: p.last_value_sol != null && p.cost_sol > 0 ? round((p.last_value_sol / p.cost_sol - 1) * 100, 2) : null, underwater: p.last_value_sol != null && p.last_value_sol < p.cost_sol })),
    orders: ord.map((o) => ({ id: Number(o.id), side: o.side, symbol: o.symbol, status: o.status, reason: o.reason, error: o.error, signature: o.signature, sol: o.fill_sol, at: o.requested_at })),
    manualPcts: MANUAL_PCTS, pnlTodaySol: round(pnl.s, 6), closedToday: pnl.n, pnlTotalSol: round(tot?.s ?? 0, 6), closedTotal: tot?.n ?? 0, winsTotal: tot?.w ?? 0, feesTotalSol: round(tot?.f ?? 0, 6), lastRefusal: ref ? { gate: ref.gate, reason: ref.reason, symbol: ref.symbol, times: ref.n, at: ref.at } : null,
    lastTickAt: st.live_tick?.at || null, autoOff: st.live_auto_off || null, paper: await paperStats(d),
    lanes: lanesOf(st.sol_wallet_limits), dailyLoss: dailyLossNote(st.sol_wallet_limits),
    // coins in the wallet that no open position accounts for (checked every 5 minutes; never sold automatically)
    orphans: st.live_orphans?.list || [], orphansAt: st.live_orphans?.at || null,
    rule: "chart trader: Fibonacci pullback, chart stop, chart targets", proven: false,
    note: "Never tested in the training arena (it tested fixed holds): it starts unproven. The paper mirror below measures it on every coin." };
}

// ---------------------------------------------------------------- Robinhood: the same gates in USD. THE ORDER CALL IS NOT BUILT.
// Robinhood's order tool names and arguments have not been read (they are only visible after Alex signs in), so nothing
// here can place a stock order. This checks the gates and writes down the first one that stops a trade, the last being that.
export async function rhGate(env) {
  const d = db(env), S = Object.fromEntries((await d.q(`SELECT k, v FROM mob_aq_state WHERE k IN ('rh_tokens','rh_limits','rh_cache','kill')`)).map((r) => [r.k, r.v]));
  const lim = { maxPerTradeUsd: 0, maxDailyLossUsd: 0, maxOpenPositions: 0, allowStocks: false, allowCrypto: false, autoTrade: false, ...(S.rh_limits || {}) }, V = "robinhood";
  if (!S.rh_tokens?.sealed) return refuse(d, V, "not_connected", "Robinhood is not connected");
  if (!lim.autoTrade) return refuse(d, V, "auto_trade_off", "Auto trade is off");
  if (S.kill === true) return refuse(d, V, "kill_switch", "The kill switch is on");
  if (!(lim.maxPerTradeUsd > 0)) return refuse(d, V, "limit_per_trade", "Most per trade is zero");
  if (!(lim.maxDailyLossUsd > 0)) return refuse(d, V, "limit_daily_loss", "Most lost in a day is zero");
  if (!(lim.maxOpenPositions > 0)) return refuse(d, V, "limit_open", "Open positions at once is zero");
  if (!lim.allowStocks && !lim.allowCrypto) return refuse(d, V, "nothing_allowed", "Stocks and crypto are both off");
  const loss = -(await d.one(`SELECT coalesce(sum(pnl_sol), 0)::float8 s FROM mob_aq_live_positions WHERE venue = $1 AND status = 'closed' AND closed_at >= ${TODAY}`, [V])).s;
  if (loss >= lim.maxDailyLossUsd) return refuse(d, V, "daily_loss", `Today's loss is $${round(loss, 2)}, at the daily limit`);
  if ((await d.one(`SELECT count(*)::int n FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE}`, [V])).n >= lim.maxOpenPositions) return refuse(d, V, "max_open", "The open-position limit is reached");
  return refuse(d, V, "orders_not_built", S.rh_cache?.tools?.length ? "Stock orders are not built yet: Robinhood's tool list has been read and the order call is the next build" : "Stock orders are not built yet: Robinhood's tool list has not been read");
}

// ---------------------------------------------------------------- Phantom: signals only. Aquarius never signs for Phantom.
// While Alex's Phantom is connected and the panel was open in the last 3 minutes: the same dip scan, stored as a signal for
// the page to show (valid 3 minutes), and a fresh sell quote for each of his Phantom positions so the page can say SELL NOW.
export async function phantomWatch(env, g = null) {
  const d = db(env), ph = await get(d, "phantom");
  // a trade he approved whose outcome is not known yet is settled from the chain whether or not the page is still open
  for (const o of await d.q(`SELECT * FROM mob_aq_live_orders WHERE venue = 'phantom' AND status = 'sent' ORDER BY id LIMIT 5`)) await settle(env, o);
  if (!ph?.address || !ph.seenAt || Date.now() - new Date(ph.seenAt).getTime() > 180000) return null;
  const open = await d.q(`SELECT * FROM mob_aq_live_positions WHERE venue = 'phantom' AND status = 'open' ORDER BY id`), nowSec = Date.now() / 1000;
  for (const p of open.slice(0, 4)) {
    const q = await quote(env, p.mint, SOL_MINT, p.tokens_raw, LIVE.exitSlippageBps);
    if (q.ok) await d.q(`UPDATE mob_aq_live_positions SET last_value_sol = $2, last_value_at = now() WHERE id = $1`, [p.id, Number(q.q.outAmount) / 1e9]);
    if (!p.plan) continue;
    // the same unit and liquidity-basis rules as a live position: candles in the plan's unit from a FRESH source only, and the
    // -30% liquidity exit only against a pool figure (never a curve figure against a pool's)
    const cs = await positionCandles(env, d, p, nowSec);
    const m = manage(p.plan, cs.ok ? cs.data : [], nowSec, { liqNow: !p.plan.onCurve && (p.plan.liqBasis || "jupiter") === "jupiter" ? await liqOf(env, p.mint) : null, vetoed: await vetoed(d, p.mint) });
    if (m.action === "hold" && !cs.ok) continue; // no candles this minute: a standing SELL NOW stays up (missing data never clears it)
    // he sells, never Aquarius: a trail update is applied, a sale is only told to him (SELL NOW), and the half sale's next step waits for his sale
    if (m.action === "hold") await d.q(`UPDATE mob_aq_live_positions SET plan = plan || coalesce($2::jsonb, '{}'::jsonb), alert = NULL, alert_action = NULL, alert_patch = NULL WHERE id = $1`, [p.id, m.patch ? JSON.stringify(m.patch) : null]);
    else await d.q(`UPDATE mob_aq_live_positions SET alert = $2, alert_action = $3, alert_patch = $4 WHERE id = $1`, [p.id, m.action === "sell_half" ? "target 1 reached: sell half (then the stop moves to your entry)" : m.reason, m.action, m.patch ? JSON.stringify(m.patch) : null]);
  }
  let found = await scanFib(env, "phantom", async (mint) => open.some((p) => p.mint === mint));
  let cc = null;
  if (found.c) { const lim = await get(d, "sol_wallet_limits", {}), cl = clampLimits(lim, env); cc = await costGate(env, "phantom", found.c, found.s, cl.maxPerTradeSol > 0 ? cl.maxPerTradeSol : 0.05, { feeSide: await feePerSide(d), owner: ph.address }); if (!cc.ok) found = { refusal: cc.refusal }; }
  if (found.c) { const s = found.s; await set(d, "phantom_signal", { mint: found.c.mint, symbol: found.c.symbol, at: new Date().toISOString(), why: s.why, zone: [s.levels.z618, s.levels.z50], entry: s.entry, stop: s.stop, t1: s.t1, t2: s.t2, t3: s.t3, liqUsd: found.c.liqUsd, source: found.lane,
    // 7) the signal's plan says where its numbers come from, like a live plan: lane, candle source, unit, liquidity basis. Whether the
    // coin is still on the bonding curve comes from the route of the cost gate's own buy quote.
    plan: planOf(s, Math.floor(nowSec), { source: found.lane || "right_call", fresh: !!found.c.fresh, src: found.src, unit: found.unit || (found.src === "symbiote" ? "SOL" : "USD"), dec: found.dec, liqBasis: found.c.liqBasis || "jupiter", onCurve: labelsOf(cc?.q?.q).some((l) => CURVE_LABELS.has(l)), liq: found.c.liqUsd }) }); }
  return { marked: open.length, signal: found.c ? found.c.symbol : null };
}
