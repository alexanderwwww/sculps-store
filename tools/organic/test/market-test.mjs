/**
 * The research floor, against stubbed sites.
 *
 * No network here, so each site is a route handler serving markup shaped
 * the way the readers expect: Ad Library cards with "Started running on",
 * a TikTok tag page with /@handle/video/<id> links and "1.2M" counts, an
 * Instagram tag grid of /reel/ and /p/ links. The pure helpers are checked
 * with plain asserts first.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import {
  adLibrary, sellers, tiktokTag, tiktokSearch, instagramTag, termsFromBrief, parseCount, runningDays,
} from "../worker/market.mjs";

let bad = 0;
const ok = (n, good, extra = "") => {
  console.log(`${good ? "  ok  " : "FAIL  "}${n}${extra ? " — " + extra : ""}`);
  if (!good) bad++;
};

/* ------------------------------------------------------------- pure */

assert.equal(parseCount("1.2M"), 1200000);
assert.equal(parseCount("340.5K"), 340500);
assert.equal(parseCount("12,345"), 12345);
assert.equal(parseCount("7"), 7);
assert.equal(parseCount(" 2.1B views"), 2100000000);
assert.equal(parseCount("no number"), null);
assert.equal(parseCount(null), null);
ok("parseCount", true);

const terms = termsFromBrief({
  store: "Black Reaper",
  products: ["Halloween Projector", "Crawling Zombie", "Grim Reaper"],
  market: ["halloween decoration", "halloween animatronic", "Halloween Projector"],
  notes: "try #spookyseason and #HalloweenDecor, also #tag (too short) and #halloweendecor again",
});
assert.deepEqual(terms.queries, ["Halloween Projector", "Crawling Zombie", "Grim Reaper", "halloween decoration", "halloween animatronic"]);
assert.deepEqual(terms.tags, ["halloweenprojector", "crawlingzombie", "grimreaper", "halloweendecoration", "halloweenanimatronic", "spookyseason", "halloweendecor"]);
const many = termsFromBrief({ products: Array.from({ length: 30 }, (_, i) => `product number ${i}`) });
assert.equal(many.tags.length, 12);
assert.deepEqual(termsFromBrief({}), { queries: [], tags: [] });
ok("termsFromBrief", true);

const grouped = sellers([
  { advertiser: "Spooky Co", days: 12 },
  { advertiser: "Spooky Co", days: 50 },
  { advertiser: "Ghoul Goods", days: 31 },
  { advertiser: "Nameless", started: "Sep 1, 2026", days: null },
  { advertiser: "", days: 99 },
]);
assert.deepEqual(grouped.map((s) => s.advertiser), ["Spooky Co", "Ghoul Goods", "Nameless"]);
assert.deepEqual(grouped[0], { advertiser: "Spooky Co", ads: 2, longestDays: 50 });
assert.equal(grouped[2].ads, 1);
ok("sellers", true);

const now = new Date("2026-09-21T12:00:00Z");
assert.equal(runningDays("Aug 2, 2026", now), 50);
assert.equal(runningDays("Started running on Aug 2, 2026 · Total active time 3 hrs", now), 50);
assert.equal(runningDays("someday", now), null);
assert.equal(runningDays(null, now), null);
ok("runningDays", true);

/* ------------------------------------------------------------ stubs */

const html = (body) => `<!doctype html><html><head><meta charset="utf-8"><title>stub</title></head><body>${body}</body></html>`;

const card = (name, started, id) =>
  `<div role="article"><div>Sponsored</div><div>${name}</div><div>Library ID: ${id}</div>` +
  `<div>Started running on ${started} · Total active time 3 hrs</div>` +
  `<img src="https://cdn.test/${id}.jpg"><p>The best ${name} deal for spooky season, ad ${id}.</p></div>`;

const tiktokVideo = (handle, id, views) =>
  `<div class="card"><a href="https://www.tiktok.com/${handle}/video/${id}"><img alt=""></a>` +
  `<div><strong data-e2e="video-views">${views}</strong></div><p>${handle}</p></div>`;

const SITES = [
  {
    match: (u) => u.hostname.endsWith("facebook.com") && u.pathname.startsWith("/ads/library"),
    body: (u) => {
      if (u.searchParams.get("q") === "walled") return html('<div><p>We use cookies to help personalise content.</p><button>Allow all cookies</button></div>');
      return html(
        "<div>Ad Library</div>" +
          card("Spooky Co", "Aug 2, 2026", "1001") +
          card("Spooky Co", "Aug 2, 2026", "1002") +
          card("Ghoul Goods", "Aug 2, 2026", "1003") +
          '<div role="article"><div>Not an ad card at all</div></div>',
      );
    },
  },
  {
    match: (u) => u.hostname.endsWith("tiktok.com") && (u.pathname.startsWith("/tag/") || u.pathname.startsWith("/search")),
    body: () =>
      html(
        '<a href="/login">Log in</a><a href="/upload">Upload</a>' +
          tiktokVideo("@spooky.home", "7001", "1.2M") +
          tiktokVideo("@grim_reaper", "7002", "340.5K") +
          tiktokVideo("@spooky.home", "7003", "12,345") +
          tiktokVideo("@spooky.home", "7001", "1.2M") + // a duplicate
          '<div class="card"><a href="https://www.tiktok.com/@nocount/video/7004"></a></div>',
      ),
  },
  {
    match: (u) => u.hostname.endsWith("instagram.com") && u.pathname.startsWith("/explore/tags/"),
    body: () =>
      html(
        '<a href="/explore/">Explore</a>' +
          '<a href="/reel/C1abc/"><img></a><a href="/reel/C2def/"><img></a><a href="/p/C3ghi/"><img></a><a href="/reel/C1abc/"><img></a>',
      ),
  },
];

