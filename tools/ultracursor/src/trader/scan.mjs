/*
 * One scan cycle of the paper trader. `src` is anything with GMGN's read
 * methods (trending, fullInfo, topBuyers, candles): the live Gmgn reader, or a
 * recorded source in the replay test. Everything is fetched concurrently.
 */
import { prefilter, gate } from "./gate.mjs";
import { findSwing } from "./fib.mjs";

const MIN = 60_000;

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = { error: String(e.message || e) }; } }
  }));
  return out;
}

export class Scanner {
  constructor({ src, book, maxCandidates = 20, concurrency = 8, log = () => {} }) {
    Object.assign(this, { src, book, maxCandidates, concurrency, log });
    this.buyersCache = new Map(); // addr -> {at, data}
    this.lastGate = new Map();    // addr -> failed list, to log only changes
  }

  async cycle(nowMs) {
    const t0 = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const rows = await this.src.trending();
    const cands = rows.filter((r) => prefilter(r, nowSec).ok)
      .sort((a, b) => (b.smt + b.kol) - (a.smt + a.kol))
      .slice(0, this.maxCandidates);
    const symbols = new Map(rows.map((r) => [r.a, r.s]));
    const candAddrs = cands.map((r) => r.a);
    const watch = [...new Set([...candAddrs, ...this.book.open.keys(), ...this.book.setups.keys()])];

    const [full, buyers, candles] = await Promise.all([
      candAddrs.length ? this.src.fullInfo(candAddrs).catch((e) => ({ error: e.message })) : [],
      pool(candAddrs, this.concurrency, (a) => this.#buyers(a, nowMs)),
      pool(watch, this.concurrency, (a) => this.src.candles(a, "1m", 120)),
    ]);
    const fullBy = new Map((Array.isArray(full) ? full : []).map((f) => [f.address, f]));
    const candlesBy = new Map(watch.map((a, i) => [a, Array.isArray(candles[i]) ? candles[i] : null]));
    let errors = (full?.error ? 1 : 0) + candles.filter((c) => !Array.isArray(c)).length + buyers.filter((b) => b?.error).length;

    // 1) mark and step every watched token on its closed candles
    for (const a of watch) {
      const cs = candlesBy.get(a);
      if (!cs?.length) continue;
      const closed = cs.filter((c) => c.t + MIN <= nowMs);
      this.book.onCandles(a, closed, cs[cs.length - 1].c, nowMs);
    }
    // 2) gate the candidates and arm the ones with a swing
    let passed = 0;
    for (let i = 0; i < candAddrs.length; i++) {
      const a = candAddrs[i], f = fullBy.get(a), cs = candlesBy.get(a);
      if (!f || !cs || buyers[i]?.error) continue;
      const closed = cs.filter((c) => c.t + MIN <= nowMs);
      const g = gate({ full: f, topBuyers: buyers[i], candles: closed, nowSec });
      const key = g.failed.join(",");
      if (this.lastGate.get(a) !== key) {
        this.lastGate.set(a, key);
        this.log({ type: "gate", t: nowMs, addr: a, symbol: f.symbol, pass: g.pass, failed: g.failed, checks: g.checks });
      }
      if (!g.pass) continue;
      passed++;
      if (this.book.open.has(a)) continue;
      const sw = findSwing(closed, this.book.plan);
      if (sw) this.book.arm(a, f.symbol || symbols.get(a), sw, nowMs, g.checks.map((c) => `${c.name}: ${c.value}`));
    }
    const halted = this.book.checkDay(nowMs);
    return { ms: Date.now() - t0, seen: rows.length, cands: candAddrs.length, passed, watched: watch.length, errors, halted, ...this.book.summary() };
  }

  async #buyers(a, nowMs) {
    const c = this.buyersCache.get(a);
    if (c && nowMs - c.at < 300_000) return c.data;  // a dev that sold stays sold; 5 min keeps GMGN calls low
    const data = await this.src.topBuyers(a);
    this.buyersCache.set(a, { at: nowMs, data });
    return data;
  }
}
