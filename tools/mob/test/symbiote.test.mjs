// SYMBIOTE: decoder on real pump.fun transactions, the paper rules, health judging, batched writes on a throwaway schema,
// the right-call shape the live gate reads, the probe tally, the Durable Object's flow, and that symbiote cannot reach money.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeEnv, dropEnv, reqOf, login, mock, resetMocks, res } from "./helpers.mjs";
import { db } from "../src/db.mjs";
import * as D from "../src/aq/sym/decode.mjs";
import * as R from "../src/aq/sym/rules.mjs";
import { deepCheck, isVeto } from "../src/aq/sym/health.mjs";
import { flush, writeRight } from "../src/aq/sym/store.mjs";
import { tally, report } from "../src/aq/sym/probe.mjs";
import { Symbiote } from "../src/aq/sym/do.mjs";
import { rightCalls } from "../src/aq/live.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(readFileSync(join(here, "sym-fixture.json"), "utf8"));
const MINT = "5p53bQEmjoT894qUGh5tcKh4xZdJzpL6ivmQ9djvpump";

// ---------- decoder on real transactions (fetched from mainnet 2026-11-18) ----------
test("decoder: real pump.fun buys/sells and a CreateV2, field by field from the IDL", () => {
  const ev = FX.slice(0, 3).map((v) => D.eventsFromLogs(v, 1));
  const t = ev[0].trades[0];
  assert.equal(t.mint, MINT); assert.equal(t.buy, true); assert.equal(t.user, "nnnLxEzVBJNaC7ZFCDeQTjFv4gCVGq1sS9Q6u6oPSUA");
  assert.equal(t.vsol, 41326527933); assert.equal(t.vtok, 778918570578727); assert.equal(t.feeBps, 95); assert.equal(t.creatorFeeBps, 30); assert.equal(t.ix, "buy");
  assert.ok(Math.abs(t.px - 41.326527933 / 778918570.578727) < 1e-15);
  assert.equal(ev[1].trades[0].buy, false);
  const c = D.eventsFromLogs(FX[3]).creates[0];
  assert.equal(c.mint, "71yNknjXX7bHjQofB7LRwp1iUj2wUhFh2YY2RVWhDHZM"); assert.equal(c.symbol, "SLAB"); assert.equal(c.curve, "973TwsVbrK17rfcwytYAa9TdFefRpZRKPeZCG8EfCCsG");
  assert.equal(c.sol, false, "this launch is quoted in a PreStocks token, not SOL"); assert.equal(c.quote, "PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB");
  assert.equal(D.eventsFromLogs({ signature: "x", err: { InstructionError: [0, "x"] }, logs: FX[0].logs }).trades.length, 0, "failed transactions carry no trade");
  assert.equal(D.decodeLogLine("Program data: AAAA"), null);
  assert.equal(D.b58(new Uint8Array(32)), "11111111111111111111111111111111");
});

// ---------- the rules on a synthetic curve ----------
const K = 30e9 * 1.073e15, at = (p) => { const r = p * 1e3; return { vsol: Math.sqrt(K * r), vtok: Math.sqrt(K / r) }; };
const P0 = 30 / 1.073e9;
let clock = 1_800_000_000_000;
function feed(e, mint, path, opts = {}) {
  for (const [mult, buy, user] of path) { clock += 1000; const p = P0 * mult; e.onTrade({ mint, buy, sol: opts.sol ?? 0.3 + (clock % 7) / 10, tokens: 1e12, user: user || "u" + (clock % 97), ts: clock / 1000, px: p, ...at(p), realSol: 5, feeBps: 95, creatorFeeBps: 30, slot: opts.slot }, clock); }
}
const launch = (e, mint, extra = {}) => e.onCreate({ mint, name: "Test", symbol: "TST", creator: "DEV", curve: "CURVE", ts: clock / 1000, vsol: 30e9, vtok: 1.073e15, sol: true, slot: 100, src: "chain", ...extra });

test("rules: every lane buys every coin at first sight (no judging); exits differ: aquarius 38.2% giveback, grok 5x or 61.8% giveback", () => {
  const e = R.createEngine(); launch(e, "M1");
  feed(e, "M1", [[1.0, true]]);
  const c = e.coins.get("M1"), aq = c.lanes.aquarius, gk = c.lanes.grok;
  assert.equal(aq.st, "open"); assert.equal(gk.st, "open"); assert.ok(aq.rt > 0.07 && aq.rt < 0.1, "1 SOL on a ~30 SOL curve costs about 8.5%: " + aq.rt);
  feed(e, "M1", [[1.5, true], [2.05, true], [3.0, true], [2.5, false]]);  // 2x: half sold; gain 1.0->3.0, 38.2% giveback = 2.236
  assert.equal(aq.half, true); assert.equal(aq.st, "open");
  feed(e, "M1", [[2.2, false]]);
  assert.equal(aq.st, "done"); assert.equal(aq.result.exit, "trail"); assert.equal(gk.st, "open", "grok's 61.8% giveback (1.764) not hit");
  feed(e, "M1", [[5.1, true]]); assert.equal(gk.result.exit, "t3");
  const b = e.drain(); const t = b.trades.find((x) => x.lane === "aquarius");
  assert.ok(t.netPct > 60 && t.netPct < 120, "half near 2x and half near 2.2x after the real curve costs: " + t.netPct);
  assert.equal(b.lessons.length, 0, "no brain row per trade (the Inspector's flood)");
  const hr = e.flushHours(); assert.equal(hr.filter((l) => l.kind === "sym_hour").length, 2, "one summary row per lane per hour"); assert.match(hr[0].text, /paper trades closed/);
  assert.equal(e.wallet.aquarius.n, 1); assert.ok(e.wallet.aquarius.sol > R.WALLET_SOL);
});

