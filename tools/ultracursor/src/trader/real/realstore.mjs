/**
 * Where the real trader writes (build 41), <traderDir>/real/:
 *   real.jsonl   the write-ahead log: one line per money step, appended and fsynced BEFORE the
 *                step's side effect (a card, a click, a sell), so a crash at any point leaves a
 *                record of what was about to happen
 *   real.json    the snapshot: tmp + fsync + rename, so it is either the old file or the new one
 *   real.lock    the pid of the one ultracursor that may spend; a second instance runs the sim only
 *   probe.json   the last probe report (and the reports before it, by hash)
 * No secret of any kind is ever written here: the wallet is a public address.
 */
import fs from "node:fs";
import path from "node:path";

export class RealStore {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.wal = path.join(dir, "real.jsonl");
    this.file = path.join(dir, "real.json");
    this.lockFile = path.join(dir, "real.lock");
    this.probeFile = path.join(dir, "probe.json");
    this.locked = false;
  }

  /** One WAL line, on disk before this returns. */
  append(ev) {
    const fd = fs.openSync(this.wal, "a");
    try { fs.writeSync(fd, JSON.stringify(ev) + "\n"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }

  /** Atomic snapshot: a reader sees the old file or the new one, never half of one. */
  save(obj, file = this.file) {
    const tmp = `${file}.${process.pid}.tmp`;
    const fd = fs.openSync(tmp, "w");
    try { fs.writeSync(fd, JSON.stringify(obj)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, file);
    try { const d = fs.openSync(this.dir, "r"); try { fs.fsyncSync(d); } finally { fs.closeSync(d); } } catch { /* a dir fsync is not possible everywhere */ }
  }

  /** -> {state} | {state: null} (first run) | {error} (corrupt or unknown v: the file is kept). */
  load(file = this.file, v = 1) {
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { return { state: null }; }
    let j;
    try { j = JSON.parse(text); } catch { return { error: `${path.basename(file)} is corrupt (kept as it is)` }; }
    if (!j || typeof j !== "object" || j.v !== v) return { error: `${path.basename(file)} has an unknown version (kept as it is)` };
    return { state: j };
  }

  /** Every WAL line (a torn last line from a crash mid-write is skipped). */
  lines() {
    let text = "";
    try { text = fs.readFileSync(this.wal, "utf8"); } catch { return []; }
    const out = [];
    for (const l of text.split("\n")) { if (!l.trim()) continue; try { out.push(JSON.parse(l)); } catch { /* torn line */ } }
    return out;
  }

  /** Take real.lock. A live pid that is not ours keeps it. */
  lock(pid = process.pid) {
    try { fs.writeFileSync(this.lockFile, String(pid), { flag: "wx" }); this.locked = true; return true; } catch { /* exists */ }
    let other = 0;
    try { other = Number(fs.readFileSync(this.lockFile, "utf8").trim()) || 0; } catch { other = 0; }
    if (other && other !== pid && alive(other)) return false;
    fs.writeFileSync(this.lockFile, String(pid));
    this.locked = true;
    return true;
  }
  unlock(pid = process.pid) {
    try { if (Number(fs.readFileSync(this.lockFile, "utf8").trim()) === pid) fs.unlinkSync(this.lockFile); } catch { /* gone */ }
    this.locked = false;
  }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}
