# Listing Engine

Automated pipeline for selling and producing **short-form property video** to US
short-term-rental operators, property managers, and real-estate agents.

Three stages, a CLI and a local app:

```
leads  →  outreach  →  production
```

```bash
python -m engine app          # opens a dashboard at 127.0.0.1:8765
```

The app is the same engine with buttons: harvest photos, record rights, render,
build AI prompts, preview the reel in the page. Loopback only, no auth, nothing
hosted — do not port-forward it.

- **[PLAN.md](PLAN.md)** — the strategy, the honest economics, and what the source
  reel got wrong
- **[COMPLIANCE.md](COMPLIANCE.md)** — the rules, and which ones the code enforces

Two defaults are deliberate and worth knowing up front:

1. **Outreach is dry-run unless you pass `--send`.**
2. **Production refuses to run without a recorded photo-rights grant.**

---

## Install

```bash
cd listing-engine
pip install -r requirements.txt
cp config.example.toml config.toml   # then fill it in
```

**ffmpeg:** install a real one — `apt install ffmpeg` or `brew install ffmpeg`.
The `imageio-ffmpeg` fallback works for rendering motion but is usually built
without `drawtext`, so captions, end cards and the virtually-staged disclosure
won't render. The pipeline tells you when that happens rather than silently
dropping text.

Secrets come from the environment, never `config.toml`:

```bash
export LISTING_ENGINE_EMAIL_API_KEY=...        # Resend
export LISTING_ENGINE_GOOGLE_PLACES_KEY=...    # Google Places
```

---

## Leads

```bash
# Find a city's STR permit dataset (public open data)
python -m engine discover --query "short term rental"

# Ingest one
python -m engine pull-registry --domain data.nashville.gov \
    --dataset xxxx-xxxx --state TN --city Nashville

# Property managers by metro (the best segment — see PLAN.md §2)
python -m engine pull-places --metro Nashville --state TN

# Your own list. Needs provenance: a source_url column, or --source-url.
python -m engine import-csv leads.csv --source-url "NARPM directory 2026"

python -m engine stats
```

Ingest normalises, drops non-US and out-of-target-state rows, strips role
addresses (`noreply@`, `postmaster@`…), infers segment, and dedupes on email —
falling back to normalised business name + state, so one operator holding twelve
permits lands as one lead.

**Airbnb, Vrbo and Booking.com are not implementable as sources.** Automated
collection breaches their terms; `assert_source_allowed()` refuses those hosts so a
mis-typed endpoint can't quietly point the pipeline at them. See COMPLIANCE.md §2.

## Outreach

```bash
# Dry run — renders every message and runs every compliance check, sends nothing
python -m engine campaign --portfolio-url https://example.com/reel --limit 25

# Only property managers
python -m engine campaign --portfolio-url https://example.com/reel \
    --segment property_manager

# For real
python -m engine campaign --portfolio-url https://example.com/reel --send

# Opt-out. Permanent, no undo.
python -m engine suppress someone@example.com
```

### Airbnb hosts, by hand

```bash
# Build a hand-send queue. Prints messages; sends nothing.
python -m engine manual --list listings.csv --max-per-day 10

# After you've pasted them in yourself
python -m engine manual --mark-sent --handle https://www.airbnb.com/rooms/123
python -m engine manual-log
```

Read this before using it. Airbnb's **Off-Platform Policy** prohibits "including
links that take people off of the Airbnb platform in … messages" and "soliciting
or facilitating any off-Airbnb transaction". A paid-work pitch is both, and no
wording fixes it — the solicitation is the violation. Penalties reach account
suspension **and apply to the host who replies**, which is also why the operators
with real budget won't engage.

So the queue is harm reduction, not compliance: link-free copy, under 60 words,
one message per listing, ~10/day, varied phrasing, and no transport in the module
at all (a test asserts it). Sending is your call; automating it is not something
this repo will do.

The bridge that scales: a listing usually names the operator. Browse by hand to
find that business, then contact it off-platform — automatable, links fine, no
listing at risk. `import-csv` those into `campaign`. **Airbnb as a directory, not
an inbox.**

`--portfolio-url` is required: the first touch leads with real work, and the offer
is a free first video. That's what keeps the outreach clean — the prospect sends
their photos, and the handover is the rights grant.

Every message passes `engine/outreach/compliance.py` before any transport sees it.
It blocks on a missing postal address, a missing unsubscribe link, a deceptive
subject, a suppressed recipient, an exceeded touch cap, a forbidden performance
claim, or the daily send cap — by raising, not warning. There is no override flag.

## Spec videos — photos before contact

