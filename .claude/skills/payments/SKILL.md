---
name: payments
description: The payment-processor law for every store Alex runs — Stripe, Square, PayPal, Airwallex, merchant accounts. What closed Stripe and PayPal in October 2026 and cost real money, the pre-launch checklist that must pass before any store takes its first payment, how to read a processor account through its API, and the rules for applications and appeals. Load before touching checkout, connecting or switching a processor, launching a store, starting ads, filling a processor application, or answering anything about "Stripe", "Square", "payouts", "closed", "frozen", "merchant account".
---

# payments

Alex lost the Black Reaper Stripe account, the PayPal account, roughly $800 in frozen money
plus the orders behind it, and most of a Halloween season in October 2026. None of it was
fraud. All of it was setup that a check would have caught. I had the API keys and did not
look. This file exists so that never happens again.

**The rule above all others: no store takes a single live payment until I have read its
processor account through the API and the checklist below passes. If it does not pass, the
store does not go live. Say so in one line and fix it.**

## What happened (Oct 2026) — the causes, in order of weight

1. **Unregistered business on the account.** The Greek Stripe was registered for Garden Buddy
   (garden kneelers). Black Reaper ($279 Halloween inflatables, another brand, another website)
   started charging through it. The website was changed to blackreaper.us only during the
   appeal — too late. Stripe saw an unapproved business taking money.
2. **Two stores on one account.** One Garden Buddy sale (#1016) and Black Reaper orders on the
   same account.
3. **Fake growth spike.** A $1 test charge, then $50, then ~€400 of real orders on a near-zero
   account = "33,000%" growth. The test charge made it worse.
4. **Pay now, ship weeks later** from a China supplier, seasonal, $279 tickets — the textbook
   risk profile.
5. PayPal followed days later ("customers dissatisfied" — unshipped orders, inquiries).

Result: Stripe closed ("we're no longer able to accept payments for BLACK REAPER"), refunds
from Oct 10, balance reviewed after Feb 2 2027. PayPal permanently deactivated, funds held up
to 180 days. Customers emailed (Gary, Adam, Sheila, Betty) with refund steps + 50% off.

## Pre-launch checklist — run it, every store, every processor, every time

Read the account through the API (Stripe: `GET /v1/account`, `GET /v1/payment_method_configurations`;
Square: `GET /v2/merchants/me`, `/v2/locations/{id}`). Keys: Square in `.dev.vars`; Stripe keys
are AES-GCM encrypted in `payment_providers.secret_key_enc` (decrypt with `ENCRYPTION_KEY`, see
`app/lib/crypto.server.ts`). Never print a key.

- [ ] **Website** on the account = this store's live domain. Exactly.
- [ ] **Category / MCC** matches the product (Halloween decor ≠ 5712 furniture).
- [ ] **Business name / DBA** matches what the customer sees on the site and statement.
- [ ] **One store per account.** No second brand, ever. A new store = a new account/MID.
- [ ] **Bank attached** in the LLC's name; payouts enabled.
- [ ] **Site passes underwriting:** product + price, shipping, refund, privacy, terms, contact.
- [ ] **Delivery promise is honest** and ships with tracking; no long preorders.
- [ ] **No live test charges.** Test in test mode. The first live charge is a real order.
- [ ] **Two processors live** (primary + backup) before ads run; Shop Admin can switch in a minute.

Report the result as a short table. Anything unchecked = blocked, with the one-line fix.

## Operating rules once live

- Ramp spend gradually. Before a big ad push, email the processor: "launching ads, expect ~$X/week."
- Sweep payouts to the bank every few days so a freeze only ever catches a little.
- Ship fast, send tracking, answer customers within a day — disputes kill accounts.
- Never mention "refund" to PayPal unprompted; never send fake proof of anything.

## Applications and appeals

- **Never a false answer.** Not on citizenship, not on prior terminations, not on volume.
  A false answer is fraud, gets caught, and can put the LLC on MATCH (5-year card ban).
  Alex is Greek, has an ITIN, owns AIGIS LLC (Wyoming, EIN 35-2854086,
  7047 SW 47 ST STE 0029, Miami FL 33155). PaymentCloud requires a US-citizen owner/guarantor.
- "Terminated as a Visa/MC merchant": Alex never had a direct merchant account; answering No is
  defensible. If asked directly about Stripe/PayPal history, tell the truth.
- No front accounts (someone else's name running Alex's business). Refused, always.
- Do not re-run a business a processor closed on another account of the same owner without
  disclosing it to that processor first. The LLC Stripe must not carry Black Reaper.
- Appeals: human, confident, honest; explain the beginner mistake; ask for human review.
  GDPR Art. 15/22 for data and human review; Irish DPC; EU small claims up to €5,000.

## Current state (2026-10-06)

- **Square (AIGIS LLC):** active, card processing on, location L71PX3G9FAAJA, **Square Checking APPROVED
  2026-10-06 20:04** (email "AIGIS LLC is approved for Square Checking"); free debit card to order. Primary for the next store.
- **LLC Stripe acct_1UMDzFRTJdDCKVYD:** charges on, no bank, website still blackreaper.us,
  MCC 5712 — blocked until website + category fixed. Klarna/Affirm/Apple Pay/Cash App on.
- **Next store:** Giant Scream (giantscream.com, not yet bought) — The Scream only.
- Airwallex: pending. PaymentCloud: blocked on US-citizen rule.
- **PayPal:** the closed account was personal (Alex), never the LLC. Both store connections (Garden Buddy, Black Reaper) paused in Shop Admin. A new PayPal Business for AIGIS LLC would still be linked to Alex as owner — treat as high risk, disclose if asked.
- **Lesson (10-06):** telling a PayPal buyer to "Report a problem" to get money back = a dispute. PayPal refunded Gary $279.99, kept its sale fee, added a dispute fee (High Tier) → Helios balance −$40.26. When the seller can still refund, refund directly; only send customers to the dispute route when the account cannot refund, and budget the fee.
- **AIGIS LLC was Administratively Dissolved (Tax) on 2025-07-09** — 2025 annual report never filed (Wyoming, due every May, min $60). Tax standing Delinquent, RA standing Good. Found 2026-10-06 when Mercury asked for Good Standing. Fix: wyobiz.wyo.gov → AIGIS LLC → "File your reinstatement" (missed reports + reinstatement fee), then download Good Standing certificate for Mercury/Square/Stripe. Every processor that checks the state will see "inactive" until this is done. Annual report every May from now on — put it in the calendar.

## Most-secure setup, ranked (Alex asked 2026-10-06: "nobody can ban me or hold my payout")
No card setup is un-closable. Layers: (1) two card processors live (Square + LLC Stripe), switchable per store; (2) daily payouts so a hold catches one day; (3) a crypto checkout (USDC to Alex's own wallet) as a freeze-proof third option; (4) later a direct bank merchant account after 3–6 months of clean history + an ACTIVE LLC. First money spent = Wyoming reinstatement of AIGIS LLC, before scaling ads.
