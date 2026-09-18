# Magic Wand as a product — the brief

## What people would actually be buying

Not the browser automation. The workflow:

- One picture of your product in, a folder of finished shots out
- Somebody else writing the prompts (the hard part nobody wants to learn)
- Batch — 44 shots, one click, walk away
- The reference photo attached to every single prompt, so it never drifts
- It looks and feels like a real app

That is a product. People pay for it.

## Why the current build cannot be the one you sell

It drives Gemini and ChatGPT's websites. Three problems, all fatal at scale:

1. **It breaks on their schedule, not yours.** One layout change and every
   customer's copy stops working on the same morning. Support burns the margin.
2. **Their terms forbid it.** Selling a tool whose only function is automating
   their site is the thing that gets a cease-and-desist, and it arrives after
   you have taken money and have customers.
3. **It cannot scale past one machine.** Every customer needs their own Chrome,
   their own login, their own laptop awake.

Fine as a private tool. Not a business.

## The version that is a business

Same app, same wand, same card, same queue. Different engine: the official
image APIs instead of a browser. Nothing about how it feels changes.

That fixes all three at once — it is permitted, it does not break when a page
changes, and it can run without a browser at all.

**Two ways to charge, and the first is much easier:**

- **Bring your own key.** They paste an API key, you charge a flat monthly fee
  for the app. No payment risk, no credit accounting, no support for somebody
  else's outage. Ship this first.
- **Credits.** You buy generation wholesale and resell it. Better margins,
  much more work: billing, abuse, refunds when a model returns rubbish.

## Price

A flat monthly fee in the range where nobody has to think about it — the
comparison is a freelancer at a few hundred per shoot, not another app. One
sale a month pays for it, which is the only argument that matters.

## Who it is for, specifically

Not "everybody". The person who has a product photo and needs forty listing
images by Friday: dropshippers, Etsy sellers, small brands, agency juniors.
They already know what they want and cannot write prompts. That is the whole
pitch.

## The MCP idea

Doable, and it makes the demo better, not the business. An MCP server would let
Claude queue jobs directly — which is already how Alex uses it. Worth building
once the paying version exists; it is a feature, not a moat.

## What sells it: the screen recording

The thing people reacted to is watching it work. A wand flying across the
screen, sparkling, typing, and pictures appearing.

- Screen recording, no voiceover, no face
- One product photo dropped on the card, Submit, then speed it up
- End on the folder: forty images, one click
- Same format every time. The format is the brand.

Instagram and TikTok both. It is a satisfying-process video that happens to be
an advert, which is the cheapest distribution there is.

## Order to do it in

1. Finish the Halloween store. It pays now; this does not.
2. Swap the engine to the official APIs, keep every pixel of the UX.
3. Bring-your-own-key, flat fee, one landing page.
4. Post the screen recordings. If nobody bites, nothing is lost but a weekend.
5. Credits and MCP only once people are paying.

The store first. This is the better idea and the slower money.

## The distribution architecture

The shape Alex described, which is the right one:

    website  ->  download  ->  app installs  ->  registers itself with Claude
                                             ->  user talks to Claude, work happens

**How the pieces fit**

1. **Website.** One page, one download button, one price. Nothing else.
2. **The app** ships as a signed, notarised `.dmg`. Drag to Applications, done.
3. **On first launch it registers itself as an MCP server** with Claude Desktop
   — MCP is an open protocol and Claude Desktop reads local servers out of a
   config file, so the installer adds its own entry rather than asking anybody
   to edit JSON. Claude restarts, the tools are there.
4. **A skill ships inside it**, so Claude already knows the workflow: how to
   write prompts for product photography, how many shots a listing needs, what
   to attach. The customer says "forty images for this product" and it happens.
5. **The app does the generating** — through the official image APIs, not a
   browser (see above for why that matters).

**What actually makes this hard, in order**

- **Notarisation.** Every customer will hit the same Gatekeeper wall Alex hit,
  three times, unless the app is signed and notarised by Apple. That needs a
  paid developer account and a build step. It is not optional for something
  people pay for — the first support email is always this.
- **Licensing.** Something has to check whether this copy is paid for, and do
  it without a server outage bricking somebody's afternoon.
- **The config write.** Editing another app's configuration file from an
  installer is doable and has to be careful: merge, never overwrite, and leave
  it valid if the customer already has other servers configured.
- **Claude Desktop must be installed.** The app should detect and say so
  plainly rather than failing silently.

**What makes this good rather than merely possible**

The MCP angle is the moat, not the wand. Anyone can write a script that calls
an image API. Very few can say "it plugs into Claude, and Claude already knows
how to use it" — that is a real product difference and it is also the demo:
you type a sentence into Claude and forty product photographs appear.

Build order stays the same: the store first, then the API swap, then this.
