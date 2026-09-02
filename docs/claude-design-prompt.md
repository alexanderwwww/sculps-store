Build a complete storefront for **Mea Culpa**, a Philadelphia streetwear label founded in 2020, relaunching on Shopify. Catalogue is 167 products: 90 beanies, 21 swim, 10 tops, 4 dresses, 3 sets, 3 accessories.

**Deliver full working pages, not mockups.** Every artboard should be complete, production-quality HTML and CSS I can lift straight into Shopify Liquid sections — real markup, real grid, real responsive behaviour, real hover states. No greeked boxes standing in for components.

---

## Direction

The clean neutral restraint of Rhode and SKIMS, with the harder editorial edge of Mowalola, landing where Farfetch lands. Products are cut out on pure white and are visible the moment you land. Quiet, fast, generous with whitespace, nothing decorative. No page-builder look, no gradients, no shadows, no rounded corners anywhere.

## The ratio

Everything is derived from φ = 1.618034. Nothing is a round number picked by feel. Two rules generate the system:

1. Spacing and type step along the Fibonacci sequence — **8, 13, 21, 34, 55, 89, 144, 233**. Consecutive Fibonacci numbers approach φ, so every gap relates to its neighbour by the same ratio.
2. Every rectangle that carries meaning is a golden rectangle — the product image frame, the category tile, the product-page column split, and the hero's share of the viewport.

```css
:root {
  --phi: 1.618034;
  --phi-major: 61.8%;   /* 1 / φ */
  --phi-minor: 38.2%;

  --s-1: 8px;  --s-2: 13px; --s-3: 21px;  --s-4: 34px;
  --s-5: 55px; --s-6: 89px; --s-7: 144px; --s-8: 233px;

  --t-label: 11px;  /* optical exception — uppercase reads ~2px larger */
  --t-body:  13px;
  --t-lead:  21px;
  --t-h2:    34px;
  --t-h1:    55px;
  --t-mark:  89px;

  --lh-tight: 1.05;
  --lh-flat:  1;
  --lh-body:  1.618;    /* golden leading */
  --track-label: 0.08em;
  --track-head: -0.02em;

  --ground: #FFFFFF;  --ground-alt: #F5F4F1;
  --ink:    #0A0A0A;  --muted:      #767674;
  --line:   #E6E4DF;  --sale:       #D8232A;

  --max: 1440px; --margin: 55px; --gutter: 21px;
  --ease: cubic-bezier(0.22, 1, 0.36, 1); --dur: 380ms;
}
@media (max-width: 767px) {
  :root { --margin: 13px; --gutter: 13px; --t-h1: 34px; --t-h2: 21px; --t-mark: 55px; }
}
```

**Type:** one family throughout — Archivo, or Inter if Archivo is unavailable. Weights **400 and 500 only**. No 600, no 700. Weight is not how this design creates emphasis; scale and space are.

**Colour:** `#D8232A` is the only colour on the page and it appears only on sale prices and sale badges. No pink anywhere.

## Grid

Container 1440, margins 55 each side → content width 1330.

```
desktop: (1330 − 4 × 21) ÷ 5 = 249.2  → image frame 249 × 403
mobile:  (364  − 1 × 13) ÷ 2 = 175.5  → image frame 176 × 284
```

| Breakpoint | Columns | Margin | Gutter |
|---|---:|---:|---:|
| ≥1200 | 5 | 55 | 21 |
| 768–1199 | 3 | 34 | 21 |
| ≤767 | 2 | 13 | 13 |

Five across, not three. With 167 products a 3-up grid makes the catalogue read as a dozen items.

## Page order — note the hero sits above the announcement bar

```
header ────────── 89px desktop / 55px mobile, sticky, white, 1px bottom rule
HERO ──────────── 61.8vh            ← golden section of the viewport
announcement ──── 55px black band, white 11px caps
NEW IN ────────── product grid, white, 10 products
category tiles ── 3 golden-landscape tiles
editorial split ─ 61.8 / 38.2
SALE ──────────── product grid, white, 10 products
community ─────── 4 squares
newsletter ────── #F5F4F1 band
footer ────────── 4 columns over a large wordmark
```

The announcement bar reads as a caption strip under the hero image, not a banner stapled to the top of the browser. It gives the eye a hard black rule to cross before the products start.

## Hero

**The hero takes the golden section of the viewport: `61.8vh`.** The remaining `38.2vh` carries the announcement bar and the first row of products. This is the whole reason products are visible on entry — the fold is placed at the golden section deliberately.

```css
.hero { position: relative; height: 61.8vh; min-height: 480px; overflow: hidden; background: var(--ink); }
.hero img { width: 100%; height: 100%; object-fit: cover; object-position: center 38.2%; }
.hero__cta {
  position: absolute; left: var(--margin); bottom: var(--s-5);
  padding: var(--s-2) var(--s-4); border: 1px solid #FFF; color: #FFF;
  font-size: var(--t-label); text-transform: uppercase;
  letter-spacing: var(--track-label); line-height: var(--lh-flat);
}
@media (max-width: 767px) {
  .hero { min-height: 420px; }
  .hero__cta { left: var(--margin); right: var(--margin); bottom: var(--s-4); text-align: center; }
}
```

Subject sits on `center 38.2%` — the upper golden line — so faces and product stay clear of the CTA and the bar below. Desktop is a landscape crop with the CTA bottom-left on the margin line, no headline over the image. Mobile is a portrait crop of the same asset with the CTA as a full-width outlined bar. One CTA only: `SHOP NEW IN`.

## Product card — this is the important one

No add-to-cart. No quick-buy. No hover button. **The entire card is a single link to the product page.** The only interaction is the image swapping to the second shot.

