# 01 - Look and Camera: iPhone-UGC video LoRA training spec

Scope: what the training clips must show, how to caption them, and the trainer settings for HunyuanVideo 1.5, Wan 2.2 and LTX-2. One LoRA per model. Trigger token: `xugciphone` (rare, one word, prepended to every caption).

Source tags used below: [HV] HunyuanVideo-1.5 README, [MT-WAN] musubi-tuner Wan doc, [MT-DS] musubi-tuner dataset doc, [MT-HV] musubi-tuner HV1.5 doc, [LTX-DS] and [LTX-CFG] LTX-2 trainer docs. URLs are in section 5.

---

## 1. Checklist: what every clip must show

The LoRA learns whatever is constant across the dataset. Make the iPhone look constant and everything else (people, rooms, products, actions) varied.

### Sensor and image
- [ ] Visible luminance noise in shadows and mid-tones, chroma speckle in dark areas. Strongest in indoor evening light.
- [ ] Smartphone computational sharpening: slight halo on edges, over-crisp hair and fabric texture, no optical softness.
- [ ] Highlights clip hard (windows, lamps, screens go to flat white). Shadows lift and go slightly muddy-grey in low light.
- [ ] Slight HDR look in mixed light: bright window and face both visible, flat local contrast.
- [ ] Skin: real texture (pores, fine hairs, redness, blemishes, under-eye shadow). No retouching, no beauty filter, no glow. Minor shine on forehead and nose under direct light.
- [ ] Auto white balance drift: warm indoors (tungsten/LED) and a visible color shift when the subject moves between light sources.

### Exposure behavior (the strongest "real phone" cue)
- [ ] Auto-exposure shifts: at least one visible brightness pump per clip in 40% of the set (pan to a window, hand passes the lens, product raised toward the camera).
- [ ] Autofocus hunting: focus breathes for 3 to 8 frames when the subject or product moves close. Include 20% of clips with a rack-focus onto the product held up to camera.
- [ ] Exposure and focus lock behavior after settling, not constant sharpness.

### Lens and framing
- [ ] Main camera 24-26mm equivalent wide, slight wide-angle distortion on faces at arm's length (selfie clips use the 12MP front camera look: 23mm equiv, slight stretch at frame edges, faces large).
- [ ] Vertical 9:16 for 85% of clips. Include 15% already-cropped-looking framing with the head cut slightly at the top or product partly out of frame.
- [ ] Arm's-length selfie angle (camera slightly below or above eye level, never studio-level) in 45% of clips, rear-camera held by a second person or propped on a surface in 30%, handheld POV of hands and product in 25%.
- [ ] Shallow background blur only from portrait-mode style computational blur on 10% of clips. All other clips show deep focus with real phone depth of field.

### Motion
- [ ] Handheld shake with low-frequency sway (walking or breathing) plus occasional micro-jitter. Never a smooth gimbal, never a tripod lock-off in more than 20% of clips.
- [ ] Small rolling-shutter skew on fast pans and on fast hand motion.
- [ ] Natural reframing: the creator adjusts the phone, the frame drifts, a re-center happens.
- [ ] Motion blur at 1/60s shutter feel: hands and heads blur during fast moves.
- [ ] Speaking clips: head and hands move, eyes glance at the screen and not at the lens for a share of frames (30%), mouth matches speech.

### Compression and delivery
- [ ] Source is a real social-platform-style re-encode: H.264, 8 to 12 Mbps at 1080x1920 looks right. Mild blocking in flat dark areas and banding in gradients (walls, sky) is wanted.
- [ ] Never feed clips at a bitrate above what a phone records (about 20 Mbps for 1080p30 HEVC converted to H.264). Pristine 4K downscales teach the wrong look.
- [ ] Phone audio is not trained here (video-only for HV and Wan). For LTX-2 audio-video training see the LTX row in section 3.

### Content variety (so the look generalizes)
- [ ] 8 or more distinct rooms (bathroom mirror, kitchen, car seat, bedroom, bright window, dim living room, outdoors, gym).
- [ ] 15 or more distinct people across skin tones, ages and hair, none repeated in more than 3 clips.
- [ ] 6 or more distinct hand-held object types (bottles, boxes, tubes, devices) so the model does not bind the look to one product.
- [ ] Mix of lighting: daylight window, overcast outdoor, warm lamp, harsh overhead, car interior, night with screen glow.
- [ ] 10% of clips with no person: hands plus product on a table, unboxing.

