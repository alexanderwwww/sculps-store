// The chart trader's decisions (src/aq/chart.mjs) on synthetic charts. Pure: no database, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../src/aq/chart.mjs";
import { chart, place, rise } from "./fib-fixture.mjs";
const NOW = 1_800_000_000; // a fixed clock: every test says exactly which moment it is

test("the leg: a clear one is found, flat or small charts have none, a 5-minute close under 78.6% breaks it", () => {
  const cs = chart(NOW), leg = C.findLeg(C.bars5(cs, NOW));
  assert.equal(leg.ok, true); assert.ok(leg.high > 129 && leg.high < 131); assert.ok(leg.low > 99 && leg.low < 100); assert.ok(leg.highT > leg.lowT);
  assert.ok(leg.levels.z50 < leg.high && leg.levels.z618 < leg.levels.z50 && leg.levels.z786 < leg.levels.z618 && leg.levels.stop < leg.levels.z786);
  assert.ok(Math.abs(leg.levels.t2 - (leg.low + 1.272 * (leg.high - leg.low))) < 1e-4 && Math.abs(leg.levels.t3 - (leg.low + 1.618 * (leg.high - leg.low))) < 1e-4);
  const flat = place(NOW, Array.from({ length: 200 }, (_, i) => [100 + Math.sin(i) * 0.3, 100 + Math.sin(i + 1) * 0.3, 10]));
  assert.equal(C.findLeg(C.bars5(flat, NOW)).ok, false);
  assert.match(C.findLeg(C.bars5(chart(NOW, { legTo: 2, pull: 1, tail: [] }), NOW)).why, /leg too small/);
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
  const { plan, s } = trade([]);
  // the stop's formula, to the number: the closer of 78.6% and the pullback's swing low, minus 0.25 ATR
  assert.ok(Math.abs(plan.stop - (Math.max(s.levels.z786, s.pullLow) - 0.25 * s.leg.atr)) < 1e-4); assert.equal(s.stopFrom, s.pullLow > s.levels.z786 ? "swing low" : "78.6%");
  { const deep = C.entrySetup(chart(NOW, { pull: 20, tail: rise(111.6, 112.4) }), NOW); if (deep.signal) assert.ok(Math.abs(deep.stop - (Math.max(deep.levels.z786, deep.pullLow) - 0.25 * deep.leg.atr)) < 1e-4); }
  let t = trade([...flatAt(114.6, 5), ...flatAt(plan.stop - 0.5, 5)]); assert.deepEqual(C.manage(t.plan, t.cs, t.now).action, "sell_all"); assert.match(C.manage(t.plan, t.cs, t.now).reason, /^stop: a 5-minute close under/);
  // in phase 0 any low under the pullback low is a lower low, which comes before the stop; the wick rule is shown with the stop at entry
  const p1 = { ...plan, phase: 1, stop: plan.entry, since: plan.since };
  t = trade([...flatAt(120, 5), [120, plan.entry - 1, 5], [plan.entry - 1, 118, 5], ...flatAt(118, 3)]); // a dip under the stop inside a 5-minute bar that closes above
  assert.equal(C.manage(p1, t.cs, t.now).action, "hold");
  t = trade([...flatAt(120, 5), ...flatAt(plan.entry - 1, 5)]); assert.match(C.manage(p1, t.cs, t.now).reason, /stop at entry/);
  // under the swing low but above the stop: no 1-minute wick rule any more. Holds; a 5-minute CLOSE under the stop sells
  t = trade([...flatAt(114.6, 5), ...flatAt(plan.pullLow - 0.4, 5)]); assert.ok(plan.pullLow - 0.4 > plan.stop); assert.equal(C.manage(t.plan, t.cs, t.now).action, "hold");
  t = trade([...flatAt(114.6, 5), [114.6, 114.6, 5], [114.6, plan.stop - 1, 5], [plan.stop - 1, 114.6, 5], ...flatAt(114.6, 2)]); assert.equal(C.manage(t.plan, t.cs, t.now).action, "hold", "a wick under the stop inside a bar that closes above it");
});
test("thin coins: the leg window is 3 hours of the clock, and ATR does not bridge empty 5-minute buckets", () => {
  const cs = chart(NOW, { flat: 240 }), full = C.bars5(cs, NOW), leg = C.findLeg(full); assert.equal(leg.ok, true); assert.ok(full.length >= 40);
  // remove every other 5-minute bucket: 36 bars would now reach back 6 hours; the window stays 3 hours and has too few bars
  const thin = full.filter((b, i) => i % 2 === 0); assert.match(C.findLeg(thin).why, /five-minute bars in the last 3 hours: too thin/);
  // ATR across a 20-minute gap uses the bar's own range, not the jump from a close 20 minutes earlier
  const gap = [{ t: 0, o: 100, h: 101, l: 99, c: 100 }, ...Array.from({ length: 6 }, (_, i) => ({ t: 1200 + i * 300, o: 150, h: 151, l: 149, c: 150 }))];
  assert.equal(C.atrAbs(gap), 2);
});

