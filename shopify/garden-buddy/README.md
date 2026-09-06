# GARDEN BUDDY — theme source

Live store `aj1wt0-dg.myshopify.com`. Theme **GARDEN BUDDY** id `206497710419`, a Horizon copy, unpublished.

**To rebuild the whole store from nothing, read [REBUILD.md](REBUILD.md).**
**For store data — products, prices, media, specs — read [store/store.json](store/store.json).**

## What is here
- `assets/gb.css` — the design tokens. The palette is signed off; do not drift from it.
- `sections/` — one Liquid section per band of the page, plus header, footer and their groups.
- `templates/` — the JSON templates that arrange those sections.
- `config/settings_data.json` — Horizon's own colour and type settings, matched to the palette.
- `store/` — a snapshot of the store data and the page bodies.
- `media/` — the three explainer GIFs.
- `ref/` — competitor reference shots used to generate the product photography.

## Upload
Commit and push, then `themeFilesUpsert` with a `URL` body pointing at the raw file on that commit.

**Verify every write.** `themeFilesUpsert` returns success even when it writes nothing. Re-query the
file and check `updatedAt` moved, not just that a size came back. REBUILD.md lists the traps.

## Non-negotiable
- No fabricated reviews, ratings or counts. The shop has zero orders; the review and social
  sections ship empty with an honest empty state.
- No invented spec numbers. Confirmed figures live in `store/store.json`; unconfirmed ones stay off the page.
- Compare-at prices are arithmetic from real list prices.
