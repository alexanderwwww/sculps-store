# sculps-store

Rebuild workspace for the **Mea Culpa** storefront (`meaculpa-co.myshopify.com` / www.meaculpa.us).

The current store is being remade. This repo holds a complete map of what exists today —
which section pulls which content, and the exact Shopify CDN URL behind every image — so the
new build can re-point each slot deliberately instead of guessing.

## Start here

**[`docs/STORE-MAP.md`](docs/STORE-MAP.md)** — the full map. Every section of every template,
what content it pulls, whether it actually renders, and what is broken. Sections 11 and 12 are
the working list: what's broken, ranked, and the reusable CDN asset library.

## Layout

```
docs/
  STORE-MAP.md        Section-by-section content map — the main reference
  theme-manifest.md   ALEXANDER theme file inventory and the app/theme stack

store-data/           Content exported from the Shopify Admin API
  products/           One JSON per product (167) + _index.json for slot-filling
  collections/        _index.json — all 20 collections with counts, rules, images
  pages/              _index.json — all 6 pages with template resolution + breakage
  navigation/         menus.json — all 6 menus and what each is wired into
  settings/           theme-settings.json — colour, type, cards, app embeds
  blogs/  metafields/ (not yet exported)
```

Theme code itself is not stored here — it lives in the ALEXANDER theme on the store.
`docs/theme-manifest.md` records its file inventory.

## Snapshot source

- Store: **Mea Culpa**, Shopify plan, USD, EDT, US
- Theme mapped: **ALEXANDER** — `gid://shopify/OnlineStoreTheme/159112102046`, unpublished, preview `/t/19`
- Base theme: Bullet (Krown) + PageFly
- Snapshot date: 2026-09-02
- 167 products, 20 collections, 6 pages, 6 menus

Everything is read through the Shopify MCP connector, so no API tokens live in this repo.
If the connector's token expires, reconnect it from claude.ai → Settings → Connectors → Shopify.

## Rules

- No API tokens, passwords, or customer PII in this repo.
- No customer or order data — the snapshot covers content and configuration only.
- Shopify CDN URLs are recorded verbatim, query string included; they are the live asset
  references the rebuild will use.
