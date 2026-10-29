// Narrative (build 53): trade the META like a human memecoin trader. Coins are grouped into themes (AI agents, a celebrity,
// an animal, a news event, a launchpad, a viral word), each theme gets a rolling heat, and the engine favours coins of a
// rising theme and stays out of a dying one. It never touches the rug check, the caps or the executor: it only answers
// heat(coin) -> { theme, label, heat, trend, late }.
//
// Sources (free, no key, tested from the container on 2026-10-29): DexScreener token-profiles / token-boosts / community
// takeovers (theme text: description + links) and Jupiter toptrending/1h (structured runners). Every fetch is fire-and-forget
// from the slow lane: pump() never awaits, so the 1 s fast lane is never blocked. pump.fun /metas and Reddit are 403 here.
//
// Rules (research 2026-10-29, numbers marked DERIVED in the brief are starting values to tune on the log):
//  rising     : new coins in the last 1h >= 1.5x the prior-3h hourly rate, theme volume >= 1.5x an hour ago, >= 1 runner
//  saturating : count still rising but volume per coin down >= 30%, or no new runner in 60 min -> no full-size entries
//  dying      : theme volume down >= 40% from its 6h peak -> no entries
//  late       : launch 4+ in the theme and not a runner itself (copycat) -> never full size
import { getJsonFast } from "./net.mjs";

export const PHI = 1.618033988749895, INV = 1 / PHI;
const MIN = 60000, H = 60 * MIN;

// seed dictionary: only labels clusters. The emergent words (3+ coins in an hour) and shared links do the real work.
export const SEEDS = {
  "AI-agent": ["ai", "agent", "agents", "agi", "gpt", "llm", "neural", "sentient", "grok", "claude", "openai", "chatgpt", "bot", "aixbt"],
  "robotics": ["robot", "robotics", "depin", "machine", "android", "humanoid", "peaq", "optimus"],
  "politics": ["trump", "maga", "elon", "musk", "biden", "melania", "barron", "vance", "president", "election", "kamala"],
  "dog": ["dog", "doge", "shib", "inu", "puppy", "pup", "wif", "bonk", "shiba", "corgi"],
  "cat": ["cat", "cats", "kitty", "kitten", "meow", "mew", "popcat", "neko", "gato", "purr"],
  "frog": ["pepe", "frog", "toad", "kek", "ribbit"],
  "animal": ["owl", "penguin", "pengu", "monkey", "ape", "hamster", "bear", "duck", "worm", "fish", "goat", "hippo", "moodeng", "capybara", "otter", "rat", "panda"],
  "Hyperliquid": ["hype", "hyper", "hyperliquid", "hypurr", "hl"],
  "GTA VI": ["gta", "gtavi", "vice", "leonida"],
  "halloween": ["halloween", "spooky", "pumpkin", "ghost", "reaper", "witch", "zombie", "skeleton"],
  "launchpad": ["launchpad", "launch", "fees", "yield", "revenue", "buyback", "stake", "staking"],
  "viral trend": ["tiktok", "viral", "brainrot", "skibidi", "rizz", "sigma", "aura", "gyatt", "mog", "chillguy"],
};
const STOP = new Set("every everyone through about there here back day days moon gem based ceo dev team holders hold buy sell price chart the and for with you your this that from are was not but all its our out get has have will just one coin token sol solana pump fun official community first only new now who what when how why can more most real best live time love world people make made than then them they their into over like dont of to in on is it a an by be at as or we my me so up no go do if".split(" "));
const PLATFORM = /^(x\.com|twitter\.com|t\.me|telegram\.me|discord\.gg|discord\.com|youtube\.com|tiktok\.com|instagram\.com|pump\.fun|dexscreener\.com|linktr\.ee|github\.com|medium\.com|i\/communities)$/;

