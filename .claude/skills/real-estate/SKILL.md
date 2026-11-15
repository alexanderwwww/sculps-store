---
name: real-estate
description: US real-estate wholesaling engine and playbook — the end-to-end process, the honest automate / can't-automate split, the free lead engine, and the path to doing it from Greece. Use whenever the work touches wholesaling, assigning contracts, motivated sellers, ARV/MAO/70% rule, cash-buyer lists, tax-delinquent or pre-foreclosure lists, or Alex doing US real estate remotely. This is Engine 7 in THE MAP. Every number here is from a fetched page with its URL — do not re-derive.
---

# real-estate — US wholesaling engine (built 2026-11-15)

**What it is.** Wholesaling: get a distressed/undervalued US house under a purchase contract at a low price, then sell (assign) that contract to a cash buyer for a fee before closing. You never buy the house, never take title, never need a mortgage. Only real cash at risk is the earnest-money deposit. Reported fee per deal: **$5,000–$20,000** ([Real Estate Skills summary via search](https://www.realestateskills.com/blog/how-to-wholesale-step-by-step); also brain row #10 source [beancount.io](https://beancount.io/blog/2026/09/25/real-estate-wholesaling-assignment-fees-state-disclosure-laws-bookkeeping-guide)).

**Gates cleared (2026-11-15).** Alex now has the **US LLC**, a **US phone**, and **signs the contracts himself**. So §4 (the Greece setup) is mostly done — the engine runs at operator level: Aquarius sources + comps + builds the buyer list + drafts every script, and Alex (or a US acquisitions VA) makes the seller calls and signs.

**The honest headline (tell Alex this first).** A bot can do the *paperwork-and-data* half: find leads, comp them, build buyer lists, draft outreach. A bot **cannot legally or practically** do the *human-and-money* half: phone/talk a distressed seller into a deal, sign contracts, be the party the title company deals with. So this engine is a **deal-sourcing machine with a human closer (Alex or a paid US VA)**. Without that human on the phone, it produces leads, not money.

**Not legal advice.** Wholesaling legality and licensing vary by state and change (CT now requires registration — see §5). Every "you may / must" below is **verify with a licensed attorney or the state real-estate commission** before acting.

---

## 1. THE PLAYBOOK — the exact end-to-end process (2026)

| # | Step | Who/what does it | Real cost |
|---|------|------------------|-----------|
| 1 | **Find a motivated seller** (distressed, behind on taxes, pre-foreclosure, tired landlord, inherited/vacant) | Lead engine (§3) surfaces the list; a human/VA makes contact | $0 for free public lists; marketing (mail/calls) if scaled |
| 2 | **Analyze & comp** — estimate ARV (After-Repair Value) from recent comparable sales, estimate repair cost, run the offer formula | Bot can draft the comp + MAO; human sanity-checks | $0 (free comps) |
| 3 | **Make the offer** at or below MAO | Human (call/text/email the seller) | $0 |
| 4 | **Get it under contract** — signed purchase & sale agreement with an **assignment clause** and an **inspection/option period** so you can walk | Human signs (e-sign ok); attorney/title reviews | **Earnest money $500–$2,000**, often non-refundable after the option period ([resimpli](https://resimpli.com/blog/is-wholesaling-real-estate-legal-in-texas/)); optional **option fee $100–$200** ([same](https://resimpli.com/blog/is-wholesaling-real-estate-legal-in-texas/)) |
| 5 | **Find a cash buyer** from your buyer list (fix-and-flip investors, landlords) | Bot builds/maintains the list; human sends the deal | $0 |
| 6 | **Assign the contract** (sell your contract rights to the buyer) OR **double-close** | Human + title company / closing attorney | Assignment: title/closing fees. Double-close: **two sets of closing costs** + short-term funding ([resimpli](https://resimpli.com/blog/is-wholesaling-real-estate-legal-in-texas/)) |
| 7 | **Get paid** — your fee is the spread between your contract price and the buyer's price, paid at closing by the title company | Title company / closing attorney | — |

### The money math (the 70% rule / MAO)
- **MAO = (ARV × 70%) − Repair Costs**, then subtract your own fee if assigning. ([resimpli](https://resimpli.com/blog/is-wholesaling-real-estate-legal-in-texas/))
- Worked example (resimpli): ARV **$250,000**, repairs **$40,000**, your fee **$10,000** → max offer to seller **$125,000**. ([resimpli](https://resimpli.com/blog/is-wholesaling-real-estate-legal-in-texas/))
- Some buyers use **65%** instead of 70% in hot markets; 70% is a default, not a law. ([InvestorMint via search](https://investormint.com/entrepreneurship/real-estate-wholesaling-for-beginners-2026))

### Assignment vs. double-close
- **Assignment** (the common path): you sell the contract directly to the end buyer; your fee shows on the paperwork. Cheapest. ([resimpli](https://resimpli.com/blog/is-wholesaling-real-estate-legal-in-texas/))
- **Double-close**: you buy and immediately resell in two back-to-back deals; keeps your margin private but you pay two sets of closing costs and may need transactional funding. Used when the spread is large or when the state/buyer restricts assignment. ([resimpli](https://resimpli.com/blog/is-wholesaling-real-estate-legal-in-texas/))

### Disclosure (the legal line that keeps it legal)
- Marketing a property you have **no contract on**, or negotiating on a seller's behalf **for a fee**, is brokering and **needs a real-estate license**. You market the *contract*, not the house. ([resimpli](https://resimpli.com/blog/is-wholesaling-real-estate-legal-in-texas/))
- Several states require written disclosure that you hold only an equitable/contract interest and intend to assign (TX cites Occupations Code §1101.0045). **Verify the exact statute with the state commission.** ([resimpli](https://resimpli.com/blog/is-wholesaling-real-estate-legal-in-texas/))

---

## 1B. MASTER OPERATING RULES — act like a seasoned operator from day one

These are the judgment calls operators at scale actually make. Aquarius uses these thresholds; it does NOT re-derive them.

### The ONE-LINE DEAL FILTER (buy vs pass)
> **Pass unless `(ARV × 0.70) − repairs − your fee ≥ seller's likely price`, with ARV built from 3+ sold comps under ~9 months old and a repair number you'd bet on. If the spread is thin or the ARV leans on one comp or on "the area is trending up" — pass.**

Everything below supports that one line.

### Comping ARV like a pro (not Zestimate)
- Use **actual SOLD comps**, not active listings, not Zestimate. Match **beds, baths, square footage, floors**; prefer sales **< 9 months old**; same neighborhood/subdivision. ([newsilver](https://newsilver.com/the-lender/what-is-the-70-rule-in-house-flipping/))
- **Base ARV on sold prices only — never add a few % for "the area is trending up."** ([newsilver](https://newsilver.com/the-lender/what-is-the-70-rule-in-house-flipping/))
- When comps give a range, **take the LOWER end** — err cautious or you give away your profit. ([BiggerPockets via search](https://www.biggerpockets.com/blog/70-percent-rule))
- Thin or single-comp ARV = red flag; the 70% rule is worthless if you can't nail ARV and repairs. ([BiggerPockets via search](https://www.biggerpockets.com/blog/70-percent-rule))

### The MAO math (what pros actually do)
- **MAO = (ARV × 0.70) − Repairs − Your Fee.** The 30% haircut covers **holding + selling + financing costs + the flipper's profit** — it is NOT all profit, which is why you can't shrink it. ([BiggerPockets via search](https://www.biggerpockets.com/member-blogs/16427/106966-the-70-rule-in-house-flipping-and-how-100-financing-changes-it))
- **Tier the %:** beginners stay near 70%; experienced flippers in hot markets will pay **75–80%** of ARV minus repairs, so in a strong market you have room to offer the seller a bit more and still assign. Use **65%** on high-dollar homes or slow markets where the flat 30% leaves the flipper too little. ([newsilver](https://newsilver.com/the-lender/what-is-the-70-rule-in-house-flipping/))
- Worked example: ARV **$350,000** × 0.70 − **$65,000** repairs = **$180,000** max. ([newsilver](https://newsilver.com/the-lender/what-is-the-70-rule-in-house-flipping/))

### Repair estimate rules of thumb
- Quick band: **~$5/sq ft** for light (paint + carpet) up to **$40+/sq ft** for major (electrical/plumbing/roof). Always include **materials + labor + permits + an overrun cushion**. ([search: howtostartanllc / 70% rule guides](https://howtostartanllc.com/real-estate-investing/house-flipping-potential))
- **Don't lean on per-sq-ft guesses until you have reps** — they're a sanity check, not the estimate. Verify big-ticket items (roof, HVAC, foundation) individually. ([same](https://howtostartanllc.com/real-estate-investing/house-flipping-potential))

### Seller outreach & qualifying (Brent Daniels / TTP method)
- **Pre-qualify every seller on the 4 pillars: Condition, Timeline, Motivation, Price.** Only chase a lead (and only book a signing) once you know the price and the other three. ([disruptors](https://disruptors.com/episodes/how-brent-daniels-generated-1-million-in-fees-with-one-simple-concept))
- **Opener (role-play version):** introduce yourself by name, say you're calling "out of the blue" about their specific property, and ask **"would you consider an offer on it?"** The six answers back are *yes / no / maybe / how much / how'd you get my number / who are you* — all six are fine; keep talking on anything but a hard no. ([disruptors](https://disruptors.com/episodes/how-brent-daniels-generated-1-million-in-fees-with-one-simple-concept))
- **Volume reality (so Alex isn't surprised):** ~**15 contacts/hour** with real owners → ~**1 qualified lead/hour**; ~**3 hrs/day (~15 hrs/wk)**. Deal yield today ~**1 per 150–200 calls** on driving-for-dollars lists (probate converts better). Avg time first-call-to-close ~**150 days**; **42%** close under 90 days. Avg deal ~**$23,000**. A dialer ~$150, numbers ~$0.25 each (~$250 → 1,000 leads to call). ([disruptors](https://disruptors.com/episodes/how-brent-daniels-generated-1-million-in-fees-with-one-simple-concept))
- **Robo-dialing distressed owners is out** (TCPA risk + it doesn't close) — this is the human step; Aquarius drafts the call sheet and scripts, a person dials.

### Cash-buyer list — build it FAST (dispo side)
- **Fastest route: start with buyers who have already proven they can close, found in public deed records.** An all-cash buyer = a deed with **no mortgage recorded**. ([dealmachine](https://www.dealmachine.com/blog/the-way-90-of-real-estate-investors-start-with-anisa-crespo))
- Method: pick **~3 ZIPs** you know, pull recent sales from county recorder, keep deeds with **no loan**, narrow to **repeat/multi-property buyers**, skip-trace for a phone. ([dealmachine](https://www.dealmachine.com/blog/the-way-90-of-real-estate-investors-start-with-anisa-crespo))
- **You only need ~25–50 qualified buyers (some operators run on 3–4 strong ones).** Quality over size — only send a deal to a buyer whose **buy box** (ZIPs, property type/condition, price range, close speed) matches. ([dealmachine](https://www.dealmachine.com/blog/the-way-90-of-real-estate-investors-start-with-anisa-crespo), [BiggerPockets via search](https://www.biggerpockets.com/forums/93/topics/348723-the-fastest-ways-to-build-a-cash-buyers-list-as-a-wholesaler))
- Record per buyer: name + entity, target ZIPs, type/condition, price range, close speed, proof-of-funds, preferred title company. ([dealmachine](https://www.dealmachine.com/blog/the-way-90-of-real-estate-investors-start-with-anisa-crespo))
- Also mine **local REIAs, investor-friendly agents, hard-money lenders, title reps** for active buyers. ([search: resimpli](https://resimpli.com/blog/6-tools-and-tactics-to-find-reliable-cash-buyers-for-wholesale-deals/))

### Assignment vs double-close — the decision
- **Default = assignment** (cheapest, one closing). ([resimpli](https://resimpli.com/blog/is-wholesaling-real-estate-legal-in-texas/))
- **Double-close when:** the **spread/fee is large** and you don't want the buyer to see your margin, OR the **state/buyer/title company restricts assignment**. Cost = two sets of closing costs + transactional funding. ([resimpli](https://resimpli.com/blog/is-wholesaling-real-estate-legal-in-texas/))

### Numbers that KILL a deal (auto-pass)
- Spread after `ARV×0.70 − repairs − fee` is **≤ 0 or razor-thin**.
- ARV rests on **one comp**, a comp **> 9 months** old, or an **appreciation add-on**.
- Repairs you **can't verify** on the big items (roof/HVAC/foundation/plumbing) — unknown rehab = unknown deal.
- **No cash buyer whose buy box fits** this ZIP/type — a deal you can't dispo is not a deal.
- **Title issues / liens that exceed the spread**, or a seller who won't sign an **inspection/option period** (your only free exit).
- Seller's **price is above MAO and won't move** — no motivation, pass; don't fall in love with it.

### Red flags
- Occupied by tenants/owner refusing access (can't verify condition).
- "I just want to see what it's worth" (tire-kicker, not motivated).
- Clouded title, probate not yet granted, co-owners not all on board.
- Any state where you're not sure wholesaling is allowed (see §5) — stop, confirm with the commission.

---

## 2. WHAT CAN BE AUTOMATED vs NOT (honest)

**Aquarius / a script CAN do, from free public data:**
- Pull and dedupe lead lists (tax-delinquent, pre-foreclosure, long-days-on-market, FSBO) — §3.
- Comp a property and compute ARV/MAO from public comparable sales (draft, human-verified).
- Build and sort a cash-buyer list (recent cash purchasers, LLC buyers from county deed records).
- Draft outreach (mail/text/email copy) and rank leads by motivation signal.
- Track the pipeline and write results to the brain.

**A human MUST do (bot cannot, legally or practically):**
- **Phone/talk to distressed sellers.** Robo-dialing distressed homeowners risks TCPA liability and simply does not close; closing is a human conversation. (Verify TCPA rules with an attorney.)
- **Sign the purchase contract and the assignment.** A principal must sign; e-sign is fine but a person is responsible.
- **Hold a US entity + US phone + US bank** to transact (see §4). Aquarius has no legal identity.
- **Be the party the title company / closing attorney deals with.**
- **Licensing in restricted states** — some states require a license or registration to do this at all (§5).

**Rule of thumb:** automate everything up to and including "here is a comped deal and a cash buyer who wants it." The signature and the seller call are Alex's (or a paid US closer's).

---

## 3. THE LEAD ENGINE — free public sources + script spec

Goal: surface undervalued / motivated-seller properties automatically from FREE public data, so Alex only ever sees a short ranked list. **The county is the free route; paid tools (PropStream, BatchLeads, REsimpli) only add convenience + skip-tracing.**

### Free data sources (with how to pull each)

| Signal | Where it lives (free) | How to pull | Note |
|--------|----------------------|-------------|------|
| **Tax-delinquent** | County **Treasurer / Tax Collector** office | Request the delinquent-tax list by mail (check + letter of instruction) or phone/credit-card; emailed or on CD. Cost: often free–$500; typical ~**25¢/parcel**, author caps at $500/list. ([retipster](https://retipster.com/delinquent-tax-list)) | List has owner name, purchase date/price, taxes owed; usually **no phone** — skip-trace needed. ([retipster](https://retipster.com/delinquent-tax-list)) |
| **Pre-foreclosure / lis pendens / notice of default** | County **Recorder / Clerk / court** (judicial states: FL, NY, IL go through court); also legal section of local newspaper | Search recorder/clerk records for lis pendens & NOD filings | Free pull gives filing, parcel, owner name — **no working phone**. ([search summary: Fit Small Business / goliathdata](https://fitsmallbusiness.com/pre-foreclosure-leads/)) |
| **Code violations / condemned / vacant** | Local **code-enforcement agency** | Many cities publish open-violation lists / open-data portals; otherwise request from code enforcement | PropStream guide names "contact the local code enforcement agency" for open violations. ([propstream](https://www.propstream.com/real-estate-investor-blog/an-investors-guide-to-sourcing-tax-delinquent-properties-before-the-competition)) |
| **FSBO (for sale by owner)** | Zillow FSBO, Craigslist, FSBO.com | Listings lingering >45 days signal openness to negotiate (heuristic). ([search: batchleads](https://batchleads.io/blog/how-to-find-expired-listings)) | Owner already wants to sell |
| **Expired / withdrawn listings** | MLS hot-sheets (needs an agent) | Daily alerts filtered by zip/price/days-on-market | Shows original price, price history, DOM. ([search: batchleads](https://batchleads.io/blog/how-to-find-expired-listings)) |
| **Long days-on-market** | Zillow / Redfin public listings | Target listings cold **90+ days** with no updates, or over the area's average DOM. ([goliathdata](https://goliathdata.com/early-seller-signals-on-zillow)) | Check Zillow/Redfin **Terms of Use** before any scraping — may forbid automated access |
| **Cash buyers (for the buyer list)** | County **deed/recorder** records | Pull recent **cash / LLC** purchases in the target zip; those owners are your buyers | Free; build the demand side the same way |

### Script spec (documented, NOT live-run — needs Alex's go + county choice)
```
engine: real-estate/lead-engine  (spec only — do not run without Alex picking a county)
inputs:  target_county, target_zip, max_arv, min_spread
sources: [county_treasurer_delinquent, county_recorder_lispendens,
          city_code_enforcement, zillow_fsbo_longdom, redfin_longdom, deed_cash_buyers]
steps:
  1. pull each source (respect each site's ToS; county offices are public record)
  2. normalize to {parcel, address, owner, signal, signal_date}
  3. dedupe by parcel; score motivation = f(#signals, recency, taxes_owed)
  4. comp: pull 3-5 recent nearby sales -> ARV; estimate repairs by band
  5. MAO = ARV*0.70 - repairs - target_fee ; keep only rows where likely price <= MAO
  6. output ranked list -> brain + a human-ready call sheet (NO auto-dialing)
guardrails: no robocalls (TCPA), no scraping a site whose ToS forbids it,
            human verifies every comp before any offer.
```
Start with **one county**, free lists only. Prove one assignment before paying for any tool.

---

## 4. DOING IT FROM GREECE (virtual wholesaling)

Alex is in Athens; the deals are US. This is "virtual wholesaling" — finding, contracting and assigning without being on the ground. It works, but it is harder and needs a US footprint. ([BiggerPockets / resimpli virtual-wholesaling threads via search](https://resimpli.com/blog/how-to-wholesale-real-estate-virtually/))

What Alex specifically needs:
1. **A US LLC** — register in a wholesaler-friendly state; non-residents can form one and get an **EIN** (apply by fax/phone since the online EIN form needs an SSN). ([llcuniversity](https://www.llcuniversity.com/foreigners/open-us-bank-account-llc-non-resident/))
2. **A US business bank account** — non-residents can open **Mercury** online with EIN + formation docs + passport, **but approval is not guaranteed** and some countries are excluded; Wise Business is the fallback. ([businessanywhere](https://businessanywhere.io/open-mercury-account-us-llc-non-resident/), [llcuniversity](https://www.llcuniversity.com/foreigners/open-us-bank-account-llc-non-resident/))
3. **A US phone number** — **Google Voice consumer numbers are US-residents-only and need an existing US number to verify** (catch-22). Use a US VoIP that serves non-residents, or route through a US-based VA/partner. ([multiple guides via search](https://bubblyphone.com/hub/google-voice-availability-by-country))
4. **A US-based title company or closing attorney** in the target market — they run the closing and pay the fee. Some metros require an **attorney** to close, others a title company. ([BiggerPockets via search](https://resimpli.com/blog/how-to-wholesale-real-estate-virtually/))
5. **A human closer on the ground / US acquisitions VA** — to call sellers and be the local face. Multiple sources: remote wholesaling needs a reliable local team. ([search summary](https://resimpli.com/blog/how-to-wholesale-real-estate-virtually/))
6. **Cross-border tax check — FIRPTA & US-source income.** FIRPTA imposes **15% withholding** when a **foreign person sells a US real property interest** (reported on IRS Form 8288, within 20 days). Alex assigning a *contract* (never taking title) is a different animal — but if he ever **double-closes** (takes title then resells), FIRPTA and withholding can bite and may exceed the spread. His assignment income is also US-source. **Verify with a cross-border CPA before closing any deal.** ([freemanlaw FIRPTA](https://freemanlaw.com/firpta/))

---

## 5. STATE FILTER (from brain row #12 — confirm with each commission)

Avoid or get licensed first in restricted states (brain row #12, 2026):
- **IL** — ~1 deal/yr unlicensed; **OK** — <5/yr; **PA** — commission cites unlicensed wholesaling as brokering; **CT** — wholesalers must **register with DCP** (from 2026-07-01, [CT DCP](https://portal.ct.gov/dcp/news-releases-from-the-department-of-consumer-protection/2026-news-releases/real-estate-wholesalers-required-to-register-with-dcp?language=en_US)); **KY** — no public ads without a license; **SC / NM / MD** — restricted.
- Pick a landlord-friendly, high-inventory, **non-restricted** state with clear assignment rules. **Confirm the chosen state with its real-estate commission before the first deal.**

---

## 6. FIRST 10 STEPS — who does what

| # | Step | Aquarius (bot) | Alex (once) |
|---|------|----------------|-------------|
LLC, US phone and Alex-signs are DONE — so the live sequence is:

| # | Step | Aquarius (bot) | Alex (once) |
|---|------|----------------|-------------|
| 1 | Pick 1 non-restricted target state + 3 ZIPs | drafts shortlist w/ reasons | **picks** |
| 2 | Confirm that state's wholesaling rules with its commission | finds the page/number | **reads, decides** (attorney if unsure) |
| 3 | **Build the cash-buyer list FIRST** (deeds w/ no mortgage, repeat buyers, 25–50) | **builds it from county records** | — |
| 4 | Build the free lead list (tax-delinquent + pre-foreclosure + code + long-DOM) | **runs the engine (§3)** | — |
| 5 | Comp the top 10, compute MAO, apply the deal filter | **drafts comps + MAO, ranks** | spot-checks |
| 6 | Draft the 4-pillar call sheet + offer scripts | **writes them** | — |
| 7 | Call top sellers, pre-qualify, make offers | drafts/updates scripts | **makes the calls** |
| 8 | Get 1 under contract w/ assignment clause + option period | drafts the contract | **signs** (attorney reviews) |
| 9 | Match it to a buyer in the list, send the deal | **matches + sends** | confirms |
| 10 | Assign (or double-close), close at the title company, get paid | preps the assignment | **signs, collects fee** |

Cheapest first real step = **#1–#4**: all $0, all bot-led. **Build the buyer list before the lead list** — knowing who buys what, where, tells you which leads are even worth comping. Only cash at risk is **earnest money ($500–$2,000)** once a real deal is signed.

## Risks (say them plainly)
- **Biggest risk: legal.** Unlicensed wholesaling is restricted or banned in several states and the line (marketing contract vs. brokering) is easy to cross. One wrong state or one undisclosed deal = fines / cease-and-desist. Always route the state rule and the contract through a licensed attorney.
- **Second: no human closer = no money.** Leads without someone to call sellers and sign produce nothing.
- **Third: from Greece**, banking/phone/FIRPTA friction can stall or eat a deal. Prove the US footprint before scaling marketing spend.
