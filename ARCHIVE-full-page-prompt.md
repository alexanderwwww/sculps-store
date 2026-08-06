# XERO CHIRON — THE MASTER BUILD. Complete product page, from zero.

You are executing a direct brief from the head of design at Apple. This page is the mission:
the store page Apple would ship if Apple sold a dirt bike. Every previous version is void.
Build the entire page from this document alone. It is complete — the design system, Apple's
own SwiftUI source code as reference, and every section specified. Deviate nowhere. If a
requirement can't be met at this bar, report it — never ship a weaker substitute silently.

The product: XERO Chiron. Electric dirt bike. $4,999. 420 Nm · 72 km/h · 124 km · 68 kg ·
2.5 h charge. The attached photography and tech sheets are ground truth — match them, and
never invent a number, a reviewer, or a claim. `[TBD]` for anything unknown.

---

# PART I — THE SOURCE. Apple's own code is the design spec.

This site must behave like it was written in SwiftUI with Apple's Liquid Glass APIs.
Here is the actual code Apple's developers ship, and the exact web translation you will
implement. When in doubt about any surface or motion, ask: "what would this line of Swift
do?" — then do that.

### 1. The Liquid Glass material — `glassEffect`
```swift
// Apple, iOS 26 SDK — a floating glass control:
Text("Add to Cart")
    .padding()
    .glassEffect(.regular.interactive(), in: .capsule)

// A prominent buy action, tinted:
Button("Buy") { }
    .buttonStyle(.glassProminent)
    .tint(.blue)
```
Web translation — one `.glass` class, used on EVERY floating surface:
```css
.glass {
  background: rgba(255,255,255,.72);                 /* light chapters */
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(0,0,0,.08);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.9),    /* top glint */
              0 8px 40px rgba(0,0,0,.08);            /* float */
  border-radius: 980px;                               /* capsule, Apple's radius */
}
.glass--dark { background: rgba(255,255,255,.08);
  border-color: rgba(255,255,255,.14);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 8px 40px rgba(0,0,0,.5); }
/* .interactive() → sheen follows pointer/touch via custom props: */
.glass::after { content:""; position:absolute; inset:0; border-radius:inherit;
  background: radial-gradient(120px at var(--px) var(--py), rgba(255,255,255,.35), transparent);
  opacity:0; transition: opacity .3s; pointer-events:none; }
.glass:hover::after, .glass:active::after { opacity:1; }
.glass:active { transform: scale(.985); }
```

### 2. Glass that merges and morphs — `GlassEffectContainer`
```swift
// Apple: nearby glass elements blend into one fluid surface, and
// glassEffectID lets a control morph into another across a transition:
GlassEffectContainer(spacing: 40) {
    HStack {
        Image(systemName: "bag").glassEffect().glassEffectID("cart", in: ns)
    }
}
```
Web translation: the buy panel and the sticky bar are ONE element with two states — a FLIP
morph (measure → transform → release, both directions) so price and CTA visibly travel.
The cart icon morphs into the cart drawer the same way. Nothing pops in/out; glass flows.

### 3. Materials hierarchy — `Material`
```swift
.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))
```
Web: three thicknesses only — ultraThin `rgba(255,255,255,.55)/blur(14px)` for chips and
hovers; regular `.72/blur(20px)` for panels, nav, drawer; thick `.85/blur(28px)` for modal
sheets. Pick by elevation, never at random.

