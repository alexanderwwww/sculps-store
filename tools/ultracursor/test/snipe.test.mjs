// build 52: the last build. The real trader against the fake GMGN Instant-trade page in headless
// Chrome (test/fake-gmgn.mjs), driven through its own loop:
//   - ONE tab: every other gmgn.ai tab is closed, Alex's other tabs stay, no page is ever opened
//     (probe, verify, buys, sells and gmgn.mjs's reads all in that tab)
//   - selectorsFrom "auto": LIVE from the newest usable probe of this build, no hash by hand
//   - the SOL check reads the window's Buy line when GMGN's header chip shows 0
//   - several positions at once, 2 entries a minute, maxOpen and the free SOL cap them
//   - new creations are sniped (autoBuy on), Kimchi never, a restart never double-buys
//   - every buy and sell is the visible hand gliding to 0.01618 / 100% in the window
//   - a slow page cannot keep the probe past its limit
//
//   TMPDIR=/tmp node test/snipe.test.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Real, parseRealJson, MAX_OPEN_DEFAULT, PER_MIN_DEFAULT, AUTO_DAY_DEFAULT } from "../src/trader/real/real.mjs";
import { GmgnPanel, TRADE_SPEED, PROBE_WAIT_MS } from "../src/trader/real/exec/gmgn-panel.mjs";
import { OneTab } from "../src/trader/onetab.mjs";
import { Gmgn } from "../src/trader/gmgn.mjs";
import { rulesKey } from "../src/trader/exits.mjs";
import { startFakeGmgn, routeGmgn, launchChrome, mintOf, FakeChain, WALLET } from "./fake-gmgn.mjs";

const KILL = setTimeout(() => { console.log("FAIL  snipe test timed out"); process.exit(1); }, 420_000);
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, x === undefined ? "" : typeof x === "string" ? x : JSON.stringify(x).slice(0, 700)); } };

const BUILD = 52;
const KIMCHI = "CSocnzcRpgSCr1naKcNTieWZUxb6rABe45j844m7pump";

// ---------------------------------------------------------------- real.json, pure
{
  const base = { mode: "live", wallet: WALLET, exec: "instant", buyPreset: "0.01618", autoBuy: true };
  const c = parseRealJson(base);
  ok("instant with no selectorsFrom: 'auto'", c.selectorsFrom === "auto" && !c.error, c);
  ok("selectorsFrom 'auto' parses; 'nope' is PROBE", parseRealJson({ ...base, selectorsFrom: "auto" }).selectorsFrom === "auto" && !!parseRealJson({ ...base, selectorsFrom: "nope" }).error);
  ok("maxOpen 1-20, perMin above 0 up to 12", parseRealJson({ ...base, maxOpen: 2, perMin: 2 }).maxOpen === 2 && !!parseRealJson({ ...base, maxOpen: 0 }).error && !!parseRealJson({ ...base, maxOpen: 21 }).error && !!parseRealJson({ ...base, perMin: 13 }).error);
  ok("defaults: 2 open, 2 a minute, 300 a day", MAX_OPEN_DEFAULT === 2 && PER_MIN_DEFAULT === 2 && AUTO_DAY_DEFAULT === 300);
  ok("the hand on a trade: 6 x the 6.47 trader pace", Math.abs(TRADE_SPEED - 38.82) < 1e-9);
}

