# 04 - Judge and Evaluation (Real Life)

Owner: Evaluation and preference-learning lead. Date: 2026-10-02.
Scope: how XUGC picks the best take of a shot before Alex sees it, and how his thumbs teach the system.

Rule 15 applies: anything marked CHECK-ON-MAC is a command/flag that must be read from `--help` and run once before shipping. Nothing here was run in the sandbox.

---

## 1. What the field does (and what we take from it)

### 1.1 Human preference collection and reward models
- **VideoReward / VideoAlign (Kling team, NeurIPS 2025)**: 182k human annotations, three axes (Visual Quality, Motion Quality, Text Alignment), a VLM backbone trained with a Bradley-Terry-with-ties objective on pairwise comparisons. It was then used for Flow-DPO, Flow-RWR (training) and Flow-NRG (inference-time guidance). Flow-DPO beat supervised fine-tuning and Flow-RWR. Lesson: preference data is pairwise (A vs B, tie allowed), per axis, not one scalar. https://arxiv.org/abs/2501.13918 , https://github.com/KlingTeam/VideoAlign , https://gongyeliu.github.io/videoalign/
- **VisionReward**: fine-grained multi-dimensional preference as many yes/no checklist questions, aggregated linearly. This is the closest published pattern to what a vision-LLM judge with a checklist does. https://arxiv.org/pdf/2412.21059
- **MJ-Video**: fine-grained benchmark and reward model for video preferences. https://arxiv.org/pdf/2502.01719
- **VideoScore2 / FIRM-Video**: VLM reward models that emit multi-dimensional scores with rationales; FIRM-Video's point is "check before you score", i.e. verify claims against the frames first. We copy this: the judge lists defects found, then scores. https://arxiv.org/pdf/2608.21839
- **VideoDPO**: build preference pairs by generating N videos per prompt, scoring them, and taking highest vs lowest as (win, lose). This is exactly the pipeline XUGC's takes produce for free. https://arxiv.org/abs/2412.14167 , https://videodpo.github.io/

Can we run these on a Mac? VideoReward/VideoScore are multi-billion-parameter VLMs built for CUDA; not a Mac-offline option. Treat them as "rent GPU later" for scoring at scale. For v1 the judge is Claude (API) plus ffmpeg.

### 1.2 Automatic metrics
- **VBench (16 dimensions)**: subject consistency, background consistency, temporal flickering, motion smoothness, dynamic degree, aesthetic quality, imaging quality, object class, multiple objects, human action, color, spatial relationship, scene, temporal style, appearance style, overall consistency. Built on CLIP, RAFT optical flow, GRiT, RAM, LAION aesthetic predictor, IQA-PyTorch, ViCLIP, Detectron2. Install needs CUDA torch and Detectron2 (CUDA 11.x/12.1). Verdict: not usable offline on Alex's Intel Mac; usable on a rented GPU. Several of its ideas are cheap to imitate (flicker = frame-difference, smoothness/dynamic = optical flow). https://github.com/Vchitect/VBench , https://arxiv.org/pdf/2311.17982
- **VBench-2.0 (18 dimensions, 5 groups)**: Human Fidelity, Controllability, Creativity, Physics, Commonsense. Uses VLMs/LLMs plus specialist anomaly detectors, i.e. the same hybrid we design here. The Human Fidelity group (anatomy, identity) is what matters for UGC. https://arxiv.org/html/2503.21755v2 , https://vchitect.github.io/VBench-2.0-project/
- **Artifact-Bench (2026)**: benchmark for MLLMs detecting realism artifacts in AI video (real vs AI, pairwise realism, fine-grained artifact ID). Use its taxonomy idea: name the artifact type, point to frames. https://arxiv.org/pdf/2605.18984
- **Temporal drift** (face/identity creeping over seconds) is a named production problem; sample first/middle/last frames and compare. https://imerit.ai/resources/blog/solving-temporal-drift-in-ai-generated-video/
- Open-source flicker tool, reference only: https://github.com/belentani7/temporal-artifact-detector

