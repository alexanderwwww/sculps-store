# Real Life 02 — Data and curation

Owner: Data & Curation Engineer. Scope: how the footage becomes a training set, how captions are written, how viral ads become knowledge without becoming training data, and how Alex's thumbs become training signal. No GPU, no spend, no keys. Everything below runs on Alex's Mac.

Convention in this file: **[cited]** = number or method taken from a source listed at the end. **[ours]** = a threshold I am setting for XUGC because no source fixes it; each one is checked against the 237 pieces in the dry run (section 9) before it is trusted.

---

## 0. The answer in ten lines

1. Big teams cut to single shots, then drop clips by motion, blur, aesthetics, text/watermark, and near-duplicate, in that order, and keep a much smaller, stricter set for the last stage. Stable Video Diffusion went 580M clips to 152M, then fine-tuned on only 250K high-fidelity clips. HunyuanVideo drops half to four-fifths of the data at each resolution stage. Quality beats quantity at the end of training.
2. A style/behavior LoRA does not need volume. LTX says start with the smallest set that cleanly shows the behavior; the LTX trainer guide gives 10-25 clips for a small concept, 25-50 standard, 50-100 complex, 100+ large. Our first LoRA used 100. That was already in the big-LoRA band. The problem is not count, it is coverage and caption quality.
3. Target set for Real Life v2: **320 clips kept after filtering** (from about 500 collected), tagged on three axes at once: behavior, place, sound. Section 4 has the grid.
4. Filter thresholds in section 3. Duplicates are removed at cosine 0.95 on clip embeddings, and no more than 6 clips per source video.
5. Captions are a single paragraph in LTX-2's four-marker format ([VISUAL] [SPEECH] [SOUNDS] [TEXT]), generated locally by Qwen3-Omni, then checked by a rule script, then by Alex on a 10% sample. Trigger word `xugciphone` is prepended by the trainer, not typed.
6. Holdout is by **creator**, not by clip: 4 whole creators (about 10% of clips) never enter training. A fixed 40-prompt eval set is run on every LoRA checkpoint.
7. Reference ads are analysed into a JSON "ad card" (shot list, hook, pacing, audio, claims) by a local pipeline. The card is the only thing that leaves the analyzer. The footage is never in the training set, never in a prompt as an image, and the card holds no frames.
8. Thumbs: 👍/👎 on every XUGC output plus tap-chips for the reason. 👎 reasons feed the never-do list now and hard-negative captions and preference pairs later. 👍 outputs are never trained on as targets by default.
9. Alex's rule (AGENTS.md, rule 15): thresholds and flags above that are not marked [cited] are proposals until the dry run on his Mac prints what they do to the real 237 pieces.
10. Rights, said once: the clips come from creators' public videos. That is Alex's decision and the data stays on his Mac. It is still unlicensed third-party footage; a LoRA trained on it cannot be un-trained if a creator objects. Keep the source list (it already exists) so any creator can be removed and the LoRA retrained.

---

## 1. How video-model teams curate (what we copy and what we skip)

### 1.1 Shot splitting
- Stable Video Diffusion ran cut detection in a cascade at three frame rates and found about 4x more clips than the metadata had, so cuts and fades were hiding inside "single" clips. [cited: SVD]
- HunyuanVideo uses PySceneDetect plus TransNetV2 to find boundaries, and (v1.5) a separate transition classifier to throw away dissolves and wipes. [cited: HunyuanVideo, HunyuanVideo 1.5]
- NVIDIA Cosmos Curator defaults to TransNetV2 for splitting. [cited: Cosmos Curator]
- LTX's own trainer ships `split_scenes.py` with `--filter-shorter-than 5s`. [cited: LTX dataset doc]
- **We do:** our 237 pieces are already cut to 3-6 s, but cutting was by time on whole videos, not by shot. Re-run shot detection **inside each piece** and drop any piece with an internal cut. Creator videos are full of jump cuts; a LoRA trained on them learns to jump-cut mid-clip.

### 1.2 Quality filters
| Filter | Who does it | Method / value |
|---|---|---|
| Static clips | SVD (optical flow at 2 fps, mean magnitude threshold), HunyuanVideo, Open-Sora | Motion score range 0.001 to 0.3: below is static, above is jitter/flicker [cited: Open-Sora Plan v1.3] |
| Blur / sharpness | HunyuanVideo 1.5 (sharpness, detail, noise, dynamic range); HunyuanVideo (OpenCV Laplacian to pick sharp start frames) | Laplacian variance [cited method] |
| Aesthetic | SVD (CLIP aesthetic on first/middle/last frame); Open-Sora Plan (threshold 4.75); Cosmos (Aesthetic Predictor v2.5 on SigLIP) | 4.75 on the LAION-style scale [cited: Open-Sora Plan] |
| Overall quality | HunyuanVideo uses Dover | |
| On-screen text | SVD (OCR area ratio), Open-Sora (EasyOCR at 1 fps; max crop 20%) | |
| Watermark / logo / borders / collages | HunyuanVideo (YOLOX-style detector; crop and discard if less than 60% of frame survives), HunyuanVideo 1.5 (padding, stitching, grids) | |
| Duplicates | HunyuanVideo (VideoCLIP embeddings, dedup and concept balance), Cosmos Curator (k-means then cosine within cluster) | SemDeDup: keep the sample nearest the cluster centroid [cited] |

