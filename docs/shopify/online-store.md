# Online Store — what Shopify's screen actually is

Taken from Alex's own Shopify admin (screenshot, 2026-09-10). This is the
target. Build this, not an interpretation of it.

## Header row
- Left: a green shop glyph, then the title **Online Store**.
- Right, in order: a **Public ▾** pill (eye icon + word + chevron), a **View
  store** button (secondary), and a **⋯** icon button.

## Web Vitals strip — one card, five cells divided by vertical rules
| cell | content |
|---|---|
| 1 | calendar icon + **30 days** |
| 2 | **LCP P75**, underlined with a dotted underline (it is a definition), value like `0 milliseconds`, then a small trend dash `—`, then a thin horizontal bar |
| 3 | **INP P75**, same shape |
| 4 | **Cumulative Layout Shift**, value `0`, dash, bar |
| 5 | **Sessions by Device Type** — `47 Desktop`  `6 Mobile`, each number bold with the label in grey |

Cells 2–4 have a thin coloured rule under the value (Shopify's sparkline
stand-in). The whole strip sits above the theme card with the page's own
background showing through around it.

## Live theme card
A large rounded card showing **the real storefront**, rendered, not a
screenshot placeholder:
- The store's announcement bar at the top of the preview (dark), then the
  storefront header, then the hero — i.e. an actual render of the live page,
  clipped to the card.
- The lower part of the preview fades/blurs out.
- Bottom-left overlay: the domain in bold (`gardenbuddy.store`), and under it
  `THEME NAME · Last saved: <weekday> at <time>`.
- Bottom-right: **Edit theme** (primary, dark) and a **⋯** button.

## Draft themes
Heading **Draft themes** on the left, **Import ▾** button on the right, then
the list of draft themes.

## Where our data comes from
- LCP / INP / CLS: `web_vitals` table, P75 over 30 days, `p75()` in
  `app/lib/vitals.ts`. Under five samples → the metric shows "Collecting"
  rather than a fake number.
- Sessions by device: `events.device`, distinct `session_id` over 30 days.
- Live theme card: the existing scaled iframe of the storefront.
- Last saved: the live theme's `updatedAt`.
