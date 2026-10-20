// The fast lane in hunt mode (build 25), driven with a fake GMGN: chart entries
// (Fibonacci pocket or ignition candle), +40% / -15% / give-back / 2-minute exits,
// real fees charged, learning that is allowed to lose first.
import { Scalp, fibSetup, ignition, rugOk, shapeOf } from "../src/trader/scalp.mjs";
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, x ?? ""); } };
const now0 = 1_800_000_000_000, sec = Math.floor(now0 / 1000);

// A Fibonacci chart: flat at 1, a 30% run to 1.30, a pullback into the pocket, last candle green.
const fibChart = () => {
  const path = [...Array(10).fill(1), 1.03, 1.06, 1.1, 1.14, 1.18, 1.22, 1.26, 1.3, 1.25, 1.2, 1.16, 1.13, 1.11, 1.12];
  return path.map((c, i) => ({ t: i, o: i === path.length - 1 ? 1.11 : c, h: c, l: i === path.length - 1 ? 1.11 : c, c, v: 100 }));
};
// An ignition: quiet, then the live candle +6% on 5x volume. Price ends at 1.06.
const ignChart = () => [...Array.from({ length: 11 }, (_, i) => ({ t: i, o: 1, h: 1, l: 1, c: 1, v: 100 })), { t: 11, o: 1, h: 1.06, l: 1, c: 1.06, v: 500 }];
const flat = () => Array.from({ length: 30 }, (_, i) => ({ t: i, o: 1, h: 1, l: 1, c: 1, v: 100 }));

ok("fib: pocket after a 30% run -> yes; flat -> no", fibSetup(fibChart()) && !fibSetup(flat()), fibSetup(fibChart()));
ok("ignition: +6% on 5x volume -> yes; flat -> no", ignition(ignChart()) && !ignition(flat()), ignition(ignChart()));
const row = (a, extra = {}) => ({ a, s: a, ct: sec - 600, lq: 20_000, ...extra });
ok("hunt takes a 2-minute-old launch on a thin pool; refuses a 20-second-old one and an empty pool",
  rugOk(row("x", { ct: sec - 120, lq: 4_000 }), sec) && !rugOk(row("x", { ct: sec - 20 }), sec) && !rugOk(row("x", { lq: 500 }), sec));

const prices = {};
const charts = { F: fibChart(), I: ignChart(), Z: flat() };
const rows = [row("F"), row("I"), row("Z")];
const src = {
  trending: async () => rows,
  candles: async (a, r, limit) => (limit <= 2 ? [{ t: 1, o: 1, h: 1, l: 1, c: prices[a], v: 1 }] : charts[a] || flat()),
};
const log = [];
const quote = async () => ({ ok: true, costSide: 0.02, costRt: 0.04 });
const s = new Scalp({ src, log: (e) => log.push(e), start: 50, stake: 1.618, quote });
s.configure({ readChart: true }); // the chart-reading side (the trader); symbiot is tested below
await s.scanLane(now0);
ok("chart side: buys the Fibonacci and the ignition coin, not the flat one", s.open.has("F") && s.open.has("I") && !s.open.has("Z") && s.open.size === 2, [...s.open.keys()]);
ok("1.618 SOL each, real fee charged on the way in", [...s.open.values()].every((p) => p.cost === 1.618 && p.side === 0.02) && Math.abs(s.cash - (50 - 2 * 1.618)) < 1e-9);
ok("each entry says why, from the chart", log.filter((e) => e.type === "entry").every((e) => /golden pocket|ignition candle|bought to learn/.test(e.why)) && log.some((e) => /golden pocket/.test(e.why || "")) && log.some((e) => /ignition/.test(e.why || "")), log);

// F rips +45% -> taken at +40%; I runs +30% then falls back to +14% -> gave back half
prices.F = 1.12 * 1.45; prices.I = 1.06 * 1.30;
await s.positionLane(now0 + 10_000);
ok("+40% hit: sold at once", s.trades.length === 1 && s.trades[0].symbol === "F" && s.trades[0].why === "+40%" && s.trades[0].won, s.trades);
prices.I = 1.06 * 1.14;
await s.positionLane(now0 + 20_000);
ok("a +30% run given back to +14%: out, still a win", s.trades.length === 2 && /gave back half/.test(s.trades[1].why) && s.trades[1].won, s.trades[1]);

// stop and time
const t = new Scalp({ src, start: 50, stake: 1.618, quote });
t.configure({ readChart: true });
await t.scanLane(now0);
prices.F = 1.12 * 0.84; prices.I = 1.06;
await t.positionLane(now0 + 5_000);
ok("-16%: stopped at -15%", t.trades.some((x) => x.symbol === "F" && x.why === "stop -15%" && !x.won), t.trades);
await t.positionLane(now0 + 120_001);
ok("nothing happened for 2 minutes: out", t.trades.some((x) => x.symbol === "I" && x.why === "120 s"), t.trades);
ok("a coin just sold waits before it is bought again", (await t.scanLane(now0 + 121_000), !t.open.has("F") && !t.open.has("I")));