**Important difference for us.** Web-scale teams want *clean cinematic* clips, so they use aesthetic score as a "higher is better" gate. XUGC Real Life wants the opposite look: an iPhone, handheld, slightly imperfect. An aesthetic gate set at 4.75 would throw away the exact footage we want. So aesthetic score is used as a **floor against ugly-broken** (very low) not a ceiling, and we add the "phone-real" checks in 3.2.

### 1.3 Captioning
- HunyuanVideo: an in-house VLM writes JSON-structured captions (short + dense description, background, style, shot type, lighting, atmosphere) and a separate classifier labels 14 camera movement types. [cited]
- HunyuanVideo 1.5: three captioners (image, video, image-to-video instruction), tuned with OPA-DPO to cut hallucination. [cited]
- SVD: three captions per clip (CoCa on the middle frame, V-BLIP on the video, an LLM merge). [cited]
- LTX-2 trainer: one detailed paragraph covering visuals **and** audio; default captioner `qwen_omni`, alternative `gemini_flash`; trigger word prepended with `--lora-trigger`. [cited]
- The LTX-2 prompt guide: captions "teach", they are not prompts; order is shot type, subject, action, camera movement, lighting, style/mood; keep detail density consistent across the dataset; the trigger must appear at inference. [cited]
- Audio captions: Qwen3-Omni (and its dedicated Captioner variant) produce low-hallucination descriptions of non-speech audio and have been used to caption sound datasets. [cited: Woosh, Qwen3-Omni-Captioner]

### 1.4 Balancing
HunyuanVideo balances concepts with VideoCLIP embeddings and builds four progressively stricter datasets (256p to 720p), each dropping roughly half to four-fifths of the previous one. [cited] The lesson is not the embedding; it is that **the final-stage set is small, strict and balanced, and the big set is only for earlier stages**. For a LoRA we are always in the final stage.

### 1.5 Hard negatives, preferences, synthetic data
- VideoDPO builds preference pairs automatically: generate many candidates per prompt, score them, take best and worst as winner/loser. [cited]
- VideoAlign/VideoReward: 182K human preference annotations across 12 models, multi-dimension (quality, motion, text alignment), used to train a reward model and a Flow-DPO objective that beat SFT and reward-weighted regression. [cited]
- HunyuanVideo 1.5 uses a balanced O(10K) prompt set with manual annotation for DPO and a VLM reward model for I2V. [cited]
- Synthetic data: captions are the main legitimate synthetic data (every team above). Training on videos from closed generators is something XUGC already forbids (xugc skill, LoRA dataset rule); keep that.

### 1.6 Evaluation holdouts
HunyuanVideo 1.5 evaluates with 300 prompts and 300 images against 100+ assessors. [cited] That is a company budget. Ours is Alex plus a script (section 8).

---

## 2. How much data: style LoRA vs base model

| Thing | Amount | Source |
|---|---|---|
| Base model, pretraining pool | SVD 580M clips raw to 152M filtered; HunyuanVideo 1.5 about 800M segments from 10M+ hours | [cited] |
| Base model, last stage | SVD 250K clips; HunyuanVideo about 1M manually annotated | [cited] |
| Style LoRA | 10-40 clips with a consistent look and varied subjects | community guide for Wan [cited: RunComfy/Wan guide] |
| Small-data Wan 2.1 I2V LoRA paper | about 40 clips of 2-5 s covering indoor/outdoor, day/night, wide/close, static/dynamic | [cited: arXiv 2510.27364] |
| LTX trainer sizing table | 10-25 clips: 500-1000 steps; 25-50: 1000-2000; 50-100: 2000-3000; 100+: 2000-4000 | [cited: LTX guide via Apatero/Medium] |
| LTX official | no fixed count; smallest dataset that cleanly represents the behavior; tight and consistent beats large and noisy; checkpoints every 250 steps; watch samples not loss | [cited: ltx.io] |

