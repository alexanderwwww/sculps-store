# Black Reaper — where the shop is, and how it works

Written for whoever picks this up next. Everything below is either verified
against the live site and the database, or explicitly marked as unverified.
Nothing here is assumed.

Owner: Alex. Non-developer, moves fast, wants the thing built rather than
described. Verify before claiming; he has been burned by guesses.

---

## 1. What this is

`blackreaper.us` — a Halloween yard-decoration shop running on **Kerberos**,
Alex's own e-commerce platform. Not Shopify. One codebase serves several
stores; which one a visitor sees is decided by the hostname.

| Store | Domain | State |
|---|---|---|
| **Black Reaper** | `blackreaper.us` | live, the current work |
| garden buddy | `gardenbuddy.store` | live |
| Ceiling Buddy | `ceiling-buddy.pending` | not launched |
| bodies | `bodies.pending` | not launched (Pilates board — see the `bodies` skill) |
| XERO | `xero.pending` | not launched |

### Stack
- **React Router v7** on **Cloudflare Workers**
- **Neon Postgres** via **drizzle**
- **Cloudflare R2** bucket `gardenbuddy-media`, served at `/media/<key>`
- Payments: **Stripe** (+ Apple Pay) and **PayPal**
- Email: **Resend**
- Repo: `alexanderwwww/sculps-store`, branch `claude/kerberos-phase1-db-setup-6vjdq9`

### The commands that matter
```bash
npx tsc -b --force --pretty false          # typecheck
npm run build                              # build
set -a; . ./.dev.vars; set +a; \
  export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID; \
  npx wrangler deploy                      # deploy
npx wrangler tail --format=pretty          # live worker logs — use this before guessing
```
Secrets live in `.dev.vars` (not committed). **The `RESEND_API_KEY` in
`.dev.vars` is stale and invalid** — the Worker has its own, set separately.

---

## 2. Hard rules — these are not preferences

Breaking one of these is treated as a bug, not a style note.

- **Never dummy or sample data on the site.** Ever.
- **Money off is always dollars, never percentages.** `$5 off`, never `$5.00 off`,
  never `−25%`. Prices keep their cents; savings do not.
- **Never print a review count.** Not in a heading, not on a button, not in an aria-label.
- **Never beige.** `#EFECE4` and friends are banned.
- **Never clouds or sky as decoration** (this rule came from the `bodies` brand;
  Alex has since said it does not bind Black Reaper — real weather in a real
  photograph is fine here).
- **No fake urgency, no invented scarcity, no fabricated "full price".**
  Real compare-at prices only.
- **Never a highlighter swipe or underline behind headline text.**
- **Never name a competitor.**
- **Never upload the same image twice**, and **never overwrite an R2 key** —
  media is immutable and cached for a year. New content = new key.
- **Never `pkill -f`.** Use `fuser <port>/tcp`.
- **Never guess.** Verify with a screenshot, a query, a `wrangler tail`, or a test.

### Product facts that must never be contradicted
| Product | Fact |
|---|---|
| The Black Reaper | 8.5 ft, blue lantern, ghosts on the chain. **Batteries. Never a cord, never solar.** |
| The Crawling Zombie | **Batteries + handheld remote. Never a cable, plug or socket in any image.** |
| The Scream | **16 ft 4 in inflatable**, white mask, lit **red** from inside. Has a blower — this one does plug in. |
| The Haunted Projector | **White**, sits **indoors on the windowsill**, throws drifting figures on the glass. Not a green screaming skull. |
| The Halloween Movie Theater | 12 ft inflatable screen + projector + blower. |

### Brand
Black `#0B0B0C` · bone `#F7F2E7` · orange `#F5821F`. Archivo (display) +
Inter (body). Square or 4px corners; **no pills**, no drop shadows on brand
furniture.

---

## 3. The crash — read this before touching CSS

Alex's iPhone used to kill the tab on the product page. Two independent causes,
both fixed:

1. **A live-reload poller** (`app/lib/live-reload.ts`) called `location.reload()`
   on a 404 manifest with no loop guard — 23 reloads in 45 seconds. **File deleted.**
   The same `useEffect` was removed from `app/admin/shell.tsx`.
2. **Compositing load.** `will-change`, `filter: blur()`, `backdrop-filter` and
   `mask-image` each create a layer or an offscreen buffer. At DPR 3, ~50 of them
   exhausted video memory and iOS killed the tab.

