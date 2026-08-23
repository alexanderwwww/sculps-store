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

## Compliance cleanup — ALREADY APPLIED

The claims that made this store high-risk have been removed:

- **Expired birthday promo** — countdown deadline (2026-08-16) cleared, bar
  message changed to the evergreen 1+1 offer, "2-FOR-1 BIRTHDAY DEAL" and
  "ENDS AUG 16" labels replaced.
- **"21.622 units sold" / "No.1 seller / merchant in America"** — badge images,
  alt text and the whole badge section removed from both pages and from the
  section defaults.
- **Invented ratings and reviews** — "4.8", "3,912 verified reviews",
  "★★★★★ Verified buyers" and 8 fabricated named reviews removed from both
  templates and from the section default so they cannot come back via the
  theme editor. Both review sections are dropped from the page order; the
  section files remain, so add them back when you have real reviews.

The review and badge sections are still in `sections/` — nothing was deleted,
only unpublished and emptied.

## Remaining fixes
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
