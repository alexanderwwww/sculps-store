# HELIOS — Media Map (143 files: 99 images + 44 videos)

Where every asset lives on the site, so you can put it back in the same place.

> **To download them all:** run `python3 helios-download-media.py` on your own
> machine. It builds `HELIOS-MEDIA/` with these exact folders and zips it.
> (I couldn't run it from here — this session's network policy blocks
> `cdn.shopify.com`.)

---

## ⚠️ Grab these BEFORE you close the old store
Once the store is gone, these CDN URLs eventually die. The zip is your only
permanent copy. Do it today.

---

## 📁 01-superglide-product — 33 images
**Product:** HELIOS SuperGlide Pro 1+1 FREE · `helios-super-glide-motorized-water-lounger`

The first 8 are the **live product gallery, in display order**:

| # | File | Position |
|---|---|---|
| 1 | `01-joystick-closeup.avif` | **Featured image** — first thing on the product page |
| 2 | `02-floating-blue-water.png` | Gallery 2 — hero float shot |
| 3 | `03-ugc-image0.jpg` | Gallery 3 — customer photo |
| 4 | `04-dual-motor-joysticks.png` | Gallery 4 — feature detail |
| 5 | `05-ugc-image1.jpg` | Gallery 5 — customer photo |
| 6 | `06-person-relaxing-pool.png` | Gallery 6 — lifestyle |
| 7 | `07-hero-1.png` | Gallery 7 |
| 8 | `08-ugc-image3.jpg` | Gallery 8 |

**09–33** are the wider library used across `helios-sg-landing.liquid`,
`helios-store.liquid`, `helios-hero.liquid`, `helios-feature-map.liquid` and the
bundle builder. Notable ones:
- `10-headrest-cupholders.png` → feature-map section (comfort callout)
- `11-cruising-lake-handsfree.png` → hero / video-banner poster
- `12-side-profile.png` → comparison section
- `13-family-float.png` → family/lifestyle block
- `33-badge.png` → trust badge

## 📁 02-mini-glide — 6 images
**Product:** HELIOS mini Glide (currently DRAFT) · `helios-super-glide-copy`
Also feeds `helios-mini-feature.liquid` and the Mini variants on the main product.

## 📁 03-jetski — 8 images
**Product:** HELIOS-Floatie Jetski Pro · `helios-wave-rider`
- `01-jetski-hero-FREEGIFT.png` → **featured image**, AND reused as the
  "FREE GIFT — Floatie Jet Ski" product image, AND on the
  `page.jetski-oto.liquid` upsell page (RIDER50 offer)
- 02–05 → product gallery in order
- 06–08 → landing page extras

## 📁 04-sofa-pool — 9 images
**Product:** HELIOS Paradise Sofa Pool 12ft · `helios-paradise-sofa-pool-...`
Gallery order: `01-hero-girls-day` (featured) → `02-product-shot` →
`03-product-shot-2` → `04-styled-backyard` → `05-sofa-umbrella` →
`06-material-detail` → `07-snack-tray`
Also drives `helios-pool-landing.liquid` + `page.paradise-pool`.
`08/09-product-orig` are the un-cropped originals.

## 📁 05-party-island — 7 images
**Product:** HELIOS Tropical Breeze Party Island · 6-Person Floating Lounge
Gallery in exact order 01→07. `01-hero-6-people.jpg` is the featured image.
Drives `helios-island-landing.liquid` + `page.island`.

## 📁 06-pump-upsell — 1 image
**Product:** HELIOS Cordless Rapid Pump ($39.99)
Same image doubles as the "FREE GIFT — Cordless Rapid Pump" product.

## 📁 07-review-photos — 18 images
Used by `helios-reviews.liquid` and `helios-reviews-carousel.liquid`.

**Reviewer avatars** (6): brandon-h, tyler-p, nicole-a, matt-d, jessica-m, ryan-c
**UGC review photos** (12): inflated / delivery-box / side / setup / kid /
two-kids — each exists twice (original + `-b` duplicate at different sizes).

⚠️ These are the review images attached to on-site testimonials. If those reviews
weren't from real verified buyers, don't carry them to the new store — fake
reviews are exactly the kind of thing that draws buyer complaints, and buyer
complaints were one of the three reasons Shopify Payments was terminated.

## 📁 08-helios-fan-OTHER-PRODUCT — 17 images
**Different product line** — a HELIOS portable fan (matches the expired
`COLDFAN` discount code). Hero still, product cutouts, exploded view, macro,
NYC poster, 4 lifestyle shots, and a 6-frame 360° spin sequence
(`spin-1` … `spin-6`).
Not used by any current water product. Keep as archive, or reuse if you relaunch
the fan.

## 📁 09-videos — 44 videos
Downloaded at 720p HD where available (480p where that's the only source).

| Group | Count | Where used |
|---|---|---|
| `superglide-01…13` | 13 | Main product page video slots, `helios-video-banner.liquid`, `helios-tiktok.liquid` carousel |
| `miniglide-01…10` | 10 | Mini Glide product + `helios-mini-feature.liquid` |
| `jetski-01…03` | 3 | Jetski product page + the OTO upsell page |
| `ugc-01…07` | 7 | `helios-tiktok.liquid` social-proof carousel |
| `promo-01…04` | 4 | Promo/announcement placements |
| `sofapool-ugc`, `sofapool-coolers-demo` | 2 | Sofa Pool landing page |
| `fan-01…04` | 4 | The other fan product |

**Note on m3u8:** Shopify also stores `.m3u8` streaming versions. The script
skips those on purpose — they're playlists, not files. The `.mp4`s are what you
re-upload.

---

## Re-uploading to the new store

**You may not need to.** Two shortcuts:

1. **Product CSV import** pulls images straight from the old CDN URLs — as long
   as the old store still exists, images populate automatically.
2. **Theme zip** carries any images baked into theme settings.

The manual route (for anything that doesn't come across):
**Content → Files → Upload files** → drag a whole folder in → then re-link them
in the theme editor / product galleries using the positions above.

---

## Total to expect
- **99 images** — roughly 60–90 MB
- **44 videos** — roughly 300–600 MB at 720p
- **`HELIOS-MEDIA.zip`** — expect **400–700 MB**

If your connection is slow, run the script and leave it — it skips anything it
already downloaded, so you can stop and re-run it safely.
