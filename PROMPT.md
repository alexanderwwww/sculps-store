# XERO CHIRON — Master Build Prompt

Copy everything between the `===` markers and send it with the 4 product images attached.

===

## ROLE

You are a senior product designer and front-end engineer. You have shipped Apple-caliber
product launch pages. You are building the flagship store for a new electric dirt bike brand.
This is a one-product store. It has to be the best-looking store on the internet and it has to
convert. Both. No compromise on either.

Attached are 4 images: two technical design sheets, one studio render montage, one lifestyle
render. Study all four before you write a single line. Every detail of the product below is
visible in those images — match them exactly. Do not invent geometry, colors, or numbers.

---

## THE PRODUCT

**Brand:** XERO
**Model:** CHIRON — the first model.
**Category:** High-performance electric dirt bike.
**Positioning:** Zero gas. Zero noise. Zero cables. A machine that is genuinely fast, genuinely
strong, and designed like an Apple product instead of a piece of powersports equipment.

### What it looks like (from the renders)

- **Monocoque aluminum unibody.** The entire center of the bike is one continuous sculpted
  shell in **space gray anodized aluminum**, brushed/matte finish. It is a single flowing
  teardrop volume that wraps the battery — no visible tube frame, no exposed fasteners on the
  body. This is the signature of the product. Everything else is subordinate to it.
- **The LED hairline seam.** A single continuous hairline of white LED light traces the entire
  parting line of the body shell — up the front edge, along the underside, around the tail.
  It is thin, precise, and cold-white. In the dark it is the only thing you see. This is the
  brand's visual signature. Treat it as the logo.
- **Seat blade.** A black grippy vinyl seat on a cantilevered aluminum blade that floats above
  the rear wheel, tapering to a sharp point. Under the tail of the blade: a **red LED bar**
  running its full width.
- **Front number plate.** A brushed aluminum plate mounted between the fork uppers, with a
  **4-LED white headlight bar** recessed into it.
- **Forks and chassis.** Matte black inverted forks with fat lowers, two machined aluminum
  triple clamps, black swingarm, black coil-over mono shock with an exposed black helix spring,
  black footpegs, black side stand.
- **Wheels.** Black spoked rims, off-road knobby tires, floating hydraulic disc brakes front
  and rear.
- **Color story.** Space gray body / matte black hardware / white LED / red tail LED. The UI
  accent — and the only saturated color anywhere in the brand — is **violet**.

### The control panel (the thing nobody else has)

Mounted on the top deck behind the steering head, machined into the aluminum body:

- **iPhone dock** — a recessed portrait tray that holds an iPhone. NFC + wireless key. Your
  phone *is* the key. Drop it in, the bike unlocks.
- **3.5" TFT screen** — small vertical display beside the dock, showing speed (`0 km/h`) and
  battery (`100%`).
- **Rotary encoder** — a large knurled black crown dial, select/scroll.
- **Speaker** — a circular perforated grille.
- **Function Button 1 / Function Button 2** — two flush round black keys.
- **Back / Menu button.**
- **Quick access bar** — a strip of 6 flush capacitive icons along the bottom edge:
  home, lights, lock, menu, navigation, power.
- Panel module dimensions: **120 × 180 × 42 mm.**

### The XERO app (4 screens shown in the renders)

Dark UI, near-black background, violet accent, thin sans type.
1. **Dashboard** — bike illustration, `Connected` status dot, big violet speed ring showing
   `0 km/h`, `Battery 100%`, `Range 124 km`, and a violet **UNLOCK** button.
2. **Stats** — This Week: `Distance 126 km`, `Avg Speed 46 km/h`, `Top Speed 72 km/h`, plus a
   violet line chart.
3. **Charge** — `Battery 100% / Fully Charged`, large violet ring with a lightning bolt,
   `Charge Limit 100%`.
4. **Security** — `Bike Locked` with a padlock, toggles: `Alarm On`, `Motion Sensor On`,
   `Auto Lock Off`, UNLOCK button.

### The wireless key

A soft-touch black pebble fob, single button with a white status LED, XERO wordmark.
**60 × 30 × 10 mm.** NFC / Bluetooth, tap to unlock, IP67, replaceable CR2032.

### Full specifications — use these exact numbers, change nothing

