// build 84: exits have their own clock. A stop fires from exitsOnly() with no fast() call, two loops never sell twice, and the trade report carries its latencies.
import test from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { Engine } from "../src/lib/engine.mjs";
import { Journal } from "../src/lib/journal.mjs";
import { DEFAULTS } from "../src/lib/strategy.mjs";

function rig({ quote = 0.0027, sellMs = 0 } = {}) {
  let now = 1_800_000_000_000; const sells = [];
  const exec = { name: "live", caps: { maxFeeLamports: 150000 },
    async sizeSol() { return { bal: 1, sol: 0.003 }; },
    async valueSol() { return quote; },
    async sell(p) { sells.push(p.id); if (sellMs) await new Promise((r) => setTimeout(r, sellMs)); return { ok: true, inAmount: "1000", outAmount: String(Math.round(quote * 1e9)) }; } };
  const feed = { quotes: async (ids) => new Map(ids.map((id) => [id, { price: 1, liqUsd: 90000, buys5: 300, sells5: 200, vol5: 20000 }])), newPools: async () => [], trendingPools: async () => [], candles: async () => [] };
  const cfg = { ...DEFAULTS, scalp: 1, sl: -0.02, tp: 0.006, partAt: 0.9, maxHoldMin: 5 };
  const e = new Engine({ feed, exec, cfg, journal: new Journal(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "eo-")), "j.jsonl")), rug: async () => ({ pass: true, reason: "ok" }), now: () => now });
  e.open.set("p1", { id: "p1", name: "DUMP", mint: "M1", pool: "P1", stake: 0.003, stake0: 0.003, entryPx: 1, at: now - 5000, sl: -0.02, tp: 0.006, partAt: 0.9, tokens: "1000", base: 0.00292, rt: 0.012, buyMs: 3400, liq: 90000, type: "open" });
  return { e, sells, tick: (ms) => { now += ms; } };
}

test("a stop fires from exitsOnly() alone, and the trade report carries rt, buyMs, liq, holdMs, sellMs", async () => {
  const r = rig();
  await r.e.exitsOnly();
  assert.equal(r.sells.length, 1); assert.equal(r.e.open.size, 0);
  const closed = r.e.closed[r.e.closed.length - 1]; assert.ok(closed, "a close was recorded");
  const ev = [...r.e.events].reverse().find((x) => x.type === "sell"); assert.ok(ev && ev.est, "the sell event carries its est");
  assert.equal(ev.est.rt, 0.012); assert.equal(ev.est.buyMs, 3400); assert.equal(ev.est.liq, 90000);
  assert.equal(typeof ev.est.sellMs, "number"); assert.equal(typeof ev.est.holdMs, "number"); assert.equal(ev.est.kind, "stop");
});

test("exitsOnly() with nothing open does nothing", async () => {
  const r = rig(); r.e.open.clear(); await r.e.exitsOnly(); assert.equal(r.sells.length, 0);
});

test("exitsOnly() and fast() running at the same time sell a position once", async () => {
  const r = rig({ sellMs: 80 });
  await Promise.all([r.e.exitsOnly(), r.e.fast(), r.e.exitsOnly()]);
  assert.equal(r.sells.length, 1, "the closing guard must stop a double sell");
});
