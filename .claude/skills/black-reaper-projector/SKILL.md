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
