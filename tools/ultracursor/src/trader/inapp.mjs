/*
 * Trader mode inside the app (build 5). Sniper XYZ training (fake money, real
 * GMGN coins, the memory) runs in the ultracursor process itself, reading GMGN
 * from a background tab of Alex's own Chrome (the browser ultra.mjs reached
 * with connectOverCDP on its DevTools port).
 *
 * Switching it on or off, the newest word wins:
 *   - the panel's "trader" pill (Alex)            -> <data>/mode.json {on, at, by}
 *   - the cloud flag uc-trader.json in R2 (Claude) -> https://blackreaper.us/media/uc-trader.json
 *     {"on": true, "at": <ms>}; read every 15 s with a cache-busting query.
 *
 * TRAINING ONLY: nothing here can place an order. While it is on, the agent
 * refuses GMGN's own buy/sell controls (guard.mjs gmgnTradeClick).
 */
import { Scalp } from "./scalp.mjs";
import fs from "node:fs";
import path from "node:path";
import { Book } from "./book.mjs";
import { Sniper } from "./scan.mjs";
import { Gmgn } from "./gmgn.mjs";
import { Lanes } from "./lanes.mjs";
import { Memory, memoryDir } from "./memory.mjs";

export const FLAG_URL = "https://blackreaper.us/media/uc-trader.json";
export const SNAPSHOT_URL = "https://blackreaper.us/media/trader-memory-latest.json";
export const SPEED = 6.47; // Alex: "4 x golden ratio"

