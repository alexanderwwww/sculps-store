// The day-trading brain. Pure functions: bars in, decisions out. Tested in test.mjs.
export const WATCH = ["SPY","QQQ","GLD","NVDA","AAPL","MSFT","AMZN","META","GOOGL","TSLA","AMD","AVGO"];
export const RULES = { riskPct: 0.01, rr: 2, maxTradesPerDay: 3, maxLossesPerDay: 2, startMin: 600, lastEntryMin: 900, flatMin: 955, maxPosPct: 0.25 };

// New York minutes since midnight for a unix second.
export function nyMinutes(ts) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ts * 1000));
  return Number(p.find(x => x.type === "hour").value) * 60 + Number(p.find(x => x.type === "minute").value);
}
export function nyDay(ts) { return new Date(ts * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" }); }

// Yahoo chart JSON -> today's regular-session 5m bars.
export function todayBars(chart) {
  const r = chart.chart.result[0]; const q = r.indicators.quote[0]; const ts = r.timestamp || [];
  const bars = ts.map((t, i) => ({ t, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] || 0 }))
    .filter(b => b.c != null && b.h != null && b.l != null);
  if (!bars.length) return [];
  const day = nyDay(bars[bars.length - 1].t);
  return bars.filter(b => nyDay(b.t) === day && nyMinutes(b.t) >= 570 && nyMinutes(b.t) < 960);
}

export function vwap(bars) {
  let pv = 0, v = 0;
  for (const b of bars) { const tp = (b.h + b.l + b.c) / 3; pv += tp * b.v; v += b.v; }
  return v ? pv / v : bars.at(-1)?.c;
}

// Opening range = first 30 minutes (9:30-10:00 NY). Signal on the last CLOSED bar.
export function signal(sym, bars, marketBias) {
  const or = bars.filter(b => nyMinutes(b.t) < 600);
  const after = bars.filter(b => nyMinutes(b.t) >= 600);
  if (or.length < 6 || after.length < 1) return null;
  const hi = Math.max(...or.map(b => b.h)), lo = Math.min(...or.map(b => b.l));
  const last = after.at(-1), prev = after.length > 1 ? after.at(-2) : or.at(-1);
  const vw = vwap(bars);
  const avgVol = bars.slice(0, -1).reduce((a, b) => a + b.v, 0) / Math.max(1, bars.length - 1);
  const volOk = sym === "SPY" || sym === "QQQ" || sym === "GLD" ? last.v >= avgVol * 0.8 : last.v >= avgVol * 1.2;
  const range = hi - lo;
  if (range <= 0 || range / last.c > 0.04) return null; // opening range too wild
  if (last.c > hi && prev.c <= hi && last.c > vw && volOk && marketBias !== "down")
    return { symbol: sym, side: "long", entry: last.c, stop: Math.max(lo, vw - range * 0.25), reason: `Broke the opening range high ${hi.toFixed(2)} above VWAP ${vw.toFixed(2)} on volume` };
  if (last.c < lo && prev.c >= lo && last.c < vw && volOk && marketBias !== "up")
    return { symbol: sym, side: "short", entry: last.c, stop: Math.min(hi, vw + range * 0.25), reason: `Broke the opening range low ${lo.toFixed(2)} below VWAP ${vw.toFixed(2)} on volume` };
  return null;
}

export function bias(spyBars) {
  if (spyBars.length < 7) return "flat";
  const vw = vwap(spyBars), c = spyBars.at(-1).c, o = spyBars[0].o;
  if (c > vw && c > o) return "up";
  if (c < vw && c < o) return "down";
  return "flat";
}

export function size(sig, balance) {
  const risk = Math.abs(sig.entry - sig.stop);
  if (!(risk > 0)) return null;
  let shares = Math.floor((balance * RULES.riskPct) / risk);
  shares = Math.min(shares, Math.floor((balance * RULES.maxPosPct) / sig.entry));
  if (shares < 1) return null;
  const target = sig.side === "long" ? sig.entry + risk * RULES.rr : sig.entry - risk * RULES.rr;
  return { ...sig, shares, target: +target.toFixed(2), stop: +sig.stop.toFixed(2), entry: +sig.entry.toFixed(2) };
}

// Walk an open position through new bars. Returns {exit, why} or null.
export function check(pos, bars, flat) {
  for (const b of bars) {
    if (b.t <= pos.lastT) continue;
    const long = pos.side === "long";
    if (long ? b.l <= pos.stop : b.h >= pos.stop) return { exit: pos.stop, why: "Stop hit", t: b.t };
    if (long ? b.h >= pos.target : b.l <= pos.target) return { exit: pos.target, why: "Target hit", t: b.t };
  }
  if (flat) return { exit: bars.at(-1).c, why: "Flat before close", t: bars.at(-1).t };
  return null;
}

export const pnlOf = (p, exit) => +((exit - p.entry) * p.shares * (p.side === "long" ? 1 : -1)).toFixed(2);

// One full tick of the desk. state is mutated and returned with a log of what happened.
export async function tick(state, fetchBars, nowTs, askGrok) {
  const log = [];
  const day = nyDay(nowTs), min = nyMinutes(nowTs);
  if (state.day !== day) { state.day = day; state.todayTrades = 0; state.todayLosses = 0; }
  const want = new Set([...state.open.map(p => p.symbol), "SPY"]);
  const scanning = min >= RULES.startMin && min <= RULES.lastEntryMin && state.todayTrades < RULES.maxTradesPerDay && state.todayLosses < RULES.maxLossesPerDay && state.on;
  if (scanning) WATCH.forEach(s => want.add(s));
  const bars = {};
  for (const s of want) { try { bars[s] = await fetchBars(s); } catch (e) { log.push(`No prices for ${s}`); } }
  const flat = min >= RULES.flatMin;
  for (const p of [...state.open]) {
    const b = bars[p.symbol]; if (!b?.length) continue;
    const hit = check(p, b, flat);
    if (hit) {
      const pnl = pnlOf(p, hit.exit);
      state.balance = +(state.balance + pnl).toFixed(2);
      if (pnl < 0) state.todayLosses++;
      state.closed.push({ ...p, exit: hit.exit, pnl, why: hit.why, closedAt: hit.t });
      state.open = state.open.filter(x => x !== p);
      log.push(`Closed ${p.symbol} ${hit.why}: ${pnl >= 0 ? "+" : ""}$${pnl}`);
    } else { p.lastT = b.at(-1).t; p.now = b.at(-1).c; }
  }
  if (scanning) {
    const mb = bias(bars.SPY || []);
    state.bias = mb;
    for (const s of WATCH) {
      if (state.todayTrades >= RULES.maxTradesPerDay) break;
      if (state.open.some(p => p.symbol === s) || state.closed.some(c => c.symbol === s && nyDay(c.closedAt) === day)) continue;
      const b = bars[s]; if (!b?.length) continue;
      const sig = signal(s, b, mb); if (!sig) continue;
      const t = size(sig, state.balance); if (!t) continue;
      let grok = null;
      if (askGrok) { try { grok = await askGrok(t, mb); } catch (e) { grok = { verdict: "ERROR", why: String(e.message || e).slice(0, 120) }; } }
      if (grok && grok.verdict === "SKIP") { log.push(`Grok skipped ${s}: ${grok.why}`); state.skips.push({ ...t, grok, at: nowTs }); continue; }
      state.open.push({ ...t, grok, openedAt: b.at(-1).t, lastT: b.at(-1).t, now: t.entry });
      state.todayTrades++;
      log.push(`Opened ${t.side} ${t.shares} ${s} at ${t.entry}, stop ${t.stop}, target ${t.target}`);
    }
  }
  state.lastTick = nowTs;
  state.log = [...log.map(m => ({ at: nowTs, m })), ...state.log].slice(0, 60);
  state.skips = state.skips.slice(-20);
  return state;
}

export const fresh = () => ({ balance: 10000, start: 10000, on: true, open: [], closed: [], skips: [], log: [], day: "", todayTrades: 0, todayLosses: 0, bias: "flat", lastTick: 0 });
