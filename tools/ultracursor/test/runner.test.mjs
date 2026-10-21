// build 48: the runner signal and the auto-buy, the whole loop against the fake GMGN Instant-trade
// page in headless Chrome (test/fake-gmgn.mjs). No internet; GMGN's real DOM is not seen here.
//
//   TMPDIR=/tmp node test/runner.test.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Real, parseRealJson, AUTO_TP } from "../src/trader/real/real.mjs";
import { followSignal, mcOf, FOLLOW } from "../src/trader/real/runner.mjs";
import { createDoor, AUTO_MAX_SOL, AUTO_MAX_DAY, KEEP_MINTS } from "../src/trader/execute.mjs";
import { GmgnPanel } from "../src/trader/real/exec/gmgn-panel.mjs";
import { liteShape, Scalp } from "../src/trader/scalp.mjs";
import { rulesKey } from "../src/trader/exits.mjs";
import { startFakeGmgn, routeGmgn, launchChrome, mintOf, FakeChain, WALLET } from "./fake-gmgn.mjs";

const KILL = setTimeout(() => { console.log("FAIL  runner test timed out"); process.exit(1); }, 420_000);
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, x === undefined ? "" : typeof x === "string" ? x : JSON.stringify(x).slice(0, 700)); } };

const BUILD = 48;
const KIMCHI = "CSocnzcRpgSCr1naKcNTieWZUxb6rABe45j844m7pump";

// ---------------------------------------------------------------- candles
/** 34 market-cap candles: flat at `base`, then the last 5 climb to base*(1+move); last volume volX x. */
function runCandles({ base = 100_000, move = 0.40, volX = 5, green = true } = {}) {
  const cs = [];
  for (let i = 0; i < 29; i++) cs.push({ t: i * 60, o: base, h: base * 1.01, l: base * 0.99, c: base, v: 1000 });
  const end = base * (1 + move);
  for (let k = 0; k < 5; k++) {
    const o = base + ((end - base) * k) / 5, c = base + ((end - base) * (k + 1)) / 5;
    cs.push({ t: (29 + k) * 60, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1000 });
  }
  const L = cs[33];
  L.v = 1000 * volX;
  if (!green) { const x = L.o; L.o = L.c * 1.01; L.h = L.o; void x; }
  return cs;
}
function fibCandles() {
  const cs = [];
  for (let i = 0; i < 34; i++) {
    let o, c, h, l;
    if (i <= 20) { c = 100 + i * 2.5; o = c - 1; h = i === 20 ? 150 : c + 0.5; l = o - 0.5; }
    else if (i < 33) { c = 150 - (i - 20) * 2.2; o = c + 1; h = o + 0.5; l = c - 0.5; }
    else { o = 123; c = 125; h = 125.5; l = 122.5; }
    cs.push({ t: i * 60, o, h, l, c, v: 1000 });
  }
  return cs;
}

// ---------------------------------------------------------------- 1. the follow signal, pure
const ev = (move, { base = 150_000, green = true, row = {} } = {}) => { const cs = runCandles({ base, move: 0.05, green }); return { row: { a: "x", s: "KIM", ...row }, cs, sim: { entry: 100, last: 100 * (1 + move), move }, nowMs: 0 }; };
{
  const yes = followSignal(ev(0.35));
  ok("follow: sim +35%, mc $157k, last candle green -> follow", yes.ok && yes.mcFrom === "candles" && /^REAL follows symbiot · KIM \+35% in sim/.test(yes.why), yes);
  ok("follow: exactly +30% follows, +29% does not", followSignal(ev(0.30)).ok && !followSignal(ev(0.29)).ok);
  ok("follow: a red last candle (not rising) does not", !followSignal(ev(0.5, { green: false })).ok);
  ok("follow: mc $95k does not", !followSignal(ev(0.5, { base: 90_000 })).ok, followSignal(ev(0.5, { base: 90_000 })));
  ok("follow: row.mc wins over the candles", !followSignal(ev(0.5, { row: { mc: 50_000 } })).ok && followSignal(ev(0.5, { base: 0.0001, row: { usd_market_cap: 200_000 } })).ok && mcOf({ market_cap: "250000" }, []).mc === 250000);
  ok("follow: no sim position, no candles: no", !followSignal({ row: { a: "x" }, cs: runCandles() }).ok && !followSignal({ ...ev(0.5), cs: [] }).ok);
  ok("follow: R2 can raise the floors, never lower them", !followSignal(ev(0.4), { runnerMove: 0.5 }).ok && !followSignal(ev(0.25), { runnerMove: 0.1 }).ok && !followSignal(ev(0.5, { base: 90_000 }), { runnerMinMc: 10 }).ok);
  ok("defaults: 100k, +30%", FOLLOW.minMc === 100_000 && FOLLOW.minMove === 0.30);
}

