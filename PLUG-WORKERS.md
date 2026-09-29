# plug — what the workers do, and how the shop makes money

Handoff for any agent building plug: ChatGPT, Codex, Claude. This is the whole
operating manual in one file — the goal function, every worker, the money loop
step by step, and the numbers that are already decided. Nothing here is up for
re-derivation; where something is genuinely unknown it says so.

Alex is the owner. He is not a developer. **He knows this business better than
any of us** — he is a real plug, he has run many Shopify stores, and he sources
genuine goods at every level. Do not explain resale to him. Build the thing.

---

## 0. The goal function, in one line

> **Turn his stock into money on Depop and Vestiaire Collective without ever
> handing work back to him.**

His own words, and they are the spec:

> *"It's an automated futuristic depop seller. He's just not a human."*
>
> *"Everything together. There is no phase four and phase three."*
>
> *"no three to six minutes between passes. Everything instant. When I say like
> human, I mean talk like human to customers. Other than that, it's a fucking
> robot, like you."*
>
> *"live updates. Everything can be done live. That's the point of the app.
> Absolute connection with you."*

Four consequences, and they are not negotiable:

1. **It presses.** Never "you press List", never "approve this", never a queue
   of decisions waiting for him. **Auto-approved** is his standing instruction.
   The one exception is the ＋ button, where *he* starts the flow by dropping
   photos in.
2. **No phases.** The reading IS the product. A lister without the Scout is a
   worse version of him, and shipping it that way is failing the brief.
3. **Robot pace.** No persona hours, no day off, no reading delay, no typing
   theatre. Actions 150–600ms apart, keystrokes at 8ms. The *only* human thing
   is the **words** it writes to buyers.
4. **One download, ever.** Fixes arrive live, not as a new zip each time.

What still protects the account is **arithmetic, not mime**: the per-pass cap,
the daily cap, and the refresh rules. Those stay. See §6.

---

## 1. The money, stated plainly

- **The account is United States** (he has an ITIN, US banks, real presence).
  → **0% selling fee** on listings created after July 2024. Only processing,
  **~3.3% + $0.45**.
  → **Depop Payments**, so **Depop Protection** governs disputes.
  → **Depop's shipping label is mandatory**, and payout follows the delivery
  scan.
- **Therefore he is NOT dropshipping.** The parcel carries Depop's label, so it
  passes through his hands. He holds genuine stock and ships it himself.
  Fulfilment is *print the label, pack it, drop it off* — never "paste the
  buyer's address into AliExpress".
- **Margin is clean:** source cost → ask price, with only processing in
  between. Not 13% all-in like the Greek case in the older files.
- Anything in the old knowledge files assuming 10%, PayPal, no labels, IOSS or
  DAC7 is **written for the Greek case and does not apply.** Read those files
  for craft, never for numbers.

### The ceiling, and it is not the stock

**His ceiling is set by his review count, not by his stock.** As of 28 Sep 2026:

| | |
|---|---|
| Earnings | **US$0** |
| Sales | **0** |
| Active listings | **6** |
| Potential revenue | **€38,846** |

Live: Chrome Hearts hoodies at €850 and €5,200, a Rolex Datejust €14,400 →
€10,080, a Day-Date €24,000 → €16,800. Depop says *"your items are getting lots
of views."*

**Views without sales is never traffic. It is trust or price.** Nobody buys a
€16,800 watch from an account with zero sales and zero reviews. The views are
real and worthless — people looking at a Rolex the way they look at a
Lamborghini in a car park.

**The ladder, and it is the whole strategy:**

1. List **€150–400 Chrome Hearts** — rings, beanies, tees, belts, a cross
   pendant. Exactly what Depop buyers hunt, they actually sell, and each one is
   a review.
2. **5 reviews** → the €850 hoodie becomes credible.
   **20 reviews** → €5,200 does.
3. **The watches do not belong on Depop yet.** Chrono24, eBay, a watch forum —
   or **Vestiaire**, which is why Vestiaire is in the app. Keep one live on
   Depop as a shop window; never wait on it.
4. **Payments set up first** or none of it pays out. That step is his.

He is also **already discounting**, which on luxury reads as doubt rather than
value. Depop's "set a discount" nudge is generic and aimed at €30 tops. **Do
not follow it on a watch.**

