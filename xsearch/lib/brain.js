// The BRAIN — decides what the agent should do. Swappable.
//   heuristicBrain : free, rule-based. Works today.
//   claudeBrain    : the real one. Turns on when ANTHROPIC_API_KEY is set.
//
// To upgrade to real Claude later: add ANTHROPIC_API_KEY to .env and fill in the
// marked section in claudeBrain.nextAction (send the screenshot + goal to the API,
// return the action). Nothing else changes — the agent loop already calls the brain.

function extractNiche(text) {
  const m = String(text || "").match(/(?:search|find|look for|scan|get|show|learn)\s+(?:me\s+)?(?:for\s+|the\s+)?(.+)/i);
  return (m ? m[1] : text || "trending products").replace(/[.!?]+$/, "").replace(/\b(market|niche|on tiktok|products?)\b/gi, "").trim() || "trending products";
}

export const heuristicBrain = {
  name: "heuristic",
  // turn one typed command into one action
  interpret(text) {
    const t = String(text || "").toLowerCase().trim();
    if (/^(scroll|next|down|keep going)\b/.test(t)) return { action: "scroll" };
    if (/^(up|previous|prev)\b/.test(t)) return { action: "scrollUp" };
    if (/^(like|heart|love)\b/.test(t)) return { action: "like" };
    if (/^open\s+(\d+)/.test(t)) return { action: "open", n: +RegExp.$1 };
    if (/^(go ?back|back)\b/.test(t)) return { action: "back" };
    return { action: "search", q: extractNiche(text) };
  },
  // the autonomous "learn the market" plan: search, then scroll the feed a few times
  marketPlan(goal) {
    const q = extractNiche(goal);
    return { niche: q, steps: [{ action: "search", q }, { action: "scroll" }, { action: "scroll" }, { action: "scroll" }, { action: "scroll" }, { action: "scroll" }] };
  },
};

export const claudeBrain = {
  name: "claude",
  async interpret(text) {
    // TODO (later): POST text to Anthropic, return a structured action.
    return heuristicBrain.interpret(text);
  },
  async marketPlan(goal) {
    // TODO (later): let Claude look at the screen each step and decide the next move
    // (true autonomy). For now it borrows the heuristic plan so the loop runs.
    return heuristicBrain.marketPlan(goal);
  },
};

export function getBrain() {
  return process.env.ANTHROPIC_API_KEY ? claudeBrain : heuristicBrain;
}
