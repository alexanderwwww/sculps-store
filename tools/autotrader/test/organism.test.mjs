// The living organism (build 52): unit tests on the pure module, then an engine loop driven by a fake feed and executor.
import test from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import * as O from "../src/lib/organism.mjs";
import { Engine } from "../src/lib/engine.mjs";
import { Journal } from "../src/lib/journal.mjs";
import { DEFAULTS } from "../src/lib/strategy.mjs";

const seeded = (s = 7) => () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) || 1e-9;

test("bucket edges", () => {
  assert.equal(O.bucket("rise", 0.0499), "0"); assert.equal(O.bucket("rise", 0.05), "1"); assert.equal(O.bucket("rise", 0.1), "2");
  assert.equal(O.bucket("rise", 0.15), "3"); assert.equal(O.bucket("rise", 0.25), "4"); assert.equal(O.bucket("rise", 3), "4");
  assert.equal(O.bucket("ratio", 1.29), "0"); assert.equal(O.bucket("ratio", 1.3), "1"); assert.equal(O.bucket("ratio", 2.01), "2");
  assert.equal(O.bucket("vol5", 14999), "0"); assert.equal(O.bucket("vol5", 15000), "1"); assert.equal(O.bucket("vol5", 50000), "2");
  assert.equal(O.bucket("liq", 49999), "0"); assert.equal(O.bucket("liq", 50000), "1"); assert.equal(O.bucket("liq", 100000), "2");
  assert.equal(O.bucket("path", "breakout"), "breakout"); assert.equal(O.bucket("path", undefined), "mom");
  assert.equal(O.bucket("rise", NaN), null);
});
test("weight after 29 decays is about 0.5", () => {
  const w = Math.pow(O.LAMBDA, 29); assert.ok(Math.abs(w - 0.5) <= 0.03, String(w));
  const org = O.newOrg(); O.update(org, { ret: 0.1, sig: { rise: 0.07 } });
  for (let i = 0; i < 29; i++) O.update(org, { ret: 0.1, sig: { rise: 0.5 } });
  assert.ok(Math.abs(org.b.rise["1"].n - 0.5) <= 0.03, String(org.b.rise["1"].n));
});
test("Beta sample mean within 0.02 over 10k draws", () => {
  const rng = seeded(11); let s = 0; for (let i = 0; i < 10000; i++) s += O.betaSample(3, 7, rng);
  assert.ok(Math.abs(s / 10000 - 0.3) <= 0.02, String(s / 10000));
  let t = 0; for (let i = 0; i < 10000; i++) t += O.betaSample(0.6, 0.9, rng);
  assert.ok(Math.abs(t / 10000 - 0.4) <= 0.02, String(t / 10000));
});
// today's closes as the bridge and lessons 34-39 recorded them: [entry text, real return]
const TODAY = [
  ["rising 8.3% in 30s, $7606 volume in 5m, 711 buys vs 335 sells", -0.06], ["rising 11.9% in 30s, $31830 volume in 5m, 42 buys vs 35 sells", -0.033],
  ["rising 1.1% in 30s, $10401 volume in 5m, 457 buys vs 187 sells", 0.054], ["rising 5.7% in 30s, $20050 volume in 5m, 311 buys vs 177 sells", 0.08],
  ["rising 25.7% in 30s, $263305 volume in 5m, 4970 buys vs 2220 sells", -0.05], ["rising 17.5% in 30s, $114495 volume in 5m, 587 buys vs 505 sells", -0.058],
  ["rising 7.1% in 30s, $11014 volume in 5m, 559 buys vs 167 sells", -0.176], ["rising 6.0% in 30s, $3961 volume in 5m, 158 buys vs 64 sells", -0.083],
  ["rising 13.4% in 30s, $40000 volume in 5m, 300 buys vs 120 sells", 0.148], ["rising 15.5% in 30s, $60000 volume in 5m, 222 buys vs 36 sells", -0.079],
  ["rising 26.3% in 30s, $90000 volume in 5m, 400 buys vs 300 sells", -0.101], ["rising 28.3% in 30s, $80000 volume in 5m, 350 buys vs 260 sells", -0.09],
  ["rising 21.0% in 30s, $50000 volume in 5m, 300 buys vs 150 sells", 0.21], ["rising 9.5% in 30s, $12000 volume in 5m, 200 buys vs 150 sells", -0.083],
  ["rising 4.2% in 30s, $9000 volume in 5m, 150 buys vs 100 sells", 0.04], ["rising 8.8% in 30s, $14000 volume in 5m, 260 buys vs 140 sells", -0.07],
  ["rising 3.1% in 30s, $6000 volume in 5m, 90 buys vs 70 sells", -0.012], ["rising 12.2% in 30s, $22000 volume in 5m, 310 buys vs 210 sells", 0.05],
  ["rising 6.6% in 30s, $8000 volume in 5m, 120 buys vs 80 sells", -0.05], ["rising 54.5% in 30s, $150000 volume in 5m, 900 buys vs 700 sells", -0.12],
];
test("rebuild parses the real enter strings", () => {
  const s = O.parseEnter(TODAY[0][0]);
  assert.equal(s.rise, 0.083); assert.equal(s.vol5, 7606); assert.equal(s.buys, 711); assert.equal(s.sells, 335); assert.equal(s.path, "mom");
  assert.equal(O.parseEnter("pullback buy: ran 12.5% in 2 min, back 3.0% and bouncing, $500 volume in 5m, 3 buys vs 1 sells").rise, 0.125);
  const org = O.rebuild(TODAY.map(([enter, ret]) => ({ enter, ret })));
  assert.ok(Math.abs(org.g.n - TODAY.reduce((a, _, i) => a + 0.5 * Math.pow(O.LAMBDA, TODAY.length - 1 - i), 0)) < 1e-9, "half weight, decayed");
});
test("seeding with today's 20 closes gives EV(rise 5-10) < 0", () => {
  const org = O.rebuild(TODAY.map(([enter, ret]) => ({ enter, ret })));
  const e = O.summary(org); const band = [...e.top3, ...e.bottom3];
  assert.ok(O.score(org, { rise: 0.07 }) < 0, String(O.score(org, { rise: 0.07 })));
  assert.ok(band.length > 0);
});
test("an all-negative table still gives an idle pick at 0.618 after 97 s", () => {
  const org = O.newOrg(); for (let i = 0; i < 30; i++) O.update(org, { ret: -0.08, sig: { rise: 0.2 } });
  assert.ok(O.score(org, { rise: 0.2 }) < 0);
  let t = 1e12; O.noteEntry(org, t);
  O.noteIdle(org, { rise: 0.2 }, -0.05, { pool: "A" }, t + 80000);
  O.noteIdle(org, { rise: 0.2 }, -0.02, { pool: "B" }, t + 90000);
  assert.equal(O.idlePick(org, t + 96000), null, "not before 97 s");
  const p = O.idlePick(org, t + 97000); assert.equal(p.cand.pool, "B"); assert.equal(p.m, 0.618);
  assert.equal(org.idleFires, 1);
  O.noteIdle(org, {}, -1, { pool: "C" }, t + 97000);
  assert.equal(O.idlePick(org, t + 200000), null, "a candidate older than 30 s is not bought");
  O.noteIdle(org, {}, -1, { pool: "D" }, t + 200000);
  assert.equal(O.idlePick(org, t + 200000, () => false), null, "it must still pass every filter");
});
test("sizeMul is 0.618 or 1, and 0.618 on NaN / empty", () => {
  const org = O.newOrg();
  assert.equal(O.sizeMul(org, { rise: 0.07 }), 0.618, "under 13 closes");
  for (let i = 0; i < 20; i++) O.update(org, { ret: 0.1, sig: { rise: 0.07 } });
  assert.equal(O.sizeMul(org, { rise: 0.07 }), 1);
  assert.equal(O.sizeMul(null, {}), 0.618);
});
test("NaN input falls back to the cold priors", () => {
  const org = O.newOrg(); O.update(org, { ret: NaN, sig: { rise: NaN } }); O.update(org, { ret: "x" });
  assert.equal(org.g.n, 0);
  const s = O.score(org, { rise: NaN, liq: undefined });
  assert.ok(Number.isFinite(s)); assert.equal(+s.toFixed(6), +(0.5 * O.COLD.W - 0.5 * O.COLD.L - O.COLD.fee).toFixed(6));
  const z = O.sane({ junk: 1 }); assert.equal(z.g.n, 0); assert.equal(O.sizeMul(z, {}), 0.618);
});
const row = (o) => ({ sig: {}, liqB: "1", ret: 0, f: 0.004, holdS: 60, peak: 0.02, low: -0.03, tPeak: 5000, tLow: 9000, restRet: 0, ...o });
test("a replay row with tLow < tPeak takes the stop", () => {
  const org = O.newOrg(); const s = { sl: -0.08, partAt: 0.05, tp: 0.1, partFrac: 0.5 };
  assert.equal(O.replayRow(org, row({ peak: 0.2, low: -0.1, tLow: 1000, tPeak: 5000 }), s), -0.08 + O.COLD.gS);
  assert.ok(O.replayRow(org, row({ peak: 0.2, low: -0.1, tLow: 9000, tPeak: 5000 }), s) > 0, "the peak came first: takes");
});
test("refitExits moves at most one golden step and respects the clamps", () => {
  const org = O.newOrg();
  // every coin runs to +30%: a higher tp is better, so tp moves up one step (0.10 x 1.618 = 0.1618), not to the clamp
  for (let i = 0; i < 20; i++) O.update(org, { ret: 0.07, sig: {}, peak: 0.3, low: -0.01, tPeak: 20000, tLow: 1000, restRet: 0.1, holdS: 60 });
  const cfg = { sl: -0.08, partAt: 0.05, tp: 0.1, partFrac: 0.5 };
  const ex = O.refitExits(org, cfg);
  assert.ok(ex, "it moved"); assert.equal(ex.tp, 0.1618);
  for (const [k, [lo, hi]] of Object.entries(O.CLAMP)) assert.ok(ex[k] >= lo && ex[k] <= hi, k);
  const ex2 = O.refitExits(org, { sl: -0.08, partAt: 0.08, tp: 0.2, partFrac: 0.5 });
  if (ex2) for (const [k, [lo, hi]] of Object.entries(O.CLAMP)) assert.ok(ex2[k] >= lo && ex2[k] <= hi, k);
});
test("stop is fixed at -2% (Alex 2026-10-30)", () => {
  assert.deepEqual(O.CLAMP.sl, [-0.02, -0.02]);
});

