# XERO — store policies (paste into Shopify admin)

The API connection this was written through does not hold the `write_legal_policies`
scope, so these could not be published automatically. Paste each one into
**Settings → Policies** in Shopify admin. `{{ email }}` is a Shopify merge tag and
resolves to your store contact email on its own — leave it as written.

Every number below is a choice, not a legal requirement. Change any of them before you
publish; they are marked **[DECIDE]** where the value is arbitrary. This is a drafting
aid, not legal advice — have it reviewed before you take money.

---

## Refund policy

```html
<h2>Returns and refunds</h2>
<p>We want you to be certain about your Chiron. If it is not right for you, you can return it.</p>

<h3>Return window</h3>
<p>You have <strong>30 days from the day your bike is delivered</strong> to request a return. Accessories and add-ons can be returned within 30 days of delivery.</p>

<h3>Condition</h3>
<p>To be eligible for a full refund the bike must be in the condition it arrived in: undamaged, unmodified, with under 50 km on the odometer, and with the steel owner card, key and charger included. We will inspect the machine on collection.</p>
<p>If the bike is returned with damage, missing items, or more than 50 km recorded, we may reduce your refund to reflect the loss in value. We will always tell you the amount and the reason before we process it.</p>

<h3>How to start a return</h3>
<p>Email us with your order number and the client ID etched on your steel card. We will arrange collection. <strong>We collect the bike ourselves and you do not pay return shipping.</strong></p>

<h3>Refunds</h3>
<p>Once the machine is back with us and inspected, we issue your refund to the original payment method within 10 business days. Your bank or card issuer may take a few days more to show it.</p>

<h3>Cancelling before delivery</h3>
<p>Because every Chiron is paired to your client ID before it leaves us, you can cancel at any point before dispatch for a full refund with no deduction. Contact us as soon as you can.</p>

<h3>Damaged or faulty on arrival</h3>
<p>If your bike arrives damaged, or a fault appears that is not caused by use, contact us within 7 days. We will repair it, replace it, or refund it in full, and we cover collection either way. This does not affect your statutory rights.</p>

<h3>Right of withdrawal (EU and UK)</h3>
<p>If you are ordering from the European Union or the United Kingdom, you have a statutory right to withdraw from the purchase within 14 days of receiving the goods, without giving a reason. The 30-day window above is offered in addition to that right, not instead of it.</p>

<h3>Contact</h3>
<p>Questions about a return: {{ email }}</p>
```

**[DECIDE]** 30-day window · 50 km odometer limit · 10 business days to refund · 7-day damage window.

---

## Shipping policy

```html
<h2>Shipping and delivery</h2>

<h3>Shipping is free</h3>
<p>Delivery is free on every order, to every country we ship to. There is no freight charge, no fuel surcharge and no oversize fee at checkout.</p>

<h3>How your bike arrives</h3>
<p>We do not hand your Chiron to a courier. Our own staff bring it to your address on our own transport. No carriers, no depots, no freight terminal, and nothing for you to collect.</p>

<h3>Lead time</h3>
<p>Bikes ship in <strong>4 to 6 weeks</strong> from the day you order. Your aluminium key case, containing your wireless key and steel owner card, is dispatched separately and normally reaches you several days before the bike does, so you can register your client ID in advance.</p>
<p>Accessories ordered on their own ship within 3 to 5 business days.</p>

<h3>Tracking</h3>
<p>You will receive updates at every stage: card etched, build checked, dispatched, and on the day, when the driver is close. You can also check the status at any time from the tracking page using the client ID on your steel card.</p>

<h3>On the day</h3>
<p>We agree a delivery window with you in advance. Someone aged 18 or over must be present to receive the bike and sign for it. If nobody is there we will contact you to arrange another day at no extra cost.</p>

<h3>Where we ship</h3>
<p>We currently deliver to the countries listed at checkout. If your country is not there yet, email us — we are adding more.</p>

<h3>Duties and taxes</h3>
<p>Any import duty or tax that applies to a delivery outside our home market is not included in the price shown and is the responsibility of the recipient, unless we state otherwise at checkout.</p>

<h3>Contact</h3>
<p>Questions about a delivery: {{ email }}</p>
```

**[DECIDE]** 4–6 week lead time · 3–5 days for accessories · age 18 to sign.

This one matters most: the storefront promises free, in-person delivery in three places.
The shipping rates now say $0.00 in both zones, so checkout finally agrees with the page.
If you ever put a paid rate back, change this copy in the same sitting.

---

## Terms of service

