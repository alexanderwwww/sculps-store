# Listing Engine — Plan

Automated production and sales pipeline for **short-form property video**, sold to
US short-term-rental operators, property managers, and real-estate agents.

This plan started from a reel ("How to get a Porsche 911 in 28 days"). Section 1
breaks down what that reel actually proposes and which parts of it don't survive
contact with Airbnb's rules or US advertising law. Sections 2 onward are the
version we're actually building: same offer, same money, without the parts that
get the customer's listing suspended or our accounts banned.

---

## 1. What the reel actually says

Reconstructed from the burned-in captions and on-screen frames (34s, two speakers).

**The pitch, step by step:**

1. "If you wanna [buy] a Porsche 911 in 28 days, here's [what] to do."
2. Go on **Airbnb**, find "a rich guy's listing" — make sure it's a [luxury home
   in a good] area.
3. **Screenshot the listing page** (i.e. take the host's listing photos).
4. Go to **`openart.ai/director`**.
5. Paste "this exact prompt" + the screenshot. It will "vibe you a walkthrough
   video." Make **four to five** long videos.
6. "But how [do you] actually make money?" → Go to the **bottom of the listing
   and message the host**.
7. Sell it for **$500**. Do this for the next 28 days → "got a 911. Welcome."

**The exact prompt shown on screen** (transcribed from frame at 00:13.6):

> Cinematic real estate walkthrough, smooth steady gimbal-style camera gliding
> forward through a [modern/minimalist/luxury] apartment interior. Warm natural
> light streaming through large windows, soft golden hour glow. Camera moves
> slowly from the entryway into the open-plan living room, past a stylish sofa and
> coffee table, gliding toward the kitchen with clean countertops, then drifting
> down a hallway into a cozy bedroom with crisp white linens, finishing in a
> spa-like bathroom with soft ambient lighting. Smooth continuous motion, no cuts,
> shallow depth of field, subtle lens flare, high-end architectural photography
> style, 4K, realistic textures, airy and inviting atmosphere, slight handheld
> float for organic feel.

**On-screen "proof":** `$20,904.10 REVENUE — $13,374.07 confirmed, $7,530.03
estimated`, and a second card at `$10,068.83 +$483.25`.

### What's worth keeping

- **The offer is real.** STR operators and agents do buy short-form vertical
  video. It's a live, growing budget line.
- **Lead with the work, not a pitch.** Showing a finished sample before asking
  for anything is how video work actually gets sold. Keep this.
- **$500 is a sane price point** for a pack of vertical videos in this market.
- **Batch it.** One templated process across many properties is the right shape —
  which is what you asked for ("a box of listings").

### What does not survive scrutiny

**a) The product it tells you to sell is defective.** Generating a "walkthrough"
from one screenshot invents rooms, layouts and geometry that do not exist in the
property. Airbnb's stated position: they will ask hosts to remove content where AI
or other digital technology has been used to "edit flaws, hide damage, add
amenities or attributes that are not part of a listing, or otherwise misrepresent
the listing." In July 2026 a Toronto listing with AI-generated photos was
suspended and the guest fully refunded after Airbnb confirmed the images didn't
match the unit. So the deliverable in the reel is something that can get your
paying customer delisted. That is not a compliance footnote — it means the product
is broken. AI that improves **lighting and colour** is explicitly fine; AI that
**adds furniture, hides flaws, or creates rooms** is not.

**b) Scraping Airbnb breaches its Terms of Service.** Automated collection —
bots, crawlers, scrapers — is prohibited without Airbnb's consent. Exposure is
account termination, IP blocking, and a breach-of-contract claim, independent of
whether any criminal statute is involved. An automated "box of listings" pointed
at Airbnb is built on sand.

**c) Airbnb's Off-Platform Policy names this pitch explicitly.** It prohibits
"including links that take people off of the Airbnb platform in listings or
messages" and "soliciting or facilitating any off-Airbnb transaction". Offering
paid video work is both, and no rewording fixes it — the solicitation *is* the
violation. Two consequences worth separating:

- *Sales:* penalties apply to the **host who engages**, not just the sender. You
  are asking a professional operator to risk their listing to reply to you. The
  good ones — the ones with budget — know this and won't.
- *Survival:* automating it is what actually ends things. A bot on a logged-in
  session is what anti-automation detects, and the ban takes the prospecting
  channel with it.

Sending a few by hand is a judgement call, and §4 supports it as a hand-worked
queue. Automating it is not on the table.

**d) Derivative works from the host's photos.** Listing photos belong to the host
or their photographer. Building a video from them before you have permission is a
copyright exposure — small in day-to-day practice, real the moment you put it in a
portfolio or a paid ad.

