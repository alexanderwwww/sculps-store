/*
 * GMGN reader. gmgn.ai has no documented public API, and its JSON endpoints
 * answer a bare HTTP client with a Cloudflare 403. A real (headless) Chromium
 * that has loaded gmgn.ai passes, so we keep one page open on gmgn.ai and call
 * the same read endpoints its web app calls, from inside that page (same
 * origin, its cookies).
 *
 * The /vas/ paths answer 429 "Just a moment" unless the call carries the web
 * app's own query (device_id, tab_id, fp_did, client_id, app_ver, worker ...).
 * Proven 2026-10-19: the same URL the page used answers 200 when replayed, a
 * shortened query answers 429. So open() copies the query of the page's own
 * first API request and every call reuses it.
 *
 * READ ONLY. The allowlist below is every path this module may call; nothing
 * that trades, signs or touches a wallet is on it, and anything else throws.
 * Every endpoint here was seen in gmgn.ai's own network traffic on 2026-10-19
 * (see TOOLS in tools-map.mjs for what each returns, latency and reliability).
 */
import { chromium } from "playwright-core";

const MINT = "[1-9A-HJ-NP-Za-km-z]{32,44}";
const ALLOW = [
  /^\/rrs\/api\/v1\/trending_multichain$/,
  /^\/mrwapi\/v1\/multi_token_full_info$/,
  new RegExp(`^/api/v1/token_mcap_candles/sol/${MINT}$`),
  new RegExp(`^/api/v1/token_candles/sol/${MINT}$`),
  new RegExp(`^/api/v1/tokens/top_buyers/sol/${MINT}$`),
  new RegExp(`^/vas/api/v1/token_holder_stat/sol/${MINT}$`),
  new RegExp(`^/vas/api/v1/token_trades/sol/${MINT}$`),
  new RegExp(`^/api/v1/token_fee_info/sol/${MINT}$`),
  new RegExp(`^/api/v1/recommend_slippage/sol/${MINT}$`),
  new RegExp(`^/api/v1/token/sol/${MINT}/community/messages$`),
  new RegExp(`^/api/v1/live/token_preview/sol/${MINT}$`),
  /^\/api\/v1\/notification\/callout\/global$/,
  /^\/api\/v1\/gas_price_list$/,
  /^\/api\/v1\/major_coin_prices$/,
  /^\/api\/v1\/pairs\/sol\/new_pairs\/1h$/,
  /^\/api\/v1\/rank\/sol\/wallets\/(1d|7d|30d)$/,
];
export const allowed = (path) => ALLOW.some((re) => re.test(path.split("?")[0]));

// The launchpads the trenches page itself asked for (recorded request body).
const LAUNCHPADS = ["Pump.fun", "pump_mayhem", "letsbonk", "bonkers", "bags_v2", "bags", "stonkfun", "stonkfun_cc", "hookedpad", "hookd", "tren_ch", "virtuals", "stoxes", "kickstart", "orynth", "swarms", "memoo", "liquid", "bankr", "zora", "surge", "anoncoin", "moonshot_app", "wendotdev", "heaven", "sugar", "token_mill", "believe", "trendsfun", "trends_fun", "jup_studio", "Moonshot", "boop", "ray_launchpad", "xstocks", "meteora_virtual_curve"];
export const WSOL = "So11111111111111111111111111111111111111112";
const WEB_KEYS = ["device_id", "tab_id", "fp_did", "client_id", "from_app", "app_ver", "tz_name", "tz_offset", "app_lang", "os", "worker"];
const FALLBACK_Q = "device_id=ultracursor-train&client_id=gmgn_web&from_app=gmgn&tz_name=UTC&tz_offset=0&app_lang=en-US&os=web";

export const toCandles = (list) => (list || []).map((k) => ({
  t: Number(k.time), o: Number(k.open), h: Number(k.high), l: Number(k.low), c: Number(k.close), v: Number(k.volume),
})).filter((k) => k.t > 0 && k.h > 0).sort((a, b) => a.t - b.t);

/** The web app's own query string, from one of its request URLs. */
export function webQuery(url) {
  try {
    const u = new URL(url);
    if (!u.searchParams.get("device_id") || !u.searchParams.get("app_ver")) return null;
    const out = new URLSearchParams();
    for (const k of WEB_KEYS) if (u.searchParams.has(k)) out.set(k, u.searchParams.get(k));
    return out.toString();
  } catch { return null; }
}

export class Gmgn {
  constructor({ executablePath = process.env.ULTRA_CHROMIUM || "/opt/pw-browsers/chromium", log = () => {}, onCall = () => {} } = {}) {
    this.executablePath = executablePath;
    this.log = log;
    this.onCall = onCall;        // ({tool, ms, ok}) -> the tools map keeps latency and reliability
    this.calls = 0;
    this.gapMs = Number(process.env.ULTRA_GMGN_GAP_MS || 250);
    this.errors = 0;
    this.q = null;
  }

