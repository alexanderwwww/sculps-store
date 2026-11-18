// Download 1-minute candles (Jupiter's chart API, the trader's own source) for the trader's own candidate list: the last HOURS hours.
import fs from "node:fs";
import { jupPool, URLS, SOL_MINT } from "../src/aq/feeds.mjs";
const HOURS = Number(process.argv[2] || 24), out = process.argv[3], sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u) => { for (let k = 0; k < 4; k++) { try { const r = await fetch(u, { headers: { accept: "application/json" } }); if (r.ok) return await r.json(); if (r.status !== 429 && r.status < 500) return null; } catch {} await sleep(1500 * (k + 1)); } return null; };
const seen = new Set(), coins = [];
for (const k of ["toptrending", "toptraded", "toporganicscore"]) { const j = await get(URLS.jupTop(k)); for (const p of j?.pools || []) { const c = jupPool(p); if (c && !seen.has(c.mint)) { seen.add(c.mint); coins.push(c); } } }
const now = Date.now(), list = coins.filter((c) => c.quoteMint === SOL_MINT && c.liqUsd >= 100000 && c.createdAt && now - new Date(c.createdAt).getTime() > 86400000);
console.log("coins on the lists", coins.length, "candidates (SOL pair, pool >= $100K, older than a day)", list.length);
const data = [];
for (const [i, c] of list.entries()) { const by = new Map();
  for (let w = 0; w < Math.ceil(HOURS / 4); w++) { const j = await get(URLS.jupChart(c.mint, now - w * 4 * 3600000)); for (const x of j?.candles || []) by.set(Number(x.time), { t: Number(x.time), o: +x.open, h: +x.high, l: +x.low, c: +x.close, v: +x.volume || 0 }); await sleep(250); }
  const cs = [...by.values()].filter((x) => [x.t, x.o, x.h, x.l, x.c].every(Number.isFinite)).sort((a, b) => a.t - b.t);
  data.push({ mint: c.mint, symbol: c.symbol, liqUsd: c.liqUsd, candles: cs }); if (i % 10 === 0) console.log(i, c.symbol, cs.length, cs.length ? new Date(cs[0].t * 1000).toISOString() : "");
}
fs.writeFileSync(out, JSON.stringify({ at: now, hours: HOURS, data })); console.log("saved", data.length, "coins,", data.reduce((a, x) => a + x.candles.length, 0), "candles");
