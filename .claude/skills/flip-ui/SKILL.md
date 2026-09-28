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
