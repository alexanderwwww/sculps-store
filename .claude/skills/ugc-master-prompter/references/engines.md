# engines.md — engine adapter sheet

One shot spec, rendered for any video model. Every fact is from a repo file (source in brackets) or marked **[UNVERIFIED]**.
Sources: `K`=design/xugc/real-life/09-kling-mcp.md, `F`=08-fal-api.md (+ `fal-openapi/*.json`), `O`=06-orchestration-apis.md, `B`=05-directors-bible.md, `H`=07-higgsfield-and-renting.md, `R`=00-real-life-recipe.md, code=tools/xugc/*.js.
Never submit a paid call without Alex's OK and a stated price. Failed calls can still cost. Prices move: re-check before a big spend.

## 0. Shot spec (the engine-neutral input)
`capture+look | person (1 sentence) | setting | product lock (size, colours, signature detail, what it is NOT) | beats at golden times (1 action + 1 camera idea each) | speech (quoted, short) | sound layers | hands rule | bans | frames (first/last/refs)`.
Each adapter below only changes: notation, word cap, how refs are named, and which API fields carry aspect/duration/audio.
Rules for ALL engines [B 6, filter.js]: no "cinematic/8K/epic/studio lighting/beauty/gimbal"; ONE camera move per shot; no aspect ratio, resolution or duration in prompt text (API fields); emotions need a visible trigger; add "Natural hands, five fingers visible, holding the product by its <part>." when anything is held; add "No text, captions, letters, logos or graphics in the picture." when refs are used; one sentence for the face. Run `tools/xugc/filter.js` `check(prompt, engine)` before rendering.

## 1. Capability matrix
| | first frame | last frame | ref images | audio | 9:16 | duration | res | prompt cap |
|---|---|---|---|---|---|---|---|---|
| Kling v3_0 (MCP) | yes `first_image` | yes `tail_image` | elements (max 3) | native, `enable_audio` | follows first image (no arg) | 3–15 s | 720p std | 2,500 chars on official API [O, S]; MCP cap **[UNVERIFIED]** |
| Kling v3_0_turbo (MCP) | yes | **no** | **no** | no switch | follows image | 3–15 | 720p/1080p | same |
| Kling v3_0_omni (MCP) | yes | yes | `image_1..7` + elements | `enable_audio` | `aspect_ratio` 9:16 | 3–15 | 720p | same |
| Kling v3 Pro (fal) | `start_image_url` | `end_image_url` | `elements[]` (frontal + 1–3 refs) | `generate_audio` | from image **[UNVERIFIED]** | 3–15 | none field | `prompt` OR `multi_prompt` |
| Seedance 2.5 i2v (fal) | `image_url` | `end_image_url` | no | `generate_audio` | `aspect_ratio` auto only → feed 9:16 frames | 4–30 (or auto) | 480/720/1080 | ~100 words [B] |
| Seedance 2.5 ref (fal) | via refs | no | up to **30** images, 10 audio, 10 video; 50 files total | `generate_audio` | `9:16` | 4–30 | 480/720/1080 | ~100 words |
| Seedance 2.0 fast/mini (fal) | yes | yes | no | yes | `9:16` | 4–15 | 480/720 | ~100 words |
| Veo 3.1 first-last (fal) | `first_frame_url` | `last_frame_url` (both required) | no | `generate_audio` | `9:16` | 4s/6s/8s | 720/1080/4k (lite no 4k) | 120 words, quotes uncounted [B]; fal field max 20,000 chars |
| Veo 3.1 reference (fal / Google) | no | no | `image_urls` (fal count **[UNVERIFIED]**); Google max 3 | yes | must send `9:16` (default 16:9) | **8 s required** | 720/1080/4k | 120 words |
| Wan 3.0 i2v (fal) | `start_image_url` | `end_image_url` | no | `audio` (default true) | `9:16` | int, def 5; max **[UNVERIFIED]** | 480/720/1080 (def 1080) | cap **[UNVERIFIED]**; `enable_prompt_expansion` default true |
| LTX-2.5 (own, RunPod) | `--image f 0 1.0` | `--image f <last idx> s` (code supports `at`=1) | up to 3 frames | picture+sound together (generate.sh) | WIDTH x HEIGHT 704x1280 | FRAMES 8k+1 @24fps: 121=5 s, 241=10 s | multiples of 64 | house cap 120 (flag off) |
| Hunyuan 1.5 (own) | `--image_path` | no | first only | none | `--aspect_ratio 9:16` | `--video_length` 121 | 720p | house cap 120 |
| Wan 2.2 I2V-A14B (own) | `--image` required | no | no | none | `--size 704*1280` | `--frame_num` ≤81 | 704x1280 | house cap 120 |

---
## 2. Kling (official MCP) [K — verified 2026-10-02, mcpVersion 1.3.3]
**Call:** MCP tools `mcp__kling__image_to_video`, `text_to_video`, `omni_ref_video`, `image_to_image`, `element_*`, `file_upload`, `query_tasks`, `query_membership_and_credits`, `who_am_i`.
Shape (tool schema read): `{model, arguments:[{name,value}...] (all string values), inputs:[{name,inputType:"URL",url}], rationale, taskTraceId}`.
**Always `who_am_i` first** for each model's exact argument/input names. Returns generation_id; poll `query_tasks`. **Result URLs expire in 24 h: download at once.** Account had **0 credits** on 2026-10-02: check `query_membership_and_credits`. Per-call credit cost in MCP: **[UNVERIFIED]** (use fal Kling price as the proxy: $0.168/s Pro with audio).
Local files: `file_upload` (ticket) then POST multipart (`ticket`, `file`) to `upload_url`; PNG/JPG only, <4K, ≤30 MB, ratio no wider than 1:2.

**Which model:**
| need | model |
|---|---|
| one image in, best value, no tail/elements | `kling-video-v3_0_turbo` |
| first AND last frame, native audio, elements (max 3) | `kling-video-v3_0` (default) |
| many refs (image_1..7), voice-driven characters, 9:16 arg | `kling-video-v3_0_omni` |
| reference video (3–10 s) | `omni_ref_video` (v3_0_omni/o1; with video_1, `enable_audio` must be false) |
| cheap legacy, `audio_prompt`/`music_prompt`/`enable_asmr` | `kling-video-v2_5` |

**Reference tokens:** attached input images are named `图片1`, `图片2` … in the prompt (that exact token). Elements: write `<<<id>>>` and pass `elements` JSON `[{id,bindName}]`; never put `elements`/`<<<id>>>` in text_to_video. v3_0 image_to_video has no aspect arg: **feed 9:16 frames**; text_to_video: `aspect_ratio` 9:16.
**Notation:** master prompt (2 sentences) + labelled `Shot n (x s):` lines; speaker tags `[Creator, warm amused voice]: "line"`; action before dialogue; linking words "Immediately", "Then", "Pause"; up to 6 shots, 3–15 s [B 5.3]. Image-to-video: describe what evolves FROM the image, not what is already in it. Name the subject the same way in every shot, no pronouns/synonyms. Do not mix pan+orbit+zoom in a shot.
**UGC strengths:** native multi-shot, tail frame, voice/audio, elements keep a person/product. **Weak:** text/logos on product unreliable; contradictory appearance words drift; generic voice cues ("normal voice") useless.
**Price:** fal Kling 3 Pro $0.112/s audio off, $0.168 on, $0.196 voice control; Standard $0.084/$0.126/$0.154; Turbo $0.112/s no audio switch [F]. MCP credits **[UNVERIFIED]**.
**Template:**
```
MASTER: {person 1 sentence}. {setting + light}. {product lock: 图片1 = the exact product, size, signature detail}. Unpolished phone-video look, handheld, ambient sound.
Shot 1 ({s} s): {framing + ONE camera move}. {subject} {action}. SFX: {sound}.
Shot 2 ({s} s): {framing + camera}. {action}. [{speaker}, {tone}]: "{line}"
Shot 3 ({s} s): {framing + camera}. {action}. SFX: {low hit at peak}.
{hands rule} {clean-frame sentence}
```

## 3. Seedance 2.5 / 2.0 (fal) [F 1a–1d, B 5.2]
**Call:** `POST https://queue.fal.run/<endpoint>`, header `Authorization: Key $FAL_KEY`, JSON body; poll the returned `status_url`, GET `response_url`; result `video.url` (public CDN). Never build status/result URLs yourself. Concurrency starts at 2. Local files: `POST rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3` then PUT, use `file_url` [F 6, tools/xugc/fal.js does it].
| endpoint | body (exact) | price |
|---|---|---|
| `bytedance/seedance-2.5/image-to-video` | `image_url`, `end_image_url`, `prompt`, `resolution` 480p/720p/1080p, `duration` "4".."30" or "auto", `aspect_ratio` "auto", `generate_audio`, `draft`, `codec`, `bitrate_mode` | $0.2205/s 480p, $0.473/s 720p, $1.164/s 1080p |
| `bytedance/seedance-2.5/reference-to-video` | `image_urls`, `audio_urls`, `video_urls`, `prompt`, `resolution`, `aspect_ratio` (incl 9:16), `duration`, `task` reference/editing/extension, `generate_audio`, `seed`, `draft` | same; x0.6 with video inputs |
| `bytedance/seedance-2.0/fast/image-to-video` | `image_url`, `end_image_url`, `prompt`, `resolution` 480/720, `duration` 4–15, `aspect_ratio`, `generate_audio` | $0.2419/s 720p; 480p **[UNVERIFIED]** |
| `bytedance/seedance-2.0/mini/image-to-video` | same minus bitrate | $0.0721/s 480p, $0.1547/s 720p |
`draft:true` = 480p draft returning `draft_id`, finishable at 1080p within 7 days (schema): a built-in scout.
**Refs in prompt:** `@Image1`, `@Image2`, `@Audio1`, `@Video1` (ref-to-video; fal schema). Give every @ref a job sentence ("@Image2 = the product, exact shape/colour, do not alter"); say which image is in which stage. i2v: the input image is the frame; no @ needed.
**Notation:** five slots, 60–100 words: Subject, Action, Scene, Camera (ONE move), Style/Audio. 2.5 audio tags `{dialogue}`, `<sfx>`, `( music )`, write "no music"; 2.0 notation on a given route **[UNVERIFIED]**. >8 s: staged ranges `0-4s: … Cut to. 4-9s: …`. Verbs not adjectives; ≤~8 requirements; one language [B].
**Strengths:** refs up to 30, 4–30 s, audio, first+last. **Weak:** priciest; people-face rejection on BytePlus direct [O, S] — test on a fal route before relying on real faces; reference strength 70–80% (API exposure **[UNVERIFIED]**); two camera moves smear.
**Template:**
```
@Image1 = {the frame / creator}. @Image2 = {product, exact, do not alter}.
{Subject + 1-2 attributes} {verb chain with consequence}. {Scene: place + light}.
Camera: {ONE move}. Style: unpolished phone video, natural light. Audio: {{line}} <{sfx}> <{sfx}> no music.
```

## 4. Veo 3.1 [F 3, O 1, B 5.1, google.js]
**fal:** `fal-ai/veo3.1/lite/first-last-frame-to-video` (also `/fast/`, standard): `prompt`, `first_frame_url`, `last_frame_url` (both required; for a single frame pass the same URL, as fal.js does), `duration` "4s|6s|8s", `aspect_ratio` "9:16", `resolution` "720p", `generate_audio`, `negative_prompt`, `seed`, `safety_tolerance`, `auto_fix`. Reference: `fal-ai/veo3.1[/fast]/reference-to-video` (`image_urls`, `aspect_ratio` must be set 9:16, `duration` default "8s"; no lite).
**Google direct** (used by tools/xugc/google.js): `POST https://generativelanguage.googleapis.com/v1beta/models/{veo-3.1-lite-generate-preview|veo-3.1-fast-generate-preview|veo-3.1-generate-preview}:predictLongRunning`, header `x-goog-api-key`; body `{instances:[{prompt, image, lastFrame, referenceImages:[{image,referenceType:"asset"}]}], parameters:{aspectRatio:"9:16", resolution:"720p", durationSeconds:"8", personGeneration:"allow_adult"}}`; poll `GET /v1beta/{op.name}` until `done`; video at `.response.generateVideoResponse.generatedSamples[0].video.uri` (download with key header; kept 2 days); refusals show `raiMediaFilteredReasons`. Max 3 refs; 8 s required for refs/1080p/4k. SynthID on every output.
**Price:** fal: lite 720p $0.03 no audio / $0.05 audio, 1080p $0.05/$0.08; fast $0.10/$0.15; standard $0.20/$0.40 (4k $0.40/$0.60). Google: lite $0.05, fast $0.10 (720p) / $0.12 (1080p), standard $0.40 per s with audio [O].
**Refs in prompt:** by role: "the woman from the first reference image", "the product from the second reference image".
**Notation:** `[Cinematography] + [Subject] + [Action] + [Context] + [Style]`, then audio. ≤120 words, dialogue in quotes after "says" NOT counted, 1 line (≤18 words per 8 s), 2 beats max; timestamp variant `[00:00-00:02] … [00:02-00:05] … [00:05-00:08] …`. Positive phrasing, no negative lists, never write "subtitles/caption". Sound: "Ambient noise: …. SFX: …."
**Strengths:** cheapest at lite, best native sound, explicit 9:16, first+last frame. **Weak:** only 4/6/8 s; legible price/URL text garbles; >3 refs impossible; crowd faces drift.
**Template:**
```
{Capture mode, e.g. "Handheld phone video, one continuous take"}. {Subject (role of ref image)} {action chain, physical verbs}. {Context: place + light, one sentence}. {Style: unpolished iPhone look, natural light, true-to-life colour}.
[00:00-00:03] {beat}. [00:03-00:05] {beat; peak at ~4.94 s}. [00:05-00:08] {settle}.
{Voice} says in a {tone} voice, "{line}". Ambient noise: {bed}. SFX: {1–2}. {hands rule}
```

## 5. Wan 3.0 (fal) [F 4a]
`alibaba/wan-3.0/image-to-video`: `start_image_url` (req), `end_image_url`, `prompt` ("motion to generate"), `resolution` 480p/720p/1080p (def 1080p: send 720p or 480p), `aspect_ratio` "9:16", `duration` int (def 5, null = smart; max **[UNVERIFIED]**), `audio` (def true), `enable_prompt_expansion` (def true), `enable_thinking`, `enable_safety_checker`, `seed`. Output `video.url`, `duration`, `actual_prompt`.
**Price:** $0.05/s 480p, $0.10/s 720p, $0.20/s 1080p ("subject to change"). Also `fal-ai/wan/v2.7/image-to-video`: `image_url`, `end_image_url`, `audio_url`, `video_url`, 2–15 s, no aspect field, $0.10/s 720p.
**Prompt:** describe MOTION only (the image is the look). Word cap and notation **[UNVERIFIED]** (bible does not cover Wan; house cap 120 behind a flag). Keep Seedance-style five slots, no speech quotes unless audio verified. **Strength:** cheapest scout, first+last, 9:16. **Weak:** unproven on our UGC; prompt expansion rewrites your words (read `actual_prompt`).
**Template:** `{Subject} {verb chain}. {what the crowd/background does}. Camera: {ONE move}. Phone-video look, handheld. Sound: {bed, sfx}.`

## 6. Our own engines on RunPod [tools/xugc/engine.js, train/*.sh]
All **NOT proven** per script headers ("written from the README; the first paid run proves it"). One GPU job at a time, per-job/day caps, estimate assumes $4/h worst case, render minutes are guesses.
| engine key | script | flags (read from script) |
|---|---|---|
| `ltx` (distilled, default) | `generate.sh` | `python -m ltx_pipelines.distilled --num-frames --seed --height --width --image <file> <frame> <strength> --lora <file> 1.0 --prompt`; `--quantization fp8-cast` retry |
| `ltx_full` | `gen_ltx_full.sh` | `ti2vid_two_stages`, `--guidance-scale 7.5`, `--distilled-lora` |
| `hunyuan` | `gen_hunyuan.sh` | `torchrun generate.py --prompt --image_path --resolution 720p --aspect_ratio 9:16 --video_length --seed` |
| `wan` (2.2) | `gen_wan.sh` | `generate.py --task i2v-A14B --size '704*1280' --image --frame_num (<=81) --base_seed` (needs a start picture, no sound) |
Env contract: `PROMPT, FRAMES, WIDTH, HEIGHT, SEED, REFS="file:frame:strength,..."`, `HF_TOKEN` (LTX), `LORA=1`. Frame index sits on the 8-frame grid; first ref frame 0 strength 1.0, others default 0.7. Last-frame conditioning = a ref with `at:1` (engine.js); that it holds identity **[UNVERIFIED]**.
**LTX + LoRA:** engine prepends the trigger word: prompt starts `xugciphone. ` and `LORA=1`. LTX makes picture and sound together (generate.sh comment) but filter.js marks `sound:false`: treat audio as **[UNVERIFIED]** until `info.txt` shows an audio stream. LTX/Wan/Hunyuan prompt caps and notation: **[UNVERIFIED]** (filter house caps 120 words, flag off). Write plain present-tense prose, trigger word first, no speech quotes needed for Wan/Hunyuan (silent).
**Cost:** GPU time only (H100 ~$3.49–4.00/h); no per-second price. Use when a LoRA look matters, not for scouting.
**Template (LTX):** `xugciphone. Unpolished iPhone video, handheld, {setting + light}. {subject + product lock}. {beat at 0 s}, then {beat}, then {peak}. Sound: {bed}, {sfx}. {hands rule} {clean-frame sentence}`

## 7. Higgsfield [H — names read from its connector; everything else W/I]
Reseller/aggregator (Kling, Seedance, Veo, Wan) on one credit wallet; no public REST API, MCP + CLI only [H, W]. Marketing Studio is reported to run Seedance 2.0 [W]. Workflow/preset recipes (names/descriptions read, **internals NOT read**): `ugc-review-video`, `ugc-product-video`, `ugc-unboxing-video`, `ugc-try-on-video`, `ugc-tutorial-video`, `ugc-website-video`, Marketing Studio (URL or product photo -> UGC ad). Our local equivalents: tools/xugc/presets.js `review, product-only, unboxing, try-on, tutorial, breaking-news-start, demo-in-motion, before-after`.
Use via MCP: `get_preset_instructions` first, then follow it; browsing never authorizes `execute_preset`. Credit price per preset, parameters, prompt caps: **[UNVERIFIED]** (not in repo). Rule: price the route, not the platform [H]; use only if Alex wants its presets, not for cost. Prompt adapter: give it the shot spec as plain English, product photo as reference; expect it to rewrite.

## 8. Image engines (hidden golden-ratio frames)
| engine | call | notes | price |
|---|---|---|---|
| Nano Banana 2 (fal) | `fal-ai/nano-banana-2/edit`: `prompt`, `image_urls[]`, `aspect_ratio` "9:16", `resolution` 1K, `num_images`, `output_format`, `seed`; no refs: `fal-ai/nano-banana-2` | 9:16 enum value verified only in fal.js use, schema lists no enum (**[UNVERIFIED]** until a run); out `images[0].url` | $0.08/img 1K (2K x1.5, 4K x2) |
| Nano Banana 2 (Google) | `POST /v1beta/interactions` model `gemini-3.1-flash-image`, `response_format:{type:"image",aspect_ratio:"9:16"}` | up to 14 images | $0.067/img 1K; Lite $0.0336; Pro `gemini-3-pro-image` $0.134 [R D22] |
| Kling `image_to_image` | `gemini-3.1-flash-image` (up to 10 refs, 9:16, 0.5k–4k), also gpt-image2, gemini-3-pro-image, kling-image-v3_0_omni/o1 [K] | uses Kling credits | credits **[UNVERIFIED]** |
| Magic Wand | queue job in the Mac app, driven through ChatGPT (Alex has no Gemini quota) [magic-wand.md] | one product per job, one reference, read every picture, check true square for listing panels, never overwrite an R2 key | no per-image price (his usage) |
Frame prompt = scene + "This single frame is: <moment>." + clean-frame sentence (NO text/captions/letters/logos/borders). Raw carousels/infographics go ONLY to the image model, never to the video model (it copies the text). Same product ref in every frame.

## 9. Decision table: which engine for which job
| job / budget | engine | $ (verified) | why |
|---|---|---|---|
| Scout motion + prompt, cheapest | Veo 3.1 lite 720p audio off (fal) | $0.03/s ($0.24 per 8 s) | 9:16 enum, first+last, 4/6/8 s |
| Scout, longer / no-Google | Wan 3.0 480p | $0.05/s | first+last, 9:16, up to 15 s (max unverified) |
| Scout with sound | Veo lite audio on | $0.05/s ($0.40 per 8 s) | native audio |
| Scout Seedance look | Seedance 2.0 mini 480p | $0.0721/s | first+last, 4–15 s |
| Final, speech + first/last + multi-shot | Kling 3.0 Pro audio on | $0.168/s ($1.34 per 8 s) | tail frame, native voice, 3–15 s |
| Final, safest sound/9:16 | Veo 3.1 fast 720p audio | $0.15/s ($1.20 per 8 s) | explicit 9:16 |
| Final, many refs / >15 s | Seedance 2.5 720p | $0.473/s (480p $0.2205) | 30 refs, 4–30 s |
| Hidden frames | Nano Banana 2 | $0.08/frame ($0.48 per 6) | multi-ref |
| Custom LoRA look | LTX + `xugciphone.` on RunPod | GPU hours | only after a run proves it |
**Rule: scout cheap, final on the winner.** Scout every shot on Veo lite or Wan 480p, judge frames, then re-render only the winner on the final engine. Worst case = 3 scouts + 2 finals per shot [R]. Concurrency 2 on fal: queue, never fire ten.

## 10. Universal pipeline
1. **Hidden frames:** one image-model pass per clip, 9:16, text-free, same product ref. Times of an 8 s clip: **0, 1.17, 3.06, 4.94, 6.11, 8.00 s** (0.382/0.618 of L, then 0.382 inside the outer spans; code `goldenTimes()`; scale fractions for other lengths). Set-up 0–3.06, build to peak 4.94, settle 6.11–8. Pacing rule, not proven realism gain: A/B vs even spacing [R D22].
2. **Per clip:** frame 0 = first frame, frame 8.00 = last frame. Engines without a last frame (Kling turbo, Hunyuan, Wan 2.2): first frame only. Middle frames: Veo/Kling refs, or just described in the prompt and used by the judge.
3. **Chain:** last frame of clip N (take it from the generated video, or the hidden 8.00 frame) = first frame of clip N+1. Strongest consistency for continuous action [B 4.7]. Same wardrobe/location nouns every clip.
4. **Join:** normalise each clip `ffmpeg -i in.mp4 -vf "scale=1080:1920:flags=lanczos,fps=30,format=yuv420p,setsar=1" -c:v libx264 -crf 16 -preset slow -ar 48000 -ac 2 -c:a aac -b:a 192k norm_N.mp4`; hard cuts via concat demuxer `-f concat -safe 0 -i list.txt -c copy`; `loudnorm=I=-16:TP=-1.5:LRA=11`, 40–80 ms audio fades at cuts; final H.264 1080x1920 `-movflags +faststart`, -14 LUFS [O 8]. Captions are burned on in post, never generated.
5. Download every result immediately (Kling 24 h, Veo 2 days).

## 11. Translation table: one shot spec, four prompts
**Shot spec (Black Reaper news-crowd, 8 s, 9:16, dusk):** product = 8 ft 6 in prop figure on a stake in a front lawn: skull face, black hood, tattered robe, lit blue lantern with glowing ghost-souls. Filmer = adult neighbour, phone, behind a small crowd of adult neighbours filming at the lawn edge. Beats: 0 s crowd gathers and lifts phones; 3.06 s figure's lantern flares, crowd steps back; 4.94 s peak, gasps and one low hit; 6.11–8 s settle, phones still up. Camera: handheld, one slow push-in. Speech: filmer murmurs "Did you see that thing light up?". Sound: wind, murmurs, one deep low hit at 4.94.
**FLAG (house rule, B 6 "Content rules (hard)"):** the bible bans "hooded robe designs / cloaked figures with hoods" for Halloween. The product is a black-hooded robed reaper. Alex must OK this (a skull-faced black reaper is not the banned white pointed hood), or describe the figure by looks only ("skull face under a black hood") and never use the word "robed figure"; `filter.js` does not block it, but Veo/Seedance safety filters might: judge on the first scout.

**Kling** (v3_0, `图片1` = frame 0, `tail_image` = frame 8.00; `enable_audio` true):
```
MASTER: Adult neighbour filming on a phone from the sidewalk at dusk, front lawns and porch lights behind. 图片1 = the exact prop figure on a stake in the lawn, 8 ft 6 in tall, taller than the porch roof line, skull face, black hood, tattered robe, lit blue lantern with small glowing ghost-souls. Unpolished phone-video look, handheld, ambient sound.
Shot 1 (3 s): Medium-wide, handheld. Six adult neighbours drift to the lawn edge and raise phones toward the figure. SFX: wind, low murmurs.
Shot 2 (2 s): Slow push-in. The blue lantern flares; the crowd steps back together. [Filmer, low amazed whisper]: "Did you see that thing light up?"
Shot 3 (3 s): Same framing. Gasps; phones stay up; the figure stays still. SFX: one deep low hit, then wind.
Natural hands, five fingers visible, holding the phone by its edges. Faces small and turned. No text, captions or logos in the picture.
```
**Seedance 2.5** (i2v: `image_url`=frame 0, `end_image_url`=frame 8.00, duration "8", resolution 480p scout / 720p final; ~85 words):
```
Adult neighbour filming on a phone from the sidewalk at dusk, six adult neighbours at the lawn edge raise phones toward an 8 ft 6 in prop figure on a stake, skull face, black hood, tattered robe, lit blue lantern with glowing ghost-souls, exactly as in the first frame. 0-3s: they gather and lift phones. 3-5s: the lantern flares, the crowd steps back, filmer: {Did you see that thing light up?} 5-8s: still, phones up.
Camera: handheld, one slow push-in. Style: unpolished phone video, dusk light. Audio: <wind> <murmurs> <one deep low hit at 5s> no music. Natural hands, five fingers visible. No text or logos in the picture.
```
**Veo 3.1** (lite scout via fal first-last; `aspect_ratio` "9:16", `duration` "8s"; ~95 words excluding quotes):
```
Handheld phone video, one continuous take, slow push-in. An adult neighbour films from the sidewalk at dusk while six adult neighbours at the lawn edge hold up phones toward an 8 ft 6 in prop figure on a stake in a front lawn: skull face, black hood, tattered robe, lit blue lantern with small glowing ghost-souls. Unpolished iPhone look, porch-light dusk, true-to-life colour.
[00:00-00:03] The crowd gathers and raises phones. [00:03-00:05] The lantern flares and the crowd steps back together. [00:05-00:08] Everyone holds still, phones up.
The filmer says in a low amazed whisper, "Did you see that thing light up?" Ambient noise: wind, murmurs. SFX: one deep low hit at five seconds. Natural hands, five fingers visible, holding the phone by its edges.
```
**LTX-2.5 + LoRA** (RunPod `ltx`; FRAMES 193 = 8 s at 24 fps, 704x1280; REFS `frame0.png:0:1.0,frame8.png:192:0.8`; `LORA=1`; cap 120 words is a house choice):
```
xugciphone. Unpolished iPhone video, handheld, dusk, front lawns and porch lights. An adult neighbour films from the sidewalk; six adult neighbours at the lawn edge raise phones toward an 8 ft 6 in prop figure on a stake: skull face, black hood, tattered robe, lit blue lantern with small glowing ghost-souls. The crowd gathers, then the lantern flares and they step back together, then everyone holds still. One slow push-in. Sound: wind, murmurs, one deep low hit. Natural hands, five fingers visible.
```
Notes: Kling and Seedance quote speech differently (`[Speaker, tone]: "…"` vs `{…}`); Veo only counts words outside quotes; the LTX line has no speech quote (audio unverified). 193 frames = 8·24+1, on the 8k+1 rule in generate.sh; REFS frame 192 sits on the 8-frame grid (engine.js rounds to /8). Neither the 8 ft 6 in claim nor the lantern should be dropped to fit a cap: drop SFX words and adjectives first, never timed actions.
