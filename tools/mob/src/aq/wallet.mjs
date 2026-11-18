// The Aquarius Solana wallet: made ON THE SERVER, read here, with its own limits. This file can create the key, show the
// public address and read balances. It has NO swap, transfer or transaction code: nothing here builds, signs or sends a
// Solana transaction. The only signature it ever makes is over one fixed sentence, at creation, to prove the key works.
// Live orders are in live.mjs, the one other file that opens the sealed key (in memory, at the moment of signing).
//
// The secret key (Ed25519, WebCrypto, exported as PKCS#8) is stored AES-GCM sealed with the MOB_ENC_KEY secret
// (auth.mjs seal/unseal, the same as the Robinhood tokens) in mob_aq_state k='sol_wallet_key'. No route, log, brain row or
// state field ever carries it, sealed or not. There is no seed phrase: the wallet lives in that one database row plus the
// MOB_ENC_KEY secret. The row is left OUT of the daily R2 backup (the backup can be downloaded through a route), so today
// its only copy is the database: MOB_ENC_KEY must never change and that row must never be deleted once money is in it.
// RPC shapes read live on 2026-11-18 from api.mainnet-beta.solana.com: getBalance -> result.value (lamports);
// getTokenAccountsByOwner (jsonParsed) -> result.value[].account.data.parsed.info.{mint, tokenAmount:{amount, decimals, uiAmount}}.
import { db } from "../db.mjs";
import { seal, unseal } from "../auth.mjs";
import { HELIUS_URL } from "./whales.mjs";

const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";
const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]; // SPL Token, Token-2022
const CACHE_MS = 60000, PROOF = "aquarius wallet self-check";
const enc = new TextEncoder();
const get = async (d, k, dflt = null) => (await d.one(`SELECT v FROM mob_aq_state WHERE k=$1`, [k]))?.v ?? dflt;
const set = (d, k, v) => d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ($1,$2,now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [k, JSON.stringify(v)]);
const brain = (d, text) => d.q(`INSERT INTO mob_aq_brain (dept, kind, text) VALUES ('execution','event',$1)`, [text]);
const note = async (d, lastError) => { try { await set(d, "sol_wallet_status", { lastError, at: new Date().toISOString() }); } catch {} };
const b64 = (u8) => btoa(String.fromCharCode(...u8)), unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// ---------------------------------------------------------------- base58 (Bitcoin alphabet, what Solana addresses use)
const A58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function base58(bytes) {
  let n = 0n; for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = ""; while (n > 0n) { s = A58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = "1" + s; }
  return s;
}
export function unbase58(str) {
  let n = 0n; for (const c of str) { const i = A58.indexOf(c); if (i < 0) throw new Error("not base58"); n = n * 58n + BigInt(i); }
  const out = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; }
  for (const c of str) { if (c !== "1") break; out.unshift(0); }
  return new Uint8Array(out);
}

// ---------------------------------------------------------------- the key
// Returns the address and the sealed secret. The plain secret never leaves this function.
export async function makeKey(env) {
  const k = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", k.publicKey));
  if (pub.length !== 32) throw new Error("the new public key is not 32 bytes");
  const sealed = await seal(env, b64(new Uint8Array(await crypto.subtle.exportKey("pkcs8", k.privateKey))));
  const address = base58(pub);
  if (!(await proves(env, sealed, address))) throw new Error("the new key did not pass its own check; nothing was stored");
  return { address, sealed };
}
// Opens the sealed key and checks it really is the key of `address`: signs one fixed sentence and verifies it with the address.
export async function proves(env, sealed, address) {
  try {
    const priv = await crypto.subtle.importKey("pkcs8", unb64(await unseal(env, sealed)), { name: "Ed25519" }, false, ["sign"]);
    const pub = await crypto.subtle.importKey("raw", unbase58(address), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, pub, await crypto.subtle.sign({ name: "Ed25519" }, priv, enc.encode(PROOF)), enc.encode(PROOF));
  } catch { return false; }
}
// Once only. The row is claimed in one statement, so two presses cannot make two wallets or replace the first.
export async function createWallet(env) {
  const d = db(env);
  const have = await get(d, "sol_wallet_key");
  if (have?.address) return { error: "The Aquarius wallet already exists", exists: true, address: have.address };
  const { address, sealed } = await makeKey(env), createdAt = new Date().toISOString();
  const won = await d.one(`INSERT INTO mob_aq_state (k, v, at) VALUES ('sol_wallet_key', $1, now()) ON CONFLICT (k) DO NOTHING RETURNING k`, [JSON.stringify({ address, sealed, createdAt })]);
  if (!won) { const now = await get(d, "sol_wallet_key"); return { error: "The Aquarius wallet already exists", exists: true, address: now?.address || null }; }
  const stored = await get(d, "sol_wallet_key");
  if (!(await proves(env, stored.sealed, stored.address))) { await note(d, "The stored wallet key did not pass its check. Do not send money to this address."); return { error: "The wallet was stored but did not pass its check. Do not fund it." }; }
  await note(d, null);
  await brain(d, `Aquarius wallet created on the server: ${address}. It can be read and funded. Live orders are not built yet.`);
  return { created: true, address, createdAt };
}

