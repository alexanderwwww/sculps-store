import test from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { Engine } from "../src/lib/engine.mjs";
import { Journal } from "../src/lib/journal.mjs";
import { DEFAULTS } from "../src/lib/strategy.mjs";
import { Intel, score, exitsFor, xHandle } from "../src/lib/intel.mjs";
// Alex 2026-10-30: research every coin instantly; high certainty stays in longer (wider stop/trail), never a bigger size.
const BOUNCE = [1, 1.05, 1.1, 1.15, 1.2, 1.12, 1.09, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1];
function rig(intel, prices = BOUNCE, cfg = {}) {
  let now = 1_800_000_000_000, i = 0; const buys = [];
  const pool = { pool: "P", name: "RUN / SOL", mint: "M".repeat(40) + "pump", created: now - 30 * 60000, liqUsd: 60000, vol5: 50000 };
  const px = () => prices[Math.min(i, prices.length - 1)];
  const feed = { quotes: async () => new Map([["P", { price: px(), liqUsd: 60000, buys5: 120, sells5: 60, vol5: 50000 }]]), newPools: async () => [pool], trendingPools: async () => [], candles: async () => [] };
  const exec = { name: "live", source: "own", buy: async (o) => { buys.push({ px: px(), usd: o.usd, scale: o.scale }); return { ok: true, sol: 0.016, outAmount: "1000", inAmount: "16000000" }; }, sell: async () => ({ ok: true }), sizeSol: async ({ scale }) => ({ bal: 1, sol: 0.016 * scale }) };
  const e = new Engine({ feed, exec, intel, journal: new Journal(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "in-")), "j.jsonl")), rug: async () => ({ pass: true, reason: "ok" }), cfg: { ...DEFAULTS, sl: -0.02, trail: 0.1, trailFrom: 0.2, maxHoldMin: 8, momMin: 0.10, entryMinLiq: 0, liveMinLiq: 20000, liveMinVol5: 3000, liveBuyRatio: 1, ...cfg }, now: () => now });
  return { e, buys, step: async () => { await e.slow(); await e.fast(); i++; now += 3000; }, run: async (n) => { for (let k = 0; k < n; k++) { await e.slow(); await e.fast(); i++; now += 3000; } } };
}
const fake = (r) => ({ want() {}, cache: new Map(), peek: () => r });
const HIGH = { certainty: 0.9, reasons: ["dev holds 0%", "top10 18%", "3 smart wallets in", "X linked"], full: true };
const LOW = { certainty: 0.3, reasons: ["-dev holds 12%", "-top10 70%"], full: true };

