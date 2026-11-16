// AQUARIUS ULTIMUM: the Council seat, fast alerts and the war room. A helper (Grok, ChatGPT, Codex) sits on the Council
// as ONE soft rule. Nothing here moves money on a helper's word:
//   - a BUY / SKIP vote only moves the soft score (and can lift a partial setup to a normal entry, or keep the desk out of an
//     explore). Every hard block, the tradability gate, cash, slots, the kill switch and the survival rules run after it,
//     unchanged, and the size is one of the sizes the desk already has.
//   - an EXIT vote is a warning. The tick takes a real sell quote for that position and applies the rule in exitVoteRule().
//   - an alert is not trusted: the request takes a real sell quote and closes the position only when the position's own stop
//     or target is met at that quote, through the same atomic claim as the tick (ledger.closePosition).
// Every vote is graded later and a helper's vote weight follows its own record, like every other soft rule.
import { db } from "../db.mjs";
import { jupQuote, jupPrices, SOL_MINT } from "./feeds.mjs";
import { closePosition } from "./ledger.mjs";
import { round, num } from "./logic.mjs";
import { LANE_HELPERS } from "./lanes.mjs";
import { costBook, learnFromTrade } from "./council.mjs";
import { NET_FEE_SOL } from "./engine.mjs";

export const SEATS = LANE_HELPERS;          // the helpers whose votes and alerts the engine honours
export const TESTERS = ["claude-test"];     // a diagnostic identity: stored and answered, never applied, never graded, never closes anything
export const CHAT_NAMES = ["alex", "claude", ...SEATS, ...TESTERS];
export const VOTE_TTL_SEC = 300, VOTE_POINTS = 10, SEAT_MIN_GRADED = 10, MULT_MIN = 0.2, MULT_MAX = 3;
// a net vote of half a soft rule against a coin keeps it out of an EXPLORE; a partial setup is lifted to a normal entry when
// its own strength plus the vote (in soft-rule units) reaches a full signal's strength of 1
export const KEEP_OUT_POINTS = -5, LIFT_AT = 1;
export const EXIT_CLOSE_CONF = 0.7, EXIT_WARN_CONF = 0.4, EXIT_CLOSE_HOLD_MIN = 5, EXIT_WARN_HOLD_MIN = 10;
export const RATE = { votesPerMin: 20, alertsPerMin: 6, chatPerMin: 10 };
export const CHAT_MAX = 2000;
const LBL = ["VERIFIED", "REPORTED", "CLAIMED", "INFERRED"];
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DUP = /duplicate key|unique constraint/i;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const brain = (d, dept, kind, text, data = null) => d.q(`INSERT INTO mob_aq_brain (dept, kind, text, data) VALUES ($1,$2,$3,$4)`, [dept, kind, text, data && JSON.stringify(data)]);
const getState = async (d, k, dflt = null) => (await d.one(`SELECT v FROM mob_aq_state WHERE k=$1`, [k]))?.v ?? dflt;

// ---------------------------------------------------------------- weights
// A helper's vote weight from its OWN graded votes only: 1 until ten are graded, then 1 + 2 x (share right - one half),
// kept inside 0.2 .. 3 like every soft rule. Half right = 1 (no evidence either way), all right = 2, all wrong = 0.2.
export function seatWeight({ right = 0, wrong = 0 }) {
  const n = right + wrong;
  return n < SEAT_MIN_GRADED ? 1 : round(clamp(1 + 2 * (right / n - 0.5), MULT_MIN, MULT_MAX), 3);
}
// what one vote is worth: vote weight x the helper's lane (evidence) weight, never more than the heaviest soft rule
export const seatMult = (weight, laneWeight) => round(clamp((weight ?? 1) * (laneWeight ?? 1), MULT_MIN, MULT_MAX), 3);

