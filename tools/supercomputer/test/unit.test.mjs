// node --test test/   (from tools/supercomputer)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fillGaps, rsi, retStd, atr, blocks, vwap, emaLast } from "../src/lib/indicators.js";
import { FEATURES, LOOKBACK, columns, features, setupTags } from "../src/lib/features.js";
import { read, verdict, rawProb } from "../src/lib/model.js";
import { size, limits, plan, chasing, DEFAULTS, leverageFor } from "../src/lib/plan.js";
import { shouldLog, makeCall, settle, tally, athensDay } from "../src/lib/score.js";
import * as grok from "../src/lib/grok.js";
import * as news from "../src/lib/news.js";
import { detectBase, loadMarkets, bars1m, normBase } from "../src/lib/kraken.js";
import { settleRec, learn, weight, rank, makeRec } from "../src/lib/recs.js";
import { detect, PATTERNS } from "../src/lib/patterns.js";

const MODEL = JSON.parse(readFileSync(new URL("../model/model.json", import.meta.url)));
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
// deterministic random walk
function walk(n, p0 = 100, vol = 0.001, seed = 7, t0 = 1_790_000_000 - (1_790_000_000 % 60)) {
  let s = seed, p = p0; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, (_, i) => { const o = p; p *= Math.exp((rnd() - 0.5) * 2 * vol); const h = Math.max(o, p) * (1 + rnd() * vol / 2), l = Math.min(o, p) * (1 - rnd() * vol / 2);
    return { t: t0 + i * 60, o, h, l, c: p, v: 1 + rnd() * 5 }; });
}

test("indicators: RSI, gaps, std, ATR, VWAP, EMA", () => {
  assert.equal(rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 14), 100);
  assert.equal(rsi([15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], 14), 0);
  near(rsi([10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10], 14), 50);
  const g = fillGaps([{ t: 0, o: 1, h: 1, l: 1, c: 2, v: 1 }, { t: 180, o: 3, h: 3, l: 3, c: 3, v: 1 }]);
  assert.deepEqual(g.map((b) => [b.t, b.c, b.v]), [[0, 2, 1], [60, 2, 0], [120, 2, 0], [180, 3, 1]]);
  near(retStd(Float64Array.from([1, 1, 1, 1]), 3, 3), 0);
  const bl = [{ h: 10, l: 8, c: 9 }, { h: 12, l: 9, c: 11 }, { h: 11, l: 7, c: 8 }];
  near(atr(bl, 14), (3 + 4) / 2);
  near(vwap([2, 4], [2, 4], [2, 4], [1, 3], 1, 2), (2 * 1 + 4 * 3) / 4);
  near(emaLast([5, 5, 5, 5], 0, 4, 3), 5);
  const col = columns(walk(30)); const b5 = blocks(col.o, col.h, col.l, col.c, col.v, 29, 5, 3);
  assert.equal(b5.length, 3); near(b5[2].c, col.c[29]); near(b5[2].o, col.o[25]);
});

test("features: right length, need 600 bars, same for any price scale", () => {
  const bars = walk(700), col = columns(bars);
  assert.equal(features(col, LOOKBACK - 1), null);
  const f = features(col, 699); assert.equal(f.x.length, FEATURES.length); assert.ok(f.x.every(Number.isFinite));
  const big = columns(bars.map((b) => ({ ...b, o: b.o * 1000, h: b.h * 1000, l: b.l * 1000, c: b.c * 1000 })));
  const f2 = features(big, 699); f.x.forEach((v, i) => near(v, f2.x[i], 1e-6));
  assert.ok(Array.isArray(setupTags(f)));
});

