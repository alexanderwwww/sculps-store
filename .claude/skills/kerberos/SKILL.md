---
name: kerberos
description: The build plan, stack, costs, current status, and step-by-step workflow for Kerberos (also called "Shop Admin") — Alex's self-hosted Shopify replacement running several one-product dropshipping stores. Use this skill whenever the conversation touches Kerberos, Shop Admin, "my platform", "my own Shopify", the garden kneeler / Halloween / e-bike stores, the admin design prototype, Live View, the 15 storefront sections, per-store Stripe or Meta pixel setup, Cloudflare + Neon hosting for these stores, or leaving Shopify. Trigger it even when Alex only says "the store", "the admin", "the platform", or "let's continue" if the context is this project — it carries the state we left off at, so starting without it means repeating work he has already paid for.
---

# Kerberos

Alex's own e-commerce platform. Replaces Shopify for several one-product dropshipping
stores selling to the US. Also referred to as **Shop Admin** (the name shown in the UI).

## Who you're working with — read this first

Alex is not a developer. He has run many Shopify stores, so he knows products, orders,
checkout, pixels, and domains cold. He has never built software.

- **One step at a time.** Give him a single action, then stop and wait. Ten steps at once
  loses him and something breaks.
- **Short answers.** He will tell you when a reply is too long, and he is usually right.
  Lead with the answer. Cut the preamble.
- **Tell him exactly what to click or paste.** Assume no terminal knowledge.
- **Push back when he's about to hurt himself later** — once, in a sentence or two, then do
  what he asked. He has already reversed his own brief once (see "Design rules" below);
  when his latest instruction contradicts an earlier one, follow the latest and say so in
  one line rather than arguing from the old document.
- **Budget is Claude usage, not dollars.** He hits session limits. Do not spend a session
  rebuilding something he already approved, and do not build the same screen twice.

## Where the project actually stands

Keep this section current. Update it at the end of any session that moves the work.

_Last updated: 10 Sep 2026 — first real database run and first deploy._

- **Design prototype — done, and approved.** `Shop Admin.dc.html` (in `design/prototype/`)
  has every admin screen built and working: shell with ⌘K and the top-right store switcher,
  Home, Orders + order detail with the four states, Products, Inventory, Customers, Reviews,
  Marketing, Analytics, Live View, Meta, Online Store (Themes / Pages / Navigation /
  Preferences plus the three-column editor over the fixed fifteen), Media, and Settings with
  all twelve panes including Domains and Payments. Light theme only — he killed dark mode.
  He signed the globe off with "globe done"; **do not touch it**, reuse `shop-globe.js`.
  Never designed as pictures: the storefront, cart, checkout and thank-you screens. That is
  deliberate — those live in code (rule 1), so drawing them first would spend his budget twice.
- **Code — Phase 1 scaffolding is live.** A working React Router v7 app on Cloudflare
  Workers: the full Drizzle schema, the fifteen sections as a single source of truth in
  `app/lib/sections.ts`, and the garden kneeler storefront rendering from the database.
- **Database is real now.** `db:push` and `db:seed` have run against Neon. The tables exist
  and store one is seeded: product, 3 bundle variants, all 15 sections in fixed order, 6
  specs (2 deliberately blank, rendering "Spec pending"), no reviews, no invented copy.
- **Deployed — two separate URLs, and the difference matters.**
  - Storefront (real, reads Neon): **https://kerberos.gardenbuddystore.workers.dev** —
    `/healthz` returns `{"ok":true,"db":"up"}`. `DATABASE_URL` is a Cloudflare Worker
    secret. Redeploy with `npm run deploy` (needs `CLOUDFLARE_API_TOKEN` set).
  - Admin (the Claude Design prototype, static, NOT wired to the database):
    **https://shop-admin.gardenbuddystore.workers.dev** — Worker `shop-admin`, serving
    `design/prototype/` as static assets with `Shop Admin.dc.html` renamed to `index.html`
    plus `support.js`, `shop-globe.js` and `assets/`.
  - **Alex expects the admin to run his stores.** It does not yet — fake data, buttons that
    save nothing. He was frustrated when this was not clear. Say so plainly before he clicks
    around expecting it to work. Making it real is Phase 2.
- **Still to build in Phase 1:** cart, on-site checkout, Stripe, Meta pixel + Conversions
  API, confirmation and shipping emails, the real domain with SSL, and the stripped-down
  orders list with tracking field and refund button.
- **Live business** — the garden kneeler store is live on Shopify at amboras.com and making
  money. It stays there until Kerberos has taken real orders for a week without a problem.
  Do not let him switch it off early.
- **Accounts** — Neon is open (project `shopadmin`, AWS US East 2). Cloudflare is now open
  too, on gardenbuddystore@gmail.com, workers.dev subdomain `gardenbuddystore`. Resend and
  Stripe still to do. His Neon connection string is not in this repo; ask him for it and put
  it in `.dev.vars`, which is gitignored. Same for the Cloudflare API token — never commit
  either.
- **Domain** — bought for the garden kneeler store, but he has not told us the name yet. The
  seed uses `garden-kneeler.pending` as a placeholder. Ask.

## The build order

Do not skip ahead. Each phase ends with something he can click.

**Phase 0 — Design. Done and approved.** Finish the prototype in Claude Design, one screen per turn:
Live View, then Analytics, then Settings, then Products. `references/design-prompts.md`
holds the exact prompts to paste. Nothing gets coded until he approves the screens.

**Phase 1 — Store one live and selling.** Database and the 15 sections, garden kneeler
storefront, cart, on-site checkout, Stripe, Meta pixel + Conversions API, confirmation and
shipping emails, domain with SSL. Ship a stripped-down orders list with a tracking field and
a refund button at the end of this phase — orders will arrive before the admin exists, and
without it he is locked out of his own business.

