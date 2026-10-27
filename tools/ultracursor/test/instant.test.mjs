// build 45: GMGN Instant trade, the whole real loop, headless Chrome over its DevTools port.
//
// A local fake token page reproduces what the build 44 probe read on Alex's Mac: one "Instant
// trade" window of clickable DIVs (no button role), a header SOL chip (GMGN's built-in wallet, no
// address, no Phantom), a " Instant trade" toggle, and two decoys that must never be clicked: a
// "0.01618" outside the window and a DryFlip-like panel with its own Buy / 0.01618 / Sell / 100%.
// Every click on the page is reported to the test server; buys and sells move a FakeChain. This
// proves the probe and the executor against that structure only: GMGN's real DOM is
// Cloudflare-blocked from here. No internet: gmgn.ai is routed to the local server.
//
//   TMPDIR=/tmp node test/instant.test.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Real, parseRealJson } from "../src/trader/real/real.mjs";
import { GmgnPanel } from "../src/trader/real/exec/gmgn-panel.mjs";
import { liteShape } from "../src/trader/scalp.mjs";
import { rulesKey } from "../src/trader/exits.mjs";
import { startFakeGmgn, routeGmgn, launchChrome, mintOf, FakeChain, WALLET } from "./fake-gmgn.mjs";

const KILL = setTimeout(() => { console.log("FAIL  instant test timed out"); process.exit(1); }, 420_000);
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, x === undefined ? "" : typeof x === "string" ? x : JSON.stringify(x).slice(0, 700)); } };

const BUILD = 45;
let T = Date.UTC(2026, 9, 21, 9, 0, 0);
const now = () => T;
const sleep = async (ms) => { T += ms; await new Promise((r) => setTimeout(r, 5)); };

// ---------------------------------------------------------------- unit: real.json
{
  const base = { mode: "live", wallet: WALLET, selectorsFrom: "abcdef0123456789" };
  ok("exec defaults to panel", parseRealJson(base).exec === "panel");
  const c = parseRealJson({ ...base, exec: "instant", buyPreset: "0.01618" });
  ok("exec instant + buyPreset parse", c.exec === "instant" && c.buyPreset === "0.01618" && !c.error, c);
  ok("instant without buyPreset is PROBE", parseRealJson({ ...base, exec: "instant" }).error && parseRealJson({ ...base, exec: "instant" }).mode === "probe");
  ok("a numeric buyPreset (not text) is PROBE", !!parseRealJson({ ...base, exec: "instant", buyPreset: 0.01618 }).error);
  ok("buyPreset 'Max', '50%', '-1', '1e3', '' are PROBE", ["Max", "50%", "-1", "1e3", "", "0"].every((p) => parseRealJson({ ...base, exec: "instant", buyPreset: p }).error));
  ok("an unknown exec is PROBE", !!parseRealJson({ ...base, exec: "fast" }).error);
}

