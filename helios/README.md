# HELIOS theme — recovered custom code

Recovered from the build session transcript. This is the FINAL deployed state of every
custom `helios-*` section plus the homepage and product templates.

## What's here
- `sections/helios-*.liquid` — all custom sections (hero, buy box, bundles, reviews,
  FAQ, guarantee, footer, nav, sticky ATC, countdown bar, badge, etc.)
- `templates/index.json` — homepage layout + all copy/settings
- `templates/product.helios-super-glide.json` — product page layout + settings

## What is NOT here (and can't be)
- The base theme (Impulse/Dawn parent files) — download a fresh copy of the same theme
- `config/settings_data.json` — global theme settings: colors, fonts, logo
- `assets/` — the base theme's CSS/JS
- Product data, orders, customers, images
- `helios-cart-recover.liquid` / `helios-welcome-popup.liquid` — uploaded via staged
  upload, body not in the transcript. Both were non-essential add-ons.

## Before you reuse this anywhere — REQUIRED FIXES
1. **Remove the "21.622 UNITS SOLD" / "NO.1 SELLER IN AMERICA" claims.**
   Locations: `templates/index.json` (badge_alt, badge section alt),
   `sections/helios-badge.liquid`, `sections/helios-buy.liquid`.
   These are unverifiable sales claims and are a real factor in platform reviews.
2. **`★★★★★ Verified buyers`** eyebrows in `helios-reviews-carousel` and both templates —
   only keep if the reviews are real and from real orders.
3. **11 `cdn.shopify.com` image URLs** point at the restricted store. Re-upload the
   images to the new host and replace the URLs, or they will 404.
4. Fix the known funnel bugs before spending on ads: sticky-bar variant trap and the
   unchecked add-to-cart response in `helios-buy.liquid` / `helios-sticky-atc.liquid`.

## Install
Upload the `sections/` and `templates/` files into a fresh copy of the same base theme,
then set global colors/fonts/logo by hand.
