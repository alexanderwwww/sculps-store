/**
 * Where the RunPod key lives: on his Mac only, outside the app's JSON state, never in the repo.
 * With macOS Keychain-backed encryption (Electron safeStorage) when available, otherwise a
 * file only he can read (mode 0600). The screens only ever see the last four characters.
 */
const fs = require("node:fs");
const path = require("node:path");

class Secrets {
  /** @param {string} dir  @param {{isEncryptionAvailable():boolean, encryptString(s:string):Buffer, decryptString(b:Buffer):string}=} safe */
  constructor(dir, safe) { this.dir = dir; this.safe = safe && safe.isEncryptionAvailable && safe.isEncryptionAvailable() ? safe : null; fs.mkdirSync(dir, { recursive: true }); }
  file() { return path.join(this.dir, this.safe ? "runpod.key.enc" : "runpod.key"); }
  set(key) {
    const k = String(key || "").trim();
    if (!/^[A-Za-z0-9_\-]{12,}$/.test(k)) throw new Error("That does not look like a RunPod key. It is one long line of letters and numbers (rpa_…).");
    this.clear();
    fs.writeFileSync(this.file(), this.safe ? this.safe.encryptString(k) : k, { mode: 0o600 });
    return this.tail();
  }
  get() {
    try { const raw = fs.readFileSync(this.file()); return this.safe ? this.safe.decryptString(raw) : raw.toString("utf8").trim(); } catch { return ""; }
  }
  tail() { const k = this.get(); return k ? "…" + k.slice(-4) : ""; }
  clear() { for (const f of ["runpod.key", "runpod.key.enc"]) { try { fs.unlinkSync(path.join(this.dir, f)); } catch {} } }
}
module.exports = { Secrets };