// ---------------------------------------------------------------- 1b. symbiot shows every reprice (scalp.mjs onMove)
{
  const seen = [];
  const s = new Scalp({ src: { candles: async () => runCandles({ base: 140_000, move: 0.05 }).slice(-2) }, onMove: (e) => seen.push(e) });
  s.open.set("M1", { addr: "M1", symbol: "SIMRUN", cost: 1, side: 0.01, units: 1, entry: 100_000, last: 100_000, at: Date.now(), shape: [], combo: "x", lq: 50_000, ct: 1, hunt: true, peak: 0 });
  await s.positionLane(Date.now());
  const e = seen[0];
  ok("scalp positionLane calls onMove with the sim's entry, last and move", seen.length === 1 && e.row.a === "M1" && e.row.s === "SIMRUN" && e.row.lq === 50_000 && Math.abs(e.sim.move - 0.47) < 0.01 && e.cs.length === 2, e && { row: e.row, sim: e.sim });
  ok("and that sim position at +47%, mc $147k, green: REAL follows it", followSignal(e).ok, followSignal(e));
}

// ---------------------------------------------------------------- 2. real.json
{
  const base = { mode: "live", wallet: WALLET, selectorsFrom: "abcdef0123456789", exec: "instant", buyPreset: "0.01618" };
  ok("autoBuy defaults to false", parseRealJson(base).autoBuy === false);
  const c = parseRealJson({ ...base, autoBuy: true, keepMints: [KIMCHI] });
  ok("autoBuy true + keepMints parse", c.autoBuy === true && c.keepMints[0] === KIMCHI && !c.error, c);
  ok("autoBuy 'yes' (not a boolean) is PROBE", !!parseRealJson({ ...base, autoBuy: "yes" }).error);
  ok("autoBuy with exec panel is PROBE", !!parseRealJson({ ...base, exec: "panel", autoBuy: true }).error);
  ok("autoBuy with buyPreset 0.1 (over the 0.01618 cap) is PROBE", /at most/.test(parseRealJson({ ...base, buyPreset: "0.1", autoBuy: true }).error || ""));
  ok("autoBuy with buyPreset 0.01 (under the cap) parses", !parseRealJson({ ...base, buyPreset: "0.01", autoBuy: true }).error);
  ok("keepMints with a bad address is PROBE", !!parseRealJson({ ...base, keepMints: ["nope"] }).error);
  ok("autoMaxDay 5000 is cut to 1000; 3 stays 3", parseRealJson({ ...base, autoMaxDay: 5000 }).autoMaxDay === AUTO_MAX_DAY && parseRealJson({ ...base, autoMaxDay: 3 }).autoMaxDay === 3);
  ok("Kimchi is in the local keep list", KEEP_MINTS.includes(KIMCHI));
}