test("rules: falling coins are stopped at -50% / -60%; a lane losing on 80%+ of 20+ trades in an hour is ONE PAIN pattern row", () => {
  const e = R.createEngine();
  for (let i = 0; i < 22; i++) { launch(e, "F" + i); feed(e, "F" + i, [[1.0, true], [0.8, false], [0.45, false], [0.35, false]]); }
  const b = e.drain(); const a = b.trades.find((x) => x.lane === "aquarius"), g = b.trades.find((x) => x.lane === "grok");
  assert.equal(a.exit, "stop"); assert.equal(g.exit, "stop"); assert.ok(a.netPct < -40);
  const pain = e.flushHours().filter((l) => l.kind === "pain"); assert.equal(pain.length, 2, "one pattern row per lane, not 44"); assert.match(pain[0].text, /^PAIN pattern .*Should have caught it: /); assert.ok(pain[0].data.rule);
});

test("rules: quiet coins end; a launch with no trade is a logged miss; GTA gets minute candles", () => {
  const e = R.createEngine(); launch(e, "M3");
  feed(e, "M3", [[1.0, true], [1.3, true], [1.2, false]]);
  assert.equal(e.coins.get("M3").lanes.grok.st, "open"); assert.equal(e.coins.get("M3").lanes.aquarius.st, "open");
  launch(e, "M4"); launch(e, "GTAx", { name: "Vice City Coin", symbol: "VICE" });
  assert.equal(e.coins.get("GTAx").gta, true); assert.equal(R.isGta({ mint: R.GTA_MAIN }), true); assert.equal(R.isGta({ name: "Victory", symbol: "VIC" }), false);
  feed(e, "GTAx", [[1.0, true], [1.1, true]]);
  clock += R.QUIET_MS + 60000; e.sweep(clock);
  const b = e.drain();
  assert.ok(b.trades.some((t) => t.mint === "M3" && t.exit === "quiet"));
  assert.deepEqual(b.missed.map((m) => m.mint), ["M4"]); assert.match(b.missed[0].reason, /no trade seen/);
  assert.ok(b.gta.length >= 1 && b.gta[0].mint === "GTAx");
  const cov = e.coverage(); assert.equal(cov.launches, 3); assert.equal(cov.missed, 1); assert.equal(cov.pct, 66.666667);
  assert.equal(e.coins.has("GTAx"), true, "GTA coins are never dropped from memory");
});

test("rules: a paper doubling is flagged once for the deep checks; stream health sees snipers, dev selling and wash", () => {
  const e = R.createEngine(); launch(e, "M5");
  feed(e, "M5", [[1.0, true, "DEV"]], { slot: 100 });
  feed(e, "M5", [[1.05, true, "sniper1"], [1.1, true, "sniper2"]], { slot: 101 });
  feed(e, "M5", [[1.6, true], [2.6, true], [3.0, true]], { slot: 500 });
  feed(e, "M5", [[3.5, false, "DEV"]], { slot: 501 });
  const b = e.drain();
  assert.deepEqual([...new Set(b.explode.map((x) => x.mint))], ["M5"], "flagged per lane; the object checks each mint once"); assert.ok(b.explode[0].gainPct >= 100);
  const h = e.streamHealth("M5");
  assert.equal(h.sniperWallets, 2); assert.ok(h.sniperShare > 0); assert.equal(h.devSold, true); assert.ok(h.uniqueBuyers >= 3);
});

test("health: a healthy coin passes, each failure is named, unknown is never a pass", () => {
  const good = { top10Share: 0.18, devShare: 0.01, devSold: false, sniperShare: 0.05, sameFunderMax: 1, uniqueBuyers: 250, sizeCv: 1.4, sameSizeShare: 0.05, washShare: 0.04, liqToMcap: 0.2,
    mintAuthority: null, freezeAuthority: null, rugDanger: false, socials: 2, vetoed: false, launchComplete: true };
  assert.deepEqual(R.judgeHealth(good), { ok: true, failed: [] });
  const bad = R.judgeHealth({ ...good, sniperShare: 0.4, devSold: true, sameFunderMax: 7, washShare: 0.5, freezeAuthority: "X", vetoed: true });
  assert.equal(bad.ok, false);
  for (const w of ["sniper", "dev sold", "one source", "wash", "freeze", "VETO"]) assert.ok(bad.failed.some((f) => f.includes(w)), w);
  const noLaunch = R.judgeHealth({ ...good, launchComplete: false }); assert.equal(noLaunch.ok, false); assert.match(noLaunch.failed[0], /launch data .* can never be a right call/);
  const unk = R.judgeHealth({ ...good, top10Share: undefined, mintAuthority: undefined });
  assert.equal(unk.ok, false); assert.ok(unk.failed.some((f) => /top-10.*unknown/.test(f))); assert.ok(unk.failed.some((f) => /mint authority.*unknown/.test(f)));
  assert.equal(isVeto("VETO " + MINT, MINT), true); assert.equal(isVeto("VETO lifted on " + MINT, MINT), false);
});

