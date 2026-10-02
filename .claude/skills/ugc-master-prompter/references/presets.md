# presets.md — the recipe library, built around PRODUCT CLASS

Every recipe is ONE 8 s shot (a 16 s ad = 2 clips joined). Source tags: [presets.js] tools/xugc/presets.js, [bible] design/xugc/real-life/05-directors-bible.md, [style] tools/xugc/assets/style/*.md, [recipe] 00-real-life-recipe.md, [hf] 07-higgsfield-and-renting.md, [xugc] .claude/skills/xugc/SKILL.md. `[UNVERIFIED]` = not in the repo, a house suggestion to test.

## 0. Rules that apply to every recipe

- **Golden times for an 8 s clip: 0 / 1.17 / 3.06 / 4.94 / 6.11 / 8.00 s** [recipe D22, google.js goldenTimes]. Setup 0-3.06, build to the peak at 4.94, settle 6.11-8. At most **3 beats per clip**, slots 1=[0] 2=[0,4.94] 3=[0,3.06,4.94] [presets.js SLOTS, MAX_BEATS]. A pacing rule, not a proven realism gain (A/B it) [recipe D22].
- One shot = one action + one camera idea + one line of speech [bible law 2]. Line 8-18 words per 8 s, sentences <= 10 words [bible law 7, recipe spec].
- The first shot is the ad: product or its effect visible and understood inside 3 s [bible law 1]. Word 1 by 0.3 s, line <= 10 words, motion from 0.0-0.4 s [bible s3].
- Product label/logo only from the reference photo; text, price, URL and captions are burned in post, never drawn by the model [bible law 8, style/realism-rules #10].
- Sound audible from frame one to the last frame, never a fade-out; room tone constant, music added in post [style/real-sound.md, bible s9].
- **Personal-use claims are blocked** ("I use it every day", "it's been N days", "best $ I've spent", "my husband said") — an AI person cannot report personal use [recipe D7; 03-audio-voice.md s8.3 FTC 16 CFR 255/465]. Recipes below use demonstration, reveal, scale, reaction lines.
- Customer-facing lines are confident: no "sorry", "unfortunately", "we hope", hedges [AGENTS.md; bible hook note].
- Minors: no close identifiable faces; hands/back of head only [bible 8.9, presets.js MINORS].

## 1. The product-class switch (decide FIRST, from the real page + real photos)

| Class | Examples | Person | Hands rule | Capture default | Scale sentence | Style files that apply |
|---|---|---|---|---|---|---|
| **(a) Handheld small** | cryo bottle chiller (~28x14x14 cm) [cryo], gadgets | 1 creator, indoor | "natural hands, five fingers visible, holding it by its {edge/base/side}" [bible s4.8] | selfie / propped / POV | size vs hand ("lunchbox size") | iphone-look, handheld, hooks, real-sound, phone-flaws, tiktok-pacing, people |
| **(b) Wearable** | garments, jewellery | 1 creator, mirror/propped, full or waist-up | hands adjust it, never "hold by edge" once on | propped | n/a | as (a) |
| **(c) Yard-scale prop on a stake** | Black Reaper: 8 ft 6 in / 2.6 m, 4.2 lb, battery lantern, stake in lawn | filmer unseen or at distance; 1-3 neighbours; creator beside it for scale | hands never carry it; hands only touch stake/lantern switch | friend-holds, propped low on lawn | "2.6 m, about 1.4x a 1.8 m adult, taller than the front door" | iphone-look, handheld, phone-flaws, real-sound, crowd-realism (only if crowd asked), people, tiktok-pacing. NOT inflatable-physics |
| **(d) Inflatable** | The 16 ft Scream (4.9 m), 12 ft Giant Skeleton (3.7 m) | same as (c) | hands plug cord / press switch / pull ropes | friend-holds, propped low | 16 ft = 4.9 m "head level with upstairs windows" [style/inflatable-physics] | all of (c) + inflatable-physics, sound-layers |

Appearance of Scream/Skeleton: the bible's `{INFL}` (16 ft white-bone skeleton, orange eyes) is a placeholder, NOT the store product [bible s7]. Read the real product page for each [UNVERIFIED].

**Reaper-specific must-nots:** battery product — never a cord, never solar [HANDOFF.md]; no fan, no plug, no blower. Hooded black robe + skull face is the real product: describe it by shape/colour from the reference; no white pointed hood, no person inside it. The bible's standing forbidden list bans "robed or hooded figures" and C12 would swap the design [bible 12.2a, 12.3] — that rule was written for cult imagery; for the Reaper it must be overridden explicitly in the spec `notes`, and flagged to Alex [UNVERIFIED decision, ask once].

---

## 2. The recipes (base table = class (a); variants follow)

### 2.1 Review / talking head (selfie) — hook, testimonial-style demo
Capture selfie | person: 1 creator | sound: room tone, soft fabric rustle, no music.
| t | action | speech (demo-voiced, no usage claim) | sfx |
|---|---|---|---|
| 0.00 | holds product beside face, small refocus | "Okay, look at this." | room tone, handheld rustle |
| 3.06 | turns it once to show the front, eyes flick screen to lens | "Here is what it does." | light finger tap |
| 4.94 | lowers to chest, nods, tiny reframe | "Watch." (then show effect) | quiet breath |
Hands: arm's-length selfie so one hand holds the phone, the other the product [bible C4]. Old preset line "I have used it every day for a week" is blocked [presets.js review, recipe D7].
- **(b) wearable:** switch to propped, waist-up; she touches the garment edge, one half turn.
- **(c) yard prop:** a selfie with an 8.5 ft figure behind her at dusk: "Eight and a half feet. Look behind me." Hook #30 scale reveal [bible]. Hand points at it, no holding.
- **(d) inflatable:** selfie in front of the standing figure; plug in her other hand is impossible while holding phone, so figure already stands (finished state) [style/realism-rules #2].

### 2.2 Product-only (hands + voiceover)
Capture POV | person: hands only | sound: table tap, soft click; voiceover phone-quality [presets.js].
| t | action | line | sfx |
|---|---|---|---|
| 0.00 | hands lift product into frame from table | "This is the one people keep asking about." | table tap, fabric slide |
| 3.06 | one hand turns it <= 90 deg to the main feature | "Look how it's built." | soft click |
| 4.94 | thumb presses the key part, it responds | "One press." | button click |
- **(b)** hands smooth/hold fabric flat, then a hook-and-lift.
- **(c)** POV is a wrong fit (it is 2.6 m tall); use a low POV walking up the lawn, hand touches the base of the stake [UNVERIFIED].
- **(d)** POV hands pull the folded fabric from the bag, plug in, thumb on switch [bible 8.5]; inflate stages are risky for distilled models — render finished state as its own clip [style/realism-rules #2, bible C9].

### 2.3 Unboxing
Capture POV (hands visible) | person: hands + optional selfie reaction as a second clip [bible C4/8.2] | sound: tape rip, cardboard, foam squeak.
| t | action | line | sfx |
|---|---|---|---|
| 0.00 | free hand cuts the tape, flaps spring up | "Guess what came today." | tape rip, crackle |
| 3.06 | both hands lift product out (weight dip) | — | foam squeak |
| 4.94 | turn once to show feature, set on counter | "Okay, look at this." | set-down |
Box size must match product [presets.js unboxing rule]. "Better than the pictures" is soft testimonial wording: keep only if the store accepts it [recipe D7, UNVERIFIED].
- **(c) Reaper:** the box is a long carton on the porch/lawn; two-handed lift of a 4.2 lb figure folded in sections [UNVERIFIED how it ships, read the page]; 5-minute setup beat = stake into lawn.
- **(d) inflatable:** box + black bag on the lawn; "flat black bag on the lawn" opener [bible 8.1].

### 2.4 Try-on (wearable only)
Capture propped, phone at waist height | sound: fabric slide, clasp click, footsteps.
Beats: 0.00 holds item up | 3.06 puts it on, adjusts with both hands | 4.94 one slow half turn, "That fit." Same outfit under the item, one half turn only, no dance [presets.js try-on]. "It fits perfectly" is an outcome claim: keep to what is visible [UNVERIFIED].
- (a)(c)(d): n/a.

### 2.5 Tutorial (steps)
Capture propped | one action per step [presets.js tutorial].
Beats: 0.00 "Step one, get it ready." | 3.06 hands do action, "Step two, press here." | 4.94 result shown, "Step three, done." Step captions burned later.
- **(c) Reaper — the 5-minute setup:** 0.00 push stake into lawn (hands, ground thump) | 3.06 slide figure on / switch on lantern (click) | 4.94 step back, cold-blue glow on grass. One action per beat, no cord anywhere.
- **(d) inflatable:** stakes first, plug, switch, then rise: 3-6 s fill, head last, ropes taut one by one [bible C9, 12.6A]. Show the fill in its own clip.

### 2.6 Breaking-news hook
Capture friend-holds | sound: street traffic, wind on mic, then room tone.
The hook is a CAPTION burned in post (`0-4 | BREAKING NEWS`, `0.6-4 | A neighbour just did something insane`), never a spoken line, never a TV studio, anchor, ticker [style/breaking-news.md]. Prompt side: "urgent, out-of-breath neighbourhood clip, filmer moving fast toward something".
| t | action | line | sfx |
|---|---|---|---|
| 0.00 | handheld swing across a street toward a lawn | breathless "Wait, wait, look" | wind, traffic |
| 3.06 | the product comes into frame already standing | "Look at that." | exposure hunt |
| 4.94 | reaction from a second person | gasp | low bass hit |
- **(c)(d)** this is the strongest class for it: street to lawn pan, hook #29 [bible]. Old preset swaps to an indoor room with a woman holding the product — fine only for (a).

### 2.7 Demo-in-motion
Capture friend-holds | sound: product's own sound.
Beats: 0.00 steps into frame, "Watch this." | 3.06 starts the product | 4.94 full effect, steps back. Product's motion is the only large movement [presets.js].
- **(a) cryo:** bottle on the rollers, lid closes, it spins in blue mist; no time claim, no cartridge, no freezer [cryo].
- **(c) Reaper:** it is passive: demo = dusk "switch on" — click, lantern lights cold blue, ghost-souls start spiralling up inside the lantern. Cap the glow as a light on the grass, not a flame.
- **(d)** fan runs, fabric lifts head last, tethers go taut [bible 12.6A]; roar of blower rises in pitch [style/sound-layers.md].

### 2.8 Before / after
Capture selfie or locked-off | cut point = hand wipe across the lens [presets.js, bible 8.10].
Beats: 0.00 point at the problem "My yard at six." | 3.06 hand wipes lens | 4.94 same framing, fixed, "At six-oh-five."
- **(c)(d)** bare lawn -> same lawn with the figure standing; need a yard reference photo as ref slot 3 so the lawn is identical [bible 8.10]. Day vs night reveal is its own recipe [bible 8.6]: same first frame, light fades to blue dusk, glow comes on.
- Medical or cure claims: never [presets.js, bible forbidden].

### 2.9 Neighbours react (classes c, d) [bible 8.4]
Capture friend-holds, night/dusk | 2 or 3 clearly different named-by-look people, each with a job [style/people.md, realism-rules #5]. Crowds of 6-10 only if asked and then each differently described, >= 3 phones up [style/crowd-realism.md]. Prefer 2-3 people over a crowd.
| t | action | line | sfx |
|---|---|---|---|
| 0.00 | pan from street to the lit figure | filmer breathing | wind, leaves, far dog |
| 3.06 | man in puffer jacket with leashed dog stops mid-stride, leash tightens, dog sits | "Bro, look at that." | leash clink |
| 4.94 | woman half in frame gasps, lifts phone vertical | "No way." | ONE deep low hit |
| 6.11 | kid in costume (back of head only) points up | overlapping voices | blower/wind, never fades out |
Neighbour faces change per clip: keep them off-hero or reuse one as ref slot 3 [bible 8.4]. Hood/robe on a neighbour is forbidden next to the figure (nobody costumed as the product) [style/never-do.md].

### 2.10 Delivery / doorbell (houses a parcel) — [UNVERIFIED, no recipe in repo]
Built from unboxing + neighbour pieces; test before relying on it.
| t | action | line | sfx |
|---|---|---|---|
| 0.00 | doorbell ring, hand opens door to a carton on the step | "It's here." | doorbell, door |
| 3.06 | drags carton in / lifts it out (weight dip) | — | cardboard drag |
| 4.94 | first look at the product | one reaction word | tape rip |
Capture POV or friend-holds; (c) 2.6 m figure in a long box.

---

## 3. What tools/xugc/presets.js (and compose.js) assume, and what must change

Today it assumes **one handheld small product, held by one woman, indoors, one phone**. For the Reaper and the inflatables it fails. Exact fixes (so the app can be changed later):
1. **`HAND` rule and `{part}` map** (`PARTMAP selfie/propped=edge, pov=base, friend-holds=side`) write "holding the product by its edge" into every beat and every clip [presets.js `HAND`, `fill`, `clips`]. For class c/d: replace with a per-class hands rule ("hands touch the stake only; never lift the figure").
2. **Every beat says "She".** `fill()` default face = "a relaxed woman in her late twenties", default room = "an ordinary lived-in room" [fill()]. Needs: person variants (man, neighbour, none/distance) and a per-class default place ("front lawn at dusk, porch lamp"). The lived-in-room default on a lawn scene is the known contradiction [xugc skill, realism rule 6].
3. **`COMMON_AVOID` contains "crowd" and `MINORS` says "no crowds"** [presets.js]. Neighbours-react needs 2-3 people and optional crowd. Make "crowd" avoid class-dependent.
4. **No `class` field exists.** Add `productClass: handheld|wearable|prop|inflatable` plus `scale` (human terms) and `size_cm`; scale sentence is mandatory for c/d [bible s4 rule 5].
5. **Style Bible is global**: `gather()` merges every enabled .md into every prompt [compose.js]. A cryo ad would get `inflatable-physics.md` (blower, tie-down ropes, red glow), `sound-layers.md` (blower roar), crowd-realism and porch-light phone-flaws. Per-class file sets (table in s1) are required, with inflatable-physics ONLY for class d.
6. **`LOOK` constant** says "natural window light ... ambient room sound, no music" [presets.js LOOK]; outdoors dusk needs porch lamp/blue sky and wind/crickets.
7. **Testimonial lines hard-coded:** review "I have used it every day for a week"; unboxing "better than the pictures"; try-on "it fits perfectly" [presets.js]. First is blocked by the compliance rule [recipe D7].
8. **Breaking-news preset contradicts the style file:** preset speaks a reporter-style voice on a street then cuts to a room; `breaking-news.md` says caption-only and the preset rules say "no on-screen text" [presets.js vs style/breaking-news.md]. Align to caption-only; drop the room cut for c/d.
9. **`defaultSeconds: 16` and clips(n=2) fit 2 x 8 s**; prompts reference `refsPlan` roles avatar/product/room only. Class c/d need a ROOM -> `yard` reference and an optional `second-person` role [fill() refsPlan].
10. **Missing recipes:** neighbours-react, delivery/doorbell, day-vs-night, scale-reveal, setup-in-5-minutes [bible 8.4-8.6, 8.1]. Only 8 types exist.
11. **Reference-image rule not enforced:** photos with text/diagrams get pasted into the video; only the first clean photo should be used [style/realism-rules #3, xugc skill build 5].
12. **No forbidden-list class awareness:** the bible's hooded-figure ban would block the Reaper [bible 12.2a]; the list needs a per-product override.
13. **Higgsfield equivalents (for comparison, names only):** ugc-review, ugc-product, ugc-unboxing, ugc-try-on, ugc-tutorial, ugc-website, plus Marketing Studio and Ad Multiplier [hf]. Their internal beats were not read — [UNVERIFIED]; "nothing they do needs a secret engine" is the repo's inference [hf].
