/*
 * The X (Twitter) sense. No paid X API (Alex, 2026-10-19). Two routes:
 *
 * 1. tweet(id): the public embed endpoint cdn.syndication.twimg.com/tweet-result
 *    answers one tweet by id without any login: text, favorite_count,
 *    conversation_count, created_at, user.screen_name, user.is_blue_verified.
 *    Proven from this container on 2026-10-19 (sample in
 *    test/fixtures/x/tweet-result-2026-10-19.json). It cannot search and has no
 *    follower counts. The coin's tweet id comes from GMGN (trending m_x,
 *    token_preview.twitter).
 *
 * 2. search(page, query): x.com/search in Alex's own signed-in Chrome, driven
 *    through ultracursor (the same browser layer as the TikTok and Instagram
 *    readers). It collects X's own SearchTimeline responses while the page
 *    loads and parses every tweet object in them; if none arrive it reads the
 *    tweet articles on the page. x.com search needs a signed-in session, so
 *    this route runs only where ultracursor's Chrome is open on his Mac; from
 *    a container it answers {wall: "login"} and the sense says "missing".
 *    The SearchTimeline shape below (tweet_results.result.legacy.full_text,
 *    core.user_results.result.legacy.followers_count) is X's GraphQL as it is
 *    widely documented, NOT verified here: x.com answers a login wall to a
 *    signed-out browser. The parser walks the whole JSON for anything shaped
 *    like a tweet, and `how` records which path matched, so the first live run
 *    on his Mac shows whether it holds (`diag` carries the page sample).
 */
const SYND = () => process.env.ULTRA_X_SYNDICATION || "https://cdn.syndication.twimg.com";

/** Tweet id and handle from GMGN's m_x / token_preview.twitter forms. */
export function parseXLink(s) {
  if (!s || typeof s !== "string") return null;
  const t = s.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, "").split("?")[0];
  const m = t.match(/^(?:([A-Za-z0-9_]{1,15})|i)\/status\/(\d{6,25})/);
  if (m) return { handle: m[1] || null, id: m[2] };
  const h = t.match(/^([A-Za-z0-9_]{1,15})\/?$/);
  if (h && !["i", "home", "search", "intent"].includes(h[1])) return { handle: h[1], id: null };
  if (/^i\/communities\/\d+/.test(t)) return { community: t, id: null };
  return null;
}

/** One tweet through the public embed. null when X has no such tweet; throws on network errors. */
export async function tweet(id, { fetchImpl = fetch } = {}) {
  const r = await fetchImpl(`${SYND()}/tweet-result?id=${encodeURIComponent(id)}&token=a`);
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error(`x tweet-result ${r.status}`);
  const j = await r.json();
  if (!j || j.__typename !== "Tweet") return null;
  return {
    id: j.id_str, text: j.text || "", likes: Number(j.favorite_count) || 0, replies: Number(j.conversation_count) || 0,
    createdAt: Date.parse(j.created_at) || null, author: j.user?.screen_name || null, blue: !!(j.user?.is_blue_verified || j.user?.verified),
    quoted: !!j.quoted_tweet,
  };
}

/** Every tweet-shaped object in an X GraphQL response (SearchTimeline and friends). */
export function parseTimeline(json) {
  const out = [];
  const seen = new Set();
  const walk = (o, depth) => {
    if (!o || typeof o !== "object" || depth > 40) return;
    if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
    const leg = o.legacy;
    if (leg && typeof leg.full_text === "string" && (o.rest_id || leg.id_str)) {
      const id = o.rest_id || leg.id_str;
      if (!seen.has(id)) {
        seen.add(id);
        const u = o.core?.user_results?.result;
        const ul = u?.legacy || {};
        out.push({
          id, text: leg.full_text, likes: Number(leg.favorite_count) || 0, replies: Number(leg.reply_count) || 0, reposts: Number(leg.retweet_count) || 0,
          createdAt: Date.parse(leg.created_at) || null,
          author: ul.screen_name || u?.core?.screen_name || null, followers: Number(ul.followers_count ?? ul.normal_followers_count) || 0,
          blue: !!(u?.is_blue_verified || ul.verified),
        });
      }
    }
    for (const k of Object.keys(o)) if (k !== "legacy" || !leg?.full_text) walk(o[k], depth + 1);
  };
  walk(json, 0);
  return out;
}

