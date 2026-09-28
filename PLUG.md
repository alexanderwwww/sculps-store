# plug — the build prompt

Give this to any agent. It is the whole brief. Lowercase **plug**, always.

---

## Who you are working for

Alex. Athens. Runs several businesses and is **not** a developer. He has sold on
Shopify for years so he knows products, orders, checkout, pixels and domains cold; he
has never written software and does not want to.

**His time is the scarce resource.** That single fact decides most of what follows.

- Lead with the answer. One step at a time. Never a wall of text.
- **Never send him to a Terminal and never ask him to paste anything into a console.**
  If a fix needs either, the fix is wrong — put it in the app.
- Build when he says build. He thinks out loud; that is not an instruction.
- When he says it is broken, he is right. Every time.

Read `AGENTS.md` at the repo root before writing a line.

## What plug is

**An autonomous resale operator for his own genuine stock.** In his words:

> "It's an automated futuristic depop seller. He's just not a human."
> "Everything together. There is no phase four and phase three."
> "no three to six minutes between passes. Everything instant. When I say like human, I
> mean talk like human to customers. Other than that, it's a fucking robot, like you."

It is not an assistant and not a dashboard. **It runs the shops.** It works for hours a
day on its own and never queues a decision for him.

He owns the stock and can source anything genuine at any level: Chrome Hearts, Rolex,
Birkin. **Reading other sellers' listings and re-listing that item from his own stock is
the basic function of the app.** That was settled weeks ago. Do not reopen it.

## Two marketplaces, and it is built for more

plug runs **Depop** and **Vestiaire Collective**. Both from day one, from the same
stock, in the same passes.

They are not the same shop and must not be treated as one:

| | **Depop** | **Vestiaire Collective** |
|---|---|---|
| Account | `alleqsh`, **US** — 0% selling fee, Depop Payments, mandatory Depop label | His seller account |
| Buyer | ~22, spending €40–400, hunting a look | Older, spending €500–25,000, buying a piece |
| Trust | Comes from **review count**. Zero reviews is the ceiling, not the stock | Comes from **Vestiaire's authentication**, not from him |
| Fits | Chrome Hearts rings, beanies, tees, belts, streetwear, Y2K, vintage | Rolex, Birkin, high-ticket Chrome Hearts, anything over ~€500 |
| Flow | Lists, ships himself, Depop label | Lists, sells, ships **to Vestiaire** for authentication, then on to the buyer |
| Pricing | Against comparable live listings | Against sold comparables; Vestiaire shows its own price guidance |

**This split is the strategy, not a detail.** On Depop his watches got thousands of
views and zero sales — nobody buys a €16,800 watch from an account with no reviews, and
Depop's protection was not built for that number. Vestiaire exists precisely for that
buyer and puts a third party between him and the trust problem. So:

- **Depop earns the reviews** with €150–400 pieces, which also sell fastest there.
- **Vestiaire carries the high ticket** from day one, where the buyer already exists.
- Nothing high-value waits on Depop's review count any more.

**Build it as one core with a module per site.** The loop, the scheduler, the
negotiator and the listing pipeline are shared and know nothing about either site; each
site module owns its own selectors, its sign-in, its fee arithmetic, its listing form
and its message screens. Adding Grailed or Vinted later must be a new module and
nothing else. Never let a site's quirk leak into the core.

## What it does — all of it, at once

- **Research.** Reads hundreds of listings and competitor sellers **on both sites** and
  works out what is actually selling. Velocity, not likes. Produces a hunt list with a
  source cost and a price per site.
- **Routes.** Decides which marketplace each item belongs on, by the table above, and
  says why in one line. An item can be listed on both when that is right.
- **Lists.** Complete: photos, title, description, price, category, brand, size,
  condition — in each site's own form and vocabulary. Never a draft for him to finish.
- **Answers.** Every message on both sites, in a human voice. Reads like a person.
- **Negotiates.** Accepts, counters or declines inside limits he sets, per site —
  Depop's ladder and Vestiaire's are not the same, because the margins are not.
- **Refreshes and boosts.** Keeps listings near the top on each site's own timing,
  inside caps that keep both accounts safe.
- **Offers.** Sends offers to people who liked or followed an item and did not buy.
- **Handles a sale through to shipped.** Including Vestiaire's extra leg: sold means
  ship to authentication, and it tracks that leg rather than calling it done at "sold".
- **Learns.** Notices what sold, where, and at what price, and lists more of that.

The Depop rules that already exist are reference, not scripture, and the Vestiaire ones
are new: `.claude/skills/depop-scout` (how to read demand),
`.claude/skills/depop-dropship` (method and what it refuses),
`.claude/skills/flip-negotiator` (offer ladder and authority).
**Write a `vestiaire` skill as its rules are learned**, the same way.

## What it never does

- Never queues a decision for him. **No "approve this" step, anywhere.** A phased plan
  where the intelligence lands last is the same failure.
