// Ultra's one secret, in one file beside the records, mode 600, and it never leaves this Mac:
// the Phantom wallet key Alex pastes once. Never shown, never sent, never logged.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { b58decode, b58encode } from "./solana.mjs";
export class Secrets {
  constructor(dir) { this.file = path.join(dir, "secrets.json"); fs.mkdirSync(dir, { recursive: true }); this.d = this.#read(); }
  #read() { try { return JSON.parse(fs.readFileSync(this.file, "utf8")); } catch { return {}; } }
  #save() { fs.writeFileSync(this.file, JSON.stringify(this.d, null, 1), { mode: 0o600 }); try { fs.chmodSync(this.file, 0o600); } catch { /* fine */ } }
  get walletPem() { return this.d.walletImported ? this.d.walletPem || null : null; }
  get imported() { return !!(this.d.walletImported && this.d.walletPem); }
  /** Alex's own wallet, plugged in once (Alex, 2026-10-29): the private key exported from Phantom, base58 (64 or 32 bytes) or a
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
}
