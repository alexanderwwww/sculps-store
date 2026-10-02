# lessons.md — every mistake already paid for, one line each

Format: **what happened** -> RULE that stops it. [source]. Each one cost Alex time, credits or a build. Read the section that matches the job before you write a prompt, spend, or say "it works".

Cite key: [xugc skill] = `.claude/skills/xugc/SKILL.md` (section named) | [bible §n] = `design/xugc/real-life/05-directors-bible.md` | [recipe Dn] = `00-real-life-recipe.md` | [judge-doc §n] = `04-judge-evaluation.md` | [audio §n] = `03-audio-voice.md` | [fal] = `08-fal-api.md` | [kling-mcp] = `09-kling-mcp.md` | [AGENTS r#] = `AGENTS.md` | [shipping] = `.claude/skills/shipping/SKILL.md` | [filter.js] [presets.js] [google.js] = `tools/xugc/*.js` | [style/x.md] = `tools/xugc/assets/style/x.md` | [SKILL.md] = parent skill. "unsourced detail" marks where Alex's brief named a failure but no repo file records its details.

---

## A. The wrong thing was generated

1. **First real clip: a man in a robe instead of an inflatable, every person the same, thin audio, no breaking-news text.** -> Product class decides physics; different people each with a job; sound audible from frame one; captions burned on afterwards [xugc skill Build 5; style/realism-rules.md].
2. **Klan-like robe: wrong product + crowd + captions.** The robed figure, a crowd standing around it and text drawn in the picture read as hate-group/cult imagery. -> No hooded or robed figures that resemble hate-group imagery, no white pointed hoods, no cloaked ritual figures, no group-chant scenes, no group symbols [bible §6 content rules; bible 12.2a]; no crowd unless asked and then every person listed [bible 12.3 C8]; no text in the picture [style/never-do.md]; the judge treats it as hard-fail UNSAFE [judge-doc §3 rule 5, §10.4]. The Black Reaper is a skull-faced black-hooded decoration and is allowed under the resolved rule: skull face, lantern and ghost-souls always visible; never a white/pointed or faceless hood, several hooded figures together, crosses, fire or flags; ordinary people filming, never ritual poses [SKILL.md hooded-figures rule].
3. **Test 1 had no references, test 2 used infographic references with a selfie look; both failed the brief.** -> The fix is rules, not more prompt length: lock the product with ONE clean reference, place it deliberately [xugc skill Realism rules].
4. **Product assumed wrong for a whole day (Reaper).** -> Read the real product page and LOOK at 2-3 real photos and the real size before writing [SKILL.md step 1].
5. **Projector drawn the size of the car, on the car boot.** -> Never state or imply a size not in the product record; anchor scale to something in the product photos [listing-images/references/bad-examples.md #1].
6. **A Crawling Zombie with no legs came back kneeling in eight panels.** -> Describe the product as it physically is, not as its category [listing-images/references/prompt-spine.md].
7. **Product described as a fraction of people ("a quarter of the product's height") produced specks for weeks.** -> Say people stand close to the lens, taller than half the frame, and the product sits beyond them [listing-images/references/prompt-spine.md].
8. **Mask carried red chevrons that read as a film killer; Meta pulls those ads.** -> Blank plain masks, no markings, no franchise or lookalike by name or look [listing-images/references/bad-examples.md #2; bible §6 content rules].
9. **Slouched limp-arm horror figure.** -> Say the pose in the prompt and ban the bad ones by name; stillness is the fear [listing-images/references/bad-examples.md #3].
10. **Every person in the first real clip looked the same.** -> Six strangers described the same way become six clones; name each person differently with a job; 2-3 clear ones beat a crowd of twelve [xugc skill Build 5; style/realism-rules.md #5; style/crowd-realism.md].

## B. Reference photos and copied text

11. **Carousel text copied into the video ("SIXTEEN FEET FOUR" and a silhouette were pasted in).** -> Raw product photos, carousels, infographics NEVER reach the video model; they go to the image model only, which makes clean text-free 9:16 stills; only those stills reach the video model [xugc skill Session 2026-10-02 reference rule; style/realism-rules.md #3; google.js CLEAN].
12. **A photo with writing on it gets pasted into the video, writing and all.** -> Check every photo before using it; no text, diagram or scale graphic [style/realism-rules.md #3].
13. **Old green photo fed back as a reference "to keep the scene" dragged the old composition in.** -> Never use an old picture as a reference; write the scene fresh [listing-images/references/bad-examples.md #4].
14. **Naked references bleed lighting and framing.** -> Every reference gets a job sentence [bible §0.4].
15. **Prompt text asked for "copy the carousel text/logos/labels".** -> `filter.js` blocks CAROUSEL_TEXT; never ask a model for text, describe by shape and colour [filter.js lint].
16. **References used with no clean-frame sentence.** -> Always add "No text, captions, letters, logos or graphics in the picture." [filter.js COPIED_TEXT_RISK].
17. **Wrong label or colour on a take.** -> Regenerate, do not patch in the prompt; add one concrete colour sentence only if it repeats [bible §4 rule 10].
18. **Two products (or four) in one image job.** -> One product per job, one reference attached once [listing-images/SKILL.md rule 3].

## C. Physics and class errors

19. **Inflatable physics wrongly applied to a stake prop.** A fabric/rigid figure on a stake got blower, tethers, inflating and "no legs" wording. -> `inflatable-physics.md` applies ONLY to inflatables; a fabric prop on a stake is not an inflatable: write what it is and what it is not [SKILL.md Always + anatomy block 4; style/inflatable-physics.md]. (unsourced detail: which product it happened on.)
20. **Inflatable asked to "stand up instantly" or inflate in a distilled model.** -> Show the finished state [style/realism-rules.md #2]; if inflation is shown, write a real 3-6 s fill, nothing stands before airflow [bible 12.3 C9].
21. **Scale shrinks big products.** -> Size in human terms every time, one adult at the base [bible §4 rule 5; style/realism-rules.md #7].
22. **Impossible physics: plugged-in product with no cable, a box that opens itself, an object that floats.** -> Every beat has a physical cause then effect; a beat with an effect and no cause is rejected before rendering [bible 12.2a; recipe §6 beats].
23. **Product morphs during rotation.** -> Keep rotations under 90 degrees per shot [bible §6 all engines].
24. **Contradictions: indoors and a lawn; selfie and a neighbour filming; a studio and a phone.** -> Remove contradictions; if the look setting does not match the story set it to None [style/realism-rules.md #6; xugc skill Realism rules].
25. **Duration vs content: unbox + assemble + demo + reaction in 8 s.** -> One state change per beat, default 1 beat per 2 s, split into clips [bible 12.3 C1].
26. **Time of day vs light ("at night, sunny").** -> Pick one; lighting words follow the time [bible 12.3 C3].
27. **A 15-second story with four cuts written into one prompt becomes mush.** -> One clip is one shot, 5-10 s; several shots = several clips joined afterwards [style/realism-rules.md #1].

## D. Look, hands, faces, people

28. **"Cinematic, 8K, epic" produces an ad, not UGC.** -> Describe the phone, not the cinema; filter blocks CINEMATIC_WORDS [bible §0.5; filter.js].
29. **Fake-looking frames (too clean, airbrushed, symmetric, studio-lit, no noise).** -> Phone look block + 2 clutter cues; remove "cinematic" [bible §10 fix table; style/iphone-look.md; training/02-behavior.md AI-tell table].
30. **Melted/extra fingers, hands that change shape.** -> "Natural hands, five fingers visible, holding the product by its {part}"; no fine finger choreography; a second finger-action beat is forbidden [bible §4 rule 8; style/never-do.md].
31. **Product floats with no weight.** -> Caption grips: fingers wrap, thumb on cap, fumbles and re-grips [training/02-behavior.md].
32. **Face drifts to a different person across shots.** -> Identity locked by image + same wardrobe sentence verbatim; one face sentence only; never re-describe the face differently [bible §0.6, §4 rules 1, 2, 9].
33. **Never blinks, gaze locked on lens, only the mouth moves.** -> Blink and glance cues, weight shifts, gestures [training/02-behavior.md AI-tell table].
34. **Crowd frozen, synchronised, semicircle, copy-paste people, no phones when others film.** -> Crowd-realism block with at least 3 filming at different angles, half-in-frame people, varied reactions [style/crowd-realism.md; style/never-do.md].
35. **Minors' close faces.** -> Hands, backs of heads, silhouettes only; filter blocks MINOR_FACE [bible 8.9; filter.js].
36. **Same person speaking in two Veo clips sounds like two people (no voice lock).** -> One speaking on-camera Veo clip per ad; one speaker, one engine per ad [recipe D5; bible §9.4].
37. **Gaze/eyeline flips across cuts.** -> Keep screen direction constant; jump cuts are native in selfie speech [bible §9.6].

## E. Prompt construction and caps

38. **Presets assumed a handheld product and a woman.** `presets.js` writes `{part}` hand grips, a default "relaxed woman in her late twenties", and POV/selfie beats for every product. -> Read the product class and persona first; override the defaults per intake; yard props and inflatables have no held `{part}` [presets.js fill() and PARTMAP; SKILL.md step 1 and Always].
39. **Preset `review` puts "I have used it every day for a week" in a synthetic person's mouth.** -> Personal-use claims are blocked (deceptive testimonial); demo-voiced versions only [recipe D7; presets.js review beat 2; audio §1.8].
40. **Prompts over the word cap were silently trimmed, and the trim cut the timed actions.** -> Filter now never cuts timed actions, hands, clean-frame, solo sentence or quoted speech; it drops other sentences from the end [xugc skill Build 12 "filter cutting actions"; filter.js repair protectedS]. Drop SFX words and adjectives first [SKILL.md].
41. **300-word prompts.** -> Seedance 60-100 words; Veo 60-120 plus dialogue; Kling master of 2 sentences plus shots [bible §0.3, §5; filter.js ENGINES].
42. **More than ~8 requirements: 4-5 get honoured at random.** -> Keep to few requirements per shot [bible §6 Seedance avoid].
43. **Two camera moves in one shot -> jitter.** -> Delete the second move [bible §10 fix 6; filter.js TWO_CAMERA_MOVES].
44. **Negative lists on Veo.** -> Write what you want present [bible §5.1, §6].
45. **Aspect/duration/resolution restated in Seedance text.** -> Set them in API fields [bible §5.2; filter.js ASPECT_IN_PROMPT].
46. **Wrong aspect.** -> Everything is 9:16 vertical; Kling v3_0 image_to_video has no aspect argument, the ratio follows the first image, so feed 9:16 frames [kling-mcp image_to_video]; listing images are square 1:1 (a 16:9 picture in a square frame is grey bands) [listing-images/SKILL.md rule 2]; check with ffprobe [judge-doc §5].
47. **Text drawn in the picture (captions, subtitles, titles, numbers, logos).** -> Never prompt for text; burn captions afterwards; OCR a frame every 0.5 s before our captions are burned [style/realism-rules.md #10; audio §7 check 13].
48. **The word "subtitles"/"caption" in a Veo prompt risks burned-in text.** -> State the positive form; never write the word; if text appears, regenerate [bible §5.1; recipe D6].
49. **Emotion word with no visible behaviour.** -> Give a visible trigger [bible 12.5; filter.js EMOTION_NO_TRIGGER].
50. **Copying another app's model wholesale.** -> Do not carry another app's assumptions (Fiverr pacing arrived in flip) [AGENTS r6; shipping "Him"].
51. **Do not say "golden ratio" to an image model; Gemini failed.** -> Give the moment of the frame instead [xugc skill Settled].

## F. Engine, API and money

52. **Veo reference mode needs 8 s.** Reference images, first/last frames, 1080p and 4k all require `durationSeconds` 8; up to 3 reference images; `personGeneration` allow_adult for image modes. -> The unit is an 8 s clip; 4 s and 6 s only for reference-free b-roll [bible §1; recipe D3; google.js clip()].
53. **Veo files expire in 2 days.** -> Download every `done` take on launch/at once [recipe §11.8]. Kling result URLs expire in 24 h [kling-mcp].
54. **Guessing flags, endpoints, field names (AGENTS rule 15): LTX trainer run died because `process_dataset.py` needs `--model-path` (the transformer FILE), `--text-encoder-path`, `--video-vae-path`, `--audio-vae-path`; guessed folder and left three out.** -> Read the tool's source or `--help`, run it where it can run, then write the command; if it cannot be checked here, say so BEFORE he spends [AGENTS r15; xugc skill THE RULE, Build 11].
55. **Wan training failed: RunPod torch 2.4 vs musubi needing >= 2.5.** -> Preflight (torch usable, GPU visible) before a 60 GB download; pin the commit that was read [xugc skill Build 13].
56. **First $5 training failed silently; error box was hidden.** -> Always use `showErr` for red messages; a visible last-run report; a wrong flag must fail early and loudly [xugc skill Build 10, Build 9].
57. **Fal prices and billing.** Fal bills only successful outputs and never HTTP >= 500, queue wait is free [fal]. Google bills from the moment the video starts, whatever happens next, so cancel/timeout/download failure still count [xugc skill Build 12; google.js onStarted]. -> Reserve the worst case at Approve, count a job as paid when the vendor starts it, never auto-retry `rejected`/`failed`, mark unknown submits `unknown` and keep max cost reserved [recipe §11.3, §11.5].
58. **Fal status/result URLs built by hand are wrong.** -> Use the returned `status_url` / `response_url`, never build them [fal gotcha].
59. **Fal files are public by default.** -> Set retention via the lifecycle header; keys never in the bundle or logs [fal; recipe §11.9].
60. **Seedance: realistic human faces in input images can be rejected [S]; audio refs must be MP3 3-8 s; Seedance 2.5 audio notation and API id unconfirmed.** -> Route Seedance to face-free shots until the face test passes; verify at integration; trust nothing from Seedance until read from the vendor console [recipe D4, D13; audio §2.2].
61. **Kling: `图片1` tokens for input images; v3_0 has no aspect arg on image_to_video; with video_1, `enable_audio` must be false; every call is charged, never submit trial jobs.** -> Read `who_am_i` and the schema first [kling-mcp].
62. **Alex will not pay $6 per ad.** -> Scout cheap, final on the winner; price shown before spending; failed calls still count; worst case on the Approve screen [xugc skill Session 2026-10-02; recipe §11.1, D1].
63. **Judging the scout as if it were the final.** -> A re-render is a new sample; the final is always judged on its own [recipe D1].
64. **Spending before he says go.** -> Never; every paid call needs his OK and a stated price [xugc skill Build 5 "Never again"; SKILL.md Always].
65. **Sending videos in chat.** -> The video appears in the app, not in chat [xugc skill Build 5].
66. **Nano Banana/Gemini frames: one product per job, references once, look at every frame.** -> `render -> look -> place`; about one in three comes back with a carried-over headline or error [listing-images/references/prompt-spine.md "Running the job"].
67. **Never overwrite a file in R2 (cached immutable for a year).** -> Always a new filename [listing-images/SKILL.md rule 5].
68. **Training on outputs.** -> Veo/Seedance/Kling outputs are never training data; LoRA data must be own footage, releases, licensed stock [recipe D20; xugc skill Plan 4].
69. **Voice law.** -> Engine-invented, stock, or a clone with a signed release; never a real creator or public figure; never strip SynthID/C2PA [recipe §10.9; orch §8.7].

## G. Sound and audio

70. **A real -19 dB take sounded silent because the app played it muted.** -> The app plays unmuted; check the file has an audio track, then listen on the sound button before judging [xugc skill Realism rules #8; style/realism-rules.md #8].
71. **First real LTX clip: near-silence at 0-2 s and 10-15 s.** -> Sound described second by second and audible from frame one; LTX audio is always post-processed with the floor layer [xugc skill Build 5; audio §2.4].
72. **Too-clean silence, constant-level room tone, studio-dry voice in a bathroom, foley 80+ ms off the frame, repeating loops, vocoder fizz above 12 kHz.** -> Living noise floor, room-matched reverb, foley within +/-40 ms, no loops [training/04-sound.md synthetic-audio list].
73. **Music requested from an engine, or sudden volume jump.** -> "no music" in every prompt; music in post only, licensed [bible §5.2; recipe §10.5; style/never-do.md].
74. **Mixing engines across one speaker is the loudest seam.** -> One speaker, one engine per ad [bible §9.4].
75. **Each clip has its own tone and level.** -> Level-match to -16 LUFS per clip, constant room-tone bed, 40-80 ms audio fades at cuts, finished ad two-pass loudnorm -14 LUFS / -1.5 dBTP [recipe D9; orch §8.4].

## H. Process (AGENTS section 3 and shipping, as they touch generation)

76. **Never send him something you have not run (rule 1).** -> Run it; nothing in the real-life docs ran until the first real clip, so mark CHECK-ON-MAC items and run them [AGENTS r1; judge-doc preface; audio preface].
77. **A syntax check is not a test (rule 2).** -> If it has a loop, a test drives the loop [AGENTS r2; shipping].
78. **Never assume an edit landed (rule 3).** -> Assert the anchor exists, check the result; after a range replace, count what should still be there [AGENTS r3; shipping; xugc skill Build 10].
79. **Never design something you cannot see (rule 4).** -> Look at the frame before saying anything about it; render and open anything he will look at [AGENTS r4; shipping "Before packing"].
80. **Answer the question he asked (rule 5).** [AGENTS r5].
81. **Never report success you have not verified (rule 7).** -> Quote what you saw in frames; "it's fixed" after an edit is a guess [AGENTS r7; style/realism-rules.md #9; xugc skill Build 5 "Never again: judging a video fine without comparing it to the brief frame by frame"].
82. **Do not hand work back to him (rule 9).** [AGENTS r9].
83. **Never guess about a running system (rule 12).** -> Run the request, read the row, fetch the page [AGENTS r12].
84. **Stale caches are the app (rule 13).** -> Put the build number on screen and state it [AGENTS r13; shipping].
85. **NEVER GUESS. Read the source, run it, then write it (rule 15).** Training/rental flags never "from memory" or "from the README summary"; the first paid run is as cheap as possible and unable to fail silently [AGENTS r15].
86. **A preview that flatters is worse than none.** -> Do not trust a second opinion that agrees with you; render the real thing [shipping "Tests and previews that lie"]. Applies to judging: the judge scores from a defect list, not from prose [judge-doc §1.3].
87. **Fix failed twice at the same layer -> the layer is wrong.** -> Stop tuning; a field that fails identically twice is a spec problem, simplify it [shipping "The one pattern"; judge-doc §10.6; recipe §4.5].
88. **Name the assumption in one sentence and prove it or mark it unproven, in writing, to him.** -> [shipping "The one pattern"].
89. **He thinks out loud; build only when he says build.** -> Answer short and wait unless he says build/make/do/go [AGENTS section 1].
90. **Never ship a partial build without saying exactly what it is (build 13 came before the UI).** [xugc skill Build 13+14].
91. **Never tell him to run something in a terminal; put it in the app.** [AGENTS section 1; shipping "Him"]. (The filter one-liner in SKILL.md is for the agent, not for him.)
92. **Customer-facing copy is confident, never apologetic.** A late or failed email is fixed and sent as if nothing happened [AGENTS section 1].
93. **Never invent a fact.** Sizes, power, what is in the box come from the product record [listing-images/SKILL.md rule 6; bible 12.4].
94. **His Mac is an Intel MacBook Air (2020), 8 GB.** -> Build x64; Mac-side judge work is ffmpeg gates, small Whisper, OCR; captioning runs on the rented GPU [shipping "His Mac is Intel"; recipe D12].
95. **Ads that look best still fail on Meta/TikTok policy.** -> No medical/cure/guarantee claims, no unverified superlatives, no franchise or celebrity [bible §6; recipe forbidden.default; listing-images/references/bad-examples.md #2].

---

## Compact pre-flight (tick every line before paying)
- [ ] Product class and real size read from the real page and photos (A/B/C/D).
- [ ] Only clean text-free frames attached; each reference has a job sentence.
- [ ] One shot, one action, one camera idea, one speech line; beats on 0 / 1.17 / 3.06 / 4.94 / 6.11 / 8.00.
- [ ] Hands sentence, clean-frame sentence, one-person sentence present (or crowd listed by role).
- [ ] Sound paragraph: never silent, deep hit at 4.94, no music.
- [ ] No text, no logo not on the product, no hooded/robed hate-adjacent look, no testimonial claim, no apology.
- [ ] Inside the engine's word cap and field rules; `filter.js` returned ok.
- [ ] Price stated and Alex said go. Then render, then judge frame by frame (judge.md), then say what you saw.
