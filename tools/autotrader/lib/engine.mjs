import { DEFAULTS, entrySignal, managePosition } from "./strategy.mjs";
import { rugCheck } from "./rug.mjs";

export class Engine {
  constructor({ feed, exec, journal, cfg = DEFAULTS, rug = rugCheck, now = Date.now, startEq = 100, scanTop = 8 }) {
    Object.assign(this, { feed, exec, journal, cfg, rug, now, startEq, scanTop });
    const r = journal.replay();
    this.open = r.open;                       // survives restarts
    this.closed = r.closed;
    this.pending = r.pending;                 // intents with no fill: reconciled below, never forgotten
    for (const e of this.pending.values()) this.journal.write({ type: "fail", id: e.id, why: "restart before fill" });
    this.pending.clear();
    this.skips = new Map(); this.recent = []; this.rugCache = new Map(); this.cool = new Map(); this.errors = [];
    this.ticks = 0; this.lastTickAt = null;
  }
  get equity() { return this.startEq + this.closed.reduce((s, c) => s + (c.pnl || 0), 0); }
  #skip(name, why) { const k = why.replace(/[\d.]+/g, "#"); this.skips.set(k, (this.skips.get(k) || 0) + 1); this.recent.push({ at: this.now(), name, why }); if (this.recent.length > 40) this.recent.shift(); }
  async tick() {
    this.ticks++; this.lastTickAt = this.now();
    try { await this.#manage(); } catch (e) { this.#err("manage", e); }
    try { await this.#scan(); } catch (e) { this.#err("scan", e); }
  }
  #err(w, e) { this.errors.push({ at: this.now(), w, msg: String(e.message || e).slice(0, 140) }); if (this.errors.length > 20) this.errors.shift(); }
  async #manage() {
    for (const p of [...this.open.values()]) {
      let cs; try { cs = await this.feed.candles(p.pool, { limit: 100 }); } catch (e) { this.#err(`candles ${p.name}`, e); continue; }
      let i0 = cs.findIndex((c) => c.t >= p.candleT);
      if (i0 < 0) i0 = 0;
      const x = managePosition(cs, i0, this.cfg);
      const stale = this.now() - p.at > this.cfg.maxHoldMin * 60000 * 2;       // data gap: never hold forever
      if (!x.open || stale) {
        const ret = x.ret, pnl = p.stake * ret;
        this.journal.write({ type: "close", id: p.id, name: p.name, ret, pnl, why: x.open ? "stale data, closed" : x.why, exitPx: x.exitPx });
        await this.exec.sell?.(p);
        this.cool.set(p.pool, this.now() + this.cfg.cooldownMin * 60000);       // never re-enter the same coin straight after an exit
        this.open.delete(p.id); this.closed.push({ ...p, type: "close", ret, pnl, why: x.open ? "stale data, closed" : x.why });
      }
    }
  }
  async #scan() {
    if (this.open.size >= this.cfg.maxOpen) { this.#skip("-", `max ${this.cfg.maxOpen} open`); return; }
    const seen = new Map();
    for (const f of [() => this.feed.newPools(1), () => this.feed.trendingPools(1)]) {
      try { for (const x of await f()) seen.set(x.pool, x); } catch (e) { this.#err("pools", e); }
    }
    const list = [...seen.values()].filter((m) => !this.cool.has(m.pool) || this.now() > this.cool.get(m.pool)).sort((a, b) => b.vol5 - a.vol5).slice(0, this.scanTop);
    for (const m of list) {
      if (this.open.size >= this.cfg.maxOpen) break;
      if ([...this.open.values()].some((p) => p.pool === m.pool)) continue;
      this.cool.set(m.pool, this.now() + 60000);
      let cs; try { cs = await this.feed.candles(m.pool, { limit: 100 }); } catch (e) { this.#err(`candles ${m.name}`, e); continue; }
      if (cs.length < 20) { this.#skip(m.name, "too few candles"); continue; }
      const i = cs.length - 1;
      const s = entrySignal(cs, i, this.cfg, m);
      if (!s.ok) { this.#skip(m.name, s.why); continue; }
      if (!this.rugCache.has(m.mint)) this.rugCache.set(m.mint, await this.rug(m.mint));
      const r = this.rugCache.get(m.mint);
      if (!r.pass) { this.#skip(m.name, `rug check: ${r.reason}`); this.cool.set(m.pool, this.now() + 3600e3); continue; }
      const id = `${m.mint.slice(0, 6)}-${this.now()}`, stake = this.equity * this.cfg.stakeFrac;
      this.journal.write({ type: "intent", id, name: m.name, mint: m.mint, enter: s.why });   // on disk BEFORE anything is done
      const f = await this.exec.buy({ mint: m.mint, pool: m.pool, usd: stake });
      if (!f.ok) { this.journal.write({ type: "fail", id, why: f.why }); this.#skip(m.name, `executor: ${f.why}`); continue; }
      const pos = { type: "open", id, name: m.name, mint: m.mint, pool: m.pool, stake, entryPx: cs[i].c * (1 + this.cfg.slippage), candleT: cs[i].t, enter: s.why, rug: r.reason, at: this.now() };
      this.journal.write(pos);
      this.open.set(id, pos);
    }
  }
  status() {
    const c = this.closed, wins = c.filter((x) => x.ret > 0);
    return {
      mode: this.exec.name, ticks: this.ticks, lastTickAt: this.lastTickAt, equity: +this.equity.toFixed(2), startEq: this.startEq,
      open: [...this.open.values()].map((p) => ({ name: p.name, stake: +p.stake.toFixed(2), since: p.at, enter: p.enter })),
      trades: c.length, wins: wins.length, winRate: c.length ? +(wins.length / c.length).toFixed(3) : null,
      recentClosed: c.slice(-8).map((x) => ({ name: x.name, ret: +(x.ret * 100).toFixed(1), why: x.why, enter: x.enter })),
      whyNot: Object.fromEntries([...this.skips].sort((a, b) => b[1] - a[1]).slice(0, 12)), recentSkips: this.recent.slice(-10), errors: this.errors.slice(-5),
    };
  }
}