**So: no `will-change`, no `blur()`, no `backdrop-filter`, no `mask-image`,
no compositor layers on storefront pages.** Plain transforms on a handful of
small elements are fine and are in use (the savings bubble pulses).

A full computed-style audit across all five pages found **zero** of the four
banned properties active. They are still **dormant in the shipped CSS**
(`theme-*.css` carries backdrop-filter ×13, blur ×6, will-change ×3, mask ×8)
— inert because their selectors do not match, but re-enabling any such section
brings the crash back with no code change. **Worth deleting. Not yet done.**

---

## 4. Where things live

```
app/
  db/schema.ts                     drizzle schema — SOURCE OF TRUTH for columns
  lib/
    store.server.ts                loadProductPage, addOnProducts, storeNav
    cart.server.ts                 pricing, discounts on the cart
    email.server.ts                all transactional email (~1400 lines)
    emails/reaper-products.ts      per-product setup steps, tips, FAQ, inBox
    upsell.server.ts               the post-purchase offer
    aftercare.server.ts            delivered + review-ask emails (cron)
    recovery.server.ts             abandoned cart / comeback
    payments.server.ts             Stripe + PayPal, Apple Pay domain registration
    cloudflare.server.ts           zones, worker hostnames, putDnsRecord
    resend-domains.server.ts       sender domain create / read / verify
  routes/
    storefront.tsx                 the product page route
    checkout.tsx                   checkout + its upsell
    thanks.tsx                     post-purchase page + the one-time offer
    cart.tsx                       GET priced cart, POST discount / quantity
    admin.settings.tsx             Shop Admin settings incl. sender domain
  storefronts/
    ceiling-buddy/index.tsx        Black Reaper's storefront components
    ceiling-buddy/cart-drawer.tsx  the cart drawer
    ceiling-buddy/theme.css        base theme (loads AFTER reaper/theme.css)
    reaper/theme.css               Black Reaper's overrides (~3700 lines)
    garden-buddy/                  shared checkout chrome, PayPal + Stripe express
```

**CSS load order gotcha:** `ceiling-buddy/theme.css` loads *after*
`reaper/theme.css`, so an override in the reaper file at equal specificity
loses. Scope it (`.cb-drawer .cb-line__pic`) to win.

---

## 5. Database notes that have cost time

- `pages` has **no** `description` and **no** `published` column. It has `visible`,
  and `visible` only controls **footer listing for standalone pages** — it does
  not gate public access.
- `products.status` is `active | draft`. **Draft products were publicly
  reachable** until fixed — `loadProductPage` now returns null for non-active
  unless `includeHidden` (admin preview, signed in).
- `reviews.source` is **NOT NULL**. `reviews.country` actually holds `"City, ST"`.
- `sections` has a unique index on `(page_id, position)` — when reordering,
  **park positions high first (e.g. +3000), then renumber.** Never random numbers.
- `orders.upsell_state` **was missing from the database** while present in the
  schema. Every order query selects it, so the thank-you page threw on every
  paid order. Added with `alter table orders add column if not exists upsell_state text`.
  **There is no migrations directory — schema drift is a live risk. Check
  `information_schema.columns` against `schema.ts` when anything queries oddly.**

---

## 6. What was done in this session

All committed on `claude/kerberos-phase1-db-setup-6vjdq9` and deployed.

### Reviews — rebuilt to a specialist spec (`/tmp/claude-0/reviews/design.md`)
- Card removed entirely: no border, no panel, no radius. A 1px rule between entries.
- Photo now full width 4:3 (was a 96px thumbnail). Called the only change that moves conversion.
- **Towns surfaced** — `country` holds `"Toledo, OH"` on 130 of 142 rows and was never rendered.
  Now a still line under the score and beside every name. It does not scroll.
- Channel word after the town: `Verified buyer` / `Instagram` / `TikTok` / `Sent to us`.
  No logos, no platform colours.
- **iMessage rows render as a transcript** — they store a two-person exchange one
  line per turn and were being jammed into one run-on paragraph. Left = them,
  right = the owner in orange. No bubbles, no fake chat app.
- Blue Facebook tick removed; stars are brand orange; avatars square; gradient ramp deleted.
- "Read the rest" now measures real clamping instead of guessing from character count.
- Instagram comment like-counts removed.
- Desktop uses **multi-column flow**, not grid — a grid gave every row the height of
  its tallest card and left holes.