---

## 2. The workers

One loop, everything at once. Each worker is a module with a pure decision core
(testable with no account) and a thin driver that touches the page.

| Worker | Job | Reads | Writes |
|---|---|---|---|
| **scout** | Works out what actually sells | Depop/Vestiaire listings in bulk; TikTok, Pinterest, Vinted, Grailed, eBay sold; AliExpress order counts | hunt rows |
| **grabber** | Takes a winning item found in the wild and turns it into one of his | a competitor listing | a draft item + generated images |
| **composer** | Title, description, attributes, hashtags, price | hunt row / grabbed item / his ＋ photos | a listing ready to post |
| **lister** | Posts it, on the right marketplace, inside the caps | listing + schedule + route | a live listing id |
| **negotiator** | Answers buyers, negotiates, closes | inbox, offers | replies, accepts, counters |
| **keeper** | Refreshes, sends offers to likers, drops prices | live listings, likes, age | refreshes, offers |
| **settler** | Sold → pull every other listing of that item, then fulfil | sale events | takedowns, label, tracking |
| **learner** | Says what the shop actually is | sold history | clusters, next hunt bias |

### scout — the eyes

**The advantage, stated plainly:** a human opens twenty tabs, eyeballs them and
picks. That is the ceiling of the entire field. plug reads **every listing in a
category** — five hundred, a thousand — and *counts*. Arithmetic where everyone
else has intuition.

Questions no human on Depop can answer, and the scout must:

- Of every tote listed in 30 days, **which price band converts** — not which is
  most listed, which gets into bags.
- Which **words in a title** appear disproportionately in the ones that sold.
- Which **colourway** moves and which sits.
- Which **aesthetic** is rising week over week, before it is obvious.
- Which sellers are **actually selling** versus which just list a lot.

**Signals, ranked by how much they prove:**

1. **"in N people's bags"** — strongest signal on the platform.
2. **offers sent** — wanted it enough to negotiate.
3. **sold count on the profile**, with the review count beside it.
4. **likes** — interest, not intent. Tiebreak only. 26 likes and zero bags is
   dead.

**Every raw number must be divided before it means anything:**

- **by age** — 4 bags in three days ≠ 4 bags in three months. Depop does not
  print the date on a card, so open the listing or remember when you first saw
  it. **Velocity, not totals.** This is the correction that separates plug from
  every tutorial.
- **by the seller's reach** — 10 offers on a 20k-follower shop is weak; on 200
  followers it is the product doing the work.
- **by price** — demand at €12 and at €120 are different businesses.

**Where it looks, on Depop, in this order:** category + brand **"Other"** → a
**~€20 price floor** → **aesthetic terms as searches** (not garment names) →
**winning sellers' whole shops** → **his own sold items** (the most valuable
data he owns, and nobody can copy it).

