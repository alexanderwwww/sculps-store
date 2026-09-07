# XERO Chiron — store build brief

Everything needed to build the storefront for **XERO Chiron**, an electric off-road
motorcycle sold direct at **$4,999**. One product, one page, premium presentation.

This brief is self-contained: every heading, paragraph, spec figure and legal line
below is the real copy. Nothing here is a placeholder except where it says so.

Reference build (the site being reproduced): 20 sections, single scrolling page,
Apple-style product page rather than a catalogue store.

---

## 1. What this is

A one-product direct-to-consumer store. The bike is a real machine in manufacture
with a factory in Zhejiang, China — **not** a concept and **not** dropshipping.

The buyer is a 25–45 year old who follows product design, watches launch films, and
is buying an object as much as a vehicle. The site has to feel like a launch page for
a piece of hardware, not like an e-commerce template.

**Reference feel:** apple.com product pages, tesla.com order pages, rimac. Full-bleed
imagery, big type, tight tracking, generous whitespace, dark and light sections
alternating, everything reacting on scroll.

---

## 2. Platform and stack

**The platform is the client's decision** — the requirement is only that the design
survives it. The design is currently expressed as a Shopify theme (Liquid + vanilla
JS + CSS custom properties, no framework, no build step). It has also been rendered
to static HTML, so it can be ported to:

- **Shopify** — native, the theme drops straight in
- **WooCommerce** — templates convert; cart/checkout rebuilt on Woo
- **BigCommerce (Stencil)** — templates convert to Handlebars
- **Custom (Next.js/Astro) + Stripe Checkout** — most freedom, most work

**Hard requirements whichever way it goes:**

- Mobile first. Over 70% of traffic will be phones; every section must be designed
  for a 390px viewport before the desktop layout.
- No framework lock-in for the presentation layer. Vanilla JS is fine and preferred.
- Lighthouse performance 85+ on mobile. Images in WebP/AVIF with proper `srcset`,
  videos lazy-loaded and `playsinline`, nothing render-blocking.
- Works with JavaScript enabled only for enhancement — the buy button must function
  without JS.
- Every animation is an intersection-observer reveal with a **visible-by-default
  fallback**. If the observer never fires, content must still be visible. (Learned the
  hard way: inline `opacity:0` with a JS-only reveal shipped an invisible section.)

---

## 3. Brand

| | |
|---|---|
| Name | XERO. Product name: **Chiron**. Together: **XERO Chiron** |
| Wordmark | XERO, uppercase, tight letter-spacing |
| Tagline | *Ride to the stars.* |
| Secondary line | *Designed on Earth. Tested elsewhere.* |
| Voice | Plain, confident, technical. Short sentences. No hype adjectives, no exclamation marks, no emoji |

**The machine's look — this matters, get it wrong and everything looks wrong:**
raw **brushed aluminium** bodywork (not matte black, not painted) over a single-piece
cast frame, with **purple** LED lighting (not green, not blue). Anyone producing
imagery must match this.

**Colour system:** near-black backgrounds (`#0b0b0e`) with off-white type (`#f2f2f4`)
for dark sections, near-white (`#fafafa`) with near-black type for light sections.
One accent only, used sparingly. Buttons are **black/graphite**, not blue —
`#111116` background, `#f4f4f6` text, `#2c2d34` rim, hover `#26272e`. Cart count badge
is the one loud element: `#ff3b30`.

**Type:** a clean geometric/neo-grotesque sans (Inter, Söhne, SF Pro or similar).
Headings large and tight (`letter-spacing: -0.03em`), body 1.5–1.6 line-height.

---

## 4. Page structure

One long scrolling home page. Sections in this exact order.

### 4.1 Header / chrome
Sticky, translucent, blurred backdrop. Wordmark left, minimal nav, cart right with
count badge. A **sticky buy bar** appears once the hero buy box scrolls out of view:
product name, price, and the same Buy button.

