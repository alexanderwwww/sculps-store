import { tick, fresh, todayBars, WATCH, RULES } from "./engine.mjs";
import PAGE from "./page.html";
import FIVEPAGE from "./five.html";
import { fiveTick, freshFive } from "./five.mjs";
import { kalshiTick, freshK } from "./kalshi.mjs";
import { polyTick, freshP } from "./poly.mjs";

const COINS = { BTC: "BTC-USD", ETH: "ETH-USD", SOL: "SOL-USD" };
async function candles(coin){ const r=await fetch(`https://api.exchange.coinbase.com/products/${COINS[coin]}/candles?granularity=60`,{headers:{"user-agent":"daytrader"}}); if(!r.ok) throw new Error("coinbase "+r.status); return (await r.json()).map(([t,l,h,o,c])=>({t,o,c,h,l})).sort((a,b)=>a.t-b.t); }
async function ticker(coin){ const r=await fetch(`https://api.exchange.coinbase.com/products/${COINS[coin]}/ticker`,{headers:{"user-agent":"daytrader"}}); const j=await r.json(); return +j.price; }
async function runPoly(env){
  const all=(await env.KV.get("poly","json"))||{}; const now=Math.floor(Date.now()/1000); const start=Math.floor(now/300)*300;
  const getJSON=u=>fetch(u,{headers:{"user-agent":"daytrader"}}).then(r=>r.json());
  await Promise.all(Object.keys(COINS).map(async k=>{ const s=all[k]||freshP(); try{
    const [cs,px]=await Promise.all([candles(k),ticker(k)]); const c=cs.slice(-61);
    const rets=c.slice(1).map((x,i)=>Math.log(x.c/c[i].c)); const vol=Math.sqrt(rets.reduce((a,r)=>a+r*r,0)/Math.max(1,rets.length));
    if(s.openFor!==start){ const oc=cs.find(x=>x.t===start); const pc=cs.find(x=>x.t===start-60); if(oc){ s.openFor=start; s.openPx=oc.o; } else if(pc){ s.openFor=start; s.openPx=pc.c; } else if(now-start<20){ s.openFor=start; s.openPx=px; } }
    const p5=c.length>5?c[c.length-6].c:px;
    await polyTick(k,s,{getJSON,price:px,openPrice:s.openFor===start?s.openPx:null,vol1m:vol,move5:(px-p5)/p5,nowSec:now}); s.err=null; }catch(e){ s.err=String(e.message||e); } s.last=now; all[k]=s; }));
  await env.KV.put("poly",JSON.stringify(all)); return all; }
async function runKalshi(env){
  const all=(await env.KV.get("kalshi","json"))||{}; const now=Math.floor(Date.now()/1000);
  const getJSON=u=>fetch(u,{headers:{"user-agent":"daytrader"}}).then(r=>r.json());
  await Promise.all(Object.keys(COINS).map(async k=>{ const s=all[k]||freshK(); try{
    const [cs,px]=await Promise.all([candles(k),ticker(k)]); const c=cs.slice(-61);
    const rets=c.slice(1).map((x,i)=>Math.log(x.c/c[i].c)); const vol=Math.sqrt(rets.reduce((a,r)=>a+r*r,0)/Math.max(1,rets.length));
    const p5=c.length>5?c[c.length-6].c:px; await kalshiTick(k,s,{getJSON,price:px,vol1m:vol,move5:(px-p5)/p5,nowSec:now}); s.px=px; s.err=null; }catch(e){ s.err=String(e.message||e); } s.last=now; all[k]=s; }));
  await env.KV.put("kalshi",JSON.stringify(all)); return all; }
async function runFive(env){
  const all=(await env.KV.get("five3","json"))||{}; const now=Math.floor(Date.now()/1000);
  await Promise.all(Object.keys(COINS).map(async k=>{ const s=all[k]||freshFive(); try{ const [cs,px]=await Promise.all([candles(k),ticker(k)]); const c=cs.filter(x=>x.t+60<=now).slice(-70); const live=Math.floor(now/60)*60; if(px>0&&(!c.length||c.at(-1).t<live)) c.push({t:live,o:c.at(-1)?.c??px,c:px,h:px,l:px}); fiveTick(s,c,now); s.err=null; }catch(e){ s.err=String(e.message||e); } all[k]=s; }));
  await env.KV.put("five3",JSON.stringify(all)); return all; }

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

