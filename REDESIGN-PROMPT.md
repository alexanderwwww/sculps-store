# XERO CHIRON — FULL REDESIGN. Version 2. Read everything before you write anything.

You built the current page. It is competent — and that is the problem. It looks like a good
Shopify dark theme. Rounded gray cards, accordions, a purple ShopPay button, template review
tiles. Nobody says "woah." Nobody feels the innovation. We are redesigning the whole page with
a new design language. Same product, same photography, same true numbers — everything else is
on the table. The bar: a person lands on this page, and within 20 seconds they understand this
is the most advanced dirt bike ever made, and their card is already out. iPhone-launch level.
Not "nice." Impressed.

---

## THE NEW DESIGN LANGUAGE — Liquid Glass + Transformation Motion

Two ideas run the entire page. Every component obeys both.

### 1. Liquid glass — real, not gray cards
Every floating surface (nav, buy box, cart drawer, swatch tray, spec panels, FAQ, sticky bar)
is a translucent lens over the content, built in layers:
- `backdrop-filter: blur(28px) saturate(180%)` — content genuinely refracts behind it.
- Translucent fill (`rgba(255,255,255,0.10)` on dark / `0.55` on light) — never a solid.
- **Specular edge**: 1px gradient border, bright top-left fading to nothing bottom-right
  (pseudo-element + mask-composite). This is what makes it glass instead of a rectangle.
- Inner top glint: `inset 0 1px 0 rgba(255,255,255,0.5)`.
- Soft floating shadow. Radius 20–28px.
- **Reactive**: sheen follows the pointer (pointer x/y → CSS custom props → radial-gradient
  highlight). On press: scale 0.985, blur tightens. On mobile, the sheen follows touch.
If a single surface on the finished page reads as "flat gray card," the design language has
failed. Audit every one.

### 2. Transformation motion — things become other things
Not fade-ins. Elements morph between states as you scroll or act:
- The hero buy box doesn't disappear on scroll — it **collapses into the sticky cart bar**,
  price and CTA visibly traveling to their new home (FLIP technique: measure, transform,
  release). One continuous object, two states.
- Section headlines don't fade in — they **assemble**: characters rise with 20ms stagger from
  behind a blur, tracking tightening as they land.
- Images arrive at scale 1.06 / slight blur and **settle** to 1.0 sharp as they cross 30% of
  the viewport, scrubbed by scroll position — not a one-shot trigger.
- The cart icon **morphs into the cart drawer** (origin-aware scale + blur bloom), items fly
  from the buy box into it along a curved path.
- Numbers never just appear — they roll on tumbler-style, and their glass panel lights up as
  they land.
- All motion: damped-follow interpolation (`v += (target - v) * (1 - Math.exp(-k*dt))`) on one
  shared rAF loop. Easing `cubic-bezier(0.16,1,0.3,1)`, 500–900ms, 60–80ms staggers.
  `transform`/`opacity` only. 60fps on a phone — this page will be viewed on iPhones.
  `prefers-reduced-motion` → clean crossfades.
- Background travels near-white ↔ true black across chapters, driven continuously by scroll.

---

## NEW PAGE ORDER — this exact spine

### 0 · NAV — keep it. It's the benchmark.
The floating glass nav pill (XERO · Reviews · Specs · Cart) is the one element of v1 that is
right. Do NOT redesign it — its look is the reference every other glass surface must live up
to. Upgrade only its motion:
- On scroll it breathes: compresses ~8% and tightens its blur when scrolling down, relaxes
  back when scrolling up — damped, velocity-aware, never twitchy.
- The active section's label carries a soft specular underline glow that GLIDES between
  labels as you cross chapters (one continuous element sliding, not blinking on/off).
- Nav-link taps scroll with eased momentum, and the pill emits a subtle sheen sweep on tap.
- The cart count badge pops in with a spring when an item lands, and the pill is the FLIP
  target for the fly-to-cart animation.
- On the light chapters the pill inverts its fill smoothly as the background travels — glass
  on white and glass on black, both flawless, no hard swap.

### 1 · THE PRODUCT BOX (hero — the most important section on the page)
Everything the current buy box has, rebuilt as one glass masterpiece that fills the first
viewport with the bike:
- Gallery: full-bleed product imagery, swipeable, thumbnails as tiny glass chips; images
  settle-on-arrival; pinch/drag feels native.
