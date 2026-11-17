// Freeze the whole training-arena history into one gzip file for the study (Alex, 2026-11-17: "collect all the history of the trading data").
//   DATABASE_URL=... node tools/mob/scripts/aq-arena-export.mjs <out.json.gz>      (read-only)
import { gzipSync } from "node:zlib"; import { writeFileSync } from "node:fs"; import { db } from "../src/db.mjs";
const d = db({ DATABASE_URL: process.env.DATABASE_URL }), out = process.argv[2];
if (!out) { console.error("usage: aq-arena-export.mjs <out.json.gz>"); process.exit(1); }
const all = (t, order) => d.q(`SELECT * FROM ${t} ORDER BY ${order}`);
const data = { exportedAt: new Date().toISOString(),
  what: "Aquarius training arena, 2026-11-16 21:55Z to 2026-11-17 16:10Z. agg = fresh-minute trades, replay = replayed history; both are totals per day, variant (entry|stop|target|hold), tier, 6-hour block and regime. samples = individual trades kept as examples. costs = measured round-trip quotes. state = arena counters, wallet line, Grok's reports. brain = the lesson written each minute.",
  agg: await all("mob_aq_arena_agg", "day, variant, tier, tod, regime"), replay: await all("mob_aq_arena_replay", "day, variant, tier, tod, regime"),
  samples: await all("mob_aq_arena_samples", "variant, tier, slot"), costs: await all("mob_aq_arena_costs", "id"), picks: await all("mob_aq_arena_picks", "id"),
  state: Object.fromEntries((await d.q(`SELECT k, v FROM mob_aq_state WHERE k LIKE 'arena%' OR k IN ('training_mode','helper_training')`)).map((r) => [r.k, r.v])),
  brain: await d.q(`SELECT id, at, dept, kind, text, data FROM mob_aq_brain WHERE kind='arena' OR text ILIKE '%arena%' OR text ILIKE '%virtual trades%' ORDER BY id`) };
const counts = Object.fromEntries(Object.entries(data).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
const sum = (rows) => rows.reduce((a, r) => ({ n: a.n + r.n, w: a.w + r.wins, p: a.p + r.pnl_sol }), { n: 0, w: 0, p: 0 });
data.totals = { fresh: sum(data.agg), replay: sum(data.replay) };
const gz = gzipSync(JSON.stringify(data)); writeFileSync(out, gz);
console.log(JSON.stringify({ out, bytes: gz.length, counts, totals: data.totals, wallet: data.state.arena?.walletSol, grok: data.state.helper_training?.grok && { trades: data.state.helper_training.grok.trades, at: data.state.helper_training.grok.at } }));
process.exit(0);