// ---------- replay of a recorded real stream (public node, 2026-11-18) ----------
const STREAM = join(here, "sym-stream.json.gz");
test("replay: a real recorded pump.fun stream through the rules; every launch is traded, decided, pending or a logged miss", { skip: !existsSync(STREAM) && "no recording" }, () => {
  const rec = JSON.parse(gunzipSync(readFileSync(STREAM)).toString());
  const e = R.createEngine(); const t0 = 1_900_000_000_000;
  const all = { trades: [], missed: [], lessons: [] };
  for (const x of rec.ev) {
    const now = t0 + x.t;
    if (x.k === "c") e.onCreate({ ...x, src: "chain" }); else if (x.k === "t") e.onTrade(x, now); else e.onComplete(x, now);
    if (x.t % 5000 < 50) e.sweep(now);
  }
  e.sweep(t0 + rec.secs * 1000 + R.QUIET_MS + 1);
  const b = e.drain(); all.trades.push(...b.trades); all.missed.push(...b.missed);
  const cov = e.coverage();
  assert.ok(cov.launches > 0); assert.equal(cov.pending, 0); assert.equal(cov.decided, cov.launches);
  const lanes = Object.fromEntries(Object.keys(R.LANES).map((l) => { const t = all.trades.filter((x) => x.lane === l); return [l, { n: t.length, wins: t.filter((x) => x.netPct > 0).length, avg: t.length ? +(t.reduce((a, x) => a + x.netPct, 0) / t.length).toFixed(2) : null }]; }));
  for (const l of Object.keys(R.LANES)) { const w = e.wallet[l]; const sum = all.trades.filter((x) => x.lane === l).reduce((a, x) => a + (x.proceeds - x.cost) / x.cost * R.SIZE_SOL, 0); assert.ok(Math.abs(w.sol - R.WALLET_SOL - sum) < 1e-6, "wallet = 100,000 + every trade"); assert.equal(w.open, 0); }
  console.log("# replay", JSON.stringify({ secs: rec.secs, msgs: rec.msgs, mbPerDay: Math.round(rec.bytes / rec.secs * 86400 / 1e6), launches: cov.launches, coveragePct: cov.pct, missed: cov.missed, lanes, exploded: b.explode.length }));
});

// ---------- probe tally ----------
test("probe: counts notifications, buys/sells/creates and projects MB and Helius credits a day", () => {
  const t = tally("helius");
  t.add(JSON.stringify({ jsonrpc: "2.0", result: 7, id: 1 }));
  for (const v of FX) t.add(JSON.stringify({ jsonrpc: "2.0", method: "logsNotification", params: { result: { context: { slot: 1 }, value: v } } }));
  t.add(JSON.stringify({ jsonrpc: "2.0", method: "logsNotification", params: { result: { context: { slot: 1 }, value: { signature: "f", err: {}, logs: [] } } } }));
  const r = report(t, 10);
  assert.equal(r.subscribed, true); assert.equal(r.notifications, 5); assert.equal(r.failedTx, 1); assert.equal(r.buys, 1); assert.equal(r.sells, 2); assert.equal(r.creates, 1);
  assert.equal(r.creditsPerDay, Math.round(t.bytes / 10 * 86400 / 1e6 * 20)); assert.match(r.planUse.free, /% of the monthly credits/);
  assert.equal(report(tally("public"), 10).creditsPerDay, 0);
});

// ---------- money isolation ----------
test("isolation: no symbiote file can import or reach the signer, the wallet, live orders, payouts or Phantom", () => {
  const SYM = resolve(here, "../src/aq/sym"), seen = new Set(), bad = /\/(wallet|live|payout|phantom|robinhood|engine|council|ledger|seat|mcp)\.mjs$|@solana\/web3/;
  const walk = (f) => { if (seen.has(f)) return; seen.add(f); const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      const spec = m[1] || m[2]; assert.ok(!bad.test(spec), `${f} imports ${spec}`);
      if (spec.startsWith(".")) walk(resolve(dirname(f), spec)); } };
  const files = readdirSync(SYM).filter((f) => f.endsWith(".mjs")).map((f) => join(SYM, f));
  assert.ok(files.length >= 7);
  for (const f of files) walk(f);
  for (const f of seen) assert.ok(!/\/aq\/(?!sym\/)[a-z]+\.mjs$/.test(f), `reaches ${f}`);
  for (const f of files) { const s = readFileSync(f, "utf8"); for (const w of ["MOB_ENC_KEY", "sol_wallet_key", "AQ_WALLET_BACKUP", "secretKey", "signTransaction", "sendTransaction", "Keypair", "importKey", "crypto.subtle.sign"]) assert.ok(!s.includes(w), `${f} mentions ${w}`); }
});

// ---------- database: batched writes, right calls in the live gate's shape, the routes ----------
let env, d;
before(async () => { env = await makeEnv(); d = db(env); });
after(async () => { resetMocks(); await dropEnv(env); });

test("store: one batch writes coins, trades, misses, GTA minutes, lessons and the live stats", async () => {
  const e = R.createEngine(); launch(e, "W1"); launch(e, "W2"); launch(e, "GTAw", { symbol: "GTA6" });
  feed(e, "W1", [[1.0, true], [2.0, true], [1.45, false], [1.47, true], [2.7, true]]); feed(e, "GTAw", [[1, true]]);
  clock += R.QUIET_MS + 60000; e.sweep(clock);
  const bt = e.drain(); bt.lessons.push(...e.flushHours()); const r = await flush(d, bt, { coverage: e.coverage() });
  assert.equal(r.coins, 3); assert.equal(r.missed, 1);
  const mk = (await d.one(`SELECT lanes FROM mob_aq_sym_coins WHERE mint='W1'`)).lanes.market; assert.equal(mk.bought, true); assert.ok(mk.peakX >= 2.6 && mk.toPeakS > 0, JSON.stringify(mk)); assert.equal((await d.one(`SELECT lanes FROM mob_aq_sym_coins WHERE mint='W2'`)).lanes.market.bought, false); assert.ok(r.trades >= 1); assert.ok(r.lessons >= 1); assert.ok(r.gta >= 1);
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_sym_coins`)).n, 3);
  assert.equal((await d.one(`SELECT reason FROM mob_aq_sym_missed WHERE mint='W2'`)).reason, "no trade seen on the stream after launch");
  assert.ok((await d.one(`SELECT count(*)::int n FROM mob_aq_brain WHERE dept='symbiote' AND kind='sym_hour'`)).n >= 1);
  const w = (await d.one(`SELECT v FROM mob_aq_sym_stats WHERE k='wallet:aquarius'`)).v; assert.ok(w.n >= 1, "the lane wallet is a running total");
  assert.equal((await d.one(`SELECT v FROM mob_aq_sym_stats WHERE k='live'`)).v.coverage.launches, 3);
  await flush(d, { coins: [], trades: [], missed: [{ mint: "W2", symbol: "x", reason: "again", at: clock }], lessons: [], gta: [] }, null);
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_sym_missed`)).n, 1, "a miss is logged once");
});

