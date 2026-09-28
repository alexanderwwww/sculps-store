# Messages and Negotiation

Instructions for the machine that answers Depop messages and handles offers. Response
time as a ranking signal is covered in `SKILL.md`; this file is what to actually say.

Every reply is drafted by the machine and **sent by Alex**. Draft in his voice. Never
send.

Researched September 2026.

---

## 1. Tone contract

The shop reads as a person with a rail of clothes in a room with good light, not as a
business. So:

- **Lowercase-leaning, short sentences, no corporate register.** "yeah it's still
  here" not "Thank you for your enquiry! This item is still available."
- **One or two emoji maximum, ever, and only warm ones.** Never a fire emoji, never
  three in a row, never an emoji in a designer thread.
- **Answer the question first, then add the useful thing.** Never open with a pitch.
- **No exclamation marks in a high-ticket thread.** They read as a sales floor and
  they undercut the authority that sells a €900 jacket.
- **Never apologise for the price.** Not "sorry it's a bit steep". State it and move.
- **Never mirror rudeness.** A rude buyer is a future dispute; be short, be correct,
  create a clean record.
- Match length to theirs. A three-word question gets a one-line answer.

**Two registers:**
- **Book A (Y2K/vintage, mostly Gen Z women):** warm, casual, fast, lowercase,
  helpful about fit. Talk like a friend who owns a shop.
- **Book B (streetwear/designer):** still human, but sentence case, precise, fact-led.
  This buyer is spending real money and is reassured by someone who clearly knows the
  object. Be the expert, not the salesman.

---

## 2. Openers and the standard replies

### "Is this still available?"
The most common message. It is not a question, it is a hand going up. Never answer
with just "yes" — that ends the thread.

> yeah it's still here. what size are you usually? happy to check the measurements
> against something you already own if that helps

Book B version:

> Still available. Anything you want a closer photo of before you decide — stamps,
> lining, sole — say the word and I'll shoot it today.

**Always end an availability reply with a question or an offer of a photo.** An
answered question with no hook closes at a fraction of the rate of one that keeps the
thread open.

### "Would this fit me? I'm a [size]"
Never say yes. Give them the tape and a judgement.

> it's 20 in / 51 cm pit to pit and 27 in / 68 cm long, so it sits oversized on a
> medium. if you normally wear a 10 it'll be loose and boxy, which is how it's meant
> to look. if you want it fitted it's probably a size too big

### "Do you have more photos?"
Always yes, always same day. This is the highest-converting message type in the whole
inbox.

> yeah give me an hour and i'll send some in daylight. anything specific you want to
> see?

### "How long does shipping take to [country]?"
State honestly. Never promise a date you do not control.

> ships from greece, tracked. usually 5–8 working days to the uk and 8–14 to the us,
> but customs can add a few days and i can't control that. i post within 24h of the
> sale and you get the tracking number straight away.

Never say "guaranteed by" any date. Never say "should arrive before Christmas" in
December unless you have already worked back from the carrier's stated cut-off.

### "Is it real?"
Handle with facts, not oaths. Full protocol in `04-authenticity-and-risk.md`.

> Photos 5–8 are the stamps, unretouched — the .925 and the maker mark on the inner
> band, and the hardware close up. Weight is 34 g. Happy to shoot any angle you want
> before you buy. I don't do certificates of authenticity; I'd rather you check it
> yourself against what you already know.

Never type: "100% real", "guaranteed authentic", "I promise it's legit", "I'd stake my
account on it."

### Silence after a long thread
One follow-up only, after **48 hours**, and only if they asked something specific:

> no pressure at all — it's still here if you want it, and the bundle discount stands
> if you see anything else

Then stop. A second chase is how you get blocked.

---

## 3. Offers and counter-offers

### Before any negotiation: set the floor

Every listing carries a **private floor** the machine records at listing time:

```
floor = landed_cost + shipping + 20    all divided by 0.87   (the 13% Greek fee load)
```

Round the floor up to the nearest €5. **The floor is never sent, never hinted at, and
never described as "my lowest".** Once you say "lowest", you have no room left.

Listing price is set at median sold comp **+10–15%** (see `01-sourcing-and-margin.md`),
which means there is a planned 10–15% of negotiating room above the comp, plus
whatever sits between comp and floor.

### The counter-offer ladder

Read the offer as a percentage of list price:

