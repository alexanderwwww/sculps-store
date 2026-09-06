# GARDEN BUDDY — full store snapshot

Everything needed to stand this store up again on a blank Shopify account:
the theme code, every setting the operator has touched, the product, the
copy, the navigation, and all 51 images and 4 videos as actual files.

## Run it

```bash
export SHOP=yourshop.myshopify.com
export TOKEN=shpat_...          # custom app token
node scripts/restore.mjs
```

The token needs `write_products`, `write_files`, `write_themes`,
`write_content`, `write_online_store_navigation`, `write_publications`,
`write_inventory`.

Before running it, duplicate Shopify's **Horizon** theme in the target store
and rename the copy to `GARDEN BUDDY`. The script finds it by that name (or
pass `THEME_ID=gid://shopify/OnlineStoreTheme/...`). Everything under
`sections/` is ours and overwrites cleanly; the rest of Horizon comes from
Shopify and is not stored here.

## What is where

| Path | What it is |
|---|---|
| `sections/gb-*.liquid` | Every custom section. This is the website. |
| `assets/gb.css` | Design tokens and shared styles. The palette lives here. |
| `store/theme/templates/*.json` | Which sections are on which page, in what order, with every text and image setting. |
| `store/theme/sections/*-group.json` | Header and footer settings. |
| `store/theme/config/settings_data.json` | Theme settings: fonts, button colours, radii, cart type. |
| `store/data/products.json` | Product, options, all three bundle variants, prices, compare-at prices, SKUs, inventory, per-variant image. |
| `store/data/files.json` | Every file in Content > Files, with its alt text and what it is used for. |
| `store/data/navigation.json` | Both menus and both collections. |
| `store/data/pages.json` + `store/pages/*.html` | Shipping, Returns, FAQ, Contact. |
| `store/data/shop.json` | Shop-level facts and what is still open. |
| `store/media/images/` | All 51 images, original filenames. |
| `store/media/video/` | All 4 UGC clips as .mp4. |

## Filenames are load-bearing

Theme settings reference images as `shopify://shop_images/<filename>`. If a
filename changes on re-upload, the reference dies silently and the section
renders its placeholder. Shopify only keeps the filename you give it when no
other file already claims it — upload into an empty store, or the second copy
comes back as `name_1.png` and nothing points at it.

## Traps this script already works around

1. **`themeFilesUpsert` returns success and writes nothing** when the content is
   invalid. Check `size` *and* `updatedAt` after every write, never the mutation
   response. The script re-queries and throws.
2. **A template naming a section Shopify does not have yet is rejected whole.**
   Push `sections/*.liquid`, wait, then push `templates/*.json`.
3. **Shopify prunes template settings that are not in the stored section schema.**
   Same fix as above: the section has to land first.
4. **`shopify://videos/<id>` is not valid in a `video` template setting** and
   rejects the whole file. Use a direct CDN `.mp4` in a text setting instead.
5. **`productVariantAppendMedia` says "media does not exist on the specified
   product"** even when it does. Use `productVariantsBulkUpdate` with `mediaId`.
6. **A newly created variant has zero on hand** and renders SOLD OUT.
   `inventoryItemUpdate` to set tracked, then `inventorySetQuantities`.
7. **Uploads are asynchronous.** A file referenced before `fileStatus: READY`
   shows as broken. The script polls.
8. **An ACTIVE product still 404s** if it is not published to the Online Store
   sales channel. `publishablePublish`, not just `status: ACTIVE`.

## Working rule that produced this snapshot

The operator configures the store and the theme editor himself. Templates and
settings are his; `sections/*.liquid` are ours. Before writing any
`templates/*.json` or `sections/*-group.json`, read the live copy off the theme,
merge into it, write that back. A theme-editor save from a tab loaded before a
section was added will silently drop that section.

## Still open

- Weight, weight capacity, pad thickness and the delivery window are
  `[ PLACEHOLDERS ]` on `/pages/faq` and `/pages/shipping`. Real numbers needed.
- The reviews section ships empty on purpose. Zero orders. Nothing invented.
- The storefront password is on and the GARDEN BUDDY theme is unpublished —
  stock Horizon is still what a visitor sees.
- Trial plan has to be upgraded before the store can take money.
