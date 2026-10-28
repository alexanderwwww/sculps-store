/**
 * The real wallet, READ ONLY (build 41). It holds a public address and nothing else: no signing
 * material exists anywhere in ultracursor. Every number comes from Solana JSON-RPC over fetch
 * (ULTRA_SOLANA_RPC, default the public mainnet endpoint).
 *
 * Shapes read on 2026-10-20 from api.mainnet-beta.solana.com (test/fixtures/solana/):
 *   getBalance            {value: lamports}
 *   getTokenAccountsByOwner (jsonParsed)  value[].account.data.parsed.info.tokenAmount
 *                         {amount: "raw string", decimals, uiAmount (null when 0!), uiAmountString}
 *   getSignaturesForAddress  [{signature, blockTime (s), confirmationStatus, err}]
 *   getTransaction (jsonParsed)  meta {fee, err, preBalances, postBalances, pre/postTokenBalances
 *                         [{accountIndex, mint, owner, uiTokenAmount}]}, accountKeys [{pubkey, signer}]
 * Version 1 transactions are on mainnet now: a getTransaction without
 * maxSupportedTransactionVersion 1 is answered with error -32015, so every read asks for 1.
 */
export const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
export const WSOL = "So11111111111111111111111111111111111111112";
const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];
const LAMPORTS = 1e9;

export const isAddr = (s) => typeof s === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

/** "7xKX…9fQa" (or "7xKX...9fQa") is this address; a full address must be equal. */
export function addrMatch(label, addr) {
  if (!isAddr(addr) || typeof label !== "string") return false;
  const t = label.trim();
  if (t === addr) return true;
  const m = /^([1-9A-HJ-NP-Za-km-z]{3,8})\s*(?:…|\.{2,3})\s*([1-9A-HJ-NP-Za-km-z]{3,8})$/.exec(t);
  return !!m && addr.startsWith(m[1]) && addr.endsWith(m[2]);
}
export const short = (a) => (typeof a === "string" && a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : String(a || ""));

/** Raw token amounts are strings (u64); add them without losing digits. */
const rawSum = (xs) => xs.reduce((s, x) => s + BigInt(x || "0"), 0n);
const ui = (raw, decimals) => Number(raw) / 10 ** (decimals || 0);

export class Wallet {
  constructor({ address, rpc = process.env.ULTRA_SOLANA_RPC || DEFAULT_RPC, fetchFn = fetch, timeoutMs = 8000 } = {}) {
    if (!isAddr(address)) throw new Error("wallet: not a Solana address");
    this.address = address; this.rpc = rpc; this.fetchFn = fetchFn; this.timeoutMs = timeoutMs;
    this.calls = 0; this.errors = 0;
  }

  async #call(method, params) {
    this.calls++;
    const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(this.timeoutMs) : undefined;
    let j;
    try {
      const r = await this.fetchFn(this.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: this.calls, method, params }), signal });
      j = await r.json();
      if (!r.ok && !j) throw new Error(`rpc ${method} -> ${r.status}`);
    } catch (e) { this.errors++; throw new Error(`rpc ${method}: ${String(e.message || e).slice(0, 120)}`); }
    if (j && j.error) { this.errors++; throw new Error(`rpc ${method}: ${j.error.code} ${String(j.error.message).slice(0, 120)}`); }
    return j ? j.result : null;
  }

  /** SOL in the wallet (confirmed). */
  async solBalance() {
    const r = await this.#call("getBalance", [this.address, { commitment: "confirmed" }]);
    const v = Number(r && r.value);
    if (!Number.isFinite(v)) throw new Error("rpc getBalance: no value");
    return v / LAMPORTS;
  }

  /** This coin in the wallet: {raw (string), ui, decimals}. No account means 0. */
  async tokenBalance(mint) {
    const r = await this.#call("getTokenAccountsByOwner", [this.address, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }]);
    const accts = (r && r.value) || [];
    const amts = accts.map((a) => a.account?.data?.parsed?.info?.tokenAmount).filter(Boolean);
    const decimals = amts.length ? Number(amts[0].decimals) || 0 : 0;
    const raw = rawSum(amts.map((t) => t.amount)).toString();
    return { raw, ui: ui(raw, decimals), decimals };
  }

  /** Every coin the wallet holds, on both token programs: [{mint, raw, ui, decimals}]. */
  async tokens() {
    const all = new Map();
    for (const programId of TOKEN_PROGRAMS) {
      const r = await this.#call("getTokenAccountsByOwner", [this.address, { programId }, { encoding: "jsonParsed", commitment: "confirmed" }]);
      for (const a of (r && r.value) || []) {
        const info = a.account?.data?.parsed?.info;
        if (!info || !info.tokenAmount) continue;
        const o = all.get(info.mint) || { mint: info.mint, raw: "0", decimals: Number(info.tokenAmount.decimals) || 0 };
        o.raw = (BigInt(o.raw) + BigInt(info.tokenAmount.amount || "0")).toString();
        all.set(info.mint, o);
      }
    }
    return [...all.values()].filter((t) => t.raw !== "0").map((t) => ({ ...t, ui: ui(t.raw, t.decimals) }));
  }

  /** The newest signatures on the wallet: [{sig, at (ms), status, err}]. */
  async recentSigs(limit = 10) {
    const r = await this.#call("getSignaturesForAddress", [this.address, { limit, commitment: "confirmed" }]);
    return (r || []).map((s) => ({ sig: s.signature, at: s.blockTime ? s.blockTime * 1000 : null, status: s.confirmationStatus || null, err: s.err || null }));
  }

  /**
   * What one transaction did to this wallet, from its pre/post balances:
   * {sig, at, ok, feeSol, solDelta (SOL, signed, the fee included, wrapped SOL counted), tokenDelta, mint}
   */
  async txFill(sig, mint = null) {
    const t = await this.#call("getTransaction", [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1, commitment: "confirmed" }]);
    if (!t || !t.meta) return null;
    const keys = (t.transaction?.message?.accountKeys || []).map((k) => (typeof k === "string" ? k : k.pubkey));
    const i = keys.indexOf(this.address);
    const lam = i >= 0 ? (Number(t.meta.postBalances[i]) - Number(t.meta.preBalances[i])) / LAMPORTS : 0;
    const tok = (list, m) => { const xs = (list || []).filter((b) => b.owner === this.address && b.mint === m); return { raw: rawSum(xs.map((b) => b.uiTokenAmount?.amount)), dec: xs.length ? Number(xs[0].uiTokenAmount?.decimals) || 0 : 0 }; };
    const d = (m) => { const a = tok(t.meta.preTokenBalances, m), b = tok(t.meta.postTokenBalances, m); return ui((b.raw - a.raw).toString(), b.dec || a.dec); };
    return {
      sig, at: t.blockTime ? t.blockTime * 1000 : null, ok: t.meta.err === null || t.meta.err === undefined,
      feeSol: Number(t.meta.fee || 0) / LAMPORTS,
      solDelta: lam + d(WSOL),
      tokenDelta: mint ? d(mint) : null, mint,
    };
  }
}
