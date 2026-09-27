# Sourcing and Margin

Instructions for the machine. Read this before quoting a price, accepting a buy, or
deciding whether a piece is worth a listing slot. Everything here is a default you
apply unless Alex overrides it. Where a number is unverified it says so — do not
present an unverified number to a buyer as fact.

Researched September 2026.

---

## 0. The fee floor you price against (Greece — read this first)

Alex sells from **Greece**. He is not a UK/US/AUS seller. This changes the arithmetic
and most Depop advice on the internet is wrong for him.

| Line | Greece (Alex) | US/UK seller (what blogs assume) |
|---|---|---|
| Depop selling fee | **10%** of item price (+ shipping where no Depop label used) | 0% since July 2024 |
| Payment rail | **PayPal** — Depop does not pay him directly | Depop Payments |
| Payment processing | PayPal's own rate, **not published by Depop**. Commonly quoted ~3% for this route (unverified — read his actual PayPal merchant rate) | 3.3% + $0.45 |
| Depop shipping labels | **Not available.** He arranges his own courier and quotes a flat price | USPS / Royal Mail / Evri at Depop rates |
| Boosted Listings | 12% on sale, on top of the above — see §7 | 12% |

**Working assumption: ~13% all-in before shipping** (10% Depop + ~3% PayPal).
Treat 13% as the floor multiplier in every margin calculation until Alex reads his
own PayPal rate off a real payout and corrects it.

The SKILL.md note that "sources disagree, 0% vs 10%" resolves like this: **both are
right, for different sellers. For Greece it is 10%.** The 0% only applies to sellers
based in UK, US or AUS *and* selling in GBP/USD/AUD.

**Cross-border surcharge:** PayPal typically adds a cross-border fee on non-domestic
payments; most of Alex's buyers are UK/US, so most of his sales are cross-border.
Exact surcharge unverified. Assume it is real and budget 1 extra point if unsure.

---

## 1. The buy rule

Do not recommend a purchase unless **all three** hold:

1. **3x rule** — expected sell price ≥ 3× total landed cost (item + any cleaning,
   repair, inbound shipping). The 3× multiple exists to absorb fees, outbound
   shipping and time; it is not profit.
2. **Net profit ≥ €20** per piece after the 13% fee floor and shipping. Below €20 the
   photography, listing, packing and message load is not worth the hour.
3. **Predicted time to sale ≤ 3 weeks.** If you cannot name a comp that sold in the
   last 60 days, you cannot predict the sale, and the answer is pass.

ROI targets, in order of how good the buy is:
- **Minimum acceptable: 100% ROI** — doubling the cash.
- **Target: 300%+ ROI** — this is the sweet spot resellers describe for thrift-sourced
  vintage.
- Below 100% ROI only for high-ticket designer where the absolute euro profit is large
  (a piece bought at €1,800 and sold at €2,600 is 44% ROI and still a good day).

Formula the app uses:

```
net   = (sell × 0.87) − outbound_shipping − landed_cost
roi   = net / landed_cost × 100
days  = predicted_days_to_sale   (see §3)
buy if net ≥ 20 AND roi ≥ 100 AND days ≤ 21
```

**Buy price matters more than sell price.** You cannot fix a bad buy with a good
listing. Never talk Alex into a marginal buy on the grounds that the listing will be
excellent.

---

## 2. Category economics — what to expect

Share of Depop sales by category, 2026:

| Category | % of sales | Median days to sell | Typical price band |
|---|---|---|---|
| Vintage & Y2K clothing | 21% | 9 | $15–40 (tops/baby tees) |
| Streetwear & hype | 16% | 11 | $30–80 |
| Sneakers | 13% | 10 | $70–180 (Nike Dunks) |
| Women's tops & corsets | 11% | — | $18–50 |
| Denim & jeans | 9% | 16 | $25–70 |
| Jackets & outerwear | 8% | 19 | $40–150 (leather) |
| Bags & accessories | 7% | — | $150–1,500+ (designer) |
| Skirts & dresses | 6% | — | — |
| Knitwear & sweaters | 5% | — | — |
| Handmade / reworked | 4% | — | — |

Price as a percentage of original retail:
- **Deadstock / NWT: 70–90% of retail.**
- **Worn: 35–50% of retail.**
- Hype and vintage designer: 50–90% of retail.
- Fast fashion: 25–45% of retail — which is why fast fashion is a pass.

NWT commands roughly a **30% premium** over the same piece graded "Good".

Category margin benchmarks to plan against: **~40% net margin on vintage denim vs ~15%
on trend pieces.** Trend pieces earn their place through velocity, not margin.