- `XERO Chiron.` + one line: `The iPhone of bikes. 420 Nm. 68 kg. No engine.`
- `$4,999` — with financing line (`or $139/mo`) in quiet small type.
- Configuration as **glass segments** (not radio buttons): Chiron / Chiron + Spare Battery
  ($5,899 · Save $49). Selecting one: the segment lifts, glows at the specular edge, price
  morphs (digits roll) — no layout jump. Add-ons (wireless key +$99, second charger +$199) as
  small glass toggles.
- **Buttons, in this hierarchy:**
  1. **Apple Pay** — official style: black pill, Apple Pay mark, per Apple's HIG. Wire it to
     the Payment Request API where the browser supports it; where it doesn't, hide it
     gracefully. NO ShopPay anywhere. No Klarna/Afterpay badge row — one quiet line under the
     buttons: `Financing available · Free shipping · Fully refundable`.
  2. **Buy now** — violet glass, opens a focused checkout sheet (email + confirmation demo
     state, honest placeholder — no fake payment processing).
  3. **Add to cart** — ghost glass. And the cart WORKS: drawer with line items, quantities,
     add-ons, running total, localStorage persistence, item-count badge on the nav cart icon,
     fly-to-cart animation on add.
- `In stock` pulse dot, star rating linking down to reviews.
- On scroll: the whole box performs the FLIP collapse into the sticky bar (thumbnail · name ·
  price · Add to cart · Buy now). The sticky bar is glass, never covers content, and on tap
  expands back into the full configurator from anywhere on the page.

### 2 · REVIEWS — invent something. This is your section to figure out.
The current review cards are template junk. Requirement: a review presentation **no store has
shipped**. Three seeds — take one further than described, or beat them with your own idea:
- **The wall of torque**: oversized pull-quotes floating at three parallax depths in a dark
  space, each on its own pane of glass, drifting at different speeds as you scroll through
  them; one phrase per quote is emphasized to be readable in 300ms of attention.
- **Scroll-scrubbed testimonial film**: one quote at a time, cinema-sized type, each quote
  assembling/dissolving as the scroll advances, star field of tiny glass shards in the depth.
- **The ledger**: a physical-feeling stack of glass slabs you flick through with momentum,
  each slab one review, weight and bounce like real material.
Whatever you build: it must feel *engineered*, not decorated. INTEGRITY RULE — do not invent
reviewer names, faces, or "verified owner" claims. Build the component with 5–6 sample entries
clearly marked as sample data in the code, attributed as `— Early rider` / `— Reserve holder`,
ready to be swapped for real reviews. No fake photo slots, no "browse files" placeholders ever
visible on the page.

### 3 · THE 3D BIKE
Full-viewport interactive 3D Chiron — Three.js r160+ from CDN (the only allowed external
script). Build it from code geometry to the real dimensions in the tech sheet (1280mm
wheelbase, 26° rake, 19"/18" wheels, monocoque via beveled ExtrudeGeometry,
MeshPhysicalMaterial anodized aluminum with clearcoat, emissive LED seam tube wired to color
swatches — ice blue / violet / red / white / green / amber, 600ms eased recolor).
RoomEnvironment PMREM lighting, ACES tone mapping, contact shadow, fog-faded seamless
background. Auto-rotate, drag to orbit, scroll-linked camera drift. 60fps, pixel ratio capped
at 2.
**The rule: a mediocre 3D bike is worse than none.** Render it, judge it honestly against the
photography. If it reads toy-like, cut it, use the studio renders with the swatch-driven seam
glow instead, and tell me you cut it. Static-render fallback for no-WebGL either way.

### 4 · THE FILM
Full-bleed video section. Video file comes later — build the slot now: `assets/film.mp4`,
autoplay/muted/loop/playsinline when present, elegant poster frame (use the darkest studio
render) with a glass play button until then. The section pins for one viewport; headline over
it: `Zero gas. Zero noise. Zero cables.` — assembling as it enters.

### 5 · THE TECHNICAL SKETCH
The orthographic line drawings, presented like a blueprint being plotted: side elevation
large, dimension lines and figures (`1890`, `1280`, `870`, `340`) drawing themselves on as
scroll advances (SVG stroke-dashoffset scrub). Light background — the palate cleanser between
dark chapters. Higher-res sketches may replace these files later — same slot, same names.
> ## Every millimeter, accounted for.

