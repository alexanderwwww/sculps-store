// Replays the last full session from Yahoo, 5 minutes at a time, through the real tick().
import { tick, fresh, WATCH, nyDay, nyMinutes } from "../src/engine.mjs";
const all = {};
for (const s of WATCH) {
  const j = await (await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${s}?interval=5m&range=5d`, { headers: { "user-agent": "Mozilla/5.0" } })).json();
  const r = j.chart.result[0], q = r.indicators.quote[0];
  all[s] = r.timestamp.map((t, i) => ({ t, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] || 0 })).filter(b => b.c != null);
}
const days = [...new Set(all.SPY.map(b => nyDay(b.t)))];
let st = fresh(); let grokCalls = 0;
for (const day of days.slice(-4)) {
  const sess = t => nyDay(t) === day && nyMinutes(t) >= 570 && nyMinutes(t) < 960;
  const times = all.SPY.filter(b => sess(b.t)).map(b => b.t);
  for (const t of times) {
    const now = t + 300;
    await tick(st, async s => all[s].filter(b => sess(b.t) && b.t + 300 <= now), now, async () => (grokCalls++, { verdict: grokCalls % 4 === 0 ? "SKIP" : "TAKE", why: "test" }));
  }
  console.log(day, "balance", st.balance, "open", st.open.length, "trades", st.todayTrades, "losses", st.todayLosses);
}
for (const c of st.closed) console.log(" ", nyDay(c.closedAt), c.symbol, c.side, c.shares, c.entry, "->", c.exit, c.pnl, c.why);
console.log("grok calls", grokCalls, "skips", st.skips.length, "log lines", st.log.length);
if (st.open.length) throw new Error("positions left open after the close");