Takeaway: published automatic metrics measure generic quality. None of them knows our product, our Style Bible, or "looks like an iPhone". Our own rubric carries that.

### 1.3 Vision-LLM-as-judge: known biases
- Position bias (order of candidates flips verdicts), verbosity bias (MLLMs are reported even more vulnerable to it than to position bias), self-preference bias. https://arxiv.org/pdf/2402.04788 , https://arxiv.org/pdf/2410.21819 , https://arxiv.org/html/2604.11589v1 , https://arxiv.org/pdf/2604.18164 , https://arxiv.org/pdf/2604.23178
- Our mitigations, baked into the design below: (a) absolute checklist scoring per take, not "which is better" as the primary signal; (b) when ranking finalists, run the pairwise pass twice with order swapped and only accept agreement; (c) the judge model is Claude, and no take is made by Claude, so self-preference does not apply; (d) cap rationale length, score from a defect list not from prose; (e) calibrate against Alex's thumbs (section 7) and measure agreement.

### 1.4 Best-of-N and RL for diffusion
- Best-of-N (generate N, keep top reward) is the standard inference-time baseline and beats naive single sampling in video diffusion; it wastes compute on low-reward samples, and smarter search (particle/beam) is better but needs model internals we do not have on Veo/Seedance/Kling. https://arxiv.org/html/2501.06848v3 , https://arxiv.org/pdf/2503.19385 , https://arxiv.org/html/2505.17618v1
- The size of the gain depends on how good the judge is. I found no published number applicable to closed APIs, so XUGC measures its own: log judge-pick vs Alex-pick agreement and thumbs-up rate of picked vs random take (section 8). That is the real number and it costs nothing extra.
- Training: Diffusion-DPO (pairs), Flow-GRPO (online RL, needs a reward model), Flow-DPO/RWR/NRG (VideoAlign). For the own LTX LoRA the practical route is DPO on (win, lose) pairs from our takes. https://arxiv.org/pdf/2412.14167 , https://arxiv.org/pdf/2605.07503 , https://arxiv.org/abs/2501.13918 . Closed models (Veo, Seedance, Kling) cannot be trained; for them preferences only change the prompt and the pick.

---

## 2. Judge architecture (three stages)

```
take.mp4 (per model)
  Stage 0  ffmpeg gates (free, local, seconds)  -> hard-fail or numbers
  Stage 1  Claude vision per take (absolute rubric, 10 frames + audio facts)
  Stage 2  Pairwise tie-break among top 2 (swap order twice) only if scores within 0.4
  -> ranked takes, winner shown to Alex with 1-line reason; losers kept in Library
```

---

## 3. Rubric (0-5, weighted)

Scale: 0 = unusable, 1 = obvious defect, 2 = noticeable defect, 3 = acceptable, 4 = good, 5 = indistinguishable from a real phone clip.

| # | Criterion | Weight | What 5 looks like |
|---|---|---|---|
| 1 | Product fidelity (shape, colour, logo/label, proportions vs reference image) | 25% | Matches reference in every frame, no morphing when handled |
| 2 | Hands and body (5 fingers, joints, grip contact, no fusing with product) | 20% | Natural hands, correct contact |
| 3 | Face and identity stability (no drift between first/last frame, no uncanny eyes/teeth) | 15% | Same person throughout, natural micro-expression |
| 4 | iPhone realism (handheld micro-shake, exposure, noise, vertical framing, no cinematic grade, no studio lighting) | 15% | Reads as shot by a friend on an iPhone |
| 5 | Motion and physics (no flicker, no rubber limbs, objects obey gravity, smooth) | 10% | Nothing floats or warps |
| 6 | Brief adherence (action, setting, wardrobe, duration beats from the shot prompt) | 10% | Everything requested is there, nothing extra |
| 7 | Audio (voice intelligible and in sync with lips, no robotic artefacts, level OK, no music unless asked) | 5% | Clean room-tone speech, lips match |

Score = sum(weight x criterion score) / 5, giving 0-100. Ship threshold: 70. Below 70 with no passing take, the app re-rolls (section 6) before Alex sees anything.

