// Write-ahead journal: every decision is on disk BEFORE it is acted on, and state is rebuilt from it on start.
// This is the fix for ultracursor's lost position: nothing lives only in memory.
import fs from "node:fs";
import path from "node:path";
export class Journal {
  constructor(file) { this.file = file; fs.mkdirSync(path.dirname(file), { recursive: true }); }
  write(ev) { fs.appendFileSync(this.file, JSON.stringify({ at: Date.now(), ...ev }) + "\n"); }
  /** -> { open: Map(id -> position), closed: [], intents: [] } */
  replay() {
    const open = new Map(), closed = [], pending = new Map(), shadow = [];
    if (!fs.existsSync(this.file)) return { open, closed, pending, shadow };
    for (const line of fs.readFileSync(this.file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.type === "shadow-close") shadow.push(e);
      else if (e.type === "intent") pending.set(e.id, e);
      else if (e.type === "open") { pending.delete(e.id); open.set(e.id, e); }
      else if (e.type === "fail") pending.delete(e.id);
      else if (e.type === "close") { const o = open.get(e.id); open.delete(e.id); closed.push({ ...(o || {}), ...e }); }
    }
    return { open, closed, pending, shadow };
  }
}
