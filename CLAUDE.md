# Working rules — HELIOS / sculps-store

## 💳 CREDIT SPENDING RULE (hard rule, never break)
Before ANY paid generation (Higgsfield generate_video / generate_image / generate_audio /
upscale / dubbing / etc.), I MUST:
1. State the estimated credit cost (and ~$ equivalent) for that specific generation.
2. STOP and wait for the user's explicit confirmation ("go" / "yes").
3. Only then run the generation.
No silent or assumed generations — the user confirms every spend, every time.

Economy defaults when generating: audio OFF (add VO/music/captions in ffmpeg for free),
720p for feed ads, AI-generate only what we can't shoot, lock avatar face with one cheap
image before video.

## 🏗️ HELIOS STORE — permanent memory (read before touching anything)

### Hard rules, learned the expensive way
0. **ROOT CAUSE of every buy-box collapse (found 23 Aug): the theme is a
   Horizon duplicate, and Horizon's global stylesheet styles generic class
   names — `.grid` gets flex-wrap/gap utilities, so 50%+50%+leaked-gap
   overflowed the line and the panel wrapped under the carousel on the store
   while the local render (no Horizon CSS) looked perfect. RULE: every class
   and id in every custom section MUST be prefixed (hbb-, hft-, …). Never use
   .grid, .wrap, .main, .price or any generic name. The buy box now lives in
   sections/helios-buybox.liquid (type helios-buybox); helios-buy is deleted
   from the repo and left unused on the theme (API cannot delete theme files).**
1. **NEVER let the product image take the full row. The bundles live on the
   RIGHT, beside the image, on desktop — always.** helios-buybox.liquid: image
   61.8% / bundles 38.2% (phi), INLINE on `.hbb-left`/`.hbb-right`, image is
   `position:sticky;top:70px` so it scrolls with the long bundle panel.
   Tiers: phi ≥900px · 50/50 at 700–899 (`!important` overrides the inline phi)
   · stacked ≤699. Keep the stack tier ≤699px — the editor preview iframe is
   narrow. NO `fr` tracks, NO grow-factor ratios for columns. Settled law.
2. **Never guess — count and verify.** Before "fixing" a layout, inspect the
   actual DOM/markup (count `.grid` children, read the real CSS). After every
   theme upload, query the file back and compare byte size to the local file.
   `themeFilesUpsert` with `body.type=URL` **fails silently** (empty
   `upsertedThemeFiles`, no error) — the byte-size check is the only truth.
3. **Shopify schema traps:** `"default": ""` is rejected ("default can't be
   blank" — omit the key instead); `{% case x | filter %}` is invalid (assign
   first); `range` defaults must land on a step; `"tag": null` invalid (use a
   string). Validate every schema as JSON before upload.
4. **Render before deploy:** `python3 helios/tools/render.py` must print
   "All sections rendered with no Liquid errors."
5. **Commit + push every change** to `claude/admiring-allen-VD2Zb` — container
   is ephemeral; the repo is the only durable copy. Repo raw URLs feed the
   URL-upload path.
6. Free US-only shipping. USD everywhere. No fake reviews/engagement generated
   in Liquid. Don't write "21,622" into any section (image is allowed as-is).

### The store (helios wins — 1ittfz-ys.myshopify.com)
- Theme: `gid://shopify/OnlineStoreTheme/193327595786` "HELIOS Best Buy build" (UNPUBLISHED — user must publish; API blocked)
- Product: `gid://shopify/Product/10598161154314` ACTIVE, published to Online Store + Shop,
  handle `helios-super-glide-motorized-water-lounger`, inventory untracked
- Variant IDs: 1-pack `53550115815690` $259.99 · 2-pack `53550115848458` $259.99 (1+1 FREE, default)
  · 3-pack `53550115946762` $349.99 · 4-pack `53550115881226` $459.99
- Shipping: one US zone (all states), $0.00 USD "Free shipping", ships to US only
- Discount: `HELIOS10` = 10% off, once per customer (`DiscountCodeNode/1621974778122`)
- Pages: track `164524359946` · contact `164523213066` · refund-policy `164524392714`
  · shipping-policy `164524425482` · terms-of-service `164524458250`
- Homepage = 14 sections in order: bar, nav, buy, reviewcarousel, box, gallery,
  clearfaq, tiktok, reviews, howitworks, guarantee, badge, footer, sticky
- Track page: bar, nav, map (`helios-bb-usmap` — US states SVG, Albers, merchant-
  entered shipment blocks; demo numbers HELIOS104778251/336920418/289471132/775013964/512846077 = stages 1-5)
- Design tokens live in `helios-bar.liquid` (`--phi`, `--fs-*`, `--sp-*` Fibonacci,
  `--r-*`); every use carries a literal fallback.
- PALETTE (the user's original identity — do NOT blue-wash it again): ink #0F1111
  for the bundle frame header, selection borders, radios, dots; Amazon yellow
  #FFD814/#FCD200 for Add to Cart / nav / guarantee CTAs; #FFC531 for the frame's
  accent text; neon-green #39FF14 tag pill ("1+1 FREE") pinned to the card's RIGHT side,
  green glow, dark text (user killed the yellow pill and afterpay 23 Aug —
  installments row shows Shop Pay only);
  red #CC0C39 for savings; teal #007185 for the ratings link. Blue #0046BE stays
  only on the helios-bb-* tracking page.
- Footer: ink #0F1111, trust strip, menu columns, real customer signup form,
  yellow CTA — the animated navy "deep-navy edition" was rebuilt away 23 Aug.
- Old-CDN risk: badge images, FAQ video, carousel review photos point at the dead
  helios-wins CDN (`/1/0808/6949/0929/` and `/1/0769/8320/6053/`) — if broken, user
  re-uploads to Files and we repoint.

### Launch blockers only the user can do in admin
1. Publish the theme (Themes → HELIOS Best Buy build → Publish)
2. Disable storefront password (Preferences)
3. Paste policies into Settings → Policies (checkout only reads those)
4. Set primary market to United States (currently Greece)
