# bodies — style guide

The exact system the live storefront uses (`app/storefronts/bodies/theme.css`,
`app/storefronts/bodies/index.tsx`). Every decision below was made with Alex in
session and rejected alternatives are listed so they are not tried again. When
building anything for bodies — a page, an email, an ad, a render — match this.

## Decisions already made (do not reopen)

- **No CSS gradients. Anywhere.** Rejected twice. Colour is flat: one solid
  colour per block, one solid disc behind a product.
- **One accent does every button:** lime `#C6FF3D`, black text. No second
  button colour. Ghost button is a black outline.
- **Product photography is clean render; people photography is iPhone raw.**
  The contrast is the brand. Never a magazine photoshoot with people in it.
- **Headline sits on the photograph.** A hero with text beside a picture is a
  product listing, not a campaign.
- **Hero is the board floating over a saturated cobalt sky**, one shot per
  colourway, swatches swap it in place. A lifestyle photo in the hero slot was
  tried and rejected ("not that either").
- **Sections alternate white → flat colour block → white.** Two blocks never
  touch. Not every section gets colour.
- **Four colourways, one row, no borders**, the board floats on a disc of its
  own tint. Cards with borders or shadows were rejected.
- **Footer is flat lime** with the wordmark oversized and bleeding off the
  bottom edge.
- **No dummy data.** Specs say "Spec pending" until Alex sends them; the
  reviews section does not render with zero reviews; no fake stars, counts or
  press logos.

## Tokens

```
--paper  #FFFFFF   ground
--ink    #0E0F12   type, black buttons, outlines
--ink-2  #5C5F68   body copy
--ink-3  #9497A0   captions, pending
--rule   rgba(14,15,18,.10)   hairlines

--lime      #C6FF3D   the one button, announcement bar, footer
--lime-2    #B4F521   button hover
--lime-ink  #101A00   text on lime

Colourways   body tint (block / disc)   deep (eyebrow on the tint)   neon accent
Icy Swan     --swan   #BBD9EE / #D6E9F6   --swan-deep  #2E5570        —
Lilac Heat   --lilac  #D9BEE8 / #EEDCF5   --lilac-deep #4A2357        --lilac-neon #FF3FA4
Matcha       --matcha #1E4636 / #D8EDC4   (type goes #F3F7EE)         --matcha-neon #C3F53C
Bare         --bare   #E8DFD1 / #F0E9DE   --bare-deep  #4A4034        —

Sky hero ground   #1E5BD6 (the cobalt behind the board while the image loads)
```

Spacing: `--pad: clamp(18px, 4vw, 44px)` side gutter, `--gap: clamp(56px, 8vw, 104px)`
section padding, `--tight` sections `clamp(36px, 5vw, 64px)`. Content max 1280px.

## Type

- **Display:** Archivo 800, all caps, tight.
  - h1 `clamp(40px, 7.4vw, 88px)`, line-height .94, tracking −.035em
  - h2 `clamp(28px, 4.6vw, 54px)`, line-height 1.02, tracking −.032em
  - h3 15px, 700, caps, tracking −.01em
- **Body:** Instrument Sans 400–600, 16px, line-height 1.55, colour `--ink-2`.
  Lede 16px, max 46ch.
- **Eyebrow:** 11px, 700, caps, tracking .2em, `--ink-2` (on a tint: the
  colourway deep; on matcha: the neon).
- **Numbers as design:** step numbers are display size (`34–52px`, `--ink-3`),
  tile numbers `01 02 03` at 11px caps.
- Nothing between 16px body and the display sizes. If a size in the middle
  seems needed, the layout is wrong.

## Buttons

```
.bd-btn         lime pill, 46px, 13px caps 700, tracking .08em, black text
.bd-btn--big    56px, full width (PDP add to cart)
.bd-btn--ghost  transparent, 1.5px black inset outline; on sky/matcha: white
hover           lime-2 / ghost fills black
```

One primary and one ghost per view, never two primaries side by side.

## Sections (the catalogue, in page order)

