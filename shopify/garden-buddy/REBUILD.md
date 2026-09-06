# Garden Buddy — rebuild from scratch

Everything needed to recreate this store on an empty Shopify shop.
`store/store.json` is the source of truth for data. This folder is the source of truth for the theme.

## 1. Shop settings (manual, Shopify admin)
- Currency **USD**, country US.
- Upgrade off the trial plan before selling.
- Remove the storefront password when ready to launch.

## 2. Theme
Duplicate **Horizon**, rename it `GARDEN BUDDY`, leave it unpublished until launch.

Upload every file in this folder to the theme. The reliable method is
`themeFilesUpsert` with a `URL` body pointing at raw.githubusercontent.com — commit and push first,
then upload from the pushed commit.

```
assets/gb.css                  design tokens — the locked palette lives here
sections/gb-header.liquid      trust bar + sticky header + Order Now
sections/gb-footer.liquid      CTA band + footer
sections/gb-product.liquid     buy box: gallery, price, bundles, add to cart
sections/gb-*.liquid           one file per page band
sections/*-group.json          header/footer groups
templates/*.json              page templates
config/settings_data.json     Horizon colour + type settings
```

### Upload gotchas that cost real time
- **A bad value silently rejects the whole file.** `themeFilesUpsert` returns success and
  writes nothing. Always re-query `size` **and `updatedAt`** afterwards; if the timestamp
  did not move, the write was refused.
- `shopify://videos/<id>` is **not** a valid template value for a `video` setting. It rejects the
  file. Use the section's `ugc_src_*` text setting with a direct CDN `.mp4` URL instead.
- Shopify prunes template settings that are not in the stored section schema. Upload the
  **section first**, wait for it to land, then the template.
- Schema `name` for sections, blocks and presets must be **≤ 25 characters**.
- Presets are capped at 50 blocks.
- `url` settings cannot have a relative-path default.

## 3. Products
Create from `store/store.json`. Use `productSet` with `synchronous: true`.
Then set inventory with `inventorySetQuantities` — a rebuilt variant gets a **fresh inventory
item at zero** and will show as sold out until you do.

Assign variant images with `productVariantsBulkUpdate` and a `mediaId`.
`productVariantAppendMedia` fails with a misleading "media does not exist on the specified product".

## 4. Pages, collection, menus
Bodies are in `store/pages/*.html`. Collection and menus are in `store/store.json`.

## 5. Media
`store/store.json` lists every filename. Re-upload with `fileCreate`, keeping the
filenames — templates reference them as `shopify://shop_images/<filename>`.
Note Shopify appends a suffix on re-upload of a duplicate name, which breaks those
references. Check them after a bulk re-upload.

## Rules that are not negotiable
- **No fabricated reviews, ratings, counts or "as seen in".** The shop has zero orders.
  The review section and the social carousel both ship empty with an honest empty state.
- **No invented spec numbers.** Confirmed figures are in `store/store.json`.
  Anything unconfirmed stays out of the page entirely.
- Compare-at prices are arithmetic from real list prices, never decoration.
- The palette in `assets/gb.css` is signed off. Do not drift from it.
