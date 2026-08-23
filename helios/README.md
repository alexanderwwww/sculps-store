# HELIOS theme

## `templates/index.json` — the current homepage (Best Buy retail layout)

Single page, single product (Super Glide). No promo countdown, no other pages,
no second product. Built with the `helios-bb-*` sections.

Page order:

| # | Section | What it is |
|---|---|---|
| 1 | `helios-bb-utility` | black utility strip — shipping / returns / tracked. **Also declares the design tokens; keep it first.** |
| 2 | `helios-bb-header` | sticky header, wordmark + nav + blue CTA |
| 3 | `helios-bb-pdp` | product panel — gallery + thumb rail, sticky buy rail, price with Save callout, pack radios, blue Add to Cart, delivery panel, payment marks |
| 4 | `helios-bb-highlights` | "At a glance" icon cards |
| 5 | `helios-bb-gallery` | lifestyle row — swipe on mobile, 3-up on desktop |
| 6 | `helios-bb-specs` | dense two-column spec table in labelled groups |
| 7 | `helios-bb-compare` | Super Glide vs pool float vs kayak |
| 8 | `helios-bb-faq` | `<details>` accordion, works with JS off |
| 9 | `helios-bb-guarantee` | dark closing band + CTA |
| 10 | `helios-bb-footer` | policy links pulled from the store's real policies |
| 11 | `helios-bb-sticky` | sticky buy bar — mirrors the selected pack via the `helios:variant` event |

### Before this can take an order
The pack blocks in `helios-bb-pdp` have **empty `variant_id` fields**. Fill each
one with the real numeric variant ID from the product, or Add to Cart does
nothing. Everything else is wired.

### Palette
Best Buy-ish: blue `#0046BE`, yellow tag `#FFE000`, ink `#1D252C`, rule
`#C5CBD5`, soft `#F0F2F4`, savings green `#067D62`. Tokens live in
`helios-bb-utility`; every other section repeats a literal fallback in `var()`,
so removing the bar degrades the palette instead of breaking the layout.

### Preview
Open `preview/helios-preview.html`. Regenerate after editing any section:

```bash
cd tools && pip install python-liquid && python3 render.py
```

Images load from the old store's CDN and may not resolve.

---

## The previous build

The earlier live sections (`helios-bar`, `helios-buy`, `helios-nav`,
`helios-hero`, `helios-reviews`, `helios-badge`, …) are still in `sections/`
and unused. The old homepage and product template are in git history before
this commit. Kept for reference — the copy in them is still good.

Note the previous build's product template (`product.helios-super-glide.json`)
was removed from this page set; recover it from git history if you want it.

### What was stripped and must not come back
- "21.622 units sold" / "No.1 seller / merchant in America"
- rating "4.8" and "3,912 verified reviews", "★★★★★ Verified buyers"
- 8 invented named reviews
- the expired birthday countdown

None of it appears in the new build. Do not re-add any of it without real
orders behind it — it is what got the store flagged.

## Not included
Base theme files, `config/settings_data.json` (colors/fonts/logo), and the
product images — those live on the old store's CDN.
