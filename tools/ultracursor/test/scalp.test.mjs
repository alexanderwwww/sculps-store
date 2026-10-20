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
await s.scanLane(now0);
ok("buys the Fibonacci coin and the ignition coin, not the flat one", s.open.has("F") && s.open.has("I") && !s.open.has("Z") && s.open.size === 2, [...s.open.keys()]);
ok("1.618 SOL each, real fee charged on the way in", [...s.open.values()].every((p) => p.cost === 1.618 && p.side === 0.02) && Math.abs(s.cash - (50 - 2 * 1.618)) < 1e-9);
ok("each entry says why, from the chart", log.filter((e) => e.type === "entry").every((e) => /golden pocket|ignition candle/.test(e.why)), log);

// F rips +45% -> taken at +40%; I runs +30% then falls back to +14% -> gave back half
prices.F = 1.12 * 1.45; prices.I = 1.06 * 1.30;
await s.positionLane(now0 + 10_000);
ok("+40% hit: sold at once", s.trades.length === 1 && s.trades[0].symbol === "F" && s.trades[0].why === "+40%" && s.trades[0].won, s.trades);
prices.I = 1.06 * 1.14;
await s.positionLane(now0 + 20_000);
ok("a +30% run given back to +14%: out, still a win", s.trades.length === 2 && /gave back half/.test(s.trades[1].why) && s.trades[1].won, s.trades[1]);

// stop and time
const t = new Scalp({ src, start: 50, stake: 1.618, quote });
await t.scanLane(now0);
prices.F = 1.12 * 0.84; prices.I = 1.06;
await t.positionLane(now0 + 5_000);
ok("-16%: stopped at -15%", t.trades.some((x) => x.symbol === "F" && x.why === "stop -15%" && !x.won), t.trades);
await t.positionLane(now0 + 120_001);
ok("nothing happened for 2 minutes: out", t.trades.some((x) => x.symbol === "I" && x.why === "2 min"), t.trades);
ok("a coin just sold waits before it is bought again", (await t.scanLane(now0 + 121_000), !t.open.has("F") && !t.open.has("I")));

// fees: over 15% is skipped, under is taken at the measured cost
const f = new Scalp({ src, start: 50, stake: 1.618, quote: async ({ mint }) => (mint === "F" ? { ok: true, costSide: 0.05, costRt: 0.10 } : { ok: true, costSide: 0.1, costRt: 0.2 }) });
await f.scanLane(now0);
ok("10% round trip taken (fake money, learn), 20% skipped", f.open.has("F") && !f.open.has("I") && f.summary().costSkips === 1, f.summary());
ok("the ledger charges the measured fee", Math.abs(f.summary().fees - 1.618 * 0.05) < 1e-4, f.summary());

const imp = new Scalp({ src, start: 50, stake: 1.618, quote: async () => ({ ok: false, why: "price impact 3.06% over the 2.36% cap", costSide: 0.03 }) });
await imp.scanLane(now0);
ok("hunt takes a coin the careful lanes refuse for price impact, at its measured cost", imp.open.size === 2 && [...imp.open.values()].every((p) => p.side === 0.03), imp.summary());

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
