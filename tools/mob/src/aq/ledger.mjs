// Aquarius paper ledger: the only place that moves cash, opens a position or closes one.
// Neon over HTTP runs each query as its own transaction, so every money move here is ONE statement: the claim of the
// position row, the trade row, the cash change and the flow rows commit together or not at all. Two callers that race
// (a double-clicked SELL ALL, the cron tick against an HTTP sell-all, two overlapping ticks) cannot both win a claim:
// the loser's statement finds no row and writes nothing. Cash is never read, changed in JavaScript and written back.
// (2026-11-16 14:39Z: SELL ALL read the open rows, then sold them with separate statements; three overlapping requests
// each sold the same five positions and each added the proceeds to cash.)
export const START_SOL = 1;
const CASH = `(v #>> '{}')::float8`;
const DUP = /duplicate key|unique constraint/i;

// The reconciliation identity. Every buy takes size+fee out of cash, every partial sale and close puts SOL back, so
//   cash = base cash + realized P&L of trades after the base - (cost of open positions - what they already paid back).
// The base is 1 SOL at trade 0 until Alex rebuilds the island (which writes the positions off and restarts the wallet).
export async function reconcile(d) {
  const r = await d.one(`SELECT (SELECT ${CASH} FROM mob_aq_state WHERE k='cash_sol') cash, b.cash base_cash, b.trade_id base_trade,
      (SELECT coalesce(sum(pnl_sol),0)::float8 FROM mob_aq_trades WHERE id > b.trade_id) realized,
      (SELECT coalesce(sum(size_sol + fee_sol - realized_sol),0)::float8 FROM mob_aq_positions) open_cost,
      (SELECT count(*)::int FROM (SELECT position_id FROM mob_aq_trades WHERE position_id IS NOT NULL AND id > b.trade_id GROUP BY position_id HAVING count(*) > 1) x) dup_positions
    FROM (SELECT coalesce((SELECT (v->>'cash')::float8 FROM mob_aq_state WHERE k='ledger_base'), $1::float8) cash, coalesce((SELECT (v->>'tradeId')::int FROM mob_aq_state WHERE k='ledger_base'), 0) trade_id) b`, [START_SOL]);
  const expected = r.base_cash + r.realized - r.open_cost;
  const diff = r.cash == null ? null : r.cash - expected;
  return { ok: diff != null && Math.abs(diff) < 1e-6 && r.dup_positions === 0, cashSol: r.cash, expectedSol: expected, diffSol: diff, baseSol: r.base_cash, baseTradeId: r.base_trade, realizedSol: r.realized, openCostSol: r.open_cost, duplicateCloses: r.dup_positions };
}

// Open a position: debit cash, take a free slot, insert the row and the two flow rows in one statement.
// Returns the new row id, or null when the claim lost (no cash, no free slot, the coin is already held).
// Two racing opens cannot both land: the slot and the mint are unique, and a unique violation rolls the debit back too.
export async function openPosition(d, r, maxOpen) {
  const cols = ["strategy", "mint", "pool", "symbol", "decimals", "tokens_raw", "size_sol", "fee_sol", "entry_price_usd", "entry_mid_usd", "stop_price", "target_price", "stop_pct", "target_pct", "rt_pct", "buy_slip_pct",
    "last_price_usd", "last_value_sol", "tier", "tag", "soft", "score", "variant", "entry_variant", "strength", "sol_usd_entry", "exit_k", "tvar", "atr5_pct", "hold_min", "sizing"];
  const TYPE = { strategy: "text", mint: "text", pool: "text", symbol: "text", decimals: "int", tokens_raw: "text", soft: "jsonb", tier: "text", tag: "text", variant: "text", entry_variant: "text", tvar: "text", sizing: "jsonb" };
  const vals = cols.map((c) => (c === "soft" ? JSON.stringify(r.soft ?? []) : c === "sizing" ? (r.sizing ? JSON.stringify(r.sizing) : null) : r[c] ?? null));
  const n = cols.length;
  try {
    const row = await d.one(`WITH pay AS (
        UPDATE mob_aq_state SET v = to_jsonb(${CASH} - $${n + 1}::float8), at = now() WHERE k='cash_sol' AND ${CASH} >= $${n + 1}::float8
          AND (SELECT count(*) FROM mob_aq_positions) < $${n + 2}::int AND NOT EXISTS (SELECT 1 FROM mob_aq_positions WHERE mint = $2::text) RETURNING 1),
      p AS (INSERT INTO mob_aq_positions (${cols.join(", ")}, time_stop_at, slot)
        SELECT ${cols.map((c, i) => `$${i + 1}::${TYPE[c] || "float8"}`).join(", ")}, to_timestamp($${n + 3}::float8),
          (SELECT min(s) FROM generate_series(1, $${n + 2}::int) s WHERE s NOT IN (SELECT slot FROM mob_aq_positions WHERE slot IS NOT NULL))
        FROM pay RETURNING id, symbol, size_sol, fee_sol),
      f AS (INSERT INTO mob_aq_flows (kind, sol, dept, label, position_id)
        SELECT x.kind, x.sol, x.dept, x.label, p.id FROM p, LATERAL (VALUES ('buy', -p.size_sol, 'execution', $${n + 4}::text), ('fee', -p.fee_sol, 'costs', 'network fee ' || coalesce(p.symbol, ''))) x(kind, sol, dept, label) RETURNING 1)
      SELECT id, (SELECT count(*) FROM f) flows FROM p`, [...vals, r.size_sol + r.fee_sol, maxOpen, r.timeStopSec, r.buyLabel || `buy ${r.symbol}`]);
    return row ? row.id : null;
  } catch (e) {
    if (DUP.test(String(e.message || e)) || /null value in column "slot"/i.test(String(e.message || e))) return null;
    throw e;
  }
}

