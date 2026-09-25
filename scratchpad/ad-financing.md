# Ad-Spend Financing for Black Reaper — Decision Document
**Researched 25 September 2026.** For: Alex, Black Reaper (blackreaper.us). Greek/EU business, custom-built store (NOT Shopify), Stripe, sells to US, no US LLC, modest revenue.

---

## RESEARCH LIMITATION — READ THIS FIRST

Meta's own Business Help Center pages **could not be opened from this environment**. `www.facebook.com/business/help/...` returns "Sorry, something went wrong" to every server-side fetch (tried direct, `business.facebook.com`, `web.facebook.com`, `?locale=en_US`, and archive.org — archive.org is blocked by egress policy). Meta gates those pages behind a JS/login check.

So: the Meta section below is built from **secondary sources that paraphrase Meta**, not from Meta's own text. I have marked every Meta claim as either paraphrased-secondary or unverified. **Do not treat the Meta numbers below as Meta's official position.** Alex can open these URLs himself in a normal logged-in browser in 30 seconds, and he should, because he can see them and I cannot:
- https://www.facebook.com/business/help/663802094015925 (Apply for Monthly Invoicing)
- https://www.facebook.com/business/help/183197756325469 (Credit Lines and Credit Limits)
- https://www.facebook.com/business/help/2086865811541431 (About Monthly Invoicing)

---

# PROVIDER 1 — Meta Monthly Invoicing / Credit Line (Meta's own)

