// Builds the whole site from data/products.json into dist/. No dependencies:  node build.mjs
// To add, edit, sell or remove a piece, change data/products.json only. The layout never needs touching.
import fs from "node:fs";
import path from "node:path";

const root = path.dirname(new URL(import.meta.url).pathname);
const data = JSON.parse(fs.readFileSync(path.join(root, "data/products.json"), "utf8"));
const { site, pieces } = data;
const dist = path.join(root, "dist");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const usd = (n) => "$" + Number(n).toLocaleString("en-US");
const pad = (n) => String(n).padStart(2, "0");
const total = pieces.reduce((s, p) => s + Number(p.price), 0);
const priceOf = (p) => (p.sold ? "SOLD" : usd(p.price));
const count = pieces.length;
const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

const BRAND = "Chrome Hearts";
const ICON = {
  search: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  heart: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  bag: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
  shield: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z"/><path d="M8.8 11.8l2.3 2.3 4.2-4.4"/></svg>',
  box: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9"/></svg>',
  one: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8.5"/><path d="M11 9l1.5-1v8"/></svg>',
};

function page({ depth, title, desc, body, bodyClass = "" }) {
  const up = depth ? "../".repeat(depth) : "./";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="${up}assets/logo_black.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Playfair+Display:wght@400&display=swap">
<link rel="stylesheet" href="${up}assets/styles.css">
</head>
<body class="${bodyClass}">
<div class="promo">${esc(BRAND)} only &nbsp;·&nbsp; Every piece one of one &nbsp;·&nbsp; Tracked shipping from New York</div>
<header class="hdr">
  <div class="hdr-in">
    <a class="word" href="${up}">MYSTERIOUS ARCHIVE</a>
    <div class="search" role="search">${ICON.search}<span>Search ${esc(BRAND)}</span></div>
    <div class="icons"><a href="${up}" aria-label="Favourites">${ICON.heart}</a><a href="${up}reserve/" aria-label="Reserve">${ICON.bag}</a></div>
  </div>
  <nav class="cats" aria-label="Main"><a href="${up}">${esc(BRAND)}</a><a href="${up}#hoodies">Hoodies</a><a href="${up}#tops">Tops</a><a href="${up}reserve/">How to buy</a><a href="${up}about/">About</a></nav>
</header>
${body}
<section class="trust">
  <div>${ICON.shield}<b>Checked piece by piece</b><span>Every piece examined and described as it is, flaws stated plainly.</span></div>
  <div>${ICON.one}<b>One of one</b><span>Each piece exists once in this selection.</span></div>
  <div>${ICON.box}<b>Tracked shipping</b><span>Sent from New York, tracked, quoted at confirmation.</span></div>
</section>
<footer class="foot">
  <div class="foot-cols">
    <div><b>Mysterious Archive</b><a href="${up}about/">About</a><a href="${up}reserve/">How to buy</a></div>
    <div><b>Shop</b><a href="${up}">${esc(BRAND)}</a><a href="${up}#hoodies">Hoodies</a><a href="${up}#tops">Tops</a></div>
    <div><b>Contact</b><a href="mailto:${esc(site.contact.email)}">Email</a><a href="https://instagram.com/${esc(String(site.contact.instagram).replace(/^@/, ""))}">Instagram</a></div>
  </div>
  <p class="legal">© ${esc(site.date.split(" ").pop())} Mysterious Archive, New York. ${esc(site.disclaimer)}</p>
</footer>
<script src="${up}assets/app.js" defer></script>
</body>
</html>
`;
}

const isHoodie = (p) => /hood/i.test(p.title);

function card(p, up) {
  return `<a class="card" href="${up}piece/${p.slug}/">
    <span class="img"><img src="${up}${p.heroThumb}" alt="${esc(BRAND)} ${esc(p.title)}" loading="lazy"><i class="tag">One of one</i><i class="like">${ICON.heart}</i></span>
    <b class="cbrand">${esc(BRAND.toUpperCase())}</b>
    <span class="cname">${esc(p.title)}</span>
    <span class="csize">Size ${esc(p.size)}</span>
    <span class="cprice ${p.sold ? "sold" : ""}">${priceOf(p)}</span>
  </a>`;
}

function home() {
  const up = "./";
  const group = (id, name, list) => list.length ? `<h2 class="sec" id="${id}">${name}</h2><div class="grid">${list.map((p) => card(p, up)).join("\n")}</div>` : "";
  const body = `<main class="wrap">
<div class="crumbs"><a href="${up}">Home</a> / ${esc(BRAND)}</div>
<h1 class="display">${esc(BRAND)}</h1>
<p class="lede">${esc(site.selection.charAt(0) + site.selection.slice(1).toLowerCase())} · ${count} pieces, each one of one.</p>
<div class="bar"><span>${count} items</span><div class="chips"><span class="chip on">All</span><a class="chip" href="#hoodies">Hoodies</a><a class="chip" href="#tops">Tops</a></div><span class="sort">Sort by: Featured</span></div>
${group("hoodies", "Hoodies", pieces.filter(isHoodie))}
${group("tops", "Tops", pieces.filter((p) => !isHoodie(p)))}
</main>`;
  return page({ depth: 0, title: `${BRAND} · Mysterious Archive`, desc: `${count} rare ${BRAND} pieces, each one of one. ${site.line}.`, body, bodyClass: "home" });
}

function mail(p, kind) {
  const subject = `${kind === "offer" ? "Offer" : "Reserve"}: Piece ${pad(p.number)} · ${p.title}`;
  const text = kind === "offer" ? `I'd like to make an offer on Piece ${pad(p.number)}: ${p.title} (size ${p.size}). My offer: $` : `I would like to reserve Piece ${pad(p.number)}: ${p.title} (size ${p.size}).`;
  return `mailto:${site.contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

function product(p) {
  const up = "../../";
  const imgs = [p.hero, ...p.photos];
  const acc = (t, body, open = false) => `<details${open ? " open" : ""}><summary>${t}</summary><div>${body}</div></details>`;
  const body = `<main class="wrap pdp">
  <div class="crumbs"><a href="${up}">Home</a> / <a href="${up}">${esc(BRAND)}</a> / ${esc(p.title)}</div>
  <div class="pdp-grid">
    <div class="gallery">${imgs.map((src, i) => `<span class="gimg"><img src="${up}${src}" alt="${esc(BRAND)} ${esc(p.title)}${i ? `, detail ${i}` : ""}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}></span>`).join("")}</div>
    <aside class="info">
      <a class="pbrand" href="${up}">${esc(BRAND.toUpperCase())}</a>
      <h1 class="pname">${esc(p.title)}</h1>
      <p class="pmeta">${esc(p.subtitle)} · Size ${esc(p.size)} · Pre-owned</p>
      <p class="pprice ${p.sold ? "sold" : ""}">${priceOf(p)}</p>
      ${p.sold ? `<span class="btn dark disabled">Sold</span>` : `<a class="btn dark" href="${esc(mail(p, "reserve"))}">Reserve this piece</a><a class="btn light" href="${esc(mail(p, "offer"))}">Make an offer</a>`}
      <div class="auth">${ICON.shield}<div><b>Checked piece by piece</b><span>Examined and photographed as it is. Piece ${pad(p.number)} of ${pad(count)}, one of one.</span></div></div>
      <div class="seller"><span class="av">MA</span><div><b>Mysterious Archive</b><span>New York, USA · Private client selection</span></div></div>
      <ul class="ship"><li>${ICON.box}Tracked shipping from New York</li><li>${ICON.one}Held for the first client to confirm</li></ul>
      <div class="acc">
        ${acc("Description", `<p>${esc(p.model)}</p>`, true)}
        ${acc("Condition", `<p>${esc(p.condition)}</p>`)}
        ${acc("Rarity", `<p>${esc(p.rarity)}</p>`)}
        ${acc("Shipping &amp; buying", `<p>Prices in US dollars, per piece. Shipping is tracked and quoted at confirmation. Measurements and more photos on request.</p>`)}
      </div>
    </aside>
  </div>
  <h2 class="sec">More from ${esc(BRAND)}</h2>
  <div class="grid">${pieces.filter((x) => x.number !== p.number).slice(0, 4).map((x) => card(x, up)).join("\n")}</div>
</main>`;
  return page({ depth: 2, title: `${BRAND} ${p.title} · Mysterious Archive`, desc: `${BRAND} ${p.title}. ${p.subtitle}. Size ${p.size}. ${p.sold ? "Sold." : usd(p.price) + "."}`, body, bodyClass: "product" });
}

function reserve() {
  const c = site.contact;
  const body = `<main class="wrap narrow">
  <h1 class="display">How to buy</h1>
  <div class="prose">
    <p>Open the piece you want and press <b>Reserve this piece</b>, or <b>Make an offer</b>. An email opens with the piece already filled in.</p>
    <p>Each piece is one of one and is held for the first client to confirm. Prices are in US dollars, per piece. Shipping is tracked and quoted at confirmation.</p>
    <p>Measurements and more photos of any piece are available on request.</p>
    <p>Email <a href="mailto:${esc(c.email)}">${esc(c.email)}</a> · Instagram <a href="https://instagram.com/${esc(String(c.instagram).replace(/^@/, ""))}">@${esc(String(c.instagram).replace(/^@/, ""))}</a></p>
  </div>
</main>`;
  return page({ depth: 1, title: "How to buy · Mysterious Archive", desc: "How to reserve a piece from Mysterious Archive.", body, bodyClass: "reserve" });
}

function about() {
  const body = `<main class="wrap narrow">
  <h1 class="display">About</h1>
  <div class="prose">
    <p>Mysterious Archive is a New York reseller of rare ${esc(BRAND)} pieces. Selections are small and every piece is one of one.</p>
    <p>Every piece is photographed, priced and described as it is, with its condition and any flaws stated plainly.</p>
  </div>
</main>`;
  return page({ depth: 1, title: "About · Mysterious Archive", desc: `Mysterious Archive is a New York reseller of rare ${BRAND} pieces.`, body, bodyClass: "about" });
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.cpSync(path.join(root, "assets"), path.join(dist, "assets"), { recursive: true });
fs.cpSync(path.join(root, "src"), path.join(dist, "assets"), { recursive: true });
fs.writeFileSync(path.join(dist, "assets/styles.css"), fs.readFileSync(path.join(root, "src/styles.css"), "utf8"));
const w = (rel, html) => { const f = path.join(dist, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); };
w("index.html", home());
for (const p of pieces) w(`piece/${p.slug}/index.html`, product(p));
w("reserve/index.html", reserve());
w("about/index.html", about());
console.log(`built ${pieces.length} pieces + 3 pages -> ${dist}`);