test("right calls: a healthy explosion becomes 'candidate' (read by live.mjs rightCalls), a sick one 'fake_pump' + a lesson", async () => {
  resetMocks();
  const big = [{ address: "A1", amount: "40000000000000" }, { address: "A2", amount: "30000000000000" }, { address: "CURVEACC", amount: "600000000000000" }];
  let sick = false;
  mock("POST", "https://api.mainnet-beta.solana.com", (rq) => { const j = JSON.parse(rq.body);
    if (j.method === "getTokenLargestAccounts") return { result: { value: big } };
    if (j.method === "getMultipleAccounts") return { result: { value: j.params[0].map((a) => ({ data: { parsed: { info: { owner: a === "CURVEACC" ? "CURVE" : "own" + a } } } })) } };
    if (j.method === "getAccountInfo") return { result: { value: { data: { parsed: { info: { mintAuthority: null, freezeAuthority: sick ? "FRZ" : null } } } } } };
    if (j.method === "getSignaturesForAddress") return { result: [{ signature: "s-" + j.params[0] }] };
    if (j.method === "getTransaction") return { result: { transaction: { message: { instructions: [{ program: "system", parsed: { type: "transfer", info: { source: sick ? "ONEFUNDER" : "f-" + j.params[0], destination: j.params[0].slice(2) } } }] } }, meta: { innerInstructions: [] } } };
    return { error: { message: "unmocked " + j.method } }; });
  mock("GET", /api\.rugcheck\.xyz/, () => ({ score: 1, risks: [] }));
  mock("GET", /gateway\.pinata\.cloud/, () => ({ twitter: "https://x.com/a", website: "" }));
  const stream = { uniqueBuyers: 300, buyShare: 0.6, sizeCv: 1.2, sameSizeShare: 0.04, washShare: 0.02, sniperWallets: 1, sniperShare: 0.02, devSold: false, devShare: 0.0,
    launchComplete: true, earlyBuyers: ["e1", "e2", "e3", "e4"], firstBuyers: ["b1", "b2"], creator: "DEV", curve: "CURVE", uri: "https://ipfs.io/ipfs/bafkreiexample", realSol: 40, mcapSol: 150, liqToMcap: 0.27 };
  const ok = await deepCheck({}, d, "GOODMINT", stream);
  assert.equal(ok.verdict.ok, true, JSON.stringify(ok.verdict.failed)); assert.equal(ok.checks.top10Share, 0.07); assert.equal(ok.checks.socials, 1);
  assert.equal(await writeRight(d, { mint: "GOODMINT", symbol: "GOOD", lane: "aquarius", gainPct: 140 }, ok), "candidate");
  sick = true;
  const no = await deepCheck({}, d, "BADMINT", { ...stream, sniperShare: 0.3 });
  assert.equal(no.verdict.ok, false); assert.ok(no.verdict.failed.some((f) => /one source/.test(f))); assert.ok(no.verdict.failed.some((f) => /freeze/.test(f)));
  assert.equal(await writeRight(d, { mint: "BADMINT", symbol: "BAD", lane: "grok", gainPct: 220 }, no), "fake_pump");
  const set = await rightCalls(d);
  assert.equal(set.has("GOODMINT"), true); assert.equal(set.has("BADMINT"), false);
  const row = await d.one(`SELECT lane, status, gain_pct, checks, flagged_at, checked_at FROM mob_aq_sym_right WHERE mint='GOODMINT'`);
  assert.equal(row.lane, "aquarius"); assert.equal(row.gain_pct, 140); assert.ok(row.flagged_at && row.checked_at); assert.deepEqual(row.checks.failed, []);
  assert.equal((await d.one(`SELECT count(*)::int n FROM mob_aq_brain WHERE dept='symbiote' AND kind='fake_pump'`)).n, 1);
  assert.ok((await d.one(`SELECT count(*)::int n FROM mob_aq_brain WHERE dept='symbiote' AND kind='pain' AND text LIKE 'PAIN fake pump%'`)).n === 1);
  resetMocks();
});