export async function seatStats(d) {
  const rows = await d.q(`SELECT helper, count(*)::int votes, count(*) FILTER (WHERE counted AND is_right)::int right_n, count(*) FILTER (WHERE counted AND is_right = false)::int wrong_n, max(at) last_at
    FROM mob_aq_votes WHERE seat GROUP BY helper`);
  const lanes = (await getState(d, "helper_weights", {})) || {};
  const by = Object.fromEntries(rows.map((r) => [r.helper, r]));
  return SEATS.map((h) => {
    const r = by[h] || { votes: 0, right_n: 0, wrong_n: 0, last_at: null }, weight = seatWeight({ right: r.right_n, wrong: r.wrong_n }), laneWeight = Number(lanes[h] ?? 1);
    return { helper: h, votes: r.votes, right: r.right_n, wrong: r.wrong_n, weight, laneWeight, effective: seatMult(weight, laneWeight), lastVoteAt: r.last_at };
  });
}

// The fresh BUY / SKIP votes on these coins and what they add to each coin's soft score.
export async function seatEffects(d, mints) {
  if (!mints.length) return {};
  const votes = await d.q(`SELECT id, helper, mint, vote, confidence, at FROM mob_aq_votes WHERE live AND seat AND vote IN ('BUY','SKIP') AND expires_at > now() AND mint = ANY($1::text[]) ORDER BY id`, [mints]);
  if (!votes.length) return {};
  const seats = Object.fromEntries((await seatStats(d)).map((s) => [s.helper, s])), out = {};
  for (const v of votes) {
    const s = seats[v.helper];
    if (!s) continue;
    const points = round((v.vote === "BUY" ? 1 : -1) * VOTE_POINTS * v.confidence * s.effective, 2);
    const e = (out[v.mint] ||= { votes: [], delta: 0 });
    e.votes.push({ id: v.id, rule: `council_seat:${v.helper}`, helper: v.helper, vote: v.vote, confidence: v.confidence, weight: s.weight, laneWeight: s.laneWeight, mult: s.effective, points });
    e.delta = round(e.delta + points, 2);
  }
  for (const e of Object.values(out)) e.units = round(e.delta / VOTE_POINTS, 3);
  return out;
}
export const seatText = (e) => e.votes.map((v) => `${v.helper} ${v.vote} ${v.confidence} x weight ${v.mult} = ${v.points > 0 ? "+" : ""}${v.points}`).join(", ");
export const markApplied = (d, e, applied, positionId = null) => d.q(`UPDATE mob_aq_votes SET applied=$2, position_id=coalesce($3::int, position_id) WHERE id = ANY($1::int[])`, [e.votes.map((v) => v.id), JSON.stringify({ at: new Date().toISOString(), ...applied }), positionId]);
// Coins a fresh BUY vote wants looked at again before their cooldown ends: only those whose last verdict was a partial setup's
// missing signal or the soft score (facts.votable; a hard block, an authority, a risk refusal, a losing replay or a coin that
// cannot pay its cost is not re-opened by a vote), once per vote.
export async function seatRequeue(d) {
  return (await d.q(`SELECT DISTINCT v.mint FROM mob_aq_votes v WHERE v.live AND v.seat AND v.vote='BUY' AND v.expires_at > now() AND v.judged_at IS NULL
    AND (SELECT c.facts->>'votable' FROM mob_aq_council c WHERE c.mint = v.mint ORDER BY c.id DESC LIMIT 1) = 'true'`)).map((r) => r.mint);
}
export const markJudged = (d, mints) => (mints.length ? d.q(`UPDATE mob_aq_votes SET judged_at=now() WHERE live AND seat AND judged_at IS NULL AND mint = ANY($1::text[])`, [mints]) : null);

