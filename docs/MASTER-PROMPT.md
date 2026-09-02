# Master prompt — new design language

Paste into Claude Design as a new project.

---

Create a complete design language and storefront for **MEA CULPA**, a Philadelphia streetwear
label founded in 2020, relaunching as a drop-based brand. The label has done roughly $4.3M in
lifetime revenue and is being rebuilt from the ground up. Treat it as a premium brand, not a
Shopify template.

Deliver **full production HTML and CSS**, not mockups — real markup, real grid, real responsive
behaviour, real motion. Everything must be portable into Shopify Liquid sections.

## Brand

Mea Culpa is Y2K-adjacent streetwear for women: knitwear, tees, sets, swim. Philadelphia, not
Los Angeles — it has an edge and a sense of humour, and it does not apologise. The name is an
admission of guilt worn as a badge.

Voice: short, flat, confident. Never bubbly, never corporate. Product names carry the personality
("Not My Fault Tee", "Mea World"), so the interface stays quiet and lets them speak.

## References, and exactly what to take from each

**DND Active (dndactive.com)** — take the *commerce mechanics*. Their grid is 4-up, on-model,
full-body, shot on a flat light-grey ground. Every card carries a small-caps fabric trademark
above the product title, then the title, then the price. Sold-out items stay in the grid with a
badge rather than being hidden. The product page runs a 2×2 image grid on the left against a
sticky right rail. Nav opens with "Join Waitlist". This is a drop brand and the whole interface
is built to sell a *look*, not a SKU. Take all of it.

**Rhode (rhodeskin.com)** — take the *calm*. Generous whitespace, warm neutral ground,
alternating full-bleed editorial bands, and a footer that is a real destination: a giant wordmark
over multi-column navigation, not four links and a copyright.

**Farfetch / SKIMS** — take the *discipline*. Small uppercase labels, tight type, no decoration,
one action per screen.

Do not copy any of their layouts, art direction or copy. Take the mechanics and build something
that is Mea Culpa's own.

## Design language

**Bold, clean, with pink used like a weapon rather than a wash.**

The system pairs a heavy grotesk against an editorial serif. The grotesk does the shouting —
big, tight, confident. The serif appears only as a small editorial accent (section names, footer
column headings) and gives the brand the premium register a $4M label deserves. Everything else
is quiet: near-black on off-white, one accent, no shadows, no gradients, zero border radius.

### Type

Two families, from Google Fonts:

- **Archivo** — the workhorse. Weights 400, 500, 700. Used for all UI, labels, product info, and
  every headline. Headlines are set in 700 at tight negative tracking, large. This is where
  "bold" lives.
- **Instrument Serif** — the accent. Regular only. Used *sparingly*: section names, footer column
  headings, and one editorial pull-quote. Never for UI, never for product titles.

| Role | Family | Size | Weight | Case | Tracking | Leading |
|---|---|---|---|---|---|---|
| Micro label / eyebrow | Archivo | 10px | 500 | upper | 0.12em | 1 |
| Nav, buttons, UI labels | Archivo | 11px | 500 | upper | 0.08em | 1 |
| Product title, body, price | Archivo | 13px | 400 | sentence | 0 | 1.618 |
| PDP title | Archivo | 21px | 500 | sentence | −0.01em | 1.2 |
| Section name | Instrument Serif | 21px | 400 | sentence | 0 | 1.1 |
| Headline | Archivo | 34px mob / 68px desk | **700** | sentence | −0.03em | 0.95 |
| Hero statement | Archivo | 55px mob / 110px desk | **700** | upper | −0.04em | 0.9 |
| Footer wordmark | Archivo | clamp(89px, 18vw, 260px) | 700 | upper | −0.045em | 0.8 |

### Colour

```css
:root {
  --paper:   #FFFFFF;   /* page ground */
  --bone:    #F4F2EF;   /* alternating bands, footer */
  --frame:   #EFEEEB;   /* product image ground — never pure white */
  --ink:     #0E0E0E;   /* text, buttons */
  --muted:   #7A7975;   /* secondary, struck prices */
  --line:    #E2DFDA;   /* 1px rules */
  --pink:    #FF4D9D;   /* THE accent */
  --blush:   #FFD9E8;   /* soft pink surface, used rarely */
}
```

**Pink is the only colour on the site.** It appears in exactly five places and nowhere else:
the sale price, the announcement marquee, link and swatch hover, the focus ring, and one hero
moment. A pink button on every page kills it — restraint is what makes it read as expensive.

Product images sit on `--frame`, a light warm grey, never pure white. This is what makes
on-model photography look shot rather than cut out, and it is why DND's grid reads premium.

### Space and grid

Fibonacci only: **8, 13, 21, 34, 55, 89, 144, 233**. No value outside this sequence.

Container 1440, margins 55, gutter 21 → content 1330.

```
desktop: (1330 − 3 × 21) ÷ 4 = 316.75   → card frame 317 × 513
tablet:  3-up
mobile:  (364 − 13) ÷ 2 = 175.5         → card frame 176 × 284
```

Card image frames are golden rectangles, `aspect-ratio: 1 / 1.618`. Two breakpoints only:
`1199px` and `767px`. Zero border radius anywhere. Rules are 1px `--line`.

## Components

### Product card

On-model, full-body, on `--frame`. `object-fit: cover` for on-model shots; `contain` with 21px
padding for beanies and accessories.