```css
.card { display: block; color: var(--ink); text-decoration: none; }
.card__frame {
  position: relative; aspect-ratio: 1 / 1.618;   /* golden rectangle, portrait */
  background: var(--ground); overflow: hidden;
}
.card__frame img {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: contain;                            /* never crop the product */
  padding: var(--s-3);
  transition: opacity var(--dur) var(--ease);
}
.card__img--alt { opacity: 0; }
.card:hover .card__img--alt  { opacity: 1; }
.card:hover .card__img--main { opacity: 0; }

.card__meta  { padding-top: var(--s-2); }
.card__title { font-size: var(--t-body); line-height: var(--lh-body); font-weight: 400; }
.card__price { font-size: var(--t-body); color: var(--muted); }
.card__price del { margin-right: var(--s-1); }
.card__price ins { color: var(--sale); text-decoration: none; }
```

`object-fit: contain` with 21px padding, not `cover`. These are cut-outs on white — cropping a beanie or a boot to fill a frame is what makes a store look cheap. The golden frame gives tall product (boots, sweatpants) room and short product (beanies) air.

## Sections

```css
.section { padding-block: var(--s-7); }            /* 144px, 89px on mobile */
.section__label {
  font-size: var(--t-body); text-transform: uppercase;
  letter-spacing: var(--track-label); margin-bottom: var(--s-4);
}
```

Section headings are 13px uppercase labels — `NEW IN`, `SALE` — not display type. The products are the headline.

**Category tiles** are golden *landscape* (the inverse of the card) so the row reads as a horizon against the portrait cards above: `aspect-ratio: 1.618 / 1`, three across, `(1330 − 42) ÷ 3 = 429 × 265`. Labels `BEANIES (13)` · `SWIM (12)` · `TOPS (10)`, white 11px caps bottom-left. These are live, in-stock counts — the store's own collection totals include archived products and overstate every category.

**Editorial split** is the golden split stated literally: `grid-template-columns: 61.8% 38.2%`, media `aspect-ratio: 1.618 / 1`, copy centred in the minor column, heading 55px at −0.02em, body 13px at 1.618 line-height, max 42ch.

**Community row** is four squares — the one place the grid breaks its portrait rhythm. `(1330 − 63) ÷ 4 = 316.75`. Label `@MEACULPA.CO`.

## Header

Sticky, 89px desktop / 55px mobile, white, 1px `--line` bottom rule. Three-column grid: nav left `SHOP · NEW IN · SALE · ABOUT`, wordmark centre at 21px tall, utilities right `SEARCH · ACCOUNT · CART (0)`. All 11px uppercase at 0.08em. `SHOP` opens a flat dropdown: BEANIES · SWIM · TOPS · DRESSES · SETS · ACCESSORIES. Mobile collapses to a hamburger with the wordmark centred.

## Product page

The golden split again, on the page's main axis:

```
content 1330 − gap 21 = 1309
media = 1309 × 0.618 = 809
rail  = 1309 × 0.382 = 500
```

```css
.pdp { display: grid; grid-template-columns: var(--phi-major) var(--phi-minor); gap: var(--s-3); }
.pdp__media { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-1); }
.pdp__media figure { aspect-ratio: 1 / 1.618; background: var(--ground); }
.pdp__rail { position: sticky; top: calc(89px + var(--s-5)); align-self: start; padding-left: var(--s-5); }
.pdp__atc {
  width: 100%; height: 55px; background: var(--ink); color: #FFF;
  font-size: var(--t-label); text-transform: uppercase;
  letter-spacing: var(--track-label); margin-top: var(--s-4);
}
.pdp__row { border-top: 1px solid var(--line); padding-block: var(--s-3); font-size: var(--t-label); }
```

Left is a two-up image grid that scrolls. Right rail is sticky: title (21px) → price (21px) → colour swatches (34px squares) → size row (34px tall) → `ADD TO CART` full width at 55px → four collapsible rows: `DESCRIPTION`, `SIZE CHART`, `MATERIALS`, `SHIPPING & RETURNS`. Below, a `YOU MAY ALSO LIKE` row of 5 cards.

Mobile: full-bleed image slider with a `3/8` counter, then the rail stacked, plus a sticky bottom bar carrying price and `ADD TO CART` at 55px.

## Footer

`#F5F4F1`, padding 144px top / 55px bottom. Four columns: **SHOP** (six collections) · **INFORMATION** (About, Shipping, Refund, Privacy, Terms) · **CONTACT** (email, Instagram, TikTok) · **NEWSLETTER** (single input, solid black `JOIN` button, "Get 10% off your next purchase"). Below the columns, the wordmark set very large — `clamp(55px, 16vw, 233px)` at −0.02em — then payment icons, country/language selector, and a copyright line.

---

## Artboards

1. **Desktop homepage** (1440 × full scroll) — the complete page in the order above.
2. **Mobile homepage** (390 × full scroll) — same order, hero 61.8vh, product rows 2-up, category tiles stacked, hamburger nav.
3. **Collection page, desktop** (1440) — breadcrumb, collection title with product count, left filter rail (size, colour, price, availability), sort dropdown, 5-up grid of 15 cards. Infinite scroll, no pagination numbers.
4. **Product page, desktop** (1440) — as specified above.
5. **Product page, mobile** (390) — as specified above.
6. **Component sheet** (1440) — header default and scrolled, footer, product card in default / hover / sale states, buttons primary / secondary / disabled, form input, collapsible row open and closed, size and colour swatch states, sale badge, breadcrumb, and the full type scale with every colour token swatched and labelled with its hex and its Fibonacci step.

Use tasteful placeholder imagery: dark editorial fashion photography for the hero and editorial split, and cut-out beanies, boots, hoodies and swimwear on pure white for the product cards.