**Apply the Greek fee floor to all of the above.** Every price band quoted in the
sources is a US/UK seller's gross. Alex nets 87% of it minus his own courier.

---

## 3. Sell-through and how long stock may sit

Sell-through rate (STR) = units sold ÷ units listed, over a window. Use a **30-day**
window per category, and a **rolling 90-day** window for the shop.

Reseller benchmarks (eBay-derived, treat as directional for Depop):
- **STR ≥ 70%** — strong, source more of this.
- **STR 40–70%** — healthy.
- **STR < 20%** — stop buying that category entirely.

Translate STR into expected days:
- 80%+ STR category → **5–10 days**
- 40–60% STR → **15–25 days**
- <40% STR → **30–90 days**

### Dead money ladder

Run this per listing, dated from first listing:

| Age | Action |
|---|---|
| 0–14 days | Full price. Do nothing but refresh per SKILL.md and answer messages. |
| 14–30 days | Item has likes but no sale → offer to likers (SKILL.md cadence). No likes and no views → the **title** is wrong, rewrite it. Views but no likes → the **cover photo** is wrong, reshoot it. Views and likes but no sale → the **price** is wrong. |
| 30–60 days | First markdown: **−10 to −15%**. A price drop notifies likers, so it doubles as a free push. |
| 60 days | **Delist and relist as a new listing** with a rewritten title, new hashtags and a new cover. This is the reset, and it is different from a refresh. |
| 60–90 days | Second markdown: **−30 to −50%** from original. |
| 90 days | Bundle it (§5), sell it off-platform at cost, or write it off. Capital tied up past 90 days has cost more than the loss. |

**Sources disagree on relist timing.** One says relist unsold items every 2–3 weeks;
another says wait 30 days before refreshing; the dead-money ladder above says 60 days
for a full delist/relist. **Trust the 60-day delist/relist** and keep the daily
refresh cadence in SKILL.md separate from it — a refresh is a bump, a relist destroys
the listing's like-count and age. Never relist an item that has accumulated likes;
those likers are the free offer audience.

**Never relist a piece that has been delisted and relisted twice.** Three cycles means
the market has told you the answer.

---

## 4. Pricing against SOLD comps

Rule: **price against what sold, never against what is asking.** Active listings are
other sellers' hopes.

### Where to look, in priority order

1. **Depop, in-app** — open a comparable seller's shop; sold items appear in a
   separate section below their active listings. Search brand + item type, then read
   the sold shelves of the three or four shops that carry the same thing.
2. **eBay sold listings** — the deepest comp pool in resale, and the one with a real
   sold filter. Use it for anything with a brand name. Filter: Sold Items, last 90
   days, same condition, same size band.
3. **Grailed sold** — the authority for men's streetwear, designer and archive. Use it
   for Chrome Hearts, Carhartt WIP, anything hyped.
4. **Vinted** — use only as a floor check for European pricing on plain vintage. Vinted
   prices run below Depop for the same piece because Vinted charges sellers nothing.
5. **Vestiaire / Fashionphile** for Birkin-tier bags. Never price a Birkin off Depop.

### Method

- Collect **at least 10 comparable sales in the last 60 days.** Fewer than 5 comps →
  say so, and price conservatively at the low end.
- Use the **median**, not the mean. One collector overpaying drags a mean.
- Adjust for condition against the ladder in `02-listing-craft.md`.
- List at **median + 10–15%** so there is room to accept an offer and still land on
  the median. Do not list at median; you will be negotiated below it.
- Never list above the highest sold comp unless the piece is genuinely rarer than
  everything in the comp set, and say in the description why.

### Currency

Alex lists in **EUR**. Currency is set once in account settings and applies only to
new listings — an existing item must be relisted to change currency. When comping
against US/UK sold prices, convert and then check the converted number does not look
absurd to a euro buyer.

---

## 5. Bundling

Depop has a native bundle discount: Selling Hub → Shop Settings → Bundles. Options are
**free shipping** on 2+, or **a % off** on 2+.

Defaults:
- **Turn on 10% off 2+ items permanently.** It is the standard, buyers look for the
  banner, and 10% is inside the negotiating room you already built into the list price.
- Do **not** set 20%+ as an always-on. Save 15–20% for a message-negotiated bundle of
  3+ items or a bundle over €120.
- Free-shipping bundles are dangerous from Greece where he pays his own courier —
  only offer free shipping on bundles inside the EU, or over €80.

Bundles reported to lift average order value **30–50%** (unverified — one vendor's
figure). Treat the direction as true and the magnitude as marketing.

