---
name: flip-ui
description: The look and motion of the flip app — the liquid-glass orb, its states, the telemetry text, the fold-open morph, and the exact numbers behind all of it. Use whenever the work touches how flip looks or moves: the orb, the glass, the squircle, the columns, the animation, the phone shape, the status copy, or any screen of the app. Trigger it when Alex says "the orb", "the glass", "the app looks", "the animation", "make it fire" — these decisions were argued over five rejected builds and must not be re-derived.
---

# flip-ui

How flip looks and moves. Every number here was decided against a rendered
picture, not in the abstract, because five builds were rejected for being
designed blind.

## The rule that produced all of it

**Render it and look at it before he does.** `tools/flip/preview.mjs` pulls the
orb's page straight out of `main.swift` — the real string the app loads — and
renders it in Chromium at the real size. `tools/flip/design/glass-concepts.mjs`
does the same for alternatives. Any change to the look goes through one of
them first. A design he sees before I do is a design I did not make.

And render it over **clutter** — overlapping windows, a hard stripe pattern,
small type, dark ground and light ground. Transparency is invisible over a flat
gradient; every "it isn't see-through" round happened because the test
background was too kind.

## The object

A 216×216pt squircle floating over the desktop. No window chrome. It drags
anywhere, a click opens it, Escape folds it back.

- Corner radius **26% of the side** (≈56pt), on a **continuous** curve.
  Circular corners read as a bubble toy.
- `NSVisualEffectView`, `.hudWindow`, `.behindWindow` — this is the only layer
  that can sample the desktop. **Never give it an `alphaValue` below 1**: it
  composites into its own transparency layer and the blur degrades into a flat
  grey sheet.
- Blur 24, saturate 1.7, tint no heavier than **6% white**.
- Rim light along the top: **1.6pt at 35% white**. Inner shadow **12pt at 16%
  black**, bottom-weighted, so the glass has thickness. Outer shadow 24pt blur,
  12% black, 4pt down.
- The canvas draws **only the light inside**. It must never paint an opaque
  ground — that is what turned the glass into a coloured tile.

## What lives inside it

Ribbons of light folding through the glass — no bars, no meter, no equaliser.
Sixteen columns was a 2010 graphic and he was right to kill it. Apple does not
build readouts, it builds substance: Siri's orb, the Watch breathing, the
Island.

Three ribbons at different speeds, additively blended, drifting when idle and
folding fast when working. Where they cross they brighten; that interference is
what reads as liquid rather than as a loop.

It has **mass**. Every step of a drag is handed to the canvas, which leans the
light against the direction of travel and settles a beat after the hand stops.
That lag is the whole difference between glass and a picture of glass.

## The telemetry

Under the status line, **9–10px monospace at ~45% opacity**, letter-spaced.
Lines appear one at a time, slide up as the next arrives, and fade after a few
seconds. **Never more than four on screen.** A machine thinking out loud, not a
console dump:

```
read inbox · 4 threads
maria_k · waited 3h · urgent
comp check · carhartt detroit · sold 8
price → €95
typed 412 chars
refresh 12:30 window · 6 of 20
```

## Controls

- Click the glass → opens. Escape or the chip → folds.
- **A small X in the corner of the open phone, to close.** One control, quiet,
  top-right. Not a row of chips: four native buttons stacked over the panel bar
  was a pile-up he had to point out.
- The controls that only matter when signed out belong in **one sheet that
  appears when signed out and disappears when signed in**, never as permanent
  furniture.

## Motion

- Fold open: scale to **1.08 over 80ms**, then to full over **420ms**, corner
  radius travelling 56 → 46 alongside. `cubic-bezier(0.22, 1, 0.36, 1)`.
- Fold back: the same curve, faster. A collapse is quicker than an expansion.
- State changes crossfade over **300ms**, same curve. Colour moves slowly
  enough to read as a tide, never as a light switch.
- Attention: a 3% scale pulse every ~4s, and it gives up after a few.

## The states

Thirteen, written out in full in `tools/flip/DESIGN.md` §4. The three ideas
worth keeping in mind whenever one is designed:

- **Stillness at height** reads as held breath, and is a stronger "look at me"
  than motion. That is what "waiting on you" does.
- **Thinking and doing must look different from across the room.**
- **Rate-limited is a success state.** The rules that keep the account alive
  are the product; it must never look like an error.

Tint: mint working, amber needs him, violet deliberately idle, grey offline,
red broken.

## What the web cannot do

WebKit cannot sample what is behind the window. Any spec that says otherwise —
including the one ChatGPT produced — is wrong about the layer stack. The
desktop blur is native and the canvas sits on top of it. Keep the two jobs
separate.

## Clear glass, not a grey stone

His words: *"when I open the glass I want to be able to also see your chat through
the back ... it might be faded or something but it's a liquid glass I want it clear
transparent also so it will have both traits — clear transparent but also glass like
transformation."*

Clear and glassy are not in tension. A blur is still a blur when the **tint** over it
is thin. What kills it is the material, not the blur:

| Material | Reads as |
|---|---|
| `.hudWindow` | nearly opaque slab — the blur has nothing left to show. **Never the orb.** |
| `.underWindowBackground` | the thinnest stock material: samples and blurs the desktop, puts almost no colour over it. **This is liquid glass.** |

So the material is **per-shape**, chosen in `Shell.materialFor(_:)` and re-applied at
the top of `applyShape` so it crosses over with the frame rather than a beat after:

- `.orb`, `.pill` → `.underWindowBackground`, `isEmphasized = false`
- page shapes → `.hudWindow` (a web view is drawn over it anyway)