// ---------------------------------------------------------------- cases
export async function councilCases(env) {
  const d = db(env);
  const [rows, pos, votes] = await Promise.all([
    d.q(`SELECT * FROM (SELECT DISTINCT ON (mint) id, verdict, symbol, mint, strategy, reason, number, facts, at FROM mob_aq_council
      WHERE mint IS NOT NULL AND mint NOT LIKE 'bot:%' AND coalesce(strategy,'') NOT LIKE 'LANE:%' AND at > now() - interval '10 minutes' ORDER BY mint, id DESC) x ORDER BY id DESC LIMIT 30`),
    d.q(`SELECT * FROM mob_aq_positions ORDER BY id`),
    d.q(`SELECT helper, mint, vote, confidence, reason, at, expires_at, seat FROM mob_aq_votes WHERE live AND expires_at > now() ORDER BY id`),
  ]);
  const vOf = (mint) => votes.filter((v) => v.mint === mint).map((v) => ({ helper: v.helper, vote: v.vote, confidence: v.confidence, reason: v.reason, at: v.at, expiresAt: v.expires_at, counts: v.seat }));
  const held = new Set(pos.map((p) => p.mint));
  return {
    at: new Date().toISOString(), voteTtlSec: VOTE_TTL_SEC,
    how: `Vote with aq_council_vote. BUY adds and SKIP subtracts ${VOTE_POINTS} x confidence x your weight to a coin's soft score for ${VOTE_TTL_SEC / 60} minutes. A vote never passes a hard block, the cost and ATR gates, cash, slots, the kill switch or survival rules, and never changes the size. EXIT on an open position is a warning: the engine takes a real sell quote on its next tick and applies its own tightened exit rule. Every vote is graded after 15 minutes (or by the trade it led to) and your weight follows your record.`,
    cases: rows.filter((r) => !held.has(r.mint)).map((r) => {
      const f = r.facts || {}, kind = r.verdict === "PASS" ? null : f.block || "hard";
      return { symbol: r.symbol, mint: r.mint, tier: f.tier ?? null, strategy: f.strategy ?? r.strategy ?? null, strength: f.strength ?? null, roundTripPct: f.rtPct ?? null, atr5Pct: f.atr5Pct ?? null,
        plan: f.plan ? { stopPct: f.plan.stopPct, targetPct: f.plan.targetPct, holdMin: f.plan.holdMin, stopUsd: f.plan.stopPrice ?? null, targetUsd: f.plan.targetPrice ?? null } : null,
        softObjections: f.soft ?? null, score: f.score ?? null, verdict: r.verdict, reason: r.reason, number: r.number, blockKind: kind,
        // true = only a partial setup's missing signal or the soft score stands between this coin and an entry: the only cases a vote can move
        hardBlocksClear: r.verdict === "PASS" || f.votable === true, seat: f.seat ?? null, judgedAt: r.at, votes: vOf(r.mint), canVote: ["BUY", "SKIP"] };
    }),
    positions: pos.map((p) => ({ id: p.id, symbol: p.symbol, mint: p.mint, strategy: p.strategy, tier: p.tier, tag: p.tag, sizeSol: p.size_sol, entryUsd: p.entry_price_usd, nowUsd: p.last_price_usd, stopUsd: p.stop_price, targetUsd: p.target_price,
      stopPct: p.stop_pct, targetPct: p.target_pct, pnlPct: p.last_value_sol == null ? null : round(((p.last_value_sol + (p.realized_sol || 0) - p.size_sol - p.fee_sol) / (p.size_sol + p.fee_sol)) * 100, 3),
      openedAt: p.opened_at, ageMin: round((Date.now() - new Date(p.opened_at).getTime()) / 60000, 1), timeStopAt: p.time_stop_at, priceAt: p.last_at ?? null, exitWarningBy: p.seat_exit ?? null, votes: vOf(p.mint), canVote: ["EXIT"],
      note: "stop and target are dollar levels at the SOL price of the entry" })),
  };
}

// ---------------------------------------------------------------- vote
const overRate = async (d, table, who, col, perMin) => (await d.one(`SELECT count(*)::int n FROM ${table} WHERE ${col}=$1 AND at > now() - interval '1 minute'`, [who])).n >= perMin;

