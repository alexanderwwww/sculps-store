/*
 * Meta Ad Library, active US ads for a keyword. Read-only.
 *
 * Cards are found by their own words, not class names: every ad card says
 * "Library ID: <digits>" and "Started running on <date>". The card is the
 * smallest block that holds exactly one "Library ID". Inside it: the first
 * link to a Facebook page is the advertiser; an l.facebook.com/l.php?u= link
 * (or any outside link) is the landing page.
 */
import { SITES, visit, wall, diag, readDown, breathe, say, hoverFirst, errorOf } from "./common.mjs";
import { startedOn, daysSince } from "../parse.mjs";

export const urlFor = (q) =>
  `${SITES.adlibrary()}/ads/library/?active_status=active&ad_type=all&country=US&q=${encodeURIComponent(q)}&search_type=keyword_unordered&media_type=all`;

/** l.facebook.com/l.php?u=<real> -> real; anything else as is. */
export function unwrap(href) {
  if (!href) return null;
  try {
    const u = new URL(href);
    if (/(^|\.)l\.facebook\.com$/.test(u.hostname) || /\/l\.php$/.test(u.pathname)) return u.searchParams.get("u") || null;
    return u.href;
  } catch { return null; }
}

function readCards() {
  const n = (el) => ((el && el.innerText) || "").match(/Library ID/gi)?.length || 0;
  // A card is the outermost block holding exactly one "Library ID".
  const grown = Array.from(document.querySelectorAll("body *")).filter((el) =>
    n(el) === 1 && (!el.parentElement || el.parentElement === document.body || n(el.parentElement) > 1));
  const seen = new Set();
  const out = [];
  for (const el of grown) {
    const t = el.innerText || "";
    const id = (t.match(/Library ID:?\s*(\d{5,})/i) || [])[1] || null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const links = Array.from(el.querySelectorAll("a[href]")).map((a) => ({ href: a.href, text: (a.innerText || "").trim() }));
    const page = links.find((l) => /facebook\.com\/(?!ads\/|l\.php)[^?#]+/.test(l.href) && l.text && !/library|see ad|details/i.test(l.text));
    const landing = links.find((l) => /l\.facebook\.com\/l\.php|\/l\.php\?u=/.test(l.href)) || links.find((l) => !/facebook\.com|instagram\.com|fb\.me|meta\.com/.test(l.href) && /^https?:/.test(l.href));
    const started = (t.match(/Started running on[^\n]*/i) || [])[0] || null;
    const lines = t.split("\n").map((s) => s.trim()).filter(Boolean);
    const sponsored = lines.findIndex((l) => /^Sponsored$/i.test(l));
    const advertiser = page ? page.text : sponsored > 0 ? lines[sponsored - 1] : null;
    const body = lines.filter((l) => !/Library ID|Started running on|^Active$|^Sponsored$|See ad details|Platforms|This ad has multiple versions/i.test(l) && l !== advertiser).join(" ");
    out.push({ libraryId: id, advertiser, started, text: body.slice(0, 500), landing: landing ? landing.href : null });
  }
  return out;
}

export async function sweep(page, input, ctx) {
  const query = typeof input === "string" ? input : input.query;
  const url = urlFor(query);
  const out = { source: "adlibrary", query, url, blocked: null, ads: [], advertisers: 0, how: "text:Library ID", diag: null };
  try {
    await say(page, ctx, `Ad Library · ${query}`);
    const err = await visit(page, url, ctx);
    if (err) { out.blocked = err; out.diag = await diag(page); return out; }
    await breathe(ctx);
    await readDown(page, ctx, 4);
    await hoverFirst(page, ctx, "text=/Library ID/i");
    const raw = await page.evaluate(readCards).catch(() => []);
    const now = ctx.now ? ctx.now() : Date.now();
    out.ads = raw.map((a) => {
      const iso = startedOn(a.started);
      return { advertiser: a.advertiser || null, libraryId: a.libraryId, startedOn: iso, days: daysSince(iso, now), text: a.text, landing: unwrap(a.landing) };
    });
    out.advertisers = new Set(out.ads.map((a) => a.advertiser).filter(Boolean)).size;
    const w = await wall(page, out.ads.length > 0);
    if (w) out.blocked = w;
    else if (!out.ads.length) out.blocked = "empty";
    await say(page, ctx, `Ad Library · ${query} · ${out.ads.length} ads · ${out.advertisers} advertisers`);
    ctx.log && ctx.log(`Ad Library "${query}": ${out.ads.length} ads, ${out.advertisers} advertisers${out.blocked ? ` (${out.blocked})` : ""}`);
    out.diag = await diag(page, { ads: out.ads.length });
  } catch (e) {
    out.blocked = errorOf(e);
    out.diag = await diag(page).catch(() => null);
  }
  return out;
}
