# XERO CHIRON — V4. THE APPLE STANDARD. This is a design-language replacement, not a tweak.

What you delivered reads as a dark e-commerce template with purple buttons. Wrong universe.
We are rebuilding the page's entire visual language to Apple's own system — the store page
for a MacBook Pro, if Tesla and Ferrari had engineered the product on it. Light, white,
breathable, precise, calm — and the product is the only drama. Everything below is exact.
Do not approximate it. Do not decorate it. Do not add color.

The structure from the last brief stays (buy box with 3D/Photos glass switch and GLB loader
slot · horizontal reviews river with delivery-photo slots · film slot · technical sketch ·
what you receive · specs show + record · FAQ · frozen glass nav pill · working cart, Apple
Pay, Buy now · $4,999 · exact spec numbers · no RGB section). What changes is EVERYTHING
about how it looks and moves.

---

## 1 · COLOR — Apple's palette, verbatim. Nothing else exists.

- Page background: `#ffffff`. Alternate sections: `#f5f5f7` (Apple's gray). That's the rhythm:
  white / gray-white / white — light is the default state of the whole page.
- Text: `#1d1d1f` primary. `#6e6e73` secondary. Never pure black on white, never gray soup.
- THE ONLY ACCENT: Apple blue. `#0071e3` (hover `#0077ed`) for actions on light; `#2997ff`
  for links on dark. This is the "stable trust" color. It appears ONLY on interactive
  elements — buttons, links, the active state of controls. Never decorative.
- **PURPLE IS DELETED.** Every purple/violet pixel on the current page is a bug. Also
  deleted: gradients on text, colored glows, neon, any hue that isn't the blue above.
- Dark chapters: exactly two — THE FILM and THE SPECS SHOW — on true `#000`, entered and
  exited by continuous scroll-driven background travel. The rest of the page lives in light.
- The LED seam in the photography provides the only other color on the page. Let it.

## 2 · TYPOGRAPHY — SF, at Apple's exact sizes

Stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue",
sans-serif`.
- Hero headline: 80px (clamp to 48px mobile), weight 600, line-height 1.05,
  letter-spacing −0.015em. Statement lines ("420 Nm. 68 kg. No engine.") : 28px, weight 400,
  `#6e6e73` — the Apple pattern: heavy claim, light elaboration.
- Section headlines: 48px / 1.08349 / −0.003em / 600. Eyebrow labels above them: 12px,
  600, uppercase, letter-spacing 0.12em, `#6e6e73` (e.g. "DESIGN", "PERFORMANCE").
- Body: 17px / line-height 1.47059 / letter-spacing −0.022em — Apple's exact body setting.
  Subhead/lead: 21px / 1.381. Captions: 14px, `#6e6e73`.
- Numbers in stats and prices: SF display cut, weight 600, `font-feature-settings: "tnum"`.
- No font is ever bolder than 600. No text is ever centered unless the section is a single
  statement. No line of body text runs wider than 692px.

## 3 · PROPORTION — the golden ratio system. This fixes "weak proportions."

Every layout decision derives from φ = 1.618 on an 8pt grid:
- Content container: 980px max (Apple's). Text measure: 692px. Full-bleed imagery: 100vw.
- Split layouts (stage vs deal panel, image vs copy): 61.8% / 38.2% — never 50/50.
- Vertical rhythm: each section's top padding = its bottom padding × φ (e.g. 88px bottom →
  144px top), so sections breathe MORE before a new idea than after it. Baseline section
  padding: 144px top / 88px bottom desktop, 96/56 mobile — round to the 8pt grid.
- Headline → subhead gap : subhead → content gap = φ : 1.
- The hero: product occupies ~61.8% of the viewport height, type block ~38.2%.
- Card radii 20–28px; buttons are full pills (radius 980px, Apple's trick); controls 12px.
- WHITE SPACE THEORY: white space is the most expensive material on the page. Every element
  earns its place by being surrounded by emptiness. If two elements compete, delete one or
  separate them by a full φ-step. Nothing touches. Nothing crowds. When in doubt: more space,
  larger margins, fewer things per viewport. A section that shows ONE idea per screen is
  correct; a section that shows three is a bug.

## 4 · LIQUID GLASS — Apple's actual material, both modes

Two glass recipes, used deliberately:
- **Glass on light** (nav pill, buy box panel, controls, cards on white):
  `background: rgba(255,255,255,0.72)`, `backdrop-filter: blur(20px) saturate(180%)` —
  Apple's macOS material — hairline border `rgba(0,0,0,0.08)`, top glint
  `inset 0 1px 0 rgba(255,255,255,0.9)`, shadow `0 8px 40px rgba(0,0,0,0.08)`. Reads as
  frosted white glass, bright and clean — NOT dark smoke.
- **Glass on dark** (inside the two black chapters only): `rgba(255,255,255,0.08)`, same
  blur, specular edge gradient bright top-left, glint `rgba(255,255,255,0.35)`.
- Both: pointer/touch-tracking specular sheen (radial gradient driven by CSS custom props),
  press = scale 0.985 + blur tightens. Every switch, toggle, and segmented control is built
  from this material — SwiftUI-style controls: the 3D/Photos segmented switch, add-on
  toggles (actual iOS-style sliding knob toggles in glass), FAQ chevrons.
- The frozen nav pill adapts per background automatically (light glass on white chapters,
  dark glass in black chapters) with a smooth material crossfade — never a hard swap.

## 5 · MOTION — water, not fireworks. Apple's restraint with liquid physics.

- Apple's own easing everywhere: `cubic-bezier(0.28, 0.11, 0.32, 1)`. Durations 600–1000ms.
- Elements enter with SMALL movements: translateY 24–40px + opacity + 8px blur → sharp.
  Apple never throws content across the screen. The luxury is in the settle, not the travel.
- Damped-follow physics on one shared rAF loop (`v += (target-v)*(1-Math.exp(-k*dt))`) for
  everything continuous: scroll choreography, orbit momentum, the reviews river, parallax
  (imagery drifts at 0.9×, barely perceptible).
- Water behavior: interactive glass responds like surface tension — sheen follows the finger,
  release eases back with a soft overshoot (one gentle bounce, spring damping 0.8, never
  wobbling). The 3D↔Photos switch is a blur-bloom cross-dissolve, 350ms.
- Scroll scrubs states continuously (headline assembly, sketch line-drawing, background
  travel to black and back). No one-shot "pop-in on enter" anywhere.
- 60fps at 390px width. transform/opacity only. `prefers-reduced-motion` → clean crossfades.
- The 2052 test: motion should feel like the interface is made of intelligent liquid —
  calm, weighted, inevitable. If an animation calls attention to itself, delete it.

## 6 · COMPONENT CORRECTIONS — applying the language

- **Buttons**: Apple Pay button per HIG (black pill, white Apple Pay mark) — hierarchy #1.
  "Buy now": Apple blue `#0071e3` pill, white 17px text — hierarchy #2. "Add to cart":
  text-button in blue or white-glass pill with blue text — hierarchy #3. NO purple, no
  gradients, no glows on buttons. They look exactly like store.apple.com buttons sitting on
  glass.
- **Buy box deal panel**: white frosted glass, 38.2% column beside the stage on desktop,
  under it on mobile. Price in `#1d1d1f` 28px/600. Configuration segments = light glass
  cards with blue hairline + subtle lift on selection (like Apple's "Choose your Mac"
  selectors). Trust line 14px `#6e6e73`.
- **Reviews river**: stays horizontal with momentum — but re-skinned: white/gray chapter,
  cards as bright glass slabs with the delivery photos, `#1d1d1f` quotes, one emphasized
  phrase in weight 600 (not in color). Sample attribution rules unchanged (no fake names).
- **Specs record**: pure Apple tech-specs page — `#f5f5f7` background, 980px container,
  hairline `rgba(0,0,0,0.16)` rules, label column `#6e6e73`, value column `#1d1d1f`,
  generous 24px row padding. It should look indistinguishable from apple.com/macbook-pro
  specs in structure.
- **The two black chapters** (film, specs show) are the Ferrari moments — cinematic, huge
  numbers, the page's only darkness — made powerful BECAUSE everything around them is white.
- Delete from current build: all purple, all dark-card sections outside the two black
  chapters, badge rows, any element that couldn't exist on an Apple product page.

## 7 · ACCEPTANCE — the Apple test, self-verify before "done"
1. Screenshot any section, put it next to apple.com/macbook-pro — same family? If not, redo.
2. Zero purple pixels. Grep the CSS: no violet/purple hex values exist. Only #0071e3/#2997ff.
3. Page defaults to light. Exactly two black chapters, entered by continuous travel.
4. Type: 17px/1.47059 body, ≤600 weights, ≤692px measures, tracking values as specified.
5. Proportions: 61.8/38.2 splits, φ vertical rhythm, 8pt grid, 980px container — measurable.
6. Every interactive control is glass with tracked sheen; toggles are iOS-style; the
   3D/Photos switch blur-blooms; the GLB slot, cart, Apple Pay, sticky FLIP bar all work.
7. Motion audit: Apple easing, small travels, water settles, nothing attention-seeking,
   60fps at 390px, reduced-motion clean.
8. White space audit: one idea per viewport, nothing crowds, nothing touches.
9. All prior invariants hold: exact spec numbers, $4,999, no fake reviewers, no RGB
   section, nav pill design frozen, honest demo checkout.
If any point can't be hit, say which and why before shipping — never ship the weak version.

---

## 8 · ADDENDUM — three upgrades, same language

### Full bleed for the product
The hero imagery and the 3D stage run FULL BLEED — 100vw, edge to edge, no container, no
card frame around the product. The bike gets the whole glass of the screen; the deal panel
floats over/beside it as frosted glass at the 38.2% φ split (over it on desktop, below on
mobile). Text and controls live on the 980px grid; the product does not. This contrast —
contained typography, uncontained machine — IS the drama. Apply the same to the film chapter
and the biggest render moments: product full bleed, words on the grid.

### The 3D viewer gets a light switch
Default: WHITE studio — seamless `#ffffff`→`#f5f5f7` background fog-matched to the page,
bright PMREM environment, soft shadow. Floating beside the [ 3D | Photos ] segmented control:
a round glass **Day/Night toggle** (sun/moon, iOS-style). Tapping night TURNS OFF THE STUDIO
LIGHTS: environment intensity eases down to near-black over 700ms (Apple easing), the
background travels to `#050505`, the contact shadow softens — and the bike's own lights come
up: LED hairline seam, 4-LED headlight bar, red tail bar glow emissive against the dark.
Day reverses it. This is a user-triggered mode, exempt from the "two black chapters" rule.
Build it so it works with the loaded GLB (material emissive slots) AND gracefully in Photos
mode (swap to the dark studio renders). This is the "woah" interaction of the buy box —
make the transition feel like a real studio dimmer, continuous, never a cut.

### NEW SECTION — THE KEYS (insert between REVIEWS and THE FILM)
A full dedicated chapter, two acts, φ-proportioned, light background:
- **Act 1 — `Your iPhone is the key.`** Full-bleed close-up of the top-deck dock (panel
  photography). The phone-in-dock moment: as the section scrolls, an iPhone silhouette
  eases down into the tray and seats with one soft settle (24px travel, water physics), the
  panel's screen area brightens. Copy on the grid: drop it in the dock — NFC unlock,
  wireless charging, navigation, the 3.5" TFT. Callout chips in glass: dock · TFT · crown
  dial · speaker · touch keys.
- **Act 2 — `No phone? Still your key.`** The black pebble NFC fob, hero'd on `#f5f5f7`
  like an AirTag product shot: photography large, then three glass spec chips — `NFC ·
  Bluetooth 5.0` · `IP67 waterproof` · `CR2032 · replaceable` · `60 × 30 × 10 mm`. One line:
  tap the fob to the panel and ride — phone at home.
Both acts obey the language: SF type scale, 61.8/38.2 layouts, glass chips, Apple easing,
one idea per viewport. This replaces the single compressed iPhone interlude — the Keys are
now a headline chapter of the page.

### Acceptance additions
10. Hero and 3D stage are truly full bleed at every viewport; deal panel floats at φ split.
11. Day/Night toggle: continuous 700ms studio dim with emissive bike lights in 3D mode and
    dark-render swap in Photos mode; day mode restores fully; toggle is glass, iOS-style.
12. THE KEYS chapter exists between reviews and film, both acts, dock settle animation live.
