# XERO CHIRON — ONE-PAGE STORE. Pixel-accurate build from the 5 attached screens.

New project, blank slate. The 5 attached screenshots are the FINAL DESIGN — not inspiration,
not reference: the design. Your job is to reproduce them pixel-for-pixel as a living page,
then wire the interactions specified below. Where the screenshots and your instincts
disagree, the screenshots win. Sample every color, radius, blur, spacing, and font size
directly from the images. Do not invent, "improve," or restyle anything.

## What this site is
One page. The home page IS the store. No separate product page, no hero-then-shop funnel.
First thing a visitor sees: the navigation, the bike in its 3D world, and the buy box —
exactly like the screenshots. Everything below this viewport comes later; build ONLY this
screen now, desktop exactly as shown, mobile derived per the rules at the end.

## The state machine — 3 worlds × 2 modes
The stage behind the bike is a WORLD, switchable: **STUDIO · CITY · MARS**.
Each world has **DAY and NIGHT**. Six states total. The screenshots give you five:
1. Studio · Day — white infinity studio, pedestal disc, soft ceiling glow
2. Studio · Night — black studio, spotlight mood, bike's LED seam lit
3. City · Day — New York street canyon, daylight
4. Mars · Day — red desert, hazy daylight
5. Mars · Night — Milky Way sky over dark red terrain, seam lit
City · Night is missing — derive it in the same language (streetlights, lit windows, wet
asphalt reflections, seam lit) and show me for approval, or ask me for a reference image.

