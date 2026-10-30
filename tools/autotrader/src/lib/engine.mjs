import { DEFAULTS, entrySignal, managePosition } from "./strategy.mjs";
import { rugCheck } from "./rug.mjs";
import * as O from "./organism.mjs";
import { why as narrWhy } from "./narrative.mjs";

export class Engine {
  constructor({ feed, exec, journal, cfg = DEFAULTS, rug = rugCheck, now = Date.now, startEq = 100, scanTop = 8, org = null, rng = Math.random, narr = null }) {
    Object.assign(this, { feed, exec, journal, cfg, rug, now, startEq, scanTop, rng, narr });
    const r = journal.replay();
    this.open = r.open;                       // survives restarts
    this.closed = r.closed;
    this.pending = r.pending;                 // intents with no fill: reconciled below, never forgotten
    for (const e of this.pending.values()) this.journal.write({ type: "fail", id: e.id, why: "restart before fill" });
    this.pending.clear();
    this.shadow = new Map(); this.shadowClosed = r.shadow || []; this.ready = []; this.cc = new Map(); this.live = new Map(); this.peaks = new Map(); this.closing = new Set(); this.events = []; this.seq = 0; this.watch = new Map(); this.watching = { total: 0, young: 0, thin: 0, ready: 0 }; this.paused = false; this.unknown = new Map(); this.sellTries = new Map(); this.skips = new Map(); this.recent = []; this.rugCache = new Map(); this.cool = new Map(); this.errors = []; this.hist = new Map(); this.ph = new Map(); this.lastDrop = new Map(); this.whale = new Map(); this.whaleAt = new Map();
    this.ticks = 0; this.lastTickAt = null; this.startedAt = this.now(); this.counts = { drop: 0, block: 0, buy: 0, sell: 0, fail: 0 };
    // a restart (live update) must not forget which coins just lost: PODCAT was bought again right after a -12.5% loss
    // the living organism: what it measured survives restarts (config.json), else it is rebuilt from the journal's closes
    this.org = org ? O.sane(org) : O.rebuild(this.closed); this.org.idle.since = this.now();
    for (const c of this.closed) if (c.ret < 0 && c.at && this.now() - c.at < (c.ret <= -0.5 ? 7 * 1440 : (this.cfg.loserCoolMin ?? 60)) * 60000) { const until = c.at + (c.ret <= -0.5 ? 7 * 1440 : (this.cfg.loserCoolMin ?? 60)) * 60000; if (c.pool) this.cool.set(c.pool, until); if (c.mint) this.cool.set(c.mint, until); }
  }
  get equity() { return this.startEq + this.closed.reduce((s, c) => s + (c.pnl || 0), 0); }
  /** The background paper book: every signal that passed the filters, taken or not, run through the same exit rules. */
  edge(n = 20) {
    const last = this.shadowClosed.slice(-n);
    const avg = last.length ? last.reduce((a, x) => a + x.ret, 0) / last.length : null;
    return { n: last.length, avg, wins: last.filter((x) => x.ret > 0).length, total: this.shadowClosed.length };
  }
  get unit() { return this.exec.name === "live" ? "SOL" : "$"; }
  #skip(name, why) { const k = why.replace(/\d+(\.\d+)?/g, "#").slice(0, 90); this.skips.set(k, (this.skips.get(k) || 0) + 1); this.recent.push({ at: this.now(), name, why }); if (this.recent.length > 40) this.recent.shift(); }
  get fastMode() { return typeof this.feed.quotes === "function"; }
  async tick() {
    if (this.fastMode) { await this.slow(); await this.fast(); return; }
    this.ticks++; this.lastTickAt = this.now();
    try { await this.#reconcile(); } catch (e) { this.#err("reconcile", e); }
    try { await this.#manage(); } catch (e) { this.#err("manage", e); }
    try { await this.#scan(); } catch (e) { this.#err("scan", e); }
  }
  /** The slow lane (a minute-chart feed that allows ~30 calls a minute): discovery, chart cache, shadow book, backstop exits. */
  async slow() {
    try { await this.#reconcile(); } catch (e) { this.#err("reconcile", e); }
    try { await this.#manage(); } catch (e) { this.#err("manage", e); }
    try {
      const list = await this.#discover();
      let n = 0;
      const want = [...list.map((m) => m.pool), ...[...this.open.values()].map((p) => p.pool)];
      for (const pool of want) {
        const hit = this.cc.get(pool);
        if (hit && this.now() - hit.at < 70000) continue;
        if (n++ >= 6) break;
        try { this.cc.set(pool, { cs: await this.feed.candles(pool, { limit: 100 }), at: this.now() }); } catch (e) { this.#err(`candles ${pool.slice(0, 6)}`, e); }
      }
      for (const [k, v] of this.cc) if (this.now() - v.at > 600000) this.cc.delete(k);
      // ULTRA INSTINCT: read the big trades (whales) on what we hold and on the busiest coins we are close to buying, 2 pools a cycle
      if (this.feed.trades) {
        const hot = [...[...this.open.values()].map((p) => p.pool), ...[...this.ready].sort((a, b) => (b.vol5 || 0) - (a.vol5 || 0)).map((m) => m.pool)].filter((p, i, a) => a.indexOf(p) === i && !(this.now() - (this.whaleAt.get(p) || 0) < 30000)).slice(0, 2);
        for (const pool of hot) {
          this.whaleAt.set(pool, this.now());
          try {
            const liq = this.live.get(pool)?.liqUsd || this.watch.get(pool)?.liqUsd || 0, big = Math.max(400, liq * 0.02), since = this.now() - 120000;
            const tr = (await this.feed.trades(pool, 300)).filter((x) => x.t >= since && x.usd >= big);
            const buy = tr.filter((x) => x.kind === "buy").reduce((a, x) => a + x.usd, 0), sell = tr.filter((x) => x.kind === "sell").reduce((a, x) => a + x.usd, 0);
            this.whale.set(pool, { buy, sell, whales: new Set(tr.filter((x) => x.kind === "buy").map((x) => x.from)).size, at: this.now() });
          } catch (e) { this.#err(`whales ${pool.slice(0, 6)}`, e); }
        }
      }
    } catch (e) { this.#err("slow", e); }
  }
  /** The fast lane (every few seconds): live prices for everything that matters -> exits first, then entries. */
  async fast() {
    this.ticks++; this.lastTickAt = this.now();
    const pools = [...new Set([...this.open.values()].map((p) => p.pool).concat(this.ready.map((m) => m.pool)))];
    let q = new Map();
    if (pools.length) { try { q = await this.feed.quotes(pools); } catch (e) { this.#err("quotes", e); } }
    for (const [pool, x] of q) { const ph = this.ph.get(pool) || []; ph.push([this.now(), x.price]); while (ph.length && this.now() - ph[0][0] > 120000) ph.shift(); this.ph.set(pool, ph); this.live.set(pool, { ...x, at: this.now() }); const w = this.watch.get(pool); if (w) { if (x.liqUsd != null) w.liqUsd = x.liqUsd; w.buys5 = x.buys5; w.sells5 = x.sells5; w.vol5 = x.vol5; } }
    for (const p of this.open.values()) { const lv = this.live.get(p.pool); if (!lv || this.now() - lv.at > 20000) continue; const h = this.hist.get(p.id) || []; h.push([this.now(), lv.price]); if (h.length > 150) h.shift(); this.hist.set(p.id, h); }   // what the trade cards draw
    try { await this.#fastExits(); } catch (e) { this.#err("exits", e); }
    try { await this.#fastEntries(); } catch (e) { this.#err("entries", e); }
  }
  async #fastExits() {
    const c = this.cfg;
    for (const p of [...this.open.values()]) {
      const lv = this.live.get(p.pool);
      if (!lv || this.now() - lv.at > 20000) continue;                       // no fresh price: the chart backstop in slow() covers it
      // lesson 6: decide on what a sale would REALLY return (Jupiter's sell quote, every ~4 s), not on a chart price.
      // FLOAT's -8% stop on the chart filled at -22%. The chart price stays as the fallback when no quote is fresh.
      if (this.exec.valueSol && p.stake > 0 && (!p.vAt || this.now() - p.vAt > Math.max(400, 400 * this.open.size))) { p.vAt = this.now(); try { const v = await this.exec.valueSol(p); if (v != null) { p.val = v; p.valAt = this.now(); } } catch { /* chart fallback */ } }
      const real = p.val != null && this.now() - p.valAt < 15000;
      const entry = real ? p.stake : p.entryPx, price = real ? p.val : lv.price;
      const pk = this.peaks.get(p.id); const pr = Math.max(pk?.r ?? 0, price / entry - 1); this.peaks.set(p.id, { r: pr }); const peak = entry * (1 + pr);   // peak as a RATIO: survives quote<->chart switches and the half sell
      const rNow = price / entry - 1, held = this.now() - p.at;
      p.tPeak ??= 0; p.tLow ??= 0;
      if (rNow < (p.low ?? 0)) p.tLow = held; if (rNow > (p.hi ?? 0)) p.tPeak = held;
      p.low = Math.min(p.low ?? 0, rNow); p.hi = Math.max(p.hi ?? 0, rNow);   // the organism replays exits on these (deepest dip, best point, and which came first)
      const sl = p.sl ?? c.sl, tp = p.tp ?? c.tp, partAt = p.partAt ?? c.partAt ?? 0.25, lockFrom = p.lockFrom ?? c.lockFrom ?? 0.04;   // the levels it was bought under   // the deepest dip it showed (a ratio, so the golden take does not move it): tells the next check whether winners dip before they run
      // golden take (Alex): at +25% sell 38.2% (1 - 0.618). That banks 0.4775 of the stake; the 61.8% left rides the trail.
      // Worst case after this (the win lock at +1%): 0.4775 + 0.618 x 1.01 = 1.10, so the trade ends at least about +10% before fees.
      if (real && !p.partDone && this.exec.sellPart && tp > partAt && price >= entry * (1 + partAt) && price < entry * (1 + tp)) {
        p.partDone = true; p.tPartAt = held;
        const r = await this.exec.sellPart({ mint: p.mint, frac: c.partFrac ?? 0.382 }).catch((e) => ({ ok: false, why: e.message }));
        if (r.ok) {
          const got = Number(r.outAmount) / 1e9, f = c.partFrac ?? 0.382;
          p.stake0 ??= p.stake; p.banked = (p.banked || 0) + got; p.stake = +(p.stake * (1 - f)).toFixed(6); p.tokens = r.left; p.val = null;
          // lesson 20: the peak was the WHOLE position's value; after selling part it must shrink with it, or the rest looks +100% down and is dumped at once
          /* peak is a ratio now: nothing to shrink */
          this.journal.write({ ...p, type: "open" });
          this.#ev("sell", p.name, `golden take: sold ${Math.round((c.partFrac ?? 0.382) * 100)}% at +${Math.round((price / entry - 1) * 100)}%, banked ${got.toFixed(4)} SOL`, { ret: price / entry - 1, fill: +(got / (p.stake0 * f) - 1).toFixed(4), partial: true });   // ret = the quote it saw, fill = what the part really sold for
          continue;
        }
      }
      let why = null, kind = null, trig = null;
      // lesson 10: one bad quote is noise (wifbot: stop -7% fired, the sale filled +2.2%). A stop needs two looks in a row below it, unless it is already far through.
      const under = price <= entry * (1 + (real ? sl * 0.8 : sl)); p.under   // lesson 44: crashes gap 6-20% past the stop between looks; a real quote fires at 80% of the stop so the fill lands near it
      = under ? (p.under || 0) + 1 : 0;
      // lesson 28 (team): waiting for a second look let 2 of 4 stops gap to -10..-12%. A REAL Jupiter quote under the stop sells at once; a chart price still needs two looks.
      if (under && (real || p.under >= 2 || price <= entry * (1 + sl * 1.3))) { why = `stop ${Math.round(sl * 100)}%`; kind = "stop"; trig = sl; }
      else if (under) why = null;
      else if ((() => { const w = this.whale.get(p.pool); return w && this.now() - w.at < 60000 && w.sell >= (this.cfg.whaleUsd ?? 1500) && w.sell >= 2 * w.buy; })()) { why = "ULTRA INSTINCT: whales leaving"; kind = "whale"; }
      else if ((p.partDone || peak >= entry * (1 + lockFrom)) && price <= entry * (1 + (c.lockAt ?? 0.01))) { why = `locked: was up ${Math.round((peak / entry - 1) * 100)}%, out before it turns red`; kind = "lock"; trig = c.lockAt ?? 0.01; }   // lesson 4: a winner never becomes a loser
      else if (peak >= entry * (1 + c.trailFrom) && price <= peak * (1 - c.trail)) { why = `trailing stop from +${Math.round((peak / entry - 1) * 100)}%`; kind = "trail"; trig = (peak * (1 - c.trail)) / entry - 1; }
      else if (price >= entry * (1 + tp)) { why = `take profit +${+(tp * 100).toFixed(1)}%`; kind = "take"; trig = tp; }
      else if (this.now() - p.at >= c.maxHoldMin * 60000) { why = "time stop"; kind = "time"; }
      else if (c.staleMin > 0 && c.staleOk === true && this.now() - p.at >= c.staleMin * 60000 && price / entry - 1 < (c.staleRet ?? 0.01)) { why = `flat after ${c.staleMin}m: money back to work`; kind = "stale"; }   // lesson 2: dead money out
      if (!why) continue;
      const ret = real ? price / entry - 1 : (price * (1 - c.slippage)) / entry - 1 - 2 * c.fee;
      p.est = { ret: +ret.toFixed(4), real, peak: +(peak / entry - 1).toFixed(4), low: +p.low.toFixed(4), kind, trig: +(trig ?? ret).toFixed(4) };   // what it SAW when it decided, to compare with the fill
      await this.#close(p, { ret, why, exitPx: real ? lv.price : price });
    }
  }
  /** price change over the last `secs` seconds from the live quotes (null until there is that much history) */
  #mom(pool, secs) { const ph = this.ph.get(pool) || []; if (ph.length < 2) return null; const now = ph[ph.length - 1]; const then = ph.find(([t]) => now[0] - t <= secs * 1000); if (!then || now[0] - then[0] < secs * 500) return null; return now[1] / then[1] - 1; }
  /** Every hard filter (unchanged since build 51: live price, volume/flow, the $25k pool floor, momMin..momMax, the chart
   *  breakout, cooldowns). -> { cs, s, sig } when the coin may be bought right now, else null. loud=false: a silent re-check. */
  #gate(m, loud = true) {
    {
      if ([...this.open.values()].some((p) => p.pool === m.pool || p.mint === m.mint) || this.cool.get(m.pool) > this.now() || this.cool.get(m.mint) > this.now()) return null;
      const lv = this.live.get(m.pool), hit = this.cc.get(m.pool);
      // every coin it looks at shows on the screen as it is filtered (Alex: constant movement), at most once per coin every 20 s
      const quiet = (k) => { if (!loud) return;  const t = this.lastDrop.get(m.pool) || 0; if (this.now() - t > 20000) { this.lastDrop.set(m.pool, this.now()); this.skips.set(k, (this.skips.get(k) || 0) + 1); this.#ev("drop", m.name, k.replace(/^live: /, "")); } };   // lesson 35: count a coin once per 20 s, not once per pass (30k "too thin" was ~25 checks a second)
      if (!lv || this.now() - lv.at > 15000) { quiet("waiting: no live price yet"); return null; }
      if (!hit || hit.cs.length < 6) {
        // Alex 2026-10-29: never wait on a chart. Live volume + buyers ahead = buy, straight from the live price.
        const flow = (lv.buys5 || 0) + (lv.sells5 || 0);
        if (!((lv.vol5 || 0) >= (this.cfg.liveMinVol5 ?? 3000) && flow >= (this.cfg.liveMinFlow ?? 8) && lv.buys5 >= lv.sells5 * (this.cfg.liveBuyRatio ?? 1.15))) { quiet("live: volume or buyers too thin"); return null; }
        // lesson 1 (2026-10-29 live data): buying a coin that is not moving = sitting at the cost of entry. Buy only a coin already rising.
        let mom = this.#mom(m.pool, this.cfg.momSecs ?? 30), s_pull = null, fibTp = null;
        // lesson 3: thin pools rug and slip (KIMWIFHAT -80%, Trump stop -8% filled at -19%). Only pools deep enough to get out of.
        if ((lv.liqUsd ?? 0) < (this.cfg.liveMinLiq ?? 15000)) { quiet("live: pool too thin to get out of"); return null; }
        const w = this.whale.get(m.pool), instinct = this.cfg.fib === 0 && w && this.now() - w.at < 60000 && w.buy >= (this.cfg.whaleUsd ?? 1500) && w.buy >= 2 * w.sell;
        if (!instinct) {
          // lesson 36 (the math): break-even needs a 32% win rate (avg win +18.6%, avg loss -8.9%); it won 23%, and 8 of the last 10
          // losers never rose once after the buy (peak 0): it was buying the TOP of the spike. Buy the PULLBACK instead: the coin ran
          // >= momMin inside the last 2 min, has come back 3-12% from that high, and the last tick is up again (a higher low).
          if (this.cfg.fib !== 0) {
            // Alex 2026-10-30 "read the coin's fibonacci chart, that's the whole point": the last swing low->high in 2 min; buy when the price
            // has retraced into the golden zone (0.382-0.618 of the swing) and the last tick is up; take profit back at the swing high.
            const ph = (this.ph.get(m.pool) || []).filter(([t]) => this.now() - t <= 120000);
            if (ph.length < 8) { quiet("live: watching its price first"); return null; }   // 2026-10-30: at least 8 looks before a swing is read
            let hi = 0, hiAt = 0; ph.forEach(([, v], i) => { if (v > hi) { hi = v; hiAt = i; } });
            const lo = Math.min(...ph.slice(0, hiAt + 1).map(([, v]) => v)), run = hi / lo - 1;
            const r = (hi - lv.price) / Math.max(1e-18, hi - lo), after = ph.slice(hiAt + 1).map(([, v]) => v);
            if (run < (this.cfg.fibMinRun ?? 0.12)) { quiet("fib: no swing to read"); return null; }   // a 4% swing cannot pay a 2.9% round trip
            if (r < 0.382) { quiet("fib: above 0.382, waiting for the golden zone"); return null; }
            if (r > 0.618) { quiet("fib: broke 0.618, swing failed"); return null; }
            if (!after.length) { quiet("fib: in the zone, waiting for the bounce"); return null; }
            const minSince = Math.min(...after), minAt = after.lastIndexOf(minSince);
            if ((hi - minSince) / Math.max(1e-18, hi - lo) > 0.786) { quiet("fib: dipped past 0.786, swing failed"); return null; }
            if (hi / lv.price - 1 < (this.cfg.fibMinTp ?? 0.08)) { quiet("fib: target too close to pay the fees"); return null; }
            // a real bounce: 0.5% off the low since the high, and the low held for 2 looks (one up-tick in a fall is not a bounce)
            if (!(lv.price > minSince * 1.005 && minAt <= after.length - 3)) { quiet("fib: in the zone, waiting for the bounce"); return null; }
            mom = run; s_pull = r; fibTp = hi / lv.price - 1;
          } else if (this.cfg.pullback !== 0) {
            const ph = (this.ph.get(m.pool) || []).filter(([t]) => this.now() - t <= 120000);
            if (ph.length < 4) { quiet("live: watching its price first"); return null; }
            let lo = Infinity, hi = 0, hiAt = -1; ph.forEach(([, v], i) => { if (v < lo && hiAt < 0) lo = v; if (v > hi) { hi = v; hiAt = i; } });
            lo = Math.min(...ph.slice(0, hiAt + 1).map(([, v]) => v));
            const run = hi / lo - 1, pull = 1 - lv.price / hi, prev = ph[ph.length - 2][1];
            if (run < (this.cfg.momMin ?? 0.10)) { quiet("live: no run to pull back from"); return null; }
            if (pull < (this.cfg.pullMin ?? 0.03)) { quiet("live: at the top, waiting for a pullback"); return null; }
            if (pull > (this.cfg.pullMax ?? 0.12)) { quiet("live: pulled back too far (dumping)"); return null; }
            if (!(lv.price > prev)) { quiet("live: still falling, waiting for the bounce"); return null; }
            mom = run; s_pull = pull;
          } else {
            if (mom == null) { quiet("live: watching its price first"); return null; }
            if (mom < (this.cfg.momMin ?? 0.10)) { quiet("live: not rising right now"); return null; }
            if (mom > (this.cfg.momMax ?? 0.21)) { quiet("live: already ran too far"); return null; }   // lesson 34
          }
        } else if (mom != null && mom < 0) { quiet("instinct: whales in but price falling"); return null; }
        const t = Math.floor(this.now() / 60000) * 60000, c0 = { t, o: lv.price, h: lv.price, l: lv.price, c: lv.price, v: lv.vol5 / 5 };
        const sg = { fibTp: fibTp, path: instinct ? "whale" : "mom", rise: +(mom ?? 0), vol5: lv.vol5 || 0, buys: lv.buys5 || 0, sells: lv.sells5 || 0, ratio: (lv.buys5 || 0) / Math.max(1, lv.sells5 || 0), liq: lv.liqUsd ?? 0 };
        return { cs: Array.from({ length: 6 }, (_, k) => ({ ...c0, t: t - (5 - k) * 60000 })), sig: sg, s: { ok: true, why: instinct ? `ULTRA INSTINCT: ${w.whales} whale${w.whales === 1 ? "" : "s"} bought $${Math.round(w.buy)} in 2 min (sold $${Math.round(w.sell)})` : fibTp != null ? `fib buy: swing +${(mom * 100).toFixed(1)}%, at the ${s_pull.toFixed(3)} retrace and bouncing, target the high +${(fibTp * 100).toFixed(1)}%` : s_pull != null ? `pullback buy: ran ${(mom * 100).toFixed(1)}% in 2 min, back ${(s_pull * 100).toFixed(1)}% and bouncing, $${Math.round(lv.vol5)} volume in 5m, ${lv.buys5} buys vs ${lv.sells5} sells` : `rising ${((mom || 0) * 100).toFixed(1)}% in ${this.cfg.momSecs ?? 30}s, $${Math.round(lv.vol5)} volume in 5m, ${lv.buys5} buys vs ${lv.sells5} sells` } };
      }
      // the chart so far, plus the minute in progress built from the live price
      const cs = hit.cs.slice(), last = cs[cs.length - 1], minute = Math.floor(this.now() / 60000) * 60000;
      if (last.t >= minute) cs[cs.length - 1] = { ...last, c: lv.price, h: Math.max(last.h, lv.price), l: Math.min(last.l, lv.price), v: Math.max(last.v, lv.vol5 / 5) };
      else cs.push({ t: minute, o: last.c, h: Math.max(last.c, lv.price), l: Math.min(last.c, lv.price), c: lv.price, v: lv.vol5 / 5 });
      if (this.cfg.fib !== 0) {
        // Alex 2026-10-30: "read the chart and throw the fibonacci tool on it". The swing on the 1-minute chart (last 30 min):
        // low -> high; buy the bounce inside the golden zone (0.382-0.618 retrace), never a new high, never a broken swing.
        const w = cs.slice(-30); let hi = 0, hiAt = 0; w.forEach((k, i) => { if (k.h > hi) { hi = k.h; hiAt = i; } });
        const lo = Math.min(...w.slice(0, hiAt + 1).map((k) => k.l)), run = hi / lo - 1, r = (hi - lv.price) / Math.max(1e-18, hi - lo);
        const ph = (this.ph.get(m.pool) || []).filter(([t]) => t > w[hiAt].t), after = ph.map(([, v]) => v);
        const minSince = Math.min(...w.slice(hiAt + 1).map((k) => k.l), ...after, lv.price), minAt = after.lastIndexOf(minSince);
        if (!(run >= (this.cfg.fibMinRun ?? 0.12))) { quiet("fib: no swing on the chart"); return null; }
        if (r < 0.382) { quiet("fib: above 0.382, waiting for the golden zone"); return null; }
        if (r > 0.618) { quiet("fib: broke 0.618, swing failed"); return null; }
        if ((hi - minSince) / Math.max(1e-18, hi - lo) > 0.786) { quiet("fib: dipped past 0.786, swing failed"); return null; }
        const fibTp = hi / lv.price - 1;
        if (fibTp < (this.cfg.fibMinTp ?? 0.08)) { quiet("fib: target too close to pay the fees"); return null; }
        if (after.length < 8) { quiet("live: watching its price first"); return null; }
        if (!(lv.price > minSince * 1.005 && minAt <= after.length - 3 && cs.length >= 2 && cs[cs.length - 1].c > cs[cs.length - 2].c)) { quiet("fib: in the zone, waiting for the bounce"); return null; }
        if ((lv.liqUsd ?? 0) < (this.cfg.liveMinLiq ?? 15000)) { quiet("live: pool too thin to get out of"); return null; }
        if (!((lv.buys5 || 0) >= (lv.sells5 || 0) * (this.cfg.liveBuyRatio ?? 1.15))) { quiet("fib: sellers in control"); return null; }
        const sg = { fibTp: +fibTp.toFixed(4), path: "fib", rise: +run.toFixed(4), vol5: lv.vol5 || 0, buys: lv.buys5 || 0, sells: lv.sells5 || 0, ratio: (lv.buys5 || 0) / Math.max(1, lv.sells5 || 0), liq: lv.liqUsd ?? 0, fib: +r.toFixed(3) };
        return { cs, sig: sg, s: { ok: true, why: `fib buy (chart): 30-min swing +${(run * 100).toFixed(1)}%, at the ${r.toFixed(3)} retrace and bouncing, high +${((hi / lv.price - 1) * 100).toFixed(1)}% above` } };
      }
      const sig = entrySignal(cs, cs.length - 1, this.cfg, { ...m, ...lv });
      if (!sig.ok) { if (!/no breakout|volume/.test(sig.why)) { if (loud) this.#skip(m.name, sig.why); } else quiet(sig.why.startsWith("volume") ? "volume too low" : "not near its high"); return null; }        // the thousand quiet checks a minute are not news
      const r3 = cs.length >= 4 && cs[cs.length - 4].c > 0 ? lv.price / cs[cs.length - 4].c - 1 : 0;   // the 3-minute breakout %
      return { cs, s: sig, sig: { path: "breakout", rise: r3, vol5: lv.vol5 || 0, buys: lv.buys5 || 0, sells: lv.sells5 || 0, ratio: (lv.buys5 || 0) / Math.max(1, lv.sells5 || 0), liq: lv.liqUsd ?? 0 } };
    }
  }
  /** Entries (build 52, the living organism): every hard filter first, then the organism scores the coin's band (a Thompson draw,
   *  so thin bands still get tried). Positive -> buy at its size. Not positive -> remembered; after 97 s with no entry the
   *  best-scored fresh coin that still passes every filter is bought at 0.618 size. It never stops trading. */
  async #fastEntries() {
    if (this.paused || this.open.size >= this.cfg.maxOpen) return;
    for (const m of this.ready) {
      if (this.open.size >= this.cfg.maxOpen || this.paused) break;
      const g = this.#gate(m, true); if (!g) continue;
      const sc = O.score(this.org, g.sig, { sample: true, rng: this.rng });
      // the narrative (build 53): a dying theme is skipped, a hot rising theme passes a looser entry (organism score not needed)
      const nh = this.narr?.heat(m) || null, hot = nh?.trend === "rising" && nh.strong && !nh.late;
      if (nh?.trend === "dying") { this.#skip(m.name, narrWhy(nh)); continue; }
      // fewer than 3 closes measured: nothing to choose on yet, so it explores (sizeMul is 0.618 until a band has 13 closes)
      if (!(sc > 0) && O.measured(this.org) && !hot) { O.noteIdle(this.org, g.sig, sc, m, this.now()); continue; }
      this.cool.set(m.pool, this.now() + 30000);
      // size: rising -> full size (1.0, still capped by the executor), saturating / late copycat -> 0.618, else the organism's
      const mul = hot ? 1 : nh && (nh.trend === "saturating" || nh.late) ? O.INV : O.sizeMul(this.org, g.sig);
      await this.#consider(m, g.cs, nh ? { ...g.s, why: `${g.s.why} · ${narrWhy(nh)}` } : g.s, { m: mul, sig: g.sig, narr: nh });
    }
    if (this.paused || this.open.size >= this.cfg.maxOpen) return;
    const pick = O.idlePick(this.org, this.now(), (m) => !!this.#gate(m, false) && this.narr?.heat(m)?.trend !== "dying");
    if (pick) {
      const g = this.#gate(pick.cand, false);
      this.cool.set(pick.cand.pool, this.now() + 30000);
      await this.#consider(pick.cand, g.cs, { ...g.s, why: `${g.s.why} (idle pick: least-bad band, 0.618 size)` }, { m: O.INV, sig: g.sig });
    }
  }
  /** What the screen animates: one event per decision. type: drop | block | buy | sell | fail */
  #ev(type, name, why, extra = {}) { if (this.counts[type] != null) this.counts[type]++; this.events.push({ seq: ++this.seq, at: this.now(), type, name, why, ...extra }); if (this.events.length > 120) this.events.shift(); }
  #err(w, e) { this.errors.push({ at: this.now(), w, msg: String(e.message || e).slice(0, 140) }); if (this.errors.length > 20) this.errors.shift(); }
  /** Swaps the chain had not confirmed when polling stopped: look again until they are confirmed or dead. Never forgotten. */
  async #reconcile() {
    for (const [id, u] of [...this.unknown]) {
      const r = await this.exec.recheck(u.orderId);
      if (r.status === "pending") { if (this.now() - u.at > 15 * 60000) { this.journal.write({ type: "fail", id, why: "order never confirmed in 15 min" }); this.unknown.delete(id); } continue; }
      this.unknown.delete(id);
      if (r.status === "failed") { this.journal.write({ type: "fail", id, why: r.why }); this.#skip(u.name, `order ${r.why}`); continue; }
      const pos = { ...u.pos, stake: r.inAmount ? Number(r.inAmount) / 1e9 : u.pos.stake, tokens: r.outAmount || null };
      this.journal.write(pos); this.open.set(id, pos);
    }
  }
  /** Sell everything now, one position at a time, through the same journalled path as any exit. */
  /** Alex's Sell button on one position: sold now through the same journalled path as any exit. */
  async sellOne(id) {
    const p = this.open.get(id); if (!p) return false;
    const lv = this.live.get(p.pool), px = lv?.price ?? p.entryPx;
    return this.#close(p, { ret: (px * (1 - this.cfg.slippage)) / p.entryPx - 1 - 2 * this.cfg.fee, why: "you pressed Sell", exitPx: px });
  }
  async flatten() {
    this.paused = true;
    for (const p of [...this.open.values()]) {
      this.journal.write({ type: "sell-intent", id: p.id, name: p.name, why: "flatten (you pressed it)" });
      const r = (await this.exec.sell?.(p)) ?? { ok: true };
      if (!r.ok && !r.noBalance) { this.#err(`flatten ${p.name}`, new Error(r.why)); continue; }
      let ret = 0; if (r.ok && r.outAmount != null && r.inAmount != null && p.stake > 0) ret = Number(r.outAmount) / 1e9 / p.stake - 1;
      const pnl = (p.stake0 ?? p.stake) * ret;
      this.journal.write({ type: "close", id: p.id, name: p.name, ret, pnl, why: "flatten", note: r.noBalance ? "the token was no longer in the wallet" : null });
      this.open.delete(p.id); this.closed.push({ ...p, type: "close", ret, pnl, why: "flatten" });
    }
  }
  async #manage() {
    for (const [pool, sp] of [...this.shadow]) {
      let cs; try { cs = await this.feed.candles(pool, { limit: 100 }); } catch { continue; }
      const x = this.#candleRule(cs, { entryPx: sp.entryPx, candleT: sp.candleT, at: sp.at });
      if (!x.open || this.now() - sp.at > this.cfg.maxHoldMin * 120000) {
        const rec = { type: "shadow-close", name: sp.name, ret: x.open ? 0 : x.ret, why: x.open ? "stale" : x.why };
        this.journal.write(rec); this.shadow.delete(pool); this.shadowClosed.push(rec);
      }
    }
    for (const p of [...this.open.values()]) {
      let cs; try { cs = await this.feed.candles(p.pool, { limit: 100 }); } catch (e) { this.#err(`candles ${p.name}`, e); continue; }
      const x = this.#candleRule(cs, p);
      const stale = this.now() - p.at > this.cfg.maxHoldMin * 60000 * 2;       // data gap: never hold forever
      if (!x.open || stale) await this.#close(p, { ret: x.ret, why: x.open ? "stale data, closed" : x.why, exitPx: x.exitPx });
    }
  }
  /** The chart's verdict on a position: candles AFTER the entry only, measured from the real entry price. */
  #candleRule(cs, p) {
    const first = cs.findIndex((c) => c.t > p.candleT);
    if (first < 0) return { open: true, ret: 0, why: "no candle since entry yet" };
    const i0 = Math.max(0, first - 1);
    return managePosition(cs, i0, this.cfg, { entryPx: p.entryPx ?? undefined, startT: p.candleT });
  }
  /** One exit, journalled before it is sent. Returns true when the position is gone. */
  async #close(p, x) {
    if (!this.open.has(p.id) || this.closing.has(p.id)) return false;
    this.closing.add(p.id);
    try {
      let ret = x.ret, why = x.why, note = null;
      const hold = this.sellTries.get(p.id) || 0;
      this.journal.write({ type: "sell-intent", id: p.id, name: p.name, why });                 // on disk BEFORE the sell goes out
      const r = (await this.exec.sell?.(p)) ?? { ok: true };
      if (!r.ok) {
        if (r.noBalance) note = "the token was no longer in the wallet (result estimated from the chart)";
        else if (hold + 1 < 4) { this.sellTries.set(p.id, hold + 1); this.#err(`sell ${p.name}`, new Error(r.why)); return false; }   // try again next tick
        else note = `sell failed 4 times (${r.why}): ${this.exec.safety || "the position is still in the wallet: press Sell everything"}`;
      } else if (r.outAmount != null && r.inAmount != null && p.stake > 0) {
        ret = p.banked ? (Number(r.outAmount) / 1e9 + p.banked) / p.stake0 - 1 : Number(r.outAmount) / 1e9 / p.stake - 1;   // the real fill (plus anything banked on the way), not the model
      }
      const est = p.est || {}, stake0 = p.stake0 ?? p.stake;
      const restRet = r.ok && r.outAmount != null && p.stake > 0 ? Number(r.outAmount) / 1e9 / p.stake - 1 : est.ret ?? ret;   // the part still held at the exit, alone
      const trig = typeof est.trig === "number" ? est.trig : null, holdS = +((this.now() - p.at) / 1000).toFixed(1);
      // fee: the buy's network fee from the chain (the sale's fee is already inside its net lamports); unknown -> the cap
      const learn = { sig: p.sig || null, holdS, stake: stake0, feeLamports: p.buyFee ?? this.exec.caps?.maxFeeLamports ?? null, trig, gap: trig != null ? +(restRet - trig).toFixed(4) : null, restRet: +restRet.toFixed(4), peak: p.hi ?? null, low: p.low ?? null, tPeak: p.tPeak ?? null, tLow: p.tLow ?? null, tPartAt: p.tPartAt ?? null, exitKind: est.kind || (why === "you pressed Sell" ? "manual" : "chart") };
      const pnl = (p.stake0 ?? p.stake) * ret;   // ret is on the whole stake (banked part included), so the P&L is too; p.stake is only what was left after the golden take
      this.journal.write({ type: "close", id: p.id, name: p.name, ret, pnl, why, note, exitPx: x.exitPx, est: p.est || null, ...learn });
      { const until = this.now() + (ret <= -0.5 ? 7 * 24 * 60 : ret < 0 ? (this.cfg.loserCoolMin ?? 60) : this.cfg.cooldownMin) * 60000;  /* a rug is banned for a week */ this.cool.set(p.pool, until); if (p.mint) this.cool.set(p.mint, until); }   // by coin, not just by pool (PODCAT x3)   // lesson 7: a coin that just lost gets an hour off (FLOAT x4)       // never re-enter the same coin straight after an exit
      this.open.delete(p.id); this.sellTries.delete(p.id); this.peaks.delete(p.id); this.hist.delete(p.id);
      this.closed.push({ ...p, type: "close", ret, pnl, why, note, at: this.now(), ...learn });
      // the living organism (build 52; replaces the momMin tuner): p, W, L and fees per band from this REAL fill, and every 8
      // closes a golden-step re-fit of sl / partAt / tp inside their clamps. momMin stays where it is set (the floor is 3%).
      try {
        const ch = O.step(this.org, { ...learn, ret }, this.cfg);
        if (ch.exits) for (const k of ["sl", "partAt", "tp"]) if (typeof ch.exits[k] === "number") this.cfg[k] = Math.min(O.CLAMP[k][1], Math.max(O.CLAMP[k][0], ch.exits[k]));
        this.onLearn?.({ org: O.persistable(this.org), exits: ch.exits });
      } catch (e) { this.#err("organism", e); }
      this.#ev("sell", p.name, why, { ret, pnl, stake: p.stake0 ?? p.stake, est: p.est || null });
      return true;
    } finally { this.closing.delete(p.id); }
  }
  /** Find new pools, remember them, keep their numbers fresh. Returns the ones worth a look. */
  async #discover() {
    const t = this.now();
    // Alex 2026-10-29: hunt the volume. New creations every cycle, plus one more source in turn: pump.fun bonding curve
    // (new + about to bond), bonded (PumpSwap), trending, deeper pages. The GeckoTerminal queue allows ~27 calls a minute.
    const extra = [() => this.feed.pumpPools?.(1), () => this.feed.bondedPools?.(1), () => this.feed.newPools(2), () => this.feed.pumpPools?.(2), () => this.feed.trendingPools(1), () => this.feed.bondedPools?.(2), () => this.feed.newPools(3), () => this.feed.pumpPools?.(3), () => this.feed.bondedPools?.(3)];
    this.srcI = (this.srcI || 0) + 1;
    const sources = this.watch.size ? [() => this.feed.newPools(1), extra[this.srcI % extra.length]] : [() => this.feed.newPools(1), () => this.feed.newPools(2), () => this.feed.trendingPools(1)];
    // more eyes: DexScreener's newest profiles and boosts every 10 s, outside the GeckoTerminal queue (Alex: scan more, trade more)
    if (this.feed.dexNew && !(this.now() - (this.dexAt || 0) < 10000)) { this.dexAt = this.now(); sources.push(() => this.feed.dexNew()); }
    for (const f of sources) {
      try { for (const x of (await f()) || []) if (!this.watch.has(x.pool)) this.watch.set(x.pool, x); else Object.assign(this.watch.get(x.pool), x); } catch (e) { this.#err("pools", e); }
    }
    const ageMin = (m) => (t - m.created) / 60000;
    for (const [k, m] of this.watch) if (ageMin(m) > this.cfg.maxAgeMin + 10) this.watch.delete(k);
    if (this.watch.size > 400) for (const [k] of [...this.watch].sort((a, b) => a[1].created - b[1].created).slice(0, this.watch.size - 400)) this.watch.delete(k);
    if (this.feed.multi && !this.fastMode) {
      const due = [...this.watch.values()].filter((m) => ageMin(m) >= this.cfg.minAgeMin && !(this.cool.get(m.pool) > t)).sort((a, b) => b.vol5 - a.vol5).slice(0, 90);
      for (let i = 0; i < due.length; i += 30) {
        try { for (const x of await this.feed.multi(due.slice(i, i + 30).map((m) => m.pool))) Object.assign(this.watch.get(x.pool) || {}, x); } catch (e) { this.#err("refresh", e); break; }
      }
    }
    // lesson 5: only pools priced in SOL. A '/ PUMP' or '/ USDC' pool's price is a different market from the SOL route Jupiter fills (HOYEAH: 'take profit +12%' filled at -19.7%).
    const list = [...this.watch.values()].filter((m) => !/ \/ (?!SOL$)\S+$/.test(m.name || "") && ageMin(m) >= this.cfg.minAgeMin && ageMin(m) <= this.cfg.maxAgeMin && (m.liqUsd ?? 0) >= (this.fastMode ? Math.max(this.cfg.minLiqUsd ?? 0, this.cfg.scanMinLiq ?? 10000) : this.cfg.minLiqUsd)).sort((a, b) => b.vol5 - a.vol5).slice(0, this.fastMode ? 40 : this.scanTop);
    const all = [...this.watch.values()];
    this.watching = { total: all.length, young: all.filter((m) => ageMin(m) < this.cfg.minAgeMin).length, thin: all.filter((m) => ageMin(m) >= this.cfg.minAgeMin && ageMin(m) <= this.cfg.maxAgeMin && (m.liqUsd ?? 0) < this.cfg.minLiqUsd).length, ready: list.length };
    this.ready = list;
    if (this.narr) { try { this.narr.pump(all); } catch (e) { this.#err("narrative", e); } }   // background only: never awaited
    return list.filter((m) => !(this.cool.get(m.pool) > t) && !(this.cool.get(m.mint) > t));   // lesson 18: 리핀 was bought again right after its -100% through another path
  }
  async #scan() {
    if (this.paused) { this.#skip("-", "buying is paused"); return; }
    if (this.open.size >= this.cfg.maxOpen) { this.#skip("-", `max ${this.cfg.maxOpen} open`); return; }
    const list = (await this.#discover()).slice(0, this.scanTop);
    for (const m of list) {
      if (this.open.size >= this.cfg.maxOpen) break;
      if ([...this.open.values()].some((p) => p.pool === m.pool)) continue;
      this.cool.set(m.pool, this.now() + 60000);
      let cs; try { cs = await this.feed.candles(m.pool, { limit: 100 }); } catch (e) { this.#err(`candles ${m.name}`, e); continue; }
      if (cs.length < 6) { this.#skip(m.name, "too few candles"); this.#ev("drop", m.name, "too few candles"); continue; }
      let s = entrySignal(cs, cs.length - 1, this.cfg, m);
      // First live buy of a fresh start: skip the signal once, on a coin that is green right now, so the real click path is proven in minutes (Alex, 2026-10-29).
      if (!s.ok && this.exec.name === "live" && !this.proofDone && cs[cs.length - 1].c > cs[cs.length - 1].o) s = { ok: true, why: "first live buy: proves the click path" };
      if (!s.ok) { this.#skip(m.name, s.why); this.#ev("drop", m.name, s.why); continue; }
      const nh = this.narr?.heat(m) || null;
      if (nh?.trend === "dying") { this.#skip(m.name, narrWhy(nh)); continue; }
      if (nh) s = { ...s, why: `${s.why} · ${narrWhy(nh)}` };
      await this.#consider(m, cs, s, nh ? { narr: nh } : {});
      if (this.open.size && s.why.startsWith("first live buy")) this.proofDone = true;
    }
  }
  /** A signal exists. Rug check, shadow book, edge gate, size, buy, record. Everything past here is on disk first. */
  async #consider(m, cs, s, o = {}) {
    const i = cs.length - 1;
    // the rug check is re-run every 10 minutes (a coin that was clean an hour ago can be pulled now), and EVERY entry path must
    // pass the liquidity floor, not only the live one (리핀 came in through the chart path and went to -100%)
    const rc = this.rugCache.get(m.mint);
    if (!rc || this.now() - (rc.at || 0) > 600000) this.rugCache.set(m.mint, { ...(await this.rug(m.mint)), at: this.now() });
    const r = this.rugCache.get(m.mint);
    const liqNow = this.live.get(m.pool)?.liqUsd ?? m.liqUsd ?? 0;
    if (liqNow < (this.cfg.entryMinLiq ?? 0)) { this.#skip(m.name, "pool too thin to get out of"); this.#ev("drop", m.name, "pool too thin to get out of"); return; }
    if (!r.pass) { this.#skip(m.name, `rug check: ${r.reason}`); this.#ev("block", m.name, r.reason); this.cool.set(m.pool, this.now() + 3600e3); return; }
    if (!this.shadow.has(m.pool)) { const sp = { name: m.name, candleT: cs[i].t, entryPx: cs[i].c * (1 + this.cfg.slippage), at: this.now() }; this.shadow.set(m.pool, sp); this.journal.write({ type: "shadow-open", pool: m.pool, ...sp }); }
    const e = this.edge();
    if (this.exec.name === "live" && e.n >= this.cfg.edgeMinN && e.avg < this.cfg.edgeFloor) { this.#skip(m.name, `shadow edge ${(e.avg * 100).toFixed(1)}% over last ${e.n}: waiting`); this.#ev("drop", m.name, "shadow edge negative"); return; }
    const id = `${m.mint.slice(0, 6)}-${this.now()}`;
    // the organism sizes it (lesson 30 grown up): a band with positive measured EV gets the full size, anything else 0.618 of it.
    // size = what the executor's own caps already allow at full scale; the stake is never above it (hard invariant).
    const mul = o.m === 1 ? 1 : O.INV;
    let size = this.equity * this.cfg.stakeFrac, stake = size * mul;
    if (this.exec.sizeSol) { try { size = (await this.exec.sizeSol({ streak: 0, scale: 1 })).sol; stake = (await this.exec.sizeSol({ streak: 0, scale: mul })).sol; } catch (err) { this.#skip(m.name, `wallet balance: ${err.message.slice(0, 60)}`); return; } }
    if (!(stake <= size + 1e-9)) { this.#skip(m.name, "stake above size: refused"); return; }
    const sigN = o.sig ? Object.fromEntries(Object.entries(o.sig).map(([k, v]) => [k, typeof v === "number" ? +v.toFixed(4) : v])) : null;
    const lv0 = { sig: sigN, m: mul, narr: o.narr ? { label: o.narr.label, trend: o.narr.trend } : null, t0: this.now(), sl: this.cfg.sl, tp: this.cfg.tp, partAt: this.cfg.partAt, lockFrom: this.cfg.lockFrom };   // the exits it was bought under
    this.journal.write({ type: "intent", id, name: m.name, mint: m.mint, enter: s.why });   // on disk BEFORE anything is done
    const f = await this.exec.buy({ mint: m.mint, pool: m.pool, usd: stake, scale: mul });
    if (!f.ok && f.unknown && f.orderId) {
      const pos0 = { ...lv0, type: "open", id, name: m.name, mint: m.mint, pool: m.pool, stake, orderId: f.orderId, tokens: null, entryPx: cs[i].c * (1 + this.cfg.slippage), candleT: cs[i].t, enter: s.why, rug: r.reason, at: this.now() };
      this.journal.write({ type: "pending-order", id, orderId: f.orderId, name: m.name });
      this.unknown.set(id, { orderId: f.orderId, name: m.name, at: this.now(), pos: pos0 }); this.#skip(m.name, "order sent, confirmation pending"); return;
    }
    if (!f.ok) { this.journal.write({ type: "fail", id, why: f.why }); this.#skip(m.name, `executor: ${f.why}`); this.#ev("fail", m.name, f.why); return; }
    if (f.sol != null) stake = Math.min(f.sol, size);
    const pos = { ...lv0, buyFee: f.feeLamports ?? null, type: "open", id, name: m.name, mint: m.mint, pool: m.pool, stake, orderId: f.orderId || null, tokens: f.outAmount || null, entryPx: cs[i].c * (1 + this.cfg.slippage), candleT: cs[i].t, enter: s.why, rug: r.reason, at: this.now() };
    this.journal.write(pos);
    this.open.set(id, pos);
    O.noteEntry(this.org, this.now());
    this.#ev("buy", m.name, s.why, { stake: pos.stake });
  }
  status() {
    const c = this.closed, wins = c.filter((x) => x.ret > 0);
    return {
      mode: this.exec.name, paused: this.paused, unit: this.unit, halted: this.exec.state?.halted || null, ticks: this.ticks, lastTickAt: this.lastTickAt, equity: +this.equity.toFixed(4), curve: this.closed.reduce((a, x) => (a.push(+((a[a.length - 1] ?? this.startEq) + (x.pnl || 0)).toFixed(4)), a), [this.startEq]).slice(-60), startEq: this.startEq,
      open: [...this.open.values()].map((p) => { const h = this.hist.get(p.id) || [], px = h.length ? h[h.length - 1][1] : null, e0 = p.entryPx; return { id: p.id, name: p.name, mint: p.mint, entryPx: e0, stake: +p.stake.toFixed(5), since: p.at, enter: p.enter, ret: p.val != null && this.now() - p.valAt < 15000 && p.stake > 0 ? p.val / p.stake - 1 : px && e0 ? px / e0 - 1 : null, peak: (() => { const pk = this.peaks.get(p.id); return !pk ? null : +pk.r.toFixed(4); })(), path: e0 ? h.map(([, v]) => +(v / e0 - 1).toFixed(4)) : [] }; }),
      narrative: this.narr ? this.narr.summary() : null,
      organism: { ...O.summary(this.org), exits: { sl: this.cfg.sl, partAt: this.cfg.partAt, tp: this.cfg.tp, lockFrom: this.cfg.lockFrom } },
      exits: { sl: this.cfg.sl, tp: this.cfg.tp, trailFrom: this.cfg.trailFrom, trail: this.cfg.trail, maxHoldMin: this.cfg.maxHoldMin },
      trades: c.length, wins: wins.length, winRate: c.length ? +(wins.length / c.length).toFixed(3) : null,
      recentClosed: c.slice(-8).map((x) => ({ name: x.name, ret: +(x.ret * 100).toFixed(1), pnl: +(x.pnl || 0).toFixed(4), why: x.why, note: x.note || null, enter: x.enter })),
      startedAt: this.startedAt, counts: this.counts, lines: this.seq, next: this.ready.slice(0, 4).map((m) => m.name), whyNot: Object.fromEntries([...this.skips].sort((a, b) => b[1] - a[1]).slice(0, 12)), events: this.events.slice(-60), watching: this.watching, edge: this.edge(), shadowOpen: this.shadow.size, recentSkips: this.recent.slice(-10), errors: this.errors.slice(-5),
    };
  }
}