| Their offer | Read | Response |
|---|---|---|
| **≥ 90% of list** | Serious buyer, close it | Accept. The 3–10% is not worth a message round-trip or the risk they cool off. |
| **80–89%** | Normal negotiation | Counter at **95%** of list, or split the difference, whichever is higher. Usually closes in one round. |
| **70–79%** | Real but testing | Counter at **88–92%**. Add a bundle pitch. |
| **50–69%** | Lowball, but engaged | Counter **once**, at **5–10% above your floor** — not back at list. Countering at list reads as a refusal and ends the thread. |
| **< 50%** | Not a buyer yet | Do not counter with a number. One polite line, keep the door open (script below). |
| **Below cost basis** | Ignore or decline flat. | Never counter into a loss to "get the sale". |

Two hard rules:
- **Reply to every offer**, even a bad one. Response rate and response time are
  ranking signals, and a dead offer thread still costs you.
- **Never counter more than twice on one item.** Third round, hold or walk. Buyers who
  need three rounds are the buyers who open disputes.

### Scripts

**Accept (≥90%):**
> done — i'll accept that now. post it in the morning and send you tracking.

**Counter (80–89%):**
> can do €[95% figure] — that's about as low as i can go on this one with shipping
> from greece. want me to send it over?

**Counter (70–79%), with bundle:**
> €[figure] works for me. and if you grab anything else from the shop it's 10% off
> two or more, so it might be worth a look before i send the offer

**Counter (50–69%), floor + 5–10%:**
> that's a bit under what i can do on this. €[floor+8%] and it's yours — genuinely
> the bottom of it after fees and postage

**Very low (<50%), no counter:**
> appreciate the offer but that's a long way off what i paid for it. it's priced
> against what these actually sold for recently. if it's still here in a few weeks
> i'll drop it and you'll get notified since you liked it

That last line does real work: it is true, it is not rude, it tells them liking the
item has a payoff, and it sets up the offer-to-likers cadence in SKILL.md.

**Hold firm (rare or fast-moving piece):**
> holding at €[list] on this one — it's had a lot of interest and these don't sit
> around. if that changes i'll let you know

### When to hold, when to walk

**Hold** when: the piece is under 14 days old; it has 10+ likes; there is a comp at or
above your price in the last 30 days; it is Book B; it is peak season for the category.

**Take the floor** when: the piece is 30+ days old; the category STR is under 40%; the
season is about to turn against it (a winter coat in February); it is the last piece
of a dying trend.

**Walk** — stop replying and let the thread die — when the buyer:
- asks to pay off-platform (PayPal friends & family, Revolut, bank transfer, crypto)
- asks you to mark the parcel as "gift" or under-declare the customs value
- asks you to ship to a different address than the order
- asks for the item before payment, or for a "test"
- opens with a threat ("I'll leave a bad review if…")
- asks for a "legit check" certificate you cannot produce, then keeps pushing
- has already been refunded by you once

Every one of those is a fraud pattern or a future dispute. Politely decline **in
writing, on Depop**, once, and stop.

> can only do it through depop i'm afraid — that's what protects both of us

---

## 4. The bundle pitch

Bundles raise average order value and collapse two shipping costs into one, which
matters more from Greece than anywhere.

**When to pitch:** after answering any question, if the buyer has liked 2+ items, or
if they are negotiating and you are near your floor. Trading a bundle is better than
trading price.

**How:**
> 10% comes off automatically on two or more, and i only charge shipping once so it
> works out a lot cheaper than buying them separately. anything else caught your eye?

If they have liked specific items, **name them**:
> i saw you liked the carhartt and the levi's too — if you want all three i can do
> €[x] for the lot, one postage

Ladder for negotiated bundles:
- 2 items: **10%** (the automatic setting)
- 3 items: **15%**
- 4+ items or over €150: **20%**, and that is the cap

Never give a bundle discount **and** an individual-item discount on the same order.
Pick one, say which one you are giving.

---

## 5. What NEVER to say

Every line below either creates a warranty, admits fault, moves the sale off-platform,
or hands a buyer the words for a claim. These are **hard bans** on drafted messages.

**Authenticity**
- "100% authentic" / "guaranteed genuine" / "I guarantee it's real"
- "It's from a reliable source, trust me"
- "It came with a receipt" when it did not
- Any promise about what a third-party authenticator will say

**Condition**
- "Perfect condition" / "mint" / "like new" / "no flaws" (unless literally deadstock
  and inspected)
- "It'll wash out" / "that'll come out easily" — a promise about a stain is a warranty
- "Basically unworn"
- "It's not that noticeable"

**Fit and outcome**
- "It will definitely fit you"
- "It'll look amazing on you" — harmless in tone, but it is a promise about an outcome
  you cannot deliver, and a disappointed buyer quotes it back
