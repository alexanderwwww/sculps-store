# Subagent prompts for Layer 2 (spawn both in parallel, general-purpose)

Subagents can WebSearch (server-side, not egress-blocked). Fill `{PRODUCTS}`
with the candidate list. Both must cite source URLs and mark unverifiable
figures "unverified" — never fabricate.

## Agent A — viral creative evidence
> You are a TikTok/Meta dropshipping creative researcher. Using web search only,
> find CURRENT (2025–2026) viral organic + paid creative evidence for these
> physical products: {PRODUCTS}. For each: product name; specific viral evidence
> (view counts, "X million views", named creators/brands) WITH source URL; the
> winning 3-second hook; typical US retail price range; brands known to run heavy
> paid ads. Prioritize (a) documented viral moments, (b) $80–400 price, (c) strong
> 3-second visual demo, (d) older/comfort buyer angle. Most-proven first. Do NOT
> fabricate view counts — mark "unverified" and give the qualitative signal.

## Agent B — ad-library / longevity / saturation
> You are a Meta Ad Library researcher. Direct facebook.com/ads/library access is
> network-blocked, so use WEB SEARCH to find published evidence of which of these
> products have heavy, long-running US Meta campaigns (2025–2026): {PRODUCTS}.
> For each, WITH source URLs: evidence of active/heavy spend or long campaigns
> (ad-spy writeups, case studies citing ad-library data); named brands; reported
> metrics (spend, ad count, duration, ROAS); and a saturation read (early/rising
> vs saturated). Rank by "still has room + proven demand." Be honest where
> evidence is thin; every claim needs a source URL.

## Manual ad-library validation (hand to the user — the one source no agent can reach)
Open facebook.com/ads/library → search the product/brand → a still-live winner
shows: running 14+ days without pausing, 5+ creative variants from one
advertiser, 100k+ impressions, pointing at a Shopify landing page. "50+ ads in
the library = validated OR saturated — the ad DATES tell you which."
