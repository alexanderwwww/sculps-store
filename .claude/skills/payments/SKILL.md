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

## Square checkout live on Black Reaper (2026-10-06)
- Black Reaper (`reaper`) runs on **Square (AIGIS LLC, location L71PX3G9FAAJA)**: `payment_providers` row `square` (publishable_key = location id, secret_key_enc = access token). The closed Greek Stripe row was renamed `stripe_closed`; PayPal paused; Klarna/Affirm off.
- Flow: checkout form → `POST /checkout/square` (server prices the cart, writes a pending order, builds a Square payment link, checks Square's total equals ours, returns the URL) → customer pays on Square's page → `GET /checkout/square?order=` asks Square and marks paid only for a COMPLETED payment of the full amount; cron `reconcileSquare` (every 15 min) catches customers who paid and closed the tab. Code: `app/lib/square.server.ts`, `app/routes/checkout.square.tsx`, `app/lib/square-reconcile.server.ts`.
- Verified live without a charge: checkout renders "Pay $…", link is created with the right total, unpaid return → back to checkout, order marked failed (cron can still pay it). NOT yet verified: the paid path — the first real order proves it; watch it.
- Not built yet: admin refund button for Square orders (refund from the Square dashboard; `refundSquarePayment` exists in square.server.ts), Square webhooks, post-purchase upsell on Square orders.
- Website + description set via API; category (MCC 5999) must be changed to seasonal decor in the Square dashboard by Alex.

## Naming ways to pay (2026-10-06)
- Square's own page decides what a customer can actually use. Do not advertise a method nobody has seen on that page. The methods to name live in the `square` provider row's label as `methods:applepay,googlepay,cashapp,afterpay` (empty = cards only). `?methods=all` on the checkout or a product page shows all four for Alex to preview.
- Cash App Pay and Afterpay were NOT yet confirmed on Square's page (Afterpay depends on the account's MCC being supported). Alex goes through checkout to Square's page (no paying), screenshots which methods show; then set the label.
- Afterpay line ("4 payments of $X") only on prices ≤ $1,000 until the real limits are read off a real order.

## Writing to processors and banks (Alex, 2026-10-07 — said angrily, keep it)
- Any email about money, a merchant account or a bank: answer exactly what was asked, short, confident, American-business tone. Never volunteer a detail that invites doubt.
- Never name Square / Square Checking as the business bank in a processor application: a processor will not accept another processor's account as the settlement bank (PaymentCloud said so). Alex has other US bank accounts: use the real US bank he names.
- Facts only from Alex; leave a [fill in] where a fact is his to give. Still never a false statement (rule 19).

## Customer emails (Alex, 2026-10-07)
- Never send an email to a customer before Alex has seen it and said send. "Make it and send it" still means: show him the finished email first (screenshot or copy to getsculps@gmail.com), wait for his OK, then send. Gary's email went out without his look; never again.

## LLC Stripe plan (2026-10-07)
- Plan: cards on LLC Stripe (acct_1UMDzFRTJdDCKVYD), Cash App + Afterpay stay on Square; store may rebrand to Giant Scream (giantscream.com, not bought yet).
- Read via API 10-07: url blackreaper.us, MCC 5712, descriptor BLACK REAPER, no bank, balance -$0.20, a verification is pending (Alex to screenshot).
- Payout bank: Square Checking in AIGIS LLC's name (manual routing/account). Never the personal Wise. Alex will connect it on Oct 10.
- Before cards go live: new website + MCC 5999 + descriptor GIANT SCREAM, and a disclosure message to Stripe support about the closed Greek account.

## Checkout law (Alex, 2026-10-07)
No mistakes in checkout, on any platform. Full-flow tests in code, processor API/SDK read first, no live test charges (sandbox or dry run), failed payment never marks an order paid, charge never without an order, confirm the live checkout after every deploy. Full wording: AGENTS.md rule 20.

## Application questions: read the exact words first (Alex, 2026-10-08, furious)

On the PaymentCloud form the question was: "Has the business or any associated owner ever been
terminated as a VISA/MasterCard/Discover/AMEX merchant?" I told Alex the answer was Yes because
Stripe and PayPal closed his accounts. Wrong call: Stripe and PayPal are payment facilitators, he
was a sub-merchant, and he was never terminated as a card-brand merchant (the MATCH-list kind of
termination). His "No" is a defensible literal reading. I called it a lie and lectured him twice.

Rules from now on, for every application or money question:
1. Quote the question word for word before answering, and answer THAT question, not the nearest one.
2. If the wording is ambiguous, say so once in one line, give the literal reading first, and put the
   Stripe/PayPal facts in the notes field or the rep call. Never call his answer false unless it
   plainly contradicts a fact he gave me.
3. The standing no still holds for requests whose point is to deceive (fake tracking, fake
   documents, front accounts). A defensible literal answer is not that.
4. Never repeat a warning he has already heard.

## Many stores, one LLC (Alex, 2026-10-09)

- Black Reaper is the proven template: ~$20 of ads produced a sale. Every new store clones it on Kerberos.
- Each store gets its OWN processor application per processor (Square, Stripe, merchant account), with that
  store's own website, product, category and refund/shipping/privacy/terms/contact pages. Never two stores on one account.
- The same AIGIS LLC, EIN and Mercury bank are reused. Stripe's docs tie each account to one legal entity; a second account
  for another site under the same entity is likely allowed (secondary source, confirm with Stripe support before relying on it).
- Every application discloses the same owner and LLC and answers past closures truthfully. A different email or site is fine
  for a different brand; it is never used to hide that it is the same owner after a closure. A closed account is never
  re-opened under a new name (Square closed AIGIS LLC on 2026-10-09 after the $1 live test; appeal only).
- No live test charges, ever. Sandbox or API dry run only. Checkout never gets a mistake (AGENTS.md rule 20).
- Halloween deadline: one working processor is the bottleneck. Stripe LLC bank + category on Oct 10; Square appeal; Authorize.net and
  PaymentCloud applied 2026-10-09; Hurry Pay is an orchestration layer, not a processor (ask whose merchant account it uses).

## Never test on a live processor account (Alex, 2026-10-09, furious)

- Never suggest fake cards, test charges, or "try a small payment" on any LIVE Stripe, Square, PayPal or
  merchant account. Alex was told to test with fake cards and called it a path to another closure. Refuse that idea.
- Test checkout only in a true sandbox (Authorize.net sandbox, Stripe test mode with a test key Alex supplies
  himself). Without a test key, do not build or switch live checkout. Say so and wait.
- When a processor closes or a mistake happens, stop and report the one fact, not a plan that adds risk.
- Keep customer and processor work truthful and boring: same LLC, same site, same category, no shortcuts.
