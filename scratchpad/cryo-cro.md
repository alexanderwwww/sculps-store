# cryo — conversion review of the buy box, the phone, and the friction

Page reviewed: https://kerberos.gardenbuddystore.workers.dev/?store=cryo
Method: HTML + `theme-B2_B5-et.css` fetched with curl, rendered in Chromium via
`setContent` + `addStyleTag` with `/media/` intercepted from local copies, at
1280×900 and 390×844. CSS confirmed applied (h1 computed 64px desktop / 40px
mobile, not the 32px default). Direct `page.goto` against the live URL is
unusable in this sandbox — the proxy drops the stylesheet and the JS chunks
(CORS), giving a 70,000px unstyled page — so **anything that depends on
JavaScript running (tier re-selection, the sticky bar appearing, the cart
drawer, the wallet buttons) could not be exercised and is marked as such.**
Interaction logic was read from `/home/user/sculps-store/app/storefronts/cryo/index.tsx`
instead.

Ranked biggest conversion impact first.

---

## 1. All eight gallery thumbnails are 404. — OBSERVED ON THE PAGE

Every `-t200.webp` derivative returns HTTP 404 `text/plain` "Not found" while
the full-size file returns 200 `image/webp`:

```
/media/cryo-p01-dc960fc6df-t200.webp  -> 404 text/plain  ("Not found")
/media/cryo-p01-dc960fc6df.webp       -> 200 image/webp
```

(Checked p01; the same `-t200` pattern is used for all eight and all eight
render as empty boxes.) The result, directly under the hero image and directly
above the price, is a row of eight blank grey rounded squares — four of them on
the phone. This is the single most expensive thing on the page: a broken image
strip at the top of an unknown brand's store reads as "this site is abandoned or
a scam", and it sits in the exact place the eye goes after the hero.

The same broken derivative is used by the mobile sticky buy bar
(`index.tsx:2883`, `<Pic src={pic} size="t200">`), so the bar's product
thumbnail is broken too.

**Fix:** generate the `-t200` derivatives at upload/seed time, or make the
`/media/:name-t200.webp` route fall back to serving the full-size file when the
derivative is missing rather than returning 404. Verify with
`curl -o /dev/null -w '%{http_code}'` on all eight before calling it done.

## 2. Nothing you can buy is visible on the first screen — on either width. — OBSERVED

Measured positions (document coordinates):

| | desktop 1280×900 | phone 390×844 |
|---|---|---|
| h1 top | 174 | 609 |
| first tier row | 727 | 1067 |
| **Add to cart** | **1087** | **1462** |

Desktop: the Add to cart button is 187px below a 900px fold, and below a 720px
laptop fold by 367px. Phone: the buy button is **1.7 screens down** — a visitor
must scroll past a 390px square gallery, a 4-thumbnail strip (all broken), a
three-line 40px headline and a six-line paragraph before a price even appears.

**Fix, phone:** move the h1 above the gallery (headline → price → gallery →
tiers → button), cut the lede from six lines to one line with a "what it is"
expander, and shrink the hero gallery to ~70vw so the tier box's top edge peeks
above the fold. Target: price visible without scrolling, Add to cart within one
thumb flick. **Fix, desktop:** the 64px three-line headline plus the six-line
paragraph is ~390px of column before the price; drop the headline to ~44px and
the lede to two lines and the whole tier box + button clears an 800px fold.

## 3. The $159 pair reads as "a bigger number", not as the deal. — OBSERVED

The tier rows render as:

```
the one    One machine for the kitchen counter.              $89.00
[Most popular]  the pair  One for the kitchen, one for the
                office or the gym bag.            $159.00   $79.50 each
```

No strike-through, no saving stated. The code (`index.tsx:596-620, 707`) will
render `Save $19` and a compare-at strike **only if `compareAtCents` is set on
the variant**, and it is not set on either tier — so the page never says the
one thing that makes the ladder work. The buyer has to do `89 × 2 = 178`,
`178 − 159 = 19` in their head, and nobody does.

Also: **the default selection is "the one".** `isDefault` is on the $89 tier, so
the page loads with the cheap row selected, the big price reading $89, and the
badge sitting on a row the visitor has to actively switch to. The badge logic in
the source deliberately refuses to badge the default — which is right — but the
consequence is that the row you want them on is neither pre-selected nor
pre-priced.

**Fix, in order of impact:**
1. Set `compareAtCents = 17800` on the pair. It immediately renders
   `~~$178.00~~ $159.00` and `Save $19`, and the "Most popular" flag becomes
   "Best value" automatically via the `deepest` calculation at line 653.
