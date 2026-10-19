/*
 * Every action, written down: one JSON line per event in
 * <WORK>/logs/agent-YYYY-MM-DD.jsonl (on his Mac, never uploaded whole), and a
 * short line to the control-plane log so Claude can follow along.
 *
 *   createActionLog(dir, cloudLog) -> write({task, step, kind, ...})
 *
 * kinds: task (start/end), model (one response: tokens, $), action (tool,
 * input, target, result), approval (card, choice), wall, error, limit.
 * Typed text is logged as typed (it is his own listing copy and replies);
 * anything typed into a secret field is refused before it gets here.
 */
import fs from "node:fs";
import path from "node:path";

export function createActionLog(dir, cloudLog = () => {}) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* logged below on first write */ }
  let warned = false;
  return function write(entry) {
    const e = { at: new Date().toISOString(), ...entry };
    const file = path.join(dir, `agent-${e.at.slice(0, 10)}.jsonl`);
    try { fs.appendFileSync(file, JSON.stringify(e) + "\n"); }
    catch (err) { if (!warned) { warned = true; cloudLog(`action log not writable: ${String(err.message).slice(0, 120)}`); } }
    const short = shortLine(e);
    if (short) cloudLog(short);
    return e;
  };
}

function shortLine(e) {
  const t = e.task ? `[${String(e.task).slice(0, 8)}]` : "";
  switch (e.kind) {
    case "task": return `agent ${t} ${e.event}: ${String(e.text || e.summary || "").slice(0, 160)}`;
    case "action": return `agent ${t} #${e.step} ${e.tool}${e.target ? ` ${e.target}` : ""} -> ${e.ok ? "ok" : `no: ${String(e.error || "").slice(0, 100)}`}`;
    case "approval": return `agent ${t} #${e.step} approval ${e.title}: ${e.choice}`;
    case "wall": return `agent ${t} ${e.event} ${e.wall}: ${e.reason || ""}`;
    case "error": case "limit": return `agent ${t} ${e.kind}: ${String(e.text || "").slice(0, 160)}`;
    default: return null;
  }
}
