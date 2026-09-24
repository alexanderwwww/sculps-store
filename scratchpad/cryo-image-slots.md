# cryo — which picture goes in which slot

The store is seeded and renders. The only picture it has is the one reference
render, squared to 1:1 on white and uploaded to R2:

```
/media/810221ec84fb1445.webp      (key 810221ec84fb1445.webp, 1402 × 1402)
```

Every other picture slot is **deliberately empty**. Nothing is repeated to fill
a hole. This list is so filling them later is mechanical: generate the panel,
upload it under its content hash the way `new-store-recipe.md` step 1 says, and
paste the `/media/<key>.webp` into the row named below.

All product pictures are **square 1:1** (platform rule 6c) and the bottle in
every one of them is **unbranded** — the Poland Spring bottle in the concept
render never reaches the store or an ad.

---

## 1. The gallery — `products.images`, the cryo product row

This is the buy-box carousel. It reads the **product's own images**, in order,
from the Products screen. Eight slots, in the master buy-box recipe's order.

| # | Slot | What goes in it | Status |
|---|---|---|---|
| 1 | Lead | Marketplace panel: machine cut out and huge, bottle inside the dome, callouts for the dome, the dial and the cartridge. No time, no temperature, no wattage. | **empty** |
| 2 | Clean studio | The machine on white, three-quarter, dome closed, bottle inside. | **has the reference render** — replace when the real studio shot lands |
| 3 | Box arriving | Phone/UGC: the box on a doorstep or a counter, being opened. | **empty** |
| 4 | Clean studio, second angle | Front-on, dial and LED ring readable, wordmark visible. | **empty** |
| 5 | Explanation panel | How it works in three frames: freeze the cartridge → bottle in, lid down → walk away. Words on the image. Still no time claim. | **empty** |
| 6 | Real life — office | The machine on a desk with no fridge in sight. | **empty** |
| 7 | Real life — dorm / RV | Small space, USB-C cable running to a laptop or a power bank. | **empty** |
| 8 | Real life — kitchen counter | Next to a kettle or a toaster, for scale. | **empty** |

Slot 2 is the only one filled today. The buy_box section also carries one
fallback block with the same render; the product images win when they exist, so
filling the table above is enough.

## 2. Sections with an empty image slot

| Section | Field | What goes in it | Status |
|---|---|---|---|
| Social proof images | blocks | Real customer photos only. Nothing else, ever. | **hidden** until a customer sends one |
| Video clips | blocks | Footage of a real sample. | **hidden** until the sample exists |
| Product grid ("What a cryo setup looks like") | section `image` | One panel showing the machine, the cartridges and the cable together. Setting this replaces the built layout entirely — it is the right home for a made panel. | **empty** |
| Three steps | block `image` ×3 | One square per step: freeze the cartridge / bottle in, lid down / walk away. | **empty** ×3 |
| Benefits | first block `image` | The section carries one photo on its first block. Machine on a counter, wide. | **empty** |
| Features | first block `image` | The section carries one photo on its first block. Detail shot: the dial and the LED ring. | **empty** |
| What's in the box | section `image` | Flat-lay of everything that arrives: machine, cartridge, cable, quick-start card, warranty card. | **empty** |
| Video with FAQ | section `still` | A vertical photo for the phone frame until there is a clip. | **empty** |

## 3. Chrome

| Thing | Where | Status |
|---|---|---|
| Logo / wordmark | `stores.logo_url` | **empty.** The theme falls back to the lowercase `cryo` wordmark set in type, which is correct for this brand. Drop a mark file in only if Alex wants one. |
| Favicon | `stores.favicon_url` | **empty** |
| Bundle tier thumbnails | `variants.image_url` ×2 | **empty.** One machine vs one machine + three cartridges, square, `contain`, so ONE and THREE read without the label being read. |

---

**No reviews, and no review images.** There are no customers. The Reviews
section is seeded hidden with zero rows and it turns itself on the day a real
buyer writes one.
