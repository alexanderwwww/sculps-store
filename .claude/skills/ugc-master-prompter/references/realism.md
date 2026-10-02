# realism.md — the look, behaviour and sound rulebook a prompt must encode

Every rule is taken from a repo file and cited. Nothing is invented. If a line has no bracket, it is a connector, not a rule.

Cite key: [style/x.md] = `tools/xugc/assets/style/x.md` | [bible §n] = `design/xugc/real-life/05-directors-bible.md` | [recipe Dn/§n] = `00-real-life-recipe.md` | [judge-doc §n] = `04-judge-evaluation.md` | [audio §n] = `03-audio-voice.md` | [training/0n] = `design/xugc/training/0n-*.md` | [AGENTS r#] = `AGENTS.md` rule/section | [xugc skill] = `.claude/skills/xugc/SKILL.md` | [filter.js] / [presets.js] / [google.js] = `tools/xugc/*.js` | [SKILL.md] = this skill's parent file.

How to use: pick the product class (section 4), paste the MUST-WRITE blocks (section 1) into the master prompt, then run the MUST-NEVER list (section 2) as a pre-flight, then `filter.js`. Positive form for closed engines: write what IS there, not negative lists [bible §6 Veo avoid; recipe D18]. The MUST-NEVER list is for the pre-flight check and for open engines (LTX) that take an Avoid sentence [xugc skill build 5].

---

## 0. The ten laws (compressed from the bible)

1. First shot is the ad: product or its effect visible, viewer knows what is sold inside 3 s [bible §0.1].
2. One shot = one action + one camera idea + one line of speech [bible §0.2].
3. Short, front-loaded prompts; Seedance 60-100 words, Veo 60-120 plus dialogue [bible §0.3; filter.js ENGINES].
4. Every reference image gets a job sentence; a naked reference bleeds its lighting and framing [bible §0.4].
5. Describe the phone, not the cinema [bible §0.5].
6. Identity comes from images, never from adjectives [bible §0.6].
7. Speech short and spoken: 8-18 words per 8 s clip [bible §0.7; recipe D16].
8. Never ask the model to render critical text; captions and price are burned on afterwards [bible §0.8; style/realism-rules.md #10].
9. 3 takes of the hook shot, 1-2 of the rest [bible §0.9]; recipe D1 caps it at 5 generations per shot [recipe D1].
10. Stitch on motion or on sound, never on a freeze [bible §0.10].

---

## 1. MUST-WRITE sentences (copy-paste blocks)

Fill the {slots}. Keep each block to one or two sentences; spend words on timed actions first [SKILL.md word caps; filter.js repair never cuts timed actions].

### 1.1 Phone look
> "Shot on an iPhone, vertical 9:16, ordinary phone-camera colour and contrast. Natural available light only, a lamp or window, never studio lighting. Slight sensor noise in the shadows, mild auto-exposure shifts when she moves. Slightly wide phone lens, the background is a real lived-in room." [style/iphone-look.md]

For engines where aspect is an API field, drop "vertical 9:16" from the text [bible §5.2; filter.js ASPECT_IN_PROMPT].

### 1.2 Handheld
> "Phone held by hand at arm's length or chest height, never on a tripod. Constant small hand shake, the framing drifts slowly every two or three seconds. When she moves the frame lags a beat and then catches up. Reframes quickly when the product is shown." [style/handheld.md]

Pick ONE capture mode per shot and write its wording [bible §2]:
- Selfie-hold: "front-camera selfie video, arm's-length, phone held in her right hand, slight handheld sway, face fills the frame from chin to forehead, wide-angle phone lens distortion".
- Propped: "phone propped against a mug on the counter, locked-off, she steps back into frame, slightly off-centre, auto-exposure".
- POV: "first-person point of view, her hands visible at the bottom of frame, phone held in one hand, the other hand shows the product to camera".
- Friend-holds: "filmed by a friend on a phone, steady-ish, following her, occasional zoom-in, a little shaky".
- Mirror/ring-light (beauty only): "bedroom, ring-light reflection in her eyes, phone on tripod at eye level".
Capture mode must let the hand that holds the phone also do the action; else switch to propped or POV [recipe §6 self-check 5; bible 12.3 C4].

### 1.3 Phone flaws (add 2-3, never all) [style/phone-flaws.md; bible §2 authenticity cues]
> "The autofocus hunts and breathes for a moment when the product comes into view. Auto-exposure pumps brighter and darker when a light source enters the frame. A faint rolling-shutter wobble when the phone moves fast. A thumb edge intrudes at the frame edge for a moment, the framing drifts and corrects late."

Room clutter cue (pick 1-2): unmade bed corner, laundry on a chair, half-drunk coffee, charging cable, mixed warm lamp + window light [bible §2]. Performance cues: starts mid-thought, breath before the line, small laugh, looks at the product then the lens, non-perfect first word, no polished smile at the end [bible §2].

### 1.4 Skin and light
> "Skin looks real: pores, small flushes, no airbrushing, flyaway hair." [style/iphone-look.md; bible §2 wardrobe]
> "One dominant light source, phone-quality, highlights allowed to blow out." [training/02-behavior.md AI-tell table: lighting too cinematic]

Shadows lift slightly muddy in low light, highlights clip, mild blocking and banding are wanted [training/01-look-camera.md checklist: sensor, exposure, compression].

### 1.5 Hands and faces (the rule that stops melted hands)
> "Natural hands, five fingers visible, holding the product by its {part}." [bible §4 rule 8; filter.js HANDS; presets.js HAND]

- `{part}` by capture mode in the app: selfie = edge, propped = edge, pov = base, friend-holds = side [presets.js PARTMAP]. For an odd product name the real part (handle, lid, strap).
- Do not ask for fine finger choreography, and never a second beat of finger action inside the same shot [bible §4 rule 8].
- A product that is held needs this sentence or `filter.js` blocks it as NO_HANDS_RULE [filter.js lint].
- Show grip contact: "fingers wrap the bottle, thumb on cap", fumbles and re-grips, so the product has weight [training/02-behavior.md: product floats, no contact weight].
- Rotate the product once, at most 90 degrees per shot [bible §6 all-engines; presets.js product-only/unboxing].
- Faces: ONE sentence for the face; the reference image carries identity; no repeated face description across sentences [bible §4 rule 9; filter.js FACE_REDESCRIBED].
- Faces behave: blinks, glance from lens to screen (about 30% of frames), weight shifts and gestures, not only the mouth moving [training/02-behavior.md AI-tell table; training/01-look-camera.md speaking clips].
- Expressions build, they do not snap: "smile builds slowly after the sentence" [training/02-behavior.md].
- Every emotion needs a visible trigger: "smiles, eyebrows up, laughs once", never just "excited" [bible 12.5; filter.js EMOTION_NO_TRIGGER].

### 1.6 Continuity block (paste verbatim into every clip of one ad) [bible §4]
```
CHARACTER: the woman from @avatar ({age band, hair, one wardrobe sentence}). Same face, hair, outfit in every shot.
PRODUCT: the exact product from @product (read colours, shape, label from the image; do not redesign, do not add logos or text that are not in the image).
PLACE: {one place noun, kept constant}, {one light sentence}.
CAPTURE: {capture mode wording from 1.2}.
```
Rules: same wardrobe sentence verbatim every shot; same location noun every shot; size in human terms ("about 16 ft, three times the woman's height") because models shrink big products [bible §4 rules 2, 3, 5]. Persona is not always "a woman": the defaults in `presets.js` assume one, so write the real persona from the intake [presets.js fill() face default; SKILL.md step 1].

### 1.7 Clean-frame sentence (always, whenever references are attached)
> "No text, captions, letters, logos or graphics in the picture." [filter.js CLEAN_FRAME]

Plus for the reference-frame maker (image model): "The picture contains NO text, NO captions, NO letters, NO numbers, NO logos or graphics added on top, NO infographic, NO collage, NO borders, NO watermark. Use the reference photos only to learn what the product and the person look like, never copy their layout or any writing on them." [google.js CLEAN]

### 1.8 Reference job sentences [bible §0.4; recipe §4.2]
> "First reference image = the woman, governs face, hair and outfit, keep identical. Second = the product, governs exact shape, colour and label, copy it exactly, never redesign. Third = the room, governs light direction and background only, do not copy its framing." [presets.js refsPlan]
Veo: max 3 references, 8 s required in reference mode [bible §1; recipe D3]. Only clean, text-free frames ever go to the video model; a raw product photo, carousel or infographic never does [xugc skill session 2026-10-02 reference rule; google.js CLEAN].

### 1.9 Single shot
> "One single continuous phone shot, never several scenes, never a montage. One clear main subject that stays the same size, shape and colour for the whole clip. The setting stays put: the house, trees, street and sky do not change. Only a few things move at once, and they move the way real things move. Everything described sits on the ground under real gravity." [style/realism-rules.md Prompt block]

---

## 2. MUST-NEVER list (pre-flight; one tick per line)

Look
- Cinematic words: cinematic, 8K, epic, stunning, masterpiece, studio lighting, beauty, flawless, perfect skin, gimbal [filter.js CINE; bible §6].
- Teal-and-orange, film grain overlays, lens flares, shallow-depth bokeh, softboxes, rim lights, god rays, glossy product-ad lighting [style/never-do.md].
- Perfect teeth/hair/skin/symmetry; fashion-model, influencer, stock-photo or actor faces; plastic or waxy skin; cartoon/CGI look [style/never-do.md].
- A perfectly sharp, perfectly exposed, perfectly stable image [style/phone-flaws.md].

Camera
- Smooth push-ins, pans, gimbal, drone, dolly, crane, tracking; perfectly level or centred [style/handheld.md; style/never-do.md].
- More than ONE camera move per shot (pan + orbit + zoom stacks) [bible §0.2, §6; filter.js TWO_CAMERA_MOVES].
- Slow-motion, time-lapse, speed ramps, whip-pan transitions, zoom-in effects [style/never-do.md].
- Vague motion ("moves around", "dynamic movement") — use explicit verbs [bible §6 Kling; filter.js VAGUE_MOTION].

Picture content
- Text, captions, subtitles, logos, watermarks, UI overlays, numbers, diagrams, charts, arrows, labels, silhouettes drawn into the picture [style/never-do.md; style/realism-rules.md].
- The words "subtitles" or "caption" in a Veo prompt (can render text) [bible §5.1; recipe D6].
- A logo, mark or label that is not on the product reference [bible 12.2a].
- Scene changes, cuts, montages, split screens, time jumps inside one clip; objects appearing from nowhere, duplicating, melting [style/realism-rules.md].
- A TV studio, news anchor, news desk, ticker or broadcast graphic; a spoken "breaking news" line [style/breaking-news.md].
- Product that changes size, colour, shape or design between moments [style/never-do.md].
- Extra, fused or melting fingers; faces that morph between shots [style/never-do.md].

People
- Clones: same person repeated, twins, identical outfits or poses, mirrored crowds, neat semicircles, everyone reacting at the same moment [style/crowd-realism.md].
- Blurred-blob crowds; people with no phones when others film [style/never-do.md].
- Close identifiable faces of minors; use hands, back of head, silhouettes [bible 8.9 policy note; filter.js MINOR_FACE blocks any minor description].
- Hooded/robed figures that read as hate-group imagery, white pointed hoods, cloaked ritual figures, group-chant scenes, symbols of any group [bible §6 content rules; judge-doc §10.4 UNSAFE].
- Celebrities, film/TV characters, franchises, brands by name or lookalike [bible §6 content rules].

Speech and claims
- "sorry", "unfortunately", "we hope", hedges in any line the viewer hears or reads [AGENTS section 1; bible §3 note].
- Personal-use testimonial lines ("I've used it every day for a week", "my husband said", "best $ I've spent") from a synthetic person [recipe D7]. Note: the `review` preset still contains one; rewrite it as demonstration voice [presets.js review beat 2].
- Medical, cure, before/after-body or guarantee claims; unverified superlatives [bible §6; recipe forbidden.default].
- Advertising language, scripted perfect delivery, voiceover narration, robotic voices [style/never-do.md].

Sound
- Silence at any point, a quiet first or last second, studio-clean voice, laugh track, music with lyrics, music of any kind inside the generation (music is added in post) [style/real-sound.md; style/sound-layers.md; bible §12.2a].
- A sudden volume jump with no cause [style/never-do.md].

---

## 3. Behaviour, crowd, pacing, hooks, sound, speech

### 3.1 Crowd and people (only when the scene needs people besides the filmer)
Conflict, resolved: the style files ask for crowds [style/crowd-realism.md] while the director's standing list says no crowds, extra people, bystanders or children's faces unless Alex asked [bible 12.2a; recipe D2 forbidden.default]. Rule: a crowd exists only when the brief asks for neighbours/crowd; then list each person by role, count and position [bible 12.2a; bible 12.3 C8]. `filter.js` warns CROWD unless `allowCrowd` is passed.

When a crowd IS asked, write:
> "Between six and ten different people: a teenager in a hoodie, a woman carrying a toddler, an older man in a flat cap, a man in a high-vis jacket, a woman in scrubs, a dad with a pushchair. Different heights, weights, skin tones, hair, glasses, beards, clothing colours and posture for every person. At least three people hold their phones up and film it, each at a different angle and a different phone orientation. One person is only half in the frame, one walks through the shot without looking, one stands behind another and peers over their shoulder. Reactions at different speeds: a delayed gasp, a nervous laugh, a swear, a step back, a stare, someone grabbing a friend's arm. People arrive and leave during the shot, nobody stands in a neat line, nobody looks at the camera on purpose." [style/crowd-realism.md; style/people.md]

- Name every person differently and give each one a job; two or three clearly different people beat a crowd of twelve [style/realism-rules.md #5].
- Mix of ages small child to sixties, ordinary bodies, ordinary clothes, nothing coordinated; phones held differently (vertical, horizontal, two hands, arm's length) [style/people.md].
- Keep crowd faces small or turned; kids as hands/backs/silhouettes [bible 8.9; SKILL.md anatomy block 2].
- Neighbour generation changes faces every clip: keep neighbour shots short and off-hero, or generate the neighbour once and reuse as a second reference [bible 8.4 note].
- Real crowd is not frozen or synchronised: varied pedestrian speed, one bystander glance, cars passing [training/02-behavior.md].

### 3.2 Pacing, hooks and the golden-ratio timing
- Opens already mid-action, no intro, no logo, no establishing shot; ends abruptly mid-moment [style/hooks.md; style/tiktok-pacing.md].
- Hook shot spec: 0.0-0.4 s motion already happening; word 1 spoken by 0.3 s; line at most 10 words; product or its effect in frame by 1.5 s (style files allow up to 3 s; the bible number is tighter) [bible §3 hook shot spec; style/hooks.md].
- Pattern interrupt = one of: unexpected scale, unexpected reaction, direct address with a claim, visible mess or problem, "wait what" sound [bible §3].
- Silent-view test: the shot must read with sound off AND with eyes closed [bible §3].
- Judge the first shot, not the first sentence [bible §3 sources 12, 13].
- Ad plan: hook 0-3 s, demonstration about 40%, proof/reaction about 25%, CTA 10-15%, end card 1 s on the product; a cut every 2-4 s in a 15-30 s ad [bible §7; recipe §5.2].
- Hook wording comes from the 80-hook library [bible §3]; blocked as testimonial claims by default: hooks 15-18, 63-65 [recipe D7]. Organic creative work iterates one element at a time (hook, body, CTA, script, sound, subtitles, music, transitions) from something already proven; never invent from your own head [organicx/creatives.md].

Golden-ratio timing (Alex's rule, for an 8 s clip): landmarks at **0, 1.17, 3.06, 4.94, 6.11, 8.00 s** = 0.382 x 8 = 3.06, 0.618 x 8 = 4.94, then the same cut inside the outer spans [recipe D22 update; google.js goldenTimes].
- 0-3.06 set-up (steady handheld, product in frame); build from 3.06; hook/reaction peak at 4.94; 6.11-8.00 settle and hold on the final pose [recipe D22; google.js beatPrompt].
- Timed beats are written as `0:01.17`-style stamps, one action per beat [presets.js mmss, beats].
- Longer clips scale the same fractions. This is a pacing rule, not a proven realism gain; A/B it against even spacing [recipe D22].
- Note: [style/tiktok-pacing.md] says "strongest visual moment at about one third"; the later golden rule puts the peak at 4.94 (0.618). Follow the golden rule; the one-third moment is the first big visible change near 3.06.
- Do not say "golden ratio" to an image model; it made Gemini fail [xugc skill Settled]. Give it the moment ("this single frame is: ...") instead [google.js landmarkPrompt].
- Veo 8 s: landmark 0 = first frame, landmark 8.00 = last frame, up to 3 middle stills as references, rest described in prompt [recipe D22; xugc skill].

### 3.3 Sound design (never silent)
Write as its own labelled paragraph after the visual description (Dialogue, Ambience, Handling, Mix) and open it with "AUDIO. Recorded on an iPhone microphone" [recipe §10.8].
> "Sound is present and clearly audible from the first frame to the last frame, no quiet gaps and no fade out at the end. A constant bed of phone-microphone ambience: {wind brushing the microphone, distant traffic, a dog far away, dry leaves}. Close sounds are loud and close: breathing, fabric rubbing on the phone, footsteps. The product makes its own real sound: {motor hum / fabric flap / zip / thump}. People speak over each other in short imperfect sentences, voices at different distances, one close to the microphone, others further away. One single deep low-frequency hit at the biggest moment of the video, and every person reacts a half-second later." [style/real-sound.md; style/sound-layers.md]

- The deep hit goes on the peak, 4.94 s [style/real-sound.md + recipe D22 peak; combine, both cited].
- The ending is loud and ongoing, never a fade [style/sound-layers.md]. (The post chain adds a 120 ms tail fade so a clip never ends on digital silence [recipe §10.6]; that is post, not prompt.)
- Tie 1-2 SFX to physical events (lid click, fan whir, leash clink), not generic [bible 12.2 field 7; bible 12.5 check 9].
- Music = none in every engine prompt, say "no music" [bible §5.2; bible 12.4 defaults]. Music is added in post, only licensed, -22 dB below voice [bible §9.3; recipe §10.5].
- Layer salience: voice > product event > handling > music > room > street [training/04-sound.md].
- Sound should have a living floor: phone AGC pumps the noise floor 6-12 dB in pauses; room tone never digital zero [training/04-sound.md].
- No more than 2-3 simultaneous sound layers named per moment (Seedance guidance) [audio §2.2].
- Real phone voice has breaths, mouth sounds, disfluency; a voice in a kitchen/bathroom needs room reverb to match [training/04-sound.md synthetic-audio list].
- Engine syntax: Veo `Ambient noise:` + `SFX:` + quoted dialogue; Seedance 2.5 `{dialogue}` `<sfx>` `( music )` (verify on route); Kling `[Creator, tone]: "line"` [bible §1, §5].

### 3.4 Speech
- Short imperfect lines, spoken not written: sentence at most 10 words, at most 18 words per 8 s, 1.8-3.2 words/s [recipe D16].
- Write how people text, not how brands write [bible §0.7]. Start mid-thought, non-perfect first word ("okay so-") [bible §2].
- Dialogue always in quotes after "says" with delivery before the quote: `says, calmly and a bit out of breath, "..."` [audio §2.1; bible §5.1].
- One language per prompt (mixed languages garble) [bible §5.2].
- Crowd reaction words are allowed in character speech: "oh shit", "no way", "bro look at that" [style/real-sound.md].
- No ad language ("amazing", "life-changing", "game-changer" read as copy) — the style files ban advertising language [style/never-do.md].
- Prices, URLs and labels are never spoken as claims unless in the product record; never rendered on screen by the model [bible 12.4 ask table; bible §0.8].
- One speaking on-camera Veo clip per ad (no voice lock between Veo clips); other speech goes to a voice-bound engine or becomes a burned caption over ambience [recipe D5].

### 3.5 Captions are never drawn by the model
- Burned on afterwards by the app (ffmpeg/Pillow in `burn_captions.py`) [xugc skill build 5; style/realism-rules.md #10].
- Format `start-end | text | top or bottom` [style/breaking-news.md].
- 2-3 words per second visible, bold sans, safe zone 150 px top and 270 px bottom of 1080x1920 [bible §9.8; recipe §5.8].
- The breaking-news hook is a caption on the first seconds, never a spoken line, never an anchor or ticker in the picture [style/breaking-news.md].
- Starter lines: `0-4 | BREAKING NEWS`, `0.6-4 | A neighbour just did something insane | top` [style/breaking-news.md].
- Breaking-news prompt energy: "the first few seconds of an urgent neighbourhood-news clip someone filmed on their phone, rushed, excited; the filmer is out of breath and moving fast toward something" [style/breaking-news.md].

---

## 4. Per-product-class switch

Decide the class FROM THE REAL PRODUCT PAGE AND PHOTOS, with real size, before writing [SKILL.md step 1; listing-images/references/bad-examples.md scale + describe-as-it-is]. Describe the product as it physically is, not as its category [listing-images/references/prompt-spine.md].

| Class | Physics file that applies | Scale line | Product sound |
|---|---|---|---|
| A. Handheld product (bottle, gadget, box, tube) | none; use hands rule + weight | size vs hand ratio | click, tap, thud |
| B. Yard-scale prop on a stake (fabric/rigid figure) | NOT inflatable-physics | real size in human terms, adult at base | wind on fabric, lantern effect |
| C. Inflatable (blower, tethers) | style/inflatable-physics.md | adult knees-to-hips, head at upstairs windows | blower roar, fabric flap |
| D. Wearable / try-on | hands rule, fit | worn on a person | fabric, clasp |

### A. Handheld product
- Hands rule block 1.5, one 90-degree turn, two-handed lift with a slight dip for heavy items [bible 12.6 Example B; presets.js].
- Size in cm and vs hand; check ratio on hand close-ups [recipe §6 product fields; judge-doc §10.2].
- Product label comes from the reference image only [bible §0.8].
- Capture mode usually selfie, POV or propped [presets.js].

### B. Yard-scale prop on a stake (e.g. fabric figure on a steel stake)
- It is NOT an inflatable. `inflatable-physics.md` applies ONLY to inflatables [SKILL.md Always; recipe forbidden list "inflatable standing before the fan" applies only if a fan exists].
- Write what it is: "{material} prop on a ground stake, {height} tall, {colour/detail}" and what it is not: "not an inflatable, not a person in costume, no legs or shoes, no blower, no tethers, no inflating" [SKILL.md anatomy block 4].
- It stands from frame 0; there is no fill sequence, no blower sound, no tie-down ropes unless the product page shows them [style/realism-rules.md #2 show finished state; SKILL.md].
- Scale: always size in human terms, put one adult at the base in frame [bible §4.5; style/realism-rules.md #7]. People render tiny: put people close to the lens and the product beyond them [listing-images/references/prompt-spine.md].
- Hood/robe designs: highest content risk. The bible forbids robed or hooded figures that resemble hate-group imagery, white pointed hoods, cloaked ritual figures [bible §6; bible 12.2a]. Write black, skull face visible, no pointed hood, no chanting or ritual poses, crowd in everyday clothes filming, and run UNSAFE in the judge [judge-doc §10.4]. See lessons.md (Klan-like robe).
- Light effect (lantern, glow): name the real light and its colour, spill on grass [SKILL.md worked example].

### C. Inflatable
Apply [style/inflatable-physics.md] only here:
> "The figure is an inflatable: smooth puffy nylon fabric with soft wrinkles, seam lines, taut tie-down ropes pulled to stakes in the grass, and a hose running to a roaring electric blower. It has no legs and no feet: the long robe is one inflated cone that widens to the ground. When standing it sways slowly in the wind, the sleeves and ragged strips flutter, and the whole shape leans a little on its ropes. A warm red light inside makes it glow, bright near the bottom and fading upward, and spills onto the grass. Its scale is huge: an adult is only as tall as its knees-to-hips, and its head is level with the upstairs windows." [style/inflatable-physics.md]
- Default to the FINISHED standing state: a distilled model cannot do "a flat heap inflates into a giant" [style/realism-rules.md #2]. If the inflation is on screen, write the fill as a real 3-6 s sequence: fabric lifts head first, tethers go taut one by one, nothing stands before airflow [bible 12.3 C9; bible 12.5 check 6; bible 12.6 Example A].
- Physically impossible: standing without fan running, plugged-in product with no cable, fabric moving with no air [bible 12.2a; bible 12.7].
- Never a real person in costume, a rigid statue, a mannequin, visible legs/feet [style/inflatable-physics.md Never].
- Scale line: 16 ft = about 4.9 m, about 2.7x a 1.8 m adult [bible 12.6 Example A].

### D. Wearable / try-on
- Propped phone at waist height, hands rule applies before it goes on, one half turn only, same outfit under it [presets.js try-on].
- No heavy makeup change between shots; no body before/after claims [presets.js try-on; bible §6].

---

## 5. Per-engine reminders (details live in engines.md)
- Veo 3.1: 4/6/8 s, 8 s required with reference images, up to 3 refs, dialogue in quotes, no negative lists [bible §1, §5.1].
- Seedance: 60-100 words, five slots (Subject, Action, Scene, Camera one move, Style/Audio), do not write aspect/duration [bible §5.2].
- Kling 3.0: master of 2 sentences + labelled shots (up to 6), action before dialogue, speaker tone tag [bible §5.3].
- LTX/Wan/Hunyuan: no negative input in the distilled LTX pipeline, so the Avoid list is written into the prompt; trigger word `xugciphone` [xugc skill build 5; training/01-look-camera.md].
- Every engine: run `filter.js check` and never ship a prompt it blocks [SKILL.md step 5].
