// Narrative (build 53): unit tests on clustering and heat, then the real engine loop (slow + fast lanes) driven by a fake
// feed, a fake executor and fake narrative sources on a fake clock. No network, no wallet, no transactions.
import test from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { Narrative, tokens, linkKeys, why } from "../src/lib/narrative.mjs";
import { Engine } from "../src/lib/engine.mjs";
import { Journal } from "../src/lib/journal.mjs";
import { DEFAULTS } from "../src/lib/strategy.mjs";

const MIN = 60000;
const tick = () => new Promise((r) => setImmediate(r));

test("tokens split CamelCase and tickers, drop stopwords", () => {
  assert.deepEqual(tokens("CyberFurballs", "CFB", "AI pets that work"), ["cyber", "furballs", "cfb", "ai", "pets", "work"]);
  assert.ok(tokens("HYPEHouse").includes("hype"));
  assert.ok(!tokens("the official coin").length);
});
test("linkKeys: X handle and own domain, never a platform host", () => {
  assert.deepEqual(linkKeys(["https://x.com/Tetsuo/status/1", "https://t.me/abc", "https://www.gta6coin.xyz/", { url: "https://pump.fun/coin/x" }]), ["@tetsuo", "gta6coin.xyz"]);
});

function narr() {
  let now = 1_800_000_000_000; const n = new Narrative({ auto: false, now: () => now });
  return { n, at: (m) => { now += m * MIN; }, get now() { return now; } };
}
test("seed theme rises: more new coins, more volume, a runner", () => {
  const w = narr();
  w.n.observe({ mint: "a0", name: "AgentZero", vol1h: 10000 }); w.n.recompute();
  w.at(60);
  for (let i = 1; i <= 4; i++) w.n.observe({ mint: `a${i}`, name: `Neural Agent ${i}`, vol1h: 20000 });
  w.n.observe({ mint: "a0", vol1h: 15000, ch1h: 120 }); w.n.recompute();
  const h = w.n.heat({ mint: "a1" });
  assert.equal(h.label, "AI-agent"); assert.equal(h.trend, "rising"); assert.ok(h.heat > 0);
  assert.match(why(h), /riding the AI-agent narrative/);
  assert.equal(w.n.heat({ mint: "a4" }).late, true, "5th coin of the theme is a copycat");
  assert.equal(w.n.top(3)[0].label, "AI-agent");
});
test("theme dies: volume 40%+ under its 6h peak", () => {
  const w = narr();
  for (let i = 0; i < 3; i++) w.n.observe({ mint: `d${i}`, name: `Doge ${i}`, vol1h: 50000 });
  w.n.recompute(); w.at(30);
  for (let i = 0; i < 3; i++) w.n.observe({ mint: `d${i}`, vol1h: 10000 });
  w.n.recompute();
  assert.equal(w.n.heat({ mint: "d0" }).trend, "dying");
});
test("emergent word and shared link become themes the dictionary never had", () => {
  const w = narr();
  for (let i = 0; i < 3; i++) w.n.observe({ mint: `h${i}`, name: `Houseworm${i ? " " + i : ""}`.replace("Houseworm", i ? "worm house" : "HouseWorm"), vol1h: 1000 });
  w.n.observe({ mint: "g1", name: "VI", links: ["https://x.com/RockstarGames"] }); w.n.observe({ mint: "g2", name: "EEGL", links: ["https://x.com/rockstargames/status/9"] });
  w.n.recompute();
  assert.ok(w.n.themes.has("word:house"), [...w.n.themes.keys()].join(","));
  assert.ok(w.n.themes.has("link:@rockstargames"));
});
test("pump never blocks: a source that hangs does not hold the caller", async () => {
  let now = 0; const n = new Narrative({ now: () => now, fetchJson: () => new Promise(() => {}) });
  const t0 = Date.now(); n.pump([]); assert.ok(Date.now() - t0 < 50);
  assert.ok(n.busy.has("jup")); n.pump([]);   // a second pass does not start a second fetch while the first hangs
  assert.equal(n.busy.size, 3);
});

