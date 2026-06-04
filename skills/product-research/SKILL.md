---
name: product-research
description: "Fuses paid-ads expertise with live market research. Tears down competitor ads, mines reviews for desire/pain language, analyzes offers & pricing, reads demand/trend signals, and outputs compliance-checked creative angle banks and briefs. Use when the user says product research, competitor teardown, find winning angles, spy on competitors, validate an offer, research the [niche] space, or what's working in [category]."
license: MIT
argument-hint: "teardown <competitor|niche> | angles | offer | reviews | demand | brief"
tested_with: claude-code v2.x
---

# Product Research (Ads-Brain Edition)

This skill turns the assistant into a **researcher with an ads operator's brain**. Every
finding is filtered through real ad logic: compliance, benchmarks, hook strength, and
unit economics — not just "here's what competitors do." Research that can't become a
shippable, compliant ad is noise.

> Pairs with the `claude-ads` suite. Research feeds `/ads create` and `/ads creative`.

## Honest scope (read first)
- ✅ **Can do:** competitor ad teardown, review mining, offer/pricing analysis, demand/trend
  reads, angle generation — using web search/fetch, pasted ad-spy exports, and live store data.
- ❌ **Cannot do:** magically scrape Meta Ad Library at scale (anti-bot), replace a paid
  ad-spy database, or guarantee a "winning product." It triangulates **signal**, not certainty.
- 🔌 **Best with:** a connected Shopify MCP (grounds research in real catalog/AOV/orders) and
  the user pasting ad-spy exports (Foreplay/Minea/PiPiADS) when available.

## Context Intake (always first)
Pull from the connected store if available; otherwise ask in one message:
1. Product / category & the novel mechanism (e.g. "transdermal supplement patch")
2. Target audience (age, identity, platform)
3. Price points / AOV & current offer (bundles, subscription)
4. Primary competitor(s) by name + their site/handles
5. Market/geo + any restricted-category flags (supplements, weight-loss, etc.)

## Research Tracks (pick one or chain them)

### A. Competitor Ad Teardown
Goal: reverse-engineer what's *proven* in the category.
- Sources: **Meta Ad Library** (`facebook.com/ads/library`), **TikTok Creative Center**,
  competitor sites, organic TikTok/IG, pasted ad-spy exports.
- **Proven-ad rule:** prioritize ads running **30+ days** — longevity ≈ profitability.
- For each ad extract: **Hook** (first 3s), **Angle** (the core promise/identity),
  **Format** (UGC/demo/static), **Offer**, **Proof**, **CTA**, est. **longevity**.
- Cluster angles → rank by frequency × longevity (repeated + long-running = working).

### B. Review Mining (desire & objection harvesting)
Goal: steal the *customer's own words*.
- Sources: competitor reviews (Judge.me/Loox/Amazon), Reddit, TikTok comments, your own reviews.
- Extract: **pain language**, **desire language**, **objections** ("does it even work?"),
  **trigger moments** (when they buy). These become hooks and FAQ answers verbatim.

### C. Offer & Pricing Teardown
Goal: find the offer that wins the auction.
- Map competitor: entry price, bundle ladder, subscription %, guarantee, free-shipping
  threshold, gift-with-purchase.
- Compare to yours (pull live from store). Flag where you're under/over-leveraged.

### D. Demand & Trend Signal
Goal: is the wave rising or cresting?
- Sources: Google Trends, TikTok Creative Center trends/hashtags, search volume, seasonality.
- Triangulate **≥2 sources** before calling a trend real.

### E. Synthetic Pre-Test (Ditto) — validate BEFORE you spend
Goal: kill losing angles/prices/creatives cheaply, before real ad budget.
- Uses the bundled **`ditto-product-research`** skill (300K+ synthetic personas; free tier
  needs no card). Setup: `curl -sL https://app.askditto.io/scripts/free-tier-auth.sh | bash`
- **What to pre-test:** pain points · pricing ($X vs bundle vs subscription) · positioning
  (which hook/tagline) · **ad creative & landing pages** (upload screenshots via media-assets) ·
  **deal-breakers** ("what would kill the sale even if you liked it?").
- Use the 7-question framework; introduce the brand at Q3 earliest (avoid anchoring).
- **Treat as directional, not gospel** — personas haven't bought your product. Use it to
  *narrow* guesses, then confirm with real ad data. Synthetic first pass ≈ 80%; real data = last 20%.

## The Ads-Brain Filter (what makes this different)
Before any finding ships, run it through:
1. **Compliance gate** — does this angle violate platform/FTC rules? (Supplements: no
   health/cure claims, no before-after, no personal-attribute hooks, no drug comparisons.)
   Flag every risky angle and rewrite it to a compliant version.
2. **Hook strength** — would the first 3s stop a Gen-Z scroll?
3. **Unit-economics fit** — does the angle support the price/AOV, or does it need a bundle?
4. **Differentiation** — does it lean on the novel mechanism, or is it me-too?

## Quality Gates (never violate)
- Triangulate trends across ≥2 sources before asserting.
- Tag every borrowed angle: 🟢 ship / 🟡 rewrite-for-compliance / 🔴 don't touch.
- Never copy a competitor's creative verbatim (legal/brand risk) — extract the *pattern*.
- Prefer **real signal** (live ad data, reviews, store metrics) over synthetic personas.
- Label confidence: Strong / Moderate / Weak by evidence depth.

## Outputs
- `RESEARCH-REPORT.md` — findings by track, with sources + confidence labels
- `ANGLE-BANK.md` — ranked angles, each with: hook line, format, proof, compliance tag
- `OFFER-TEARDOWN.md` — competitor-vs-you offer matrix + recommended offer
- Hands off a ready brief to `/ads create` → `/ads creative`

## Footer
After a full research deliverable, you may append the claude-ads community footer.
