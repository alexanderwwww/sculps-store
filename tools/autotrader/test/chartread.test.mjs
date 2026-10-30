import test from "node:test"; import assert from "node:assert/strict";
import { resample, atr, pivots, dominant, chartRead, chartExit, newGuard, guardStep, CR, tickFib } from "../src/lib/chart.mjs";
import { setup, ticksUp, ringExhausted, NOW, T0, M } from "./chartdata.mjs";

const lv = (o = {}) => ({ liqUsd: 60000, buys5: 130, sells5: 100, ...o });
const read = (cs, P, o = {}) => chartRead(o.cache || { cs1: cs }, P, lv(o.lv), o.flow ?? ringExhausted(), CR, { now: NOW, ticks: o.ticks || ticksUp(P), ...o.x });

test("resample: 15 one-minute bars make three 5-minute bars", () => {
  const cs = Array.from({ length: 15 }, (_, i) => ({ t: T0 + i * M, o: i, h: i + 0.5, l: i - 0.5, c: i + 0.2, v: 1 }));
  const r = resample(cs, 5);
  assert.equal(r.length, 3);
  assert.deepEqual(r[1], { t: T0 + 5 * M, o: 5, h: 9.5, l: 4.5, c: 9.2, v: 5 });
});
test("atr: a constant range of 1 is 1", () => {
  const cs = Array.from({ length: 30 }, (_, i) => ({ t: i, o: 10, h: 10.5, l: 9.5, c: 10, v: 1 }));
  assert.equal(atr(cs, 14), 1);
});
test("pivots: a zigzag alternates and a sub-1.5 ATR wiggle is dropped", () => {
  const path = [1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 3.2, 3.1, 3.3, 3.4, 5.5, 6, 5, 4, 3, 2, 1.5, 2, 3];
  const cs = path.map((c, i) => ({ t: i, o: c, h: c + 0.05, l: c - 0.05, c, v: 1 }));
  const z = pivots(cs, 2, 0.5);
  assert.deepEqual(z.map((p) => p.type), ["H", "L", "H", "L"]);
  assert.deepEqual(z.map((p) => p.i), [4, 8, 16, 21]);
  for (let i = 1; i < z.length; i++) assert.notEqual(z[i].type, z[i - 1].type);
});
test("dominant: picks the largest intact leg, rejects broken and small ones, falls back to 5m", () => {
  const cs = setup();
  const d = dominant(cs, CR, new Set(), 1.038);
  assert.ok(Math.abs(d.H - 1.1005) < 1e-9 && Math.abs(d.L - 0.995) < 1e-9, JSON.stringify({ H: d.H, L: d.L }));
  assert.ok(d.tf === 5 || d.tf === 1, `15m has fewer than 4 pivots here, read on ${d.tf}m`);
  // a later close above H: that leg is not a pullback
  const up = setup({ 236: { c: 1.11, h: 1.112 } });
  const d2 = dominant(up, CR, new Set(), 1.038);
  assert.ok(!d2.H || d2.H !== 1.1005, "a leg with a later close above H is rejected");
  // a run under 6%
  const small = setup().map((k) => ({ ...k, o: 1 + (k.o - 1) * 0.4, h: 1 + (k.h - 1) * 0.4, l: 1 + (k.l - 1) * 0.4, c: 1 + (k.c - 1) * 0.4 }));
  assert.match(dominant(small, CR, new Set(), 1.015).why, /no swing/);
});
test("buys the deep-zone bounce: higher low, hammer, dry volume, flow 1.3", () => {
  const r = read(setup(), 1.038);
  assert.equal(r.ok, true, r.why);
  assert.ok(r.score >= 5, `score ${r.score}`);
  assert.ok(r.r >= 0.5 && r.r <= 0.786, `r ${r.r}`);
  assert.equal(r.feat.s7, 1); assert.equal(r.feat.s6, 1); assert.equal(r.feat.s1, 1);
  assert.equal(r.sl, -0.02);
  assert.ok(r.tp2 >= 0.08 && r.tp2 <= 0.12);
});
test("skips shallow (r 0.3) and the top", () => {
  assert.match(read(setup(), 1.069).why, /zone/);
  assert.match(read(setup(), 1.1).why, /zone/);
});
test("invalidation: a 1m close past 0.786 kills the swing, and it stays dead when price comes back", () => {
  const cache = { cs1: setup({ 233: { c: 1.016, l: 1.0155 }, 234: { o: 1.016 } }) };
  assert.match(read(null, 1.0372, { cache }).why, /dead/);
  const again = { cs1: setup(), dead: cache.dead };
  assert.match(read(null, 1.038, { cache: again }).why, /dead/);
});
test("lower low: not bought", () => {
  assert.match(read(setup({ 234: { l: 1.0285 } }), 1.038).why, /lower low/);
});
test("tight stop: the low 0.3% under the entry is skipped", () => {
  assert.match(read(setup(), 1.0331, { ticks: ticksUp(1.0331).map(([t, v]) => [t, Math.min(v, 1.0331)]) }).why, /tight/);
});
test("candle failure: the tick fallback still decides", () => {
  const ticks = [1, 1.05, 1.1, 1.15, 1.2, 1.12, 1.1, 1.09, 1.1, 1.1].map((v, i) => [NOW - (10 - i) * 3000, v]);
  const r = chartRead({ cs1: null }, 1.1, lv(), [], CR, { now: NOW, ticks });
  assert.equal(r.ok, true, r.why); assert.equal(r.fallback, true);
  assert.equal(tickFib(ticks.slice(0, 5), 1.2).ok, false);
});
test("high certainty can widen the stop to the structure, never past the cap", () => {
  const r = read(setup(), 1.038, { x: { certainty: 0.9 } });
  assert.ok(r.ok && r.sl <= -0.02 && r.sl >= -0.06, String(r.sl));
});

