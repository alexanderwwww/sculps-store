# Working agreement — read this before doing anything

## The default is: build it IN Shopify

The deliverable is a live store, not files. When the Shopify MCP is connected,
go straight in and build: rename the theme, create the products, write the
descriptions, set the variants and prices, build the collections, edit the
theme settings and sections. Do not stop at HTML in this repo and do not send
screenshots as if they were the work. HTML here is a reference for what goes
into the theme — never the hand-off.

Show the finished store. Do not narrate each step.

## Never switch or revoke the Shopify connection

`switch-shop` revokes the token, and re-authorizing needs an interactive OAuth
prompt that a remote session cannot show. That leaves the operator locked out
until they reconnect by hand.

If the connected store is the wrong one, SAY SO and ask them to switch it.
Do not call `switch-shop` yourself.

## Voice

Human. Written like a person who has done this before, not like a brand deck.
Short sentences. Concrete nouns. No corporate filler, no exclamation marks, no
"elevate your space". Copy should sound like it was written by the person who
put the thing in their own yard.

## Standing rules for this operator

- Blunt and short. One idea at a time. He works fast and hates long messages.
- Never fabricate reviews, ratings, star counts, or "as seen in" claims.
- Never invent spec numbers — use a visible placeholder and ask.
- Ask for a number rather than guessing it, but do not block on it: build with
  a clearly stated assumption and flag it in one line.
- Colours: black and yellow. Not orange.

## The store — The Black Reaper (Halloween 2026)

Three products, one season, dead on November 1st.

| Product | Price | Tiers |
|---|---|---|
| The Black Reaper (solar soul lantern) | $129.99 | 2 for $159.99 · 2 + projector for $199.99 |
| The Haunted Projector | $89.99 | bundle $199.99 |
| The Lighted Ghost Swing | $49.99 | 2 for $79.99 · 3 for $109.99 |

Cross-product add-on prices: Reaper $109.99 · Projector $69.99 · Swing $39.99.

Shipping cutoff: **Tuesday, October 20 2026**, 23:59 ET. Real deadline — never
reset it to manufacture urgency.

Theme: **Horizon**, currently an unpublished draft. Rename it and build on it.

## What's in this repo

- `index.html` — homepage
- `reaper.html`, `projector.html`, `ghost-swing.html` — product pages
- `assets/store.css`, `assets/store.js` — shared design system and buy-box logic
- `assets/img/` — three generated hero images
- `dark-cinematic.html` — an earlier dark direction, kept for reference

These are the reference build. The real target is the Shopify theme.
