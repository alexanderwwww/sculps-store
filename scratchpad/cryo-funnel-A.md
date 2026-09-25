# cryo — Funnel A (end to end)

Author's note up front: **`scratchpad/cryo-copy.md` is out of date and must not be shipped.**
It sells a frozen cartridge, a freezer trip, an internal battery and USB-C charging. The
cryo skill (24 Sep 2026) kills all four: the machine freezes its **own** water reservoir
with a thermoelectric plate while plugged in, there is no cartridge, there is no freezer
step, and "charges anywhere" is dead because the plate pulls 50–60 W continuously. Every
word below is written against the current mechanism. Where the old copy's lines survive,
they survive rewritten.

**Hard constraint, unchanged:** no sample exists. Nothing here states a chill time, a
temperature-per-minute, a wattage, a decibel number, a bottles-per-charge count, or an
"up to". Unmeasured numbers render as **Spec pending**.

**Positioning in one line:** *Ice-cold water on your counter. No fridge. No ice. It makes
its own cold.*

---

## 1. THE OFFER

### What is sold

| Tier | Name | Contents | Price | Role |
|---|---|---|---|---|
| 1 | **the one** | 1 cryo machine, power cable, quick-start card | **$89** | The ad price. Every hook quotes it. |
| 2 | **two cryos** — *most popular, default selected* | 2 cryo machines, 2 cables, 2 cards | **$159** | The AOV tier. |

**Two tiers only. No third.** The old three-tier ladder existed to sell cartridges, and
the cartridge is gone. There is no consumable left to bundle, so a middle tier would have
to be padded with invented accessories — which is inventing a spec by another route. Two
tiers also makes the thumbnail do the work: one machine versus two machines reads without
reading a word, which is the rule in the buy-box recipe.

### Why anyone takes tier 2

The second machine is not "more cold", it is **a second room**. The framing on the tier:

> **two cryos — $159**
> One for the kitchen. One for the desk, the garage, or the other parent's place.
> **Save $19** versus buying two on their own.

That $19 is a real dollar saving against 2 × $89 = $178, stated in dollars, never a
percentage (platform rule 6). $159 is also the honest answer to the product's one real
limitation — back-to-back bottles outrun the ice bank. The second machine is the fix, and
saying so out loud converts better than hiding it. A gifting line sits under it:
*"Second one is the easiest gift you'll buy this year."*

### Launch discount

**$15 OFF — code `COLD15`.** Dollars, never a percent. It appears in every ad, on the
announcement bar, and nowhere else on the page — the page sells the product, the code
closes the person who came in on the ad. Applied at checkout so the buy box still shows
$89 and matches the ad exactly (price mismatch between ad and landing page is the single
most common cold-traffic bounce I would expect here).

Effective entry price: **$74**. Effective two-pack: **$144**.

### Shipping

**Free US shipping on every order, no threshold.** At an $89 AOV a threshold buys nothing
— there is no $40 add-on to push someone over it. A threshold on a two-tier offer is pure
friction. Shipping speed is a claim we *can* make because it is ours to control:
**"Ships within 24 hours."** Ship it in 24 hours or take the line down.

### Guarantee

The exact words, and they are deliberately a promise about *the doubt*, not about the
product:

> **60 nights, or your money back.**
> Try it for two months. If you go back to the fridge, email us and we'll refund you —
> you don't have to explain why. Return shipping on us.

Why 60 and not 30: the objection this product faces is not "is it broken", it is "will I
actually use it". A 30-day window reads as a returns policy; a 60-night window reads as
a bet the seller is making on the habit forming. It costs more in returns and it is worth
it on cold traffic. **Guessing:** I am assuming a return rate in the 5–9% band, normal for
a $89 counter appliance. Unverified.

**Do not promise return shipping until the freight economics are known.** If a return leg
costs more than $18, change the line to "keep it and we'll refund you" on anything that
would cost more to ship back than to write off. Flag for Alex.

### The economics — what has to be true

Landed cost = unit price + tooling amortised + freight + duty, per machine at the door.

At **$89** with **free shipping** and the **$15 OFF** code, the real revenue per unit is
**$74**, not $89. That is the number every calculation below uses, and it is the number
the old pricing table in `cryo-copy.md` got wrong by running the maths on $89.

