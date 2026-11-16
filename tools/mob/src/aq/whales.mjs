// Whales and the shadow lane (aquarius-trader skill).
// Whales: every pool we judge, its last trades (GeckoTerminal /trades, shape read 2026-11-16) go into our own wallet book.
// A "winning wallet" is one whose book shows >= 2 tokens sold above cost and more SOL out than in on closed tokens.
// Whale signal = 2+ INDEPENDENT winning wallets bought this coin in the last 15 minutes, creator and RugCheck insiders
// excluded, wallets with one funder counted once. Funders come from Helius RPC only when HELIUS_API_KEY is set
// (https://mainnet.helius-rpc.com/?api-key=..., per helius.dev docs); without it the signal says "funders unchecked".
// Shadow lane: when nothing passes, paper probes on near misses, own ledger, never mixed into the real one.
import { db } from "../db.mjs";
import { getJson, cached, SOL_MINT, midPrices } from "./feeds.mjs";
import { stats, round, num } from "./logic.mjs";

export const TRADES_URL = (pool) => `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/trades`;
export const HELIUS_URL = (key) => `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`;
const KB_COST_PCT = 5;

export function slimTrades(j, mint) {
  return (j?.data || []).map((t) => {
    const a = t.attributes || {};
    const buy = a.kind === "buy" && a.from_token_address === SOL_MINT && a.to_token_address === mint;
    const sell = a.kind === "sell" && a.to_token_address === SOL_MINT && a.from_token_address === mint;
    if (!buy && !sell) return null;
    const sol = num(buy ? a.from_token_amount : a.to_token_amount);
    return sol == null || !a.tx_from_address || !a.tx_hash ? null : { tx: a.tx_hash, wallet: a.tx_from_address, kind: buy ? "buy" : "sell", sol, at: a.block_timestamp };
  }).filter(Boolean);
}

