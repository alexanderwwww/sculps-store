/*
 * Paper trader tests: the math, the book driven candle by candle, the gate on
 * recorded GMGN responses, and a replay of recorded GMGN candles through the
 * real Scanner loop (Scanner -> gate -> findSwing -> Book) end to end.
 *
 *   node test/trader.test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLAN, levels, movesFromEntry, findSwing, nextFraction, ev, breakEven, dayStop, daysProjection, sizeEntry } from "../src/trader/fib.mjs";
import { Book } from "../src/trader/book.mjs";
import { gate, prefilter, devSold, volumeRising } from "../src/trader/gate.mjs";
import { Scanner } from "../src/trader/scan.mjs";
import { allowed } from "../src/trader/gmgn.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const ok = (name, cond, info = "") => { if (cond) passed++; else failed++; console.log(`${cond ? "  ok" : "FAIL"}  ${name}${cond ? "" : "  " + info}`); };
const near = (name, got, want, tol = 1e-6) => ok(name, Math.abs(got - want) <= tol, `got ${got}, want ${want}`);
const MIN = 60_000;

// ---------- levels ----------
const lv = levels(100, 200);
near("entry = 0.618 retracement", lv.entry, 200 - 61.8);
near("0.786 retracement", lv.r786, 200 - 78.6);
near("stop 1% under 0.786", lv.stop, (200 - 78.6) * 0.99);
near("TP1 = swing high", lv.tps[0], 200);
near("TP2 = 1.272 ext", lv.tps[1], 227.2);
near("TP3 = 1.618 ext", lv.tps[2], 261.8);
const mv = movesFromEntry(lv);
near("2x impulse: TP1 about +45%", mv.tps[0], 0.447, 0.002);
near("2x impulse: TP2 about +64%", mv.tps[1], 0.644, 0.002);
near("2x impulse: TP3 about +89%", mv.tps[2], 0.894, 0.002);
near("2x impulse: 0.786 is -12.1%, stop 1% under it -13.0%", mv.stop, -0.1303, 0.001);
let threw = false; try { levels(5, 5); } catch { threw = true; }
ok("flat swing throws", threw);

// ---------- sizing ----------
near("win x1.618", nextFraction(0.236, true), 0.381848);
near("win capped 0.382", nextFraction(0.382, true), 0.382);
near("loss /1.618 (0.1459 -> floor 0.146)", nextFraction(0.236, false), 0.146);
near("loss /1.618", nextFraction(0.3, false), 0.3 / 1.618);
near("loss floored 0.146", nextFraction(0.146, false), 0.146);
near("win then loss returns", nextFraction(nextFraction(0.2, true), false), 0.2, 1e-9);

// ---------- exposure cap (Alex 2026-10-19: 3 open, total <= 61.8%) ----------
ok("plan max 3 open", PLAN.maxOpen === 3);
let sz = sizeEntry({ f: 0.236, equity: 10, cash: 10, openNotional: 0 });
near("free room: full f", sz.notional, 2.36); ok("not capped", sz.ok && !sz.capped);
sz = sizeEntry({ f: 0.382, equity: 10, cash: 10, openNotional: 4.0 });
near("sized down to fit 61.8% of equity after its own 3% cost", sz.notional, (6.18 - 4) / (1 + 0.618 * 0.03)); ok("capped flag", sz.ok && sz.capped);
sz = sizeEntry({ f: 0.236, equity: 10, cash: 10, openNotional: 5.0 });
ok("skip when fit < 14.6% floor", !sz.ok && /floor/.test(sz.reason), sz.reason);
sz = sizeEntry({ f: 0.236, equity: 10, cash: 10, openNotional: 6.18 });
ok("skip at the cap", !sz.ok);

// ---------- EV and day rules ----------
near("break-even with +45%/-12% and 6% costs = 31.6%", breakEven(0.45 - 0.06, 0.12 + 0.06), 0.3158, 1e-4);
near("ev at break-even = 0", ev(breakEven(0.39, 0.18), 0.39, 0.18), 0, 1e-12);
ok("ev positive at 40%", ev(0.4, 0.39, 0.18) > 0);
ok("day target at +61.8%", dayStop(10, 16.18) === "target");
ok("day stop at -38.2%", dayStop(10, 6.18) === "stop");
ok("no stop in between", dayStop(10, 12) === null);
near("1.618 x 0.618 ~ 1", 1.618 * 0.618, 1, 0.0001);
near("6 green / 4 red = $26", daysProjection(10, 6, 4), 26.2, 0.1);
near("7 green / 3 red = $69", daysProjection(10, 7, 3), 68.6, 0.5);
near("8 green / 2 red = $179", daysProjection(10, 8, 2), 179.5, 0.5);
near("10 green = $1,230", daysProjection(10, 10, 0), 1231, 2);

// ---------- swing detection ----------
const T0 = Date.UTC(2026, 9, 19, 12, 0);
const mk = (rows) => rows.map(([o, h, l, c, v = 100], i) => ({ t: T0 + i * MIN, o, h, l, c, v }));
const impulse = [[100, 102, 99, 101], [101, 120, 100, 118], [118, 160, 115, 155], [155, 200, 150, 190], [190, 192, 175, 178], [178, 180, 170, 172]];
let sw = findSwing(mk(impulse));
ok("swing found", !!sw); ok("swing low 99 high 200", sw && sw.low === 99 && sw.high === 200, JSON.stringify(sw));
ok("unconfirmed high -> none", findSwing(mk(impulse.slice(0, 5))) === null);
ok("small move -> none", findSwing(mk([[100, 101, 99, 100], [100, 120, 99, 118], [118, 119, 110, 112], [112, 113, 111, 112], [112, 113, 111, 112]])) === null);
ok("broken below stop -> none", findSwing(mk([...impulse, [172, 173, 100, 101]])) === null);

// ---------- the book, candle by candle ----------
function run(rows, { start = 10, plan = PLAN } = {}) {
  const log = [];
  const b = new Book({ start, plan, log: (e) => log.push(e) });
  const cs = mk(rows);
  const now = cs[cs.length - 1].t + MIN;
  b.checkDay(T0);
  const swing = findSwing(cs.slice(0, impulse.length));
  b.arm("TOK", "TOK", swing, cs[impulse.length - 1].t + MIN);
  b.onCandles("TOK", cs, cs[cs.length - 1].c, now);
  return { b, log };
}
const L = levels(99, 200);
// winner: fill, TP1, TP2, TP3
let r = run([...impulse, [172, 173, L.entry - 1, L.entry + 2], [L.entry, L.tps[0] + 1, L.entry, L.tps[0]], [L.tps[0], L.tps[1] + 1, L.tps[0] - 1, L.tps[1]], [L.tps[1], L.tps[2] + 1, L.tps[1] - 1, L.tps[2]]]);
ok("winner: entry logged", r.log.some((e) => e.type === "entry"));
ok("winner: tp1 tp2 tp3", ["tp1", "tp2", "tp3"].every((x) => r.log.some((e) => e.type === "exit" && e.reason === x)), JSON.stringify(r.log.filter((e) => e.type === "exit")));
ok("winner: won", r.b.trades.length === 1 && r.b.trades[0].won);
const n0 = 0.236 * 10, u = n0 * 0.97 / L.entry;
const want = u * 0.97 * (0.382 * L.tps[0] + 0.382 * L.tps[1] + 0.236 * L.tps[2]) - n0;
near("winner: pnl with 3%+3% costs", r.b.trades[0].pnl, want, 1e-9);
near("winner: next f x1.618", r.b.f, 0.236 * 1.618, 1e-9);
// loser: fill then stop
r = run([...impulse, [172, 173, L.entry - 0.5, L.entry], [L.entry, L.entry + 1, L.stop - 1, L.stop - 1]]);
ok("loser: stop exit", r.log.some((e) => e.type === "exit" && e.reason === "stop"));
near("loser: pnl", r.b.trades[0].pnl, u * L.stop * 0.97 - n0, 1e-9);
near("loser: about -18% with costs", r.b.trades[0].ret, L.stop / L.entry * 0.97 * 0.97 - 1, 1e-9);
near("loser: next f /1.618 floored", r.b.f, 0.146, 1e-9);
// same candle fills and stops: worst case
r = run([...impulse, [172, 173, L.stop - 2, L.stop - 1]]);
ok("fill+stop same candle -> stopped", r.b.trades.length === 1 && r.b.trades[0].reason === "stop");
// time stop
const flat = Array.from({ length: 22 }, () => [L.entry + 1, L.entry + 3, L.entry - 0.2, L.entry + 1]);
r = run([...impulse, [172, 173, L.entry - 0.5, L.entry], ...flat]);
ok("time stop at 21 min", r.b.trades[0]?.reason === "time-stop-21m", JSON.stringify(r.b.trades[0]));
// breakeven stop after TP1
r = run([...impulse, [172, 173, L.entry - 0.5, L.entry], [L.entry, L.tps[0] + 1, L.entry + 1, L.tps[0]], [L.tps[0], L.tps[0], L.entry - 1, L.entry - 1]]);
ok("after TP1 stop moves to entry", r.b.trades[0]?.reason === "breakeven-stop", JSON.stringify(r.b.trades[0]));
// new high before fill disarms
r = run([...impulse, [172, 210, 170, 205]]);
ok("new high disarms", r.log.some((e) => e.type === "disarm") && r.b.trades.length === 0);

// ---------- 3 open, independent, and the 61.8% cap inside the book ----------
{
  const log = [];
  const b = new Book({ start: 10, log: (e) => log.push(e) });
  b.checkDay(T0);
  b.f = 0.2;
  const cs = mk(impulse), swing = findSwing(cs);
  const t = cs[cs.length - 1].t + MIN;
  for (const a of ["A", "B", "C", "D"]) b.arm(a, a, swing, t);
  const fill = (a, k) => b.onCandles(a, [{ t: t + k * MIN, o: 172, h: 173, l: L.entry - 0.5, c: L.entry }], L.entry, t + (k + 1) * MIN);
  fill("A", 0); fill("B", 1); b.f = 0.236; fill("C", 2);
  ok("three open at once", b.open.size === 3, b.open.size);
  near("third sized down: exposure exactly 61.8%", b.openNotional() / b.equity(), 0.618, 1e-9);
  ok("third entry says capped", log.some((e) => e.type === "entry" && e.symbol === "C" && /cap/.test(e.reason)));
  fill("D", 3);
  ok("fourth skipped (max 3)", !b.open.has("D") && log.some((e) => e.type === "skip" && e.symbol === "D"));
  const exp = b.openNotional() / b.equity();
  ok("exposure never above 61.8%", exp <= 0.618 + 1e-9, exp);
  // B stops out alone, A and C stay
  b.onCandles("B", [{ t: t + 5 * MIN, o: L.entry, h: L.entry, l: L.stop - 1, c: L.stop - 1 }], L.stop - 1, t + 6 * MIN);
  ok("positions managed independently", !b.open.has("B") && b.open.has("A") && b.open.has("C"));
}
// cap with a large f: second fill sized down, third skipped under the floor
{
  const log = [];
  const b = new Book({ start: 10, log: (e) => log.push(e) });
  b.checkDay(T0); b.f = 0.382;
  const cs = mk(impulse), swing = findSwing(cs), t = cs[cs.length - 1].t + MIN;
  for (const a of ["A", "B", "C"]) b.arm(a, a, swing, t);
  for (const [k, a] of ["A", "B", "C"].entries()) b.onCandles(a, [{ t: t + k * MIN, o: 172, h: 173, l: L.entry - 0.5, c: L.entry }], L.entry, t + (k + 1) * MIN);
  ok("f=0.382: second sized to fill the cap", b.open.has("B") && Math.abs(b.openNotional() / b.equity() - 0.618) < 1e-9, b.openNotional() / b.equity());
  ok("f=0.382: third skipped under 14.6% floor", !b.open.has("C") && log.some((e) => e.type === "skip" && /floor/.test(e.reason)));
}

// ---------- day stop closes everything and halts ----------
{
  const log = [];
  const b = new Book({ start: 10, log: (e) => log.push(e) });
  b.checkDay(T0);
  const cs = mk(impulse), swing = findSwing(cs), t = cs[cs.length - 1].t + MIN;
  b.arm("A", "A", swing, t);
  b.onCandles("A", [{ t, o: 172, h: 173, l: L.entry - 0.5, c: L.entry }], L.entry, t + MIN);
  b.cash -= 4; // a day that has already lost: equity drops below -38.2%
  b.checkDay(t + 2 * MIN);
  ok("day stop halts", b.day.halted === "stop" && b.open.size === 0 && log.some((e) => e.type === "halt"));
  ok("no arm while halted", b.arm("B", "B", swing, t + 3 * MIN) === false);
  b.checkDay(t + 24 * 3600_000);
  ok("next UTC day resumes", b.day.halted === null);
}

// ---------- persistence ----------
{
  const b = run([...impulse, [172, 173, L.entry - 0.5, L.entry]]).b;
  const b2 = new Book({ state: JSON.parse(JSON.stringify(b.toJSON())) });
  ok("state round-trips open position", b2.open.size === 1 && Math.abs(b2.equity() - b.equity()) < 1e-12);
}

// ---------- gate on recorded GMGN responses ----------
const FX = path.join(HERE, "fixtures", "gmgn");
const rec = JSON.parse(fs.readFileSync(path.join(FX, "replay-2026-10-19.json"), "utf8"));
const toks = Object.entries(rec.tokens);
ok("fixture has tokens with candles", toks.length >= 3 && toks.every(([, t]) => t.candles.length > 60), toks.length);
const nowSec = Math.floor(rec.recordedAt / 1000);
for (const [a, t] of toks.slice(0, 3)) {
  const g = gate({ full: t.full, topBuyers: t.topBuyers, candles: t.candles.filter((c) => c.t + MIN <= rec.recordedAt), nowSec });
  ok(`gate ${t.symbol}: 11 checks, each with a value`, g.checks.length === 11 && g.checks.every((c) => c.value !== undefined));
  ok(`gate ${t.symbol}: pass == all checks ok`, g.pass === g.checks.every((c) => c.ok));
}
ok("prefilter reads trending rows", rec.trending.length > 10 && rec.trending.every((r) => typeof prefilter(r, nowSec).ok === "boolean"));
ok("devSold reads holderInfo", devSold({ holders: { holderInfo: [{ wallet_address: "X", status: "sold" }] } }, "X") === true && devSold({ holders: { holderInfo: [] } }, "X") === null);
ok("volume rising", volumeRising(Array.from({ length: 30 }, (_, i) => ({ v: i }))).ok === true);
ok("missing data fails the gate", gate({ full: {}, topBuyers: null, candles: [], nowSec }).pass === false);
ok("allowlist: read endpoints only", allowed("/rrs/api/v1/trending_multichain") && !allowed("/api/v1/swap") && !allowed("/tx/api/v1/send_transaction"));

// ---------- replay: recorded GMGN data through the real Scanner loop ----------
async function replay({ openGate }) {
  const log = [];
  const book = new Book({ start: 10, log: (e) => log.push(e) });
  let now = 0;
  const first = Math.min(...toks.map(([, t]) => t.candles[0].t));
  const born = (t) => Math.floor((t.candles[0].t - 20 * MIN) / 1000);
  const src = {
    // each token is "born" 20 min before its first recorded candle; only tokens with candles yet are listed
    trending: async () => toks.filter(([, t]) => t.candles[0].t <= now).map(([a, t]) => ({ a, s: t.symbol, ct: born(t), lq: 50_000, t10: 0.1, smt: 5, kol: 1 })),
    fullInfo: async (addrs) => addrs.map((a) => {
      const f = JSON.parse(JSON.stringify(rec.tokens[a].full));
      f.creation_timestamp = born(rec.tokens[a]);
      if (openGate) {
        // replay the trading path on real candles: force the non-candle checks open
        Object.assign(f, { liquidity: 50_000, top_10_holder_rate: "0.1", creator_hold_rate: "0", creator_address: "DEV" });
        f.security = { ...f.security, burn_status: "burn", renounced_mint: true, renounced_freeze_account: true, can_not_sell: 0, is_show_alert: false };
        f.trade_stat = { ...f.trade_stat, smart_wallets: 3, renowned_wallets: 1 };
      }
      return f;
    }),
    topBuyers: async (a) => (openGate ? { holders: { holderInfo: [{ wallet_address: "DEV", status: "hold" }] } } : rec.tokens[a].topBuyers),
    candles: async (a) => rec.tokens[a].candles.filter((c) => c.t <= now),
  };
  const sc = new Scanner({ src, book, log: (e) => log.push(e) });
  const last = Math.max(...toks.map(([, t]) => t.candles[t.candles.length - 1].t));
  let cycles = 0, maxOpen = 0, maxExp = 0;
  for (now = first + 31 * MIN; now <= last + MIN; now += MIN) {
    await sc.cycle(now);
    cycles++;
    maxOpen = Math.max(maxOpen, book.open.size);
  }
  // exposure at the moment of each entry (the rule is checked when sizing a new entry)
  for (const e of log) if (e.type === "entry") maxExp = Math.max(maxExp, e.exposure);
  return { book, log, cycles, maxOpen, maxExp };
}
{
  const R = await replay({ openGate: true });
  const s = R.book.summary();
  console.log(`      replay (gate forced open): ${R.cycles} cycles, ${s.trades} trades, ${s.wins} wins, balance $${s.balance}, max open ${R.maxOpen}, max exposure ${(R.maxExp * 100).toFixed(1)}%`);
  ok("replay ran every minute", R.cycles > 100);
  ok("replay armed setups from real swings", R.log.some((e) => e.type === "arm"));
  ok("replay made paper trades", s.trades + s.open > 0, JSON.stringify(s));
  ok("every entry has a reason", R.log.filter((e) => e.type === "entry").every((e) => e.reason));
  ok("every close has a reason", R.log.filter((e) => e.type === "close").every((e) => e.reason));
  ok("never more than 3 open", R.maxOpen <= 3);
  ok("exposure never above 61.8%", R.maxExp <= 0.618 + 1e-9, R.maxExp);
  const pnl = R.book.trades.reduce((x, t) => x + t.pnl, 0);
  if (R.book.open.size === 0) near("balance = 10 + sum of trade pnl", R.book.equity(), 10 + pnl, 1e-9);
  const R2 = await replay({ openGate: false });
  const blocked = R2.log.filter((e) => e.type === "gate" && !e.pass);
  console.log(`      replay (real gate data): ${R2.book.summary().trades} trades; gate failures: ${[...new Set(blocked.flatMap((e) => e.failed))].join(", ")}`);
  ok("real gate data: every trade passed the gate", R2.log.filter((e) => e.type === "arm").every((e) => R2.log.some((g) => g.type === "gate" && g.addr === e.addr && g.pass)));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
