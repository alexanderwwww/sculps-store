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

| DATA_SOURCE | What | Status |
|-------------|------|--------|
| `mock` | fake data, zero keys | ✅ works now |
| `unofficial` | open-source TikTok scraper (free, fragile) | ⬜ to build |
| `apify` | scraper-as-a-service (robust, paid) | ⬜ to build |
| `kalodata` | TikTok Shop analytics API (paid) | ⬜ to build |

## Build order
1. ✅ Backend + adapter contract + mock (this commit)
2. ⬜ Wire the existing XSEARCH UI into `public/` (point its fetch at `/api/scan`)
3. ⬜ Implement ONE real TikTok source adapter (pick from table above)
4. ⬜ Sourcing adapter (CJ first) → real cost/margin
5. ⬜ Claude brain → X Score, winning angle, compliance flag
6. ⬜ Deploy + real Liquid Glass polish
