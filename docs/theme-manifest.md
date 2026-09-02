# ALEXANDER theme — file manifest

Source: Shopify store **Mea Culpa** (www.meaculpa.us)
Theme: `ALEXANDER` — `gid://shopify/OnlineStoreTheme/159112102046`, role UNPUBLISHED, prefix `/t/19`
Created 2026-09-02. Base theme: **Bullet** (Krown), with PageFly app sections layered in.

203 files, ~1.15 MB total.

| Directory   | Files | Notes |
|-------------|-------|-------|
| assets/     | 36    | Includes vendor libs (photoswipe, ranger, lazyframe, infiniscroll) and PageFly CSS |
| config/     | 2     | settings_data.json, settings_schema.json |
| layout/     | 4     | theme, password, gift_card, theme.pagefly |
| locales/    | 14    | en.default plus 13 translations |
| sections/   | 66    | `gs-*` = Bullet section library, `pf-*` = PageFly, `t-*` = templates |
| snippets/   | 66    | `global-*` shared partials, product partials, PageFly partials |
| templates/  | 43    | JSON templates incl. customers/ subtree |

## Theme stack observed

- Bullet theme section library (`gs-` prefix: hero, slideshow, collage, marquee, comparison, countdown, shopthelook)
- PageFly page builder (`pagefly-*`, `pf-1b74b8f9`, `layout/theme.pagefly.liquid`)
- GSC Countdown Timer app block (embedded in `templates/cart.json`)
- Air Reviews (`snippets/air-reviews-status.liquid`)
- Age verification and newsletter overlays
- Multi-currency / multi-language localization (`global-localization.liquid`, 14 locales)