### Hard-fail rules (take is rejected regardless of score, score forced to 0)
1. Wrong product: different object, different colour, different shape, or product absent when the shot requires it.
2. Melted or malformed hands: wrong finger count, fused fingers, a hand merging into the product, extra limbs, visible in any sampled frame for more than a glance.
3. Face drift to a different person, or a face that collapses (eyes/teeth warping).
4. Unwanted text: garbled or invented letters anywhere in frame, watermarks, fake captions, fake brand names. Exception: text that is on the real product label and matches the reference.
5. Offensive, sexual, violent, or cult-like imagery: symbols resembling occult/cult or hate symbols, ritual gestures, group chanting scenes, nudity beyond brief, minors in any unsafe context, real celebrity likeness. Black Reaper (Halloween) shots may be dark in tone but must not contain real religious/hate symbols.
6. Black or frozen output, or duration off by more than 20% of requested.
7. Product claim the brief did not contain (e.g. on-screen health claim) spoken in audio.

Each hard-fail records a reason code (`WRONG_PRODUCT`, `HANDS`, `FACE`, `TEXT`, `UNSAFE`, `BROKEN_FILE`, `CLAIM`) so thumbs and rules can attach to it.

---

## 4. Frames and audio the judge sees

- 10 frames per take at fixed relative times: 0%, 10%, 25%, 40%, 50%, 60%, 75%, 90%, 98%, plus the frame of max inter-frame difference (action peak). Every frame full resolution scaled to long edge 1024 (vision-LLM sweet spot, keeps finger detail).
- Plus 2 close-up crops of the hands region when hands are present: take frames 40% and 60%, crop around the product/hands (use the centre-lower region as default; refine later with a hand detector).
- The reference product image (always first), and the reference avatar image if one is used.
- Audio is not heard by the judge. Pass it facts: loudness (LUFS), peak, silence ratio, and the speech transcript with word timestamps from local Whisper (CHECK-ON-MAC). Lip-sync judgement is done on 3 frames at transcript word onsets: "is the mouth open when a word starts?" This is a coarse check, not a sync model; label it so.
- Frame extraction (CHECK-ON-MAC with `ffmpeg -h`): `ffmpeg -ss <t> -i take.mp4 -frames:v 1 -vf scale=-2:1024 f_<n>.jpg`.

---

## 5. Stage 0: cheap automatic checks (ffmpeg, local, free)

Filters to verify exist in the Mac's ffmpeg build (`ffmpeg -filters | grep <name>`): `blackdetect`, `freezedetect`, `silencedetect`, `ebur128`, `signalstats`, `scdet`, `blurdetect` (newer builds only), `mpdecimate`, `ssim`/`psnr`.

| Check | Method | Rule |
|---|---|---|
| Black frames | `-vf blackdetect=d=0.2:pix_th=0.10` | any black interval >0.2 s, or first frame black: fail BROKEN_FILE |
| Frozen video | `-vf freezedetect=n=-60dB:d=1` | freeze >1 s: fail |
| Blur / soft focus | `blurdetect` if present, otherwise variance of Laplacian on extracted frames (Python/numpy or `-vf` edge stats) | median sharpness below an empirical floor: score cap 2 on criterion 4 |
| Flicker | per-frame mean luma from `signalstats` (YAVG); flag if the std-dev of frame-to-frame YAVG change exceeds a calibrated cap. Mirrors VBench's temporal-flickering idea | feed number to judge; severe = fail |
| Hard cuts inside one shot | `scdet` / `select='gt(scene,0.4)'` | a cut in a single-take shot: penalty on criterion 5 |
| Loudness | `-af ebur128` (integrated LUFS, true peak) | target about -16 LUFS for speech; below -35 LUFS or true peak above -1 dBTP: criterion 7 capped at 2 |
| Silence | `silencedetect=n=-45dB:d=0.7` | silence >70% of the clip when speech expected: fail |
| Resolution / fps / duration | `ffprobe` | must be 9:16, >=720x1280, duration within 20% of ask |
| Compression noise | optional later | skip in v1 |