```html
<h2>Terms of service</h2>
<p>These terms apply to your use of this website and to any order you place with us. By placing an order you agree to them. Please read them before you buy.</p>

<h3>1. Who we are</h3>
<p>This store is operated by XERO. You can reach us at {{ email }}.</p>

<h3>2. Orders</h3>
<p>Your order is an offer to buy. A contract is formed when we send you an order confirmation. We may decline or cancel an order — for example where an item is unavailable, where a price or description was wrong, or where we suspect fraud. If we cancel an order you have paid for, we refund you in full.</p>

<h3>3. Prices and payment</h3>
<p>Prices are shown in the currency displayed at checkout and may change at any time before you order. Payment is taken at the time of order. Financing and pay-over-time options, where shown, are provided by third parties on their own terms, and approval is theirs to give.</p>

<h3>4. Delivery and risk</h3>
<p>Delivery is covered by our Shipping Policy. Risk in the goods passes to you when they are delivered to the address you gave us. Lead times are estimates given in good faith and are not guaranteed dates.</p>

<h3>5. Product information</h3>
<p>We work hard to describe our products accurately, but specifications, images and performance figures are given for guidance and may change as the product develops. Real-world performance — range, speed, charge time — varies with terrain, rider weight, temperature, tyre choice and setup. Colours may render differently on different screens.</p>

<h3>6. Use of the product</h3>
<p>You are responsible for using the machine lawfully and safely. Off-road electric motorcycles are not street legal in many jurisdictions, and registration, licensing, insurance and permitted use are your responsibility to check and comply with before riding. Always wear appropriate protective equipment. We are not responsible for fines, penalties or losses arising from use that is not permitted where you are.</p>

<h3>7. Warranty</h3>
<p>We warrant the bike against defects in materials and workmanship for 24 months from delivery, and the battery pack for 24 months or 1,500 charge cycles, whichever comes first. The warranty does not cover wear items (tyres, brake pads, grips), damage from crashes, misuse, competition use, unauthorised modification, or neglect. This warranty is in addition to, and does not limit, your statutory rights.</p>

<h3>8. 10-Year Replacement</h3>
<p>10-Year Replacement is a configuration of the bike, chosen at checkout, not a separate insurance product and not a policy underwritten by an insurer. Where it applies, for ten years from delivery we replace the machine rather than repair it. It covers the same categories of failure the standard warranty covers, and it does not cover theft, loss, crash damage, misuse, competition use, unauthorised modification, or neglect. One replacement per claim; the replacement carries the remainder of the original ten-year term, not a new one.</p>

<h3>9. Returns</h3>
<p>Returns are covered by our Refund Policy, which forms part of these terms.</p>

<h3>10. Accounts and security</h3>
<p>If you create an account, you are responsible for keeping your credentials secure and for activity under your account. Your client ID and steel card pair the machine to you — treat them as you would a key.</p>

<h3>11. Intellectual property</h3>
<p>All content on this site — text, images, film, design, code and marks — belongs to us or our licensors. You may not copy, reproduce or use it commercially without our written permission.</p>

<h3>12. Liability</h3>
<p>Nothing in these terms limits our liability for death or personal injury caused by our negligence, for fraud, or for anything else that cannot lawfully be limited. Subject to that, our total liability arising from an order is limited to the amount you paid for it, and we are not liable for indirect or consequential loss.</p>

<h3>13. Privacy</h3>
<p>How we handle your personal information is set out in our Privacy Policy.</p>

<h3>14. Changes</h3>
<p>We may update these terms. The version in force is the one published on this page at the time you place your order.</p>

<h3>15. Governing law</h3>
<p>These terms are governed by the laws of the jurisdiction in which XERO is established, and the courts there have non-exclusive jurisdiction. This does not remove any protection you have under the mandatory consumer law of the country where you live.</p>

<h3>16. Contact</h3>
<p>{{ email }}</p>
```

**[DECIDE]** 24-month warranty · 1,500-cycle battery term · the whole of clause 8.

Clause 8 is the one to read twice. The buy box sells "10-Year Replacement" for
$1,999.99. Calling a paid promise "insurance" is a regulated word in most markets and
would need a licence; this clause deliberately frames it as an extended replacement
term on the product instead. Keep it that way in the marketing copy too.

---

## Contact information

```html
<h2>Contact us</h2>
<p>The fastest way to reach a person is email. We answer every message ourselves — there is no ticket queue and no bot.</p>
<p><strong>Email:</strong> {{ email }}</p>
<p><strong>Response time:</strong> within one business day.</p>
<p>If you already have an order, include your order number or the client ID etched on your steel owner card and we can pull up your build straight away.</p>
```
