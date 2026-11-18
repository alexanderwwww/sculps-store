// THE KEEPER: the brain is fed for a month without Claude, Grok or anyone watching. The Worker learns by code alone; what can
// kill it is the database filling up, or dying silently. So: (1) raw bulk is rolled into small aggregates that keep what was
// learned, in single statements (a rollup and the delete of what it replaces commit together); (2) the brain is backed up to
// R2 every day; (3) a watchdog measures the database against its limit and raises a brain alert; (4) a weekly review is
// written by code. Never deleted here: trades, positions, flows, brain, rules, signals, votes, chat, picks, the whale book.
// Measured 2026-11-16 (production, 17 h of running): about 105,000 swaps a day = 54 MB/day in mob_aq_wtrades, candles
// 18 MB/day, Council verdicts 7.5 MB/day. With the old rules (swaps 14 days, the rest never) that is over 1 GB in two weeks.
import { db } from "../db.mjs";
import { stats, round } from "./logic.mjs";

// Storage limit: Neon's Free plan allows 1 GB per project (neon.com/docs/introduction/plans, read 2026-11-16; paid plans are
// unlimited at $0.35/GB-month). The plan of this project cannot be read with what the Worker holds, so the keeper assumes the
// smaller number. AQ_DB_LIMIT_MB overrides it.
export const KEEP = { limitMb: 1024, alertPct: 60, hardPct: 80, backupDays: 60, perMint: 100,
  normal: { swapHours: 48, pairIdleDays: 7, noiseIdleDays: 7, candle1mHours: 48, candle5mDays: 7, councilDays: 7 },
  tight: { swapHours: 24, pairIdleDays: 3, noiseIdleDays: 3, candle1mHours: 24, candle5mDays: 4, councilDays: 3 },   // over 60% of the limit
  hard: { swapHours: 6, pairIdleDays: 1, noiseIdleDays: 1, candle1mHours: 6, candle5mDays: 2, councilDays: 1 } };    // over 80%
export const BACKUP_TABLES = ["mob_aq_trades", "mob_aq_brain", "mob_aq_rules", "mob_aq_strategies", "mob_aq_whales", "mob_aq_signals", "mob_aq_votes", "mob_aq_chat", "mob_aq_picks", "mob_aq_shadow", "mob_aq_flows", "mob_aq_positions",
  "mob_aq_council_daily", "mob_aq_wfold", "mob_aq_candles_hour", "mob_aq_arena_agg", "mob_aq_arena_picks", "mob_aq_state"];