### 4.2 Hero + buy box
Full-height. Interactive product stage on one side, buy box on the other; stacked on
mobile with the stage first.

- **Title:** `XERO Chiron.`
- **Subtitle:** `980 Nm · 120 km/h`
- **Body:** "An electric off-road motorcycle designed to run without a key or a barrel.
  Your phone lies flat in the tank, charges while you ride, and the system is designed
  so that only your paired phone wakes the machine. Design intent, not an
  independently tested security rating."
- **Process line:** `Order · Quality and safety check · Delivered to your door`
- **Bullets:**
  - Paired to your client ID before dispatch
  - Free delivery within the United States, to your door on a tail-lift vehicle, never a parcel courier
  - 30-day returns — we arrange and pay for collection
- **Stage:** 6 product images, thumbnail selector, day/night toggle, and (optional,
  nice-to-have) a rotatable 3D model. If 3D is out of scope, a 6-image switcher with a
  day/night background swap is the fallback and must not feel degraded.
- **Buy box:** price `$4,999`, configuration selector (below), quantity, **Add to
  cart** plus the platform's native express/Buy-now button, and an add-on row for the
  spare wireless key at $99.

> **Critical:** the checkout button must be the platform's own native payment button,
> styled to match. Do not build a custom "Buy now" that posts to a checkout URL by
> hand. Two competing buy buttons or a hand-rolled money path is exactly what got a
> previous store flagged.

### 4.3 Gallery — "Every angle."
Three images, one large + two supporting, edge-to-edge.

### 4.4 The iPhone key — the signature feature
Eyebrow `NO KEYS. NO FOB HUNTING.` / Heading `Your iPhone is the key.`
Sub: "Card in, card out, phone in. After that the bike knows your phone and nothing
else will start it."

Three steps, each with an image:

1. **Cut for your phone** — "A pocket milled into the tank to the exact size and thickness of an iPhone, with the charging coil built into the floor of it. Nothing clips on. Nothing sticks out."
2. **Tap your card once** — "Your steel card carries the bike's client ID and serial. Lay it in the pocket, the NFC reader picks it up, and the machine is claimed. Then take the card straight back out."
3. **Drop your phone in** — "It lies flat and flush, the magnet holds it, and it charges while you ride. From then on the bike wakes for that phone alone."

Payoff: `Designed around the phone you already carry.`
CTA: `Activate your ID` → `/activate`

**Required disclaimer under this section, verbatim:** "XERO is an independent company
and is not affiliated with, endorsed by, or sponsored by Apple Inc. iPhone is a
trademark of Apple Inc."

### 4.5 Reel — vertical video
One uploaded vertical video (9:16), plays on screen entry, muted, tap to unmute.
Kicker `IN THE CITY` / Heading `we made it with love` / Sub `we build it like a spaceship`
Footnote: "Filmed by XERO. Not customer footage. Riding shown on private land by an
experienced rider in full protective equipment."

### 4.6 Specifications — "Every number."
Kicker `SPECIFICATIONS`, sub "The whole sheet. No asterisks, no small print, nothing
withheld." Four groups, presented as a telemetry/instrument panel with numbers that
count up on reveal:

**POWERTRAIN** — Peak power 82 hp · Torque at the wheel 980 Nm · Motor speed 15,000 rpm · Transmission Direct drive
**PERFORMANCE** — Top speed 120 km/h · 0–60 km/h 2.3 s
**BATTERY (ASTRA ULTIMUM)** — Capacity 8.4 kWh · Charge 0–100% 55 min · Cycles to 80% 1,500 · Swap time 11 sec
**CHASSIS** — Weight, all in 104 kg · Suspension travel 310 mm · Front brake 280 mm 4-piston

Footnote, required: "Manufacturer specifications. Real-world figures vary with
terrain, rider weight, temperature, tyre choice and setup."

### 4.7 The box — "The key lands before the bike."
Kicker `WHAT ARRIVES FIRST`. Sub: "A machined aluminium case arrives days ahead of
delivery. Inside: your key and your card. Nothing else."

