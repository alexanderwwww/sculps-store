# Settings → Domains — what Shopify's screen actually is

Taken from Alex's own Shopify admin (screenshot, 2026-09-10).

## Settings shell
Settings is a two-column modal-style screen. Left column: the store card at the
top (square avatar with initials, store name, domain underneath), a **Search**
field, then the nav list in this exact order:

General, Plan, Billing, Users, Payments, Checkout, Customer accounts,
Shipping and delivery, Taxes and duties, Locations, Markets, Apps,
Sales channels, **Domains**, Customer events, Notifications,
Metafields and metaobjects, Languages, Customer privacy, Policies.

Each row has a monochrome icon; the active row has a light grey pill
background. The pane on the right is white with its own header row.

## Domains pane
- Header: globe-ish icon + **Domains**; right side **Connect existing ▾**
  (secondary, with a split chevron button) and **Buy new domain** (primary,
  dark).
- A bordered table with a header row: `Domain` | `Status`.
- Rows are **grouped by what the domain serves**, with a grey group header row:
  - `Online Store`
  - `Customer Account`
- A group's primary domain is a top-level row: globe icon, the domain in
  medium weight, then a **Primary** chip (rounded, bordered, grey text).
- Domains that point at the primary are **indented sub-rows** joined by a
  dotted vertical rule, with a different icon. In the screenshot those are
  `tntgbw-hn.myshopify.com` and `www.gardenbuddy.store`.
- Status column: a green pill reading **Connected**. Other states Shopify uses:
  `Pending`, `Issue`, `Verifying`.
- Under the table, centred: **Learn more about domains**.

## What that means for us
1. The workers.dev hostname is our equivalent of `*.myshopify.com` and belongs
   in the table as a sub-row of the primary, always Connected.
2. `www.<domain>` must actually be bound as its own hostname and listed as a
   sub-row — today we strip `www` and never bind it.
3. A **Primary** chip and a "Change primary" action, plus the 301 redirect from
   every non-primary hostname to the primary.
4. Status pill states must be read from Cloudflare, not assumed: zone status
   `pending` → **Pending**, bound + zone active + certificate active →
   **Connected**, anything else → **Issue** with the reason on hover.
5. "Buy new domain" — we do not sell domains. It renders disabled with the
   reason, per the honesty rule; "Connect existing" is the real path.