**Off-platform, for what is about to happen:** TikTok and Reels (aesthetic names
appear here weeks before they are Depop search terms — the leading indicator),
Pinterest (what gets saved is next season's search), Vinted/Grailed/eBay sold
(is the demand real or a Depop bubble), AliExpress order counts (crude but
honest volume read).

**The aesthetic vocabulary** — buyers shop by aesthetic, not by garment. Getting
the word right is most of getting found:

| Aesthetic | Reads as | What moves |
|---|---|---|
| Y2K | 2000s, low-rise, shiny | baby tees, cargo, micro bags, butterfly, tinted sunglasses |
| coquette | bows, lace, pink, soft | ribbon detail, mary janes, cardigans, slip dresses |
| downtown / indie sleaze | messy, 2008, flash photo | band tees, leather, skinny scarves, ballet flats |
| dark academia | tweed, libraries, autumn | blazers, pleated skirts, loafers, signet rings |
| grunge / emo | black, studs, alt | band merch, plaid, chunky boots, chokers |
| gorpcore | outdoors in the city | fleeces, shells, Salomon-adjacent, Carhartt |
| clean girl / minimal | quiet, beige, gold | slip skirts, fine jewellery, plain knits, totes |
| streetwear | hype-adjacent | graphic tees, workwear, technical outer |

**Pick the person, not the niche.** An aesthetic is a person; a season is not. A
beach niche dies in November.

**Output is never "this is trending."** It is a row he can act on:

```
carhartt detroit jacket · brown · gorpcore
  demand    14 bags / 31 offers across 22 live listings, 30 days
  velocity  rising — 6 of those bagged in the last 7 days
  price     converts at €85–110; below €70 sits, above €130 sits
  source    €38 · verified supplier · 14 day ship
  spread    €52 at the middle of the band
  why       every one that sold said "detroit" and "brown" in the title;
            the black ones sit
```

Four things every row must carry: **proof it sells**, **the band that
converts**, **what it costs to get**, and **the one sentence that explains it.**
A recommendation without the sentence is a guess wearing a number.

**Never present a number it did not read.** If the listing age could not be got,
it says "age unknown" — it does not invent a velocity.

### grabber — "he sees an item out there, he grabs it, he lists it"

This is the part he keeps describing and it is the heart of the app. The scout
finds a listing that is proven to sell. The grabber turns it into *his*:

1. **Read the winner** — title, description, attributes, price, bags, offers,
   the seller's other stock.
2. **Reverse-image it to a source** (AliExpress/1688/his own supply) for the
   cost, when it is a sourced good. When it is something he already holds,
   skip — he is the plug.
3. **Never repost their photograph or their description.** Their image is
   **reference input** for generating his own. Depop keeps a catalogue of
   supplier and review images; posting one is the documented ban trigger, and
   every dropshipper already knows the review-picture trick. Generating is
   automatic, in the same pass, **no slower**.
4. **Generate the image set** — realistic enough that a scrolling buyer stops
   and believes it; accurate to what actually arrives, or the refunds come; and
   **consistent** — same background, same light, across the whole shop. Several
   angles per item, one flat-lay hero, same surface.
   > *"A bunch of random pictures on random models — even if you can't think
   > about it consciously, your subconscious tells you this is sketchy."*
5. **Write its own copy** (§composer) and hand it to the lister.
6. **No permission step anywhere in this chain.**

**Photos, when the piece is in his hands** — four, in this order:
1. **Styled or on a body.** Modelled beats flat lay. This is the cover and it is
   most of the decision.
2. **Detail** — fabric, label, hardware, the thing that proves it is real.
3. **Full flat lay with measurements.**
4. **The flaws.** Shown, not hidden. Hiding them produces claims.

Natural light near a window, golden hour, never harsh midday. Clean white or
cream wall, brick, texture, or outside. On a €900 piece his own photographs beat
every dropshipper on the platform — that is the moat, not a chore.

### composer — the words

**Title:** `[Brand] [Style] [Era] [Colour] [Feature]`
→ *Levi's 501 Vintage 90s Blue Straight Leg Jeans*

The most specific thing a buyer would type goes first. Vague titles are the
single most common self-inflicted wound. Ranking weight: **title → hashtags and
category → description**.

**Hashtags:** use all five, no penalty for the full allowance. Specific beats
broad — `#vintagedenim` over `#vintage`. Generic tags read as spam.

**Description:** casual, conversational, **written fresh every time** (duplicate
descriptions are flagged). Era, brand, material, **measurements in inches** (pit
to pit, length — not just the size label), fit range, a styling line, condition
including every flaw. Fill the optional attributes (material, fit, style); they
are search signals.

**Condition:** his stock is **new** and the listing says **new** — that is both
accurate and the stronger word. *Never* "worn once" to fake a secondhand
history. (Depop's automated checks do give "brand new" a second look on a
secondhand platform; "like new" is the sourced-goods convention. Truth first.)

**Two registers, one voice:** light and warm on a €25 baby tee, calm and spare
on a €900 jacket. The same voice on both loses one of them.

### lister — the hands

Posts the listing on the marketplace the router chose, inside the caps. Fills
every field. Presses the button. Records the listing id against the **item**,
not against the site (§5).

### negotiator — the daily money

Reply time is a **ranked signal**, and nobody else is answering at 2am. Inside
**four hours, always**. Inside the rules below it **closes on its own** — that
is not a risk, it is the app doing its job while he sleeps.

Two numbers per item (or a shop default): **ASK** (listed) and **FLOOR** (the
lowest he will take — never shown, never hinted, never reachable by asking
twice). Every row is a % of ASK, and nothing settles below FLOOR:

| Offer | What plug does |
|---|---|
| **≥ 92% of ask** | **Accept**, immediately. Haggling over 8% costs more in lost sales than it wins. |
| **80–91%** | **Counter at 95%**, once. Back at ≥ 88% → accept. |
| **70–79%** | **Counter at 88–90%.** If they hold, one final at 85% *if* above FLOOR. |
| **50–69%** | **One counter at FLOOR + 5–10%**, framed as the best he can do. No ladder after it. |
| **< 50%** | **Decline warmly, no number.** A number here teaches them the ask is fiction. |
| **Below FLOOR, ever** | Never. Not on the third message, not on a bundle, not "just this once". |

Two overrides: **sitting 2+ weeks with likes** → may go to FLOOR + 5% on its own
(dead stock is worse than a thin margin); **a buyer with real history** earns one
extra 2–3% of goodwill (repeat buyers are the cheapest revenue there is).

**Always handed to Alex, no autonomy ever:** authenticity questions ("is this
real", "does it come with the box") — *he* answers, because he knows and because
a careless sentence becomes a claim; **bundles across several items** crossing a
floor; **anything mentioning refund, return, dispute, "not as described"**;
**requests to go off-platform** (WhatsApp, Instagram, direct payment — always
declined, politely and firmly: it voids every protection and it is how sellers
get scammed); **custom requests / "can you get me X"** — that is his sourcing;
**anything it does not understand** — silence with a flag beats a confident
wrong answer.

**The voice:** short, lowercase-leaning, a person with a rail of clothes, not a
business. Answer the question first, then the useful thing. Match their length.
**No exclamation marks on a high-ticket item** — they read as a sales floor and
undercut the authority that sells a €900 piece. Never apologise for the price.
Never mirror rudeness (a rude buyer is a future dispute — be short, be correct,
leave a clean record).

Openers, answered:
- **"is this still available?"** → `yeah it's still here` — plus, if it is
  sitting, one line that moves it: `fits like a medium, pit to pit 52`.
- **"what's your lowest?"** → never FLOOR. `make me an offer and i'll see what i
  can do.` Their number is information; his number is a ceiling on himself.
- **"would you do X?"** → the ladder, no deliberation theatre.
- **"is it real?"** → to him. Always.

Never: a number below FLOOR; a delivery promise it cannot keep; a claim that a
human wrote it *or* that one did not; fake scarcity or fake other-buyers.

### keeper — refresh and offers

- **Refresh once per 24h per listing, never more.**
- Peak windows **12:30** and **19:30**.
- Refresh the **15–20 most-liked**, not the whole shop.
- **Never refresh dead stock with zero engagement** — that is read as artificial
  activity and penalised. This is the line that must not be crossed.
- **Offers to likers:** 10–15% off to people who liked something sitting **two
  weeks or more**, about every **3–4 days** on a stagnant listing.
- A **price drop notifies likers** — a drop is a free push.

### settler — sold, and the one way plug can really hurt him

**He owns ONE Birkin.** If it is live on Depop and on Vestiaire and both sell,
he has taken money for an item he cannot ship — on a platform where that is the
fastest way to lose an account, at four figures, with a buyer already waiting
for authentication.

So: **the record is the item, never the listing.** A listing is something an
item HAS, on a site, with an id. When one sells, **every other listing of that
item comes down before anything else happens** — and the sale and the takedowns
leave the function together, so nothing can mark it sold without pulling the
rest. A double sale is reported **loudly**: he has to refund somebody and he
should hear it from the app first.

Then fulfilment: buyer's details from Depop → **print Depop's label** → pack →
drop off. Payout follows the delivery scan.

### learner — what the shop actually is

> *"Two items that did great and they're both emo? Upload more emo. Two that did
> nothing and they're both hats? Upload fewer hats."*

Cluster what sold by aesthetic, garment, colour and price band. Say what the
shop *is*, in one line. Name the dead stock, how long it has sat, what it is
costing. Hold the target as arithmetic: at his real average sale and margin, how
many listings a day that needs, and whether the shop is short.

---

## 3. The money loop, end to end

```
scout reads in bulk ─┐
  ＋ his own photos ─┤→ item ─→ route (§4) ─→ schedule allows? (§6)
    grabber a winner ┘                            │
                                                  ▼
                              composer → images → lister → LIVE
                                                  │
                    ┌─────────────────────────────┼──────────────────┐
                    ▼                             ▼                  ▼
              negotiator (≤4h)              keeper (refresh,     learner
              accept / counter               offers, drops)    (what sold)
                    │                                                │
                    ▼                                                │
                  SOLD ──→ settler: pull every other listing ────────┘
                             → label → pack → ship → payout
```

Every arrow is automatic. The only two places a human appears: **Alex answering
an authenticity/dispute question**, and **Alex physically packing the parcel.**

---

## 4. Routing — which marketplace an item goes to

Already coded in `tools/plugapp/worker/route.mjs`:

- **`DEPOP_CEILING` = €40,000** in cents — above this, Depop is not the venue.
- **`VESTIAIRE_FLOOR` = €50,000** in cents — below this, Vestiaire is not worth
  the friction.
- **`REVIEWS_FOR_MID` = 5**, **`REVIEWS_FOR_HIGH` = 20** — the trust ladder from
  §1 expressed as code. An item priced above what his review count supports does
  not go live on Depop yet.
- `routeFor(item, shop)` → which sites this item may be listed on now.
- `huntBand(shop)` → the price band the scout should be hunting in *today*,
  given his current review count. This is what stops it hunting Birkins for an
  account with zero reviews.

**Vestiaire specifics are not yet written down anywhere.** Fees, authentication
flow, listing form, and its own negotiation norms are **unknown** and must be
read from the real site before anything is claimed about them. Do not copy
Depop's numbers across — that is exactly the "never carry another app's model
over wholesale" mistake that put Fiverr pacing into a resale app.

---

## 5. The data model

In `tools/plugapp/worker/stock.mjs`, and it is deliberately small:

```
item = { id, title, priceCents, brand, photos[], listings: { site → {id, state, at} }, soldOn }
state ∈ { live, sold, pulled }

makeItem()   listed(item, site, listingId)
sold(item, site) → { item, takedowns[], trouble }   // together, always
canList(item, site) → { ok, why }                   // no photos → never listed blind
liveCount(items)    listedOn(items, day)            // counts ITEMS, not listings
```

`listedOn` counts **items, not listings** on purpose: cross-listing one Birkin
on both sites is one item. Counting listings would let the schedule hit its
target by posting the same bag twice, and the number he reads would be
flattering him by double.

---

## 6. Cadence — the caps that keep the account alive

Depop bans on **rhythm**, not on tooling. Reported case: ~40 follow actions a
minute → rate-limit ban in six hours.

- **Account under 6 months: ~5 listings a week.** Over 6 months with history:
  effectively unlimited. **The age of the account decides, not the ambition.**
- **3–5 new listings a week minimum** to stay in favour once warm; 1–2 a day if
  the stock is there.
- The cap is **a number in settings**, defaulted from the playbook and **raised
  by him whenever he wants**, enforced by the app so a good week does not end
  the shop. It is a dial he owns, never a refusal.
- **Reading budget is separate from acting budget.** Browsing is free, but the
  scout reads far more than a person would — human gaps between pages, no
  bursts. A shop banned for *looking at things* is the stupidest possible way to
  lose this.

### The growth curve — φ over a seven-day cycle, then reset

In `tools/plugapp/worker/schedule.mjs`. Golden ratio, bounded:

```
day   1  2  3  4  5  6  7   → reset
new   1  2  3  4  7  11 18  → 1
```

`PHI = 1.618`, `CYCLE_DAYS = 7`, `targetForDay(day)`, `cycle()`, `dayOfCycle()`,
`plan({ day, done, ready, allowed })`.

**No catch-up.** A missed day is gone; it is never added to tomorrow. He
explicitly rejected an unbounded ramp: *"it will be flooded. Correct."*

---

## 7. The ＋ button — his own stock

The one flow he starts. He drops photos onto the ＋; the agent detects the
model, writes **both** listings (Depop and Vestiaire), prices them, and he
presses Publish. This is the single place a Publish button is correct, because
he is the one who began it.

---

## 8. What plug will not do, and the refusal is in the code

Four practices appear in the sellers' own walkthroughs that are not aggressive
tactics — they are the end of the business:

1. **Misstating the account's country** (one seller sets US → UK purely to
   escape Depop's label-and-delivery protection). Alex has genuine US and Greek
   positions; lying about location defeats the platform's payment protection and
   when caught the balance goes with the account. **plug states a true country.**
2. **Replicas.** Closed by him — everything he sells is genuine. The rule stays
   in the code anyway, because it is the one mistake that cannot be undone:
   counterfeit trafficking is a crime, not a policy breach, and it ends in
   seized funds and chargebacks. **plug does not list an item it cannot treat as
   genuine, and asks when sourcing is ambiguous rather than assuming.**
3. **Copying a competitor's photo or description.** Someone else's copyright,
   Depop detects duplicates, and it drops the shop into the same image catalogue
   as everyone else. **plug writes and generates its own, always.**
4. **Inventing a history the item does not have.** His stock is new, so the word
   is **new** — also the stronger word, and the one that does not get quoted
   back in a claim. **plug describes the item truthfully.**

Plus, from the authenticity rule that ends businesses: Chrome Hearts is among
the most counterfeited brands on earth and Depop is aggressive — a buyer claim
takes the money *and* the item, and repeats kill the shop. Everything listed has
to be genuine and **provable**: receipts, tags, hardware shots, close detail.

---

## 9. What exists today, honestly

**Built and tested** (`tools/plugapp/`, branch
`claude/kerberos-phase1-db-setup-6vjdq9`):

- The Electron shell: frameless transparent window, pill ⇄ phone, the liquid
  glass (real refraction, measured against a stripe pattern — see `GLASS.md` and
  `GLASS-NOTE.md`).
- Sign-in for both marketplaces in **named persistent partitions**
  (`persist:depop`, `persist:vestiaire`) — **these names must never change**, or
  he is signed out with nothing on screen to explain why.
- Email-only sign-in enforced: Google and Apple stripped from every frame
  (they cannot work in an embedded view, and that has cost several rounds).
- Opening either shop's own pages inside the phone.
- `schedule.mjs`, `route.mjs`, `stock.mjs` — the φ curve, the routing and the
  double-sale protection, all proven by tests with no account needed.

**Not built.** This is the whole of §2 above except the shell:

- scout, grabber, composer, lister, keeper, settler, learner.
- Anything that reads a real Depop or Vestiaire DOM. **Every selector is a guess
  until something opens the real page** — that is the job for whichever agent
  has a live browser.
- The ＋ flow.

---

## 10. Rules for whoever builds this

From `AGENTS.md` and `.claude/skills/shipping/SKILL.md`, paid for in builds he
had to open, find broken and hand back:

1. **Never send him something you have not run.** Not compiled — *run*.
2. **A syntax check is not a test.** If it has a loop, a test must drive it.
3. **Never assume an edit landed.** A find-and-replace matching nothing fails
   silently.
4. **Never design something you cannot see.**
5. **Never carry another app's model over wholesale.** Fiverr pacing arrived in
   a resale app with Sunday off and two-minute waits.
6. **Never report success you have not verified.**
7. **A control is not done when it is drawn.** Press every visible control in a
   test and assert what the main process was *asked to do*.
8. **Do not hand work back to him.**
9. **Never change where a session is stored** — including via the build system.
   A per-build binary name is a per-build cookie jar.
10. **Never tell him to open a Terminal or paste into a console.** If a fix
    needs a terminal, the fix is wrong — put it in the app.
11. **Put the build number on screen.** Which build is running is never a guess.
12. **Everything settled becomes a skill file** before the conversation moves on.

## 11. Where the detail lives

| File | What it holds |
|---|---|
| `AGENTS.md` | Who Alex is, how to work with him, every rule above |
| `.claude/skills/flip/SKILL.md` | The shop, the account state, the ladder, the mechanics |
| `.claude/skills/depop-scout/SKILL.md` | The scout in full |
| `.claude/skills/depop-dropship/SKILL.md` | The method, and the four refusals |
| `.claude/skills/flip-negotiator/SKILL.md` | The negotiation authority |
| `.claude/skills/flip-ui/SKILL.md` | The look and motion — read before changing a pixel |
| `.claude/skills/shipping/SKILL.md` | Every failure that reached him, and its rule |
| `tools/plugapp/GLASS.md`, `GLASS-NOTE.md` | The glass recipe and the Electron trap |
