// Just enough Solana to hold one wallet and swap through Jupiter: no packages. Every format here is the wire format
// described in Solana's docs and checked against the real chain's own simulator in test/chain-check.mjs.
import crypto from "node:crypto";
const A58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58encode(buf) {
  let n = BigInt("0x" + (Buffer.from(buf).toString("hex") || "0")), s = "";
  while (n > 0n) { s = A58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b === 0) s = "1" + s; else break; }
  return s;
}
export function b58decode(str) {
  let n = 0n; for (const c of str) { const i = A58.indexOf(c); if (i < 0) throw new Error("bad base58"); n = n * 58n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = "0" + hex;
  const body = n === 0n ? Buffer.alloc(0) : Buffer.from(hex, "hex");
  let z = 0; for (const c of str) { if (c === "1") z++; else break; }
  return Buffer.concat([Buffer.alloc(z), body]);
}
const shortvecRead = (b, o) => { let v = 0, shift = 0, i = o; for (;;) { const x = b[i++]; v |= (x & 0x7f) << shift; if (!(x & 0x80)) break; shift += 7; } return [v, i - o]; };
const shortvecWrite = (n) => { const out = []; for (;;) { const x = n & 0x7f; n >>= 7; if (n) out.push(x | 0x80); else { out.push(x); break; } } return Buffer.from(out); };

/** An Ed25519 wallet from a PKCS8 PEM (what Secrets stores). */
export function walletFromPem(pem) {
  const priv = crypto.createPrivateKey(pem);
  const jwk = priv.export({ format: "jwk" });
  const seed = Buffer.from(jwk.d, "base64url"), pub = Buffer.from(jwk.x, "base64url");
  return {
    publicKey: pub, address: b58encode(pub),
    /** the 64-byte secret key (seed + public) in base58: what Phantom and Solflare import */
    secretKeyBase58: b58encode(Buffer.concat([seed, pub])),
    sign: (message) => crypto.sign(null, Buffer.from(message), priv),
  };
}

/** Sign a base64 transaction that Jupiter built with our address as fee payer. Refuses anything that is not exactly that. */
export function signSwapTransaction(base64Tx, wallet) {
  const tx = Buffer.from(base64Tx, "base64");
  const [nSig, w] = shortvecRead(tx, 0);
  if (nSig !== 1) throw new Error(`expected 1 signature slot, found ${nSig}`);
  const msgStart = w + 64 * nSig;
  let o = msgStart; const versioned = (tx[o] & 0x80) !== 0; if (versioned) o += 1;
  const required = tx[o];
  if (required !== 1) throw new Error(`the transaction needs ${required} signers, expected only us`);
  o += 3;
  const [nKeys, kw] = shortvecRead(tx, o); o += kw;
  if (!tx.subarray(o, o + 32).equals(wallet.publicKey)) throw new Error("our wallet is not the fee payer of this transaction");
  const sig = wallet.sign(tx.subarray(msgStart));
  sig.copy(tx, w);
  return { tx, signature: b58encode(sig) };
}

/** Close an empty token account and send its rent back to the owner. Legacy transaction, instruction 9 of the token program. */
export function buildCloseAccountTx({ wallet, tokenAccount, tokenProgram, blockhash }) {
  const keys = [wallet.publicKey, b58decode(tokenAccount), b58decode(tokenProgram)];
  const msg = Buffer.concat([
    Buffer.from([1, 0, 1]), shortvecWrite(3), ...keys, b58decode(blockhash),
    shortvecWrite(1), Buffer.from([2]), shortvecWrite(3), Buffer.from([1, 0, 0]), shortvecWrite(1), Buffer.from([9]),
  ]);
  const sig = wallet.sign(msg);
  return { tx: Buffer.concat([shortvecWrite(1), sig, msg]), signature: b58encode(sig) };
}

/** SOL out of the wallet: system program, instruction 2 (transfer). Legacy transaction, the owner is the fee payer. */
export function buildTransferTx({ wallet, to, lamports, blockhash }) {
  const data = Buffer.alloc(12); data.writeUInt32LE(2, 0); data.writeBigUInt64LE(BigInt(lamports), 4);
  const keys = [wallet.publicKey, b58decode(to), Buffer.alloc(32)];
  const msg = Buffer.concat([Buffer.from([1, 0, 1]), shortvecWrite(3), ...keys, b58decode(blockhash), shortvecWrite(1), Buffer.from([2]), shortvecWrite(2), Buffer.from([0, 1]), shortvecWrite(12), data]);
  const sig = wallet.sign(msg);
  return { tx: Buffer.concat([shortvecWrite(1), sig, msg]), signature: b58encode(sig) };
}

const ENDPOINTS = ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export class Rpc {
  constructor({ fetchImpl = fetch, endpoints = ENDPOINTS, wait = sleep } = {}) { Object.assign(this, { fetchImpl, endpoints, wait }); }
  async call(method, params = []) {
    let last;
    for (const url of this.endpoints) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await this.fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15000) });
          if (r.status === 429) { await this.wait(1500 * (attempt + 1)); continue; }
          const j = await r.json();
          if (j.error) { const e = new Error(`${method}: ${j.error.message}`); e.rpc = j.error; throw e; }
          return j.result;
        } catch (e) { last = e; if (e.rpc) throw e; }
      }
    }
    throw new Error(`${method}: ${last?.message || "unreachable"}`);
  }
  async solBalance(address) { return (await this.call("getBalance", [address, { commitment: "confirmed" }])).value / 1e9; }
  async latestBlockhash() { const r = (await this.call("getLatestBlockhash", [{ commitment: "confirmed" }])).value; return { blockhash: r.blockhash, lastValidBlockHeight: r.lastValidBlockHeight }; }
  async blockHeight() { return this.call("getBlockHeight", [{ commitment: "confirmed" }]); }
  async send(tx) { return this.call("sendTransaction", [Buffer.from(tx).toString("base64"), { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 3 }]); }
  async status(signature) {
    const v = (await this.call("getSignatureStatuses", [[signature], { searchTransactionHistory: true }])).value[0];
    if (!v) return { state: "unknown" };
    if (v.err) return { state: "failed", err: JSON.stringify(v.err) };
    return { state: v.confirmationStatus === "confirmed" || v.confirmationStatus === "finalized" ? "confirmed" : "pending" };
  }
  /** What this transaction really did to the fee payer's SOL, fees included, read from the chain. null if not indexed yet. */
  async netLamports(signature) {
    for (let i = 0; i < 4; i++) {
      const t = await this.call("getTransaction", [signature, { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]).catch(() => null);
      if (t?.meta && !t.meta.err) { (this.fees ??= new Map()).set(signature, t.meta.fee ?? null); if (this.fees.size > 200) this.fees.delete(this.fees.keys().next().value); return t.meta.postBalances[0] - t.meta.preBalances[0]; }
      await this.wait(800);
    }
    return null;
  }
  /** The network fee (lamports) of a transaction netLamports already read; null when unknown. Read-only. */
  feeOf(signature) { return this.fees?.get(signature) ?? null; }
  /** The mint as the chain sees it (read-only): owning program, Token-2022 extensions, freeze authority. Field names checked live on PYUSD 2026-10-30. */
  async mintInfo(mint) {
    const r = await this.call("getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }]);
    const v = r?.value; if (!v) throw new Error("mint not found");
    const info = v.data?.parsed?.info || {};
    return { program: v.owner, extensions: info.extensions || [], freezeAuthority: info.freezeAuthority ?? null, mintAuthority: info.mintAuthority ?? null };
  }
  /** Every account of this owner holding `mint`: [{pubkey, program, raw: BigInt, decimals}] */
  async tokenAccounts(owner, mint) {
    const q = (f) => this.call("getTokenAccountsByOwner", [owner, f, { encoding: "jsonParsed", commitment: "confirmed" }]);
    const r = mint ? await q({ mint }) : { value: [...(await q({ programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" })).value, ...(await q({ programId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" })).value] };
    return r.value.map((a) => ({ pubkey: a.pubkey, program: a.account.owner, raw: BigInt(a.account.data.parsed.info.tokenAmount.amount), decimals: a.account.data.parsed.info.tokenAmount.decimals }));
  }
}

export class Jupiter {
  constructor({ fetchImpl = fetch, base = "https://lite-api.jup.ag/swap/v1", wait = sleep } = {}) { Object.assign(this, { fetchImpl, base, wait }); }
  async #go(path, init) {
    for (let i = 0; i < 5; i++) {
      const r = await this.fetchImpl(this.base + path, { ...init, signal: AbortSignal.timeout(20000) });
      if (r.status === 429) { await this.wait(1200 * (i + 1)); continue; }
      const text = await r.text(); let j; try { j = JSON.parse(text); } catch { throw new Error(`jupiter ${path}: HTTP ${r.status}, not JSON`); }
      if (!r.ok || j.error || j.errorCode) throw new Error(`jupiter ${path}: ${j.error || j.message || `HTTP ${r.status}`}`);
      return j;
    }
    throw new Error(`jupiter ${path}: rate limited`);
  }
  quote({ input, output, amount, slippageBps }) { return this.#go(`/quote?inputMint=${input}&outputMint=${output}&amount=${amount}&slippageBps=${slippageBps}`); }
  swap({ quote, user, maxFeeLamports, priorityLevel = "medium" }) {
    return this.#go("/swap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      quoteResponse: quote, userPublicKey: user, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: maxFeeLamports, priorityLevel } },
    }) });
  }
}
