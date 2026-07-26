# HELIOS — Store Policies (paste-ready)

The Shopify connector I'm using has `read_legal_policies` but **not** `write_legal_policies`,
so I cannot create these through the API. You need to paste them by hand.

**Where:** Shopify admin → **Settings → Policies** → click each one → paste → **Save**.

Only *Privacy policy* currently exists (Shopify's auto-generated one — leave it).
The four below are missing, and your site is promising things none of them back up.

Delivery times below say **7–10 business days** free / **next-day** express, per your latest instruction.
If those change, change them here too — the policy and the shipping rate must always agree.

---

## 1 · REFUND POLICY

```html
<p><strong>30-day money-back guarantee.</strong> If you are not happy with your HELIOS product, you can return it within 30 days of delivery for a full refund of the product price.</p>

<p><strong>How to start a return:</strong> email <a href="mailto:helios.us.store@gmail.com">helios.us.store@gmail.com</a> with your order number and the reason. We reply within 24 hours with return instructions and the return address. Please do not send items back before contacting us.</p>

<p><strong>Return shipping</strong> is paid by the customer, unless the item arrived damaged, faulty, or was not what you ordered — in those cases we cover it.</p>

<p><strong>Refunds</strong> are issued to your original payment method within 5–10 business days of us receiving and inspecting the return. Your bank may take a few more days to show it.</p>

<p><strong>Damaged or faulty on arrival:</strong> email us within 7 days of delivery with photos of the item and packaging. We will send a free replacement or refund you in full — usually with no return required.</p>

<p><strong>Order never arrived:</strong> contact us before anything else. We respond within 24 hours and will reship or refund you in full. You will not be left out of pocket.</p>

<p><strong>Cancellations:</strong> you can cancel for a full refund any time before your order is dispatched. Email us with your order number.</p>

<p>For hygiene and safety reasons we cannot accept returns on items used in water, unless they are faulty.</p>
```

---

## 2 · SHIPPING POLICY

```html
<p><strong>Where we ship:</strong> the United States.</p>

<p><strong>Order processing:</strong> orders are processed within 1–3 business days of payment. Orders placed at weekends or on public holidays are processed the next business day.</p>

<p><strong>Free standard shipping:</strong> free on every order. Estimated delivery is <strong>7–10 business days</strong>.</p>

<p><strong>Express shipping — $129.99:</strong> select Express at checkout for <strong>next-business-day delivery</strong>. Orders placed after 12pm ET, at weekends, or on public holidays ship the next business day. If we cannot dispatch your express order the same business day, we refund the express fee in full and ship it free.</p>

<p><strong>Tracking:</strong> every order ships with a tracking number, emailed to you as soon as your parcel is dispatched. If you have not received tracking within 5 business days of ordering, email <a href="mailto:helios.us.store@gmail.com">helios.us.store@gmail.com</a> and we will send it the same day.</p>

<p><strong>Delays:</strong> shipping can occasionally be delayed by customs, carrier backlogs or weather. If your order passes the estimated delivery window, contact us first — we respond within 24 hours and will locate your parcel, reship it, or refund you in full.</p>

<p><strong>Lost or missing parcels:</strong> if tracking shows no movement for 10 consecutive days, or your parcel is marked delivered but you did not receive it, contact us within 30 days of the order date. We will investigate with the carrier and reship or refund — your choice.</p>

<p><strong>Incorrect addresses:</strong> please double-check your address at checkout. We cannot redirect a parcel once dispatched. If a parcel is returned to us due to an incorrect address, we will contact you to arrange reshipment.</p>
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
</ul>
<p>By purchasing, you accept these safety terms and agree to use the product responsibly and at your own risk.</p>

<h3>Pricing and payment</h3>
<p>All prices are listed in USD and may change without notice. We may refuse or cancel any order, including where a product was listed at an incorrect price. If we cancel your order, we refund you in full.</p>

<h3>Orders</h3>
<p>Your order is an offer to purchase. We accept it when we dispatch it. We may cancel an order if the product is unavailable, if we suspect fraud, or if the order breaches these terms.</p>

<h3>Shipping and returns</h3>
<p>Delivery times, returns and refunds are governed by our Shipping Policy and Refund Policy, which form part of these terms.</p>

<h3>Limitation of liability</h3>
<p>To the fullest extent permitted by law, our total liability for any claim relating to a product is limited to the amount you paid for that product. We are not liable for injury or loss arising from misuse of the product or failure to follow the safety instructions above.</p>

<h3>Contact</h3>
<p>helios.us.store@gmail.com</p>
```

---

## 4 · CONTACT INFORMATION

```html
<p>We are a small team and we answer every message personally.</p>

<p><strong>Email:</strong> <a href="mailto:helios.us.store@gmail.com">helios.us.store@gmail.com</a><br>
<strong>Response time:</strong> within 24 hours, 7 days a week</p>

<p><strong>HELIOS</strong><br>
505 W 162nd St<br>
New York, NY 10032<br>
United States</p>

<p>For order questions, please include your order number so we can help you straight away.</p>
```

---

## After pasting

**Add them to your footer** — Online Store → Navigation → Footer menu. Shopify auto-links
policies at checkout, but a visible footer link is what stops a nervous buyer bouncing.

**Add a phone number** — Settings → General. It's currently empty, and some payment and
verification flows ask for it.
