# Mea Culpa — full store map

Snapshot taken 2026-09-02 from **Mea Culpa** (`meaculpa-co.myshopify.com` / www.meaculpa.us),
theme **ALEXANDER** (`gid://shopify/OnlineStoreTheme/159112102046`, unpublished, preview `/t/19`).
Base theme: Bullet (Krown) + PageFly.

This document maps **every section to the exact content it pulls** — collection handles,
product handles, and resolved Shopify CDN image URLs — so the rebuild can re-point each
slot deliberately instead of guessing.

Legend: **LIVE** = renders · **OFF** = section or block disabled in the theme editor · **DEAD** = points at content that is empty or missing.

---

## 1. Homepage — `templates/index.json`

Render order top to bottom. Only three of the eight sections actually render.

### 1.1 `hero` — `gs-hero` — **LIVE**

| Slot | Value |
|---|---|
| Desktop image | `Copy_of_Mea_Culpa_70_Off_Banner_970_x_1110_px_970_x_1110_px_Desktop_Wallpaper_5.png` — 4080×2295 |
| Desktop URL | https://cdn.shopify.com/s/files/1/0563/9107/3950/files/Copy_of_Mea_Culpa_70_Off_Banner_970_x_1110_px_970_x_1110_px_Desktop_Wallpaper_5.png?v=1759495852 |
| Mobile image | `IMG_5680.jpg` — 4000×6000 |
| Mobile URL | https://cdn.shopify.com/s/files/1/0563/9107/3950/files/IMG_5680.jpg?v=1759158193 |
| CTA label | `shop` |
| CTA target | `shopify://products/sucura-set` → `/products/sucura-set` |
| Height | `--heroHeight-f` (full viewport) · image not clickable · title and body copy both empty |

Note: the desktop asset is a 16:9 wallpaper crop named for a 970×1110 portrait banner, and
the mobile asset is a raw 4000×6000 phone photo. Neither is cut for the slot it sits in.

### 1.2 `gs_marquee_U3p9Dm` — `gs-marquee` — **LIVE**

| Slot | Value |
|---|---|
| Text | `FREE SHIPPING ON ORDERS OVER $75!` |
| Image | `CULPA0200202.png` — 1222×1148 |
| Image URL | https://cdn.shopify.com/s/files/1/0563/9107/3950/files/CULPA0200202.png?v=1714871646 |
| Link | *(none)* |
| Style | white bg, black text, speed 35, pauses on hover, 26px desktop / 17px mobile |

### 1.3 `17621943475f439dfc` — `apps` (GSC Countdown Timer) — **OFF**

Two countdown blocks, both disabled. One has an empty `widget_id`, the other is
`GSC-SMALL-ieXCuWFPYMMm`. Renders nothing.

### 1.4 `gs_featured_collection_QW8Vmi` — `gs-featured-collection` — **LIVE**

| Slot | Value |
|---|---|
| Collection | `70-off-sale` → "70% OFF SALE", 30 products, manual sort |
| Products shown | 12 |
| Heading | hidden (`show_heading: false`) |
| Layout | grid, no horizontal scroller |

This is the only product content on the homepage.

### 1.5 `gs_collage_VdEbzJ` — `gs-collage` — **OFF** (whole section disabled)

| Block | State | Content |
|---|---|---|
| `text_z8VhiX` | on | "Join the Mea Culpa community! Stay in the loop with our latest drops, style inspo, and exclusive behind-the-scenes content on Instagram and TikTok." — span 2, hidden on mobile |
| `image_E4zDWn` | off | `IMG_8367.png` 3600×4500 — https://cdn.shopify.com/s/files/1/0563/9107/3950/files/IMG_8367.png?v=1716573233 — no link |
| `image_KycntV` | on | `meaculpalifestyle-668_1.jpg` 3598×2400 — https://cdn.shopify.com/s/files/1/0563/9107/3950/files/meaculpalifestyle-668_1.jpg?v=1730581791 → links to `shopify://collections/fall-drop`, opens new window |
| `image_YM6YUw` | off | `P_Y_5_2b3dbe9a-1f78-48b7-9a43-69dfb83ad79f.png` → links to `shopify://products/yellow-green-fun-day-bikini-top` |

The only social proof / lifestyle imagery on the homepage is in here, and it is switched off.

### 1.6 `gs_featured_collection_mfMctT` — `gs-featured-collection` — **OFF + DEAD**

Points at collection `mystery-boxes`, which currently holds **0 products**. Even if
re-enabled it would render an empty grid.

