---
name: black-reaper-projector
description: The Halloween/Christmas projector add-on for Black Reaper, chosen 2026-10-19 from the Meta Ad Library. Use when the work touches the projector, HoloHaunt, Tecc Marts, or Black Reaper add-on products.
---
# Projector add-on for Black Reaper (decided 2026-10-19)

Alex chose this product: "I take it."

## The competitor
- Tecc Marts sells it as "HoloHaunt AI Cinematic Projector" at teccmarts.com/HGpro.
- Prices: 1 unit $69.95 (shown "compared at" $139.99), 2 for $134.95, 3 for $199.95.
- Scenes include Zombie Swarm, Floating Phantoms, Dancing Bones and a bonus Santa, so it carries into Christmas.
- Their ad (Library ID 1781950096149147) has been active since Aug 12, 2026, and about 6 of their ads are active. Running that long is the proof it sells.
- Watch the ad: https://www.facebook.com/ads/library/?id=1781950096149147

## How we do it
- Copy the idea and the offer, never their media. Use supplier photos and our own video and copy, so the store can't be taken down for copyright.
- It has to ship from a US warehouse to arrive before Oct 31. After Nov 1, sell it as the Christmas projector.
- AliExpress search terms that find the factory version: "halloween projector outdoor dual lens", "halloween window projector hologram". The exact factory model is not identified yet.
- Any paid video render goes through ugc-master-prompter and needs Alex's OK on the price first.

## Store decisions (Alex, 2026-10-19)
- blackreaper.us sells only 2 products: **The 16 ft Scream** and **The Ghost Projector** (handle `haunted-projector`; the title was renamed in the DB).
- The Crawling Zombie and The Black Reaper were set to draft. The Halloween Movie Theater stays hidden ("fuck the movie theater").
- Main menu: "16 ft Scream", "Ghost Projector", Reviews, FAQ, Shop all. The menu lives in the `menu_links` table, so no deploy is needed.
- Checked live: home and shop-all show Ghost Projector, and zombie/black-reaper return 404.

## The ad style for every store (Alex: "this is the style of ads I want for every store and every product")
- The reference videos are the three Tecc Marts ads, downloaded to the session scratchpad `ads/` (19 s, 22 s, 38 s).
- What they all do:
  - vertical phone video at night
  - the product's effect huge on a real house
  - a short hook caption
  - a fast cut to the product
  - an offer ("bundle and save")
- Alex edits the video himself. Never run a competitor's video unedited.

## Ghost Projector page: fixes for the next session (Alex agreed to do these in a new session)
1. Buy box images, square, in the master buy-box order (kerberos skill):
   - house at night with the zombie swarm on the window
   - the kit: projector, window screen, remote
   - Temu-style spec panel
   - Santa scene ("not just Halloween")
   - Make them with Magic Wand from supplier photos, never the competitor's.
2. Copy: what it is in one line (projector + window screen + 12 Halloween & Christmas scenes, plug in and play), the box contents and setup in 3 steps. No made-up "A.I." claims and no fake reviews or purchase counters.
3. Price ladder against the competitor ($69.95 / $134.95 / $199.95): 1 for $59.99, 2 for $109.99, 3 for $149.99. OCTOBER31 is $31 off. Check the price against the real supplier cost first.
4. Supplier: mini projector + 120" holographic window mesh screen, US warehouse, so it delivers before Oct 31. Fill in cost_cents and supplier_url.
5. Our own scene videos (zombie swarm, phantoms, skeletons, the Scream, Santa) made with Kling/XUGC through ugc-master-prompter. Alex OKs the price before any render.
6. After every change: load /products/haunted-projector live, then run add-to-cart and checkout render checks (AGENTS rule 20). No live charges.

## Live offer (2026-10-19, set in the DB with no deploy)
- Projector prices:
  - 1 for $69.99
  - 2 for $99.99 (compare-at $139.98, the default)
  - 3 for $129.99 (compare-at $209.97)
- The Scream: 1+1 at $449.99 (compare-at $599.98) is the default.
- Both buy buttons read "Claim 50% off". The claim is true because the second unit is half off or more.
- Compare-at always equals the single price × quantity. Never use a made-up "was" price (AGENTS rule 19).
- Checked: add → cart → checkout returned 200 on both products.
- OCTOBER31 now needs a $130 minimum subtotal, so it never applies to projector-only carts (the 3-pack is $129.99). Alex: "$31 off does not apply" to the projector.
- Magic Wand: Alex wants one picture at a time, not the whole set queued at once.

## The real product (Alex, 2026-10-19)
- Supplier photo: `design/reaper/ghost-projector-supplier.jpg`. Cost $10.
- It is a black outdoor dual-head projector on a ground/wall mount:
  - a 6-slot pattern wheel on the left
  - a crystal "magic ball" colour lens on the right
