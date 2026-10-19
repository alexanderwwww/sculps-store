/*
 * Narrative score N (0-100) from two INDEPENDENT sources (knowledge-base.md
 * section 3 and 9):
 *
 *   A  GMGN on-chain + GMGN social: smart/KOL wallets buying now (trade
 *      maker_tags in the last hour), smart and KOL holders (token_holder_stat),
 *      public calls on the coin in the last hour (callout/global, KOL calls
 *      counted apart), GMGN community posts in the last hour.
 *   B  X: the coin's own tweet through the public embed, plus live X search in
 *      Alex's signed-in Chrome when ultracursor runs it (x.mjs).
 *
 * N = 0.618 x max(A, B) + 0.382 x min(A, B). The two agree when both are at
 * least 38.2. Fire needs agreement AND N >= 61.8. A source with no data is
 * missing, and missing is a NO. A source the memory has dropped (34 trades
 * under break-even) counts as missing too.
 */
import { V2 } from "./fib.mjs";
import { xScore } from "./x.mjs";

const sat = (x, k) => Math.max(0, Math.min(1, (Number(x) || 0) / k));
const SMART_TAGS = new Set(["smart_degen", "renowned", "kol", "launchpad_smart"]);

/** Distinct smart/KOL makers buying in the last hour, and how much of the hour the 50 trades cover. */
export function smartBuys(trades, nowSec) {
  const h = (trades || []).filter((t) => nowSec - Number(t.timestamp) <= 3600);
  const makers = new Set(h.filter((t) => t.event === "buy" && (t.maker_tags || []).some((g) => SMART_TAGS.has(g))).map((t) => t.maker));
  const oldest = (trades || []).reduce((m, t) => Math.min(m, Number(t.timestamp)), nowSec);
  return { count: makers.size, windowMin: Math.round((nowSec - oldest) / 60) };
}

/** Score A, or null when GMGN gave nothing for the coin. */
export function gmgnScore({ trades, holderStat, callouts, community, addr, nowSec }) {
  if (!trades && !holderStat && !callouts && !community) return { score: null, parts: {} };
  const parts = {};
  if (trades) parts.smartBuys1h = sat(smartBuys(trades, nowSec).count, 5);
  if (holderStat) { parts.smartHolders = sat(holderStat.smart_degen_count, 8); parts.kolHolders = sat(holderStat.renowned_count, 3); }
  if (callouts) {
    const mine = callouts.filter((c) => c.call_token === addr && nowSec * 1000 - Number(c.create_time) <= 3600_000);
    parts.calls1h = sat(mine.length, 8);
    parts.kolCalls1h = sat(mine.filter((c) => c.is_kol).length, 2);
  }
  if (community) parts.posts1h = sat(community.filter((m) => nowSec * 1000 - Date.parse(m.created_at) <= 3600_000).length, 13);
  const v = Object.values(parts);
  return { score: v.length ? +(100 * v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : null, parts };
}

// Themes of the day, tagged from name, symbol and the coin's tweet.
const THEMES = {
  ai: /\b(ai|agent|gpt|claude|llm|neural|bot|robot|agi)\b/i,
  politics: /\b(trump|maga|biden|election|president|senate|elon|musk|doge)\b/i,
  animals: /\b(dog|cat|frog|pepe|inu|shib|bonk|wif|monkey|ape|penguin|hippo|bird|fish|bear|bull)\b/i,
  culture: /\b(meme|lol|based|chad|wojak|giga|sigma|rizz|skibidi|npc)\b/i,
  finance: /\b(stock|xstock|etf|fed|rate|bank|treasury|gold|usd)\b/i,
  crypto: /\b(sol|solana|btc|bitcoin|eth|pump|moon|jup|ray)\b/i,
};
export function themeOf(...texts) {
  const s = texts.filter(Boolean).join(" ");
  for (const [k, re] of Object.entries(THEMES)) if (re.test(s)) return k;
  return "other";
}
/** How hot each theme is today: share of the trending board. */
export function themeHeat(rows) {
  const n = {};
  for (const r of rows) { const t = themeOf(r.nm, r.s); n[t] = (n[t] || 0) + 1; }
  const tot = rows.length || 1;
  return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, +(v / tot).toFixed(3)]));
}

/**
 * Combine. `dropped` = source names the memory dropped ("gmgn", "x").
 */
export function narrative({ gmgn, x, dropped = [] }) {
  const A = dropped.includes("gmgn") ? null : gmgn?.score ?? null;
  const B = dropped.includes("x") ? null : x?.score ?? null;
  if (A === null || B === null) return { N: null, A, B, agree: false, ok: false, why: `missing source: ${A === null ? "GMGN" : ""}${A === null && B === null ? " and " : ""}${B === null ? "X" : ""}` };
  const N = +(0.618 * Math.max(A, B) + 0.382 * Math.min(A, B)).toFixed(1);
  const agree = Math.min(A, B) >= V2.sourceAgree;
  const ok = agree && N >= V2.narrativeMin;
  return { N, A, B, agree, ok, why: ok ? `N ${N}: GMGN ${A} and X ${B} agree` : !agree ? `sources disagree: GMGN ${A}, X ${B}` : `N ${N} under ${V2.narrativeMin}` };
}

export { xScore };
