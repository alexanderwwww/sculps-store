import test from "node:test"; import assert from "node:assert/strict";
import { world } from "./fakechain.mjs";
import { jupiterExec, CAPS } from "../src/lib/exec-jupiter.mjs";
import { walletFromPem } from "../src/lib/solana.mjs";
import { DEFAULTS } from "../src/lib/strategy.mjs";
import crypto from "node:crypto";
test("golden take: sellPart sells exactly 38.2% of the tokens and reports what is left", async () => {
  const w = walletFromPem(crypto.generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }));
  const t = world(w.publicKey, { held: 1000000n });
  const ex = jupiterExec({ wallet: w, rpc: t.rpc, jupiter: t.jupiter, cfg: DEFAULTS, caps: CAPS, wait: async () => {} });
  const r = await ex.sellPart({ mint: "M".repeat(43), frac: 0.382 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.sold, "382000"); assert.equal(r.left, "618000");
  assert.equal(t.W.quotes.at(-1).amount, "382000", "Jupiter was asked to sell exactly 38.2%");
  assert.equal(t.W.closes, 0, "the token account stays open for the rest");
});

import { Engine } from "../src/lib/engine.mjs";
import { Journal } from "../src/lib/journal.mjs";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
test("after the golden take the rest is NOT dumped by a stale peak (lesson 20)", async () => {
  let val = 0.0108, now = 1_800_000_000_000; const sells = [], parts = [];
  const exec = { name: "live", source: "own", valueSol: async () => val, sellPart: async ({ frac }) => { parts.push(frac); return { ok: true, outAmount: String(Math.round(0.0108 * frac * 1e9)), left: "500" }; }, sell: async () => { sells.push(1); return { ok: true, outAmount: "5000000", inAmount: "500" }; }, buy: async () => ({ ok: false }) };
  const feed = { quotes: async () => new Map([["P", { price: 1, liqUsd: 50000, buys5: 0, sells5: 0, vol5: 0 }]]), newPools: async () => [], trendingPools: async () => [], candles: async () => [] };
  const e = new Engine({ feed, exec, journal: new Journal(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pt-")), "j.jsonl")), cfg: { ...DEFAULTS, tp: 0.25, partAt: 0.08, partFrac: 0.5, sl: -0.07, trailFrom: 0.06, trail: 0.05, staleMin: 0, maxHoldMin: 60 }, now: () => now });
  e.open.set("x", { id: "x", name: "T", mint: "M", pool: "P", stake: 0.01, tokens: "1000", entryPx: 1, at: now });
  await e.fast();                         // +8%: half taken
  assert.deepEqual(parts, [0.5]);
  val = 0.0054; now += 3000; await e.fast();   // the rest is worth +8% of what is left: must be held
  assert.equal(sells.length, 0, "the rest must not be sold by a stale peak");
});
