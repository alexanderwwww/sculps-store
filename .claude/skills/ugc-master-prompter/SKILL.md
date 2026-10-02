---
name: ugc-master-prompter
description: The master prompter for UGC and product video/image prompts. Builds one excellent, model-proof prompt (and the hidden golden-ratio frames) for ANY engine — Kling, Seedance, Veo, Wan, LTX, Higgsfield, Dreamina, Magic Wand/Gemini — from a product page and a one-line idea. Use for EVERY prompt that will generate video, UGC, ads, hooks, breaking-news style clips, product demos, frames or reference images, in the XUGC app or by hand, and whenever a generated clip looks fake, wrong, 2023-AI, copied text from a photo, or the wrong product. Trigger it even when Alex only says "make the prompt", "mega prompt", "render it", "the video", "the ad", "UGC", "Kling", "Seedance" or "queue the frames". It is the law for how prompts are written from now on.
---

# ugc-master-prompter

Alex's standing order (2026-10-02): **everything from here on is an excellent prompt.** This skill is every lesson from building XUGC — the Style Bible, the director's bible, the preset recipes and the filter, the specialist team reports, the judge, and every failed render — folded into one procedure. Use it to the fullest, every time, for every engine. Never write a video prompt from memory without it.

## The seven steps (do them in order, say each result in one line)

1. **Intake** (`references/intake-and-marketing.md`). Product, its CLASS and REAL SIZE, price, store, persona, setting, hook, engine, budget. Read the real product page and LOOK at 2–3 real photos first (Reaper lesson: the product was assumed wrong for a whole day). Alex hates questions: use the stated defaults and say them in one line.
2. **Shot spec.** One continuous 8 s shot per clip (a 16 s ad = 2 clips joined). Fill the schema in `references/intake-and-marketing.md`: beats on the golden times, speech, sfx, camera, sound layers, frames.
3. **Hidden golden-ratio frames.** For an 8 s clip: **0.00, 1.17, 3.06, 4.94, 6.11, 8.00 s** (set-up 0–3.06, build to the peak at 4.94, settle 6.11–8). Made by an image model (Nano Banana 2 via fal `fal-ai/nano-banana-2[/edit]`, Kling image_to_image, or Magic Wand→Gemini), 9:16, text-free. Only these clean frames ever reach the video model — **never a raw product photo** (the model pastes carousel text and graphics into the ad).
4. **The master prompt** (anatomy below), adapted per engine from `references/engines.md` (word caps, reference tokens, field names).
5. **Filter it.** `cd tools/xugc && node -e "const F=require('./filter.js');const c=F.check(require('fs').readFileSync('/tmp/p.txt','utf8'),'veo');console.log(c.ok,c.problems,c.prompt)"` (engines: veo, seedance, kling, ltx, wan, hunyuan). It repairs and blocks; never ship a prompt it blocks.
6. **Render** the cheapest honest way (scout cheap, final on the winner) — only after money is approved. Read prices in `references/engines.md`.
7. **Judge frame by frame** (`references/judge.md`) before saying a word about quality. Fix the prompt or the frame, not the story.

## Master prompt anatomy (blocks, in this order; block 8 is the micro-trust pass)

1. **CAPTURE + LOOK** — "Unpolished iPhone video, vertical 9:16, one continuous handheld shot, natural light only (name the real light sources), ordinary phone colour, slight sensor noise, real skin, auto-exposure shifts." (`references/realism.md`)
2. **PERSON** — ONE sentence on the filmer/persona (age, clothes, vibe). More words = more face drift. Faces small or turned in crowds; no close-up faces of minors.
3. **SETTING** — real, specific, lived-in, and it stays put (houses, trees, street do not change).
4. **PRODUCT LOCK** — what it is, its REAL SIZE vs people, materials, colours, the signature detail ("lantern lit cold blue with small glowing ghost-souls"), what it is NOT ("fabric prop on a stake, not an inflatable, not a person in costume, no legs or shoes"). The attached frame is the product: never redesign.
5. **TIMED BEATS** on the golden times — one action and one camera idea per beat, verbs not adjectives, every emotion with a visible trigger, speech in quotes (short, imperfect, no ad language).
6. **SOUND** — never silent: ambient bed, close sounds, the product's own sound, overlapping voices at different distances, ONE deep low hit at the peak. Voices as quoted speech.
7. **HANDS/FACES RULE** — "Natural hands, five fingers visible, holding the product by its <part>." No fine finger choreography; no second beat of finger action in one shot.
8. **MICRO-TRUST PASS** (skill `micro-trust`) — at least 8 concrete timed cues across camera, words, tone, sound and world; the viewer-brain order hook → impress → micro-trust → security → desire; crisp product inside a real phone shot. Score it with `micro-trust/references/library.md` §7.
9. **HARD BANS** — no text/captions/logos/graphics drawn in the picture (captions are burned on afterwards by ffmpeg), no TV/anchor/broadcast overlay, no cuts or slow motion or zoom effects, no extra fingers or warped faces, no morphing product or street, same people throughout.