test("Durable Object: launches and trades in, a 5-second alarm writes the batch and re-arms; a restart logs live coins as missed", async () => {
  const store = new Map(); let alarmAt = null;
  const ctx = { storage: { get: async (k) => store.get(k), put: async (k, v) => store.set(k, v), getAlarm: async () => alarmAt, setAlarm: async (t) => { alarmAt = t; } } };
  resetMocks(); mock("GET", /lite-api\.jup\.ag\/price/, () => ({ [R.GTA_MAIN]: { usdPrice: 0.0163 } }));
  const s = new Symbiote(ctx, env); s.connect = async () => {};
  await s.start(); assert.ok(alarmAt);
  s.onPumpPortal(JSON.stringify({ txType: "create", mint: "DO1", name: "Leonida", symbol: "LEO", traderPublicKey: "DEV", bondingCurveKey: "C" }));
  for (const v of FX) s.onChain(JSON.stringify({ jsonrpc: "2.0", method: "logsNotification", params: { result: { context: { slot: 9 }, value: v } } }));
  await s.alarm();
  assert.deepEqual(s.errors, []);
  const st = (await d.one(`SELECT v FROM mob_aq_sym_stats WHERE k='live'`)).v;
  assert.equal(st.source, "off", "no Helius key in the test: off"); assert.equal(st.credits.capPerDay, 150000); assert.equal(st.coverage.launches, 2); assert.ok(st.feed.some((f) => f.k === "launch" && f.gta));
  assert.ok((await d.one(`SELECT count(*)::int n FROM mob_aq_sym_coins WHERE mint IN ('DO1','71yNknjXX7bHjQofB7LRwp1iUj2wUhFh2YY2RVWhDHZM')`)).n === 2);
  assert.ok((await d.one(`SELECT count(*)::int n FROM mob_aq_sym_gta WHERE mint=$1`, [R.GTA_MAIN])).n >= 1, "the main GTA coin gets a Jupiter minute");
  const s2 = new Symbiote(ctx, env); s2.connect = async () => {}; await s2.start();
  assert.equal((await d.one(`SELECT reason FROM mob_aq_sym_missed WHERE mint = 'DO1'`)).reason, "symbiote restarted while the coin was live");
  assert.equal(s2.eng.stats.restarts, 1, "counters survive the restart");
  resetMocks();
});

const curveB64 = (vq, vt, complete = false) => { const b = new Uint8Array(8 + 8 * 5 + 1 + 32); b.set([23, 183, 248, 55, 96, 216, 172, 96]); const dv = new DataView(b.buffer);
  dv.setBigUint64(8, BigInt(vt), true); dv.setBigUint64(16, BigInt(vq), true); dv.setBigUint64(24, 0n, true); dv.setBigUint64(32, BigInt(vq - 30e9), true); dv.setBigUint64(40, 10n ** 15n, true); b[48] = complete ? 1 : 0; return Buffer.from(b).toString("base64"); };
test("Durable Object, curve source: reserve changes of a known curve become trades; unknown curves are counted; completion ends the coin", async () => {
  const store = new Map(); const ctx = { storage: { get: async (k) => store.get(k), put: async (k, v) => store.set(k, v), getAlarm: async () => 1, setAlarm: async () => {} } };
  const s = new Symbiote(ctx, env); s.connect = async () => {};
  s.onPumpPortal(JSON.stringify({ txType: "create", mint: "CV1", name: "c", symbol: "C", traderPublicKey: "DEV", bondingCurveKey: "CURVE1", vSolInBondingCurve: 30, vTokensInBondingCurve: 1073000000 }));
  const note = (pk, vq, vt, done) => JSON.stringify({ jsonrpc: "2.0", method: "programNotification", params: { result: { context: { slot: 5 }, value: { pubkey: pk, account: { data: [curveB64(vq, vt, done), "base64"] } } } } });
  s.onCurve(note("CURVE1", 31e9, Math.round(K / 31e9))); s.onCurve(note("CURVE1", 30.5e9, Math.round(K / 30.5e9))); s.onCurve(note("NOPE", 31e9, 1.06e15)); assert.equal(s.pending.has("NOPE"), true, "an unknown curve is held, not resolved (no credit)");
  const c = s.eng.coins.get("CV1"); assert.equal(c.n, 2); assert.equal(c.buys, 1); assert.equal(c.sells, 1); assert.ok(Math.abs(c.last - 30.5 / (K / 30.5e9 / 1e6)) < 1e-12);
  assert.equal(s.eng.stats.unknownCurves, 1);
  // its create arrives a moment later on the launch subscription: the held update is replayed as the coin's first trade
  s.pending.set("973TwsVbrK17rfcwytYAa9TdFefRpZRKPeZCG8EfCCsG", { raw: note("973TwsVbrK17rfcwytYAa9TdFefRpZRKPeZCG8EfCCsG", 24e9, 1.05e15), at: Date.now() });
  s.onChain(JSON.stringify({ jsonrpc: "2.0", method: "logsNotification", params: { result: { context: { slot: 9 }, value: FX[3] } } }));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(s.eng.coins.get("71yNknjXX7bHjQofB7LRwp1iUj2wUhFh2YY2RVWhDHZM").n, 1); assert.equal(s.pending.size, 1);
  s.pending.get("NOPE").at = Date.now() - 200000; s.prune(); assert.equal(s.pending.size, 0, "held updates age out after 2 minutes");
  assert.equal(await s.source(), "off"); s.env = { ...env, HELIUS_API_KEY: "k" }; assert.equal(await s.source(), "curve", "curve mode is the default with a Helius key");
  s.credits(150001); await s.alarm(); assert.equal(s.paused, true, "the credit guard pauses the stream at the cap"); assert.ok((await d.one(`SELECT count(*)::int n FROM mob_aq_brain WHERE text LIKE 'PAIN symbiote stream paused%'`)).n === 1); s.env = env;
  s.onCurve(note("CURVE1", 85e9, Math.round(K / 85e9), true)); assert.equal(c.end, "migrated");
});

test("health: with no wallets from the stream, the buyer facts come from a sample of the coin's own transactions", async () => {
  const txs = Object.fromEntries(FX.map((v, i) => [v.signature, { slot: 100 + i, blockTime: 1794987412 + i, meta: { err: null, logMessages: v.logs } }]));
  const rpc = async (m, p) => (m === "getSignaturesForAddress" ? Object.keys(txs).reverse().map((signature) => ({ signature, err: null })) : txs[p[0]]);
  const { sampleStream } = await import("../src/aq/sym/health.mjs");
  const h = await sampleStream(rpc, MINT, { creator: "DNbGrS3hXGUQopRdA7P8sbTwTfia5nxmXWWFR9ojJRH2", curve: "X" });
  assert.equal(h.sampledTx, 4); assert.equal(h.uniqueBuyers, 1); assert.equal(h.sells, 2); assert.equal(h.curve, "X");
});

