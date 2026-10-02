# XUGC "Real Life" — Director's Bible (05)

Role: director / cinematographer / prompt specialist. Scope: photoreal iPhone-style UGC video ads, 9:16, via Veo 3.1, Seedance 2.x and Kling 3.0 official APIs, with product photo(s) + avatar photo as references, clips 4-15 s stitched into 15-30 s ads.

**Read section 12 (Prompt-Understanding Layer) first: every generation starts from a SHOT SPEC, not from Alex's raw sentence.**

Rule of the bible: every engine fact below is from a source in section 11. Items marked **[house rule]** are my production decisions built on those facts, not vendor statements. Items marked **[verify at integration]** must be checked against the exact API parameter list when the call is wired (vendor guides are written for the consumer UIs; field names differ in APIs).

---

## 0. The 10 laws (read these, ignore the rest if rushed)

1. **The first shot is the ad.** Product or its effect visible and the viewer knows what is being sold inside 3 s (sources 12, 13). Design shot 1 first, not the sentence.
2. **One shot = one action + one camera idea + one line of speech.** Every engine guide says the same: Seedance "exactly ONE primary move" (6), Kling "one visible action and one camera intent per shot" (4), Veo "break complex ideas into workflow" (1).
3. **Short prompts, front-loaded.** Seedance adherence decays by position; 60-100 words (6). Veo 5-part formula (1). Do not write 300-word prompts.
4. **Every reference image gets a job sentence.** "Naked" references bleed lighting/framing (6, 7). Say what each image governs.
5. **Describe the phone, not the cinema.** Real creators film on a phone: slight handheld sway, auto-exposure hunt, window light, cluttered room. "Cinematic, 8K, epic" produces an ad, not UGC (6 weak-vs-strong example).
6. **Identity is locked by images, never by adjectives.** "Repeated adjectives alone do not lock identity" (4). Same avatar reference + same wardrobe sentence in every shot.
7. **Speech: short, spoken, 8-18 words per 8 s clip.** Long lines break lip-sync (6) and sound like copy. Write how people text, not how brands write.
8. **Never ask the model to render critical text** (price, logo, URL). Burn text/captions in the editor (4, 6: on-screen text garbles on Veo). Product label must come from the product reference image only.
9. **Generate 3 takes of the hook shot, 1-2 of the rest.** Hook decides spend; pick the best take, stitch.
10. **Stitch on motion or on sound, never on a freeze** (section 9).

---

## 1. What each engine is (hard facts)

| | Veo 3.1 | Seedance 2.0 / 2.5 | Kling 3.0 |
|---|---|---|---|
| Clip length | 4, 6 or 8 s. **Reference images require 8 s** (2) | 2.0: 4-15 s; 2.5 route: 4-30 s per vendor guide (8) **[verify at integration]** | 3-15 s (4, 5) |
| Aspect | 16:9 or 9:16 incl. with refs (2) | set in API control, do not write it in the prompt (8) | set in API |
| Reference images | up to **3**, style+content refs; `personGeneration` must be allow_adult (2) | 2.0: up to 9 img + 3 video + 3 audio (7); 2.5 route: up to 30 img (8). Tags `@Image1`... in upload order | Element from 2-4 reference images or 1 video; referenced by descriptive name (5) |
| Native audio / speech | Yes. Dialogue in quotation marks, `SFX:`, `Ambient noise:` (1) | Yes. 2.5 notation: `{dialogue}`, `<sfx>`, `( music )`, `【subtitle】` (8). 2.0: subtitles-style line `subtitles ... matching voiceover: "..."` (6) | Yes. `[Character: tone]: "line"` speaker-labelled (3, 4) |
| Multi-shot in one clip | Timestamp blocks `[00:00-00:02] ...` (1) | "cut to" markers or `Seconds 1-5: ...` (6); 2.5: staged ranges "approx 8-18 s" (8) | Native, up to 6 shots, labelled `Shot 1:` with durations (3, 4) |
| Negative prompt | Official guide: describe the absent thing positively, "no buildings or roads" not "no man-made structures" (1). Gemini API doc lists no negativePrompt field (2) | Say "no music" etc. in audio slot (6); no dedicated field known **[verify]** | Avoid by writing the positive instead; **[verify]** if API has `negative_prompt` |
| Best at | Voice realism, ambient room tone, prompt adherence, product-in-hand ingredients | Multi-reference control, camera/motion mimicry, longer takes, staged sequences | Multi-shot coverage in one call, speaker-labelled dialogue, Element identity |

**[house rule] Engine routing** (revise from your own A/B data):
- Talking-head testimonial, hook line, close-up product-in-hand: **Veo 3.1** (8 s, avatar + product as 2 of 3 refs, third ref = room/location or second product angle).
- Demo/unboxing with several beats and hands-on motion: **Kling 3.0** multi-shot (one call = 3-6 shots, identity held by Element).
- Long take, motion-reference clones, or 15-30 s continuous sequences: **Seedance 2.x**.
- The 16 ft inflatable "reveal" wide shots: Seedance or Kling (scale + motion); Veo for the person-reacting close-ups.

---

## 2. How real creators film (what the prompt must imitate)

Synthesised from the creator-native-format guidance in (12), (13), (14) plus the engine guides' UGC examples. Pick ONE capture mode per shot and write it in:

| Mode | Prompt wording (copy-paste) | Use for |
|---|---|---|
| **Selfie-hold** | "front-camera selfie video, arm's-length, phone held in her right hand, slight handheld sway, face fills the frame from chin to forehead, wide-angle phone lens distortion" | hook, testimonial, CTA |
| **Propped** | "phone propped against a mug on the counter, locked-off, she steps back into frame, slightly off-centre, auto-exposure" | demo, unboxing, mirror-free talk |
| **POV** | "first-person point of view, her hands visible at the bottom of frame, phone held in one hand, the other hand shows the product to camera" | unboxing, assembly, close demo |
| **Friend-holds** | "filmed by a friend on a phone, steady-ish, following her, occasional zoom-in, a little shaky" | neighbour-reaction, outdoors, big inflatable |
| **Mirror/ring-light** | "bedroom, ring-light reflection in her eyes, phone on tripod at eye level" | beauty/wellness |

