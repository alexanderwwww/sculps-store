# Shipping Magic Wand — the build order

The shortcut nobody has noticed: the platform already exists. Kerberos runs on
Cloudflare Workers with Neon and Stripe, all paid for, all working. The licence
server, the checkout and the download page are routes on something that is
already live. This is not a new stack — it is a few more files.

## What Alex has to do himself (nothing technical, but nothing else can finish without it)

1. **Enrol in the Apple Developer Program.** About $99 a year, needs a photo ID,
   takes a day or two to approve. Start this first — it is the only step with a
   waiting period, and without it every customer meets the Gatekeeper wall
   three times and half of them give up.
2. **Buy a domain.** Anything short.
3. **Make a Stripe product** — one monthly price. Same Stripe account.

Everything below is a build job.

## The build, in order

### 1 — Serve the selectors (half a day)

The one change that turns a private tool into a product. The app fetches the
selector config on launch instead of having them compiled in, so a page change
is a one-line push rather than a dead product and a release cycle.

Same mechanism as the prompt queue, which already works. Add a version field so
an old build never gets selectors it cannot use.

### 2 — Phone home when something breaks (an hour)

An anonymous ping when an attach or a send finds nothing: which site, which
selector, which app version. The first customer to break becomes the alarm
instead of a support email three days later.

### 3 — Licences (a day)

- A `licences` table beside the existing ones.
- `POST /activate` — takes a key and a machine id, returns valid or not, marks
  the machine. Two or three machines per licence, so a laptop and a desktop
  work but a shared key does not.
- The app checks on launch and caches the answer for a fortnight. **Fails open**
  on a network error — an outage must never brick somebody's afternoon.

### 4 — The activation screen (half a day)

First launch asks for the key, one field, one button. After that it is never
seen again. Settings has a Deactivate for moving machines.

### 5 — Sign and notarise (half a day, once the Apple account exists)

Sign the bundle, send it to Apple, staple the ticket. Then it opens on a
double-click like any bought app — no right-click, no Privacy & Security, no
"unidentified developer". This is the single biggest difference between a
thing people trust and a thing people abandon.

### 6 — The installer (an hour)

A `.dmg` with the app and an arrow at the Applications folder. Nothing else in
the window.

### 7 — Checkout and delivery (a day)

- Stripe subscription, hosted checkout — no card form to build or secure.
- Webhook on payment: generate a key, write the row, email it with the download
  link.
- Webhook on cancellation: mark the licence dead. The app finds out at its next
  check.

### 8 — The page (a day)

One page. The video above the fold, playing on loop, no sound. What it does in
one line. The price. One button. Three screenshots. A short FAQ that answers
the real objections: does it use my own account (yes), do I need an API key
(no), what happens if Google changes something (it is fixed centrally, usually
within the hour), can I cancel (yes).

Plus terms and privacy, which have to say plainly that it automates sites whose
rules do not allow it and that an account can be suspended. People should
choose that knowingly.

### 9 — Ship it

A week of work if the days are real. The Apple approval is the only thing that
cannot be hurried, which is why it goes first.

## Then, and only then

Post the videos. Daily, for a month, before drawing any conclusion.

## The order that matters more than any of this

The Halloween store first. It earns money in October; this earns money in a
quarter, if it earns money at all. Finish the seven pages, connect Stripe,
advertise. Then build this.