```bash
# Pull photos from operators' own websites (robots.txt-aware, rate-limited)
python -m engine harvest --list operators.csv --out ./inbox \
    --contact https://yoursite.com/about

# Turn each property into image-to-video prompts for OpenArt / Kling / Runway
python -m engine pack --inbox ./inbox --out ./packs
```

`harvest` collects from the **business's own domain**, never a booking platform —
`assert_source_allowed()` refuses those. Everything lands with a `RIGHTS.txt`
marking it `SPEC_ONLY`: fine for a private pitch to that same business, not for
portfolio, ads, or any public posting until they grant permission in writing.

`pack` writes `prompts.txt` + `manifest.json` per property — paste each prompt
with its image into your image-to-video tool. This is the reel's workflow run
over a whole box, with one difference: the prompts are constrained to the
photographed room.

```python
from engine.produce.i2v import assert_prompt_truthful
assert_prompt_truthful("Cinematic real estate walkthrough, gliding forward "
                       "from the entryway ... into a cozy bedroom")
# FabricatingPrompt: implies touring rooms the photo doesn't show
```

The checker is negation-aware, so "do not add furniture" reads as a constraint
rather than an instruction. Every prompt the packer emits passes it.

## Production

```bash
# 1. Record the rights grant, in the client's own words
python -m engine record-grant nashville-2br-downtown \
    --supplied-by host@example.com --via email \
    --note "I own the rights to these photos and authorise you to edit them into video."

# 2. Batch-produce. One folder per property.
python -m engine produce --inbox ./inbox --out ./delivery --end-card "Book direct"
```

```
inbox/
  nashville-2br-downtown/     <- folder name is the property_ref
    living.jpg
    kitchen.jpg
  austin-loft-e6th/
    ...
```

A folder with no grant on file is **skipped with a reason**, not produced.

### What the renderer will and won't do

Every output frame is a crop-and-scale of a real photograph. Moves available:
`push_in`, `pull_out`, `pan_left`, `pan_right`, `tilt_up`, `tilt_down`,
`push_in_left`, `push_in_right`, `hold` — eased with a smoothstep so they start
and end at rest, which is most of what separates a cinematic push from a
slideshow.

These raise `FabricationRefused`:

| Requested | Why refused |
|---|---|
| `walkthrough` | implies a floor plan a single photo can't support |
| `orbit` | needs geometry not in the photograph |
| `dolly_through_doorway` | needs the space beyond the doorway generated |
| `outpaint` / `uncrop` | extends past the photo's real edges |

That's the whole design point. Content that invents rooms or hides defects can get
the **client's** listing suspended — Airbnb asks hosts to remove AI content that
misrepresents a listing, and has suspended listings and refunded guests over it.
Lighting and colour work is explicitly fine; inventing space is not.

Any shot marked `virtually_staged` gets a `Virtually staged` label burned in, and
if the label can't be rendered the shot doesn't ship at all.

---

## Tests

```bash
python -m unittest discover -s tests -v
```

100 tests. They render real video through ffmpeg (a few seconds each), assert the
compliance gate refuses on every hard rule, assert the renderer refuses every
fabricating move before writing any output, and assert the manual queue contains
no way to send.

---

## Layout

```
engine/
  cli.py                    argparse entry point (python -m engine)
  config.py                 TOML config; secrets from env only
  db.py                     sqlite; suppression table is append-only by design
  models.py                 Lead, Job, Shot, PhotoGrant
  sources/
    base.py                 source interface + blocked-platform guard
    registry.py             city STR permit datasets (Socrata)
    places.py               Google Places — property managers
    csv_import.py           manual lists, provenance required
    site_photos.py          spec-work harvester (own-website, robots-aware)
  app/
    server.py               local dashboard (127.0.0.1, no auth by design)
    jobs.py                 background job runner
    ui.html                 the page; no external requests
  pipeline/normalize.py     clean, dedupe, infer segment, US-only filter
  outreach/
    compliance.py           the hard gate
    templates.py            sequences per segment; footer always appended
    sequencer.py            render → gate → transport → record
    transport.py            Resend / console
    manual.py               hand-send queue (Airbnb/IG); no transport by design
  produce/
    ffmpeg.py               binary discovery, capability probe
    motion.py               truthful camera moves; refuses fabrication
    assemble.py             crossfade, music, captions, end card
    i2v.py                  truthful image-to-video prompts; refuses fabrication
    intake.py               rights grant + job construction
    batch.py                the "box of listings" run
```

## Status

Working: lead ingest and dedupe, the compliance gate, the full render and assembly
pipeline, batch production, rights-grant enforcement, the CLI.

Not built yet: the unsubscribe web endpoint (the URL is generated and enforced,
but you need to host the handler), reply detection, email-from-website
enrichment, invoicing, and the `[[sources.registry]]` config block is written for
you to read rather than auto-loaded. See PLAN.md §8 for the open decisions.