// ------------------------------------------------------------------ the engine loop
test("engine loop: rides the rising AI narrative at full size, never buys the dying dog theme, shows it in status", async () => {
  let now = 1_800_000_000_000, phase = "A";
  const SIZE = 0.02618;
  // the narrative sources: Jupiter top-trending, phase A (an hour ago) then phase B (now)
  const jup = () => phase === "A"
    ? [{ id: "mAI0", name: "AgentZero", symbol: "AGZ", stats1h: { buyVolume: 5000, sellVolume: 5000, priceChange: 10 } },
       ...[0, 1, 2].map((i) => ({ id: `mDOG${i}`, name: `Doge Inu ${i}`, symbol: `DI${i}`, stats1h: { buyVolume: 40000, sellVolume: 40000, priceChange: 5 } }))]
    : [{ id: "mAI0", name: "AgentZero", symbol: "AGZ", stats1h: { buyVolume: 20000, sellVolume: 20000, priceChange: 140 } },
       ...[1, 2, 3].map((i) => ({ id: `mAI${i}`, name: `GPT Agent ${i}`, symbol: `GA${i}`, stats1h: { buyVolume: 15000, sellVolume: 15000, priceChange: 30 } })),
       ...[0, 1, 2].map((i) => ({ id: `mDOG${i}`, name: `Doge Inu ${i}`, symbol: `DI${i}`, stats1h: { buyVolume: 5000, sellVolume: 5000, priceChange: -20 } }))];
  const calls = [];
  const fetchJson = async (u) => { calls.push(u); return u.includes("jup.ag") ? jup() : []; };
  const nar = new Narrative({ now: () => now, fetchJson });
  // two tradeable pools, identical market numbers: only the narrative differs
  const born = now, pools = { pAI: { mint: "mAI1", name: "GA1 / SOL" }, pDOG: { mint: "mDOG0", name: "DI0 / SOL" } };
  const bought = new Map();
  const price = (id) => bought.has(id) ? bought.get(id) * 1.002 : Math.pow(1.07, (now - born) / 30000);
  const buys = [];
  const exec = {
    name: "live", caps: { maxFeeLamports: 150000 },
    async sizeSol({ scale = 1 } = {}) { return { bal: 1, sol: +(SIZE * Math.min(1, scale)).toFixed(5) }; },
    async buy({ pool, scale }) { const sol = +(SIZE * Math.min(1, scale ?? 1)).toFixed(5); bought.set(pool, price(pool)); buys.push({ pool, sol }); return { ok: true, sol, outAmount: "1000000", feeLamports: 5000 }; },
    async sell() { return { ok: true, inAmount: "1000000", outAmount: "26000000" }; },
  };
  const entry = (id) => ({ pool: id, ...pools[id], created: born - 20 * MIN, liqUsd: 60000, vol5: 20000, priceUsd: price(id) });
  const feed = {
    quotes: async (ids) => new Map(ids.filter((id) => pools[id]).map((id) => [id, { price: price(id), liqUsd: 60000, buys5: 300, sells5: 100, vol5: 20000 }])),
    newPools: async () => Object.keys(pools).map(entry), trendingPools: async () => [], candles: async () => [],
  };
  const cfg = { ...DEFAULTS, pullback: 0, momMin: 0.03, momMax: 0.9, liveMinVol5: 500, liveMinFlow: 3, liveBuyRatio: 0.8, liveMinLiq: 25000, entryMinLiq: 25000, minLiqUsd: 1000, minAgeMin: 0, maxAgeMin: 600, maxOpen: 8 };
  const jf = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "narr-")), "j.jsonl");
  const e = new Engine({ feed, exec, cfg, journal: new Journal(jf), rug: async () => ({ pass: true, reason: "ok" }), now: () => now, narr: nar, rng: () => 0.5 });
  // phase A: an hour of history, nothing hot yet; the engine is not allowed to buy (paused) so the history is clean
  e.paused = true;
  for (let i = 0; i < 25; i++) { await e.slow(); await tick(); now += 3000; }
  now += 60 * MIN; phase = "B"; nar.due.jup = 0; e.paused = false;
  for (let i = 0; i < 40 && buys.length < 1; i++) { await e.slow(); await tick(); await e.fast(); now += 3000; }
  const st = e.status();
  assert.ok(calls.some((u) => u.includes("lite-api.jup.ag/tokens/v2/toptrending/1h")), "polled Jupiter");
  assert.equal(nar.heat({ mint: "mDOG0" }).trend, "dying", JSON.stringify(nar.top(5)));
  assert.equal(nar.heat({ mint: "mAI1" }).trend, "rising", JSON.stringify(nar.top(5)));
  assert.ok(buys.length >= 1, `buys ${JSON.stringify(st.recentSkips)}`);
  assert.ok(buys.every((b) => b.pool === "pAI"), `dog bought: ${JSON.stringify(buys)}`);
  assert.equal(buys[0].sol, SIZE, "rising theme -> full size, never above it");
  const p = [...e.open.values()][0];
  assert.match(p.enter, /riding the AI-agent narrative/);
  assert.equal(st.narrative.top.find((x) => x.label === "AI-agent")?.trend, "rising");
  assert.ok(Object.keys(st.whyNot).some((k) => /Doge|dog/i.test(k) && /dying/.test(k)) || st.recentSkips.some((s) => /dying/.test(s.why)), JSON.stringify(st.whyNot));
});
