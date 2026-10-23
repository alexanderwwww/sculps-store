/**
 * build 52 (Alex: "close all the tabs and leave only one open. Don't open more."): the ONE tab.
 *
 * Everything the trader does in Chrome runs in one page of Alex's own Chrome: gmgn.mjs's reads
 * (an in-page fetch, so GMGN's Cloudflare clearance and cookies come with it), the real trader's
 * probe, verify, buys and sells. Nothing here ever opens a page.
 *
 *   get()      the tab: the one kept so far while it is open, else the visible gmgn.ai tab, else
 *              the first gmgn.ai tab, else the first open page. No page at all is an error.
 *   enforce()  closes every OTHER gmgn.ai tab (the app's old read and probe tabs were all gmgn.ai
 *              pages). A tab on any other site is Alex's and is never touched.
 */
const host = (p) => { try { return new URL(p.url()).hostname; } catch { return ""; } };
export const isGmgn = (p) => /(^|\.)gmgn\.ai$/.test(host(p));
const open = (p) => { try { return !!p && !p.isClosed(); } catch { return false; } };

export class OneTab {
  constructor(browser, { log = () => {} } = {}) { this.browser = browser; this.log = log; this.page = null; this.closed = 0; }

  #ctx() { const c = this.browser && this.browser.contexts()[0]; if (!c) throw new Error("Chrome has no window open"); return c; }

  async get() {
    if (open(this.page)) return this.page;
    const pages = this.#ctx().pages().filter(open);
    const gm = pages.filter(isGmgn);
    let pick = null;
    for (const p of gm) { const v = await p.evaluate(() => document.visibilityState).catch(() => null); if (v === "visible") { pick = p; break; } }
    pick = pick || gm[0] || pages[0] || null;
    if (!pick) throw new Error("no Chrome tab to trade on");
    this.page = pick;
    return pick;
  }

  /** Every gmgn.ai tab but the one is closed. -> the number closed now. */
  async enforce() {
    const keep = await this.get();
    let n = 0;
    for (const p of this.#ctx().pages()) {
      if (p === keep || !open(p) || !isGmgn(p)) continue;
      await p.close().catch(() => {});
      n++;
    }
    if (n) { this.closed += n; this.log({ type: "tabs", closed: n, kept: keep.url().slice(0, 120) }); }
    return n;
  }
}
