// Keys live in one file beside the records, mode 600, and never leave this Mac. The signing key is generated HERE,
// so the private half is never typed, pasted, sent or shown: only the public half is shown, to paste into GMGN.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { b58decode, b58encode } from "./solana.mjs";
export class Secrets {
  constructor(dir) { this.file = path.join(dir, "secrets.json"); fs.mkdirSync(dir, { recursive: true }); this.d = this.#read(); }
  #read() { try { return JSON.parse(fs.readFileSync(this.file, "utf8")); } catch { return {}; } }
  #save() { fs.writeFileSync(this.file, JSON.stringify(this.d, null, 1), { mode: 0o600 }); try { fs.chmodSync(this.file, 0o600); } catch { /* fine */ } }
  get apiKey() { return this.d.apiKey || null; }
  get wallet() { return this.d.wallet || null; }
  get privateKeyPem() { return this.d.privateKeyPem || null; }
  get publicKeyPem() { return this.d.publicKeyPem || null; }
  ensureKeypair() {
    if (!this.d.privateKeyPem) {
      const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
      this.d.privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
      this.d.publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
      this.#save();
    }
    return this.d.publicKeyPem;
  }
  get webWallet() { return this.d.webWallet || null; }
  set({ apiKey, wallet, webWallet }) {
    if (webWallet != null) { const v = String(webWallet).trim(); if (v && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) throw new Error("That does not look like a Solana wallet address."); if (v) this.d.webWallet = v; }
    if (apiKey != null) { const v = String(apiKey).trim(); if (v && !/^[\w.\-]{8,200}$/.test(v)) throw new Error("That does not look like an API key."); if (v) this.d.apiKey = v; }
    if (wallet != null) { const v = String(wallet).trim(); if (v && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) throw new Error("That does not look like a Solana wallet address."); if (v) this.d.wallet = v; }
    this.#save();
  }
  /** Ultra's own trading wallet: made here, never shown except through the explicit backup button. */
  ensureWallet() {
    if (!this.d.walletPem) { this.d.walletPem = crypto.generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }); this.#save(); }
    return this.d.walletPem;
  }
  get walletPem() { return this.d.walletPem || null; }
  get imported() { return !!this.d.walletImported; }
  /** Alex's own wallet, plugged in once (Alex, 2026-10-29): the private key exported from GMGN, base58 (64 or 32 bytes) or a
   *  JSON byte array. Kept only in this file (mode 600) on his Mac; never sent anywhere. Any earlier key is kept, never lost. */
  importWallet(secret) {
    const t = String(secret || "").trim();
    let bytes;
    if (/^\[/.test(t)) { try { bytes = Buffer.from(JSON.parse(t)); } catch { throw new Error("That is not a private key."); } }
    else { if (!/^[1-9A-HJ-NP-Za-km-z]{43,90}$/.test(t)) throw new Error("That is not a private key. In Phantom: Settings, Manage accounts, your wallet, Show private key."); bytes = b58decode(t); }
    if (bytes.length !== 64 && bytes.length !== 32) throw new Error(`That key is ${bytes.length} bytes; a Solana private key is 64.`);
    const seed = bytes.subarray(0, 32);
    const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
    const priv = crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
    const pub = Buffer.from(priv.export({ format: "jwk" }).x, "base64url");
    if (bytes.length === 64 && !pub.equals(bytes.subarray(32))) throw new Error("That key does not match itself: copy it again from Phantom.");
    if (this.d.walletPem) (this.d.oldWalletPems ||= []).push(this.d.walletPem);
    this.d.walletPem = priv.export({ type: "pkcs8", format: "pem" }); this.d.walletImported = true; this.#save();
    return b58encode(pub);
  }
  ready() { return !!(this.apiKey && this.privateKeyPem && this.wallet); }
  masked() { return { imported: this.imported, apiKey: this.apiKey ? `${this.apiKey.slice(0, 4)}…${this.apiKey.slice(-4)}` : null, wallet: this.wallet, hasKeypair: !!this.privateKeyPem, webWallet: this.webWallet }; }
}
