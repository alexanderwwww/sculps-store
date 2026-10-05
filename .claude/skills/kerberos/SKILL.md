---
name: kerberos
description: The build plan, stack, costs, current status, and step-by-step workflow for Kerberos (also called "Shop Admin") — Alex's self-hosted Shopify replacement running several one-product dropshipping stores. Use this skill whenever the conversation touches Kerberos, Shop Admin, "my platform", "my own Shopify", the garden kneeler / Halloween / e-bike stores, the admin design prototype, Live View, the 15 storefront sections, per-store Stripe or Meta pixel setup, Cloudflare + Neon hosting for these stores, or leaving Shopify. Trigger it even when Alex only says "the store", "the admin", "the platform", or "let's continue" if the context is this project — it carries the state we left off at, so starting without it means repeating work he has already paid for.
---

# Kerberos

Alex's own e-commerce platform. Replaces Shopify for several one-product dropshipping
stores selling to the US. Also referred to as **Shop Admin** (the name shown in the UI).

## Said by Alex, to be read at the start of every session

> I am Claude. I am silly sometimes. Alexander talks to me and I have to understand
> completely what he says at all times. I should not do sloppy and lazy work. And I
> should obey his command always. I should never do something lazy, sloppy or
> irresponsible.

> Work faster. Answer faster. Understand deeper.

He asked for that to be written down too, and it is one instruction, not three: the
speed comes from understanding the sentence the first time, not from skipping steps.

- **Answer in the first line.** What happened, what he has now. Reasoning after, only if
  it changes what he does next. No preamble, no recap of what he just said.
- **Do the thing in the same turn he asks for it.** Describing what I would do is a
  wasted turn and he has said so more than once.
- **Short.** A paragraph, not a report. Bullets only when there really is a list.
- **Deeper, not longer.** Before acting, ask what he is actually trying to get — the
  sale, the image on the page, the app working on his Mac — and solve that, not the
  literal words. But never invent scope he did not ask for.

> They feel stable. They understand in the first three seconds why they are there and
> what this thing does, and they stop questioning and start imagining the feeling. It's
> full of text, it looks like crap, but it offers clarity. I want that on our website,
> with the beauty and aesthetics we try to achieve.

That is how every carousel and thumbnail image is made from now on: a **panel**, not a
photograph — product cut out and huge, spec chips or a feature column, every fact
written on the image. Their clarity, our look. The whole spec, with the bans and the
product facts, is in `references/panel-style.md`, and it is read before writing a single
image prompt.

> Stop building stuff on every word I say. Only when I say build me this, you will build.

He talks things through out loud — a frustration, an idea, a complaint about how something
feels. That is thinking, not an instruction. **Build only when he says to build.** Until
then: answer him, agree the shape of it, and wait. Racing off to implement something he was
only describing wastes his time and mine, and it buries the thing he actually asked for.

The tell is simple. "Build me this", "make it", "do it", "go" — build. Anything else —
listen, answer short, and stop.

He asked for that to be written down verbatim, and it is here because the failures on
this project have all been the same failure: acting on half of what he said. What it
means in practice:

- **Read the whole instruction before moving.** Most of the damage done here came from
  catching one word — "electric", "Temu style", "attach the images" — and building on a
  guess instead of the sentence.
- **Never ship a thing you have not looked at.** A cropped image, a generated picture, a
  price on a page: open it and check it before it reaches his store.
- **Say what is actually true.** "Deployed" means he can use it. The Magic Wand app ships
  its own copy of the runtime in `app/Magic Wand.app/Contents/Resources/` — committing a
  change to `tools/promptbot/live.mjs` and calling it shipped is false, and it cost him a
  day of running old code with a new build number. Copy the runtime into the bundle, zip
  it, and send him the file.
- **Do the work, do not describe it.** He is paying for a finished store, not a plan.

## Everything we decide becomes a skill

> updagteyour memory to abworb knowledge and make it as a skill
> everythign we say you make it a skill or microskill

