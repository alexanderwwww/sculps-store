/**
 * The real-money trader (build 41, Alex 2026-10-20: "$15 to $2,000, every step").
 *
 * Symbiot (scalp.mjs) farms every new coin on fake money and proves, per setup and per target,
 * what would have won after fees (the ghost proof). This trades REAL money on GMGN's own trade
 * panel in Alex's Chrome, one position at a time, only where that proof holds:
 *
 *   signal  every pick symbiot sees (onPick), before its own filters, even when the sim is full
 *   gate    a-g below, in this order; each failure is a real-skip with its letter
 *   card    every BUY needs Alex: a card on its own slot, 45 s, [Buy] [Skip]. Only his press
 *           mints the one-shot token the door wants. Nothing on the link can decide it.
 *   buy     one click on GMGN's Buy, through execute.mjs's door, never re-clicked
 *   exits   automatic, no card (sells only reduce risk): the exact exits.mjs exit the sim
 *           proved, plus blind / rug radar / manual. A sell that leaves tokens is clicked again
 *           (a sell can never spend more than is held), 5 tries, then HALT and an alert card
 *   steps   steps.mjs: 38.2% stakes, 21/13/34/21/13 targets, a lost step repeats smaller
 *
 * Safety: PROBE is the default and the mode after every restart until a fresh R2 real.json is
 * read. LIVE needs real.json mode 'live' + a probe report from this build that Claude wrote the
 * selectors from + those selectors verified on the live page + the page's wallet = real.json's
 * + SOL read under 10 s ago. Every state change is a compare-and-set written to real.jsonl
 * (fsynced) BEFORE its side effect; a restart reconciles against the chain and never re-clicks a
 * buy. R2 can switch probe/live, raise the proof floors, set the baseline and supply selectors;
 * it can never raise the stake, change the stop or the targets, approve a buy or skip a card.
 */
import crypto from "node:crypto";
import { fibSetup, liteShape } from "../scalp.mjs";
import { exitReason, track, rulesOf, rulesKey } from "../exits.mjs";
import { createDoor, AUTO_MAX_SOL, AUTO_MAX_DAY, AUTO_DD, KEEP_MINTS } from "../execute.mjs";
import { followSignal, stillRunning } from "./runner.mjs";
import { DEFAULTS as SIM_DEFAULTS } from "../scalp.mjs";
import * as P from "./steps.mjs";
import { proven, floors, assumedRt } from "./proof.mjs";
import { RealStore } from "./realstore.mjs";
import { Wallet, addrMatch, isAddr, short } from "./wallet.mjs";
import { GmgnPanel, tokenUrlOf, SEL_KEYS, MAX_SLIP, DEFAULT_TOKEN_URL } from "./exec/gmgn-panel.mjs";

export const CARD_MS = 45_000, CONFIRM_MS = 90_000, SELL_CHECK_MS = 20_000, SELL_TRIES = 5;
export const BLIND_MS = 30_000, RUG_MS = 13_000, RUG_DROP = 0.382, REQUOTE_UP = 0.03;
export const RESERVE_SOL = 0.01, SOL_READ_MS = 5_000, SOL_FRESH_MS = 10_000, PRICE_MS = 30_000, VERIFY_EVERY_MS = 5_000;
export const PROBE_EVERY_MS = 30 * 60_000, RECENT_MS = 24 * 60 * 60_000, MIN_LQ = 8_000, MAX_TAX = 0.05;

