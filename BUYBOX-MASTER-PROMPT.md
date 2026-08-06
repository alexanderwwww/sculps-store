# XERO CHIRON — ONE-PAGE STORE. Copy the six attached screens inch by inch.

New project. The six attached screenshots ARE the final design — all six states of one
screen: Studio·Day, Studio·Night, City·Day, City·Night, Mars·Day, Mars·Night. Your job is
1:1 reproduction as a living page, then the wiring below. Where your instinct and the
screenshots disagree, the screenshots win. Sample every color, radius, blur, and spacing
from the images. Do not restyle, "improve," or invent anything.

## CALIBRATION TABLE — measured from the screenshots. Build to these.
Layout (fractions of a 1448-wide frame — convert to responsive units, keep the ratios):
- Buy box panel: right column, left edge ≈ 68% of viewport width, right edge ≈ 98%,
  top ≈ 10%, bottom ≈ 89% → the stage owns the left ~68%, the deal owns the right ~30%.
- Center nav pill: spans ≈ 33% → 64.6% of width, vertically centered in the top bar.
- Control pills: left margin ≈ 2.3% of width; stacked rows at ≈ 14% / 21% / 28% height.
- Thumbnail rail: top edge ≈ 84% of height, full-width row of 6 glass cards.
Colors (sampled):
- Day: page/studio bg `#eeeeef`, buy box glass fill `#f5f5f7`, accent blue — variant
  outline `#005df9`, Buy now surface ≈ `#3a82fb` (blue capsule with soft top-light; match
  the screenshot's rendering), Apple Pay `#000000`, primary text ≈ `#0e0e0e`.
- Night: page bg ≈ `#1a1b1f`, buy box glass ≈ `#0c0c0d`–`#121214`, accent violet —
  variant outline `#6c4eff`–`#7e57fa`, Buy now surface ≈ `#7c6af7`–`#8f76ea`.
THE ACCENT RULE: day = the blue system, night = the violet system, on EVERY accent at once
(variant outline + price, Buy now fill, Add to cart outline/text, active thumb border,
selector dots, cart badge). The accent crossfades WITH the day/night transition — eased,
never switched.
Control stack order: use `[3D | Photos]` → `[DAY | NIGHT]` → `[STUDIO · CITY · MARS]` in
ALL states (five of the six screens use this order; the Studio·Day screen's swapped order
is the outlier — normalize it).

## What this site is
One page. The home page IS the store — nav, the bike in its world, the buy box. No separate
product page. Build ONLY this screen now; sections below the fold come later. Desktop
exactly as shown; mobile derived per the rules at the end.

## The state machine — 3 worlds × 2 modes, all six provided
STUDIO (white infinity + pedestal disc / black spotlight studio) · CITY (New York street,
day / night with lit windows) · MARS (red desert day haze / Milky Way night). In every
night state the bike's LED hairline seam and headlight are lit.
- World switch: crossfade through a brief blur bloom (~400ms); bike stays put; ground
  contact adapts (pedestal / asphalt / dust).
- Day↔Night: continuous ~700ms dimmer — light eases, sky swaps, seam+headlight rise at
  night, accents crossfade blue↔violet. Feels like a studio dimmer, never a cut.

## Anatomy — exact copy strings
**Nav:** `XERO` left · center glass pill `Reviews · Specs · Cart` (bag icon + count badge)
· hamburger right. Reviews/Specs are smooth-scroll stubs for future sections.
**Control stack (top-left, three glass pills):** as ordered above, segmented knobs styled
exactly as the screenshots (white knob day / dark knob night).
**Left edge:** three round glass buttons stacked: previous view · reset · next view.
**Stage:** bike centered; glass chip bottom-center `Drag to rotate`. Studio·Day shows five
round glass `+` hotspots on the bike (panel, tank, front plate, seat, footpeg) — tap zooms
to the detail, chip label flips to the part name, reset returns. Hotspots appear in Studio
world only.
**Thumbnail rail:** six glass cards; active = accent border. First three preview the worlds
(labeled `STUDIO · CITY · MARS`, moon icon when in night mode — per the Studio·Night
screenshot); last three are bike angles (front, rear, detail). World thumbs switch world;
angle thumbs rotate the bike.
**Buy box (right glass panel — copy verbatim):**
`XERO Chiron.` / `420 Nm. 68 kg. No engine.` / `42 reviews` star row (underlined link) +
`In stock` (green dot) / `Ships in [TBD]` / `$4,999` / `or $139/mo financing` /
variant cards `Chiron — $4,999` (selected, accent outline+price) · `Chiron + Spare Battery
— $5,899 · Save $49` / add-on iOS toggles `Wireless key (NFC pebble) + $99` · `Second
charger + $199` / buttons in order: **Apple Pay** (black capsule, official mark, Payment
Request API where supported, hidden gracefully elsewhere) · **Buy now** (accent capsule) ·
**Add to cart** (outline capsule) / trust row `Fully refundable · 2-year warranty · Free
shipping` with icons.
The 42-review count and stars are PLACEHOLDER SAMPLE DATA — keep the visual, mark it in
code, bind to real reviews before launch. Variant selection rolls the price digits. The
cart is REAL: drawer, line items with add-ons, quantities, totals, localStorage, badge,
fly-to-cart. Buy now opens an honest demo checkout sheet — no fake payment processing.

## THE WORLDS — build them YOURSELF. To the mockups. Identical.
No world files are coming for now — you create all six environments, and the bar is
IDENTICAL to the attached screenshots, not "inspired by":
- **Studio·Day / Studio·Night**: build these two PERFECTLY in code — they are light and
  gradient, fully within your power. White infinity cyclorama with the pedestal disc and
  soft ceiling glow; black studio with the single overhead spotlight pool and haze. Match
  the sampled tones (#eeeeef day, #1a1b1f night ambience). Zero excuse for drift on these.
- **City·Day / City·Night / Mars·Day / Mars·Night**: extract and rebuild the backgrounds
  from the attached mockups themselves — outpaint/extend the mockup backgrounds, clean the
  bike out, and use THAT as the environment, so the world is literally the one in my
  images. Add gentle parallax layering (sky / skyline / ground) so drag feels dimensional.
- Whatever the technique, the six states must sit behind the bike exactly like the
  screenshots: same horizon height, same palette, same mood, same clean center stage.
- Architect world loading behind ONE swap point (`assets/worlds/*` file slots + an env-map
  hook): higher-quality 360° panoramas will replace your versions later WITHOUT code
  changes. Your worlds are v1, not throwaway — make them good enough to ship.
- If a specific crop or bike-free area of any mockup would help you rebuild a background
  cleanly, ASK ME and I'll supply it.

## THE BIKE — WAIT for the real model. Do not build one.
The production 3D bike is coming from Meshy (GLB export, PBR textures) as
`assets/chiron.glb`. Until it arrives:
- Stage the bike as the high-res cutouts from the mockups (2.5D sprite: drag gives a
  limited parallax arc with momentum; angle thumbs swap renders). Do NOT build a bike
  from geometry primitives.
- Have the GLB path fully working and PROVEN with any placeholder GLB: Three.js r160+
  from CDN, GLTFLoader + DRACO, PMREM environment lighting per world, ACES tone mapping,
  soft contact shadow, orbit with damped momentum, pinch/scroll zoom with eased limits,
  double-tap focus, hotspot focus points.
- Plan for Meshy-specific handling when it lands: auto-center and auto-scale to the stage
  (fit to a 1.89m-long bounding box), correct Y-up orientation, and a material pass hook —
  if the model has no emissive materials for the LED seam and headlight, add a thin
  emissive strip/glow pass in night modes so the seam still lights. Keep all of this in
  one clearly-marked function so tuning the real file is a 5-minute job.
- Keep all product data (variants, prices, add-ons) in ONE plain JS object at the top of
  store.js — this page will be ported to a Shopify theme and that object gets swapped for
  Shopify's product JSON.

## Motion
Apple restraint: `cubic-bezier(0.28,0.11,0.32,1)`, 300–700ms, damped-follow physics on one
rAF loop (drag momentum, transitions). Glass controls carry a pointer-tracking sheen;
press = scale .985. Nothing bouncy, nothing attention-seeking. 60fps at 390px.
`prefers-reduced-motion` → crossfades.

## Mobile (same DNA, derived)
Nav collapses to compact pill · stage full-width ~55–60vh, control pills overlaid as icon
pills, thumb rail overlaid at the stage's bottom edge · buy box becomes a glass sheet below
· sticky mini-bar (name · price · Buy now) once the buy box scrolls away. Swipe angles,
pinch zoom, thumb-sized toggles.

## Tech
Vanilla HTML/CSS/JS, no frameworks, no build step, runs from `index.html`. Three.js CDN
only. `index.html` · `css/style.css` · `js/stage.js` (viewer, worlds, day/night) ·
`js/store.js` (variants, cart, sheet) · `assets/`.

## Acceptance — verify before "done"
1. Each of the six states side-by-side with its screenshot at 1440px: same layout, same
   spacing, same colors (calibration table values), same type. Inch by inch.
2. All six states switch live with the specified transitions; accents crossfade blue↔violet
   with the mode; control-stack order normalized across all states.
3. Every control functions: 3D|Photos, DAY|NIGHT, world selector, prev/reset/next, drag
   momentum, hotspots (Studio only), 6 thumbnails, variant cards with digit roll, add-on
   toggles, Apple Pay / Buy now / Add to cart, working cart drawer.
4. Sprite bike works today; GLB path proven with a placeholder file; worlds swappable to
   `assets/worlds/*` without code changes.
5. Copy verbatim; `$4,999` everywhere; `[TBD]` kept; sample review data marked in code.
6. Mobile at 390px per spec with sticky mini-bar; 60fps; zero console errors.
Anything you cannot reproduce accurately: ask me for the file or flag it. Never approximate
silently.
