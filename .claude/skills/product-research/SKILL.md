---
name: product-research
description: >
  Run real, cross-validated dropshipping/e-commerce product research from this
  environment even though commercial sites (Amazon, TikTok Creative Center,
  Reddit, ad libraries, AliExpress) are blocked by the container's egress proxy.
  Use whenever the user wants trending/winning products, product validation,
  supplier costs, viral-creative evidence, ad-library saturation reads, or a
  ranked shortlist for a TikTok→Meta play. Triggers: "find a product",
  "product research", "winning products", "what's trending", "validate this
  product", "supplier cost", "viral creative", "8 products", "gethooked",
  "sell the trend".
---

# Product Research — the working pipeline

The container's egress proxy blocks Amazon, TikTok Creative Center, Reddit,
Facebook/Meta Ad Library, Exploding Topics, and Google Trends' widget API.
Do NOT waste turns re-proving that. This skill routes around the blocks with
sources that actually respond, then triangulates so no single soft signal
drives a recommendation.

## The three data layers (always get all three before ranking)

### Layer 1 — Live supplier cost + demand (Higgsfield `sandbox_exec`)
The Higgsfield sandbox has its OWN open internet, separate from this container.
From it, these respond (tested): `aliexpress.us` (200), `aliexpress.com`,
`alibaba.com`, `temu.com`, `walmart.com`, `target.com`. Blocked even there:
Amazon Movers&Shakers (bot-wall), Reddit, TikTok product API (needs business
login → `40101 no permission`), Google Trends widget API (429 on datacenter IP,
even with a fresh cookie).

Scrape AliExpress search with Playwright (preinstalled at
`/usr/local/lib/node_modules/playwright`) sorted by `SortType=total_tranpro_desc`
to get, per product: **unit cost, order volume (= demand proof), and the item
link**. See `scripts/aliexpress_scrape.js`. Order counts matter more than the
cheap-junk prices — pull the price of a *real* unit, not the $2 accessory that
shares the search term.

Run heavy scrapes with `background:true` + poll; each search term is ~4s. Chain
`&&` and checkpoint JSON each loop — the sandbox is discarded ~10s after a call.

### Layer 2 — Viral creative + ad-library saturation (subagents)
The Agent tool's subagents can WebSearch (runs server-side at Anthropic, NOT
egress-blocked). Spawn two in parallel:
- one for **viral evidence** — view counts, named creators/brands, the winning
  3-second hook, with source URLs;
- one for **ad-library / longevity / saturation** — published ad-spy data,
  brand spend, "early vs saturated" reads, with source URLs.
Prompt both to mark any unverifiable number "unverified" and never fabricate.
See `scripts/agent_prompts.md`.

### Layer 3 — Trend velocity (best-effort, often blocked)
Google Trends widget API 429s the datacenter IP even with a browser cookie.
The RSS `https://trends.google.com/trending/rss?geo=US` works but is daily news,
not products. If the user has a Keepa API key (~€19/mo) it's the single best
unblocked source for Amazon rank/price velocity — take it and query directly.
Otherwise rely on Layers 1+2 and say so honestly. Do not claim live Trends
scores you couldn't fetch.

## Scoring filters (tuned to the HELIOS/SCULPS operator)
Rank survivors on:
1. **Anchor test (the SuperGlide rule):** prefer products with NO price anchor —
   buyers don't know the "right" price, so they can't comparison-check mid-scroll.
   A commodity with an Amazon/Walmart shelf price (power station, standard
   projector) fails this even at good margin.
2. **3-second demo:** the payoff must be visible in the first 2 seconds of video.
3. **Buyer fit:** 45+ comfort/home/leisure buyer (proven to convert & wait before
   disputing). Note when a product skews young.
4. **Margin at free shipping:** landed cost + realistic CAC ($45–70) must leave
   real contribution. Anything >~10 lb usually dies on free shipping.
5. **Refund surface:** no sizing, no shade-match, no skin contact w/o certs, no
   medical claims. High-return categories are disqualified regardless of hype.

## Output
Deliver a ranked board (artifact) — per product: live supplier link+cost,
retail, margin after CAC, weight, the hook, the viral proof WITH source, and the
saturation verdict (GO / STRONG / CAUTION). Include a transparency block
separating hard-verified from unverified, and name any source you couldn't reach.

## Hard lines (do not cross)
- Never build tooling whose purpose is to defeat logins, bot-detection, or IP
  blocks (proxy-rotation evasion, automated account creation, credential
  circumvention). Scraping a public, un-authed search page is fine; bypassing an
  auth wall is not.
- Never fabricate view counts, order volumes, or ad metrics. Mark unverified.
- Respect the CREDIT SPENDING RULE in CLAUDE.md for any paid generation.