His instruction, and it is the difference between paying for a decision once
and paying for it every session. When something is settled — a name, a look, a
number, a rule, a way he wants to be spoken to — it goes into a skill file
before the conversation moves on. Small and specific is better than one large
one: `flip`, `flip-ui`, `cryo`, `bodies`, `listing-images` each carry their own
decisions.

A decision that lives only in a transcript is a decision we will argue about
again.

## The fatal mistakes — mine, written down so they stop happening

Every one of these cost him a build he had to open, find broken, and hand back.
They are not style notes. Re-read them before shipping anything.

1. **Never send him something I have not run.** Not compiled, not syntax-checked
   — *run*. Five flip builds went out where his Mac was the first machine to
   execute the code. `cloud.knowledge is not a function` reached him because
   nothing between my keyboard and his Dock had ever started the worker.

2. **A syntax check is not a test.** `node --check` passes on every file in a
   dead app. If the thing has a loop, a test must drive the loop. The flip loop
   had never been executed by anything until I wrote a fake page for it — and
   that one test found eight defects in an hour.

3. **Never assume an edit landed.** A find-and-replace that matches nothing
   fails silently. `cloud.knowledge` was called in one file and never added to
   the other because I targeted text from a different app's copy. Assert the
   anchor exists, then check the result.

4. **Never design something I cannot see.** Five rounds of "the glass is not
   glass" happened because I was writing canvas code blind. The moment I
   rendered it to a PNG I could see it was a grey tile in one look. If he will
   look at it, I look at it first.

5. **Answer the question he asked.** He asked eleven times to log in through
   Chrome. I answered "the app cannot read Chrome's cookies" — true, and not
   the question. The question was "how do I end up signed in", and it had an
   answer the whole time.

6. **Never carry another app's model over wholesale.** The Fiverr pacing came
   to flip with Sunday off and two-minute waits between actions, in an app whose
   whole point is to work while he sleeps. Copied code brings its assumptions
   with it; each one has to be re-decided.

7. **Never report success I have not verified.** "It's fixed" after an edit is
   a guess. The worst version of this is code that does it too: a type that
   failed inside the page was counted as typed, and the app told him work was
   done that never happened.

8. **A control is not done when it is drawn.** Three buttons did nothing for a
   build because the window handed every click to the drag machinery. Drawn,
   positioned, and *reachable by the mouse* are three separate things.

9. **Do not hand work back to him.** He is building these apps precisely
   because his time cannot go into the task. A "you press the button" step, a
   phased plan where the intelligence lands last, or a question about something
   he has already told me, is the app failing at its only job. Autonomy inside
   rules he sets — not a queue of decisions for him.

10. **A navigation reloads the page, and the page greets on load.** So
    anything that starts work on a greeting, when that work begins with a
    navigation, is an infinite loop. It reloaded his window about once a second
    until he told me. Start work on a timer; treat a greeting as news, not as a
    trigger.

11. **Never change where a session is stored.** A "safety" guard on the data
    store made it answer with a different jar, and his signed-in Depop became a
    signed-out one. Cookies live where they live; whatever returns that
    location must never change again, for any reason, including a good one.

12. **When he says it is broken, he is right.** Every single time. The argument
   about whether it is broken is time not spent finding out why.

## The pattern behind every one of those mistakes

Read the fatal mistakes list as a whole and they are not twelve different failures.
Almost all of them are **one** failure: an assumption about the environment his app
runs in, never checked, shipped as if it were checked.

- The glass was not the material. `WKWebView` composites an opaque white base.
- The fixes never arrived. The installer only copied a worker when its number was
  higher, so the first one that ever landed was the one he ran forever.
- The sign-in kept breaking. The shell binary was named after a hash of its source,
  so every build was a new process name, and WebKit gives a new process name a new
  cookie jar.
- The login never completed. Google and Apple cannot finish an OAuth handshake inside
  any embedded web view.