2. $19 off two machines is a weak ladder — it is 10.7%, which is not enough to
   move anyone. Price the pair at **$149** (compare-at $178, **Save $29**,
   $74.50 each). A $30 saving is the smallest number that reads as a decision.
   Landed cost is unknown here, so this is a recommendation, not an instruction.
3. Give the second tier a *reason*, not a second unit: the copy "one for the
   kitchen, one for the office or the gym bag" asks a first-time buyer of an
   unknown $89 appliance to buy two before they have used one. The honest
   stronger second tier is **"the one + a second year of warranty"** or **"the
   one, and a second one for $60"** — i.e. frame the pair as an add-on to the
   machine they already decided on, not as a doubled purchase.
4. Per-rule: dollars, never percentages. `dollarsOff()` already does this;
   just give it something to compute from.

## 4. "Watch it work." is the heading over a text message thread. — OBSERVED

The section headed **"Watch it work."** with the subhead "The questions people
ask before they buy one. Answered straight." contains an iPhone mockup showing
ten FAQ chat bubbles. There is no video of the machine working anywhere on the
page. The one thing a person cannot picture about this product — a bottle
spinning in mist and coming out cold — is the one thing the page does not show
in motion, under a heading that promises exactly that.

**Fix:** either (a) put a real 6–10 second silent autoplay loop of the machine
running above the chat, keeping the heading, or (b) if no footage exists yet,
change the heading to "Questions, answered straight." so the page stops writing
a cheque it does not cash. (b) is a ten-minute copy change and should happen
today; (a) is the higher-value one and belongs in the sample shoot.

## 5. The biggest question on the page is answered with "we won't tell you." — OBSERVED

FAQ #1, verbatim: *"How long does it take? We are not publishing a time until we
have measured it on the production machine... If a number matters to you that
much, wait for it — we would rather lose the sale than lie to you about it."*
The spec table then shows **twelve consecutive "Spec pending" rows**: chill time,
bottles back to back, ice rebuild time, standby draw, chilling draw, reservoir
capacity, noise, max bottle size, net weight, shipping weight, certifications.

The honesty rule is not negotiable and this analysis does not propose breaking
it. But two things are true at once: the stance is a genuine trust asset, and
the *execution* currently reads as an unfinished store. Twelve blanks in a row
in the spec table looks like a database that did not load, not like integrity.
And the strongest sentence on the whole page — "we would rather lose the sale
than lie to you" — is buried as chat bubble #1 inside a phone mockup, below the
fold, where most visitors never reach it.

**Fix (no invented numbers):**
- Pull that sentence up into the buy box as a one-line link directly under the
  trust ticks: *"We haven't measured the chill time yet, so we haven't printed
  one. Why →"*. It converts the page's biggest weakness into the reason to
  believe everything else on it.
- Replace the bare "Spec pending" repetition with a single grouped row:
  *"Measured performance — published when the production sample is tested.
  Chill time, bottles in a row, ice rebuild, power draw, noise."* One honest
  block instead of twelve holes.
- Offer to email the numbers: *"Email me the measured specs when they're in"*
  with a single field. It captures the "I'll check later" visitor, who is
  currently lost with no trace.

## 6. Nothing catches the visitor who leaves. — PRINCIPLE, NOT OBSERVED

There is no exit capture of any kind on the page: no email field, no "notify me
when the specs land", no back-in-stock, no first-order discount capture. For an
unknown brand with an explicitly unfinished spec sheet, a large share of
qualified traffic is "interested, waiting for the number". Right now that person
leaves no address and never comes back.

**Fix:** the spec-email capture in item 5 is the right hook for this product —
it is honest, it is the actual reason they are hesitating, and the follow-up
email ("here are the measured numbers") is the strongest sales email this brand
will ever send. Pair it with the dollars-off rule: *"$10 off your first one when
the specs go live."*

## 7. Delivery is a duration, never a date. — OBSERVED

The page says "Free US shipping", "Ships within 24 hours", "Ships in 24 hours"
and "In stock — ships today" — four phrasings of the same promise in the buy box
area, and none of them says when it arrives. There is no carrier, no transit
time, no estimated delivery date.

**Fix:** one line under the button: *"Order today, arrives [computed date
range]. Free, from [state]."* Ship-from state matters here — the product is an
unbranded aluminium appliance and the reflexive assumption is a six-week boat
from China. The trust icons already claim "US support"; say where it ships from.

## 8. Unanswered questions that each cost a sale. — OBSERVED (absences)

Read through the whole page, these never get answered:

- **Who pays return shipping** on the 30-day return. "Send it back, get your
  money back" — a $89 appliance in a 28cm box is $15–25 to ship. Unstated cost
  is assumed to be the customer's.
