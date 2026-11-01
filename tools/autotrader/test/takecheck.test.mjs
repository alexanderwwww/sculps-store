// build 82 (Kenji): a take-profit is only sold when a FRESH sell quote still clears the take. A quote spike that is gone one second later keeps the coin.
import test from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { Engine } from "../src/lib/engine.mjs";
import { Journal } from "../src/lib/journal.mjs";
import { DEFAULTS } from "../src/lib/strategy.mjs";

function rig(quotes) {
  let now = 1_800_000_000_000, calls = 0; const sells = [];
  const exec = { name: "live", caps: { maxFeeLamports: 150000 },
    async sizeSol() { return { bal: 1, sol: 0.003 }; },
    async valueSol() { return quotes[Math.min(calls++, quotes.length - 1)]; },
    async sell(p) { sells.push(p.id); return { ok: true, inAmount: "1000", outAmount: String(Math.round(0.00305 * 1e9)) }; } };
  const feed = { quotes: async (ids) => new Map(ids.map((id) => [id, { price: 1, liqUsd: 90000, buys5: 300, sells5: 200, vol5: 20000 }])), newPools: async () => [], trendingPools: async () => [], candles: async () => [] };
  const cfg = { ...DEFAULTS, scalp: 1, sl: -0.02, tp: 0.006, partAt: 0.9, maxHoldMin: 5 };
  const e = new Engine({ feed, exec, cfg, journal: new Journal(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tc-")), "j.jsonl")), rug: async () => ({ pass: true, reason: "ok" }), now: () => now });
  e.open.set("p1", { id: "p1", name: "SPIKE", mint: "M1", pool: "P1", stake: 0.003, stake0: 0.003, entryPx: 1, at: now - 5000, sl: -0.02, tp: 0.006, partAt: 0.9, tokens: "1000", base: 0.00292, type: "open" });
  return { e, sells, step: async () => { await e.fast(); now += 1500; } };
}

test("a take-profit quote that vanishes on the re-check does not sell", async () => {
  // call 1 = the engine's own quote (+2%: clears the take), call 2 = the fresh re-check (-1%: the spike is gone)
  const r = rig([0.00306, 0.00297, 0.00297, 0.00297]);
  await r.step();
  assert.equal(r.sells.length, 0, "must not sell on a spike the fresh quote contradicts"); assert.equal(r.e.open.size, 1);
});

test("a take-profit that the fresh quote confirms still sells", async () => {
  const r = rig([0.00306, 0.00306, 0.00306, 0.00306]);
  await r.step();
  assert.equal(r.sells.length, 1); assert.equal(r.e.open.size, 0);
});