test("the targets: half at target 1 with the stop to entry, then 1.272 judged on its 5-minute close, a trail to 1.618 only on strength", () => {
  const { plan } = trade([]);
  let t = trade([...flatAt(120, 5), [120, plan.t1 + 0.1, 5]]), m = C.manage(t.plan, t.cs, t.now);
  assert.equal(m.action, "sell_half"); assert.equal(m.patch.phase, 1); assert.equal(m.patch.stop, plan.entry); assert.match(m.reason, /target 1/);
  // after the half: a 5-minute close under ENTRY sells the rest, but only bars after the stop moved count
  const p1 = { ...t.plan, ...m.patch };
  let t2 = trade([...flatAt(120, 5), [120, plan.t1 + 0.1, 5], ...flatAt(plan.t1, 4), ...flatAt(plan.entry - 1, 10)]); assert.match(C.manage(p1, t2.cs, t2.now).reason, /stop at entry after target 1/);
  t2 = trade([...flatAt(120, 5), [120, plan.t1 + 0.1, 5], ...flatAt(plan.t1 + 1, 4)]); assert.equal(C.manage(p1, t2.cs, t2.now).action, "hold");
  // 1.272 touched by one minute: wait for that 5-minute bar to close; weak volume -> sell the rest
  const weak = [...flatAt(plan.t1, 10, 9), ...flatAt(plan.t1 + 2, 5, 5), [plan.t1 + 2, plan.t2 + 0.2, 4]];
  t2 = trade(weak); m = C.manage(p1, t2.cs, t2.now); assert.equal(m.action, "hold"); assert.match(m.reason, /waiting for the 5-minute close/); assert.ok(m.patch.t2At > 0);
  const pw = { ...p1, ...m.patch }; t2 = trade([...weak, ...flatAt(plan.t2 + 0.2, 4, 4)]); assert.match(C.manage(pw, t2.cs, t2.now).reason, /^target 2/);
  // that bar closes above 1.272 on rising volume: trail
  const up = [...flatAt(plan.t1, 10, 5), [plan.t1, plan.t2 + 0.5, 20]];
  t2 = trade(up); m = C.manage(p1, t2.cs, t2.now); assert.equal(m.action, "hold"); const pu = { ...p1, ...m.patch };
  const strong = [...up, ...flatAt(plan.t2 + 0.5, 4, 20)];
  t2 = trade(strong); m = C.manage(pu, t2.cs, t2.now); assert.equal(m.action, "hold", m.reason); assert.equal(m.patch.phase, 2); assert.ok(m.patch.trailStop > plan.entry);
  const p2 = { ...pu, ...m.patch };
  let t3 = trade([...strong, ...flatAt(plan.t3 + 0.2, 2, 20)]); assert.match(C.manage(p2, t3.cs, t3.now).reason, /target 3: the 1.618/);
  t3 = trade([...strong, ...flatAt(p2.trailStop - 1, 10, 8)]); assert.match(C.manage(p2, t3.cs, t3.now).reason, /trail: a higher low broke/);
  // a 5-minute close back under 1.272 (still above the trail) sells: the trail runs only while closes stay above 1.272
  t3 = trade([...strong, ...flatAt(plan.t2 - 0.1, 5, 8)]); assert.ok(plan.t2 - 0.1 > p2.trailStop); assert.match(C.manage(p2, t3.cs, t3.now).reason, /fell back under 1.272/);
  // a new higher low raises the trail, and moves `since` with it
  t3 = trade([...strong, ...flatAt(plan.t2 + 2, 5, 20), ...flatAt(plan.t2 + 3, 5, 20)]);
  m = C.manage(p2, t3.cs, t3.now); assert.equal(m.action, "hold"); assert.ok(m.patch && m.patch.trailStop > p2.trailStop, JSON.stringify(m)); assert.ok(m.patch.since > p2.since);
  // the raise is not retroactive: an older bar that closed under the new trail does not sell
  const p3 = { ...p2, ...m.patch }; assert.equal(C.manage(p3, t3.cs, t3.now).action, "hold");
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

test("the leg must be at least 3x the 5-minute ATR: just under the line is refused, just over it is accepted", () => {
  assert.equal(C.FIB.minLegAtr, 3);
  const b = C.bars5(chart(NOW), NOW), leg = C.findLeg(b), ratio = (leg.high - leg.low) / leg.atr, keep = C.FIB.minLegAtr;
  try {
    C.FIB.minLegAtr = ratio * 1.01; assert.match(C.findLeg(b).why, /leg too small/);
    C.FIB.minLegAtr = ratio * 0.99; assert.equal(C.findLeg(b).ok, true);
  } finally { C.FIB.minLegAtr = keep; }
});

test("fast target: half at +fastPct, stop to entry, the rest trailed under each higher 5-minute low; a plan without fastPct is unchanged", () => {
  const start = NOW - 3600, base = chart(start), s0 = C.entrySetup(base, start); assert.equal(s0.signal, true, s0.why);
  const after = (rows) => [...base, ...place(0, rows, Math.floor(start / 60) * 60)], end = (rows) => Math.floor(start / 60) * 60 + rows.length * 60;
  const flat = (p, k) => Array.from({ length: k }, () => [p, p, 5]), E = s0.entry, plan = C.planOf(s0, start, { fastPct: 1 });
  // under +1%: nothing; a plan with no fastPct never takes the fast target
  let rows = flat(E * 1.009, 3); assert.equal(C.manage(plan, after(rows), end(rows)).action, "hold");
  rows = [...flat(E * 1.004, 2), [E * 1.004, E * 1.012, 9]]; assert.equal(C.manage(C.planOf(s0, start), after(rows), end(rows)).action, "hold", "no fastPct on the plan: the current exits, untouched");
  // the minute that closes 1.2% up: half is sold at once (no 5-minute close awaited), the stop goes to the entry, phase 3
  let m = C.manage(plan, after(rows), end(rows)); assert.equal(m.action, "sell_half"); assert.match(m.reason, /^fast target: \+1% \(sold half, stop to entry, tight trail on the rest\)/); assert.equal(m.patch.phase, 3); assert.equal(m.patch.stop, E);
  const p3 = { ...plan, ...m.patch };
  // the rest: a 5-minute close back under the entry sells it at the entry stop
  let r2 = [...rows, ...flat(E * 0.995, 12)]; m = C.manage(p3, after(r2), end(r2)); assert.equal(m.action, "sell_all"); assert.equal(m.reason, "stop at entry after the fast target");
  // or it climbs: each higher 5-minute low raises the trail, and a 5-minute close under the trail sells
  r2 = [...rows, ...flat(E * 1.02, 7), ...flat(E * 1.03, 5), ...flat(E * 1.04, 5)]; let p = p3, raised = 0;
  for (let k = rows.length + 1; k <= r2.length; k++) { const x = C.manage(p, after(r2.slice(0, k)), end(r2.slice(0, k))); assert.equal(x.action, "hold", x.reason); if (x.patch) { p = { ...p, ...x.patch }; raised++; } }
  assert.ok(raised >= 2 && p.trailStop > E * 1.025, "the trail followed the higher lows: " + p.trailStop); assert.ok(p.trailStop < E * 1.04);
  const r3 = [...r2, ...flat(E * 1.022, 10)]; m = C.manage(p, after(r3), end(r3)); assert.equal(m.action, "sell_all"); assert.equal(m.reason, "trail: a higher low broke");
  // target 3 still takes the rest
  const r4 = [...rows, [E * 1.02, s0.t3 * 1.001, 9]]; m = C.manage(p3, after(r4), end(r4)); assert.equal(m.action, "sell_all"); assert.match(m.reason, /^target 3/);
  // before the fast target the normal stop is still the stop
  const r5 = flat(s0.stop * 0.99, 12); assert.match(C.manage(plan, after(r5), end(r5)).reason, /^stop: a 5-minute close under the 78.6% stop/);
});