- It projects moving pattern slides and coloured light. It is NOT a video projector. Never promise films, "12 movies", zombie swarm video or a window screen.
- Prices:
  - 1 for $99.99
  - 2 for $129.99 (compare-at $199.98, the default)
  - 3 for $199.89 (compare-at $299.97)
- OCTOBER31 needs a $200 minimum, so no projector cart gets it.

## The ad and image style, from watching the 3 Tecc Marts ads frame by frame (Alex: "no cute ghost pumpkin bullshit")
- **The 38 s ad shows the exact unit Alex sources:** the black dual-head projector with red and green lenses on its mount.
- **Projections:** huge, glowing and scary, filling a whole wall:
  - a blue-fire flaming skull across the garage door
  - a red hooded skeleton reaper with a scythe wrapping the whole house in red fire
  - a fire-outlined reaper across barn doors
  - a red neon skull on a dining-room wall
  - a blue ghost bride filling a hallway
  - blue ghost skulls up a staircase
  - a big glowing jack-o'-lantern over a sofa
- **Reaction shots:** neighbours on the sidewalk filming with phones, lit red. A couple open-mouthed with a phone torch. Two kids in costume, shocked. A woman filming from the porch with the street behind her.
- **Product shots:** hands lifting it out of a cardboard box, it on a table next to a remote and slide discs, a hand mounting it on a porch post.
- **Captions:** big bold yellow/white boxes:
  - "WHY BUY A DOZEN DECORATIONS WHEN ONE PROJECTION DOES THIS?"
  - "YOUR HOUSE CAN LOOK LIKE THIS IN SECONDS"
  - a "Halloween Projector" label in red/blue.
- **Mood:** night, saturated red and electric blue, phone-camera realism.
- **For every Black Reaper image:** cute cartoon ghosts and pumpkins are banned. The scenes must be ones the unit's slides actually include (confirm the slide list with the supplier) so the page never sells a picture the box can't make.

## The premium look Alex wants: competitor-ad scenes + the Black Reaper panel style
**BANNED (Alex, furious): `br-m1-hero.webp`, the coloured orange/green/purple chip boxes. Never use that look again.**

The approved Scream images, all on blackreaper.us/media:
- `scr-ad-6-box.jpg`: callouts + "In the box" on white
- `scr-b-street.webp`: red bar "IT STANDS OVER THE HOUSE"
- `scr-b-scale.webp`: a grown adult beside it for scale
- `scr-b-does.webp`: "EVERYTHING IT DOES" with an outlined icon list
- `scr-c-daynight.webp`: DAY/NIGHT split
- `scr-b-steps.webp`: "UP IN NINETY SECONDS", 3 numbered photo steps
- `scr-b-weather.webp`: a thin white icon strip along the bottom
- `scr-s7-detail.webp`: **the blue one**, a cinematic close-up on deep blue night
- `scr-band.webp`: the dark iPhone iMessage at 12:00
- `scr-b-feel.webp`: "THE WHOLE STREET SLOWS DOWN FOR IT"

The style: the **red** light glowing from the product, a white-on-red condensed headline bar, black outline icons and thin callouts on white, real suburban houses.

Every Ghost Projector image = this panel system wrapped around the scary night scenes from the Tecc ads. It should look premium enough to sell at $99.99 against their cheap site.

Also make two "CLAIM 50% OFF" banners, one per product, for the top of each page and the ad landing.

## Page built (2026-10-19)
- The 16 Gemini images are in R2 as `gp-gem-NN-01.jpg`, with `-w640.webp` and `-t200.webp` copies. The page needs those size copies, or the UGC wall gets 404s. #15 (the kids, with cartoon pumpkins) is unused.
- What the page now uses:
  - Gallery (`products.images`): images 1, 2, 4, 5, 6, 7, 11, 3.
  - Bundles: "1 / 2 / 3 projectors".
  - FAQ rewritten for the real product.
  - UGC wall: images 10, 17, 9, 8, 16, 12.
  - Box list: projector, stake, wall mount, adapter, remote.
- Hidden: the old hologram grid and "rest of the yard".
- Store share image changed from the banned br-m1-hero to scr-b-street.
- Code: `publicOffer` now returns `minimumSubtotalCents`. The storefront hides the coupon bar on a page whose biggest bundle is under the code's minimum. Deployed as version bed43468; checked add → cart → checkout on all 5 bundles.
- Still to do:
  - Images 18-27 (iMessage, review photos, 50% banners), when Gemini or ChatGPT have limits again.
  - Confirm with the supplier: weatherproof rating, remote, and the actual slide scenes.
  - The hidden reviews section still holds reviews of the old hologram projector.

