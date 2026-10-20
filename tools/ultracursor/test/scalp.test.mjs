// The fast lane, driven with a fake GMGN: buys on momentum, sells at +13%, -8% and 3 minutes.
import { Scalp, momentum, rugOk, shapeOf } from "../src/trader/scalp.mjs";
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, x ?? ""); } };
const now0 = 1_800_000_000_000, sec = Math.floor(now0 / 1000);
const rising = (base) => Array.from({ length: 30 }, (_, i) => ({ t: i, o: base, h: base, l: base, c: i < 27 ? base : base * (1 + 0.02 * (i - 26)), v: i === 29 ? 900 : 100 }));
const flat = (base) => Array.from({ length: 30 }, (_, i) => ({ t: i, o: base, h: base, l: base, c: base, v: 100 }));
const prices = { A: 1, B: 1, C: 1, D: 1 };
const rows = ["A", "B", "C", "D"].map((a) => ({ a, s: a + "COIN", ct: sec - 3600, lq: 50_000, t10: 0.1 }));
rows.push({ a: "RUG", s: "RUG", ct: sec - 60, lq: 50_000, t10: 0.1 });
const src = {
  trending: async () => rows,
  candles: async (a, r, limit) => (limit <= 2 ? [{ t: 1, o: 1, h: 1, l: 1, c: prices[a], v: 1 }] : a === "D" ? flat(1) : rising(1)),
};
const log = [];
const s = new Scalp({ src, log: (e) => log.push(e) });
ok("momentum: rising closes + volume -> yes; flat -> no", momentum(rising(1)) && !momentum(flat(1)));
ok("rug check refuses a 1-minute-old coin", !rugOk(rows[4], sec) && rugOk(rows[0], sec));
await s.scanLane(now0);
ok("buys up to 3 at once, never the flat coin or the rug", s.open.size === 3 && !s.open.has("D") && !s.open.has("RUG"), [...s.open.keys()]);
ok("never more than 61.8% of equity in play", s.inPlay() <= 10 * 0.618 + 1e-9, s.inPlay());
// A pumps +15%, B dumps -10%, C goes nowhere
prices.A = rising(1)[29].c * 1.15; prices.B = rising(1)[29].c * 0.9; prices.C = rising(1)[29].c;
await s.positionLane(now0 + 10_000);
ok("A sold at take profit, B cut at the stop, C still open", s.trades.length === 2 && s.trades.find((t) => t.symbol === "ACOIN").won && !s.trades.find((t) => t.symbol === "BCOIN").won && s.open.has("C"), s.trades);
await s.positionLane(now0 + 3 * 60_000 + 1);
ok("C sold by the 3-minute time stop", s.trades.length === 3 && s.open.size === 0 && s.trades[2].why === "3 min time stop");
const sum = s.summary();
ok("summary adds up (cash = equity when flat)", sum.trades === 3 && sum.wins === 1 && Math.abs(sum.balance - s.cash) < 1e-4, sum);
await s.scanLane(now0 + 3 * 60_000 + 2);
ok("a coin just sold waits 5 minutes before it is bought again", s.open.size === 0, [...s.open.keys()]);
const back = Scalp.from(JSON.parse(JSON.stringify(s.toJSON())), { src });
ok("state survives a restart", back.summary().trades === 3 && Math.abs(back.cash - s.cash) < 1e-9);
ok("every buy and sell is journaled", log.filter((e) => e.type === "entry").length === 3 && log.filter((e) => e.type === "close").length === 3);
const st = new Scalp({ src, start: 50, stake: 1.618 });
await st.scanLane(now0);
ok("50 SOL balance, 1.618 SOL every trade", st.open.size === 3 && [...st.open.values()].every((p) => Math.abs(p.cost - 1.618) < 1e-9) && Math.abs(st.cash - (50 - 3 * 1.618)) < 1e-9, st.cash);
ok("a ledger from another plan is not reused", Scalp.from(s.toJSON(), { src, start: 50, stake: 1.618 }).cash === 50);
// learning: five losers of the same shape, then that shape is refused
const L = new Scalp({ src, start: 50, stake: 1.618 });
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
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
