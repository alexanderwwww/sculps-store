# XUGC "Real Life" — Director's Bible (05)

Role: director / cinematographer / prompt specialist. Scope: photoreal iPhone-style UGC video ads, 9:16, via Veo 3.1, Seedance 2.x and Kling 3.0 official APIs, with product photo(s) + avatar photo as references, clips 4-15 s stitched into 15-30 s ads.

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
