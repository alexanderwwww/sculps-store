// The brain's raw read of the training arena: every virtual trade so far, cut by entry rule, coin tier, stop, target, hold and regime.
//   DATABASE_URL=... node tools/mob/scripts/aq-brain-report.mjs      (read-only)
// Columns: trades | win % | average result per trade, % of the trade | total SOL.
import { db } from "../src/db.mjs";
const d = db({ DATABASE_URL: process.env.DATABASE_URL });
const C = `day, variant, tier, regime, n, wins, pnl_sol`, U = `(SELECT ${C} FROM mob_aq_arena_agg UNION ALL SELECT ${C} FROM mob_aq_arena_replay) x`;
const m = `sum(n)::int n, round((100.0*sum(wins)/nullif(sum(n),0))::numeric,1) win, round((sum(pnl_sol)/nullif(sum(n),0)*100)::numeric,3) avg, round(sum(pnl_sol)::numeric,2) pnl`;
const show = async (t, q) => { console.log("\n## " + t); for (const r of await d.q(q)) console.log(Object.values(r).join(" | ")); };
const part = (i) => `split_part(variant,'|',${i})`;
await show("total", `SELECT ${m} FROM ${U}`);
await show("entry rule", `SELECT ${part(1)} e, ${m} FROM ${U} GROUP BY 1 ORDER BY 4 DESC`);
await show("tier", `SELECT tier, ${m} FROM ${U} GROUP BY 1 ORDER BY 1`);
await show("stop", `SELECT ${part(2)} s, ${m} FROM ${U} GROUP BY 1 ORDER BY 1`);
await show("target", `SELECT ${part(3)} r, ${m} FROM ${U} GROUP BY 1 ORDER BY 1`);
await show("hold", `SELECT ${part(4)} h, ${m} FROM ${U} GROUP BY 1 ORDER BY 4 DESC`);
await show("tier x hold", `SELECT tier, ${part(4)} h, ${m} FROM ${U} GROUP BY 1,2 ORDER BY 1,5 DESC`);
await show("regime", `SELECT regime, ${m} FROM ${U} GROUP BY 1 ORDER BY 2 DESC`);
await show("day", `SELECT day::text, ${m} FROM ${U} GROUP BY 1 ORDER BY 1`);
await show("entry rule x tier (150+ trades)", `SELECT ${part(1)} e, tier, ${m} FROM ${U} GROUP BY 1,2 HAVING sum(n)>=150 ORDER BY 5 DESC`);
await show("measured round-trip cost % (tier | size SOL | quotes | median)", `SELECT tier, round(size_sol::numeric,1) sz, count(*) n, round((percentile_cont(0.5) within group (order by rt_pct))::numeric,3) med FROM mob_aq_arena_costs GROUP BY 1,2 ORDER BY 1,2`);
process.exit(0);
