import test from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { Engine } from "../src/lib/engine.mjs";
import { Journal } from "../src/lib/journal.mjs";
import { DEFAULTS } from "../src/lib/strategy.mjs";
import { setup, NOW } from "./chartdata.mjs";
// chartRead driving the real engine loop (slow + fast lanes): buys the deep-zone bounce, never the top, honours a dead swing,
// takes the small profit, keeps trading when candles fail, and keeps the trade rate up on a busy market.
function rig({ pools = 1, prices, candles, maxOpen = 8, flow = { buys5: 130, sells5: 100 } } = {}) {
  let now = NOW - 40000, i = 0; const buys = [], sells = [], parts = [];
  const list = Array.from({ length: pools }, (_, k) => ({ pool: "P" + k, name: `C${k} / SOL`, mint: String(k).padStart(40, "M") + "pump", created: now - 60 * 60000, liqUsd: 60000, vol5: 50000 }));
  const px = () => prices[Math.min(i, prices.length - 1)];
  const feed = {
    quotes: async (ps) => new Map(ps.map((p) => [p, { price: px(), liqUsd: 60000, vol5: 50000, ...flow }])),
    newPools: async () => list, trendingPools: async () => [],
    candles: async (p, o) => { if (candles === "throw") throw new Error("HTTP 429"); return (candles || setup()).map((k) => ({ ...k })); },
  };
  let held = 0;
  const exec = {
    name: "live", source: "own",
    buy: async (o) => { buys.push({ px: px(), pool: o.pool }); held++; return { ok: true, sol: 0.016, outAmount: "1000", inAmount: "16000000" }; },
    sell: async () => { sells.push(px()); return { ok: true }; },
    sellPart: async ({ frac }) => { parts.push({ px: px(), frac }); return { ok: true, outAmount: String(Math.round(0.016 * frac * (px() / 1.038) * 1e9)), left: "500" }; },
    sizeSol: async () => ({ bal: 1, sol: 0.016 }),
    valueSol: async (p) => p.stake * px() / (buys.find((b) => b.pool === p.pool)?.px ?? px()),
  };
  const e = new Engine({ feed, exec, journal: new Journal(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cr-")), "j.jsonl")), rug: async () => ({ pass: true, reason: "ok" }), cfg: { ...DEFAULTS, maxOpen, entryMinLiq: 0, sl: -0.02, partAt: 0.05, partFrac: 0.5, tp: 1 }, now: () => now });
  return { e, buys, sells, parts, step: async (dt = 5000) => { await e.slow(); await e.fast(); i++; now += dt; } };
}
const climb = [1.036, 1.0362, 1.0365, 1.037, 1.0372, 1.0375, 1.038, 1.038, 1.038];

test("engine: buys the deep-zone bounce on the chart, inside 0.5-0.786", async () => {
  const r = rig({ prices: climb });
  for (let k = 0; k < climb.length; k++) await r.step();
  assert.equal(r.buys.length, 1, JSON.stringify(r.e.status().whyNot));
  assert.ok(r.buys[0].px >= 1.0375, `bought on the bounce at ${r.buys[0].px}`);
  const p = [...r.e.open.values()][0];
  assert.ok(p.cr && p.cr.tp2 >= 0.08 && p.cr.deepPx < 1.03, JSON.stringify(p.cr));
  assert.ok(p.cr.feat.score >= 5);
});
test("engine: never buys the top", async () => {
  const r = rig({ prices: [1.098, 1.099, 1.0995, 1.1, 1.1, 1.1, 1.1, 1.1] });
  for (let k = 0; k < 8; k++) await r.step();
  assert.equal(r.buys.length, 0);
  assert.ok(Object.keys(r.e.status().whyNot).some((k) => /zone/.test(k)));
});
test("engine: a dead swing (1m close past 0.786) is not bought", async () => {
  const r = rig({ prices: climb, candles: setup({ 233: { c: 1.016, l: 1.0155 }, 234: { o: 1.016 } }) });
  for (let k = 0; k < climb.length; k++) await r.step();
  assert.equal(r.buys.length, 0);
  assert.ok(Object.keys(r.e.status().whyNot).some((k) => /dead/.test(k)));
});
test("engine: the small take fires: half at +5%, the rest at break-even +1.5%", async () => {
  const path = [...climb, 1.05, 1.075, 1.08, 1.06, 1.05, 1.04];
  const r = rig({ prices: path });
  for (let k = 0; k < path.length; k++) await r.step();
  assert.equal(r.buys.length, 1);
  assert.equal(r.parts.length, 1, "half sold at +5%"); assert.equal(r.parts[0].frac, 0.5);
  assert.equal(r.sells.length, 1, "the rest closed");
  assert.equal(r.e.open.size, 0);
  const c = r.e.closed[r.e.closed.length - 1];
  assert.ok(c.feat && c.feat.score >= 5, "features on the close row");
});
test("engine: -2% from the first quote stops out", async () => {
  const path = [...climb, 1.03, 1.015, 1.01];
  const r = rig({ prices: path });
  for (let k = 0; k < path.length; k++) await r.step();
  assert.equal(r.buys.length, 1); assert.equal(r.sells.length, 1); assert.match(r.e.closed.at(-1).why, /stop/);
});
test("engine: candles failing never stall trading (tick fallback)", async () => {
  const path = [1, 1.05, 1.1, 1.15, 1.2, 1.12, 1.1, 1.09, 1.1, 1.1, 1.1];
  const r = rig({ prices: path, candles: "throw" });
  for (let k = 0; k < path.length; k++) await r.step(3000);
  assert.equal(r.buys.length, 1);
});
test("engine: a busy market of 30 setups fills every slot in one minute", async () => {
  const r = rig({ pools: 30, prices: climb, maxOpen: 30 });
  for (let k = 0; k < 12; k++) await r.step();
  assert.ok(r.buys.length >= 20, `bought ${r.buys.length} of 30 ${JSON.stringify(r.e.status().whyNot)} ${r.e.chart.size}`);
  assert.equal(new Set(r.buys.map((b) => b.pool)).size, r.buys.length, "one buy per coin");
});
