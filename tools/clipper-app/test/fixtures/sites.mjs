/*
 * Local stand-ins for the five sites, built to the structure SPEC.md names
 * (and nothing the readers could only match by luck):
 *
 *   /fb/ads/library/?q=…        Ad Library cards: "Library ID: …", "Started running on …",
 *                               advertiser page link, l.facebook.com-style l.php?u= landing
 *   /tt/search/video?q=…        TikTok grid of /@author/video/<id> links with data-e2e views
 *   /tt/@a/video/<id>           clip page: rehydration JSON stats; comments either fetched
 *                               from /tt/api/comment/list (id ending 1) or in the DOM
 *   /ig/explore/tags/<tag>/     grid of /p/<id>/ links; tag "stickerprinter" -> login wall
 *   /ig/p/<id>/                 post: article > ul > li > span[dir=auto] comments, "N likes"
 *   /gt/trends/explore?q=…      fetches /gt/trends/api/widgetdata/multiline (")]}'," prefix)
 *   store server: /             "Free shipping on orders over $35", /products.json
 *
 * Dates on the ads are computed from `today` so "days running" is checkable.
 */
import http from "node:http";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const daysAgo = (n, now) => { const d = new Date(now - n * 86400000); return { us: `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`, eu: `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}` }; };

const page = (title, body, extra = "") => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:15px Helvetica,Arial,sans-serif;margin:0;padding:20px;background:#fff;color:#111}.card{border:1px solid #ddd;border-radius:10px;padding:14px;margin:12px 0;max-width:620px}
.grid{display:grid;grid-template-columns:repeat(4,180px);gap:12px}.grid a{display:block;height:260px;background:#eee;border-radius:8px;padding:8px;color:#111}
li{margin:6px 0}</style>${extra}</head><body>${body}<div style="height:1600px"></div></body></html>`;

export const COMMENTS = {
  network: ["where can i buy this??", "how much is it", "just ordered mine 😍", "cute", "lol", "need the link", "i need this", "wow"],
  dom: ["Getting this for my mom for christmas gift", "take my money", "nice", "where did you get it", "ok", "price?"],
  ig: ["link please?", "so pretty", "I bought 2 last week", "😍😍", "where can I get one", "love it"],
};

export function startSites(storePort) {
  const now = Date.now();
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const send = (body, type = "text/html; charset=utf-8", code = 200, headers = {}) => { res.writeHead(code, { "content-type": type, ...headers }); res.end(body); };
    const p = u.pathname;
    const origin = `http://${req.headers.host}`;

    if (p === "/fb/ads/library/") {
      const q = u.searchParams.get("q") || "";
      const ads = [
        { who: "Glow Studio", page: "glowstudio", id: "1234567890123", d: daysAgo(45, now).us, txt: `Overnight curls, no heat. ${q} — 50% off today` },
        { who: "Curl Club", page: "curlclub", id: "2234567890123", d: daysAgo(12, now).eu, txt: `New ${q}. Ships free over $35.` },
        { who: "Glow Studio", page: "glowstudio", id: "3234567890123", d: daysAgo(30, now).us, txt: `The ${q} everyone is talking about.` },
      ];
      return send(page("Ad Library", `<h1>Ad Library</h1><a href="/login">Log in</a>` + ads.map((a) => `
        <div class="card"><div><a href="https://www.facebook.com/${a.page}">${a.who}</a></div><div>Sponsored</div>
        <div>Active</div><div>Library ID: ${a.id}</div><div>Started running on ${a.d}</div>
        <p>${esc(a.txt)}</p><a href="${origin}/fb/l.php?u=${encodeURIComponent(`http://127.0.0.1:${storePort}/products/x`)}">Shop now</a>
        <a href="https://www.amazon.com/dp/B000">Amazon</a></div>`).join("")));
    }
    if (p === "/tt/search/video") {
      const q = u.searchParams.get("q") || "";
      const items = [["glowgirl", "7000000000000000001", "1.2M"], ["curlqueen", "7000000000000000002", "345.6K"], ["randomuser", "7000000000000000003", "4,512"], ["another", "7000000000000000004", "980"]];
      return send(page("TikTok search", `<h2>${esc(q)}</h2><div class="grid">` + items.map(([a, id, v]) =>
        `<div data-e2e="search_video-item"><a href="${origin}/tt/@${a}/video/${id}"><strong data-e2e="video-views">${v}</strong></a><div data-e2e="search-card-video-caption">${esc(q)} by ${a} #fyp</div></div>`).join("") + `</div>`));
    }
    let m = /^\/tt\/@([^/]+)\/video\/(\d+)$/.exec(p);
    if (m) {
      const [, author, id] = m;
      const viaNet = id.endsWith("1");
      const stats = { playCount: viaNet ? 1250000 : 340000, diggCount: 88000, commentCount: 1300 };
      const json = JSON.stringify({ __DEFAULT_SCOPE__: { "webapp.video-detail": { itemInfo: { itemStruct: { desc: `clip by ${author}`, stats } } } } });
      const domComments = viaNet ? "" : COMMENTS.dom.map((c) => `<div data-e2e="comment-level-1"><p>${esc(c)}</p></div>`).join("");
      const script = viaNet ? `<script>fetch("/tt/api/comment/list/?aweme_id=${id}").then(r=>r.json()).then(j=>{const d=document.getElementById("c");j.comments.forEach(c=>{const p=document.createElement("p");p.textContent=c.text;d.appendChild(p);});});</script>` : "";
      return send(page(`@${author}`, `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${json}</script><h3>@${esc(author)}</h3><div id="c">${domComments}</div>${script}`));
    }
    if (p.startsWith("/tt/api/comment/list")) return send(JSON.stringify({ comments: COMMENTS.network.map((text) => ({ text })) }), "application/json");
    m = /^\/ig\/explore\/tags\/([^/]+)\/$/.exec(p);
    if (m) {
      if (m[1] === "stickerprinter") return send("", "text/html", 302, { location: "/ig/accounts/login/?next=" + encodeURIComponent(p) });
      return send(page(`#${m[1]}`, `<h2>#${esc(m[1])}</h2><div class="grid"><a href="/ig/p/AAA111/">post</a><a href="/ig/p/BBB222/">post</a><a href="/ig/reel/CCC333/">reel</a></div>`));
    }
    if (p.startsWith("/ig/accounts/login")) return send(page("Login • Instagram", `<h2>Log in to Instagram</h2><form><input placeholder="Phone number, username, or email"><button>Log in</button></form>`));
    m = /^\/ig\/(p|reel)\/([^/]+)\/$/.exec(p);
    if (m) return send(page("Instagram post", `<main><article><div>2,431 likes</div><ul>${COMMENTS.ig.map((c) => `<li><span dir="auto">${esc(c)}</span> <span>Reply</span></li>`).join("")}</ul></article></main>`));
    if (p === "/gt/trends/explore") {
      return send(page("Google Trends", `<h2>Interest over time</h2><div id="chart">loading</div><script>fetch("/gt/trends/api/widgetdata/multiline?req=1&geo=US").then(r=>r.text()).then(t=>{document.getElementById("chart").textContent="ok "+t.length;});</script>`));
    }
    if (p === "/gt/trends/api/widgetdata/multiline") {
      const start = Math.floor(now / 1000) - 52 * 7 * 86400;
      // 44 weeks at ~40, then 4 at 50, then 4 at 75 -> growth4w = +50%, yoy = (75-40)/40 = +88%
      const rows = Array.from({ length: 52 }, (_, i) => ({ time: String(start + i * 7 * 86400), value: [i >= 48 ? 75 : i >= 44 ? 50 : 40] }));
      rows[47].value = [50]; rows[30].value = [40];
      return send(")]}',\n" + JSON.stringify({ default: { timelineData: rows } }), "application/json");
    }
    if (p === "/fb/l.php") return send("redirect", "text/plain");
    send("not here", "text/plain", 404);
  });

  const store = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/products.json") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ products: [
        { title: "Satin Heatless Curling Set", handle: "satin-set", variants: [{ title: "Pink", price: "24.99", compare_at_price: "39.99" }, { title: "Black", price: "24.99", compare_at_price: null }] },
        { title: "Heatless Curler", handle: "curler", variants: [{ title: "Buy 2 save 20%", price: "39.98", compare_at_price: "59.98" }] },
        { title: "Silk Scrunchie", handle: "scrunchie", variants: [{ title: "Default", price: "9.00" }] },
      ] }));
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(page("Curl Shop", `<header>Free shipping on orders over $35</header><h1>Curl Shop</h1><a href="/products/satin-set">Satin set</a>`));
  });
  return { server, store };
}
