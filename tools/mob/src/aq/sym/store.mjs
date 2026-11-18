// SYMBIOTE writer: one batched INSERT per table per flush (json_to_recordset), never one row per query.
// Tables mob_aq_sym_* (schema.mjs). Right calls go into mob_aq_sym_right in the shape src/aq/live.mjs reads:
// rightCalls() takes mints WHERE status = 'candidate'. A failed explosion is status 'fake_pump' (never read as a right call).
const J = (v) => JSON.stringify(v);

export async function flush(d, b, stats) {
  const q = [];
  if (b.coins.length) q.push(d.q(`INSERT INTO mob_aq_sym_coins (mint, symbol, name, gta, sol, created_at, n, buyers, px0, last, hi, end_reason, done, pp, chain, lanes, ctrl_pct, updated_at)
    SELECT mint, symbol, name, gta, sol, created_at, n, buyers, px0, last, hi, "end", done, pp, chain, lanes, ctrl, now() FROM json_to_recordset($1::json)
    AS x(mint text, symbol text, name text, gta boolean, sol boolean, created_at timestamptz, n int, buyers int, px0 float8, last float8, hi float8, "end" text, done boolean, pp boolean, chain boolean, lanes jsonb, ctrl float8)
    ON CONFLICT (mint) DO UPDATE SET symbol = COALESCE(EXCLUDED.symbol, mob_aq_sym_coins.symbol), name = COALESCE(EXCLUDED.name, mob_aq_sym_coins.name), gta = EXCLUDED.gta, sol = EXCLUDED.sol,
    n = EXCLUDED.n, buyers = EXCLUDED.buyers, px0 = COALESCE(mob_aq_sym_coins.px0, EXCLUDED.px0), last = EXCLUDED.last, hi = EXCLUDED.hi, end_reason = EXCLUDED.end_reason, done = EXCLUDED.done,
    pp = mob_aq_sym_coins.pp OR EXCLUDED.pp, chain = mob_aq_sym_coins.chain OR EXCLUDED.chain, lanes = EXCLUDED.lanes, ctrl_pct = EXCLUDED.ctrl_pct, updated_at = now()`, [J(b.coins)]));
  if (b.trades.length) q.push(d.q(`INSERT INTO mob_aq_sym_trades (mint, symbol, lane, entry_at, exit_at, entry_px, exit_px, cost_sol, proceeds_sol, net_pct, peak_pct, leg_pct, rt_pct, exit, half, gta)
    SELECT mint, symbol, lane, to_timestamp("entryAt" / 1000.0), to_timestamp("exitAt" / 1000.0), "entryPx", "exitPx", cost, proceeds, "netPct", "peakPct", "legPct", "rtPct" * 100, exit, half, gta
    FROM json_to_recordset($1::json) AS x(mint text, symbol text, lane text, "entryAt" float8, "exitAt" float8, "entryPx" float8, "exitPx" float8, cost float8, proceeds float8, "netPct" float8, "peakPct" float8, "legPct" float8, "rtPct" float8, exit text, half boolean, gta boolean)`, [J(b.trades)]));
  if (b.missed.length) q.push(d.q(`INSERT INTO mob_aq_sym_missed (mint, symbol, reason, at) SELECT mint, symbol, reason, to_timestamp(at / 1000.0) FROM json_to_recordset($1::json) AS x(mint text, symbol text, reason text, at float8)
    ON CONFLICT (mint) DO NOTHING`, [J(b.missed)]));
  if (b.gta.length) q.push(d.q(`INSERT INTO mob_aq_sym_gta (mint, m, o, h, l, c, n, src) SELECT mint, m, o, h, l, c, n, src FROM json_to_recordset($1::json) AS x(mint text, m bigint, o float8, h float8, l float8, c float8, n int, src text)
    ON CONFLICT (mint, m) DO UPDATE SET h = GREATEST(mob_aq_sym_gta.h, EXCLUDED.h), l = LEAST(mob_aq_sym_gta.l, EXCLUDED.l), c = EXCLUDED.c, n = mob_aq_sym_gta.n + EXCLUDED.n`, [J(b.gta)]));
  if (b.bars?.length) q.push(d.q(`INSERT INTO mob_aq_sym_bars (mint, t, o, h, l, c, v) SELECT mint, t, o, h, l, c, v FROM json_to_recordset($1::json) AS x(mint text, t bigint, o float8, h float8, l float8, c float8, v float8)
    ON CONFLICT (mint, t) DO UPDATE SET h = GREATEST(mob_aq_sym_bars.h, EXCLUDED.h), l = LEAST(mob_aq_sym_bars.l, EXCLUDED.l), c = EXCLUDED.c, v = EXCLUDED.v`, [J(b.bars)]));
  // 5) the paper wallets as running totals (retention of old trades never changes them)
  const per = {}; for (const t of b.trades) { const w = per[t.lane] || (per[t.lane] = { pnl: 0, n: 0, wins: 0 }); w.pnl += (t.proceeds - t.cost) / t.cost; w.n++; if (t.netPct > 0) w.wins++; }
  for (const [lane, w] of Object.entries(per)) q.push(d.q(`INSERT INTO mob_aq_sym_stats (k, v, at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (k) DO UPDATE SET at = now(),
    v = jsonb_build_object('pnl', COALESCE((mob_aq_sym_stats.v->>'pnl')::float8, 0) + ($2::jsonb->>'pnl')::float8, 'n', COALESCE((mob_aq_sym_stats.v->>'n')::int, 0) + ($2::jsonb->>'n')::int, 'wins', COALESCE((mob_aq_sym_stats.v->>'wins')::int, 0) + ($2::jsonb->>'wins')::int)`, ["wallet:" + lane, J(w)]));
  if (b.lessons.length) q.push(d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) SELECT dept, kind, text, data FROM json_to_recordset($1::json) AS x(dept text, kind text, text text, data jsonb)`, [J(b.lessons)]));
  if (stats) q.push(d.q(`INSERT INTO mob_aq_sym_stats (k, v, at) VALUES ('live', $1::jsonb, now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, at = now()`, [J(stats)]));
  await Promise.all(q);
  return { coins: b.coins.length, trades: b.trades.length, missed: b.missed.length, gta: b.gta.length, lessons: b.lessons.length };
}

// The verdict of the deep checks on a coin that exploded on paper. Healthy -> 'candidate' (the live gate's right call); not -> 'fake_pump'.
export async function writeRight(d, x, res) {
  const status = res.verdict.ok ? "candidate" : "fake_pump";
  await d.q(`INSERT INTO mob_aq_sym_right (mint, symbol, lane, flagged_at, gain_pct, status, checks, checked_at) VALUES ($1, $2, $3, now(), $4, $5, $6::jsonb, now())
    ON CONFLICT (mint) DO UPDATE SET symbol = EXCLUDED.symbol, lane = EXCLUDED.lane, flagged_at = now(), gain_pct = GREATEST(COALESCE(mob_aq_sym_right.gain_pct, 0), EXCLUDED.gain_pct), status = EXCLUDED.status, checks = EXCLUDED.checks, checked_at = now()`,
    [x.mint, x.symbol, x.lane, x.gainPct, status, J({ ...res.checks, failed: res.verdict.failed, flagPx: x.px ?? null, flagAt: new Date().toISOString() })]);
  const text = res.verdict.ok
    ? `RIGHT CALL ${x.symbol || x.mint.slice(0, 6)} (${x.mint}): +${Math.round(x.gainPct)}% on paper in the ${x.lane} lane and every health check passed. It may now be considered by the live chart trader.`
    : `FAKE PUMP ${x.symbol || x.mint.slice(0, 6)} (${x.mint}): +${Math.round(x.gainPct)}% on paper in the ${x.lane} lane, but it failed: ${res.verdict.failed.join("; ")}.`;
  await d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ('symbiote', $1, $2, $3::jsonb)`, [res.verdict.ok ? "right_call" : "fake_pump", text, J({ mint: x.mint, lane: x.lane, gainPct: x.gainPct, failed: res.verdict.failed })]);
  if (!res.verdict.ok) await d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ('symbiote', 'pain', $1, $2::jsonb)`, [`PAIN fake pump ${x.symbol || x.mint.slice(0, 6)}: the ${x.lane} lane rode it to +${Math.round(x.gainPct)}% on paper, but it was not healthy. Should have caught it: ${res.verdict.failed.join("; ")}.`, J({ mint: x.mint, lane: x.lane, gainPct: x.gainPct, rule: res.verdict.failed })]);
  return status;
}

// RETENTION (hourly): coins, misses and paper trades older than 7 days go (their lessons and PAIN rows stay in the brain);
// GTA coins, right calls and fake pumps are kept for life. Returns the rows removed per table.
export const KEEP_DAYS = 7;
export async function retention(d, days = KEEP_DAYS) {
  // symbiote brain rows: hourly summaries and old per-trade lessons go after 30 days; PAIN, right calls and fake pumps stay
  await d.q(`DELETE FROM mob_aq_brain WHERE dept = 'symbiote' AND kind IN ('lesson', 'sym_hour') AND at < now() - interval '30 days'`);
  await d.q(`DELETE FROM mob_aq_sym_bars WHERE t < extract(epoch from now())::bigint - 2 * 86400`);
  const [c, m, t] = await Promise.all([
    d.q(`DELETE FROM mob_aq_sym_coins c WHERE c.created_at < now() - $1::int * interval '1 day' AND NOT c.gta AND NOT EXISTS (SELECT 1 FROM mob_aq_sym_right r WHERE r.mint = c.mint) RETURNING 1`, [days]),
    d.q(`DELETE FROM mob_aq_sym_missed WHERE at < now() - $1::int * interval '1 day' RETURNING 1`, [days]),
    d.q(`DELETE FROM mob_aq_sym_trades WHERE at < now() - $1::int * interval '1 day' AND NOT gta RETURNING 1`, [days]),
  ]);
  return { coins: c.length, missed: m.length, trades: t.length };
}