// fees (build 28): the first buy waits for a measured fee; after that every coin is bought at
// once and its own real fee, measured right after, is written into the ledger.
const f = new Scalp({ src, start: 50, stake: 1.618, quote: async ({ mint }) => (mint === "F" ? { ok: true, costSide: 0.05, costRt: 0.10 } : { ok: true, costSide: 0.2, costRt: 0.4 }) });
await f.scanLane(now0);
await new Promise((r) => setTimeout(r, 20));
ok("all three bought without waiting on each one", f.open.size === 3, f.summary());
ok("each position carries its own measured fee (F 5%, the others 20%)", f.open.get("F").side === 0.05 && f.open.get("I").side === 0.2 && f.open.get("Z").side === 0.2, [...f.open.values()].map((p) => p.side));
ok("the ledger's fees are the measured ones", Math.abs(f.summary().fees - 1.618 * (0.05 + 0.2 + 0.2)) < 1e-3, f.summary());
const g = new Scalp({ src, start: 50, stake: 1.618, quote: async () => ({ ok: false, why: "no priced route" }) });
await g.scanLane(now0);
ok("no fee can be measured at all: nothing is bought on a guess", g.open.size === 0);

const imp = new Scalp({ src, start: 50, stake: 1.618, quote: async () => ({ ok: false, why: "price impact 3.06% over the 2.36% cap", costSide: 0.03 }) });
await imp.scanLane(now0); await new Promise((r) => setTimeout(r, 20));
ok("high price impact is still traded, at its measured cost", imp.open.size === 3 && [...imp.open.values()].every((p) => p.side === 0.03), imp.summary());

// learning: allowed to lose 12 times; 13 losses under 23.6% wins -> that shape is blocked
const L = new Scalp({ src, start: 50, stake: 1.618, quote });
const shape = [...shapeOf(fibChart(), rows[0], now0), "e:fib"];
for (let i = 0; i < 13; i++) { prices["X" + i] = 0.8; L.open.set("X" + i, { addr: "X" + i, symbol: "X", cost: 1.618, side: 0.02, units: 1.618, entry: 1, last: 1, at: now0, shape, hunt: true, peak: 0 }); }
await L.positionLane(now0 + 1000);
ok("13 losing trades of one shape become a lesson", L.summary().lessons >= 1 && L.badPart(shape) !== null);
const L2 = new Scalp({ src, start: 50, stake: 1.618, quote });
for (let i = 0; i < 12; i++) { prices["Y" + i] = 0.8; L2.open.set("Y" + i, { addr: "Y" + i, symbol: "Y", cost: 1.618, side: 0.02, units: 1.618, entry: 1, last: 1, at: now0, shape, hunt: true, peak: 0 }); }
await L2.positionLane(now0 + 1000);
ok("12 losses are not enough to block it: it keeps learning", L2.badPart(shape) === null);
ok("stake never changes after losses (no emotion)", L.stake === 1.618);

// restart and a new plan
const back = Scalp.from(JSON.parse(JSON.stringify(s.toJSON())), { src, start: 50, stake: 1.618 });
ok("state survives a restart", back.summary().trades === 2 && Math.abs(back.cash - s.cash) < 1e-9);
ok("a ledger from an earlier plan starts fresh", Scalp.from({ v: 2, plan: "fib24", start: 50, stake: 1.618, cash: 40, trades: [{}] }, { src, start: 50, stake: 1.618 }).summary().trades === 0);