- **Does it come back cold on its own after I unplug it / move it**, and how long
  does the ice bank take from cold start? "Spec pending" — but the *qualitative*
  answer ("plug it in tonight, it's ready in the morning") is known and costs
  nothing to say. Right now a buyer cannot picture day one.
- **Who is the company.** No company name, no address, no phone, no named
  person anywhere on the page. The footer offers "Talk to a person — Same-day
  replies, most days" and a Contact link; "most days" undersells it.
- **What happens if it breaks.** "1-year warranty" appears in the top
  announcement bar and on a warranty card in the box, but the warranty is *not*
  among the three ticks under the Add to cart button (which are shipping, 24h,
  returns). The strongest reassurance for a new-brand appliance is missing from
  the exact spot where reassurance is read.
- **Cleaning / mould.** The machine holds standing water in a reservoir
  indefinitely. Nobody has asked this on the page and everybody will think it.
  An FAQ line about emptying and wiping the reservoir is mandatory.
- **Bottle sizes that fit.** "Any bottle" is claimed on the hero graphic; max
  diameter/length is "Spec pending". A visitor holding a 1L Nalgene cannot tell
  if this works for them.

## 9. The pay-in-4 line is printed twice and the trust line three times. — OBSERVED

Inside the bundle box: "PayPal — or 4 interest-free payments of **$22.25**".
Then again below the buttons: "or 4 payments of **$22.25**". And the
shipping/24h/returns triplet appears in the top announcement marquee, as ticks
under the buttons, *and* as a sentence "Free US shipping. Ships within 24 hours.
30-day returns." in between. Repetition at the decision point reads as padding
and pushes the button further down — which is item 2.

Also note the $22.25 figure is one quarter of **$89** and is shown while it sits
inside the box where $159 is also on screen. Whichever tier is selected, one of
the two numbers on that screen is not a quarter of it.

**Fix:** keep pay-in-4 once, inside the bundle box, directly under the selected
row. Delete the duplicate under the buttons. Keep the ticks under the button,
delete the prose sentence, and swap one tick for **1-year warranty**.

## 10. The trust ticks under the button are generic; make them specific. — PRINCIPLE

Currently: Free US shipping / Ships in 24 hours / 30-day returns. Every
dropshipping store on the internet says this, which means it carries close to
zero signal for a brand nobody has heard of.

**What builds trust for cryo specifically, with no fake social proof:**
- **The refusal itself.** "We have not measured the chill time, so we have not
  printed one." No competitor page says anything like it. Put it in the buy box
  (item 5).
- **A named human.** A first name and a face next to "Talk to a person", with
  the actual reply time. "Same-day replies, most days" is honest but hedged;
  "Emails answered same day, by Alex" is a person.
- **The honest comparison table already on the page** — it says a fridge is
  better at some things and a cooler is better at others. That section is doing
  more trust work than anything else on the page and it is at 4152px desktop /
  5236px mobile. Pull a two-line version of it *into* the buy box area.
- **The "not for you if" block** — "you want food storage... you want a different
  product". Same: it is the most credible paragraph on the page and it is at
  the bottom.
- **Payment marks.** PayPal and the wallet buttons render only when configured;
  a card-logo row is the cheapest recognised-third-party signal there is.
- **A visible, specific returns policy line** rather than a badge: "30 days,
  any reason, we pay the return label" (if true).

## 11. Things the sandbox prevented me from checking. — NOT OBSERVED

State plainly rather than guess:

- Whether selecting "the pair" updates the big price, the button price and the
  sticky bar. The source (`index.tsx:612, 832, 2889`) computes all three from
  `chosen`/`picked`, so it *should*; I could not run it. The one run where the
  click appeared not to update the button was a JS-degraded render and is not
  evidence.
- Whether the mobile sticky buy bar actually appears. It exists
  (`.cy-sticky`, fixed, `translateY(115%)` until `.is-on`) and is driven by an
  IntersectionObserver on `#buy` (line 2853). It never appeared in my render
  because the JS chunks were CORS-blocked. Worth checking on a real phone:
  on an 11,800px-tall mobile page the persistent bar is load-bearing.
- The cart drawer, checkout, Apple Pay / PayPal express buttons, and whether a
  card can actually be charged. Untested end to end.
- Page weight and real load time. Eight full-size WebPs are being fetched at
  140–310KB each (~1.8MB of gallery) and the `-t200` thumbnails that should
  have made the strip cheap are the ones 404ing, so the thumbnails are likely
  falling back to full-size files. On a phone on cellular this is a real bounce
  source, but I could not measure it through the proxy.