export async function castVote(env, helper, a) {
  if (!SEATS.includes(helper) && !TESTERS.includes(helper)) return { error: `helper must be one of ${SEATS.join(", ")}` };
  const mint = String(a?.mint || ""), vote = String(a?.vote || "").toUpperCase(), confidence = typeof a?.confidence === "number" ? a.confidence : NaN;
  if (!MINT_RE.test(mint) || mint === SOL_MINT) return { error: "mint must be a Solana token address" };
  if (!["BUY", "SKIP", "EXIT"].includes(vote)) return { error: "vote must be BUY, SKIP or EXIT" };
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return { error: "confidence must be a number between 0 and 1" };
  const reason = typeof a?.reason === "string" ? a.reason.replace(/\s+/g, " ").trim().slice(0, 500) : "";
  if (!reason) return { error: "reason is required" };
  const labels = [...new Set([].concat(a?.labels ?? []).map((x) => String(x).toUpperCase()).filter((x) => LBL.includes(x)))];
  if (!labels.length) return { error: "labels must include VERIFIED, REPORTED, CLAIMED or INFERRED" };
  const d = db(env);
  if (await overRate(d, "mob_aq_votes", helper, "helper", RATE.votesPerMin)) return { error: `rate limit: ${RATE.votesPerMin} votes a minute` };
  const pos = await d.one(`SELECT id, symbol, tier, rt_pct FROM mob_aq_positions WHERE mint=$1`, [mint]);
  const seen = await d.one(`SELECT symbol, facts->>'tier' tier FROM mob_aq_council WHERE mint=$1 AND at > now() - interval '30 minutes' ORDER BY id DESC LIMIT 1`, [mint]);
  if (vote === "EXIT" && !pos) return { error: "EXIT is for an open position; this coin is not held (see aq_council_cases)" };
  if (vote !== "EXIT" && pos) return { error: "this coin is already held: vote EXIT to warn, or nothing" };
  if (vote !== "EXIT" && !seen) return { error: "this coin is not a case: the Council has not judged it in the last 30 minutes (see aq_council_cases)" };
  // the anchor for grading: a real price now, and what a round trip on this coin costs (its own last quote, else its tier's)
  let price = null;
  try { price = (await jupPrices([mint]))[mint]?.price ?? null; } catch { price = null; }
  let cost = pos?.rt_pct ?? null;
  if (cost == null) { const book = await costBook(d), tier = seen?.tier || pos?.tier || "C"; cost = book.byMint[mint]?.rt ?? book.tierCost(tier).pct ?? book.tierCost("C").pct; }
  const seat = SEATS.includes(helper);
  const sql = `WITH old AS (UPDATE mob_aq_votes SET live=false, replaced_at=now() WHERE helper=$1 AND mint=$2 AND live RETURNING id),
      ins AS (INSERT INTO mob_aq_votes (helper, mint, symbol, vote, confidence, reason, labels, expires_at, position_id, price_usd, cost_pct, seat, counted)
        SELECT $1, $2, $3, $4, $5::float8, $6, $7::jsonb, now() + make_interval(secs => $8::int), $9::int, $10::float8, $11::float8, $12::boolean,
          NOT EXISTS (SELECT 1 FROM mob_aq_votes v WHERE v.helper=$1 AND v.mint=$2 AND v.vote=$4 AND v.counted AND v.at > now() - interval '15 minutes')
        FROM (SELECT count(*) n FROM old) o RETURNING id, at, expires_at, counted)
      SELECT ins.*, (SELECT max(id) FROM old) replaced FROM ins`;
  const args = [helper, mint, pos?.symbol ?? seen?.symbol ?? null, vote, confidence, reason, JSON.stringify(labels), VOTE_TTL_SEC, vote === "EXIT" ? pos.id : null, price, cost == null ? null : Math.max(0, cost), seat];
  let r = null;
  // one live vote per helper per coin (a unique index): two posts at the same instant cannot both stay live; the loser tries once more
  for (let i = 0; i < 3 && !r; i++) { try { r = await d.one(sql, args); } catch (e) { if (!DUP.test(String(e.message || e))) throw e; } }
  if (!r) return { error: "another vote from you on this coin landed at the same moment; send it again" };
  const s = seat ? (await seatStats(d)).find((x) => x.helper === helper) : null;
  return { vote: { id: r.id, mint, vote, confidence, at: r.at, expiresAt: r.expires_at, replaced: r.replaced ?? null, priceUsd: price, graded: seat && r.counted ? "after 15 minutes, or by the trade it leads to" : seat ? "not counted: the same vote from you on this coin is already being graded" : "never: test identity",
    counts: seat, weight: s?.effective ?? 0, worthPoints: seat && vote !== "EXIT" ? round((vote === "BUY" ? 1 : -1) * VOTE_POINTS * confidence * s.effective, 2) : 0,
    note: !seat ? "stored only: a test identity has no seat, the engine ignores this vote" : vote === "EXIT" ? `a warning, not an order: the next tick takes a real sell quote and applies the exit-vote rule (${exitVoteRuleText})` : "one soft rule in the score; hard blocks, the cost gate, cash, slots and the kill switch are untouched" } };
}