async function rpc(env, method, params) {
  const r = await fetch(HELIUS_URL(env.HELIUS_API_KEY), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  if (!r.ok) throw new Error(`helius ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "rpc error");
  return j.result;
}
// Funder = who sent the wallet its first money (first transaction in its history). Null when the history is longer than one page.
export async function funderOf(env, wallet) {
  const sigs = await rpc(env, "getSignaturesForAddress", [wallet, { limit: 1000 }]);
  if (!Array.isArray(sigs) || !sigs.length || sigs.length >= 1000) return null;
  const tx = await rpc(env, "getTransaction", [sigs[sigs.length - 1].signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
  const ins = tx?.transaction?.message?.instructions || [];
  const sys = ins.find((i) => i.program === "system" && i.parsed?.type === "transfer" && i.parsed.info?.destination === wallet);
  if (sys) return sys.parsed.info.source;
  const ata = ins.find((i) => i.program === "spl-associated-token-account" && i.parsed?.info?.wallet === wallet);
  const tok = ins.find((i) => i.program === "spl-token" && /^transfer/.test(i.parsed?.type || "") && (!ata || i.parsed.info?.destination === ata.parsed.info.account));
  if (tok?.parsed?.info?.authority && tok.parsed.info.authority !== wallet) return tok.parsed.info.authority;
  const payer = tx?.transaction?.message?.accountKeys?.[0];
  const p = typeof payer === "string" ? payer : payer?.pubkey;
  return p && p !== wallet ? p : null;
}

export async function whaleSignal(env, c, rug, set) {
  const d = db(env);
  const tr = await cached(env, `gt:trades:${c.pool}`, 50, async () => slimTrades(await getJson(TRADES_URL(c.pool)), c.mint));
  if (!tr.ok) { set("wh.gmgn", "blocked", `trades feed failed: ${tr.err}`); return { ok: false, signal: false, reason: "missing data: trades" }; }
  const t = tr.data;
  if (t.length) await d.q(`INSERT INTO mob_aq_wtrades (tx, wallet, mint, kind, sol, at) SELECT tx, w, $1, k, s, at::timestamptz FROM unnest($2::text[],$3::text[],$4::text[],$5::float8[],$6::text[]) x(tx,w,k,s,at) ON CONFLICT DO NOTHING`,
    [c.mint, t.map((x) => x.tx), t.map((x) => x.wallet), t.map((x) => x.kind), t.map((x) => x.sol), t.map((x) => x.at)]);
  await d.q(`DELETE FROM mob_aq_wtrades WHERE at < now() - interval '14 days'`);
  const excluded = new Set([rug?.creator, ...(rug?.insiders || [])].filter(Boolean));
  const buyers = [...new Set(t.filter((x) => x.kind === "buy" && Date.now() - Date.parse(x.at) < 15 * 60000).map((x) => x.wallet))].filter((w) => !excluded.has(w));
  const winners = buyers.length ? await d.q(`SELECT wallet, count(*) FILTER (WHERE s > b)::int wins, count(*)::int closed, sum(s - b)::float net FROM (
      SELECT wallet, mint, sum(sol) FILTER (WHERE kind='buy') b, sum(sol) FILTER (WHERE kind='sell') s FROM mob_aq_wtrades WHERE wallet = ANY($1) AND mint <> $2 GROUP BY wallet, mint) x
      WHERE b > 0 AND s > 0 GROUP BY wallet HAVING count(*) FILTER (WHERE s > b) >= 2 AND sum(s - b) > 0 AND count(*) FILTER (WHERE s > b)::float / count(*) >= 0.6`, [buyers, c.mint]) : [];
  let checked = false;
  const groups = new Set();
  for (const w of winners) {
    let f = null;
    if (env.HELIUS_API_KEY) {
      const row = await d.one(`SELECT funder FROM mob_aq_funders WHERE wallet=$1`, [w.wallet]);
      if (row) f = row.funder;
      else { try { f = await funderOf(env, w.wallet); await d.q(`INSERT INTO mob_aq_funders (wallet, funder, source) VALUES ($1,$2,'helius') ON CONFLICT (wallet) DO UPDATE SET funder=EXCLUDED.funder, checked_at=now()`, [w.wallet, f]); } catch { f = null; } }
      checked = true;
    }
    groups.add(f || w.wallet);
  }
  const { n: book } = await d.one(`SELECT count(DISTINCT wallet)::int n FROM mob_aq_wtrades`);
  const out = { ok: true, signal: groups.size >= 2, independent: groups.size, winners: winners.length, buyers15m: buyers.length, excluded: excluded.size, funders: checked ? "checked (helius)" : "unchecked (no HELIUS_API_KEY)", book };
  set("wh.steady", "busy", `${book} wallets in the book; ${winners.length} winners bought ${c.symbol} in 15 min`);
  set("wh.funders", checked ? "busy" : "idle", checked ? `${groups.size} independent funder group(s)` : "no HELIUS_API_KEY: funders unchecked");
  set("wh.pnl", "busy", `wallet results recomputed from ${t.length} raw trades of ${c.symbol}`);
  set("sol.dev", "busy", `${c.symbol}: ${excluded.size} creator/insider wallet(s) excluded`);
  if (out.signal) set("wh.gmgn", "busy", `WHALE SIGNAL ${c.symbol}: ${groups.size} independent winners buying`);
  else set("wh.gmgn", "idle", "no free GMGN key; own wallet book instead");
  return out;
}

// ------------------------------------------------------------------ shadow lane
const NEAR_RANK = ["cost gate", "stop > target", "time machine", "no signal", "safety", "stale data", "liquidity too low"];
const rank = (reason) => { const i = NEAR_RANK.findIndex((r) => reason.startsWith(r)); return i < 0 ? 99 : i; };

export async function shadowTick(env, { kill, entered, near, solUsd, nowSec, set, P }) {
  const d = db(env);
  const res = { opened: null, closed: [] };
  const open = await d.q(`SELECT * FROM mob_aq_shadow WHERE closed_at IS NULL ORDER BY id`);
  if (open.length) {
    let mids = null;
    try { mids = await midPrices(open.map((s) => ({ mint: s.mint, pool: s.pool }))); } catch { mids = null; }
    for (const s of open) {
      const mid = mids?.[s.mint] ?? null;
      if (mid == null) continue;
      const why = mid <= s.stop_price ? "stop" : mid >= s.target_price ? "target" : nowSec * 1000 >= new Date(s.time_stop_at).getTime() ? "time stop" : null;
      if (!why) continue;
      // fill at the level that was hit (stop/target) or the mid (time stop), then subtract the round-trip cost
      const px = why === "stop" ? Math.min(mid, s.stop_price) : why === "target" ? s.target_price : mid;
      const pnl = round(((px - s.entry_price) / s.entry_price) * 100 - s.cost_pct, 3);
      await d.q(`UPDATE mob_aq_shadow SET closed_at=now(), exit_price=$2, pnl_pct=$3, outcome=$4 WHERE id=$1`, [s.id, px, pnl, why]);
      const right = pnl <= 0;
      await d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ('review','shadow',$1,$2)`,
        [`SHADOW ${s.symbol}: blocked for "${s.block_reason}", the probe hit ${why} at ${pnl}% net of ${s.cost_pct}% cost. The block was ${right ? "RIGHT" : "WRONG (it cost a win)"}.`, JSON.stringify({ id: s.id, pnl, why, reason: s.block_reason })]);
      res.closed.push({ symbol: s.symbol, why, pnlPct: pnl });
    }
  }
  const stillOpen = open.length - res.closed.length;
  if (!kill && !entered && near.length && stillOpen < 5) {
    const cand = near.filter((n) => n.setup && n.setup.stopPrice && n.setup.targetPrice && n.setup.price && n.setup.stopPrice < n.setup.price && n.setup.targetPrice > n.setup.price && !n.reason.startsWith("missing data") && !n.reason.startsWith("copycat"))
      .sort((a, b) => rank(a.reason) - rank(b.reason));
    for (const n of cand) {
      if (await d.one(`SELECT 1 FROM mob_aq_shadow WHERE mint=$1 AND (closed_at IS NULL OR closed_at > now() - interval '30 minutes')`, [n.c.mint])) continue;
      const cost = n.rt != null ? n.rt : KB_COST_PCT;
      const r = await d.one(`INSERT INTO mob_aq_shadow (mint, pool, symbol, block_reason, entry_price, stop_price, target_price, cost_pct, cost_source, time_stop_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,to_timestamp($10)) RETURNING id`,
        [n.c.mint, n.c.pool, n.c.symbol, n.reason, n.setup.price, n.setup.stopPrice, n.setup.targetPrice, cost, n.rt != null ? "measured" : "trading-kb 5%", nowSec + P.timeStopMin * 60]);
      res.opened = { id: r.id, symbol: n.c.symbol, reason: n.reason };
      break;
    }
  }
  set("ln.paper", res.opened || res.closed.length ? "busy" : "idle", res.opened ? `SHADOW probe on ${res.opened.symbol} (blocked: ${res.opened.reason})` : res.closed.length ? `${res.closed.length} shadow probe(s) closed` : "no near miss to probe");
  set("rv.missed", "busy", `${stillOpen + (res.opened ? 1 : 0)} shadow probe(s) open`);
  return res;
}

export async function shadowStats(d) {
  const rows = await d.q(`SELECT block_reason, pnl_pct, closed_at FROM mob_aq_shadow ORDER BY id`);
  const closed = rows.filter((r) => r.closed_at);
  const s = stats(closed.map((r) => r.pnl_pct));
  const by = {};
  for (const r of closed) (by[r.block_reason.split(":")[0]] ||= []).push(r.pnl_pct);
  return { tag: "SHADOW", n: s.n, winRate: s.winRate, expectancyPct: s.expectancyPct, open: rows.length - closed.length,
    byReason: Object.entries(by).map(([reason, xs]) => ({ reason, n: xs.length, expectancyPct: stats(xs).expectancyPct })) };
}