// ---------------------------------------------------------------- 3. the door, unit
{
  let T0 = 1000;
  const panel = { instantBuy: async () => ({ ok: true, clicked: true }), buy: async () => ({ ok: true, clicked: true }), instantSell: async () => ({ ok: true }), sell: async () => ({ ok: true }) };
  let ctx = { mode: "live", verify: { ok: true, at: 1000 }, auto: { on: true, used: 1, max: 10, ddOk: true }, keep: new Set() };
  const door = createDoor({ panel, now: () => T0, ctx: () => ctx });
  const sub = (x = {}) => ({ id: "i1", state: "APPROVED", mint: mintOf("door"), auto: true, runner: { why: "r" }, exec: "instant", preset: "0.01618", stakeSol: 0.01618, stakeUsd: 1.6, solUsd: 100, ...x });
  const thr = (f) => { try { f(); return null; } catch (e) { return e.message; } };
  ok("door: auto token for a runner auto intent", typeof door.mintAuto(sub()) === "string");
  ok("door: no auto token for a non-runner intent", /not a runner/.test(thr(() => door.mintAuto(sub({ auto: false, runner: null })))));
  ok("door: no auto token with autoBuy off", (ctx = { ...ctx, auto: { ...ctx.auto, on: false } }) && /autoBuy is off/.test(thr(() => door.mintAuto(sub()))));
  ctx = { ...ctx, auto: { on: true, used: 1, max: 10, ddOk: true } };
  ok("door: no auto token for a stake above 0.01618 SOL", /not the 0.01618 preset/.test(thr(() => door.mintAuto(sub({ preset: "0.02", stakeSol: 0.02 })))));
  ok("door: no auto token for the 11th auto-buy", /11 of 10/.test(thr(() => door.mintAuto({ ...sub() }, (ctx = { ...ctx, auto: { ...ctx.auto, used: 11 } })))) || /11 of 10/.test(thr(() => door.mintAuto(sub()))));
  ctx = { ...ctx, auto: { on: true, used: 1, max: 10, ddOk: false } };
  ok("door: no auto token 30% down on the day", /30% down/.test(thr(() => door.mintAuto(sub()))));
  ctx = { ...ctx, auto: { on: true, used: 1, max: 10, ddOk: true } };
  ok("door: no auto token for Kimchi", /keeps/.test(thr(() => door.mintAuto(sub({ mint: KIMCHI })))));
  ok("door: not LIVE, no auto token", /not LIVE/.test(thr(() => door.mintAuto(sub(), (ctx = { ...ctx, mode: "probe" }))) || "") || /not LIVE/.test(thr(() => door.mintAuto(sub())) || ""));
  ctx = { ...ctx, mode: "live" };
  const t = door.mintAuto(sub());
  let e1 = null; try { await door.execute("buy", sub({ auto: false, runner: null }), t, { exec: "instant" }); } catch (e) { e1 = e.message; }
  ok("door: an auto token can not buy a non-auto intent", /auto-buy: not a runner/.test(e1 || ""), e1);
  const t2 = door.mintAuto(sub());
  ctx = { ...ctx, auto: { ...ctx.auto, on: false } };
  let e2 = null; try { await door.execute("buy", sub(), t2, { exec: "instant" }); } catch (e) { e2 = e.message; }
  ok("door: autoBuy switched off between mint and click: refused", /autoBuy is off/.test(e2 || ""), e2);
  ctx = { ...ctx, auto: { ...ctx.auto, on: true } };
  const t3 = door.mint("i1");
  let e3 = null; try { await door.execute("buy", sub(), t3, { exec: "instant" }); } catch (e) { e3 = e.message; }
  ok("door: an auto intent with a card token is refused", /card token/.test(e3 || ""), e3);
  let e4 = null; try { await door.execute("sell", { ...sub(), state: "SELLING", mint: KIMCHI }, null, { exec: "instant" }); } catch (e) { e4 = e.message; }
  ok("door: Kimchi is never sold", /keeps/.test(e4 || ""), e4);
  const t5 = door.mintAuto(sub());
  const r5 = await door.execute("buy", sub(), t5, { exec: "instant" });
  ok("door: auto token + every cap: the buy goes to the panel once", r5 && r5.clicked === true);
  ok("caps: 0.01618 SOL and at most 1000 a day (build 51)", AUTO_MAX_SOL === 0.01618 && AUTO_MAX_DAY === 1000);
}

