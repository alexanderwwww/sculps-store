// The fast lane in hunt mode (build 25), driven with a fake GMGN: chart entries
// (Fibonacci pocket or ignition candle), +40% / -15% / give-back / 2-minute exits,
// real fees charged, learning that is allowed to lose first.
import { Scalp, fibSetup, ignition, rugOk, shapeOf, liteShape } from "../src/trader/scalp.mjs";
import { DEFAULTS } from "../src/trader/scalp.mjs";
import { rulesKey, realNet, TIERS } from "../src/trader/exits.mjs";
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
// build 38: symbiot filters losing combinations, keeps exploring, never blocks on one trait
{
  const fsrc2 = { ...src, candles: async () => [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }] };
  const A = new Scalp({ src: fsrc2, start: 0, stake: 1.618, quote });
  const combo = liteShape(rows[0], now0).concat("e:any").join("|");
  A.combos[combo] = { n: 20, w: 1, pnl: -10 };
  A.rand = () => 0.9;                                   // not an exploring roll
  await A.scanLane(now0);
  ok("a combination that lost 19 of 20 is filtered", A.open.size === 0 && A.skips === 3 && A.summary().filtered === 1, A.summary());
  const B2 = new Scalp({ src: fsrc2, start: 0, stake: 1.618, quote });
  B2.combos[combo] = { n: 20, w: 1, pnl: -10 };
  B2.rand = () => 0.05;                                 // an exploring roll (under 12.5%)
  await B2.scanLane(now0);
  ok("1 in 8 still goes through, to re-test the lesson", B2.open.size === 3);
  const C2 = new Scalp({ src: fsrc2, start: 0, stake: 1.618, quote });
  C2.learn["h1"] = { n: 99, w: 0, pnl: -50, until: 9999 }; C2.rand = () => 0.9;
  await C2.scanLane(now0);
  ok("one losing trait alone never blocks symbiot", C2.open.size === 3);
}
{
  const D = new Scalp({ src: { ...src, candles: async () => [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }] }, start: 0, stake: 1.618, quote });
  D.configure({ maxTrades: 2 });
  await D.scanLane(now0);
  ok("stops buying at maxTrades (5000 on the Mac)", D.open.size === 2, D.summary());
}

