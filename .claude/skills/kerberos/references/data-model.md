# Data model

Plain-language shape of the database. The storefront renders from these definitions and the
admin generates its editing forms from the same definitions, so the two can never drift.

## Tables

**Store** — a storefront. Name, domain, payment configuration, Meta pixel configuration,
email sender configuration, branding settings. Everything below belongs to a store.

**Product** — title, description, images.

**Variant** — a bundle option on a product: label, sublabel, price, compare-at price, and a
*calculated* percent saved. Never typed by hand — change a price and every badge on the
storefront updates. A product has several.

**Page** — belongs to a store, made of sections.

**Section** — type (one of the fifteen), fixed position, its text field values, its list of
blocks, and a hidden flag. Type and position are set in code; only values and visibility
come from the database.

**Block** — a repeating item inside a section: a review, a feature, a spec row, an FAQ entry.
Has an order within its section. Can be added, removed, and reordered from the admin. Empty
values render as visible placeholders.

**Order** — customer details, shipping address, line items, totals, tax, payment reference,
current state, tracking number, and a timestamp for every state change. Never deleted. Fully
exportable.

**Cart** — in-progress and abandoned carts with captured email.

**Media** — uploaded images and video in R2.

**Event** — page views, add to carts, checkouts, purchases. Feeds Live View and Analytics.

## Order states

1. **New** — paid, not yet placed with supplier.
2. **Ordered with supplier** — he has placed it, waiting on tracking. Shopify doesn't really
   give him this state and he needs it to see at a glance what he has actually done.
3. **Fulfilled** — tracking number added, customer notified automatically.
4. **Refunded / cancelled** — refund issued through the provider from inside Kerberos, never
   from the Stripe dashboard.

## The fifteen sections, in fixed order

1. Buy box
2. Video with FAQ
3. Social proof images
4. Video clips
5. Product grid
6. Trust icons
7. Three steps
8. Benefits
9. Features
10. Comparison table
11. Reviews
12. Who it's for
13. What's in the box
14. Specifications
15. Closing CTA

Each section has a small set of fixed text fields (heading, subheading, body) and optionally
a list of repeating blocks. Example: Reviews is a heading plus review blocks (name, star
rating, text). Specifications is a list of spec rows (label + value) where an empty value
renders as a visible "spec pending" placeholder on the live page.

The order is identical across all stores. Only words and images change. The admin cannot
reorder, add, remove, or invent section types — it can only hide one.

## Meta event handling

Browser pixel fires ViewContent, AddToCart, InitiateCheckout. The server fires Purchase
through the Conversions API. Both carry **the same event ID** so Meta merges them instead of
double-counting. Capture the `fbp` and `fbc` cookies at checkout and send them with the
server event — without them match quality drops badly, and it's painful to retrofit.
Hashed customer data (email, name, location) goes with server events.
