/**
 * Where a key lives: a private file in the app's data folder on his Mac (mode 0600), outside the app's
 * JSON state, never in the repo. It is a plain file ON PURPOSE: the Mac keychain ties a secret to the exact
 * signature of the app that saved it, and every new build has a new signature, so keychain-stored keys were
 * silently locked out after each update. Keys saved that way by build 3 are read once (if the keychain
 * allows it) and moved into the file. The screens only ever see the last four characters.
 */
const fs = require("node:fs");
const path = require("node:path");

class Secrets {
  /** @param {string} dir  @param {object=} safe  Electron safeStorage, used only to rescue older keys  @param {string=} name */
  constructor(dir, safe, name = "runpod") { this.dir = dir; this.name = name; this.safe = safe && safe.isEncryptionAvailable && safe.isEncryptionAvailable() ? safe : null; fs.mkdirSync(dir, { recursive: true }); }
  plain() { return path.join(this.dir, this.name + ".key"); }
  enc() { return path.join(this.dir, this.name + ".key.enc"); }
  set(key) {
    const k = String(key || "").trim();
    if (!/^[A-Za-z0-9_\-]{12,}$/.test(k)) throw new Error("That does not look like a key. It is one long line of letters and numbers with no spaces.");
    this.clear();
    fs.writeFileSync(this.plain(), k, { mode: 0o600 });
    return this.tail();
  }
  get() {
    try { return fs.readFileSync(this.plain(), "utf8").trim(); } catch { /* not there yet */ }
    if (this.safe && fs.existsSync(this.enc())) {
      try { const k = this.safe.decryptString(fs.readFileSync(this.enc())); if (k) { fs.writeFileSync(this.plain(), k, { mode: 0o600 }); fs.unlinkSync(this.enc()); return k; } } catch { /* locked out: he pastes it again once */ }
    }
    return "";
  }
  tail() { const k = this.get(); return k ? "…" + k.slice(-4) : ""; }
  clear() { for (const f of [this.plain(), this.enc()]) { try { fs.unlinkSync(f); } catch {} } }
}
module.exports = { Secrets };
