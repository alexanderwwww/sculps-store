# Sauna Store — Meta Ads Handoff

Handoff doc capturing everything worked through so far, so a new Claude session can continue without re-deriving it. This is research + strategy. There is **no built store or code** in this repo yet (only a placeholder README), and the connected Shopify store is currently locked by a billing/API issue.

---

## 1. Current state / blockers

- **Repo (`sculps-store`)**: empty except README. No store build, no code, no sauna project files exist.
- **Shopify**: API access returns *"This shop is unavailable for API access. The merchant may need to resolve a billing issue or upgrade their plan."* Must fix billing/plan in Shopify admin → Settings → Plan/Billing before any store data (email, products, orders) can be read.
- **What to find the store email manually**: Shopify admin → Settings → General → Store contact email (and Account for the owner login).

---

## 2. Sauna market — who runs the heaviest Meta ads (US home sauna)

Ranked by ad volume/longevity (no public revenue ranking exists):

| Brand | Product | Meta angle |
|---|---|---|
| **HigherDOSE** | Infrared sauna blanket (~$700–800) | Category-definer for paid social. Convenience + ritual + aesthetic. UGC-heavy. **The one to model.** |
| **Sun Home Saunas** | Full cabins + cold plunges (high AOV) | Aspiration + investment + celebrity drops (Sabrina Carpenter, Mike Tyson). Financing in copy. |
| **Sunlighten** | Premium infrared | Authority/credibility. "Clinically supported," Dr. Mark Hyman. Consideration, not DR. |
| **Plunge** | Cold plunge (expanding to sauna) | Transformation + intensity, athlete testimonials. |
| **SaunaSpace** | Near-infrared bulb "tent" | Purist / anti-EMF differentiator. |

---

## 3. Real HigherDOSE sauna ads (verbatim, via Motion's public ad library)

Source: https://motionapp.com/library/higher-dose

- **"Want deeper sleep?"** — demo video. Angle: *"lower cortisol levels... biohack your way to better sleep."* CTA: SHOP NOW.
- **"Glow Starts Within"** — image/headline: *"Infrared heat designed to support circulation + radiance."*
- **Detox/sweat ad** — opens on close-up of sweat; split-screen montage: *"Get everything you need for the ultimate calorie burn... elevate your detox routine."*

**Pattern of their winners:** hook is always a vanity/feeling benefit (sleep, glow, detox) — never the tech. Infrared science appears *after* the hook, in on-screen text. "Wellness without friction."

**Sun Home real copy:** *"Indulge in the ultimate self-care experience! 🌞 Get up to $1,550 OFF Sun Home Saunas and Cold Plunges."*

**How to see them live:** Motion link above (fast), or Meta Ad Library (facebook.com/ads/library) → search brand → filter "All ads" → old start dates = proven winners.

---

## 4. Ad-angle playbook per brand (for swipe-file modeling)

- **HigherDOSE** — convenience + ritual. "Sauna without the sauna." Overhead glowing/relaxed shots. UGC creator talking like a self-care obsession. Sell the feeling, not the science.
- **Sun Home** — aspiration + investment. Cinematic backyard-retreat b-roll, financing in copy.
- **Sunlighten** — authority. Doctor endorsement, clinical aesthetic.
- **Plunge** — transformation + intensity. The gasp/shock moment, founder + athlete story.
- **SaunaSpace** — purist / anti-EMF differentiator-led hook.

---

## 5. Meta ads mechanics covered (rules of thumb)

**Learning phase**
- Lives at the **ad set level**; needs ~**50 conversions in a 7-day window** to exit and stabilize.
- A budget change **> ~20%** = a "significant edit" → resets ad set back to "Learning."

**Cutting budget (e.g. $100 → $50)**
- Does **NOT** close/kill the ad — it stays live.
- BUT a 50% cut is >20%, so it **resets learning**; cost-per-result can spike for a few days while it re-optimizes.
- Fix: step down in <20% chunks a day+ apart ($100→$80→$65→$50), not one big slash.
- Note: usually you scale winners *up*, not down. Think twice before cutting a profitable ad.

**Scaling up frequency**
- **Don't change budget every 8 hours** — too fast; the algo never stabilizes and data becomes noise (day-parts/weekends swing hard).
- Rule: **one change per day max, wait 24–48h between changes, keep each bump <20%**, and only scale when still hitting target cost-per-conversion.
- Example ramp: $50 → $60 → $72 → $86 (one +20% step per day).

---

## 6. Next actions for a new session

1. Resolve Shopify billing so store data (email, products, orders) becomes readable.
2. Decide the actual product/brand being advertised (sauna vs. the SCULPS apparel line — confirm which).
3. Build finished ad scripts from the real HigherDOSE hook structures once product price + #1 benefit + positioning (luxury vs everyday) are known.
4. If a store needs building, start it — nothing exists yet.
