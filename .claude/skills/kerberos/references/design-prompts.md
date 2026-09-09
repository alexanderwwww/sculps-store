# Claude Design prompts

The prototype is a single file, `Shop Admin.dc.html`, built in Claude Design. It is the
blueprint the real code is written from — approve it before writing any code, because
changing a picture is free and changing built code is not.

**Rule: one screen per turn.** Alex burned a session by asking for everything at once.
Every prompt below ends with "finish it, then stop and wait."

## Already sent

1. The base brief — Shopify-exact shell, tokens, Home, Orders, Order detail, Products,
   Online Store editor, Analytics, Settings, Media, Storefront, Checkout, Thank you.
2. The functional follow-up — everything works, nothing is a dead button, one shared data
   model behind every screen, full Live View specification.
3. The rename to **Shop Admin** and the shift to one-screen-per-turn.

## Remaining turns, in order

### Turn 1 — Live View (the screen he stares at)

```
Move the store switcher to the TOP-RIGHT next to the avatar, the way Shopify puts the
account there. It's a button showing a colored dot + current store name + chevron. The
dropdown lists: All stores (aggregate), Garden Kneeler — kneelwell.com, Halloween Decor —
hauntedporch.com, E-Bike — voltcommuter.com. Each row shows today's revenue, order count,
and a health dot (green healthy / amber needs attention / red payments problem). Switching
changes the data on every screen. ⌘K search stays centered. Sidebar unchanged.

Then build LIVE VIEW. Full-bleed dark purple board.
- Header: "Live View", pulsing green LIVE dot, store filter, sound toggle "Cha-ching on
  every order" with volume slider, "Simulate order" button, fullscreen button.
- Big "Visitors right now" number with a 10-minute bar strip beneath it.
- US map with glowing dots per visitor; on a sale the city pulses, a ring expands, and
  "+$129.00" floats up and fades.
- Cards: Total sales today, Sessions, Orders, Conversion rate, AOV.
- Funnel: Viewing → Added to cart → Checking out → Purchased, live counts.
- Top pages, Top locations, Top ads (ad name → sessions → sales).
- Activity feed on the right, newest on top: time, colored type dot, city, bundle, ad
  source. Purchase rows tinted green with the amount and a link to the order.
- Simulated traffic so it's alive on load. Numbers roll up on each sale, sound plays.
Finish it, then stop and wait.
```

### Turn 2 — Analytics

```
Date-range picker with compare-to-previous. Cards: revenue, orders, AOV, conversion rate,
refund rate. Sales-over-time chart with day/hour toggle. Breakdowns: by store, by bundle
option, by ad/campaign (spend → revenue → ROAS → profit), traffic sources, top states.
Refunds and chargebacks summary. Export button.
Finish it, then stop and wait.
```

### Turn 3 — Settings (the one he cares about most)

```
Left settings nav, real forms, Shopify's contextual Save bar.
- General: store name, contact email, currency, timezone, statement descriptor.
- Domains: primary domain, SSL badge, "Connect existing domain" flow showing the exact DNS
  record to copy, Verify button moving Pending → Connected.
- Payments: per store. Stripe card with Connected badge, account name, masked secret key,
  masked webhook secret, Test connection button. "Add provider" picker with a second Stripe
  account, PayPal, and a generic processor — each addable and markable as Backup. Make clear
  each store has its own account. Toggle: submit dispute evidence automatically. Link:
  export payment records.
- Meta ads: Pixel ID, Conversions API token (masked), "Send test event" with Received /
  Not received status, list of browser events, list of server events, event match quality
  score, and a line stating browser and server share one event ID so Meta doesn't double
  count.
- Notifications: sender email on the store's own domain with SPF/DKIM verified badges,
  toggles for order confirmation and shipping confirmation with Preview buttons, abandoned
  cart sequence with delay fields.
- Data export: export all orders, customers, events.
Finish it, then stop and wait.
```

### Turn 4 — Products

```
Product list per store. Product detail: title, description, images, and a bundle options
table — label, price, compare-at price, auto-calculated saved %, default pick, drag to
reorder. Dropship fields: supplier name, supplier URL, cost per unit, live-calculated
margin. Status toggle. Post-purchase upsell picker.
Finish it, then stop and wait.
```

### Optional later turns

Online Store editor (fixed 15-section list, no reordering), Media library, and the
storefront → checkout → thank-you flow with the post-purchase upsell.

## Standing rules to repeat in every prompt

- One screen per turn. Finish properly, then stop.
- Light mode and purple dark mode both working on every new screen.
- Every control does something. No dead buttons, no "coming soon".
- Sample data consistent across screens, and clearly fictional.
- Never Shopify's name or logo. Layout and behavior are the reference; the name is Shop Admin.
