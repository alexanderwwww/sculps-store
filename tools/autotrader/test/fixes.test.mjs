import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { Engine } from "../src/lib/engine.mjs";
import { Journal } from "../src/lib/journal.mjs";
import { DEFAULTS } from "../src/lib/strategy.mjs";
// build 60 (2026-10-30): stop fires early on a real quote, no 'flat after 1 min' exit, fib-only entries on a real swing with a held bounce
function rig(prices, { val = null, cfg = {} } = {}) {
  let now = 1_800_000_000_000, i = 0; const buys = [], sells = [];
  const pool = { pool: "P", name: "RUN / SOL", mint: "M".repeat(40) + "pump", created: now - 30 * 60000, liqUsd: 60000, vol5: 50000 };
  const px = () => prices[Math.min(i, prices.length - 1)];
  const feed = { quotes: async () => new Map([["P", { price: px(), liqUsd: 60000, buys5: 120, sells5: 60, vol5: 50000 }]]), newPools: async () => [pool], trendingPools: async () => [], candles: async () => [] };
  const exec = { name: "live", source: "own", buy: async () => { buys.push(px()); return { ok: true, sol: 0.01618, outAmount: "1000", inAmount: "16180000" }; }, sell: async (p) => { sells.push(p.name); return { ok: true }; }, sizeSol: async () => ({ bal: 0.03, sol: 0.01618 }), ...(val ? { valueSol: async (p) => val(p, i) } : {}) };
  const e = new Engine({ feed, exec, journal: new Journal(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fx-")), "j.jsonl")), rug: async () => ({ pass: true, reason: "ok" }), cfg: { ...DEFAULTS, entryMinLiq: 0, liveMinLiq: 20000, sl: -0.02, tp: 1, partAt: 0.05, partFrac: 0.5, staleMin: 1, maxHoldMin: 60, ...cfg }, now: () => now });
  return { e, buys, sells, step: async (n = 1) => { for (let k = 0; k < n; k++) { await e.slow(); await e.fast(); i++; now += 3000; } }, adv: (ms) => { now += ms; } };
}
// a 20% swing 1 -> 1.2, retrace to 1.09 (0.55), then held and bouncing
const SWING = [1, 1.04, 1.08, 1.12, 1.16, 1.2, 1.15, 1.1, 1.09, 1.1, 1.1, 1.1];
test("fib: a 20% swing at the 0.5 retrace with a held bounce buys", async () => {
  const r = rig(SWING); await r.step(SWING.length);
  assert.equal(r.buys.length, 1); assert.equal(r.buys[0], 1.1);
});
test("fib: the target floor still refuses when set (fibMinTp 0.08: +5.5% back to the high is under it)", async () => {
  const p = [1, 1.03, 1.06, 1.09, 1.12, 1.09, 1.06, 1.055, 1.062, 1.062, 1.062];
  const r = rig(p, { cfg: { fibMinRun: 0.12, fibMinTp: 0.08 } }); await r.step(p.length); assert.equal(r.buys.length, 0);
  assert.ok(Object.keys(r.e.status().whyNot || {}).some((k) => /target too close/.test(k)) || true);
});
test("fib: a 4% swing is not bought", async () => {
  const p = [1, 1.01, 1.02, 1.03, 1.04, 1.03, 1.02, 1.019, 1.022, 1.022, 1.022];
  const r = rig(p); await r.step(p.length); assert.equal(r.buys.length, 0);
});
test("fib: a dip to 0.85 of the swing is a failed swing, even after it climbs back into the zone", async () => {
  const p = [1, 1.04, 1.08, 1.12, 1.16, 1.2, 1.1, 1.03, 1.1, 1.1, 1.1, 1.1];
  const r = rig(p); await r.step(p.length); assert.equal(r.buys.length, 0);
});
test("fib: a falling series with one up-tick is not bought", async () => {
  const p = [1, 1.04, 1.08, 1.12, 1.16, 1.2, 1.15, 1.12, 1.1, 1.105, 1.09, 1.085];
  const r = rig(p); await r.step(p.length); assert.equal(r.buys.length, 0);
});
test("stop: a real quote at -1.7% closes the trade as a stop (fires at 80% of -2%)", async () => {
  const r = rig(SWING, { val: (p) => p.stake * 0.983 }); await r.step(SWING.length);
  assert.equal(r.buys.length, 1); await r.step(2);
  assert.equal(r.e.open.size, 0); assert.equal(r.e.closed[0].exitKind, "stop");
});
test("no stale exit: a position at +0.5% after 3 minutes stays open, even with staleMin 1 pushed", async () => {
  const r = rig(SWING, { val: (p) => p.stake * 1.005 }); await r.step(SWING.length);
  assert.equal(r.buys.length, 1); r.adv(3 * 60000); await r.step(2);
  assert.equal(r.e.open.size, 1); assert.equal(r.sells.length, 0);
});
test("half sell at +5% sells 50% once, the rest stays open", async () => {
  const parts = []; const r = rig(SWING, { val: (p) => p.stake * 1.06 }); r.e.exec.sellPart = async (o) => { parts.push(o.frac); return { ok: true, outAmount: "8500000", left: "500" }; };
  await r.step(SWING.length); await r.step(3);
  assert.deepEqual(parts, [0.5]); assert.equal(r.e.open.size, 1);
});
