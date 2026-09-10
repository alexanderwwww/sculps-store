# Shopify parity specification — Kerberos / Shop Admin

Scope: Settings → Payments, Domains, Meta pixel / Facebook & Instagram, Shipping & delivery, and the rest of Settings.
Goal is **identical behaviour**, not "similar". Where Shopify's exact admin copy is quoted it is in `"quotes"`; where the
copy comes from the Admin GraphQL enum rather than the screen, the enum name is given so the label can be matched later.

Repo files inspected: `app/routes/admin.settings.tsx`, `app/admin/settings-ui.tsx`, `app/routes/admin.meta.tsx`,
`app/lib/payments.server.ts`, `app/lib/cloudflare.server.ts`, `app/lib/meta.server.ts`, `app/lib/cart.server.ts`,
`app/db/schema.ts`, `app/routes/webhooks.stripe.tsx`, `app/routes/thanks.tsx`, `app/routes/storefront.tsx`.

Priority key: **P0** = a real store loses money / can't operate without it. **P1** = visible parity gap an operator
will hit weekly. **P2** = polish / completeness.

---

## 1. Payments

### 1.1 What Shopify does

**Settings → Payments** is a stack of cards, in this fixed order:

1. **Shopify Payments** (the primary provider card). When inactive the card is a marketing block with a
   `Complete account setup` / `Activate Shopify Payments` button. When active it shows:
   - the account's **payment methods** as a row of card-brand + wallet icons (Visa, Mastercard, Amex, Discover,
     Shop Pay, Apple Pay, Google Pay, Meta Pay), with a `Manage` button.
   - a **status line** — `Active`, or a yellow banner `Action required` when Shopify needs KYC documents, or
     `Payouts paused`.
   - `View payouts` link into Finances → Payouts.
2. **Payment capture method** (its own card under Shopify Payments → Manage → *Payment capture*). Radio group:
   - `Automatic` — "Automatically capture payment for all orders."
   - `Automatic at fulfillment` — "Automatically capture payment when the order is fully fulfilled." (Auth is held;
     Shopify warns authorizations expire — 7 days for most cards, 30 for some.)
   - `Manual` — "Manually capture payment for orders." Orders land as **Payment status: Authorized** with a
     `Capture payment` button on the order and a countdown "Authorization expires in N days".
3. **Supported payment methods** / **Additional payment methods** — third-party gateway cards, each with
   `Activate`, `Deactivate`, `Manage`. Each card shows the provider name, its icons, and, when active, the
   transaction fee line ("2% third-party transaction fee").
4. **Manual payment methods** — dropdown to add `Bank Deposit`, `Money Order`, `Cash on Delivery (COD)`, or
   `Create custom payment method`. Each has: **Custom payment method name**, **Additional details** (shown at
   checkout), **Payment instructions** (shown on the order confirmation page). Orders from these are
   **Payment status: Pending** with `Mark as paid` on the order.
5. **Payment customizations** (Functions) — a list; `Add customization`.
6. **Fraud prevention** — Shopify Protect card (`Protected` / `Not protected` per order), and fraud analysis
   toggle.
7. **Test mode** — inside Shopify Payments → Manage, a checkbox **"Enable test mode"** with the warning
   *"Test mode is enabled. Your store cannot accept real payments while test mode is on."* A persistent orange
   banner sits at the top of the admin and on the storefront checkout while it is on. Test cards: `4242…4242`
   succeeds, `4000 0000 0000 0002` declines, `4000 0000 0000 0119` errors.

**Refunds** are not on the Payments screen — they live on the order (`Orders → order → Refund`). The refund screen is:
- one row per line item with a **quantity stepper** capped at the unrefunded quantity, and a computed line amount;
- a **Refund shipping** field (editable, defaults to the shipping charged, capped at unrefunded shipping);
- a **Refund amount** box, pre-filled with the sum, editable **down** but never above `total - already refunded`;
- **Reason for refund** free-text (staff-only, never shown to the customer);
- a **Restock items** checkbox per line (checked by default when the item is tracked);
- a **"Send a notification to the customer"** checkbox;
- the button reads **`Refund $X.XX`** with the live amount in it.
After refunding, the order's payment status becomes `Partially refunded` or `Refunded`, the timeline gets
"A $X.XX USD refund was processed", and the refund appears in the order's payment summary as a negative row.

**Chargebacks / disputes**. A dispute creates an entry in **Orders** filtered by `Chargebacks and inquiries` and a
banner on the order. Statuses (`DisputeStatus` enum) are `NEEDS_RESPONSE`, `UNDER_REVIEW`, `ACCEPTED`, `WON`, `LOST`.
Type (`DisputeType`) is `INQUIRY` or `CHARGEBACK` — an inquiry can be answered without money moving; a chargeback
debits the account immediately and is credited back on `WON`. Every dispute has an **`evidenceDueBy`** date shown as
"Respond by <date>" and Shopify auto-submits on that date if the merchant hasn't. The evidence form
(`ShopifyPaymentsDisputeEvidence`) has exactly these fields:
- customer identity: `customerFirstName`, `customerLastName`, `customerEmailAddress`, `customerPurchaseIp`,
  `billingAddress`, `shippingAddress`
