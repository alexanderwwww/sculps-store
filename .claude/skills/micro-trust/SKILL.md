---
name: micro-trust
description: The micro-trust layer for UGC and ad videos and frames — the tiny camera, language, tone, sound, world and product details that make a viewer's brain decide "a real person filmed this" in under a second, and the AI/ad tells that destroy that in the same second. Use inside EVERY prompt written with ugc-master-prompter, when writing speech lines or captions, when a clip "looks fake / AI / like an ad / uncanny", when choosing what a person says or how they say it, and when judging footage. Trigger on "micro trust", "real life", "realistic", "looks fake", "natural", "UGC feel", "make it believable", "the words", "the tone", "the camera feel".
---

# micro-trust

Alex (2026-10-02): *"The prompt will create micro trust through realism. This is the hardest — the micro details. The camera got to look real. The words got to look real. The tone have to look real. Like the real life."*

**What it is.** Viewers do not judge a UGC clip by its big idea. In under one second the brain runs hundreds of tiny checks — how the camera moves, how people talk, what is in the room, what the audio sounds like — and decides **real person, real moment** or **ad / AI**. Every cue that passes adds trust; one cue that fails (a perfect smile, ad language, a glassy-smooth camera) cancels many. This skill is the library of those cues and the discipline to put them into every prompt and to inspect for them in every output.

Rule of use: the master prompt (ugc-master-prompter, block 9) must contain **at least 8 micro-trust cues across all five channels** (camera, words, tone, sound, world) and the judge must score them (`references/library.md` §7). Video models respond to concrete specifics, never to "make it realistic".

## The viewer-brain formula (Alex, 2026-10-02) — every clip follows this order
The video creates a visual reaction through the eyes into the brain. The order of effects:
1. **HOOK** (0–0.4 s: already moving; 0–3 s the product is in the picture) — stops the scroll.
2. **IMPRESS** — the wow: scale, glow, reveal (the Reaper at 8 ft 6 in with the blue lantern flaring at 4.94 s).
3. **MICRO-TRUST all the way through** — camera, words, tone, sound, world (below); never a break in it.
4. **SECURITY** — it feels safe to believe and to buy: an ordinary place, ordinary people, nothing sketchy, nothing exaggerated, consistent product and street, calm credible tone, claims you can stand behind.
5. **EMOTIONAL ATTACHMENT = DESIRE** — not sadness, not drama: "I want that in my yard." Created by the neighbours' fascination, the glow on faces, the product shown crisp and beautiful at the peak and the final hold.
**Slick crisp details inside a real iPhone shot:** the PRODUCT stays sharp and clear at its key moments (skull face, lantern, ghost-souls in focus, correctly exposed at the peak) while the WORLD keeps the phone's softness, noise and wobble. Crisp product + imperfect phone = real and desirable. Never a flat, over-smooth "ad" look, never a mushy product.
Golden-time mapping: 0.00 hook · 1.17–3.06 impress and security · 4.94 impress peak + desire · 6.11–8.00 desire hold (crisp product, off-centre, ends mid-moment).

## The five channels

### 1. Camera — it must feel held by a hand that is thinking about something else
Sourced from the real-footage study [style/phone-flaws, handheld, tiktok-pacing]: starts **mid-action** in the first half second; autofocus hunts when something new enters; exposure pumps when a bright light appears; rolling-shutter wobble on fast moves; a thumb or finger edge intrudes for a moment; framing drifts and corrects **late**; porch-light highlights bloom, shadows noisy; the frame lags a beat behind the body then catches up; the filmer looks at the screen, not through it; ends **mid-moment**, no outro. Composed craft additions: the subject is slightly off-centre and the top of something gets cut; the filmer is a little too far or too close at first; one wobble where a step lands; horizon a few degrees off; the image is softer than a camera, compressed in dark areas.
### 2. Words — people say less, worse and more specific than writers do
Short fragments (2–6 words), restarts, trailing off, repeated words, interruptions, mild swearing, "bro / dude / no way / is that real", a guess at a number ("like eight feet?"), reacting **before** finishing a thought, talking to the person next to them, not to the audience. No product name delivered perfectly, no feature list, no benefit sentence, no call to action, no "you guys", no ad cadence. Max ~14 words per line, usually 2–5 [bible, tiktok]. Different people never phrase alike.
### 3. Tone — understated surprise beats hype
Curiosity and disbelief, not excitement. Quiet near the mic, louder farther away. Breath and small laughs inside sentences. A voice that cracks or drops. Nobody smiles at the camera on purpose. Nobody performs. Emotions need a **visible trigger** ("he stops mid-stride, the leash tightens") [bible: verbs beat adjectives].
### 4. Sound — what a cheap phone mic actually captures
Never silent, first frame to last [style/real-sound, sound-layers]: wind on the mic, far traffic, a dog, leaves, the filmer's breathing and footsteps loudest, fabric on the phone, overlapping voices at different distances, the product's own sound, **one deep low hit at the peak** (4.94 s), ending loud and ongoing (no fade). Composed: automatic gain pumping when a voice gets close, a car pass, a phone click.
### 5. World — a lived-in place that nobody tidied
Real objects at real, mildly inconvenient positions: trash bin, garage door, parked car, a kid's bike, neighbour decorations, leaf litter, a cracked sidewalk, uneven lawn, mismatched porch lights, a leashed dog behaving like a dog, someone's half-zipped jacket, phones held differently (one vertical, one horizontal, one two-handed) [style/people, crowd-realism]. Nothing symmetric. Nobody looks into the lens.