So: base models need millions of clips because they learn the world; a LoRA only shifts a distribution the base already contains, so it needs tens to a few hundred **consistent** clips. Real Life is a LoRA that must shift four things at once (camera/phone look, human behavior, rooms, sound). That justifies a few hundred, not thousands. More clips of the same bedroom do nothing; more *distinct* rooms and behaviors do.

---

## 3. Filter pipeline with thresholds

Run in this order. Each stage writes a row to `curation.sqlite` (clip id, stage, value, pass/fail) so every drop is explainable and reversible. All local: ffmpeg, PySceneDetect/TransNetV2, a CLIP/SigLIP model, EasyOCR, Whisper-class ASR, Qwen3-Omni.

### 3.1 Hard gates (drop on fail)
| # | Check | Pass rule | Basis |
|---|---|---|---|
| 1 | Technical | Decodes; has an audio stream; video at least 720 px on the short side; fps 24-60 (resample to 24); duration 3.0-6.5 s | [ours]; LTX needs audio for audio-video training and frames where `frames % 8 == 1`, sizes multiple of 32 [cited] |
| 2 | Internal shot cut | Zero cuts by PySceneDetect AND TransNetV2 (both must agree there is none), no dissolve/wipe | [cited method, ours threshold] |
| 3 | Motion | Mean optical-flow magnitude at 2 fps between "not static" and "not jitter". Start from the Open-Sora Plan range 0.001-0.3 in their normalisation; **calibrate on our 237 pieces**: keep the band that contains 90% of the clips Alex already liked. Talking-head clips with real head and hand motion pass; tripod stills fail | [cited range, ours calibration] |
| 4 | Blur | Laplacian variance on 5 sampled frames, median at or above a floor set at the 10th percentile of our set, and no single frame below half of the median (catches motion-smear starts) | [ours] |
| 5 | Text and overlays | EasyOCR at 1 fps: text area under 8% of frame, and no persistent text in the same box on more than 50% of frames (caption bars, watermarks). Burned-in creator captions are the most common failure in TikTok-sourced clips | [cited method; Open-Sora allows up to 20% crop, SVD uses an area ratio; 8% is ours] |
| 6 | Watermark and logo | Detector for TikTok/Reels/CapCut marks in the four corners and the moving TikTok end-card; discard if crop to remove it keeps less than 60% of frame | [cited: HunyuanVideo 60%] |
| 7 | Borders / collage / split screen | Letterbox bars over 5% of height or width; stitched grids | [cited: HunyuanVideo 1.5 basic filter] |
| 8 | Aesthetic floor | Aesthetic score at or above the 5th percentile of our set (this removes broken frames, not phone-looking ones). Do NOT use 4.75 as a floor | [ours; reason in 1.2] |
| 9 | Brightness | Mean luma 40-215 of 255 on sampled frames, no more than 10% clipped | [ours] |
| 10 | Audio | Integrated loudness above -32 LUFS, not clipped (peak under -1 dBFS), no silence over 1.0 s inside a clip unless it is tagged `quiet_room`; speech-to-noise sane (ASR confidence average at or above 0.6 where speech is present). Our first generated clip had near-silent audio, so the audio gate is the one we skipped before | [ours; from xugc skill build 5 finding] |
| 11 | Music | Reject clips where licensed or chart music dominates (music classifier: music segment over 40% of duration AND no speech). A style LoRA that learns "TikTok sound" will reproduce trending songs | [ours] |
| 12 | People | Face visible in at least 60% of frames for person clips; no face-blur/sticker filters (face-landmark jitter test plus CLIP "filter overlay"); no minors; no nudity (safety classifier) | [ours] |

### 3.2 "Phone-real" score (soft, ranks clips)
Weighted sum used to pick the best clip per cell when a cell is over-full: handheld micro-shake present (global motion jitter 0.5-3 px/frame at 24 fps), auto-exposure or white-balance drift, rolling-shutter skew, mic noise floor present, natural speech disfluencies, imperfect framing. Computed from flow and audio stats; no model needed. [ours]

### 3.3 Dedup and caps
- Embed each clip with a video embedding (VideoCLIP-class, as HunyuanVideo, or SigLIP mean-pooled over 8 frames). K-means with k = about 25 on our size, then within each cluster drop pairs with cosine at or above **0.95**, keeping the one nearest the centroid. [cited method SemDeDup/Cosmos; 0.95 is ours]
- **Source cap:** at most 6 clips per source video and at most 12 per creator. Otherwise one creator's room and voice becomes the LoRA. [ours]
- **Reuse cap:** if the same shot geometry (same room, same camera angle, same person) appears more than 3 times across different videos, keep the 3 best by phone-real score. [ours]

### 3.4 Sort
After gates: A-grade (all hard gates, phone-real in the top half) go to training; B-grade pass gates but are borderline and only fill under-filled cells; the rest are archived, not deleted (source list stays).

