import { tick, fresh, todayBars, WATCH, RULES } from "./engine.mjs";
import PAGE from "./page.html";

const KEY = "state";
async function load(env) { return (await env.KV.get(KEY, "json")) || fresh(); }
const save = (env, s) => env.KV.put(KEY, JSON.stringify(s));

async function fetchBars(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=5m&range=1d`, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error("yahoo " + r.status);
  const bars = todayBars(await r.json());
  // drop the bar still forming (younger than 5 minutes)
  const now = Date.now() / 1000;
  return bars.filter(b => b.t + 300 <= now);
}

// Grok: model picked from the account's own /v1/models list, never hard-coded.
async function grokFor(env) {
  const key = await env.KV.get("xai_key");
  if (!key) return null;
  let model = await env.KV.get("xai_model");
  if (!model) {
    const r = await fetch("https://api.x.ai/v1/models", { headers: { authorization: `Bearer ${key}` } });
    const j = await r.json();
    const ids = (j.data || []).map(m => m.id).filter(id => /grok/i.test(id) && !/image|vision|imagine/i.test(id));
    model = ids.sort().reverse()[0];
    if (!model) throw new Error("no Grok model on this key");
    await env.KV.put("xai_model", model);
  }
  return async (t, bias) => {
    const r = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, temperature: 0.2, messages: [
        { role: "system", content: "You are the risk desk on a paper day-trading account. Claude's engine found an opening-range breakout. Use what you know about today's news, earnings and X sentiment to catch a bad trade. Reply JSON only: {\"verdict\":\"TAKE\"|\"SKIP\",\"why\":\"one short sentence\"}" },
        { role: "user", content: JSON.stringify({ trade: t, marketBias: bias, time: new Date().toISOString() }) }] })
    });
    const j = await r.json();
    const txt = j.choices?.[0]?.message?.content || "";
    const m = txt.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : { verdict: "TAKE", why: txt.slice(0, 120) };
  };
}

async function run(env) {
  const s = await load(env);
  let grok = null, grokErr = null;
  try { grok = await grokFor(env); } catch (e) { grokErr = e.message; }
  await tick(s, fetchBars, Math.floor(Date.now() / 1000), grok);
  s.grok = grok ? "on" : grokErr ? "error: " + grokErr : "off";
  await save(env, s);
  return s;
}

const json = (d, st = 200) => new Response(JSON.stringify(d), { status: st, headers: { "content-type": "application/json" } });

export default {
  async scheduled(_e, env, ctx) { ctx.waitUntil(run(env)); },
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname === "/") return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (u.pathname === "/api/state") { const s = await load(env); s.hasGrok = !!(await env.KV.get("xai_key")); s.rules = RULES; s.watch = WATCH; return json(s); }
    if (req.method !== "POST") return json({ error: "not found" }, 404);
    if (u.pathname === "/api/run") return json(await run(env));
    if (u.pathname === "/api/toggle") { const s = await load(env); s.on = !s.on; await save(env, s); return json(s); }
    if (u.pathname === "/api/reset") { await save(env, fresh()); return json(fresh()); }
    if (u.pathname === "/api/grok") { const { key } = await req.json(); await env.KV.delete("xai_model"); if (key) await env.KV.put("xai_key", key.trim()); else await env.KV.delete("xai_key"); return json({ ok: true }); }
    return json({ error: "not found" }, 404);
  }
};
