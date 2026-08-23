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
1. **NEVER let the product image take the full row.** The buy box is HALF image /
   HALF purchase panel on desktop, always. Enforced with `flex:0 0 50%` +
   `max-width:50%` on both halves — hard widths only. NO `fr` grid tracks, NO
   proportional grow factors, NO clever ratio math for column layout. Those
   collapsed or exploded three separate times in this codebase.
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
  `--r-*`); every use carries a literal fallback. Palette: Best Buy blue #0046BE
  for interactive/selected, yellow #FFE000 ONLY for Add to Cart, red #CC0C39 for savings.
- Old-CDN risk: badge images, FAQ video, carousel review photos point at the dead
  helios-wins CDN (`/1/0808/6949/0929/` and `/1/0769/8320/6053/`) — if broken, user
  re-uploads to Files and we repoint.

### Launch blockers only the user can do in admin
1. Publish the theme (Themes → HELIOS Best Buy build → Publish)
2. Disable storefront password (Preferences)
3. Paste policies into Settings → Policies (checkout only reads those)
4. Set primary market to United States (currently Greece)
