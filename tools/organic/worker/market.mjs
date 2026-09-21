/**
 * Market research, done like a person looking.
 *
 * Every reader here takes a page the caller owns — the `market` screen for
 * the Ad Library, an account screen for the hashtag passes — and reads what
 * a person scrolling that page would see. No page is created or closed here,
 * nothing is injected into the page (the UI draws the cursor), and every
 * wait is drawn from human.mjs. Research in an account tab is browsing, not
 * scraping: at most 40 items per pass, and the scheduler puts minutes
 * between passes.
 *
 * Nothing throws. A wall — cookies, rate limit, login — comes back as
 * `stopped: "<why>"` so the caller can say so, rather than an empty list
 * that reads as "nobody is advertising this".
 */
import { between, around, chance, frictionIn } from "./human.mjs";
import { ask, go, sleep } from "./accounts.mjs";

const PER_PASS = 40;

/* ---------------------------------------------------------------- pace */

/** Scroll a feed the way a thumb does: a few wheel ticks, uneven, then a rest. */
async function scroll(page, { absorbed = false } = {}) {
  try {
    const distance = Math.round(around(absorbed ? 520 : 900, 260, 180, 1600));
    const steps = Math.round(between(3, 9));
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, distance / steps);
      await sleep(between(18, 70));
    }
  } catch {
    /* the page went away mid-scroll; the next read will say so */
  }
}

/** The pause after a scroll: longer when something caught the eye. */
const settle = () => sleep(around(1700, 650, 650, 3800));

/* ---------------------------------------------------------------- walls */

/**
 * Patterns beyond human.mjs's account friction: the walls a public page
 * puts up to a signed-out reader. Tightened against false positives — a
 * footer "Cookie policy" link is not a wall; a modal that only offers
 * "Allow all cookies" is.
 */