Card block: `Milled steel. Your number on it.` — "Every Chiron ships with a solid
steel card carrying its serial and client ID, laser-etched. Tap it into the tank once
and the bike is paired to you." CTA `Track your build` → `/track`

### 4.8 ASTRA ULTIMUM — the battery
Heading `A new kind of battery.` Three stats: **8.4 kWh** Capacity · **11 sec** To swap
· **1,500** Cycles to 80%.

### 4.9 Second reel
Kicker `ON THE TRAIL` / `watch it move` / "Handheld footage from our own rides. Forest
singletrack, rock, wet roots, after dark." Same footnote as 4.5.

### 4.10 Vibes — two-image mood block
`Out of the trailer. Into the night.` Captions: `OUT OF THE TRAILER`, `FIRST RIDE`.

### 4.11 FAQ — "Questions."
Accordion, 12 entries, with a video alongside on desktop:

1. **How fast is it?** — 120 km/h, about 75 mph.
2. **How much torque?** — 980 Nm at the rear wheel, with 82 hp peak. There is no gearbox between the motor and the rear wheel.
3. **What does it weigh?** — 104 kg, all in. A single-piece cast frame carries the pack, so there is no subframe underneath.
4. **How far does it go?** — An 8.4 kWh ASTRA ULTIMUM pack, good for a long day of trail riding. A second pack swaps in.
5. **How long does it charge?** — About 55 minutes from empty to full, and the pack holds over 80% of its capacity after 1,500 cycles.
6. **How does the key work?** — There is no key. A steel card ships with the bike and pairs it to you once. After that your phone wakes it.
7. **What if someone tries to take it?** — It stays locked, the same way your phone does in somebody else's hand. Without the paired phone it will not run.
8. **What comes with it?** — The bike, its charger, the wireless key and your steel owner card.
9. **What is 10-Year Replacement?** — A second configuration of the bike rather than an add-on. A replacement term from us — not insurance. See terms.
10. **When does it ship?** — Four to six weeks from order. Your key case arrives days before the bike does.
11. **How is it delivered?** — To your door on a tail-lift vehicle, by our own team or a specialist vehicle carrier we appoint. Never a parcel courier.
12. **What servicing does it need?** — No oil, no chain, no filters and no valve clearances. Tyres, brake pads and battery care only.

### 4.12 Full-bleed film ×2
Two full-width 16:9 films, 50–100vh, autoplay muted on screen, poster frame before
load. Placed at two points in the scroll for pacing.

### 4.13 Security — "impossible to ride without you."
Kicker `SECURITY`, sub `pairs with iPhone Find My app`. Three locks:

- **Paired to one phone** — "Your steel card claims the bike once, to you. From then on it wakes for your iPhone and refuses every other device."
- **No key to copy** — "There is no barrel, no blade and no fob to clone. There is nothing on the machine to pick, drill or hotwire."
- **Dead without you** — "The design puts the lock in the controller rather than in a barrel, so cutting the loom is not intended to defeat it. This describes the design intent of the system, not an independently tested security rating."

Find-my block: **Designed to tell you where it is.** — "Planned: the Chiron reports its
position to the companion app, so a stolen bike is a tracked bike. The app is in
development and is not available at launch — location reporting is a design goal, not
a shipped feature."

Payoff: `Designed to be worthless to anyone but you.`

### 4.14 Design visualisations gallery
Kicker `THE CHIRON`, title `Design visualisations.`
Sub, required: **"Renders and design visualisations. Not photographs of a customer
machine."** Horizontal scroll carousel, 5–6 images, dot indicators.

Any card with no image must render **nothing** — no empty frame. (This was a real bug
in the reference build; do not reproduce it.)

### 4.15 Order updates
Kicker `ALWAYS IN THE LOOP` / `Updates and notifications at every step.` — "From the
moment your card is etched to the day your bike arrives. Build, quality check,
dispatch and delivery updates land on your phone/email."