// ---------------------------------------------------------------- EXIT votes (used by the tick)
export const exitVoteRuleText = `effective confidence = confidence x your weight, at most 1. ${EXIT_CLOSE_CONF} or more and the sell quote says the coin is under its price at entry: sold now. ${EXIT_CLOSE_CONF} or more and above entry: the time stop moves in to ${EXIT_CLOSE_HOLD_MIN} minutes from now. ${EXIT_WARN_CONF} to ${EXIT_CLOSE_CONF}: the time stop moves in to ${EXIT_WARN_HOLD_MIN} minutes from now. Under ${EXIT_WARN_CONF}: recorded only. The stop and the target never move.`;
// Why this rule: a helper sees the story die (X, news) before the price shows it, but it can be wrong and it never holds the
// wallet. So the warning can only do what the plan already allows: take a loss that the quote shows is already there, or
// give the position less time. It cannot widen or tighten the stop, cannot sell a winner on its own and cannot keep a loser.
export function exitVoteRule(eff, belowEntry) {
  if (eff >= EXIT_CLOSE_CONF) return belowEntry ? { act: "close" } : { act: "shorten", mins: EXIT_CLOSE_HOLD_MIN };
  if (eff >= EXIT_WARN_CONF) return { act: "shorten", mins: EXIT_WARN_HOLD_MIN };
  return { act: "none" };
}
// The strongest fresh, unhandled EXIT vote per open position.
export async function exitVotes(d) {
  const votes = await d.q(`SELECT v.id, v.helper, v.mint, v.confidence, v.position_id FROM mob_aq_votes v JOIN mob_aq_positions p ON p.id = v.position_id AND p.mint = v.mint
    WHERE v.live AND v.seat AND v.vote='EXIT' AND v.expires_at > now() AND v.handled_at IS NULL ORDER BY v.id`);
  if (!votes.length) return {};
  const seats = Object.fromEntries((await seatStats(d)).map((s) => [s.helper, s])), out = {};
  for (const v of votes) {
    const eff = round(Math.min(1, v.confidence * (seats[v.helper]?.effective ?? 1)), 3), e = (out[v.position_id] ||= { ids: [], eff: -1 });
    e.ids.push(v.id);
    if (eff > e.eff) Object.assign(e, { eff, helper: v.helper, confidence: v.confidence, mult: seats[v.helper]?.effective ?? 1 });
  }
  return out;
}
export const markHandled = (d, ids, outcome, tradeId = null) => d.q(`UPDATE mob_aq_votes SET handled_at=now(), outcome=$2, trade_id=coalesce($3::int, trade_id) WHERE id = ANY($1::int[])`, [ids, String(outcome).slice(0, 300), tradeId]);
// what a sale fetched against the mid at entry tells us the mid is now (same reading as the tick's stop confirmation)
export const impliedMid = (p, gross) => (p.exit_k && p.sol_usd_entry ? ((gross / (Number(p.tokens_raw) / 10 ** p.decimals)) * p.sol_usd_entry) / p.exit_k : null);