// ---------------------------------------------------------------- 4. the loop, in Chrome
let T = Date.UTC(2026, 9, 21, 9, 0, 0);
const now = () => T;
const sleep = async (ms) => { T += ms; await new Promise((r) => setTimeout(r, 5)); };
const CS = new Map(), mul = new Map();
const PX = 4.8e-5;
const src = {
  prices: async () => [{ symbol: "SOL", price: 100 }],
  candles: async (mint, tf, n = 34) => { const m = mul.get(mint) ?? 1; const cs = (CS.get(mint) || fibCandles()).map((x) => ({ ...x })); const L = cs[cs.length - 1]; L.c *= m; L.h = Math.max(L.h, L.c); L.l = Math.min(L.l, L.c); return cs.slice(-n); },
  feeInfo: async () => ({ security: { renounced_mint: true, renounced_freeze_account: true, can_not_sell: 0, buy_tax: "0", sell_tax: "0" }, pool_fee_info_list: [{ liquidity: 60000, fee_ratio: 0.0025 }] }),
  trending: async () => [{ a: mintOf("runner-probe") }],
};
const RULES = { sl: -0.15, crashMs: 0, crashMove: 0, deadMs: 0, deadMove: 0, trailFrom: 1, holdMs: 3_600_000 };
const sim = { cfg: { ...RULES }, proof: { [rulesKey(RULES)]: { rules: { ...RULES }, keys: {} } } };
function runnerPick(seed, mint = mintOf(seed)) {
  const cs = runCandles();
  CS.set(mint, cs);
  // symbiot's fake position: bought at $100k, now $140k (+40%) and rising (scalp.mjs onMove)
  return { row: { a: mint, s: "KIMLIKE", lq: 60000, ct: Math.floor(T / 1000) - 3600 }, cs: cs.map((x) => ({ ...x })).slice(-2), sim: { entry: 100_000, last: 140_000, move: 0.4, peak: 0.4, at: T - 60_000 }, nowMs: T };
}
function fibPick(seed, proven = false) {
  const mint = mintOf(seed);
  const row = { a: mint, s: "PEPE", lq: 60000, ct: Math.floor(T / 1000) - 600 };
  CS.set(mint, fibCandles());
  if (proven) {
    const combo = [...liteShape(row, T), "e:fib"].join("|");
    sim.proof[rulesKey(RULES)].keys[combo] = { 0.13: { n: 40, w: 36, net: 20, last: T, rt: 0.025 }, 0.21: { n: 40, w: 36, net: 20, last: T, rt: 0.025 }, 0.34: { n: 40, w: 36, net: 20, last: T, rt: 0.025 } };
  }
  return { row, cs: fibCandles(), nowMs: T };
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uc-runner-"));
const chain = new FakeChain({ sol: 0.15, solUsd: 100, now });
const srv = await startFakeGmgn({ chain, variant: "instant", pxOf: (m) => PX * (mul.get(m) ?? 1) });
const chrome = await launchChrome();

let answer = "skip", presses = 0;
const shown = [];
const cards = {
  showTradeCard: async (card, { mint }) => {
    shown.push(card);
    if (card.kind === "real-auto") return "ok";            // information only: never pressed, never mints
    if (answer === "buy") { presses++; return { choice: "buy", token: mint() }; }
    return answer;
  },
};
// build 48: Alex's one visible GMGN tab, plus gmgn.mjs's background read tab (never used for trades)
await routeGmgn(chrome.ctx, srv);
const readTab = await chrome.ctx.newPage();
await readTab.goto(`https://gmgn.ai/sol/token/${mintOf("read-tab")}`).catch(() => {});
const alexTab = chrome.ctx.pages().find((p) => p !== readTab);
await alexTab.goto("https://gmgn.ai/sol/token/" + mintOf("alex-home")).catch(() => {});
await alexTab.bringToFront();
const pagesAtStart = chrome.ctx.pages().length;
const panel = new GmgnPanel({ browser: chrome.browser, build: BUILD, dir, waitMs: 4000, now, visible: true, exclude: () => [readTab] });
const real = new Real({ dir, build: BUILD, sim, src, panel, walletFor: () => chain, cards, now, sleep });
const tick = async (adv = 1000) => { T += adv; await real.tick(); await real.settle(); };
const clicks = (re) => srv.clicks((e) => re.test(e.id || ""));
const BUY = /^ip\d$/, SELL = /^isp\d$/, DECOY = /^(decoy|dp\d)$/;
const nClicks = () => srv.clicks().length;

try {
  await tick();
  const hash = real.probeRep && real.probeRep.hash;
  ok("probe from build 48 ran, zero clicks", real.probeRep && real.probeRep.ok && real.probeRep.build === BUILD && nClicks() === 0, real.probeRep && real.probeRep.why);
  const CFG = { mode: "live", wallet: WALLET, selectorsFrom: hash, exec: "instant", buyPreset: "0.01618", keepMints: [mintOf("alex-keeps")], autoMaxDay: 10 };

  // ------------------------------------------------ autoBuy false: a runner still needs the card
  real.setConfig({ ...CFG });
  await tick(); await tick(6000);
  ok("LIVE (autoBuy off)", real.mode === "live", real.why);
  answer = "skip";
  real.onMove(runnerPick("r-card"));
  await tick();
  ok("autoBuy false + runner: a card (REAL buy · runner), skipped, zero clicks", shown.length === 1 && shown[0].kind === "real-buy" && shown[0].title === "REAL buy · follows symbiot · $KIMLIKE +40% in sim" && shown[0].lines.some((l) => /^REAL follows symbiot · KIMLIKE \+40% in sim · mc \$140k/.test(l)) && nClicks() === 0 && !real.st.position, shown[0]);
  ok("autoBuy false: no auto-buy counted", (real.st.auto && real.st.auto.n) === 0, real.st.auto);

  // ------------------------------------------------ autoBuy true + runner: one click, no press
  real.setConfig({ ...CFG, autoBuy: true });
  await tick(6000);
  const solBefore = chain.lamports;
  const pa = runnerPick("r-auto-1");
  real.onMove(pa);
  await tick();
  const autoCard = shown[shown.length - 1];
  ok("autoBuy true + runner: exactly one buy click on the in-window 0.01618, no card press", clicks(BUY).length === 1 && clicks(BUY)[0].name === "0.01618" && presses === 0 && clicks(DECOY).length === 0 && nClicks() === 1, { ev: srv.events, presses });
  ok("an informational card was shown: 'REAL auto-buy · runner', OK only", autoCard.kind === "real-auto" && autoCard.title === "REAL auto-buy · follows symbiot · $KIMLIKE +40% in sim" && autoCard.choices.length === 1 && autoCard.choices[0].id === "ok" && autoCard.lines.some((l) => /Auto-buy 1 of 10 today/.test(l)), autoCard);
  ok("stake: exactly 0.01618 SOL left the wallet", srv.buys.length === 1 && srv.buys[0].amount === "0.01618" && Math.abs((solBefore - chain.lamports) / 1e9 - 0.01618) < 1e-9, srv.buys);
  ok("position OPEN, auto, target +40%, trail from +25%", real.st.position && real.st.position.auto === true && real.st.position.target === AUTO_TP && real.st.position.rules.trailFrom === 0.25 && real.st.position.rules.sl === -0.15, real.st.position);
  const b = real.board();
  ok("board: auto 1 / 10, runner reason on the open position", b.auto.label === "1 / 10" && b.auto.on === true && /^REAL follows symbiot · KIMLIKE \+40% in sim/.test(b.open[0].runner) && /^REAL follows symbiot/.test(b.follow), { auto: b.auto, open: b.open });
  ok("status: cfg shows autoBuy and the keep list with Kimchi", real.status().cfg.autoBuy === true && real.status().cfg.keepMints.includes(KIMCHI));
  const wal = fs.readFileSync(path.join(dir, "real.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  ok("WAL: the auto count is written before the click", (() => { const i = wal.findIndex((l) => l.type === "real-card" && l.set.auto && l.set.auto.n === 1), j = wal.findIndex((l) => l.type === "real-click"); return i >= 0 && j > i; })(), wal.map((l) => l.type));

  // one position at a time: another runner while this one is open
  real.onMove(runnerPick("r-while-open"));
  await tick();
  ok("one open real position at a time: a second runner is not bought", clicks(BUY).length === 1, srv.buys.length);

  // ------------------------------------------------ exits: +40% take profit
  mul.set(pa.row.a, 1.45);
  await tick();
  ok("+45% on an auto position: one 100% sell click ('+40%')", clicks(SELL).length === 1 && clicks(SELL)[0].name === "100%" && /\+40%/.test(real.st.position ? real.st.position.why : real.st.steps.at(-1).why), real.st.position || real.st.steps.at(-1));
  await tick(21_000);
  ok("closed as a win", !real.st.position && real.st.wins === 1, { pos: real.st.position, wins: real.st.wins });

  // ------------------------------------------------ exits: the trailing give-back
  T += 60_000; await tick(6000);
  const pt = runnerPick("r-auto-trail");
  real.onMove(pt);
  await tick();
  ok("second auto-buy: one more buy click, still no press", clicks(BUY).length === 2 && presses === 0 && real.st.position && real.st.position.mint === pt.row.a, srv.buys.length);
  mul.set(pt.row.a, 1.30); await tick();
  ok("+30% (under +40%): held", real.st.position && real.st.position.state === "OPEN" && clicks(SELL).length === 1);
  mul.set(pt.row.a, 1.14); await tick();
  ok("back to +14% after a +30% peak: one sell click ('gave back half of +30%')", clicks(SELL).length === 2 && /gave back half of \+30%/.test(real.st.position ? real.st.position.why : real.st.steps.at(-1).why), real.st.position || real.st.steps.at(-1));
  await tick(21_000);
  ok("closed", !real.st.position);

  // ------------------------------------------------ non-runner: proof + card (build 51: with autoBuy on a fresh pick is a snipe,
  // tested in snipe.test.mjs; here autoBuy is off for the proof and card path)
  real.setConfig({ ...CFG });
  T += 60_000; await tick(6000);
  const before = nClicks(), shownBefore = shown.length;
  real.onPick(fibPick("fib-unproven"));
  await tick();
  ok("non-runner, no proof, autoBuy on: skipped at d, no card, zero clicks", nClicks() === before && shown.length === shownBefore, shown.slice(shownBefore));
  answer = "skip";
  real.onPick(fibPick("fib-proven", true));
  await tick();
  ok("non-runner, proven, autoBuy on: a normal card (REAL buy · step), skipped, zero clicks", shown.length === shownBefore + 1 && shown.at(-1).kind === "real-buy" && /step/.test(shown.at(-1).title) && nClicks() === before, shown.at(-1));

  // ------------------------------------------------ keepMints: never bought
  const kc = shown.length;
  real.onMove(runnerPick("kimchi", KIMCHI));
  await tick();
  real.onMove(runnerPick("alex-keeps"));
  await tick();
  ok("Kimchi and a real.json keepMints coin: never bought, no card, zero clicks", shown.length === kc && nClicks() === before && !real.st.position);

  // ------------------------------------------------ the 11th auto-buy is refused (build 51: autoMaxDay 10 here)
  real.setConfig({ ...CFG, autoBuy: true, autoMaxDay: 10 });
  await tick(6000);
  real.st.auto.n = 10;
  real.onMove(runnerPick("r-eleventh"));
  await tick();
  ok("11th auto-buy: not bought (falls back to Alex's card, skipped), zero clicks", nClicks() === before && shown.at(-1).kind === "real-buy" && /follows symbiot/.test(shown.at(-1).title) && real.st.auto.n === 10, { n: real.st.auto.n, last: shown.at(-1) && shown.at(-1).kind });
  ok("board: auto 10 / 10", real.board().auto.label === "10 / 10");
  real.st.auto.n = 2;

  // ------------------------------------------------ 30% daily drawdown
  real.st.auto.startSol = (chain.lamports / 1e9) / 0.69;
  real.onMove(runnerPick("r-drawdown"));
  await tick();
  ok("SOL 31% under the day's start: no auto-buy, zero clicks", nClicks() === before && shown.at(-1).kind === "real-buy" && real.board().auto.ddOk === false, real.board().auto);

  // ------------------------------------------------ a new UTC day resets the count and the start
  T = Date.UTC(2026, 9, 22, 0, 0, 30);
  await tick(6000);
  ok("new UTC day: count 0, start = today's SOL", real.st.auto.day === "2026-10-22" && real.st.auto.n === 0 && Math.abs(real.st.auto.startSol - chain.lamports / 1e9) < 1e-9 && real.board().auto.ddOk === true, real.st.auto);
  const pd = runnerPick("r-day2");
  real.onMove(pd);
  await tick();
  ok("day 2: the runner is auto-bought again (one more click, still no press)", clicks(BUY).length === 3 && presses === 0 && real.st.position && real.st.position.mint === pd.row.a, srv.buys.length);
  ok("stake never above the preset: every buy was 0.01618", srv.buys.every((x) => x.amount === "0.01618"));
  real.stopManual(); await tick(); await tick(21_000);
  ok("manual stop sells it", !real.st.position && clicks(SELL).length === 3);

  // ------------------------------------------------ a preset over the cap with autoBuy: PROBE
  real.setConfig({ ...CFG, autoBuy: true, buyPreset: "0.1" });
  await tick(6000);
  ok("autoBuy with buyPreset 0.1: real.json refused, PROBE", real.mode === "probe" && /at most/.test(real.why), real.why);
  ok("visible tab: every trade and the probe ran on Alex's tab, no extra tab ever opened, read tab untouched", panel.page === alexTab && chrome.ctx.pages().length === pagesAtStart && readTab.url().includes(mintOf("read-tab")), { pages: chrome.ctx.pages().length, pagesAtStart, same: panel.page === alexTab });
  ok("totals: 3 buys, 3 sells, 0 decoys, 0 presses", clicks(BUY).length === 3 && clicks(SELL).length === 3 && clicks(DECOY).length === 0 && presses === 0);
  await real.stop();
} finally {
  await chrome.close();
  await srv.close();
  clearTimeout(KILL);
}
console.log(`\nrunner.test.mjs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