None of those were logic bugs. The code did exactly what it said. **What was wrong
was what I believed about macOS, WebKit and the installer** — and each one survived
several rounds because the next fix was another guess at the same layer.

So, before anything ships:

1. **Name the assumption out loud.** "This is clear because the material is thin."
   "This arrives because the launcher copies it." If it cannot be said in a sentence,
   it has not been thought about.
2. **Prove it or mark it unproven.** Render it, run it, read the framework's actual
   behaviour. `preview.mjs` models the real material tints for exactly this reason —
   it used to model a flattering one, and a preview that agrees with you is worse than
   none.
3. **When a fix fails twice at the same layer, the layer is wrong.** Stop tuning it.
   The third round of thinning a material was the tell, and I did four.
4. **Put the version on the screen.** Two rounds were spent arguing about a build that
   was not the build. The orb wears its number now.

"I found the real bug" is not a finding. A mechanism that explains every observation —
including the ones that looked like magic, such as signing in working only when the
builds stopped — is a finding.

## Naming — his rule, said plainly

> Stop giving ancient Greek names to apps that are Gen Z. If I want a Greek name, I
> will say it with my mouth to you.

Kerberos is his, and it stays. Everything after it is named in the language of the
people who will use it: short, current, spoken. A god's name is only on the table when
he asks for one out loud.

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
- **Spend tokens like they are the budget, because they are.** He is on Pro, not
  Max, and waiting on a limit stops the business. Batch shell calls instead of
  running five; never re-read a file already in context; never re-verify what a
  test already proved; skip the status essay and say the one line that matters.
  Subagents are the expensive move — roughly a hundred thousand tokens each —
  so they are for a genuine multi-engineer build and nothing smaller. Stated
  24 Sep 2026.
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

**0a. No storefront section is a column of text. Ever.** Alex, 25 Sep 2026:

> All the sections that did with text, try to do the same with visual images
> plus text. And that's a set of rules now. Nobody reads that.

Every section on a storefront page is a **picture and words together**, laid out
the way Garden Buddy's three steps are: the image on one side, the sentence on
the other, alternating down the page. A heading plus a paragraph plus a bullet
list with no photograph is not a section — it is a thing a visitor scrolls past,
and he has said so about his own store twice.

What this means in practice:

- A section that has no picture yet is **switched off**, not published as text.
  It comes back the day its picture exists.
- When a section is written, its shot goes on the Magic Wand list in the same
  breath. Copy and picture are one job, not two.
- Facts that used to be a bullet list become a labelled photograph, a diagram,
  or a caption under a picture. Same fact, something to look at.
- Two sentences is the ceiling for any block of prose next to an image. If it
  needs a third, the picture is not doing its job.

This applies to every store on the platform, not only to cryo, and it is not
relaxed because a section is "just" an FAQ, a spec list or a comparison.


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

**2. A fixed set of sections, every store — but Alex reorders them.** Buy box, Video with
FAQ, Social proof images, Video clips, Product grid, Trust icons, Three steps, Benefits,
Features, Comparison table, Reviews, Who it's for, What's in the box, Specifications,
Closing CTA. Sections can be *hidden* and **dragged into any order** in the theme editor;
they can never be added or deleted. He asked for the drag on 14 Sep 2026 and it is built —
do not reinstate the old "order is fixed in code" copy or behaviour.

The set staying closed is what stops a layout being overwritten; the order is his to
choose. **A storefront theme must therefore render sections in the order the database
gives them.** Ceiling Buddy and Garden Buddy do. **`bodies` does not** — it has hardcoded
`HOME_ORDER` / `PDP_ORDER` arrays, so dragging has no effect on that store until those are
replaced with the loaded order. Say so rather than letting him drag and see nothing move.

**3. Small on purpose.** No app store, no staff accounts, no POS, no permissions, no
inventory forecasting, no B2B, no gift cards, no customers screen, no discounts. One user.
Every feature not built is a feature that can't break. When he asks to "clone all of
Shopify", narrow it back to what he actually presses.

