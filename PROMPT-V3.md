# XERO CHIRON — V3. THE REAL ONE. The last update failed. Read this like your job depends on it.

Verdict on what you shipped: weak. The structure moved but the page still feels like a
template wearing effects. This version has one design identity, one hero mechanic, and a
buy box that actually sells. Execute it completely or say what you can't do — no quiet
half-versions.

---

## THE IDENTITY — one sentence, memorize it

**Apple's iOS Liquid Glass design system, as if Tesla and Ferrari collaborated on a bike.**

- From **Apple/iOS**: real liquid glass surfaces (translucent, refractive, specular-edged,
  pointer-reactive), obsessive spacing, SF-style tight display type, restraint everywhere
  except the product.
- From **Tesla**: confidence through minimalism. Big true numbers, no decoration, no badge
  clutter, the configurator IS the page. White space and black space used like materials.
- From **Ferrari**: drama. Cinematic full-bleed imagery, forward-leaning energy — subtle
  slanted cut-lines and italic-cut section transitions that suggest speed (2–4° max, used
  sparingly as an accent, never tilted content blocks) — and emotional pacing: tension,
  reveal, payoff.
- **Flow motion on the entire site.** Every element arrives, settles, morphs, and exits with
  damped momentum (`v += (target-v)*(1-Math.exp(-k*dt))`, one shared rAF loop, transform/
  opacity only, `cubic-bezier(0.16,1,0.3,1)`, 60fps on iPhone, reduced-motion → crossfades).
  Nothing snaps. Nothing just appears. Scroll scrubs states continuously.

Liquid glass recipe (every floating surface, zero exceptions, zero flat gray cards):
`backdrop-filter: blur(28px) saturate(180%)` + translucent fill (never solid) + 1px specular
gradient edge bright top-left fading out + `inset 0 1px 0 rgba(255,255,255,.5)` glint + soft
float shadow + 20–28px radius + pointer-tracking sheen + press: scale .985, blur tightens.

KEEP UNTOUCHED: the floating glass nav pill (XERO · Reviews · Specs · Cart). Visual design
frozen — it's the quality benchmark. Motion upgrades only: breathes with scroll velocity,
active-label glow glides between sections, spring cart badge, FLIP target for fly-to-cart,
smooth fill inversion between light/dark chapters.

DELETED: the RGB / color-swatch / LED-recolor section. Gone completely. Do not rebuild it
anywhere. The seam appears only as it exists in the photography.

---

## SECTION 1 · THE BUY BOX — the product page IS this. Get this right above all else.

One full-viewport glass masterpiece. Two parts: the stage and the deal.

### The stage — dual-mode gallery with a liquid glass switch
A glass segmented control floats over the stage: **[ 3D ]  [ Photos ]**. Switching is a
liquid morph — the active segment's glass lifts and glows, and the stage content
cross-dissolves through a blur bloom (350ms), never a hard cut.

- **3D mode**: a real model viewer. I will supply the actual bike model later as
  `assets/chiron.glb` — build the loader NOW (Three.js r160+ from CDN, GLTFLoader,
  DRACO-ready). Neutral studio PMREM environment, ACES tone mapping, contact shadow,
  background fog-matched to the page so the model floats seamlessly. Interactions: slow
  idle auto-rotate; drag to orbit with momentum and damped release (it keeps turning
  slightly after you let go — weighted, like spinning a real machine); pinch/scroll zoom
  into close-ups with eased limits; double-tap to focus-zoom on the tapped point, glass
  chip hotspots for close-up jumps (panel, seat, motor, forks). Until the GLB file exists:
  the 3D segment shows a clean glass "3D — coming" state and Photos mode is default. Do
  NOT build a bike out of code primitives. The real model is coming.
- **Photos mode**: full-bleed swipeable carousel of the real renders — momentum snap,
  thumbnails as glass chips, images settle-on-arrival (scale 1.06 + blur → 1.0 sharp).

### The deal — a buy box that converts, not decorates
Stacked tight under/beside the stage (mobile-first):
1. `XERO Chiron.` — one line under it: `420 Nm. 68 kg. No engine.`
2. Social proof row: ★★★★★ + review count, links to reviews. `In stock` pulse dot +
   `Ships in 2–3 weeks` [adjust copy when I give real dates — keep a clear TBD].
3. **$4,999** big. `or $139/mo financing` quiet under it.
4. Configuration as glass segments (no radio buttons): `Chiron — $4,999` /
   `Chiron + Spare Battery — $5,899 · Save $49`. Selection lifts + edge-glows, digits roll.
   Add-on glass toggles: wireless key +$99, second charger +$199.
5. Buttons in this exact hierarchy:
   - **Apple Pay** — official HIG style, black pill, shown only where Payment Request API
     support exists, hidden gracefully otherwise. No ShopPay. No payment-badge clutter.
   - **Buy now** — violet glass → focused checkout sheet (email + honest demo confirmation).
   - **Add to cart** — ghost glass → WORKING cart: drawer, line items, quantities, add-ons,
     totals, localStorage persistence, fly-to-cart along a curve into the nav pill, spring
     badge.