const WALLS = [
  { re: /\b(allow|accept) (all|essential and optional) cookies\b/i, why: "cookie wall" },
  { re: /\bdecline optional cookies\b/i, why: "cookie wall" },
  { re: /\bwe use cookies\b.{0,200}\b(allow|accept)\b/is, why: "cookie wall" },
  { re: /\brate limit(ed)?\b/i, why: "rate limited" },
  { re: /\byou(’|')?re going too fast\b/i, why: "rate limited" },
  { re: /\bplease wait a few minutes before you try again\b/i, why: "rate limited" },
  { re: /\blog in to see (more|this)\b/i, why: "login wall" },
  { re: /\blog in to (continue|facebook)\b/i, why: "login wall" },
  { re: /\bsign in to (continue|confirm)\b/i, why: "login wall" },
  { re: /\bthis (page|content) isn(’|')?t available\b/i, why: "not available" },
];

function wallIn(text) {
  const t = String(text ?? "");
  const friction = frictionIn(t);
  if (friction) return friction;
  for (const { re, why } of WALLS) if (re.test(t)) return why;
  return null;
}

async function checkWall(page) {
  const text = await ask(page, () => (document.body && document.body.innerText ? document.body.innerText.slice(0, 4000) : ""), undefined, 6000);
  return wallIn(text ?? "");
}

/** A page that is gone, or one that did not answer, is a stop — never an empty list. */
const closed = (page) => {
  try {
    return !page || page.isClosed();
  } catch {
    return true;
  }
};
const GONE = "the page is closed";
const SILENT = "the page did not answer";

/* ----------------------------------------------------------------- pure */

/** "1.2M" → 1200000, "340.5K" → 340500, "12,345" → 12345, "7" → 7; null when it is not a count. */
export function parseCount(s) {
  if (s == null) return null;
  const m = /(\d[\d,]*(?:\.\d+)?)\s*([kmb])?\b/i.exec(String(s).trim());
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || "").toLowerCase()] ?? 1;
  return Math.round(n * mult);
}

/** Days since the library's "Started running on …" wording; null when unparseable. */
export function runningDays(started, now = new Date()) {
  if (!started) return null;
  const clean = String(started).replace(/^started running on\s*/i, "").replace(/[·|].*$/, "").trim();
  const when = new Date(clean);
  if (Number.isNaN(when.getTime())) return null;
  // Calendar days, not elapsed milliseconds: the library prints a date, and
  // "Aug 2" to "Sep 21" is 50 days in every timezone.
  const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.round((day(now) - day(when)) / 86_400_000));
}

/**
 * Who is paying to sell this, and for how long.
 *
 * Grouped by advertiser; the one whose longest-running ad is oldest comes
 * first, because an ad that has run six weeks is an ad that is making money.
 */
export function sellers(ads) {
  const by = new Map();
  for (const ad of ads ?? []) {
    const name = String(ad?.advertiser ?? "").trim();
    if (!name) continue;
    const row = by.get(name) ?? { advertiser: name, ads: 0, longestDays: null };
    row.ads += 1;
    const d = ad.days ?? runningDays(ad.started);
    if (d != null && (row.longestDays == null || d > row.longestDays)) row.longestDays = d;
    by.set(name, row);
  }
  return [...by.values()].sort(
    (a, b) => (b.longestDays ?? -1) - (a.longestDays ?? -1) || b.ads - a.ads || a.advertiser.localeCompare(b.advertiser),
  );
}

/**
 * What to search for, from the brief.
 *
 * Queries are the products and market terms as written. Tags are those same
 * terms squashed the way a hashtag is (letters and digits only, ≥ 4 chars),
 * plus every #tag Alex wrote in the notes. At most 12 tags: a research pass
 * is minutes long, and a hundred tags would be a day of scrolling.
 */
export function termsFromBrief(brief) {
  const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((s) => String(s ?? "").trim()).filter(Boolean);
  const products = list(brief?.products);
  const market = list(brief?.market);
  const queries = [...new Set([...products, ...market])];

  const tags = [];
  const add = (t) => {
    const tag = String(t ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (tag.length >= 4 && !tags.includes(tag)) tags.push(tag);
  };
  for (const term of [...products, ...market]) add(term);
  const notes = String(brief?.notes ?? "");
  for (const m of notes.matchAll(/#([\p{L}\p{N}_]+)/gu)) add(m[1]);
  return { queries, tags: tags.slice(0, 12) };
}

/* ----------------------------------------------------------- ad library */

/**
 * Meta's Ad Library: what competitors are actually paying to show people.
 *
 * Public by law, readable without an account. What is read is the creative
 * and how long it has run; nothing is downloaded or reposted.
 */
export async function adLibrary(page, { query, country = "US", limit = 40 } = {}) {
  const ads = [];
  try {
    if (!query) return { ads, stopped: "no query" };
    if (closed(page)) return { ads, stopped: GONE };
    const url =
      "https://www.facebook.com/ads/library/?active_status=active&ad_type=all" +
      `&country=${encodeURIComponent(country)}&q=${encodeURIComponent(query)}&search_type=keyword_unordered`;
    await go(page, url);
    await sleep(between(3000, 5000));
    if (closed(page)) return { ads, stopped: GONE };

    const wall = await checkWall(page);
    if (wall) return { ads, stopped: wall };

    const now = new Date();
    const cap = Math.min(limit, PER_PASS * 8);
    for (let pass = 0; pass < 8 && ads.length < cap; pass++) {
      const batch = await ask(page, () => {
        const out = [];
        // The library renders every ad card with its start date in plain
        // text. Reading the visible text is more durable than a class name,
        // which changes the week after you depend on it.
        const cards = document.querySelectorAll('[role="article"], div[class*="_99s5"]');
        for (const el of cards) {
          const text = el.innerText || "";
          if (!/Started running on/i.test(text)) continue;
          const sm = /Started running on ([^\n·|]+)/i.exec(text);
          const started = sm ? sm[1].trim() : null;
          const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
          const advertiser = lines.find((l) => !/^Sponsored$/i.test(l) && !/^(Active|Inactive)$/i.test(l) && !/^Library ID/i.test(l) && !/^Started running/i.test(l)) || null;
          const img = el.querySelector("img");
          const video = el.querySelector("video");
          out.push({
            advertiser,
            started,
            img: img ? img.currentSrc || img.src || null : null,
            video: video ? video.currentSrc || video.src || (video.querySelector("source") && video.querySelector("source").src) || null : null,
            text: text.slice(0, 400),
          });
          if (out.length >= 40) break;
        }
        return out;
      }, undefined, 8000);
      if (batch == null) return { ads: ads.slice(0, limit), stopped: closed(page) ? GONE : SILENT };

      for (const ad of batch) {
        if (ads.length >= cap) break;
        if (ads.some((a) => a.text === ad.text)) continue;
        ads.push({ ...ad, days: runningDays(ad.started, now) });
      }

      if (ads.length >= cap) break;
      await scroll(page, { absorbed: chance(0.4) });
      await settle();

      const again = await checkWall(page);
      if (again) return { ads: ads.slice(0, limit), stopped: again };
    }
    return { ads: ads.slice(0, limit), stopped: null };
  } catch (error) {
    return { ads: ads.slice(0, limit), stopped: `could not read the ad library: ${error?.message ?? error}` };
  }
}

/* ------------------------------------------------------------ the feeds */

/**
 * One feed, read across a few scroll passes.
 *
 * `read` runs in the page and returns [{url, handle, views}]; items are
 * deduped by url and capped at 40 per pass. "Logged out" is the expected
 * state on a public tag page and is not a stop.
 */
async function feed(page, url, read, { passes = 4 } = {}) {
  const seen = new Map();
  const items = () => [...seen.values()];
  try {
    if (closed(page)) return { items: items(), stopped: GONE };
    await go(page, url);
    await sleep(between(2500, 4500));
    if (closed(page)) return { items: items(), stopped: GONE };

    const wall = await checkWall(page);
    if (wall && wall !== "logged out") return { items: items(), stopped: wall };

    for (let i = 0; i < passes; i++) {
      const found = await ask(page, read, undefined, 8000);
      if (found == null) return { items: items(), stopped: closed(page) ? GONE : SILENT };
      let taken = 0;
      for (const it of found) {
        if (!it || !it.url || seen.has(it.url)) continue;
        seen.set(it.url, { url: it.url, handle: it.handle ?? null, views: it.views == null ? null : parseCount(it.views) });
        if (++taken >= PER_PASS) break;
      }
      if (i === passes - 1) break;
      await scroll(page, { absorbed: chance(0.35) });
      await settle();
      const again = await checkWall(page);
      if (again && again !== "logged out") return { items: items(), stopped: again };
    }
    return { items: items(), stopped: null };
  } catch (error) {
    return { items: items(), stopped: `could not read the feed: ${error?.message ?? error}` };
  }
}

/** Runs in the page: every /video/ link with its handle and the visible count beside it. */
function readTikTok() {
  const out = [];
  const seen = new Set();
  for (const a of document.querySelectorAll('a[href*="/video/"]')) {
    const href = a.href || "";
    if (!/\/video\/\d+/.test(href) || seen.has(href)) continue;
    seen.add(href);
    const hm = /\/(@[\w.-]+)\/video\//.exec(href);
    let handle = hm ? hm[1] : null;
    // The card: the nearest ancestor that holds this link and little else.
    let card = a;
    for (let k = 0; k < 4 && card.parentElement; k++) {
      const p = card.parentElement;
      if (p.querySelectorAll('a[href*="/video/"]').length > 1) break;
      card = p;
    }
    const text = card.innerText || "";
    if (!handle) {
      const am = /(?<![\w.@-])(@[\w.-]{2,30})/.exec(text);
      handle = am ? am[1] : null;
    }
    let views = null;
    const named = card.querySelector('[data-e2e*="video-views"], [data-e2e*="views"], strong');
    if (named && /^\s*\d[\d.,]*\s*[KMB]?\s*$/i.test(named.textContent || "")) views = named.textContent.trim();
    if (!views) {
      const vm = /(?:^|\s)(\d[\d.,]*\s*[KMB]?)\s*(?:views?)?\s*$/im.exec(text) || /\b(\d[\d.,]*\s*[KMB])\b/i.exec(text);
      views = vm ? vm[1].trim() : null;
    }
    out.push({ url: href, handle, views });
    if (out.length >= 40) break;
  }
  return out;
}

/** Runs in the page: every /reel/ or /p/ link. Instagram shows no counts or handles on the grid. */
function readInstagram() {
  const out = [];
  const seen = new Set();
  for (const a of document.querySelectorAll('a[href*="/reel/"], a[href*="/p/"]')) {
    const href = a.href || "";
    if (!/\/(reel|p)\/[\w-]+/.test(href) || seen.has(href)) continue;
    seen.add(href);
    out.push({ url: href, handle: null, views: null });
    if (out.length >= 40) break;
  }
  return out;
}

/** TikTok's tag page: https://www.tiktok.com/tag/<tag> */
export function tiktokTag(page, tag, opts = {}) {
  const t = String(tag ?? "").replace(/^#/, "");
  if (!t) return Promise.resolve({ items: [], stopped: "no tag" });
  return feed(page, `https://www.tiktok.com/tag/${encodeURIComponent(t)}`, readTikTok, opts);
}

/** TikTok search: https://www.tiktok.com/search?q=… — same shape as the tag page. */
export function tiktokSearch(page, query, opts = {}) {
  const q = String(query ?? "").trim();
  if (!q) return Promise.resolve({ items: [], stopped: "no query" });
  return feed(page, `https://www.tiktok.com/search?q=${encodeURIComponent(q)}`, readTikTok, opts);
}

/** Instagram's tag page: https://www.instagram.com/explore/tags/<tag>/ */
export function instagramTag(page, tag, opts = {}) {
  const t = String(tag ?? "").replace(/^#/, "");
  if (!t) return Promise.resolve({ items: [], stopped: "no tag" });
  return feed(page, `https://www.instagram.com/explore/tags/${encodeURIComponent(t)}/`, readInstagram, opts);
}
