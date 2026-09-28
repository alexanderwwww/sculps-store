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

Read `AGENTS.md` at the repo root and `.claude/skills/shipping/SKILL.md` before writing
a line. The second one is every mistake already paid for on the app this replaces.

## What plug is

**An autonomous Depop seller for his own genuine stock.** In his words:

> "It's an automated futuristic depop seller. He's just not a human."
> "Everything together. There is no phase four and phase three."
> "no three to six minutes between passes. Everything instant. When I say like human, I
> mean talk like human to customers. Other than that, it's a fucking robot, like you."

It is not an assistant and not a dashboard. **It runs the shop.** It works for hours a
day on its own and never queues a decision for him.

The shop is `depop.com/alleqsh`, a **US account** — 0% selling fee, Depop Payments,
mandatory Depop label, so every parcel passes through his hands. He is not
dropshipping. He owns the stock and can source anything genuine at any level: Chrome
Hearts, Rolex, Birkin.

**Reading other sellers' listings and re-listing that item from his own stock is the
basic function of the app.** That was settled weeks ago. Do not reopen it.

## What it does — all of it, at once

- **Research.** Reads hundreds of listings and competitor shops and works out what is
  actually selling. Velocity, not likes. Clusters them into a trend and produces a hunt
  list with a source cost and a price.
- **Lists.** Takes a winner and lists it from his stock, complete: photos, title,
  description, price, category, brand, size, condition. Never a draft for him to
  finish.
- **Answers.** Every message, in a human voice. Reads like a person, not a bot.
- **Negotiates.** Accepts, counters or declines inside limits he sets. Only the
  genuinely unusual reaches him.
- **Refreshes.** Re-lists live items on Depop's own timing so they stay near the top,
  inside caps that keep the account safe.
- **Offers.** Sends offers to people who liked something and did not buy.
- **Learns.** Notices what sold and lists more of that.

The rules, thresholds and refusals already exist and are not to be re-derived:
`.claude/skills/depop-scout` (research), `.claude/skills/depop-dropship` (method and
what it refuses), `.claude/skills/flip-negotiator` (offer ladder and authority),
`.claude/skills/flip` (where the account stands and why).

## What it never does

- Never queues a decision for him. **No "approve this" step, anywhere.** A phased plan
  where the intelligence lands last is the same failure.
- Never lists something he does not have.
- Never touches anything outside Depop.
- Never reports work it did not do.

## What he sees

- One small piece of **clear glass** on the desktop, showing what it is doing right
  now. Clear means you can read what is behind it — no frost, no milk, no grey.
- Tap it and it opens to a phone-size window. Tap again and it folds away.
- When it is blocked it says so in a sentence. It never sits on a boot message that has
  stopped being true.
- The **build number is visible in the app**, so which version is running is never a
  question.
- The look is changeable live from chat — he says "more refraction" and the running app
  changes, with nothing to download and no approval step.

The glass is settled in `.claude/skills/flip-ui/SKILL.md`. Five rejected builds are
encoded there. **Read it before changing a pixel.**

## The sign-in — decided, and built first

**He signs in inside the phone window. There is no Chrome, and no other browser.** His
words: *"on this app never give me again the Chrome just make it connect on the phone
okay"*. That is settled; do not propose a browser again in any form.

This is the hardest part of the app, not the easiest, and it is what broke every single
time on the app plug replaces. Build and prove it **before anything else exists**.

Three things follow from it, and all three are load-bearing:

1. **Email sign-in only.** Continue with Google and Continue with Apple cannot complete
   inside any embedded web view — Google refuses the flow outright and Apple hands the
   browser to iCloud, which hands it back to the login screen, forever. Those two
   buttons must be removed from Depop's sign-in sheet by an injected script with a
   MutationObserver behind it, so they cannot reappear when the page re-renders. Match
   them by the words Google and Apple, not by the verb: his account is served Greek,
   where the label is "Συνέχεια με την Google" — accented, which broke the first
   attempt.
2. **The session must outlive every rebuild.** A WKWebView's cookie jar is derived from
   the process, so anything that changes the executable's name, its path, or the app's
   identity moves the jar with it and signs him out. The compiled binary keeps **one
   name forever**, with any rebuild key in a file beside it that no browser reads.
   Whatever returns the data store location must never change again, for any reason,
   including a good one — a "safety" guard on it once turned a signed-in app into a
   signed-out one.
3. **The worker must be replaced whenever it differs from the bundle, in either
   direction.** A launcher that only installs a *newer* worker pins his Mac to the
   first version that ever landed, and every fix after it looks like it was never made.

**Done for this step is: he signs in once, then three consecutive rebuilds are
installed, and he is still signed in.** Nothing else gets written until that is true.

## How it is built

macOS app. The shape that works: a borderless window with the glass, a real browser
doing the work, and a Node worker driving it. Swift is compiled on his Mac at first
launch; the worker installs beside the app and is replaced whenever it differs from the
bundle, in either direction.

There is a deployed MCP connector (`app/routes/flip.$.tsx`) so an agent in chat can
read the shop's board and write listings and replies. Reuse it; rename it to plug.

## Definition of done

Not "it builds". Done is:

1. He signs in **once** and it survives three rebuilds.
2. It reads his real shop floor and his real inbox, and what it reports matches what he
   sees on Depop.
3. It lists one real item, start to finish, with no step that waits on him.
4. It answers one real buyer in a voice he is happy to have representing him.
5. It runs for **four hours unattended** without stopping, without a duplicate reply,
   and without needing to be reopened.
6. He never opened a Terminal.

## Before anything ships to him

- Every test green, and if the change has no test that would have caught it, **write
  that test first**.
- Anything he will look at, **rendered and opened** — not reasoned about.
- The build number stated in the message and visible in the app.
- Any assumption that could not be proved from the container, **said out loud to him**.

**The pattern behind almost every failure on the last app was an assumption about the
environment — macOS, WebKit, Chrome, the installer — never checked, shipped as if it
had been.** Name the assumption in one sentence, then prove it or flag it. And when a
fix fails twice at the same layer, the layer is wrong: stop tuning it.
