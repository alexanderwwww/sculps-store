# Mea Culpa — design spec

Everything below is derived from φ = 1.618034. Nothing is a round number picked by feel.

Two rules generate the whole system:

1. **Spacing and type step along the Fibonacci sequence** — 8, 13, 21, 34, 55, 89, 144, 233.
   Consecutive Fibonacci numbers approach φ, so every gap in the page relates to its neighbour
   by the same ratio. This is why the page feels settled without anything being centred or
   symmetrical.
2. **Every rectangle that carries meaning is a golden rectangle** — the product image frame,
   the category tile, the product-page column split, and the hero's share of the viewport.

---

## 1. Tokens

```css
:root {
  /* ── Ratio ─────────────────────────────────────────── */
  --phi: 1.618034;
  --phi-major: 61.8%;   /* 1 / φ        */
  --phi-minor: 38.2%;   /* 1 − (1 / φ)  */

  /* ── Space: Fibonacci ──────────────────────────────── */
  --s-1:   8px;
  --s-2:  13px;
  --s-3:  21px;
  --s-4:  34px;
  --s-5:  55px;
  --s-6:  89px;
  --s-7: 144px;
  --s-8: 233px;

  /* ── Type: Fibonacci ───────────────────────────────── */
  --t-label:  11px;   /* optical exception — uppercase reads ~2px larger */
  --t-body:   13px;
  --t-lead:   21px;
  --t-h2:     34px;
  --t-h1:     55px;
  --t-mark:   89px;

  --lh-tight: 1.05;
  --lh-flat:  1;
  --lh-body:  1.618;  /* golden leading */

  --track-label: 0.08em;
  --track-head: -0.02em;

  /* ── Colour ────────────────────────────────────────── */
  --ground:     #FFFFFF;
  --ground-alt: #F5F4F1;
  --ink:        #0A0A0A;
  --muted:      #767674;
  --line:       #E6E4DF;
  --sale:       #D8232A;

  /* ── Grid ──────────────────────────────────────────── */
  --max:     1440px;
  --margin:    55px;  /* --s-5 */
  --gutter:    21px;  /* --s-3 */

  /* ── Motion ────────────────────────────────────────── */
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --dur:  380ms;
}

@media (max-width: 767px) {
  :root {
    --margin: 13px;   /* --s-2 */
    --gutter: 13px;
    --t-h1:   34px;
    --t-h2:   21px;
    --t-mark: 55px;
  }
}
```

One family throughout: **Archivo** (or Inter). Weights 400 and 500 only. No 600, no 700 —
weight is not how this design creates emphasis; scale and space are.

---

## 2. Grid math

Container `1440`, margins `55` each side → **content width 1330**.

| Breakpoint | Cols | Margin | Gutter | Column | Image frame (w × w·φ) |
|---|---:|---:|---:|---:|---|
| ≥1200 desktop | 5 | 55 | 21 | 249.2 | **249 × 403** |
| 768–1199 tablet | 3 | 34 | 21 | 304.7 @1024 | 305 × 493 |
| ≤767 mobile | 2 | 13 | 13 | 175.5 @390 | 176 × 284 |

```
desktop: (1330 − 4 × 21) ÷ 5 = 1246 ÷ 5 = 249.2
mobile:  (364  − 1 × 13) ÷ 2 = 351  ÷ 2 = 175.5
```

```css
.grid {
  max-width: var(--max);
  margin-inline: auto;
  padding-inline: var(--margin);
  display: grid;
  gap: var(--gutter);
  grid-template-columns: repeat(5, 1fr);
}
@media (max-width: 1199px) { .grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width:  767px) { .grid { grid-template-columns: repeat(2, 1fr); } }
```

Five across, not three. With 167 products a 3-up grid makes the catalogue read as a dozen
items; 5-up at a 249px column is the density Farfetch runs and it lets a full row plus the
top of the next one sit inside the fold.

---

## 3. Page order

```
┌─ header ────────────── 89px desktop / 55px mobile, sticky, white
├─ HERO ──────────────── 61.8vh  ← golden section of the viewport
├─ announcement ──────── 55px, black band, white 11px caps
├─ NEW IN ────────────── product grid, white, 10 products
├─ category tiles ────── 3 golden-landscape tiles
├─ editorial split ───── 61.8 / 38.2
├─ SALE ──────────────── product grid, white, 10 products
├─ community ─────────── 4 squares
├─ newsletter ────────── #F5F4F1 band
└─ footer ────────────── 4 columns over a large wordmark
```

Hero sits **above** the announcement bar. The bar reads as a caption strip under the image
rather than a banner stapled to the top of the browser, and it gives the eye a hard black rule
to cross before the products start.

---

## 4. Hero

**The hero takes the golden section of the viewport: `61.8vh`.** The remaining `38.2vh` carries
the announcement bar and the first row of products. This is the whole reason the products are
visible on entry — it is not a guess, it is the fold placed at the golden section.