| # | Field | Answer |
|---|---|---|
| 1 | Company | Meta Platforms |
| 2 | Website | https://www.facebook.com/business/help/663802094015925 |
| 3 | Finances advertising | Yes — this IS an advertising credit line. Meta bills you Net 30 against a Meta-assigned credit limit. |
| 4 | Meta supported | Yes, by definition. |
| 5 | Min monthly revenue | unknown — not stated on their site (page unreachable; no revenue test is reported anywhere) |
| 6 | Min monthly ad spend | **Unpublished by Meta.** Widely community-reported around **$50,000/month**, explicitly described as community-reported and NOT confirmed by Meta ([adsuploader](https://adsuploader.com/blog/meta-ads-monthly-invoicing), [auditsocials](https://www.auditsocials.com/blog/meta-ends-credit-card-payments-high-spend-ad-accounts-monthly-invoicing-2026)). One source mentions $10k/mo for 3 months as older criteria, unverified. **Treat as: you must be a large advertiser.** |
| 7 | Deposit/upfront | None |
| 8 | Personal guarantee | unknown — not stated on their site |
| 9 | Personal credit check | No published credit-score requirement ([adsuploader](https://adsuploader.com/blog/meta-ads-monthly-invoicing)) |
| 10 | US company required | No |
| 11 | International/EU can apply | Yes in principle — reported available in US and **SEPA** countries; Greece is SEPA. Autopay by direct debit reported as US + SEPA only ([adsuploader](https://adsuploader.com/blog/meta-ads-monthly-invoicing)) |
| 12 | Credit limits | Set by Meta from payment history, time on platform, business verification and internal risk review. No published figure. |
| 13 | Repayment | Net 30 from invoice |
| 14 | Cost | No interest/fee reported — it is trade credit, not a loan. This makes it the cheapest option **by far** if you can get it. |
| 15 | Pays platform directly | N/A — Meta bills itself. Nothing leaves your bank until the invoice is due. |
| 16 | Application requirements | Verified Business Portfolio; legal entity Meta can confirm in a government registry; finance-level admin on the portfolio; legal business name; **tax ID / EU VAT number**; possibly a legal document showing business name and address ([adsuploader](https://adsuploader.com/blog/meta-ads-monthly-invoicing), [1clickreport](https://www.1clickreport.com/blog/meta-ads-billing-changes-april-2026-guide)) |
| 17 | Waitlist | Not a waitlist — **invitation-gated**. You cannot apply unprompted. A banner appears in Meta Business Suite → Billing & payments only if Meta deems you eligible. |
| 18 | Accepting applications | Yes, for eligible accounts. Processing reported at 24–48h to 5–10 business days. |
| 19 | Sources | https://www.facebook.com/business/help/663802094015925 · https://adsuploader.com/blog/meta-ads-monthly-invoicing · https://www.1clickreport.com/blog/meta-ads-billing-changes-april-2026-guide |

### The 2026 context Alex needs to know
There was a real, significant billing change this year. From **1 April 2026**, Meta forced ad accounts in a Business Portfolio **above a spend threshold** off credit cards and onto monthly invoicing or SEPA direct debit ([paymentsdive](https://www.paymentsdive.com/news/meta-revamps-ad-payment-policy/814295/), [threechaptermedia](https://www.threechaptermedia.com/blog/meta-ads-billing-changes-2026)). Motivation was saving 1.5–3.5% card processing fees.

**The consequence for Alex is counter-intuitive and important:** this change is a *downgrade* for big advertisers (they lost card float and cashback) and a *non-event* for small ones. Smaller accounts explicitly **keep using credit cards as normal**. Being below the threshold means he is not forced onto invoicing — and also means **he will not be offered it**. Meta credit is a reward for volume he does not yet have.

### Honest verdict on Meta
**The single best option on cost, and almost certainly unavailable to him today.** Nothing is lost by preparing for it — Business Verification is free, required anyway, and is the gating step. But he should not plan cash flow around getting it this year.

---

# PROVIDER 2 — Juni (Juni Technology AB, Sweden)

| # | Field | Answer |
|---|---|---|
| 1 | Company | Juni Technology AB, co. no. 559248-0908, licensed e-money institution, Swedish FSA licence 64025 |
| 2 | Website | https://www.juni.co |
| 3 | Finances advertising | **Yes, and this is what Juni was built for.** Two relevant products: **Invoice Credit** ("Pay any invoice, extend your repayment terms") and **credit-BIN credit cards** with up to 60 days interest-free. |
| 4 | Meta supported | Not named on the pages I read. Cards are Mastercard on a **Credit BIN**, explicitly marketed as "eliminating the restrictions and 'prepaid' flagging common with traditional bank cards" — i.e. built to be accepted by ad platforms. Meta support: **unknown — not stated on their site**, though it is the obvious use case. |
| 5 | Min monthly revenue | unknown — not stated on their site |
| 6 | Min monthly ad spend | None stated. Invoice Credit finances invoices **from EUR 10,000**. |
| 7 | Deposit/upfront | No deposit. But a **platform fee of EUR 79/month** (Scale plan). |
| 8 | Personal guarantee | unknown — not stated on their site |
| 9 | Personal credit check | unknown — not stated on their site |
| 10 | US company required | **No.** |
| 11 | International/EU can apply | **Yes — and this is the key finding.** Juni supports legal entities registered in the **EEA**. Greece is EEA. Notably does NOT support UK, Gibraltar, Jersey, Guernsey. ([help.juni.co](https://help.juni.co/en/articles/103054-which-companies-and-countries-does-juni-support)) |
| 11a | **Entity type restriction — CRITICAL** | Only **limited liability companies** (AB, BV, GmbH, LTD, LLP, PLC — Greek equivalent: **IKE / EPE / AE**). **Sole proprietorships and private individuals are NOT supported.** If Alex trades as a Greek ατομική επιχείρηση, he is ineligible until he incorporates an IKE. ([help.juni.co](https://help.juni.co/en/articles/103054-which-companies-and-countries-does-juni-support)) |
| 12 | Credit limits | Not published; daily card spend limit up to EUR 500,000/day |
| 13 | Repayment | Invoice Credit: choose per invoice in 15-day increments, **15 to 120 days**. Scale plan is capped at 30/60/90 days; 120 days is Prime only. Cards: up to 38 days (Scale) / 60 days (Prime). |
| 14 | Fees / real cost | **Published, which is rare and good.** Scale plan: **EUR 79/month**, **3% per month on Invoice Credit used**. Card FX 1.5%, account FX 0.5%. Cashback 0.5%. 3%/month is roughly **36% annualised** — expensive money, but only paid on what you draw. ([juni.co/pricing](https://www.juni.co/pricing)) |
| 15 | Pays platform directly | **Invoice Credit pays the invoice** — Juni settles it and you repay later. So yes, this is the "pays the bill for you" model. Card route = you spend on Juni's credit, Juni bills you later. |
| 16 | Application requirements | Account opening in as little as 24h; credit decisions "as fast as 24 hours". See https://help.juni.co/en/articles/103056 for document list. |
| 17 | Waitlist | No |
| 18 | Accepting applications | **Yes** — live, "Open account" and "Apply now" active on the site as of this check |
| 19 | Sources | https://www.juni.co/financing · https://www.juni.co/financing/invoice-credit · https://www.juni.co/pricing · https://help.juni.co/en/articles/103054-which-companies-and-countries-does-juni-support |

**Caution flag:** Juni's 2026 site leans heavily toward Nordic/Swedish accounting (Fortnox integration, Swedish-language toggle, SEK-denominated credit converted to EUR/USD). It has drifted from its original "ecommerce ad-spend card" identity toward general business banking. Alex should ask them directly, before paying EUR 79/month, whether Meta ad billing is a supported use case for a Greek entity.

---

# PROVIDER 3 — Viceversa (Italy/Ireland)

| # | Field | Answer |
|---|---|---|
| 1 | Company | Viceversa (offices Milan and Dublin) |
| 2 | Website | https://goviceversa.com |
| 3 | Finances advertising | **Yes, explicitly.** Capital is positioned specifically for digital marketing and customer acquisition. |
| 4 | Meta supported | Funds are delivered on a **virtual card powered by Stripe**, usable for ad spend. Meta named explicitly: **unknown — not stated on their site**, but a card is a card. |
| 5 | Min monthly revenue | **EUR 10,000/month** ([goviceversa](https://goviceversa.com/revenue-based-financing-get-funded/)) |
| 6 | Min monthly ad spend | **EUR 10,000/month marketing budget** — this is a real bar and may be above Alex's current level |
| 7 | Deposit/upfront | None stated; "no upfront fees" |
| 8 | Personal guarantee | **No personal guarantees required** — stated on their page |
| 9 | Personal credit check | unknown — not stated on their site |
| 10 | US company required | **No** |
| 11 | International/EU can apply | **Yes — "any European incorporated company"** with 6+ months trading in ecommerce/SaaS/marketplace/apps/subscriptions. Greece not named individually; confirm directly. |
| 12 | Credit limits | EUR 10,000 to EUR 5,000,000 |
| 13 | Repayment | Revenue share — "a small percentage of revenues, no fixed due dates" |
| 14 | Fees / APR | **Not published.** unknown — not stated on their site. RBF peers run 6–12% flat. **Get this in writing before signing.** |
| 15 | Pays platform directly | **No — gives you a virtual card.** You spend it. |
| 16 | Application requirements | 6+ months trading history, connect revenue/ad data; offer in up to 3 days |
| 17 | Waitlist | No |
| 18 | Accepting applications | **Yes** — application portal live |
| 19 | Sources | https://goviceversa.com/revenue-based-financing-get-funded/ · https://goviceversa.com/working-capital-get-funded/ |

**Verdict:** The best *pure-fit* option on paper — EU, no US entity, no PG, ad spend is the stated use case. Blocked only by the EUR 10k/month marketing-spend bar. Worth applying the moment he crosses it, and worth emailing now to ask if there is flexibility.

---

# PROVIDER 4 — Wayflyer

| # | Field | Answer |
|---|---|---|
| 1 | Company | Wayflyer (Ireland) |
| 2 | Website | https://wayflyer.com |
| 3 | Finances advertising | Yes — "no restrictions on how funds can be deployed... includes inventory, **marketing**, hiring..." |
| 4 | Meta supported | N/A — cash to your bank, spend as you like |
| 5 | Min monthly revenue | **$10,000/month**, 6+ months trading — the lowest bar of any serious provider |
| 6 | Min monthly ad spend | None |
| 7 | Deposit/upfront | None |
| 8 | Personal guarantee | **No** — "we fund the business, not the person" |
| 9 | Personal credit check | Not required per their materials; underwriting is on sales data |
| 10 | US company required | No |
| 11 | International/EU can apply | **Yes, but Greece is NOT on the list.** Supported markets: US, Canada, UK, Ireland, Spain, Germany, Belgium, Netherlands, Sweden, Denmark, Australia. **Greece is absent.** This is the blocker. |
| 12 | Credit limits | $5,000 to $20,000,000 |
| 13 | Repayment | Revenue-share, no fixed term |
| 14 | Fees | Single fixed fee upfront, reported **2–8%**; no origination/prepayment/late fees |
| 15 | Pays platform directly | **No — cash** |
| 16 | Application requirements | Connect sales platforms and bank account; decision in ~24h |
| 17 | Waitlist | No |
| 18 | Accepting applications | Yes |
| 19 | Sources | https://wayflyer.com · https://www.finder.com/business-loans/wayflyer-review |

**Verdict:** Perfect size fit, wrong country. Greece is not a supported market. Worth one email to confirm (market lists change), but do not count on it.

---

# PROVIDER 5 — Clearco — **RULED OUT**

| # | Field | Answer |
|---|---|---|
| 2 | Website | https://www.clear.co |
| 5 | Min monthly revenue | **$100,000+/month**, 6+ months consistent |
| 10 | US company required | **Yes — must be incorporated in the U.S. with an active U.S. business bank account** |
| 11 | EU can apply | **No** |
| 15 | Pays platform directly | No (Invoice Funding pays vendor bills; cash otherwise) |
| 18 | Accepting applications | Yes |
| 19 | Source | https://www.clear.co |

**Two independent disqualifiers: 10x too small, and no US entity.** Do not apply.

---

# PROVIDER 6 — 8fig — **RULED OUT**

| # | Field | Answer |
|---|---|---|
| 2 | Website | https://8fig.co |
| 5 | Min revenue | $12k avg monthly (last 3 months), $100k+ annual, 6+ months in business — **he would pass this** |
| 10/11 | Geography | **Business must be based in the U.S. or Canada** |
| 3 | Finances advertising | Focused on inventory/supply chain; ad spend not mentioned |
| 19 | Source | https://8fig.co |

**Disqualified on geography only.** Would become viable with a US LLC.

---

# PROVIDER 7 — Uncapped — **UNLIKELY**

| # | Field | Answer |
|---|---|---|
| 2 | Website | https://www.weareuncapped.com (site is behind Cloudflare; blocked both direct fetch and browser-agent fetch — figures below are secondary) |
| 3 | Finances advertising | Yes — originally pitched precisely as funding online marketing |
| 5 | Min monthly revenue | **$100,000+/month** ($10k+ for Amazon sellers only) |
| 10/11 | Geography | London HQ, UK/EU/US. Greece: unknown — not stated on their site |
| 14 | Fees | Reported 15–23% APR |
| 15 | Pays platform directly | No — cash |
| 18 | Accepting applications | Could not verify — **site unreachable to automated fetch**. Alex should open it himself. |
| 19 | Sources | https://www.ecaplabs.com/blogs/ultimate-uncapped-review (published Feb 2024 — dated) |

**$100k/month rules him out** unless he sells on Amazon, which he does not.

---

# PROVIDER 8 — Silvr — **NO LONGER INDEPENDENT + FRANCE ONLY**

This is exactly the kind of stale-blog trap the brief warned about. Silvr is still widely recommended in 2023–2025 listicles as a pan-European ad-spend financier. **It is not that any more.**

- Silvr's own site carries a banner: **"L'activité de Silvr est reprise par Karmen depuis novembre 2025"** — Silvr's business was **taken over by Karmen in November 2025**, and applicants are redirected to Karmen.
- Its own eligibility box now reads: **"Registered in France"**, monthly turnover EUR 5,000 minimum, 12 months tenure, self-employed excluded.
- Source: https://www.silvr.co

**A Greek company cannot use Silvr. Ignore every blog that says otherwise.**

---

# PROVIDER 9 — Karmen — **FRANCE ONLY**

- Website: https://www.karmen.io/en
- France-only; requires ~9 months trading and **EUR 300,000 annual revenue**
- Now also operates the former Silvr book
- Source: https://www.karmen.io/en · https://techcrunch.com/2025/01/20/karmen-secures-94-million-for-its-revenue-based-financing-products/

**Ruled out on country and size.**

---

# PROVIDER 10 — Ampla — **DEAD**

Ampla was **acquired by FundThrough on 21 April 2025**. Before that it had stopped funding facilities, cut customers' credit lines, and asked some customers to repay in full. Another stale-listicle trap.
Source: https://pitchbook.com/profiles/company/434216-89

---

# PROVIDER 11 — Settle — US CPG, not a fit

- https://www.settle.com — active, but aimed at US CPG brands, inventory/vendor bills, not ad spend. US-centric. Not worth his time.

---

# PROVIDER 12 — Plastiq / Melio (card-to-invoice rails)

These are **not** financing. They let you pay a bill that does not accept cards **with** a card, for a fee (~2.9%). They surfaced in 2026 as a workaround for advertisers pushed off cards by Meta's April change.
- https://www.plastiq.com · https://melio.com/blog/how-to-pay-for-meta-ads-with-a-credit-card/

**Relevance to Alex: near zero, and it fails his stated criteria.** He said he does not want cards he has to fund first. These add a fee on top of a card he would still have to fund. Only useful if he already had a business card with a real limit and wanted the 30–55 day float. Listed for completeness.

---

# SCAM / GREY-MARKET WARNING

He asked to avoid these and said he would not spot them. Concretely, **walk away from any of the following**:

1. **"Agency ad accounts" sold by resellers.** The tell is anonymous access to a pre-farmed, aged Business Manager with **no named, contactable operating company** behind it. Meta tightened risk controls in early 2026 with a spike in bans. The hidden cost nobody mentions: **when the parent BM gets banned, your conversion history does not transfer** — you lose the pixel learning, not just the account. ([dailyintelservice](https://dailyintelservice.com/learn/are-agency-ad-accounts-against-meta-s-ad-policies), [auditsocials](https://www.auditsocials.com/blog/meta-ad-account-legitimacy-verification-requirement-2026))
2. **Anyone who will "get you a Meta credit line" for a fee.** Meta credit lines are invitation-gated inside Business Suite. Nobody can sell you access.
3. **"Guaranteed approval" / "no credit check, unlimited ad credit."** Real underwriters (Wayflyer, Viceversa) publish an eligibility bar. Anyone who has no bar is not underwriting; they are selling something else.
4. **Anyone asking for an upfront/"insurance"/"activation" fee before funding.** Every legitimate provider here charges out of the advance or on drawn credit, never in advance.
5. **Prepaid/debit BINs marketed as "ad credit."** That is your own money with extra steps, and Meta flags prepaid BINs.

---
---

# A) WORTH APPLYING TO — RANKED

**The honest headline: there are two realistic options, and both have a condition attached. The rest of this industry is closed to him.**

**1. Juni — best realistic first move.**
Only provider confirmed to accept a **Greek/EEA** company, live, publicly priced, and structurally designed to pay the ad bill and let you settle 30–90 days later. **Condition: he must be an IKE/EPE/AE, not a sole trader.** Cost is real (EUR 79/mo + 3%/mo drawn) but it is the only thing on this list that does the exact job he described without a US entity.

**2. Viceversa — best fit on paper, one bar away.**
EU-wide, no US entity, no personal guarantee, explicitly for marketing spend. **Condition: EUR 10k/month revenue AND EUR 10k/month marketing budget.** If he is not there yet, this is the thing to grow into. Email them now to ask where the flexibility is.

**3. Meta Monthly Invoicing — free money, but he must be invited.**
Cheapest by an enormous margin (no fee at all, Net 30). Not applicable at his size. **Do the free prerequisite anyway:** complete Meta Business Verification, so that when the banner appears he is ready the same day.

**4. Wayflyer — right size, wrong country. One email, low expectation.**
$10k/month minimum and no personal guarantee are ideal for him. Greece is simply not on their market list. Ask; market lists do change.

## B) CLEARLY UNLIKELY — DO NOT WASTE TIME

| Provider | Specific reason |
|---|---|
| **Clearco** | Requires US incorporation + US business bank account, **and** $100k/month revenue. Two disqualifiers. |
| **8fig** | Business must be based in US or Canada. He would pass the revenue test — geography alone kills it. |
| **Uncapped** | $100k/month minimum revenue. The $10k exception is Amazon sellers only. |
| **Silvr** | Absorbed by Karmen Nov 2025; now requires registration **in France**. |
| **Karmen** | France only, EUR 300k annual revenue. |
| **Ampla** | Acquired by FundThrough April 2025; wound down its lending. |
| **Settle** | US CPG inventory financing, not ad spend. |
| **Shopify Capital** | Requires a Shopify store. His store is custom-built. Structurally impossible. |
| **Meta credit line (today)** | Invitation-only, gated on spend volume he does not have. |

## C) EXACT APPLICATION URLS

- Juni — https://www.juni.co (Open account) · eligibility first: https://help.juni.co/en/articles/103054-which-companies-and-countries-does-juni-support · docs: https://help.juni.co/en/articles/103056 · pricing: https://www.juni.co/pricing
- Viceversa — https://goviceversa.com/revenue-based-financing-get-funded/
- Meta Business Verification — Meta Business Suite → Business settings → Security Centre (in his own logged-in account)
- Meta Monthly Invoicing (only if a banner appears) — Meta Business Suite → **Billing & payments** → https://business.facebook.com/billing_hub · docs https://www.facebook.com/business/help/663802094015925
- Wayflyer — https://wayflyer.com (long-shot enquiry)

## D) DOCUMENTS AND NUMBERS TO HAVE READY

**Entity and legal**
- Greek company registration — **ΓΕΜΗ** certificate / certificate of incorporation, showing legal name, number, registered address
- Greek **VAT number (ΑΦΜ / EU VAT)** — Meta requires a tax ID for invoicing
- Articles of association
- **Ultimate beneficial owner** details and shareholding structure (Juni is an EMI; full KYC/AML)
- Passport or Greek ID for each director/UBO, plus a proof of address under 3 months old
- Business IBAN in the company's name — **not a personal account.** This is where several applications die.

**Financial — have the actual numbers, not estimates**
- **Last 6–12 months of business bank statements** (PDF, from the bank, not screenshots)
- **Stripe payouts and gross volume, last 6–12 months** — most of these providers underwrite from the payment processor, so Stripe is his main evidence
- **Average monthly revenue**, last 6 months, month by month
- **Current monthly Meta ad spend**, last 3 months — this is the number Viceversa gates on
- **Blended ROAS / MER and CAC**
- **Gross margin per product** and **refund/chargeback rate** (chargeback rate is underwritten hard on dropship-style stores)
- Latest filed accounts if the company has them

**About the business**
- Website URL, what it sells, who the supplier is, fulfilment lead times
- Since his store is **custom-built, not Shopify**, he cannot use one-click platform connectors. He should expect to supply **Stripe read access plus bank statements manually**, and should say so up front so applications are not routed down a Shopify integration path that will fail.

## E) STEP-BY-STEP ORDER, AND WHY

**Step 1 — Settle the entity question first. Everything depends on it.**
Confirm whether Black Reaper trades as a Greek **IKE/EPE/AE** or as a sole trader (ατομική επιχείρηση). **If he is a sole trader, Juni and most of this list are closed to him**, and forming an IKE is the single highest-value action available — higher value than any application on this page. Do this before filling in one form.

**Step 2 — Complete Meta Business Verification (free, this week).**
It is the prerequisite for the credit line, it raises account trust, it reduces ban risk, and it costs nothing. Doing it first also means the ad account is clean before any financier inspects it.

**Step 3 — Write down the four numbers.**
Monthly revenue (6 months), monthly Meta spend (3 months), gross margin, chargeback rate. Every conversation below turns on these, and knowing them tells him immediately whether he clears Viceversa's EUR 10k bars — which may make Step 5 unnecessary for now.

**Step 4 — Email Juni and Viceversa **before** applying.**
Two short pre-qualification emails. To Juni: "Greek IKE, ecommerce, custom checkout on Stripe — is Meta ad billing a supported Invoice Credit use case, and what is your minimum?" To Viceversa: "Greek company, X revenue, Y marketing spend — am I above your bar?" **Why before:** a soft enquiry costs nothing, whereas a declined formal application is a data point on file and Juni charges EUR 79/month from the moment the account opens. Never pay a subscription to discover you are ineligible.

**Step 5 — Apply to Viceversa first if he clears EUR 10k/EUR 10k.**
Cheaper structure than Juni, no personal guarantee, no monthly platform fee, and the money is not repaid on a fixed date. But **get the fee percentage in writing before signing** — they do not publish it, which is the one real weakness in an otherwise good fit.

**Step 6 — Apply to Juni if Viceversa's bar is out of reach.**
Juni is the option that works at smaller scale and actually pays the invoice for him. Accept that 3%/month is expensive and only draw against ad spend he is confident will return within the 30–90 day window.

**Step 7 — Send the Wayflyer long-shot enquiry.** Five minutes, small chance, excellent terms if Greece ever opens.

**Step 8 — Revisit Meta invoicing every quarter.** Check Business Suite → Billing & payments for the banner. When it appears, take it immediately: it is free credit and it beats everything else on this page.

**The biggest obstacle, stated plainly:** his Greek, non-US, sub-scale position excludes him from the entire American half of this market (Clearco, 8fig, Settle, Shopify Capital) and his size excludes him from the large-advertiser half (Meta's own credit line, Uncapped). Forming a **Greek IKE** unlocks Juni immediately and cheaply. Forming a **US LLC** would unlock 8fig and eventually Clearco — but it brings US tax filing, a US bank account and real ongoing cost, and it is **not** worth doing purely to chase ad credit at his current revenue.