**e) The proof isn't proof of this business.** The `$20,904.10 / confirmed /
estimated` card is the **Airbnb host earnings dashboard** — that's the UI for money
earned *hosting*, not money earned selling videos. Whatever it represents, it is
not evidence that selling AI walkthroughs works. And the reel funnels to a paid
tool (OpenArt Director, from $14/mo, credits deplete quickly). Treat
"911 in 28 days" as the hook it is.

**Bottom line:** keep the offer, the sample-first motion and the batch mindset.
Replace the fabricated media and replace Airbnb-as-a-database.

---

## 2. The version we're building

**Product:** truthful motion content built from the property's *real* photos.

| Deliverable | What it is | Fabrication risk |
|---|---|---|
| 2.5D motion shots | Depth-aware push-in / pan / parallax over the host's actual photos. Every pixel derives from the real room. | None |
| Vertical reel edit | 9:16 cut, beat-matched, captions, end card w/ booking link | None |
| Photo grade | Lighting + colour correction only | None — explicitly permitted |
| Virtual staging *(optional)* | Furniture into genuinely empty rooms, **watermarked "Virtually staged"** on every frame | Disclosed, industry-standard |

**Hard-blocked, enforced in code** (`COMPLIANCE.md`, `engine/outreach/compliance.py`):
generating rooms/areas that don't exist, removing real defects, adding amenities
the property lacks, and undisclosed staging.

This still looks cinematic. A slow depth-aware push through a real living room
graded warm reads as high-end — it just happens to also be true.

**Customer, in priority order:**

1. **Property managers / STR co-hosting companies** — 10–100 units, existing
   marketing budget, one sale covers many properties, and they renew. This is the
   single biggest upgrade over the reel's plan.
2. **Real-estate agents & small brokerages** — every new listing is a new job;
   naturally recurring.
3. **Individual luxury STR hosts** — the reel's target. Real, but the worst
   ratio: one-off, price-sensitive, hardest to reach compliantly.

**Geography:** US, as specified. Start with 3–4 metros with high STR density and
public permit registries rather than spraying nationally.

---

## 3. Lead sources that permit automation

Airbnb is removed as a data source. Replacements, all legitimately automatable:

| Source | Why it's clean | Cost |
|---|---|---|
| **City STR permit registries** | Open government records. Many US cities publish STR licence rosters with operator name/address via Socrata open-data APIs. | Free |
| **Google Places API** | Licensed API. Query "property management", "vacation rental management" by metro. | Free tier, then usage |
| **Licensed STR data providers** | AirDNA / AirROI / Rabbu license the data and permit downstream use under their terms. | ~$50–200/mo |
| **Public business directories** | Chamber listings, NARPM member directories, state business registries. | Free |
| **Self-marketing social accounts** | Operators running a public business IG/TikTok are openly soliciting; a B2B DM is normal. Manual or low-volume. | Free |
| **Manual CSV** | Conferences, referrals, your own research. | Free |

`engine/sources/` implements registry (Socrata), Google Places, and CSV import
behind one interface, so more can be added without touching the rest.

---

## 4. Outreach that doesn't get us banned

**Channels:** our own cold email (primary), business IG DM (low volume, manual),
phone (highest close rate, unautomated). Airbnb's inbox is supported only as a
hand-worked queue — see "Working Airbnb by hand" below.

### Working Airbnb by hand

If you want to message hosts on Airbnb anyway, `python -m engine manual` builds
the queue. What it does and doesn't do:

- **Never sends.** It prints messages for you to paste. The module has no
  transport — a test asserts it contains no HTTP client, no SMTP, no browser
  driver.
- **No links in the copy.** Off-platform links are a specifically named
  violation, and it's the one part of the surface we can actually reduce. The
  ask is "let me know the best way to send it over."
- **Short.** Under ~60 words. A booking inbox is not email.
- **One message per listing, ~10/day.** A follow-up in a host's booking inbox is
  spam, and volume is what triggers review.
- **Varies phrasing** across a session; identical text at volume reads as a bot.

This lowers the odds of a ban. It does not make the outreach compliant.

**The bridge — this is the part that scales.** A listing usually names the
operator: a business name, a "Managed by …" line, a professional host profile.
Browsing Airbnb by hand to *identify* that operator is fine. Search the name;
most run a website or an Instagram business account. Contacting the business
there is ordinary B2B outreach — automatable, links allowed, nobody's listing at
risk. Feed those into `import-csv` and run them through `campaign`.

Use Airbnb as a directory, not as an inbox.

**CAN-SPAM requirements the sequencer enforces, not just documents:**

- Accurate `From` / `Reply-To` — no header forgery
- Subject line that isn't deceptive
- A real physical postal address in every message
- A working, honoured unsubscribe (and a permanent suppression list)
- No harvested or dictionary-attack addresses (harvesting is an aggravating
  factor that raises per-violation penalties)

`engine/outreach/compliance.py` is a hard gate: a message missing a postal
address, an unsubscribe link, or hitting the suppression list **cannot be sent** —
`send()` raises rather than degrading.

**The opening move — sample-first, done clean.** We can't build a full derivative
video from their photos before we have permission (§1d). So:

> Send a **portfolio reel** built from properties we hold rights to (our own, a
> friend's, or licensed stock interiors), plus:
> *"I make these for STR listings. Want one for one of yours? Send me photos of a
> unit and I'll do the first video free — if you like it we can talk about the
> rest."*

The free first video converts at least as well as an unsolicited spec, it costs us
~30 minutes, and it also solves the rights problem: they hand us the photos, which
is the permission. `engine/produce/intake.py` records that grant per property.

---

## 5. Honest unit economics

**Pricing**

| Package | Contents | Price |
|---|---|---|
| Starter | 3 vertical videos | $249 |
| Standard | 5 videos + 10 graded photos | $449 |
| Manager retainer | 5 properties / month | $1,500/mo |

**Cost per Standard job**

| Line | Cost |
|---|---|
| Render (ffmpeg 2.5D local) | $0 |
| Render (if a paid video model is used for select shots) | $0–12 |
| Music licence (Epidemic-style sub, amortised) | ~$1 |
| Storage + delivery | ~$0.50 |
| Stripe (2.9% + 30¢) | ~$13 |
| **Materials total** | **~$15–27** |
| Labour | 45–90 min once templated |

Materials margin is ~94%. The real constraints are **your time** and **cost of
acquisition** — which is exactly what the reel omits.

**Acquisition maths, at realistic 2026 cold-email rates**

- Infra: own domain(s), 3–5 inboxes per domain, **4-week warmup**, 20–30
  sends/inbox/day.
- 5 inboxes × 25/day × 22 working days ≈ **2,750 sends/month**
- 40–55% open, 2–4% reply, ~⅓ of replies positive → **~1% positive** ≈ 27
  positive replies/mo
- Close 25–40% of positive replies (free-first-video helps) → **7–11 deals/mo**
- At $449 → **$3,100–4,900/mo**
- Infra cost: sequencer $37–97/mo + inboxes ~$36/mo + domains → **~$100–150/mo**

**So, calibrated:**

| Period | Realistic |
|---|---|
| Month 1 | Warmup + portfolio. **0–3 deals.** Net likely negative. |
| Month 2–3 | System running. **$2–4k/mo.** |
| Month 4–6 | Retainers + referrals compounding. **$6–12k/mo** for a solo operator. |

**The Porsche, straight:** a 992 Carrera is ~$130k; a lease runs ~$1,800–2,400/mo
with $15–20k down and lender scrutiny of income history. **28 days: no.** A
working system covering that payment in **6–9 months**: plausible, not promised.

---

## 6. Build phases

**Phase 0 — Rights-clean portfolio (week 1)**
Three sample reels from properties we can legally use. Buy domains, create
inboxes, **start warmup now** (it's the 4-week critical path). Stripe + delivery
folder.

**Phase 1 — Lead engine (weeks 2–3)**
Pick 3–4 metros. Pull registries + Google Places → 500–1,000 US property managers
and STR operators. Normalise, dedupe, seed suppression list.

**Phase 2 — Production pipeline (weeks 3–4)**
Template the produce step to **<45 min/property**, batch-capable across a "box" of
properties in one command.

**Phase 3 — Outreach live (week 4+)**
Sequencer on, free-first-video offer, measure open/reply/close per segment. Tune
one variable at a time.

**Phase 4 — Compound (months 2–3)**
Convert one-offs to retainers, ask every happy client for one referral, raise
price when the calendar is full.

---

## 7. Note on repo placement

This lives in the `sculps-store` repo under `listing-engine/` for now, but it is a
**different business from SCULPS** — different customer, product and channel. Once
it's past Phase 1 it should get its own repository so the two don't entangle.

---

## 8. Open decisions for you

1. **Segment first** — property managers (recommended), agents, or individual
   hosts?
2. **Metros** — which 3–4? (Recommend high STR density + public registry: e.g.
   Nashville, Austin, Denver, Phoenix, San Diego.)
3. **Price** — launch at $449 Standard, or go in cheaper at $249 to fill the
   portfolio faster?
4. **Depth backend** — ffmpeg-only camera moves (free, ships today) vs. adding a
   depth model for true parallax (better output, needs a GPU or an API key)?
5. **Virtual staging** — offer it at all? It converts well but adds a disclosure
   obligation on every frame.