/** name + symbol + description -> lowercase word tokens; CamelCase is split, so "CyberFurballs" -> cyber, furballs. */
export function tokens(...parts) {
  const s = parts.filter(Boolean).join(" ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").toLowerCase();
  return [...new Set(s.split(/[^a-z0-9]+/).filter((w) => w && !/^\d+$/.test(w) && !STOP.has(w)))];
}
/** links -> cluster keys: a shared X handle or a shared site domain (never a platform host). */
export function linkKeys(links = []) {
  const out = new Set();
  for (const l of links) {
    const u = typeof l === "string" ? l : l?.url; if (!u) continue;
    let p; try { p = new URL(u); } catch { continue; }
    const host = p.hostname.replace(/^www\./, "");
    if (/^(x|twitter)\.com$/.test(host)) { const h = p.pathname.split("/").filter(Boolean)[0]; if (h && !/^(i|search|home|intent)$/.test(h)) out.add(`@${h.toLowerCase()}`); }
    else if (!PLATFORM.test(host) && !/(^|\.)(dexscreener|pump|t|discord)\./.test(host)) out.add(host);
  }
  return [...out];
}
const hits = (toks, kw) => toks.some((t) => t === kw || (kw.length >= 4 && t.length > kw.length && t.includes(kw)));

export class Narrative {
  constructor({ fetchJson = getJsonFast, now = Date.now, auto = true } = {}) {
    Object.assign(this, { fetchJson, now, auto });
    this.coins = new Map();          // mint -> { mint, name, symbol, toks, links, first, firstPx, px, vol1h, ch1h, runner, runnerAt, desc }
    this.themes = new Map();         // key -> { key, label, kind, heat, trend, hist: [[t, n1, vol, runners]], peak6h, ... }
    this.member = new Map();         // mint -> [theme keys]
    this.due = { prof: 0, jup: 0, cto: 0, calc: 0 };
    this.busy = new Set(); this.src = {};
  }
  /** Called from the slow lane every pass. Starts due fetches in the background and returns at once. */
  pump(watch = []) {
    const t = this.now();
    for (const m of watch) this.observe(m);
    if (this.auto) {
      this.#bg("prof", 60000, async () => {
        const [p, b] = await Promise.all(["https://api.dexscreener.com/token-profiles/latest/v1", "https://api.dexscreener.com/token-boosts/latest/v1"].map((u) => this.fetchJson(u).catch(() => [])));
        for (const x of [...(p || []), ...(b || [])]) if (x?.chainId === "solana" && x.tokenAddress) this.observe({ mint: x.tokenAddress, desc: x.description, links: (x.links || []).map((l) => l.url), boost: x.totalAmount || x.amount || 0 });
      });
      this.#bg("cto", 120000, async () => {
        for (const x of (await this.fetchJson("https://api.dexscreener.com/community-takeovers/latest/v1")) || []) if (x?.chainId === "solana" && x.tokenAddress) this.observe({ mint: x.tokenAddress, desc: x.description, links: (x.links || []).map((l) => l.url) });
      });
      this.#bg("jup", 60000, async () => {
        for (const x of (await this.fetchJson("https://lite-api.jup.ag/tokens/v2/toptrending/1h?limit=50")) || []) {
          if (!x?.id) continue;
          const s = x.stats1h || {};
          this.observe({ mint: x.id, name: x.name, symbol: x.symbol, priceUsd: x.usdPrice, vol1h: (s.buyVolume || 0) + (s.sellVolume || 0), ch1h: s.priceChange, created: x.createdAt ? Date.parse(x.createdAt) : null });
        }
      });
    }
    if (t >= this.due.calc) { this.due.calc = t + 15000; this.recompute(); }
  }
  #bg(k, every, fn) {
    const t = this.now();
    if (this.busy.has(k) || t < (this.due[k] || 0)) return;
    this.due[k] = t + every; this.busy.add(k);
    Promise.resolve().then(fn).then(() => { this.src[k] = { ok: true, at: this.now() }; }, (e) => { this.src[k] = { ok: false, at: this.now(), err: String(e?.message || e).slice(0, 80) }; }).finally(() => this.busy.delete(k));
  }
  /** Merge one sighting (engine watch entry, profile, boost, Jupiter row). Keyed by mint. */
  observe(m) {
    const mint = m?.mint; if (!mint) return;
    const t = this.now(), name = m.name ? String(m.name).replace(/ \/ \S+$/, "") : null;
    let c = this.coins.get(mint);
    if (!c) { c = { mint, first: t, toks: [], links: [], names: [], vol1h: 0, ch1h: null, runner: false, created: null }; this.coins.set(mint, c); }
    // every name a source gives is kept: the pool feed says "GA1 / SOL", Jupiter says "GPT Agent 1"; the theme is in the second
    for (const x of [name, m.symbol]) if (x && !c.names.includes(x) && c.names.length < 6) c.names.push(x);
    if (name && !c.name) c.name = name; if (m.symbol && !c.symbol) c.symbol = m.symbol;
    if (m.desc && !c.desc) c.desc = String(m.desc).slice(0, 400);
    if (m.links?.length && !c.links.length) c.links = linkKeys(m.links);
    if (m.created && !c.created) c.created = m.created;
    if (m.vol1h != null) c.vol1h = m.vol1h;
    if (m.ch1h != null) c.ch1h = m.ch1h;
    const px = m.priceUsd ?? m.price ?? null;
    if (px > 0) { if (!c.firstPx) c.firstPx = px; c.px = px; }
    c.boost = Math.max(c.boost || 0, m.boost || 0);
    c.toks = tokens(...c.names, c.desc); c.ntoks = tokens(...c.names);   // emergent words come from names only: descriptions are boilerplate (live test: 'every', 'through')
    // a runner: 2x from first sight, or up 50%+ in the hour (the research's h1 rule)
    if (!c.runner && ((c.firstPx && c.px >= 2 * c.firstPx) || (c.ch1h != null && c.ch1h >= 50))) { c.runner = true; c.runnerAt = t; }
    c.seen = t;
  }
  /** Re-cluster and re-score every theme. Pure on the in-memory coins; cheap (hundreds of coins). */
  recompute() {
    const t = this.now();
    for (const [k, c] of this.coins) if (t - c.seen > 6 * H) this.coins.delete(k);
    const coins = [...this.coins.values()], born = (c) => c.created && c.created > t - 24 * H ? Math.max(c.created, c.first - H) : c.first;
    // emergent words: in 3+ coins first seen in the last hour, and 3x the prior-3h hourly rate
    const now1 = new Map(), prior = new Map();
    for (const c of coins) { const age = t - born(c); const into = age <= H ? now1 : age <= 4 * H ? prior : null; if (into) for (const w of c.ntoks || []) if (w.length >= 3) into.set(w, (into.get(w) || 0) + 1); }
    const seedWords = new Set(Object.values(SEEDS).flat());
    const emergent = [...now1].filter(([w, n]) => n >= 3 && n >= 3 * ((prior.get(w) || 0) / 3 || 0.34) && !seedWords.has(w)).map(([w]) => w);
    // links shared by 2+ coins
    const lc = new Map(); for (const c of coins) for (const l of c.links) lc.set(l, (lc.get(l) || 0) + 1);
    const sharedLinks = [...lc].filter(([, n]) => n >= 2).map(([l]) => l);
    this.member = new Map();
    const groups = new Map(), add = (key, label, kind, c) => { let g = groups.get(key); if (!g) groups.set(key, (g = { key, label, kind, coins: [] })); g.coins.push(c); (this.member.get(c.mint) || this.member.set(c.mint, []).get(c.mint)).push(key); };
    for (const c of coins) {
      for (const [label, kws] of Object.entries(SEEDS)) if (kws.some((kw) => hits(c.toks, kw))) add(`seed:${label}`, label, "seed", c);
      for (const w of emergent) if (hits(c.ntoks || [], w)) add(`word:${w}`, w.toUpperCase(), "emergent", c);
      for (const l of sharedLinks) if (c.links.includes(l)) add(`link:${l}`, l, "link", c);
    }
    for (const [key, g] of groups) {
      const n1 = g.coins.filter((c) => t - born(c) <= H).length, nPrior = g.coins.filter((c) => t - born(c) > H && t - born(c) <= 4 * H).length;
      const vol = g.coins.reduce((a, c) => a + (c.vol1h || 0), 0), runners = g.coins.filter((c) => c.runner).length;
      const freshRunner = g.coins.some((c) => c.runner && t - c.runnerAt <= H);
      let th = this.themes.get(key);
      if (!th) { th = { key, hist: [], heat: 0 }; this.themes.set(key, th); }
      Object.assign(th, { label: g.label, kind: g.kind, n: g.coins.length, n1, runners, vol, seen: t });
      th.hist.push([t, n1, vol, runners]); th.hist = th.hist.filter(([ht]) => t - ht <= 6 * H);
      const ago = th.hist.find(([ht]) => t - ht >= 45 * MIN) || null;   // the theme an hour ago (oldest sample 45-60+ min back)
      const countRatio = n1 / Math.max(nPrior / 3, 0.5), volRatio = ago ? vol / Math.max(ago[2], 1) : 1;
      const perCoinNow = vol / Math.max(1, g.coins.length), perCoinAgo = ago ? ago[2] / Math.max(1, ago[1] || 1) : perCoinNow;
      const peak = Math.max(...th.hist.map((h) => h[2]));
      // raw heat = new-coin ratio x volume growth x (1 + runners), log-compressed; the rolling heat decays by the golden ratio
      const raw = Math.log1p(countRatio) * Math.log1p(Math.max(volRatio, 0)) * (1 + runners) + Math.log10(1 + vol / 1e5);
      th.heat = INV * th.heat + (1 - INV) * raw;
      let trend = "steady";
      if (peak > 20000 && vol <= 0.6 * peak) trend = "dying";
      else if (countRatio >= 1.5 && volRatio >= 1.5 && runners >= 1) trend = "rising";
      else if (n1 > 0 && ago && n1 >= ago[1] && (perCoinNow <= 0.7 * perCoinAgo || (runners && !freshRunner))) trend = "saturating";
      Object.assign(th, { trend, countRatio: +countRatio.toFixed(2), volRatio: +volRatio.toFixed(2), coins: g.coins.slice().sort((a, b) => born(a) - born(b)).map((c) => c.mint) });
    }
    for (const [k, th] of this.themes) if (!groups.has(k)) { th.heat *= INV; if (t - th.seen > 6 * H || th.heat < 0.01) this.themes.delete(k); else { th.trend = "dying"; th.n1 = 0; } }
  }
  /** The theme that matters for a coin: its hottest theme. late = launch 4+ in that theme and not a runner itself. */
  heat(m) {
    const keys = this.member.get(m?.mint); if (!keys?.length) return null;
    const ths = keys.map((k) => this.themes.get(k)).filter(Boolean); if (!ths.length) return null;
    // a dying theme wins the tie-break only if nothing else of the coin is rising (a coin can belong to two)
    const best = ths.slice().sort((a, b) => (b.trend === "rising") - (a.trend === "rising") || b.heat - a.heat)[0];
    const idx = best.coins.indexOf(m.mint), c = this.coins.get(m.mint);
    return { theme: best.key, label: best.label, heat: +best.heat.toFixed(3), trend: best.trend, runners: best.runners, late: idx >= 3 && !c?.runner, n: best.n };
  }
  top(n = 3) {
    return [...this.themes.values()].filter((th) => th.n >= 2).sort((a, b) => b.heat - a.heat).slice(0, n)
      .map((th) => ({ label: th.label, kind: th.kind, heat: +th.heat.toFixed(3), trend: th.trend, coins: th.n, new1h: th.n1, runners: th.runners, vol1h: Math.round(th.vol) }));
  }
  summary() { return { top: this.top(3), themes: this.themes.size, coins: this.coins.size, sources: this.src }; }
}
/** The words Alex reads on the trade and in /status. */
export function why(h) {
  if (!h) return "";
  const lbl = h.label;
  if (h.trend === "rising") return h.late ? `late copycat in the rising ${lbl} narrative: 0.618 size` : `riding the ${lbl} narrative (rising, ${h.runners} runner${h.runners === 1 ? "" : "s"})`;
  if (h.trend === "saturating") return `${lbl} narrative is saturating: 0.618 size`;
  if (h.trend === "dying") return `${lbl} narrative is dying`;
  return `${lbl} narrative`;
}
