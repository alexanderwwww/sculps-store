# Inventory audit — what is actually sellable

Computed from `store-data/products/_index.json` (167 products) against
`store-data/collections/_index.json` (20 collections).

**Headline: the store has 47 placeable products, not 167.**

| Measure | Count |
|---|---:|
| Products in Shopify | 167 |
| ACTIVE | 60 |
| ARCHIVED | 100 |
| DRAFT | 7 |
| ACTIVE **and** carrying at least one image | **47** |

Everything the storefront can actually show is that 47. The other 120 are archived, draft,
or live with no artwork.

---

## Collection counts: claimed vs real

`shopify` is the product count Shopify reports (which includes archived and draft products).
`active` is ACTIVE only. `placeable` is ACTIVE with at least one image — the number that will
actually render in a grid.

| Handle | Shopify says | Active | Placeable |
|---|---:|---:|---:|
| `shop-all` | 166 | 60 | **47** |
| `beanies` | 90 | 13 | **13** |
| `70-off-sale` | 30 | 29 | **29** |
| `swim` | 21 | 12 | **12** |
| `fall-drop` | 20 | 19 | **12** |
| `new-arrivals` | 11 | 11 | **11** |
| `t-shirts` (tops) | 10 | 10 | **10** |
| `mar7th-drop` | 7 | 7 | **7** |
| `dresses` | 4 | 1 | **1** |
| `accessories` | 3 | 3 | **3** |
| `sets-1` | 3 | 3 | **3** |
| `socks` | 1 | 1 | **1** |
| `sets` | 1 | 1 | **1** |
| `mystery-boxes` | 0 | 0 | 0 |
| `sweatsuits` | 0 | 0 | 0 |
| `sucura-tops-bottoms` | 0 | 0 | 0 |
| `bikini-tops` | 0 | 0 | 0 |
| `bikini-bottoms` | 0 | 0 | 0 |
| `bikini-tops-2` | 0 | 0 | 0 |
| `bikini-bottoms-2` | 0 | 0 | 0 |

### The one that matters

**`beanies` claims 90 products and can render 13.** This is the single most misleading number
on the store. Every plan that treated Mea Culpa as "a beanie brand with 90 styles" was working
off an archive count. The live beanie range is 13 styles.

`dresses` is the same problem in miniature — 4 claimed, 1 live. A dresses category page renders
a single product.

`fall-drop` claims 20, has 19 active, but only 12 have images.

---

## What this changes

1. **Category tile labels were wrong.** They should read `BEANIES (13)` · `SWIM (12)` ·
   `TOPS (10)` — not 90 / 21 / 10. The three categories chosen were right; the counts were
   pulled from Shopify's archive-inclusive totals.
2. **Drop `dresses` from navigation.** One product is not a category. Fold it into `tops`
   or a combined `APPAREL`.
3. **`70-off-sale` is the largest live collection at 29 placeable products** — larger than
   beanies. The sale is not a promotion sitting on top of the catalogue; it currently *is* the
   catalogue. Worth deciding whether the relaunch keeps discounting 60% of live inventory or
   resets pricing.
4. **The 5-up grid still holds.** 47 products across five columns is nine full rows on
   `shop-all` — a real catalogue, not a placeholder. But `NEW IN` (11) and `SALE` (29) are the
   only two collections deep enough to fill the two homepage product rows at 10 each.
5. **Delete or fill 7 collections**: the four bikini duplicates, `sweatsuits`,
   `sucura-tops-bottoms`, `mystery-boxes`. None can render anything.

---

## 18 products live with no images

`featuredMedia: null` and empty media. Several are ACTIVE and in stock, so they are sellable
today and invisible in any grid:

`afro-glow-beanie` · `all-over-beanie` · `fun-day-beanie-cocoa-cheetah` ·
`fun-day-beanie-wild-panther` · `fur-heel` (Furmosa Mule) · `mar7thhat` · `mc-logo-ring` ·
`mea-airbrush-tank` · `mea-hearts-you-tank` · `mea-world-ring` · `mea-world-ring-copy` ·
`mini-fun-day-beanie` · `my-girl-tank` · `pins` · `star-camo-beanie` · `stop-copying-me` ·
`stop-copying-me-baby-tee-copy` · `untitled-jan1_11-49`

Shooting these is the cheapest inventory win available: it lifts placeable stock from 47 to
about 60 without producing a single new garment.

---

## 20 duplicate records

Handles beginning `copy-of-` — duplicated product records, mostly beanies and tees. Merge or
delete before launch; they inflate every count and will collide in search and recommendations.

---

## Data notes for anyone reading the index

- `price` comes from `priceRangeV2.minVariantPrice.amount` and is unpadded (`"45.5"`), while
  variant-level price is padded (`"45.50"`). Format on render.
- Many ARCHIVED products carry negative `totalInventory` (oversold counters, e.g. `-34`).
- Only ACTIVE products have a non-null `onlineStoreUrl` — a reliable ACTIVE filter on its own.