## Product micro-trust
The product is a physical object in a real place: scale cues beside it (door, car, mailbox), its contact with the ground (grass bent, stake just visible), imperfect fabric/strips moving in wind, light flicker, off-centre, partly occluded by a person for a moment, never hero-lit. For handheld products: weight in the hands, a clumsy grip, a tag or label edge showing.

## The AI/ad tells (each one costs trust — ban them in the prompt)
Glassy gimbal smoothness; perfect exposure; centred hero framing; symmetric crowds or poses; everyone reacting at once; clean studio voice; ad language ("introducing", "game-changer", "limited time"); scripted perfect delivery; teeth-and-skin perfection; same face repeated; lens-looking; text or captions drawn by the model; props that morph; slow motion; a tidy ending pose; a 100%-quiet or music-bed audio. [style/never-do + bible failure list]

## How to apply (inside ugc-master-prompter)
1. Pick cues from `references/library.md` for each channel (copy-paste sentences) — at least 8, and always: mid-action start, focus hunt or exposure pump, one late reframe, one finger/edge or hand cue, overlapping imperfect speech, mic wind, one low hit at the peak, an off-centre/partly-hidden subject.
2. Write them as **concrete events on the golden times**, not adjectives. "At 3.06 the filmer's thumb drifts into the frame edge and the focus hunts as the blue glow enters" beats "realistic phone look".
3. Write the words in the voice of the specific person: age, region, mood, relation to the other person. US suburbs for the Reaper (Black Reaper sells to the US).
4. Run the micro-trust score on the frames and the clip (`references/library.md` §7) and repair the lowest channel first.
5. When two cues conflict with an engine's limits (word cap), keep the cue, drop an adjective.

Related: `.claude/skills/ugc-master-prompter` (the procedure), its `references/realism.md` and `judge.md`, `tools/xugc/assets/style/*.md` (the source rules).

## The deep sheets (read the one for the channel you are writing)
- `references/camera-forensics.md` — 40 timed camera cues, 5 capture modes (signature + breakers), dusk/night, 18 AI camera tells with replacement sentences, per-engine camera phrasing, 10-point camera checklist. (Write "bloom/halo", never "lens flare": never-do bans flare.)
- `references/speech-and-tone.md` — 12 laws of real speech, a 140-line bank by situation and speaker, the tone palette and desire arc, per-engine speech syntax and caps, caption rules and banned phrases, 0–3 speech checklist (pass 22/30, no zero row).
- `references/sound-and-world.md` — 40 sound cues and a second-by-second map at the golden times, 40 world cues + the dusk light recipe + the six-frame stability list, product-in-place per class, sound/world AI tells, engine audio handling (with the verified Kling argument correction), desire layer, checklist.
- `references/formula-and-psychology.md` — the five-stage formula table, the one-second verdict model, desire engineering, security cues, 30 hooks (10 written for the Reaper), testing loop, compliance guard rails (AI-disclosure: label synthetic-person ads until the official text is read), the 25-line brain card.
- `references/library.md` — the compact copy-paste cues and the 0–3 micro-trust score used by the judge.
Open evidence gaps are listed in `.claude/skills/ugc-master-prompter/references/decisions-and-open-items.md`.

## REALISTIC PHOTO ≠ AD (Alex, 2026-10-07 — said angrily, never repeat)
When Alex asks for a "realistic picture" (a listing photo he "took with his phone"), every imperfection goes in at once, in the FIRST prompt:
- camera NOT straight overhead: tilted, off-centre, slightly crooked horizon, part of the item cut off by the frame edge;
- item thrown down, asymmetric, one sleeve twisted, hood half-collapsed, uneven folds, lint, fuzz, faded patches; never a neat symmetrical flat lay;
- uneven window light (one side brighter), a little overexposure, slight motion blur or soft focus, phone noise, a stray hair/thread;
- his black loafers only partly in frame, scuffed, one at an odd angle;
- props small and casual (a blank tiny white paper scrap, torn, unevenly placed) — no text on it unless asked.
A centred, symmetrical, evenly lit, perfectly sharp result is a FAIL even if every detail is "correct".
