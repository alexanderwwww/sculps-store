# Compliance Rules

These are the rules the pipeline enforces. Some are enforced in code and cannot be
bypassed by configuration; those are marked **[HARD]**. The rest are operating
policy — if you break them the code won't stop you, but the business will suffer.

---

## 1. Media truthfulness

The product is motion applied to **real photographs of the actual property**.

### Allowed

- Depth-aware camera movement (push-in, pull-out, pan, tilt, parallax) over the
  property's real photos
- Lighting, exposure, white-balance and colour correction
- Sky replacement on exteriors **only if disclosed** to the client in writing
- Cropping, reframing, aspect-ratio changes
- Cuts, transitions, music, captions, end cards
- Removal of transient clutter the client asks to remove and confirms is not a
  permanent feature (a bin bag, a stray cable)

### Forbidden **[HARD]**

- Generating rooms, areas, or views that do not exist
- Generating a continuous "walkthrough" that implies a floor plan or spatial
  relationship not present in the source photos
- Removing or concealing real defects, damage, or wear
- Adding amenities, fixtures, or features the property does not have
- Undisclosed virtual staging
- Altering views out of windows to show a different outlook

**Why this is a hard line:** Airbnb's stated policy is that they will ask hosts to
remove content where AI or other digital technology has been used to edit flaws,
hide damage, add amenities not part of a listing, or otherwise misrepresent the
listing. A listing was suspended and a guest fully refunded on exactly these
grounds in July 2026. Content that violates this section gets **our customer**
penalised, which ends the business faster than any fine.

For US real-estate use the same logic applies via FTC deceptive-advertising rules
and state real-estate advertising regulations.

### Virtual staging

If offered at all: every frame containing staged furniture carries a legible
`Virtually staged` label, and the client delivery note states which shots are
staged. This is standard practice in US real estate. It is not optional.

---

## 2. Data sourcing

### Forbidden **[HARD]**

- Scraping Airbnb, Vrbo, or Booking.com. Automated collection breaches their
  Terms of Service. Exposure: account termination, IP blocking, breach-of-contract
  claim.
- **Automating** any listing platform's internal messaging system. A bot driving a
  logged-in session is precisely what platform anti-automation detects, and the
  ban removes the channel you were prospecting through.
- Email address harvesting or dictionary attacks. Under CAN-SPAM these are
  aggravating factors that increase per-violation penalties.

### Airbnb's inbox — read this before using it

Airbnb's **Off-Platform Policy** specifically prohibits:

- "including links that take people off of the Airbnb platform in listings or
  messages"
- "soliciting or facilitating any off-Airbnb transaction"

A message offering paid video work is both. **There is no wording that fixes
this** — the solicitation itself is the violation. Penalties reach listing and
account suspension, and they apply to the **host who engages**, not just to the
sender. That is a sales problem as much as a rules problem: you are asking a
professional operator to risk their listing in order to reply to you, and the
good ones know it.

`engine/outreach/manual.py` supports this channel as a **hand-worked queue** — it
prints messages for you to paste, records them, and caps volume. It has no
transport and cannot send. That is harm reduction, not compliance. Use it knowing
the difference.

The scalable version is the bridge: identify the operating business from the
listing, then contact that business off-platform, where automation and links are
both fine.

### Allowed

- Public government records (STR permit registries, business registrations)
- Licensed APIs (Google Places, licensed STR data providers) used within their terms
- Public business directories
- Contact details a business publishes on its own website for business enquiries
- Data the prospect gives us directly
- Referrals

Every lead row records `source` and `source_url` so provenance is auditable. Leads
with no provenance are rejected at ingest.

---

## 3. Outreach

### Enforced in code **[HARD]** — `engine/outreach/compliance.py`

A message **cannot be sent** unless it has:

1. A truthful `From` name and address, and a working `Reply-To`
2. A non-deceptive subject line
3. A physical postal address in the body
4. A working unsubscribe link
5. A recipient not on the suppression list
6. A recipient under the per-address contact cap

`send()` raises `ComplianceError` on any failure. It does not warn and continue.

### Policy

- Unsubscribes honoured immediately and permanently — suppression is never purged
- B2B business addresses only; no personal/consumer addresses
- Max 4 touches per prospect per campaign, then stop
- Per-domain send throttle to protect deliverability
- No misleading claims about results, client counts, or credentials
- No invented testimonials, review counts, or portfolio work. Every portfolio
  piece must be work we actually did on a property we had rights to.

---

## 4. Rights in source material

- We do not build client deliverables from photos we were not given.
- `engine/produce/intake.py` records, per property: who supplied the photos, when,
  and the confirmation that they hold or control the rights.
- Portfolio and advertising use requires separate written permission from the
  client — being paid for the work does not by itself grant us promotional rights.
- Stock interiors used in the portfolio must be under a licence that permits
  commercial promotional use.

---

## 5. Claims we do not make

Not in emails, landing pages, or sales calls:

- Specific income or booking-uplift figures we have not measured on that client's
  own listings
- "Guaranteed" more bookings, higher occupancy, or higher revenue
- Any implication that the video is unedited footage of the property
- Any statement that the content is Airbnb-approved or endorsed

Acceptable framing: "Vertical video built from your own photos, ready for
Instagram, TikTok and your direct-booking page."
