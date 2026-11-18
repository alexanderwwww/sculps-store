// The chart trader's decisions (src/aq/chart.mjs) on synthetic charts. Pure: no database, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../src/aq/chart.mjs";
import { chart, place } from "./fib-fixture.mjs";
const NOW = 1_800_000_000; // a fixed clock: every test says exactly which moment it is

test("the leg: a clear one is found, flat or small charts have none, a 5-minute close under 78.6% breaks it", () => {
  const cs = chart(NOW), leg = C.findLeg(C.bars5(cs, NOW));
  assert.equal(leg.ok, true); assert.ok(leg.high > 129 && leg.high < 131); assert.ok(leg.low > 99 && leg.low < 100); assert.ok(leg.highT > leg.lowT);
  assert.ok(leg.levels.z50 < leg.high && leg.levels.z618 < leg.levels.z50 && leg.levels.z786 < leg.levels.z618 && leg.levels.stop < leg.levels.z786);
  assert.ok(Math.abs(leg.levels.t2 - (leg.low + 1.272 * (leg.high - leg.low))) < 1e-4 && Math.abs(leg.levels.t3 - (leg.low + 1.618 * (leg.high - leg.low))) < 1e-4);
  const flat = place(NOW, Array.from({ length: 200 }, (_, i) => [100 + Math.sin(i) * 0.3, 100 + Math.sin(i + 1) * 0.3, 10]));
  assert.equal(C.findLeg(C.bars5(flat, NOW)).ok, false);
  assert.match(C.findLeg(C.bars5(chart(NOW, { legTo: 2, pull: 1 }), NOW)).why, /leg too small/);
  assert.match(C.findLeg(C.bars5(chart(NOW, { legVol: -0.3 }), NOW)).why, /rising volume/);
  const broken = chart(NOW, { tail: [...Array(10).fill([106, 104, 8]), [104, 114.6, 9]] }); // closes under 78.6% (~106.4), then back up
  const b = C.findLeg(C.bars5(broken, NOW)); assert.equal(b.ok, false); assert.equal(b.broken, true);
  assert.equal(C.entrySetup(broken, NOW).signal, false);
  assert.match(C.findLeg(C.bars5(cs.slice(-40), NOW)).why, /five-minute bars/);
});

test("the entry: only a bounce close inside 50-61.8%, never a falling knife, never a chase, never on stale data", () => {
  const ok = C.entrySetup(chart(NOW), NOW);
  assert.equal(ok.signal, true, ok.why); assert.equal(ok.entry, 114.6); assert.ok(ok.entry <= ok.levels.z50 && ok.entry >= ok.levels.z618);
  assert.deepEqual(Object.keys(ok.validations).sort(), ["bounceClose", "leg", "pocket", "pullbackVolumeLower", "risingVolume"]);
  assert.match(C.entrySetup(chart(NOW, { tail: [[114.6, 114.1, 9]] }), NOW).why, /no bounce candle yet/);
  assert.match(C.entrySetup(chart(NOW, { pull: 6, tail: [[124.2, 124.6, 9]] }), NOW).why, /waiting for the pullback/);
  assert.match(C.entrySetup(chart(NOW, { tail: [[114.1, 114.6, 9], [114.6, 117, 9], [117, 118, 9]] }), NOW).why, /back above 50%: too late, never chase/);
  assert.match(C.entrySetup(chart(NOW, { tail: [[110.1, 110.5, 9]] }), NOW).why, /under 61.8%/);
  assert.match(C.entrySetup(chart(NOW, { pullVol: 200 }), NOW).why, /selling on the pullback is heavier/);
  const stale = C.entrySetup(chart(NOW - 600), NOW); assert.equal(stale.signal, false); assert.equal(stale.stale, true);
  // a candle still forming is never used
  const forming = chart(NOW); forming.push({ t: Math.floor(NOW / 60) * 60, o: 114.6, h: 125, l: 114.6, c: 125, v: 99 });
  assert.equal(C.entrySetup(forming, NOW).signal, true);
});

// After entry: a plan made at the signal, then bars that come after it. `after` = [open, close, volume] one-minute rows.
function trade(after, { phase = 0, patch = {} } = {}) {
  const start = NOW - 300 * 30, base = chart(start), s = C.entrySetup(base, start); assert.equal(s.signal, true);
  const plan = { ...C.planOf(s, start, { liq: 200000 }), phase, ...patch };
  const t0 = Math.floor(start / 60) * 60; const rows = after.map(([o, c, v], i) => ({ t: t0 + i * 60, o, h: Math.max(o, c) * 1.001, l: Math.min(o, c) * 0.999, c, v }));
  return { plan, cs: [...base, ...rows], s, now: rows.length ? rows[rows.length - 1].t + 60 : start };
}
const flatAt = (p, n, v = 5) => Array.from({ length: n }, () => [p, p, v]);