test("routes: admin-only state with real counts and sources, the brain terminal feed, the probe needs a sign-in", async () => {
  const req = reqOf(env), cookie = await login(env);
  assert.equal((await req("GET", "/api/aq/sym/state")).status, 401);
  assert.equal((await req("GET", "/api/aq/sym/probe?secs=5")).status, 401);
  const s = await (await req("GET", "/api/aq/sym/state", { cookie })).json();
  assert.equal(s.paper, true); assert.ok(s.lanes.aquarius.trades >= 1); assert.ok(s.market.total >= 1 && s.market.bought >= 1); assert.equal(s.lanes.grok.walletSol != null, true);
  const src = Object.fromEntries(s.sources.map((x) => [x.label, x]));
  assert.equal(src["right calls"].n, (await d.one(`SELECT count(*)::int n FROM mob_aq_sym_right WHERE status = 'candidate'`)).n); assert.equal(src["fake pumps"].n, 1); assert.ok(src["brain records (all)"].n >= 3); assert.equal(src["brain records (all)"].table, "mob_aq_brain");
  assert.ok(s.right.some((r) => r.mint === "GOODMINT"), "the right call is listed (the DO test's upkeep may have expired it)");
  const b1 = await (await req("GET", "/api/aq/sym/brain", { bearer: "tok-test" })).json();
  assert.ok(b1.rows.length >= 1); const last = b1.rows.at(-1).id;
  await d.q(`INSERT INTO mob_aq_brain (dept, kind, text) VALUES ('symbiote','lesson','new one')`);
  const b2 = await (await req("GET", `/api/aq/sym/brain?after=${last}`, { cookie })).json();
  assert.deepEqual(b2.rows.map((r) => r.text), ["new one"]);
});

// ---------- the inspector's four findings ----------
test("launch facts: read at launch from the create tx and its first slots; over 1000 transactions or no create = fail closed", async () => {
  const { launchFacts } = await import("../src/aq/sym/health.mjs");
  const create = FX[3], buy = FX[0];
  const tx = { [create.signature]: { slot: 50, meta: { err: null, logMessages: create.logs } }, [buy.signature]: { slot: 51, meta: { err: null, logMessages: buy.logs.map((l) => l) } } };
  // the buy fixture is for another mint, so the early set is checked on the shape and the dev/create fields on the real create
  const rpc = async (m, p) => (m === "getSignaturesForAddress" ? [{ signature: buy.signature, slot: 51 }, { signature: create.signature, slot: 50 }] : tx[p[0]]);
  const f = await launchFacts(rpc, "71yNknjXX7bHjQofB7LRwp1iUj2wUhFh2YY2RVWhDHZM", "973TwsVbrK17rfcwytYAa9TdFefRpZRKPeZCG8EfCCsG");
  assert.equal(f.complete, true); assert.equal(f.createSlot, 50); assert.equal(f.creator, "5ZCUcSDKFLvo7nkZHkk4tUt93svyrF4hfiV4iF9F8bY9"); assert.equal(f.calls, 3);
  const many = await launchFacts(async () => Array.from({ length: 1000 }, (_, i) => ({ signature: "s" + i, slot: i })), "M", "C");
  assert.equal(many.complete, false); assert.match(many.why, /over 1000/);
  const notCreate = await launchFacts(async (m) => (m === "getSignaturesForAddress" ? [{ signature: buy.signature, slot: 51 }] : tx[buy.signature]), "71yNknjXX7bHjQofB7LRwp1iUj2wUhFh2YY2RVWhDHZM", "C");
  assert.equal(notCreate.complete, false);
  // the engine keeps them: snipers and dev from launch, and a coin without them can never pass
  const e = R.createEngine(); launch(e, "LF"); e.setLaunch("LF", { complete: true, createSlot: 10, creator: "DEV", early: [["sn1", 2e14], ["sn2", 1e14]], devTok: 5e13, devBuy: 1, devSold: true });
  const h = e.streamHealth("LF"); assert.equal(h.launchComplete, true); assert.equal(h.sniperWallets, 2); assert.equal(h.sniperShare, 0.3); assert.equal(h.devSold, true);
  assert.ok(R.judgeHealth({ ...h, top10Share: 0.1, sameFunderMax: 1, mintAuthority: null, freezeAuthority: null, rugDanger: false, socials: 1, uniqueBuyers: 100, sizeCv: 1, liqToMcap: 0.3 }).failed.some((x) => /sniper/.test(x)));
  launch(e, "NOLF"); assert.equal(e.streamHealth("NOLF").launchComplete, false, "no launch facts recorded = not complete");
});

test("memory bounds: curve map entries and checked mints expire; live coins keep their curve", async () => {
  const s = new Symbiote({ storage: { get: async () => null, put: async () => {}, getAlarm: async () => 1, setAlarm: async () => {} } }, env);
  const now = Date.now(); s.eng.onCreate({ mint: "LIVE", curve: "CL", src: "chain", ts: now / 1000 });
  s.curves.set("CL", "LIVE"); s.curveAt.set("CL", now - 7 * 3600000); s.curves.set("OLD", null); s.curveAt.set("OLD", now - 7 * 3600000); s.curves.set("NEW", null); s.curveAt.set("NEW", now);
  s.checked.set("A", now - 25 * 3600000); s.checked.set("B", now);
  for (let i = 0; i < 2100; i++) s.launchQ.add("q" + i);
  s.prune(now);
  assert.deepEqual([...s.curves.keys()].sort(), ["CL", "NEW"]); assert.deepEqual([...s.checked.keys()], ["B"]); assert.equal(s.launchQ.size, 2000);
});

