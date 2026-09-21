/**
 * The store reader and discovery, against a stubbed storefront.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readStore } from "../worker/store.mjs";
import { expandTerms, relatedTags, rankTags } from "../worker/discover.mjs";

let bad = 0;
const ok = (n, good, extra = "") => { console.log(`${good ? "  ok  " : "FAIL  "}${n}${extra ? " — " + extra : ""}`); if (!good) bad++; };

/* pure */
const terms = expandTerms(
  [{ title: "Haunted Window Projector — Black Reaper" }, { title: "Crawling Zombie" }, { title: "12 ft Grim Reaper" }],
  { market: ["halloween decoration"], notes: "#spookyseason" },
);
assert.deepEqual(terms.queries, ["Haunted Window Projector", "Crawling Zombie", "12 ft Grim Reaper", "halloween decoration"]);
assert.ok(terms.tags.includes("hauntedwindowprojector") && terms.tags.includes("projector") && terms.tags.includes("zombie") && terms.tags.includes("reaper") && terms.tags.includes("spookyseason"));
assert.ok(!terms.tags.includes("12ft") && !terms.tags.includes("with"));
ok("expandTerms", true, JSON.stringify(terms.tags));
const ranked = rankTags([{ tag: "#Zombie", views: 100 }, { tag: "halloween", views: 5000 }, { tag: "zombie", views: 200 }]);
assert.deepEqual(ranked.map((r) => r.tag), ["halloween", "zombie"]);
assert.equal(ranked[1].views, 300);
ok("rankTags", true);

/* stubbed store */
const pages = {
  "/": `<html><head><title>Black Reaper</title></head><body><a href="/collections/all">Shop</a><a href="/pages/faq">FAQ</a></body></html>`,
  "/collections/all": `<html><body><a href="/products/haunted-projector">P</a><a href="/products/crawling-zombie">Z</a><a href="/products/crawling-zombie?variant=1">Z2</a></body></html>`,
  "/products/haunted-projector": `<html><head><meta property="og:title" content="Haunted Window Projector"><meta property="og:image" content="https://store.test/media/hp.webp"><meta property="product:price:amount" content="149.99"></head><body><h1>x</h1></body></html>`,
  "/products/crawling-zombie": `<html><head><title>Crawling Zombie – Black Reaper</title></head><body><h1>Crawling Zombie</h1><div class="price">$99.99</div><img src="https://store.test/media/z.webp"></body></html>`,
  "/tag/zombie": `<html><body><a href="/tag/halloween">#halloween</a><a href="/tag/halloween">#halloween</a><a href="/tag/animatronic">#animatronic</a><p>#spookyszn #zombie</p></body></html>`,
};
const browser = await chromium.launch({ executablePath: process.env.OX_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext();
await ctx.route("**/*", (r) => {
  const u = new URL(r.request().url());
  const body = pages[u.pathname];
  return body ? r.fulfill({ contentType: "text/html", body }) : r.fulfill({ status: 404, body: "no" });
});
const page = await ctx.newPage();

const r = await readStore(page, "https://store.test/");
ok("readStore: not stopped", r.stopped === null, String(r.stopped));
ok("readStore: two products (variant link deduped by page)", r.products.length === 2, JSON.stringify(r.products.map((p) => p.title)));
const hp = r.products.find((p) => p.title === "Haunted Window Projector");
ok("readStore: og title/price/image", hp && hp.price === "149.99" && hp.image.endsWith("hp.webp"), JSON.stringify(hp));
const cz = r.products.find((p) => p.title.startsWith("Crawling Zombie"));
ok("readStore: h1 + price text + img", cz && cz.price === "$99.99" && cz.image.endsWith("z.webp"), JSON.stringify(cz));
const none = await readStore(page, "https://store.test/nothing-here");
ok("readStore: an empty page is a stop", none.stopped != null, String(none.stopped));

await page.goto("https://store.test/tag/zombie");
const rel = await relatedTags(page, { except: ["zombie"] });
ok("relatedTags: linked tags first, current tag excluded", rel[0] === "halloween" && rel.includes("animatronic") && rel.includes("spookyszn") && !rel.includes("zombie"), JSON.stringify(rel));

await browser.close();
console.log(bad ? `\n${bad} FAILED` : "\nall passed");
process.exit(bad ? 1 : 0);
