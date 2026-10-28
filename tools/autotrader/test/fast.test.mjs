import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { Engine } from "../src/lib/engine.mjs";
import { Journal } from "../src/lib/journal.mjs";
import { DEFAULTS } from "../src/lib/strategy.mjs";
import { fakeFeed, up, base, moon } from "./fakefeed.mjs";
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, d ?? ""); } };
const M = 60000;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ultra-fast-"));
let k = 0;
const mk = (over = {}) => {
  const { feed, state } = fakeFeed(); state.series = base;                       // a quiet chart, nothing yet
  const sells = []; const exec = { name: "paper", buy: async () => ({ ok: true }), sell: async (p) => { sells.push(p.name); return { ok: true }; } };
  const e = new Engine({ feed, exec, journal: new Journal(path.join(dir, `j${k++}.jsonl`)), rug: async () => ({ pass: true, reason: "ok" }), now: () => state.now, ...over });
  return { e, state, sells };
};
const T0 = 1_800_000_000_000;

// 1. entries come from LIVE prices, with no new minute chart
let { e, state } = mk();
await e.slow(); await e.fast();
ok("a quiet chart and a quiet price: no position, and no noise in the skip log", e.open.size === 0 && !Object.keys(e.status().whyNot).some((x) => /no breakout/.test(x)), e.status().whyNot);
{ const t = mk(); e = t.e; state = t.state; state.now = T0 + 33 * M; state.byPool.P1 = base.map((c, i) => (i >= 28 ? { ...c, o: 1, c: 1.001, h: 1.001, l: 1 } : c)); await e.slow(); state.px.P1 = 1.25; await e.fast(); }
ok("the live price breaking out opens a position on the very next fast tick, before the minute chart shows it", e.open.size === 1 && /breakout/.test([...e.open.values()][0].enter), e.status());

// 2. exits come from live prices too
{ const t = mk(); e = t.e; state = t.state; state.series = up; state.now = T0 + 33 * M; await e.slow(); await e.fast();
  const pos = [...e.open.values()][0];
  ok("setup: a position is open", !!pos);
  state.px.P1 = pos.entryPx * 0.8; await e.fast();
  ok("a live price 20% under entry sells at once with the stop (no waiting for a candle)", e.open.size === 0 && /stop/.test(e.closed[0].why) && e.closed[0].ret < -0.15, e.closed[0]);
}
{ const t = mk(); e = t.e; state = t.state; state.series = up; state.now = T0 + 33 * M; await e.slow(); await e.fast();
  const pos = [...e.open.values()][0];
  state.px.P1 = pos.entryPx * 2; await e.fast();
  ok("a live price 100% over entry takes profit with a positive result after costs", e.open.size === 0 && /take profit/.test(e.closed[0].why) && e.closed[0].ret > 0.8, e.closed[0]);
}
{ const t = mk(); e = t.e; state = t.state; state.series = up; state.now = T0 + 33 * M; await e.slow(); await e.fast();
  const pos = [...e.open.values()][0];
  state.px.P1 = pos.entryPx * 1.3; await e.fast();
  ok("a 30% run is held (target is 90%), peak remembered", e.open.size === 1);
  state.px.P1 = pos.entryPx * 1.3 * 0.88; await e.fast();
  ok("then a 12% pullback from the peak sells with the trailing stop", e.open.size === 0 && /trailing/.test(e.closed[0].why) && e.closed[0].ret > 0, e.closed[0]);
}
{ const t = mk(); e = t.e; state = t.state; state.series = up; state.now = T0 + 33 * M; await e.slow(); await e.fast();
  state.now += 61 * M; await e.fast();
  ok("a position held past the time limit is closed even when the price goes nowhere", e.open.size === 0 && /time stop/.test(e.closed[0].why), e.closed[0]);
}
// 3. protections
{ const t = mk(); e = t.e; state = t.state; state.series = up; state.now = T0 + 33 * M; state.flow = { buys5: 6, sells5: 20 }; await e.slow(); await e.fast();
  ok("buyers outnumbered 3 to 1: no entry, and the reason is logged", e.open.size === 0 && Object.keys(e.status().whyNot).some((x) => /sellers ahead/.test(x)), e.status().whyNot);
}
{ const t = mk(); e = t.e; state = t.state; state.series = up; state.now = T0 + 33 * M; state.px.P1 = 3.2; await e.slow(); await e.fast();
  ok("a coin already up 150%+ is not chased", e.open.size === 0 && Object.keys(e.status().whyNot).some((x) => /already up/.test(x)), e.status().whyNot);
}
{ const t = mk(); e = t.e; state = t.state; state.series = up; state.now = T0 + 33 * M; await e.slow();
  e.feed = { ...e.feed, quotes: async () => new Map() }; await e.fast();
  ok("no live quote = no entry (never trade on a stale price)", e.open.size === 0);
}
{ const t = mk({ cfg: { ...DEFAULTS, maxOpen: 1 } }); e = t.e; state = t.state; state.series = up; state.now = T0 + 33 * M;
  state.pools.push({ pool: "P3", name: "GAMMA", mint: "G".repeat(40) + "pump", created: T0, liqUsd: 9000, vol5: 90 }); state.byPool.P3 = up;
  await e.slow(); await e.fast();
  ok("the position limit holds in the fast lane too", e.open.size === 1, e.open.size);
}
// 4. a close from the fast lane and the chart backstop cannot both sell
{ const t = mk(); e = t.e; state = t.state; state.series = up; state.now = T0 + 33 * M; await e.slow(); await e.fast();
  const pos = [...e.open.values()][0]; state.px.P1 = pos.entryPx * 0.7; state.series = [...up, { t: T0 + 33 * M, o: 1.2, h: 1.2, l: 0.8, c: 0.85, v: 90 }];
  await Promise.all([e.fast(), e.slow()]);
  ok("fast exit and chart backstop at the same moment sell exactly once", t.sells.length === 1 && e.closed.length === 1, { sells: t.sells, closed: e.closed.length });
}
// 5. the restart bug: after a restart the chart must be judged from the REAL entry, never from the first candle of the window
{ const t = mk(); e = t.e; state = t.state; state.series = up; state.now = T0 + 33 * M; await e.slow(); await e.fast();
  const pos = [...e.open.values()][0];
  state.series = [...up, ...Array.from({ length: 5 }, (_, i) => ({ t: T0 + (34 + i) * M, o: 1.22, h: 1.23, l: 1.2, c: 1.22, v: 10 }))];
  state.px.P1 = 1.22; state.now = T0 + 38 * M;
  await e.slow();
  ok("flat candles after the entry do not close it (the window's earlier +20% run is not this position's)", e.open.size === 1 && e.closed.length === 0, e.closed[0]);
  state.series = [...up, ...Array.from({ length: 5 }, (_, i) => ({ t: T0 + (34 + i) * M, o: 1.22, h: 1.23, l: 1.0, c: 1.1, v: 10 }))];
  await e.slow();
  ok("candles after the entry that fall through the stop do close it", e.open.size === 0 && /stop/.test(e.closed[0].why), e.closed[0]);
}
console.log(`\nfast tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
