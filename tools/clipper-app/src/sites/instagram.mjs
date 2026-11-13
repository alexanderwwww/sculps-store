/*
 * Instagram hashtag page -> the top posts -> their comments. Read-only.
 *
 * Posts by URL shape (a[href*="/p/"], a[href*="/reel/"]). On a post, comments
 * come from the page's own comment requests first (any response with
 * "/comments" in its URL holding comments[].text), else the visible comment
 * text (ul li span[dir="auto"] inside the post). Likes from text
 * ("1,234 likes"). `how` records which path matched.
 */
import { SITES, visit, wall, diag, readDown, breathe, say, listen, errorOf } from "./common.mjs";
import { count, tagFor } from "../parse.mjs";
import { find } from "../signals.mjs";

export const urlFor = (q) => `${SITES.instagram()}/explore/tags/${encodeURIComponent(tagFor(q))}/`;

function readGrid() {
  const seen = new Set();
  const out = [];
  for (const a of Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]'))) {
    const href = a.href.split("?")[0];
    if (!seen.has(href)) { seen.add(href); out.push(href); }
  }
  return out;
}

function readPost() {
  const root = document.querySelector("article") || document.querySelector("main") || document.body;
  let nodes = Array.from(root.querySelectorAll('ul li span[dir="auto"]'));
  let how = 'dom:ul li span[dir="auto"]';
  if (!nodes.length) { nodes = Array.from(root.querySelectorAll("ul li")); how = "dom:ul li"; }
  const comments = [];
  for (const n of nodes) {
    const t = (n.innerText || "").trim();
    if (t && t.length > 1 && !/^(reply|like|\d+[wdhm]|view replies.*|see translation)$/i.test(t) && !comments.includes(t)) comments.push(t);
  }
  const text = (document.body && document.body.innerText) || "";
  const likes = (text.match(/([\d.,]+\s*[KM]?)\s+likes?\b/i) || [])[1] || null;
  return { comments, how, likes };
}

export async function sweep(page, input, ctx) {
  const query = typeof input === "string" ? input : input.query;
  const tag = tagFor(query);
  const lim = Object.assign({ posts: 2, comments: 40 }, ctx.limits || {});
  const url = urlFor(query);
  const out = { source: "instagram", query, tag, url, blocked: null, posts: [], signalCount: 0, how: {}, diag: null };
  try {
    await say(page, ctx, `Instagram · #${tag}`);
    const err = await visit(page, url, ctx);
    if (err) { out.blocked = err; out.diag = await diag(page); return out; }
    await breathe(ctx);
    await readDown(page, ctx, 2);
    const links = await page.evaluate(readGrid).catch(() => []);
    out.how.grid = "href:/p/|/reel/";
    const w = await wall(page, links.length > 0);
    if (w || !links.length) {
      out.blocked = w || "empty";
      out.diag = await diag(page, { posts: 0 });
      ctx.log && ctx.log(w === "login" ? "Instagram wants a sign-in — sign in once in the ultracursor Chrome window" : `Instagram #${tag}: ${out.blocked}`);
      return out;
    }
    for (const href of links.slice(0, lim.posts)) {
      if (ctx.shouldStop && ctx.shouldStop()) break;
      try {
        const link = page.locator(`a[href*="${new URL(href).pathname}"]`).first();
        if ((await link.count()) && ctx.ui && ctx.ui.hover) await ctx.ui.hover(page, link);
      } catch { /* ignore */ }
      const api = [];
      const bodies = await listen(page, "/comments", async () => {
        const e = await visit(page, href, ctx);
        if (e) return;
        await breathe(ctx, 800, 1800);
        await say(page, ctx, `Instagram · reading comments`);
        await readDown(page, ctx, 2);
      });
      for (const b of bodies) for (const c of (b && b.comments) || []) if (c && c.text) api.push(String(c.text));
      const read = await page.evaluate(readPost).catch(() => null);
      const comments = (api.length ? api : read ? read.comments : []).slice(0, lim.comments);
      out.how.comments = api.length ? "network:/comments" : read ? read.how : null;
      const signals = find(comments);
      out.signalCount += signals.length;
      out.posts.push({ url: href, likes: count(read && read.likes), commentsRead: comments.length, signals });
      await say(page, ctx, `Instagram · read ${comments.length} comments · ${out.signalCount} buying signals`);
      ctx.log && ctx.log(`Instagram post ${href}: ${comments.length} comments, ${signals.length} signals`);
      if (!comments.length) {
        const w2 = await wall(page, false);
        if (w2) { out.blocked = w2; break; }
      }
      await breathe(ctx);
    }
    out.diag = await diag(page, { posts: out.posts.length, grid: links.length });
  } catch (e) {
    out.blocked = out.blocked || errorOf(e);
    out.diag = await diag(page).catch(() => null);
  }
  return out;
}