| | |
|---|---|
| Overall dimensions | 1890 × 780 × 1150 mm |
| Wheelbase | 1280 mm |
| Seat height | 870 mm |
| Ground clearance | 340 mm |
| Rake / Trail | 26° / 105 mm |
| Curb weight | 68 kg |
| Payload capacity | 120 kg |
| Frame | Monocoque aluminum unibody |
| Motor | Mid-drive PMSM |
| Peak power | 12 kW (16.1 hp) |
| Max torque | 420 Nm |
| Battery | 72V 40Ah — 2880 Wh lithium-ion |
| Range (WMTC) | 124 km |
| Ride time | ~5 hours real trail riding on a charge |
| Top speed | 72 km/h |
| Charging time | 2.5 h (0–100%) |
| Front suspension | 200 mm travel, inverted fork |
| Rear suspension | 200 mm travel, mono shock |
| Brakes | Hydraulic disc, front and rear |
| Tires | 90/100-19 front · 110/90-18 rear, off-road knobby |
| Display | 3.5" TFT |
| Connectivity | Bluetooth 5.0 / NFC |
| Water resistance | IP67 |
| Lighting | Full LED — front, rear, indicators |
| Battery pack | 520 × 180 × 135 mm · 18.5 kg · quick-release · integrated BMS · IP67 |
| Charger | 100–240V AC in · 84V DC / 5A out · 210 × 110 mm |
| Materials | Anodized aluminum (space gray) · black grippy vinyl · matte black accents |

**The three numbers that sell it — lead with these:** `420 Nm` · `72 km/h` · `124 km`.
420 Nm of instant torque is the headline. It is more twist than a superbike, available at zero
rpm, in a 68 kg machine. Say that. It is true and it is the whole story.

**Price:** `$X,XXX` — I will give you the number. Put a clear placeholder and use it
consistently everywhere until I replace it.

**Never invent a number.** No 0–60 times, no horsepower conversions I didn't give you, no
made-up review counts, no fake customer names, no fake press logos. If you want a stat and it
isn't in this document, leave a clearly marked `[TBD]` placeholder instead.

---

## DESIGN DIRECTION — "Liquid Glass, Real Flow Motion"

This is the part I care most about. Read it twice.

### The material

Every floating UI surface — nav, buttons, spec cards, price bar, swatch tray, modals — is
**liquid glass**: a translucent pane that looks like a real slab of glass sitting above the
content, not a flat card with a gray background.

Build it properly, in layers:
1. `backdrop-filter: blur(28px) saturate(180%)` — the content behind genuinely refracts.
2. A translucent fill, not a solid: `rgba(255,255,255,0.10)` on dark, `rgba(255,255,255,0.55)`
   on light.
3. **A specular edge.** A 1px border using a `linear-gradient` that is bright at the top-left
   and fades to nothing at the bottom-right — this is what makes it read as a lens instead of
   a rectangle. Use `mask-composite` or a pseudo-element border trick.
4. **An inner top highlight** — `inset 0 1px 0 rgba(255,255,255,0.5)` — the glint on the top
   bevel.
5. A soft outer drop shadow so the pane floats off the page.
6. Generous corner radius, 20–28px. Glass is never sharp.

The glass must **react**. On hover, the specular highlight tracks the cursor position (feed
pointer x/y into a CSS custom property and move a radial-gradient sheen). On press, the pane
scales to `0.985` and the blur tightens. It should feel like pressing a real physical thing.

### Real flow motion

Nothing snaps. Nothing linear-fades. Everything **flows** with momentum and follows through.

- **Scroll is the timeline.** Sections are choreographed against scroll progress, Apple-style —
  content doesn't just appear, it moves through a state as you scroll it.
- **Damped follow, not tweens.** For anything tracking scroll or pointer, interpolate toward
  the target every frame (`current += (target - current) * (1 - Math.exp(-k * dt))`) instead of
  firing fixed-duration transitions. That is what produces liquid, weighted, never-jerky motion.
