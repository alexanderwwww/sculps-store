// Keys live in one file beside the records, mode 600, and never leave this Mac. The signing key is generated HERE,
// so the private half is never typed, pasted, sent or shown: only the public half is shown, to paste into GMGN.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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
  set({ apiKey, wallet }) {
    if (apiKey != null) { const v = String(apiKey).trim(); if (v && !/^[\w.\-]{8,200}$/.test(v)) throw new Error("That does not look like an API key."); if (v) this.d.apiKey = v; }
    if (wallet != null) { const v = String(wallet).trim(); if (v && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) throw new Error("That does not look like a Solana wallet address."); if (v) this.d.wallet = v; }
    this.#save();
  }
  ready() { return !!(this.apiKey && this.privateKeyPem && this.wallet); }
  masked() { return { apiKey: this.apiKey ? `${this.apiKey.slice(0, 4)}…${this.apiKey.slice(-4)}` : null, wallet: this.wallet, hasKeypair: !!this.privateKeyPem }; }
}