**THE ACCENT RULE (it's in the screenshots — keep it):** Day states use the blue accent;
Night states switch the ENTIRE accent system to violet — selected variant outline, price
text in the variant card, Buy now fill, Add to cart outline/text, active thumbnail border,
world-selector dot, cart badge. Sample both accent values from the screenshots. The
transition between accents happens WITH the day/night transition, eased, not switched.

## Anatomy — every element, exact copy strings
**Nav** (glass, floating): `XERO` wordmark left · center glass pill: `Reviews` · `Specs` ·
`Cart` with bag icon + count badge · hamburger right. (Reviews/Specs anchor to sections
that don't exist yet — stub smooth-scroll targets.)
**Control stack, top-left** (three stacked glass pills):
- Segmented `3D | Photos` — active segment is the white/dark pill knob.
- `DAY | NIGHT` with sun/moon icons — same segmented style.
- World selector `STUDIO · CITY · MARS` — radio-dot style, active dot in current accent,
  active label in a white knob.
**Left edge, vertically stacked round glass buttons:** previous view · reset/close ·
next view.
**Stage:** the bike, centered, on the world background. Glass chip bottom-center:
`Drag to rotate`. In Studio·Day, five round glass `+` hotspots sit on the bike (panel,
tank, front plate, seat, footpeg area) — tapping one zooms the camera to that detail and
flips the chip's label to the part name; the close button returns.
**Thumbnail rail, bottom:** six glass thumbnail cards, active one outlined in the current
accent. First three thumbnails preview the WORLDS (labeled `STUDIO · CITY · MARS` with a
moon icon in night mode — as in the Studio·Night screenshot); last three are bike angles
(front, rear, detail). Tapping a world thumb switches world; tapping an angle thumb rotates
the bike to that view.
**Buy box, right (the glass panel — copy exactly):**
- `XERO Chiron.` / `420 Nm. 68 kg. No engine.`
- `42 reviews` star row (underlined link) · `In stock` (green dot) — the 42 and the stars
  are PLACEHOLDER SAMPLE DATA: keep the visual, mark clearly in code, bind to real reviews
  before launch. Never present invented reviews as real.
- `Ships in [TBD]` — keep the literal TBD until I give dates.
- `$4,999` large · `or $139/mo financing`
- Variant cards: `Chiron — $4,999` (selected: accent outline, accent price) ·
  `Chiron + Spare Battery — $5,899 · Save $49`. Selection swaps outline + rolls the price.
- Add-on rows with iOS toggles: `Wireless key (NFC pebble) + $99` · `Second charger + $199`.
- Buttons, exact order: **Apple Pay** (black capsule, official mark, Payment Request API
  where supported, gracefully hidden elsewhere) · **Buy now** (accent capsule — blue day /
  violet night) · **Add to cart** (outline capsule, accent text).
- Trust row, small: `Fully refundable` · `2-year warranty` · `Free shipping` with icons.
- Cart works for real: drawer, line items (variant + add-ons), quantities, totals,
  localStorage, badge count, fly-to-cart. Buy now opens an honest demo checkout sheet (no
  fake payment processing).

## SKELETON FIRST — the asset contract
Build the full working shell NOW; heavy assets drop in later without code changes:
- **The bike:** the real 3D model arrives later at `assets/chiron.glb`. Build the Three.js
  viewer (r160+ CDN, GLTFLoader, DRACO-ready, PMREM, ACES) but until the file exists, stage
  the bike as the high-res cutout renders from the screenshots (2.5D sprite: subtle parallax
  on drag, angle thumbs swap the render, "Drag to rotate" works in a limited arc). Do NOT
  build a bike from geometry primitives. When chiron.glb lands, the sprite path retires and
  full orbit takes over — same controls, same UI.
- **The worlds:** will also be delivered as files later (`assets/worlds/studio-day.jpg`,
  `studio-night.jpg`, `city-day.jpg`, `city-night.jpg`, `mars-day.jpg`, `mars-night.jpg`,
  and optionally HDR versions for lighting). Until then, recreate them yourself as close to
  the screenshots as you can — extract/rebuild the backgrounds from the attached images, or
  generate matching ones. If you need any image, crop, or file from me to hit accuracy,
  ASK — I will supply it.
- World switch: crossfade through a brief blur bloom (~400ms), bike stays put, ground
  shadow/reflection adapts (pedestal disc in Studio, asphalt contact in City, dust contact
  on Mars). Day↔Night: a continuous ~700ms dimmer — environment light eases down/up, sky
  swaps, LED seam and headlight glow rise at night, accent system cross-fades blue↔violet.

## Motion language
Apple restraint: easing `cubic-bezier(0.28,0.11,0.32,1)`, 300–700ms, damped-follow physics
on one rAF loop for drag/rotate momentum. Small travels, soft settles, nothing bouncy.
Controls are liquid glass with pointer-tracking sheen; press = scale .985. 60fps at 390px.
`prefers-reduced-motion`: crossfades only.

## Mobile (derive, same DNA)
Stacked: nav (collapsed pill) → full-width stage ~55–60vh with the control pills overlaid
top-left (compressed to icons) and thumb rail overlaid bottom → buy box as a glass sheet
below, with a sticky mini-bar (name · price · Buy now) once the buy box scrolls away.
All gestures native: swipe between angles, pinch zoom in 3D, toggles thumb-sized.

## Tech
Vanilla HTML/CSS/JS, no frameworks, no build step, opens from `index.html`. Three.js CDN
only. Files: `index.html` · `css/style.css` · `js/stage.js` (viewer, worlds, day/night) ·
`js/store.js` (variants, cart, sheet) · `assets/`. This will later be ported into a Shopify
theme — keep the buy box's product data (variants, prices, add-ons) in ONE plain JS object
at the top of store.js so it can be swapped for Shopify's product JSON cleanly.

## Acceptance — verify before "done"
1. Side-by-side with each screenshot at 1440px: layout, spacing, radii, type sizes, and
   colors match. Someone flipping between tab and screenshot sees the same design.
2. All 6 world/mode states exist and switch with the specified transitions; City·Night
   presented for approval.
3. Accent system: blue in all day states, violet in all night states, eased crossfade.
4. 3D|Photos, Day|Night, world selector, arrows, close, drag, hotspots, thumbnails, variant
   cards, toggles, Apple Pay/Buy now/Add to cart, cart drawer — every control functions.
5. Sprite-mode bike works today; the code path for `assets/chiron.glb` is ready and proven
   with a placeholder GLB.
6. Copy matches the strings above exactly; $4,999 everywhere; `[TBD]` kept; review count
   marked as sample data in code.
7. Mobile at 390px: stacked layout per spec, sticky mini-bar, 60fps, no console errors.
If anything can't be reproduced accurately, ask me for the file or flag it — do not
approximate silently.
