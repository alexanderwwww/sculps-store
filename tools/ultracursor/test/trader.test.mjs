/*
 * Trader (brain v2, "Sniper XYZ" training) tests. Every rule of the knowledge
 * base is driven, not just syntax-checked:
 *   v1 math kept (levels, sizing, exposure, day stops), multi-timeframe
 *   confluence, the entry ladder, the exits and trail, checkpoints and the
 *   21-minute stop, slots by win streak, the daily ladder and its floor,
 *   recovery, NO MARTINGALE, milestones and the lock, the strict brain, the
 *   narrative sense, the X readers, the fee engine, the memory (across process
 *   restarts), the gut, lessons, the tools map, the lanes running concurrently,
 *   the live stub, the "got paid" counter, the gate on recorded GMGN data, and
 *   a replay of recorded GMGN candles through the real three-lane loop.
 *
 *   node test/trader.test.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PLAN, PHI, levels, movesFromEntry, findSwing, nextFraction, ev, breakEven, dayStop, daysProjection, sizeEntry, V2, resample, timeframeAgrees, confluence, ladderLevels, ladderAvg, payoff, positionsAllowed, tierOf, pWindows, regimeOk } from "../src/trader/fib.mjs";
import { Book } from "../src/trader/book.mjs";
import { DayLadder, Milestones, RUNGS } from "../src/trader/ladder.mjs";
import { gate, prefilter, devSold, volumeRising } from "../src/trader/gate.mjs";
import { Sniper } from "../src/trader/scan.mjs";
import { allowed, webQuery } from "../src/trader/gmgn.mjs";
import { decide } from "../src/trader/brain.mjs";
import { smartBuys, gmgnScore, narrative, themeOf, themeHeat } from "../src/trader/narrative.mjs";
import { parseXLink, tweet, parseTimeline, xScore } from "../src/trader/x.mjs";
import { quoteCosts, costRule } from "../src/trader/fees.mjs";
import { Memory, traderOrb, setTraderMute, syncToR2, buckets } from "../src/trader/memory.mjs";
import { TOOLS } from "../src/trader/tools-map.mjs";
import { Lanes } from "../src/trader/lanes.mjs";
import { execute } from "../src/trader/execute.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const ok = (name, cond, info = "") => { if (cond) passed++; else failed++; console.log(`${cond ? "  ok" : "FAIL"}  ${name}${cond ? "" : "  " + (typeof info === "string" ? info : JSON.stringify(info))}`); };
const near = (name, got, want, tol = 1e-6) => ok(name, Math.abs(got - want) <= tol, `got ${got}, want ${want}`);
const MIN = 60_000;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "uc-trader-"));
process.env.ULTRA_JUP_GAP_MS = "0";

// =============================================================== v1 math (kept)
const lv = levels(100, 200);
near("entry = 0.618 retracement", lv.entry, 200 - 61.8);
near("stop 1% under 0.786", lv.stop, (200 - 78.6) * 0.99);
near("TP2 = 1.272 ext", lv.tps[1], 227.2);
const mv = movesFromEntry(lv);
near("2x impulse: TP1 about +45%", mv.tps[0], 0.447, 0.002);
let threw = false; try { levels(5, 5); } catch { threw = true; }
ok("flat swing throws", threw);
near("win x1.618", nextFraction(0.236, true), 0.381848);
near("win capped 0.382", nextFraction(0.382, true), 0.382);
near("loss /1.618 floored 0.146", nextFraction(0.236, false), 0.146);
ok("plan max 3 open", PLAN.maxOpen === 3);
let sz = sizeEntry({ f: 0.382, equity: 10, cash: 10, openNotional: 4.0 });
near("sized down to fit 61.8%", sz.notional, (6.18 - 4) / (1 + 0.618 * 0.03));
ok("skip when fit < 14.6% floor", !sizeEntry({ f: 0.236, equity: 10, cash: 10, openNotional: 5.0 }).ok);
near("break-even 31.6%", breakEven(0.39, 0.18), 0.3158, 1e-4);
ok("ev positive at 40%", ev(0.4, 0.39, 0.18) > 0);
ok("day target at +61.8%", dayStop(10, 16.18) === "target");
ok("day stop at -38.2%", dayStop(10, 6.18) === "stop");
near("8 green / 2 red = $179", daysProjection(10, 8, 2), 179.5, 0.5);

const T0 = Date.UTC(2026, 9, 19, 12, 0);
const mk = (rows, t0 = T0) => rows.map(([o, h, l, c, v = 100], i) => ({ t: t0 + i * MIN, o, h, l, c, v }));
const impulse = [[100, 102, 99, 101], [101, 120, 100, 118], [118, 160, 115, 155], [155, 200, 150, 190], [190, 192, 175, 178], [178, 180, 170, 172]];
let sw = findSwing(mk(impulse));
ok("swing low 99 high 200", sw && sw.low === 99 && sw.high === 200, sw);
ok("unconfirmed high -> none", findSwing(mk(impulse.slice(0, 5))) === null);

// =============================================================== Fibonacci at every scale
{
  const A21 = Math.floor(T0 / (21 * MIN)) * 21 * MIN;
  const ones = Array.from({ length: 42 }, (_, i) => ({ t: A21 + i * MIN, o: i, h: i + 1, l: i - 1, c: i, v: 1 }));
  const r3 = resample(ones, 3), r21 = resample(ones, 21);
  ok("resample 42 x 1m -> 14 x 3m", r3.length === 14 && r3[0].h === 3 && r3[0].l === -1 && r3[0].c === 2 && r3[0].v === 3, r3[0]);
  ok("resample 42 x 1m -> 2 x 21m", r21.length === 2 && r21[1].o === 21 && r21[1].c === 41);
  // a 1m series: impulse 100 -> 200 over 60 min, then a pullback to the 0.618 zone over 40 min
  const up = Array.from({ length: 63 }, (_, i) => 100 + (100 * i) / 62);
  const down = Array.from({ length: 42 }, (_, i) => 200 - (61.8 * (i + 1)) / 42);
  const px = [...up, ...down];
  const c1 = px.map((p, i) => ({ t: T0 + i * MIN, o: i ? px[i - 1] : p, h: Math.max(p, i ? px[i - 1] : p) + 0.1, l: Math.min(p, i ? px[i - 1] : p) - 0.1, c: p, v: 10 }));
  const cf = confluence(c1);
  ok("confluence: a clean impulse + 0.618 pullback agrees on >= 3 of 1/3/5/13/21m", cf.ok && cf.agree >= 3, cf.each.map((e) => `${e.tf}m:${e.ok}:${e.why}`).join(" "));
  ok("confluence reads all five timeframes", cf.each.map((e) => e.tf).join() === "1,3,5,13,21");
  const fresh = c1.slice(0, 20);
  ok("too few bars on the big timeframes: no opinion, not agreeing", confluence(fresh).each.find((e) => e.tf === 21).ok === false);
  const still = c1.slice(0, 63);
  ok("still making the high: no pullback, no confluence", !confluence(still).ok);
  ok("closed under 0.786 breaks a timeframe", timeframeAgrees(mk([[100, 101, 99, 100], [100, 150, 100, 150], [150, 200, 150, 199], [199, 199, 110, 112], [112, 115, 111, 113]])).ok === false);
}
{
  const L = ladderLevels(100, 200);
  near("ladder part 1: 38.2% at 0.5", L.parts[0].price, 150); near("share", L.parts[0].share, 0.382);
  near("ladder part 2: 38.2% at 0.618", L.parts[1].price, 138.2);
  near("ladder part 3: 23.6% at 0.705", L.parts[2].price, 129.5); near("share", L.parts[2].share, 0.236);
  near("shares sum to 1", L.parts.reduce((s, p) => s + p.share, 0), 1);
  near("T1 = swing high", L.t1, 200); near("T2 = 1.272", L.t2, 227.2); near("trail to 1.618", L.trail[0], 261.8); near("then 2.618", L.trail[1], 361.8);
  near("stop 1% under 0.786", L.stop, 121.4 * 0.99);
  const E = ladderAvg(L.parts);
  ok("ladder average between first and last part", E < 150 && E > 129.5, E);
  const p0 = payoff(100, 200, 0);
  ok("payoff W about +0.60, Λ about -0.14 before costs", Math.abs(p0.W - 0.605) < 0.01 && Math.abs(p0.Lam + 0.1427) < 0.01, p0);
  ok("W >= 3|Λ| holds at 3% round trip", payoff(100, 200, 0.03).ok);
  ok("W >= 3|Λ| breaks at 5% round trip", !payoff(100, 200, 0.05).ok);
  ok("slots 1 -> 2 -> 3 by win streak", positionsAllowed(0) === 1 && positionsAllowed(1) === 2 && positionsAllowed(2) === 3 && positionsAllowed(9) === 3);
  ok("tiers: 3 watch, 5 ready, 8 = fire only when all hold", tierOf({ a: true, b: true, c: true }).tier === "watch" && tierOf({ a: 1, b: true, c: true, d: true, e: true, f: true, g: false, h: false }).tier === "ready" && tierOf(Object.fromEntries("abcdefgh".split("").map((k) => [k, true]))).tier === "fire" && tierOf(Object.fromEntries("abcdefgh".split("").map((k, i) => [k, i < 7]))).tier !== "fire");
  const tr = Array.from({ length: 40 }, (_, i) => ({ won: i % 3 === 0 }));
  const pw = pWindows(tr);
  ok("p over the last 13 / 21 / 34 trades", pw.p13 !== null && pw.p21 !== null && pw.p34 !== null && Math.abs(pw.p34 - tr.slice(-34).filter((t) => t.won).length / 34) < 1e-12, pw);
  ok("p window needs that many trades", pWindows(tr.slice(0, 20)).p21 === null);
  ok("regime: SOL down 5% in 65 min = stand aside", regimeOk(mk(Array.from({ length: 13 }, (_, i) => [100 - i * 0.4, 100, 90, 100 - (i + 1) * 0.4]))).ok === false);
  ok("regime: flat SOL = ok", regimeOk(mk(Array.from({ length: 13 }, () => [100, 101, 99, 100]))).ok === true);
  ok("regime: no SOL data = NO", regimeOk(null).ok === false);
}

// =============================================================== the book v2
const SW = findSwing(mk(impulse));               // 99 -> 200
const LL = ladderLevels(99, 200);
const P1 = LL.parts[0].price, P2 = LL.parts[1].price, P3 = LL.parts[2].price;
function run(rows, { start = 10, cost = 0.03, prep = null } = {}) {
  const log = [];
  const b = new Book({ start, log: (e) => log.push(e) });
  if (prep) prep(b);
  const cs = mk([...impulse, ...rows]);
  b.checkDay(T0);
  b.arm("TOK", "TOK", SW, cs[impulse.length - 1].t + MIN, { costSide: cost, features: { theme: "ai" }, tools: ["trending"] });
  b.onCandles("TOK", cs, cs[cs.length - 1].c, cs[cs.length - 1].t + MIN);
  return { b, log, ev: (type) => log.filter((e) => e.type === type) };
}
{
  // full winner: all three parts, T1, T2, 1.618 trail, out at 2.618
  const r = run([[172, 173, P1 - 0.5, P1 + 0.5], [P1, P1 + 1, P2 - 0.5, P2 + 0.5], [P2, P2 + 1, P3 - 0.5, P3 + 0.5], [P3, LL.t1 + 1, P3, LL.t1], [LL.t1, LL.t2 + 1, LL.t1 - 1, LL.t2], [LL.t2, LL.trail[0] + 1, LL.t2 + 1, LL.trail[0]], [LL.trail[0], LL.trail[1] + 1, LL.trail[0], LL.trail[1]]]);
  ok("entry ladder: three fills at 0.5 / 0.618 / 0.705", r.ev("fill").map((e) => e.at).join() === "0.5,0.618,0.705", r.ev("fill"));
  ok("fills sized 38.2 / 38.2 / 23.6% of 23.6% of $10", r.ev("fill").map((e) => e.notional).join() === [0.382, 0.382, 0.236].map((s) => +(s * 2.36).toFixed(6)).join(), r.ev("fill").map((e) => e.notional));
  ok("exits: T1, T2 at 1.272, trail, out at 2.618", r.ev("exit").map((e) => e.reason).join() === "t1,t2-1.272,t3-2.618", r.ev("exit").map((e) => e.reason));
  ok("exit shares 38.2 / 38.2 / 23.6%", r.ev("exit").map((e) => e.sold).every((s, i) => Math.abs(s - [0.382, 0.382, 0.236][i]) < 1e-4), r.ev("exit").map((e) => e.sold));
  ok("trail moved the stop to 1.272 when 1.618 traded", r.ev("trail").length === 1 && Math.abs(r.ev("trail")[0].stop - LL.t2) < 1e-4);
  const n = 2.36, units = [0.382 / P1, 0.382 / P2, 0.236 / P3].reduce((s, x) => s + x * n * 0.97, 0);
  const want = units * 0.97 * (0.382 * LL.t1 + 0.382 * LL.t2 + 0.236 * LL.trail[1]) - n;
  near("winner pnl with the setup's real 3% per side", r.b.trades[0].pnl, want, 1e-9);
  ok("winner: next f x phi and win streak 1 -> 2 slots", Math.abs(r.b.f - 0.236 * PHI) < 1e-9 && r.b.slots() === 2);
  ok("a profitable exit counts as 'got paid' (3 fills)", r.b.paid === 3, r.b.paid);
}
{
  const r = run([[172, 173, P1 - 0.5, P1 + 0.5], [P1, LL.t1 + 1, P1 + 0.2, LL.t1]]);
  ok("T1 before the deeper parts: they are cancelled", r.ev("fill").length === 1 && r.ev("exit")[0].reason === "t1");
  const p = r.b.open.get("TOK");
  ok("after T1 the stop is at break-even (avg entry)", p && Math.abs(p.stop - p.avg) < 1e-12);
  near("exposure after T1 = cost basis still held", r.b.openNotional(), p.filledN * p.units / p.bought, 1e-12);
}
{
  const r = run([[172, 173, P1 - 0.5, P1 + 0.5], [P1, LL.t1 + 1, P1 + 0.2, LL.t1], [LL.t1, LL.t1, P1 - 5, P1 - 5]]);
  ok("break-even stop after T1", r.b.trades[0]?.reason === "breakeven-stop", r.b.trades[0]);
}
{
  const r = run([[172, 173, P1 - 0.5, P1 + 0.5], [P1, LL.t1 + 1, P1 + 0.2, LL.t1], [LL.t1, LL.t2 + 1, LL.t1, LL.t2], [LL.t2, LL.t2, LL.t1 - 1, LL.t1 - 1]]);
  ok("trail stop at T1 after T2, trade won", r.b.trades[0]?.reason === "trail-stop" && r.b.trades[0].won, r.b.trades[0]);
}
{
  const r = run([[172, 173, LL.stop - 2, LL.stop - 1]]);
  ok("fill and stop in one candle: all parts fill, then stopped (worst case)", r.ev("fill").length === 3 && r.b.trades[0]?.reason === "stop" && !r.b.trades[0].won);
  ok("a loss is not 'got paid'", r.b.paid === 0);
  const r2 = run([[172, 173, P1 - 0.5, P1 - 0.2]]);
  ok("the fill candle cannot take profit", r2.ev("exit").length === 0 && r2.b.open.size === 1);
}
{
  const flat = Array.from({ length: 22 }, () => [P1 + 1, P1 + 3, P1 - 0.2, P1 + 1]);
  const r = run([[172, 173, P1 - 0.5, P1], ...flat]);
  ok("checkpoints at 3, 5, 8, 13, 21 min", r.ev("checkpoint").map((e) => e.min).join() === "3,5,8,13,21", r.ev("checkpoint").map((e) => e.min));
  ok("no T1 by 21 min: time stop", r.b.trades[0]?.reason === "time-stop-21m", r.b.trades[0]);
}
{
  const r = run([[172, 210, 170, 205]]);
  ok("new high before any fill disarms", r.ev("disarm").length === 1 && r.b.trades.length === 0 && r.b.open.size === 0);
}
{
  // slots: win streak 0 = 1 position; streak 2 = 3; 61.8% cap holds
  const log = [];
  const b = new Book({ start: 10, log: (e) => log.push(e) });
  b.checkDay(T0);
  const cs = mk(impulse), t = cs[cs.length - 1].t + MIN;
  for (const a of ["A", "B"]) b.arm(a, a, SW, t, { costSide: 0.03 });
  const fill = (a, k) => b.onCandles(a, [{ t: t + k * MIN, o: 172, h: 173, l: P3 - 0.1, c: P3 }], P3, t + (k + 1) * MIN);
  fill("A", 0); fill("B", 1);
  ok("win streak 0: one position only", b.open.size === 1 && log.some((e) => e.type === "skip" && /1 slot/.test(e.reason)), log.filter((e) => e.type === "skip"));
  const b3 = new Book({ start: 10, log: (e) => log.push(e) });
  b3.checkDay(T0); b3.winStreak = 2; b3.f = 0.382;
  for (const a of ["A", "B", "C", "D"]) b3.arm(a, a, SW, t, { costSide: 0.03 });
  for (const [k, a] of ["A", "B", "C", "D"].entries()) b3.onCandles(a, [{ t: t + k * MIN, o: 172, h: 173, l: P3 - 0.1, c: P3 }], P3, t + (k + 1) * MIN);
  const ents = log.filter((e) => e.type === "entry" && b3.open.has(e.addr) || e.type === "entry" && e.slots === 3);
  ok("win streak 2: 3 slots, and every entry fits under 61.8% when it is sized", b3.slots() === 3 && ents.length >= 2 && ents.every((e) => e.exposure <= 0.618 + 1e-9), ents.map((e) => e.exposure));
  ok("never a 4th position", !b3.open.has("D"));
}

// =============================================================== daily ladder and recovery
{
  const d = new DayLadder();
  d.roll("2026-10-19");
  let e = d.onClose(0.5);
  ok("unit u = the first realised profit", d.u === 0.5 && e.some((x) => x.type === "unit"));
  ok("rung 1u banked as a checkpoint", d.checkpoint === 0.5 && e.some((x) => x.type === "rung" && x.rung === 1));
  near("floor = checkpoint - 0.382u", d.floor(), 0.5 - 0.191);
  near("max risk = pnl - floor", d.maxRisk(), 0.191);
  d.onClose(1.1);
  ok("cumulative rungs 2u and 3u reached at 1.6 = 3.2u", d.checkpoint === 1.5 && d.rung === 2, d);
  d.onClose(1.0);  // 2.6 = 5.2u
  ok("rung 5u", d.checkpoint === 2.5);
  ok("rungs are 1,2,3,5,8,13", RUNGS.join() === "1,2,3,5,8,13");
  const lossEv = d.onClose(-0.2);
  near("after a loss L: recovery goal phi x L", d.recovery.goal, 0.2 * PHI);
  ok("recovery event logged", lossEv.some((x) => x.type === "loss"));
  d.onClose(0.2);
  ok("not recovered until phi x L is back", d.inRecovery());
  const rec = d.onClose(0.2);
  ok("recovered at phi x L", !d.inRecovery() && rec.some((x) => x.type === "recovered"));
  const sum = d.roll("2026-10-20");
  near("tomorrow's target = today's result x phi", d.target, (0.5 + 1.1 + 1.0 - 0.2 + 0.4) * PHI);
  ok("day summary carries u and the rung", sum.u === 0.5 && sum.rung === 5);
  d.onClose(-1);
  const t0 = d.target;
  d.roll("2026-10-21");
  ok("a red day keeps the target at its level (not zero)", d.target === t0);
  ok("an unfinished recovery carries into the next day", d.inRecovery());
}
{
  // the floor inside the book: a day that banked 1u may only risk 0.382u
  const r = run([[172, 173, P1 - 0.5, P1 + 0.5]], { prep: (b) => { b.ladder.roll("2026-10-19"); b.ladder.onClose(1); } });
  const ent = r.ev("entry")[0];
  const lossFrac = 1 - (LL.stop / P1) * 0.97 * 0.97;
  ok("ladder floor sizes the trade down", ent && ent.capped && Math.abs(ent.reserved - 0.382 / lossFrac) < 1e-4, { ent, want: 0.382 / lossFrac });
  const r2 = run([[172, 173, P1 - 0.5, P1 + 0.5]], { prep: (b) => { b.ladder.roll("2026-10-19"); b.ladder.onClose(0.3); } });
  ok("ladder floor skips when what fits is under 14.6%", r2.ev("skip").some((e) => /ladder floor/.test(e.reason)) && r2.b.open.size === 0, r2.ev("skip"));
}

// =============================================================== NO MARTINGALE
{
  // 1) the sizing function, every reachable f, both outcomes
  let worst = 0;
  for (let f = 0.146; f <= 0.382 + 1e-9; f += 0.001) worst = Math.max(worst, nextFraction(f, false) - f);
  ok("nextFraction after a loss is never larger than before (all f on the ladder)", worst <= 1e-12, worst);
  // 2) through the real book, 300 random trades, recovery included
  const log = [];
  const b = new Book({ start: 10, log: (e) => log.push(e) });
  b.checkDay(T0);
  let rnd = 7;
  const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
  let t = T0 + 10 * MIN, violations = [], prev = null, grewInRecovery = 0, n = 0;
  for (let i = 0; i < 300; i++) {
    const a = `T${i}`;
    b.arm(a, a, { ...SW, highT: t - MIN }, t, { costSide: 0.03 });
    const win = rand() < 0.4;
    const rows = win ? [[172, 173, P1 - 0.3, P1], [P1, LL.t1 + 1, P1, LL.t1], [LL.t1, LL.t2 + 1, LL.t1, LL.t2], [LL.t2, LL.t2, LL.t1 - 1, LL.t1 - 1]] : [[172, 173, P1 - 0.3, P1], [P1, P1, LL.stop - 1, LL.stop - 1]];
    const inRec = b.ladder.inRecovery();
    const fBefore = b.f;
    b.onCandles(a, mk(rows, t), 0, t + rows.length * MIN);
    // one trade per UTC day: the day ladder's floor (risk <= 0.382u after the first win) would
    // otherwise skip the rest of a $10 day; an unfinished recovery carries across days
    t += 24 * 3600_000;
    b.checkDay(t);
    const tr = b.trades[b.trades.length - 1];
    if (!tr || tr.addr !== a) continue;
    n++;
    if (prev && !prev.won && tr.fBefore > prev.fBefore + 1e-12) violations.push({ i, prev: prev.fBefore, now: tr.fBefore });
    if (inRec && tr.fBefore > fBefore + 1e-12) grewInRecovery++;
    prev = tr;
  }
  ok(`after every loss the next trade's f is smaller or equal (${n} trades)`, n > 200 && violations.length === 0, violations.slice(0, 3));
  const afterLoss = b.trades.filter((x, i) => i > 0 && !b.trades[i - 1].won);
  ok("after every loss the next trade's notional / equity never grows", afterLoss.every((x, k) => x.fBefore <= b.trades[b.trades.indexOf(x) - 1].fBefore + 1e-12));
  ok("recovery never raises size", grewInRecovery === 0);
  ok("size only goes up after a win", b.trades.every((x, i) => i === 0 || x.fBefore <= b.trades[i - 1].fBefore + 1e-12 || b.trades[i - 1].won));
}

// =============================================================== milestones and the lock
{
  const m = new Milestones({ b0: 10 });
  near("first milestone B0 x phi", m.next(), 16.18);
  near("lock 23.6% of the first milestone's gain", m.check(16.5), 0.236 * 6.18, 1e-9);
  near("second: 23.6% of 16.18 -> 26.18", m.check(26.2), 0.236 * (10 * PHI * PHI - 16.18), 1e-9);
  ok("no double lock", m.check(26.2) === 0 && m.k === 2);
  const r = run([[172, 173, P1 - 0.5, P1 + 0.5], [P1, LL.t1 + 1, P1, LL.t1], [LL.t1, LL.t2 + 1, LL.t1, LL.t2], [LL.t2, LL.trail[0] + 1, LL.t2, LL.trail[0]], [LL.trail[0], LL.trail[1] + 1, LL.trail[0], LL.trail[1]]], { prep: (b) => { b.cash = 16; b.miles = new Milestones({ b0: 10 }); } });
  const ms = r.ev("milestone");
  ok("a win over B0 x phi locks 23.6% of the gain", ms.length === 1 && Math.abs(ms[0].locked - 0.236 * 6.18) < 1e-9, ms);
  ok("locked money is out of tradable equity", Math.abs(r.b.total() - r.b.equity() - r.b.miles.locked) < 1e-12 && r.b.miles.locked > 0);
}

// =============================================================== strict brain
const ALL = () => ({
  nowSec: T0 / 1000, prefilter: { ok: true }, gate: { pass: true, failed: [] }, swing: SW, confluence: { ok: true, agree: 4 },
  smartNow: { count: 3, windowMin: 20 }, narrative: { ok: true, N: 70, A: 66, B: 72 }, regime: { ok: true }, fees: { ok: true, costRt: 0.02, route: "jupiter" }, costRule: { ok: true }, theme: "ai",
  full: { creation_timestamp: T0 / 1000 - 3600, liquidity: 50000, top_10_holder_rate: 0.15 },
});
{
  ok("all 8 signals: FIRE", decide(ALL()).decision === "FIRE");
  for (const k of ["prefilter", "gate", "swing", "confluence", "smartNow", "narrative", "regime", "fees", "costRule"]) {
    const f = ALL(); f[k] = null;
    ok(`missing ${k}: NO`, decide(f).decision === "NO");
  }
  const f = ALL(); f.smartNow = { count: 1, windowMin: 60 };
  ok("one smart buyer is not two: NO", decide(f).decision === "NO");
  const ov = ALL(); ov.gate = { pass: false, failed: ["dev has not sold"] };
  ok("no override: extra options cannot open a failed gate", decide(ov, { override: true, force: true }).decision === "NO" && decide({ ...ov, override: true }).decision === "NO");
  ok("every NO says why", /gate \(dev has not sold\)/.test(decide(ov).reason));
  ok("recovery: confluence 3 is not enough", decide({ ...ALL(), confluence: { ok: true, agree: 3 } }, { inRecovery: true }).decision === "NO");
  ok("recovery: confluence 4 passes", decide(ALL(), { inRecovery: true }).decision === "FIRE");
}

// =============================================================== memory, gut, lessons
{
  const dir = tmp();
  const mem = new Memory({ dir });
  ok("empty memory: gut 50", mem.gut({ theme: "ai" }).score === 50);
  for (let i = 0; i < 21; i++) mem.onTrade({ id: i, symbol: "W", won: true, pnl: 1, ret: 0.3, features: { theme: "ai", hour: 3 }, tools: ["trending", "xTweet"] });
  for (let i = 0; i < 21; i++) mem.onTrade({ id: 100 + i, symbol: "L", won: false, pnl: -1, ret: -0.2, features: { theme: "animals", hour: 4 }, tools: ["trending", "callouts"] });
  const gAi = mem.gut({ theme: "ai" }), gAn = mem.gut({ theme: "animals" });
  ok("gut rises on a feature that won", gAi.score > 61.8, gAi);
  ok("gut falls on a feature that lost", gAn.score < 38.2, gAn);
  // gut can veto, never open
  const f = ALL(); f.theme = "animals"; f.full.creation_timestamp = undefined;
  ok("gut veto turns a FIRE into NO once it has evidence", decide(f, { memory: mem }).decision === "NO" && /gut/.test(decide(f, { memory: mem }).reason));
  const g2 = ALL(); g2.theme = "ai"; g2.gate = { pass: false, failed: ["top10 < 25%"] };
  ok("a great gut never opens the gate", decide(g2, { memory: mem }).decision === "NO");
  ok("the gut never touches size (decide returns no size)", !("size" in decide(ALL(), { memory: mem })) && !("f" in decide(ALL(), { memory: mem })));
  const use = mem.toolUse("callouts");
  ok("tool usefulness: a tool present only on losers is measured low", use.p < 0.1 && use.n === 21, use);
  for (let i = 0; i < 13; i++) mem.onTrade({ id: 200 + i, won: false, pnl: -1, features: {}, tools: ["callouts"] });
  ok("tool dropped after 34 trades under break-even", mem.toolUse("callouts").dropped === true);
  ok("tool on winners kept", mem.toolUse("xTweet").dropped === false);
  // lessons: the last 34 are mostly losses -> p13, p21, p34 all under break-even -> tighten one step
  const L = mem.lessons();
  ok("a lesson is written only when 13/21/34 agree, with date and evidence", L.length >= 1 && L[0].evidence.p13 !== null && L[0].evidence.p34 !== null && L[0].at, L);
  ok("strictness moves along the phi ladder", [38.2, 50, 61.8].includes(mem.brain.strictness) && mem.brain.strictness > 38.2);
  // persistence across a real process restart
  const child = spawnSync(process.execPath, ["-e", `import(${JSON.stringify(path.resolve(HERE, "../src/trader/memory.mjs"))}).then(({Memory}) => { const m = new Memory({ dir: ${JSON.stringify(dir)} }); m.journal({ addr: "X", decision: "NO", reason: "child" }); m.onTrade({ id: 999, won: true, pnl: 2, features: { theme: "politics" }, tools: [] }); })`], { encoding: "utf8" });
  ok("child process wrote memory", child.status === 0, child.stderr);
  const again = new Memory({ dir });
  ok("memory persists across process restarts (trades, gut, journal)", again.stats().trades === 56 && again.brain.gut["theme=politics"]?.n === 1 && again.journalLines().some((j) => j.reason === "child"), again.stats());
  // daily summary
  const ds = again.daySummary({ date: "2026-10-19", pnl: 1.2, u: 0.4, rung: 3, recoveries: 1 }, [{ symbol: "A", ret: 0.5, won: true, reason: "t1" }, { symbol: "B", ret: -0.1, won: false, reason: "stop" }]);
  ok("day summary: date, trades, p, P&L, u, rung, recoveries, best and worst", ds.trades === 2 && ds.p === 0.5 && ds.best.symbol === "A" && ds.worst.symbol === "B" && again.days().length === 1);
  // snapshot round trip and the R2 helper
  const snap = again.exportSnapshot();
  const dir2 = tmp();
  Memory.importSnapshot(dir2, JSON.parse(JSON.stringify(snap)));
  const imp = new Memory({ dir: dir2 });
  ok("snapshot export -> import keeps the trader's knowledge", imp.stats().trades === 56 && imp.gut({ theme: "ai" }).score === again.gut({ theme: "ai" }).score && imp.lessons().length === again.lessons().length);
  const calls = [];
  const saved = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_API_TOKEN = "test-token";
  const sres = syncToR2(again, { run: (cmd, args) => { calls.push(args); return { status: 0, stderr: "" }; } });
  if (saved === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = saved;
  ok("R2 sync puts latest and dated copies with --remote", sres.ok && calls.length === 2 && calls[0].includes("gardenbuddy-media/trader-memory-latest.json") && /trader-memory-\d{4}-\d{2}-\d{2}\.json/.test(calls[1][4]) && calls.every((a) => a.includes("--remote")), calls);
  // the tools map
  for (const k of ["trending", "fullInfo", "topBuyers", "candles", "holderStat", "trades", "feeInfo", "callouts", "community", "gas", "xTweet", "xSearch", "jupiterQuote"]) ok(`tools map: ${k} has endpoint and what it returns`, TOOLS[k] && TOOLS[k].endpoint && TOOLS[k].returns);
  again.onCall({ tool: "/vas/api/v1/token_trades/sol/<mint>", ms: 200, ok: true });
  again.onCall({ tool: "/vas/api/v1/token_trades/sol/<mint>", ms: 100, ok: false, error: "429" });
  ok("tools map measures latency and reliability per call", again.toolsMap.trades.calls === 2 && again.toolsMap.trades.reliability === 0.5 && again.toolsMap.trades.latencyMs > 0, again.toolsMap.trades);
  ok("no trading endpoint in the tools map", Object.values(TOOLS).every((t) => !/\/swap(?!\/v1\/quote)|send_transaction|submit|\/order|\/tx\//i.test(t.endpoint)));
  // the orb's data: only while the trader runs, bytes = what is on disk
  ok("orb: hidden without the trader", traderOrb(dir) === null);
  again.heartbeat({ paid: 4 });
  const orb = traderOrb(dir);
  const disk = ["journal.jsonl", "trades.jsonl", "days.jsonl", "lessons.jsonl", "brain.json", "tools-map.json"].reduce((s, f) => s + (fs.existsSync(path.join(dir, f)) ? fs.statSync(path.join(dir, f)).size : 0), 0);
  ok("orb: KB = the memory's bytes on disk", orb && orb.bytes === disk && orb.kb === Math.round(disk / 1024) && orb.paid === 4, { orb, disk });
  ok("orb: a stale heartbeat (trader stopped) hides it", traderOrb(dir, Date.now() + 20_000) === null);
  setTraderMute(true, dir);
  ok("mute toggle", traderOrb(dir).muted === true && (setTraderMute(false, dir), traderOrb(dir).muted === false));
  again.off();
  ok("trader off: orb gone", traderOrb(dir) === null);
  ok("buckets use Fibonacci edges", buckets({ ageMin: 30, liqK: 60, N: 70 }).ageMin === "21-55" && buckets({ liqK: 60 }).liqK === "55-89");
}

// =============================================================== narrative and X
const TF = JSON.parse(fs.readFileSync(path.join(HERE, "fixtures", "gmgn", "tools-2026-10-19.json"), "utf8"));
const TW = JSON.parse(fs.readFileSync(path.join(HERE, "fixtures", "x", "tweet-result-2026-10-19.json"), "utf8"));
{
  const [a, t] = Object.entries(TF.tokens).find(([, x]) => x.symbol === "COLLECTOOOR") || Object.entries(TF.tokens)[0];
  const nowSec = Math.floor(TF.recordedAt / 1000);
  const sb = smartBuys(t.trades, nowSec);
  ok("smart buys read from real trade maker_tags", Number.isInteger(sb.count) && sb.windowMin >= 0, sb);
  const g = gmgnScore({ trades: t.trades, holderStat: t.holderStat, callouts: TF.callouts, community: t.community, addr: a, nowSec });
  ok("GMGN source scores real recorded data 0-100", g.score !== null && g.score >= 0 && g.score <= 100 && "smartHolders" in g.parts && "calls1h" in g.parts, g);
  ok("GMGN source with no data = missing", gmgnScore({}).score === null);
  ok("parse X links GMGN gives", parseXLink("https://x.com/Jaketradezmeme/status/2112253942247862395?s=20").id === "2112253942247862395" && parseXLink("https://x.com/i/status/2112295186110050594").id === "2112295186110050594" && parseXLink("Jaketradezmeme/status/2112253942247862395").handle === "Jaketradezmeme" && parseXLink("https://x.com/miipals").handle === "miipals" && parseXLink("") === null);
  const tw = await tweet("2112253942247862395", { fetchImpl: async () => ({ status: 200, json: async () => TW }) });
  ok("tweet embed parsed (recorded real response)", tw.likes === TW.favorite_count && tw.author === "Jaketradezmeme" && tw.blue === true && tw.replies === TW.conversation_count, tw);
  ok("tweet 404 = null", (await tweet("1", { fetchImpl: async () => ({ status: 404 }) })) === null);
  const xs = xScore({ own: tw, now: tw.createdAt + 3600_000 });
  ok("X source scores the coin's own tweet", xs.score > 0 && xs.parts.blue === 1 && xs.parts.fresh === 1, xs);
  ok("X with nothing = missing", xScore({}).score === null);
  const gql = { data: { search_by_raw_query: { search_timeline: { timeline: { instructions: [{ entries: [{ content: { itemContent: { tweet_results: { result: { rest_id: "11", core: { user_results: { result: { is_blue_verified: true, legacy: { screen_name: "kol", followers_count: 50000 } } } }, legacy: { full_text: "$ABC sending", favorite_count: 30, reply_count: 4, retweet_count: 2, created_at: "Mon Oct 19 22:00:00 +0000 2026" } } } } } }] }] } } } } };
  const parsed = parseTimeline(gql);
  ok("SearchTimeline parser finds tweets anywhere in the tree", parsed.length === 1 && parsed[0].author === "kol" && parsed[0].followers === 50000 && parsed[0].blue && parsed[0].likes === 30, parsed);
  const now = Date.parse("Mon Oct 19 22:30:00 +0000 2026");
  ok("X search adds mentions / authors / big accounts", xScore({ found: parsed, now }).parts.mentions1h > 0 && xScore({ found: parsed, now }).parts.bigAccounts > 0);
  const n1 = narrative({ gmgn: { score: 70 }, x: { score: 66 } });
  ok("two sources agree and N >= 61.8: ok", n1.ok && Math.abs(n1.N - (0.618 * 70 + 0.382 * 66)) < 0.1, n1);
  ok("one source missing: NO", !narrative({ gmgn: { score: 90 }, x: { score: null } }).ok);
  ok("sources disagree (X under 38.2): NO even with high N", !narrative({ gmgn: { score: 100 }, x: { score: 30 } }).ok);
  ok("a dropped source counts as missing", !narrative({ gmgn: { score: 90 }, x: { score: 90 }, dropped: ["x"] }).ok);
  ok("themes tagged", themeOf("dogwifhat", "WIF") === "animals" && themeOf("AI agent") === "ai" && themeOf("zzz") === "other");
  ok("theme heat from the trending board", Object.values(themeHeat(TF.trending)).reduce((s, x) => s + x, 0) > 0.99);
}

// =============================================================== fee engine (recorded Jupiter shapes, fake fetch)
{
  const buyQ = JSON.parse(fs.readFileSync(path.join(HERE, "fixtures", "jupiter", "quote-buy-2026-10-19.json"), "utf8"));
  const mkFetch = (rtLoss, status = 200) => async (url) => {
    const u = new URL(url);
    const amt = Number(u.searchParams.get("amount"));
    if (status !== 200) return { status, json: async () => ({ code: status }) };
    if (u.searchParams.get("inputMint").startsWith("So111")) return { status: 200, json: async () => ({ ...buyQ, inAmount: String(amt), outAmount: String(amt * 1000) }) };
    return { status: 200, json: async () => ({ ...buyQ, inAmount: String(amt), outAmount: String(Math.floor((amt / 1000) * (1 - rtLoss))) }) };
  };
  const gm = { feeInfo: { pool_fee_info_list: [{ fee_ratio: 0.0115, liquidity: 70000, exchange: "Pump AMM" }], security: { buy_tax: "0", sell_tax: "0" } }, trades: [{ gas_native: "0.00002" }, { gas_native: "0.00006" }, { gas_native: "0.0001" }], gas: { auto: "0.000244" }, solUsd: 105 };
  const q = await quoteCosts({ mint: "ESnW5ZbLmoEAg2QEMxnMsY9R3aS8Kw58HJacYURmpump", notionalUsd: 2.36, gm, fetchImpl: mkFetch(0.03) });
  near("per side = max(round trip/2, pool fee) + network", q.costSide, Math.max(0.015, 0.0115) + (0.00006 * 105) / 2.36, 1e-4);
  ok("network cost = median of what landed trades paid", q.netSol === 0.00006);
  ok("GMGN route logged but unpriced (its swap fee is not exposed)", q.routes.find((r) => r.route === "gmgn" && r.priced === false && r.poolFee === 0.0115));
  ok("cheapest priced route chosen", q.ok && q.route === "jupiter");
  const q2 = await quoteCosts({ mint: "x", notionalUsd: 2.36, gm, fetchImpl: mkFetch(0.002) });
  near("a round trip under the pool fee is floored at the pool fee (price moved between quotes)", q2.routes[0].swapSide, 0.0115);
  const q3 = await quoteCosts({ mint: "x", notionalUsd: 2.36, gm, fetchImpl: mkFetch(0.09) });
  ok("impact the fees do not explain over 2.36%: skip", !q3.ok && /2\.36% cap/.test(q3.why), q3.why);
  const q4 = await quoteCosts({ mint: "x", notionalUsd: 2.36, gm, fetchImpl: mkFetch(0, 500) });
  ok("Jupiter down: no priced route = NO", !q4.ok && q4.why === "no priced route");
  ok("no recent trades: network cost unknown = NO", !(await quoteCosts({ mint: "x", notionalUsd: 2.36, gm: { ...gm, trades: [] }, fetchImpl: mkFetch(0.03) })).ok);
  ok("cost rule passes at 2% round trip", costRule({ low: 99, high: 200 }, 0.02).ok);
  ok("cost rule skips when costs break W >= 3|Λ|", !costRule({ low: 99, high: 200 }, 0.06).ok && /costs break/.test(costRule({ low: 99, high: 200 }, 0.06).why));
  const rec = JSON.parse(fs.readFileSync(path.join(HERE, "fixtures", "jupiter", "fee-quotes-2026-10-19.json"), "utf8"));
  ok("recorded live fee quotes kept as evidence", Object.keys(rec.quotes).length >= 4 && rec.solUsd > 0);
}

// =============================================================== lanes run concurrently
{
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const L = new Lanes();
  let fast = 0, slow = 0, bad = 0;
  L.add("fast", 50, async () => { fast++; }).add("slow", 50, async () => { slow++; await sleep(400); }).add("bad", 100, async () => { bad++; throw new Error("boom"); });
  const t0 = Date.now();
  await L.run({ until: Date.now() + 1000 });
  ok("a slow lane never blocks a fast one", fast >= 12 && slow <= 3, { fast, slow });
  ok("a lane that throws keeps its rhythm", bad >= 6 && L.stats().bad.errors === bad, L.stats());
  ok("lanes stop on time", Date.now() - t0 < 1700);
}

// =============================================================== live stub and read-only
{
  let msg = null;
  try { await execute({ side: "buy", mint: "x", usd: 1 }); } catch (e) { msg = e.message; }
  ok('execute() refuses: "live wallet not connected"', msg === "live wallet not connected");
  ok("allowlist: read endpoints only", allowed("/rrs/api/v1/trending_multichain") && allowed("/vas/api/v1/token_trades/sol/ESnW5ZbLmoEAg2QEMxnMsY9R3aS8Kw58HJacYURmpump") && !allowed("/api/v1/swap") && !allowed("/tx/api/v1/send_transaction") && !allowed("/defi/router/v1/sol/tx/submit_signed_transaction"));
  ok("web query copied from the page's own request", webQuery("https://gmgn.ai/api/v1/x?device_id=a&tab_id=b&fp_did=c&client_id=d&from_app=gmgn&app_ver=v1&tz_name=UTC&tz_offset=0&app_lang=en-US&os=web&worker=0&limit=5") === "device_id=a&tab_id=b&fp_did=c&client_id=d&from_app=gmgn&app_ver=v1&tz_name=UTC&tz_offset=0&app_lang=en-US&os=web&worker=0");
  const src = fs.readFileSync(path.join(HERE, "../src/trader/gmgn.mjs"), "utf8") + fs.readFileSync(path.join(HERE, "../src/trader/scan.mjs"), "utf8") + fs.readFileSync(path.join(HERE, "../src/trader/book.mjs"), "utf8") + fs.readFileSync(path.join(HERE, "../src/trader/fees.mjs"), "utf8");
  ok("no key, signing or order code in the trader", !/privateKey|secretKey|seed phrase|signTransaction|sendTransaction|Keypair|bs58/i.test(src));
}

// =============================================================== gate on recorded GMGN responses
const FX = path.join(HERE, "fixtures", "gmgn");
const rec = JSON.parse(fs.readFileSync(path.join(FX, "replay-2026-10-19.json"), "utf8"));
const toks = Object.entries(rec.tokens);
const nowSec0 = Math.floor(rec.recordedAt / 1000);
for (const [, t] of toks.slice(0, 3)) {
  const g = gate({ full: t.full, topBuyers: t.topBuyers, candles: t.candles.filter((c) => c.t + MIN <= rec.recordedAt), nowSec: nowSec0 });
  ok(`gate ${t.symbol}: 11 checks, each with a value`, g.checks.length === 11 && g.checks.every((c) => c.value !== undefined));
}
ok("prefilter reads trending rows", rec.trending.every((r) => typeof prefilter(r, nowSec0).ok === "boolean"));
ok("devSold reads holderInfo", devSold({ holders: { holderInfo: [{ wallet_address: "X", status: "sold" }] } }, "X") === true && devSold({ holders: { holderInfo: [] } }, "X") === null);
ok("volume rising", volumeRising(Array.from({ length: 30 }, (_, i) => ({ v: i }))).ok === true);
ok("missing data fails the gate", gate({ full: {}, topBuyers: null, candles: [], nowSec: nowSec0 }).pass === false);

// =============================================================== replay through the three lanes
async function replay({ openAll }) {
  const log = [];
  const dir = tmp();
  const memory = new Memory({ dir });
  const book = new Book({ start: 10, log: (e) => log.push(e) });
  book.onClose = (t) => memory.onTrade(t);
  let now = 0;
  const first = Math.min(...toks.map(([, t]) => t.candles[0].t));
  const born = (t) => Math.floor((t.candles[0].t - 20 * MIN) / 1000);
  const nowS = () => Math.floor(now / 1000);
  const src = {
    trending: async () => toks.filter(([, t]) => t.candles[0].t <= now).map(([a, t]) => ({ a, s: t.symbol, nm: t.symbol, ct: born(t), lq: 50_000, t10: 0.1, smt: 5, kol: 1, m_x: "https://x.com/i/status/2112253942247862395" })),
    fullInfo: async (addrs) => addrs.map((a) => {
      const f = JSON.parse(JSON.stringify(rec.tokens[a].full));
      f.creation_timestamp = born(rec.tokens[a]);
      if (openAll) {
        Object.assign(f, { liquidity: 50_000, top_10_holder_rate: "0.1", creator_hold_rate: "0", creator_address: "DEV" });
        f.security = { ...f.security, burn_status: "burn", renounced_mint: true, renounced_freeze_account: true, can_not_sell: 0, is_show_alert: false };
        f.trade_stat = { ...f.trade_stat, smart_wallets: 3, renowned_wallets: 1 };
      }
      return f;
    }),
    topBuyers: async (a) => (openAll ? { holders: { holderInfo: [{ wallet_address: "DEV", status: "hold" }] } } : rec.tokens[a].topBuyers),
    candles: async (a) => rec.tokens[a].candles.filter((c) => c.t <= now),
    solCandles: async () => Array.from({ length: 21 }, (_, i) => ({ t: now - (21 - i) * 5 * MIN, o: 105, h: 106, l: 104, c: 105, v: 1 })),
    gas: async () => ({ auto: "0.000244" }), prices: async () => [{ symbol: "SOL", price: "105" }],
    // narrative inputs: real recorded shapes, re-timed to the replay clock when forcing the path open
    trades: async () => (openAll ? [{ maker: "S1", event: "buy", timestamp: nowS() - 60, maker_tags: ["smart_degen"], gas_native: "0.00002" }, { maker: "S2", event: "buy", timestamp: nowS() - 120, maker_tags: ["renowned"], gas_native: "0.00004" }] : []),
    holderStat: async () => (openAll ? { smart_degen_count: 13, renowned_count: 5 } : null),
    community: async () => (openAll ? Array.from({ length: 13 }, () => ({ created_at: new Date(now - 60_000).toISOString() })) : []),
    callouts: async () => (openAll ? toks.flatMap(([a]) => Array.from({ length: 8 }, () => ({ call_token: a, create_time: now - 60_000, is_kol: true }))) : []),
    preview: async () => null,
    feeInfo: async () => ({ pool_fee_info_list: [{ fee_ratio: 0.0115 }], security: {} }),
  };
  const x = { tweet: async () => (openAll ? { likes: 89, replies: 34, blue: true, createdAt: now - 3600_000, text: "ai agent" } : null), search: null };
  const quote = async () => ({ ok: true, route: "jupiter", costSide: 0.012, costRt: 0.024, routes: [] });
  const sn = new Sniper({ src, book, memory, x, quote, log: (e) => log.push(e) });
  const last = Math.max(...toks.map(([, t]) => t.candles[t.candles.length - 1].t));
  let cycles = 0, maxOpen = 0;
  for (now = first + 31 * MIN; now <= last + MIN; now += MIN) {
    // the three lanes, each on the same simulated minute
    await Promise.all([sn.narrativeLane(now), sn.positionLane(now)]);
    await sn.scanLane(now);
    cycles++;
    maxOpen = Math.max(maxOpen, book.open.size);
  }
  return { book, log, cycles, maxOpen, memory, dir };
}
{
  const R = await replay({ openAll: true });
  const s = R.book.summary();
  const fires = R.log.filter((e) => e.type === "decision" && e.decision === "FIRE");
  console.log(`      replay (signals forced open): ${R.cycles} cycles, ${fires.length} FIRE decisions, ${s.trades} trades, ${s.wins} wins, balance $${s.balance}, max open ${R.maxOpen}, memory ${Math.round(R.memory.bytes() / 1024)} KB`);
  ok("replay ran every minute", R.cycles > 100);
  ok("replay: real candles produced FIRE decisions and armed ladders", fires.length > 0 && R.log.some((e) => e.type === "arm"));
  ok("every arm came from a FIRE decision", R.log.filter((e) => e.type === "arm").every((a) => a.decision));
  ok("replay made training trades", s.trades + s.open > 0, s);
  ok("every close has a reason, every fill its real cost", R.log.filter((e) => e.type === "close").every((e) => e.reason) && R.log.filter((e) => e.type === "fill").every((e) => e.costSide === 0.012 && e.cost > 0));
  ok("never more open than the win-streak slots allow", R.maxOpen <= 3);
  ok("the journal holds every decision with features", R.memory.journalLines().length > 10 && R.memory.journalLines().every((j) => j.reason && j.decision));
  ok("closed trades reached the memory", R.memory.stats().trades === s.trades);
  const R2 = await replay({ openAll: false });
  const s2 = R2.book.summary();
  console.log(`      replay (real recorded gate data): ${s2.trades} trades, decisions journaled ${R2.memory.journalLines().length}`);
  ok("real data, no narrative: the strict brain never fires", s2.trades === 0 && R2.log.filter((e) => e.type === "arm").length === 0);
  ok("and it says why for each candidate", R2.memory.journalLines().some((j) => /narrative|gate|swing|confluence|smartNow/.test(j.reason)));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
