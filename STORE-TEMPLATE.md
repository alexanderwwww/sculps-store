# Buddy store template

How to stand up a whole storefront from one product, with **no new code**.

The Garden Buddy and Ceiling Buddy shells are already templates. The shell is
code; everything a shopper reads is rows in the database. A new store — Halloween
or anything else — is a store row, a product, and fifteen section rows.

Branch: `claude/kerberos-phase1-db-setup-6vjdq9`
Shell: `app/storefronts/garden-buddy/index.tsx` (+ `theme.css`)
Loader: `app/lib/store.server.ts` → `loadProductPage()`

---

## The contract

A section is four things:

```ts
{ type: string, position: number, hidden: boolean,
  values: Record<string,string>,
  blocks: [{ values: Record<string,string> }] }
```

`values` is the section's own copy. `blocks` are its repeating items — the three
steps, the six specs, the ten review cards. Nothing else. No layout, no classes,
no code.

**The whole field vocabulary is sixteen words**, reused everywhere:

| Where | Fields |
|---|---|
| Section | `heading` `subheading` `note` `footnote` `reassurance` |
| Block | `title` `text` `image` `alt` `video` `label` `caption` `value` `question` `us` `them` |

---

## The fifteen sections

Fixed order, fixed types. Any section can be `hidden: true` — the shell skips it,
so a store that has nothing to say in one slot simply doesn't.

| # | `type` | Section fields | Block fields | What it is |
|---|---|---|---|---|
| 1 | `buy_box` | — | `image` `alt` | Product shots. Price and variants come from the product, not here |
| 2 | `benefits` | `heading` `subheading` | `title` `text` `image` | Three or four reasons to care |
| 3 | `three_steps` | `heading` `subheading` | `title` `text` `image` | How it works, in three moves |
| 4 | `features` | `heading` `subheading` | `title` `text` `image` | What it does, in detail |
| 5 | `video_clips` | `heading` `subheading` | `video` `caption` | Short clips of it working |
| 6 | `who_its_for` | `heading` `subheading` | `title` `text` | Who should buy it — and implicitly who shouldn't |
| 7 | `comparison_table` | `heading` `subheading` | `label` `us` `them` | One row per point of difference |
| 8 | `specifications` | `heading` | `label` `value` | The numbers. Manufacturer figures, never "certified" |
| 9 | `whats_in_the_box` | `heading` `subheading` | `title` `text` | Everything that arrives |
| 10 | `trust_icons` | — | `title` `text` | Delivery, returns, support |
| 11 | `social_proof_images` | — | `image` | A wall of shots. Label renders honestly — see rules |
| 12 | `reviews` | `heading` `subheading` | — | Renders from the `reviews` table, not from blocks |
| 13 | `video_faq` | `heading` `subheading` `video` | `question` | Questions beside a clip |
| 14 | `product_grid` | `heading` `subheading` `footnote` | `title` `image` `note` | Other products, or the bundle |
| 15 | `closing_cta` | `heading` `subheading` | `image` `caption` | Last word before the footer |

---

## To build a new store

Give me the product and I fill all of it in. What I need from you:

1. **The product** — name, what it does, price, and what makes it different from
   the cheap version of the same thing.
2. **Photos** — hero shot, a few detail shots, anything in-use. More is better;
   sections 1, 2, 3, 4, 11 and 15 all eat images.
3. **Any real numbers** — size, weight, runtime, materials, warranty.
4. **Videos if you have them** — sections 5 and 13 are stronger with them, and
   both can be hidden if you don't.

What I produce:

- A `stores` row: name, slug, domain, currency, statement descriptor, email sender
- The product with its variants, SKUs, prices, weights and stock
- Fifteen section rows with every field written in the brand's voice
- The six policies, adapted to the product
- A checklist of what only you can do — payments, domain, launch

What I never invent:

- Reviews. Section 12 reads the `reviews` table. It stays empty until real
  verified orders produce real ones. Fake reviews are the one thing a payment
  processor treats as disqualifying rather than fixable.
- Specifications. If a number isn't in the supplier's documents, the field is
  left out rather than guessed at.
- Photographs of a product nobody owns yet. Renders are labelled as renders.

---

## Rules carried over from XERO

Learned the expensive way; they apply to every store on this platform.

1. **Native payment path only.** The platform's own add-to-cart and payment
   button. Never a hand-rolled POST to a checkout URL.
2. **Inventory tracked, overselling off** — but set the quantities *first*, then
   turn tracking on. Backwards leaves a tracked/deny/zero window where the
   storefront says "sold out" while the admin shows stock.
3. **All six policies in the platform's policy settings**, not only as pages.
   Empty policy objects are a top-three reason payment applications get declined.
4. **Never label a render or brand footage as customer content.** A store with no
   orders cannot have customer photos, and it is checkable.
5. **Never describe stock as pre-order** unless it genuinely is, and never
   describe an untested figure as certified.
6. **Every animation needs a visible-by-default fallback.** Nothing parked at
   `opacity: 0` waiting on a script that might not run.
7. **Stores never share customers.** Each brand keeps its own list and its own
   tag. Nothing reveals that two shops have the same owner.

---

## The two shells

| | Garden Buddy | Ceiling Buddy |
|---|---|---|
| Files | 9 | 4 |
| Extras | cart drawer, checkout chrome + CSS, PayPal express, product express, support chat, an interactive product demo | cart drawer, embeds |
| Use it when | the product benefits from a demo and a full owned checkout | a straight product page is enough |

Both read the same fifteen sections, so the choice is about how much machinery
comes with the shell, not about the content. Start from Garden Buddy unless the
product is simple.