test("model: probabilities in range, bands from the file, stand aside without edge", () => {
  const f = features(columns(walk(700)), 699);
  for (const h of ["5", "15"]) {
    const r = read(MODEL, f, h); assert.ok(r.p > 0 && r.p < 1); assert.ok(r.hi > f.price && r.lo < f.price); assert.ok(r.conf >= 0.5 && r.shown >= 0.5 && r.shown < 0.7);
    assert.ok(MODEL.horizons[h].bands.includes(r.band));
    const v = verdict({ ...r, edge: false, band: { ...r.band, dirEdge: false } }); assert.equal(v.stand, true); assert.match(v.why, /no edge/);
  }
  near(rawProb({ b: 0, w: [1], mu: [0], sd: [1] }, [0]), 0.5);
  near(rawProb({ b: 0, w: [2], mu: [1], sd: [2] }, [3]), 1 / (1 + Math.exp(-2)));
});

test("sizing: the stop never costs more than $10 with fees, limits shrink the budget", () => {
  const fee = 0.0004;
  for (const [entry, stop] of [[55000, 54800], [65.3, 64.9], [0.0812, 0.0805], [3513, 3525]]) {
    const z = size({ entry, stop, feePerSide: fee, budget: 10, equity: 5000, lev: 10, qtyInc: 1e-8 });
    const loss = Math.abs(entry - stop) * z.qty + fee * z.qty * (entry + stop);
    assert.ok(loss <= 10 + 1e-9 && loss > 9.9, `loss ${loss}`);
  }
  const capped = size({ entry: 100, stop: 99.99, feePerSide: 0, budget: 10, equity: 5000, lev: 2, qtyInc: 0.001 });
  assert.ok(capped.capped && capped.notional <= 10000 + 1e-6 && capped.risk < 10);
  const L = limits({ ...DEFAULTS, equityNow: 4855 }); assert.equal(L.ddFloor, 4850); near(L.budget, 5); assert.equal(L.blocked, null);
  assert.match(limits({ ...DEFAULTS, equityNow: 4849 }).blocked, /limit reached/);
  const D = limits({ ...DEFAULTS, accountSize: 5000, dayStartBalance: 5100, equityNow: 4950 }); near(D.dailyFloor, 4947); near(D.budget, 3);
  assert.equal(leverageFor("XBT", DEFAULTS), 10); assert.equal(leverageFor("ETH", DEFAULTS), 5); assert.equal(leverageFor("SOL", DEFAULTS), 2);
  assert.equal(size({ entry: 100, stop: 99, feePerSide: 0, budget: 10, equity: 5000, lev: 2, qtyInc: 1, minQty: 50 }).qty, 0);
});

test("plan: only with edge, never chasing, numbers consistent", () => {
  const f = features(columns(walk(700)), 699);
  const r = read(MODEL, f, "15"), inst = { base: "BTC", tick: 0.01, qtyInc: 1e-8, minQty: 0 };
  assert.equal(plan(MODEL, f, { ...r, edge: false }, DEFAULTS, inst).ok, false);
  const p = plan(MODEL, f, { ...r, edge: true }, DEFAULTS, inst);
  if (p.ok) { assert.ok(p.risk <= 10 + 1e-9); const dir = p.side === "up" ? 1 : -1; assert.ok(dir * (p.tp - p.entry) > 0 && dir * (p.entry - p.stop) > 0); assert.ok(p.zone[0] <= p.zone[1]); }
  else assert.match(p.reason, /chasing|quiet|minimum/);
  const ff = { ...f, x: f.x.slice() }; ff.x[2] = 3; assert.match(chasing(ff, "up"), /chasing/); assert.equal(chasing(ff, "down"), null);
  assert.match(plan(MODEL, ff, { ...r, side: "up", edge: true }, DEFAULTS, inst).reason || "", /chasing|quiet/);
});

