# Ceiling Buddy — Hardware Feasibility

## VERDICT: **GO-IF**

GO-IF you build a **wired-dock ceiling projector with a physical one-button scroll remote**, and drop two things from the pitch:
1. **Wireless AirPlay mirroring** — cannot be licensed. Use USB-C/Lightning → HDMI. Non-negotiable.
2. **Unattended timed auto-scroll** — not reliably possible on iOS. Ship a thumb/pillow clicker instead. That is the closest honest thing.

**NO-GO** if the founder insists on "hands-free, phone untouched, wireless." That product cannot be built legally or reliably in 2026.

---

## 1. Projection geometry

Throw distance 1.8–2.0 m. For 16:9, width = diagonal × 0.872.
- 100 cm diag → 87.2 cm wide → TR at 1.9 m = **2.18**
- 130 cm diag → 113 cm wide → TR = **1.68**

You need **throw ratio ≈ 1.7–2.2 — a LONG throw for a pico.** That's the easy direction. Nebula Capsule 3 Laser is [1.2:1](https://www.projectorcentral.com/anker-nebula_capsule_3.htm) and would throw ~180 cm at 1.9 m — too big, spilling onto walls.

**Brightness.** 130 cm diag ≈ 0.64 m². At 100 ANSI → ~156 lux → **~40–45 nits** on 0.85-gain ceiling paint: dim-but-watchable in pitch dark. Published dark-room guidance: [100–200 ANSI is sufficient](https://www.wemax.com/blogs/tutorials/projector-lumens-guide-what-is-good-ansi-lumens-for-your-projector). **Target 150–300 ANSI.** Below 100, TikTok's dark UI goes muddy; above ~300, aimed at your face in the dark, it hurts — an ergonomic ceiling, not just a cost one.

| Module | Res | Lumens | Notes | ~@1k |
|---|---|---|---|---|
| TI [DLP2000 EVM](https://www.ti.com/tool/DLPDLCR2000EVM) | 640×360 | 30 | DMD $19.99, EVM $99. Too dim. **Reject** | — |
| TI [DLP230NP EVM](https://www.ti.com/tool/DLPDLCR230NPEVM) | 1080p | 100 | 0.23" DMD + DLPC3436; you build the optics | $85–110 |
| Generic CN DLP LED engine (DLP3010/230NP class) | 720p–1080p | 150–300 | [$70–385 retail; bulk direct $98–170](https://electronics.alibaba.com/buyingguides/dlp-projector-module-guide-what-you-actually-need) | **$95–140** |

**Pick: 200–250 ANSI 1080p DLP LED engine from a Shenzhen ODM, ~$120 @1k / $95 @10k.** Custom TR-1.8 lens tooling ≈ $8–15k NRE.

## 2. Keystone / aim

Near-vertical aim loads the joint with gravity.
- **Manual geared/ratchet tilt-pan head: $4–7 @1k.** Correct answer; needs detent torque to hold a ~350 g head for years. Not a plastic ball joint.
- Motorised gimbal (2× N20 + driver): +$9–14, plus noise and a remote UI. Skip for v1.
- **Auto-keystone:** IMU (ICM-42688/LSM6DSO) is only **$1.20–2.50**; the cost is firmware — 3–6 months or licensed from the ODM. Note keystone is digital cropping: 15° costs ~10–15% of pixels *and* lumens.
- Prior art: [Nebula Capsule 3 Laser](https://www.projectorcentral.com/Anker-Nebula-Capsule-3-Laser-Review.htm) (auto-keystone + autofocus), XGIMI Halo+, Samsung Freestyle — the Freestyle is literally the "point at ceiling" product and your real competitor.

## 3. Screen mirroring — the licensing wall

**Bluetooth cannot carry video. Confirmed.** A2DP is audio-only ~300 kbps; BLE is 1–2 Mbps PHY with far lower real throughput. 1080p30 needs 6–10 Mbps. No BT video profile exists.

1. **AirPlay (wireless).** Apple licenses AirPlay via MFi, but the practical track is **audio**; **mirroring-receiver licensing is not granted to small hardware startups** — it's reserved for Apple TV and licensed TV-OS partners ([Apple dev forums](https://forums.developer.apple.com/thread/92486)). Every $40 "AirPlay dongle" uses a reverse-engineered stack: unlicensed, breaks on iOS point releases, gets delisted. Don't build a business on it.
2. **Miracast: iPhone does not support it.** Dead end.
3. **Wired USB-C → HDMI (iPhone 15+) or Lightning Digital AV.** Works today, <20 ms latency, no licensing beyond Apple's adapter or an MFi Lightning chip (~$2–4/unit + fees). **This is the answer**, and the cable charges the phone through a 2-hour session.
4. Competitors run **Google TV / Tizen** and get AirPlay only because the platform licensor holds the license. TikTok is phone-first — no reliable TV-app path. Reverse-engineered AirPlay runs 150–400 ms and drops when someone microwaves popcorn.

## 4. AUTO-SCROLL — the honest verdict

**How the rings actually work:** BLE HID devices. iOS users must enable **Settings → Accessibility → Touch → AssistiveTouch** *before* pairing; the ring then injects synthetic swipes. Vendor instructions confirm this verbatim ([Amazon](https://www.amazon.com/TikTok-Scrolling-Ring-Bluetooth-Controller/dp/B0DQ43LTQ4), [Target](https://www.target.com/p/-/A-1004932274), [Billboard](https://www.billboard.com/culture/product-recommendations/mini-remote-ring-tiktok-buy-online-1235766260/)). Up/down = next/previous, middle = like. **It does work inside TikTok**, iOS 14.8+. So button-press scrolling is proven and cheap: a BLE HID MCU (nRF52810 / TLSR8258) is **$0.80–1.60 @1k**.

**Can it be automatic — timed, unattended?** Technically trivial. But it breaks:
- TikTok clips run 7 s to 10 min. A fixed timer either **cuts videos off mid-punchline** or leaves you staring at a finished loop. You get no signal back from the phone that a video ended — no API, no screen access. It is **open-loop by construction**.
- AssistiveTouch is a persistent global mode. Wake-from-sleep, an incoming call, an ad or interstitial desynchronises everything and blind swipes land on whatever is on screen — occasionally a purchase or a DM.
- Apple keeps tightening accessibility-driven automation. A product whose *core function* is unattended synthetic input into a third-party app is one iOS release from broken — and not a case Apple will protect.
- TikTok treats rhythmic, human-free interaction as bot behaviour. Account risk is small but non-zero.

**Verdict: NO on unattended auto-scroll as a headline feature.** Do not put it on the box.

**The closest real thing — and a better product:** a **soft silicone clicker in the bed** (held or clipped to the duvet), one press = next video. Zero phone contact, works today, no timing problem, no bot risk. Optionally bury a "hold to auto-advance every 15 s" assist toggle in settings — never as the promise.

## 5. Power, thermals, noise

- 200–250 ANSI engine draws **12–18 W**; whole device **20–26 W**. 3 h = 60–78 Wh = **~5,500–7,000 mAh @ 11.1 V**, $18–26 and 300–400 g. Capsule 3 manages [2.5 h](https://www.soundcore.com/products/d2426-capsule-3-laser) on a similar budget.
- **Go mains-powered (45 W USB-C PD).** It lives on a bedside table; a battery adds cost, weight, UN38.3 testing and air-freight restrictions for nothing.
- **Noise is your #1 killer after auto-scroll.** Capsule 3 Laser measures **38.6 dBA at 36 inches** ([ProjectorCentral](https://www.projectorcentral.com/Anker-Nebula-Capsule-3-Laser-Review.htm)) — ~47 dBA at 40 cm from a head, against a ~30 dBA bedroom floor. Unacceptable.
- **Fanless works only below ~10–12 W engine dissipation** (~100–120 ANSI), aluminium chassis as heatsink, surface ≤48 °C. Fanless ⇒ dim; bright ⇒ audible.
- **Compromise: 150–180 ANSI, extruded-alu body, one 40 mm PWM fan targeting ≤25 dBA at 1 m, plus a Night mode at ~100 ANSI with the fan stopped.** $6–9 thermal budget. **Prototype and measure this first — if you can't hit 25 dBA, kill the project.**

## 6. Bill of materials

| Line | @1,000 | @10,000 |
|---|---|---|
| DLP LED engine, 1080p ~200 ANSI, TR-1.8 lens | $120.00 | $95.00 |
| SoC board (Amlogic/Rockchip, HDMI-in, 2/16 GB) | $26.00 | $19.00 |
| HDMI-in + USB-C PD board, connectors | $7.50 | $5.20 |
| BLE HID MCU + remote puck | $8.00 | $5.40 |
| IMU + auto-keystone sensor | $2.40 | $1.60 |
| Geared tilt/pan head | $6.50 | $4.30 |
| Heatsink, 40 mm fan, ducting | $8.50 | $6.00 |
| 2× 3 W speaker + amp | $4.20 | $2.90 |
| Chassis, alu + ABS, snack tray + cup recess | $16.00 | $10.50 |
| 45 W PD brick + cable | $9.00 | $6.40 |
| PCBA, test, packaging | $14.00 | $9.00 |
| **Factory cost** | **$222.10** | **$165.30** |
| Freight + duty (~9%) | $20.00 | $14.00 |
| Certification amortised | $22.00 | $2.20 |
| Warranty/returns reserve (6%) | $13.30 | $9.90 |
| **Landed** | **~$277** | **~$191** |

**Retail: $449** (1.6× landed @1k, 2.35× @10k). Near Samsung Freestyle (~$500) and Capsule 3 (~$500–580) — you're not cheap, you're specific. A $299 hero price only works at 10k+.

NRE outside BOM: lens tooling $8–15k, chassis tooling $25–40k, firmware/keystone $60–120k, certification $18–30k. **~$150–220k to first production unit.**

## 7. The honest risk list

1. **Unattended auto-scroll doesn't work (near-certain).** If the deck says "it scrolls itself," that claim dies with the first reviewer.
2. **iOS breaks the remote (medium-high).** AssistiveTouch is Apple's to change, and many buyers will fail the setup step — **budget 8–12% returns in year one**.
3. **No wireless mirroring (certain).** You ship a cable; rivals with Google TV look wireless. Counter-position: "your TikTok, your account, your algorithm" — which a smart-TV projector genuinely can't do.
4. **Too dim (medium).** Ceiling paint is a bad, textured screen. Test on a real popcorn ceiling before tooling.
5. **Fan noise beside a head (high).** Measure at 40 cm, not 1 m, not in a lab.
6. **Certification.** FCC 15B + 15C (a pre-certified BLE module cuts ~$8–14k), CE/RED, UKCA, RoHS/REACH; with a battery, **UN38.3 + IATA/DOT lithium rules** that make air freight and FBA painful — mains-only deletes this. Plus **IEC 62471** photobiological safety for an LED aimed at people lying under it: a real filing, and a lawsuit vector if skipped.
7. **Liquid + mains + bed (underrated).** Make the cup recess a separate, removable, drainable tray, or expect a liability conversation.
8. **Category risk.** Samsung Freestyle already sells this fantasy. Your defensible ground is the bed-specific form, the tray and the clicker — not the optics.
# Ceiling Buddy — sourcing verdict

**RECOMMENDED: Route A — rebrand an existing 180°-rotating mini projector (HY300-class ODM), bundle a stock bamboo/plastic bed tray and a stock BLE scroll ring.** Landed cost ~$52–68/unit, ~$0 tooling, MOQ 100–500, 30–45 days to your door. It is 14 Sept 2026 — Q4 2026 starts in two weeks. **Route A is the only route that can launch in Q4 2026 at all.** B lands Q1–Q2 2027, C lands H2 2027.

Do not invent this. The exact device already exists and is already a TikTok hit; your value-add is the bundle, the positioning and the tray — not the optics.

## 1. What already exists

Price bands: **$35–90 budget Chinese rotating-head** | **$200–450 mid (real brightness/battery)** | **$500–850 premium**.

- **Magcubic HY300 / HY300 Pro** — $35–56. 720p native (accepts 4K input), ~200 ANSI, Android 11/14, WiFi6, BT5.0, **cylinder body rotates 180° on its stand → projects straight onto the ceiling**. This is effectively Ceiling Buddy already. ~1,170 reviews aggregated, **4.2★**; reviewers explicitly cite ceiling projection and lying in bed as the reason for 5★. Complaints (inferred from the review pattern and category norms, not read verbatim): dim in any ambient light, 720p, no battery (mains only), fan noise, clunky Android/casting. [androidpimp.com](https://www.androidpimp.com/projectors/hy300-android-projector/) · [bestcustomerreviews.net](https://bestcustomerreviews.net/magcubic-hy300pro-mini-projector/) · [slickdeals $35.60 HY300 Pro+](https://slickdeals.net/f/19277958-magcubic-hy300-pro-mini-projector-with-8000-lumens-android-14-smart-system-35-60-free-shipping)
- **Samsung The Freestyle 2nd Gen** — $799 ($599 street). Cradle **rotates 180°, tilts 90°**, ceiling explicitly a supported use. Complaints: very dim (7.3 nits dynamic on a 100" screen), price, gaming needs a subscription, heat, no HDMI adapter included. [TechRadar](https://www.techradar.com/televisions/home-theater/projectors/samsung-the-freestyle-second-gen-review) · [Home Cinema Choice](https://www.homecinemachoice.com/content/samsung-freestyle-2nd-gen-projector-review)
- **Anker Nebula Capsule 3 (Laser)** — $499 list, $399 on deal, refurb $230. 1080p, 200 ANSI, Google TV, 2.5h battery, auto-keystone. **4.3★**, hundreds of Amazon reviews. Ceiling works but there is no gimbal — you prop it. [Laptop Mag](https://www.laptopmag.com/laptops/projectors/anker-nebula-capsule-3-review-an-ultraportable-cinema-experience)
- **XGIMI Halo+** — $849 (new Google TV version), 700 ISO lumens, 2.5h battery. No rotating head. [Amazon](https://www.amazon.com/XGIMI-Portable-Projector-Licensed-Speakers/dp/B0D8KQ5HP9)
- **Yaber T2** — $233, 450 ANSI, 2.5h battery — the "does it properly, still cheap" middle. [projectorreviews](https://www.projectorreviews.com/xgimi/xgimi-halo-portable-smart-led-projector-review/)
- **TCL Projector C1** — 1080p, Google TV, **285° gimbal handle, wall-to-ceiling with no tripod**; actively pushed by TikTok creators. Direct competitor to the concept. [TikTok](https://www.tiktok.com/discover/mini-projector-for-bedroom-ceiling)

**Nobody is bundling a snack tray or a scroll remote.** That gap is the whole product.

## 2. The ODM base

- **HY300 Pro / HY320 "low MOQ OEM/ODM"** — [alibaba.com/product-detail/Support-4K-HY300-Pro-HY320-Mini_1601236023830.html](https://www.alibaba.com/product-detail/Support-4K-HY300-Pro-HY320-Mini_1601236023830.html)
- **Dazzler — Factory OEM/ODM HY300 4K LED** — [listing](https://www.alibaba.com/product-detail/Dazzler-Factory-Oem-Odm-Hy300-Projector_1601305379642.html)
- **Factory OEM/ODM HY300 720 LCD LED 1080P** — [listing](https://www.alibaba.com/product-detail/Factory-OEM-ODM-HY300-Projector-720_1601406485016.html)
- **OMIKAI HY300 PRO, 1280×720, 180° rotation** — [listing](https://www.alibaba.com/product-introduction/HY300-PRO-Mini-Portable-Pocket-Smart_1601137578903.html)
- **Magicsee** (170 ANSI, WiFi6, **MOQ 20 pcs**) and **Hxstar** offer full OEM/ODM: housing colour, logo engraving, custom packaging. Aggregated by [electronics.alibaba.com/product/proyector-180](https://electronics.alibaba.com/product/proyector-180)

**Pricing read off these pages:** sample/1pc from **$20.99**; typical **$30–60** at small MOQ; **$78–80/unit at MOQ 100** for better-spec units (that higher band buys brightness/1080p, not just margin). MOQ ranges 1–100 depending on supplier; 20 pcs is genuinely available. Re-housable bare projector modules exist in the same factories but were not separately listed in my searches — assume they quote on request (inferred).

## 3. Snack tray / dock

Yes — source independently and bundle. Two paths:

- **Stock bamboo bed tray, laser-etched with your logo.** Suppliers: **Dongguan Yunyu** (best customisation/material range, OEM), **Xiangtan Hundred** (fastest delivery/reorders), **Caoxian Shangyuan** (cheapest, moderate MOQ), **Qingyuan Yipin** (standardised, MOQ 200). MOQs seen from 20 to 200 pcs; OEM logo and custom packaging offered. [alibaba.com/showroom/bamboo-bed-tray.html](https://www.alibaba.com/showroom/bamboo-bed-tray.html) · [supplier page](https://www.alibaba.com/supplier/bed-tray.html). Unit cost not published on the showroom pages — budget **$6–14 FOB** for a bamboo tray of this size (inferred from category pricing).
- **Custom injection-moulded tray with a projector cradle + cup well.** Tooling **$1,000–3,000 single-cavity**, **$5,000–15,000+ multi-cavity**; an 8-cavity version of a $3,000 tool runs $15–20k. Piece price for moulded trays **$0.10–3.00** (small) to **$1.15–2.99 at MOQ 50**; a tray your size realistically **$2–5**. Breakeven vs. Western suppliers at 200–500 units; no hard factory MOQ. Tooling lead time 4–6 weeks (inferred, standard). [haizol tooling data](https://www.haizol.com/blog/injection-molding-tooling-cost-china) · [rayleap 2026 guide](https://rayleap.com/how-much-does-a-plastic-injection-mold-cost-complete-2025-pricing-guide/)

For a small first order: **buy stock bamboo, etch the logo.** Do not cut a tool for v1.

## 4. The remote

Stock BLE "TikTok scroll ring" page-turners are everywhere and are white-labelled routinely.

- MOQ 50, sample **$15**, **$9.80/pc at 50–199**, **$9.06/pc at 1000+** — [listing](https://www.alibaba.com/product-detail/Tiktok-Remote-Control-Scroll-Ring-Kindle_1601161240438.html)
- Broad market range **$4.50–9.50/pc**, BT5.0, IP67, 10 m range, 25 mAh, already carrying **CE / FCC / RoHS** — [listing](https://www.alibaba.com/product-detail/2023-New-Trending-Bluetooth-Tiktok-Remote_1600833736386.html) · [category](https://electronics.alibaba.com/product/bluetooth-cell-phone-remote)
- MOQs across sellers run 1–5,000; custom logo/packaging is standard for this category (inferred, but universal in BLE accessories).

Budget **$5–7/unit** at your volume. They act as an HID keyboard, so they scroll TikTok on the phone that's mirroring — no firmware work needed.

## 5. Three routes

| | A. Rebrand + bundle | B. Light custom shell | C. Full custom |
|---|---|---|---|
| Projector unit cost | $35–80 (HY300-class, logo + box) | $45–95 (same internals, new housing) | $90–160 |
| Tray | $6–14 stock bamboo etched | $2–5 moulded | $2–5 moulded |
| Remote | $5–7 stock | $5–7 stock | $8–12 custom |
| **Landed/unit** | **~$52–68** | **~$60–110** | **~$110–190** |
| Tooling | $0 (etch/print plates ~$100–300) | $8–20k (shell + tray tools) | $40–120k+ (tools, ID, EE, firmware) |
| MOQ | 20–100 units | 500–1,000 | 2,000–5,000 |
| Lead time | 30–45 days | 4–6 months | 9–14 months |
| **Q4 2026?** | **Yes** | No — Q1/Q2 2027 | No — H2 2027 |

Retail at $129–149 for the full kit (projector + tray + ring) is defensible against a $49 bare HY300 because nobody else sells the kit.

## 6. Red flags

1. **AirPlay is the big one.** Native AirPlay requires an Apple MFi/AirPlay licence, per-unit royalties and Apple approval. The HY300-class units ship Android with third-party mirroring apps (AirScreen/Miracast-type) that are not licensed. Never print "AirPlay" or the Apple logo on your box or listing — say "wireless screen mirroring, iOS & Android". Apple enforces this and Amazon pulls listings for it. (Licensing mechanics inferred from MFi programme structure; not read from Apple docs in this pass.)
2. **Certifications for the US:** FCC Part 15 (WiFi/BT radio — the ODM will hand you an existing report; verify it names *your* model), plus a US importer of record, FTC/country-of-origin marking, Prop 65 if you ship to CA. EU adds CE (EMC, LVD, RED) and EN 62133 battery safety, plus an EU Responsible Person under GPSR. A real projector export pack includes FCC RF exposure, CE EMC/RF/LVD, EN 62133, WEEE and UN38.3 reports. [example cert list](https://akiascreens.com/products/mosicgo-3-in-1-portable-ultra-short-throw-projector-58-outdoor-screen)
3. **Lithium battery shipping:** UN38.3 mandatory for air/sea; testing needs ~16 packs, **$4,000–7,000, 4–6 weeks** if you have to run it yourself. **Avoid this entirely for v1 by choosing a mains-powered unit** (the base HY300 has no battery) — battery-free ships as ordinary cargo and is much cheaper. The scroll ring's 25 mAh cell is trivially below thresholds. [UN38.3 cost/timeline](https://reachinno.com/power-bank-certifications-2025-guide/)
4. **Patents/design:** Samsung, XGIMI and Anker hold design and mechanism patents on gimbal/rotating projector cradles. Rebranding an existing ODM product means the ODM carries that exposure, not you — a custom shell (Route B/C) is where you'd risk copying Samsung's cylinder-in-cradle silhouette. Get an IP indemnity clause in the ODM contract and do a design-patent knockout search before cutting any tool. (Specific patent numbers not searched.)
5. **Commercial:** the HY300 is sold by hundreds of resellers at $35–49. Your $129 kit must be sold on the *bundle and the story*, not the hardware — if a customer finds the bare unit, the margin narrative collapses. Differentiated tray + branded remote + your content are the moat.

**Next action:** RFQ Magicsee and Dazzler for 100 units of a mains-powered 180°-rotating HY300-class unit with custom logo and box, ask for their FCC/CE reports by model number and an IP indemnity, and in parallel RFQ Dongguan Yunyu for 100 laser-etched bamboo trays and the MOQ-50 scroll ring. Samples in ~10 days puts you in market before December.
# Ceiling Buddy — Industrial Design

## 0. The one thing I'm overruling

**The snacks and the projector must not be the same object.** A projector that is also a plate gets moved every time someone wants a crisp, and every move loses the aim. Worse: the beam exits the *top*, which is exactly where a plate would go. You cannot put a burrito bowl in front of a lens. Both rejected concepts failed here — one object, two jobs with opposite requirements.

So: **two objects, one family, sold as a set.**
- **CB Head** — the projector. Nightstand. Never moves once aimed.
- **CB Tray** — aluminium snack tray on the duvet between them; also charges the phone and remote.

Shared material language (6063 aluminium, bead-blast, anodised Silver/Midnight) so they read as one product. Mac mini + Magic Trackpad, not a Swiss Army knife.

## 1. Where it lives — nightstand, and I'll defend it

Duvet is disqualified: it deforms constantly, so the device tilts 5–15° whenever either person shifts, and throw distance amplifies that — 5° at 2.4 m is ~200 mm of image drift. You'd re-aim every four minutes. Add a hot LED engine against goose down, and drinks over vents: non-starter.

Floor: optically fine, but it lives where feet, cables and the dog are, and nobody reaches down to adjust it. Bed-frame clamp: solves stability, fits maybe 40% of beds (divans, upholstered frames, no lip) — a returns machine.

**Nightstand.** Rigid, arm's reach, already has power, and it's where a Mac-mini-looking object belongs. Beside-the-bed is an off-axis throw, solved with 15° digital keystone plus mechanical tilt. Head sits ~600 mm above the mattress; the image lands over the foot of the bed — where you naturally look lying back, rather than directly overhead where you'd tuck your chin.

## 2. The form

### CB Head
- **Body:** 118 × 118 × 42 mm. 6063-T6 extrusion, CNC-faced, 3 mm plan radii, 1.5 mm top/bottom chamfer. Bead-blast, Type II anodise, Silver or Midnight. 640 g — deliberately dense so it doesn't walk when you nudge the head.
- **Base:** one full-footprint moulded silicone foot, 1.5 mm proud, matte black. Not four dots — full-footprint won't rock on a book or coaster.
- **Parting lines:** two. A 0.3 mm reveal 8 mm up from the base (shell to baseplate), and the 0.5 mm circular reveal around the drum. No visible fasteners; baseplate screws from inside.
- **The head:** a **half-sunk tilting drum**, Ø 76 mm, sunk 20 mm so only ~22 mm crests the body. Flat-milled face carries the lens (Ø 21 mm, AR-coated, recessed 2 mm) and IR receiver. Single axis on a friction-damped steel trunnion: **0° (straight up) to 70° back**. Yaw comes from rotating the whole body on its foot — deliberate, because yaw is a setup-once adjustment and tilt is the one you touch nightly.
- **Damping:** 0.35 N·m constant-torque hinge — cannot creep under its own weight, moves with one thumb. Soft detents at 0° and 45° only.

**Aiming in the dark:** the drum crest carries a 0.4 mm axial micro-knurl over ~30° of arc — the only texture on an otherwise glass-smooth object, so you find it instantly. The band's position under your thumb tells you roughly where you're aimed. Push forward = image moves toward the foot of the bed; the drum face travels with your push.

### CB Tray
- 320 × 240 mm, 34 mm tall. Deep-drawn then CNC'd 1.5 mm aluminium pan, 12 mm rolled rim, silicone underlay over the full footprint — this spreads load on a duvet and resists tipping far better than a rigid tray.
- **Floor is flat**, not welled. Wells fit nothing real. Instead a 200 × 200 mm **recessed 1.2 mm silicone grip mat**, matte black, textured: Chipotle bowl, dinner plate, crisp packet, mug all sit on it and none slide. It makes no assumption about the food, which is why it works.
- One assumption worth making: a **Ø 78 × 6 mm relief** at the back-left corner for a mug or can — one well, for the one thing that actually tips.
- Right rear: a **16 mm slot at 65°** for the remote, and a **Qi2 magnetic phone pad** on a 12 mm raised shelf. The phone lies screen-up and charges while mirroring. No dock — magnets are enough and a dock fights cases.

## 3. Controls

Three, and no more:
1. A machined **rotary crown**, Ø 16 mm, half-sunk in the right face: push = play/pause, hold = power, rotate = volume. The only protrusion on any side, so touch finds it.
2. Drum tilt = aim.
3. **Remote**, 96 × 32 × 9 mm, same aluminium, four controls in a column with distinct tops you read blind: dished (back), flat (play/pause), domed (next), knurled ring (volume). Lives and charges in the tray slot. IR + BLE.

No app-only functions, no capacitive surfaces — you cannot use a touch control in the dark, half asleep.

## 4. The phone
On the tray, magnetically held, screen up, charging at 15 W. Mirroring is AirPlay over Wi-Fi Direct so no cable crosses the bed — a cable across a bed would kill the product.

## 5. Stability and safety
- 640 g on a rigid surface, full silicone foot, CoG 14 mm above base — an elbow cannot tip it.
- Exhaust through a **rear grille only**: no top or side vents by the drum, none pointing down into bedding. Exhaust ≤ 45 °C. Top face IP42, so a splashed drink does not enter.
- No electronics under the tray's food zone. Qi coil and remote slot sit on a raised shelf behind a 6 mm dam; a spill runs to the front rim instead. The 12 mm rim holds ~400 ml.
- Roll-over: only the tray is on the bed — 34 mm tall, rolled edges, no radius under 12 mm. Worst case it slides.
- Accelerometer cuts the lamp on a sudden >20° tilt change (it fell), and after 20 min of phone inactivity.

## 6. Orthographic

```
CB HEAD — TOP                      CB HEAD — FRONT
 |<--------118-------->|            |<--------118-------->|
 +---------------------+  ---       +---------------------+  ---
 |    .-----------.    |   ^        |        ,-""-,       |   ^ 22 (drum crest)
 |   /   drum Ø76  \   |   |        |   ____/      \____  |   v
 |  |   ( ( o ) )   |  |  118       |  |                | |   ^ 42 body
 |   \  lens Ø21   /   |   |        |  |                | |   |
 |    `-----------`    |   v        +--+----------------+-+  ---
 +---------------------+  ---          `--- silicone 1.5 ---`
   tilt axis  <------->
                                   CB HEAD — SIDE (drum at 45°)
                                    |<------118------>|
                                    +-----------------+
                                    |      /"-.       |  crown
                                    |     /    \     (o)  Ø16
                                    |    |  ()  |     |
                                    +-----------------+   rear grille ]||||
                                     reveal 0.3 @ 8mm up

CB TRAY — TOP                                  CB TRAY — SIDE
 |<---------------320--------------->|          |<------320------>|
 +-----------------------------------+ ---      +-----------------+ ^34
 | (Ø78 mug relief)    [phone pad  ] |  ^       |_________________| v
 |                     [  raised 12] |  |        rim 12, silicone base
 |    +-------------------+  [rem]   | 240
 |    | silicone grip mat |  [slot]  |  |
 |    |     200 x 200     |          |  |
 |    +-------------------+          |  v
 +-----------------------------------+ ---
```

## 7. Unboxing to first use
Flat white box, two layers. Lid off: the Head alone, drum flush at 0° so it reads as a solid aluminium block, no hinge visible. Beneath it the Tray, remote already in its slot, and a 1.5 m braided USB-C.

1. Head on the nightstand, plug in. The lens ring glows amber once and goes out.
2. Tray on the duvet. Phone onto the pad — it clicks and charges.
3. Play on the remote: a white alignment rectangle appears overhead.
4. Thumb the knurled drum until the rectangle sits where you're looking; rotate the body to centre it. Eight seconds, done lying down.
5. Phone shows "Ceiling Buddy — Mirror". Tap. TikTok is on the ceiling.
6. Afterwards: press play. It remembers. You never touch the drum again unless you change beds.

## 8. Render prompt

> Studio product photograph of a two-piece consumer electronics set on a walnut nightstand, 100 mm macro at f/8, soft large-source key from upper left with one crisp specular edge highlight. The main object is a 118 × 118 × 42 mm squircle-cornered block of bead-blasted silver anodised 6063 aluminium, Mac-mini-like, on a full-footprint matte black silicone base, with a single 0.3 mm parting reveal 8 mm above the base. Set into its top face is a 76 mm aluminium drum, half-sunk, tilted back 45° on a visible steel trunnion, its flat milled face carrying a recessed 21 mm AR-coated glass lens with faint violet coating bloom and a small black IR window; a band of fine axial knurling crosses the drum's exposed crest. A 16 mm half-sunk machined rotary crown sits in the right side face; a fine milled exhaust grille on the rear. Behind it a 320 × 240 mm shallow aluminium tray in the same finish, 12 mm rolled rim, recessed textured black silicone mat in its floor, a shallow circular mug relief at one corner, and a raised shelf holding a slim 96 mm aluminium remote in an angled slot. Realistic CNC witness marks at the chamfers, uniform anodise grain, no logos, no glowing screens, no lens flare. Neutral dark grey seamless background, shallow contact shadows, 8k commercial catalogue realism, physically plausible tolerances.
# Ceiling Buddy — Brand & Market Assessment

**VERDICT: The demand is real. The product is not new, and "it does not exist" is false.**
Ceiling projection is a proven, already-saturated hardware category owned by $40–60 Chinese factories (Magcubic HY300 is an Amazon Best Seller doing 10K+ units/month). You cannot win on the device. The only defensible play is a **branded bundle + creative machine at $89–129** — a media business selling a commodity, not a hardware business. Treat it as a 6-figure seasonal cash product, not a million-dollar brand.
**Q4 2026 is already gone for a custom unit. Launch Q4 on a white-label bundle, or ship your own tooling Q1 2027.**

---

## 1. Does the demand exist?

Yes — and that is the problem. It exists *and is already served*.

- **Magcubic HY300 / HY300 Pro**: Amazon **Best Seller in Video Projectors, 10K+ bought in the past month**, ~4.1/5, and the hero feature is literally *"180-degree rotating stand… instant ceiling projection at a $49 price point."* Your core mechanic is the competitor's bullet point. ([Amazon HY300PRO](https://www.amazon.com/Magcubic-HY300PRO-Projector-Bluetooth-Proyector/dp/B0F53F8DB3), [review](https://androidpctv.com/magcubic-hy300-pro-review/), [HY300 trend](https://www.accio.com/business/trending-hy-300-projector-2026))
- **TikTok**: dedicated evergreen discover pages for [mini projector for bedroom ceiling](https://www.tiktok.com/discover/mini-projector-for-bedroom-ceiling), [projector ceiling](https://www.tiktok.com/discover/projector-ceiling), [projector in bedroom above bed](https://www.tiktok.com/discover/projector-in-bedroom-above-bed), and a [TikTok Shop keyword page for the exact phrase](https://shop.tiktok.com/us/k/projector-in-bedroom-on-ceiling). Videos in the hundreds of thousands of views; #TikTokMadeMeBuyIt is the driver.
- **TikTok Shop supply**: rotating minis at **$28.99–42.99**, some SKUs with **250,000+ units sold**. ([TikTok Shop projectors](https://shop.tiktok.com/us/c/projectors/912392))
- **Trend direction**: projector search interest is **rising but Q4-peaked and seasonal** (galaxy/smart projector interest peaking Nov 2025, screens peaking Feb 2026). ([Accio galaxy projector](https://www.accio.com/business/trending-smart-galaxy-projector-2026), [home projector trends](https://www.accio.com/business/trend-in-home-projectors))
- Premium end is marketed on *gimbal/ceiling tilt* too — TCL C1 (285° gimbal), Samsung Freestyle at **$799.99**, XGIMI MoGo 4 at **$479**. ([Samsung](https://www.samsung.com/us/projectors/the-freestyle/the-freestyle-with-gaming-hub-sku-sp-lff3claxxza/), [XGIMI](https://us.xgimi.com/products/mogo-4))

**Growing or saturated?** The *category* is growing; the *$50 rotating-projector product* is saturated and commoditised. Margin is being competed to zero by 200+ identical listings. Who's winning: Magcubic (price + rotation), Samsung/XGIMI (brand + brightness), galaxy-projector brands (vibe, not content). Nobody is winning on **"phone screen on the ceiling in bed, for two people, with a remote."** That gap is your only asset.

## 2. Who buys it, ranked

1. **Gen Z / young-millennial women, 18–28, own bedroom.** The actual buyer of every ceiling-projector video. Bedroom-as-sanctuary spend, impulse price tolerance, lowest objection, highest share rate, buys for the aesthetic before the utility. **Primary.**
2. **Gift buyers, Nov–Dec.** Boyfriend/girlfriend/sibling gift, $80–130 is the perfect gift band. Highest AOV, lowest scrutiny. **This is where the money is.**
3. **Couples (the founder's own segment).** Real but small and hard to target — Meta cannot target "couple who watch TikTok in bed"; you target #1 and let them self-identify as a couple in the creative.
4. **Parents / kids' rooms.** Volume exists, but it drags you into safety, brightness and sleep-hygiene objections. Deprioritise.
5. **Dorm / first-apartment.** Aug–Sep secondary peak. Worth one campaign.

Money + lowest objection = **#2 buying for #1**.

## 3. Objections, answered

- *"I already have a phone in my hand."* True, and this is the strongest objection. The answer is not screen size, it is **neck and arms**. Position against the physical act of holding a phone over your face. Hero the dropped-phone-on-face moment.
- *"I'll just prop my phone."* Propping fails for two people. The wedge is **shared viewing**: one screen, two people, no one holding anything. If the founder's insight is couples, the product must be two-person-native (second remote, two snack wells).
- *"Gadget that ends up in a drawer."* Real risk — mitigate with a permanent home (bedside dock/charger), not a box. A device that lives on the nightstand and charges there is used. One that needs unpacking is not.
- *"The picture is dim."* Legitimate: 200 ANSI at 720p. Never sell brightness. Sell **dark room only** — and make it a feature: "lights-off product." Set expectations in the ad so the return rate doesn't kill you.
- *"$49 on Amazon."* The unavoidable one. Your answer must be the **bundle and the experience**, never the projector spec.

## 4. Positioning

**"Stop holding your phone over your face. Ceiling Buddy puts what you're watching on the ceiling — so you both just lie there."**

- **Hero angle:** the anti-phone-over-face. Relief, not technology.
- **Hooks:**
  1. "POV: you never have to hold your phone above your face again."
  2. "We dropped our phones on our faces one too many times."
  3. "Our ceiling is the TV now. This is what 2am looks like."
- **First 10 seconds:** 0–2s dark bedroom, phone drops onto a face, real flinch, real "ow." 2–4s hand snaps the device onto the nightstand, one tap. 4–7s camera flips to POV-from-the-pillow: full TikTok feed on the ceiling, both hands visibly empty, snacks in the tray. 7–10s thumb taps the remote, feed auto-scrolls, both laugh. No voiceover claims, no spec text, no logo until 9s.

## 5. Price

- Commodity floor $29–60; premium $300–800. Nothing credible sits at **$89–129** — that's your slot.
- **Single unit: $99.** Bundle (device + snack tray + auto-scroll remote + bedside dock/cable): **$129**, anchored at $179. This is the hero SKU — sell the bundle by default, the single unit only as a decoy.
- **Landed cost target $28–34** → ~70% GM at $99. Anything above $36 landed and paid acquisition will not work at these CPMs.
- **Gift season:** hold $129, discount with *value* not price — free second remote ("his and hers"), gift wrap, Dec 18 delivery guarantee. Never go below $89; a $69 sale price tells the customer it's the Amazon unit.

## 6. Name check

- **ceilingbuddy.com is REGISTERED** — created 2026-01-07, GoDaddy nameservers (NS39/NS40.DOMAINCONTROL.COM). If that's not the founder's own registration, the name is effectively blocked. Verify first. `.co` and obvious variants appear unregistered.
- **No "Ceiling Buddy" trademark surfaced** in USPTO results — but "buddy" is heavily diluted across consumer goods, so the mark will be weak and hard to enforce. Search properly at [tmsearch.uspto.gov](https://tmsearch.uspto.gov/) before filing.
- **Does it sound cheap?** Yes — mildly. "Buddy" reads utility/hardware-store (Garden Buddy works because gardening is utilitarian). Aimed at 22-year-old women and gift buyers, "buddy" undercuts a $129 price and fights the cozy/intimate mood the ads need. It is not fatal, and house-brand consistency has real value.
- **If you want alternatives in the family:** *Ceiling Club* (social, shareable, holds a higher price) or *Bed Buddy*→ avoid (adult-product collision). Honest answer: keep **Ceiling Buddy** only if you own the .com; otherwise go **Ceiling Club**.

## 7. Q4 2026 reality check — plainly

**Not realistic for a custom product.** It is mid-September. Custom tooling/injection moulding for the tray-and-dock housing is 6–10 weeks alone, plus samples, plus FCC/CE and battery (UN38.3) certification, plus Chinese New Year risk and Q4 ocean freight. Air freight would eat the margin you just priced in.

Two honest paths:
- **Q4 2026 (this year):** white-label an existing rotating projector + off-the-shelf BT remote + a branded tray and box. Custom packaging only. Order by **end of September**, air a first 300–500 units, sell Nov 10–Dec 18. This is a cash-and-learning exercise, not the brand.
- **Q1 2027:** ship the real product (integrated dock, two-person tray, purpose-built remote), using Q4 data and creative winners to launch it. **This is the correct plan.**

## 8. The first $100K

**What has to be true:** landed cost ≤$34; a bundle AOV ≥$120; ≥1 creative that holds a 25%+ 3-second hold rate; return rate <8% (brightness expectations managed); delivery before Dec 18.

**Maths:** $100K revenue ÷ $120 AOV = **~835 orders**. At a 1.8% site CVR and a $45 blended CPA, that's **~$37K ad spend** (37% of revenue) — leaving roughly $30–35K contribution before ops. Tight but real. Budget: $6K creative testing (15+ UGC variants, 3 creators, one filmed night), then scale winners at $1.2–2K/day through Nov–Dec. TikTok Spark Ads first (native to the trend and cheapest CPMs), Meta Advantage+ second for the gift buyer.

**Conversion assumptions:** you need the ad to do the selling — first 3 seconds carry 80% of it. Expect 9 of 10 creatives to fail; the plan lives or dies on volume of creative, not on media buying skill.

**The one thing most likely to kill it:** a customer opening a $129 box, seeing a device visually identical to the $49 Amazon unit they can find in ten seconds, and the resulting returns, chargebacks and comment-section pile-on ("this is the HY300, it's $40 on Amazon"). Everything — industrial design, packaging, bundle, the tray, the remote — must exist to make that comparison impossible. If you cannot make the unit look different, do not launch it.
# ceiling buddy — mechanical package (cb-cad.md)

**Status:** peer docs absent at writing. Assumptions to confirm — **A1** 0.23" DMD DLP engine (TI DLP230NP class), envelope **90 × 58 × 38 mm**; **A2** 38 W peak, **22 W** dissipated in engine + driver; **A3** throw ratio ~1.2:1, so 0.6 m nightstand to 2.4 m ceiling = 1.8 m throw = **1.5 m image** (sets tilt range); **A4** 20k units yr1. All est.

---

## 1. OVERALL GEOMETRY

**Body: 168 × 168 × 54 mm.** Corner radius R12 in plan, R3 top/bottom edge break.

- **168 sq, not 197.** The mini is 197 to hold a drive bay and a 150 W PSU; we have neither. 168 = drum Ø96 + 2×22 mm structural sidewall + 2×14 mm flanking PCB stack.
- **54 tall, not 35.** The one place we can't follow the reference. Swept envelope of the 38 mm optical block about its pivot is R62; half sits above the pivot → pivot 26 mm up, 28 mm above it, +4 mm base/feet = 54.
- **Wall:** 2.8 mm nominal (also the fin root, so conduction area matters). Bosses 4.5, base plate 2.0.
- **Head aperture:** Ø98 through-cut over the Ø96 drum, **1.0 mm gap all round**. Aluminium over 96 mm moves 0.07 mm across 30 °C, so the gap is set by tolerance, not thermal.

## 2. THE MOVING HEAD

**A tilting drum half-sunk in the body, single axis.** A ball joint can't be sealed at acceptable torque and lets the image go off-level — fatal with portrait video.

- **Pivot axis:** horizontal, on the body centreline, **26.0 mm above the base underside**, 84.0 mm from the front face. Drum Ø96 × 52 mm wide.
- **Travel 0° (horizontal, stow) to 55° (up),** hard stops machined into the drum end-cap, not the hinge. 55° from a 0.6 m nightstand to a 2.4 m ceiling lands the image centre 1.05 m back — over the bed, which is the product.
- **Friction:** two **Jarllytec** free-stop wrapped-leaf hinges, Ø6 mm shaft: **22 N·cm each, 44 N·cm total, ±15%, ≥20,000 cycles to −20%.** Drum+engine 210 g (est.), CoG 19 mm off axis → 3.9 N·cm gravity moment: a **11× hold margin**, i.e. MacBook lid, not toy. **Sinher** SH-series is the drop-in second source at the same torque and shaft.
- **Bearings:** the leaf gives torque, not location — that is two **Ø10 × 4 mm sintered bronze bushes** in the sidewall bosses on the drum's stub shafts. Torque then can't drift as the bush wears.
- **Sealing:** don't seal the 1 mm gap, seal the optics. Gasketed window at the lens plus a **0.3 mm TPU rolling-diaphragm boot** drum-to-chassis inside; cooling air never crosses the head gap (§3).

## 3. THERMAL PATH

22 W in a 168×168×54 box is **1.6 W per 100 cm²** of skin — passive lands near 62 °C, too hot for a duvet. So: **active, but quiet.**

- **Shell is the secondary heatsink**; ~5 W leaves through a fin-block rail machined continuous with the left sidewall. Primary is a **skived-fin block, 70 × 45 × 22 mm, 0.4 mm fins at 1.6 mm pitch (28 fins), ~0.32 m² wetted**, on the LED baseplate through 0.2 mm phase-change TIM.
- **Blower: Sunon MF40101V1, 40 × 40 × 10 mm**, 5 V at **~55% duty, 2.4 CFM → 26 dBA at 1 m** (est.) against a **≤28 dBA** target.
- **Airflow: intake underside only** — 40 × 12 mm slot inboard of the front feet, fed by the 6 mm foot standoff. **Exhaust rear face only** — 60 × 8 mm, 1.2 mm slats, ambient +14 °C. Nothing vents top or sides, and the rear faces the wall by construction, so it never blows at a face.
- Hot-spot skin **41 °C** (est.), under the 48 °C metal touch limit in IEC 62368-1.

## 4. MATERIALS AND FINISH

| Route | Unit cost @20k | Verdict |
|---|---|---|
| CNC 6061 billet | $34 | Right for the first 2,000. No tooling, free changes. |
| **6063-T5 extrusion + CNC ends** | **$11** | **Production answer.** A constant square section is what extrusion is for. One $9k die. |
| ADC12 die-cast | $6.50 | Rejected — porosity blotches under anodise, Class A bead-blast yield ~70%. Not worth $4.50. |

All est. **Finish:** **glass bead 120–180 grit at 0.28 MPa** (finer than the usual 100–150 so a small body doesn't read grainy), then **Type II sulphuric anodise, 10–12 µm, matte black L*≈26**, hot nickel-acetate seal. Drum anodised **same batch, same rack orientation** as the housing or the blacks won't match.

## 5. PART BREAKDOWN

CT = custom-tooled, OTS = off-the-shelf, CM = custom-machined (no tool).

1. Housing body, 6063-T5 extrusion + CNC — **CT (die)**
2. Top ring, 6063 CNC, 0.05 mm press fit — CM
3. Lens bezel, PC black, moulded — **CT**
4. Head drum shell, 6063 CNC — CM
5. Drum end-caps ×2, 6063 CNC, hard stops — CM
6. Hinge, Jarllytec free-stop 22 N·cm ×2 — OTS
7. Bronze bushes Ø10×4 ×2 — OTS
8. TPU dust boot 0.3 mm — **CT**
9. Main PCB 120 × 90, 6-layer — CT
10. Driver/PSU PCB 70 × 45 — CT
11. Light engine (A1) — OTS
12. Skived fin block 70×45×22 — semi-OTS
13. Blower, Sunon MF40101V1 — OTS
14. Speaker ×2, 28 mm 2 W, sealed back-volume — OTS
15. Base plate, 2.0 mm stamped alu — **CT (prog. die)**
16. Feet ×4, 40 Sh-A silicone Ø14 × 6 — **CT**
17. Steel ballast, 180 g, under PCB — CM. **Mass target 700 g:** below 600 g a 44 N·cm hinge tips the body as you aim it.
18. Fasteners, 14 × M2.5×5 torx + 4 × M3×6 — OTS. **Zero visible:** all loaded from below, screw heads capped by the adhesive-backed feet.
19. Remote, ABS, 2 × CR2032 — see cb-design.md

## 6. TOOLING

All est.: 6063 extrusion die + calibration **$9,000**; base-plate progressive die **$18,000**; lens bezel injection tool 1+1 **$12,000**; silicone foot tool 4-cav **$4,500**; TPU boot compression tool **$6,000**; remote housing tool, 2 parts **$22,000**; CNC fixtures/jigs, 6 ops **$14,000**; anodise racks + colour standards **$3,500**; assembly and hinge-torque test fixture **$16,000**. **Total $105,000**, plus ~$40k of engineering-build CNC before any tool is cut.

## 7. DFM RISKS

1. **Anodise mismatch, drum vs body.** 6061 and 6063 take dye differently; 6063 goes browner. *Fix: drum in 6063 too, batch-anodised on one rack against a retained gold standard.*
2. **Hinge torque drift.** A wrapped leaf on an aluminium shaft galls by 20k cycles. *Fix: leaf runs on its own steel shaft, never aluminium. 100% EOL torque test, accept 19–25 N·cm.*
3. **Extrusion twist.** A thin-wall 168 sq section leaves the press at up to 1°/m — a rocking body. *Fix: stretch-straighten to 0.3°/m, then machine both end faces in one setup off the extruded datum.*
4. **Drum gap stack.** Six contributors reach 1.0 ±0.35; the tight end binds. *Fix: line-bore both bush bores in one op after the top ring goes on, so bore and aperture share a datum — stack collapses to ±0.15.*
5. **Blower whine.** A ~900 Hz blade-pass tone is exactly what someone in bed hears. *Fix: 3-phase sinusoidal drive instead of PWM chop, plus a 10 mm inlet plenum. Sign off a tonality (prominence-ratio) limit, not just dBA.*

## 8. THE SNACK SURFACE

A **separate dock** — a snack tray integral to a 41 °C machine is wrong on every axis.

- **Material:** 4 mm bamboo ply on a 2.5 mm powder-coated steel underframe, **240 × 180 mm, 14 mm lip.**
- **Locating:** a **3 mm recess** on the body's 168 sq footprint, R12, 1 mm clearance plus **four N42 Ø10 × 3 mm magnets** pulling on the steel ballast plate. **Total pull 2.4 kg (est., 0.6 kg each through 2 mm bamboo)** — a knocked elbow slides the dock rather than toppling the device; still lifts one-handed.
- **Spill survival: no electronics in the dock. None.** No pogo pins, no coil; the device keeps its own rear USB-C.
- Drainage anyway: floor crowned 1.5 mm outward, **2 mm channel, four Ø4 mm rear drains**. 2-part polyurethane finish, not oil.

## 9. ORTHOGRAPHIC SET

```
TOP  (168.0 sq, R12)            FRONT (168.0 wide x 54.0 tall)
+-------------------------+     +-------------------------+ _
|     .-'''''''''-.       |     |    .-''''''''''-.       | |
|   /  DRUM O96.0   \     |     |   /  DRUM O96.0  \      | 28.0
|  |  aperture O98.0 |    |168  +--+-----------------+---+ _|_
|   \  gap 1.0 typ  /     |     |  |   (o) PIVOT     |   | 26.0
|     '-.._____..-'       |     +==+=================+===+ _4.0
+-------------------------+     feet O14 x4   exhaust 60x8 (rear)

SIDE                            SECTION A-A THROUGH HEAD
+-------------------------+     top ring  __drum wall 2.0
|    .-'''-.  lens -->    | 28  lens@55deg  /    \
+---+---------+-----------+     \  ENGINE |  ||  |
|   |  (o) axis, 84.0 from|     \ 90x58x38+--||--+
|   |  front face         | 26  pivot (o)--+--++--+  26.0 to base
+=========================+ _   TPU boot 0.3mm ~~~~~
 intake 40x12 (underside, front) fin blk 70x45x22 |||||
 wall 2.8 typ.  TOTAL H 54.0     blower 40x40x10 -> rear exhaust
 travel 0-55 deg   hinge 22 N-cm x2 = 44 N-cm
```

