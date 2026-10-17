/*
 * What every site reader shares: where each site lives (overridable for the
 * tests only), going to a page visibly, reading the page as it is, spotting a
 * login wall or a captcha, and the diag block Claude uses to fix a reader from
 * the first live run instead of guessing.
 */

/** Real sites; the ULTRA_SITE_* env vars exist for test/e2e.mjs only. */
export const SITES = {
  adlibrary: () => process.env.ULTRA_SITE_ADLIBRARY || "https://www.facebook.com",
  tiktok: () => process.env.ULTRA_SITE_TIKTOK || "https://www.tiktok.com",
  instagram: () => process.env.ULTRA_SITE_INSTAGRAM || "https://www.instagram.com",
  trends: () => process.env.ULTRA_SITE_TRENDS || "https://trends.google.com",
  storeProto: () => process.env.ULTRA_STORE_PROTO || "https",
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** A human pause through ctx.ui when there is one; tests can shorten it with ULTRA_FAST=1. */
export async function breathe(ctx, a = 600, b = 2500) {
  if (process.env.ULTRA_FAST === "1") return sleep(60);
  if (ctx && ctx.ui && ctx.ui.pause) return ctx.ui.pause(a, b);
  return sleep(a + Math.random() * (b - a));
}

export async function say(page, ctx, text) {
  try { if (ctx && ctx.ui && ctx.ui.say) await ctx.ui.say(page, text); } catch { /* the pill is a nicety */ }
}

/** Go somewhere, re-attach the overlay, wait for the page to settle. Answers an error string or null. */
export async function visit(page, url, ctx) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (e) {
    return `error:${String(e && e.message || e).split("\n")[0].slice(0, 160)}`;
  }
  try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch { /* busy sites never go idle */ }
  try { if (ctx && ctx.ui && ctx.ui.attach) await ctx.ui.attach(null, page, ctx.build); } catch { /* ignore */ }
  return null;
}

export async function bodyText(page, limit = 200000) {
  try { return await page.evaluate((n) => (document.body ? document.body.innerText || "" : "").slice(0, n), limit); }
  catch { return ""; }
}

/**
 * "login" | "captcha" | null for the page as it is now.
 * `hasContent` is whether the reader already found what it came for: a page
 * with results and a "Log in" button in the header is not a wall.
 */
export async function wall(page, hasContent = false) {
  let url = "";
  try { url = page.url(); } catch { url = ""; }
  const text = (await bodyText(page, 6000)).toLowerCase();
  if (/captcha|verify you are human|drag the slider|security check|unusual traffic|confirm you('| a)re not a robot/.test(text)) return "captcha";
  if (/\/accounts\/login|\/login\b|\/checkpoint\//.test(url)) return "login";
  if (!hasContent && /(log in|sign in|sign up) (to|for) (see|continue|view)|you must log in|log in to continue|log in or sign up|see more from|create an account or log in/.test(text)) return "login";
  return null;
}

export async function diag(page, counts = {}) {
  let url = "", title = "";
  try { url = page.url(); title = await page.title(); } catch { /* closed */ }
  return { title, url, textSample: (await bodyText(page, 600)).replace(/\s+/g, " ").trim(), counts };
}

/** Wheel down the page a few times, like a person reading it. */
export async function readDown(page, ctx, times = 3) {
  for (let i = 0; i < times; i++) {
    if (ctx.shouldStop && ctx.shouldStop()) return;
    try {
      if (ctx.ui && ctx.ui.scroll) await ctx.ui.scroll(page, 500 + Math.floor(Math.random() * 300));
      else await page.mouse.wheel(0, 600);
    } catch { /* ignore */ }
    await breathe(ctx, 500, 1400);
  }
}

/** Hover a locator's first match, visibly, if it is there. */
export async function hoverFirst(page, ctx, selector) {
  try {
    const loc = page.locator(selector).first();
    if ((await loc.count()) && ctx.ui && ctx.ui.hover) await ctx.ui.hover(page, loc);
  } catch { /* ignore */ }
}

/** Collect JSON bodies of responses whose URL contains `needle` while `fn` runs. */
export async function listen(page, needle, fn, parse = (t) => JSON.parse(t)) {
  const got = [];
  const on = async (res) => {
    try {
      if (!res.url().includes(needle)) return;
      const t = await res.text();
      const v = parse(t);
      if (v !== undefined && v !== null) got.push(v);
    } catch { /* not JSON, or the body is gone */ }
  };
  page.on("response", on);
  try { await fn(); } finally { try { page.off("response", on); } catch { /* ignore */ } }
  return got;
}

export const errorOf = (e) => `error:${String(e && e.message || e).split("\n")[0].slice(0, 160)}`;
