// THE BRAIN — heuristic (free) OR Claude (autonomous understanding + vision judging).
// Claude turns on when ANTHROPIC_API_KEY is set (local .env). Key is never hardcoded.

function niche(text) {
  const m = String(text || "").match(/(?:search|find|look for|scan|get|show|learn|research)\s+(?:me\s+)?(?:for\s+|the\s+)?(.+)/i);
  return (m ? m[1] : text || "").replace(/[.!?]+$/, "").trim();
}

export const heuristicBrain = {
  name: "heuristic",
  interpret(t) {
    t = String(t || "").toLowerCase().trim();
    if (/^(scroll|next|down)\b/.test(t)) return { action: "next" };
    if (/^(up|prev|previous)\b/.test(t)) return { action: "prev" };
    if (/^(like|heart)\b/.test(t)) return { action: "like" };
    if (/^(analyze|judge|rate)\b/.test(t)) return { action: "analyze" };
    if (/^(back)\b/.test(t)) return { action: "back" };
    return { action: "learn", q: niche(t) };
  },
  async plan(goal) { const q = niche(goal) || ""; return { niche: q || "viral products", queries: [q || "tiktokmademebuyit", "amazonfinds", "gadgetsoftiktok"].filter(Boolean) }; },
};

const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";
async function callClaude(content, { system, max_tokens = 350 } = {}) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens, system, messages: [{ role: "user", content }] }),
  });
  if (!r.ok) throw new Error("Claude " + r.status + ": " + (await r.text()).slice(0, 160));
  return ((await r.json()).content || []).map((c) => c.text || "").join("");
}
const parseJSON = (t) => { const m = String(t).match(/\{[\s\S]*\}/); try { return JSON.parse(m ? m[0] : t); } catch { return null; } };

export const claudeBrain = {
  name: "claude",

  async interpret(text) {
    const system =
      'Convert the command for a TikTok product-research agent into ONE action. Reply ONLY JSON.\n' +
      '{"action":"learn","q":"<niche or empty>"} = go hunt+judge products (default for "find/search/research X", "find me winners", "learn the market").\n' +
      '{"action":"analyze"} = judge the video on screen now ("analyze","judge this","rate it").\n' +
      '{"action":"next"} / {"action":"prev"} / {"action":"like"} / {"action":"back"} = simple controls.';
    try { return parseJSON(await callClaude([{ type: "text", text: String(text) }], { system, max_tokens: 120 })) || { action: "learn", q: niche(text) }; }
    catch (e) { return { action: "learn", q: niche(text), _err: e.message }; }
  },

  // autonomy: decide what to hunt
  async plan(goal) {
    const system =
      'You are a starving dropshipping hustler. Given a goal, output the 3 BEST TikTok searches/hashtags to surface winning physical products to flip TODAY. ' +
      'Reply ONLY JSON {"niche":"...","queries":["q1","q2","q3"]}. Favor product-discovery tags (tiktokmademebuyit, amazonfinds, gadgetsoftiktok, coolgadgets) plus the specific niche. No "#".';
    try { return parseJSON(await callClaude([{ type: "text", text: "Goal: " + (goal || "find any winning product to flip") }], { system, max_tokens: 200 })) || await heuristicBrain.plan(goal); }
    catch { return await heuristicBrain.plan(goal); }
  },

  // the eye: judge a TikTok screenshot like a ruthless ecom hustler
  async judge(imgB64) {
    const system =
      'You are a STARVING dropshipping hustler scanning TikTok to find ONE product to flip for profit TODAY. Ruthless, fast, money-hungry.\n' +
      'Look at the screenshot. Is a PHYSICAL product being shown/sold that you could dropship? Reply ONLY JSON:\n' +
      '{"isProduct":bool,"title":"short name","category":"...","estPrice":selling$ number,"estCost":wholesale$ from AliExpress/CJ number,"xScore":0-100,"risk":"Low|Medium|High","verdict":"chase|watch|skip","why":"one punchy line"}\n' +
      'Validate hard (your rent depends on it): viral demand · 3-second wow/demoability · margin (estPrice ~3-5x estCost, impulse $20-60 best) · saturation (basic phone cases etc = low) · ad-compliance (supplements/weapons/sexual/weight-loss = High risk). ' +
      'verdict "chase" ONLY if you would bet your last $100. If it is NOT a product (meme, dance, vlog, talking head), return {"isProduct":false}.';
    try {
      return parseJSON(await callClaude([
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imgB64 } },
        { type: "text", text: "Judge this TikTok for dropshipping. Be ruthless." },
      ], { system, max_tokens: 320 }));
    } catch (e) { return { isProduct: false, _err: e.message }; }
  },
};

export function getBrain() { return process.env.ANTHROPIC_API_KEY ? claudeBrain : heuristicBrain; }