// ---------------------------------------------------------------- grading (every tick)
// BUY is right when the coin was more than its round-trip cost higher 15 minutes later (a trade there would have paid), or
// when the trade the vote was part of won. SKIP is right when it was not, or that trade lost. EXIT is right when the coin was
// lower 15 minutes after the warning. Only "counted" votes enter the record: repeating the same vote on the same coin inside
// 15 minutes does not multiply a result, and a vote cannot be taken back once cast.
export async function seatTick(env) {
  const d = db(env), res = { graded: 0, moved: [] };
  const byTrade = await d.q(`UPDATE mob_aq_votes v SET trade_id = t.id, trade_pnl_pct = t.pnl_pct, is_right = ((v.vote = 'BUY') = (t.pnl_sol > 0)), grade_by = 'trade', graded_at = now()
    FROM mob_aq_trades t WHERE t.position_id = v.position_id AND v.seat AND v.vote IN ('BUY','SKIP') AND v.position_id IS NOT NULL AND v.graded_at IS NULL RETURNING v.id`);
  res.graded += byTrade.length;
  const due = await d.q(`SELECT id, mint, vote, price_usd, cost_pct, pct_15m, extract(epoch FROM now() - at)::float8 / 60 age FROM mob_aq_votes
    WHERE seat AND (vote = 'EXIT' OR position_id IS NULL) AND at < now() - interval '15 minutes' AND at > now() - interval '3 hours'
      AND (graded_at IS NULL OR (pct_30m IS NULL AND pct_15m IS NOT NULL AND at < now() - interval '30 minutes' AND at > now() - interval '47 minutes')) ORDER BY id LIMIT 40`);
  if (due.length) {
    let px = {};
    const need = [...new Set(due.filter((v) => v.price_usd != null).map((v) => v.mint))];
    if (need.length) { try { px = await jupPrices(need); } catch { px = {}; } }
    for (const v of due) {
      const p = px[v.mint]?.price ?? null, pct = p == null || !v.price_usd ? null : round((p / v.price_usd - 1) * 100, 3);
      if (v.pct_15m == null) {
        if (v.price_usd == null) { await d.q(`UPDATE mob_aq_votes SET graded_at=now(), grade_by='no price at the vote' WHERE id=$1 AND graded_at IS NULL`, [v.id]); continue; }
        if (v.age > 24.5) { await d.q(`UPDATE mob_aq_votes SET graded_at=now(), grade_by='no price 15 minutes later' WHERE id=$1 AND graded_at IS NULL`, [v.id]); continue; }
        if (pct == null) continue; // no price this tick: the next tick asks again, inside the window
        const right = v.vote === "BUY" ? pct > (v.cost_pct ?? 0) : v.vote === "SKIP" ? pct <= (v.cost_pct ?? 0) : pct < 0;
        if (await d.one(`UPDATE mob_aq_votes SET pct_15m=$2, is_right=$3, grade_by='forward 15m', graded_at=now() WHERE id=$1 AND graded_at IS NULL RETURNING id`, [v.id, pct, right])) res.graded++;
      } else if (pct != null && v.age >= 30) await d.q(`UPDATE mob_aq_votes SET pct_30m=$2 WHERE id=$1 AND pct_30m IS NULL`, [v.id, pct]);
    }
  }
  // the vote weights, recomputed from each helper's own record; a change is a recorded tournament step
  const seats = await seatStats(d), prev = (await getState(d, "seat_weights", {})) || {}, now = {};
  for (const s of seats) {
    now[s.helper] = { right: s.right, wrong: s.wrong, weight: s.weight };
    const was = prev[s.helper]?.weight ?? 1;
    if (Math.abs(was - s.weight) >= 0.01) res.moved.push(`council_seat:${s.helper} ${was} -> ${s.weight} (${s.right} right, ${s.wrong} wrong of ${s.right + s.wrong} graded votes)`);
  }
  if (res.moved.length) await brain(d, "learning", "tournament", `Council seat weights recomputed from each helper's own graded votes (1 + 2 x (share right - one half), ${SEAT_MIN_GRADED}+ graded votes, else 1): ${res.moved.join("; ")}.`, { moved: res.moved });
  if (res.moved.length || JSON.stringify(prev) !== JSON.stringify(now)) await d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ('seat_weights',$1,now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [JSON.stringify(now)]);
  return res;
}