const getState = async (d, k, dflt = null) => (await d.one(`SELECT v FROM mob_aq_state WHERE k=$1`, [k]))?.v ?? dflt;
const setState = (d, k, v) => d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ($1,$2,now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [k, JSON.stringify(v)]);
const brain = (d, dept, kind, text, data = null) => d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ($1,$2,$3,$4)`, [dept, kind, text, data && JSON.stringify(data)]);
// run `fn` once per period: the claim is one statement, so two overlapping runs cannot both do the work
const claim = async (d, k, mark) => !!(await d.one(`INSERT INTO mob_aq_state (k, v, at) VALUES ($1, to_jsonb($2::bigint), now()) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, at = now() WHERE (mob_aq_state.v #>> '{}')::bigint < $2::bigint RETURNING k`, [k, mark]));

// ---------------------------------------------------------------- rollups (each ONE statement)
// Raw swaps -> one row per wallet and coin with exactly what the whale book reads (SOL bought and sold, swap count, first buy,
// first sell, last sell). The newest 100 swaps of every coin stay raw whatever their age: the swap reader fetches a coin's
// latest swaps again and again, and only a raw row can tell it "already counted".
export async function rollSwaps(d, hours = KEEP.normal.swapHours, perMint = KEEP.perMint) {
  const r = await d.one(`WITH del AS (DELETE FROM mob_aq_wtrades WHERE ctid IN (SELECT ctid FROM (SELECT ctid, at, row_number() OVER (PARTITION BY mint ORDER BY at DESC, tx) rn FROM mob_aq_wtrades) x
        WHERE at < now() - make_interval(hours => $1::int) AND rn > $2::int) RETURNING wallet, mint, kind, sol, at),
      up AS (INSERT INTO mob_aq_wroll AS r (wallet, mint, buy_sol, sell_sol, n, buys, sells, first_buy, first_sell, last_sell, first_at, last_at)
        SELECT wallet, mint, coalesce(sum(sol) FILTER (WHERE kind='buy'), 0), coalesce(sum(sol) FILTER (WHERE kind='sell'), 0), count(*)::int, count(*) FILTER (WHERE kind='buy')::int, count(*) FILTER (WHERE kind='sell')::int,
          min(at) FILTER (WHERE kind='buy'), min(at) FILTER (WHERE kind='sell'), max(at) FILTER (WHERE kind='sell'), min(at), max(at) FROM del GROUP BY wallet, mint
        ON CONFLICT (wallet, mint) DO UPDATE SET buy_sol = r.buy_sol + EXCLUDED.buy_sol, sell_sol = r.sell_sol + EXCLUDED.sell_sol, n = r.n + EXCLUDED.n, buys = r.buys + EXCLUDED.buys, sells = r.sells + EXCLUDED.sells,
          first_buy = least(r.first_buy, EXCLUDED.first_buy), first_sell = least(r.first_sell, EXCLUDED.first_sell), last_sell = greatest(r.last_sell, EXCLUDED.last_sell), first_at = least(r.first_at, EXCLUDED.first_at), last_at = greatest(r.last_at, EXCLUDED.last_at)
        RETURNING 1)
      SELECT (SELECT count(*)::int FROM del) swaps, (SELECT count(*)::int FROM up) pairs`, [hours, perMint]);
  return r;
}
// A wallet-and-coin pair nobody has touched for a week, of a wallet that is not in the whale book's short list, is folded into
// that wallet's own totals: coins, closed coins, wins, net SOL, swaps, the same numbers refreshWinners sums. A coin is "closed"
// by the book's own rule (bought before sold, held over a minute). Candidates, winners and KOL seeds keep every pair.
export async function foldPairs(d, idleDays = KEEP.normal.pairIdleDays, minHoldSec = 60) {
  return d.one(`WITH del AS (DELETE FROM mob_aq_wroll r WHERE last_at < now() - make_interval(days => $1::int)
        AND NOT EXISTS (SELECT 1 FROM mob_aq_wtrades t WHERE t.wallet = r.wallet AND t.mint = r.mint)
        AND NOT EXISTS (SELECT 1 FROM mob_aq_whales w WHERE w.wallet = r.wallet AND (w.cand OR w.winner OR w.source = 'kolscan')) RETURNING *),
      x AS (SELECT *, (buy_sol > 0 AND sell_sol > 0 AND first_buy < first_sell AND extract(epoch FROM last_sell - first_buy) > $2::int) ok FROM del),
      up AS (INSERT INTO mob_aq_wfold AS f (wallet, coins, closed, wins, net_sol, swaps, both_sides, last_at)
        SELECT wallet, count(*)::int, count(*) FILTER (WHERE ok)::int, count(*) FILTER (WHERE ok AND sell_sol > buy_sol)::int, coalesce(sum(sell_sol - buy_sol) FILTER (WHERE ok), 0), sum(n)::int, count(*) FILTER (WHERE buy_sol > 0 AND sell_sol > 0)::int, max(last_at) FROM x GROUP BY wallet
        ON CONFLICT (wallet) DO UPDATE SET coins = f.coins + EXCLUDED.coins, closed = f.closed + EXCLUDED.closed, wins = f.wins + EXCLUDED.wins, net_sol = f.net_sol + EXCLUDED.net_sol, swaps = f.swaps + EXCLUDED.swaps, both_sides = f.both_sides + EXCLUDED.both_sides, last_at = greatest(f.last_at, EXCLUDED.last_at) RETURNING 1)
      SELECT (SELECT count(*)::int FROM del) pairs, (SELECT count(*)::int FROM up) wallets`, [idleDays, minHoldSec]);
}
// The long tail: about 24,000 of 29,000 wallets a day trade one coin and are never seen again. A wallet with fewer than three
// coins in total, idle for a week, with nothing raw or paired left, cannot become a candidate (that takes five closed coins)
// without showing up again. Its fold row is dropped and counted, so the number of wallets ever seen is still known.
export async function dropNoise(d, idleDays = KEEP.normal.noiseIdleDays) {
  const r = await d.one(`WITH del AS (DELETE FROM mob_aq_wfold f WHERE coins < 3 AND last_at < now() - make_interval(days => $1::int)
        AND NOT EXISTS (SELECT 1 FROM mob_aq_wroll r WHERE r.wallet = f.wallet) AND NOT EXISTS (SELECT 1 FROM mob_aq_wtrades t WHERE t.wallet = f.wallet)
        AND NOT EXISTS (SELECT 1 FROM mob_aq_whales w WHERE w.wallet = f.wallet AND (w.cand OR w.winner OR w.source = 'kolscan')) RETURNING coins, swaps, closed, wins, net_sol)
      SELECT count(*)::int wallets, coalesce(sum(coins), 0)::int coins, coalesce(sum(swaps), 0)::int swaps, coalesce(sum(closed), 0)::int closed, coalesce(sum(wins), 0)::int wins, coalesce(sum(net_sol), 0)::float8 net_sol FROM del`, [idleDays]);
  if (r.wallets) await d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ('keeper_noise', $1::jsonb, now()) ON CONFLICT (k) DO UPDATE SET at = now(), v = (SELECT jsonb_object_agg(key, (coalesce((mob_aq_state.v->>key)::float8, 0) + (value #>> '{}')::float8)) FROM jsonb_each($1::jsonb))`, [JSON.stringify(r)]);
  return r;
}
// Candles: 1-minute bars older than `hours` -> 5-minute bars; 5-minute bars older than `days` -> 1-hour bars (kept for good).
// Open = the first bar's open, close = the last bar's close, high/low = the extremes, volume = the sum. Only whole buckets move.
const ROLL_CANDLES = (from, to) => `WITH del AS (DELETE FROM ${from} WHERE t < $1::bigint RETURNING *),
    up AS (INSERT INTO ${to} AS k (pool, t, o, h, l, c, v, bars)
      SELECT pool, t - t % $2::int, (array_agg(o ORDER BY t))[1], max(h), min(l), (array_agg(c ORDER BY t DESC))[1], coalesce(sum(v), 0), ${from === "mob_aq_candles" ? "count(*)::int" : "sum(bars)::int"} FROM del GROUP BY pool, t - t % $2::int
      ON CONFLICT (pool, t) DO UPDATE SET h = greatest(k.h, EXCLUDED.h), l = least(k.l, EXCLUDED.l), c = EXCLUDED.c, v = k.v + EXCLUDED.v, bars = k.bars + EXCLUDED.bars RETURNING 1)
    SELECT (SELECT count(*)::int FROM del) rolled, (SELECT count(*)::int FROM up) made`;
export async function rollCandles(d, { hours = KEEP.normal.candle1mHours, days = KEEP.normal.candle5mDays, nowSec = Date.now() / 1000 } = {}) {
  const c1 = Math.floor((nowSec - hours * 3600) / 3600) * 3600, c5 = Math.floor((nowSec - days * 86400) / 3600) * 3600;
  return { m5: await d.one(ROLL_CANDLES("mob_aq_candles", "mob_aq_candles_five"), [c1, 300]), h1: await d.one(ROLL_CANDLES("mob_aq_candles_five", "mob_aq_candles_hour"), [c5, 3600]) };
}
// Council verdicts older than `days`: a BLOCK becomes a daily count per reason (numbers in the reason replaced by #, so
// "score 66 under 70" and "score 61 under 70" are one line). Every PASS (the verdict of a trade) is kept as it is.
export async function compactCouncil(d, days = KEEP.normal.councilDays) {
  return d.one(`WITH del AS (DELETE FROM mob_aq_council WHERE at < now() - make_interval(days => $1::int) AND verdict <> 'PASS' RETURNING at, verdict, reason, facts),
      up AS (INSERT INTO mob_aq_council_daily AS c (day, verdict, kind, reason, n)
        SELECT (at AT TIME ZONE 'UTC')::date, verdict, coalesce(facts->>'block', 'none'), left(regexp_replace(coalesce(reason, ''), '[0-9]+(\\.[0-9]+)?', '#', 'g'), 160), count(*)::int FROM del GROUP BY 1, 2, 3, 4
        ON CONFLICT (day, verdict, kind, reason) DO UPDATE SET n = c.n + EXCLUDED.n RETURNING 1)
      SELECT (SELECT count(*)::int FROM del) rows, (SELECT count(*)::int FROM up) lines`, [days]);
}

// ---------------------------------------------------------------- watchdog
export async function measure(env) {
  const d = db(env), limitMb = Number(env.AQ_DB_LIMIT_MB) > 0 ? Number(env.AQ_DB_LIMIT_MB) : KEEP.limitMb, schema = d.schema || "public";
  const size = await d.one(`SELECT pg_database_size(current_database())::float8 / 1048576 mb`);
  const tables = await d.q(`SELECT c.relname t, round((pg_total_relation_size(c.oid) / 1048576.0)::numeric, 2)::float8 mb, greatest(c.reltuples, 0)::bigint rows FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1 AND c.relkind = 'r' AND c.relname LIKE 'mob\\_aq\\_%' ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 40`, [schema]);
  // a test schema is one of many in its database: there the Aquarius tables are what is measured
  const mb = d.schema ? tables.reduce((a, t) => a + t.mb, 0) : size.mb, pct = round((mb / limitMb) * 100, 1);
  return { dbMb: round(mb, 1), limitMb, pct, mode: pct >= KEEP.hardPct ? "hard" : pct >= KEEP.alertPct ? "tight" : "normal", tables: tables.map((t) => ({ table: t.t, mb: t.mb, rows: Number(t.rows) })), at: new Date().toISOString() };
}
// what the state shows: storage, plus how old the last tick and the last brain row are, read live
export async function watch(d, S) {
  const a = await d.one(`SELECT extract(epoch FROM now() - (SELECT max(at) FROM mob_aq_brain))::float8 brain_age, extract(epoch FROM now() - (SELECT at FROM mob_aq_state WHERE k='last_tick'))::float8 tick_age,
    extract(epoch FROM now() - least((SELECT min(at) FROM mob_aq_brain), (SELECT min(opened_at) FROM mob_aq_trades)))::float8 / 86400 days`);
  const st = S.storage || null, bk = S.backup || null;
  return { dbMb: st?.dbMb ?? null, limitMb: st?.limitMb ?? null, pctOfLimit: st?.pct ?? null, retention: st?.mode ?? null, measuredAt: st?.at ?? null, tables: st?.tables ?? [],
    lastTickAgeSec: a.tick_age == null ? null : Math.round(a.tick_age), ticksAlive: a.tick_age != null && a.tick_age < 300, lastBrainWriteAgeSec: a.brain_age == null ? null : Math.round(a.brain_age), daysOfHistory: a.days == null ? null : round(a.days, 2),
    lastBackup: bk ? { key: bk.key, at: bk.at, bytes: bk.bytes } : null, lastRollupAt: S.keeper?.at ?? null, limitSource: "Neon Free plan: 1 GB a project (neon.com/docs/introduction/plans, read 2026-11-16); this project's plan is not readable from the Worker" };
}
// called from the 5-minute cron, which is a different timer from the minute tick: if the minute tick has stopped, this still runs
export async function watchTicks(env) {
  const d = db(env), a = await d.one(`SELECT extract(epoch FROM now() - at)::float8 age FROM mob_aq_state WHERE k='last_tick'`);
  if (!a || a.age < 600) return { ok: true, ageSec: a ? Math.round(a.age) : null };
  if (await claim(d, "keeper_tick_alert", Math.floor(Date.now() / 3600000))) await brain(d, "ops", "alert", `WATCHDOG: the Aquarius tick has not finished for ${Math.round(a.age / 60)} minutes. Nothing is being learned and open positions are not being managed until it runs again.`, { ageSec: Math.round(a.age) });
  return { ok: false, ageSec: Math.round(a.age) };
}

// ---------------------------------------------------------------- backup to R2
const gzip = async (text) => new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
export const gunzip = async (bytes) => new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
export async function backup(env, { day = new Date().toISOString().slice(0, 10) } = {}) {
  if (!env.MEDIA) return { ok: false, error: "no R2 bucket bound" };
  const d = db(env), tables = {};
  for (const t of BACKUP_TABLES) tables[t] = t === "mob_aq_state" ? await d.q(`SELECT * FROM mob_aq_state WHERE k NOT IN ('tape','health','tick_lock','arena','storage','gta6_list','rh_tokens','rh_oauth','rh_refresh_lock','sol_wallet_key') AND k NOT LIKE '%\\_min'`) : await d.q(`SELECT * FROM ${t}`);
  // the whale book's pairs: kept for the wallets that matter (the rest are in their fold totals)
  tables.mob_aq_wroll = await d.q(`SELECT r.* FROM mob_aq_wroll r JOIN mob_aq_whales w ON w.wallet = r.wallet WHERE w.cand OR w.winner OR w.source = 'kolscan'`);
  const body = JSON.stringify({ kind: "aquarius-brain-backup", version: 1, day, at: new Date().toISOString(), counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])), tables });
  const gz = await gzip(body), key = `aq-backup/${day}.json.gz`;
  await env.MEDIA.put(key, gz, { httpMetadata: { contentType: "application/gzip" } });
  const head = await env.MEDIA.head(key);
  if (!head || head.size !== gz.length) return { ok: false, error: `the backup did not land whole: wrote ${gz.length} bytes, R2 reports ${head ? head.size : "nothing"}` };
  // keep 60 days
  const cut = new Date(Date.parse(day + "T00:00:00Z") - KEEP.backupDays * 86400000).toISOString().slice(0, 10), gone = [];
  const l = await env.MEDIA.list({ prefix: "aq-backup/", limit: 1000 });
  for (const o of l.objects) { const m = o.key.match(/^aq-backup\/(\d{4}-\d\d-\d\d)\.json\.gz$/); if (m && m[1] < cut) { await env.MEDIA.delete(o.key); gone.push(o.key); } }
  const res = { ok: true, key, bytes: gz.length, rawBytes: body.length, counts: JSON.parse(body).counts, deleted: gone, at: new Date().toISOString() };
  await setState(d, "backup", { key, bytes: res.bytes, at: res.at, counts: res.counts });
  return res;
}
// Restore: rows of the backup that are missing from the database are put back, nothing is overwritten, nothing is deleted.
// Dry run unless apply is true. Returns per table: rows in the backup, rows already there, rows that would be (were) added.
const LEDGER = ["mob_aq_positions", "mob_aq_flows", "mob_aq_state"];
const KEYS = { mob_aq_rules: ["name"], mob_aq_strategies: ["id"], mob_aq_whales: ["wallet"], mob_aq_state: ["k"], mob_aq_wfold: ["wallet"], mob_aq_wroll: ["wallet", "mint"], mob_aq_council_daily: ["day", "verdict", "kind", "reason"], mob_aq_candles_hour: ["pool", "t"], mob_aq_arena_agg: ["day", "variant", "tier", "tod", "regime"] };
export async function restore(d, data, { apply = false } = {}) {
  if (data?.kind !== "aquarius-brain-backup") throw new Error("not an Aquarius brain backup");
  // The ledger (open positions, money flows, the wallet's state) is only put back into an EMPTY book: in a book that has
  // traded since, a position that was closed after the backup would come back as open and the cash would no longer reconcile.
  const fresh = (await d.one(`SELECT count(*)::int n FROM mob_aq_trades`)).n === 0 && (await d.one(`SELECT count(*)::int n FROM mob_aq_positions`)).n === 0;
  const out = { day: data.day, apply, freshBook: fresh, tables: {} };
  for (const [t, rows] of Object.entries(data.tables)) {
    if (!/^mob_aq_[a-z_]+$/.test(t)) throw new Error(`unexpected table in the backup: ${t}`);
    if (LEDGER.includes(t) && !fresh) { out.tables[t] = { inBackup: rows.length, skipped: "ledger table: only restored into an empty book" }; continue; }
    if (t === "mob_aq_state") { // an empty book takes the wallet's state as it was (cash, base, settings), replacing the seed values
      if (apply && rows.length) await d.q(`INSERT INTO mob_aq_state SELECT b.* FROM jsonb_populate_recordset(null::mob_aq_state, $1::jsonb) b ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, at = EXCLUDED.at`, [JSON.stringify(rows)]);
      out.tables[t] = { inBackup: rows.length, alreadyThere: 0, missing: rows.length, added: apply ? rows.length : 0 }; continue; }
    const keys = KEYS[t] || ["id"], on = keys.map((k) => `x.${k} = b.${k}`).join(" AND "), json = JSON.stringify(rows);
    const missing = rows.length ? (await d.one(`SELECT count(*)::int n FROM jsonb_populate_recordset(null::${t}, $1::jsonb) b WHERE NOT EXISTS (SELECT 1 FROM ${t} x WHERE ${on})`, [json])).n : 0;
    let added = 0;
    if (apply && missing) {
      added = (await d.q(`INSERT INTO ${t} SELECT b.* FROM jsonb_populate_recordset(null::${t}, $1::jsonb) b WHERE NOT EXISTS (SELECT 1 FROM ${t} x WHERE ${on}) ON CONFLICT DO NOTHING RETURNING 1`, [json])).length;
      // a restored id must never be handed out again by the table's own counter
      if (keys[0] === "id") await d.q(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), greatest((SELECT coalesce(max(id), 1) FROM ${t}), 1))`);
    }
    out.tables[t] = { inBackup: rows.length, alreadyThere: rows.length - missing, missing, added };
  }
  return out;
}

// ---------------------------------------------------------------- the weekly review, written by code
export async function weeklyReview(d, nowMs = Date.now()) {
  const week = Math.floor((nowMs / 86400000 + 3) / 7); // weeks since 1970, Monday to Sunday
  const first = await d.one(`SELECT least((SELECT min(at) FROM mob_aq_brain), (SELECT min(opened_at) FROM mob_aq_trades)) t`);
  const n = first?.t ? Math.max(1, Math.floor((nowMs - new Date(first.t).getTime()) / (7 * 86400000)) + 1) : 1;
  const tr = await d.q(`SELECT strategy, tag, pnl_pct, pnl_sol, reason FROM mob_aq_trades WHERE closed_at > to_timestamp($1::float8) - interval '7 days'`, [nowMs / 1000]);
  const line = (name, xs) => { const s = stats(xs); return `${name}: ${s.n} trades${s.n ? `, ${round(s.winRate * 100, 1)}% won, ${s.expectancyPct}% a trade${s.ci95 ? ` (95% ${s.ci95.join(" to ")})` : ""}` : ""}`; };
  const strat = [...new Set(tr.map((t) => t.strategy))].sort().map((s) => line(s, tr.filter((t) => t.strategy === s).map((t) => t.pnl_pct)));
  const sig = await d.q(`SELECT source, count(*)::int n, count(pct_15m)::int graded, round(avg(pct_15m)::numeric, 3)::float8 m15, round(avg(ctrl_15m)::numeric, 3)::float8 c15 FROM mob_aq_signals WHERE at > to_timestamp($1::float8) - interval '7 days' GROUP BY source ORDER BY source`, [nowMs / 1000]);
  const seats = await d.q(`SELECT helper, count(*) FILTER (WHERE counted AND is_right IS NOT NULL)::int n, count(*) FILTER (WHERE counted AND is_right)::int r FROM mob_aq_votes WHERE seat AND at > to_timestamp($1::float8) - interval '7 days' GROUP BY helper ORDER BY helper`, [nowMs / 1000]);
  const rules = await d.q(`SELECT left(text, 220) t FROM mob_aq_brain WHERE kind = 'tournament' AND at > to_timestamp($1::float8) - interval '7 days' ORDER BY id DESC LIMIT 6`, [nowMs / 1000]);
  const nRules = (await d.one(`SELECT count(*)::int n FROM mob_aq_brain WHERE kind = 'tournament' AND at > to_timestamp($1::float8) - interval '7 days'`, [nowMs / 1000])).n;
  // a block "cost money" when the shadow probes of the coins it kept out made money after costs
  const blocks = await d.q(`SELECT left(regexp_replace(block_reason, '[0-9]+(\\.[0-9]+)?', '#', 'g'), 70) reason, count(*)::int n, round(avg(pnl_pct)::numeric, 3)::float8 avg FROM mob_aq_shadow WHERE v = 2 AND closed_at > to_timestamp($1::float8) - interval '7 days' AND pnl_pct IS NOT NULL GROUP BY 1 HAVING count(*) >= 5 ORDER BY avg(pnl_pct) DESC LIMIT 4`, [nowMs / 1000]);
  const all = stats(tr.map((t) => t.pnl_pct));
  const text = `Week ${n} review (written by code, no AI): ${all.n} trades closed in the last 7 days, ${round(tr.reduce((a, t) => a + t.pnl_sol, 0), 4)} SOL realized${all.n ? `, ${all.expectancyPct}% a trade${all.ci95 ? ` (95% ${all.ci95.join(" to ")})` : ""}: ${all.n < 100 ? "too few to call an edge" : all.evidence}` : ""}. `
    + `BY STRATEGY: ${strat.join("; ") || "no closed trades"}. `
    + `BY SIGNAL SOURCE (15 minutes after the signal, against its matched control): ${sig.map((s) => `${s.source}: ${s.n} signals, ${s.graded} followed up, ${s.m15 ?? "n/a"}% vs control ${s.c15 ?? "n/a"}%`).join("; ") || "no signals"}. `
    + `COUNCIL SEATS: ${seats.map((s) => `${s.helper} ${s.r} right of ${s.n} graded votes`).join("; ") || "no graded helper votes"}. `
    + `RULE CHANGES: ${nRules} recorded${rules.length ? `; latest: ${rules.map((r) => r.t).join(" | ")}` : ""}. `
    + `BLOCKS THAT COST MONEY (shadow probes of blocked coins that won after costs, 5+ probes): ${blocks.filter((b) => b.avg > 0).map((b) => `"${b.reason}" kept out ${b.n} probes that averaged +${b.avg}%`).join("; ") || "none this week"}.`;
  await brain(d, "review", "week", text.slice(0, 7000), { week: n, isoWeek: week, trades: all.n, strategies: strat.length, signals: sig, blocks });
  return { week: n, text };
}

// ---------------------------------------------------------------- the keeper's own tick (after the main tick and the arena; it can never stop them)
export async function keeperTick(env, opts = {}) {
  const d = db(env), nowMs = opts.now ?? Date.now(), out = {};
  // every 10 minutes: measure. Over 60% of the limit: a brain alert (once a day) and tighter retention; the tick itself is never slowed.
  if (opts.force || (await claim(d, "keeper_measure", Math.floor(nowMs / 600000)))) {
    const m = await measure(env), prev = await getState(d, "storage", null);
    await setState(d, "storage", m); out.storage = { dbMb: m.dbMb, pct: m.pct, mode: m.mode };
    if (m.pct >= KEEP.alertPct && (await claim(d, "keeper_size_alert", Math.floor(nowMs / 86400000)))) await brain(d, "ops", "alert", `STORAGE: the database is ${m.dbMb} MB, ${m.pct}% of the ${m.limitMb} MB limit. Retention is now "${m.mode}" (raw swaps ${KEEP[m.mode].swapHours} h, 1-minute candles ${KEEP[m.mode].candle1mHours} h, Council blocks ${KEEP[m.mode].councilDays} days). Learning continues; trades, the brain, rules, signals, votes and chat are never pruned. Largest: ${m.tables.slice(0, 4).map((t) => `${t.table} ${t.mb} MB`).join(", ")}.`, m);
    else if (prev && prev.pct >= KEEP.alertPct && m.pct < KEEP.alertPct) await brain(d, "ops", "event", `Storage is back under ${KEEP.alertPct}% of the limit: ${m.dbMb} MB of ${m.limitMb} MB.`);
  }
  // every hour: rollups (every 10 minutes when storage is tight)
  const st = await getState(d, "storage", null), mode = st?.mode || "normal", R = KEEP[mode];
  if (opts.force || (await claim(d, "keeper_hour", Math.floor(nowMs / (mode === "normal" ? 3600000 : 600000))))) {
    out.swaps = await rollSwaps(d, R.swapHours); out.candles = await rollCandles(d, { hours: R.candle1mHours, days: R.candle5mDays, nowSec: nowMs / 1000 }); out.council = await compactCouncil(d, R.councilDays);
    out.fold = await foldPairs(d, R.pairIdleDays); out.noise = await dropNoise(d, R.noiseIdleDays);
    await setState(d, "keeper", { at: new Date(nowMs).toISOString(), mode, swaps: out.swaps, candles: out.candles, council: out.council, fold: out.fold, noise: out.noise });
  }
  // every day: the brain backup; every week: the review
  const day = new Date(nowMs).toISOString().slice(0, 10);
  if (opts.force || (await claim(d, "keeper_day", Math.floor(nowMs / 86400000)))) {
    try { out.backup = await backup(env, { day }); } catch (e) { out.backup = { ok: false, error: String(e.message || e).slice(0, 200) }; }
    if (!out.backup.ok) await brain(d, "ops", "alert", `BACKUP FAILED for ${day}: ${out.backup.error}. The database is still the only copy of the brain.`);
  }
  if (await claim(d, "keeper_week", Math.floor((nowMs / 86400000 + 3) / 7))) out.review = (await weeklyReview(d, nowMs)).week;
  return out;
}
