# The live store, as it actually renders

This is the source of truth for the Garden Buddy storefront. It is the real
markup and the real stylesheet taken from `gardenbuddy.store` while it was
still served by Shopify — not a description of it, not a screenshot of it.

- `sections/*.html` — the rendered HTML of every section on the product page,
  in page order, cut straight out of the live document.
- `gb.css` — the theme's own stylesheet. Every colour, font and spacing
  decision the store makes is in here, starting with the tokens on `.gb`.
- `media-map.json` — every image and video, mapping the original file to the
  R2 key it now lives under. Media is served from `/media/<hash>.<ext>`.
  **Never reference `cdn.shopify.com` or `gardenbuddy.store/cdn/`** — those
  paths stop working the moment the domain points at this Worker.

The rule is the same one written down for the admin: **transliterate, never
re-author.** The words, the class names, the nesting and the CSS are decisions
that are already made and already live. Copy them.