// ------------------------------------------------------------------ the engine loop, fake feed and executor
const SIZE = 0.02618;
function world({ onlyLosers = false, journalFile } = {}) {
  let now = 1_800_000_000_000, n = 0;
  const pools = new Map();                                   // pool -> {kind, born, boughtAt, p0, dead}
  const spawn = (kind) => { const k = kind || (onlyLosers || n % 2 ? "L" : "W"), id = `${k}${n++}`; pools.set(id, { kind: k, born: now, boughtAt: null, pb: null }); };
  for (let i = 0; i < 6; i++) spawn();
  const price = (id) => {
    const p = pools.get(id), dt = (now - p.born) / 1000;
    const rise = p.kind === "W" ? 0.07 : 0.2;                // 30-second rise of the band
    if (p.boughtAt == null) return Math.pow(1 + rise, dt / 30);
    const after = (now - p.boughtAt) / 1000;
    return p.pb * (p.kind === "W" ? 1 + Math.min(0.18, after * 0.01) : 1 - Math.min(0.15, after * 0.01));
  };
  const buys = [], sells = [];
  const exec = {
    name: "live", caps: { maxFeeLamports: 150000 },
    async sizeSol({ scale = 1 } = {}) { return { bal: 1, sol: +(SIZE * Math.min(1, scale)).toFixed(5) }; },
    async buy({ mint, pool, scale }) { const sol = +(SIZE * Math.min(1, scale ?? 1)).toFixed(5); const p = pools.get(pool); p.pb = price(pool); p.boughtAt = now; buys.push({ at: now, pool, sol, kind: p.kind }); return { ok: true, sol, outAmount: "1000000", feeLamports: 5000 }; },
    async sell(pos) { const p = pools.get(pos.pool), r = price(pos.pool) / p.pb; sells.push({ at: now, pool: pos.pool, r }); p.dead = true; return { ok: true, inAmount: "1000000", outAmount: String(Math.round(pos.stake * r * 0.99 * 1e9)) }; },
  };
  const feed = {
    quotes: async (ids) => new Map(ids.filter((id) => pools.has(id)).map((id) => { const k = pools.get(id).kind; return [id, { price: price(id), liqUsd: k === "W" ? 60000 : 30000, buys5: k === "W" ? 300 : 110, sells5: 100, vol5: k === "W" ? 20000 : 8000 }]; })),
    newPools: async () => [], trendingPools: async () => [], candles: async () => [],
  };
  const cfg = { ...DEFAULTS, pullback: 0, momMin: 0.03, momMax: 0.5, liveMinVol5: 500, liveMinFlow: 3, liveBuyRatio: 0.8, liveMinLiq: 25000, entryMinLiq: 25000, sl: -0.08, tp: 0.1, partAt: 0.05, partFrac: 0.5, lockFrom: 0.03, lockAt: 0.005, staleMin: 2, maxHoldMin: 5, cooldownMin: 2, maxOpen: 8 };
  const make = (org = null) => {
    const e = new Engine({ feed, exec, cfg, journal: new Journal(journalFile), rug: async () => ({ pass: true, reason: "ok" }), now: () => now, org, rng: seeded(3) });
    e.learned = []; e.onLearn = (c) => e.learned.push(JSON.parse(JSON.stringify(c)));
    return e;
  };
  const step = async (e) => {
    for (const [id, p] of pools) if (p.dead) { pools.delete(id); spawn(p.kind); }   // the same mix of bands all the time
    e.ready = [...pools.keys()].filter((id) => !pools.get(id).boughtAt).map((id) => ({ name: id, mint: `m${id}`, pool: id, liqUsd: 60000, vol5: 20000 }));
    await e.fast(); now += 3000;
  };
  return { make, step, buys, sells, pools, get now() { return now; }, cfg };
}
const tmpJ = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "org-")), "j.jsonl");