Calibration: run these on 10 real iPhone clips and 10 known-bad generations once, set thresholds from those, store thresholds in settings. Do not ship guessed thresholds.

---

## 6. How many takes to render, and cost/benefit

Cost reference from the XUGC skill: roughly $0.15-0.50 per 5 s clip on open models, $1-3 per finished ad (estimates until measured). Closed APIs (Veo 3.1, Seedance, Kling) price per second; get current prices from each provider's pricing page before committing, I did not look them up.

Policy (adaptive, not fixed):
1. Round 1: render 1 take on each of the 3 closed models (3 takes) for the shot. This is model diversity, which beats resampling one model because the failure modes differ (hands vs face vs product).
2. Stage 0 + Stage 1 on all three. If best score >= 80: stop, ship it.
3. If best is 70-79: ship it, but queue 1 extra take on the winning model in the background only if the budget setting allows.
4. If none >= 70: Round 2: 2 more takes on the best-scoring model with the judge's top defect turned into a prompt fix (for example "hands rest flat on the table"). Max 5 takes per shot, then show Alex the best with an honest low-score badge.
5. Cost guard: the judge costs one vision call of 10-12 images per take, about a cent or two; negligible next to a generation. The rule of thumb: judging is about 1-3% of the cost of generating, so always judge everything.

Expected benefit: each extra take only pays if takes are independent and the judge is accurate. We do not claim a number; the app logs "winner's later thumb-up rate vs median take" per model, and the take count is tuned from that data after about 50 shots.

---

## 7. The exact judge prompt (Stage 1)

System:
```
You are the quality judge for XUGC, an app that makes photoreal iPhone-style UGC video ads.
You are given: (1) the reference product image, (2) optionally the reference avatar image,
(3) 10 frames from one generated video in time order, (4) 2 hand close-ups, (5) measured
facts about the file, (6) the shot brief. You judge ONLY what is visible in these images and
facts. If something is not visible, say NOT_VISIBLE; never invent. Do not reward length, polish
or cinematic look: this must look like a friend filmed it on an iPhone.
Work in this order: first list defects you can point to, with frame numbers; then score.
Respond with JSON only, no other text.
```
User template:
```
SHOT BRIEF: {brief}
PRODUCT NAME: {product}  (must match image 1: shape, colour, label text)
ALLOWED ON-SCREEN TEXT: {label_text_on_product or "none"}
STYLE BIBLE RULES THAT APPLY: {active_style_rules}
FILE FACTS: duration={d}s, fps={fps}, loudness={lufs} LUFS, true_peak={tp}, silence_ratio={sr},
flicker_index={fi}, sharpness={sh}, transcript="{words with timestamps}"
IMAGES: 1=product ref, 2=avatar ref, 3..12=frames F1..F10, 13..14=hand crops H1..H2

STEP 1 - HARD FAIL CHECK. For each code, answer true/false with frame evidence:
WRONG_PRODUCT, HANDS (wrong finger count, fused or merged with product, extra limb),
FACE (different person between F1 and F10, collapsed eyes/teeth), TEXT (any legible text not
in ALLOWED ON-SCREEN TEXT, any watermark or garbled letters), UNSAFE (offensive, sexual,
violent, cult-like, occult or hate symbols, ritual or group-chant imagery, real celebrity
likeness), CLAIM (spoken claim not in brief).

STEP 2 - DEFECT LIST: up to 8 items {frame, region, type, severity 1-3}.

STEP 3 - SCORES 0-5 (integers) with one short reason each (max 15 words):
product_fidelity, hands_body, face_identity, iphone_realism, motion_physics,
brief_adherence, audio.
Scoring anchors: 5 = no defects found; 4 = one minor; 3 = noticeable but ad still usable;
2 = would make a viewer suspect AI; 1 = obvious; 0 = unusable. If a hard fail is true, still score.

STEP 4 - fix_hint: one sentence prompt change that would remove the top defect.

JSON schema:
{"hard_fails":{"WRONG_PRODUCT":bool,"HANDS":bool,"FACE":bool,"TEXT":bool,"UNSAFE":bool,"CLAIM":bool},
 "evidence":{"<code>":"F#: ..."},
 "defects":[{"frame":"F#","region":"...","type":"...","severity":1}],
 "scores":{"product_fidelity":0,"hands_body":0,"face_identity":0,"iphone_realism":0,
           "motion_physics":0,"brief_adherence":0,"audio":0},
 "reasons":{"<criterion>":"..."},
 "fix_hint":"..."}
```
The app, not the model, computes the weighted total and applies hard-fail zeroing (so the model cannot be talked into a total).

