# XERO Chiron — launch readiness

Store: **XERO** · `hsjwij-bw.myshopify.com` · Basic plan · USD
Theme: `xero-chiron-one-page-store` — id `197031330176`

---

## Done (store side)

| | |
|---|---|
| Plan | Basic — the store can take money once a provider is connected |
| Currency | USD, matching every `$` on the page |
| Products | XERO Chiron (2 variants) + Wireless key. Both ACTIVE, both published to Online Store and Shop |
| Inventory | Tracked, policy `CONTINUE`, so nothing goes out of stock mid-launch |
| Shipping | **$0.00 in both zones.** Was €5/€13 domestic and €16 international while the page promised free delivery |
| Rate names | Were Greek (`Τυπική`, `Γρήγορη`). Now "Free delivery" with a description |

## Done (theme side)

- **`xero-ugc.liquid`** — scroll-driven 9:16 coverflow, six shots, glass caption chips
- **`xero-popup.liquid`** — rebuilt as real HTML/CSS over a photo instead of a flat export. Sharp at every density, editable copy, one image serves both orientations. 2s delay, once per session, `version` bump re-shows it
- **Sprite killed** — see below
- **Buy box** — second bundle is now Chiron + 10-Year Replacement at $6,998.99 (+$1,999.99). Charger row and battery bundle gone
- **`xero-product-data.liquid`** — one add-on (the key) instead of three
- **FAQ** — the "what comes with it" answer no longer promises a charger and a spare battery that are not for sale

### The sprite

Three separate stand-ins shared the bike's spot on the stage and each came back on its
own schedule:

1. the flat PNG sprite — three stacked `<img>` pointed at `window.XERO_ASSETS.bikeDay`
   etc. With nothing uploaded the src is a bare relative filename, so they 404 and paint
   a broken-image glyph
2. a fake contact shadow — a radial-gradient ellipse pinned to the sprite's ground line,
   meaningless once a real model orbits on its own axis
3. the reference cube — the FRONT/BACK/LEFT/RIGHT placeholder box from before the GLB

`_paintCube()` restored 1 and 2 on **every** world, day/night and view change, and JS
alone could never win the race: `connectedCallback` builds and paints all of it before
`xero-model.js` gets to patch anything, so every page load had a visible flash.

Fixed in two places on purpose. `xero-fix.css` hides all three unconditionally, which
covers the flash window CSS-first. `xero-model.js` gained `killStandIns()`, wired into
`_paintCube`, `_layout`, boot and post-`useModel`, so nothing brings them back later.
The stand-ins are now gone even if the GLB fails — an empty stage is the right failure
mode, a broken-image glyph is not.

---

## Blocking — only you can do these

### 1. Connect a payment provider

`paymentSettings.supportedDigitalWallets` is **empty**. No provider is connected, so
right now nobody can pay for anything. This is the single thing standing between the
store and its first order.

Settings → Payments → activate Shopify Payments (or PayPal).

While you are there: the popup and the buy box both advertise **Affirm, Afterpay,
Klarna and Shop Pay**. None of them exist on this store yet. Advertising financing
partners at the point of sale that cannot be selected at checkout is a false claim, and
it is the kind that gets a store flagged. Either turn them on, or set **Show partner
row** to off in the popup section and drop the four chips from the buy box until they
are live.

### 2. Publish the theme

The live theme is still **Horizon**. `xero-chiron-one-page-store` is unpublished, so
none of this work is visible to a visitor. `themePublish` is blocked over the API for
safety — Online Store → Themes → Actions → Publish.

### 3. Paste the policies

Only a privacy policy exists. Refund, shipping, terms and contact are all missing. Full
text is in `STORE-POLICIES.md`; the API connection lacks `write_legal_policies` so they
could not be published from here. The footer already loops `shop.policies`, so they
appear there the moment they exist.

### 4. Pick the popup photo

The popup is set to `hf_20260816_100151_…png` as a starting point, chosen because it is
a 2752×1536 landscape from the same batch as your banners. If it is the wrong shot,
swap it in the theme editor — the section takes one landscape image and re-crops it for
portrait on mobile.

### 5. Markets

The only market is **Greece**, on a store whose country is the United States. US buyers
reach checkout through the International zone rather than a domestic one. Worth setting
the primary market properly before you drive traffic.

---

## Not fixed — your call, flagged honestly

**Specifications are invented.** 980 Nm, 120 km/h, 8.4 kWh, 104 kg, 82 hp, IP69K, 2.3 s
0–60, 1,500 cycles, 15,000 rpm, IP69K sealing. They appear in the hero, the compare
table, the breakdown, the astra section and six FAQ answers. Every one of them is a
number I wrote as a placeholder. Selling a $4,999 vehicle on performance figures that
were never measured is the largest exposure on the site.

**42 reviews are fabricated.** Names, avatars, star ratings, copy. Review fraud is
separately actionable from ordinary marketing puffery in the US, UK and EU.

**The compare table.** It names an unnamed "Class leader" at $13,490 and puts XERO
ahead on nearly every row — including 980 Nm against 978 Nm, which reads as constructed
rather than observed. Comparative advertising against an identifiable competitor
carries real liability, and "Class leader" at that price point is identifiable to
anyone in the category.

**`key_step3_phone.jpg` is used three times** — the gallery, the iPhone-key section, and
again as the step-3 image within it.

**Orphaned sections on disk:** `xero-app.liquid` (23KB) and `xero-delivery.liquid` (9KB)
are not in `index.json`. Harmless, but they are dead weight in the theme.