Word caps (Veo ~120 excluding quoted speech, Seedance ~100, Kling long-form, LTX trigger word `xugciphone.`): see `references/engines.md`. When over the cap, drop SFX words and adjectives first; **never drop timed actions**.

## Always, no exceptions
- **Never guess** an endpoint, flag, field, size or price (AGENTS.md rule 15): read the file, run `who_am_i`, fetch the schema.
- **Look at the product before writing** (real photos, real size). Check the class: handheld / wearable / yard prop / inflatable → `references/presets.md`. `inflatable-physics.md` applies ONLY to inflatables.
- **Frames first, video second.** One clean reference photo per product job; never an old picture as a reference.
- **Every paid call needs Alex's OK and a stated price**; show the price before spending. Failed calls still count.
- **Inspect before claiming** (rule 7). Quote what you saw in the frames.
- **Hooded figures (precise rule).** The bible bans imagery that resembles hate groups. A **skull-faced Grim Reaper** (black hood, visible skull, lantern, ghost-souls) is a normal Halloween decoration and is allowed — it is the Black Reaper product. Always keep the skull face, lantern and ghost-souls visible in the frame and the prompt; NEVER a white or pointed hood, a faceless hood, several hooded figures together, crosses, fire or flags. If an engine refuses it, change the framing (closer on skull and lantern), do not argue. (Alex confirmed the product is the Reaper; first cheap scout decides.)
- Customer-facing copy: confident, never apologetic, no fake testimonials of real people, no medical or false-claim hooks.
- Keep Alex's working style: lead with the answer, one step at a time, no hedging, no questions he already answered, no terminal instructions.

## Where things are
`references/engines.md` — adapter sheet (Kling, Seedance, Veo, Wan, LTX/Hunyuan, Higgsfield, frame makers, prices, templates).
`references/realism.md` — the look/behaviour/sound rulebook and per-product-class switch.
`references/presets.md` — recipe library by product class + what the app's presets still get wrong.
`references/intake-and-marketing.md` — intake defaults, hooks, persona, shot-spec schema with worked examples.
`references/judge.md` — frame-by-frame inspection protocol and hard-fail codes.
`references/lessons.md` — every mistake already paid for.
Sibling skill **`micro-trust`** (`.claude/skills/micro-trust/`) — the camera/words/tone/sound/world details that make a clip read as real, and the viewer-brain formula. Use it in every prompt.
Code: `tools/xugc/presets.js`, `filter.js`, `google.js`, `fal.js`, `ad.js`. Research: `design/xugc/real-life/*.md` (00 recipe, 05 director's bible, 07 Higgsfield, 08 fal API, 09 Kling MCP).

## Worked example in one screen — Black Reaper, "neighbours film it at dusk"
Product (verified from blackreaper.us): 8 ft 6 in prop, black hood and tattered robe with pale strips, skull face, raised skeletal hand, real metal lantern lit cold blue with small glowing ghost-souls spiralling up, batteries, on a stake. Class: yard prop. Frames (Magic Wand job "Reaper news-crowd golden frames v1", reference `https://blackreaper.us/media/br-09.webp`): six 9:16 stills at the golden times, crowd of 7–10 distinct neighbours, ≥3 filming, backs/sides, blue light spilling on grass. Video: first frame = frame 1, last frame = frame 6 (Kling `kling-video-v3_0` image_to_video with `tail_image`, or `kling-video-v3_0_omni` with the six frames as 图片1–图片6 and `aspect_ratio` 9:16). "BREAKING NEWS" burned on afterwards.
