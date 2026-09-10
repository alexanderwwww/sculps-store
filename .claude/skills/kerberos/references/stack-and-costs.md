# Stack, costs, and the accounts Alex needs

## Why this stack

**React Router v7 on Cloudflare Workers.** Next.js is more famous but doesn't run natively
on Cloudflare — it goes through OpenNext, a translation layer that breaks when either side
upgrades. For someone who is not a developer and will maintain this for years with Claude's
help, an extra layer that can break for reasons unrelated to his code is a bad trade.
React Router v7 is Cloudflare's own full-stack template. No adapter.

**Neon Postgres.** Real Postgres, connects properly from Workers, generous free tier,
point-in-time backups. Losing this database loses the business, so backups and PITR get
configured before store one takes a single order.

**Drizzle ORM.** Schema lives in code, so the storefront and the admin editor generate from
the same definitions and can never drift apart.

**Cloudflare R2.** Images and video. No egress fees, unlike S3.

**Stripe**, behind a provider interface. **Resend** for per-store transactional email.
**Durable Objects + WebSockets** for Live View — the only sane way to do real-time on Workers.

## Monthly cost

| Service | Job | Cost |
|---|---|---|
| Cloudflare | Runs the app, hosts media, domains + SSL | $0 free tier; $5/mo when Live View needs Durable Objects |
| Neon | The database — orders, products, content | $0 free tier; $19/mo well after launch |
| Resend | Order + shipping emails from each store's own domain | $0 up to 3,000/mo |
| Stripe | Takes the money | 2.9% + 30¢ per sale, no monthly |
| Domains | One per store, bought anywhere | ~$10/year each |

**Total to go live: $0–5/month.** Compare to Shopify at $39–49/month plus their cut.

## The five credentials to collect

Ask for these **one at a time**, each with the exact page to click. Never ask for all five
in one message.

1. **Cloudflare API token** — dash.cloudflare.com → My Profile → API Tokens → Create Token →
   "Edit Cloudflare Workers" template.
2. **Neon connection string** — neon.tech → the project → Dashboard → Connection string
   (starts `postgresql://`).
3. **Resend API key** — resend.com → API Keys → Create. He also has to add DNS records at
   the domain for SPF/DKIM; walk him through that when the time comes.
4. **Stripe secret key + webhook secret** — dashboard.stripe.com → Developers → API keys
   (`sk_live_…`). The webhook secret comes after we create the endpoint, so it's a second ask.
5. **Meta pixel ID + Conversions API access token** — business.facebook.com → Events Manager
   → the pixel → Settings → Conversions API → Generate access token.

Credentials go into Cloudflare's secret store, never into the repo. Per-store payment and
pixel credentials are stored encrypted in the database with the master key in Cloudflare.

## Risks worth restating when relevant

- **Self-hosting removes Shopify as a kill switch, not Stripe.** Dropshipping with long
  shipping times generates chargebacks. The defense is operational: tracking numbers uploaded
  to Stripe fast, dispute evidence submitted automatically, a statement descriptor matching
  the store name customers remember, quick refunds. Build the dispute-evidence piece in
  Phase 1, not later.
- **Stripe risk attaches to the person and entity, not the account.** Per-store accounts are
  correct and cost nothing, but they don't isolate as fully as he imagines. Say so once.
- **Checkout is on his domain, but card fields are Stripe's embedded Payment Element.**
  Handling raw card numbers means PCI compliance costing tens of thousands a year. Not
  negotiable.
- **Failed webhooks silently lose orders.** Every Stripe webhook logged, retried, and
  failures alert him.
