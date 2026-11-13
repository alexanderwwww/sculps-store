/*
 * TikTok video search -> the top clips -> their comments. Read-only.
 *
 * Clips are found by URL shape (a[href*="/video/"]: /@author/video/<id>).
 * Views on the search grid: [data-e2e="video-views"] inside the link, else the
 * first count-looking text in it.
 * On a clip page the numbers come from the page's own JSON first
 * (#__UNIVERSAL_DATA_FOR_REHYDRATION__ -> itemStruct.stats), else
 * [data-e2e="like-count"|"comment-count"].
 * Comments come from the page's own comment requests (/api/comment/list ->
 * comments[].text) first, else [data-e2e^="comment-level-1"] / comment text
 * nodes. `how` records which path matched.
 */
import { SITES, visit, wall, diag, readDown, breathe, say, listen, errorOf } from "./common.mjs";
import { count } from "../parse.mjs";
import { find } from "../signals.mjs";

export const urlFor = (q) => `${SITES.tiktok()}/search/video?q=${encodeURIComponent(q)}`;

function readGrid() {
  const seen = new Set();
  const out = [];
  let how = "href:/video/";
  for (const a of Array.from(document.querySelectorAll('a[href*="/video/"]'))) {
    const href = a.href.split("?")[0];
    if (seen.has(href)) continue;
    seen.add(href);
    const author = (href.match(/\/@([^/]+)\/video\//) || [])[1] || null;
    const v = a.querySelector('[data-e2e="video-views"]');
    let views = v ? v.innerText : null;
    if (v) how = "data-e2e:video-views";
    if (!views) views = ((a.innerText || "").match(/\d[\d.,]*\s*[KMB]?/i) || [])[0] || null;
    // The caption sits next to the link in a card; take the nearest text block.
    const card = a.closest('[data-e2e="search_video-item"], [class*="DivItemContainer"], li, article') || a.parentElement;
    const cap = card ? card.querySelector('[data-e2e="search-card-video-caption"], [data-e2e="search-card-desc"]') : null;
    const caption = ((cap && cap.innerText) || (card && card.innerText) || "").replace(/\s+/g, " ").trim().slice(0, 200);
    out.push({ url: href, author, views, caption });
  }
  return { clips: out, how };
}

function readClipPage() {
  let stats = null, how = null;
  const s = document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
  if (s) {
    try {
      const j = JSON.parse(s.textContent);
      const item = j?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;
      if (item && item.stats) {
        stats = { views: item.stats.playCount ?? null, likes: item.stats.diggCount ?? null, comments: item.stats.commentCount ?? null, caption: item.desc || "" };
        how = "json:rehydration";
      }
    } catch { /* fall through */ }
  }
  if (!stats) {
    const t = (sel) => { const e = document.querySelector(sel); return e ? e.innerText : null; };
    stats = { views: null, likes: t('[data-e2e="like-count"]'), comments: t('[data-e2e="comment-count"]'), caption: t('[data-e2e="browse-video-desc"]') || "" };
    how = "data-e2e:counts";
  }
  let nodes = Array.from(document.querySelectorAll('[data-e2e^="comment-level-1"], [data-e2e="comment-text"]'));
  let chow = "data-e2e:comment-level-1";
  if (!nodes.length) {
    nodes = Array.from(document.querySelectorAll('[class*="CommentText"], [class*="comment-text"], [class*="CommentItem"] p'));
    chow = "class:*CommentText";
  }
  const comments = nodes.map((n) => (n.innerText || "").trim()).filter(Boolean);
  return { stats, how, comments, chow };
}

export async function sweep(page, input, ctx) {
  const query = typeof input === "string" ? input : input.query;
  const lim = Object.assign({ clips: 3, comments: 40 }, ctx.limits || {});
  const url = urlFor(query);
  const out = { source: "tiktok", query, url, blocked: null, clips: [], signalCount: 0, how: {}, diag: null };
  try {
    await say(page, ctx, `TikTok · searching "${query}"`);
    const err = await visit(page, url, ctx);
    if (err) { out.blocked = err; out.diag = await diag(page); return out; }
    await breathe(ctx);
    await readDown(page, ctx, 2);
    const grid = await page.evaluate(readGrid).catch(() => ({ clips: [], how: null }));
    out.how.grid = grid.how;
    const w = await wall(page, grid.clips.length > 0);
    if (w || !grid.clips.length) {
      out.blocked = w || "empty";
      out.diag = await diag(page, { clips: 0 });
      ctx.log && ctx.log(w === "login" ? "TikTok wants a sign-in — sign in once in the ultracursor Chrome window" : `TikTok "${query}": ${out.blocked}`);
      return out;
    }
    const picked = grid.clips
      .map((c) => ({ ...c, views: count(c.views) }))
      .sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
    // Every clip in the grid is kept (url, author, views); the top N are opened.
    out.clips = picked.map((c) => ({ url: c.url, author: c.author, views: c.views, likes: null, comments: null, caption: c.caption, commentsRead: 0, signals: [] }));
    for (const clip of out.clips.slice(0, lim.clips)) {
      if (ctx.shouldStop && ctx.shouldStop()) break;
      await say(page, ctx, `TikTok · opening a clip by @${clip.author || "?"}`);
      try {
        const link = page.locator(`a[href^="${clip.url}"]`).first();
        if ((await link.count()) && ctx.ui && ctx.ui.hover) await ctx.ui.hover(page, link);
      } catch { /* ignore */ }
      let fromApi = [];
      const bodies = await listen(page, "/api/comment/list", async () => {
        const e = await visit(page, clip.url, ctx);
        if (e) return;
        await breathe(ctx, 800, 1800);
        for (let i = 0; i < 3; i++) {
          if (ctx.shouldStop && ctx.shouldStop()) break;
          await readDown(page, ctx, 1);
          await say(page, ctx, `TikTok · reading comments`);
        }
      });
      for (const b of bodies) for (const c of (b && b.comments) || []) if (c && c.text) fromApi.push(String(c.text));
      const pageRead = await page.evaluate(readClipPage).catch(() => null);
      const comments = (fromApi.length ? fromApi : (pageRead ? pageRead.comments : [])).slice(0, lim.comments);
      out.how.comments = fromApi.length ? "network:/api/comment/list" : pageRead ? pageRead.chow : null;
      if (pageRead && pageRead.stats) {
        out.how.stats = pageRead.how;
        clip.views = count(pageRead.stats.views) ?? clip.views;
        clip.likes = count(pageRead.stats.likes);
        clip.comments = count(pageRead.stats.comments);
        if (pageRead.stats.caption) clip.caption = String(pageRead.stats.caption).slice(0, 200);
      }
      clip.commentsRead = comments.length;
      clip.signals = find(comments);
      out.signalCount += clip.signals.length;
      await say(page, ctx, `TikTok · read ${comments.length} comments · ${out.signalCount} buying signals`);
      ctx.log && ctx.log(`TikTok clip ${clip.url}: ${comments.length} comments, ${clip.signals.length} signals`);
      if (!comments.length) {
        const w2 = await wall(page, false);
        if (w2) { out.blocked = w2; break; }
      }
      await breathe(ctx);
    }
    out.diag = await diag(page, { clips: out.clips.length, opened: Math.min(lim.clips, out.clips.length) });
  } catch (e) {
    out.blocked = out.blocked || errorOf(e);
    out.diag = await diag(page).catch(() => null);
  }
  return out;
}