---

## 4. Data plan: clip counts per behavior, place, sound

One clip carries one value on each of three axes. A clip counts toward all three. Targets are **kept clips after filters**. Collect about 1.6x these numbers to survive the filters.

Total target **320 train + 36 holdout = 356 clips**, up from 237 collected / 100 trained.

### 4.1 Behavior (what the person does) — 12 buckets
| Behavior | Min | Target |
|---|---|---|
| Selfie talk-to-camera, hook (first 3 s, direct address) | 25 | 40 |
| Selfie, walking and talking | 15 | 25 |
| Holding product up to camera, turning it | 20 | 35 |
| Unboxing (hands, box, reaction) | 15 | 25 |
| Using the product (demo, hands only) | 20 | 35 |
| Before / after or reveal (cut-free reveal within one shot) | 10 | 20 |
| Reaction / laugh / surprise beat | 15 | 25 |
| Pointing / showing a detail close-up | 10 | 20 |
| Voiceover over hands-only (no face) | 15 | 25 |
| Second person in frame (friend, partner, kid-free) | 10 | 20 |
| Texting / scrolling phone with product in shot | 5 | 15 |
| Static "sat on bed / couch" testimonial | 15 | 35 |
| **Sum** | 175 | 320 |

### 4.2 Place — 10 buckets (cap any single place at 18% of the set)
Bedroom, bathroom/vanity, kitchen, living room/couch, car interior, outdoors street/park, garage/workshop, office/desk, store/hallway/entryway, gym or backyard. Target 20-45 each; minimum 15 each. Light conditions must be mixed within each: daylight window, warm lamp, overhead white, night/phone-flash. Aim for at least 20% of the set in non-ideal light, because that is the realism signal. [ours, following the Wan small-data paper's indoor/outdoor, day/night, wide/close spread]

### 4.3 Sound — 8 buckets (this is the part we under-built last time)
| Sound class | Min | Target |
|---|---|---|
| Clear speech, quiet room | 30 | 55 |
| Speech with room tone / HVAC / fridge hum | 25 | 45 |
| Speech outdoors with wind or traffic | 15 | 30 |
| Speech in a car (cabin resonance) | 10 | 20 |
| Product sound (click, pour, fizz, zip, spray, motor) foregrounded | 20 | 40 |
| Hands-only with no speech, ambient only | 15 | 25 |
| Laughter / exclamations / breath | 10 | 20 |
| Background TV or other voices, low | 10 | 20 |
Speech in at least 60% of clips because UGC ads are speech-led; LTX-2 generates speech from `[SPEECH]` text, so the clip must contain the speech the caption transcribes. [cited: LTX caption markers]

### 4.4 People and framing balance
Gender, age band (20s, 30s, 40s, 50+), skin tone, and accent are tracked per clip and kept within 2:1 of each other except where the store's buyer is narrower (the store decides; the LoRA should not bake a single demographic). Framing: 55% chest-up selfie, 25% hands-and-product, 20% wider. Aspect 9:16 only. [ours]

### 4.5 Gap report
The curation script prints a grid (behavior x place, behavior x sound, place x sound) with counts and red cells under minimum. Alex or Codex feeds the red cells back to the Collect box as a shopping list ("need 11 more: car interior + product sound"). This is the loop between curation and collection and is the cheapest way to improve the LoRA.

---

## 5. Caption schema

### 5.1 What the trainer needs (verbatim format from the LTX-2 guidance)
Single detailed paragraph per clip, with explicit markers: `[VISUAL]` (trigger + detailed visual description), `[SPEECH]` (transcript or `None`), `[SOUNDS]` (ambient and non-speech), `[TEXT]` (on-screen text or `None`). [cited: LTX-2 trainer guidance]. The trigger `xugciphone` is prepended by `--lora-trigger` at preprocessing. [cited]

### 5.2 Our structured source record (one JSON per clip, caption is generated from it)
```json
{
  "clip_id": "c0142",
  "source_id": "v017", "creator_id": "cr09", "split": "train",
  "t_in": 12.4, "t_out": 17.9, "fps": 24, "frames": 121, "grade": "A",
  "axes": {
    "behavior": "holding_product_up",
    "place": "bedroom",
    "light": "window_daylight",
    "sound_class": "speech_room_tone",
    "framing": "chest_up_selfie",
    "camera": {"device_feel": "handheld_front_camera", "movement": "slow_drift", "shake": "light"},
    "person": {"count": 1, "age_band": "20s", "gender": "f", "wardrobe": "grey hoodie", "hair": "dark ponytail"}
  },
  "visual": "One-sentence shot + subject + action + camera + light + mood, in LTX order",
  "speech": {"text": "okay so I have to show you this", "lang": "en", "wpm": 165, "disfluencies": ["okay so"]},
  "sounds": ["quiet room tone with faint fridge hum", "soft plastic rustle when the box is lifted"],
  "on_screen_text": "None",
  "phone_real": {"score": 0.71, "flaws": ["exposure shift at 2.1 s", "mic proximity pops"]},
  "filters": {"motion": 0.08, "blur": 142.3, "aesthetic": 4.2, "ocr_area": 0.0, "lufs": -21.4},
  "caption": "[VISUAL] xugciphone ... [SPEECH] ... [SOUNDS] ... [TEXT] None"
}
```
The `caption` is assembled by a script from the other fields, so wording is consistent (LTX guide: consistent detail density). Captioner output is parsed into the fields; it is never pasted straight into training.

### 5.3 Rules for the caption text
1. Order inside [VISUAL]: shot type, subject, action, camera, lighting, mood. [cited: LTX-2 prompt guide]
2. Describe flaws as facts: "slightly overexposed window", "front camera auto-focus hunts for a moment". The model learns the flaw only if it is named; if it is not named it is treated as noise.
3. Never name the creator, brand, or platform in the caption. Never write "TikTok style" (the first LoRA's trigger is the style handle; platform words leak logos and UI).
4. [SPEECH] is the verbatim transcript from ASR, spell-checked, with fillers kept. Not a summary.
5. [SOUNDS] always names the room tone, even for "quiet". Sound classes in 4.3 are the vocabulary. Use the same word for the same sound across the set.
6. Caption length 90-160 words. Under 60 words is rejected (sparse captions are called out in the LTX guide).
7. Vary the **non-style** parts across captions and keep the **style** parts identical (LTX: for style LoRAs, keep style descriptors consistent, vary subjects/actions). The style parts here are the phone-look sentences.
8. Caption dropout 10-15% at training to stop the LoRA bleeding into everything. [cited: LTX run-and-monitor guidance, DOP/caption dropout]
9. Banned words: "cinematic", "beautiful", "stunning", "professional" (they pull toward the wrong look; LTX guide says to replace vague words with precise ones).

### 5.4 How captions are produced (local, three passes)
1. Qwen3-Omni (or its Captioner for audio) writes a draft with video and audio together. [cited: LTX default captioner `qwen_omni`; Qwen3-Omni-Captioner for low-hallucination audio] Gemini Flash is allowed by the trainer but is a hosted API: it would send clips off the Mac, so it is **off** for Real Life.
2. Whisper-class ASR gives the verbatim [SPEECH]; OCR gives [TEXT]; audio tagger gives the sound list. Script merges, then checks: speech word count matches ASR, no banned words, length in range, every marker present, claims about count of people match the face detector.
3. Alex reviews 10% (random 35 clips) in a one-screen "caption review" page: clip left, caption right, Fix / OK. Failure rate over 15% means re-run the whole set with a better prompt. LTX itself says auto captions may be inaccurate and should be reviewed. [cited]

---

## 6. Reference-ad analyzer (ad library to knowledge, no footage into a model)

### 6.1 Principle
The analyzer reads a viral ad and writes a **card**: facts about structure, not pixels. The card feeds the prompt writer in Create and Claude's brief. The footage:
- is stored only in `~/Library/Application Support/XUGC/refs/` on the Mac,
- is never added to the LoRA pool or the style folder,
- is never given to a video model as a conditioning image or clip,
- is deleted after analysis unless Alex pins it,
- is processed by **local** tools by default (ffmpeg, PySceneDetect/TransNetV2, Whisper-class ASR, OCR, a local VLM such as Qwen3-Omni). The hosted route (Gemini accepts video, samples 1 fps by default, about 100 tokens per second of video, timestamps as MM:SS, up to 10 videos per request on 2.5+ [cited: Gemini docs]) works and gives richer cards but sends the ad to Google, so it is a per-ad opt-in switch, never default.

This is the standard split in the field: understanding models read video; generation models train on a curated, licensed or owned set. Cosmos Curator itself separates "annotate" from "train" the same way. [cited]

### 6.2 What is extracted deterministically (no model judgment)
Shot boundaries and durations (TransNetV2), cut rate, words per minute and word timestamps (ASR), on-screen text with first/last second (OCR), loudness curve, music vs speech vs silence segments, first-frame hold, per-shot motion level and camera movement class, face present per shot, aspect, total length.

### 6.3 What the local VLM adds (labelled, with a confidence)
Hook type, shot content, product visibility per shot, emotional beat, claim types, CTA type, setting, creator persona.

### 6.4 Output schema: `ad_card.json`
```json
{
  "card_id": "ac_0031", "source_ref": "private local id, no URL stored in card",
  "analyzed_at": "2026-10-02", "analyzer_version": "1.0", "mode": "local",
  "meta": {"duration_s": 24.6, "aspect": "9:16", "category": "garden", "product_visible_from_s": 1.8,
           "format": "ugc_selfie|demo|unboxing|testimonial|pov|split_before_after|voiceover_broll"},
  "hook": {
    "window_s": [0.0, 3.0],
    "type": "problem_callout|curiosity_gap|shock_visual|result_first|question|social_proof|pattern_interrupt",
    "spoken": "my knees were killing me until...",
    "on_screen_text": "STOP kneeling on the ground",
    "first_motion_at_s": 0.0, "face_in_first_frame": true, "words_in_first_3s": 9,
    "confidence": 0.8
  },
  "structure": {"beats": [
      {"beat": "hook", "start_s": 0.0, "end_s": 3.1},
      {"beat": "problem", "start_s": 3.1, "end_s": 7.0},
      {"beat": "product_reveal", "start_s": 7.0, "end_s": 10.5},
      {"beat": "demo", "start_s": 10.5, "end_s": 19.0},
      {"beat": "proof_or_result", "start_s": 19.0, "end_s": 22.5},
      {"beat": "cta", "start_s": 22.5, "end_s": 24.6}]},
  "shots": [
    {"i": 1, "start_s": 0.0, "end_s": 3.1, "shot_type": "selfie_close", "camera": "handheld_front",
     "movement": "static_shake_light", "subject": "woman 30s outdoors garden",
     "action": "holds sore knee, speaks to camera", "product_in_frame": false,
     "text_overlay": "STOP kneeling on the ground", "audio": "speech_outdoor_wind",
     "motion_level": "medium", "purpose": "hook"}
  ],
  "pacing": {"cuts": 11, "avg_shot_s": 2.2, "shortest_shot_s": 0.8, "cut_rate_first_5s": 3,
             "wpm": 172, "silence_total_s": 0.9, "speech_coverage": 0.88, "pattern_interrupts_at_s": [3.1, 10.5]},
  "audio": {"voice": "female, mid-20s to 30s, American, energetic", "music": "none|low_bed|loud",
            "sfx": ["velcro rip at 12.2", "click at 15.0"], "loudness_lufs": -15.8,
            "room_tone": "outdoor_wind"},
  "claims": [{"text": "no more sore knees", "type": "outcome", "risk": "health_claim_review"}],
  "cta": {"type": "link_in_bio|shop_now|discount|none", "spoken": "grab it before it sells out", "start_s": 22.5},
  "social_proof": ["one-line review text overlay"],
  "template": {
    "pattern_name": "problem-callout selfie -> demo -> result",
    "slots": ["person", "place", "problem line", "product action", "result line", "cta line"],
    "constraints_for_xugc": ["max one shot per generated clip", "show finished state not transformation",
                              "hook line spoken in first 3 s", "product visible by 2 s"]
  },
  "do_not_copy": ["exact script wording", "creator face/voice", "brand marks", "specific music"],
  "similarity_guard": {"script_overlap_limit": 0.35}
}
```
`template` is the output the app uses. A new ad is generated by **filling the slots with our product** and writing fresh words, then planning one XUGC clip per shot group (respecting realism rule 1: one clip = one shot, 5-10 s; clips are stitched afterwards). `similarity_guard` rejects a generated script whose n-gram overlap with the source transcript exceeds the limit.

### 6.5 Cross-ad knowledge
Cards go in `refs.sqlite`. A weekly roll-up per category computes: hook type frequency, median hook word count, median shot length, wpm, cut rate in the first 5 s, CTA timing, music presence. The prompt writer reads the roll-up ("garden: 62% problem_callout, median 2.4 s shots, 170 wpm") instead of any single ad. That is how knowledge generalises instead of cloning one ad.

---

## 7. Thumbs up/down into training data

### 7.1 What is captured per generated clip
`gen_id, engine, lora_version, seed, full prompt, refs used, settings, filters-on-output (same gates as 3.1 run on the output), thumb (up/down/none), reason chips, free note, time to decision`.

### 7.2 One tap, then chips (never a form)
👎 opens six chips plus "other": **Face/skin fake, Hands wrong, Product wrong, Voice/audio fake, Moves wrong (physics/gesture), Looks too clean/AI, Room wrong**. 👍 has no chips unless he taps "great at" (look / motion / sound / speech / product). This respects "one step at a time": one tap is enough, chips are optional.

### 7.3 What each signal becomes
| Signal | Goes to | When |
|---|---|---|
| 👎 chip text | `never-do.md` line, and into the "Avoid:" sentence in the prompt (already built) | Immediately |
| 👎 clip | **Hard-negative bank**: saved with prompt and chips. Used as (a) the loser in preference pairs, (b) a regression test prompt (must improve next LoRA), (c) a failure example to tune the output filter | Immediately stored; used at next training |
| 👍 clip from the **closed APIs** (Veo, Seedance, Kling) | **Never trained on.** Stored as prompt recipes only (the prompt + settings that worked) | Always |
| 👍 clip from **our own LoRA** | Not a target by default. Becomes the winner in a preference pair against a 👎 or an un-rated sibling from the same prompt and different seed; also used as an eval prompt | Next preference round |
| Alex's own phone footage / paid-creator footage / licensed stock | Joins the real-footage pool through the same filters (the legal-dataset rule in the xugc skill) | Anytime |

### 7.4 Preference pairs
Pairs need the same prompt. Whenever Alex orders a clip, the app renders 2 seeds (the cost is shown before Generate as it already is). He taps one 👍 and the other is the loser, or both 👎. Winner/loser pairs are the VideoDPO-style data. [cited: VideoDPO, VideoAlign] Pairs with a clear chip reason are weighted higher. Do not run preference training until there are **at least 300 pairs**; below that, thumbs only drive prompts and filters.

### 7.5 A scorer before a trainer
At about 300 labelled outputs, train a small classifier on frozen features (embedding of 8 frames + audio embedding + the filter stats) to predict 👍. Use it as an automatic pre-filter that hides likely-bad generations before Alex sees them, and as the OmniScore-like ranker for pairs. This is the cheap version of what VideoAlign did with 182K human annotations. [cited] It runs on the Mac.

### 7.6 Retraining cadence
Retrain the LoRA only when (a) the grid in 4.5 has gained at least 40 new passing clips in red cells, or (b) the hard-negative regression set shows the same failure in 5 consecutive generations. Otherwise keep the LoRA fixed and fix prompts and filters; this saves GPU money. Every LoRA version is evaluated before it replaces the old one (section 8).

### 7.7 Guard against drift
Cap synthetic or self-generated examples at 0 in the first retrain and 15% later, each passing the 3.1 gates plus a manual check; a LoRA trained on its own outputs drifts toward its own artifacts. [ours]

---

## 8. Evaluation and holdouts

1. **Creator-level holdout.** 4 creators (about 36 clips, 10%) are removed before captioning and never seen in training. Choosing by creator stops near-identical rooms and voices from leaking into the test. [ours]
2. **Fixed eval prompt set: 40 prompts**, built from the 4.1 x 4.2 x 4.3 grid (one prompt per behavior x a rotating place x a rotating sound) plus 8 prompts adversarial to the LoRA (no phone look wanted; product close-up; two people; text on screen) to detect bleed. Same seeds every time.
3. **Every checkpoint (every 250 steps, as LTX suggests keeping them) renders 8 of the 40.** Alex looks at samples, not loss. [cited: LTX]
4. **Automatic checks on the renders**: the 3.1 audio gate, face detector present, speech intelligibility (ASR word error rate on the speech prompt, goal under 25%), OCR must find no gibberish text unless asked, product-reference similarity (CLIP) over a floor.
5. **A/B with the base**: for each of the 40 prompts, show base vs LoRA blind. Alex taps the more real one. LoRA ships if it wins at least 70% of 40.
6. **Memorisation check**: nearest-neighbour embedding of each render against all training clips; any render with cosine above 0.95 to a training clip is reported (it means the LoRA copies a clip).
7. Alex's rule applies: no number is claimed until the script prints it on his machine.

---

## 9. Dry run (zero cost, runs on his Mac, first thing after Alex says build)

1. Run gates 3.1 on the existing 237 pieces and print a table: how many fail each gate. This calibrates every [ours] threshold.
2. Print the 4.5 grid and the gap report for the 237.
3. Re-caption 20 pieces with the 5.4 pipeline and show Alex 5 side by side with the old captions.
4. Only after those three, decide the collection shopping list.

This is the "run the loop, not just the syntax check" rule (AGENTS.md rules 1 and 2) applied to data.

---

## 10. Sources

Curation at scale
- Stable Video Diffusion: Scaling Latent Video Diffusion Models to Large Datasets. https://arxiv.org/html/2311.15127 (cut detection at three fps, optical flow at 2 fps, OCR area, CLIP aesthetic, 580M to 152M, 250K fine-tune set, three captions per clip)
- HunyuanVideo: A Systematic Framework For Large Video Generative Models. https://arxiv.org/html/2412.03603v1 (PySceneDetect, TransNetV2, Laplacian, VideoCLIP dedup and balance, Dover, OCR, YOLOX-style watermark detection, four progressive datasets, 14 camera movement classes, JSON structured captions, 1M-sample fine-tune set)
- HunyuanVideo 1.5 Technical Report. https://arxiv.org/html/2511.18870v1 (three-level filtering, transition classifier, 60% crop rule, about 800M segments from 10M+ hours, OPA-DPO captioner, O(10K) DPO set, 300-prompt GSB eval)
- Open-Sora Plan v1.3.0 report. https://github.com/PKU-YuanGroup/Open-Sora-Plan/blob/main/docs/Report-v1.3.0.md and https://arxiv.org/pdf/2412.00131 (aesthetic 4.75, motion 0.001-0.3, EasyOCR 1 fps, 20% crop)
- NVIDIA Cosmos Curator video pipelines. https://github.com/NVIDIA/cosmos-curator/blob/main/docs/curator/reference/video-pipelines.md (TransNetV2 default, motion and aesthetic filter modes, Qwen captioning, k-means dedup, cosine)
- NeMo Curator video dedup. https://docs.nvidia.com/nemo/curator/curate-video/process-data/dedup
- SemDeDup. https://arxiv.org/pdf/2303.09540v3
- Cosmos World Foundation Model Platform for Physical AI (curation pipeline). https://arxiv.org/pdf/2501.03575

LoRA data size and caption format
- LTX-2 trainer, dataset preparation. https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-trainer/docs/dataset-preparation.md (one paragraph with visual and audio, frames % 8 == 1, sizes multiple of 32, `split_scenes.py`, qwen_omni and gemini_flash captioners, `--lora-trigger`)
- LTX-2 trainer quick start. https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-trainer/docs/quick-start.md
- LTX, What Training Data Do You Need To Fine-Tune A Video Generation Model. https://ltx.io/blog/video-model-training-data (page failed to load in this session; the "smallest dataset that cleanly represents the behavior" guidance comes from the LTX LoRA pages in the search result below)
- LTX, How To Train A LoRA For Video Generation. https://ltx.io/blog/how-to-fine-tune-a-video-generation-model-with-lora
- LTX, How To Run and Monitor LoRA Training. https://ltx.io/blog/run-and-monitor-lora-training (checkpoints every 250 steps, caption dropout, watch samples)
- LTX-2 Video Trainer Prompt Guide (fal). https://fal.ai/learn/devs/ltx-2-video-trainer-prompt-guide (caption order, consistent density, trigger phrase)
- LTX-2 LoRA Training Guide (RunComfy / Ostris AI Toolkit). https://www.runcomfy.com/trainer/ai-toolkit/ltx-2-lora-training (section markers and size-to-steps table as returned by search; verify against the installed trainer's own source before any paid run)
- Fine-Tuning Open Video Generators for Cinematic Scene Synthesis: Small-Data Pipeline with LoRA and Wan2.1 I2V. https://arxiv.org/html/2510.27364 (about 40 clips of 2-5 s across indoor/outdoor, day/night, wide/close)
- Wan 2.2 T2V 14B LoRA Training with AI Toolkit. https://www.runcomfy.com/trainer/ai-toolkit/wan-2-2-t2v-14b-lora-training (10-40 clips for style LoRA)

Audio captioning
- Qwen3-Omni-30B-A3B-Captioner. https://huggingface.co/Qwen/Qwen3-Omni-30B-A3B-Captioner
- Qwen3-Omni Technical Report. https://arxiv.org/pdf/2509.17765
- Woosh: A Sound Effects Foundation Model (Qwen3-Omni audio captions). https://arxiv.org/pdf/2604.01929
- LTX-2: Efficient Joint Audio-Visual Foundation Model. https://arxiv.org/pdf/2601.03233

Preferences and evaluation
- Improving Video Generation with Human Feedback (VideoAlign, VideoReward, Flow-DPO, 182K annotations). https://arxiv.org/html/2501.13918 and https://github.com/KlingTeam/VideoAlign
- VideoDPO: Omni-Preference Alignment for Video Diffusion Generation. https://openaccess.thecvf.com/content/CVPR2025/papers/Liu_VideoDPO_Omni-Preference_Alignment_for_Video_Diffusion_Generation_CVPR_2025_paper.pdf

Video understanding for the ad analyzer
- Gemini API, Video understanding. https://ai.google.dev/gemini-api/docs/generate-content/video-understanding (1 fps default, about 100 tokens per second, MM:SS timestamps, clipping offsets, fps control, 10 videos per request)

Internal
- xugc skill (`.claude/skills/xugc/SKILL.md`): realism rules, legal-dataset rule for outputs of closed generators, build 5 audio finding, 2026-10-01 decisions.
