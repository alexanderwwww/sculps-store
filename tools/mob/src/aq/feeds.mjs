// Aquarius free public feeds. Every shape below was read from a real response on 2026-11-16 (rule 15).
// Cached in mob_aq_market so a tick never hammers a source; a failed feed returns null (missing data = NO).
import { db } from "../db.mjs";
import { num, slimRug, candlesFromGT } from "./logic.mjs";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const URLS = {
  gtTrending: "/networks/solana/trending_pools?page=1",
  gtNew: "/networks/solana/new_pools?page=1",
  gtOhlcv: (pool) => `/networks/solana/pools/${pool}/ohlcv/minute?aggregate=1&limit=60`,
  gtTrades: (pool) => `/networks/solana/pools/${pool}/trades`,
  dsBoosts: "https://api.dexscreener.com/token-boosts/latest/v1",
  dsBoostsTop: "https://api.dexscreener.com/token-boosts/top/v1",
  dsCto: "https://api.dexscreener.com/community-takeovers/latest/v1",
  dsSolPairs: `https://api.dexscreener.com/token-pairs/v1/solana/${SOL_MINT}`,
  dsProfiles: "https://api.dexscreener.com/token-profiles/latest/v1",
  dsTokens: (mints) => `https://api.dexscreener.com/tokens/v1/solana/${mints.join(",")}`,
  rug: (mint) => `https://api.rugcheck.xyz/v1/tokens/${mint}/report`,
  jup: (i, o, amt) => `https://lite-api.jup.ag/swap/v1/quote?inputMint=${i}&outputMint=${o}&amount=${amt}&slippageBps=300`,
  cg: "https://api.coingecko.com/api/v3/simple/price?ids=solana,bitcoin&vs_currencies=usd&include_24hr_change=true",
  fng: "https://api.alternative.me/fng/?limit=1",
};

// GeckoTerminal's free API answers 429 to bursts (seen live 2026-11-16 with 8 calls in ~1 s): space its calls 2.1 s apart.
export const GT_GAP = { ms: 2100 };
let lastGt = 0;
// GeckoTerminal data has two doors with the same JSON (both read 2026-11-16): api.geckoterminal.com/api/v2 and
// api.coingecko.com/api/v3/onchain (keyless works; with COINGECKO_DEMO_KEY the documented header x-cg-demo-api-key is sent).
// Production (Cloudflare egress) got HTTP 429 on the first door, so the second is tried when the first fails.
export const GT_BASES = ["https://api.geckoterminal.com/api/v2", "https://api.coingecko.com/api/v3/onchain"];
export async function gt(env, path) {
  // The CoinGecko door is used only with a demo key: keyless it shares (and in production used up) the quota of the SOL/BTC price call.
  const key = env.COINGECKO_DEMO_KEY, order = key ? [GT_BASES[1], GT_BASES[0]] : [GT_BASES[0]];
  let first = null;
  for (const b of order) {
    try { return await getJson(b + path, 8000, key && b === GT_BASES[1] ? { "x-cg-demo-api-key": key } : {}); }
    catch (e) { first = first ? `${first}; ${new URL(b).hostname}: ${e.message}` : `${new URL(b).hostname}: ${e.message}`; }
  }
  throw new Error(first);
}
export async function getJson(url, ms = 8000, extra = {}) {
  if (url.startsWith("https://api.geckoterminal.com/") || url.includes("/api/v3/onchain/")) {
    const wait = lastGt + GT_GAP.ms - Date.now();
    lastGt = Math.max(Date.now(), lastGt + GT_GAP.ms);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "aquarius-paper/1", ...extra }, signal: ac.signal });
    if (!r.ok) { let body = ""; try { body = (await r.text()).replace(/\s+/g, " ").slice(0, 80); } catch {} throw new Error(`HTTP ${r.status}${body ? ` ${body}` : ""}`); }
    return await r.json();
  } finally { clearTimeout(t); }
}