Structure, top to bottom:
1. Image frame, with a `SOLD OUT` badge top-left when applicable — sold-out product stays in the grid
2. **Fabric eyebrow** — 10px uppercase, `--muted`, e.g. `MEA KNIT™`
3. Product title — 13px
4. Price — 13px; on sale, original struck in `--muted` then sale price in `--pink`

**No add-to-cart, no quick-buy.** The whole card is one link. Hover cross-fades to the second
image over 420ms and lifts nothing — no scale, no shadow.

### Header

Sticky, 89px desktop / 55px mobile, `--paper`, 1px bottom rule. Shrinks to 68px on scroll with
the wordmark scaling down — one smooth transition, not a jump.

Left: `JOIN WAITLIST` · `SHOP ALL` · `COLLECTIONS ▾` · `ABOUT`
Centre: wordmark, 21px tall
Right: `SEARCH` · `ACCOUNT` · `CART (0)`

`COLLECTIONS ▾` opens a full-width flat panel — collection names on the left, one editorial
image on the right. No nested dropdowns.

### Announcement marquee

Directly beneath the hero, not above the header. 55px tall, `--pink` ground, `--ink` text,
11px uppercase, continuously scrolling with a `·` separator, pausing on hover. Two messages
alternating.

### Product page

Golden split: `grid-template-columns: 61.8% 38.2%`.

Left: 2×2 image grid, each cell `1 / 1.618` on `--frame`, scrolling.
Right: sticky rail at `top: calc(89px + 55px)`, containing in order:

1. Fabric eyebrow, 10px uppercase `--muted`
2. Title, 21px
3. Price, 21px
4. Colour label + swatches — 34px squares, 1px `--line`, `--pink` ring on selected
5. Size selector — 34px tall row
6. Instalment line — "or 4 interest-free payments of $X"
7. Primary button, full width, 55px, `--ink` — becomes `NOTIFY ME` when sold out
8. `SIZE CHART` link with a small rule icon
9. **Pre-order ship window** — "Estimated to ship 14–18 September"
10. Five collapsible rows, separated by 1px `--line`: `DESCRIPTION` · `SIZE + FIT` ·
    `FABRIC` · `MATERIAL & CARE` · `SHIPPING & RETURNS`

Below: a section named in Instrument Serif — "You may also like" — then 4 cards.

Mobile: full-bleed slider with a `3/8` counter, rail stacked beneath, sticky bottom bar with
price and the primary button at 55px.

### Footer

Rhode's structure, Mea Culpa's weight.

1. A `--bone` band carrying the wordmark at `clamp(89px, 18vw, 260px)`, 700, tight, cropped
   slightly by the viewport edges so it feels oversized
2. Four columns: **SHOP** · **INFORMATION** · **CONTACT** · **NEWSLETTER**, headings in
   Instrument Serif at 21px
3. Newsletter: one input, one solid `--ink` `JOIN` button, copy reading "Get 10% off your first order"
4. Base row: payment icons, country/language selector, copyright

## Motion

Motion is the thing that makes it feel expensive. One easing curve everywhere:
`cubic-bezier(0.22, 1, 0.36, 1)`.

| Element | Behaviour |
|---|---|
| Hero image | Slow scale from 1.06 → 1.00 over 1600ms on load |
| Hero type | Words rise 24px into a `clip-path` mask, staggered 60ms apart |
| Header | Shrinks 89px → 68px on scroll, 320ms |
| Section entry | Fade + rise 21px, 520ms, staggered 40ms across grid children, fires once |
| Card image | Cross-fade 420ms, no scale |
| Marquee | Continuous linear scroll, pauses on hover |
| Collapsible | Height + opacity, 320ms |
| Cart drawer | Slides from the right, 380ms, `--ink` overlay at 40% |
| Swatch / size | 160ms border and ring transition |

Every one of these must be wrapped in `@media (prefers-reduced-motion: reduce)` and disabled.
Nothing animates on scroll more than once. No parallax.

## Homepage order

```
header ─────────── sticky, 89px
HERO ───────────── 61.8vh, full-bleed, one statement, one CTA
marquee ────────── 55px, pink, scrolling
NEW IN ─────────── 4-up grid, 8 products
collections ────── 3 golden-landscape tiles (1.618 / 1)
editorial ──────── 61.8 / 38.2 split, serif pull-quote
SALE ───────────── 4-up grid, 8 products, pink sale prices
community ──────── 4 squares, @meaculpa.co
newsletter ─────── bone band
footer ─────────── wordmark + 4 columns
```

The hero takes `61.8vh` — the golden section of the viewport — so the announcement marquee and
the first row of product break the fold on every device. Products are visible on entry. This is
non-negotiable.

## Artboards

1. **Desktop homepage**, 1440, full scroll
2. **Mobile homepage**, 390, full scroll
3. **Collection page**, 1440 — breadcrumb, title with live product count, left filter rail at
   317px (Size, Colour, Price, Availability), sort dropdown, 4-up grid of 12, infinite scroll
4. **Product page desktop**, 1440
5. **Product page mobile**, 390
6. **Design language sheet**, 1440 — the full type scale with every size, weight and tracking
   labelled; all seven colour tokens swatched with hex and role; the Fibonacci space scale drawn
   to actual size; product card in default / hover / sale / sold-out; buttons in primary /
   secondary / disabled / notify; input; collapsible open and closed; swatch and size states;
   badges; breadcrumb; header default and scrolled; and the motion table with durations

Placeholder imagery: on-model full-body streetwear on a flat light-grey ground for product,
dark editorial photography for the hero and split band.