  async open() {
    const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
    this.browser = await chromium.launch({ executablePath: this.executablePath, headless: true, args: ["--no-sandbox"], proxy });
    const ctx = await this.browser.newContext({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36" });
    // the page is only a cookie/origin carrier: skip images, fonts and media
    await ctx.route("**/*", (r) => (["image", "font", "media"].includes(r.request().resourceType()) ? r.abort() : r.continue()));
    this.page = await ctx.newPage();
    this.page.on("request", (r) => { if (!this.q && /gmgn\.ai\/(api|mrwapi|rrs|vas)\//.test(r.url())) this.q = webQuery(r.url()); });
    await this.#home();
  }
  async #home() {
    await this.page.goto("https://gmgn.ai/?chain=sol", { timeout: 60_000, waitUntil: "domcontentloaded" });
    for (let i = 0; i < 20 && !this.q; i++) await this.page.waitForTimeout(500);
    await this.page.waitForTimeout(2500);
  }
  async close() { await this.browser?.close().catch(() => {}); }

  /**
   * Cloudflare answers bursts with 429 "Just a moment...". Then: reload
   * gmgn.ai so the page re-earns its clearance, back off, and retry once.
   */
  async call(path, body = null, tool = path.split("?")[0].replace(/\/sol\/[1-9A-HJ-NP-Za-km-z]{32,44}/, "/sol/<mint>")) {
    const slot = Math.max(Date.now(), this.next || 0);
    this.next = slot + this.gapMs;
    if (slot > Date.now()) await new Promise((r) => setTimeout(r, slot - Date.now()));
    const t0 = Date.now();
    try {
      const d = await this.#retry(path, body);
      this.onCall({ tool, ms: Date.now() - t0, ok: true });
      return d;
    } catch (e) {
      this.onCall({ tool, ms: Date.now() - t0, ok: false, error: String(e.message).slice(0, 120) });
      throw e;
    }
  }
  async #retry(path, body) {
    try { return await this.#call(path, body); } catch (e) {
      if (!/-> (429|403) /.test(e.message)) throw e;
      this.challenged = (this.challenged || 0) + 1;
      this.q = null;
      await this.#home().catch(() => {});
      await this.page.waitForTimeout(2500);
      return this.#call(path, body);
    }
  }

  async #call(path, body) {
    if (!allowed(path)) throw new Error(`gmgn: path not on the read-only allowlist: ${path}`);
    this.calls++;
    const q = this.q || FALLBACK_Q;
    const r = await this.page.evaluate(async ({ path, body, q }) => {
      const url = path + (path.includes("?") ? "&" : "?") + q;
      const res = await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
      return { status: res.status, text: await res.text() };
    }, { path, body, q });
    let j = null;
    try { j = JSON.parse(r.text); } catch {}
    if (r.status !== 200 || !j || j.code !== 0) {
      this.errors++;
      throw new Error(`gmgn ${path.split("?")[0]} -> ${r.status} ${r.text.slice(0, 120)}`);
    }
    return j.data;
  }

  // ---- the tools ----------------------------------------------------------
  async trending(interval = "1h", limit = 500) {
    const d = await this.call("/rrs/api/v1/trending_multichain", { meta: {}, params: [{ chain: "sol", interval, filter: { filters: ["frozen"], limit, launchpad_platform: LAUNCHPADS } }] });
    return d?.[0]?.tokens || [];
  }
  async fullInfo(addresses) { return this.call("/mrwapi/v1/multi_token_full_info", { chain: "sol", addresses }); }
  async topBuyers(a) { return this.call(`/api/v1/tokens/top_buyers/sol/${a}`); }
  async candles(a, resolution = "1m", limit = 500) {
    const d = await this.call(`/api/v1/token_mcap_candles/sol/${a}?pool_type=tpool&resolution=${resolution}&limit=${limit}`);
    return toCandles(d?.list);
  }
  /** SOL's own price candles (for the regime switch). */
  async solCandles(resolution = "5m", limit = 50) {
    const d = await this.call(`/api/v1/token_candles/sol/${WSOL}?resolution=${resolution}&limit=${limit}`);
    return toCandles(d?.list);
  }
  async holderStat(a) { return this.call(`/vas/api/v1/token_holder_stat/sol/${a}`); }
  /**
   * The last trades, each with maker_tags (smart_degen, renowned, kol ...) and
   * the network cost that trade paid (gas_native SOL, priority_fee, tip_fee).
   * A `tag=` query parameter is IGNORED by GMGN (proven 2026-10-19: tagged and
   * untagged answers identical), so smart money is read from maker_tags.
   */
  async trades(a, limit = 50) { return (await this.call(`/vas/api/v1/token_trades/sol/${a}?limit=${limit}`))?.history || []; }
  async feeInfo(a) { return this.call(`/api/v1/token_fee_info/sol/${a}`); }
  async slippage(a) { return this.call(`/api/v1/recommend_slippage/sol/${a}`); }
  async community(a, limit = 50) { return (await this.call(`/api/v1/token/sol/${a}/community/messages?limit=${limit}`))?.messages || []; }
  async preview(a) { return this.call(`/api/v1/live/token_preview/sol/${a}`); }
  async callouts({ onlyKol = false, limit = 50 } = {}) {
    return (await this.call("/api/v1/notification/callout/global", { chains: ["sol"], limit, only_kol: onlyKol, only_declaration: false, only_safe: true, min_holding_usd: "100" }))?.list || [];
  }
  async gas() { return (await this.call("/api/v1/gas_price_list"))?.gas_prices?.find((g) => g.chain === "sol") || null; }
  async prices(symbols = ["SOL"]) { return (await this.call("/api/v1/major_coin_prices", { symbols }))?.prices || []; }
  async newPairs(limit = 50) { return (await this.call(`/api/v1/pairs/sol/new_pairs/1h?limit=${limit}&orderby=open_timestamp&direction=desc&period=1h`))?.pairs || []; }
  async walletRank(period = "1d") { return (await this.call(`/api/v1/rank/sol/wallets/${period}?orderby=pnl_${period}&direction=desc`))?.rank || []; }
}
