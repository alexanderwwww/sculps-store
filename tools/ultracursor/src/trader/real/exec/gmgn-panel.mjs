/**
 * The ONLY code in ultracursor that clicks GMGN's trade controls (build 41). It is imported by
 * real.mjs alone (an import-graph test proves the agent, its tools and the link never reach it),
 * and it is only ever called through the door in execute.mjs, which refuses unless every guard
 * holds (LIVE, the intent's state, Alex's one-shot approval token, the caps, a fresh verify).
 *
 * Every control is found from DATA that Claude wrote into R2 real.json after reading a probe
 * report: {role, name, exact: true, nth?}. It is resolved only with getByRole(role, {name,
 * exact}) inside the trade box the probe's own scan finds. No CSS, eval or regex ever comes from
 * R2. It drives its own background tab and never reloads in a loop (rule 10): one navigation
 * per buy or sell, only when the tab is not already on the coin.
 *
 * Buy:  wallet label = the real wallet -> Buy tab -> amount at 4 dp, read back exactly ->
 *       slippage <= 2.36% -> WAL CLICKING (the caller's beforeClick) -> Buy, exactly once.
 *       Presets, Max and % buttons are never used for a buy.
 * Sell: Sell tab -> sell-all (the 100% control) -> the amount read back = the wallet's tokens
 *       -> WAL -> Sell, once per try.
 */
import { pageScan, instantScan, inputRecorder, gmgnTradeProbe, walletProbe, probeHash, judge } from "../probe.mjs";
import { addrMatch, isAddr } from "../wallet.mjs";
import path from "node:path";

export const SEL_KEYS = Object.freeze(["buyTab", "sellTab", "amount", "buyButton", "sellAll", "sellButton", "slippage", "walletLabel"]);
// what verify() resolves on the page: the controls that exist whichever tab is open. Buy, 100% and
// Sell may only exist on their own tab, so each is resolved (exactly one, visible, enabled) right
// after its tab is pressed, inside the buy or the sell. All eight must be in the probe report.
export const COMMON = Object.freeze(["buyTab", "sellTab", "amount", "slippage", "walletLabel"]);
export const MAX_SLIP = 0.0236;
/** build 52: the probe waits at most this long for the Instant-trade window and the SOL chip. */
export const PROBE_WAIT_MS = 12_000;
/** build 52 (Alex: "X6 speed to cursor"): trade clicks glide 6 x the 6.47 trader pace. */
export const TRADE_SPEED = 6.47 * 6;
export const DEFAULT_TOKEN_URL = "https://gmgn.ai/sol/token/{mint}";

/** A token page URL from the probe's template; only gmgn.ai, only a real mint. */
export function tokenUrlOf(tpl, mint) {
  const t = typeof tpl === "string" && tpl ? tpl : DEFAULT_TOKEN_URL;
  if (!/^https:\/\/gmgn\.ai\/[A-Za-z0-9_/.?=&{}-]*\{mint\}[A-Za-z0-9_/.?=&-]*$/.test(t)) throw new Error("tokenUrl is not a gmgn.ai template with {mint}");
  if (!isAddr(mint)) throw new Error("not a mint address");
  return t.replace("{mint}", mint);
}

/** "1,234.5", "1.23M", "12.3K", "0.0352" -> a number (null if unreadable). */
export function parseAmount(s) {
  const m = /(-?\d+(?:\.\d+)?)\s*([KMB])?/i.exec(String(s ?? "").replace(/,/g, ""));
  if (!m) return null;
  const k = { K: 1e3, M: 1e6, B: 1e9 }[String(m[2] || "").toUpperCase()] || 1;
  return Number(m[1]) * k;
}
const slipOf = (s) => { const m = /(\d+(?:\.\d+)?)\s*%/.exec(String(s ?? "")) || /^\s*(\d+(?:\.\d+)?)\s*$/.exec(String(s ?? "")); return m ? Number(m[1]) / 100 : null; };

