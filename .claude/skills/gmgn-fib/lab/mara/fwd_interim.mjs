import fs from "node:fs";
import { candles } from "../../../../../tools/autotrader/src/lib/gecko.mjs";
const snap = JSON.parse(fs.readFileSync("data/fwd_snapshot.json", "utf8"));
while (Date.now() < snap.t0 + 50 * 60e3) await new Promise((r) => setTimeout(r, 5000));
const out = [];
for (const m of snap.list) { try { out.push({ ...m, cs: await candles(m.pool, { limit: 1000 }) }); } catch (e) { out.push({ ...m, cs: [] }); } }
fs.writeFileSync("data/fwd_interim.json", JSON.stringify(out)); console.log("interim done", out.length, new Date().toISOString());
