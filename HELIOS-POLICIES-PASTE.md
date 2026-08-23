# HELIOS — Store Policies (paste-ready)

The Shopify app lacks `write_legal_policies`, so these cannot be created through the API.
Paste them by hand: **Settings → Policies** → click each → paste → **Save**.

Checkout only shows what is in Settings → Policies. The pages in the footer are for
browsing; they do not satisfy checkout, so both need to exist.

Every claim below matches the live store as configured today:

| Claim | Live setting |
|---|---|
| Ships to the United States only | delivery profile: one US zone, `shipsToCountries: ["US"]` |
| Free shipping, no paid option | one rate, `$0.00 USD`, "Free shipping" |
| 7–10 business days | rate description |
| Ships from New York | store address, tracking origin |
| Prices in USD | shop currency USD |

If you ever add a paid or express rate, update the Shipping Policy the same day.
The policy and the rate table must always agree.

---

## 1 · REFUND POLICY

```html
<p><strong>30-day money-back guarantee.</strong> If you are not happy with your HELIOS product, you can return it within 30 days of delivery for a full refund of the product price.</p>

<p><strong>How to start a return:</strong> email <a href="mailto:helios.us.store@gmail.com">helios.us.store@gmail.com</a> with your order number and the reason. We reply within 24 hours with return instructions and the return address. Please do not send items back before contacting us, as we cannot match an unannounced return to your order.</p>

<p><strong>Condition:</strong> items must be returned unused, in the condition you received them, and in their original packaging with everything that came in the box — lounger, motors, battery, charger, inflation nozzle and repair kit.</p>

<p><strong>Return shipping</strong> is paid by the customer if you changed your mind. If the item arrived damaged, faulty, or was not what you ordered, we cover return shipping.</p>

<p><strong>Refunds</strong> are issued to your original payment method within 5–10 business days of us receiving and inspecting the return. Your bank may take a few more days to show it. Original shipping was free, so there is nothing deducted for it, and there is no restocking fee.</p>

<p><strong>Damaged or faulty on arrival:</strong> email us within 7 days of delivery with photos of the item and packaging. We will send a free replacement or refund you in full — usually with no return required.</p>

<p><strong>Order never arrived:</strong> contact us before anything else. We respond within 24 hours and will reship or refund you in full. You will not be left out of pocket.</p>

<p><strong>Cancellations:</strong> you can cancel for a full refund any time before your order is dispatched. Email us with your order number.</p>

<p><strong>12-month warranty.</strong> The electric motors and battery are covered for 12 months from delivery against manufacturing defects. Email us with your order number and a description or short video of the fault and we will repair, replace or refund at our discretion. The warranty does not cover punctures, wear from normal use, damage from misuse, or damage from use in surf or open water.</p>

<p>For hygiene and safety reasons we cannot accept change-of-mind returns on items that have been used in water, unless they are faulty.</p>

<p>Nothing in this policy limits your rights under applicable consumer law.</p>
```

---

## 2 · SHIPPING POLICY

```html
<p><strong>Where we ship:</strong> the United States only, including all 50 states. We do not currently ship internationally.</p>

<p><strong>Where we ship from:</strong> our store in New York, NY. Every order is picked, packed and dispatched by our own team.</p>

<p><strong>Shipping cost: free.</strong> Shipping is free on every order, with no minimum. There is no paid or express option — one shipping method, free, on everything we sell.</p>

<p><strong>Order processing:</strong> orders are processed within 1–3 business days of payment. Orders placed at weekends or on public holidays are processed the next business day.</p>

<p><strong>Estimated delivery:</strong> <strong>7–10 business days</strong> from dispatch. This is an estimate, not a guarantee, and does not include the processing time above.</p>

<p><strong>Tracking:</strong> every order ships tracked. You receive a HELIOS tracking number by email as soon as your parcel is dispatched, and you can follow it at any time on our <a href="/pages/track">tracking page</a>. If you have not received tracking within 5 business days of ordering, email <a href="mailto:helios.us.store@gmail.com">helios.us.store@gmail.com</a> and we will send it the same day.</p>

<p><strong>Delays:</strong> shipping can occasionally be delayed by carrier backlogs, weather or public holidays. If your order passes the estimated delivery window, contact us first — we respond within 24 hours and will locate your parcel, reship it, or refund you in full.</p>

<p><strong>Lost or missing parcels:</strong> if tracking shows no movement for 10 consecutive days, or your parcel is marked delivered but you did not receive it, contact us within 30 days of the order date. We will investigate with the carrier and reship or refund — your choice.</p>

<p><strong>Incorrect addresses:</strong> please double-check your address at checkout. We cannot redirect a parcel once dispatched. If a parcel is returned to us because the address was wrong or incomplete, we will contact you to arrange reshipment.</p>

<p><strong>Taxes and duties:</strong> as we ship only within the United States, there are no customs charges or import duties on your order. Any applicable sales tax is shown at checkout before you pay.</p>
```

