/*
 * Thrift — a made-up second-hand fashion marketplace, served from memory, that the
 * browser agent's end-to-end test runs against.
 *
 * It is not any real site and copies no real site's markup. It has the same KINDS
 * of flows a resale marketplace has, built the way such sites are built, so an
 * agent that only reads the accessibility snapshot and acts on its refs has to do
 * the real work (a hidden file input behind a button, a custom listbox next to a
 * native <select>, a "$"-prefixed price field, a confirm dialog, a chat box where
 * Enter sends):
 *
 *   /                      home: header nav (Sell, Messages + unread count, My shop),
 *                          a search box, a grid of other sellers' items
 *   /login/?next=…         Email, Password, "Log in" (POST sets the session cookie)
 *   /sell/                 "Add photos" opens a hidden <input type=file multiple>;
 *                          thumbnails from the File objects; Description; native
 *                          Category <select>; CUSTOM Condition listbox; Size; Price;
 *                          Save draft / Post listing (multipart fetch with the real
 *                          files, inline errors, then /item/<id>/)
 *   /shop/                 my listings          /item/<id>/   item page, Edit listing
 *   /item/<id>/edit/       Price (prefilled), Save changes, Delete listing -> dialog
 *   /messages/             three threads, two unread
 *   /messages/<id>/        role=log history, "Write a message", Send (Enter sends)
 *   /checkout/<id>/        card fields and "Pay now", for other sellers' items
 *
 * Without the session cookie every page except home, search, the info pages and
 * /login/ redirects to /login/?next=…. With state.captcha on, every page except
 * /login/ is replaced by a "Verify you are human" interstitial with a
 * reCAPTCHA-style iframe; it reloads itself once the check is cleared, the way a
 * real challenge page hands back to the site.
 *
 * Realistic noise on purpose: a promo strip, category links, a footer, a cookie
 * banner with "Accept", decorative divs.
 *
 * Test control (never linked from a page):
 *   GET  /__test/state             listings (photos: name, size, type, sha256), edits,
 *                                  deletions, sent messages, threads, purchases, captcha
 *   POST /__test/reset             back to the seed (sessions are kept)
 *   POST /__test/captcha?on=1|0
 *   GET  /__test/login             sets the session cookie, redirects to "/"
 *   POST /__test/logout            drops every session
 *
 * Nothing leaves the machine. Uploaded images are hashed, never processed (the
 * bytes are kept only to show them back on the item page).
 */
import http from "node:http";
import crypto from "node:crypto";