Pairwise tie-break prompt (Stage 2, only when top two totals differ by <4 points): show both take frame-sets labelled A/B, ask "which would a viewer more likely believe was filmed on an iPhone, and which has fewer product/hand defects? Answer A, B or TIE with one sentence." Run again with A/B swapped; accept only if both runs agree, otherwise keep the higher absolute score. This addresses position bias.

---

## 8. Feedback loop: thumbs to Style Bible to training data

### 8.1 What is stored per take
`take_id, shot_id, model, prompt_text, style_rules_active[], judge_json, total, hard_fails[], file_facts, alex_thumb (up/down/none), alex_reason_tag (optional), picked_by_judge (bool), shown_to_alex (bool)`.

### 8.2 Thumb capture (one click, no typing)
- Thumbs up / down on the shown winner. On thumbs down, show 6 one-click reason chips: Product wrong, Hands, Face, Looks fake/AI, Text/logo, Other. One tap, optional. This maps directly onto judge codes.
- Also let Alex tap "better" on a non-winning take in the Library: that is the strongest signal (a judge miss).

### 8.3 Thumbs to Style Bible (prompt rules)
- A rule is a one-line instruction in the Style Bible (the existing `xugc_style_write` mechanism). Candidates are proposed automatically, never applied silently.
- Promotion rule: when the same defect type or reason chip appears on >=3 thumbs-down takes across >=2 shots, Claude drafts a rule (for example: "Hands: keep fingers visible and still while holding the product; avoid fast hand rotation"). Alex sees it as "Add this rule? Yes / No" once. Alex's latest instruction wins on conflicts (AGENTS.md).
- Demotion: a rule whose takes show no improvement (thumb-up rate, judge score) after 10 uses is flagged for removal.
- Positive rules: a phrase present in >=80% of thumbs-up prompts and <40% of thumbs-down prompts becomes a suggested "keep" rule.
- Per-model rules: Veo, Seedance, Kling fail differently; rules carry a `model` tag, so a hands fix for Kling does not pollute Veo prompts.

### 8.4 Thumbs to judge calibration
- Weekly (or every 30 rated takes): compute agreement = fraction where judge's pick = Alex's pick, plus per-criterion correlation with thumbs. If the judge systematically over-scores a criterion Alex thumbs down on (for example realism), raise that weight or tighten its anchor text. Keep a held-out set of 20 Alex-rated takes as a fixed regression test for any change to the judge prompt.
- Judge disagreement is the most valuable data; surface it in Train tab, not to Alex as a chore.

### 8.5 Thumbs to training data (own LTX LoRA)
- Positive set: takes with thumbs-up and judge total >=80, any model, but only usable for training if the source model's terms allow it. The XUGC skill already says the LoRA dataset must be legal: own footage, paid creators with releases, licensed stock, never output from closed generators. Therefore outputs of Veo/Seedance/Kling are NOT training data; they are only used as preference signal for prompts and judge calibration.
- Training pairs for DPO (VideoDPO pattern) are built from takes of OUR OWN LTX model only: per prompt, N takes from the LoRA, score with judge plus thumbs, pair best vs worst. Needs about a few thousand pairs before DPO is worth a GPU run; before that, use the pairs to evaluate LoRA checkpoints (win-rate of new vs old checkpoint under the judge, spot-checked by Alex).
- First paid training run must be cheap and fail loudly (Rule 15): read the trainer's own source/`--help` for the exact version before writing flags.