**Phase 2 — The admin.** Home, Live View with the sale sound, Orders with the four states
and refunds, Products, Online Store content editor, Analytics, Settings, Media. Built to
match the approved design exactly.

**Phase 3 — Stores two and three.** Store switcher, Halloween and e-bike storefronts, their
own domains, their own Stripe accounts, their own pixels.

## Never guess. Check, then say.

His time is the scarcest thing in this project and a confident wrong answer
costs more of it than saying nothing. So: **do not state anything about the
running system that has not been verified in that same turn.** Not "it should
be live", not "that is probably cached", not "yes it works" from having built
it. Run the request, read the row, fetch the page — then say what came back,
and say where it came from.

This has already gone wrong here more than once: the domain was declared ours
before it was checked, the sale card was declared working when a clock
comparison was silently dropping every event, and a subagent reported
click-to-edit finished when it was not. In each case the words came before the
evidence.

Three practical forms of it:

- **Reporting on the deployed system** — curl it, query it, read the header.
  A screenshot from him is evidence; a build succeeding is not.
- **Relaying a subagent's report** — its claims are unverified until spot-checked.
  Check the constants, the file, the behaviour it says it delivered.
- **Diagnosing what he is seeing** — ask or test before explaining. "Your
  browser is caching" is a guess until the cache-busted request proves the
  server is fine.

When something genuinely cannot be verified from here — anything behind his
login, on his phone, or inside his Stripe account — say that plainly and ask
him to look, rather than reasoning toward a likely answer and presenting it as
one.

## Design rules — do not violate these

**0. When a design exists, port it — never re-author it.** The approved
prototype is `design/prototype/Shop Admin.dc.html`, split per screen into
`design/port/*.html` with the method written in `design/port/PORTING.md`.
Every style string in it was signed off. Transliterate the markup: `sc-if` to
a ternary, `sc-for` to `.map`, `style="a:b"` to `style={{ a: "b" }}`, same
values, same nesting. The only thing that changes is where the data comes
from. If you are typing a colour, a pixel value, a font weight or a line of
copy that is not already in the prototype, stop — you are inventing, and that
is the mistake that made the first build feel like a toy version of his
design. Reading the design and rebuilding from a summary of it is not
porting, and it is what he will notice first.

**1. Design lives in code. Content lives in the admin.** Each store's look is written
directly in code with full creative freedom. The admin can only change words, images, and
repeatable blocks inside a fixed structure. It cannot reorder sections, change layout, or
alter colors. Shopify's theme editor overwrote his developer's work more than once; keeping
structure in code and content in the database makes that class of bug impossible.

**2. Fifteen sections, fixed order, every store.** Buy box, Video with FAQ, Social proof
images, Video clips, Product grid, Trust icons, Three steps, Benefits, Features, Comparison
table, Reviews, Who it's for, What's in the box, Specifications, Closing CTA. Sections can
be *hidden*, never moved, added, or deleted.

**3. Small on purpose.** No app store, no staff accounts, no POS, no permissions, no
inventory forecasting, no B2B, no gift cards, no customers screen, no discounts. One user.
Every feature not built is a feature that can't break. When he asks to "clone all of
Shopify", narrow it back to what he actually presses.

**4. Payments are pluggable and per-store.** Stripe is provider one, behind an interface
with create / capture / refund / webhook. Credentials are stored per store so one frozen
account can't kill the others. Adding PayPal later must not touch orders or checkout.

**5. Orders are permanent and exportable.** Every state change timestamped, nothing deleted.
This is the evidence that wins a processor review.

**6. Honesty is enforced by the system.** Never generate fake reviews. Never invent
specification numbers. An empty spec field renders as a visible "spec pending" placeholder
on the live page — not a guess, not a hidden gap.

**7. Admin UI is a faithful Shopify clone.** His brief originally asked for a dense trading-
terminal feel; he reversed that and wants Shopify's exact look. Follow the reversal. Copy
Shopify's layout, spacing, Inter typography, Polaris colors, and interactions — never their
name or logo. Light mode is Shopify's palette; dark mode is purple.

## The stack

React Router v7 on Cloudflare Workers · Neon Postgres · Drizzle ORM · Cloudflare R2 for
media · Stripe · Resend for email · Durable Objects for Live View.

Chosen because Cloudflare runs it natively with no translation layer, which matters when the
person maintaining it for years is not a developer. Full reasoning, costs, and the accounts
he needs to open: `references/stack-and-costs.md`.

**Cost to run: $0–5/month** plus domains and Stripe's per-sale fee. That is the whole point.

## Working sessions

Start by reading the status section above, then ask him one question about where he wants to
pick up. Don't re-explain the project to him.

- **If he's in Phase 0**, hand him the next design prompt from `references/design-prompts.md`
  and stop. Don't build anything.
- **If he's ready to build**, the first thing you need is the five credentials in
  `references/stack-and-costs.md`. Ask for them one at a time, with the exact page to click.
- **When he asks how something works**, explain it by mapping onto Shopify, which he already
  knows: what replaces what, and what stays the same. Skip architecture diagrams unless he
  asks for one — he found the engineering-style diagram unreadable and said so.
- **End of session**, update the status section in this file so the next session doesn't
  start from zero.

## Reference files

- `references/design-prompts.md` — the exact prompts to paste into Claude Design, screen by
  screen, plus what's already been sent.
- `references/stack-and-costs.md` — every account, what it does, what it costs, what
  credential to collect, and where to click to get it.
- `references/data-model.md` — the tables and the shape of the fifteen sections.
- `references/store-one.md` — the garden kneeler store: audience, palette, bundles, tone.
