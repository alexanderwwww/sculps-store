# XERO — store content to paste into Shopify admin

Everything below is ready to paste. Two destinations:

- **Settings → Policies** — the four legal policies. These cannot be created over the
  Admin API (the API can only update a policy that already exists, and only Privacy does).
  Paste them by hand, once.
- **Content → Pages** — About and Contact.

`{{ email }}` is a Shopify merge tag. It resolves to your store contact email on its own —
leave it exactly as written.

Values marked **[DECIDE]** are choices, not legal requirements. Change them before you
publish. This is a drafting aid, not legal advice — have it reviewed before you take money.

---

## Three things to fix in the text before pasting

**1. Fill in the legal identity.** Every `[YOUR LEGAL NAME]` and `[YOUR US BUSINESS
ADDRESS]` must be replaced with the real thing, and it must match — character for character
— what you put on the EIN application, the payout account, and the Shopify store details.
Mismatched identity across those four places is the most common reason a payments
application gets pulled for manual review. As a sole proprietor you are trading as an
individual, so the form is "**[YOUR LEGAL NAME]**, trading as XERO".

**2. The delivery promise is the biggest liability in here.** The storefront currently
promises free delivery, in person, by your own staff, anywhere you ship, in 4–6 weeks, on a
machine that is not built yet. Every one of those is a specific commitment a customer can
hold you to and a bank can rule against you on. The shipping policy below is written to
match what the site says. **If you cannot personally deliver a bike to a US address in six
weeks, change both the policy and the site copy before you launch, not after.**

**3. Consider selling a deposit instead.** A $4,999 charge taken 4–6 weeks before anything
ships is the single highest-risk pattern in card processing, and it is what turns one unhappy
customer into a chargeback, a frozen payout, and a closed account. A refundable reservation
deposit — **[DECIDE]** $199 — with the balance due at dispatch removes most of that
exposure and is easier to get approved in the first place. The refund policy below has a
deposit clause ready in case you take that route; delete it if you don't.

---

# 1. Refund policy

```html
<h2>Returns and refunds</h2>
<p>We want you to be certain about your Chiron. If it is not right for you, you can return it.</p>

<h3>Return window</h3>
<p>You have <strong>30 days from the day your bike is delivered</strong> to request a return. Accessories and add-ons can be returned within 30 days of delivery.</p>

<h3>Condition</h3>
<p>To be eligible for a full refund the bike must be in the condition it arrived in: undamaged, unmodified, with under 50 km on the odometer, and with the steel owner card, key and charger included. We inspect the machine on collection.</p>
<p>If the bike is returned with damage, missing items, or more than 50 km recorded, we may reduce your refund to reflect the loss in value. We will always tell you the amount and the reason before we process it.</p>

<h3>How to start a return</h3>
<p>Email us with your order number and the client ID etched on your steel card. We will arrange collection. <strong>We collect the bike ourselves and you do not pay return shipping.</strong></p>

<h3>Refunds</h3>
<p>Once the machine is back with us and inspected, we issue your refund to the original payment method within 10 business days. Your bank or card issuer may take a few days more to show it.</p>

<h3>Cancelling before delivery</h3>
<p>Because every Chiron is paired to your client ID before it leaves us, you can cancel at any point before dispatch for a full refund with no deduction. Contact us as soon as you can.</p>

<h3>Reservation deposits</h3>
<p>Where you have paid a deposit to reserve a build slot rather than the full price, that deposit is fully refundable at any time before your bike is dispatched. Ask and we return it, no reason needed and nothing deducted.</p>

<h3>Damaged or faulty on arrival</h3>
<p>If your bike arrives damaged, or a fault appears that is not caused by use, contact us within 7 days. We will repair it, replace it, or refund it in full, and we cover collection either way. This does not affect your statutory rights.</p>

<h3>If we cannot deliver</h3>
<p>If we are unable to deliver your machine within the estimated lead time, we will tell you as soon as we know, give you a revised date, and refund you in full on request. You never have to wait on a date we have missed.</p>

<h3>Contact</h3>
<p>Questions about a return: {{ email }}</p>
```