// Variant B scale-out: sell half. The claim is the UPDATE guarded by half_done=false and the token amount the quote was for.
export async function scaleOut(d, p, { half, gross, feeSol, stopPrice }) {
  const left = (BigInt(p.tokens_raw) - BigInt(half)).toString();
  return d.one(`WITH claimed AS (UPDATE mob_aq_positions SET tokens_raw = $3, realized_sol = realized_sol + $4::float8, half_done = true, stop_price = $5
        WHERE id = $1 AND half_done = false AND tokens_raw = $2 RETURNING id, symbol, tokens_raw, realized_sol, stop_price),
      c AS (UPDATE mob_aq_state SET v = to_jsonb(${CASH} + $4::float8), at = now() WHERE k='cash_sol' AND EXISTS (SELECT 1 FROM claimed) RETURNING 1),
      f AS (INSERT INTO mob_aq_flows (kind, sol, dept, label, position_id)
        SELECT x.kind, x.sol, x.dept, x.label, claimed.id FROM claimed, LATERAL (VALUES ('sell', $6::float8, 'execution', 'sell half ' || coalesce(claimed.symbol, '') || ' at +1R (variant B)'), ('fee', -$7::float8, 'costs', 'network fee ' || coalesce(claimed.symbol, ''))) x(kind, sol, dept, label) RETURNING 1)
      SELECT claimed.*, (SELECT count(*) FROM c) + (SELECT count(*) FROM f) wrote FROM claimed`, [p.id, p.tokens_raw, left, gross - feeSol, stopPrice, gross, feeSol]);
}

// Close a position at an executable quote. The claim is the DELETE: it only wins while the row still exists with the token
// amount the quote was made for. The trade row, the cash credit and the three flow rows ride on the same statement.
// Returns the trade row, or null when another caller already closed (or changed) the position.
export async function closePosition(d, p, { gross, feeSol, exitPx = null, slip = null, why, gradePrefix, exitMid = null }) {
  return d.one(`WITH claimed AS (DELETE FROM mob_aq_positions WHERE id = $1 AND tokens_raw = $2 RETURNING *),
      t AS (INSERT INTO mob_aq_trades (position_id, strategy, mint, symbol, size_sol, back_sol, entry_price_usd, exit_price_usd, pnl_sol, pnl_pct, fees_sol, slippage_pct, reason, grade, opened_at,
          tier, tag, soft, variant, entry_variant, scaled, strength, pool, stop_price, target_price, stop_pct, target_pct, rt_pct, entry_mid_usd, exit_mid_usd, score, buy_slip_pct, time_stop_at, sol_usd_entry, tvar, atr5_pct, hold_min, stop_unconfirmed, sizing)
        SELECT id, strategy, mint, symbol, size_sol, $3::float8 - $4::float8, entry_price_usd, $5::float8, realized_sol + $3::float8 - $4::float8 - (size_sol + fee_sol),
          round(((realized_sol + $3::float8 - $4::float8 - (size_sol + fee_sol)) / (size_sol + fee_sol) * 100)::numeric, 3)::float8, fee_sol + $4::float8, $6::float8, $7::text,
          $8::text || CASE WHEN realized_sol + $3::float8 - $4::float8 - (size_sol + fee_sol) > 0 THEN '/win' ELSE '/loss' END, opened_at,
          tier, tag, coalesce(soft, '[]'::jsonb), coalesce(variant, 'A'), entry_variant, half_done, strength, pool, stop_price, target_price, stop_pct, target_pct, rt_pct, entry_mid_usd, $9::float8, score, buy_slip_pct, time_stop_at, sol_usd_entry, tvar, atr5_pct, hold_min, stop_unconfirmed, sizing
        FROM claimed RETURNING *),
      c AS (UPDATE mob_aq_state SET v = to_jsonb(${CASH} + $3::float8 - $4::float8), at = now() WHERE k='cash_sol' AND EXISTS (SELECT 1 FROM t) RETURNING 1),
      f AS (INSERT INTO mob_aq_flows (kind, sol, dept, label, position_id, trade_id)
        SELECT x.kind, x.sol, x.dept, x.label, t.position_id, t.id FROM t, LATERAL (VALUES
          ('sell', $3::float8, 'execution', 'sell ' || coalesce(t.symbol, '') || ' (' || $7::text || ')'),
          ('fee', -$4::float8, 'costs', 'network fee ' || coalesce(t.symbol, '')),
          (CASE WHEN t.pnl_sol > 0 THEN 'win' ELSE 'loss' END, t.pnl_sol, 'review', coalesce(t.symbol, '') || ' ' || CASE WHEN t.pnl_sol > 0 THEN '+' ELSE '' END || round(t.pnl_pct::numeric, 2)::text || '%')) x(kind, sol, dept, label) RETURNING 1)
      SELECT t.*, (SELECT count(*) FROM c) + (SELECT count(*) FROM f) wrote FROM t`, [p.id, p.tokens_raw, gross, feeSol, exitPx, slip, why, gradePrefix, exitMid]);
}

