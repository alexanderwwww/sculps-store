/*
 * Site profiles: everything the agent knows about one site lives in one JSON
 * file in profiles/, never in the code. Adding a site = adding a file.
 *
 *   loadProfiles(dir) -> { forUrl(url), all, byName(name) }
 *   render(profile)   -> the profile as text for the first message
 *
 * A profile is matched by hostname suffix ("shop.example" matches www.shop.example).
 * Unmatched sites get _default.json. Every profile is laid over _default, so a
 * site only states what is different (limits, pacing, voice, words).
 */
import fs from "node:fs";
import path from "node:path";

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}

const BUILTIN_DEFAULT = {
  name: "default",
  match: [],
  about: "",
  voice: [],
  notes: [],
  finalWords: [],
  priceWords: [],
  login: { urlPatterns: [] },
  limits: { stepsPerTask: 80, tasksPerHour: 20, finalPerHour: 15, finalPerDay: 60 },
  pacing: { minMs: 900, maxMs: 2600, typeMinMs: 40, typeMaxMs: 120 },
};

export function loadProfiles(dir, log = () => {}) {
  let base = BUILTIN_DEFAULT;
  const list = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort(); } catch { files = []; }
  for (const f of files) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      if (f === "_default.json") base = merge(BUILTIN_DEFAULT, p);
      else list.push({ file: f, raw: p });
    } catch (e) {
      log(`profile ${f} could not be read: ${String(e.message).slice(0, 120)}`);
    }
  }
  const all = list.map(({ file, raw }) => merge(base, { ...raw, name: raw.name || file.replace(/\.json$/, "") }));
  const forUrl = (url) => {
    let host = "";
    try { host = new URL(url).hostname.toLowerCase(); } catch { host = ""; }
    for (const p of all) {
      for (const m of p.match || []) {
        const s = String(m).toLowerCase().replace(/^\./, "");
        if (host === s || host.endsWith("." + s)) return p;
      }
    }
    return base;
  };
  return { forUrl, all, base, byName: (n) => all.find((p) => p.name === n) || null };
}

export function render(p) {
  if (!p) return "(no site profile)";
  const out = [`Site profile: ${p.name}`];
  if (p.about) out.push(`About: ${p.about}`);
  if (p.brand) out.push(`Shop / brand name: ${p.brand}`);
  if (p.signature) out.push(`Sign messages to people as: ${p.signature}`);
  if (Array.isArray(p.voice) && p.voice.length) out.push("Voice:", ...p.voice.map((v) => `- ${v}`));
  if (Array.isArray(p.notes) && p.notes.length) out.push("Know-how:", ...p.notes.map((v) => `- ${v}`));
  return out.join("\n");
}