Manual bundles as a dead-stock tool: group 90-day stock into a **10-piece vintage
bundle** listed as one item at a clearing price. This converts dead capital into cash
and one shipping event instead of ten.

---

## 6. Seasonality, month by month

The lead-time rule governs everything: **source 6–8 weeks before the selling season,
list 2–4 weeks before peak demand.** Items listed inside their peak window sell
**40–60% faster** than the same item listed off-season, and off-season sourcing buys
at **50–70% off**.

Important correction for this shop: **Alex's buyers are mostly UK and US, not Greek.**
Price and list to the **northern-hemisphere** calendar of his buyers, not to Greek
weather. A Greek September is still summer; a British September is coat weather.

| Month | LIST / SELL | SOURCE (for later) |
|---|---|---|
| **January** | Winter coats still move first half; loungewear, gym-adjacent vintage, going-out tops for NYE hangover restock. Post-holiday buyers have gift-card money in week 1–2. | Winter clearance at −70%. Valentine's stock. |
| **February** | Valentine's: red/pink Y2K, lace, slip dresses, lingerie-as-outerwear, heart motifs — list by **25 Jan**. Denim starts moving again. | Spring pastels, festival stock. |
| **March** | Spring jackets, lighter denim, pastels, rain shells, football/soccer jerseys. | Summer: Hawaiian shirts, swim, mesh tops. Prices are lowest now. |
| **April** | Prom/formal (US), pastel dresses, cropped knits, light layers. List Easter-adjacent 2–3 weeks before. | Continue summer sourcing. Outerwear at floor prices. |
| **May** | Peak spring. Graduation white dresses, festival gear (Coachella tail, UK festival build-up), mesh, going-out tops. | Autumn workwear — Carhartt is cheap in May. |
| **June** | Wedding-guest dresses, swim, summer dresses, vintage band tees, shorts, sandals. Y2K baby tees peak. | Back-to-school; Halloween. |
| **July** | Hawaiian shirts (list by **early July** or the window is gone), festival, swim, tanks. | Winter outerwear at absolute floor. Leather. |
| **August** | Back-to-school: denim, cargos, hoodies start, sneakers, dorm-adjacent. First three weeks carry most of the volume. | Christmas gift stock. Knitwear. |
| **September** | **Fall fashion takes over — list by late August.** Leather jackets, Carhartt, flannels, boots, knitwear, cargo, field jackets. Strongest single month for workwear. | Holiday party stock, sequins, faux fur. |
| **October** | Halloween-adjacent vintage (list by **1 Oct**, peak through **25 Oct**), then hard pivot to outerwear, cozy knits, boots. Heavy coats start mid-October. | Nothing — switch to selling. |
| **November** | Highest-revenue month. Winter coats, holiday party attire, gift-able designer, sequins. Black Friday: run the shop-wide sale. | Almost nothing. Sell. |
| **December** | Gift framing on everything. Ship deadline discipline: **1–15 Dec** is peak shipping, **15–20 Dec** is last-chance from Greece to UK/US, after **20 Dec** switch messaging to "arrives after Christmas, happy to hold". | From **26 Dec**: post-Christmas clearance, the single best sourcing window of the year. |

Winter coat price seasonality: roughly **$400 in November vs $250 in April** for the
same coat — a ~60% seasonal premium. Do not list heavy outerwear in May.

International shipping from Greece adds transit time. Subtract **5–7 days** from every
US/UK holiday deadline above.

---

## 7. What to source right now (autumn/winter 2026)

Rising, verified in 2026 trend reporting:
- **Y2K mall brands** — American Eagle, Hollister, Aéropostale. Searches up (magnitude
  unverified). This is the cheapest thing on this list to source and it moves.
- **Going-out tops and bootcut jeans** rising; **hoodies, crewnecks, track jackets
  falling.** Stop buying plain crewnecks.
- **Vintage sportswear** — Champion searches +242%, Adidas +168% (single-source
  figures, treat as directional).
- **Workwear and utility** — field jackets, utility shirts, cargo trousers, canvas
  workwear. Depop's own trend reporting points here. This is Carhartt season and it is
  Alex's strongest category alignment.
- **Corset/bustier** €18–50 and **mesh/going-out** €15–40 — persistent, fast.

Known-good flip economics from reseller data (US dollars, source-dependent):
- Vintage Levi's 501: buy $4–8, sell $50–120, **500%+ ROI**.
- Nike Dunks: buy $15–40, sell $60–150+, 100–300% ROI.
- 90s Hawaiian shirts: source ~$4, sell $40–80; rare 60s–70s silk $100–300+.
- Rare tour tees: $80–250.

