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
