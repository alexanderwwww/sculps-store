// UNBIASED sample: every pool GeckoTerminal lists as NEW right now (no ranking by later success), candles pulled 100 min later.
import fs from "node:fs";
import { getJson } from "../../../../../tools/autotrader/src/lib/net.mjs";
import { candles } from "../../../../../tools/autotrader/src/lib/gecko.mjs";
const B = "https://api.geckoterminal.com/api/v2/networks/solana";
const shape = (x) => ({ pool: x.attributes.address, name: x.attributes.name, mint: x.relationships.base_token.data.id.replace(/^solana_/, ""), created: Date.parse(x.attributes.pool_created_at), liqUsd: Number(x.attributes.reserve_in_usd), dex: x.relationships.dex.data.id });
const seen = new Map();
for (let p = 1; p <= 10; p++) { try { for (const x of (await getJson(`${B}/new_pools?page=${p}`)).data) seen.set(x.attributes.address, shape(x)); } catch (e) { console.error("list", p, e.message.slice(0, 60)); } }
const list = [...seen.values()]; fs.writeFileSync("data/fwd_snapshot.json", JSON.stringify({ t0: Date.now(), list }));
console.log("snapshot", list.length, "at", new Date().toISOString(), "liq>0:", list.filter((m) => m.liqUsd > 0).length);
await new Promise((r) => setTimeout(r, 100 * 60e3));
const out = [];
for (const m of list) { try { const cs = await candles(m.pool, { limit: 1000 }); out.push({ ...m, cs }); } catch (e) { out.push({ ...m, cs: [], err: e.message.slice(0, 40) }); } if (out.length % 10 === 0) fs.writeFileSync("data/fwd_pools.json", JSON.stringify(out)); }
fs.writeFileSync("data/fwd_pools.json", JSON.stringify(out)); console.log("done", out.length, new Date().toISOString());