```css
.hero {
  position: relative;
  height: 61.8vh;
  min-height: 480px;
  overflow: hidden;
  background: var(--ink);
}
.hero img {
  width: 100%; height: 100%;
  object-fit: cover;
  object-position: center 38.2%;   /* subject on the upper golden line */
}
.hero__cta {
  position: absolute;
  left: var(--margin);
  bottom: var(--s-5);
  padding: var(--s-2) var(--s-4);
  border: 1px solid #FFF;
  color: #FFF;
  font-size: var(--t-label);
  text-transform: uppercase;
  letter-spacing: var(--track-label);
  line-height: var(--lh-flat);
}
@media (max-width: 767px) {
  .hero { height: 61.8vh; min-height: 420px; }
  .hero__cta { left: var(--margin); right: var(--margin); bottom: var(--s-4); text-align: center; }
}
```

**Desktop** — 61.8vh, ~890px at a 1440×900 window. Landscape crop, CTA bottom-left on the
margin line, no headline over the image.

**Mobile** — 61.8vh, ~521px at 390×844. Portrait crop of the same asset via `object-position`,
CTA becomes a full-width outlined bar above the fold edge. Ship two crops, not one image
squeezed: desktop `2880 × 1112` (2× of 1440×556), mobile `780 × 1042` (2× of 390×521).

Subject sits on `center 38.2%` — the upper golden line — so faces and product stay clear of
the CTA and the announcement bar below.

---

## 5. Announcement bar

```css
.announce {
  height: 55px;
  display: grid; place-items: center;
  background: var(--ink);
  color: #FFF;
  font-size: var(--t-label);
  text-transform: uppercase;
  letter-spacing: var(--track-label);
  line-height: var(--lh-flat);
}
```

One line: `FREE SHIPPING ON ORDERS OVER $75`. Static — no marquee, no scroll, no pink. A single
black rule 55px tall separating image from product.

---

## 6. Product card

No add-to-cart. No quick-buy. No hover button. **The entire card is one link to the product
page.** The only interaction is the image swapping to the second shot.

```css
.card { display: block; color: var(--ink); text-decoration: none; }

.card__frame {
  position: relative;
  aspect-ratio: 1 / 1.618;      /* golden rectangle, portrait */
  background: var(--ground);
  overflow: hidden;
}
.card__frame img {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: contain;           /* cut-outs breathe — never crop the product */
  padding: var(--s-3);
  transition: opacity var(--dur) var(--ease);
}
.card__img--alt { opacity: 0; }
.card:hover .card__img--alt  { opacity: 1; }
.card:hover .card__img--main { opacity: 0; }

.card__meta { padding-top: var(--s-2); }
.card__title {
  font-size: var(--t-body);
  line-height: var(--lh-body);
  font-weight: 400;
}
.card__price { font-size: var(--t-body); color: var(--muted); }
.card__price del { margin-right: var(--s-1); }
.card__price ins { color: var(--sale); text-decoration: none; }
```

`object-fit: contain` with `21px` padding, not `cover`. These are cut-outs on white — cropping
a beanie or a boot to fill a frame is what makes a store look cheap. The golden frame gives
tall product (boots, sweatpants) room and short product (beanies) air.

Sale price in `#D8232A`, original struck through in `--muted`. That red is the only colour on
the page and it appears on maybe 30 of 167 cards.

---

## 7. Product grid sections

```css
.section       { padding-block: var(--s-7); }          /* 144px */
.section--tight{ padding-block: var(--s-6); }          /*  89px */
.section__label {
  font-size: var(--t-body);
  text-transform: uppercase;
  letter-spacing: var(--track-label);
  margin-bottom: var(--s-4);                            /* 34px  */
}
@media (max-width: 767px) { .section { padding-block: var(--s-6); } }
```

Section headings are `13px` uppercase labels — `NEW IN`, `SALE` — not display type. The
products are the headline.

**NEW IN** — collection `new-arrivals`, 10 products, two rows of 5.
**SALE** — collection `70-off-sale`, 10 products, two rows of 5.

---

## 8. Category tiles

Three tiles, golden **landscape** (the inverse of the card) so the row reads as a horizon
against all those portrait cards above it.

```
width  = (1330 − 2 × 21) ÷ 3 = 1288 ÷ 3 = 429.3
height = 429.3 ÷ φ = 265.4
```

```css
.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--gutter); }
.tile  { position: relative; aspect-ratio: 1.618 / 1; overflow: hidden; }
.tile img { width: 100%; height: 100%; object-fit: cover; }
.tile__label {
  position: absolute; left: var(--s-3); bottom: var(--s-3);
  color: #FFF; font-size: var(--t-label);
  text-transform: uppercase; letter-spacing: var(--track-label);
}
@media (max-width: 767px) { .tiles { grid-template-columns: 1fr; } }
```

`BEANIES` (90) · `SWIM` (21) · `TOPS` (10). Needs 3 images at `860 × 532` minimum.

---

## 9. Editorial split

The golden split, stated literally.