// ---------------------------------------------------------------- reading balances (public data, by address)
export async function rpc(env, method, params) {
  const url = env.HELIUS_API_KEY ? HELIUS_URL(env.HELIUS_API_KEY) : PUBLIC_RPC, via = env.HELIUS_API_KEY ? "Helius" : "the public Solana RPC";
  let r, j;
  try { r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15000) }); j = await r.json(); }
  catch { throw new Error(`${via} did not answer ${method}`); } // the URL carries the Helius key, so the raw error is never passed on
  if (!r.ok || j?.error || j?.result == null) throw new Error(`${via} refused ${method}${j?.error?.message ? ` (${String(j.error.message).slice(0, 120)})` : ` (HTTP ${r.status})`}`);
  return j.result;
}
export async function readBalances(env, address) {
  const lamports = (await rpc(env, "getBalance", [address])).value;
  if (typeof lamports !== "number") throw new Error("the balance answer had no number in it");
  const tokens = [];
  for (const programId of TOKEN_PROGRAMS) for (const a of (await rpc(env, "getTokenAccountsByOwner", [address, { programId }, { encoding: "jsonParsed" }])).value || []) {
    const i = a?.account?.data?.parsed?.info, t = i?.tokenAmount;
    if (!i?.mint || !t || !(Number(t.amount) > 0)) continue;
    tokens.push({ mint: i.mint, amount: t.uiAmount ?? Number(t.amount) / 10 ** t.decimals, raw: t.amount, decimals: t.decimals });
  }
  return { sol: lamports / 1e9, lamports, tokens: tokens.slice(0, 100), source: env.HELIUS_API_KEY ? "helius" : "public rpc" };
}
export async function refresh(env) {
  const d = db(env), w = await get(d, "sol_wallet_key");
  if (!w?.address) return null;
  try { const c = { at: new Date().toISOString(), ...(await readBalances(env, w.address)) }; await set(d, "sol_wallet_cache", c); await note(d, null); return c; }
  catch (e) { await note(d, String(e.message || e).slice(0, 300)); throw e; }
}