- product/service: `productDescription`, `accessActivityLog`, `serviceDocumentationFile`
- shipping: `fulfillments` (tracking number + carrier per fulfillment), `shippingDocumentationFile`
- policies: `refundPolicyDisclosure` + `refundPolicyFile`, `cancellationPolicyDisclosure` + `cancellationPolicyFile`
- rebuttals: `cancellationRebuttal`, `refundRefusalExplanation`
- catch-all: `uncategorizedText`, `uncategorizedFile`, `disputeFileUploads[]`
- `submitted: Boolean`, `evidenceSentOn`, `finalizedOn`
Merchant may also press **`Accept dispute`** (concedes; status → `ACCEPTED`).

**Payouts** (Finances → Payouts). Columns: **Date**, **Status**, **Charges**, **Refunds**, **Adjustments**, **Fees**,
**Total**. Payout status wording: `Paid`, `In transit`, `Scheduled`, `Failed`. Payout schedule setting:
`Every business day` / `Weekly` (pick day) / `Monthly` (pick date), with a minimum-amount note. Each payout opens to
its transaction list (order, type charge/refund/adjustment, amount, fee, net) and a CSV export.

### 1.2 What we have

`app/routes/admin.settings.tsx` → `PaymentsPane`, backed by `paymentProviders` in `app/db/schema.ts` and
`app/lib/payments.server.ts`.

- One provider card, Stripe only, hand-keyed: **Account name**, **Statement descriptor**, **Publishable key**,
  **Secret key** (encrypted, masked), **Webhook signing secret** (encrypted). Explicit "(primary)" in the title.
- **Connection** card: `Test connection` (hits `/v1/balance`), `Remove`, plus a webhook set-up block that prints the
  exact endpoint URL from `ADMIN_ORIGIN` and the four events
  (`payment_intent.succeeded, payment_intent.payment_failed, charge.refunded, charge.dispute.created`).
  Refuses to guess the URL — good, keep it.
- **Add a payment provider** card: three buttons, all disabled with honest tooltips (second Stripe, PayPal, manual).
- **Payment handling** card: `Payment capture` select with **only** `automatic` (manual deliberately not offered —
  `capture` column exists and `StripeProvider` honours `capture_method: manual`, and `capture()` is implemented, but
  no UI/order-side capture action exists); `Submit dispute evidence automatically` toggle (stored, **does nothing**);
  `Email me on every failed payment` toggle (stored, **does nothing**); export link.
- Refunds: `PaymentProvider.refund(intentId, amountCents?, idempotencyKey)` exists with a real idempotency key.
  `webhooks.stripe.tsx` handles `charge.refunded` correctly — `greatest()` on `refundedCents`, sets
  `refunded` vs `partially_refunded`. There is no per-line-item refund UI, no restock, no reason, no notify checkbox.
- Disputes: `charge.dispute.created` writes one timeline row `"Chargeback opened · <reason>"`. Nothing else — no
  dispute record, no status, no due date, no evidence, no `charge.dispute.closed`/`funds_withdrawn`/`funds_reinstated`.
- Payouts: nothing. No `payouts` table, no Stripe `/v1/payouts` call.
- Test mode: nothing. Nothing distinguishes `sk_test_` from `sk_live_` beyond the `/^(sk|rk)_/` check, and no banner.

### 1.3 Gap — Payments

1. **P0** — Add a `disputes` table (`id, storeId, orderId, providerDisputeId, amountCents, currency, reason,
   status, type, evidenceDueBy, evidenceSentOn, finalizedOn, createdAt`) and write it from
   `charge.dispute.created`. Statuses mirror Shopify: `needs_response | under_review | accepted | won | lost`;
   type `inquiry | chargeback`. Needs `app/db/schema.ts` + `webhooks.stripe.tsx`.
2. **P0** — Subscribe to and handle `charge.dispute.updated`, `charge.dispute.closed`,
   `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated` in `webhooks.stripe.tsx`; update
   `disputes.status` and the order timeline. Add these to `STRIPE_EVENTS` in `admin.settings.tsx`.
3. **P0** — Order refund screen (`app/routes/admin.orders.$id.refund.tsx`): per-line quantity steppers capped at
   unrefunded quantity, refund-shipping field, editable total capped at `totalCents - refundedCents`, reason
   text, restock checkbox, notify-customer checkbox, button labelled `Refund $X.XX`. Calls
   `providerForStore().refund()` with an idempotency key derived from `orderId + amount + attempt`. Needs
   `orderItems.refundedQuantity` (new column) and `orders.refundReason`.
4. **P0** — Test-mode state. Add `paymentProviders.mode` (`test | live`), derived from the key prefix on save, and
   a persistent admin banner + checkout banner reading *"Test mode is on. This store cannot accept real
   payments."* Also block `mode = test` from being the provider used on a domain whose `status = connected`.
5. **P0** — Make `submitDisputeEvidence` real: a `submitDisputeEvidence(db, env, disputeId)` helper in
   `app/lib/payments.server.ts` that POSTs `evidence[...]` to `/v1/disputes/{id}` with
   `customer_name, customer_email_address, customer_purchase_ip, billing_address, shipping_address,
   shipping_carrier, shipping_tracking_number, shipping_date, product_description, receipt, refund_policy,
   uncategorized_text`, sourced from `orders` + `orderEvents`. Today the toggle lies.
6. **P1** — Manual capture end to end: enable the `manual` option in the `Payment capture` select, show
   `Payment status: Authorized` on the order with a `Capture payment` button calling `provider.capture()`, and an
   "Authorization expires in N days" countdown from `orders.paidAt`. Needs `orders.authorizedAt` and
   `paymentStatus` value `authorized`.
