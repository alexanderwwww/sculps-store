import test from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { Engine } from "../src/lib/engine.mjs";
import { Journal } from "../src/lib/journal.mjs";
import { DEFAULTS } from "../src/lib/strategy.mjs";
import { Whales, smartFromTrades, swapsOf } from "../src/lib/whales.mjs";
// Alex 2026-10-30: "follow whales and legit trades automatically, more advanced than a human".
const SOL = "So11111111111111111111111111111111111111112";
const MINT = "C".repeat(40) + "pump";
const flush = () => new Promise((r) => setTimeout(r, 20));

// a fake public chain + RugCheck + DexScreener, driven by the test
function chain({ creator = "DEV", insiders = [], funders = {} } = {}) {
  const sigs = new Map(), txs = new Map(); let n = 0; const calls = [];
  const buy = (w, mint, t, side = "buy") => {
    const sig = `S${++n}`; (sigs.get(w) || sigs.set(w, []).get(w)).unshift({ signature: sig, blockTime: Math.floor(t / 1000), err: null });
    const tok = side === "buy" ? [0, 1000] : [1000, 0], lam = side === "buy" ? [5e9, 4e9] : [4e9, 5e9];
    txs.set(sig, { blockTime: Math.floor(t / 1000), meta: { err: null, preBalances: [lam[0]], postBalances: [lam[1]], preTokenBalances: [{ owner: w, mint, uiTokenAmount: { amount: String(tok[0]) } }], postTokenBalances: [{ owner: w, mint, uiTokenAmount: { amount: String(tok[1]) } }] }, transaction: { message: { accountKeys: [{ pubkey: w }], instructions: [] } } });
  };
  const fetchImpl = async (url, o = {}) => {
    const ok = (j) => ({ ok: true, json: async () => j });
    if (/rugcheck.*insiders\/graph/.test(url)) return ok([{ nodes: insiders.map((id) => ({ id })) }]);
    if (/rugcheck/.test(url)) return ok({ creator, topHolders: [] });
    if (/dexscreener/.test(url)) return ok([{ pairAddress: "P", quoteToken: { address: SOL }, baseToken: { symbol: "RUN" }, liquidity: { usd: 60000 } }]);
    const b = JSON.parse(o.body); calls.push(b.method);
    if (b.method === "getSignaturesForAddress") {
      const [w, opt] = b.params; const all = sigs.get(w) || [];
      if (opt.limit === 1000) return ok({ result: all.length ? [all[all.length - 1]] : [] });
      const i = opt.until ? all.findIndex((s) => s.signature === opt.until) : -1;
      return ok({ result: (i >= 0 ? all.slice(0, i) : all).slice(0, opt.limit) });
    }
    if (b.method === "getTransaction") {
      const t = txs.get(b.params[0]); if (t) return ok({ result: t });
      return ok({ result: null });
    }
    return ok({ result: null });
  };
  // each wallet's oldest tx: a funding transfer
  const fund = (w, from, t) => { const sig = `F${++n}`; (sigs.get(w) || sigs.set(w, []).get(w)).push({ signature: sig, blockTime: Math.floor(t / 1000), err: null }); txs.set(sig, { meta: { err: null, preBalances: [], postBalances: [] }, transaction: { message: { accountKeys: [], instructions: [{ program: "system", parsed: { type: "transfer", info: { source: from, destination: w } } }] } } }); };
  for (const [w, f] of Object.entries(funders)) fund(w, f, 1);
  return { fetchImpl, buy, sell: (w, m, t) => buy(w, m, t, "sell"), calls };
}

function rig({ wallets = ["A", "B", "C"], ch = chain(), rugPass = true, prices = null } = {}) {
  let now = 1_800_000_000_000, i = 0; const buys = [], sells = [];
  const px = () => (prices ? prices[Math.min(i, prices.length - 1)] : 1);
  const feed = { quotes: async (pools) => new Map(pools.includes("P") ? [["P", { price: px(), liqUsd: 60000, buys5: 50, sells5: 50, vol5: 20000 }]] : []), newPools: async () => [], trendingPools: async () => [], candles: async () => [] };
  const exec = { name: "live", buy: async (o) => { buys.push(o); return { ok: true, sol: 0.016 }; }, sell: async () => { sells.push(now); return { ok: true }; }, sizeSol: async ({ scale }) => ({ bal: 1, sol: 0.016 * Math.min(1, scale) }) };
  const whales = new Whales({ fetchImpl: ch.fetchImpl, now: () => now, seed: wallets, pollGapMs: 0 });
  const rugs = [];
  const e = new Engine({ feed, exec, whales, journal: new Journal(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "wh-")), "j.jsonl")), rug: async (m) => { rugs.push(m); return rugPass ? { pass: true, reason: "ok" } : { pass: false, reason: "danger: test" }; }, cfg: { ...DEFAULTS, sl: -0.02, maxOpen: 3, entryMinLiq: 0, liveMinLiq: 20000 }, now: () => now });
  const pass = async () => { await e.slow(); await whales.pump([]); await whales.poll(); await flush(); await e.fast(); i++; now += 3000; };
  return { e, whales, buys, sells, rugs, ch, pass, get now() { return now; }, tick: (ms) => { now += ms; } };
}
async function bookmark(r) { for (let k = 0; k < 4; k++) { await r.whales.poll(); await flush(); r.tick(7000); } }