| # | type | look |
|---|---|---|
| 0 | buy_box | **Sky hero** (`.bd-hero--sky`): 16:9 board over cobalt sky, white type on the left third, eyebrow, h1, sub, lime + ghost buttons, four swatches that swap the colourway, reassurance line. Then **Four colourways** row (`.bd-ways`): disc tint, board, name, note, price, full-width Add to cart. Hover: board lifts and tilts −2°, disc grows. |
| 1 | three_steps | **Matcha block.** Eyebrow in neon, h2, three 4:5 photos with 18px corners, big display numbers under each. |
| 2 | benefits | White. Split, photo left 4:5, eyebrow + h2 + titled list + button right. |
| 3 | product_grid | White. Four 3:4 tiles, `01–04` top-left, workout name in display caps bottom-left, image scales on hover. |
| 4 | features | **Icy Swan block.** Split flipped, photo right, list left. |
| 5 | trust_icons | White strip, five items, hairline top and bottom, hairline dividers between. |
| 6 | social_proof_images | White. Heading, then a **horizontal snap strip** of 4:5 phone photos, 14px corners, colourway caption in caps. Bleeds off the right edge. |
| 7 | reviews | Only renders with real reviews. Four-across cards. |
| 8 | comparison_table | **Lilac block.** Eyebrow, h2, table inside a white 18px card; our column header is a lime pill. |
| 9 | who_its_for | White. Three tinted cards (swan, lilac, bare tints), number top, title and copy bottom. |
| 10 | whats_in_the_box | **Bare block.** Product render on a white disc left, hairline list right. |
| 11 | specifications | White, tight. Two-column dl, blanks say "Spec pending". |
| 12 | video_faq | White. `<details>` list, + / – markers. |
| 14 | closing_cta | Photo band 21:9, copy right-aligned, then the **Join card**: white card over a photo, email + lime button. |
| — | footer | Flat lime, four columns, legal row, oversized wordmark bleeding off the bottom. |

Rhythm check: 0 white/sky · 1 **matcha** · 2 white · 3 white · 4 **swan** · 5 white ·
6 white · 8 **lilac** · 9 white · 10 **bare** · 11 white · 12 white · 14 photo · foot lime.

## Product page

Gallery left: sky shot first, then card render, then phone photos, five max,
thumb row. Right: eyebrow (product), h2 (colourway), lede, price with compare
struck, PayPal Pay Later monthly line (real, connected), swatches linking to
`/products/<slug>`, full-width Add to cart, hairline fact list. **Sticky buy
bar** slides up from the bottom once the real button scrolls off: thumb, name,
price, lime button.

## Images (what goes where)

- `bd-sky-{swan,lilac,matcha,bare}.jpg` — hero composites, 2688×1520, board
  three-quarter angle, sky on the left third empty.
- `bd-card-*.png` — clean board render for the colourway row.
- `bodies-*.png` — flat product render with accessories (variant image, in the
  box, cart lines).
- `bd-hero-real*.png`, `bd-[a-f]-*.png` — iPhone lifestyle photos, people only.
  Used in steps, benefits, moves, features, feed, band, join.

Photography rules live in `visual-design.md` (cast, wardrobe, rooms, light).
Product geometry rules live in `product-spec.md`. Prompt every render with
"PRODUCT ACCURACY IS CRITICAL" and the corrected product reference for that
colourway; the old cream render carries a wrong "AURA" wordmark, never use it.

## Motion

- Announcement marquee 32s linear, pauses on hover.
- Card hover .35s `cubic-bezier(.2,.7,.2,1)`.
- Sticky bar .28s slide.
- `prefers-reduced-motion`: marquee stops. Nothing else animates on load.

## Copy on the page (current, real)

Headline "Pilates at home." · sub "A stronger, happier you — anytime,
anywhere." · reassurance "Free shipping worldwide · Pay in 4 with PayPal".
Section heads are in `website.md`. Voice rules in `copy-voice.md`.

## What is still missing (needs Alex, not design)

Domain · landed cost per board · the six spec numbers · real reviews ·
final price ($699 live, $349 discussed) · a mailing-list store (join form
records consent on the cart only).