### 6 · WHAT YOU RECEIVE
The unboxing, as a moment: the shipping crate line-art, then the contents laid out as glass
tiles that assemble in staggered — `Chiron` · `72V 40Ah battery` · `Charger` · `Wireless key
×2` · `Tool kit` · `Documents`. Each with its cropped image where one exists. One line under
it: `Assembled. Charged. Ready to ride out of the crate.`

### 7 · SPECIFICATIONS — insane, but balanced
Two layers, same data:
- **The show**: the five numbers that sell — `420 Nm` · `72 km/h` · `124 km` · `68 kg` ·
  `2.5 h` — as a full-viewport chapter, each number tumbling on at display scale with its
  label and one-line meaning, glass panel igniting as it lands, background at true black.
- **The record**: below it, the complete spec table — clean two-column, hairline rules,
  tabular numerals, grouped Vehicle / Powertrain / Chassis / Electronics / In the box —
  rows cascading in 40ms apart. Scannable in silence. No accordion-fatigue: groups open,
  generous, readable.
Every number must match the spec sheet exactly: 1890×780×1150mm · 1280mm · 870mm · 340mm ·
26°/105mm · 68kg · 120kg payload · mid-drive PMSM · 12 kW (16.1 hp) · 420 Nm · 72V 40Ah
2880Wh · 124 km WMTC · 72 km/h · 2.5h charge · 200mm/200mm travel · hydraulic discs ·
90/100-19 / 110/90-18 · 3.5" TFT · BT 5.0/NFC · IP67 · battery 520×180×135mm 18.5kg ·
charger 100–240V AC / 84V 5A. Price $4,999 everywhere. Invent nothing.

### 8 · FAQ + FOOTER
FAQ as glass accordions with morphing chevrons — street legality (honest: depends on region),
battery life, removability (yes — 18.5 kg quick-release), warranty, self-service, box
contents. Footer: `XERO — Zero gas. Zero noise. Zero cables.`

The storytelling beats from v1 (iPhone-is-the-key dock moment, the seam color story, the app)
survive as **compressed interludes** woven between chapters 3–6 where they flow — tightened to
one viewport each, no repeated content, or folded into the product box gallery as feature
chips. Your judgment. The spine order above is fixed.

---

## CONVERSION — why they put the card in
- The page must answer, in order, without the visitor working for it: *what is this* (5 sec),
  *why is it better than anything else* (30 sec), *why do I need it now* (the film + torque),
  *what exactly do I get* (box + specs), *what's my risk* (refundable, warranty, FAQ).
- CTA reachable from every scroll position via the sticky bar. One primary action: buy.
- Real inline form validation. Real cart math. Honest demo checkout — no fake processing.
- Trust line near every CTA. No fake urgency, no countdown timers, no invented scarcity.
- Mobile-first: this will be judged on an iPhone. 390px must be flawless, glass blur reduced
  if needed for 60fps, all gestures native-feeling.

## TECH
Vanilla HTML/CSS/JS, no frameworks, no build step, opens from `index.html`. Three.js from CDN
is the only external script. Structure: `index.html`, `/css/style.css`, `/js/motion.js` (rAF
loop + scroll choreography + FLIP), `/js/store.js` (cart, checkout sheet, swatches, FAQ),
`/js/bike.js` (3D), `/assets`. Comment the motion constants at the top of motion.js so timings
can be retuned in one place.

## ACCEPTANCE — verify before you say done
1. Zero flat gray cards. Every surface passes the glass audit.
2. The nav pill is visually unchanged from v1, with the new motion behaviors live.
3. Buy box → sticky bar is one continuous FLIP morph, both directions.
4. Add to cart, cart drawer, quantities, totals, persistence: all function.
5. Apple Pay button correct per HIG where supported; hidden where not; ShopPay is gone.
6. The reviews section is something I haven't seen on a store. No fake identities.
7. 3D holds up next to the photography, or was cut and reported.
8. Every number matches. $4,999 everywhere.
9. 60fps scroll on mobile. No console errors. Reduced-motion respected.
10. Scrub the page top to bottom slowly: nothing snaps, nothing sits still when it should
    breathe, nothing breathes when it should sit still.
If any part can't be done at this bar, say so and propose the alternative — do not ship the
weak version silently.