**Never source:** H&M, Forever 21, Shein, Primark, anything unbranded and modern,
anything that only photographs well flat, anything with an odour, anything with
underarm yellowing on a white garment (it does not come out and it produces claims).

---

## 8. Portfolio shape

Run the shop as two books with different rules.

**Book A — Y2K / vintage / thrift.** Target **60–70 live listings**. Price band
€15–70. This book pays the bills weekly and feeds the algorithm the cadence and the
conversion rate it wants. Target STR 40%+/month. Accept 25–40% net margin. Turn it.

**Book B — designer and streetwear.** Target **8–15 live listings**, never more. Price
band €150–3,000+. This book is slow, is allowed to sit 60–90 days, and is where the
euros are. Do not markdown Book B on the dead-money ladder — a Chrome Hearts cross
that sits 70 days has not failed, it is waiting for its buyer. Apply the ladder only
after **120 days** for Book B, and only −10%.

**Cash rule:** never let Book B hold more than **60%** of tied-up capital. One slow
Birkin should not stop him buying forty baby tees.

---

## 9. Legal and account risk in this file

- **Counterfeit is account-ending and can be brand-ending.** Depop bans for verified
  counterfeit listings and brands pursue sellers directly. Nothing in this shop is
  sourced as a replica. If provenance on a designer piece cannot be established, it is
  not listed at any margin. See `04-authenticity-and-risk.md`.
- **DAC7 — Greece.** EU platforms must report sellers to the tax authority (AADE in
  Greece) once a seller passes **30 transactions OR €2,000 in a calendar year**. Depop
  will collect and verify tax details and report them. Alex will cross both thresholds
  in his first quarter. Being reported is not itself a tax bill, but **profit from
  trading secondhand goods is taxable income in Greece** and this operation is trading,
  not clearing a wardrobe. Tell him to speak to an accountant before the first
  January; do not model tax in the margin calculations, and never give tax advice.
- **Customs / IOSS.** Shipping from Greece to the UK crosses a customs border. Under-
  declaring value on a customs form to help a buyer avoid duty is fraud and the app
  must never suggest it, even when a buyer asks. Declare the real sale price.

---

## Sources

- https://plottdata.com/blogs/what-sells-most-on-depop — category share, days to sell, price bands, % of retail
- https://fluf.io/crosslisting/vendora-to-depop/ — Greek seller 10% fee, PayPal, no Depop labels, EUR currency
- https://www.underpriced.app/blog/depop-fees-shipping-payout-guide-2026 — US/UK 0% + 3.3%+$0.45, boost 12%
- https://www.underpriced.app/playbook — 3x rule, €20/$20 net floor, 3-week rule, ROI tiers, STR→days, 60-day dead stock, comp methodology (10 comps, median)
- https://itemvaluechecker.com/blog/how-to-price-thrift-store-finds — 3x rule
- https://www.voolist.com/blog/how-to-price-items-for-resale — 40–50% margin target, $10–15 minimum profit
- https://depopautomation.com/blog/how-to-price-depop-items-for-profit — sold comps not asks, 10–15% incremental cuts, 40% denim vs 15% trend margin, 10–20% bundles
- https://closo.co/blogs/inventory-logistics-management/how-to-deal-with-stuff-that-just-won-t-sell — 0–60 full price, 60–90 −10–15%, 90+ −30–50%, 60-day delist/relist, 10-piece bundles
- https://www.underpriced.app/blog/seasonal-reselling-calendar-guide — month table, 40–60% faster in season, 50–70% off-season sourcing, coat price premium
- https://www.voolist.com/blog/seasonal-reselling-calendar — source 6–8 weeks ahead, list 2–4 weeks ahead, December shipping dates
- https://www.underpriced.app/blog/summer-reselling-strategy-what-sells-best-2026 — Hawaiian shirt economics
- https://closo.co/blogs/platform-specific-guides/how-do-bundles-work-on-depop — bundle mechanics, AOV lift
- https://mamabella.uk/fleek-trends-report-y2k-fashion-vinted-resellers/ — Y2K mall brands A/W 2026, going-out tops up, hoodies down
- https://www.accio.com/business/best-selling-items-on-depop — Champion +242%, Adidas +168%
- https://depophelp.zendesk.com/hc/en-gb/articles/19653371452049-Reporting-income-in-the-EU-DAC7 — DAC7
- https://www.thrift.guide/guide/clothing-condition-guide — NWT 30% premium
- https://www.mylisterhub.com/articles/ebay-sell-through-rate — STR benchmarks 70/40/20
