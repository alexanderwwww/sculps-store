/*
 * GMGN reader. gmgn.ai has no documented public API, and its JSON endpoints
 * answer a bare HTTP client with a Cloudflare 403. A real (headless) Chromium
 * that has loaded gmgn.ai passes, so we keep one page open on gmgn.ai and call
 * the same read endpoints its web app calls, from inside that page (same
 * origin, its cookies). Each call measured ~40-170 ms here.
 *
 * READ ONLY. The allowlist below is every path this module may call; nothing
 * that trades, signs or touches a wallet is on it, and anything else throws.
 */
import { chromium } from "playwright-core";

const ALLOW = [
  /^\/rrs\/api\/v1\/trending_multichain$/,
  /^\/mrwapi\/v1\/multi_token_full_info$/,
  /^\/api\/v1\/token_mcap_candles\/sol\/[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  /^\/api\/v1\/tokens\/top_buyers\/sol\/[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  /^\/vas\/api\/v1\/token_holder_stat\/sol\/[1-9A-HJ-NP-Za-km-z]{32,44}$/,
];
export const allowed = (path) => ALLOW.some((re) => re.test(path.split("?")[0]));

// The launchpads the trenches page itself asked for (recorded request body).
const LAUNCHPADS = ["Pump.fun", "pump_mayhem", "letsbonk", "bonkers", "bags_v2", "bags", "stonkfun", "stonkfun_cc", "hookedpad", "hookd", "tren_ch", "virtuals", "stoxes", "kickstart", "orynth", "swarms", "memoo", "liquid", "bankr", "zora", "surge", "anoncoin", "moonshot_app", "wendotdev", "heaven", "sugar", "token_mill", "believe", "trendsfun", "trends_fun", "jup_studio", "Moonshot", "boop", "ray_launchpad", "xstocks", "meteora_virtual_curve"];

export const toCandles = (list) => (list || []).map((k) => ({
  t: Number(k.time), o: Number(k.open), h: Number(k.high), l: Number(k.low), c: Number(k.close), v: Number(k.volume),
})).filter((k) => k.t > 0 && k.h > 0).sort((a, b) => a.t - b.t);

export class Gmgn {
  constructor({ executablePath = process.env.ULTRA_CHROMIUM || "/opt/pw-browsers/chromium", log = () => {} } = {}) {
    this.executablePath = executablePath;
    this.log = log;
    this.calls = 0;
    this.gapMs = Number(process.env.ULTRA_GMGN_GAP_MS || 250);
    this.errors = 0;
  }

  async open() {
    const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
    this.browser = await chromium.launch({ executablePath: this.executablePath, headless: true, args: ["--no-sandbox"], proxy });
    const ctx = await this.browser.newContext({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36" });
    // the page is only a cookie/origin carrier: skip images, fonts and media
    await ctx.route("**/*", (r) => (["image", "font", "media"].includes(r.request().resourceType()) ? r.abort() : r.continue()));
    this.page = await ctx.newPage();
    await this.page.goto("https://gmgn.ai/?chain=sol", { timeout: 60_000, waitUntil: "domcontentloaded" });
    await this.page.waitForTimeout(4000);
  }
  async close() { await this.browser?.close().catch(() => {}); }

  /**
   * Cloudflare answers bursts with 429 "Just a moment..." (seen here on
   * top_buyers after ~20 quick calls). Then: reload gmgn.ai so the page
   * re-earns its clearance, back off, and retry once.
   */
  async call(path, body = null) {
    // pacing: starts are at least `gapMs` apart (bursts got Cloudflare 429s here)
    const slot = Math.max(Date.now(), this.next || 0);
    this.next = slot + this.gapMs;
    if (slot > Date.now()) await new Promise((r) => setTimeout(r, slot - Date.now()));
    try { return await this.#call(path, body); } catch (e) {
      if (!/-> (429|403) /.test(e.message)) throw e;
      this.challenged = (this.challenged || 0) + 1;
      await this.page.goto("https://gmgn.ai/?chain=sol", { timeout: 60_000, waitUntil: "domcontentloaded" }).catch(() => {});
      await this.page.waitForTimeout(5000);
      return this.#call(path, body);
    }
  }

  async #call(path, body) {
    if (!allowed(path)) throw new Error(`gmgn: path not on the read-only allowlist: ${path}`);
    this.calls++;
    const r = await this.page.evaluate(async ({ path, body }) => {
      const q = "device_id=ultracursor-paper&client_id=gmgn_web&from_app=gmgn&tz_name=UTC&tz_offset=0&app_lang=en-US&os=web";
      const url = path + (path.includes("?") ? "&" : "?") + q;
      const res = await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
      return { status: res.status, text: await res.text() };
    }, { path, body });
    let j = null;
    try { j = JSON.parse(r.text); } catch {}
    if (r.status !== 200 || !j || j.code !== 0) {
      this.errors++;
      throw new Error(`gmgn ${path.split("?")[0]} -> ${r.status} ${r.text.slice(0, 120)}`);
    }
    return j.data;
  }

  async trending(interval = "1h", limit = 500) {
    const d = await this.call("/rrs/api/v1/trending_multichain", { meta: {}, params: [{ chain: "sol", interval, filter: { filters: ["frozen"], limit, launchpad_platform: LAUNCHPADS } }] });
    return d?.[0]?.tokens || [];
  }
  async fullInfo(addresses) { return this.call("/mrwapi/v1/multi_token_full_info", { chain: "sol", addresses }); }
  async topBuyers(a) { return this.call(`/api/v1/tokens/top_buyers/sol/${a}`); }
  async candles(a, resolution = "1m", limit = 120) {
    const d = await this.call(`/api/v1/token_mcap_candles/sol/${a}?pool_type=tpool&resolution=${resolution}&limit=${limit}`);
    return toCandles(d?.list);
  }
}