And still: **never `alphaValue`** to get there. Anything under 1 composites the effect
view into its own transparency layer, backdrop sampling degrades to a flat wash, and
it is clear in the wrong way — no longer glass.

Once the tint thins out, legibility has to come from the type rather than the panel:
the canvas scrim under the text drops to `.26 → .10 → 0` and the status line carries a
tight `0 1px 3px rgba(0,0,0,.85)` shadow under its soft one. Light on the type, not a
wall behind it.

## Clear means no material and no paint

His words, after four builds of it coming back grey: *"I want clear, transparent,
not dusty, milky, gray, blurred, or frosted."*

Two separate things were making it pale, and fixing one at a time is what cost the
four rounds.

**1. Every AppKit material is a tinted panel.** There is no thin one.

| Material | What it actually lays over the backdrop |
|---|---|
| `.underWindowBackground` | ~92% — a white panel |
| `.fullScreenUI` | ~85% — a white panel |
| `.hudWindow` + `.darkAqua` | ~55% — smoke. Better, still not clear. |

Pinning a light material to dark appearance changes its colour without making it
thin. So **the orb hides the effect view entirely** (`effect?.isHidden = true` in the
`.orb` branch of `layoutChrome`, restored for every other shape). The window is
already transparent; the practical answer is to stop putting a panel behind it.

**2. The canvas was painting the rest of it.** The scrim under the type, the three
folding ribbons, the travelling highlight and the caustic were all our own light —
invisible against a heavy material, and the only thing left once it was gone.

So the canvas now draws **an edge and nothing else**: a bright top rim (`.52` white)
and a cool bottom one (`.30`), feathered at `0.06` and `0.94`, with nothing at all
across the middle. The type holds itself with its own shadow. **If it ever looks
cloudy again, the cloud is something painted in that canvas.**

## Never check a render against a fake material

`preview.mjs` modelled the window material as `rgba(255,255,255,.06)`. A 6% tint —
the glass we wanted, not the glass AppKit makes. So the orb rendered beautifully here
and arrived on his Mac as a slab, four builds running, and every render agreed it was
fine. **A preview that flatters the material is worse than no preview: it is a second
opinion that agrees with you.**

It now holds the measured tints in `MATERIALS` and defaults to `clear`, which is what
ships. `FLIP_MATERIAL=fullScreenUI node preview.mjs <dir>` renders any of the others
for comparison — that comparison is what finally proved where the milk came from.

**Every design round is rendered and looked at here before it is packed.** Not
described, not reasoned about — opened.

## The orb has no web view in it — that was the milk

Four builds were spent thinning a material. The material was never in the way.

**`WKWebView` composites an opaque white base under its page.** `drawsBackground` is
a private key and it does not take on his macOS, and `underPageBackgroundColor` only
covers the overscroll area. So no matter what the material was, what the canvas
painted, or how transparent the HTML claimed to be, a white rectangle sat on top of
all of it.

So the orb is drawn by AppKit: a transparent window, a **1pt white hairline at 34%**
on the container's own layer for the edge, and three `NSTextField`s — name (11pt bold,
62% white), the status line (14pt semibold, 98%), and the count (10pt bold, 50%). Each
carries its own `NSShadow` (black 85%, blur 4, offset 0,-1) because there is no panel
behind them any more. `setStatus` writes to `orbDoing` as well as the pill's label.

The web view stays in the tree — the message handler and telemetry hang off it — but
it is `isHidden = true` in every shape. **Nothing paints the orb, so nothing can make
it white.**

## Debugging a "the glass is not clear" report, in order

Four rounds were lost going in the wrong order. Check these from the top:

1. **Is a web view over it?** WKWebView's white base beats everything below it.
2. **Is a material behind it?** Every AppKit material is a tinted panel; there is no
   thin one. The orb uses none.
3. **Is our own canvas painting it?** Scrims, ribbons, glare, caustics — invisible
   under a heavy material and the only thing left once it is gone.
4. **Only then the tint numbers.**

And before any of it: check the build number on the orb matches what was packed.

## The light, once the glass is genuinely clear

Clear on its own reads as a hole cut in the desktop, not an object. He asked for the
transformations and the light back — *"needa transformations and lightr"* — after
seeing it clear for the first time. Both are native now; there is no canvas to paint
them.

**The specular.** One `CAGradientLayer` on the container, clear → **white 13%** →
clear, diagonal (`startPoint 0,1` → `endPoint 1,0`), `locations` animated from
`[-0.4, -0.22, -0.04]` to `[1.04, 1.22, 1.4]` over **7.5s**, repeating, on
`CAMediaTimingFunction(0.45, 0, 0.55, 1)`. It carries the orb's own corner radius and
`.continuous` curve, so the light stops at the squircle rather than at a rectangle.

- **Slow on purpose.** A fast highlight reads as a loading bar, which is the one thing
  the orb must never look like.
- **Orb and pill only.** It is hidden and its animation removed the moment the window
  is a page — a highlight sliding over Depop is somebody else's app with an effect
  stuck on it.
- **13% is the ceiling.** If the orb ever looks milky again, this is the first thing
  to turn down, before anything else is touched.

**The fold.** The three labels dissolve to 0 on the way out and back to 1 on the way
in, inside the same `NSAnimationContext` as the frame and on the same curve. Without
it they cut the instant the shape changes and the morph reads as two windows rather
than one thing becoming another. An un-animated shape change sets the alpha directly,
so it can never be left faded out from the last transition.