test("the stop: a 5-minute CLOSE under the 78.6% stop sells; a wick under it does not; a lower low invalidates", () => {
  const { plan, s } = trade([]); assert.ok(plan.stop < s.levels.z786);
  let t = trade([...flatAt(114.6, 5), ...flatAt(plan.stop - 0.5, 5)]); assert.deepEqual(C.manage(t.plan, t.cs, t.now).action, "sell_all"); assert.match(C.manage(t.plan, t.cs, t.now).reason, /^stop: a 5-minute close under/);
  // in phase 0 any low under the pullback low is a lower low, which comes before the stop; the wick rule is shown with the stop at entry
  const p1 = { ...plan, phase: 1, stop: plan.entry, since: plan.since };
  t = trade([...flatAt(120, 5), [120, plan.entry - 1, 5], [plan.entry - 1, 118, 5], ...flatAt(118, 3)]); // a dip under the stop inside a 5-minute bar that closes above
  assert.equal(C.manage(p1, t.cs, t.now).action, "hold");
  t = trade([...flatAt(120, 5), ...flatAt(plan.entry - 1, 5)]); assert.match(C.manage(p1, t.cs, t.now).reason, /stop at entry/);
  t = trade([...flatAt(114.6, 5), ...flatAt(plan.pullLow - 0.4, 5)]); assert.ok(plan.pullLow - 0.4 > plan.stop); assert.match(C.manage(t.plan, t.cs, t.now).reason, /invalidation: a lower low/);
});

test("the targets: half at target 1 with the stop to entry, then 1.272, or a trail to 1.618 when momentum is strong", () => {
  const { plan } = trade([]);
  let t = trade([...flatAt(120, 5), [120, plan.t1 + 0.1, 5]]), m = C.manage(t.plan, t.cs, t.now);
  assert.equal(m.action, "sell_half"); assert.equal(m.patch.phase, 1); assert.equal(m.patch.stop, plan.entry); assert.match(m.reason, /target 1/);
  // after the half: a 5-minute close under ENTRY sells the rest, but only bars after the stop moved count
  const p1 = { ...t.plan, ...m.patch };
  let t2 = trade([...flatAt(120, 5), [120, plan.t1 + 0.1, 5], ...flatAt(plan.t1, 4), ...flatAt(plan.entry - 1, 10)]); assert.match(C.manage(p1, t2.cs, t2.now).reason, /stop at entry after target 1/);
  t2 = trade([...flatAt(120, 5), [120, plan.t1 + 0.1, 5], ...flatAt(plan.t1 + 1, 4)]); assert.equal(C.manage(p1, t2.cs, t2.now).action, "hold");
  // 1.272 on weak volume: sell the rest
  t2 = trade([...flatAt(plan.t1, 10, 9), ...flatAt(plan.t1 + 2, 5, 5), [plan.t1 + 2, plan.t2 + 0.2, 4]]); assert.match(C.manage(p1, t2.cs, t2.now).reason, /target 2/);
  // 1.272 with bars closing above it on rising volume: trail
  t2 = trade([...flatAt(plan.t1, 10, 5), ...flatAt(plan.t2 + 0.5, 5, 6), ...flatAt(plan.t2 + 1, 5, 20), [plan.t2 + 1, plan.t2 + 1.2, 20]]);
  m = C.manage(p1, t2.cs, t2.now); assert.equal(m.action, "hold"); assert.equal(m.patch.phase, 2); assert.ok(m.patch.trailStop > plan.entry);
  const p2 = { ...p1, ...m.patch };
  let t3 = trade([...flatAt(plan.t1, 10, 5), ...flatAt(plan.t2 + 0.5, 5, 6), ...flatAt(plan.t2 + 1, 5, 20), ...flatAt(plan.t3 + 0.2, 2, 20)]); assert.match(C.manage(p2, t3.cs, t3.now).reason, /target 3: the 1.618/);
  t3 = trade([...flatAt(plan.t1, 10, 5), ...flatAt(plan.t2 + 0.5, 5, 6), ...flatAt(plan.t2 + 1, 5, 20), ...flatAt(p2.trailStop - 1, 10, 8)]); assert.match(C.manage(p2, t3.cs, t3.now).reason, /trail: a higher low broke/);
  // a new higher low raises the trail
  t3 = trade([...flatAt(plan.t1, 10, 5), ...flatAt(plan.t2 + 0.5, 5, 6), ...flatAt(plan.t2 + 1, 5, 20), ...flatAt(plan.t2 + 2, 5, 20), ...flatAt(plan.t2 + 3, 5, 20)]);
  m = C.manage(p2, t3.cs, t3.now); assert.equal(m.action, "hold"); assert.ok(m.patch && m.patch.trailStop > p2.trailStop, JSON.stringify(m));
});

test("veto and liquidity sell; time alone never does; missing data holds", async () => {
  const t = trade(flatAt(116, 10));
  assert.equal(C.manage(t.plan, t.cs, t.now).action, "hold");
  assert.match(C.manage(t.plan, t.cs, t.now, { vetoed: true }).reason, /^veto/);
  assert.match(C.manage(t.plan, t.cs, t.now, { liqNow: 139000 }).reason, /lost 30% of its liquidity/); assert.equal(C.manage(t.plan, t.cs, t.now, { liqNow: 141000 }).action, "hold");
  // two days in a trade on a flat chart: still holding (no clock); three more days without a single new candle: still holding
  const long = trade(flatAt(116, 2880)); assert.equal(C.manage(long.plan, long.cs, long.now).action, "hold");
  assert.equal(C.manage(long.plan, long.cs, long.now + 3 * 86400).action, "hold", "even three days without a new candle: hold");
  assert.equal(C.manage(long.plan, [], long.now).action, "hold");
  const src = (await import("node:fs")).readFileSync(new URL("../src/aq/chart.mjs", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/Date\.now|holdMin|minutes|timeStop/.test(src), "the chart trader reads no clock");
});