Per-unit deductions before advertising:

- Payment processing (Stripe, ~2.9% + $0.30): **~$2.45**
- Outbound shipping, ~2.5 kg to a US address: **$9–14. Guessing** — no shipping weight yet.
- Returns and support reserve at 7%: **~$5**

So: $74 − $2.45 − $12 − $5 = **~$54.50 before product cost**.

| Landed cost | Contribution per unit | Verdict |
|---|---|---|
| **$25** | ~$29.50 | Works. Breakeven CPA ~$29 at a 1-per-order mix, and with the two-pack lifting AOV the blended allowable CPA lands near $38–42. That is a scalable Meta number for a visual demo product. **This is the target — push the factories here.** |
| **$30** | ~$24.50 | Works, thin. Needs the two-pack to take 30%+ of orders. Watch CPA weekly. |
| **$38** | ~$16.50 | Breaks on paid traffic. A $16 allowable CPA does not buy a cold click on Meta in 2026. Either the price goes to $109 and the Bible gets worse, or the spec gets simplified. |
| **$49+** | ~$5.50 | Dead. Change the build, not the brief. |

**What has to be true for $89 to work:**

1. Landed cost at or under **$30**, all-in at the door.
2. Shipping weight low enough for a **sub-$14** domestic leg — this is the silent killer
   on an aluminium appliance and it is the number I would chase second after unit price.
3. **A demo video that works with the sound off**, because at a $29–42 allowable CPA the
   only way to win is a high click-through rate, and there is exactly one lever for that:
   the bottle spinning in blue mist under a glass dome. That shot is the business.
4. The two-pack taking **at least 25%** of orders. If it takes 10%, $89 is too low.

**Guessing throughout this section:** no landed cost, no shipping weight, no CPA data.
Every row is a condition to test, not a forecast.

---

## 2. THE ONE OBJECTION — "why not just put a bottle in the fridge"

### The answer

The fridge is not a competitor. **Time** is the competitor. A fridge takes hours and needs
you to have decided hours ago. cryo needs you to have decided now.

The written answer, as it appears on the page:

> **"Why not just use the fridge?"**
>
> Because the fridge needs you to have thought about it two hours ago.
>
> You didn't. Nobody does. The water is warm in the pantry, it's 95 degrees, and the cold
> one is a decision you failed to make this morning. That's the whole thing cryo fixes —
> it's not a colder fridge, it's the fridge without the waiting and without the planning.
>
> And half the places you actually get thirsty don't have a fridge at all. The desk. The
> garage. The dorm. The shop counter. The RV. The job site. You are not going to buy an
> appliance for those rooms. You'll plug in one thing the size of a lunchbox.
>
> It's not a fridge and it doesn't want to be. It won't hold your groceries and it won't
> keep anything cold all day. It makes one bottle cold, when you ask, with no ice and no
> planning. That's the job.

### Where it gets killed

**Three times, and the first one is above the fold.**

1. **In the badge and the headline, before a single scroll.** The badge reads
   `NO FRIDGE · NO ICE · MAKES ITS OWN COLD`. The objection is pre-answered by framing
   the product as the absence of the fridge rather than as a comparison to it. A cold
   visitor who has to scroll to find out this isn't a mini-fridge is already gone.
2. **In section two, as the first FAQ under the demo video.** Full text as written above.
   This is the moment it dies properly: they have just watched it work, they are
   rationalising, and rationalising is exactly where "I already own a fridge" surfaces.
3. **In the comparison table**, as the row that admits what the fridge does better. The
   admission is what makes the other nine rows credible.

The failure mode I am designing against: a page that answers this at position 10, after
the features. By then the reader has already had the thought, not had it answered, and
left. **A funnel that answers this late is dead** — so it gets answered in the badge, in
under two seconds, before the reader can even form the sentence.

---

## 3. THE FIRST SCREEN — exactly what a cold visitor sees

**Announcement bar (above everything):**
> 🧊 $15 OFF with code COLD15 · Free US shipping · Ships in 24 hours

