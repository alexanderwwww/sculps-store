# XERO CHIRON — ONE-PAGE STORE. THE MASTER BUILD.
# Attachments: 6 UI screenshots (the design) + 6 world images (the environments).

New project. Two sets of attachments, two jobs:
- The SIX UI SCREENSHOTS are the final design — all six states of one screen: Studio·Day,
  Studio·Night, City·Day, City·Night, Mars·Day, Mars·Night. Reproduce them inch by inch.
- The SIX WORLD IMAGES are the actual environment assets — use these files as the worlds
  behind the bike. (If they arrive in a follow-up message, build the UI first and slot
  them in when they land.)
Where your instinct and the screenshots disagree, the screenshots win. Sample every color,
radius, blur, and spacing from the images. Do not restyle, "improve," or invent anything.
If something can't be reproduced accurately, ask me for a file or flag it — never
approximate silently.

## CALIBRATION TABLE — measured from the screenshots. Build to these.
Layout (fractions of a 1448-wide frame — convert to responsive units, keep ratios):
- Buy box panel: right column, left edge ≈ 68% of viewport width, right ≈ 98%, top ≈ 10%,
  bottom ≈ 89% → the stage owns the left ~68%, the deal panel the right ~30%.
- Center nav pill: spans ≈ 33% → 64.6% of width, vertically centered in the top bar.
- Control pills: left margin ≈ 2.3% of width; stacked rows at ≈ 14% / 21% / 28% height.
- Thumbnail rail: top edge ≈ 84% of height, row of 6 glass cards.
Colors (sampled from the screenshots):
- Day: page/studio bg `#eeeeef`, buy box glass `#f5f5f7`, accent blue — variant outline
  `#005df9`, Buy now surface ≈ `#3a82fb` (soft top-light on the capsule; match the
  screenshot's rendering), Apple Pay `#000000`, primary text ≈ `#0e0e0e`.
- Night: page bg ≈ `#1a1b1f`, buy box glass ≈ `#0c0c0d`–`#121214`, accent violet —
  variant outline `#6c4eff`–`#7e57fa`, Buy now surface ≈ `#7c6af7`–`#8f76ea`.
THE ACCENT RULE: day = the blue system, night = the violet system, applied to EVERY accent
at once (variant outline + price, Buy now fill, Add to cart outline/text, active thumb
border, selector dots, cart badge). Accents crossfade WITH the day/night transition —
eased, never switched.
Control stack order: `[3D | Photos]` → `[DAY | NIGHT]` → `[STUDIO · CITY · MARS]` in ALL
states (the Studio·Day screenshot's swapped order is the outlier — normalize it).

## What this site is
One page. The home page IS the store — nav, the bike in its world, the buy box. No separate
product page, no funnel. Build ONLY this screen now; sections below the fold come later.
Desktop exactly as shown; mobile derived per the rules below.

## The state machine — 3 worlds × 2 modes
STUDIO (white infinity cyclorama + pedestal / black spotlight studio) · CITY (New York
street, day / night) · MARS (red desert day / Milky Way night). In every night state the
bike's LED hairline seam and headlight are lit.
- World switch: crossfade through a brief blur bloom (~400ms); bike stays put; ground
  contact adapts (pedestal / asphalt / dust).
- Day↔Night: continuous ~700ms dimmer — light eases down, sky swaps at the darkest point,
  light eases back; seam + headlight rise at night; accents crossfade blue↔violet in sync.
  It must feel like a real studio dimmer, never a cut.

## THE WORLDS — wire the six attached world images
Save them as `assets/worlds/{studio,city,mars}-{day,night}.jpg` and use them as the
environments. First, assess the files and pick the right integration per world:
- **If an image is a true equirectangular panorama (2:1 aspect, horizon at vertical
  center, wrappable):** mount it as a real 3D world —
  ```js
  import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
  const tex = await new THREE.TextureLoader().loadAsync(url);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new GroundedSkybox(tex, 1.2, 60); sky.position.y = 1.2; scene.add(sky);
  scene.environment = pmrem.fromEquirectangular(tex).texture;
  ```
  Bike at origin on y=0, shadow-catcher plane tinted per world. Orbit moves the camera
  inside the world; clamp polar/zoom so the pano stays sharp and the camera never dips
  below the floor.
- **If an image is a flat/wide plate (not 2:1 or not wrappable):** use it as a layered
  backdrop — split sky / midground / ground into 2–3 layers, subtle parallax tied to the
  drag, ground line anchored to the bike's contact point; still derive
  `scene.environment` from the image (blur + PMREM) so the bike's reflections and ambient
  color match the world.
- Either way: keep the composition of the UI screenshots — bike center-left of the stage,
  clean ground under it, horizon height consistent across worlds so the bike reads the
  same size in all six.
- **Quality gate:** if any file is too low-resolution to hold up full-bleed on a 1440px
  stage, or a day/night pair doesn't match locations, TELL ME which one — I'll supply a
  better file. Do not ship a visibly blurry or mismatched world silently, and do not
  replace my worlds with your own inventions.
- In Studio, add the pedestal disc as real geometry (day) and the spotlight pool (night)
  so the bike grounds physically; hotspots appear in Studio world only.
- Preload the current world's day+night pair; lazy-load the others. Compress sensibly for
  mobile.

## THE BIKE — wait for the real model. Do not build one.
The production bike arrives later from Meshy as `assets/chiron.glb` (PBR textures). Until
then:
- Stage the bike as the high-res cutouts from the UI screenshots (2.5D sprite: drag gives
  a limited parallax arc with momentum; angle thumbs swap renders). Do NOT build a bike
  from geometry primitives.
- Build and PROVE the GLB path now with any placeholder file: Three.js r160+ from CDN,
  GLTFLoader + DRACO, PMREM per-world lighting, ACES tone mapping, contact shadow, orbit
  with damped momentum, pinch/scroll zoom with eased limits, double-tap focus, hotspots.
- Meshy handling, ready in ONE clearly-marked function: auto-center + auto-scale (fit to a
  1.89m-long bounding box), Y-up orientation fix, and a material pass — if the model
  lacks emissive materials for the LED seam/headlight, add a thin emissive strip/glow in
  night modes so the seam still lights. Tuning the real file must be a 5-minute job.

## Anatomy — exact copy strings
**Nav:** `XERO` left · center glass pill `Reviews · Specs · Cart` (bag icon + count badge)
· hamburger right. Reviews/Specs are smooth-scroll stubs for future sections.
**Control stack (top-left, three glass pills):** ordered as calibrated, segmented knobs
exactly as the screenshots (white knob day / dark knob night).
**Left edge:** three round glass buttons: previous view · reset · next view.
**Stage:** bike centered; glass chip bottom-center `Drag to rotate`. Studio world shows
five round glass `+` hotspots (panel, tank, front plate, seat, footpeg) — tap zooms to the
detail, the chip label flips to the part name, reset returns.
**Thumbnail rail:** six glass cards; active = accent border. First three preview the
worlds (`STUDIO · CITY · MARS`, moon icon in night mode); last three are bike angles
(front, rear, detail). World thumbs switch world; angle thumbs rotate the bike.
**Buy box (right glass panel — verbatim):**
- `XERO Chiron.` / `420 Nm. 68 kg. No engine.`
- `42 reviews` star row (underlined link) · `In stock` (green dot) — the count and stars
  are PLACEHOLDER SAMPLE DATA: keep the visual, mark it in code, bind to real reviews
  before launch. Never present invented reviews as real.
- `Ships in [TBD]` — keep the literal TBD.
- `$4,999` large · `or $139/mo financing`
- Variant cards: `Chiron — $4,999` (selected: accent outline + accent price) ·
  `Chiron + Spare Battery — $5,899 · Save $49`. Selection swaps outline + rolls the price
  digits.
- Add-on iOS toggles: `Wireless key (NFC pebble) + $99` · `Second charger + $199`.
- Buttons, exact order: **Apple Pay** (black capsule, official mark, Payment Request API
  where supported, hidden gracefully elsewhere) · **Buy now** (accent capsule) ·
  **Add to cart** (outline capsule). No ShopPay, no badge rows.
- Trust row with icons: `Fully refundable` · `2-year warranty` · `Free shipping`.
- The cart is REAL: drawer, line items (variant + add-ons), quantities, totals,
  localStorage persistence, badge count, fly-to-cart. Buy now opens an honest demo
  checkout sheet — no fake payment processing.
- Product data (variants, prices, add-ons) lives in ONE plain JS object at the top of
  store.js — this page will be ported to a Shopify theme and that object gets swapped for
  Shopify's product JSON.

## Motion
Apple restraint: `cubic-bezier(0.28,0.11,0.32,1)`, 300–700ms, damped-follow physics on one
shared rAF loop (`v += (target-v)*(1-Math.exp(-k*dt))`) for drag momentum and transitions.
Glass controls carry a pointer-tracking specular sheen; press = scale .985. Small travels,
soft settles, nothing bouncy, nothing attention-seeking. transform/opacity only. 60fps at
390px. `prefers-reduced-motion` → clean crossfades.

## Mobile (same DNA, derived)
Nav collapses to a compact pill · stage full-width ~55–60vh with control pills overlaid as
icon pills and the thumb rail overlaid at the stage's bottom edge · buy box becomes a glass
sheet below · sticky mini-bar (name · price · Buy now) once the buy box scrolls away.
Swipe angles, pinch zoom, thumb-sized toggles — everything feels native.

## Tech
Vanilla HTML/CSS/JS, no frameworks, no build step, runs by opening `index.html`. Three.js
from CDN is the only external script. Files: `index.html` · `css/style.css` ·
`js/stage.js` (viewer, worlds, day/night) · `js/store.js` (variants, cart, sheet) ·
`assets/`.

## ACCEPTANCE — verify every line before "done"
1. Each of the six states side-by-side with its UI screenshot at 1440px: same layout,
   spacing, colors (calibration values), and type. Inch by inch.
2. The six attached world images are the environments on screen — integrated per their
   format, quality-gated, never silently replaced or blurry.
3. All six states switch live: world blur-bloom crossfade, 700ms day/night dimmer, accent
   system crossfading blue↔violet in sync, control order normalized.
4. Every control functions: 3D|Photos, DAY|NIGHT, world selector, prev/reset/next, drag
   with momentum, hotspots (Studio only), 6 thumbnails, variant cards with digit roll,
   add-on toggles, Apple Pay / Buy now / Add to cart, working cart drawer with
   fly-to-cart.
5. Sprite bike works today; GLB path proven with a placeholder; the Meshy auto-fit +
   emissive-seam function is in place and marked.
6. Copy verbatim; `$4,999` everywhere; `[TBD]` kept; sample review data marked in code.
7. Mobile at 390px per spec with sticky mini-bar; 60fps; zero console errors.
8. Anything that couldn't hit this bar is reported with a proposed fix — nothing weak
   shipped silently.
