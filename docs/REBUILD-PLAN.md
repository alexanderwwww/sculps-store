# Mea Culpa — rebuild plan

Direction: **between Mowalola and Rhode, landing on Farfetch/SKIMS.** Clean, fast, quiet.
Products cut out on white, visible the moment you land. Editorial imagery used sparingly and
full-bleed. No page builder.

Baseline being replaced is documented in [`STORE-MAP.md`](STORE-MAP.md).

---

## 1. What we keep, what we kill

**Kill**

| Thing | Why |
|---|---|
| PageFly | Page builder bloat; every layout below is a native theme section |
| AMP Slide Cart Drawer | Theme has a native drawer; two carts load today |
| GSC Countdown Timer | Every placed block is already disabled |
| Bundler | Only used for one empty-shortcode block on the PDP |
| Pink `#e65cc4` as the button colour | Reads cheap against product-on-white; keep it only as a sale accent |
| Monospace body font (`anonymous_pro`) | Wrong register for apparel |
| 4 duplicate bikini collections, `sets` (dupe of `sets-1`) | Empty and confusing |
| 9 orphaned page templates | contact, lookbook, faq, press, events, brands, about, single-column |

**Keep**

- The Bullet section library — `gs-hero`, `gs-marquee`, `gs-collage`, `gs-featured-collection`,
  `gs-image-text`, `gs-hero-double` cover every layout below natively.
- Swatch King (real variant swatches) and Klaviyo (email capture).
- The zipper logo, the CULPA mark, and the lifestyle photography already on the CDN.

---

## 2. Design system

**Colour**

| Token | Value | Use |
|---|---|---|
| Ground | `#FFFFFF` | page background, product cards |
| Ground alt | `#F5F4F1` | alternating editorial bands, footer |
| Ink | `#0A0A0A` | text, buttons, borders |
| Muted | `#767674` | secondary copy, prices struck through |
| Line | `#E6E4DF` | 1px rules, card dividers |
| Sale | `#D8232A` | sale price and sale badge **only** |

Retire pink from buttons and links. Buttons become solid black, no radius. The one place a hot
colour survives is the sale price — that's the Farfetch move, and it makes 70% OFF read as
premium rather than desperate.

**Type** — one family, `Archivo` or `Inter` (both in the Shopify font picker).

| Role | Spec |
|---|---|
| Nav / labels / buttons | 11px, uppercase, tracking `0.08em` |
| Product title | 13px regular |
| Price | 13px, sale price in `#D8232A` |
| Section heading | 13px uppercase, tracking `0.08em` — *not* a big display heading |
| Editorial heading | 32px mobile / 56px desktop, tracking `-0.02em` |
| Body | 15px, line-height 1.6 |

**Layout**

- Max width `1440px`, 40px desktop margins / 16px mobile. Wider than the current 1200px boxed.
- 8px spacing base. Section rhythm 112px desktop / 64px mobile.
- Zero border radius anywhere. 1px `Line` rules, no shadows.
- Product grid: 5-up desktop, 3-up tablet, 2-up mobile. (Current theme is 3/3/2 — too big,
  makes 167 products feel like 12.)

**Product card**

Cut-out product on pure white, 3:4 portrait, no border, no card background. Hover swaps to the
second image. Title and price below, left aligned, no quick-buy button cluttering the grid —
quick-add appears on hover only.

---

## 3. Homepage structure

The rule: **hero is a band, not a screen.** It sits at ~62vh so the first row of products is
visible on entry without scrolling.

