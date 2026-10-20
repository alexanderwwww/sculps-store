/*
 * The trader's memory. Used only by the trader; survives restarts and every
 * training session ("Sniper XYZ" nights become knowledge).
 *
 * Lives in runtime/trader/memory/ (gitignored; ULTRA_TRADER_DIR overrides the
 * runtime/trader part):
 *   journal.jsonl   every decision the brain made (taken or skipped), with its
 *                   features and reason; outcomes are joined by decision id
 *   trades.jsonl    every closed trade with features, tools and outcome
 *   days.jsonl      one summary per day (date, trades, p, P&L, u, rung,
 *                   recoveries, best / worst setup)
 *   lessons.jsonl   rule adjustments with date and evidence (applied only when
 *                   p over 13, 21 and 34 trades all agree)
 *   brain.json      learned statistics, the gut-feel model, tool usefulness,
 *                   the current strictness
 *   tools-map.json  every GMGN / X / Jupiter tool: endpoint, what it returns,
 *                   latency, reliability (measured on every call)
 *   .trader-on      heartbeat while the trader runs (the panel orb reads it)
 *
 * The gut feel can raise or lower CONVICTION (the order fire candidates are
 * taken in, and a veto below 38.2 once it has evidence). It never opens the
 * gate, never makes a NO a yes, and never touches size: size is the phi ladder
 * in book.mjs alone.
 *
 * Cloud mirror: exportSnapshot() writes one compact JSON; syncToR2() puts it in
 * R2 bucket gardenbuddy-media as trader-memory-latest.json and
 * trader-memory-YYYY-MM-DD.json with `npx wrangler r2 object put --remote`
 * from the repo root (needs CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID,
 * from .dev.vars). On start, a memory folder with no brain.json is filled from
 * the latest R2 snapshot when that works.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { V2, pWindows } from "./fib.mjs";
import { TOOLS } from "./tools-map.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "..", "..", "..", "..");
export const traderDir = () => process.env.ULTRA_TRADER_DIR || path.resolve(HERE, "..", "..", "runtime", "trader");
export const memoryDir = (d = traderDir()) => path.join(d, "memory");
const FILES = ["journal.jsonl", "trades.jsonl", "days.jsonl", "lessons.jsonl", "brain.json", "tools-map.json"];
const STRICT = [38.2, 50, 61.8];   // the gut veto line moves only along this ladder

/** Beta(1,1) posterior mean. */
const post = (w, n) => (w + 1) / (n + 2);

/** Feature buckets the gut learns on. Every bucket edge is a Fibonacci number or ratio. */
export function buckets(f = {}) {
  const b = {};
  const cut = (x, edges) => { if (x === null || x === undefined || !isFinite(x)) return null; let i = 0; while (i < edges.length && x >= edges[i]) i++; return i === 0 ? `<${edges[0]}` : i === edges.length ? `>=${edges[edges.length - 1]}` : `${edges[i - 1]}-${edges[i]}`; };
  b.ageMin = cut(f.ageMin, [21, 55, 144, 233]);
  b.liqK = cut(f.liqK, [34, 55, 89, 144]);
  b.top10 = cut(f.top10Pct, [8, 13, 21]);
  b.smart = cut(f.smart, [2, 3, 5, 8, 13]);
  b.N = cut(f.N, [38.2, 61.8, 78.6]);
  b.conf = f.confluence === undefined ? null : `${f.confluence}/5`;
  b.hour = f.hour === undefined ? null : `h${String(f.hour).padStart(2, "0")}`;
  b.theme = f.theme || null;
  b.cost = cut(f.costRtPct, [1.46, 2.36, 3.82]);
  for (const k of Object.keys(b)) if (b[k] === null) delete b[k];
  return b;
}

export class Memory {
  constructor({ dir = memoryDir(), now = () => Date.now() } = {}) {
    this.dir = dir;
    this.now = now;
    fs.mkdirSync(dir, { recursive: true });
    this.brain = this.#readJSON("brain.json") || { v: 1, gut: {}, tools: {}, byHour: {}, byTheme: {}, strictness: STRICT[0], trades: 0, created: new Date(now()).toISOString() };
    this.toolsMap = this.#readJSON("tools-map.json") || {};
    for (const [k, t] of Object.entries(TOOLS)) this.toolsMap[k] = { ...t, ...(this.toolsMap[k] || {}), endpoint: t.endpoint, returns: t.returns, kind: t.kind };
    this.recent = this.#readLines("trades.jsonl").map((t) => ({ won: t.won }));
    this.seq = this.#readLines("journal.jsonl").length;
  }

