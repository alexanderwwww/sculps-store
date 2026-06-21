# HELIOS Super Glide — Shopify (Horizon) landing page

Modular, conversion-optimized product page delivered as **drop-in Liquid sections**. Each block is its own section with a `{% schema %}` (settings + presets) so you can reorder, toggle, and A/B test everything in the Theme Editor.

> ⚠️ These are **Shopify Liquid** files — they render on Shopify's servers, not in a plain browser/preview. Install them in your theme to see them live.

---

## What's included

```
shopify/
├─ snippets/
│  └─ helios-base.liquid          ← fonts + CSS variables + keyframes + scroll-reveal (include ONCE)
├─ sections/
│  ├─ helios-announcement.liquid  ← liquid-glass announcement bar (SUPERGLIDEIT 12% off)
│  ├─ helios-buy-box.liquid       ← ★ PRODUCT-FIRST buy box: real {% form %}, Apple/Shop Pay, bundles
│  ├─ helios-video-banner.liquid  ← full-width demo/UGC video banner
│  ├─ helios-benefits.liquid      ← 3 icon benefit bullets
│  ├─ helios-comparison.liquid    ← HELIOS vs ordinary float table
│  ├─ helios-feature-map.liquid   ← annotated feature infographic + glow ring
│  ├─ helios-tiktok.liquid        ← 3 phones desktop / swipe carousel mobile, sound on hover/tap
│  ├─ helios-reviews.liquid       ← ★4.8 summary + star-distribution bars + 20 verified reviews (floating wall)
│  ├─ helios-guarantee.liquid     ← 30-day risk-reversal band
│  ├─ helios-faq.liquid           ← accordion (battery, charging, weight, shipping, warranty, pool/lake)
│  ├─ helios-sticky-atc.liquid    ← sticky add-to-cart on scroll (real form, syncs with buy box)
│  └─ helios-footer.liquid        ← footer
└─ templates/
   └─ product.helios-super-glide.json  ← assembles the page in the right order
```

---

## Install (5 steps)

1. **Upload sections** — In your Horizon theme: `⋯ → Edit code`. Under **Sections**, “Add a new section” for each `helios-*.liquid` (paste the file contents). Under **Snippets**, add `helios-base.liquid`.
2. **Include the base snippet once** — In `layout/theme.liquid`, just before `</head>`:
   ```liquid
   {% render 'helios-base' %}
   ```
   (Every section also has inline fallbacks, but this loads the fonts + shared reveal script once.)
3. **Add the template** — Under **Templates**, create `product.helios-super-glide.json` and paste `templates/product.helios-super-glide.json`. (Or just add the sections to any product template via the editor.)
4. **Assign the template** — Open the **Super Glide** product → **Theme template → helios-super-glide**.
5. **Wire variants** (below) and customize copy/media in **Customize → product page**.

---

## ⭐ Wire the bundle variants (required for correct add-to-cart)

The buy box adds **real variant IDs**. In the **HELIOS Buy Box** section, each **Bundle tier** block has a `Variant ID` field:

1. Shopify admin → **Products → Super Glide → Variants**. Create variants for each pack (1-pack, 2-pack, 3-pack, 4-pack) with their real prices + compare-at prices.
2. Click a variant — the number at the end of the URL (`…/variants/**1234567890**`) is the **Variant ID**.
3. Paste it into the matching tier block, set **Units in this bundle** (2, 3, 4…), label, badge, and pre-select.

Prices then render live from the variant (`{{ variant.price | money }}` / `compare_at_price`). The `fallback_price` fields are only used while a Variant ID is empty (so the demo still looks right).

> Tip: the **2-pack is pre-selected by default** ("Buy One Get One — Race a friend") for higher AOV.

---

## ✅ Apple Pay / Shop Pay / Google Pay

The buy box uses `{% form 'product', product %}` with `{{ form | payment_button }}` directly under Add to Cart — that's what renders the **dynamic express checkout** buttons. To see Apple Pay specifically:

- Enable **Settings → Payments → Shopify Payments** and **Apple Pay**.
- Apple Pay only shows in **Safari on a verified domain** (not in the theme preview iframe). Test on the live domain in Safari/iOS.

---

## A/B testing (all in the Theme Editor — no code)

Exposed as section settings so you can test:

- **Hero media:** video vs image (Buy Box → *Lead media*)
- **Headline / subtitle / CTA text**
- **Countdown** on/off + length (per-session, honest — resets each session, never fake-expires)
- **Social proof numbers** (viewers, sold today, stock left, toasts on/off)
- **Bundle pre-selection** (per tier `Pre-select`)
- **Price / compare-at** (live from variants, or fallback cents)
- **Star distribution** bars
- **Reorder / hide any section** by dragging in the editor

---

## Style lock

Fonts **Archivo** (700–900) headings / **Inter** body. Palette `--ink:#0C1A24 · --acc:#0E7CC4 · --acc2:#16A6D6 · --accd:#0A5E97`. Glassmorphism cards, icy-blue gradients, 16–24px radii, soft shadows. All defined in `helios-base.liquid` and duplicated as inline fallbacks per section so each section is self-contained.

## Mobile-first

Buy box above-the-fold on mobile shows media → title → ★rating → price → bundle selector → Add to Cart → Apple Pay/Shop Pay without scrolling. Videos: `autoplay muted loop playsinline`, lazy-loaded, poster fallback.

## Notes

- Replace the discount chip code with a **real active code** in the Buy Box settings (default `SUPERGLIDEIT`).
- The recent-purchase toasts use sample names; edit the `names` array in `helios-buy-box.liquid` if you want different cities.
- Reviews ship with your 20 verified reviews hardcoded in `helios-reviews.liquid` (edit the `r_*` arrays to change them).
