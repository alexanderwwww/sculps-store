# Shopify build — The Black Reaper

Live store: `jpxcv9-f2.myshopify.com`
Theme: **The Black Reaper — Halloween 2026** (`gid://shopify/OnlineStoreTheme/205593117009`, unpublished draft)
Preview: https://jpxcv9-f2.myshopify.com/?preview_theme_id=205593117009

## What is in the store

| Product | Handle | Variants |
|---|---|---|
| The Black Reaper | `the-black-reaper` | 1 Reaper 129.99 · 2 Reapers 159.99 · 2 + Projector 199.99 |
| The Haunted Projector | `the-haunted-projector` | 89.99 |
| The Lighted Ghost Swing | `the-lighted-ghost-swing` | 1 · 2 (79.99) · 3 (109.99) |

Collection: `halloween-2026`. Inventory: 250 per variant, tracked.
Pages: `/pages/shipping`, `/pages/returns`, `/pages/faq`.
Menus: main-menu (3 products + Shop all), footer (Shop all, FAQ, Shipping, Returns).

## Theme

- `templates/index.json` — hero, 3-up product list, bundle band, closer
- `sections/header-group.json` — announcement bar with the Oct 20 cutoff
- `config/settings_data.json` — dark palette, yellow primary buttons, Archivo

Palette: background `#0D0D0F`, text `#F2F0EA`, accent `#F5C518` (yellow fills, black type on them).

## Done by hand in admin (API cannot)

- Publish the theme (theme publishing is blocked for safety)
- Rename the store from "My Store 2" to The Black Reaper — Settings → Store details
- Currency is EUR. Prices were written as US numbers, so they render as €129.99.
  Switch to USD in Settings → Store details if the market is the US.
- Remove the storefront password once ready to take traffic

## Team build (Sept 6)

Custom sections replace every stock Horizon surface on the draft theme:
`tbr-header`, `tbr-footer`, `tbr-home`, `tbr-product` (buy box), `tbr-product-below`,
`tbr-collection`, `tbr-page`. Per-product templates: `product.json` (reaper),
`product.the-haunted-projector.json`, `product.the-lighted-ghost-swing.json`.

Uploads go by public raw GitHub URL (`body.type: URL`) — push first, then upsert.
Shopify rejects silently on URL uploads; when a file does not land, upload it as
TEXT to read the error. Limits hit so far: section/block/preset `name` ≤ 25 chars,
preset ≤ 50 blocks, no relative-path default on `url` settings.

Leftovers that cannot be deleted through the API (harmless, unused):
`sections/zz-probe-video.liquid`, `sections/zz-probe-js.liquid`, `templates/page.schema-test.json`.
