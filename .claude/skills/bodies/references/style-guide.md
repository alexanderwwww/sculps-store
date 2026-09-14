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
- **Hero is a crisp apartment photograph** (`bd-hero-apt.jpg`): the board on
  oak floor by a window, right half; headline on the empty left. Two earlier
  heroes were rejected: a lifestyle photo with a person ("not that either")
  and the board floating over a sky ("I hate the picture in the sky").
- **Copy Experiment literally.** Wide heavy grotesque (Archivo, wdth 118,
  800) for every heading; white shop cards with a hairline border, a blue
  badge, the product on a colour splash, caps name, price, lime pill; rounded
  photos (14px) everywhere; ONE flat saturated band (swan) with the product
  floating and a black seal; an icon row; the email card on a photograph; a
  light footer with a chrome object and the wordmark bleeding off the bottom.
- **Two blocks never touch.** White between everything coloured.
- **Product photography is studio-flat**: each colourway has a flat-backdrop
  studio still with the accessories laid out (`bd-studio-*.jpg`) that leads
  its product page. People photos are iPhone BTS and live in steps, split,
  workouts and the feed.
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
| 0 | buy_box | **Hero**: apartment photo 16:8.2, eyebrow, h1, sub, lime pill "Shop the board · $699" + ghost "How it works", caps reassurance line. Then **Shop the board** (`.bd-ways`): "SHOP ALL →" right; four white cards, 1px hairline, 10px radius, blue NEW badge, board cut-out on an SVG colour splash, caps name, note, price with compare struck, lime pill. Hover: board lifts and tilts. |
| 1 | three_steps | White. h2 + lede, three 4:5 photos with 14px corners, `01 02 03`, caps h3, copy. |
| 2 | benefits | White. Split, rounded photo left, eyebrow + h2 + titled list + lime pill right. |
| 3 | product_grid | White. Four 3:4 rounded tiles, workout name in wide caps bottom-left, image scales on hover. |
| 4 | features | **The band.** Flat swan block, eyebrow, h2, two bold-lead sentences, lime pill; the board cut-out floats right (rotated −8°, slow bob) with a spinning black seal "FOLDS FLAT STANDS UP". |
| 5 | trust_icons | White, centred: h2, lede, five thin line icons with caps labels. |
| 6 | social_proof_images | White. h2 + lede, horizontal snap strip of 4:5 phone photos, colourway captions in caps, bleeds right. |
| 7 | reviews | Only with real reviews. Four bordered cards. |
| 8 | comparison_table | White. h2 + lede, table inside a white bordered card; our column header is a lime pill. |
| 9 | who_its_for | White. Three bordered cards, number top, caps title and copy bottom. |
| 10 | whats_in_the_box | White. Product cut-out inside a bordered square left, hairline list right. |
| 11 | specifications | White, tight. Two-column dl, blanks say "Spec pending". |
| 12 | video_faq | White. `<details>` list, + / – markers. |
| 14 | closing_cta | **Email card on a photograph**: white 14px card with shadow, h2, one line, pill input + lime "Get in". Posts to `/checkout/identify` with consent. |
| — | footer | White. Join heading + pill email + socials, chrome object (`bd-chrome.jpg`), Shop and Help caps columns, legal row, wordmark at 22vw bleeding off the bottom. |

Rhythm check: 0 photo · 1 white · 2 white · 3 white · 4 **swan** · 5 white · 6 white ·
8 white · 9 white · 10 white · 11 white · 12 white · 14 photo · foot white. One band.

## Product page

Two columns. Left: photo grid, the studio still full width on top, then the
folded-against-the-wall shot, the screen detail, two phone photos, all 14px
corners. Right, sticky: eyebrow, h2 colourway, price + compare, Pay Later
line, one-paragraph description, four colourway tiles with cut-outs (current
one outlined), full-width lime "Add to cart · $699", caps trust line, four
accordions (In the box open by default, Workouts, Size & storage, Shipping).
Sticky buy bar slides up when the button scrolls off.

## Product page

Gallery left: sky shot first, then card render, then phone photos, five max,
thumb row. Right: eyebrow (product), h2 (colourway), lede, price with compare
struck, PayPal Pay Later monthly line (real, connected), swatches linking to
`/products/<slug>`, full-width Add to cart, hairline fact list. **Sticky buy
bar** slides up from the bottom once the real button scrolls off: thumb, name,
price, lime button.

## Images (what goes where)

- `bd-hero-apt.jpg` — the hero. Lilac board in a bright apartment, right half.
- `bd-studio-{swan,lilac,matcha,bare}.jpg` — flat-backdrop studio stills with
  accessories; lead each product page.
- `bd-pdp-folded.jpg`, `bd-pdp-detail.jpg` — product page shots 2 and 3.
- `bd-cut-*.png` — transparent board cut-outs: shop cards, band, colourway
  tiles, cart lines, sticky bar.
- `bd-chrome.jpg` — the footer object.
- `bd-sky-*.jpg` — retired sky heroes, not used.
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


## Rebuilt again (Experiment discipline, verified against their real pixels)

- CSS palette is ONLY white, near-black wide type, lime `#C6FF3D` buttons, blue `#2F6BFF` badges. No coloured section backgrounds, no tinted cards, no colour tiles. The colourway tints were removed from the theme entirely.
- All colour lives inside the photographs, in ONE colour world per page (lilac/pink today): `bd-x-hero.jpg` (board in lilac-pink sky, empty left), `bd-x-band.jpg` (board on flat lilac gradient, empty left), `bd-x-box.jpg` (kit on white with lilac glow), `bd-x-life.jpg` (editorial apartment shot). Generated with gpt_image_2_5 low/2k at 1 credit each from the lilac reference.
- Shop cards: white, hairline, board alone on white, name, one line, price, lime pill. Nothing behind the product.
- PDP: white buybox, `.bd-offer` lime-bordered box around price + Pay in 4 + Add to cart, checklist, then `.bd-claim` big line, then every homepage section repeated.
- Owner's words: "clarity in a vibrant package". Never mix the colourways as panels.

## Vibrancy rules (owner, final)
- NEVER sky, NEVER clouds, NEVER AI "lifestyle girl" renders. Real Instagram/TikTok clean-girl photos only for people.
- Vibrancy = vivid gradients + bold accurate product + liquid-chrome blobs/rings + glows. Current set: `bd-g-hero.jpg` (21:9 hero), `bd-g-band.jpg` (21:9 band), `bd-g-screen.jpg` (4:5 instructor on screen), `bd-g-fold.jpg` (4:5 folded board), `bd-box-{board,cables,straps,pads,charger}.jpg` (crops of the kit shot).
- PDP = one carousel + white buybox with lime `.bd-offer` box, then claim line with chrome object, "What the others don't have" proof tiles, "In the box" item grid, workouts, steps, comparison, feed, FAQ.
- Clarity beats words: what it does, what's in the box, what others don't have, all shown in pictures.
