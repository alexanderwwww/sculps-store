// Helper lanes: Grok / ChatGPT / Codex as a SECOND BRAIN. A helper submits a complete trade idea (a "pick"); the engine
// NEVER trades it on the real ledger. Each pick is validated (the mint must be a live SOL pair), judged by the same gate,
// costs and Council for the record, then paper-tracked in that helper's own lane (LANE:<helper>) with real prices and the
// measured round trip. A lane's result sets the weight of that helper's evidence (stored, visible); it triggers nothing.
import { db } from "../db.mjs";
import { feeds, getJson, URLS, jupQuote, midPrices, SOL_MINT } from "./feeds.mjs";
import { safety, roundTripPct, stats, round, num } from "./logic.mjs";

const KB_COST_PCT = 5, MIN_FOR_WEIGHT = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const LANE_HELPERS = ["grok", "chatgpt", "codex"];
const LBL = ["VERIFIED", "REPORTED", "CLAIMED", "INFERRED"];

export async function submitPick(env, helper, a) {
  if (!LANE_HELPERS.includes(helper)) return { error: `helper must be one of ${LANE_HELPERS.join(", ")}` };
  const mint = String(a?.mint || "");
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint) || mint === SOL_MINT) return { error: "mint must be a Solana token address" };
  const stopPct = num(a?.stopPct), targetPct = num(a?.targetPct), entry = num(a?.entry);
  if (stopPct == null || stopPct <= 0 || stopPct > 50) return { error: "stopPct must be between 0 and 50" };
  if (targetPct == null || targetPct <= 0 || targetPct > 500) return { error: "targetPct must be between 0 and 500" };
  const thesis = typeof a?.thesis === "string" ? a.thesis.replace(/\s+/g, " ").trim().slice(0, 1000) : "";
  if (!thesis) return { error: "thesis is required" };
  const labels = [].concat(a?.labels ?? []).map((x) => String(x).toUpperCase()).filter((x) => LBL.includes(x));
  if (!labels.length) return { error: "labels must include VERIFIED, REPORTED, CLAIMED or INFERRED" };
  const d = db(env);
  const { n } = await d.one(`SELECT count(*)::int n FROM mob_aq_picks WHERE helper=$1 AND status IN ('queued','open')`, [helper]);
  if (n >= 5) return { error: "5 picks already queued or open in your lane; wait for one to close" };
  const symbol = typeof a?.symbol === "string" ? a.symbol.replace(/[^\w$.-]/g, "").slice(0, 20) : null;
  const r = await d.one(`INSERT INTO mob_aq_picks (helper, symbol, mint, thesis, labels, stop_pct, target_pct, entry_hint) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [helper, symbol, mint, thesis, JSON.stringify([...new Set(labels)]), stopPct, targetPct, entry]);
  return { pick: { id: r.id, lane: `LANE:${helper}`, status: "queued", realLedger: false } };
}

export function weightFor(s) { return s.n < MIN_FOR_WEIGHT || s.expectancyPct == null ? 1 : round(Math.max(0.25, Math.min(2, 1 + s.expectancyPct / 10)), 2); }

export async function lanesTick(env, { halted, nowSec, gap, feeSol, P, council, set }) {
  const d = db(env), res = { judged: null, closed: [] };
  // ---- exits with real prices
  const open = await d.q(`SELECT * FROM mob_aq_picks WHERE status='open' ORDER BY id`);
  if (open.length) {
    let mids = null;
    try { mids = await midPrices(open.map((p) => ({ mint: p.mint, pool: p.pool }))); } catch { mids = null; }
    for (const p of open) {
      const mid = mids?.[p.mint] ?? null;
      if (mid == null) continue;
      const why = mid <= p.stop_price ? "stop" : mid >= p.target_price ? "target" : nowSec * 1000 >= new Date(p.time_stop_at).getTime() ? "time stop" : null;
      if (!why) continue;
      const px = why === "stop" ? Math.min(mid, p.stop_price) : why === "target" ? p.target_price : mid;
      const pnl = round(((px - p.entry_price) / p.entry_price) * 100 - p.cost_pct, 3);
      if (!(await d.one(`UPDATE mob_aq_picks SET status='closed', closed_at=now(), exit_price=$2, pnl_pct=$3, outcome=$4 WHERE id=$1 AND status='open' RETURNING id`, [p.id, px, pnl, why]))) continue; // closed by another request
      const lane = stats((await d.q(`SELECT pnl_pct FROM mob_aq_picks WHERE helper=$1 AND status='closed'`, [p.helper])).map((x) => x.pnl_pct));
      const ours = stats((await d.q(`SELECT pnl_pct FROM mob_aq_trades`)).map((x) => x.pnl_pct));
      const w = weightFor(lane);
      const ws = (await d.one(`SELECT v FROM mob_aq_state WHERE k='helper_weights'`))?.v || {};
      ws[p.helper] = w;
      await d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ('helper_weights',$1,now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [JSON.stringify(ws)]);
      const councilRight = p.verdict === "BLOCK" ? pnl <= 0 : pnl > 0;
      await d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ('review','lane',$1,$2)`, [
        `LANE:${p.helper} pick ${p.symbol || p.mint.slice(0, 6)}: ${why} at ${pnl}% net of ${p.cost_pct}% cost. Council had said ${p.verdict} (${p.verdict_reason}): the Council was ${councilRight ? "RIGHT" : "WRONG"}. Lane ${p.helper}: ${lane.n} picks, expectancy ${lane.expectancyPct}%; ours: ${ours.n} trades, expectancy ${ours.expectancyPct ?? "n/a"}%. Evidence weight for ${p.helper} is now ${w}${lane.n < MIN_FOR_WEIGHT ? ` (unchanged until ${MIN_FOR_WEIGHT} picks)` : ""}.`,
        JSON.stringify({ pick: p.id, helper: p.helper, pnl, why, weight: w })]);
      res.closed.push({ helper: p.helper, symbol: p.symbol, why, pnlPct: pnl });
    }
  }
  // ---- judge one queued pick per tick (bounded API calls)
  const q = halted ? null : await d.one(`SELECT * FROM mob_aq_picks WHERE status='queued' ORDER BY id LIMIT 1`);
  if (q) {
    const tag = `LANE:${q.helper}`, c = { symbol: q.symbol || q.mint.slice(0, 6), mint: q.mint, strategy: tag };
    const reject = async (why) => { await d.q(`UPDATE mob_aq_picks SET status='rejected', verdict='BLOCK', verdict_reason=$2, closed_at=now() WHERE id=$1 AND status='queued'`, [q.id, why]); await council("BLOCK", c, `${tag}: ${why}`, null, { pick: q.id }); res.judged = { id: q.id, helper: q.helper, status: "rejected", reason: why }; };
    let pair = null, asked = true;
    try { pair = (await getJson(URLS.dsTokens([q.mint])) || []).filter((p) => p.baseToken?.address === q.mint && p.quoteToken?.address === SOL_MINT && num(p.priceUsd) != null).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0]; } catch { asked = false; }
    if (!asked) res.judged = { id: q.id, helper: q.helper, status: "queued", reason: "DexScreener did not answer; the pick waits for the next tick" };
    else if (!pair) await reject("mint not found as a live SOL pair (missing data = NO)");
    else {
      const mid = num(pair.priceUsd), liq = num(pair.liquidity?.usd);
      c.symbol = q.symbol || pair.baseToken.symbol;
      // the same gates, for the record
      let verdict = "PASS", reason = "all gates pass", number = null, rt = null;
      const fail = (r, n) => { if (verdict === "PASS") { verdict = "BLOCK"; reason = r; number = n; } };
      if (liq == null || liq < P.minLiqUsd) fail("liquidity too low", liq);
      const rg = await feeds.rug(env, q.mint), sf = safety(rg.data, P);
      if (!sf.ok) fail(sf.reason, sf.number);
      if (q.stop_pct >= q.target_pct) fail("stop > target", round(q.stop_pct / q.target_pct, 3));
      if (feeSol) {
        const size = P.maxSizeSol, buy = await jupQuote(SOL_MINT, q.mint, Math.floor(size * 1e9));
        if (buy) await sleep(gap);
        const sell = buy ? await jupQuote(q.mint, SOL_MINT, buy.outAmount) : null;
        if (buy && sell) rt = roundTripPct(size, Number(sell.outAmount) / 1e9, feeSol);
      }
      if (rt == null) fail("missing data: Jupiter quote", null);
      else if (rt > 0 && q.target_pct < P.costMultiple * rt) fail("cost gate", round(q.target_pct / rt, 2));
      await council(verdict, c, `${tag}: ${reason}`, number, { pick: q.id, rtPct: rt, liqUsd: liq, lane: tag });
      const cost = rt != null ? Math.max(rt, 0) : KB_COST_PCT;
      await d.q(`UPDATE mob_aq_picks SET status='open', symbol=$2, pool=$3, verdict=$4, verdict_reason=$5, verdict_number=$6, entry_price=$7, stop_price=$8, target_price=$9, cost_pct=$10, cost_source=$11, opened_at=now(), time_stop_at=to_timestamp($12) WHERE id=$1 AND status='queued'`,
        [q.id, c.symbol, pair.pairAddress, verdict, reason, number, mid, mid * (1 - q.stop_pct / 100), mid * (1 + q.target_pct / 100), cost, rt != null ? "measured" : "trading-kb 5%", nowSec + P.timeStopMin * 60]);
      res.judged = { id: q.id, helper: q.helper, status: "open", verdict, reason, rtPct: rt };
    }
  }
  if (res.judged || res.closed.length) set("op.bridge", "busy", res.judged ? `LANE:${res.judged.helper} pick #${res.judged.id}: ${res.judged.status}` : `${res.closed.length} lane pick(s) closed`);
  return res;
}

export async function laneStats(d, ours) {
  const rows = await d.q(`SELECT helper, status, pnl_pct FROM mob_aq_picks`);
  const ws = (await d.one(`SELECT v FROM mob_aq_state WHERE k='helper_weights'`))?.v || {};
  const lanes = [{ helper: "aquarius", tag: "REAL (paper)", n: ours.n, winRate: ours.winRate, expectancyPct: ours.expectancyPct, open: ours.open, weight: null }];
  for (const h of LANE_HELPERS) {
    const mine = rows.filter((r) => r.helper === h);
    if (!mine.length) continue;
    const s = stats(mine.filter((r) => r.status === "closed").map((r) => r.pnl_pct));
    lanes.push({ helper: h, tag: `LANE:${h}`, n: s.n, winRate: s.winRate, expectancyPct: s.expectancyPct, open: mine.filter((r) => r.status === "open" || r.status === "queued").length, rejected: mine.filter((r) => r.status === "rejected").length, weight: ws[h] ?? 1 });
  }
  return lanes;
}