test("whales: discovery keeps wallets that bought low and sold high, drops bots and holders", () => {
  const t = [{ kind: "buy", from: "W", usd: 200, px: 1 }, { kind: "sell", from: "W", usd: 400, px: 2 }, { kind: "buy", from: "H", usd: 500, px: 1 }, { kind: "buy", from: "L", usd: 300, px: 2 }, { kind: "sell", from: "L", usd: 200, px: 1 },
    ...Array.from({ length: 50 }, (_, k) => ({ kind: k % 2 ? "sell" : "buy", from: "BOT", usd: 300, px: k % 2 ? 2 : 1 }))];
  const s = smartFromTrades(t);
  assert.deepEqual(s.map((x) => x.addr), ["W"]); assert.equal(s[0].gain, 1);
});
test("whales: swapsOf reads buys and sells from token and SOL balance changes", () => {
  const tx = { meta: { err: null, preBalances: [5e9], postBalances: [4e9], preTokenBalances: [], postTokenBalances: [{ owner: "A", mint: "M", uiTokenAmount: { amount: "10" } }] }, transaction: { message: { accountKeys: [{ pubkey: "A" }] } } };
  assert.deepEqual(swapsOf(tx, "A"), [{ mint: "M", side: "buy" }]);
  assert.deepEqual(swapsOf({ ...tx, meta: { ...tx.meta, err: {} } }, "A"), []);
});
test("whales: 2 smart wallets buying inside 60 s -> Ultra follows, rug check run, normal size, reason on screen", async () => {
  const r = rig(); await bookmark(r);
  r.ch.buy("A", MINT, r.now); r.ch.buy("B", MINT, r.now + 10000);
  for (let k = 0; k < 6; k++) await r.pass();
  assert.equal(r.buys.length, 1, "one buy");
  assert.ok(r.buys[0].scale <= 1);
  assert.equal(r.rugs.length, 1, "full rug check");
  const p = [...r.e.open.values()][0];
  assert.match(p.enter, /following 2 smart wallets into RUN/);
  assert.deepEqual(p.follow.sort(), ["A", "B"]);
  const st = r.e.status().whales; assert.equal(st.count, 3); assert.equal(st.following[0].wallets, 2);
  for (let k = 0; k < 4; k++) await r.pass();
  assert.equal(r.buys.length, 1, "never a double buy");
});
test("whales: when a followed wallet sells, Ultra sells first; the wallets are credited", async () => {
  const r = rig(); await bookmark(r);
  r.ch.buy("A", MINT, r.now); r.ch.buy("B", MINT, r.now);
  for (let k = 0; k < 5; k++) await r.pass();
  assert.equal(r.e.open.size, 1);
  r.ch.sell("A", MINT, r.now);
  for (let k = 0; k < 5; k++) await r.pass();
  assert.equal(r.e.open.size, 0);
  assert.match(r.e.closed.at(-1).why, /whales selling: 1 of 2/);
  assert.equal(r.whales.w.get("A").copies, 1);
});
test("whales: one wallet alone, the creator, an insider, or two wallets with one funder never trigger a follow", async () => {
  for (const [name, ch, buyers] of [["alone", chain(), ["A"]], ["creator", chain({ creator: "B" }), ["A", "B"]], ["insider", chain({ insiders: ["B"] }), ["A", "B"]], ["same funder", chain({ funders: { A: "F", B: "F" } }), ["A", "B"]]]) {
    const r = rig({ ch }); await bookmark(r);
    for (const w of buyers) ch.buy(w, MINT, r.now);
    for (let k = 0; k < 6; k++) await r.pass();
    assert.equal(r.buys.length, 0, name);
  }
});
test("whales: a follow that fails the rug check is not bought (rug check never bypassed)", async () => {
  const r = rig({ rugPass: false }); await bookmark(r);
  r.ch.buy("A", MINT, r.now); r.ch.buy("B", MINT, r.now);
  for (let k = 0; k < 6; k++) await r.pass();
  assert.equal(r.buys.length, 0); assert.ok(r.rugs.length >= 1);
});
test("whales: buys more than 60 s apart are not a confluence", async () => {
  const r = rig(); await bookmark(r);
  r.ch.buy("A", MINT, r.now - 90000); r.ch.buy("B", MINT, r.now);
  for (let k = 0; k < 6; k++) await r.pass();
  assert.equal(r.buys.length, 0);
});
test("whales: losers are dropped, winners are weighted up", () => {
  const w = new Whales({ fetchImpl: async () => ({ ok: false }), seed: ["W", "L"] });
  w.credit(["W"], 0.1); w.credit(["L"], -0.05); w.credit(["L"], -0.05);
  assert.ok(w.weight(w.w.get("W")) > 1); assert.equal(w.w.has("L"), false); assert.equal(w.set.has("L"), false);
});
test("whales: an RPC that hangs or throws never stalls trading", async () => {
  const hang = () => new Promise(() => {});
  const w = new Whales({ fetchImpl: hang, seed: ["A"], timeout: 50, pollGapMs: 0 });
  const t0 = Date.now(); await w.pump([]); assert.ok(Date.now() - t0 < 1000);
  const w2 = new Whales({ fetchImpl: async () => { throw new Error("x"); }, seed: ["A"], pollGapMs: 0 });
  await w2.pump([]); assert.ok(w2.errors >= 1); assert.deepEqual(w2.signals(), []);
});
test("whales: discovery never adopts the runner's creator", async () => {
  const feed = { trades: async () => [{ kind: "buy", from: "DEV", usd: 200, px: 1 }, { kind: "sell", from: "DEV", usd: 400, px: 2 }, { kind: "buy", from: "W", usd: 200, px: 1 }, { kind: "sell", from: "W", usd: 400, px: 2 }] };
  const w = new Whales({ feed, fetchImpl: chain({ creator: "DEV" }).fetchImpl });
  await w.discover([{ pool: "P", mint: MINT, name: "RUN / SOL" }]);
  assert.deepEqual([...w.w.keys()], ["W"]);
});
