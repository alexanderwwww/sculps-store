// News read: free public RSS feeds (checked live 2026-11-21, all returned fresh items), scored with a small
// word list. Context only: there is no archive of these headlines to test against prices, so the score is
// shown BESIDE the model and never changes the model's probability.
export const FEEDS = {
  crypto: [
    { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss?outputType=xml" },
    { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
    { name: "Decrypt", url: "https://decrypt.co/feed" },
    { name: "The Block", url: "https://www.theblock.co/rss.xml" },
  ],
  gold: [{ name: "Google News", url: "https://news.google.com/rss/search?q=gold+price&hl=en-US&gl=US&ceid=US:en" }],
};

// Lexicon: each word found in a headline adds +1 (bullish) or -1 (bearish). Matched on word starts.
export const BULL = ["surge", "soar", "rall", "jump", "gain", "climb", "rise", "rebound", "bounce", "record high", "all-time high", "breakout", "approv",
  "inflow", "adopt", "bull", "buy", "accumulat", "upgrade", "partnership", "launch", "etf approval", "rate cut", "recover", "outperform", "higher"];
export const BEAR = ["plunge", "crash", "tumble", "drop", "fall", "slump", "sink", "slide", "dump", "sell-off", "selloff", "liquidat", "outflow", "hack",
  "exploit", "lawsuit", "sue", "ban", "fraud", "bear", "fear", "downgrade", "reject", "delay", "probe", "investigat", "lower", "loss", "warn", "rate hike", "collapse"];
// Names people write instead of the ticker. A ticker also matches as a whole word (e.g. "SOL").
const NAMES = { BTC: ["bitcoin"], ETH: ["ether", "ethereum"], SOL: ["solana"], XRP: ["ripple", "xrp"], DOGE: ["dogecoin"], ADA: ["cardano"],
  AVAX: ["avalanche"], LINK: ["chainlink"], LTC: ["litecoin"], DOT: ["polkadot"], SUI: ["sui"], XAU: ["gold"], PAXG: ["gold"], XAUT: ["gold"] };
const MARKET = ["crypto", "bitcoin", "digital asset", "stablecoin", "fed", "inflation"];

const dec = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();
export function parseRss(xml, source) {
  const out = [];
  for (const m of String(xml).matchAll(/<item[\s>][\s\S]*?<\/item>/g)) {
    const it = m[0], tag = (t) => { const r = new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`).exec(it); return r ? dec(r[1]) : ""; };
    const title = tag("title"), t = Date.parse(tag("pubDate") || tag("dc:date"));
    if (title && Number.isFinite(t)) out.push({ title, t, link: tag("link"), source });
  }
  return out;
}

const has = (text, w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text);
export function sentiment(title) {
  let s = 0; for (const w of BULL) if (has(title, w)) s++; for (const w of BEAR) if (has(title, w)) s--;
  return s;
}
export function relevance(title, base) {
  const b = String(base).toUpperCase();
  if (new RegExp(`(^|[^A-Za-z])\\$?${b}([^A-Za-z]|$)`).test(title) && b.length >= 3) return "coin";
  if ((NAMES[b] || []).some((n) => has(title, n))) return "coin";
  if (b !== "XAU" && MARKET.some((n) => has(title, n))) return "market";
  return null;
}

// items from every feed -> the newest relevant headlines with a score, and the overall lean
export function read(items, base, nowMs = Date.now(), maxAgeH = 12) {
  const seen = new Set(), rel = [];
  for (const it of items.sort((a, b) => b.t - a.t)) {
    const k = it.title.toLowerCase().slice(0, 60); if (seen.has(k)) continue; seen.add(k);
    if (nowMs - it.t > maxAgeH * 3600e3 || it.t > nowMs + 600e3) continue;
    const r = relevance(it.title, base); if (!r) continue;
    rel.push({ ...it, rel: r, score: sentiment(it.title) });
  }
  const coin = rel.filter((x) => x.rel === "coin"), pick = (coin.length ? coin : rel).slice(0, 3);
  const lean = pick.reduce((s, x) => s + Math.sign(x.score), 0);
  return { items: pick, lean, label: lean > 0 ? "news leans up" : lean < 0 ? "news leans down" : "news neutral", scope: coin.length ? "coin" : rel.length ? "market" : "none" };
}