---

## 3 · TERMS OF SERVICE

```html
<p>This store is operated by HELIOS. By using this site or purchasing from us, you agree to these Terms of Service.</p>

<h3>Eligibility</h3>
<p>You must be at least 18 years old, or have the consent of a parent or guardian, to purchase from this store.</p>

<h3>Products</h3>
<p>We make every effort to display our products and their colours accurately. Actual products may vary slightly from images. Specifications may be updated by the manufacturer without notice.</p>

<h3>Product safety — please read</h3>
<p>HELIOS motorised water products are recreational leisure products. They are <strong>not</strong> life-saving devices, personal flotation devices, or safety equipment.</p>
<ul>
<li>Always supervise children. Not suitable for children under 16 without direct adult supervision.</li>
<li>Use only in calm, enclosed water such as swimming pools and still lakes. Not for open sea, rivers with current, or surf.</li>
<li>Never use under the influence of alcohol or drugs.</li>
<li>Do not exceed the stated maximum weight limit.</li>
<li>Read the full instruction manual before first use.</li>
<li>Charge the battery only with the supplied charger and never leave it charging unattended.</li>
<li>Rinse with fresh water after use in salt water so salt does not sit on the motors.</li>
</ul>
<p>By purchasing, you accept these safety terms and agree to use the product responsibly and at your own risk.</p>

<h3>Pricing and payment</h3>
<p>All prices are listed in US dollars and may change without notice. Any price shown with a strike-through is the total you would pay buying that quantity individually at our single-unit price. We may refuse or cancel any order, including where a product was listed at an incorrect price. If we cancel your order, we refund you in full.</p>

<h3>Discount codes</h3>
<p>Discount codes are limited to one use per customer unless stated otherwise, cannot be combined with other codes, and have no cash value.</p>

<h3>Orders</h3>
<p>Your order is an offer to purchase. We accept it when we dispatch it. We may cancel an order if the product is unavailable, if we suspect fraud, or if the order breaches these terms.</p>

<h3>Shipping and returns</h3>
<p>Delivery times, returns, refunds and warranty are governed by our Shipping Policy and Refund Policy, which form part of these terms.</p>

<h3>Order tracking</h3>
<p>Our tracking page shows the status, destination city and estimated delivery of an order against its HELIOS tracking number. It does not display full addresses or contact details.</p>

<h3>Limitation of liability</h3>
<p>To the fullest extent permitted by law, our total liability for any claim relating to a product is limited to the amount you paid for that product. We are not liable for injury or loss arising from misuse of the product or failure to follow the safety instructions above.</p>

<h3>Governing law</h3>
<p>These terms are governed by the laws of the State of New York, United States.</p>

<h3>Contact</h3>
<p>helios.us.store@gmail.com</p>
```

---

## 4 · CONTACT INFORMATION

```html
<p>We are a small team in New York and we answer every message personally.</p>

<p><strong>Email:</strong> <a href="mailto:helios.us.store@gmail.com">helios.us.store@gmail.com</a><br>
<strong>Response time:</strong> within 24 hours, 7 days a week</p>

<p><strong>HELIOS</strong><br>
505 W 162nd St<br>
New York, NY 10032<br>
United States</p>

<p>For order questions, please include your order number so we can help you straight away.</p>
```

---

## Check before you paste

**Confirm the address.** `505 W 162nd St, New York, NY 10032` carried over from the earlier
build. It appears in the Contact policy, which customers and payment reviewers read. If it is
not the address you want on record, change it in all four places before saving.

**Privacy policy** already exists — Shopify's generated one. Leave it. It fills in your shop
name, email and address automatically, so it stays correct once the address above is right.

**Add a phone number** — Settings → General. Still empty, and some payment and verification
flows ask for it.
