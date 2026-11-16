// One-off (repeatable) whale-book seed, run from a container, not limited by the Worker's per-tick budget.
//   DATABASE_URL=... node tools/mob/scripts/aq-seed-whales.mjs [maxRunners=25] [pagesPerRunner=40]
// Runners = coins on Jupiter's trending / most-traded / organic lists that ran (>= +50% in 24h or >= +20% in 1h) with
// liquidity at or above the gate. For each, the swaps are paged back in time (30 per page) into mob_aq_wtrades; the
// creator's own swaps are dropped; MEV swaps never enter; bots are filtered when the book is scored (refreshWinners).
// Funder clustering runs here only when HELIUS_API_KEY is in the environment (never printed); otherwise the Worker does it
// lazily, inside its call cap, when a winner shows up in a signal. Idempotent: swaps are keyed by transaction.
import { db } from "../src/db.mjs";
import { getJson, URLS, jupPool, jupTxs } from "../src/aq/feeds.mjs";
import { saveTrades, refreshWinners, funderOf } from "../src/aq/whales.mjs";
import { COUNCIL } from "../src/aq/logic.mjs";

const env = { DATABASE_URL: process.env.DATABASE_URL, HELIUS_API_KEY: process.env.HELIUS_API_KEY };
if (!env.DATABASE_URL) { console.error("DATABASE_URL is not set"); process.exit(1); }
const MAX = Number(process.argv[2] || 25), PAGES = Number(process.argv[3] || 40);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const d = db(env);

const seen = new Map();
for (const k of ["toptrending", "toptraded", "toporganicscore"]) {
  try { for (const p of (await getJson(URLS.jupTop(k))).pools || []) { const c = jupPool(p); if (c && !seen.has(c.mint)) seen.set(c.mint, c); } } catch (e) { console.log(`list ${k} failed: ${e.message}`); }
  await sleep(300);
}
const runners = [...seen.values()].filter((c) => (c.liqUsd || 0) >= COUNCIL.hardMinLiq && ((c.ch24 ?? 0) >= 50 || (c.ch1h ?? 0) >= 20)).sort((a, b) => (b.ch24 ?? 0) - (a.ch24 ?? 0)).slice(0, MAX);
console.log(`lists: ${seen.size} coins; runners (>= +50% 24h or >= +20% 1h, liquidity >= $${COUNCIL.hardMinLiq}): ${runners.length}`);

let pages = 0, swaps = 0, stopped = null;
for (const c of runners) {
  let cur = null, n = 0, oldest = null, pg = 0;
  for (; pg < PAGES; pg++) {
    let r;
    try { r = await jupTxs(c.mint, cur); } catch (e) { if (/429/.test(e.message)) { stopped = `rate limited at ${c.symbol}`; } console.log(`  ${c.symbol}: page ${pg} failed: ${e.message}`); break; }
    pages++;
    n += await saveTrades(d, c.mint, r.txs.filter((t) => t.wallet !== c.dev));
    oldest = r.oldest || oldest;
    cur = r.next;
    if (!cur || r.n === 0) break;
    await sleep(150);
  }
  swaps += n;
  await d.q(`INSERT INTO mob_aq_mined (mint, symbol, why, cursor_offset, cursor_ts, pages, trades, done, oldest) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)
    ON CONFLICT (mint) DO UPDATE SET pages=mob_aq_mined.pages+EXCLUDED.pages, trades=mob_aq_mined.trades+EXCLUDED.trades, done=true, oldest=EXCLUDED.oldest, updated_at=now()`,
    [c.mint, c.symbol, `seed: ran ${Math.round(c.ch24 ?? 0)}% in 24h`, cur?.offset || null, cur?.ts || null, pg, n, oldest]);
  console.log(`  ${c.symbol.padEnd(12)} +${Math.round(c.ch24 ?? 0)}% 24h  liq $${Math.round(c.liqUsd)}  ${n} new swaps, back to ${oldest || "?"}`);
  if (stopped) break;
}
const book = await refreshWinners(d);
let clustered = 0;
if (env.HELIUS_API_KEY) {
  const ws = await d.q(`SELECT w.wallet FROM mob_aq_whales w LEFT JOIN mob_aq_funders f ON f.wallet=w.wallet WHERE w.winner AND f.wallet IS NULL ORDER BY w.wins DESC LIMIT 200`);
  for (const w of ws) {
    try { const f = await funderOf(env, w.wallet); await d.q(`INSERT INTO mob_aq_funders (wallet, funder, source) VALUES ($1,$2,'helius') ON CONFLICT (wallet) DO UPDATE SET funder=EXCLUDED.funder, checked_at=now()`, [w.wallet, f]); clustered++; }
    catch (e) { console.log(`helius stopped: ${e.message}`); break; }
    await sleep(250);
  }
}
const top = await d.q(`SELECT w.wallet, w.wins, w.closed, w.net_sol, x.b, x.s, x.coins FROM mob_aq_whales w JOIN LATERAL (
  SELECT sum(b) b, sum(s) s, string_agg(sym, ', ') coins FROM (SELECT t.mint, coalesce(max(m.symbol), left(t.mint, 5)) sym, sum(sol) FILTER (WHERE kind='buy') b, sum(sol) FILTER (WHERE kind='sell') s
    FROM mob_aq_wtrades t LEFT JOIN mob_aq_mined m ON m.mint=t.mint WHERE t.wallet=w.wallet GROUP BY t.mint HAVING sum(sol) FILTER (WHERE kind='buy') > 0 AND sum(sol) FILTER (WHERE kind='sell') > sum(sol) FILTER (WHERE kind='buy')) y) x ON true
  WHERE w.winner ORDER BY w.wins DESC, w.net_sol DESC LIMIT 10`);
const funders = await d.one(`SELECT count(*)::int n, count(DISTINCT funder)::int g FROM mob_aq_funders`);
console.log(`\nSUMMARY: runners scanned ${runners.length}, pages ${pages}, new swaps ${swaps}${stopped ? ` (stopped: ${stopped})` : ""}; wallets scored ${book.book}, winners kept ${book.winners}; funders known ${funders.n} in ${funders.g} group(s)${env.HELIUS_API_KEY ? `, ${clustered} checked now` : " (no HELIUS_API_KEY here: the Worker clusters on demand)"}`);
console.log("TOP 10 WINNERS (wallet, coins won / closed, realized multiple on the coins won, coins):");
for (const w of top) console.log(`  ${w.wallet.slice(0, 4)}…${w.wallet.slice(-4)}  ${w.wins}/${w.closed}  x${(w.s / w.b).toFixed(2)}  net ${w.net_sol.toFixed(2)} SOL  ${w.coins}`);