test("scorecard: one call per window, hit/miss on the closing bar, Athens day", () => {
  const t = 1_795_000_200; // a multiple of 300
  assert.equal(shouldLog([], "BTC", 5, t), true); assert.equal(shouldLog([], "BTC", 5, t + 60), false);
  const c = makeCall("BTC", { h: 5, price: 100, side: "up", conf: 0.56, edge: false }, t);
  assert.equal(shouldLog([c], "BTC", 5, t), false);
  const bars = [{ t: t + 240, c: 101 }];
  assert.equal(settle(c, bars).status, "hit"); assert.equal(settle({ ...c, side: "down" }, bars).status, "miss");
  assert.equal(settle(c, [{ t: t + 240, c: 100 }]).status, "flat"); assert.equal(settle(c, []).status, "open");
  const T = tally([settle(c, bars), settle({ ...c, side: "down", id: "x" }, bars)], (t + 600) * 1000);
  assert.equal(T.all5.hit, 1); assert.equal(T.all5.miss, 1); near(T.all5.rate, 0.5);
  assert.equal(athensDay(Date.UTC(2026, 10, 21, 22, 30)), "2026-11-22"); // 00:30 Athens
});

test("grok: finds the GROK line in messy replies", () => {
  const g = grok.parse('blah **GROK {"coin":"BTC/USD","h5":"Down","p5":"58%","h15":"up","p15":0.61,"entry":"55,100","stop":54900,"tp":0,"note":"x",}** end');
  assert.equal(g.h5, "down"); near(g.p5, 0.58); assert.equal(g.h15, "up"); near(g.p15, 0.61); assert.equal(g.entry, 55100); assert.equal(g.tp, null);
  assert.equal(grok.parse("no json here"), null);
  assert.equal(grok.parse("GROK {bad json"), null);
  const sm = grok.parse("GROK {“h5”:“long”,“p5”:60}"); assert.equal(sm.h5, "up"); near(sm.p5, 0.6);
  assert.match(grok.prompt({ coin: "BTC/USD", price: 55000, atAthens: "10:00", r5: null, r15: null }), /GROK \{/);
});

test("news: RSS parsing, sentiment, relevance", () => {
  const xml = `<rss><channel><item><title><![CDATA[Bitcoin plunges as liquidations hit $1B]]></title><link>https://x/1</link><pubDate>Sat, 21 Nov 2026 05:40:35 +0000</pubDate></item>
  <item><title>Solana ETF approval sparks rally</title><pubDate>Sat, 21 Nov 2026 05:00:00 +0000</pubDate></item><item><title>Gold steady</title></item></channel></rss>`;
  const it = news.parseRss(xml, "T"); assert.equal(it.length, 2); assert.equal(it[0].title, "Bitcoin plunges as liquidations hit $1B");
  assert.ok(news.sentiment(it[0].title) < 0); assert.ok(news.sentiment(it[1].title) > 0);
  assert.equal(news.relevance("Solana ETF approval", "SOL"), "coin"); assert.equal(news.relevance("SOL breaks out", "SOL"), "coin");
  assert.equal(news.relevance("Bitcoin falls", "SOL"), "market"); assert.equal(news.relevance("Gold hits record", "XAU"), "coin");
  const r = news.read(it, "SOL", Date.parse("2026-11-21T06:00:00Z")); assert.equal(r.scope, "coin"); assert.equal(r.items.length, 1); assert.equal(r.lean, 1);
});

test("kraken: page detection, market list, bars", async () => {
  assert.deepEqual(detectBase("https://pro.kraken.com/app/trade/btc-usd", ""), { base: "BTC", quote: "USD", from: "url" });
  assert.equal(detectBase("https://pro.kraken.com/prop/account/abc123/trade/gold-usd", "").base, "XAU");
  assert.equal(detectBase("https://pro.kraken.com/prop/account/abc", "3,513.4 | GOLD Kraken Prop").base, "XAU");
  assert.equal(detectBase("https://pro.kraken.com/app/home", "Kraken Pro"), null);
  assert.equal(normBase("xdg"), "DOGE");
  const get = async (u) => u.includes("AssetPairs") ? { result: { XXBTZUSD: { wsname: "XBT/USD", quote: "ZUSD", status: "online", tick_size: "0.1", lot_decimals: 8, ordermin: "0.00006", leverage_buy: [2, 10] },
      XETHXEUR: { wsname: "ETH/EUR", quote: "ZEUR", status: "online" } } }
    : u.includes("instruments") ? { instruments: [{ symbol: "PF_XAUUSD", tradeable: true, tickSize: 0.01 }, { symbol: "PF_XBTUSD", tradeable: true }] }
    : { result: { XXBTZUSD: [[60, "1", "2", "0.5", "1.5", "1.2", "10", 3], [120, "1.5", "1.6", "1.4", "1.55", "1.5", "2", 1]], last: 60 } };
  const m = await loadMarkets(get);
  assert.deepEqual(m.map((x) => [x.name, x.source]), [["BTC/USD", "spot"], ["XAU/USD", "futures"]]);
  assert.equal(m[0].levMax, 10); assert.equal(m[0].kind, "crypto"); near(m[0].qtyInc, 1e-8);
  const b = await bars1m(get, m[0]); assert.equal(b.length, 1); assert.deepEqual(b[0], { t: 60, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 });
});

test("recommendations: replayed outcomes, learning only pushes down", () => {
  const rec = { coin: "SOL", side: "up", entry: 100, stop: 99, tp: 102, hold: 30, t0: 6000, tags: [], hourAthens: 17, status: "open" };
  assert.equal(settleRec(rec, [{ t: 6000, h: 101, l: 99.5, c: 100.5 }, { t: 6060, h: 102.5, l: 100, c: 102 }]).status, "win");
  assert.equal(settleRec(rec, [{ t: 6000, h: 102.5, l: 98.9, c: 100 }]).status, "loss"); // both touched: stop first
  const bars = Array.from({ length: 31 }, (_, i) => ({ t: 6000 + i * 60, h: 100.5, l: 99.5, c: 100.2 }));
  const to = settleRec(rec, bars); assert.equal(to.status, "timeout"); assert.ok(to.R > 0);
  assert.equal(settleRec(rec, bars.slice(0, 10)).status, "open");
  const losses = Array.from({ length: 9 }, () => ({ ...rec, status: "loss", R: -1 }));
  const st = learn(losses); assert.ok(weight(st, { coin: "SOL", tags: [], hourAthens: 3, side: "down" }).w < 1);
  assert.equal(weight(learn([]), { coin: "SOL", tags: [], hourAthens: 3, side: "up" }).w, 1);
  const band = { test: { plan: { netPct: 0.05 } } };
  const c = (coin, ok, conf) => ({ coin, plan: { ok, side: "up", holdMin: 30, entry: 1, stop: 0.9, tp: 1.2, qty: 1, risk: 10 }, read: { conf, band }, tags: [], hourAthens: 17 });
  const r = rank([c("A", true, 0.6), c("B", false, 0.9), c("C", true, 0.7)], {});
  assert.deepEqual(r.map((x) => x.coin), ["C", "A"]); assert.equal(makeRec(r[0], 60).status, "open");
});

test("patterns: no look-ahead, a drawn double bottom is found", () => {
  const bars = walk(900, 100, 0.0008, 11), col = columns(bars);
  const a = detect(columns(bars.slice(0, 700)), 699), b = detect(col, 699);
  assert.deepEqual(a.x, b.x); assert.equal(a.x.length, PATTERNS.length);
  // two equal lows 30 minutes apart with a bounce between, price lifting off the second
  const t0 = 1_790_000_000 - (1_790_000_000 % 60), shape = [];
  const path = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const ps = [...Array(300).fill(100), ...path(100, 96, 60), ...path(96, 98.5, 30), ...path(98.5, 96, 30), ...path(96, 97, 20)];
  ps.forEach((p, i) => { const prev = i ? ps[i - 1] : p; shape.push({ t: t0 + i * 60, o: prev, h: Math.max(prev, p) + 0.01, l: Math.min(prev, p) - 0.01, c: p, v: 1 }); });
  const d = detect(columns(shape), shape.length - 1);
  assert.ok(d.hits.doubleBottom, `found: ${Object.keys(d.hits).join(", ") || "nothing"}`);
});