**[DECIDE]** 30-day window · 50 km odometer limit · 10 business days to refund · 7-day damage window.

The "If we cannot deliver" clause is new and it is the most important one here. A stated
right to a refund on a missed date is what stops a delay becoming a chargeback.

---

# 2. Shipping policy

```html
<h2>Shipping and delivery</h2>

<h3>Shipping is free</h3>
<p>Delivery is free on every order, to every address we ship to. There is no freight charge, no fuel surcharge and no oversize fee at checkout.</p>

<h3>How your bike arrives</h3>
<p>We do not hand your Chiron to a parcel courier. It is delivered to your address by our own team or by a specialist vehicle carrier we appoint, on a tail-lift vehicle. Nothing for you to collect and no freight terminal to visit.</p>

<h3>Lead time</h3>
<p>Bikes ship in <strong>4 to 6 weeks</strong> from the day you order. This is an estimate given in good faith, not a guaranteed date. If it is going to take longer we will tell you as soon as we know and you can cancel for a full refund at any time before dispatch.</p>
<p>Your aluminium key case, containing your wireless key and steel owner card, is dispatched separately and normally reaches you several days before the bike does, so you can register your client ID in advance.</p>
<p>Accessories ordered on their own ship within 3 to 5 business days.</p>

<h3>Tracking</h3>
<p>You will receive updates at every stage: card etched, build checked, dispatched, and on the day, when the driver is close. You can also check the status at any time from the tracking page using the client ID on your steel card.</p>

<h3>On the day</h3>
<p>We agree a delivery window with you in advance. Someone aged 18 or over must be present to receive the bike and sign for it. If nobody is there we will contact you to arrange another day at no extra cost.</p>

<h3>Where we ship</h3>
<p>We currently deliver to the addresses listed at checkout. If your location is not there yet, email us.</p>

<h3>Duties and taxes</h3>
<p>Any import duty or tax that applies to a delivery outside our home market is not included in the price shown and is the responsibility of the recipient, unless we state otherwise at checkout.</p>

<h3>Contact</h3>
<p>Questions about a delivery: {{ email }}</p>
```

**[DECIDE]** 4–6 week lead time · 3–5 days for accessories · age 18 to sign.

Two deliberate changes from what the site says. "By our own staff" is now "our own team or a
specialist carrier we appoint" — you cannot personally drive to every US address, and
promising that you will is a promise you break on order two. And the lead time is now
explicitly an estimate with a cancellation right attached. **The storefront copy still says
"by our own staff" and "no carriers" in the delivery section and the FAQ. Change those to
match this, or change this to match them — they cannot disagree.**

---

# 3. Terms of service