// ---------------------------------------------------------------- fast alerts (inside the helper's request)
export async function fastAlert(env, helper, a) {
  if (!SEATS.includes(helper) && !TESTERS.includes(helper)) return { error: `helper must be one of ${SEATS.join(", ")}` };
  const mint = String(a?.mint || ""), kind = String(a?.kind || "").toLowerCase(), price = num(a?.price);
  if (!MINT_RE.test(mint) || mint === SOL_MINT) return { error: "mint must be a Solana token address" };
  if (!["stop", "target", "narrative_dead"].includes(kind)) return { error: "kind must be stop, target or narrative_dead" };
  if (a?.price != null && (price == null || price <= 0)) return { error: "price must be a positive number (USD)" };
  const note = typeof a?.note === "string" ? a.note.replace(/\s+/g, " ").trim().slice(0, 300) : null;
  const d = db(env), dry = !SEATS.includes(helper);
  if (await overRate(d, "mob_aq_alerts", helper, "helper", RATE.alertsPerMin)) return { error: `rate limit: ${RATE.alertsPerMin} alerts a minute` };
  const p = await d.one(`SELECT * FROM mob_aq_positions WHERE mint=$1`, [mint]);
  const log = async (confirmed, result, facts = null, tradeId = null) => {
    const r = await d.one(`INSERT INTO mob_aq_alerts (helper, mint, symbol, kind, price, note, position_id, confirmed, result, trade_id, facts) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, at`,
      [helper, mint, p?.symbol ?? null, kind, price, note, p?.id ?? null, confirmed, result, tradeId, facts && JSON.stringify(facts)]);
    return { alert: { id: r.id, at: r.at, mint, symbol: p?.symbol ?? null, kind, confirmed, closed: confirmed, result, ...(facts || {}) } };
  };
  if (!p) return log(false, "alert not confirmed: no open position in this coin");
  if ((await getState(d, "destroyed", false)) === true) return log(false, "alert not confirmed: the island is destroyed, only Alex rebuilds");
  if (!p.exit_k || !p.sol_usd_entry) return log(false, "alert not confirmed: this position has no entry calibration; the minute tick manages it");
  const q = await jupQuote(p.mint, SOL_MINT, p.tokens_raw);
  if (!q) return log(false, "alert not confirmed: no sell quote right now; the minute tick will look again");
  // the position's own levels at the executable quote: the mid the quote implies (the reading the tick uses to confirm a
  // stop) must itself be at or past the stop or the target. Stricter than the tick on purpose: an alert never closes a
  // position on the cost of the sale alone.
  const gross = Number(q.outAmount) / 1e9, implied = impliedMid(p, gross), cost = p.size_sol + p.fee_sol, feeSol = NET_FEE_SOL;
  const netPct = round((((p.realized_sol || 0) + gross - feeSol - cost) / cost) * 100, 3);
  const met = implied >= p.target_price ? "target" : implied <= p.stop_price ? "stop" : null;
  const facts = { quotedUsd: round(implied, 12), stopUsd: p.stop_price, targetUsd: p.target_price, netPctIfSold: netPct, claimedUsd: price };
  if (!met) return log(false, `alert not confirmed: the sell quote implies $${round(implied, 10)}, between the stop $${round(p.stop_price, 10)} and the target $${round(p.target_price, 10)}${kind === "narrative_dead" ? "; a dying story is an EXIT vote (aq_council_vote), not an alert" : ""}`, facts);
  if (dry) return log(false, `alert not confirmed: test identity, nothing is closed (the ${met} rule is met at the quote)`, { ...facts, wouldClose: met });
  const why = `${met} confirmed after ${helper} alert`;
  const solUsd = (await getState(d, "sol_usd", null))?.price ?? p.sol_usd_entry;
  const exitPx = (gross * solUsd) / (Number(p.tokens_raw) / 10 ** p.decimals);
  // the claim (ledger.mjs): the same single statement the tick and SELL ALL use. null = one of them closed it first.
  const t = await closePosition(d, p, { gross, feeSol, exitPx, slip: p.last_price_usd ? round((p.last_price_usd / exitPx - 1) * 100, 3) : null, why, gradePrefix: "A", exitMid: p.last_price_usd ?? null });
  if (!t) return log(false, "alert not confirmed: the position was already closed by another request", facts);
  await brain(d, "review", "lesson", `${p.symbol} ${p.strategy}: ${why} at ${round(t.pnl_pct, 2)}% net, between minute ticks (the sell quote implied $${round(implied, 10)} against stop $${round(p.stop_price, 10)} / target $${round(p.target_price, 10)}; round trip at entry ${round(p.rt_pct, 2)}%). Process A: plan followed.`, { trade: t.id, pnlPct: round(t.pnl_pct, 3), why, alertBy: helper });
  await learnFromTrade(d, p, t.id, t.pnl_pct);
  return log(true, why, { ...facts, pnlPct: round(t.pnl_pct, 3) }, t.id);
}