test("engine loop: 60 trades, winning band favoured, losing band shrinks, caps held, exits honoured, persists", async () => {
  const jf = tmpJ(), w = world({ journalFile: jf });
  const e = w.make();
  const opens = new Map();
  for (let i = 0; w.sells.length < 60 && i < 20000; i++) {
    await w.step(e);
    for (const p of e.open.values()) if (!opens.has(p.id)) opens.set(p.id, { sl: p.sl, tp: p.tp, stake: p.stake });
  }
  assert.ok(w.sells.length >= 60, `closed ${w.sells.length}`);
  // caps: no stake above the size, multiplier only 0.618 or 1
  for (const b of w.buys) assert.ok(b.sol <= SIZE + 1e-12 && (b.sol === SIZE || b.sol === +(SIZE * 0.618).toFixed(5)), JSON.stringify(b));
  // learning: the winning band (rise 5-10%, liq 50-100k, buyers 3x) scores above the losing one, and the late buys show it
  const W = { path: "mom", rise: 0.04, liq: 60000, ratio: 3, vol5: 20000 }, L = { path: "mom", rise: 0.2, liq: 30000, ratio: 1.1, vol5: 8000 };
  assert.ok(O.score(e.org, W) > 0 && O.score(e.org, L) < 0, `${O.score(e.org, W)} ${O.score(e.org, L)}`);
  assert.equal(O.sizeMul(e.org, W), 1, JSON.stringify(O.sigBuckets(W)) + JSON.stringify(Object.fromEntries(O.DIMS.map((d) => [d, Object.fromEntries(Object.entries(e.org.b[d]).map(([k, b]) => [k, +b.n.toFixed(1)]))])))); assert.equal(O.sizeMul(e.org, L), 0.618);
  const late = w.buys.slice(-20);
  assert.ok(late.filter((b) => b.kind === "W").length > late.filter((b) => b.kind === "L").length, JSON.stringify(late.map((b) => b.kind)));
  assert.ok(late.filter((b) => b.kind === "L").every((b) => b.sol < SIZE), "a losing band only ever gets 0.618");
  // never stops: no gap between buys over 97 s (plus one 3 s tick) while candidates exist
  for (let k = 1; k < w.buys.length; k++) assert.ok(w.buys[k].at - w.buys[k - 1].at <= 97000 + 3000, `gap ${(w.buys[k].at - w.buys[k - 1].at) / 1000}s`);
  // the journal carries the numbers the organism learns from
  const closes = fs.readFileSync(jf, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((x) => x.type === "close");
  assert.ok(closes.length >= 60);
  for (const c of closes) { assert.equal(typeof c.sig.rise, "number"); assert.equal(typeof c.holdS, "number"); assert.ok(c.exitKind); }
  const stops = closes.filter((c) => c.exitKind === "stop"), takes = closes.filter((c) => c.exitKind === "take");
  assert.ok(stops.length && takes.length);
  for (const c of [...stops, ...takes]) assert.equal(typeof c.gap, "number");
  // each position's own levels: a stop fires at the sl it was bought under, a take at its tp
  const openRec = new Map(fs.readFileSync(jf, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((x) => x.type === "open").map((x) => [x.id, x]));
  for (const c of stops) assert.equal(c.trig, +openRec.get(c.id).sl.toFixed(4));
  for (const c of takes) assert.equal(c.trig, +openRec.get(c.id).tp.toFixed(4));
  // onLearn got the org; size and caps were never written
  assert.ok(e.learned.length >= 60 && e.learned.every((x) => x.org && x.org.g));
  assert.equal(e.cfg.size, undefined); assert.equal(e.exec.caps.maxFeeLamports, 150000);
  for (const [k, [lo, hi]] of Object.entries(O.CLAMP)) assert.ok(e.cfg[k] >= lo && e.cfg[k] <= hi, `${k} ${e.cfg[k]}`);
  // restart: the saved org comes back, and without one it is rebuilt from the journal
  const saved = JSON.parse(JSON.stringify(e.learned.at(-1).org));
  const e2 = w.make(saved);
  assert.equal(+e2.org.g.n.toFixed(6), +e.org.g.n.toFixed(6));
  assert.ok(O.score(e2.org, W) > O.score(e2.org, L));
  const e3 = w.make(null);
  assert.ok(e3.org.g.n > 0 && O.score(e3.org, W) > O.score(e3.org, L), "rebuilt from the journal");
  assert.ok(e.status().organism.g.n > 0);
});
test("engine loop: every band negative, it still trades (idle pick at 0.618)", async () => {
  const w = world({ onlyLosers: true, journalFile: tmpJ() });
  const seed = O.newOrg(); for (let i = 0; i < 40; i++) O.update(seed, { ret: -0.1, sig: { path: "mom", rise: 0.2, liq: 30000, ratio: 1.1, vol5: 8000 } });
  const e = w.make(seed);
  for (let i = 0; i < 400; i++) await w.step(e);       // 20 minutes
  assert.ok(w.buys.length >= 8, `buys ${w.buys.length}`);
  assert.ok(w.buys.every((b) => b.sol === +(SIZE * 0.618).toFixed(5)));
  for (let k = 1; k < w.buys.length; k++) assert.ok(w.buys[k].at - w.buys[k - 1].at <= 100000, `gap ${(w.buys[k].at - w.buys[k - 1].at) / 1000}s`);
  assert.ok(e.org.idleFires >= 1);
});

// ------------------------------------------------------------------ review fixes (build 53)
test("full size needs 13 closes in EVERY band the coin falls into, not just 13 overall", () => {
  const org = O.newOrg();
  for (let i = 0; i < 20; i++) O.update(org, { ret: 0.1 });            // 20 winners, no signal
  assert.ok(O.score(org, { rise: 0.3, liq: 30000 }) > 0);
  assert.equal(O.sizeMul(org, { rise: 0.3, liq: 30000 }), 0.618, "untested band stays at 0.618");
  for (let i = 0; i < 20; i++) O.update(org, { ret: 0.1, sig: { rise: 0.3 } });
  assert.equal(O.sizeMul(org, { rise: 0.3, liq: 30000 }), 0.618, "liq band still untested");
  assert.equal(O.sizeMul(org, { rise: 0.3 }), 1);
});
test("replay banks the part when the peak passed partAt before the stop", () => {
  const org = O.newOrg(); const s = { sl: -0.08, partAt: 0.05, tp: 0.5 };
  const v = O.replayRow(org, row({ peak: 0.06, low: -0.1, tPeak: 1000, tLow: 9000, restRet: 0.005 }), s);
  const want = O.PART_FRAC * (0.05 + O.COLD.gT) + (1 - O.PART_FRAC) * 0.005;
  assert.ok(Math.abs(v - want) < 1e-9, `${v} vs ${want}`);
});
test("cold priors are lesson-39 real: starting EV is negative, not optimistic", () => {
  assert.ok(O.score(O.newOrg(), {}) < 0);
});
test("old journal closes without t0 do not enter the book with a fake 60 s hold", () => {
  const org = O.rebuild([{ ret: 0.02, enter: "rising 8% in 30s" }]);
  assert.equal(org.book[0].holdS, null);
});
