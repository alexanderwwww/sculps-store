# Claude Design prompt — plug

Paste this whole thing into Claude Design.

---

Design a macOS desktop app called **plug**. Lowercase always. Design only — no code,
no engineering notes. I want screens I can look at and judge.

## What it is

An autonomous resale operator. It hunts designer stock across the internet, works out
what is selling, lists it on **Depop** and **Vestiaire Collective**, answers buyers,
negotiates and closes — on its own, all day, without the owner touching it.

The owner is a plug: he can source any genuine designer item on earth. Chrome Hearts,
Rolex, Birkin. The app's whole promise is that he never has to sit in front of it.

It is **not** a dashboard, not an assistant and not a browser with an app around it.
It is a small living thing on his desktop that is quietly making money.

## The material — this is the most important instruction

**Real liquid glass.** Not frosted, not milky, not a grey panel, not a white card with
a blur behind it. The desktop behind the window must be **clearly visible through it** —
you should be able to read the wallpaper and the windows behind it, bent slightly at the
edges the way a lens bends what is under it.

- Clear in the centre. **Refraction only at the rim**, where the glass has thickness.
- A bright edge where light catches the curve, cooler on the opposite side.
- Chromatic fringing on the rim — faint rainbow, like the edge of real crystal.
- Anything painted on top of the glass is **light**, never a surface. If a panel starts
  looking solid, that is wrong.

Reference: Apple's Liquid Glass from WWDC25, and the attached icon — a glass plug with
prism highlights. The whole app is made of that same material as the icon.

**Never show:** white cards, grey fills, frosted panels, drop-shadowed boxes, or
anything that reads as a normal macOS window.

## Two states

### 1. Compact — a floating capsule

A glass pill sitting over the desktop, roughly **320 × 64**. This is what is on screen
99% of the time.

Contains, left to right: the glass plug icon · the word **plug** in a confident
lowercase sans · one quiet line underneath saying what it is doing right now
(*"Depop · Checking your shop"*, *"Listing the Chrome Hearts ring"*, *"Answering a
buyer"*) · a small activity ring on the right that turns while it works.

No buttons. No close box. No title bar. Click it and it opens.

### 2. Expanded — a phone made of glass

**393 × 852** — the exact size of an iPhone, and it is not a window with a page inside
it. **The glass itself is the window.** No title bar, no chrome, no traffic lights.
Rounded like an iPhone, roughly a 46pt continuous corner.

Design these screens inside it:

**a) Connect your shops** — the first run.
The icon large at the top, **plug** as a heading, the build number small underneath in
caps. A glass segmented control with **Depop / Vestiaire**. Then a line explaining what
happens next, and two cards side by side — one per marketplace, each with its logo mark
and a single button: **Sign in with email**. At the bottom, a small lock and *"Your
sign-ins stay on this Mac."*
That single button matters: Google and Apple sign-in cannot work here, so they must not
appear at all.

**b) Working** — the screen it lives on afterwards.
Both shops connected, shown as two small live rows with a green dot and the handle. The
centre is **today's number**: how many new listings it is putting up today, how many are
done, and what it is doing right now. Below that, a quiet feed of the last few actions —
*listed*, *answered*, *offer accepted*, *refreshed* — each with the marketplace it
happened on. Money earned today somewhere clear but not shouting.

**c) The growth ring.**
plug scales its listing pace by the golden ratio over a seven-day cycle, then starts
again: **1 → 2 → 3 → 4 → 7 → 11 → 18 → 1**. Design a small, beautiful way to show where
in that cycle today sits and how far through today's target it is. A ring, an arc, a
spiral — something that feels like growth, not a progress bar. This is the app's
signature element; make it the thing someone screenshots.

**d) ＋ List item** — his own stock.
A **＋** button, always reachable, opening a screen where he drops his own photos. plug
identifies the brand and model from the pictures, writes the title, description and
price for each marketplace, and shows both listings side by side for a glance. Anything
it is unsure about is marked so he can correct it in one tap. One button: **Publish to
Depop & Vestiaire**. Show the empty state (drop your photos here), the thinking state,
and the ready-to-publish state.

**e) Settings** — small and quiet. The connected accounts, price limits, how hard it is
allowed to negotiate, and a way to pause it.

## Typography and colour

- Type: SF Pro / Inter. Tight, confident, lowercase where it can be. Big headings, small
  quiet metadata in caps with wide letter-spacing.
- The glass is colourless. **All colour comes through it from the desktop behind.**
- One accent only: a live green for "working" and "connected" — the green of the icon's
  sparkle, not a UI green.
- Marketplace marks in their own colours (Depop red, Vestiaire cream) — the only two
  solid colours anywhere in the app.

## Motion to show

- The fold: compact capsule morphing into the phone. It should feel like a drop of water
  changing shape — surface tension, a slight overshoot, the corners rounding as it goes.
- The glass reacts to being dragged: the refraction lags behind the movement and settles,
  like liquid in a carried glass.
- Nothing bounces, nothing spins fast, nothing blinks. It is calm and expensive.

## Deliver

Every screen above, at real size, shown **over a real desktop with windows and colour
behind it** — glass is invisible against a flat background. Show light and dark
wallpapers. Show the compact and expanded states side by side.

Make it look like something Apple would ship and a 22-year-old would screenshot.