// Cache wrapper: fresh row -> cached data; else fetch, store, return. Failure -> {ok:false, data:null}.
export async function cached(env, key, ttlSec, fn, backoffSec = 0) {
  const d = db(env);
  const row = await d.one(`SELECT data, ok, err, extract(epoch from now()-at)::float age FROM mob_aq_market WHERE k=$1`, [key]);
  if (row && row.ok && row.age < ttlSec) return { ok: true, data: row.data, cached: true };
  // a refused feed is not hammered: wait out the backoff before asking again
  if (row && !row.ok && row.age < backoffSec) return { ok: false, data: null, err: row.err, backoff: true };
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

export const GT_BACKOFF = { sec: 300 };
// DexScreener pair (tokens/v1 shape, read 2026-11-16) -> the same candidate shape as a GeckoTerminal pool.
export function dsPool(p) {
  return { pool: p.pairAddress, name: `${p.baseToken?.symbol} / SOL`, symbol: String(p.baseToken?.symbol || "").trim(), mint: p.baseToken?.address, quoteMint: p.quoteToken?.address,
    priceUsd: num(p.priceUsd), solUsd: null, liqUsd: num(p.liquidity?.usd), createdAt: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : null,
    ch5m: num(p.priceChange?.m5), ch1h: num(p.priceChange?.h1), volM5: num(p.volume?.m5), volH1: num(p.volume?.h1) };
}
// Deepest SOL-quoted pair per mint.
export function bestPairs(list) {
  const best = {};
  for (const p of list || []) {
    if (p.chainId !== "solana" || p.quoteToken?.address !== SOL_MINT || !p.baseToken?.address || p.baseToken.address === SOL_MINT || num(p.priceUsd) == null) continue;
    const m = p.baseToken.address;
    if (!best[m] || (p.liquidity?.usd || 0) > (best[m].liquidity?.usd || 0)) best[m] = p;
  }
  return Object.values(best).map(dsPool);
}
export async function dsTokens(mints) {
  const out = [];
  for (let i = 0; i < mints.length; i += 30) out.push(...(await getJson(URLS.dsTokens(mints.slice(i, i + 30))) || []));
  return bestPairs(out);
}
// Candidates without GeckoTerminal: boosted (latest + top), fresh profiles and community takeovers name the mints;
// tokens/v1 returns their pairs with price, liquidity and volume. At least one list must answer.
async function dsUniverse() {
  const lists = await Promise.all([URLS.dsBoosts, URLS.dsBoostsTop, URLS.dsProfiles, URLS.dsCto].map((u) => getJson(u).catch(() => null)));
  if (lists.every((l) => !Array.isArray(l))) throw new Error("no DexScreener list answered");
  const mints = [...new Set(lists.flatMap((l) => (Array.isArray(l) ? l : [])).filter((x) => x.chainId === "solana" && x.tokenAddress).map((x) => x.tokenAddress))].slice(0, 90);
  return (await dsTokens(mints)).sort((a, b) => (b.liqUsd || 0) - (a.liqUsd || 0));
}

export const feeds = {
  trending: (env) => cached(env, "gt:trending", 55, async () => pools(await gt(env, URLS.gtTrending)), GT_BACKOFF.sec),
  newPools: (env) => cached(env, "gt:new", 55, async () => pools(await gt(env, URLS.gtNew)), GT_BACKOFF.sec),
  universe: (env) => cached(env, "ds:universe", 55, () => dsUniverse()),
  boosts: (env) => cached(env, "ds:boosts", 55, async () => [...new Set((await getJson(URLS.dsBoosts)).filter((b) => b.chainId === "solana").map((b) => b.tokenAddress))]),
  profiles: (env) => cached(env, "ds:profiles", 55, async () => Object.fromEntries((await getJson(URLS.dsProfiles)).filter((b) => b.chainId === "solana").map((b) => [b.tokenAddress, String(b.description || "").slice(0, 300)]))),
  majors: (env) => cached(env, "cg:majors", 110, async () => {
    const m = (x) => (x && num(x.usd) != null ? { price: num(x.usd), ch24: num(x.usd_24h_change) } : null);
    try { const j = await getJson(URLS.cg); return { sol: m(j.solana), btc: m(j.bitcoin), src: "coingecko" }; }
    catch (e) {
      // CoinGecko refused (429 seen from Cloudflare): SOL from the deepest SOL/USDC pair on DexScreener; BTC stays unknown.
      const ps = (await getJson(URLS.dsSolPairs) || []).filter((p) => p.baseToken?.address === SOL_MINT && p.quoteToken?.symbol === "USDC" && num(p.priceUsd) != null).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      if (!ps.length) throw new Error(`coingecko: ${e.message}; dexscreener: no SOL/USDC pair`);
      return { sol: { price: num(ps[0].priceUsd), ch24: num(ps[0].priceChange?.h24) }, btc: null, src: "dexscreener", note: `coingecko: ${String(e.message).slice(0, 60)}` };
    }
  }),
  fng: (env) => cached(env, "fng", 3600, async () => {
    const x = (await getJson(URLS.fng))?.data?.[0];
    if (!x || num(x.value) == null) throw new Error("no value");
    return { value: num(x.value), label: x.value_classification || null };
  }),
  ohlcv: (env, pool) => cached(env, `gt:ohlcv:${pool}`, 50, async () => {
    const list = (await gt(env, URLS.gtOhlcv(pool)))?.data?.attributes?.ohlcv_list;
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
