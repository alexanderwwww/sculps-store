// THE BRAIN — heuristic (free) OR Claude (real understanding + vision judging).
// Claude turns on automatically when ANTHROPIC_API_KEY is set (in your local .env).
// The key is NEVER hardcoded here — it's read from the environment only.

function extractNiche(text) {
  const m = String(text || "").match(/(?:search|find|look for|scan|get|show|learn)\s+(?:me\s+)?(?:for\s+|the\s+)?(.+)/i);
  return (m ? m[1] : text || "trending products").replace(/[.!?]+$/, "").trim() || "trending products";
}

// ---------- FREE heuristic brain ----------
export const heuristicBrain = {
  name: "heuristic",
  interpret(text) {
    const t = String(text || "").toLowerCase().trim();
    if (/^(scroll|next|down|keep going)\b/.test(t)) return { action: "next" };
    if (/^(up|previous|prev)\b/.test(t)) return { action: "prev" };
    if (/^(like|heart|love)\b/.test(t)) return { action: "like" };
    if (/^(go ?back|back)\b/.test(t)) return { action: "back" };
    return { action: "search", q: extractNiche(text) };
  },
};

// ---------- REAL Claude brain ----------
const MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001"; // cheap + fast + vision

async function callClaude(content, { system, max_tokens = 350 } = {}) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens, system, messages: [{ role: "user", content }] }),
  });
  if (!r.ok) throw new Error("Claude " + r.status + ": " + (await r.text()).slice(0, 200));
  const j = await r.json();
  return (j.content || []).map((c) => c.text || "").join("");
}
const parseJSON = (t) => { const m = String(t).match(/\{[\s\S]*\}/); try { return JSON.parse(m ? m[0] : t); } catch { return null; } };

export const claudeBrain = {
  name: "claude",

  // understand a typed command -> one action
  async interpret(text) {
    const system =
      'Convert the user command for a TikTok product-research agent into ONE action. Reply ONLY JSON.\n' +
      'Actions: {"action":"search","q":"..."} | {"action":"learn","q":"..."} | {"action":"next"} | {"action":"prev"} | {"action":"like"} | {"action":"analyze"} | {"action":"back"}.\n' +
      '"analyze them"/"judge"/"rate this" -> analyze. "find/search/look for X" -> search with q=X. "scroll/next" -> next. "research X"/"learn the market" -> learn.';
    try { return parseJSON(await callClaude([{ type: "text", text: String(text) }], { system, max_tokens: 120 })) || { action: "search", q: extractNiche(text) }; }
    catch (e) { return { action: "search", q: extractNiche(text), _err: e.message }; }
  },

  // look at a TikTok screenshot and judge it with ecom knowledge
  async judge(imgB64) {
    const system =
      'You are an elite e-commerce product researcher with a hustler\'s eye, watching TikTok for winning dropshipping products.\n' +
      'Look at the screenshot. Decide if it features a PHYSICAL product worth selling. Reply ONLY JSON:\n' +
      '{"isProduct":true|false,"title":"short product name","category":"...","estPrice":number,"xScore":0-100,"risk":"Low|Medium|High","verdict":"chase|watch|skip","why":"one short line"}.\n' +
      'Judge on: viral demand, wow-factor/demoability, margin (impulse $20-60 is best), saturation, and ad-compliance (supplements, weapons, weight-loss, sexual = High risk). If it is NOT a product (meme, dance, vlog), return {"isProduct":false}.';
    try {
      return parseJSON(await callClaude([
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imgB64 } },
        { type: "text", text: "Judge this TikTok for dropshipping potential." },
      ], { system, max_tokens: 300 }));
    } catch (e) { return { isProduct: false, _err: e.message }; }
  },
};

export function getBrain() {
  return process.env.ANTHROPIC_API_KEY ? claudeBrain : heuristicBrain;
}
