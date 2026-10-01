# 02 - Behavior and Performance Spec (iPhone UGC video-ad LoRA)

Scope: what real UGC creators do on camera, and how to write it into captions so the LoRA learns it. Facts from web research are cited; the taxonomy and caption phrasing are our own working spec.

## Sources used
- Hook categories, pattern interrupts, bag-rummage/fridge reveals, handwriting hooks, brief product mentions beat long pitches: https://billo.app/blog/ugc-hooks/ , https://dansugc.com/blog/ugc-hooks-tiktok-ads-formulas , https://influee.co/blog/tiktok-ugc , https://www.stackmatix.com/blog/tiktok-ugc-ads-strategy
- Real UGC = phone-shot, natural light, speaking direct to camera, unscripted; a real voice outperforms a tight script (same sources, plus https://coinis.com/how-to/create-authentic-tiktok-ad).
- AI tells: low or irregular blink rate (humans ~15-20/min), no micro-movements, no catchlights, lip-sync lag, abrupt expression shifts, over-symmetry: https://247tempo.com/10-visual-clues-a-video-is-ai-generated/ , https://caniphish.com/blog/how-to-spot-ai-videos , https://salesaicourse.com/why-ai-video-looks-fake/ , https://arxiv.org/pdf/2505.15173
- Video LoRA captioning: one flowing paragraph per clip (subject, action, setting, lighting, camera); caption quality beats clip count; describe the full motion sequence, not "person jumping"; do not train too many distinct movements in one LoRA; use trigger word once, not twice: https://civitai.com/articles/11942/training-a-wan-or-hunyuan-lora-the-right-way , https://fal.ai/learn/devs/ltx-2-video-trainer-prompt-guide , https://loraai.me/wan-2-2-motion-lora-trainer

## Caption method (applies to every clip)
1. Trigger token first, once (e.g. `xugc_style`), then one paragraph, present tense, 40-90 words.
2. Order: who and framing, then speech/expression, then hands/product, then camera, then setting/light, then cut or timing note.
3. Name the imperfection explicitly. A LoRA only learns what the caption states; if "fumbles" is never written, it will not become a controllable behavior.
4. One clip = one cut-free 2-4 s segment (matches real ad pacing), so motion captions stay accurate. Split edited ads at every cut; never caption a clip that contains a cut as one shot.
5. Tag speech state: `mid-sentence`, `pause`, `laughing`, so mouth motion is tied to a word.
6. Keep a fixed vocabulary (below). Same behavior = same phrase across the dataset.
7. Balance: no single behavior in more than ~25% of clips; each behavior needs 15+ clips minimum to be controllable.

## Behavior taxonomy (caption phrase in quotes)

### A. Eyes and face
1. Glance to screen: eyes flick to phone screen mid-sentence then back. "glances down at the phone screen then back to lens"
2. Direct eye contact held: "holds direct eye contact with the lens"
3. Look-away to think: "looks up and to the side while recalling, then back to camera"
4. Natural blink cadence: "blinks naturally, irregular rhythm, occasional double blink"
5. Eyebrow raise on emphasis: "raises eyebrows on the stressed word"
6. Squint at brightness or inspection: "squints slightly at the product"
7. Genuine smile building: "smile starts after the sentence, eyes crinkle"
8. Mock-shock / wide-eyed reaction: "wide eyes, mouth open in surprise"
9. Eye-roll or smirk self-deprecation: "smirks and shakes head at herself"
10. Lip press / lip bite during thought: "presses lips together between phrases"

### B. Speech and voice
11. Filler words: "says 'um' and 'like' mid-sentence"
12. Self-correction: "stops, says 'wait, no', restarts the sentence"
13. Mid-sentence breath: "audible inhale before the next phrase"
14. Trailing-off then punch: "voice drops, then emphasizes the key word"
15. Laugh-talk: "laughs while speaking, shoulders shake"
16. Whisper-confide: "leans in, lowers voice as if sharing a secret"
17. Fast excited cadence: "speaks fast, words run together"
18. Pause for effect: "pauses half a second, nods once"
19. Direct address to viewer: "says 'you guys' and points at the lens"
20. Off-script aside: "mutters an aside to herself, shrugs"

### C. Head, body, hands
21. Head tilt on question: "tilts head while asking"
22. Nod while talking: "small repeated nods"
23. Shoulder shrug: "shrugs one shoulder"
24. Hair tuck / touch face: "tucks hair behind ear mid-sentence"
25. Point at lens or product: "points index finger at camera"
26. Counting on fingers: "counts points on fingers"
27. Open-palm explain gesture: "open palms gesturing as she explains"
28. Leans in toward lens then back: "leans toward camera, then sits back"
29. Weight shift / sway when standing: "shifts weight between feet"
30. Walk-and-talk bob: "handheld bob with her footsteps while talking"

### D. Product handling
31. Fumble the grab: "briefly fumbles picking up the product"
32. Pull from bag or pocket (hook reveal): "pulls the product from her bag toward the lens"
33. Hold up beside face: "holds the product next to her face, label to camera"
34. Rotate to show sides: "turns the product slowly to show the back"
35. Tap or squeeze to demo: "taps the product with a fingernail, sound audible"
36. Open / unbox: "peels the seal, opens the lid, looks inside"
37. Push product close to lens, focus hunts: "pushes the product to the lens, autofocus hunts then locks"
38. Put-down and re-pick: "sets it down, picks it up again"
39. Use on self, mid-demo glance: "applies it, checks result in the phone screen"
40. Wrong-side-to-camera then fix: "label faces away, she flips it to camera"

### E. Camera and pacing (phone-native)
41. Handheld micro-shake: "handheld iPhone, slight constant shake"
42. Selfie arm-length framing: "selfie framing at arm's length, wide-angle face distortion"
43. Jump cut every 2-3 s: "jump cut, same framing, slightly different head position" (one clip per segment; note cut in the prior clip's tail)
44. Punch-in digital zoom on emphasis: "slight digital punch-in on the key word"
45. Reframe correction: "she adjusts the phone, framing shifts"
46. Auto-exposure shift: "exposure brightens as she moves from shade to sun"
47. Phone propped, static: "phone propped on a surface, locked-off, creator steps back to show body"

### F. Street and crowd (neighbours)
48. Passer-by glance: "a passer-by glances at the camera and looks away"
49. Background pedestrians unaligned: "pedestrians walk at different speeds, some cross behind"
50. Stare-and-smirk bystander: "a bystander smirks at the creator filming"
51. Creator ignores crowd: "does not react to people behind her"
52. Creator acknowledges bystander: "glances at a passer-by, lowers voice, laughs"
53. Traffic and ambient motion: "cars pass, a cyclist crosses the background"

## Hook library (first 0-3 s; one hook per clip, caption states hook type)

| # | Hook | Caption phrase | Source |
|---|---|---|---|
| 1 | Bag rummage reveal | "rummages in bag, camera peeking in, pulls product out" | billo |
| 2 | Fridge/door reveal | "door swings open revealing the product inside" | billo |
| 3 | Drop and snap into frame | "drops phone, catches it, snaps into frame mid-sentence" | billo |
| 4 | Start mid-sentence | "starts speaking already mid-sentence, no intro" | dansugc |
| 5 | Direct problem call-out | "looks at lens, says the problem, shakes head" | dansugc |
| 6 | Stop-the-scroll reaction | "gasps, wide eyes, holds product up" | influee |
| 7 | Whisper secret | "leans in, whispers to the lens" | dansugc |
| 8 | Handwritten text | "writes the message on a notebook in real time" | billo |
| 9 | Hidden gem | "opens wardrobe / glove box, finds product" | billo |
| 10 | "Stop doing X" correction | "points at lens, says stop, holds up alternative" | dansugc |
| 11 | Before-result tease | "touches her skin, then says 'look at this'" | stackmatix |
| 12 | Walking up to camera | "walks toward lens talking, face fills frame" | our spec |
| 13 | Skeptic turn | "frowns at product, tries it, face changes to surprise" | our spec |
| 14 | Street POV question | "filming in street, turns phone to a passer-by, then back" | our spec |

Rules: product visible or voiced by second 3; one claim; brief personal reason beats a pitch (stackmatix, billo).

## Faked vs real

Real in genuine UGC: phone sensor noise and auto-exposure shifts, shaky framing, filler words, restarts, laughing off errors, glances to screen, background strangers, wind and traffic audio, compression from TikTok upload.

Faked or staged even in "authentic" ads (this is what we reproduce, not avoid):
- Scripts: most creators read a brief; "unscripted" is rehearsed with deliberate stumbles kept.
- Reactions: surprise and delight are performed, often on take 5+; first take usually flat.
- Product: placed label-forward; hero angles prepped; "found it in my bag" is staged.
- Cuts: 2-3 s jump cuts remove all dead air; silence is edited out.
- Lighting: window/ring-light chosen then labeled "natural".
- Locations: street scenes shot at quiet times, extras are friends or ignore the camera.
- Testimonial results: often filmed in sequence out of order.
(Source basis: stackmatix, dansugc, coinis; staging claims are industry-practice inference, not a single cited statistic.)

Because XUGC is generative, "faked" behaviors are acceptable and desired; we must never caption claims (results, medical) the product cannot support.

## What makes people look like AI (and the dataset fix)

| AI tell | Fix in captions/data |
|---|---|
| Never blinks or blinks metronomically | Include blink phrase in 100% of face clips; add double-blink and slow-blink clips |
| Gaze locked on lens forever | Mandatory 30% of clips with glance to screen or look-away |
| Perfect speech, no fillers | Caption fillers and restarts; include real breaths |
| Mouth shape not tied to words | Caption the spoken words in quotes; short phrases per clip |
| Static torso, only the mouth moves | Add weight shifts, nods, shrugs, hand gestures to every clip |
| Hands disappear or have wrong fingers | Include many hands-in-frame clips, product handling; reject training clips with hand glitches |
| Product floats, no contact weight | Caption grips ("fingers wrap the bottle, thumb on cap"); fumbles and re-grips |
| Over-smooth skin, symmetrical face | Pores, flyaway hair, uneven lighting, slight redness captioned; no beauty filter clips |
| Crowd is frozen or synchronized | Caption varied pedestrian speed, one bystander glance, cars passing |
| Camera is gimbal-smooth or perfectly locked | Handheld shake, reframes, autofocus hunt, exposure drift |
| Every clip same energy | Mix energy states: excited, deadpan, whisper, laughing |
| Expression snaps instantly | Caption build-up: "smile builds slowly after the sentence" |
| Lip-sync lag | Train on clips with accurate audio sync only; drop dubbed clips |
| Lighting too cinematic | Phone-quality, one dominant source, blown highlights allowed |
(AI-tell basis: 247tempo, caniphish, salesaicourse, arXiv 2505.15173.)

## Dataset quotas (behavior)
- 30% glance-to-screen or look-away; 60% hands visible; 40% product handling; 30% street/crowd; 20% walk-and-talk.
- Each of the 53 behaviors: 15+ clips minimum, 40+ for the top 15 (hooks 1-6, glance, fumble, filler, blink, handheld).
- Cut length 2-4 s, 49-81 frames at the trainer's fps; one hook or one behavior focus per clip plus background behaviors.
- Do not mix many camera moves in one clip (Wan guidance, loraai.me).

## Example caption
`xugc_style, a woman in her 20s in a hoodie films a selfie at arm's length on a city sidewalk, mid-sentence, says "okay so, um, I literally just found this", glances down at the phone screen then back to lens, pulls a small white bottle from her tote bag and holds it next to her face, label to camera, fumbles it slightly, blinks naturally, eyebrows raise on "found". Handheld iPhone, slight shake, wide-angle distortion. Pedestrians walk behind her at different speeds, one glances at the camera. Overcast daylight, slightly blown sky. Single take, no cut.`
