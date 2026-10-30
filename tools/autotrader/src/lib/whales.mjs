// Whales (Alex 2026-10-30): "follow whales and legit trades automatically, more advanced than a human".
// 1. discover: the wallets that bought today's top runners low and sold them high (GeckoTerminal trades, free).
// 2. watch: each wallet's newest signatures on the public Solana RPC, its swaps read from getTransaction (free, rate-limited here).
// 3. follow: 2+ independent smart wallets buying the same coin inside 60 s = a follow signal (the engine still runs the full rug check).
// 4. exit: a followed wallet selling the coin we copied = sell first.
// 5. score: every copied trade's result and the wallet's own realized results; winners are watched more, losers dropped.
// Bait guards: the coin's creator, RugCheck's insider network and wallets funded from the same source never count twice / at all.
// It only READS. It never sends a transaction and never touches a wallet. Every failure is swallowed: trading never waits on it.

const RPCS = ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"];
const SOL = "So11111111111111111111111111111111111111112";
const STABLE = new Set([SOL, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"]);

async function withTimeout(p, ms) {
  let t; const to = new Promise((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms); });
  try { return await Promise.race([p, to]); } finally { clearTimeout(t); }
}

/** Pure: a runner's recent trades -> the wallets that bought low and sold high in it. trades: [{kind, usd, px, from, t}] */
export function smartFromTrades(trades, { minSoldUsd = 150, minGain = 0.2, maxTrades = 40 } = {}) {
  const by = new Map();
  for (const x of trades || []) {
    if (!x?.from || !(x.usd > 0) || !(x.px > 0)) continue;
    const w = by.get(x.from) || { n: 0, bUsd: 0, bTok: 0, sUsd: 0, sTok: 0 }; w.n++;
    if (x.kind === "buy") { w.bUsd += x.usd; w.bTok += x.usd / x.px; } else if (x.kind === "sell") { w.sUsd += x.usd; w.sTok += x.usd / x.px; }
    by.set(x.from, w);
  }
  const out = [];
  for (const [addr, w] of by) {
    if (w.n > maxTrades || !w.bTok || !w.sTok || w.sUsd < minSoldUsd) continue;   // bots trade hundreds of times; a wallet that only bought proved nothing
    const avgB = w.bUsd / w.bTok, avgS = w.sUsd / w.sTok, gain = avgS / avgB - 1;
    if (gain < minGain) continue;
    out.push({ addr, gain: +gain.toFixed(3), realized: +(Math.min(w.sTok, w.bTok) * (avgS - avgB)).toFixed(2) });
  }
  return out.sort((a, b) => b.realized - a.realized);
}

/** Pure: one parsed transaction -> the swaps `owner` made in it: [{mint, side:'buy'|'sell'}] */
export function swapsOf(tx, owner) {
  const m = tx?.meta; if (!m || m.err) return [];
  const delta = new Map();
  for (const b of m.preTokenBalances || []) if (b.owner === owner) delta.set(b.mint, (delta.get(b.mint) || 0) - Number(b.uiTokenAmount?.amount || 0));
  for (const b of m.postTokenBalances || []) if (b.owner === owner) delta.set(b.mint, (delta.get(b.mint) || 0) + Number(b.uiTokenAmount?.amount || 0));
  const keys = (tx.transaction?.message?.accountKeys || []).map((k) => (typeof k === "string" ? k : k.pubkey));
  const i = keys.indexOf(owner), lam = i >= 0 ? (m.postBalances?.[i] ?? 0) - (m.preBalances?.[i] ?? 0) : 0;
  const quote = lam + (delta.get(SOL) || 0);   // SOL spent (negative) or received (positive), native or wrapped
  const out = [];
  for (const [mint, d] of delta) {
    if (STABLE.has(mint) || d === 0) continue;
    if (d > 0 && quote < 0) out.push({ mint, side: "buy" }); else if (d < 0 && quote > 0) out.push({ mint, side: "sell" });
  }
  return out;
}

export class Whales {
  constructor({ fetchImpl = globalThis.fetch, now = Date.now, feed = null, timeout = 2500, saved = null, seed = [], maxWallets = 24, windowMs = 60000, minWallets = 2, pollGapMs = 1500, onSave = null } = {}) {
    Object.assign(this, { fetchImpl, now, feed, timeout, maxWallets, windowMs, minWallets, pollGapMs, onSave });
    this.w = new Map(); this.set = new Set(); this.events = []; this.vet = new Map(); this.vetBusy = new Set(); this.rpcI = 0; this.busy = false; this.lastPump = 0; this.lastDisc = 0; this.discI = 0;
    this.lags = []; this.errors = 0; this.polls = 0; this.seen = 0; this.dropped = [];
    for (const x of saved?.wallets || []) this.#add(x.addr, x);
    for (const a of seed || []) this.#add(a, { src: "config" });
  }
  #add(addr, o = {}) {
    if (!addr || this.w.has(addr) || this.dropped.includes(addr)) return;
    this.w.set(addr, { addr, src: o.src || "runner", own: o.own || 0, copies: o.copies || 0, sumRet: o.sumRet || 0, wins: o.wins || 0, funder: o.funder ?? null, lastSig: null, nextAt: 0, at: o.at || this.now() });
    this.set.add(addr);
  }
  /** weight: >1 for wallets that made Ultra money, <1 for losers; untested wallets 1 */
  weight(x) { if (!x) return 0; const avg = x.copies ? x.sumRet / x.copies : 0; return Math.max(0.2, Math.min(3, 1 + avg * 20 + (x.own > 0 ? 0.2 : 0))); }
  async #get(url, opts = {}) {
    const r = await withTimeout(this.fetchImpl(url, { headers: { accept: "application/json" }, ...opts, signal: AbortSignal.timeout(this.timeout) }), this.timeout);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
  async #rpc(method, params) {
    const j = await this.#get(RPCS[this.rpcI++ % RPCS.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    if (j?.error) throw new Error(j.error.message || "rpc error");
    return j?.result;
  }
  /** One background step. Fire and forget from the engine: never throws, never runs twice at once, never waits on the trade loop. */
  pump(runners = []) {
    if (this.busy || this.now() - this.lastPump < this.pollGapMs) return null;
    this.busy = true; this.lastPump = this.now();
    return (async () => {
      if (this.feed?.trades && (this.w.size < 8 ? this.now() - this.lastDisc > 60000 : this.now() - this.lastDisc > 600000) && runners.length) { this.lastDisc = this.now(); await this.discover(runners).catch(() => { this.errors++; }); }
      await this.poll().catch(() => { this.errors++; });
    })().finally(() => { this.busy = false; });
  }
  /** Step 1: early buyers of today's top runners who also sold well. One runner per call (the GeckoTerminal queue is shared). */
  async discover(runners) {
    const r = runners[this.discI++ % runners.length]; if (!r?.pool) return;
    const found = smartFromTrades(await this.feed.trades(r.pool, 50));
    // the runner's own dev and insiders "sold well" by dumping on buyers: never smart money
    const rc = r.mint ? await this.#get(`https://api.rugcheck.xyz/v1/tokens/${r.mint}/report`).catch(() => null) : null;
    if (!rc) return;
    const bad = new Set([rc.creator, ...(rc.topHolders || []).filter((h) => h.insider).map((h) => h.owner)].filter(Boolean));
    for (const f of found.filter((f) => !bad.has(f.addr)).slice(0, 6)) { if (!this.w.has(f.addr)) this.#add(f.addr, { src: r.name || "runner", own: f.realized }); else this.w.get(f.addr).own = Math.max(this.w.get(f.addr).own, f.realized); }
    this.#trim(); this.#save();
  }
  #trim() {
    if (this.w.size <= this.maxWallets) return;
    const worst = [...this.w.values()].sort((a, b) => this.weight(a) - this.weight(b) || a.own - b.own).slice(0, this.w.size - this.maxWallets);
    for (const x of worst) this.#drop(x.addr, false);
  }
  #drop(addr, forever = true) { this.w.delete(addr); this.set.delete(addr); if (forever) { this.dropped.push(addr); if (this.dropped.length > 200) this.dropped.shift(); } }
  /** Step 2: the next wallets due (winners come round more often), their new signatures, their swaps. */
  async poll() {
    const due = [...this.w.values()].filter((x) => x.nextAt <= this.now()).sort((a, b) => this.weight(b) - this.weight(a)).slice(0, 2);
    for (const x of due) {
      x.nextAt = this.now() + Math.round(6000 / this.weight(x));
      this.polls++;
      const sigs = await this.#rpc("getSignaturesForAddress", [x.addr, { limit: 10, ...(x.lastSig ? { until: x.lastSig } : {}) }]).catch(() => { this.errors++; return null; });
      if (!Array.isArray(sigs)) continue;
      const first = x.lastSig == null; if (sigs.length) x.lastSig = sigs[0].signature; else { if (first) x.lastSig = ""; continue; }
      if (x.funder == null) { x.funder = false; this.#funder(x).catch(() => { x.funder = null; }); }
      if (first) continue;   // first look only sets the bookmark: old trades are not signals
      for (const s of sigs.filter((s) => !s.err).slice(0, 3)) {
        const tx = await this.#rpc("getTransaction", [s.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]).catch(() => { this.errors++; return null; });
        const t = (s.blockTime || tx?.blockTime || Math.floor(this.now() / 1000)) * 1000;
        for (const sw of swapsOf(tx, x.addr)) this.note({ wallet: x.addr, mint: sw.mint, side: sw.side, t, sig: s.signature });
      }
    }
  }
  /** Who first sent this wallet SOL (the oldest signature we can see): wallets with the same funder count as one. */
  async #funder(x) {
    const sigs = await this.#rpc("getSignaturesForAddress", [x.addr, { limit: 1000 }]); const old = Array.isArray(sigs) ? sigs[sigs.length - 1] : null;
    if (!old) { x.funder = ""; return; }
    const tx = await this.#rpc("getTransaction", [old.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
    const ins = tx?.transaction?.message?.instructions || [];
    const tr = ins.find((i) => i.parsed?.type === "transfer" && i.parsed?.info?.destination === x.addr && i.program === "system");
    x.funder = tr?.parsed?.info?.source || "";
  }
  /** A swap seen by any means (the poller, or a test). Starts the bait check on the coin straight away. */
  note(e) {
    if (!this.w.has(e.wallet)) return;
    if (this.events.some((x) => x.sig && x.sig === e.sig && x.mint === e.mint)) return;
    this.events.push({ ...e, seenAt: this.now() }); this.seen++;
    this.lags.push(Math.max(0, this.now() - e.t)); if (this.lags.length > 50) this.lags.shift();
    while (this.events.length && this.now() - this.events[0].seenAt > 30 * 60000) this.events.shift();
    if (e.side === "buy") this.#vet(e.mint);
  }
  /** The coin's creator, RugCheck's insider wallets and its SOL pool: fetched once per coin, in the background. */
  #vet(mint) {
    const v = this.vet.get(mint); if ((v && this.now() - v.at < 600000) || this.vetBusy.has(mint)) return;
    this.vetBusy.add(mint);
    (async () => {
      const [rc, graph, pairs] = await Promise.all([
        this.#get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`).catch(() => null),
        this.#get(`https://api.rugcheck.xyz/v1/tokens/${mint}/insiders/graph`).catch(() => null),
        this.#get(`https://api.dexscreener.com/tokens/v1/solana/${mint}`).catch(() => null)]);
      if (!rc) return;   // no report = cannot rule out bait = no follow (the engine's rug check would refuse it anyway)
      const bad = new Set([rc.creator, ...(rc.topHolders || []).filter((h) => h.insider).map((h) => h.owner)].filter(Boolean));
      for (const n of Array.isArray(graph) ? graph : []) for (const node of n.nodes || []) if (node.id) bad.add(node.id);
      const p = (Array.isArray(pairs) ? pairs : []).filter((x) => x.quoteToken?.address === SOL && x.pairAddress).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      this.vet.set(mint, { at: this.now(), bad, pool: p?.pairAddress || null, name: p ? `${p.baseToken?.symbol || "?"} / SOL` : null, liqUsd: p?.liquidity?.usd ?? null });
      if (this.vet.size > 300) this.vet.delete(this.vet.keys().next().value);
    })().catch(() => { this.errors++; }).finally(() => this.vetBusy.delete(mint));
  }
  /** Step 3: coins 2+ independent smart wallets bought inside the window, strongest first. */
  signals() {
    const t = this.now(), by = new Map();
    for (const e of this.events) if (e.side === "buy" && t - e.t <= this.windowMs * 2) { const a = by.get(e.mint) || []; a.push(e); by.set(e.mint, a); }
    const out = [];
    for (const [mint, evs] of by) {
      const v = this.vet.get(mint); if (!v || !v.pool) continue;
      const sold = new Set(this.events.filter((e) => e.mint === mint && e.side === "sell").map((e) => e.wallet));
      const fresh = evs.filter((e) => t - e.t <= this.windowMs && !v.bad.has(e.wallet) && !sold.has(e.wallet) && this.w.has(e.wallet));
      const firstAt = Math.min(...fresh.map((e) => e.t));
      const inWin = fresh.filter((e) => e.t - firstAt <= this.windowMs);
      const clusters = new Map();
      for (const e of inWin) { const f = this.w.get(e.wallet)?.funder; const k = f ? `f:${f}` : `w:${e.wallet}`; if (!clusters.has(k)) clusters.set(k, e.wallet); }
      const wallets = [...clusters.values()];
      if (wallets.length < this.minWallets) continue;
      out.push({ mint, pool: v.pool, name: v.name, liqUsd: v.liqUsd, wallets, weight: wallets.reduce((a, w) => a + this.weight(this.w.get(w)), 0), at: Math.max(...inWin.map((e) => e.t)) });
    }
    return out.sort((a, b) => b.weight - a.weight);
  }
  /** Step 4: the followed wallets that sold `mint` after `since`. */
  sellers(mint, wallets = [], since = 0) {
    const ws = new Set(wallets);
    return [...new Set(this.events.filter((e) => e.mint === mint && e.side === "sell" && ws.has(e.wallet) && e.t >= since - 5000).map((e) => e.wallet))];
  }
  /** Step 5: a copied trade closed at `ret`. Winners are watched more often; a wallet that loses Ultra money is dropped. */
  credit(wallets = [], ret = 0) {
    for (const a of wallets) {
      const x = this.w.get(a); if (!x) continue;
      x.copies++; x.sumRet += ret; if (ret > 0) x.wins++;
      if ((x.copies >= 3 && x.sumRet / x.copies < -0.02) || (x.copies >= 2 && x.wins === 0 && x.sumRet < -0.04)) this.#drop(a);
    }
    this.#save(true);
  }
  #save(now = false) { if (!this.onSave) return; if (!now && this.now() - (this.savedAt || 0) < 30000) return; this.savedAt = this.now(); try { this.onSave(this.persistable()); } catch { /* never stalls */ } }
  persistable() { return { wallets: [...this.w.values()].map(({ addr, src, own, copies, sumRet, wins, funder, at }) => ({ addr, src, own, copies, sumRet: +sumRet.toFixed(4), wins, funder, at })) }; }
  summary() {
    const ws = [...this.w.values()].sort((a, b) => this.weight(b) - this.weight(a));
    const lag = this.lags.length ? Math.round(this.lags.reduce((a, x) => a + x, 0) / this.lags.length / 100) / 10 : null;
    return { count: ws.length, polls: this.polls, swapsSeen: this.seen, lagS: lag, errors: this.errors, dropped: this.dropped.length,
      wallets: ws.slice(0, 12).map((x) => ({ addr: x.addr, short: `${x.addr.slice(0, 4)}…${x.addr.slice(-4)}`, src: x.src, weight: +this.weight(x).toFixed(2), copies: x.copies, wins: x.wins, avgRet: x.copies ? +(x.sumRet / x.copies).toFixed(4) : null, own: +(x.own || 0).toFixed(0) })),
      signals: this.signals().slice(0, 4).map((s) => ({ name: s.name, mint: s.mint, wallets: s.wallets.length })) };
  }
}