## 2026-10-19 — CLAIM 50% OFF pop-up; no $31 on the projector

- **What showed the $31:** `app/routes/products.bodies.tsx` (the product route) loaded the bar's code with "first active discount, any kind", which returned the single-use claim code `OCT31AX8LHN` — every visitor on every product page saw it, in the top bar, the buy-box coupon pill and the `$31 off` email pop-up (`ceiling-buddy/popup.tsx`). Now it uses `publicOffer` + the same minimum rule as the home route, so the projector page shows no code and the Scream shows `OCTOBER31`.
- **Pop-up:** on store `reaper` the email pop-up is replaced by `app/storefronts/reaper/claim-popup.tsx` (styles `.c50*` in `reaper/theme.css`). Claim picks the page's default discounted bundle (projector → 2 projectors, Scream → 1+1), strikes compare-at, counts down to price, stamps "YOU SAVED $x — 50% OFF CLAIMED", bursts, then adds it to the cart. All numbers come from the variant. Once a month per browser (`br_claim50`); `?claim=1` opens it at once for checking.
- **Minted $31 codes:** `claimExtraFor` gives minted OCT31xxxx codes the public code's minimum ($200); the checkout refuses to mint under it and hides the OCTOBER 31 card on carts under it. `OCT31AX8LHN` was given the $200 minimum in the DB.
- Real percentages, for the record: 2-pack is 35% off compare-at, Scream 1+1 is 25% (the second Scream is half price). "50% OFF" is the offer wording on the buttons.
- Deployed 5a36fbc5-2dd4-4b2b-a921-354cf1dbad43; rollback `npx wrangler rollback bed43468-f70c-4717-9aee-488a617efaca`.
- 2026-10-19: the claim no longer adds anything to the cart. After the price drop it closes on the bundle picker and the customer chooses 1, 2 or 3 (Alex). Deployed as 7b140c5c.
- 2026-10-19: all $31 removed. OCTOBER31 and the minted OCT31xxxx codes are inactive, and the checkout claim card is off for the Reaper skin. The only offer is 50% off the second one. Deployed as d465b16a. Checked: no $31 on home, the projector page, or any of the 5 checkouts.

## 2026-10-19 — Comeback $20 and the email flows

- **REAPER20 was live again.** Turning OCTOBER31 off made `publicOffer` fall back to the old REAPER20 row, and the top bar showed it. It is now `active=false` in the DB. Black Reaper has no public code.
- **Comeback rule** (Alex: "when people come back and they have stuff in their cart, they get $20 off"). This lives in `app/lib/cart.server.ts`, in `grantComeback`.
  - Who gets it: an open cart with items that was left. "Left" means a recovery email went out for it, or nothing in it changed for an hour.
  - When: it is applied when the cart is next priced (drawer, checkout, payment intent) or before the next add-to-cart.
  - The code: `COMEBACK20-<first 8 chars of the cart id>`, fixed $20 off the order, single use, once per customer. The cart and checkout show it as "Welcome back — $20 off".
  - It never stacks. It is only granted to a cart that has no code on it, it is granted once, and if the customer removes it, it stays off.
  - It only works on its own cart. `priceCart` and both apply forms refuse a COMEBACK20 code on any other cart.
  - It is $20 and nothing else. Never invent another number.
  - Only on the `reaper` store, set by `COMEBACK_STORES`.
- **Email flows** (`app/lib/emails/reaper-flows.ts`, in the receipt's look). All of them sit behind `stores.email_flows_on`, which is **OFF for reaper** until Alex says send.
  - Cart left, email known, no payment yet: "<product> is still in your cart", about 1h after.
  - Checkout left at payment: "<first>, one tap left", about 1h after.
  - The comeback: "Welcome back: $20 off <product>", about 24h after the first email. The link applies the code.
  - Order confirmation: the existing `reaper-receipt.ts`. It is already live and not gated; only the projector facts and picture in it were corrected.
  - Shipped with tracking: "<product> is on its way", sent when tracking is added in the admin.
  - Setup guide: "Tonight, the street stops at your house", 6 days after it ships.
  - Review ask: "Did the street stop?", 4 days after the setup guide.
- **Switching the emails on** is a DB flag, so Alex never needs a terminal. When he says send, the agent runs `update stores set email_flows_on=true where slug='reaper'`. While the flag is off, carts are not stamped, so carts from the last 72h are still picked up once it is on.
- Previews: render with the scratch `preview.ts` and screenshot at 420px. Never send a customer email without Alex's OK.
- **To fix:** the projector's DB `description` still describes the old window version ("ghosts across your front window"). The page's buy box is right. That site copy was left alone for Alex to approve.
- Deployed 83b62bca. Rollback: `npx wrangler rollback d465b16a-5670-4a44-98e4-b5063b10affa`.