### 4.16 Track your build
Eyebrow `BUILT, CHECKED, DELIVERED` / `Follow it to your door.`
Three features: Free delivery within the US · Delivered to your door · Updates at every stage.
Input + CTA `Track`, hint "Enter the client ID etched on your steel card."
Backed by a simple lookup — only IDs the owner has entered can see a tracking view.
**Never seed it with invented riders or demo tracking data.**

### 4.17 Footer
Newsletter (`ride to the stars` / `order — quality check — ship`), a marquee ticker
`RIDE TO THE STARS`, wordmark `XERO`, sign-off `Ride to the stars.`, and a **LEGAL
column linking all five policy pages**. Tagline: *Designed on Earth. Tested elsewhere.*

---

## 5. Commerce

### Products

| Product | Variant | Price | SKU | Weight | Stock |
|---|---|---|---|---|---|
| XERO Chiron | Chiron | **$4,999.00** | `XC-CHIRON-STD` | 104 kg | 10 |
| XERO Chiron | Chiron + 10-Year Replacement | **$5,598.00** | `XC-CHIRON-10YR` | 104 kg | 10 |
| Wireless key | — | **$99.00** | `XC-KEY-01` | 0.2 kg | 40 |

Option name: `Configuration`. The 10-Year option is a **variant of the bike**, not a
separate product or an insurance product. Qualifier shown next to it: *"A replacement
term from us — not insurance. See terms."*

**Inventory must be tracked with overselling OFF** on every variant. Selling an
unlimited number of $4,999 vehicles from zero stock is the classic undelivered-goods
profile and gets stores shut down.

**Product description (bike):**
> An electric off-road motorcycle that unlocks with your phone. 980 Nm at the rear
> wheel, 120 km/h, 104 kg. Brushed aluminium bodywork over a single-piece frame that
> carries the pack.
>
> Your steel owner card pairs the machine to you once. After that your iPhone lies
> flat in the tank pocket, charges while you ride, and is the only thing that wakes it.
>
> Manufacturer figures, not independently certified. Real-world results vary with
> terrain, rider weight, temperature, tyre choice and setup.

### Checkout and payments

- **Use the platform's native checkout and native payment buttons.** No custom money
  path, no hand-built "Buy now" that posts to a checkout URL.
- Currency USD. Prices tax-exclusive (US store).
- Shipping: one United States zone, one **Free delivery** rate at $0.00.
- Customer accounts optional, not required at checkout.
- A $4,999 vehicle is a high-ticket, high-scrutiny category. Whichever processor is
  used, expect underwriting. Plan for either a vehicle-friendly merchant account
  (MCC **5571 — Motorcycle shops and dealers**) or a deposit-plus-balance structure.
- Enable AVS, CVV and 3-D Secure. At this ticket size one stolen-card chargeback hurts.

### Pages required

`/contact` · `/about` · `/refund-policy` · `/shipping-policy` · `/terms-of-service`
`/privacy-policy` · `/legal-notice` · `/activate` · `/track`

**Activate page:** dark standalone screen, input for a XERO ID in the format
`XR-XXXX-XXXX`, validated client-side, remembered locally, confirmation state.

### Policies — non-negotiable

All six policies (Refund, Shipping, Terms, Privacy, Contact information, Legal notice)
must be filled into the platform's **policy settings**, not only as pages. Checkout
links to the settings copies; pages with the same text do not satisfy it. **Empty
policy objects are a top-three reason payment applications get declined.**

Full policy text is supplied in `STORE-POLICIES.md`.

---

## 6. Store settings

| Setting | Value |
|---|---|
| Store name | **XERO** (prints on order confirmations and card statements) |
| Country / market | **United States**, primary |
| Timezone | **America/New_York** |
| Currency | USD, tax-exclusive |
| Location | One US location at the business address |
| Statement descriptor | `XERO CHIRON` |