// ---- exits: one tick every 5 s
function run(path, st, opts = {}) {
  const out = []; let t = 0;
  for (const p of path) {
    const r = typeof p === "number" ? p : p.r;
    const d = chartExit(st, { r, rStop: r, real: false, t: t, px: (st.E ?? 1) * (1 + r), close1m: p.close1m ?? null, Rs: p.Rs }, CR);
    if (d?.action === "part") { st.tp1Done = true; out.push("part"); }
    else if (d) { out.push(d.kind); return { out, d, t }; }
    t += opts.dt ?? 5000;
  }
  return { out, t };
}
const ticket = (o = {}) => ({ sl: -0.02, tp2: 0.09, trail: 0.025, deepPx: 0.97, H: 1.09, E: 1, ...o });
test("exit: -2% is the stop", () => { assert.equal(run([0, -0.01, -0.021], ticket()).d.kind, "stop"); });
test("exit: +5% sells half, stop moves to +1.5%, a fall to -1% leaves at break-even", () => {
  const x = run([0.02, 0.051, 0.03, 0.014, -0.01], ticket());
  assert.deepEqual(x.out, ["part", "lock"]);
});
test("exit: the trail fires 2.5% under the peak after TP1", () => {
  const x = run([0.03, 0.05, 0.07, 0.06, 0.042], ticket({ tp2: 0.12 }));
  assert.deepEqual(x.out, ["part", "trail"]);
});
test("exit: flat for 10 minutes is the time stop", () => {
  const x = run(Array(200).fill(0.005), ticket());
  assert.equal(x.d.kind, "time"); assert.ok(x.t >= 600000 && x.t < 610000);
});
test("exit: a 1m close under the 0.886 is the structure exit", () => {
  assert.equal(run([0, { r: -0.01, close1m: 0.969 }], ticket()).d.kind, "struct");
});
test("exit: stalled within 1% of the high for 120 s", () => {
  const x = run([0.03, ...Array(30).fill(0.08)], ticket({ H: 1.085, tp2: 0.12 }));
  assert.equal(x.d.kind, "stall");
});
test("self-guard: 50 closes at a 50% win rate raise the score bar to 6", () => {
  const g = newGuard(CR);
  for (let i = 0; i < 50; i++) guardStep(g, { ret: i % 2 ? 0.03 : -0.04, feat: { s1: 1 } });
  assert.equal(g.scoreMin, 6); assert.equal(g.last.w, 0.5);
  const h = newGuard(CR); for (let i = 0; i < 50; i++) guardStep(h, { ret: i % 10 ? 0.03 : -0.04 });
  assert.equal(h.scoreMin, 4);
});
