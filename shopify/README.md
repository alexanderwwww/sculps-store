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