```css
.split { display: grid; grid-template-columns: var(--phi-major) var(--phi-minor); gap: var(--s-5); }
.split__media { aspect-ratio: 1.618 / 1; }
.split__body  { align-self: center; padding-right: var(--s-5); }
.split__body h2 { font-size: var(--t-h1); line-height: var(--lh-tight); letter-spacing: var(--track-head); }
.split__body p  { font-size: var(--t-body); line-height: var(--lh-body); margin-top: var(--s-3); max-width: 42ch; }
@media (max-width: 767px) { .split { grid-template-columns: 1fr; gap: var(--s-4); } }
```

Copy from the About page: *"Mea Culpa is a clothing brand based out of Philadelphia.
Established in 2020, we push the boundaries…"*

---

## 10. Community row

Four squares — the one place the grid breaks its portrait rhythm.

```
(1330 − 3 × 21) ÷ 4 = 1267 ÷ 4 = 316.75
```

```css
.community { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--gutter); }
.community a { aspect-ratio: 1; overflow: hidden; }
@media (max-width: 767px) { .community { grid-template-columns: repeat(2, 1fr); } }
```

Label `@MEACULPA.CO`, links to instagram.com/meaculpa.co. Needs 4 square images at `640 × 640`.

---

## 11. Header

```css
.header {
  position: sticky; top: 0; z-index: 100;
  height: 89px;
  background: var(--ground);
  border-bottom: 1px solid var(--line);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding-inline: var(--margin);
}
.header__nav a, .header__util a {
  font-size: var(--t-label);
  text-transform: uppercase;
  letter-spacing: var(--track-label);
}
.header__nav { display: flex; gap: var(--s-4); }
.header__util { display: flex; gap: var(--s-4); justify-self: end; }
.header__logo { height: 21px; }
@media (max-width: 767px) { .header { height: 55px; grid-template-columns: 1fr auto 1fr; } }
```

Nav left `SHOP · NEW IN · SALE · ABOUT`, wordmark centre at `21px` tall, utilities right
`SEARCH · ACCOUNT · CART (0)`. **Search is on** — it is switched off today.

`SHOP` opens a flat dropdown: BEANIES (90) · SWIM (21) · TOPS (10) · DRESSES (4) · SETS (3) ·
ACCESSORIES (3). Empty collections never appear in navigation.

---

## 12. Product page

Golden split again, this time on the page's main axis.

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

.pdp__title { font-size: var(--t-lead); line-height: var(--lh-tight); }
.pdp__price { font-size: var(--t-lead); margin-top: var(--s-2); }
.pdp__atc {
  width: 100%; height: 55px;
  background: var(--ink); color: #FFF;
  font-size: var(--t-label); text-transform: uppercase; letter-spacing: var(--track-label);
  margin-top: var(--s-4);
}
.pdp__row { border-top: 1px solid var(--line); padding-block: var(--s-3); font-size: var(--t-label); }
@media (max-width: 767px) { .pdp { grid-template-columns: 1fr; } .pdp__media { grid-template-columns: 1fr; } }
```

Right rail, sticky: title → price → colour swatches (`34px` squares) → size row (`34px` tall) →
`ADD TO CART` at `55px` full width → four collapsible rows.

**All four rows ship open-capable and populated** — `DESCRIPTION`, `SIZE CHART`, `MATERIALS`,
`SHIPPING & RETURNS`. Every one of these exists in the current theme and is disabled. The size
chart is the single biggest fix on the store.

Mobile: full-bleed slider with a `3/8` counter, then the rail stacked, with a sticky bottom bar
carrying price and `ADD TO CART` at `55px`.

---

## 13. Footer

```css
.footer { background: var(--ground-alt); padding-block: var(--s-7) var(--s-5); }
.footer__cols { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--gutter); }
.footer__cols h3 { font-size: var(--t-label); text-transform: uppercase; letter-spacing: var(--track-label); margin-bottom: var(--s-3); }
.footer__cols a  { font-size: var(--t-body); line-height: var(--lh-body); color: var(--muted); display: block; }
.footer__mark {
  margin-top: var(--s-7);
  font-size: clamp(55px, 16vw, 233px);
  line-height: var(--lh-flat);
  letter-spacing: var(--track-head);
}
@media (max-width: 767px) { .footer__cols { grid-template-columns: repeat(2, 1fr); row-gap: var(--s-4); } }
```

Columns: **SHOP** (6 collections) · **INFORMATION** (About, Shipping, Refund, Privacy, Terms) ·
**CONTACT** (email, Instagram, TikTok) · **NEWSLETTER**.

The `policy` menu with all five legal links already exists in Shopify and is wired to nothing.
Connecting it restores the entire legal footer in one move.

Below the columns: the wordmark set large, then payment icons, country/language selector, and a
real copyright line — currently an empty string.

---

## 14. Asset sizes to produce

| Asset | Dimensions (2×) | Count |
|---|---|---|
| Hero desktop | 2880 × 1112 | 1 |
| Hero mobile | 780 × 1042 | 1 |
| Category tile | 860 × 532 | 3 |
| Editorial split | 1620 × 1002 | 1 |
| Community square | 640 × 640 | 4 |
| Product cut-out | 996 × 1612 | per product |

Product shots go on pure `#FFFFFF` with the subject occupying roughly `61.8%` of the frame
height — the same ratio as everything else, which is what makes a grid of 167 mixed products
read as one set.