| # | Section | Type | Content |
|---|---|---|---|
| 1 | Announcement | `header-marquee` | One line, black on white, no marquee animation. `FREE SHIPPING OVER $75` |
| 2 | Header | `header` | Logo left, nav `SHOP · NEW IN · SALE · ABOUT`, right `SEARCH · ACCOUNT · CART`. Solid white, sticky, 1px bottom rule. **Search on** (it's off today.) |
| 3 | Hero | `gs-hero` | Full-bleed editorial, 62vh desktop / 70vh mobile. One image, one CTA. Use `meaculpalifestyle-668_1.jpg` (3598×2400) — the only properly wide asset on the CDN |
| 4 | **NEW IN** | `gs-featured-collection` | `new-arrivals` (11 products), 10 shown, 5-up, cut-outs on white. This is the first thing below the hero |
| 5 | Category row | `gs-collage` | 3 tiles: BEANIES (90) · SWIM (21) · TOPS (10). Needs 3 new collection images — see §6 |
| 6 | Editorial split | `gs-image-text` | Image left, copy right. Brand story pulled from the About page: *"Mea Culpa is a clothing brand based out of Philadelphia. Established in 2020."* |
| 7 | **SALE** | `gs-featured-collection` | `70-off-sale` (30 products), 10 shown, 5-up, sale prices in red |
| 8 | Community | `gs-collage` | 4-up Instagram/TikTok row. Revives the copy already written and disabled: *"Join the Mea Culpa community…"* Links to @meaculpa.co |
| 9 | Newsletter | `footer` block | `Get 10% off your next purchase.` Single input, black JOIN button |
| 10 | Footer | `footer` + `footer-bottom` | See §5 |

Sections cut from today's homepage: the second empty-collection grid, the linkless double
banner, and three dead app sections.

---

## 4. Product page

Every trust block that exists today is disabled. Turn them on and fill them.

| Block | Change |
|---|---|
| Media | Two-column, sticky right rail. Zoom on. Thumbnails **on** (off today) |
| Title / price | Sale price in `#D8232A`, compare-at struck through in `Muted` |
| Variant picker | Keep Swatch King square swatches |
| **Size chart** | **Enable.** Wire `fun-day-bikini-sizing-chart` to swim products; write the two empty hoodie/sweatpants charts |
| **Materials** | **Enable.** `90% Polyester / 10% Spandex` is already written; needs a beanie equivalent |
| **Shipping & returns** | **Enable and write it.** Currently enabled-block-with-empty-content |
| Buy button | Solid black, full width. Keep the sticky mobile bar |
| Share | Enable — it's off today |
| Recommendations | Keep 6, same 5-up grid as the homepage |
| Bundler block | Remove |

---

## 5. Navigation and footer

**Header nav** — 4 items, all pointing at collections with real inventory:

| Label | Target | Products |
|---|---|---|
| SHOP | `/collections/shop-all` | 166 |
| NEW IN | `/collections/new-arrivals` | 11 |
| SALE | `/collections/70-off-sale` | 30 |
| ABOUT | `/pages/about-us` | — |

SHOP opens a dropdown: BEANIES (90) · SWIM (21) · TOPS (10) · DRESSES (4) · SETS (3) ·
ACCESSORIES (3). Every empty collection is dropped from nav.

**Footer** — four columns over a large wordmark, Rhode-style.

| Column | Links |
|---|---|
| SHOP | Beanies · Swim · Tops · Dresses · Sets · Accessories |
| INFORMATION | About Us · Shipping Policy · Refund Policy · Privacy Policy · Terms of Service |
| CONTACT | Email · Instagram · TikTok |
| NEWSLETTER | Input + JOIN |

The `policy` menu already exists in Shopify with all five links and is wired to nothing today —
this is a five-minute fix that restores the entire legal footer.

Below: large `mowalola`-style wordmark using the existing zipper logo, then payment icons,
country/language selector, and a real copyright line (empty string today).

---

## 6. Content gaps to fill before launch

These block the design, so they come first.

1. **3 collection images** for BEANIES, SWIM, TOPS — only `beanies`, `t-shirts` and
   `accessories` have images today, and the beanies one is a 1000×1000 JPG.
2. **1 wide hero image**, 2400×1400 minimum. The current hero is a 4080×2295 wallpaper crop
   paired with a raw 4000×6000 phone photo.
3. **4 community images**, square, for the Instagram row.
4. **Shipping & returns copy** — the block exists and is empty.
5. **Hoodie and sweatpants size charts** — both pages exist and are blank.
6. **Beanie materials copy** — only the swim composition is written.
7. **Fix 3 broken pages**: `hoodie-size-chart` and `sweatpants-size-chart` request a missing
   `page.page.json`; `mc-ice-bundle` requests a missing `page.MaxBundle.json`.
8. **Empty the junk**: delete `bikini-tops-2`, `bikini-bottoms-2`, `sets`, and either fill or
   delete `sweatsuits`, `mystery-boxes`, `sucura-tops-bottoms`, `bikini-tops`, `bikini-bottoms`.

---

## 7. Order of work

| Phase | Work |
|---|---|
| 1 | Design the canvas (§8 prompt) and lock the direction |
| 2 | Collection and menu cleanup — delete empties, rebuild nav, wire the `policy` menu into the footer |
| 3 | Theme settings — colour, type, grid, card style, retire pink |
| 4 | Homepage sections rebuilt in the order above |
| 5 | Product page — enable and fill every trust block |
| 6 | Remove PageFly, AMP cart, GSC countdown, Bundler |
| 7 | Shoot or source the 8 content gaps in §6 |
| 8 | QA on mobile, then publish |

---

## 8. Claude Design prompt

Paste this into Claude Design as a single prompt.

> Design a 6-artboard canvas for **Mea Culpa**, a Philadelphia streetwear label (founded 2020)
> relaunching its Shopify store. 167 products: 90 beanies, 21 swim, 10 tops, 4 dresses, 3 sets,
> 3 accessories.
>
> **Direction:** the clean neutral restraint of Rhode and SKIMS, with the harder editorial edge
> of Mowalola, landing where Farfetch lands. Products are cut out on pure white and appear
> immediately on entry — the hero is a band, not a full screen. Quiet, fast, generous with
> whitespace, nothing decorative. No page-builder look, no gradients, no shadows, no rounded
> corners.
>
> **Palette:** white `#FFFFFF` ground, warm grey `#F5F4F1` for alternating bands and footer,
> near-black `#0A0A0A` for text and buttons, `#767674` muted, `#E6E4DF` 1px rules, and a single
> red `#D8232A` used *only* for sale prices and sale badges. No other colour anywhere.
>
> **Type:** one grotesk (Archivo or Inter) throughout. Nav, labels and buttons at 11px uppercase
> with 0.08em tracking. Product titles 13px regular, prices 13px. Section headings are small
> uppercase labels at 13px — not big display type. Editorial headings 56px desktop / 32px mobile
> at -0.02em tracking. Body 15px at 1.6 line-height.
>
> **Layout:** 1440px max width, 40px desktop margins, 8px spacing base, 112px section rhythm.
> Zero border radius. Product grid 5-up desktop, 3-up tablet, 2-up mobile. Product cards have no
> border and no background — just the cut-out on white in a 3:4 portrait frame, with title and
> price left-aligned below and quick-add revealed on hover only.
>
> **Artboard 1 — Desktop homepage, full scroll.** In order: thin black-on-white announcement bar
> reading `FREE SHIPPING OVER $75`; sticky white header with the wordmark left, nav
> `SHOP · NEW IN · SALE · ABOUT` and `SEARCH · ACCOUNT · CART` right, 1px bottom rule; a
> full-bleed editorial hero at 62vh with one small outlined CTA reading `SHOP NEW IN`; then
> immediately a `NEW IN` product row — 10 cut-out products, 5 across, two rows, on white; a
> three-tile category row labelled `BEANIES` / `SWIM` / `TOPS`; an editorial split block with a
> full-bleed image on the left and short brand copy plus a CTA on the right; a `SALE` product row,
> 10 products 5-across, prices struck through in grey with the sale price in red; a four-up
> community row of square Instagram images under the label `@MEACULPA.CO`; a newsletter band on
> `#F5F4F1` reading "Get 10% off your next purchase" with a single email input and a solid black
> `JOIN` button; and a four-column footer over a very large wordmark.
>
> **Artboard 2 — Mobile homepage (390px).** Same order. Hero 70vh. Product rows become 2-up
> grids. Category tiles stack. Nav collapses to a hamburger with the wordmark centred.
>
> **Artboard 3 — Collection page, desktop.** Breadcrumb, collection title with product count,
> a left filter rail (size, colour, price, availability) and a sort dropdown, then a 5-up product
> grid of 15 cut-outs on white. Infinite scroll, no pagination numbers.
>
> **Artboard 4 — Product page, desktop.** Two-column: left is a two-up image grid that scrolls,
> right is a sticky rail with title, price, square colour swatches, a size row, a full-width solid
> black `ADD TO CART` button, and four collapsible rows — `DESCRIPTION`, `SIZE CHART`,
> `MATERIALS`, `SHIPPING & RETURNS`. Below, a `YOU MAY ALSO LIKE` row of 5 products.
>
> **Artboard 5 — Product page, mobile (390px).** Full-bleed image slider with a slide counter,
> then title, price, swatches, sizes, and the four collapsible rows. A sticky bottom bar carries
> the price and `ADD TO CART`.
>
> **Artboard 6 — Component sheet.** Header (default and scrolled), footer, product card in
> default / hover / sale states, buttons in primary / secondary / disabled, form input, the
> collapsible row open and closed, size and colour swatch states, the sale badge, breadcrumb, and
> the full type scale with every colour token swatched and labelled.
>
> Use tasteful placeholder imagery: dark editorial fashion photography for the hero and split
> block, cut-out beanies, boots, hoodies and swimwear on white for the product cards.
