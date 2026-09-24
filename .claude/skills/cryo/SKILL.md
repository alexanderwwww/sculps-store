---
name: cryo
description: The cryo product — a portable countertop machine that chills a bottle of water without a fridge or ice. Use whenever the work touches cryo: the locked industrial design, the store on Kerberos, ad copy and hooks, supplier sourcing on Alibaba/1688, the sample, pricing, or the shot list. Trigger it even when Alex only says "the chiller", "the cold thing", "the new product" or "the machine" if the context is this project — the design and the positioning are locked and must not be re-derived.
---

# cryo

A portable countertop machine that makes a bottle of water ice-cold without a fridge
and without ice. Alex owns the business; I run the project day to day and report to him.

## The Bible — read this before anything

His words, 24 Sep 2026, and the test every decision gets held against:

> This product must look like something that went to the Shark Tank and it had like one
> of the highest offers. It must look like something that every household in America
> would have — from a middle class home, to somebody that is broke, to a black guy in
> the Bronx who's broke, to a rapper. Kim Kardashian should have this product. So the
> price as much as possible can be workable and achievable for all people to buy.

What that actually means when I am making something:

- **Mass, not boutique.** The thing a whole country owns, not a thing a design magazine
  praises. Every choice gets the household test: would a family on a tight budget put
  this on their counter and feel good about it?
- **Aspirational and affordable at the same time.** It has to look like it costs three
  times what it costs. That is the Shark Tank look: obvious, instant, premium, cheap to
  say yes to.
- **Price is a feature.** $149–199 was the opening idea and it fights the Bible. Every
  dollar off the landed cost is a dollar toward the product he actually described.
  Pricing gets decided from landed cost, and the cheaper it lands the better the brief
  is served.
- **Instantly understandable.** A person sees it for three seconds and knows what it
  does. No explaining, no education, no category creation.

## The product

A bottle goes in, the lid closes, it comes out ice-cold. No fridge, no ice.

**The design is locked. Do not redesign it.** The reference render is the contract:

- Horizontal rounded-rectangle body, lunchbox size (~28 × 14 × 14 cm)
- Brushed silver aluminium, one clean seamless piece
- Clear domed bubble lid, spaceship-canopy shape, bottle visible inside
- The bottle lies horizontally on two silver rollers and spins in icy blue mist
- One aluminium dial on the front, glowing ice-blue LED ring
- Black lowercase **cryo** wordmark, front left
- Apple-level minimal

**How it works — changed 24 Sep 2026, and this supersedes the cartridge.** The machine
holds its own water reservoir and freezes it itself with a thermoelectric plate, slowly,
while it sits plugged in. That ice is the cold bank. A bottle goes on the rollers, the
lid closes, the pump sprays the ice-water over it while it spins — spinning is what
stops the water freezing and chills it evenly — and an IR sensor ends the cycle at
target (default 4°C, adjustable 2–8°C). The plate then rebuilds the bank in the
background. Slow charge, fast discharge, the same way a battery works.

**There is no cartridge and there is no freezer trip.** Alex's call, and it is the right
one: the swap-a-frozen-block step was the friction that kills a kitchen gadget. Nothing
on the store, in an ad, or in a render may show a cartridge, a cold pack, or a freezer.

**What it costs, and none of it gets hidden.** A thermoelectric plate pulls 50–60 W
continuously and takes hours to freeze a reservoir, so the machine lives plugged in —
"charges anywhere" is dead as a claim. A battery can run the motor and the pump for a
cycle; it cannot make ice. And back-to-back bottles will outrun the bank: the honest
line is "so many in a row, then it catches up", and only a sample says how many.

## What is true, and what is not

**Nothing goes on the store as a spec until the sample proves it.** Unknown numbers stay
as visible "spec pending" placeholders. No invented specs. No fake reviews. This is the
platform-wide rule and it is not relaxed for this product.

**The 30-second claim is not supported yet and probably will not be.** The closest proven
machine, the Cooper Cooler, does a plastic bottle 77°F → 42°F in **3.5 minutes** by
spinning it and spraying it out of a full ice-water bath. cryo has to beat that with a
small frozen cartridge instead of a bath.

The arithmetic: 0.5 L from 22°C to 4°C is ~38 kJ. In 35 s that is **~1,080 W** through a
PET bottle wall; Cooper Cooler manages about 180 W. Colder brine (−15°C vs 0°C) roughly
doubles the driving force, not sextuples it. Realistic expectation pending the sample:
**0.5 L in about 90–150 s.**

So the first question to every factory is the only one that matters: *what is your
measured time for a 500 ml PET bottle, room temperature to 4°C, and what does it take?*

Hooks that survive the sample: "Ice-cold water. No fridge. No ice. 🧊" / "Room
temperature to ice-cold, on your counter." A time claim only goes up once a sample
proves it.

## The name

`cryo`, lowercase, and Alex has decided it stays. Two things to know rather than argue:

- Every clean `.com` is taken (cryo.com, trycryo, getcryo, usecryo, mycryo, hellocryo,
  drinkcryo, cryochill, cryobottle, cryochiller). **cryo.co is available.**
- "Cryo" is Greek for cold, so as a mark for a cooling device it is descriptive and hard
  to own. Live CRYO marks exist (Cryo Innovations, Cryo Corp, Cryo One, Cryomech) but
  none in countertop drink appliances, so using it is not walking into someone else's
  mark. It just will not stop a copycat.

## Brand

Brushed silver, ice-blue accents, black lowercase blobby wordmark. Clean, premium,
obvious. Ad copy: short, punchy, emojis, straight to the point, fast shipping and a
dollar discount — never a percentage (platform rule). Never beige, anywhere.

## Store

Built on Kerberos like every other store: the fixed fifteen sections, square 1:1 product
images, the master buy-box recipe (one or two white studio shots, everything else real
life), a `clean_shots` grid further down. See the `kerberos` and `listing-images` skills
rather than re-deriving any of it.

**Store images must use an unbranded bottle.** The Poland Spring bottle in the reference
render is concept only and must never reach the store or an ad.

## Sourcing

The product does not exist off the shelf, so this is an OEM/ODM build, not a catalogue
pick. Candidate factories found so far on Alibaba (rapid beverage chiller / spinning can
cooler / small aluminium appliance): Ningbo Culi Electronics, Zhejiang Dongrun
Industrial, Huzhou Jieyizhou Refrigeration Technology, Linkool (Zhongshan) Electrical,
Da Pan Electric Appliance, Ningbo Oumeite Electrical, Qingdao Zhuodong.

For each one we need: what they already make, custom design + tooling yes/no, unit price
at several quantities, MOQ, sample cost and lead time, tooling/mold cost, and
certifications (CE, FCC, UL, RoHS, and UN38.3 for shipping the battery).

**Approval rule, his:** ask before paying anything, placing any order, signing anything,
or sharing design files. Everything else, handle it and report back.