### Technical format of the clips
- [ ] Trim every clip to one continuous shot. No cuts, no zoom transitions, no text overlays, no captions burned in, no stickers, no watermarks, no platform UI.
- [ ] Clip length 3 to 6 seconds, fps 24 for HV and LTX and 16 for Wan 2.2 (14B native), or keep the source 24 and let the trainer resample. Section 3 lists exact frame counts.
- [ ] Count: 40 to 80 clips for a style LoRA is the working target; 100 to 150 when covering many scenes. Quality of the 40 beats 300 mixed ones.
- [ ] Resolution 1080x1920 sources, downscaled by the trainer to the bucket in section 3.

---

## 2. Caption template and worked examples

Rule: caption what varies, leave the constant out. The constant is the iPhone look, and it is carried by the trigger token. If "grainy iPhone footage" is written in every caption, the model ties the look to those words; with only the trigger present, the look attaches to the trigger. Do not describe noise, shake or compression in the captions of clips that all have them. Do describe a visible event (exposure pump, focus pull) because it varies between clips.

Template (one paragraph, 35 to 80 words, present tense, plain language):

```
xugciphone, [shot type and camera position], [subject: who, age range, clothing, hair], [action and speech content], [object or product and how it is held], [setting and light], [camera motion this clip], [event: exposure shift / focus pull / none].
```

Order matters: trigger first, then subject, then action, then setting, then camera motion. One .txt per clip, same basename as the clip (`clip_014.mp4` and `clip_014.txt`). For LTX use the `caption` column in dataset.json. Use `--lora-trigger xugciphone` in LTX preprocessing so it is prepended automatically (source [LTX-DS]); for HV and Wan write the token into each caption.

### Example 1 - selfie talking
```
xugciphone, vertical selfie video held at arm's length, a woman in her late 20s with a messy brown bun and a grey hoodie talks directly to the camera and laughs mid-sentence, she lifts a white pump bottle into frame beside her face, bright bathroom with a window behind her, the phone sways slightly as she moves, the exposure brightens as the bottle comes up.
```

### Example 2 - hands and product, POV
```
xugciphone, vertical handheld point-of-view shot looking down at a wooden kitchen table, two hands with short unpainted nails open a small cardboard box and pull out a glass tube with a silver cap, warm overhead lamp and daylight from the left, the camera drifts and re-centers, focus hunts for a moment then locks on the tube.
```

### Example 3 - rear camera, walking
```
xugciphone, vertical medium shot from a phone propped on a counter, a man in his 40s with a short beard and a navy t-shirt walks in from the right, picks up a black bottle and turns the label toward the lens while speaking, dim living room lit by a lamp and a TV glow, the frame stays mostly still with a small shake when he bumps the counter, the background brightness shifts as he steps in front of the lamp.
```

Caption generation: auto-caption with a vision-language model, then hand-correct every caption (the LTX docs state auto captions can hallucinate and must be reviewed, [LTX-DS]). Reject captions containing "cinematic", "4k", "professional", "high quality", "film grain", "bokeh" - these words pull the model to a different look.

Inference-time prompt: `xugciphone, [same template fields]`. Keep the same field order as training.

---

## 3. Trainer settings per model

