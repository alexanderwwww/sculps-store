// Aquarius free public feeds. Every shape below was read from a real response on 2026-11-16 (rule 15).
// Cached in mob_aq_market so a tick never hammers a source; a failed feed returns null (missing data = NO).
import { db } from "../db.mjs";
import { num, slimRug, candlesFromGT } from "./logic.mjs";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const URLS = {
  gtTrending: "https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?page=1",
  gtNew: "https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1",
  gtOhlcv: (pool) => `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/minute?aggregate=1&limit=60`,
  dsBoosts: "https://api.dexscreener.com/token-boosts/latest/v1",
  dsProfiles: "https://api.dexscreener.com/token-profiles/latest/v1",
  dsTokens: (mints) => `https://api.dexscreener.com/tokens/v1/solana/${mints.join(",")}`,
  rug: (mint) => `https://api.rugcheck.xyz/v1/tokens/${mint}/report`,
  jup: (i, o, amt) => `https://lite-api.jup.ag/swap/v1/quote?inputMint=${i}&outputMint=${o}&amount=${amt}&slippageBps=300`,
  cg: "https://api.coingecko.com/api/v3/simple/price?ids=solana,bitcoin&vs_currencies=usd&include_24hr_change=true",
  fng: "https://api.alternative.me/fng/?limit=1",
};

export async function getJson(url, ms = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "aquarius-paper/1" }, signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// Cache wrapper: fresh row -> cached data; else fetch, store, return. Failure -> {ok:false, data:null}.
export async function cached(env, key, ttlSec, fn) {
  const d = db(env);
  const row = await d.one(`SELECT data, ok, extract(epoch from now()-at)::float age FROM mob_aq_market WHERE k=$1`, [key]);
  if (row && row.ok && row.age < ttlSec) return { ok: true, data: row.data, cached: true };
  try {
    const data = await fn();
    await d.q(`INSERT INTO mob_aq_market (k, data, ok, err, at) VALUES ($1,$2,true,null,now()) ON CONFLICT (k) DO UPDATE SET data=EXCLUDED.data, ok=true, err=null, at=now()`, [key, JSON.stringify(data)]);
    return { ok: true, data, cached: false };
  } catch (e) {
    const err = String(e.message || e).slice(0, 200);
    await d.q(`INSERT INTO mob_aq_market (k, data, ok, err, at) VALUES ($1,'null',false,$2,now()) ON CONFLICT (k) DO UPDATE SET ok=false, err=EXCLUDED.err, at=now()`, [key, err]);
    return { ok: false, data: null, err };
  }
}

function pools(j) {
  return (j?.data || []).map((p) => {
    const a = p.attributes || {}, base = p.relationships?.base_token?.data?.id || "", quote = p.relationships?.quote_token?.data?.id || "";
    return {
      pool: a.address, name: a.name, symbol: String(a.name || "").split(" / ")[0].trim(), mint: base.replace(/^solana_/, ""), quoteMint: quote.replace(/^solana_/, ""),
      priceUsd: num(a.base_token_price_usd), solUsd: num(a.quote_token_price_usd), liqUsd: num(a.reserve_in_usd), createdAt: a.pool_created_at || null,
      ch5m: num(a.price_change_percentage?.m5), ch1h: num(a.price_change_percentage?.h1), volM5: num(a.volume_usd?.m5), volH1: num(a.volume_usd?.h1),
    };
  }).filter((p) => p.pool && p.mint && p.quoteMint === SOL_MINT && p.mint !== SOL_MINT);
}

export const feeds = {
  trending: (env) => cached(env, "gt:trending", 55, async () => pools(await getJson(URLS.gtTrending))),
  newPools: (env) => cached(env, "gt:new", 55, async () => pools(await getJson(URLS.gtNew))),
  boosts: (env) => cached(env, "ds:boosts", 55, async () => [...new Set((await getJson(URLS.dsBoosts)).filter((b) => b.chainId === "solana").map((b) => b.tokenAddress))]),
  profiles: (env) => cached(env, "ds:profiles", 55, async () => Object.fromEntries((await getJson(URLS.dsProfiles)).filter((b) => b.chainId === "solana").map((b) => [b.tokenAddress, String(b.description || "").slice(0, 300)]))),
  majors: (env) => cached(env, "cg:majors", 110, async () => {
    const j = await getJson(URLS.cg);
    const m = (x) => (x && num(x.usd) != null ? { price: num(x.usd), ch24: num(x.usd_24h_change) } : null);
    return { sol: m(j.solana), btc: m(j.bitcoin) };
  }),
  fng: (env) => cached(env, "fng", 3600, async () => {
    const x = (await getJson(URLS.fng))?.data?.[0];
    if (!x || num(x.value) == null) throw new Error("no value");
    return { value: num(x.value), label: x.value_classification || null };
  }),
  ohlcv: (env, pool) => cached(env, `gt:ohlcv:${pool}`, 50, async () => {
    const list = (await getJson(URLS.gtOhlcv(pool)))?.data?.attributes?.ohlcv_list;
    if (!Array.isArray(list)) throw new Error("no ohlcv_list");
    return candlesFromGT(list);
  }),
  rug: (env, mint) => cached(env, `rug:${mint}`, 1800, async () => {
    const s = slimRug(await getJson(URLS.rug(mint), 10000));
    if (!s) throw new Error("empty report");
    return s;
  }),
};

// Mid prices (USD) for held tokens, one DexScreener call; picks the pool we entered on, else the deepest.
export async function midPrices(mintPools) {
  const mints = [...new Set(mintPools.map((x) => x.mint))];
  if (!mints.length) return {};
  const list = await getJson(URLS.dsTokens(mints.slice(0, 30)));
  const out = {};
  for (const { mint, pool } of mintPools) {
    const ps = (list || []).filter((p) => p.baseToken?.address === mint);
    const p = ps.find((x) => x.pairAddress === pool) || ps.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    out[mint] = p ? num(p.priceUsd) : null;
  }
  return out;
}

// Jupiter keyless quote. Returns raw outAmount (string integer) and price impact, or null.
export async function jupQuote(inMint, outMint, amountRaw) {
  try {
    const j = await getJson(URLS.jup(inMint, outMint, amountRaw));
    if (!j || !/^\d+$/.test(String(j.outAmount || ""))) return null;
    return { outAmount: String(j.outAmount), impactRaw: num(j.priceImpactPct), route: (j.routePlan || []).map((r) => r.swapInfo?.label).filter(Boolean).join(">") };
  } catch { return null; }
}