test("intel: high certainty widens the stop to -5% and the trail to 15%, longer hold, same size", async () => {
  const base = rig(null); await base.run(BOUNCE.length);
  const r = rig(fake(HIGH)); await r.run(BOUNCE.length);
  assert.equal(r.buys.length, 1); assert.equal(base.buys.length, 1);
  assert.equal(r.buys[0].usd, base.buys[0].usd, "size never raised");
  const p = [...r.e.open.values()][0];
  assert.equal(p.sl, -0.05); assert.equal(p.trail, 0.15); assert.equal(p.maxHoldMin, 16);
  assert.match(p.enter, /certainty 0\.90: dev holds 0%, top10 18%, 3 smart wallets in, X linked/);
  assert.equal(r.e.status().open[0].certainty, 0.9);
});
test("intel: a high-certainty position rides a -4% dip that would stop a -2% one", async () => {
  const dip = [...BOUNCE, 1.056, 1.056, 1.056, 1.056];   // bought at 1.1, -4%
  const lo = rig(null, dip); await lo.run(dip.length);
  const hi = rig(fake(HIGH), dip); await hi.run(dip.length);
  assert.equal(lo.e.open.size, 0, "plain -2% stop fired");
  assert.equal(hi.e.open.size, 1, "high certainty still holding");
});
test("intel: low certainty is skipped with the reasons on screen", async () => {
  const r = rig(fake(LOW)); await r.run(BOUNCE.length);
  assert.equal(r.buys.length, 0);
  assert.ok(r.e.events.some((x) => x.type === "drop" && /certainty 0\.30/.test(x.why)));
});
test("intel: medium certainty keeps the plain -2% stop", async () => {
  const r = rig(fake({ certainty: 0.55, reasons: ["X linked"], full: true })); await r.run(BOUNCE.length);
  const p = [...r.e.open.values()][0]; assert.equal(p.sl, -0.02); assert.equal(p.trail, undefined);
});
test("intel: research that never answers never blocks a buy (medium, pending)", async () => {
  const hang = () => new Promise(() => {});
  const it = new Intel({ fetchImpl: hang, timeout: 50 });
  const r = rig(it); const t0 = Date.now(); await r.run(BOUNCE.length);
  assert.equal(r.buys.length, 1); assert.ok(Date.now() - t0 < 2000);
  assert.equal([...r.e.open.values()][0].sl, -0.02);
});
test("intel: a peek that throws is neutral, not a crash", async () => {
  const r = rig({ want() { throw new Error("x"); }, cache: new Map(), peek() { throw new Error("boom"); } }); await r.run(BOUNCE.length);
  assert.equal(r.buys.length, 1);
});
test("intel: Intel fetches in the background and fills the cache; failures default to medium", async () => {
  const rc = { creator: "DEV", topHolders: [{ owner: "POOL", pct: 80 }, { owner: "a", pct: 3 }, { owner: "b", pct: 2 }, { owner: "SM", pct: 1 }], knownAccounts: { POOL: { type: "AMM" } }, markets: [{ pubkey: "POOL", lp: { lpLockedPct: 100 } }], graphInsidersDetected: 0, totalHolders: 900, creatorBalance: 0 };
  const fetchImpl = async (url) => ({ ok: true, json: async () => (/rugcheck/.test(url) ? rc : /dexscreener/.test(url) ? [{ info: { socials: [{ type: "twitter", url: "https://x.com/coin" }] }, txns: { m5: { buys: 80, sells: 40 } } }] : /fxtwitter/.test(url) ? { user: { followers: 5000, joined: "2025-01-01" } } : { result: [] }) });
  const it = new Intel({ fetchImpl, smartWallets: ["SM"] });
  assert.equal(it.peek({ mint: "X" }).certainty, 0.5);
  await new Promise((r) => setTimeout(r, 30));
  const c = it.peek({ mint: "X" });
  assert.ok(c.certainty >= 0.7, JSON.stringify(c)); assert.ok(c.reasons.includes("top10 6%"), "the pool is not counted as a holder"); assert.ok(c.reasons.includes("1 smart wallet in"));
  const bad = new Intel({ fetchImpl: async () => { throw new Error("down"); } });
  bad.peek({ mint: "Y" }); await new Promise((r) => setTimeout(r, 20));
  assert.equal(bad.peek({ mint: "Y" }).certainty, 0.5); assert.equal(bad.peek({ mint: "Y" }).full, false);
});
test("intel: scoring and exits", () => {
  assert.ok(score({ rc: { topHolders: [{ owner: "w", pct: 60 }], creator: "w", graphInsidersDetected: 40, totalHolders: 50 } }).certainty < 0.4);
  assert.deepEqual(exitsFor(0.5, { sl: -0.02, trail: 0.1, maxHoldMin: 8 }), {});
  assert.equal(exitsFor(0.95, { sl: -0.02, trail: 0.1, maxHoldMin: 8 }).sl, -0.05);
  assert.ok(exitsFor(0.75, { sl: -0.02 }).sl < -0.02 && exitsFor(0.75, { sl: -0.02 }).sl > -0.05);
  assert.deepEqual(xHandle("https://x.com/Abc_1/status/123"), { handle: "Abc_1", status: "123" });
  assert.equal(xHandle("https://x.com/i/communities/1"), null);
});