**Authenticity cues** (add 2-3 per shot, never all):
- room: unmade bed corner, laundry on a chair, half-drunk coffee, charging cable, real clutter, mixed warm lamp + window light
- camera: slight handheld sway, brief refocus, auto-exposure brightening when the product enters, tiny reframe after speaking, 1080x1920 phone-video softness
- performance: starts mid-thought, breath before the line, small laugh, looks at the product then the lens, a non-perfect first word ("okay so-"), no polished smile at the end
- sound: room tone, fridge hum, distant traffic, no music (music is added in post)
- wardrobe: ordinary, one specific item (grey hoodie, denim jacket), hair slightly imperfect
Avoid: studio lighting, perfect symmetry, gimbal-smooth moves, bokeh-heavy "cinema" depth, immaculate set, teeth-perfect smile held for the whole clip, text overlays inside the generation.

---

## 3. Hook science (first 2 s) — rules

From (12), (13), (14): 90% of ad recall is in the first 6 s; the hook must be creator-native (looks like feed content, not an ad); the product appears within 3 s; Meta hooks need faster clarity and qualification than TikTok; highest-converting formats are problem-solution testimonial, before/after, real-life demo, unboxing reaction; specific beats broad; judge "the first shot, not the first sentence".

**[house rule] Hook shot spec**
- 0.0-0.4 s: motion already happening (no fade-in, no pause-before-speaking)
- Word 1 spoken by 0.3 s. The line is <= 10 words.
- Product, or the effect of the product, in frame by 1.5 s
- Pattern interrupt = one of: unexpected scale, unexpected reaction, direct address with a claim, visible mess/problem, "wait what" sound
- Silent-view test: the shot must read with sound off (visual hook) AND with eyes closed (audio hook).

### Hook library (80 hooks, fill {slots})

**Problem / pain**
1. "Okay I'm so tired of {pain}."
2. "If your {thing} still {fails}, watch this."
3. "I was doing {task} wrong for years."
4. "This is what {pain} looks like at {time}."
5. "Nobody warns you about {pain}."
6. "My {person} kept complaining about {pain}, so I tried this."
7. "Stop buying {category}. Just do this."
8. "{Pain} is not normal, and this fixed it."

**Mistake**
9. "You're {verb}-ing your {thing} wrong."
10. "Don't buy a {category} until you see this."
11. "Three signs you need {product type}."
12. "The thing everyone gets wrong about {category}."

**Honest review / skeptic**
13. "I did not think this would work."
14. "Fine, the ad got me. Here's my honest review."
15. "I'm not being paid to say this."
16. "Okay it's been {N} days, here's the truth."
17. "I almost returned this. Glad I didn't."
18. "I was skeptical. I'm not anymore."

**Specific situation**
19. "It's {time}, I'm in my {place}, and look what just came."
20. "Me, {N} minutes before the guests arrive."
21. "POV: you finally have {result}."
22. "Day {N} of {routine} with this."
23. "Every {role} needs this one thing."

**Visual / no-speech openers** (use speech after 2 s)
24. Product doing its strongest thing in the first frame (inflation, glow, chill, snap).
25. Hand slaps a mess onto the camera, then wipes it away.
26. Before/after split by a hand sweep or a wipe.
27. The box is already half-open, a gasp from off-screen.
28. A neighbour stops walking and stares.
29. Phone camera pans fast from a normal yard to the product.
30. Scale reveal: person walks under or next to the product.

**Curiosity / claim**
31. "This costs {price} and looks like {price x10}."
32. "I found the {category} everyone's hiding."
33. "Wait for it."
34. "{Number} people asked me where I got this."
35. "My neighbours are going to hate me. In a good way."
36. "This is the sign to {action}."
37. "You'll want this before {date/event}."
38. "I can't believe this is real."

**Social proof / reaction**
39. "{Neighbour} literally stopped his car."
40. "The kids saw it and lost it."
41. "I've had {N} comments already."
42. "Reply to {commenter}: yes it works, watch."
43. "Okay everyone asked, here it is."

**Urgency / seasonal**
44. "It's {month}, you're still not ready?"
45. "These sold out last year in {N} days."
46. "If you want it before {date}, order today."

**Comparison**
47. "I tried the {price} one and the {price} one. Look."
48. "Side by side, you tell me."
49. "Before I found this, I used {old way}."

**Transformation**
50. "My {place} 5 minutes ago vs now."
51. "Watch me go from {state} to {state}."
52. "This took 2 minutes, no tools."

**Identity**
53. "For anyone who {identity trait}."
54. "Every {mom/dad/renter/gardener} needs to see this."
55. "If you live in {type of place}, listen."

**Price / offer**
56. "I paid {price} and I'd pay triple."
57. "It's on sale and I'm only telling you."
58. "Free shipping and it came in 3 days."

**Demo-in-motion**
59. "Watch this. No setup."
60. "Plug it in, don't touch anything, watch."
61. "Ten seconds. Ready. Look."
62. "One button. That's it."

**Emotion**
63. "I just cried a little. Sorry."  *(allowed only in character speech — never customer-facing apology copy)*
64. "My husband said 'you're insane' and then he loved it."
65. "Honestly the best {price} I've spent."
66. "I am not exaggerating."

**Open-loop**
67. "So this happened."
68. "Guess what came today."
69. "I need to talk about this."
70. "I said I'd never buy one of these."

**Halloween-specific (inflatable)**
71. "The whole street stopped at my house."
72. "My yard last year vs this year."
73. "16 feet. Sixteen. Look at it."
74. "Trick-or-treaters are going to run."
75. "Neighbour just walked over to ask where I got it."
76. "Set up in five minutes, my kids are screaming."
77. "Okay, Halloween is won."
78. "Your yard is boring and this fixes it."
79. "It lights up at night. Watch."
80. "I'm that house now."