  // ---- files ---------------------------------------------------------------
  #p(f) { return path.join(this.dir, f); }
  #readJSON(f) { try { return JSON.parse(fs.readFileSync(this.#p(f), "utf8")); } catch { return null; } }
  #readLines(f) { try { return fs.readFileSync(this.#p(f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } }
  #append(f, o) { fs.appendFileSync(this.#p(f), JSON.stringify(o) + "\n"); }
  save() {
    const w = (f, o) => { fs.writeFileSync(this.#p(f) + ".tmp", JSON.stringify(o)); fs.renameSync(this.#p(f) + ".tmp", this.#p(f)); };
    w("brain.json", this.brain);
    w("tools-map.json", this.toolsMap);
  }
  bytes() {
    let n = 0;
    for (const f of FILES) { try { n += fs.statSync(this.#p(f)).size; } catch { /* not yet */ } }
    return n;
  }
  journalLines() { return this.#readLines("journal.jsonl"); }
  tradesAll() { return this.#readLines("trades.jsonl"); }
  days() { return this.#readLines("days.jsonl"); }
  lessons() { return this.#readLines("lessons.jsonl"); }

  // ---- journal ---------------------------------------------------------------
  /** Every decision, with its features and reason. Returns its id. */
  journal(d) {
    const id = `d${++this.seq}`;
    this.#append("journal.jsonl", { id, at: new Date(this.now()).toISOString(), ...d });
    return id;
  }

  // ---- tools map: latency and reliability, from every call -------------------
  onCall({ tool, ms, ok, error }) {
    const k = Object.keys(TOOLS).find((x) => TOOLS[x].match && TOOLS[x].match(tool)) || tool;
    const t = this.toolsMap[k] || (this.toolsMap[k] = { endpoint: tool, returns: "(unmapped)", kind: "unknown" });
    t.calls = (t.calls || 0) + 1;
    t.ok = (t.ok || 0) + (ok ? 1 : 0);
    t.reliability = +(t.ok / t.calls).toFixed(4);
    t.latencyMs = t.latencyMs === undefined ? ms : Math.round(t.latencyMs * 0.8 + ms * 0.2);   // moving average
    if (!ok) t.lastError = error;
    t.lastAt = new Date(this.now()).toISOString();
  }

  // ---- the gut ---------------------------------------------------------------
  /** 0-100 conviction from what past trades with the same feature buckets did. 50 with no evidence. */
  gut(features) {
    const b = buckets(features);
    let sw = 0, s = 0, n = 0;
    const parts = {};
    for (const [k, v] of Object.entries(b)) {
      const g = this.brain.gut[`${k}=${v}`];
      if (!g || !g.n) continue;
      const w = g.n / (g.n + 13);        // shrink toward 50 until a bucket has evidence
      const pm = post(g.w, g.n);
      parts[`${k}=${v}`] = { n: g.n, p: +pm.toFixed(3), w: +w.toFixed(3) };
      sw += w; s += w * pm; n += g.n;
    }
    // a prior of weight 1 at 50%: no evidence = 50, evidence pulls it toward what happened
    const score = 100 * (s + 0.5) / (sw + 1);
    return { score: +score.toFixed(1), evidence: n, parts };
  }
  /** Conviction may veto a FIRE (never create one): with evidence, a score under the strictness line says NO. */
  gutVeto(g) { return g.evidence >= 13 && g.score < this.brain.strictness; }

  // ---- after every closed trade --------------------------------------------
  onTrade(t) {
    const rec = { at: new Date(this.now()).toISOString(), id: t.id, symbol: t.symbol, addr: t.addr, won: t.won, pnl: t.pnl, ret: t.ret, reason: t.reason, costs: t.costs, fBefore: t.fBefore, fAfter: t.fAfter, decision: t.decision, features: t.features, tools: t.tools };
    this.#append("trades.jsonl", rec);
    this.recent.push({ won: t.won });
    this.brain.trades++;
    for (const [k, v] of Object.entries(buckets(t.features || {}))) {
      const g = this.brain.gut[`${k}=${v}`] || (this.brain.gut[`${k}=${v}`] = { w: 0, n: 0 });
      g.n++; if (t.won) g.w++;
    }
    const hour = t.features?.hour;
    if (hour !== undefined) { const h = this.brain.byHour[hour] || (this.brain.byHour[hour] = { w: 0, n: 0 }); h.n++; if (t.won) h.w++; }
    const theme = t.features?.theme;
    if (theme) { const h = this.brain.byTheme[theme] || (this.brain.byTheme[theme] = { w: 0, n: 0 }); h.n++; if (t.won) h.w++; }
    // which tools' signals were present on this trade, and did it win
    for (const tool of t.tools || []) { const u = this.brain.tools[tool] || (this.brain.tools[tool] = { w: 0, n: 0 }); u.n++; if (t.won) u.w++; }
    const lesson = this.#lesson();
    this.save();
    return lesson;
  }

  stats() {
    const p = pWindows(this.recent);
    const n = this.recent.length;
    return { trades: n, p: n ? this.recent.filter((t) => t.won).length / n : null, ...p, strictness: this.brain.strictness, byHour: this.brain.byHour, byTheme: this.brain.byTheme };
  }

  /** Per-tool usefulness: win rate of trades where its signal was present. Dropped once 34 trades say it is under break-even. */
  toolUse(tool, breakEven = 0.24) {
    const u = this.brain.tools[tool] || { w: 0, n: 0 };
    const p = post(u.w, u.n);
    return { n: u.n, p: +p.toFixed(3), weight: +(u.n >= 34 ? p / Math.max(breakEven, 1e-9) : 1).toFixed(3), dropped: u.n >= 34 && p < breakEven };
  }

  /** Rules move only when p over 13, 21 and 34 all agree, one step on the strictness ladder. */
  #lesson(breakEven = 0.24) {
    const { p13, p21, p34 } = pWindows(this.recent);
    if (p13 === null || p21 === null || p34 === null) return null;
    const i = STRICT.indexOf(this.brain.strictness);
    let to = null, why = null;
    if (p13 < breakEven && p21 < breakEven && p34 < breakEven && i < STRICT.length - 1) { to = STRICT[i + 1]; why = "p13, p21 and p34 all under break-even: tighten the gut veto"; }
    if (p13 > 0.382 && p21 > 0.382 && p34 > 0.382 && i > 0) { to = STRICT[i - 1]; why = "p13, p21 and p34 all over 38.2%: loosen the gut veto one step"; }
    if (to === null) return null;
    const lesson = { at: new Date(this.now()).toISOString(), rule: "gut veto line", from: this.brain.strictness, to, why, evidence: { p13, p21, p34, trades: this.recent.length } };
    this.brain.strictness = to;
    this.#append("lessons.jsonl", lesson);
    return lesson;
  }

  /** One line per day. */
  daySummary(s, tradesOfDay = []) {
    const best = tradesOfDay.reduce((a, t) => (!a || t.ret > a.ret ? t : a), null);
    const worst = tradesOfDay.reduce((a, t) => (!a || t.ret < a.ret ? t : a), null);
    const wins = tradesOfDay.filter((t) => t.won).length;
    const rec = { ...s, trades: tradesOfDay.length, p: tradesOfDay.length ? wins / tradesOfDay.length : null, best: best && { symbol: best.symbol, ret: best.ret, reason: best.reason }, worst: worst && { symbol: worst.symbol, ret: worst.ret, reason: worst.reason } };
    this.#append("days.jsonl", rec);
    return rec;
  }

  // ---- the panel orb ---------------------------------------------------------
  heartbeat(extra = {}) { fs.writeFileSync(this.#p(".trader-on"), JSON.stringify({ pid: process.pid, at: this.now(), ...extra })); }
  off() { try { fs.unlinkSync(this.#p(".trader-on")); } catch { /* gone */ } }

  // ---- snapshot and cloud ----------------------------------------------------
  exportSnapshot() {
    return { v: 1, exportedAt: new Date(this.now()).toISOString(), brain: this.brain, toolsMap: this.toolsMap, trades: this.tradesAll(), days: this.days(), lessons: this.lessons(), journalTail: this.journalLines().slice(-2584) };
  }
  static importSnapshot(dir, snap) {
    fs.mkdirSync(dir, { recursive: true });
    const lines = (a) => (a || []).map((x) => JSON.stringify(x)).join("\n") + ((a || []).length ? "\n" : "");
    fs.writeFileSync(path.join(dir, "brain.json"), JSON.stringify(snap.brain));
    fs.writeFileSync(path.join(dir, "tools-map.json"), JSON.stringify(snap.toolsMap || {}));
    fs.writeFileSync(path.join(dir, "trades.jsonl"), lines(snap.trades));
    fs.writeFileSync(path.join(dir, "days.jsonl"), lines(snap.days));
    fs.writeFileSync(path.join(dir, "lessons.jsonl"), lines(snap.lessons));
    fs.writeFileSync(path.join(dir, "journal.jsonl"), lines(snap.journalTail));
  }
}

/** Panel orb data: only while the trader runs (heartbeat under 15 s old). */
export function traderOrb(dir = memoryDir(), now = Date.now()) {
  let hb = null;
  try { hb = JSON.parse(fs.readFileSync(path.join(dir, ".trader-on"), "utf8")); } catch { hb = null; }
  if (!hb || !(now - hb.at < 15_000)) return null;
  let bytes = 0;
  for (const f of FILES) { try { bytes += fs.statSync(path.join(dir, f)).size; } catch { /* not yet */ } }
  // paid: profitable exit fills so far (the panel chimes when it rises); muted: the orb's toggle
  let board = null;
  try { board = JSON.parse(fs.readFileSync(path.join(dir, ".trader-board"), "utf8")); } catch { board = null; }
  return { on: true, bytes, kb: Math.round(bytes / 1024), paid: Number(hb.paid) || 0, muted: fs.existsSync(path.join(dir, ".mute")), board };
}
/** The orb's mute toggle (panel message "traderMute"). */
export function setTraderMute(muted, dir = memoryDir()) {
  fs.mkdirSync(dir, { recursive: true });
  if (muted) fs.writeFileSync(path.join(dir, ".mute"), "1"); else { try { fs.unlinkSync(path.join(dir, ".mute")); } catch { /* already */ } }
  return { ok: true, muted: !!muted };
}

// ---- R2 mirror ------------------------------------------------------------------
function wranglerEnv() {
  const env = { ...process.env };
  try {
    for (const line of fs.readFileSync(path.join(REPO, ".dev.vars"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2];
    }
  } catch { /* no .dev.vars here */ }
  return env;
}
/** Upload latest + dated snapshot. Returns {ok, why}. Never throws. */
export function syncToR2(mem, { bucket = "gardenbuddy-media", run = spawnSync } = {}) {
  const env = wranglerEnv();
  if (!env.CLOUDFLARE_API_TOKEN) return { ok: false, why: "no CLOUDFLARE_API_TOKEN (.dev.vars missing): snapshot kept locally" };
  const file = path.join(mem.dir, "snapshot.json");
  fs.writeFileSync(file, JSON.stringify(mem.exportSnapshot()));
  const day = new Date(mem.now()).toISOString().slice(0, 10);
  const out = [];
  for (const key of ["trader-memory-latest.json", `trader-memory-${day}.json`]) {
    const r = run("npx", ["wrangler", "r2", "object", "put", `${bucket}/${key}`, `--file=${file}`, "--content-type=application/json", "--remote"], { cwd: REPO, env, encoding: "utf8", timeout: 120_000 });
    out.push({ key, status: r.status, err: (r.stderr || "").slice(-200) });
  }
  return { ok: out.every((o) => o.status === 0), out };
}
/** Fill an empty memory folder from R2's latest snapshot. */
export function loadFromR2(dir, { bucket = "gardenbuddy-media", run = spawnSync } = {}) {
  if (fs.existsSync(path.join(dir, "brain.json"))) return { ok: false, why: "local memory present" };
  const env = wranglerEnv();
  if (!env.CLOUDFLARE_API_TOKEN) return { ok: false, why: "no CLOUDFLARE_API_TOKEN" };
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "snapshot-from-r2.json");
  const r = run("npx", ["wrangler", "r2", "object", "get", `${bucket}/trader-memory-latest.json`, `--file=${file}`, "--remote"], { cwd: REPO, env, encoding: "utf8", timeout: 120_000 });
  if (r.status !== 0) return { ok: false, why: (r.stderr || "").slice(-200) };
  Memory.importSnapshot(dir, JSON.parse(fs.readFileSync(file, "utf8")));
  return { ok: true };
}
