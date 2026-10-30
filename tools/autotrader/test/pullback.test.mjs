import test from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { Engine } from "../src/lib/engine.mjs";
import { Journal } from "../src/lib/journal.mjs";
import { DEFAULTS } from "../src/lib/strategy.mjs";
// lesson 36: buy the pullback after a run, never the top of the spike
function rig(prices) {
  let now = 1_800_000_000_000, i = 0; const buys = [];
  const pool = { pool: "P", name: "RUN / SOL", mint: "M".repeat(40) + "pump", created: now - 30 * 60000, liqUsd: 60000, vol5: 50000 };
  const feed = { quotes: async () => new Map([["P", { price: prices[Math.min(i, prices.length - 1)], liqUsd: 60000, buys5: 120, sells5: 60, vol5: 50000 }]]), newPools: async () => [pool], trendingPools: async () => [], candles: async () => [] };
  const exec = { name: "live", source: "own", buy: async () => { buys.push(prices[Math.min(i, prices.length - 1)]); return { ok: true, sol: 0.02618, outAmount: "1000", inAmount: "26180000" }; }, sell: async () => ({ ok: true }), sizeSol: async () => ({ bal: 1, sol: 0.02618 }) };
  const e = new Engine({ feed, exec, journal: new Journal(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pb-")), "j.jsonl")), rug: async () => ({ pass: true, reason: "ok" }), cfg: { ...DEFAULTS, fib: 0, momMin: 0.10, entryMinLiq: 0, liveMinLiq: 20000, liveMinVol5: 3000, liveBuyRatio: 1 }, now: () => now });
  return { e, buys, step: async () => { await e.slow(); await e.fast(); i++; now += 3000; } };
}
test("a coin still spiking to new highs is NOT bought (that was the top every loser bought)", async () => {
  const r = rig([1, 1.04, 1.08, 1.12, 1.16, 1.2, 1.24]);
  for (let k = 0; k < 7; k++) await r.step();
  assert.equal(r.buys.length, 0);
});
test("after a run, a 3-12% pullback that ticks back up IS bought", async () => {
  const r = rig([1, 1.06, 1.12, 1.18, 1.14, 1.10, 1.12]);
  for (let k = 0; k < 7; k++) await r.step();
  assert.equal(r.buys.length, 1, "one buy, on the bounce");
});
test("a coin dumping more than 12% from its high is NOT bought", async () => {
  const r = rig([1, 1.1, 1.2, 1.05, 1.0, 1.01]);
  for (let k = 0; k < 6; k++) await r.step();
  assert.equal(r.buys.length, 0);
});
