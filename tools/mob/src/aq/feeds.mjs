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
  // datapi.jup.ag is what jup.ag's own pages read (shapes read 2026-11-16; proven to answer from the deployed Worker by /diag)
  jupTop: (kind) => `https://datapi.jup.ag/v1/pools/${kind}/1h?limit=50`,
  jupChart: (mint, nowMs) => `https://datapi.jup.ag/v2/charts/${mint}?interval=1_MINUTE&to=${nowMs}&candles=120&type=price&quote=usd`,
  jupTxs: (mint, cur) => `https://datapi.jup.ag/v1/txs/${mint}?limit=30${cur ? `&offset=${cur.offset}&offsetTs=${encodeURIComponent(cur.ts)}` : ""}`,
  jupPrice: (mints) => `https://lite-api.jup.ag/price/v3?ids=${mints.join(",")}`,
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
// Calls made in the running tick, by provider (shown in state.health.budget).
export const CALLS = { helius: 0, jupiterData: 0, geckoterminal: 0, dexscreener: 0 };
export const CAPS = { helius: 12, jupiterData: 20 };
export const resetCalls = () => { for (const k of Object.keys(CALLS)) CALLS[k] = 0; };
export async function getJson(url, ms = 8000, extra = {}) {
  if (url.startsWith("https://datapi.jup.ag/")) CALLS.jupiterData++;
  else if (url.startsWith("https://api.dexscreener.com/")) CALLS.dexscreener++;
  else if (url.includes("geckoterminal.com/") || url.includes("/api/v3/onchain/")) CALLS.geckoterminal++;
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
  if (row && !row.ok && row.age < backoffSec) return { ok: false, data: null, stale: row.data, err: row.err, backoff: true };
  try {
    const data = await fn();
    await d.q(`INSERT INTO mob_aq_market (k, data, ok, err, at) VALUES ($1,$2,true,null,now()) ON CONFLICT (k) DO UPDATE SET data=EXCLUDED.data, ok=true, err=null, at=now()`, [key, JSON.stringify(data)]);
    return { ok: true, data, cached: false };
  } catch (e) {
    const err = String(e.message || e).slice(0, 200);
    await d.q(`INSERT INTO mob_aq_market (k, data, ok, err, at) VALUES ($1,'null',false,$2,now()) ON CONFLICT (k) DO UPDATE SET ok=false, err=EXCLUDED.err, at=now()`, [key, err]);
    return { ok: false, data: null, stale: row?.data ?? null, err };
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

// Jupiter pool (datapi shape) -> candidate. Stocks/RWA wrappers are not memecoins and are left out.
export function jupPool(p) {
  const b = p.baseAsset || {}, h = b.stats1h || {}, m5 = b.stats5m || {};
  if (!b.id || b.id === SOL_MINT || b.stockData || (b.tags || []).some((t) => t === "stocks" || t === "rwa" || t === "lst")) return null;
  return { pool: p.id, name: `${b.symbol} / ${p.quoteAsset === SOL_MINT ? "SOL" : "?"}`, symbol: String(b.symbol || "").trim(), mint: b.id, quoteMint: p.quoteAsset, priceUsd: num(b.usdPrice), solUsd: null,
    liqUsd: num(b.liquidity), createdAt: b.firstPool?.createdAt || b.createdAt || null, ch5m: num(m5.priceChange), ch1h: num(h.priceChange), ch24: num(b.stats24h?.priceChange),
    volM5: m5.buyVolume != null ? (num(m5.buyVolume) || 0) + (num(m5.sellVolume) || 0) : null, volH1: h.buyVolume != null ? (num(h.buyVolume) || 0) + (num(h.sellVolume) || 0) : null,
    traders1h: num(h.numTraders), dev: b.dev || null, organic: num(b.organicScore) };
}
// One page of a coin's swaps from Jupiter: who bought or sold, how much SOL, when. MEV trades are dropped.
export async function jupTxs(mint, cur = null) {
  const j = await getJson(URLS.jupTxs(mint, cur));
  const raw = j?.txs || [];
  const txs = raw.filter((t) => !t.isMev && (t.type === "buy" || t.type === "sell") && t.traderAddress && t.txHash && num(t.nativeVolume) != null)
    .map((t) => ({ tx: t.txHash, wallet: t.traderAddress, kind: t.type, sol: num(t.nativeVolume), at: t.timestamp, price: num(t.usdPrice) }));
  const last = raw[raw.length - 1];
  return { txs, n: raw.length, next: j?.next && last ? { offset: String(j.next), ts: last.timestamp } : null, oldest: last?.timestamp || null };
}
export const GT_BACKOFF = { sec: 300 };
export const DS_BACKOFF = { sec: 240 };
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
  const errs = [];
  const [bl, bt, pf, cto] = await Promise.all([URLS.dsBoosts, URLS.dsBoostsTop, URLS.dsProfiles, URLS.dsCto].map((u) => getJson(u).catch((e) => { errs.push(e.message); return null; })));
  if ([bl, bt, pf, cto].every((l) => !Array.isArray(l))) throw new Error(`no DexScreener list answered: ${errs[0]}`);
  const sol = (l) => (Array.isArray(l) ? l : []).filter((x) => x.chainId === "solana" && x.tokenAddress);
  const mints = [...new Set([bl, bt, pf, cto].flatMap(sol).map((x) => x.tokenAddress))].slice(0, 90);
  const pairs = (await dsTokens(mints)).sort((a, b) => (b.liqUsd || 0) - (a.liqUsd || 0));
  return { pairs, boosted: [...new Set([...sol(bl), ...sol(bt)].map((x) => x.tokenAddress))],
    profiles: Object.fromEntries([...sol(bl), ...sol(bt), ...sol(pf), ...sol(cto)].filter((x) => x.description).map((x) => [x.tokenAddress, String(x.description).slice(0, 300)])) };
}

export const feeds = {
  trending: (env) => cached(env, "gt:trending", 55, async () => pools(await gt(env, URLS.gtTrending)), GT_BACKOFF.sec),
  newPools: (env) => cached(env, "gt:new", 55, async () => pools(await gt(env, URLS.gtNew)), GT_BACKOFF.sec),
  // discovery only, every 3 minutes: DexScreener rate-limits Cloudflare egress (HTTP 429, error code 1015), so it is asked rarely
  // discovery that answers from the Worker: Jupiter's own trending and most-traded lists, with liquidity and volume
  jupTop: (env) => cached(env, "jup:top", 55, async () => {
    const lists = await Promise.all(["toptrending", "toptraded", "toporganicscore"].map((k) => getJson(URLS.jupTop(k)).catch((e) => ({ error: e.message }))));
    if (lists.every((l) => !Array.isArray(l?.pools))) throw new Error(`jupiter lists: ${lists[0]?.error || "no pools"}`);
    const seen = new Set(), out = [];
    for (const l of lists) for (const p of l.pools || []) { const c = jupPool(p); if (c && !seen.has(c.mint)) { seen.add(c.mint); out.push(c); } }
    return out;
  }, 120),
  // the last two hours of 1-minute candles in one call: a new coin has history on first sight
  jupCandles: (env, mint) => cached(env, `jup:chart:${mint}`, 50, async () => {
    const cs = (await getJson(URLS.jupChart(mint, Date.now())))?.candles;
    if (!Array.isArray(cs) || !cs.length) throw new Error("no candles");
    return cs.map((c) => ({ t: Number(c.time), o: num(c.open), h: num(c.high), l: num(c.low), c: num(c.close), v: num(c.volume) || 0 })).filter((c) => [c.t, c.o, c.h, c.l, c.c].every(Number.isFinite)).sort((a, b) => a.t - b.t);
  }),
  universe: (env) => cached(env, "ds:universe", 170, () => dsUniverse(), DS_BACKOFF.sec),
  majors: (env) => cached(env, "cg:majors", 55, async () => {
    const m = (x) => (x && num(x.usd) != null ? { price: num(x.usd), ch24: num(x.usd_24h_change) } : null);
    try { const j = await getJson(URLS.cg); return { sol: m(j.solana), btc: m(j.bitcoin), src: "coingecko" }; }
    catch (e) {
      // CoinGecko refused (429 seen from Cloudflare): SOL from Jupiter's price API; BTC stays unknown.
      const j = (await jupPrices([SOL_MINT]))[SOL_MINT];
      if (!j) throw new Error(`coingecko: ${e.message}; jupiter: no SOL price`);
      return { sol: { price: j.price, ch24: j.ch24 }, btc: null, src: "jupiter", note: `coingecko: ${String(e.message).slice(0, 60)}` };
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
// Jupiter price v3 (shape read 2026-11-16: {mint: {usdPrice, liquidity, priceChange24h, decimals}}). One call, up to 50 mints.
export async function jupPrices(mints) {
  const ids = [...new Set(mints)].slice(0, 50);
  if (!ids.length) return {};
  const j = await getJson(URLS.jupPrice(ids));
  const out = {};
  for (const m of ids) if (j?.[m] && num(j[m].usdPrice) != null) out[m] = { price: num(j[m].usdPrice), liqUsd: num(j[m].liquidity), ch24: num(j[m].priceChange24h) };
  return out;
}
// Mid prices (USD) for held tokens: Jupiter first (DexScreener refused Cloudflare egress with 429/1015 in production), DexScreener second.
export async function midPrices(mintPools) {
  const mints = [...new Set(mintPools.map((x) => x.mint))];
  if (!mints.length) return {};
  try { const j = await jupPrices(mints); if (Object.keys(j).length) return Object.fromEntries(mints.map((m) => [m, j[m]?.price ?? null])); } catch {}
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