// ---------------------------------------------------------------- limits (nothing can trade until Alex sets them)
export const WALLET_LIMIT_DEFAULTS = Object.freeze({ maxPerTradeSol: 0, maxDailyLossSol: 0, maxOpenPositions: 0, autoTrade: false });
// The server's own ceiling: the panel can set less, never more. 0.05 SOL a trade is Alex's per-click cap (AGENTS rule 26),
// 3 open is Rulebook v2 rule 10 ("one size, three positions"). Raising them is a deploy (env AQ_HARD_MAX_TRADE_SOL /
// AQ_HARD_MAX_OPEN), never a panel click. Every order path (tick, BUY MORE, Phantom signal) clamps to these again.
export const HARD_CAPS = Object.freeze({ maxPerTradeSol: 0.05, maxOpenPositions: 3 });
export function hardCaps(env = {}) {
  const t = Number(env.AQ_HARD_MAX_TRADE_SOL), o = Number(env.AQ_HARD_MAX_OPEN);
  return { maxPerTradeSol: t > 0 ? t : HARD_CAPS.maxPerTradeSol, maxOpenPositions: Number.isInteger(o) && o > 0 ? o : HARD_CAPS.maxOpenPositions };
}
// the limits as the server applies them: the panel's numbers, never above the hard caps
export const clampLimits = (lim, env = {}) => { const h = hardCaps(env); return { ...lim, maxPerTradeSol: Math.min(Number(lim.maxPerTradeSol) || 0, h.maxPerTradeSol), maxOpenPositions: Math.min(Number(lim.maxOpenPositions) || 0, h.maxOpenPositions) }; };
export function validateWalletLimits(body, current = WALLET_LIMIT_DEFAULTS, caps = HARD_CAPS) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Send the limits as fields" };
  const next = { ...WALLET_LIMIT_DEFAULTS, ...current };
  for (const [k, v] of Object.entries(body)) {
    if (!(k in WALLET_LIMIT_DEFAULTS)) return { error: `${k} is not a limit` };
    if (k === "autoTrade") { if (typeof v !== "boolean") return { error: "autoTrade must be on or off" }; next[k] = v; continue; }
    if (typeof v !== "number" || !isFinite(v) || v < 0) return { error: `${k} must be a number, 0 or more` };
    if (v > 1e6) return { error: `${k} is too large` };
    if (k === "maxOpenPositions" && !Number.isInteger(v)) return { error: "maxOpenPositions must be a whole number" };
    if (k in caps && v > caps[k]) return { error: `${k} ${v} is over the server's hard cap of ${caps[k]}${k === "maxPerTradeSol" ? " SOL a trade" : " open positions"}` };
    next[k] = k === "maxOpenPositions" ? v : Math.round(v * 1e6) / 1e6;
  }
  if (next.autoTrade && !(next.maxPerTradeSol > 0 && next.maxDailyLossSol > 0 && next.maxOpenPositions > 0)) return { error: "Auto trade needs every limit above zero first" };
  return { limits: next };
}
export async function saveWalletLimits(env, body) {
  const d = db(env), cur = { ...WALLET_LIMIT_DEFAULTS, ...((await get(d, "sol_wallet_limits")) || {}) }, r = validateWalletLimits(body, cur, hardCaps(env));
  if (r.error) return r;
  if (r.limits.autoTrade && !(await get(d, "sol_wallet_key"))?.address) return { error: "Create the wallet first" };
  await set(d, "sol_wallet_limits", r.limits);
  if (JSON.stringify(cur) !== JSON.stringify(r.limits)) await brain(d, `Aquarius wallet limits set by Alex: ${r.limits.maxPerTradeSol} SOL a trade, ${r.limits.maxDailyLossSol} SOL daily loss, ${r.limits.maxOpenPositions} open, auto trade ${r.limits.autoTrade ? "ON (flag only: live orders are not built)" : "off"}.`);
  return r;
}

// ---------------------------------------------------------------- what the panel and the route see (never the key)
export function walletPublic(S) {
  const w = S.sol_wallet_key || null, c = S.sol_wallet_cache || null;
  return { exists: !!w?.address, address: w?.address || null, createdAt: w?.createdAt || null, sol: c?.sol ?? null, tokens: c?.tokens ?? null, checkedAt: c?.at || null, source: c?.source || null,
    limits: { ...WALLET_LIMIT_DEFAULTS, ...(S.sol_wallet_limits || {}) }, lastError: S.sol_wallet_status?.lastError || null, liveOrders: true };
}
const rows = async (d) => Object.fromEntries((await d.q(`SELECT k, v FROM mob_aq_state WHERE k IN ('sol_wallet_key','sol_wallet_cache','sol_wallet_limits','sol_wallet_status')`)).map((r) => [r.k, r.v]));
export async function walletStatus(env, { fresh = false } = {}) {
  const d = db(env); let S = await rows(d);
  if (S.sol_wallet_key?.address && (fresh || !S.sol_wallet_cache || Date.now() - new Date(S.sol_wallet_cache.at).getTime() > CACHE_MS)) { try { await refresh(env); } catch {} S = await rows(d); }
  return walletPublic(S);
}
// the 5-minute timer keeps the balances fresh once the wallet exists; it can never throw into the timer
export async function walletWarm(env) { try { return (await refresh(env)) ? { read: true } : { exists: false }; } catch { return { ok: false }; } }