const TERMINAL = new Set(["SKIPPED", "EXPIRED", "STALE", "CONFIRMED", "NOT_LANDED"]);
const num = (x) => (x === null || x === undefined || x === "" ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const r2 = P.round2;
const pc = (x) => Math.round(x * 100);
const id = () => crypto.randomBytes(6).toString("hex");

// ------------------------------------------------------------------ R2 real.json, read as DATA
const R2_KEYS = new Set(["mode", "startUsd", "minTrades", "minWin", "wallet", "tokenUrl", "selectorsFrom", "selectors", "probeNow", "exec", "buyPreset", "autoBuy", "keepMints", "runnerMinMc", "runnerMove", "autoMaxDay", "maxOpen", "perMin"]);
/** build 52: open positions at once (R2 maxOpen, 1-20) and auto entries per minute (R2 perMin), by default. */
export const MAX_OPEN_DEFAULT = 2, MAX_OPEN_CAP = 20, PER_MIN_DEFAULT = 2, AUTO_DAY_DEFAULT = 300;
/** build 52: a new-creation snipe may cost at most this much more than its signal at the click. */
export const SNIPE_REQUOTE_UP = 0.10;
/** build 48: auto positions exit like symbiot's hunt: take profit +40%, give back half of a +25% peak. */
export const AUTO_TP = 0.40, AUTO_TRAIL = 0.25;
/** build 48: a runner has no proof bucket: its round trip may cost at most this much. */
export const RUNNER_MAX_RT = 0.05;
export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
export const PRESET_RE = /^\d+(\.\d+)?$/;
/** build 45: within this much of the chain's SOL, the header chip is the real wallet (GMGN shows no address). */
export const chipTol = (sol) => Math.max(0.0015, 0.02 * (sol || 0));
const SEL_FIELDS = new Set(["role", "name", "exact", "nth"]);
const ROLES = new Set(["button", "tab", "textbox", "searchbox", "spinbutton", "combobox", "checkbox", "radio", "switch", "slider", "link", "menuitem", "menuitemradio", "option", "status", "heading"]);

/**
 * real.json -> {mode, startUsd, minTrades, minWin, wallet, tokenUrl, selectorsFrom, selectors,
 * probeNow, exec, buyPreset} or {mode: 'probe', error}. Anything unknown or malformed is PROBE,
 * with the reason. build 45: exec 'panel' (default: the trade box and its selectors) or 'instant'
 * (GMGN's Instant-trade window: one click on the buy preset whose exact text is buyPreset, and
 * Sell 100%). buyPreset is a plain number as text ("0.01618") and is required for 'instant'.
 */
export function parseRealJson(j) {
  const bad = (error) => ({ mode: "probe", error: `real.json: ${error}` });
  if (!j || typeof j !== "object" || Array.isArray(j)) return bad("not an object");
  if (j.error) return bad(String(j.error).slice(0, 120));
  for (const k of Object.keys(j)) if (!R2_KEYS.has(k)) return bad(`unknown key "${k}"`);
  if (j.mode !== "probe" && j.mode !== "live") return bad("mode must be 'probe' or 'live'");
  const out = { mode: j.mode };
  if (j.startUsd !== undefined) { if (!(typeof j.startUsd === "number" && j.startUsd > 0 && j.startUsd < 1e6)) return bad("startUsd"); out.startUsd = j.startUsd; }
  if (j.minTrades !== undefined) { if (!(typeof j.minTrades === "number" && j.minTrades >= 0)) return bad("minTrades"); out.minTrades = j.minTrades; }
  if (j.minWin !== undefined) { if (!(typeof j.minWin === "number" && j.minWin >= 0 && j.minWin <= 1)) return bad("minWin"); out.minWin = j.minWin; }
  Object.assign(out, floors(out));                     // 21 and 0.55 are floors R2 can only raise
  if (j.wallet !== undefined) { if (!isAddr(j.wallet)) return bad("wallet is not a Solana address"); out.wallet = j.wallet; }
  if (j.tokenUrl !== undefined) { try { tokenUrlOf(j.tokenUrl, "So11111111111111111111111111111111111111112"); } catch (e) { return bad(e.message); } out.tokenUrl = j.tokenUrl; }
  if (j.selectorsFrom !== undefined) { if (typeof j.selectorsFrom !== "string" || !(j.selectorsFrom === "auto" || /^[0-9a-f]{8,64}$/.test(j.selectorsFrom))) return bad("selectorsFrom"); out.selectorsFrom = j.selectorsFrom; }
  if (j.exec !== undefined && j.exec !== "panel" && j.exec !== "instant") return bad("exec must be 'panel' or 'instant'");
  out.exec = j.exec || "panel";
  if (j.buyPreset !== undefined) { if (typeof j.buyPreset !== "string" || j.buyPreset.length > 12 || !PRESET_RE.test(j.buyPreset) || !(Number(j.buyPreset) > 0)) return bad("buyPreset must be a number as text, like \"0.01618\""); out.buyPreset = j.buyPreset; }
  if (out.exec === "instant" && !out.buyPreset) return bad("exec 'instant' needs buyPreset");
  // build 52: selectorsFrom "auto" (the default for instant) = the newest usable probe of this build
  if (out.exec === "instant" && out.selectorsFrom === undefined) out.selectorsFrom = "auto";
  if (j.maxOpen !== undefined) { if (!(Number.isInteger(j.maxOpen) && j.maxOpen >= 1 && j.maxOpen <= MAX_OPEN_CAP)) return bad(`maxOpen must be 1-${MAX_OPEN_CAP}`); out.maxOpen = j.maxOpen; }
  if (j.perMin !== undefined) { if (!(typeof j.perMin === "number" && j.perMin > 0 && j.perMin <= 12)) return bad("perMin must be above 0, at most 12"); out.perMin = j.perMin; }
  // build 48: autoBuy and its caps. R2 can only lower autoMaxDay and raise the runner floors.
  if (j.autoBuy !== undefined) { if (typeof j.autoBuy !== "boolean") return bad("autoBuy must be true or false"); out.autoBuy = j.autoBuy; }
  out.autoBuy = out.autoBuy === true;
  if (j.keepMints !== undefined) { if (!Array.isArray(j.keepMints) || j.keepMints.length > 100 || !j.keepMints.every(isAddr)) return bad("keepMints must be a list of Solana mints"); out.keepMints = [...j.keepMints]; }
  if (j.runnerMinMc !== undefined) { if (!(typeof j.runnerMinMc === "number" && j.runnerMinMc > 0)) return bad("runnerMinMc"); out.runnerMinMc = j.runnerMinMc; }
  if (j.runnerMove !== undefined) { if (!(typeof j.runnerMove === "number" && j.runnerMove > 0 && j.runnerMove < 100)) return bad("runnerMove"); out.runnerMove = j.runnerMove; }
  if (j.autoMaxDay !== undefined) { if (!(Number.isInteger(j.autoMaxDay) && j.autoMaxDay >= 0)) return bad("autoMaxDay"); out.autoMaxDay = Math.min(AUTO_MAX_DAY, j.autoMaxDay); }
  if (out.autoBuy && out.exec !== "instant") return bad("autoBuy needs exec 'instant'");
  if (out.autoBuy && !(Number(out.buyPreset) > 0 && Number(out.buyPreset) <= AUTO_MAX_SOL + 1e-12)) return bad(`autoBuy needs buyPreset at most "${AUTO_MAX_SOL}"`);
  if (j.probeNow !== undefined) { if (!["string", "number"].includes(typeof j.probeNow)) return bad("probeNow"); out.probeNow = j.probeNow; }
  if (j.selectors !== undefined) {
    if (!j.selectors || typeof j.selectors !== "object" || Array.isArray(j.selectors)) return bad("selectors");
    const sel = {};
    for (const [k, s] of Object.entries(j.selectors)) {
      if (!SEL_KEYS.includes(k)) return bad(`unknown selector "${k}"`);
      if (!s || typeof s !== "object" || Array.isArray(s)) return bad(`selector ${k}`);
      for (const f of Object.keys(s)) if (!SEL_FIELDS.has(f)) return bad(`selector ${k}: unknown field "${f}"`);
      if (!ROLES.has(s.role)) return bad(`selector ${k}: role "${s.role}"`);
      if (typeof s.name !== "string" || !s.name || s.name.length > 80) return bad(`selector ${k}: name`);
      if (s.exact !== true) return bad(`selector ${k}: exact must be true`);
      if (s.nth !== undefined && !(Number.isInteger(s.nth) && s.nth >= 0 && s.nth <= 20)) return bad(`selector ${k}: nth`);
      sel[k] = { role: s.role, name: s.name, exact: true, ...(s.nth !== undefined ? { nth: s.nth } : {}) };
    }
    out.selectors = sel;
  }
  return out;
}

function freshState(build, startUsd = 15) {
  return {
    v: 1, plan: "steps76", build, seq: 0, wallet: null, startUsd, deposits: 0,
    ...P.newLedger(startUsd),
    intent: null, positions: [], lastBuyAt: 0, steps: [], recent: {}, auto: null,
    ledgerSol: null, balanceSol: null, solUsd: null,
    counters: { signals: 0, gated: 0, cards: 0, skipped: 0, expired: 0, stale: 0, notLanded: 0, sellRetries: 0 },
  };
}
const LEDGER_KEYS = ["step", "lastStake", "afterLoss", "lossStreak", "peakUsd", "paused", "halted", "done", "trades", "wins", "losses"];

export class Real {
  constructor({ dir, build = null, sim = null, src, browser = null, panel = null, walletFor = (address) => new Wallet({ address }), cards = null, log = () => {}, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), store = null }) {
    this.dir = dir; this.build = build; this.sim = sim; this.src = src;
    this.panel = panel || (browser ? new GmgnPanel({ browser, build, dir }) : null);
    this.walletFor = walletFor; this.cards = cards; this.logFn = log; this.now = now; this.sleep = sleep;
    this.store = store || new RealStore(dir);
    this.st = freshState(build);
    this.#legacy();
    this.cfg = null;                                   // R2 real.json, parsed; null until read (PROBE)
    this.mode = "probe"; this.why = "real.json not read yet";
    this.verify = { ok: false, at: 0, why: "not verified yet" };
    this.probes = [];                                  // the last probe reports, newest first
    this.picks = new Map(); this.seen = new Map(); this.wouldSeen = new Map();
    this.would = { n: 0, last: null };
    this.flow = null; this.probing = null; this.manual = false; this.dead = false;
    this.curId = null;                                 // build 52: the position #manage is working on
    this.tabQ = Promise.resolve();                     // build 52: one job at a time on the one tab
    this.wallet = null; this.solAt = 0; this.priceAt = 0; this.ticks = 0;
    this.door = createDoor({ panel: this.panel, now: this.now, ctx: () => ({ mode: this.mode, verify: this.verify, auto: this.#autoCtx(), keep: this.#keep() }) });
  }

  log(ev) { try { this.logFn({ at: this.now(), ...ev }); } catch { /* the ledger is best effort */ } }

  // ---------------------------------------------------------------- persistence (WAL first)
  #save() { if (!this.noSave && !this.dead) { try { this.store.save(this.st); } catch (e) { this.log({ type: "real-error", why: `snapshot: ${e.message}` }); } } }

  /** One WAL line (fsynced) BEFORE the change is applied or acted on. */
  #commit(type, set = {}, extra = {}) {
    if (this.dead) throw new Error("real trader stopped");
    const seq = (this.st.seq || 0) + 1;
    const posLog = "position" in set ? set.position || extra.closed : null;
    if ("position" in set) {
      // build 52: several positions. A position write upserts by id; null removes the one closed.
      const v = set.position, rest = { ...set };
      delete rest.position;
      let arr = [...(this.st.positions || [])];
      if (v) { const i = arr.findIndex((x) => x.id === v.id); if (i >= 0) arr[i] = v; else arr.push(v); }
      else { const gone = (extra.closed && extra.closed.id) || this.curId; arr = arr.filter((x) => x.id !== gone); }
      set = { ...rest, positions: arr };
    }
    const line = { seq, at: this.now(), type, set, ...extra };
    try { this.store.append(line); } catch (e) { this.dead = true; throw e; }
    this.st.seq = seq;
    Object.assign(this.st, set);
    if (extra.row) this.st.steps.push(extra.row);
    this.#save();
    const it = set.intent || extra.done, pos = posLog;
    this.log({ type, seq, state: it ? it.state : pos ? pos.state : undefined, mint: (it || pos || {}).mint, symbol: (it || pos || {}).symbol, why: (it || pos || {}).why || extra.why });
  }

  /** Compare-and-set on the intent. A finished intent can never move again (HALT). */
  #to(type, from, to, patch = {}, set = {}) {
    const it = this.st.intent;
    if (!it) { this.#halt(`intent moved after it finished (${from.join("/")} -> ${to})`); throw new Error("intent already finished"); }
    if (!from.includes(it.state)) throw new Error(`intent is ${it.state}, not ${from.join("/")}`);
    const next = { ...it, ...patch, state: to, at: this.now() };
    if (TERMINAL.has(to)) this.#commit(type, { intent: null, ...set }, { done: next });
    else this.#commit(type, { intent: next, ...set });
    return next;
  }
  /** build 52: the position #manage is on (this.curId). */
  /** build 52: st.position (read only, not saved) = the newest open position, for readers of the one-position shape. */
  #legacy() { Object.defineProperty(this.st, "position", { get: () => { const a = this.st.positions || []; return a[a.length - 1] || null; }, set: (v) => { if (v && !(this.st.positions || []).some((x) => x.id === v.id)) (this.st.positions = this.st.positions || []).push(v); }, enumerable: false, configurable: true }); }
  #cur() { return (this.st.positions || []).find((x) => x.id === this.curId) || null; }
  /** build 52: panel work (probe, verify, buy, sell) runs one job at a time on Alex's one tab. */
  #tab(fn) { const run = this.tabQ.then(fn, fn); this.tabQ = run.catch(() => {}); return run; }
  #pos(type, from, to, patch = {}) {
    const p = this.#cur();
    if (!p || !from.includes(p.state)) throw new Error(`position is ${p ? p.state : "missing"}, not ${from.join("/")}`);
    const next = { ...p, ...patch, state: to };
    this.#commit(type, { position: next });
    return next;
  }
  #halt(why, until = null) {
    if (this.st.halted && !this.st.halted.until && !until) return;
    try { this.#commit("real-halt", { halted: { why, at: this.now(), until } }); } catch { this.st.halted = { why, at: this.now(), until }; }
  }
  #ledger() { const L = {}; for (const k of LEDGER_KEYS) L[k] = this.st[k]; return L; }

  // ---------------------------------------------------------------- start: lock, load, reconcile
  async start() {
    if (this.started) return this.started;
    this.started = (async () => {
      if (!this.store.lock()) { this.disabled = "another ultracursor holds real.lock: this one runs the sim only"; this.log({ type: "real-halt", why: this.disabled }); return { ok: false, why: this.disabled }; }
      const r = this.store.load();
      if (r.error) {
        // never written over: the file is evidence. Nothing trades until Alex/Claude look.
        this.noSave = true; this.st.halted = { why: r.error, at: this.now(), until: null };
        this.log({ type: "real-halt", why: r.error });
        return { ok: false, why: r.error };
      }
      if (r.state) this.st = { ...freshState(this.build), ...r.state, counters: { ...freshState().counters, ...(r.state.counters || {}) } };
      // the crash window: a WAL line written, the snapshot not yet
      for (const l of this.store.lines()) {
        if (!(l.seq > (this.st.seq || 0))) continue;
        Object.assign(this.st, l.set || {});
        if (l.row) this.st.steps.push(l.row);
        this.st.seq = l.seq;
      }
      this.st.build = this.build;
      // build 52: one position (build 50 and before) becomes the list of positions
      if (!Array.isArray(this.st.positions)) this.st.positions = [];
      if (this.st.position) { if (!this.st.positions.some((x) => x.id === this.st.position.id)) this.st.positions.push(this.st.position); }
      delete this.st.position;
      this.#legacy();
      const pr = this.store.load(this.store.probeFile);
      if (pr.state) this.probes = (pr.state.history || []).filter((h) => h && h.hash);
      if (this.st.wallet) this.wallet = this.walletFor(this.st.wallet);
      if (this.cfgRaw !== undefined) this.setConfig(this.cfgRaw);       // read before the snapshot loaded
      this.#save();
      await this.#reconcile();
      return { ok: true };
    })();
    return this.started;
  }

  async #reconcile() {
    const it = this.st.intent;
    if (it) {
      if (it.state === "PROPOSED") { this.st.counters.skipped++; this.#to("real-skip", ["PROPOSED"], "SKIPPED", { why: "restart: a card never survives one" }); }
      else if (it.state === "APPROVED") { this.st.counters.skipped++; this.#to("real-skip", ["APPROVED"], "SKIPPED", { why: "restart before the click" }); }
      else if (it.state === "CLICKING" || it.state === "SENT") {
        // the click may or may not have happened: the chain says. Never clicked again.
        const a = await this.#tokens(it.mint);
        await this.sleep(5_000);
        const b = await this.#tokens(it.mint);
        const before = BigInt(it.tokensBefore || "0");
        const landed = [a, b].find((x) => x && BigInt(x.raw) > before);
        if (landed) await this.#landed(landed);
        else {
          const sigs = this.wallet ? await this.wallet.recentSigs(10).catch(() => []) : [];
          const pending = sigs.some((s) => !s.err && (!s.at || s.at >= (it.clickedAt || 0) - 15_000));
          if (pending && this.now() - (it.clickedAt || 0) < CONFIRM_MS) this.flow = this.#run(() => this.#confirm());
          else { this.st.counters.notLanded++; this.#to("real-fill", ["CLICKING", "SENT"], "NOT_LANDED", { why: "restart: no tokens on the chain" }, { recent: { ...this.st.recent, [it.mint]: this.now() } }); }
        }
      }
    }
    for (const p of this.st.positions) {
      if (p.state !== "OPEN" && p.state !== "SELLING") continue;
      p.lastPxAt = this.now(); p.resumed = p.state === "SELLING";      // a sell in flight is tried again at once
      this.log({ type: "real-resume", mint: p.mint, symbol: p.symbol, state: p.state });
    }
    await this.#drift("start");
  }

  // ---------------------------------------------------------------- inputs: R2, picks, pill
  /** R2 real.json, every 30 s (inapp.mjs). A fetch error arrives as {error}. */
  setConfig(raw) {
    this.cfgRaw = raw;
    const c = parseRealJson(raw);
    this.cfg = c; this.cfgAt = this.now();
    if (c.error) { this.log({ type: "real-config", why: c.error }); return c; }
    if (c.startUsd && !this.st.positions.length) this.st.startUsd = c.startUsd;
    if (c.wallet && c.wallet !== this.st.wallet) {
      if (this.st.positions.length || this.st.intent) this.log({ type: "real-config", why: "wallet change ignored while a trade is open" });
      else { this.st.wallet = c.wallet; this.wallet = this.walletFor(c.wallet); this.st.ledgerSol = null; this.solAt = 0; }
    }
    if (c.probeNow !== undefined && c.probeNow !== this.st.lastProbeNow) { this.st.lastProbeNow = c.probeNow; this.probeDue = true; }
    return c;
  }

  /** scalp.mjs calls this for every rugOk pick (before its own filters). Never blocks the sim. */
  onPick(pick) {
    if (!pick || !pick.row || !pick.row.a) return;
    this.lastPickMint = pick.row.a;
    this.picks.delete(pick.row.a);
    this.picks.set(pick.row.a, { ...pick, seenAt: this.now() });
    while (this.picks.size > 144) this.picks.delete(this.picks.keys().next().value);
  }

  /**
   * build 48: REAL is symbiot's symbiote. scalp.mjs shows every reprice of its fake positions
   * here; a sim position that runs (followSignal) goes to the front of the queue as a follow pick.
   * No scanning of its own: these are symbiot's own coins.
   */
  onMove(ev) {
    if (!ev || !ev.row || !ev.row.a) return;
    const f = followSignal(ev, this.cfg);
    if (!f.ok) return;
    this.lastFollow = { symbol: ev.row.s, mint: ev.row.a, move: +f.move.toFixed(4), mc: f.mc, why: f.why, at: this.now() };
    this.picks.delete(ev.row.a);
    this.picks = new Map([[ev.row.a, { row: ev.row, cs: ev.cs, nowMs: ev.nowMs, follow: f, seenAt: this.now() }], ...this.picks]);
  }

  /** Alex's trusted REAL-stop pill: sell the open position now. */
  stopManual() { this.manual = true; return { ok: true, open: this.st.positions.length > 0 }; }

  /** An open position or a buy in flight keeps the real lane (and the heartbeat) running. */
  mustRun() { return !!(this.st.positions.length || this.st.intent || this.flow); }

  /** Waits for a background flow (card, buy, confirm) and the probe. Tests and shutdown. */
  async settle() { for (let i = 0; i < 50 && (this.flow || this.probing); i++) await Promise.all([this.flow, this.probing].filter(Boolean)); }

  #run(fn) {
    const f = (async () => { try { await fn(); } catch (e) { if (!this.dead) this.log({ type: "real-error", why: String(e.message || e).slice(0, 200) }); } })();
    const done = f.finally(() => { if (this.flow === done) this.flow = null; });
    return done;
  }

  // ---------------------------------------------------------------- the lane, every 1 s
  async tick(nowMs = this.now()) {
    await this.start();
    if (this.disabled || this.dead || this.ticking) return;
    this.ticking = true;
    try { await this.#tick(nowMs); } finally { this.ticking = false; }
  }

  async #tick(nowMs) {
    this.ticks++;
    const step = async (name, fn) => { try { await fn(); } catch (e) { if (!this.dead) this.log({ type: "real-error", step: name, why: String(e.message || e).slice(0, 200) }); } };
    await step("wallet", () => this.#readWallet(nowMs));
    await step("limits", async () => { const b = this.#balUsd(); if (b !== null) Object.assign(this.st, P.resume(this.#ledger(), b, nowMs)); });
    if (this.sim) this.sim.realStakeUsd = this.#stake() || this.sim.realStakeUsd;  // the proof is scored at the real stake
    await step("probe", async () => this.#maybeProbe(nowMs));
    // build 52: the tab lock (#tab) keeps the probe, verify, buys and sells one at a time
    if (!this.flow && !this.probing) await step("verify", () => this.#tab(() => this.#liveCheck(nowMs)));
    this.#modeEval(nowMs);
    // build 52: every open position gets its own exits, then a new entry if there is room
    const manual = this.manual;
    for (const p of [...this.st.positions]) { this.curId = p.id; await step("exit", () => this.#manage(nowMs)); }
    this.curId = null;
    if (manual) this.manual = false;
    // a manual stop sells everything and buys nothing in the same pass
    if (!this.flow && !this.st.intent && !manual) await step("select", () => this.#select(nowMs));
    this.at = nowMs;
    this.#save();
  }

  async #readWallet(nowMs) {
    if (!this.wallet) return;
    if (nowMs - this.solAt >= SOL_READ_MS) {
      try {
        const sol = await this.wallet.solBalance();
        this.st.balanceSol = sol; this.solAt = this.now(); this.solErr = null;
        if (this.st.ledgerSol === null || this.st.ledgerSol === undefined) this.st.ledgerSol = sol;
        // build 48: the day's starting SOL (UTC) and the auto-buy count restart at midnight UTC
        const day = utcDay(nowMs);
        if (!this.st.auto || this.st.auto.day !== day) this.st.auto = { day, n: 0, startSol: sol };
      } catch (e) { this.solErr = String(e.message || e).slice(0, 120); }
    }
    if (nowMs - this.priceAt >= PRICE_MS && nowMs - (this.priceTriedAt || 0) >= SOL_READ_MS) {
      this.priceTriedAt = nowMs;
      const ps = await this.src.prices(["SOL"], { priority: true }).catch(() => null);
      const px = num((ps || []).find((p) => p && p.symbol === "SOL")?.price);
      if (px > 0) { this.st.solUsd = px; this.priceAt = nowMs; }
    }
  }
  /** build 52: open positions at cost x their move, in SOL. */
  #openSol() { return (this.st.positions || []).reduce((a, p) => a + (p.buy && p.buy.solIn > 0 ? p.buy.solIn * (1 + (p.move || 0)) : 0), 0); }
  /** build 52: the equity (free SOL + open positions), so open positions never read as a drawdown. */
  #balUsd() { return this.st.balanceSol !== null && this.st.solUsd ? (this.st.balanceSol + this.#openSol()) * this.st.solUsd : null; }
  #stake() { const b = this.#balUsd(); return b === null ? null : P.stakeFor(this.#ledger(), b); }
  async #tokens(mint) { return this.wallet ? this.wallet.tokenBalance(mint).catch(() => null) : null; }

  // ---------------------------------------------------------------- probe and mode
  #tokenUrl(mint) { return tokenUrlOf(this.cfg && !this.cfg.error && this.cfg.tokenUrl ? this.cfg.tokenUrl : DEFAULT_TOKEN_URL, mint); }

  async #maybeProbe(nowMs) {
    if (this.probing || !this.panel) return;
    // build 52: a probe of THIS build decides; none usable -> again, at most once a minute
    const mine = this.#usable();
    const tried = this.probeTriedAt || 0;
    const due = this.probeDue || (mine ? nowMs - mine.at >= PROBE_EVERY_MS : !tried || nowMs - tried >= 60_000);
    if (!due) return;
    let mint = this.lastPickMint;
    if (!mint) { const t = await this.src.trending("1m", 5).catch(() => []); mint = (t || []).find((r) => r && isAddr(r.a))?.a; }
    if (!mint) return;
    this.probeDue = false; this.probeTriedAt = nowMs;
    const url = this.#tokenUrl(mint);
    this.probing = (async () => {
      try {
        // build 44: a probe can never hang the real lane (it did once on Alex's Mac)
        let timer;
        const rep = await Promise.race([this.#tab(() => this.panel.probe(url)), new Promise((_, no) => { timer = setTimeout(() => no(new Error("probe took over 90 s")), 90_000); })]).finally(() => clearTimeout(timer));
        rep.mint = mint;
        if (!rep.hash) rep.hash = `f${Date.now().toString(16)}`;
        this.#gotProbe(rep);
      } catch (e) {
        // build 52: a probe that fails or runs out of time is still on the board, with its why
        this.#gotProbe({ hash: `f${Date.now().toString(16)}`, build: this.build, ok: false, at: this.now(), url, mint, walletKind: "unknown", walletAddr: null, why: String(e.message || e).slice(0, 160), controls: [] });
      }
    })().finally(() => { this.probing = null; });
  }

  #gotProbe(rep) {
    const box = (rep.controls || []).filter((c) => c.inTradeBox);
    const rec = { hash: rep.hash, build: rep.build, ok: !!rep.ok, at: rep.at ?? this.now(), url: rep.url, mint: rep.mint, walletKind: rep.walletKind, walletAddr: rep.walletAddr, why: rep.why,
      instant: rep.instant && rep.instant.open ? { open: true, buyPresets: rep.instant.buyPresets || [], sellPcts: rep.instant.sellPcts || [], toggle: !!rep.instant.toggle } : (rep.instant && rep.instant.toggle && this.cfg && !this.cfg.error
        // build 56: GMGN closes the window after every load; the toggle is there, so the window is opened and the one exact preset/Sell 100% target is found at click time (no match = no click)
        ? { open: true, assumed: true, buyPresets: [this.cfg.buyPreset], sellPcts: ["100%"], toggle: true }
        : { open: false, toggle: !!(rep.instant && rep.instant.toggle) }),
      controls: (rep.controls || []).map((c) => ({ role: c.role, name: c.name, inTradeBox: !!c.inTradeBox })) };
    this.probes = [rec, ...this.probes.filter((p) => p.hash !== rec.hash)].slice(0, 8);
    this.probeRep = rep;
    try { this.store.save({ v: 1, ...rep, history: this.probes }, this.store.probeFile); } catch { /* the report is also in the log */ }
    this.log({ type: "real-probe", ok: rec.ok, hash: rec.hash, controls: box.length, walletKind: rec.walletKind, walletAddr: rec.walletAddr, inputs: rep.inputs ?? null, why: rec.why });
  }

  /** The probe report Claude wrote the selectors from: this build, ok. */
  #record() {
    const c = this.cfg;
    if (!c || !c.selectorsFrom) return null;
    if (c.selectorsFrom === "auto") return this.#usable();
    return this.probes.find((p) => p.hash === c.selectorsFrom && p.build === this.build && p.ok) || null;
  }

  /** build 52: the newest probe of this build that can trade Instant (ok, GMGN wallet, window open with the preset and Sell 100%). */
  #usable() {
    const c = this.cfg, preset = c && !c.error ? c.buyPreset : null;
    return this.probes.find((p) => p.build === this.build && p.ok && p.walletKind === "gmgn" && p.instant && p.instant.open
      && (!preset || (p.instant.buyPresets || []).includes(preset)) && (p.instant.sellPcts || []).includes("100%")) || null;
  }

  #instant() { return !!(this.cfg && !this.cfg.error && this.cfg.exec === "instant"); }

  // ---------------------------------------------------------------- build 48: auto-buy caps
  /** Coins Alex holds himself: the local list plus real.json keepMints. Never bought or sold. */
  #keep() { return new Set([...KEEP_MINTS, ...(this.cfg && !this.cfg.error && this.cfg.keepMints ? this.cfg.keepMints : [])]); }
  #autoMax() { const c = this.cfg; return Math.min(AUTO_MAX_DAY, c && !c.error && Number.isInteger(c.autoMaxDay) ? c.autoMaxDay : AUTO_DAY_DEFAULT); }
  #maxOpen() { const c = this.cfg; return c && !c.error && Number.isInteger(c.maxOpen) ? c.maxOpen : MAX_OPEN_DEFAULT; }
  #perMin() { const c = this.cfg; return c && !c.error && c.perMin > 0 ? c.perMin : PER_MIN_DEFAULT; }
  /** build 52: room for one more position: under maxOpen and one more preset (plus the reserve) in the free SOL. */
  #room(withSol = true) {
    const stake = Number((this.cfg && !this.cfg.error && this.cfg.buyPreset) || AUTO_MAX_SOL);
    if (this.st.positions.length >= this.#maxOpen()) return `${this.st.positions.length} of ${this.#maxOpen()} positions open`;
    if (withSol && !(Number.isFinite(this.st.balanceSol) && this.st.balanceSol - RESERVE_SOL >= stake - 1e-12)) return `free SOL ${this.st.balanceSol} holds no more ${stake} SOL buys`;
    return null;
  }
  #autoToday() { const a = this.st.auto; return a && a.day === utcDay(this.now()) ? a : null; }
  /** SOL more than 30% under the day's starting SOL: no auto-buy. Unknown counts as down. */
  #ddOk() { const a = this.#autoToday(), b = this.st.balanceSol; return !!(a && a.startSol > 0 && Number.isFinite(b) && b + this.#openSol() > a.startSol * (1 - AUTO_DD) + 1e-12); }
  #autoCtx() {
    const c = this.cfg, a = this.#autoToday();
    return { on: !!(c && !c.error && c.mode === "live" && c.autoBuy === true), used: a ? a.n : 0, max: this.#autoMax(), ddOk: this.#ddOk() };
  }
  /** Why a runner may not be bought without a card right now, or null. */
  #autoWhyNot(stakeSol, preset) {
    const a = this.#autoCtx();
    if (!a.on) return "autoBuy is off";
    if (!this.#instant() || preset === null) return "auto-buy needs exec instant";
    if (!(stakeSol > 0) || stakeSol > AUTO_MAX_SOL + 1e-12) return `stake ${stakeSol} SOL over the ${AUTO_MAX_SOL} SOL auto cap`;
    if (a.used >= a.max) return `${a.used} of ${a.max} auto-buys used today`;
    if (!a.ddOk) return "SOL is 30% under the day's start";
    return null;
  }

  async #liveCheck(nowMs) {
    const c = this.cfg;
    if (!this.panel || !c || c.error || c.mode !== "live") return;
    if (this.#instant()) {
      const rec = this.#record();
      if (!rec || nowMs - this.verify.at < VERIFY_EVERY_MS) return;
      if (!this.panel.url()) await this.panel.openInstant(this.#tokenUrl(rec.mint || this.lastPickMint));
      this.verify = await this.panel.instantVerify(c.buyPreset, rec);
      return;
    }
    if (!c.selectors) return;
    const rec = this.#record();
    if (!rec || nowMs - this.verify.at < VERIFY_EVERY_MS) return;
    if (!this.panel.url()) await this.panel.open(this.#tokenUrl(rec.mint || this.lastPickMint));
    this.verify = await this.panel.verify(c.selectors, rec);
  }

  #modeEval(nowMs) {
    const c = this.cfg;
    const set = (mode, why) => { if (mode !== this.mode) this.log({ type: "real-mode", mode, why }); this.mode = mode; this.why = why; };
    if (!c) return set("probe", "real.json not read yet");
    if (c.error) return set("probe", c.error);
    if (c.mode !== "live") return set("probe", "real.json says probe");
    if (!this.panel) return set("probe", "no Chrome for the trade panel");
    const latest = this.probes[0];
    if (!latest) return set("probe", "no probe report yet");
    const auto = c.selectorsFrom === "auto";
    const rec = auto ? this.#usable() || this.probes.find((p) => p.build === this.build) : this.probes.find((p) => p.hash === c.selectorsFrom);
    if (!rec) return set("probe", auto ? `no probe report from build ${this.build} yet` : "real.json selectorsFrom matches no probe report");
    if (rec.build !== this.build) return set("probe", `the probe report is from build ${rec.build}`);
    if (!rec.ok) return set("probe", `the probe report is not ok: ${rec.why}`);
    if (c.exec === "instant") {
      // build 45: GMGN's Instant-trade window and GMGN's own wallet, both seen by this build's probe
      if (rec.walletKind !== "gmgn") return set("probe", `instant: the probe's wallet is ${rec.walletKind}, not GMGN's own`);
      if (!rec.instant || !rec.instant.open) return set("probe", "instant: the probe report shows no Instant-trade window");
      if (!rec.instant.buyPresets.includes(c.buyPreset)) return set("probe", `instant: buy preset ${c.buyPreset} is not in the probe report`);
      if (!rec.instant.sellPcts.includes("100%")) return set("probe", "instant: the probe report shows no Sell 100%");
      if (!this.verify.ok) return set("probe", `verify: ${this.verify.why}`);
      if (!this.wallet || !c.wallet || this.wallet.address !== c.wallet) return set("probe", "wallet not read yet");
      if (!(nowMs - this.solAt < SOL_FRESH_MS)) return set("probe", `SOL balance not read in 10 s${this.solErr ? `: ${this.solErr}` : ""}`);
      // the header chip = the chain is checked at the click, on the freshly loaded coin page (#buy):
      // a background tab's header can lag, and a lagging chip must not hold LIVE off forever
      return set("live", "live");
    }
    if (!c.selectors) return set("probe", "real.json has no selectors");
    if (!this.verify.ok) return set("probe", `verify: ${this.verify.why}`);
    if (!c.wallet || !addrMatch(this.verify.walletLabel || "", c.wallet)) return set("probe", "the wallet on the page is not real.json's wallet");
    if (!this.wallet || this.wallet.address !== c.wallet) return set("probe", "wallet not read yet");
    if (!(nowMs - this.solAt < SOL_FRESH_MS)) return set("probe", `SOL balance not read in 10 s${this.solErr ? `: ${this.solErr}` : ""}`);
    return set("live", "live");
  }

  // ---------------------------------------------------------------- selection: a to g
  async #select(nowMs) {
    // build 52: several positions, perMin entries a minute, never two buys at once on the one tab
    if (this.mode === "live" && (this.#room() || nowMs - (this.st.lastBuyAt || 0) < 60_000 / this.#perMin())) return;
    let n = 0;
    for (const [mint, pick] of [...this.picks]) {
      if (this.st.intent || this.flow || n >= 8) break;
      this.picks.delete(mint);
      if (nowMs - pick.seenAt > 60_000) continue;                        // a stale signal is no signal
      const sk = pick.follow ? `f:${mint}` : mint;
      if (this.seen.has(sk) && nowMs - this.seen.get(sk) < 60_000) continue;
      this.seen.set(sk, nowMs);
      if (this.seen.size > 2000) this.seen.delete(this.seen.keys().next().value);
      n++;
      await this.consider(pick, nowMs);
    }
  }

  #skip(letter, pick, why) {
    this.log({ type: "real-skip", letter, mint: pick.row.a, symbol: pick.row.s, why });
    return { ok: false, letter, why };
  }

  /** One signal through a-g. LIVE: a card. PROBE: 'would buy', nothing else. */
  async consider(pick, nowMs = this.now()) {
    const live = this.mode === "live", st = this.st, mint = pick.row.a;
    st.counters.signals++;
    this.log({ type: "real-signal", mint, symbol: pick.row.s, mode: this.mode });
    // a
    if (st.intent || this.flow) return this.#skip("a", pick, "a buy is already going through");
    if (st.positions.some((x) => x.mint === mint)) return this.#skip("a", pick, "already held");
    const roomWhy = this.#room(false);                 // the SOL itself is gate g
    if (live && roomWhy) return this.#skip("a", pick, roomWhy);
    if (st.halted) return this.#skip("a", pick, `halted: ${st.halted.why}`);
    if (st.done) return this.#skip("a", pick, "done: $2,000 reached");
    if (st.paused && nowMs < st.paused.until) return this.#skip("a", pick, `paused: ${st.paused.why}`);
    if (!this.wallet || !(nowMs - this.solAt < SOL_FRESH_MS) || !st.solUsd) return this.#skip("a", pick, "wallet not read in the last 10 s");
    if (this.#keep().has(mint)) return this.#skip("a", pick, "a coin Alex keeps (keepMints): never bought");
    // build 48: a sim position that runs (REAL follows symbiot) needs no Fibonacci pocket and no proof
    const cs = Array.isArray(pick.cs) ? pick.cs.slice(-34) : null;
    if (!cs || !cs.length) return this.#skip("b", pick, "no candles");
    let run = pick.follow && pick.follow.ok ? pick.follow : { ok: false, why: "symbiot's position is not running" };
    // build 52 (Alex: "watch all of the new creations"): with autoBuy on, a fresh symbiot pick is a
    // snipe: no Fibonacci pocket and no proof, the same security, pool, fee and cap gates as a runner
    if (!run.ok && !pick.follow && this.cfg && !this.cfg.error && this.cfg.autoBuy === true) run = { ok: true, snipe: true, why: "new creation: symbiot's snipe", mc: num(pick.row.mc), move: 0 };
    // b: otherwise always a Fibonacci entry (the same fibSetup symbiot uses), on 34 candles
    const fib = fibSetup(cs);
    if (!fib && !run.ok) return this.#skip("b", pick, `no Fibonacci pocket on 34 candles, not a runner (${run.why})`);
    // c: exactly the key symbiot files this coin under
    const combo = [...liteShape(pick.row, pick.nowMs ?? nowMs), fib ? "e:fib" : "e:run"].join("|");
    // d
    const T = run.ok ? AUTO_TP : P.targetFor(st.step.no), bal = this.#balUsd(), planStake = P.stakeFor(this.#ledger(), bal);
    let stake = planStake, preset = null;
    if (this.#instant()) {
      // build 45: Instant trade buys exactly the preset. Never more than the plan's stake.
      preset = this.cfg.buyPreset;
      const presetUsd = Number(preset) * st.solUsd;
      if (presetUsd > planStake + 1e-9) return this.#skip("g", pick, `preset ${preset} SOL ($${presetUsd.toFixed(2)}) is more than the step's $${planStake.toFixed(2)} stake`);
      if (Number(preset) + RESERVE_SOL > st.balanceSol + 1e-12) return this.#skip("g", pick, `preset ${preset} SOL + 0.01 reserve is more than the wallet's ${st.balanceSol} SOL`);
      stake = presetUsd;
    }
    // build 52: an auto entry spends the one fixed preset, so it can never grow after a loss
    if (!run.ok) { try { P.assertNoMartingale(st.lastStake, stake, st.afterLoss); } catch (e) { this.#halt(e.message); return this.#skip("d", pick, e.message); } }
    const sim = this.sim || { proof: {}, cfg: {} };
    const f = floors(this.cfg && !this.cfg.error ? this.cfg : {});
    const bucket = sim.proof && sim.cfg ? sim.proof[rulesKey(sim.cfg)] || null : null;
    const stat = bucket && bucket.keys && bucket.keys[combo] ? bucket.keys[combo][T] : null;
    const cRt = run.ok ? Math.max(assumedRt(null, stake), RUNNER_MAX_RT) : assumedRt(stat, stake);
    const pr = run.ok ? { ok: true, n: 0, w: 0, need: 0, why: run.why } : proven(sim.proof, combo, T, { ...sim.cfg, ...f, cRt, stakeUsd: stake }, nowMs);
    if (!pr.ok) { st.counters.gated++; return this.#skip("d", pick, pr.why); }
    // e: not traded by real in 24 h; security from one priority read
    if (st.recent[mint] && nowMs - st.recent[mint] < RECENT_MS) return this.#skip("e", pick, "traded by real in the last 24 h");
    const fi = await this.src.feeInfo(mint, { priority: true }).catch(() => null);
    const sec = fi && fi.security;
    if (!sec) return this.#skip("e", pick, "no security read");
    if (sec.renounced_mint !== true) return this.#skip("e", pick, "mint authority not renounced");
    if (sec.renounced_freeze_account !== true) return this.#skip("e", pick, "freeze authority not renounced");
    if (sec.can_not_sell === true || num(sec.can_not_sell) === 1) return this.#skip("e", pick, "can not sell");
    const buyTax = num(sec.buy_tax) || 0, sellTax = num(sec.sell_tax) || 0;
    if (buyTax + sellTax > MAX_TAX + 1e-12) return this.#skip("e", pick, `tax ${pc(buyTax + sellTax)}%`);
    const pool = ((fi && fi.pool_fee_info_list) || []).slice().sort((a, b) => (num(b.liquidity) || 0) - (num(a.liquidity) || 0))[0] || null;
    const lq = num(pick.row.lq);
    if (!(lq >= MIN_LQ)) return this.#skip("e", pick, lq === null ? "pool size unknown" : `pool $${Math.round(lq)} under $8k`);
    // f: the measured round trip is no dearer than the one the proof assumed
    const poolFee = pool ? num(pool.fee_ratio) : null;
    if (poolFee === null) return this.#skip("f", pick, "pool fee unknown");
    const rt = 2 * poolFee + buyTax + sellTax + P.PLAN_NET_USD / stake;
    if (rt > cRt + 1e-9) return this.#skip("f", pick, `round trip ${(rt * 100).toFixed(1)}% over the proof's ${(cRt * 100).toFixed(1)}%`);
    // g
    const solUsd = st.solUsd, stakeSol = preset !== null ? Number(preset) : Math.floor((stake / solUsd) * 1e4 + 1e-6) / 1e4;
    if (!(stake <= P.MAX_STAKE_USD)) return this.#skip("g", pick, "stake over the cap");
    if (!(stakeSol > 0) || stakeSol + RESERVE_SOL > st.balanceSol + 1e-12) return this.#skip("g", pick, `${stakeSol} SOL + 0.01 reserve is more than the wallet's ${st.balanceSol} SOL`);
    const signalPx = cs[cs.length - 1].c;
    const runner = run.ok ? { why: run.why, mc: run.mc, move: +run.move.toFixed(4), ...(run.snipe ? { snipe: true } : {}) } : null;
    const autoNot = runner ? this.#autoWhyNot(stakeSol, preset) : "not a runner";
    const auto = runner !== null && autoNot === null;
    const base = { mint, symbol: pick.row.s, combo, target: T, stakeUsd: stake, stakeSol, solUsd, signalPx, fib, rt, proof: { n: pr.n, w: pr.w, need: pr.need }, bal, runner, auto };
    if (!live) {
      if (!(this.wouldSeen.get(mint) > nowMs - RECENT_MS)) { this.wouldSeen.set(mint, nowMs); this.would.n++; }
      this.would.last = { symbol: pick.row.s, mint, step: st.step.no, target: T, stakeUsd: stake, at: nowMs };
      this.log({ type: "real-signal", would: true, why: `would ${runner ? "auto-" : ""}buy $${pick.row.s} at step ${st.step.no} (+${pc(T)}%), $${stake.toFixed(2)}${runner ? ` · ${runner.why}` : ""}`, mint, symbol: pick.row.s });
      return { ok: true, would: true, ...base };
    }
    // LIVE: the card. PROPOSED is on disk before Alex sees it.
    const intent = {
      id: id(), kind: "buy", exec: preset !== null ? "instant" : "panel", preset, mint, symbol: pick.row.s, step: { no: st.step.no, attempt: st.step.attempt }, stakeUsd: stake, stakeSol, solUsd, signalPx,
      card: { id: id(), shownAt: nowMs, expiresAt: nowMs + CARD_MS }, approvedAt: null, clickedAt: null, state: "PROPOSED", why: pr.why, at: nowMs,
      combo, target: T, rules: runner ? this.#autoRules() : { ...rulesOf((bucket && bucket.rules) || sim.cfg), sl: P.SL }, balIn: bal, rt, entryLq: lq, entryPoolLq: pool ? num(pool.liquidity) : null,
      ageMin: this.#ageMin(pick.row, nowMs), fib: fib ? { retr: fib.retr, move: fib.move } : null, proof: { n: pr.n, w: pr.w, need: pr.need },
      runner, auto,
    };
    if (runner && !auto) this.log({ type: "real-signal", mint, symbol: pick.row.s, why: `runner, card needed: ${autoNot}` });
    if (auto) {
      // build 48: the auto-buy is counted (WAL first) before anything is clicked; a failed one still counts
      const a = this.#autoToday() || { day: utcDay(nowMs), n: 0, startSol: st.balanceSol };
      st.counters.autoBuys = (st.counters.autoBuys || 0) + 1;
      this.#commit("real-card", { intent, auto: { ...a, n: a.n + 1 }, lastBuyAt: nowMs }, { why: runner.snipe ? "auto-buy: snipe" : "auto-buy: runner" });
      const card = this.cardFor(intent);
      this.flow = this.#run(() => this.#autoFlow(intent, card));
      return { ok: true, card, ...base };
    }
    st.counters.cards++;
    this.#commit("real-card", { intent });
    const card = this.cardFor(intent);
    this.flow = this.#run(() => this.#cardFlow(intent, card));
    return { ok: true, card, ...base };
  }

  /** build 48: symbiot's hunt exits for a runner: its own exit settings, stop -15%, take profit +40% (the target), give back half of a +25% peak. */
  #autoRules() {
    const c = this.sim && this.sim.cfg && Number.isFinite(this.sim.cfg.holdMs) ? this.sim.cfg : SIM_DEFAULTS;
    return { ...rulesOf(c), sl: P.SL, trailFrom: AUTO_TRAIL };
  }

  /**
   * build 48: an auto-buy. The card is information only (nothing on it can stop or start the
   * buy); the token comes from the door's one auto path, which re-checks every cap.
   */
  async #autoFlow(intent, card) {
    try {
      const x = this.cards && (this.cards.alert ? this.cards.alert(card) : this.cards.showTradeCard ? this.cards.showTradeCard(card, { ttlMs: CARD_MS, mint: () => null }) : null);
      if (x && x.catch) x.catch(() => {});
    } catch { /* the board carries it too */ }
    const it = this.st.intent;
    if (!it || it.id !== intent.id || it.state !== "PROPOSED") return;
    if (this.mode !== "live") { this.st.counters.skipped++; this.#to("real-skip", ["PROPOSED"], "SKIPPED", { why: `auto: not LIVE any more: ${this.why}` }); return; }
    const ap = this.#to("real-approve", ["PROPOSED"], "APPROVED", { approvedAt: this.now(), why: "auto-buy: runner" });
    let token;
    try { token = this.door.mintAuto(ap); } catch (e) { return this.#stale(String(e.message || e).slice(0, 160)); }
    await this.#buyThenConfirm(ap, token);
  }

  #ageMin(row, nowMs) { const c = num(row.ct) || num(row.ot); return c ? Math.max(0, Math.round((nowMs / 1000 - c) / 60)) : null; }

  /** The 7 lines Alex reads before he spends. */
  cardFor(it) {
    const sol = it.preset || it.stakeSol.toFixed(4);
    const pool = it.entryLq >= 1000 ? `$${Math.round(it.entryLq / 1000)}k` : `$${Math.round(it.entryLq || 0)}`;
    const head = [
      `$${it.symbol} · ${short(it.mint)} · ${it.ageMin === null ? "age unknown" : `${it.ageMin} min old`} · pool ${pool}`,
      `Spend ${sol} SOL ($${it.stakeUsd.toFixed(2)}), ${((it.stakeUsd / it.balIn) * 100).toFixed(1)}% of $${it.balIn.toFixed(2)}`,
    ];
    if (it.runner) {
      // build 48: a runner. Auto: information only, the buy is already going through.
      const a = this.#autoToday();
      const lines = [...head,
        `Sell at +${pc(it.target)}% · out if it gives back half of a +${pc(AUTO_TRAIL)}% peak · stop −15%`,
        it.runner.why,
        `Fees ${(it.rt * 100).toFixed(1)}% round trip · following symbiot's own position, no proof needed`,
      ];
      if (it.auto) return { id: it.card.id, kind: "real-auto", intentId: it.id, expiresAt: it.card.expiresAt, title: `REAL auto-buy · follows symbiot · $${it.symbol} +${pc(it.runner.move)}% in sim`, lines: [...lines, `Auto-buy ${a ? a.n : 1} of ${this.#autoMax()} today`], choices: [{ id: "ok", label: "OK" }] };
      return { id: it.card.id, kind: "real-buy", intentId: it.id, expiresAt: it.card.expiresAt, title: `REAL buy · follows symbiot · $${it.symbol} +${pc(it.runner.move)}% in sim`, lines: [...lines, `Closes in ${Math.round(CARD_MS / 1000)} s`], choices: [{ id: "buy", label: `Buy ${sol} SOL` }, { id: "skip", label: "Skip" }] };
    }
    return {
      id: it.card.id, kind: "real-buy", intentId: it.id, expiresAt: it.card.expiresAt,
      title: `REAL buy · step ${it.step.no} of ${P.STEPS}`,
      lines: [
        ...head,
        `Sell at +${pc(it.target)}% · stop −15% · auto exits on`,
        `Sim proof: ${it.proof.w} of ${it.proof.n} won after fees (needs ${pc(it.proof.need)}%)`,
        `Golden pocket ${it.fib.retr.toFixed(2)} of a +${pc(it.fib.move)}% move · fees ${(it.rt * 100).toFixed(1)}% round trip`,
        `Closes in ${Math.round(CARD_MS / 1000)} s`,
      ],
      choices: [{ id: "buy", label: `Buy ${sol} SOL` }, { id: "skip", label: "Skip" }],
    };
  }

  async #cardFlow(intent, card) {
    let res = "expired";
    if (this.cards && typeof this.cards.showTradeCard === "function") {
      // the token is minted only inside desk.decide, on Alex's trusted press of Buy
      try { res = await this.cards.showTradeCard(card, { ttlMs: CARD_MS, mint: () => this.door.mint(intent.id) }); } catch { res = "expired"; }
    }
    const choice = typeof res === "string" ? res : res && res.choice;
    await this.decide(intent.id, choice, res && typeof res === "object" ? res.token : null);
  }

  /**
   * Alex's answer to a card. A second answer, a late one or one for another card does nothing:
   * the check and the PROPOSED -> APPROVED write happen with no await between them.
   */
  async decide(intentId, choice, token = null) {
    const it = this.st.intent, now = this.now();
    if (!it || it.id !== intentId || it.state !== "PROPOSED") { this.log({ type: "real-skip", letter: "card", why: `answer ignored: the card is ${it && it.id === intentId ? it.state : "gone"}` }); return { ok: false }; }
    if (choice === "skip") { this.st.counters.skipped++; this.#to("real-skip", ["PROPOSED"], "SKIPPED", { why: "Alex skipped" }); return { ok: true, state: "SKIPPED" }; }
    if (choice !== "buy" || now > it.card.expiresAt) { this.st.counters.expired++; this.#to("real-skip", ["PROPOSED"], "EXPIRED", { why: choice === "buy" ? "pressed after 45 s" : `card ${choice || "expired"}` }); return { ok: true, state: "EXPIRED" }; }
    if (this.mode !== "live") { this.st.counters.skipped++; this.#to("real-skip", ["PROPOSED"], "SKIPPED", { why: `not LIVE any more: ${this.why}` }); return { ok: true, state: "SKIPPED" }; }
    const ap = this.#to("real-approve", ["PROPOSED"], "APPROVED", { approvedAt: now });
    await this.#buyThenConfirm(ap, token);
    return { ok: true };
  }

  #stale(why) { this.lastStale = { why, at: this.now() }; this.st.counters.stale++; this.#to("real-skip", ["APPROVED"], "STALE", { why }, { recent: { ...this.st.recent, [this.st.intent.mint]: this.now() } }); }

  async #buy(it, token) {
    const mint = it.mint;
    // the price again: more than 3% above the card, or the pocket gone, and nothing is clicked
    const cs = await this.src.candles(mint, "1m", 34, { priority: true }).catch(() => null);
    const px = Array.isArray(cs) && cs.length ? cs[cs.length - 1].c : null;
    if (!(px > 0)) return this.#stale("no price on the requote");
    const up = it.runner && it.runner.snipe ? SNIPE_REQUOTE_UP : REQUOTE_UP;
    if (px > it.signalPx * (1 + up)) return this.#stale(`price up ${((px / it.signalPx - 1) * 100).toFixed(1)}% since the card`);
    if (it.runner && it.runner.snipe) { /* build 52: a snipe needs no pocket and no run */ }
    else if (it.runner) { const rs = stillRunning(cs, this.cfg); if (!rs.ok) return this.#stale(`not running any more: ${rs.why}`); }
    else if (!fibSetup(cs.slice(-34))) return this.#stale("the Fibonacci pocket is gone");
    if (this.#keep().has(mint)) return this.#stale("a coin Alex keeps");
    const before = await this.#tokens(mint);
    if (!before) return this.#stale("wallet token read failed");
    const c = this.cfg, rec = this.#record(), url = this.#tokenUrl(mint);
    const instant = it.exec === "instant";
    // build 52 (Alex: "trade with the cursor from Instant ... only"): no other buy path
    if (!instant) return this.#stale("build 52 trades only through GMGN's Instant-trade window");
    if (instant && (c.exec !== "instant" || c.buyPreset !== it.preset)) return this.#stale("real.json's exec or buyPreset changed since the card");
    if (!instant && c.exec === "instant") return this.#stale("real.json's exec changed since the card");
    try {
      if (instant) { await this.panel.openInstant(url); this.verify = await this.panel.instantVerify(it.preset, rec, { chipWaitMs: 5_000 }); }
      else { await this.panel.open(url); this.verify = await this.panel.verify(c.selectors, rec); }
    } catch (e) { this.verify = { ok: false, at: this.now(), why: String(e.message || e).slice(0, 120) }; }
    this.#modeEval(this.now());
    if (!this.verify.ok || this.mode !== "live") return this.#stale(`not LIVE at the click: ${this.why}`);
    let r;
    if (instant) {
      // GMGN's built-in wallet shows no address: its header SOL must be the chain's SOL of real.json's wallet
      const chip = this.verify.chipSol;
      if (!(chip >= 0)) return this.#stale("no SOL balance chip in GMGN's header");
      if (Math.abs(chip - this.st.balanceSol) > chipTol(this.st.balanceSol)) return this.#stale(`GMGN's header shows ${chip} SOL, real.json's wallet holds ${this.st.balanceSol} SOL: another wallet?`);
      try {
        r = await this.door.execute("buy", it, token, {
          exec: "instant", url, preset: it.preset, wallet: c.wallet,
          beforeClick: () => { this.#to("real-click", ["APPROVED"], "CLICKING", { clickedAt: this.now(), tokensBefore: before.raw, sel: null, selRecord: null, instantRecord: { instant: rec.instant, hash: rec.hash } }); },
        });
      } catch (e) {
        if (this.dead) throw e;
        if (this.st.intent && this.st.intent.state === "APPROVED") return this.#stale(String(e.message || e).slice(0, 160));
        r = { ok: true, clicked: "unknown", error: String(e.message || e) };
      }
      if (!r || !r.ok) { if (this.st.intent && this.st.intent.state === "APPROVED") return this.#stale(r && r.stale || "the panel refused"); }
      if (!this.st.intent || this.st.intent.state !== "CLICKING") return;
      this.#to("real-sent", ["CLICKING"], "SENT", { why: r.clicked === true ? "clicked once" : `click unclear: ${r.error || ""}`.slice(0, 120) });
      return;                                          // build 52: confirmed outside the tab lock
    }
    const sel = c.selectors;
    const selRecord = { controls: SEL_KEYS.filter((k) => sel[k]).map((k) => ({ role: sel[k].role, name: sel[k].name })) };
    try {
      r = await this.door.execute("buy", it, token, {
        url, sel, wallet: c.wallet, maxSlip: MAX_SLIP,
        beforeClick: () => { this.#to("real-click", ["APPROVED"], "CLICKING", { clickedAt: this.now(), tokensBefore: before.raw, sel, selRecord }); },
      });
    } catch (e) {
      if (this.dead) throw e;
      if (this.st.intent && this.st.intent.state === "APPROVED") return this.#stale(String(e.message || e).slice(0, 160));
      r = { ok: true, clicked: "unknown", error: String(e.message || e) };
    }
    if (!r || !r.ok) { if (this.st.intent && this.st.intent.state === "APPROVED") return this.#stale(r && r.stale || "the panel refused"); }
    if (!this.st.intent || this.st.intent.state !== "CLICKING") return;
    this.#to("real-sent", ["CLICKING"], "SENT", { why: r.clicked === true ? "clicked once" : `click unclear: ${r.error || ""}`.slice(0, 120) });
  }

  /** build 52: the buy's tab work under the lock, then the chain confirm (no tab) outside it. */
  async #buyThenConfirm(ap, token) {
    await this.#tab(() => this.#buy(ap, token));
    const it = this.st.intent;
    if (it && it.id === ap.id && (it.state === "SENT" || it.state === "CLICKING")) await this.#confirm();
  }

  /** Up to 90 s from the click: tokens on the chain -> OPEN; none -> NOT_LANDED. No re-click. */
  async #confirm() {
    const it = this.st.intent;
    if (!it) return;
    const before = BigInt(it.tokensBefore || "0");
    for (;;) {
      const tb = await this.#tokens(it.mint);
      if (tb && BigInt(tb.raw) > before) return this.#landed(tb);
      if (this.now() - (it.clickedAt || it.at) >= CONFIRM_MS) break;
      await this.sleep(2_000);
    }
    this.st.counters.notLanded++;
    this.#to("real-fill", ["CLICKING", "SENT"], "NOT_LANDED", { why: "no tokens after 90 s" }, { recent: { ...this.st.recent, [it.mint]: this.now() } });
  }

  async #fills(mint, sinceMs, sign) {
    const sigs = this.wallet ? await this.wallet.recentSigs(20).catch(() => []) : [];
    const out = [];
    for (const s of sigs) {
      if (s.err || (s.at && s.at < sinceMs - 15_000)) continue;
      const f = await this.wallet.txFill(s.sig, mint).catch(() => null);
      if (f && f.ok && Math.sign(f.tokenDelta || 0) === sign) out.push(f);
    }
    return out;
  }

  async #landed(tb) {
    const it = this.st.intent, now = this.now();
    const fills = await this.#fills(it.mint, it.clickedAt || it.at, +1);
    const f = fills[0] || null;
    const solIn = f ? -f.solDelta : it.stakeSol;
    const tokens = f ? f.tokenDelta : tb.ui;
    const cs = await this.src.candles(it.mint, "1m", 2, { priority: true }).catch(() => null);
    const entryMcap = Array.isArray(cs) && cs.length && cs[cs.length - 1].c > 0 ? cs[cs.length - 1].c : it.signalPx;
    const pos = {
      id: id(), mint: it.mint, symbol: it.symbol, combo: it.combo, target: it.target, rules: it.rules, step: { ...it.step },
      buy: { intentId: it.id, sig: f ? f.sig : null, solIn, tokens, feesSol: f ? f.feeSol : null, at: it.clickedAt || now, usd: solIn * it.solUsd, estimated: !f },
      entryMcap, last: entryMcap, move: 0, peak: 0, peakAll: 0, lowAll: 0, pnlUsd: 0, state: "OPEN", sell: null, why: f ? null : "entry estimated",
      stakeUsd: it.stakeUsd, balIn: it.balIn, solUsd: it.solUsd, entryPoolLq: it.entryPoolLq, lastPxAt: now, rugAt: now,
      sel: it.sel, selRecord: it.selRecord, sellVerified: true, exec: it.exec || "panel", preset: it.preset || null, instantRecord: it.instantRecord || null,
      runner: it.runner || null, auto: !!it.auto,
    };
    this.#to("real-fill", ["CLICKING", "SENT"], "CONFIRMED", { why: f ? `filled: ${solIn.toFixed(4)} SOL for ${tokens}` : "tokens arrived; entry estimated" }, {
      position: pos, ledgerSol: (this.st.ledgerSol ?? this.st.balanceSol ?? 0) - solIn, recent: { ...this.st.recent, [it.mint]: now },
    });
  }

  // ---------------------------------------------------------------- exits, every tick
  async #manage(nowMs) {
    const p = this.#cur();
    if (!p) return;
    if (p.state === "SELLING") return this.#sellCheck(nowMs);
    if (p.state !== "OPEN") return;
    let move = null;
    const cs = await this.src.candles(p.mint, "1m", 2, { priority: true }).catch(() => null);
    const px = Array.isArray(cs) && cs.length ? num(cs[cs.length - 1].c) : null;
    if (px > 0) {
      p.last = px; p.lastPxAt = nowMs; move = px / p.entryMcap - 1;
      track(p, move);
      p.move = +move.toFixed(6); p.pnlUsd = r2(p.buy.usd * move);
    }
    let why = null;
    if (this.manual) why = "manual";
    if (!why && nowMs - (p.rugAt || 0) >= RUG_MS) {
      p.rugAt = nowMs;
      const fi = await this.src.feeInfo(p.mint, { priority: true }).catch(() => null);
      const sec = fi && fi.security;
      const pool = ((fi && fi.pool_fee_info_list) || []).slice().sort((a, b) => (num(b.liquidity) || 0) - (num(a.liquidity) || 0))[0];
      const lq = pool ? num(pool.liquidity) : null;
      if (sec && (sec.can_not_sell === true || num(sec.can_not_sell) === 1)) why = "stop: rug radar";
      else if (p.entryPoolLq > 0 && lq !== null && lq <= p.entryPoolLq * (1 - RUG_DROP)) why = "stop: rug radar";
    }
    if (!why && move !== null) why = exitReason(p, move, nowMs - p.buy.at, { ...p.rules, tp: p.target });
    if (!why && nowMs - (p.lastPxAt || p.buy.at) > BLIND_MS) why = "stop: blind";
    if (!why) return;
    const solBefore = this.wallet ? await this.wallet.solBalance().catch(() => this.st.balanceSol) : this.st.balanceSol;
    this.#pos("real-exit", ["OPEN"], "SELLING", { why, exitMove: p.move, resumed: false, sell: { tries: 0, at: nowMs, lastTry: 0, solBefore } });
    await this.#tab(() => this.#sellTry(nowMs));
  }

  #dust(tb, p) { return !tb || BigInt(tb.raw) === 0n || tb.ui <= (p.buy.tokens || 0) * 0.001; }

  async #sellTry(nowMs) {
    const p = this.#cur();
    if (!p) return;
    const tb = await this.#tokens(p.mint);
    if (tb && this.#dust(tb, p)) return this.#close(nowMs);
    if (p.sell.tries >= SELL_TRIES) return this.#stuck();
    const url = this.#tokenUrl(p.mint), sel = p.sel || (this.cfg && this.cfg.selectors);
    const pending = this.#pos("real-exit", ["SELLING"], "SELLING", { sell: { ...p.sell, tries: p.sell.tries + 1, lastTry: nowMs } });
    if (p.sell.tries > 0) this.st.counters.sellRetries++;
    const instant = p.exec === "instant";
    try {
      // build 45: a position bought through Instant trade is sold through it (the probe that bought it)
      if (instant) { await this.panel.openInstant(url); this.verify = await this.panel.instantVerify(null, p.instantRecord || this.#record()); }
      else { await this.panel.open(url); this.verify = await this.panel.verify(sel, p.selRecord || this.#record(), ["sellTab", "amount", "walletLabel"]); }
    } catch (e) { this.verify = { ok: false, at: this.now(), why: String(e.message || e).slice(0, 120) }; }
    if (!this.verify.ok) { this.log({ type: "real-exit", mint: p.mint, symbol: p.symbol, why: `sell not clicked: ${this.verify.why}` }); return; }
    try {
      const r = await this.door.execute("sell", pending, null, {
        ...(instant ? { exec: "instant" } : {}), url, sel, wallet: this.st.wallet, expectTokens: tb ? tb.ui : p.buy.tokens,
        beforeClick: () => { this.#pos("real-sell-click", ["SELLING"], "SELLING", { sell: { ...this.#cur().sell, clickedAt: this.now() } }); },
      });
      if (!r || !r.ok) this.log({ type: "real-exit", mint: p.mint, symbol: p.symbol, why: `sell not clicked: ${r && r.stale || "refused"}` });
    } catch (e) { if (this.dead) throw e; this.log({ type: "real-exit", mint: p.mint, symbol: p.symbol, why: `sell refused: ${String(e.message || e).slice(0, 120)}` }); }
  }

  async #sellCheck(nowMs) {
    const p = this.#cur();
    if (p.resumed || p.sell.tries === 0) { p.resumed = false; return this.#tab(() => this.#sellTry(nowMs)); }   // after a restart: at once
    if (nowMs - p.sell.lastTry < SELL_CHECK_MS) return;
    const tb = await this.#tokens(p.mint);
    if (tb && this.#dust(tb, p)) return this.#close(nowMs);
    if (!tb) return;
    const sigs = this.wallet ? await this.wallet.recentSigs(5).catch(() => []) : [];
    const pending = sigs.some((s) => !s.err && s.status !== "finalized" && (!s.at || s.at >= p.sell.lastTry - 5_000));
    if (pending && nowMs - p.sell.lastTry < 2 * SELL_CHECK_MS) return;
    if (this.st.halted) return;                                       // stuck: Alex sells by hand; the close is still seen
    if (p.sell.tries >= SELL_TRIES) return this.#stuck();
    await this.#tab(() => this.#sellTry(nowMs));
  }

  #stuck() {
    const p = this.#cur();
    if (this.st.halted && /sell/.test(this.st.halted.why)) return;
    this.#halt(`the sell of $${p.symbol} did not go through after ${SELL_TRIES} tries`);
    const card = { kind: "real-alert", title: `Sell $${p.symbol} on GMGN now`, lines: [`${short(p.mint)} · ${p.why}`, `${SELL_TRIES} sell clicks left tokens in the wallet.`, "Open the coin on GMGN and sell 100%."], choices: [{ id: "ok", label: "OK" }] };
    this.alert = card;
    try { const x = this.cards && (this.cards.alert ? this.cards.alert(card) : this.cards.showTradeCard(card, { ttlMs: 10 * 60_000 })); if (x && x.catch) x.catch(() => {}); } catch { /* the heartbeat carries it too */ }
  }

  async #close(nowMs) {
    const p = this.#cur();
    const solAfter = this.wallet ? await this.wallet.solBalance().catch(() => null) : null;
    const fills = await this.#fills(p.mint, p.sell.at, -1);
    const solOut = fills.length ? fills.reduce((s, f) => s + f.solDelta, 0) : solAfter !== null ? solAfter - p.sell.solBefore : 0;
    const feesSol = fills.reduce((s, f) => s + (f.feeSol || 0), 0);
    const solUsd = this.st.solUsd || p.solUsd;
    const free = solAfter !== null ? solAfter : (this.st.balanceSol ?? 0) + solOut;
    // build 52: the other open positions are still money: the step ledger reads the equity
    const others = (this.st.positions || []).filter((x) => x.id !== p.id).reduce((a, x) => a + (x.buy && x.buy.solIn > 0 ? x.buy.solIn * (1 + (x.move || 0)) : 0), 0);
    const bal = free + others;
    const move = Number.isFinite(p.exitMove) ? p.exitMove : p.move || 0;
    const solIn = p.buy.solIn, netSol = solOut - solIn;
    const row = {
      no: p.step.no, attempt: p.step.attempt, balIn: r2(p.balIn), stake: r2(p.stakeUsd), target: p.target,
      feesPlan: r2(P.feesPlan(p.stakeUsd, move)), feesMeasured: r2((solIn * (1 + move) - solOut) * solUsd),
      out: r2(solOut * solUsd), profit: r2(netSol * solUsd), balAfter: r2(bal * solUsd), why: p.why, mint: p.mint, symbol: p.symbol,
      feesSol: { buy: p.buy.feesSol, sell: feesSol || null }, seq: (this.st.seq || 0) + 1,
    };
    const prevBal = p.balIn;
    const L = P.onClose(this.#ledger(), { net: netSol, stake: p.stakeUsd, balUsd: bal * solUsd, nowMs });
    // build 52: auto entries stop on the -30% day floor, not on three losses in a row
    if (p.auto && L.paused) L.paused = null;
    const closed = { ...p, state: "CLOSED", sell: { ...p.sell, solOut, feesSol, at2: nowMs } };
    this.#commit("real-close", { position: null, ...L, balanceSol: free, ledgerSol: (this.st.ledgerSol ?? 0) + solOut }, { closed, row, why: p.why });
    this.solAt = this.now();
    this.log({ type: "real-step", no: row.no, attempt: row.attempt, profit: row.profit, balAfter: row.balAfter, next: L.step });
    for (const g of P.GOALS) if (prevBal < g && bal * solUsd >= g) this.log({ type: "real-goal", goal: g, balance: row.balAfter });
    if (L.halted) this.log({ type: "real-halt", why: L.halted.why, until: L.halted.until });
    if (L.paused) this.log({ type: "real-halt", pause: true, why: L.paused.why, until: L.paused.until });
    await this.#drift("close");
  }

  /** Ledger SOL against the wallet: a rise with no fill is a deposit; unknown coins are listed, never sold. */
  async #drift(when) {
    if (!this.wallet) return;
    const sol = await this.wallet.solBalance().catch(() => null);
    if (sol === null) return;
    this.st.balanceSol = sol; this.solAt = this.now();
    if (this.st.ledgerSol === null || this.st.ledgerSol === undefined) { this.st.ledgerSol = sol; return; }
    const gapSol = sol - this.st.ledgerSol, usd = gapSol * (this.st.solUsd || 0);
    if (Math.abs(usd) > 0.05) {
      if (usd > 0) this.st.deposits = r2((this.st.deposits || 0) + usd);
      this.log({ type: "real-drift", when, gapSol: +gapSol.toFixed(9), usd: r2(usd), counted: usd > 0 ? "deposit" : "unexplained loss (rent, fees or a withdrawal)" });
    }
    this.st.ledgerSol = sol;
    const held = typeof this.wallet.tokens === "function" ? await this.wallet.tokens().catch(() => []) : [];
    const unknown = held.filter((t) => !this.st.positions.some((x) => x.mint === t.mint));
    if (unknown.length) this.log({ type: "real-drift", when, unknown: unknown.map((t) => ({ mint: t.mint, ui: t.ui })), note: "listed, never sold" });
    this.#save();
  }

  // ---------------------------------------------------------------- what the panel and Claude read
  state(nowMs = this.now()) {
    const st = this.st;
    if (st.halted) return "HALTED";
    if (st.done) return "DONE";
    if (st.positions.length) return st.positions.some((x) => x.state === "SELLING") ? "SELLING" : "OPEN";
    if (st.intent) return st.intent.state === "PROPOSED" ? "CARD" : st.intent.state === "SENT" ? "CONFIRMING" : "BUYING";
    if (st.paused && nowMs < st.paused.until) return "PAUSED";
    return "IDLE";
  }

  /** bd.real, written every second into .trader-board (inapp.mjs). */
  board(nowMs = this.now()) {
    const st = this.st, bal = this.#balUsd(), L = this.#ledger();
    const ps = st.positions, p = ps[ps.length - 1] || null, it = st.intent;
    const openValue = ps.reduce((a, x) => a + x.buy.usd * (1 + (x.move || 0)), 0);
    const balanceUsd = bal === null ? null : r2(bal);
    const latest = this.probes[0] || null;
    const state = this.state(nowMs);
    const halt = st.halted ? { why: st.halted.why, until: st.halted.until } : st.paused && nowMs < st.paused.until ? { why: st.paused.why, until: st.paused.until } : null;
    let why = this.why;
    if (state === "SELLING" && this.panel && this.panel.walletKind === "phantom") why = "confirm the sell in Phantom";
    else if (halt) why = halt.why;
    return {
      connected: !!this.wallet && nowMs - this.solAt < 30_000, mode: this.mode, state,
      step: st.step.no, of: P.STEPS, attempt: st.step.attempt, target: P.targetFor(st.step.no),
      stakeUsd: bal === null ? null : P.stakeFor(L, bal), balanceUsd, balanceSol: st.balanceSol, startUsd: st.startUsd, goalUsd: P.GOAL_USD,
      progress: bal === null ? 0 : +P.progress(bal, st.startUsd).toFixed(4), nextGoal: bal === null ? P.GOALS[0] : P.nextGoal(bal),
      stepGoal: bal === null ? null : r2(P.stepGoal(L, bal)),
      pnlUsd: bal === null ? null : r2(st.balanceSol * st.solUsd + openValue - st.startUsd - (st.deposits || 0)),
      trades: st.trades, wins: st.wins, losses: st.losses,
      open: ps.map((x) => ({ symbol: x.symbol, mint: x.mint, move: +(x.move || 0).toFixed(4), pnlUsd: r2(x.pnlUsd || 0), target: x.target, stop: P.SL, ageS: Math.max(0, Math.round((nowMs - x.buy.at) / 1000)), state: x.state, auto: !!x.auto, runner: x.runner ? x.runner.why : null })),
      maxOpen: this.#maxOpen(), perMin: this.#perMin(),
      auto: (() => { const a = this.#autoCtx(), d = this.#autoToday(); return { on: a.on, today: a.used, max: a.max, label: `${a.used} / ${a.max}`, startSol: d ? d.startSol : null, floorSol: d && d.startSol ? +(d.startSol * (1 - AUTO_DD)).toFixed(6) : null, ddOk: a.ddOk }; })(),
      probe: latest ? { hash: latest.hash, build: latest.build, at: latest.at, ok: latest.ok, controls: latest.controls.filter((c) => c.inTradeBox).length, walletKind: latest.walletKind, walletAddr: latest.walletAddr, why: latest.why } : null,
      would: this.would.n ? { n: this.would.n, last: this.would.last } : null,
      card: it && it.state === "PROPOSED" ? { kind: it.auto ? "real-auto" : "real-buy", expiresAt: it.card.expiresAt, runner: it.runner ? it.runner.why : null } : this.alert && st.halted ? { kind: "real-alert", expiresAt: null } : null,
      follow: p && p.runner ? p.runner.why : it && it.runner ? it.runner.why : this.lastFollow && nowMs - this.lastFollow.at < 120_000 ? this.lastFollow.why : null,
      halt, why, at: nowMs,
    };
  }

  /** trader.state().real: the board plus what Claude needs to read a probe through ultra_status. */
  status(nowMs = this.now()) {
    return { ...this.board(nowMs), disabled: this.disabled || null, cfg: this.cfg ? { mode: this.cfg.mode, error: this.cfg.error || null, selectorsFrom: this.cfg.selectorsFrom || null, exec: this.cfg.exec || null, buyPreset: this.cfg.buyPreset || null, autoBuy: this.cfg.autoBuy === true, keepMints: [...this.#keep()] } : null, verify: this.verify, probeReport: this.probeRep || null, counters: this.st.counters, lastStale: this.lastStale || null, steps: this.st.steps.slice(-5) };
  }

  async stop() { await this.settle().catch(() => {}); this.store.unlock(); }
}