// build 29: the Trenches feed, once per coin, infinite balance, + and - totals
const feedRow = { a: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", s: "NEW", lq: 4200, ct: sec - 90 };
const src2 = { ...src, feed: () => [feedRow], candles: async (a, r, limit) => (limit <= 2 ? [{ t: 1, o: 1, h: 1, l: 1, c: prices[a] ?? 1, v: 1 }] : flat()) };
const S2 = new Scalp({ src: src2, start: 0, stake: 1.618, quote });
await S2.scanLane(now0);
ok("a coin from the Trenches feed is traded", S2.open.has(feedRow.a));
ok("cash at zero never blocks a trade (infinite balance)", S2.open.size === 4 && S2.cash < 0, S2.summary());
prices[feedRow.a] = 1.5; prices.F = 1.0; prices.I = 1.0; prices.Z = 0.8;
await S2.positionLane(now0 + 1000);
await S2.scanLane(now0 + 999_999);
ok("each coin is traded once, never again", S2.open.size === 0 || ![...S2.open.keys()].some((a) => a === feedRow.a), [...S2.open.keys()]);
const sm = S2.summary();
ok("the money line has + total, - total and net", sm.plus > 0 && sm.minus < 0 && Math.abs(sm.net - (sm.plus + sm.minus)) < 1e-3, sm);
// build 32: symbiot (readChart off) buys every coin at its live price, settings change live
const sy = new Scalp({ src: { ...src, candles: async (a, r, limit) => [{ t: 1, o: 1, h: 1, l: 1, c: 2, v: 1 }] }, start: 0, stake: 1.618, quote });
await sy.scanLane(now0);
ok("symbiot buys every coin without reading a chart, at the live price", sy.open.size === 3 && [...sy.open.values()].every((p) => p.entry === 2), [...sy.open.values()].map((p) => p.entry));
sy.configure({ stake: 3, tp: 0.5, maxOpen: 4, bogus: 1, sl: "x" });
ok("settings change live: known keys only, right types only", sy.cfg.stake === 3 && sy.cfg.tp === 0.5 && sy.cfg.maxOpen === 4 && !("bogus" in sy.cfg) && sy.cfg.sl === -0.15, sy.cfg);
const fsrc = { ...src, feeInfo: async (a) => ({ pool_fee_info_list: [{ fee_ratio: a === "F" ? 0.0025 : 0.0125, liquidity: 1 }], security: {} }), candles: async () => [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }] };
const lo = new Scalp({ src: fsrc, start: 0, stake: 1.618, quote: async () => ({ ok: true, costSide: 0.0025, costRt: 0.005 }) });
lo.configure({ maxRt: 0.01 });
await lo.scanLane(now0);
ok("lowest fees: only the coin whose pool fee fits (0.25% a side) is bought", lo.open.size === 1 && lo.open.has("F") && lo.summary().costSkips === 2, lo.summary());
// build 35: symbiot never refuses a coin because of a lesson
const nb = new Scalp({ src: { ...src, candles: async () => [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }] }, start: 0, stake: 1.618, quote });
for (const k of ["age1", "lq1", "h0", "src:trending", "e:any"]) nb.learn[k] = { n: 50, w: 0, pnl: -5, until: 999 };
await nb.scanLane(now0);
ok("symbiot keeps buying even with losing lessons on record (it farms)", nb.open.size === 3 && nb.skips === 0, nb.summary());
ok("symbiot files each trade by age, pool, hour and source", [...nb.open.values()].every((p) => p.shape.some((k) => k.startsWith("age")) && p.shape.some((k) => k.startsWith("src:"))), [...nb.open.values()].map((p) => p.shape));
// build 36: the post-mortem of every trade
{
  const px = {};
  const msrc = { trending: async () => [], candles: async (a) => [{ t: 1, o: 1, h: 1, l: 1, c: px[a], v: 1 }] };
  const M = new Scalp({ src: msrc, start: 0, stake: 1.618, quote });
  M.configure({ shadowMs: 200_000 });
  const put = (a, entry) => M.open.set(a, { addr: a, symbol: a, cost: 1.618, side: 0.01, units: 1.618 * 0.99 / entry, entry, last: entry, at: now0, shape: ["x"], hunt: true, peak: 0 });
  put("ST", 1); put("SR", 1); put("TT", 1); put("FE", 1); put("GB", 1); put("WN", 1);
  px.ST = 0.84; px.SR = 0.84; px.TT = 1.0; px.FE = 1.005; px.GB = 1.2; px.WN = 1.2;
  await M.positionLane(now0 + 1000);                       // ST, SR stopped; GB, WN peak at +20%
  px.GB = 1.09; px.WN = 1.15;
  await M.positionLane(now0 + 2000);                       // GB, WN give back half
  px.GB = 0.95;
  await M.positionLane(now0 + 121_000);                    // TT, FE time out; GB already closed
  px.ST = 1.3; px.SR = 0.7; px.TT = 1.3; px.FE = 1.0; px.GB = 0.9; px.WN = 1.1;
  await M.positionLane(now0 + 130_000);
  await M.positionLane(now0 + 400_000);                    // shadows done
  const tag = (a) => M.trades.find((t) => t.symbol === a)?.mistake;
  ok("stopped, then the coin pumped: stop-then-pump", tag("ST") === "stop-then-pump", M.trades);
  ok("stopped, and it kept falling: cut-right", tag("SR") === "cut-right");
  ok("timed out, then ran 30%: sold-too-early", tag("TT") === "sold-too-early");
  ok("price barely moved, lost to the fee: fee-ate-it", tag("FE") === "fee-ate-it", M.trades.find((t) => t.symbol === "FE"));
  ok("a win that did not run away after: good", tag("WN") === "good", M.trades.find((t) => t.symbol === "WN"));
  ok("summary counts each pattern with its average", M.summary().mistakes["stop-then-pump"].n === 1 && typeof M.summary().mistakes.good.avg === "number", M.summary().mistakes);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
