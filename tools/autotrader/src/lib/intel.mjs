// Intel (Alex 2026-10-30): "extensive instant research on coins, like X and the GMGN tracker but better and instant,
// because this creates certainty and we can stay in longer, not only -2%".
// Per coin, in the background (never awaited by the fast lane): RugCheck full report (holders, dev, insiders, LP lock),
// public RPC signatures (flow, failed-tx contention), DexScreener (socials, boosts, buy/sell flow), FxTwitter (is the X
// account real, how old, how big). Combined into certainty 0..1 with the reasons in words.
// Every source is free and keyless (checked with real GETs 2026-10-30). Any failure or timeout = neutral, never a stall.
// It only READS. It never sends a transaction and never touches a wallet.

const RPCS = ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"];
export const NEUTRAL = 0.5;

async function withTimeout(p, ms) {
  let t; const to = new Promise((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms); });
  try { return await Promise.race([p, to]); } finally { clearTimeout(t); }
}

/** X handle (and tweet id) from a DexScreener social link; null when it is not an x.com / twitter.com link. */
export function xHandle(url) {
  const m = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:\/status\/(\d+))?/i.exec(url || "");
  if (!m || /^(i|home|search|intent|share|hashtag)$/i.test(m[1])) return null;
  return { handle: m[1], status: m[2] || null };
}

/** Pure: the facts -> { certainty, reasons, parts }. Missing facts count as neutral, never as bad. */
export function score({ rc = null, dex = null, flow = null, x = null, smart = 0 } = {}) {
  let s = 0; const reasons = [], bad = [];
  const add = (v, txt) => { s += v; (v >= 0 ? reasons : bad).push(txt); };
  if (rc) {
    const pools = new Set(Object.keys(rc.knownAccounts || {}));
    for (const mk of rc.markets || []) { if (mk.pubkey) pools.add(mk.pubkey); for (const a of [mk.liquidityAAccount, mk.liquidityBAccount]) if (a?.owner) pools.add(a.owner); }
    // pitfall 1: the top holder is usually the pool / bonding curve, not a whale. Drop it before measuring.
    const holders = (rc.topHolders || []).filter((h) => !pools.has(h.owner) && !pools.has(h.address));
    const top10 = holders.slice(0, 10).reduce((a, h) => a + (h.pct || 0), 0);
    const dev = rc.creator ? holders.filter((h) => h.owner === rc.creator).reduce((a, h) => a + (h.pct || 0), 0) : 0;
    if (rc.rugged) add(-1, "RugCheck says rugged");
    if (dev <= 0.5 && !(rc.creatorBalance > 0 && dev > 0)) add(0.08, "dev holds 0%"); else if (dev > 5) add(-0.15, `dev holds ${dev.toFixed(0)}%`);
    if (holders.length) { if (top10 < 30) add(0.12, `top10 ${top10.toFixed(0)}%`); else if (top10 > 50) add(-0.15, `top10 ${top10.toFixed(0)}%`); }
    const ins = rc.graphInsidersDetected || 0, nets = (rc.insiderNetworks || []).length;
    if (ins > 10) add(-0.15, `${ins} insider wallets${nets ? ` in ${nets} network${nets > 1 ? "s" : ""}` : ""}`); else if (ins === 0) add(0.05, "no insider clusters");
    const lp = Math.max(0, ...(rc.markets || []).map((mk) => mk.lp?.lpLockedPct ?? 0));
    if (lp >= 95) add(0.05, `LP ${Math.round(lp)}% locked`);
    if ((rc.totalHolders || 0) >= 500) add(0.06, `${rc.totalHolders} holders`); else if (rc.totalHolders && rc.totalHolders < 100) add(-0.12, `only ${rc.totalHolders} holders`);
    const ct = Array.isArray(rc.creatorTokens) ? rc.creatorTokens : [];
    if (ct.length >= 5) add(-0.1, `dev launched ${ct.length} other coins`);
  }
  if (smart > 0) add(Math.min(0.15, 0.05 * smart), `${smart} smart wallet${smart > 1 ? "s" : ""} in`);
  if (flow) {
    if (flow.n >= 50 && flow.failShare > 0.5) add(-0.1, `${Math.round(flow.failShare * 100)}% failed txs (bot war)`);
    if (flow.last60 >= 100) add(0.06, `${flow.last60} txs in the last minute`); else if (flow.n && flow.last60 <= 2) add(-0.05, "chain quiet");
  }
  if (dex) {
    if (dex.x) add(0.04, "X linked"); if (dex.tg) add(0.02, "Telegram"); if (dex.web) add(0.02, "website");
    if (!dex.x && !dex.tg && !dex.web) add(-0.06, "no socials");
    if (dex.boost > 0) add(0.04, `boosted ${dex.boost}`);
    if (dex.buys5 != null && dex.sells5 != null && dex.buys5 + dex.sells5 >= 20) { const r = dex.buys5 / Math.max(1, dex.sells5); if (r >= 1.3) add(0.05, `5m buys ${dex.buys5}/${dex.sells5}`); else if (r < 0.7) add(-0.06, `5m sellers ${dex.sells5}/${dex.buys5}`); }
  }
  if (x) {
    if (x.dead) add(-0.06, "X account gone");
    else if (x.followers != null) {
      const days = x.joined ? (Date.now() - Date.parse(x.joined)) / 864e5 : null;
      if (x.followers >= 2000) add(0.06, `X ${x.followers} followers`); else if (x.followers < 150 && days != null && days < 30) add(-0.05, `X tiny and new (${x.followers} followers)`); else add(0.02, "X active");
    }
  }
  const certainty = Math.max(0, Math.min(1, NEUTRAL + s));
  return { certainty: +certainty.toFixed(2), reasons: [...reasons, ...bad.map((b) => `-${b}`)] };
}

