---
name: flip
description: The flip app and the resale business it runs — Alex's Depop shop for vintage, Y2K, streetwear and designer, and the Mac app that lists, prices, refreshes, answers and negotiates for it. Use whenever the work touches flip, Depop, reselling, thrift or vintage sourcing, Chrome Hearts or any designer piece he is flipping, listing photos or titles for resale, the resale playbook, or "the Depop app". Trigger it when he says "flip", "the shop", "the listings", "list this", "what should this go for" — the name, the vibe and the mechanics here are decided and must not be re-derived.
---

# flip

A Depop shop, and the Mac app that runs it.

Named by his girlfriend. **Lowercase, always** — `flip`, never FLIP. Lowercase reads
secondhand, soft, girl-run, a rail in a bedroom with good light. Uppercase reads
sneaker-bot and pushes away half the customers.

## The business

He is a plug in real life. He can get anything from Nike to a Birkin. That is the
whole edge, and it is the half that software cannot do — the app does not source. It
takes what he already has hands on and turns it into listings, prices, replies and
sales.

Two customers under one shop, and they do not fight:

- **Y2K / vintage / thrift** — cute, cheap, fast, mostly girls. Volume and velocity.
- **Designer and streetwear** — Chrome Hearts, Nike, Carhartt, Dickies, the Birkin end.
  Few pieces, big tickets, slow.

The vibe is **the resale shop, not the reseller**. Warm, a little worn, good
photography on cheap backgrounds, handwritten energy. Never marketplace-speak.

## What the app does, and what it never does

Does: writes titles and descriptions in his voice, prices against sold comps,
refreshes the right listings at the right hour, sends offers to likers, answers
messages, negotiates inside a floor he sets, tracks what sold and what sat.

Never: presses send on a sale, ships, or authenticates. And never sources.

**The rule that keeps the shop alive:** Depop's terms do not permit third-party
automation, and enforcement is by *behaviour*, not by tooling. Accounts die from
volume and rhythm — bot-speed following, refreshing hundreds of times an hour, blast
messaging. Reported case: ~40 follow actions a minute, rate-limit ban in six hours.
So the app moves at a person's pace, with the same human-timing model Clone Me uses,
and the last button is his. Same posture as Fiverr: the machine does the work, the
human presses the button.

## The mechanics — what actually moves listings

Researched September 2026. Re-check before betting real money on any number.

### Ranking

Two buckets: **relevance** (does it match the search?) then **quality** (which
matching listing wins?). Weight order: **title → hashtags and category → description**.

Quality signals that matter: conversion rate, response time to messages, seller
review score, recency.

### Titles

`[Brand] [Style] [Era] [Colour] [Feature]`

> Levi's 501 Vintage 90s Blue Straight Leg Jeans

The most specific thing a buyer would type goes first. "Vintage Levi's 501" beats
"blue denim" for the query "Levi's 501 jeans". Vague titles are the single most common
self-inflicted wound.

### Hashtags

Use all five, there is no penalty for the full allowance. Specific beats broad:
`#vintagedenim` over `#vintage`. Generic tags used by millions read as spam.

### Refreshing

- Once per 24 hours per listing, never more.
- Peak windows: **12:30** and **19:30**.
- Refresh the **15–20 most-liked** items, not the whole shop.
- Refreshing dead stock with zero engagement is read as artificial activity and is
  penalised. This is the line the app must not cross.

### Offers to likers

10–15% off to people who liked an item sitting **two weeks or more**, about every
3–4 days on a stagnant listing. Price drops notify likers, so a drop is a free push.

### Response time

A ranked signal. Inside 4 hours improves position; dormant shops get de-ranked. This
is the one place the app earns its keep every single day.

### Cadence

3–5 new listings a week minimum to stay in favour; 1–2 a day if the stock is there.

### Photos — four, in this order

1. **Styled or on a body.** Modelled and mannequin shots beat flat lays. This is the
   cover and it is most of the decision.
2. **Detail** — fabric, label, hardware, the thing that proves it is real.
3. **Full flat lay** with measurements.
4. **The flaws.** Shown, not hidden. Hiding them is what produces claims.

Natural light near a window, golden hour, never harsh midday. Clean white or cream
wall, brick, texture, or outside.

### Descriptions

Casual and conversational. Era, brand, material, **measurements in inches** (pit to
pit, length) — not just the size label — fit range, styling line, condition including
every flaw.

### What sells and what does not

Sells: Y2K, 90s, 80s vintage; Nike, Carhartt, Dickies streetwear; designer;
one-of-one and reworked pieces.

Does not: H&M, Forever 21, Shein, anything basic, anything that photographs flat.

### Fees

Sources disagree — one says 0% selling commission for US/UK listings created after
July 2024 with only payment processing (3.3% + $0.45 US), another still quotes 10%.
**Check the live fee in his own account before pricing anything against it.**

## Authenticity — the one that ends the business

Chrome Hearts is among the most counterfeited brands on earth, and Depop is
aggressive: a buyer claim takes the money and the item, and repeats kill the shop.
Everything listed has to be genuine and provable — receipts, tags, hardware shots,
close detail.

Replicas are not a grey area here and nothing gets built for them.

## The app

Same bones as Clone Me, which is already built and working: borderless window, the
orb, the injected page agent, the Node worker, the bridge, human pacing, and the
connector so Claude is the brain and the laptop holds no credential.

What is new: `sites/depop.js` (the reader and the hands), a listing composer, a comp
lookup, a refresh scheduler that respects the rules above, and an offer engine.

Build it after Clone Me has typed its first job. Two half-finished apps are worth
nothing.

## Sources

- https://www.underpriced.app/blog/depop-algorithm-seo-guide-2026
- https://www.voolist.com/blog/how-to-sell-on-depop-guide
- https://nifty.ai/post/depop-selling-tips
- https://selleraider.com/will-depop-ban-my-account-for-using-a-bot/
- https://depopautomation.com/blog/how-to-not-get-banned-on-depop

Channels he rates, to be transcribed and folded in: **Jay's Pittsburgh**. Send more
links and they get distilled into this file.