A market or location whose country does not match the billing country is a
geo-mismatch flag in underwriting. Keep everything US.

---

## 7. Assets provided

- **53 media files** — 48 images + 5 videos, all product renders and films, supplied
  by the client. Filenames and alt text in `snapshot/media-manifest.json`.
- **6 product images** for the bike (side profile is the primary), 2 for the key.
- **Full policy text** — `STORE-POLICIES.md`.
- **Reference implementation** — the complete existing theme in this repo: every
  section as `.liquid` under `sections/`, styles in `assets/`, and the live page
  composition with all real settings in `snapshot/index.json.live`.
- **Static render** — `tools/render_static.py` renders the whole page to plain HTML
  with the real copy and settings baked in, for porting to any platform.

Product photography beyond what is supplied is the client's to provide.

---

## 8. Content rules — read before writing any copy

These are compliance rules, not style preferences. Breaking them creates real risk.

1. **The bike exists.** Never describe it as pre-order, made to order, built to order,
   or coming soon.
2. **Manufacturer figures, not certified.** Never write "certified", "tested to" or
   "rated" for any performance or ingress figure. The agreed wording is *"manufacturer
   figures, not independently certified"*.
3. **Never label renders or brand footage as customer or owner content.** A store with
   no orders cannot have customer footage, and that is checkable. Renders are labelled
   *"Design visualisations"*; films are labelled *"Filmed by XERO. Not customer footage."*
4. **Never invent social proof** — no fake reviews, no fake order counts, no demo names
   in the tracking roster, no "X people are viewing this".
5. **Apple disclaimer is mandatory** wherever iPhone is mentioned as a feature.
6. **No medical, safety or security guarantees.** Security copy describes *design
   intent*. The Find My feature is *planned and not available at launch* and must be
   labelled as such.
7. **Street-legality:** the machine is off-road and not homologated for US road use.
   This belongs in **Terms of service §6** and the pre-order acknowledgement — the
   client's ruling is that it does **not** go into page copy, banners or footers.
8. Riders must be 18 or over.

---

## 9. Acceptance criteria

- [ ] Renders correctly at 390px, 768px, 1440px and 2560px
- [ ] Lighthouse mobile: performance ≥ 85, accessibility ≥ 90
- [ ] Every section visible with JS disabled; no invisible content if an animation fails
- [ ] Add to cart works, cart shows correct line items and price, checkout completes on a test order
- [ ] Selecting **Chiron + 10-Year Replacement** charges **$5,598**, not $4,999
- [ ] Adding the $99 key adds a second line item
- [ ] All six policies present in platform policy settings, all five linked in the footer
- [ ] Videos autoplay muted inline on iOS Safari and do not block first paint
- [ ] No empty image frames, no placeholder text, no lorem, no demo products
- [ ] All copy matches this brief verbatim where quoted

---

## 10. Reference build notes — bugs already found, do not repeat

Learned on the existing build; each of these shipped broken once.

- **Invisible sections.** Inline `opacity:0` cannot be overridden by a stylesheet
  class. Animate with a visible-by-default contract and a timeout backstop.
- **Empty carousel cards.** Filtering blocks by a nested image property silently
  matched nothing and rendered every card, including empty ones. Loop plainly and test
  the image directly.
- **Double-charging cart.** A drawer "Checkout" button that also ran an add-to-cart
  added a second $4,999 bike. Checkout navigates; it never adds.
- **Silent cart failures.** Always check the response status and surface the
  platform's own error text. A cart that fails quietly looks like a broken store.
- **Sold-out that isn't.** Enabling inventory tracking before setting quantities
  leaves a tracked/deny/zero window; the storefront then refuses to add to cart while
  the admin shows stock. Set quantities first, then enable tracking.
- **Overwritten owner content.** Page-composition files owned by a visual editor must
  never be pushed from a local copy — it silently reverts everything the owner changed.
  Pull live, edit that, push straight back.
