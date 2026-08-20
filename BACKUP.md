# SCULPS / XERO store — full theme backup & restore guide

This repo is a **complete snapshot of the Shopify theme** for the XERO Chiron
one-page store. Every theme file (Liquid, JS, CSS, JSON) plus the binary image
assets are committed here, so the whole storefront can be rebuilt from scratch
at any time.

## Store & theme identity

| | |
|---|---|
| Shop | **XERO** — `hsjwij-bw.myshopify.com` |
| Plan | Basic · USD · timezone EEST |
| Theme (this backup) | `xero-chiron-one-page-store` — **UNPUBLISHED** (dev/staging) |
| Theme id | `gid://shopify/OnlineStoreTheme/197031330176` |
| Published theme | `Horizon` (Store theme 2481) — **not** this one |

> All edits in this project target the **unpublished** `xero-chiron-one-page-store`
> theme. The live/MAIN theme (Horizon) is intentionally never written to.

## What's in here

```
assets/      xero-*.css / xero-*.js  (the code)  + *.webp brand images + xero-skin*.jpg
config/      settings_data.json, settings_schema.json
layout/      theme.liquid            (loads 3D stack + XERO_MODEL_URL / XERO_TEXTURE_URL)
locales/     en.default*.json
sections/    xero-*.liquid           (hero, ugc, popup, compare, reviews, …)
snippets/    xero-*.liquid
templates/   index.json (the one-page composition) + product/page/customer templates
```

## How to restore the theme

**Option A — Shopify CLI (easiest):**
```bash
shopify theme push --theme <theme-id-or-new> --path .
# or push to a brand-new unpublished theme:
shopify theme push --unpublished --path .
```

**Option B — Admin GraphQL (`themeFilesUpsert`)**, one file at a time, body type
`TEXT` for code and `BASE64` for the `.webp`/`.jpg` binaries. Theme file writes are
only allowed on **unpublished** themes.

## External assets the theme references but does NOT contain

These live on the Shopify CDN / Files, not in theme files. Keep these URLs — if the
theme is rebuilt they must still resolve (re-upload to Files if ever purged):

| Purpose | URL |
|---|---|
| **3D bike model (GLB)** | `https://cdn.shopify.com/3d/models/o/ffa775409b18ef79/XERO_Chiron.glb` |
| **Active skin map** (emissive) | `https://cdn.shopify.com/s/files/1/1011/2742/2336/files/xero-skin-final.jpg?v=1787239994` |
| Earlier skin map | `.../files/xero-skin.jpg?v=1787225202` |
| KeyBox GLB (box section) | `https://cdn.shopify.com/3d/models/o/7dc0b18e2cac5e5e/XERO_KeyBox.glb` |
| Hero film (film1) | `shopify://files/videos/hf_20260816_054520_6d66faaa-3a63-4cd9-8282-a6ecbc8de5a2.mp4` |
| Section/popup/UGC photos | many `shopify://shop_images/…` refs inside `templates/index.json` |

The `xero-skin-final.jpg` and `xero-skin.jpg` are also committed under `assets/` as
local copies of the skin maps.

## Architecture notes (memory refresh)

**The 3D product viewer** is three cooperating files, loaded in this order from
`layout/theme.liquid`:
1. `assets/xero-stage.js` — the `<xero-stage>` web component. Static world backdrops
   (studio/city/mars × day/night) + a bike. Lazily builds a WebGL renderer only when a
   GLB mounts. Exposes `window.XeroStage`.
2. `assets/xero-store.js` — cart/state/UI. Sets the `--seg-view/-mode/-world` CSS vars
   that drive the pills; dispatches the `data-act` button actions.
3. `assets/xero-model.js` — **patches** the stage: loads the GLB, normalises/scales it,
   guards the WebGL context, rebinds the edited skin onto `emissiveMap`
   (`window.XERO_TEXTURE_URL`), and runs the orbit + autorotate.
   - Orbit is **horizontal 360 only** (`PITCH_MIN = PITCH_MAX = PITCH_HOME = 1.38`) — no
     tilt, so the top/underside never show.
   - Autorotate is on by default and pauses on grab; the round `toggleSpin` button
     resumes it.
   - `XERO_TEXTURE_URL = ""` → show the GLB's own baked map; a URL → rebind that image
     onto emissive. The GLB's colour atlas is (mis-)tagged as EMISSIVE by the exporter,
     which is why the bike self-illuminates.

**The segmented control pills** (`assets/xero-pill.css`): three pills — View (3D/Photos),
Day/Night, World (Studio/City/Mars). store.js only sets `--seg-*` vars and never marks the
active button, so the sliding frosted knob is the only selection indicator; labels are one
white colour that reads over knob and track. Fixed sizes: 30px desktop / 20px mobile.
`min-height:0` overrides theme.css's mobile `min-height:44px` (which used to push labels
below the bar). Geometry: knob width `calc(50% - 3px)` (n=2) / `calc(33.3333% - 2px)` (n=3),
padding 3px both breakpoints — do not restate widths elsewhere.

**`assets/xero-fix.css`** holds POSITION/override-only rules (FIX 1–9): un-clips fixed
sections, Photos = pure white room (the 3D `<xero-stage>` is hidden in Photos so no night
backdrop shows), mobile stacking, buy box on the golden section, full-bleed photos on
mobile. The autorotate `toggleSpin` button is deliberately NOT hidden here.

**`sections/xero-popup.liquid`** — the $139/month session popup. Auto-closes after
`auto_close_ms` (default 3000). Once per session (sessionStorage key carries `version`).

**`templates/index.json`** composes the one page: popup, hero, gallery, compare,
iphone-key, antitheft, box, astra, breakdown, film2, vibes, network, ugc-faq, **ugc**
(the "From the camera roll" carousel — 6 owner photos in blocks s1–s6), reviews, film1,
track, footer, product-data.