### 1.7 `hero-double` — `gs-hero-double` — **OFF**

| Block | Image | URL | Link |
|---|---|---|---|
| `banner1` | `IMG_5532.jpg` 1179×1179 | https://cdn.shopify.com/s/files/1/0563/9107/3950/files/IMG_5532.jpg?v=1714872604 | none set |
| `banner2` | `IMG_5535.jpg` 1179×1179 | https://cdn.shopify.com/s/files/1/0563/9107/3950/files/IMG_5535.jpg?v=1714872604 | none set |

Two-up on desktop, one-up on mobile. Both banners have empty titles and empty URLs, so
even enabled they would be decorative dead ends.

### 1.8 `17621949206a1c8a1d` — `apps` — **OFF**

No blocks at all.

---

## 2. Header — `sections/group-header.json`

| Order | Section | State | Content |
|---|---|---|---|
| 1 | `apps` (GSC countdown `GSC-SMALL-ieXCuWFPYMMm`) | OFF | — |
| 2 | `header-marquee` | **LIVE** | `UP TO 70% OFF 💕 FREE SHIPPING OVER $75` · bg `#e65cc4` (pink) · text `#ffffff` · speed 40 · no link · shows on all pages |
| 3 | `header` | **LIVE** | see below |
| 4 | `apps` (GSC countdown `GSC-EMBED-CduDsVpsvMEe`) | OFF | — |

`header` blocks, in order: **menu → logo → accounts**

- **logo** — `MC_ZIPPERLOGO2_copy_4185a891-f6b6-440e-989c-e2edfa457c46.png`, 2078×267
  https://cdn.shopify.com/s/files/1/0563/9107/3950/files/MC_ZIPPERLOGO2_copy_4185a891-f6b6-440e-989c-e2edfa457c46.png?v=1714871975
  size 20, centered, no text fallback.
- **menu** — linklist `main-menu`, left aligned, no dropdown icons, no open-on-hover.
- **accounts** — account link on, **search bar off**, no country/language selector.
- Section settings: sticky (`headerPosition: true`), no border, transparent overlay on the
  homepage (`homeOverlay: true`) with white bg / black text when solid.

**The header marquee promises "UP TO 70% OFF" and the nav offers no route to the `70-off-sale`
collection.** The homepage grid is the only entry point.

---

## 3. Footer — `sections/group-footer.json`

| Order | Section | State |
|---|---|---|
| 1 | `footer-backtop` | OFF |
| 2 | `footer` | LIVE |
| 3 | `footer-bottom` (`sub-footer`) | LIVE |

`footer` blocks:

| Block | State | Content |
|---|---|---|
| `newsletter` | **LIVE** | "Get 10% off your next purchase. Subscribe to our newsletter." |
| `socials` | **LIVE** | centered desktop / left mobile · Follow-on-Shop off |
| `motto` | **OFF** | still holds Bullet's placeholder text: "Use this to add additional information about your business, e.g. address, opening hours etc." |
| `menu` | **OFF** | would render linklist `footer` — which contains only "Search" |

`footer-bottom` blocks: `payments` (colour icons) · `selectors` (country as flag + language) ·
`copyright` (**empty string**) · `credits`.

**The footer has zero navigation and zero legal links.** The `policy` menu (shipping, refund,
privacy, terms, about) exists in Shopify but is not wired into any menu block anywhere.

---

## 4. Product pages — `templates/product.json`

| Order | Section | State | Notes |
|---|---|---|---|
| 1 | `apps` — Bundler "custom bundle" block | LIVE | shortcode empty |
| 2 | `main` — `t-product` | LIVE | see below |
| 3 | `product-recommendations` | LIVE | 6 products, horizontal scroller on mobile |

`main` block order and state:

| Block | State | Settings |
|---|---|---|
| `title` | LIVE | |
| `price` | LIVE | shows price when sold out |
| `vendor` | OFF | |
| `description` | LIVE | heading "Description", not collapsible |
| `subtitle` | LIVE | |
| `collection_variants` | LIVE | "More from this collection", 4 products |
| `variant_picker` | LIVE | button style, square swatches, text shown, **no size chart attached** |
| `buy_buttons` | LIVE | floating sticky button with price, dynamic checkout, pickup availability |
| `share` | OFF | |
| `collapsible_tab` | OFF | empty placeholder |
| `collapsible_tab_J97fGK` | **OFF** | "Size Chart" → page `fun-day-bikini-sizing-chart` |
| `collapsible_tab_gmBWAy` | **OFF** | "Materials" → 90% Polyester / 10% Spandex |
| `collapsible_tab_UPifdY` | **OFF** | "Shipping and Returns" → **content empty** |

