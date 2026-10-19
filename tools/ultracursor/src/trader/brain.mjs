/*
 * The strict brain (knowledge-base.md section 8, "Strict brain"). One pure
 * function decides FIRE or NO for a candidate from everything the senses
 * read. Any missing data is a NO. There is no override argument, no flag, no
 * path that turns a failed signal into a pass.
 *
 * Eight signals, all required to FIRE (tiers 3 / 5 / 8 = watch / ready / fire):
 *   prefilter   trending row: age, liquidity, top10, smart+KOL count
 *   gate        security gate G (gate.mjs): LP, mint/freeze, dev, top10, volume, ...
 *   swing       a confirmed 1m impulse to retrace into
 *   confluence  >= 3 of the 1 / 3 / 5 / 13 / 21-minute timeframes agree
 *   smartNow    >= 2 smart/KOL wallets bought in the last hour (trade maker_tags)
 *   narrative   N >= 61.8 with GMGN and X agreeing (narrative.mjs)
 *   regime      SOL not in a sharp downtrend
 *   costs       a priced route under the impact cap, and W >= 3|Λ| after real costs
 *
 * Then, and only able to say NO:
 *   gut veto    the memory's conviction, once it has evidence, under its line
 *   recovery    while a loss is being recovered: confluence >= 4, and gut >= 50 with evidence
 */
import { tierOf } from "./fib.mjs";
import { buckets } from "./memory.mjs";

export function decide(f, { memory = null, inRecovery = false } = {}) {
  const s = {
    prefilter: f.prefilter?.ok === true,
    gate: f.gate?.pass === true,
    swing: !!f.swing,
    confluence: f.confluence?.ok === true,
    smartNow: Number.isFinite(f.smartNow?.count) && f.smartNow.count >= 2,
    narrative: f.narrative?.ok === true,
    regime: f.regime?.ok === true,
    costs: f.fees?.ok === true && f.costRule?.ok === true,
  };
  const t = tierOf(s);
  const failed = Object.keys(s).filter((k) => !s[k]);
  const features = featuresOf(f);
  const gut = memory ? memory.gut(features) : { score: 50, evidence: 0, parts: {} };
  let decision = t.tier === "fire" ? "FIRE" : "NO";
  let reason = decision === "FIRE" ? "all 8 signals hold" : `NO: ${failed.map((k) => `${k} (${why(k, f)})`).join("; ")}`;
  if (decision === "FIRE" && memory && memory.gutVeto(gut)) { decision = "NO"; reason = `NO: gut ${gut.score} under ${memory.brain.strictness} on ${gut.evidence} past trades`; }
  if (decision === "FIRE" && inRecovery) {
    if ((f.confluence?.agree || 0) < 4) { decision = "NO"; reason = `NO: recovering a loss needs confluence >= 4 (have ${f.confluence?.agree})`; }
    else if (gut.evidence >= 13 && gut.score < 50) { decision = "NO"; reason = `NO: recovering a loss needs gut >= 50 (have ${gut.score})`; }
  }
  return { decision, tier: t.tier, n: t.n, signals: s, failed, reason, gut, features, tools: toolsOf(f) };
}

function why(k, f) {
  switch (k) {
    case "prefilter": return f.prefilter?.why || "missing";
    case "gate": return f.gate ? f.gate.failed.join(", ") : "missing";
    case "swing": return "no confirmed impulse";
    case "confluence": return f.confluence ? `${f.confluence.agree}/5` : "missing";
    case "smartNow": return f.smartNow ? `${f.smartNow.count} in ${f.smartNow.windowMin} min of trades` : "missing";
    case "narrative": return f.narrative?.why || "missing";
    case "regime": return f.regime?.why || "missing";
    case "costs": return f.fees && !f.fees.ok ? f.fees.why : f.costRule ? f.costRule.why : "not quoted (earlier signal failed)";
    default: return "";
  }
}

export function featuresOf(f) {
  const nowSec = f.nowSec;
  const created = Number(f.full?.creation_timestamp || f.row?.ct || f.row?.ot) || null;
  return {
    ageMin: created ? Math.round((nowSec - created) / 60) : undefined,
    liqK: f.full?.liquidity ? +(Number(f.full.liquidity) / 1000).toFixed(1) : undefined,
    top10Pct: f.full?.top_10_holder_rate !== undefined ? +(Number(f.full.top_10_holder_rate) * 100).toFixed(1) : undefined,
    smart: f.smartNow?.count,
    N: f.narrative?.N ?? undefined,
    A: f.narrative?.A ?? undefined,
    B: f.narrative?.B ?? undefined,
    confluence: f.confluence?.agree,
    hour: new Date(nowSec * 1000).getUTCHours(),
    theme: f.theme,
    costRtPct: f.fees?.costRt !== undefined ? +(f.fees.costRt * 100).toFixed(2) : undefined,
    route: f.fees?.route,
  };
}

/** The tools whose signal was positive for this candidate (memory scores their usefulness). */
export function toolsOf(f) {
  const t = ["trending", "fullInfo", "candles"];
  if (f.gate?.pass) t.push("topBuyers");
  if (f.smartNow?.count >= 2) t.push("trades");
  if (f.narrative?.gmgn?.parts?.smartHolders > 0 || f.narrative?.gmgn?.parts?.kolHolders > 0) t.push("holderStat");
  if (f.narrative?.gmgn?.parts?.calls1h > 0) t.push("callouts");
  if (f.narrative?.gmgn?.parts?.posts1h > 0) t.push("community");
  if (f.narrative?.x?.parts?.likes !== undefined) t.push("xTweet");
  if (f.narrative?.x?.parts?.mentions1h !== undefined) t.push("xSearch");
  if (f.fees?.route === "jupiter") t.push("jupiterQuote");
  return t;
}

export { buckets };
