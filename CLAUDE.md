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

## Store 2 — GARDEN BUDDY (Sept 2026, sells now)

Foldable kneeler seat for 55+ US gardeners. Competitor: aimerlallc.com.
Store `aj1wt0-dg.myshopify.com`, theme GARDEN BUDDY id 206497710419 (unpublished Horizon copy).
Files in `shopify/garden-buddy/`. Upload by raw.githubusercontent URL via `themeFilesUpsert`.

### WORKING RULE — never reset the operator's data
He configures the store and the theme editor himself while I work. My job is **add and fix only**.

- Before writing any `templates/*.json` or `sections/*-group.json`, **read the live copy off the
  theme first**, merge my change into it, and write that back. Never upload a template built
  from the repo copy alone — it silently discards whatever he set in the theme editor.
- Never delete product media, variants, or files to "replace" them. Add, then remove only what
  he asked to remove, by name.
- Section `.liquid` files are mine and safe to overwrite. Templates and settings are his.
- After every upload check **`updatedAt`**, not just the success response: a rejected file
  returns success and writes nothing.

### PALETTE — LOCKED. The operator approved this exact combination. Do not drift.

| Token | Value | Use |
|---|---|---|
| `--night` | `#2A1D11` | deepest brown: trust bar, footer CTA band |
| `--night-2` | `#1C1309` | footer proper |
| `--brown` | `#3B2A1B` | review band, card frames, headings on white |
| `--lime` | `#A8F32A` | NEON green. Every CTA, icon, eyebrow on brown |
| `--lime-ink` | `#12290C` | the only text colour allowed on lime |
| `--sand` | `#F4EEE2` | warm section ground |
| `--paper` | `#FFFFFF` | cards, page ground |
| `--leaf` | `#5C8C1E` | olive check circles on light grounds |
| `--yellow` | `#FFC72C` | the logo's yellow, save stamps only |

Logo: `shopify://shop_images/f70cfb36-00ec-44bf-939c-5af7445d7a9e.png` — yellow wordmark,
brown outline, sunflower with a green cap. Already in the header and both footer slots.

Fonts, loaded from Google in `gb-header.liquid`: Poppins headings, Inter body,
**Caveat** for the handwritten accent lines. Never swap these without being asked.

### Structure
One product, `foldable-kneeler-seat`, Pack × Color (Blue/Brown):
1 Kneeler 69.99 · Kneeler + Tool Set 99.99 (was 109.98) · 2 Kneelers + Tool Set 129.99 (was 179.97).
Bundle cards are WHITE with a 3px brown frame and a neon ring when selected. Not brown cards.
The 10-piece tool set is product `garden-tool-set`, kept DRAFT: bundle-only, no page of its own.

### Still open
- Specs (weight, capacity, pad thickness, delivery window) are `[ PLACEHOLDERS ]` until confirmed.
- Reviews ship empty with an honest placeholder. Zero orders — never invent one.
- The five branded ad creatives need uploading to Shopify Files before the gallery is finished.