async function serve(route) {
  const u = new URL(route.request().url());
  const site = SITES.find((s) => s.match(u));
  if (!site) return route.fulfill({ status: 404, contentType: "text/html", body: html("no stub for " + u.href) });
  return route.fulfill({ contentType: "text/html", body: site.body(u) });
}

const browser = await chromium.launch({
  executablePath: process.env.ORGANIC_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.route("**/*", serve);
const page = await ctx.newPage();

/* Ad Library */
const lib = await adLibrary(page, { query: "halloween projector", limit: 3 });
ok("adLibrary: not stopped", lib.stopped === null, String(lib.stopped));
ok("adLibrary: 3 ads", lib.ads.length === 3, String(lib.ads.length));
const expectDays = runningDays("Aug 2, 2026", new Date());
ok("adLibrary: days since Aug 2, 2026", lib.ads.every((a) => a.days === expectDays), `${lib.ads.map((a) => a.days)} (expected ${expectDays}, ≈ 50 on 2026-09-21)`);
ok("adLibrary: started is the date only", lib.ads.every((a) => a.started === "Aug 2, 2026"), JSON.stringify(lib.ads.map((a) => a.started)));
ok("adLibrary: advertiser is the first non-Sponsored line", lib.ads.map((a) => a.advertiser).join(",") === "Spooky Co,Spooky Co,Ghoul Goods", JSON.stringify(lib.ads.map((a) => a.advertiser)));
ok("adLibrary: images read", lib.ads.every((a) => /cdn\.test\/\d+\.jpg/.test(a.img ?? "")), JSON.stringify(lib.ads.map((a) => a.img)));
ok("adLibrary: page stays on the library", /facebook\.com\/ads\/library/.test(page.url()), page.url());
const grp = sellers(lib.ads);
ok("sellers groups the ads", grp.length === 2 && grp[0].advertiser === "Spooky Co" && grp[0].ads === 2 && grp[0].longestDays === expectDays, JSON.stringify(grp));

const walled = await adLibrary(page, { query: "walled", limit: 3 });
ok("adLibrary: a cookie wall is a stop, not an empty list", walled.stopped === "cookie wall" && walled.ads.length === 0, JSON.stringify(walled));

/* TikTok tag */
const tt = await tiktokTag(page, "halloweendecor", { passes: 2 });
ok("tiktokTag: not stopped by the Log in link", tt.stopped === null, String(tt.stopped));
ok("tiktokTag: deduped video links", tt.items.length === 4, JSON.stringify(tt.items.map((i) => i.url)));
const byId = Object.fromEntries(tt.items.map((i) => [/video\/(\d+)/.exec(i.url)[1], i]));
ok("tiktokTag: handles from the link", byId["7001"]?.handle === "@spooky.home" && byId["7002"]?.handle === "@grim_reaper", JSON.stringify(tt.items.map((i) => i.handle)));
ok("tiktokTag: views parsed", byId["7001"]?.views === 1200000 && byId["7002"]?.views === 340500 && byId["7003"]?.views === 12345, JSON.stringify(tt.items.map((i) => i.views)));
ok("tiktokTag: no count → null", byId["7004"]?.views === null && byId["7004"]?.handle === "@nocount", JSON.stringify(byId["7004"]));

/* TikTok search */
const ts = await tiktokSearch(page, "halloween projector", { passes: 1 });
ok("tiktokSearch: same shape", ts.stopped === null && ts.items.length === 4 && ts.items[0].handle === "@spooky.home", JSON.stringify(ts).slice(0, 200));
ok("tiktokSearch: went to /search?q=", /tiktok\.com\/search\?q=halloween%20projector/.test(page.url()), page.url());

/* Instagram tag */
const ig = await instagramTag(page, "halloweendecor", { passes: 1 });
ok("instagramTag: not stopped", ig.stopped === null, String(ig.stopped));
ok("instagramTag: reel and post links, deduped", ig.items.length === 3 && ig.items.every((i) => /\/(reel|p)\//.test(i.url)), JSON.stringify(ig.items.map((i) => i.url)));
ok("instagramTag: handle and views are null", ig.items.every((i) => i.handle === null && i.views === null));

/* Never throws. */
const empty = await tiktokTag(page, "", { passes: 1 });
ok("an empty tag is a stop", empty.stopped === "no tag" && empty.items.length === 0);
await page.close();
const gone = await adLibrary(page, { query: "x", limit: 1 });
ok("a closed page comes back as stopped, not a throw", typeof gone.stopped === "string" && gone.ads.length === 0, gone.stopped);
const goneTag = await tiktokTag(page, "x", { passes: 1 });
ok("...for the feeds too", typeof goneTag.stopped === "string" && goneTag.items.length === 0, goneTag.stopped);

await browser.close();
console.log(bad ? `\n${bad} failed` : "\nall passed");
process.exit(bad ? 1 : 0);
