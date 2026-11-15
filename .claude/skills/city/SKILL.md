---
name: city
description: The City — Alex's private, walkable low-poly Greek-island town that is his live business dashboard (served by mob at /city). Use when the work touches the city, adding a building or business, the town map, statuses, the income ledger, news, workers, or "the dashboard you can walk around".
---
# The City (built 2026-11-15)
**What:** a 3D town (three.js, bundled, no CDN) inside the mob worker. One building per skill/engine in `gem/MAP.md`, grouped in districts. Click a building or walk to its door (auto-opens, E key too) for a panel with live numbers. Hero = a chunky low-poly Alex in a suit with long hair. Style = whatif v3 look (hand-painted crisp textures, golden hour) in our own Greek-island world; nothing from WoW is copied.
**URL:** https://mob.gardenbuddystore.workers.dev/city (needs the mob admin login; logged out = redirect to /login). Read-only: only SELECTs on stores/orders/carts/visits/payment_providers; the only writes are the two ledgers below.

## Files (tools/mob)
- `city/config.mjs` — THE one config: DISTRICTS, BUILDINGS, PLOTS, WORKERS, CALENDAR, SNOW_ZONES. Layout is generated from it (`layout()`).
- `city/world.js` terrain + painted ground + every building/prop generator; `gfx.js` merge helpers; `actors.js` people/critters; `fx.js` sky, sea, clouds, snow, smoke, halos, day/night; `main.js` controls, panels, HUD, minimap.
- `src/city.mjs` — page, `/city/data` (all panels, workers, board, totals), `/api/income`, `/api/news`. `src/city-bundle.mjs` is GENERATED.
- **Rebuild after any client change:** `cd tools/mob && node city/build.mjs` (esbuild; also bakes plan.md TODOs, the autotrader backtest summary and any `trader/*.json`). Then `npm test`, then deploy (below).

## Add a business / skill (one entry)
Add an object to `BUILDINGS` in `city/config.mjs`: `{ id, name, district, kind, skill, purpose, status, accent, trim, prop, next:[...], brain:"regex" }`.
- `status`: `open` (lit, running) | `construction` (scaffold + crane, "Opening soon") | `planned` | `closed` | `auto` (stores only: open if a paid order or >= 5 visits in 60 days, else `idle`). Manual always wins: flip any building by editing its one `status:` line.
- `kind`: `store` (needs `slug` = stores.slug, gets orders/carts/visits), `skill` (brain ideas only), or a custom kind handled in `cityData()` (`bank`, `clipping`, `trading`, `market`, `lab`, `news`, `miner`, `home`, `super`).
- `prop`: a rooftop landmark from `PROPS` in world.js (add a 3-line function for a new one; unknown = a flag). `pos:[x,z]` is optional: without it the building is placed on its district arc. New district = one line in `DISTRICTS`. Open plots = `PLOTS` ("For sale / coming" sign); delete a plot line when its building takes the spot.
- Workers: add to `WORKERS`; a cottage is generated. Their bubble text comes from `data.workers` (real data only; none = "no data"/resting). Task hook for later (NOT wired to any click, spends nothing): `POST /api/aquarius/say`.
- Calendar: add a line to `CALENDAR` (`from`/`to` as MM-DD in Europe/Athens, `decor`). Day/night follows the real Athens hour. Test any date/hour with `/city?date=2026-12-24&hour=17`.

## Data sources (nothing invented; missing = "no data yet")
- Stores: Neon `orders` (payment_status='paid'; revenue = total - refunded), `carts`, `visits` (sessions; `client_events` is diagnostics, not visits).
- Clipping: mob_posts counts + stats overview (views, est. earnings, channels). Brain: `mob_aquarius_brain` (ideas per building by `brain` regex; Idea Lab shows the best scrolls). Bank: `payment_providers` (mode live/test comes from the publishable key prefix only; keys are never selected), orders health, refunds, the ledger. Trading: paper only; backtest snapshot from tools/autotrader/data. Miner: "Waiting for the machine", no fake numbers.
- **Manual income ledger** `mob_income` (Depop, Grailed, payment links; never touches stores). `POST /api/income {business:<building id>, source, amount_cents, currency?, date?(YYYY-MM-DD), ext_ref?(unique, e.g. Stripe payment id), note?}` and `GET /api/income`; mob bearer token OR admin session. Shown tagged "manual" next to the "auto" order numbers on the building and in the HUD total. Correct a wrong date/entry by editing the row in Neon (`UPDATE mob_income ...`) — there is no delete route on purpose.
- **News** `mob_news`: `POST /api/news {headline, topic: stocks|crypto|memes|business|clipping|stores|other, url?, source?, published_at?}` (or `{items:[...]}`), same auth. News Hall shows the latest 20.

## Deploy / prove
`cd tools/mob && npm test` (80 tests incl. test/city.test.mjs) then `npx wrangler deploy -c ./wrangler.toml` (always -c). Rollback: `npx wrangler rollback -c ./wrangler.toml`. Local render check: serve the worker with a minted cookie (see scratchpad serve.mjs pattern: `makeSessionCookie`) and drive headless Chrome with `--use-angle=swiftshader`; `window.__city.stats()/mainCalls()` give frame time and draw calls.

## Lessons
- Canvas textures are flipY: terrain uv v = 1 - z; getting it wrong mirrored the snow zone and every path.
- `#include` in a ShaderMaterial must sit on its own line. Never use canvas textures for point sprites (computed in-shader instead).
- Software GL (swiftshader) runs ~25 fps whatever the scene: measure draw calls/triangles, not headless fps.
- Not done yet: ambient audio, footstep dust, real touch testing, sit/sleep animations beyond hiding workers at night.
