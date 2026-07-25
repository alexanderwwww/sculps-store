# HELIOS — Full Store Rebuild Package
Extracted from `gmidgd-uz.myshopify.com` (helios-store.us) — everything needed to
stand the store up again on a fresh Shopify account.

---

## ⚡ FASTEST PATH — do this first (10 minutes, not 10 hours)

Shopify can move the theme and products for you. Don't rebuild by hand.

### 1. Theme — export the zip
**Old store:** Online Store → Themes → find **"HELIOS WINS"** → `⋯` → **Download theme file**
Shopify emails you a `.zip` of the ENTIRE theme — every custom section, every setting.

**New store:** Online Store → Themes → **Add theme** → **Upload zip file** → pick that zip → Publish.

That carries all 30 custom HELIOS sections, the settings, the templates, the colours,
the fonts — a perfect 1:1 copy. Nothing to rebuild.

### 2. Products — export the CSV
**Old store:** Products → **Export** → *All products* → CSV for Excel/Numbers
**New store:** Products → **Import** → upload that CSV

Carries titles, descriptions, variants, prices, compare-at prices, SKUs, tags, and
image URLs (images re-download automatically from the old CDN).

### 3. Everything else — from this document
Pages, menus, shipping zones, and discount codes have to be recreated by hand.
They're all listed below.

---

## 1 · STORE IDENTITY

| Field | Value |
|---|---|
| Store name | **HELIOS** |
| Domain | helios-store.us |
| Currency | **USD** |
| Admin email | getpatchdusa@gmail.com |
| Business address | Ρήγα Φεραίου 59, Thessaloniki, 564 31, Greece |
| Theme | **Horizon** (Shopify free theme) + HELIOS customisations |

⚠️ The customer-account menu still points at `account.pressdcare.com` — leftover from
another brand. Fix that on the new store.

---

## 2 · PRODUCTS + PRICING

### ⭐ HELIOS SuperGlide Pro 1+1 FREE — *the money maker*
`handle: helios-super-glide-motorized-water-lounger` · ACTIVE · Motorized Pool Float
Tags: helios, lounger, motorized, pool, summer, water

| Variant | Price | Compare-at | SKU |
|---|---|---|---|
| 1 Super Glide | $259.99 | $399.98 | 100000 |
| 2 Super Glides | $259.99 | $399.98 | 10000 |
| 3 Super Glides | $349.99 | $599.97 | — |
| 4 Super Glides | $459.99 | $799.96 | 10000 |
| Mini Glide (single seat) | $129.00 | $199.00 | — |
| 2 Mini Glides | $199.00 | $398.00 | — |

**Description HTML:**
```html
<p><strong>Stop paddling. Start gliding.</strong> The HELIOS Super Glide is a dual-motor motorized water lounger — lie back, grab the twin joysticks, and cruise the pool, lake, or river without lifting a finger.</p>
<ul>
<li><strong>⚡ Dual electric thrusters</strong> — twin motors with joystick steering for full 360° control</li>
<li><strong>🔋 Rechargeable</strong> — up to ~60 min of continuous cruising per charge</li>
<li><strong>🛋️ Built for comfort</strong> — padded headrest, ergonomic backrest, and dual cup holders</li>
<li><strong>💪 Heavy-duty PVC</strong> — holds up to 250–300 lb, built for adults</li>
<li><strong>🏖️ Pool · lake · river · party</strong> — the float that turns heads everywhere</li>
</ul>
<p><strong>Canopy edition</strong> adds a clip-on sun shade so you stay cool while you cruise.</p>
<p>🛡️ 30-Day Money-Back Guarantee · 🚚 Free Shipping · 🔒 Secure Checkout</p>
```

**Images:**
```
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/S422daeaa8a1f4d90b13ccc8979923d65e_jpg_960x960q75_jpg.avif?v=1782437342
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/3a816736-4b57-464c-9f16-4e8c196bc71b.png?v=1782835882
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/image0_1.jpg?v=1783204946
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/296a5f2a-c3b3-4a72-9d9b-ba15a5292497.png?v=1782073106
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/image1.jpg?v=1783204946
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/05c1f105-d779-40af-b7e7-b8fe9c9ab11c.png?v=1782073104
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/1.png?v=1782882243
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/image3_d6e90ee2-7b19-4ad2-8285-52ac2d416659.jpg?v=1783205127
```

---

### HELIOS-Floatie Jetski Pro
`handle: helios-wave-rider` · ACTIVE · Inflatable Jet Ski

| Variant | Price |
|---|---|
| 1 Jet Ski | $349.99 |
| 2 Jet Skis | $559.99 |
| 3 Jet Skis | $789.99 |