test("credit guard: persisted in storage, a restart keeps the pause; deep checks are charged their real calls", async () => {
  const store = new Map(); const ctx = { storage: { get: async (k) => store.get(k), put: async (k, v) => store.set(k, v), getAlarm: async () => 1, setAlarm: async () => {} } };
  const s = new Symbiote(ctx, { ...env, HELIUS_API_KEY: "k" }); s.connect = async () => {};
  await s.start(); s.credits(150001); await s.alarm();
  assert.equal(s.paused, true); assert.equal(store.get("guard").paused, true);
  const s2 = new Symbiote(ctx, { ...env, HELIUS_API_KEY: "k" }); s2.connect = async () => {}; await s2.start();
  assert.equal(s2.paused, true, "the pause survives a restart"); assert.ok(s2.cused >= 150001);
  const { deepCheck } = await import("../src/aq/sym/health.mjs");
  let n = 0; const rpc = async () => { n++; throw new Error("x"); };
  resetMocks(); mock("GET", /rugcheck|pinata/, () => ({}));
  const r = await deepCheck({}, null, "M", { uniqueBuyers: 5, launchComplete: true, curve: "C", uri: null }, rpc);
  assert.equal(r.calls, n, "the deep check reports the calls it really made"); resetMocks();
});

test("retention: 7 days for coins, misses and trades; GTA coins and right calls stay", async () => {
  const { retention } = await import("../src/aq/sym/store.mjs");
  await d.q(`INSERT INTO mob_aq_sym_coins (mint, created_at, gta) VALUES ('OLDC', now() - interval '8 days', false), ('OLDG', now() - interval '8 days', true), ('GOODMINT', now() - interval '8 days', false) ON CONFLICT (mint) DO UPDATE SET created_at = EXCLUDED.created_at`);
  await d.q(`INSERT INTO mob_aq_sym_missed (mint, reason, at) VALUES ('OLDM', 'x', now() - interval '8 days')`);
  await d.q(`INSERT INTO mob_aq_sym_trades (mint, lane, at) VALUES ('OLDC', 'aquarius', now() - interval '8 days')`);
  const r = await retention(d);
  assert.ok(r.coins >= 1 && r.missed >= 1 && r.trades >= 1);
  const left = (await d.q(`SELECT mint FROM mob_aq_sym_coins WHERE mint IN ('OLDC','OLDG','GOODMINT')`)).map((x) => x.mint).sort();
  assert.deepEqual(left, ["GOODMINT", "OLDG"]);
});

// ---------- the Inspector's eight (2dbe9b95) ----------
test("right call upkeep: renewed while healthy, expired with the reason when it fails, goes quiet or passes 6 hours", async () => {
  const s = new Symbiote({ storage: { get: async () => null, put: async () => {}, getAlarm: async () => 1, setAlarm: async () => {} } }, env);
  const healthy = { top10Share: 0.1, sameFunderMax: 1, mintAuthority: null, freezeAuthority: null, rugDanger: false, socials: 1, launchComplete: true };
  for (const m of ["RC1", "RC2", "RC3"]) { s.eng.onCreate({ mint: m, curve: "C" + m, src: "chain", ts: Date.now() / 1000 });
    s.eng.setLaunch(m, { complete: true, createSlot: 1, creator: "DEV", early: [] });
    for (let i = 0; i < 120; i++) s.eng.onTrade({ mint: m, buy: i % 7 !== 0, sol: 0.02 * 1.08 ** ((i * 13) % 60), tokens: 1e12, user: "w" + i, ts: 1, px: P0 * (1 + i / 100), ...at(P0 * (1 + i / 100)), realSol: m === "RC2" ? 5 : 40, feeBps: 95, creatorFeeBps: 30, slot: 50 }, Date.now()); }
  await d.q(`DELETE FROM mob_aq_sym_right`);
  await d.q(`INSERT INTO mob_aq_sym_right (mint, symbol, status, flagged_at, checked_at, checks) VALUES ('RC1','A','candidate', now() - interval '20 minutes', now() - interval '20 minutes', $1::jsonb), ('RC2','B','candidate', now(), now(), $1::jsonb), ('RC3','C','candidate', now() - interval '7 hours', now(), $1::jsonb), ('GONE','D','candidate', now(), now(), $1::jsonb)`, [JSON.stringify(healthy)]);
  await s.recheckRights(d);
  const r = Object.fromEntries((await d.q(`SELECT mint, status, checks->>'expired' why, checked_at > now() - interval '1 minute' fresh FROM mob_aq_sym_right`)).map((x) => [x.mint, x]));
  assert.equal(r.RC1.status, "candidate", r.RC1.why); assert.equal(r.RC1.fresh, true, "renewed");
  assert.equal(r.RC2.status, "expired"); assert.match(r.RC2.why, /liquidity under the fresh-coin floor/);
  assert.equal(r.RC3.status, "expired"); assert.match(r.RC3.why, /6 hours/);
  assert.equal(r.GONE.status, "expired"); assert.match(r.GONE.why, /no longer holds/);
});

test("sockets: 'off' and the cap close the launch stream too; a busy launch stream never hides a silent trade stream", async () => {
  const s = new Symbiote({ storage: { get: async () => null, put: async () => {}, getAlarm: async () => 1, setAlarm: async () => {} } }, env);
  let closed = []; const fake = (k) => ({ close: () => closed.push(k) });
  s.ws.chain = fake("chain"); s.ws.launch = fake("launch"); s.closeChain("off");
  assert.deepEqual(closed.sort(), ["chain", "launch"]); assert.equal(s.ws.launch, null);
  s.lastMsg.chain = 1; s.onChain(JSON.stringify({ jsonrpc: "2.0", method: "logsNotification", params: { result: { context: { slot: 1 }, value: FX[3] } } }));
  assert.equal(s.lastMsg.chain, 1, "a launch message does not refresh the trade stream's clock");
});

