# 07 — What Higgsfield is, and where to rent the models (2026-10-02)

Status per claim: **V** = read from Higgsfield's own connector this session, **W** = from third-party web pages (prices move, re-check before paying), **I** = inference.

## What Higgsfield is
- Reseller/aggregator. Licenses Kling, Seedance, Veo, Wan etc. and runs them from one credit wallet. **W**
- Own layer on top: Cinema Studio (genre/camera presets, 4–15 s, 480p–4k, optional audio) **V**; Marketing Studio / Ads Studio (URL or product photo -> UGC ad, presets) **V**; Soul ID (character consistency) **W**; Ad Multiplier (re-edits one 4–30 s video with other people/products) **V**.
- Marketing Studio is reported as running on Seedance 2.0. **W**
- Workflows are prompt recipes (ugc-review, ugc-unboxing, ugc-try-on, ugc-tutorial, ugc-product, ugc-website) that script the model calls. **V** (names/descriptions read). Nothing they do needs a secret engine — it is routing + prompts + reference images. **I**
- No public REST API; MCP + CLI only. **W**

## Where to rent (no middleman = maker's own API)
| Model | Cheapest route found | Price **W** |
|---|---|---|
| Veo 3.1 Lite / Fast | Google direct (same on fal/Replicate) | Lite ~$0.05/s, Fast ~$0.10/s with audio |
| Seedance 2.0 | BytePlus ModelArk direct (about half of fal) | ~$0.15/s at 720p |
| Kling 3.0 | fal.ai (Replicate ~2x) | ~$0.11/s Pro, no audio |
| Wan 2.6 | Alibaba / fal | ~$0.05/s |

Rule found in sources: price the route, not the platform — direct for the model family you use most, one aggregator (fal.ai) for the rest.

## Cost of Alex's ad (720p, 15–20 s) **W/I**
- Veo Lite 720p: ~$0.75–1.00 per 15–20 s.
- Seedance 2.0 720p: ~$2.25–3.00.
- Kling 3.0 Pro via fal: ~$1.70–2.20.
- Scout cheap with Lite, final on the winner; judge before the expensive pass.

## Open (must be read, not guessed)
- BytePlus and Kling/fal request shapes, face/person rules, whether Seedance 2.5 is exposed in the API.