- "You can always return it if it doesn't fit" — this is not your policy to offer

**Delivery**
- "Guaranteed delivery by [date]"
- "It'll be there in 3 days" for an international parcel
- "I'll sort the customs so you won't pay anything"

**Process and money**
- Anything inviting off-platform payment or contact — an instant-suspension pattern,
  and it voids every protection
- "I'll refund you directly" — always refund **in the app**; an off-app refund means
  the platform does not know, and the buyer can open a dispute and be paid twice
- "No returns" / "all sales final" — unenforceable and it provokes disputes
- "Just open a dispute and I'll sort it" — never invite a dispute, ever
- "I've already shipped it" when you have not

**Tone**
- Sarcasm, "lol", "seriously?", "do you know what this is worth"
- Arguing about a review
- Anything about another seller or another shop

**Admissions**
- "Sorry, I should have mentioned that" — apologise for the person's experience, never
  for a specific omission, because it is a written admission that the listing was
  incomplete. Say: "let's sort it" not "you're right, I left that out."

---

## 6. When something goes wrong

Full dispute mechanics are in `04-authenticity-and-risk.md`. The message posture:

**Be fast, be warm, be factual, stay on Depop.** Every message about a problem must be
sent in the Depop thread so it is part of the record.

**Buyer says it hasn't arrived:**
> let me check the tracking now. [tracking number, last scan, carrier]. it's showing
> [status]. if it hasn't moved by [date] i'll chase the carrier and we'll sort it
> — you won't be out of pocket either way.

Never say "you'll get a refund" before you know what happened. Say "we'll sort it".

**Buyer says it's not as described:**
> sorry it's not right. can you send me a photo of what you're seeing? i want to
> compare it to the listing photos before we decide what to do.

Requesting a photo is both genuinely useful and the single most important step: it
creates evidence and it filters buyers who have no case.

If they are right and you missed a flaw: offer a **partial refund** first, then a
return. A partial keeps the item sold and costs less than round-trip international
shipping from Greece.

> you're right that's not in the photos. i can do €[15–25% of price] back and you
> keep it, or send it back and i'll refund in full once it lands — your call.

If they are wrong: stay calm, cite the listing.

> the listing says [exact quote] and it's in photo [n]. i measured it flat before
> posting. i'd rather you have something you're happy with though — do you want to
> return it?

Never argue past two messages. Offer the return and let the platform arbitrate; a long
angry thread is evidence against you and a bad review either way.

**Buyer asks for a refund for buyer's remorse** (changed mind, doesn't fit):
You are not obliged to accept — remorse is not a valid claim ground. But decide by
value: under €40, accept the return and keep the review clean. Over €40, politely
decline once and offer to help them resell it.

---

## 7. Message triage — order of work

When several threads are waiting, answer in this order:

1. **Anyone with a problem on a completed order.** Minutes matter; this is where money
   and reviews are lost.
2. **Offers** — they expire and they are the closest thing to a sale in the inbox.
3. **Questions on Book B (high-ticket) items** — one €900 answer is worth thirty €25
   answers.
4. **"Is it still available"** on anything with recent likes.
5. Everything else.
6. Never: unsolicited messages to people who have not engaged. Blast messaging is one
   of the behaviours that gets accounts banned (see `SKILL.md`).

---

## Sources

- https://depopautomation.com/blog/how-to-handle-lowball-offers-on-depop — counter at 5–10% above floor not list price; set floor before offers arrive; decline below cost basis; accept near-floor on aged stock
- https://blog.nibbletechnology.com/how-to-negotiate-on-depop/ — counter mechanics, respond to every offer, "if within 20% of asking, counter with your floor"
- https://selleraider.com/depop-offers/ — Depop offer mechanics and expiry
- https://closo.co/blogs/platform-specific-guides/how-do-bundles-work-on-depop — automatic bundle discount tiers, AOV effect
- https://closo.co/blogs/legal-compliance/the-sellers-guide-to-surviving-a-depop-refund-rules-risks-and-reality — never refund outside the app (double-payment risk); buyer's remorse is not a valid claim ground; "all sales final" unenforceable
- https://www.topbubbleindex.com/blog/dealing-with-difficult-depop-buyers-a-guide-to-handling-disputes/ — dispute posture, evidence, partial refunds
- https://termly.io/resources/articles/product-disclaimer/ — express warranties created by verbal claims survive "as is"
- https://nifty.ai/post/depop-selling-tips — response-time targets
- https://closo.co/blogs/platform-specific-guides/how-to-get-more-followers-on-depop — reply to every comment and DM within 24h