```html
<h2>Terms of service</h2>
<p>These terms apply to your use of this website and to any order you place with us. By placing an order you agree to them. Please read them before you buy.</p>

<h3>1. Who we are</h3>
<p>This store is operated by [YOUR LEGAL NAME], trading as XERO, of [YOUR US BUSINESS ADDRESS]. You can reach us at {{ email }}.</p>

<h3>2. Orders</h3>
<p>Your order is an offer to buy. A contract is formed when we send you an order confirmation. We may decline or cancel an order — for example where an item is unavailable, where a price or description was wrong, or where we suspect fraud. If we cancel an order you have paid for, we refund you in full.</p>

<h3>3. Prices and payment</h3>
<p>Prices are shown in the currency displayed at checkout and may change at any time before you order. Payment is taken at the time of order unless we offer you a deposit option. Financing and pay-over-time options, where shown, are provided by third parties on their own terms, and approval is theirs to give.</p>

<h3>4. Delivery and risk</h3>
<p>Delivery is covered by our Shipping Policy. Risk in the goods passes to you when they are delivered to the address you gave us. Lead times are estimates given in good faith and are not guaranteed dates.</p>

<h3>5. Product information and specifications</h3>
<p>Performance figures shown on this site — power, torque, top speed, acceleration, range, weight, charge time, cycle life and sealing rating — are our own manufacturer figures. They have not been verified or certified by an independent testing body, and the IP69K sealing figure describes the sealing standard the machine is engineered to rather than a certification issued by a third party. Nothing on this site is a warranty that any particular figure will be met by any individual machine. Real-world performance varies with terrain, rider weight, temperature, tyre choice, tyre pressure, state of charge and setup. Images and renders are illustrative and colours render differently on different screens.</p>

<h3>6. Use of the product, and road legality</h3>
<p>The Chiron is an <strong>off-road machine. It is not street legal and it is not sold as road legal in any market.</strong> It is not type-approved, homologated, registered or certified for use on public roads, and we make no claim that it can be registered or ridden on them. You are responsible for checking and complying with the law where you are before you ride it, including any registration, licensing, insurance and permitted-use rules that apply to off-highway vehicles. Always wear appropriate protective equipment. This machine is not intended for riders under 18. We are not responsible for fines, penalties, injury or loss arising from use that is not permitted where you are.</p>

<h3>7. Warranty</h3>
<p>We warrant the bike against defects in materials and workmanship for 24 months from delivery, and the battery pack for 24 months or 1,500 charge cycles, whichever comes first. The warranty does not cover wear items (tyres, brake pads, grips), damage from crashes, misuse, competition use, unauthorised modification, or neglect. This warranty is in addition to, and does not limit, your statutory rights.</p>

<h3>8. 10-Year Replacement</h3>
<p>10-Year Replacement is a configuration of the bike, chosen at checkout. <strong>It is not insurance, it is not an insurance product, and it is not underwritten by an insurer.</strong> It is an extended replacement term offered by us directly. Where it applies, for ten years from delivery we replace the machine rather than repair it. It covers the same categories of failure the standard warranty covers, and it does not cover theft, loss, crash damage, misuse, competition use, unauthorised modification, or neglect. One replacement per claim; the replacement carries the remainder of the original ten-year term, not a new one.</p>

<h3>9. Returns</h3>
<p>Returns are covered by our Refund Policy, which forms part of these terms.</p>

<h3>10. Accounts and security</h3>
<p>If you create an account, you are responsible for keeping your credentials secure and for activity under your account. Your client ID and steel card pair the machine to you — treat them as you would a key.</p>

<h3>11. Intellectual property</h3>
<p>All content on this site — text, images, film, design, code and marks — belongs to us or our licensors. You may not copy, reproduce or use it commercially without our written permission. Apple, iPhone and Apple Pay are trademarks of Apple Inc. We are not affiliated with, endorsed by, or certified by Apple. References to iPhone describe compatibility only.</p>

<h3>12. Liability</h3>
<p>Nothing in these terms limits our liability for death or personal injury caused by our negligence, for fraud, or for anything else that cannot lawfully be limited. Subject to that, our total liability arising from an order is limited to the amount you paid for it, and we are not liable for indirect or consequential loss.</p>

<h3>13. Privacy</h3>
<p>How we handle your personal information is set out in our Privacy Policy.</p>

<h3>14. Changes</h3>
<p>We may update these terms. The version in force is the one published on this page at the time you place your order.</p>

<h3>15. Governing law</h3>
<p>These terms are governed by the laws of the State of [YOUR STATE], United States, and its courts have non-exclusive jurisdiction. This does not remove any protection you have under the mandatory consumer law of the country where you live.</p>

<h3>16. Contact</h3>
<p>{{ email }}</p>
```

**[DECIDE]** 24-month warranty · 1,500-cycle battery term · governing-law state · the whole of clause 8.