- **Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` for entrances, `cubic-bezier(0.65, 0, 0.35, 1)`
  for state changes. Durations 500–900ms. Slower than feels right at first — that's correct.
- **Stagger everything.** Lines of a headline, cards in a row, rows in a table: 60–80ms apart.
- **Parallax with restraint.** Product images drift at ~0.85× scroll speed. Text at 1×. Enough
  to feel dimensional, never enough to notice as an effect.
- Use `IntersectionObserver` for triggers, one shared `requestAnimationFrame` loop for all
  motion, and only animate `transform` and `opacity`. 60fps on a laptop is a hard requirement.
- Honor `prefers-reduced-motion` — swap all motion for clean fades.

### Type and space

- System stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, sans-serif`.
- Hero headline: clamp to ~clamp(3rem, 9vw, 8rem), weight 600, `letter-spacing: -0.045em`,
  `line-height: 0.95`. Tight and heavy — the Apple launch look.
- Body: 17–19px, `line-height: 1.55`, never pure white on black — use `rgba(255,255,255,0.72)`.
- Massive vertical rhythm. Sections breathe at 12–18vh of padding. White space is the product.
- Numbers get their own treatment: tabular figures, oversized, thin weight.

### Light and dark

The page **travels**: it opens in warm near-white (`#f2f1ee`), and transitions to true black
(`#000`) as you scroll into the performance and technology chapters, then can return. Drive the
background color from scroll progress so the transition is continuous, not a hard cut. The LED
seam and the violet accent only fully come alive once the page is black — that's the payoff.

---

## PAGE ARCHITECTURE

Single page. Sections in this order. Copy is given — use it, refine it, don't replace it with
generic e-commerce filler.

**0 · Nav** — Liquid glass bar, floating, pinned top. `XERO` wordmark left. Right: Chiron,
Specs, Reserve. On scroll past the hero it contracts and gains a **Reserve — $X,XXX** button.

**1 · Hero** — Full viewport. Lifestyle render, large.
> # XERO Chiron.
> ### 420 Nm. 68 kilograms. No engine.
Primary CTA `Reserve` (violet, glass). Secondary `Watch the film` (ghost glass).
Below the fold edge: a slow-breathing scroll cue.

**2 · The Body** — The monocoque. Studio 3/4 render, big, on light background.
> ## Machined. Not manufactured.
> One piece of aluminum. No tube frame, no bolted panels, no seams — except the one we lit.
Three glass stat cards beneath: `Monocoque unibody` · `68 kg curb` · `IP67 sealed`.

**3 · The Seam** — Background goes black here. Hero the LED hairline against the dark.
> ## Your color. Your line.
Interactive **color swatches** (ice blue / violet / red / white / green / amber). Clicking one
recolors the LED seam live with a 600ms eased transition. Do this with a masked glow overlay in
`mix-blend-mode: screen` positioned over the product image — the actual light changes color,
it is not a filter over the whole photo. The swatch tray itself is liquid glass.

**4 · Power** — Dark. Stat counters that animate up when scrolled into view:
`420 Nm` · `72 km/h` · `124 km` · `12 kW`
> ## Instant. Silent. Relentless.
> Peak torque at zero rpm. Every time. 2.5 hours from empty to full.

**5 · The Key** — Close-up of the control panel and iPhone dock.
> ## Your iPhone is the key.
> Drop it in the dock. The bike knows you. Wireless charging, navigation, and a 3.5" TFT that
> tells you everything and nothing you don't need.
Animate an iPhone descending into the dock and snapping into place with a small scale-bounce,
and pulse the LED seam once when it lands. Call out the panel elements with thin leader lines
that draw themselves on scroll: dock, TFT, rotary encoder, speaker, function keys, quick bar.

**6 · The App** — The 4 app screens. Let them scroll horizontally on a glass rail, or fan out.
> ## Everything, in your pocket.
> Dashboard. Stats. Charge. Security. Lock it from anywhere.

**7 · Technical** — The line-art orthographic drawings from the tech sheet. Side elevation
large, with the dimension callouts (`1890`, `1280`, `870`, `340`) drawing themselves in on
scroll like a blueprint being plotted. This section is on light background — a deliberate
palate cleanser between two dark chapters.
> ## Every millimeter, accounted for.

**8 · Specs** — Full spec table from above. Two-column, hairline dividers, generous row height,
tabular numerals. Collapsible groups: Vehicle / Powertrain / Chassis / Electronics / In the box.

**9 · Reserve** — The conversion section. Black.
> ## XERO Chiron. $X,XXX.
> Reserve yours. Fully refundable.
Email capture + reserve button, with a real success state (glass card, checkmark, confirmation
copy). Beneath it, in small type: what happens next, refund policy, estimated delivery window.

