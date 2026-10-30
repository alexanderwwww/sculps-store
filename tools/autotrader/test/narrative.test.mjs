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
  w.n.recompute(); w.at(60);
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
// ---- build 54: the live check of 2026-10-29, replayed with the real names it saw
test("live 2026-10-29: whole words only (wormhole is not a worm, jeff is not a launchpad)", () => {
  const w = narr();
  w.n.observe({ mint: "j", name: "jeff", symbol: "jeff", vol1h: 5000, desc: "launch fees stake yield revenue" });
  w.n.observe({ mint: "g", name: "WORLD 2D GAMES", symbol: "W2D", vol1h: 5000 });
  w.n.observe({ mint: "r", name: "Raydium launches", symbol: "RL", vol1h: 5000 });
  w.n.observe({ mint: "s", name: "Bearish Service", symbol: "BS", vol1h: 5000, desc: "selfish advice hyperbolic" });
  w.n.recompute();
  for (const m of ["j", "g", "r", "s"]) assert.equal(w.n.member.get(m), undefined, `${m}: ${w.n.member.get(m)}`);
  w.n.observe({ mint: "d1", name: "Doge Agents" }); w.n.recompute();
  assert.deepEqual(w.n.member.get("d1").sort(), ["seed:AI-agent", "seed:dog"]);
});
test("live 2026-10-29: tokenized stocks, wrapped and bridged assets are not narratives", () => {
  const w = narr();
  const rows = [["NVIDIA xStock", "NVDAx", ["xstocks", "stocks", "rwa"]], ["SP500 xStock", "SPYx", ["stocks"]], ["Alphabet xStock", "GOOGLx", []],
    ["SpaceX - Backpack Securities", "SPCX", ["backpack", "stocks"]], ["SK Hynix - Backpack Securities", "SKHY", []], ["Coinbase Wrapped BTC", "cbBTC", []],
    ["SPX6900 (Wormhole)", "SPX", ["meme"]], ["Orca", "ORCA", ["defi"]]];
  rows.forEach(([name, symbol, tags], i) => w.n.observe({ mint: `x${i}`, name, symbol, tags, vol1h: 1e6, ch1h: 80 }));
  w.n.recompute();
  assert.equal(w.n.themes.size, 0, [...w.n.themes.keys()].join(","));
  assert.deepEqual(w.n.top(3), []);
});
test("live 2026-10-29: today's runners get a theme, and copycats of the runner's word make it rise", () => {
  const w = narr(); const L = "L" + "O".repeat(200) + "NG";
  w.n.observe({ mint: "h", name: "Hashtag", symbol: "HASHTAG", vol1h: 50000, ch1h: 149 });
  w.n.observe({ mint: "l", name: `${L} LYNX`, symbol: L, vol1h: 121000, ch1h: 340 });
  w.n.recompute();
  assert.ok(w.n.heat({ mint: "h" }), "Hashtag tagged"); assert.ok(w.n.heat({ mint: "l" }), "LOOONG tagged");
  assert.equal(w.n.heat({ mint: "l" }).runners, 1);
  w.n.observe({ mint: "l", vol1h: 121000 }); w.n.observe({ mint: "h", vol1h: 50000 });
  w.at(60);
  w.n.observe({ mint: "l", vol1h: 300000 });
  for (let i = 1; i <= 3; i++) w.n.observe({ mint: `lc${i}`, name: `${L} ${["cat", "dog", "ape"][i - 1]}`, vol1h: 40000 });
  w.n.recompute();
  const h = w.n.heat({ mint: "lc1" });
  assert.equal(h.trend, "rising", JSON.stringify(w.n.top(5))); assert.equal(h.strong, true);
});
test("live 2026-10-29: nameless profile coins get their name from DexScreener tokens/v1 and join themes", async () => {
  let now = 1_800_000_000_000; const urls = [];
  const fetchJson = async (u) => { urls.push(u);
    if (u.includes("token-profiles")) return [1, 2, 3].map((i) => ({ chainId: "solana", tokenAddress: `p${i}`, description: "the best launch ever, stake and earn" }));
    if (u.includes("tokens/v1/solana/")) return [1, 2, 3].map((i) => ({ baseToken: { address: `p${i}`, name: `Kitty Wave ${i}`, symbol: `KW${i}` }, liquidity: { usd: 1 }, volume: { h1: 9000 }, priceChange: { h1: 60 }, priceUsd: "0.001" }));
    return []; };
  const n = new Narrative({ now: () => now, fetchJson });
  n.pump([]); await new Promise((r) => setTimeout(r, 20)); now += 31000; n.pump([]); await new Promise((r) => setTimeout(r, 20));
  n.due.calc = 0; n.pump([]);
  assert.ok(urls.some((u) => /tokens\/v1\/solana\/p1,p2,p3/.test(u)), urls.join(" "));
  assert.equal(n.coins.get("p1").name, "Kitty Wave 1");
  assert.equal(n.heat({ mint: "p1" }).label, "cat"); assert.equal(n.coins.get("p1").runner, true);
  assert.ok(n.themes.has("word:wave"), [...n.themes.keys()].join(","));
});
test("an hour ago means about 60 min back, not 6 hours; per-coin volume on one base", () => {
  const w = narr();
  for (let k = 0; k <= 6 * 4; k++) { for (let i = 0; i < 3; i++) w.n.observe({ mint: `c${i}`, name: `Owl ${i}`, vol1h: k < 16 ? 10000 : k < 22 ? 100000 : 30000 }); w.n.recompute(); w.at(15); }
  const th = w.n.themes.get("seed:animal");
  assert.ok(th.volRatio > 0.2 && th.volRatio < 0.5, `volRatio ${th.volRatio}: vs 6h ago it would read 3x`);
  assert.equal(th.trend, "dying", "the same three owls trade 70% less than an hour ago");
});
test("stale volume and source turnover never make a theme dying; a theme that stops matching fades", () => {
  const w = narr();
  for (let i = 0; i < 3; i++) w.n.observe({ mint: `f${i}`, name: `Frog ${i}`, vol1h: 80000 });
  w.n.recompute(); w.at(30);
  for (let i = 0; i < 3; i++) w.n.observe({ mint: `f${i}`, vol1h: 80000 });
  w.n.recompute(); w.at(40);   // f0..f2 fell off Jupiter: no fresh volume. A new frog arrives.
  w.n.observe({ mint: "f9", name: "Frog 9", vol1h: 5000 }); w.n.recompute();
  assert.notEqual(w.n.heat({ mint: "f9" }).trend, "dying");
  assert.equal(w.n.themes.get("seed:frog").vol, 5000, "stale 80k volumes are not counted");
});
test("pump never blocks: a source that hangs does not hold the caller", async () => {
  let now = 0; const n = new Narrative({ now: () => now, fetchJson: () => new Promise(() => {}) });
  const t0 = Date.now(); n.pump([]); assert.ok(Date.now() - t0 < 50);
  assert.ok(n.busy.has("jup")); n.pump([]);   // a second pass does not start a second fetch while the first hangs
  assert.equal(n.busy.size, 4);   // prof, cto, jup, names
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
  const cfg = { ...DEFAULTS, pullback: 0, fib: 0, momMin: 0.03, momMax: 0.9, liveMinVol5: 500, liveMinFlow: 3, liveBuyRatio: 0.8, liveMinLiq: 25000, entryMinLiq: 25000, minLiqUsd: 1000, minAgeMin: 0, maxAgeMin: 600, maxOpen: 8 };
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