> Experience the thrill of high-speed water adventures with the HELIOS-Floatie Jetski Pro. This motorized inflatable jet ski delivers powerful performance in a lightweight. Built for durability and easy setup,

**Images:**
```
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/a7b05a36-528c-44ca-8a1a-7a9add23058b.png?v=1782714655
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/47dc11ca-3353-4ed4-8275-40acf8fa5523.png?v=1782714656
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/cd2aeedb-4378-48c1-bcab-5b7a5aa6b319.png?v=1782715284
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/bf3d9cd7-1cd6-43a1-b5ec-aca96cc17d42.png?v=1782715284
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/1f5c6e20-e5ac-4087-9a79-afe9d999db05.png?v=1782715856
```

---

### HELIOS Paradise Sofa Pool — 12ft Inflatable Lounge Pool
`handle: helios-paradise-sofa-pool-12ft-inflatable-lounge-pool` · ACTIVE

| Variant | Price | Compare-at |
|---|---|---|
| 1 Sofa Pool | $340.90 | $449.99 |
| 2 Sofa Pools | $602.26 | $899.98 |

> The viral sofa pool — over 12 feet of couch-style lounging IN the water. Built-in backrest seating for the whole crew, 6 cupholders, 2 cooler compartments to keep drinks ice-cold, and a drain plug for easy pack-up.
> - Over 12 ft long — fits 2–3 adults plus kids
> - Couch-style inflatable seating with backrests
> - 6 built-in cupholders + 2 cooler/storage compartments
> - Heavy-duty PVC · drain plug · repair patch included
> - Sold out at big-box retail — get it here

**Images:**
```
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/paradise-sofa-pool.jpg?v=1783802762
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/ed49f19c-8cc6-4990-b5be-3ba5145c75db_885dfa1f-91a9-4cc9-a704-93168f84a9e4.png?v=1783804303
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/a8e1ad39-6db1-4b9f-8f8c-5e473dcc7ade_85761380-2f47-4119-a22e-fc05423de543.png?v=1783804303
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/pool-styled-wide.jpg?v=1783804302
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/pool-umbrella-shells.jpg?v=1783804303
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/pool-detail-hand.jpg?v=1783804302
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/pool-snack-tray.jpg?v=1783804303
```

---

### HELIOS Tropical Breeze Party Island — 6-Person Floating Lounge
`handle: helios-tropical-breeze-party-island-6-person-floating-lounge` · ACTIVE
**$318.17** (compare-at $399.99)

> The floating island for the whole crew — six seats, a sun canopy, a built-in cooler bag and six cupholders, drifting on open water. This is the one everyone swims to.
> - Seats 6 adults — backrest lounging + open deck
> - Removable sun canopy for shade on demand
> - Built-in cooler compartment + 6 cupholders
> - Heavy-duty PVC hull with grab rope all around
> - Swim-through center + boarding platform
> - Anchor connection point so the party stays put

**Images:**
```
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/island-hero.jpg?v=1783930294
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/island-2.jpg?v=1783930294
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/island-3.jpg?v=1783930294
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/island-4.jpg?v=1783930294
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/island-5.jpg?v=1783930294
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/island-6.jpg?v=1783930294
https://cdn.shopify.com/s/files/1/0769/8320/6053/files/island-7.jpg?v=1783930294
```

---

### HELIOS Cordless Rapid Pump — upsell
`handle: helios-cordless-rapid-pump` · **$39.99** (compare-at $59.99)

> Rechargeable cordless air pump — inflates your Super Glide in about 5 minutes, no outlet needed. Deflates too, so pack-up is just as fast. Charges via USB-C.
> - Cordless & rechargeable — works at the lake, pool or beach
> - Inflate *and* deflate modes
> - Multiple nozzles included — fits the Super Glide and Jet Ski

Image: `https://cdn.shopify.com/s/files/1/0769/8320/6053/files/107f7b2d-9d3a-4d8f-bcfe-b0bfa133a1b8.png?v=1783791768`

---

### Free-gift products ($0.00, auto-added on 3+ orders)
- **FREE GIFT — Floatie Jet Ski** `free-gift-floatie-jet-ski`
- **FREE GIFT — Cordless Rapid Pump** `free-gift-cordless-rapid-pump`

> Free gift — included automatically with any 3+ Super Glide order. Not sold separately; orders of this item without a qualifying 3+ glider purchase are cancelled.

### Other
- **HELIOS mini Glide** `helios-super-glide-copy` — DRAFT. Mini $129.99/$229 · 2 Mini $169.99/$458 · 3 Mini $216.99/$687 · 1 Super Glide $149.99/$399.98
- **HELIOS Next-Day Delivery** `helios-priority-shipping` — ARCHIVED. $49.99, 1–2 day priority

