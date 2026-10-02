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

function page({ depth, title, desc, body, bodyClass = "" }) {
  const up = depth ? "../".repeat(depth) : "./";
  const nav = [["Selection", up], ["How to reserve", up + "reserve/"], ["About", up + "about/"]];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="${up}assets/logo_black.png">
<link rel="stylesheet" href="${up}assets/styles.css">
</head>
<body class="${bodyClass}">
<header class="top">
  <a class="brand" href="${up}" aria-label="Mysterious Archive, New York"><img src="${up}assets/logo_black.png" alt="Mysterious Archive, New York" width="2024" height="599"></a>
  <nav class="nav" aria-label="Main">${nav.map(([t, h]) => `<a href="${h}">${esc(t)}</a>`).join("")}</nav>
</header>
${body}
<footer class="foot">
  <a class="foot-logo" href="${up}" aria-label="Mysterious Archive, New York"><img src="${up}assets/logo_black.png" alt="Mysterious Archive, New York" width="2024" height="599" loading="lazy"></a>
  <div class="row"><span class="label">Mysterious Archive &nbsp;·&nbsp; New York</span><span class="label">${esc(site.date)}</span></div>
  <p class="disclaimer">${esc(site.disclaimer)}</p>
</footer>
<script src="${up}assets/app.js" defer></script>
</body>
</html>
`;
}

function card(p, up) {
  return `<a class="card" href="${up}piece/${p.slug}/">
    <span class="frame"><img src="${up}${p.heroThumb}" alt="${esc(p.title)}" width="${p.heroSize[0] > 700 ? 600 : p.heroSize[0]}" height="${Math.round((600 * p.heroSize[1]) / p.heroSize[0])}" loading="lazy"></span>
    <span class="cname">${esc(p.title)}</span>
    <span class="cmeta"><span class="label">Size ${esc(p.size)}</span><span class="label ${p.sold ? "sold" : "price"}">${priceOf(p)}</span></span>
  </a>`;
}

function home() {
  const up = "./";
  const rows = pieces.map((p) => `<li><a class="prow ${p.sold ? "is-sold" : ""}" href="${up}piece/${p.slug}/"><span class="num label">${pad(p.number)}</span><span class="pname">${esc(p.title)}</span><span class="pprice">${priceOf(p)}</span></a></li>`).join("\n");
  const body = `<main>
<section class="cover">
  <img class="cover-logo" src="${up}assets/logo_black.png" alt="Mysterious Archive, New York" width="2024" height="599">
  <hr class="rule short">
  <h1 class="label silver wide">${esc(site.selection)}</h1>
  <p class="label muted">${esc(site.line)}</p>
</section>
<section class="list" aria-label="The selection">
  <ol>
${rows}
  </ol>
  <div class="total"><span>Selection total</span><span>${usd(total)}</span></div>
  <p class="label muted center small">${esc(site.foot)}</p>
</section>
<section class="grid" aria-label="Pieces">
${pieces.map((p) => card(p, up)).join("\n")}
</section>
</main>`;
  return page({ depth: 0, title: "Mysterious Archive · New York · Private Client Selection", desc: `${site.selection}. ${site.line}. Rare Chrome Hearts archive pieces, New York.`, body, bodyClass: "home" });
}

function reserveHref(p) {
  const subject = `Reserve Piece ${pad(p.number)} / ${pad(count)} · ${p.title}`;
  const bodyText = `I would like to reserve Piece ${pad(p.number)}: ${p.title} (size ${p.size}).`;
  return `mailto:${site.contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
}

function product(p) {
  const up = "../../";
  const imgs = [p.hero, ...p.photos];
  const ratio = (s) => (s[0] / s[1]).toFixed(4);
  const heroImg = `<button class="frame hero" type="button" data-lb="0" aria-label="Open photo"><img src="${up}${p.hero}" alt="${esc(p.title)}" width="${p.heroSize[0]}" height="${p.heroSize[1]}" fetchpriority="high"></button>`;
  const det = p.photos.map((src, i) => `<button class="frame thumb" type="button" data-lb="${i + 1}" style="flex:${ratio(p.photoSizes[i])} 1 0" aria-label="Open detail photo ${i + 1}"><img src="${up}${src}" alt="${esc(p.title)}, detail ${i + 1}" width="${p.photoSizes[i][0]}" height="${p.photoSizes[i][1]}" loading="lazy"></button>`).join("");
  const prev = pieces.find((x) => x.number === p.number - 1), next = pieces.find((x) => x.number === p.number + 1);
  const body = `<main class="piece" data-photos='${esc(JSON.stringify(imgs.map((s) => up + s)))}'>
  <div class="pgrid">
    <div class="area-hero">${heroImg}</div>
    <div class="area-head">
      <p class="label muted">Piece ${pad(p.number)} / ${pad(count)}</p>
      <h1 class="ptitle">${esc(p.title)}</h1>
      <p class="psub">${esc(p.subtitle)}</p>
      <hr class="rule">
    </div>
    <div class="area-text">
      <h2 class="label silver">Model</h2><p>${esc(p.model)}</p>
      <h2 class="label silver">Condition</h2><p>${esc(p.condition)}</p>
      <h2 class="label silver">Rarity</h2><p>${esc(p.rarity)}</p>
    </div>
    <div class="area-panel">
      <div class="panel">
        <div><span class="label muted">Size</span><span class="size">${esc(p.size)}</span></div>
        <div class="pr"><span class="label muted">Price</span><span class="bigprice ${p.sold ? "sold" : ""}">${priceOf(p)}</span></div>
      </div>
      ${p.sold ? `<span class="btn disabled" aria-disabled="true">Sold</span>` : `<a class="btn" href="${esc(reserveHref(p))}">Reserve this piece</a>`}
    </div>
    <div class="area-photos"><div class="photos">${det}</div></div>
  </div>
  <nav class="pnav" aria-label="Pieces">
    ${prev ? `<a class="label" href="${up}piece/${prev.slug}/">&larr; Piece ${pad(prev.number)}</a>` : `<span></span>`}
    <a class="label" href="${up}">All pieces</a>
    ${next ? `<a class="label" href="${up}piece/${next.slug}/">Piece ${pad(next.number)} &rarr;</a>` : `<span></span>`}
  </nav>
</main>
<div class="lb" id="lb" hidden role="dialog" aria-modal="true" aria-label="Photo viewer">
  <button class="lb-close label" type="button" data-lb-close>Close</button>
  <button class="lb-prev label" type="button" data-lb-prev aria-label="Previous photo">&larr;</button>
  <img class="lb-img" alt="">
  <button class="lb-next label" type="button" data-lb-next aria-label="Next photo">&rarr;</button>
  <span class="lb-count label"></span>
</div>`;
  return page({ depth: 2, title: `${p.title} · Mysterious Archive`, desc: `${p.title}. ${p.subtitle}. Size ${p.size}. ${p.sold ? "Sold." : usd(p.price) + "."} Piece ${pad(p.number)} of ${pad(count)}.`, body, bodyClass: "product" });
}

function reserve() {
  const c = site.contact;
  const body = `<main class="center-page">
  <h1 class="bigcaps">How to reserve</h1>
  <div class="prose">
    <p>Reply to your Mysterious Archive contact with the piece number.</p>
    <p>Each piece is one of one in this selection and is held for the first client to confirm.</p>
    <p>Prices are in US dollars and are per piece. Shipping is tracked and quoted at confirmation.</p>
    <p>Measurements and additional photographs of any piece are available on request.</p>
  </div>
  <img class="mid-logo" src="../assets/logo_black.png" alt="Mysterious Archive, New York" width="2024" height="599" loading="lazy">
  <div class="contact">
    <p class="label muted">Contact</p>
    <p><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>
    <p><a href="https://instagram.com/${esc(String(c.instagram).replace(/^@/, ""))}">@${esc(String(c.instagram).replace(/^@/, ""))}</a></p>
  </div>
</main>`;
  return page({ depth: 1, title: "How to Reserve · Mysterious Archive", desc: "How to reserve a piece from the Mysterious Archive private client selection.", body, bodyClass: "reserve" });
}

function about() {
  const body = `<main class="center-page">
  <h1 class="bigcaps">About</h1>
  <div class="prose">
    <p>Mysterious Archive is a boutique in New York for rare Chrome Hearts archive pieces, offered to private clients.</p>
    <p>Selections are small and each piece is one of one. Every piece is photographed, priced and described as it is, with its condition and any flaws stated plainly.</p>
    <p>To reserve a piece, see <a href="../reserve/">How to reserve</a>.</p>
  </div>
</main>`;
  return page({ depth: 1, title: "About · Mysterious Archive", desc: "Mysterious Archive is a New York boutique for rare Chrome Hearts archive pieces, offered to private clients.", body, bodyClass: "about" });
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.cpSync(path.join(root, "assets"), path.join(dist, "assets"), { recursive: true });
fs.cpSync(path.join(root, "src"), path.join(dist, "assets"), { recursive: true });
const css = fs.readFileSync(path.join(root, "assets/fonts/fonts.css"), "utf8");
fs.writeFileSync(path.join(dist, "assets/styles.css"), css + fs.readFileSync(path.join(root, "src/styles.css"), "utf8"));
const w = (rel, html) => { const f = path.join(dist, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); };
w("index.html", home());
for (const p of pieces) w(`piece/${p.slug}/index.html`, product(p));
w("reserve/index.html", reserve());
w("about/index.html", about());
console.log(`built ${pieces.length} pieces + 3 pages -> ${dist}`);