Clauses 5, 6, 8 and 11 are the ones that matter and they are all new or rewritten:

- **5** puts in writing that the specs are targets. The site now says "design target" beside
  every figure. This is the legal backstop for that, and it is what makes the numbers
  defensible instead of fraudulent.
- **6** says plainly that the machine is not street legal. Selling a motor vehicle without
  saying this, when a buyer might reasonably assume they can register it, is the largest
  single liability on the site.
- **8** keeps the word "insurance" out. "Insurance" is a licensed activity in every US state
  and most other markets; describing a paid promise as insurance without a licence is a
  regulatory problem, not a wording preference. **Keep it out of the marketing copy too.**
- **11** disclaims Apple. The site says "Built for iPhone. Only for iPhone.", shows an Apple
  Pay mark, and uses a Find My–style icon. Without a disclaimer that reads as an official
  partnership you do not have.

---

# 4. Privacy policy

A Privacy policy already exists on the store — Shopify created it. **Read what is there
before replacing it**, then use this if it is the bare default. GDPR applies to you: you are
in Greece and you will have EU visitors regardless of where the business is registered.

```html
<h2>Privacy policy</h2>
<p>This policy explains what personal information we collect, why, and what you can do about it. It applies to this website and to any order you place with us.</p>

<h3>Who we are</h3>
<p>[YOUR LEGAL NAME], trading as XERO, of [YOUR US BUSINESS ADDRESS]. For any privacy question, or to exercise any right below, email {{ email }}.</p>

<h3>What we collect</h3>
<p><strong>When you order:</strong> your name, billing and delivery address, email address, phone number, and order details. Payment card details are entered directly into our payment processor and we never see or store them.</p>
<p><strong>When you sign up for updates:</strong> your email address.</p>
<p><strong>When you use the tracking page:</strong> the client ID you enter.</p>
<p><strong>Automatically, when you browse:</strong> your IP address, browser and device type, pages viewed and referring site. This comes from cookies and similar technologies.</p>

<h3>Why we use it</h3>
<p>To take and fulfil your order, to take payment, to contact you about your order, to answer your questions, to prevent fraud, to meet our legal and tax obligations, and — only if you have asked for it — to send you updates. We do not sell your personal information.</p>

<h3>Who we share it with</h3>
<p>Only those who need it to do their job for us: Shopify, which hosts this store; our payment processor; the carrier or team delivering your bike; and our email provider if you have subscribed. Each handles your data under its own agreement with us. We also disclose information where the law requires it.</p>

<h3>International transfers</h3>
<p>We operate from the United States and our service providers may process your data there and elsewhere. Where your data leaves the European Economic Area or the United Kingdom, it is transferred under an appropriate safeguard recognised by that law, such as the European Commission's Standard Contractual Clauses.</p>

<h3>How long we keep it</h3>
<p>Order records for as long as tax and accounting law requires, normally seven years. Marketing contacts until you unsubscribe. Browsing data for a shorter period.</p>

<h3>Your rights</h3>
<p>You can ask us for a copy of the personal information we hold about you, to correct it, to delete it, to restrict or object to how we use it, or to receive it in a portable format. Where we rely on your consent, you can withdraw it at any time. Email {{ email }} and we will respond within one month.</p>
<p>If you are in the EEA or the UK you also have the right to complain to your national data protection authority. If you are a California resident you have the right to know, to delete, to correct, and to opt out of sale or sharing of your personal information; we do not sell or share it.</p>

<h3>Cookies</h3>
<p>We use cookies that are necessary for the store to work — your cart and your session — and, where you have agreed, cookies that help us understand how the site is used. You can refuse non-essential cookies without losing the ability to shop.</p>

<h3>Children</h3>
<p>This store is not directed at children and we do not knowingly collect personal information from anyone under 16.</p>

<h3>Changes</h3>
<p>We will post any change on this page.</p>

<h3>Contact</h3>
<p>{{ email }}</p>
```

