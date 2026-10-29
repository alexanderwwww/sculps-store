import test from "node:test"; import assert from "node:assert/strict";
import { Engine } from "../src/lib/engine.mjs";
import { Journal } from "../src/lib/journal.mjs";
import { DEFAULTS } from "../src/lib/strategy.mjs";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
// lesson 35: whyNot counted every coin on every pass (+29963 "too thin" in 20 min = ~25 checks a second). It must count distinct coins per 20 s.
test("one thin coin over 10 passes counts once; again after 20 s", async () => {
  let now = 1_800_000_000_000;
  const exec = { name: "paper", buy: async () => ({ ok: true }), sell: async () => ({ ok: true }) };
  const feed = { quotes: async () => new Map([["P", { price: 1, liqUsd: 50000, buys5: 1, sells5: 1, vol5: 100 }]]), newPools: async () => [], trendingPools: async () => [], candles: async () => [] };
  const e = new Engine({ feed, exec, rug: async () => ({ pass: true, reason: "ok" }), journal: new Journal(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "wn-")), "j.jsonl")), cfg: { ...DEFAULTS, edgeMinN: 999 }, now: () => now });
  e.ready = [{ name: "T", mint: "M", pool: "P", liqUsd: 50000, vol5: 100 }];
  for (let i = 0; i < 10; i++) { await e.fast(); now += 1000; }
  assert.equal(e.status().whyNot["live: volume or buyers too thin"], 1, JSON.stringify(e.status().whyNot));
  assert.equal(e.open.size, 0);
  now += 20000; await e.fast();
  assert.equal(e.status().whyNot["live: volume or buyers too thin"], 2, JSON.stringify(e.status().whyNot));
});