**Note on customer-facing copy:** never include "sorry", "unfortunately", "we hope", hedges in any line the viewer hears or reads (Alex's rule). Lines are confident.

---

## 4. Consistency system (person + product across shots)

**[house rule] The Continuity Block** — a fixed text block pasted verbatim into every shot prompt for one ad:

```
CHARACTER: the woman from @avatar (late 20s, shoulder-length wavy dark-brown hair, olive skin, small gold hoop earrings, light-grey crewneck sweatshirt). Same face, hair, outfit in every shot.
PRODUCT: the exact product from @product (read colours, shape, label from the image; do not redesign, do not add logos or text that are not in the image).
PLACE: {location sentence}, {light sentence}.
CAPTURE: {capture mode wording from section 2}.
```

Rules, with reasons:
1. Image refs carry identity; text carries wardrobe + location only. Never re-describe the face differently between shots (contradictory appearance is a listed failure for Kling (5)).
2. Same wardrobe sentence verbatim every shot; change wardrobe only at an intentional "next day" cut.
3. Same location noun for all shots in one ad ("the kitchen" never "the apartment" in shot 3).
4. **Product canonical views**: supply 2-3 product images (hero angle, in-use angle, close-up of label/detail). Veo allows 3 refs total, so for Veo: avatar + hero product + one detail/in-use = 3 (2). Seedance/Kling allow more (7, 8, 5): add a second angle and a scale reference (the product next to a person for the 16 ft piece).
5. **Scale**: always write the size in human terms in the prompt ("taller than the garage roofline, about 16 ft, three times the woman's height") — models otherwise shrink big products.
6. **Seedance reference strength**: keep ~70-80%; 90-100% makes cardboard faces, under 60% drifts (6) **[verify]** whether the API exposes it.
7. **Frame-chaining** (strongest consistency for stitched ads): take the LAST frame of clip N as the first-frame / reference image for clip N+1 (Veo supports first/last frame (1); Kling and Seedance image-to-video "treat input images as anchors" (3)). Use this whenever the cut is a continuous action.
8. **Hands**: write "natural hands, five fingers visible, holding the product by its {part}". Do not ask for fine finger choreography in a second beat of the same shot.
9. **Don't over-describe** the face: one sentence. More words, more drift.
10. If a take shows a wrong logo/label/colour, **regenerate, don't patch in the prompt**; add one concrete sentence ("the box lid is matte white with a single orange stripe") only if it repeats.

---

## 5. Per-engine prompt templates

### 5.1 Veo 3.1 template (8 s, reference-image mode)

Formula (1): `[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]`, then audio lines.

```
{CAPTURE MODE, e.g. "Front-camera selfie video, arm's-length, slight handheld sway, phone-camera softness"}.
{SUBJECT: "The woman from the first reference image"} {ACTION with a physical verb chain: "holds up the {product from the second reference image} next to her face, turns it to show the {feature}, then looks at the lens"}.
{CONTEXT: place + light, one sentence}. {STYLE: "Unpolished iPhone 15 look, natural window light, true-to-life colour, no filter"}.
She says in a {tone: "relaxed, slightly amused"} voice, "{LINE, 8-18 words}".
Ambient noise: {room tone}. SFX: {1-2 sounds}.
```

Timestamped variant for 3 beats in 8 s (1):
```
[00:00-00:02] {shot A, hook, spoken line}
[00:02-00:05] {shot B, demo}
[00:05-00:08] {shot C, reaction or CTA line}
```
Veo rules:
- Dialogue always in quotes after "says"; do not write "subtitles" or "caption" (risks burned-in text). Put "No subtitles, no on-screen text." as a positive-form cue is not guaranteed; if text appears, regenerate. **[house rule]**
- Name the reference by role ("the woman from the first reference image"), as in the official Ingredients example (1).
- Ask for less rather than more: 1 line of speech, 2 beats max.
- Do not use negative lists. Official guidance: say what you want present (1).

### 5.2 Seedance 2.0 / 2.5 template

Five slots, 60-100 words (6): Subject, Action, Scene, Camera (one move), Style/Audio.

```
@Image1 = the creator (face, hair, outfit; hold across all shots). @Image2 = the product (shape, colour, label exactly; do not alter).
{SUBJECT: creator + 1-2 attributes} {ACTION: verb chain with consequence: "lifts the product out of the box, the lid drops to the counter"}.
{SCENE: place + light, one sentence}.
Camera: {ONE move: "handheld selfie framing, slow push-in ending on medium close-up"}.
Style: unpolished phone-video look, natural light. Audio: {2.5 notation} {She says in English, relaxed: {line}} <room tone, lid thud> no music.
```
Seedance rules:
- Do **not** write aspect ratio, resolution or duration in the prompt; use the API controls (8).
- 2.5 audio tags: `{dialogue}`, `<sfx>`, `( music )` — write "no music" explicitly to avoid score (6, 8). 2.0 route: spoken text as quoted voiceover; **[verify at integration]** which notation the chosen provider route accepts.
- For >8 s: staged ranges, each stage = one state change, end each with a visible state the next continues (8):
  `0-4s: ... Cut to. 4-9s: ... Cut to. 9-15s: ...`
- Verbs beat adjectives (6). Give every emotion a visible trigger (8).
- Assume not every reference appears in every scene: say which image is in which stage (8).
- Mixed languages garble text; speak one language (6).

### 5.3 Kling 3.0 template (multi-shot)

Master prompt + labelled shots (3, 4, 5).

```
MASTER: {CONTINUITY BLOCK, shortened to 2 sentences}. Unpolished phone-video look, natural light, handheld, room tone.
Shot 1 (3 s): {framing + camera intent}. {Creator} {one action}. [Creator, {voice tone}]: "{line}"
Shot 2 (4 s): {framing + camera}. {action on product}. SFX: {sound}.
Shot 3 (3 s): {framing + camera}. {action}. [Creator, {tone}]: "{line}"
```
Kling rules:
- Anchor the subject in the first lines; use the Element's name consistently, no pronouns/synonyms (3).
- Action before dialogue; label the speaker with a tone: `[Creator, warm amused voice]: "..."` (3, 4).
- Linking words for timing: "Immediately", "Then", "Pause" (3).
- If the Element has a bound voice, do not add a conflicting tone every shot (5).
- Max total plausible action for the length; 3-15 s; up to 6 shots (3, 4, 5).
- Do not mix pan + orbit + zoom + drone within one shot (5).
- Image-to-video: describe what **evolves from** the image, not what is already in it (3).

---

## 6. Negative / avoid lists (per engine)

Positive-form substitution is the mechanism: write the thing you want where the unwanted thing would be (1).

**Veo 3.1 avoid**
- Vague negatives ("no weird stuff"); write concrete presence instead (1).
- Long monologues (>18 words in 8 s): speech gets rushed or cut.
- Requests for legible price/URL/fine print on screen (garbles on Veo (6)).
- More than 3 reference images (hard limit) and any clip not 8 s in reference mode (2).
- Camera stacks (dolly + crane + orbit) in one 8 s block.
- "Subtitles" wording (can render text).
- Celebrity or real-person likenesses; brand-name film characters. Describe by looks.

**Seedance avoid**
- More than ~8 requirements (4-5 get honoured at random) (6).
- Naked @references with no job sentence (6).
- Two camera moves in one clip (6, 8).
- Restating aspect/duration/resolution in text (8).
- Reference strength 90-100% or <60% (6).
- Vague mapping ("images 1-4 are the four people respectively") (8).
- Emotion labels without visible behaviour (8).
- Three locations in 5 s: smeared morphing (6).
- Mixed-language prompts when speech/text matters (6).

**Kling avoid**
- Vague motion ("moves around") — use explicit camera verbs (3).
- Inconsistent character labels across shots (3, 4).
- Ambiguous dialogue attribution (3).
- Compressing the story into one paragraph (3).
- Contradictory appearance language; relying on adjectives for identity (5).
- Generic voice cues ("normal voice") (3).
- Trusting it to render critical logo/copy text (5).

**All engines, UGC realism**
- "cinematic", "8K", "epic", "stunning", "masterpiece" (weak prompt in 6).
- Perfect skin / beauty-filter language; studio lights; gimbal-smooth motion.
- Product morphing during rotation: keep rotations under 90° per shot **[house rule]**.
- Medical, before/after body, or "cures" claims in speech (ad-policy rejection).
- Unverified superlatives in speech ("#1 in the world").

**Content rules (hard)**
- Never depict robed, hooded figures in a way that resembles hate-group imagery. For Halloween, use: bare skeleton, pumpkin, spider, ghost-sheet-free designs, monsters; **no hooded robe designs, no white pointed hoods, no cloaked figures with hoods**.
- Describe products by looks and colours only. Do not name film/TV characters, franchises or brands in prompts.
- No real-person likeness beyond the user's own consented avatar.

---

## 7. Shot-list grammar

Each shot line in the lists below uses: `# · duration · engine · capture · camera · action · line · sound`.

Pacing law **[house rule]** derived from (12)(13): average cut every 2-4 s in a 15-30 s ad; hook <=3 s; demonstration 40% of runtime; proof/reaction 25%; CTA 10-15%; last frame holds the product 1 s for the end card (added in post).

Engines are chosen per shot. "V" = Veo (8 s, refs), "K" = Kling multi-shot, "S" = Seedance.
Product placeholders: `{INFL}` = **16 ft inflatable**: "a 16 ft (about 5 m) tall inflatable Halloween skeleton with a bare white bone body, glowing orange eyes and a wide toothy grin, standing in a front yard, taller than the garage roofline". `{GEN}` = general product in the fill-in slot. Avatar = `{CREATOR}`.

---

## 8. Ten worked shot lists

### 8.1 Demo — "Look how fast it goes up" (inflatable, 24 s, 3 clips)
Goal: prove setup is easy.
1. **V · 8 s** · Propped phone at driveway edge, slight sway. {CREATOR} stands beside a flat black bag on the lawn. *Hook:* "Okay watch, five minutes and my whole yard changes." She presses the fan switch; the fabric lifts. SFX: fan whir, fabric rustle. Ambient: dusk crickets.
2. **K · 8 s (3 shots)** · Shot 1 (2 s) low angle on the inflatable rising from the grass, camera tilting up. Shot 2 (3 s) friend-holds, {CREATOR} steps back with hand over mouth, "No way it's already this big." Shot 3 (3 s) {INFL} fully upright, camera locked, eyes glow on as dusk deepens.
3. **V · 8 s** · Selfie, {INFL} behind her. "Sixteen feet. Took me five minutes and one outlet." She taps the glowing eyes. CTA line: "Link's below, they sell out every October." (Add price/URL in post.)
Stitch: clip1 last frame → clip2 first frame (fan on, fabric up). Match-cut on the rising motion.

### 8.2 Unboxing — "It came today" (general, 20 s)
1. **V · 8 s** · POV, hands over a box on the floor. "Guess what came today." Hands cut tape with scissors. SFX: tape rip, cardboard crackle.
2. **S · 8 s** · Same POV, she lifts {GEN} out, turns it once (<=90°) to show the {feature}, sets it down on the table. Camera: static POV, hands only.
3. **V · 4 s (6-s min? use 6)** · Selfie, genuine reaction smile: "Okay, it's actually better than the pictures."
Stitch: hard cut on the lift motion; room tone continuous.

### 8.3 Testimonial / problem-solution — "I was doing it wrong" (general, 30 s, 4 clips)
1. **V · 8 s** · Selfie, tired, kitchen morning. Hook: "I was doing {task} wrong for years." Gestures at the old way on the counter.
2. **K · 8 s (3 shots)** · Problem cutaways: old way fails (close-up), her sighing (medium), the box arrives (close-up).
3. **V · 8 s** · {GEN} in use, propped phone. "Then I tried this." Visible result.
4. **V · 6-8 s** · Selfie, calm: "{N} weeks later I use it every day. Link below." (Duration 8 s if refs used.)
Stitch: A/B music bed added in post; keep the voice room tone constant.

### 8.4 Neighbour reaction — "The whole street stopped" (inflatable, 24 s)
1. **K · 8 s (3 shots)** · Friend-holds, night. Shot 1: pan from the street to {INFL} lit orange. Shot 2: a man in a puffer jacket stops mid-walk with a dog, mouth open. Shot 3: {CREATOR} grinning: "Fifth person tonight."
2. **V · 8 s** · Over-the-fence two-shot. Neighbour (generic, adult, unnamed, no avatar ref needed or a second avatar): "Where did you even get that?" {CREATOR}: "Link's in my bio." (Two speakers: label them in the prompt, e.g. "the man says ... Then the woman says ...".)
3. **S · 8 s** · Kids in costumes run across the lawn, one pauses and points up at the {INFL}'s eyes. Handheld, filmed from the porch.
Note: neighbour generation uses different faces each clip; keep neighbour shots short and off-hero, or generate the neighbour once and reuse as a second reference (Veo's third slot).

### 8.5 POV assembly — "Zero tools" (inflatable, 20 s)
1. **S · 8 s** · POV, hands pull a folded mass of black-and-white fabric from a bag, spread it on grass. Audio: bag zip, fabric slide.
2. **S · 6 s** · POV, plug into outlet, thumb presses switch. Fabric lifts, shadow spreads across lawn. Camera static.
3. **V · 6-8 s** · Selfie in front of the fully inflated {INFL}: "Done. That's it. Zero tools."
Stitch: continuous action; use frame-chaining at 1->2.

### 8.6 Day vs night reveal (inflatable, 15 s)
1. **S · 8 s** · Locked-off phone on tripod, daylight yard with {INFL} standing, slight wind sway of the fabric, {CREATOR} walks in, scale against her. Speech: "Here it is in the daytime. Not bad."
2. **S · 7 s** · Same frame, light fades to blue dusk; eyes and internal LEDs glow orange, fog around the base. She whispers: "And now at night."
Stitch: both use the same first-frame reference (clip 1 frame at 0 s). Cross-dissolve not needed; hard cut with a whoosh.

### 8.7 Skeptic to believer — "Fine, the ad got me" (general, 24 s)
1. **V · 8 s** · Selfie in car, parked. "Fine. The ad got me. Here's my honest review."
2. **K · 8 s (3 shots)** · Unbox quick-cuts, first use, result.
3. **V · 8 s** · Selfie, home: "I was wrong. It actually works." Holds {GEN}.
Stitch: wardrobe changes only if shot 3 is "next day" (write it).

### 8.8 Comparison — "Mine vs everyone else's" (inflatable, 20 s)
1. **V · 8 s** · Selfie in front of a small 4 ft store-bought inflatable (generic described by looks). "This is what everyone buys."
2. **S · 6 s** · Camera pans right to the {INFL} towering beside it. "And this is mine."
3. **V · 6-8 s** · Selfie: "Same price. Triple the height. Link below."
Stitch: pan end frame = clip 3 first frame via reference.

### 8.9 Gifting / reaction — "I surprised my kid" (general, 20 s)
1. **V · 8 s** · Friend-holds filming a child (generic, face not required, back-of-head or side) opening a box. "Okay open it!" SFX: paper, a gasp.
2. **K · 6 s (2 shots)** · Close on hands, product revealed; child's delighted hands grab it.
3. **V · 6-8 s** · Selfie, parent: "Best {price} I've spent this year."
Policy note: do not generate close identifiable faces of minors; use hands, back of head, silhouettes. **[house rule]**

### 8.10 Before/after transformation — "Five minutes later" (general or inflatable, 20 s)
1. **S · 6 s** · Locked-off phone, bare yard: grey grass, trash bin. Voice: "My yard at 6 pm."
2. **V · 8 s** · Selfie hand-sweep wipe transition revealing the same yard with {INFL} standing: "My yard at 6:05."
3. **S · 6 s** · Slow walk toward the inflatable, touch its foot; eyes glow.
Stitch: the same first-frame reference for clips 1 and 2 background = identical yard (provide a yard photo as a location reference; Veo ref slot 3).

---

## 9. Stitching rules

1. **Cut on action.** End each clip mid-motion (hand reaching, fabric rising) and start the next mid-motion. Never end on a held pose and cut to a held pose.
2. **Trim 0.15-0.3 s** from the head and tail of every generated clip (engines ease in/out and breathe). **[house rule]**
3. **Audio first.** Lay room tone as a constant bed under all cuts; each generated clip has its own tone and level, so normalise to the same LUFS and cross-fade tone 80-120 ms. Add music in post at -22 dB below voice.
4. **Keep the voice the same.** Veo/Kling/Seedance voices differ per engine. Mixing engines across the same speaker is the loudest seam. **Rule: one speaker, one engine per ad** unless a voice-conversion pass is applied. B-roll shots (no speech) can be any engine.
5. **Colour match** all clips to one reference frame; engines grade differently (Veo cooler, Seedance warmer **[observed claims vary; confirm on A/B]**). Apply one phone-like LUT to all, plus 1-2% grain for unity.
6. **Eyeline / screen direction**: keep the creator looking the same direction across shots; jump cuts allowed in selfie speech (that is native to UGC).
7. **Frame-chaining** whenever consecutive shots are the same moment (section 4 rule 7).
8. **Captions in post**, not generation. 2-3 words per second visible, bold sans, safe zone: 150 px top, 270 px bottom of 1080x1920 for UI.
9. **Length budget**: hook 0-3 s, value 3-15 s, proof 15-25 s, CTA last 5 s (13). A 30 s ad = 4 clips of 8 s trimmed to ~7.2 s each.
10. **Seam audit** before export: check face, product colour/label, clothing, background objects across each cut; reject and regenerate the offending clip, do not stretch.
11. **Version for test**: export 3 different hooks (clip 1 only changes) with the same body: that is the cheapest split test (14).

---

## 10. Quick-fill cheat sheet

Hook line (<=10 words) · capture mode · place+light · avatar sentence (fixed) · product sentence (fixed) · scale sentence · ONE action verb chain · ONE camera idea · room tone + 1 SFX · "no music" · line <=18 words.

If a take fails: (1) wrong face → check reference slot order and strength; (2) wrong label → add the exact colour sentence; (3) too polished → add two clutter cues and remove "cinematic"; (4) lips off → shorten the line; (5) product tiny → add scale sentence in human terms; (6) jitter → delete the second camera move.

---

## 11. Sources

1. Google Cloud, "Ultimate prompting guide for Veo 3.1" — https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1 (formula, dialogue/SFX/Ambient syntax, timestamps, Ingredients, first/last frame, negative-prompt advice).
2. Google AI for Developers, Veo 3.1 API docs — https://ai.google.dev/gemini-api/docs/veo (up to 3 reference images; 8 s required for reference images; 9:16 and 16:9; durations 4/6/8; allow_adult).
3. fal.ai, "Kling 3.0 Prompting Guide" — https://blog.fal.ai/kling-3-0-prompting-guide/ (multi-shot syntax, speaker/tone syntax, avoid list).
4. Search-result summary of multi-shot and dialogue guides for Kling 3.0 (videoai.me, atlabs.ai, morphic.com) — https://videoai.me/blog/kling-3-0-prompt-guide , https://www.atlabs.ai/blog/kling-3-0-prompting-guide-master-ai-video-generation , https://morphic.com/resources/how-to/kling-3.0-guide (up to 6 shots, one action + one camera intent per shot, name speaker and exact line).
5. Magic Hour, "Kling 3.0 Reference Guide" — https://magichour.ai/blog/kling-30-reference-guide (Elements from 2-4 images, voice binding, 3-15 s, what to avoid).
6. heyuan110, "Seedance 2.0 Prompt Guide: Best Practices & Failure Modes" — https://www.heyuan110.com/posts/ai/2026-07-11-seedance-2-prompt-guide/ (five-slot template, 60-100 words, one camera move, reference strength 70-80%, failure modes).
7. Magic Hour, "Seedance 2.0 Reference Guide" — https://magichour.ai/blog/seedance-20-reference-guide (9 img / 3 video / 3 audio, @ tagging, 4-5 assets work best).
8. ClipDance, "Seedance 2.5 Prompt Guide" — https://clipdance.ai/blog/seedance-2-prompts-guide (2.5: 4-30 s, 30 images, audio notation {} <> ( ) 【】, staged ranges, avoid list). Third-party summary of the official Dreamina workflow; **[verify at integration]** against ByteDance/BytePlus API docs.
9. Also consulted (not quoted): Runway Seedance 2.0 guide https://runway.com/resources/seedance-2-0-prompt-guide ; invideo https://invideo.io/blog/seedance-2-0-prompt-guide/ ; DreamHost Veo guide https://www.dreamhost.com/blog/veo-3-1-prompt-guide/ ; fal Veo 3 guide https://fal.ai/learn/devs/veo3-prompt-guide-master-google-video-generation .
12. Vidovo, "UGC Hook Examples" — https://www.vidovo.com/blog/ugc-hook-examples-how-brands-can-create-better-ugc-ads-in-the-first-3-seconds (hook types, specificity, first shot over first sentence).
13. Hustler Marketing, "The First 3 Seconds: UGC Ad Hooks" — https://www.hustlermarketing.com/blog/how-to-write-ugc-ad-hooks-that-stop-the-scroll-on-meta-and-tiktok/ ; Creative Milkshake https://www.creativemilkshake.com/blog/ugc-hooks-for-meta-and-tiktok (2-3 s to earn attention, Meta vs TikTok differences).
14. Structure and format conversion guidance (hook 0-3 s, value 3-15 s, proof 15-25 s, CTA last 5 s; problem-solution, before/after, demo, unboxing): search-result synthesis from myugc.studio https://myugc.studio/blog/ugc-video-ads-tiktok-hooks-angles-creative-matrix.html , mbadv https://www.mbadv.agency/tiktok-ads/creative-best-practices , conbersa https://www.conbersa.ai/learn/tiktok-ad-creative-best-practices .

Limits of the research: vendor guides describe consumer/UI behaviour; API field names, Seedance 2.5 audio notation on the chosen provider route, and any negative-prompt field must be confirmed when the API calls are wired. Everything marked **[house rule]** is a production default to be tuned on real A/B results.

---

## 12. PROMPT-UNDERSTANDING LAYER ("Real life, real life, real life")

Alex: the videos advertise and make money, so the machine must understand the prompt deeply, take care of every micro detail, and keep a physical, natural flow of real life. **Nothing goes to Veo, Seedance or Kling until a SHOT SPEC exists and passes the self-check (12.5).** The engine prompt (sections 5-6) is a *rendering* of the spec, never a rewrite of Alex's sentence.

Pipeline: `raw scene (1-2 sentences) -> 12.1 parse -> 12.3 contradictions/gaps -> (max 2 questions to Alex) -> SHOT SPEC (12.2) -> 12.5 self-check -> 12.6 render per engine -> generate -> 12.7 post-check`.
This is **[house rule]**; it applies the engine guidance in section 11 (one action and one camera idea per shot (4), verbs and physical consequences over adjectives (6), visible triggers for emotion (8), references with explicit jobs (6, 8)).

### 12.1 What the parser does with the raw sentence
1. Extract: product, person, place, action, mood, duration, ad type (demo / unboxing / testimonial / reaction), any quoted speech.
2. Pull product facts from the product record + reference images (never from the sentence alone); pull person facts from the avatar record.
3. Split the action into **atomic beats** (one verb chain each, 1-4 s) and attach physical cause-and-effect to every beat.
4. Detect contradictions and gaps (12.3).
5. Apply safe defaults (12.4), then write the spec.

### 12.2 SHOT SPEC schema (every field mandatory; "n/a" must be justified)

```
SPEC_ID / AD_TYPE / ENGINE_PLAN (which engine per shot, from section 1 routing)

1 GOAL
  ad_goal:        what the ad sells and to whom
  viewer_action:  the ONE thing the viewer should do (tap link / buy before date)
  hook_type:      from section 3 library (# number)

2 PRODUCT FACTS (IMMUTABLE — copied verbatim into every shot)
  shape / silhouette, size in cm AND in human terms ("16 ft = 4.9 m, about 2.7x a 1.8 m adult"),
  colours (named), materials/finish, parts (fan, tether stakes, cable, plug, button),
  how it is used (step order), power / what must be on, what it must NEVER do,
  label/logo = only what is in the reference image (never generated)
  look_description: by shape and colour only (never a film/franchise name)

3 PERSON FACTS (IMMUTABLE)
  age band, build, skin/hair/eyes, one wardrobe sentence (verbatim every shot),
  accessories, avatar_ref id, voice descriptor, same person across all shots = yes

4 SETTING
  place (one noun, constant), time of day, season, weather, light source & direction,
  colour temperature, background objects (3 specific, stable), who is NOT present

5 CAMERA
  phone model look (e.g. "iPhone 15 main camera, 1x, 24 mm-equivalent look, slight auto-exposure hunt"),
  capture mode (selfie / propped / POV / friend-holds), hold (handheld sway amplitude low/med),
  movement (ONE per shot), framing, lens look, aspect 9:16 (set in API, not in prompt)

6 TIMELINE (seconds, beat by beat). For every beat:
  t_start-t_end | who does what | PHYSICS: what touches what, direction of force, weight,
  gravity, timing of cause then effect | camera state | visible emotional trigger

7 SOUND per beat: speech, room tone, 1-2 SFX tied to the physical event (not generic), music = none

8 SPOKEN LINE: verbatim, language, who, delivery, <= 18 words per 8 s, no apologies/hedges

9 ON-SCREEN TEXT: none inside the generation unless Alex asked; if asked, exact characters, timing,
  position, and rendered in post by default

10 FORBIDDEN LIST (always printed into the spec; see 12.2a)

11 CONTINUITY: first-frame ref (if chained), last-frame hand-off state, what the next shot inherits
```

**12.2a Standing FORBIDDEN list (appended to every spec; extend per job)**
- crowds, extra people, bystanders, pets, children's faces — unless Alex asked (then list each by role, count, and position)
- captions, subtitles, watermarks, UI overlays, price/URL text inside the generation unless asked
- any logo, brand mark or label not present in the product reference image
- hateful, cult-like or extremist imagery; robed or hooded figures; white pointed hoods; cloaked ritual figures; flags/symbols of any group
- famous film/TV characters, franchises or celebrities, by name or lookalike
- changing the product (shape, colour, size, parts, label) between shots
- second camera move in one shot; cinematic grading words; beauty-filter faces
- medical/cure/guarantee claims; unverified superlatives
- music in the generation (added in post)
- anything physically impossible for the product (an inflatable standing unsupported before the fan runs, a plugged-in product with no cable, a box that opens itself)

### 12.3 Contradiction detection and resolution

Run these checks on the raw sentence + records. **Rule of resolution:** the latest and most specific instruction wins; state the resolution in one line in the spec's `notes`; ask Alex only when the choice changes what he is paying for.

| # | Contradiction pattern | Example | Resolution |
|---|---|---|---|
| C1 | Duration vs content | "unbox, assemble, demo and reaction in 8 s" | split into 2-4 clips or cut beats; one state change per beat; default 1 beat per 2 s |
| C2 | Scale vs setting | "16 ft inflatable on a balcony" | flag: scale cannot fit; move to yard/driveway, or change product size; **ask Alex** (this is a Q) |
| C3 | Time of day vs light | "at night, sunny" | pick night (lighting words follow the time), note it |
| C4 | Capture mode vs action | "selfie video while assembling with both hands" | switch to propped or POV |
| C5 | Reference vs text | avatar ref is brunette, prompt says "blonde" | reference wins for identity; ask only if blonde is the intent |
| C6 | Product facts vs prompt | prompt says "red", product record says "white/black" | product record wins; flag |
| C7 | Speech vs length | 40-word script for 8 s | trim to <= 18 words or split across clips; keep Alex's key phrase |
| C8 | Number of people | "family reacting" with 1 avatar | forbidden-list conflict: crowds only if asked; "family" = request, so count them and generate as separate off-hero shots |
| C9 | Physics | "inflatable stands up instantly" | the fan runs ~3-6 s to fill: write the fill; inflatable does not stand before airflow |
| C10 | Camera stack | "orbit while zooming and dolly" | one move; the rest becomes separate shots |
| C11 | Mood vs line | "angry" + "I love it" | map to visible triggers; pick delivery that matches the line |
| C12 | Safety/content | hooded cloak design asked for | switch to a bare/skeleton/pumpkin/ghost-free design; say so in one line |
| C13 | Text asked on screen | "show price on the video" | render in post; engine prompts leave the text out |
| C14 | Season vs date | "snow, Halloween" | possible; keep, but check light and costume realism |

### 12.4 Ask vs default

**Ask Alex at most 2 questions, only for things that change cost or meaning, never for taste.** Format: one line each, with a recommended answer already chosen ("Reply Y to use it").
Ask when: (a) the scale/setting is impossible (C2); (b) the speaker/avatar is unspecified and there are several avatars; (c) the claim or price in the speech is not in the product record; (d) the target engine/length would exceed budget.
Everything else is filled with defaults and listed in `notes`:

| Missing | Safe default |
|---|---|
| duration | 8 s per clip, 24 s ad = 3 clips |
| capture | selfie for speech, POV for hands-on |
| time of day | late afternoon golden window light (indoor) / dusk (Halloween, lights on) |
| location | the product's natural place (yard/driveway for inflatables, kitchen/living room otherwise) |
| wardrobe | the avatar record's default outfit sentence |
| language / voice | English (US), relaxed, slightly amused |
| speech | one hook line from section 3 matched to the ad type |
| music / text | none in generation; both added in post |
| extra people | none |
| camera move | static handheld sway; one slow push-in at most |
| sound | room tone + one SFX tied to the main physical event |

### 12.5 Self-check the spec must pass (all yes, or fix; log the result)
1. Is the goal one viewer action, and does shot 1 show the product or its effect within 3 s?
2. Are product facts copied from the record, with size in human terms, and does every shot contain the same product sentence?
3. Is the person's wardrobe sentence identical in every shot, and is the avatar ref attached with a job sentence?
4. Is there ONE place, ONE time of day, and one stable light direction across the ad?
5. Is there exactly ONE camera move per shot, and does the capture mode make physical sense for the action (can the hand that holds the phone also do the action)?
6. Does every beat have a physical cause then effect, in time order, with plausible timing (inflation 3-6 s, fabric lag, weight)?
7. Does the hand-off at every cut (position, motion, product state) match the next shot's opening?
8. Is the spoken line verbatim, <= 18 words per 8 s, free of apologies/hedges, and does each word have a visible/audible moment?
9. Are sound effects tied to physical events and is music "none"?
10. Is on-screen text "none" unless asked, and logos only from the reference?
11. Is the FORBIDDEN list printed and are all its items absent from the beats?
12. Total words in each engine prompt: Seedance 60-100; Veo 60-120 plus dialogue; Kling master 2 sentences plus shots.
13. Are the number of people, props and locations the minimum needed?
14. Does the natural-flow test pass: read the beats as a film of a real afternoon, and nothing happens without a cause?

### 12.6 Worked examples (raw -> spec -> engine prompts)

**Example A — raw: "girl shows the Halloween skeleton going up in her yard, she's excited"**

SHOT SPEC (excerpt of mandatory fields):
- Goal: sell {INFL}; viewer taps link before Halloween; hook #73 "16 feet. Sixteen. Look at it."
- Product: 16 ft (4.9 m) tall inflatable skeleton, white bone body, glowing orange eyes, wide toothy grin, black base skirt, internal fan hose at the back, 4 ground stakes with rope tethers; stands only when the fan runs; about 2.7x a 1.8 m adult; no robe, no hood, no logos.
- Person: {CREATOR}, 27, wavy shoulder-length dark-brown hair, light-grey crewneck sweatshirt, small gold hoops; same face in every shot.
- Setting: front lawn of a suburban house, dusk, warm porch lamp left, blue sky right; garage door and a trash bin in the background; nobody else.
- Camera: propped phone, 1x, low on a flowerpot, slight sway; one slow tilt-up.
- Timeline: 0-1 s she steps into frame holding the plug: "Sixteen feet. Watch." | 1-3 s she plugs into the outdoor outlet, hand on the switch (touch: thumb presses, fan whirs on) | 3-6 s fabric lifts from a pile on the grass; the head rises first, arms swing up and sway; rope tethers go taut one by one | 6-8 s the eyes glow orange; she steps back, looks up, grins: "Look at it!"
- Sound: fan whir rising, fabric flutter, rope creak, crickets; no music.
- Line: "Sixteen feet. Watch... Look at it!" (7 words).
- Text: none. Forbidden: standing list.
Self-check result: C9 resolved (fill 3 s), C4 resolved (propped, not selfie).

*Veo 3.1 prompt (8 s, refs: creator, product, yard):*
```
Phone propped low on a flowerpot at dusk, locked-off with slight handheld sway, one slow tilt up. The woman from the first reference image (grey crewneck sweatshirt, gold hoop earrings) steps into frame holding an extension plug and says, "Sixteen feet. Watch." She plugs it into the outdoor outlet and presses the switch with her thumb; the fan whirs on, the inflatable skeleton from the second reference image, a pile of white fabric on the grass, lifts head first, arms swinging up, tether ropes pulling taut one by one until it stands 16 ft tall, orange eyes glowing. She steps back, looks up and says, "Look at it!" Front lawn, warm porch lamp, blue sky, garage door behind. Unpolished iPhone look. Ambient noise: crickets. SFX: fan whir rising, fabric flutter, rope creak. No music, no text.
```
*Seedance 2.x/2.5 prompt (8 s):*
```
@Image1 = the woman (face, hair, outfit; hold in all shots). @Image2 = the inflatable skeleton (shape, colours exactly; do not add logos).
She plugs a cord into an outdoor outlet and presses the switch; the white fabric pile on the grass fills, rising head first, arms swinging up, tether ropes tightening, until it stands 16 ft tall with glowing orange eyes. Front lawn at dusk, warm porch lamp. Camera: propped phone, one slow tilt up, ending on the full figure. Phone-video look. {She says in English, excited: Look at it!} <fan whir, fabric flutter, rope creak, crickets> no music.
```
*Kling 3.0 (multi-shot, 8 s):*
```
MASTER: The creator (grey crewneck, gold hoops) and the 16 ft inflatable skeleton with orange glowing eyes, front lawn at dusk, unpolished phone video, handheld, no music.
Shot 1 (3 s): wide static, she plugs in and presses the switch, fan whirs on, fabric lifts. [Creator, calm excited voice]: "Sixteen feet. Watch."
Shot 2 (3 s): low angle tilt up as the skeleton rises head first, tethers going taut. SFX: fan, fabric flutter, rope creak.
Shot 3 (2 s): medium, she steps back and grins up at it. [Creator, delighted voice]: "Look at it!"
```

**Example B — raw: "unbox the product and say it's better than the pictures"** (general product, kitchen)
SPEC highlights: POV for the unbox, selfie for the line; kitchen counter, morning window light left; box size from record; beats: 0-2 s knife slits tape (blade cuts, flaps spring up) | 2-5 s hands lift product out of foam (weight: two-handed, slight dip) | 5-8 s selfie, small smile, "Okay, it's actually better than the pictures." Forbidden: captions, extra people, logo not on box. Contradiction: POV + selfie in one 8 s clip -> two-shot split (resolved, noted). Defaults used: English, relaxed.
*Veo:* `POV first-person video, her hands visible, phone in one hand, kitchen counter, morning window light from the left. Her free hand slits the tape with a knife and the flaps spring up; both hands lift the {product look from reference} out of the foam, slight dip from its weight. Cut to front-camera selfie, she smiles and says, "Okay, it's actually better than the pictures." Ambient noise: fridge hum. SFX: tape rip, cardboard crackle. No music, no text.`
*Seedance:* `@Image1 = creator, @Image2 = product exactly. POV, her hands slit the tape, lift the product from foam (two-handed, slight dip), set it on the counter. Kitchen, morning window light. Camera: static POV. {She says: Okay, it's actually better than the pictures.} <tape rip, cardboard crackle> no music.`
*Kling:* `MASTER: creator ({wardrobe}), {product look}, kitchen, morning window light, phone video. Shot 1 (3 s): POV, hands slit the tape. Shot 2 (3 s): POV, two hands lift the product out of the foam. Shot 3 (2 s): front-camera selfie. [Creator, relaxed voice]: "Okay, it's actually better than the pictures."`

**Example C — raw: "the neighbour sees the 16 ft inflatable and loves it"** (reaction)
Contradiction C8: "neighbour" = a second person, allowed because Alex asked (count: 1 adult man, off-hero, filmed from behind/side). C3: if "at night", lighting words follow night. Questions to Alex (max 2): none needed; defaults: dusk, English, neighbour speaks 6 words.
SPEC beats: 0-2 s friend-holds, pan from road to the lit inflatable (hand holds phone, slight shake, exposure adapts) | 2-5 s a man in a puffer jacket walking a leashed dog stops mid-stride, leash tightens, the dog sits, he looks up | 5-8 s he turns and says, "Where did you get that?"; {CREATOR} off-frame laughs "Link's in my bio." Sound: fan hum, crickets, leash clink. Forbidden: crowd, kids' faces, hood, logo, captions.
*Veo:* `Filmed by a friend on a phone at dusk, slightly shaky, panning from the street to a 16 ft inflatable white skeleton with orange glowing eyes on a lawn. A man in a puffer jacket walking a leashed dog stops mid-stride, the leash tightens, the dog sits; he looks up and says, "Where did you get that?" Off-screen a woman laughs. Ambient noise: crickets, fan hum. SFX: leash clink. No music, no text.`
*Seedance:* `@Image1 = inflatable skeleton (exact look). A man in a puffer jacket with a leashed dog stops mid-stride on the pavement; the leash tightens, the dog sits; he looks up at the 16 ft glowing skeleton. Dusk, warm porch lamp. Camera: handheld pan from the road to the figure. {He says in English: Where did you get that?} <leash clink, fan hum, crickets> no music.`
*Kling:* `MASTER: 16 ft inflatable skeleton with orange glowing eyes on a lawn at dusk, friend-filmed phone video, no music. Shot 1 (3 s): pan from the road to the lit figure. Shot 2 (2 s): a man in a puffer jacket with a leashed dog stops, leash tightens, dog sits. Shot 3 (3 s): close on his face looking up. [Neighbour, amazed voice]: "Where did you get that?"`

### 12.7 Post-generation check (what to reject)
Reject and regenerate if: product shape/colour/label differs; second person appears; text or watermark rendered; inflatable stands before the fan or without tethers; fabric moves without wind/air; hand or gravity errors (object floats, passes through a hand); face drifts; lips off; light direction flips; any forbidden item. Each rejection logs the failure type so the parser's defaults improve.