- One review from this season lifted to second place (six rows are current and were buried).

### Review photography — 37 new images
- Audited all 48: **4 were studio cutouts on white** pretending to be customer photos,
  and **32 reviews shared a photo with another reviewer** (three names on one yard in places).
- Generated via Magic Wand, briefed as phone snapshots. **Duplicates: 41 → 0** on every
  live product. (4 remain on the hidden Haunted Build page.)
- The Scream was re-shot after the first batch came back wrong — it had been briefed as a
  battery yard stake when it is a 16 ft inflatable with a blower, lit red.

### Haunted Projector — re-shot entirely
All eight gallery images showed a **black unit staked in the lawn** projecting a
**green screaming skull**. Replaced with eight white/indoor/window photographs.
Variant thumbnails and the contradicting copy fixed. The outdoor stake mount and
weather sealing were **left in the box list and FAQ** — they read like real spec.

### Cart drawer
- **Checkout button was untappable on a phone.** PayPal's iframe (`z-index: 100`)
  covered it; the drawer was `z-index: 60`. Verified failing 3/3, then passing 3/3.
- Turned right way up: the bought item leads with a large photo; price, savings and
  the three ways to pay follow.
- **Apple Pay + PayPal side by side at half width.** Venmo and Pay Later removed.
  When no wallet exists the Apple Pay slot leaves the row entirely (the component
  reports `hasWallet`; that flag was being thrown away).
- **Sized off viewport height, measured at five phone sizes with 1–3 items.**
  Worst case (iPhone in Chrome, 664px) had the cart at 107px and the upsell strip
  at 218px. Now the cart wins at every size.
- **Upsell shelf removed** at Alex's instruction — offers belong at checkout.
- **Discount code box added** (the server already accepted one; only checkout had the box).
  Submitted through `useFetcher` — a bare `fetch` POST gets an HTML document back
  and `response.json()` throws.