### 4. Motion — Apple's springs
```swift
withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { isDocked = true }
withAnimation(.smooth) { mode = .photos }        // Apple's default: no bounce
withAnimation(.snappy) { count += 1 }            // small, quick, one soft settle
```
Web translation, exact:
- Global easing `cubic-bezier(0.28, 0.11, 0.32, 1)` (Apple's page curve), 600–1000ms.
- Springs in JS on one shared rAF loop: `v += (target - v) * (1 - Math.exp(-k * dt))`
  (k≈6 smooth, k≈10 snappy); optional single overshoot with damping 0.8 — never wobble.
- Entrances: translateY 24–40px + opacity + blur(8px)→0. Small travels. The luxury is the
  settle, not the distance. Scroll SCRUBS states continuously; nothing one-shot pops.
- transform/opacity only · 60fps at 390px · `prefers-reduced-motion` → crossfades.

---

# PART II — THE SYSTEM. Non-negotiable tokens.

**Color** — `#ffffff` page, `#f5f5f7` alternate sections, `#1d1d1f` text, `#6e6e73`
secondary, accent `#0071e3` (hover `#0077ed`; `#2997ff` on dark) on interactive elements
ONLY. True `#000` in exactly two chapters (Film, Specs Show). PURPLE DOES NOT EXIST — grep
the CSS; any violet hex is a defect. No gradients on text, no glows, no neon.

**Type** — `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica
Neue", sans-serif`. Hero 80px→48px mobile /1.05/−0.015em/600. Section heads 48/1.08349/
−0.003em/600 with 12px uppercase eyebrow (0.12em tracking, #6e6e73). Body 17/1.47059/
−0.022em. Lead 21/1.381. Caption 14. Numerals `"tnum"`. Nothing bolder than 600, no body
line wider than 692px.

**Proportion — golden ratio, everywhere.** φ = 1.618 on an 8pt grid. Container 980px, text
692px, product imagery 100vw. Splits 61.8/38.2 — never 50/50. Section padding: top = bottom
× φ (144/88 desktop, 96/56 mobile). Headline→subhead : subhead→content = φ:1. Hero: machine
61.8vh, words 38.2vh. Buttons capsule (980px), cards 20–28px, controls 12px.

**White space theory** — white space is the most expensive material on the page. One idea
per viewport. Nothing touches, nothing crowds; if two elements compete, delete one or
separate them by a full φ step. The machine goes full bleed; the words stay on the grid.
Contained typography + uncontained product = the drama.

---

# PART III — THE PAGE. Complete breakdown, in order.

### 0 · NAV
The floating glass capsule: `XERO  ·  Reviews  ·  Specs  ·  Cart`. Regular material, frozen
visual design, adapts light/dark glass by chapter with a smooth material crossfade. Motion:
breathes ~8% with scroll velocity; active-section glow GLIDES between labels (one sliding
element); sheen sweep on tap; spring cart badge; FLIP target for fly-to-cart.

### 1 · THE BUY BOX — the page IS this section.
**The stage (full bleed, 100vw):** glass segmented control `[ 3D | Photos ]`, switching by
blur-bloom cross-dissolve (350ms, `.smooth`).
- *3D mode*: GLB viewer — I supply `assets/chiron.glb` later; build the loader now (Three.js
  r160+ CDN, GLTFLoader, DRACO-ready; show a clean glass "3D — coming" state and default to
  Photos until the file exists — do NOT build a bike from primitives). White seamless studio
  (#ffffff→#f5f5f7 fog-matched), PMREM, ACES, soft contact shadow. Idle auto-rotate; drag
  orbit with momentum and damped release; pinch/scroll zoom with eased limits; double-tap
  focus-zoom; glass hotspot chips (panel · seat · motor · forks).
- *The light switch*: a round glass Day/Night toggle (sun/moon, iOS style) beside the
  segmented control. Night = the studio dims over 700ms — environment eases to near-black,
  background travels to `#050505`, and the bike's own lights rise: LED hairline seam,
  4-LED headlight, red tail bar, emissive. Works via GLB emissive slots in 3D mode; in
  Photos mode swaps to the dark renders. A real dimmer — continuous, never a cut.
- *Photos mode*: full-bleed swipeable carousel of the renders, momentum snap, glass chip
  thumbnails, settle-on-arrival (1.06 + blur → 1.0 sharp).
**The deal panel (frosted glass, 38.2% φ column beside the stage; below on mobile):**
1. `XERO Chiron.` / `420 Nm. 68 kg. No engine.` (28px, 400, #6e6e73)
2. ★★★★★ + count → anchors to Reviews · `In stock` pulse · `Ships in [TBD]`
3. `$4,999` (28px/600) · `or $139/mo financing` (14px, #6e6e73)
4. Configuration as Apple "Choose your Mac"-style glass cards: `Chiron — $4,999` /
   `Chiron + Spare Battery — $5,899 · Save $49` — blue hairline + lift on selection, digits
   roll. Add-on iOS glass toggles: wireless key +$99 · second charger +$199.
5. Buttons: **Apple Pay** (HIG black capsule, Payment Request API where supported, hidden
   gracefully where not) → **Buy now** (`#0071e3` capsule, opens honest demo checkout
   sheet on thick material) → **Add to cart** (glass capsule, blue text) → cart WORKS:
   drawer (regular material), line items, quantities, totals, localStorage, fly-to-cart
   curve into the nav, spring badge. No ShopPay. No badge rows.
6. `Fully refundable · 2-year warranty · Free shipping` (14px, #6e6e73).
On scroll: FLIP-collapse into the sticky glass bar (thumb · name · price · Add to cart ·
Buy now), both directions, reachable from every scroll position.

### 2 · REVIEWS — the horizontal river
Light chapter (#f5f5f7). Pinned viewport; vertical scroll scrubs the river horizontally on
desktop, free flick with momentum physics on touch — cards coast, tilt 2–3° into their
travel, ease upright on stop. Each card: bright glass slab, customer delivery/unboxing photo
on top (slots `assets/reviews/r1.jpg`–`r6.jpg` — I supply photos later; refined glass
placeholder frames until then, no broken images, no upload UI), quote below with ONE phrase
at weight 600, stars, attribution. INTEGRITY: no invented names or faces — sample quotes
attributed `— Early rider` / `— First delivery` until I replace them with real ones.

### 3 · THE KEYS — full chapter, two acts, light background
**Act 1 — `Your iPhone is the key.`** Full-bleed close-up of the top-deck dock. On scroll,
an iPhone silhouette eases down into the tray and seats with one `.spring(0.5, 0.8)` settle
(24px travel); the panel screen brightens. Copy on the grid: NFC unlock · wireless charging
· navigation · 3.5" TFT. Glass callout chips: dock · TFT · crown dial · speaker · touch keys.
**Act 2 — `No phone? Still your key.`** The black NFC pebble fob, shot like an AirTag on
#f5f5f7: photography large, glass spec chips — `NFC · Bluetooth 5.0` · `IP67` ·
`CR2032 replaceable` · `60 × 30 × 10 mm`. One line: tap the fob to the panel and ride.

### 4 · THE FILM — black chapter №1
Background travels continuously to `#000`. Full-bleed video slot `assets/film.mp4`
(autoplay muted loop playsinline when present; darkest render as poster + glass play button
until then). Pinned one viewport. Headline assembles: `Zero gas. Zero noise. Zero cables.`

### 5 · THE TECHNICAL SKETCH — light again
Blueprint chapter: orthographic side elevation large, dimension lines and figures (1890 ·
1280 · 870 · 340) drawing themselves via SVG stroke-dashoffset scrubbed by scroll. Eyebrow
"ENGINEERING". Headline: `Every millimeter, accounted for.` Files replaceable later — keep
stable names.

### 6 · WHAT YOU RECEIVE
Crate line-art opens; contents assemble as staggered glass tiles: Chiron · 72V 40Ah battery
· charger · wireless key ×2 · tool kit · documents — each with its photo crop where one
exists. `Assembled. Charged. Ready to ride out of the crate.`

### 7 · SPECS — black chapter №2, then the record
**The show (#000):** `420 Nm` · `72 km/h` · `124 km` · `68 kg` · `2.5 h` land one at a time
at display scale, digits rolling, dark-glass panel igniting per landing, one-line meaning
each. **The record (#f5f5f7):** the full Apple-style tech-specs table — 980px, hairline
`rgba(0,0,0,.16)` rules, label #6e6e73 / value #1d1d1f, 24px row padding, groups Vehicle /
Powertrain / Chassis / Electronics / In the box, rows cascading 40ms. Exact data: 1890×780×
1150mm · wheelbase 1280mm · seat 870mm · clearance 340mm · rake/trail 26°/105mm · 68kg ·
payload 120kg · mid-drive PMSM · 12 kW (16.1 hp) · 420 Nm · 72V 40Ah 2880Wh · 124 km WMTC ·
72 km/h · 2.5h · 200/200mm travel · hydraulic discs · 90/100-19 & 110/90-18 · 3.5" TFT ·
BT 5.0/NFC · IP67 · battery 520×180×135mm, 18.5kg, quick-release · charger 100–240V AC,
84V/5A. `$4,999` everywhere.

### 8 · FAQ + FOOTER
Glass accordions, morphing chevrons, honest answers: street legality (depends on region),
battery life, removable battery (yes — 18.5 kg quick-release), warranty, self-service, box
contents. Footer: `XERO — Zero gas. Zero noise. Zero cables.`

NOT ON THIS PAGE: any RGB/color-picker section · purple · ShopPay · payment badge rows ·
countdown timers · fake urgency · fake reviewers · dark cards outside the two black chapters.

---

# PART IV — CONVERSION LOGIC
5s: what it is. 30s: why nothing compares. 60s: proof (reviews, film, numbers). 90s: exactly
what they get and their risk (refundable, warranty, FAQ). Purchase one tap away from every
scroll position via the sticky bar. One primary action. Real validation, real cart math,
honest demo checkout.

# PART V — TECH
Vanilla HTML/CSS/JS, no frameworks, no build step, opens from `index.html`. Three.js CDN is
the only external script. Files: `index.html` · `/css/style.css` · `/js/motion.js` (rAF
loop, springs, FLIP, scroll — constants commented at top) · `/js/store.js` (cart, sheet,
FAQ, river) · `/js/viewer.js` (GLB stage + day/night) · `/assets`. Asset contract, build
against these paths: `assets/chiron.glb` · `assets/film.mp4` · `assets/reviews/r1–r6.jpg`.

# PART VI — ACCEPTANCE. The Apple test. Verify every line before "done."
1. Any section screenshotted next to apple.com/macbook-pro reads as the same family.
2. CSS grep: zero purple/violet. Only #0071e3 / #2997ff accents.
3. Light by default; exactly two black chapters, entered by continuous travel; the 3D
   night mode is the only other darkness and is user-triggered.
4. Type, tokens, φ proportions, 8pt grid, 980/692px measures — all measurable on the page.
5. Hero and stage truly full bleed at every viewport; deal panel at the φ split.
6. Glass audit: every floating surface passes the `.glass` recipe; zero flat gray cards;
   sheen tracks pointer/touch on all of them.
7. 3D/Photos blur-bloom switch · GLB loader proven with a test GLB then pointed at
   `assets/chiron.glb` · orbit momentum · pinch zoom · hotspots · Day/Night dimmer
   continuous in both modes.
8. Buy box converts: Apple Pay per HIG where supported · Buy now sheet · working cart with
   FLIP sticky bar both directions · fly-to-cart.
9. Reviews river: momentum physics, photo slots wired, no fake identities, no placeholder
   junk visible.
10. Keys chapter: both acts, dock settle animation, fob spec chips.
11. Every number exact, $4,999 everywhere, `[TBD]` marks anything unconfirmed.
12. 60fps at 390px, no console errors, reduced-motion respected, slow-scrub test: nothing
    snaps, everything settles like water.
Anything that can't hit this bar: name it, propose the alternative, do not ship it weak.
