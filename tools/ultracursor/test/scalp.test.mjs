// The fast lane, driven with a fake GMGN: buys on momentum, sells at +13%, -8% and 3 minutes.
import { Scalp, fibSetup, rugOk, shapeOf } from "../src/trader/scalp.mjs";
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, x ?? ""); } };
const now0 = 1_800_000_000_000, sec = Math.floor(now0 / 1000);
// A Fibonacci chart: flat at 1, a 30% run to 1.30, a pullback into the golden pocket (~0.6), last candle green.
const rising = (base) => {
  const path = [...Array(10).fill(1), 1.03, 1.06, 1.1, 1.14, 1.18, 1.22, 1.26, 1.3, 1.25, 1.2, 1.16, 1.13, 1.11, 1.12].map((x) => x * base);
  return path.map((c, i) => ({ t: i, o: i === path.length - 1 ? 1.11 * base : c, h: c, l: i === path.length - 1 ? 1.11 * base : c, c, v: 100 }));
};
const flat = (base) => Array.from({ length: 30 }, (_, i) => ({ t: i, o: base, h: base, l: base, c: base, v: 100 }));
const prices = { A: 1, B: 1, C: 1, D: 1 };
const rows = ["A", "B", "C", "D"].map((a) => ({ a, s: a + "COIN", ct: sec - 3600, lq: 50_000, t10: 0.1 }));
rows.push({ a: "RUG", s: "RUG", ct: sec - 60, lq: 50_000, t10: 0.1 });
const src = {
  trending: async () => rows,
  candles: async (a, r, limit) => (limit <= 2 ? [{ t: 1, o: 1, h: 1, l: 1, c: prices[a], v: 1 }] : a === "D" ? flat(1) : rising(1)),
};
const log = [];
const s = new Scalp({ src, log: (e) => log.push(e), quote: async () => ({ ok: true, costSide: 0.01, costRt: 0.006 }) });
ok("fib: a pullback into the golden pocket after a 30% run -> buy; flat -> no", fibSetup(rising(1)) && fibSetup(rising(1)).retr >= 0.5 && fibSetup(rising(1)).retr <= 0.705 && !fibSetup(flat(1)), fibSetup(rising(1)));
const broke = rising(1); broke[20] = { ...broke[20], l: 1.0 };
ok("fib: a pullback that broke 0.786 is not bought", !fibSetup(broke));
ok("rug check refuses a 1-minute-old coin", !rugOk(rows[4], sec) && rugOk(rows[0], sec));
await s.scanLane(now0);
ok("buys every rising coin (max 5 open), never the flat coin or the rug", s.open.size === 3 && !s.open.has("D") && !s.open.has("RUG"), [...s.open.keys()]);
ok("never more than 61.8% of equity in play", s.inPlay() <= 10 * 0.618 + 1e-9, s.inPlay());
// A pumps +15%, B dumps -10%, C goes nowhere
prices.A = 1.30; prices.B = 1.0; prices.C = 1.12;
await s.positionLane(now0 + 10_000);
ok("A sold back at the swing high, B cut under 0.786, C still open", s.trades.length === 2 && s.trades.find((t) => t.symbol === "ACOIN").won && !s.trades.find((t) => t.symbol === "BCOIN").won && s.open.has("C"), s.trades);
await s.positionLane(now0 + 13 * 60_000 + 1);
ok("C sold by the 13-minute time stop", s.trades.length === 3 && s.open.size === 0 && s.trades[2].why === "13 min time stop");
const sum = s.summary();
ok("summary adds up (cash = equity when flat)", sum.trades === 3 && sum.wins === 1 && Math.abs(sum.balance - s.cash) < 1e-4, sum);
await s.scanLane(now0 + 13 * 60_000 + 2);
ok("a coin just sold waits 5 minutes before it is bought again (C), older ones may return", !s.open.has("C") && s.open.has("A"), [...s.open.keys()]);
const back = Scalp.from(JSON.parse(JSON.stringify(s.toJSON())), { src });
ok("state survives a restart", back.summary().trades === 3 && Math.abs(back.cash - s.cash) < 1e-9);
ok("every buy and sell is journaled", log.filter((e) => e.type === "entry").length >= 3 && log.filter((e) => e.type === "entry").every((e) => /golden pocket/.test(e.why)) && log.filter((e) => e.type === "close").length === 3);
const st = new Scalp({ src, start: 50, stake: 1.618, quote: async () => ({ ok: true, costSide: 0.01, costRt: 0.006 }) });
await st.scanLane(now0);
ok("50 SOL balance, 1.618 SOL every trade", st.open.size === 3 && [...st.open.values()].every((p) => Math.abs(p.cost - 1.618) < 1e-9) && Math.abs(st.cash - (50 - 3 * 1.618)) < 1e-9, st.cash);
ok("a ledger from another plan is not reused", Scalp.from(s.toJSON(), { src, start: 50, stake: 1.618 }).cash === 50);
// learning: five losers of the same shape, then that shape is refused
const L = new Scalp({ src, start: 50, stake: 1.618, quote: async () => ({ ok: true, costSide: 0.01, costRt: 0.006 }) });
const shape = shapeOf(rising(1), rows[0], now0);
for (let i = 0; i < 5; i++) { prices["X" + i] = 0.85;
  L.open.set("X" + i, { addr: "X" + i, symbol: "X", cost: 1.618, units: 1.618, entry: 1, last: 0.85, at: now0, shape });
}
await L.positionLane(now0 + 1000);
ok("five losses of one shape become a lesson", L.summary().lessons >= 1 && L.badPart(shape) !== null, L.learn);
src.candles = async (a, r, limit) => (limit <= 2 ? [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }] : a === "D" ? flat(1) : rising(1));
await L.scanLane(now0 + 2000);
ok("the lesson stops the same setup being bought again", L.open.size === 0 && L.skips > 0, L.summary());
ok("lessons survive a restart", Scalp.from(JSON.parse(JSON.stringify(L.toJSON())), { src, start: 50, stake: 1.618 }).badPart(shape) !== null);
ok("stake never changes after losses (no emotion)", L.stake === 1.618);
const cheap = new Scalp({ src, start: 50, stake: 1.618, quote: async ({ mint }) => (mint === "A" ? { ok: true, costSide: 0.001, costRt: 0.002 } : { ok: true, costSide: 0.01, costRt: 0.02 }) });
src.candles = async (a, r, limit) => (limit <= 2 ? [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }] : a === "D" ? flat(1) : rising(1));
await cheap.scanLane(now0 + 999_000);
ok("only the coin with a cheap measured round trip is bought", cheap.open.size === 1 && cheap.open.has("A") && cheap.summary().costSkips === 3, cheap.summary());
ok("the ledger charges the measured fee, not a guess", Math.abs(cheap.summary().fees - 1.618 * 0.001) < 1e-5, cheap.summary());
ok("a ledger from before the Fibonacci plan starts fresh (new data)", Scalp.from({ v: 2, start: 50, stake: 1.618, cash: 49.25, trades: [{}], learn: { x: { n: 9, w: 0, pnl: -1, until: 99 } } }, { src, start: 50, stake: 1.618 }).summary().trades === 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