7. **P1** — `Automatic at fulfillment` capture option, wired to `afterFulfilled` in `app/lib/fulfilment.server.ts`.
8. **P1** — Payouts view. Add `payouts` table (`id, storeId, providerPayoutId, arrivalDate, status, chargesCents,
   refundsCents, adjustmentsCents, feesCents, totalCents, currency`) fed by the `payout.paid` / `payout.failed`
   webhooks plus a `/v1/payouts` backfill; a Finances → Payouts screen with Shopify's exact columns and status
   words `Paid / In transit / Scheduled / Failed`.
9. **P1** — Dispute detail screen with the evidence form field-for-field per §1.1, `Accept dispute` button, and a
   "Respond by <date>" banner driven by `evidenceDueBy`.
10. **P1** — Make `emailOnFailedPayment` real: send on `payment_intent.payment_failed` in `webhooks.stripe.tsx`
    via `app/lib/email.server.ts`.
11. **P2** — Manual payment methods (Bank deposit / Money order / COD / custom) with **name**, **additional
    details**, **payment instructions**, producing `paymentStatus = pending` orders and a `Mark as paid` action.
    Needs a `manualPaymentMethods` table.
12. **P2** — Show the card brand / wallet icon row on the provider card (Stripe `payment_method_configuration`).
13. **P2** — Second Stripe account as a real failover (the `isBackup` column already exists and is unused).

---

## 2. Domains

### 2.1 What Shopify does

**Settings → Domains** is one page:

- Header with two buttons: **`Buy new domain`** and **`Connect existing domain`**.
- **Primary domain** section at the top: the primary hostname in bold, a `Change primary domain` action, and a
  checkbox **"Redirect all traffic to this domain"** (default on). Help text: *"Redirecting all your traffic
  ensures customers and search engines are only directed to your primary domain."*
- **Shopify-managed domains** — domains bought through Shopify: hostname, expiry date, `Auto-renew` state, and
  actions `Manage`, `Set as primary`, `Remove`.
- **Third-party domains** — connected domains, each showing a status pill and, when misconfigured, an inline
  DNS-record table (`A → 23.227.38.65`, `AAAA → 2620:0127:f00f:5::`, `CNAME www → shops.myshopify.com`).
- Every store keeps its unremovable `<store>.myshopify.com` domain, listed separately and never primary-eligible.

Exact status copy on a connected domain:
- `Connected` — green, everything resolves and SSL is issued.
- `Verifying…` / `We're verifying your domain` — after `Verify connection` is pressed, while DNS is checked.
- `Connection issue` / **"We couldn't verify your domain"** — with the required records listed and a
  `Verify connection` button.
- Under the hostname, a second line for the certificate:
  - **"SSL pending"** — *"Your SSL certificate is being issued. This can take up to 48 hours."*
  - **"SSL certificate is active"** / a padlock — issued and serving.
  - **"SSL unavailable"** — issuance failed, usually a CAA record.
- Timing copy Shopify shows: *"It can take up to 48 hours for your domain to be fully live."*

www/apex handling: connecting `example.com` connects **both** `example.com` and `www.example.com`. Which of the two
is primary is a choice; the other 301-redirects to it when *Redirect all traffic* is on. Shopify auto-creates the
`www` CNAME expectation and shows a subdomain row.

**Buy new domain**: search box → availability list with per-TLD annual price → checkout → domain appears
immediately as Shopify-managed with DNS already pointed, `Connected`, SSL pending. **Transfer in** is a separate
flow requiring an EPP/auth code, unlock, WHOIS privacy off, and a 5–7 day ICANN hold.

Also on this page: **subdomains** (`Add subdomain`), and per-domain **target market** assignment (Markets) —
each domain can be bound to a market and a language, which is how Shopify does international domains.

### 2.2 What we have

`DomainsPane` in `app/routes/admin.settings.tsx`, `app/lib/cloudflare.server.ts`, `domains` table.

- Model is Cloudflare **nameservers**, not A/CNAME records: `createZone` → show the two NS → `bindHostname` binds
  the hostname to the Worker as a Workers Custom Domain, Cloudflare issues the cert. This is a legitimate
  divergence and should stay, but the *copy and states* should still match Shopify.
- Cards: `Domains · <store>` list, `Connect an existing domain`, `Transfer a domain in` (a 6-step checklist that
  only tracks progress; the actual transfer happens at Cloudflare), `Admin domain`.