6. One quiet trust line: `Fully refundable · 2-year warranty · Free shipping`.
7. Risk-reversal microcopy near the CTA: `Reserve now, pay in full only when it ships.`
   [keep as TBD-marked copy if the policy isn't final]
On scroll, the deal panel FLIP-collapses into the sticky glass bar (thumb · name · price ·
Add to cart · Buy now) — one continuous object, both directions, from anywhere on the page.

## SECTION 2 · REVIEWS — horizontal flow-motion river with real delivery photos
Direction confirmed: horizontal. Build a full-viewport dark chapter where review cards flow
horizontally with real momentum physics — flick to send them gliding, they coast and settle
with weight; on desktop, vertical scroll scrubs the river sideways through a pinned viewport.
Each card: liquid glass slab with a PHOTO of the customer receiving/unboxing/riding the bike
(image top, settle-on-arrival, slight parallax inside the frame as the card moves), quote
below with one emphasized phrase, stars, and attribution. Cards tilt 2–3° into their
direction of travel and ease upright when stopping.
PHOTO SLOTS: I will supply the real customer photos — wire cards to `assets/reviews/r1.jpg`
… `r6.jpg` with quote data in one obvious JS array. Until the files exist, show refined
glass placeholder frames (no broken images, no "browse files" UI ever). INTEGRITY: do not
invent names or faces; attribute sample quotes `— Early rider` / `— First delivery` until I
replace them with real ones.

## SECTION 3 · THE FILM
Full-bleed video slot `assets/film.mp4` (autoplay muted loop playsinline when present;
darkest render as poster + glass play button until then). Pinned one viewport. Headline
assembles over it: `Zero gas. Zero noise. Zero cables.`

## SECTION 4 · THE TECHNICAL SKETCH
Blueprint chapter, light background: side elevation line-art large, dimension lines and
figures (1890 · 1280 · 870 · 340) drawing themselves on with scroll (SVG stroke-dashoffset
scrub). Files may be replaced with higher-res later — stable slots/names.
`Every millimeter, accounted for.`

## SECTION 5 · WHAT YOU RECEIVE
Unboxing as a moment: crate line-art opens the section, contents assemble as staggered glass
tiles — Chiron · 72V 40Ah battery · charger · wireless key ×2 · tool kit · documents — each
with its crop where one exists. `Assembled. Charged. Ready to ride out of the crate.`

## SECTION 6 · SPECS — the show, then the record
- The show: full-viewport black chapter; `420 Nm` · `72 km/h` · `124 km` · `68 kg` · `2.5 h`
  land one by one at display scale, digits rolling tumbler-style, each glass panel igniting
  as its number lands, one-line meaning under each.
- The record: complete grouped spec table (Vehicle / Powertrain / Chassis / Electronics /
  In the box), two columns, hairline rules, tabular numerals, rows cascading 40ms apart.
  Exact numbers, non-negotiable: 1890×780×1150mm · wheelbase 1280mm · seat 870mm · clearance
  340mm · 26°/105mm · 68kg · payload 120kg · mid-drive PMSM · 12 kW (16.1 hp) · 420 Nm ·
  72V 40Ah 2880Wh · 124 km WMTC · 72 km/h · 2.5h charge · 200/200mm travel · hydraulic
  discs · 90/100-19 & 110/90-18 · 3.5" TFT · BT 5.0/NFC · IP67 · battery 520×180×135mm
  18.5kg · charger 100–240V AC, 84V/5A. $4,999 everywhere. Invent nothing — no fake counts,
  no fake press, `[TBD]` for anything missing.

## SECTION 7 · FAQ + FOOTER
Glass accordions, morphing chevrons: street legality (honest — depends on region), battery
life, removable battery (yes — 18.5 kg quick-release), warranty, self-service, box contents.
Footer: `XERO — Zero gas. Zero noise. Zero cables.`

The iPhone-dock story survives only as ONE compressed interlude (single viewport, panel
close-up, `Your iPhone is the key.`) placed where it flows best between sections 2–5.
Everything else from the old page that isn't in this spine: delete it.

---

## CONVERSION LOGIC — the page must walk them to the card
5 seconds: what it is. 30 seconds: why nothing else compares. 60 seconds: proof (reviews,
film, numbers). 90 seconds: exactly what they get and their risk (refundable, warranty).
The sticky bar keeps purchase one tap away from every scroll position. One primary action.
No fake urgency, no countdowns, no invented scarcity. Real inline validation, real cart
math, honest demo checkout.

## TECH
Vanilla HTML/CSS/JS, no frameworks, no build step, runs from `index.html`. Three.js from CDN
is the only external script. `index.html` · `/css/style.css` · `/js/motion.js` (rAF loop,
scroll choreography, FLIP — motion constants commented at top for retuning) · `/js/store.js`
(cart, checkout sheet, FAQ, reviews river) · `/js/viewer.js` (GLB stage) · `/assets`.
Asset contract — build against these paths, I fill them later: `assets/chiron.glb`,
`assets/film.mp4`, `assets/reviews/r1.jpg`–`r6.jpg`.

## ACCEPTANCE — self-verify before "done"
1. The identity reads instantly: iOS liquid glass × Tesla restraint × Ferrari drama — not
   a dark Shopify theme with effects.
2. Nav pill visually identical to before, new motion live.
3. Glass audit passes: zero flat gray cards anywhere.
4. Buy box: 3D/Photos liquid switch works; GLB loader proven with any free test GLB then
   pointed at `assets/chiron.glb`; orbit has momentum; zoom close-ups work; photos-only
   fallback clean until the model arrives.
5. Cart, Buy now sheet, Apple Pay (where supported) all function. ShopPay gone.
6. Reviews river: horizontal momentum physics, photo slots wired, no fake identities, no
   placeholder UI junk visible.
7. RGB/color section is GONE.
8. Every number exact, $4,999 everywhere, `[TBD]` marks anything unconfirmed.
9. 60fps scroll on iPhone-width (390px), no console errors, reduced-motion respected.
10. Slow-scrub test top to bottom: everything flows, nothing snaps, the slant accents are
    felt not seen.
If any point can't hit this bar, name it and propose the alternative — never ship the weak
version silently.
