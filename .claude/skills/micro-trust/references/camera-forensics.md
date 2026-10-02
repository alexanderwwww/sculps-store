# camera-forensics — the camera channel of micro-trust, as paste-ready events

Tags: [S path] = in this repo. [W url] = web page actually read. [C] = composed, untested: render it, judge it, keep what survives.
Golden times for an 8 s clip: 0.00 · 1.17 · 3.06 · 4.94 · 6.11 · 8.00 (engines.md). Rewrite times proportionally for other lengths.
Rules that govern every line below: ONE camera move per shot, two moves smear [S ugc-master-prompter/references/lessons.md #43, engines.md]. Events, not adjectives [S micro-trust/SKILL.md]. Never "cinematic / gimbal / 8K / studio" [S style/never-do.md].
Budget: pick 8-12 cues per clip, not 40. Pick across groups, never stack two cues of the same group on one beat.

Web evidence actually read (all thin; the rest of section 1 is [S]/[C]):
- Without AE/AF lock the iPhone "keeps pulsing focus or shifting brightness" and re-balances when moving from dark to bright; subject goes from sharp to soft [W https://www.debbiephotos.com/iphone-ae-af-lock-explained-when-to-lock-focus-and-exposure/]
- Electronic stabilisation assumes one frame = one moment; rolling shutter exposes rows at different times; uniform correction produces jello/wobble; fixed by per-row correction from ~1 kHz gyro data [W https://dev.to/_630fdf100267a43420f70/rolling-shuttertoeis-shou-burebu-zheng-gaying-xiang-wowai-maseruli-you-454m]
- Kling's own camera guide pushes "smooth", "steady" movement phrasing, nothing on handheld [W https://kling.ai/blog/ai-camera-control-movement-prompts-guide] -> engines default smooth; handheld must be forced.
- Search snippets only (page not read, do not cite as fact): low light reduces contrast, which is what autofocus uses, so it hunts; shadows get brightened at the price of noise [search result, debbiephotos/markus-hagner]; a fake push-in is smooth but foreground/background parallax is wrong [search snippet, dev.to camera-motion eval].

---------------------------------------------------------------------------------------------
## 1. The 40 camera micro-cues (timed EVENT sentences)

### A. Starts (1-5)
1. [S phone-flaws/tiktok-pacing] At 0.00 the video is already moving: the filmer is mid-stride and the frame is still settling.
2. [C] At 0.00 the first half second is a blurry tilt from the pavement up to the lawn as the phone comes up.
3. [C] At 0.00 the picture is slightly too wide and the subject is too small and far; the filmer has not zoomed or stepped in yet.
4. [S hooks/tiktok-pacing] There is no establishing shot, no fade-in, no title: frame one is mid-action.
5. [C] At 0.00 the phone is a few degrees tilted and the horizon corrects itself over the first second.

### B. Movement (6-13)
6. [S handheld] Constant small hand shake; the framing drifts slowly every two or three seconds.
7. [S handheld] When the filmer turns, the frame lags a beat behind the body and then catches up.
8. [S lessons/handheld] At 1.17 the filmer walks one step forward and the frame bobs once as the foot lands.
9. [S tiktok-pacing] At 1.17 the camera whips toward the thing the filmer just noticed, then settles.
10. [C] At 3.06 a short sideways drift of the whole frame, as if the filmer shifted weight to the other foot.
11. [S phone-flaws] At 4.94 the phone jerks up half a second after the flare, a late reaction, not a planned tilt.
12. [S handheld] At 6.11 the phone tilts up late to the skull, overshoots slightly, and comes back.
13. [C] The sway is low-frequency (breathing, walking) with an occasional micro-jitter [training/01-look-camera.md says exactly this], never a steady glide.

### C. Focus (14-19)
14. [S phone-flaws] At 1.17 the autofocus hunts and breathes for about half a second as the lit figure comes into view.
15. [S training/01] The focus breathes for 3 to 8 frames when a new subject moves close, then locks.
16. [C] At 3.06 focus grabs the nearer neighbour's jacket first, then slides to the figure behind him.
17. [S training/01] After settling, focus and exposure hold, then are disturbed again only by a new event (not constantly sharp, not constantly hunting).
18. [S iphone-look] Deep phone focus: the whole yard is roughly in focus, no portrait-mode blur, no cinematic bokeh.
19. [C] At 6.11 the product (skull face, lantern) is crisp for the hold while the street behind stays phone-soft.

### D. Exposure (20-25)
20. [S phone-flaws] At 4.94 the auto-exposure pumps darker then brighter as the blue lantern flares.
21. [S training/01] Highlights clip to flat white on the porch lamp; shadows go muddy grey and lift in low light.
22. [S training/01] Auto white balance drifts: warm under the porch lamp, cooler as the frame turns toward the blue dusk sky.
23. [C] At 1.17 the frame is slightly underexposed for a moment, then brightens as the sensor catches up.
24. [C] At 3.06 a neighbour in a dark jacket walks across the bottom of the frame and the exposure brightens a notch behind him.
25. [S training/01] Colours slightly over-saturated and HDR-flat in mixed light: lit sky and dark lawn both visible, low local contrast.

### E. Framing (26-31)
26. [C micro-trust lib] The subject sits off-centre and the top of the hood is almost cut off.
27. [S training/01] 15% of real clips look pre-cropped: head cut at the top or the product partly out of frame. At 0.00 the lantern is half out of the frame.
28. [S handheld] The framing drifts, then corrects late, a beat after the filmer notices.
29. [S micro-trust SKILL] At 3.06 a neighbour's shoulder crosses the left edge and half-covers the figure for a moment.
30. [S phone-flaws] The filmer pinch-zooms: the digital zoom crops in at 6.11, the image goes softer and more compressed.
31. [C] The horizon is a few degrees off level for the whole clip.

### F. Hand / finger / lens (32-34)
32. [S phone-flaws] At 3.06 a thumb edge drifts into the corner of the frame for a moment.
33. [S handheld] The filmer glances at the screen, not through it: the frame pauses a half-beat while the filmer checks it, then moves again.
34. [C] A fingertip or phone case corner dips into the bottom edge at 4.94 when the filmer grips tighter.

### G. Rolling shutter / compression / noise (35-38)
35. [S phone-flaws; W dev.to above] At 1.17 a faint rolling-shutter wobble: the vertical edges of the garage door lean for a few frames during the fast move.
36. [S phone-flaws] Quick pans smear: motion blur on the pan, sharp again when it stops.
37. [S training/01] Visible luminance noise in the dark lawn, chroma speckle in the dusk sky, mild blocking in flat dark areas and banding in the sky gradient.
38. [S training/01] Smartphone sharpening: slight halo on edges, over-crisp fabric and hair texture.

### H. Light bloom / flare (39)
39. [S phone-flaws] Porch-light highlights bloom slightly; the blue lantern spills a soft glow onto the grass and neighbours' faces and blooms for a second at 4.94.
   NOTE: style/iphone-look.md and never-do.md ban "lens flares". Bloom on a light source is allowed; anamorphic streaks, starbursts, rainbow flares are the banned kind. Write "bloom" or "halo", never "lens flare".

### I. Ends (40)
40. [S tiktok-pacing/hooks] At 8.00 the clip stops abruptly mid-moment: the frame is still drifting, a voice is mid-word, no outro, no final pose, no fade.

---------------------------------------------------------------------------------------------
## 2. Per capture mode: signature cues and cues that break it

Modes are from the bible §2 [S design/xugc/real-life/05-directors-bible.md]. Rule: one mode per shot; never selfie + neighbour filming [S realism-rules #6, lessons #24]. Ratios in real footage: ~45% selfie, ~30% propped/rear held by another, ~25% POV [S training/01].

### Selfie (front camera)
Signature: face large, chin-to-forehead, arm's-length, phone slightly below or above eye level, wide front lens with slight stretch at frame edges (23 mm-equiv look) [S training/01]; eyes glance at screen not lens ~30% of frames [S training/01]; arm enters on a reframe; background swings when she turns.
Cues: 6, 7, 15, 20, 26, 28, 33, 34 plus [C] "the arm shortens and lengthens, the face drifts toward one edge".
Breaks it: gimbal glide, background perfectly sharp with portrait blur, face perfectly centred and constant size, rear-camera crispness, both hands busy with a product while the phone is "held" [S bible C4: switch to propped/POV].

### Friend-holds (rear camera, someone else films)
Signature: "steady-ish, following her, occasional zoom-in, a little shaky" [S bible §2]; the subject sometimes leaves the centre; friend laughs or comments off-screen; the framing chases a beat late.
Cues: 7, 9, 11, 14, 16, 28, 30, 32, 36.
Breaks it: subject always centred and looking into lens, perfect follow, no zoom hunting, filmer silent, a single smooth pan.

### POV (hands visible, first person)
Signature: hands at the bottom of the frame, phone in one hand, other hand shows the product [S bible §2]; the view drops and tilts when the hand does something; product close to the lens makes focus hunt.
Cues: 14/15 (focus hunts onto the close product), 20, 34, 12.
Breaks it: both hands operate while the "phone hand" is also visible, hands perfectly shaped and still, static locked frame, camera motion unrelated to hand action. Hand rule: five fingers visible, natural grip [S engines.md rules for ALL].

### Propped (phone leaning on a mug/flowerpot)
Signature: locked-off with slight sway only when bumped or at the start; she steps in and out, off-centre; exposure pumps as she enters; one tilt after a bump [S bible §2, example "propped low on a flowerpot, one slow tilt up"].
Cues: 5, 23, 24, 26, 31; [C] "a small shake at 3.06 when she bumps the counter" [S training/01 example 3 has exactly this].
Breaks it: any push-in or pan (nobody is holding it), perfectly level and perfectly centred framing, hand shake continuing for the whole clip.

### Walking-toward (filmer approaches subject)
Signature: forward bob each step, frame grows as distance closes, focus hunts at the end of the approach, exposure shifts when entering the glow, small digital-zoom or reframe at the end, steps audible. [C, with the bob/hunt parts supported by S handheld/phone-flaws]
Cues: 1, 2, 3, 8, 14, 20, 30.
Breaks it: smooth dolly speed, constant subject size growth, no step rhythm, subject sharp from the first frame, no breathing or footsteps on the audio.

---------------------------------------------------------------------------------------------
## 3. Night / dusk specifics (Black Reaper: US suburban dusk, warm porch lamps, cold blue lantern)

Background physics [W debbiephotos read: exposure/focus re-balance on light changes; search snippets only: low contrast makes AF hunt, shadows brightened with noise]. Everything below is how to phrase it.

1. [S phone-flaws] Mixed light: warm porch lamps vs cold blue dusk and lantern. White balance drifts toward whichever dominates the frame; write the drift as an event, not a grade. [C phrasing] "At 3.06 the frame turns toward the porch and the whites go warm; at 4.94 the blue lantern pulls the colour cold."
2. [S training/01] Shadows noisy and muddy, strongest in evening light; the lawn between lights is a dark grainy mass, with grass detail lost.
3. [S training/01] Highlights clip: lamp bulbs are flat white discs with a soft halo; keep them that way. Do not ask for detail inside a lamp.
4. [S phone-flaws] Exposure pump on the lantern flare (4.94): the lantern is first blown out, then the phone darkens, and the figure's skull reads crisp at 6.11 as exposure settles. This ordering (blow, pump, settle) is also the "slick crisp product" beat [S micro-trust SKILL: product sharp at key moments, world soft].
5. [C] Autofocus is slowest in the dark gaps: hunt longer (0.5 to 1 s) when the filmer pans from a lit house to the dark lawn, shorter when the lantern is the target (high-contrast edge).
6. [S training/01] Blue light on faces: a faint cold spill on the near neighbour's cheek and jacket at 4.94, uneven; the far neighbours stay in warm porch light.
7. [S bible 05 example] Dusk sky: banding in the gradient and blocky dark patches are wanted [S training/01 compression].
8. [C] Night handheld shake is slightly worse and blurrier than daytime (longer shutter); write "slight motion smear on the pan, sharp again when it stops" [S phone-flaws], not heavy blur.
9. [S never-do] No volumetric god rays, no rim lights, no glossy product lighting. Light comes only from porch lamps, street light, the lantern, and phone screens held up by neighbours (screens are small cold light sources: [C]).
10. [C] Cap the dark: keep faces readable. Real night UGC is dim but legible; a black frame is a failed generation, not realism.

---------------------------------------------------------------------------------------------
## 4. AI camera tells to ban, with replacement sentences

Why they happen: SFT/CT stages filter for smoothness and aesthetics and RLHF rewards polish, so models drift to a "polished stock-footage mean" [S design/xugc/real-life/01-video-model-research.md §2.4]. Kling's own guide recommends smooth/steady phrasing [W kling.ai blog]. So the default is wrong for UGC and must be overridden in words.

| # | Tell | Replacement sentence |
|---|---|---|
| 1 | Gimbal-glide, constant-speed move | [S handheld] "Constant small hand shake; the framing drifts every two or three seconds; the frame lags a beat behind the body." |
| 2 | Perfect focus on everything, always | [S phone-flaws] "Autofocus hunts and breathes for half a second at 1.17, then locks; the street behind stays soft." |
| 3 | No exposure pumping, same brightness throughout | [S phone-flaws] "Auto-exposure pumps darker then brighter as the lantern flares at 4.94." |
| 4 | Hero-centred subject, rule-of-thirds composition | [C] "The figure sits off-centre, top of the hood nearly cut off, a neighbour's shoulder partly covers it." |
| 5 | Perfect level horizon | [C] "Horizon a few degrees off level." |
| 6 | Cinematic push-in / dolly / orbit / crane | [S engines.md] If a move is needed: "handheld, one slow push-in as the filmer walks closer, with a footstep bob." Prefer none. |
| 7 | Slow motion or time-ramp | [S never-do] "Real time, 24-30 fps phone motion, normal speed." |
| 8 | Shallow-depth bokeh | [S iphone-look] "Deep phone focus, no blurred background." |
| 9 | Studio-clean image: no noise, no compression | [S training/01] "Noise in the dark lawn, blocky dark patches, banding in the dusk sky." |
| 10 | Lens flare streaks / rainbow flare | [S never-do] "Porch lamps bloom as soft white halos; no streaks." |
| 11 | Unmotivated camera moves (move happens, nothing caused it) | [S bible: verbs beat adjectives, visible triggers] "The camera swings to the figure because the neighbour points; it overshoots and returns." |
| 12 | Subject never leaves frame, never occluded | [S micro-trust SKILL] "A neighbour walks through the left edge and covers the figure for a second." |
| 13 | Perfectly timed reframing (camera moves before the event) | [S phone-flaws] "Framing corrects late, a beat after it happens." |
| 14 | A clean, tidy ending hold | [S tiktok-pacing] "Stops mid-moment, still drifting, voice mid-word, no final pose." |
| 15 | Continuous sharp 4K detail, edges too clean | [S training/01] "Phone sharpening halo on edges; 1080x1920 softness." |
| 16 | Camera motion unrelated to the filmer's body (no footsteps, no breathing, no bob) | [C] "Each footstep bobs the frame; the filmer's breathing is audible." |
| 17 | Fake push-in that is really a digital zoom with no parallax [search snippet only] | [C] "The filmer walks closer: foreground sidewalk moves faster than the lawn and the house behind." |
| 18 | Perfect finger-free frame, immaculate lens | [S phone-flaws] "A thumb edge drifts into the corner for a moment." |

---------------------------------------------------------------------------------------------
## 5. Engines: how camera motion tends to render, and how to phrase cues

Evidence status is poor. Repo evidence: bible §1 and engines.md. Web: Kling guide read (smooth default). Nothing here was rendered by me. Every engine behaviour claim is [S] only where it is quoted from those files; the rest is [C].

### Kling v3
- [S bible §1] Multi-shot (up to 6 shots), labelled `Shot n (x s):`, "one visible action and one camera intent per shot"; identity via Element.
- [W kling blog] Official camera vocabulary is smooth/steady; so an unmarked camera tends toward smooth. [C] Therefore name handheld in the MASTER line AND in every shot line.
- Phrasing that fits the notation [S engines.md]: `Shot 2 (3 s): Handheld, friend-filmed, frame lags a beat behind the walk, focus hunts as the figure enters.`
- [S lessons #43] Two camera moves in a shot = jitter. Put exposure and focus events as "events", not moves.
- [C] Each shot is a new camera: a cut resets the shake; keep screen direction constant [S bible §9.6].

### Seedance 2.0 / 2.5
- [S bible §1] Best at "camera/motion mimicry"; five slots, 60-100 words, camera slot gets ONE move; two moves smear [S engines.md].
- [C] Because it mimics motion, a real phone reference clip (omni video ref, up to 3 video refs [S bible §1]) is the strongest way to get genuine shake. Without it, word cues only.
- Phrasing: put the cue in the Camera slot: `Camera: handheld, slight sway, frame drifts and corrects late.` and the exposure/focus events in the Action slot as things the scene does to the lens.
- [C] Longer takes (staged ranges) let you put 4.94 and 6.11 events as `0-4s / 4-9s` blocks, but keep each block to one cue.

### Veo 3.1
- [S bible §1/§11] Best at ambient room tone and prompt adherence; timestamp blocks `[00:00-00:02]` supported; doc structure subject/action/style/camera/composition/focus/lens/ambiance [S research 01 §3, Veo doc].
- [C] Veo's "focus/lens" slot is the natural home for the hunt cue: `Focus: autofocus hunts for half a second as the figure enters, then locks.`
- [S bible example] `Filmed by a friend on a phone at dusk, slightly shaky, panning from the street...` is the existing tested-style wording (not verified as rendered).
- [S lessons #36] Voice does not carry between clips; do not lean on it for camera continuity either.

### Wan 3
- [S engines.md] Describe MOTION only (the image is the look); word cap and notation [UNVERIFIED]; `enable_prompt_expansion` defaults true and rewrites your words (read `actual_prompt`). [C] Expansion likely adds "smooth cinematic" language; turn expansion off or check the rewritten prompt for banned words.
- [C] The start image carries the iPhone texture (noise, halos); do not rely on motion words to add noise.

### LTX
- [S engines.md/training] Trigger `xugciphone`; negative prompts are not available in the distilled pipeline, so the avoid list is written into the prompt; captions that name the flaw as an event ("exposure shift, focus pull") are what teach it [S training/01 §caption].
- [S training/01] LoRA picks the earliest checkpoint where noise, shake and auto-exposure appear; hands remain weak [S research 01 §3-4].
- Phrasing: `xugciphone, vertical handheld video, ... the focus hunts for a moment then locks, the exposure brightens as the lantern flares.` (matches the template of training examples).

### Cross-engine rules [S engines.md + C]
1. Positive phrasing, not negation: "deep phone focus" beats "no bokeh" [S bible §1 Veo guidance].
2. Camera cues go at the START of the shot line (engines weight early tokens) [C].
3. Never write seconds as vague ("a moment"): use the golden times when the engine supports timestamps, otherwise sequence words ("then", "immediately").
4. Cap at 8-12 cues; a long list of camera events is dropped (prompt adherence limit [S research 01 §2.8]).
5. Real reference footage or a real-photo first frame beats any wording [S research 01 §3].

---------------------------------------------------------------------------------------------
## 6. The 10-point camera inspection (frame by frame, 0-3 each, pass = 22/30, no 0)

Step through at 0.00, 0.5, 1.17, 3.06, 4.94, 6.11, 7.5, 8.00, then watch once at full speed.

1. Start: is frame 1 already in motion (not a held composed frame, no fade)? [S tiktok-pacing]
2. Shake character: low-frequency sway plus occasional micro-jitter, not glide, not constant buzz? [S training/01]
3. Lag: does the frame trail the body and then catch up (late corrections), not lead the event? [S handheld]
4. Focus: at least one visible hunt/breath on a new subject, then a lock; not constant crisp, not constant mush? [S training/01]
5. Exposure: a visible pump or white-balance drift tied to a light event (the flare); highlights clip, shadows lift? [S phone-flaws/training]
6. Framing: off-centre, partly occluded or cropped at least once; horizon not perfect? [S + C]
7. Lens/hand: a finger/edge/zoom crop or a screen-check pause somewhere? [S phone-flaws, handheld]
8. Sensor: noise in the dark, banding/blocking in sky and flat dark areas, edge halo, 1080x1920 softness; no beauty sharpness? [S training/01]
9. Light: bloom on lamps is soft; no streaks, no god rays, no clean studio fill; the product crisp at its key beats while the world stays phone-soft? [S SKILL, phone-flaws, never-do]
10. End: stops mid-moment, still moving, no final pose; and no AI tell from section 4 appears (gimbal, slow motion, bokeh, shape morph in the background when the camera moves)? [S tiktok-pacing, never-do]

Repair order: lowest scoring item first; if items 2-3 fail, delete the second camera move and add cue 7 plus 28; if items 4-5 fail, add cues 14 and 20 as timed events; if item 8 fails, add compression/noise sentences and consider a post pass (grain/compress/phone colour in the app) [S research 01 §3 "Post: grain, compression, slight shake, phone colour"].

Not covered because there is no repo or read-web evidence: TikTok/Reels re-compression specifics (use [S training/01]: H.264 at 8-12 Mbps, re-encode once, over-compression gives mush not phone look); front vs rear camera beyond the 23 mm-equiv front look [S training/01]; Cinematic/Action mode artifacts (excluded: training says use standard Video mode, no Cinematic/portrait [S training/01 mistake 14]).