// ---- build 41: the abort rule, the entry tag, the ledger fix and the ghost proof ----
const pxSrc = (px, calls = null) => ({ trending: async () => [], candles: async (a, r, limit) => { if (calls) calls.push(a); return [{ t: 1, o: 1, h: 1, l: 1, c: px[a], v: 1 }]; } });
const hunt = (a, extra = {}) => ({ addr: a, symbol: a, cost: 1.618, side: 0.01, units: 1.618 * 0.99, entry: 1, last: 1, at: now0, shape: ["s1", "s2"], combo: "k", hunt: true, peak: 0, ...extra });
{
  const px = { A: 0.9, B: 1.0 }, lg = [];
  const X = new Scalp({ src: pxSrc(px), log: (e) => lg.push(e), start: 0, stake: 1.618, quote });
  X.open.set("A", hunt("A")); X.open.set("B", hunt("B"));
  await X.positionLane(now0 + 5000);                       // A: -10% in 5 s
  await X.positionLane(now0 + 31_000);                     // B: flat 30 s
  const cl = lg.filter((e) => e.type === "close"), tA = X.trades.find((t) => t.symbol === "A"), tB = X.trades.find((t) => t.symbol === "B");
  ok("abort: down 10% in 5 s closes as 'stop: crash -10% in 5 s'", tA && tA.why === "stop: crash -10% in 5 s" && !tA.won, X.trades);
  ok("abort: flat for 30 s closes as 'dead: flat 30 s'", tB && tB.why === "dead: flat 30 s" && !tB.won, X.trades);
  ok("abort closes count in combos like any close", X.combos.k && X.combos.k.n === 2 && X.combos.k.w === 0, X.combos);
  ok("abort closes are shadowed for the post-mortem and cooled", X.shadow.has("A") && X.shadow.has("B") && X.cool.get("A") > now0 + 5000 && X.cool.get("B") > now0 + 31_000);
  ok("abort closes feed learn, per part of the shape", X.learn.s1.n === 2 && X.learn.s2.n === 2, X.learn);
  ok("abort closes log 'close' with why and balance", cl.length === 2 && cl.every((e) => e.why && typeof e.balance === "number" && e.lane === "fast"), cl);
  ok("held is the age the exit was seen at; the trade carries its exit rules", tA.held === 5000 && tB.held === 31_000 && X.trades.every((t) => t.rules === rulesKey(X.cfg)), X.trades);
}
{
  const px = { CP: 0.9, CF: 0.9, DP: 1.0, DF: 1.005 };
  const M = new Scalp({ src: pxSrc(px), start: 0, stake: 1.618, quote });
  M.configure({ shadowMs: 200_000 });
  for (const a of Object.keys(px)) M.open.set(a, hunt(a));
  await M.positionLane(now0 + 5000);                       // CP, CF crash
  await M.positionLane(now0 + 31_000);                     // DP, DF dead
  px.CP = 1.25; px.CF = 0.8; px.DP = 1.25;
  await M.positionLane(now0 + 40_000);
  await M.positionLane(now0 + 400_000);                    // shadows done
  const tag = (a) => M.trades.find((t) => t.symbol === a)?.mistake;
  ok("post-mortem: crash, then the coin pumped -> stop-then-pump", tag("CP") === "stop-then-pump", M.trades);
  ok("post-mortem: crash, and it kept falling -> cut-right", tag("CF") === "cut-right");
  ok("post-mortem: dead, then +20% -> sold-too-early", tag("DP") === "sold-too-early");
  ok("post-mortem: dead and flat -> fee-ate-it", tag("DF") === "fee-ate-it", M.trades.find((t) => t.symbol === "DF"));
}
{
  const calls = [], px = { OLD: 1, MID: 1, NEW: 0.84, SH: 1 };
  const O = new Scalp({ src: pxSrc(px, calls), start: 0, stake: 1.618, quote });
  O.open.set("MID", hunt("MID", { at: now0 + 1000 })); O.open.set("OLD", hunt("OLD")); O.open.set("NEW", hunt("NEW", { at: now0 + 2000 }));
  O.shadow.set("SH", { trade: { symbol: "SH", why: "+40%", won: true, ret: 0.3 }, exit: 1, exitAt: now0 - 1000, entry: 1, peak: 0, shape: [], after: { max: 1, min: 1 } });
  await O.positionLane(now0 + 3000);
  ok("repricing is youngest first, and the post-mortem reads come after every exit", calls.join() === "NEW,MID,OLD,SH", calls);
  ok("a coin closed this tick is not read again this tick (same GMGN calls as build 40)", calls.length === 4 && O.shadow.has("NEW") && !O.open.has("NEW"), calls);
}
{
  const Cf = new Scalp({ src, start: 0, stake: 1.618, quote });
  ok("abort defaults: down 8% in 20 s, flat 2% after 30 s, entries tagged", DEFAULTS.crashMs === 20_000 && DEFAULTS.crashMove === -0.08 && DEFAULTS.deadMs === 30_000 && DEFAULTS.deadMove === 0.02 && DEFAULTS.tagEntry === true, DEFAULTS);
  Cf.configure({ crashMs: 13_000, crashMove: -0.05, deadMs: 21_000, deadMove: 0.03 });
  ok("symbiot.json can tune crashMs, crashMove, deadMs and deadMove live", Cf.cfg.crashMs === 13_000 && Cf.cfg.crashMove === -0.05 && Cf.cfg.deadMs === 21_000 && Cf.cfg.deadMove === 0.03, Cf.cfg);
  Cf.configure({ crashMs: "0", crashMove: "x", deadMs: null, deadMove: NaN, tagEntry: "no" });
  ok("strings, null and NaN are refused", Cf.cfg.crashMs === 13_000 && Cf.cfg.crashMove === -0.05 && Cf.cfg.deadMs === 21_000 && Cf.cfg.deadMove === 0.03 && Cf.cfg.tagEntry === true, Cf.cfg);
  const px = { A: 0.9, B: 1.0 };
  const Off = new Scalp({ src: pxSrc(px), start: 0, stake: 1.618, quote });
  Off.configure({ crashMs: 0, deadMs: 0 });
  Off.open.set("A", hunt("A")); Off.open.set("B", hunt("B"));
  await Off.positionLane(now0 + 5000); await Off.positionLane(now0 + 31_000);
  ok("0 switches the abort rules off from R2: no crash, no dead close", Off.open.size === 2 && Off.trades.length === 0, Off.trades);
}
{
  const old = { v: 2, plan: "symbiot29", start: 0, stake: 1.618, cash: -1.618, learn: { s1: { n: 1, w: 1, pnl: 0.3, until: 0 } }, mistakes: { good: { n: 1, ret: 0.3 } }, combos: { k: { n: 1, w: 1, pnl: 0.5 } },
    open: [{ addr: "OLD1", symbol: "OLD1", cost: 1.618, side: 0.01, units: 1.6, entry: 1, last: 1, at: now0, shape: ["s1"], combo: "k", hunt: true, peak: 0, peakAll: 0 }],
    trades: [{ symbol: "T1", addr: "T1", pnl: 0.5, ret: 0.3, won: true, why: "+40%", held: 9000 }] };
  const px = { OLD1: 1.5 };
  const O2 = Scalp.from(JSON.parse(JSON.stringify(old)), { src: pxSrc(px), start: 0, stake: 1.618, quote });
  ok("PLAN is still symbiot29: build 41 wipes no ledger", O2.toJSON().plan === "symbiot29");
  ok("a build-40 fast.json loads: open, trades, combos, learn, mistakes", O2.open.has("OLD1") && O2.trades.length === 1 && O2.combos.k.n === 1 && O2.learn.s1.n === 1 && O2.mistakes.good.n === 1 && O2.done.has("T1"), O2.summary());
  await O2.positionLane(now0 + 1000);
  ok("its open position closes under the new exits and is scored in the proof", O2.combos.k.n === 2 && O2.proof[rulesKey(O2.cfg)].keys.k[0.21].n === 1, O2.proof);
}
{
  const px = { P: 1.45 };
  const W = new Scalp({ src: pxSrc(px), start: 0, stake: 1.618, quote });
  W.open.set("P", hunt("P"));
  await W.positionLane(now0 + 1000);
  W.learn.s9 = { n: 3, w: 1, pnl: 0.1, until: 0 }; W.mistakes.good = { n: 2, ret: 0.4 };
  W.configure({ stake: 3 });
  const j = JSON.parse(JSON.stringify(W.toJSON()));
  ok("toJSON keeps the stake the ledger was made with next to the live one", j.stake === 3 && j.baseStake === 1.618, j);
  const W2 = Scalp.from(j, { src, start: 0, stake: 1.618 });
  ok("a stake set in symbiot.json never wipes combos, learn, mistakes or proof on restart", W2.combos.k.n === 1 && W2.learn.s9.n === 3 && W2.mistakes.good.n === 2 && W2.proof[rulesKey(W2.cfg)].keys.k[0.13].n === 1 && W2.trades.length === 1, W2.summary());
  ok("a different start or build stake still starts fresh", Scalp.from(j, { src, start: 50, stake: 1.618 }).trades.length === 0 && Object.keys(Scalp.from(j, { src, start: 0, stake: 2 }).combos).length === 0 && Object.keys(Scalp.from(j, { src, start: 0, stake: 2 }).proof).length === 0);
  const pre = { ...j }; delete pre.baseStake; pre.stake = 1.618;
  ok("a ledger from before build 41 (no baseStake) still loads on its stake", Scalp.from(pre, { src, start: 0, stake: 1.618 }).combos.k.n === 1);
}
{
  const calls = [];
  const tsrc = { trending: async () => rows, candles: async (a, r, limit) => { calls.push(limit); return limit <= 2 ? [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }] : charts[a] || flat(); } };
  const T1 = new Scalp({ src: tsrc, start: 0, stake: 1.618, quote });
  await T1.scanLane(now0);
  const key = (i, e) => liteShape(rows[i], now0).concat(e).join("|");
  ok("tagEntry: one candles call per coin, asking for 34 instead of 2", calls.length === 3 && calls.every((l) => l === 34), calls);
  ok("tagEntry: the Fibonacci chart is filed e:fib, the ignition e:ign, the flat one e:any", T1.open.get("F")?.combo === key(0, "e:fib") && T1.open.get("I")?.combo === key(1, "e:ign") && T1.open.get("Z")?.combo === key(2, "e:any"), [...T1.open.values()].map((p) => p.combo));
  ok("tagEntry keeps symbiot's chart-free key (liteShape), never the chart shape", T1.open.get("F").shape.slice(0, 4).join() === liteShape(rows[0], now0).join(), T1.open.get("F").shape);
  ok("tagEntry: the entry is the live close, the last candle", T1.open.get("F").entry === 1.12 && T1.open.get("Z").entry === 1);
  calls.length = 0;
  const T0 = new Scalp({ src: tsrc, start: 0, stake: 1.618, quote });
  T0.configure({ tagEntry: false });
  await T0.scanLane(now0);
  ok("tagEntry off: two candles and e:any, exactly build 40", calls.length === 3 && calls.every((l) => l === 2) && [...T0.open.values()].every((p) => p.combo.endsWith("|e:any")), calls);
}
{
  const psrc = { trending: async () => rows, candles: async (a, r, limit) => (limit <= 2 ? [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }] : charts[a] || flat()) };
  const got = [];
  const P = new Scalp({ src: psrc, start: 0, stake: 1.618, quote, onPick: (x) => got.push(x) });
  P.configure({ maxOpen: 1 });
  P.open.set("FULL", hunt("FULL"));
  await P.scanLane(now0);
  ok("onPick: a full sim still scans when real listens, and buys nothing", got.length === 3 && P.open.size === 1, got.length);
  const F = got.find((x) => x.row.a === "F");
  ok("onPick carries the row, the 34 candles, shape, combo, fib and the time", F && F.cs.length === fibChart().length && F.fib && F.fib.retr > 0 && F.nowMs === now0 && Array.isArray(F.shape), F);
  ok("onPick's combo is exactly the key symbiot files the coin under", F.combo === liteShape(rows[0], now0).concat("e:fib").join("|") && F.shape.join("|") === F.combo);
  got.length = 0;
  const P2 = new Scalp({ src: psrc, start: 0, stake: 1.618, quote, onPick: (x) => got.push(x) });
  P2.configure({ maxTrades: 1 }); P2.trades.push({ symbol: "x" });
  const r2 = await P2.scanLane(now0);
  ok("onPick: past maxTrades the scan still feeds real, buys nothing, says done", got.length === 3 && P2.open.size === 0 && r2.done === true, r2);
  got.length = 0;
  const P3 = new Scalp({ src: { ...psrc, candles: async () => [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }] }, start: 0, stake: 1.618, quote, onPick: (x) => got.push(x) });
  P3.combos[liteShape(rows[0], now0).concat("e:any").join("|")] = { n: 20, w: 1, pnl: -10 }; P3.rand = () => 0.9;
  await P3.scanLane(now0);
  ok("onPick fires before the filter: a filtered combination still reaches real", got.length === 3 && P3.open.size === 0 && P3.skips === 3, P3.summary());
  let n = 0;
  const Q = new Scalp({ src: psrc, start: 0, stake: 1.618, quote });
  Q.configure({ maxOpen: 1 }); Q.open.set("FULL", hunt("FULL"));
  const qsrc = Q.src; Q.src = { trending: async (...a) => { n++; return qsrc.trending(...a); }, candles: async (...a) => { n++; return qsrc.candles(...a); } };
  await Q.scanLane(now0);
  ok("no listener: a full sim makes no GMGN call, as before", n === 0);
  const E1 = new Scalp({ src: psrc, start: 0, stake: 1.618, quote, onPick: () => { throw new Error("real broke"); } });
  const E2 = new Scalp({ src: psrc, start: 0, stake: 1.618, quote, onPick: async () => { throw new Error("real broke later"); } });
  await E1.scanLane(now0); await E2.scanLane(now0); await new Promise((r) => setTimeout(r, 20));
  ok("a real-side error (thrown or rejected) never stops the sim", E1.open.size === 3 && E2.open.size === 3);
}
// the ghost proof: what each real target would have done, scored at the real stake
{
  const px = { W: 1.45, S: 0.84, R: 1.25 };
  const G = new Scalp({ src: pxSrc(px), start: 0, stake: 1.618, quote });
  ok("the proof is scored at step 1's real stake by default (38.2% of $15)", G.realStakeUsd === 5.73);
  const W = hunt("W", { combo: "kw", side: 0.0125 }), S = hunt("S", { combo: "ks", side: 0.0125 }), R = hunt("R", { combo: "kr", side: 0.0125 });
  for (const p of [W, S, R]) G.open.set(p.addr, p);
  await G.positionLane(now0 + 1000);                       // W +45%, S -16%, R peaks at +25%
  px.R = 1.12;
  await G.positionLane(now0 + 2000);                       // R back to +12%
  const rk0 = rulesKey(G.cfg), B = G.proof[rk0];
  ok("ghost: +45% at once is a win at all three targets", TIERS.every((T) => W.ghost[T].why === `+${Math.round(T * 100)}%` && B.keys.kw[T].n === 1 && B.keys.kw[T].w === 1 && B.keys.kw[T].net === +realNet(0.45, 0.0125, 5.73).toFixed(4)), B.keys.kw);
  ok("ghost: -16% is a stop loss at all three targets", TIERS.every((T) => S.ghost[T].why === "stop -15%" && B.keys.ks[T].n === 1 && B.keys.ks[T].w === 0 && B.keys.ks[T].net < 0), B.keys.ks);
  ok("ghost: +25% back to +12% takes +13% and +21%, gives back at +34%", R.ghost[0.13].why === "+13%" && R.ghost[0.21].why === "+21%" && R.ghost[0.34].why === "gave back half of +25%" && B.keys.kr[0.13].net === +realNet(0.25, 0.0125, 5.73).toFixed(4) && B.keys.kr[0.34].net === +realNet(0.12, 0.0125, 5.73).toFixed(4), R.ghost);
  const closeAt = (p) => { const t = G.trades.find((x) => x.symbol === p.symbol); return now0 + t.held; };
  ok("every target resolves at or before the sim's own close", [W, S, R].every((p) => TIERS.every((T) => p.ghost[T].at <= closeAt(p))) && R.ghost[0.13].at < closeAt(R), [W, S, R].map((p) => p.ghost));
  ok("the bucket carries its exit rules (the real gate checks sl -0.15)", B.rules.sl === -0.15 && B.rules.crashMs === 20_000 && B.rules.deadMove === 0.02 && B.rules.holdMs === 120_000, B.rules);
  const calls = [];
  const G9 = new Scalp({ src: pxSrc({ a: 1, b: 1 }, calls), start: 0, stake: 1.618, quote });
  G9.open.set("a", hunt("a")); G9.open.set("b", hunt("b"));
  await G9.positionLane(now0 + 1000);
  ok("the ghost proof costs zero extra GMGN calls", calls.length === 2 && G9.open.get("a").ghost, calls);

  // rules change: a new bucket, the old one kept as proofPrev; a coin open across it is never filed
  const MX = hunt("MX", { combo: "kmx", at: now0 + 2500 }); px.MX = 1.0;
  G.open.set("MX", MX);
  await G.positionLane(now0 + 3000);                       // MX scored under rk0, nothing resolved
  G.configure({ crashMs: 13_000 });
  const rk1 = rulesKey(G.cfg);
  const N = hunt("N", { combo: "kn", at: now0 + 3500 }); px.N = 1.45; px.MX = 1.45;
  G.open.set("N", N);
  await G.positionLane(now0 + 4000);
  ok("a rules change opens a new bucket and keeps the old one as proofPrev", rk1 !== rk0 && G.proof[rk1]?.keys.kn?.[0.13].n === 1 && !G.proof[rk0] && G.proofPrev?.[rk0]?.keys.kw[0.13].n === 1, { proof: Object.keys(G.proof), prev: G.proofPrev && Object.keys(G.proofPrev) });
  ok("the new bucket carries the new rules", G.proof[rk1].rules.crashMs === 13_000);
  ok("a coin open across the change is never filed (rules never mix)", G.trades.some((t) => t.symbol === "MX") && ![G.proof, G.proofPrev].some((P) => Object.values(P).some((b) => b.keys.kmx)), MX.ghost);
  const back = Scalp.from(JSON.parse(JSON.stringify(G.toJSON())), { src: pxSrc(px), start: 0, stake: 1.618, quote });
  ok("proof and proofPrev survive toJSON/from", JSON.stringify(back.proof) === JSON.stringify(G.proof) && JSON.stringify(back.proofPrev) === JSON.stringify(G.proofPrev) && back.proofPrev[rk0].keys.kr[0.34].n === 1);
  G.configure({ crashMs: 20_000 });
  const N2 = hunt("N2", { combo: "kn2", at: now0 + 4500 }); px.N2 = 1.45;
  G.open.set("N2", N2);
  await G.positionLane(now0 + 5000);
  ok("changing the rules back brings the old bucket back", G.proof[rk0]?.keys.kn2 && G.proof[rk0].keys.kw[0.13].n === 1 && G.proofPrev?.[rk1]?.keys.kn, { proof: Object.keys(G.proof), prev: G.proofPrev && Object.keys(G.proofPrev) });
}
{
  // a half-scored ghost on an open position survives a restart and is filed once
  const px = { Q: 1.25 };
  const H = new Scalp({ src: pxSrc(px), start: 0, stake: 1.618, quote });
  H.open.set("Q", hunt("Q", { combo: "kq" }));
  await H.positionLane(now0 + 1000);
  const H2 = Scalp.from(JSON.parse(JSON.stringify(H.toJSON())), { src: pxSrc(px), start: 0, stake: 1.618, quote });
  px.Q = 1.12;
  await H2.positionLane(now0 + 2000);
  const K = H2.proof[rulesKey(H2.cfg)].keys.kq;
  ok("a ghost half-scored before a restart is finished and filed once after it", K[0.13].n === 1 && K[0.13].o[0] === +realNet(0.25, 0.01, 5.73).toFixed(4) && K[0.34].n === 1 && K[0.34].o[0] === +realNet(0.12, 0.01, 5.73).toFixed(4), K);
  // tp lowered under a target: that target's outcome is unknown and never counted
  const L3 = new Scalp({ src: pxSrc({ U: 1.25 }), start: 0, stake: 1.618, quote });
  L3.configure({ tp: 0.2 });
  L3.open.set("U", hunt("U", { combo: "ku" }));
  await L3.positionLane(now0 + 1000);
  const KU = L3.proof[rulesKey(L3.cfg)].keys.ku;
  ok("with tp lowered under a target, that target is not scored (a guess is never proof)", L3.trades[0]?.why === "+20%" && KU[0.13].n === 1 && KU[0.21].n === 1 && !KU[0.34], KU);
  // the real side sets the stake; the window keeps the last 55
  const px2 = {};
  const Z = new Scalp({ src: pxSrc(px2), start: 0, stake: 1.618, quote });
  Z.realStakeUsd = 7.09;
  for (let i = 0; i < 60; i++) { px2["z" + i] = 0.84; Z.open.set("z" + i, hunt("z" + i, { combo: "kz" })); }
  await Z.positionLane(now0 + 1000);
  const KZ = Z.proof[rulesKey(Z.cfg)].keys.kz[0.21];
  ok("each key keeps a rolling window of its last 55 outcomes", KZ.n === 55 && KZ.o.length === 55 && KZ.w === 0 && Math.abs(KZ.net - 55 * realNet(-0.16, 0.01, 7.09)) < 0.01 && KZ.last === now0 + 1000, KZ);
  ok("net is scored at the stake the real side set, and rt is the round-trip fee it assumed", KZ.o[0] === +realNet(-0.16, 0.01, 7.09).toFixed(4) && KZ.rt === 0.02, KZ);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
