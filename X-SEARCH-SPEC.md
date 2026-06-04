# 🔎 X SEARCH — Build Spec / Visualization Prompt

> A TikTok product-research scanner that lives inside **Patchd OS**. You hit scan, it
> hunts, and **20 validated products stream onto an iPhone screen, top-to-bottom**, each
> with an X Score. Xcode-on-the-outside, App-Store-on-the-inside.

## The vibe (what you SEE)
- A **popup window** inside Patchd OS with **Xcode-style chrome** — dark dev aesthetic,
  toolbar, side rail, monospace accents, that "I'm building something" feel.
- Dead center: a **floating iPhone mockup** (notch, rounded corners, status bar) — this is
  the "screen" the results render on.
- Hit **Scan** → a loader runs (and it's *honest* — real data takes time) → product cards
  **row in one-by-one from top to bottom** on the iPhone screen, like a feed populating.
- Top bar: a **TikTok connector** chip (TikTok only — no Instagram), shows connected/not.

## The flow (what HAPPENS)
1. Open X SEARCH from the Patchd OS dock.
2. Connect / select a **TikTok data source** (see "the unlock" below).
3. Set a query: niche / keyword / "patches" / a competitor handle.
4. Hit **Scan** → loading state (progress + "analyzing N of 20…").
5. **20 product cards stream in**, top→bottom, each scored.
6. Tap a card → detail: why it scored that way + a ready ad angle.

## A product card = the "all validations"
| Field | Source |
|---|---|
| Product + thumbnail | TikTok data source |
| 📈 Demand / trend signal | data source + Google Trends cross-check |
| 🔥 Hook / winning angle | extracted from top ads (ads-brain) |
| 💰 Price + margin fit | vs your AOV |
| 🌊 Saturation | how many sellers/ads running |
| ⚖️ Compliance flag | ads-brain (supplement/claims rules) |
| 🎯 **X Score (0–100)** + verdict | weighted blend → "chase / watch / skip" |

## Architecture (3 layers — honest)
1. 🟢 **UI shell** — single-file web app, extends `app/patchd-os.html`. No build step. *Easy.*
2. 🔴 **Data connector** — THE hard part. TikTok has no free "winning products" API.
   Real options: **Creative Center** (free, semi-manual) · **paid analytics API**
   (Kalodata / FastMoss / EchoTik) · **scraper** (fragile, ToS risk).
3. 🟢 **Validation engine** — Ditto (synthetic pre-test) + ads-brain (compliance, hooks,
   benchmarks) → produces the X Score. *We already have this.*

## ⭐ The unlock (the one decision)
**Where do the 20 products come from?** Everything else is downstream of this. The GitHub
links we find must answer THIS — not just look pretty. We rank each link by: *does it give
a legit TikTok data feed, yes or no?*

## What to hunt for on GitHub (our search checklist)
- ✅ TikTok **Creative Center** scrapers / unofficial API clients
- ✅ **Kalodata / FastMoss / EchoTik** API wrappers (paid data, clean)
- ✅ TikTok **Shop** product/affiliate data clients
- 🟡 General TikTok scrapers (check: do they still work? anti-bot? maintained?)
- ❌ "Connect with Google" anything — not how TikTok auth works; skip
- ✅ Bonus: a **scraping framework with Cloudflare bypass** (e.g. scrapling) as the engine

## Out of scope / honesty
- No Instagram. TikTok only (your call).
- TikTok's official login only returns YOUR account — not competitor/trending data. The
  "research" data must come from Creative Center, a paid API, or scraping.
- X Score is **directional** — it ranks bets, it doesn't guarantee winners. Real sales decide.

## Definition of done (v1)
Open X SEARCH → connect a data source → scan "supplement patches" → 20 cards stream in
with X Scores → tap one → see the angle + compliance flag. Cheapest viable path:
**Creative Center data + Ditto/ads-brain validation**, upgrade to a paid API later.