/** In the page: the tweet articles as they are drawn. */
function readArticles() {
  const out = [];
  for (const a of Array.from(document.querySelectorAll('article[data-testid="tweet"]'))) {
    const text = (a.querySelector('[data-testid="tweetText"]')?.innerText || "").trim();
    const time = a.querySelector("time")?.getAttribute("datetime") || null;
    const link = a.querySelector('a[href*="/status/"]')?.getAttribute("href") || "";
    const author = (link.match(/^\/([^/]+)\/status\//) || [])[1] || null;
    const blue = !!a.querySelector('[data-testid="icon-verified"]');
    const like = a.querySelector('[data-testid="like"]')?.getAttribute("aria-label") || "";
    out.push({ id: (link.match(/status\/(\d+)/) || [])[1] || null, text, createdAt: time ? Date.parse(time) : null, author, blue, likes: Number((like.match(/[\d,]+/) || ["0"])[0].replace(/,/g, "")) || 0, followers: null });
  }
  return out;
}

/**
 * Live X search in a signed-in Chrome page (ultracursor's browser layer).
 * site helpers are passed in so this module has no browser dependency.
 */
export async function search(page, query, { listen, visit, wall, diag, ctx = {} }) {
  const url = `${process.env.ULTRA_SITE_X || "https://x.com"}/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
  let err = null;
  const bodies = await listen(page, "SearchTimeline", async () => { err = await visit(page, url, ctx); try { await page.waitForTimeout(2500); } catch { /* closed */ } });
  if (err) return { tweets: [], how: null, error: err };
  let tweets = bodies.flatMap(parseTimeline), how = "graphql:SearchTimeline";
  if (!tweets.length) { try { tweets = await page.evaluate(readArticles); how = "dom:article[data-testid=tweet]"; } catch { tweets = []; } }
  const w = await wall(page, tweets.length > 0);
  return { tweets, how, wall: w, diag: tweets.length ? null : await diag(page, { bodies: bodies.length }) };
}

/** Sub-scores saturate at Fibonacci numbers. */
const sat = (x, k) => Math.max(0, Math.min(1, (Number(x) || 0) / k));

/**
 * The X source score 0-100 for one coin, or {score: null} when X gave nothing
 * (missing = the narrative sense says NO).
 *  - the coin's own tweet (embed): likes (sat 89), replies (sat 34), blue author, fresh (< 6 h)
 *  - live search (when the Chrome route is there): mentions in the last hour (sat 21),
 *    distinct authors (sat 13), share of blue authors, authors with >= 1,597 followers (sat 5)
 */
export function xScore({ own = null, found = null, now = Date.now() }) {
  const parts = {};
  if (own) {
    parts.likes = sat(own.likes, 89);
    parts.replies = sat(own.replies, 34);
    parts.blue = own.blue ? 1 : 0;
    parts.fresh = own.createdAt && now - own.createdAt < 6 * 3600_000 ? 1 : 0;
  }
  if (found && found.length) {
    const hour = found.filter((t) => t.createdAt && now - t.createdAt < 3600_000);
    parts.mentions1h = sat(hour.length, 21);
    parts.authors = sat(new Set(hour.map((t) => t.author)).size, 13);
    parts.blueShare = hour.length ? hour.filter((t) => t.blue).length / hour.length : 0;
    parts.bigAccounts = sat(hour.filter((t) => (t.followers || 0) >= 1597).length, 5);
  }
  const v = Object.values(parts);
  if (!v.length) return { score: null, parts };
  return { score: +(100 * v.reduce((s, x) => s + x, 0) / v.length).toFixed(1), parts };
}
