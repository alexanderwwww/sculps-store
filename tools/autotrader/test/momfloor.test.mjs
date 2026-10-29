import test from "node:test"; import assert from "node:assert/strict";
import { Engine } from "../src/lib/engine.mjs";
import { Journal } from "../src/lib/journal.mjs";
import { DEFAULTS } from "../src/lib/strategy.mjs";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
// lesson 31: live entries rising >= 13.4% in 30 s won, <= 9.5% lost. The self-tuner must never loosen momMin under 10%.
async function closeOne({ momMin, past, val }) {
  let now = 1_800_000_000_000;
  const exec = { name: "live", source: "own", valueSol: async () => val, sell: async () => ({ ok: true, outAmount: String(Math.round(val * 1e9)), inAmount: "1000" }), buy: async () => ({ ok: false }) };
  const feed = { quotes: async () => new Map([["P", { price: 1, liqUsd: 50000, buys5: 0, sells5: 0, vol5: 0 }]]), newPools: async () => [], trendingPools: async () => [], candles: async () => [] };
  const e = new Engine({ feed, exec, journal: new Journal(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mf-")), "j.jsonl")), cfg: { ...DEFAULTS, momMin, sl: -0.07, tp: 0.15, staleMin: 0, maxHoldMin: 60 }, now: () => now });
  for (const r of past) e.closed.push({ type: "close", ret: r });
  e.open.set("x", { id: "x", name: "T", mint: "M", pool: "P", stake: 0.01, tokens: "1000", entryPx: 1, at: now });
  await e.fast();
  assert.equal(e.open.size, 0, "the position closed");
  return e.cfg.momMin;
}
test("a winning run relaxes momMin, but never under 10% (was 2%)", async () => {
  assert.equal(await closeOne({ momMin: 0.032, past: [0.2, 0.15], val: 0.0125 }), 0.10);
  assert.equal(await closeOne({ momMin: 0.10, past: [0.2, 0.15], val: 0.0125 }), 0.10);
});
test("a losing run tightens momMin one golden step, capped at 16.18% (was 8%)", async () => {
  assert.ok(Math.abs(await closeOne({ momMin: 0.10, past: [-0.1, -0.08], val: 0.009 }) - 0.1618) < 1e-9);
  assert.equal(await closeOne({ momMin: 0.1618, past: [-0.1, -0.08], val: 0.009 }), 0.1618);
});
test("a mixed run leaves it alone, but a saved 3.2% is lifted to the 10% floor", async () => {
  assert.equal(await closeOne({ momMin: 0.032, past: [0.12, 0.12], val: 0.009 }), 0.10);
});

// lesson 34: over +21% in 30 s the live path bought the top (MM +26.3%, Hyper +28.3%, XLIQUID +22.7%, VI +54.5% all lost). Cap it.
async function liveTick(rise, cfg = {}) {
  const now = 1_800_000_000_000;
  const exec = { name: "paper", buy: async () => ({ ok: true }), sell: async () => ({ ok: true }) };
  const feed = { quotes: async () => new Map([["P", { price: 1 + rise, liqUsd: 50000, buys5: 140, sells5: 105, vol5: 20000 }]]), newPools: async () => [], trendingPools: async () => [], candles: async () => [] };
  const e = new Engine({ feed, exec, rug: async () => ({ pass: true, reason: "ok" }), journal: new Journal(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mx-")), "j.jsonl")), cfg: { ...DEFAULTS, momMin: 0.10, edgeMinN: 999, ...cfg }, now: () => now });
  e.ready = [{ name: "T", mint: "M", pool: "P", liqUsd: 50000, vol5: 20000 }];
  e.ph.set("P", [[now - 30000, 1]]);
  await e.fast();
  return { opened: e.open.size, why: e.status().whyNot };
}
test("a +26% tick is not bought: already ran too far", async () => {
  const r = await liveTick(0.26);
  assert.equal(r.opened, 0);
  assert.ok(r.why["live: already ran too far"] >= 1, JSON.stringify(r.why));
});
test("a +15% tick (the band that won) still gets bought", async () => {
  const r = await liveTick(0.15);
  assert.equal(r.why["live: already ran too far"], undefined, JSON.stringify(r.why));
  assert.equal(r.opened, 1, JSON.stringify(r.why));
});
test("the cap is tunable from the desk: momMax 0.30 lets +26% through", async () => {
  const r = await liveTick(0.26, { momMax: 0.30 });
  assert.equal(r.why["live: already ran too far"], undefined);
});