| Item | HunyuanVideo 1.5 (official `train.py`) | Wan 2.2 14B (musubi-tuner) | LTX-2 (`ltx-trainer`) |
|---|---|---|---|
| Entry point | `torchrun --nproc_per_node=N train.py --use_lora ...` [HV] | `accelerate launch ... src/musubi_tuner/wan_train_network.py --task t2v-A14B` [MT-WAN] | `ltx-trainer` YAML config, `process_dataset.py` first [LTX-DS][LTX-CFG] |
| Dataset format | Your own `Dataset` returning `pixel_values [C,F,H,W]` in [-1,1], `text`, `data_type="video"` [HV] | Folder of video + same-name `.txt`, TOML `[[datasets]]` [MT-DS] | `dataset.json` (list of `{caption, video}`), or CSV/JSONL [LTX-DS] |
| Frame rule | F = 4n+1: use 65 or 81 [HV] | `target_frames` each 4n+1: use `[1, 49, 81]` [MT-DS] | frames % 8 == 1: use 49 (bucket `960x544x49`) or 97 [LTX-DS] |
| Resolution | 480p-class bucket for LoRA: 480x848 portrait | `resolution = [544, 960]` (portrait, W x H) per TOML example style [MT-DS] | `--resolution-buckets "544x960x49"` (multiples of 32) [LTX-DS] |
| FPS | 24 | 16 | 24 |
| Frame extraction | n/a (custom dataset: take first 65 or 81 frames) | `frame_extraction = "head"` (clips are already trimmed to 4 to 5 s) [MT-DS] | whole clip in bucket |
| LoRA rank / alpha | `--lora_r 32 --lora_alpha 32` (default 8 / 16, raise rank for a look LoRA) [HV] | `--network_module networks.lora_wan --network_dim 32` [MT-WAN] | rank 32, alpha 32, dropout 0.0 [LTX-CFG] |
| Learning rate | 1e-4 for LoRA (the repo default of 1e-5 is the full-finetune value) [HV] | `2e-4` with `adamw8bit` [MT-WAN] | `1e-4` [LTX-CFG] |
| Optimizer | AdamW for LoRA (Muon is the repo's recommendation for full training) [HV] | `--optimizer_type adamw8bit` [MT-WAN] | `adamw`, scheduler `linear` [LTX-CFG] |
| Batch size | 1 per GPU, grad accumulation 4 | 1 (set `batch_size = 1` in TOML), grad accumulation 4 | 1 per GPU [LTX-CFG] |
| Length of run | 1500 to 2500 steps | `--max_train_epochs 16 --save_every_n_epochs 1` with 60 clips: 960 steps; extend to 24 epochs if the look is weak [MT-WAN] | `steps: 2000` [LTX-CFG] |
| Timestep settings | repo default flow-matching sampler | `--timestep_sampling shift --discrete_flow_shift 12.0` for T2V [MT-WAN] | trainer default |
| Precision / memory | bf16, gradient checkpointing, FSDP for multi-GPU [HV] | `--mixed_precision bf16 --fp8_base --gradient_checkpointing --sdpa` [MT-WAN] | gradient checkpointing on, quantization optional (fp8) [LTX-CFG] |
| Target modules | attention + MLP linear layers | musubi default for `lora_wan` | `to_k, to_q, to_v, to_out.0`; add feed-forward layers for the look LoRA [LTX-CFG] |
| Model-specific | `i2v_prob` 0.3 default: set 0.0 for a t2v LoRA, keep 0.3 if the LoRA must work in i2v [HV] | Two experts: train the low-noise model with `--dit`, the high-noise with `--dit_high_noise`, `--timestep_boundary` 0.875 for T2V; train both in one run with `--offload_inactive_dit` or `--blocks_to_swap` [MT-WAN] | Set `training_strategy.name: flexible`, `video.is_generated: true`, `audio.is_generated: false` for a video-only LoRA; set audio true and supply `audio` column clips for a phone-audio LoRA [LTX-CFG][training-modes] |
| Trigger | in caption | in caption | `--lora-trigger xugciphone` [LTX-DS] |
| Pre-caching | VAE latents and byT5 tokens optional in the dataset [HV] | run `wan_cache_latents.py` and `wan_cache_text_encoder_outputs.py` before training [MT-WAN] | `process_dataset.py` encodes latents and text [LTX-DS] |

Musubi-tuner also trains HunyuanVideo 1.5 (`hv_1_5_train_network.py`, `--learning_rate 1e-4 --network_dim 32 --discrete_flow_shift 2.0`) [MT-HV]. Use it when the official `train.py` is not available for the GPU. Its doc lists no recommended training resolution; use the same 480x848 portrait bucket as the official trainer.

Checkpoint choice: save every epoch (Wan) or every 250 steps (HV, LTX), render the same 6 fixed prompts at each checkpoint, pick the earliest checkpoint where noise, shake and auto-exposure appear and faces are still unmelted.

---

## 4. Things that ruin a LoRA

1. Mixed looks in one dataset. Studio footage, drone clips and phone clips together teach nothing. All clips are phone footage.
2. Cuts inside a clip. A cut in a 5 second clip teaches the model to teleport. One continuous shot per clip.
3. Burned-in text, subtitles, TikTok UI, watermarks. They reappear in every output.
4. Over-clean clips: denoised, stabilized, color-graded or beauty-filtered footage. Run no stabilization, no AI upscale, no skin smoothing on training clips.
5. Double compression damage: clips re-exported three times show mush and blocking, not phone look. Re-encode once, H.264, 8 to 12 Mbps.
6. One person, one room or one product dominating (more than 10% of clips). The LoRA memorizes that face or room. Cap any person at 3 clips and any room at 15% of the set.
7. Captions that describe the look in every clip ("grainy shaky iPhone"). The look then lives in those words, and prompts without them lose it. Use the trigger only.
8. Captions that disagree with the clip (hallucinated objects, wrong actions). Proofread every one.
9. Wrong frame counts. HV, Wan need 4n+1 and LTX needs 8n+1 [HV][MT-DS][LTX-DS]. Wrong counts get truncated and drop the end of the action.
10. Mixed fps in one dataset without resampling. Motion speed becomes inconsistent. Convert all clips to one fps first.
11. Too long a run. Past about 2500 steps (HV, LTX) or 24 epochs (Wan) the LoRA overfits: faces fix to training faces, backgrounds repeat, motion freezes. Pick an earlier checkpoint.
12. Learning rate copied from a full-finetune recipe. HV's 1e-5 default is for full training [HV]; the LoRA needs 1e-4.
13. Slow-motion or time-lapse clips. They teach the model wrong motion speed.
14. Heavy zoom and filters from the phone camera app (beauty mode, cinematic mode, portrait lighting). Use the standard Camera app, Video mode.
15. Tiny clips under 2 seconds. No motion statistics. Minimum 3 seconds.
16. Clips with shake so large the subject leaves the frame for several seconds. Shake is wanted, loss of the subject is not.
17. Only front-facing selfies. Add rear-camera and POV clips (section 1 ratios) or the LoRA cannot make a hands-and-product shot.
18. Training both Wan 2.2 experts on the same timestep range with default settings and skipping the boundary. Set `--timestep_boundary` and, for a single-expert run, train the low-noise model only for the look (texture, noise) and the high-noise model for motion layout [MT-WAN].

---

## 5. Sources

- HunyuanVideo-1.5 README, training section (train.py, `--use_lora`, `--lora_r`, 4n+1, Muon, i2v_prob): https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5
- musubi-tuner Wan 2.2 guide: https://github.com/kohya-ss/musubi-tuner/blob/main/docs/wan.md
- musubi-tuner dataset config (target_frames, frame_extraction, resolution, caption_extension): https://github.com/kohya-ss/musubi-tuner/blob/main/docs/dataset_config.md
- musubi-tuner HunyuanVideo 1.5 guide: https://github.com/kohya-ss/musubi-tuner/blob/main/docs/hunyuan_video_1_5.md
- musubi-tuner advanced config (timestep sampling, min/max timestep): https://github.com/kohya-ss/musubi-tuner/blob/main/docs/advanced_config.md
- LTX-2 trainer dataset preparation (dataset.json, resolution buckets, 8k+1, `--lora-trigger`): https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-trainer/docs/dataset-preparation.md
- LTX-2 trainer configuration reference (rank 32, lr 1e-4, 2000 steps): https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-trainer/docs/configuration-reference.md
- LTX-2 trainer training modes (flexible strategy, is_generated): https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-trainer/docs/training-modes.md
- LTX video LoRA workshop (not retrievable by the fetch tool at write time; read it by hand for dataset-size guidance): https://ltx.io/publications/lora-training-workshop

Provenance note for the next editor: trainer values in section 3 tagged with a source come from those pages. The numbers with no tag (clip counts, step counts for HV, 480x848 bucket, grad accumulation 4, bitrate, ratios of shot types) are this team's chosen starting values and are to be confirmed by the first training run's checkpoint grid.
