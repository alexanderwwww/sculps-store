# Kerberos — Shop Admin

Alex's own e-commerce platform, replacing Shopify for several one-product US
dropshipping stores. One app, three front doors: three store domains point at
the same Cloudflare Worker, and the app serves whichever store matches the
hostname the visitor arrived on.

**Read `.claude/skills/kerberos/SKILL.md` first.** It carries the build plan,
the rules that must not be broken, and where the work actually stands.

## What's in here

| Path | What it is |
|---|---|
| `app/db/schema.ts` | The whole database, in Drizzle |
| `app/lib/sections.ts` | The fixed fifteen sections — one source of truth for storefront *and* admin |
| `app/storefronts/garden-kneeler/` | Store one's look, written in code |
| `app/routes/` | Storefront route and a health check |
| `scripts/seed.ts` | Seeds store one with confirmed facts only |
| `design/prototype/` | `Shop Admin.dc.html`, the approved admin blueprint, plus `shop-globe.js` |
| `design/chats/` | How the design was arrived at — read before changing it |

## Running it

```bash
npm install
```

Create `.dev.vars` (gitignored — never commit it):

```
DATABASE_URL="postgresql://…your Neon connection string…"
```

Then:

```bash
npm run db:push     # create the tables in Neon
npm run db:seed     # load store one
npm run dev         # http://localhost:5173
npm run deploy      # build and ship to Cloudflare Workers
```

`npm run typecheck` runs wrangler types, React Router typegen and tsc.

## The rules the code enforces

These are Alex's, not stylistic preferences — the code is written so they
can't be violated by accident.

1. **Design lives in code, content lives in the admin.** Section type and
   position are written at seed time. The admin can edit values, add and
   remove blocks, and hide a section. It cannot reorder, add or delete one.
2. **Nothing is invented.** An unmeasured specification renders a visible
   "Spec pending" — never a plausible guess. Reviews come only from the
   `reviews` table, whose `source` column is required and has no default.
   An empty section is skipped rather than filled with placeholder copy.
3. **Percent saved is calculated, never stored.** Change a price and every
   badge follows.
4. **Money is integer cents everywhere.**
5. **Orders are permanent.** Every state change writes an `order_events` row.
   Nothing is deleted. That record is what wins a payment-processor review.
6. **Payments are per store and pluggable.** Credentials live per store in
   `payment_providers` so one frozen account cannot take the others down.
7. **Meta events share one event ID** between the browser pixel and the
   server Conversions API call, so Meta merges instead of double-counting.

## Status

Phase 1 is scaffolded and builds, but has never run against the database —
the session that wrote it had no network access to Neon or Cloudflare. Next
step is `npm run db:push`, `npm run db:seed`, then a first deploy.