**Image (the gallery frame, square 1:1, `contain`):**
The hero is **not a studio shot**. It is a loop or a still from the loop: a plain unbranded
bottle lying on the two silver rollers, spinning, inside the clear dome, blue mist rolling
off it, the LED ring glowing ice-blue, on a real kitchen counter. That image is the entire
argument, and a person who has never seen this machine has to see the mechanism in the
first frame or the headline means nothing.

*Build note:* the bottle must be **unbranded**. The Poland Spring bottle in the reference
render is concept only and never reaches the store or an ad.

**Badge above the heading:**
> NO FRIDGE · NO ICE · MAKES ITS OWN COLD

**Headline:**
> # Ice-cold water. No fridge. No ice.

**Subhead:**
> It makes its own cold while it sits there. Put a bottle in, close the dome, come back to
> a cold one. Nothing to freeze, nothing to fill, nothing to remember.

**The three bullets — all that fit above the fold:**
- **Chills the bottle you already own.** No special bottle, no pods, no subscription.
- **Makes its own ice inside.** Plug it in and leave it. Nothing goes in the freezer.
- **Set the cold you want.** One dial, 2°C to 8°C. It stops on its own when it gets there.

**Price block:**
> **$89** · or **two for $159** (save $19)
> With code COLD15: **$74**

**Button:**
> **Add to cart — $89**

**Under the button:**
> Free US shipping · Ships in 24 hours · 60 nights or your money back

**Why these words.** The headline is four words of outcome and two words of absence,
because the Bible says a person sees it for three seconds and knows what it does. "Makes
its own cold" is doing the heaviest lift on the page: it is the answer to "so what do I
have to freeze", which is the second question every viewer asks after "what is that", and
it distinguishes cryo from an ice bucket without a single technical word. The price is
above the fold and not hidden behind a scroll, because $89 is an *asset* on this product
— it is the gap between what the aluminium looks like it costs and what it does cost, and
that gap is the conversion mechanism.

**No time claim anywhere on this screen.** Not "fast", not "quick", not "in minutes".

---

## 4. THE SECTION ORDER

The fixed fifteen, reordered. Sections can be hidden and dragged, never added or deleted.

| # | Section | Why it sits here |
|---|---|---|
| 1 | **Buy box** | The product is unfamiliar, so the image is the pitch and the price is the relief. Everything above is written so the fridge objection dies before scroll one. |
| 2 | **Video with FAQ** | The highest-value real estate on this whole page. Nobody has seen this machine, so seeing it work is the entire sale — and the FAQ directly under it catches the reader mid-rationalisation. **Q1 is the fridge objection.** Q2 is "does it need a freezer" — no. Q3 is "does it stay plugged in" — yes, and we say so. |
| 3 | **Three steps** | Immediately after the demo, the question is "is this a hassle". Three steps, no freezer step, kills it in eight seconds. This is the section the cartridge removal earned, and it is why it moves this high. |
| 4 | **Benefits** | Now they understand it, so now they place it in their life. Desk, dorm, garage, RV, game day. This is where the *want* is built, not the *understanding*. |
| 5 | **Comparison table** | The fridge objection's final burial, plus ice and plus doing nothing. Placed after want exists — a comparison before desire is just a spec sheet. The rows admitting what a fridge does better are what make the rest believable. |
| 6 | **Who it's for** | Self-identification, including the honest "not for you if". Right after the comparison, it lets the reader say "that's me, the desk one" and disqualifies the person who wanted food storage before they buy and return it. |
| 7 | **Features** | The first buying-mode section. Reader is now sold on the idea and checking the build quality. Aluminium, dome, sensor, roller drive, thermoelectric bank. |
| 8 | **Trust icons** | Risk reversal at the exact moment the card comes out: free shipping, 24-hour dispatch, 60 nights, 1-year warranty, real-specs-only, US support. |
| 9 | **What's in the box** | The last practical unknown on a machine nobody has seen. Short. |
| 10 | **Specifications** | Deliberately low. Most rows read **Spec pending** and that is honest, but a wall of pending rows at position 4 would read as a product that doesn't exist. Down here it reads as thoroughness to the person who scrolled this far, and the "we don't print what we haven't measured" line converts that gap into credibility. |
| 11 | **Closing CTA** | The second ask, for the scroller who needed all of it. |

### HIDDEN — and why

- **Social proof images** — hidden. No customers, therefore no customer photos. Never a
  render dressed as a customer photo. Turns on the day real photos arrive.