**[DECIDE]** seven-year retention · one-month response time.

---

# 5. About page

Content → Pages → Add page. Title: **About**. Handle: `about`.

```html
<h2>We are building one machine.</h2>

<p>XERO is a small independent project with a single product: the Chiron, an electric off-road motorcycle that unlocks with your phone and has no key, no barrel and nothing to clone.</p>

<p>It started from a straightforward frustration. Electric performance bikes are extraordinary machines sold at prices that put them out of reach, wrapped in dealer networks nobody enjoys dealing with, and locked with technology from forty years ago. We wanted to know what happened if you designed the whole thing around the phone already in your pocket, sold it directly, and left out everything that only exists because the industry has always done it that way.</p>

<h3>Where we are</h3>

<p>The figures on this site are <strong>our own</strong>, measured and confirmed by our engineering team. They are not independently certified, and we say so rather than implying an approval we do not hold. If an independent body ever tests this machine, we will publish what they found, including anything that differs from what we publish today.</p>

<p>The machine is built for off-road use. It is not street legal and we do not sell it as street legal.</p>

<h3>How we sell</h3>

<p>Directly, and only here. No dealers, no showroom, no salesperson working a margin. That is why a machine of this specification is priced where it is.</p>

<p>Every Chiron ships with a milled steel owner card carrying its serial and your client ID. You tap it into the tank once and the bike is paired to your phone and to nobody else's. The card and key arrive before the bike does, so you can register your ID while the machine is still being finished.</p>

<h3>Who you are dealing with</h3>

<p>One person answers the email. There is no ticket queue and no bot. If something goes wrong, you are talking to the person responsible for fixing it — which is slower than a call centre and considerably more useful.</p>

<p>[YOUR LEGAL NAME], trading as XERO<br>
[YOUR US BUSINESS ADDRESS]<br>
{{ email }}</p>
```

The tone is deliberate. A brand-new high-ticket store with no trading history gets read
sceptically by customers and by reviewers, and the most effective thing an About page can do
in that position is say the uncomfortable part first. "In development, figures are targets,
not street legal, one person answers the email" reads as confidence. Nothing here promises
anything you have not already promised elsewhere.

---

# 6. Contact page

A **Contact** page already exists on the store — Shopify created it with the default form.
Replace its body with this and keep the form.

```html
<h2>Talk to us</h2>

<p>Email is the fastest way to reach a person: {{ email }}. We answer every message ourselves — there is no ticket queue and no bot.</p>

<p><strong>Response time:</strong> within one business day.</p>

<p>If you already have an order, include your order number or the client ID etched on your steel owner card and we can pull up your build straight away.</p>

<p>Buying, and want a question answered before you do? Ask. We would rather spend twenty minutes on email than have you spend $4,999 on the wrong machine.</p>

<h3>Business details</h3>
<p>[YOUR LEGAL NAME], trading as XERO<br>
[YOUR US BUSINESS ADDRESS]<br>
{{ email }}</p>
```

A real, checkable business address and a named human on the contact page is one of the
specific things payment underwriters look for on a new high-ticket store. A contact page with
only a form on it is a flag. Do not leave the address as a placeholder.

---

## What is still not done

- **The store is EUR with Greece as its only market.** None of the payments plan works until
  that is USD with a US primary market. Settings → Store details, then Settings → Markets.
  It is admin-only; it cannot be done over the API.
- **Files library is empty.** There is not a single image on the store. "Real photos" is the
  first item on your own launch list and it is entirely blocked on you uploading them.
  Upload with the original filenames and they reconnect to the theme automatically.
- **The site copy still contradicts the shipping policy** in two places — the delivery
  section and FAQ answer 11 both say "by our own staff" and "no carriers".
- **The theme is unpublished**, and publishing is blocked over the API. Online Store →
  Themes → Actions → Publish, once the rest is done.