Media: position 3, layout `row2full`, mobile slider, zoom on, thumbnail slider off, slide
counter on, video autoplay and looping both off.

**Every trust element on the PDP is disabled**: no size chart, no materials, no shipping and
returns, no sharing. For an apparel store where 90 of 167 products are beanies and the rest
are sized garments, the missing size chart is the single biggest conversion leak.

---

## 5. Collection pages — `templates/collection.json`

Single section `main` (`t-collection`):

| Setting | Value |
|---|---|
| Featured image | off |
| Description | off |
| Filters | **on** |
| Suggested linklist | `shop-all` |
| Pagination | infinite scroll |
| Products per page | 9 |
| Collection list | empty |

Grid columns come from global settings: 3 desktop / 3 tablet / 2 mobile.

---

## 6. Other templates

| Template | Used by | State |
|---|---|---|
| `page.json` | `about-us` | live |
| `page.contact.json` | *nothing* | orphaned — contact form (name, email, phone, message, button) exists but no page uses it |
| `page.lookbook.json` | *nothing* | orphaned — 7-block `gs-collage` grid, **all image slots empty** |
| `page.about.json` | *nothing* | orphaned |
| `page.faq.json` | *nothing* | orphaned |
| `page.press.json` | *nothing* | orphaned |
| `page.events.json` | *nothing* | orphaned |
| `page.brands.json` | *nothing* | orphaned |
| `page.single-column.json` | *nothing* | orphaned |
| `page.pf-1b74b8f9.json` | `early-access` | live (PageFly) |
| `page.page.json` | **MISSING** | `hoodie-size-chart` and `sweatpants-size-chart` both request suffix `page` — template does not exist in the theme |
| `page.MaxBundle.json` | **MISSING** | `mc-ice-bundle` requests suffix `MaxBundle` — template does not exist in the theme |

### Password page — `templates/password.json`

Main `t-password` section is **disabled**, as are the collage and the countdown (whose target
date `12-31-2025` is already in the past). The only live section is `gs_hero_xTtXP8`:

- desktop `Untitled-2.png` 2000×1110 — https://cdn.shopify.com/s/files/1/0563/9107/3950/files/Untitled-2.png?v=1729955813
- mobile `14.png` 970×608 — https://cdn.shopify.com/s/files/1/0563/9107/3950/files/14.png?v=1730659899