// ---------------------------------------------------------------- war room
const msg = (r) => ({ id: Number(r.id), at: r.at, from: r.from_name, to: r.to_name, text: r.text });
export async function chatPost(env, from, a) {
  if (!CHAT_NAMES.includes(from)) return { error: `from must be one of ${CHAT_NAMES.join(", ")}` };
  const text = typeof a?.text === "string" ? a.text.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : "";
  if (!text || text.length > CHAT_MAX) return { error: `text must be 1-${CHAT_MAX} characters` };
  const to = a?.to == null || a.to === "" || String(a.to).toLowerCase() === "all" ? null : String(a.to).toLowerCase();
  if (to && !CHAT_NAMES.includes(to)) return { error: `to must be one of ${CHAT_NAMES.join(", ")} (or left out for everyone)` };
  const d = db(env);
  if (await overRate(d, "mob_aq_chat", from, "from_name", RATE.chatPerMin)) return { error: `rate limit: ${RATE.chatPerMin} messages a minute` };
  return { message: msg(await d.one(`INSERT INTO mob_aq_chat (from_name, to_name, text) VALUES ($1,$2,$3) RETURNING *`, [from, to, text])) };
}
// unread = messages from someone else, to everyone or to this name, after the last one this name has read
const UNREAD = `SELECT count(*)::int n FROM mob_aq_chat WHERE from_name <> $1::text AND (to_name IS NULL OR to_name = $1::text) AND id > coalesce((SELECT (v->>$1::text)::bigint FROM mob_aq_state WHERE k='chat_read'), 0)`;
export async function chatRead(env, who, { since = null, mark = true, limit = 100 } = {}) {
  if (!CHAT_NAMES.includes(who)) return { error: `reader must be one of ${CHAT_NAMES.join(", ")}` };
  const d = db(env), s = Number(since);
  const rows = since != null && Number.isFinite(s) && s >= 0
    ? await d.q(`SELECT * FROM mob_aq_chat WHERE id > $1 ORDER BY id LIMIT $2`, [Math.floor(s), limit])
    : (await d.q(`SELECT * FROM mob_aq_chat ORDER BY id DESC LIMIT 30`)).reverse();
  const last = rows.length ? Number(rows.at(-1).id) : null;
  // the read mark only moves forward, in one statement (two readers of the same name cannot move it back)
  if (mark && last != null) await d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ('chat_read', jsonb_build_object($1::text, $2::bigint), now())
    ON CONFLICT (k) DO UPDATE SET v = mob_aq_state.v || jsonb_build_object($1::text, greatest(coalesce((mob_aq_state.v->>$1)::bigint, 0), $2::bigint)), at = now()`, [who, last]);
  return { messages: rows.map(msg), lastId: last, unread: (await d.one(UNREAD, [who])).n };
}
export async function warroom(d) {
  const [rows, read] = await Promise.all([d.q(`SELECT * FROM mob_aq_chat ORDER BY id DESC LIMIT 30`), getState(d, "chat_read", {})]);
  const cnt = await d.q(`SELECT n.who, count(c.id)::int n FROM unnest($1::text[]) n(who) LEFT JOIN mob_aq_chat c ON c.from_name <> n.who AND (c.to_name IS NULL OR c.to_name = n.who)
    AND c.id > coalesce((SELECT (v->>n.who)::bigint FROM mob_aq_state WHERE k='chat_read'), 0) GROUP BY n.who`, [CHAT_NAMES.filter((n) => !TESTERS.includes(n))]);
  return { messages: rows.reverse().map(msg), unread: Object.fromEntries(cnt.map((r) => [r.who, r.n])), lastRead: read || {} };
}
// the last five messages addressed to this name (or to everyone), for the end of its briefing
export async function chatFor(d, who) {
  return (await d.q(`SELECT * FROM mob_aq_chat WHERE from_name <> $1 AND (to_name = $1 OR to_name IS NULL) ORDER BY id DESC LIMIT 5`, [who])).reverse().map(msg);
}
export async function recentAlerts(d) {
  return (await d.q(`SELECT id, at, helper, symbol, mint, kind, price, note, confirmed, result, trade_id FROM mob_aq_alerts ORDER BY id DESC LIMIT 20`)).map((r) => ({ id: r.id, at: r.at, helper: r.helper, symbol: r.symbol, mint: r.mint, kind: r.kind, price: r.price, note: r.note, confirmed: r.confirmed, result: r.result, tradeId: r.trade_id }));
}