// The wallet base: what was put into the paper wallet (1 SOL at the start, plus every CEO deposit). Equity is measured against
// it, so a deposit is a step in the base and never shows up as profit.
const BASE = `coalesce((SELECT (v->>'cash')::float8 FROM mob_aq_state WHERE k='ledger_base'), ${START_SOL}::float8)`;
export const walletBase = async (d) => (await d.one(`SELECT ${BASE} b`)).b;

// A CEO deposit: cash and the base rise by the same amount in one statement, so base + realized - open cost = cash still
// holds and nothing in the trade history changes. `id` makes it idempotent: the same deposit can never be applied twice.
export async function deposit(d, { id, sol, note = null }) {
  if (!id || !(sol > 0) || !Number.isFinite(sol)) throw new Error("deposit needs an id and a positive amount");
  const entry = JSON.stringify([{ id, sol, note, at: new Date().toISOString() }]);
  const r = await d.one(`WITH b AS (INSERT INTO mob_aq_state (k, v, at) VALUES ('ledger_base', jsonb_build_object('cash', ${START_SOL}::float8 + $2::float8, 'tradeId', 0, 'deposits', $3::jsonb), now())
        ON CONFLICT (k) DO UPDATE SET v = mob_aq_state.v || jsonb_build_object('cash', (mob_aq_state.v->>'cash')::float8 + $2::float8, 'deposits', coalesce(mob_aq_state.v->'deposits', '[]'::jsonb) || $3::jsonb), at = now()
        WHERE NOT coalesce(mob_aq_state.v->'deposits', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('id', $1::text)) RETURNING (v->>'cash')::float8 base),
      c AS (UPDATE mob_aq_state SET v = to_jsonb(${CASH} + $2::float8), at = now() WHERE k='cash_sol' AND EXISTS (SELECT 1 FROM b) RETURNING ${CASH} cash)
      SELECT (SELECT base FROM b) base, (SELECT cash FROM c) cash`, [id, sol, entry]);
  return r?.base != null ? { applied: true, baseSol: r.base, cashSol: r.cash } : { applied: false };
}

// Alex's rebuild: write the open positions off, restart the wallet at its base (start + deposits) and move the
// reconciliation point past every trade so far, in one statement.
export async function resetLedger(d) {
  const r = await d.one(`WITH del AS (DELETE FROM mob_aq_positions RETURNING id),
      c AS (UPDATE mob_aq_state SET v = to_jsonb(${BASE}), at = now() WHERE k='cash_sol' RETURNING 1),
      b AS (INSERT INTO mob_aq_state (k, v, at) VALUES ('ledger_base', jsonb_build_object('cash', ${START_SOL}::float8, 'tradeId', (SELECT coalesce(max(id),0) FROM mob_aq_trades), 'at', now()), now())
        ON CONFLICT (k) DO UPDATE SET v = mob_aq_state.v || jsonb_build_object('tradeId', (SELECT coalesce(max(id),0) FROM mob_aq_trades), 'at', now()), at = now() RETURNING (v->>'cash')::float8 base)
      SELECT (SELECT count(*)::int FROM del) n, (SELECT base FROM b) base, (SELECT count(*) FROM c) wrote`);
  return { n: r.n, baseSol: r.base };
}

// One tick at a time. The lock row carries its owner and expires, so a tick that died cannot block the desk for good
// and a slow tick cannot release a lock that a later tick now holds.
export const TICK_LOCK_SEC = 120;
export async function tickLock(d) {
  const owner = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const got = await d.one(`INSERT INTO mob_aq_state (k, v, at) VALUES ('tick_lock', $1::jsonb, now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, at = now()
    WHERE mob_aq_state.v = 'false'::jsonb OR mob_aq_state.at < now() - make_interval(secs => $2) RETURNING k`, [JSON.stringify({ owner }), TICK_LOCK_SEC]);
  return got ? owner : null;
}
export const tickUnlock = (d, owner) => d.q(`UPDATE mob_aq_state SET v = 'false'::jsonb, at = now() WHERE k='tick_lock' AND v = $1::jsonb`, [JSON.stringify({ owner })]);