// ---------------------------------------------------------------- the loop, in Chrome
let T = Date.UTC(2026, 9, 21, 9, 0, 0);
const now = () => T;
const sleep = async (ms) => { T += ms; await new Promise((r) => setTimeout(r, 5)); };
const mul = new Map();
const PX = 4.8e-5;
function candles() {
  const cs = [];
  for (let i = 0; i < 34; i++) cs.push({ t: i * 60, o: 100, h: 101, l: 99, c: 100, v: 1000 });
  return cs;
}
const src = {
  prices: async () => [{ symbol: "SOL", price: 100 }],
  candles: async (mint, tf, n = 34) => { const m = mul.get(mint) ?? 1; const cs = candles(); const L = cs[cs.length - 1]; L.c *= m; L.h = Math.max(L.h, L.c); L.l = Math.min(L.l, L.c); return cs.slice(-n); },
  feeInfo: async () => ({ security: { renounced_mint: true, renounced_freeze_account: true, can_not_sell: 0, buy_tax: "0", sell_tax: "0" }, pool_fee_info_list: [{ liquidity: 60000, fee_ratio: 0.0025 }] }),
  trending: async () => [{ a: mintOf("probe-coin") }],
};
const RULES = { sl: -0.15, crashMs: 0, crashMove: 0, deadMs: 0, deadMove: 0, trailFrom: 1, holdMs: 3_600_000 };
const sim = { cfg: { ...RULES }, proof: { [rulesKey(RULES)]: { rules: { ...RULES }, keys: {} } } };
let seedN = 0;
/** A fresh coin symbiot just picked (scalp.mjs onPick): no proof, no Fibonacci pocket. */
const pickOf = (mint = mintOf(`new-${++seedN}`)) => ({ row: { a: mint, s: `NEW${seedN}`, lq: 60000, mc: 60000, ct: Math.floor(T / 1000) - 60 }, cs: candles(), nowMs: T });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uc-snipe-"));
const chain = new FakeChain({ sol: 0.07, solUsd: 100, now });
const srv = await startFakeGmgn({ chain, variant: "instant", pxOf: (m) => PX * (mul.get(m) ?? 1) });
srv.chip = "0";                                   // GMGN's header chip still loading: 0
const chrome = await launchChrome();

