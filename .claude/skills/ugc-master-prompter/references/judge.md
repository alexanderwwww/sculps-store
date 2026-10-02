# judge.md — frame-by-frame inspection protocol for any generated clip or frame

Run this on EVERY take before saying a word about quality. "Looks like a phone video" is not a pass [style/realism-rules.md #9]. Quote what you saw, with frame ids [AGENTS r7].

Cite key: [judge-doc §n] = `design/xugc/real-life/04-judge-evaluation.md` | [audio §n] = `03-audio-voice.md` | [recipe Dn/§n] = `00-real-life-recipe.md` | [bible §n] = `05-directors-bible.md` | [orch §n] = `06-orchestration-apis.md` | [style/x.md] = `tools/xugc/assets/style/x.md` | [filter.js] = `tools/xugc/filter.js` | [AGENTS r#] = `AGENTS.md`. Items tagged (composed) are command lines or codes assembled here from named filters/rules; they are not quoted from a design doc and must be checked with `ffmpeg -h filter=<name>` / `ffmpeg -filters` on the machine that runs them first (never guess flags; [AGENTS r15]; the design docs mark every ffmpeg line CHECK-ON-MAC / untested [judge-doc preface; audio §5]).

---

## 0. Inspection order (fixed; stop at the first hard fail, but still log the rest)

1. **Spec compliance** — is it exactly what the shot spec says (duration, people count, setting, beats, speech, text rules, forbidden)? [judge-doc §10]
2. **Product fidelity** — same shape, colour, label, size as the reference, every frame it appears [judge-doc §3 criterion 1, weight 25%].
3. **People, hands, faces** — fingers, grip contact, identity first vs last, crowd distinctness [judge-doc §3 criteria 2-3, weights 20% + 15%].
4. **Physics** — cause before effect, gravity, nothing appears/vanishes [judge-doc §10.3; weight 10%].
5. **Look** — reads as an iPhone clip, not an advert [judge-doc §3 criterion 4, weight 15%].
6. **Sound** — never silent, voice intelligible, deep hit at the peak, no music [judge-doc §3 criterion 7, weight 5%; audio §7].
7. **Seam audit** — only when stitching clips [bible §9.10; recipe §5.6].

Judge only what is visible; write NOT_VISIBLE, never invent. Do not reward length, polish or cinematic look [judge-doc §7 system prompt]. List defects first, then score ("check before you score") [judge-doc §1.1 FIRM-Video]. The judge is never the model that made the take (no self-preference) [judge-doc §1.3].

---

## 1. Extract frames and facts

Always first: look at the reference product image (and the avatar image if used) so you know what "correct" is [judge-doc §4: reference always first].

Source command (CHECK-ON-MAC with `ffmpeg -h`): [judge-doc §4]
```
ffmpeg -ss <t> -i take.mp4 -frames:v 1 -vf scale=-2:1024 f_<n>.jpg
```
Long edge 1024 keeps finger detail [judge-doc §4].

### 1.1 One frame per 0.5 s (composed from the source command; `fps` is the standard ffmpeg filter)
```
mkdir -p frames && ffmpeg -i take.mp4 -vf "fps=2,scale=-2:1024" frames/h_%03d.jpg
```
8 s clip = 16 frames. Read every one in order; this is where morphing, extra people and drifting props show.

### 1.2 The six golden times for an 8 s clip [recipe D22; google.js goldenTimes]
t = 0.1 (not 0.00, the first frame can be a black/easing frame), 1.17, 3.06, 4.94, 6.11, 7.9 (duration minus 0.1) [judge-doc §10.2 uses t=0.1 s and duration-0.1 s].
```
for t in 0.1 1.17 3.06 4.94 6.11 7.9; do ffmpeg -ss $t -i take.mp4 -frames:v 1 -vf scale=-2:1024 g_$t.jpg; done
```
For clips of length L the times scale: 0.382L, 0.618L and the cuts inside the outer spans [recipe D22].
Compare each golden-time frame with its hidden landmark still (product, person, place, light, pose). A frame far from its landmark fails the take; send the failing second and field into the repair prompt [recipe D22 judge use].

### 1.3 Beat-driven frames (spec-driven sampling) [judge-doc §10.2]
F1 at t=0.1, one frame at the START (t_start+0.1) and END (t_end-0.1) of every beat, 2 hand close-ups at the beat that touches the product, the last frame at duration-0.1. Cap 14 frames per take.

### 1.4 Hand close-ups (composed crop of the centre-lower region, the source's stated default) [judge-doc §4]
Use frames at 40% and 60% of the clip:
```
ffmpeg -ss 3.2 -i take.mp4 -frames:v 1 -vf "crop=iw*0.7:ih*0.45:iw*0.15:ih*0.5,scale=-2:1024" hand_1.jpg
```
Refine the crop around the actual product/hands.

### 1.5 Facts about the file (Stage 0, free, local) [judge-doc §5]
```
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate:format=duration -of default=nw=1 take.mp4   (composed)
ffmpeg -i take.mp4 -vf "blackdetect=d=0.2:pix_th=0.10,freezedetect=n=-60dB:d=1" -an -f null -                       (filters + values from judge-doc §5)
ffmpeg -i take.mp4 -af "silencedetect=n=-45dB:d=0.7" -vn -f null -                                                  (judge-doc §5)
ffmpeg -i take.mp4 -af ebur128 -vn -f null -                          (integrated LUFS + true peak; judge-doc §5)
ffmpeg -i take.mp4 -vf "select='gt(scene,0.4)',showinfo" -an -f null -   (cuts inside a single shot; judge-doc §5 names scdet / select gt(scene,0.4))
```
Also from judge-doc §5: `signalstats` YAVG frame-to-frame change for flicker; sharpness by variance of Laplacian (or `blurdetect` where present). Filters that must exist in the build: blackdetect, freezedetect, silencedetect, ebur128, signalstats, scdet, blurdetect (newer builds), mpdecimate, ssim/psnr [judge-doc §5].
Thresholds below marked "calibrate" were never calibrated on real clips: run on 10 real iPhone clips and 10 known-bad generations once and store the numbers; do not ship guessed thresholds [judge-doc §5 Calibration].

Speech facts: local Whisper transcript with word timestamps; lip-sync judged on 3 frames at word onsets ("is the mouth open when a word starts?"), a coarse check, say so [judge-doc §4].

---

## 2. Hard-fail codes (take scores 0 whatever the rest says)

From the design docs [judge-doc §3, §10.4; recipe §7]:

| Code | Trigger |
|---|---|
| WRONG_PRODUCT | different object, colour, shape, size or label; product absent when the shot requires it; changes between frames |
| HANDS | wrong finger count, fused fingers, hand merging into the product, extra limbs, in any sampled frame beyond a glance |
| FACE | different person first vs last frame, collapsing eyes/teeth |
| EXTRA_PERSON | person count differs from spec at ANY frame (count reflections, photos, background figures) |
| TEXT_OR_CAPTION | any text not in `allowed_text`: garbled letters, subtitles, watermarks, fake brand names, a copied carousel headline. Exception: text on the real product label that equals the reference |
| PHYSICS | object moves with no contact, appears/vanishes/multiplies/changes size or colour, hands without plausible grip, no gravity response (see section 5) |
| SETTING_DRIFT | room, props, light direction/colour change or props appear/vanish |
| SPEECH_MISMATCH | transcript differs from the line by more than 10% word edit distance, or speech starts in the wrong beat |
| FORBIDDEN | any item from the spec's forbidden list present |
| UNSAFE | hateful, cult-like, occult, ritual or group-chant imagery, hate symbols, hooded/robed look resembling hate-group imagery, sexual, violent, minors in unsafe context, real-celebrity likeness |
| CLAIM | a spoken or shown claim not in the brief/product record (medical, guarantee, superlative, personal-use testimonial) |
| BROKEN_FILE | black or frozen output, first frame black, black interval over 0.2 s, freeze over 1 s, duration off by more than 20% of ask (spec check: more than 10%), not 9:16, below 720x1280 |

Defined here (composed, not in the design docs; use as labels only, they do not change the app's seven judge codes):
- LANDMARK_DRIFT — a golden-time frame is far from its landmark still [recipe D22].
- CROWD_CLONE — repeated faces/outfits, mirrored or synchronised crowd, fewer than 3 filming when the crowd rule was written [style/crowd-realism.md].
- SCALE — product visibly wrong size relative to the adult/hand in the spec [recipe §6 size_human; style/realism-rules.md #7].
- SILENCE — digital-zero or dead-quiet gap, or a faded/silent first or last second [audio §7 checks 5, 6, 9; style/real-sound.md].
- STYLE_AD — cinematic grade, studio light, bokeh, gimbal glide, airbrushed skin (score cap, not zero, unless the take also fails realism criterion below 2) [style/never-do.md].

The app, not the model, computes the weighted total and zeroes hard fails [judge-doc §7; recipe D11].

---

## 3. Checklists by stage

### 3.1 Spec compliance [judge-doc §10.2]
Answer YES / NO / NOT_VISIBLE with a frame id each.
- [ ] Duration within 10% of spec (ffprobe); 9:16; >= 720x1280.
- [ ] Person count equals spec in EVERY frame; no extra person, reflection, poster face.
- [ ] Same room and same props first, middle, last; no prop not in `props_allowed`; light direction and colour constant.
- [ ] Each beat's action completed between its start and end frames; stated cause occurs before stated effect.
- [ ] Speech: transcript equals the line (edit distance <= 10%), starts inside its beat, word 1 by 0.3 s on a hook shot, mouth open at onsets.
- [ ] Text rules: no caption/subtitle/watermark/logo/sign text outside `allowed_text`; OCR a frame every 0.5 s [audio §7 check 13].
- [ ] Forbidden list absent (crowd unless asked, pets, mirrors showing a second person, music, claims) [recipe forbidden.default.json].
- [ ] One continuous shot: no cut, montage, time jump (scene-change detector clean) [style/realism-rules.md].
- [ ] Hook: motion in 0.0-0.4 s, product or effect by 1.5 s (3 s hard limit), reads with sound off [bible §3].
- [ ] Golden timing: set-up to 3.06, build, peak near 4.94, settle 6.11-8.00 [recipe D22].

### 3.2 Product fidelity (25%)
- [ ] Shape/silhouette equals the reference in every visible frame; hue family the same; no part added, missing or resized [judge-doc §10.2].
- [ ] Label text legible only if it equals `label_text` exactly; any other text is a TEXT_OR_CAPTION fail.
- [ ] Size vs hand/adult within spec ratio (use the hand crops) [judge-doc §10.2].
- [ ] No morph while rotated or handled; rotation under 90 degrees [bible §6].
- [ ] Product class physics correct: stake prop has no blower/tethers/inflation; inflatable has no legs, rises head last, not before airflow [style/inflatable-physics.md; SKILL.md].
- [ ] No carousel/infographic graphics, borders, collage, silhouettes pasted in [xugc skill Realism rules #3].

### 3.3 People, hands, faces (35%)
- [ ] Hands: five fingers, natural joints, grip contact (fingers wrap, no hover, no pass-through), no fusing into product [judge-doc §3, §10.3 Q3].
- [ ] Face: same person F1 vs middle vs last; no uncanny eyes/teeth; blinks present; glance to screen present; not a metronomic stare [training/02-behavior.md AI tells; judge-doc §3].
- [ ] Skin: pores, flushes, no airbrushing or waxy plastic [style/iphone-look.md].
- [ ] Wardrobe unchanged across frames (only changes at an intentional "next day" cut) [bible §4 rule 2].
- [ ] Crowd (if asked): 6-10 distinct people, at least 3 filming at different angles/orientations, one half in frame, one walking through, varied reaction timing, nobody looking at camera on purpose, no neat line or semicircle [style/crowd-realism.md].
- [ ] No minors' close faces [bible 8.9].
- [ ] Klan-like cues => UNSAFE: white or pointed hood, faceless hood, several hooded figures together, crosses, fire, flags, ritual stance, crowd chanting or encircling a robed figure. The skull-faced black Reaper with visible skull, lantern and ghost-souls is allowed [SKILL.md hooded-figures rule; bible §6; judge-doc §10.4].

### 3.4 Physics (10%) — answer for every consecutive pair of golden/beat frames [judge-doc §10.3]
1. Does any object change position between frames with no hand, body or force touching it? YES = PHYSICS.
2. Does any object appear, vanish, multiply, change size or colour? YES = PHYSICS.
3. Do hands grip with plausible contact? NO = PHYSICS.
4. Do liquid, fabric, hair respond in the right direction (gravity, momentum, wind)?
5. Do shadows/highlights keep the spec light direction as things move?
6. Is camera motion handheld-plausible (small continuous drift), not gliding, teleporting or snap-zooming?
7. Is the pace of the action human (no multi-second action finishing instantly)?
Plus: inflatable standing before the fan runs, plugged-in product with no cable, fabric moving with no air, a box that opens itself [bible 12.7].

### 3.5 Look (15%)
- [ ] Vertical phone framing, ordinary colour/contrast, natural available light only [style/iphone-look.md].
- [ ] Handheld micro-shake with lag-and-catch, framing drifts every 2-3 s, not perfectly level or centred [style/handheld.md].
- [ ] Phone flaws visible at least once: autofocus hunt, exposure pump, rolling-shutter wobble, thumb edge, digital-zoom softness [style/phone-flaws.md].
- [ ] Sensor noise in shadows; highlights bloom; no teal-and-orange, grain overlay, bokeh, flares [style/never-do.md].
- [ ] Background is a real lived-in place that stays put (houses, trees, sky do not morph) [style/realism-rules.md].
- [ ] Sharpness not pristine (blur floor: calibrate); flicker index low (calibrate) [judge-doc §5].

### 3.6 Sound (5%) [audio §7; judge-doc §5; recipe D9]
Per-clip raw take uses Stage 0 numbers only; the strict 14 checks run on the post-chain audio [recipe D9].
| # | Check | Pass | Hard? |
|---|---|---|---|
| 1 | Has an audio stream | 1 stream, 48 kHz | yes |
| 2 | Audio length matches video | within 100 ms | yes |
| 3 | Integrated loudness | per clip about -16 LUFS; finished ad -14 +/- 1; below -35 LUFS caps criterion at 2 | yes (finished) |
| 4 | True peak | <= -1.0 dBTP (finished mix target -1.5) | yes |
| 5 | No digital silence | `silencedetect=noise=-70dB:d=0.1` zero hits | yes |
| 6 | No dead-quiet gaps | `silencedetect=noise=-58dB:d=0.5` zero hits | yes |
| 7 | Noise floor in non-speech windows | RMS -58 to -38 dBFS (calibrate) | warn |
| 8 | Clipping | 0 clipped samples (`astats`) | yes |
| 9 | Abrupt end | last 150 ms fades below -6 dB, or room floor continues; no truncated syllable | yes |
| 10 | Words match script | Whisper WER <= 15% (calibrate), first word not cut | yes when dialogue |
| 11 | Speech rate | 1.8-3.2 w/s; above 3.6 = rushed | warn / fail above 3.6 |
| 12 | Lip-sync | offset within +/- 100 ms; warn first, hard after calibration on 30 clips | warn |
| 13 | No model subtitles or garbled on-screen text | OCR every 0.5 s | yes |
| 14 | Compliance | voice source tag, no personal-use claim | yes |
Silence rule for prompts: sound audible from the first frame to the last; silence over 70% of the clip when speech is expected = fail [judge-doc §5]. Also check: one deep low hit near 4.94 s; voices at different distances; the product's own sound present in its beat; no music unless asked [style/real-sound.md; style/sound-layers.md]. Voice quality tells: metallic ring, warble on sustained vowels, fizz above 12 kHz, studio-dry voice in a visible room, foley 80+ ms off the visible contact (target +/-40 ms), identical loop every few seconds [training/04-sound.md]. Listen on the app's sound button (it plays unmuted) before judging [xugc skill Realism rules #8].
On a hard audio fail: regenerate once with the audio block shortened or moved, then switch to the post-sound path (voiceover + floor) and re-judge [audio §7; recipe §10.7].

### 3.7 Seam audit (stitched ads only) [bible §9.10; recipe §5.6-5.7]
At every cut check: face, product colour and label, clothing, background objects, light direction, screen direction/eyeline, product state and hand position hand-off, audio level and room tone continuity.
- [ ] Cut on action: each clip ends mid-motion and the next starts mid-motion; never a held pose to a held pose [bible §9.1].
- [ ] 0.15-0.3 s trimmed from head and tail of each clip [bible §9.2].
- [ ] One speaker, one engine; voice does not change at the seam [bible §9.4].
- [ ] Colour matched to one reference frame, one phone LUT + 1-2% grain [bible §9.5].
- [ ] Hard cuts by default; crossfade 0.25 s only to hide a seam [recipe §5.7].
- [ ] 40-80 ms audio fades at cuts, constant room-tone bed [orch §8.4].
- [ ] Frame-chained when consecutive clips are one moment: last frame of clip N = first frame of clip N+1 [bible §4 rule 7].
Reject and regenerate the offending clip; never stretch [bible §9.10].

---

## 4. Scores, thresholds, take policy

Score each criterion 0-5 (0 unusable, 1 obvious defect, 2 would make a viewer suspect AI, 3 noticeable but usable, 4 one minor, 5 indistinguishable from a real phone clip) [judge-doc §3, §7 anchors].

| Criterion | Weight |
|---|---|
| Product fidelity | 25% |
| Hands and body | 20% |
| Face and identity stability | 15% |
| iPhone realism | 15% |
| Motion and physics | 10% |
| Brief adherence | 10% |
| Audio | 5% |
Total = sum(weight x score) / 5 x 100 [judge-doc §3; recipe §7].

- PASS = no hard fail AND total >= 70 AND every spec_check field PASS [recipe §7].
- Total >= 80: stop, ship. 70-79: ship; queue one extra take only if budget allows. Below 70 or any hard fail: repair and re-roll [judge-doc §6].
- Top two takes within 4 points (of 100): pairwise A/B twice with order swapped, accept only if both agree, else keep the higher absolute score [recipe D8; judge-doc §7].
- Stage 0 caps: blur floor -> iPhone realism capped at 2; loudness below -35 LUFS or true peak above -1 dBTP -> audio capped at 2; cut inside a single-take shot -> physics penalty [judge-doc §5].
- Take counts: hook shot 3 scouts, other shots 1 scout, then 1 final-tier render, judged on its own; max 5 generations per shot, at most 2 at final tier [recipe D1]. At the cap stop, show the best take with failing fields in plain words ("hands are fused in the middle beat"), offer "Try 2 more" or "Accept"; never loop past the cap [recipe §4.5].
- If the hook shot has no passing take at the cap, the ad stops there; Alex decides before more money goes on the body [recipe §5.5].
- Never auto-retry a `rejected` (safety) or `failed` generation; surface it [recipe §4.6].

---

## 5. What to fix per failure (the bible fix table + the judge repairs)

Bible one-liners [bible §10]:
| Failure | Fix |
|---|---|
| wrong face | check reference slot order and strength |
| wrong label | add the exact colour/label sentence ("the box lid is matte white with a single orange stripe") |
| too polished | add two clutter cues, remove "cinematic" |
| lips off | shorten the line |
| product tiny | add the scale sentence in human terms |
| jitter | delete the second camera move |

Spec-field repairs; edit ONLY the failing field's sentence, never rewrite the whole prompt [judge-doc §10.5; recipe §4.5]:
| Code | Repair |
|---|---|
| PHYSICS (a beat) | make the cause explicit and slower in that beat: "her thumb visibly presses the lid down before it closes" |
| EXTRA_PERSON | add "only one person in the frame, no one else visible, empty background"; move to forbidden |
| TEXT_OR_CAPTION | add positive form "No text, captions, letters, logos or graphics in the picture" (not the word subtitles on Veo); if the text is a copied reference, replace the reference with a clean text-free frame |
| WRONG_PRODUCT | re-attach the reference and state shape, colour, label FIRST in the prompt |
| SETTING_DRIFT | shorten the shot or lock the prop list (3 specific stable background objects) |
| SPEECH_MISMATCH | shorten the line (sentence <= 10 words, <= 18 per 8 s) |
| HANDS | "Natural hands, five fingers visible, holding the product by its {part}"; remove the second finger-action beat; hands rest flat or still while holding; avoid fast hand rotation [bible §4 rule 8; judge-doc §8.3 example] |
| FACE | same avatar reference + same wardrobe sentence; one face sentence; shorter clip [bible §4] |
| UNSAFE | change the design in one line (bare skeleton, pumpkin, spider, monster; no hooded robe), remove crowd/ritual staging [bible 12.3 C12] |
| CLAIM | delete the claim; demonstration voice only [recipe D7] |
| BROKEN_FILE | re-render (a new sample); check duration/aspect fields, 8 s for Veo reference mode [bible §1] |
| Audio hard fail | shorten/move the audio block once, then post-sound path [audio §7] |

Other repairs from the bible [bible §4, §6, §9]:
- Wrong logo/label/colour: regenerate, don't patch the prompt; add one sentence only if it repeats [bible §4 rule 10].
- Product morphing: rotations under 90 degrees; frame-chain from the last good frame [bible §4 rule 7].
- Voice differs between clips: one engine per speaker; or generate a voiceover once and lay it over [orch §8.4].
- A field that fails identically twice is a spec problem: simplify the field, do not burn takes [recipe §4.5; judge-doc §10.6].
- The same failing field on 3 different shots becomes a proposed Style Bible rule (>= 3 thumbs-down across >= 2 shots), shown once as "Add this rule? Yes / No" [judge-doc §8.3; recipe §7].

### How to repair (which frame, which sentence)
1. Find the first failing golden-time frame (section 1.2). If the failure is in a landmark STILL (wrong product, text pasted, extra person), regenerate that still from the product reference with the clean-frame sentence, then re-render the clip [recipe D22; google.js CLEAN].
2. If the stills are clean and the clip drifts, edit only the sentence of the failing beat and re-render from the same stills [judge-doc §10.5].
3. If one clip of an ad fails at a seam, regenerate that clip only; keep neighbours; re-chain first/last frame [bible §9.10].
4. Log the failure type and code each time so defaults improve [bible 12.7].
5. Re-judge from section 0. Do not pass a repaired take on the strength of the edit alone [AGENTS r7].

---

## 6. Verdict format (short table; one per take)

```
TAKE: <file> | ENGINE/TIER: <..> | SHOT/CLIP: <..> | DURATION: <s> | FRAMES READ: 16 + 6 golden + 2 hands
| Stage                | Result  | Evidence (frame ids)                  | Code        |
|----------------------|---------|---------------------------------------|-------------|
| 1 Spec compliance    | PASS/FAIL | h_007: second person at left edge   | EXTRA_PERSON|
| 2 Product fidelity   | PASS/FAIL | g_4.94: lid colour differs from ref | WRONG_PRODUCT|
| 3 People/hands/faces | PASS/FAIL | hand_1: six fingers                 | HANDS       |
| 4 Physics            | PASS/FAIL | ...                                 | PHYSICS     |
| 5 Look               | PASS/FAIL | ...                                 | -           |
| 6 Sound              | PASS/FAIL | silence 0.0-0.4 s; peak -0.4 dBTP   | SILENCE     |
| 7 Seam audit         | PASS/FAIL/N-A | ...                              | -           |
SCORES (0-5): product _ hands _ face _ iphone _ physics _ brief _ audio _  => TOTAL _ /100 (hard fail zeroes)
VERDICT: SHIP / REPAIR / REJECT   | FIX (one sentence, failing field only): ...
NOT_VISIBLE / UNVERIFIED: <anything not checked>, say it out loud
```
Rules: every FAIL cites a frame id; "observed" and "expected" are both stated; anything not run is listed under UNVERIFIED, never implied as passed [AGENTS r7, r12; shipping "name the assumption"].
Spec-check record for the app: `{field, verdict, frames[], observed, expected, code, repair}` with `field` as the spec path (e.g. `beats[2].action`) [judge-doc §10.5].

---

## 7. Sources for the judge prompt
Exact judge system/user prompt and JSON schema (hard_fails, evidence, defects, scores, reasons, fix_hint, spec_check) are in [judge-doc §7, §10.5]; use them verbatim when a Claude vision call is made. Bias controls: absolute checklist first, pairwise only for the top two, rationale capped at 15 words per score, judge sees frames and measured audio facts only [recipe §7; judge-doc §1.3].