- **Video clips** — hidden until real footage of a real sample exists. Renders as nothing
  when empty; leave it empty rather than filling it with CGI.
- **Reviews** — **hidden, and this is not negotiable.** Zero customers, zero reviews, no
  seeded quotes, no "early tester" testimonials, no star row with the count blanked. It
  turns on by itself the day a real buyer writes one. Platform rule 7.
- **Product grid** — hidden. It existed to sell spare cartridges. There is no second SKU
  now, so the section would show one product next to a cable. Hide it; unhide it the day
  there is something else to sell.

**The honest cost of hiding three sections:** this page launches with no social proof of
any kind. That is a real conversion penalty and I am accepting it, because a fake review
on a first-of-its-kind product is the thing that gets a Meta account and a Stripe account
killed at exactly the moment the funnel starts working. The demo video carries the proof
load until real reviews exist. **Getting the first 20 real reviews is the highest-value
task of week one** — email every buyer at day 5.

---

## 5. THE ADS

### Video concept 1 — "The Dome" (the mechanism ad)

**Hook, 0–2s:** Extreme close-up, dome filling the frame, a bottle spinning inside a
rolling blue mist. No face, no talking, no text yet. Just a thing nobody has seen.
Text on screen at 1s: **"what is this"**

**What happens:** Pull back to reveal it is sitting on a normal kitchen counter next to a
kettle. Hand lifts the dome, drops in a warm unbranded bottle from a pantry pack, closes
it. Cut to the dial turning, LED ring glowing. Cut away — someone walks off, does
something else. Cut back: hand lifts the bottle out, condensation running down it,
cracks it open, drinks. Text: **"no fridge. no ice. it makes its own cold."**

**The ask:** "$89. $15 off with COLD15. Link in bio." Cold-traffic CTA: *Shop now.*

**Why:** This product's single unfair advantage is that it looks like nothing else on a
feed. The mist under glass is a pattern interrupt that does not need sound, and sound-off
performance is what decides CPM on a cold Meta buy. No cut implies a duration, so no time
claim leaks.

### Video concept 2 — "The Warm Bottle" (the problem ad)

**Hook, 0–2s:** Close-up of a hand pulling a bottle out of a 24-pack sitting on a garage
floor in obvious heat. Hand touches it. Face reacts. Text: **"warm. every time."**

**What happens:** Quick montage of the actual failures — empty ice tray, a cooler with
two inches of melt water in the bottom, a fridge opened to find nothing chilled in it.
Then cut, hard, to the dome on the counter. Bottle in, dome down, dial. Cut to the cold
bottle coming out with condensation on it. Text: **"stop planning ahead for a cold drink."**

**The ask:** "cryo. $89, free shipping, ships in 24 hours." CTA: *Shop now.*

**Why:** Sells the ache before the object. The person who does not know this machine
exists cannot want it, but they already hate the warm bottle. This is the concept I would
bet scales widest, and the one to put the most budget behind.

### Video concept 3 — "No Fridge Here" (the placement ad)

**Hook, 0–2s:** A dorm room. Creator to camera, fast, no intro: **"they banned mini-fridges
in my building."** Beat. She slides the cryo into frame. **"So I got this instead."**

**What happens:** Handheld, unpolished, phone-shot. She shows there is no fridge in the
room, plugs cryo into a normal wall socket, puts a bottle in, shows the dome working. Then
three fast cuts of other no-fridge rooms — a desk at work, a garage workbench, a van.
Text on each: **"no fridge here either."**

**The ask:** "cryo, $89. $15 off with COLD15. Free shipping."

**Why:** Puts the product into a specific room with a specific rule, which makes the whole
category legible in one sentence. It is also the cheapest creative to produce and the
easiest to re-shoot into ten variants once one room wins.

**Note for all three:** a creator must never say a duration, and the edit must never imply
one. Cut away and come back — do not show a countdown, a timer, or a continuous shot that
lets a viewer time it. **This is the single easiest place for a banned claim to slip in.**

### Five primary-text variants

**1.**
Ice-cold water. No fridge. No ice. 🧊
Bottle in. Cold bottle out.
$15 OFF · free shipping · ships in 24h