- Row badges: `Connected` / `Transferring` / `Pending`, plus `SSL Active` / `SSL Pending`, plus `Primary`.
- Actions: `Verify connection`, `Set as primary`, `Remove`. `Add subdomain` in the card header (prefixes onto the
  primary domain's root).
- `www` is **stripped** on input (`.replace(/^www\./, "")`) and never re-added or bound — the help text claims
  *"www is added for you once it is connected"*, which is not true anywhere in the code.
- No redirect-to-primary at all: `setPrimaryDomain` only flips `isPrimary` and writes `stores.domain`. Non-primary
  connected hostnames serve the same content — duplicate content, no 301.
- No buy-a-domain flow. No expiry / auto-renew. No per-domain market or language.
- `domains.ssl` is only ever set to `"active"` optimistically on bind; it is never re-checked against Cloudflare.

### 2.3 Gap — Domains

1. **P0** — 301 redirect non-primary → primary. Add `stores.redirectToPrimary` (boolean, default true) and a check
   in the storefront request handler (`app/routes/storefront.tsx` / the Worker entry) that issues a 301 to the
   primary hostname preserving path + query. Show it as the checkbox **"Redirect all traffic to this domain"**
   under the primary-domain block.
2. **P0** — Bind `www.<host>` alongside the apex on `verify-domain`: a second `bindHostname` call, and a
   `domains.wwwDomainId` column. Either fix the behaviour or delete the false help text.
3. **P0** — Real SSL state. Poll Cloudflare `GET /zones/{zone}/ssl/certificate_packs` (or the Workers custom-domain
   record's `status`) on load and on `Verify connection`; store `domains.ssl` as `pending | active | unavailable`
   and render Shopify's copy: `"SSL pending"` + *"Your SSL certificate is being issued. This can take up to 48
   hours."*, `"SSL certificate is active"`, `"SSL unavailable"`.
4. **P1** — Match Shopify's status vocabulary exactly: `Connected`, `Verifying…`, `Connection issue` (replacing
   the current `Pending`), and on failure the line **"We couldn't verify your domain"** above the NS table.
5. **P1** — Primary-domain block at the top of the pane (hostname in bold + `Change primary domain`), instead of a
   per-row `Set as primary` only.
6. **P1** — Keep the platform hostname (`<slug>.<platform-domain>`) as an always-present, never-removable row
   labelled the way Shopify labels `myshopify.com`, so removing the last custom domain cannot orphan the store.
7. **P2** — `Buy new domain`: Cloudflare Registrar search + purchase (`/accounts/{id}/registrar/domains`), showing
   annual price per TLD; store `domains.expiresAt`, `domains.autoRenew`, `domains.managed`.
8. **P2** — Per-domain market/language binding once Markets exists (`domains.marketId`, `domains.locale`).
9. **P2** — Show the standing warning about MX records (already good) as a blocking confirm rather than a passive
   box when the zone already has MX records — read them with `GET /zones/{id}/dns_records?type=MX` before
   switching nameservers.

---

## 3. Meta pixel / Facebook & Instagram channel

### 3.1 What Shopify does

Shopify installs **Facebook & Instagram by Meta** as a sales channel. Setup is a connection wizard:
`Connect Facebook account` → `Connect Business Manager` (or create) → `Connect Facebook Page` →
`Connect Instagram account` (optional) → `Connect ad account` → `Connect / create dataset (pixel)` →
`Connect catalog` → `Connect commerce account` (for checkout on Meta) → accept the **Meta terms**.
Each step is a row with `Connect` / `Change` and a checkmark when done; the overview shows a
`Connected` / `Requires action` pill.

**Customer data sharing** is a three-level radio, this exact wording:
- **`Standard`** — browser pixel only.
- **`Enhanced`** — browser pixel plus hashed customer information (email, phone, name, address) from the pixel.
- **`Maximum`** — pixel **plus the Conversions API**: events are sent server-side as well, deduplicated with the
  browser events. Shopify's copy: *"Maximum data sharing uses the Conversions API to share customer events
  directly from Shopify's servers."*
A **data-processing options** control for CCPA (`Limited data use`) sits under it.

**Events.** Shopify's web pixel emits its own customer events, and the Meta channel maps them:

| Shopify customer event | Meta standard event | Payload Meta expects |
|---|---|---|
| `page_viewed` | `PageView` | — |
| `product_viewed` | `ViewContent` | `content_ids: [variantOrProductId]`, `content_type: "product"` (or `"product_group"`), `content_name`, `content_category`, `value`, `currency`, `contents: [{id, quantity, item_price}]` |
| `collection_viewed` | `ViewCategory` | `content_ids[]`, `content_type`, `content_category` |
| `search_submitted` | `Search` | `search_string`, `content_ids[]`, `content_type` |
| `product_added_to_cart` | `AddToCart` | `content_ids`, `content_type`, `contents`, `value`, `currency` |
| `checkout_started` | `InitiateCheckout` | `content_ids`, `contents`, `num_items`, `value`, `currency` |
| `payment_info_submitted` | `AddPaymentInfo` | `content_ids`, `contents`, `value`, `currency` |
| `checkout_completed` | `Purchase` | **required** `value`, `currency`; plus `content_ids` **or** `contents`, `content_type`, `num_items` |

Required-vs-optional per Meta's reference: `Purchase` requires `value` + `currency` and (for Advantage+)
`contents` or `content_ids`. `ViewContent`, `AddToCart` and `Search` require `contents` or `content_ids` for
Advantage+ catalogue matching. `InitiateCheckout` and `AddPaymentInfo` have no strictly required fields.

**Deduplication.** Every event carries an `event_id` (browser: the third argument
`fbq('track', 'Purchase', {...}, {eventID: '<id>'})`; server: `data[0].event_id`) **and the same `event_name`**.
Meta dedupes only when *both* match within 48 hours. The CAPI payload also carries `action_source: "website"`,
`event_source_url`, `event_time` (unix seconds, within 7 days), and `user_data` with SHA-256-hashed
`em, ph, fn, ln, ct, st, zp, country, external_id` plus plaintext `client_ip_address`, `client_user_agent`,
`fbp`, `fbc`.

**Test events**: Events Manager → *Test events* tab gives a `TEST#####` code; sending `test_event_code` keeps the
event out of live totals and streams it into the tab. **Event Match Quality** and *Diagnostics* are shown per
dataset in Events Manager, not in Shopify.

### 3.2 What we have

`app/routes/admin.meta.tsx`, `app/lib/meta.server.ts`, `metaConfig` table.

- One **Connection** card, four fields: **Pixel ID**, **Ad account ID**, **Conversions API token** (encrypted,
  show/hide), **Test event code**. Pill: `Connected` / `Not connected`.
- `Send test event` posts a real `Purchase` to `graph.facebook.com/v21.0/{pixelId}/events`, and *refuses* without a
  test event code — correct and better than most.
- Browser side (`pixelScript`) fires **`PageView` only**, from `storefront.tsx`. `thanks.tsx` additionally fires
  `Purchase` via `purchasePixelScript` with `{value, currency}` and `{eventID}` — **no `content_ids`, no
  `contents`, no `content_type`, no `num_items`**.
- Server side (`sendPurchase`) sends **`Purchase` only**, with correct SHA-256 hashing of
  `em/ph/fn/ln/ct/st/zp/country`, `client_ip_address`, `client_user_agent`, `fbp`, `fbc`, `action_source:
  "website"`, `event_source_url`, and `contents[{id, quantity, item_price}]` + `content_type: "product"`.
  Dedup id is stored on `orders.metaEventId`. This half is essentially right.
- Missing entirely: `ViewContent`, `ViewCategory`, `Search`, `AddToCart`, `InitiateCheckout`, `AddPaymentInfo` on
  **both** browser and server. The Meta screen is honest about it (`serverEvents` lists only Purchase).
- No Business Manager / Page / catalog / commerce-account connection, no data-sharing level, no `external_id`,
  no CAPI `Purchase` `num_items`, no LDU / data-processing options.

### 3.3 Gap — Meta

1. **P0** — Fire `ViewContent` on the product page with `content_ids: [variantId]`, `content_type: "product"`,
   `content_name`, `value`, `currency`, `contents`. Browser + CAPI, one shared `event_id`. Needs a
   `metaEvent(eventName, payload)` helper in `app/lib/meta.server.ts` and an event-id generator that both halves
   read (put the id in a per-request nonce, not a random per-half UUID).
2. **P0** — Fire `AddToCart` from the add-to-cart action in `app/lib/cart.server.ts` / the cart route, with
   `content_ids`, `contents`, `value`, `currency`, shared `event_id`.
3. **P0** — Fire `InitiateCheckout` when checkout is opened, with `content_ids`, `contents`, `num_items`, `value`,
   `currency`, shared `event_id`.
4. **P0** — Add `content_ids`, `contents`, `content_type`, `num_items` to the browser `Purchase` in
   `purchasePixelScript` — right now the browser and server Purchase carry *different* custom_data, which
   degrades match quality even though the dedup id matches.
5. **P0** — Generalise `sendPurchase` into `sendEvent(settings, eventName, event)` so CAPI can carry every event,
   not just Purchase. Needs an `meta_events` table (`id, storeId, eventId, eventName, sentAt, ok, reason`) so the
   Meta screen's server-event counts stop being derived from `orders`.
6. **P1** — `Search` on the storefront search with `search_string`, and `ViewCategory` on collection pages.
7. **P1** — `AddPaymentInfo` when the payment element is completed at checkout.
8. **P1** — Add `external_id` (hashed `orders.email` or the cart token) to `user_data` — it is the single largest
   Event Match Quality lever after email.
9. **P1** — Data-sharing level control (`metaConfig.dataSharing`: `standard | enhanced | maximum`) that actually
   gates whether CAPI fires, matching Shopify's three radio labels and copy.
10. **P1** — Persist and show the CAPI response's `events_received` / `fbtrace_id` per send so a failing dataset is
    visible; today `sendPurchase` returns ok/reason and only the ok case is recorded.
11. **P2** — Business Manager / Page / catalog / commerce-account fields on the Meta screen (`metaConfig.businessId`,
    `pageId`, `catalogId`, `commerceAccountId`) — display + validation only, no OAuth wizard.
12. **P2** — Limited Data Use (`data_processing_options: ["LDU"]`, `data_processing_options_country`,
    `data_processing_options_state`) for CCPA.
13. **P2** — Deduplication self-check: a screen row comparing browser event count to CAPI event count per event
    name over 7 days, the way Events Manager does.

---

## 4. Shipping & delivery rates

### 4.1 What Shopify does

**Settings → Shipping and delivery**, sections top to bottom:

1. **Shipping** — a list of **profiles**.
   - **General shipping rates** (the default profile; every product not in a custom profile). Cannot be deleted.
   - **Custom profiles** — up to 99, each named, each holding an explicit set of products/variants
     (`Add products`), with its own zones and rates.
   - Each profile card shows: **origin locations** ("Shipping from N locations"), then per **zone**:
     - **Zone name** (e.g. "Domestic", "Rest of world"), the list of countries/regions/US states in it, and
       `Add rate`, `Edit`, `Delete`.
     - Rates listed as **Rate name | Condition | Price**, e.g. `Standard | 0 kg–5 kg | $4.90`,
       `Free shipping | $50.00 and up | Free`, `Economy | 5–8 business days | $4.90`.
2. **Rate creation dialog** — two radio choices at the top:
   - **`Use carrier or app to calculate rates`** (carrier-calculated: USPS/UPS/DHL/Canada Post, with
     *Services* checkboxes and a **handling fee** — flat amount and/or percentage of the rate).
   - **`Set up your own rates`** — fields:
     - **Rate name** — *"Customers will see this at checkout."* (this is literally the string shown at checkout)
     - **Description** (optional, shown under the name at checkout, e.g. "5 to 8 business days")
     - **Delivery time / Transit time** — a select: `1 business day`, `2-3 business days`, `3-4 business days`,
       `5-8 business days`, `Custom`
     - **Price** — a money field; `0.00` renders as **`Free`** at checkout
     - **Add conditions** — a radio: `None`, **`Based on order price`** (Minimum price / Maximum price, blank max
       = no upper bound), **`Based on item weight`** (Minimum weight / Maximum weight, in the store's weight unit)
     - A profile may hold **many rates in one zone**; the customer picks between them at checkout, cheapest first.
   - Free shipping over a threshold is *not* a toggle — it is a rate named `Free shipping` priced `0.00` with the
     condition `Based on order price → Minimum price $50.00`, usually paired with a paid rate whose
     `Maximum price` is `$49.99`.
3. **Local delivery** — per location: delivery radius or postal-code list, minimum order price, delivery fee,
   delivery instructions field at checkout.
4. **Local pickup** — per location: `Allow pickup` toggle, expected pickup time (`Usually ready in 24 hours`),
   pickup instructions.
5. **Packages** — saved package dimensions & weights, one flagged **default** for carrier-calculated rates.
6. **Custom order fulfillment / Saved packages / Shipping labels** — accounts and label defaults.
7. **Processing time** — the fulfilment lead time added to delivery estimates.

Weight unit lives in Settings → Store details (`kg / g / lb / oz`) and every weight condition uses it.
Rates whose conditions no customer cart can satisfy produce checkout's **"No shipping rates available for this
address"** — Shopify shows the shipping step with that message and blocks the order.

### 4.2 What we have

`ShippingPane` in `app/routes/admin.settings.tsx`, five columns on `stores`, priced in `app/lib/cart.server.ts`.

- Fields: **Flat rate** (`shipFlatCents`), **Free shipping over** (`shipFreeOverCents`), **Delivery estimate shown
  at checkout** (`shipEstimate`, free text), toggle **Free shipping on every order** (`shipAlwaysFree`),
  and `shipEtaOnProduct`. Honest footnote: *"One rate, every destination… there are no per-country zones yet."*
- `priceCart` precedence: `shipAlwaysFree` → `shipFreeOverCents` threshold → `shipFlatCents`. Single rate, no
  name, no choice at checkout, no weight anywhere (no weight column on `variants` at all).
- No profiles, no zones, no rate list, no conditions, no local pickup/delivery, no packages, no
  carrier-calculated rates, no "no rates available" state.

### 4.3 Gap — Shipping

1. **P0** — `shippingZones` table (`id, storeId, profileId, name, countries jsonb, regions jsonb`) and
   `shippingRates` table (`id, zoneId, name, description, priceCents, minPriceCents, maxPriceCents,
   minWeightGrams, maxWeightGrams, transitLabel, position, active`). This is the whole model; everything else
   below depends on it.
2. **P0** — Rewrite the shipping half of `priceCart` in `app/lib/cart.server.ts` into
   `ratesFor(db, store, cart, address)` returning the **list** of matching rates (name + description + price),
   not one number. Cart/checkout must show the customer a choice and store the chosen rate.
3. **P0** — Store the chosen rate on the order: `orders.shippingRateName`, `orders.shippingRateDescription`
   (Shopify shows the rate name on the order and on the confirmation email; today we have only an amount).
4. **P0** — "No shipping rates available for this address" state at checkout when `ratesFor` returns empty —
   currently an unmatched destination silently gets the flat rate.
5. **P1** — Settings → Shipping rebuilt as a profile → zone → rate list, matching Shopify's `Rate name | Condition
   | Price` row shape, with `Add rate` / `Edit` / `Delete` per zone and `Add zone` per profile.
6. **P1** — Rate dialog with Shopify's exact controls: **Rate name** (help text *"Customers will see this at
   checkout."*), **Description**, **Delivery time** select with Shopify's presets, **Price** (`0.00` → `Free`),
   **Add conditions** radio `None / Based on order price / Based on item weight`.
7. **P1** — Migrate the existing five `stores.ship*` columns into one default profile with one "Rest of world"
   zone: `shipFlatCents` becomes a rate named `Standard`, `shipFreeOverCents` becomes a `Free shipping` rate with
   `minPriceCents`, `shipAlwaysFree` becomes a single `Free shipping` rate at `0`. Keep `shipEstimate` as that
   rate's `description`. One-shot migration + drop the pane.
8. **P1** — `variants.weightGrams` column and a **weight unit** on `stores` (`kg | g | lb | oz`), without which
   weight-based conditions cannot exist.
9. **P2** — Custom profiles with an explicit product set (`shippingProfileItems` join table).
10. **P2** — Local pickup per location: `Allow pickup`, `Usually ready in <time>`, instructions.
11. **P2** — Processing time added to the delivery estimate shown at checkout.
12. **P2** — Carrier-calculated rates + handling fee (only worth it once a real carrier account exists).

---

## 5. The rest of Settings

### 5.1 Shopify's Settings left nav, in order

1. **Store details** — store name, store logo, store contact email, sender email, **legal business name**,
   **billing address**, phone, store industry, **store currency** (change requires support after first order),
   **unit system** (metric/imperial), **default weight unit**, **time zone**, **order ID prefix/suffix**.
2. **Plan** — current plan, billing cycle, `Change plan`, `Cancel plan`, invoices.
3. **Billing** — payment method on file, billing history, credits, subscriptions, one-time charges.
4. **Users and permissions** — store owner, staff list with permissions checkboxes, collaborators + collaborator
   request code, **two-step authentication** requirement, login services (Google/Apple), security log.
5. **Payments** — §1.
6. **Checkout** — checkout configurations; customer contact method (email / phone or email); **customer
   information**: Full name (`Only require last name` / `Require first and last name`), Company (`Don't include` /
   `Optional` / `Required`), Address line 2, Shipping address phone number; **marketing options** ("Email pick-up
   at checkout" pre-check state); **tipping**; **abandoned checkout emails** (send after 1h/6h/10h/24h);
   **order processing**: auto-archive, address auto-complete, "Automatically fulfill all order line items";
   **checkout language**; **customer accounts** (`Don't use accounts` / `Optional` / `Required`);
   **checkout rules**; post-purchase page; **Order status page additional scripts**; **Refund, privacy, terms
   of service, shipping policy** links; **checkout expiry**.
7. **Customer accounts** — new (passwordless) vs legacy accounts, URL, branding, `Require accounts at checkout`.
8. **Shipping and delivery** — §4.
9. **Taxes and duties** — tax regions list with per-region rate and `Collect tax` state; **"All prices include
   tax"** checkbox; **"Charge tax on shipping rates"**; **"Charge VAT on digital goods"**; **tax service**
   (Shopify Tax / Basic Tax / Manual); duties & import taxes; tax overrides per collection; tax registrations.
10. **Locations** — location list, address, `Fulfill online orders from this location`, priority order, default
    location, deactivate.
11. **Markets** — primary market, other markets, per-market domain/subfolder, currency & rounding, price
    adjustment %, catalog, languages, `Active` / `Draft` status.
12. **Apps and sales channels** — installed apps, sales-channel list, `Uninstall`, app permissions, developer apps.
13. **Domains** — §2.
14. **Customer events** — pixel list (custom + app pixels), each with `Connected` / `Disconnected`.
15. **Brand** — logos (default/square/cover), slogan, short description, brand colours (primary/secondary),
    cover image, social links (Facebook, Instagram, X, TikTok, YouTube, Pinterest, Snapchat, Tumblr).
16. **Notifications** — **sender email** + domain authentication (SPF/DKIM records), notification template list
    grouped Order / Shipping / Customer / Local delivery / Local pickup / Returns, each editable HTML +
    `Send test`; **staff order notifications** (recipients, per-location); **webhooks** (topic, URL, format,
    version, `Send test notification`).
17. **Custom data** — metafield & metaobject definitions per resource (Products, Variants, Collections, Customers,
    Orders, Pages, Blogs, Locations, Markets, Company, Company location).
18. **Languages** — published/unpublished languages, default language, `Translate & Adapt`.
19. **Policies** — Refund policy, Privacy policy, Terms of service, Shipping policy, Contact information, Legal
    notice, and **Subscription policy**; each a rich-text editor with `Create from template` and a public URL.
20. **Customer privacy** — cookie banner (region, position, appearance), privacy policy link, data-sale opt-out,
    data region restrictions, GDPR/CCPA data requests.
21. **Gift cards** — gift-card expiry, `Apply gift card to…`, gift-card products.
22. **Store activity log** — audit of staff actions.

### 5.2 What we have

Twelve panes, in `PANES` in `app/routes/admin.settings.tsx`:
`Profile · General · Domains · Payments · Notifications · Taxes · Shipping · Checkout · Policies · Branding ·
Plan & billing · Data export`.

- **Profile** — name, email (read-only), notification prefs (`notifyEveryOrder`, `notifyChargebacks`,
  `notifyWeekly`), session count, `Sign out other devices`. Roughly Shopify's *Users and permissions* for a
  single-user system.
- **General** — store name, contact email, currency (5 options), timezone (6 options), legal name, address1,
  city, region, postal code, phone. Missing: **unit system**, **weight unit**, **order ID prefix**, store logo
  (that lives in Branding), sender email (lives in Notifications).
- **Notifications** — sender `from` address with a real Resend domain flow (DNS record table + `Verify`), and
  `Send test email` for confirmation / shipping / refund. Missing: template editing, staff recipients, webhooks.
- **Taxes** — `taxMode` (`manual` / `automatic` — automatic is not implemented), default rate, per-US-state rate
  list (`taxRates` table), `pricesIncludeTax`, `taxOnShipping`. Close to Shopify's Basic Tax for the US.
- **Checkout** — `checkoutNameMode` (`full` / `last`), `checkoutPhoneMode` (`optional/required/hidden`),
  `checkoutCompanyMode` (`hidden/optional/required`), `checkoutConsent`, `checkoutCaptureAbandoned`,
  `checkoutTip`. Good match for Shopify's *Customer information* block; missing abandoned-checkout email timing,
  address line 2 control, order-processing options, customer-accounts mode, checkout language, policy links.
- **Policies** — four policies (`refund-policy`, `privacy-policy`, `terms-of-service`, `shipping-policy`) as plain
  textareas with `Save as draft` / `Publish`. Missing: contact information, legal notice, subscription policy,
  templates, rich text.
- **Branding** — logo URL, favicon URL, brand colour, accent colour. Missing: square/cover logos, slogan, short
  description, social links.
- **Plan & billing** — a cost readout only; no plan, no payment method, no invoices (correct for self-hosted).
- **Data export** — CSV export links + delete-store with typed-name confirmation. No Shopify analogue; keep.
- **Not present at all**: Users & permissions (multi-staff), Locations, Markets, Customer accounts, Customer
  events / pixels list, Custom data (metafields), Languages, Customer privacy / cookie banner, Gift cards,
  Store activity log, Apps & sales channels.
- `stores` already carries unused-in-settings columns worth surfacing: `seoTitle`, `metaDescription`,
  `socialImageUrl`, `passwordEnabled` / `passwordHash` / `passwordMessage` (a storefront password page with no UI).

### 5.3 Gap — the rest of Settings

1. **P0** — **Customer privacy / cookie banner**. Selling to the EU/UK without a consent banner is a legal
   exposure, and the Meta pixel needs the consent signal. Needs `stores.cookieBannerEnabled`,
   `cookieBannerRegion`, `cookieBannerPosition`, and a storefront banner that gates `pixelScript`.
2. **P0** — Surface the existing **password page** columns (`passwordEnabled`, `passwordHash`,
   `passwordMessage`) in a `Preferences` or General block — a pre-launch store currently cannot be closed.
3. **P0** — **Weight unit + unit system** on General (`stores.weightUnit`, `stores.unitSystem`) — blocking for
   weight-based shipping rates (§4 gap 8).
4. **P1** — **Order ID prefix/suffix** (`stores.orderPrefix`, `stores.orderSuffix`) applied wherever
   `orders.number` is rendered. Every Shopify store uses `#1001`; we render a bare integer.
5. **P1** — **Locations** as a first-class table (`locations`: name, address, `fulfillsOnlineOrders`, priority)
   even with one row — inventory, shipping origins and local pickup all key off it.
6. **P1** — **Customer accounts** mode on Checkout (`stores.customerAccountsMode`:
   `disabled | optional | required`) to match Shopify's three-way control.
7. **P1** — **Abandoned checkout email timing** on Checkout (`stores.abandonedAfterHours`: 1/6/10/24) — the
   `checkoutCaptureAbandoned` toggle exists but nothing sends anything.
8. **P1** — Notifications: **template editing** per notification (order confirmation, shipping, refund,
   abandoned checkout) stored in a `notificationTemplates` table, with `Send test` reusing the existing
   `send-test-email` action.
9. **P1** — Policies: add **Contact information**, **Legal notice**, **Subscription policy**; add
   `Create from template` seeded copy per policy.
10. **P1** — Branding: square logo, cover image, slogan, short description, and the social-link set Shopify
    stores (`stores.socialFacebook/Instagram/Tiktok/Youtube/Pinterest/X`) — these feed the storefront footer and
    JSON-LD.
11. **P1** — SEO block on General or Branding for the already-existing `seoTitle`, `metaDescription`,
    `socialImageUrl`.
12. **P2** — **Users and permissions**: a `storeUsers` join table with per-permission booleans, invitations, and
    the security/session list already partly built in Profile.
13. **P2** — **Markets**: `markets` table + per-domain binding (see Domains gap 8), currency and price adjustment.
14. **P2** — **Custom data**: metafield definitions per resource (`metafieldDefinitions`, `metafields`).
15. **P2** — **Languages** / translations.
16. **P2** — **Gift cards** (`giftCards` table, balance, expiry, redemption at checkout).
17. **P2** — **Store activity log** — an `auditLog` table written by every admin mutation.
18. **P2** — **Webhooks** section under Notifications so an outside system can subscribe to `orders/create` etc.
19. **P2** — Rename the settings nav to Shopify's labels where we already have the pane: `General` →
    `Store details`, `Taxes` → `Taxes and duties`, `Shipping` → `Shipping and delivery`, `Branding` → `Brand`,
    `Profile` → `Users and permissions`. Free parity.

---

## Sources

- [Shopify Help — Domains](https://help.shopify.com/en/manual/domains)
- [Shopify Help — Connect a third-party domain manually](https://help.shopify.com/en/manual/domains/add-a-domain/connecting-domains/connect-domain-manual)
- [Shopify Help — Shopify Payments](https://help.shopify.com/en/manual/payments/shopify-payments)
- [Shopify Help — Getting paid with Shopify Payments](https://help.shopify.com/en/manual/payments/shopify-payments/getting-paid-with-shopify-payments)
- [Shopify Help — Shipping profiles](https://help.shopify.com/en/manual/shipping/setting-up-and-managing-your-shipping/shipping-profiles)
- [Shopify Help — Settings permissions (the Settings section list)](https://help.shopify.com/en/manual/your-account/users/roles/permissions/settings-permissions)
- [Shopify Help — Customer events](https://help.shopify.com/en/manual/promoting-marketing/analyze-marketing/customer-events)
- [Shopify dev — Web Pixels API standard events](https://shopify.dev/docs/api/web-pixels-api/standard-events)
- [Meta — Pixel standard events reference](https://developers.facebook.com/docs/meta-pixel/reference)
- Admin GraphQL schema via MCP: `ShopifyPaymentsDispute`, `ShopifyPaymentsDisputeEvidence`, `DisputeStatus`,
  `DeliveryProfile`, `DeliveryMethodDefinition`, `Domain`.