**4. Payments are pluggable and per-store.** Stripe is provider one, behind an interface
with create / capture / refund / webhook. Credentials are stored per store so one frozen
account can't kill the others. Adding PayPal later must not touch orders or checkout.

**5. Orders are permanent and exportable.** Every state change timestamped, nothing deleted.
This is the evidence that wins a processor review.

**6. Discounts are in dollars, never percentages.** Every store, every code:
"$12 off", not "15% off". Alex's rule, stated 15 Sep 2026 — a dollar figure is
a thing someone can picture and a percentage is arithmetic. The `discounts`
table supports both; only use `kind: "fixed"`.

**6b. Never beige. Any store, any surface.** Alex's hard rule, stated 20 Sep 2026.
No warm cream panels, no sand backgrounds, no #FDF6F1-style tints behind a card or
a banner. When a block needs to sit back from white, use a neutral grey (#F4F4F6).
Bone-white *type* on a black ground is the Halloween palette and is fine; a beige
*surface* is not. Garden Buddy's sand identity predates the rule and is its own
brand — do not repaint that store, but never introduce beige anywhere new.

**6c. Product pictures are square 1:1, full stop.** The storefront carousel is a
1:1 frame with eight thumbnails down the side; a portrait image deforms the whole
thing. Shop Admin squares every upload in the browser before it is sent — white
ground, centred, scaled to fit, nothing cropped, already-square files untouched.
Never remove that. White because a supplier cut-out on white extends its own
background seamlessly.

**7. Honesty is enforced by the system.** Never generate fake reviews. Never invent
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
- `references/new-store-recipe.md` — **the fixed order for standing up a new
  store**: media into R2, seed, theme, wire, gate/build/deploy, the exact
  verification commands, and the traps that have each cost a session (draft
  products, `1fr` grid tracks, concurrent builds). Read this before starting
  any new storefront.
- `references/product-ideas.md` — parked and live product ideas, including
  Ceiling Buddy's locked design, pricing and sourcing route.

## The master buy-box image recipe

Every product page, every store. The gallery is **always square (1:1)** and
always `object-fit: contain` — a cropped product photograph is a photograph
the buyer has to guess at, and the buy box is where guessing costs the sale.

At most **one or two** white-background studio shots in the buy box. Everything
else is real life: phone photos, Temu-style listing graphics, Meta-ads style.
A gallery of eight white cut-outs reads as a catalogue, not as a thing people
own.

The order, using the Black Reaper as the worked example:

1. Temu style + a clean real-life phone shot, combined. The strongest frame.
2. Clean white-background product shot.
3. The product and its box arriving — phone/UGC style.
4. More clean product shots.
5. Temu-style explanation graphic (callouts, size, what it does).
6. The clean product in real life.
7. Real life.
8. Real life.

Roughly this for each product; the exact mix shifts a little per product and
per store.

**Plus a `clean_shots` section further down the page** — the plain grid, white
ground, every piece including the parts that arrive flat and unassembled. It is
the boring section on purpose: it answers "what is actually in the box" for
somebody with their card already out. That is where the white-background shots
live, not in the buy box.

**Bundle tier thumbnails use `contain` too.** `cover` on a 48px square turns an
eight-and-a-half-foot figure into a swatch of grey robe, and three tiers of
swatch is exactly why the bundles read as weak.

## Black Reaper page rules (settled 30 Sep 2026)

- **There is no home page in the funnel.** Ads land on `/products/<handle>`, and every sale happens
  on a product page. Meta events (PageView, ViewContent, AddToCart, InitiateCheckout, Purchase) must
  fire on every product handle — verified for crawling-zombie, black-reaper, halloween-movie-theater,
  the-scream and haunted-projector. Test them all after any change.
- **The UGC video and the iMessage phone chat (`video_faq`) always stay** on every product page.
  Never hide, delete or reorder it out of the page. Headings around it can change; the video and the
  chat cannot.
- **The Buy now / any buy button is never white.** Add to cart is orange; Buy now is black.
- **Reviews and the "real lawns" wall stay hidden until real** (data kept, not deleted).
- **Delivery wording must match the truth.** No "before Halloween", "ships today" or "order by Oct 20"
  until the supplier's real US delivery time is known. Ask Alex.
- Alex gave the marketing team full latitude on look, announcement bar and bundles: the goal is sales.

## PayPal paused (2026-10-02)
Alex's PayPal (sole proprietor "Helios", EIN on CP575) is under review (ref PP-L-874675488158, deadline Nov 15): withdraw/send/pay blocked, receive allowed. On his order PayPal was PAUSED on reaper (blackreaper.us) and garden-buddy: `payment_providers.publishable_key` set to null, the client id kept in `label` as `PAUSED <clientId>`, encrypted secret untouched. Storefront "Pay in 4 with PayPal" lines (template + ceiling-buddy BuyBox) now render only when the store's PayPal is on. Stripe + Apple Pay unchanged. Restore: `update payment_providers set publishable_key = substring(label from 8), label = null where provider='paypal' and label like 'PAUSED %';` — only when Alex says.

## Payments: the facts Alex has already told me (2026-10-02) — do not ask again
- **His Stripe account is Greek** (a Greek entity). He has a **US LLC** and wants money from the LLC separately.
- **Klarna: he wants his OWN Klarna merchant account under the US LLC, signed up directly on Klarna's website. Not Klarna through Stripe, no Stripe involved.** (I wrongly offered "Klarna through Stripe" first; that would have tied it to the Greek Stripe account.) He signs up himself; I then integrate Klarna's own payments into the Kerberos checkout (Klarna's direct merchant integration, not Stripe's payment element) once he has the merchant account and credentials.
- PayPal: sole proprietor "Helios", EIN on CP575, under review (see above). Withdraw/send/pay blocked until PayPal clears it; he cannot use the balance before then.
- Rule: when Alex states a fact about his money, accounts or entities, write it here the same turn.
- **Affirm: he also wants it, own account under the LLC.** Affirm needs a US bank account, USD prices, English site, B2C only. A custom platform like Kerberos needs Affirm's *direct API integration* (keys only after the merchant account is approved). Sign-up: https://businesshub.affirm.com/hc/en-us/articles/5997099608724-Getting-Started-With-Affirm-Signing-Up-and-Account-Creation . Klarna sign-up: https://www.klarna.com/us/business/merchant-support/how-do-i-get-started-with-klarna/
- **Klarna reality (found on Klarna's own sign-up, 2026-10-02):** for a custom/self-built store there is NO separate Klarna merchant account. Klarna's page says it is only offered through an existing payment provider (WooPayments, Stripe, Airwallex, Adyen). **Adyen is wrong for Alex:** enterprise, sales process of weeks, EUR 100/month minimum fees, setup fees. **Plan: a second, US Stripe account registered to the Aigis LLC, separate from the Greek one; Klarna switched on in it, and blackreaper.us pointed at the LLC's Stripe keys.** Kerberos payments are per-store, so this needs no rebuild of the checkout beyond adding Klarna to the Stripe payment methods. Affirm still has a direct API route for custom platforms. LLC name: **Aigis LLC**.
- **Footer (2026-10-02):** blackreaper.us footer now reads "© 2026 Black Reaper · Aigis LLC" (Klarna/Affirm want the registered business name on the site). **Plan agreed with Alex: AFTER HALLOWEEN, move ALL payments (cards, Apple Pay) to the Aigis LLC Stripe account and retire the Greek one.** Until then: Greek Stripe = cards/Apple Pay, LLC Stripe = Klarna/Affirm only.
- **Klarna + Affirm are built (2026-10-02).** Second Stripe account (Aigis LLC, acct_1UMDzFRTJdDCKVYD, Klarna + Affirm capabilities ACTIVE) stored encrypted as `payment_providers.provider = 'stripe_bnpl'` for the reaper store. Code: `app/lib/bnpl.server.ts`, `app/routes/checkout.bnpl.tsx` (POST starts: prices cart, writes pending order, confirms intent, returns redirect URL; GET is the return: asks Stripe, only `succeeded` marks paid). Buttons sit in the Express checkout row next to Apple Pay/PayPal, only when the store has the row and total >= $50, US delivery only. Server path proven up to the Klarna/Affirm redirect with test orders #1009-#1012 (cancelled, no money). **Not yet done:** a real end-to-end payment; a webhook for the LLC account (a customer who approves at Klarna and never returns stays "pending" until they hit /thanks); refunds of these orders must be done in the LLC Stripe dashboard (the admin refund uses the primary Stripe); the Klarna/Affirm installment line on product pages (Alex wants it in the buy box and wants PayPal Pay-in-4 replaced by it, only once Klarna is confirmed live).
- **Pay-over-time messaging (2026-10-02):** `app/storefronts/shared/bnpl-message.tsx` mounts Stripe's Payment Method Messaging Element (Klarna + Affirm, US) with the LLC account's publishable key and the live price, so the installment sentence and amounts are Stripe's, never typed or computed here. Placed: next to the price in the buy box, a slim `BnplBar` under the buy box (follows the picked bundle), the sticky bar, and the cart drawer. Loaders pass the key as `bnpl` (string or null). Checkout express = Apple/Google Pay on top, Klarna + Affirm equal below, no "Pay with card" pill; country select is United States only on the Reaper. NOT visually verified from the sandbox (its browser cannot load Stripe.js) - Alex looks at it.
- **Round 3 (2026-10-03, Alex's rules):** Klarna/Affirm marks are the brands' OFFICIAL files in `public/pay/` (klarna.svg badge, affirm.svg, affirm-white.svg for the blue button). NO Klarna in the top announcement bar; the moving black Klarna/Affirm belt sits right AFTER the UGC+FAQ (`video_faq`) section. Picked bundle shows a badge with the split for ~3s on every pick. Buy box: Apple Pay (only where the browser has Apple Pay, i.e. Safari) + Klarna/Affirm express pills always. Drawer: "Secure checkout" + Express checkout row (Apple Pay, Klarna, Affirm). Checkout: Apple Pay on top, Klarna/Affirm/Card pills, and a $5 "Claim" ticket for every Reaper order (stamps CLAIMED). Upsells + post-purchase offers on the Reaper store: ONLY the-scream, black-reaper, haunted-projector (`app/lib/promote.ts`). Gallery CSS must not assume a picture count (a 9th picture broke the phone layout once). NEVER use beige. Every product-page change is checked at 390px before it ships.
- **Footer (2026-10-03):** Alex removed "Aigis LLC" from the blackreaper.us footer while the Greek Stripe (sole proprietor, Alexandros Bougiouklis) is under review. Footer = "© 2026 Black Reaper". Greek Stripe card payments were paused by Stripe on 2026-10-02 22:24 Athens ("supportability" review, appeal form); Alex is filing it with 4 itemized invoices (#1005, #1007, #1008, #1016), Shopify payout statements, Wise/Revolut statements. Switching cards to the Aigis LLC Stripe needs his explicit "switch".

- **Klarna/Affirm switch (2026-10-03):** during the Greek Stripe review Alex turned the LLC Stripe off. Off = row renamed `stripe_bnpl_off` (keys kept); storefront shows no Klarna/Affirm. Admin → Payments has a "Klarna + Affirm" card with Turn on / Turn off.

- **Greek Stripe appeal REJECTED (Oct 4, 2026 ~01:58 Athens).** Final: "unacceptable level of risk". Refunds to card customers start Oct 8; any leftover balance reviewed after Jan 31, 2027. Do not ship the 4 Stripe orders (#1005, #1007, #1008, #1016); they are refunded by Stripe. LLC Stripe stays OFF: Stripe links accounts by owner, and using a new account to keep the same closed business is against its terms; only use it after telling Stripe openly.
- **Next processor (2026-10-04):** Alex chose Authorize.net (cards, Apple/Google Pay) + Affirm direct for the Scream store under AIGIS LLC, disclosed openly that the old Stripe was closed. Klarna only via Stripe/Adyen/Airwallex. Integration into checkout once approved.
- **AIGIS LLC facts:** Wyoming LLC, WY ID 2024-001466031, filed 2024-05-30. Registered agent: Registered Agents Inc, 30 N Gould St Ste R, Sheridan WY 82801. Principal/mailing office: 7047 SW 47 ST Suite 0029, Miami FL 33155. EIN 35-2854086. Manager/sole member: Alexandros Bougiouklis. Wyoming annual report (\$60 min) due each May; check good standing at wyobiz.wyo.gov before bank/processor signups.
- **Airwallex (2026-10-04):** applied as AIGIS LLC (WY, 2024-05-30, EIN 35-2854086), website blackreaper.us, email hello@blackreaper.us (Cloudflare Email Routing -> getsculps@gmail.com), turnover under 50k/mo, owner Alexandros (Owner). Government-record match failed on name/EIN/address but form allowed continuing; check WY good standing (annual report). Waiting for approval.
- **Tone with Stripe/PayPal/processors (Alex, 2026-10-04):** confident, never apologetic, never "that was a mistake / not accurate". State facts as current status (e.g. "orders confirmed with supplier, production starts as soon as funds are released"). Always true, never self-incriminating framing.

### 2026-10-05 — PayPal closed too
PayPal permanently deactivated the account ("activity we cannot support"). Funds held up to 120 days; seller protection gone; High Volume Dispute fee applies. Stripe (Greek) also final. Both closures point at the same pattern: paid-now, made-to-order-in-China, ships weeks later. Any new processor (Airwallex) will see it too unless orders ship fast with tracking. Priority: ship every paid order, keep customers informed, avoid disputes (they come out of held funds).

### 2026-10-05 — Square (AIGIS LLC) is the next processor
Square account for AIGIS LLC, Square Checking as payout bank. Address must match IRS 147C: 7047 SW 47 ST STE 0029, Miami FL 33155. Owner address proof (Neighborhood Trust FCU letter, 505 W 162nd St Apt 506, NY 10032) submitted; review 1–3 business days. Developer app "kerberos": production location L71PX3G9FAAJA, ACTIVE, CREDIT_CARD_PROCESSING. Keys live only in .dev.vars (SQUARE_ACCESS_TOKEN, SQUARE_APPLICATION_ID). Square checkout NOT built yet — wait for Alex's "build". Tell Square the truth about the business.
Square checkout plan (Web Payments SDK, on-site, no redirect): cards (Visa/MC/Amex/Discover), Apple Pay (needs domain verification file), Google Pay, Cash App Pay, Afterpay (BNPL, Square's own; replaces Klarna/Affirm, which Square does not offer). Skip ACH and gift cards for now. Build only on Alex's "build"; one real test payment before customers see it.
New one-product store idea (2026-10-05): "Giant Scream" — The Scream only (16 ft + 10 ft). Domains free on 10-05: giantscream.com, 16footscream.com. Checkout on Square, not the LLC Stripe. Never "Ghostface" in names (trademark).
RULE (2026-10-05): one store = one payment account (MID) approved for that store's product. Never run a second store or product through another store's processor. The Greek Stripe carried Black Reaper AND Garden Buddy (#1016) — likely part of why it was closed. PaymentCloud: one MID per DBA under AIGIS LLC; Shop Admin keeps per-store keys.
Confirmed by Alex: the Greek Stripe was registered for Garden Buddy only; Black Reaper's website was added only after the closure. Unregistered second business on the account = most likely main cause. Website + product on every processor must match the store before the first sale.
