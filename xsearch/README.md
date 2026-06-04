# XSEARCH — backend + connector structure

TikTok product-research agent. Pluggable data sources, server-side keys.

## Run it (works today, mock data)
```bash
cd xsearch
npm install
cp .env.example .env
npm run dev          # → http://localhost:3000
```
`POST /api/scan { "query": "home & kitchen" }` returns 20 ranked products.

## Architecture (the spine)
```
UI (public/)  →  POST /api/scan  →  pipeline.js
                                      1. TikTok source  (lib/sources/*)   ← pluggable
                                      2. sourcing enrich (cost/margin)     ← TODO
                                      3. Claude brain   (score/angle/flag) ← TODO
                                      4. rank → JSON
```

## The pluggable TikTok connection
`lib/sources/index.js` picks a source from `DATA_SOURCE` in `.env`. Every source
implements the same contract in `lib/sources/types.js`, so we can swap the data
provider without touching the UI or pipeline.

| DATA_SOURCE | What | Install / keys | Status |
|-------------|------|----------------|--------|
| `mock` | fake data, zero keys | none | ✅ works now |
| `unofficial` | drawrowfly/tiktok-scraper — trending/hashtag VIDEOS (free, fragile) | `npm i tiktok-scraper` | ✅ wired (test locally) |
| `apify` | Apify TikTok Shop actor — real products/price/sales (robust, paid) | `APIFY_TOKEN` + `APIFY_ACTOR` | ✅ wired (test locally) |
| `browser` | Playwright "eyes+fingers" on a BURNER account (fragile) | `npm i playwright` + login | 🟡 scaffold (DOM selectors TODO) |

> ⚠️ All real sources are unofficial/ToS-gray and must run on YOUR machine (this sandbox
> blocks live scraping). `unofficial` gives trending *videos* (the Claude brain infers the
> product); `apify` gives actual *products*. Use a burner account for `browser`.

## Switch source
```bash
# .env
DATA_SOURCE=unofficial      # then: npm i tiktok-scraper && npm run dev
# or
DATA_SOURCE=apify           # set APIFY_TOKEN + APIFY_ACTOR
```

## Build order
1. ✅ Backend + adapter contract + mock
2. ✅ Three real TikTok adapters wired (unofficial / apify / browser)
3. ⬜ Wire the existing XSEARCH UI into `public/` (fetch `/api/scan`)
4. ⬜ Sourcing adapter (CJ first) → real cost/margin
5. ⬜ Claude brain → X Score, winning angle, compliance flag
6. ⬜ Deploy + real Liquid Glass polish
