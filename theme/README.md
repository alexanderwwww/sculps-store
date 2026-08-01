# lockin — storefront theme

Source of truth for the **lockin** storefront on `epeztb-ps.myshopify.com`.

Everything here is deployed to the **unpublished** Shopify theme
`lockin — storefront (build)` (`gid://shopify/OnlineStoreTheme/195150217598`),
a duplicate of Horizon. The live/MAIN Horizon theme is untouched — publishing
is left to the store owner.

## Layout

```
layout/theme.liquid              Horizon's layout + one render of lockin-head
snippets/
  lockin-head.liquid             Type stack, palette, shared primitives, scroll-reveal
  lockin-wordmark.liquid         Lowercase wordmark with the ice-blue square tittle
sections/
  lockin-header.liquid           Sticky header, menu, cart (upgrades to Horizon's drawer)
  lockin-footer.liquid           Footer + FDA disclaimer
  lockin-hero.liquid             Homepage hero
  lockin-stat-band.liquid        Dark "50%" NAD+ band
  lockin-benefits.liquid         Repair / Energy / Calm cards
  lockin-split-feature.liquid    Why foils, not a bottle
  lockin-reviews.liquid          Review cards (placeholders, flagged)
  lockin-cta-band.liquid         Closing CTA
  lockin-product-buy.liquid      Sticky gallery, bundles, subscribe toggle, sticky ATC
  lockin-supplement-facts.liquid Supplement facts table
  lockin-how-to.liquid           How to take it
  lockin-faq.liquid              FAQ accordion
  lockin-nad-curve.liquid        Animated SVG NAD+ decline curve
  lockin-mechanism.liquid        Three-step mechanism
  lockin-doctor-quote.liquid     Expert quote + paid-partner disclosure (placeholder)
  lockin-evidence.liquid         Where the evidence stops
  header-group.json / footer-group.json
templates/
  index.json                     Homepage
  product.json                   Product page
  page.science.json              Science page (page handle: science)
```

## Design tokens

Palette, radii and the type stack live in `snippets/lockin-head.liquid` as CSS
custom properties — they are brand constants, so they are defined once rather
than duplicated across section schemas. All *copy* is section/block settings
and is editable in the theme editor.

| Token | Value |
| --- | --- |
| `--lk-paper` | `#FAFBFC` |
| `--lk-ice` | `#E6EDF2` |
| `--lk-ink` | `#0B0E11` |
| `--lk-muted` | `#6A7781` |
| `--lk-accent` | `#7FB1D4` |
| `--lk-r-sm` / `md` / `lg` | `16px` / `20px` / `26px` |

Headings and the wordmark are Fredoka 600; body is Hanken Grotesk. Both load
from Google Fonts in `lockin-head.liquid`. The wordmark uses a dotless i
(U+0131) so the brand's ice-blue rounded square can stand in for the tittle.

## Subscriptions — TODO

The store has no selling plans. `sellingPlanGroupCreate` is refused without a
subscriptions app holding the `write_purchase_options` scope, so the plan could
not be created from here.

The buy module therefore renders the subscribe/one-time toggle with the
subscribe option **disabled**, so no customer is shown a price that cannot be
honoured, and surfaces a TODO in the theme editor.

`lockin-product-buy.liquid` reads `product.selling_plan_groups` at render time.
Once a subscriptions app creates a "Subscribe & save" plan on the product, the
option enables itself, submits a real `selling_plan`, and prices from that
plan's allocation — no code change required. The `subscribe_discount` setting
is display-only and is used solely while no plan exists.

## Conventions

- Every section is self-contained: markup, `{% stylesheet %}`, its own script,
  and a `{% schema %}` with presets. Classes are namespaced `lk-*`.
- Mobile-first; breakpoints at 750px and 990px. Verified at 390px.
- All animation is gated behind `prefers-reduced-motion`.
- Custom radios and toggles are native `<input type="radio">` visually hidden
  behind styled labels, so keyboard and assistive-tech behaviour is the
  browser's rather than reimplemented.
- Review quotes and the expert quote ship as flagged placeholders. There are no
  star ratings and no review counts anywhere in the theme.