try {
  // ---------------------------------------------------------------- one tab
  await routeGmgn(chrome.ctx, srv);
  const first = chrome.ctx.pages()[0];
  await first.goto("data:text/html,<title>Alex's own tab</title>alex").catch(() => {});
  const gmTabs = [];
  for (const s of ["trenches", "alon", "click"]) { const p = await chrome.ctx.newPage(); await p.goto(`https://gmgn.ai/sol/token/${mintOf(s)}`).catch(() => {}); gmTabs.push(p); }
  await gmTabs[1].bringToFront();
  const tabs = new OneTab(chrome.browser);
  const closed = await tabs.enforce();
  const keep = await tabs.get();
  const alive = chrome.ctx.pages();
  ok("one tab: 3 gmgn.ai tabs -> 1 (the visible one), Alex's non-gmgn tab kept", closed === 2 && alive.length === 2 && alive.includes(first) && alive.includes(keep) && keep === gmTabs[1], { closed, n: alive.length, keepIsVisible: keep === gmTabs[1] });

  // from here no page may be opened by anything
  let opened = 0;
  chrome.ctx.on("page", () => { opened++; });

  // gmgn.mjs reads in that tab: attach opens no page
  const gm = new Gmgn();
  await gm.attach(chrome.browser, { tab: () => tabs.get() });
  ok("gmgn.mjs attach in one-tab mode: no page opened, the read page is the one tab", opened === 0 && gm.page === keep && chrome.ctx.pages().length === 2, { opened, same: gm.page === keep });
  await gm.close();
  ok("gmgn.mjs close never closes the one tab", !keep.isClosed());

  // the hand: every trade click glides there first
  const glides = [];
  const ui = { hover: async (page, loc, opt) => { glides.push({ text: (await loc.innerText().catch(() => "")).trim(), speed: opt && opt.speed, same: page === keep }); } };
  const panel = new GmgnPanel({ browser: chrome.browser, build: BUILD, dir, waitMs: 4000, now, visible: true, newPage: () => tabs.get(), ui });
  const shown = [];
  const cards = { showTradeCard: async (card) => { shown.push(card); return card.kind === "real-auto" ? "ok" : "skip"; } };
  const mk = () => new Real({ dir, build: BUILD, sim, src, panel, walletFor: () => chain, cards, now, sleep });
  let real = mk();
  const tick = async (adv = 1000) => { T += adv; await real.tick(); await real.settle(); };
  const clicks = (re) => srv.clicks((e) => e.trusted && re.test(e.id || ""));
  const BUY = /^ip\d$/, SELL = /^isp\d$/, DECOY = /^(decoy|dp\d)$/;

  await tick();
  ok("probe (build 52) ran in the one tab: window reopened, ok, GMGN wallet from the window's SOL (header chip 0)",
    real.probeRep && real.probeRep.ok && real.probeRep.build === BUILD && real.probeRep.instant.open && real.probeRep.walletKind === "gmgn" && Math.abs(real.probeRep.chipSol - 0.07) < 1e-6 && panel.page === keep && opened === 0,
    real.probeRep && { ok: real.probeRep.ok, why: real.probeRep.why, open: real.probeRep.instant && real.probeRep.instant.open, chip: real.probeRep.chipSol, wk: real.probeRep.walletKind, opened });

  real.setConfig({ mode: "live", wallet: WALLET, exec: "instant", buyPreset: "0.01618", autoBuy: true, maxOpen: 6, perMin: 2, keepMints: [KIMCHI] });
  await tick(); await tick(6000);
  ok("selectorsFrom auto: LIVE with no hash written by hand", real.mode === "live" && real.status().cfg.selectorsFrom === "auto", real.why);

  // ---------------------------------------------------------------- Kimchi, then new creations every 5 s
  real.onPick(pickOf(KIMCHI));
  await tick();
  ok("Kimchi: never bought", srv.buys.length === 0 && clicks(BUY).length === 0);
  const t0 = T, buyAt = [];
  for (let i = 0; i < 36; i++) {                  // 3 minutes of new coins
    real.onPick(pickOf());
    const n = srv.buys.length;
    await tick(5000);
    if (srv.buys.length > n) buyAt.push(T - t0);
  }
  const firstMin = buyAt.filter((t) => t <= buyAt[0] + 60_000).length;
  ok("new creations sniped with autoBuy: at least 2 entries in the first minute", firstMin >= 2, buyAt);
  // 0.07 SOL - 0.01 reserve = 3 buys of 0.01618 (maxOpen 6): the free SOL caps it at 3
  ok("several positions at once, capped by the free SOL: exactly 3 open, 3 buys", real.st.positions.length === 3 && srv.buys.length === 3 && real.board().open.length === 3, { open: real.st.positions.length, buys: srv.buys.length });
  ok("every buy: one 0.01618 click in the window, no decoy, nothing else", clicks(BUY).length === 3 && clicks(BUY).every((e) => e.name === "0.01618") && clicks(DECOY).length === 0 && srv.buys.every((b) => b.amount === "0.01618"));
  ok("the hand glided to each 0.01618 at 6x speed, on the one tab", glides.filter((g) => g.text === "0.01618").length === 3 && glides.every((g) => g.speed === TRADE_SPEED && g.same), glides);
  ok("Kimchi still never bought", !srv.buys.some((b) => b.mint === KIMCHI) && !real.st.positions.some((p) => p.mint === KIMCHI));
  ok("the equity holds: no drawdown halt, no pause with 3 open", !real.st.halted && !(real.st.paused && real.st.paused.until > T) && real.board().auto.ddOk === true, { halted: real.st.halted, paused: real.st.paused, auto: real.board().auto });

  // ---------------------------------------------------------------- restart with 3 open: no double buy
  const held = real.st.positions.map((p) => p.mint).sort().join(",");
  await real.stop();
  real = mk();
  real.setConfig({ mode: "live", wallet: WALLET, exec: "instant", buyPreset: "0.01618", autoBuy: true, maxOpen: 6, perMin: 2, keepMints: [KIMCHI] });
  await tick(); await tick(6000);
  real.onPick(pickOf()); await tick(5000);
  ok("restart: the same 3 positions back OPEN, zero new buy clicks", real.st.positions.map((p) => p.mint).sort().join(",") === held && real.st.positions.every((p) => p.state === "OPEN") && clicks(BUY).length === 3, { n: real.st.positions.length, buys: clicks(BUY).length });
  const wal = fs.readFileSync(path.join(dir, "real.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  ok("WAL: every buy click has its CLICKING line first, 3 of them", wal.filter((l) => l.type === "real-click").length === 3);

  // ---------------------------------------------------------------- each position exits on its own
  const winner = real.st.positions[1].mint;
  mul.set(winner, 1.45);
  await tick(1000);
  ok("+45% on one of three: exactly one 100% sell click, the other two untouched", clicks(SELL).length === 1 && clicks(SELL)[0].name === "100%" && real.st.positions.filter((p) => p.state === "OPEN").length >= 2, { sells: clicks(SELL).length, states: real.st.positions.map((p) => p.state) });
  ok("the hand glided to 100% at 6x speed", glides.filter((g) => g.text === "100%").length === 1, glides.map((g) => g.text));
  await tick(21_000);
  ok("closed as a win, two still open", !real.st.positions.some((p) => p.mint === winner) && real.st.positions.length === 2 && real.st.wins === 1, { n: real.st.positions.length, wins: real.st.wins });
  for (let i = 0; i < 8; i++) { real.onPick(pickOf()); await tick(5000); }
  ok("room again: a fourth coin bought", srv.buys.length === 4 && real.st.positions.length === 3, { buys: srv.buys.length, open: real.st.positions.length });

  // ---------------------------------------------------------------- maxOpen 2
  real.setConfig({ mode: "live", wallet: WALLET, exec: "instant", buyPreset: "0.01618", autoBuy: true, maxOpen: 2, perMin: 2, keepMints: [KIMCHI] });
  chain.lamports += 1e9;                           // plenty of SOL: only maxOpen stops it now
  for (let i = 0; i < 12; i++) { real.onPick(pickOf()); await tick(5000); }
  ok("maxOpen 2 with 3 open: no new buy", srv.buys.length === 4, srv.buys.length);
  real.stopManual(); await tick(); await tick(21_000); await tick(21_000);
  ok("manual stop: every open position sold (3 more sell clicks)", real.st.positions.length === 0 && clicks(SELL).length === 4, { open: real.st.positions.length, sells: clicks(SELL).length });
  for (let i = 0; i < 24; i++) { real.onPick(pickOf()); await tick(5000); }
  ok("maxOpen 2: two bought, never a third", real.st.positions.length === 2 && srv.buys.length === 6, { open: real.st.positions.length, buys: srv.buys.length });

  // ---------------------------------------------------------------- the one-tab invariant over the whole run
  ok("whole run: no page ever opened, 2 pages (the one tab + Alex's), every trade on the one tab", opened === 0 && chrome.ctx.pages().length === 2 && panel.page === keep && !keep.isClosed(), { opened, pages: chrome.ctx.pages().length });
  ok("whole run: 0 decoys, every buy 0.01618, every sell 100%", clicks(DECOY).length === 0 && clicks(BUY).every((e) => e.name === "0.01618") && clicks(SELL).every((e) => e.name === "100%"));
  await real.stop();

  // ---------------------------------------------------------------- a slow page cannot hold the probe
  await chrome.ctx.route("https://gmgn.ai/sol/token/SLOW*", (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><title>slow</title><body><div>loading</div><script>setInterval(()=>{const t=Date.now();while(Date.now()-t<40);},50)</script></body>" }));
  const p2 = new GmgnPanel({ browser: chrome.browser, build: BUILD, dir, waitMs: 4000, visible: true, newPage: () => tabs.get() });
  const s0 = Date.now();
  const rep = await p2.probe("https://gmgn.ai/sol/token/SLOWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  const took = Date.now() - s0;
  ok(`slow page: the probe finished in ${Math.round(took / 1000)} s (limit ${PROBE_WAIT_MS / 1000} s wait + one read), not ok, with its why`, took < 45_000 && rep.ok === false && !!rep.why, { took, ok: rep.ok, why: rep.why });
  ok("and still no page opened", opened === 0 && chrome.ctx.pages().length === 2, { opened });
} finally {
  await chrome.close();
  await srv.close();
  clearTimeout(KILL);
}
console.log(`\nsnipe.test.mjs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