**10 · FAQ** — Glass accordions. Answer the actual objections: Is it street legal? *(depends on
your region — say so honestly.)* How long does the battery last? What's the warranty? Can I
service it myself? Is the battery removable? *(Yes — 18.5 kg quick-release.)* What's in the box?

**11 · Footer** — `XERO — Zero gas. Zero noise. Zero cables.` Minimal links, wordmark, year.

**Sticky buy bar** — After the hero, a liquid glass bar slides up from the bottom on mobile and
docks in the nav on desktop: product thumbnail, name, price, `Reserve`. Never covers content.

---

## CONVERSION REQUIREMENTS

This is a store, not a portfolio piece. Non-negotiable:

- Price and primary CTA visible within the first viewport, and never more than one scroll away
  after that.
- One primary action on the page: **Reserve**. Everything else is secondary or ghost.
- Trust signals near the CTA: refundable deposit, warranty, shipping, secure checkout.
- Objection handling before the ask, not after — FAQ content should also appear inline where
  the objection naturally arises.
- Real form validation with graceful inline errors. Never a browser alert.
- Full mobile parity. Most of the traffic is a phone. Design the mobile layout first and make
  sure the glass effects still hit 60fps there — reduce blur radius on small screens if needed.
- Accessible: semantic HTML, real `<button>`s, visible focus rings, alt text on every product
  image, contrast that passes AA against the glass.
- Meta/OG tags, favicon, page title, and a proper `<title>`/description for sharing.

---

## TECHNICAL CONSTRAINTS

- **Single page. Vanilla HTML, CSS, JavaScript. No frameworks, no build step.** It must run by
  opening `index.html`.
- Structure: `index.html`, `/css/style.css`, `/js/motion.js` (scroll choreography + the shared
  rAF loop), `/js/store.js` (swatches, form, accordions, sticky bar), `/assets`.
- No external dependencies except fonts. No jQuery, no GSAP, no Tailwind CDN.
- Images: `loading="lazy"` below the fold, explicit `width`/`height` to prevent layout shift,
  and `<picture>` with WebP where it helps.
- Comment the motion system so I can retune timings without reading all of it.
- Clean, readable code. I will be editing this.

---

## QUALITY BAR

Before you tell me it's done, verify all of these yourself:

1. It runs by opening `index.html`. No console errors.
2. 60fps while scrolling the full page, on a laptop.
3. Every glass surface has a visible specular edge — not one of them looks like a flat gray card.
4. Nothing snaps. Scrub the page slowly and fast; motion is weighted and continuous both ways.
5. The color swatches actually change the color of the light on the bike.
6. Mobile at 390px wide is as good as desktop. Not "acceptable" — as good.
7. Every number on the page matches the spec table above exactly.
8. No lorem ipsum, no placeholder gray boxes, no `#`-only links anywhere.

If something in this brief can't be done well, tell me what and why instead of shipping a weak
version of it.

===

---

## Notes for you (not part of the prompt)

- **Price** — I left `$X,XXX` as a placeholder throughout. Set it before you send, or tell the
  model the number in a follow-up.
- **The 5-hour figure** — your spec sheet lists 124 km WMTC range and 2.5 h charging, so I wrote
  ride time as "~5 hours real trail riding," which is consistent with 124 km at trail speeds.
  The 2.5 h in the sheet is charge time, not battery life — worth keeping those separate in
  marketing copy so the spec table and the headline never contradict each other.
- **"Chiron"** — that's Bugatti's registered model name. Fine for a concept, but worth checking
  before you put it on a store that takes deposits.
- **Assets** — `/assets` in this repo has your four images already cropped into the pieces the
  prompt references: `hero.jpg`, `studio-3q.jpg`, `front-3q.jpg`, `rear-3q.jpg`, `panel.jpg`,
  `tail.jpg`, `headlight.jpg`, `app.jpg`, `key.jpg`, plus the line-art drawings
  `dwg-side.png`, `dwg-front.png`, `dwg-top.png`, `dwg-3q.png`, `dwg-panel.png`,
  `dwg-battery.png`, `dwg-powertrain.png`, `dwg-chassis.png`. Send those alongside the prompt
  and the build will match the renders instead of approximating them.