**2.**
Your office has no fridge. 😤
Now it doesn't need one. 🧊
cryo chills the bottle you already have.
$89 · $15 OFF · free US shipping

**3.**
Throw the bag of ice away. 🧊🚫
No melt. No watered-down drink. No gas station run.
It makes its own cold on your counter.
$15 OFF · ships same day

**4.**
POV: warm water in the pantry, 95° outside. 🥵
One bottle. One dial. Done. ✅
$89 · $15 OFF · free shipping · 60 nights to change your mind

**5.**
Dorms ban mini-fridges. 🙄
This isn't a fridge. 🧊
Brushed aluminium, one dial, sits on a desk.
$15 OFF · free shipping · ships in 24h

**Banned from every ad until a sample is measured:** any number of seconds or minutes,
"instant", "instantly", "in seconds", "fast", "quick", "faster than a fridge", any degrees
per minute, any "up to" time. "Instantly understandable" is a brief for the industrial
design; it is not a speed claim and must never leak into copy.

---

## 6. THE POST-PURCHASE MOMENT

### The upsell

**One click, one offer, shown immediately after payment and before the confirmation page:**

> **Add a second cryo for $69?**
> One for the kitchen, one for the desk. Normally $89 — yours for $69 because it ships in
> the same box. One tap, no card details needed.
>
> **[ Yes, add it — $69 ]**   **[ No thanks ]**

**Why this and nothing else.** There is no consumable. There is no accessory. The only
thing we have to sell is another machine, and the only moment a second machine is an easy
yes is the sixty seconds after the first one felt good to buy. $69 is a real $20 off in
dollars, it is justified by a true fact (same box, no extra freight), and it costs us
almost nothing incremental — which means the second unit's contribution goes almost
entirely against blended CPA. **If this converts at 12–15%, it moves the whole funnel from
marginal to scalable at a $30 landed cost.** **Guessing on the rate** — untested.

Declined the upsell? Nothing further. One offer, then stop. A second and third upsell
screen on an $89 order buys a chargeback, not revenue.

### The confirmation page

It has three jobs, in this order: **kill buyer's remorse, set expectations, and start
manufacturing the review we are not allowed to fake.**

> # You're getting cold water. 🧊
>
> **Order #1043 confirmed.** Receipt is in your inbox.
>
> **What happens now**
> 1. **Today or tomorrow** — it ships. You get a tracking number by email the moment it does.
> 2. **When it arrives** — plug it in and leave it alone for a while. cryo makes its own
>    ice inside before the first bottle. Plug it in, walk away, come back later.
> 3. **Then** — bottle on the rollers, dome down, dial to the cold you want.
>
> **One thing worth knowing.** cryo builds its cold slowly and spends it fast, like a
> battery. Run several bottles back to back and it'll need a little time to catch up.
> That's normal and it's in the quick-start card.
>
> **60 nights.** If you go back to the fridge, email hello@cryo.co and we'll refund you.
> You don't have to explain.
>
> **[ Track your order ]**   **[ Read the quick-start ]**

**Why step 2 is on this page and not only in the box.** The plate takes hours to freeze
the reservoir. A buyer who unboxes, plugs in, and puts a bottle in immediately gets a
disappointing result and writes the first review we ever receive — a bad one. Setting that
expectation before the box arrives is the cheapest refund-prevention on the whole funnel.
Same reason the bank-catch-up line is here: the honest limitation, said by us first,
lands as candour; discovered by them first, it lands as a defect.

**Day 5 email:** "How's the cold?" — one question, a direct reply-to-a-human address, and
a review link. This is how the Reviews section eventually turns itself on.

---

## OPEN QUESTIONS FOR ALEX

1. **`scratchpad/cryo-copy.md` needs rewriting** against the no-cartridge, always-plugged-in
   mechanism before anything is seeded to the store. It currently contradicts the skill in
   about thirty places.
2. **Landed cost.** Everything above is conditional on ≤$30. Every number in section 1 is
   a test, not a forecast.
3. **Domestic shipping weight** — chase it second, right after unit price.
4. **Return shipping on the 60-night guarantee** — confirm it before that line goes live.
5. **cryo.co** is available and every clean `.com` is gone. The email address and the
   confirmation page above both assume cryo.co.