// Storage: one Durable Object (SQLite) shaped like KV, so no extra Cloudflare permission is needed.
export class Store {
  constructor(state) { this.st = state.storage; }
  async fetch(req) {
    const { op, key, val } = await req.json();
    if (op === "get") return new Response(JSON.stringify({ v: (await this.st.get(key)) ?? null }));
    if (op === "put") { await this.st.put(key, val); return new Response("{}"); }
    if (op === "del") { await this.st.delete(key); return new Response("{}"); }
    return new Response("{}", { status: 400 });
  }
}
function kv(env) {
  const stub = env.STORE.get(env.STORE.idFromName("main"));
  const call = b => stub.fetch("https://store/", { method: "POST", body: JSON.stringify(b) }).then(r => r.json());
  return {
    get: async (key, type) => { const { v } = await call({ op: "get", key }); return v == null ? null : type === "json" ? JSON.parse(v) : v; },
    put: (key, val) => call({ op: "put", key, val }),
    delete: key => call({ op: "del", key }),
  };
}
const withKV = env => (env.KV ? env : { ...env, KV: kv(env) });

export default {
  async scheduled(e, env0, ctx) { const env = withKV(env0); ctx.waitUntil(runPoly(env)); ctx.waitUntil(runFive(env)); if (new Date(e.scheduledTime).getUTCMinutes() % 5 === 0) ctx.waitUntil(run(env)); },
  async fetch(req, env0) {
    const env = withKV(env0);
    const u = new URL(req.url);
    if (u.pathname === "/") return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (u.pathname === "/api/state") { const s = await load(env); s.hasGrok = !!(await env.KV.get("xai_key")); s.rules = RULES; s.watch = WATCH; return json(s); }
    if (u.pathname === "/five") return new Response(FIVEPAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
    if (u.pathname === "/api/five") return json((await env.KV.get("five3","json"))||{});
    if (u.pathname === "/api/px") { const out={}; await Promise.all(Object.keys(COINS).map(async k=>{ try{ out[k]=await ticker(k); }catch(e){} })); return json(out); }
    if (u.pathname === "/api/poly") return json((await env.KV.get("poly","json"))||{});
    if (u.pathname === "/api/poly/run" && req.method==="POST") return json(await runPoly(env));
    if (u.pathname === "/api/poly/reset" && req.method==="POST") { const all={}; for (const k of Object.keys(COINS)) all[k]=freshP(); await env.KV.put("poly",JSON.stringify(all)); return json(all); }
    if (u.pathname === "/api/poly/toggle" && req.method==="POST") { const all=(await env.KV.get("poly","json"))||{}; const on=!Object.values(all).some(s=>s.on===false); for (const k of Object.keys(COINS)) { all[k]=all[k]||freshP(); all[k].on=!on; } await env.KV.put("poly",JSON.stringify(all)); return json(all); }
    if (u.pathname === "/api/kalshi") return json((await env.KV.get("kalshi","json"))||{});
    if (u.pathname === "/api/kalshi/run" && req.method==="POST") return json(await runKalshi(env));
    if (u.pathname === "/api/kalshi/reset" && req.method==="POST") { const all={}; for (const k of Object.keys(COINS)) all[k]=freshK(); await env.KV.put("kalshi",JSON.stringify(all)); return json(all); }
    if (u.pathname === "/api/kalshi/toggle" && req.method==="POST") { const all=(await env.KV.get("kalshi","json"))||{}; const on=!Object.values(all).some(s=>s.on===false); for (const k of Object.keys(COINS)) { all[k]=all[k]||freshK(); all[k].on=!on; } await env.KV.put("kalshi",JSON.stringify(all)); return json(all); }
    if (u.pathname === "/api/live") { const out={}; await Promise.all(Object.keys(COINS).map(async k=>{ try{ const c=(await candles(k)).slice(-90); out[k]={candles:c.map(x=>[x.t,x.o,x.c]), price:await ticker(k)}; }catch(e){ out[k]={error:String(e.message||e)}; } })); return json(out); }
    if (u.pathname === "/api/five/toggle" && req.method==="POST") { const all=(await env.KV.get("five3","json"))||{}; const on=!Object.values(all).some(s=>s.on===false); for (const k of Object.keys(COINS)) { all[k]=all[k]||freshFive(); all[k].on=!on; } await env.KV.put("five3",JSON.stringify(all)); return json(all); }
    if (u.pathname === "/api/five/run" && req.method==="POST") { try { return json(await runFive(env)); } catch (e) { return json({ error: String(e.message||e) }, 500); } }
    if (u.pathname === "/api/five/reset" && req.method==="POST") { const all={}; for (const k of Object.keys(COINS)) all[k]=freshFive(); await env.KV.put("five3",JSON.stringify(all)); return json(all); }
    if (req.method !== "POST") return json({ error: "not found" }, 404);
    if (u.pathname === "/api/run") return json(await run(env));
    if (u.pathname === "/api/toggle") { const s = await load(env); s.on = !s.on; await save(env, s); return json(s); }
    if (u.pathname === "/api/reset") { await save(env, fresh()); return json(fresh()); }
    if (u.pathname === "/api/grok") { const { key } = await req.json(); await env.KV.delete("xai_model"); if (key) await env.KV.put("xai_key", key.trim()); else await env.KV.delete("xai_key"); return json({ ok: true }); }
    return json({ error: "not found" }, 404);
  }
};
