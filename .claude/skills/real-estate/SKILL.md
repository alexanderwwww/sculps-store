---
name: real-estate
description: US real-estate wholesaling engine and playbook — the end-to-end process, the honest automate / can't-automate split, the free lead engine, and the path to doing it from Greece. Use whenever the work touches wholesaling, assigning contracts, motivated sellers, ARV/MAO/70% rule, cash-buyer lists, tax-delinquent or pre-foreclosure lists, or Alex doing US real estate remotely. This is Engine 7 in THE MAP. Every number here is from a fetched page with its URL — do not re-derive.
---

# real-estate — US wholesaling engine (built 2026-11-15)

**What it is.** Wholesaling: get a distressed/undervalued US house under a purchase contract at a low price, then sell (assign) that contract to a cash buyer for a fee before closing. You never buy the house, never take title, never need a mortgage. Only real cash at risk is the earnest-money deposit. Reported fee per deal: **$5,000–$20,000** ([Real Estate Skills summary via search](https://www.realestateskills.com/blog/how-to-wholesale-step-by-step); also brain row #10 source [beancount.io](https://beancount.io/blog/2026/09/25/real-estate-wholesaling-assignment-fees-state-disclosure-laws-bookkeeping-guide)).

**The honest headline (tell Alex this first).** A bot can do the *paperwork-and-data* half: find leads, comp them, build buyer lists, draft outreach. A bot **cannot legally or practically** do the *human-and-money* half from Greece: phone/talk a distressed seller into a deal, sign contracts, hold a US entity + US phone, and be the local person a title company deals with. So this engine makes Alex a **deal-sourcing machine with a human closer bolted on** — the closer is either Alex on a US phone, or a US-based partner/acquisitions VA who splits the fee. Without that human, it produces leads, not money.

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
| 1 | Pick 1 non-restricted target state + county | drafts shortlist w/ reasons | **picks** |
| 2 | Confirm that state's wholesaling/licensing rules with its commission | finds the page/number | **reads, decides** (attorney if unsure) |
| 3 | Form US LLC + EIN | drafts the filing steps/provider | **signs up, pays filing** |
| 4 | Open Mercury/Wise US bank account | preps documents list | **applies** |
| 5 | Get a US phone/VoIP line | lists options that serve non-US | **sets up** |
| 6 | Line up a US title company / closing attorney in the county | finds 3 candidates | **calls/picks one** |
| 7 | Build the free lead list (tax-delinquent + pre-foreclosure + long-DOM) | **runs the engine (§3)** | — |
| 8 | Comp the top 10 & compute MAO | **drafts comps + MAO** | spot-checks |
| 9 | Build the cash-buyer list from deed records | **builds it** | — |
| 10 | Contact top sellers, make offers, get 1 under contract | drafts the scripts/offers | **makes the calls, signs** |

Cheapest first real step = **#1, #2, #7**: all $0, all bot-led. The only early cash is LLC filing + earnest money once a real deal appears.

## Risks (say them plainly)
- **Biggest risk: legal.** Unlicensed wholesaling is restricted or banned in several states and the line (marketing contract vs. brokering) is easy to cross. One wrong state or one undisclosed deal = fines / cease-and-desist. Always route the state rule and the contract through a licensed attorney.
- **Second: no human closer = no money.** Leads without someone to call sellers and sign produce nothing.
- **Third: from Greece**, banking/phone/FIRPTA friction can stall or eat a deal. Prove the US footprint before scaling marketing spend.