---

## 3 · THEME — the custom files

Base theme is **Horizon** (free from the Shopify Theme Store). Install that first,
then the zip upload restores these customisations:

**Custom sections (30):**
```
helios-announcement       helios-hero              helios-reviews
helios-benefits           helios-howitworks        helios-reviews-carousel
helios-bundle-builder     helios-island-landing    helios-sg-landing      (67 KB)
helios-buy-box   (40 KB)  helios-mini-feature      helios-sg-landing-de   (59 KB)
helios-clear-faq          helios-pool-landing (43KB) helios-speed
helios-comparison         helios-promo-toast       helios-sticky-atc
helios-cyob               helios-redirect          helios-store          (120 KB)
helios-family             helios-feature-map       helios-tiktok
helios-faq                helios-footer            helios-video-banner
helios-guarantee          helios-header
```

**Custom snippets:** `helios-base.liquid`, `helios-polish.liquid` (19 KB)
**Custom layout:** `layout/helios.liquid`
**AI-generated blocks (12):** `blocks/ai_gen_block_*.liquid`

**Custom templates:**
```
templates/index.json                       templates/page.jetski-oto.liquid
templates/product.helios-super-glide.json  templates/page.super-glide.json
templates/product.helios.liquid            templates/page.super-glide-de.json
templates/product.waverider.json           templates/page.island.json
templates/product.minicruiser.json         templates/page.paradise-pool.json
templates/page.helios2.liquid
```

⚠️ There are also 16 `pressd-*` sections in the theme from an unrelated brand.
Delete those on the new store — dead weight.

---

## 4 · PAGES to recreate

| Page | Handle | Template |
|---|---|---|
| Contact | contact | contact |
| Shipping Policy | shipping-policy | — |
| Returns & Refunds | refund-policy | page |
| Privacy Policy | privacy-policy | — |
| Terms of Service | terms-of-service | page |
| Your Privacy Choices | data-sharing-opt-out | — |
| HELIOS | helios | helios2 |
| Jet Ski Rider's Offer | jetski-oto | jetski-oto |
| Super Glide — Summer, Again | super-glide-summer | super-glide |
| Super Glide Sommer | super-glide-sommer | super-glide-de |
| Paradise Sofa Pool | paradise-pool | paradise-pool |

## 5 · NAVIGATION

**Main menu:** Reviews → `/#reviews` · Contact → `/pages/contact`

**Footer menu:** Shipping Policy · Returns & Refunds · Privacy Policy ·
Terms of Service · Contact · Your Privacy Choices

---

## 6 · SHIPPING ZONES

| Zone | Countries | Rate |
|---|---|---|
| **United States** | US | **Free Shipping** — "Free shipping on all orders" |
| **Europe** | 27 EU countries | **FREE Shipping — insured (7–12 days)** |
| **International** | Rest of World | **Free International Shipping** |

🔴 **THE FIX:** the US rate had **no delivery estimate on it** — Europe said "7–12 days"
but US customers were told nothing. That's a direct cause of the 10.34% chargeback rate.
On the new store name it: **"Free Shipping — 8–15 business days, tracked."**

---

## 7 · DISCOUNT CODES

**Active:** `4OFJULY` · `RIDER50` (Jet Ski OTO 50%) · `MIXBUNDLE50` (Build Your Own Bundle 50%) ·
`MIX30` · `MIX50` · `WELCOME15` (email signup) · `COMEBACK20` (abandoned checkout $20 off)

**Personal 50% codes:** `SMITHFAMILY` · `AARON50` · `MICHAEL50` · `DEBORAH50` · `BARB50`

**Expired:** `99` · `COLDFAN` · `SUPERGLIDEIT`

---

## 8 · APPS installed on the old store
Judge.me Reviews · wetracked.io · 17TRACK · Aftersell · Upcart Cart Drawer ·
Messaging · Klarna On-Site Messaging · SPD Split Payment

---

## 9 · NON-NEGOTIABLE FIXES for the new store

The store didn't fail. **Fulfilment did** — 10.34% chargeback rate, limit is 1%.

1. **Tracking number on every order**, synced into Shopify. Without it you auto-lose
   every dispute. 17TRACK is already in your app list — wire it properly this time.
2. **Real delivery time on the product page**, under the Add to Cart button:
   `📦 Ships in 1–3 days · Delivery 8–15 business days · Tracking on every order`
3. **Support replies within 24h.** Most chargebacks are people nobody answered.
4. **Refund fast when it's late** — a refund costs the same as a chargeback minus the
   fee, the rate damage, and eventually your payment processor.
5. **Two payment rails from day one** — Shopify Payments *and* PayPal/Mollie.
   Never be single-rail again.
