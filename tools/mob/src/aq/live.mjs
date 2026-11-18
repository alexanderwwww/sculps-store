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
//  - RPC: simulateTransaction {sigVerify:false, replaceRecentBlockhash:true, accounts:{addresses}} -> value.err,
//    value.accounts[0].lamports; getSignatureStatuses -> value[i] null | {confirmationStatus, err}; getBlockHeight -> number.
//  - getTransaction (meta.preBalances/postBalances/fee/pre+postTokenBalances) is the standard shape; the public RPC rate
//    limited it on the day, so it was matched against simulateTransaction's identical field names, not a live answer.
// Order of every order: the row is written, THEN the swap is built, simulated, signed and the signature stored, THEN it is
// sent. A send whose outcome is unknown is never sent again: the next tick asks the chain for that signature first.
import { db } from "../db.mjs";
import { unseal } from "../auth.mjs";
import { base58, unbase58, rpc as solRpc, clampLimits } from "./wallet.mjs";
import { feeds, SOL_MINT, jupPrices } from "./feeds.mjs";
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
const JUP_HOSTS = ["https://api.jup.ag", "https://lite-api.jup.ag"];
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
// getMultipleAccounts takes at most 100 addresses (MAX_MULTIPLE_ACCOUNTS, agave rpc-client-types): asked in batches of 100
async function multi(env, addrs, cfg) { const out = []; for (let i = 0; i < addrs.length; i += 100) out.push(...((await solRpc(env, "getMultipleAccounts", [addrs.slice(i, i + 100), { ...cfg, commitment: "confirmed" }])).value || [])); return out; }
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
    for (const a of (await solRpc(env, "getTokenAccountsByOwner", [owner, filter, { encoding: "jsonParsed", commitment: "confirmed" }])).value || []) {
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
  const pre = (await solRpc(env, "getBalance", [address])).value, keys = await txKeys(env, b64tx), mine = await tokenAccounts(env, address);
  const accts = mine.filter((a) => keys.has(a.address));
  if (side === "buy" && mint) for (const prog of [PROG.token, PROG.token22]) { const a = await ataOf(address, mint, prog); if (keys.has(a) && !accts.some((x) => x.address === a)) accts.push({ address: a, mint, program: prog, absent: true }); }
  const preData = accts.length ? await multi(env, accts.map((a) => a.address), { encoding: "base64" }) : [];
  const v = (await solRpc(env, "simulateTransaction", [b64tx, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed", accounts: { encoding: "base64", addresses: [address, ...accts.map((a) => a.address)] } }])).value;
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
    if (!st) { // not on chain. Only once its blockhash has expired is it certain it never will be.
      let h = null; try { h = await solRpc(env, "getBlockHeight", [{ commitment: "confirmed" }]); } catch {}
      if (typeof h === "number" && o.last_valid_height && h > Number(o.last_valid_height) + 5) { await finish(d, o, "failed", { error: "it never reached the chain (its time window passed); nothing was spent" }); return "failed"; }
      if (typeof h !== "number" && ageMin(o) >= LIVE.sentStaleMin) { await finish(d, o, "failed", { error: `the chain never saw it in ${LIVE.sentStaleMin} minutes (far past a blockhash's ~150-block window); nothing was spent` }); return "failed"; }
    }
  }
  return "pending";
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
      const qo = Number((await d.one(`SELECT quote_out FROM mob_aq_live_orders WHERE id = $1`, [o.id]))?.quote_out), ratio = qo > 0 ? qo / Number(fill.tokens) : 1;
      // the rent of a new token account is NOT trade cost: it is kept apart (plan.rentSol), comes back by closeAccount, and is
      // booked as a loss only if it never does. Marks, the daily budget and the loss check never see it.
      const rent = fill.created ? Math.max(0, fill.rentLamports || 0) : 0;
      await d.q(`UPDATE mob_aq_live_positions SET status = 'open', tokens_raw = $2, cost_sol = $3, fees_sol = fees_sol + $4, opened_at = now(),
        plan = CASE WHEN plan IS NULL THEN NULL ELSE plan || jsonb_build_object('chartEntry', plan->'entry', 'entry', (plan->>'entry')::float8 * $5::float8, 'fillRatio', $5::float8, 'ataCreated', $6::boolean, 'rentSol', $7::float8) END
        WHERE id = $1 AND status = 'opening'`, [o.position_id, fill.tokens.toString(), (-fill.solLamports - rent) / 1e9, fill.feeLamports / 1e9, ratio, !!fill.created, rent / 1e9]);
    }
    else await d.q(`UPDATE mob_aq_live_positions SET status = 'failed', closed_at = now(), exit_reason = $2 WHERE id = $1 AND status = 'opening'`, [o.position_id, cut(error || "the buy brought no tokens")]);
    if (status === "confirmed") await brain(d, `LIVE BUY ${o.symbol}: ${round(-fill.solLamports / 1e9, 6)} SOL from the Aquarius wallet (${o.signature}). Chart plan: stop ${o.plan_patch?.stop ?? "?"}, targets ${o.plan_patch?.t1 ?? "?"} / ${o.plan_patch?.t2 ?? "?"}.`);
    return;
  }
  if (status === "confirmed") {
    // a partial sale (target 1: half) keeps the position open with the plan's next step; selling what is left closes it
    const p = await d.one(`UPDATE mob_aq_live_positions SET tokens_raw = greatest(0, tokens_raw::numeric - $5::numeric)::text, proceeds_sol = coalesce(proceeds_sol, 0) + $2, fees_sol = fees_sol + $3,
        status = CASE WHEN tokens_raw::numeric - $5::numeric <= 0 THEN 'closed' ELSE 'open' END, sell_fails = 0, closed_at = CASE WHEN tokens_raw::numeric - $5::numeric <= 0 THEN now() END,
        pnl_sol = CASE WHEN tokens_raw::numeric - $5::numeric <= 0 THEN coalesce(proceeds_sol, 0) + $2 - cost_sol END, exit_reason = CASE WHEN tokens_raw::numeric - $5::numeric <= 0 THEN $4 ELSE exit_reason END,
        plan = CASE WHEN tokens_raw::numeric - $5::numeric <= 0 THEN coalesce(plan, '{}'::jsonb) || jsonb_build_object('outcome', $4::text, 'closedAt', now()) ELSE coalesce(plan, '{}'::jsonb) || coalesce($6::jsonb, '{}'::jsonb) END
      WHERE id = $1 AND status = 'closing' RETURNING status, pnl_sol`, [o.position_id, fill.solLamports / 1e9, fill.feeLamports / 1e9, o.reason, (-fill.tokens).toString(), o.plan_patch ? JSON.stringify(o.plan_patch) : null]);
    if (p) { await brain(d, `LIVE SELL ${o.symbol} (${o.reason}): ${round(fill.solLamports / 1e9, 6)} SOL back${p.status === "closed" ? `, ${p.pnl_sol >= 0 ? "+" : ""}${round(p.pnl_sol, 6)} SOL on the trade` : ", the rest stays open"} (${o.signature}).`); if (p.status === "closed") await dailyLossCheck(d); }
  } else await d.q(`UPDATE mob_aq_live_positions SET status = CASE WHEN sell_fails + 1 >= $2 THEN 'stuck' ELSE 'open' END, sell_fails = sell_fails + 1 WHERE id = $1 AND status = 'closing'`, [o.position_id, LIVE.maxSellFails]);
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
// The day's risk: realized + marked (pnl), and what it becomes if every open position is sold at its stop (committed): value
// at the stop = marked value x stop / last price, less the exit slippage and one network fee. A buy still on its way counts its
// size times its stop distance. New buys are refused, and sized, against the committed number.
export async function riskToday(d, feeSide = LIVE.feePerSideFallbackLamports) {
  const realized = (await d.one(`SELECT coalesce(sum(pnl_sol), 0)::float8 s FROM mob_aq_live_positions WHERE venue = $1 AND status = 'closed' AND closed_at >= ${TODAY}`, [VENUE])).s;
  let marked = 0, worst = 0; const slip = 1 - LIVE.exitSlippageBps / 1e4;
  for (const p of await d.q(`SELECT cost_sol, proceeds_sol, last_value_sol, stop_pct, plan, alert_patch FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE}`, [VENUE])) {
    if (p.cost_sol == null) { worst -= (p.plan?.sizeSol ?? 0) * ((p.stop_pct ?? 100) / 100 + LIVE.exitSlippageBps / 1e4) + (2 * feeSide) / 1e9; continue; }
    const got = p.proceeds_sol || 0, now = p.last_value_sol ?? p.cost_sol - got, pl = p.plan;
    marked += Math.min(0, got + now - p.cost_sol);
    const stop = pl ? (pl.phase === 2 ? Math.max(pl.stop, pl.trailStop ?? -Infinity) : pl.stop) : null, spark = p.alert_patch?.spark;
    const px = Array.isArray(spark) && spark.length ? spark[spark.length - 1] : pl?.chartEntry ?? pl?.entry;
    const atStop = stop > 0 && px > 0 ? now * Math.min(1, stop / px) : now * Math.max(0, 1 - (p.stop_pct ?? 100) / 100);
    worst += Math.min(0, got + atStop * slip - p.cost_sol) - feeSide / 1e9;
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
    if (side === "buy" && qr.impactPct > LIVE.maxImpactPct) return fail(`price impact ${round(qr.impactPct, 2)}% is over the ${LIVE.maxImpactPct}% cap`);
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
  if (!(budgetLeft > 0)) return no("daily_loss_risk", `Today's loss plus what the open positions lose if every stop is hit is ${round(-rk.committed, 6)} SOL: no room under the ${lim.maxDailyLossSol} SOL daily limit for a new trade`);
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
  try { const p = (await jupPrices([mint]))[mint]; return p && Number.isFinite(p.liqUsd) ? p.liqUsd : null; } catch { return null; }
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
// list above). The pool floor for these fresh coins is symbiote's: 20 SOL of real reserves in the curve, re-checked every
// 5 minutes (sym/do.mjs LIQ_FLOOR_SOL); liqUsd here is Jupiter's figure for the coin, else those reserves x2 at the SOL price.
export async function freshRightCandidates(env, d) {
  const rows = await d.q(`SELECT r.mint, r.symbol, r.checks->>'realSol' real_sol FROM mob_aq_sym_right r WHERE r.status = 'candidate' AND coalesce(r.checked_at, r.flagged_at) > now() - $1::float8 * interval '1 minute'`, [await rightCallTtlMin(d)]).catch(() => []);
  if (!rows.length) return [];
  let px = {}; try { px = await jupPrices([SOL_MINT, ...rows.map((r) => r.mint)]); } catch {}
  const solUsd = px[SOL_MINT]?.price ?? null;
  return rows.map((r) => ({ mint: r.mint, symbol: r.symbol, quoteMint: SOL_MINT, fresh: true, liqUsd: Number.isFinite(px[r.mint]?.liqUsd) ? px[r.mint].liqUsd : solUsd && Number(r.real_sol) > 0 ? Number(r.real_sol) * 2 * solUsd : null }));
}
// One-minute candles: Jupiter's chart first; for a fresh coin Jupiter may have none, then symbiote's own bars built from the
// curve's trade stream (mob_aq_sym_bars, the coin's price in SOL; the chart rules are ratios, so the unit does not matter).
export async function candlesFor(env, d, mint) {
  const cs = await feeds.jupCandles(env, mint); if (cs.ok) return cs;
  const rows = await d.q(`SELECT t, o, h, l, c, v FROM mob_aq_sym_bars WHERE mint = $1 AND t > extract(epoch from now())::bigint - 21600 ORDER BY t`, [mint]).catch(() => []);
  return rows.length ? { ok: true, src: "symbiote", data: rows.map((r) => ({ t: Number(r.t), o: Number(r.o), h: Number(r.h), l: Number(r.l), c: Number(r.c), v: Number(r.v) || 0 })) } : cs;
}
export async function scanFib(env, venue, skip) {
  const d = db(env), est = await candidates(env), nowSec = Date.now() / 1000, fresh = await freshRightCandidates(env, d);
  const list = [...fresh, ...(est || []).filter((c) => !fresh.some((f) => f.mint === c.mint))];
  if (!est && !fresh.length) return { refusal: await refuse(d, venue, "no_market_data", "Jupiter's coin lists did not answer") };
  if (!list.length) return { refusal: await refuse(d, venue, "no_candidate", "No established coin with a pool of $100K or more, and no fresh right call, right now") };
  // Alex's hard rule (2026-11-18): only a coin symbiote flagged as a RIGHT CALL that passed its deep checks may be bought.
  const right = await rightCalls(d);
  if (!right.size) return { refusal: await refuse(d, venue, "no_right_call", `Symbiote has no fresh right call (checked in the last ${await rightCallTtlMin(d)} minutes) that passed its deep checks: no live entry`) };
  let last = null, looked = 0, inList = 0;
  for (const c of list) {
    if (!right.has(c.mint)) continue;
    inList++;
    if (looked >= LIVE.candidatesPerTick) break;
    if (await skip(c.mint, null)) continue;
    looked++;
    if (c.fresh && !(c.liqUsd > 0)) { last = await refuse(d, venue, "pool", "No liquidity figure for this fresh right call", c); continue; }
    const cs = await candlesFor(env, d, c.mint);
    if (!cs.ok) { last = await refuse(d, venue, "no_candles", "No one-minute candles for this coin", c); continue; }
    const s = entrySetup(cs.data, nowSec);
    if (!s.signal) { last = await refuse(d, venue, s.stale ? "stale_data" : "no_setup", s.why, c); continue; }
    if (await skip(c.mint, s)) { last = await refuse(d, venue, "same_leg", "This leg was already traded once", c); continue; }
    if (await vetoed(d, c.mint)) { last = await refuse(d, venue, "veto", "Grok vetoed this coin in the last hour", c); continue; }
    const hs = await safetyOf(env, c);
    if (!hs.ok) { last = await refuse(d, venue, "safety", hs.reason, c); continue; }
    const mc = await mintCheck(env, c.mint);
    if (!mc.ok) { last = await refuse(d, venue, "token_program", mc.reason, c); continue; }
    return { c, s };
  }
  return { refusal: last || await refuse(d, venue, inList ? "no_setup" : "no_right_call", inList ? "No right-call coin is in a Fibonacci pullback right now" : "No symbiote right call is among the candidates right now") };
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
  return { ok: true, program: v.owner };
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
const legTaken = async (d, venue, mint, s) => !!(await d.one(`SELECT 1 FROM mob_aq_live_positions WHERE venue = $1 AND mint = $2 AND (status IN ${ACTIVE} OR ($3::bigint IS NOT NULL AND (plan->'leg'->>'highT')::bigint = $3::bigint)) LIMIT 1`, [venue, mint, s ? s.leg.highT : null]));
// Cost first, at the real size: price impact under 1%, the measured round trip (buy this size, sell what it buys) under 1%,
// and the way to target 1 at least 3x it. Used by the live buy AND by the Phantom signal.
// The fixed SOL costs count too, as a % of the size: the network fee of both sides and, for a coin with no token account yet,
// the closeAccount that returns the rent after the sale. The rent itself is fronted capital that comes back, not a cost: it is
// required in the balance (tryBuy) and reported (rentFrontedLamports).
export async function costGate(env, venue, c, s, sizeSol, { feeSide = LIVE.feePerSideFallbackLamports, owner = null } = {}) {
  const d = db(env), lamports = Math.round(sizeSol * 1e9), no = async (gate, why) => ({ ok: false, refusal: await refuse(d, venue, gate, why, c) });
  let ataNew = true; if (owner) { try { ataNew = !(await tokenAccounts(env, owner, c.mint)).length; } catch {} }
  const fixed = 2 * feeSide + (ataNew ? LIVE.baseFeeLamports : 0), fixedPct = (fixed / lamports) * 100;
  if (fixedPct >= FIB.maxRtPct) return no("cost", `The fixed SOL fees alone (${fixed} lamports) are ${round(fixedPct, 3)}% of ${sizeSol} SOL, over ${FIB.maxRtPct}%`);
  const q = await quote(env, SOL_MINT, c.mint, lamports, LIVE.slippageBps);
  if (!q.ok) return no("no_quote", q.error);
  if (q.impactPct > LIVE.maxImpactPct) return no("price_impact", `Price impact ${round(q.impactPct, 2)}% is over the ${LIVE.maxImpactPct}% cap`);
  const back = await quote(env, c.mint, SOL_MINT, q.q.outAmount, LIVE.exitSlippageBps);
  if (!back.ok) return no("no_quote", `no sell quote: ${back.error}`);
  const quoteRtPct = round((1 - Number(back.q.outAmount) / lamports) * 100, 3), rtPct = round(quoteRtPct + fixedPct, 3), rewardPct = round(((s.t1 - s.entry) / s.entry) * 100, 3);
  const parts = `${quoteRtPct}% in the quotes + ${round(fixedPct, 3)}% fixed SOL fees at ${sizeSol} SOL`;
  if (rtPct >= FIB.maxRtPct) return no("cost", `The round trip costs ${rtPct}% (${parts}), over ${FIB.maxRtPct}%`);
  if (rewardPct < FIB.minRewardRt * rtPct) return no("cost", `Target 1 is ${rewardPct}% away, under ${FIB.minRewardRt}x the ${rtPct}% round trip (${parts})`);
  const proof = await sellProof(env, c, q.q.outAmount, owner);
  if (!proof.ok) return no("honeypot", proof.reason);
  // room left for the buy's own network fee once Jupiter prices it (execute checks it before signing)
  const room = (Math.min(FIB.maxRtPct - quoteRtPct, rewardPct / FIB.minRewardRt - quoteRtPct) / 100) * lamports - feeSide - (ataNew ? LIVE.baseFeeLamports : 0);
  let rent = 0; if (ataNew) { try { rent = await solRpc(env, "getMinimumBalanceForRentExemption", [165]); } catch {} if (!(rent > 0)) rent = LIVE.tokenAccountRentFallbackLamports; }
  return { ok: true, q, rtPct, quoteRtPct, fixedLamports: fixed, fixedPct: round(fixedPct, 3), rewardPct, maxBuyFeeLamports: Math.floor(room), rentFrontedLamports: rent };
}
async function tryBuy(env, g, owner = null) {
  const d = db(env), minute = Math.floor(Date.now() / 60000);
  const found = await scanFib(env, VENUE, (mint, s) => legTaken(d, VENUE, mint, s));
  if (!found.c) return found.refusal;
  // size: the limit, cut to what the day's loss budget can still lose if this trade's stop is hit (stop distance + exit
  // slippage + the 1% round-trip ceiling)
  const { c, s } = found, perSol = (s.entry - s.stop) / s.entry + LIVE.exitSlippageBps / 1e4 + FIB.maxRtPct / 100;
  const size = round(Math.min(g.lim.maxPerTradeSol, g.budgetLeft != null ? g.budgetLeft / perSol : Infinity), 6), lamports = Math.round(size * 1e9);
  const cappedBy = size < g.lim.maxPerTradeSol ? `daily loss budget: ${round(g.budgetLeft, 6)} SOL left` : null;
  let bal; try { bal = (await solRpc(env, "getBalance", [g.w.address])).value; } catch (e) { return refuse(d, VENUE, "no_balance", cut(e.message)); }
  if (!(bal >= lamports + LIVE.feeBudgetLamports + LIVE.reserveSol * 1e9)) return refuse(d, VENUE, "reserve", `The wallet holds ${round(bal / 1e9, 6)} SOL: not enough for a ${size} SOL trade and the ${LIVE.reserveSol} SOL kept for fees`);
  const cg = await costGate(env, VENUE, c, s, size, { feeSide: g.feeSide, owner: g.w.address }); if (!cg.ok) return cg.refusal;
  const { q, rtPct, rewardPct } = cg;
  if (!(bal >= lamports + LIVE.feeBudgetLamports + LIVE.reserveSol * 1e9 + cg.rentFrontedLamports)) return refuse(d, VENUE, "reserve", `The wallet holds ${round(bal / 1e9, 6)} SOL: not enough for a ${size} SOL trade, the ${round(cg.rentFrontedLamports / 1e9, 6)} SOL token-account rent (returned after the sale) and the ${LIVE.reserveSol} SOL kept for fees`);
  const plan = planOf(s, Math.floor(Date.now() / 1000), { liq: c.liqUsd, rtPct, quoteRtPct: cg.quoteRtPct, fixedLamports: cg.fixedLamports, rewardPct, sizeSol: size, sizeCappedBy: cappedBy, ataNew: cg.rentFrontedLamports > 0, validations: { ...s.validations, notVetoed: true, safety: true, tokenProgram: true, sellProven: true, cost: true, impact: true } });
  // the claim: one statement takes the coin's only active slot, under the open-position limit. A second caller gets nothing.
  const p = await d.one(`INSERT INTO mob_aq_live_positions (venue, mint, symbol, status, stop_pct, pool_liq_usd, plan)
    SELECT $1,$2,$3,'opening',$4,$5,$6 WHERE (SELECT count(*) FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE}) < $7::int
      AND ($8::text IS NULL OR EXISTS (SELECT 1 FROM mob_aq_state WHERE k = 'live_tick_lock' AND v = $8::jsonb)) ON CONFLICT DO NOTHING RETURNING id`,
    [VENUE, c.mint, c.symbol, round(((s.entry - s.stop) / s.entry) * 100, 3), c.liqUsd, JSON.stringify(plan), g.lim.maxOpenPositions, owner ? JSON.stringify({ owner }) : null]);
  if (!p) return refuse(d, VENUE, "claim_lost", "This coin or the last free slot was taken by another run", c);
  const r = await execute(env, g.w, { side: "buy", c, positionId: p.id, inMint: SOL_MINT, outMint: c.mint, amountRaw: lamports, slippageBps: LIVE.slippageBps, reason: s.why, claim: `${VENUE}|${c.mint}|buy|${minute}`, q0: q, patch: { stop: s.stop, t1: s.t1, t2: s.t2 }, maxBuyFeeLamports: cg.maxBuyFeeLamports });
  if (r.skipped) await d.q(`UPDATE mob_aq_live_positions SET status = 'failed', closed_at = now(), exit_reason = $2 WHERE id = $1 AND status = 'opening'`, [p.id, r.noOrder ? cut(r.skipped) : "duplicate order"]);
  return { buy: c.symbol, ...r };
}
// Exits run whenever a live position is open, with auto trade on or off and with the kill switch on: a position is never left alone.
// `size(tokensRaw)` turns the tokens held AT THE CLAIM into the amount to sell (default: all of them), never a stale read.
// An urgent exit (stop, invalidation, veto, liquidity, Alex's SELL ALL) that has failed before is sent with twice the slippage per
// failure, never over 20%: a rug must not hold the bag because the price ran past 1.5%. The order row keeps the bps used.
export const exitBps = (fails, urgent = true) => (urgent ? Math.min(LIVE.exitSlippageMaxBps, LIVE.exitSlippageBps * 2 ** Math.max(0, Number(fails) || 0)) : LIVE.exitSlippageBps);
async function sellPosition(env, w, p, reason, claimKey, { size = (t) => t, patch = null, slippageBps = LIVE.exitSlippageBps } = {}) {
  const d = db(env);
  const took = await d.one(`UPDATE mob_aq_live_positions SET status = 'closing' WHERE id = $1 AND status IN ('open','stuck') RETURNING id, status, tokens_raw`, [p.id]);
  if (!took) return { skipped: "already being sold" };
  let amountRaw = String(size(took.tokens_raw)); if (!/^\d+$/.test(amountRaw) || amountRaw === "0") amountRaw = took.tokens_raw;
  const r = await execute(env, w, { side: "sell", c: { mint: p.mint, symbol: p.symbol }, positionId: p.id, inMint: p.mint, outMint: SOL_MINT, amountRaw, slippageBps, reason: slippageBps > LIVE.exitSlippageBps ? `${reason} [sell slippage ${slippageBps} bps after ${p.sell_fails} failed sell(s)]` : reason, claim: `${VENUE}|${p.mint}|sell|${claimKey}`, patch });
  if (r.skipped) await d.q(`UPDATE mob_aq_live_positions SET status = CASE WHEN sell_fails >= $2 THEN 'stuck' ELSE 'open' END WHERE id = $1 AND status = 'closing'`, [p.id, LIVE.maxSellFails]);
  return { sell: p.symbol, reason, ...r };
}
// The chart decides every exit (chart.mjs manage). No data this minute = hold: missing data never forces a sale.
async function exits(env, w, minute = Math.floor(Date.now() / 60000), renew = null) {
  const d = db(env), out = [], nowSec = Date.now() / 1000;
  // a 'stuck' position (5 failed sells in a row) is still managed and retried every minute: a coin is never left alone
  for (const p of await d.q(`SELECT * FROM mob_aq_live_positions WHERE venue = $1 AND status IN ('open','stuck') ORDER BY id`, [VENUE])) {
    if (renew && !(await renew())) { out.push({ stopped: "the money lease was lost: no further orders this run" }); break; }
    const q = await quote(env, p.mint, SOL_MINT, p.tokens_raw, LIVE.exitSlippageBps);
    if (q.ok) await d.q(`UPDATE mob_aq_live_positions SET last_value_sol = $2, last_value_at = now() WHERE id = $1`, [p.id, Number(q.q.outAmount) / 1e9]);
    if (!p.plan) continue; // a position without a chart plan (none is opened that way) waits for SELL ALL LIVE
    const cs = await candlesFor(env, d, p.mint); // a fresh right call's exits run on symbiote's bars when Jupiter has no chart
    const m = manage(p.plan, cs.ok ? cs.data : [], nowSec, { liqNow: await liqOf(env, p.mint), vetoed: await vetoed(d, p.mint) });
    // the panel's sparkline: the last closed 1-minute price, once a minute, the last 90 kept (display only; manage() never reads it)
    const lastPx = cs.ok ? cs.data.filter((c) => c.t + 60 <= nowSec).slice(-1)[0]?.c : null;
    if (Number.isFinite(lastPx)) await d.q(`UPDATE mob_aq_live_positions SET alert_patch = jsonb_build_object('spark', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (SELECT x FROM jsonb_array_elements(coalesce(alert_patch->'spark', '[]'::jsonb)) x OFFSET greatest(0, jsonb_array_length(coalesce(alert_patch->'spark', '[]'::jsonb)) - 89)) z) || jsonb_build_array($2::float8)) WHERE id = $1`, [p.id, lastPx]);
    if (m.action === "hold") { if (m.patch) await d.q(`UPDATE mob_aq_live_positions SET plan = plan || $2::jsonb WHERE id = $1 AND status = 'open'`, [p.id, JSON.stringify(m.patch)]); continue; }
    out.push(await sellPosition(env, w, p, m.reason, `${p.plan.phase ?? 0}-${minute}`, { size: m.action === "sell_half" ? (t) => (BigInt(t) / 2n).toString() : (t) => t, patch: m.action === "sell_half" ? m.patch : null, slippageBps: exitBps(p.sell_fails, !/^target/.test(m.reason)) }));
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
  const a = await d.q(`UPDATE mob_aq_live_positions p SET status = CASE WHEN sell_fails >= $2 THEN 'stuck' ELSE 'open' END WHERE p.venue = $1 AND p.status = 'closing' AND NOT ${live} RETURNING id`, [VENUE, LIVE.maxSellFails]);
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
  for (const p of await d.q(`SELECT id, mint, symbol, plan FROM mob_aq_live_positions WHERE venue = $1 AND status = 'closed' AND plan IS NOT NULL AND closed_at > now() - interval '3 days'
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
  const sol = r.lamports / 1e9, apart = p.plan.rentSol > 0, booked = apart || p.plan.ataCreated === true, delta = apart ? sol - p.plan.rentSol : booked ? sol : 0;
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
    if (w?.address && w.sealed && (await renew())) { const rr = await reclaimRent(env, w); if (rr.length) out.rent = rr; }
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
  // BUY MORE is a buy: the same right-call, veto and safety gates as the trader's own entries, and the same daily loss budget
  if (!(await rightCalls(d)).has(p.mint)) return { error: `No fresh symbiote right call on ${p.symbol}: BUY MORE is refused (Alex's right-call rule)` };
  if (await vetoed(d, p.mint)) return { error: `Grok vetoed ${p.symbol} in the last hour: BUY MORE is refused` };
  const hs = await safetyOf(env, { mint: p.mint, audit: null }); if (!hs.ok) return { error: `Safety: ${hs.reason}` };
  const mc = await mintCheck(env, p.mint); if (!mc.ok) return { error: `Token: ${mc.reason}` };
  const rk = await riskToday(d, await feePerSide(d)), stopFrac = (p.stop_pct ?? 100) / 100 + LIVE.exitSlippageBps / 1e4;
  if (lim.maxDailyLossSol > 0 && -rk.pnl >= lim.maxDailyLossSol) return { error: `Today's live loss is ${round(-rk.pnl, 6)} SOL, at the daily limit: no buying today` };
  if (!(lim.maxDailyLossSol > 0) || sol * stopFrac > lim.maxDailyLossSol + rk.committed) return { error: `Adding ${sol} SOL could lose ${round(sol * stopFrac, 6)} SOL at the stop; today's loss budget left is ${round(Math.max(0, lim.maxDailyLossSol + rk.committed), 6)} SOL` };
  const open = (await d.one(`SELECT count(*)::int n FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE}`, [VENUE])).n;
  if (lim.maxOpenPositions > 0 && open > lim.maxOpenPositions) return { error: `${open} positions open, over the limit of ${lim.maxOpenPositions}` };
  const lamports = Math.round(sol * 1e9); let bal;
  try { bal = (await solRpc(env, "getBalance", [w.address])).value; } catch (e) { return { error: `The balance could not be read: ${cut(e.message)}` }; }
  if (!(bal >= lamports + LIVE.feeBudgetLamports + LIVE.reserveSol * 1e9)) return { error: `The wallet holds ${round(bal / 1e9, 6)} SOL: not enough for ${sol} SOL and the ${LIVE.reserveSol} SOL kept for fees` };
  return { d, w, lim, p, sol, lamports, underwater: p.last_value_sol != null && p.last_value_sol < p.cost_sol };
}
// What the order would do, for the confirm dialog. Sends nothing.
export async function manualPreview(env, b) {
  b = b && typeof b === "object" ? b : {};
  const k = await manualCheck(env, b); if (k.error) return k;
  const { p } = k, q = b.side === "sell" ? await quote(env, p.mint, SOL_MINT, k.amount, LIVE.exitSlippageBps) : await quote(env, SOL_MINT, p.mint, k.lamports, LIVE.slippageBps);
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
    if (b.side === "sell") return await sellPosition(env, w, p, `manual: Alex (sell ${b.pct}%)`, `manual-${b.pct}-${minute}`, { size: (t) => (Number(b.pct) === 100 ? t : ((BigInt(t) * BigInt(b.pct)) / 100n).toString()), slippageBps: exitBps(p.sell_fails) });
    const q = await quote(env, SOL_MINT, p.mint, k.lamports, LIVE.slippageBps);
    if (!q.ok) return { error: q.error };
    if (q.impactPct > LIVE.maxImpactPct) return { error: `Price impact ${round(q.impactPct, 2)}% is over the ${LIVE.maxImpactPct}% cap` };
    const r = await execute(env, w, { side: "buy", c: { mint: p.mint, symbol: p.symbol }, positionId: p.id, inMint: SOL_MINT, outMint: p.mint, amountRaw: k.lamports, slippageBps: LIVE.slippageBps, reason: "manual: Alex (buy more)", claim: `${VENUE}|${p.mint}|add|${minute}`, q0: q });
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
    const r = await sellPosition(env, w, p, "SELL ALL LIVE (Alex)", `all-${Math.floor(Date.now() / 60000)}`, { slippageBps: exitBps(p.sell_fails) });
    (r.confirmed ? out.sold : out.kept).push({ symbol: p.symbol, signature: r.signature || null, state: r.confirmed ? "sold" : r.pending ? "sent, being confirmed" : r.failed || r.skipped || "not sold" });
  } } finally { await dropLock(d, owner); }
  await brain(d, `SELL ALL LIVE by Alex: ${out.sold.length} sold, ${out.kept.length} not yet.`);
  return out;
}
export async function liveState(d, venue = VENUE) {
  const [pos, ord, ref, pnl, S, tot] = await Promise.all([
    d.q(`SELECT id, mint, symbol, status, tokens_raw, cost_sol, stop_pct, last_value_sol, last_value_at, opened_at, plan, sell_fails, alert_patch FROM mob_aq_live_positions WHERE venue = $1 AND status IN ${ACTIVE} ORDER BY id`, [venue]),
    d.q(`SELECT id, side, symbol, mint, status, reason, error, signature, fill_sol, fee_sol, requested_at FROM mob_aq_live_orders WHERE venue = $1 ORDER BY id DESC LIMIT 20`, [venue]),
    d.one(`SELECT gate, reason, symbol, n, at FROM mob_aq_live_refusals WHERE venue = $1 ORDER BY at DESC LIMIT 1`, [venue]),
    d.one(`SELECT coalesce(sum(pnl_sol), 0)::float8 s, count(*)::int n FROM mob_aq_live_positions WHERE venue = $1 AND status = 'closed' AND closed_at >= ${TODAY}`, [venue]),
    d.q(`SELECT k, v FROM mob_aq_state WHERE k IN ('live_tick','live_auto_off')`),
    d.one(`SELECT coalesce(sum(pnl_sol), 0)::float8 s, count(*)::int n, count(*) FILTER (WHERE pnl_sol > 0)::int w, (SELECT coalesce(sum(fee_sol), 0)::float8 FROM mob_aq_live_orders WHERE venue = $1 AND status = 'confirmed') f FROM mob_aq_live_positions WHERE venue = $1 AND status = 'closed'`, [venue]),
  ]);
  const st = Object.fromEntries(S.map((r) => [r.k, r.v]));
  const plan = (p) => (p.plan ? { stop: p.plan.phase === 2 ? Math.max(p.plan.stop, p.plan.trailStop ?? -Infinity) : p.plan.stop, t1: p.plan.t1, t2: p.plan.t2, t3: p.plan.t3, entry: p.plan.entry, phase: p.plan.phase, leg: p.plan.leg } : null);
  return { positions: pos.map((p) => ({ id: Number(p.id), symbol: p.symbol, mint: p.mint, status: p.status, costSol: p.cost_sol, valueSol: p.last_value_sol, valueAt: p.last_value_at, openedAt: p.opened_at, plan: plan(p), spark: Array.isArray(p.alert_patch?.spark) ? p.alert_patch.spark : [], pnlPct: p.last_value_sol != null && p.cost_sol > 0 ? round((p.last_value_sol / p.cost_sol - 1) * 100, 2) : null, underwater: p.last_value_sol != null && p.last_value_sol < p.cost_sol })),
    orders: ord.map((o) => ({ id: Number(o.id), side: o.side, symbol: o.symbol, status: o.status, reason: o.reason, error: o.error, signature: o.signature, sol: o.fill_sol, at: o.requested_at })),
    manualPcts: MANUAL_PCTS, pnlTodaySol: round(pnl.s, 6), closedToday: pnl.n, pnlTotalSol: round(tot?.s ?? 0, 6), closedTotal: tot?.n ?? 0, winsTotal: tot?.w ?? 0, feesTotalSol: round(tot?.f ?? 0, 6), lastRefusal: ref ? { gate: ref.gate, reason: ref.reason, symbol: ref.symbol, times: ref.n, at: ref.at } : null,
    lastTickAt: st.live_tick?.at || null, autoOff: st.live_auto_off || null, paper: await paperStats(d),
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
    const cs = await candlesFor(env, d, p.mint);
    const m = manage(p.plan, cs.ok ? cs.data : [], nowSec, { liqNow: await liqOf(env, p.mint), vetoed: await vetoed(d, p.mint) });
    if (m.action === "hold" && !cs.ok) continue; // no candles this minute: a standing SELL NOW stays up (missing data never clears it)
    // he sells, never Aquarius: a trail update is applied, a sale is only told to him (SELL NOW), and the half sale's next step waits for his sale
    if (m.action === "hold") await d.q(`UPDATE mob_aq_live_positions SET plan = plan || coalesce($2::jsonb, '{}'::jsonb), alert = NULL, alert_action = NULL, alert_patch = NULL WHERE id = $1`, [p.id, m.patch ? JSON.stringify(m.patch) : null]);
    else await d.q(`UPDATE mob_aq_live_positions SET alert = $2, alert_action = $3, alert_patch = $4 WHERE id = $1`, [p.id, m.action === "sell_half" ? "target 1 reached: sell half (then the stop moves to your entry)" : m.reason, m.action, m.patch ? JSON.stringify(m.patch) : null]);
  }
  let found = await scanFib(env, "phantom", async (mint) => open.some((p) => p.mint === mint));
  if (found.c) { const lim = await get(d, "sol_wallet_limits", {}), cl = clampLimits(lim, env), cc = await costGate(env, "phantom", found.c, found.s, cl.maxPerTradeSol > 0 ? cl.maxPerTradeSol : 0.05, { feeSide: await feePerSide(d), owner: ph.address }); if (!cc.ok) found = { refusal: cc.refusal }; }
  if (found.c) { const s = found.s; await set(d, "phantom_signal", { mint: found.c.mint, symbol: found.c.symbol, at: new Date().toISOString(), why: s.why, zone: [s.levels.z618, s.levels.z50], entry: s.entry, stop: s.stop, t1: s.t1, t2: s.t2, t3: s.t3, liqUsd: found.c.liqUsd, plan: planOf(s, Math.floor(nowSec), { liq: found.c.liqUsd }) }); }
  return { marked: open.length, signal: found.c ? found.c.symbol : null };
}