Disabled-but-stored content worth keeping: password hero `MEAAAAA.png` 1080×1080
(https://cdn.shopify.com/s/files/1/0563/9107/3950/files/MEAAAAA.png?v=1764810355), the
"RESTOCK COMING SOON" motto, a Black Friday newsletter capture, and collage image
`MC_16.heic` 1519×1012 (https://cdn.shopify.com/s/files/1/0563/9107/3950/files/MC_16.heic?v=1729955705 — **HEIC, will not render in most browsers**).

---

## 7. Navigation

| Menu | Handle | Items | Wired into |
|---|---|---|---|
| Main menu | `main-menu` | `new in` → `/collections/new-arrivals` (11) · `shop` → `/collections/mar7th-drop` (7) · `search` | header |
| Footer menu | `footer` | `Search` only | nothing (footer menu block is off) |
| menu | `menu` | Home · New Arrivals (parent links to `/`, child to `/collections/new-arrivals`) | nothing |
| policy | `policy` | Shipping · Refund · Privacy · Terms · About Us | **nothing** |
| shop all | `shop-all` | beanies · Sets · Sweatsuits · tops · dresses · accessories · swim · mystery boxes | collection page "suggested links" only |
| Customer account main menu | `customer-account-main-menu` | Orders · Profile | account area |

Two of the eight `shop-all` links point at **empty collections** (`sweatsuits` 0, `mystery-boxes` 0).

---

## 8. Collections — all 20

| Handle | Title | Products | Sort | Type | Image |
|---|---|---:|---|---|---|
| `shop-all` | shop all | 166 | manual | smart (price > 1) | — |
| `beanies` | beanies | 90 | manual | manual | [blackandwhiteoriginal.jpg](https://cdn.shopify.com/s/files/1/0563/9107/3950/collections/blackandwhiteoriginal.jpg?v=1715201211) 1000×1000 |
| `70-off-sale` | 70% OFF SALE | 30 | manual | manual | — |
| `swim` | swim | 21 | manual | smart (title contains "bikini") | — |
| `fall-drop` | FALL DROP | 20 | manual | smart (tag = fall24) | — |
| `new-arrivals` | new arrivals | 11 | manual | manual | — |
| `t-shirts` | tops | 10 | best selling | manual | [embosstfinalpink.png](https://cdn.shopify.com/s/files/1/0563/9107/3950/collections/embosstfinalpink.png?v=1715201181) 2184×2933 |
| `mar7th-drop` | LATEST ARRIVALS | 7 | manual | manual | — |
| `dresses` | Dresses | 4 | best selling | manual | — |
| `accessories` | accessories | 3 | created desc | manual | [HEADBAND6.png](https://cdn.shopify.com/s/files/1/0563/9107/3950/collections/HEADBAND6.png?v=1715201157) 3000×3000 |
| `sets-1` | SETS | 3 | manual | manual | — |
| `socks` | Socks | 1 | best selling | manual | — |
| `sets` | Sets | 1 | best selling | manual | — |
| `mystery-boxes` | mystery boxes | **0** | manual | smart (tag = mystery) | — |
| `sweatsuits` | Sweatsuits | **0** | best selling | manual | — |
| `sucura-tops-bottoms` | Sucura Tops & Bottoms | **0** | best selling | manual | [DSC09872.jpg](https://cdn.shopify.com/s/files/1/0563/9107/3950/collections/DSC09872.jpg?v=1747405987) 3861×4826 |
| `bikini-tops` | Bikini tops | **0** | best selling | manual | — |
| `bikini-bottoms` | Bikini bottoms | **0** | best selling | manual | — |
| `bikini-tops-2` | Bikini tops 2 | **0** | best selling | manual | — |
| `bikini-bottoms-2` | Bikini bottoms 2 | **0** | best selling | manual | — |

**7 of 20 collections are empty**, and four of those are duplicate bikini top/bottom pairs.
Only 3 collections carry an image, so any "shop by category" section would render mostly blank.
`mystery-boxes` is the only collection with real description copy.

---

## 9. Pages

| Handle | Title | Template suffix | State |
|---|---|---|---|
| `about-us` | About Us | *(default)* | live — "Mea Culpa is a clothing brand based out of Philadelphia. Established in 2020…" |
| `fun-day-bikini-sizing-chart` | Fun Day Bikini Sizing Chart | *(default)* | live — real measurement table, **not linked from any PDP** |
| `hoodie-size-chart` | Hoodie Size Chart | `page` | **broken** — body empty, template missing |
| `sweatpants-size-chart` | Sweatpants Size Chart | `page` | **broken** — body empty, template missing |
| `early-access` | Early Access | `pf-1b74b8f9` | live (PageFly), body empty |
| `mc-ice-bundle` | MC ICE BUNDLE | `MaxBundle` | **broken** — template missing |

---

## 10. Global theme settings — `config/settings_data.json`

**Colour**

| Token | Value |
|---|---|
| Background | `#FFFFFF` |
| Text / headings / links | `#000000` |
| Link hover | `#e65cc4` (pink) |
| Button bg / buy button bg | `#e65cc4` |
| Button text | `#FFFFFF` |
| Borders | `#000000`, 1px, radius 0 |

**Type** — body `anonymous_pro_n4` (monospace), headings `ff_tisa_sans_n4`, heading scale 100%.
The two faces are from unrelated families; the body monospace is doing the heavy lifting on
a fashion store.

**Identity / SEO**

| Field | Value |
|---|---|
| Favicon | `CULPA0200202.png` (same asset as the marquee image) |
| SEO logo | `CULPA0200202.png` |
| Site title | `MEA CULPA` |
| Site description | `Discover the latest collections from Mea Culpa. Shipping worldwide.` |
| Instagram | https://instagram.com/meaculpa.co |
| TikTok | https://www.tiktok.com/@meaculpa.co |
| Breadcrumbs | off |

**Product cards** — base style, portrait ratio, wide crop, hover image on, quick buy on
(both hover and button, with price), transparent card background. Grid 3 / 3 / 2.
Cart is a **drawer**.

**Layout** — boxed at 1200px, no border radius anywhere, no image padding.

### App embeds active

| App | Purpose |
|---|---|
| Swatch King | variant swatches, "after image", switch on hover |
| Klaviyo | email / SMS capture |
| PageFly | page builder |
| Bundler | product bundles (block on PDP) |
| AMP Slide Cart Drawer | cart drawer — **overlaps the theme's own `cart_type: drawer`** |
| GSC Countdown Timer | countdown bar — embed active, but every placed countdown block is disabled |

Six app embeds on a store whose homepage renders three sections. AMP Slide Cart and the
theme's native drawer are two cart implementations loaded at once.

---

## 11. What is actually broken

Ranked by impact on the rebuild.

1. **The homepage is three sections deep.** Hero → marquee → one 12-product grid, then
   nothing. No category entry points, no lifestyle imagery, no social proof, no story.
2. **No size chart on any product page.** The block exists, points at a real page, and is
   switched off. Same for materials and shipping/returns.
3. **The footer has no links.** No policies, no navigation, no copyright. The `policy` menu
   is built and wired to nothing.
4. **Header promises 70% off with no path to it.** Nav has three items; the sale collection
   is reachable only by scrolling the homepage.
5. **7 of 20 collections are empty**, including two that are linked from the `shop-all` menu.
   Four are duplicate bikini pairs that should be merged or deleted.
6. **Two pages render a missing template** (`page.page.json`, `page.MaxBundle.json`) and two
   size-chart pages have empty bodies.
7. **Art direction is uncontrolled.** A 4080×2295 wallpaper crop and a 4000×6000 phone photo
   drive the hero; a HEIC file sits in the password collage; collection images exist for only
   3 of 20 collections.
8. **Two cart drawers and six app embeds** loading on every page.
9. **Nine orphaned page templates** (contact, lookbook, faq, press, events, brands, about,
   single-column) — built, never wired to a page. The lookbook grid is empty.

---

## 12. Reusable asset library

Images already on the CDN that the rebuild can pull from immediately.

| Asset | Size | URL |
|---|---|---|
| Logo (zipper) | 2078×267 | https://cdn.shopify.com/s/files/1/0563/9107/3950/files/MC_ZIPPERLOGO2_copy_4185a891-f6b6-440e-989c-e2edfa457c46.png?v=1714871975 |
| Mark / favicon | 1222×1148 | https://cdn.shopify.com/s/files/1/0563/9107/3950/files/CULPA0200202.png?v=1714871646 |
| 70% off banner | 4080×2295 | https://cdn.shopify.com/s/files/1/0563/9107/3950/files/Copy_of_Mea_Culpa_70_Off_Banner_970_x_1110_px_970_x_1110_px_Desktop_Wallpaper_5.png?v=1759495852 |
| Hero mobile | 4000×6000 | https://cdn.shopify.com/s/files/1/0563/9107/3950/files/IMG_5680.jpg?v=1759158193 |
| Lifestyle (wide) | 3598×2400 | https://cdn.shopify.com/s/files/1/0563/9107/3950/files/meaculpalifestyle-668_1.jpg?v=1730581791 |
| Lifestyle (tall) | 3600×4500 | https://cdn.shopify.com/s/files/1/0563/9107/3950/files/IMG_8367.png?v=1716573233 |
| Square banner A | 1179×1179 | https://cdn.shopify.com/s/files/1/0563/9107/3950/files/IMG_5532.jpg?v=1714872604 |
| Square banner B | 1179×1179 | https://cdn.shopify.com/s/files/1/0563/9107/3950/files/IMG_5535.jpg?v=1714872604 |
| Password hero | 1080×1080 | https://cdn.shopify.com/s/files/1/0563/9107/3950/files/MEAAAAA.png?v=1764810355 |
| Wide graphic | 2000×1110 | https://cdn.shopify.com/s/files/1/0563/9107/3950/files/Untitled-2.png?v=1729955813 |
| Collection: beanies | 1000×1000 | https://cdn.shopify.com/s/files/1/0563/9107/3950/collections/blackandwhiteoriginal.jpg?v=1715201211 |
| Collection: tops | 2184×2933 | https://cdn.shopify.com/s/files/1/0563/9107/3950/collections/embosstfinalpink.png?v=1715201181 |
| Collection: accessories | 3000×3000 | https://cdn.shopify.com/s/files/1/0563/9107/3950/collections/HEADBAND6.png?v=1715201157 |
| Collection: sucura | 3861×4826 | https://cdn.shopify.com/s/files/1/0563/9107/3950/collections/DSC09872.jpg?v=1747405987 |

Per-product media (167 products) is exported to `store-data/products/`, with a flat index at
`store-data/products/_index.json` giving handle, title, price, tags, collections and featured
image URL for each — that index is the list to pick from when filling section slots.