---

## 9. Build order for the judge (smallest thing that works)
1. Stage 0 ffmpeg gates plus frame extraction, run on 20 clips to calibrate thresholds.
2. Stage 1 prompt, JSON parse, app-side weighted total. Test on 10 good and 10 bad clips; confirm hard-fails trigger on a known wrong-product and a known bad-hands clip.
3. Take policy (section 6) and winner display with one-line reason.
4. Thumb capture and storage; Style Bible rule proposals.
5. Pairwise tie-break and weekly calibration report.
6. Later: rented-GPU VideoReward/VBench scoring as a second opinion once there are hundreds of takes.

Nothing in this document has been run; the first test is step 1 on real clips.

---

## 10. Spec-compliance check (added on Alex's requirement: "Real life, real life, real life")

The general rubric (sections 3-7) asks "is it good". This section asks "is it exactly what the director specified, and does it obey real physics". It runs in the same Stage 1 call (one vision call, extra fields) so it costs nothing extra in calls. Spec-driven checklists are the VisionReward pattern (many yes/no questions, aggregated): https://arxiv.org/pdf/2412.21059 ; verifying evidence before scoring follows FIRM-Video: https://arxiv.org/pdf/2608.21839 ; physics/commonsense/human-fidelity as separate judged groups follows VBench-2.0: https://arxiv.org/html/2503.21755v2 .

### 10.1 Shot spec fields the director must emit (JSON, every field required, ids stable)
`product{name, shape, colour, material, label_text, size_vs_hand, reference_image_id}` | `person{count, age_range, gender, hair, skin_tone, wardrobe, identity_ref_id}` | `setting{room, surfaces, props_allowed[], time_of_day, light_direction, light_colour}` | `beats[]{id, t_start, t_end, action, cause, effect, camera, sound}` | `speech{line, language, start_beat, voice}` | `text_rules{allowed_text[], captions:false|true, watermark:false}` | `forbidden[]` (default list in 10.4) | `duration`.
Every beat must name a physical cause for every movement (hand pushes lid, lid moves). A beat with an effect and no cause is rejected by the director before rendering.

### 10.2 How each field is verified (frames and yes/no questions)
Frames: the 10 standard frames (section 4) are replaced by spec-driven sampling: F1 (t=0.1s), one frame at the START and one at the END of every beat (t_start+0.1s, t_end-0.1s), plus 2 hand close-ups at the beat that touches the product, plus the last frame (duration-0.1s). For a 3-beat 15 s ad that is about 10-12 frames; cap 14. Audio: transcript with word timestamps and per-beat loudness/silence from ffmpeg (Stage 0), mapped to beat windows.

| Field | Frames | Questions (answer YES / NO / NOT_VISIBLE, each with frame id) |
|---|---|---|
| product.shape/colour/material | all frames where product visible | Is the product the same shape as the reference in every visible frame? Is the colour within the same hue family as the reference? Any part added, missing, or changed size between frames? |
| product.label_text | product close-up frames | Is any text on the product legible, and does it equal label_text exactly? Is any other text present? |
| product.size_vs_hand | hand close-ups | Is the product's size relative to the hand within the spec ratio? |
| person.count | every frame | Count visible people (including reflections, photos, background figures). Equals spec count? Any extra person at any time? |
| person.attributes/identity | F1, mid, last | Same person in first, middle, last frame (face shape, hair, skin tone, wardrobe unchanged)? Matches identity ref? |
| setting | F1, mid, last | Same room and same props throughout? Any prop not in props_allowed or prop appearing/disappearing between frames? Light direction and colour consistent? |
| beats | start/end frame pair per beat | Is the beat's action completed between the start and end frames? Did the stated cause occur before the stated effect (see 10.3)? |
| sound per beat | audio facts + transcript | Is the specified sound present in that window (for example "lid click" = a transient)? Any unspecified music? |
| speech | transcript + 3 mouth frames at word onsets | Does the transcript equal the line word for word (edit distance <= 10%)? Does speech start inside the specified beat? Is the mouth open at word onsets? |
| text_rules | every frame | Any caption, subtitle, watermark, logo or sign text not in allowed_text? |
| forbidden | every frame + transcript | Any item from the forbidden list present? |
| duration | ffprobe | Within 10% of spec? |