export function createTraderMode({ dir, getBrowser, log = () => {}, fetchFn = fetch, flagUrl = process.env.ULTRA_TRADER_FLAG || FLAG_URL }) {
  fs.mkdirSync(dir, { recursive: true });
  const MODE = path.join(dir, "mode.json"), LEDGER = path.join(dir, "ledger.jsonl"), STATE = path.join(dir, "state.json");
  let local = { on: false, at: 0 };
  try { local = { ...local, ...JSON.parse(fs.readFileSync(MODE, "utf8")) }; } catch { /* first time */ }
  let cloud = { on: false, at: 0 };
  let run = null;            // {lanes, gm, memory, book, done}
  let starting = false, lastFlag = 0, lastError = null;

  const want = () => (cloud.at > local.at ? cloud.on === true : local.on === true);

  function set(on, by = "panel") {
    local = { on: !!on, at: Date.now(), by };
    try { fs.writeFileSync(MODE, JSON.stringify(local)); } catch { /* still in memory */ }
    log(`trader mode ${on ? "on" : "off"} (${by})`);
    return { ok: true, on: !!on };
  }

  async function readFlag() {
    try {
      const r = await fetchFn(`${flagUrl}?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      const at = Number(j && j.at) || 0;
      if (at > cloud.at) { cloud = { on: j.on === true, at }; if (at > local.at) log(`trader mode ${cloud.on ? "on" : "off"} (cloud flag)`); }
    } catch { /* offline: keep the last word */ }
  }

  async function seedMemory(memDir) {
    if (fs.existsSync(path.join(memDir, "brain.json"))) return;
    try {
      const r = await fetchFn(`${SNAPSHOT_URL}?t=${Date.now()}`);
      if (!r.ok) return;
      Memory.importSnapshot(memDir, await r.json());
      log("trader memory loaded from the cloud snapshot");
    } catch (e) { log(`trader memory snapshot not loaded: ${String(e.message || e).slice(0, 100)}`); }
  }

  async function start() {
    const browser = await getBrowser();
    if (!browser) { lastError = "Chrome is not open"; return; }
    const memDir = memoryDir(dir);
    await seedMemory(memDir);
    const memory = new Memory({ dir: memDir });
    const recent = [];  // build 7: the last few buys/sells, shown on screen beside the orb
    const board = () => {
      try { fs.writeFileSync(path.join(memDir, ".trader-board"), JSON.stringify({ at: Date.now(), sum: fast.summary(), unit: "SOL", recent })); } catch { /* disk */ }
    };
    const write = (ev) => {
      if (ev.type === "entry" || ev.type === "close" || ev.type === "exit") {
        recent.push({ t: Date.now(), type: ev.type, symbol: ev.symbol || null, pnl: typeof ev.pnl === "number" ? ev.pnl : null, ret: typeof ev.ret === "number" ? ev.ret : null });
        if (recent.length > 5) recent.shift();
      }
      try { fs.appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), ...ev }) + "\n"); } catch { /* disk */ }
      if (ev.type === "day-summary") memory.daySummary(ev, book.trades.filter((t) => new Date(t.closeT).toISOString().slice(0, 10) === ev.date));
    };
    let state = null;
    try { state = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { state = null; }
    const book = new Book({ start: 10, log: write, state: state && state.v === 2 ? state : state ? { ...state, open: [], setups: [] } : null });
    book.onClose = (t) => { const lesson = memory.onTrade(t); if (lesson) write({ type: "lesson", ...lesson }); };
    if (!state) write({ type: "start", balance: 10, note: "Sniper XYZ training in the app: fake money, real GMGN coins" });
    memory.heartbeat({ open: 0, armed: 0, paid: book.paid });
    const gm = new Gmgn({ onCall: (c) => memory.onCall(c) });
    await gm.attach(browser);
    const FAST = path.join(dir, "fast.json");
    let fj = null; try { fj = JSON.parse(fs.readFileSync(FAST, "utf8")); } catch { fj = null; }
    // Alex 2026-10-20: a 50 SOL fake balance, 1.618 SOL every trade
    const fast = Scalp.from(fj, { src: gm, log: write, start: 50, stake: 1.618 });
    const sniper = new Sniper({ src: gm, book, memory, log: write });
    const lanes = new Lanes({ log: write });
    lanes
      .add("fast", 3000, (t) => fast.scanLane(t))
      .add("fastPositions", 2000, async (t) => { await fast.positionLane(t); fs.writeFileSync(FAST, JSON.stringify(fast.toJSON())); board();
        // build 24: the orb and the money line live on this heartbeat (it came from the parked sniper,
        // so they vanished 15 s after start); paid = the fast lane's wins, for the chime
        memory.heartbeat({ open: fast.open.size, armed: 0, paid: fast.summary().wins }); });
    // build 19: the slow Fibonacci sniper is parked (0 trades in thousands of scans, and its
      // 10-30 s scans starved the fast lane of GMGN calls). Its code stays for later.
    const done = lanes.run().catch((e) => { lastError = String(e.message || e); });
    run = { lanes, gm, memory, book, done, sniper, fast };
    board();
    log(`trader started in the app (training, fake money): GMGN in a background tab, memory ${Math.round(memory.bytes() / 1024)} KB`);
  }

  async function stop() {
    if (!run) return;
    const r = run; run = null;
    r.lanes.stop();
    await r.done;
    try { fs.writeFileSync(STATE, JSON.stringify(r.book.toJSON())); } catch { /* disk */ }
    r.memory.save();
    r.memory.off();
    await r.gm.close();
    log(`trader stopped: ${JSON.stringify(r.book.summary()).slice(0, 200)}`);
  }

  /** Called from the app's loop: follow the flag, start or stop. */
  let ticking = false, failedAt = 0;
  async function tick(now = Date.now()) {
    if (ticking) return;
    ticking = true;
    try {
      if (now - lastFlag > 15000) { lastFlag = now; await readFlag(); }
      const on = want();
      if (on && !run && now - failedAt > 30000) {
        starting = true;
        try { await start(); if (run) lastError = null; else failedAt = Date.now(); }
        catch (e) { lastError = `trader could not start: ${String(e.message || e).slice(0, 160)}`; log(lastError); failedAt = Date.now(); try { new Memory({ dir: memoryDir(dir) }).off(); } catch { /* fine */ } }
        finally { starting = false; }
      } else if (!on && run) await stop();
    } finally { ticking = false; }
  }

  return {
    want, set, tick, stop,
    running: () => !!run,
    state: () => ({ want: want(), running: !!run, starting, lastError, gmgnCalls: run ? run.gm.calls : 0, gmgnErrors: run ? run.gm.errors : 0, book: run ? run.book.summary() : null, fast: run ? run.fast.summary() : null, lastScan: run ? run.lastScan || null : null, blocks: run && run.sniper ? Object.entries(run.sniper.why || {}).sort((a, b) => b[1] - a[1]).slice(0, 8) : null }),
  };
}