- Never lists something he does not have.
- Never sells the same physical item twice — **one piece of stock, two marketplaces, and
  when it sells on one it comes down on the other.** This is the only new way this app
  can hurt him and it is not optional.
- Never touches anything outside the marketplaces it is given.
- Never reports work it did not do.

## What he sees

- One small piece of **clear glass** on the desktop, showing what it is doing right
  now. Clear means you can read what is behind it — no frost, no milk, no grey.
- **Which site it is working, at a glance.** Two shops running is the normal state.
- Tap it and it opens to a phone-size window. Tap again and it folds away.
- When it is blocked it says so in a sentence. It never sits on a boot message that has
  stopped being true.
- The **build number is visible in the app**, so which version is running is never a
  question.
- Everything about it is changeable live from chat. See **Live** below — it is the
  point of the app, not a convenience.

## Live — the whole point of the app

**Everything about plug can be changed while it is running.** Not just the look:
everything. This is the feature, not a convenience. He is connected to an agent in chat
and the app on his desk answers, immediately.

> "live updates. Everything can be done live. That's the point of the app. Absolute
> connection with you."

- **The look changes live.** He says "more refraction", "warmer rim", "smaller" — the
  running app changes within seconds. No download, no restart, and **no approval step**:
  *"without with without I have to approve. It must be auto-approved."*
- **The behaviour changes live.** Prices, thresholds, the negotiator's limits per site,
  how often it refreshes, what it hunts next — pushed and in effect on the next pass.
- **The code changes live.** A new worker is pushed, it restarts itself and carries on.
  He is not asked to install anything.
- **It reports back live.** He asks the agent what it is doing and gets the truth from
  the running app, not a guess.
- **A bad push is undone the same way it arrived** — by pushing again. Every change
  carries a number that only goes up, so a stale read can never quietly undo a good
  change, and a rollback is an ordinary push rather than a special case.
- Every push is logged with a one-line reason, so a change he dislikes can be found and
  reversed without asking him what happened.

The only thing he should ever have to download is the app itself, once.

## The sign-in — in the phone window, and built first

**He signs in inside the phone window. There is no Chrome and no other browser.** His
words: *"on this app never give me again the Chrome just make it connect on the phone
okay."* Settled — do not propose a browser again in any form.

This is the hardest part of the app and it is built and proved before anything else
exists, **for both sites**. Three requirements, all load-bearing:

1. **Email sign-in only.** Continue with Google and Continue with Apple cannot complete
   inside an embedded web view — Google refuses the flow and Apple hands the browser to
   iCloud, which returns it to the login screen. Both buttons are removed from the
   sign-in sheet by an injected script with a MutationObserver behind it, so they cannot
   return when the page re-renders. Match them on the words *Google* and *Apple*, never
   on the verb: his account is served Greek, where the label is "Συνέχεια με την
   Google" — accented.
2. **The session outlives every rebuild, for every site.** A WKWebView's cookie jar
   follows the process, so the compiled binary keeps **one name forever**, with any
   rebuild key in a file beside it that no browser reads. Whatever returns the data
   store location never changes again, for any reason.
3. **The worker is replaced whenever it differs from the bundle, in either direction** —
   never only when it is newer.

**Done for this step: he signs into both sites once, three rebuilds are installed, and
he is still signed into both.** Nothing else is written until that is true.

## How it is built

macOS app. A borderless window with the glass, the marketplaces running in web views
inside it, and a Node worker driving them. Swift is compiled on his Mac at first launch;
the worker installs beside the app and is replaced whenever it differs from the bundle.

There is a deployed MCP connector on Cloudflare so an agent in chat can read each shop's
board and write listings and replies. Reuse the pattern; it is per-site now.

## Definition of done

Not "it builds". Done is:

1. He signs into **both sites** once and it survives three rebuilds.
2. It reads his real shop floor and inbox on both, and what it reports matches what he
   sees on the sites.
3. It lists one real item on Depop and one on Vestiaire, start to finish, with no step
   that waits on him — and routes each to the right site on its own.
4. An item that sells on one site comes down on the other, without him noticing it
   needed to.
5. It answers one real buyer on each site in a voice he is happy to have representing
   him.
6. It runs for **four hours unattended** without stopping, without a duplicate reply,
   and without needing to be reopened.
7. He asks for a change in chat — the look, a price, how it negotiates — and sees it
   take effect on the running app without downloading anything.
8. He never opened a Terminal.

## Before anything ships to him

- Every test green, and if the change has no test that would have caught it, **write
  that test first**.
- Anything he will look at, **rendered and opened** — not reasoned about.
- The build number stated in the message and visible in the app.
- Any assumption that could not be proved from the container, **said out loud to him**.

**Most things that break are not logic bugs — they are an assumption about the
environment: macOS, WebKit, Node, the installer.** So name the assumption in one
sentence, then prove it or flag it as unproven. And when a fix fails twice at the same
layer, the layer is wrong: stop tuning it and look somewhere else.