### 10.3 Physics and "real life" questions (every beat pair)
1. Does any object change position between consecutive frames with no visible hand, body or force contacting it? (movement without cause)
2. Does any object appear, vanish, multiply, change size, or change colour between frames?
3. Do hands grip the product with plausible contact (fingers wrap or press, no hover, no pass-through)?
4. Does liquid, fabric, hair respond in the right direction to the action (gravity, momentum)?
5. Do shadows and highlights keep the spec'd light direction as the object moves?
6. Is the camera motion handheld-plausible (small continuous drift) rather than gliding, teleporting or snap-zooming?
7. Is the pace of the action human (no instant completion of a multi-second action)?
Any YES to 1, 2 (or NO to 3) is a physics hard-fail `PHYSICS` with the beat id.

### 10.4 Spec hard-fail codes (added to section 3)
`WRONG_PRODUCT`, `EXTRA_PERSON` (person count differs at any frame), `TEXT_OR_CAPTION` (any text not allowed; includes subtitles and watermarks), `HANDS`, `FACE`, `PHYSICS`, `SETTING_DRIFT` (props or room change), `SPEECH_MISMATCH` (>10% word edit distance or wrong beat), `FORBIDDEN`, `UNSAFE` (hateful, cult-like or occult symbols, ritual or group-chant imagery, sexual, violent, real-celebrity likeness). Default forbidden list: logos of other brands, extra people, captions, music, text overlays, mirrors showing a second person, pets unless specified, medical/health claims.

### 10.5 Reporting the failing field so the prompt repairs itself
Judge returns, in addition to section 7 JSON:
```
"spec_check":[{"field":"beats[2].action","verdict":"FAIL","frames":["F6","F7"],
               "observed":"lid is open in F6 with no hand touching it",
               "expected":"hand presses lid closed, then lid is closed",
               "code":"PHYSICS","repair":"add to beat 2: 'her thumb visibly presses the lid down before it closes'"}]
```
Rules: `field` is the spec path, so the app maps it to the exact prompt sentence generated from that field. `observed` must cite a frame. Repair strategy by code: PHYSICS/beat fails -> make the cause explicit and slower in that beat's sentence; EXTRA_PERSON -> add "only one person in the frame, no one else visible, empty background" and move to forbidden; TEXT_OR_CAPTION -> add "no text, no captions, no logos anywhere"; WRONG_PRODUCT -> attach reference image again and restate shape/colour/label first in the prompt; SETTING_DRIFT -> shorten the shot or lock the prop list; SPEECH_MISMATCH -> shorten the line. The app edits only the failing field's sentence, never rewrites the whole prompt, so passing fields stay passing. Repairs are logged as candidate Style Bible rules (section 8.3).

### 10.6 Retry policy and cost cap
- Per shot: round 1 = 3 models in parallel (section 6). Judge all.
- Pass = no hard fail and total >= 70 and all `spec_check` fields PASS.
- If no model passes: repair loop 1: apply the repairs to the best-scoring model's prompt AND to the second best (2 takes). Judge.
- Still failing: repair loop 2: 2 takes on the single model with fewest failing fields. Judge.
- Max 2 repair loops, max 7 generations per shot total. After that, the app stops and shows Alex the best take with the exact failing fields in plain language ("hands are fused in the middle beat"), and offers one button: "Try 2 more" or "Accept". It never loops silently past the cap.
- Cost cap: per-shot budget set in Settings (default = 7 generations at the cheapest model prices). The app shows the running cost on the render screen and stops at the cap. A spec that fails identically on the same field in both loops is a spec problem; flag the field to the director to simplify it instead of burning takes.
- The same failing field on 3 different shots logs a Style Bible rule proposal (section 8.3).