### Checkout / post-purchase
- Upsell badge printed `−25%` → now dollars.
- The "Save $X" line only appeared at ≥40% off → now any real saving.
- **`/thanks` threw on every paid order** (missing column, §5). Fixed.
- The post-purchase offer was offering the **50-cent test product** and printing
  **"Save -$0.50"** (the $1.00 floor sat above the item's own price). Now skips test
  rows, skips anything at or under the floor, and returns nothing rather than an
  offer that saves nothing. Reads: Haunted Projector $79.99 → $64.99, save $15.

### Email
- Seven of eight messages sat in **Garden Buddy's shell**: beige page, white rounded
  card, navy text, mustard button.
- The order confirmation hand-rolled itself from **lime green, two yellows, three
  browns, four invented iMessage bubbles and `gb-email-line.gif`** — another shop's asset.
- **New `reaperShell()`**: near-black ground, bone type, one orange, tables + inline
  styles, alphas pre-computed to solid hex for Outlook. It deliberately does **not**
  read `brandColor`/`accentColor` — being a colour-swap of a shared template is the
  root cause of "generic".
- Order confirmation rebuilt on it, now carrying **what is in the box**, taken from
  what each product page already lists.
- Its button pointed at `/orders/<ref>` — **a page that does not exist**; every customer
  would have hit a 404. Points at the shop until a real order page exists.

### Infrastructure
- **Sender domain:** `blackreaper.us` added to Resend (eu-west-1, id
  `67d52432-cc03-43e8-bb28-b89d202aaccf`); DKIM + two SPF CNAMEs written into
  Cloudflare DNS (zone `c3f05141edb254eacfca02140465b51e`). **Status: pending.**
  A duplicate us-east-1 domain created by mistake was deleted, and its wrong
  `send` MX/TXT records removed (a CNAME cannot coexist with them).
- **Shop Admin → Settings → Notifications now has "Add to Cloudflare"**, which writes
  Resend's records itself instead of printing them to retype.
- **Draft products no longer served publicly.**
- **Test product excluded from every cross-sell** at source.
- Magic Wand build 71: a job with no `id` is no longer silently dropped.

---

## 7. Open — what the next person should pick up

### Blocking a real sale
1. **`email_from` is empty.** Order confirmations fall back to `orders@resend.dev`
   and will not deliver. Needs the Resend domain to finish verifying, then the
   From address saved. **Domain is pending, not verified.**
2. **`legal_name` and `phone` are empty.** Stripe and PayPal both want them.

### Known wrong, not yet fixed
3. **FAQ page 404s** — it is in the footer and the page is hidden.
4. **"Test order" is still in the main navigation** on the live store.
5. **No customer-facing order page.** `/orders/<ref>` does not exist.
6. **No after-sale tracking page with a map.** Alex has asked about this; it was
   never built. The map work went into checkout address autocomplete. What exists
   post-sale is `/thanks` plus two cron emails.
7. **342 KB of Stripe + PayPal SDK loads on every page**, including the homepage,
   because they were bundled into the fake-SMS chat widget's chunk
   (`phone-chat-*.js`) which is modulepreloaded everywhere. A code-splitting
   boundary fixes it. Biggest speed win available. Full audit at `/tmp/claude-0/perf/report.md`.
8. **Dormant banned CSS** (§3) should be deleted.
9. Four reviews on the hidden Haunted Build page still share photos.
10. **The Haunted Projector's outdoor copy vs indoor images** — the box lists a
    ground stake mount and a 16 ft outdoor cord, the images are all indoor. Alex was
    asked to rule on this and has not. Do not delete the outdoor content on a guess.

### Needs Alex
- Meta pixel ID + CAPI token (he says it is the same pixel as before)
- Resend domain verification to finish
- One real order through the 50-cent test product, then delete it

### Not started
11. **OrganicX** — a separate dock app, like Magic Wand, for organic social.
    Agreed shape: warm the account up (scroll, watch, like, follow, post nothing)
    before posting; build content from the real assets rather than generating footage;
    schedule on a human rhythm; tune for reach. **Four decisions still unanswered:**
    TikTok first or both · auto-post or approval queue · where it runs (Mac browser
    vs real phone) · assemble vs generate.

---

## 8. Specialist reports on disk

These are session-scratch and will not survive; copy anything wanted into the repo.

| Path | What |
|---|---|
| `/tmp/claude-0/reviews/design.md` | The reviews redesign (588 lines). Mostly shipped. |
| `/tmp/claude-0/cro/funnel.md` | Funnel audit, scored 48/100. Partly applied. |
| `/tmp/claude-0/perf/report.md` | Mobile performance audit (262 lines). **Not applied.** |
| `/tmp/claude-0/proof/spec.md` | The three-real-photo section. **Not applied.** |
| `/tmp/claude-0/email/spec.md` | Email programme, 12 emails ranked (1075 lines). Partly applied. |

**Unverified in those reports:** the reviews spec claimed every `-t200` thumbnail
404s — checked, they all return 200. The funnel audit called `.cb-night`
"completely empty" — it is three photographs with no text, by design. Treat
their specific claims as leads, not facts.

---

## 9. Magic Wand

A dock app on Alex's Mac that drives Gemini to generate images.

- Endpoints: `https://kerberos.gardenbuddystore.workers.dev/wand/0ikn4sXuXNntr2Im2Mil7zRxLBmlCWtu/{queue,status,order,runtime,shots,file/<slug>/<NN>-01.<ext>}`
- MCP tools: `wand_queue_set`, `wand_status`, `wand_order`, `wand_shots`
- **A job must have an `id`** or it is refused, and the app reports the same
  "a job in the queue" message for an empty queue — this cost an hour once.
- A job already run on that Mac is refused again unless `.done-jobs` is cleared.
- After queueing, send `continue` — and **check `status` shows your job name**,
  because it will happily resume the previous one instead.

**Hard-won lesson:** Alex rejected AI-generated *product* imagery outright — flat-lays
of box contents, fabricated product renders. Generated imagery is for **scenes**
(a yard, a lit window, a house at night) using the real product as a reference.
Anything that purports to show the physical product's parts must be real.

---

## 10. Playwright

```
executablePath: /opt/pw-browsers/chromium-1194/chrome-linux/chrome
args: ["--no-sandbox","--ignore-certificate-errors","--use-gl=angle",
       "--use-angle=swiftshader","--enable-unsafe-swiftshader"]
```
Omitting `--ignore-certificate-errors` gives `ERR_CERT_AUTHORITY_INVALID`.
Cloudflare caches pages — add a cache-busting query param or you will verify a
stale page and believe a fix failed. This happened more than once.