/** In the app: a background tab of Alex's own Chrome (the same way gmgn.mjs opens its read tab). */
export async function backgroundPage(browser) {
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error("Chrome has no window open");
  try {
    const s = await browser.newBrowserCDPSession();
    const [p] = await Promise.all([ctx.waitForEvent("page", { timeout: 10_000 }), s.send("Target.createTarget", { url: "about:blank", background: true })]);
    s.detach().catch(() => {});
    return wide(p);
  } catch { return wide(await ctx.newPage()); }
}
// build 43: the first probe on Alex's Mac found no trade box. The background tab was about
// 1,100 px wide, and GMGN hides its buy panel on narrow windows. Every trade tab is desktop-sized.
// build 44: never wait on it more than 3 s (a hung resize on a background tab froze the probe)
async function wide(p) { try { await Promise.race([p.setViewportSize({ width: 1600, height: 1000 }), new Promise((_, no) => setTimeout(() => no(new Error("resize timeout")), 3000))]); } catch { /* keeps its own size */ } return p; }

/**
 * build 48 (Alex: "trade on the one GMGN tab I watch, no extra tabs, the app lags"): the visible
 * tab. The first open page on gmgn.ai that is not one of `exclude` (gmgn.mjs's background read
 * tab), the one whose document is visible first. No GMGN tab: the first page that is not
 * excluded. Never a new tab: none at all is an error, and the trader waits.
 */
export async function visiblePage(browser, exclude = []) {
  const ctx = browser && browser.contexts()[0];
  if (!ctx) throw new Error("Chrome has no window open");
  const skip = new Set(exclude.filter(Boolean));
  const host = (p) => { try { return new URL(p.url()).hostname; } catch { return ""; } };
  const pages = ctx.pages().filter((p) => !p.isClosed() && !skip.has(p));
  const gm = pages.filter((p) => /(^|\.)gmgn\.ai$/.test(host(p)));
  for (const p of gm) { const v = await p.evaluate(() => document.visibilityState).catch(() => null); if (v === "visible") return p; }
  if (gm.length) return gm[0];
  if (pages.length) return pages[0];
  throw new Error("no Chrome tab to trade on");
}

export class GmgnPanel {
  constructor({ browser = null, newPage = null, build = null, dir = null, log = () => {}, now = Date.now, waitMs = 20_000, visible = false, exclude = () => [], ui = null } = {}) {
    this.ui = ui;                           // build 52: ui.mjs hover, so Alex sees the hand on every trade click
    // build 48: visible = trade (and probe) on Alex's own visible GMGN tab, never a tab of our own
    this.visible = visible;
    this.browser = browser; this.newPage = newPage || (visible ? () => visiblePage(browser, exclude()) : () => backgroundPage(browser));
    this.build = build; this.dir = dir; this.log = log; this.now = now; this.waitMs = waitMs;
    this.page = null; this.walletKind = "unknown";
    this.clicks = [];                       // every click this module made: {at, what, name}
  }