export const CATEGORIES = ["Tops", "Bottoms", "Outerwear", "Accessories"];
export const CONDITIONS = ["Brand new", "Like new", "Used - Excellent", "Used - Good"];
const MAX_PHOTOS = 8;
const ME = "studio.resale";
const SID = "thrift_sid";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => `$${Number(n).toFixed(2)}`;
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const titleOf = (l) => {
  const first = String(l.description || "").split("\n")[0].trim();
  return first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first || "Untitled item";
};
const priceInput = (n) => (n == null ? "" : Number.isInteger(n) ? String(n) : n.toFixed(2));
/** "$1,250.5" / "45" / " 45.00 " -> number; anything else -> null. */
function parsePrice(v) {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100) / 100;
  return n > 0 && n <= 100000 ? n : null;
}
function ago(at, now = Date.now()) {
  const m = Math.max(0, Math.round((now - at) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

/* ------------------------------------------------------------------ seed */

function seed(now = Date.now()) {
  const H = 3600000, D = 24 * H;
  const L = (id, mine, seller, description, category, condition, size, brand, price, days, hue) => ({
    id, mine, seller, description, category, condition, size, brand, price, shipping: "label",
    photos: [], status: "live", priceHistory: [], createdAt: now - days * D, updatedAt: now - days * D, hue,
  });
  return {
    listings: [
      L("101", true, ME, "Levi's 501 '93 straight jeans\nMid wash, W30 L32. Light fading on the thighs, no rips or stains.", "Bottoms", "Used - Good", "W30 L32", "Levi's", 65, 9, 214),
      L("102", true, ME, "Arc'teryx Beta AR shell jacket\nBlack, Gore-Tex Pro. Worn one season, every seam taped and dry.", "Outerwear", "Used - Excellent", "M", "Arc'teryx", 220, 6, 200),
      L("103", true, ME, "Stüssy 8 Ball fleece hoodie\nCream, size L. Bought at Dover Street Market in 2021.", "Tops", "Like new", "L", "Stüssy", 95, 4, 38),
      L("201", false, "rosie.archive", "Vintage Burberry check scarf\nLambswool, classic nova check. No holes.", "Accessories", "Used - Excellent", "One size", "Burberry", 85, 2, 30),
      L("202", false, "kyoto.closet", "Issey Miyake Pleats Please trousers\nCharcoal, size 2. Pleats perfect.", "Bottoms", "Like new", "2", "Issey Miyake", 140, 3, 250),
      L("203", false, "nate.goods", "Carhartt Detroit jacket, brown duck\nBlanket lined. Nice fade on the collar.", "Outerwear", "Used - Good", "L", "Carhartt", 120, 5, 28),
      L("204", false, "lou.lou", "Ray-Ban Wayfarer sunglasses\nBlack frame, green G-15 lenses, with case.", "Accessories", "Like new", "One size", "Ray-Ban", 70, 1, 160),
      L("205", false, "fern.and.fable", "Patagonia Synchilla snap-T fleece\nForest green, 1990s, made in USA.", "Tops", "Used - Excellent", "M", "Patagonia", 58, 2, 120),
    ],
    threads: [
      { id: "t1", buyer: "maya.k", listing: "101", unread: true, messages: [
        { from: "them", text: "hiii is this still available?", at: now - 3 * H },
      ] },
      { id: "t2", buyer: "jdub.vintage", listing: "102", unread: true, messages: [
        { from: "them", text: "hey! love this jacket", at: now - 26 * H },
        { from: "them", text: "would you do 180?", at: now - 25 * H },
      ] },
      { id: "t3", buyer: "sam_r", listing: "103", unread: false, messages: [
        { from: "them", text: "is it real?", at: now - 3 * D },
        { from: "me", text: "100% authentic, bought it at Dover Street Market in 2021. Happy to send more photos.", at: now - 3 * D + 40 * 60000 },
        { from: "them", text: "ok cool, let me think about it", at: now - 3 * D + 95 * 60000 },
      ] },
    ],
    edits: [], deletions: [], sent: [], purchases: [], logins: [],
    captcha: false,
  };
}

/* ------------------------------------------------------------------ look */

const CSS = `
*{box-sizing:border-box}[hidden]{display:none!important}
html,body{margin:0}body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;background:#fff;color:#141414}
a{color:inherit}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
.skip{position:absolute;left:-9999px}.skip:focus{left:8px;top:8px;background:#fff;padding:8px;z-index:90}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.promo{background:#141414;color:#eee;font-size:13px;text-align:center;padding:7px 0}.promo a{color:#fff}
.top{border-bottom:1px solid #ececec;background:#fff;position:sticky;top:0;z-index:20}
.bar{display:flex;align-items:center;gap:24px;height:64px}
.logo{font-weight:800;font-size:22px;letter-spacing:-.03em;text-decoration:none;display:flex;align-items:center;gap:8px}
.logo .mark{width:22px;height:22px;border-radius:7px;background:conic-gradient(from 200deg,#ff5a36,#ffb03a,#ff5a36)}
.search{flex:1}.search input{width:100%;height:40px;border-radius:20px;border:1px solid #e2e2e2;background:#f6f6f6;padding:0 16px;font:inherit}
.nav{display:flex;align-items:center;gap:20px;font-weight:600;font-size:14px}.nav a{text-decoration:none}
.nav .pill{background:#141414;color:#fff;padding:9px 18px;border-radius:20px}
.badge{display:inline-block;min-width:18px;height:18px;border-radius:9px;background:#ff5a36;color:#fff;font-size:11px;line-height:18px;text-align:center;padding:0 5px;margin-left:3px;vertical-align:1px}
.cats nav{display:flex;gap:22px;font-size:13px;height:38px;align-items:center;color:#555}.cats a{text-decoration:none}
main.wrap{padding-top:28px;padding-bottom:70px;min-height:60vh}
h1{font-size:28px;letter-spacing:-.02em;line-height:1.2;margin:0 0 6px}h2{font-size:17px;margin:0 0 10px}
.muted{color:#6b6b6b}
button,.btn{font:600 14px/1 inherit;font-family:inherit;border-radius:22px;padding:12px 20px;border:1px solid #141414;background:#141414;color:#fff;cursor:pointer;text-decoration:none;display:inline-block}
button.ghost,.btn.ghost{background:#fff;color:#141414;border-color:#d6d6d6}
button:disabled{opacity:.4;cursor:default}
.danger{background:#c62828!important;border-color:#c62828!important;color:#fff!important}
.linkish{background:none;border:0;color:#c62828;padding:0;font-weight:600}
.hero{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;padding:6px 0 4px}
.grid{list-style:none;padding:0;margin:18px 0 0;display:grid;grid-template-columns:repeat(4,1fr);gap:20px}
.card a{display:flex;flex-direction:column;gap:5px;text-decoration:none}
.ph,.card img,.gallery img{width:100%;aspect-ratio:4/5;border-radius:12px;object-fit:cover;background:linear-gradient(160deg,hsl(var(--h,30) 45% 88%),hsl(var(--h,30) 30% 68%))}
.card .t{font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.card .p{font-weight:700}.card .s{color:#777;font-size:13px;margin-left:6px}
.foot{border-top:1px solid #ececec;background:#fafafa;font-size:13px;color:#555}.foot .wrap{display:flex;gap:40px;padding-top:28px;padding-bottom:34px}
.foot h2{font-size:13px;color:#141414}.foot ul{list-style:none;padding:0;margin:0;display:grid;gap:6px}.foot a{text-decoration:none}
.cookies{position:fixed;left:20px;bottom:20px;width:360px;background:#fff;border:1px solid #e4e4e4;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.14);padding:14px 18px;z-index:50;font-size:13px}
.cookies p{margin:0}.cookies .row{display:flex;justify-content:flex-end;align-items:center;gap:14px;margin-top:10px}
.deco{position:fixed;inset:0;pointer-events:none;z-index:-1;overflow:hidden}.blob{position:absolute;width:520px;height:520px;border-radius:50%;filter:blur(60px);opacity:.18}
.b1{right:-160px;top:120px;background:#ffd2b8}.b2{left:-200px;bottom:-200px;background:#e8e0ff}
.alert{background:#fff3f0;border:1px solid #ffc9bc;color:#9f2a12;border-radius:12px;padding:10px 14px;margin:0 0 16px;font-weight:600}
.ok{background:#f1f8f1;border:1px solid #cfe6cf;color:#245b24;border-radius:12px;padding:10px 14px;margin:0 0 16px;font-weight:600}
.ok:empty{display:none}
.err{color:#b3261e;font-size:13px;font-weight:600;margin:6px 0 0}
.sell{max-width:700px}.sec{border:1px solid #ececec;border-radius:16px;padding:18px 20px;margin:16px 0}
.f{margin:0 0 16px}.f:last-child{margin-bottom:0}.f label,.lab,legend{display:block;font-weight:600;font-size:14px;margin:0 0 6px}
.f.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
input[type=text],input[type=email],input[type=password],input:not([type]),textarea,select,.ddbtn{width:100%;font:inherit;border:1px solid #d9d9d9;border-radius:10px;padding:10px 12px;background:#fff;color:#141414}
textarea{resize:vertical}[aria-invalid=true]{border-color:#d93025!important}
.count{font-size:12px;color:#888;text-align:right}
.thumbs{list-style:none;padding:0;margin:0 0 12px;display:flex;gap:10px;flex-wrap:wrap}
.thumbs li{position:relative;width:104px}.thumbs img{width:104px;height:120px;object-fit:cover;border-radius:10px;background:#f2f2f2;display:block}
.thumbs .cap{display:block;font-size:11px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}
.thumbs .rm{position:absolute;top:4px;right:4px;width:24px;height:24px;padding:0;border-radius:12px;background:rgba(0,0,0,.65);border:0;font-size:15px;line-height:24px}
.thumbs .cover{position:absolute;left:4px;top:4px;background:#fff;border-radius:6px;font-size:10px;font-weight:700;padding:1px 6px}
.add{background:#fff;color:#141414;border:1.5px dashed #bdbdbd;border-radius:12px;padding:16px 22px}
.dd{position:relative}.ddbtn{text-align:left;font-weight:400;display:flex;justify-content:space-between;align-items:center}
.chev{width:8px;height:8px;border-right:2px solid #555;border-bottom:2px solid #555;transform:rotate(45deg);margin:-4px 4px 0}
.ddlist{position:absolute;left:0;right:0;top:calc(100% + 4px);list-style:none;margin:0;padding:6px;background:#fff;border:1px solid #e0e0e0;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.12);z-index:30}
.ddlist li{padding:9px 12px;border-radius:8px;cursor:pointer}.ddlist li.active{background:#f2f2f2}.ddlist li[aria-selected=true]{font-weight:700}
.money{display:flex;align-items:center;border:1px solid #d9d9d9;border-radius:10px;padding:0 0 0 12px;max-width:220px}
.money .cur{font-weight:700;color:#555}.money input{border:0;border-radius:10px}
fieldset{border:0;padding:0;margin:0}.radio{display:flex!important;gap:8px;align-items:center;font-weight:400!important}
.actions{display:flex;gap:12px;justify-content:flex-end;margin-top:18px}
.item{display:grid;grid-template-columns:1.1fr 1fr;gap:36px}.gallery{display:grid;gap:12px}
.price{font-size:26px;font-weight:800;margin:6px 0 14px}.facts{display:grid;grid-template-columns:110px 1fr;gap:6px 12px;margin:16px 0}.facts dt{color:#777}.facts dd{margin:0}
.desc{white-space:pre-line}.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.tabs{display:flex;gap:18px;border-bottom:1px solid #ececec;margin:18px 0 0}.tabs a{text-decoration:none;padding:10px 0;color:#777;font-weight:600}.tabs a[aria-current=page]{color:#141414;border-bottom:2px solid #141414}
.inbox{display:grid;grid-template-columns:320px 1fr;border:1px solid #ececec;border-radius:16px;min-height:520px;overflow:hidden}
.threads{list-style:none;margin:0;padding:0;border-right:1px solid #ececec}
.threads a{display:grid;grid-template-columns:40px 1fr auto;gap:2px 12px;padding:14px 16px;text-decoration:none;border-bottom:1px solid #f1f1f1}
.threads a[aria-current=page]{background:#f6f6f6}.threads .av{grid-row:span 2;width:40px;height:40px;border-radius:20px;background:hsl(var(--h) 40% 80%)}
.threads .who{font-weight:700}.threads .last{grid-column:2/4;color:#666;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.threads .unread .who::after{content:"";display:inline-block;width:8px;height:8px;border-radius:4px;background:#ff5a36;margin-left:8px;vertical-align:1px}
.threads .unread .last{color:#141414;font-weight:600}.threads time{font-size:12px;color:#999}
.convo{display:flex;flex-direction:column}.convo header{padding:14px 18px;border-bottom:1px solid #ececec;display:flex;justify-content:space-between;align-items:center}
.convo h1{font-size:18px;margin:0}.itemchip{font-size:13px;text-decoration:none;border:1px solid #e3e3e3;border-radius:20px;padding:6px 12px}
.log{flex:1;padding:18px;display:flex;flex-direction:column;gap:10px;overflow:auto;max-height:440px}
.msg{max-width:70%;padding:9px 14px;border-radius:18px;background:#f1f1f1}.msg p{margin:0}.msg time{display:block;font-size:11px;color:#888;margin-top:2px}
.msg.me{align-self:flex-end;background:#141414;color:#fff}.msg.me time{color:#bbb}
.composer{display:flex;gap:10px;padding:12px;border-top:1px solid #ececec;align-items:flex-end}.composer textarea{flex:1;min-height:44px}
.empty{display:flex;align-items:center;justify-content:center;color:#888}
.backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:60}
.dialog{background:#fff;border-radius:18px;padding:24px;width:400px;box-shadow:0 20px 60px rgba(0,0,0,.25)}.dialog h2{font-size:20px}
.narrow{max-width:420px;margin:30px auto}
`;

const COOKIE_BANNER = `
<section id="cookies" class="cookies" aria-label="Cookie consent">
  <p>We use cookies to keep you signed in and to see which features people use. <a href="/privacy/">Cookie policy</a></p>
  <div class="row"><a href="/privacy/">Manage</a><button type="button" id="cookie-accept">Accept</button></div>
</section>
<script>document.getElementById("cookie-accept").addEventListener("click",function(){document.cookie="thrift_cookies=accepted; path=/; max-age=31536000; samesite=lax";var b=document.getElementById("cookies");if(b)b.remove();});</script>`;

function layout(ctx, { title, body, script = "" }) {
  const { sess, unread, cookiesOk, q } = ctx;
  const nav = sess
    ? `<a href="/sell/" class="pill">Sell</a><a href="/messages/">Messages${unread ? ` <span class="badge" aria-label="${unread} unread">${unread}</span>` : ""}</a><a href="/shop/">My shop</a>`
    : `<a href="/sell/" class="pill">Sell</a><a href="/login/">Log in</a>`;
  const cats = ["Women", "Men", "Vintage", "Streetwear", "Y2K", "Designer"].map((c) => `<a href="/search/?q=${encodeURIComponent(c.toLowerCase())}">${c}</a>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Thrift</title><style>${CSS}</style></head><body>
<a class="skip" href="#main">Skip to content</a>
<div class="promo"><div class="wrap">Free shipping labels on your first three sales · <a href="/help/">How selling works</a></div></div>
<header class="top">
  <div class="wrap bar">
    <a class="logo" href="/" aria-label="Thrift home"><span class="mark" aria-hidden="true"></span>Thrift</a>
    <form class="search" role="search" action="/search/" method="get"><input type="search" name="q" aria-label="Search" placeholder="Search for items, brands or styles" value="${esc(q || "")}"></form>
    <nav class="nav" aria-label="Main">${nav}</nav>
  </div>
  <div class="wrap cats"><nav aria-label="Categories">${cats}</nav></div>
</header>
<main id="main" class="wrap">${body}</main>
<footer class="foot"><div class="wrap">
  <div><h2>Thrift</h2><ul><li><a href="/about/">About</a></li><li><a href="/about/">Careers</a></li><li><a href="/about/">Press</a></li></ul></div>
  <div><h2>Help</h2><ul><li><a href="/help/">Help centre</a></li><li><a href="/help/">Selling on Thrift</a></li><li><a href="/help/">Safety</a></li></ul></div>
  <div><h2>Legal</h2><ul><li><a href="/terms/">Terms</a></li><li><a href="/privacy/">Privacy</a></li><li><a href="/privacy/">Cookie settings</a></li></ul></div>
  <div class="muted" style="margin-left:auto">© 2026 Thrift Marketplace</div>
</div></footer>
<div class="deco" aria-hidden="true"><div class="blob b1"></div><div class="blob b2"></div></div>
${cookiesOk ? "" : COOKIE_BANNER}
${script ? `<script>${script}</script>` : ""}
</body></html>`;
}

const tile = (l, media) => (l.photos.length && media.has(l.id)
  ? `<img src="/media/${l.id}/0" alt="">`
  : `<div class="ph" style="--h:${l.hue ?? 30}" aria-hidden="true"></div>`);

function cards(list, media) {
  return `<ul class="grid">${list.map((l) => `<li class="card"><a href="/item/${l.id}/">${tile(l, media)}<span class="t">${esc(titleOf(l))}</span><span><span class="p">${l.price == null ? "No price" : money(l.price)}</span><span class="s">${esc(l.size || "")}</span></span></a></li>`).join("")}</ul>`;
}

/* ------------------------------------------------------------------ pages */

function homePage(ctx, state, media) {
  const others = state.listings.filter((l) => !l.mine && l.status === "live");
  return layout(ctx, { title: "Buy and sell second-hand fashion", body: `
<div class="hero"><div><h1>Fresh finds, every hour</h1><p class="muted">Pre-loved clothes from real wardrobes. New drops from sellers near you.</p></div>
<a class="btn ghost" href="/sell/">Start selling</a></div>
<h2 style="margin-top:22px">Picked for you</h2>
${cards(others, media)}` });
}

function searchPage(ctx, state, media, q) {
  const s = q.trim().toLowerCase();
  const hits = state.listings.filter((l) => l.status === "live" && s && `${l.description} ${l.brand} ${l.category}`.toLowerCase().includes(s));
  return layout({ ...ctx, q }, { title: `Search: ${q}`, body: `
<h1>${hits.length} result${hits.length === 1 ? "" : "s"} for “${esc(q)}”</h1>
${hits.length ? cards(hits, media) : `<p class="muted">Nothing yet. Try another word.</p>`}` });
}

function infoPage(ctx, name) {
  const t = { about: "About Thrift", help: "Help centre", terms: "Terms of use", privacy: "Privacy and cookies" }[name];
  return layout(ctx, { title: t, body: `<h1>${t}</h1><p class="muted">Thrift is a place to buy and sell pre-loved fashion. This page is kept short on purpose.</p>` });
}

function notFound(ctx, what = "Page not found") {
  return layout(ctx, { title: what, body: `<h1>${esc(what)}</h1><p><a href="/">Back to Thrift</a></p>` });
}

function loginPage(ctx, next, error, email = "") {
  return layout(ctx, { title: "Log in", body: `
<div class="narrow">
<h1>Log in to Thrift</h1>
<p class="muted">Welcome back. Your shop and messages are waiting.</p>
${error ? `<div class="alert" role="alert">${esc(error)}</div>` : ""}
<form method="post" action="/login/">
  <input type="hidden" name="next" value="${esc(next)}">
  <div class="f"><label for="email">Email</label><input type="email" id="email" name="email" autocomplete="username" value="${esc(email)}"></div>
  <div class="f"><label for="password">Password</label><input type="password" id="password" name="password" autocomplete="current-password"></div>
  <div class="actions" style="justify-content:space-between"><a href="/help/">Forgot password?</a><button type="submit">Log in</button></div>
</form>
<p class="muted">New to Thrift? <a href="/help/">Create an account</a></p>
</div>` });
}

const SELL_JS = `(function(){
var $=function(id){return document.getElementById(id)};
var form=$("sell"),input=$("photo-input"),thumbs=$("thumbs"),btn=$("condition"),list=$("condition-list"),price=$("price");
var opts=Array.prototype.slice.call(list.querySelectorAll('[role="option"]'));
var photos=[],condition="",draftId="",busy=false,active=-1;
var size=function(n){return n<1024?n+" B":n<1048576?Math.round(n/1024)+" KB":(n/1048576).toFixed(1)+" MB"};
var ctl={photos:$("add-photos"),description:$("description"),category:$("category"),condition:btn,price:price};
function err(k,msg){var p=$("err-"+k);if(!p)return;p.textContent=msg||"";p.hidden=!msg;var c=ctl[k];
  if(c){if(msg){c.setAttribute("aria-invalid","true");c.setAttribute("aria-describedby","err-"+k)}else{c.removeAttribute("aria-invalid");c.removeAttribute("aria-describedby")}}}
function render(){thumbs.textContent="";
  photos.forEach(function(f,i){var li=document.createElement("li");
    if(i===0){var c=document.createElement("span");c.className="cover";c.textContent="Cover";li.appendChild(c)}
    var img=document.createElement("img");img.src=URL.createObjectURL(f);img.alt="Photo "+(i+1)+": "+f.name;
    var cap=document.createElement("span");cap.className="cap";cap.textContent=f.name+" · "+size(f.size);
    var rm=document.createElement("button");rm.type="button";rm.className="rm";rm.textContent="×";rm.setAttribute("aria-label","Remove photo "+(i+1));
    rm.addEventListener("click",function(){photos.splice(i,1);render()});
    li.appendChild(img);li.appendChild(cap);li.appendChild(rm);thumbs.appendChild(li)});
  thumbs.hidden=!photos.length;$("photo-count").textContent=photos.length+" of 8 added";$("add-photos").disabled=photos.length>=8}
$("add-photos").addEventListener("click",function(){input.click()});
input.addEventListener("change",function(){var skipped=0;
  Array.prototype.forEach.call(input.files||[],function(f){if(!/^image\\//.test(f.type)){skipped++;return}if(photos.length<8)photos.push(f)});
  input.value="";render();err("photos",skipped?"Only images can be added":"")});
$("description").addEventListener("input",function(){$("desc-count").textContent=String(this.value.length);err("description","")});
$("category").addEventListener("change",function(){err("category","")});
function mark(){opts.forEach(function(o,i){o.classList.toggle("active",i===active)});if(active>=0)list.setAttribute("aria-activedescendant",opts[active].id)}
function open(){list.hidden=false;btn.setAttribute("aria-expanded","true");active=Math.max(0,opts.findIndex(function(o){return o.getAttribute("aria-selected")==="true"}));mark();list.focus()}
function close(back){list.hidden=true;btn.setAttribute("aria-expanded","false");list.removeAttribute("aria-activedescendant");if(back)btn.focus()}
function choose(i){opts.forEach(function(o,j){o.setAttribute("aria-selected",String(i===j))});condition=opts[i].textContent.trim();$("condition-value").textContent=condition;err("condition","");close(true)}
btn.addEventListener("click",function(){list.hidden?open():close(true)});
btn.addEventListener("keydown",function(e){if((e.key==="ArrowDown"||e.key==="ArrowUp")&&list.hidden){open();e.preventDefault()}});
opts.forEach(function(o,i){o.addEventListener("click",function(){choose(i)});o.addEventListener("mousemove",function(){active=i;mark()})});
list.addEventListener("keydown",function(e){
  if(e.key==="ArrowDown"){active=Math.min(opts.length-1,active+1);mark();e.preventDefault()}
  else if(e.key==="ArrowUp"){active=Math.max(0,active-1);mark();e.preventDefault()}
  else if(e.key==="Enter"||e.key===" "){if(active>=0)choose(active);e.preventDefault()}
  else if(e.key==="Escape"){close(true);e.preventDefault()}else if(e.key==="Tab"){close(false)}});
document.addEventListener("mousedown",function(e){if(!list.hidden&&!e.target.closest(".dd"))close(false)});
price.addEventListener("input",function(){var v=price.value.replace(/[^0-9.]/g,""),i=v.indexOf(".");
  if(i>=0)v=v.slice(0,i+1)+v.slice(i+1).replace(/\\./g,"").slice(0,2);if(v!==price.value)price.value=v;err("price","")});
function check(live){var e={};
  if(live){if(!photos.length)e.photos="Add at least one photo";
    if(!$("description").value.trim())e.description="Add a description";
    if(!$("category").value)e.category="Choose a category";
    if(!condition)e.condition="Choose a condition";
    var pv=price.value.trim();if(!pv)e.price="Price is required";else if(!(Number(pv)>0))e.price="Enter a price above $0"}
  else if(!photos.length&&!$("description").value.trim()&&!price.value.trim())e.description="Add a photo or a description before saving a draft";
  return e}
function show(e,verb){var n=0;["photos","description","category","condition","price"].forEach(function(k){err(k,e[k]||"");if(e[k])n++});
  var fe=$("form-error");fe.textContent=n?"Fix "+n+" thing"+(n>1?"s":"")+" before "+verb:"";fe.hidden=!n;return n}
function send(status){if(busy)return;$("saved").textContent="";var live=status==="live";
  if(show(check(live),live?"posting":"saving"))return;
  busy=true;var b=live?$("post"):$("save-draft"),label=b.textContent;b.disabled=true;b.textContent=live?"Posting…":"Saving…";
  var fd=new FormData();fd.set("status",status);if(draftId)fd.set("id",draftId);
  fd.set("description",$("description").value);fd.set("category",$("category").value);fd.set("condition",condition);
  fd.set("size",$("size").value);fd.set("brand",$("brand").value);fd.set("price",price.value);
  var sh=form.querySelector('input[name="shipping"]:checked');fd.set("shipping",sh?sh.value:"label");
  photos.forEach(function(f){fd.append("photos",f,f.name)});
  fetch("/api/listings",{method:"POST",body:fd}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){
    if(r.ok&&j.id){if(live){location.href="/item/"+j.id+"/?posted=1";return true}draftId=j.id;$("saved").textContent="Draft saved";return false}
    if(j.errors)show(j.errors,live?"posting":"saving");
    else{$("form-error").textContent=j.error||"Something went wrong. Try again.";$("form-error").hidden=false}return false})})
  .catch(function(){$("form-error").textContent="Could not reach Thrift. Check your connection and try again.";$("form-error").hidden=false;return false})
  .then(function(left){if(left)return;busy=false;b.disabled=false;b.textContent=label})}
form.addEventListener("submit",function(e){e.preventDefault();send("live")});
$("save-draft").addEventListener("click",function(){send("draft")});
})();`;

function sellPage(ctx) {
  const cat = CATEGORIES.map((c) => `<option>${c}</option>`).join("");
  const cond = CONDITIONS.map((c, i) => `<li role="option" id="cond-${i}" aria-selected="false">${c}</li>`).join("");
  return layout(ctx, { title: "Sell an item", script: SELL_JS, body: `
<div class="sell">
<h1>List an item</h1>
<p class="muted">Good photos sell. Natural light, a plain background, and show any flaws.</p>
<form id="sell" novalidate>
  <div id="form-error" class="alert" role="alert" hidden></div>
  <section class="sec" aria-labelledby="h-photos">
    <h2 id="h-photos">Photos</h2>
    <p class="muted">Add up to 8 photos. The first one is the cover. <span id="photo-count">0 of 8 added</span></p>
    <ul id="thumbs" class="thumbs" aria-label="Selected photos" hidden></ul>
    <button type="button" id="add-photos" class="add"><span aria-hidden="true">+ </span>Add photos</button>
    <input type="file" id="photo-input" name="photos" accept="image/*" multiple hidden>
    <p class="err" id="err-photos" hidden></p>
  </section>
  <section class="sec" aria-labelledby="h-details">
    <h2 id="h-details">Details</h2>
    <div class="f"><label for="description">Description</label>
      <textarea id="description" name="description" rows="5" maxlength="1000" placeholder="e.g. Vintage 90s windbreaker, barely worn. Fits true to size."></textarea>
      <div class="count" aria-hidden="true"><span id="desc-count">0</span>/1000</div>
      <p class="err" id="err-description" hidden></p></div>
    <div class="f"><label for="category">Category</label>
      <select id="category" name="category"><option value="">Select a category</option>${cat}</select>
      <p class="err" id="err-category" hidden></p></div>
    <div class="f"><span class="lab" id="condition-label">Condition</span>
      <div class="dd">
        <button type="button" id="condition" class="ddbtn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="condition-label condition-value"><span id="condition-value">Select condition</span><span class="chev" aria-hidden="true"></span></button>
        <ul id="condition-list" class="ddlist" role="listbox" aria-labelledby="condition-label" tabindex="-1" hidden>${cond}</ul>
      </div>
      <p class="err" id="err-condition" hidden></p></div>
    <div class="f two">
      <div><label for="size">Size</label><input type="text" id="size" name="size" autocomplete="off" placeholder="e.g. M, W32, UK 8"></div>
      <div><label for="brand">Brand (optional)</label><input type="text" id="brand" name="brand" autocomplete="off" placeholder="e.g. Levi's"></div>
    </div>
  </section>
  <section class="sec" aria-labelledby="h-price">
    <h2 id="h-price">Price and shipping</h2>
    <div class="f"><label for="price">Price</label>
      <div class="money"><span class="cur" aria-hidden="true">$</span><input type="text" id="price" name="price" inputmode="decimal" autocomplete="off" placeholder="0.00"></div>
      <p class="muted" style="font-size:13px;margin:6px 0 0">You keep the full amount. Buyers pay for shipping.</p>
      <p class="err" id="err-price" hidden></p></div>
    <fieldset class="f"><legend>Shipping</legend>
      <label class="radio"><input type="radio" name="shipping" value="label" checked> Thrift shipping label</label>
      <label class="radio"><input type="radio" name="shipping" value="self"> I'll ship it myself</label>
    </fieldset>
  </section>
  <div id="saved" class="ok" role="status"></div>
  <div class="actions"><button type="button" id="save-draft" class="ghost">Save draft</button><button type="submit" id="post">Post listing</button></div>
</form>
</div>` });
}

function shopPage(ctx, state, media, tab, deleted) {
  const mine = state.listings.filter((l) => l.mine);
  const by = { selling: mine.filter((l) => l.status === "live"), drafts: mine.filter((l) => l.status === "draft"), sold: mine.filter((l) => l.status === "sold") };
  const t = by[tab] ? tab : "selling";
  const tabLink = (k, label) => `<a href="/shop/?tab=${k}"${k === t ? ' aria-current="page"' : ""}>${label} (${by[k].length})</a>`;
  return layout(ctx, { title: "My shop", body: `
${deleted ? `<div class="ok" role="status">Listing deleted</div>` : ""}
<div class="hero"><div><h1>My shop</h1><p class="muted">@${ME} · 41 sold · ★ 4.9 (23 reviews)</p></div><a class="btn" href="/sell/">List an item</a></div>
<nav class="tabs" aria-label="Shop sections">${tabLink("selling", "Selling")}${tabLink("drafts", "Drafts")}${tabLink("sold", "Sold")}</nav>
${by[t].length ? cards(by[t], media) : `<p class="muted" style="margin-top:20px">Nothing here yet.</p>`}` });
}

function itemPage(ctx, l, media, flags) {
  const pics = l.photos.length && media.has(l.id)
    ? l.photos.map((p, i) => `<img src="/media/${l.id}/${i}" alt="Photo ${i + 1} of ${l.photos.length}">`).join("")
    : `<div class="ph" style="--h:${l.hue ?? 30}" aria-hidden="true"></div>`;
  const notice = flags.posted ? "Your listing is live" : flags.saved ? "Changes saved" : "";
  const actions = l.mine
    ? `<a class="btn" href="/item/${l.id}/edit/">Edit listing</a><button type="button" class="ghost" id="share">Share</button>`
    : l.status === "live"
      ? `<a class="btn" href="/checkout/${l.id}/">Buy now</a><button type="button" class="ghost" aria-pressed="false" aria-label="Like" id="like">♡</button>`
      : "";
  return layout(ctx, { title: titleOf(l), script: `var s=document.getElementById("share");if(s)s.addEventListener("click",function(){s.textContent="Link copied"});var k=document.getElementById("like");if(k)k.addEventListener("click",function(){var on=k.getAttribute("aria-pressed")!=="true";k.setAttribute("aria-pressed",String(on));k.textContent=on?"♥":"♡"});`, body: `
${notice ? `<div class="ok" role="status">${notice}</div>` : ""}
<div class="item">
  <div class="gallery">${pics}</div>
  <div>
    ${l.status === "draft" ? `<p class="muted"><strong>Draft</strong> · only you can see this</p>` : ""}
    <h1>${esc(titleOf(l))}</h1>
    <p class="price">${l.price == null ? "No price yet" : money(l.price)}</p>
    <div class="row">${actions}</div>
    <dl class="facts"><dt>Category</dt><dd>${esc(l.category || "—")}</dd><dt>Condition</dt><dd>${esc(l.condition || "—")}</dd><dt>Size</dt><dd>${esc(l.size || "—")}</dd><dt>Brand</dt><dd>${esc(l.brand || "—")}</dd></dl>
    <h2>Description</h2><p class="desc">${esc(l.description)}</p>
    <p class="muted">Listed ${ago(l.createdAt) === "now" ? "just now" : `${ago(l.createdAt)} ago`} by @${esc(l.seller)}</p>
  </div>
</div>` });
}

function editPage(ctx, l, error, priceValue, descValue) {
  return layout(ctx, { title: `Edit · ${titleOf(l)}`, script: `(function(){var $=function(i){return document.getElementById(i)};var w=$("delete-backdrop");
function shut(){w.hidden=true;$("delete-open").focus()}
$("delete-open").addEventListener("click",function(){w.hidden=false;$("delete-cancel").focus()});
$("delete-cancel").addEventListener("click",shut);
w.addEventListener("keydown",function(e){if(e.key==="Escape"){e.preventDefault();shut()}});
w.addEventListener("mousedown",function(e){if(e.target===w)shut()});
$("price").addEventListener("input",function(){var p=this,v=p.value.replace(/[^0-9.]/g,"");if(v!==p.value)p.value=v});})();`, body: `
<div class="sell">
<p><a href="/item/${l.id}/">← Back to listing</a></p>
<h1>Edit listing</h1>
<p class="muted">${esc(titleOf(l))}</p>
${error ? `<div class="alert" role="alert">${esc(error)}</div>` : ""}
<form method="post" action="/item/${l.id}/edit/" class="sec">
  <div class="f"><label for="description">Description</label><textarea id="description" name="description" rows="5" maxlength="1000">${esc(descValue ?? l.description)}</textarea></div>
  <div class="f"><label for="price">Price</label>
    <div class="money"><span class="cur" aria-hidden="true">$</span><input type="text" id="price" name="price" inputmode="decimal" autocomplete="off" value="${esc(priceValue ?? priceInput(l.price))}"${error ? ' aria-invalid="true"' : ""}></div></div>
  <div class="actions"><a class="btn ghost" href="/item/${l.id}/">Cancel</a><button type="submit">Save changes</button></div>
</form>
<p><button type="button" class="linkish" id="delete-open">Delete listing</button></p>
</div>
<div class="backdrop" id="delete-backdrop" hidden>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-desc">
    <h2 id="delete-title">Delete this listing?</h2>
    <p id="delete-desc" class="muted">It disappears from your shop and from search. This can't be undone.</p>
    <form method="post" action="/item/${l.id}/delete/" class="actions"><button type="button" class="ghost" id="delete-cancel">Cancel</button><button type="submit" class="danger">Delete</button></form>
  </div>
</div>` });
}

const THREAD_JS = (id) => `(function(){var $=function(i){return document.getElementById(i)};var f=$("composer"),t=$("msg"),s=$("send"),log=$("log"),busy=false;
function sync(){s.disabled=busy||!t.value.trim()}
t.addEventListener("input",sync);
t.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!s.disabled)f.requestSubmit()}});
f.addEventListener("submit",function(e){e.preventDefault();var text=t.value.trim();if(!text||busy)return;busy=true;sync();
  fetch("/api/threads/${id}/messages",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:text})})
  .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||"failed");
    var d=document.createElement("div");d.className="msg me";var p=document.createElement("p");var w=document.createElement("span");w.className="sr-only";w.textContent="You: ";
    p.appendChild(w);p.appendChild(document.createTextNode(j.message.text));var tm=document.createElement("time");tm.textContent="now";d.appendChild(p);d.appendChild(tm);log.appendChild(d);
    log.scrollTop=log.scrollHeight;t.value="";$("send-error").hidden=true})})
  .catch(function(){$("send-error").hidden=false})
  .then(function(){busy=false;sync()})});
log.scrollTop=log.scrollHeight;sync();})();`;

function threadList(state, current) {
  const sorted = [...state.threads].sort((a, b) => b.messages[b.messages.length - 1].at - a.messages[a.messages.length - 1].at);
  return `<ul class="threads" aria-label="Conversations">${sorted.map((t) => {
    const last = t.messages[t.messages.length - 1];
    const item = state.listings.find((l) => l.id === t.listing);
    const hue = [...t.buyer].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
    return `<li><a href="/messages/${t.id}/" class="${t.unread ? "unread" : ""}"${t.id === current ? ' aria-current="page"' : ""}>`
      + `<span class="av" style="--h:${hue}" aria-hidden="true"></span><span class="who">${esc(t.buyer)}</span>${t.unread ? `<span class="sr-only">Unread</span>` : ""}`
      + `<time>${ago(last.at)}</time><span class="last">${last.from === "me" ? "You: " : ""}${esc(last.text)}${item ? ` · ${esc(titleOf(item))}` : ""}</span></a></li>`;
  }).join("")}</ul>`;
}

function inboxPage(ctx, state) {
  return layout(ctx, { title: "Messages", body: `
<h1>Messages</h1>
<p class="muted">${ctx.unread ? `${ctx.unread} unread` : "All caught up"}</p>
<div class="inbox">${threadList(state, null)}<div class="empty">Pick a conversation</div></div>` });
}

function threadPage(ctx, state, t) {
  const item = state.listings.find((l) => l.id === t.listing);
  const msgs = t.messages.map((m) => `<div class="msg ${m.from === "me" ? "me" : "them"}"><p><span class="sr-only">${m.from === "me" ? "You" : esc(t.buyer)}: </span>${esc(m.text)}</p><time>${ago(m.at)}</time></div>`).join("");
  return layout(ctx, { title: `${t.buyer} · Messages`, script: THREAD_JS(t.id), body: `
<div class="inbox">${threadList(state, t.id)}
<section class="convo" aria-labelledby="convo-title">
  <header><h1 id="convo-title">${esc(t.buyer)}</h1>${item ? `<a class="itemchip" href="/item/${item.id}/">${esc(titleOf(item))} · ${money(item.price)}</a>` : ""}</header>
  <div class="log" id="log" role="log" aria-label="Conversation with ${esc(t.buyer)}">${msgs}</div>
  <p class="err" id="send-error" role="alert" hidden style="padding:0 16px">Not sent. Try again.</p>
  <form class="composer" id="composer" method="post" action="/messages/${t.id}/">
    <label for="msg" class="sr-only">Write a message</label>
    <textarea id="msg" name="text" rows="1" maxlength="2000" placeholder="Write a message…"></textarea>
    <button type="submit" id="send">Send</button>
  </form>
</section>
</div>` });
}

function checkoutPage(ctx, l, done) {
  const ship = 5.99;
  if (done) return layout(ctx, { title: "Order placed", body: `<div class="narrow"><h1>Order placed</h1><p>${esc(titleOf(l))} is on its way to you.</p><p><a href="/">Keep browsing</a></p></div>` });
  return layout(ctx, { title: "Checkout", body: `
<div class="narrow">
<h1>Checkout</h1>
<p>${esc(titleOf(l))}</p>
<dl class="facts"><dt>Item</dt><dd>${money(l.price)}</dd><dt>Shipping</dt><dd>${money(ship)}</dd><dt>Total</dt><dd><strong>${money(l.price + ship)}</strong></dd></dl>
<form method="post" action="/checkout/${l.id}/" class="sec">
  <div class="f"><label for="card">Card number</label><input type="text" id="card" name="card" inputmode="numeric" autocomplete="cc-number" placeholder="1234 1234 1234 1234"></div>
  <div class="f two"><div><label for="exp">Expiry</label><input type="text" id="exp" name="exp" autocomplete="cc-exp" placeholder="MM / YY"></div><div><label for="cvc">CVC</label><input type="text" id="cvc" name="cvc" autocomplete="cc-csc"></div></div>
  <div class="actions"><button type="submit">Pay now</button></div>
</form>
</div>` });
}

function captchaPage() {
  const ray = crypto.randomBytes(8).toString("hex");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Just a moment…</title>
<style>body{margin:0;font:15px/1.5 -apple-system,Helvetica,Arial,sans-serif;background:#f7f7f7;color:#222}
.box{max-width:520px;margin:12vh auto 0;padding:0 24px}.brand{font-weight:800;font-size:22px;letter-spacing:-.03em;margin-bottom:28px}
h1{font-size:26px;margin:0 0 8px}p{color:#555}iframe{border:0;width:304px;height:78px;margin:18px 0;display:block}
small{color:#999}</style></head><body>
<div class="box">
  <div class="brand">Thrift</div>
  <h1>Verify you are human</h1>
  <p>We noticed unusual activity from your device. Complete the check below to continue to Thrift.</p>
  <iframe src="/recaptcha/api2/anchor?k=6LcThrift00000&amp;hl=en" title="reCAPTCHA"></iframe>
  <small>Ray ID ${ray}</small>
</div>
<script>setInterval(function(){fetch("/challenge/status",{cache:"no-store"}).then(function(r){return r.json()}).then(function(j){if(j.cleared)location.reload()}).catch(function(){})},1500);</script>
</body></html>`;
}

const ANCHOR = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>reCAPTCHA</title>
<style>body{margin:0;font:14px Roboto,Helvetica,Arial,sans-serif}.w{box-sizing:border-box;width:302px;height:76px;border:1px solid #d3d3d3;border-radius:3px;background:#f9f9f9;display:flex;align-items:center;justify-content:space-between;padding:0 12px;box-shadow:0 0 4px 1px rgba(0,0,0,.08)}
label{display:flex;align-items:center;gap:12px}input{width:24px;height:24px;margin:0}.b{text-align:center;font-size:10px;color:#555}.l{width:32px;height:32px;margin:0 auto 2px;border-radius:50%;background:conic-gradient(#4a90e2 0 33%,#b0b0b0 0 66%,#1c3aa9 0)}</style></head>
<body><div class="w"><label><input type="checkbox" id="anchor"> I'm not a robot</label><div class="b"><div class="l" aria-hidden="true"></div>reCAPTCHA<br>Privacy - Terms</div></div></body></html>`;

/* ------------------------------------------------------------------ server */

const send = (res, code, body, type = "text/html; charset=utf-8", headers = {}) => {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store", ...headers });
  res.end(body);
};
const json = (res, code, v, headers = {}) => send(res, code, JSON.stringify(v), "application/json", headers);
const redirect = (res, to, code = 302, headers = {}) => { res.writeHead(code, { location: to, "cache-control": "no-store", ...headers }); res.end(); };

async function readBody(req, limit = 60 * 1024 * 1024) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > limit) throw new Error("body too large");
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0) { try { out[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1)); } catch { out[part.slice(0, i)] = part.slice(i + 1); } }
  }
  return out;
}

/** Only same-site paths are followed after a log in ("//evil.com" is not one). */
const safeNext = (n) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/");

export function startShop({ port = 0 } = {}) {
  const state = seed();
  const media = new Map(); // listing id -> [{type, b}], never in /__test/state
  const sessions = new Map(); // sid -> {email, at}
  let nextId = 301;

  function reset() {
    const fresh = seed();
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, fresh);
    media.clear();
    nextId = 301;
  }

  const pub = (l) => ({
    id: l.id, mine: l.mine, seller: l.seller, title: titleOf(l), description: l.description, category: l.category,
    condition: l.condition, size: l.size, brand: l.brand, price: l.price, shipping: l.shipping, status: l.status,
    photos: l.photos, priceHistory: l.priceHistory, createdAt: l.createdAt, updatedAt: l.updatedAt,
  });
  const snapshot = () => ({
    listings: state.listings.map(pub),
    edits: state.edits, deletions: state.deletions, sent: state.sent, purchases: state.purchases, logins: state.logins,
    threads: state.threads.map((t) => ({ id: t.id, buyer: t.buyer, listing: t.listing, unread: t.unread, messages: t.messages })),
    captcha: state.captcha, sessions: sessions.size,
  });

  function newSession(res, email, to) {
    const sid = crypto.randomBytes(18).toString("hex");
    sessions.set(sid, { email, at: Date.now() });
    state.logins.push({ email, at: Date.now() }); // the password is never kept
    redirect(res, to, 303, { "set-cookie": `${SID}=${sid}; Path=/; HttpOnly; SameSite=Lax` });
  }

  async function handle(req, res) {
    const u = new URL(req.url, "http://thrift.local");
    const p = u.pathname;
    const method = req.method || "GET";
    const jar = cookies(req);
    const sess = sessions.get(jar[SID]) || null;
    const ctx = {
      sess,
      unread: sess ? state.threads.filter((t) => t.unread).length : 0,
      cookiesOk: jar.thrift_cookies === "accepted",
      q: "",
    };

    /* --- test control: always answers, never shown to the agent */
    if (p.startsWith("/__test/")) {
      const what = p.slice(8).replace(/\/$/, "");
      if (what === "state" && method === "GET") return json(res, 200, snapshot());
      if (what === "login" && method === "GET") return newSession(res, "you@thrift.test", "/");
      if (method !== "POST") return json(res, 405, { error: "POST only" });
      await readBody(req);
      if (what === "reset") { reset(); return json(res, 200, { ok: true }); }
      if (what === "captcha") { state.captcha = /^(1|on|true)$/i.test(u.searchParams.get("on") || ""); return json(res, 200, { ok: true, captcha: state.captcha }); }
      if (what === "logout") { sessions.clear(); return json(res, 200, { ok: true }); }
      return json(res, 404, { error: "no such control" });
    }
    if (p === "/favicon.ico") { res.writeHead(204); return res.end(); }
    if (p === "/recaptcha/api2/anchor") return send(res, 200, ANCHOR);
    if (p === "/challenge/status") return json(res, 200, { cleared: !state.captcha });
    let m = /^\/media\/(\d+)\/(\d+)$/.exec(p);
    if (m) {
      const f = (media.get(m[1]) || [])[Number(m[2])];
      return f ? send(res, 200, f.b, f.type || "application/octet-stream") : send(res, 404, "", "text/plain");
    }

    /* --- the bot check sits in front of everything but the sign-in page */
    if (state.captcha && !p.startsWith("/login/")) {
      if (p.startsWith("/api/")) return json(res, 403, { error: "Verify you are human first." });
      if (method !== "GET") await readBody(req);
      return send(res, 403, captchaPage());
    }

    if (p === "/login") return redirect(res, `/login/${u.search}`);
    if (p === "/login/") {
      const next = safeNext(u.searchParams.get("next"));
      if (method === "POST") {
        const f = new URLSearchParams((await readBody(req)).toString("utf8"));
        const email = (f.get("email") || "").trim(), pass = f.get("password") || "";
        if (!email || !pass) return send(res, 200, loginPage(ctx, safeNext(f.get("next")), "Enter your email and password.", email));
        return newSession(res, email, safeNext(f.get("next")));
      }
      if (sess) return redirect(res, next);
      return send(res, 200, loginPage(ctx, next, ""));
    }

    /* --- public pages */
    if (p === "/" && method === "GET") return send(res, 200, homePage(ctx, state, media));
    if ((p === "/search/" || p === "/search") && method === "GET") return send(res, 200, searchPage(ctx, state, media, u.searchParams.get("q") || ""));
    m = /^\/(about|help|terms|privacy)\/?$/.exec(p);
    if (m) return send(res, 200, infoPage(ctx, m[1]));

    /* --- everything else needs a session */
    const known = /^\/(sell|shop|item|messages|checkout|api)(\/|$)/.test(p);
    if (!known) return send(res, 404, notFound(ctx));
    if (!sess) {
      if (p.startsWith("/api/")) return json(res, 401, { error: "Log in to continue." });
      if (method !== "GET") await readBody(req);
      return redirect(res, `/login/?next=${encodeURIComponent(p + u.search)}`);
    }

    if (p === "/sell/" && method === "GET") return send(res, 200, sellPage(ctx));

    if (p === "/api/listings" && method === "POST") {
      const buf = await readBody(req);
      let fd;
      try {
        fd = await new Request("http://thrift.local/api/listings", { method: "POST", headers: { "content-type": req.headers["content-type"] || "" }, body: buf }).formData();
      } catch {
        return json(res, 400, { error: "Send the listing as multipart/form-data." });
      }
      const status = fd.get("status") === "draft" ? "draft" : "live";
      const photos = [], blobs = [];
      for (const f of fd.getAll("photos")) {
        if (!f || typeof f !== "object" || typeof f.arrayBuffer !== "function") continue;
        if (photos.length >= MAX_PHOTOS) break;
        const b = Buffer.from(await f.arrayBuffer());
        photos.push({ name: f.name, size: b.length, type: f.type || "", sha256: sha(b) });
        blobs.push({ type: f.type, b });
      }
      // multipart/form-data turns every line break into CRLF; store them as typed.
      const str = (k, max) => String(fd.get(k) ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
      const description = str("description", 1000), category = str("category", 40), condition = str("condition", 40);
      const size = str("size", 40), brand = str("brand", 60), shipping = str("shipping", 10) === "self" ? "self" : "label";
      const rawPrice = str("price", 20);
      const price = parsePrice(rawPrice);
      const errors = {};
      if (status === "live") {
        if (!photos.length) errors.photos = "Add at least one photo";
        if (!description) errors.description = "Add a description";
        if (!CATEGORIES.includes(category)) errors.category = "Choose a category";
        if (!CONDITIONS.includes(condition)) errors.condition = "Choose a condition";
        if (!rawPrice) errors.price = "Price is required";
        else if (price == null) errors.price = "Enter a price above $0";
      } else if (!photos.length && !description && !rawPrice) {
        errors.description = "Add a photo or a description before saving a draft";
      }
      if (Object.keys(errors).length) return json(res, 400, { errors });
      const id = str("id", 20);
      let l = id ? state.listings.find((x) => x.id === id && x.mine && x.status === "draft") : null;
      const now = Date.now();
      if (!l) {
        l = { id: String(nextId++), mine: true, seller: ME, priceHistory: [], createdAt: now, hue: Math.floor(Math.random() * 360) };
        state.listings.push(l);
      }
      Object.assign(l, {
        description, category: CATEGORIES.includes(category) ? category : "", condition: CONDITIONS.includes(condition) ? condition : "",
        size, brand, price, shipping, photos, status, updatedAt: now,
      });
      media.set(l.id, blobs);
      return json(res, 201, { id: l.id, status, url: `/item/${l.id}/` });
    }

    if (p === "/shop/" && method === "GET") return send(res, 200, shopPage(ctx, state, media, u.searchParams.get("tab") || "selling", u.searchParams.has("deleted")));

    m = /^\/item\/(\d+)\/(?:(edit|delete)\/)?$/.exec(p);
    if (m) {
      const l = state.listings.find((x) => x.id === m[1]);
      const visible = l && l.status !== "deleted" && (l.mine || l.status === "live" || l.status === "sold");
      if (!visible) { if (method !== "GET") await readBody(req); return send(res, 404, notFound(ctx, "This listing is no longer available")); }
      if (!m[2] && method === "GET") return send(res, 200, itemPage(ctx, l, media, { posted: u.searchParams.has("posted"), saved: u.searchParams.has("saved") }));
      if (!l.mine) { if (method !== "GET") await readBody(req); return send(res, 403, notFound(ctx, "Only the seller can change this listing")); }
      if (m[2] === "edit" && method === "GET") return send(res, 200, editPage(ctx, l, ""));
      if (m[2] === "edit" && method === "POST") {
        const f = new URLSearchParams((await readBody(req)).toString("utf8"));
        const rawPrice = (f.get("price") || "").trim();
        const price = parsePrice(rawPrice);
        const description = f.has("description") ? String(f.get("description")).replace(/\r\n?/g, "\n").trim().slice(0, 1000) : l.description;
        if (price == null) return send(res, 200, editPage(ctx, l, rawPrice ? "Enter a price above $0" : "Price is required", rawPrice, description));
        if (!description) return send(res, 200, editPage(ctx, l, "Add a description", rawPrice, description));
        const now = Date.now();
        if (price !== l.price) {
          state.edits.push({ id: l.id, field: "price", from: l.price, to: price, at: now });
          l.priceHistory.push({ from: l.price, to: price, at: now });
          l.price = price;
        }
        if (description !== l.description) {
          state.edits.push({ id: l.id, field: "description", from: l.description, to: description, at: now });
          l.description = description;
        }
        l.updatedAt = now;
        return redirect(res, `/item/${l.id}/?saved=1`, 303);
      }
      if (m[2] === "delete" && method === "POST") {
        await readBody(req);
        l.status = "deleted";
        state.deletions.push({ id: l.id, title: titleOf(l), at: Date.now() });
        return redirect(res, "/shop/?deleted=1", 303);
      }
      if (method !== "GET") await readBody(req);
      return send(res, 405, notFound(ctx, "Not allowed"));
    }

    if (p === "/messages/" && method === "GET") return send(res, 200, inboxPage(ctx, state));
    m = /^\/(?:messages|api\/threads)\/(t\d+)\/(?:(messages)\/)?$/.exec(p.endsWith("/") ? p : `${p}/`);
    if (m) {
      const t = state.threads.find((x) => x.id === m[1]);
      const api = p.startsWith("/api/");
      if (!t) return api ? json(res, 404, { error: "No such conversation." }) : send(res, 404, notFound(ctx, "Conversation not found"));
      if (!api && method === "GET") {
        t.unread = false;
        ctx.unread = state.threads.filter((x) => x.unread).length;
        return send(res, 200, threadPage(ctx, state, t));
      }
      if (method === "POST" && (api ? m[2] === "messages" : !m[2])) {
        const raw = (await readBody(req)).toString("utf8");
        let text = "";
        if (api) { try { text = String(JSON.parse(raw || "{}").text ?? ""); } catch { return json(res, 400, { error: "Send JSON {text}." }); } }
        else text = new URLSearchParams(raw).get("text") || "";
        text = text.replace(/\r\n?/g, "\n").trim().slice(0, 2000);
        if (!text) return api ? json(res, 400, { error: "Write a message first." }) : redirect(res, `/messages/${t.id}/`, 303);
        const msg = { from: "me", text, at: Date.now() };
        t.messages.push(msg);
        state.sent.push({ thread: t.id, buyer: t.buyer, text, at: msg.at });
        return api ? json(res, 201, { ok: true, message: msg }) : redirect(res, `/messages/${t.id}/`, 303);
      }
      if (method !== "GET") await readBody(req);
      return api ? json(res, 405, { error: "Not allowed." }) : send(res, 405, notFound(ctx, "Not allowed"));
    }

    m = /^\/checkout\/(\d+)\/$/.exec(p);
    if (m) {
      const l = state.listings.find((x) => x.id === m[1] && !x.mine && x.status === "live");
      if (method === "POST") {
        await readBody(req); // card fields are read and dropped, never kept
        if (!l) return send(res, 404, notFound(ctx, "This item is no longer available"));
        l.status = "sold";
        state.purchases.push({ id: l.id, title: titleOf(l), total: Math.round((l.price + 5.99) * 100) / 100, at: Date.now() });
        return send(res, 200, checkoutPage(ctx, l, true));
      }
      if (!l) return send(res, 404, notFound(ctx, "This item is no longer available"));
      return send(res, 200, checkoutPage(ctx, l, false));
    }

    if (method !== "GET") await readBody(req);
    return p.startsWith("/api/") ? json(res, 404, { error: "Not found." }) : send(res, 404, notFound(ctx));
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      try { if (!res.headersSent) send(res, 500, `Thrift had a problem: ${esc(e && e.message)}`, "text/plain"); else res.end(); } catch { /* socket gone */ }
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${server.address().port}`;
      resolve({
        url, server, state, reset,
        close: () => new Promise((r) => { try { server.closeAllConnections(); } catch { /* old node */ } server.close(() => r()); }),
      });
    });
  });
}