test("memory: a GTA coin is released 3 days after its last trade; watched coins keep 1-minute bars and they are written", async () => {
  const e = R.createEngine(); const t0 = Date.now();
  e.onCreate({ mint: "GTAold", name: "GTA thing", src: "chain", ts: t0 / 1000 }); e.onTrade({ mint: "GTAold", buy: true, sol: 1, tokens: 1, user: "u", px: P0, ...at(P0), realSol: 1 }, t0);
  e.sweep(t0 + R.QUIET_MS + 1000); e.drain(); e.sweep(t0 + R.QUIET_MS + 2000); assert.equal(e.coins.has("GTAold"), true);
  e.sweep(t0 + R.GTA_KEEP_MS + 5000); assert.equal(e.coins.has("GTAold"), false);
  launch(e, "W9"); e.coins.get("W9").watch = true; feed(e, "W9", [[1.0, true], [1.1, true]]);
  const b = e.drain(); assert.equal(b.bars.length, 1); await flush(d, b, null);
  assert.ok((await d.one(`SELECT count(*)::int n FROM mob_aq_sym_bars WHERE mint='W9'`)).n === 1);
});

test("right-call stats measure what happened AFTER the call (flag price -> latest price)", async () => {
  await d.q(`DELETE FROM mob_aq_sym_right`);
  await d.q(`INSERT INTO mob_aq_sym_coins (mint, last) VALUES ('UP1', 3), ('DN1', 0.5) ON CONFLICT (mint) DO UPDATE SET last = EXCLUDED.last`);
  await d.q(`INSERT INTO mob_aq_sym_right (mint, status, checks) VALUES ('UP1', 'candidate', '{"flagPx": 2}'), ('DN1', 'expired', '{"flagPx": 1}')`);
  const st = await (await reqOf(env)("GET", "/api/aq/sym/state", { bearer: "tok-test" })).json();
  assert.equal(st.rightStats.trades, 2); assert.equal(st.rightStats.winRate, 50); assert.equal(st.rightStats.avgPct, 0); assert.equal(st.rightStats.totalPct, 0);
});

test("LIVE PATH: a fresh right call becomes its own candidate; its symbiote bars give the Fibonacci setup; every gate still runs", async () => {
  const L = await import("../src/aq/live.mjs"); const { chart } = await import("./fib-fixture.mjs");
  const RC = "RightCa11111111111111111111111111111111111", SOLM = "So11111111111111111111111111111111111111112";
  resetMocks();
  mock("GET", /^https:\/\/datapi\.jup\.ag\/v1\/pools\//, () => ({ pools: [] }));            // no established candidate at all
  mock("GET", /^https:\/\/datapi\.jup\.ag\/v2\/charts\//, () => res({ error: "no chart" }, 404)); // Jupiter has no chart for a fresh coin
  mock("GET", /lite-api\.jup\.ag\/price\/v3/, () => ({ [SOLM]: { usdPrice: 75 }, [RC]: { usdPrice: 0.0001, liquidity: 18000 } }));
  mock("GET", /^https:\/\/api\.rugcheck\.xyz\//, () => ({ mintAuthority: null, freezeAuthority: null, rugged: false, risks: [], topHolders: [], markets: [], token: { decimals: 6 } }));
  mock("POST", "https://api.mainnet-beta.solana.com", (rq) => { const m = JSON.parse(rq.body); return m.method === "getAccountInfo" ? { jsonrpc: "2.0", id: 1, result: { context: { slot: 1 }, value: { owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", data: { parsed: { type: "mint", info: { freezeAuthority: null, mintAuthority: null, decimals: 6, extensions: [] } } } } } } : { jsonrpc: "2.0", id: 1, error: { message: "unmocked" } }; });
  await d.q(`DELETE FROM mob_aq_market`); await d.q(`DELETE FROM mob_aq_sym_right`); await d.q(`DELETE FROM mob_aq_sym_bars WHERE mint = $1`, [RC]);
  const none = await L.scanFib(env, "live", async () => false);
  assert.ok(!none.c && ["no_candidate", "no_right_call"].includes(none.refusal.gate), "no right call: still refused " + JSON.stringify(none.refusal));
  await d.q(`INSERT INTO mob_aq_sym_right (mint, symbol, status, checked_at, checks) VALUES ($1, 'RC', 'candidate', now(), '{"realSol": 40}')`, [RC]);
  const bars = chart(Date.now() / 1000);
  await d.q(`INSERT INTO mob_aq_sym_bars (mint, t, o, h, l, c, v) SELECT $1, t, o, h, l, c, v FROM json_to_recordset($2::json) AS x(t bigint, o float8, h float8, l float8, c float8, v float8)`, [RC, JSON.stringify(bars)]);
  const got = await L.scanFib(env, "live", async () => false);
  assert.ok(got.c, JSON.stringify(got.refusal)); assert.equal(got.c.mint, RC); assert.equal(got.c.fresh, true); assert.equal(got.c.liqUsd, 18000); assert.equal(got.s.signal, true, "the chart setup came from symbiote's bars");
  // the veto still stops it, and an expired call is not a candidate
  await d.q(`INSERT INTO mob_aq_chat (from_name, text) VALUES ('grok', $1)`, ["VETO " + RC]);
  assert.equal((await L.scanFib(env, "live", async () => false)).refusal.gate, "veto"); await d.q(`DELETE FROM mob_aq_chat WHERE from_name = 'grok'`);
  await d.q(`UPDATE mob_aq_sym_right SET status = 'expired' WHERE mint = $1`, [RC]);
  const ex = await L.scanFib(env, "live", async () => false); assert.ok(!ex.c && ["no_candidate", "no_right_call"].includes(ex.refusal.gate));
  resetMocks();
});