// ---------------------------------------------------------------- the harness
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
const CANDLES = fibCandles();
const mul = new Map();
const PX = 4.8e-5;
const src = {
  prices: async () => [{ symbol: "SOL", price: 100 }],
  candles: async (mint, tf, n = 34) => { const m = mul.get(mint) ?? 1; const cs = CANDLES.map((x) => ({ ...x })); const L = cs[cs.length - 1]; L.c *= m; L.h = Math.max(L.h, L.c); L.l = Math.min(L.l, L.c); return cs.slice(-n); },
  feeInfo: async () => ({ security: { renounced_mint: true, renounced_freeze_account: true, can_not_sell: 0, buy_tax: "0", sell_tax: "0" }, pool_fee_info_list: [{ liquidity: 60000, fee_ratio: 0.0025 }] }),
  trending: async () => [{ a: mintOf("instant-probe") }],
};
const RULES = { sl: -0.15, crashMs: 0, crashMove: 0, deadMs: 0, deadMove: 0, trailFrom: 1, holdMs: 3_600_000 };
const sim = { cfg: { ...RULES }, proof: { [rulesKey(RULES)]: { rules: { ...RULES }, keys: {} } } };
function pickOf(seed) {
  const mint = mintOf(seed);
  const row = { a: mint, s: "PEPE", lq: 60000, ct: Math.floor(T / 1000) - 600 };
  const combo = [...liteShape(row, T), "e:fib"].join("|");
  const keys = sim.proof[rulesKey(RULES)].keys;
  keys[combo] = { 0.13: { n: 40, w: 36, net: 20, last: T, rt: 0.025 }, 0.21: { n: 40, w: 36, net: 20, last: T, rt: 0.025 }, 0.34: { n: 40, w: 36, net: 20, last: T, rt: 0.025 } };
  return { row, cs: CANDLES.map((x) => ({ ...x })), nowMs: T };
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uc-instant-"));
const chain = new FakeChain({ sol: 0.15, solUsd: 100, now });
const srv = await startFakeGmgn({ chain, variant: "instant", pxOf: (m) => PX * (mul.get(m) ?? 1) });
const chrome = await launchChrome();

let answer = "skip";
const shown = [];
let realRef = null;
const cards = {
  showTradeCard: async (card, { mint }) => {
    shown.push(card);
    if (answer === "buy") return { choice: "buy", token: mint() };
    if (answer === "double") {
      // a second press arrives first: it buys; the card's own press must then do nothing
      const first = realRef.decide(card.intentId, "buy", mint());
      const second = realRef.decide(card.intentId, "buy", mint());
      await Promise.all([first, second]);
      return { choice: "buy", token: mint() };
    }
    return answer;                                               // "skip" | "expired"
  },
};
const newReal = () => {
  const panel = new GmgnPanel({ browser: chrome.browser, build: BUILD, dir, waitMs: 4000, now });
  const r = new Real({ dir, build: BUILD, sim, src, panel, walletFor: () => chain, cards, now, sleep });
  realRef = r;
  return r;
};
const tick = async (r, adv = 1000) => { T += adv; await r.tick(); await r.settle(); };
// build 55: the probe opens the Instant window with a trusted toggle click (trades nothing): only TOGGLE counts it
const clicks = (re) => srv.clicks((e) => e.trusted && re.test(e.id || "") && (re === TOGGLE || e.id !== "itoggle"));
const BUY = /^ip\d$/, DECOY = /^(decoy|dp\d)$/, SELL = /^isp\d$/, TOGGLE = /^itoggle$/;

try {
  await routeGmgn(chrome.ctx, srv);
  let real = newReal();

  // ---------------------------------------------------------------- 1. the probe, zero clicks
  await tick(real);
  const rep = real.probeRep;
  ok("probe: ran and is ok on the Instant-trade page (no trade box needed)", rep && rep.ok === true && rep.build === BUILD && !rep.tradeBox, rep && { ok: rep.ok, why: rep.why });
  ok("probe: the Instant-trade window is found and open", rep.instant && rep.instant.open === true && rep.instant.candidates === 1, rep.instant);
  ok("probe: buy presets are exactly the in-window clickable ones", JSON.stringify(rep.instant.buyPresets) === JSON.stringify(["0.01618", "0.1", "0.5", "1"]), rep.instant.buyPresets);
  ok("probe: 0.00001 (not clickable) is not a preset", !rep.instant.buyPresets.includes("0.00001") && rep.instant.notClickable.includes("0.00001"), rep.instant);
  ok("probe: sell percentages 10/25/50/100%", JSON.stringify(rep.instant.sellPcts) === JSON.stringify(["10%", "25%", "50%", "100%"]), rep.instant.sellPcts);
  ok("probe: the toggle ' Instant trade' is reported", rep.instant.toggle && rep.instant.toggle.role === "button", rep.instant.toggle);
  ok("probe: walletKind gmgn from the header chip, no Phantom", rep.walletKind === "gmgn" && rep.chipSol === 0.15 && rep.walletEvidence.some((e) => /header balance chip: 0.150 SOL/.test(e)), { k: rep.walletKind, c: rep.chipSol, e: rep.walletEvidence });
  ok("probe: ZERO clicks and ZERO inputs reached the page", srv.events.length === 0 && rep.inputs === 0, srv.events);
  const hash = rep.hash;

  // a closed window: the probe says so and is not ok (no clicks to open it)
  srv.variant = "instantClosed";
  const pclosed = await real.panel.probe(`https://gmgn.ai/sol/token/${mintOf("closed-probe")}`);
  ok("probe: a closed window is opened by a trusted toggle click, then ok, no trade clicks", pclosed.instant.open === true && pclosed.ok === true && srv.events.every((e) => e.id === "itoggle"), { i: pclosed.instant, ok: pclosed.ok, why: pclosed.why, ev: srv.events });
  srv.variant = "instant";

  // ---------------------------------------------------------------- 2. live is off by default
  real.onPick(pickOf("would-1"));
  await tick(real);
  ok("no real.json: PROBE, no wallet, no card, zero clicks", real.mode === "probe" && !real.wallet && shown.length === 0 && srv.events.filter((e) => e.trusted && e.id !== "itoggle").length === 0, { mode: real.mode, why: real.why, would: real.would });
  real.setConfig({ mode: "probe", wallet: WALLET, selectorsFrom: hash, exec: "instant", buyPreset: "0.01618" });
  real.onPick(pickOf("would-2"));
  await tick(real); await tick(real);
  ok("real.json mode probe: still PROBE, 'would buy' only, zero clicks", real.mode === "probe" && real.would.n === 1 && shown.length === 0 && srv.events.filter((e) => e.trusted && e.id !== "itoggle").length === 0, { why: real.why, would: real.would });

  // ---------------------------------------------------------------- 3. live
  real.setConfig({ mode: "live", wallet: WALLET, selectorsFrom: hash, exec: "instant", buyPreset: "0.01618" });
  await tick(real); await tick(real, 6000);
  ok("LIVE with instant: probe from build 45, window + preset + gmgn wallet + chip = chain SOL", real.mode === "live", { why: real.why, verify: real.verify });
  ok("going LIVE clicked nothing", srv.events.filter((e) => e.type === "click" && e.trusted && e.id !== "itoggle").length === 0, srv.events);

  // a preset bigger than the step's stake: skipped, zero clicks
  real.setConfig({ mode: "live", wallet: WALLET, selectorsFrom: hash, exec: "instant", buyPreset: "1" });
  const big = await real.consider(pickOf("big-1"), T);
  ok("preset 1 SOL ($100) over the $5.73 stake: skipped (g), no card, no click", big.ok === false && big.letter === "g" && /more than the step/.test(big.why) && shown.length === 0 && clicks(/./).length === 0, big);
  // a preset that is not in the probe report: PROBE
  real.setConfig({ mode: "live", wallet: WALLET, selectorsFrom: hash, exec: "instant", buyPreset: "0.2" });
  await tick(real, 6000);
  ok("preset 0.2 is not in the probe report: PROBE", real.mode === "probe" && /0\.2 is not in the probe report/.test(real.why), real.why);
  real.setConfig({ mode: "live", wallet: WALLET, selectorsFrom: hash, exec: "instant", buyPreset: "0.01618" });
  await tick(real, 6000);
  ok("back to 0.01618: LIVE", real.mode === "live", real.why);

  // ---------------------------------------------------------------- 4. denied and timed out
  answer = "skip";
  real.onPick(pickOf("deny-1"));
  await tick(real);
  ok("card shown: 'Spend 0.01618 SOL ($1.62)' and 'Buy 0.01618 SOL'", shown.length === 1 && shown[0].lines.some((l) => /^Spend 0\.01618 SOL \(\$1\.62\)/.test(l)) && shown[0].choices[0].label === "Buy 0.01618 SOL", shown[0]);
  ok("denied: zero clicks, intent SKIPPED", clicks(/./).length === 0 && !real.st.intent && !real.st.position, srv.events);
  answer = "expired";
  real.onPick(pickOf("timeout-1"));
  await tick(real);
  ok("timed out: zero clicks, EXPIRED", shown.length === 2 && clicks(/./).length === 0 && real.st.counters.expired === 1 && !real.st.position, real.st.counters);

  // ---------------------------------------------------------------- 5. approved: one buy click
  answer = "buy";
  const p1 = pickOf("buy-1");
  real.onPick(p1);
  const solBefore = chain.lamports;
  await tick(real);
  ok("approved: exactly one buy click, on the in-window 0.01618", clicks(BUY).length === 1 && clicks(BUY)[0].id === "ip0" && clicks(BUY)[0].name === "0.01618" && clicks(BUY)[0].trusted === true, srv.events);
  ok("no decoy (outside 0.01618, DryFlip) and no toggle was clicked", clicks(DECOY).length === 0 && clicks(/./).length === 1, srv.events);
  ok("the chain bought exactly 0.01618 SOL", srv.buys.length === 1 && srv.buys[0].amount === "0.01618" && Math.abs((solBefore - chain.lamports) / 1e9 - 0.01618) < 1e-9, srv.buys);
  ok("position OPEN, exec instant, ledger records 0.01618 SOL", real.st.position && real.st.position.state === "OPEN" && real.st.position.exec === "instant" && Math.abs(real.st.position.buy.solIn - 0.01618) < 1e-9, real.st.position);
  ok("the panel's own record: one instantBuy click", real.panel.clicks.filter((c) => c.what === "instantBuy").length === 1 && real.panel.clicks.length === 1, real.panel.clicks);
  for (let i = 0; i < 4; i++) await tick(real);
  ok("ticks later: still one buy click (never re-clicked)", clicks(BUY).length === 1, srv.events);

  // ---------------------------------------------------------------- 6. target: one 100% sell click
  mul.set(p1.row.a, 1.25);
  await tick(real);
  ok("+25% (target +21%): exactly one sell click, on the window's 100%", clicks(SELL).length === 1 && clicks(SELL)[0].id === "isp3" && clicks(SELL)[0].name === "100%", srv.events);
  await tick(real, 21_000);
  ok("the position closed as a win, tokens gone, still one sell click", !real.st.position && real.st.wins === 1 && real.st.step.no === 2 && (chain.tok.get(p1.row.a) || 0n) === 0n && clicks(SELL).length === 1, { pos: real.st.position, wins: real.st.wins, step: real.st.step });
  ok("still no decoy click", clicks(DECOY).length === 0, srv.events);

  // ---------------------------------------------------------------- 7. double approve: one click
  T += 60_000; await tick(real, 6000);
  answer = "double";
  const p2 = pickOf("double-1");
  real.onPick(p2);
  await tick(real);
  ok("two presses on one card: exactly one more buy click", clicks(BUY).length === 2 && srv.buys.length === 2 && real.st.position && real.st.position.mint === p2.row.a, { buys: srv.buys.length, ev: srv.events.filter((e) => e.type === "click") });

  // ---------------------------------------------------------------- 8. restart mid-position: no re-buy
  await real.stop();
  real = newReal();
  real.setConfig({ mode: "live", wallet: WALLET, selectorsFrom: hash, exec: "instant", buyPreset: "0.01618" });
  for (let i = 0; i < 3; i++) await tick(real);
  ok("restart: the position is back OPEN, zero new buy clicks", real.st.position && real.st.position.state === "OPEN" && real.st.position.mint === p2.row.a && clicks(BUY).length === 2 && srv.buys.length === 2, { pos: real.st.position && real.st.position.state, buys: srv.buys.length });
  mul.set(p2.row.a, 0.8);
  await tick(real);
  ok("-20% (stop -15%): exactly one more sell click, the window's 100%", clicks(SELL).length === 2 && clicks(SELL)[1].id === "isp3", srv.events.filter((e) => e.type === "click"));
  await tick(real, 21_000);
  ok("closed as a loss; the step repeats, never a bigger stake", !real.st.position && real.st.losses === 1 && real.st.step.no === 2 && real.st.step.attempt === 2 && real.st.afterLoss === true, { L: real.st.losses, step: real.st.step });

  // ---------------------------------------------------------------- 9. window closed: toggle, then buy
  T += 60_000;
  await tick(real, 6000);
  ok("LIVE again after the restart (fresh verify)", real.mode === "live", { why: real.why, halted: real.st.halted, paused: real.st.paused });
  srv.variant = "instantClosed";
  answer = "buy";
  const p3 = pickOf("closed-1");
  real.onPick(p3);
  const before3 = srv.events.filter((e) => e.type === "click").length;
  await tick(real);
  const new3 = srv.events.filter((e) => e.type === "click").slice(before3);
  ok("window closed: one toggle click, then one buy click on the in-window preset", new3.length === 2 && new3[0].id === "itoggle" && new3[1].id === "ip0" && srv.buys.length === 3, new3);
  ok("position OPEN on the third coin", real.st.position && real.st.position.mint === p3.row.a && real.st.position.state === "OPEN", real.st.position);
  real.stopManual();
  await tick(real);
  await tick(real, 21_000);
  ok("manual stop: one 100% sell click, closed", clicks(SELL).length === 3 && !real.st.position, { pos: real.st.position, sells: clicks(SELL).length });

  // ---------------------------------------------------------------- 10. another wallet in GMGN: no click
  T += 60_000; srv.variant = "instant"; srv.chip = "0.900";
  await tick(real, 6000);
  const before10 = srv.events.filter((e) => e.type === "click").length, stale10 = real.st.counters.stale;
  real.onPick(pickOf("otherwallet-1"));
  await tick(real);
  ok("GMGN's header shows 0.900 SOL, the chain 0.15: STALE, zero clicks", srv.events.filter((e) => e.type === "click").length === before10 && real.st.counters.stale === stale10 + 1 && !real.st.position, { stale: real.st.counters.stale, ev: srv.events.slice(-3) });
  srv.chip = null;

  // ---------------------------------------------------------------- totals
  ok("in the whole run: 3 buy clicks, 3 sell clicks, 1 toggle, 0 decoys, every click trusted",
    clicks(BUY).length === 3 && clicks(SELL).length === 3 && clicks(TOGGLE).length >= 1 && clicks(DECOY).length === 0 && srv.clicks().filter((e) => !e.trusted).every((e) => e.id === "itoggle"), srv.events.filter((e) => e.type === "click"));
  const wal = fs.readFileSync(path.join(dir, "real.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  ok("every buy click has a real-click WAL line before it (3)", wal.filter((l) => l.type === "real-click").length === 3, wal.map((l) => l.type));
  await real.stop();
} finally {
  await chrome.close();
  await srv.close();
  clearTimeout(KILL);
}
console.log(`\ninstant.test.mjs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
