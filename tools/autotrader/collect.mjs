// node collect.mjs  -> data/pools.json: real young Solana pools with up to 1000 one-minute candles each.
// Sources are lists of pools GeckoTerminal ranks (new, trending, most traded); only pools under 72 h old are kept.
import fs from "node:fs";
import { getJson } from "./src/lib/net.mjs";
import { candles } from "./src/lib/gecko.mjs";
const B = "https://api.geckoterminal.com/api/v2/networks/solana";
const shape = (x) => ({ pool: x.attributes.address, name: x.attributes.name, mint: x.relationships.base_token.data.id.replace(/^solana_/, ""), created: Date.parse(x.attributes.pool_created_at), liqUsd: Number(x.attributes.reserve_in_usd), dex: x.relationships.dex.data.id });
const seen = new Map();
const lists = [];
for (let p = 1; p <= 10; p++) lists.push(`${B}/new_pools?page=${p}`);
for (let p = 1; p <= 5; p++) lists.push(`${B}/trending_pools?page=${p}`);
for (const sort of ["h24_volume_usd_desc", "h24_tx_count_desc"]) for (let p = 1; p <= 10; p++) lists.push(`${B}/pools?page=${p}&sort=${sort}`);
for (const u of lists) { try { for (const x of (await getJson(u)).data) seen.set(x.attributes.address, shape(x)); } catch (e) { console.error("list", u.slice(-40), e.message.slice(0, 60)); } }
const young = [...seen.values()].filter((m) => m.created && Date.now() - m.created < 72 * 3600e3);
console.log(`pools listed ${seen.size}, young ${young.length}`);
const out = [];
for (const m of young) { try { const cs = await candles(m.pool, { limit: 1000 }); if (cs.length >= 60) out.push({ ...m, cs }); } catch (e) { console.error("candles", m.name, e.message.slice(0, 50)); } }
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/pools.json", JSON.stringify(out));
console.log(`saved ${out.length} pools, ${out.reduce((a, m) => a + m.cs.length, 0)} candles`);