/** The exits a certainty earns. Size is never touched. High: stop widens to -5%, a 15% trail, a longer hold. */
export function exitsFor(certainty, cfg) {
  if (!(certainty >= 0.7)) return {};
  return { sl: +Math.min(cfg.sl ?? -0.02, -0.05 + 0.03 * (1 - Math.min(1, (certainty - 0.7) / 0.2))).toFixed(4), trail: Math.max(cfg.trail ?? 0.1, 0.15), maxHoldMin: Math.round((cfg.maxHoldMin ?? 8) * 2) };
}

export class Intel {
  constructor({ fetchImpl = globalThis.fetch, now = Date.now, ttl = 30000, timeout = 1500, smartWallets = [], maxBusy = 3 } = {}) {
    Object.assign(this, { fetchImpl, now, ttl, timeout, maxBusy });
    this.smart = new Set(smartWallets); this.cache = new Map(); this.busy = new Set(); this.xCache = new Map(); this.xAt = 0; this.rpcI = 0;
  }
  async #get(url, opts = {}) {
    const r = await withTimeout(this.fetchImpl(url, { headers: { accept: "application/json" }, ...opts, signal: AbortSignal.timeout(this.timeout) }), this.timeout);
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
    return r.json();
  }
  async #rugcheck(mint) { return this.#get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`); }
  async #dex(mint) {
    const a = await this.#get(`https://api.dexscreener.com/tokens/v1/solana/${mint}`);
    const p = (Array.isArray(a) ? a : []).sort((x, y) => (y.liquidity?.usd || 0) - (x.liquidity?.usd || 0))[0]; if (!p) return null;
    const so = p.info?.socials || [], xl = so.find((s) => s.type === "twitter")?.url || null;
    return { x: xl, tg: !!so.find((s) => s.type === "telegram"), web: !!(p.info?.websites || []).length, boost: p.boosts?.active || 0, buys5: p.txns?.m5?.buys ?? null, sells5: p.txns?.m5?.sells ?? null };
  }
  async #flow(mint) {
    const url = RPCS[this.rpcI++ % RPCS.length];
    const j = await this.#get(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint, { limit: 1000 }] }) });
    const sg = j?.result; if (!Array.isArray(sg)) throw new Error("no signatures");
    const t = Math.floor(this.now() / 1000);
    return { n: sg.length, last60: sg.filter((x) => x.blockTime && t - x.blockTime <= 60).length, failShare: sg.length ? sg.filter((x) => x.err).length / sg.length : 0 };
  }
  async #x(link) {
    const h = xHandle(link); if (!h) return null;
    const k = h.handle.toLowerCase(), hit = this.xCache.get(k);
    if (hit && this.now() - hit.at < 600000) return hit.v;
    if (this.now() - this.xAt < 1000) return null;   // about one FxTwitter call a second
    this.xAt = this.now();
    const j = await this.#get(`https://api.fxtwitter.com/${h.handle}`).catch((e) => (e.status === 404 ? { code: 404 } : null));
    if (!j) return null;
    // a 404 is retried later, never trusted alone (FxTwitter returns 404 in bursts): it only counts after two in a row
    const prev = hit?.v; const v = j.user ? { followers: j.user.followers ?? null, joined: j.user.joined || null } : prev?.miss ? { dead: true } : { miss: true };
    this.xCache.set(k, { at: this.now(), v }); return v.miss ? null : v;
  }
  /** Start (or refresh) the research on a coin. Fire and forget: it never throws and nothing waits on it. */
  want(m) {
    const mint = m?.mint; if (!mint) return;
    const c = this.cache.get(mint);
    if (this.busy.has(mint) || (c && this.now() - c.at < this.ttl) || this.busy.size >= this.maxBusy) return;
    this.busy.add(mint);
    const opt = (p) => p.then((v) => v, () => null);
    (async () => {
      const [rc, dex, flow] = await Promise.all([opt(this.#rugcheck(mint)), opt(this.#dex(mint)), opt(this.#flow(mint))]);
      const x = dex?.x ? await opt(this.#x(dex.x)) : null;
      const smart = rc ? (rc.topHolders || []).filter((h) => this.smart.has(h.owner)).length : 0;
      const got = [rc && "rugcheck", dex && "dex", flow && "chain", x && "x"].filter(Boolean);
      const r = got.length ? score({ rc, dex, flow, x, smart }) : { certainty: NEUTRAL, reasons: ["research unreachable"] };
      this.cache.set(mint, { ...r, src: got, full: !!rc, at: this.now() });
      if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value);
    })().catch(() => {}).finally(() => this.busy.delete(mint));
  }
  /** What is known right now, never waiting. Nothing yet -> neutral (medium certainty). */
  peek(m) {
    this.want(m);
    return this.cache.get(m?.mint) || { certainty: NEUTRAL, reasons: ["research pending"], src: [], full: false, pending: true };
  }
}
