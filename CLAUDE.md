# WORKING RULES FOR THIS STORE — READ FIRST, EVERY TIME

The owner has rebuilt sections and re-placed images MANY times. Breaking that is the
one unforgivable thing here. Two hard rules, no exceptions:

## 1. NEVER touch the owner's content
- **Do NOT edit `templates/index.json`.** It holds the section order and every image the
  owner placed. The Shopify theme editor also writes this file, so pushing it from a
  snapshot silently reverts their work. Leave it alone unless the owner explicitly says
  "change the sections/images" in this session.
- **Do NOT edit any `sections/*.liquid`** unless explicitly asked.
- Every section and every picture stays exactly where the owner placed it.
- Safe to edit for styling/behaviour work: `assets/*.css` and `assets/*.js` (and only the
  specific ones a task needs). These cannot move sections or delete images.

## 2. NEVER guess. Diagnose with evidence, then fix.
- Do not push a change "hoping" it fixes something. Find the actual cause in the code or
  by testing (e.g. headless Chromium / Playwright, reading the exact file), then change
  the minimum needed.
- If the cause genuinely can't be determined without seeing the live site, ask for the
  storefront password or a theme preview link rather than guessing.

## Store facts
- Theme worked on: `xero-chiron-one-page-store` — UNPUBLISHED dev theme,
  id `gid://shopify/OnlineStoreTheme/197031330176`, shop `hsjwij-bw.myshopify.com`.
  (Published/live theme is `Horizon` — do not write to it; API blocks live-theme writes.)
- Full theme backup + architecture notes: see `BACKUP.md`.

## Known state / decisions
- 3D viewer: horizontal-360 orbit only (pitch locked), autorotate on, edited skin at
  `window.XERO_TEXTURE_URL` in `layout/theme.liquid`.
- The 2D bike **sprite is deleted** (owner's decision) — only the 3D model shows.
- Mobile: owner chose to KEEP the 3D on mobile and optimize its loading (not a photo
  fallback). The heavy part is a 5.8 MB GLB + three.js from a CDN.
