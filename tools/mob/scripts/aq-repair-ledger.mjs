// One-off, idempotent ledger repair for the Aquarius paper book. DRY RUN by default; pass --apply to write.
//   DATABASE_URL=... node tools/mob/scripts/aq-repair-ledger.mjs            (prints what it would do, changes nothing)
//   DATABASE_URL=... node tools/mob/scripts/aq-repair-ledger.mjs --apply    (does it, prints before/after)
// What it repairs (2026-11-16 14:39Z, SELL ALL pressed once, served by overlapping requests): a position closed more than
// once. For each such position the FIRST trade is kept; the later trades and their flow rows (sell, network fee, win/loss)
// are deleted. Then cash is recomputed from first principles in one statement:
//   cash = base (1 SOL, or the last rebuild) + realized P&L of the remaining trades - (cost of open positions - SOL they already paid back)
// Running it again finds nothing to do and leaves cash where it is.
import { db } from "../src/db.mjs";
import { reconcile } from "../src/aq/ledger.mjs";

export async function repairLedger(d, { apply = false, log = console.log } = {}) {
  const before = await reconcile(d);
  log(`BEFORE  cash ${before.cashSol}  expected ${before.expectedSol}  diff ${before.diffSol}  (base ${before.baseSol} after trade #${before.baseTradeId}, realized ${before.realizedSol}, open cost ${before.openCostSol}, positions closed more than once: ${before.duplicateCloses})`);
  const groups = await d.q(`SELECT position_id, min(symbol) symbol, min(reason) reason, count(*)::int n, array_agg(id ORDER BY id) ids, min(closed_at) first_at, max(closed_at) last_at,
      extract(epoch FROM max(closed_at) - min(closed_at))::float8 span_sec, array_agg(pnl_sol ORDER BY id) pnls, array_agg(back_sol ORDER BY id) backs
    FROM mob_aq_trades WHERE position_id IS NOT NULL AND id > $1 GROUP BY position_id HAVING count(*) > 1 ORDER BY position_id`, [before.baseTradeId]);
  const plan = [];
  for (const g of groups) {
    const keep = g.ids[0], extra = g.ids.slice(1);
    // (to_jsonb: the trade_id column only exists once the fixed engine has migrated; the script must run before that too)
    // flow rows of this position's closes: tagged ones by trade id; untagged (written before the fix) by label inside the seconds the closes took
    const fl = await d.q(`SELECT id, kind, sol, label, at, CASE WHEN kind='sell' THEN 'sell' WHEN kind='fee' THEN 'fee' ELSE 'result' END cls FROM mob_aq_flows f
      WHERE ((to_jsonb(f)->>'trade_id')::int = ANY($1::int[])) OR (to_jsonb(f)->>'trade_id' IS NULL AND to_jsonb(f)->>'position_id' IS NULL AND at >= $2::timestamptz - interval '2 seconds' AND at <= $3::timestamptz + interval '10 seconds'
        AND ((kind='sell' AND label = 'sell ' || $4 || ' (' || $5 || ')') OR (kind='fee' AND label = 'network fee ' || $4) OR (kind IN ('win','loss') AND label LIKE $4 || ' %'))) ORDER BY id`,
      [g.ids, g.first_at, g.last_at, g.symbol, g.reason]);
    const del = [];
    for (const cls of ["sell", "fee", "result"]) del.push(...fl.filter((f) => f.cls === cls).slice(1).map((f) => f.id));
    const expected = extra.length * 3, sane = g.span_sec <= 30 && del.length === expected;
    plan.push({ position: g.position_id, symbol: g.symbol, reason: g.reason, trades: g.n, keep, deleteTrades: extra, deleteFlows: del, spanSec: g.span_sec, removedPnl: g.pnls.slice(1).reduce((a, b) => a + b, 0), removedBack: g.backs.slice(1).reduce((a, b) => a + b, 0), sane });
    log(`  position ${g.position_id} ${g.symbol}: ${g.n} closes in ${g.span_sec.toFixed(2)} s ("${g.reason}"), keep trade #${keep}, delete trade(s) #${extra.join(", #")} and ${del.length} flow row(s) [${del.join(", ")}]${sane ? "" : `  <-- NOT TOUCHED: expected ${expected} flow rows within 30 s, check by hand`}`);
  }
  const todo = plan.filter((p) => p.sane);
  const predicted = before.baseSol + before.realizedSol - todo.reduce((a, p) => a + p.removedPnl, 0) - before.openCostSol;
  log(`PLAN    delete ${todo.reduce((a, p) => a + p.deleteTrades.length, 0)} duplicate trade(s) and ${todo.reduce((a, p) => a + p.deleteFlows.length, 0)} flow row(s); cash ${before.cashSol} -> ${predicted} (change ${predicted - before.cashSol})`);
  if (!apply) { log("DRY RUN: nothing was changed. Run again with --apply."); return { applied: false, before, plan, predictedCashSol: predicted }; }
  for (const p of todo) {
    const r = await d.one(`WITH dt AS (DELETE FROM mob_aq_trades WHERE id = ANY($1::int[]) AND position_id = $3 AND id <> $4 RETURNING id), df AS (DELETE FROM mob_aq_flows WHERE id = ANY($2::bigint[]) RETURNING id)
      SELECT (SELECT count(*)::int FROM dt) t, (SELECT count(*)::int FROM df) f`, [p.deleteTrades, p.deleteFlows, p.position, p.keep]);
    log(`  position ${p.position} ${p.symbol}: deleted ${r.t} trade(s), ${r.f} flow row(s)`);
  }
  // cash from first principles, computed and written by one statement (no read-then-write)
  const c = await d.one(`UPDATE mob_aq_state s SET v = to_jsonb(x.expected), at = now() FROM (
      SELECT b.cash + (SELECT coalesce(sum(pnl_sol),0)::float8 FROM mob_aq_trades WHERE id > b.trade_id) - (SELECT coalesce(sum(size_sol + fee_sol - realized_sol),0)::float8 FROM mob_aq_positions) expected
      FROM (SELECT coalesce((SELECT (v->>'cash')::float8 FROM mob_aq_state WHERE k='ledger_base'), 1::float8) cash, coalesce((SELECT (v->>'tradeId')::int FROM mob_aq_state WHERE k='ledger_base'), 0) trade_id) b) x
    WHERE s.k='cash_sol' AND abs((s.v #>> '{}')::float8 - x.expected) > 1e-12 RETURNING (s.v #>> '{}')::float8 cash`);
  const after = await reconcile(d);
  log(`AFTER   cash ${after.cashSol}  expected ${after.expectedSol}  diff ${after.diffSol}  positions closed more than once: ${after.duplicateCloses}  reconciles: ${after.ok}${c ? "" : "  (cash was already right, not rewritten)"}`);
  if (todo.length || c) await d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ('ops','event',$1,$2)`, [
    `Ledger repaired: ${todo.reduce((a, p) => a + p.deleteTrades.length, 0)} duplicate close(s) removed (${todo.map((p) => `${p.symbol} x${p.trades}`).join(", ") || "none"}), each position keeps its first sale; cash corrected from ${before.cashSol} to ${after.cashSol} SOL (base ${after.baseSol} + realized ${after.realizedSol} - open cost ${after.openCostSol}).`,
    JSON.stringify({ before, after, plan })]);
  return { applied: true, before, after, plan };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set"); process.exit(1); }
  const env = { DATABASE_URL: process.env.DATABASE_URL, MOB_SCHEMA: process.env.MOB_SCHEMA };
  const r = await repairLedger(db(env), { apply: process.argv.includes("--apply") });
  process.exit(r.applied && !r.after.ok ? 2 : 0);
}
