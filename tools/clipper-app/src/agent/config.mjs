/*
 * ultracursor's own settings: ~/Library/Application Support/ultracursor/config.json
 * (one level above the runtime folder, which run.command refreshes from the
 * bundle on every launch, so nothing here is ever overwritten by an update).
 *
 *   configPath(work)   where it lives (env ULTRA_CONFIG overrides, for tests)
 *   loadConfig(file)   {anthropicApiKey, model, effort, maxUsdPerTask}
 *   saveKey(file, key) checks the shape and writes it with mode 600
 *
 * The API key is the only secret ultracursor keeps. It is never logged, never
 * shown back, never sent anywhere but api.anthropic.com. Site passwords are
 * never kept at all: Alex signs in himself in the Chrome window.
 */
import fs from "node:fs";
import path from "node:path";

export const DEFAULTS = { anthropicApiKey: null, model: "claude-opus-5-5", effort: "medium", maxUsdPerTask: 2 };
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

export const configPath = (work) => process.env.ULTRA_CONFIG || path.join(work, "..", "config.json");

export function loadConfig(file) {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch { raw = {}; }
  const c = { ...DEFAULTS };
  if (typeof raw.anthropicApiKey === "string" && raw.anthropicApiKey.trim()) c.anthropicApiKey = raw.anthropicApiKey.trim();
  if (typeof raw.model === "string" && /^claude-[a-z0-9-]+$/.test(raw.model)) c.model = raw.model;
  if (EFFORTS.has(raw.effort)) c.effort = raw.effort;
  const cap = Number(raw.maxUsdPerTask);
  if (isFinite(cap) && cap > 0 && cap <= 50) c.maxUsdPerTask = cap;
  return c;
}

/** Returns null when saved, else a sentence for the panel. */
export function saveKey(file, key) {
  const k = String(key || "").trim();
  if (!k) return "Paste the key first.";
  if (/\s/.test(k) || k.length < 20) return "That does not look like a Claude API key.";
  if (!/^sk-ant-/.test(k)) return "Claude API keys start with sk-ant-.";
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch { raw = {}; }
  raw.anthropicApiKey = k;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + ".tmp", JSON.stringify(raw, null, 2), { mode: 0o600 });
    fs.renameSync(file + ".tmp", file);
    fs.chmodSync(file, 0o600);
  } catch (e) {
    return `The key could not be saved: ${String(e.message).slice(0, 120)}`;
  }
  return null;
}