  async #tab() {
    if (!this.page || this.page.isClosed()) this.page = await this.newPage();
    return this.page;
  }
  /** build 48: the shared tab shows the trade: in front, so Alex sees the cursor on it. */
  async #front(p) { if (this.visible) { try { await Promise.race([p.bringToFront(), new Promise((r) => setTimeout(r, 2000))]); } catch { /* still trades */ } } }

  /** The trade box on the tab now (tagged so locators stay inside it), waiting up to `wait` ms. */
  async #box(wait = 0) {
    const p = await this.#tab();
    const t0 = Date.now();
    for (;;) {
      for (const f of p.frames()) {
        let s = null;
        try { s = await f.evaluate(pageScan, { mark: true }); } catch { s = null; }
        if (s && s.box) return { page: p, frame: f, box: f.locator('[data-uc-box="1"]').first() };
      }
      if (Date.now() - t0 >= wait) return null;
      await p.waitForTimeout(500);
    }
  }

  /** The tab on this coin's page with its trade box. One navigation at most. */
  async open(url) {
    const p = await this.#tab();
    if (p.url() !== url) await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const b = await this.#box(this.waitMs);
    if (!b) throw new Error("no trade box on the coin's page");
    return b;
  }
  url() { return this.page && !this.page.isClosed() ? this.page.url() : null; }

  /** One selector, resolved by role and exact name only. -> {loc, count} */
  async #find(b, key, sel) {
    const scope = key === "walletLabel" ? b.page : b.box;
    let loc = scope.getByRole(sel.role, { name: sel.name, exact: true });
    let count = await loc.count();
    if (key === "walletLabel" && count === 0 && b.frame !== b.page.mainFrame()) { loc = b.frame.getByRole(sel.role, { name: sel.name, exact: true }); count = await loc.count(); }
    return { loc: Number.isInteger(sel.nth) ? loc.nth(sel.nth) : loc, count };
  }
  async #one(b, key, sel, { enabled = true } = {}) {
    if (!sel || typeof sel !== "object") return { why: `${key}: no selector` };
    const { loc, count } = await this.#find(b, key, sel);
    if (Number.isInteger(sel.nth) ? count <= sel.nth : count !== 1) return { why: `${key}: ${count} elements are ${sel.role} "${sel.name}"` };
    if (!(await loc.isVisible())) return { why: `${key}: "${sel.name}" is not visible` };
    if (enabled && !(await loc.isEnabled())) return { why: `${key}: "${sel.name}" is disabled` };
    return { loc };
  }

  /**
   * All eight selectors are in the probe report they were written from (role and name equal), and
   * each of `keys` resolves on the page to exactly one visible, enabled element.
   */
  async verify(selectors, record, keys = COMMON) {
    const at = this.now();
    try {
      if (!selectors || typeof selectors !== "object") return { ok: false, at, why: "no selectors in real.json" };
      const b = await this.#box(0);
      if (!b) return { ok: false, at, why: "no trade box on the page" };
      const known = new Set(((record && record.controls) || []).map((c) => `${c.role}|${c.name}`));
      for (const k of SEL_KEYS) {
        const sel = selectors[k];
        if (!sel) return { ok: false, at, why: `${k}: missing from real.json` };
        if (!known.has(`${sel.role}|${sel.name}`)) return { ok: false, at, why: `${k}: ${sel.role} "${sel.name}" is not in the probe report` };
      }
      for (const k of keys) {
        const r = await this.#one(b, k, selectors[k]);
        if (r.why) return { ok: false, at, why: r.why };
      }
      const wl = selectors.walletLabel ? selectors.walletLabel.name : null;
      return { ok: true, at, why: "ok", walletLabel: wl };
    } catch (e) {
      return { ok: false, at, why: `verify failed: ${String(e.message || e).slice(0, 120)}` };
    }
  }

  async #click(loc, what, name) {
    this.clicks.push({ at: this.now(), what, name });
    // build 52: on Alex's tab the hand glides there first (TRADE_SPEED); Playwright's own click
    // then lands on the element itself, so a glide can never press a neighbouring preset
    if (this.visible && this.ui && this.ui.hover) { try { await Promise.race([this.ui.hover(loc.page(), loc, { speed: TRADE_SPEED }), new Promise((r) => setTimeout(r, 1500))]); } catch { /* the click still lands */ } }
    await loc.click({ timeout: 5_000, noWaitAfter: true });
  }

  /**
   * ctx: {url, sel, wallet, beforeClick, maxSlip}. -> {ok: true, clicked: true|'unknown'} or
   * {ok: false, stale: why} with no Buy click.
   */
  async buy(intent, ctx) {
    const { sel, wallet } = ctx;
    const b = await this.open(ctx.url);
    const wlab = await this.#one(b, "walletLabel", sel.walletLabel);
    if (wlab.why) return { ok: false, stale: wlab.why };
    const shown = (await wlab.loc.innerText().catch(() => "")) || sel.walletLabel.name;
    if (!addrMatch(shown.trim(), wallet) && !addrMatch(sel.walletLabel.name, wallet)) return { ok: false, stale: "the wallet on the page is not the real wallet" };
    const tab = await this.#one(b, "buyTab", sel.buyTab);
    if (tab.why) return { ok: false, stale: tab.why };
    await this.#click(tab.loc, "buyTab", sel.buyTab.name);
    const amt = await this.#one(b, "amount", sel.amount);
    if (amt.why) return { ok: false, stale: amt.why };
    const want = Number(intent.stakeSol).toFixed(4);
    await amt.loc.fill(want);
    const got = await amt.loc.inputValue();
    if (got !== want) return { ok: false, stale: `amount read back ${got}, not ${want}` };
    const sl = await this.#one(b, "slippage", sel.slippage, { enabled: false });
    if (sl.why) return { ok: false, stale: sl.why };
    const slipText = await sl.loc.inputValue().catch(() => null) ?? await sl.loc.innerText().catch(() => "");
    const slip = slipOf(slipText) ?? slipOf(await sl.loc.innerText().catch(() => "")) ?? slipOf(sel.slippage.name);
    if (slip === null) return { ok: false, stale: "slippage unreadable" };
    if (slip > (ctx.maxSlip ?? MAX_SLIP) + 1e-12) return { ok: false, stale: `slippage above cap (${(slip * 100).toFixed(2)}% > 2.36%)` };
    const buy = await this.#one(b, "buyButton", sel.buyButton);
    if (buy.why) return { ok: false, stale: buy.why };
    await ctx.beforeClick();                         // WAL CLICKING, fsynced, before the click
    try { await this.#click(buy.loc, "buyButton", sel.buyButton.name); }
    catch (e) { return { ok: true, clicked: "unknown", error: String(e.message || e).slice(0, 120) }; } // the chain decides; never re-clicked
    return { ok: true, clicked: true };
  }

  /** ctx: {url, sel, wallet, expectTokens, beforeClick}. One Sell click per call. */
  async sell(pos, ctx) {
    const { sel, wallet } = ctx;
    const b = await this.open(ctx.url);
    const wlab = await this.#one(b, "walletLabel", sel.walletLabel);
    if (wlab.why) return { ok: false, stale: wlab.why };
    if (!addrMatch(sel.walletLabel.name, wallet)) return { ok: false, stale: "the wallet on the page is not the real wallet" };
    const tab = await this.#one(b, "sellTab", sel.sellTab);
    if (tab.why) return { ok: false, stale: tab.why };
    await this.#click(tab.loc, "sellTab", sel.sellTab.name);
    const all = await this.#one(b, "sellAll", sel.sellAll);
    if (all.why) return { ok: false, stale: all.why };
    await this.#click(all.loc, "sellAll", sel.sellAll.name);
    const amt = await this.#one(b, "amount", sel.amount);
    if (amt.why) return { ok: false, stale: amt.why };
    const got = parseAmount(await amt.loc.inputValue());
    const want = Number(ctx.expectTokens);
    // the panel shows the balance rounded (or as 1.23M): within 1% of the wallet's own count
    if (!(got > 0) || !(want > 0) || Math.abs(got - want) / want > 0.01) return { ok: false, stale: `sell amount ${got} is not the wallet's ${want}` };
    const sb = await this.#one(b, "sellButton", sel.sellButton);
    if (sb.why) return { ok: false, stale: sb.why };
    await ctx.beforeClick();
    try { await this.#click(sb.loc, "sellButton", sel.sellButton.name); }
    catch (e) { return { ok: true, clicked: "unknown", error: String(e.message || e).slice(0, 120) }; }
    return { ok: true, clicked: true };
  }

  // ---------------------------------------------------------------- build 45: GMGN Instant trade
  //
  // One click on a buy preset inside the Instant-trade window buys that much SOL at once (GMGN's
  // built-in wallet, no popup); one click on the window's Sell 100% sells it all. So:
  //   - a preset is found ONLY inside the window instantScan finds (the window is tagged and the
  //     locator is scoped to it); 0 or 2+ matches = no click
  //   - the preset's exact text is real.json buyPreset; no other preset, Max or % is ever clicked
  //   - the only other click is the " Instant trade" toggle, when the window is closed (it opens
  //     the window, it trades nothing), then the window is found again
  //   - a buy is clicked at most once per call; real.mjs never calls it twice for one intent

  /** The window on the tab now, in any frame, tagged; target {section, text} tagged when unique. */
  async #instant(target = null, wait = 0) {
    const p = await this.#tab();
    const t0 = Date.now();
    for (;;) {
      let open = [], toggle = null, chips = [];
      for (const f of p.frames()) {
        let s = null;
        try { s = await f.evaluate(instantScan, { mark: true, target }); } catch { s = null; }
        if (!s) continue;
        if (s.toggle && !toggle) toggle = s.toggle;
        chips.push(...(s.chips || []));
        if (s.open) open.push({ frame: f, s });
      }
      if (open.length === 1) return { page: p, frame: open[0].frame, s: open[0].s, win: open[0].frame.locator('[data-uc-instant="1"]').first(), toggle, chips };
      if (open.length > 1) return { page: p, many: open.length, toggle, chips };
      if (Date.now() - t0 >= wait) return { page: p, closed: true, toggle, chips, why: (open[0] && open[0].s.why) || null };
      await p.waitForTimeout(400);
    }
  }

  /** The tab on this coin's page, the window or its toggle showing. One navigation at most. */
  async openInstant(url) {
    const p = await this.#tab();
    await this.#front(p);
    if (p.url() !== url) await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const t0 = Date.now();
    for (;;) {
      const w = await this.#instant(null, 0);
      if (!w.closed || w.toggle || Date.now() - t0 >= this.waitMs) return w;
      await p.waitForTimeout(400);
    }
  }

  /**
   * Read only (no click): the window is open with exactly one `preset` in its buy row and one 100%
   * in its sell row, or it is closed and its toggle is there. The header chip's SOL is returned
   * so real.mjs can check it against the chain (GMGN's wallet shows no address).
   * preset null = the sell only (a position is being sold).
   */
  async instantVerify(preset, record, { chipWaitMs = 0 } = {}) {
    const at = this.now();
    try {
      const ins = record && record.instant;
      if (!ins || !ins.open) return { ok: false, at, why: "the probe report shows no Instant-trade window" };
      if (preset !== null && !(ins.buyPresets || []).includes(preset)) return { ok: false, at, why: `buy preset ${preset} is not in the probe report (${(ins.buyPresets || []).join(", ")})` };
      if (!(ins.sellPcts || []).includes("100%")) return { ok: false, at, why: "the probe report shows no Sell 100%" };
      // build 52: the header chip, or (0 or missing) the SOL on the window's Buy line
      const chipSol = (w) => { const h = w.chips && w.chips.length === 1 ? Number(w.chips[0].text) : null; return h > 0 ? h : w.s && w.s.winSol > 0 ? w.s.winSol : h; };
      let w = await this.#instant(null, 0);
      for (const t0 = Date.now(); !w.many && !(chipSol(w) > 0) && Date.now() - t0 < chipWaitMs;) { await w.page.waitForTimeout(250); w = await this.#instant(null, 0); }
      if (w.many) return { ok: false, at, why: `${w.many} Instant-trade windows on the page` };
      if (w.closed) {
        const t = await this.#toggle(w.page);
        if (t.why) return { ok: false, at, why: `Instant-trade window closed and ${t.why}` };
        return { ok: true, at, why: "ok (window closed, its toggle is there)", closed: true, chipSol: chipSol(w) };
      }
      if (preset !== null) {
        w = await this.#instant({ section: "buy", text: preset }, 0);
        if (w.closed || w.many || w.s.targetCount !== 1) return { ok: false, at, why: `buy preset ${preset}: ${w.s ? w.s.targetCount : 0} clickable matches in the window` };
      }
      w = await this.#instant({ section: "sell", text: "100%" }, 0);
      if (w.closed || w.many || w.s.targetCount !== 1) return { ok: false, at, why: `Sell 100%: ${w.s ? w.s.targetCount : 0} clickable matches in the window` };
      return { ok: true, at, why: "ok", closed: false, chipSol: chipSol(w) };
    } catch (e) {
      return { ok: false, at, why: `verify failed: ${String(e.message || e).slice(0, 120)}` };
    }
  }

  /** build 55: GMGN's toggle is a span ("\ue095 Instant trade"), not a button: match its text, innermost match. */
  async #toggle(page) {
    const all = page.locator("button, span, div, a").filter({ hasText: /^[\s\uE000-\uF8FF]*Instant trade\s*$/ });
    const n = await all.count();
    if (n < 1) return { why: "0 \" Instant trade\" toggles" };
    const loc = all.last();
    if (!(await loc.isVisible())) return { why: "the Instant trade toggle is not visible" };
    return { loc };
  }

  /** The window open (the toggle clicked once if it was closed), then the one target in it. */
  async #instantTarget(url, target) {
    let w = await this.openInstant(url);
    if (w.many) return { why: `${w.many} Instant-trade windows on the page` };
    if (w.closed) {
      const t = await this.#toggle(w.page);
      if (t.why) return { why: `Instant-trade window closed and ${t.why}` };
      await this.#click(t.loc, "instantToggle", "Instant trade");      // opens the window; trades nothing
      w = await this.#instant(null, 5_000);
      if (w.closed || w.many) return { why: "the Instant-trade window did not open" };
    }
    w = await this.#instant(target, 0);
    if (w.closed || w.many) return { why: "the Instant-trade window went away" };
    if (w.s.targetCount !== 1) return { why: `${target.section} ${target.text}: ${w.s.targetCount} clickable matches in the window` };
    const loc = w.win.locator('[data-uc-target="1"]');
    if ((await loc.count()) !== 1) return { why: `${target.text}: not found inside the window` };
    if (!(await loc.isVisible())) return { why: `${target.text}: not visible` };
    return { loc };
  }

  /** ctx: {url, preset, beforeClick}. -> {ok: true, clicked} or {ok: false, stale} with no buy click. */
  async instantBuy(intent, ctx) {
    const preset = ctx.preset;
    if (typeof preset !== "string" || !/^\d+(\.\d+)?$/.test(preset)) return { ok: false, stale: "no buy preset" };
    if (Math.abs(Number(preset) - Number(intent.stakeSol)) > 1e-12) return { ok: false, stale: `preset ${preset} is not the intent's ${intent.stakeSol} SOL` };
    const t = await this.#instantTarget(ctx.url, { section: "buy", text: preset });
    if (t.why) return { ok: false, stale: t.why };
    await ctx.beforeClick();                         // WAL CLICKING, fsynced, before the click
    try { await this.#click(t.loc, "instantBuy", preset); }
    catch (e) { return { ok: true, clicked: "unknown", error: String(e.message || e).slice(0, 120) }; } // never re-clicked
    return { ok: true, clicked: true };
  }

  /** ctx: {url, beforeClick}. One Sell 100% click per call. */
  async instantSell(pos, ctx) {
    void pos;
    const t = await this.#instantTarget(ctx.url, { section: "sell", text: "100%" });
    if (t.why) return { ok: false, stale: t.why };
    await ctx.beforeClick();
    try { await this.#click(t.loc, "instantSell", "100%"); }
    catch (e) { return { ok: true, clicked: "unknown", error: String(e.message || e).slice(0, 120) }; }
    return { ok: true, clicked: true };
  }

  async #targets() {
    if (!this.browser) return null;
    try {
      const s = await this.browser.newBrowserCDPSession();
      const { targetInfos } = await s.send("Target.getTargets");
      s.detach().catch(() => {});
      return targetInfos.map((t) => ({ type: t.type, url: String(t.url || "").slice(0, 120), title: String(t.title || "").slice(0, 60) }));
    } catch { return null; }
  }

  /**
   * The probe: its own background tab on a coin's page, read and closed. Zero clicks, zero typing:
   * the tab counts every trusted input from before its first byte loads, and the count is in the
   * report (a report with any input is not ok).
   */
  async probe(url) {
    const at = this.now();
    const before = await this.#targets();
    // build 48: visible mode reads the shared tab (no tab of its own, never closed)
    const p = this.visible ? await this.#tab() : await this.newPage();
    try {
      if (!this.visible || !this.recorded || this.recorded !== p) { await p.addInitScript(inputRecorder); if (this.visible) this.recorded = p; }
      await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      // build 52: the wait is the cheap Instant-trade scan only (the full probe on a heavy GMGN
      // page ran past real.mjs's 90 s limit on Alex's Mac, so build 50 never recorded a report).
      // GMGN closes the window after every page load: once, after 2 s, it is opened the way its
      // own toggle does (an untrusted DOM click, not a trade). At most PROBE_WAIT_MS, then ONE
      // full probe.
      const t0 = Date.now();
      let reopened = false;
      for (;;) {
        let open = false, chipUp = false, toggles = 0, any = false;
        for (const f of p.frames()) {
          let s = null;
          try { s = await Promise.race([f.evaluate(instantScan, { mark: false }), new Promise((r) => setTimeout(() => r(null), 3000))]); } catch { s = null; }
          if (!s) continue;
          any = true;
          if (s.open) open = true;
          if (s.toggle) toggles += s.toggle.count;
          if ((s.chips || []).some((c) => parseFloat(c.text) > 0) || s.winSol > 0) chipUp = true;
        }
        if ((open && chipUp) || (any && !toggles && open) || Date.now() - t0 >= PROBE_WAIT_MS) break;
        if (any && !toggles && !open && Date.now() - t0 > 1500) {
          // not an Instant-trade page: a real trade box (not GMGN's whole body) ends the wait
          let box = null;
          try { box = (await p.mainFrame().evaluate(pageScan, { mark: false })).box; } catch { box = null; }
          if (box && box.tag !== "body") break;
        }
        if (!reopened && !open && toggles === 1 && Date.now() - t0 > 2000) {
          reopened = true;
          // build 55: a real (trusted) click on the toggle, as the live path does; opens the window, trades nothing.
          // The recorder is reset after it so the report still proves zero trade inputs.
          try {
            const t = await this.#toggle(p);
            if (t.loc) { await t.loc.click({ timeout: 4000, noWaitAfter: true }); await p.evaluate(() => { window.__ucTrusted = []; }).catch(() => {}); }
          } catch { /* the report says what it saw */ }
        }
        await p.waitForTimeout(500);
      }
      const rep = await gmgnTradeProbe(p);
      const after = await this.#targets();
      const w = await walletProbe(p, rep, after);
      let inputs = 0;
      for (const f of p.frames()) inputs += await Promise.race([f.evaluate(() => (window.__ucTrusted || []).length).catch(() => 0), new Promise((r) => setTimeout(() => r(0), 2000))]);
      let screenshot = null;
      if (this.dir) { screenshot = path.join(this.dir, "probe.png"); await p.screenshot({ path: screenshot, timeout: 4000 }).catch(() => { screenshot = null; }); }
      const out = { build: this.build, at, ...rep, walletKind: w.walletKind, walletAddr: w.walletAddr, chipSol: w.chipSol, walletEvidence: w.evidence, cdpTargetsBefore: before, cdpTargetsAfter: after, screenshot, inputs };
      const j = judge(out);
      out.ok = j.ok; out.why = j.why; out.hash = probeHash(out);
      this.walletKind = out.walletKind;
      return out;
    } catch (e) {
      return { build: this.build, at, url, ok: false, why: `probe failed: ${String(e.message || e).slice(0, 160)}`, controls: [], hash: null, walletKind: "unknown", walletAddr: null, inputs: null };
    } finally {
      if (!this.visible) await p.close().catch(() => {});
    }
  }

  async close() { if (!this.visible) await this.page?.close().catch(() => {}); this.page = null; }
}
